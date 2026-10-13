// Inimigo em terra: soldado (Hegemonia/Corsários/Frente) ou sentinela dos
// Vigilantes. Percepção (visão em cone + linha de visada + ruído de tiros),
// estados (ocioso/patrulha → alerta → combate → morto), coberturas com
// espiar/atirar/esconder, rajadas com erro de mira, granadas, flanco, recuo
// com pouca vida, reações a acertos e queda. Sentinela: orbita, carrega e
// dispara um raio (telegrafado pelas pétalas e um laser de mira).
import * as THREE from 'three/webgpu';
import { buildSoldier, poseSoldier } from './humanoid.js';
import { buildSentinel, poseSentinel } from './sentinel.js';
import { A } from '../projectiles.js';
import { clamp, damp, quatFromFwdUp } from '../util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

/** Distância entre segmentos p0p1 e q0q1: { s, t, d }. */
export function segSeg(p0, p1, q0, q1) {
  const d1 = _a1.copy(p1).sub(p0), d2 = _a2.copy(q1).sub(q0), r = _a3.copy(p0).sub(q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const cp = _a4.copy(p0).addScaledVector(d1, s), cq = _a5.copy(q0).addScaledVector(d2, t);
  return { s, t, d: cp.distanceTo(cq) };
}
const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3(), _a4 = new THREE.Vector3(), _a5 = new THREE.Vector3();

const STATS = {
  soldier: { hp: 100, speed: 2.0, run: 4.6, burst: [3, 6], rate: 0.11, dmg: 6, spread: 0.035, range: 70 },
  officer: { hp: 120, speed: 2.0, run: 4.8, burst: [2, 4], rate: 0.16, dmg: 8, spread: 0.022, range: 90 },
  heavy: { hp: 240, speed: 1.5, run: 3.0, burst: [8, 14], rate: 0.08, dmg: 5, spread: 0.06, range: 55 },
  sentinel: { hp: 260, speed: 3.0, run: 6.0, burst: [1, 1], rate: 2.6, dmg: 22, spread: 0.01, range: 120 },
};

const BARKS = {
  hegemonia: {
    spot: ['Contato! É o desertor — fogo à vontade!', 'Alvo confirmado: Paoli. Ninguém recua!', 'Visual no traidor! Cerquem pelo flanco!'],
    hurt: ['Fui atingido!', 'Preciso de cobertura!'], grenade: ['Granada!', 'Cuidado, granada!'], down: ['Homem abatido!', 'Perdemos o Seis!'],
  },
  corsarios: {
    spot: ['Olha só, carne fresca da Hegemonia!', 'Pega ele! O traje vale uma fortuna!', 'Ei! Esse aí não paga pedágio!'],
    hurt: ['Desgraçado!', 'Me acertou!'], grenade: ['Toma essa!', 'Presente pra você!'], down: ['Perdemos o Rato!', 'Merda, caiu mais um!'],
  },
};

export class Enemy {
  constructor(director, o) {
    this.D = director; this.ctx = director.ctx;
    this.kind = o.kind || 'soldier';
    this.faction = o.faction || 'hegemonia';
    this.isEnemy = true; this.isMachine = this.kind === 'sentinel' || this.faction === 'vigilantes';
    this.anchor = o.anchor;
    this.pos = o.pos.clone(); this.vel = new THREE.Vector3();
    this.home = o.pos.clone();
    this.fwd = (o.fwd || new THREE.Vector3(1, 0, 0)).clone();
    this.up = A.up(this.anchor, this.pos, new THREE.Vector3());
    const S = this.S = STATS[this.kind] || STATS.soldier;
    this.hp = S.hp * (o.hpMul || 1); this.maxHp = this.hp;
    this.alive = true;
    this.state = o.state || 'idle';
    this.aware = 0; this.lastSeen = null; this.losT = Math.random() * 0.3; this.los = false;
    this.cover = null; this.coverT = 0; this.peek = false; this.peekT = 0;
    this.burstLeft = 0; this.fireT = 1 + Math.random(); this.suppress = 0;
    this.crouch = 0; this.speed = 0; this.phase = Math.random() * 6; this.t = Math.random() * 10;
    this.aimPitch = 0; this.aimYaw = 0; this.hitX = { x: 0, v: 0 }; this.hitZ = { x: 0, v: 0 };
    this.dead = 0; this.deadDir = 1; this.deadT = 0;
    this.moveTarget = null; this.repath = 0; this.flankSide = Math.random() < 0.5 ? -1 : 1;
    this.squad = o.squad || null;
    this.recoil = 0; this.ready = 0.6;
    this.charge = 0; this.open = 0; this.aimLaser = null;
    this.name = o.name || null;
    const lite = this.ctx.quality.name === 'mobile';
    if (this.kind === 'sentinel') {
      this.rig = buildSentinel({ lite, size: o.size || 1 });
      this.hover = 2.2;
    } else {
      this.rig = buildSoldier(this.faction, this.kind, { lite, seed: o.seed || 1 });
      this.hover = 0;
    }
    this.root = this.rig.root;
    this.entry = this.ctx.world.add(this.root, new THREE.Vector3(), { getPos: (out) => A.toWorld(this.anchor, this.pos, out, this.ctx.time.world) });
    this.snap();
  }

  dispose() { this.entry?.remove(); this.aimLaser?.remove(); if (this.cover) this.cover.taken = null; }

  /** Gruda no chão (âncora de planeta / interior). */
  snap() {
    const g = this.D.groundAt(this.anchor, this.pos);
    if (g) this.pos.copy(g);
    this.up = A.up(this.anchor, this.pos, this.up);
  }

  center(out = new THREE.Vector3()) {
    const h = this.kind === 'sentinel' ? this.hover : 1.1 - this.crouch * 0.35 - this.dead * 0.8;
    return out.copy(this.pos).addScaledVector(this.up, h);
  }
  eye(out = new THREE.Vector3()) {
    const h = this.kind === 'sentinel' ? this.hover : 1.62 - this.crouch * 0.5;
    return out.copy(this.pos).addScaledVector(this.up, h);
  }

  /** Teste de acerto (segmento local). */
  hitSegment(p0, p1) {
    if (!this.alive) return null;
    const L = p0.distanceTo(p1);
    if (this.kind === 'sentinel') {
      const c = this.center(_w);
      const eye = _u.copy(c).addScaledVector(this.fwdW || this.fwd, 0.5);
      for (const [cc, r, part] of [[eye, 0.22, 'head'], [c, 0.75, 'body']]) {
        const r1 = segSeg(p0, p1, cc, cc);
        if (r1.d < r) return { t: Math.max(0, r1.s - Math.sqrt(r * r - r1.d * r1.d) / L), part };
      }
      return null;
    }
    const cr = this.crouch;
    const head = _w.copy(this.pos).addScaledVector(this.up, 1.68 - cr * 0.5);
    const rh = segSeg(p0, p1, head, head);
    if (rh.d < 0.16) return { t: Math.max(0, rh.s - Math.sqrt(0.0256 - rh.d * rh.d) / L), part: 'head' };
    const b0 = _u.copy(this.pos).addScaledVector(this.up, 0.25);
    const b1 = _v.copy(this.pos).addScaledVector(this.up, 1.45 - cr * 0.45);
    const rb = segSeg(p0, p1, b0, b1);
    const R = 0.3 * (this.kind === 'heavy' ? 1.15 : 1);
    if (rb.d < R) return { t: Math.max(0, rb.s - Math.sqrt(R * R - rb.d * rb.d) / L), part: 'body' };
    return null;
  }

  damage(amount, info = {}) {
    if (!this.alive) return;
    if (this.state === 'dormant') this.D.wake(this);
    this.hp -= amount;
    this.aware = 1;
    this.state = 'combat';
    if (info.owner === 'player') this.lastSeen = this.D.playerPos.clone();
    // reação: inclina na direção do impacto
    const d = info.dir ? info.dir.clone() : new THREE.Vector3();
    const right = _w.crossVectors(this.fwd, this.up).normalize();
    const k = Math.min(1, amount / 40);
    this.hitX.v += -d.dot(this.fwd) * 6 * k - 2 * k;
    this.hitZ.v += d.dot(right) * 6 * k;
    this.suppress = Math.min(1, this.suppress + 0.5);
    if (this.rig.mat) { this.rig.mat.userData.U.flash.value = 0.25; this.flashT = 0.08; }
    if (this.hp <= 0) this.die(info);
    else if (Math.random() < 0.25) this.D.bark(this, 'hurt');
  }
  die(info) {
    this.alive = false; this.state = 'dead'; this.deadT = 0;
    const d = info.dir || new THREE.Vector3();
    const right = _w.crossVectors(this.fwd, this.up).normalize();
    this.deadDir = d.dot(this.fwd) > 0 ? 1 : -1;
    this.deadSide = d.dot(right);
    if (this.cover) { this.cover.taken = null; this.cover = null; }
    this.aimLaser?.remove(); this.aimLaser = null;
    this.D.onDeath(this, info);
  }

  // ─── lógica (passo fixo) ──────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    const D = this.D;
    if (!this.alive) {
      this.deadT += dt;
      this.dead = Math.min(1, this.deadT / (this.kind === 'sentinel' ? 1.2 : 0.75));
      if (this.kind === 'sentinel' && this.hover > 0.4) this.hover = Math.max(0.4, this.hover - dt * 3);
      return;
    }
    this.up = A.up(this.anchor, this.pos, this.up);
    if (this.hold) {
      // pose congelada (cenas/fotos): só molas e respiração
      for (const h of [this.hitX, this.hitZ]) { h.v += (-h.x * 90 - h.v * 12) * dt; h.x += h.v * dt; }
      this.speed = this.holdSpeed || 0; this.phase += dt * this.speed * 2.0;
      return;
    }
    const P = D.playerPos;           // local (pés do jogador)
    const toP = _v.copy(P).sub(this.pos);
    const distP = toP.length();
    const toPdir = toP.divideScalar(distP || 1).clone();
    // percepção
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.25 + Math.random() * 0.15;
      this.los = D.lineOfSight(this.eye(new THREE.Vector3()), D.playerEye, this.anchor);
    }
    const flat = toPdir.clone().addScaledVector(this.up, -toPdir.dot(this.up)).normalize();
    const facing = flat.dot(this.fwd);
    if (D.playerAlive && this.los && distP < this.S.range * 1.6) {
      const cone = this.state === 'combat' ? 1 : facing > 0.2 ? 1 : 0.25;
      const gain = cone * (1.4 - distP / (this.S.range * 1.6)) * (D.playerStealth ? 0.5 : 1);
      this.aware = Math.min(1, this.aware + gain * dt * (this.state === 'combat' ? 3 : 0.9));
      this.lastSeen = P.clone();
    } else this.aware = Math.max(this.state === 'combat' ? 0.5 : 0, this.aware - dt * 0.05);
    const prev = this.state;
    // sentinela adormecida: desperta com o jogador perto ou com dano
    if (this.state === 'dormant') {
      this.open = damp(this.open, 0, 2, dt); this.charge = 0;
      if (distP < 32 && D.playerAlive) { this.state = 'combat'; this.aware = 1; D.wake(this); }
      else return;
    }
    if (this.aware >= 1 || (this.state !== 'combat' && D.alarm)) this.state = 'combat';
    else if (this.aware > 0.3 && this.state === 'idle') this.state = 'alert';
    if (prev !== 'combat' && this.state === 'combat') { D.raiseAlarm(this); D.bark(this, 'spot'); this.fireT = 0.4 + Math.random() * 0.8; }
    this.suppress = Math.max(0, this.suppress - dt * 0.4);

    if (this.kind === 'sentinel') this.thinkSentinel(dt, P, toPdir, distP, flat);
    else this.thinkSoldier(dt, P, toPdir, distP, flat);
    // integra movimento
    if (this.moveTarget) {
      const to = _w.copy(this.moveTarget).sub(this.pos);
      to.addScaledVector(this.up, -to.dot(this.up));
      const dd = to.length();
      if (dd > 0.25) {
        const sp = this.runMode ? this.S.run : this.S.speed;
        const want = to.divideScalar(dd).multiplyScalar(Math.min(sp, dd * 2.5));
        // separação dos colegas
        for (const o of D.enemies) {
          if (o === this || !o.alive) continue;
          const s = _u.copy(this.pos).sub(o.pos); const l = s.length();
          if (l < 1.4 && l > 1e-3) want.addScaledVector(s.divideScalar(l), (1.4 - l) * 2.5);
        }
        this.vel.lerp(want, 1 - Math.exp(-8 * dt));
      } else { this.vel.multiplyScalar(Math.exp(-10 * dt)); this.moveTarget = this.arrive ? (this.arrive(), null) : null; }
    } else this.vel.multiplyScalar(Math.exp(-10 * dt));
    this.pos.addScaledVector(this.vel, dt);
    // colisão com o cenário (caixas)
    D.pushOut(this);
    this.snap();
    this.speed = this.vel.length();
    this.phase += dt * this.speed * (this.speed > 3 ? 2.0 : 2.6);
    // frente: para onde anda, ou para o alvo em combate
    let face = null;
    if (this.state === 'combat' && this.lastSeen && (this.peek || !this.cover || this.speed < 1 || this.kind === 'sentinel')) face = flat;
    else if (this.speed > 0.4) face = _u.copy(this.vel).normalize();
    if (face) {
      const f = face.clone().addScaledVector(this.up, -face.dot(this.up));
      if (f.lengthSq() > 1e-6) { f.normalize(); this.fwd.lerp(f, 1 - Math.exp(-(this.state === 'combat' ? 8 : 4) * dt)).normalize(); }
    }
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up)).normalize();
    // mira (relativa ao tronco)
    const aimP = this.lastSeen && this.state === 'combat' ? Math.asin(clamp(toPdir.dot(this.up), -1, 1)) : 0;
    this.aimPitch = damp(this.aimPitch, aimP, 8, dt);
    const right = _u.crossVectors(this.fwd, this.up);
    this.aimYaw = damp(this.aimYaw, this.state === 'combat' ? clamp(-Math.atan2(flat.dot(right), flat.dot(this.fwd)), -0.6, 0.6) : 0, 8, dt);
    // molas de reação
    for (const h of [this.hitX, this.hitZ]) { h.v += (-h.x * 90 - h.v * 12) * dt; h.x += h.v * dt; }
    this.recoil = damp(this.recoil, 0, 18, dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.rig.mat.userData.U.flash.value = 0; }
  }

  thinkSoldier(dt, P, toPdir, distP, flat) {
    const D = this.D;
    this.runMode = false;
    if (this.state === 'idle') {
      // patrulha curta ao redor do posto
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = 4 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
        const t1 = _w.crossVectors(this.up, this.fwd).normalize();
        this.moveTarget = this.home.clone().addScaledVector(this.fwd, Math.cos(a) * r).addScaledVector(t1, Math.sin(a) * r);
      }
      this.ready = damp(this.ready, 0.35, 3, dt);
      this.crouch = damp(this.crouch, 0, 5, dt);
      return;
    }
    if (this.state === 'alert') {
      this.ready = damp(this.ready, 0.9, 4, dt);
      if (this.lastSeen && !this.moveTarget) { this.moveTarget = this.pos.clone().lerp(this.lastSeen, 0.3); }
      return;
    }
    // ── combate ──
    this.ready = damp(this.ready, 1, 6, dt);
    this.coverT -= dt;
    // cobertura comprometida? (jogador do lado de trás)
    if (this.cover) {
      const toPc = _w.copy(P).sub(this.cover.pos).normalize();
      if (toPc.dot(this.cover.normalL) < 0.15 || distP < 4) { this.cover.taken = null; this.cover = null; this.coverT = 0; }
    }
    const lowHp = this.hp < this.maxHp * 0.35;
    if (!this.cover && this.coverT <= 0 && this.kind !== 'heavy') {
      this.coverT = 1.5 + Math.random();
      const c = D.pickCover(this, P, lowHp);
      if (c) {
        this.cover = c; c.taken = this;
        this.moveTarget = c.pos.clone(); this.runMode = true; this.inCover = false;
        this.arrive = () => { this.inCover = true; this.peekT = 0.4 + Math.random() * 0.8; this.peek = false; };
      }
    }
    if (this.cover && this.moveTarget) this.runMode = true;
    if (this.cover && this.inCover && !this.moveTarget) {
      // ciclo: espia e atira / esconde
      this.peekT -= dt;
      if (this.peekT <= 0) {
        this.peek = !this.peek;
        this.peekT = this.peek ? 1.3 + Math.random() * 1.6 : 0.9 + Math.random() * 1.3 + this.suppress * 2;
        if (this.peek) this.burstLeft = 0;
      }
      const lowCover = (this.cover.height || 1.1) < 1.4;
      this.crouch = damp(this.crouch, this.peek ? (lowCover ? 0.15 : 0) : 1, 9, dt);
      if (this.peek && this.los) this.shoot(dt, P, distP);
      // granada se o jogador está parado atrás de algo
      if (!this.peek && D.canGrenade(this) && distP > 8 && distP < 30 && Math.random() < dt * 0.06) this.throwGrenade(P);
    } else if (!this.cover || this.kind === 'heavy') {
      // sem cobertura: avança/flanqueia mantendo distância
      this.crouch = damp(this.crouch, 0, 6, dt);
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = 1.8 + Math.random() * 1.5;
        const want = this.kind === 'heavy' ? 14 : 20;
        const side = _w.crossVectors(this.up, flat).normalize().multiplyScalar(this.flankSide * (4 + Math.random() * 6));
        const tgt = P.clone().addScaledVector(flat, -want).add(side);
        this.moveTarget = this.pos.clone().lerp(tgt, 0.5);
        if (Math.random() < 0.3) this.flankSide *= -1;
      }
      if (this.los) this.shoot(dt, P, distP);
    } else {
      // correndo para a cobertura: atira de vez em quando
      this.crouch = damp(this.crouch, 0, 6, dt);
      if (this.los && Math.random() < 0.3) this.shoot(dt, P, distP, 0.5);
    }
    // pouca vida: recua para longe
    if (lowHp && !this.retreated && Math.random() < dt * 0.3) {
      this.retreated = true;
      if (this.cover) { this.cover.taken = null; this.cover = null; }
      this.moveTarget = this.pos.clone().addScaledVector(flat, -12); this.runMode = true; this.coverT = 2.5;
    }
  }

  shoot(dt, P, distP, mul = 1) {
    this.fireT -= dt;
    if (this.fireT > 0 || distP > this.S.range * 1.5) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = this.S.burst[0] + Math.floor(Math.random() * (this.S.burst[1] - this.S.burst[0] + 1));
    }
    this.burstLeft--;
    this.fireT = this.burstLeft > 0 ? this.S.rate : 0.7 + Math.random() * 1.1 + this.suppress;
    if (Math.random() > mul) return;
    this.D.enemyFire(this, P, distP);
    this.recoil = 0.08;
  }

  throwGrenade(P) {
    this.D.enemyGrenade(this, P);
    this.D.bark(this, 'grenade');
  }

  thinkSentinel(dt, P, toPdir, distP, flat) {
    const D = this.D;
    if (this.state !== 'combat') {
      this.open = damp(this.open, 0, 3, dt); this.charge = damp(this.charge, 0, 3, dt);
      this.repath -= dt;
      if (this.repath <= 0) { this.repath = 5 + Math.random() * 5; const a = Math.random() * 6.28; const t1 = _w.crossVectors(this.up, this.fwd).normalize(); this.moveTarget = this.home.clone().addScaledVector(this.fwd, Math.cos(a) * 5).addScaledVector(t1, Math.sin(a) * 5); }
      return;
    }
    // órbita ao redor do jogador a 16–28 m
    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 2 + Math.random() * 2;
      const want = 20;
      const side = _w.crossVectors(this.up, flat).normalize().multiplyScalar(this.flankSide * 8);
      this.moveTarget = P.clone().addScaledVector(flat, -want).add(side);
      if (Math.random() < 0.4) this.flankSide *= -1;
      this.runMode = distP > 30;
    }
    this.fireT -= dt;
    if (this.fireT <= 0 && this.los && distP < this.S.range) {
      // carrega (telegrafado) e dispara
      this.charge = Math.min(1, this.charge + dt / 1.3);
      this.open = damp(this.open, 1, 5, dt);
      if (!this.aimLaser) this.aimLaser = D.aimLaser(this);
      if (this.charge >= 1) {
        D.sentinelBeam(this, P);
        this.charge = 0; this.fireT = this.S.rate + Math.random() * 1.5;
        this.aimLaser?.remove(); this.aimLaser = null;
      }
    } else {
      this.charge = Math.max(0, this.charge - dt * 0.5);
      this.open = damp(this.open, this.state === 'combat' ? 0.35 : 0, 3, dt);
      if (this.aimLaser && !this.los) { this.aimLaser.remove(); this.aimLaser = null; }
    }
  }

  // ─── visual (frame) ───────────────────────────────────────────────────
  frame(dt) {
    const t = this.ctx.time.world;
    // orientação de mundo: âncora × base local (frente, cima)
    quatFromFwdUp(this.fwd, this.up, _q);
    const aq = this.anchor.kind === 'body' ? this.anchor.body.rotationAt(t, _q2) : this.anchor.kind === 'frame' ? _q2.copy(this.anchor.frame.quat) : _q2.identity();
    this.root.quaternion.copy(aq).multiply(_q);
    this.fwdW = this.fwd;
    if (this.kind === 'sentinel') {
      const dorm = this.state === 'dormant';
      this.wakeK = damp(this.wakeK ?? (dorm ? 0 : 1), dorm ? 0 : 1, 1.5, dt);
      poseSentinel(this.rig, { t: this.t * (0.2 + this.wakeK * 0.8), open: this.open, charge: this.charge, dead: this.dead });
      this.rig.mat.userData.U.glow.value *= 0.15 + this.wakeK * 0.85;
      this.hover = this.alive ? 0.5 + this.wakeK * 1.7 : this.hover;
      this.rig.body.position.y += this.hover;
      if (this.dead > 0) { this.rig.body.rotation.x = this.dead * 0.8; this.rig.body.rotation.z = this.dead * 0.5 * this.deadDir; }
      // aponta o "olho" para o alvo (inclinação)
      else this.rig.body.rotation.x = this.aimPitch;
      return;
    }
    poseSoldier(this.rig, {
      t: this.t, speed: this.alive ? this.speed : 0, phase: this.phase, crouch: this.alive ? this.crouch : 0,
      aimPitch: this.aimPitch, aimYaw: this.aimYaw, hitX: this.hitX.x, hitZ: this.hitZ.x, ready: this.ready, recoil: this.recoil,
    });
    if (this.dead > 0) {
      // queda: gira em torno dos pés para trás/frente e de lado, joelhos dobram
      const k = this.dead;
      const e = k * k;
      this.rig.hips.rotation.x += this.deadDir * e * 1.45;
      this.rig.hips.rotation.z += (this.deadSide || 0.3) * e * 0.5;
      this.rig.hips.position.y = this.rig.hipH * (1 - e * 0.82);
      this.rig.spine.rotation.x += this.deadDir * e * 0.3;
      this.rig.gun.position.y -= e * 0.3;
      this.rig.mat.userData.U.glow.value = Math.max(0.0, 1 - k * 1.5);
      for (const s of ['L', 'R']) { this.rig.thighs[s].rotation.x += e * 0.6 * this.deadDir; this.rig.shins[s].rotation.x -= e * 0.8; }
    }
    void dt;
  }
}
