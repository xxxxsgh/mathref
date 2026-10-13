// Catálogo de descobertas do scanner: espécies de fauna e flora registradas
// (com o nome dado pelo jogador), valor em créditos e data. Salvo em
// ctx.save ('life'). `catalog()` também é chamável (a HUD lista as entradas).
import { speciesById } from './species.js';

export function createCatalog(ctx) {
  const entries = [];
  const byId = new Map();

  function bodyName(id) { const b = ctx.universe.system?.body?.(id); return b?.name || id; }
  function stamp() {
    // data do jogo: ano 2387, dia pelo tempo de universo
    const d = Math.floor((ctx.time.world || 0) / 86400) + 112;
    return `2387.${String(d).padStart(3, '0')}`;
  }
  function award(value, name) {
    const eco = ctx.services.economy;
    let ok = false;
    try {
      if (eco?.addCredits) { eco.addCredits(value, 'descoberta'); ok = true; }
      else if (eco?.credit) { eco.credit(value, 'descoberta'); ok = true; }
    } catch { /* */ }
    if (!ok) catalog.unpaid += value;
    ctx.bus.emit('notify', { text: `NOVA ESPÉCIE · ${name}`, kind: 'reward', sub: `+${value} créditos de descoberta` });
  }

  /** Registra uma espécie (objeto de espécie ou id). Retorna a entrada (nova ou existente). */
  function discover(spOrId, opts = {}) {
    const sp = typeof spOrId === 'string' ? speciesById(ctx.universe.system, spOrId) : spOrId;
    if (!sp) return null;
    let e = byId.get(sp.id);
    if (e) return e;
    e = {
      id: sp.id, kind: sp.kind, name: sp.name, originalName: sp.originalName || sp.name, latin: sp.latin,
      body: sp.bodyId, bodyName: bodyName(sp.bodyId), desc: sp.desc, value: sp.value, date: stamp(), sold: false, renamed: false,
      role: sp.role || sp.tier, hazard: sp.hazard || null,
    };
    entries.push(e); byId.set(e.id, e);
    if (!opts.silent) {
      award(e.value, e.name);
      ctx.bus.emit('scan:discover', { kind: sp.kind, id: sp.id, name: e.name, body: sp.bodyId, value: e.value });
      try { ctx.save.write?.(); } catch { /* */ }
    }
    return e;
  }

  /** Renomeia (o nome vale para o catálogo e para os marcadores do scanner). */
  function rename(id, name) {
    const e = byId.get(id);
    const clean = String(name || '').replace(/[<>]/g, '').trim().slice(0, 40);
    if (!e || !clean) return false;
    e.name = clean; e.renamed = clean !== e.originalName;
    const sp = speciesById(ctx.universe.system, id);
    if (sp) sp.name = clean;
    ctx.bus.emit('life:rename', { id, name: clean });
    try { ctx.save.write?.(); } catch { /* */ }
    return true;
  }

  /** Marca como vendido (a economia pode chamar ao vender dados de descoberta). */
  function sell(id) { const e = byId.get(id); if (!e || e.sold) return 0; e.sold = true; return e.value; }

  const catalog = () => entries;
  catalog.discover = discover;
  catalog.rename = rename;
  catalog.sell = sell;
  catalog.has = (id) => byId.has(id);
  catalog.get = (id) => byId.get(id) || null;
  catalog.unpaid = 0;
  Object.defineProperty(catalog, 'entries', { get: () => entries });
  catalog.serialize = () => ({ entries: entries.map((e) => ({ ...e })), unpaid: catalog.unpaid });
  catalog.deserialize = (d) => {
    entries.length = 0; byId.clear();
    for (const e of d?.entries || []) { entries.push(e); byId.set(e.id, e); }
    catalog.unpaid = d?.unpaid || 0;
    // reaplica nomes dados pelo jogador
    for (const e of entries) if (e.renamed) { const sp = speciesById(ctx.universe.system, e.id); if (sp) sp.name = e.name; }
  };
  catalog.reset = () => { entries.length = 0; byId.clear(); catalog.unpaid = 0; };
  catalog.applyNames = () => { for (const e of entries) if (e.renamed) { const sp = speciesById(ctx.universe.system, e.id); if (sp) sp.name = e.name; } };
  return catalog;
}
