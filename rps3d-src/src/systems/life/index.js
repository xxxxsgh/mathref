// Sistema `life` — fauna e flora procedurais.
//
//  • fauna montada por partes (tronco, pernas 2/4/6, cabeça, cauda, asas) com
//    pele (skinning), variação por seed e bioma, padrões de pele, órgãos
//    bioluminescentes; locomoção procedural com IK no relevo; bandos que
//    pastam e fogem, predadores que caçam, territoriais que investem,
//    revoadas, verme gigante do deserto e nadadores perto da costa
//  • flora instanciada por chunks com LOD, vento em TSL, translucidez,
//    brilho noturno e plantas perigosas (explodem/venenosas)
//  • scanner: catálogo de espécies, créditos de descoberta e nomeação
//
// Provê ctx.services.life:
//   creaturesNear(worldPos, r) → [{id, name, speciesId, role, pos (mundo), alive, hp}]
//   damageCreature(id, amount, info?) → boolean (morreu?)
//   catalog → função (lista) com .entries, .discover(sp|id), .rename(id, nome), .sell(id)
//   spawnAround(body, localPos, {species?, role?, count?}) → [ids]
//   targets(anchor) → alvos para tiros a pé (ver CONTRACT, foot)
//   scan(eyeWorld, max) → [{name, pos, kind, id}] (registra descobertas com atraso da onda)
//   species(body) → {fauna, flora}; flora (true: o foot desliga a vegetação de reserva)
// Emite: scan:discover, notify, player:damage, shake, explosion, life:death,
//        life:hit, life:hazard, life:rename, life:roar.
import * as THREE from 'three/webgpu';
import { Patch } from './patch.js';
import { Fauna } from './fauna.js';
import { Flora } from './flora.js';
import { ENV } from './materials.js';
import { createCatalog } from './catalog.js';
import { speciesFor } from './species.js';
import { registerShots } from './shots.js';
import { clamp, rng } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

const S = {
  ctx: null, patch: null, fauna: null, flora: null, catalog: null,
  active: false, body: null, camP: new THREE.Vector3(), camLocal: new THREE.Vector3(),
  cellT: 0, scanQ: [], freeze: false, shotCam: null, envT: 0, gustT: 0,
  forceFlora: false,
};

function planets(ctx) { return ctx.services.planets; }

/** Corpo pousável sob a câmera e altitude aproximada (m). */
function surfaceBody(ctx) {
  const sys = ctx.universe.system; if (!sys) return null;
  const cam = ctx.player.camWorld;
  const b = planets(ctx)?.dominant || sys.dominantBody(cam);
  if (!b || !b.landable || b.kind === 'gas_giant') return null;
  const local = b.worldToLocal(cam, ctx.time.world, S.camLocal);
  const r = local.length();
  const h = planets(ctx)?.heightAtLocal ? planets(ctx).heightAtLocal(b, _v.copy(local).divideScalar(r || 1)) : 0;
  const alt = r - b.radius - h;
  return { body: b, alt };
}

function activate(ctx, body) {
  S.body = body;
  S.patch.center(body, S.camLocal);
  S.fauna.clear();
  S.flora.setBody(body);
  S.active = true;
  S.cellT = 0;
  S.catalog.applyNames();
}
function deactivate() {
  if (!S.active) return;
  S.fauna.clear();
  S.flora.clear();
  S.patch.clear();
  S.active = false; S.body = null;
}

/** Recentra o remendo mantendo tudo no lugar. */
function recenter(ctx) {
  const P = S.patch;
  const oldC0 = P.C0.clone(), oldQ = P.qL.clone();
  P.center(S.body, S.camLocal);
  const qi = P.qInv;
  const pt = (v) => { v.applyQuaternion(oldQ).add(oldC0).sub(P.C0).applyQuaternion(qi); };
  const dir = (v) => { v.applyQuaternion(oldQ).applyQuaternion(qi); };
  S.fauna.rebase(pt, dir);
  S.flora.dirty = true;
}

function updateEnv(ctx, dt) {
  const cam = ctx.player.camWorld;
  const pl = planets(ctx);
  let elev = Math.PI / 4;
  try { elev = pl?.sunElevation ? pl.sunElevation(cam) : elev; } catch { /* */ }
  ENV.night.value = clamp((0.06 - elev) / 0.2, 0, 1);
  const sun = ctx.services.rendering?.sun;
  const dirW = sun?.direction;
  if (dirW) {
    _q.copy(ctx.camera.quaternion).invert();
    ENV.sunView.value.copy(dirW).normalize().applyQuaternion(_q);
  } else if (ctx.universe.system) {
    _v.copy(ctx.universe.system.star.pos).sub(cam).normalize();
    _q.copy(ctx.camera.quaternion).invert();
    ENV.sunView.value.copy(_v).applyQuaternion(_q);
  }
  const day = clamp(elev / 0.15 + 0.4, 0, 1);
  ENV.sunCol.value.setRGB(1.0 * day, 0.92 * day, 0.8 * day);
  // vento do clima (mundo → remendo)
  let wind = null;
  try { wind = pl?.weatherAt?.(cam)?.wind; } catch { /* */ }
  if (S.active && wind && wind.lengthSq() > 1e-6) {
    const wl = S.body.dirToLocal(_w.copy(wind), ctx.time.world, new THREE.Vector3());
    const wp = S.patch.dirToPatch(wl, _v);
    wp.y = 0;
    if (wp.lengthSq() > 1e-6) ENV.windDir.value.lerp(wp.normalize(), 1 - Math.exp(-dt));
    ENV.wind.value = clamp(0.35 + wind.length() / 10, 0.35, 2.2);
  } else ENV.wind.value = 0.6;
  S.gustT += dt;
  ENV.gust.value = Math.max(0, Math.sin(S.gustT * 0.35) * Math.sin(S.gustT * 0.77 + 1.3)) * 0.9;
}

// ─── API ───────────────────────────────────────────────────────────────
function pubCreature(c) {
  const w = S.patch.patchToWorld(c.center(_v), new THREE.Vector3());
  return { id: c.id, name: c.sp.name, speciesId: c.sp.id, role: c.sp.role, kind: 'fauna', pos: w, alive: c.alive, hp: c.hp, size: c.rig.dims.size * c.scale };
}
function findCreature(id) { return S.fauna?.creatures.find((c) => c.id === id) || null; }

function damageCreature(id, amount, info = {}) {
  const c = typeof id === 'object' ? id : findCreature(id);
  if (!c || !c.alive) return false;
  const ctx = S.ctx;
  c.hp -= amount;
  c.hitFlash = 1;
  ctx.bus.emit('life:hit', { id: c.id, species: c.sp.id, amount, part: info.part || 'body' });
  if (c.hp <= 0) {
    c.alive = false; c.deadT = 0; c.deadSide = Math.random() < 0.5 ? -1 : 1;
    c.state = 'dead';
    if (c.path) { c.path.frozen = false; }
    const pos = S.patch.patchToWorld(c.center(_v), new THREE.Vector3());
    ctx.bus.emit('life:death', { id: c.id, species: c.sp.id, role: c.sp.role, pos, byPlayer: info.byPlayer !== false });
    return true;
  }
  // reação
  if (c.sp.role === 'grazer' || c.sp.role === 'critter' || c.sp.role === 'flyer') { c.alarmT = 6; c.alarmFrom = S.camP.clone(); }
  else c.provoked = true;
  if (c.herd) for (const o of c.herd.members) if (o !== c && o.alive) { if (o.sp.role === 'grazer' || o.sp.role === 'critter') { o.alarmT = 6; o.alarmFrom = S.camP.clone(); } else o.provoked = true; }
  return false;
}

function footTarget(c) {
  if (c.footT) return c.footT;
  const P = S.patch;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  c.footT = {
    creature: c.id,
    get alive() { return c.alive && !!c.mesh.parent && c.mesh.visible !== false; },
    hitSegment(p0, p1) { P.toPatch(p0, a); P.toPatch(p1, b); return c.hitSegment(a, b); },
    damage(hp, info = {}) { return damageCreature(c, hp * (info.part === 'head' ? 1.8 : 1), { ...info, byPlayer: true }); },
    center(out = new THREE.Vector3()) { return P.toLocal(c.center(a), out); },
    kind: 'creature', faction: 'fauna', name: c.sp.name,
  };
  return c.footT;
}
function floraTarget() {
  if (S.floraT) return S.floraT;
  const P = S.patch;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let last = null;
  S.floraT = {
    alive: true, kind: 'flora',
    hitSegment(p0, p1) { P.toPatch(p0, a); P.toPatch(p1, b); const h = S.flora.hitHazard(a, b); last = h?.it || null; return h ? { t: h.t, part: 'planta' } : null; },
    damage() { if (last) S.flora.trigger(last, true); last = null; return false; },
    center(out = new THREE.Vector3()) { return P.toLocal(S.camP, out); },
  };
  return S.floraT;
}

const api = {
  get flora() { return true; },
  get active() { return S.active; },
  get catalog() { return S.catalog; },
  species: (body) => speciesFor(body),
  creaturesNear(pos, r = 100) {
    if (!S.active) return [];
    const p = S.patch.worldToPatch(pos, _w.clone());
    const out = [];
    for (const c of S.fauna.creatures) {
      if (!c.mesh.visible) continue;
      if (c.pos.distanceTo(p) <= r) out.push(pubCreature(c));
    }
    return out;
  },
  damageCreature: (id, amount, info) => damageCreature(id, amount, info),
  spawnAround(body, localPos, opts = {}) {
    const ctx = S.ctx;
    if (!body?.landable) return [];
    if (!S.active || S.body !== body) { S.camLocal.copy(localPos); activate(ctx, body); }
    const sps = speciesFor(body).fauna;
    let sp = opts.species ? sps.find((s) => s.id === opts.species || s.name === opts.species) : null;
    if (!sp && opts.role) sp = sps.find((s) => s.role === opts.role);
    if (!sp) sp = sps.find((s) => s.role === 'grazer') || sps[0];
    if (!sp) return [];
    const pc = S.patch.toPatch(localPos, new THREE.Vector3());
    pc.y = S.patch.groundY(pc.x, pc.z);
    if (sp.plan === 'worm') { const w = S.fauna.ensureWorm(); return w ? [w.id] : []; }
    return S.fauna.spawnGroup(sp, pc, rng((Math.random() * 1e9) >>> 0), null, opts.count ?? null).map((c) => c.id);
  },
  targets(anchor) {
    if (!S.active || !anchor || anchor.kind !== 'body' || anchor.body !== S.body) return [];
    const out = [];
    for (const c of S.fauna.creatures) if (c.alive && c.mesh.visible !== false) out.push(footTarget(c));
    if (S.flora.hazards.length) out.push(floraTarget());
    return out;
  },
  scan(eye, max = 150) {
    const ctx = S.ctx;
    if (!S.active) return [];
    const eP = S.patch.worldToPatch(eye, new THREE.Vector3());
    const out = [];
    const seen = new Set();
    const now = ctx.time.now;
    const list = [...S.fauna.creatures].filter((c) => c.alive && c.mesh.visible !== false).sort((a, b) => a.pos.distanceTo(eP) - b.pos.distanceTo(eP));
    for (const c of list) {
      const d = c.pos.distanceTo(eP);
      if (d > max * (c.sp.plan === 'worm' ? 2.5 : 1)) continue;
      if (seen.has(c.sp.id)) continue; seen.add(c.sp.id);
      const pos = S.patch.patchToWorld(c.center(_v), new THREE.Vector3());
      const known = S.catalog.has(c.sp.id);
      out.push({ id: c.sp.id, name: c.sp.name + (known ? '' : ' · NOVA'), label: c.sp.name, pos, kind: 'fauna' });
      if (!known) S.scanQ.push({ at: now + Math.min(2.2, d / max * 2), sp: c.sp });
    }
    const fl = S.flora.nearestBySpecies(eP, Math.min(max, 80));
    for (const [, { it, d }] of fl) {
      if (!it.sp.scannable) continue;
      const pos = S.patch.patchToWorld(_v.copy(it.pp).addScaledVector(S.patch.dirToPatch(it.up, _w), 1.0 * it.scale), new THREE.Vector3());
      const known = S.catalog.has(it.sp.id);
      out.push({ id: it.sp.id, name: it.sp.name + (it.sp.hazard ? ' ⚠' : '') + (known ? '' : ' · NOVA'), label: it.sp.name, pos, kind: 'flora' });
      if (!known) S.scanQ.push({ at: now + Math.min(2.2, d / max * 2), sp: it.sp });
    }
    return out;
  },
  /** Debug/cenas: acesso interno. */
  get _state() { return S; },
};

export default {
  name: 'life',
  order: 40,
  async init(ctx) {
    S.ctx = ctx;
    S.patch = new Patch(ctx);
    S.fauna = new Fauna(ctx, S.patch);
    S.flora = new Flora(ctx, S.patch);
    S.catalog = createCatalog(ctx);
    ctx.provide('life', api);
    ctx.save.register('life', { serialize: () => S.catalog.serialize(), deserialize: (d) => S.catalog.deserialize(d) });
    ctx.bus.on('game:new', () => S.catalog.reset());
    ctx.bus.on('system:change', () => deactivate());
    ctx.bus.on('foot:fire', (e) => { if (S.active) S.fauna.loudT = 3; void e; });
    ctx.bus.on('foot:blast', () => { if (S.active) S.fauna.loudT = 5; });
    ctx.bus.on('explosion', (e) => { if (S.active && e?.pos && e.pos.distanceTo(ctx.player.camWorld) < 400) S.fauna.loudT = 5; });
    // clareiras: nave pousada e estruturas do `stations`
    ctx.bus.on('land', (e) => {
      try {
        const b = e?.body || S.body; const p = e?.pos || ctx.player.ship?.pos;
        if (b && p) { S.flora.clearings.push({ body: b, local: b.worldToLocal(p, ctx.time.world, new THREE.Vector3()), radius: 16, all: true }); S.flora.chunks.clear(); S.flora.dirty = true; }
      } catch { /* */ }
    });
    registerShots(ctx, api, S, { activate, deactivate });
  },
  update(dt, ctx) {
    if (!S.active) return;
    S.patch.sync();
    const onFoot = ctx.game.mode === 'foot';
    if (!S.freeze) {
      const W = { player: S.camP, onFoot, t: ctx.time.now, rand: Math.random, emit: (e, p) => ctx.bus.emit(e, p), groundY: (x, z) => S.patch.groundY(x, z) };
      S.fauna.step(dt, W);
      S.flora.step(dt, S.camP, onFoot);
    }
  },
  frame(dt, ctx) {
    if (S.shotCam) S.shotCam(ctx);
    // ativa/desativa pela altitude sobre um corpo pousável
    const sb = ctx.services.planets ? surfaceBody(ctx) : null;
    if (!S.lockBody) {
      if (sb && sb.alt < 2200) { if (!S.active || S.body !== sb.body) activate(ctx, sb.body); }
      else if (sb === null || sb.alt > 2800) deactivate();
    } else if (sb) S.camLocal.copy(sb.body.worldToLocal(ctx.player.camWorld, ctx.time.world, S.camLocal));
    updateEnv(ctx, dt);
    if (!S.active) return;
    S.patch.sync();
    S.patch.worldToPatch(ctx.player.camWorld, S.camP);
    if (Math.hypot(S.camP.x, S.camP.z) > 260 && !S.lockBody) { recenter(ctx); S.patch.worldToPatch(ctx.player.camWorld, S.camP); }
    // flora: chunks + instâncias
    S.flora.updateChunks(S.camLocal, S.forceFlora || !!ctx.shot);
    S.flora.frame(S.camP);
    // fauna: células (1 Hz) + animação
    S.cellT -= dt;
    if (S.cellT <= 0 && !S.noAutoFauna) {
      S.cellT = 1;
      S.fauna.updateCells(S.camLocal);
      // verme: habitante do deserto quando o jogador está a pé
      if (ctx.game.mode === 'foot' && S.body?.type === 'desert') S.fauna.ensureWorm();
    }
    S.fauna.frame(dt, S.camP, ctx.time.now);
    // fila do scanner (descobertas com o atraso da onda)
    const now = ctx.time.now;
    for (let i = S.scanQ.length - 1; i >= 0; i--) {
      const q = S.scanQ[i];
      if (now >= q.at) { S.scanQ.splice(i, 1); S.catalog.discover(q.sp); }
    }
  },
  dispose() { deactivate(); },
};
