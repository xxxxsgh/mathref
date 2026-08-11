import { CONFIG } from '../config.js';

const TIER_ORDER = ['alto', 'medio', 'baixo', 'minimo'];

/** Aceita nomes em português e em inglês no `?q=`. */
const ALIASES = {
  alto: 'alto',
  high: 'alto',
  ultra: 'alto',
  medio: 'medio',
  médio: 'medio',
  medium: 'medio',
  med: 'medio',
  baixo: 'baixo',
  low: 'baixo',
  minimo: 'minimo',
  mínimo: 'minimo',
  min: 'minimo',
  potato: 'minimo',
};

/**
 * Lê a string do renderizador via WEBGL_debug_renderer_info.
 * Vários navegadores mascaram esse valor por privacidade — por isso a detecção
 * nunca depende só dela; resolução e memória entram no voto.
 */
function readGpuString() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    // Solta o contexto: navegador limita quantos WebGL vivos existem por aba,
    // e este aqui é descartável.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(raw || '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Escolhe o tier por GPU, resolução e núcleos.
 *
 * O critério real não é "que GPU é essa" e sim "quantos pixels essa GPU vai ter
 * que preencher". Um iPad Pro tem GPU excelente e a pior conta de fill rate da
 * lista, porque o devicePixelRatio é 2 numa tela grande.
 */
export function detectTier() {
  const gpu = readGpuString();
  const dpr = window.devicePixelRatio || 1;
  const w = window.screen?.width || window.innerWidth;
  const h = window.screen?.height || window.innerHeight;
  const pixels = w * h * dpr * dpr;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  let score = 0;

  // GPU dedicada de desktop
  if (/(rtx|radeon rx|geforce|nvidia|arc a\d)/.test(gpu)) score += 3;
  // Apple Silicon — inclui iPads recentes, que voam
  else if (/apple (m\d|a1[5-9]|a2\d)/.test(gpu)) score += 2;
  else if (/apple/.test(gpu)) score += 1;
  // Integrada de desktop/notebook
  else if (/(intel|iris|uhd graphics|hd graphics)/.test(gpu)) score += 0;
  // Móvel de entrada
  else if (/(adreno [1-5]\d\d|mali-[gt]\d\d|powervr)/.test(gpu)) score -= 1;

  if (cores >= 8) score += 1;
  else if (cores <= 2) score -= 1;

  if (memory >= 8) score += 1;
  else if (memory <= 2) score -= 1;

  // Muitos pixels custam caro independentemente de quem desenha.
  if (pixels > 5_000_000) score -= 1;
  if (pixels > 8_500_000) score -= 1;

  if (score >= 4) return 'alto';
  if (score >= 2) return 'medio';
  if (score >= 0) return 'baixo';
  return 'minimo';
}

/**
 * Tier ativo + degradação adaptativa.
 *
 * O iPad segura 60 fps por alguns minutos e então cai por limite térmico. Por
 * isso a detecção inicial não basta: medimos o frame time e descemos um degrau
 * quando ele passa do alvo por vários segundos seguidos. Só desce, nunca sobe
 * sozinho — subir de novo faz o jogo oscilar entre dois tiers e isso é pior de
 * jogar do que ficar no mais baixo.
 */
export class Quality {
  constructor() {
    const params = new URLSearchParams(location.search);
    const requested = ALIASES[(params.get('q') || '').toLowerCase()];

    this.autoDetected = detectTier();
    this.overridden = Boolean(requested);
    this.tier = requested || this.autoDetected;
    this.settings = { ...CONFIG.QUALITY.tiers[this.tier] };

    this._badTime = 0;
    this._listeners = new Set();
  }

  /** Notifica quem precisa reconstruir buffers/mesh ao mudar o tier. */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  setTier(tier) {
    if (!CONFIG.QUALITY.tiers[tier] || tier === this.tier) return;
    this.tier = tier;
    this.settings = { ...CONFIG.QUALITY.tiers[tier] };
    this._badTime = 0;
    for (const fn of this._listeners) fn(this.settings, tier);
  }

  /** Chamado uma vez por frame com o tempo de frame suavizado. */
  update(frameMs, dt) {
    if (!CONFIG.QUALITY.adaptEnabled || this.overridden) return;
    const index = TIER_ORDER.indexOf(this.tier);
    if (index >= TIER_ORDER.length - 1) return;

    if (frameMs > CONFIG.QUALITY.targetFrameMs * 1.25) {
      this._badTime += dt;
      if (this._badTime >= CONFIG.QUALITY.adaptWindowSeconds) {
        this.setTier(TIER_ORDER[index + 1]);
      }
    } else {
      this._badTime = Math.max(0, this._badTime - dt * 0.5);
    }
  }
}

export { TIER_ORDER };
