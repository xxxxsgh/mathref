// Animações procedurais: parado, andar, correr, pular, cair, planar, nadar.
//
// Cada pose é uma função que devolve ângulos-alvo das juntas. As poses são
// somadas por pesos (que também são suavizados), então as transições saem
// naturais sem nenhum clipe. O ciclo de passada avança pela DISTÂNCIA
// percorrida — o pé não "patina" no chão — e dispara os eventos de passo.

import { clamp, damp, lerp, smoothstep } from '../core/math.js';

const TAU = Math.PI * 2;
const JOINTS = [
  'bodyY', 'bodyPitch', 'bodyRoll', 'spineX', 'chestX', 'chestY', 'neckX', 'headX',
  'shLx', 'shLz', 'shRx', 'shRz', 'elLx', 'elRx',
  'hipLx', 'hipRx', 'hipLz', 'hipRz', 'knLx', 'knRx', 'anLx', 'anRx',
];

function zero() {
  const o = {};
  for (const k of JOINTS) o[k] = 0;
  return o;
}

export class Animator {
  constructor(hero) {
    this.hero = hero;
    this.phase = 0;
    this.time = 0;
    this.w = { idle: 1, loco: 0, jump: 0, fall: 0, glide: 0, swim: 0 };
    this.cur = zero();
    this.land = 0; // 0..1 agachamento de aterrissagem
    this.landAmount = 0;
    this.onStep = null;
    this.gliderOpen = 0;
  }

  /**
   * @param {object} s estado do jogador: speed, runBlend, grounded, vy, gliding,
   *   swimming, turnRate, accel, surface
   */
  update(dt, s) {
    this.time += dt;
    const t = this.time;

    // Pesos-alvo.
    const moving = smoothstep(0.15, 1.2, s.speed);
    const air = !s.grounded && !s.swimming;
    const target = {
      idle: !air && !s.swimming ? 1 - moving : 0,
      loco: !air && !s.swimming ? moving : 0,
      jump: air && !s.gliding && s.vy > 0 ? 1 : 0,
      fall: air && !s.gliding && s.vy <= 0 ? smoothstep(0, -6, s.vy) * 0.6 + 0.4 : 0,
      glide: s.gliding ? 1 : 0,
      swim: s.swimming ? 1 : 0,
    };
    if (air && !s.gliding && s.vy <= 0) target.jump = 1 - target.fall;
    for (const k in this.w) this.w[k] += (target[k] - this.w[k]) * damp(air || s.gliding ? 9 : 12, dt);

    // Fase da passada pela distância (duas passadas por ciclo).
    const cycleLen = lerp(1.45, 2.6, s.runBlend);
    const prev = this.phase;
    if (s.grounded || s.swimming) this.phase += (s.speed / cycleLen) * TAU * dt;
    // Eventos de passo: quando cada pé toca o chão (fase PI/2 e 3PI/2).
    if (s.grounded && s.speed > 0.4) {
      for (const at of [Math.PI / 2, (3 * Math.PI) / 2]) {
        const a = ((prev % TAU) + TAU) % TAU;
        const b = a + (this.phase - prev);
        if (a < at && b >= at) this.onStep?.(s.surface, clamp(s.speed / 8, 0.25, 1));
        if (a < at + TAU && b >= at + TAU) this.onStep?.(s.surface, clamp(s.speed / 8, 0.25, 1));
      }
    }
    this.phase %= TAU * 1000;

    const out = zero();
    const add = (pose, w) => {
      if (w < 0.001) return;
      for (const k in pose) out[k] += pose[k] * w;
    };

    add(this._idle(t), this.w.idle);
    add(this._loco(this.phase, s.runBlend, s.speed), this.w.loco);
    add(this._jump(t), this.w.jump);
    add(this._fall(t), this.w.fall);
    add(this._glide(t, s.turnRate), this.w.glide);
    add(this._swim(this.phase, t), this.w.swim);

    // Inclinação na curva (no chão) e pelo arranque/freada.
    if (!air) {
      out.bodyRoll += clamp(-s.turnRate * s.speed * 0.025, -0.25, 0.25);
      out.bodyPitch += clamp(s.accel * 0.012, -0.12, 0.15);
    }

    // Aterrissagem: agacha e volta.
    this.land = Math.max(0, this.land - dt * 3.2);
    const L = Math.sin(Math.min(1, this.land) * Math.PI * 0.5) * this.landAmount;
    out.bodyY -= 0.22 * L;
    out.hipLx -= 0.55 * L; out.hipRx -= 0.55 * L;
    out.knLx += 1.0 * L; out.knRx += 1.0 * L;
    out.anLx -= 0.45 * L; out.anRx -= 0.45 * L;
    out.spineX += 0.25 * L;

    // Suaviza tudo (absorve trocas bruscas de estado).
    const k = damp(22, dt);
    for (const j of JOINTS) this.cur[j] += (out[j] - this.cur[j]) * k;
    this._apply(dt, s);
  }

  landed(impact) {
    this.land = 1;
    this.landAmount = clamp(impact, 0.2, 1);
  }

  _idle(t) {
    const br = Math.sin(t * 1.9);
    return {
      bodyY: br * 0.006,
      spineX: 0.02 + br * 0.015,
      chestX: -0.03 + br * 0.02,
      headX: 0.05 + Math.sin(t * 0.7) * 0.03,
      chestY: Math.sin(t * 0.43) * 0.05,
      shLz: -0.1 - br * 0.02, shRz: 0.1 + br * 0.02,
      shLx: 0.03, shRx: 0.03,
      elLx: -0.18, elRx: -0.18,
      hipLz: -0.03, hipRz: 0.03,
      hipLx: 0.02, hipRx: -0.04, knLx: 0.05, knRx: 0.08,
    };
  }

  _loco(p, run, speed) {
    const sp = Math.sin(p), cp = Math.cos(p);
    const sR = Math.sin(p + Math.PI), cR = Math.cos(p + Math.PI);
    const legA = lerp(0.5, 0.85, run);
    const knee = lerp(0.7, 1.45, run);
    const armA = lerp(0.42, 0.85, run);
    const bob = lerp(0.035, 0.07, run);
    return {
      bodyY: bob * (Math.abs(cp) - 0.5),
      bodyPitch: lerp(0.05, 0.22, run),
      spineX: lerp(0.0, 0.08, run),
      chestY: sp * lerp(0.12, 0.22, run),
      headX: -lerp(0.02, 0.15, run),
      hipLx: -sp * legA, hipRx: -sR * legA,
      knLx: knee * Math.max(0, cp) ** 1.2 + 0.08, knRx: knee * Math.max(0, cR) ** 1.2 + 0.08,
      anLx: 0.25 * Math.max(0, -cp) - 0.15 * Math.max(0, cp), anRx: 0.25 * Math.max(0, -cR) - 0.15 * Math.max(0, cR),
      shLx: sp * armA, shRx: sR * armA,
      shLz: -0.12, shRz: 0.12,
      elLx: -lerp(0.35, 1.35, run) - 0.2 * Math.max(0, -sp), elRx: -lerp(0.35, 1.35, run) - 0.2 * Math.max(0, -sR),
    };
  }

  _jump(t) {
    return {
      bodyPitch: 0.05,
      hipLx: -0.95, knLx: 1.35, anLx: 0.3,
      hipRx: -0.15, knRx: 0.55, anRx: 0.2,
      shLx: -0.5, shRx: -0.3, shLz: -0.65, shRz: 0.75,
      elLx: -0.6, elRx: -0.5,
      headX: -0.1, spineX: 0.06,
    };
  }

  _fall(t) {
    const f = Math.sin(t * 9) * 0.18;
    return {
      bodyPitch: -0.05,
      hipLx: -0.35, knLx: 0.55, hipRx: 0.1, knRx: 0.35,
      hipLz: -0.12, hipRz: 0.12,
      shLx: -0.3 + f, shRx: -0.3 - f, shLz: -1.75, shRz: 1.75,
      elLx: -0.3, elRx: -0.3,
      headX: 0.25,
    };
  }

  _glide(t, turn) {
    const sway = Math.sin(t * 2.2) * 0.06;
    return {
      bodyPitch: 0.42,
      bodyRoll: clamp(-turn * 0.35, -0.45, 0.45),
      spineX: -0.08, headX: -0.35,
      shLx: -2.85, shRx: -2.85, shLz: -0.28, shRz: 0.28,
      elLx: -0.25, elRx: -0.25,
      hipLx: 0.15 + sway, hipRx: 0.25 - sway, knLx: 0.35, knRx: 0.25,
      anLx: 0.4, anRx: 0.4,
    };
  }

  _swim(p, t) {
    const s = Math.sin(p * 0.8);
    return {
      bodyPitch: 0.95, headX: -0.8, bodyY: -0.05,
      shLx: -1.6 + s * 1.2, shRx: -1.6 - s * 1.2, shLz: -0.5, shRz: 0.5,
      elLx: -0.4, elRx: -0.4,
      hipLx: s * 0.4, hipRx: -s * 0.4, knLx: 0.3, knRx: 0.3,
    };
  }

  _apply(dt, s) {
    const J = this.hero.j, c = this.cur;
    this.hero.body.position.y = c.bodyY;
    this.hero.body.rotation.set(c.bodyPitch, 0, c.bodyRoll);
    J.spine.rotation.x = c.spineX;
    J.chest.rotation.set(c.chestX, c.chestY, 0);
    J.neck.rotation.x = c.neckX;
    J.head.rotation.set(c.headX, -c.chestY * 0.6, 0);
    J.shoulderL.rotation.set(c.shLx, 0, c.shLz);
    J.shoulderR.rotation.set(c.shRx, 0, c.shRz);
    J.elbowL.rotation.x = c.elLx;
    J.elbowR.rotation.x = c.elRx;
    J.hipL.rotation.set(c.hipLx, 0, c.hipLz);
    J.hipR.rotation.set(c.hipRx, 0, c.hipRz);
    J.kneeL.rotation.x = c.knLx;
    J.kneeR.rotation.x = c.knRx;
    J.ankleL.rotation.x = c.anLx;
    J.ankleR.rotation.x = c.anRx;

    // Rabo de cavalo balança com o movimento vertical e a velocidade.
    this.hero.ponytail.rotation.x = -0.5 - clamp(s.vy * 0.05, -0.6, 0.4) - s.speed * 0.04 + Math.sin(this.time * 6) * 0.03 * s.speed * 0.2;

    // Planador abre/fecha com "pop" elástico.
    const tgt = s.gliding ? 1 : 0;
    this.gliderOpen += (tgt - this.gliderOpen) * damp(s.gliding ? 14 : 20, dt);
    const g = this.hero.glider;
    g.visible = this.gliderOpen > 0.02;
    const k = this.gliderOpen;
    const pop = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.15 : 1;
    g.scale.set(k * pop, Math.max(k, 0.01), k * pop);
    // Mantém a asa quase na horizontal mesmo com o corpo inclinado.
    g.rotation.x = -(c.bodyPitch + c.spineX + c.chestX) + 0.06;
    g.rotation.z = -c.bodyRoll * 0.5;
  }
}
