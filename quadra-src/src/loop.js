// ═══════════════════════════════════════════════════════════════════════════
// B. Loop de passo fixo (1/120 s) com interpolação na renderização.
//
// A física e toda a lógica (regras, IA, cronômetro) rodam só em `step(dt)`
// com dt constante. A tela chama `frame(tempoReal)` e desenha com `alpha`
// (0..1) entre o estado anterior e o atual — movimento suave a 30 fps.
// No máximo `maxSteps` passos por quadro: se o aparelho atrasar, o jogo fica
// mais lento em vez de entrar na "espiral da morte".
// ═══════════════════════════════════════════════════════════════════════════
export class FixedStep {
  constructor(dt, maxSteps, step) {
    this.dt = dt;
    this.maxSteps = maxSteps;
    this.stepFn = step;
    this.acc = 0;
    this.last = null;
    this.dropped = 0; // tempo descartado por atraso (para o modo de teste)
  }

  /** Avança pelo tempo real `now` (s). Devolve {steps, alpha}. */
  frame(now) {
    if (this.last == null) this.last = now;
    let elapsed = now - this.last;
    this.last = now;
    if (!(elapsed > 0)) elapsed = 0;
    if (elapsed > 0.25) elapsed = 0.25; // aba em segundo plano, pausa do depurador…
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      this.stepFn(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps && this.acc >= this.dt) {
      this.dropped += this.acc - (this.acc % this.dt);
      this.acc %= this.dt;
    }
    return { steps, alpha: this.acc / this.dt };
  }

  reset() {
    this.acc = 0;
    this.last = null;
  }
}
