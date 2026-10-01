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

// Medalha hexagonal com símbolo interno
export function medalSVG(kind, s = 64) {
  const inner = {
    kill: '<path d="M32,18 L36,28 H47 L38,34.5 L41.5,45 L32,38.6 L22.5,45 L26,34.5 L17,28 H28 Z" fill="#0d0f10"/>',
    head: '<circle cx="32" cy="32" r="9" fill="none" stroke="#0d0f10" stroke-width="3.2"/><path d="M32,17 V25 M32,39 V47 M17,32 H25 M39,32 H47" stroke="#0d0f10" stroke-width="3.2"/>',
    double: '<path d="M20,40 L32,28 L44,40 M20,31 L32,19 L44,31" fill="none" stroke="#0d0f10" stroke-width="4"/>',
    triple: '<path d="M20,44 L32,34 L44,44 M20,36 L32,26 L44,36 M20,28 L32,18 L44,28" fill="none" stroke="#0d0f10" stroke-width="3.4"/>',
    long: '<path d="M16,32 H48 M40,24 L48,32 L40,40" fill="none" stroke="#0d0f10" stroke-width="3.6"/><circle cx="20" cy="32" r="3.4" fill="#0d0f10"/>',
    streak: '<path d="M26,16 L38,16 L33,29 H42 L24,49 L29,34 H21 Z" fill="#0d0f10"/>',
    payback: '<path d="M22,26 H38 C43,26 46,29.5 46,34 C46,38.5 43,42 38,42 H28 M28,19 L20,26 L28,33" fill="none" stroke="#0d0f10" stroke-width="3.6"/>',
  }[kind] || '';
  return `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32,2 L58,17 V47 L32,62 L6,47 V17 Z" fill="currentColor"/><path d="M32,7.5 L53.2,19.8 V44.2 L32,56.5 L10.8,44.2 V19.8 Z" fill="none" stroke="#0d0f1066" stroke-width="1.4"/>${inner}</svg>`;
}

// Seta do jogador no minimapa / indicador
export const ARROW_PATH = 'M0,-9 L7,7 L0,3.6 L-7,7 Z';
