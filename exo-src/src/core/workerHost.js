/**
 * Lado WORKER do pool (core/Workers.js). Uso num arquivo *.worker.js:
 *
 *   import { serve, transfer } from '<caminho>/core/workerHost.js';
 *   serve({
 *     async chunk(payload) {
 *       const pos = new Float32Array(n * 3);
 *       // ...
 *       return transfer({ pos }, [pos.buffer]);   // ou só o objeto (copiado)
 *     },
 *   });
 *
 * Protocolo: { id, type, payload } → { id, ok, result | error }.
 */
export function transfer(result, list) {
  return { __transfer: list || [], result };
}

export function serve(handlers) {
  self.onmessage = async (ev) => {
    const { id, type, payload } = ev.data || {};
    try {
      const fn = handlers[type];
      if (!fn) throw new Error(`handler '${type}' inexistente`);
      const r = await fn(payload);
      if (r && r.__transfer) self.postMessage({ id, ok: true, result: r.result }, r.__transfer);
      else self.postMessage({ id, ok: true, result: r });
    } catch (err) {
      self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
  };
}
