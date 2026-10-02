import { T } from './tuning.js';

/**
 * Movimento de câmera em primeira pessoa (por frame de render).
 *
 * Escreve por inteiro, a cada frame, os canais aditivos que são seus:
 *   player.viewOffset            bob sincronizado com os passos, lean, molas
 *   player.viewKick              roll de strafe/slide/lean, mergulho de
 *                                aterrissagem, flinch de dano, tremor
 *   player.fovFactors('move')    kick de FOV em sprint / tático / slide
 *
 * A feature `weapon` (ordem 40) roda DEPOIS e soma o recuo dela por cima do
 * viewKick que deixamos aqui (ela detecta que o canal foi reescrito).
 *
 * O bob segue a FASE DE PASSO do controlador (1 unidade = 1 pé no chão),
 * então a cabeça desce exatamente quando o som do passo toca.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** Mola amortecida 1D (x, v) integrada com sub-passos (estável em dt grande). */
class Spring {
  constructor(k, zeta) {
    this.k = k;
    this.c = 2 * Math.sqrt(k) * zeta;
    this.x = 0;
    this.v = 0;
  }
  impulse(v) {
    this.v += v;
  }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

/** Ruído suave determinístico em [-1, 1] (soma de senos incomensuráveis). */
function wob(t, s) {
  return Math.sin(t * 1.0 + s * 1.7) * 0.5 + Math.sin(t * 2.37 + s * 3.1) * 0.3 + Math.sin(t * 5.13 + s * 5.9) * 0.2;
}

export class CameraMotion {
  constructor(ctx, ctrl) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.amt = 0; // intensidade do bob (suavizada)
    this.amp = { y: 0, x: 0, roll: 0, pitch: 0 };
    this.landY = new Spring(210, 0.42);
    this.landPitch = new Spring(160, 0.5);
    this.flinchP = new Spring(120, 0.45);
    this.flinchY = new Spring(120, 0.45);
    this.flinchR = new Spring(90, 0.4);
    this.mantleRoll = 0;
    this.roll = 0;
    this.slideTilt = 0;
    this.fov = 1;
    this.trauma = 0; // tremor (explosões)
    this.t = 0;
    const bus = ctx.bus;
    bus.on('player:land', (e) => {
      const s = clamp(e?.speed || 0, 0, 16);
      if (e?.mantle) {
        this.landY.impulse(-0.35);
        return;
      }
      this.landY.impulse(-Math.min(2.6, 0.12 + s * 0.2));
      this.landPitch.impulse(-Math.min(1.1, s * 0.085));
      if (e?.hard) this.trauma = Math.min(1, this.trauma + 0.25);
    });
    bus.on('player:jump', (e) => {
      this.landY.impulse(e?.dive ? -0.5 : -0.28);
      this.landPitch.impulse(e?.dive ? -0.35 : 0.18);
    });
    bus.on('player:mantle', (e) => {
      this.landPitch.impulse(-0.5 - (e?.height || 1) * 0.15);
      this.mantleRoll = (Math.random() < 0.5 ? -1 : 1) * (e?.vault ? 0.045 : 0.03);
    });
    bus.on('player:slide', (e) => {
      if (e?.on) this.landY.impulse(-0.55);
      else this.landY.impulse(0.25);
    });
    bus.on('player:damage', (e) => {
      const a = clamp((e?.amount || 10) / 40, 0.15, 1);
      const r = () => Math.random() * 2 - 1;
      this.flinchP.impulse((0.5 + Math.random() * 0.5) * a * 0.9);
      this.flinchY.impulse(r() * a * 0.9);
      this.flinchR.impulse(r() * a * 1.1);
    });
    const boom = (e) => {
      const p = e?.point || e?.position;
      if (!p) return;
      const cam = ctx.camera.position;
      const d = Math.hypot(cam.x - (p.x ?? p[0]), cam.y - (p.y ?? p[1]), cam.z - (p.z ?? p[2]));
      const r = (e.radius ?? 6) * 4;
      this.trauma = Math.min(1, this.trauma + clamp(1 - d / r, 0, 1) * (e.intensity ?? 1));
    };
    bus.on('vfx:explosion', boom);
    bus.on('explosion', boom);
  }

  /** Tremor externo (0..1), para quem não emite eventos de explosão. */
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  frame(dt, ctx) {
    dt = Math.min(dt, 0.1);
    const p = ctx.player;
    const c = this.ctrl;
    this.t += dt;
    const ads = clamp(Number(ctx.services.weapon?.ads) || 0, 0, 1);

    // ─ estado de entrada (real ou sintético) ─
    const vx = p.velocity.x, vz = p.velocity.z;
    let hs = Math.hypot(vx, vz);
    let stance = c.stance, sprint = c.sprint, sliding = !!c.slide, grounded = p.onGround, lean = c.lean;
    let phase = c.prevStepPhase + (c.stepPhase - c.prevStepPhase) * (ctx.time.alpha ?? 1);
    // velocidade lateral no referencial do olhar (para o roll de strafe)
    let side = vx * Math.cos(p.yaw) - vz * Math.sin(p.yaw);

    // ─ bob sincronizado com o passo ─
    let A = 0, B = 0, R = 0, P = 0;
    if (grounded && !sliding && !c.mantle) {
      const k = clamp(hs / T.walk, 0, 2);
      if (stance === 'prone') {
        A = 0.006; B = 0.03; R = 0.012; P = 0.004;
      } else if (stance === 'crouch') {
        A = 0.009; B = 0.012; R = 0.005; P = 0.004;
      } else if (sprint === 2) {
        A = 0.03; B = 0.017; R = 0.011; P = 0.009;
      } else if (sprint === 1) {
        A = 0.023; B = 0.014; R = 0.008; P = 0.007;
      } else {
        A = 0.013; B = 0.009; R = 0.004; P = 0.004;
      }
      const m = (stance === 'prone' ? clamp(hs / T.prone, 0, 1) : Math.min(1, k)) * (1 - 0.8 * ads);
      A *= m; B *= m; R *= m; P *= m;
    }
    const rate = 7;
    this.amp.y = damp(this.amp.y, A, rate, dt);
    this.amp.x = damp(this.amp.x, B, rate, dt);
    this.amp.roll = damp(this.amp.roll, R, rate, dt);
    this.amp.pitch = damp(this.amp.pitch, P, rate, dt);
    const s = phase - Math.floor(phase); // 0 = pé tocando o chão
    // "batida": desce rápido no apoio, sobe devagar no meio da passada
    const dip = Math.pow(0.5 + 0.5 * Math.cos(TAU * s), 1.7);
    const sway = Math.sin(Math.PI * phase + 0.35); // período = 2 passos
    let oy = this.amp.y * (0.45 - dip);
    let ox = this.amp.x * sway;
    let roll = -this.amp.roll * sway;
    let pitch = -this.amp.pitch * dip;
    let yaw = this.amp.x * 0.25 * Math.cos(Math.PI * phase + 0.35);

    // ─ molas: aterrissagem/pulo/mantle/flinch ─
    oy += this.landY.step(dt) * 0.09;
    pitch += this.landPitch.step(dt) * 0.045;
    pitch += this.flinchP.step(dt) * 0.03;
    yaw += this.flinchY.step(dt) * 0.03;
    roll += this.flinchR.step(dt) * 0.035;

    // ─ roll: strafe, slide, lean, mantle ─
    const tiltSide = clamp(side / T.sprint, -1, 1);
    const rollT = -tiltSide * 0.016 * (sliding ? 0 : 1) + (sliding ? 0.055 : 0);
    this.roll = damp(this.roll, rollT, 6, dt);
    roll += this.roll;
    if (c.mantle) {
      const u = c.mantle.t / c.mantle.dur;
      roll += this.mantleRoll * Math.sin(Math.PI * clamp(u, 0, 1));
    }
    this.slideTilt = damp(this.slideTilt, sliding ? 1 : 0, sliding ? 10 : 6, dt);
    if (this.slideTilt > 1e-3) {
      // vibração do chão no slide + cabeça inclinada para frente/baixo (as
      // pernas estendidas entram no quadro, como no slide de verdade)
      const vib = this.slideTilt * clamp(hs / 8, 0.3, 1);
      oy += wob(this.t * 38, 1.3) * 0.0035 * vib;
      roll += wob(this.t * 31, 2.1) * 0.003 * vib;
      pitch -= 0.045 * this.slideTilt;
    }
    roll += -lean * T.leanRoll;
    ox += lean * T.leanDist;
    oy -= Math.abs(lean) * 0.055;

    // ─ tremor (explosões / queda dura): decai com o tempo ─
    if (this.trauma > 1e-3) {
      const sh = this.trauma * this.trauma;
      pitch += wob(this.t * 23, 4.2) * 0.022 * sh;
      yaw += wob(this.t * 21, 7.7) * 0.022 * sh;
      roll += wob(this.t * 17, 9.1) * 0.03 * sh;
      this.trauma = Math.max(0, this.trauma - dt * 0.9);
    }

    // ─ escreve os canais (por inteiro: somos donos deles) ─
    p.viewOffset.set(ox, oy, 0);
    p.viewKick.pitch = pitch;
    p.viewKick.yaw = yaw;
    p.viewKick.roll = roll;

    // ─ FOV ─
    let f = 1;
    if (sliding) f = 1.07;
    else if (sprint === 2 && hs > 5) f = 1.095;
    else if (sprint === 1 && hs > 3) f = 1.045;
    f = 1 + (f - 1) * (1 - ads);
    this.fov = damp(this.fov, f, f > this.fov ? 5.5 : 8, dt);
    if (Math.abs(this.fov - 1) < 1e-4) p.fovFactors.delete('move');
    else p.fovFactors.set('move', this.fov);
  }
}
