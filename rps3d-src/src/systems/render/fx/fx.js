// Gerenciador de efeitos (serviço "fx"): pools de partículas/destroços/
// feixes na GPU, trilhas em fita, clarões de cano, luzes pontuais de
// explosão e as "receitas" (explosão em camadas, impacto por superfície...).
//
// Referenciais: o conjunto padrão vive num "anchor" filho de ctx.root (a
// origem flutuante o desloca junto com o resto do mundo). Com {parent}
// (ex.: frame girante de um planeta) é criado sob demanda um conjunto de
// pools filho daquele objeto — a explosão acompanha o planeta.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { ParticlePool, KIND } from './particles.js';
import { DebrisPool } from './debris.js';
import { BeamPool } from './beams.js';
import { Ribbon } from './ribbons.js';
import { MuzzlePool } from './muzzle.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

import { rand as R, seedFx } from './rng.js';
export { seedFx };
const rnd = (a = 0, b = 1) => a + R() * (b - a);
/** Direção aleatória uniforme na esfera. */
function randDir(out = new THREE.Vector3()) {
  const u = R() * 2 - 1;
  const t = R() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}
/** Direção aleatória num cone em torno de n (ângulo em rad). */
function coneDir(n, angle, out = new THREE.Vector3()) {
  const z = 1 - R() * (1 - Math.cos(angle));
  const t = R() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  // base ortonormal em torno de n
  const a = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(n, a).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return out.copy(n).multiplyScalar(z).addScaledVector(u, s * Math.cos(t)).addScaledVector(v, s * Math.sin(t));
}

/** Cores/parametrizações de impacto por superfície. */
const SURF = {
  metal: { spark: 0xffb050, sparks: 16, dust: 0x3a3836, dustN: 2, glow: 0xffa040 },
  rock: { spark: 0xffa050, sparks: 5, dust: 0x6e6256, dustN: 5, chips: 0x5a5048 },
  dirt: { spark: 0xff9040, sparks: 0, dust: 0x5a4632, dustN: 6, chips: 0x3a2c20 },
  sand: { spark: 0xff9040, sparks: 0, dust: 0xb59a70, dustN: 7, chips: 0x9a8058 },
  ice: { spark: 0xcfe8ff, sparks: 0, dust: 0xdde8f0, dustN: 4, shards: 0xd8f0ff },
  water: { spark: 0xffffff, sparks: 0, dust: 0xcad6de, dustN: 3, drops: 0xcfe6ff },
  flesh: { spark: 0xff3020, sparks: 0, dust: 0x4a0a08, dustN: 4, drops: 0x7a1010 },
  shield: { spark: 0x7ac8ff, sparks: 12, ring: 0x60b0ff, glow: 0x80c0ff },
  energy: { spark: 0xc080ff, sparks: 10, ring: 0xb070ff, glow: 0xd0a0ff },
};

export class FX {
  constructor(ctx, U) {
    this.ctx = ctx;
    this.U = U;
    this.time = uniform(0);
    this.t = 0;
    this.anchor = new THREE.Object3D();
    this.anchor.name = 'fx-anchor';
    ctx.root.add(this.anchor);
    this.sets = new Map();
    this.max = ctx.quality.p.particlesMax || 20000;
    this.ribbons = new Set();
    this.lightCount = ctx.quality.name === 'mobile' ? 1 : 3;
    this.lights = [];
    for (let i = 0; i < this.lightCount; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 100, 2);
      l.userData = { t0: -1e9, life: 1, peak: 0 };
      this.anchor.add(l);
      this.lights.push(l);
    }
    this.muzzles = new MuzzlePool(this, 12);
    this.onHeat = null; // (posWorld, radius, life, strength, parent) — ligado pelo index.js
    this.defaultSet = this.getSet(this.anchor);
    this.api = this.makeApi();
  }

  /** Conjunto de pools para um referencial. */
  getSet(parent) {
    let s = this.sets.get(parent);
    if (s) return s;
    const main = parent === this.anchor;
    const shared = {
      time: this.time,
      camRight: uniform(new THREE.Vector3(1, 0, 0)),
      camUp: uniform(new THREE.Vector3(0, 1, 0)),
      camPos: uniform(new THREE.Vector3()),
      sunDirView: uniform(new THREE.Vector3(0, 0, 1)),
      sunColor: uniform(new THREE.Color(1, 1, 1)),
      ambient: uniform(new THREE.Color(0.05, 0.05, 0.06)),
      up: uniform(new THREE.Vector3(0, 1, 0)),
    };
    const frac = main ? 1 : 0.3;
    const cap = Math.max(512, Math.floor(this.max * frac));
    s = {
      parent,
      shared,
      add: new ParticlePool(shared, Math.floor(cap * 0.6), 'add'),
      smoke: new ParticlePool(shared, Math.floor(cap * 0.4), 'alpha'),
      debris: new DebrisPool(shared, Math.max(64, Math.min(1024, Math.floor(cap * 0.02)))),
      beams: main ? new BeamPool(shared, 160) : null,
    };
    parent.add(s.smoke.mesh, s.add.mesh, s.debris.mesh);
    if (s.beams) parent.add(s.beams.mesh);
    this.sets.set(parent, s);
    return s;
  }

  /** Recria pools com novo limite (preset), preservando o que está vivo. */
  setMax(max) {
    if (max === this.max && this.sets.size) return;
    this.max = max;
    const old = [...this.sets.values()];
    this.sets.clear();
    for (const s of old) {
      const n = this.getSet(s.parent);
      for (const k of ['add', 'smoke', 'debris', 'beams']) {
        if (!s[k]) continue;
        if (n[k]) {
          // copia o início de cada atributo (ordem no buffer circular não importa)
          const cnt = Math.min(s[k].capacity, n[k].capacity) * 4;
          s[k].attrs.forEach((a, i) => n[k].attrs[i].array.set(a.array.subarray(0, cnt)));
          n[k].cursor = Math.min(s[k].cursor, n[k].capacity - 1);
          n[k].attrs.forEach((a) => (a.needsUpdate = true));
          if ('lastEnd' in s[k]) n[k].lastEnd = s[k].lastEnd;
        }
        s[k].mesh.removeFromParent();
        s[k].dispose();
      }
    }
    if (!this.sets.has(this.anchor)) this.getSet(this.anchor);
    this.defaultSet = this.sets.get(this.anchor);
  }

  /** Converte pos (cena) para o referencial do conjunto. */
  toLocal(set, pos, out = new THREE.Vector3()) {
    out.copy(pos);
    if (set.parent === this.anchor) {
      // pos é local da cena (ctx.root não tem transformação) → anchor
      return out.sub(this.anchor.position);
    }
    return set.parent.worldToLocal(out);
  }
  dirToLocal(set, dir, out = new THREE.Vector3()) {
    out.copy(dir);
    if (set.parent === this.anchor) return out;
    _m.copy(set.parent.matrixWorld).invert();
    return out.transformDirection(_m);
  }

  frame(dt) {
    const ctx = this.ctx;
    // fixedStep: cenários de captura avançam o tempo do fx em passo fixo
    if (!ctx.paused) this.t += this.fixedStep || dt;
    this.time.value = this.t;
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    const camPos = _w.setFromMatrixPosition(cam.matrixWorld);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const sun = ctx.sun;
    const sunDir = _n.subVectors(sun.position, sun.target.position).normalize();
    const sunView = sunDir.clone().transformDirection(cam.matrixWorldInverse);
    const sunI = Math.min(3, sun.intensity / 3);
    for (const s of this.sets.values()) {
      const S = s.shared;
      if (s.parent !== this.anchor && !s.parent.parent) continue; // referencial removido
      s.parent.updateWorldMatrix(true, false);
      _m.copy(s.parent.matrixWorld).invert();
      S.camPos.value.copy(camPos).applyMatrix4(_m);
      S.camRight.value.copy(right).transformDirection(_m);
      S.camUp.value.copy(up).transformDirection(_m);
      S.sunDirView.value.copy(sunView);
      S.sunColor.value.copy(sun.color).multiplyScalar(sunI);
      const amb = ctx.ambient;
      S.ambient.value.copy(amb ? amb.color : _c.set(0.05, 0.05, 0.06)).multiplyScalar(amb ? amb.intensity * 1.2 + 0.03 : 1);
      if (s.parent !== this.anchor) S.up.value.copy(S.camPos.value).normalize();
      s.add.flush();
      s.smoke.flush();
      s.debris.flush();
      s.beams?.flush();
    }
    // recentra o anchor se derivou muito (precisão de float32)
    const ap = this.anchor.position;
    if (ap.lengthSq() > 2e5 * 2e5) this.recenter();
    // trilhas
    const camLocal = this.anchor.worldToLocal(camPos.clone());
    for (const r of this.ribbons) {
      r.update(dt, this.t, camLocal);
      if (r._missile && r.following && this.t - (r._lastPuff || 0) > 0.035) {
        r._lastPuff = this.t;
        const p0 = r.pts[0]?.p;
        if (p0) this.smokeAt(this.defaultSet, p0, { count: 1, scale: r.width * 1.2, life: 2.6, color: 0x8a8682, alpha: 0.5, local: true });
      }
      if (!r.alive) {
        r.dispose();
        this.ribbons.delete(r);
      }
    }
    // luzes de explosão
    for (const l of this.lights) {
      const u = l.userData;
      const age = this.t - u.t0;
      if (age < 0 || age > u.life) {
        l.intensity = 0;
        continue;
      }
      const k = age / u.life;
      l.intensity = u.peak * Math.min(1, age * 40) * Math.pow(1 - k, 2.2) * (0.9 + 0.1 * Math.sin(age * 60));
      _c.setHSL(0.07 - k * 0.04, 1, 0.6 - k * 0.2);
      l.color.copy(u.color).lerp(_c, k * 0.6);
    }
    this.muzzles.update(dt);
  }

  recenter() {
    const ap = this.anchor.position.clone();
    const s = this.defaultSet;
    s.add.translate(ap.x, ap.y, ap.z);
    s.smoke.translate(ap.x, ap.y, ap.z);
    s.debris.translate(ap.x, ap.y, ap.z);
    s.beams?.translate(ap.x, ap.y, ap.z);
    for (const r of this.ribbons) r.translate(ap.x, ap.y, ap.z);
    for (const l of this.lights) l.position.add(ap);
    this.anchor.position.set(0, 0, 0);
  }

  flashLight(set, pLocal, color, peak, range, life, delay = 0) {
    if (set.parent !== this.anchor || !this.lights.length) return;
    // usa a luz mais antiga
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.t0 + l.userData.life < best.userData.t0 + best.userData.life) best = l;
    best.position.copy(pLocal);
    best.distance = range;
    best.userData = { t0: this.t + delay, life, peak, color: new THREE.Color(color) };
    best.color.set(color);
  }

  // ─── receitas ──────────────────────────────────────────────────────

  smokeAt(set, pLocal, o = {}) {
    const n = o.count ?? 6;
    const sc = o.scale ?? 1;
    const col = new THREE.Color(o.color ?? 0x55524e);
    for (let i = 0; i < n; i++) {
      const d = randDir(_v).multiplyScalar(rnd(0.2, 1) * sc * (o.spread ?? 0.6));
      const v = o.vel ? o.vel.clone().add(randDir(new THREE.Vector3()).multiplyScalar(sc * 0.3)) : randDir(new THREE.Vector3()).multiplyScalar(sc * rnd(0.2, 0.8));
      set.smoke.emit(pLocal.x + d.x, pLocal.y + d.y, pLocal.z + d.z, v.x, v.y, v.z, {
        t0: this.t + (o.delay ?? 0) + rnd(0, o.stagger ?? 0),
        life: (o.life ?? 3) * rnd(0.7, 1.3),
        s0: sc * rnd(0.6, 1.0),
        s1: sc * rnd(2.0, 3.2) * (o.grow ?? 1),
        drag: o.drag ?? 1.2,
        kind: KIND.SMOKE,
        r: col.r,
        g: col.g,
        b: col.b,
        a: (o.alpha ?? 0.7) * rnd(0.7, 1),
        buoy: o.rise ?? 0.3,
        spin: rnd(-0.4, 0.4),
      });
    }
  }

  explosion(pos, o = {}) {
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    const s = o.scale ?? 6;
    const q = Math.max(0.35, Math.min(1.5, this.max / 30000));
    const tint = new THREE.Color(o.color ?? 0xffffff);
    const t0 = this.t - (o.startAge ?? 0);
    const N = (n) => Math.max(1, Math.round(n * q));
    const emit = (pool, p, v, opt) => pool.emit(p.x, p.y, p.z, v.x, v.y, v.z, opt);
    const zero = new THREE.Vector3();
    const pp = new THREE.Vector3();
    const vv = new THREE.Vector3();

    // 1) clarão: brilho + estrela
    emit(set.add, P, zero, { t0, life: 0.2, s0: s * 3, s1: s * 5, kind: KIND.GLOW, r: 1, g: 0.85, b: 0.6, a: 12 });
    emit(set.add, P, zero, { t0, life: 0.3, s0: s * 8, s1: s * 11, kind: KIND.STAR, r: 1, g: 0.9, b: 0.75, a: 8, seed: R() });
    emit(set.add, P, zero, { t0, life: 0.7, s0: s * 2.5, s1: s * 4, kind: KIND.GLOW, r: 1, g: 0.45, b: 0.15, a: 1.2 });

    // 2) bola de fogo: núcleo grande + lóbulos
    emit(set.smoke, P, zero, { t0, life: 2.2, s0: s * 1.2, s1: s * 3.0, drag: 1, kind: KIND.FIRE, r: tint.r, g: tint.g, b: tint.b, a: 0.85, spin: rnd(-0.6, 0.6) });
    for (let i = 0, n = N(30); i < n; i++) {
      const d = randDir(_v);
      pp.copy(P).addScaledVector(d, s * rnd(0.1, 0.5));
      vv.copy(d).multiplyScalar(s * rnd(1.2, 3.6));
      emit(set.smoke, pp, vv, { t0: t0 + rnd(0, 0.1), life: rnd(1.4, 2.6), s0: s * rnd(0.45, 0.8), s1: s * rnd(1.2, 2.1), drag: 2.4, kind: KIND.FIRE, r: tint.r, g: tint.g, b: tint.b, a: rnd(0.7, 0.95), spin: rnd(-1, 1) });
    }
    // 3) fumaça (aparece quando o fogo apaga)
    const smokeCol = new THREE.Color(o.smokeColor ?? 0x4a4642);
    for (let i = 0, n = N(26); i < n; i++) {
      const d = randDir(_v);
      pp.copy(P).addScaledVector(d, s * rnd(0.2, 0.8));
      vv.copy(d).multiplyScalar(s * rnd(0.6, 2.4));
      emit(set.smoke, pp, vv, { t0: t0 + rnd(0.12, 0.45), life: rnd(4, 7.5), s0: s * rnd(0.8, 1.3), s1: s * rnd(2.6, 4.2), drag: 1.1, kind: KIND.SMOKE, r: smokeCol.r, g: smokeCol.g, b: smokeCol.b, a: rnd(0.55, 0.85), buoy: o.parent ? s * 0.05 : 0, spin: rnd(-0.3, 0.3) });
    }
    // 4) faíscas
    for (let i = 0, n = N(110); i < n; i++) {
      const d = randDir(_v);
      vv.copy(d).multiplyScalar(s * rnd(5, 26));
      emit(set.add, P, vv, { t0: t0 + rnd(0, 0.05), life: rnd(0.5, 1.8), s0: s * 0.05, s1: s * 0.03, drag: rnd(0.6, 1.6), kind: KIND.SPARK, r: 1, g: 0.75, b: 0.45, a: rnd(0.8, 1), stretch: 0.045 });
    }
    // brasas lentas
    for (let i = 0, n = N(40); i < n; i++) {
      const d = randDir(_v);
      vv.copy(d).multiplyScalar(s * rnd(1, 6));
      emit(set.add, P, vv, { t0: t0 + rnd(0.05, 0.3), life: rnd(1.5, 3.5), s0: s * 0.05, s1: s * 0.025, drag: 0.8, kind: KIND.GLOW, r: 1, g: 0.45, b: 0.12, a: 2.5 });
    }
    // 5) onda de choque (2 anéis)
    emit(set.add, P, zero, { t0, life: 0.6, s0: s * 0.5, s1: s * 13, kind: KIND.RING, r: 0.75, g: 0.85, b: 1, a: 2.2, seed: R() });
    emit(set.add, P, zero, { t0: t0 + 0.03, life: 0.5, s0: s * 0.5, s1: s * 6, kind: KIND.RING, r: 1, g: 0.6, b: 0.3, a: 0.9, seed: R() });
    // 6) destroços com rastro de fumaça e brasa
    const nd = o.debris === false ? 0 : N(o.debris ?? 16);
    for (let i = 0; i < nd; i++) {
      const d = randDir(new THREE.Vector3());
      const v = d.clone().multiplyScalar(s * rnd(2.5, 9));
      const life = rnd(4, 7);
      const drag = 0.25;
      set.debris.emit(P, v, { t0, life, size: s * rnd(0.035, 0.11), drag, spin: rnd(1, 6), heat: rnd(0.5, 0.85) });
      // rastro agendado ao longo da trajetória analítica
      const trailN = Math.round(rnd(22, 36) * q);
      for (let k = 0; k < trailN; k++) {
        const age = 0.03 + k * 0.04;
        DebrisPool.at(P, v, drag, age, pp);
        const f = 1 - k / trailN;
        emit(set.smoke, pp, zero, { t0: t0 + age, life: rnd(1.2, 2.2), s0: s * 0.06, s1: s * 0.5, drag: 1, kind: KIND.SMOKE, r: 0.16, g: 0.155, b: 0.15, a: 0.22 * f, buoy: 0, spin: rnd(-1, 1) });
        if (k < trailN * 0.5) emit(set.add, pp, zero, { t0: t0 + age, life: 0.3, s0: s * 0.08, s1: s * 0.03, kind: KIND.GLOW, r: 1, g: 0.5, b: 0.15, a: 3 * f });
      }
    }
    // 7) explosões secundárias
    const sec = o.secondary ?? 3;
    for (let i = 0; i < sec; i++) {
      const d = randDir(new THREE.Vector3()).multiplyScalar(s * rnd(0.8, 1.6));
      const dt = rnd(0.15, 0.6);
      const sp = P.clone().add(d);
      const ss = s * rnd(0.3, 0.5);
      emit(set.add, sp, zero, { t0: t0 + dt, life: 0.15, s0: ss * 3, s1: ss * 5, kind: KIND.GLOW, r: 1, g: 0.8, b: 0.5, a: 14 });
      for (let k = 0; k < N(8); k++) {
        const dd = randDir(_v);
        vv.copy(dd).multiplyScalar(ss * rnd(1, 3));
        emit(set.smoke, sp, vv, { t0: t0 + dt + rnd(0, 0.05), life: rnd(0.9, 1.6), s0: ss * 0.6, s1: ss * 1.5, drag: 2.5, kind: KIND.FIRE, r: tint.r, g: tint.g, b: tint.b, a: 1 });
      }
      for (let k = 0; k < N(20); k++) {
        vv.copy(randDir(_v)).multiplyScalar(ss * rnd(6, 18));
        emit(set.add, sp, vv, { t0: t0 + dt, life: rnd(0.4, 1), s0: ss * 0.06, s1: ss * 0.03, drag: 1, kind: KIND.SPARK, r: 1, g: 0.7, b: 0.4, a: 1, stretch: 0.04 });
      }
    }
    // luz, calor, tremor e clarão de tela por distância
    if (o.light !== false) this.flashLight(set, P, 0xffb070, 4000 * s * s, s * 50, 1.6);
    const world = set.parent === this.anchor ? P.clone().add(this.anchor.position) : set.parent.localToWorld(P.clone());
    this.onHeat?.(world, s * 2.5, 1.6, 1, o.parent || null);
    const camPos = this.ctx.camera.getWorldPosition(new THREE.Vector3());
    const dist = camPos.distanceTo(world);
    const k = Math.min(1, (s * 12) / Math.max(1, dist));
    if (o.shake !== false && k > 0.05) {
      const r = this.ctx.get('render');
      r?.shake(k * 0.8, 0.4 + k * 0.6);
      r?.flash(0xffd0a0, k * 0.6);
    }
  }

  sparks(pos, normal, o = {}) {
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    const n = normal ? this.dirToLocal(set, normal, new THREE.Vector3()).normalize() : new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color(o.color ?? 0xffb060);
    const count = o.count ?? 24;
    const sp = o.speed ?? 14;
    const size = o.size ?? 0.05;
    for (let i = 0; i < count; i++) {
      const d = coneDir(n, o.cone ?? 1.1, _v);
      const v = d.multiplyScalar(sp * rnd(0.3, 1.2));
      set.add.emit(P.x, P.y, P.z, v.x, v.y, v.z, { t0: this.t, life: rnd(0.25, 0.8), s0: size, s1: size * 0.5, drag: rnd(1, 3), kind: KIND.SPARK, r: c.r, g: c.g, b: c.b, a: 1, stretch: 0.04, buoy: o.gravity ?? 0 });
    }
    set.add.emit(P.x, P.y, P.z, 0, 0, 0, { t0: this.t, life: 0.12, s0: size * 18, s1: size * 26, kind: KIND.GLOW, r: c.r, g: c.g, b: c.b, a: 5 });
  }

  muzzle(object3d, o = {}) {
    const c = new THREE.Color(o.color ?? 0xffa040);
    const scale = o.scale ?? 1;
    this.muzzles.fire(object3d, { color: c, scale, offset: o.offset, life: o.life ?? 0.055 });
    // brilho + algumas faíscas para a frente
    object3d.updateWorldMatrix(true, false);
    const pw = (o.offset ? o.offset.clone() : new THREE.Vector3()).applyMatrix4(object3d.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(object3d.matrixWorld);
    const set = this.defaultSet;
    const P = this.toLocal(set, pw);
    set.add.emit(P.x, P.y, P.z, 0, 0, 0, { t0: this.t, life: 0.08, s0: scale * 1.6, s1: scale * 2.2, kind: KIND.GLOW, r: c.r, g: c.g, b: c.b, a: 8 });
    for (let i = 0; i < 6; i++) {
      const v = coneDir(fwd, 0.35, _v).multiplyScalar(rnd(10, 30) * scale);
      set.add.emit(P.x, P.y, P.z, v.x, v.y, v.z, { t0: this.t, life: rnd(0.08, 0.2), s0: 0.03 * scale, s1: 0.01 * scale, drag: 4, kind: KIND.SPARK, r: c.r, g: c.g, b: c.b, a: 1, stretch: 0.03 });
    }
    if (o.light !== false) this.flashLight(set, P, c.getHex(), 300 * scale, 25 * scale, 0.07);
  }

  smoke(pos, o = {}) {
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    this.smokeAt(set, P, o);
  }

  debris(pos, vel, o = {}) {
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    const V = vel ? this.dirToLocal(set, vel, new THREE.Vector3()) : new THREE.Vector3();
    const n = o.count ?? 8;
    const size = o.size ?? 0.4;
    for (let i = 0; i < n; i++) {
      const v = V.clone().add(randDir(_v).multiplyScalar(rnd(1, 6) * (o.spread ?? 1)));
      set.debris.emit(P, v, { t0: this.t, life: o.life ?? rnd(4, 8), size: size * rnd(0.5, 1.5), drag: o.drag ?? 0.2, spin: rnd(1, 5), heat: o.heat ?? 0.6 });
    }
  }

  beam(from, to, o = {}) {
    const set = this.defaultSet;
    const a = this.toLocal(set, from);
    const b = this.toLocal(set, to, new THREE.Vector3());
    const c = new THREE.Color(o.color ?? 0xff3030);
    const life = o.life ?? 0.12;
    set.beams.emit(a, b, { t0: this.t, life, r: c.r, g: c.g, b: c.b, width: o.width ?? 0.25 });
    // brilho na origem e no impacto
    set.add.emit(a.x, a.y, a.z, 0, 0, 0, { t0: this.t, life: life * 1.2, s0: (o.width ?? 0.25) * 8, s1: (o.width ?? 0.25) * 10, kind: KIND.GLOW, r: c.r, g: c.g, b: c.b, a: 6 });
    if (o.hit !== false) set.add.emit(b.x, b.y, b.z, 0, 0, 0, { t0: this.t, life: life * 1.5, s0: (o.width ?? 0.25) * 10, s1: (o.width ?? 0.25) * 14, kind: KIND.GLOW, r: c.r, g: c.g, b: c.b, a: 5 });
  }

  trail(object3d, o = {}) {
    const r = new Ribbon(this, object3d, o);
    r._missile = r.kind === 'missile';
    this.ribbons.add(r);
    return {
      ribbon: r,
      dispose: () => {
        r.following = false; // termina e some quando os pontos envelhecerem
      },
      setIntensity: (v) => {
        r.intensity.value = v;
      },
      setColor: (c) => r.color.value.set(c),
    };
  }

  heat(pos, radius = 4, life = 2, strength = 1) {
    this.onHeat?.(pos.clone(), radius, life, strength, null);
  }

  shockwave(pos, o = {}) {
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    const c = new THREE.Color(o.color ?? 0xa0c8ff);
    const s = o.scale ?? 10;
    set.add.emit(P.x, P.y, P.z, 0, 0, 0, { t0: this.t, life: o.life ?? 0.7, s0: s * 0.1, s1: s, kind: KIND.RING, r: c.r, g: c.g, b: c.b, a: o.intensity ?? 3 });
  }

  fire(pos, o = {}) {
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    const s = o.scale ?? 1;
    const life = o.life ?? 3;
    const rate = (o.rate ?? 30) * Math.max(0.4, Math.min(1, this.max / 30000));
    const n = Math.round(life * rate);
    const up = set.shared.up.value;
    for (let i = 0; i < n; i++) {
      const t0 = this.t + (i / rate) * rnd(0.9, 1.1);
      const d = randDir(_v).multiplyScalar(s * 0.35);
      const vu = s * rnd(1.2, 2.2);
      // línguas de fogo: sobem e encolhem/esfriam
      set.smoke.emit(P.x + d.x, P.y + d.y * 0.3, P.z + d.z, up.x * vu, up.y * vu, up.z * vu, { t0, life: rnd(0.55, 0.95), s0: s * rnd(0.9, 1.3), s1: s * rnd(0.5, 0.8), drag: 0.6, kind: KIND.FIRE, r: 1, g: 1, b: 1, a: rnd(0.75, 0.95), buoy: s * 2.5, spin: rnd(-1.5, 1.5) });
      // fumaça escura acima
      if (i % 2 === 0) set.smoke.emit(P.x + d.x, P.y + s * 1.2, P.z + d.z, up.x * s * 1.5, up.y * s * 1.5, up.z * s * 1.5, { t0: t0 + 0.25, life: rnd(2.5, 4), s0: s * 0.8, s1: s * 3.2, drag: 0.4, kind: KIND.SMOKE, r: 0.14, g: 0.13, b: 0.12, a: 0.55, buoy: s * 0.5, spin: rnd(-0.4, 0.4) });
      // brasas
      if (i % 5 === 0) set.add.emit(P.x, P.y + s * 0.5, P.z, (R() - 0.5) * s * 2 + up.x * s * 3, up.y * s * 3, (R() - 0.5) * s * 2 + up.z * s * 3, { t0, life: rnd(0.8, 1.6), s0: s * 0.05, s1: s * 0.02, drag: 0.5, kind: KIND.GLOW, r: 1, g: 0.5, b: 0.12, a: 4, buoy: s * 1.5 });
    }
  }

  impact(pos, normal, surface = 'metal', o = {}) {
    const S = SURF[surface] || SURF.metal;
    const set = o.parent ? this.getSet(o.parent) : this.defaultSet;
    const P = this.toLocal(set, pos);
    const n = normal ? this.dirToLocal(set, normal, new THREE.Vector3()).normalize() : new THREE.Vector3(0, 1, 0);
    const sc = o.scale ?? 1;
    const t0 = this.t;
    if (S.sparks) {
      const c = new THREE.Color(S.spark);
      for (let i = 0; i < S.sparks; i++) {
        const v = coneDir(n, 1.2, _v).multiplyScalar(rnd(4, 16) * sc);
        set.add.emit(P.x, P.y, P.z, v.x, v.y, v.z, { t0, life: rnd(0.2, 0.6), s0: 0.04 * sc, s1: 0.02 * sc, drag: 2, kind: KIND.SPARK, r: c.r, g: c.g, b: c.b, a: 1, stretch: 0.04, buoy: -9.8 * (o.gravity ?? 0) });
      }
    }
    if (S.glow) {
      const c = new THREE.Color(S.glow);
      set.add.emit(P.x, P.y, P.z, 0, 0, 0, { t0, life: 0.1, s0: 0.8 * sc, s1: 1.2 * sc, kind: KIND.GLOW, r: c.r, g: c.g, b: c.b, a: 6 });
    }
    if (S.ring) {
      const c = new THREE.Color(S.ring);
      set.add.emit(P.x, P.y, P.z, 0, 0, 0, { t0, life: 0.35, s0: 0.2 * sc, s1: 2.5 * sc, kind: KIND.RING, r: c.r, g: c.g, b: c.b, a: 4 });
      set.add.emit(P.x, P.y, P.z, 0, 0, 0, { t0, life: 0.2, s0: 1.4 * sc, s1: 2.4 * sc, kind: KIND.STAR, r: c.r, g: c.g, b: c.b, a: 5 });
    }
    if (S.dustN) {
      const c = new THREE.Color(S.dust);
      for (let i = 0; i < S.dustN; i++) {
        const v = coneDir(n, 0.8, _v).multiplyScalar(rnd(1, 4) * sc);
        set.smoke.emit(P.x, P.y, P.z, v.x, v.y, v.z, { t0: t0 + rnd(0, 0.05), life: rnd(0.8, 2), s0: 0.25 * sc, s1: rnd(0.9, 1.6) * sc, drag: 3, kind: KIND.SMOKE, r: c.r, g: c.g, b: c.b, a: 0.65 });
      }
    }
    const chip = S.chips ?? S.shards ?? S.drops;
    if (chip) {
      const c = new THREE.Color(chip);
      const bright = S.shards ? 2.5 : S.drops ? 1.4 : 0.5;
      for (let i = 0; i < 12; i++) {
        const v = coneDir(n, 0.9, _v).multiplyScalar(rnd(3, 9) * sc);
        set.add.emit(P.x, P.y, P.z, v.x, v.y, v.z, { t0, life: rnd(0.3, 0.8), s0: 0.04 * sc, s1: 0.03 * sc, drag: 1, kind: KIND.DROP, r: c.r, g: c.g, b: c.b, a: bright, stretch: 0.03, buoy: -9.8 });
      }
    }
  }

  stats() {
    let alive = 0;
    let max = 0;
    for (const s of this.sets.values()) {
      alive += s.add.alive(this.t) + s.smoke.alive(this.t);
      max += s.add.capacity + s.smoke.capacity;
    }
    return { alive, max, ribbons: this.ribbons.size };
  }

  makeApi() {
    return {
      explosion: (pos, o) => this.explosion(pos, o),
      sparks: (pos, normal, o) => this.sparks(pos, normal, o),
      muzzle: (obj, o) => this.muzzle(obj, o),
      smoke: (pos, o) => this.smoke(pos, o),
      debris: (pos, vel, o) => this.debris(pos, vel, o),
      beam: (from, to, o) => this.beam(from, to, o),
      trail: (obj, o) => this.trail(obj, o),
      heat: (pos, radius, life, strength) => this.heat(pos, radius, life, strength),
      impact: (pos, normal, surface, o) => this.impact(pos, normal, surface, o),
      fire: (pos, o) => this.fire(pos, o),
      shockwave: (pos, o) => this.shockwave(pos, o),
      stats: () => this.stats(),
      get time() {
        return this._fx.t;
      },
      _fx: this,
    };
  }
}
