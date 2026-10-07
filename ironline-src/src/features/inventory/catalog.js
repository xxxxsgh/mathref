/**
 * Catálogo do inventário (dados puros, sem DOM): raridades, desgaste,
 * armas-base, facas, caixas e seus conjuntos de itens, chaveiros, adesivos,
 * cartões de chamada, emblemas, maestria e o passe de campanha.
 *
 * A feature weapon é dona de RENDERIZAR; aqui só descrevemos as skins no
 * formato do contrato v3: { id, name, pattern, palette, wear, seed, finish, rarity }.
 *
 * Política: caixas só se abrem com CHAVES ou CRÉDITOS ganhos jogando.
 * Não existe compra com dinheiro real em lugar nenhum do jogo.
 */

// ─── raridades ─────────────────────────────────────────────────────────
/** Ordem crescente. `odds` = chance padrão por abertura (soma 1). `scrap` = créditos base ao sucatear. */
export const RARITIES = [
  { id: 'comum', name: 'COMUM', color: '#a7b1bc', odds: 0.6, scrap: 8 },
  { id: 'incomum', name: 'INCOMUM', color: '#4f9be3', odds: 0.25, scrap: 25 },
  { id: 'raro', name: 'RARO', color: '#8a66f4', odds: 0.1, scrap: 80 },
  { id: 'epico', name: 'ÉPICO', color: '#d653cf', odds: 0.03, scrap: 260 },
  { id: 'lendario', name: 'LENDÁRIO', color: '#ea5a40', odds: 0.012, scrap: 900 },
  { id: 'especial', name: 'ESPECIAL', color: '#e9bd52', odds: 0.008, scrap: 2400 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, rank: i }]));
export const rarityRank = (id) => RARITY[id]?.rank ?? 0;
export const nextRarity = (id) => RARITIES[rarityRank(id) + 1]?.id || null;

// ─── desgaste ──────────────────────────────────────────────────────────
/** Faixas semiabertas [min, max); a última inclui 1. */
export const WEAR_TIERS = [
  { id: 'NF', name: 'NOVA DE FÁBRICA', min: 0, max: 0.07, color: '#7fe3bd', scrap: 1.3 },
  { id: 'PU', name: 'POUCO USADA', min: 0.07, max: 0.15, color: '#a9df70', scrap: 1.15 },
  { id: 'TC', name: 'TESTADA EM CAMPO', min: 0.15, max: 0.38, color: '#ead25e', scrap: 1 },
  { id: 'DG', name: 'DESGASTADA', min: 0.38, max: 0.45, color: '#ec9a4e', scrap: 0.9 },
  { id: 'MD', name: 'MUITO DESGASTADA', min: 0.45, max: 1, color: '#e8645c', scrap: 0.8 },
];
export function wearTier(f) {
  const v = Math.min(1, Math.max(0, Number(f) || 0));
  for (const t of WEAR_TIERS) if (v < t.max) return t;
  return WEAR_TIERS[WEAR_TIERS.length - 1];
}
/** 0.0712345 → "0.0712345" (7 casas: identidade do item) */
export const formatWear = (f) => (Number(f) || 0).toFixed(7);
export const SEED_MAX = 999;

// ─── armas-base ────────────────────────────────────────────────────────
/**
 * Chaves de arma usadas pelo catálogo. Em jogo, cada chave é resolvida para
 * o id real de `services.weapon.weapons` (por id e, na falta, por `kind`).
 */
export const BASES = {
  kr9: { name: 'KR-9', kind: 'rifle', slot: 'primary' },
  p11: { name: 'P-11', kind: 'pistol', slot: 'secondary' },
  smg: { name: 'SMG', kind: 'smg', slot: 'primary' },
  shotgun: { name: 'ESCOPETA', kind: 'shotgun', slot: 'primary' },
  sniper: { name: 'SNIPER', kind: 'sniper', slot: 'primary' },
  lmg: { name: 'LMG', kind: 'lmg', slot: 'primary' },
  dmr: { name: 'DMR', kind: 'dmr', slot: 'primary' },
};
export const BASE_IDS = Object.keys(BASES);

/** Modelos de faca (resolvidos para `services.weapon.knives` por id; na falta, por índice). */
export const KNIFE_MODELS = {
  tk7: { name: 'TK-7' },
  garra: { name: 'GARRA' },
  borboleta: { name: 'BORBOLETA' },
  cacadora: { name: 'CAÇADORA' },
  baioneta: { name: 'BAIONETA' },
};
export const KNIFE_IDS = Object.keys(KNIFE_MODELS);

// acabamentos (finish do contrato)
const MATTE = { metalness: 0.25, roughness: 0.7 };
const SATIN = { metalness: 0.55, roughness: 0.45 };
const GLOSS = { metalness: 0.85, roughness: 0.22 };
const CHROME = { metalness: 1, roughness: 0.12 };

// ─── caixas ────────────────────────────────────────────────────────────
/**
 * Cada skin: [id, nome, base, padrão, paleta, raridade, acabamento, [wearMin, wearMax]].
 * Facas: [id, nome, modelo, padrão, paleta, acabamento, [wearMin, wearMax]] (raridade ESPECIAL).
 */
const CASE_DATA = [
  {
    id: 'ferro', n: 1, name: 'OPERAÇÃO FERRO', tag: 'AÇO, OCRE E OFICINA', color: '#e2b45a', color2: '#5a5f66', price: 300,
    skins: [
      ['ferro-cinza', 'CINZA URBANO', 'kr9', 'solid', ['#5d6266', '#3a3e42', '#8a8f94'], 'comum', MATTE, [0, 0.8]],
      ['ferro-areia', 'AREIA', 'p11', 'camo', ['#b39b72', '#8a7550', '#5e4f36'], 'comum', MATTE, [0, 0.8]],
      ['ferro-estencil', 'ESTÊNCIL', 'smg', 'digital', ['#6d7469', '#4b5047', '#2f332d'], 'comum', MATTE, [0, 0.8]],
      ['ferro-oliva', 'OLIVA', 'shotgun', 'solid', ['#59613f', '#3c4229', '#7b845a'], 'comum', MATTE, [0, 0.8]],
      ['ferro-ferrugem', 'FERRUGEM', 'dmr', 'oxide', ['#8a4a26', '#5a3a2a', '#c47a3c'], 'incomum', MATTE, [0.1, 1]],
      ['ferro-trama', 'TRAMA', 'lmg', 'carbon', ['#2a2c2f', '#121314', '#4a4e53'], 'incomum', SATIN, [0, 0.5]],
      ['ferro-colmeia', 'COLMEIA', 'p11', 'hex', ['#3a4048', '#d9a640', '#1d2126'], 'incomum', SATIN, [0, 0.6]],
      ['ferro-tigre', 'TIGRE DE AÇO', 'kr9', 'tiger', ['#c8862e', '#1a1a1a', '#e9c27a'], 'raro', SATIN, [0, 0.6]],
      ['ferro-geada', 'GEADA', 'sniper', 'marble', ['#dfe7ee', '#8ea4b8', '#40556b'], 'raro', GLOSS, [0, 0.5]],
      ['ferro-respingo', 'RESPINGO', 'smg', 'splatter', ['#1c1e21', '#e2b45a', '#d9483d'], 'raro', SATIN, [0, 0.7]],
      ['ferro-forja', 'FORJA', 'kr9', 'damascus', ['#8d939a', '#4a4f55', '#c9ccd0'], 'epico', GLOSS, [0, 0.45]],
      ['ferro-brasaviva', 'BRASA VIVA', 'shotgun', 'ember', ['#1a0e08', '#ff6a1f', '#ffcf5a'], 'epico', SATIN, [0, 0.5]],
      ['ferro-aurora', 'AURORA DE FERRO', 'kr9', 'fade', ['#ffcf5a', '#e8553f', '#7a3cff'], 'lendario', GLOSS, [0, 0.08]],
    ],
    knives: [
      ['ferro-k-fio', 'FIO DOURADO', 'tk7', 'fade', ['#ffe08a', '#e2a23a', '#7a4a12'], CHROME, [0, 0.08]],
      ['ferro-k-damasco', 'DAMASCO', 'tk7', 'damascus', ['#9aa1a8', '#3c4248', '#d8dbde'], GLOSS, [0, 0.5]],
      ['ferro-g-tigre', 'TIGRE', 'garra', 'tiger', ['#e0952e', '#151515', '#f2c77a'], SATIN, [0, 0.6]],
      ['ferro-g-noite', 'NOITE', 'garra', 'solid', ['#141619', '#24282d', '#3a3f45'], MATTE, [0, 0.8]],
      ['ferro-b-marmore', 'MÁRMORE', 'borboleta', 'marble', ['#f2f2ee', '#9aa3ab', '#3a4048'], GLOSS, [0, 0.08]],
      ['ferro-b-brasa', 'BRASA', 'borboleta', 'ember', ['#160b06', '#ff5a14', '#ffd36a'], SATIN, [0, 0.5]],
    ],
  },
  {
    id: 'mare', n: 2, name: 'MARÉ NEGRA', tag: 'COSTA, ÓLEO E TEMPESTADE', color: '#4fb6c8', color2: '#1d3a4a', price: 300,
    skins: [
      ['mare-ardosia', 'ARDÓSIA', 'p11', 'solid', ['#3d4a55', '#28323a', '#5a6874'], 'comum', MATTE, [0, 0.8]],
      ['mare-nevoa', 'NÉVOA', 'kr9', 'camo', ['#7d8c94', '#5c6a72', '#3c474e'], 'comum', MATTE, [0, 0.8]],
      ['mare-cais', 'CAIS', 'lmg', 'digital', ['#41545e', '#2a3840', '#617680'], 'comum', MATTE, [0, 0.8]],
      ['mare-salmoura', 'SALMOURA', 'dmr', 'oxide', ['#5d6b63', '#3b4640', '#8a9a7a'], 'comum', MATTE, [0.1, 1]],
      ['mare-onda', 'ONDA', 'smg', 'damascus', ['#2f6f86', '#163444', '#7cc6d6'], 'incomum', SATIN, [0, 0.6]],
      ['mare-coral', 'CORAL', 'shotgun', 'splatter', ['#1b2a33', '#ef7a62', '#f2d0a0'], 'incomum', SATIN, [0, 0.7]],
      ['mare-escama', 'ESCAMA', 'sniper', 'hex', ['#123240', '#3fb0c6', '#0a1a22'], 'incomum', SATIN, [0, 0.6]],
      ['mare-abissal', 'ABISSAL', 'kr9', 'marble', ['#0b1f2c', '#2a7f9e', '#9fe3f0'], 'raro', GLOSS, [0, 0.5]],
      ['mare-tempestade', 'TEMPESTADE', 'p11', 'tiger', ['#5a6f7c', '#101820', '#c2d6e0'], 'raro', SATIN, [0, 0.6]],
      ['mare-petroleo', 'PETRÓLEO', 'lmg', 'fade', ['#2a1a4a', '#0f5e6e', '#56c6a0'], 'raro', GLOSS, [0, 0.3]],
      ['mare-kraken', 'KRAKEN', 'sniper', 'damascus', ['#0c3a4a', '#05141b', '#4fd0e0'], 'epico', GLOSS, [0, 0.4]],
      ['mare-relampago', 'RELÂMPAGO', 'smg', 'ember', ['#081420', '#38c8ff', '#e8f8ff'], 'epico', SATIN, [0, 0.5]],
      ['mare-leviata', 'LEVIATÃ', 'sniper', 'fade', ['#5ff2e0', '#2a6cff', '#14123a'], 'lendario', GLOSS, [0, 0.08]],
    ],
    knives: [
      ['mare-c-oceano', 'OCEANO', 'cacadora', 'fade', ['#6ff0e8', '#2a74ff', '#18124a'], CHROME, [0, 0.08]],
      ['mare-c-salgema', 'SAL-GEMA', 'cacadora', 'marble', ['#e8f2f4', '#7ab4c4', '#2a4a58'], GLOSS, [0, 0.5]],
      ['mare-z-escama', 'ESCAMA', 'baioneta', 'hex', ['#0e2a36', '#45c0d6', '#081218'], SATIN, [0, 0.6]],
      ['mare-z-cinza', 'CINZA-AZUL', 'baioneta', 'solid', ['#4a5a66', '#2c3740', '#6c7e8a'], MATTE, [0, 0.8]],
      ['mare-t-onda', 'ONDA', 'tk7', 'damascus', ['#2e6a80', '#0f2a36', '#8fd2e0'], GLOSS, [0, 0.5]],
      ['mare-t-tinta', 'TINTA', 'tk7', 'splatter', ['#0d1418', '#2fb2d0', '#f2f6f8'], SATIN, [0, 0.7]],
    ],
  },
  {
    id: 'cinzas', n: 3, name: 'FOGO CRUZADO', tag: 'BRASA, CINZA E PÓLVORA', color: '#ea5a40', color2: '#3a1612', price: 300,
    skins: [
      ['cinzas-po', 'PÓLVORA', 'smg', 'solid', ['#3a3532', '#26221f', '#57504b'], 'comum', MATTE, [0, 0.8]],
      ['cinzas-tijolo', 'TIJOLO', 'p11', 'digital', ['#7a3e2c', '#4e281c', '#a2614a'], 'comum', MATTE, [0, 0.8]],
      ['cinzas-carvao', 'CARVÃO', 'sniper', 'carbon', ['#1e1e1e', '#0e0e0e', '#3a3a3a'], 'comum', MATTE, [0, 0.8]],
      ['cinzas-deserto', 'DESERTO', 'lmg', 'camo', ['#c49a64', '#9a7444', '#6a4e2c'], 'comum', MATTE, [0, 0.8]],
      ['cinzas-fuligem', 'FULIGEM', 'kr9', 'oxide', ['#2c2622', '#5a3020', '#8a4a2a'], 'incomum', MATTE, [0.1, 1]],
      ['cinzas-alvo', 'ALVO', 'dmr', 'hex', ['#2a1210', '#e8553f', '#140808'], 'incomum', SATIN, [0, 0.6]],
      ['cinzas-faisca', 'FAÍSCA', 'shotgun', 'splatter', ['#191514', '#ffb02e', '#ff5a3d'], 'incomum', SATIN, [0, 0.7]],
      ['cinzas-magma', 'MAGMA', 'p11', 'ember', ['#120806', '#ff4a10', '#ffc04a'], 'raro', SATIN, [0, 0.5]],
      ['cinzas-tigrevermelho', 'TIGRE VERMELHO', 'smg', 'tiger', ['#b3261e', '#141010', '#f2735a'], 'raro', SATIN, [0, 0.6]],
      ['cinzas-obsidiana', 'OBSIDIANA', 'dmr', 'marble', ['#0e0c10', '#4a2a3a', '#c86a5a'], 'raro', GLOSS, [0, 0.4]],
      ['cinzas-fornalha', 'FORNALHA', 'lmg', 'damascus', ['#6a2a14', '#1a0a06', '#ff9a4a'], 'epico', GLOSS, [0, 0.45]],
      ['cinzas-crepusculo', 'CREPÚSCULO', 'kr9', 'fade', ['#ff9a3a', '#d6304a', '#3a1a5a'], 'epico', GLOSS, [0, 0.2]],
      ['cinzas-fenix', 'FÊNIX', 'p11', 'fade', ['#ffe27a', '#ff6a1a', '#b0122a'], 'lendario', GLOSS, [0, 0.08]],
    ],
    knives: [
      ['cinzas-g-fenix', 'FÊNIX', 'garra', 'fade', ['#ffe27a', '#ff5a1a', '#a0102a'], CHROME, [0, 0.08]],
      ['cinzas-g-carvao', 'CARVÃO', 'garra', 'carbon', ['#1c1c1c', '#0a0a0a', '#3c3c3c'], MATTE, [0, 0.8]],
      ['cinzas-c-magma', 'MAGMA', 'cacadora', 'ember', ['#140806', '#ff4a10', '#ffd06a'], SATIN, [0, 0.5]],
      ['cinzas-c-ferrugem', 'FERRUGEM', 'cacadora', 'oxide', ['#7a3a1c', '#3a2418', '#c06a32'], MATTE, [0.1, 1]],
      ['cinzas-z-sangue', 'RUBRO', 'baioneta', 'solid', ['#8a1a16', '#4a0c0a', '#c23a2c'], GLOSS, [0, 0.5]],
      ['cinzas-z-tigre', 'TIGRE', 'baioneta', 'tiger', ['#d07a2a', '#121010', '#f0b870'], SATIN, [0, 0.6]],
    ],
  },
];

/** Definições de item indexadas por id. */
export const DEFS = {};
export const CASES = CASE_DATA.map((c) => {
  const skins = c.skins.map(([id, name, base, pattern, palette, rarity, finish, wr]) => (DEFS[id] = { id, type: 'skin', name, base, pattern, palette, rarity, finish, wear: wr, case: c.id }));
  const knives = c.knives.map(([id, name, model, pattern, palette, finish, wr]) => (DEFS[id] = { id, type: 'knife', name, base: model, pattern, palette, rarity: 'especial', finish, wear: wr, case: c.id }));
  return { id: c.id, n: c.n, name: c.name, tag: c.tag, color: c.color, color2: c.color2, price: c.price, odds: Object.fromEntries(RARITIES.map((r) => [r.id, r.odds])), skins: skins.map((d) => d.id), knives: knives.map((d) => d.id) };
});
export const caseById = (id) => CASES.find((c) => c.id === id || String(c.n) === String(id)) || null;
/** Itens de uma raridade numa caixa (facas = 'especial'). */
export const casePool = (c, rarity) => (rarity === 'especial' ? c.knives : c.skins.filter((id) => DEFS[id].rarity === rarity));

// ─── chaveiros e adesivos ──────────────────────────────────────────────
const CHARM_DATA = [
  ['ch-caveira', 'CAVEIRA', 'skull', '#e8e2d0', 'incomum'],
  ['ch-dado', 'DADO', 'dice', '#d9483d', 'comum'],
  ['ch-estrela', 'ESTRELA', 'star', '#e2b45a', 'raro'],
  ['ch-cartucho', 'CARTUCHO', 'bullet', '#c8a050', 'comum'],
  ['ch-diamante', 'DIAMANTE', 'diamond', '#7fd6f0', 'epico'],
  ['ch-cubo', 'CUBO', 'cube', '#8a66f4', 'incomum'],
  ['ch-anel', 'ANEL', 'ring', '#c9ccd0', 'comum'],
  ['ch-placa', 'PLACA', 'tag', '#9aa36a', 'raro'],
];
for (const [id, name, shape, color, rarity] of CHARM_DATA) DEFS[id] = { id, type: 'charm', name, shape, color, rarity };
export const CHARMS = CHARM_DATA.map((d) => d[0]);

const STICKER_DATA = [
  ['st-estrela', 'ESTRELA', 'star', '#e2b45a', 'comum'],
  ['st-caveira', 'CAVEIRA', 'skull', '#f2f4ef', 'incomum'],
  ['st-raio', 'RAIO', 'bolt', '#ffd23a', 'comum'],
  ['st-alvo', 'ALVO', 'target', '#d9483d', 'comum'],
  ['st-lobo', 'LOBO', 'wolf', '#9aa7b4', 'raro'],
  ['st-coroa', 'COROA', 'crown', '#e9bd52', 'epico'],
  ['st-chama', 'CHAMA', 'flame', '#ff6a1f', 'incomum'],
  ['st-onda', 'ONDA', 'wave', '#4fb6c8', 'incomum'],
  ['st-olho', 'OLHO', 'eye', '#8a66f4', 'raro'],
  ['st-asa', 'ASA', 'wing', '#c9ccd0', 'incomum'],
  ['st-copas', 'COPAS', 'heart', '#e8645c', 'comum'],
  ['st-hex', 'HEX', 'hex', '#7fe3bd', 'comum'],
];
for (const [id, name, glyph, color, rarity] of STICKER_DATA) DEFS[id] = { id, type: 'sticker', name, glyph, color, rarity };
export const STICKERS = STICKER_DATA.map((d) => d[0]);

// ─── maestria (camuflagens por abates com cada arma) ───────────────────
export const MASTERY_TIERS = [
  { id: 'bronze', name: 'BRONZE', kills: 25, rarity: 'incomum', pattern: 'solid', palette: ['#b0773f', '#6e4422', '#e0a46a'], finish: GLOSS },
  { id: 'prata', name: 'PRATA', kills: 75, rarity: 'raro', pattern: 'solid', palette: ['#c9d0d6', '#7d868e', '#f2f6f8'], finish: CHROME },
  { id: 'ouro', name: 'OURO', kills: 150, rarity: 'epico', pattern: 'fade', palette: ['#fff1b0', '#e2a23a', '#8a5208'], finish: CHROME },
  { id: 'obsidiana', name: 'OBSIDIANA', kills: 300, rarity: 'lendario', pattern: 'marble', palette: ['#0a0a10', '#3a2a5a', '#b48aff'], finish: GLOSS },
];
for (const b of BASE_IDS) {
  for (const t of MASTERY_TIERS) {
    const id = `m-${b}-${t.id}`;
    DEFS[id] = { id, type: 'skin', name: 'MAESTRIA ' + t.name, base: b, pattern: t.pattern, palette: t.palette, rarity: t.rarity, finish: t.finish, wear: [0, 0], mastery: t.id };
  }
}
export const masteryDef = (base, tier) => DEFS[`m-${base}-${tier}`];

// ─── cartões de chamada e emblemas (arte procedural da hud) ────────────
export const CARDS = [
  { id: 'cc-alvorada', name: 'ALVORADA DE FERRO', theme: 0, seed: 3, def: true },
  { id: 'cc-artico', name: 'NOITE ÁRTICA', theme: 1, seed: 9, def: true },
  { id: 'cc-incendio', name: 'INCÊNDIO', theme: 2, seed: 14, def: true },
  { id: 'cc-selva', name: 'SELVA', theme: 3, seed: 21 },
  { id: 'cc-vigia', name: 'VIGIA', theme: 0, seed: 33 },
  { id: 'cc-abismo', name: 'ABISMO', theme: 1, seed: 41 },
  { id: 'cc-fornalha', name: 'FORNALHA', theme: 2, seed: 57 },
  { id: 'cc-trincheira', name: 'TRINCHEIRA', theme: 3, seed: 63 },
  { id: 'cc-veterano', name: 'VETERANO', theme: 0, seed: 77 },
  { id: 'cc-tempestade', name: 'TEMPESTADE', theme: 1, seed: 85 },
  { id: 'cc-colecionador', name: 'COLECIONADOR', theme: 2, seed: 99 },
  { id: 'cc-lenda', name: 'LENDA', theme: 3, seed: 111 },
];
export const EMBLEMS = [
  { id: 'em-vance', name: 'VANGUARDA', seed: 'vance', tone: 'gold', def: true },
  { id: 'em-aco', name: 'AÇO', seed: 'aco', tone: 'steel', def: true },
  { id: 'em-rubro', name: 'RUBRO', seed: 'rubro', tone: 'red', def: true },
  { id: 'em-lobo', name: 'LOBO', seed: 'lobo1', tone: 'steel' },
  { id: 'em-aguia', name: 'ÁGUIA', seed: 'aguia3', tone: 'gold' },
  { id: 'em-punhal', name: 'PUNHAL', seed: 'punhal2', tone: 'red' },
  { id: 'em-caveira', name: 'CAVEIRA', seed: 'cav4', tone: 'steel' },
  { id: 'em-coroa', name: 'COROA', seed: 'coroa7', tone: 'gold' },
  { id: 'em-brasa', name: 'BRASA', seed: 'brasa8', tone: 'red' },
  { id: 'em-mestre', name: 'MESTRE', seed: 'mestre9', tone: 'gold' },
  { id: 'em-sentinela', name: 'SENTINELA', seed: 'sent11', tone: 'steel' },
  { id: 'em-fenix', name: 'FÊNIX', seed: 'fenix12', tone: 'red' },
];

// ─── recompensa diária (ciclo de 7 dias) ───────────────────────────────
export const DAILY = [
  { credits: 150 },
  { credits: 200 },
  { keys: 1 },
  { credits: 300 },
  { credits: 400, item: 'sticker' },
  { credits: 200, keys: 1 },
  { keys: 2, item: 'charm' },
];

// ─── passe de campanha (SÓ trilha gratuita; não existe trilha paga) ────
export const BP_TIERS = 30;
/** Recompensa de cada nível (1..30). */
export const BP_REWARDS = Array.from({ length: BP_TIERS }, (_, i) => {
  const t = i + 1;
  if (t === BP_TIERS) return { knife: true };
  if (t % 10 === 0) return { skin: t === 10 ? 'raro' : 'epico' };
  if (t % 5 === 0) return { keys: 2 };
  if (t % 6 === 0) return { card: CARDS[3 + ((t / 6) % 9)].id };
  if (t % 4 === 0) return { emblem: EMBLEMS[3 + ((t / 4) % 9)].id };
  if (t % 3 === 0) return { item: t % 2 ? 'sticker' : 'charm' };
  if (t % 7 === 0) return { keys: 1 };
  return { credits: 100 + t * 10 };
});

/** Preço em créditos de abrir uma caixa sem chave (moeda do jogo). */
export const KEY_PRICE = 300;
