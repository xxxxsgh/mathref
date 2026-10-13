// Flora instanciada por chunks ao redor do jogador.
//
// • Chunks fixos no planeta (faces do cubo-esfera, 32 m): o conteúdo de cada
//   um é sempre o mesmo (seed do corpo + chunk), então nada "re-sorteia"
//   quando o jogador volta.
// • Densidade por bioma × espécie × máscara de mata (clareiras e bosques por
//   ruído, cada espécie com seus próprios bosques) × quality.foliageDensity.
// • Camadas por distância: árvores até o horizonte de flora, arbustos até
//   ~130 m, capim/fungos miúdos até ~45 m; dois níveis de detalhe por
//   protótipo. Uma InstancedMesh por (espécie, variante, LOD).
// • Troncos viram caixas de colisão perto do jogador; plantas perigosas
//   (vagens explosivas, cuspideiras, esporeiras) reagem à aproximação/tiros.
import * as THREE from 'three/webgpu';
import { rng, hmix, hashStr, clamp, smooth01 } from './util.js';
import { speciesFor } from './species.js';
import { buildFloraProtos } from './floraGeo.js';
import { floraMaterial } from './materials.js';
import { toFace, fromFace } from './fauna.js';

const CH = 32;
const GRID = 4; // amostras de altura por lado (GRID+1)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

const TIER = {
  tree: { dens: 1.15, hi: 70, lo: Infinity, shadow: true, variants: 2 },
  shrub: { dens: 7, hi: 32, lo: 135, shadow: false, variants: 2 },
  ground: { dens: 420, hi: 46, lo: 0, shadow: false, variants: 1 },
  rock: { dens: 2.2, hi: 45, lo: 260, shadow: true, variants: 2 },
};
const NEAR_SHRUB = 140, NEAR_GROUND = 50;

export class Flora {
  constructor(ctx, patch) {
    this.ctx = ctx; this.patch = patch;
    this.body = null;
    this.species = [];
    this.protos = new Map();
    this.meshes = new Map();   // chave sp.id|v|lod → InstancedMesh
    this.chunks = new Map();
    this.matMain = null; this.matGround = null;
    this.lastBuild = new THREE.Vector3(1e9, 0, 0);
    this.patchVer = -1;
    this.dirty = true;
    this.colliders = [];
    this.hazards = [];
    this.noise = null;
    this.radius = 300;
    this.genBudget = 8;
    this.clearings = [];
  }

  setBody(body) {
    if (this.body === body) return;
    this.clear();
    this.body = body;
    if (!body) return;
    this.species = speciesFor(body).flora;
    this.noise = new this.ctx.Noise((body.seed ^ 0x51f0) >>> 0);
  }

  clear() {
    for (const im of this.meshes.values()) { im.parent?.remove(im); im.dispose?.(); }
    this.meshes.clear();
    this.chunks.clear();
    for (const c of this.colliders) c.remove();
    this.colliders = [];
    this.hazards = [];
    this.protos.clear();
    this.body = null; this.species = [];
    this.dirty = true;
  }

  protosOf(sp) {
    let p = this.protos.get(sp.id);
    if (!p) { p = buildFloraProtos(sp, TIER[sp.tier].variants); this.protos.set(sp.id, p); }
    return p;
  }

  materials() {
    if (!this.matMain) { this.matMain = floraMaterial({}); this.matGround = floraMaterial({ ground: true }); }
  }

  /** Máscara de mata de uma espécie num ponto local (0..1). */
  grove(sp, P, k) {
    const n = this.noise;
    const s = 1 / 140;
    const base = n.noise3(P.x * s, P.y * s, P.z * s) * 0.6 + n.noise3(P.x * s * 3.1 + 17, P.y * s * 3.1, P.z * s * 3.1) * 0.25;
    const own = n.noise3(P.x * s * 1.7 + k * 31.7, P.y * s * 1.7 - k * 7.1, P.z * s * 1.7 + k * 3.3);
    return clamp(0.5 + base * 0.8 + own * 0.6, 0, 1);
  }

  // ── chunks ─────────────────────────────────────────────────────────────
  makeChunk(f, i, j) {
    const body = this.body, R = body.radius;
    const key = `${f}:${i}:${j}`;
    const ch = { key, f, i, j, items: { tree: [], shrub: [], ground: [], rock: [] }, nearShrub: false, nearGround: false, grid: null, center: null };
    const c = fromFace(f, (i + 0.5) * CH / R, (j + 0.5) * CH / R, new THREE.Vector3()).multiplyScalar(R);
    ch.center = c;
    ch.grid = this.heightGrid(f, i, j, GRID);
    this.populate(ch, ['tree', 'rock']);
    return ch;
  }
  heightGrid(f, i, j, G) {
    const R = this.body.radius, T = this.patch.terrain;
    const out = new Float32Array((G + 1) * (G + 1));
    for (let y = 0; y <= G; y++) for (let x = 0; x <= G; x++) {
      const d = fromFace(f, (i + x / G) * CH / R, (j + y / G) * CH / R, _v);
      out[y * (G + 1) + x] = T ? T.height(d.x, d.y, d.z) : 0;
    }
    return { G, h: out };
  }
  sampleGrid(grid, fx, fy) {
    const G = grid.G, x = fx * G, y = fy * G;
    const x0 = Math.min(G - 1, Math.floor(x)), y0 = Math.min(G - 1, Math.floor(y));
    const tx = x - x0, ty = y - y0, h = grid.h, w = G + 1;
    const a = h[y0 * w + x0], b = h[y0 * w + x0 + 1], c = h[(y0 + 1) * w + x0], d = h[(y0 + 1) * w + x0 + 1];
    const hh = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    const slope = Math.hypot((b - a) * (1 - ty) + (d - c) * ty, (c - a) * (1 - tx) + (d - b) * tx) / (CH / G);
    return { h: hh, slope };
  }

  populate(ch, tiers) {
    const body = this.body, R = body.radius;
    const dens = this.ctx.quality.foliageDensity ?? 0.7;
    const hasSea = this.patch.hasSea;
    for (const tier of tiers) {
      const grid = tier === 'ground' ? (ch.fine || (ch.fine = this.heightGrid(ch.f, ch.i, ch.j, 8))) : ch.grid;
      for (let k = 0; k < this.species.length; k++) {
        const sp = this.species[k];
        if (sp.tier !== tier) continue;
        const r = rng(hmix(sp.seed, hashStr(ch.key), tier.length));
        const area = CH * CH / 1000;
        const expect = TIER[tier].dens * sp.weight * area * (tier === 'ground' ? dens : 0.4 + dens * 0.6);
        let n = Math.floor(expect) + (r() < expect % 1 ? 1 : 0);
        if (tier === 'ground') n = Math.min(n, 900);
        for (let q = 0; q < n * 2 && n > 0; q++) {
          const fx = r(), fy = r();
          const d = fromFace(ch.f, (ch.i + fx) * CH / R, (ch.j + fy) * CH / R, _v);
          const P = _w.copy(d).multiplyScalar(R);
          const gv = this.grove(sp, P, k);
          const want = tier === 'ground' ? smooth01((gv - 0.15) * 2) : tier === 'rock' ? 0.6 : smooth01((gv - 0.3) * 2.2);
          if (r() > want) continue;
          const s = this.sampleGrid(grid, fx, fy);
          if (hasSea) {
            if (sp.arch === 'coral') { if (s.h < -1.2 || s.h > 2.5) continue; }
            else if (s.h < (tier === 'rock' ? -0.5 : 1.2)) continue;
          }
          const maxSlope = tier === 'tree' ? 0.55 : tier === 'rock' ? 1.5 : 0.8;
          if (s.slope > maxSlope) continue;
          // clareiras (nave pousada, estruturas)
          let blocked = false;
          for (const cl of this.clearings) { if (cl.body === body && (cl.all || tier === 'tree' || tier === 'shrub') && P.distanceTo(cl.local) < cl.radius) { blocked = true; break; } }
          if (blocked) continue;
          const pos = d.clone().multiplyScalar(R + s.h);
          const sc = sp.scale[0] + (sp.scale[1] - sp.scale[0]) * r() ** 1.5;
          // árvores crescem para cima (radial); pedras/capim seguem o chão
          const item = { sp, k, v: Math.floor(r() * TIER[tier].variants), pos, up: d.clone(), yaw: r() * Math.PI * 2, scale: tier === 'rock' ? sc * (r() < 0.08 ? 2.5 : 1) : sc, tier, sink: tier === 'rock' ? 0.25 : tier === 'tree' ? 0.15 : 0.02, m: null, dead: 0 };
          ch.items[tier].push(item);
          if (ch.items[tier].length > 4000) break;
          if (--n <= 0) break;
        }
      }
    }
  }

  /** Atualiza o conjunto de chunks ao redor do ponto local do jogador. */
  updateChunks(local, force = false) {
    const body = this.body; if (!body) return;
    const R = body.radius;
    const dd = this.ctx.quality.drawDistance ?? 0.85;
    this.radius = (this.ctx.quality.name === 'mobile' ? 190 : this.ctx.quality.name === 'medium' ? 250 : this.ctx.quality.name === 'ultra' ? 380 : 320) * Math.min(1.2, dd + 0.15);
    const d = _v.copy(local).normalize();
    const F = toFace(d);
    const ci = Math.floor(F.u * R / CH), cj = Math.floor(F.v * R / CH);
    const K = Math.ceil(this.radius / CH) + 1;
    const pl = d.clone().multiplyScalar(R);
    let made = 0;
    const budget = force ? Infinity : this.genBudget;
    const want = new Set();
    const cand = [];
    for (let i = ci - K; i <= ci + K; i++) for (let j = cj - K; j <= cj + K; j++) {
      const c = fromFace(F.f, (i + 0.5) * CH / R, (j + 0.5) * CH / R, _w).multiplyScalar(R);
      const dist = c.distanceTo(pl);
      if (dist > this.radius + CH) continue;
      const key = `${F.f}:${i}:${j}`;
      want.add(key);
      cand.push({ key, i, j, dist });
    }
    cand.sort((a, b) => a.dist - b.dist);
    for (const c of cand) {
      let ch = this.chunks.get(c.key);
      if (!ch) {
        if (made >= budget) continue;
        ch = this.makeChunk(F.f, c.i, c.j); this.chunks.set(c.key, ch); made++; this.dirty = true;
      }
      if (!ch.nearShrub && c.dist < NEAR_SHRUB + CH) { if (made >= budget) continue; this.populate(ch, ['shrub']); ch.nearShrub = true; made++; this.dirty = true; }
      if (!ch.nearGround && c.dist < NEAR_GROUND + CH) { if (made >= budget) continue; this.populate(ch, ['ground']); ch.nearGround = true; made++; this.dirty = true; }
    }
    for (const key of [...this.chunks.keys()]) if (!want.has(key)) { this.chunks.delete(key); this.dirty = true; }
    return made;
  }

  // ── instâncias ─────────────────────────────────────────────────────────
  meshFor(sp, v, lod, capacity) {
    const key = `${sp.id}|${v}|${lod}`;
    let im = this.meshes.get(key);
    if (im && im.instanceMatrix.count < capacity) { im.parent?.remove(im); im.dispose?.(); im = null; }
    if (!im) {
      this.materials();
      const P = this.protosOf(sp)[v];
      const geo = lod === 0 ? P.hi : P.lo;
      const cap = Math.max(16, Math.ceil(capacity * 1.4));
      im = new THREE.InstancedMesh(geo, sp.tier === 'ground' ? this.matGround : this.matMain, cap);
      im.frustumCulled = false;
      im.count = 0;
      const sh = this.ctx.quality.shadows;
      im.castShadow = !!sh && (TIER[sp.tier].shadow || (sp.tier === 'shrub' && lod === 0 && this.ctx.quality.name === 'ultra'));
      im.receiveShadow = true;
      im.name = `flora:${sp.arch}:${v}:${lod}`;
      this.patch.group.add(im);
      this.meshes.set(key, im);
    }
    return im;
  }

  itemMatrix(it) {
    if (it.m && it.mv === this.patch.version) return it.m;
    const P = this.patch;
    _v.copy(it.pos).addScaledVector(it.up, -it.sink * it.scale);
    P.toPatch(_v, _w);
    _q.setFromUnitVectors(Y, P.dirToPatch(it.up, _s));
    _q2.setFromAxisAngle(Y, it.yaw);
    _q.multiply(_q2);
    _m.compose(_w, _q, _v.set(it.scale, it.scale, it.scale));
    it.m = it.m || new Float32Array(16);
    _m.toArray(it.m);
    it.mv = P.version;
    it.pp = it.pp || new THREE.Vector3();
    it.pp.copy(_w);
    return it.m;
  }

  /** Redistribui instâncias por distância/LOD (quando o jogador anda ou chunks mudam). */
  rebuild(camP) {
    const lists = new Map();
    const push = (sp, v, lod, it) => {
      const key = `${sp.id}|${v}|${lod}`;
      let L = lists.get(key); if (!L) { L = { sp, v, lod, items: [] }; lists.set(key, L); }
      L.items.push(it);
    };
    const now = this.ctx.time.now;
    for (const ch of this.chunks.values()) {
      for (const tier of ['tree', 'rock', 'shrub', 'ground']) {
        const T = TIER[tier];
        for (const it of ch.items[tier]) {
          if (it.dead && now < it.dead) continue;
          this.itemMatrix(it);
          const d = Math.hypot(it.pp.x - camP.x, it.pp.z - camP.z);
          let lod = -1;
          if (d < T.hi) lod = 0; else if (d < T.lo) lod = 1;
          if (lod < 0) continue;
          if (tier === 'ground' && d > T.hi * 0.75) { // rarefaz na borda
            const k = (d - T.hi * 0.75) / (T.hi * 0.25);
            if (((it.yaw * 1000) % 1) < k) continue;
          }
          push(it.sp, it.v, lod, it);
        }
      }
    }
    // zera as que não aparecem mais
    for (const [key, im] of this.meshes) if (!lists.has(key)) { im.count = 0; im.visible = false; }
    for (const [, L] of lists) {
      const im = this.meshFor(L.sp, L.v, L.lod, L.items.length);
      const arr = im.instanceMatrix.array;
      let n = 0;
      for (const it of L.items) { arr.set(it.m, n * 16); n++; }
      im.count = n;
      im.visible = n > 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceMatrix.clearUpdateRanges) im.instanceMatrix.clearUpdateRanges();
    }
    this.updateColliders(camP);
    this.updateHazards(camP);
    this.dirty = false;
  }

  updateColliders(camP) {
    for (const c of this.colliders) c.remove();
    this.colliders = [];
    const col = this.ctx.collision;
    if (!col?.addBox) return;
    for (const ch of this.chunks.values()) for (const it of ch.items.tree) {
      if (it.dead) continue;
      const d = Math.hypot(it.pp.x - camP.x, it.pp.z - camP.z);
      if (d > 34) continue;
      const arch = it.sp.arch;
      const r = (arch === 'bulbtree' ? 0.9 : arch === 'capfungus' ? 0.45 : arch === 'pillar' ? 0.45 : arch === 'fanpalm' ? 0.25 : 0.38) * it.scale;
      const h = 2.2 * it.scale;
      _q.setFromUnitVectors(Y, this.patch.dirToPatch(it.up, _s));
      const center = it.pp.clone().addScaledVector(_s, h);
      this.colliders.push(col.addBox({ frame: this.patch.frame, center, half: new THREE.Vector3(r, h, r), quat: _q.clone(), tag: 'flora' }));
    }
  }

  updateHazards(camP) {
    this.hazards = [];
    for (const ch of this.chunks.values()) for (const tier of ['shrub']) for (const it of ch.items[tier]) {
      if (!it.sp.hazard || it.dead) continue;
      const d = Math.hypot(it.pp.x - camP.x, it.pp.z - camP.z);
      if (d < 60) this.hazards.push(it);
    }
  }

  /** Planta perigosa reage: explode/solta veneno. */
  trigger(it, byShot = false) {
    const ctx = this.ctx, P = this.patch;
    if (it.dead) return;
    it.dead = ctx.time.now + 120;
    this.dirty = true;
    const pw = P.patchToWorld(_v.copy(it.pp).addScaledVector(P.dirToPatch(it.up, _s), 0.5 * it.scale), new THREE.Vector3());
    const camW = ctx.player.camWorld;
    const dist = pw.distanceTo(camW);
    if (it.sp.hazard === 'explode') {
      ctx.bus.emit('explosion', { pos: pw, size: 3.5 * it.scale, kind: 'ground' });
      if (ctx.game.mode === 'foot' && dist < 6) {
        ctx.bus.emit('player:damage', { amount: Math.round(30 * (1 - dist / 6)) + 5, type: 'heat', source: 'life' });
        ctx.bus.emit('shake', { amount: 0.6 * (1 - dist / 6) + 0.2, duration: 0.5 });
      }
    } else {
      const rp = ctx.services.rendering?.particles;
      const c = new THREE.Color(it.sp.colors.glow);
      try {
        rp?.emit?.('smoke', pw, 40, (k, o) => {
          const d = new THREE.Vector3().randomDirection();
          o.vx = d.x * 1.6; o.vy = Math.abs(d.y) * 1.6 + 0.6; o.vz = d.z * 1.6;
          o.life = 4 + Math.random() * 3; o.s0 = 0.4; o.s1 = 3.4; o.drag = 1.2; o.g = -0.03;
          o.a = c.r * 0.5; o.b = c.g * 0.5; o.c = c.b * 0.5; o.w = 0.4;
        }, { ttl: 10 });
      } catch { /* */ }
      if (ctx.game.mode === 'foot' && dist < 4.5) ctx.bus.emit('player:damage', { amount: 14, type: 'toxic', source: 'life' });
    }
    ctx.bus.emit('life:hazard', { kind: it.sp.hazard, species: it.sp.id, pos: pw, byShot });
  }

  step(dt, camP, onFoot) {
    if (!onFoot) return;
    for (const it of this.hazards) {
      if (it.dead) continue;
      const d = Math.hypot(it.pp.x - camP.x, it.pp.z - camP.z);
      if (d < (it.sp.hazard === 'explode' ? 1.7 : 2.4) * Math.max(1, it.scale)) this.trigger(it);
    }
  }

  /** Alvos de tiro (plantas perigosas) no referencial do remendo. */
  hitHazard(p0, p1) {
    let best = null;
    const d = _v.copy(p1).sub(p0); const L2 = d.lengthSq() || 1;
    for (const it of this.hazards) {
      if (it.dead) continue;
      const c = _w.copy(it.pp).addScaledVector(this.patch.dirToPatch(it.up, _s), 0.5 * it.scale);
      const s = clamp(_s.copy(c).sub(p0).dot(d) / L2, 0, 1);
      const px = p0.x + d.x * s - c.x, py = p0.y + d.y * s - c.y, pz = p0.z + d.z * s - c.z;
      const r = 0.7 * it.scale;
      if (px * px + py * py + pz * pz < r * r && (!best || s < best.t)) best = { t: s, it };
    }
    return best;
  }

  /** Item mais próximo de cada espécie (para o scanner). */
  nearestBySpecies(camP, max) {
    const best = new Map();
    for (const ch of this.chunks.values()) for (const tier of ['tree', 'shrub']) for (const it of ch.items[tier]) {
      if (!it.pp || it.dead) continue;
      const d = Math.hypot(it.pp.x - camP.x, it.pp.z - camP.z);
      if (d > max) continue;
      const b = best.get(it.sp.id);
      if (!b || d < b.d) best.set(it.sp.id, { it, d });
    }
    return best;
  }

  frame(camP, force = false) {
    if (!this.body) return;
    if (this.patchVer !== this.patch.version) { this.patchVer = this.patch.version; this.dirty = true; }
    const moved = Math.hypot(camP.x - this.lastBuild.x, camP.z - this.lastBuild.z);
    if (this.dirty || moved > 6 || force) { this.lastBuild.copy(camP); this.rebuild(camP); }
  }
}
