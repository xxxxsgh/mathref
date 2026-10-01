/**
 * Save local em JSON (localStorage).
 *
 * Um único documento versionado guarda inventário, equipados, configurações e
 * progressão. Escrita é adiada (debounce) para não serializar o save inteiro
 * várias vezes num mesmo frame quando várias coisas mudam juntas.
 */
const KEY = 'nullpoint.save.v1';
export const SAVE_VERSION = 1;

/** @typedef {import('./Settings.js').SettingsData} SettingsData */

/**
 * @typedef {Object} SaveData
 * @property {number} version
 * @property {any[]} inventory
 * @property {number} nextItemNumber
 * @property {Partial<SettingsData>} settings
 * @property {{ xp: number, level: number, shards: number, matches: number, wins: number, kills: number, deaths: number, headshots: number, rounds: number }} progression
 * @property {any[]} market listagens do mercado offline
 * @property {number} marketRefreshAt
 */

/** @returns {SaveData} */
export function defaultSave() {
  return {
    version: SAVE_VERSION,
    inventory: [],
    nextItemNumber: 1842,
    settings: {},
    progression: { xp: 0, level: 1, shards: 1500, matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, rounds: 0 },
    market: [],
    marketRefreshAt: 0,
  };
}

export class Save {
  constructor() {
    /** @type {SaveData} */
    this.data = this.load();
    this.timer = 0;
  }

  /** @returns {SaveData} */
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_VERSION) return defaultSave();
      const base = defaultSave();
      return {
        ...base,
        ...parsed,
        progression: { ...base.progression, ...(parsed.progression || {}) },
        settings: { ...(parsed.settings || {}) },
      };
    } catch {
      // Save corrompido ou storage bloqueado (aba anônima): começa limpo em
      // vez de travar o jogo.
      return defaultSave();
    }
  }

  /** Agenda uma escrita para daqui a pouco (coalesce várias mudanças). */
  markDirty() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    this.data = defaultSave();
    this.flush();
  }

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  /** @param {string} json */
  importJSON(json) {
    const parsed = JSON.parse(json);
    if (!parsed || parsed.version !== SAVE_VERSION || !Array.isArray(parsed.inventory)) {
      throw new Error('Arquivo de save inválido');
    }
    this.data = { ...defaultSave(), ...parsed };
    this.flush();
  }
}
