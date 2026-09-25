// IA do adversário: leitura da trajetória com erro, deslocamento com
// velocidade limitada, escolha de golpe por estilo, saque variado.
import { TY, L, W, R, clamp, lerp, damp, gauss, rnd } from './const.js';
import { Striker } from './striker.js';
import { makeShot, KINDS } from './shots.js';
import { solveServe, spinVector, topspinOf } from './physics.js';

export class CpuController extends Striker {
  constructor(paddle, char, profile) {
    super(1, paddle, char);
    this.setProfile(profile);
    this.plan = null;
    this.react = 0;
    this.serveState = null;
    this.desired = this.pad.clone();
  }
  setProfile(p) {
    this.p = p;
    this.ai = p.ai;
    this.homeZ = -(L + 0.35 + this.ai.depth * 0.6);
  }

  // chamado quando a trajetória muda (batida/quique)
  replan(g, reason) {
    if (!(g.ref.live && g.ref.hitter === 0)) { this.plan = null; return; }
    if (reason === 'hit' || reason === 'serve') { this.react = this.ai.react * rnd(0.8, 1.25); this.errScale = 1; }
    else this.errScale = 0.45;   // releitura após quique/rede: mais precisa
    this.pendingPlan = true;
  }

  computePlan(g) {
    this.pendingPlan = false;
    const w = g.win;
    if (!w || w.peak == null) { this.plan = { give: true }; return; }
    const T = g.traj, ai = this.ai;
    const b = g.ball;
    const spd = Math.hypot(b.vx, b.vy, b.vz);
    const top = Math.abs(topspinOf(b));
    const err = ai.readErr * (1 + spd / 14 + top / 300) * (this.errScale ?? 1);
    // ponto de contato: prefere a distância de jogo do estilo
    const prefZ = -(L + 0.15 + ai.depth * 0.75);
    let idx = null;
    const peakY = T.y[w.peak] - TY;
    if (peakY > 0.34 && Math.random() < ai.smash) idx = w.peak;      // espera a bola alta para o smash
    if (idx == null) {
      for (let i = w.from + 1; i <= w.end; i++) {
        if (T.z[i] <= prefZ || (i > w.peak && T.y[i] < TY + 0.14)) { idx = i; break; }
      }
    }
    if (idx == null) idx = w.last ?? w.peak;
    const x = T.x[idx] + gauss() * err;
    const z = Math.min(T.z[idx] + gauss() * err * 0.5, -L + 0.6);
    this.plan = { x, z, y: T.y[idx], idx, t: T.t[idx] };
  }

  update(dt, g, t) {
    const ai = this.ai;
    this.ttc = null;
    let dx = 0, dz = this.homeZ, dy = TY + 0.22;
    const incoming = g.ref.live && g.ref.hitter === 0;
    if (this.serveState) {
      dx = this.serveX; dz = -(L + 0.2);
      dy = TY + 0.15;
    } else if (incoming) {
      if (this.react > 0) { this.react -= dt; }
      else if (this.pendingPlan) this.computePlan(g);
      if (this.plan && !this.plan.give) {
        dx = this.plan.x; dz = this.plan.z; dy = this.plan.y;
        this.ttc = this.plan.t - g.trajClock;
        this.readyKind = this.plannedKind || 'drive';
      } else {
        dx = this.pad.x; dz = this.pad.z;
      }
    } else if (g.ref.live) {
      // volta ao centro de acordo com a própria bola
      dx = clamp(g.ball.x * 0.35, -0.4, 0.4); dz = this.homeZ;
    }
    this.desired.set(dx, dy, dz);
    this.updateHand(dx);
    // corpo persegue o ponto desejado com limite de velocidade
    this.bodyTargetFrom = this.desired;
    this.moveBody(dt, ai.move, 12);
    // a raquete só alcança até o braço
    const off = this.forehand ? -0.36 : 0.2;
    const ax = this.body.x - this.sign * off, az = this.body.z - this.sign * 0.42;
    let px = dx - ax, pz = dz - az;
    const d = Math.hypot(px, pz), rch = ai.reach;
    if (d > rch) { px *= rch / d; pz *= rch / d; }
    this.padPrev.copy(this.pad);
    this.pad.x = damp(this.pad.x, ax + px, 16, dt);
    this.pad.z = damp(this.pad.z, az + pz, 16, dt);
    this.pad.y = damp(this.pad.y, clamp(dy, TY - 0.1, TY + 0.95), 12, dt);

    if (this.serveState) this.updateServe(dt, g);
  }

  bodyTarget(out) {
    const src = this.bodyTargetFrom || this.pad;
    const off = this.forehand ? -0.36 : 0.2;
    out.set(src.x + this.sign * off, 0, src.z + this.sign * 0.42);
    return out;
  }

  tryHit(g, prevZ) {
    const b = g.ball;
    if (!g.ref.canHit(1)) return false;
    const pz = this.pad.z;
    const crossed = prevZ > pz && b.z <= pz;
    const dx = b.x - this.pad.x, dy = b.y - this.pad.y;
    const near = Math.hypot(dx, b.z - pz, dy * 0.6) < 0.1;
    if (!(crossed || near)) return false;
    if (Math.abs(dx) > 0.17 || Math.abs(dy) > 0.3) return false;
    this.strike(g, Math.abs(dx) / 0.17);
    return true;
  }

  chooseKind(g) {
    const b = g.ball, ai = this.ai;
    const h = b.y - TY;
    const inTop = topspinOf(b);
    const short = b.z > -L + 0.25;
    const r = Math.random();
    if (h > 0.3 && r < ai.smash) return 'smash';
    if (short && h < 0.2) return Math.random() < ai.aggression ? 'flick' : 'push';
    if (h < -0.04) return ai.back > 0.5 ? 'chop' : 'lob';
    if (inTop < -80) {
      if (ai.back > 0.5) return Math.random() < 0.7 ? 'chop' : 'push';
      return Math.random() < ai.aggression + 0.15 ? 'loop' : 'push';
    }
    if (ai.back > 0.5 && Math.random() < ai.back) return 'chop';
    if (Math.random() < ai.aggression) return Math.random() < 0.6 ? 'loop' : 'drive';
    return Math.random() < 0.5 ? 'block' : 'drive';
  }

  strike(g, off) {
    const ai = this.ai, b = g.ball;
    const kind = this.chooseKind(g);
    this.plannedKind = kind;
    // mira: longe do jogador, com chance pela colocação
    const px = g.player.pad.x;
    let aimX;
    const edge = 0.55 + ai.placement * 0.4;
    if (Math.random() < ai.placement) aimX = -Math.sign(px || rnd(-1, 1)) * rnd(0.45, edge);
    else aimX = rnd(-0.55, 0.55);
    const depth = Math.random() < ai.placement ? rnd(0.62, 0.8 + ai.placement * 0.12) : rnd(0.35, 0.78);
    const K = KINDS[kind];
    const want = rnd(ai.power[0], ai.power[1]);
    const power = kind === 'smash' ? clamp(0.4 + ai.aggression * 0.6, 0, 1) : clamp((want - K.speed[0]) / (K.speed[1] - K.speed[0]), 0, 1);
    const info = makeShot({
      ball: b, side: 1, kind, power, aimX, depth,
      quality: clamp(1 - off * 0.7, 0, 1),
      spinRead: ai.spinRead, consistency: ai.consistency,
      sidespin: rnd(-20, 20),
    });
    this.startFollow(info.kind);
    this.plan = null;
    g.onStrike(1, info);
  }

  // ─── saque ───
  beginServe(g) {
    this.serveState = 'hold';
    this.serveTimer = rnd(0.9, 1.6);
    this.serveX = rnd(-0.45, 0.45);
  }
  updateServe(dt, g) {
    const b = g.ball, ch = this.char;
    if (this.serveState === 'hold') {
      this.serveTimer -= dt;
      const hx = clamp(this.body.x - this.sign * 0.2, -0.65, 0.65), hz = -(L + 0.16);
      b.x = hx; b.y = TY + 0.1; b.z = hz;
      b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
      ch.freeHand = ch.freeHand || this.pad.clone();
      ch.freeHand.set(b.x, b.y - R - 0.03, b.z);
      if (this.serveTimer <= 0) {
        this.serveState = 'toss';
        b.vy = 2.7;
        g.onToss(1);
      }
    } else if (this.serveState === 'toss') {
      if (b.vy > 0) ch.freeHand.set(b.x, Math.min(b.y - 0.05, TY + 0.35), b.z);
      else ch.freeHand = null;
      this.pad.x = damp(this.pad.x, b.x - 0.03, 10, dt);
      this.pad.z = damp(this.pad.z, b.z - 0.02, 10, dt);
      if (b.vy < 0 && b.y <= TY + 0.17) this.serve(g);
    }
  }
  serve(g) {
    const b = g.ball, ai = this.ai;
    const r = Math.random();
    let top, side, depth, label;
    if (r < 0.4 + ai.back * 0.3) { top = -rnd(120, 220); side = rnd(-60, 60); depth = rnd(0.1, 0.5); label = 'Saque cortado'; }
    else if (r < 0.75) { top = rnd(0, 40); side = (Math.random() < 0.5 ? -1 : 1) * rnd(80, 170); depth = rnd(0.4, 0.8); label = 'Saque lateral'; }
    else { top = rnd(80, 170); side = rnd(-40, 40); depth = rnd(0.85, 1); label = 'Saque longo'; }
    let tx = rnd(-0.9, 0.9) * (W - 0.12) + gauss() * 0.05 * ai.consistency;
    let tz = (0.25 + depth * (L - 0.35)) + gauss() * 0.05 * ai.consistency;
    const from = { x: b.x, y: b.y, z: b.z };
    const spin = spinVector(tx - b.x, tz - b.z, top, side);
    const v = solveServe(from, spin, tx, tz, -1);
    Object.assign(b, v, spin);
    this.serveState = null;
    this.char.freeHand = null;
    this.startFollow('serve');
    g.onServe(1, { label, kmh: Math.hypot(v.vx, v.vy, v.vz) * 3.6, top, side });
  }
}
