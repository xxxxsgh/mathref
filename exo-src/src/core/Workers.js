/**
 * WORKERS — pool de Web Workers de módulo com fila de prioridade e transferables.
 *
 * Lado principal (feature):
 *   const pool = ctx.workers.pool('terrain',
 *     () => new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' }),
 *     { size: 3 });
 *   const job = pool.run('chunk', { face, x, y, lod }, { priority: dist, transfer: [buf], key: id });
 *   job.then(({ positions }) => ...);  job.cancel();   // cancela se ainda na fila
 *   pool.reprioritize((job) => novaPrioridade);        // ex.: a câmera andou
 *   await pool.idle();                                 // fila vazia e nada rodando
 *
 * O `new URL('./x.worker.js', import.meta.url)` PRECISA estar escrito
 * literalmente no arquivo da feature (o Vite empacota o worker a partir dele).
 *
 * Lado worker (x.worker.js):
 *   import { serve, transfer } from '../../core/workerHost.js';
 *   serve({ chunk(payload) { const p = new Float32Array(...); return transfer({ positions: p }, [p.buffer]); } });
 *
 * Prioridade: MENOR número = mais urgente (ex.: distância à câmera). Empates
 * em ordem de chegada. `key` opcional: um job novo com a mesma key substitui
 * o que ainda estiver na fila (o antigo é rejeitado com { cancelled: true }).
 *
 * Sem suporte a Worker (ou se o worker falhar ao subir) e com `fallback`
 * (objeto de handlers igual ao do serve), o job roda no thread principal.
 */
import { PriorityQueue } from './PriorityQueue.js';

let _seq = 0;

export class WorkerPool {
  constructor(name, factory, { size = 2, fallback = null } = {}) {
    this.name = name;
    this.factory = factory;
    this.size = Math.max(1, size | 0);
    this.fallback = fallback;
    this.queue = new PriorityQueue((a, b) => a.priority - b.priority || a.seq - b.seq);
    this.byKey = new Map();
    this.workers = [];
    this.idleWaiters = [];
    this.stats = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    this.broken = false;
    this.disposed = false;
  }

  _spawn() {
    if (this.broken || typeof Worker === 'undefined') {
      this.broken = true;
      return null;
    }
    try {
      const w = this.factory();
      const slot = { w, job: null };
      w.onmessage = (ev) => this._onMessage(slot, ev.data);
      w.onerror = (ev) => {
        const job = slot.job;
        slot.job = null;
        console.error(`[workers:${this.name}] erro no worker`, ev.message || ev);
        if (job) this._finish(job, false, new Error(ev.message || 'erro no worker'));
        ev.preventDefault?.();
        this._pump();
      };
      this.workers.push(slot);
      return slot;
    } catch (err) {
      console.warn(`[workers:${this.name}] Worker indisponível, usando o thread principal`, err);
      this.broken = true;
      return null;
    }
  }

  _onMessage(slot, msg) {
    const job = slot.job;
    if (!job || msg.id !== job.id) return;
    slot.job = null;
    if (msg.ok) this._finish(job, true, msg.result);
    else this._finish(job, false, new Error(msg.error || 'falha no worker'));
    this._pump();
  }

  _finish(job, ok, value) {
    this.stats.running--;
    if (job.key != null && this.byKey.get(job.key) === job) this.byKey.delete(job.key);
    if (ok) {
      this.stats.done++;
      job.resolve(value);
    } else {
      this.stats.failed++;
      job.reject(value);
    }
    this._checkIdle();
  }

  _checkIdle() {
    if (this.queue.size === 0 && this.stats.running === 0 && this.idleWaiters.length) {
      const w = this.idleWaiters.splice(0);
      for (const fn of w) fn();
    }
  }

  /** Enfileira um job. Devolve uma Promise com `.cancel()` e `.job`. */
  run(type, payload, { priority = 0, transfer = [], key = null } = {}) {
    if (this.disposed) return Promise.reject(new Error('pool descartado'));
    let resolve, reject;
    const p = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job = { id: ++_seq, seq: _seq, type, payload, priority, transfer, key, resolve, reject, state: 'queued' };
    if (key != null) {
      const old = this.byKey.get(key);
      if (old && old.state === 'queued') this._cancel(old);
      this.byKey.set(key, job);
    }
    this.queue.push(job);
    this.stats.queued = this.queue.size;
    p.job = job;
    p.cancel = () => this._cancel(job);
    // evita "unhandled rejection" de jobs cancelados que ninguém aguarda
    p.catch(() => {});
    queueMicrotask(() => this._pump());
    return p;
  }

  _cancel(job) {
    if (job.state !== 'queued') return false;
    job.state = 'cancelled';
    this.queue.remove(job);
    this.stats.queued = this.queue.size;
    this.stats.cancelled++;
    if (job.key != null && this.byKey.get(job.key) === job) this.byKey.delete(job.key);
    const err = new Error('cancelado');
    err.cancelled = true;
    job.reject(err);
    this._checkIdle();
    return true;
  }

  /** Recalcula prioridades dos jobs na fila: fn(job) → número (ou null = cancelar). */
  reprioritize(fn) {
    const jobs = this.queue.toArray();
    for (const j of jobs) {
      const p = fn(j);
      if (p == null) this._cancel(j);
      else j.priority = p;
    }
    this.queue.rebuild();
  }

  _pump() {
    if (this.disposed) return;
    while (this.queue.size) {
      let slot = this.workers.find((s) => !s.job);
      if (!slot && this.workers.length < this.size && !this.broken) slot = this._spawn();
      if (!slot) {
        if (this.broken && this.fallback) return this._runInline();
        if (this.broken) {
          // sem worker e sem fallback: falha tudo de forma legível
          while (this.queue.size) {
            const j = this.queue.pop();
            j.state = 'failed';
            this.stats.running++;
            this._finish(j, false, new Error(`pool '${this.name}' sem workers e sem fallback`));
          }
        }
        return;
      }
      const job = this.queue.pop();
      this.stats.queued = this.queue.size;
      job.state = 'running';
      this.stats.running++;
      slot.job = job;
      try {
        slot.w.postMessage({ id: job.id, type: job.type, payload: job.payload }, job.transfer || []);
      } catch (err) {
        slot.job = null;
        this._finish(job, false, err);
      }
    }
  }

  async _runInline() {
    if (this._inline) return;
    this._inline = true;
    try {
      while (this.queue.size) {
        const job = this.queue.pop();
        this.stats.queued = this.queue.size;
        job.state = 'running';
        this.stats.running++;
        try {
          const fn = this.fallback[job.type];
          if (!fn) throw new Error(`handler '${job.type}' inexistente`);
          let r = await fn(job.payload);
          if (r && r.__transfer) r = r.result;
          this._finish(job, true, r);
        } catch (err) {
          this._finish(job, false, err);
        }
        // cede o thread entre jobs inline
        await new Promise((res) => setTimeout(res, 0));
      }
    } finally {
      this._inline = false;
    }
  }

  /** Resolve quando a fila esvaziar e nada estiver rodando. */
  idle() {
    if (this.queue.size === 0 && this.stats.running === 0) return Promise.resolve();
    return new Promise((res) => this.idleWaiters.push(res));
  }

  get busy() {
    return this.queue.size + this.stats.running;
  }

  dispose() {
    this.disposed = true;
    for (const j of this.queue.toArray()) this._cancel(j);
    for (const s of this.workers) s.w.terminate();
    this.workers.length = 0;
  }
}

/** Registro de pools (ctx.workers). */
export class Workers {
  constructor({ defaultSize } = {}) {
    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    /** tamanho padrão: núcleos − 1, entre 1 e 4 */
    this.defaultSize = defaultSize || Math.max(1, Math.min(4, hc - 1));
    this.pools = new Map();
  }

  /** Cria (ou devolve o já criado) pool `name`. */
  pool(name, factory, opts = {}) {
    let p = this.pools.get(name);
    if (!p) {
      p = new WorkerPool(name, factory, { size: this.defaultSize, ...opts });
      this.pools.set(name, p);
    }
    return p;
  }

  get(name) {
    return this.pools.get(name);
  }

  /** Total de jobs pendentes/rodando em todos os pools. */
  get busy() {
    let n = 0;
    for (const p of this.pools.values()) n += p.busy;
    return n;
  }

  /** Todos os pools ociosos. */
  idle() {
    return Promise.all([...this.pools.values()].map((p) => p.idle()));
  }

  /**
   * Autoteste (ferramentas): sobe o pool 'core-selftest', roda jobs com
   * prioridades e transferable e confere os resultados.
   */
  async selfTest() {
    const pool = this.pool('core-selftest', () => new Worker(new URL('./workers/selftest.worker.js', import.meta.url), { type: 'module' }), { size: 2 });
    const order = [];
    const jobs = [];
    for (let i = 0; i < 6; i++) {
      const buf = new Float64Array(1000).fill(i);
      jobs.push(pool.run('sum', { data: buf, tag: i }, { priority: 6 - i, transfer: [buf.buffer] }).then((r) => {
        order.push(r.tag);
        return r;
      }));
    }
    const res = await Promise.all(jobs);
    const ok = res.every((r, i) => r.sum === i * 1000 && r.echo instanceof Float32Array && r.echo.length === 1000);
    return { ok, order, transferred: jobs.length, broken: pool.broken };
  }
}
