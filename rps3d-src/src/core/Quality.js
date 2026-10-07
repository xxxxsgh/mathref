// Presets de qualidade + detecção automática + escala dinâmica de resolução.
//
// Sistemas leem ctx.quality.p.<campo> (sempre presente nos 4 presets) e
// escutam 'quality:change' para reconstruir o que depende do preset.
// URL: ?q=ultra|high|medium|mobile força um preset.

export const PRESETS = {
  ultra: {
    name: 'Ultra',
    pixelRatioMax: 2,
    renderScaleMin: 0.7,
    targetFps: 60,
    shadowMapSize: 4096,
    shadowCascades: 4,
    shadowFar: 1200,
    bloom: true,
    taa: true,
    motionBlur: true,
    dof: true,
    film: true,
    lensflare: true,
    godrays: true,
    ao: true,
    atmosphereSteps: 16,
    cloudSteps: 48,
    nebulaSteps: 64,
    terrainChunkRes: 48, // vértices por lado de um chunk do quadtree
    terrainMaxLod: 16,
    terrainSplitFactor: 2.2, // maior = mais detalhe
    floraDensity: 1,
    faunaMax: 40,
    particlesMax: 60000,
    asteroidCount: 4000,
    debrisCount: 600,
    npcMax: 30,
    anisotropy: 16,
  },
  high: {
    name: 'Alto',
    pixelRatioMax: 1.5,
    renderScaleMin: 0.65,
    targetFps: 60,
    shadowMapSize: 2048,
    shadowCascades: 3,
    shadowFar: 800,
    bloom: true,
    taa: true,
    motionBlur: true,
    dof: false,
    film: true,
    lensflare: true,
    godrays: true,
    ao: false,
    atmosphereSteps: 12,
    cloudSteps: 32,
    nebulaSteps: 40,
    terrainChunkRes: 40,
    terrainMaxLod: 15,
    terrainSplitFactor: 1.8,
    floraDensity: 0.7,
    faunaMax: 28,
    particlesMax: 30000,
    asteroidCount: 2500,
    debrisCount: 350,
    npcMax: 20,
    anisotropy: 8,
  },
  medium: {
    name: 'Médio',
    pixelRatioMax: 1.25,
    renderScaleMin: 0.6,
    targetFps: 60,
    shadowMapSize: 2048,
    shadowCascades: 2,
    shadowFar: 400,
    bloom: true,
    taa: false,
    motionBlur: false,
    dof: false,
    film: true,
    lensflare: true,
    godrays: false,
    ao: false,
    atmosphereSteps: 8,
    cloudSteps: 20,
    nebulaSteps: 24,
    terrainChunkRes: 32,
    terrainMaxLod: 14,
    terrainSplitFactor: 1.4,
    floraDensity: 0.45,
    faunaMax: 16,
    particlesMax: 12000,
    asteroidCount: 1200,
    debrisCount: 180,
    npcMax: 12,
    anisotropy: 4,
  },
  mobile: {
    name: 'Mobile',
    pixelRatioMax: 1.0,
    renderScaleMin: 0.55,
    targetFps: 30,
    shadowMapSize: 1024,
    shadowCascades: 1,
    shadowFar: 150,
    bloom: true,
    taa: false,
    motionBlur: false,
    dof: false,
    film: false,
    lensflare: false,
    godrays: false,
    ao: false,
    atmosphereSteps: 6,
    cloudSteps: 12,
    nebulaSteps: 16,
    terrainChunkRes: 24,
    terrainMaxLod: 13,
    terrainSplitFactor: 1.1,
    floraDensity: 0.25,
    faunaMax: 8,
    particlesMax: 5000,
    asteroidCount: 500,
    debrisCount: 80,
    npcMax: 6,
    anisotropy: 2,
  },
};

export function detectPreset(isWebGPU) {
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mobile = iPad || /iPhone|Android|Mobile/.test(ua);
  if (mobile) return 'mobile';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  if (!isWebGPU) return cores >= 8 ? 'medium' : 'mobile';
  if (cores >= 12 && mem >= 8) return 'ultra';
  if (cores >= 6) return 'high';
  return 'medium';
}

export class Quality {
  constructor(bus, name) {
    this.bus = bus;
    this.set(name, true);
    this.renderScale = 1; // multiplicador dinâmico (governador)
    this.dynamic = true;
    this._acc = 0;
    this._n = 0;
    this._cool = 0;
  }
  set(name, silent = false) {
    if (!PRESETS[name]) name = 'high';
    this.name = name;
    this.p = { ...PRESETS[name] };
    this.renderScale = 1;
    if (!silent) this.bus.emit('quality:change', { name, p: this.p });
  }
  /**
   * Governador de resolução: chamado a cada frame com o dt real (s).
   * Ajusta renderScale entre renderScaleMin e 1 para segurar o fps-alvo.
   * Retorna true se mudou (o núcleo então redimensiona o renderer).
   */
  govern(dt) {
    if (!this.dynamic) return false;
    this._acc += dt;
    this._n++;
    this._cool -= dt;
    if (this._acc < 0.75 || this._cool > 0) return false;
    const avg = this._acc / this._n;
    this._acc = 0;
    this._n = 0;
    const target = 1 / this.p.targetFps;
    let s = this.renderScale;
    if (avg > target * 1.15) s *= 0.9;
    else if (avg < target * 0.8) s *= 1.05;
    s = Math.min(1, Math.max(this.p.renderScaleMin, s));
    if (Math.abs(s - this.renderScale) > 0.01) {
      this.renderScale = s;
      this._cool = 1.0;
      return true;
    }
    return false;
  }
}
