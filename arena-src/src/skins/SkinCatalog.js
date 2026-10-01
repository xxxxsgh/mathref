/**
 * Catálogo de skins — todas originais.
 *
 * `pattern` escolhe o gerador procedural do shader (ver SkinMaterial.js).
 * `base`/`accent`/`detail` são as três cores do padrão; `baseMaterial` e
 * `accentMaterial` dizem como a tinta reflete a luz.
 * `floatRange` limita o float que o item pode nascer (algumas skins só
 * existem a partir de certo desgaste, como no gênero).
 */

/** Acabamentos de superfície: metalness/roughness da tinta. */
export const FINISHES = {
  anodized: { label: 'Alumínio anodizado', metal: 0.75, rough: 0.32 },
  painted: { label: 'Pintura epóxi', metal: 0.08, rough: 0.55 },
  ceramic: { label: 'Cerâmica', metal: 0.02, rough: 0.22 },
  polymer: { label: 'Polímero', metal: 0.0, rough: 0.68 },
  satin: { label: 'Aço acetinado', metal: 0.95, rough: 0.3 },
  chrome: { label: 'Cromado', metal: 1.0, rough: 0.12 },
  hydro: { label: 'Hidrográfica', metal: 0.25, rough: 0.4 },
};

/** Tipos de arma com nome de exibição. */
export const WEAPON_TYPES = {
  knife: { label: 'Faca', model: 'TALON-K' },
  rifle: { label: 'Fuzil', model: 'VX-9 Corsair' },
  smg: { label: 'Submetralhadora', model: 'Wasp-11' },
  dmr: { label: 'Rifle de precisão', model: 'Lancer DMR' },
  pistol: { label: 'Pistola', model: 'Kite P9' },
  heavy: { label: 'Pistola pesada', model: 'Brawler .50' },
};

/**
 * @typedef {Object} SkinDef
 * @property {string} id
 * @property {string} name
 * @property {keyof typeof WEAPON_TYPES} weaponType
 * @property {string} rarity
 * @property {string} pattern
 * @property {string} base
 * @property {string} accent
 * @property {string} detail
 * @property {keyof typeof FINISHES} baseMaterial
 * @property {keyof typeof FINISHES} accentMaterial
 * @property {number} glow  intensidade de emissão do detalhe (0 = nenhuma)
 * @property {[number, number]} floatRange
 * @property {string} description
 */

/** @type {SkinDef[]} */
export const SKINS = [
  // ───── Facas ─────
  {
    id: 'knife_crimson_circuit', name: 'Crimson Circuit', weaponType: 'knife', rarity: 'legendary', pattern: 'circuit',
    base: '#1a0d10', accent: '#d8183a', detail: '#ff5a6e', baseMaterial: 'anodized', accentMaterial: 'chrome', glow: 1.4,
    floatRange: [0, 0.8], description: 'Trilhas de cobre gravadas a laser e banhadas em vermelho. Em quinas gastas, a placa de base aparece por baixo.',
  },
  {
    id: 'knife_obsidian_pulse', name: 'Obsidian Pulse', weaponType: 'knife', rarity: 'mythic', pattern: 'pulse',
    base: '#07070b', accent: '#6c2bff', detail: '#c8a8ff', baseMaterial: 'ceramic', accentMaterial: 'anodized', glow: 0.9,
    floatRange: [0, 0.5], description: 'Vidro vulcânico com veios de energia violeta. O seed decide onde os pulsos se acumulam.',
  },
  {
    id: 'knife_neon_rupture', name: 'Neon Rupture', weaponType: 'knife', rarity: 'epic', pattern: 'rupture',
    base: '#101414', accent: '#22ff8a', detail: '#d6ffe9', baseMaterial: 'painted', accentMaterial: 'chrome', glow: 1.6,
    floatRange: [0, 1], description: 'Tinta craquelada com fissuras luminosas. Nenhuma lâmina racha do mesmo jeito.',
  },
  {
    id: 'knife_arctic_signal', name: 'Arctic Signal', weaponType: 'knife', rarity: 'rare', pattern: 'digital',
    base: '#e9f2f7', accent: '#7fb4d1', detail: '#2f4f66', baseMaterial: 'painted', accentMaterial: 'painted', glow: 0,
    floatRange: [0, 0.6], description: 'Camuflagem digital de neve e gelo. O branco denuncia cada arranhão.',
  },
  {
    id: 'knife_rust_protocol', name: 'Rust Protocol', weaponType: 'knife', rarity: 'uncommon', pattern: 'camo',
    base: '#5a2e17', accent: '#b4561f', detail: '#2a1a12', baseMaterial: 'painted', accentMaterial: 'satin', glow: 0,
    floatRange: [0.06, 1], description: 'Tons de oxidação sobre aço carbono. Já nasce com cara de veterana.',
  },
  {
    id: 'knife_factory_steel', name: 'Factory Steel', weaponType: 'knife', rarity: 'common', pattern: 'solid',
    base: '#8a9097', accent: '#3a3f45', detail: '#c9ced3', baseMaterial: 'satin', accentMaterial: 'polymer', glow: 0,
    floatRange: [0, 1], description: 'Acabamento de fábrica, sem firulas.',
  },
  // ───── Fuzis ─────
  {
    id: 'rifle_solar_grid', name: 'Solar Grid', weaponType: 'rifle', rarity: 'legendary', pattern: 'hex',
    base: '#2a1606', accent: '#ff9d1c', detail: '#ffe08a', baseMaterial: 'anodized', accentMaterial: 'chrome', glow: 0.8,
    floatRange: [0, 0.7], description: 'Células hexagonais douradas que lembram um painel solar em pleno meio-dia.',
  },
  {
    id: 'rifle_cyberstorm', name: 'Cyberstorm', weaponType: 'rifle', rarity: 'epic', pattern: 'stripes',
    base: '#0d1430', accent: '#00e5ff', detail: '#ff2bd6', baseMaterial: 'hydro', accentMaterial: 'anodized', glow: 0.5,
    floatRange: [0, 0.8], description: 'Faixas elétricas em ciano e magenta, como uma tempestade em um monitor quebrado.',
  },
  {
    id: 'rifle_urban_static', name: 'Urban Static', weaponType: 'rifle', rarity: 'uncommon', pattern: 'digital',
    base: '#5d636b', accent: '#9aa2ab', detail: '#272b30', baseMaterial: 'painted', accentMaterial: 'painted', glow: 0,
    floatRange: [0, 1], description: 'Camuflagem digital cinza-concreto para combate urbano.',
  },
  {
    id: 'rifle_void_runner', name: 'Void Runner', weaponType: 'rifle', rarity: 'mythic', pattern: 'fade',
    base: '#05060a', accent: '#6a2cff', detail: '#16f0c8', baseMaterial: 'anodized', accentMaterial: 'chrome', glow: 0.35,
    floatRange: [0, 0.4], description: 'Degradê do vazio ao turquesa. A posição do degradê muda com o seed do padrão.',
  },
  {
    id: 'rifle_copperline', name: 'Copperline', weaponType: 'rifle', rarity: 'rare', pattern: 'circuit',
    base: '#1d2326', accent: '#c87533', detail: '#ffc08a', baseMaterial: 'painted', accentMaterial: 'satin', glow: 0.25,
    floatRange: [0, 0.9], description: 'Trilhas de cobre expostas sobre polímero grafite.',
  },
  {
    id: 'rifle_basalt', name: 'Basalt', weaponType: 'rifle', rarity: 'common', pattern: 'solid',
    base: '#3b3f44', accent: '#1f2226', detail: '#6b7178', baseMaterial: 'polymer', accentMaterial: 'satin', glow: 0,
    floatRange: [0, 1], description: 'Cinza vulcânico fosco. Simples, discreto, eficiente.',
  },
  // ───── SMG ─────
  {
    id: 'smg_hornet_fade', name: 'Hornet Fade', weaponType: 'smg', rarity: 'rare', pattern: 'fade',
    base: '#0b0b0b', accent: '#ffcc00', detail: '#ff6a00', baseMaterial: 'anodized', accentMaterial: 'anodized', glow: 0,
    floatRange: [0, 0.6], description: 'Preto que esquenta até o amarelo-vespa.',
  },
  {
    id: 'smg_deadgrid', name: 'Deadgrid', weaponType: 'smg', rarity: 'uncommon', pattern: 'hex',
    base: '#1e2a22', accent: '#4c6b55', detail: '#9bd3a8', baseMaterial: 'painted', accentMaterial: 'painted', glow: 0,
    floatRange: [0, 1], description: 'Malha hexagonal verde-oliva.',
  },
  {
    id: 'smg_kelp', name: 'Kelp', weaponType: 'smg', rarity: 'common', pattern: 'camo',
    base: '#3d4a2a', accent: '#6b7a3a', detail: '#1f2618', baseMaterial: 'painted', accentMaterial: 'polymer', glow: 0,
    floatRange: [0, 1], description: 'Camuflagem orgânica em tons de alga.',
  },
  // ───── DMR ─────
  {
    id: 'dmr_glacier_line', name: 'Glacier Line', weaponType: 'dmr', rarity: 'epic', pattern: 'stripes',
    base: '#dfeef5', accent: '#5fb3d9', detail: '#1b3b52', baseMaterial: 'ceramic', accentMaterial: 'anodized', glow: 0,
    floatRange: [0, 0.75], description: 'Estrias de gelo em cerâmica polida.',
  },
  {
    id: 'dmr_ironbark', name: 'Ironbark', weaponType: 'dmr', rarity: 'uncommon', pattern: 'camo',
    base: '#4a3b2a', accent: '#7a6446', detail: '#211a12', baseMaterial: 'painted', accentMaterial: 'satin', glow: 0,
    floatRange: [0, 1], description: 'Casca de árvore e ferro batido.',
  },
  // ───── Pistolas ─────
  {
    id: 'pistol_ember_coil', name: 'Ember Coil', weaponType: 'pistol', rarity: 'rare', pattern: 'circuit',
    base: '#1a120e', accent: '#ff6a1f', detail: '#ffd0a1', baseMaterial: 'anodized', accentMaterial: 'chrome', glow: 0.9,
    floatRange: [0, 0.8], description: 'Bobinas incandescentes gravadas no ferrolho.',
  },
  {
    id: 'pistol_night_shift', name: 'Night Shift', weaponType: 'pistol', rarity: 'uncommon', pattern: 'solid',
    base: '#15181c', accent: '#2c333b', detail: '#5c6a77', baseMaterial: 'polymer', accentMaterial: 'anodized', glow: 0,
    floatRange: [0, 1], description: 'Preto operacional. Gasta bonito.',
  },
  {
    id: 'pistol_paper_tiger', name: 'Paper Tiger', weaponType: 'pistol', rarity: 'epic', pattern: 'tiger',
    base: '#f0e6d2', accent: '#e0582a', detail: '#1b1410', baseMaterial: 'hydro', accentMaterial: 'painted', glow: 0,
    floatRange: [0, 0.65], description: 'Listras de tigre em papel de arroz. Mais feroz do que parece.',
  },
  {
    id: 'pistol_coral_static', name: 'Coral Static', weaponType: 'pistol', rarity: 'common', pattern: 'digital',
    base: '#e7766a', accent: '#f4b3a6', detail: '#5b2a2a', baseMaterial: 'painted', accentMaterial: 'painted', glow: 0,
    floatRange: [0, 1], description: 'Pixels cor de coral.',
  },
  // ───── Pistola pesada ─────
  {
    id: 'heavy_molten_core', name: 'Molten Core', weaponType: 'heavy', rarity: 'legendary', pattern: 'rupture',
    base: '#140805', accent: '#ff4d0a', detail: '#ffd36b', baseMaterial: 'ceramic', accentMaterial: 'chrome', glow: 1.8,
    floatRange: [0, 0.7], description: 'Crosta de basalto com magma correndo pelas rachaduras.',
  },
  {
    id: 'heavy_sandstorm', name: 'Sandstorm', weaponType: 'heavy', rarity: 'uncommon', pattern: 'camo',
    base: '#b59a6a', accent: '#8a7048', detail: '#5a4630', baseMaterial: 'painted', accentMaterial: 'painted', glow: 0,
    floatRange: [0, 1], description: 'Areia de deserto em três tons.',
  },
];

/** Skin "de fábrica" de cada tipo — usada quando nada está equipado. */
export const STOCK_SKIN = {
  knife: 'knife_factory_steel',
  rifle: 'rifle_basalt',
  smg: 'smg_kelp',
  dmr: 'dmr_ironbark',
  pistol: 'pistol_night_shift',
  heavy: 'heavy_sandstorm',
};

/** @param {string} id @returns {SkinDef} */
export function skinById(id) {
  const s = SKINS.find((k) => k.id === id);
  if (!s) throw new Error(`Skin desconhecida: ${id}`);
  return s;
}

/** @param {string} type */
export function skinsForWeapon(type) {
  return SKINS.filter((s) => s.weaponType === type);
}
