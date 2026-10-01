/**
 * Raridades. Puramente cosméticas: nenhum valor aqui chega em dano, recuo ou
 * precisão — o combate lê só `WeaponData`.
 */
export const RARITIES = /** @type {const} */ ([
  { id: 'common', name: 'Common', label: 'Comum', color: '#aab4be', glow: 'rgba(170,180,190,0.25)', value: 60 },
  { id: 'uncommon', name: 'Uncommon', label: 'Incomum', color: '#5fd068', glow: 'rgba(95,208,104,0.3)', value: 140 },
  { id: 'rare', name: 'Rare', label: 'Rara', color: '#4b8dff', glow: 'rgba(75,141,255,0.35)', value: 320 },
  { id: 'epic', name: 'Epic', label: 'Épica', color: '#a45cff', glow: 'rgba(164,92,255,0.4)', value: 700 },
  { id: 'legendary', name: 'Legendary', label: 'Lendária', color: '#ffb02e', glow: 'rgba(255,176,46,0.45)', value: 1500 },
  { id: 'mythic', name: 'Mythic', label: 'Mítica', color: '#ff3d6e', glow: 'rgba(255,61,110,0.5)', value: 3200 },
]);

/** @param {string} id */
export function rarityById(id) {
  return RARITIES.find((r) => r.id === id) || RARITIES[0];
}

/** Índice de ordenação (common = 0 … mythic = 5). */
export function rarityRank(id) {
  return Math.max(0, RARITIES.findIndex((r) => r.id === id));
}
