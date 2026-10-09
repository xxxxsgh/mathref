// Instância de nave: monta as malhas a partir da planta (geometria em cache
// compartilhada entre naves iguais), anima trem de pouso, propulsores,
// luzes, peças giratórias (Vigilantes) e torres (capitais); recebe dano.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { Parts, cutBox } from './geo.js';
import { FACTION_STYLES, CLASS_INFO, MODEL_NAMES, PAINTS } from './factions.js';
import { makeHullMaterial, setHullPalette, makeLightsMaterial, makeCanopyMaterial, makeEngineCoreMaterial, makePlumeMaterial } from './materials.js';
import { buildFighter, buildInterceptor } from './bpSmall.js';
import { buildFreighter, buildExplorer, buildFrigate } from './bpLarge.js';
import { buildVigilant } from './vigilant.js';
import { buildCapital } from './capital.js';
import { Rng } from '../../core/Rng.js';
import { decalGeometry, decalMaterial } from './decals.js';
import { mergeGeometries } from './geo.js';

const BUILDERS = { fighter: buildFighter, interceptor: buildInterceptor, freighter: buildFreighter, explorer: buildExplorer, frigate: buildFrigate };
const PANEL = { fighter: 1.5, interceptor: 1.6, freighter: 2.4, explorer: 2.2, frigate: 3.2, destroyer: 6, carrier: 7 };

const geoCache = new Map();
const matCache = new Map();
let shared = null;

function sharedMats(lite) {
  if (!shared) shared = { lights: makeLightsMaterial(), canopy: new Map(), lite };
  return shared;
}
export function hullMaterial(faction, classId, lite = false) {
  const key = `${faction}:${PANEL[classId] || 2}:${lite ? 1 : 0}`;
  if (!matCache.has(key)) {
    const st = FACTION_STYLES[faction];
    matCache.set(key, makeHullMaterial(st, { panel: PANEL[classId] || 2, lite, iridescent: st.iridescence > 0, fine: (PANEL[classId] || 2) >= 3 }));
  }
  return matCache.get(key);
}
function canopyMaterial(faction, lite) {
  const S = sharedMats(lite);
  if (!S.canopy.has(faction)) S.canopy.set(faction, makeCanopyMaterial(FACTION_STYLES[faction].canopy, lite));
  return S.canopy.get(faction);
}

function mergeParts(P) {
  return { hull: Parts.merge(P.hull), detail: Parts.merge(P.detail), glass: Parts.merge(P.glass), lights: Parts.merge(P.lights) };
}

/** Planta (geometria + metadados) em cache por classe × facção × semente. */
export function blueprint(classId, faction, seed = 1, opts = {}) {
  const key = `${classId}:${faction}:${seed}:${opts.modules ? JSON.stringify(opts.modules) : ''}:${opts.cockpitCut ? 1 : 0}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const style = FACTION_STYLES[faction] || FACTION_STYLES.hegemonia;
  const rng = new Rng(`${classId}/${faction}/${seed}`);
  const bp = { seed, parts: new Parts(seed * 7 + 3), thrusters: [], hardpoints: [], gear: [], colliders: [], spinners: [], turrets: [], hangars: [], interiorAnchor: null, eye: null, classId, faction, modules: opts.modules || {} };
  if (faction === 'vigilantes') buildVigilant(bp, style, rng, classId);
  else if (classId === 'destroyer' || classId === 'carrier') buildCapital(bp, style, rng, classId, faction);
  else (BUILDERS[classId] || buildFighter)(bp, style, rng, faction);
  if (opts.cockpitCut && bp.canopy) {
    // abre o dorso do casco sob o canopy (o interior do cockpit entra no buraco)
    const c = bp.canopy;
    const box = { min: new THREE.Vector3(-c.w * 0.97, c.y - 0.22, c.z0 + 0.05), max: new THREE.Vector3(c.w * 0.97, c.y + c.h + 0.5, c.z1 - 0.05) };
    bp.parts.hull = bp.parts.hull.map((g) => (g.userData.cut ? cutBox(g, box) : g));
  }
  // decalques (insígnia + matrícula): pontos da planta ou padrão pelo casco
  let decals = null;
  if (faction !== 'vigilantes') {
    let spots = bp.decalSpots;
    if (!spots && bp.hullLoft) {
      const Lh = bp.hullLoft, S0 = Lh.stations[0].z, S1 = Lh.stations[Lh.stations.length - 1].z, len = S1 - S0;
      const ze = S0 + len * 0.42, zi = S0 + len * 0.2;
      const pe = Lh.params(ze), pi = Lh.params(zi);
      const se = Math.min(pe.h, pe.hb) * 0.95, si = Math.min(pi.h, pi.hb) * 0.6;
      spots = [];
      for (const sd of [1, -1]) {
        const qe = Lh.at(ze, sd > 0 ? 0.05 : Math.PI - 0.05); spots.push({ pos: qe.pos, normal: qe.normal, w: se, h: se, kind: 'emblem' });
        const qi = Lh.at(zi, sd > 0 ? 0.05 : Math.PI - 0.05); spots.push({ pos: qi.pos, normal: qi.normal, w: si * 4, h: si, kind: 'id' });
      }
    }
    if (spots?.length) {
      const k = Math.floor(rng.next() * 6);
      decals = mergeGeometries(spots.map((d) => decalGeometry(d.pos, d.normal, d.w, d.h, d.kind, k, d.up)));
      decals.computeBoundingSphere();
    }
  }
  const out = {
    ...bp,
    decals,
    geos: mergeParts(bp.parts),
    gear: bp.gear.map((g) => ({ ...g, geos: mergeParts(g.parts), doorList: g.doorList.map((d) => ({ ...d, geos: mergeParts(d.parts) })) })),
    spinners: bp.spinners.map((s) => ({ ...s, geos: mergeParts(s.parts) })),
    turrets: bp.turrets.map((t) => ({ ...t, geos: mergeParts(t.parts), barrelGeos: t.barrel ? mergeParts(t.barrel) : null })),
  };
  delete out.parts;
  // caixa e raio reais
  const bb = out.geos.hull.boundingBox.clone();
  if (out.geos.detail) bb.union(out.geos.detail.boundingBox);
  out.box = bb;
  out.radius = bb.getBoundingSphere(new THREE.Sphere()).radius;
  out.length = bb.max.z - bb.min.z;
  geoCache.set(key, out);
  return out;
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class ShipInstance {
  /**
   * opts: { seed, paint (id de PAINTS ou paleta), gear (0..1), throttle,
   * lite (materiais simples), modules, name, shadows }
   */
  constructor(ctx, classId, faction, opts = {}) {
    this.ctx = ctx;
    this.classId = CLASS_INFO[classId] ? classId : 'fighter';
    this.faction = FACTION_STYLES[faction] ? faction : 'hegemonia';
    this.style = FACTION_STYLES[this.faction];
    this.model = MODEL_NAMES[this.faction]?.[this.classId] || this.classId;
    this.label = `${this.model} — ${CLASS_INFO[this.classId].label}`;
    const lite = opts.lite ?? ctx.quality?.name === 'mobile';
    this.lite = lite;
    const bp = blueprint(this.classId, this.faction, opts.seed ?? 1, opts);
    this.bp = bp;
    this.group = new THREE.Group();
    this.group.name = `nave:${this.faction}:${this.classId}`;
    this.group.userData.ship = this;
    this.U = { throttle: uniform(opts.throttle ?? 0.35), boost: uniform(0), plumeGain: uniform(1) };
    this.hull = hullMaterial(this.faction, this.classId, lite);
    if (opts.paint) this.setPaint(opts.paint);
    const S = sharedMats(lite);
    const shadows = opts.shadows ?? true;
    const mk = (geo, mat, cast = true) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast && shadows; m.receiveShadow = shadows;
      return m;
    };
    this.meshes = {
      hull: mk(bp.geos.hull, this.hull),
      detail: mk(bp.geos.detail, this.hull),
      glass: mk(bp.geos.glass, canopyMaterial(this.faction, lite)),
      lights: mk(bp.geos.lights, S.lights, false),
    };
    if (bp.decals && !opts.noDecals) {
      const dm = new THREE.Mesh(bp.decals, decalMaterial(this.faction, this.style.wear * 0.7));
      dm.renderOrder = 1; dm.receiveShadow = shadows;
      this.meshes.decals = dm;
    }
    for (const k in this.meshes) if (this.meshes[k]) this.group.add(this.meshes[k]);

    // propulsores: núcleo + pluma
    this.coreMat = makeEngineCoreMaterial(this.style.engine, this.U);
    this.plumeMat = makePlumeMaterial(this.style.engine, this.U);
    this.thrusters = bp.thrusters.map((t) => {
      const core = new THREE.Mesh(new THREE.CircleGeometry(t.core, 24), this.coreMat);
      core.position.set(t.pos.x, t.pos.y, t.coreZ ?? t.pos.z);
      core.rotation.y = 0; // círculo olha para +Z (para trás)
      this.group.add(core);
      const pg = plumeGeometry();
      const plume = new THREE.Mesh(pg, this.plumeMat);
      plume.position.copy(t.pos);
      plume.scale.set(t.r, t.r, t.len);
      plume.renderOrder = 5;
      plume.frustumCulled = false;
      this.group.add(plume);
      return { ...t, core, plume, posLocal: t.pos.clone(), dirLocal: t.dir.clone() };
    });

    // trem de pouso
    this.gearT = opts.gear ?? 0; this.gearTarget = this.gearT;
    this.gear = bp.gear.map((g) => {
      const pivot = new THREE.Group(); pivot.position.copy(g.pivot);
      const leg = new THREE.Group(); pivot.add(leg);
      for (const k of ['hull', 'detail']) if (g.geos[k]) leg.add(mk(g.geos[k], this.hull));
      if (g.geos.lights) leg.add(mk(g.geos.lights, S.lights, false));
      this.group.add(pivot);
      const doors = g.doorList.map((d) => {
        const dp = new THREE.Group(); dp.position.copy(d.pivot);
        if (d.geos.hull) dp.add(mk(d.geos.hull, this.hull));
        this.group.add(dp);
        return { ...d, obj: dp };
      });
      return { ...g, pivotObj: pivot, leg, doors };
    });

    // peças giratórias / flutuantes (Vigilantes)
    this.spinners = bp.spinners.map((s) => {
      const o = new THREE.Group(); o.position.copy(s.pivot);
      if (s.geos.hull) o.add(mk(s.geos.hull, this.hull));
      if (s.geos.detail) o.add(mk(s.geos.detail, this.hull));
      if (s.geos.lights) o.add(mk(s.geos.lights, S.lights, false));
      if (s.geos.glass) o.add(mk(s.geos.glass, canopyMaterial(this.faction, lite)));
      this.group.add(o);
      return { ...s, obj: o, phase: Math.random() * 10 };
    });

    // torres (capitais) — destrutíveis/separáveis
    this.turrets = bp.turrets.map((t, i) => {
      const base = new THREE.Group();
      base.position.copy(t.pos);
      base.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.up);
      const yaw = new THREE.Group(); base.add(yaw);
      for (const k of ['hull', 'detail']) if (t.geos[k]) yaw.add(mk(t.geos[k], this.hull));
      if (t.geos.lights) yaw.add(mk(t.geos.lights, S.lights, false));
      const pitch = new THREE.Group(); pitch.position.copy(t.barrelPivot || new THREE.Vector3(0, t.size * 0.5, 0)); yaw.add(pitch);
      if (t.barrelGeos) for (const k of ['hull', 'detail']) if (t.barrelGeos[k]) pitch.add(mk(t.barrelGeos[k], this.hull));
      this.group.add(base);
      const self = this;
      const tur = {
        id: `torre${i}`, index: i, kind: t.kind, size: t.size, base, yaw, pitch, alive: true, health: 1,
        posLocal: t.pos.clone(), up: t.up.clone(), yawA: (Math.random() - 0.5) * 2, pitchA: 0.25, yawT: null, pitchT: null,
        /** Aponta para uma direção no espaço local da nave. */
        aimLocal(dir) { const d = _v.copy(dir).applyQuaternion(_q.copy(base.quaternion).invert()); tur.yawT = Math.atan2(-d.x, -d.z); tur.pitchT = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
        /** Solta a torre (destruída): vira objeto independente com velocidade. */
        detach(vel = null) { return self.detachTurret(tur, vel); },
        muzzleLocal(out = new THREE.Vector3()) { pitch.updateWorldMatrix(true, false); out.set(0, 0, -t.size * 1.6); pitch.localToWorld(out); return self.group.worldToLocal(out); },
      };
      return tur;
    });
    this.hangars = bp.hangars.map((h) => ({ ...h }));
    this.hardpoints = bp.hardpoints.map((h) => ({ ...h, pos: h.pos.clone(), dir: h.dir.clone() }));
    this.colliders = bp.colliders.map((c) => ({ center: c.center.clone(), half: c.half.clone() }));
    this.radius = bp.radius; this.length = bp.length;
    this.eye = bp.eye ? bp.eye.clone() : null;
    this.gearHeight = bp.gearHeight || 0;
    this.damageLevel = 0; this.hitIdx = 0; this.debris = [];
    this.lightsOn = true;
    this.applyGear(true);
    this.alive = true;
    this.t = Math.random() * 100;
  }

  /** Acelerador 0..1 (plumas e núcleos). */
  setThrottle(v) { this.U.throttle.value = Math.max(0, Math.min(1.2, v)); }
  setBoost(v) { this.U.boost.value = Math.max(0, Math.min(1, v)); }
  /** Trem: true/false ou 0..1. instant = sem animação. */
  setGear(v, instant = false) { this.gearTarget = typeof v === 'boolean' ? (v ? 1 : 0) : v; if (instant) { this.gearT = this.gearTarget; this.applyGear(true); } }
  setLights(on) { this.lightsOn = on; if (this.meshes.lights) this.meshes.lights.visible = on; }
  /** Mostra/esconde tudo do lado de fora (casco, trem, torres…) exceto `keep` (o interior). */
  setExterior(on, keep = null) {
    if (this._extOn === on) return;
    this._extOn = on;
    for (const c of this.group.children) if (c !== keep) c.visible = on;
    if (on) { if (this.meshes.lights) this.meshes.lights.visible = this.lightsOn; this.applyGear(true); }
  }
  /** Decalques (insígnia/matrícula) visíveis ou não (customização). */
  setDecals(on) { if (this.meshes.decals) this.meshes.decals.visible = !!on; }
  /** Pintura: id de PAINTS ou {primary, secondary, trim...}. */
  setPaint(p) {
    const pal = typeof p === 'string' ? PAINTS[p] : p;
    if (!pal) return;
    this._ownMaterial();
    setHullPalette(this.hull, pal);
  }
  _ownMaterial() {
    if (this.hull.userData.own) return;
    const mat = makeHullMaterial(this.style, { panel: PANEL[this.classId] || 2, lite: this.lite, iridescent: this.style.iridescence > 0, fine: (PANEL[this.classId] || 2) >= 3 });
    mat.userData.own = true;
    const old = this.hull;
    this.hull = mat;
    this.group?.traverse((o) => { if (o.isMesh && o.material === old) o.material = mat; });
  }

  /**
   * Dano visual: amount (pontos ~ 0..100 por golpe forte), posLocal opcional
   * (espaço da nave) para marca de queimadura + faíscas.
   */
  damage(amount = 10, posLocal = null) {
    this._ownMaterial();
    const U = this.hull.userData.U;
    this.damageLevel = Math.min(1, this.damageLevel + amount / 220);
    U.damage.value = this.damageLevel;
    if (posLocal) {
      const h = U.hits.array ? U.hits.array[this.hitIdx % 4] : U.hits.value[this.hitIdx % 4];
      if (h) h.set(posLocal.x, posLocal.y, posLocal.z, Math.min(this.radius * 0.4, 0.6 + amount * 0.06));
      this.hitIdx++;
      const r = this.ctx.services.rendering;
      if (r?.particles) {
        this.group.updateWorldMatrix(true, false);
        const wp = this.group.localToWorld(posLocal.clone()).add(this.ctx.world.origin);
        r.particles.sparks(wp, null, Math.min(40, 8 + amount), { speed: 25 });
      }
    }
    return this.damageLevel;
  }
  repair() { if (this.hull.userData.own) { const U = this.hull.userData.U; U.damage.value = 0; (U.hits.array || U.hits.value).forEach((h) => h.set(0, 0, 0, 0)); } this.damageLevel = 0; }

  detachTurret(tur, vel = null) {
    if (!tur.alive) return null;
    tur.alive = false;
    this.group.updateWorldMatrix(true, true);
    const wpos = new THREE.Vector3(), wq = new THREE.Quaternion();
    tur.base.getWorldPosition(wpos); tur.base.getWorldQuaternion(wq);
    const worldPos = wpos.add(this.ctx.world.origin);
    tur.base.removeFromParent();
    const obj = tur.base;
    obj.quaternion.copy(wq);
    const v = vel ? vel.clone() : tur.up.clone().applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(8 + Math.random() * 10);
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2);
    const entry = this.ctx.world.add(obj, worldPos.clone());
    const d = { obj, pos: worldPos, vel: v, spin, entry, life: 60 };
    this.debris.push(d);
    this.ctx.services.rendering?.explosion?.(worldPos.clone(), tur.size * 3, 'small');
    return d;
  }

  applyGear(force = false) {
    const t = this.gearT;
    for (const g of this.gear) {
      const legT = smooth(0.22, 1.0, t);
      const a = g.stow * (1 - legT);
      g.pivotObj.rotation.x = a;
      g.pivotObj.visible = t > 0.02 && this._extOn !== false;
      for (const d of g.doors) {
        const open = smooth(0.0, 0.3, t);
        d.obj.rotation.z = d.open * open;
      }
    }
  }

  /** Atualização visual (chamada pelo sistema a cada frame). */
  frame(dt, camDist) {
    this.t += dt;
    if (Math.abs(this.gearT - this.gearTarget) > 1e-4) {
      this.gearT += Math.sign(this.gearTarget - this.gearT) * Math.min(Math.abs(this.gearTarget - this.gearT), dt / 2.4);
      this.applyGear();
    }
    // LOD barato: greebles e trem somem longe
    const far = camDist > this.radius * 45;
    // (com o casco escondido — jogador no interior — nada do exterior volta a aparecer)
    const ext = this._extOn !== false;
    if (this.meshes.detail) this.meshes.detail.visible = !far && ext;
    // plumas: comprimento ∝ acelerador
    const thr = this.U.throttle.value + this.U.boost.value * 0.6;
    for (const th of this.thrusters) {
      th.plume.scale.z = th.len * (0.25 + thr * 0.9);
      th.plume.visible = thr > 0.02 && ext;
    }
    for (const s of this.spinners) {
      s.obj.rotation[s.axis || 'z'] += (s.speed || 0) * dt;
      if (s.bob) s.obj.position.y = s.pivot.y + Math.sin(this.t * 0.8 + s.phase) * s.bob;
    }
    for (const tur of this.turrets) {
      if (!tur.alive) continue;
      if (tur.yawT === null) { tur.yawT = Math.sin(this.t * 0.07 + tur.index) * 1.2; tur.pitchT = 0.2 + Math.sin(this.t * 0.11 + tur.index * 2) * 0.2; }
      tur.yawA += (tur.yawT - tur.yawA) * Math.min(1, dt * 1.5);
      tur.pitchA += (tur.pitchT - tur.pitchA) * Math.min(1, dt * 1.5);
      tur.yaw.rotation.y = tur.yawA; tur.pitch.rotation.x = tur.pitchA;
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.pos.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt; d.obj.rotation.y += d.spin.y * dt; d.obj.rotation.z += d.spin.z * dt;
      d.life -= dt;
      if (d.life <= 0) { d.entry.remove(); this.debris.splice(i, 1); }
    }
  }

  /** Posição de mundo de um ponto local (ex.: hardpoint) — usa a pose atual do grupo. */
  localToWorld(local, out = new THREE.Vector3()) {
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(out.copy(local)).add(this.ctx.world.origin);
  }

  dispose() {
    this.alive = false;
    this.group.removeFromParent();
    for (const d of this.debris) d.entry.remove();
    this.coreMat.dispose(); this.plumeMat.dispose();
    if (this.hull.userData.own) this.hull.dispose();
    for (const t of this.thrusters) t.core.geometry.dispose();
  }
}

let _plumeGeo = null;
function plumeGeometry() {
  if (_plumeGeo) return _plumeGeo;
  // cone aberto: base (r=1) em z=0, ponta (r≈0.15) em z=1; uv.y 0 no bocal
  const g = new THREE.CylinderGeometry(1, 0.15, 1, 20, 6, true);
  g.translate(0, -0.5, 0);
  g.rotateX(-Math.PI / 2); // ponta vai para +Z (atrás da nave)
  // CylinderGeometry: uv.y = 1 no topo (r=1) → bocal; inverte
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  _plumeGeo = g;
  return g;
}
