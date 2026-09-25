// Árbitro: legalidade de saque/quique, pontuação oficial (11, vantagem de 2,
// saque a cada 2 pontos, 1 a 1 no deuce), let, ace, bola na fita.
export class Referee {
  constructor({ gamesToWin = 2, points = 11 } = {}) {
    this.gamesToWin = gamesToWin;
    this.points = points;
    this.score = [0, 0];
    this.games = [0, 0];
    this.gameStarter = 0;
    this.server = 0;
    this.history = [];      // placar ao longo do game (para "virada")
    this.maxDeficit = [0, 0];
    this.reset();
    this.onPoint = null;    // callback(winner, info)
  }
  reset() {
    this.live = false;
    this.hitter = 0;
    this.serving = false;
    this.serveBounces = 0;
    this.legal = false;
    this.serveNet = false;
    this.edge = false;
    this.rally = 0;
    this.lastKind = null;
  }
  receiver() { return 1 - this.hitter; }
  canHit(side) { return this.live && this.legal && this.hitter !== side; }

  startServe(server) {
    this.reset();
    this.server = server;
  }
  serveHit(side) {
    this.live = true; this.hitter = side; this.serving = true; this.serveBounces = 0;
    this.legal = false; this.serveNet = false; this.edge = false; this.rally = 1; this.lastKind = 'serve';
  }
  hit(side, kind) {
    this.hitter = side; this.legal = false; this.serving = false; this.edge = false;
    this.rally++; this.lastKind = kind;
  }
  net(cord) {
    if (!this.live) return;
    if (this.serving) this.serveNet = true;
    if (cord) this.edge = true;
  }
  bounce(side) {
    if (!this.live) return;
    const h = this.hitter, rcv = 1 - h;
    if (this.serving) {
      if (this.serveBounces === 0) {
        if (side !== h) return this.point(rcv, 'Saque inválido', { fault: true });
        this.serveBounces = 1; return;
      }
      if (side === h) return this.point(rcv, 'Saque inválido', { fault: true });
      if (this.serveNet) return this.let();
      this.serving = false; this.legal = true; this.serveBounces = 2;
      return 'legal';
    }
    if (!this.legal) {
      if (side === h) return this.point(rcv, 'Quicou do próprio lado');
      this.legal = true;
      return 'legal';
    }
    return this.point(h, side === rcv ? 'Dois quiques' : '');
  }
  out() {
    if (!this.live) return;
    if (this.legal) return this.point(this.hitter, 'Não alcançou');
    return this.point(1 - this.hitter, this.serving ? 'Saque inválido' : this.edge ? 'Bola fora' : 'Bola fora', { fault: this.serving });
  }
  let() {
    this.live = false;
    this.onPoint && this.onPoint(-1, { reason: 'Let — repetir saque', let: true });
    return 'let';
  }
  point(winner, reason, extra = {}) {
    if (!this.live) return;
    this.live = false;
    const info = {
      reason, ...extra,
      rally: this.rally,
      ace: winner === this.server && this.rally === 1 && !extra.fault,
      edge: this.edge && winner === this.hitter,
      winnerKind: winner === this.hitter ? this.lastKind : null,
    };
    this.score[winner]++;
    const [a, b] = this.score;
    const d0 = b - a, d1 = a - b;
    this.maxDeficit[0] = Math.max(this.maxDeficit[0], d0);
    this.maxDeficit[1] = Math.max(this.maxDeficit[1], d1);
    info.gameOver = (a >= this.points || b >= this.points) && Math.abs(a - b) >= 2;
    if (info.gameOver) {
      const gw = a > b ? 0 : 1;
      info.gameWinner = gw;
      info.gameScore = [a, b];
      info.bagel = Math.min(a, b) === 0;
      info.comeback = this.maxDeficit[gw] >= 5;
      this.games[gw]++;
      info.matchOver = this.games[gw] >= this.gamesToWin;
      info.matchWinner = info.matchOver ? gw : null;
    }
    this.onPoint && this.onPoint(winner, info);
    return 'point';
  }
  // chamado após exibir o ponto
  advance(info) {
    if (info && info.gameOver && !info.matchOver) {
      this.score = [0, 0];
      this.maxDeficit = [0, 0];
      this.gameStarter = 1 - this.gameStarter;
    }
    this.server = this.computeServer();
  }
  computeServer() {
    const [a, b] = this.score, t = a + b;
    const deuce = a >= this.points - 1 && b >= this.points - 1;
    return deuce ? (this.gameStarter + t) % 2 : (this.gameStarter + Math.floor(t / 2)) % 2;
  }
  // ponto de game/partida?
  pressure() {
    const [a, b] = this.score, P = this.points;
    const gp = s => this.score[s] >= P - 1 && this.score[s] - this.score[1 - s] >= 1;
    const res = [];
    for (const s of [0, 1]) {
      if (gp(s)) res.push({ side: s, match: this.games[s] === this.gamesToWin - 1 });
    }
    return res;
  }
}
