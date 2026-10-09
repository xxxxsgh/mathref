/**
 * FEATURES SDF no thread principal: descobre os sítios (arcos, arcos
 * flutuantes, rochas suspensas, cavernas) num raio em torno da câmera,
 * pede as malhas ao worker (surface nets) com prioridade por distância e
 * resolução por distância, e as mantém como objetos flutuantes com o MESMO
 * material triplanar do terreno (topo plano vira grama, paredes viram rocha).
 */
import * as THREE from 'three';
import { createTerrainMaterial } from './material.js';

const RADIUS = 4200; // m
const MAX_MESHES = 18;

export class FeatureField {
  constructor(ctx, host) {
    this.ctx = ctx;
    this.host = host; // { cfg, terrain, pool, U, root, center }
    this.items = new Map(); // site.key → { site, mesh, res, job, dist }
    this.mat = createTerrainMaterial(host.U);
    this.mat.name = 'planet:feature';
    this.lastQuery = null;
    this.sites = [];
    this.stats = { sites: 0, meshes: 0, tris: 0 };
    this._v = new THREE.Vector3();
    this._s = new THREE.Sphere();
  }

  get busy() {
    for (const it of this.items.values()) if (it.need && !it.mesh && it.inFrustum) return true;
    return false;
  }

  frame(frustum) {
    const ctx = this.ctx;
    const T = this.host.terrain;
    const c = this.host.center, o = ctx.space.origin;
    const cx = o.x - c.x, cy = o.y - c.y, cz = o.z - c.z;
    const cr = Math.hypot(cx, cy, cz);
    const R = this.host.cfg.radius;
    const alt = cr - R;
    if (alt > 30000) {
      for (const it of this.items.values()) if (it.mesh) it.mesh.visible = false;
      return;
    }
    // nova consulta de sítios quando a câmera anda
    const q = this.lastQuery;
    if (!q || Math.hypot(q[0] - cx, q[1] - cy, q[2] - cz) > 150) {
      this.lastQuery = [cx, cy, cz];
      this.sites = T.sitesNear(cx / cr, cy / cr, cz / cr, RADIUS + Math.max(0, alt));
      this.stats.sites = this.sites.length;
    }
    // distâncias e escolha
    const list = [];
    for (const s of this.sites) {
      const lift = s.type === 'floating' ? 100 : s.type === 'floatArch' ? 80 : 10;
      const px = s.dir[0] * (R + s.h + lift), py = s.dir[1] * (R + s.h + lift), pz = s.dir[2] * (R + s.h + lift);
      const d = Math.hypot(px - cx, py - cy, pz - cz);
      this._v.set(c.x + px - o.x, c.y + py - o.y, c.z + pz - o.z);
      this._s.set(this._v, 160);
      list.push({ s, d, inF: frustum.intersectsSphere(this._s) });
    }
    list.sort((a, b) => a.d * (a.inF ? 1 : 3) - b.d * (b.inF ? 1 : 3));
    const keep = new Set();
    for (let k = 0; k < Math.min(MAX_MESHES, list.length); k++) {
      const { s, d, inF } = list[k];
      if (d > RADIUS + 400) continue;
      keep.add(s.key);
      let it = this.items.get(s.key);
      if (!it) {
        it = { site: s, mesh: null, res: 0, job: null };
        this.items.set(s.key, it);
      }
      it.dist = d;
      it.inFrustum = inF;
      it.need = true;
      const res = d < 900 ? 64 : d < 2200 ? 44 : 30;
      if (res > it.res && !it.job) this._request(it, res);
    }
    for (const [key, it] of this.items) {
      if (keep.has(key)) {
        if (it.mesh) it.mesh.visible = true;
        continue;
      }
      it.need = false;
      if (it.job) {
        it.job.cancel?.();
        it.job = null;
      }
      if (it.mesh && (it.dist ?? 0) > RADIUS + 1200) this._drop(key, it);
      else if (it.mesh) it.mesh.visible = false;
      if (!it.mesh) this.items.delete(key);
    }
    this.stats.meshes = 0;
    this.stats.tris = 0;
    for (const it of this.items.values()) {
      if (it.mesh && it.mesh.visible) {
        this.stats.meshes++;
        this.stats.tris += it.tris || 0;
      }
    }
  }

  _request(it, res) {
    const s = it.site;
    const job = this.host.pool.run('feature', { cfg: this.host.cfg, face: s.face, i: s.i, j: s.j, res }, { priority: it.dist * (it.inFrustum ? 1 : 3) + 50, key: `f:${s.key}` });
    it.job = job;
    job.then(
      (r) => {
        if (it.job !== job) return;
        it.job = null;
        it.res = res;
        if (r.empty || !r.pos.length) return;
        this._apply(it, r);
      },
      () => {
        if (it.job === job) it.job = null;
      },
    );
  }

  _apply(it, r) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normalAO', new THREE.BufferAttribute(r.nor, 4, true));
    g.setAttribute('morph', new THREE.BufferAttribute(new Float32Array((r.pos.length / 3) * 4), 4));
    g.setAttribute('tdata', new THREE.BufferAttribute(r.data, 4, true));
    g.setIndex(new THREE.BufferAttribute(r.index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(r.bounds.cx, r.bounds.cy, r.bounds.cz), r.bounds.r);
    it.tris = r.tris;
    if (it.mesh) {
      it.mesh.geometry.dispose();
      it.mesh.geometry = g;
      return;
    }
    const c = this.host.center;
    const m = new THREE.Mesh(g, this.mat);
    m.name = `planet:feature:${r.kind}`;
    m.castShadow = true;
    m.receiveShadow = true;
    const wp = new this.ctx.WorldPos(c.x + r.anchor[0], c.y + r.anchor[1], c.z + r.anchor[2]);
    m.userData.handle = this.ctx.space.registerFloating(m, wp);
    this.host.root.add(m);
    it.mesh = m;
    it.kind = r.kind;
    this.ctx.bus.emit('terrain:feature', { id: `feat:${it.site.key}`, kind: r.kind, center: wp, radius: r.bounds.r, added: true, mesh: m });
  }

  _drop(key, it) {
    if (it.mesh) {
      it.mesh.userData.handle?.remove();
      this.host.root.remove(it.mesh);
      it.mesh.geometry.dispose();
      this.ctx.bus.emit('terrain:feature', { id: `feat:${key}`, kind: it.kind, removed: true });
    }
    this.items.delete(key);
  }

  /** Sítios conhecidos (para presets/depuração). */
  list() {
    return [...this.items.values()].filter((it) => it.mesh).map((it) => ({ kind: it.kind, dist: it.dist, site: it.site }));
  }

  dispose() {
    for (const [k, it] of [...this.items]) {
      it.job?.cancel?.();
      this._drop(k, it);
    }
    this.mat.dispose();
  }
}
