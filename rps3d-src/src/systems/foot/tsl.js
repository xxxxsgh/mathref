// Funções TSL do sistema `foot`: ruído barato (value noise com hash sem seno —
// estável em GPUs móveis), fBm, normal por "bump" procedural via derivadas de
// tela (funciona com qualquer altura procedural, sem textura) e Voronoi 2D.
import {
  Fn, vec2, vec3, float, floor, fract, dot, mix, normalize, cross, abs, sign, dFdx, dFdy, positionView, normalView, min, sqrt, select,
} from 'three/tsl';

/** hash 3D → [0,1). */
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

/** hash 2D → vec2 [0,1). */
export const hash22 = Fn(([pi]) => {
  const p3 = fract(vec3(pi.x, pi.y, pi.x).mul(vec3(0.1031, 0.1030, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.xx.add(p3.yz).mul(p3.zy));
});

/** Value noise 3D suave em [0,1]. */
export const vnoise = Fn(([pIn]) => {
  const p = vec3(pIn);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const a = hash13(i), b = hash13(i.add(vec3(1, 0, 0))), c = hash13(i.add(vec3(0, 1, 0))), d = hash13(i.add(vec3(1, 1, 0)));
  const e = hash13(i.add(vec3(0, 0, 1))), f1 = hash13(i.add(vec3(1, 0, 1))), g = hash13(i.add(vec3(0, 1, 1))), h = hash13(i.add(vec3(1, 1, 1)));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
});

/** Value noise 2D em [0,1]. */
export const vnoise2 = Fn(([pIn]) => {
  const p = vec2(pIn);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const a = hash12(i), b = hash12(i.add(vec2(1, 0))), c = hash12(i.add(vec2(0, 1))), d = hash12(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/** fBm 3D de 3 oitavas em [0,1]. */
export const fbm = Fn(([pIn]) => {
  const p = vec3(pIn).toVar();
  const n = vnoise(p).mul(0.5).toVar();
  n.addAssign(vnoise(p.mul(2.03).add(17.1)).mul(0.25));
  n.addAssign(vnoise(p.mul(4.11).add(31.7)).mul(0.125));
  return n.div(0.875);
});

/** fBm 2D de 4 oitavas em [0,1]. */
export const fbm2 = Fn(([pIn]) => {
  const p = vec2(pIn).toVar();
  const n = float(0).toVar();
  n.addAssign(vnoise2(p).mul(0.5));
  n.addAssign(vnoise2(p.mul(2.07).add(5.3)).mul(0.25));
  n.addAssign(vnoise2(p.mul(4.13).add(11.9)).mul(0.125));
  n.addAssign(vnoise2(p.mul(8.29).add(23.1)).mul(0.0625));
  return n.div(0.9375);
});

/**
 * Voronoi 2D: retorna vec3(distância à borda (F2−F1), F1, id da célula).
 */
export const voronoi2 = Fn(([pIn]) => {
  const p = vec2(pIn);
  const i = floor(p), f = fract(p);
  const f1 = float(8).toVar(), f2 = float(8).toVar(), id = float(0).toVar();
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const g = vec2(x, y);
      const o = hash22(i.add(g));
      const r = g.add(o).sub(f);
      const d = dot(r, r);
      const closer = d.lessThan(f1).toVar();
      f2.assign(select(closer, f1, min(f2, d)));
      id.assign(select(closer, hash12(i.add(g).add(3.7)), id));
      f1.assign(select(closer, d, f1));
    }
  }
  return vec3(sqrt(f2).sub(sqrt(f1)), sqrt(f1), id);
});

/**
 * Normal de vista perturbada por uma altura procedural h (em metros) usando
 * derivadas de tela (Mikkelsen, "bump mapping unparametrized surfaces").
 */
export function bumpNormal(h, scale = 1) {
  return Fn(() => {
    const pos = positionView;
    const n = normalize(normalView);
    const dpdx = dFdx(pos), dpdy = dFdy(pos);
    const dhdx = dFdx(h).mul(scale), dhdy = dFdy(h).mul(scale);
    const r1 = cross(dpdy, n), r2 = cross(n, dpdx);
    const det = dot(dpdx, r1);
    const grad = r1.mul(dhdx).add(r2.mul(dhdy)).mul(sign(det));
    return normalize(abs(det).mul(n).sub(grad));
  })();
}
