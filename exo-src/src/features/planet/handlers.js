/**
 * Handlers dos jobs do planet (worker e fallback no thread principal).
 * Cada um devolve `transfer(resultado, [buffers])` para não copiar.
 */
import { transfer } from '../../core/workerHost.js';
import { buildChunk, buildWaterDepth } from './mesher.js';
import { buildFeature } from './sdf.js';
import { buildLayer, buildMacro } from './textures.js';

export const handlers = {
  chunk(p) {
    const r = buildChunk(p);
    return transfer(r, [r.pos.buffer, r.nor.buffer, r.morph.buffer, r.data.buffer]);
  },
  feature(p) {
    const r = buildFeature(p);
    if (r.empty) return r;
    return transfer(r, [r.pos.buffer, r.nor.buffer, r.data.buffer, r.index.buffer]);
  },
  water(p) {
    const d = buildWaterDepth(p);
    return transfer({ depth: d }, [d.buffer]);
  },
  texture(p) {
    const r = buildLayer(p);
    return transfer(r, [r.albedo.buffer, r.normal.buffer]);
  },
  macro(p) {
    const m = buildMacro(p);
    return transfer({ macro: m }, [m.buffer]);
  },
};
