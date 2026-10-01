/**
 * Dados de combate das armas. ÚNICA fonte de estatísticas: skin, float e
 * raridade nunca entram aqui (são só visual).
 *
 * Unidades: dano em HP, tempos em segundos, distâncias em metros, ângulos
 * de dispersão em radianos, padrão de recuo em graus.
 */

/**
 * @typedef {Object} WeaponDef
 * @property {string} id
 * @property {'knife'|'rifle'|'smg'|'dmr'|'pistol'|'heavy'} type
 * @property {'primary'|'secondary'|'melee'} slot
 * @property {string} name
 * @property {boolean} auto
 * @property {number} interval     tempo entre tiros
 * @property {number} damage
 * @property {number} headMult
 * @property {number} armorPen     fração do dano que atravessa colete
 * @property {number} rangeMod     multiplicador de dano a cada 10 m
 * @property {number} range
 * @property {number} mag
 * @property {number} reserve
 * @property {number} reloadTime
 * @property {number} drawTime
 * @property {number} moveMult     multiplicador de velocidade ao carregar
 * @property {number} spreadBase
 * @property {number} spreadCrouch
 * @property {number} spreadMove   adicional por m/s de velocidade horizontal
 * @property {number} spreadAir
 * @property {number} spreadPerShot
 * @property {number} spreadMax
 * @property {number} spreadRecover  rad/s
 * @property {[number, number][]} pattern  recuo [pitch, yaw] por tiro
 * @property {number} recoilRecover   velocidade de volta da mira
 * @property {number} kick            empurrão visual da arma
 * @property {number} price
 * @property {number} killReward
 * @property {number} [zoomFov]
 * @property {string} sound
 * @property {number} tracerChance
 */

/** Padrão de recuo: sobe, depois serpenteia. Gerado de forma legível. */
function pattern(steps, climb, sway, settle) {
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i < steps; i++) {
    const up = i < settle ? climb * (1 - i / (settle * 1.6)) : climb * 0.2;
    const side = i < settle * 0.6 ? (i % 2 ? 0.05 : -0.04) : Math.sin(i * 0.55) * sway;
    out.push([up, side]);
  }
  return out;
}

/** @type {Record<string, WeaponDef>} */
export const WEAPONS = {
  rifle: {
    id: 'rifle', type: 'rifle', slot: 'primary', name: 'VX-9 Corsair', auto: true,
    interval: 0.1, damage: 34, headMult: 4, armorPen: 0.78, rangeMod: 0.98, range: 120,
    mag: 30, reserve: 90, reloadTime: 2.4, drawTime: 0.75, moveMult: 0.9,
    spreadBase: 0.0028, spreadCrouch: 0.0016, spreadMove: 0.011, spreadAir: 0.09,
    spreadPerShot: 0.0042, spreadMax: 0.05, spreadRecover: 0.09,
    pattern: pattern(30, 0.92, 0.55, 10), recoilRecover: 9, kick: 1,
    price: 2700, killReward: 300, sound: 'rifle', tracerChance: 0.5,
  },
  smg: {
    id: 'smg', type: 'smg', slot: 'primary', name: 'Wasp-11', auto: true,
    interval: 0.075, damage: 26, headMult: 3.6, armorPen: 0.62, rangeMod: 0.86, range: 70,
    mag: 30, reserve: 120, reloadTime: 2.1, drawTime: 0.55, moveMult: 0.98,
    spreadBase: 0.004, spreadCrouch: 0.003, spreadMove: 0.0045, spreadAir: 0.07,
    spreadPerShot: 0.0035, spreadMax: 0.045, spreadRecover: 0.12,
    pattern: pattern(30, 0.6, 0.45, 8), recoilRecover: 11, kick: 0.7,
    price: 1250, killReward: 600, sound: 'smg', tracerChance: 0.45,
  },
  dmr: {
    id: 'dmr', type: 'dmr', slot: 'primary', name: 'Lancer DMR', auto: false,
    interval: 0.32, damage: 78, headMult: 3, armorPen: 0.86, rangeMod: 0.99, range: 200,
    mag: 10, reserve: 30, reloadTime: 2.8, drawTime: 0.9, moveMult: 0.82,
    spreadBase: 0.018, spreadCrouch: 0.014, spreadMove: 0.02, spreadAir: 0.15,
    spreadPerShot: 0.02, spreadMax: 0.06, spreadRecover: 0.12,
    pattern: pattern(10, 2.4, 0.3, 4), recoilRecover: 7, kick: 1.6,
    price: 3800, killReward: 300, zoomFov: 28, sound: 'dmr', tracerChance: 1,
  },
  pistol: {
    id: 'pistol', type: 'pistol', slot: 'secondary', name: 'Kite P9', auto: false,
    interval: 0.15, damage: 30, headMult: 4, armorPen: 0.5, rangeMod: 0.88, range: 70,
    mag: 15, reserve: 60, reloadTime: 2.0, drawTime: 0.45, moveMult: 1,
    spreadBase: 0.0045, spreadCrouch: 0.0035, spreadMove: 0.004, spreadAir: 0.07,
    spreadPerShot: 0.012, spreadMax: 0.05, spreadRecover: 0.08,
    pattern: pattern(15, 1.1, 0.3, 5), recoilRecover: 10, kick: 0.6,
    price: 0, killReward: 300, sound: 'pistol', tracerChance: 0.35,
  },
  heavy: {
    id: 'heavy', type: 'heavy', slot: 'secondary', name: 'Brawler .50', auto: false,
    interval: 0.42, damage: 58, headMult: 4, armorPen: 0.93, rangeMod: 0.81, range: 80,
    mag: 7, reserve: 35, reloadTime: 2.2, drawTime: 0.6, moveMult: 0.97,
    spreadBase: 0.006, spreadCrouch: 0.005, spreadMove: 0.012, spreadAir: 0.1,
    spreadPerShot: 0.03, spreadMax: 0.07, spreadRecover: 0.08,
    pattern: pattern(7, 3, 0.5, 3), recoilRecover: 6, kick: 1.5,
    price: 700, killReward: 300, sound: 'heavy', tracerChance: 0.5,
  },
  knife: {
    id: 'knife', type: 'knife', slot: 'melee', name: 'TALON-K', auto: true,
    interval: 0.42, damage: 34, headMult: 1, armorPen: 0.85, rangeMod: 1, range: 1.9,
    mag: 0, reserve: 0, reloadTime: 0, drawTime: 0.6, moveMult: 1.08,
    spreadBase: 0, spreadCrouch: 0, spreadMove: 0, spreadAir: 0,
    spreadPerShot: 0, spreadMax: 0, spreadRecover: 0,
    pattern: [], recoilRecover: 0, kick: 0,
    price: 0, killReward: 1500, sound: 'knife', tracerChance: 0,
  },
};

/** Golpe pesado da faca (botão direito). */
export const KNIFE_HEAVY = { interval: 1.0, damage: 65, backstab: 180, range: 1.6, windup: 0.22 };
/** Golpe leve: o primeiro bate mais; em sequência, menos. Pelas costas, x2,5. */
export const KNIFE_LIGHT = { first: 40, chain: 25, backstabMult: 2.5, windup: 0.08 };

/** Equipamento comprável na fase de compra. */
export const EQUIPMENT = {
  vest: { id: 'vest', name: 'Colete', price: 650 },
  vestHelmet: { id: 'vestHelmet', name: 'Colete + Capacete', price: 1000 },
};
