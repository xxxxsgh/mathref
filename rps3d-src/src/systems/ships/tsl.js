// Funções TSL do sistema `ships`: hashes sem seno (estáveis em GPU móvel),
// value noise 3D, fBm curto e bump procedural por derivadas de tela.
import {
  Fn, vec3, float, floor, fract, dot, mix, positionView, normalView, faceDirection,
} from 'three/tsl';

/** hash 3D → [0,1) (Dave Hoskins). */
export const hash13 = Fn(([p_]) => {
  const p3 = fract(vec3(p_).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.zyx.add(31.32)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}).setLayout({ name: 'sh_hash13', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

/** hash 3D → vec3 [0,1). */
export const hash33 = Fn(([p_]) => {
  const p3 = fract(vec3(p_).mul(vec3(0.1031, 0.1030, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yxz.add(33.33)));
  return fract(p3.xxy.add(p3.yxx).mul(p3.zyx));
}).setLayout({ name: 'sh_hash33', type: 'vec3', inputs: [{ name: 'p', type: 'vec3' }] });

/** Value noise 3D suave em [0,1]. */
export const vnoise = Fn(([p_]) => {
  const p = vec3(p_).toVar();
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const a = hash13(i), b = hash13(i.add(vec3(1, 0, 0)));
  const c = hash13(i.add(vec3(0, 1, 0))), d = hash13(i.add(vec3(1, 1, 0)));
  const e = hash13(i.add(vec3(0, 0, 1))), g = hash13(i.add(vec3(1, 0, 1)));
  const h = hash13(i.add(vec3(0, 1, 1))), k = hash13(i.add(vec3(1, 1, 1)));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}).setLayout({ name: 'sh_vnoise', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

/** fBm de 3 oitavas em [0,1]. */
export const fbm = Fn(([p_]) => {
  const p = vec3(p_).toVar();
  const n = vnoise(p).mul(0.5).toVar();
  n.addAssign(vnoise(p.mul(2.07).add(17.1)).mul(0.3));
  n.addAssign(vnoise(p.mul(4.31).add(31.7)).mul(0.2));
  return n;
}).setLayout({ name: 'sh_fbm', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

/**
 * Normal (espaço de vista) perturbada por uma altura procedural qualquer
 * (Mikkelsen — derivadas de tela, sem UV/tangente).
 */
export const bumpNormal = (H, scale) => {
  const h = float(H);
  const dHx = h.dFdx().mul(scale), dHy = h.dFdy().mul(scale);
  const sx = positionView.dFdx(), sy = positionView.dFdy();
  const vN = normalView;
  const R1 = sy.cross(vN), R2 = vN.cross(sx);
  const fDet = sx.dot(R1).mul(faceDirection);
  const grad = fDet.sign().mul(dHx.mul(R1).add(dHy.mul(R2)));
  return fDet.abs().mul(vN).sub(grad).normalize();
};
