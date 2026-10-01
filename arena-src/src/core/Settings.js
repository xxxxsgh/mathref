/**
 * Configurações do jogador. Valores padrão + validação; persistidos dentro do
 * Save. Quem precisa reagir a mudanças assina com `onChange`.
 */

/**
 * @typedef {Object} SettingsData
 * @property {number} sensitivity   graus por pixel × 100
 * @property {number} fov           campo de visão vertical do mundo
 * @property {number} viewmodelFov
 * @property {'low'|'medium'|'high'} quality
 * @property {number} renderScale   0.5–1 (equivalente a "resolução")
 * @property {boolean} fullscreen
 * @property {number} masterVolume
 * @property {number} musicVolume
 * @property {number} sfxVolume
 * @property {boolean} invertY
 * @property {'easy'|'normal'|'hard'|'expert'} difficulty
 * @property {number} teamSize       jogadores por time (inclui o jogador)
 * @property {string} crosshairColor
 * @property {number} crosshairSize
 * @property {number} crosshairGap
 * @property {number} crosshairThickness
 * @property {boolean} crosshairDot
 * @property {boolean} crosshairDynamic
 * @property {boolean} showFps
 */

/** @type {SettingsData} */
export const DEFAULT_SETTINGS = {
  sensitivity: 2.2,
  fov: 74,
  viewmodelFov: 62,
  quality: 'medium',
  renderScale: 1,
  fullscreen: false,
  masterVolume: 0.8,
  musicVolume: 0.35,
  sfxVolume: 0.9,
  invertY: false,
  difficulty: 'normal',
  teamSize: 3,
  crosshairColor: '#5dffb0',
  crosshairSize: 7,
  crosshairGap: 4,
  crosshairThickness: 2,
  crosshairDot: false,
  crosshairDynamic: true,
  showFps: false,
};

const RANGES = {
  sensitivity: [0.2, 8],
  fov: [60, 100],
  viewmodelFov: [50, 75],
  renderScale: [0.5, 1],
  masterVolume: [0, 1],
  musicVolume: [0, 1],
  sfxVolume: [0, 1],
  teamSize: [1, 5],
  crosshairSize: [2, 20],
  crosshairGap: [0, 14],
  crosshairThickness: [1, 5],
};

export class Settings {
  /** @param {import('./Save.js').Save} save */
  constructor(save) {
    this.save = save;
    /** @type {SettingsData} */
    this.data = { ...DEFAULT_SETTINGS };
    for (const [k, v] of Object.entries(save.data.settings || {})) {
      if (k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k]) this.data[k] = v;
    }
    this.clampAll();
    /** @type {((data: SettingsData, key?: string) => void)[]} */
    this.listeners = [];
  }

  clampAll() {
    for (const [k, [a, b]] of Object.entries(RANGES)) {
      this.data[k] = Math.min(b, Math.max(a, Number(this.data[k])));
    }
    if (!['low', 'medium', 'high'].includes(this.data.quality)) this.data.quality = 'medium';
    if (!['easy', 'normal', 'hard', 'expert'].includes(this.data.difficulty)) this.data.difficulty = 'normal';
  }

  /**
   * @template {keyof SettingsData} K
   * @param {K} key
   * @param {SettingsData[K]} value
   */
  set(key, value) {
    this.data[key] = value;
    this.clampAll();
    this.save.data.settings = { ...this.data };
    this.save.markDirty();
    for (const fn of this.listeners) fn(this.data, key);
  }

  reset() {
    this.data = { ...DEFAULT_SETTINGS };
    this.save.data.settings = { ...this.data };
    this.save.markDirty();
    for (const fn of this.listeners) fn(this.data);
  }

  /** @param {(data: SettingsData, key?: string) => void} fn */
  onChange(fn) {
    this.listeners.push(fn);
  }
}
