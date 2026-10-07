// ═══════════════════════════════════════════════════════════════════════════
// Sistema "space" — espaço profundo (order 10)
// ═══════════════════════════════════════════════════════════════════════════
//
// Monta o sistema estelar atual (escuta 'world:system'):
//   • céu: cubo HDR (Via Láctea + poeira + nebulosas volumétricas por
//     raymarching, nebulaSteps passos) renderizado 1× por sistema, domo
//     centrado na câmera com lente gravitacional fraca e ~30 mil estrelas HDR
//     cintilantes (SkyCube / SkyDome / StarField);
//   • estrela em escala real (fotosfera, coroa, proeminências, glare), binária
//     com companheira orbitando, gigante azul, anã branca, ou BURACO NEGRO
//     com disco de acreção relativístico e lente forte (Star / BlackHole);
//   • cinturões de asteroides (faixa distante + campo local instanciado com
//     LOD, mineração e fragmentos), campos de destroços, eventos aleatórios
//     (nave à deriva, socorro, emboscada, tempestade de íons) e poeira em
//     parallax (Belt / Debris / Events / IonStorm / Dust);
//   • controla ctx.sun (direção, cor, intensidade × planets.sunTransmittance).
//   • sem o sistema `planets`, desenha corpos substitutos (Proxies).
//
// Serviço publicado: ctx.get('space')
//   starLocal(out?)               → Vector3 local da estrela (ou do buraco negro)
//   starInfo()                    → {type, label, color: Color, radius, angularRadius, distance, position}
//   flares()                      → [{position, color, intensity, radius}] fontes para lens flare (render)
//   asteroids(posLocal, r)        → [{id, position, radius, resource, resourceLabel, rare, amount, mine(qty)→qty}]
//   debris(posLocal, r)           → [{kind, position, radius, field}] peças de destroços (colisão)
//   beltDensity(posLocal)         → 0..~1.5 densidade do cinturão no ponto
//   belts() / debrisFields()      → descrição dos cinturões/campos do sistema
//   skyBrightness                 → 0..1 (1 = céu de espaço; 0 = céu diurno opaco)
//   starVisibility                → 0..1 estrela visível (oclusão por planeta × transmitância)
//   interference                  → 0..1 interferência de tempestades de íons (hud/audio)
//   skyTexture                    → CubeTexture HDR do céu distante (envMap/reflexos)
//   events()                      → [{id, type, position, data, object3d}]
//   spawnEvent(type, posLocal, data) → evento ('derelict'|'distress'|'ambush'|'ionstorm')
//   removeEvent(id) · setAutoEvents(bool) · strike(stormId?)  (força um relâmpago)
//   blackHole                     → {rs, position, diskIn, diskOut} | null
// Eventos emitidos: 'space:event' {event}, 'space:eventEnd' {id},
//   'space:lightning' {stormId, position, distance, intensity},
//   'space:interference' {amount}, 'space:mined' {id, resource, qty, position, depleted, fragmented},
//   'space:ready' {system} (céu do sistema pronto), 'fx:flash'/'fx:shake' (raios próximos).
// Estado salvo: ctx.state.space = {mined: [[id, restante], ...]}.

import * as THREE from 'three/webgpu';
import { SkyCube } from './SkyCube.js';
import { SkyDome } from './SkyDome.js';
import { skyLayout } from './skyLayout.js';
import { camU } from './tslUtil.js';
import { StarBody } from './Star.js';
import { BlackHole } from './BlackHole.js';
import { Proxies } from './Proxies.js';
import { Belt } from './Belt.js';
import { DebrisField, debrisFieldsFor } from './Debris.js';
import { Events } from './Events.js';
import { Dust } from './Dust.js';
import { registerScenarios } from './scenarios.js';

const S = {
  system: null,
  layout: null,
  star: null,
  companion: null,
  blackHole: null,
  belts: [],
  debris: [],
  skyVis: 1,
  interference: 0,
  lastInterf: 0,
  sunScale: 1,
  mined: new Map(), // id do asteroide → quantidade restante (todos os sistemas)
};
const _cam = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _col = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);

function disposeSystem(ctx) {
  S.star?.dispose();
  S.companion?.dispose();
  S.blackHole?.dispose();
  for (const b of S.belts) b.dispose();
  for (const d of S.debris) d.dispose();
  S.events?.clear();
  S.star = S.companion = S.blackHole = null;
  S.belts = [];
  S.debris = [];
}

function buildSystem(ctx, system) {
  disposeSystem(ctx);
  S.system = system;
  S.layout = skyLayout(system);
  S.cube.build(S.layout);
  S.dome.build(S.layout);
  const st = system.star;
  if (st.type === 'black_hole') {
    S.blackHole = new BlackHole(ctx, system, S.cube.texture);
    ctx.root.add(S.blackHole.group);
  } else {
    S.star = new StarBody(st, system.seed);
    ctx.root.add(S.star.group);
    if (st.companion) {
      const c = st.companion;
      S.companion = new StarBody({ type: 'companion', radius: c.radius, color: c.color, lum: 0.6 }, system.seed + 7);
      ctx.root.add(S.companion.group);
    }
  }
  S.proxies.clear();
  S.proxiesBuilt = false; // construídos sob demanda, só se o sistema planets não existir
  const sunColor = S.star ? S.star.color : new THREE.Color(1, 0.75, 0.5);
  for (const def of system.belts || []) {
    const belt = new Belt(ctx, system, def, sunColor, S.mined);
    S.belts.push(belt);
    ctx.root.add(belt.group);
  }
  const dc = Math.max(40, ctx.quality.p.debrisCount | 0);
  for (const def of debrisFieldsFor(system)) {
    const f = new DebrisField(ctx, def, Math.round(dc * 0.5));
    S.debris.push(f);
    ctx.root.add(f.group);
  }
  S.events.setSeed(system.seed);
  S.built = { id: system.id, q: ctx.quality.name };
}

/** Posição local da companheira binária (órbita lenta em torno da principal). */
function companionLocal(ctx, out) {
  const c = S.system.star.companion;
  const a = (S.system.seed % 628) / 100 + ctx.world.time * ((Math.PI * 2) / 5400);
  return ctx.world.toLocal(Math.cos(a) * c.separation, Math.sin(a) * c.separation * 0.12, Math.sin(a) * c.separation, out);
}

function camSys(ctx) {
  return ctx.world.toSystem(_cam);
}

const api = {
  get system() {
    return S.system;
  },
  starLocal(out = new THREE.Vector3()) {
    return S.system ? S.ctx.world.toLocal(0, 0, 0, out) : out.set(0, 0, 0);
  },
  starInfo() {
    const st = S.system?.star;
    if (!st) return null;
    const body = S.star;
    return {
      type: st.type,
      label: st.label,
      name: st.name,
      color: body ? body.color.clone() : S.blackHole?.lightColor.clone(),
      radius: st.radius,
      angularRadius: body?.angularRadius ?? 0,
      distance: body?.distance ?? S.blackHole?.distance ?? 0,
      position: api.starLocal(),
    };
  },
  flares() {
    const out = [];
    const vis = S.sunScale;
    if (S.star) out.push({ position: S.star.group.position.clone(), color: S.star.color.clone(), intensity: S.star.glareI.value, radius: S.star.radius });
    if (S.companion) out.push({ position: S.companion.group.position.clone(), color: S.companion.color.clone(), intensity: S.companion.glareI.value, radius: S.companion.radius });
    if (S.blackHole) out.push({ position: S.blackHole.group.position.clone(), color: S.blackHole.lightColor.clone(), intensity: 0.6 * vis, radius: S.blackHole.rs * S.blackHole.diskOut });
    return out;
  },
  asteroids(posLocal, radius = 100) {
    const out = [];
    for (const b of S.belts) for (const a of b.query(S.ctx.world, posLocal, radius)) out.push(a);
    return out;
  },
  debris(posLocal, radius = 50) {
    const out = [];
    for (const d of S.debris) for (const p of d.query(S.ctx.world, posLocal, radius)) out.push(p);
    return out;
  },
  beltDensity(posLocal) {
    const p = S.ctx.world.toSystem(posLocal);
    let d = 0;
    for (const b of S.belts) d = Math.max(d, b.density(p.x, p.y, p.z));
    return d;
  },
  belts() {
    return S.belts.map((b) => ({ ...b.def, visibleRocks: b.visibleCount || 0 }));
  },
  debrisFields() {
    return S.debris.map((d) => ({ ...d.def, position: S.ctx.world.toLocal(d.def.center.x, d.def.center.y, d.def.center.z), distance: d.distance }));
  },
  get skyBrightness() {
    return S.skyVis;
  },
  /** 0..1: estrela principal visível (oclusão por planetas × transmitância) — para lens flare/god rays. */
  get starVisibility() {
    return S.starVis ?? 1;
  },
  get interference() {
    return S.interference;
  },
  get skyTexture() {
    return S.cube?.texture || null;
  },
  get blackHole() {
    const bh = S.blackHole;
    return bh ? { rs: bh.rs, position: bh.group.position.clone(), diskIn: bh.diskIn * bh.rs, diskOut: bh.diskOut * bh.rs, normal: bh.N.clone() } : null;
  },
  events() {
    return S.events.active();
  },
  spawnEvent(type, posLocal, data = {}) {
    const p = S.ctx.world.toSystem(posLocal);
    return S.events.view(S.events.spawn(type, p, data));
  },
  removeEvent(id) {
    S.events.remove(id);
  },
  setAutoEvents(on) {
    S.events.auto = !!on;
  },
  strike(stormId) {
    const ev = S.events.list.find((e) => e.storm && (!stormId || e.id === stormId));
    return ev ? ev.storm.strike() : null;
  },
};

export default {
  name: 'space',
  label: 'espaço profundo',
  order: 10,
  async init(ctx) {
    S.ctx = ctx;
    S.cube = new SkyCube(ctx);
    S.dome = new SkyDome(ctx, S.cube);
    S.proxies = new Proxies(ctx);
    ctx.root.add(S.proxies.group);
    S.events = new Events(ctx);
    ctx.root.add(S.events.group);
    S.dust = new Dust(ctx);
    // luz da companheira binária (sem sombra)
    S.light2 = new THREE.DirectionalLight(0xaaccff, 0);
    S.light2.name = 'sun-companion';
    ctx.scene.add(S.light2, S.light2.target);

    ctx.bus.on('world:system', ({ system }) => {
      if (S.built?.id === system.id && S.built.q === ctx.quality.name) return;
      buildSystem(ctx, system);
    });
    ctx.bus.on('quality:change', () => {
      if (!S.system) return;
      S.dust.dispose();
      S.dust = new Dust(ctx);
      buildSystem(ctx, S.system);
    });
    ctx.bus.on('save:collect', (state) => {
      state.space = { mined: [...S.mined] };
    });
    ctx.bus.on('save:loaded', (state) => {
      S.mined.clear();
      for (const [id, v] of state?.space?.mined || []) S.mined.set(id, v);
      for (const b of S.belts) {
        b.cells.clear();
        b.lastCell = '';
      }
    });
    if (ctx.world.system) buildSystem(ctx, ctx.world.system);
    Object.defineProperty(api, '_internal', { value: S, enumerable: false }); // depuração
    ctx.provide('space', api);
    registerScenarios(ctx, S, api);
  },

  update(dt, ctx) {
    if (!S.system) return;
    const cs = camSys(ctx);
    for (const b of S.belts) b.update(dt);
    S.events.update(dt, cs, ctx.mode);
  },

  frame(dt, ctx) {
    if (!S.system) return;
    const cam = ctx.camera;
    const w = ctx.world;
    // cenários: câmera "à deriva" em velocidade constante (para ver a poeira)
    if (S.drift && ctx.mode === 'free') cam.position.addScaledVector(S.drift, dt);
    cam.updateMatrixWorld();
    cam.getWorldPosition(_cam);
    const cs = camSys(ctx);
    // uniforms de câmera compartilhados
    const e = cam.matrixWorld.elements;
    camU.right.value.set(e[0], e[1], e[2]).normalize();
    camU.up.value.set(e[4], e[5], e[6]).normalize();
    const h = ctx.renderer.domElement.height || 720;
    camU.pixelAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, h);
    camU.time.value = ctx.time;

    // céu diurno de planeta apaga estrelas e nebulosas
    const planets = ctx.get('planets');
    let op = 0;
    try {
      op = planets?.skyOpacity?.(_cam) ?? 0;
    } catch {
      op = 0;
    }
    S.skyVis = 1 - Math.min(1, Math.max(0, op));
    camU.skyVis.value = S.skyVis;
    S.dome.follow(_cam);

    // estrela / companheira / buraco negro
    const starPos = w.toLocal(0, 0, 0, _tmp).clone();
    S.proxies.group.visible = !planets;
    if (!planets) {
      if (!S.proxiesBuilt) {
        S.proxies.build(S.system);
        S.proxiesBuilt = true;
      }
      S.proxies.update(w, starPos);
    }
    let trans = null;
    try {
      trans = planets?.sunTransmittance?.(_cam) || null;
    } catch {
      trans = null;
    }
    const transL = trans ? Math.max(trans.r, trans.g, trans.b) : 1;
    const occluded = (p) => {
      if (!planets) return S.proxies.occludes(_cam, p);
      try {
        const d = _dir.copy(p).sub(_cam);
        const L = d.length();
        const hit = planets.raycast?.(_cam, d.divideScalar(L), Math.min(L, 5e8));
        return !!hit;
      } catch {
        return false;
      }
    };
    let primaryColor = _col.set(1, 1, 1);
    let primaryI = 3.5;
    if (S.star) {
      S.star.group.position.copy(starPos);
      const vis = occluded(starPos) ? 0 : 1;
      S.starVis = vis * transL;
      S.star.update(_cam, vis * (0.25 + 0.75 * transL));
      primaryColor = _col.copy(S.star.color);
      primaryI = 3.0 + 1.6 * (S.system.star.lum ?? 1);
    }
    if (S.companion) {
      const cp = companionLocal(ctx, new THREE.Vector3());
      S.companion.group.position.copy(cp);
      const vis = occluded(cp) ? 0 : 1;
      S.companion.update(_cam, vis * (0.25 + 0.75 * transL));
      _dir.copy(cp).sub(_cam).normalize();
      S.light2.position.copy(_cam).addScaledVector(_dir, 1000);
      S.light2.target.position.copy(_cam);
      S.light2.target.updateMatrixWorld();
      S.light2.color.copy(S.companion.color);
      S.light2.intensity = 1.6 * transL;
    } else S.light2.intensity = 0;
    if (S.blackHole) {
      S.blackHole.update(_cam, starPos);
      S.blackHole.setSkyTexture(S.cube.texture);
      // lente fraca no domo
      const d = _dir.copy(starPos).sub(_cam);
      const D = d.length();
      S.dome.lensU.value.set(d.x / D, d.y / D, d.z / D, S.blackHole.rs / Math.max(D, S.blackHole.rs));
      primaryColor = _col.copy(S.blackHole.lightColor);
      primaryI = 2.4;
    } else S.dome.lensU.value.w = 0;

    // ctx.sun: da estrela até o foco
    const sun = ctx.sun;
    _dir.copy(starPos).sub(_cam).normalize();
    sun.position.copy(_cam).addScaledVector(_dir, 1000);
    sun.target.position.copy(_cam);
    sun.target.updateMatrixWorld();
    sun.color.copy(primaryColor).lerp(_white, 0.35);
    if (trans) sun.color.multiply(trans);
    sun.intensity = primaryI;
    S.sunScale = transL;

    // cinturões, destroços, eventos
    const sunDirFromCam = _dir.clone();
    let beltDens = 0;
    let pebbles = 0;
    for (const b of S.belts) {
      b.frame(ctx, _cam, starPos, sunDirFromCam, w.time);
      const dd = b.density(cs.x, cs.y, cs.z);
      beltDens = Math.max(beltDens, dd);
      if (b.near.visible) pebbles = Math.max(pebbles, Math.min(1, dd * 1.5));
    }
    let debrisNear = 0;
    for (const f of S.debris) {
      f.frame(ctx, cs, w.time);
      if (f.distance < f.def.radius * 1.5) debrisNear = Math.max(debrisNear, 1 - f.distance / (f.def.radius * 1.5));
    }
    S.events.frame(ctx, _cam, w.time);
    S.interference = S.events.interference();
    if (Math.abs(S.interference - S.lastInterf) > 0.05) {
      S.lastInterf = S.interference;
      ctx.bus.emit('space:interference', { amount: S.interference });
    }
    // poeira: mais densa no cinturão, nos destroços e na tempestade
    const dens = 0.45 + beltDens * 1.6 + debrisNear * 0.9 + S.interference * 1.2;
    S.dust.frame(dt, cs, _cam, sunDirFromCam, sun.color, Math.min(2, dens) * S.skyVis + (1 - S.skyVis) * 0.1, pebbles, ctx.time, S.interference > 0.3 ? _tint.set(0.55, 0.7, 1.0) : _tint.set(0.75, 0.7, 0.62));

    // cubo do céu (1× por sistema)
    if (S.cube.render()) {
      // sem o sistema render, o próprio céu vira o mapa de ambiente (reflexos/IBL)
      if (!ctx.get('render') && (!ctx.scene.environment || ctx.scene.environment === S.envSet)) {
        ctx.scene.environment = S.cube.texture;
        ctx.scene.environmentIntensity = 0.22; // preenchimento sutil: lados noturnos continuam escuros
        S.envSet = S.cube.texture;
      }
      ctx.bus.emit('space:ready', { system: S.system });
    }
  },
};
const _tint = new THREE.Color();
