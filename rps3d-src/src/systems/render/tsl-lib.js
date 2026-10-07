// Biblioteca TSL compartilhada do sistema render: hashes, ruídos, fbm,
// voronoi, rampas de cor de corpo negro. Tudo em TSL puro (funciona no
// WebGPU e no fallback WebGL2). Hashes "sem seno" (estáveis em GPUs com
// precisão de seno ruim) — fract/dot apenas.

import { Fn, vec2, vec3, vec4, float, fract, floor, dot, mix, smoothstep, abs, min, max, clamp, sqrt, exp, length, sin, cos, pow } from 'three/tsl';

// ─── hashes ──────────────────────────────────────────────────────────────

/** float → float em [0,1). */
export const hash11 = Fn(([p_]) => {
  const p = fract(float(p_).mul(0.1031)).toVar();
  p.mulAssign(p.add(33.33));
  p.mulAssign(p.add(p));
  return fract(p);
});

/** vec2 → float em [0,1). */
export const hash12 = Fn(([p_]) => {
  const p3 = fract(vec3(p_.x, p_.y, p_.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

/** vec2 → vec2 em [0,1)². */
export const hash22 = Fn(([p_]) => {
  const p3 = fract(vec3(p_.x, p_.y, p_.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.xx.add(p3.yz).mul(p3.zy));
});

/** vec2 → vec3 em [0,1)³. */
export const hash32 = Fn(([p_]) => {
  const p3 = fract(vec3(p_.x, p_.y, p_.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yxz.add(33.33)));
  return fract(p3.xxy.add(p3.yzz).mul(p3.zyx));
});

/** vec3 → float. */
export const hash13 = Fn(([p_]) => {
  const p3 = fract(vec3(p_).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.zyx.add(31.32)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

/** vec3 → vec3. */
export const hash33 = Fn(([p_]) => {
  const p3 = fract(vec3(p_).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yxz.add(33.33)));
  return fract(p3.xxy.add(p3.yxx).mul(p3.zyx));
});

// ─── ruído de valor 2D/3D (barato, suave) ──────────────────────────────

export const vnoise2 = Fn(([p_]) => {
  const p = vec2(p_);
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash12(i);
  const b = hash12(i.add(vec2(1, 0)));
  const c = hash12(i.add(vec2(0, 1)));
  const d = hash12(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

export const vnoise3 = Fn(([p_]) => {
  const p = vec3(p_);
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const n000 = hash13(i);
  const n100 = hash13(i.add(vec3(1, 0, 0)));
  const n010 = hash13(i.add(vec3(0, 1, 0)));
  const n110 = hash13(i.add(vec3(1, 1, 0)));
  const n001 = hash13(i.add(vec3(0, 0, 1)));
  const n101 = hash13(i.add(vec3(1, 0, 1)));
  const n011 = hash13(i.add(vec3(0, 1, 1)));
  const n111 = hash13(i.add(vec3(1, 1, 1)));
  const x00 = mix(n000, n100, u.x);
  const x10 = mix(n010, n110, u.x);
  const x01 = mix(n001, n101, u.x);
  const x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
});

/** fbm 2D de 4 oitavas em [0,1]. */
export const fbm2 = Fn(([p_]) => {
  const p = vec2(p_).toVar();
  const s = float(0).toVar();
  const a = float(0.5).toVar();
  for (let i = 0; i < 4; i++) {
    s.addAssign(vnoise2(p).mul(a));
    p.assign(vec2(p.x.mul(1.6).sub(p.y.mul(1.2)), p.x.mul(1.2).add(p.y.mul(1.6))).add(vec2(1.7, 9.2)));
    a.mulAssign(0.5);
  }
  return s.div(0.9375);
});

/** fbm 3D de N oitavas (N fixo em JS) em [0,1]. */
export function fbm3(p_, octaves = 4, lac = 2.03, gain = 0.5) {
  return Fn(([pp]) => {
    const p = vec3(pp).toVar();
    const s = float(0).toVar();
    let a = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      s.addAssign(vnoise3(p).mul(a));
      norm += a;
      p.assign(p.mul(lac).add(vec3(5.2, 1.3, 7.7)));
      a *= gain;
    }
    return s.div(norm);
  })(p_);
}

/** Voronoi 2D → vec2(distância à borda F2−F1, distância F1). */
export const voronoi2 = Fn(([p_]) => {
  const p = vec2(p_);
  const n = floor(p);
  const f = fract(p);
  const f1 = float(8).toVar();
  const f2 = float(8).toVar();
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const g = vec2(i, j);
      const o = hash22(n.add(g));
      const r = g.add(o).sub(f);
      const d = dot(r, r);
      // F2 = min(F2, max(F1, d)) usando o F1 antigo; depois F1 = min(F1, d)
      f2.assign(min(f2, max(f1, d)));
      f1.assign(min(f1, d));
    }
  return vec2(sqrt(f2).sub(sqrt(f1)), sqrt(f1));
});

// ─── cor ────────────────────────────────────────────────────────────────

/**
 * Rampa de corpo negro aproximada (t em [0,1] ≈ 800 K .. 6500 K) em HDR
 * linear. Usada em fogo, metal incandescente, núcleos de explosão.
 */
export const blackbody = Fn(([t_]) => {
  const t = clamp(float(t_), 0, 1);
  const r = smoothstep(0.0, 0.35, t);
  const g = smoothstep(0.18, 0.75, t).mul(0.85);
  const b = smoothstep(0.55, 1.0, t).mul(0.75);
  const c = vec3(r, g.mul(g.add(0.15)), b.mul(b));
  return c.mul(pow(t, 1.6).mul(5).add(0.06));
});

/** Luminância Rec.709. */
export const luma = (c) => dot(c, vec3(0.2126, 0.7152, 0.0722));

export { exp, length, sin, cos, abs };
