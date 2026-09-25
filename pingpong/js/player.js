// Controle do jogador: ponteiro → raquete, gesto → golpe, saque com
// lançamento e gesto, assistência de posicionamento.
import { TY, L, W, R, clamp, lerp, damp, gauss, rnd } from './const.js';
import { Striker } from './striker.js';
import { makeShot, kindFromSwing, KINDS } from './shots.js';
import { solveServe, spinVector } from './physics.js';

export class PlayerController extends Striker {
  constructor(paddle, char) {
    super(0, paddle, char);
    this.serveState = null;   // 'hold' | 'toss'
    this.pointerZ = L + 0.4;
    this.lastSwing = { x: 0, y: 0 };
    this.targetY = TY + 0.2;
  }

  reach(assist) { return 0.15 + assist * 0.045; }

  /**
   * g: game (ball, ref, input, traj, settings, legalIdx)
   */
  update(dt, g, t) {
    const inp = g.input, st = g.settings, assist = st.assist;
    const sens = st.sens;
    let tx = clamp(inp.nx * 1.45 * sens, -1.7, 1.7);
    let tz = clamp(L + 0.42 - inp.ny * 0.8 * sens, L - 0.5, L + 1.35);
    const serving = this.serveState != null;
    if (serving) tz = clamp(tz, L + 0.14, L + 0.42);

    // janela de rebatida prevista
    this.ttc = null;
    const incoming = g.ref.live && g.ref.hitter === 1 && g.win;
    if (incoming) {
      const w = g.win;
      const idx = w.cross ?? w.peak;
      if (assist > 0 && w.peak != null) {
        // auto-profundidade: vai para perto do ponto ideal (pico após o quique)
        const ideal = g.traj.z[w.peak] + 0.1;
        tz = lerp(tz, clamp(ideal, L - 0.3, L + 1.3), 0.35 + assist * 0.2);
        if (assist >= 2) tx = lerp(tx, g.traj.x[w.peak], 0.3);
      }
      if (idx != null) {
        this.ttc = g.traj.t[idx] - g.trajClock;
        // altura: a do cruzamento com o plano da raquete
        const cr = g.traj.window(0, w.from, this.pad.z).cross;
        const yi = cr != null ? g.traj.y[cr] : g.traj.y[idx];
        this.targetY = clamp(yi, TY - 0.08, TY + 0.95);
      }
    } else if (!serving) {
      this.targetY = TY + 0.22;
    }
    if (serving) this.targetY = TY + 0.15;
    // Compromisso: perto do contato a raquete trava na posição e o gesto
    // passa a valer só como swing (mira/efeito/força), sem tirar a raquete
    // do caminho da bola.
    const lockT = 0.17 + assist * 0.02;
    if (incoming && this.ttc != null && this.ttc < lockT && this.ttc > -0.12) {
      if (!this.lock) this.lock = { x: this.pad.x, z: this.pad.z };
      tx = this.lock.x; tz = this.lock.z;
    } else if (this.lock) {
      this.lock = null;
      this.release = 0.2;
    }
    const follow = this.release > 0 ? 9 : 26;
    this.release = Math.max(0, (this.release || 0) - dt);
    // velocidade da "mão"
    this.padPrev.copy(this.pad);
    this.pad.x = damp(this.pad.x, tx, follow, dt);
    this.pad.z = damp(this.pad.z, tz, follow * 0.85, dt);
    this.pad.y = damp(this.pad.y, this.targetY, 14, dt);
    this.padVel.subVectors(this.pad, this.padPrev).divideScalar(Math.max(dt, 1e-4));

    const sw = inp.velocity(140);
    this.readyKind = sw.y > 1.5 ? 'loop' : sw.y < -0.8 ? 'chop' : 'drive';

    // corpo
    this.updateHand(incoming && g.win.peak != null ? g.traj.x[g.win.peak] : this.pad.x);
    this.moveBody(dt, 7.5, 22);
    // corpo não pode ficar longe demais da raquete
    const tgt = this.bodyTarget(this._tmp || (this._tmp = this.pad.clone()));
    const ex = this.body.x - tgt.x, ez = this.body.z - tgt.z, e = Math.hypot(ex, ez);
    if (e > 0.32) { this.body.x -= ex / e * (e - 0.32); this.body.z -= ez / e * (e - 0.32); }

    // saque
    if (serving) this.updateServe(dt, g);
  }

  /** chamada a cada subpasso de física */
  tryHit(g, prevZ) {
    const b = g.ball, ref = g.ref;
    if (!ref.canHit(0)) return false;
    const reach = this.reach(g.settings.assist);
    const pz = this.pad.z;
    const crossed = prevZ < pz && b.z >= pz;
    const dx = b.x - this.pad.x, dy = b.y - this.pad.y;
    const near = Math.hypot(dx, b.z - pz, dy * 0.6) < reach * 0.8;
    if (!(crossed || near)) return false;
    if (Math.abs(dx) > reach || Math.abs(dy) > 0.28) return false;
    this.strike(g, Math.abs(dx) / reach);
    return true;
  }

  strike(g, off) {
    const b = g.ball, st = g.settings;
    const sw = g.input.velocity(110);
    const fy = sw.y * st.sens, fx = sw.x * st.sens;
    this.lastSwing = { x: fx, y: fy };
    let kind = kindFromSwing(fy, b, this.pad.z, 1);
    let power = 0.5;
    if (kind === 'smash') power = clamp((fy - 2.6) / 4 + 0.45, 0, 1);
    else if (kind === 'loop') power = clamp((fy - 1.7) / 4 + 0.25, 0, 1);
    else if (kind === 'drive') power = clamp((fy - 0.7) / 2.5, 0, 1);
    else power = clamp(Math.abs(fy) / 3, 0, 1);
    const perfect = off < 0.28;
    const quality = perfect ? 1 : clamp(1 - Math.pow(off, 1.3) * 0.85, 0, 1) * (b.y < TY + 0.02 ? 0.85 : 1);
    const aimX = clamp(fx * 0.3 + b.x * 0.18, -1.3, 1.3);
    const info = makeShot({
      ball: b, side: 0, kind, power, aimX, quality,
      spinRead: 0.38 + st.assist * 0.14,
      consistency: [1.12, 0.92, 0.75][st.assist] ?? 1,
      sidespin: clamp(-fx * 6, -40, 40),
    });
    info.perfect = perfect; info.quality = quality;
    this.startFollow(info.kind);
    this.lock = null; this.release = 0.25;
    g.onStrike(0, info);
    return info;
  }

  // ─── saque ───
  beginServe(g) {
    this.serveState = 'hold';
    this.holdBall = false;
    this.serveTimer = 0;
  }
  updateServe(dt, g) {
    const b = g.ball, ch = this.char;
    this.serveTimer += dt;
    if (this.serveState === 'hold') {
      // bola na mão esquerda, à frente do corpo
      const hx = clamp(this.body.x - this.sign * 0.2, -0.65, 0.65), hz = L + 0.16;
      b.x = hx; b.y = TY + 0.1 + Math.sin(this.serveTimer * 3) * 0.01; b.z = hz;
      b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
      ch.freeHand = ch.freeHand || this.pad.clone();
      ch.freeHand.set(b.x, b.y - R - 0.03, b.z);
      if (g.input.consumePress()) {
        this.serveState = 'toss';
        b.vy = 2.7; b.vx = 0; b.vz = 0;
        g.onToss(0);
      }
    } else if (this.serveState === 'toss') {
      if (b.vy > 0) ch.freeHand.set(b.x, Math.min(b.y - 0.05, TY + 0.35), b.z);
      else ch.freeHand = null;
      // raquete vai até a bola
      this.pad.x = damp(this.pad.x, b.x + 0.03, 10, dt);
      this.pad.z = damp(this.pad.z, b.z + 0.02, 10, dt);
      if (b.vy < 0 && b.y <= TY + 0.17) this.serve(g);
    }
  }
  serve(g) {
    const b = g.ball;
    const sw = g.input.velocity(260);
    const fy = sw.y * g.settings.sens, fx = sw.x * g.settings.sens;
    let top, side, depth, label;
    if (fy < -0.7) { top = -rnd(140, 230); side = clamp(fx * 20, -80, 80); depth = rnd(0.12, 0.45); label = 'SAQUE CORTADO'; }
    else if (fy > 0.7) { top = rnd(90, 170); side = clamp(fx * 15, -60, 60); depth = rnd(0.85, 1.0); label = 'SAQUE LONGO'; }
    else { top = rnd(10, 40); side = (fx >= 0 ? 1 : -1) * rnd(90, 170); depth = rnd(0.45, 0.8); label = 'SAQUE LATERAL'; }
    const aim = clamp(fx * 0.25, -0.95, 0.95);
    let tx = aim * (W - 0.12) + gauss() * 0.04;
    let tz = -(0.25 + depth * (L - 0.35)) + gauss() * 0.04;
    const from = { x: b.x, y: b.y, z: b.z };
    const spin = spinVector(tx - b.x, tz - b.z, top, side);
    const v = solveServe(from, spin, tx, tz, 1);
    Object.assign(b, v, spin);
    this.serveState = null;
    this.char.freeHand = null;
    this.startFollow('serve');
    g.onServe(0, { label, kmh: Math.hypot(v.vx, v.vy, v.vz) * 3.6, top, side, color: '#fde68a' });
  }
}
