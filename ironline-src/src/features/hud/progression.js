/**
 * Progressão do jogador — LÓGICA PURA (sem DOM, sem three): curva de XP e
 * níveis, tabela de desbloqueios (armas, equipamento, acessórios e camuflagens)
 * e XP de fim de partida. Testada em `hud.test.mjs` (importado por
 * `tools/unit.test.mjs`).
 *
 * O perfil persistido (settings.js → localStorage, com try/catch) guarda só
 * números: `xp`, contadores de carreira, escolhas do loadout e a camuflagem.
 * Tudo o que é "desbloqueado" é DERIVADO do nível — nada de lista salva que
 * possa ficar inconsistente com o XP.
 */

export const MAX_LEVEL = 55;
const BASE = 2500; // XP do nível 1 → 2
const STEP = 220; // cada nível pede +220 XP a mais que o anterior

/** XP necessário para sair do nível `lv` (lv ≥ 1). */
export const needFor = (lv) => (lv <= 1 ? BASE : BASE + lv * STEP);

/** XP total acumulado para ATINGIR o nível `lv` (nível 1 = 0). */
export function xpForLevel(lv) {
  let acc = 0;
  for (let l = 1; l < Math.min(lv, MAX_LEVEL); l++) acc += needFor(l);
  return acc;
}

/**
 * Nível a partir do XP total: `{ level, into, need }` — `into` = XP dentro
 * do nível atual, `need` = XP para o próximo. No teto, `into` continua
 * crescendo e a barra fica cheia.
 */
export function levelOf(xp) {
  xp = Math.max(0, Math.floor(Number(xp) || 0));
  let lv = 1, acc = 0, need = needFor(1);
  while (xp >= acc + need && lv < MAX_LEVEL) {
    acc += need;
    lv++;
    need = needFor(lv);
  }
  return { level: lv, into: xp - acc, need };
}

/** XP por evento de partida (abates, objetivos). */
export const XP = {
  kill: 100, head: 50, long: 50, double: 50, triple: 100, streak5: 150, payback: 50, assist: 25, revenge: 50,
  // objetivos
  capture: 250, // tomar o ponto (hardpoint)
  holdTick: 25, // a cada HOLD_TICK s segurando o ponto
  waveClear: 150, // onda limpa
  bossKill: 1000, // abater o chefe (sobrevivência)
  win: 1500,
  loss: 300,
};
export const HOLD_TICK = 5;

/**
 * Camuflagens da arma primária (padrões procedurais; hud/camo.js os pinta).
 * `level` = nível em que libera.
 */
export const CAMOS = [
  { id: 'none', name: 'FACTORY FINISH', level: 1 },
  { id: 'woodland', name: 'WOODLAND', level: 2 },
  { id: 'digital', name: 'URBAN DIGITAL', level: 4 },
  { id: 'tiger', name: 'TIGER STRIPE', level: 6 },
  { id: 'arctic', name: 'ARCTIC', level: 9 },
  { id: 'ember', name: 'EMBER', level: 14 },
  { id: 'gilded', name: 'GILDED', level: 20 },
];

/** Acessórios do gunsmith (índice da opção → nível). Índice 0 sempre livre. */
export const ATTACHMENT_LEVELS = {
  optic: [1, 1, 8],
  muzzle: [1, 3, 11],
  grip: [1, 1, 5],
};

/** Equipamento que exige nível (o resto do loadout é livre). */
export const EQUIPMENT_LEVELS = { flash: 3 };

/**
 * Nível de cada arma do loadout publicado pela feature weapon
 * (`services.weapon.weapons`): as duas primeiras (fuzil e pistola) já vêm
 * no loadout; armas extras liberam a cada 4 níveis a partir do 7.
 */
export const weaponLevel = (w, i) => (i <= 1 ? 1 : 7 + (i - 2) * 4);

/**
 * Tabela completa de desbloqueios, ordenada por nível:
 * `[{ key, kind: 'weapon'|'equipment'|'attachment'|'camo', name, level, ref }]`.
 * `weapons` = `services.weapon.weapons` (ou [] — usa o loadout padrão).
 */
export function unlockTable(weapons = [], attNames = {}) {
  const out = [];
  const ws = weapons.length ? weapons : [{ id: 'kr9', name: 'KR-9' }, { id: 'p11', name: 'P-11' }];
  ws.forEach((w, i) => out.push({ key: `weapon:${w.id}`, kind: 'weapon', name: w.name, level: weaponLevel(w, i), ref: w.id }));
  out.push({ key: 'equipment:flash', kind: 'equipment', name: 'STUN GRENADE', level: EQUIPMENT_LEVELS.flash, ref: 'flash' });
  for (const [k, lv] of Object.entries(ATTACHMENT_LEVELS)) {
    lv.forEach((l, i) => {
      if (i === 0) return;
      out.push({ key: `att:${k}:${i}`, kind: 'attachment', name: attNames[k]?.[i] || `${k.toUpperCase()} ${i}`, level: l, ref: `${k}:${i}` });
    });
  }
  for (const c of CAMOS) if (c.level > 1) out.push({ key: `camo:${c.id}`, kind: 'camo', name: c.name + ' CAMO', level: c.level, ref: c.id });
  return out.sort((a, b) => a.level - b.level || a.key.localeCompare(b.key));
}

/** Liberado no nível `level`? (aceita a entrada da tabela ou um nível). */
export const isUnlocked = (entryOrLevel, level) => (typeof entryOrLevel === 'number' ? entryOrLevel : entryOrLevel?.level ?? 1) <= level;

/** Entradas liberadas ao subir de `before` para `after` (exclusivo/inclusivo). */
export const newUnlocks = (table, before, after) => table.filter((u) => u.level > before && u.level <= after);

/** Próximo desbloqueio acima do nível atual (ou null). */
export const nextUnlock = (table, level) => table.find((u) => u.level > level) || null;

export const camoLevel = (id) => CAMOS.find((c) => c.id === id)?.level ?? Infinity;
export const attachmentLevel = (k, i) => ATTACHMENT_LEVELS[k]?.[i] ?? 1;

/**
 * Corrige escolhas do loadout que o nível não permite (perfil antigo,
 * localStorage editado): volta para a opção 0 / camuflagem de fábrica.
 * Retorna um NOVO objeto.
 */
export function sanitizeLoadout(loadout = {}, camo = 'none', level = 1) {
  const L = { ...loadout };
  for (const k of Object.keys(ATTACHMENT_LEVELS)) if (attachmentLevel(k, L[k] ?? 0) > level) L[k] = 0;
  if (L.tactical && EQUIPMENT_LEVELS.flash > level) L.tactical = 0;
  return { loadout: L, camo: camoLevel(camo) <= level ? camo : 'none' };
}

/**
 * XP de fim de partida: soma o que a partida já acumulou (abates, medalhas,
 * objetivos) + bônus de resultado. Retorna `{ lines, total, bonus }`.
 */
export function matchXP({ kills = 0, headshots = 0, medalXP = 0, objectiveXP = 0, earned = null, win = false } = {}) {
  const bonus = win ? XP.win : XP.loss;
  const lines = [
    ['KILLS', kills * XP.kill],
    ['HEADSHOTS', headshots * XP.head],
    ['MEDALS', medalXP],
    ['OBJECTIVES', objectiveXP],
    [win ? 'WIN BONUS' : 'MATCH BONUS', bonus],
  ];
  const base = earned ?? kills * XP.kill + headshots * XP.head + medalXP + objectiveXP;
  return { lines, total: base + bonus, bonus };
}
