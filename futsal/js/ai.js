// Inteligência artificial: formações (3-1, 2-2, 4-0, 1-2-1), marcação por
// zona ou individual, pressão, movimentação para receber, decisões de quem
// conduz (chutar, passar, driblar) e o goleiro (posição, saída, defesa,
// reposição com a mão). Erros plausíveis nos níveis mais baixos.
import { COURT, inArea } from './physics.js';
import { clamp, dist2, distPointSeg, angDiff, turnTowards, rand, chance, pick } from './util.js';

const { HL, HW, GOAL_W } = COURT;

export const DIFF = {
  facil: { dodge: 0.04, name: 'Fácil', react: 0.5, decide: 0.8, err: 0.06, speedMul: 0.88, tackle: 0.3, gk: 0.7, mistake: 0.16, shootQ: 0.4, restart: 1.6 },
  normal: { dodge: 0.18, name: 'Normal', react: 0.34, decide: 0.55, err: 0.035, speedMul: 0.95, tackle: 0.42, gk: 0.88, mistake: 0.07, shootQ: 0.33, restart: 1.2 },
  dificil: { dodge: 0.32, name: 'Difícil', react: 0.22, decide: 0.38, err: 0.018, speedMul: 1.0, tackle: 0.52, gk: 1.0, mistake: 0.03, shootQ: 0.29, restart: 0.9 },
  craque: { dodge: 0.48, name: 'Craque', react: 0.13, decide: 0.26, err: 0.008, speedMul: 1.04, tackle: 0.6, gk: 1.1, mistake: 0.01, shootQ: 0.26, restart: 0.7 },
};

// Posições-base (u ao longo do ataque: -1 = próprio gol, +1 = gol adversário;
// v na largura). Slots 1..4 (o slot 0 é o goleiro).
export const FORMATIONS = {
  '3-1': { def: [[-0.62, 0], [-0.46, -0.48], [-0.46, 0.48], [-0.1, 0]], att: [[-0.2, 0], [0.12, -0.72], [0.12, 0.72], [0.66, 0]] },
  '2-2': { def: [[-0.6, -0.32], [-0.6, 0.32], [-0.22, -0.42], [-0.22, 0.42]], att: [[-0.25, -0.45], [-0.25, 0.45], [0.45, -0.5], [0.5, 0.45]] },
  '4-0': { def: [[-0.52, -0.62], [-0.6, -0.2], [-0.6, 0.2], [-0.52, 0.62]], att: [[-0.05, -0.75], [-0.25, -0.25], [-0.25, 0.25], [-0.05, 0.75]], rotate: true },
  '1-2-1': { def: [[-0.66, 0], [-0.4, -0.52], [-0.4, 0.52], [-0.05, 0]], att: [[-0.32, 0], [0.18, -0.66], [0.18, 0.66], [0.6, 0.05]] },
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

export class TeamAI {
  constructor(match, team, d) {
    this.m = match; this.t = team; this.d = d;
    this.runs = new Map();
    this.marks = new Map();
    this.lastPhase = null;
    this.supT = new Map();
    this.time = 0;
  }

  orderRun(p, x, z) { this.runs.set(p.i, { x, z, until: this.m.time + 2.2 }); }

  update(dt) {
    const m = this.m, t = this.t, b = m.ball;
    this.time += dt;
    const players = m.courtPlayers(t.idx);
    const st = m.state;
    if (st === 'shootoutWait' || st === 'shootoutPause') {
      for (const p of players) if (p.isGK && b.free) this.goalkeeper(p, dt); else if (p.human < 0) { p.want.x = 0; p.want.z = 0; }
      return;
    }
    if (st === 'goal' || st === 'dead') {
      for (const p of players) {
        if (p.human >= 0 && st === 'dead') continue;
        if (st === 'goal') { p.want.x *= 0.9; p.want.z *= 0.9; p.want.sprint = false; continue; }
        const s = this.spot(p, 'def');
        this.moveTo(p, s[0], s[1], false, 0.6);
      }
      return;
    }
    // goleiro-linha da CPU: perdendo por 1 ou 2 gols no fim do 2º tempo
    if (!t.human && st === 'play' && this.d.mistake < 0.1) {
      const diff = m.teams[1 - t.idx].score - t.score;
      const want = m.half >= 2 && !m.shootout && m.clock < Math.max(25, m.halfLen * 0.2) && diff >= 1 && diff <= 2;
      if (want !== t.keeperOut) m.toggleKeeperOut(t.idx);
    }
    const holderTeam = m.holderTeam();
    const phase = holderTeam === t.idx ? 'att' : holderTeam >= 0 ? 'def' : 'loose';
    if (phase !== this.lastPhase) { this.lastPhase = phase; this.assignMarks(); }

    if (st === 'restart') { this.restart(players, dt); return; }

    // quem vai na bola
    let chaser = null, chaser2 = null;
    if (phase !== 'att') {
      let best = Infinity, second = Infinity;
      for (const p of players) {
        if (p.isGK) continue;
        if (p.state === 'fall' || p.state === 'getup') continue;
        const ip = this.intercept(p);
        const tt = ip.t + (p.human >= 0 ? 5 : 0);
        if (tt < best) { second = best; chaser2 = chaser; best = tt; chaser = p; }
        else if (tt < second) { second = tt; chaser2 = p; }
      }
      // pendência de passe para um companheiro: ele vai buscar
      const pp = m.pendingPass;
      if (pp && pp.to.team === t.idx && b.free) chaser = pp.to;
    }
    // segundo homem: pressão alta, pedido do humano ou bola perto do nosso gol
    const carrier = b.owner && b.owner.team !== t.idx ? b.owner : null;
    const nearOwnGoal = carrier && Math.abs(carrier.x - m.ownGoalX(t.idx)) < 12;
    const press2 = phase === 'def' && (t.press === 'alta' || t.callPress || nearOwnGoal);

    for (const p of players) {
      // goleiro-linha só avança com a posse; sem ela, volta correndo para o gol
      const gkActive = p.isGK && (!t.keeperOut || phase !== 'att');
      // goleiro humano só age manualmente quando está com a bola na mão
      if (p.human >= 0 && !(gkActive && b.holder !== p)) continue;
      if (gkActive) { this.goalkeeper(p, dt); continue; }
      if (b.owner === p) { this.carrier(p, dt); continue; }
      const run = this.runs.get(p.i);
      if (phase === 'loose' || phase === 'def') {
        if (p === chaser) { this.chase(p, dt, phase); continue; }
        if (press2 && p === chaser2) { this.chase(p, dt, phase, true); continue; }
        this.defend(p, phase);
        continue;
      }
      // ataque sem bola
      if (run && run.until > m.time) { this.moveTo(p, run.x, run.z, true); continue; }
      this.support(p, dt);
    }
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────
  moveTo(p, x, z, sprint = false, slow = 1) {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      p.want.x = 0; p.want.z = 0; p.want.sprint = false;
      const b = this.m.ball;
      p.facing = turnTowards(p.facing, Math.atan2(b.z - p.z, b.x - p.x), 0.12);
      return;
    }
    const k = Math.min(1, d / 1.4) * slow;
    p.want.x = dx / d * k; p.want.z = dz / d * k;
    p.want.sprint = sprint && d > 3.5;
  }

  toWorld(u, v) { return [this.t.dir * u * HL, v * HW]; }

  spot(p, phase) {
    const t = this.t, b = this.m.ball;
    const f = FORMATIONS[t.formation] || FORMATIONS['3-1'];
    let idx = p.slot - 1;
    if (idx < 0) idx = 3;
    let [u, v] = (phase === 'att' ? f.att : f.def)[idx];
    if (f.rotate && phase === 'att') {
      const k = Math.floor(this.time / 3.2);
      [u, v] = f.att[(idx + k) % 4];
    }
    const bu = (b.x * t.dir) / HL, bv = b.z / HW;
    if (phase === 'att') {
      u = clamp(u + bu * 0.3 + 0.05, -0.85, 0.85);
      v = clamp(v * 0.9 + bv * 0.22, -0.88, 0.88);
    } else {
      const shift = t.press === 'alta' ? 0.25 : t.press === 'recuo' ? -0.15 : 0;
      u = u + bu * 0.35 + shift;
      u = Math.min(u, bu - 0.08);
      u = clamp(u, -0.86, 0.7);
      v = clamp(v * 0.8 + bv * 0.35, -0.85, 0.85);
    }
    return this.toWorld(u, v);
  }

  intercept(p) {
    const path = this.m.ballPath;
    const vmax = this.m.maxSpeed(p) * 1.1;
    const react = this.d.react * 0.5;
    const maxY = p.isGK ? 2.2 : 0.9;
    if (!path.length || !this.m.ball.free) {
      const b = this.m.ball;
      return { x: b.x, z: b.z, t: dist2(p.x, p.z, b.x, b.z) / vmax };
    }
    for (const s of path) {
      if (s.y > maxY) continue;
      if (Math.abs(s.x) > HL + 0.5 || Math.abs(s.z) > HW + 0.5) break;
      const d = dist2(p.x, p.z, s.x, s.z);
      if (d <= vmax * Math.max(0, s.t - react) + 0.5) return { x: s.x, z: s.z, t: s.t };
    }
    const last = path[path.length - 1];
    return { x: clamp(last.x, -HL, HL), z: clamp(last.z, -HW, HW), t: last.t + dist2(p.x, p.z, last.x, last.z) / vmax };
  }

  opponents() { return this.m.courtPlayers(1 - this.t.idx); }

  minOppDist(x, z) {
    let m = 20;
    for (const o of this.opponents()) m = Math.min(m, dist2(o.x, o.z, x, z));
    return m;
  }

  laneClear(ax, az, bx, bz) {
    let m = 20;
    for (const o of this.opponents()) m = Math.min(m, distPointSeg(o.x, o.z, ax, az, bx, bz));
    return m;
  }

  assignMarks() {
    this.marks.clear();
    const mine = this.m.courtPlayers(this.t.idx).filter((p) => !p.isGK);
    const ownX = this.m.ownGoalX(this.t.idx);
    const opps = this.opponents().filter((o) => !o.isGK || this.m.teams[o.team].keeperOut).sort((a, c) => dist2(a.x, a.z, ownX, 0) - dist2(c.x, c.z, ownX, 0));
    const free = new Set(mine);
    for (const o of opps) {
      let best = null, bd = Infinity;
      for (const p of free) { const d = dist2(p.x, p.z, o.x, o.z); if (d < bd) { bd = d; best = p; } }
      if (best) { this.marks.set(best.i, o); free.delete(best); }
    }
  }

  // ─── Sem a bola, defendendo ───────────────────────────────────────────────
  defend(p, phase) {
    const t = this.t, m = this.m, b = m.ball;
    const ownX = m.ownGoalX(t.idx);
    if (t.marking === 'individual' && phase === 'def') {
      const o = this.marks.get(p.i);
      if (o && o.onCourt) {
        const dx = ownX - o.x, dz = 0 - o.z, d = Math.hypot(dx, dz) || 1;
        // entre o adversário e o gol, puxando um pouco para a bola
        const tx = o.x + dx / d * 1.4 + (b.x - o.x) * 0.1, tz = o.z + dz / d * 1.4 + (b.z - o.z) * 0.1;
        this.moveTo(p, tx, tz, dist2(p.x, p.z, tx, tz) > 4);
        return;
      }
    }
    const s = this.spot(p, phase === 'loose' ? (m.possTeam() === t.idx ? 'att' : 'def') : 'def');
    this.moveTo(p, s[0], s[1], dist2(p.x, p.z, s[0], s[1]) > 6);
  }

  chase(p, dt, phase, second = false) {
    const m = this.m, b = m.ball, d = this.d;
    const carrier = b.owner && b.owner.team !== p.team ? b.owner : null;
    if (!carrier) {
      if (b.holder && b.holder.team !== p.team) { this.defend(p, 'def'); return; }
      const ip = this.intercept(p);
      this.moveTo(p, ip.x, ip.z, true);
      // chega primeiro: se a bola estiver alta perto, só posiciona
      return;
    }
    const ownX = m.ownGoalX(this.t.idx);
    const dx = ownX - carrier.x, dz = -carrier.z, dl = Math.hypot(dx, dz) || 1;
    const stand = second ? 2.2 : 0.55;
    const tx = carrier.x + dx / dl * stand + carrier.vx * 0.25, tz = carrier.z + dz / dl * stand + carrier.vz * 0.25;
    // acompanha a velocidade do condutor e corrige a posição (marcação colada)
    const vmax = m.maxSpeed(p);
    const ex = tx - p.x, ez = tz - p.z;
    let wx = carrier.vx / vmax + ex * 0.9, wz = carrier.vz / vmax + ez * 0.9;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    p.want.x = wx; p.want.z = wz;
    p.want.sprint = carrier.speed > 4.2 || Math.hypot(ex, ez) > 2.5;
    const dist = dist2(p.x, p.z, carrier.x, carrier.z);
    p.facing = turnTowards(p.facing, Math.atan2(b.z - p.z, b.x - p.x), 10 * dt);
    if (p.state !== 'free' || second) return;
    // bote: chance por segundo quando está colado no condutor
    if (dist < 1.6) {
      const rate = 0.8 + d.tackle * 2.2 + (carrier.isGK ? 1 : 0);
      if (chance(rate * dt)) {
        const behind = Math.cos(carrier.facing) * (p.x - carrier.x) + Math.sin(carrier.facing) * (p.z - carrier.z) < -0.3;
        if (!behind && carrier.speed > 4.5 && chance(0.1 + d.mistake)) m.doSlide(p);
        else if (!behind || chance(0.03 + d.mistake)) m.doTackle(p);
      }
    } else if (dist < 2.2 && chance(d.mistake * 1.5 * dt)) {
      m.doTackle(p); // erro plausível: bote afobado de longe
    }
  }

  // ─── Com a bola ───────────────────────────────────────────────────────────
  carrier(p, dt) {
    const m = this.m, t = this.t, d = this.d, b = m.ball;
    const gx = m.goalX(t.idx);
    p.aiT -= dt;
    const press = m.pressure(p);
    // percebe o bote chegando e tenta escapar (mais comum nos níveis altos)
    if (p.state === 'free' && !p.isGK) {
      for (const o of this.opponents()) {
        if ((o.state === 'tackle' || o.state === 'slide') && o.animT < 0.12 && dist2(o.x, o.z, p.x, p.z) < 2.2) {
          if (!p.dodgeChecked || p.dodgeChecked !== o.animT) {
            p.dodgeChecked = o.animT;
            if (chance(d.dodge * (0.6 + m.attr(p, 'dri') * 0.6))) {
              const side = (o.z - p.z) * t.dir > 0 ? -1 : 1;
              m.doSkill(p, chance(0.5) ? 'finta' : 'elastico', { x: 0, z: side, mag: 1 });
            }
          }
          break;
        }
      }
    }
    if (p.dribT && p.aiT > 0 && press < 0.85) {
      this.moveTo(p, p.dribT[0], p.dribT[1], p.dribSprint);
      return;
    }
    p.aiT = d.decide * rand(0.6, 1.3) * (press > 0.6 ? 0.5 : 1);

    // 1) chute
    const q = this.shotQuality(p);
    if (q > d.shootQ + rand(-0.06, 0.06)) {
      const gk = m.gk(1 - t.idx);
      const gz = gk ? gk.z : 0;
      let aimZ = (gz > 0 ? -1 : 1) * rand(0.6, 1.25);
      if (chance(0.25)) aimZ = rand(-1.2, 1.2);
      const dGoal = dist2(p.x, p.z, gx, 0);
      let kind = 'normal';
      const gkOff = gk ? Math.abs(gk.x - gx) : 0;
      if (dGoal < 9 && gkOff > 2.5 && chance(0.4)) kind = 'chip';
      else if (Math.abs(p.z) > 4 && dGoal < 14 && chance(0.35)) kind = 'curl';
      else if (dGoal < 5 && chance(0.25)) kind = 'toe';
      const power = clamp(0.45 + dGoal / 22 + rand(-0.1, 0.1), 0.4, 0.92);
      m.doShot(p, { kind, power, aimZ });
      p.dribT = null;
      return;
    }

    // 2) passe
    let best = null, bestS = -Infinity, bestKind = 'ground';
    for (const mt of m.courtPlayers(t.idx)) {
      if (mt === p) continue;
      const dd = dist2(p.x, p.z, mt.x, mt.z);
      if (dd < 2.5 || dd > 22) continue;
      const lane = this.laneClear(p.x, p.z, mt.x, mt.z);
      const open = Math.min(5, this.minOppDist(mt.x, mt.z)) / 5;
      const prog = ((mt.x - p.x) * t.dir) / 10;
      let s = open * 0.9 + prog * 0.75 - (dd > 15 ? 0.3 : 0);
      let kind = 'ground';
      if (lane < 0.8 + dd * 0.04) { if (dd > 7 && open > 0.5) { kind = 'lob'; s -= 0.25; } else continue; }
      if (mt.isGK && !t.keeperOut) s -= 0.5;
      // passe em profundidade para quem tem espaço à frente
      const ahead = this.minOppDist(mt.x + t.dir * 4, mt.z);
      if (kind === 'ground' && ahead > 3 && (mt.x * t.dir) < HL - 6 && prog > 0 && chance(0.35)) { kind = 'through'; s += 0.15; }
      if (s > bestS) { bestS = s; best = mt; bestKind = kind; }
    }
    if (best && chance(d.mistake)) {
      // erro plausível: passe para alguém marcado
      const mates = m.courtPlayers(t.idx).filter((x) => x !== p);
      best = pick(mates); bestKind = 'ground';
    }
    const space = Math.min(6, this.minOppDist(p.x + t.dir * 2.5, p.z)) / 6;
    const dribS = space * 0.8 + (press < 0.3 ? 0.25 : -0.2) - (p.isGK ? 0.6 : 0);
    if (best && (bestS > dribS + 0.12 || (press > 0.8 && bestS > -0.2))) {
      m.doPass(p, { kind: bestKind, target: best, dir: Math.atan2(best.z - p.z, best.x - p.x) });
      p.dribT = null;
      return;
    }

    // 3) drible / condução
    const near = this.opponents().reduce((a, o) => (!a || dist2(o.x, o.z, p.x, p.z) < dist2(a.x, a.z, p.x, p.z) ? o : a), null);
    let tx = p.x + t.dir * 4, tz = p.z * 0.85;
    if (near) {
      const nd = dist2(near.x, near.z, p.x, p.z);
      if (nd < 3) tz += (p.z - near.z > 0 ? 1 : -1) * 2.2;
      const inFront = (near.x - p.x) * t.dir > 0;
      if (nd < 1.7 && inFront && p.state === 'free' && chance(0.25 + m.attr(p, 'dri') * 0.4)) {
        const sk = pick(['finta', 'finta', 'elastico', 'pisada', 'chapeu']);
        const side = p.z > 0 ? -1 : 1;
        m.doSkill(p, sk, { x: 0, z: side, mag: 1 });
      }
    }
    if ((tx * t.dir) > HL - 2.5) { tx = t.dir * (HL - 2.5); tz = p.z * 0.6; }
    tz = clamp(tz, -HW + 1.2, HW - 1.2);
    p.dribT = [tx, tz];
    p.dribSprint = space > 0.6 && p.stamina > 0.35;
    this.moveTo(p, tx, tz, p.dribSprint);
  }

  shotQuality(p) {
    const m = this.m, t = this.t;
    const gx = m.goalX(t.idx);
    const dGoal = dist2(p.x, p.z, gx, 0);
    if (dGoal > 17) return 0;
    const a1 = Math.atan2(-GOAL_W / 2 - p.z, gx - p.x), a2 = Math.atan2(GOAL_W / 2 - p.z, gx - p.x);
    const width = Math.abs(angDiff(a1, a2));
    let q = clamp(1 - (dGoal - 3.5) / 13, 0, 1) * clamp(width / 0.32, 0.15, 1);
    for (const o of this.opponents()) {
      if (o.isGK) continue;
      if ((o.x - p.x) * t.dir < 0) continue;
      if (distPointSeg(o.x, o.z, p.x, p.z, gx, 0) < 0.8) q *= 0.7;
    }
    const gk = m.gk(1 - t.idx);
    if (gk && Math.abs(gk.x - gx) > 3 && dGoal < 12) q += 0.2;
    q += m.attr(p, 'fin') * 0.1;
    return q;
  }

  // ─── Ataque sem bola: buscar espaço para receber ──────────────────────────
  support(p, dt) {
    const m = this.m, t = this.t, b = m.ball;
    let st = this.supT.get(p.i);
    if (!st || st.until < m.time) {
      const base = this.spot(p, 'att');
      const carrier = b.owner || b.holder;
      let best = base, bs = -Infinity;
      const offs = [[0, 0], [2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2], [1.6, 1.6], [1.6, -1.6], [-1.6, 1.6], [-1.6, -1.6]];
      for (const [ox, oz] of offs) {
        const cx = clamp(base[0] + ox, -HL + 1, HL - 1), cz = clamp(base[1] + oz, -HW + 0.8, HW - 0.8);
        let s = Math.min(5, this.minOppDist(cx, cz)) * 0.5 - Math.hypot(ox, oz) * 0.12 + cx * t.dir * 0.03;
        if (carrier && carrier !== p) {
          s += Math.min(3, this.laneClear(carrier.x, carrier.z, cx, cz)) * 0.6;
          if (dist2(cx, cz, carrier.x, carrier.z) < 3.5) s -= 1.5;
        }
        // não ficar em cima de companheiro
        for (const mt of m.courtPlayers(t.idx)) if (mt !== p && dist2(mt.x, mt.z, cx, cz) < 3) s -= 1;
        if (s > bs) { bs = s; best = [cx, cz]; }
      }
      // pivô ataca a área de vez em quando
      if (p.slot === 4 && chance(0.3)) best = [t.dir * (HL - 4.5), clamp(b.z * -0.3 + rand(-2, 2), -4, 4)];
      st = { x: best[0], z: best[1], until: m.time + rand(0.7, 1.4) };
      this.supT.set(p.i, st);
    }
    this.moveTo(p, st.x, st.z, dist2(p.x, p.z, st.x, st.z) > 5);
  }

  // ─── Cobranças ────────────────────────────────────────────────────────────
  restart(players, dt) {
    const m = this.m, r = m.restart, t = this.t, d = this.d;
    if (!r) return;
    for (const p of players) {
      if (p === r.taker) {
        if (p.human >= 0) continue;
        p.want.x = 0; p.want.z = 0;
        if (r.aiDelay == null) {
          r.aiDelay = d.restart * rand(0.6, 1.4);
          if (chance(d.mistake * 0.4) && r.type !== 'kickoff' && r.type !== 'penalti') r.aiDelay = 4.3; // demora e perde a posse
        }
        if (r.t < r.aiDelay) continue;
        this.takeRestartAI(p, r);
        continue;
      }
      if (p.human >= 0) continue;
      if (p.wallT > 0 || r.type === 'penalti' || r.type === 'livre6') { p.want.x = 0; p.want.z = 0; continue; }
      if (p.isGK && !t.keeperOut) { this.goalkeeper(p, dt); continue; }
      if (r.team === t.idx) {
        if (r.type === 'kickoff') { p.want.x = 0; p.want.z = 0; continue; }
        this.support(p, dt);
      } else {
        // marca o adversário mais próximo
        const o = this.opponents().filter((x) => x !== r.taker && !x.isGK).sort((a, c) => dist2(a.x, a.z, p.x, p.z) - dist2(c.x, c.z, p.x, p.z))[0];
        if (o && r.type !== 'kickoff') {
          const ownX = m.ownGoalX(t.idx);
          const dx = ownX - o.x, dz = -o.z, dl = Math.hypot(dx, dz) || 1;
          this.moveTo(p, o.x + dx / dl * 1.2, o.z + dz / dl * 1.2);
        } else { p.want.x = 0; p.want.z = 0; }
      }
    }
  }

  takeRestartAI(p, r) {
    const m = this.m, t = this.t;
    const gx = m.goalX(t.idx);
    if (r.type === 'meta') {
      const target = this.bestOpenMate(p, true);
      m.takeRestart(() => m.doThrow(p, target, target ? dist2(p.x, p.z, target.x, target.z) > 16 : true, t.dir > 0 ? 0 : Math.PI));
      return;
    }
    const dGoal = dist2(r.x, r.z, gx, 0);
    if (r.type === 'penalti' || r.type === 'livre6' || (r.type === 'livre' && dGoal < 11 && chance(0.6)) || (r.type === 'escanteio' && chance(0.05))) {
      const gk = m.gk(1 - t.idx);
      const aimZ = (gk && gk.z > 0 ? -1 : 1) * rand(0.7, 1.2) * (chance(0.2) ? -1 : 1);
      const kind = r.type === 'livre' && chance(0.5) ? 'curl' : 'normal';
      m.takeRestart(() => m.doShot(p, { kind, power: rand(0.6, 0.88), aimZ, setPiece: true }));
      return;
    }
    const target = this.bestOpenMate(p, false) || m.courtPlayers(t.idx).find((x) => x !== p && !x.isGK);
    const kind = r.type === 'escanteio' && chance(0.3) ? 'lob' : 'ground';
    m.takeRestart(() => m.doPass(p, { kind, target, dir: target ? Math.atan2(target.z - p.z, target.x - p.x) : p.facing }));
  }

  bestOpenMate(p, fromGK) {
    const m = this.m, t = this.t;
    let best = null, bs = -Infinity;
    for (const mt of m.courtPlayers(t.idx)) {
      if (mt === p || (mt.isGK && !t.keeperOut)) continue;
      const dd = dist2(p.x, p.z, mt.x, mt.z);
      if (dd < 3) continue;
      const open = Math.min(5, this.minOppDist(mt.x, mt.z));
      const lane = Math.min(3, this.laneClear(p.x, p.z, mt.x, mt.z));
      const s = open * 0.5 + lane * 0.5 - (fromGK ? Math.abs(dd - 10) * 0.05 : dd * 0.04) + (mt.x * t.dir) * 0.02;
      if (s > bs) { bs = s; best = mt; }
    }
    if (best && chance(this.d.mistake)) best = pick(m.courtPlayers(t.idx).filter((x) => x !== p));
    return best;
  }

  // ─── Goleiro ──────────────────────────────────────────────────────────────
  goalkeeper(p, dt) {
    const m = this.m, t = this.t, b = m.ball, d = this.d;
    const ownX = m.ownGoalX(t.idx);
    const dir = t.dir;
    if (b.holder === p) {
      if (p.human >= 0) return;
      p.holdT = (p.holdT || 0) + dt;
      p.want.x = 0; p.want.z = 0;
      if (m.state === 'play' && p.holdT > d.restart * rand(0.7, 1.3)) {
        p.holdT = 0;
        const target = this.bestOpenMate(p, true);
        m.doThrow(p, target, target ? dist2(p.x, p.z, target.x, target.z) > 16 : true, dir > 0 ? 0 : Math.PI);
      }
      return;
    }
    p.holdT = 0;
    if (b.owner === p) { this.carrier(p, dt); return; }
    if (p.state !== 'free') return;

    // pênalti / tiro livre sem barreira: escolhe um canto na hora da batida
    const ls = m.lastShot;
    if (ls && ls.penalty && ls.team !== t.idx && m.time - ls.t < 0.05 && p.state === 'free') {
      const h = p.human >= 0 ? m.humans[p.human] : null;
      let side;
      if (h && h.stick && h.stick.mag > 0.4) side = Math.sign(h.stick.z);
      else if (h) side = 0;
      else {
        const right = chance(0.24 + m.attr(p, 'ref') * 0.16 * d.gk);
        side = right ? Math.sign(ls.aimZ || 1) : -Math.sign(ls.aimZ || 1);
        if (chance(0.12)) side = 0; // fica no meio
      }
      if (side !== 0) {
        p.state = 'dive'; p.stateT = 0.75; p.anim = 'dive'; p.animT = 0;
        p.diveDX = 0; p.diveDZ = side * 5.2;
        const lx = Math.sin(p.facing), lz = -Math.cos(p.facing);
        p.diveSide = Math.sign(lz * p.diveDZ) || 1;
        p.diveHigh = chance(0.4);
      }
      p.reactT = null;
      return;
    }

    // reação a chute
    const toward = b.free && b.vx * dir < -3 && b.speed > 6;
    if (toward && m.ballPath.length) {
      let hit = null;
      for (const s of m.ballPath) {
        if ((s.x - p.x) * dir <= 0) { hit = s; break; }
        if (Math.abs(s.x) > HL + 1) break;
      }
      if (hit && Math.abs(hit.z) < GOAL_W / 2 + 0.7 && hit.y < 2.5) {
        if (p.reactT == null) p.reactT = Math.max(0.05, (0.2 - m.attr(p, 'ref') * 0.12) / d.gk + rand(0, 0.06));
        p.reactT -= dt;
        let hz = hit.z;
        // goleiro humano escolhe o canto na disputa de pênaltis
        const h = p.human >= 0 ? m.humans[p.human] : null;
        if (h && h.stick && h.stick.mag > 0.4 && m.shootout) hz = clamp(p.z + Math.sign(h.stick.z) * 1.3, -1.6, 1.6);
        if (p.reactT <= 0) {
          const dz = hz - p.z;
          const tLeft = Math.max(0.12, hit.t);
          if (Math.abs(dz) > 0.5 || hit.y > 1.9) {
            const v = clamp(Math.abs(dz) / tLeft, 2.5, 5.6) * (0.85 + m.attr(p, 'ref') * 0.25) * d.gk;
            p.state = 'dive'; p.stateT = 0.7; p.anim = 'dive'; p.animT = 0;
            p.diveDX = (hit.x - p.x) * 0.3; p.diveDZ = Math.sign(dz) * v;
            const lx = Math.sin(p.facing), lz = -Math.cos(p.facing);
            p.diveSide = Math.sign(lx * p.diveDX + lz * p.diveDZ) || 1;
            p.diveHigh = hit.y > 1.1;
            p.reactT = null;
            return;
          }
          this.moveTo(p, p.x, hz, false);
          return;
        }
        return;
      }
    }
    p.reactT = null;

    // posicionamento
    const bx = b.x, bz = b.z;
    const dBall = dist2(bx, bz, ownX, 0);
    let off = clamp(0.5 + dBall * 0.06, 0.6, 1.5);
    const ang = Math.atan2(bz, (bx - ownX) * dir);
    let tx = ownX + dir * Math.cos(ang) * off, tz = Math.sin(ang) * off * 1.1;
    tz = clamp(tz, -GOAL_W / 2 - 0.2, GOAL_W / 2 + 0.2);
    // saída do gol: bola solta na área e eu chego antes
    const looseInArea = b.free && inArea(bx, bz, -dir, 0.5);
    if (looseInArea) {
      const ip = this.intercept(p);
      let oppBest = Infinity;
      for (const o of this.opponents()) oppBest = Math.min(oppBest, dist2(o.x, o.z, ip.x, ip.z) / m.maxSpeed(o));
      if (ip.t < oppBest + 0.15) { this.moveTo(p, ip.x, ip.z, true); return; }
    }
    // atacante entrando sozinho: fecha o ângulo
    const c = b.owner && b.owner.team !== t.idx ? b.owner : null;
    if (c && dBall < 7.5 && inArea(c.x, c.z, -dir, 1.5)) {
      off = clamp(dBall * 0.45, 1.0, 3.0);
      tx = ownX + dir * Math.cos(ang) * off; tz = Math.sin(ang) * off;
    }
    this.moveTo(p, tx, tz, dist2(p.x, p.z, tx, tz) > 2);
    p.facing = turnTowards(p.facing, Math.atan2(bz - p.z, bx - p.x), 8 * dt);
  }
}

// Defesa do goleiro contra bolas rápidas: segura ou espalma.
export function gkSaveCheck(m, gk) {
  const b = m.ball;
  if (!b.free || b.speed < 8 || gk.state === 'getup' || gk.state === 'fall') return;
  const t = m.teams[gk.team];
  if (t.keeperOut && Math.abs(gk.x - m.ownGoalX(gk.team)) > 6) return;
  if (b.lastTouch && b.lastTouch.team === gk.team) return;
  if ((b.vx * t.dir) > 0) return; // bola se afastando do gol dele
  const inBox = inArea(gk.x, gk.z, -t.dir, 0.3);
  const ai = m.ai[gk.team].d;
  const reach = (0.75 + m.attr(gk, 'ref') * 0.35) * (gk.human >= 0 ? 1 : ai.gk);
  let hit = false;
  if (gk.state === 'dive') {
    const dl = Math.hypot(gk.diveDX, gk.diveDZ) || 1;
    const nx = gk.diveDX / dl, nz = gk.diveDZ / dl;
    const k = Math.min(1, gk.animT / 0.3);
    const d = distPointSeg(b.x, b.z, gk.x - nx * 0.45, gk.z - nz * 0.45, gk.x + nx * (0.45 + 0.65 * k), gk.z + nz * (0.45 + 0.65 * k));
    hit = d < 0.36 * reach && b.y < (gk.diveHigh ? 2.2 : 1.5);
  } else if (gk.state === 'free') {
    hit = dist2(b.x, b.z, gk.x, gk.z) < 0.55 * reach && b.y < 2.25;
  }
  if (!hit) return;
  if (ai.mistake > 0.1 && gk.human < 0 && Math.random() < 0.06) return; // frango no Fácil
  const catchable = inBox && b.speed < 14 + m.attr(gk, 'ref') * 10 && (gk.state === 'free' ? Math.random() < 0.9 : Math.random() < 0.5 + m.attr(gk, 'ref') * 0.2);
  if (catchable) {
    m.gainBall(gk, true);
    return;
  }
  // espalma para longe do gol
  const away = t.dir;
  const sp = b.speed;
  b.vx = Math.abs(b.vx) * away * 0.3 + away * rand(1, 3);
  b.vz = b.vz * 0.35 + (Math.sign(b.z - gk.z) || (Math.random() < 0.5 ? -1 : 1)) * rand(3, 6); // para fora, longe do meio
  b.vy = rand(1.5, 4);
  b.spin = 0;
  b.lastTouch = gk;
  gk.touchCD = 0.4;
  m.teams[gk.team].stats.saves++;
  m.lastShot = null;
  m.emit('save', { team: gk.team, catch: false, power: sp });
}
