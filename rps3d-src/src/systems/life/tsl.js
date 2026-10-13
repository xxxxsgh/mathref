// Funções TSL do sistema `life`: hash sem seno (estável em GPUs móveis),
// value noise 3D, fBm curto e células (Voronoi 3D barato) para padrões de pele.
import { Fn, vec3, float, floor, fract, dot, mix, min, length } from 'three/tsl';

export const hash13 = Fn(([p3i]) => {
  const p3 = fract(vec3(p3i).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.zyx.add(31.32)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

export const hash33 = Fn(([p3i]) => {
  const p3 = fract(vec3(p3i).mul(vec3(0.1031, 0.1030, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yxz.add(33.33)));
  return fract(p3.xxy.add(p3.yxx).mul(p3.zyx));
});

/** Value noise 3D em [0,1]. */
export const vnoise = Fn(([pIn]) => {
  const p = vec3(pIn);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const a = hash13(i), b = hash13(i.add(vec3(1, 0, 0))), c = hash13(i.add(vec3(0, 1, 0))), d = hash13(i.add(vec3(1, 1, 0)));
  const e = hash13(i.add(vec3(0, 0, 1))), f1 = hash13(i.add(vec3(1, 0, 1))), g = hash13(i.add(vec3(0, 1, 1))), h = hash13(i.add(vec3(1, 1, 1)));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
});

/** fBm 3D de 3 oitavas em [0,1]. */
export const fbm3 = Fn(([pIn]) => {
  const p = vec3(pIn).toVar();
  const n = vnoise(p).mul(0.5).toVar();
  n.addAssign(vnoise(p.mul(2.03).add(17.1)).mul(0.25));
  n.addAssign(vnoise(p.mul(4.11).add(31.7)).mul(0.125));
  return n.div(0.875);
});

/** Distância à célula mais próxima (F1) de um Voronoi 3D com 8 vizinhos (barato). */
export const cells3 = Fn(([pIn]) => {
  const p = vec3(pIn);
  const i = floor(p.sub(0.5)).toVar();
  const best = float(9).toVar();
  for (let z = 0; z <= 1; z++) for (let y = 0; y <= 1; y++) for (let x = 0; x <= 1; x++) {
    const c = i.add(vec3(x, y, z));
    const o = c.add(hash33(c).mul(0.8).add(0.1));
    best.assign(min(best, length(p.sub(o))));
  }
  return best;
});
