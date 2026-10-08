// Worker de geração de chunks de terreno (fora da thread principal: o voo
// nunca trava enquanto o relevo ganha detalhe).
import { buildChunk, transferables } from './chunkgen.js';

self.onmessage = (e) => {
  const jobs = e.data;
  for (const job of jobs) {
    try {
      const r = buildChunk(job);
      self.postMessage({ ok: true, r }, transferables(r));
    } catch (err) {
      self.postMessage({ ok: false, key: job.key, error: String(err && err.stack || err) });
    }
  }
};
