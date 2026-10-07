// Utilidades TSL compartilhadas pelo sistema "space": ruído via textura 3D,
// fBm, hashes, corpo negro e perturbação de normal por altura procedural.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, texture3D, fract, sin, dot, abs, mix, clamp, pow, exp, max, min, normalize, cross, dFdx, dFdy, sign,
  positionView, normalViewGeometry, faceDirection, uniform, smoothstep,
} from 'three/tsl';
import { noiseTexture3D } from './noiseTex.js';

let _tex = null;
export function noiseTex() {
  if (!_tex) _tex = noiseTexture3D();
  return _tex;
}

/** Amostra crua da textura 3D (vec4 em [0,1]). `p` em unidades de "tile". */
export const noise4 = (p) => texture3D(noiseTex(), p, 0);

/**
 * fBm de ~5 oitavas com 2 buscas na textura. Saída ≈ [0,1] centrada em 0.5.
 * `p` em unidades de tile (1 = textura inteira = 4 células da oitava base).
 */
export const fbm = Fn(([p]) => {
  const a = noise4(p);
  const b = noise4(p.mul(2.137).add(vec3(0.31, 0.17, 0.73)));
  const n = a.x.mul(0.5).add(a.y.mul(0.25)).add(a.w.mul(0.125)).add(b.y.mul(0.0625)).add(b.w.mul(0.0625));
  return n.div(1.0);
});

/** fBm "fofo" (mistura Worley + gradiente) — bom para nuvens e nebulosas. */
export const billow = Fn(([p]) => {
  const a = noise4(p);
  const b = noise4(p.mul(2.31).add(vec3(0.5, 0.21, 0.13)));
  return a.z.mul(0.45).add(a.y.mul(0.2)).add(b.z.mul(0.2)).add(b.w.mul(0.15));
});

/** Ruído "crista" (ridged) ∈ [0,1]: 1 nas linhas — veios, filamentos. */
export const ridged = Fn(([p]) => {
  const a = noise4(p);
  const r1 = float(1).sub(abs(a.y.sub(0.5)).mul(2));
  const r2 = float(1).sub(abs(a.w.sub(0.5)).mul(2));
  return r1.mul(r1).mul(0.65).add(r2.mul(r2).mul(0.35));
});

/** Hash 3D → float [0,1). */
export const hash13 = Fn(([p]) => {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
});
/** Hash 3D → vec3 [0,1). */
export const hash33 = Fn(([p]) => {
  const q = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(q).mul(43758.5453));
});

/**
 * Cor de corpo negro aproximada (linear, normalizada no máximo do canal)
 * para temperatura em kelvin — versão TSL (T é um nó float).
 */
export const blackbody = Fn(([T]) => {
  const t = clamp(T, 1000.0, 40000.0).div(100.0);
  const r = mix(float(1.0), clamp(pow(max(t.sub(60.0), 1.0), -0.1332047592).mul(1.29293618606), 0.0, 1.0), smoothstep(65.0, 67.0, t));
  const gLow = clamp(t.log().mul(0.390081578769).sub(0.631841443788), 0.0, 1.0);
  const gHigh = clamp(pow(max(t.sub(60.0), 1.0), -0.0755148492).mul(1.12989086089), 0.0, 1.0);
  const g = mix(gLow, gHigh, smoothstep(65.0, 67.0, t));
  const bLow = clamp(max(t.sub(10.0), 1.0).log().mul(0.543206789110).sub(1.19625408914), 0.0, 1.0);
  const b = mix(mix(float(0.0), bLow, smoothstep(18.0, 20.0, t)), float(1.0), smoothstep(65.0, 67.0, t));
  // sRGB → linear aproximado
  return pow(vec3(r, g, b), vec3(2.2));
});

/** Versão CPU do corpo negro → [r,g,b] linear normalizado. */
export function blackbodyRGB(T) {
  const t = Math.min(400, Math.max(10, T / 100));
  let r, g, b;
  if (t <= 66) {
    r = 1;
    g = Math.min(1, Math.max(0, 0.390081578769 * Math.log(t) - 0.631841443788));
    b = t <= 19 ? 0 : Math.min(1, Math.max(0, 0.54320678911 * Math.log(t - 10) - 1.19625408914));
  } else {
    r = Math.min(1, Math.max(0, 1.29293618606 * Math.pow(t - 60, -0.1332047592)));
    g = Math.min(1, Math.max(0, 1.12989086089 * Math.pow(t - 60, -0.0755148492)));
    b = 1;
  }
  return [r ** 2.2, g ** 2.2, b ** 2.2];
}

/**
 * Normal em espaço de visão perturbada por um campo de altura procedural
 * (método do gradiente de superfície de Mikkelsen). Use em material.normalNode.
 */
export const bumpNormal = Fn(([height, scale]) => {
  const h = height.mul(scale);
  const dHdx = dFdx(h);
  const dHdy = dFdy(h);
  const sx = dFdx(positionView);
  const sy = dFdy(positionView);
  const n = normalViewGeometry;
  const r1 = cross(sy, n);
  const r2 = cross(n, sx);
  const det = dot(sx, r1).mul(faceDirection);
  const grad = sign(det).mul(dHdx.mul(r1).add(dHdy.mul(r2)));
  return normalize(abs(det).mul(n).sub(grad));
});

/** Uniforms de câmera compartilhados (atualizados pelo index a cada frame). */
export const camU = {
  right: uniform(new THREE.Vector3(1, 0, 0)),
  up: uniform(new THREE.Vector3(0, 1, 0)),
  /** ângulo (rad) de um pixel na vertical: 2·tan(fov/2)/alturaPx */
  pixelAngle: uniform(0.0017),
  time: uniform(0),
  /** visibilidade do céu (1 = espaço, 0 = céu diurno opaco) */
  skyVis: uniform(1),
};

/**
 * smoothstep seguro: aceita bordas invertidas (a > b) quando ambas são
 * números JS — GLSL/WGSL deixam smoothstep com borda invertida indefinido.
 */
export function sstep(a, b, x) {
  if (typeof a === 'number' && typeof b === 'number' && a > b) return float(1).sub(smoothstep(b, a, x));
  return smoothstep(a, b, x);
}
