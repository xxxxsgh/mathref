// Terreno da ilha: grade de alturas procedural + malha toon com cores por
// vértice + textura de detalhe "pincelada" gerada em canvas.
//
// A grade é a ÚNICA fonte da verdade da altura:
//  - a malha usa exatamente esta grade e esta triangulação;
//  - `heightAt` (CPU) interpola com a mesma triangulação da malha;
//  - `dataTexture` (GPU) leva altura, densidade de grama e manchas de cor para
//    os shaders da grama e da água.

import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm, ridged, noise2, distToSegment } from '../core/math.js';
import {
  WORLD_SIZE, GRID_SEG, CELL, HALF, ISLAND_R, LAKE, HILL, RIDGE, KNOLL, FOREST,
  PATHS, CLEARINGS, SPAWN,
} from './layout.js';
import { toonMaterial } from '../render/toon.js';

const N = GRID_SEG + 1;

export const GRASS_COLORS = {
  root: new THREE.Color('#2f5a1e'),
  lime: new THREE.Color('#a6cf45'),
  olive: new THREE.Color('#7a8634'),
  gold: new THREE.Color('#d8bf55'),
};

/** Mistura de ponta da grama a partir do valor de mancha (0..1). */
export function grassTipColor(p, out = new THREE.Color()) {
  // 0 → oliva, 0.5 → lima, 1 → dourado (as manchas)
  if (p < 0.5) return out.copy(GRASS_COLORS.olive).lerp(GRASS_COLORS.lime, smoothstep(0.1, 0.5, p));
  return out.copy(GRASS_COLORS.lime).lerp(GRASS_COLORS.gold, smoothstep(0.68, 0.98, p));
}

function pathDistance(x, z) {
  let d = 1e9;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      d = Math.min(d, distToSegment(x, z, ax, az, bx, bz));
    }
  }
  return d;
}

/** Distância normalizada à costa (≈1 na linha da praia). */
function coastD(x, z) {
  const r = Math.hypot(x, z);
  const warp = fbm(x * 0.0032 + 5.2, z * 0.0032 - 3.1, 3) * 85 + noise2(x * 0.012, z * 0.012) * 12;
  return (r + warp) / ISLAND_R;
}

function gauss(x, z, f) {
  const dx = (x - f.x) / f.r, dz = (z - f.z) / f.r;
  return Math.exp(-(dx * dx + dz * dz) * 2.2);
}

/** Altura "crua" (antes de pintar) em qualquer ponto do mundo. */
function rawHeight(x, z, clearings = true) {
  const d = coastD(x, z);

  // Perfil costeiro: interior → descida suave → praia → fundo do mar.
  let h;
  if (d < 0.8) h = 8;
  else if (d < 0.93) h = lerp(8, 2.2, smoothstep(0.8, 0.93, d));
  else if (d < 1.0) h = lerp(2.2, -0.6, smoothstep(0.93, 1.0, d));
  else h = lerp(-0.6, -16, smoothstep(1.0, 1.18, d));

  const inland = smoothstep(0.92, 0.6, d);

  // Ondulação leve do campo.
  h += fbm(x * 0.008, z * 0.008, 3) * 3.0 * inland;

  // Colinas: gaussianas + cristas para dar forma "pintada".
  const hill = gauss(x, z, HILL);
  const crest = ridged(x * 0.009 + 3, z * 0.009 - 7, 4);
  h += hill * HILL.h * (0.82 + 0.3 * crest);
  h += gauss(x, z, RIDGE) * RIDGE.h * (0.6 + 0.6 * ridged(x * 0.012, z * 0.012, 4));
  h += gauss(x, z, KNOLL) * KNOLL.h * (0.8 + 0.3 * fbm(x * 0.02, z * 0.02, 2));

  // Morros soltos pelo interior (longe do spawn e do lago).
  const away = smoothstep(60, 140, Math.hypot(x - SPAWN.x, z - SPAWN.z)) *
    smoothstep(LAKE.r * 1.6, LAKE.r * 2.6, Math.hypot(x - LAKE.x, z - LAKE.z));
  h += Math.max(0, fbm(x * 0.006 + 11, z * 0.006 + 4, 4) + 0.08) * 42 * inland * away;

  // Platô no topo da colina principal (para o arco).
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  const plateau = smoothstep(HILL.plateauR + 14, HILL.plateauR, dh);
  if (plateau > 0) {
    const top = 8 + HILL.h * 0.96;
    h = lerp(h, top, plateau);
  }

  // Lago: bacia com borda garantidamente acima do nível da água.
  const lr = LAKE.r * (1 + 0.16 * noise2(x * 0.02 + 40, z * 0.02 - 9));
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z) / lr;
  if (ld < 1.6) {
    const rim = smoothstep(1.6, 1.05, ld);
    h = Math.max(h, lerp(h, LAKE.level + 1.1, rim));
    const bowl = LAKE.level - 4.8 * (1 - Math.min(1, ld * ld));
    h = lerp(h, bowl, smoothstep(1.02, 0.82, ld));
  }

  // Clareiras das ruínas: achata levemente.
  if (clearings) for (const c of CLEARINGS) {
    const k = smoothstep(c.r + 6, c.r * 0.6, Math.hypot(x - c.x, z - c.z));
    if (k > 0) h = lerp(h, ringBase(c), k * 0.85);
  }
  return h;
}

const ringBaseCache = new Map();
/** Altura média ao redor do centro da clareira (sem a própria clareira). */
function ringBase(c) {
  const key = c.x + ',' + c.z;
  if (!ringBaseCache.has(key)) {
    let s = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      s += rawHeight(c.x + Math.cos(a) * 4, c.z + Math.sin(a) * 4, false);
    }
    ringBaseCache.set(key, s / 8);
  }
  return ringBaseCache.get(key);
}

export class Terrain {
  constructor() {
    this.heights = new Float32Array(N * N);
    this.grass = new Float32Array(N * N);
    this.patch = new Float32Array(N * N);
    this.forest = new Float32Array(N * N);
    this.surface = new Uint8Array(N * N); // 0 grama, 1 areia, 2 rocha, 3 terra, 4 fundo
    this.normals = new Float32Array(N * N * 3);
    this._generate();
    this.mesh = this._buildMesh();
    this.dataTexture = this._buildDataTexture();
  }

  _generate() {
    const H = this.heights;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        H[iz * N + ix] = rawHeight(x, z);
      }
    }
    // Normais suaves por diferenças centrais.
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const hl = H[iz * N + Math.max(0, ix - 1)], hr = H[iz * N + Math.min(N - 1, ix + 1)];
        const hd = H[Math.max(0, iz - 1) * N + ix], hu = H[Math.min(N - 1, iz + 1) * N + ix];
        const nx = hl - hr, nz = hd - hu, ny = 2 * CELL;
        const l = Math.hypot(nx, ny, nz);
        const i3 = (iz * N + ix) * 3;
        this.normals[i3] = nx / l;
        this.normals[i3 + 1] = ny / l;
        this.normals[i3 + 2] = nz / l;
      }
    }
    // Máscaras: grama, manchas de cor, floresta, tipo de chão.
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iz * N + ix;
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        const h = H[i];
        const ny = this.normals[i * 3 + 1];
        const slope = 1 - ny;

        const patch = clamp(0.5 + 1.15 * fbm(x * 0.011 + 7.7, z * 0.011 - 2.3, 3) + 0.3 * noise2(x * 0.05, z * 0.05), 0, 1);
        this.patch[i] = patch;

        const fd = Math.hypot(x - FOREST.x, z - FOREST.z) / (FOREST.r * (1 + 0.25 * noise2(x * 0.015, z * 0.015)));
        const forest = smoothstep(1.0, 0.7, fd);
        this.forest[i] = forest;

        const pd = pathDistance(x, z);
        const path = 1 - smoothstep(1.3, 3.2, pd + noise2(x * 0.3, z * 0.3) * 0.8);

        const inLake = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.5 && h < LAKE.level + 0.35;
        const beach = h < 2.6;
        const rock = slope > 0.4 + 0.06 * noise2(x * 0.08, z * 0.08);
        let clear = 0;
        for (const c of CLEARINGS) clear = Math.max(clear, smoothstep(c.r + 2, c.r - 2, Math.hypot(x - c.x, z - c.z)));

        let g = 1;
        g *= smoothstep(2.4, 3.6, h); // nada na praia
        g *= 1 - smoothstep(0.32, 0.46, slope); // nada no barranco
        g *= 1 - path * 0.85;
        g *= 1 - clear;
        g *= inLake ? 0 : 1;
        g *= 1 - forest * 0.45;
        // Falhas naturais no campo.
        g *= smoothstep(-0.6, -0.4, fbm(x * 0.03 + 1, z * 0.03 + 5, 2));
        this.grass[i] = clamp(g, 0, 1);

        let s = 0;
        if (h < -0.2) s = 4;
        else if (beach || inLake) s = 1;
        else if (rock) s = 2;
        else if (path > 0.5 || clear > 0.5) s = 3;
        this.surface[i] = s;
      }
    }
  }

  _buildMesh() {
    const pos = new Float32Array(N * N * 3);
    const nor = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);

    const c = new THREE.Color(), tip = new THREE.Color();
    const SAND = new THREE.Color('#f6e2b0');
    const WET = new THREE.Color('#c6a874');
    const SEABED = new THREE.Color('#d8c08a');
    const ROCK = new THREE.Color('#a39184');
    const ROCK2 = new THREE.Color('#8c7f93');
    const DIRT = new THREE.Color('#b68e5e');
    const STONE = new THREE.Color('#c9bba1');
    const MUD = new THREE.Color('#8d8f5c');
    const FLOOR = new THREE.Color('#4d6a26');
    const tmp = new THREE.Color();

    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iz * N + ix;
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        const h = this.heights[i];
        pos.set([x, h, z], i * 3);
        nor.set([this.normals[i * 3], this.normals[i * 3 + 1], this.normals[i * 3 + 2]], i * 3);
        uv.set([x / 8, z / 8], i * 2);

        const slope = 1 - this.normals[i * 3 + 1];
        // Grama (cor de massa vista de longe: entre raiz e ponta).
        grassTipColor(this.patch[i], tip);
        c.copy(GRASS_COLORS.root).lerp(tip, 0.62);
        c.lerp(FLOOR, this.forest[i] * 0.55);
        // Onde a grama rareia, aparece terra.
        c.lerp(DIRT, (1 - this.grass[i]) * 0.15 * smoothstep(3, 4, h));

        // Caminho e clareiras.
        const pd = pathDistance(x, z);
        const path = 1 - smoothstep(1.2, 3.4, pd + noise2(x * 0.3, z * 0.3) * 0.8);
        c.lerp(DIRT, path * 0.9);
        let clear = 0;
        for (const cl of CLEARINGS) clear = Math.max(clear, smoothstep(cl.r + 1, cl.r - 3, Math.hypot(x - cl.x, z - cl.z)));
        c.lerp(STONE, clear * 0.8);

        // Rocha nos barrancos.
        const rockK = smoothstep(0.36, 0.48, slope + 0.06 * noise2(x * 0.08, z * 0.08));
        tmp.copy(ROCK).lerp(ROCK2, 0.5 + 0.5 * noise2(x * 0.03, z * 0.03));
        c.lerp(tmp, rockK);

        // Praia e fundo.
        const sandK = smoothstep(3.2, 2.2, h);
        tmp.copy(SAND).lerp(WET, smoothstep(0.9, -0.2, h));
        c.lerp(tmp, sandK);
        c.lerp(SEABED, smoothstep(-0.5, -4, h));

        // Margem/fundo do lago.
        const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
        if (ld < LAKE.r * 1.6) {
          const shore = smoothstep(LAKE.level + 1.0, LAKE.level + 0.2, h);
          c.lerp(SAND, shore * 0.7);
          c.lerp(MUD, smoothstep(LAKE.level, LAKE.level - 2.5, h));
        }
        col.set([c.r, c.g, c.b], i * 3);
      }
    }

    const idx = new Uint32Array(GRID_SEG * GRID_SEG * 6);
    let k = 0;
    for (let iz = 0; iz < GRID_SEG; iz++) {
      for (let ix = 0; ix < GRID_SEG; ix++) {
        const a = iz * N + ix; // (x0,z0)
        const b = (iz + 1) * N + ix; // (x0,z1)
        const cc = (iz + 1) * N + ix + 1; // (x1,z1)
        const d = iz * N + ix + 1; // (x1,z0)
        // Mesma ordem do heightAt: (a,b,d) e (b,cc,d).
        idx[k++] = a; idx[k++] = b; idx[k++] = d;
        idx[k++] = b; idx[k++] = cc; idx[k++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();

    const mat = toonMaterial({
      key: 'terrain', vertexColors: true, map: makeDetailTexture(), rim: 0.25,
      patch: (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec3 d1 = texture2D(map, vMapUv).rgb;
            vec3 d2 = texture2D(map, vMapUv * 0.23 + vec2(0.31, 0.17)).rgb;
            float dfade = smoothstep(110.0, 25.0, length(vViewPosition));
            diffuseColor.rgb *= mix(vec3(1.0), (d1 * 0.55 + d2 * 0.45) * 1.07, dfade);
          #endif`);
      },
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  _buildDataTexture() {
    const data = new Uint16Array(N * N * 4);
    const toH = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < N * N; i++) {
      data[i * 4] = toH(this.heights[i]);
      data[i * 4 + 1] = toH(this.grass[i]);
      data[i * 4 + 2] = toH(this.patch[i]);
      data[i * 4 + 3] = toH(this.forest[i]);
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /** Altura exata da malha (mesma triangulação). */
  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= GRID_SEG || fz >= GRID_SEG) return -16;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const H = this.heights;
    const ha = H[iz * N + ix], hb = H[(iz + 1) * N + ix], hc = H[(iz + 1) * N + ix + 1], hd = H[iz * N + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  _sample(arr, x, z) {
    const fx = clamp((x + HALF) / CELL, 0, GRID_SEG - 0.001), fz = clamp((z + HALF) / CELL, 0, GRID_SEG - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const a = arr[iz * N + ix], b = arr[iz * N + ix + 1], c = arr[(iz + 1) * N + ix], d = arr[(iz + 1) * N + ix + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  grassAt(x, z) { return this._sample(this.grass, x, z); }
  forestAt(x, z) { return this._sample(this.forest, x, z); }
  patchAt(x, z) { return this._sample(this.patch, x, z); }

  surfaceAt(x, z) {
    const ix = clamp(Math.round((x + HALF) / CELL), 0, GRID_SEG);
    const iz = clamp(Math.round((z + HALF) / CELL), 0, GRID_SEG);
    return ['grass', 'sand', 'rock', 'dirt', 'sand'][this.surface[iz * N + ix]];
  }

  /** Uniforms para shaders que leem a grade (grama, água). */
  shaderUniforms() {
    return {
      uTerrain: { value: this.dataTexture },
      uTerrainInfo: { value: new THREE.Vector3(HALF, CELL, N) },
    };
  }
}

/** GLSL: amostra a DataTexture do terreno em coordenadas do mundo. */
export const GLSL_TERRAIN = /* glsl */ `
uniform sampler2D uTerrain;
uniform vec3 uTerrainInfo; // HALF, CELL, N
vec4 terrainSample(vec2 xz){
  vec2 uv = ((xz + uTerrainInfo.x) / uTerrainInfo.y + 0.5) / uTerrainInfo.z;
  return texture2D(uTerrain, uv);
}
`;

/** Textura de detalhe pintada: manchas e pinceladas suaves, sem emenda. */
function makeDetailTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(236,236,236)';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (x, y, rad, col) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 70; i++) blob(r() * S, r() * S, 10 + r() * 40, `rgba(255,255,240,${0.12 + r() * 0.12})`);
  for (let i = 0; i < 70; i++) blob(r() * S, r() * S, 8 + r() * 30, `rgba(150,140,170,${0.08 + r() * 0.1})`);
  // Pinceladas curtas.
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 4 + r() * 10;
    const light = r() > 0.5;
    g.strokeStyle = light ? `rgba(255,255,230,${0.1 + r() * 0.12})` : `rgba(120,110,140,${0.08 + r() * 0.1})`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
