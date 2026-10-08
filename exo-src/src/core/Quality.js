/**
 * Configurações de qualidade. Um objeto simples e mutável compartilhado por
 * todas as features (ctx.quality). Mudanças passam por quality.set(), que
 * emite 'quality:change' no bus.
 *
 * Campos são DICAS: cada feature decide como honrá-las.
 *
 * Modo automático (`quality.set('auto')`, `?q=auto`, padrão do jogo):
 * `classifyDevice()` escolhe o preset inicial pela classe do aparelho (GPU,
 * celular/tablet, núcleos, memória) e o governador (core/Governor.js) desce
 * e sobe pelos degraus de `AUTO_LADDER` conforme o tempo de frame. Em
 * `mode: 'auto'` `level` continua sendo sempre um dos 4 presets — as
 * features que comparam `quality.level` não precisam saber do modo.
 */
export const QUALITY_PRESETS = {
  low: {
    dprCap: 1, msaa: 0, shadows: true, shadowMapSize: 1024, shadowCascades: 1, shadowScale: 1,
    anisotropy: 2, ssao: false, bloom: false, taa: false, motionBlur: false, volumetrics: false,
    // terreno: erro de tela tolerado (px) pelo LOD do planeta — maior = mais grosso
    terrainError: 8, drawDistance: 60000, floraDensity: 0.3, floraDistance: 250, faunaBudget: 6,
    cloudQuality: 0, atmosphereSamples: 8, particleBudget: 0.4, textureSize: 512, renderScale: 0.75,
  },
  medium: {
    dprCap: 1, msaa: 2, shadows: true, shadowMapSize: 2048, shadowCascades: 2, shadowScale: 1,
    anisotropy: 4, ssao: true, bloom: true, taa: false, motionBlur: false, volumetrics: false,
    terrainError: 5, drawDistance: 120000, floraDensity: 0.6, floraDistance: 450, faunaBudget: 12,
    cloudQuality: 1, atmosphereSamples: 12, particleBudget: 0.7, textureSize: 1024, renderScale: 1,
  },
  high: {
    // orçamento de referência: < 400 draw calls e < 3M triângulos por frame
    dprCap: 1, msaa: 4, shadows: true, shadowMapSize: 2048, shadowCascades: 3, shadowScale: 1,
    anisotropy: 8, ssao: true, bloom: true, taa: true, motionBlur: false, volumetrics: true,
    terrainError: 3, drawDistance: 250000, floraDensity: 1, floraDistance: 800, faunaBudget: 20,
    cloudQuality: 2, atmosphereSamples: 16, particleBudget: 1, textureSize: 2048, renderScale: 1,
  },
  ultra: {
    dprCap: 2, msaa: 4, shadows: true, shadowMapSize: 4096, shadowCascades: 4, shadowScale: 1,
    anisotropy: 16, ssao: true, bloom: true, taa: true, motionBlur: true, volumetrics: true,
    terrainError: 2, drawDistance: 400000, floraDensity: 1.3, floraDistance: 1200, faunaBudget: 32,
    cloudQuality: 3, atmosphereSamples: 24, particleBudget: 1.5, textureSize: 2048, renderScale: 1,
  },
};

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];

/**
 * CAMADAS de aparelho (`quality.tier`), aplicadas POR CIMA de qualquer
 * preset/degrau — o preset diz "quão bonito", a camada diz "quanto o
 * aparelho aguenta carregar". Desktop não tem patch (nada muda em high).
 *
 *   mobile  celular/tablet (classifyDevice → mobile): texturas 512, sombra
 *           1024 sem cascatas, sem SSAO/volumétrico/TAA, MSAA off, terreno
 *           mais grosso, flora reduzida e `detail` 0,5.
 *   lite    `?lite=1` (botão "Tentar modo leve") ou carga anterior que não
 *           terminou: o mínimo que ainda é o jogo — `detail` 0,25, sem bloom,
 *           nuvens 2D, flora/partículas no chão.
 *
 * Campos novos (dicas): `detail` (0..1, detalhe geométrico do mundo, 1 =
 * completo), `hdr` (false = o compositor usa caminho LDR/sem alvos float),
 * `probes` (false = sem sondas/cubemaps de reflexo locais), `tier`.
 */
export const TIER_PATCHES = {
  desktop: {},
  mobile: {
    dprCap: 1, msaa: 0, shadowMapSize: 1024, shadowCascades: 1, anisotropy: 2, ssao: false, taa: false,
    motionBlur: false, volumetrics: false, terrainError: 6, drawDistance: 80000, floraDensity: 0.4,
    floraDistance: 300, cloudQuality: 1, textureSize: 512, detail: 0.5, probes: false,
  },
  // PC fraco detectado (classifyDevice → weak): camada MACIA — escolher um
  // preset manual (configurações ou ?q=) a remove.
  'low-desktop': {
    dprCap: 1, msaa: 0, shadowMapSize: 1024, shadowCascades: 1, ssao: false, taa: false, motionBlur: false,
    volumetrics: false, anisotropy: 4, terrainError: 5, floraDensity: 0.6, textureSize: 1024, detail: 0.6,
    probes: false, renderScale: 0.75,
  },
  lite: {
    dprCap: 1, msaa: 0, shadowMapSize: 1024, shadowCascades: 1, shadowScale: 0.5, anisotropy: 1, ssao: false,
    bloom: false, taa: false, motionBlur: false, volumetrics: false, terrainError: 10, drawDistance: 50000,
    floraDensity: 0.15, floraDistance: 150, faunaBudget: 4, cloudQuality: 0, atmosphereSamples: 6,
    textureSize: 512, particleBudget: 0.25, detail: 0.25, hdr: false, probes: false,
  },
};

/**
 * Aplica a camada como TETO: números ficam no mínimo (preset, camada),
 * booleanos só continuam ligados se a camada não os desliga. Assim `low`
 * num celular não "sobe" nada por causa da camada.
 */
export function applyTier(q, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (typeof v === 'number') q[k] = typeof q[k] === 'number' ? Math.min(q[k], v) : v;
    else if (typeof v === 'boolean') q[k] = v ? !!q[k] || q[k] === undefined : false;
    else q[k] = v;
  }
  return q;
}

/** Camada do aparelho: 'lite' (pedido/forçado), 'mobile' ou 'desktop'. */
export function deviceTier(device, { lite = false } = {}) {
  if (lite) return 'lite';
  if (device?.mobile) return 'mobile';
  return device?.weak ? 'low-desktop' : 'desktop';
}
/** Camadas que o jogador pode furar escolhendo um preset manual. */
export const SOFT_TIERS = new Set(['low-desktop']);

/**
 * Degraus do modo automático, do mais caro (0) ao mais barato. Cada degrau =
 * preset + patch. Os "−" cortam primeiro os passes caros e pouco visíveis
 * (motion blur, volumétrico, resolução da sombra) antes de trocar de preset.
 * `drawDistance`/`textureSize` nunca mudam aqui (só valem na carga).
 */
export const AUTO_LADDER = [
  { name: 'ultra', level: 'ultra', patch: {} },
  { name: 'high', level: 'high', patch: {} },
  { name: 'high-', level: 'high', patch: { volumetrics: false, shadowScale: 0.5, floraDensity: 0.8 } },
  { name: 'medium', level: 'medium', patch: {} },
  { name: 'medium-', level: 'medium', patch: { ssao: false, bloom: false, shadowScale: 0.5, floraDensity: 0.45, particleBudget: 0.5 } },
  { name: 'low', level: 'low', patch: {} },
  { name: 'low-', level: 'low', patch: { shadowScale: 0.5, floraDensity: 0.15, particleBudget: 0.25, renderScale: 0.65, terrainError: 10 } },
];
export const rungIndex = (name) => {
  const i = AUTO_LADDER.findIndex((r) => r.name === name);
  return i < 0 ? 1 : i;
};
/** Campos completos de um degrau (preset + patch). */
export const rungSettings = (i) => {
  const r = AUTO_LADDER[Math.max(0, Math.min(AUTO_LADDER.length - 1, i))];
  return { ...QUALITY_PRESETS[r.level], ...r.patch, level: r.level };
};

// ─── classe do aparelho ──────────────────────────────────────────────────

/**
 * Classifica o aparelho a partir de dados simples (puro, testável):
 *   info = { gpu: 'ANGLE (NVIDIA, GeForce RTX 3060 …)', mobile, coarse,
 *            cores, memory (GB), width, height, dpr }
 * Retorna { preset, ceiling, mobile, gpuClass, targetFps, minScale, reason }.
 * `preset` = degrau inicial; `ceiling` = o mais caro que o automático pode
 * subir sozinho (ultra só manual, salvo GPU dedicada forte).
 */
export function classifyDevice(info = {}) {
  const gpu = String(info.gpu || '').toLowerCase();
  const mobile = !!(info.mobile || info.coarse);
  const cores = info.cores || 4;
  const mem = info.memory || (mobile ? 3 : 8);
  let cls = 'unknown';
  let score = 0; // 0 fraco · 1 intermediário · 2 bom · 3 forte

  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(gpu)) {
    cls = 'software';
    score = 0;
  } else if (/adreno/.test(gpu)) {
    cls = 'adreno';
    const n = Number(gpu.match(/adreno[^0-9]*(\d{3})/)?.[1] || 0);
    score = n >= 730 ? 2 : n >= 640 ? 1 : 0;
  } else if (/mali|immortalis/.test(gpu)) {
    cls = 'mali';
    score = /immortalis|mali-g7[1-9]\d|mali-g6[1-9]0|mali-g7[1-9]0/.test(gpu) ? 1 : 0;
  } else if (/powervr|sgx|videocore|vivante|tegra/.test(gpu)) {
    cls = 'mobile-legacy';
    score = 0;
  } else if (/xclipse/.test(gpu)) {
    cls = 'xclipse';
    score = 1;
  } else if (/apple m\d/.test(gpu)) {
    cls = 'apple-m';
    score = /apple m1\b(?!\s*(pro|max|ultra))/.test(gpu) ? 2 : 3; // M1 base: bom; Pro/Max/M2+: forte
  } else if (/apple/.test(gpu)) {
    // iPhone/iPad ("Apple GPU") — o Safari esconde o modelo
    cls = 'apple';
    score = mobile ? 1 : 2;
  } else if (/nvidia|geforce|quadro|rtx|gtx/.test(gpu)) {
    cls = 'nvidia';
    if (/rtx\s*[2-9]0\d0|rtx\s*a\d|rtx\s*\d{4}/.test(gpu)) score = 3;
    else if (/gtx\s*1[0-6]\d0|gtx\s*9[6-8]0/.test(gpu)) score = 2;
    // MX (notebook) e GT (entrada): na prática, integrada
    else if (/\bmx\s*\d{2,3}|\bgt\s*\d{3,4}/.test(gpu)) score = 0;
    else if (/gtx\s*[5-9][0-5]0/.test(gpu)) score = 1;
    else score = 2;
  } else if (/radeon|amd/.test(gpu)) {
    cls = 'amd';
    if (/rx\s*[5-9]\d{3}|rx\s*vega|radeon pro/.test(gpu)) score = 3;
    else if (/rx\s*\d{3}\b/.test(gpu)) score = 2;
    // APUs recentes (Radeon 680M/780M/880M): integrada boa
    else if (/radeon\s*[6-9]\d0m/.test(gpu)) score = 1;
    else score = 0; // "AMD Radeon(TM) Graphics", "Radeon Vega 8" — APU antiga
  } else if (/intel/.test(gpu)) {
    cls = 'intel';
    if (/arc/.test(gpu)) score = 2;
    else if (/iris\W*(\(r\))?\W*xe/.test(gpu)) score = 1;
    else score = 0; // HD/UHD, Iris Plus/Pro antigas
  } else {
    // GPU desconhecida (renderer mascarado): decide por CPU/memória
    score = mobile ? (cores >= 8 && mem >= 6 ? 1 : 0) : cores >= 8 && mem >= 8 ? 2 : 1;
  }
  // aparelhos com pouca memória/CPU ficam no chão, qualquer que seja a GPU
  if (mem <= 2 || cores <= 2) score = Math.min(score, 0);
  else if (!mobile && cores <= 4 && info.memory && info.memory <= 4) score = 0; // PC de 4 núcleos e ≤ 4 GB
  else if (mem <= 4 && !mobile) score = Math.min(score, 1);
  // textura máxima < 8192: GPU antiga/limitada
  if (info.maxTexture && info.maxTexture < 8192) score = Math.min(score, 0);
  // celular: tela pequena, térmica e bateria — nunca começa acima de medium
  if (mobile) score = Math.min(score, 1);

  // mapa score → degraus
  const table = mobile
    ? [{ preset: 'low', ceiling: 'medium-' }, { preset: 'medium-', ceiling: 'medium' }]
    : [
      { preset: 'low', ceiling: 'medium-' },
      { preset: 'medium', ceiling: 'high' },
      { preset: 'high', ceiling: 'high' },
      { preset: 'high', ceiling: 'ultra' },
    ];
  const pick = table[Math.min(score, table.length - 1)];
  // telas enormes (4K) custam 2–4×: começa um degrau abaixo
  const px = (info.width || 1920) * (info.height || 1080) * Math.min(info.dpr || 1, 1) ** 2;
  let preset = pick.preset;
  if (!mobile && px > 3.2e6 && preset === 'high') preset = 'high-';
  return {
    preset,
    ceiling: pick.ceiling,
    mobile,
    /** PC fraco (GPU integrada/antiga/software, pouca CPU/memória) → camada 'low-desktop'. */
    weak: !mobile && score === 0,
    gpuClass: cls,
    score,
    targetFps: mobile ? 30 : 60,
    minScale: mobile ? 0.5 : 0.6,
    reason: `${cls}/${score}${mobile ? '/mobile' : ''}`,
  };
}

/**
 * Coleta os dados do aparelho no navegador (contexto WebGL temporário para
 * ler WEBGL_debug_renderer_info quando disponível). Nunca lança.
 */
export function probeDevice(win = globalThis.window) {
  const info = { gpu: '', mobile: false, coarse: false, cores: 4, memory: 0, width: 1920, height: 1080, dpr: 1 };
  if (!win) return info;
  try {
    const nav = win.navigator || {};
    const ua = nav.userAgent || '';
    info.mobile = !!(nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua))
      // iPadOS se apresenta como Mac: toque + "Macintosh"
      || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
    info.coarse = !!win.matchMedia?.('(pointer: coarse)').matches && !win.matchMedia?.('(any-pointer: fine)').matches;
    info.cores = nav.hardwareConcurrency || 4;
    info.memory = nav.deviceMemory || 0;
    info.width = win.screen?.width || win.innerWidth || 1920;
    info.height = win.screen?.height || win.innerHeight || 1080;
    info.dpr = win.devicePixelRatio || 1;
    const c = win.document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      info.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      info.gpu = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* sem WebGL/permissão: fica com os padrões */
  }
  return info;
}

/**
 * @param level 'auto' | 'low' | 'medium' | 'high' | 'ultra'
 * @param device resultado de classifyDevice() (usado por 'auto')
 */
export function createQuality(level = 'high', bus = null, device = null, { tier = 'desktop' } = {}) {
  const dev = device || classifyDevice({});
  const auto = level === 'auto';
  const start = auto ? rungSettings(rungIndex(dev.preset)) : QUALITY_PRESETS[level] ? { ...QUALITY_PRESETS[level], level } : { ...QUALITY_PRESETS.high, level: 'high' };
  let patch = TIER_PATCHES[tier] || TIER_PATCHES.desktop;
  const tier0 = TIER_PATCHES[tier] ? tier : 'desktop';
  const q = {
    level: start.level,
    detail: 1,
    renderScale: 1,
    hdr: true,
    probes: true,
    ...start,
    /** Camada do aparelho ('desktop' | 'low-desktop' | 'mobile' | 'lite'), ver TIER_PATCHES. */
    tier: TIER_PATCHES[tier] ? tier : 'desktop',
    /** 'auto' (governador escolhe degraus) ou 'manual' (preset fixo). */
    mode: auto ? 'auto' : 'manual',
    /** Degrau atual do modo automático (nome em AUTO_LADDER) ou null. */
    rung: auto ? AUTO_LADDER[rungIndex(dev.preset)].name : null,
    /** Classe do aparelho detectada (classifyDevice). */
    device: dev,
    /**
     * Aplica 'auto', um preset inteiro ('low'|'medium'|'high'|'ultra') ou um
     * patch parcial (patch não muda o modo).
     */
    set(levelOrPatch) {
      if (levelOrPatch === 'auto') {
        // volta ao automático: a camada original (ex.: PC fraco) volta a valer
        if (q.tier !== tier0) {
          q.tier = tier0;
          patch = TIER_PATCHES[tier0] || TIER_PATCHES.desktop;
        }
        const i = rungIndex(q.device.preset);
        Object.assign(q, rungSettings(i), { mode: 'auto', rung: AUTO_LADDER[i].name });
      } else if (typeof levelOrPatch === 'string') {
        if (!QUALITY_PRESETS[levelOrPatch]) return q;
        // preset manual escolhido pelo jogador: camada macia (PC fraco) sai
        if (SOFT_TIERS.has(q.tier)) {
          q.tier = 'desktop';
          patch = TIER_PATCHES.desktop;
        }
        Object.assign(q, QUALITY_PRESETS[levelOrPatch], { level: levelOrPatch, mode: 'manual', rung: null });
      } else Object.assign(q, levelOrPatch);
      // a camada do aparelho é teto sobre qualquer preset/degrau
      applyTier(q, patch);
      bus?.emit('quality:change', q);
      return q;
    },
    /** Valor para mostrar/salvar nas configurações: 'auto' ou o preset. */
    get setting() {
      return q.mode === 'auto' ? 'auto' : q.level;
    },
  };
  applyTier(q, patch);
  return q;
}
