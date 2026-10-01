/**
 * Regras do modo competitivo "UPLINK" — melhor de 13 (primeiro a 7).
 *
 * Fases de cada round:
 *   buy   → todos nascem, compram, ficam parados (podem mirar)
 *   live  → combate; o round termina por eliminação, captura do Uplink ou
 *           tempo esgotado
 *   end   → placar atualiza, pausa curta, próximo round
 *
 * Captura do Uplink: só membros VIVOS de um único time dentro do círculo
 * avançam a barra (mais gente = mais rápido). Contestado = congela. Se o
 * outro time entrar sozinho, a barra primeiro volta a zero e só então
 * troca de dono. Barra cheia vence o round.
 *
 * Este módulo não conhece Three.js nem DOM: recebe posições e devolve
 * eventos, o que o torna testável isoladamente.
 */

export const RULES = {
  roundsToWin: 7,
  buyTime: 10,
  roundTime: 115,
  endTime: 5,
  captureTime: 9,
  startMoney: 800,
  maxMoney: 16000,
  winReward: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  captureBonus: 300,
};

/**
 * @typedef {Object} RoundActor
 * @property {number} team
 * @property {boolean} alive
 * @property {number} health
 * @property {boolean} [isTarget]
 * @property {{ pos: { x: number, z: number } }} body
 */

export class RoundManager {
  /** @param {{ x: number, z: number, radius: number }} uplink @param {Partial<typeof RULES>} [rules] */
  constructor(uplink, rules = {}) {
    this.uplink = uplink;
    this.rules = { ...RULES, ...rules };
    /** @type {'buy'|'live'|'end'|'over'} */
    this.phase = 'buy';
    this.timer = this.rules.buyTime;
    this.round = 0;
    this.score = [0, 0];
    this.lossStreak = [0, 0];
    this.capture = { owner: -1, progress: 0, contested: false, counts: [0, 0] };
    /** @type {{ winner: number, reason: string }|null} */
    this.lastResult = null;
    this.matchTime = 0;
    /** @type {{ type: string, [k: string]: any }[]} eventos do frame (consumidos pelo MatchManager) */
    this.events = [];
  }

  /** Começa o próximo round (fase de compra). */
  startRound() {
    this.round++;
    this.phase = 'buy';
    this.timer = this.rules.buyTime;
    this.capture = { owner: -1, progress: 0, contested: false, counts: [0, 0] };
    this.events.push({ type: 'roundStart', round: this.round });
  }

  /**
   * @param {number} dt
   * @param {RoundActor[]} actors
   */
  update(dt, actors) {
    if (this.phase === 'over') return;
    this.matchTime += dt;
    this.timer -= dt;
    if (this.phase === 'buy') {
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = this.rules.roundTime;
        this.events.push({ type: 'live' });
      }
      return;
    }
    if (this.phase === 'end') {
      if (this.timer <= 0) {
        if (Math.max(...this.score) >= this.rules.roundsToWin) {
          this.phase = 'over';
          this.events.push({ type: 'matchEnd', winner: this.score[0] > this.score[1] ? 0 : 1 });
        } else this.startRound();
      }
      return;
    }
    // ── live ──
    const alive = [0, 0];
    const hp = [0, 0];
    const counts = [0, 0];
    for (const a of actors) {
      if (a.isTarget || !a.alive) continue;
      alive[a.team]++;
      hp[a.team] += a.health;
      const dx = a.body.pos.x - this.uplink.x;
      const dz = a.body.pos.z - this.uplink.z;
      if (dx * dx + dz * dz <= this.uplink.radius * this.uplink.radius) counts[a.team]++;
    }
    this.updateCapture(dt, counts);
    if (this.phase !== 'live') return;

    if (alive[0] === 0 && alive[1] === 0) return this.endRound(-1, 'Todos eliminados');
    if (alive[1] === 0) return this.endRound(0, 'Eliminação');
    if (alive[0] === 0) return this.endRound(1, 'Eliminação');
    if (this.timer <= 0) {
      if (alive[0] !== alive[1]) return this.endRound(alive[0] > alive[1] ? 0 : 1, 'Tempo — mais sobreviventes');
      if (hp[0] !== hp[1]) return this.endRound(hp[0] > hp[1] ? 0 : 1, 'Tempo — mais vida total');
      return this.endRound(-1, 'Tempo — empate');
    }
  }

  /** @param {number} dt @param {number[]} counts */
  updateCapture(dt, counts) {
    const c = this.capture;
    c.counts = counts;
    c.contested = counts[0] > 0 && counts[1] > 0;
    if (c.contested) return;
    const team = counts[0] > 0 ? 0 : counts[1] > 0 ? 1 : -1;
    if (team < 0) {
      // ninguém: decai devagar
      c.progress = Math.max(0, c.progress - dt / (this.rules.captureTime * 3));
      if (c.progress === 0) c.owner = -1;
      return;
    }
    const rate = (dt / this.rules.captureTime) * (1 + 0.3 * (counts[team] - 1));
    if (c.owner === -1 || c.owner === team) {
      if (c.owner === -1) this.events.push({ type: 'captureStart', team });
      c.owner = team;
      c.progress = Math.min(1, c.progress + rate);
      if (c.progress >= 1) this.endRound(team, 'Uplink capturado');
    } else {
      // time adversário revertendo
      c.progress = Math.max(0, c.progress - rate * 1.5);
      if (c.progress === 0) c.owner = -1;
    }
  }

  /** @param {number} winner -1 = empate @param {string} reason */
  endRound(winner, reason) {
    this.phase = 'end';
    this.timer = this.rules.endTime;
    this.lastResult = { winner, reason };
    if (winner >= 0) {
      this.score[winner]++;
      this.lossStreak[winner] = 0;
      this.lossStreak[1 - winner]++;
    }
    this.events.push({ type: 'roundEnd', winner, reason, captured: reason === 'Uplink capturado' });
  }

  /**
   * Dinheiro do round para um time.
   * @param {number} team
   * @param {number} winner
   * @param {boolean} captured
   */
  roundIncome(team, winner, captured) {
    const r = this.rules;
    if (winner === team) return r.winReward + (captured ? r.captureBonus : 0);
    const streak = Math.max(0, this.lossStreak[team] - 1);
    return Math.min(r.lossMax, r.lossBase + r.lossStep * streak);
  }
}
