// Sistema `stations` — estações espaciais e estruturas do RPS3D.
//
//  • exteriores procedurais PBR (Estação Meridiana da Guilda com anel
//    girando e disco de atracação, Plataforma Tharsos no gigante gasoso,
//    Refúgio Cinza escavado num asteroide, postos da Hegemonia, estações
//    genéricas), montados sob demanda quando a câmera se aproxima
//  • tráfego de naves NPC entrando e saindo dos hangares
//  • pouso guiado: pedido → controle de tráfego por rádio → hangar
//    atribuído → corredor holográfico → piloto automático numa âncora móvel
//  • interior andável (hangar, corredores, bar, mercado, oficina, quadro de
//    missões) com colisores, luz assada + luzes próprias, NPCs com rotinas e
//    terminais interativos que abrem os painéis da HUD
//  • estruturas de superfície (postos avançados, naves caídas, bunkers,
//    ruínas dos Arquitetos com quebra-cabeça de luz e portas antigas)
//
// Serviço ctx.services.stations:
//   list() → [{id, name, kind, arch, faction, pos, body, hidden, bays}]
//   nearest(worldPos) → {station, dist, view} | null
//   requestDock(id|station) → alvo de atracação | null  (pede ao `flight` quando existe)
//   dockingPad(station, opts) → alvo do piloto automático (usado pelo `flight`)
//   interiorOf(id) → interior andável | null  { frame, up, spawnWorld(), rooms, terminals, bounds, active }
//   structuresOn(bodyId) → [{id, kind, name, local, dir, faction}]  (referencial local do planeta)
//   viewOf(id), get docking
//
// Escuta: system:change, dock:complete, undock, player:exitShip,
// player:enterShip, mode:change. Emite: radio, dock:granted, npc:talk, notify.
import * as THREE from 'three/webgpu';
import { StationView } from './station.js';
import { Docking } from './docking.js';
import { Traffic } from './traffic.js';
import { Interior } from './interior.js';
import { Surface } from './surface.js';
import { FootFallback } from './walker.js';
import { registerShots } from './shots.js';

const S = {
  ctx: null, views: new Map(), sysId: null, docking: null, traffic: null,
  interiors: new Map(), activeInterior: null, surface: null, walker: null, shotCam: null,
};

function buildSystem(ctx, sys) {
  for (const v of S.views.values()) v.dispose();
  S.views.clear();
  for (const i of S.interiors.values()) i.dispose();
  S.interiors.clear();
  S.activeInterior = null;
  S.docking?.release();
  S.traffic?.clear();
  S.sysId = sys?.id ?? null;
  if (!sys) return;
  for (const st of sys.stations) {
    try { S.views.set(st.id, new StationView(ctx, st, sys)); }
    catch (e) { ctx.errors.push(`stations: ${st.name}: ${e.stack || e}`); }
  }
  S.surface?.setSystem(sys);
}

function viewOf(id) {
  if (!id) return null;
  if (typeof id === 'object') id = id.id;
  return S.views.get(id) || null;
}

/** Interior andável da estação (montado sob demanda). */
function interiorOf(id) {
  const v = viewOf(id);
  if (!v || !(v.arch === 'meridiana')) return null;
  if (!S.interiors.has(v.st.id)) {
    const it = new Interior(S.ctx, v);
    S.interiors.set(v.st.id, it);
  }
  return S.interiors.get(v.st.id);
}

const api = {
  list() {
    return [...S.views.values()].map((v) => ({ id: v.st.id, name: v.st.name, kind: v.st.kind, arch: v.arch, faction: v.st.faction, pos: v.frame.pos, body: v.st.body, hidden: !!v.st.hidden, bays: v.bays.map((b) => ({ number: b.number, kind: b.kind, occupied: !!b.occupied })) }));
  },
  nearest(worldPos) {
    let best = null, bd = Infinity;
    for (const v of S.views.values()) { const d = worldPos.distanceTo(v.frame.pos); if (d < bd) { bd = d; best = v; } }
    return best ? { station: best.st, dist: bd, view: best } : null;
  },
  /** Pede atracação: com `flight`, ele voa; sem, apenas autoriza (o rádio responde). */
  requestDock(id) {
    const v = viewOf(id) || (typeof id === 'object' ? viewOf(id?.id) : null);
    if (!v) return null;
    const fl = S.ctx.services.flight;
    if (fl?.dockAt && S.ctx.player.ship && !S.inPad) {
      try { if (fl.dockAt(v.st)) return S.docking.state === 'granted' ? S.docking.target() : null; } catch (e) { S.ctx.errors.push('stations: flight.dockAt: ' + (e.stack || e)); }
    }
    return S.docking.grant(v);
  },
  /** Chamado pelo `flight` (padFor) ao atracar. */
  dockingPad(station) {
    const v = viewOf(station);
    if (!v) return null;
    S.inPad = true;
    try { return S.docking.grant(v); } finally { S.inPad = false; }
  },
  interiorOf,
  structuresOn(bodyId) { return S.surface ? S.surface.on(bodyId) : []; },
  viewOf,
  get docking() { return S.docking; },
  get activeInterior() { return S.activeInterior; },
};

export default {
  name: 'stations',
  order: 45,
  async init(ctx) {
    S.ctx = ctx;
    S.docking = new Docking(ctx, { viewOf });
    S.traffic = new Traffic(ctx);
    S.surface = new Surface(ctx);
    S.walker = new FootFallback(ctx);
    buildSystem(ctx, ctx.universe.system);
    ctx.bus.on('system:change', ({ system }) => buildSystem(ctx, system));
    ctx.bus.on('dock:complete', (e) => { try { S.docking.onDocked(e?.station); } catch (err) { ctx.errors.push('stations dock: ' + (err.stack || err)); } });
    ctx.bus.on('undock', () => {
      const v = S.docking.view;
      if (v) S.docking.radio(v, 'Partida autorizada. Campo de contenção aberto — boa viagem, piloto.');
      S.docking.release();
    });
    ctx.bus.on('player:exitShip', (e) => {
      // saiu da nave atracada numa estação com interior → entra no interior
      const sh = e?.ship || ctx.player.ship;
      if (!sh?.docked) return;
      const v = S.docking.view || api.nearest(ctx.player.pos)?.view;
      if (!v || v.frame.pos.distanceTo(ctx.player.pos) > v.radius * 2) return;
      const it = interiorOf(v.st.id);
      if (it) { it.activate(); S.activeInterior = it; }
    });
    ctx.provide('stations', api);
    registerShots(ctx, api, S);
  },
  update(dt, ctx) {
    S.docking.update(dt);
    if (S.activeInterior) S.activeInterior.update(dt, ctx);
    S.walker.update(dt, ctx, S.activeInterior);
    S.surface.update(dt, ctx);
  },
  frame(dt, ctx) {
    if (S.shotCam) S.shotCam(ctx);
    for (const v of S.views.values()) v.frameUpdate(dt, ctx);
    S.docking.frame(dt);
    S.traffic.frame(dt, ctx, S.views);
    // interior: monta/ativa perto da estação (o hangar detalhado aparece já na aproximação)
    for (const v of S.views.values()) {
      if (v.arch !== 'meridiana' || !v.built) continue;
      const d = ctx.player.camWorld.distanceTo(v.frame.pos);
      const it = d < 6000 ? interiorOf(v.st.id) : S.interiors.get(v.st.id);
      if (it) it.frame(dt, ctx, d);
    }
    S.walker.frame(dt, ctx, S.activeInterior);
    S.surface.frame(dt, ctx);
  },
  dispose() {
    for (const v of S.views.values()) v.dispose();
    for (const i of S.interiors.values()) i.dispose();
  },
};

export { api as stationsApi };
void THREE;
