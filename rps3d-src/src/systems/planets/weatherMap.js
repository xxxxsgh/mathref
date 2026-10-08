// Mapa de clima por corpo (textura equirretangular gerada na CPU uma vez):
// define ONDE há nuvens em escala de planeta — faixas por latitude (zona de
// convergência equatorial, cinturões secos subtropicais, trilhas de
// tempestade nas latitudes médias), frentes por ruído com domínio torcido e
// ciclones em espiral. As nuvens volumétricas, a sombra das nuvens no relevo
// e a visão de órbita leem a mesma textura, então o que se vê do espaço é o
// que se atravessa na descida.
//
// Canais (0..1):
//   R  cobertura (fração do céu com nuvem)
//   G  tipo: 0 = estrato baixo e chato, 1 = cúmulo alto/torre de tempestade
//   B  umidade/precipitação (escurece a base, alimenta o clima local)
//   A  cirros (véu alto e fino)
//
// Coordenadas: u = atan2(z, x)/2π + 0,5 ; v = asin(y)/π + 0,5 no referencial
// LOCAL do corpo (o eixo de rotação real entra só no cálculo das faixas).
import * as THREE from 'three/webgpu';
import { Noise, Rng } from '../../core/Rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Perfil de clima por bioma: cobertura base, contraste, ciclones, tipo. */
const PROFILE = {
  lush: { cov: 0.0, bands: 1.0, cyclones: 4, swirl: 4.2, type: 0.6, cirrus: 0.5 },
  ocean: { cov: 0.08, bands: 1.0, cyclones: 6, swirl: 5.0, type: 0.65, cirrus: 0.5 },
  toxic: { cov: 0.18, bands: 0.5, cyclones: 2, swirl: 3.5, type: 0.35, cirrus: 0.2 },
  desert: { cov: -0.25, bands: 0.6, cyclones: 1, swirl: 3.0, type: 0.25, cirrus: 0.8 },
  ice: { cov: 0.05, bands: 0.7, cyclones: 3, swirl: 4.5, type: 0.2, cirrus: 0.35 },
  volcanic: { cov: -0.05, bands: 0.3, cyclones: 1, swirl: 2.5, type: 0.45, cirrus: 0.1 },
  dead: { cov: -1, bands: 0, cyclones: 0, swirl: 0, type: 0, cirrus: 0 },
  gas: { cov: 0.2, bands: 1.0, cyclones: 3, swirl: 4, type: 0.5, cirrus: 0.3 },
};

const cache = new Map();

/** Amostrador CPU (mesma lógica da textura) — usado pelo clima local e testes. */
export function makeWeatherSampler(body) {
  const P = PROFILE[body.type] || PROFILE.lush;
  const n = new Noise((body.seed ^ 0x2c9277b5) >>> 0);
  const n2 = new Noise((body.seed ^ 0x6a09e667) >>> 0);
  const r = new Rng((body.seed ^ 0x1f83d9ab) >>> 0);
  const tilt = body.axialTilt || 0;
  const ax = [Math.sin(tilt), Math.cos(tilt), 0];
  const amount = clamp(body.clouds ?? 0.5, 0, 1);
  // ciclones: centro, raio angular, sentido (hemisfério), força
  const cyc = [];
  for (let i = 0; i < P.cyclones; i++) {
    const hemi = r.chance(0.5) ? 1 : -1;
    const lat = hemi * r.range(0.22, 0.85);
    const lon = r.range(0, Math.PI * 2);
    // centro em coordenadas do eixo real
    const e1 = norm(cross(ax, [0.31, 0.0, 0.95])), e2 = cross(ax, e1);
    const cl = Math.cos(lat);
    const c = [0, 1, 2].map((k) => ax[k] * Math.sin(lat) + (e1[k] * Math.cos(lon) + e2[k] * Math.sin(lon)) * cl);
    cyc.push({ c: norm(c), rad: r.range(0.16, 0.34), dir: hemi, k: P.swirl * r.range(0.7, 1.3) });
  }
  const out = { cov: 0, type: 0, wet: 0, cirrus: 0 };
  const fbm = (N, x, y, z, oct) => {
    let a = 1, f = 1, s = 0, w = 0;
    for (let o = 0; o < oct; o++) { s += a * N.noise3(x * f, y * f, z * f); w += a; a *= 0.5; f *= 2.03; }
    return s / w;
  };
  return (x, y, z) => {
    let p = [x, y, z];
    let eye = 0;
    // espirais: gira o domínio em torno de cada centro (mais perto = mais giro)
    for (const C of cyc) {
      const d = Math.acos(clamp(dot(p, C.c), -1, 1));
      if (d > C.rad * 2.6) continue;
      const t = d / C.rad;
      const ang = C.dir * C.k * Math.exp(-t * t * 0.9);
      p = rotate(p, C.c, ang);
      eye = Math.max(eye, Math.exp(-t * t * 1.6) * (1 - sstep(0.0, 0.07, t)));
    }
    const lat = dot(p, ax); // seno da latitude
    const aLat = Math.abs(lat);
    // domínio torcido em duas camadas → frentes alongadas
    const F = 1.3;
    const wx = fbm(n2, p[0] * F + 3.1, p[1] * F, p[2] * F, 3);
    const wy = fbm(n2, p[0] * F, p[1] * F + 7.7, p[2] * F, 3);
    const wz = fbm(n2, p[0] * F, p[1] * F, p[2] * F + 1.3, 3);
    // estiramento zonal (ventos alísios/oeste alongam as nuvens em latitude)
    const q = [p[0] + wx * 0.45, p[1] * 2.2 + wy * 0.45, p[2] + wz * 0.45];
    const base = fbm(n, q[0] * 1.7, q[1] * 1.7, q[2] * 1.7, 6);
    const fine = fbm(n2, q[0] * 6.0, q[1] * 6.0, q[2] * 6.0, 3);
    // faixas: ZCIT (equador), secas em ~28°, trilhas de tempestade em ~55°
    const band = (sstep(0.32, 0.0, aLat) * 0.22 - sstep(0.18, 0.45, aLat) * sstep(0.62, 0.45, aLat) * 0.28
      + sstep(0.55, 0.8, aLat) * sstep(1.0, 0.85, aLat) * 0.2) * P.bands;
    let c = base * 1.05 + fine * 0.12 + band + P.cov + (amount - 0.5) * 0.9 + 0.2;
    for (const C of cyc) {
      const d = Math.acos(clamp(dot([x, y, z], C.c), -1, 1)) / C.rad;
      c += Math.exp(-d * d * 1.2) * 0.35; // ciclones são úmidos
    }
    c -= eye * 0.9; // olho limpo
    out.cov = sstep(0.05, 0.75, c);
    out.type = clamp(P.type + base * 0.9 + sstep(0.35, 0.0, aLat) * 0.25 - sstep(0.75, 1.0, aLat) * 0.3, 0, 1);
    out.wet = sstep(0.45, 0.85, c);
    const ci = fbm(n, q[0] * 1.3 + 9, q[1] * 6.0, q[2] * 1.3 - 4, 4);
    out.cirrus = sstep(0.05, 0.45, ci + (P.cirrus - 0.5) * 0.5) * (P.cirrus > 0 ? 1 : 0);
    return out;
  };
}

/** Textura do mapa de clima (cacheada por corpo). */
export function weatherTexture(body, W = 512) {
  const key = body.id + ':' + W;
  if (cache.has(key)) return cache.get(key);
  const H = W >> 1;
  const sample = makeWeatherSampler(body);
  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H, lat = (v - 0.5) * Math.PI;
    const cy = Math.sin(lat), cr = Math.cos(lat);
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, lon = (u - 0.5) * Math.PI * 2;
      const s = sample(Math.cos(lon) * cr, cy, Math.sin(lon) * cr);
      const k = (j * W + i) * 4;
      data[k] = s.cov * 255; data[k + 1] = s.type * 255; data[k + 2] = s.wet * 255; data[k + 3] = s.cirrus * 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.sampler = sample;
  cache.set(key, tex);
  return tex;
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
/** Rodrigues: gira p em torno do eixo unitário k. */
function rotate(p, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, p), x = cross(k, p);
  return [p[0] * c + x[0] * s + k[0] * d * (1 - c), p[1] * c + x[1] * s + k[1] * d * (1 - c), p[2] * c + x[2] * s + k[2] * d * (1 - c)];
}
