/**
 * Receitas de efeitos: impactos por material, clarão de boca (1ª e 3ª
 * pessoa), traçantes, cápsulas, sangue, explosões. Só compõe chamadas aos
 * sistemas (partículas GPU, decalques, corpos rígidos, luzes) — nenhum
 * objeto é criado por tiro.
 */
import * as THREE from 'three';
import { PT } from './atlas.js';

const C = (r, g, b) => new THREE.Color(r, g, b); // linear

/** Perfis por material (cores LINEARES). Poeira ≈ 1,2–1,4× o albedo do material
 * (pó fino espalha um pouco mais que a superfície) — nunca "branca". */
export const MATERIALS = {
  concrete: { dust: C(0.36, 0.345, 0.32), chip: C(0.3, 0.29, 0.27), decal: 'concrete', size: 0.17, dustAmt: 1, chunks: 4, sparks: 3, chipCount: 10 },
  brick: { dust: C(0.32, 0.18, 0.12), chip: C(0.3, 0.1, 0.06), decal: 'brick', size: 0.17, dustAmt: 1, chunks: 4, sparks: 1, chipCount: 10 },
  asphalt: { dust: C(0.2, 0.19, 0.18), chip: C(0.06, 0.06, 0.06), decal: 'asphalt', size: 0.14, dustAmt: 0.8, chunks: 3, sparks: 3, chipCount: 9 },
  metal: { dust: C(0.22, 0.22, 0.22), chip: C(0.3, 0.3, 0.3), decal: 'metal', size: 0.11, dustAmt: 0.25, chunks: 0, sparks: 14, chipCount: 0 },
  wood: { dust: C(0.34, 0.26, 0.17), chip: C(0.5, 0.36, 0.2), decal: 'wood', size: 0.18, dustAmt: 0.6, chunks: 5, sparks: 0, chipCount: 8, splinter: true },
  dirt: { dust: C(0.24, 0.185, 0.13), chip: C(0.07, 0.05, 0.035), decal: 'dirt', size: 0.24, dustAmt: 1.3, chunks: 2, sparks: 0, chipCount: 16, plume: true },
  glass: { dust: C(0.5, 0.52, 0.54), chip: C(0.75, 0.82, 0.85), decal: 'glass', size: 0.3, dustAmt: 0.35, chunks: 6, sparks: 0, chipCount: 6, glints: true },
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
    // rastro de pó: fiapo esticado ao longo do caminho (não "contas" redondas)
    this.ps.emit(b.pos, _v.copy(b.vel).multiplyScalar(0.12), {
      life: this.R(0.35, 0.7) * b.trail, drag: 3, gravity: -0.01, size: s * 1.2, size1: s * this.R(3, 4.5), mode: 1, stretch: 0.03,
      color: _col.copy(b.color).lerp(C(0.4, 0.37, 0.33), 0.6).clone(), alpha: 0.16 * b.trail,
      tile: PT.DUST, sunlit: b.lit ?? 1, fadeIn: 0.08,
    });
    // desfoque de movimento: traço curto na cor do detrito, ao longo da velocidade
    if (sp > 4) {
      this.ps.emit(b.pos, _v.copy(b.vel), {
        life: 0.04, size: s * 0.8, mode: 1, stretch: 0.02, gravity: 0, color: b.color, alpha: 0.6, tile: PT.CHIP, sunlit: b.lit ?? 1,
      });
    }
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

  /** Direção para um domo: vetor aleatório da esfera + viés na normal (mais denso no topo que um cone uniforme). */
  dome(n, bias = 0.6, out = _v) {
    let x, y, z, l;
    do {
      x = this.rng.next() * 2 - 1; y = this.rng.next() * 2 - 1; z = this.rng.next() * 2 - 1;
      l = x * x + y * y + z * z;
    } while (l > 1 || l < 1e-4);
    out.set(x, y, z).multiplyScalar(1 / Math.sqrt(l));
    const dn = out.dot(n);
    if (dn < 0) out.addScaledVector(n, -1.6 * dn); // nada para dentro do chão
    return out.addScaledVector(n, bias).normalize();
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

    // piscada minúscula do impacto (só metal e pedra dão faísca visível de dia)
    if (material === 'metal' || (M.sparks > 0 && this.rng.next() < 0.5)) {
      ps.emit(point.clone().addScaledVector(n, 0.02), null, {
        life: 0.035, size: (material === 'metal' ? 0.06 : 0.035) * scale, size1: (material === 'metal' ? 0.09 : 0.05) * scale, tile: PT.GLOW, additive: true,
        emissive: material === 'metal' ? 4 : 1.5, color: C(1, 0.78, 0.55), rot: this.R(0, 6.3),
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
    // faíscas de ricochete: traços CURTOS e finos, quase brancos, rápidos,
    // com gravidade e arrasto (o "rabo" é desfoque de movimento: comprimento
    // ∝ velocidade × 1/60 s), saindo em leque raso pela reflexão do projétil
    const sparks = this.n(M.sparks * scale);
    for (let i = 0; i < sparks; i++) {
      const sp = this.R(6, 22) * (material === 'metal' ? 1 : 0.7);
      const v = this.cone(refl.clone().lerp(n, 0.25).normalize(), material === 'metal' ? 0.7 : 0.45).multiplyScalar(sp);
      const hotK = this.rng.next();
      ps.emit(point.clone().addScaledVector(n, 0.01), v, {
        life: this.R(0.06, material === 'metal' ? 0.32 : 0.16), drag: this.R(2, 4), gravity: 1, size: this.R(0.0035, 0.007), mode: 1,
        stretch: 0.014, tile: PT.SPARK, additive: true, emissive: this.R(7, 14), heatPow: 1.6,
        color: hotK < 0.6 ? C(1, 0.82, 0.6) : C(1, 0.62, 0.32),
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
   * Sangue (referência: vídeo de alta velocidade de impacto em gelatina e
   * tiro real): o que se vê a 10–30 m é uma NÉVOA vermelho-escura que
   * estoura em ~50 ms e se dissipa em ~0,4 s — mais forte na SAÍDA, em cone
   * na direção do projétil —, um respingo menor na entrada que volta para o
   * atirador, gotículas balísticas com gravidade e o spray na parede/chão
   * atrás. Névoa acesa pelo sol/céu com espalhamento frontal (fica rosada
   * contra o sol), erodida pelo detalhe animado: nunca uma "bola" vermelha.
   */
  blood(point, n, dir, o = {}) {
    const ps = this.ps;
    this.soft(2);
    const env = this.envAt(point, _up);
    const lit = env.sun;
    const shade = 0.55 + 0.45 * env.sky;
    const red = C(0.34, 0.03, 0.024).multiplyScalar(shade);
    const dark = C(0.12, 0.008, 0.006).multiplyScalar(shade);
    const mist = C(0.42, 0.06, 0.05).multiplyScalar(shade);
    const back = n.clone();
    const sc = o.scale ?? 1;
    // estouro de entrada: curto, denso, volta para o atirador
    for (let i = 0, k = this.n(4) + 3; i < k; i++) {
      const v = this.cone(back, 0.7).multiplyScalar(this.R(1.5, 3.5) * sc);
      ps.emit(point.clone().addScaledVector(back, 0.06), v, {
        life: this.R(0.22, 0.4), drag: 8, gravity: 0.05, size: 0.1 * sc, size1: this.R(0.35, 0.55) * sc, rot: this.R(0, 6.3), spin: this.R(-2, 2),
        color: red, alpha: 0.85, tile: PT.BLOOD, sunlit: lit, fadeIn: 0.015, erode: 0.6, soft: 0.03, seed: this.rng.next(),
      });
    }
    // cone de saída (atravessa o corpo): o elemento mais visível — névoa que
    // abre num leque largo e escuro, mais fiapos esticados pela velocidade
    for (let i = 0, k = this.n(7) + 4; i < k; i++) {
      const v = this.cone(dir, 0.38).multiplyScalar(this.R(3, 8) * sc);
      ps.emit(point.clone().addScaledVector(dir, 0.22), v, {
        life: this.R(0.3, 0.55), drag: 6, gravity: 0.2, size: 0.12 * sc, size1: this.R(0.55, 0.95) * sc, rot: this.R(0, 6.3), spin: this.R(-1.5, 1.5),
        color: i % 3 ? red : dark, alpha: 0.8, tile: PT.BLOOD, sunlit: lit, fadeIn: 0.02, erode: 0.55, soft: 0.15, seed: this.rng.next(),
      });
    }
    for (let i = 0, k = this.n(5) + 2; i < k; i++) {
      const v = this.cone(dir, 0.25).multiplyScalar(this.R(6, 12) * sc);
      ps.emit(point.clone().addScaledVector(dir, 0.2), v, {
        life: this.R(0.12, 0.25), drag: 7, gravity: 0.3, size: 0.04 * sc, size1: 0.12 * sc, mode: 1, stretch: 0.03,
        color: dark, alpha: 0.85, tile: PT.DUST, sunlit: lit,
      });
    }
    // névoa fina que paira e se desfaz (leve, grande, rosada contra a luz)
    for (let i = 0, k = this.n(5) + 2; i < k; i++) {
      const v = this.cone(i % 3 ? dir : back, 0.9).multiplyScalar(this.R(0.5, 1.6) * sc);
      ps.emit(point.clone().addScaledVector(dir, this.R(-0.05, 0.35)), v, {
        life: this.R(0.6, 1.1), drag: 3, gravity: 0.02, size: 0.22 * sc, size1: this.R(0.9, 1.4) * sc, rot: this.R(0, 6.3), spin: this.R(-0.6, 0.6),
        color: mist, alpha: 0.3, tile: PT.SMOKE[(this.rng.next() * 3) | 0], sunlit: lit,
        fadeIn: 0.04, erode: 0.6, soft: 0.3, turb: 0.06, seed: this.rng.next(),
      });
    }
    // gotículas balísticas
    for (let i = 0, k = this.n(26); i < k; i++) {
      const v = this.cone(i % 3 ? dir : back, 0.6).multiplyScalar(this.R(1.5, 6.5));
      ps.emit(point.clone(), v, {
        life: this.R(0.35, 0.8), drag: 0.8, gravity: 1, size: this.R(0.006, 0.016), mode: 1, stretch: 0.012,
        color: dark, tile: PT.CHIP, sunlit: lit,
      });
    }
    // respingo na parede/chão atrás do alvo (molhado: rugosidade baixa)
    const col = this.ctx.collision;
    if (col && o.decal !== false) {
      const hit = col.raycast(point.clone().addScaledVector(dir, 0.4), dir, 4.0, { filter: (c) => !c.dynamic && c.material !== 'flesh' });
      if (hit) this.decals.add(hit.point, hit.normal, 'bloodSpray', this.R(0.45, 0.8) * (1 - hit.distance / 5.5), dir, { alpha: 0.85 });
      const g = col.raycast(point, _v.set(0, -1, 0), 3, { filter: (c) => !c.dynamic });
      if (g) {
        this.decals.add(g.point.clone().addScaledVector(dir, this.R(0.3, 0.8)), g.normal, 'blood', this.R(0.22, 0.38), dir);
        this.decals.add(g.point.clone().addScaledVector(dir, this.R(0.9, 1.5)), g.normal, 'bloodSpray', this.R(0.25, 0.4), dir, { alpha: 0.7 });
      }
    }
  }

  // ─── clarão de boca ───────────────────────────────────────────────────
  /**
   * Clarão da arma do jogador na cena da viewmodel (muzzle = Object3D na vm).
   * Referência: fotos de fuzil 5,56 com quebra-chamas de 3 janelas, de dia.
   * O clarão é PEQUENO (≈ 5–12 cm além da boca) e muda a cada tiro:
   *   cone quente do gás (amarelo-palha, quase branco no eixo) →
   *   clarão frontal de lóbulos irregulares (nada de estrela de 4 pontas) →
   *   2–4 pétalas pelas janelas do quebra-chamas, cada uma com miolo quente e
   *   franja laranja mais fria → às vezes uma língua frontal curta →
   *   halo muito fraco (o bloom do compositor faz o resto).
   * Depois: fiapos ralos de fumaça presos à arma e no mundo.
   * worldPos: posição equivalente no mundo (para luz, fumaça e faíscas).
   */
  muzzleFlashVm(muzzle, worldPos, worldDir, ads = 0) {
    const vps = this.vps;
    muzzle.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld);
    // eixo do cano = −Z local da boca
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld);
    const k = this.R(0.7, 1.15); // variação tiro a tiro (carga, gás residual)
    const s = (1 - 0.35 * ads) * k * 1.35;
    const white = C(1, 0.86, 0.66);
    const hot = C(1, 0.66, 0.34);
    const cool = C(1, 0.4, 0.14);
    const life = this.R(0.04, 0.055);
    // cone quente do gás, ao longo do eixo
    vps.emit(p.clone(), fwd, {
      life, size: this.R(0.026, 0.034) * s, mode: 3, stretch: this.R(2.2, 3.2), tile: PT.CONE, additive: true, emissive: 6 * k, color: white,
    });
    // clarão frontal irregular, girado a cada tiro
    vps.emit(p.clone().addScaledVector(fwd, 0.018 * s), null, {
      life, size: this.R(0.065, 0.09) * s, tile: PT.BURST, additive: true, emissive: 4.2 * k, color: hot, rot: this.R(0, 6.3),
    });
    // pétalas do quebra-chamas: 2–4 janelas, comprimentos e brilhos diferentes
    const petals = 2 + ((this.rng.next() * 3) | 0);
    const roll = this.R(0, 6.3);
    for (let i = 0; i < petals; i++) {
      const a = roll + (i / petals) * Math.PI * 2 + this.R(-0.35, 0.35);
      _t.set(Math.cos(a), Math.sin(a), 0).transformDirection(muzzle.matrixWorld);
      const axis = fwd.clone().multiplyScalar(this.R(0.9, 1.4)).addScaledVector(_t, this.R(0.45, 0.8)).normalize();
      const len = this.R(1.5, 2.6);
      const pk = this.R(0.6, 1.1);
      vps.emit(p.clone().addScaledVector(fwd, 0.004), axis, {
        life: life * 1.1, size: this.R(0.028, 0.038) * s, mode: 3, stretch: len * 1.1, tile: PT.PETAL[i & 1],
        additive: true, emissive: 1.5 * pk, color: cool,
      });
      vps.emit(p.clone().addScaledVector(fwd, 0.006), axis, {
        life, size: this.R(0.014, 0.02) * s, mode: 3, stretch: len, tile: PT.PETAL[(i + 1) & 1],
        additive: true, emissive: 4.5 * pk, color: hot,
      });
    }
    // língua frontal curta (nem todo tiro)
    if (this.rng.next() < 0.55) {
      vps.emit(p.clone(), fwd, {
        life, size: 0.03 * s, mode: 3, stretch: this.R(2.2, 3.4), tile: PT.PETAL[(this.rng.next() * 2) | 0], additive: true, emissive: 1.6 * k, color: cool,
      });
    }
    // halo muito fraco
    vps.emit(p.clone().addScaledVector(fwd, 0.03), null, {
      life: life * 1.3, size: 0.14 * s, tile: PT.GLOW, additive: true, emissive: 0.12, color: C(1, 0.55, 0.25),
    });
    // grãos de pólvora incandescentes (raros, minúsculos)
    for (let i = 0, kk = this.n(2); i < kk; i++) {
      const v = this.cone(fwd, 0.25).multiplyScalar(this.R(3, 6));
      vps.emit(p.clone(), v, {
        life: this.R(0.03, 0.07), drag: 3, size: 0.0018, mode: 1, stretch: 0.01, tile: PT.SPARK, additive: true, emissive: 8, heatPow: 1, color: hot,
      });
    }
    // fumaça na viewmodel: fiapos RALOS e cinzentos que saem do cano e sobem
    // (densidade baixa, erosão alta, bordas suaves — nada de bolha opaca)
    for (let i = 0, kk = 3 + this.n(1); i < kk; i++) {
      const v = this.cone(fwd, 0.6).multiplyScalar(this.R(0.12, 0.4)).add(_v2.set(this.R(-0.02, 0.02), this.R(0.04, 0.1), 0));
      vps.emit(p.clone().addScaledVector(fwd, this.R(0.015, 0.05)), v, {
        life: this.R(0.45, 0.85), drag: 2.4, gravity: -0.006, size: 0.018 * s, size1: this.R(0.07, 0.12) * s, rot: this.R(0, 6.3),
        spin: this.R(-1.2, 1.2), color: C(0.46, 0.46, 0.46), alpha: (0.075 - 0.035 * ads), tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: 1, fadeIn: 0.12, erode: 0.8, turb: 0.008, delay: 0.015, seed: this.rng.next(),
      });
    }
    // luz na viewmodel: fonte um pouco à frente da boca e com queda linear —
    // acende luva, antebraço e guarda-mão juntos (um ponto colado ao trilho
    // estourava o trilho e deixava o antebraço apagado)
    if (this.vmLight) {
      this.vmLight.light.position.copy(p).addScaledVector(fwd, 0.1);
      this.vmLight.light.position.y += 0.03;
      this.vmLight.t0 = this.ctx.time.now;
      this.vmLight.life = 0.07;
      this.vmLight.peak = 1.5 * k;
    }
    if (worldPos) {
      // no mundo: ilumina chão, paredes próximas e a própria fumaça
      this.flashLight(worldPos.clone().addScaledVector(worldDir, 0.25), C(1, 0.62, 0.34), 70 * k, 0.07, 12, { flicker: 0.15 });
      this.muzzleWorld(worldPos, worldDir, 1, ads);
    }
  }

  /** Fumaça e faíscas da boca no MUNDO (1ª pessoa: posição projetada). */
  muzzleWorld(p, dir, scale = 1, ads = 0) {
    const ps = this.ps;
    const env = this.envAt(p);
    this.soft(2);
    for (let i = 0, k = this.n(3); i < k; i++) {
      const v = this.cone(dir, 0.4).multiplyScalar(this.R(1, 2.8)).addScaledVector(_up, 0.25);
      ps.emit(p.clone().addScaledVector(dir, 0.15), v, {
        life: this.R(0.7, 1.3), drag: 3, gravity: -0.03, size: 0.04 * scale, size1: this.R(0.3, 0.5) * scale, rot: this.R(0, 6.3),
        spin: this.R(-1, 1), color: C(0.5, 0.5, 0.5).multiplyScalar(env.sky), alpha: (0.1 - 0.05 * ads), tile: PT.SMOKE[(this.rng.next() * 3) | 0],
        sunlit: env.sun, fadeIn: 0.12, erode: 0.75, turb: 0.06, soft: 0.2, seed: this.rng.next(),
      });
    }
    for (let i = 0, k = this.n(2); i < k; i++) {
      const v = this.cone(dir, 0.2).multiplyScalar(this.R(8, 16));
      ps.emit(p.clone(), v, {
        life: this.R(0.04, 0.09), drag: 2, gravity: 0.5, size: 0.004 * scale, mode: 1, stretch: 0.01, tile: PT.SPARK,
        additive: true, emissive: 9, heatPow: 1, color: C(1, 0.7, 0.4),
      });
    }
  }

  /** Clarão de 3ª pessoa (inimigos): compacto, cone + lóbulos + pétalas curtas + luz. */
  muzzleFlashWorld(origin, dir, { hold = false } = {}) {
    const ps = this.ps;
    const life = hold ? 30 : 0.05;
    const k = this.R(0.75, 1.15);
    const hot = C(1, 0.66, 0.34);
    const cool = C(1, 0.42, 0.15);
    const ids = [];
    if (hold) {
      for (const i of this.heldFlash) ps.kill(i);
      this.heldFlash.length = 0;
    }
    ids.push(ps.emit(origin.clone(), dir.clone(), {
      life, size: 0.05 * k, mode: 3, stretch: 2.8, tile: PT.CONE, additive: true, emissive: 6 * k, color: C(1, 0.86, 0.66),
    }));
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.05), null, {
      life, size: this.R(0.12, 0.17) * k, tile: PT.BURST, additive: true, emissive: 3.5 * k, color: hot, rot: this.R(0, 6.3),
    }));
    ids.push(ps.emit(origin.clone().addScaledVector(dir, 0.08), null, {
      life: life * 1.2, size: 0.5, tile: PT.GLOW, additive: true, emissive: 0.25, color: C(1, 0.55, 0.25),
    }));
    const roll = this.R(0, 6.3);
    const right = new THREE.Vector3().crossVectors(dir, _up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
    const petals = 3 + ((this.rng.next() * 2) | 0);
    for (let i = 0; i < petals; i++) {
      const a = roll + (i / petals) * Math.PI * 2 + this.R(-0.3, 0.3);
      const axis = dir.clone().multiplyScalar(this.R(0.9, 1.3))
        .addScaledVector(right, Math.cos(a) * this.R(0.45, 0.75))
        .addScaledVector(upv, Math.sin(a) * this.R(0.45, 0.75)).normalize();
      const len = this.R(1.6, 2.6);
      ids.push(ps.emit(origin.clone(), axis, {
        life, size: this.R(0.06, 0.08) * k, mode: 3, stretch: len * 1.1, tile: PT.PETAL[i & 1], additive: true, emissive: 1.8, color: cool,
      }));
      ids.push(ps.emit(origin.clone(), axis, {
        life, size: this.R(0.03, 0.04) * k, mode: 3, stretch: len, tile: PT.PETAL[(i + 1) & 1], additive: true, emissive: 5, color: hot,
      }));
    }
    if (hold) this.heldFlash.push(...ids);
    const l = this.flashLight(origin.clone().addScaledVector(dir, 0.3), C(1, 0.62, 0.34), 35 * k, hold ? 30 : 0.06, 10);
    if (hold) l.hold = true;
    this.muzzleWorld(origin, dir, 1.4);
  }

  // ─── traçante ───────────────────────────────────────────────────────────
  /**
   * Traçante: núcleo HDR fino (amarelo-branco) + halo largo laranja que o
   * bloom espalha; as duas camadas afinam nas pontas (tile gaussiano).
   */
  tracer(from, to, { speed = 420, length = 4, width = 0.02, emissive = 11, color = C(1, 0.42, 0.16) } = {}) {
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
      life: dist / speed, size: width * 2.4, mode: 2, stretch: L, tile: PT.SPARK, additive: true, emissive: emissive * 0.12, color,
    });
  }

  // ─── cápsula ejetada ────────────────────────────────────────────────────
  eject(pos, vel, camQuat, puff = true) {
    const spin = new THREE.Vector3(this.R(-25, 25), this.R(-40, 40), this.R(15, 35));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + this.R(-0.3, 0.3));
    if (camQuat) q.premultiply(camQuat);
    // tamanho físico (5,56×45): no chão, a 1–2 m, ela tem de ler em escala real
    this.brass.spawn(pos, vel, { spin, life: 6, drag: 0.4, halfH: 0.0048, quat: q });
    // baforada de gás na janela de ejeção (rala)
    if (puff) this.ps.emit(pos.clone(), vel.clone().multiplyScalar(0.25), {
      life: this.R(0.35, 0.6), drag: 4, gravity: -0.04, size: 0.02, size1: 0.12, rot: this.R(0, 6.3),
      color: C(0.48, 0.48, 0.48), alpha: 0.06, tile: PT.SMOKE[(this.rng.next() * 3) | 0], fadeIn: 0.12, erode: 0.7, seed: this.rng.next(),
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
   * Explosão de granada/IED (referência: vídeos de detonação de TNT/C4 em
   * campo de prova e fotos de combate urbano). Em ordem de tempo:
   *   0–80 ms  clarão branco-amarelo curto + luz muito forte que acende rua,
   *            fachadas e veículos ao redor;
   *   0–0,6 s  bola de fogo: NÃO é um disco laranja — é fuligem marrom-
   *            escura rolando por fora, com o fogo em bolsões e filamentos no
   *            miolo, que esfria rápido (corpo negro);
   *   0–0,3 s  saia de poeira rasteira (onda de choque levantando o pó do
   *            chão, achatada e radial), jatos de terra/cascalho para cima,
   *            detritos com desfoque de movimento e rastro de pó;
   *   0,2 s+   capuz de fuligem que sobe e rola por cima; coluna de fumaça
   *            cinza-amarronzada auto-sombreada, acesa pelo sol por um lado,
   *            que fica; névoa de poeira que assenta na rua;
   *   sempre   brasas poucas e pequenas, faíscas curtas, queimado difuso no
   *            chão, luz de fogo que tremula e tinge a fumaça por dentro.
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
    const sky = env.sky;
    const soot = C(0.045, 0.039, 0.034);
    const dustC = C(0.3, 0.26, 0.21).multiplyScalar(sky);
    // 1) clarão inicial (curto; sem estrela — o bloom faz a coroa)
    ps.emit(point.clone().addScaledVector(n, 0.9 * R), null, {
      life: 0.1, size: 2.2 * R, size1: 4.5 * R, tile: PT.GLOW, additive: true, emissive: 6, heatPow: 2, color: C(1, 0.8, 0.6),
    });
    ps.emit(point.clone().addScaledVector(n, 0.6 * R), null, {
      life: 0.07, size: 1.8 * R, size1: 3.2 * R, tile: PT.BURST, additive: true, emissive: 4, heatPow: 1, color: C(1, 0.78, 0.5), rot: this.R(0, 6.3),
    });
    // 2) bola de fogo: lóbulos de fuligem com fogo em bolsões que esfria rápido
    for (let i = 0, k = this.n(26) + 12; i < k; i++) {
      // domo que se expande do centro (não um "V"): direção do centro para fora
      const dirO = this.dome(n, 0.45, _v2).clone();
      const v = dirO.clone().multiplyScalar(this.R(3, 9) * R).addScaledVector(n, this.R(0.5, 2) * R);
      const hot = this.rng.next();
      ps.emit(point.clone().addScaledVector(n, 0.9 * R).addScaledVector(dirO, this.R(0.2, 1.1) * R), v, {
        life: this.R(4, 6.5), drag: 3.6, gravity: -0.22, size: this.R(1.2, 1.8) * R, size1: this.R(3.4, 4.8) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.4, 0.4), color: soot, alpha: 1, tile: PT.BILLOW[(seed() * 3) | 0],
        emissive: hot < 0.3 ? this.R(0.3, 0.6) : this.R(1.3, 2.0), heatPow: this.R(6, 9), sunlit: env.sun, plane, fadeIn: 0.012,
        erode: 0.28, soft: 1.2 * R, turb: 0.25 * R, seed: seed(),
      });
    }
    // 2b) capuz de fuligem que sobe e rola por cima (quase sem fogo)
    for (let i = 0, k = this.n(12) + 5; i < k; i++) {
      const dirO = this.dome(n, 1.4, _v2).clone();
      const v = dirO.clone().multiplyScalar(this.R(4, 8) * R);
      ps.emit(point.clone().addScaledVector(n, 1.6 * R).addScaledVector(dirO, this.R(0, 0.9) * R), v, {
        life: this.R(5, 8), drag: 2.4, gravity: -0.2, size: this.R(1.2, 1.8) * R, size1: this.R(3.6, 5.2) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.35, 0.35), color: C(0.055, 0.048, 0.042), alpha: 0.95, tile: PT.BILLOW[(seed() * 3) | 0],
        emissive: this.R(0.35, 0.6), heatPow: this.R(10, 14), sunlit: env.sun, plane, fadeIn: 0.015, delay: this.R(0.05, 0.2),
        erode: 0.3, soft: 1.6 * R, turb: 0.4 * R, seed: seed(),
      });
    }
    // 2c) haste: poeira/fumaça que sobe devagar do ponto da detonação e liga
    // a nuvem ao chão (sem ela, a bola "flutua" com céu por baixo)
    for (let i = 0, k = this.n(10) + 5; i < k; i++) {
      const v = this.cone(n, 0.35).multiplyScalar(this.R(0.6, 2.2) * R);
      ps.emit(point.clone().addScaledVector(n, this.R(0.3, 1.6) * R).addScaledVector(this.cone(n, 1.5, _v2), this.R(0, 0.6) * R), v, {
        life: this.R(5, 9), drag: 1.4, gravity: -0.05, size: this.R(1, 1.6) * R, size1: this.R(2.6, 3.8) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.2, 0.2), color: C(0.15, 0.13, 0.11).multiplyScalar(sky), alpha: 0.9, tile: PT.BILLOW[(seed() * 3) | 0],
        sunlit: env.sun, plane, fadeIn: 0.02, delay: this.R(0.02, 0.25), erode: 0.3, soft: 1.2 * R, turb: 0.3 * R, seed: seed(),
      });
    }
    // 3) coluna de fumaça (sobe, se espalha e fica): cinza-amarronzada, mais
    // clara (poeira) embaixo e mais escura (fuligem) em cima
    for (let i = 0, k = this.n(24) + 10; i < k; i++) {
      const v = this.cone(n, 0.7).multiplyScalar(this.R(0.6, 3.5) * R).addScaledVector(n, this.R(0.8, 3.2) * R);
      const up = this.rng.next();
      const g = this.R(0.08, 0.15);
      const c = C(g, g * 0.95, g * 0.88).lerp(C(0.2, 0.17, 0.13), (1 - up) * 0.6).multiplyScalar(sky);
      ps.emit(point.clone().addScaledVector(n, this.R(0.8, 2.4) * R), v, {
        life: this.R(7, 13), drag: 1.1, gravity: -0.03 - up * 0.02, size: this.R(1.6, 2.4) * R, size1: this.R(5, 8) * R, rot: this.R(0, 6.3),
        spin: this.R(-0.12, 0.12), color: c, alpha: 0.85,
        tile: PT.BILLOW[(seed() * 3) | 0], sunlit: env.sun, plane, fadeIn: 0.07, delay: this.R(0.15, 0.8),
        erode: 0.35, soft: 2.2 * R, turb: 0.6 * R, seed: seed(),
      });
    }
    // 4) névoa de poeira que assenta na rua (fica muito tempo, bem rala)
    for (let i = 0, k = this.n(12) + 4; i < k; i++) {
      const a = this.R(0, Math.PI * 2);
      _t.set(Math.cos(a), 0, Math.sin(a));
      const v = _t.clone().multiplyScalar(this.R(1.5, 4) * R);
      ps.emit(point.clone().addScaledVector(n, this.R(0.8, 2)).addScaledVector(_t, this.R(1, 3) * R), v, {
        life: this.R(14, 24), drag: 0.5, gravity: -0.004, size: 3 * R, size1: this.R(10, 15) * R, rot: this.R(0, 6.3), spin: this.R(-0.05, 0.05),
        color: C(0.36, 0.32, 0.27).multiplyScalar(sky), alpha: 0.16, tile: PT.SMOKE[(seed() * 3) | 0], sunlit: env.sun ? 1 : 0.4, plane,
        fadeIn: 0.08, delay: this.R(0.3, 1.2), erode: 0.4, soft: 3, turb: 0.8, seed: seed(), aspect: this.R(1.4, 2),
      });
    }
    // 5) onda de choque: saia de poeira RASTEIRA — baforadas achatadas
    // (largura 2–3× a altura), radiais, que freiam forte e ficam no chão.
    // Tamanhos, atrasos e cores variados (nada de discos idênticos).
    for (let i = 0, k = this.n(34) + 12; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + this.R(-0.15, 0.15);
      _t.set(Math.cos(a), 0, Math.sin(a));
      const sp = this.R(9, 20) * R;
      const v = _t.clone().multiplyScalar(sp).addScaledVector(n, this.R(0.2, 1.4));
      const tone = this.R(0.75, 1.15);
      ps.emit(point.clone().addScaledVector(_t, this.R(0.3, 1) * R).addScaledVector(n, this.R(0.15, 0.5)), v, {
        life: this.R(2.4, 4.5), drag: this.R(3, 4.5), gravity: -0.012, size: this.R(0.5, 0.9) * R, size1: this.R(2.2, 3.6) * R, rot: this.R(-0.3, 0.3),
        spin: this.R(-0.15, 0.15), color: dustC.clone().multiplyScalar(tone), alpha: this.R(0.3, 0.5), tile: PT.SMOKE[(seed() * 3) | 0],
        sunlit: env.sun, plane, fadeIn: 0.03, delay: this.R(0, 0.06), erode: 0.6, soft: 1, turb: 0.3, seed: seed(), aspect: this.R(1.8, 3),
      });
    }
    // anel de pó rente ao chão (a frente da onda), curto e ralo
    ps.emit(point.clone().addScaledVector(n, 0.1), null, {
      life: 0.45, size: 1.5 * R, size1: radius * 3, mode: 4, plane, tile: PT.RING, color: dustC,
      alpha: 0.4, sunlit: env.sun, soft: 0.6, fadeIn: 0.03,
    });
    // 6) jatos de terra/cascalho para cima (a "coroa" escura)
    for (let i = 0, k = this.n(9) + 3; i < k; i++) {
      const v = this.cone(n, 0.6).multiplyScalar(this.R(11, 19) * R);
      ps.emit(point.clone().addScaledVector(n, 0.3), v, {
        life: this.R(0.9, 1.6), drag: 1.6, gravity: 0.55, size: 0.14 * R, size1: this.R(0.6, 1.0) * R, mode: 1, stretch: 0.08,
        color: C(0.1, 0.085, 0.07).multiplyScalar(sky), alpha: 0.55, tile: PT.DUST, sunlit: env.sun, plane,
        erode: 0.5, soft: 0.5, seed: seed(),
      });
    }
    for (let i = 0, k = this.n(60); i < k; i++) {
      const v = this.cone(n, 0.95).multiplyScalar(this.R(5, 17) * R);
      ps.emit(point.clone().addScaledVector(n, 0.2), v, {
        life: this.R(0.9, 2), drag: 0.35, gravity: 1, size: this.R(0.012, 0.045), mode: 1, stretch: 0.016,
        color: C(0.06, 0.055, 0.045).multiplyScalar(this.R(0.7, 1.8)), tile: PT.CHIP, sunlit: env.sun,
      });
    }
    // 7) faíscas: curtas, finas, quase brancas
    for (let i = 0, k = this.n(36); i < k; i++) {
      const v = this.cone(n, 1.2).multiplyScalar(this.R(10, 28) * R);
      ps.emit(point.clone().addScaledVector(n, 0.4), v, {
        life: this.R(0.15, 0.6), drag: this.R(2, 3.5), gravity: 0.8, size: this.R(0.006, 0.012), mode: 1, stretch: 0.014,
        tile: PT.SPARK, additive: true, emissive: this.R(8, 16), heatPow: 1.4, color: C(1, 0.7, 0.4),
      });
    }
    // 8) brasas: poucas, pequenas, sobem por convecção e dançam na turbulência
    for (let i = 0, k = this.n(55); i < k; i++) {
      const v = this.cone(n, 1.0).multiplyScalar(this.R(2, 10) * R);
      ps.emit(point.clone().addScaledVector(n, this.R(0.5, 2) * R), v, {
        life: this.R(1.2, 3.5), drag: this.R(1.5, 3.2), gravity: this.rng.next() < 0.55 ? this.R(-0.05, -0.02) : this.R(0.1, 0.3),
        size: this.R(0.006, 0.016), mode: 1, stretch: this.R(0.015, 0.03),
        tile: PT.SPARK, additive: true, emissive: this.R(4, 10), heatPow: this.R(1, 1.8), color: C(1, this.R(0.35, 0.5), 0.12),
        turb: this.R(0.4, 1.4), seed: seed(), delay: this.R(0, 0.25),
      });
    }
    // 9) detritos 3D: concreto, asfalto, tijolo, terra — tamanhos log-uniformes
    const kinds = [C(0.32, 0.31, 0.29), C(0.12, 0.115, 0.11), C(0.3, 0.13, 0.08), C(0.2, 0.17, 0.13), C(0.25, 0.24, 0.22)];
    for (let i = 0, k = this.n(26); i < k; i++) {
      const v = this.cone(n, 0.85).multiplyScalar(this.R(4, 14) * R);
      const s = 0.012 * Math.pow(6, this.rng.next());
      const b = this.debris.spawn(point.clone().addScaledVector(n, 0.3), v, {
        scale: _v2.set(s * this.R(0.7, 1.4), s * this.R(0.35, 0.9), s * this.R(0.7, 1.5)).clone(), life: this.R(6, 10), drag: 0.2, halfH: s * 0.25,
        color: kinds[(this.rng.next() * kinds.length) | 0].clone().multiplyScalar(this.R(0.7, 1.25) * sky), trail: i % 3 === 0 ? 1.4 : 1,
      });
      b.lit = env.sun ? 1 : 0.4;
    }
    // 10) queimado no chão (mancha larga difusa + miolo pulverizado)
    this.decals.add(point, n, 'scorch', radius * 0.8, null, { roughness: 0.95 });
    this.decals.add(point.clone().addScaledVector(_t.set(this.R(-1, 1), 0, this.R(-1, 1)), 0.2 * R), n, 'scorch', radius * 0.38, null, { roughness: 0.92, alpha: 0.85 });
    // 11) luzes: clarão branco curto e MUITO forte + fogo que tremula e se
    // apaga devagar (acende fachadas, veículos e a própria fumaça por dentro)
    this.flashLight(point.clone().addScaledVector(n, 1.4 * R), C(1, 0.8, 0.6), 2500 * R, 0.14, radius * 10, { flicker: 0, curve: 2 });
    this.flashLight(point.clone().addScaledVector(n, 1.8 * R), C(1, 0.5, 0.2), 320 * R, 1.8, radius * 8, { flicker: 0.45, curve: 1.6 });
    // 12) flash de tela e tremor (sem aberração cromática: lia como defeito de lente barata)
    const cam = ctx.camera.position;
    const dist = cam.distanceTo(point);
    const k = Math.max(0, 1 - dist / (radius * 7));
    ctx.services.rendering?.flash?.(0.18 * k * k + 0.03);
    this.addShake(1.1 * k + 0.08, 0.9);
    ctx.bus.emit('vfx:explosion', { point: point.clone(), radius, intensity: k });
  }
}
