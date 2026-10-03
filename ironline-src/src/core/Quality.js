/**
 * Configurações de qualidade. Um objeto simples e mutável compartilhado por
 * todas as features (ctx.quality). Mudanças passam por quality.set(), que
 * emite 'quality:change' no bus.
 *
 * Campos são DICAS: cada feature decide como honrá-las.
 */
export const QUALITY_PRESETS = {
  low: {
    dprCap: 1, msaa: false, shadows: true, shadowMapSize: 1024, shadowCascades: 1,
    anisotropy: 2, ssao: false, ssr: false, bloom: false, taa: false, motionBlur: false,
    volumetrics: false, drawDistance: 220, particleBudget: 0.4, textureSize: 512, foliage: 0.3,
  },
  medium: {
    dprCap: 1, msaa: true, shadows: true, shadowMapSize: 2048, shadowCascades: 2,
    anisotropy: 4, ssao: true, ssr: false, bloom: true, taa: false, motionBlur: false,
    volumetrics: false, drawDistance: 350, particleBudget: 0.7, textureSize: 1024, foliage: 0.6,
  },
  high: {
    // 1.0: o alvo é 60 fps num notebook intermediário — telas HiDPI
    // multiplicariam o custo do pós (AO, GI, volumétrico, TAA) por 2–4×
    dprCap: 1, msaa: true, shadows: true, shadowMapSize: 2048, shadowCascades: 3,
    anisotropy: 8, ssao: true, ssr: true, bloom: true, taa: true, motionBlur: true,
    volumetrics: true, drawDistance: 500, particleBudget: 1, textureSize: 2048, foliage: 1,
  },
  ultra: {
    dprCap: 2, msaa: true, shadows: true, shadowMapSize: 4096, shadowCascades: 4,
    anisotropy: 16, ssao: true, ssr: true, bloom: true, taa: true, motionBlur: true,
    volumetrics: true, drawDistance: 800, particleBudget: 1.5, textureSize: 2048, foliage: 1.3,
  },
};

export function createQuality(level = 'high', bus = null) {
  const q = {
    level: QUALITY_PRESETS[level] ? level : 'high',
    ...QUALITY_PRESETS[QUALITY_PRESETS[level] ? level : 'high'],
    /** Aplica um preset inteiro ('low'|'medium'|'high'|'ultra') ou um patch parcial. */
    set(levelOrPatch) {
      if (typeof levelOrPatch === 'string') {
        if (!QUALITY_PRESETS[levelOrPatch]) return q;
        Object.assign(q, QUALITY_PRESETS[levelOrPatch], { level: levelOrPatch });
      } else Object.assign(q, levelOrPatch);
      bus?.emit('quality:change', q);
      return q;
    },
  };
  return q;
}
