// Sistema `ships` — modelos procedurais PBR de todas as naves (classes ×
// facções, capitais com torres separáveis e hangares), cockpit interior do
// caça do Rafael, interiores andáveis e customização visual.
//
// Serviço ctx.services.ships:
//   create(classId, faction, opts) → ShipInstance {
//       group, hardpoints[{id,type,pos,dir}], thrusters[{posLocal,dirLocal,r,len}],
//       setThrottle(0..1), setBoost(0..1), setGear(bool|0..1, instant?), setLights(bool),
//       setPaint(id|paleta), damage(pontos, posLocal?), repair(), turrets[], hangars[],
//       colliders[{center,half}], radius, length, eye, gearHeight, localToWorld(v), dispose() }
//     classId: fighter | interceptor | freighter | explorer | frigate | destroyer | carrier
//     faction: hegemonia | frente | corsarios | guilda | vigilantes
//     opts: { seed, paint, gear, throttle, lite, modules: {cargo}, shadows, id }
//   cockpit: { group, setData({...}), setGlass({rain,dust,ice,fire}), show('auto'|true|false), eye }
//   interior(classId) → { group, colliders, spawn, seat, eyeHeight, bounds } | null
//   attachInterior(ship, frame) → registra colisores no frame {pos, quat} da nave
//   classes, factions, paints, info(classId, faction)
//
// Escuta: 'reentry' (fogo no vidro), 'ship:hit' (dano visual em naves com id),
// 'weather' (vidro), 'quality:change'.
import * as THREE from 'three/webgpu';
import { ShipInstance, blueprint } from './ship.js';
import { Cockpit } from './cockpit.js';
import { buildInterior } from './interior.js';
import { FACTION_STYLES, CLASS_INFO, MODEL_NAMES, PAINTS, FACTION_IDS, CLASS_IDS } from './factions.js';
import { registerShots } from './shots.js';

const st = { ctx: null, ships: new Set(), byId: new Map(), cockpit: null, nextId: 1, shotCam: null };

const api = {
  create(classId = 'fighter', faction = 'hegemonia', opts = {}) {
    const s = new ShipInstance(st.ctx, classId, faction, opts);
    s.id = opts.id || `nave${st.nextId++}`;
    st.ships.add(s); st.byId.set(s.id, s);
    const base = s.dispose.bind(s);
    s.dispose = () => { base(); st.ships.delete(s); st.byId.delete(s.id); };
    return s;
  },
  get cockpit() {
    if (!st.cockpit) st.cockpit = new Cockpit(st.ctx);
    return st.cockpit;
  },
  interior(classId) { return buildInterior(st.ctx, classId); },
  /** Coloca o interior dentro da nave e registra os colisores no frame dela. */
  attachInterior(ship, frame) {
    const inter = buildInterior(st.ctx, ship.classId);
    if (!inter) return null;
    ship.group.add(inter.group);
    const shapes = inter.colliders.map((c) => st.ctx.collision.addBox({ frame, center: c.center, half: c.half, tag: 'interior:' + ship.id }));
    inter.remove = () => { shapes.forEach((s) => s.remove()); inter.group.removeFromParent(); };
    return inter;
  },
  byId(id) { return st.byId.get(id) || null; },
  list() { return [...st.ships]; },
  classes: CLASS_IDS, factions: FACTION_IDS, paints: Object.keys(PAINTS),
  info(classId, faction = 'hegemonia') {
    const bp = blueprint(classId, faction);
    return { classId, faction, label: CLASS_INFO[classId]?.label, model: MODEL_NAMES[faction]?.[classId], length: bp.length, radius: bp.radius, factionLabel: FACTION_STYLES[faction]?.label, interior: !!bp.interior };
  },
};

export default {
  name: 'ships',
  order: 20,
  async init(ctx) {
    st.ctx = ctx;
    ctx.provide('ships', api);
    // cockpit pronto desde o início (invisível até o modo nave)
    const cp = api.cockpit;
    ctx.camera.add(cp.group);
    ctx.bus.on('reentry', (e) => cp.onReentry(e?.intensity ?? 0.5));
    ctx.bus.on('ship:hit', (e) => {
      const s = e?.target && st.byId.get(e.target);
      if (s && !e.shield && e.pos) {
        s.group.updateWorldMatrix(true, false);
        const local = s.group.worldToLocal(ctx.world.toLocal(e.pos, new THREE.Vector3()));
        s.damage(e.damage || 5, local);
      }
    });
    registerShots(ctx, api, st);
  },
  frame(dt, ctx) {
    if (st.shotCam) st.shotCam(ctx);
    for (const s of st.ships) {
      if (!s.alive) continue;
      const d = s.group.parent ? s.group.position.length() : Infinity;
      s.frame(dt, d);
    }
    st.cockpit?.frame(dt, ctx);
  },
  dispose() {
    for (const s of [...st.ships]) s.dispose();
    st.cockpit?.dispose();
  },
};

export { api as shipsApi };
