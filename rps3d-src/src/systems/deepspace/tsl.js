// Funções TSL compartilhadas do espaço profundo: hashes, ruído por textura 3D,
// cor de corpo negro e o campo estelar procedural (usado pelo fundo E pela
// lente gravitacional do buraco negro — as mesmas estrelas são distorcidas).
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, fract, dot, floor, abs, max, min, normalize, length, exp, pow,
  mix, smoothstep, clamp, texture3D, step, select,
} from 'three/tsl';
import { getNoise3D } from './noise3d.js';

export const noiseTex = () => getNoise3D();

/** Amostra a textura de ruído 3D (nível 0 explícito: seguro dentro de laços). */
export const n3 = (p) => texture3D(noiseTex(), p, float(0));

/** Hash 3→3 (Dave Hoskins, sem seno: estável em float32 até ~1e4). */
export const hash33 = Fn(([p_]) => {
  const p = vec3(p_).toVar();
  const p3 = fract(p.mul(vec3(0.1031, 0.1030, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yxz.add(33.33)));
  return fract(p3.xxy.add(p3.yxx).mul(p3.zyx));
}).setLayout({ name: 'ds_hash33', type: 'vec3', inputs: [{ name: 'p', type: 'vec3' }] });

export const hash13 = Fn(([p_]) => {
  const p3 = fract(vec3(p_).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.zyx.add(31.32)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}).setLayout({ name: 'ds_hash13', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

/** Cor aproximada de corpo negro para t∈[0,1]: vermelho → amarelo → branco → azul. */
export const starTint = Fn(([t_]) => {
  const t = float(t_);
  const red = vec3(1.0, 0.45, 0.22), yel = vec3(1.0, 0.82, 0.58), wht = vec3(0.95, 0.96, 1.0), blu = vec3(0.6, 0.74, 1.0);
  const a = mix(red, yel, smoothstep(0.0, 0.35, t));
  const b = mix(a, wht, smoothstep(0.35, 0.7, t));
  return mix(b, blu, smoothstep(0.7, 1.0, t));
}).setLayout({ name: 'ds_starTint', type: 'vec3', inputs: [{ name: 't', type: 'float' }] });

/**
 * Uma camada do campo estelar. Estrelas vivem em células de uma grade 3D sobre
 * a superfície do cubo unitário (sem ramificar por face). Cada célula tem no
 * máximo uma estrela, com centro afastado das bordas → basta a própria célula.
 */
const starLayer = Fn(([d, N, prob, bright, pa, seed]) => {
  const ad = abs(d);
  const m = max(ad.x, max(ad.y, ad.z));
  const p = d.div(m).mul(N);
  const cell = floor(p);
  const h = hash33(cell.add(seed));
  const h2 = hash33(cell.add(seed).add(vec3(17.17, 3.31, 9.71)));
  const s = cell.add(0.5).add(h.sub(0.5).mul(0.5));
  const sd = normalize(s);
  const ang = length(sd.sub(d));
  const mag = pow(h2.x, float(14.0)).mul(bright.mul(7.0)).add(pow(h2.z, float(3.0)).mul(bright.mul(0.16))).add(bright.mul(0.015)).mul(step(h.z, prob));
  const sig = pa.mul(float(0.42).add(clamp(mag, 0.0, 6.0).mul(0.05)));
  const core = exp(ang.mul(ang).div(sig.mul(sig).mul(-2.0)));
  const halo = exp(ang.div(pa.mul(1.6)).negate()).mul(clamp(mag.sub(1.5), 0.0, 8.0).mul(0.03));
  const col = starTint(h2.y.mul(h2.y.mul(0.6).add(0.4)));
  return col.mul(mag.mul(core).add(halo));
}).setLayout({
  name: 'ds_starLayer', type: 'vec3',
  inputs: [{ name: 'd', type: 'vec3' }, { name: 'N', type: 'float' }, { name: 'prob', type: 'float' }, { name: 'bright', type: 'float' }, { name: 'pa', type: 'float' }, { name: 'seed', type: 'vec3' }],
});

/**
 * Campo estelar procedural para a direção `d` (normalizada).
 * pa = ângulo de um pixel (rad); dens = densidade relativa (Via Láctea / nebulosa).
 */
export const starField = Fn(([d, pa, dens]) => {
  const dd = clamp(dens, 0.0, 2.0);
  const c = starLayer(d, float(38), float(0.16), float(1.0), pa, vec3(1.3, 7.1, 3.7)).toVar();
  c.addAssign(starLayer(d, float(105), clamp(dd.mul(0.10).add(0.05), 0.0, 0.4), float(0.35), pa, vec3(5.1, 2.3, 8.9)));
  c.addAssign(starLayer(d, float(250), clamp(dd.mul(0.08).add(0.012), 0.0, 0.3), float(0.14), pa, vec3(9.4, 4.4, 1.2)));
  c.addAssign(starLayer(d, float(520), clamp(dd.mul(0.07).sub(0.01), 0.0, 0.25), float(0.06), pa, vec3(2.8, 8.8, 6.6)));
  return c;
}).setLayout({ name: 'ds_starField', type: 'vec3', inputs: [{ name: 'd', type: 'vec3' }, { name: 'pa', type: 'float' }, { name: 'dens', type: 'float' }] });

/** fBm barato a partir da textura 3D (3 amostras). Saída ~[0,1]. */
export const fbmTex = Fn(([p]) => {
  const a = n3(p).r;
  const b = n3(p.mul(2.03).add(0.31)).g;
  const c = n3(p.mul(4.11).add(0.67)).r;
  return a.mul(0.55).add(b.mul(0.3)).add(c.mul(0.15));
}).setLayout({ name: 'ds_fbmTex', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

export { THREE, select, vec2, vec4, min };

// ─── bump procedural (derivadas de tela) ─────────────────────────────────
import { positionView, normalView, faceDirection } from 'three/tsl';

/**
 * Normal perturbada por uma altura PROCEDURAL (Mikkelsen, "bump mapping
 * unparametrized surfaces"): usa dFdx/dFdy da própria altura, então serve
 * para qualquer ruído — sem textura nem UV.
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
