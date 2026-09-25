// Base comum de jogador/CPU: posição da raquete (jogo), pose visual da
// raquete (backswing, follow-through por tipo de golpe), corpo seguindo.
import * as THREE from 'three';
import { TY, L, clamp, lerp, damp } from './const.js';

const _v = new THREE.Vector3();

const FOLLOW = {
  loop:  { f: 0.22, u: 0.32, r: -0.26, pitch: 0.7, dur: 0.38 },
  drive: { f: 0.26, u: 0.12, r: -0.22, pitch: 0.35, dur: 0.33 },
  smash: { f: 0.32, u: -0.22, r: -0.3, pitch: 0.6, dur: 0.36 },
  block: { f: 0.08, u: 0.02, r: -0.04, pitch: 0.15, dur: 0.22 },
  push:  { f: 0.16, u: -0.02, r: -0.05, pitch: -0.7, dur: 0.3 },
  chop:  { f: 0.14, u: -0.32, r: -0.08, pitch: -0.8, dur: 0.4 },
  lob:   { f: 0.1, u: 0.36, r: -0.1, pitch: -0.3, dur: 0.4 },
  flick: { f: 0.18, u: 0.16, r: -0.2, pitch: 0.4, dur: 0.28 },
  serve: { f: 0.16, u: -0.06, r: -0.16, pitch: -0.3, dur: 0.35 },
};
const BACK = {
  loop: { f: -0.2, u: -0.14, r: 0.1, pitch: 0.45 },
  drive: { f: -0.18, u: -0.04, r: 0.1, pitch: 0.3 },
  smash: { f: -0.2, u: 0.22, r: 0.12, pitch: 0.45 },
  block: { f: -0.04, u: 0, r: 0, pitch: 0.15 },
  push: { f: -0.08, u: 0.06, r: 0.02, pitch: -0.6 },
  chop: { f: -0.08, u: 0.2, r: 0.04, pitch: -0.7 },
  lob: { f: -0.08, u: -0.1, r: 0.04, pitch: -0.3 },
  flick: { f: -0.06, u: -0.04, r: 0.06, pitch: 0.3 },
};

export class Striker {
  constructor(side, paddle, char) {
    this.side = side;
    this.sign = side === 0 ? 1 : -1;       // lado do jogador: z > 0
    this.paddle = paddle;
    this.char = char;
    this.pad = new THREE.Vector3(0, TY + 0.2, this.sign * (L + 0.4));   // posição de jogo
    this.padPrev = this.pad.clone();
    this.padVel = new THREE.Vector3();
    this.vis = new THREE.Vector3();
    this.forehand = true;
    this.follow = null;          // {kind, t}
    this.readyKind = 'drive';    // tipo previsto p/ backswing
    this.ttc = null;             // tempo até o contato (s)
    this.body = char.pos;
    this.bodyVel = char.vel;
    this.moveSpeed = 5;
    this.holdBall = false;
  }

  // posição "de descanso" do corpo relativa à raquete
  bodyTarget(out) {
    const r = this.sign; // eixo "direita" = (sign,0,0)
    const off = this.forehand ? -0.36 : 0.2;
    out.set(this.pad.x + r * off, 0, this.pad.z + this.sign * 0.42);
    return out;
  }

  startFollow(kind) { this.follow = { kind, t: 0 }; }

  updateHand(ballX) {
    // forehand/backhand com histerese em relação ao corpo
    const rel = (ballX - this.body.x) * this.sign;
    if (this.forehand && rel < -0.12) this.forehand = false;
    else if (!this.forehand && rel > 0.02) this.forehand = true;
  }

  moveBody(dt, maxSpeed, accel = 18) {
    const tgt = this.bodyTarget(_v);
    const dx = tgt.x - this.body.x, dz = tgt.z - this.body.z;
    const d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 0.005) {
      const sp = Math.min(maxSpeed, d * 7);
      vx = dx / d * sp; vz = dz / d * sp;
    }
    this.bodyVel.x = damp(this.bodyVel.x, vx, accel, dt);
    this.bodyVel.z = damp(this.bodyVel.z, vz, accel, dt);
    this.body.x += this.bodyVel.x * dt;
    this.body.z += this.bodyVel.z * dt;
    // nunca entra na mesa
    if (Math.abs(this.body.z) < L + 0.22) this.body.z = this.sign * (L + 0.22);
  }

  /** Calcula a pose visual da raquete e atualiza o personagem */
  pose(dt, t, lookAt, extra = {}) {
    const s = this.sign;
    const F = { x: 0, z: -s };             // frente
    const Rx = s;                           // direita (x)
    const hand = this.forehand ? 1 : -1;
    let ox = 0, oy = 0, oz = 0, pitch = 0.1, roll = 0.8;

    // backswing antecipando o contato
    if (this.ttc != null && this.ttc < 0.42 && this.ttc > 0) {
      const a = Math.sin(Math.PI * clamp(1 - this.ttc / 0.42, 0, 1));
      const B = BACK[this.readyKind] || BACK.drive;
      ox += Rx * B.r * hand * a; oy += B.u * a; oz += F.z * B.f * a;
      pitch = lerp(pitch, B.pitch, a);
    }
    // follow-through
    if (this.follow) {
      const Fo = FOLLOW[this.follow.kind] || FOLLOW.drive;
      this.follow.t += dt;
      const k = this.follow.t / Fo.dur;
      if (k >= 1) this.follow = null;
      else {
        const a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * (k < 0.45 ? 1 : 1 - (k - 0.45) * 0.8);
        ox += Rx * Fo.r * hand * a; oy += Fo.u * a; oz += F.z * Fo.f * a;
        pitch = lerp(pitch, Fo.pitch, Math.min(1, k * 3));
        roll += 0.3 * a;
      }
    }
    this.vis.set(this.pad.x + ox, this.pad.y + oy, this.pad.z + oz);
    const g = this.paddle.group;
    g.position.copy(this.vis);
    g.rotation.order = 'YXZ';
    let yaw = s > 0 ? Math.PI : 0;
    if (!this.forehand) yaw += Math.PI;
    // leve orientação lateral para o alvo
    yaw += clamp(this.pad.x * 0.2, -0.3, 0.3) * s;
    g.rotation.set(this.forehand ? pitch : -pitch, yaw, roll);
    if (this.holdBall) g.rotation.set(-0.2, yaw, 0.5);

    // personagem
    this.char.lookAt.copy(lookAt);
    this.char.update(dt, t, this.paddle.getGrip(), {
      swing: this.follow ? 1 - this.follow.t / 0.4 : 0,
      crouch: extra.crouch ?? 0.08,
      lean: extra.lean ?? 0.28,
      stance: extra.stance ?? 0.22,
    });
  }
}
