/**
 * GALÁXIA PROCEDURAL (puro: roda no navegador e no node, sem three).
 *
 * Unidades do mapa: 1 unidade = 1 ANO-LUZ (al). Plano galáctico = XZ, eixo
 * de rotação = +Y, centro na origem.
 *
 * Modelo de densidade estelar ρ(x, y, z) (relativo):
 *   disco exponencial  exp(−r/RD)·sech²(y/HZ)        RD = 8 000 al, HZ = 260 al
 *   braços espirais    logarítmicos (2–4 por galáxia, passo 15–22°), largura
 *                      ~900 al + 5 % de r, com aglomerados (ruído de valor)
 *   bojo               gaussiano achatado, raio ~3 600 al
 *   borda              corte suave em RMAX = 42 000 al
 *
 * SISTEMAS VIRTUAIS POR CÉLULA. O espaço é dividido em células cúbicas de
 * CELL = 40 al. Cada célula tem n ~ Poisson(λ) sistemas, λ = LAMBDA·ρ no
 * centro da célula (máx. 31). Nada é guardado: uma célula é (re)gerada sob
 * demanda a partir de hash(galáxia, cx, cy, cz) — milhões de sistemas
 * (`systemCount` ≈ 1,5·10⁷ na galáxia padrão), determinísticos.
 *
 * ÍNDICE DO SISTEMA (uint32, o `systemIndex` do contrato):
 *   code  = ((((cx+1024)·2048 + (cz+1024))·32 + (cy+16))·32 + i      (32 bits)
 *   index = code XOR homeCode
 * O XOR faz do índice 0 o SISTEMA INICIAL (a célula "home", num braço, a
 * ~62 % do raio) e 1, 2, 3… os vizinhos da mesma célula. Índice cujo `i`
 * não existe na célula é resolvido para `i mod n` (ou para o sistema mais
 * próximo, se a célula estiver vazia) — `resolve(index)`.
 *
 * Seeds: a célula usa um hash inteiro rápido derivado de
 * `seed.hash('galaxy', g)`; o CONTEÚDO de cada sistema usa o caminho
 * canônico `seed.derive('galaxy', g, 'system', index)` (ver system.js).
 */
import { wrapRng, mulberry32 } from '../../core/Rng.js';

export const CELL = 40;
export const RD = 8000;
export const HZ = 260;
export const RMAX = 42000;
export const RB = 3600;
export const LAMBDA = 30;
const MAXN = 31;

/** Classes espectrais: temperatura (K), raio aparente no céu (graus), luminosidade física (L☉), raio (R☉), intensidade de jogo (G = 1). */
export const SPECTRAL = {
  O: { t: [30000, 42000], ang: [0.85, 1.05], L: 1e5, R: 9, I: 1.6, w: 0.15 },
  B: { t: [10000, 30000], ang: [0.75, 0.95], L: 800, R: 4, I: 1.4, w: 0.6 },
  A: { t: [7500, 10000], ang: [0.65, 0.85], L: 20, R: 1.8, I: 1.2, w: 1.5 },
  F: { t: [6000, 7500], ang: [0.55, 0.78], L: 3, R: 1.3, I: 1.1, w: 3 },
  G: { t: [5200, 6000], ang: [0.5, 0.75], L: 1, R: 1, I: 1.0, w: 4 },
  K: { t: [3700, 5200], ang: [0.45, 0.62], L: 0.3, R: 0.75, I: 0.85, w: 3 },
  M: { t: [2400, 3700], ang: [0.36, 0.52], L: 0.04, R: 0.45, I: 0.65, w: 2 },
};
export const CLASSES = Object.keys(SPECTRAL);

/** Temperatura de cor (K) → RGB LINEAR normalizado (máx = 1). Aproximação de corpo negro (Tanner Helland). */
export function kelvinToRGB(K) {
  const t = K / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const lin = (v) => {
    const c = Math.max(0, Math.min(255, v)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const out = [lin(r), lin(g), lin(b)];
  const m = Math.max(...out) || 1;
  return out.map((v) => v / m);
}

// ─── nomes ─────────────────────────────────────────────────────────────
const SYL_A = ['ka', 've', 'lo', 'ri', 'tha', 'mu', 'zen', 'or', 'is', 'ae', 'qu', 'ny', 'sol', 'dra', 'phe', 'xi', 'ul', 'an', 'te', 'mor', 'sy', 'el', 'vor', 'ise', 'ran', 'cae', 'tor', 'lu', 'nah', 'ost'];
const SUFFIX = ['', '', '', '', ' Prime', ' Major', ' Minor', '-IX', '-IV', '-VII', ' Tau', ' Sigma'];
export function makeName(rng, min = 2, max = 3, suffix = false) {
  const n = rng.int(min, max);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SYL_A);
  s = s[0].toUpperCase() + s.slice(1);
  if (suffix) s += rng.pick(SUFFIX);
  return s;
}

// ─── hash inteiro rápido ────────────────────────────────────────────────
function mix32(h) {
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
export function hashCell(gseed, cx, cy, cz) {
  let h = gseed >>> 0;
  h = mix32(h ^ Math.imul(cx | 0, 0x27d4eb2d));
  h = mix32(h ^ Math.imul(cz | 0, 0x165667b1));
  h = mix32(h ^ Math.imul(cy | 0, 0x9e3779b1));
  return h;
}
/** ruído de valor 2D suave (aglomerados nos braços) */
function vnoise2(gseed, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const h = (a, b) => hashCell(gseed ^ 0x51ed27, a, 0, b) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const ENC_X = 2048;
const ENC_Y = 32;
const ENC_I = 32;
export function encode(cx, cy, cz, i) {
  return ((((cx + 1024) * ENC_X + (cz + 1024)) * ENC_Y + (cy + 16)) * ENC_I + i) >>> 0;
}
export function decode(code) {
  code >>>= 0;
  const i = code % ENC_I;
  code = Math.floor(code / ENC_I);
  const cy = (code % ENC_Y) - 16;
  code = Math.floor(code / ENC_Y);
  const cz = (code % ENC_X) - 1024;
  const cx = Math.floor(code / ENC_X) - 1024;
  return { cx, cy, cz, i };
}

/**
 * Cria o modelo da galáxia `g` a partir da seed raiz (ctx.seed).
 */
export function createGalaxy(seed, g = 0) {
  const r = seed.derive('galaxy', g);
  const gseed = seed.hash('galaxy', g, 'cells');
  const armCount = r.weighted([[2, 2], [3, 1.2], [4, 2]]);
  const pitch = (r.range(15, 22) * Math.PI) / 180;
  const tanP = Math.tan(pitch);
  const sinP = Math.sin(pitch);
  const theta0 = r.range(0, Math.PI * 2);
  const R0 = 2400; // raio onde os braços nascem (fim do bojo)
  const name = makeName(r.derive('name'), 2, 3);

  /** fator de braço 0..1 (máximo entre os braços) + aglomerados */
  function armAt(rr, th) {
    if (rr < 600) return 0;
    const lr = Math.log(Math.max(rr, R0) / R0) / tanP;
    const w = 900 + 0.05 * rr;
    let best = 0;
    for (let k = 0; k < armCount; k++) {
      const ta = theta0 + (k * Math.PI * 2) / armCount + lr;
      let d = th - ta;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      const s = (d * rr * sinP) / w;
      const f = Math.exp(-s * s);
      if (f > best) best = f;
    }
    // aglomerados (berçários) ao longo dos braços
    const clump = vnoise2(gseed, rr / 2600 + th * 3.1, th * 2.3 + rr / 9000);
    return best * (0.55 + 0.9 * clump);
  }

  /** densidade relativa no ponto (al) */
  function density(x, y, z) {
    const rr = Math.hypot(x, z);
    const th = Math.atan2(z, x);
    const ch = Math.cosh(Math.min(30, y / HZ));
    const disk = Math.exp(-rr / RD) / (ch * ch);
    const arms = armAt(rr, th);
    const yb = y * 1.7;
    const bulge = 1.3 * Math.exp(-(rr * rr + yb * yb) / (2 * RB * RB));
    const edge = rr > RMAX ? 0 : rr < RMAX * 0.8 ? 1 : 1 - (rr - RMAX * 0.8) / (RMAX * 0.2);
    return (disk * (0.16 + 1.05 * arms) + bulge) * edge;
  }

  /** pesos de classe espectral pela região: braço = jovens (O/B/A), bojo = velhas (K/M) */
  function classWeights(x, y, z) {
    const rr = Math.hypot(x, z);
    const arm = armAt(rr, Math.atan2(z, x));
    const core = Math.exp(-(rr * rr) / (2 * (RB * 1.4) ** 2));
    return CLASSES.map((c) => {
      let w = SPECTRAL[c].w;
      if (c === 'O' || c === 'B') w *= 0.35 + 2.6 * arm;
      if (c === 'A') w *= 0.7 + 1.0 * arm;
      if (c === 'K' || c === 'M') w *= 1 + 2.2 * core + 0.4 * (1 - arm);
      if (c === 'O' || c === 'B' || c === 'A') w *= 1 - 0.85 * core;
      return [c, w];
    });
  }

  // ─── células ──────────────────────────────────────────────────────
  const cellCache = new Map();
  /** sistemas (leves) da célula: [{ code, cell, i, pos:[x,y,z] (al) }] */
  function cell(cx, cy, cz) {
    const key = `${cx},${cy},${cz}`;
    let c = cellCache.get(key);
    if (c) return c;
    const lam = Math.min(MAXN, LAMBDA * density((cx + 0.5) * CELL, (cy + 0.5) * CELL, (cz + 0.5) * CELL));
    const rng = wrapRng(mulberry32(hashCell(gseed, cx, cy, cz)));
    let n = 0;
    if (lam > 1e-4) {
      if (lam < 24) {
        const L = Math.exp(-lam);
        let p = rng.next();
        while (p > L && n < MAXN) {
          n++;
          p *= rng.next();
        }
      } else n = Math.round(rng.normal(lam, Math.sqrt(lam)));
      n = Math.max(0, Math.min(MAXN, n));
    }
    c = [];
    for (let i = 0; i < n; i++) {
      c.push({
        code: encode(cx, cy, cz, i),
        i,
        cell: [cx, cy, cz],
        pos: [(cx + 0.08 + 0.84 * rng.next()) * CELL, (cy + 0.08 + 0.84 * rng.next()) * CELL, (cz + 0.08 + 0.84 * rng.next()) * CELL],
      });
    }
    if (cellCache.size > 60000) cellCache.clear();
    cellCache.set(key, c);
    return c;
  }

  // ─── sistema inicial: célula com ≥ 4 sistemas num braço a ~62 % do raio ─
  let homeCode = 0;
  {
    const hr = r.derive('home');
    const rr = RMAX * hr.range(0.5, 0.56);
    const k = hr.int(0, armCount - 1);
    const th = theta0 + (k * Math.PI * 2) / armCount + Math.log(rr / R0) / tanP;
    const hx = Math.floor((rr * Math.cos(th)) / CELL);
    const hz = Math.floor((rr * Math.sin(th)) / CELL);
    let found = null;
    for (let ring = 0; ring < 40 && !found; ring++) {
      for (let dx = -ring; dx <= ring && !found; dx++) {
        for (let dz = -ring; dz <= ring && !found; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          for (const cy of [0, -1]) {
            const c = cell(hx + dx, cy, hz + dz);
            if (c.length >= 4) {
              found = c[0];
              break;
            }
          }
        }
      }
    }
    homeCode = found ? found.code : encode(hx, 0, hz, 0);
  }

  const toCode = (index) => ((index >>> 0) ^ homeCode) >>> 0;
  const toIndex = (code) => ((code >>> 0) ^ homeCode) >>> 0;

  /** Entrada leve de um sistema EXISTENTE pelo código. */
  function entryOfCode(code) {
    const d = decode(code);
    const c = cell(d.cx, d.cy, d.cz);
    return c[d.i] || null;
  }

  /** Índice → índice válido (determinístico). */
  function resolve(index) {
    index = Number(index) >>> 0;
    const d = decode(toCode(index));
    let c = cell(d.cx, d.cy, d.cz);
    if (c.length) return toIndex(c[d.i % c.length].code);
    // célula vazia: o sistema mais próximo nas vizinhas
    for (let ring = 1; ring < 8; ring++) {
      let best = null;
      let bd = Infinity;
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            c = cell(d.cx + dx, d.cy + dy, d.cz + dz);
            for (const e of c) {
              const dd = dx * dx + dy * dy + dz * dz;
              if (dd < bd) {
                bd = dd;
                best = e;
              }
            }
          }
        }
      }
      if (best) return toIndex(best.code);
    }
    return 0;
  }

  const starCache = new Map();
  /**
   * Estrela de um sistema (classe, temperatura, cor, binária) — barata, para
   * o mapa. As DUAS primeiras sorteadas de `seed.derive('galaxy', g,
   * 'system', index)` são classe e temperatura (o system.js continua a
   * mesma sequência).
   */
  function star(index) {
    let s = starCache.get(index);
    if (s) return s;
    const code = toCode(index);
    const e = entryOfCode(code);
    const pos = e ? e.pos : [0, 0, 0];
    const sr = seed.derive('galaxy', g, 'system', index);
    let cls = sr.weighted(classWeights(pos[0], pos[1], pos[2]));
    if (index === 0) cls = 'G'; // sistema inicial: anã amarela
    const sp = SPECTRAL[cls];
    const temperature = sr.range(sp.t[0], sp.t[1]);
    const br = seed.derive('galaxy', g, 'system', index, 'binary');
    const binary = index !== 0 && br.chance(cls === 'O' || cls === 'B' ? 0.45 : 0.22);
    s = {
      index,
      id: `g${g}.s${index}`,
      pos,
      cls,
      temperature,
      color: kelvinToRGB(temperature),
      luminosity: sp.L,
      binary,
      name: makeName(seed.derive('galaxy', g, 'system', index, 'name'), 2, 3, true),
    };
    if (starCache.size > 50000) starCache.clear();
    starCache.set(index, s);
    return s;
  }

  /** Posição (al) do sistema. */
  function position(index) {
    const e = entryOfCode(toCode(resolve(index)));
    return e ? e.pos : [0, 0, 0];
  }

  /**
   * Sistemas a até `radius` al de `p` (até `max`, mais próximos primeiro).
   * → [{ index, pos, dist }]
   */
  function systemsNear(p, radius = 300, max = 4000) {
    const out = [];
    const c0 = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL)];
    const n = Math.ceil(radius / CELL);
    const ny = Math.min(n, 14);
    const r2 = radius * radius;
    for (let dx = -n; dx <= n; dx++) {
      for (let dz = -n; dz <= n; dz++) {
        if ((dx * dx + dz * dz - 2) * CELL * CELL > r2) continue;
        for (let dy = -ny; dy <= ny; dy++) {
          const cy = c0[1] + dy;
          if (cy < -16 || cy > 15) continue;
          for (const e of cell(c0[0] + dx, cy, c0[2] + dz)) {
            const ddx = e.pos[0] - p[0];
            const ddy = e.pos[1] - p[1];
            const ddz = e.pos[2] - p[2];
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 <= r2) out.push({ index: toIndex(e.code), pos: e.pos, dist: Math.sqrt(d2) });
          }
        }
      }
    }
    out.sort((a, b) => a.dist - b.dist);
    if (out.length > max) out.length = max;
    return out;
  }

  /**
   * Nuvem representativa da galáxia (para o mapa): n pontos amostrados de
   * ρ (amostragem por importância + rejeição). → Float32Array xyz e
   * Float32Array de "região" (0 disco, 1 braço, 2 bojo, 3 berçário).
   */
  function sampleCloud(n, salt = 1) {
    const rng = wrapRng(mulberry32(hashCell(gseed, 777, salt, 3)));
    const pos = new Float32Array(n * 3);
    const kind = new Float32Array(n);
    let k = 0;
    let guard = 0;
    while (k < n && guard++ < n * 40) {
      let x, y, z, reg;
      if (rng.next() < 0.2) {
        // bojo: gaussiano achatado
        x = rng.normal(0, RB * 0.9);
        z = rng.normal(0, RB * 0.9);
        y = rng.normal(0, (RB * 0.9) / 1.7);
        reg = 2;
      } else {
        // disco: r ~ Gama(2, RD) (área), y ~ logística (sech²)
        const rr = -RD * Math.log(Math.max(1e-9, rng.next() * rng.next()));
        if (rr > RMAX) continue;
        const th = rng.range(0, Math.PI * 2);
        const arm = armAt(rr, th);
        if (rng.next() > (0.16 + 1.05 * arm) / 1.6) continue;
        const u = Math.min(0.999999, Math.max(1e-6, rng.next()));
        y = (HZ / 2) * Math.log(u / (1 - u));
        x = rr * Math.cos(th);
        z = rr * Math.sin(th);
        reg = arm > 0.55 ? (arm > 1.05 ? 3 : 1) : 0;
      }
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      kind[k] = reg;
      k++;
    }
    return { pos: pos.subarray(0, k * 3), kind: kind.subarray(0, k), count: k };
  }

  let countCache = null;
  /** Estimativa do total de sistemas (integração numérica grossa; preguiçosa). */
  function systemCount() {
    if (countCache != null) return countCache;
    let sum = 0;
    const N = 96;
    const step = (RMAX * 2) / N;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = -RMAX + (i + 0.5) * step;
        const z = -RMAX + (j + 0.5) * step;
        for (let yk = -8; yk < 8; yk++) {
          const y = (yk + 0.5) * CELL * 2;
          sum += Math.min(MAXN, LAMBDA * density(x, y, z));
        }
      }
    }
    // cada amostra representa (step/CELL)² células × 2 camadas
    countCache = Math.round(sum * (step / CELL) ** 2 * 2);
    return countCache;
  }

  return {
    index: g,
    id: `g${g}`,
    name,
    arms: armCount,
    pitch,
    theta0,
    R0,
    RD,
    HZ,
    RB,
    RMAX,
    CELL,
    gseed,
    homeCode,
    density,
    armAt,
    cell,
    resolve,
    star,
    position,
    systemsNear,
    sampleCloud,
    get systemCount() {
      return systemCount();
    },
    toCode,
    toIndex,
  };
}

/** Distância (al) entre dois sistemas. */
export function lyBetween(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
