// Sistema `planets` — todos os corpos do sistema estelar atual, de qualquer
// distância e sem telas de carregamento.
//
//  • rochosos: quadtree de cube-sphere em chunks com LOD progressivo gerado
//    em Web Workers (a mesma função de altura serve colisão e pouso)
//  • texturização procedural por bioma (altitude, inclinação, máscaras de
//    rios/dunas/geleiras/lava/crateras) com detalhe 3D sem costura
//  • oceanos com ondas, espuma de arrebentação e reflexo do céu e do sol
//  • atmosfera com dispersão Rayleigh/Mie real (halo visto do espaço, céu
//    com pôr do sol visto de dentro, perspectiva aérea no relevo)
//  • nuvens volumétricas (raymarching) que a câmera atravessa
//  • gigantes gasosos com faixas em rotação diferencial e anéis
//  • ciclo dia/noite (os planetas giram — Body.rotationAt), estrelas somem
//    de dia, outros planetas no céu
//  • clima dinâmico por bioma (weather.js) emitindo 'weather'
//
// Provê ctx.services.planets (ver `api`). Emite 'atmo:enter'/'atmo:exit',
// 'weather'. Registra o chão do corpo dominante em ctx.collision.
import * as THREE from 'three/webgpu';
import { GenPool } from './genpool.js';
import { PlanetView } from './planetView.js';
import { Weather } from './weather.js';
import { registerShots } from './shots.js';
import { densityAt } from './atmoModel.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();

const st = {
  ctx: null, pool: null, views: new Map(), sysId: null, dominant: null,
  inAtmo: null, weather: null, overrideOn: false, envTimer: 0, envLast: [0, 0, 0],
  settling: false, shotCam: null, lastInfo: null,
};

function sunIntensity(sys) {
  const lum = sys.star.luminosity ?? 1;
  return 4.2 * (sys.star.type === 'black_hole' ? 0.6 : 1) * Math.min(1.6, 0.55 + lum * 0.45);
}

function buildSystem(ctx, sys) {
  for (const v of st.views.values()) v.dispose();
  st.views.clear();
  st.sysId = sys?.id ?? null;
  st.dominant = null;
  if (!sys) return;
  for (const b of sys.bodies) {
    try { st.views.set(b.id, new PlanetView(ctx, b, sys, st.pool, ctx.quality)); }
    catch (e) { ctx.errors.push(`planets: corpo ${b.name}: ${e.stack || e}`); }
  }
  st.weather?.setSystem(sys);
}

function viewOf(body) { return body ? st.views.get(body.id) : null; }

function frameInfo(ctx) {
  const sys = ctx.universe.system;
  const cam = ctx.player.camWorld;
  const r = ctx.services.rendering;
  const sun = r?.sun;
  const lit = !!sun;
  const comp = lit ? 1 - (sun.visibility ?? 1) : 1;
  const h = ctx.canvas?.clientHeight || innerHeight || 720;
  const K = h / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
  return { cam, dominant: sys.dominantBody(cam), sunI: sunIntensity(sys), comp, lit, K };
}

function update(ctx, dt) {
  const sys = ctx.universe.system;
  if (!sys) return;
  if (sys.id !== st.sysId) buildSystem(ctx, sys);
  const t = ctx.time.world;
  const info = frameInfo(ctx);
  st.lastInfo = info;
  st.dominant = info.dominant;
  for (const v of st.views.values()) v.frame(ctx, t, info);
  st.pool.pump(!!ctx.shot);
  afterViews(ctx, info, dt);
}

/** Estado do jogador, eventos de atmosfera, céu/IBL/estrelas, clima. */
function afterViews(ctx, info, dt) {
  const dom = info.dominant;
  const v = viewOf(dom);
  const p = ctx.player;
  p.bodyId = dom ? dom.id : null;
  let alt = Infinity, inside = 0;
  if (v) {
    const dir = _v.copy(v.camLocal).normalize();
    alt = v.camLocal.length() - (dom.radius + Math.max(v.heightAt(dir), v.terrain?.hasSea ? 0 : -1e9));
    if (v.A) inside = THREE.MathUtils.clamp((v.A.top - v.camLocal.length()) / (v.A.top - v.A.R) * 4, 0, 1);
  }
  p.altitude = alt;
  // eventos atmo:enter / atmo:exit
  const inAtmo = v?.A && v.camLocal.length() < v.A.top ? dom.id : null;
  if (inAtmo !== st.inAtmo) {
    if (st.inAtmo) ctx.bus.emit('atmo:exit', { body: ctx.universe.system.body(st.inAtmo) });
    if (inAtmo) ctx.bus.emit('atmo:enter', { body: dom });
    st.inAtmo = inAtmo;
  }
  // estrelas somem sob céu claro
  const space = ctx.services.space;
  if (v?.A) {
    const lum = 0.2126 * v.zen[0] + 0.7152 * v.zen[1] + 0.0722 * v.zen[2];
    const fade = Math.max(0, 1 - lum * 140) ** 2;
    space?.setSkyFade?.(1 - inside * (1 - fade));
  } else space?.setSkyFade?.(1);
  // luz do sol avermelhada pela atmosfera (pôr do sol) + céu do IBL
  const rnd = ctx.services.rendering;
  if (rnd?.sun?.setOverride) {
    if (v?.A && inside > 0) {
      const T = v.sunT, k = inside;
      _c.setRGB(...ctx.universe.system.star.color);
      _c.r *= 1 - k + k * T[0]; _c.g *= 1 - k + k * T[1]; _c.b *= 1 - k + k * T[2];
      rnd.sun.setOverride({ color: _c.clone() });
      st.overrideOn = true;
    } else if (st.overrideOn) { rnd.sun.setOverride(null); st.overrideOn = false; }
  }
  const env = rnd?.environment;
  if (env?.setSky) {
    st.envTimer += dt;
    if (v?.A && inside > 0) {
      const z = v.zen, d = Math.abs(z[0] - st.envLast[0]) + Math.abs(z[1] - st.envLast[1]) + Math.abs(z[2] - st.envLast[2]);
      if (st.envTimer > 2 || d > 0.02 * (z[0] + z[1] + z[2] + 0.01) * 3) {
        st.envTimer = 0; st.envLast = z.slice();
        const up = dom.dirToWorld(_w.copy(v.camLocal).normalize(), ctx.time.world, new THREE.Vector3());
        const g = v.P.lowA || v.P.sand;
        const sunUp = Math.max(0, v.sunLocal.dot(_a.copy(v.camLocal).normalize()));
        env.setSky({
          zenith: _c2.setRGB(z[0], z[1], z[2]).clone(), horizon: _c3.setRGB(v.hor[0], v.hor[1], v.hor[2]).clone(),
          ground: new THREE.Color(g.r * sunUp * 0.4 + v.hor[0] * 0.2, g.g * sunUp * 0.4 + v.hor[1] * 0.2, g.b * sunUp * 0.4 + v.hor[2] * 0.2),
          up, mix: inside,
        });
      }
    } else if (st.envLast[0] !== -1) { env.setSky(null); st.envLast = [-1, -1, -1]; }
  }
  st.weather?.frame(ctx, dt, dom, v, inside);
}

// ─── consultas ───────────────────────────────────────────────────────────
function surfaceSample(body, local, out = {}) {
  const v = viewOf(body);
  const r = local.length();
  const dir = _a.copy(local).divideScalar(r || 1);
  const T = v?.terrain;
  if (!T) { out.height = 0; out.normal = dir.clone(); out.terrain = 0; return out; }
  const s = T.sample(dir.x, dir.y, dir.z, {});
  out.terrain = s.h; out.m = s.m; out.s = s.s; out.q = s.q;
  out.height = s.h;
  return out;
}

/** Normal local por diferenças finitas (eps em metros). */
function normalAtLocal(v, dir, eps, out = new THREE.Vector3()) {
  const T = v.terrain, R = v.body.radius;
  const ref = Math.abs(dir.y) < 0.9 ? _b.set(0, 1, 0) : _b.set(1, 0, 0);
  const t1 = _n.crossVectors(dir, ref).normalize();
  const t2 = new THREE.Vector3().crossVectors(dir, t1);
  const a = eps / R;
  const h0 = T.height(dir.x, dir.y, dir.z);
  const d1 = _w.copy(dir).addScaledVector(t1, a).normalize();
  const h1 = T.height(d1.x, d1.y, d1.z);
  const d2 = _w.copy(dir).addScaledVector(t2, a).normalize();
  const h2 = T.height(d2.x, d2.y, d2.z);
  // gradiente no plano tangente
  out.copy(dir).addScaledVector(t1, -(h1 - h0) / eps).addScaledVector(t2, -(h2 - h0) / eps).normalize();
  return out;
}

const api = {
  /** Corpo cuja SOI contém worldPos. */
  bodyAt(worldPos) { return st.ctx.universe.system?.dominantBody(worldPos) || null; },
  /** Visão (interna) de um corpo. */
  view(body) { return viewOf(typeof body === 'string' ? st.ctx.universe.system.body(body) : body); },
  /** Altura do terreno (m, relativa ao raio) numa direção LOCAL unitária. */
  heightAtLocal(body, dirLocal) {
    const v = viewOf(body); if (!v?.terrain) return 0;
    const l = dirLocal.length() || 1;
    return v.terrain.height(dirLocal.x / l, dirLocal.y / l, dirLocal.z / l);
  },
  /**
   * Superfície sob worldPos: { body, altitude (m acima do chão/mar), height
   * (terreno, m), normal (mundo), biome, underwater, seaLevel, local }.
   */
  surfaceAt(worldPos, out = {}) {
    const ctx = st.ctx, body = api.bodyAt(worldPos);
    out.body = body;
    if (!body) { out.altitude = Infinity; out.height = 0; out.normal = (out.normal || new THREE.Vector3()).set(0, 1, 0); out.biome = null; out.underwater = false; return out; }
    const t = ctx.time.world, v = viewOf(body);
    const local = body.worldToLocal(worldPos, t, out.local || new THREE.Vector3());
    out.local = local;
    const r = local.length();
    const dir = _v.copy(local).divideScalar(r || 1);
    const h = v?.terrain ? v.terrain.height(dir.x, dir.y, dir.z) : 0;
    const sea = v?.terrain?.hasSea ? 0 : null;
    out.height = h;
    out.seaLevel = sea;
    out.underwater = sea !== null && r < body.radius + sea;
    out.altitude = r - body.radius - Math.max(h, sea ?? -Infinity);
    const nl = v?.terrain && r - body.radius - h < 3000 ? normalAtLocal(v, dir.clone(), Math.max(0.5, Math.min(8, (r - body.radius - h) * 0.05 + 0.5))) : dir.clone();
    out.normal = body.dirToWorld(nl, t, out.normal || new THREE.Vector3());
    out.biome = body.type;
    return out;
  },
  /** Ponto da superfície no referencial local: direção + deslocamento ao longo da vertical. */
  placeOnSurface(body, dirLocal, offset = 0, out = new THREE.Vector3()) {
    const d = _v.copy(dirLocal).normalize();
    const h = api.heightAtLocal(body, d);
    const v = viewOf(body);
    const ground = v?.terrain?.hasSea ? Math.max(h, 0) : h;
    return out.copy(d).multiplyScalar(body.radius + ground + offset);
  },
  /** Normal local do terreno numa direção. */
  normalAtLocal(body, dirLocal, eps = 2, out = new THREE.Vector3()) {
    const v = viewOf(body); if (!v?.terrain) return out.copy(dirLocal).normalize();
    return normalAtLocal(v, _v.copy(dirLocal).normalize().clone(), eps, out);
  },
  /**
   * Procura um lugar plano e seco perto de nearLocalDir (espiral). Retorna
   * { dir, local, normal, height, slope } no referencial local, ou null.
   */
  findLandingSpot(body, nearLocalDir, { maxSlope = 0.12, radius = 6000, samples = 160 } = {}) {
    const v = viewOf(body); if (!v?.terrain) return null;
    const d0 = _v.copy(nearLocalDir).normalize().clone();
    const ref = Math.abs(d0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(d0, ref).normalize(), t2 = new THREE.Vector3().crossVectors(d0, t1);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < samples; i++) {
      const rr = radius * Math.sqrt(i / samples), a = i * 2.39996;
      const d = d0.clone().addScaledVector(t1, Math.cos(a) * rr / body.radius).addScaledVector(t2, Math.sin(a) * rr / body.radius).normalize();
      const h = v.terrain.height(d.x, d.y, d.z);
      if (v.terrain.hasSea && h < 1.5) continue;
      const n = normalAtLocal(v, d, 6);
      const slope = 1 - n.dot(d);
      // também checa a área ao redor (nave de ~25 m)
      if (slope > maxSlope) continue;
      const score = slope * 4000 + rr * 0.05;
      if (score < bestScore) { bestScore = score; best = { dir: d, normal: n, height: h, slope }; }
      if (slope < maxSlope * 0.25 && i > 12) break;
    }
    if (best) best.local = best.dir.clone().multiplyScalar(body.radius + best.height);
    return best;
  },
  /** Atmosfera em worldPos: { density (1 = nível do mar), inAtmo, body, top, altitude }. */
  atmosphereAt(worldPos) {
    const body = api.bodyAt(worldPos); const v = viewOf(body);
    if (!v?.A) return { density: 0, inAtmo: false, body, top: 0, altitude: Infinity };
    const r = worldPos.distanceTo(body.pos);
    return { density: r < v.A.top ? densityAt(v.A, r) : 0, inAtmo: r < v.A.top, body, top: v.A.top - body.radius, altitude: r - body.radius };
  },
  /** Clima em worldPos: { kind, intensity, visibility (m), wind (mundo, m/s) }. */
  weatherAt(worldPos) { return st.weather ? st.weather.at(worldPos) : { kind: 'clear', intensity: 0, visibility: Infinity, wind: new THREE.Vector3() }; },
  /** Elevação do sol (rad) vista de worldPos sobre o corpo dominante. */
  sunElevation(worldPos) {
    const body = api.bodyAt(worldPos); if (!body) return Math.PI / 2;
    const up = _v.copy(worldPos).sub(body.pos).normalize();
    const s = _w.copy(st.ctx.universe.system.star.pos).sub(worldPos).normalize();
    return Math.asin(THREE.MathUtils.clamp(up.dot(s), -1, 1));
  },
  /** Direção local na superfície onde o sol está a `elevDeg` agora (para cenas). */
  dirForSun(body, elevDeg, azimuthDeg = 0, t = st.ctx.time.world) {
    const sunW = _v.copy(st.ctx.universe.system.star.pos).sub(body.pos).normalize();
    const sunL = body.dirToLocal(sunW, t, new THREE.Vector3());
    const tilt = body.axialTilt || 0;
    const axis = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0).normalize();
    // grande círculo que passa pelo ponto subsolar, girado pelo azimute
    const perp = new THREE.Vector3().crossVectors(sunL, axis).normalize();
    perp.applyAxisAngle(sunL, THREE.MathUtils.degToRad(azimuthDeg));
    const ang = THREE.MathUtils.degToRad(90 - elevDeg);
    return sunL.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
  },
  /** Força o LOD a convergir agora (screenshots / após teleporte). */
  settle(maxIter = 40) {
    const ctx = st.ctx;
    for (let i = 0; i < maxIter; i++) {
      update(ctx, 0);
      st.pool.pump(true);
      let busy = st.pool.pending > 0;
      if (!busy) { update(ctx, 0); if (st.pool.pending === 0) break; }
    }
  },
  /** Estatísticas (debug/performance). */
  stats() {
    const out = {};
    for (const v of st.views.values()) if (v.tree) out[v.body.name] = { ...v.tree.stats };
    return out;
  },
  get weather() { return st.weather; },
  get dominant() { return st.dominant; },
};

export default {
  name: 'planets',
  order: 15,
  async init(ctx) {
    st.ctx = ctx;
    const workers = ctx.shot ? 0 : Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    st.pool = new GenPool({ workers, budgetMs: 4 });
    st.weather = new Weather(ctx, api);
    buildSystem(ctx, ctx.universe.system);
    ctx.bus.on('system:change', ({ system }) => { buildSystem(ctx, system); });
    // chão do corpo dominante para colisão (pé, pouso, raycast de projéteis)
    ctx.collision.addGround((world, out) => {
      const body = api.bodyAt(world); const v = viewOf(body);
      if (!v?.terrain) return null;
      const t = ctx.time.world;
      const local = body.worldToLocal(world, t, _q.__l || (_q.__l = new THREE.Vector3()));
      const r = local.length();
      const dir = new THREE.Vector3().copy(local).divideScalar(r || 1);
      const h = v.terrain.height(dir.x, dir.y, dir.z);
      out.height = r - body.radius - h;
      const nl = out.height < 400 ? normalAtLocal(v, dir, Math.max(0.4, Math.min(6, out.height * 0.05 + 0.4))) : dir;
      body.dirToWorld(nl, t, out.normal);
      out.material = body.type + (v.terrain.hasSea && h < 0 ? ':submerso' : '');
      return out;
    });
    ctx.provide('planets', api);
    registerShots(ctx, api, st);
    // gera as raízes de todos os corpos já (nunca começa sem planeta)
    update(ctx, 0);
    st.pool.pump(true);
  },
  frame(dt, ctx) {
    if (st.shotCam) st.shotCam(ctx);
    update(ctx, dt);
  },
  dispose() { for (const v of st.views.values()) v.dispose(); st.pool?.dispose(); },
};

export { api as planetsApi };
