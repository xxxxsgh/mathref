// Funções TSL compartilhadas pelo sistema de render: ruído barato (value noise
// 3D com hash sem seno — estável em GPUs móveis), fBm, corpo negro, etc.
import { Fn, vec2, vec3, vec4, float, floor, fract, dot, mix, clamp, exp, pow, smoothstep, max, sin, cos } from 'three/tsl';

/** hash 3D → [0,1) (Dave Hoskins, sem seno). */
export const hash13 = Fn(([p3i]) => {
  const p3 = fract(vec3(p3i).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.zyx.add(31.32)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

/** hash 2D → [0,1). */
export const hash12 = Fn(([pi]) => {
  const p3 = fract(vec3(pi.x, pi.y, pi.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

/** hash 3D → vec3 [0,1). */
export const hash33 = Fn(([pi]) => {
  const p3 = fract(vec3(pi).mul(vec3(0.1031, 0.1030, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yxz.add(33.33)));
  return fract(p3.xxy.add(p3.yxx).mul(p3.zyx));
});

/** Value noise 3D suave, saída em [0,1]. */
export const vnoise3 = Fn(([pIn]) => {
  const p = vec3(pIn);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const a = hash13(i);
  const b = hash13(i.add(vec3(1, 0, 0)));
  const c = hash13(i.add(vec3(0, 1, 0)));
  const d = hash13(i.add(vec3(1, 1, 0)));
  const e = hash13(i.add(vec3(0, 0, 1)));
  const f1 = hash13(i.add(vec3(1, 0, 1)));
  const g = hash13(i.add(vec3(0, 1, 1)));
  const h = hash13(i.add(vec3(1, 1, 1)));
  const x0 = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  const x1 = mix(mix(e, f1, u.x), mix(g, h, u.x), u.y);
  return mix(x0, x1, u.z);
});

/** fBm de 3 oitavas (value noise) em [0,1]. */
export const fbm3 = Fn(([pIn]) => {
  const p = vec3(pIn).toVar();
  const n = vnoise3(p).mul(0.5).toVar();
  n.addAssign(vnoise3(p.mul(2.03).add(17.1)).mul(0.25));
  n.addAssign(vnoise3(p.mul(4.11).add(31.7)).mul(0.125));
  return n.div(0.875);
});

/** fBm de 5 oitavas para superfícies (mais caro). */
export const fbm5 = Fn(([pIn]) => {
  const p = vec3(pIn).toVar();
  const n = float(0).toVar();
  const a = float(0.5).toVar();
  const s = float(0).toVar();
  for (let k = 0; k < 5; k++) {
    n.addAssign(vnoise3(p).mul(a));
    s.addAssign(a);
    p.assign(p.mul(2.02).add(vec3(13.7, 7.3, 21.1)));
    a.mulAssign(0.5);
  }
  return n.div(s);
});

/**
 * Cor de corpo negro aproximada (t: 0 frio → 1 muito quente), linear, não
 * normalizada: vermelho escuro → laranja → amarelo → branco-azulado.
 */
export const blackbody = Fn(([tIn]) => {
  const t = clamp(tIn, 0, 1);
  const r = smoothstep(0.0, 0.35, t);
  const g = smoothstep(0.18, 0.7, t).mul(0.82);
  const b = smoothstep(0.55, 1.0, t).mul(0.75);
  return vec3(r, g.add(r.mul(0.06)), b.add(g.mul(0.08)));
});

/** Luminância Rec.709. */
export const luma = (c) => dot(c, vec3(0.2126, 0.7152, 0.0722));

/** Rotação 2D. */
export const rot2 = (v, a) => vec2(v.x.mul(cos(a)).sub(v.y.mul(sin(a))), v.x.mul(sin(a)).add(v.y.mul(cos(a))));

/** Curva de exposição suave usada em brilhos: 1 - e^(-x). */
export const softSat = (x) => float(1).sub(exp(x.negate()));

export { vec4, pow, max };
