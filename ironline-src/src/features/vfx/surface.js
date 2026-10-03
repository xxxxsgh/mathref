/**
 * Índice de triângulos das malhas ESTÁTICAS visíveis do mundo, para assentar
 * marcas de tiro na superfície que o jogador VÊ (os colisores são AABBs e
 * podem ficar alguns centímetros atrás/à frente da fachada real).
 *
 * Grade uniforme no plano XZ (células de 2 m) com os triângulos em world
 * space num Float32Array. A consulta só testa um segmento curto em torno do
 * acerto do colisor → poucas dezenas de triângulos por tiro.
 * Construído uma vez (preguiçoso, na 1ª consulta ou em `build()`).
 */
import * as THREE from 'three';

const CELL = 2;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _h = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Vector3();

export class SurfaceIndex {
  constructor(root, { exclude = () => false } = {}) {
    this.root = root;
    this.exclude = exclude;
    this.built = false;
    this.tris = null;
    this.cells = new Map();
    this.big = [];
    this.stamp = 0;
    this.marks = null;
  }

  accept(o) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return false;
    if (this.exclude(o)) return false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => !m || m.transparent || m.colorWrite === false || m.visible === false || m.depthWrite === false)) return false;
    const g = o.geometry;
    if (!g?.attributes?.position) return false;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere.radius > 1500) return false; // céu, domos
    // ancestrais invisíveis (ex.: céu do world escondido pelo rendering)
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  build() {
    this.built = true;
    const list = [];
    let count = 0;
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      if (!this.accept(o)) return;
      const g = o.geometry;
      const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      list.push(o);
      count += n;
    });
    const tris = new Float32Array(count * 9);
    let t = 0;
    for (const o of list) {
      const g = o.geometry;
      const pos = g.attributes.position;
      const idx = g.index;
      const n = idx ? idx.count / 3 : pos.count / 3;
      const m = o.matrixWorld;
      for (let i = 0; i < n; i++) {
        const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        _a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        _b.fromBufferAttribute(pos, i1).applyMatrix4(m);
        _c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        const k = t * 9;
        tris[k] = _a.x; tris[k + 1] = _a.y; tris[k + 2] = _a.z;
        tris[k + 3] = _b.x; tris[k + 4] = _b.y; tris[k + 5] = _b.z;
        tris[k + 6] = _c.x; tris[k + 7] = _c.y; tris[k + 8] = _c.z;
        const x0 = Math.floor(Math.min(_a.x, _b.x, _c.x) / CELL), x1 = Math.floor(Math.max(_a.x, _b.x, _c.x) / CELL);
        const z0 = Math.floor(Math.min(_a.z, _b.z, _c.z) / CELL), z1 = Math.floor(Math.max(_a.z, _b.z, _c.z) / CELL);
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) this.big.push(t);
        else
          for (let x = x0; x <= x1; x++)
            for (let z = z0; z <= z1; z++) {
              const key = x * 73856093 ^ z * 19349663;
              let c = this.cells.get(key);
              if (!c) this.cells.set(key, (c = []));
              c.push(t);
            }
        t++;
      }
    }
    this.tris = tris;
    this.marks = new Uint32Array(t);
    this.count = t;
  }

  /**
   * Superfície visível mais próxima ao longo de origin + dir·[0, len].
   * Retorna { point, normal (contra o raio), distance } ou null.
   */
  raycast(origin, dir, len, out = { point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0 }) {
    if (!this.built) this.build();
    if (!this.count) return null;
    const stamp = ++this.stamp;
    const ex = origin.x + dir.x * len, ez = origin.z + dir.z * len;
    const x0 = Math.floor(Math.min(origin.x, ex) / CELL), x1 = Math.floor(Math.max(origin.x, ex) / CELL);
    const z0 = Math.floor(Math.min(origin.z, ez) / CELL), z1 = Math.floor(Math.max(origin.z, ez) / CELL);
    let best = len, found = false;
    const T = this.tris;
    const test = (t) => {
      if (this.marks[t] === stamp) return;
      this.marks[t] = stamp;
      const k = t * 9;
      _a.set(T[k], T[k + 1], T[k + 2]);
      _e1.set(T[k + 3] - _a.x, T[k + 4] - _a.y, T[k + 5] - _a.z);
      _e2.set(T[k + 6] - _a.x, T[k + 7] - _a.y, T[k + 8] - _a.z);
      _h.crossVectors(dir, _e2);
      const det = _e1.dot(_h);
      if (Math.abs(det) < 1e-9) return;
      const inv = 1 / det;
      _s.subVectors(origin, _a);
      const u = _s.dot(_h) * inv;
      if (u < 0 || u > 1) return;
      _q.crossVectors(_s, _e1);
      const v = dir.dot(_q) * inv;
      if (v < 0 || u + v > 1) return;
      const d = _e2.dot(_q) * inv;
      if (d < 0 || d >= best) return;
      best = d;
      found = true;
      out.normal.crossVectors(_e1, _e2).normalize();
      if (out.normal.dot(dir) > 0) out.normal.negate();
    };
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const c = this.cells.get(x * 73856093 ^ z * 19349663);
        if (c) for (let i = 0; i < c.length; i++) test(c[i]);
      }
    for (let i = 0; i < this.big.length; i++) test(this.big[i]);
    if (!found) return null;
    out.distance = best;
    out.point.copy(origin).addScaledVector(dir, best);
    return out;
  }
}
