// Estilo visual "tinta e aquarela": materiais toon em 4 tons, contorno de
// tinta por casco invertido e ruído para manchas de aquarela.
import * as THREE from 'three';

export const PAL = {
  ink: 0x2a2342,
  paper: 0xf4ead5,
  coat: 0x7a5ab8,
  coatDark: 0x4a3a78,
  gold: 0xf3c653,
  hair: 0x5a3a2a,
  ribbon: 0x4fc3b0,
  cap: 0xe8833a,
  skin: 0xffe3c8,
  cheek: 0xf4a3a3,
  boot: 0x6b4a3a,
  berry: 0xe04a5f,
  leaf: 0x5f9a5c,
  stem: 0x4d7f48,
  rock: 0x8b7f8f,
  lava: 0xff8a3d,
  wood: 0x9a6a45,
  sand: 0xe8c98f,
};

let _grad = null;
export function gradientMap() {
  if (_grad) return _grad;
  const d = new Uint8Array([80, 80, 80, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}

const _toon = new Map();
/** Material toon compartilhado por cor. `unique` cria um novo (para animar). */
export function toon(color, o = {}, unique = false) {
  const key = color + '|' + JSON.stringify(o);
  if (!unique && _toon.has(key)) return _toon.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...o });
  if (!unique) _toon.set(key, m);
  return m;
}

const _outline = new Map();
export function outlineMat(w, color = PAL.ink) {
  const key = w + '|' + color;
  if (_outline.has(key)) return _outline.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n transformed += normalize(normal) * ${w.toFixed(4)};`
    );
  };
  m.customProgramCacheKey = () => 'outline' + w;
  _outline.set(key, m);
  return m;
}

/** Malha toon com contorno de tinta. */
export function mesh(geom, color, o = {}) {
  const { outline = 0.03, mat, unique, ...rest } = o;
  const material = mat || toon(color, rest, unique);
  const m = new THREE.Mesh(geom, material);
  if (outline) {
    const ol = new THREE.Mesh(geom, outlineMat(outline));
    ol.name = 'outline';
    ol.raycast = () => {};
    m.add(ol);
  }
  return m;
}

/** Malha sem contorno e sem sombreamento (olhos, brilhos). */
export function flat(geom, color, o = {}) {
  return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, ...o }));
}

const _blobMat = new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.22, depthWrite: false });
export function blob(r = 0.4) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), _blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

export function starGeom(r1 = 0.2, r2 = 0.09, depth = 0.06, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 1 });
  g.center();
  return g;
}

// ─── ruído (para manchas de aquarela no chão dos planetas) ───
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
const sm = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf
  );
}
export function fbm3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/** Gerador pseudo-aleatório com semente, para cenários reprodutíveis. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const col = (c) => new THREE.Color(c);

let _glowTex = null;
/** Brilho suave (sprite aditivo com degradê radial). */
export function glow(color = 0xffd060, size = 1, opacity = 0.8) {
  if (!_glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}
