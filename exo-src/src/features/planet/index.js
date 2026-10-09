/**
 * PLANET — geração planetária do EXOSFERA.
 *
 * Terreno ESFÉRICO real: cubesphere com 6 quadtrees de LOD (quadtree.js),
 * chunks gerados em Web Workers (planet.worker.js → mesher.js) com
 * prioridade por distância/frustum e orçamento de uploads por frame,
 * geomorphing no shader e saias contra frestas. Função de altura em double
 * (terrain.js: warp, continentes, eroded fBm, ridged multifractal, platôs,
 * cânions, pináculos, crateras, poços de caverna) — a MESMA para malha e
 * física. Features SDF por região (sdf.js/features.js: arcos, arcos
 * flutuantes, rochas suspensas, cavernas). Oceano (water.js). Material PBR
 * triplanar com paleta de bioma (material.js) e texturas procedurais geradas
 * em worker (textures.js).
 *
 * Publica o serviço `planet` (CONTRACT §13). Sobrescritas de preset
 * (`ctx.shot.preset.params`): biome, terrainSeed, radius, seaLevel.
 */
import * as THREE from 'three';
import { planetConfig, BIOMES } from './biomes.js';
import { createTerrain, applyEdits, REGION_LEVEL, DATA } from './terrain.js';
import { dirFace } from './cube.js';
import { buildIndex } from './mesher.js';
import { handlers } from './handlers.js';
import { createTerrainUniforms, applyPalette, TEX_PERIOD } from './material.js';
import { TerrainLOD, N as CHUNK_N } from './quadtree.js';
import { Ocean } from './water.js';
import { FeatureField } from './features.js';

const _v = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();

/** raio × direção → ponto de mundo em double */
function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export default {
  name: 'planet',
  order: 10,

  async init(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'planet';
    ctx.scene.add(this.root);
    this.pool = ctx.workers.pool(
      'planet',
      () => new Worker(new URL('./planet.worker.js', import.meta.url), { type: 'module' }),
      { fallback: handlers },
    );
    this.U = createTerrainUniforms();
    this.debugSkirt = ctx.params.get('planetDebug') === 'skirt';
    this.debugNoShadow = ctx.params.get('planetDebug') === 'noshadow';
    this.edits = [];
    this.editRegions = new Map();
    this.readyToken = null;
    this.indexArr = buildIndex(CHUNK_N);
    this._configure();
    await ctx.bootProgress?.('texturas procedurais', 0.1);
    await this._textures();
    await ctx.bootProgress?.('terreno', 0.6);
    this._build();
    this._publish();
    this.offs = [
      ctx.bus.on('system:enter', () => (this.dirty = true)),
      ctx.bus.on('planet:enter', () => (this.dirty = true)),
      ctx.bus.on('space:recenter', () => (this.dirty = true)),
      ctx.bus.on('quality:change', () => {
        if (this.lod) this.lod.K = 0;
      }),
    ];
  },

  /** Lê o planeta atual (universe + sobrescritas do preset) e monta a configuração. */
  _configure() {
    const ctx = this.ctx;
    const uni = ctx.services.universe;
    const info = uni?.currentPlanet || {};
    const pp = ctx.shot?.preset?.params || {};
    const st = ctx.start || {};
    const seed = pp.terrainSeed ?? info.seed ?? ctx.seed.hash('galaxy', st.galaxy ?? 0, 'system', st.systemIndex ?? 0, 'planet', st.planetIndex ?? 0);
    const biome = pp.biome ?? info.biome;
    let seaLevel;
    if (pp.seaLevel !== undefined) seaLevel = pp.seaLevel;
    else if (pp.biome) seaLevel = undefined; // padrão do bioma forçado
    else if (info.seaLevel !== undefined) seaLevel = info.seaLevel;
    this.cfg = planetConfig({ seed, radius: pp.radius ?? info.radius ?? 120000, biome, seaLevel });
    this.planetId = info.id || `seed${seed}`;
    this.terrain = createTerrain(this.cfg);
    applyPalette(this.U, this.cfg);
    this._loadEdits();
  },

  async _textures() {
    const ctx = this.ctx;
    const S = (ctx.quality.textureSize ?? 2048) >= 2048 ? 512 : 256;
    const seed = 9137;
    const jobs = [0, 1, 2, 3].map((layer) => this.pool.run('texture', { layer, size: S, seed: seed + layer * 101 }, { priority: -10 }));
    const macro = this.pool.run('macro', { size: 256, seed: 77 }, { priority: -10 });
    const layers = await Promise.all(jobs);
    const m = await macro;
    const mk = (key) => {
      const data = new Uint8Array(S * S * 4 * 4);
      layers.forEach((l, i) => data.set(l[key], i * S * S * 4));
      const t = new THREE.DataArrayTexture(data, S, S, 4);
      t.format = THREE.RGBAFormat;
      t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(8, ctx.quality.anisotropy ?? 4);
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    this.U.tAlb.value = mk('albedo');
    this.U.tNrm.value = mk('normal');
    const mt = new THREE.DataTexture(m.macro, 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
    mt.wrapS = mt.wrapT = THREE.RepeatWrapping;
    mt.minFilter = THREE.LinearMipmapLinearFilter;
    mt.magFilter = THREE.LinearFilter;
    mt.generateMipmaps = true;
    mt.colorSpace = THREE.NoColorSpace;
    mt.needsUpdate = true;
    this.U.tMacro.value = mt;
  },

  _build() {
    const ctx = this.ctx;
    const self = this;
    const host = {
      get cfg() {
        return self.cfg;
      },
      get terrain() {
        return self.terrain;
      },
      pool: this.pool,
      U: this.U,
      root: this.root,
      debugSkirt: this.debugSkirt,
      debugNoShadow: this.debugNoShadow,
      get center() {
        return ctx.space.planetCenter;
      },
      editsFor: (n) => this._editsNear(n.cx, n.cy, n.cz, n.r),
      onAdd: (n) => this._chunkEvent(n, true),
      onRemove: (n) => this._chunkEvent(n, false),
    };
    this.host = host;
    this.lod = new TerrainLOD(ctx, host);
    this.lod.setIndex(this.indexArr);
    this.ocean = this.cfg.seaLevel != null ? new Ocean(ctx, host) : null;
    this.features = new FeatureField(ctx, host);
  },

  _teardown() {
    this.lod?.dispose();
    this.ocean?.dispose();
    this.features?.dispose();
    this.lod = this.ocean = this.features = null;
  },

  _chunkEvent(n, added) {
    const c = this.ctx.space.planetCenter;
    const center = new this.ctx.WorldPos(c.x + n.cx, c.y + n.cy, c.z + n.cz);
    this.ctx.bus.emit('terrain:chunk', { id: n.key, lod: n.L, center, radius: n.r, added, removed: !added, mesh: n.mesh });
  },

  // ─── edições ────────────────────────────────────────────────────────
  _editsKey() {
    return `exo.planet.edits.${this.cfg.seed}.${this.cfg.biome}`;
  },
  _loadEdits() {
    this.edits = [];
    this.editRegions = new Map();
    if (this.ctx.shot) return; // modo shot: determinístico, sem estado salvo
    try {
      const raw = localStorage.getItem(this._editsKey());
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [rk, list] of Object.entries(obj)) {
        this.editRegions.set(rk, list);
        for (const e of list) this.edits.push(e);
      }
    } catch {
      /* armazenamento indisponível: edições só nesta sessão */
    }
  },
  _saveEdits() {
    if (this.ctx.shot) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => {
      try {
        localStorage.setItem(this._editsKey(), JSON.stringify(Object.fromEntries(this.editRegions)));
      } catch {
        /* sem armazenamento */
      }
    }, 400);
  },
  _editsNear(x, y, z, r) {
    if (!this.edits.length) return [];
    return this.edits.filter((e) => Math.hypot(e.x - x, e.y - y, e.z - z) < e.r + r);
  },

  // ─── consultas ──────────────────────────────────────────────────────
  _height(x, y, z) {
    let h = this.terrain.height(x, y, z, 0);
    if (this.edits.length) h = applyEdits(x, y, z, this.cfg.radius, h, this.edits);
    return h;
  },

  _publish() {
    const ctx = this.ctx;
    const self = this;
    const api = {
      get radius() {
        return self.cfg.radius;
      },
      get center() {
        return ctx.space.planetCenter;
      },
      get gravity() {
        return ctx.services.universe?.currentPlanet?.gravity ?? 9.8 * Math.sqrt(self.cfg.radius / 120000);
      },
      get seaLevel() {
        return self.cfg.seaLevel;
      },
      get palette() {
        return self.cfg.palette;
      },
      get biome() {
        return { id: self.cfg.biome, name: self.cfg.biomeName };
      },
      get config() {
        return self.cfg;
      },
      /** altura do solo (m) na direção — síncrono, double, determinístico */
      heightAt(dir) {
        let x = dir.x, y = dir.y, z = dir.z;
        const l = Math.sqrt(x * x + y * y + z * z);
        if (Math.abs(l - 1) > 1e-9) {
          x /= l;
          y /= l;
          z /= l;
        }
        return self._height(x, y, z);
      },
      normalAt(dir, out = new THREE.Vector3()) {
        const u = _v.copy(dir).normalize();
        const fr = ctx.Geo.tangentFrame(u);
        const R = self.cfg.radius;
        const e = 0.75;
        _e.copy(u).addScaledVector(fr.east, e / R).normalize();
        const hE = self._height(_e.x, _e.y, _e.z);
        _e.copy(u).addScaledVector(fr.east, -e / R).normalize();
        const hW = self._height(_e.x, _e.y, _e.z);
        _n.copy(u).addScaledVector(fr.north, e / R).normalize();
        const hN = self._height(_n.x, _n.y, _n.z);
        _n.copy(u).addScaledVector(fr.north, -e / R).normalize();
        const hS = self._height(_n.x, _n.y, _n.z);
        const gx = (hE - hW) / (2 * e), gy = (hN - hS) / (2 * e);
        return out.copy(u).addScaledVector(fr.east, -gx).addScaledVector(fr.north, -gy).normalize();
      },
      biomeAt(dir) {
        const u = _v.copy(dir).normalize();
        const h = self.terrain.sample(u.x, u.y, u.z, 4);
        const moist = DATA[0], ero = DATA[1], reg = DATA[2], strata = DATA[3];
        const cfg = self.cfg;
        const lat = Math.asin(Math.max(-1, Math.min(1, u.y)));
        const temperature = cfg.temperature - Math.abs(lat) * 22 - Math.max(0, h) * 0.0065;
        const P = cfg.palette;
        const grass = lerpColor(lerpColor(P.grass, P.grass2, Math.min(1, Math.max(0, (reg - 0.3) / 0.4))), P.dry, Math.max(0, Math.min(1, (0.5 - moist) / 0.35)) * 0.8);
        const n = api.normalAt(u, _n);
        const slope = 1 - n.dot(u);
        const under = cfg.seaLevel != null && h < cfg.seaLevel;
        const snowy = h > cfg.style.snowLine;
        const rocky = slope > cfg.style.rockSlope || strata > 0.6;
        let flora = cfg.flora * (0.35 + 0.65 * moist) * (rocky ? 0.15 : 1) * (snowy ? 0.2 : 1) * (under ? 0 : 1);
        if (cfg.seaLevel != null && h < cfg.seaLevel + 2) flora *= 0.3;
        return {
          id: cfg.biome,
          name: cfg.biomeName,
          palette: { ...P, grass, local: grass },
          temperature,
          humidity: moist,
          flora: Math.max(0, Math.min(1, flora)),
          fauna: under ? 0 : cfg.fauna * (0.5 + 0.5 * moist),
          height: h,
          slope,
          erosion: ero,
          rock: rocky ? 1 : 0,
          snow: snowy ? 1 : 0,
          underwater: under,
        };
      },
      isOcean(dir) {
        if (self.cfg.seaLevel == null) return false;
        return api.heightAt(dir) < self.cfg.seaLevel;
      },
      surfacePoint(dir, out = new ctx.WorldPos()) {
        const u = _v.copy(dir).normalize();
        const r = self.cfg.radius + self._height(u.x, u.y, u.z);
        const c = ctx.space.planetCenter;
        return out.set(c.x + u.x * r, c.y + u.y * r, c.z + u.z * r);
      },
      /** raio × terreno: marcha adaptativa pela altitude + bisseção */
      raycast(origin, dir, maxDist = 1e7) {
        const c = ctx.space.planetCenter;
        const R = self.cfg.radius;
        const d = _v.copy(dir).normalize();
        const ox = origin.x - c.x, oy = origin.y - c.y, oz = origin.z - c.z;
        // pula até a casca de altura máxima
        const Rt = R + self.terrain.maxH;
        const b = ox * d.x + oy * d.y + oz * d.z;
        const cc = ox * ox + oy * oy + oz * oz - Rt * Rt;
        let t = 0;
        if (cc > 0) {
          const disc = b * b - cc;
          if (disc < 0 || b > 0) return null;
          t = -b - Math.sqrt(disc);
        }
        const altAt = (tt) => {
          const x = ox + d.x * tt, y = oy + d.y * tt, z = oz + d.z * tt;
          const r = Math.sqrt(x * x + y * y + z * z);
          return r - R - self._height(x / r, y / r, z / r);
        };
        let prev = t, a = altAt(t);
        if (a < 0) return null;
        for (let i = 0; i < 600 && t < maxDist; i++) {
          prev = t;
          t += Math.max(0.05, a * 0.55);
          if (t > maxDist) t = maxDist;
          a = altAt(t);
          if (a <= 0) {
            let lo = prev, hi = t;
            for (let k = 0; k < 30; k++) {
              const m = (lo + hi) / 2;
              if (altAt(m) > 0) lo = m;
              else hi = m;
            }
            t = (lo + hi) / 2;
            const point = new ctx.WorldPos(origin.x + d.x * t, origin.y + d.y * t, origin.z + d.z * t);
            const up = new THREE.Vector3(point.x - c.x, point.y - c.y, point.z - c.z).normalize();
            return { distance: t, point, normal: api.normalAt(up, new THREE.Vector3()) };
          }
          if (t >= maxDist) break;
        }
        return null;
      },
      /** escavar (−1) / preencher (+1) uma esfera; refaz só os chunks afetados; persistido por região */
      edit(worldPos, radius, sign) {
        const c = ctx.space.planetCenter;
        const r = Math.max(0.3, Math.min(25, radius || 2));
        const e = { x: worldPos.x - c.x, y: worldPos.y - c.y, z: worldPos.z - c.z, r, s: sign < 0 ? -1 : 1 };
        const l = Math.hypot(e.x, e.y, e.z);
        if (!(l > 0)) return false;
        const f = dirFace(e.x / l, e.y / l, e.z / l);
        const n = 1 << REGION_LEVEL;
        const rk = `${f[0]}/${Math.min(n - 1, Math.floor(((f[1] + 1) / 2) * n))}/${Math.min(n - 1, Math.floor(((f[2] + 1) / 2) * n))}`;
        if (!self.editRegions.has(rk)) self.editRegions.set(rk, []);
        self.editRegions.get(rk).push(e);
        self.edits.push(e);
        const k = self.lod?.invalidate(e.x, e.y, e.z, r) ?? 0;
        if (self.ocean) self.ocean.anchorAlt = -1; // refaz profundidade
        self._saveEdits();
        ctx.bus.emit('terrain:edit', { worldPos, radius: r, sign: e.s, chunks: k });
        return true;
      },
      /** apaga as edições salvas deste planeta */
      clearEdits() {
        self.edits = [];
        self.editRegions.clear();
        self._saveEdits();
        self.lod?.invalidate(0, 0, 0, 1e9);
      },
      /** sítios de features num raio (m) da direção */
      featuresNear(dir, radius = 2000) {
        const u = _v.copy(dir).normalize();
        return self.terrain.sitesNear(u.x, u.y, u.z, radius).map((s) => ({ type: s.type, dir: new THREE.Vector3(...s.dir), height: s.h, key: s.key }));
      },
      get stats() {
        return {
          ...(self.lod?.stats || {}),
          features: self.features?.stats,
          edits: self.edits.length,
          biome: self.cfg.biome,
          pool: self.pool.stats,
        };
      },
      biomes: Object.keys(BIOMES),
    };
    this.api = ctx.provide('planet', api);
  },

  frame(dt, ctx) {
    if (this.dirty) {
      this.dirty = false;
      this._teardown();
      this._configure();
      this._build();
    }
    const c = ctx.space.planetCenter, o = ctx.space.origin;
    this.U.uCenter.value.set(c.x - o.x, c.y - o.y, c.z - o.z);
    const P = TEX_PERIOD;
    const m = (v) => ((v % P) + P) % P;
    this.U.uCamMod.value.set(m(o.x), m(o.y), m(o.z));
    this.U.uDetail.value = 1;
    this.lod.update();
    this.ocean?.frame();
    this.features.frame(this.lod.frustum);
    const busy = this.lod.busy || !!this.ocean?.busy || this.features.busy;
    if (busy && !this.readyToken) this.readyToken = ctx.ready.busy('planeta: chunks ao redor da câmera');
    else if (!busy && this.readyToken) {
      this.readyToken();
      this.readyToken = null;
    }
  },

  dispose() {
    for (const off of this.offs || []) off();
    this._teardown();
    this.ctx.scene.remove(this.root);
  },
};
