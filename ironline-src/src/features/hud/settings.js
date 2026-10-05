/**
 * Configurações do jogador: persistidas em localStorage (com try/catch —
 * janelas privadas podem bloquear) e aplicadas via APIs públicas do núcleo
 * e dos serviços (input, player, quality, audio). Nada de tocar em outras
 * features diretamente.
 */
const KEY = 'ironline.settings.v1';
const PROFILE = 'ironline.profile.v1';

export const DEFAULTS = {
  sens: 6, // 1..20 (escala estilo console)
  adsSens: 0.85, // multiplicador em mira
  invertY: false,
  fov: 105, // FOV HORIZONTAL em 16:9 (o jogador usa vertical)
  quality: 'auto', // 'auto' (governador) ou um preset fixo
  touchSens: 1, // multiplicador da mira por arrasto (toque)
  volume: 0.8,
  crosshair: 'white',
  minimapRotate: true,
};

export const CROSS_COLORS = { white: '#f2f4ef', green: '#7dff6a', amber: '#ffb22e', cyan: '#4fe3ff', magenta: '#ff5ad1' };

export function load(key = KEY, def = DEFAULTS) {
  try {
    const raw = localStorage.getItem(key);
    return { ...def, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...def };
  }
}
export function save(obj, key = KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}

/** Perfil (progressão entre partidas). */
/**
 * Perfil novo começa no nível 1 (os desbloqueios saem do XP — progression.js).
 * `camo` = camuflagem da primária, `mode` = último modo escolhido no menu
 * (sobrevive à recarga da página ao trocar de mapa), `bosses`/`holds` =
 * contadores de carreira dos modos novos.
 */
export const PROFILE_DEFAULTS = { callsign: 'VANCE', tag: 'IRN', xp: 0, kills: 0, headshots: 0, matches: 0, wins: 0, bosses: 0, captures: 0, camo: 'none', mode: 'waves', loadout: { primary: 0, optic: 0, muzzle: 0, grip: 0, lethal: 0, tactical: 0 } };
export const loadProfile = () => load(PROFILE, PROFILE_DEFAULTS);
export const saveProfile = (p) => save(p, PROFILE);

/** Nível a partir do XP (curva em progression.js — lógica pura testada). */
export { levelOf } from './progression.js';

const SENS_BASE = 0.00037; // rad/px por ponto de sensibilidade (6 → 0.0022)
const REF_ASPECT = 16 / 9;
export const hfovToV = (h) => (2 * Math.atan(Math.tan((h * Math.PI) / 360) / REF_ASPECT) * 180) / Math.PI;
export const vfovToH = (v) => (2 * Math.atan(Math.tan((v * Math.PI) / 360) * REF_ASPECT) * 180) / Math.PI;

/** Aplica tudo o que tem efeito imediato. */
export function apply(ctx, s, { skipQuality = false } = {}) {
  ctx.input.sensitivity = SENS_BASE * s.sens;
  ctx.input.invertY = !!s.invertY;
  ctx.player.baseFov = Math.round(hfovToV(s.fov) * 10) / 10;
  ctx.services.audio?.setVolume?.(s.volume);
  ctx.services.touch?.setSensitivity?.(s.touchSens);
  // compara com `setting` ('auto' ou o preset escolhido), não com `level` (em
  // auto o nível muda sozinho e não pode ser "corrigido" a cada apply)
  const cur = ctx.quality.setting ?? ctx.quality.level;
  if (!skipQuality && cur !== s.quality && !ctx.shot && !ctx.params.has('q')) ctx.quality.set?.(s.quality);
}
export const baseSensitivity = (s) => SENS_BASE * s.sens;
