/**
 * Loadout do jogador — lógica PURA (sem three, sem DOM; testada em
 * tools/unit.test.mjs via weapon.test.mjs).
 *
 *  - Definições das armas (estatísticas, tempos de saque/guarda, ícone).
 *  - Estado por arma (munição no carregador e reserva) — trocar de arma não
 *    perde o carregador.
 *  - Máquina de troca: ready → holster (guarda a atual) → swap → draw (saca
 *    a nova) → ready. Pedir outra arma no meio da guarda só redireciona; pedir
 *    a mesma durante o saque é ignorado.
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
  },
  {
    id: 'p11', slot: 'secondary', name: 'P-11', icon: 'pistol', kind: 'pistol', caliber: '9mm',
    magSize: 17, reserve: 68, rpm: 480, auto: false, damage: 27, headMult: 2.2,
    falloff: [22, 0.75], spread: [0.022, 0.0025], moveSpread: 0.014,
    adsTime: 0.17, adsFov: 0.9, vmFovAds: 38, eyeRelief: 0.34,
    draw: 0.5, holster: 0.26, reload: 1.6, reloadEmpty: 1.95,
  },
];

/** Equipamento (granadas) e corpo a corpo. */
export const EQUIP_DEFS = {
  frag: { id: 'frag', name: 'FRAG', icon: 'frag', count: 2, max: 3, fuse: 3.5, radius: 7, damage: 160, speed: 15 },
  flash: { id: 'flash', name: 'STUN', icon: 'flash', count: 2, max: 2, fuse: 1.6, radius: 9, speed: 15 },
  knife: { id: 'knife', name: 'KNIFE', icon: 'knife', damage: 150, range: 2.0, lunge: 3.6, time: 0.62 },
};

export class Loadout {
  constructor(defs = WEAPON_DEFS, { grenades = EQUIP_DEFS.frag.count, tacticals = EQUIP_DEFS.flash.count } = {}) {
    this.weapons = defs.map((def) => ({ def, ammo: def.magSize, reserve: def.reserve }));
    this.index = 0;
    this.pending = -1;
    this.phase = 'ready'; // 'ready' | 'holster' | 'draw'
    this.t = 0;
    this.grenades = grenades;
    this.tacticals = tacticals;
  }

  get current() {
    return this.weapons[this.index];
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
    const n = this.weapons.length;
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
    const base = this.phase === 'holster' ? this.pending : this.index;
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
  /** Aplica a recarga (no instante do encaixe). Devolve quantos entraram. */
  applyReload(w = this.current) {
    const n = this.reloadAmount(w);
    w.ammo += n;
    w.reserve -= n;
    return n;
  }
  canReload(w = this.current) {
    return w.ammo < w.def.magSize && w.reserve > 0;
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
    this.grenades = EQUIP_DEFS.frag.count;
    this.tacticals = EQUIP_DEFS.flash.count;
  }
}
