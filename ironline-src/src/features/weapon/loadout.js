/**
 * Loadout do jogador — lógica PURA (sem three, sem DOM; testada em
 * tools/unit.test.mjs via weapon.test.mjs).
 *
 *  - Definições das armas (estatísticas, tempos de saque/guarda, ícone).
 *    `WEAPON_DEFS` = loadout padrão (fuzil + pistola); `ALL_WEAPONS` = todas
 *    as armas do jogo (catálogo publicado em `services.weapon.weapons`).
 *  - Estado por arma (munição no carregador e reserva) — trocar de arma não
 *    perde o carregador. Trocar a arma de um slot (`setSlot`) guarda a
 *    munição da antiga num cache por id.
 *  - Máquina de troca: ready → holster (guarda a atual) → swap → draw (saca
 *    a nova) → ready. Pedir outra arma no meio da guarda só redireciona; pedir
 *    a mesma durante o saque é ignorado. O índice `weapons.length` é a FACA
 *    na mão (tecla 3): entra na máquina de troca, mas não no ciclo da roda.
 *  - Equipamento: granadas de fragmentação e táticas (atordoantes).
 */

/** Definições das armas (o id é o que a HUD usa para nome/ícone). */
export const WEAPON_DEFS = [
  {
    id: 'kr9', slot: 'primary', name: 'KR-9', icon: 'rifle', kind: 'rifle', caliber: '5.56',
    magSize: 30, reserve: 150, rpm: 760, auto: true, damage: 34, headMult: 2.4,
    falloff: [40, 0.8], spread: [0.028, 0.0015], moveSpread: 0.02,
    adsTime: 0.24, adsFov: 0.8, vmFovAds: 19, eyeRelief: 0.2,
    draw: 0.68, holster: 0.32, reload: 2.3, reloadEmpty: 2.75,
    range: 72, mobility: 70, control: 66,
  },
  {
    id: 'p11', slot: 'secondary', name: 'P-11', icon: 'pistol', kind: 'pistol', caliber: '9mm',
    magSize: 17, reserve: 68, rpm: 480, auto: false, damage: 27, headMult: 2.2,
    falloff: [22, 0.75], spread: [0.022, 0.0025], moveSpread: 0.014,
    adsTime: 0.17, adsFov: 0.9, vmFovAds: 38, eyeRelief: 0.34,
    draw: 0.5, holster: 0.26, reload: 1.6, reloadEmpty: 1.95,
    range: 38, mobility: 92, control: 74,
  },
];

/** Armas extras (catálogo completo = WEAPON_DEFS + estas). */
export const EXTRA_DEFS = [
  {
    // submetralhadora compacta de ferrolho fechado: cadência alta, alcance curto
    id: 'mx9', slot: 'primary', name: 'MX-9', icon: 'smg', kind: 'smg', caliber: '9mm',
    magSize: 32, reserve: 160, rpm: 940, auto: true, damage: 22, headMult: 1.8,
    falloff: [10, 26, 0.55], spread: [0.03, 0.0035], moveSpread: 0.01,
    adsTime: 0.16, adsFov: 0.85, eyeRelief: 0.2,
    draw: 0.45, holster: 0.25, reload: 1.9, reloadEmpty: 2.3,
    range: 30, mobility: 88, control: 70,
  },
  {
    // escopeta de bomba: 9 chumbos, carga cartucho a cartucho
    id: 'br12', slot: 'primary', name: 'BR-12', icon: 'shotgun', kind: 'shotgun', caliber: '12ga',
    magSize: 7, reserve: 35, rpm: 70, auto: false, damage: 17, headMult: 1.4,
    falloff: [6, 24, 0.2], spread: [0.012, 0.004], moveSpread: 0.006,
    pellets: 9, pelletSpread: 0.068, pump: true,
    adsTime: 0.24, adsFov: 0.88, eyeRelief: 0.26,
    draw: 0.6, holster: 0.3, reload: 0.48, reloadEmpty: 0.48, shellTime: 0.46,
    range: 14, mobility: 74, control: 40,
  },
  {
    // fuzil de precisão de ferrolho: luneta 8x, um tiro por ciclo
    id: 'lr50', slot: 'primary', name: 'LR-50', icon: 'sniper', kind: 'sniper', caliber: '.338',
    magSize: 5, reserve: 25, rpm: 46, auto: false, damage: 112, headMult: 2.6,
    falloff: [9999, 1], spread: [0.07, 0.00015], moveSpread: 0.05,
    bolt: true, scope: { zoom: 8 },
    adsTime: 0.36, adsFov: 0.86, eyeRelief: 0.09,
    draw: 0.8, holster: 0.4, reload: 2.9, reloadEmpty: 3.6,
    range: 100, mobility: 45, control: 30,
  },
  {
    // metralhadora leve: caixa de 100 com fita, mira lenta
    id: 'hm60', slot: 'primary', name: 'HM-60', icon: 'lmg', kind: 'lmg', caliber: '7.62',
    magSize: 100, reserve: 200, rpm: 690, auto: true, damage: 31, headMult: 2.0,
    falloff: [48, 0.85], spread: [0.042, 0.0022], moveSpread: 0.03,
    adsTime: 0.44, adsFov: 0.8, eyeRelief: 0.2,
    draw: 0.95, holster: 0.45, reload: 5.2, reloadEmpty: 5.9,
    range: 76, mobility: 40, control: 55,
  },
  {
    // fuzil designado semiautomático com luneta 4x
    id: 'sr7', slot: 'primary', name: 'SR-7', icon: 'dmr', kind: 'dmr', caliber: '7.62',
    magSize: 20, reserve: 80, rpm: 320, auto: false, damage: 56, headMult: 2.3,
    falloff: [70, 0.9], spread: [0.034, 0.0006], moveSpread: 0.03,
    scope: { zoom: 4 },
    adsTime: 0.3, adsFov: 0.86, eyeRelief: 0.1,
    draw: 0.62, holster: 0.32, reload: 2.4, reloadEmpty: 2.9,
    range: 88, mobility: 60, control: 58,
  },
];
export const ALL_WEAPONS = [...WEAPON_DEFS, ...EXTRA_DEFS];
export const weaponDef = (id) => ALL_WEAPONS.find((d) => d.id === id) || null;

/**
 * Facas (a TK-7 é a padrão). `aliases` = ids alternativos aceitos por
 * setKnife (nomes do catálogo do inventário). `style` = golpe.
 */
export const KNIVES = [
  { id: 'tk7', name: 'TK-7', style: 'slash', aliases: ['knife'] },
  { id: 'karambit', name: 'KARAMBIT', style: 'hook', aliases: ['garra'] },
  { id: 'balisong', name: 'BALISONG', style: 'thrust', aliases: ['borboleta', 'butterfly'] },
  { id: 'tanto', name: 'TANTO', style: 'slash', aliases: ['cacadora'] },
  { id: 'bayonet', name: 'BAIONETA', style: 'thrust', aliases: ['baioneta'] },
  { id: 'kukri', name: 'KUKRI', style: 'chop', aliases: [] },
  { id: 'cleaver', name: 'CUTELO', style: 'chop', aliases: ['cutelo'] },
];
export const knifeId = (id) => (KNIVES.find((k) => k.id === id || k.aliases.includes(id)) || null)?.id || null;
/** Pseudo-arma "faca na mão" (tecla 3). */
export const KNIFE_DEF = {
  id: 'knife', slot: 'melee', name: 'KNIFE', icon: 'knife', kind: 'knife', magSize: 0, reserve: 0, rpm: 100,
  auto: true, damage: 150, headMult: 1, falloff: [9999, 1], spread: [0, 0], moveSpread: 0,
  adsTime: 0.2, adsFov: 1, draw: 0.42, holster: 0.22, reload: 0, reloadEmpty: 0,
};

/** Equipamento (granadas) e corpo a corpo. */
export const EQUIP_DEFS = {
  frag: { id: 'frag', name: 'FRAG', icon: 'frag', count: 2, max: 3, fuse: 3.5, radius: 7, damage: 160, speed: 15 },
  flash: { id: 'flash', name: 'STUN', icon: 'flash', count: 2, max: 2, fuse: 1.6, radius: 9, speed: 15 },
  knife: { id: 'knife', name: 'KNIFE', icon: 'knife', damage: 150, range: 2.0, lunge: 3.6, time: 0.62 },
};

export class Loadout {
  constructor(defs = WEAPON_DEFS, { grenades = EQUIP_DEFS.frag.count, tacticals = EQUIP_DEFS.flash.count } = {}) {
    this.weapons = defs.map((def) => ({ def, ammo: def.magSize, reserve: def.reserve }));
    this.knife = { def: KNIFE_DEF, ammo: 0, reserve: 0 };
    this.cache = new Map(); // munição das armas tiradas do loadout (por id)
    this.index = 0;
    this.pending = -1;
    this.phase = 'ready'; // 'ready' | 'holster' | 'draw'
    this.t = 0;
    this.grenades = grenades;
    this.tacticals = tacticals;
  }

  get current() {
    return this.index >= this.weapons.length ? this.knife : this.weapons[this.index];
  }
  /** Índice da faca na mão (depois das armas). */
  get knifeIndex() {
    return this.weapons.length;
  }
  get knifeOut() {
    return this.index === this.weapons.length;
  }
  /** Def do slot i (arma ou faca). */
  defAt(i) {
    return i >= this.weapons.length ? KNIFE_DEF : this.weapons[i]?.def;
  }
  /**
   * Troca a arma do slot i por `def` (ex.: setPrimary). A munição da antiga
   * fica no cache; a nova volta com a munição que tinha (ou cheia). Devolve
   * true se mudou. Uma arma não pode ocupar os dois slots: se `def` já está
   * no outro, os slots trocam de lugar.
   */
  setSlot(i, def) {
    if (!def || !Number.isInteger(i) || i < 0 || i >= this.weapons.length) return false;
    const cur = this.weapons[i];
    if (cur.def.id === def.id) return false;
    const other = this.weapons.findIndex((w, k) => k !== i && w.def.id === def.id);
    if (other >= 0) {
      // os dois objetos de estado trocam de slot (munição vai junto)
      const moved = this.weapons[other];
      this.weapons[other] = cur;
      this.weapons[i] = moved;
      return true;
    }
    this.cache.set(cur.def.id, { ammo: cur.ammo, reserve: cur.reserve });
    const c = this.cache.get(def.id);
    this.weapons[i] = { def, ammo: c ? c.ammo : def.magSize, reserve: c ? c.reserve : def.reserve };
    return true;
  }
  get def() {
    return this.current.def;
  }
  get switching() {
    return this.phase !== 'ready';
  }
  /** Progresso 0..1 da fase atual (para animação). */
  get progress() {
    if (this.phase === 'holster') return Math.min(1, this.t / this.def.holster);
    if (this.phase === 'draw') return Math.min(1, this.t / this.def.draw);
    return 1;
  }

  /** Pede a arma do slot i. Devolve true se começou/redirecionou uma troca. */
  request(i) {
    const n = this.weapons.length + 1; // + faca
    if (!Number.isInteger(i) || i < 0 || i >= n) return false;
    if (this.phase === 'holster') {
      if (i === this.pending) return false;
      if (i === this.index) {
        // desistiu no meio da guarda: volta a sacar a mesma, do ponto onde estava
        const p = this.progress;
        this.phase = 'draw';
        this.pending = -1;
        this.t = (1 - p) * this.def.draw;
        return true;
      }
      this.pending = i;
      return true;
    }
    if (i === this.index) return false;
    this.phase = 'holster';
    this.pending = i;
    this.t = 0;
    return true;
  }
  /** Próxima/anterior (roda do mouse): dir = ±1. */
  cycle(dir = 1) {
    const n = this.weapons.length;
    let base = this.phase === 'holster' ? this.pending : this.index;
    if (base >= n) base = dir > 0 ? n - 1 : 0; // com a faca: a roda volta para as armas
    return this.request((((base + Math.sign(dir || 1)) % n) + n) % n);
  }
  /** Saque imediato (início de partida, respawn): sem guardar a anterior. */
  drawNow(i = this.index) {
    this.index = i;
    this.pending = -1;
    this.phase = 'draw';
    this.t = 0;
  }

  /**
   * Avança a máquina. Devolve 'swap' no passo em que a arma troca (fim da
   * guarda), 'ready' quando o saque termina, ou null.
   */
  step(dt) {
    if (this.phase === 'ready') return null;
    this.t += dt;
    if (this.phase === 'holster' && this.t >= this.def.holster) {
      this.index = this.pending;
      this.pending = -1;
      this.phase = 'draw';
      this.t = 0;
      return 'swap';
    }
    if (this.phase === 'draw' && this.t >= this.def.draw) {
      this.phase = 'ready';
      this.t = 0;
      return 'ready';
    }
    return null;
  }

  /** Cartuchos que uma recarga transfere da reserva para o carregador. */
  reloadAmount(w = this.current) {
    return Math.max(0, Math.min(w.def.magSize - w.ammo, w.reserve));
  }
  /** Aplica a recarga (no instante do encaixe). Devolve quantos entraram. `max` limita (cartucho a cartucho). */
  applyReload(w = this.current, max = Infinity) {
    const n = Math.min(max, this.reloadAmount(w));
    w.ammo += n;
    w.reserve -= n;
    return n;
  }
  canReload(w = this.current) {
    return w.def.magSize > 0 && w.ammo < w.def.magSize && w.reserve > 0;
  }
  /** Gasta uma granada ('frag') ou tática ('flash'). */
  useEquipment(kind = 'frag') {
    const k = kind === 'flash' ? 'tacticals' : 'grenades';
    if (this[k] <= 0) return false;
    this[k]--;
    return true;
  }
  /** Fixa a contagem de granadas de fragmentação (inteiro ≥ 0). */
  setGrenades(n) {
    this.grenades = Math.max(0, n | 0);
    return this.grenades;
  }
  /** Fixa a contagem de táticas/atordoantes (inteiro ≥ 0; 0 = travada, ex.: progressão do HUD). */
  setTacticals(n) {
    this.tacticals = Math.max(0, n | 0);
    return this.tacticals;
  }
  /** Reabastece (respawn/caixa de munição). */
  refill() {
    for (const w of this.weapons) {
      w.ammo = w.def.magSize;
      w.reserve = w.def.reserve;
    }
    this.cache.clear();
    this.grenades = EQUIP_DEFS.frag.count;
    this.tacticals = EQUIP_DEFS.flash.count;
  }
}
