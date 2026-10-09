/**
 * LOD DO TERRENO — 6 quadtrees (uma por face do cubesphere).
 *
 * Seleção (a cada frame): um nó se divide quando o espaçamento dos seus
 * vértices projetado na tela passa de `spacingPx` (derivado de
 * quality.terrainError): arco/N / distância · focal > spacingPx. Fora do
 * frustum o limiar é 3× mais frouxo (menos chunks, mas sem buracos ao virar
 * a câmera). Atrás do horizonte não divide nem desenha.
 *
 * Desenho sem buracos: um nó só é trocado pelos filhos quando os 4 estão
 * prontos ("coverable"); ao juntar, os filhos ficam até o pai chegar.
 * Geomorphing no shader suaviza as trocas, as saias escondem as frestas.
 *
 * Streaming: jobs no pool de workers com prioridade = distância (×4 fora do
 * frustum), key = nó (pedido repetido substitui o da fila), reprioritizados
 * quando a câmera anda; nós que deixam de ser necessários são cancelados.
 * Uploads limitados por frame (orçamento de vértices) — o frame nunca trava.
 */
import * as THREE from 'three';
import { faceDir, dirFace, nodeKey } from './cube.js';
import { createTerrainMaterial, createTerrainDepthMaterial } from './material.js';

export const N = 96; // quads por lado de chunk (97² vértices + saias)

export class TerrainLOD {
  constructor(ctx, host) {
    this.ctx = ctx;
    this.host = host; // { cfg, terrain, pool, U, editsFor(bounds), root }
    this.nodes = new Map();
    this.roots = [];
    this.frame = 0;
    this.index = null;
    this.materials = [];
    this.uploadQueue = [];
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._sph = new THREE.Sphere();
    this.stats = { leaves: 0, drawn: 0, pending: 0, built: 0, tris: 0, maxLevel: 0, genMs: 0 };
    this.busyDone = null;
    this.needFrames = 0;
    this.zeroMorph = null;
    const R = host.cfg.radius;
    this.N = N;
    // nível máximo: espaçamento ≥ ~0,6 m
    this.maxLevel = Math.max(4, Math.floor(Math.log2((R * Math.PI * 0.5) / (N * 0.6))));
    for (let L = 0; L <= this.maxLevel; L++) {
      const m = createTerrainMaterial(host.U);
      if (host.debugSkirt) m.defines = { DEBUG_SKIRT: 1 };
      this.materials.push(m);
    }
    this.depthMat = createTerrainDepthMaterial(host.U);
    for (let f = 0; f < 6; f++) this.roots.push(this._node(f, 0, 0, 0, null));
  }

  setIndex(idx) {
    this.index = new THREE.BufferAttribute(idx, 1);
  }

  /** arco (m) da aresta de um nó de nível L */
  arc(L) {
    return (this.host.cfg.radius * Math.PI * 0.5) / (1 << L);
  }

  _node(f, L, x, y, parent) {
    const key = nodeKey(f, L, x, y);
    let n = this.nodes.get(key);
    if (n) return n;
    const R = this.host.cfg.radius;
    const du = 2 / (1 << L);
    const u0 = -1 + x * du, v0 = -1 + y * du;
    const c = faceDir(f, u0 + du / 2, v0 + du / 2, [0, 0, 0]);
    // faixa de altura estimada: amostras no centro e nos cantos + folga ∝ tamanho
    // (os limites reais chegam com a malha); nós grandes usam os limites globais
    const T = this.host.terrain;
    let hmin, hmax;
    const arc = this.arc(L);
    const d = [0, 0, 0];
    if (L < 4) {
      hmin = T.minH;
      hmax = T.maxH;
    } else {
      hmin = Infinity;
      hmax = -Infinity;
      for (const [a, b] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
        faceDir(f, u0 + a * du, v0 + b * du, d);
        const h = T.height(d[0], d[1], d[2], arc / 16);
        if (h < hmin) hmin = h;
        if (h > hmax) hmax = h;
      }
      const pad = Math.min(1500, 10 + arc * 0.2);
      hmin = Math.max(T.minH, hmin - pad);
      hmax = Math.min(T.maxH, hmax + pad);
      if (parent) {
        hmin = Math.max(hmin, parent.hmin);
        hmax = Math.min(hmax, parent.hmax);
        if (hmin > hmax) hmin = hmax - 1;
      }
    }
    // raio: maior corda do centro aos cantos + faixa de altura
    let rr = 0;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      faceDir(f, u0 + a * du, v0 + b * du, d);
      rr = Math.max(rr, Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]) * (R + hmax));
    }
    const hm = (hmin + hmax) / 2;
    n = {
      key, f, L, x, y, parent,
      u0, v0, du,
      dir: c,
      hmin, hmax,
      cx: c[0] * (R + hm), cy: c[1] * (R + hm), cz: c[2] * (R + hm),
      r: rr + (hmax - hmin) / 2,
      children: null,
      mesh: null,
      job: null,
      version: 0,
      builtVersion: -1,
      visit: 0,
      drawnAt: 0,
      split: false,
      dist: 0,
      inFrustum: false,
      covered: 0,
      queued: false,
    };
    this.nodes.set(key, n);
    return n;
  }

  /** Câmera relativa ao centro do planeta (double). */
  _cam() {
    const o = this.ctx.space.origin, c = this.host.center;
    return [o.x - c.x, o.y - c.y, o.z - c.z];
  }

  update() {
    const ctx = this.ctx;
    this.frame++;
    const cam = this._cam();
    const camR = Math.hypot(cam[0], cam[1], cam[2]);
    const R = this.host.cfg.radius;
    // frustum em espaço de render
    const camera = ctx.camera;
    camera.updateMatrixWorld();
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m, THREE.WebGLCoordinateSystem, camera.reversedDepth);
    const H = ctx.pipeline?.height || ctx.renderer.domElement.height || 720;
    const focal = H / (2 * Math.tan(((camera.fov || 70) * Math.PI) / 360));
    const spacingPx = Math.max(2, (ctx.quality.terrainError ?? 3) * 3.5);
    this.K = focal / spacingPx; // divide se arco/N/d · focal > spacingPx  ⇔  d < arco/N · K
    // morph por nível: fim = distância de divisão do pai
    for (let L = 1; L <= this.maxLevel; L++) {
      const end = (this.arc(L - 1) / N) * this.K;
      const m = this.materials[L].userData.morph;
      m.uMorphEnd.value = end * 0.92;
      m.uMorphStart.value = end * 0.55;
    }
    // horizonte: esfera oclusora (raio mínimo) — ângulo visível a partir do centro
    const Rocc = R + Math.max(this.host.terrain.minH, -400);
    this.horizonCos = camR > Rocc ? Rocc / camR : -1;
    this.camR = camR;
    this.cam = cam;
    this.camFace = dirFace(cam[0], cam[1], cam[2], this.camFace || [0, 0, 0]);
    this._fd = this._fd || [0, 0, 0];
    this.stats.leaves = 0;
    this.stats.maxLevel = 0;
    this.want = [];
    for (const r of this.roots) this._select(r);
    // desenho
    this.stats.drawn = 0;
    this.stats.tris = 0;
    this.missing = 0;
    for (const r of this.roots) this._draw(r);
    for (const n of this.nodes.values()) {
      if (n.mesh) {
        const vis = n.drawnAt === this.frame;
        if (n.mesh.visible !== vis) n.mesh.visible = vis;
      }
    }
    this._requests();
    this._uploads();
    this._gc();
  }

  _visibleHorizon(n) {
    if (this.horizonCos < 0) return true;
    const cr = Math.hypot(n.cx, n.cy, n.cz);
    const cosA = (n.cx * this.cam[0] + n.cy * this.cam[1] + n.cz * this.cam[2]) / (cr * this.camR);
    const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const R = this.host.cfg.radius;
    const lim = Math.acos(this.horizonCos) + Math.acos(Math.min(1, (R + Math.max(this.host.terrain.minH, -400)) / Math.max(cr + n.r, R))) + n.r / cr;
    return a <= lim;
  }

  _select(n) {
    n.visit = this.frame;
    const dx = n.cx - this.cam[0], dy = n.cy - this.cam[1], dz = n.cz - this.cam[2];
    n.dist = Math.max(0, Math.hypot(dx, dy, dz) - n.r);
    if (n.f === this.camFace[0]) {
      // mesma face: distância ao retalho (u,v) grampeado — bem mais justa que a esfera envolvente
      const uc = Math.min(n.u0 + n.du, Math.max(n.u0, this.camFace[1]));
      const vc = Math.min(n.v0 + n.du, Math.max(n.v0, this.camFace[2]));
      const p = faceDir(n.f, uc, vc, this._fd);
      const rr = this.host.cfg.radius + Math.min(n.hmax, Math.max(n.hmin, this.camR - this.host.cfg.radius));
      n.dist = Math.max(n.dist, Math.hypot(p[0] * rr - this.cam[0], p[1] * rr - this.cam[1], p[2] * rr - this.cam[2]));
    }
    const o = this.ctx.space.origin, c = this.host.center;
    this._v.set(c.x + n.cx - o.x, c.y + n.cy - o.y, c.z + n.cz - o.z);
    this._sph.center.copy(this._v);
    this._sph.radius = n.r;
    n.inFrustum = this.frustum.intersectsSphere(this._sph);
    n.horizon = this._visibleHorizon(n);
    let split = false;
    if (n.L < this.maxLevel && n.horizon) {
      const lim = (this.arc(n.L) / N) * this.K * (n.inFrustum ? 1 : 0.3);
      split = n.dist < lim;
    }
    n.split = split;
    if (split) {
      if (!n.children) {
        const L = n.L + 1, x = n.x * 2, y = n.y * 2;
        n.children = [this._node(n.f, L, x, y, n), this._node(n.f, L, x + 1, y, n), this._node(n.f, L, x, y + 1, n), this._node(n.f, L, x + 1, y + 1, n)];
      }
      for (const ch of n.children) this._select(ch);
    } else {
      this.stats.leaves++;
      this.stats.maxLevel = Math.max(this.stats.maxLevel, n.L);
      this.want.push(n);
    }
  }

  _coverable(n) {
    if (n.covered === this.frame) return true;
    if (n.covered === -this.frame) return false;
    let ok = !!n.mesh || !n.horizon; // atrás do horizonte: nada a cobrir
    if (!ok && n.children) ok = n.children.every((c) => this._coverable(c));
    n.covered = ok ? this.frame : -this.frame;
    return ok;
  }

  _draw(n) {
    if (!n.horizon) return; // atrás do horizonte: nada
    if (n.split && n.children && n.children.every((c) => this._coverable(c))) {
      for (const c of n.children) this._draw(c);
      return;
    }
    if (n.mesh) {
      n.drawnAt = this.frame;
      this.stats.drawn++;
      if (!n.split) this._prune(n);
      return;
    }
    if (n.children && n.children.every((c) => this._coverable(c))) {
      for (const c of n.children) this._draw(c);
      return;
    }
    if (n.inFrustum) this.missing++;
  }

  /** Nó-folha com malha pronta: descarta a subárvore antiga (filhos). */
  _prune(n) {
    if (!n.children) return;
    for (const c of n.children) {
      this._prune(c);
      this._dispose(c);
      this.nodes.delete(c.key);
    }
    n.children = null;
  }

  _dispose(n) {
    if (n.job) {
      n.job.cancel?.();
      n.job = null;
    }
    if (n.mesh) {
      this.host.onRemove?.(n);
      n.mesh.userData.handle?.remove();
      this.host.root.remove(n.mesh);
      n.mesh.geometry.dispose();
      n.mesh = null;
    }
  }

  _priority(n) {
    return n.dist * (n.inFrustum ? 1 : 4) + (n.inFrustum ? 0 : 2000) - n.L * 0.01;
  }

  _requests() {
    const pool = this.host.pool;
    let pending = 0;
    for (const n of this.want) {
      if (!n.horizon) continue;
      if (n.mesh && n.builtVersion === n.version) continue;
      pending++;
      if (n.job || n.queued) continue;
      this._request(n);
    }
    // pais sem malha cujo filho ainda não cobre (evita buracos ao se mover)
    this.stats.pending = pending + this.uploadQueue.length;
    // reprioriza/cancela o que está na fila
    if (this.frame % 10 === 0) {
      pool.reprioritize((job) => {
        const n = this.nodes.get(job.key?.slice?.(2));
        if (!job.key?.startsWith?.('c:')) return job.priority;
        if (!n || n.visit < this.frame - 2) {
          if (n) n.job = null;
          return null;
        }
        return this._priority(n);
      });
    }
  }

  _request(n) {
    const ver = n.version;
    const payload = {
      cfg: this.host.cfg,
      face: n.f, L: n.L, x: n.x, y: n.y, N,
      edits: this.host.editsFor(n),
    };
    const t0 = performance.now();
    const job = this.host.pool.run('chunk', payload, { priority: this._priority(n), key: `c:${n.key}` });
    n.job = job;
    job.then(
      (r) => {
        if (n.job === job) n.job = null;
        if (!this.nodes.has(n.key) || this.nodes.get(n.key) !== n) return;
        this.stats.genMs = r.ms;
        n.queued = true;
        this.uploadQueue.push({ n, r, ver, t: performance.now() - t0 });
      },
      () => {
        if (n.job === job) n.job = null;
      },
    );
  }

  _uploads() {
    if (!this.uploadQueue.length) return;
    this.uploadQueue.sort((a, b) => this._priority(a.n) - this._priority(b.n));
    // orçamento: ~6 chunks por frame (≈ 27k vértices); no modo shot, mais
    const budget = this.ctx.shot && !window.__ready ? 24 : 6;
    let k = 0;
    while (this.uploadQueue.length && k < budget) {
      const { n, r, ver } = this.uploadQueue.shift();
      n.queued = false;
      if (this.nodes.get(n.key) !== n) continue;
      if (ver < n.builtVersion) continue;
      this._apply(n, r, ver);
      k++;
    }
  }

  _apply(n, r, ver) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normalAO', new THREE.BufferAttribute(r.nor, 4, true));
    g.setAttribute('morph', new THREE.BufferAttribute(r.morph, 4));
    g.setAttribute('tdata', new THREE.BufferAttribute(r.data, 4, true));
    g.setIndex(this.index);
    const b = r.bounds;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(b.cx, b.cy, b.cz), b.r);
    const R = this.host.cfg.radius;
    // limites reais (melhoram a seleção deste nó e dos filhos)
    n.hmin = b.hmin;
    n.hmax = b.hmax;
    const c = this.host.center;
    n.cx = r.anchor[0] + b.cx;
    n.cy = r.anchor[1] + b.cy;
    n.cz = r.anchor[2] + b.cz;
    n.r = b.r;
    const old = n.mesh;
    if (old) {
      old.geometry.dispose();
      old.geometry = g;
    } else {
      const m = new THREE.Mesh(g, this.materials[n.L]);
      m.name = `planet:chunk:${n.key}`;
      m.matrixAutoUpdate = true;
      m.customDepthMaterial = this.depthMat;
      m.castShadow = !this.host.debugNoShadow && n.L >= this.maxLevel - 4;
      m.receiveShadow = true;
      m.visible = false;
      const wp = new this.ctx.WorldPos(c.x + r.anchor[0], c.y + r.anchor[1], c.z + r.anchor[2]);
      m.userData.handle = this.ctx.space.registerFloating(m, wp);
      m.userData.anchor = wp;
      this.host.root.add(m);
      n.mesh = m;
    }
    n.builtVersion = ver;
    this.stats.built++;
    if (!old) this.host.onAdd?.(n);
    void R;
  }

  /** Descarta nós fora da árvore desejada há algum tempo. */
  _gc() {
    if (this.frame % 30 !== 0) return;
    for (const n of [...this.nodes.values()]) {
      if (n.L === 0) continue;
      if (n.visit >= this.frame - 60) continue;
      if (n.drawnAt >= this.frame - 2) continue;
      // só remove se o pai também não precisa dele para cobertura
      this._dispose(n);
      this.nodes.delete(n.key);
      if (n.parent && n.parent.children && n.parent.children.includes(n)) n.parent.children = null;
    }
  }

  /** Marca para refazer os nós com malha que intersectam a esfera (edição). */
  invalidate(cx, cy, cz, rad) {
    let k = 0;
    for (const n of this.nodes.values()) {
      if (!n.mesh && !n.job) continue;
      const d = Math.hypot(n.cx - cx, n.cy - cy, n.cz - cz);
      if (d > n.r + rad) continue;
      n.version++;
      n.job?.cancel?.();
      n.job = null;
      k++;
    }
    return k;
  }

  /** Há trabalho pendente para a imagem atual (frustum)? */
  get busy() {
    return this.missing > 0 || this.want.some((n) => n.horizon && n.inFrustum && (!n.mesh || n.builtVersion !== n.version)) || this.uploadQueue.length > 0;
  }

  dispose() {
    for (const n of this.nodes.values()) this._dispose(n);
    this.nodes.clear();
    for (const m of this.materials) m.dispose();
    this.depthMat.dispose();
  }
}
