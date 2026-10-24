// Física da bola escrita à mão: gravidade, quique baixo de bola de futsal,
// rolamento "preso" ao piso, efeito leve, traves/travessão e rede.
// Coordenadas em metros: x ao longo da quadra, z na largura, y para cima.
import { clamp, dist2, rand } from './util.js';

export const COURT = {
  L: 40, W: 20, HL: 20, HW: 10,
  GOAL_W: 3, GOAL_H: 2, GOAL_D: 1.0,
  AREA_R: 6, PEN: 6, PEN2: 10,
  CENTER_R: 3,
  BALL_R: 0.11, POST_R: 0.05,
};
const { HL, HW, GOAL_W, GOAL_H, GOAL_D, BALL_R: R, POST_R } = COURT;
const G = 9.81;

// Grande área do futsal: quartos de círculo de 6 m com centro nas traves,
// unidos por uma reta paralela à linha de fundo.
export function inArea(x, z, side, margin = 0) {
  const gx = side * HL;
  if (side * x > HL + 0.5) return false;
  const cz = clamp(z, -GOAL_W / 2 - 0.08, GOAL_W / 2 + 0.08);
  return dist2(x, z, gx, cz) <= COURT.AREA_R + margin;
}

export class Ball {
  constructor() { this.reset(0, 0); }

  reset(x, z) {
    this.x = x; this.y = R; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.spin = 0;
    this.owner = null;     // jogador conduzindo com o pé
    this.holder = null;    // goleiro segurando com a mão
    this.inGoal = 0;       // lado do gol em que a bola entrou (rede)
    this.lastTouch = null;
    this.trail = 0;        // intensidade do rastro de chute forte
  }

  get speed() { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }
  get free() { return !this.owner && !this.holder; }

  kick(vx, vy, vz, spin = 0) {
    this.vx = vx; this.vy = vy; this.vz = vz; this.spin = spin;
    this.owner = null; this.holder = null;
    const sp = Math.sqrt(vx * vx + vz * vz + vy * vy);
    this.trail = sp > 19 ? 1 : 0;
  }

  // Integra um passo. `events` recebe { type, ... } para som e regras.
  step(dt, events, live = true) {
    if (!this.free) return;
    const onGround = this.y <= R + 0.002;

    // Efeito: aceleração lateral proporcional à velocidade.
    const sp = this.speed;
    if (Math.abs(this.spin) > 0.01 && sp > 3) {
      const ax = -this.vz / sp, az = this.vx / sp;
      const k = this.spin * sp * (onGround ? 0.25 : 1);
      this.vx += ax * k * dt; this.vz += az * k * dt;
      this.spin *= Math.exp(-0.9 * dt);
    }

    if (!onGround || this.vy > 0) {
      this.vy -= G * dt;
      const drag = 0.012 * Math.sqrt(sp * sp + this.vy * this.vy);
      this.vx -= this.vx * drag * dt; this.vz -= this.vz * drag * dt; this.vy -= this.vy * drag * dt;
    } else if (sp > 0) {
      // Rolamento: bola de futsal (pesada, pouco quique) perde velocidade rápido.
      const dec = (1.7 + 0.055 * sp) * dt;
      const ns = Math.max(0, sp - dec);
      this.vx *= ns / sp; this.vz *= ns / sp;
    }

    const px = this.x, pz = this.z;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.trail = Math.max(0, this.trail - dt * 1.5);

    if (this.y < R) {
      this.y = R;
      if (this.vy < -1.3) {
        events.push({ type: 'bounce', v: -this.vy });
        this.vy = -this.vy * 0.42;
        this.vx *= 0.9; this.vz *= 0.9;
        this.spin *= 0.5;
      } else this.vy = 0;
    }

    this.collideGoals(events);

    if (this.inGoal) { this.netConstrain(dt); return; }
    if (!live) return;

    // Gol: bola inteira além da linha, entre as traves e sob o travessão.
    if (Math.abs(this.x) > HL + R) {
      const side = Math.sign(this.x);
      const crossZ = pz + (this.z - pz) * clamp((side * HL - px) / ((this.x - px) || 1e-6), 0, 1);
      if (Math.abs(crossZ) < GOAL_W / 2 && this.y < GOAL_H && Math.abs(px) <= HL + R + 0.3) {
        this.inGoal = side;
        events.push({ type: 'goal', side });
        events.push({ type: 'net', v: this.speed });
      } else {
        events.push({ type: 'out', where: 'end', x: side * HL, z: clamp(this.z, -HW, HW), side });
      }
    } else if (Math.abs(this.z) > HW + R) {
      events.push({ type: 'out', where: 'side', x: clamp(this.x, -HL + 0.5, HL - 0.5), z: Math.sign(this.z) * HW });
    }
  }

  collideGoals(events) {
    for (const s of [-1, 1]) {
      const gx = s * HL;
      if (Math.abs(this.x - gx) > 1.6) continue;
      // Traves (cilindros verticais)
      for (const pz of [-GOAL_W / 2, GOAL_W / 2]) {
        if (this.y > GOAL_H + R) continue;
        const dx = this.x - gx, dz = this.z - pz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < R + POST_R && d > 1e-5) this.bounceOff(dx / d, 0, dz / d, d, events, 'post');
      }
      // Travessão
      if (Math.abs(this.z) <= GOAL_W / 2 + R) {
        const cz = clamp(this.z, -GOAL_W / 2, GOAL_W / 2);
        const dx = this.x - gx, dy = this.y - GOAL_H, dz = this.z - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < R + POST_R && d > 1e-5) this.bounceOff(dx / d, dy / d, dz / d, d, events, 'post');
      }
    }
  }

  bounceOff(nx, ny, nz, d, events, kind) {
    const vn = this.vx * nx + this.vy * ny + this.vz * nz;
    const push = R + POST_R - d + 0.002;
    this.x += nx * push; this.y += ny * push; this.z += nz * push;
    if (vn >= 0) return;
    const e = 0.55 + rand(-0.08, 0.08); // variação controlada no rebote
    this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny; this.vz -= (1 + e) * vn * nz;
    this.vz += rand(-0.6, 0.6); // pequena imprevisibilidade
    this.spin = 0;
    events.push({ type: kind, v: -vn });
  }

  // Dentro do gol: a rede segura e amortece a bola.
  netConstrain(dt) {
    const s = this.inGoal;
    const back = s * (HL + GOAL_D - R);
    if (s * this.x > s * back) { this.x = back; this.vx *= -0.15; }
    if (s * this.x < HL + R) { this.x = s * (HL + R); this.vx = Math.abs(this.vx) * s * 0.2; }
    const zl = GOAL_W / 2 - R;
    if (Math.abs(this.z) > zl) { this.z = Math.sign(this.z) * zl; this.vz *= -0.2; }
    if (this.y > GOAL_H - R) { this.y = GOAL_H - R; this.vy *= -0.2; }
    const damp = Math.exp(-5 * dt);
    this.vx *= damp; this.vz *= damp;
  }
}

// Amostra a trajetória futura da bola (sem colisões) para a IA estimar
// onde interceptar. Retorna um array de {t,x,y,z}.
const _probe = new Ball();
export function sampleBallPath(ball, out, steps = 30, stepT = 0.1) {
  _probe.x = ball.x; _probe.y = ball.y; _probe.z = ball.z;
  _probe.vx = ball.vx; _probe.vy = ball.vy; _probe.vz = ball.vz;
  _probe.spin = ball.spin; _probe.owner = null; _probe.holder = null; _probe.inGoal = 0;
  const ev = [];
  out.length = 0;
  out.push({ t: 0, x: _probe.x, y: _probe.y, z: _probe.z });
  const sub = 3;
  for (let i = 1; i <= steps; i++) {
    for (let k = 0; k < sub; k++) _probe.step(stepT / sub, ev, false);
    out.push({ t: i * stepT, x: _probe.x, y: _probe.y, z: _probe.z });
  }
  return out;
}
