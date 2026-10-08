/**
 * PARÂMETROS DE ATMOSFERA por planeta (puro, sem three — testável em node).
 *
 * A atmosfera é derivada da SEED do planeta e do BIOMA: a forma espectral do
 * espalhamento Rayleigh (que dá a cor do céu), a névoa Mie (poeira/aerossol,
 * com cor própria via absorção), uma camada de absorção tipo ozônio (que
 * tira faixas do espectro e muda o pôr do sol) e a densidade geral.
 * Céus coloridos saem da FÍSICA, não de pintura: um céu rosa é um gás que
 * espalha mais o vermelho e o azul que o verde — e por isso o sol poente
 * desse planeta fica esverdeado.
 *
 * Unidades: tudo em QUILÔMETROS (os shaders trabalham em km para manter a
 * precisão float32 com raios de 60–200 km). Coeficientes em 1/km.
 *
 * A espessura óptica é normalizada pela escala de altura: a profundidade
 * óptica vertical do canal dominante fica parecida com a da Terra (≈ 0,27 no
 * azul) vezes `density` — o céu tem a mesma "força" em qualquer raio.
 */

/** Profundidade óptica vertical Rayleigh do canal dominante (Terra ≈ 0,265 no azul). */
const TAU_RAY = 0.22;
/** Profundidade óptica vertical Mie de referência (Terra limpa ≈ 0,005; "névoa NMS" ≫). */
const TAU_MIE = 0.02;

/**
 * Formas espectrais (r, g, b normalizados pelo máximo) e traços por bioma.
 * shapes: candidatas de cor do Rayleigh (a seed mistura duas).
 * absorb: absorção tipo ozônio (forma) e força relativa.
 * mie: [densidade relativa, albedo r,g,b] — poeira âmbar, névoa verde etc.
 */
const BIOME_SKY = {
  lush: {
    shapes: [[0.175, 0.41, 1.0], [0.16, 0.5, 1.0], [0.3, 0.45, 1.0], [0.12, 0.62, 1.0]],
    absorb: [[0.35, 1.0, 0.05], 0.6],
    mie: [1.0, [1, 1, 1]], density: [0.9, 1.25], g: [0.76, 0.84],
  },
  ocean: {
    shapes: [[0.12, 0.38, 1.0], [0.1, 0.55, 1.0], [0.2, 0.36, 1.0]],
    absorb: [[0.35, 1.0, 0.05], 0.5],
    mie: [0.8, [0.95, 0.98, 1]], density: [1.0, 1.3], g: [0.76, 0.82],
  },
  frozen: {
    shapes: [[0.2, 0.55, 1.0], [0.28, 0.6, 1.0], [0.16, 0.7, 1.0]],
    absorb: [[0.6, 1.0, 0.1], 0.35],
    mie: [0.45, [0.92, 0.97, 1]], density: [0.7, 1.0], g: [0.8, 0.88],
  },
  toxic: {
    shapes: [[0.62, 1.0, 0.22], [0.75, 1.0, 0.18], [0.5, 1.0, 0.3]],
    absorb: [[1.0, 0.05, 0.9], 1.0],
    mie: [1.2, [0.86, 1.0, 0.55]], density: [1.0, 1.4], g: [0.72, 0.8],
  },
  exotic: {
    shapes: [[0.62, 0.24, 1.0], [0.72, 0.28, 1.0], [0.55, 0.22, 0.95]],
    absorb: [[0.0, 1.0, 0.3], 4.5],
    mie: [1.1, [1.0, 0.82, 0.9]], density: [0.8, 1.05], g: [0.74, 0.82],
  },
  scorched: {
    shapes: [[1.0, 0.6, 0.3], [1.0, 0.5, 0.22], [1.0, 0.7, 0.42]],
    absorb: [[0.05, 0.35, 1.0], 1.3],
    mie: [1.7, [1.0, 0.74, 0.48]], density: [0.9, 1.3], g: [0.7, 0.78],
  },
  radioactive: {
    shapes: [[0.8, 1.0, 0.3], [1.0, 0.9, 0.25], [0.6, 1.0, 0.4]],
    absorb: [[0.1, 0.3, 1.0], 1.2],
    mie: [1.1, [1.0, 0.95, 0.6]], density: [0.9, 1.3], g: [0.72, 0.8],
  },
  barren: {
    shapes: [[0.175, 0.41, 1.0], [0.4, 0.42, 0.6]],
    absorb: [[0.35, 1.0, 0.05], 0.3],
    mie: [0.6, [1, 0.95, 0.9]], density: [0.15, 0.3], g: [0.76, 0.8],
  },
  gas: {
    shapes: [[0.5, 0.6, 1.0], [1.0, 0.8, 0.5], [0.4, 0.8, 1.0]],
    absorb: [[0.2, 0.5, 1.0], 0.5],
    mie: [2.0, [1, 0.95, 0.85]], density: [1.2, 1.6], g: [0.72, 0.8],
  },
};

/** Cores de aurora (base → topo), lineares. */
const AURORA = [
  [[0.12, 1.0, 0.42], [0.55, 0.12, 0.85]],
  [[0.1, 0.9, 0.75], [0.25, 0.3, 1.0]],
  [[0.45, 1.0, 0.25], [1.0, 0.18, 0.45]],
  [[0.95, 0.25, 0.8], [0.3, 0.2, 1.0]],
];

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const max3 = (v) => Math.max(v[0], v[1], v[2]);

/** RNG mínimo determinístico (mulberry32) a partir de um uint32. */
export function rngFrom(seed) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

/**
 * Deriva a atmosfera de um corpo.
 * @param {object} o
 *   radius (m) raio do planeta; atmosphere (formato do universe, m) ou null;
 *   biome; seed (uint32); overrides opcionais { biome, density, mie, aurora, shape }.
 * @returns parâmetros em km (ver topo do arquivo) + `contract` no formato do universe (m).
 */
export function deriveAtmosphere({ radius = 120000, atmosphere = null, biome = 'lush', seed = 1, temperature = null, overrides = {} } = {}) {
  const r = rngFrom(seed ^ 0x51ab3e7);
  const b = overrides.biome || biome;
  const spec = BIOME_SKY[b] || BIOME_SKY.lush;
  const Rb = radius / 1000;
  const has = !!atmosphere || !!overrides.biome || overrides.force === true;
  const atmo = atmosphere || { radius: radius * 1.1, rayleighHeight: radius * 0.025, mieHeight: radius * 0.005 };
  const Rt = Math.max(Rb * 1.02, atmo.radius / 1000);
  // escalas de altura: no mínimo ~30% (Rayleigh) e ~8% (Mie) da espessura —
  // planetas pequenos com H curto demais virariam um "nevoeiro de chão"
  const thick0 = Rt - Rb;
  const Hr = Math.max(0.2, (atmo.rayleighHeight || radius * 0.025) / 1000, thick0 * 0.3);
  const Hm = Math.max(0.05, (atmo.mieHeight || radius * 0.005) / 1000, thick0 * 0.08);

  // forma espectral do Rayleigh: mistura de duas candidatas do bioma
  const sa = r.pick(spec.shapes);
  const sb = r.pick(spec.shapes);
  let shape = overrides.shape || lerp3(sa, sb, r.next());
  const m = max3(shape);
  shape = shape.map((v) => v / m);
  const density = overrides.density ?? r.range(spec.density[0], spec.density[1]);
  const kRay = (TAU_RAY * density) / Hr;
  const rayleigh = shape.map((v) => v * kRay);

  // Mie: névoa/poeira com albedo colorido (a cor vem da absorção)
  const mieAmt = (overrides.mie ?? spec.mie[0] * r.range(0.6, 1.6)) * density;
  const kMie = (TAU_MIE * mieAmt) / Hm;
  const alb = spec.mie[1];
  const mieScat = alb.map((a) => kMie * a * 0.92);
  const mieExt = [kMie, kMie, kMie];
  const mieG = r.range(spec.g[0], spec.g[1]);

  // camada de absorção (tipo ozônio): tenda centrada a 30% da espessura
  const thick = Rt - Rb;
  const absC = thick * 0.45;
  const absW = thick * 0.22;
  const tauAbs = 0.06 * spec.absorb[1] * r.range(0.6, 1.4) * density;
  const aShape = spec.absorb[0];
  const absorb = aShape.map((v) => (v * tauAbs) / absW);

  // aurora: planetas frios (bioma gelado ou temperatura baixa); rara nos outros
  let aurora = 0;
  if (b === 'frozen') aurora = r.range(0.8, 1.2);
  else if (temperature != null && temperature < -10) aurora = r.range(0.5, 1.0);
  else if (r.next() < 0.12) aurora = r.range(0.25, 0.6);
  if (overrides.aurora != null) aurora = overrides.aurora;
  const ac = r.pick(AURORA);

  // brilho noturno (airglow) — a cor do próprio gás, bem fraca
  const airglow = lerp3(shape, [0.35, 0.45, 1.0], 0.5).map((v) => v * 0.012);

  const off = !has;
  const z3 = [0, 0, 0];
  const p = {
    has: !off,
    biome: b,
    Rb,
    Rt: off ? Rb * 1.02 : Rt,
    Hr,
    Hm,
    rayleigh: off ? z3 : rayleigh,
    mieScat: off ? z3 : mieScat,
    mieExt: off ? z3 : mieExt,
    mieG,
    absorb: off ? z3 : absorb,
    absC,
    absW,
    groundAlbedo: [0.12, 0.13, 0.1],
    aurora: off ? 0 : aurora,
    auroraLow: ac[0],
    auroraHigh: ac[1],
    airglow: off ? z3 : airglow,
    /** ganho artístico do espalhamento (mesmo no céu e na perspectiva aérea) */
    skyGain: 1.4,
    shape,
    density,
  };
  // formato do contrato (metros), para quem lê sky.atmosphere
  p.contract = off
    ? null
    : {
        radius: p.Rt * 1000,
        rayleigh: rayleigh.map((v) => v / 1000),
        rayleighHeight: Hr * 1000,
        mie: kMie / 1000,
        mieHeight: Hm * 1000,
        mieG,
        sunIntensity: 1,
        absorption: absorb.map((v) => v / 1000),
        absorptionCenter: absC * 1000,
        absorptionWidth: absW * 1000,
        biome: b,
      };
  return p;
}

/** Cor aproximada do céu diurno de um corpo (para o limbo de luas/planetas no céu). */
export function rimColorOf(p) {
  if (!p.has) return [0, 0, 0];
  // Rayleigh opticamente fino ≈ forma espectral; mistura um pouco da névoa Mie
  const s = p.rayleigh.map((v, i) => v * p.Hr + p.mieScat[i] * p.Hm * 0.5);
  const m = max3(s) || 1;
  return s.map((v) => v / m);
}

// ─── versões em JS (CPU) das integrais, para luzes e neblina ────────────

function raySphere(ox, oy, oz, dx, dy, dz, R) {
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - R * R;
  const h = b * b - c;
  if (h < 0) return null;
  const s = Math.sqrt(h);
  return [-b - s, -b + s];
}

function medium(p, h, out) {
  const dr = Math.exp(-h / p.Hr);
  const dm = Math.exp(-h / p.Hm);
  const da = Math.max(0, 1 - Math.abs(h - p.absC) / p.absW);
  for (let k = 0; k < 3; k++) {
    out.rs[k] = p.rayleigh[k] * dr;
    out.ms[k] = p.mieScat[k] * dm;
    out.ext[k] = p.rayleigh[k] * dr + p.mieExt[k] * dm + p.absorb[k] * da;
  }
  return out;
}

/** Sombra suave do planeta para uma luz com cosseno zenital mu, no raio r. */
export function planetShadow(p, r, mu) {
  const s = Math.min(1, p.Rb / r);
  const muH = -Math.sqrt(Math.max(0, 1 - s * s));
  const e = 0.006;
  const t = Math.max(0, Math.min(1, (mu - (muH - e)) / (2 * e)));
  return t * t * (3 - 2 * t);
}

/** Transmitância RGB do ponto (km, relativo ao centro) até o topo, na direção d. */
export function transmittanceJS(p, pos, d, steps = 32) {
  const r = Math.hypot(pos[0], pos[1], pos[2]);
  const mu = (pos[0] * d[0] + pos[1] * d[1] + pos[2] * d[2]) / r;
  const sh = planetShadow(p, r, mu);
  if (sh <= 0) return [0, 0, 0];
  const hit = raySphere(pos[0], pos[1], pos[2], d[0], d[1], d[2], p.Rt);
  if (!hit || hit[1] <= 0) return [sh, sh, sh];
  const t1 = hit[1];
  const t0 = Math.max(0, hit[0]);
  const dt = (t1 - t0) / steps;
  const tau = [0, 0, 0];
  const tauM = [0, 0, 0];
  const m = { rs: [0, 0, 0], ms: [0, 0, 0], ext: [0, 0, 0] };
  for (let i = 0; i < steps; i++) {
    const t = t0 + (i + 0.5) * dt;
    const h = Math.max(0, Math.hypot(pos[0] + d[0] * t, pos[1] + d[1] * t, pos[2] + d[2] * t) - p.Rb);
    medium(p, h, m);
    const dm = Math.exp(-h / p.Hm);
    for (let k = 0; k < 3; k++) {
      tau[k] += (m.ext[k] - p.mieExt[k] * dm) * dt;
      tauM[k] += p.mieExt[k] * dm * dt;
    }
  }
  // compensação de massa de ar só no gás (= AIRMASS_BOOST em luts.js)
  const boost = 1 + 2.0 * Math.pow(1 - Math.abs(mu), 4);
  return tau.map((v, k) => sh * Math.exp(-v * boost - tauM[k]));
}

/**
 * Espalhamento simples (sem múltiplo) ao longo de um raio — luz ambiente e
 * cor da neblina na CPU. lights: [{ dir:[3], E:[3] }]. Devolve { L, T }.
 */
export function scatterJS(p, pos, d, lights, { steps = 12, lightSteps = 6, tMax = Infinity } = {}) {
  const L = [0, 0, 0];
  const T = [1, 1, 1];
  const top = raySphere(pos[0], pos[1], pos[2], d[0], d[1], d[2], p.Rt);
  if (!top || top[1] <= 0) return { L, T };
  const t0 = Math.max(0, top[0]);
  let t1 = Math.min(top[1], tMax);
  const g = raySphere(pos[0], pos[1], pos[2], d[0], d[1], d[2], p.Rb);
  if (g && g[0] > 0) t1 = Math.min(t1, g[0]);
  if (t1 <= t0) return { L, T };
  const dt = (t1 - t0) / steps;
  const m = { rs: [0, 0, 0], ms: [0, 0, 0], ext: [0, 0, 0] };
  const g2 = p.mieG * p.mieG;
  for (let i = 0; i < steps; i++) {
    const t = t0 + (i + 0.5) * dt;
    const q = [pos[0] + d[0] * t, pos[1] + d[1] * t, pos[2] + d[2] * t];
    const h = Math.max(0, Math.hypot(q[0], q[1], q[2]) - p.Rb);
    medium(p, h, m);
    const S = [0, 0, 0];
    for (const l of lights) {
      const mu = d[0] * l.dir[0] + d[1] * l.dir[1] + d[2] * l.dir[2];
      const pr = (3 / (16 * Math.PI)) * (1 + mu * mu);
      const pm = ((3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu))) / ((2 + g2) * Math.pow(1 + g2 - 2 * p.mieG * mu, 1.5));
      const ts = transmittanceJS(p, q, l.dir, lightSteps);
      for (let k = 0; k < 3; k++) {
        // termo de múltiplo espalhamento aproximado: isotrópico, 40% extra
        S[k] += l.E[k] * ts[k] * (m.rs[k] * (pr + 0.03) + m.ms[k] * (pm + 0.03));
      }
    }
    for (let k = 0; k < 3; k++) {
      const st = Math.exp(-m.ext[k] * dt);
      const e = Math.max(m.ext[k], 1e-9);
      L[k] += T[k] * ((S[k] - S[k] * st) / e);
      T[k] *= st;
    }
  }
  return { L, T };
}
