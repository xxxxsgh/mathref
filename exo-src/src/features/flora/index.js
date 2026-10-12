/**
 * FLORA — vegetação, fungos, cristais e rochas procedurais do EXOSFERA.
 *
 * Arquivos:
 *   textures.js  texturas-array procedurais (Canvas 2D → albedo/recorte + normal/espessura/emissivo)
 *   builder.js   montador de geometria (tubos de transporte paralelo, cartas arqueadas, normais de volume)
 *   plants.js    geradores paramétricos: grama, flores, rosetas, árvores (ramificação recursiva),
 *                palmeiras, fungos gigantes, tentáculos, cristais, rochas
 *   species.js   espécies por bioma com cores tiradas da paleta do planeta
 *   material.js  MeshStandardMaterial estendido: vento, fade/rareamento, translucidez, emissão
 *   imposter.js  impostores multi-ângulo (8 azimutes) assados no init, iluminados pelo mesmo PBR
 *   cells.js     grade de células na cubo-esfera equiângula, azulejos de Poisson, ruído
 *
 * Espalhamento: três CAMADAS de células (grama ~12 m, pequenas ~24 m,
 * grandes ~80 m) em volta da câmera, geradas sob demanda (fatiadas por
 * orçamento de tempo, as mais próximas primeiro) com pontos de Poisson e
 * semente por célula — determinístico. Altura e normal vêm do `planet`
 * (heightAt/normalAt, a MESMA função da malha), densidade/tingimento do
 * `biomeAt`. Grama e plantas pequenas só nascem onde o planet já entregou
 * chunks finos (evento `terrain:chunk`): a flora segue o streaming do terreno.
 *
 * Desenho: GPU instancing — UMA InstancedMesh por espécie/variação/LOD, com
 * os buffers remontados quando a câmera anda/gira (culling por frustum e
 * distância por célula e, nas grandes, por instância; LOD0 → LOD1 →
 * impostor por distância). As instâncias são relativas a uma ÂNCORA
 * flutuante (origem de render), alinhadas à normal da esfera e afundadas
 * pela inclinação (nunca flutuando).
 *
 * Serviço `flora` (CONTRACT §13): near(worldPos, r), remove(id), density(dir),
 * evento `flora:remove`. Sobrescritas de preset (`ctx.shot.preset.params`):
 * floraBiome (força a lista de espécies), floraWind (0..2).
 */
import * as THREE from 'three';
import { buildFloraTextures } from './textures.js';
import { createSharedUniforms, makeFloraMaterial } from './material.js';
import { speciesFor } from './species.js';
import { bakeImposter, imposterGeometry, makeImposterMaterial } from './imposter.js';
import { cellOf, cellDir, poissonTile, sym, fbm3 } from './cells.js';
import { mulberry32, xmur3 } from '../../core/Rng.js';

const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _s = new THREE.Sphere();
const _m4 = new THREE.Matrix4();

/** Camadas de espalhamento. perM2 = pontos de Poisson por m² (antes da densidade). */
const LAYER_DEF = {
  grass: { cellM: 12, perM2: 3.0, range: 55, near: 12 },
  small: { cellM: 24, perM2: 0.1, range: 80, near: 28 },
  large: { cellM: 80, perM2: 0.016, range: 800 },
};
const LAYERS = ['grass', 'small', 'large'];

function hashStr(...parts) {
  return xmur3(parts.join('/'))();
}
function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export default {
  name: 'flora',
  order: 30,

  async init(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'flora';
    this.root.matrixAutoUpdate = true;
    ctx.scene.add(this.root);
    this.anchor = new ctx.WorldPos();
    this.anchorSet = false;
    this.handle = ctx.space.registerFloating(this.root, this.anchor);
    this.shared = createSharedUniforms();
    this.cells = new Map();
    this.queue = [];
    this.removed = new Set();
    this.chunks = new Map();
    this.sawChunks = false;
    this.meshes = new Map();
    this.frustum = new THREE.Frustum();
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastFwd = new THREE.Vector3();
    this.lastScan = new THREE.Vector3(1e9, 0, 0);
    this.dirtyAssemble = true;
    this.readyToken = null;
    this.stats = { cells: 0, instances: 0, drawn: 0, genMs: 0, meshes: 0 };

    const q = ctx.quality || {};
    await ctx.bootProgress?.('flora: texturas', 0.75);
    const tex = buildFloraTextures((q.textureSize ?? 2048) >= 2048 ? 512 : 256, Math.min(8, q.anisotropy ?? 4));
    this.shared.tFAlb.value = tex.tAlb;
    this.shared.tFNrm.value = tex.tNrm;
    this.shared.uTexSize.value = tex.size;
    this.tex = tex;

    this._setup();
    this._publish();
    this.offs = [
      ctx.bus.on('terrain:chunk', (e) => this._onChunk(e)),
      ctx.bus.on('terrain:edit', (e) => this._onEdit(e)),
      ctx.bus.on('planet:enter', () => (this.needsReset = true)),
      ctx.bus.on('system:enter', () => (this.needsReset = true)),
      ctx.bus.on('space:recenter', () => (this.needsReset = true)),
      ctx.bus.on('quality:change', () => (this.needsReset = true)),
    ];
  },

  // ─── configuração por planeta ──────────────────────────────────────
  _setup() {
    const ctx = this.ctx;
    const planet = ctx.services.planet;
    this.planet = planet;
    const q = ctx.quality || {};
    const pp = ctx.shot?.preset?.params || {};
    const R = planet?.radius ?? 120000;
    this.R = R;
    const cfg = planet?.config || {};
    this.planetSeed = (cfg.seed ?? ctx.seed.hash('flora', ctx.start?.galaxy ?? 0, ctx.start?.systemIndex ?? 0, ctx.start?.planetIndex ?? 0)) >>> 0;
    const biome = pp.floraBiome ?? planet?.biome?.id ?? 'lush';
    this.biome = biome;
    const P = planet?.palette || { grass: [0.1, 0.3, 0.05], grass2: [0.05, 0.2, 0.08], dry: [0.3, 0.27, 0.05], rock: [0.15, 0.15, 0.17], rock2: [0.3, 0.25, 0.2], sand: [0.6, 0.5, 0.3], snow: [0.9, 0.9, 0.95], accent: [0.9, 0.35, 0.5] };
    this.palette = P;
    this.density = q.floraDensity ?? 1;
    const D = q.floraDistance ?? 800;
    this.windStr = pp.floraWind ?? 0.7;
    // camadas no nível de células deste raio
    this.L = {};
    for (const k of LAYERS) {
      const d = LAYER_DEF[k];
      const S = Math.max(4, Math.round((Math.PI / 2) * R / d.cellM));
      const cellM = ((Math.PI / 2) * R) / S;
      const range = k === 'large' ? D : k === 'grass' ? d.range * Math.min(1.2, Math.max(0.6, Math.sqrt(this.density))) : d.range * Math.min(1.2, Math.max(0.6, this.density));
      const n = Math.max(4, Math.round(d.perM2 * cellM * cellM * (k === 'large' ? 1 : Math.min(1.3, this.density))));
      this.L[k] = { ...d, S, cellM, range, n, tile: poissonTile(n, hashStr('flora-tile', k)) };
    }
    this.seaLevel = planet?.seaLevel ?? null;
    // espécies e malhas
    this._disposeMeshes();
    const species = planet ? speciesFor(biome, P, this.planetSeed) : [];
    this.species = species;
    this.byLayer = { grass: [], small: [], large: [] };
    const t0 = performance.now();
    species.forEach((sp, si) => {
      sp.index = si;
      sp.nVar = sp.variants ?? 1;
      sp.geos = [];
      for (let v = 0; v < sp.nVar; v++) {
        const seed = hashStr('flora-geo', this.planetSeed, sp.id, v);
        const lods = [sp.gen(mulberry32(seed), 0, sp.params).build()];
        lods.push(sp.gen(mulberry32(seed), 1, sp.params).build());
        const bb = lods[0].boundingBox;
        sp.height = Math.max(sp.height ?? 0, bb.max.y);
        sp.bound = Math.max(sp.bound ?? 0, lods[0].boundingSphere.radius + lods[0].boundingSphere.center.length());
        let imp = null;
        if (sp.imposter) {
          try {
            imp = bakeImposter(ctx.renderer, lods[0], this.shared, 256);
          } catch (err) {
            ctx.report?.('flora', 'imposter', err);
            imp = null;
          }
        }
        sp.geos.push({ lods, imp });
      }
      this.byLayer[sp.layer].push(sp);
      this._makeMeshes(sp);
    });
    this.stats.buildMs = performance.now() - t0;
    this.stats.meshes = this.meshes.size;
    this.cells.clear();
    this.queue.length = 0;
    this.dirtyAssemble = true;
    this.lastScan.set(1e9, 0, 0);
  },

  _makeMeshes(sp) {
    const Lc = this.L[sp.layer];
    sp.geos.forEach((g, v) => {
      const lodList = [];
      if (sp.layer === 'grass') {
        lodList.push([0, g.lods[0], { thin: [Lc.near * 0.6, Lc.near * 1.4, 0.5] }, 6000]);
        lodList.push([1, g.lods[1], { fade: [Lc.range * 0.72, Lc.range], thin: [Lc.near, Lc.range, 0.3] }, 12000]);
      } else if (sp.layer === 'small') {
        lodList.push([0, g.lods[0], {}, 1500]);
        lodList.push([1, g.lods[1], { fade: [Lc.range * 0.7, Lc.range] }, 3000]);
      } else {
        lodList.push([0, g.lods[0], {}, 400]);
        lodList.push([1, g.lods[1], {}, 800]);
      }
      for (const [lod, geo, opts, cap] of lodList) {
        const { mat, depth } = makeFloraMaterial(this.shared, { ...opts, stiff: sp.stiff ?? 1, transl: sp.transl ?? 1 });
        const shadow = !!sp.shadow && sp.layer === 'large' && (lod === 0 || sp.kind === 'tree' || sp.kind === 'mushroom');
        this._addMesh(`${sp.id}#${v}#${lod}`, geo, mat, depth, cap, shadow, sp);
      }
      if (g.imp) {
        const { mat } = makeImposterMaterial(g.imp, this.shared);
        this._addMesh(`${sp.id}#${v}#2`, imposterGeometry(), mat, null, 1500, false, sp);
      }
    });
  },

  _addMesh(key, geo, mat, depth, cap, shadow, sp) {
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (depth) mesh.customDepthMaterial = depth;
    mesh.count = 0;
    mesh.visible = false;
    mesh.name = `flora:${key}`;
    this.root.add(mesh);
    this.meshes.set(key, { mesh, cap, sp, count: 0 });
  },

  _grow(entry, need) {
    const cap = Math.ceil(need * 1.5);
    const old = entry.mesh;
    const geo = old.geometry;
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, old.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = old.castShadow;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = old.customDepthMaterial;
    mesh.name = old.name;
    this.root.remove(old);
    old.dispose?.();
    this.root.add(mesh);
    entry.mesh = mesh;
    entry.cap = cap;
  },

  _disposeMeshes() {
    for (const { mesh } of this.meshes.values()) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.customDepthMaterial?.dispose();
      mesh.dispose?.();
    }
    this.meshes.clear();
    for (const sp of this.species || []) for (const g of sp.geos || []) {
      g.imp?.alb.dispose();
      g.imp?.nrm.dispose();
    }
  },

  // ─── eventos do terreno ────────────────────────────────────────────
  _onChunk(e) {
    if (!e?.id) return;
    this.sawChunks = true;
    if (e.added) this.chunks.set(e.id, { c: e.center, r: e.radius, lod: e.lod });
    else this.chunks.delete(e.id);
    this.chunksDirty = true;
  },
  _onEdit(e) {
    if (!e?.worldPos) return;
    for (const [k, c] of this.cells) {
      if (!c.center) continue;
      const d = Math.hypot(c.center.x - e.worldPos.x, c.center.y - e.worldPos.y, c.center.z - e.worldPos.z);
      if (d < c.radius + (e.radius || 2) + 2) {
        this.cells.delete(k);
      }
    }
    this.dirtyAssemble = true;
    this.lastScan.set(1e9, 0, 0);
  },

  /** a célula (grama/pequenas) já está coberta por um chunk fino do terreno? */
  _covered(dir, layer) {
    if (!this.sawChunks || layer === 'large') return true;
    const C = this.ctx.space.planetCenter;
    const R = this.R;
    const px = C.x + dir.x * R, py = C.y + dir.y * R, pz = C.z + dir.z * R;
    const maxR = layer === 'grass' ? 260 : 520;
    for (const ch of this.chunks.values()) {
      if (ch.r > maxR) continue;
      const dx = ch.c.x - px, dy = ch.c.y - py, dz = ch.c.z - pz;
      if (dx * dx + dy * dy + dz * dz < ch.r * ch.r * 1.1) return true;
    }
    return false;
  },

  // ─── varredura de células desejadas ────────────────────────────────
  _scan() {
    const ctx = this.ctx;
    const o = ctx.space.origin, C = ctx.space.planetCenter;
    const rx = o.x - C.x, ry = o.y - C.y, rz = o.z - C.z;
    const dist = Math.hypot(rx, ry, rz);
    const u0 = new THREE.Vector3(rx / dist, ry / dist, rz / dist);
    const hg = this.planet.heightAt(u0);
    const alt = dist - this.R - hg;
    const fr = ctx.Geo.tangentFrame(u0);
    const want = new Set();
    for (const layer of LAYERS) {
      const Lc = this.L[layer];
      if (!this.byLayer[layer].length) continue;
      const range = Lc.range + Lc.cellM * 0.75;
      if (alt > range) continue;
      const rh = Math.sqrt(Math.max(0, range * range - Math.max(0, alt) ** 2));
      const step = Lc.cellM * 0.5;
      const Rg = this.R + hg;
      for (let y = -rh; y <= rh + 1e-6; y += step) {
        for (let x = -rh; x <= rh + 1e-6; x += step) {
          if (x * x + y * y > rh * rh) continue;
          _d.copy(u0).multiplyScalar(Rg).addScaledVector(fr.east, x).addScaledVector(fr.north, y).normalize();
          const c = cellOf(_d.x, _d.y, _d.z, Lc.S);
          const key = `${layer}|${c.key}`;
          if (want.has(key)) continue;
          want.add(key);
          if (!this.cells.has(key)) {
            const cell = { key, layer, f: c.f, i: c.i, j: c.j, S: Lc.S, state: 'new', groups: null };
            // centro aproximado (sem altura) para prioridade
            cellDir(c.f, c.i, c.j, Lc.S, 0.5, 0.5, _e);
            cell.dir = _e.clone();
            cell.center = null;
            this.cells.set(key, cell);
          }
        }
      }
    }
    // remove as que saíram do alcance (com folga)
    for (const [k, c] of this.cells) {
      if (want.has(k)) continue;
      const Lc = this.L[c.layer];
      const d = c.center ? Math.hypot(c.center.x - o.x, c.center.y - o.y, c.center.z - o.z) : 1e9;
      if (d > Lc.range + Lc.cellM * 2 || !c.center) {
        this.cells.delete(k);
        this.dirtyAssemble = true;
      }
    }
    this.want = want;
  },

  // ─── geração de uma célula ─────────────────────────────────────────
  _gen(cell) {
    const ctx = this.ctx;
    const planet = this.planet;
    const R = this.R;
    const C = ctx.space.planetCenter;
    const Lc = this.L[cell.layer];
    const { f, i, j, S } = cell;
    const rnd = mulberry32(hashStr('flora', this.planetSeed, cell.layer, f, i, j));
    const sk = Math.floor(rnd() * 8);
    // centro e raio
    cellDir(f, i, j, S, 0.5, 0.5, _d);
    const hc = planet.heightAt(_d);
    const center = new ctx.WorldPos(C.x + _d.x * (R + hc), C.y + _d.y * (R + hc), C.z + _d.z * (R + hc));
    cell.center = center;
    cell.up = _d.clone();
    cellDir(f, i, j, S, 0, 0, _e);
    cell.radius = Math.acos(Math.min(1, _e.dot(_d))) * R * 1.05;
    // grade de bioma 3×3 (densidade, tingimento regional, rocha, submerso)
    const BG = 3;
    const bio = [];
    const P = this.palette;
    for (let t = 0; t < BG; t++) {
      for (let s = 0; s < BG; s++) {
        cellDir(f, i, j, S, s / (BG - 1), t / (BG - 1), _e);
        const b = planet.biomeAt?.(_e);
        const loc = b?.palette?.local || P.grass;
        bio.push({
          flora: b?.flora ?? 0.6,
          tint: [loc[0] / Math.max(1e-3, P.grass[0]), loc[1] / Math.max(1e-3, P.grass[1]), loc[2] / Math.max(1e-3, P.grass[2])],
          rock: b?.rock ?? 0,
          snow: b?.snow ?? 0,
        });
      }
    }
    const bioAt = (s, t) => {
      const x = s * (BG - 1), y = t * (BG - 1);
      const x0 = Math.min(BG - 2, Math.floor(x)), y0 = Math.min(BG - 2, Math.floor(y));
      const fx = x - x0, fy = y - y0;
      const a = bio[y0 * BG + x0], b = bio[y0 * BG + x0 + 1], c = bio[(y0 + 1) * BG + x0], d = bio[(y0 + 1) * BG + x0 + 1];
      const L2 = (k) => (a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy;
      const tint = [0, 1, 2].map((q) => (a.tint[q] * (1 - fx) + b.tint[q] * fx) * (1 - fy) + (c.tint[q] * (1 - fx) + d.tint[q] * fx) * fy);
      return { flora: L2('flora'), rock: L2('rock'), snow: L2('snow'), tint };
    };
    // grade de altura para grama/pequenas (interpolação bilinear; grandes usam heightAt exato)
    let HG = 0, hgrid = null;
    if (cell.layer !== 'large') {
      HG = cell.layer === 'grass' ? 7 : 9;
      hgrid = new Float64Array(HG * HG);
      for (let t = 0; t < HG; t++) for (let s = 0; s < HG; s++) {
        cellDir(f, i, j, S, s / (HG - 1), t / (HG - 1), _e);
        hgrid[t * HG + s] = planet.heightAt(_e);
      }
    }
    const hAt = (s, t) => {
      const x = s * (HG - 1), y = t * (HG - 1);
      const x0 = Math.min(HG - 2, Math.floor(x)), y0 = Math.min(HG - 2, Math.floor(y));
      const fx = x - x0, fy = y - y0;
      const a = hgrid[y0 * HG + x0], b = hgrid[y0 * HG + x0 + 1], c = hgrid[(y0 + 1) * HG + x0], d = hgrid[(y0 + 1) * HG + x0 + 1];
      return { h: (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy, gx: ((b - a) * (1 - fy) + (d - c) * fy) * (HG - 1), gy: ((c - a) * (1 - fx) + (d - b) * fx) * (HG - 1) };
    };
    const spList = this.byLayer[cell.layer];
    const groups = new Map();
    const getG = (key, sp, v) => {
      let g = groups.get(key);
      if (!g) {
        g = { key, sp, v, m: [], inst: [], col: [], ids: [], far: [], n: 0 };
        groups.set(key, g);
      }
      return g;
    };
    const tile = Lc.tile;
    const nPts = tile.length / 4;
    const dens = cell.layer === 'large' ? 1 : this.density;
    const sea = this.seaLevel;
    const cellMeters = Lc.cellM;
    // tangentes da célula nas direções s e t (para a normal aproximada da grade de altura)
    const Es = new THREE.Vector3(), Et = new THREE.Vector3();
    cellDir(f, i, j, S, 0.6, 0.5, Es);
    cellDir(f, i, j, S, 0.5, 0.6, Et);
    Es.sub(cell.up).normalize();
    Et.sub(cell.up).normalize();
    const fr = this.ctx.Geo.tangentFrame(cell.up);
    for (let k = 0; k < nPts; k++) {
      const [x, y] = sym(sk, tile[k * 4], tile[k * 4 + 1]);
      const rank = tile[k * 4 + 2];
      const r2 = tile[k * 4 + 3];
      const b = bioAt(x, y);
      cellDir(f, i, j, S, x, y, _d);
      // máscara de floresta/clareira (grandes) e manchas (grama)
      let accept;
      if (cell.layer === 'large') {
        const fm = fbm3(_d.x * R / 320, _d.y * R / 320, _d.z * R / 320, this.planetSeed & 1023, 3);
        const forest = 0.04 + 0.96 * smooth(0.42, 0.6, fm);
        accept = rank < b.flora * forest * 0.9 + b.rock * 0.08;
      } else if (cell.layer === 'grass') {
        const pm = fbm3(_d.x * R / 18, _d.y * R / 18, _d.z * R / 18, 77, 2);
        accept = rank < Math.min(1, b.flora * 1.35) * dens * (0.55 + 0.75 * smooth(0.25, 0.6, pm)) * (spList[0]?.density ?? 1);
      } else {
        accept = rank < b.flora * dens * 0.9;
      }
      if (!accept) continue;
      // espécie por peso × manchas por espécie
      let tot = 0;
      const ws = [];
      for (let q = 0; q < spList.length; q++) {
        const sp = spList[q];
        let w = sp.weight ?? 1;
        if (sp.cluster) {
          const sc = cell.layer === 'large' ? 140 : 26;
          const cn = fbm3(_d.x * R / sc, _d.y * R / sc, _d.z * R / sc, 31 + sp.index * 13, 2);
          w *= 1 - sp.cluster + sp.cluster * 2.2 * smooth(0.38, 0.66, cn);
        }
        if (sp.kind === 'rock') w *= 1 + b.rock * 5;
        else if (b.rock > 0.5) w *= 0.25;
        ws.push(w);
        tot += w;
      }
      if (tot <= 0) continue;
      let pick = r2 * tot, sp = spList[0];
      for (let q = 0; q < spList.length; q++) {
        pick -= ws[q];
        if (pick <= 0) {
          sp = spList[q];
          break;
        }
      }
      // altura e inclinação
      let h, slope, nx = 0, ny = 0, nz = 0;
      if (hgrid) {
        const hh = hAt(x, y);
        h = hh.h;
        const gx = hh.gx / cellMeters, gy = hh.gy / cellMeters;
        slope = Math.sqrt(gx * gx + gy * gy);
        // normal aproximada do terreno (para inclinar a grama metade do caminho)
        nx = _d.x - (Es.x * gx + Et.x * gy);
        ny = _d.y - (Es.y * gx + Et.y * gy);
        nz = _d.z - (Es.z * gx + Et.z * gy);
      } else {
        h = planet.heightAt(_d);
        planet.normalAt(_d, _n);
        const c = _n.dot(_d);
        slope = Math.sqrt(Math.max(0, 1 - c * c)) / Math.max(0.05, c);
        nx = _n.x; ny = _n.y; nz = _n.z;
      }
      if (sea != null && h < sea + 0.4) continue;
      if (slope > (sp.slopeMax ?? 0.6) * 1.6) continue;
      const v = Math.floor(rnd() * (sp.nVar || 1));
      const s0 = sp.scale?.[0] ?? 1, s1 = sp.scale?.[1] ?? 1;
      const scl = s0 + (s1 - s0) * Math.pow(rnd(), 1.6);
      // afundamento pela inclinação (a base nunca fica no ar)
      const baseR = (sp.radius ?? 0.2) * scl;
      const sink = cell.layer === 'grass' ? 0.03 : baseR * Math.min(1.5, slope) + (sp.kind === 'rock' ? baseR * 0.25 : 0.06);
      const rr = R + h - sink;
      const wx = C.x + _d.x * rr, wy = C.y + _d.y * rr, wz = C.z + _d.z * rr;
      // base ortonormal: Y = normal da esfera (grama: metade para a normal do terreno)
      _Y.copy(_d);
      if (cell.layer === 'grass' || sp.kind === 'rock' || sp.kind === 'plant' || sp.kind === 'flower') {
        const bl = sp.kind === 'rock' ? 0.7 : 0.45;
        _n.set(nx, ny, nz).normalize();
        _Y.lerp(_n, bl).normalize();
      }
      const lean = sp.kind === 'tree' || sp.kind === 'mushroom' ? 0.05 : sp.kind === 'grass' ? 0.12 : 0.08;
      const yaw = rnd() * Math.PI * 2;
      const la = rnd() * Math.PI * 2, lm = rnd() * lean;
      _Y.addScaledVector(fr.east, Math.cos(la) * lm).addScaledVector(fr.north, Math.sin(la) * lm).normalize();
      _X.copy(fr.east).multiplyScalar(Math.cos(yaw)).addScaledVector(fr.north, Math.sin(yaw));
      _X.addScaledVector(_Y, -_X.dot(_Y)).normalize();
      _Z.crossVectors(_X, _Y);
      const g = getG(`${sp.id}#${v}`, sp, v);
      g.m.push(_X.x * scl, _X.y * scl, _X.z * scl, 0, _Y.x * scl, _Y.y * scl, _Y.z * scl, 0, _Z.x * scl, _Z.y * scl, _Z.z * scl, 0, wx - center.x, wy - center.y, wz - center.z, 1);
      g.inst.push(rank, rnd(), 0, 0);
      // cor: variação individual × tingimento regional (grama segue a cor do chão)
      const jit = 0.82 + rnd() * 0.36;
      const hj = (rnd() - 0.5) * 0.12;
      let cr = jit * (1 + hj), cg = jit, cb = jit * (1 - hj);
      if (cell.layer !== 'large' || sp.kind === 'plant') {
        const tw = cell.layer === 'grass' ? 1 : 0.5;
        cr *= 1 + (Math.min(3, b.tint[0]) - 1) * tw;
        cg *= 1 + (Math.min(3, b.tint[1]) - 1) * tw;
        cb *= 1 + (Math.min(3, b.tint[2]) - 1) * tw;
      }
      g.col.push(cr, cg, cb);
      g.ids.push(k);
      if (cell.layer === 'grass' && rank < 0.5) g.far.push(g.n);
      g.n++;
    }
    // remove o que já foi minerado nesta sessão
    for (const g of groups.values()) {
      g.m = new Float32Array(g.m);
      g.inst = new Float32Array(g.inst);
      g.col = new Float32Array(g.col);
      g.alive = new Uint8Array(g.n).fill(1);
      for (let q = 0; q < g.n; q++) if (this.removed.has(this._id(cell, g, q))) g.alive[q] = 0;
    }
    cell.groups = groups;
    cell.maxH = Math.max(1, ...spList.map((s) => (s.bound ?? 1) * (s.scale?.[1] ?? 1)));
    cell.state = 'ready';
  },

  _id(cell, g, q) {
    return `${cell.layer}|${cell.f}:${cell.i}:${cell.j}|${g.key}|${g.ids[q]}`;
  },

  // ─── montagem dos buffers de instância ─────────────────────────────
  _assemble() {
    const ctx = this.ctx;
    const cam = ctx.camera;
    const o = ctx.space.origin;
    const A = this.anchor;
    const ax = A.x - o.x, ay = A.y - o.y, az = A.z - o.z; // âncora em espaço de render
    cam.updateMatrixWorld();
    _m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_m4, THREE.WebGLCoordinateSystem, cam.reversedDepth);
    // fase 1: o que vai para cada malha
    const plan = new Map();
    const add = (key, cell, g, idx) => {
      let p = plan.get(key);
      if (!p) plan.set(key, (p = []));
      p.push(cell, g, idx);
    };
    let total = 0;
    for (const cell of this.cells.values()) {
      if (cell.state !== 'ready') continue;
      const c = cell.center;
      const dx = c.x - A.x, dy = c.y - A.y, dz = c.z - A.z;
      const rx = dx + ax, ry = dy + ay, rz = dz + az;
      const dist = Math.hypot(rx, ry, rz);
      const Lc = this.L[cell.layer];
      if (dist - cell.radius > Lc.range) continue;
      _s.center.set(rx, ry, rz);
      _s.radius = cell.radius + cell.maxH;
      const vis = this.frustum.intersectsSphere(_s);
      if (!vis && dist > cell.radius + 30) continue;
      cell.dA = [dx, dy, dz];
      for (const g of cell.groups.values()) {
        if (!g.n) continue;
        if (cell.layer === 'grass') {
          const near = dist - cell.radius < Lc.near;
          add(`${g.key}#${near ? 0 : 1}`, cell, g, near ? null : g.far);
        } else if (cell.layer === 'small') {
          add(`${g.key}#${dist - cell.radius < Lc.near ? 0 : 1}`, cell, g, null);
        } else {
          // grandes: LOD e culling por instância
          const sp = g.sp;
          const l0 = sp.lod?.[0] ?? 80, l1 = sp.lod?.[1] ?? 240;
          const hasImp = this.meshes.has(`${g.key}#2`);
          const lists = [[], [], []];
          const m = g.m;
          for (let q = 0; q < g.n; q++) {
            if (!g.alive[q]) continue;
            const px = m[q * 16 + 12] + rx, py = m[q * 16 + 13] + ry, pz = m[q * 16 + 14] + rz;
            const sc = Math.hypot(m[q * 16 + 4], m[q * 16 + 5], m[q * 16 + 6]);
            const d = Math.hypot(px, py, pz);
            if (d > Lc.range) continue;
            _s.center.set(px + m[q * 16 + 4] * sp.height * 0.5, py + m[q * 16 + 5] * sp.height * 0.5, pz + m[q * 16 + 6] * sp.height * 0.5);
            _s.radius = (sp.bound ?? 5) * sc;
            if (!this.frustum.intersectsSphere(_s) && d > 40 + _s.radius) continue;
            const lod = d < l0 ? 0 : d < l1 || !hasImp ? 1 : 2;
            lists[lod].push(q);
          }
          for (let lod = 0; lod < 3; lod++) if (lists[lod].length) add(`${g.key}#${lod}`, cell, g, lists[lod]);
        }
      }
    }
    // fase 2: escreve
    for (const [key, e] of this.meshes) {
      const p = plan.get(key);
      let need = 0;
      if (p) for (let k = 0; k < p.length; k += 3) need += p[k + 2] ? p[k + 2].length : p[k + 1].n;
      if (need > e.cap) this._grow(e, need);
      const mesh = e.mesh;
      const M = mesh.instanceMatrix.array, I = mesh.geometry.getAttribute('aInst'), Cc = mesh.instanceColor.array;
      const IA = I.array;
      let n = 0;
      if (p) {
        for (let k = 0; k < p.length; k += 3) {
          const cell = p[k], g = p[k + 1], idx = p[k + 2];
          const [dx, dy, dz] = cell.dA;
          const cnt = idx ? idx.length : g.n;
          for (let t = 0; t < cnt; t++) {
            const q = idx ? idx[t] : t;
            if (!g.alive[q]) continue;
            const s = q * 16, d = n * 16;
            for (let z = 0; z < 12; z++) M[d + z] = g.m[s + z];
            M[d + 12] = g.m[s + 12] + dx;
            M[d + 13] = g.m[s + 13] + dy;
            M[d + 14] = g.m[s + 14] + dz;
            M[d + 15] = 1;
            IA[n * 4] = g.inst[q * 4];
            IA[n * 4 + 1] = g.inst[q * 4 + 1];
            IA[n * 4 + 2] = g.inst[q * 4 + 2];
            IA[n * 4 + 3] = g.inst[q * 4 + 3];
            Cc[n * 3] = g.col[q * 3];
            Cc[n * 3 + 1] = g.col[q * 3 + 1];
            Cc[n * 3 + 2] = g.col[q * 3 + 2];
            n++;
          }
        }
      }
      mesh.count = n;
      mesh.visible = n > 0;
      e.count = n;
      total += n;
      if (n) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, n * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, n * 3);
        mesh.instanceColor.needsUpdate = true;
        I.clearUpdateRanges();
        I.addUpdateRange(0, n * 4);
        I.needsUpdate = true;
      }
    }
    this.stats.drawn = total;
  },

  // ─── quadro ────────────────────────────────────────────────────────
  frame(dt, ctx) {
    if (!this.planet) {
      if (!ctx.services.planet) return;
      this.needsReset = true;
    }
    if (this.needsReset) {
      this.needsReset = false;
      this._setup();
    }
    if (!this.species.length) return;
    const o = ctx.space.origin;
    // âncora flutuante (re-ancora a cada 1,5 km)
    if (!this.anchorSet || Math.hypot(o.x - this.anchor.x, o.y - this.anchor.y, o.z - this.anchor.z) > 1500) {
      this.anchor.set(o.x, o.y, o.z);
      this.anchorSet = true;
      this.dirtyAssemble = true;
      const P = 1000;
      const m = (v) => ((v % P) + P) % P;
      this.shared.uAnchorMod.value.set(m(o.x), m(o.y), m(o.z));
      this.root.position.set(this.anchor.x - o.x, this.anchor.y - o.y, this.anchor.z - o.z);
    }
    // varredura quando a câmera anda
    const camMoved = Math.hypot(o.x - this.lastScan.x, o.y - this.lastScan.y, o.z - this.lastScan.z);
    if (camMoved > 3 || this.chunksDirty) {
      this.lastScan.set(o.x, o.y, o.z);
      this.chunksDirty = false;
      this._scan();
    }
    // fila: células novas e cobertas pelo terreno, mais perto primeiro
    const pending = [];
    for (const c of this.cells.values()) {
      if (c.state !== 'new') continue;
      if (!this._covered(c.dir, c.layer)) continue;
      const C = ctx.space.planetCenter;
      const R = this.R;
      c.prio = Math.hypot(C.x + c.dir.x * R - o.x, C.y + c.dir.y * R - o.y, C.z + c.dir.z * R - o.z) / (c.layer === 'grass' ? 3 : c.layer === 'small' ? 2 : 1);
      pending.push(c);
    }
    pending.sort((a, b) => a.prio - b.prio);
    const budget = ctx.shot ? 250 : this.readyToken ? 20 : 5;
    const t0 = performance.now();
    let k = 0;
    for (; k < pending.length; k++) {
      if (performance.now() - t0 > budget && k > 0) break;
      try {
        this._gen(pending[k]);
      } catch (err) {
        pending[k].state = 'error';
        ctx.report?.('flora', 'gen', err);
      }
      this.dirtyAssemble = true;
    }
    this.stats.genMs = performance.now() - t0;
    const left = pending.length - k;
    if (left > 0 && !this.readyToken) this.readyToken = ctx.ready.busy('flora: células ao redor da câmera');
    else if (left === 0 && this.readyToken) {
      this.readyToken();
      this.readyToken = null;
    }
    // remonta quando anda/gira
    const cam = ctx.camera;
    const fwd = _e.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const moved = Math.hypot(o.x - this.lastCam.x, o.y - this.lastCam.y, o.z - this.lastCam.z);
    if (this.dirtyAssemble || moved > 2 || fwd.dot(this.lastFwd) < 0.9985) {
      this.lastCam.set(o.x, o.y, o.z);
      this.lastFwd.copy(fwd);
      this.dirtyAssemble = false;
      this._assemble();
    }
    this.stats.cells = this.cells.size;
    this._uniforms(ctx);
  },

  _uniforms(ctx) {
    const U = this.shared;
    U.uTime.value = ctx.time?.world ?? ctx.time?.now ?? 0;
    const sky = ctx.services.sky;
    const cam = ctx.camera;
    if (sky?.sunDirection) {
      U.uSunDirV.value.copy(sky.sunDirection).transformDirection(cam.matrixWorldInverse);
      const c = sky.sunColor;
      const I = sky.sunIntensity ?? 3;
      if (c?.isColor) U.uSunRad.value.set(c.r * I, c.g * I, c.b * I);
      else if (Array.isArray(c)) U.uSunRad.value.set(c[0] * I, c[1] * I, c[2] * I);
      // abaixo do horizonte: sem translucidez do sol
      const up = ctx.player?.up;
      if (up && sky.sunDirection.dot(up) < -0.05) U.uSunRad.value.multiplyScalar(0.0);
    }
    // vento: direção na tangente local (weather.wind = leste/norte), força
    const up = ctx.player?.up || _n.set(0, 1, 0);
    const fr = ctx.Geo.tangentFrame(up);
    const w = ctx.services.weather?.wind;
    let wx = 0.8, wz = 0.6, ws = this.windStr;
    if (w && (w.x || w.z)) {
      const l = Math.hypot(w.x, w.z);
      wx = w.x / l;
      wz = w.z / l;
      ws = Math.min(1.6, Math.max(0.25, l / 7)) * (this.windStr / 0.7);
    }
    U.uWindDir.value.copy(fr.east).multiplyScalar(wx).addScaledVector(fr.north, wz).normalize();
    U.uWindStr.value = ws;
  },

  // ─── serviço ───────────────────────────────────────────────────────
  _publish() {
    const ctx = this.ctx;
    const self = this;
    const api = {
      /** props (não grama) num raio: [{ id, kind, species, worldPos, radius }] */
      near(worldPos, radius = 5) {
        const out = [];
        for (const cell of self.cells.values()) {
          if (cell.state !== 'ready' || cell.layer === 'grass') continue;
          const c = cell.center;
          if (Math.hypot(c.x - worldPos.x, c.y - worldPos.y, c.z - worldPos.z) > radius + cell.radius + 2) continue;
          for (const g of cell.groups.values()) {
            for (let q = 0; q < g.n; q++) {
              if (!g.alive[q]) continue;
              const x = c.x + g.m[q * 16 + 12], y = c.y + g.m[q * 16 + 13], z = c.z + g.m[q * 16 + 14];
              const sc = Math.hypot(g.m[q * 16 + 4], g.m[q * 16 + 5], g.m[q * 16 + 6]);
              const r = (g.sp.radius ?? 0.3) * sc;
              if (Math.hypot(x - worldPos.x, y - worldPos.y, z - worldPos.z) > radius + r) continue;
              out.push({ id: self._id(cell, g, q), kind: g.sp.kind, species: g.sp.id, worldPos: new ctx.WorldPos(x, y, z), radius: r, height: (g.sp.height ?? 1) * sc });
            }
          }
        }
        return out;
      },
      /** remove (minera/corta) um prop; emite flora:remove */
      remove(id) {
        if (!id || self.removed.has(id)) return false;
        const [layer, fij, gkey, idx] = String(id).split('|');
        const cell = self.cells.get(`${layer}|${fij}`);
        self.removed.add(id);
        let info = null;
        if (cell?.groups) {
          const g = cell.groups.get(gkey);
          const q = g ? g.ids.indexOf(Number(idx)) : -1;
          if (g && q >= 0) {
            g.alive[q] = 0;
            const c = cell.center;
            info = { kind: g.sp.kind, species: g.sp.id, worldPos: new ctx.WorldPos(c.x + g.m[q * 16 + 12], c.y + g.m[q * 16 + 13], c.z + g.m[q * 16 + 14]) };
          }
        }
        self.dirtyAssemble = true;
        ctx.bus.emit('flora:remove', { id, ...(info || {}) });
        return true;
      },
      /** densidade de vegetação (0..1) na direção */
      density(dir) {
        const b = self.planet?.biomeAt?.(dir);
        if (!b) return 0;
        const R = self.R;
        const fm = fbm3(dir.x * R / 320, dir.y * R / 320, dir.z * R / 320, self.planetSeed & 1023, 3);
        return Math.max(0, Math.min(1, b.flora * (0.04 + 0.96 * smooth(0.42, 0.6, fm))));
      },
      get biome() {
        return self.biome;
      },
      get species() {
        return (self.species || []).map((s) => ({ id: s.id, kind: s.kind, layer: s.layer }));
      },
      get stats() {
        let calls = 0, tris = 0;
        for (const e of self.meshes.values()) {
          if (!e.count) continue;
          calls++;
          tris += (e.mesh.geometry.index ? e.mesh.geometry.index.count / 3 : 2) * e.count;
        }
        const per = {};
        for (const [k, e] of self.meshes) if (e.count) per[k] = [e.count, Math.round((e.mesh.geometry.index ? e.mesh.geometry.index.count / 3 : 2) * e.count / 1000) + 'k'];
        return { ...self.stats, visibleMeshes: calls, tris, queue: [...self.cells.values()].filter((c) => c.state === 'new').length, per };
      },
    };
    this.api = ctx.provide('flora', api);
  },

  dispose() {
    for (const off of this.offs || []) off();
    this.readyToken?.();
    this._disposeMeshes();
    this.handle?.remove?.();
    this.ctx.scene.remove(this.root);
    this.tex?.tAlb.dispose();
    this.tex?.tNrm.dispose();
  },
};
