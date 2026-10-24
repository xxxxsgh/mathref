// ═══════════════════════════════════════════════════════════════════════════
// J. Controles do jogador humano: botões contextuais, buffer de comando,
// carga de força, passe/chute de primeira e troca automática de jogador.
//
// Recebe um "retrato" abstrato da entrada a cada passo (input.js monta a
// partir de teclado, toque ou controle):
//   { mx, my,                     joystick (−1..1; y para cima)
//     held:   { pass, shoot, dribble, sprint, through, lob, toe, placed, chip },
//     pressN: { nome: contador }, contadores de toques (não perde toque curto)
//     shotType: 'normal'|'colocado'|'cavadinha' (seletor da tela de toque) }
// ═══════════════════════════════════════════════════════════════════════════
import { CONFIG } from '../config.js';
import { GEO } from './ball.js';
import { DEG, angDiff, clamp } from './math.js';
import { doPass, doShoot, doSlide, doTackle, feint, pickPassTarget, solePull } from './actions.js';
import { intercept, keeperThrow } from './ai.js';
import { footPoint } from './players.js';

const CT = CONFIG.controls;
const ATTACK_BUTTONS = ['pass', 'shoot', 'through', 'lob'];

export class HumanController {
  constructor(M, team) {
    this.M = M;
    this.team = team;
    this.cp = M.players.find((p) => p.team === team && p.onCourt && p.role === 'PIVO') || M.players.find((p) => p.team === team && p.onCourt && !p.isGK);
    this.lastPress = {};
    this.lastHeld = {};
    this.charge = null; // {btn, kind, t}
    this.pending = null; // ação esperando ser possível (buffer)
    this.dribbleDown = null;
    this.gkManual = false;
    this.switchT = 0;
    this.preview = null;
    this.dir = null; // direção do joystick no mundo (rad) ou null
  }

  // ── entrada → mundo ─────────────────────────────────────────────────────
  // A câmera fica na lateral z+ olhando para −z: direita da tela = +x e
  // "para cima" na tela = −z.
  readStick(input) {
    const mx = input.mx || 0, my = input.my || 0;
    const m = Math.hypot(mx, my);
    if (m < 0.18) return { dir: null, mag: 0 };
    return { dir: Math.atan2(-my, mx), mag: clamp(m, 0, 1) };
  }

  pressed(input, name) {
    const n = input.pressN?.[name] ?? 0;
    const was = this.lastPress[name] ?? 0;
    return n > was;
  }

  update(dt, input) {
    const M = this.M;
    input = input || { mx: 0, my: 0, held: {}, pressN: {} };
    const held = input.held || {};
    const st = this.readStick(input);
    this.dir = st.dir;

    if (!this.cp || !this.cp.onCourt) this.autoSwitch(true);
    const cp = this.cp;
    if (!cp) return;

    // ── botões que não dependem de contexto ──
    if (this.pressed(input, 'gk')) {
      this.gkManual = !this.gkManual;
      const gk = M.keeperOf(this.team);
      if (this.gkManual && gk) this.setCp(gk);
      else this.autoSwitch(true);
      M.say(this.gkManual ? 'Controle: goleiro' : 'Controle: linha', 1);
    }
    if (this.pressed(input, 'sub')) {
      if (!M.substitute(this.team)) M.say('Sem reserva mais descansado', 1.2);
    }

    // ── movimento ──
    const restart = M.phase === 'restart' && M.restart;
    const iAmTaker = restart && M.restart.taker === this.cp;
    const holding = this.cp.isGK && this.cp.state === 'hold';
    const c = this.cp;
    if (iAmTaker || holding) {
      c.intent.mag = 0;
      c.intent.sprint = false;
      c.intent.face = st.dir;
      if (holding && !iAmTaker && st.dir != null) {
        // goleiro com a bola pode andar dentro da área
        c.intent.dx = Math.cos(st.dir);
        c.intent.dz = Math.sin(st.dir);
        c.intent.mag = st.mag * 0.5;
      }
    } else {
      if (st.dir != null) {
        c.intent.dx = Math.cos(st.dir);
        c.intent.dz = Math.sin(st.dir);
      }
      c.intent.mag = st.mag;
      c.intent.sprint = !!held.sprint;
      c.intent.face = null;
    }

    // ── contexto: com ou sem bola ──
    const attack = this.attackContext();

    // ── carga (passe, chute, profundidade, alto) ──
    for (const btn of ATTACK_BUTTONS) {
      if (this.pressed(input, btn)) {
        if (attack) {
          this.charge = { btn, kind: btn, t: 0 };
        } else if (btn === 'pass') {
          this.manualSwitch();
        } else if (btn === 'shoot') {
          this.queue({ type: 'tackle' });
        }
      }
    }
    if (this.charge) {
      this.charge.t += dt;
      c.charge = { kind: this.charge.kind, power: this.chargePower(), over: this.chargeOver() };
      if (!held[this.charge.btn]) this.releaseCharge(input);
    } else if (c.charge && !this.charge) c.charge = null;

    // ── bico / carrinho ──
    if (this.pressed(input, 'toe')) {
      if (attack) this.queue({ type: 'shoot', kind: 'toe', power: 1, over: 0, dir: this.dir });
      else this.queue({ type: 'slide' });
    }

    // ── drible: toque = finta/sola, segurar = proteger; sem bola = pressão ──
    if (this.pressed(input, 'dribble')) this.dribbleDown = { t: 0, attack };
    if (this.dribbleDown) {
      this.dribbleDown.t += dt;
      const long = this.dribbleDown.t >= CT.holdForShield;
      if (this.dribbleDown.attack) c.shield = long && M.owner === c;
      else this.setPress(true);
      if (!held.dribble) {
        if (this.dribbleDown.attack && !long) this.queue({ type: 'dribble', dir: this.dir });
        c.shield = false;
        this.setPress(false);
        this.dribbleDown = null;
      }
    }
    c.intent.shield = c.shield;

    // ── prévia do alvo do passe (indicador sutil) ──
    this.preview = null;
    if (this.charge && this.charge.kind !== 'shoot' && M.assistFor(this.team) === 'assistido') {
      this.preview = pickPassTarget(M, c, this.dir);
    }

    // ── executa o que estiver no buffer, se já der ──
    this.tryPending();

    this.autoSwitch(false, dt);
    this.lastPress = { ...(input.pressN || {}) };
    this.lastHeld = { ...held };
  }

  chargePower() {
    const ch = this.charge;
    if (!ch) return 0;
    const T = ch.kind === 'shoot' ? CONFIG.shot.chargeTime : CONFIG.pass.chargeTime;
    return clamp(ch.t / T, 0, 1);
  }

  chargeOver() {
    const ch = this.charge;
    if (!ch || ch.kind !== 'shoot') return 0;
    return Math.max(0, ch.t - CONFIG.shot.chargeTime);
  }

  releaseCharge(input) {
    const ch = this.charge;
    this.charge = null;
    this.cp.charge = null;
    const T = ch.kind === 'shoot' ? CONFIG.shot.chargeTime : CONFIG.pass.chargeTime;
    const power = clamp(ch.t / T, 0, 1);
    if (ch.kind === 'shoot') {
      const held = input.held || {};
      let kind = 'normal';
      if (held.placed || input.shotType === 'colocado') kind = 'placed';
      if (held.chip || input.shotType === 'cavadinha') kind = 'chip';
      this.queue({ type: 'shoot', kind, power, over: Math.max(0, ch.t - T), dir: this.dir });
    } else {
      const kind = ch.kind === 'pass' ? 'ground' : ch.kind;
      // toque curto = passe suave
      const p = ch.t < CONFIG.pass.tapTime ? 0.18 : power;
      this.queue({ type: 'pass', kind, power: p, dir: this.dir });
    }
  }

  /** Buffer: guarda a ação por 0,15 s (ou até a bola chegar, se vem para mim). */
  queue(action) {
    const M = this.M;
    const incoming = this.ballComing(this.cp);
    const kick = action.type === 'pass' || action.type === 'shoot';
    // conduzindo, a bola fica solta entre os toques: o chute/passe sai no
    // próximo toque em vez de ser engolido
    const dribbling = M.owner === this.cp;
    action.until = M.time + (kick && (incoming || dribbling) ? 1.2 : CT.buffer);
    action.firstTime = incoming && M.owner !== this.cp;
    this.pending = action;
    this.tryPending();
  }

  ballComing(p) {
    const M = this.M;
    if (M.owner) return false;
    if (M.pass && M.pass.to === p) return true;
    const b = M.ball;
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp < 2 || d > 14) return d < 1.4;
    return (b.vel.x * dx + b.vel.z * dz) / (sp * d) > 0.93;
  }

  attackContext() {
    const M = this.M, c = this.cp;
    if (M.owner === c) return true;
    if (M.phase === 'restart' && M.restart && M.restart.taker === c) return true;
    if (c.isGK && c.state === 'hold') return true;
    if (M.owner && M.owner.team === this.team) return true;
    if (!M.owner) {
      if (this.ballComing(c)) return true;
      const d = Math.hypot(M.ball.pos.x - c.pos.x, M.ball.pos.z - c.pos.z);
      if (d < 1.6) return true;
      if (M.lastTouchTeam === this.team && d < 3) return true;
    }
    return false;
  }

  canActWithBall() {
    const M = this.M, c = this.cp, b = M.ball;
    if (M.phase === 'restart' && M.restart && M.restart.taker === c) return true;
    if (c.isGK && c.state === 'hold') return true;
    if (M.phase !== 'play') return false;
    if (M.owner !== c || (c.state !== 'normal' && c.state !== 'feint')) return false;
    const f = footPoint(c, 0.3);
    return Math.hypot(b.pos.x - f.x, b.pos.z - f.z) < 0.9 && b.pos.y < 0.5;
  }

  tryPending() {
    const a = this.pending;
    if (!a) return false;
    const M = this.M;
    if (M.time > a.until) {
      this.pending = null;
      return false;
    }
    const c = this.cp;
    switch (a.type) {
      case 'tackle':
        if (c.state === 'normal' && M.phase === 'play') {
          doTackle(M, c);
          this.pending = null;
          return true;
        }
        return false;
      case 'slide':
        if (c.state === 'normal' && M.phase === 'play') {
          doSlide(M, c);
          this.pending = null;
          return true;
        }
        return false;
      case 'dribble':
        if (M.owner === c && c.state === 'normal' && M.phase === 'play') {
          if (a.dir != null && Math.abs(angDiff(c.facing, a.dir)) <= 120 * DEG) feint(M, c, a.dir);
          else solePull(M, c);
          this.pending = null;
          return true;
        }
        return false;
      default:
        if (this.canActWithBall()) return this.execute(a);
        return false;
    }
  }

  /** Chamado pela partida quando o dono encosta na bola. */
  tryPendingWithBall() {
    return this.pending ? this.tryPending() : false;
  }

  /** Chamado quando a bola chega: passe/chute de primeira em vez de dominar. */
  tryFirstTime() {
    const a = this.pending;
    if (!a || (a.type !== 'pass' && a.type !== 'shoot') || this.M.time > a.until) return false;
    a.firstTime = true;
    return this.execute(a);
  }

  execute(a) {
    const M = this.M, c = this.cp;
    this.pending = null;
    if (c.isGK && c.state === 'hold') {
      keeperThrow(M, c, a.type === 'shoot' || a.kind === 'lob', a.dir);
      this.afterKeeperThrow();
      return true;
    }
    if (a.type === 'pass') {
      doPass(M, c, { kind: a.kind, power: a.power, dir: a.dir, firstTime: a.firstTime });
      if (M.pass && M.pass.to && !this.gkManual) this.setCp(M.pass.to);
    } else {
      // de primeira ou em giro: corpo desequilibrado
      if (a.firstTime && Math.abs(angDiff(c.facing, Math.atan2(-c.pos.z, M.attackDir(this.team) * GEO.halfL - c.pos.x))) > 90 * DEG) c.state = c.state === 'normal' ? 'offbalance' : c.state;
      doShoot(M, c, { kind: a.kind, power: a.power, over: a.over, dir: a.dir });
    }
    return true;
  }

  afterKeeperThrow() {
    this.gkManual = false;
    const M = this.M;
    if (M.pass && M.pass.to) this.setCp(M.pass.to);
    else this.autoSwitch(true);
  }

  takeKeeper(gk) {
    this.prevCp = this.cp;
    this.setCp(gk);
  }

  onRestart(r) {
    if (r.team === this.team && r.taker && (!r.taker.isGK || this.gkManual)) this.setCp(r.taker);
    else if (this.cp && this.cp.isGK && !this.gkManual) this.autoSwitch(true);
    this.pending = null;
    this.charge = null;
  }

  setCp(p) {
    if (this.cp === p) return;
    if (this.cp) {
      this.cp.shield = false;
      this.cp.charge = null;
      this.cp.intent.mag = 0;
    }
    this.cp = p;
    this.charge = null;
    this.M.emit({ type: 'switch', player: p });
  }

  setPress(on) {
    // pressão dupla: o companheiro mais perto do dono da bola ajuda
    const M = this.M;
    let best = null, bd = Infinity;
    for (const p of M.players) {
      if (p.team !== this.team || !p.onCourt || p.isGK || p === this.cp) continue;
      p.ai.press = false;
      if (!on || !M.owner || M.owner.team === this.team) continue;
      const d = Math.hypot(p.pos.x - M.owner.pos.x, p.pos.z - M.owner.pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) best.ai.press = true;
  }

  busy() {
    const c = this.cp;
    return !!this.charge || !!this.pending || (c && c.state !== 'normal') || !!(this.dribbleDown && this.dribbleDown.attack);
  }

  manualSwitch() {
    const M = this.M;
    const b = M.ball.pos;
    const list = M.players
      .filter((p) => p.team === this.team && p.onCourt && !p.isGK && p !== this.cp)
      .sort((a, c) => Math.hypot(a.pos.x - b.x, a.pos.z - b.z) - Math.hypot(c.pos.x - b.x, c.pos.z - b.z));
    if (list[0]) {
      this.gkManual = false;
      this.setCp(list[0]);
    }
  }

  /** Troca automática: posse do time, receptor do passe, ou quem defende melhor. */
  autoSwitch(force, dt = 0) {
    const M = this.M;
    if (this.gkManual && !force) return;
    if (!force && this.busy()) return;
    const own = M.owner;
    if (own && own.team === this.team && !own.isGK) {
      if (own !== this.cp) this.setCp(own);
      return;
    }
    if (own && own.isGK && own.team === this.team) return;
    if (M.phase === 'restart' && M.restart && M.restart.team === this.team && !force) return;
    if (M.pass && M.pass.team === this.team && M.pass.to && !M.pass.to.isGK) {
      if (M.pass.to !== this.cp) this.setCp(M.pass.to);
      return;
    }
    this.switchT -= dt;
    if (this.switchT > 0 && !force) return;
    this.switchT = 0.25;
    let best = null, bt = Infinity, cur = Infinity;
    const goalX = M.ownGoalX(this.team);
    for (const p of M.players) {
      if (p.team !== this.team || !p.onCourt || p.isGK || p.state === 'ground') continue;
      let t = intercept(p, M.pred).t;
      // quem está do lado do próprio gol defende melhor
      const goalSide = (p.pos.x - M.ball.pos.x) * Math.sign(goalX) > 0 ? -0.15 : 0.15;
      t += goalSide;
      if (p === this.cp) cur = t;
      if (t < bt) {
        bt = t;
        best = p;
      }
    }
    const margin = CT.autoSwitchMargin / 6.5; // ~2 m em tempo de corrida
    if (best && (force || !this.cp || !this.cp.onCourt || this.cp.isGK || bt + margin < cur)) this.setCp(best);
  }
}
