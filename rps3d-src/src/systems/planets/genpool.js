// Fila de geração de chunks: pool de Web Workers quando disponível; senão
// (ou se um worker falhar) gera na thread principal fatiado por orçamento de
// tempo por frame. Pedidos têm prioridade (menor = antes) e podem ser
// cancelados (nó descartado antes de ficar pronto).
import { buildChunk } from './chunkgen.js';

export class GenPool {
  constructor({ workers = 2, budgetMs = 4 } = {}) {
    this.queue = [];          // {job, prio, cb}
    this.inflight = new Map(); // key → {cb, worker}
    this.workers = [];
    this.budgetMs = budgetMs;
    this.cancelled = new Set();
    this.errors = [];
    if (typeof Worker !== 'undefined' && workers > 0) {
      for (let i = 0; i < workers; i++) {
        try {
          const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
          w.busy = 0;
          w.onmessage = (e) => this._done(w, e.data);
          w.onerror = (e) => { this.errors.push('worker: ' + (e.message || e)); w.dead = true; this._requeue(w); };
          this.workers.push(w);
        } catch (e) { this.errors.push('worker indisponível: ' + e); break; }
      }
    }
  }
  get pending() { return this.queue.length + this.inflight.size; }
  request(job, prio, cb) { this.queue.push({ job, prio, cb }); }
  cancel(key) {
    this.queue = this.queue.filter((q) => q.job.key !== key);
    if (this.inflight.has(key)) this.cancelled.add(key);
  }
  _done(w, msg) {
    w.busy--;
    const key = msg.ok ? msg.r.key : msg.key;
    const f = this.inflight.get(key);
    this.inflight.delete(key);
    if (this.cancelled.has(key)) { this.cancelled.delete(key); return; }
    if (!msg.ok) { this.errors.push(msg.error); if (f) this.queue.push(f.item); return; }
    f?.cb(msg.r);
  }
  _requeue(w) {
    for (const [k, f] of this.inflight) if (f.worker === w) { this.inflight.delete(k); this.queue.push(f.item); }
    this.workers = this.workers.filter((x) => x !== w);
  }
  /** Chamado por frame: despacha para workers e/ou gera localmente. */
  pump(syncAll = false) {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.prio - b.prio);
    const live = this.workers.filter((w) => !w.dead);
    if (live.length && !syncAll) {
      for (const w of live) {
        while (w.busy < 2 && this.queue.length) {
          const item = this.queue.shift();
          w.busy++;
          this.inflight.set(item.job.key, { cb: item.cb, worker: w, item });
          w.postMessage([item.job]);
        }
      }
      return;
    }
    const t0 = performance.now();
    while (this.queue.length) {
      const item = this.queue.shift();
      item.cb(buildChunk(item.job));
      if (!syncAll && performance.now() - t0 > this.budgetMs) break;
    }
  }
  dispose() { for (const w of this.workers) w.terminate(); this.workers = []; this.queue = []; }
}
