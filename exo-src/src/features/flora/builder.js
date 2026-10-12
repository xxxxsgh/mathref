/**
 * MONTADOR DE GEOMETRIA da flora (puro, sem GPU).
 *
 * Atributos por vértice:
 *   position, normal
 *   aUv    vec2  coordenada na camada (repete nas camadas "tiled")
 *   color  vec3  cor (paleta do bioma × oclusão aproximada)
 *   aMat   vec4  (camada da textura-array, tipo, emissão, rugosidade)
 *              tipo: 0 opaco · 1 folhagem translúcida · 2 cristal · 3 fungo
 *   aWind  vec4  (balanço do conjunto, tremor da folha, fase, normal suave 0..1)
 *
 * "Normal suave": folhagem e grama misturam a normal da face com uma direção
 * de volume (para fora da copa / para cima) — a copa é iluminada como um
 * volume e não como cartas soltas; o shader não inverte essa normal nas
 * faces de trás.
 */
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const KIND = { OPAQUE: 0, LEAF: 1, CRYSTAL: 2, FUNGUS: 3 };

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.mat = [];
    this.wind = [];
    this.soft = []; // direção suave (xyz) + peso
    this.idx = [];
    this.fixedNormals = []; // normais explícitas (NaN = calcular)
    this.H = 1; // altura de referência para o peso do vento
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(p, u, v, col, mat, wind, soft = null, nrm = null) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.col.push(col[0], col[1], col[2]);
    this.mat.push(mat[0], mat[1], mat[2], mat[3]);
    this.wind.push(wind[0], wind[1], wind[2], wind[3]);
    if (soft) this.soft.push(soft.x, soft.y, soft.z, soft.w ?? 0.5);
    else this.soft.push(0, 0, 0, 0);
    if (nrm) this.fixedNormals.push(nrm.x, nrm.y, nrm.z);
    else this.fixedNormals.push(NaN, NaN, NaN);
    return this.count - 1;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }
  /** peso de balanço pela altura do ponto (0 no chão → 1 no topo) */
  sway(y, extra = 0) {
    const h = Math.max(0, y / this.H);
    return Math.min(1.5, h * h + extra);
  }

  /**
   * Tubo generalizado ao longo de uma polilinha (transporte paralelo).
   * pts: Vector3[], radii: number[]. opts: { seg, layer, uvU, uvV (m por repetição),
   * color(t) → [r,g,b], kind, rough, emit, flutter, phase, cap (fecha a ponta) }
   */
  tube(pts, radii, o) {
    const seg = o.seg ?? 6;
    const n = pts.length;
    if (n < 2) return;
    const tangents = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      tangents.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
    // referencial inicial
    let nrm = new THREE.Vector3(1, 0, 0);
    if (Math.abs(tangents[0].x) > 0.9) nrm.set(0, 0, 1);
    nrm.sub(_t.copy(tangents[0]).multiplyScalar(nrm.dot(tangents[0]))).normalize();
    const rings = [];
    let len = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        // transporte paralelo
        _q.setFromUnitVectors(tangents[i - 1], tangents[i]);
        nrm.applyQuaternion(_q).normalize();
        len += pts[i].distanceTo(pts[i - 1]);
      }
      const bin = new THREE.Vector3().crossVectors(tangents[i], nrm).normalize();
      const t = i / (n - 1);
      const col = o.color ? o.color(t, pts[i]) : [1, 1, 1];
      const ring = [];
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        _n.copy(nrm).multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        _a.copy(pts[i]).addScaledVector(_n, radii[i]);
        const sw = this.sway(pts[i].y) * (o.swayMul ?? 1);
        ring.push(
          this.vert(
            _a,
            (k / seg) * (o.uvU ?? 1),
            len / (o.uvV ?? 1),
            col,
            [o.layer, o.kind ?? KIND.OPAQUE, o.emit ?? 0, o.rough ?? 0.85],
            [sw, o.flutter ?? 0, o.phase ?? 0, 0],
            null,
            _n,
          ),
        );
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < seg; k++) this.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]);
    }
    if (o.cap && radii[n - 1] > 1e-4) {
      const t = 1;
      const col = o.color ? o.color(t, pts[n - 1]) : [1, 1, 1];
      const c = this.vert(pts[n - 1].clone().addScaledVector(tangents[n - 1], radii[n - 1] * 0.6), 0.5, len / (o.uvV ?? 1), col, [o.layer, o.kind ?? 0, o.emit ?? 0, o.rough ?? 0.85], [this.sway(pts[n - 1].y), 0, o.phase ?? 0, 0], null, tangents[n - 1]);
      for (let k = 0; k < seg; k++) this.tri(rings[n - 1][k], rings[n - 1][k + 1], c);
    }
  }

  /**
   * Carta de folha dobrada e arqueada.
   * origin: base; dir: direção do comprimento (unit); side: direção da largura (unit);
   * L, W: tamanho; o: { segs, droop (m de queda na ponta), fold (0..1 vinco central),
   * curl, layer, colBase, colTip, kind, flutter, phase, soft: Vector4 (direção+peso), uv: [u0,v0,u1,v1] }
   */
  card(origin, dir, side, Lc, W, o) {
    const segs = o.segs ?? 3;
    const up = _c.crossVectors(side, dir).normalize(); // normal da carta
    const down = o.downDir || new THREE.Vector3(0, -1, 0);
    const cols = [];
    const uv = o.uv || [0, 0, 1, 1];
    const fold = o.fold ?? 0.15;
    const rows = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const col = lerp3(o.colBase, o.colTip, t);
      const center = new THREE.Vector3().copy(origin).addScaledVector(dir, t * Lc).addScaledVector(down, (o.droop ?? 0) * t * t);
      // vinco: o meio fica acima das bordas
      const wv = W * (o.widthFn ? o.widthFn(t) : 1);
      const row = [];
      for (let k = 0; k < 3; k++) {
        const s = k - 1; // -1, 0, 1
        _a.copy(center).addScaledVector(side, s * wv * 0.5);
        if (s === 0) _a.addScaledVector(up, fold * wv * 0.5);
        if (o.curl) _a.addScaledVector(up, o.curl * Math.abs(s) * wv * 0.5 * t);
        const v = uv[1] + (uv[3] - uv[1]) * t;
        const u = uv[0] + (uv[2] - uv[0]) * (k / 2);
        const sw = this.sway(_a.y) * (o.swayMul ?? 1);
        const fl = (o.flutter ?? 0.5) * t;
        row.push(this.vert(_a, u, v, col, [o.layer, o.kind ?? KIND.LEAF, o.emit ?? 0, o.rough ?? 0.6], [sw, fl, o.phase ?? 0, o.soft ? o.soft.w : 0], o.soft));
      }
      rows.push(row);
      cols.push(col);
    }
    for (let i = 0; i < segs; i++) {
      this.quad(rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]);
      this.quad(rows[i][1], rows[i + 1][1], rows[i + 1][2], rows[i][2]);
    }
  }

  /** Mescla outro builder (já em coordenadas locais) com transformação opcional. */
  merge(other, m = null) {
    const base = this.count;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    for (let i = 0; i < other.count; i++) {
      _a.fromArray(other.pos, i * 3);
      if (m) _a.applyMatrix4(m);
      this.pos.push(_a.x, _a.y, _a.z);
      _b.fromArray(other.fixedNormals, i * 3);
      if (nm && !Number.isNaN(_b.x)) _b.applyMatrix3(nm).normalize();
      this.fixedNormals.push(_b.x, _b.y, _b.z);
      _c.fromArray(other.soft, i * 4);
      if (nm) _c.applyMatrix3(nm);
      this.soft.push(_c.x, _c.y, _c.z, other.soft[i * 4 + 3]);
    }
    this.uv.push(...other.uv);
    this.col.push(...other.col);
    this.mat.push(...other.mat);
    this.wind.push(...other.wind);
    for (const i of other.idx) this.idx.push(i + base);
  }

  /** Recalcula o peso de balanço depois de saber a altura total. */
  reweight(H) {
    this.H = H;
    for (let i = 0; i < this.count; i++) {
      const y = this.pos[i * 3 + 1];
      const h = Math.max(0, y / H);
      this.wind[i * 4] = Math.min(1.5, h * h);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 4));
    const N = this.count;
    g.setIndex(N > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeVertexNormals();
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < N; i++) {
      if (!Number.isNaN(this.fixedNormals[i * 3])) {
        nrm.setXYZ(i, this.fixedNormals[i * 3], this.fixedNormals[i * 3 + 1], this.fixedNormals[i * 3 + 2]);
      }
      const w = this.soft[i * 4 + 3];
      if (w > 0) {
        _a.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        _b.set(this.soft[i * 4], this.soft[i * 4 + 1], this.soft[i * 4 + 2]);
        // orienta a normal da face para o lado da direção suave antes de misturar
        if (_a.dot(_b) < 0) _a.negate();
        _a.multiplyScalar(1 - w).addScaledVector(_b, w).normalize();
        nrm.setXYZ(i, _a.x, _a.y, _a.z);
      }
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.tris = this.idx.length / 3;
    return g;
  }
}

export function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function mul3(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
