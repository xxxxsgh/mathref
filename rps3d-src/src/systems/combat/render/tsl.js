// Funções TSL do combate: hash/ruído baratos (sem seno, estáveis em GPU móvel)
// e corpo negro aproximado para fogo/metal quente.
import { Fn, vec3, float, floor, fract, dot, mix, clamp, pow, exp } from 'three/tsl';

export const hash13 = Fn(([p]) => {
  const q = fract(vec3(p).mul(0.1031)).toVar();
  q.addAssign(dot(q, q.zyx.add(31.32)));
  return fract(q.x.add(q.y).mul(q.z));
});

/** Value noise 3D em [0,1]. */
export const vnoise = Fn(([pIn]) => {
  const p = vec3(pIn);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const n000 = hash13(i), n100 = hash13(i.add(vec3(1, 0, 0)));
  const n010 = hash13(i.add(vec3(0, 1, 0))), n110 = hash13(i.add(vec3(1, 1, 0)));
  const n001 = hash13(i.add(vec3(0, 0, 1))), n101 = hash13(i.add(vec3(1, 0, 1)));
  const n011 = hash13(i.add(vec3(0, 1, 1))), n111 = hash13(i.add(vec3(1, 1, 1)));
  const a = mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y);
  const b = mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y);
  return mix(a, b, u.z);
});

/** fBm de 3 oitavas em [0,1]. */
export const fbm3 = Fn(([pIn]) => {
  const p = vec3(pIn);
  return vnoise(p).mul(0.55).add(vnoise(p.mul(2.07).add(7.1)).mul(0.3)).add(vnoise(p.mul(4.13).add(3.7)).mul(0.15));
});

/** Corpo negro aproximado: t 0..1 → cor (vermelho escuro → laranja → branco-amarelado). */
export const blackbody = Fn(([tIn]) => {
  const t = clamp(float(tIn), 0, 1);
  const r = clamp(t.mul(2.2), 0, 1);
  const g = clamp(pow(t, 1.6).mul(1.7), 0, 1).mul(0.85);
  const b = clamp(pow(t, 3.5).mul(1.6), 0, 1).mul(0.7);
  return vec3(r, g, b).mul(exp(t.mul(1.5)).sub(0.9));
});
