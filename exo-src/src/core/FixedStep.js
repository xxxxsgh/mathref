/**
 * Acumulador de passo fixo (puro, testável sem DOM).
 * advance(frameDt) devolve quantos passos fixos rodar e o alpha de
 * interpolação. Limita a espiral da morte com maxSteps.
 */
export class FixedStep {
  constructor(step = 1 / 60, maxSteps = 5) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
  }
  advance(frameDt) {
    this.acc += Math.max(0, Math.min(frameDt, this.step * this.maxSteps));
    let steps = 0;
    while (this.acc >= this.step - 1e-9 && steps < this.maxSteps) {
      this.acc -= this.step;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = Math.min(this.acc, this.step);
    if (this.acc < 0) this.acc = 0;
    return { steps, alpha: this.acc / this.step };
  }
}
