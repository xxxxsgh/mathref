// Quadtree de cube-sphere por corpo: 6 raízes (faces) → nós subdivididos por
// erro em pixels (espaçamento dos vértices projetado na tela). Um nó só é
// trocado pelos filhos quando os QUATRO estão prontos (nunca há buraco); ao
// juntar, o pai (que mantém sua malha) volta a aparecer e os filhos são
// descartados. Geração assíncrona (GenPool), prioridade por nível e
// distância. Saias nos chunks escondem fendas entre níveis diferentes.
import * as THREE from 'three/webgpu';
import { faceDir, nodeRect } from './chunkgen.js';

const QP = Math.PI / 4;
const _v = new THREE.Vector3();
let KEY = 1;

class Node {
  constructor(tree, face, level, ix, iy, parent) {
    this.tree = tree; this.face = face; this.level = level; this.ix = ix; this.iy = iy; this.parent = parent;
    this.key = KEY++;
    this.children = null;
    this.state = 'none';
    this.mesh = null; this.water = null;
    const { a0, b0, size } = nodeRect(level, ix, iy);
    const d = faceDir(face, a0 + size / 2, b0 + size / 2, [0, 0, 0]);
    const R = tree.R;
    this.dir = new THREE.Vector3(d[0], d[1], d[2]);
    this.center = this.dir.clone().multiplyScalar(R);
    this.spacing = (size * QP * R) / tree.N;
    this.boundR = size * QP * R * 0.75 + tree.amp * 0.6;
    this.minH = -tree.amp; this.maxH = tree.amp;
    this.visible = false;
  }
}

export class QuadTree {
  /**
   * view: { group, desc, terrainMat (get), waterMat (get) }
   * opts: { N, maxLevel, errPx }
   */
  constructor(view, pool, opts) {
    this.view = view;
    this.pool = pool;
    this.R = view.desc.radius;
    this.amp = view.desc.amp;
    this.N = opts.N;
    this.maxLevel = opts.maxLevel;
    this.errPx = opts.errPx;
    this.roots = [];
    for (let f = 0; f < 6; f++) this.roots.push(new Node(this, f, 0, 0, 0, null));
    this.material = null; this.waterMaterial = null;
    this.stats = { nodes: 0, visible: 0, tris: 0, pending: 0 };
    this.K = 600; // pixels por radiano (atualizado)
    this.horizonCull = true;
  }

  job(n) {
    return { desc: this.view.desc, face: n.face, level: n.level, ix: n.ix, iy: n.iy, N: this.N, key: n.key };
  }

  request(n, prio) {
    if (n.state !== 'none') return;
    n.state = 'pending';
    this.pool.request(this.job(n), prio, (r) => this.onReady(n, r));
  }

  onReady(n, r) {
    if (n.state === 'dead') return;
    n.state = 'ready';
    n.center.set(r.center[0], r.center[1], r.center[2]);
    n.boundR = r.boundR; n.minH = r.minH; n.maxH = r.maxH;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nrm, 3));
    g.setAttribute('aUp', new THREE.BufferAttribute(r.up, 3));
    g.setAttribute('aDet', new THREE.BufferAttribute(r.det, 3));
    g.setAttribute('aDat', new THREE.BufferAttribute(r.dat, 4));
    g.setAttribute('aMorph', new THREE.BufferAttribute(r.morph, 3));
    g.setAttribute('aLod', new THREE.BufferAttribute(r.lod, 1));
    g.setIndex(new THREE.BufferAttribute(r.index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), r.boundR);
    const m = new THREE.Mesh(g, this.material);
    m.position.copy(n.center);
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.receiveShadow = true; m.castShadow = false;
    m.visible = false;
    m.name = 'pl.chunk';
    this.view.group.add(m);
    n.mesh = m;
    n.tris = r.index.length / 3;
    if (r.water && this.waterMaterial) {
      const w = new THREE.BufferGeometry();
      w.setAttribute('position', new THREE.BufferAttribute(r.water.pos, 3));
      w.setAttribute('aUp', new THREE.BufferAttribute(r.water.up, 3));
      w.setAttribute('aDet', new THREE.BufferAttribute(r.water.det, 3));
      w.setAttribute('aDepth', new THREE.BufferAttribute(r.water.depth, 1));
      w.setIndex(new THREE.BufferAttribute(r.water.index, 1));
      w.computeBoundingSphere(); // a água fica a |midH| do centro do chunk: esfera própria
      const wm = new THREE.Mesh(w, this.waterMaterial);
      wm.position.copy(n.center);
      wm.matrixAutoUpdate = false; wm.updateMatrix();
      wm.renderOrder = -5;
      wm.visible = false;
      wm.name = 'pl.water';
      this.view.group.add(wm);
      n.water = wm;
    }
  }

  setMaterials(terrain, water) {
    if (terrain === this.material && water === this.waterMaterial) return;
    this.material = terrain; this.waterMaterial = water;
    this.forEach((n) => { if (n.mesh) n.mesh.material = terrain; if (n.water && water) n.water.material = water; });
  }

  forEach(fn, nodes = this.roots) {
    for (const n of nodes) { fn(n); if (n.children) this.forEach(fn, n.children); }
  }

  setVisible(n, v) {
    if (n.visible === v) return;
    n.visible = v;
    if (n.mesh) n.mesh.visible = v;
    if (n.water) n.water.visible = v;
  }

  hideSubtree(n) {
    this.setVisible(n, false);
    if (n.children) for (const c of n.children) this.hideSubtree(c);
  }

  dispose(n) {
    if (n.children) { for (const c of n.children) this.dispose(c); n.children = null; }
    if (n.state === 'pending') this.pool.cancel(n.key);
    n.state = 'dead';
    if (n.mesh) { n.mesh.geometry.dispose(); n.mesh.removeFromParent(); n.mesh = null; }
    if (n.water) { n.water.geometry.dispose(); n.water.removeFromParent(); n.water = null; }
  }

  disposeChildren(n) {
    if (!n.children) return;
    for (const c of n.children) this.dispose(c);
    n.children = null;
  }

  split(n) {
    const L = n.level + 1, x = n.ix * 2, y = n.iy * 2;
    n.children = [new Node(this, n.face, L, x, y, n), new Node(this, n.face, L, x + 1, y, n), new Node(this, n.face, L, x, y + 1, n), new Node(this, n.face, L, x + 1, y + 1, n)];
  }

  /** Atualiza o LOD com a câmera em coordenadas LOCAIS do corpo. */
  update(cam, K) {
    this.K = K;
    const camD = cam.length();
    this.camD = camD;
    this.camDir = _v.copy(cam).divideScalar(Math.max(1, camD)).clone();
    // horizonte: ângulo do ponto sob a câmera até onde o chão some
    const Rmin = this.R - this.amp * 0.5;
    this.cosH = camD > Rmin ? Math.acos(Math.min(1, Rmin / camD)) : 0;
    this.extraH = Math.acos(Math.min(1, Rmin / (this.R + this.amp * 1.2)));
    // de longe (órbita) a silhueta e o litoral pedem mais detalhe relativo
    this.thr = camD > this.R * 1.5 ? this.errPx * 0.45 : this.errPx;
    this.lodK = K / this.thr; // distância de divisão = espaçamento × lodK (usada na geomorfose)
    this.stats.visible = 0; this.stats.tris = 0; this.stats.nodes = 0;
    for (const r of this.roots) {
      if (r.state === 'none') this.request(r, -1);
      this.visit(r, cam);
    }
    this.stats.pending = this.pool.pending;
  }

  culled(n) {
    if (!this.horizonCull || this.camD <= this.R - this.amp) return false;
    const ang = Math.acos(Math.max(-1, Math.min(1, n.dir.dot(this.camDir))));
    const half = n.boundR / this.R;
    return ang - half > this.cosH + this.extraH + 0.02;
  }

  visit(n, cam) {
    this.stats.nodes++;
    const d = Math.max(1, n.center.distanceTo(cam) - n.boundR);
    const px = (n.spacing / d) * this.K;
    const thr = this.thr;
    const want = px > thr && n.level < this.maxLevel;
    const cull = n.level > 0 && this.culled(n);
    if (want && !cull) {
      if (!n.children) this.split(n);
      let ready = true;
      for (const c of n.children) {
        if (c.state === 'none') {
          const dc = Math.max(1, c.center.distanceTo(cam) - c.boundR);
          this.request(c, c.level * 4 + Math.log2(dc + 1));
        }
        if (c.state !== 'ready') ready = false;
      }
      if (ready || n.state !== 'ready') {
        this.setVisible(n, false);
        for (const c of n.children) this.visit(c, cam);
        if (!ready && n.state !== 'ready') { /* raiz ainda gerando */ }
      } else {
        this.setVisible(n, !cull);
        if (!cull) { this.stats.visible++; this.stats.tris += n.tris || 0; }
        for (const c of n.children) this.hideSubtree(c);
      }
    } else {
      if (n.children) this.disposeChildren(n);
      const v = n.state === 'ready' && !cull;
      this.setVisible(n, v);
      if (v) { this.stats.visible++; this.stats.tris += n.tris || 0; }
    }
  }

  /** Há geração pendente para chegar ao LOD desejado? */
  get busy() { return this.pool.pending > 0; }

  destroy() { for (const r of this.roots) this.dispose(r); }
}
