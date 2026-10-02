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
  concrete: { dust: C(0.46, 0.44, 0.4), chip: C(0.3, 0.29, 0.27), decal: 'concrete', size: 0.2, dustAmt: 1, chunks: 4, sparks: 6, chipCount: 10 },
  brick: { dust: C(0.44, 0.27, 0.19), chip: C(0.3, 0.1, 0.06), decal: 'brick', size: 0.2, dustAmt: 1, chunks: 4, sparks: 3, chipCount: 10 },
  asphalt: { dust: C(0.3, 0.29, 0.27), chip: C(0.06, 0.06, 0.06), decal: 'asphalt', size: 0.16, dustAmt: 0.8, chunks: 3, sparks: 7, chipCount: 9 },
  metal: { dust: C(0.22, 0.22, 0.22), chip: C(0.3, 0.3, 0.3), decal: 'metal', size: 0.13, dustAmt: 0.25, chunks: 0, sparks: 24, chipCount: 0 },
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
    this.softUntil = 0; // partículas suaves vivas até (pré-passe de profundidade)
    this.lensKick = 0;
  }
  /** Marca que há partículas suaves vivas por `sec` segundos. */
  soft(sec) {
    this.softUntil = Math.max(this.softUntil, this.ctx.time.now + sec);
  }
  /** Rastro de poeira atrás de um detrito em voo (chamado pelo RigidPool). */
  debrisTrail(b) {
    const sp = b.vel.length();
    if (sp < 1.8) return;
    const s = Math.max(b.scale.x, b.scale.y, b.scale.z);
    this.ps.emit(b.pos, _v.copy(b.vel).multiplyScalar(0.05), {
      life: this.R(0.45, 0.8) * b.trail, drag: 2.5, gravity: -0.01, size: s * 0.9, size1: s * this.R(3.5, 5.5), rot: this.R(0, 6.3),
      spin: this.R(-1, 1), color: _col.copy(b.color).lerp(C(0.4, 0.37, 0.33), 0.6).clone(), alpha: 0.28 * b.trail,
      tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: b.lit ?? 1, fadeIn: 0.05, erode: 0.4,
    });
    if (b.trail > 1.2) {
      // detrito em brasa (explosão): faísca curta atrás
      this.ps.emit(b.pos, _v.copy(b.vel).multiplyScalar(-0.1), {
        life: 0.12, drag: 1, size: 0.012, mode: 1, stretch: 0.03, tile: PT.SPARK, additive: true, emissive: 6, heatPow: 1, color: C(1, 0.4, 0.1),
      });
    }
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

  flashLight(pos, color, peak, life, range = 10, { flicker = 0.3, curve = 2 } = {}) {
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
    best.flicker = flicker;
    best.curve = curve;
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
    this.soft(3.5);
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
        life: 0.05, size: 0.1 * scale, size1: 0.16 * scale, tile: PT.GLOW, additive: true,
        emissive: material === 'metal' ? 7 : 2, color: C(1, 0.55, 0.2), rot: this.R(0, 6.3),
      });
      ps.emit(point.clone().addScaledVector(n, 0.02), null, {
        life: 0.04, size: (material === 'metal' ? 0.26 : 0.1) * scale, tile: PT.STAR[(this.rng.next() * 2) | 0], additive: true,
        emissive: material === 'metal' ? 6 : 2.5, color: C(1, 0.58, 0.25), rot: this.R(0, 6.3),
      });
    }

    // jato: baforadas esticadas, muito rápidas, que freiam em ~0,2 s
    const jets = this.n(2 * M.dustAmt) + 1;
    for (let i = 0; i < jets; i++) {
      const v = this.cone(out, 0.25).multiplyScalar(this.R(7, 12) * scale);
      ps.emit(point.clone().addScaledVector(n, 0.03), v, {
        life: this.R(0.25, 0.4), drag: 9, gravity: 0, size: 0.07 * scale, size1: this.R(0.25, 0.4) * scale, rot: this.R(0, 6.3), spin: this.R(-3, 3),
        color: dust, alpha: 0.5, tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: lit, plane, soft: 0.12, erode: 0.4,
      });
    }
    // núcleo de poeira: denso, abre rápido
    const core = this.n(4 * M.dustAmt) + 1;
    for (let i = 0; i < core; i++) {
      const v = this.cone(out, 0.5).multiplyScalar(this.R(1.5, 4.5) * scale);
      ps.emit(point.clone().addScaledVector(n, 0.05), v, {
        life: this.R(0.7, 1.2), drag: 5, gravity: -0.02, size: 0.18 * scale, size1: this.R(0.6, 0.9) * scale,
        rot: this.R(0, 6.3), spin: this.R(-1.2, 1.2), color: dust, alpha: 0.65, tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: lit, plane, fadeIn: 0.03, soft: 0.25, erode: 0.5, turb: 0.05,
      });
    }
    // nuvem que fica pairando
    const linger = this.n(3 * M.dustAmt);
    for (let i = 0; i < linger; i++) {
      const v = this.cone(n, 0.9).multiplyScalar(this.R(0.4, 1.2) * scale);
      ps.emit(point.clone().addScaledVector(n, 0.15), v, {
        life: this.R(2, 3.2), drag: 1.6, gravity: -0.015, size: 0.2 * scale, size1: this.R(1.1, 1.7) * scale,
        rot: this.R(0, 6.3), spin: this.R(-0.4, 0.4), color: dust, alpha: 0.32, tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: lit, plane, fadeIn: 0.1, soft: 0.4, erode: 0.45, turb: 0.15,
      });
    }
    // poeira fina em fiapos (esticada pela velocidade)
    if (M.dustAmt > 0.5) {
      const wisps = this.n(3);
      for (let i = 0; i < wisps; i++) {
        const v = this.cone(out, 0.6).multiplyScalar(this.R(3, 7) * scale);
        ps.emit(point.clone(), v, {
          life: this.R(0.35, 0.6), drag: 5, gravity: 0.1, size: 0.08 * scale, size1: 0.25 * scale, mode: 1, stretch: 0.02,
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
        life: this.R(0.12, material === 'metal' ? 0.6 : 0.32), drag: 1.8, gravity: 1.2, size: this.R(0.01, 0.02), mode: 1,
        stretch: 0.028, tile: PT.SPARK, additive: true, emissive: this.R(12, 26), heatPow: 1.4, color: C(1, this.R(0.38, 0.55), 0.12),
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
        scale: M.splinter ? _v2.set(s * 0.35, s * 0.35, s * 2.6).clone() : _v2.set(s, s * this.R(0.45, 0.8), s * this.R(0.8, 1.2)).clone(),
        life: this.R(2, 4), drag: 0.3, halfH: s * 0.3,
        color: _col.copy(M.chip).multiplyScalar(this.R(0.7, 1.3) * shade).clone(), trail: M.splinter ? 0 : 0.5,
      });
    }
    // decalque
    if (o.decal !== false && !o.collider?.dynamic) this.decals.add(point, n, M.decal, M.size * (o.exit ? 1.3 : 1) * (o.decalScale ?? 1), dir);
  }

  /**
   * Sangue: jato de névoa na entrada (volta para o atirador), jorro de saída
   * atravessando o corpo, névoa fina que fica um instante, gotículas com
   * gravidade e respingo na parede/chão atrás. Névoa acesa pelo sol/céu,
   * erodida pelo detalhe animado (não vira "bola" vermelha).
   */
  blood(point, n, dir, o = {}) {
    const ps = this.ps;
    this.soft(2);
    const env = this.envAt(point, _up);
    const lit = env.sun;
    const shade = 0.55 + 0.45 * env.sky;
    const red = C(0.3, 0.012, 0.008).multiplyScalar(shade);
    const dark = C(0.13, 0.006, 0.004).multiplyScalar(shade);
    const back = n.clone();
    const sc = o.scale ?? 1;
    // jato de entrada (curto, denso, estoura e some)
    for (let i = 0, k = this.n(4) + 2; i < k; i++) {
      const v = this.cone(back, 0.55).multiplyScalar(this.R(1.2, 3.2) * sc);
      ps.emit(point.clone().addScaledVector(back, 0.03), v, {
        life: this.R(0.28, 0.5), drag: 7, gravity: 0.08, size: 0.05 * sc, size1: this.R(0.3, 0.5) * sc, rot: this.R(0, 6.3), spin: this.R(-2, 2),
        color: red, alpha: 0.95, tile: PT.BLOOD, sunlit: lit, fadeIn: 0.02, erode: 0.55, soft: 0.1,
      });
    }
    // jorro de saída (através do corpo): mais forte e alongado
    for (let i = 0, k = this.n(5) + 2; i < k; i++) {
      const v = this.cone(dir, 0.32).multiplyScalar(this.R(2.5, 6) * sc);
      ps.emit(point.clone().addScaledVector(dir, 0.28), v, {
        life: this.R(0.35, 0.65), drag: 5, gravity: 0.25, size: 0.07 * sc, size1: this.R(0.4, 0.7) * sc, mode: i % 2 ? 1 : 0, stretch: 0.03,
        rot: this.R(0, 6.3), color: i % 2 ? dark : red, alpha: 0.9, tile: PT.BLOOD, sunlit: lit, erode: 0.5, soft: 0.1,
      });
    }
    // névoa fina que paira
    for (let i = 0, k = this.n(4) + 1; i < k; i++) {
      const v = this.cone(i % 2 ? dir : back, 0.8).multiplyScalar(this.R(0.4, 1.4) * sc);
      ps.emit(point.clone().addScaledVector(dir, this.R(-0.05, 0.3)), v, {
        life: this.R(0.8, 1.5), drag: 2.5, gravity: 0.03, size: 0.12 * sc, size1: this.R(0.6, 1.0) * sc, rot: this.R(0, 6.3), spin: this.R(-0.6, 0.6),
        color: C(0.22, 0.02, 0.016).multiplyScalar(shade), alpha: 0.28, tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: lit,
        fadeIn: 0.05, erode: 0.5, soft: 0.3, turb: 0.05,
      });
    }
    // gotas
    for (let i = 0, k = this.n(20); i < k; i++) {
      const v = this.cone(i % 3 ? dir : back, 0.7).multiplyScalar(this.R(1.5, 5.5));
      ps.emit(point.clone(), v, {
        life: this.R(0.4, 0.9), drag: 0.8, gravity: 1, size: this.R(0.008, 0.02), mode: 1, stretch: 0.014,
        color: dark, tile: PT.CHIP, sunlit: lit,
      });
    }
    // respingo na parede/chão atrás do alvo
    const col = this.ctx.collision;
    if (col && o.decal !== false) {
      const hit = col.raycast(point.clone().addScaledVector(dir, 0.4), dir, 3.0, { filter: (c) => !c.dynamic && c.material !== 'flesh' });
      if (hit) this.decals.add(hit.point, hit.normal, 'bloodSpray', this.R(0.5, 0.85) * (1 - hit.distance / 4), dir);
      // gotas no chão sob o alvo
      const g = col.raycast(point, _v.set(0, -1, 0), 3, { filter: (c) => !c.dynamic });
      if (g) this.decals.add(g.point.clone().addScaledVector(dir, this.R(0.2, 0.7)), g.normal, 'blood', this.R(0.25, 0.4), dir);
    }
  }

  // ─── clarão de boca ─────────────────────────────────────────────────────
  /**
   * Clarão da arma do jogador na cena da viewmodel (muzzle = Object3D na vm).
   * Camadas (de dentro para fora): núcleo branco-quente minúsculo → estrela
   * frontal curta → pétalas do quebra-chamas em DUAS temperaturas (miolo
   * amarelo, franja laranja-avermelhada maior) → língua frontal → halo fraco.
   * Depois: baforada de fumaça na própria viewmodel (presa à arma) e no mundo.
   * worldPos: posição equivalente no mundo (para luz, fumaça e faíscas).
   */
  muzzleFlashVm(muzzle, worldPos, worldDir, ads = 0) {
    const vps = this.vps;
    muzzle.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld);
    // eixo do cano = −Z local da boca
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld);
    const s = 1 - 0.4 * ads;
    const white = C(1, 0.78, 0.45);
    const hot = C(1, 0.52, 0.16);
    const cool = C(1, 0.24, 0.05);
    const life = this.R(0.04, 0.055);
    // núcleo (pequeno: não "lava" o cano)
    vps.emit(p.clone().addScaledVector(fwd, 0.012), null, {
      life, size: 0.045 * s, tile: PT.GLOW, additive: true, emissive: 5, color: white,
    });
    const star = PT.STAR[(this.rng.next() * 2) | 0];
    vps.emit(p.clone().addScaledVector(fwd, 0.03 * s), null, {
      life, size: this.R(0.08, 0.11) * s, tile: star, additive: true, emissive: 4.5, color: hot, rot: this.R(0, 6.3),
    });
    // pétalas do quebra-chamas: 3–4 janelas, cada uma com miolo quente + franja fria
    const petals = 3 + ((this.rng.next() * 2) | 0);
    const roll = this.R(0, 6.3);
    for (let i = 0; i < petals; i++) {
      const a = roll + (i / petals) * Math.PI * 2 + this.R(-0.25, 0.25);
      _t.set(Math.cos(a), Math.sin(a), 0).transformDirection(muzzle.matrixWorld);
      const spread = this.R(0.5, 0.95);
      const axis = fwd.clone().multiplyScalar(0.75).addScaledVector(_t, spread).normalize();
      const len = this.R(2.4, 3.6);
      vps.emit(p.clone().addScaledVector(fwd, 0.004), axis, {
        life: life * 1.15, size: this.R(0.05, 0.066) * s, mode: 3, stretch: len * 1.15, tile: PT.PETAL[i & 1],
        additive: true, emissive: 2.6, color: cool,
      });
      vps.emit(p.clone().addScaledVector(fwd, 0.006), axis, {
        life, size: this.R(0.026, 0.034) * s, mode: 3, stretch: len, tile: PT.PETAL[(i + 1) & 1],
        additive: true, emissive: 6.5, color: hot,
      });
    }
    // língua frontal (cone mais frio e longo) + miolo
    vps.emit(p.clone(), fwd, {
      life: life * 1.1, size: 0.06 * s, mode: 3, stretch: this.R(3.2, 4.6), tile: PT.PETAL[(this.rng.next() * 2) | 0], additive: true, emissive: 2.2, color: cool,
    });
    vps.emit(p.clone(), fwd, {
      life, size: 0.03 * s, mode: 3, stretch: this.R(3, 4), tile: PT.PETAL[(this.rng.next() * 2) | 0], additive: true, emissive: 5, color: hot,
    });
    // halo largo e fraco (o bloom do compositor faz o resto)
    vps.emit(p.clone().addScaledVector(fwd, 0.04), null, {
      life: life * 1.3, size: 0.22 * s, tile: PT.GLOW, additive: true, emissive: 0.22, color: C(1, 0.42, 0.12),
    });
    // faíscas de pólvora saindo do cano (vm)
    for (let i = 0, k = this.n(3); i < k; i++) {
      const v = this.cone(fwd, 0.3).multiplyScalar(this.R(2.5, 5));
      vps.emit(p.clone(), v, {
        life: this.R(0.04, 0.09), drag: 3, size: 0.0025, mode: 1, stretch: 0.012, tile: PT.SPARK, additive: true, emissive: 12, heatPow: 1, color: hot,
      });
    }
    // fumaça na viewmodel: baforada que sai do cano e sobe devagar (acesa pelo sol/céu)
    for (let i = 0, k = 2 + this.n(1); i < k; i++) {
      const v = this.cone(fwd, 0.5).multiplyScalar(this.R(0.15, 0.45)).add(_v2.set(0, this.R(0.04, 0.1), 0));
      vps.emit(p.clone().addScaledVector(fwd, this.R(0.02, 0.06)), v, {
        life: this.R(0.5, 0.9), drag: 2.2, gravity: -0.008, size: 0.025 * s, size1: this.R(0.09, 0.15) * s, rot: this.R(0, 6.3),
        spin: this.R(-1.5, 1.5), color: C(0.62, 0.61, 0.6), alpha: (0.22 - 0.1 * ads), tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: 1, fadeIn: 0.08, erode: 0.6, turb: 0.01, delay: 0.02,
      });
    }
    // luz na viewmodel (acende luva, mão e trilho) e no mundo
    if (this.vmLight) {
      this.vmLight.light.position.copy(p).addScaledVector(fwd, 0.06);
      this.vmLight.t0 = this.ctx.time.now;
      this.vmLight.life = 0.075;
      this.vmLight.peak = 2.6;
    }
    if (worldPos) {
      this.flashLight(worldPos.clone().addScaledVector(worldDir, 0.3), C(1, 0.55, 0.25), 40, 0.07, 10, { flicker: 0.2 });
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
        life: this.R(0.8, 1.5), drag: 3, gravity: -0.03, size: 0.04 * scale, size1: this.R(0.35, 0.6) * scale, rot: this.R(0, 6.3),
        spin: this.R(-1, 1), color: C(0.55, 0.55, 0.55).multiplyScalar(env.sky), alpha: (0.18 - 0.08 * ads), tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: env.sun, fadeIn: 0.1, erode: 0.6, turb: 0.06,
      });
    }
    for (let i = 0, k = this.n(4); i < k; i++) {
      const v = this.cone(dir, 0.25).multiplyScalar(this.R(8, 18));
      ps.emit(p.clone(), v, {
        life: this.R(0.05, 0.12), drag: 2, gravity: 0.5, size: 0.008 * scale, mode: 1, stretch: 0.012, tile: PT.SPARK,
        additive: true, emissive: 14, heatPow: 1, color: C(1, 0.5, 0.15),
      });
    }
  }

  /** Clarão de 3ª pessoa (inimigos): estrela de frente + pétalas em 2 temperaturas + luz. */
  muzzleFlashWorld(origin, dir, { hold = false } = {}) {
    const ps = this.ps;
    const life = hold ? 30 : 0.05;
    const hot = C(1, 0.52, 0.17);
    const cool = C(1, 0.25, 0.05);
    const ids = [];
    if (hold) {
      for (const i of this.heldFlash) ps.kill(i);
      this.heldFlash.length = 0;
    }
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.06), null, {
      life, size: 0.14, tile: PT.GLOW, additive: true, emissive: 7, color: C(1, 0.8, 0.5),
    }));
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.1), null, {
      life, size: this.R(0.32, 0.42), tile: PT.STAR[(this.rng.next() * 2) | 0], additive: true, emissive: 6, color: hot, rot: this.R(0, 6.3),
    }));
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.1), null, {
      life: life * 1.2, size: 1.1, tile: PT.GLOW, additive: true, emissive: 0.6, color: C(1, 0.45, 0.15),
    }));
    const roll = this.R(0, 6.3);
    const right = new THREE.Vector3().crossVectors(dir, _up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
    for (let i = 0; i < 4; i++) {
      const a = roll + (i / 4) * Math.PI * 2;
      const axis = dir.clone().multiplyScalar(0.85)
        .addScaledVector(right, Math.cos(a) * this.R(0.45, 0.8))
        .addScaledVector(upv, Math.sin(a) * this.R(0.45, 0.8)).normalize();
      const len = this.R(2.6, 3.6);
      ids.push(ps.emit(origin.clone(), axis, {
        life, size: this.R(0.15, 0.2), mode: 3, stretch: len * 1.1, tile: PT.PETAL[i & 1], additive: true, emissive: 3, color: cool,
      }));
      ids.push(ps.emit(origin.clone(), axis, {
        life, size: this.R(0.08, 0.1), mode: 3, stretch: len, tile: PT.PETAL[(i + 1) & 1], additive: true, emissive: 7, color: hot,
      }));
    }
    ids.push(ps.emit(origin.clone(), dir.clone(), {
      life, size: 0.2, mode: 3, stretch: 4.2, tile: PT.PETAL[0], additive: true, emissive: 3, color: cool,
    }));
    ids.push(ps.emit(origin.clone(), dir.clone(), {
      life, size: 0.1, mode: 3, stretch: 3.6, tile: PT.PETAL[1], additive: true, emissive: 7, color: hot,
    }));
    if (hold) this.heldFlash.push(...ids);
    const l = this.flashLight(origin.clone().addScaledVector(dir, 0.3), C(1, 0.58, 0.28), 30, hold ? 30 : 0.06, 10);
    if (hold) l.hold = true;
    this.muzzleWorld(origin, dir, 1.6);
  }

  // ─── traçante ───────────────────────────────────────────────────────────
  /**
   * Traçante: núcleo HDR fino (amarelo-branco) + halo largo laranja que o
   * bloom espalha; as duas camadas afinam nas pontas (tile gaussiano).
   */
  tracer(from, to, { speed = 420, length = 4, width = 0.025, emissive = 14, color = C(1, 0.5, 0.18) } = {}) {
    const d = _v.subVectors(to, from);
    const dist = d.length();
    if (dist < 0.5) return;
    d.divideScalar(dist);
    const L = Math.min(length, dist);
    const vel = d.clone().multiplyScalar(speed);
    this.ps.emit(from.clone(), vel, {
      life: dist / speed, size: width * 0.55, mode: 2, stretch: L * 0.85, tile: PT.SPARK, additive: true, emissive: emissive * 1.6, color: C(1, 0.72, 0.4),
    });
    this.ps.emit(from.clone(), vel, {
      life: dist / speed, size: width * 3.2, mode: 2, stretch: L, tile: PT.SPARK, additive: true, emissive: emissive * 0.22, color,
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
   * Explosão de granada/IED, em camadas (todas suaves contra a cena):
   *   clarão branco + luz forte curta → bola de fogo densa com gradiente de
   *   temperatura (núcleo quente que esfria para fuligem, bolsões animados)
   *   → lóbulos que sobem → coluna de fumaça auto-sombreada que fica →
   *   névoa rasteira que permanece na rua; onda de choque (anel de poeira
   *   rasteiro + anel quente curto), jatos de terra para cima, faíscas,
   *   brasas com convecção e turbulência, detritos com rastro, queimado no
   *   chão, luz de fogo que tremula e ilumina a rua e a própria fumaça,
   *   flash de tela, aberração cromática e tremor.
   */
  explosion(point, { radius = 6, normal = _up } = {}) {
    const ps = this.ps;
    const ctx = this.ctx;
    const n = normal.clone().normalize();
    const env = this.envAt(point, n);
    const plane = this.plane(point, n);
    const R = radius / 6;
    const seed = () => this.rng.next();
    this.soft(24);
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
    const soot = C(0.05, 0.045, 0.04);
    // 1) clarão inicial
    ps.emit(point.clone().addScaledVector(n, 0.9 * R), null, {
      life: 0.14, size: 3 * R, size1: 6 * R, tile: PT.GLOW, additive: true, emissive: 7, heatPow: 2, color: C(1, 0.62, 0.32),
    });
    ps.emit(point.clone().addScaledVector(n, 0.7 * R), null, {
      life: 0.09, size: 2.4 * R, size1: 4.5 * R, tile: PT.STAR[0], additive: true, emissive: 6, heatPow: 1, color: C(1, 0.7, 0.4), rot: this.R(0, 6.3),
    });
    // 2) bola de fogo: núcleo denso (quente → fuligem)
    for (let i = 0, k = this.n(30) + 10; i < k; i++) {
      const v = this.cone(n, 1.15).multiplyScalar(this.R(2.5, 10) * R).addScaledVector(n, this.R(1.5, 4.5) * R);
      const hotness = this.rng.next();
      ps.emit(point.clone().addScaledVector(n, this.R(0.5, 1.3) * R).addScaledVector(this.cone(n, 1.5, _v2), this.R(0, 0.9) * R), v, {
        life: this.R(1.5, 2.6), drag: 3.4, gravity: -0.35, size: this.R(1.1, 1.7) * R, size1: this.R(3.2, 4.6) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.5, 0.5), color: soot, alpha: 1, tile: PT.BILLOW[(seed() * 3) | 0],
        emissive: hotness < 0.3 ? this.R(0.3, 0.55) : this.R(0.95, 1.45), heatPow: this.R(1.7, 2.5), sunlit: env.sun, plane, fadeIn: 0.012,
        erode: 0.45, soft: 1.4 * R, turb: 0.2 * R, seed: seed(),
      });
    }
    // 2b) lóbulos que sobem (cogumelo), um pouco depois, esfriando mais rápido
    for (let i = 0, k = this.n(10) + 4; i < k; i++) {
      const v = this.cone(n, 0.45).multiplyScalar(this.R(4, 8) * R);
      ps.emit(point.clone().addScaledVector(n, 1.5 * R), v, {
        life: this.R(1.8, 2.8), drag: 2.4, gravity: -0.3, size: this.R(1.4, 2) * R, size1: this.R(3.5, 5) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.4, 0.4), color: soot, alpha: 0.95, tile: PT.BILLOW[(seed() * 3) | 0],
        emissive: this.R(0.7, 1.05), heatPow: this.R(2.4, 3.4), sunlit: env.sun, plane, fadeIn: 0.03, delay: this.R(0.04, 0.16),
        erode: 0.5, soft: 1.6 * R, turb: 0.35 * R, seed: seed(),
      });
    }
    // 3) coluna de fumaça (sobe, se espalha e fica), auto-sombreada pelo shader
    for (let i = 0, k = this.n(26) + 10; i < k; i++) {
      const v = this.cone(n, 0.75).multiplyScalar(this.R(0.6, 4) * R).addScaledVector(n, this.R(0.5, 3) * R);
      const grey = this.R(0.07, 0.16);
      ps.emit(point.clone().addScaledVector(n, this.R(0.8, 2.2) * R), v, {
        life: this.R(6, 12), drag: 1.2, gravity: -0.035, size: this.R(1.8, 2.6) * R, size1: this.R(5.5, 8.5) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.15, 0.15), color: C(grey, grey * 0.96, grey * 0.92).multiplyScalar(env.sky), alpha: 0.88,
        tile: PT.BILLOW[(seed() * 3) | 0], sunlit: env.sun, plane, fadeIn: 0.06, delay: this.R(0.12, 0.7),
        erode: 0.4, soft: 2.2 * R, turb: 0.6 * R, seed: seed(),
      });
    }
    // 4) névoa rasteira que fica na rua (poeira + fumaça diluída)
    for (let i = 0, k = this.n(12) + 4; i < k; i++) {
      const a = this.R(0, Math.PI * 2);
      _t.set(Math.cos(a), 0, Math.sin(a));
      const v = _t.clone().multiplyScalar(this.R(1.5, 4) * R);
      ps.emit(point.clone().addScaledVector(n, this.R(0.8, 2.2)).addScaledVector(_t, this.R(1, 3) * R), v, {
        life: this.R(14, 24), drag: 0.5, gravity: -0.004, size: 3 * R, size1: this.R(10, 15) * R, rot: this.R(0, 6.3), spin: this.R(-0.05, 0.05),
        color: C(0.36, 0.33, 0.29).multiplyScalar(env.sky), alpha: 0.2, tile: PT.SMOKE[(seed() * 3) | 0], sunlit: env.sun ? 1 : 0.4, plane,
        fadeIn: 0.08, delay: this.R(0.3, 1.2), erode: 0.35, soft: 3, turb: 0.8, seed: seed(),
      });
    }
    // 5) onda de choque: anel de poeira rasteiro (frente nítida) + anel quente curto
    ps.emit(point.clone().addScaledVector(n, 0.12), null, {
      life: 0.7, size: 1.5 * R, size1: radius * 3.4, mode: 4, plane, tile: PT.RING, color: C(0.34, 0.3, 0.25).multiplyScalar(env.sky),
      alpha: 0.85, sunlit: env.sun, soft: 0.6, fadeIn: 0.02,
    });
    ps.emit(point.clone().addScaledVector(n, 0.06), null, {
      life: 0.22, size: 0.6, size1: radius * 2.4, mode: 4, plane, tile: PT.RING, additive: true, emissive: 2.2, heatPow: 1.5, color: C(1, 0.75, 0.5),
    });
    for (let i = 0, k = this.n(30) + 10; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + this.R(-0.1, 0.1);
      _t.set(Math.cos(a), 0, Math.sin(a));
      const v = _t.clone().multiplyScalar(this.R(10, 18) * R).addScaledVector(n, this.R(0.3, 1.8));
      ps.emit(point.clone().addScaledVector(_t, 0.6 * R).addScaledVector(n, 0.35), v, {
        life: this.R(2.2, 4), drag: 3, gravity: -0.02, size: 0.9 * R, size1: this.R(2.8, 4.2) * R, rot: this.R(0, 6.3), spin: this.R(-0.3, 0.3),
        color: C(0.26, 0.23, 0.19).multiplyScalar(env.sky), alpha: 0.5, tile: PT.SMOKE[(seed() * 3) | 0],
        sunlit: env.sun, plane, fadeIn: 0.04, erode: 0.45, soft: 1.2, turb: 0.3, seed: seed(),
      });
    }
    // 6) jatos de terra/cascalho para cima (a "coroa" escura da explosão)
    for (let i = 0, k = this.n(9) + 3; i < k; i++) {
      const v = this.cone(n, 0.6).multiplyScalar(this.R(11, 19) * R);
      ps.emit(point.clone().addScaledVector(n, 0.3), v, {
        life: this.R(0.9, 1.6), drag: 1.6, gravity: 0.55, size: 0.14 * R, size1: this.R(0.6, 1.0) * R, mode: 1, stretch: 0.1,
        color: C(0.09, 0.075, 0.06).multiplyScalar(env.sky), alpha: 0.6, tile: PT.SMOKE[(seed() * 3) | 0], sunlit: env.sun, plane,
        erode: 0.5, soft: 0.5, seed: seed(),
      });
    }
    for (let i = 0, k = this.n(50); i < k; i++) {
      const v = this.cone(n, 0.95).multiplyScalar(this.R(5, 16) * R);
      ps.emit(point.clone().addScaledVector(n, 0.2), v, {
        life: this.R(0.9, 2), drag: 0.35, gravity: 1, size: this.R(0.02, 0.055), mode: 1, stretch: 0.012,
        color: C(0.05, 0.045, 0.035), tile: PT.CHIP, sunlit: env.sun,
      });
    }
    // 7) faíscas quentes (rápidas, esticadas)
    for (let i = 0, k = this.n(60); i < k; i++) {
      const v = this.cone(n, 1.2).multiplyScalar(this.R(10, 30) * R);
      ps.emit(point.clone().addScaledVector(n, 0.4), v, {
        life: this.R(0.25, 0.9), drag: this.R(1.5, 3), gravity: 0.8, size: this.R(0.012, 0.025), mode: 1, stretch: 0.025,
        tile: PT.SPARK, additive: true, emissive: this.R(14, 30), heatPow: 1.3, color: C(1, 0.5, 0.14),
      });
    }
    // 8) brasas: tamanhos variados, sobem por convecção e dançam na turbulência
    for (let i = 0, k = this.n(110); i < k; i++) {
      const v = this.cone(n, 1.0).multiplyScalar(this.R(2, 12) * R);
      const big = this.rng.next() < 0.2;
      ps.emit(point.clone().addScaledVector(n, this.R(0.5, 2) * R), v, {
        life: this.R(1.5, 4.5), drag: this.R(1.5, 3.2), gravity: this.rng.next() < 0.55 ? this.R(-0.06, -0.02) : this.R(0.1, 0.3),
        size: big ? this.R(0.03, 0.055) : this.R(0.01, 0.025), mode: 1, stretch: this.R(0.02, 0.05),
        tile: PT.SPARK, additive: true, emissive: this.R(5, 16), heatPow: this.R(0.8, 1.6), color: C(1, this.R(0.28, 0.45), 0.06),
        turb: this.R(0.4, 1.4), seed: seed(), delay: this.R(0, 0.25),
      });
    }
    // 9) detritos 3D (concreto/asfalto) com rastro de poeira
    for (let i = 0, k = this.n(18); i < k; i++) {
      const v = this.cone(n, 0.85).multiplyScalar(this.R(4, 13) * R);
      const s = this.R(0.025, 0.1);
      const tone = this.R(0.1, 0.28);
      const b = this.debris.spawn(point.clone().addScaledVector(n, 0.3), v, {
        scale: _v2.set(s * this.R(0.8, 1.3), s * this.R(0.5, 0.9), s * this.R(0.8, 1.4)).clone(), life: this.R(5, 9), drag: 0.2, halfH: s * 0.3,
        color: C(tone, tone * 0.95, tone * 0.88), trail: i % 3 === 0 ? 1.4 : 1,
      });
      b.lit = env.sun ? 1 : 0.4;
    }
    // 10) queimado no chão (duas camadas: mancha larga + miolo)
    this.decals.add(point, n, 'scorch', radius * 0.85, null, { roughness: 0.95 });
    this.decals.add(point, n, 'scorch', radius * 0.4, null, { roughness: 0.9 });
    // 11) luzes: clarão branco curto + fogo que tremula e se apaga devagar
    this.flashLight(point.clone().addScaledVector(n, 1.2 * R), C(1, 0.7, 0.45), 1400 * R, 0.16, radius * 9, { flicker: 0, curve: 2 });
    this.flashLight(point.clone().addScaledVector(n, 2 * R), C(1, 0.42, 0.14), 160 * R, 2.2, radius * 7, { flicker: 0.5, curve: 1.5 });
    // 12) flash de tela, aberração, tremor
    const cam = ctx.camera.position;
    const dist = cam.distanceTo(point);
    const k = Math.max(0, 1 - dist / (radius * 7));
    ctx.services.rendering?.flash?.(0.25 * k * k + 0.04);
    this.lensKick = Math.max(this.lensKick, 0.35 + 0.65 * k);
    this.addShake(1.1 * k + 0.08, 0.9);
    ctx.bus.emit('vfx:explosion', { point: point.clone(), radius, intensity: k });
  }
}
