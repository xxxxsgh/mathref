/**
 * Receitas de efeitos: impactos por material, clarão de boca (1ª e 3ª
 * pessoa), traçantes, cápsulas, sangue, explosões. Só compõe chamadas aos
 * sistemas (partículas GPU, decalques, corpos rígidos, luzes) — nenhum
 * objeto é criado por tiro.
 */
import * as THREE from 'three';
import { PT } from './atlas.js';

const C = (r, g, b) => new THREE.Color(r, g, b); // linear

/** Perfis por material (cores LINEARES). */
export const MATERIALS = {
  concrete: { dust: C(0.46, 0.44, 0.4), chip: C(0.3, 0.29, 0.27), decal: 'concrete', size: 0.2, dustAmt: 1, chunks: 4, sparks: 2, chipCount: 10 },
  brick: { dust: C(0.44, 0.27, 0.19), chip: C(0.3, 0.1, 0.06), decal: 'brick', size: 0.2, dustAmt: 1, chunks: 4, sparks: 1, chipCount: 10 },
  asphalt: { dust: C(0.3, 0.29, 0.27), chip: C(0.06, 0.06, 0.06), decal: 'asphalt', size: 0.16, dustAmt: 0.8, chunks: 3, sparks: 3, chipCount: 9 },
  metal: { dust: C(0.22, 0.22, 0.22), chip: C(0.3, 0.3, 0.3), decal: 'metal', size: 0.13, dustAmt: 0.25, chunks: 0, sparks: 18, chipCount: 0 },
  wood: { dust: C(0.42, 0.32, 0.2), chip: C(0.5, 0.36, 0.2), decal: 'wood', size: 0.18, dustAmt: 0.6, chunks: 5, sparks: 0, chipCount: 8, splinter: true },
  dirt: { dust: C(0.3, 0.23, 0.16), chip: C(0.07, 0.05, 0.035), decal: 'dirt', size: 0.24, dustAmt: 1.3, chunks: 2, sparks: 0, chipCount: 16, plume: true },
  glass: { dust: C(0.6, 0.62, 0.64), chip: C(0.75, 0.82, 0.85), decal: 'glass', size: 0.3, dustAmt: 0.35, chunks: 6, sparks: 0, chipCount: 6, glints: true },
  plastic: { dust: C(0.4, 0.4, 0.4), chip: C(0.5, 0.5, 0.5), decal: 'plastic', size: 0.12, dustAmt: 0.3, chunks: 2, sparks: 0, chipCount: 4 },
  rubber: { dust: C(0.15, 0.15, 0.15), chip: C(0.05, 0.05, 0.05), decal: 'rubber', size: 0.12, dustAmt: 0.3, chunks: 0, sparks: 0, chipCount: 4 },
  flesh: { blood: true },
};
MATERIALS.default = MATERIALS.concrete;

/** Penetração: espessura máxima atravessável (m) a potência 1. */
export const PENETRATION = { wood: 0.45, plastic: 0.35, rubber: 0.3, glass: 0.08, dirt: 0.0, metal: 0.03, concrete: 0.1, brick: 0.1, asphalt: 0, flesh: 0.9 };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

export class Effects {
  constructor(ctx, sys) {
    this.ctx = ctx;
    this.ps = sys.particles; // mundo
    this.vps = sys.vmParticles; // viewmodel
    this.decals = sys.decals;
    this.brass = sys.brass;
    this.debris = sys.debris;
    this.lights = sys.lights; // [{ light, t0, life, peak }]
    this.vmLight = sys.vmLight;
    this.rng = ctx.rng.fork ? ctx.rng.fork(0x7f4a) : ctx.rng;
    this.budget = ctx.quality.particleBudget ?? 1;
    this.shake = { amp: 0, t: 0 };
    this.heldFlash = [];
  }

  R(a, b) {
    return a + (b - a) * this.rng.next();
  }
  n(count) {
    // quantidade escalada pelo orçamento de qualidade (com arredondamento estocástico)
    const f = count * this.budget;
    return Math.floor(f) + (this.rng.next() < f - Math.floor(f) ? 1 : 0);
  }
  /** Direção aleatória num cone em torno de `axis` (ângulo em rad). */
  cone(axis, angle, out = _v) {
    const u = this.rng.next(), w = this.rng.next();
    const cosA = 1 - u * (1 - Math.cos(angle));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const phi = w * Math.PI * 2;
    _t.set(1, 0, 0);
    if (Math.abs(axis.x) > 0.9) _t.set(0, 1, 0);
    _t.addScaledVector(axis, -axis.dot(_t)).normalize();
    _b.crossVectors(axis, _t);
    return out.copy(axis).multiplyScalar(cosA).addScaledVector(_t, Math.cos(phi) * sinA).addScaledVector(_b, Math.sin(phi) * sinA);
  }

  /** Iluminação no ponto: { sun 0..1, sky 0..1 } via raios na colisão. */
  envAt(p, n = _up) {
    const col = this.ctx.collision;
    const sunDir = this.sunDir;
    _p.copy(p).addScaledVector(n, 0.08);
    let sun = 1, sky = 1;
    if (col && sunDir) {
      const h = col.raycast(_p, sunDir, 120, { filter: (c) => !c.dynamic });
      if (h) sun = 0;
      const u = col.raycast(_p, _up, 40, { filter: (c) => !c.dynamic });
      if (u) sky = 0.6;
    }
    return { sun, sky };
  }
  plane(p, n) {
    return [n.x, n.y, n.z, n.x * p.x + n.y * p.y + n.z * p.z];
  }

  flashLight(pos, color, peak, life, range = 10) {
    // a luz menos intensa (ou mais velha) do pool é reaproveitada
    const now = this.ctx.time.now;
    let best = this.lights[0], bestV = Infinity;
    for (const l of this.lights) {
      const x = (now - l.t0) / l.life;
      const v = x >= 1 ? -1 : l.peak * (1 - x) * (1 - x);
      if (v < bestV) { bestV = v; best = l; }
    }
    best.light.position.copy(pos);
    best.light.color.copy(color);
    best.light.distance = range;
    best.t0 = now;
    best.life = life;
    best.peak = peak;
    best.hold = false;
    return best;
  }

  addShake(amount, duration = 0.5) {
    const sh = this.shake;
    const left = sh.dur ? Math.max(0, 1 - sh.t / sh.dur) : 0;
    sh.amp = Math.min(1.5, sh.amp * left + amount);
    sh.t = 0;
    sh.dur = duration;
  }

  // ─── impactos ───────────────────────────────────────────────────────────
  /**
   * point/normal: superfície. material: chave de MATERIALS.
   * o: { dir (direção do projétil), scale, exit (saída de penetração), decal=true, collider }
   */
  impact(point, normal, material = 'concrete', o = {}) {
    const M = MATERIALS[material] || MATERIALS.default;
    const ps = this.ps;
    const n = _d.copy(normal).normalize().clone();
    const dir = o.dir ? o.dir.clone().normalize() : n.clone().negate();
    const scale = o.scale ?? 1;
    if (M.blood) return this.blood(point, n, dir, o);
    const env = this.envAt(point, n);
    const lit = env.sun;
    const shade = env.sky;
    const plane = this.plane(point, n);
    // o jorro sai entre a normal e a reflexão do projétil
    const refl = dir.clone().addScaledVector(n, -2 * dir.dot(n)).normalize();
    const out = o.exit ? dir.clone() : n.clone().lerp(refl, 0.35).normalize();
    const dust = _col.copy(M.dust).multiplyScalar(shade).clone();

    // clarão minúsculo do impacto (todo material duro dá uma piscada)
    if (material !== 'dirt') {
      ps.emit(point.clone().addScaledVector(n, 0.03), null, {
        life: 0.05, size: 0.12 * scale, size1: 0.2 * scale, tile: PT.GLOW, additive: true,
        emissive: material === 'metal' ? 9 : 2.5, color: C(1, 0.55, 0.2), rot: this.R(0, 6.3),
      });
      if (material === 'metal') {
        ps.emit(point.clone().addScaledVector(n, 0.02), null, {
          life: 0.045, size: 0.3 * scale, tile: PT.STAR[0], additive: true, emissive: 6, color: C(1, 0.6, 0.25), rot: this.R(0, 6.3),
        });
      }
    }

    // jato: baforadas esticadas, muito rápidas, que freiam em ~0,2 s
    const jets = this.n(2 * M.dustAmt) + 1;
    for (let i = 0; i < jets; i++) {
      const v = this.cone(out, 0.25).multiplyScalar(this.R(7, 12) * scale);
      ps.emit(point.clone().addScaledVector(n, 0.03), v, {
        life: this.R(0.3, 0.45), drag: 9, gravity: 0, size: 0.07 * scale, size1: this.R(0.25, 0.4) * scale, mode: 1, stretch: 0.05,
        color: dust, alpha: 0.85, tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: lit, plane,
      });
    }
    // núcleo de poeira: denso, abre rápido
    const core = this.n(4 * M.dustAmt) + 1;
    for (let i = 0; i < core; i++) {
      const v = this.cone(out, 0.5).multiplyScalar(this.R(1.5, 4.5) * scale);
      ps.emit(point.clone().addScaledVector(n, 0.05), v, {
        life: this.R(0.7, 1.2), drag: 5, gravity: -0.02, size: 0.18 * scale, size1: this.R(0.6, 0.9) * scale,
        rot: this.R(0, 6.3), spin: this.R(-1.2, 1.2), color: dust, alpha: 0.85, tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: lit, plane, fadeIn: 0.03,
      });
    }
    // nuvem que fica pairando
    const linger = this.n(3 * M.dustAmt);
    for (let i = 0; i < linger; i++) {
      const v = this.cone(n, 0.9).multiplyScalar(this.R(0.4, 1.2) * scale);
      ps.emit(point.clone().addScaledVector(n, 0.15), v, {
        life: this.R(2, 3.2), drag: 1.6, gravity: -0.015, size: 0.2 * scale, size1: this.R(1.1, 1.7) * scale,
        rot: this.R(0, 6.3), spin: this.R(-0.4, 0.4), color: dust, alpha: 0.3, tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: lit, plane, fadeIn: 0.1,
      });
    }
    // poeira fina em fiapos (esticada pela velocidade)
    if (M.dustAmt > 0.5) {
      const wisps = this.n(3);
      for (let i = 0; i < wisps; i++) {
        const v = this.cone(out, 0.6).multiplyScalar(this.R(3, 7) * scale);
        ps.emit(point.clone(), v, {
          life: this.R(0.35, 0.6), drag: 5, gravity: 0.1, size: 0.08 * scale, size1: 0.25 * scale, mode: 1, stretch: 0.05,
          color: dust, alpha: 0.55, tile: PT.DUST, sunlit: lit, plane,
        });
      }
    }
    // lascas (sprites) com gravidade
    const chips = this.n(M.chipCount * scale);
    for (let i = 0; i < chips; i++) {
      const v = this.cone(out, 0.7).multiplyScalar(this.R(2.5, 9));
      ps.emit(point.clone().addScaledVector(n, 0.02), v, {
        life: this.R(0.4, 0.9), drag: 0.6, gravity: 1, size: this.R(0.012, 0.03), mode: 1, stretch: 0.006,
        color: _col.copy(M.chip).multiplyScalar(shade * this.R(0.6, 1.2)).clone(), alpha: 1, tile: PT.CHIP, sunlit: lit,
      });
    }
    // terra: pluma alta e escura que cai de volta
    if (M.plume) {
      const k = this.n(6) + 2;
      for (let i = 0; i < k; i++) {
        const v = this.cone(_v2.copy(n).lerp(_up, 0.5).normalize(), 0.3).multiplyScalar(this.R(3, 7.5) * scale);
        ps.emit(point.clone(), v, {
          life: this.R(0.8, 1.4), drag: 2.2, gravity: 0.35, size: 0.08 * scale, size1: this.R(0.4, 0.7) * scale, mode: 1, stretch: 0.04,
          rot: this.R(0, 6.3), color: _col.copy(M.dust).multiplyScalar(shade * this.R(0.6, 1)).clone(), alpha: 0.85,
          tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: lit, plane,
        });
      }
    }
    // faíscas
    const sparks = this.n(M.sparks * scale);
    for (let i = 0; i < sparks; i++) {
      const v = this.cone(refl.clone().lerp(n, 0.4).normalize(), material === 'metal' ? 0.8 : 0.5).multiplyScalar(this.R(4, 13));
      ps.emit(point.clone().addScaledVector(n, 0.01), v, {
        life: this.R(0.15, material === 'metal' ? 0.6 : 0.25), drag: 1.8, gravity: 1.2, size: this.R(0.008, 0.016), mode: 1,
        stretch: 0.03, tile: PT.SPARK, additive: true, emissive: this.R(10, 22), heatPow: 1.4, color: C(1, 0.42, 0.1),
      });
    }
    // brilhos de vidro
    if (M.glints) {
      for (let i = 0, k = this.n(10); i < k; i++) {
        const v = this.cone(out, 0.9).multiplyScalar(this.R(1.5, 5));
        ps.emit(point.clone(), v, {
          life: this.R(0.3, 0.8), drag: 0.8, gravity: 1, size: this.R(0.02, 0.04), tile: PT.GLOW, additive: true,
          emissive: this.R(2, 5), heatPow: 2, color: C(0.8, 0.9, 1),
        });
      }
    }
    // detritos 3D
    const chunks = this.n(M.chunks * scale);
    for (let i = 0; i < chunks; i++) {
      const v = this.cone(out, 0.75).multiplyScalar(this.R(1.5, 4.5));
      const s = this.R(0.012, 0.035) * scale;
      this.debris.spawn(point.clone().addScaledVector(n, 0.03), v, {
        scale: M.splinter ? _v2.set(s * 0.35, s * 0.35, s * 2.6).clone() : s, life: this.R(2.5, 5), drag: 0.3, halfH: s * 0.35,
        color: _col.copy(M.chip).multiplyScalar(this.R(0.7, 1.3)).clone(),
      });
    }
    // decalque
    if (o.decal !== false && !o.collider?.dynamic) this.decals.add(point, n, M.decal, M.size * (o.exit ? 1.3 : 1) * (o.decalScale ?? 1), dir);
  }

  /** Sangue: névoa (entrada e saída), gotículas e respingo na parede atrás. */
  blood(point, n, dir, o = {}) {
    const ps = this.ps;
    const env = this.envAt(point, _up);
    const lit = env.sun;
    const shade = env.sky;
    const red = C(0.2, 0.006, 0.004).multiplyScalar(shade);
    const back = n.clone();
    for (let i = 0, k = this.n(3) + 1; i < k; i++) {
      const v = this.cone(back, 0.6).multiplyScalar(this.R(0.8, 2.5));
      ps.emit(point.clone(), v, {
        life: this.R(0.3, 0.55), drag: 6, gravity: 0.05, size: 0.06, size1: this.R(0.35, 0.55), rot: this.R(0, 6.3),
        color: red, alpha: 0.95, tile: PT.BLOOD, sunlit: lit, fadeIn: 0.03,
      });
    }
    // jorro de saída (através do corpo)
    for (let i = 0, k = this.n(4) + 1; i < k; i++) {
      const v = this.cone(dir, 0.35).multiplyScalar(this.R(2, 5));
      ps.emit(point.clone().addScaledVector(dir, 0.3), v, {
        life: this.R(0.35, 0.7), drag: 5, gravity: 0.2, size: 0.08, size1: this.R(0.45, 0.8), rot: this.R(0, 6.3),
        color: red, alpha: 0.85, tile: PT.BLOOD, sunlit: lit,
      });
      ps.emit(point.clone().addScaledVector(dir, 0.3), v.clone().multiplyScalar(0.6), {
        life: this.R(0.5, 1.0), drag: 2, gravity: 0.1, size: 0.12, size1: this.R(0.6, 1.0), rot: this.R(0, 6.3),
        color: C(0.12, 0.01, 0.008).multiplyScalar(shade), alpha: 0.3, tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: lit,
      });
    }
    // gotas
    for (let i = 0, k = this.n(14); i < k; i++) {
      const v = this.cone(i % 2 ? dir : back, 0.7).multiplyScalar(this.R(1.5, 5));
      ps.emit(point.clone(), v, {
        life: this.R(0.4, 0.8), drag: 0.8, gravity: 1, size: this.R(0.01, 0.022), mode: 1, stretch: 0.012,
        color: C(0.14, 0.004, 0.003).multiplyScalar(shade), tile: PT.CHIP, sunlit: lit,
      });
    }
    // respingo na parede/chão atrás do alvo
    const col = this.ctx.collision;
    if (col && o.decal !== false) {
      const hit = col.raycast(point.clone().addScaledVector(dir, 0.4), dir, 3.0, { filter: (c) => !c.dynamic && c.material !== 'flesh' });
      if (hit) this.decals.add(hit.point, hit.normal, 'bloodSpray', this.R(0.5, 0.85) * (1 - hit.distance / 4), dir);
    }
  }

  // ─── clarão de boca ─────────────────────────────────────────────────────
  /**
   * Clarão da arma do jogador na cena da viewmodel (muzzle = Object3D na vm).
   * worldPos: posição equivalente no mundo (para luz, fumaça e faíscas).
   */
  muzzleFlashVm(muzzle, worldPos, worldDir, ads = 0) {
    const vps = this.vps;
    muzzle.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld);
    // eixo do cano = −Z local da boca
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld);
    const s = 1 - 0.45 * ads;
    const hot = C(1, 0.5, 0.16);
    const star = PT.STAR[(this.rng.next() * 2) | 0];
    vps.emit(p.clone().addScaledVector(fwd, 0.035 * s), null, {
      life: 0.05, size: this.R(0.13, 0.18) * s, tile: star, additive: true, emissive: 9, color: hot, rot: this.R(0, 6.3),
    });
    vps.emit(p.clone().addScaledVector(fwd, 0.02), null, {
      life: 0.06, size: 0.26 * s, tile: PT.GLOW, additive: true, emissive: 0.9, color: C(1, 0.45, 0.15),
    });
    // pétalas laterais (quebra-chamas de 3–4 janelas) + língua frontal
    const petals = 3 + ((this.rng.next() * 2) | 0);
    const roll = this.R(0, 6.3);
    for (let i = 0; i < petals; i++) {
      const a = roll + (i / petals) * Math.PI * 2;
      _t.set(Math.cos(a), Math.sin(a), 0).transformDirection(muzzle.matrixWorld);
      const axis = fwd.clone().multiplyScalar(0.8).addScaledVector(_t, this.R(0.45, 0.8)).normalize();
      vps.emit(p.clone().addScaledVector(fwd, 0.005), axis, {
        life: 0.045, size: this.R(0.045, 0.06) * s, mode: 3, stretch: this.R(2.8, 4), tile: PT.PETAL[i & 1],
        additive: true, emissive: 6, color: hot,
      });
    }
    vps.emit(p.clone(), fwd, {
      life: 0.045, size: 0.07 * s, mode: 3, stretch: this.R(3, 4.5), tile: PT.PETAL[(this.rng.next() * 2) | 0], additive: true, emissive: 3.5, color: hot,
    });
    // luz na viewmodel e no mundo
    if (this.vmLight) {
      this.vmLight.light.position.copy(p).addScaledVector(fwd, 0.05);
      this.vmLight.t0 = this.ctx.time.now;
      this.vmLight.life = 0.07;
      this.vmLight.peak = 1.2;
    }
    if (worldPos) {
      this.flashLight(worldPos.clone().addScaledVector(worldDir, 0.3), C(1, 0.6, 0.3), 30, 0.07, 9);
      this.muzzleWorld(worldPos, worldDir, 1, ads);
    }
  }

  /** Fumaça e faíscas da boca no MUNDO (1ª pessoa: posição projetada). */
  muzzleWorld(p, dir, scale = 1, ads = 0) {
    const ps = this.ps;
    const env = this.envAt(p);
    for (let i = 0, k = this.n(2); i < k; i++) {
      const v = this.cone(dir, 0.35).multiplyScalar(this.R(1.2, 3)).addScaledVector(_up, 0.3);
      ps.emit(p.clone().addScaledVector(dir, 0.15), v, {
        life: this.R(0.7, 1.3), drag: 3, gravity: -0.03, size: 0.04 * scale, size1: this.R(0.3, 0.5) * scale, rot: this.R(0, 6.3),
        spin: this.R(-1, 1), color: C(0.5, 0.5, 0.5).multiplyScalar(env.sky), alpha: (0.16 - 0.08 * ads), tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: env.sun, fadeIn: 0.1,
      });
    }
    for (let i = 0, k = this.n(3); i < k; i++) {
      const v = this.cone(dir, 0.25).multiplyScalar(this.R(8, 18));
      ps.emit(p.clone(), v, {
        life: this.R(0.05, 0.12), drag: 2, gravity: 0.5, size: 0.008 * scale, mode: 1, stretch: 0.012, tile: PT.SPARK,
        additive: true, emissive: 14, heatPow: 1, color: C(1, 0.5, 0.15),
      });
    }
  }

  /** Clarão de 3ª pessoa (inimigos): estrela de frente + pétalas no eixo + luz. */
  muzzleFlashWorld(origin, dir, { hold = false } = {}) {
    const ps = this.ps;
    const life = hold ? 30 : 0.05;
    const hot = C(1, 0.5, 0.17);
    const ids = [];
    if (hold) {
      for (const i of this.heldFlash) ps.kill(i);
      this.heldFlash.length = 0;
    }
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.08), null, {
      life, size: this.R(0.45, 0.6), tile: PT.STAR[(this.rng.next() * 2) | 0], additive: true, emissive: 9, color: hot, rot: this.R(0, 6.3),
    }));
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.1), null, {
      life: life * 1.2, size: 1.5, tile: PT.GLOW, additive: true, emissive: 1.5, color: C(1, 0.45, 0.15),
    }));
    const roll = this.R(0, 6.3);
    const right = new THREE.Vector3().crossVectors(dir, _up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
    for (let i = 0; i < 4; i++) {
      const a = roll + (i / 4) * Math.PI * 2;
      const axis = dir.clone().multiplyScalar(0.85)
        .addScaledVector(right, Math.cos(a) * this.R(0.4, 0.7))
        .addScaledVector(upv, Math.sin(a) * this.R(0.4, 0.7)).normalize();
      ids.push(ps.emit(origin.clone(), axis, {
        life, size: this.R(0.13, 0.18), mode: 3, stretch: this.R(2.6, 3.6), tile: PT.PETAL[i & 1], additive: true, emissive: 7, color: hot,
      }));
    }
    ids.push(ps.emit(origin.clone(), dir.clone(), {
      life, size: 0.18, mode: 3, stretch: 4, tile: PT.PETAL[0], additive: true, emissive: 6, color: hot,
    }));
    if (hold) this.heldFlash.push(...ids);
    const l = this.flashLight(origin.clone().addScaledVector(dir, 0.3), C(1, 0.58, 0.28), 25, hold ? 30 : 0.06, 10);
    if (hold) l.hold = true;
    this.muzzleWorld(origin, dir, 1.6);
  }

  // ─── traçante ───────────────────────────────────────────────────────────
  tracer(from, to, { speed = 420, length = 4, width = 0.025, emissive = 14, color = C(1, 0.55, 0.22) } = {}) {
    const d = _v.subVectors(to, from);
    const dist = d.length();
    if (dist < 0.5) return;
    d.divideScalar(dist);
    this.ps.emit(from.clone(), d.clone().multiplyScalar(speed), {
      life: dist / speed, size: width, mode: 2, stretch: Math.min(length, dist), tile: PT.SPARK, additive: true, emissive, color,
    });
  }

  // ─── cápsula ejetada ────────────────────────────────────────────────────
  eject(pos, vel, camQuat, puff = true) {
    const spin = new THREE.Vector3(this.R(-25, 25), this.R(-40, 40), this.R(15, 35));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + this.R(-0.3, 0.3));
    if (camQuat) q.premultiply(camQuat);
    this.brass.spawn(pos, vel, { spin, life: 6, drag: 0.4, halfH: 0.0048, quat: q });
    // baforada de gás na janela de ejeção
    if (puff) this.ps.emit(pos.clone(), vel.clone().multiplyScalar(0.25), {
      life: this.R(0.4, 0.7), drag: 4, gravity: -0.04, size: 0.03, size1: 0.18, rot: this.R(0, 6.3),
      color: C(0.5, 0.5, 0.5), alpha: 0.12, tile: PT.SMOKE[(this.rng.next() * 3) | 0], fadeIn: 0.1,
    });
  }

  /** Fiapo fino de fumaça do cano quente (após rajadas). */
  barrelWisp(p, strength) {
    const v = new THREE.Vector3(this.R(-0.05, 0.05), this.R(0.25, 0.5), this.R(-0.05, 0.05));
    this.ps.emit(p.clone(), v, {
      life: this.R(1.0, 1.6), drag: 0.6, gravity: -0.04, size: 0.03, size1: this.R(0.18, 0.3), rot: this.R(0, 6.3), spin: this.R(-0.8, 0.8),
      color: C(0.55, 0.55, 0.56), alpha: 0.1 * strength, tile: PT.DUST, fadeIn: 0.15,
    });
  }

  // ─── explosão ───────────────────────────────────────────────────────────
  /**
   * Explosão de granada/ IED: bola de fogo que vira fumaça, coluna escura,
   * anel de poeira rasteiro + onda de choque, brasas, detritos, queimado,
   * clarão de luz, flash de tela e tremor de câmera por distância.
   */
  explosion(point, { radius = 6, normal = _up } = {}) {
    const ps = this.ps;
    const ctx = this.ctx;
    const n = normal.clone().normalize();
    const env = this.envAt(point, n);
    const plane = this.plane(point, n);
    const R = radius / 6;
    // a coluna sobe para fora da sombra dos prédios: acha a altura do sol
    if (!env.sun && this.sunDir) {
      for (let hgt = 3; hgt <= 30; hgt += 3) {
        _p.copy(point).addScaledVector(n, hgt);
        if (!this.ctx.collision.raycast(_p, this.sunDir, 120, { filter: (c) => !c.dynamic })) {
          env.sun = 10 + point.y + hgt;
          break;
        }
      }
    }
    // bola de fogo (calor → fumaça): núcleo denso, rolando para cima
    for (let i = 0, k = this.n(26) + 8; i < k; i++) {
      const v = this.cone(n, 1.0).multiplyScalar(this.R(2, 11) * R).addScaledVector(n, this.R(1, 4) * R);
      ps.emit(point.clone().addScaledVector(n, this.R(0.4, 1.2) * R).addScaledVector(this.cone(n, 1.5, _v2), this.R(0, 0.8) * R), v, {
        life: this.R(1.4, 2.4), drag: 3.2, gravity: -0.3, size: this.R(1.0, 1.6) * R, size1: this.R(3.2, 4.8) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.6, 0.6), color: C(0.09, 0.08, 0.07), alpha: 1, tile: PT.BILLOW[(this.rng.next() * 3) | 0],
        emissive: this.rng.next() < 0.3 ? this.R(0.2, 0.5) : this.R(0.9, 1.4), heatPow: this.R(1.3, 2.0), sunlit: env.sun, plane, fadeIn: 0.015,
      });
    }
    // coluna de fumaça (sobe e se espalha, fica)
    for (let i = 0, k = this.n(22) + 8; i < k; i++) {
      const v = this.cone(n, 0.8).multiplyScalar(this.R(0.5, 4) * R).addScaledVector(n, this.R(0.3, 2.5) * R);
      const grey = this.R(0.1, 0.2);
      ps.emit(point.clone().addScaledVector(n, this.R(0.8, 2) * R), v, {
        life: this.R(5, 10), drag: 1.3, gravity: -0.035, size: this.R(1.6, 2.4) * R, size1: this.R(5, 8) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.2, 0.2), color: C(grey, grey * 0.96, grey * 0.92).multiplyScalar(env.sky), alpha: 0.85,
        tile: PT.BILLOW[(this.rng.next() * 3) | 0], sunlit: env.sun, plane, fadeIn: 0.08, delay: this.R(0.15, 0.6),
      });
    }
    // anel de poeira rasteiro
    for (let i = 0, k = this.n(22) + 8; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + this.R(-0.1, 0.1);
      _t.set(Math.cos(a), 0, Math.sin(a));
      const v = _t.clone().multiplyScalar(this.R(9, 16) * R).addScaledVector(n, this.R(0.3, 1.5));
      ps.emit(point.clone().addScaledVector(_t, 0.5 * R).addScaledVector(n, 0.25), v, {
        life: this.R(2, 3.5), drag: 2.8, gravity: -0.02, size: 0.8 * R, size1: this.R(2.5, 3.8) * R, rot: this.R(0, 6.3),
        color: C(0.3, 0.26, 0.21).multiplyScalar(env.sky), alpha: 0.42, tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: env.sun, plane, fadeIn: 0.05,
      });
    }
    // onda de choque: anel no chão + casca de ar
    ps.emit(point.clone().addScaledVector(n, 0.06), null, {
      life: 0.35, size: 0.5, size1: radius * 2.6, mode: 4, plane, tile: PT.RING, additive: true, emissive: 1.4, heatPow: 1.5, color: C(1, 0.8, 0.6),
    });
    ps.emit(point.clone().addScaledVector(n, 1 * R), null, {
      life: 0.22, size: 0.6, size1: radius * 2.2, tile: PT.RING, additive: true, emissive: 0.9, heatPow: 1, color: C(1, 0.9, 0.8),
    });
    // clarão central
    ps.emit(point.clone().addScaledVector(n, 0.8 * R), null, {
      life: 0.12, size: 2.5 * R, size1: 5 * R, tile: PT.GLOW, additive: true, emissive: 6, heatPow: 2, color: C(1, 0.55, 0.25),
    });
    ps.emit(point.clone().addScaledVector(n, 0.6 * R), null, {
      life: 0.08, size: 2 * R, size1: 3.5 * R, tile: PT.STAR[0], additive: true, emissive: 5, heatPow: 1, color: C(1, 0.65, 0.35), rot: this.R(0, 6.3),
    });
    // brasas
    for (let i = 0, k = this.n(50); i < k; i++) {
      const v = this.cone(n, 1.1).multiplyScalar(this.R(5, 22) * R);
      ps.emit(point.clone().addScaledVector(n, 0.3), v, {
        life: this.R(0.8, 2.6), drag: this.R(1.2, 2.5), gravity: this.R(0.15, 0.6), size: this.R(0.012, 0.03), mode: 1, stretch: 0.02,
        tile: PT.SPARK, additive: true, emissive: this.R(8, 20), heatPow: 1.2, color: C(1, 0.38, 0.08),
      });
    }
    // terra/cascalho lançado
    for (let i = 0, k = this.n(30); i < k; i++) {
      const v = this.cone(n, 0.9).multiplyScalar(this.R(4, 14) * R);
      ps.emit(point.clone().addScaledVector(n, 0.2), v, {
        life: this.R(0.8, 1.8), drag: 0.4, gravity: 1, size: this.R(0.02, 0.06), mode: 1, stretch: 0.01,
        color: C(0.05, 0.04, 0.03), tile: PT.CHIP, sunlit: env.sun,
      });
    }
    for (let i = 0, k = this.n(14); i < k; i++) {
      const v = this.cone(n, 0.9).multiplyScalar(this.R(3, 10) * R);
      const s = this.R(0.03, 0.09);
      this.debris.spawn(point.clone().addScaledVector(n, 0.2), v, { scale: s, life: this.R(4, 8), drag: 0.2, halfH: s * 0.35, color: C(0.12, 0.1, 0.08) });
    }
    // queimado no chão
    this.decals.add(point, n, 'scorch', radius * 0.75, null, { roughness: 0.95 });
    // luz, flash de tela, tremor
    this.flashLight(point.clone().addScaledVector(n, 1.5 * R), C(1, 0.55, 0.25), 600 * R, 0.6, radius * 6);
    const cam = ctx.camera.position;
    const dist = cam.distanceTo(point);
    const k = Math.max(0, 1 - dist / (radius * 7));
    ctx.services.rendering?.flash?.(0.22 * k * k);
    this.addShake(1.1 * k + 0.08, 0.9);
    ctx.bus.emit('vfx:explosion', { point: point.clone(), radius, intensity: k });
  }
}
