// Presets de qualidade. O sistema `rendering` lê estes valores para montar o
// pipeline; `performance` ajusta `renderScale` dinamicamente. Outros sistemas
// podem ler (ex.: planets usa terrainLod, fauna usa creatureBudget).
//
// Escolha: ?q=ultra|high|medium|mobile > preferência salva > detecção.

export const PRESETS = {
  ultra: {
    label: 'Ultra', dprCap: 2, renderScale: 1.0, minScale: 0.7,
    shadows: true, shadowMapSize: 4096, shadowCascades: 4,
    bloom: true, taa: true, motionBlur: true, dof: true, lensFlare: true, filmGrain: true, godRays: true, ssao: true,
    cloudSteps: 64, atmosphereSteps: 16, nebulaSteps: 48,
    terrainLod: 7, terrainChunkRes: 48, foliageDensity: 1.0, creatureBudget: 40,
    particleBudget: 200000, drawDistance: 1.0, anisotropy: 16,
  },
  high: {
    label: 'Alto', dprCap: 1.5, renderScale: 1.0, minScale: 0.6,
    shadows: true, shadowMapSize: 2048, shadowCascades: 3,
    bloom: true, taa: true, motionBlur: true, dof: false, lensFlare: true, filmGrain: true, godRays: true, ssao: false,
    cloudSteps: 40, atmosphereSteps: 12, nebulaSteps: 32,
    terrainLod: 6, terrainChunkRes: 32, foliageDensity: 0.7, creatureBudget: 28,
    particleBudget: 100000, drawDistance: 0.85, anisotropy: 8,
  },
  medium: {
    label: 'Médio', dprCap: 1.25, renderScale: 0.85, minScale: 0.55,
    shadows: true, shadowMapSize: 1024, shadowCascades: 2,
    bloom: true, taa: false, motionBlur: false, dof: false, lensFlare: true, filmGrain: false, godRays: false, ssao: false,
    cloudSteps: 24, atmosphereSteps: 8, nebulaSteps: 20,
    terrainLod: 5, terrainChunkRes: 24, foliageDensity: 0.45, creatureBudget: 16,
    particleBudget: 40000, drawDistance: 0.7, anisotropy: 4,
  },
  mobile: {
    label: 'Mobile', dprCap: 1.0, renderScale: 0.75, minScale: 0.5,
    shadows: false, shadowMapSize: 1024, shadowCascades: 1,
    bloom: true, taa: false, motionBlur: false, dof: false, lensFlare: false, filmGrain: false, godRays: false, ssao: false,
    cloudSteps: 12, atmosphereSteps: 6, nebulaSteps: 12,
    terrainLod: 4, terrainChunkRes: 16, foliageDensity: 0.25, creatureBudget: 8,
    particleBudget: 15000, drawDistance: 0.55, anisotropy: 2,
  },
};
export const PRESET_ORDER = ['ultra', 'high', 'medium', 'mobile'];

export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || iPadOS;
}

/** Detecção heurística inicial (o sistema performance refina em runtime). */
export function detectPreset(backend) {
  if (isMobileDevice()) return 'mobile';
  if (backend === 'webgl') return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  if (cores >= 12 && mem >= 8) return 'ultra';
  if (cores >= 6) return 'high';
  return 'medium';
}

export function makeQuality(name) {
  const q = { name, ...structuredClone(PRESETS[name] || PRESETS.high) };
  q.dynamicScale = q.renderScale; // escala dinâmica atual (performance mexe aqui)
  return q;
}
