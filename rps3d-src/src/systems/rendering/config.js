// Configuração do pipeline derivada do preset de qualidade (ctx.quality).
// Cada efeito liga/desliga por preset; overrides por URL para testes:
//   ?aa=taa|smaa|fxaa|off   ?bloom=0  ?flare=0  ?mblur=0  ?grain=0  ?godrays=0  ?dof=1
//
// Anti-aliasing: TAA próprio (post/TemporalAA.js — reprojeção por profundidade,
// sem MRT de velocidade, funciona igual no WebGPU e no WebGL2) nos presets que
// pedem `taa`; SMAA no médio; FXAA no mobile.

const PER = {
  ultra: { fireballSteps: 26, godRaySamples: 48, mbSamples: 12, flashLights: 4, envSize: 256, envInterval: 1.0, flareGhosts: 6, sparkCap: 32768, smokeCap: 8192, debrisCap: 2048 },
  high: { fireballSteps: 20, godRaySamples: 36, mbSamples: 8, flashLights: 3, envSize: 256, envInterval: 1.5, flareGhosts: 5, sparkCap: 16384, smokeCap: 6144, debrisCap: 1536 },
  medium: { fireballSteps: 14, godRaySamples: 24, mbSamples: 6, flashLights: 2, envSize: 128, envInterval: 3.0, flareGhosts: 4, sparkCap: 8192, smokeCap: 3072, debrisCap: 768 },
  mobile: { fireballSteps: 9, godRaySamples: 16, mbSamples: 4, flashLights: 1, envSize: 64, envInterval: 6.0, flareGhosts: 3, sparkCap: 3072, smokeCap: 1536, debrisCap: 384 },
};

export function makeFxConfig(q, backend, params) {
  const name = PER[q.name] ? q.name : 'high';
  const p = PER[name];
  const flag = (key, def) => {
    const v = params?.get(key);
    if (v === null || v === undefined) return def;
    return v !== '0' && v !== 'false' && v !== 'off';
  };
  let aa = q.taa ? 'taa' : name === 'mobile' ? 'fxaa' : 'smaa';
  const aaParam = params?.get('aa');
  if (aaParam && ['taa', 'smaa', 'fxaa', 'off'].includes(aaParam)) aa = aaParam;
  const budget = q.particleBudget || 40000;
  // orçamento de partículas repartido entre camadas, limitado pelo teto do preset
  const sparkCap = Math.min(p.sparkCap, Math.floor(budget * 0.55));
  const smokeCap = Math.min(p.smokeCap, Math.floor(budget * 0.3));
  const debrisCap = Math.min(p.debrisCap, Math.floor(budget * 0.08));
  return {
    preset: name,
    aa,
    bloom: flag('bloom', q.bloom !== false),
    bloomStrength: name === 'mobile' ? 0.28 : 0.34,
    bloomRadius: 0.62,
    bloomThreshold: 0.72,
    lensFlare: flag('flare', !!q.lensFlare),
    ghosts: flag('ghosts', !!q.lensFlare && name !== 'mobile'),
    flareGhosts: p.flareGhosts,
    motionBlur: flag('mblur', !!q.motionBlur),
    mbSamples: p.mbSamples,
    dofAllowed: flag('dof', !!q.dof),
    grain: flag('grain', !!q.filmGrain),
    godRays: flag('godrays', !!q.godRays),
    godRaySamples: p.godRaySamples,
    chromatic: name !== 'mobile',
    heatDistortion: name !== 'mobile' || true,
    shadows: flag('shadows', !!q.shadows),
    shadowCascades: Math.max(1, q.shadowCascades || 1),
    shadowMapSize: q.shadowMapSize || 1024,
    fireballSteps: p.fireballSteps,
    flashLights: p.flashLights,
    envSize: p.envSize,
    envInterval: p.envInterval,
    sparkCap: Math.max(1024, sparkCap),
    smokeCap: Math.max(512, smokeCap),
    debrisCap: Math.max(128, debrisCap),
  };
}

/** Assinatura dos campos que exigem reconstruir o grafo de pós-processamento. */
export function pipelineSignature(fx, extra = '') {
  return [fx.aa, fx.bloom, fx.lensFlare, fx.ghosts, fx.motionBlur, fx.grain, fx.godRays, fx.chromatic, fx.heatDistortion, extra].join('|');
}
