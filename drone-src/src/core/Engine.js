import { RollingAverage } from './MathUtils.js';

/**
 * Loop de jogo com física em timestep fixo e render desacoplado.
 *
 * Por que fixo: o modelo de voo integra velocidade e rotação a cada passo. Com
 * dt variável, o mesmo comando dá resultados diferentes a 30 e a 60 fps — e o
 * ghost gravado num aparelho não bate no outro. A 60 Hz fixos, a simulação é
 * determinística e o render só interpola.
 *
 * `maxSubSteps` existe pra evitar a espiral da morte: se a aba ficou em segundo
 * plano por 10 s, não adianta rodar 600 passos de física de uma vez — isso
 * trava mais ainda. Descartamos o tempo excedente e seguimos.
 */
export class Engine {
  /**
   * @param {object} opts
   * @param {number} opts.fixedHz         passos de física por segundo
   * @param {number} opts.maxSubSteps     teto de passos por frame
   * @param {(dt:number)=>void} opts.onFixed   um passo de simulação
   * @param {(dt:number, alpha:number)=>void} opts.onRender  desenho; `alpha` é a
   *        fração do passo já acumulada, pra interpolar a pose visual
   */
  constructor({ fixedHz = 60, maxSubSteps = 5, onFixed, onRender }) {
    this.step = 1 / fixedHz;
    this.maxSubSteps = maxSubSteps;
    this.onFixed = onFixed;
    this.onRender = onRender;

    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.elapsed = 0;

    /** Tempo de frame suavizado, em ms — base da qualidade adaptativa. */
    this.frameMs = new RollingAverage(0.5);
    this.fps = 0;

    this._tick = this._tick.bind(this);
    this._frameHandle = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this._frameHandle = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._frameHandle);
  }

  _tick(now) {
    if (!this.running) return;
    this._frameHandle = requestAnimationFrame(this._tick);

    const rawMs = now - this.lastTime;
    this.lastTime = now;

    // Um dt gigante quase sempre significa "a aba estava escondida", não
    // "o jogo ficou lento". Limitar aqui evita teleporte no primeiro frame
    // depois de voltar pro app.
    const dt = Math.min(rawMs, 250) / 1000;

    this.frameMs.push(rawMs, dt);
    this.fps = this.frameMs.value > 0 ? 1000 / this.frameMs.value : 0;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      this.onFixed(this.step);
      this.accumulator -= this.step;
      this.elapsed += this.step;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0; // descarta o atraso

    this.onRender(dt, this.accumulator / this.step);
  }
}
