import { SKINS, skinById, WEAPON_TYPES } from '../skins/SkinCatalog.js';
import { rarityById, RARITIES } from '../skins/Rarity.js';
import { wearTier } from '../skins/Wear.js';
import { PATTERN_SEED_MAX } from '../skins/PatternSystem.js';
import { mulberry32, hashString } from '../core/Rng.js';

/**
 * Inventário offline.
 *
 * Cada item é uma INSTÂNCIA de skin com identidade própria:
 *   { id, weaponType, skinId, rarity, floatValue, patternSeed, wearSeed, equipped, acquiredAt }
 *
 * Economia fictícia: "fragmentos" (shards) ganhos jogando, gastos num
 * mercado de listagens FIXAS — o jogador vê float e seed antes de comprar.
 * Não há caixas, sorteio pago, nem dinheiro real.
 */

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} weaponType
 * @property {string} skinId
 * @property {string} rarity
 * @property {number} floatValue
 * @property {number} patternSeed
 * @property {number} wearSeed
 * @property {boolean} equipped
 * @property {number} acquiredAt
 */

export class InventorySystem {
  /** @param {import('../core/Save.js').Save} save */
  constructor(save) {
    this.save = save;
    /** @type {((inv: InventorySystem) => void)[]} */
    this.listeners = [];
    if (!save.data.inventory.length) this.grantStarter();
    this.sanitize();
  }

  get items() {
    return /** @type {Item[]} */ (this.save.data.inventory);
  }

  get shards() {
    return this.save.data.progression.shards;
  }

  changed() {
    this.save.markDirty();
    for (const fn of this.listeners) fn(this);
  }

  /** @param {(inv: InventorySystem) => void} fn */
  onChange(fn) {
    this.listeners.push(fn);
  }

  /** ID único sequencial no formato ITEM-0001842. */
  nextId() {
    const n = this.save.data.nextItemNumber++;
    return `ITEM-${String(n).padStart(7, '0')}`;
  }

  /**
   * Cria uma instância de skin. Float e seed sorteados (ou fixos).
   * @param {string} skinId
   * @param {{ floatValue?: number, patternSeed?: number, wearSeed?: number, rng?: () => number }} [o]
   * @returns {Item}
   */
  createItem(skinId, o = {}) {
    const skin = skinById(skinId);
    const rng = o.rng || Math.random;
    const [fmin, fmax] = skin.floatRange;
    const id = this.nextId();
    return {
      id,
      weaponType: skin.weaponType,
      skinId,
      rarity: skin.rarity,
      floatValue: o.floatValue ?? fmin + rng() * (fmax - fmin),
      patternSeed: o.patternSeed ?? Math.floor(rng() * (PATTERN_SEED_MAX + 1)),
      // seed de desgaste ÚNICO por item: vem do id, então nunca se repete
      wearSeed: o.wearSeed ?? hashString(id + ':' + skinId),
      equipped: false,
      acquiredAt: Date.now(),
    };
  }

  /** @param {Item} item */
  add(item) {
    this.items.push(item);
    this.changed();
    return item;
  }

  /** Inventário inicial: variedade de skins e floats para mostrar o sistema. */
  grantStarter() {
    const rng = mulberry32(20261001);
    const starter = [
      ['knife_rust_protocol', 0.27],
      ['knife_arctic_signal', 0.09],
      ['knife_crimson_circuit', 0.031],
      ['rifle_urban_static', 0.61],
      ['rifle_solar_grid', 0.018],
      ['rifle_copperline', 0.22],
      ['pistol_night_shift', 0.41],
      ['pistol_ember_coil', 0.12],
      ['smg_kelp', 0.33],
      ['dmr_ironbark', 0.52],
      ['heavy_sandstorm', 0.08],
    ];
    for (const [skinId, f] of starter) {
      const it = this.createItem(/** @type {string} */ (skinId), { floatValue: /** @type {number} */ (f), rng });
      this.items.push(it);
    }
    // já equipa um de cada tipo
    for (const type of Object.keys(WEAPON_TYPES)) {
      const first = this.items.find((i) => i.weaponType === type);
      if (first) first.equipped = true;
    }
    const k = this.items.find((i) => i.skinId === 'knife_crimson_circuit');
    if (k) {
      for (const i of this.items) if (i.weaponType === 'knife') i.equipped = false;
      k.equipped = true;
    }
    this.save.markDirty();
  }

  /** Remove itens com skin inexistente (save antigo) e garante 1 equipado por tipo. */
  sanitize() {
    const valid = new Set(SKINS.map((s) => s.id));
    this.save.data.inventory = this.items.filter((i) => valid.has(i.skinId));
    for (const type of Object.keys(WEAPON_TYPES)) {
      const eq = this.items.filter((i) => i.weaponType === type && i.equipped);
      for (let j = 1; j < eq.length; j++) eq[j].equipped = false;
    }
  }

  /** @param {string} id */
  get(id) {
    return this.items.find((i) => i.id === id) || null;
  }

  /** Item equipado de um tipo (ou null = arma padrão). @param {string} type */
  equippedFor(type) {
    return this.items.find((i) => i.weaponType === type && i.equipped) || null;
  }

  /** @param {string} id */
  equip(id) {
    const it = this.get(id);
    if (!it) return false;
    for (const i of this.items) if (i.weaponType === it.weaponType) i.equipped = false;
    it.equipped = true;
    this.changed();
    return true;
  }

  /** @param {string} id */
  unequip(id) {
    const it = this.get(id);
    if (!it) return false;
    it.equipped = false;
    this.changed();
    return true;
  }

  /**
   * Valor de mercado fictício: raridade × condição × seed especial.
   * @param {Item} it
   */
  value(it) {
    const r = rarityById(it.rarity);
    const cond = 1.35 - Math.min(1, it.floatValue) * 0.75;
    const knife = it.weaponType === 'knife' ? 1.6 : 1;
    return Math.round(r.value * cond * knife);
  }

  sellValue(it) {
    return Math.round(this.value(it) * 0.6);
  }

  /** Vende (remove) um item em troca de fragmentos. @param {string} id */
  sell(id) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return 0;
    const it = this.items[idx];
    const v = this.sellValue(it);
    this.items.splice(idx, 1);
    this.save.data.progression.shards += v;
    this.changed();
    return v;
  }

  /** Listagens do mercado (renovadas a cada 10 minutos ou manualmente). */
  market(force = false) {
    const d = this.save.data;
    if (force || !d.market.length || Date.now() > d.marketRefreshAt) {
      const rng = mulberry32((Date.now() / 1000) >>> 0);
      d.market = [];
      for (let i = 0; i < 8; i++) {
        // raridades altas aparecem menos (é vitrine, não sorteio: tudo visível)
        const weights = [30, 26, 20, 13, 8, 3];
        let r = rng() * weights.reduce((a, b) => a + b, 0);
        let tier = 0;
        while (r > weights[tier]) r -= weights[tier++];
        const pool = SKINS.filter((s) => s.rarity === RARITIES[tier].id);
        const skin = pool[Math.floor(rng() * pool.length)];
        const [fmin, fmax] = skin.floatRange;
        const listing = {
          listingId: `L${i}-${Math.floor(rng() * 1e6)}`,
          skinId: skin.id,
          floatValue: fmin + rng() * (fmax - fmin),
          patternSeed: Math.floor(rng() * (PATTERN_SEED_MAX + 1)),
        };
        d.market.push(listing);
      }
      d.marketRefreshAt = Date.now() + 10 * 60 * 1000;
      this.save.markDirty();
    }
    return d.market;
  }

  /** Preço de uma listagem. */
  listingPrice(l) {
    const skin = skinById(l.skinId);
    return this.value(/** @type {Item} */ ({ rarity: skin.rarity, floatValue: l.floatValue, weaponType: skin.weaponType }));
  }

  /** Compra uma listagem com fragmentos. */
  buyListing(listingId) {
    const d = this.save.data;
    const idx = d.market.findIndex((l) => l.listingId === listingId);
    if (idx < 0) return null;
    const l = d.market[idx];
    const price = this.listingPrice(l);
    if (d.progression.shards < price) return null;
    d.progression.shards -= price;
    d.market.splice(idx, 1);
    // mesmo seed de desgaste da prévia: o item comprado é idêntico ao exibido
    const it = this.createItem(l.skinId, { floatValue: l.floatValue, patternSeed: l.patternSeed, wearSeed: hashString(l.listingId) });
    return this.add(it);
  }

  /**
   * Comparação lado a lado de dois itens (só atributos visuais).
   * @param {Item} a @param {Item} b
   */
  compare(a, b) {
    const sa = skinById(a.skinId);
    const sb = skinById(b.skinId);
    return [
      ['Arma', WEAPON_TYPES[a.weaponType].model, WEAPON_TYPES[b.weaponType].model],
      ['Skin', sa.name, sb.name],
      ['Raridade', rarityById(a.rarity).name, rarityById(b.rarity).name],
      ['Condição', wearTier(a.floatValue).name, wearTier(b.floatValue).name],
      ['Float', a.floatValue.toFixed(6), b.floatValue.toFixed(6)],
      ['Pattern seed', String(a.patternSeed), String(b.patternSeed)],
      ['Valor', String(this.value(a)), String(this.value(b))],
    ];
  }
}
