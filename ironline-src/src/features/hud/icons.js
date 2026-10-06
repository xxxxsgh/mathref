/**
 * Ícones vetoriais do HUD, desenhados à mão (SVG). Silhuetas chapadas como
 * nos HUDs militares modernos: arma de perfil, granadas, cabeça (headshot),
 * caveira, insígnias de patente e medalhas.
 */

// Fuzil de assalto de perfil (caixa 0..122 × 0..34), virado para a direita.
export const RIFLE_PATH =
  'M0,13 L3,11.5 L22,12.4 L26,10.4 L36.5,10.4 L37.5,7.4 L40,5.4 L56.5,5.4 L58.5,7.4 L58.5,10.4 L84,10.4 L84,11.4 ' +
  'L104,11.4 L104,13.4 L113,13.4 L113,12.4 L121.5,12.4 L121.5,16.6 L113,16.6 L113,15.6 L104,15.6 L104,19.2 ' +
  'L70,19.2 L66.5,19.2 L69.5,30.8 L61,33 L56.8,20.2 L52,20.2 L52,23.5 L46,23.5 L44.5,31.2 L38.6,30.6 L41.2,20.2 ' +
  'L30,19.6 L26,17.8 L21.5,17.2 L6,21.8 L0,21.8 Z';
// detalhes recortados (fendas do guarda-mão, janela de ejeção)
export const RIFLE_CUTS =
  'M87,14 H91 V16.4 H87 Z M93,14 H97 V16.4 H93 Z M99,14 H102 V16.4 H99 Z M62,12.6 H74 V14.6 H62 Z ' +
  'M41.5,7.8 H55.5 V9 H41.5 Z M8,15 H19 V16.4 H8 Z';

export function rifleSVG(cls = '', w = 122) {
  const h = (w * 34) / 122;
  return `<svg class="${cls}" width="${w}" height="${h.toFixed(1)}" viewBox="0 0 122 34"><path d="${RIFLE_PATH} ${RIFLE_CUTS}" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

// Pistola de perfil (0..60 × 0..40)
export const PISTOL_PATH =
  'M2,4 H56 L58,6 V14 H22 L24,17 L20,36 L8,36 L12,16 L6,14 L2,14 Z M22,14 L26,22 H34 L32,14 Z';
export function pistolSVG(cls = '', w = 60) {
  return `<svg class="${cls}" width="${w}" height="${((w * 40) / 60).toFixed(1)}" viewBox="0 0 60 40"><path d="M2,4 H56 L58,6 V14 H33 V21 H25 L22,15 L19,36 H8 L11.5,16 L6,14 H2 Z M28,15 H31 V18.5 H28.5 Z" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

// Granada de fragmentação
export function fragSVG(cls = '', s = 26) {
  return `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 26 26"><path d="M9,3 H15 V6 H9 Z M15,3.5 L21,2 L22.5,3.4 L17,7.6 Z" fill="currentColor"/><path d="M12,6.5 C17.5,6.5 20.5,10.4 20.5,15.6 C20.5,21 17,24.5 12,24.5 C7,24.5 3.5,21 3.5,15.6 C3.5,10.4 6.5,6.5 12,6.5 Z M6,13.6 H18 M6,18.2 H18 M10,8 V24 M14,8 V24" fill="currentColor" stroke="#0006" stroke-width="1.1"/></svg>`;
}

// Granada de atordoamento (cilindro)
export function flashSVG(cls = '', s = 26) {
  return `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 26 26"><path d="M8,3 H16 V5.5 H8 Z M16,3.4 L21.5,2.2 L22.6,3.6 L17.6,6.4 Z M7,6.5 H17 L18,8 V23 L17,24.5 H7 L6,23 V8 Z" fill="currentColor"/><path d="M6.5,11 H17.5 M6.5,19 H17.5 M9,13.5 H15 V16.5 H9 Z" stroke="#0007" stroke-width="1.2" fill="none"/></svg>`;
}

// Cabeça com mira (headshot)
export function headshotSVG(cls = '', s = 18) {
  return `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 20 20"><path d="M10,2.5 C13.6,2.5 15.6,5 15.6,8.2 C15.6,10.4 14.6,12 13.4,12.8 V15.5 H6.6 V12.8 C5.4,12 4.4,10.4 4.4,8.2 C4.4,5 6.4,2.5 10,2.5 Z" fill="currentColor"/><circle cx="10" cy="8.2" r="2.4" fill="none" stroke="#000a" stroke-width="1.3"/><path d="M10,4.5 V6 M10,10.4 V11.9 M6.3,8.2 H7.8 M12.2,8.2 H13.7" stroke="#000a" stroke-width="1.1"/></svg>`;
}

// Caveira estilizada (abate / KIA)
export function skullSVG(cls = '', s = 18) {
  return `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 20 20"><path d="M10,1.6 C14.6,1.6 17.4,4.6 17.4,8.6 C17.4,11 16.4,12.4 15,13.2 V16 H12.6 V17.6 H7.4 V16 H5 V13.2 C3.6,12.4 2.6,11 2.6,8.6 C2.6,4.6 5.4,1.6 10,1.6 Z M6,8.2 L8.6,8.6 L8.2,11.4 L5.6,10.8 Z M14,8.2 L11.4,8.6 L11.8,11.4 L14.4,10.8 Z M10,11.6 L11.2,13.6 H8.8 Z M8.6,15.4 V17.4 M11.4,15.4 V17.4" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

// Faca (corpo a corpo)
export function knifeSVG(cls = '', s = 34) {
  return `<svg class="${cls}" width="${s}" height="${(s * 12) / 34}" viewBox="0 0 34 12"><path d="M0,4 H12 V3 H14 V9 H12 V8 H0 Z M14,4.5 H28 L34,6 L28,8 H14 Z" fill="currentColor"/></svg>`;
}

// Insígnia de patente (chevrons dentro de escudo)
export function rankSVG(level, cls = '', s = 34) {
  const n = 1 + (level % 3);
  let ch = '';
  for (let i = 0; i < n; i++) ch += `<path d="M9,${21 - i * 5} L17,${16 - i * 5} L25,${21 - i * 5}" fill="none" stroke="#0b0d0e" stroke-width="2.6" stroke-linejoin="miter"/>`;
  return `<svg class="${cls}" width="${s}" height="${s}" viewBox="0 0 34 34"><path d="M17,1.5 L31,7 V18 C31,25 25,30.5 17,32.5 C9,30.5 3,25 3,18 V7 Z" fill="currentColor"/><path d="M17,4 L28.6,8.6 V18 C28.6,23.8 23.8,28.4 17,30.2 C10.2,28.4 5.4,23.8 5.4,18 V8.6 Z" fill="none" stroke="#0b0d0e55" stroke-width="1"/>${ch}</svg>`;
}

// Fuzil hostil de perfil (estilo carregador curvo, coronha fixa) 0..122 × 0..36
export const HOSTILE_RIFLE_PATH =
  'M0,12.5 L5,10.5 L27,12.6 L29,10 L68,10 L70,8.6 L74,8.6 L74,10 L94,10 L95.5,6.2 L97.5,6.2 L98,10 L106,10 L106,11.4 L122,11.4 ' +
  'L122,13.6 L106,13.6 L106,15.4 L68,15.4 L66,17 L61,17 L64,24 L69,32.5 L61,35.5 L56.5,26 L53.5,17 L45,17 L42,27 L35.5,26 ' +
  'L38,17 L30,17.5 L7,22.5 L0,22.5 Z M75,12 H92 V13.4 H75 Z M32,12 H50 V13.2 H32 Z';
export function hostileRifleSVG(cls = '', w = 122) {
  return `<svg class="${cls}" width="${w}" height="${((w * 36) / 122).toFixed(1)}" viewBox="0 0 122 36"><path d="${HOSTILE_RIFLE_PATH}" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

/** Ícone de arma do feed por tipo ('rifle' = fuzil do jogador, 'hostile', 'pistol', 'knife', 'frag'). */
export function weaponIcon(kind, h = 16, playerImg = null) {
  if (kind === 'rifle' && playerImg) return playerImg(h);
  if (kind === 'pistol') return pistolSVG('', h * 1.5);
  if (kind === 'knife') return knifeSVG('', h * 2.8);
  if (kind === 'frag') return fragSVG('', h * 1.3);
  if (kind === 'rifle') return rifleSVG('', h * 3.6);
  return hostileRifleSVG('', h * 3.4);
}

// ─── medalhas: arte em camadas com metal (bronze / prata / ouro) ─────────
const TIER = {
  kill: 'bronze', payback: 'bronze', head: 'silver', long: 'silver', double: 'silver', triple: 'gold', streak: 'gold',
  slide: 'silver', mastery: 'gold', airstrike: 'gold', uav: 'silver', shield: 'bronze',
};
const METAL = {
  bronze: ['#ffd6a8', '#c77b3f', '#6d3a17', '#e8a56c', '#3a1c0b'],
  silver: ['#ffffff', '#b9c3cb', '#5c6670', '#dfe6ea', '#20262b'],
  gold: ['#fff4c2', '#f2b632', '#8a5208', '#ffd766', '#3d2504'],
};
const ENAMEL = { bronze: ['#3a2418', '#170d08'], silver: ['#1f3442', '#0b1419'], gold: ['#5a1410', '#1e0605'] };
let _mid = 0;
export const medalTier = (kind) => TIER[kind] || 'bronze';

export function medalSVG(kind, s = 64, tierOverride) {
  const tier = tierOverride || medalTier(kind);
  const [hi, mid, lo, rim, dk] = METAL[tier];
  const [en1, en2] = ENAMEL[tier];
  const id = 'md' + _mid++;
  // símbolo interno (desenhado na cor do metal sobre o esmalte)
  const glyph = {
    kill: '<path d="M32,20 L35.2,28.4 H44 L36.9,33.6 L39.6,42 L32,36.9 L24.4,42 L27.1,33.6 L20,28.4 H28.8 Z"/>',
    head: '<g fill="none" stroke-width="3"><circle cx="32" cy="32" r="8"/><path d="M32,18 V25 M32,39 V46 M18,32 H25 M39,32 H46"/></g><circle cx="32" cy="32" r="2.4"/>',
    double: '<path d="M21,40 L32,30 L43,40 V45 L32,35 L21,45 Z M21,30 L32,20 L43,30 V35 L32,25 L21,35 Z"/>',
    triple: '<path d="M21,44 L32,36 L43,44 V48 L32,40 L21,48 Z M21,36 L32,28 L43,36 V40 L32,32 L21,40 Z M21,28 L32,20 L43,28 V32 L32,24 L21,32 Z"/>',
    long: '<path d="M18,30.5 H40 V26 L48,32 L40,38 V33.5 H18 Z"/><circle cx="20" cy="32" r="4.4"/>',
    streak: '<path d="M27,17 H39 L34.5,28.5 H43 L25,48 L29.5,34 H21.5 Z"/>',
    // deslize (corpo baixo + rastro) e maestria (coroa) — medalhas de outras features
    slide: '<path d="M16,40 H48 V44 H16 Z M30,22 L40,26 L44,36 H24 Z M38,16 A4,4 0 1,1 37.9,16 Z"/><path d="M10,30 H22 M8,35 H20" fill="none" stroke-width="2.4"/>',
    mastery: '<path d="M17,42 L14,22 L24,30 L32,18 L40,30 L50,22 L47,42 Z M17,45 H47 V48 H17 Z"/>',
    airstrike: '<path d="M32,14 L36,24 V30 L50,36 V40 L36,37 V44 L41,48 V50 L32,48 L23,50 V48 L28,44 V37 L14,40 V36 L28,30 V24 Z"/>',
    uav: '<g fill="none" stroke-width="2.6"><circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="5"/></g><path d="M32,16 V20 M32,44 V48 M16,32 H20 M44,32 H48" stroke-width="2.6"/>',
    shield: '<path d="M32,16 L46,21 V31 C46,40 40,46 32,49 C24,46 18,40 18,31 V21 Z"/>',
    payback: '<path d="M23,24 L16,31 L23,38 V33.6 H38 C41,33.6 43,35.6 43,38.4 C43,41.2 41,43.2 38,43.2 H31 V47 H38 C43.4,47 47,43.4 47,38.4 C47,33.4 43.4,29.8 38,29.8 H23 Z"/>',
  }[kind] || '';
  const grad = `<defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".28" stop-color="${mid}"/><stop offset=".55" stop-color="${lo}"/><stop offset=".78" stop-color="${rim}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
    <linearGradient id="${id}r" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${lo}"/><stop offset="1" stop-color="${rim}"/></linearGradient>
    <radialGradient id="${id}e" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${en1}"/><stop offset="1" stop-color="${en2}"/></radialGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity=".0"/><stop offset=".42" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>`;
  // moldura por raridade
  let back = '';
  let body;
  if (tier === 'gold') {
    // estrela de 12 pontas atrás + louros
    let star = '';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 24 : 31;
      star += (i ? 'L' : 'M') + (32 + Math.cos(a) * r).toFixed(1) + ',' + (32 + Math.sin(a) * r).toFixed(1);
    }
    back = `<path d="${star}Z" fill="url(#${id}m)" stroke="${dk}" stroke-width=".8"/>`;
    body = 'M32,9 L52,20.5 V43.5 L32,55 L12,43.5 V20.5 Z';
  } else if (tier === 'silver') {
    // asas laterais
    back = `<path d="M12,22 L1,18 L5,27 L0,30 L7,35 L4,40 L13,40 Z M52,22 L63,18 L59,27 L64,30 L57,35 L60,40 L51,40 Z" fill="url(#${id}m)" stroke="${dk}" stroke-width=".8"/>`;
    body = 'M32,6 L54,18.5 V45.5 L32,58 L10,45.5 V18.5 Z';
  } else {
    body = 'M32,4 L54,12 V32 C54,45 44,54 32,60 C20,54 10,45 10,32 V12 Z';
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 64 64" class="medal-${tier}">${grad}${back}
    <path d="${body}" fill="url(#${id}m)" stroke="${dk}" stroke-width="1"/>
    <path d="${body}" fill="url(#${id}e)" transform="translate(32 32) scale(.78) translate(-32 -32)" stroke="url(#${id}r)" stroke-width="1.6"/>
    <g fill="url(#${id}m)" stroke="url(#${id}m)" transform="translate(32 33) scale(.82) translate(-32 -32)">${glyph}</g>
    <path d="${body}" fill="url(#${id}s)"/>
  </svg>`;
}

// Seta do jogador no minimapa / indicador
export const ARROW_PATH = 'M0,-9 L7,7 L0,3.6 L-7,7 Z';

/**
 * Ícone de desafio: anel de progresso (trilha + arco âmbar) com um glifo
 * de traço no centro — mesma família de traço da fonte, sem medalha.
 */
export function challengeSVG(kind, frac = 0, s = 44) {
  const r = 19, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  const glyph = {
    // cabeça de perfil com retícula
    head: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><circle cx="22" cy="22" r="7.5"/><path d="M22,11 V15.5 M22,28.5 V33 M11,22 H15.5 M28.5,22 H33"/></g><circle cx="22" cy="22" r="1.8" fill="currentColor"/>',
    // alvo abatido: silhueta de busto com X
    kill: '<path d="M22,12.5 a4.6,4.6 0 1,1 -0.01,0 Z M13.5,32 C13.5,25.5 17,22.6 22,22.6 C27,22.6 30.5,25.5 30.5,32 Z" fill="currentColor" opacity=".9"/><path d="M15,13 L29,31 M29,13 L15,31" stroke="#0b0d0f" stroke-width="3.4"/><path d="M15,13 L29,31 M29,13 L15,31" stroke="#e2b45a" stroke-width="1.6"/>',
    // troféu
    long: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter"><path d="M16,12.5 H28 V19 C28,23.5 25.5,26 22,26 C18.5,26 16,23.5 16,19 Z"/><path d="M16,14.5 H12.5 C12.5,19 14,20.5 16.4,21 M28,14.5 H31.5 C31.5,19 30,20.5 27.6,21"/><path d="M22,26 V29.5 M17,32 H27 L26,29.5 H18 Z"/></g>',
  }[kind] || '';
  return `<svg width="${s}" height="${s}" viewBox="0 0 44 44" class="chal-ic">
    <circle cx="22" cy="22" r="${r + 2.5}" fill="rgba(8,10,12,.55)"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(242,244,239,.14)" stroke-width="2.2"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="#e2b45a" stroke-width="2.2" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 22 22)"/>
    <g color="#ecebe4">${glyph}</g></svg>`;
}
