/**
 * ESTADOS DE CLIMA (puro, sem three). Cada estado é um conjunto de
 * parâmetros numéricos; a transição é uma interpolação linear entre o estado
 * atual e o alvo (cores e números), então qualquer par de estados mistura
 * suavemente (ex.: céu limpo → nevasca em 20 s).
 *
 *   coverage   cobertura de nuvens (null = a do planeta em céu limpo)
 *   typeBias   −1 estrato … +1 cumulonimbo
 *   storm      quanto as células de tempestade do mapa de clima engrossam
 *   darkness   escurecimento (nuvens mais densas, ambiente menor)
 *   precip     intensidade de precipitação (0..1); `kind` decide o quê
 *   fog        extinção da neblina na altura da câmera (1/m); fogH escala (m)
 *   fogTint    cor relativa da neblina (multiplica a luz do céu/sol)
 *   lightning  relâmpagos por segundo (média)
 *   wind       velocidade do vento (m/s)
 *   cirrus     densidade dos cirros
 *   lens       efeitos no visor (gotas, gelo, poeira)
 *   heat       ondulação de calor
 */
export const STATES = {
  clear: { coverage: null, typeBias: 0, storm: 0, darkness: 0, precip: 0, fog: 0, fogH: 1200, fogTint: [1, 1, 1], lightning: 0, wind: 7, cirrus: 0.75, detail: 0.6, lens: 0, heat: 0 },
  cloudy: { coverage: 0.82, typeBias: -0.2, storm: 0.1, darkness: 0.2, precip: 0, fog: 0.00004, fogH: 1500, fogTint: [0.85, 0.88, 0.92], lightning: 0, wind: 10, cirrus: 0.3, detail: 0.55, lens: 0, heat: 0 },
  storm: { coverage: 0.7, typeBias: 0.35, storm: 1, darkness: 0.75, precip: 1, fog: 0.00003, fogH: 1100, fogTint: [0.4, 0.45, 0.52], lightning: 0.14, wind: 17, cirrus: 0, detail: 0.45, lens: 1, heat: 0 },
  acid: { coverage: 0.9, typeBias: 0.35, storm: 0.6, darkness: 0.55, precip: 0.85, fog: 0.00045, fogH: 1400, fogTint: [0.78, 0.95, 0.36], lightning: 0.05, wind: 11, cirrus: 0, detail: 0.48, lens: 1, heat: 0 },
  blizzard: { coverage: 0.97, typeBias: -0.5, storm: 0.25, darkness: 0.45, precip: 1, fog: 0.0016, fogH: 900, fogTint: [0.86, 0.91, 1.0], lightning: 0, wind: 21, cirrus: 0, detail: 0.5, lens: 1, heat: 0 },
  dust: { coverage: 0.3, typeBias: -0.25, storm: 0, darkness: 0.15, precip: 1, fog: 0.0011, fogH: 650, fogTint: null, lightning: 0, wind: 19, cirrus: 0.3, detail: 0.6, lens: 1, heat: 0.35 },
  heat: { coverage: 0.12, typeBias: -0.3, storm: 0, darkness: 0, precip: 0.35, fog: 0.00028, fogH: 500, fogTint: null, lightning: 0, wind: 9, cirrus: 0.5, detail: 0.6, lens: 0.4, heat: 1 },
};

/** Precipitação de cada estado (o planeta pode trocar chuva por neve). */
export const KIND = { clear: null, cloudy: null, storm: 'rain', acid: 'acid', blizzard: 'snow', dust: 'dust', heat: 'dust' };

/** Cobertura de céu limpo por bioma. */
export const BIOME_COVER = { lush: 0.5, ocean: 0.58, frozen: 0.52, toxic: 0.6, radioactive: 0.4, scorched: 0.24, barren: 0.18, exotic: 0.46 };

/** Ciclo automático por bioma: [estado, peso]. */
export const BIOME_CYCLE = {
  lush: [['clear', 6], ['cloudy', 2], ['storm', 1.5]],
  ocean: [['clear', 5], ['cloudy', 3], ['storm', 2]],
  frozen: [['clear', 4], ['cloudy', 2], ['blizzard', 2.5]],
  toxic: [['clear', 4], ['cloudy', 2], ['acid', 2.5]],
  radioactive: [['clear', 4], ['dust', 1.5], ['acid', 1.2]],
  scorched: [['clear', 4], ['heat', 2.5], ['dust', 2]],
  barren: [['clear', 6], ['dust', 2]],
  exotic: [['clear', 5], ['cloudy', 2], ['storm', 1]],
};

const NUM_KEYS = ['typeBias', 'storm', 'darkness', 'precip', 'fog', 'fogH', 'lightning', 'wind', 'cirrus', 'detail', 'lens', 'heat', 'coverage'];

/** Resolve um estado para valores concretos (cobertura e tinta da neblina do planeta). */
export function resolveState(name, { cover = 0.45, dustTint = [0.9, 0.62, 0.35] } = {}) {
  const s = STATES[name] || STATES.clear;
  const out = { ...s };
  out.coverage = s.coverage == null ? cover : s.coverage;
  out.fogTint = (s.fogTint || dustTint).slice();
  return out;
}

/** Interpola a → b (in place em `out`). */
export function lerpState(out, a, b, t) {
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  out.fogTint = [0, 1, 2].map((i) => a.fogTint[i] + (b.fogTint[i] - a.fogTint[i]) * t);
  return out;
}

export function copyState(s) {
  return { ...s, fogTint: s.fogTint.slice() };
}
