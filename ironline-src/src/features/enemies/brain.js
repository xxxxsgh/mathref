/**
 * IA do soldado inimigo.
 *
 * Percepção: cone de visão (150°, 360° em combate), alcance, linha de visão
 * real (olho → cabeça/peito do jogador), consciência acumulada (distância,
 * movimento do jogador) e audição (tiros do jogador alertam o esquadrão com
 * atraso de som + reação).
 *
 * Combate (máquina de estados):
 *   move   → corre até um ponto de cobertura (A* na grade de navegação)
 *   hide   → agachado/atrás da cobertura; recarrega; supressão prolonga
 *   peek   → levanta (cobertura baixa) ou inclina (alta) e atira em rajadas
 *   open   → sem cobertura útil: atira de pé/agachado, faz strafe
 *   search → perdeu o jogador: avança cauteloso até a última posição vista
 * Papéis do esquadrão: um flanqueador por vez busca cobertura em ângulo
 * aberto em relação ao olhar do jogador; avanço quando o jogador recarrega.
 * Mira: erro angular que cai com o tempo na mira e sobe com distância,
 * supressão, movimento próprio e do jogador. Tiros são raios reais.
 * Callouts: bus 'enemy:callout' { enemy, kind, text, position }.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

export const CALLOUTS = {
  contact: ['Contato! À frente!', 'Inimigo avistado!', 'Contato, doze horas!'],
  moving: ['Movendo!', 'Me cobre, estou indo!', 'Mudando de posição!'],
  reloading: ['Recarregando!', 'Trocando carregador!'],
  flanking: ['Flanqueando pela esquerda!', 'Vou pelo flanco!', 'Contornando!'],
  suppressed: ['Fogo pesado!', 'Tô preso aqui!', 'Suprimido!'],
  hit: ['Fui atingido!', 'Tô ferido!'],
  mandown: ['Homem abatido!', 'Perdemos um!'],
  lost: ['Perdi ele de vista!', 'Cadê ele?'],
  push: ['Ele tá recarregando, avança!', 'Agora, pra cima!'],
  heard: ['Tiros! Atenção!', 'Ouviu isso?'],
};

export class Squad {
  constructor(ctx) {
    this.ctx = ctx;
    this.lastKnown = new THREE.Vector3();
    this.lastSeen = -1e9;
    this.alert = false;
    this.flanker = null;
    this.lastCallout = -1e9;
    this.kindTime = {};
    this.claims = new Map(); // célula de cobertura → inimigo
  }

  callout(enemy, kind, now, force = false) {
    if (!force && now - this.lastCallout < 1.4) return;
    if (!force && now - (this.kindTime[kind] ?? -1e9) < 5) return;
    this.lastCallout = now;
    this.kindTime[kind] = now;
    const lines = CALLOUTS[kind] || [kind];
    const text = lines[Math.floor(this.ctx.rng.next() * lines.length)];
    const position = enemy.group.position.clone().setY(enemy.group.position.y + 1.6);
    this.ctx.bus.emit('enemy:callout', { enemy, kind, text, position });
  }
}

/** ângulo para o intervalo [-π, π] */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Brain {
  constructor(enemy, ctx, squad, nav) {
    this.e = enemy;
    this.ctx = ctx;
    this.squad = squad;
    this.nav = nav;
    const r = ctx.rng;
    this.state = 'idle';
    this.awareness = 0;
    this.reaction = 0.28 + r.next() * 0.35; // s
    this.skill = 0.75 + r.next() * 0.5;
    this.thinkT = r.next() * 0.2;
    this.seeT = r.next() * 0.15;
    this.canSee = false;
    this.seenFor = 0;
    this.lostFor = 0;
    this.stateT = 0;
    this.path = null;
    this.pathI = 0;
    this.cover = null;
    this.burst = 0;
    this.shotT = 0;
    this.burstPause = 0.6;
    this.onTarget = 0;
    this.suppression = 0;
    this.flinch = 0;
    this.ammo = 30;
    this.reloadT = -1;
    this.idleLook = r.next() * 6;
    this.strafeT = 0;
    this.strafeDir = r.next() < 0.5 ? -1 : 1;
    this.peekCrouch = false;
    this.desiredCrouch = 0;
    this.desiredAim = 0.15;
    this.leanTarget = 0;
    this.speedTarget = 0;
    this.moveTarget = null;
    this.heardT = -1;
    this.heardPos = new THREE.Vector3();
  }

  get now() {
    return this.ctx.time.now;
  }

  // ─── percepção ──────────────────────────────────────────────────────────
  eye(out = new THREE.Vector3()) {
    const g = this.e.group.position;
    return out.set(g.x, g.y + 1.6 - this.e.anim.p.crouch * 0.55, g.z);
  }

  targetPoint(out = new THREE.Vector3()) {
    const pl = this.ctx.player;
    return out.copy(pl.position).setY(pl.position.y + (pl.eyeHeight ?? 1.62) - 0.38);
  }

  perceive(dt) {
    const { ctx } = this;
    const pl = ctx.player;
    this.seeT -= dt;
    if (this.seeT > 0) return;
    this.seeT = 0.12;
    const dt2 = 0.12;
    if (!pl.alive) {
      this.canSee = false;
      return;
    }
    const eye = this.eye(_o);
    const head = _w.copy(pl.position).setY(pl.position.y + (pl.eyeHeight ?? 1.62));
    _d.subVectors(head, eye);
    const dist = _d.length();
    let visible = false;
    if (dist < 85) {
      const fwd = this.e.facing();
      const cos = (_d.x * fwd.x + _d.z * fwd.z) / Math.max(1e-4, Math.hypot(_d.x, _d.z));
      const inFov = this.state !== 'idle' ? true : cos > Math.cos((75 * Math.PI) / 180);
      if (inFov) {
        const filt = { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy };
        visible = ctx.collision.lineOfSight(eye, head, filt) || ctx.collision.lineOfSight(eye, this.targetPoint(_v), filt);
      }
    }
    if (visible) {
      // consciência: mais rápida perto, com jogador se movendo ou atirando
      const moving = pl.state?.speed > 0.5 ? 1.6 : 1;
      const rate = this.state === 'idle' ? (2.4 / (1 + dist * 0.06)) * moving : 6;
      this.awareness = Math.min(1, this.awareness + rate * dt2);
    } else this.awareness = Math.max(0, this.awareness - 0.15 * dt2);
    this.canSee = visible && this.awareness >= 1;
    if (this.canSee) {
      this.squad.lastKnown.copy(pl.position);
      this.squad.lastSeen = this.now;
      if (!this.squad.alert) {
        this.squad.alert = true;
        this.squad.callout(this.e, 'contact', this.now, true);
      }
    }
  }

  hear(pos, delay) {
    if (this.state === 'dead') return;
    this.heardT = this.now + delay;
    this.heardPos.copy(pos);
  }

  /** Bala do jogador passou perto / acertou perto. */
  suppress(amount) {
    this.suppression = Math.min(1.5, this.suppression + amount);
    if (this.state === 'idle') this.enterCombat();
    if (this.suppression > 0.9) this.squad.callout(this.e, 'suppressed', this.now);
  }

  onHit(amount) {
    this.flinch = 0.35;
    this.suppression = Math.min(1.5, this.suppression + 0.6);
    this.onTarget *= 0.3;
    if (this.state === 'idle') this.enterCombat();
    this.awareness = 1;
    this.squad.lastKnown.copy(this.ctx.player.position);
    this.squad.lastSeen = this.now;
    if (this.e.health > 0 && this.ctx.rng.next() < 0.5) this.squad.callout(this.e, 'hit', this.now);
  }

  enterCombat() {
    if (this.state === 'idle' || this.state === 'alert') {
      this.state = 'combat';
      this.mode = null;
      this.reactT = this.reaction;
      this.squad.alert = true;
    }
  }

  // ─── decisão ────────────────────────────────────────────────────────────
  update(dt) {
    const { ctx } = this;
    const e = this.e;
    this.stateT += dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.35);
    this.flinch = Math.max(0, this.flinch - dt);
    this.perceive(dt);
    if (this.heardT > 0 && this.now >= this.heardT) {
      this.heardT = -1;
      if (this.state === 'idle') {
        this.state = 'alert';
        this.stateT = 0;
        this.squad.lastKnown.copy(this.heardPos);
        if (!this.squad.alert) this.squad.callout(e, 'heard', this.now);
      }
    }
    if (this.canSee && (this.state === 'idle' || this.state === 'alert')) this.enterCombat();
    if (this.squad.alert && this.state === 'idle' && this.now - this.squad.lastSeen < 8) {
      // companheiro avistou: entra em alerta e vira para lá
      this.state = 'alert';
      this.stateT = 0;
    }

    if (e.scripted) return this.scripted(dt);
    if (this.state === 'idle') this.idle(dt);
    else if (this.state === 'alert') this.alertState(dt);
    else if (this.state === 'combat') this.combat(dt);
  }

  idle(dt) {
    const a = this.e.anim.p;
    this.idleLook += dt;
    this.desiredAim = 0.12;
    this.desiredCrouch = 0;
    this.speedTarget = 0;
    a.aimPitch = -0.15 + Math.sin(this.idleLook * 0.3) * 0.05;
    this.lookYaw = Math.sin(this.idleLook * 0.21) * 0.6;
  }

  alertState(dt) {
    // vira para a última posição conhecida, arma em pronto, procura cobertura
    this.desiredAim = 0.7;
    this.faceTowards(this.squad.lastKnown, dt, 3);
    if (this.stateT > 0.8 + this.reaction) {
      this.state = 'combat';
      this.mode = null;
      this.reactT = this.reaction * 0.5;
    }
  }

  setMode(m) {
    this.mode = m;
    this.modeT = 0;
  }

  combat(dt) {
    const { ctx, squad } = this;
    const e = this.e;
    const pl = ctx.player;
    this.modeT = (this.modeT ?? 0) + dt;
    this.reactT = Math.max(0, (this.reactT ?? 0) - dt);
    const threat = this.canSee ? pl.position : squad.lastKnown;
    const dist = e.group.position.distanceTo(threat);
    if (this.canSee) this.lostFor = 0;
    else this.lostFor += dt;

    // recarga
    if (this.reloadT >= 0) {
      this.reloadT += dt / 2.4;
      e.anim.p.reload = this.reloadT;
      if (this.reloadT >= 1) {
        this.reloadT = -1;
        e.anim.p.reload = -1;
        this.ammo = 30;
      }
    }
    if (this.ammo <= 0 && this.reloadT < 0) this.startReload();

    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.mode) {
      this.thinkT = 0.35 + ctx.rng.next() * 0.25;
      this.think(dist, threat);
    }

    const m = this.mode;
    if (m === 'move') {
      this.desiredAim = this.canSee && dist < 25 ? 0.75 : 0.25;
      this.desiredCrouch = 0;
      this.leanTarget = 0;
      const arrived = this.followPath(dt, this.runSpeed());
      if (this.canSee && dist < 30 && this.desiredAim > 0.5) this.aimAndFire(dt, dist, 0.6);
      else this.faceMove(dt);
      if (arrived) this.setMode(this.cover ? 'hide' : 'open');
    } else if (m === 'hide') {
      this.steerTo(this.cover?.pos, 1.6);
      this.desiredCrouch = this.cover?.low ? 1 : 0.3;
      this.desiredAim = 0.45;
      this.leanTarget = 0;
      this.faceTowards(threat, dt, 4);
      const hideFor = 1.0 + this.suppression * 1.6 + (this.reloadT >= 0 ? 2.4 : 0) + this.r(0, 0.8);
      if (this.ammo < 12 && this.reloadT < 0) this.startReload();
      if (this.modeT > hideFor && this.reloadT < 0 && this.suppression < 1.1) this.setMode('peek');
    } else if (m === 'peek') {
      this.steerTo(this.cover?.peekPos || this.cover?.pos, 1.6);
      this.desiredAim = 1;
      if (this.cover?.low) {
        // atira POR CIMA da cobertura baixa meio agachado (só ombros e
        // cabeça expostos), não de pé ao lado dela
        this.desiredCrouch = this.cover.peekCrouch ?? 0.38;
        this.leanTarget = 0;
      } else {
        this.desiredCrouch = 0.2;
        this.leanTarget = this.cover?.leanSide ?? 0;
      }
      this.aimAndFire(dt, dist, 1);
      const peekFor = 1.6 + this.r(0, 1.6);
      if (this.modeT > peekFor || this.suppression > 1.0 || this.flinch > 0.2 || this.ammo <= 0) this.setMode('hide');
    } else if (m === 'open') {
      // sem cobertura: atira, faz strafe, às vezes agacha
      this.desiredAim = 1;
      this.leanTarget = 0;
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = 0.8 + this.r(0, 1.4);
        this.strafeDir = this.ctx.rng.next() < 0.5 ? -1 : 1;
        // sem cobertura: prefere ficar baixo (alvo menor)
        this.desiredCrouch = this.ctx.rng.next() < 0.6 ? 1 : 0.25;
        if (this.desiredCrouch > 0.5) this.strafeDir = 0;
      }
      this.strafe(dt, threat);
      this.aimAndFire(dt, dist, 0.85);
    } else if (m === 'search') {
      this.desiredAim = 0.9;
      this.desiredCrouch = 0;
      const arrived = this.followPath(dt, 1.5);
      this.faceTowards(squad.lastKnown, dt, 3);
      if (arrived) this.setMode('open');
    }
  }

  r(a, b) {
    // variação determinística por soldado+tempo de modo (sem consumir RNG todo frame)
    const h = Math.sin((this.e.id + 1) * 12.9898 + Math.floor(this.modeStart ?? 0) * 78.233) * 43758.5453;
    return a + (h - Math.floor(h)) * (b - a);
  }

  runSpeed() {
    return 4.3;
  }

  think(dist, threat) {
    const { ctx, squad } = this;
    const e = this.e;
    const pl = ctx.player;
    this.modeStart = this.now;
    // perdeu o jogador por muito tempo → busca
    if (this.lostFor > 7 && this.mode !== 'search' && this.mode !== 'move') {
      const path = this.nav?.findPath(e.group.position, squad.lastKnown);
      if (path) {
        this.path = path;
        this.pathI = 0;
        this.releaseCover();
        this.setMode('search');
        squad.callout(e, 'lost', this.now);
        return;
      }
    }
    // papel de flanqueador
    const alive = e.feature.list.filter((x) => x.alive && x.brain.state === 'combat');
    if (!squad.flanker || !squad.flanker.alive) squad.flanker = alive.length >= 2 ? alive[alive.length - 1] : null;
    const flanker = squad.flanker === e;
    // jogador recarregando e perto → empurra
    const wpn = ctx.services.weapon;
    if (wpn?.reloading && dist < 22 && this.mode !== 'move' && ctx.rng.next() < 0.35) {
      squad.callout(e, 'push', this.now);
      if (this.pickCover(threat, { advance: true })) return;
    }
    // cobertura atual ainda serve?
    if (this.cover && this.mode !== 'move') {
      const exposed = this.coverExposed(this.cover, threat);
      const tooLong = this.modeT > 9 && ctx.rng.next() < 0.3;
      if (!exposed && !tooLong) return;
    }
    if (this.mode === 'move' && this.path) return;
    if (this.mode === 'open' && this.modeT < 2.5) return;
    if (this.pickCover(threat, { flank: flanker })) {
      squad.callout(e, flanker ? 'flanking' : 'moving', this.now);
      return;
    }
    if (this.mode !== 'open') this.setMode('open');
  }

  coverExposed(cover, threat) {
    const c = this.ctx.collision;
    const filt = { filter: (x) => x.tag !== 'enemy' && x.tag !== 'player' && !x.data?.enemy };
    const head = _v.copy(cover.pos).setY(cover.pos.y + (cover.low ? 0.75 : 1.55));
    const t = _w.copy(threat).setY(threat.y + 1.5);
    return c.lineOfSight(head, t, filt) && !cover.lean;
  }

  pickCover(threat, { flank = false, advance = false } = {}) {
    const nav = this.nav;
    if (!nav) return false;
    const e = this.e;
    const pos = e.group.position;
    const cands = nav.coverCandidates(pos, threat, advance ? 12 : 16, this._cands || (this._cands = []));
    if (!cands.length) return false;
    const pl = this.ctx.player;
    const look = pl.getAimDir ? pl.getAimDir(new THREE.Vector3()) : new THREE.Vector3(0, 0, -1);
    const myD = pos.distanceTo(threat);
    for (const c of cands) {
      const dT = Math.hypot(c.pos.x - threat.x, c.pos.z - threat.z);
      let s = c.d * 0.55 + Math.abs(dT - 17) * 0.35;
      if (dT < 6) s += 30;
      if (advance) s += (dT - myD) * 0.8;
      if (flank) {
        const vx = c.pos.x - threat.x, vz = c.pos.z - threat.z;
        const cos = (vx * look.x + vz * look.z) / Math.max(0.01, Math.hypot(vx, vz) * Math.hypot(look.x, look.z));
        s += cos * 7; // prefere fora do cone de visão do jogador
        s -= (myD - dT) * 0.3;
      }
      if (c.high && !c.low) s += 1.5;
      const claim = this.squad.claims.get(c.i);
      if (claim && claim !== e && claim.alive) s += 50;
      for (const o of e.feature.list) if (o !== e && o.alive && o.group.position.distanceToSquared(c.pos) < 2.5) s += 8;
      if (this.cover && c.i === this.cover.i) s += 4; // força troca
      c.s = s;
    }
    cands.sort((a, b) => a.s - b.s);
    const c = this.ctx.collision;
    const filt = { filter: (x) => x.tag !== 'enemy' && x.tag !== 'player' && !x.data?.enemy };
    const target = _w.copy(threat).setY(threat.y + 1.5);
    for (let k = 0; k < Math.min(8, cands.length); k++) {
      const cv = cands[k];
      // protege o tronco agachado? (barreira jersey tem ~0.8 m)
      const low = _v.copy(cv.pos).setY(cv.pos.y + 0.75);
      if (c.lineOfSight(low, target, filt)) continue;
      const high = _o.copy(cv.pos).setY(cv.pos.y + 1.6);
      const peekable = c.lineOfSight(high, target, filt);
      // menor exposição que ainda enxerga por cima (cabeça ≈ 1.62 − 0.55·agachar)
      let peekCrouch = 0;
      if (peekable)
        for (const hh of [1.3, 1.42]) {
          if (c.lineOfSight(_d.copy(cv.pos).setY(cv.pos.y + hh), target, filt)) {
            peekCrouch = (1.62 - hh) / 0.55;
            break;
          }
        }
      let leanSide = 0;
      if (!peekable) {
        // cobertura alta: testa inclinação lateral (0.55 m) para os dois lados
        const dx = target.x - cv.pos.x, dz = target.z - cv.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        for (const sgn of [1, -1]) {
          const side = _d.set((-dz / l) * 0.55 * sgn, 0, (dx / l) * 0.55 * sgn);
          if (c.lineOfSight(high.clone().add(side), target, filt)) {
            leanSide = sgn;
            break;
          }
        }
        if (!leanSide) continue;
      }
      const path = this.nav.findPath(pos, cv.pos);
      if (!path) continue;
      this.releaseCover();
      const peekPos = leanSide ? cv.pos.clone().add(_d.set((-(target.z - cv.pos.z) / Math.hypot(target.x - cv.pos.x, target.z - cv.pos.z)) * 0.6 * leanSide, 0, ((target.x - cv.pos.x) / Math.hypot(target.x - cv.pos.x, target.z - cv.pos.z)) * 0.6 * leanSide)) : null;
      this.cover = { i: cv.i, pos: cv.pos.clone(), low: peekable, lean: !peekable, leanSide, peekPos, peekCrouch };
      this.squad.claims.set(cv.i, e);
      this.path = path;
      this.pathI = 0;
      this.setMode('move');
      return true;
    }
    return false;
  }

  releaseCover() {
    if (this.cover && this.squad.claims.get(this.cover.i) === this.e) this.squad.claims.delete(this.cover.i);
    this.cover = null;
  }

  startReload() {
    if (this.reloadT >= 0) return;
    this.reloadT = 0;
    this.ctx.bus.emit('enemy:reload', { enemy: this.e });
    this.squad.callout(this.e, 'reloading', this.now);
  }

  // ─── locomoção ──────────────────────────────────────────────────────────
  followPath(dt, speed) {
    if (!this.path || this.pathI >= this.path.length) {
      this.speedTarget = 0;
      return true;
    }
    const pos = this.e.group.position;
    const wp = this.path[this.pathI];
    const dx = wp.x - pos.x, dz = wp.z - pos.z;
    const d = Math.hypot(dx, dz);
    const last = this.pathI === this.path.length - 1;
    if (d < (last ? 0.25 : 0.6)) {
      this.pathI++;
      if (this.pathI >= this.path.length) {
        this.speedTarget = 0;
        this.path = null;
        return true;
      }
    }
    const slow = last ? Math.min(1, d / 1.2) : 1;
    this.moveDir = (this.moveDir || new THREE.Vector3()).set(dx / (d || 1), 0, dz / (d || 1));
    this.speedTarget = speed * Math.max(0.35, slow);
    return false;
  }

  /** passo lateral curto (sair/voltar da cobertura ao inclinar) */
  steerTo(p, speed) {
    if (!p) {
      this.speedTarget = 0;
      return;
    }
    const g = this.e.group.position;
    const dx = p.x - g.x, dz = p.z - g.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      this.speedTarget = 0;
      return;
    }
    this.moveDir = (this.moveDir || new THREE.Vector3()).set(dx / d, 0, dz / d);
    this.speedTarget = Math.min(speed, d * 4);
  }

  strafe(dt, threat) {
    const pos = this.e.group.position;
    const dx = threat.x - pos.x, dz = threat.z - pos.z;
    const l = Math.hypot(dx, dz) || 1;
    this.moveDir = (this.moveDir || new THREE.Vector3()).set((-dz / l) * this.strafeDir, 0, (dx / l) * this.strafeDir);
    // não sai da área andável
    if (this.nav) {
      const ahead = this.nav.cellOf(pos.x + this.moveDir.x * 0.8, pos.z + this.moveDir.z * 0.8);
      if (ahead < 0 || !this.nav.walk[ahead]) this.strafeDir *= -1;
    }
    this.speedTarget = this.strafeDir ? 1.6 : 0;
    this.faceTowards(threat, dt, 5);
  }

  faceMove(dt) {
    if (this.moveDir && this.speedTarget > 0.3) this.turnTo(Math.atan2(this.moveDir.x, this.moveDir.z), dt, 7);
  }

  faceTowards(p, dt, rate) {
    const g = this.e.group.position;
    this.turnTo(Math.atan2(p.x - g.x, p.z - g.z), dt, rate);
  }

  turnTo(yaw, dt, rate) {
    const e = this.e;
    const d = wrap(yaw - e.yaw);
    e.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  // ─── tiro ───────────────────────────────────────────────────────────────
  aimAndFire(dt, dist, fireRate = 1) {
    const { ctx } = this;
    const e = this.e;
    const tgt = this.canSee ? this.targetPoint(_w) : _w.copy(this.squad.lastKnown).setY(this.squad.lastKnown.y + 1.2);
    this.faceTowards(tgt, dt, 5);
    e.aimAt(tgt, dt);
    if (!this.canSee || this.reactT > 0 || this.flinch > 0 || this.reloadT >= 0 || this.ammo <= 0) {
      this.onTarget = Math.max(0, this.onTarget - dt * 2);
      return;
    }
    this.onTarget += dt;
    if (this.onTarget < 0.25 / this.skill) return;
    this.shotT -= dt;
    if (this.shotT > 0) return;
    if (this.burst <= 0) {
      if (this.burstPause > 0) {
        this.burstPause -= dt;
        return;
      }
      this.burst = 3 + Math.floor(ctx.rng.next() * 5);
      this.burstPause = (0.35 + ctx.rng.next() * 0.7) / fireRate;
    }
    this.burst--;
    this.shotT = 0.095;
    this.fireShot(dist);
  }

  fireShot(dist) {
    const { ctx } = this;
    const e = this.e;
    const pl = ctx.player;
    const origin = e.muzzleWorld(new THREE.Vector3());
    const tgt = this.targetPoint(new THREE.Vector3());
    if (ctx.shot) {
      // screenshot: rajadas de supressão passando AO LADO do jogador (um
      // traçante que atravessa a lente vira uma faixa pela tela inteira)
      const sdx = tgt.x - origin.x, sdz = tgt.z - origin.z, l = Math.hypot(sdx, sdz) || 1;
      const k = (e.id % 2 ? 1 : -1) * (1.6 + ctx.rng.next() * 1.2);
      tgt.x += (-sdz / l) * k;
      tgt.z += (sdx / l) * k;
      tgt.y += 0.3 + ctx.rng.next() * 0.6;
    }
    const dir = tgt.clone().sub(origin).normalize();
    const moving = e.speed > 0.5 ? 0.025 : 0;
    const plMoving = (pl.state?.speed || 0) > 1 ? 0.012 : 0;
    const settle = Math.max(0, 0.08 - this.onTarget * 0.04);
    const err = (0.014 + dist * 0.0005 + this.suppression * 0.035 + moving + plMoving + settle) / this.skill;
    const r = ctx.rng;
    const a = r.next() * Math.PI * 2, m = Math.sqrt(r.next()) * err;
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(side, dir);
    dir.addScaledVector(side, Math.cos(a) * m).addScaledVector(up2, Math.sin(a) * m).normalize();
    this.ammo--;
    e.anim.fire();
    ctx.bus.emit('enemy:fire', { enemy: e, origin: origin.clone(), dir: dir.clone() });
    ctx.services.audio?.play?.('enemy_shot', { position: origin, volume: 1 });
    if (ctx.shot || !pl.alive) return;
    // acerto: aproximação raio × segmento do corpo do jogador
    const a0 = _v.copy(pl.position).setY(pl.position.y + 0.25);
    const a1 = _o.copy(pl.position).setY(pl.position.y + (pl.eyeHeight ?? 1.62) + 0.1);
    const t = closestRaySegment(origin, dir, a0, a1);
    if (t.dist < 0.3 && t.t > 0) {
      const block = ctx.collision.raycast(origin, dir, t.t, { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy && c.owner !== e.group });
      if (!block) {
        const dmg = (dist < 15 ? 10 : dist < 35 ? 8 : 6) * (t.h > 0.82 ? 1.4 : 1);
        pl.damage(dmg, { source: 'enemy', from: origin.clone(), enemy: e, dir: dir.clone() });
      }
    }
  }

  /** Soldado do preset de screenshot: mira e atira no jogador sem se mover. */
  scripted(dt) {
    const e = this.e;
    const sc = e.scripted;
    this.speedTarget = sc.speed || 0;
    if (sc.speed) this.moveDir = new THREE.Vector3(...sc.dir);
    this.desiredCrouch = sc.crouch || 0;
    this.desiredAim = sc.aim ?? 1;
    this.leanTarget = sc.lean || 0;
    const tgt = this.targetPoint(_w);
    if (sc.face !== false) this.faceTowards(tgt, dt, 6);
    else this.faceMove(dt);
    e.aimAt(tgt, dt);
    if (sc.fire) {
      this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = sc.interval || 0.1;
        this.fireShot(e.group.position.distanceTo(tgt));
      }
    }
  }
}

/** Distância mínima entre raio (o, d) e segmento a-b. Retorna { dist, t, h } (h = fração no segmento). */
export function closestRaySegment(o, d, a, b) {
  const u = d, v = new THREE.Vector3().subVectors(b, a), w = new THREE.Vector3().subVectors(o, a);
  const A = 1, Bv = u.dot(v), Cc = v.dot(v), D = u.dot(w), E = v.dot(w);
  const den = A * Cc - Bv * Bv;
  let s = den > 1e-8 ? (Bv * E - Cc * D) / den : 0;
  let t = den > 1e-8 ? (A * E - Bv * D) / den : E / Cc;
  t = Math.min(1, Math.max(0, t));
  s = Math.max(0, u.dot(new THREE.Vector3().subVectors(a, o).addScaledVector(v, t)));
  const p = o.clone().addScaledVector(u, s), q = a.clone().addScaledVector(v, t);
  return { dist: p.distanceTo(q), t: s, h: t };
}
