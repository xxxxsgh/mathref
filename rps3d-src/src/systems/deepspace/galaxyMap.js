// Dados do MAPA GALÁCTICO (o HUD desenha; aqui só a informação):
// sistemas com posição (anos-luz), cor da estrela, facção, região, nebulosa,
// e rotas de salto (k vizinhos mais próximos dentro do alcance, sem repetir).
import { STAR_TYPES, FACTIONS } from '../../core/Universe.js';

let cache = null;

export function galaxyMap(galaxy, rangeLy = 70) {
  if (cache && cache.g === galaxy && cache.range === rangeLy) return cache.data;
  const sys = galaxy.systems.map((s) => ({
    id: s.id, name: s.name, pos: { ...s.pos }, starType: s.starType,
    starName: STAR_TYPES[s.starType]?.name || s.starType,
    color: STAR_TYPES[s.starType]?.color || [1, 1, 1],
    faction: s.faction, factionName: FACTIONS[s.faction]?.name || 'Nenhuma',
    security: s.security, region: s.region, nebula: s.nebula ? { color: s.nebula.color, color2: s.nebula.color2 } : null,
  }));
  const lanes = [];
  const seen = new Set();
  const K = 4;
  for (const a of sys) {
    const near = [];
    for (const b of sys) {
      if (a === b) continue;
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
      if (d <= rangeLy) near.push([d, b]);
    }
    near.sort((x, y) => x[0] - y[0]);
    for (const [d, b] of near.slice(0, K)) {
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lanes.push({ a: a.id, b: b.id, ly: d });
    }
  }
  const data = { systems: sys, lanes, center: { x: 0, y: 0, z: 0 }, radius: 600 };
  cache = { g: galaxy, range: rangeLy, data };
  return data;
}
