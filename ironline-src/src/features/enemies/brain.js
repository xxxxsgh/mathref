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
import { GUNCFG, combatRusher, combatSniper, combatShield, medicThink } from './roles.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _g = new THREE.Vector3();

/**
 * Chefe (juggernaut): vida, velocidade de marcha, caixa de munição,
 * recarga, cadência (rpm) e dano por tiro no jogador.
 */
export const BOSS = { health: 1600, speed: 1.7, mag: 100, reload: 4.6, rpm: 720, damage: 9, name: 'JUGGERNAUT' };

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
  // classes especiais
  breach: ['Entrando! Abram caminho!', 'Arrombador avançando!', 'Vou pra cima dele!'],
  sniper: ['Atirador em posição!', 'Tenho ele na luneta!'],
  shield: ['Escudo na frente! Avança!', 'Escudo erguido, me sigam!'],
  medic: ['Aguenta aí, tô indo!', 'Socorrista a caminho!'],
  reviving: ['Fica comigo!', 'Te peguei, respira!'],
  revived: ['De pé! Volta pra luta!', 'Tá vivo, levanta!'],
  // granadas
  frag: ['Granada saindo!', 'Fogo na granada!'],
  incoming: ['Granada! Sai daí!', 'Granada no chão!'],
  // killstreaks do jogador
  uav: ['Drone de reconhecimento no ar!', 'Eles têm olhos no céu!'],
  airstrike: ['Morteiro chegando! Abriga!', 'Fogo de artilharia!'],
  turret: ['Torreta automática! Derruba ela!', 'Sentinela armada ali!'],
  drone: ['Drone de ataque! Atira nele!', 'Drone em cima de nós!'],
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
    this.objective = null; // HARDPOINT: { x, y, z, radius } (services.enemies.setObjective)
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
    // chefe: metralhadora com caixa de 100, reação mais calma, mira firme
    this.boss = !!enemy.boss;
    this.magSize = this.boss ? BOSS.mag : 30;
    this.ammo = this.magSize;
    if (this.boss) {
      this.skill = 1.15;
      this.reaction = 0.45;
    }
    // classe especial (roles.js) e arma da classe
    this.role = enemy.role || null;
    this.gun = GUNCFG[this.role?.gun || 'rifle'];
    if (!this.boss) {
      this.magSize = this.gun.mag;
      this.ammo = this.magSize;
    }
    this.focus = null; // alvo alternativo (torreta/drone do jogador)
    this.nadeT = 4 + r.next() * 6; // recarga própria da granada
    this.throwT = -1;
    this.duck = 0;
    this.charge = 0; // atirador: carga da mira 0..1
    this.laser = 0;
    this.reviving = 0;
    this.sustain = 0; // tiros seguidos na rajada atual (abre o cone)
    this.assaulter = false; // HARDPOINT: vai para a zona e luta de dentro
    this.toObjective = false;
  }

  /**
   * Entra em combate já sabendo para onde ir (ondas). `assaulter` = parte
   * do grupo de assalto do objetivo (HARDPOINT), se houver objetivo.
   */
  assault({ assaulter = true } = {}) {
    this.assaulter = !!assaulter;
    if (this.state === 'idle' || this.state === 'alert') {
      this.state = 'combat';
      this.mode = null;
      this.reactT = this.reaction;
      this.squad.alert = true;
    }
    this.awareness = Math.max(this.awareness, 0.8);
    this.thinkT = 0;
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
    this.pickFocus(eye, visible ? dist : Infinity);
    if (this.canSee) {
      this.squad.lastKnown.copy(pl.position);
      this.squad.lastSeen = this.now;
      if (!this.squad.alert) {
        this.squad.alert = true;
        this.squad.callout(this.e, 'contact', this.now, true);
      }
    }
  }

  /**
   * Alvos alternativos publicados pela feature streaks (`services.streaks.decoys`:
   * torreta, drone) — { position, alive, radius, damage(amount, info) }.
   * Em combate, atira no decoy visível se ele estiver mais perto que o jogador
   * (ou se o jogador não estiver à vista).
   */
  pickFocus(eye, playerDist) {
    const decoys = this.ctx.services.streaks?.decoys;
    this.focus = null;
    if (!decoys?.length || this.state === 'idle' || this.boss && playerDist < 30) return;
    let best = null, bd = 45;
    const filt = { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy && !c.data?.decoy };
    for (const d of decoys) {
      if (!d.alive || !d.position) continue;
      const dist = eye.distanceTo(d.position);
      if (dist >= bd) continue;
      if (!this.ctx.collision.lineOfSight(eye, d.position, filt)) continue;
      best = d;
      bd = dist;
    }
    if (best && (!(playerDist < Infinity) || bd < playerDist * 0.85)) {
      if (this.focus !== best && !best._called) {
        best._called = true;
        this.squad.callout(this.e, best.kind === 'drone' ? 'drone' : 'turret', this.now, true);
      }
      this.focus = best;
    }
  }

  /** Granada do jogador por perto: corre para longe (e avisa). */
  evade(pos) {
    if (this.state === 'dead' || this.boss || this.e.exec) return;
    if (this.evadeT > this.now) return;
    this.evadeT = this.now + 2.5;
    this.enterCombat();
    this.squad.callout(this.e, 'incoming', this.now, true);
    const p = this.e.group.position;
    const away = _v.set(p.x - pos.x, 0, p.z - pos.z);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    away.normalize();
    const goal = p.clone().addScaledVector(away, 6.5);
    const path = this.nav?.findPath(p, goal, 6000);
    this.releaseCover();
    this.path = path || [goal];
    this.pathI = 0;
    this.revive = null;
    this.setMode('evade');
  }

  hear(pos, delay) {
    if (this.state === 'dead') return;
    this.heardT = this.now + delay;
    this.heardPos.copy(pos);
  }

  /** Bala do jogador passou perto / acertou perto. */
  suppress(amount) {
    if (this.boss) amount *= 0.15;
    this.suppression = Math.min(1.5, this.suppression + amount);
    if (this.state === 'idle') this.enterCombat();
    if (this.suppression > 0.9) this.squad.callout(this.e, 'suppressed', this.now);
  }

  onHit(amount) {
    // o chefe blindado mal sente o impacto (não perde a mira)
    this.flinch = this.boss ? 0.03 : 0.35;
    this.suppression = Math.min(1.5, this.suppression + (this.boss ? 0.05 : 0.6));
    this.onTarget *= this.boss ? 0.9 : 0.3;
    if (this.state === 'idle') this.enterCombat();
    this.awareness = 1;
    this.squad.lastKnown.copy(this.ctx.player.position);
    this.squad.lastSeen = this.now;
    if (this.e.health > 0 && this.ctx.rng.next() < 0.5) this.squad.callout(this.e, 'hit', this.now);
    // socorrista baleado no meio da reanimação: larga o corpo
    if (this.revive && amount > 20) {
      this.revive.corpse.claimedBy = null;
      this.revive = null;
      this.reviving = 0;
      this.setMode(null);
    }
    this.charge = 0; // atirador perde a carga da mira
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
    const threat = this.focus ? this.focus.position : this.canSee ? pl.position : squad.lastKnown;
    const dist = e.group.position.distanceTo(threat);
    if (this.canSee) this.lostFor = 0;
    else this.lostFor += dt;

    // recarga
    if (this.reloadT >= 0) {
      this.reloadT += dt / (this.boss ? BOSS.reload : this.gun.reload);
      e.anim.p.reload = this.reloadT;
      if (this.reloadT >= 1) {
        this.reloadT = -1;
        e.anim.p.reload = -1;
        this.ammo = this.magSize;
      }
    }
    if (this.ammo <= 0 && this.reloadT < 0) this.startReload();
    if (this.boss) return this.bossCombat(dt, dist, threat);
    // reação a fogo: encolhe (cabeça baixa) sob supressão, fora do tiro
    this.duck = this.suppression > 0.6 && this.onTarget < 0.2 ? Math.min(1, (this.suppression - 0.6) / 0.6) : 0;
    // arremesso de granada em andamento
    if (this.throwT >= 0) return this.throwing(dt);
    if (this.mode === 'evade') {
      this.desiredAim = 0.2;
      this.desiredCrouch = 0;
      this.leanTarget = 0;
      const arrived = this.followPath(dt, 5.2);
      this.faceMove(dt);
      if (arrived || this.modeT > 3) this.setMode(null);
      return;
    }
    const rid = this.role?.id;
    if (rid === 'rusher') return combatRusher(this, dt, dist, threat);
    if (rid === 'sniper') return combatSniper(this, dt, dist, threat);
    if (rid === 'shield') return combatShield(this, dt, dist, threat);
    if (rid === 'medic' && medicThink(this, dt)) return;
    if (this.maybeGrenade(dt, dist)) return;

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
      if (arrived) {
        this.toObjective = false;
        this.setMode(this.cover ? 'hide' : 'open');
      }
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
      // sob fogo pesado: abaixa de vez e para o strafe
      if (this.suppression > 1.0) {
        this.desiredCrouch = 1;
        this.strafeDir = 0;
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
    // objetivo do esquadrão (HARDPOINT): o grupo de assalto — e quem não
    // enxerga o jogador — vai para a zona e luta de dentro dela
    if (squad.objective && this.objectiveThink(threat)) return;
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

  /** HARDPOINT: decide ir/ficar na zona. true = decidiu (think termina). */
  objectiveThink(threat) {
    const obj = this.squad.objective;
    const p = this.e.group.position;
    const inside = Math.hypot(p.x - obj.x, p.z - obj.z) < obj.radius * 0.85;
    const go = this.assaulter || !this.canSee || this.lostFor > 2;
    if (go && !inside) {
      if (this.mode === 'move' && this.toObjective && this.path) return true;
      return this.goToObjective();
    }
    if (inside && this.assaulter) {
      // já dentro: cobertura só se ficar DENTRO da zona; senão em campo aberto
      if (this.cover && this.mode !== 'move' && !this.coverExposed(this.cover, threat)) return true;
      if (this.mode === 'open' && this.modeT < 2.5) return true;
      if (this.pickCover(threat, { within: obj })) return true;
      if (this.mode !== 'open') this.setMode('open');
      return true;
    }
    return false;
  }

  goToObjective() {
    const obj = this.squad.objective;
    const r = this.ctx.rng;
    const a = r.next() * Math.PI * 2, m = Math.sqrt(r.next()) * obj.radius * 0.6;
    const goal = _g.set(obj.x + Math.cos(a) * m, obj.y || 0, obj.z + Math.sin(a) * m);
    const path = this.nav ? this.nav.findPath(this.e.group.position, goal, 14000) : [goal.clone()];
    if (!path) return false;
    this.releaseCover();
    this.path = path;
    this.pathI = 0;
    this.toObjective = true;
    this.setMode('move');
    this.squad.callout(this.e, 'moving', this.now);
    return true;
  }

  /**
   * CHEFE: não procura cobertura — marcha devagar na direção do jogador
   * (ou do objetivo, se não o vê) até ~12 m e despeja rajadas longas de
   * metralhadora. Recarga longa é a janela para flanquear.
   */
  bossCombat(dt, dist, threat) {
    const e = this.e;
    const pos = e.group.position;
    this.desiredCrouch = 0;
    this.leanTarget = 0;
    this.desiredAim = this.reloadT >= 0 ? 0.5 : 1;
    const obj = this.squad.objective;
    const goal = !this.canSee && obj ? _g.set(obj.x, obj.y || 0, obj.z) : threat;
    const stop = this.canSee ? 11 : 2.5;
    const gd = Math.hypot(goal.x - pos.x, goal.z - pos.z);
    this.repathT = (this.repathT ?? 0) - dt;
    if (this.repathT <= 0) {
      this.repathT = 1.4;
      this.path = gd > stop ? (this.nav ? this.nav.findPath(pos, goal, 14000) : [goal.clone()]) : null;
      this.pathI = 0;
    }
    if (this.path && gd > stop) this.followPath(dt, BOSS.speed);
    else this.speedTarget = 0;
    if (this.canSee) this.aimAndFire(dt, dist, 1);
    else if (this.speedTarget > 0.3) this.faceMove(dt);
    else this.faceTowards(goal, dt, 2.5);
  }

  coverExposed(cover, threat) {
    const c = this.ctx.collision;
    const filt = { filter: (x) => x.tag !== 'enemy' && x.tag !== 'player' && !x.data?.enemy };
    const head = _v.copy(cover.pos).setY(cover.pos.y + (cover.low ? 0.75 : 1.55));
    const t = _w.copy(threat).setY(threat.y + 1.5);
    return c.lineOfSight(head, t, filt) && !cover.lean;
  }

  pickCover(threat, { flank = false, advance = false, within = null } = {}) {
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
      if (within && Math.hypot(c.pos.x - within.x, c.pos.z - within.z) > within.radius * 0.9) {
        c.s = 1e9;
        continue;
      }
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
      if (cv.s >= 1e9) break;
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

  /**
   * Granada do inimigo: o jogador sumiu atrás de cobertura (perdido há
   * 1,5–10 s), a 7–26 m da última posição conhecida — "desentoca" com uma
   * granada. Uma por soldado a cada ~14 s e uma por esquadrão a cada 7 s.
   */
  maybeGrenade(dt, dist) {
    this.nadeT -= dt;
    const sq = this.squad;
    if (this.nadeT > 0 || this.canSee || this.focus || this.reloadT >= 0) return false;
    if (this.lostFor < 1.5 || this.lostFor > 10 || dist < 7 || dist > 26) return false;
    if ((sq.nadeT ?? 0) > this.now || !this.e.feature.grenades) return false;
    this.nadeT = 3;
    if (this.ctx.rng.next() > 0.3) return false;
    this.nadeT = 14 + this.ctx.rng.next() * 8;
    sq.nadeT = this.now + 7;
    this.throwT = 0;
    this.thrown = false;
    this.speedTarget = 0;
    sq.callout(this.e, 'frag', this.now, true);
    return true;
  }

  /** Animação de arremesso (mão direita por cima do ombro) + lançamento. */
  throwing(dt) {
    const e = this.e;
    const a = e.anim;
    this.throwT += dt;
    const t = this.throwT;
    this.speedTarget = 0;
    this.desiredAim = 0;
    this.desiredCrouch = Math.min(this.desiredCrouch, 0.3);
    const tgt = this.squad.lastKnown;
    this.faceTowards(tgt, dt, 5);
    // alvo da mão no espaço do modelo: atrás da cabeça → à frente e acima
    const back = Math.min(1, t / 0.45), fwd = Math.max(0, Math.min(1, (t - 0.45) / 0.2));
    const s = (x) => x * x * (3 - 2 * x);
    a.over.R.set(-0.2 + s(fwd) * 0.12, 1.72 - s(fwd) * 0.32, -0.22 + s(fwd) * 0.62);
    a.over.wR = t < 0.85 ? Math.min(1, t / 0.15) : Math.max(0, 1 - (t - 0.85) / 0.25);
    if (!this.thrown && t >= 0.58) {
      this.thrown = true;
      const from = e.joint(11, new THREE.Vector3()); // mão direita
      const to = tgt.clone();
      to.x += (this.ctx.rng.next() - 0.5) * 2.5;
      to.z += (this.ctx.rng.next() - 0.5) * 2.5;
      e.feature.grenades.throw(from, to, e);
    }
    if (t > 1.1) {
      this.throwT = -1;
      a.over.wR = 0;
      this.setMode(null);
    }
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
    // HARDPOINT: o assalto não sai da zona fazendo strafe
    const obj = this.squad.objective;
    if (obj && this.assaulter && Math.hypot(pos.x + this.moveDir.x * 0.8 - obj.x, pos.z + this.moveDir.z * 0.8 - obj.z) > obj.radius * 0.85) this.strafeDir *= -1;
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
  aimAndFire(dt, dist, fireRate = 1, noTurn = false) {
    const { ctx } = this;
    const e = this.e;
    const sees = this.canSee || !!this.focus;
    const tgt = this.focus ? _w.copy(this.focus.position) : this.canSee ? this.targetPoint(_w) : _w.copy(this.squad.lastKnown).setY(this.squad.lastKnown.y + 1.2);
    if (!noTurn) this.faceTowards(tgt, dt, 5);
    e.aimAt(tgt, dt);
    if (!sees || this.reactT > 0 || this.flinch > 0 || this.reloadT >= 0 || this.ammo <= 0) {
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
        this.sustain = 0;
        return;
      }
      // metralhadora do chefe: rajadas longas e sustentadas
      const G = this.gun;
      this.burst = this.boss ? 14 + Math.floor(ctx.rng.next() * 14) : G.burst[0] + Math.floor(ctx.rng.next() * (G.burst[1] - G.burst[0] + 1));
      this.burstPause = this.boss ? 0.45 + ctx.rng.next() * 0.5 : (G.pause[0] + ctx.rng.next() * (G.pause[1] - G.pause[0])) / fireRate;
    }
    this.burst--;
    this.sustain++;
    this.shotT = this.boss ? 60 / BOSS.rpm : this.gun.interval;
    this.fireShot(dist);
  }

  fireShot(dist) {
    const { ctx } = this;
    const e = this.e;
    const pl = ctx.player;
    const origin = e.muzzleWorld(new THREE.Vector3());
    const focus = this.focus;
    const tgt = focus ? focus.position.clone() : this.targetPoint(new THREE.Vector3());
    if (ctx.shot && !focus) {
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
    // rajada longa abre o cone (o cano "sobe"): até +0,03 rad no chefe
    const climb = this.boss ? Math.min(0.03, this.sustain * 0.0016) : 0;
    const G = this.gun;
    let err = (0.014 + dist * 0.0005 + this.suppression * 0.035 + moving + plMoving + settle + climb + (G.err || 0)) / this.skill;
    // atirador de elite: tiro carregado, quase sem erro (ainda sente supressão)
    if (this.role?.id === 'sniper') err = (0.003 + dist * 0.00008 + this.suppression * 0.03 + plMoving * 0.6) / this.skill;
    const r = ctx.rng;
    const a = r.next() * Math.PI * 2, m = Math.sqrt(r.next()) * err;
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(side, dir);
    dir.addScaledVector(side, Math.cos(a) * m).addScaledVector(up2, Math.sin(a) * m).normalize();
    this.ammo--;
    e.anim.fire();
    const kind = this.role?.gun || 'rifle';
    ctx.bus.emit('enemy:fire', { enemy: e, origin: origin.clone(), dir: dir.clone(), heavy: this.boss, gun: kind, pellets: G.pellets });
    // chefe: camada grave da metralhadora (mesmo som sintetizado, mais lento)
    if (this.boss) ctx.services.audio?.play?.('shot_enemy', { position: origin, rate: 0.72, volume: 1.15, reverb: 0.35, cap: 10, jitter: 0.03 });
    else if (kind === 'shotgun') ctx.services.audio?.play?.('shot_enemy', { position: origin, rate: 0.62, volume: 1.2, reverb: 0.4, cap: 6, jitter: 0.04 });
    else if (kind === 'sniper') {
      ctx.services.audio?.play?.('shot_enemy', { position: origin, rate: 0.8, volume: 1.35, reverb: 0.55, cap: 4 });
      ctx.services.audio?.play?.('shot_far', { position: origin, volume: 0.8, delay: 0.12, cap: 3 });
    } else ctx.services.audio?.play?.('enemy_shot', { position: origin, volume: 1 });
    // bagos extras da escopeta: traçantes só visuais (o som/clarão é do evento)
    const dirs = [dir];
    if (G.pellets > 1) {
      for (let k = 1; k < G.pellets; k++) {
        const pa = r.next() * Math.PI * 2, pm = Math.sqrt(r.next()) * G.spread;
        const pd = dir.clone().addScaledVector(side, Math.cos(pa) * pm).addScaledVector(up2, Math.sin(pa) * pm).normalize();
        dirs.push(pd);
        if (k === 2 || k === 5) ctx.services.vfx?.tracer?.(origin.clone().addScaledVector(pd, 0.4), origin.clone().addScaledVector(pd, Math.min(30, dist + 4)), { speed: 260, length: 2 });
      }
    }
    if (focus) return this.shootFocus(origin, dirs, dist);
    if (ctx.shot || !pl.alive) return;
    if (G.pellets > 1) return this.pelletsOnPlayer(origin, dirs, dist);
    // acerto: aproximação raio × segmento do corpo do jogador
    const a0 = _v.copy(pl.position).setY(pl.position.y + 0.25);
    const a1 = _o.copy(pl.position).setY(pl.position.y + (pl.eyeHeight ?? 1.62) + 0.1);
    const t = closestRaySegment(origin, dir, a0, a1);
    if (t.dist < 0.3 && t.t > 0) {
      const block = ctx.collision.raycast(origin, dir, t.t, { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy && c.owner !== e.group });
      if (!block) {
        const base = this.boss ? BOSS.damage : G.damage;
        const fall = this.role?.id === 'sniper' ? 1 : dist < 15 ? 1 : dist < 35 ? 0.8 : 0.6;
        const dmg = base * fall * (t.h > 0.82 ? 1.4 : 1);
        pl.damage(dmg, { source: 'enemy', from: origin.clone(), enemy: e, dir: dir.clone(), gun: kind });
      }
    }
  }

  /** Bagos da escopeta no jogador: soma o dano de cada bago que acerta. */
  pelletsOnPlayer(origin, dirs, dist) {
    const { ctx } = this;
    const pl = ctx.player;
    const a0 = _v.copy(pl.position).setY(pl.position.y + 0.25);
    const a1 = _o.copy(pl.position).setY(pl.position.y + (pl.eyeHeight ?? 1.62) + 0.1);
    let total = 0;
    for (const d of dirs) {
      const t = closestRaySegment(origin, d, a0, a1);
      if (t.dist > 0.32 || t.t <= 0) continue;
      const block = ctx.collision.raycast(origin, d, t.t, { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy && c.owner !== this.e.group });
      if (block) continue;
      total += this.gun.damage * Math.max(0.25, 1 - Math.max(0, dist - 5) / 16);
    }
    if (total > 0) pl.damage(total, { source: 'enemy', from: origin.clone(), enemy: this.e, dir: dirs[0].clone(), gun: 'shotgun' });
  }

  /** Tiro num decoy (torreta/drone): esfera de acerto + bloqueio do cenário. */
  shootFocus(origin, dirs, dist) {
    const { ctx } = this;
    const f = this.focus;
    const filt = { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy && !c.data?.decoy };
    let total = 0;
    for (const d of dirs) {
      const c = _v.copy(f.position).sub(origin);
      const t = c.dot(d);
      if (t <= 0) continue;
      const miss = Math.sqrt(Math.max(0, c.lengthSq() - t * t));
      if (miss > (f.radius || 0.45)) continue;
      if (ctx.collision.raycast(origin, d, t - 0.2, filt)) continue;
      total += (this.boss ? BOSS.damage : this.gun.damage) * (this.gun.pellets > 1 ? Math.max(0.25, 1 - Math.max(0, dist - 5) / 16) : 1);
    }
    if (total > 0) f.damage?.(total, { source: 'enemy', enemy: this.e, from: origin.clone(), dir: dirs[0].clone() });
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
    // `shots`: limite de disparos (o clarão "preso" do modo shot fica com o
    // último atirador — o chefe dispara a rajada no aquecimento e para)
    if (sc.fire && (sc.shots == null || (this._scShots = this._scShots || 0) < sc.shots)) {
      this.shotT -= dt;
      if (this.shotT <= 0) {
        if (sc.shots != null) this._scShots++;
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
