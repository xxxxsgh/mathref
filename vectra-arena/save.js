/* ==========================================================================
   VECTRA ARENA — save.js
   SaveManager: everything persistent lives in one localStorage entry
   ("vectra_save"): settings, inventory (skins, float values, pattern seeds),
   equipped items and player progress.
   ========================================================================== */

const SAVE_KEY = 'vectra_save';
const SAVE_VERSION = 1;

const DEFAULT_SETTINGS = {
  sensitivity: 1.0,      // multiplier over the base mouse speed
  fov: 90,               // horizontal-ish vertical FOV used by the world camera
  quality: 'medium',     // low | medium | high
  masterVolume: 0.8,
  musicVolume: 0.35,
  sfxVolume: 0.8,
  crosshairSize: 9,      // length of each crosshair line, px
  crosshairGap: 5,       // gap from the center, px
  crosshairColor: '#3df5ff',
  minimapRotate: true,
  difficulty: 'normal',  // easy | normal | hard
};

class SaveManager {
  constructor() {
    this.data = this.load();
  }

  defaultData() {
    return {
      version: SAVE_VERSION,
      settings: { ...DEFAULT_SETTINGS },
      inventory: null,          // filled by Inventory on first run
      nextItemId: 1,
      equipped: { rifle: null, sniper: null, pistol: null, knife: null },
      primary: 'rifle',         // which primary the loadout uses: rifle | sniper
      progress: {
        level: 1, xp: 0, credits: 0,
        matches: 0, wins: 0, losses: 0,
        kills: 0, deaths: 0, headshots: 0, roundsWon: 0,
      },
    };
  }

  /** Loads and merges with defaults so older saves never miss new keys. */
  load() {
    const def = this.defaultData();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return def;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return def;
      return {
        ...def,
        ...d,
        settings: { ...def.settings, ...(d.settings || {}) },
        progress: { ...def.progress, ...(d.progress || {}) },
        equipped: { ...def.equipped, ...(d.equipped || {}) },
      };
    } catch (e) {
      console.warn('[save] could not read save, starting fresh', e);
      return def;
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[save] localStorage unavailable', e);
    }
  }

  reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    this.data = this.defaultData();
  }

  get settings() { return this.data.settings; }
  get progress() { return this.data.progress; }

  /** XP needed to go from `level` to `level + 1`. */
  static xpForLevel(level) { return 600 + (level - 1) * 250; }

  /** Adds XP and returns how many levels were gained. */
  addXP(amount) {
    const p = this.data.progress;
    p.xp += amount;
    let gained = 0;
    while (p.xp >= SaveManager.xpForLevel(p.level)) {
      p.xp -= SaveManager.xpForLevel(p.level);
      p.level++;
      gained++;
    }
    return gained;
  }
}
