/**
 * Sinal de PRONTO (ctx.ready). Os sistemas registram o trabalho que precisa
 * terminar antes de a cena ser considerada estável (geração de terreno ao
 * redor da câmera, texturas, IBL…):
 *
 *   ctx.ready.wait(promise, 'terreno: anel 0')     // devolve a própria promise
 *   const done = ctx.ready.busy('streaming');  ...  done();
 *
 * `window.__ready` vira true quando: todas as features iniciaram, o preset
 * de screenshot foi aplicado, NÃO há pendências e já se passaram ≥ 3 frames
 * renderizados (e ≥ 2 desde a última pendência resolvida — dá tempo de o
 * sistema registrar a próxima leva). No modo shot, pendências que demoram
 * mais que `?readyTimeout=` (s, padrão 300) viram erro em ctx.errors e o
 * jogo segue (a captura não fica presa para sempre).
 */
export class Ready {
  constructor() {
    this.pending = new Map();
    this.seq = 0;
    this.changedAt = 0;
    this.frame = 0;
    this.failures = [];
  }
  /** Registra uma promise; rejeição vira falha registrada (não lança). */
  wait(promise, label = '?') {
    const id = ++this.seq;
    this.pending.set(id, { label, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    this.changedAt = this.frame;
    Promise.resolve(promise).then(
      () => this._done(id),
      (err) => {
        this.failures.push({ label, message: String(err?.message || err) });
        this._done(id);
      },
    );
    return promise;
  }
  /** Marca algo como ocupado; chame a função devolvida ao terminar. */
  busy(label = '?') {
    let res;
    this.wait(new Promise((r) => (res = r)), label);
    return () => res();
  }
  _done(id) {
    this.pending.delete(id);
    this.changedAt = this.frame;
  }
  get count() {
    return this.pending.size;
  }
  labels() {
    return [...this.pending.values()].map((p) => p.label);
  }
  /** Chamado pelo núcleo a cada frame renderizado. */
  tick(frame) {
    this.frame = frame;
  }
  /** Estável: sem pendências há ≥ 2 frames. */
  settled() {
    return this.pending.size === 0 && this.frame - this.changedAt >= 2;
  }
}
