// Sistema `deepspace` — espaço profundo do RPS3D.
//
// Dono de: céu estelar procedural (Via Láctea coerente com a galáxia do
// Universe.js + nebulosa por raymarching, assados num cubemap HDR), estrela(s)
// do sistema com superfície animada e coroa, buraco negro com disco de
// acreção e lente gravitacional, cinturões de asteroides instanciados (dados
// consultáveis para mineração/colisão), campos de destroços, poeira próxima à
// câmera, tempestades de íons, efeitos de viagem quântica e de salto, e os
// dados do mapa galáctico.
//
// Provê `ctx.services.space` (ver `api` abaixo).
import * as THREE from 'three/webgpu';
import { SkyBake } from './skyBake.js';
import { SkyDome } from './skyDome.js';
import { skyParams } from './skyParams.js';
import { Star } from './star.js';
import { BlackHole } from './blackhole.js';
import { AsteroidField } from './belt.js';
import { BeltRing } from './beltRing.js';
import { DebrisFields } from './debris.js';
import { Dust } from './dust.js';
import { Warp } from './warp.js';
import { IonStorms } from './ionstorm.js';
import { FarBodies } from './farBodies.js';
import { galaxyMap } from './galaxyMap.js';
import { registerShots } from './shots.js';

const _v = new THREE.Vector3();

const state = {
  ctx: null,
  bake: null, dome: null, params: null,
  stars: [], bh: null,
  field: null, ring: null, far: null, debris: null, dust: null, warp: null, storms: null,
  systemId: null,
  fallbackLight: null, fallbackEnv: null, pmrem: null,
  envDirty: false,
  shotCam: null,
  skyFade: 1,
  rebakeQueued: false,
};

function starPos(sys, out) { return out.copy(sys.star.pos); }

function buildStars(ctx, sys) {
  for (const s of state.stars) s.dispose();
  state.stars = [];
  state.bh?.dispose(); state.bh = null;
  const st = sys.star;
  if (st.type === 'black_hole') {
    state.bh = new BlackHole(ctx, { star: st, getPos: (out) => out.copy(st.pos), sky: state.dome });
  } else {
    state.stars.push(new Star(ctx, { type: st.type, color: st.color, radius: st.radius, seed: sys.seed, getPos: (out) => out.copy(st.pos) }));
    if (st.companion) {
      const c = st.companion;
      state.stars.push(new Star(ctx, { type: 'red_dwarf', color: c.color, radius: c.radius, seed: sys.seed + 7, getPos: (out) => out.copy(st.pos).add(c.pos) }));
    }
  }
}

function applyEnvironment(ctx) {
  const p = state.params;
  const r = ctx.services.rendering;
  const env = r?.environment;
  if (env?.setNebula) {
    // tom de baixa frequência para a IBL do pipeline de render
    const n = p.nebula;
    if (n.on) env.setNebula(n.colorA.clone().multiplyScalar(0.16), n.colorB.clone().multiplyScalar(0.12), 1.0);
    else env.setNebula(new THREE.Color(0.03, 0.028, 0.04), new THREE.Color(0.012, 0.016, 0.026), 1.0);
    return;
  }
  // sem o sistema `rendering`: IBL própria a partir do cubemap assado
  state.envDirty = true;
}

// O flare/god rays do pipeline seguem o "sol"; num buraco negro a luz vem do
// disco (e não de um ponto), então o flare analítico é atenuado.
const FLARE_DEFAULT = { sun: 1, god: 0.32, ghosts: 0.35 };
let flareBH = false;
function applyFlare(ctx) {
  const r = ctx.services.rendering;
  if (!r?.setFlare) return;
  const bh = !!state.bh;
  if (bh === flareBH) return;
  flareBH = bh;
  r.setFlare(bh ? { sun: 0.08, god: 0.06, ghosts: 0.12 } : FLARE_DEFAULT);
}

function onSystem(ctx, sys) {
  if (!sys || sys.id === state.systemId) return;
  state.systemId = sys.id;
  state.params = skyParams(ctx.universe.galaxy, sys);
  if (ctx.params.get('neb') === '0') state.params.nebula.on = false; // depuração
  state.bake.setParams(state.params);
  state.dome.setNeighbors(state.params.neighbors);
  buildStars(ctx, sys);
  state.field?.setSystem(sys);
  state.far?.setSystem(sys);
  state.ring?.setSystem(sys);
  state.debris?.setSystem(sys);
  state.storms?.setSystem(sys);
  state.dust?.setSystem(sys, state.params);
  // dentro do salto o bake é incremental (escondido pelo túnel); fora, síncrono
  if (state.warp?.inJump) state.bake.bakeIncremental();
  else state.bake.bakeAll(ctx.renderer);
  applyEnvironment(ctx);
}

function ensureFallbackLight(ctx) {
  if (ctx.services.rendering?.sun) {
    if (state.fallbackLight) { ctx.scene.remove(state.fallbackLight, state.fallbackLight.target); state.fallbackLight = null; }
    return;
  }
  if (!state.fallbackLight) {
    const L = new THREE.DirectionalLight(0xffffff, 3.2);
    L.name = 'deepspace-sol-reserva';
    ctx.scene.add(L, L.target);
    state.fallbackLight = L;
  }
  const sys = ctx.universe.system;
  if (!sys) return;
  sys.sunDir(ctx.player.camWorld, _v);
  state.fallbackLight.position.copy(_v);
  state.fallbackLight.target.position.set(0, 0, 0);
  state.fallbackLight.color.setRGB(...sys.star.color);
  state.fallbackLight.intensity = sys.star.type === 'black_hole' ? 1.4 : 3.2;
}

function updateFallbackEnv(ctx) {
  if (!state.envDirty || ctx.services.rendering?.environment) return;
  if (state.bake.pending >= 0) return;
  state.envDirty = false;
  try {
    state.pmrem ||= new THREE.PMREMGenerator(ctx.renderer);
    const rt = state.pmrem.fromCubemap(state.bake.texture, state.fallbackEnv || undefined);
    state.fallbackEnv = rt;
    ctx.scene.environment = rt.texture;
    ctx.scene.environmentIntensity = 1.4;
  } catch (e) { console.warn('[deepspace] IBL reserva falhou', e); }
}

const api = {
  /** Direção normalizada de `worldPos` para a estrela do sistema. */
  starDirection(worldPos, out = new THREE.Vector3()) {
    const sys = state.ctx?.universe.system;
    if (!sys) return out.set(0, 1, 0);
    return out.copy(sys.star.pos).sub(worldPos).normalize();
  },
  /** Asteroides (dados determinísticos) dentro do raio r de worldPos. */
  asteroidsNear(worldPos, r = 5000, out = []) { return state.field ? state.field.query(worldPos, r, out) : (out.length = 0, out); },
  /** Destroços próximos (mesmo formato dos asteroides, kind='debris'). */
  debrisNear(worldPos, r = 3000, out = []) { return state.debris ? state.debris.query(worldPos, r, out) : (out.length = 0, out); },
  /** Marca um asteroide como minerado/destruído (some do campo). */
  removeAsteroid(id) { state.field?.remove(id); },
  /** Sequência visual do salto entre sistemas: 'start' | 'stop'. */
  jumpFx(phase, opts = {}) { state.warp?.jump(phase, opts); },
  /** Túnel/distorção da viagem quântica. */
  quantumFx(on, intensity = 1, dir = null) { state.warp?.quantum(on, intensity, dir); },
  /** Intensidade de tempestade de íons em worldPos (0..1) — interferência para HUD/voo. */
  ionStormAt(worldPos) { return state.storms ? state.storms.intensityAt(worldPos) : 0; },
  /** Densidade de cinturão em worldPos (0..1). */
  beltDensityAt(worldPos) { return state.field ? state.field.densityAt(worldPos) : 0; },
  /** Esmaece o céu (planets usa sob atmosfera de dia): 0..1. */
  setSkyFade(v) { state.skyFade = Math.max(0, Math.min(1, v)); },
  /** Mapa galáctico (dados): sistemas, cores, rotas de salto. */
  galaxyMap(rangeLy = 70) { return galaxyMap(state.ctx.universe.galaxy, rangeLy); },
  /** Direção (mundo) do centro galáctico vista do sistema atual. */
  get galacticCoreDir() { return state.params?.coreDir.clone() || new THREE.Vector3(0, 0, -1); },
  /** Cubemap HDR do céu (para IBL/reflexos). */
  get envMap() { return state.bake?.texture || null; },
  get warpState() { return state.warp ? state.warp.state() : { quantum: 0, jump: 0 }; },
  /** Uniforms internos (debug / outros efeitos). */
  get uniforms() { return state.dome?.u; },
};

export default {
  name: 'deepspace',
  order: 10,
  async init(ctx) {
    state.ctx = ctx;
    state.bake = new SkyBake(ctx);
    state.dome = new SkyDome(ctx, state.bake);
    state.field = new AsteroidField(ctx);
    state.ring = new BeltRing(ctx);
    state.debris = new DebrisFields(ctx);
    state.dust = new Dust(ctx);
    state.warp = new Warp(ctx, state);
    state.storms = new IonStorms(ctx);
    state.far = new FarBodies(ctx);
    ctx.provide('space', api);

    await state.bake.compile(ctx.renderer);
    onSystem(ctx, ctx.universe.system);
    ctx.bus.on('system:change', ({ system }) => onSystem(ctx, system));
    ctx.bus.on('quantum:start', (e) => { state.warp.silent = true; api.quantumFx(true, 1, e?.dir || null); state.warp.silent = false; });
    ctx.bus.on('quantum:end', () => api.quantumFx(false));
    ctx.bus.on('quantum:interdicted', () => { api.quantumFx(false); state.warp?.interdict(); });
    ctx.bus.on('jump:start', (e) => api.jumpFx('start', e || {}));
    ctx.bus.on('jump:end', (e) => api.jumpFx('stop', { ...(e || {}), fromBus: true }));
    ctx.bus.on('service:rendering', () => applyEnvironment(ctx));

    registerShots(ctx, state, api);
  },
  update(dt, ctx) {
    state.warp?.update(dt, ctx);
  },
  frame(dt, ctx) {
    const t = ctx.time.world;
    if (state.shotCam) state.shotCam(dt, ctx);
    // bake incremental pendente (troca de sistema durante o salto)
    if (state.bake.pending >= 0) { if (state.bake.step(ctx.renderer)) applyEnvironment(ctx); }
    state.dome.u.exposure.value = state.skyFade;
    state.dome.frame(ctx);
    for (const s of state.stars) s.frame(ctx, t);
    state.bh?.frame(ctx, t);
    state.far?.frame(ctx, t);
    applyFlare(ctx);
    state.warp?.frame(dt, ctx);
    state.field?.frame(dt, ctx);
    state.ring?.frame(dt, ctx);
    state.debris?.frame(dt, ctx);
    state.storms?.frame(dt, ctx);
    state.dust?.frame(dt, ctx);
    ensureFallbackLight(ctx);
    updateFallbackEnv(ctx);
  },
  dispose(ctx) {
    for (const s of state.stars) s.dispose();
    state.bh?.dispose();
    state.far?.dispose();
  },
};
