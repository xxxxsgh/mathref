// Layout determinístico do céu de um sistema estelar: plano galáctico,
// centro galáctico, nuvens de nebulosa (blobs volumétricos) e estrelas
// embutidas que iluminam as nebulosas por dentro. Dados puros (sem Three),
// compartilhados pelo cubo do céu (SkyCube) e pelo campo de estrelas.

import { makeRng, hash } from '../../core/Rng.js';

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const randDir = (r) => {
  const z = r() * 2 - 1;
  const t = r() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [Math.cos(t) * s, z, Math.sin(t) * s];
};

/**
 * O plano da Via Láctea é o mesmo para a galáxia toda, mas cada sistema
 * enxerga a faixa um pouco girada (posição galáctica diferente) — dá
 * identidade aos céus sem perder a coerência.
 */
export function skyLayout(system) {
  const r = makeRng(hash(system.seed, 'sky'));
  const gp = system.galPos || [0, 0, 0];
  const tilt = (gp[0] * 0.0007 + gp[2] * 0.0004) % 0.5;
  const galN = norm([0.28 + tilt, 0.9, 0.33 - tilt * 0.6]);
  // centro galáctico: perpendicular ao normal, girado pela posição do sistema
  const ref = norm(cross(galN, [0, 0, 1]));
  const ref2 = cross(galN, ref);
  const ang = Math.atan2(-gp[2] || -1, -gp[0] || 0.2) + 1.1;
  const gc = norm([ref[0] * Math.cos(ang) + ref2[0] * Math.sin(ang), ref[1] * Math.cos(ang) + ref2[1] * Math.sin(ang), ref[2] * Math.cos(ang) + ref2[2] * Math.sin(ang)]);

  const neb = system.nebula || { color1: [0.5, 0.2, 0.5], color2: [0.1, 0.3, 0.6], density: 0.5 };
  const density = neb.density ?? 0.5;
  // nuvens: a principal perto do plano galáctico (onde nebulosas nascem)
  const blobs = [];
  const nBlobs = 2 + Math.round(density * 3);
  for (let i = 0; i < nBlobs; i++) {
    let c = randDir(r);
    if (i === 0 || r() < 0.6) {
      // puxa para o plano galáctico
      const d = c[0] * galN[0] + c[1] * galN[1] + c[2] * galN[2];
      c = norm([c[0] - galN[0] * d * 0.8, c[1] - galN[1] * d * 0.8, c[2] - galN[2] * d * 0.8]);
    }
    const main = i === 0;
    blobs.push({
      c, // direção do centro
      dist: main ? 1.55 : r.range(1.4, 2.1), // distância no "volume do céu"
      radius: main ? 0.55 + density * 0.35 : r.range(0.22, 0.5),
      weight: main ? 1.0 : r.range(0.45, 0.85),
      hue: r(), // mistura color1/color2
      seed: [r() * 10, r() * 10, r() * 10],
    });
  }
  // estrelas embutidas (jovens, quentes) — iluminam a nebulosa por dentro
  const embedded = [];
  for (const b of blobs) {
    const n = 1 + Math.floor(r() * 2.5 * (0.4 + density));
    for (let k = 0; k < n; k++) {
      const off = randDir(r);
      const s = b.radius * r.range(0.05, 0.45);
      const p = [b.c[0] * b.dist + off[0] * s, b.c[1] * b.dist + off[1] * s, b.c[2] * b.dist + off[2] * s];
      const temp = r.range(9000, 30000);
      embedded.push({ pos: p, dir: norm(p), temp, power: r.range(0.6, 1.6) * b.weight });
    }
  }
  return {
    galN,
    gc,
    blobs,
    embedded,
    density,
    color1: neb.color1,
    color2: neb.color2,
    seed: hash(system.seed, 'stars'),
  };
}
