/**
 * Construtor de malha skinnada: acumula peças (primitivas transformadas,
 * lofts e tubos) com cor/superfície/pesos por vértice e devolve UMA
 * BufferGeometry indexada com:
 *   position, normal, color, aSurf, aAO, skinIndex, skinWeight
 * A oclusão ambiente é assada por voxels, separada por "grupo" (núcleo,
 * braço E, braço D, arma) — partes que se movem umas em relação às outras
 * não se ocluem no bake.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export const GROUPS = { core: 0, armL: 1, armR: 2, gun: 3, sling: 4 };

/**
 * Nível de detalhe da construção (1 = cheio). < 1 reduz os segmentos de
 * cilindros/lofts/tubos/elipsoides e arredonda menos as caixas — LOD de
 * poucos polígonos (aparelho fraco e soldados longe). `withDetail(k, fn)`.
 */
let DETAIL = 1;
const segs = (n, min) => Math.max(min, Math.round(n * DETAIL));
export function withDetail(k, fn) {
  const prev = DETAIL;
  DETAIL = k;
  try {
    return fn();
  } finally {
    DETAIL = prev;
  }
}

export class SkinBuilder {
  constructor() {
    this.P = [];
    this.N = [];
    this.C = [];
    this.S = [];
    this.SI = [];
    this.SW = [];
    this.G = [];
    this.I = [];
  }

  /** material: { color:'#hex'|Color, rough, metal, camo, fabric } */
  _pushVertex(p, n, mat, wfn, group) {
    this.P.push(p.x, p.y, p.z);
    this.N.push(n.x, n.y, n.z);
    const c = mat._c || (mat._c = new THREE.Color(mat.color));
    // variação sutil por vértice evita aspecto "plástico" chapado
    this.C.push(c.r, c.g, c.b);
    this.S.push(mat.rough ?? 0.8, mat.metal ?? 0, mat.camo ?? 0, mat.fabric ?? 0);
    let w = typeof wfn === 'number' ? [[wfn, 1]] : wfn(p);
    w = w.filter((x) => x[1] > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = w.reduce((s, x) => s + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      this.SI.push(w[k] ? w[k][0] : 0);
      this.SW.push(w[k] ? w[k][1] / sum : 0);
    }
    this.G.push(group);
  }

  /** Adiciona uma BufferGeometry (já transformada). */
  addGeometry(geo, mat, wfn, group = 0) {
    const base = this.P.length / 3;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      this._pushVertex(_v, _n, mat, wfn, group);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.I.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
  }

  /** Primitiva com transformação { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz] }. */
  prim(geo, t, mat, wfn, group = 0) {
    _e.set(...(t.r || [0, 0, 0]), t.order || 'XYZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(...(t.p || [0, 0, 0])), _q, new THREE.Vector3(...(t.s || [1, 1, 1])));
    geo.applyMatrix4(_m);
    this.addGeometry(geo, mat, wfn, group);
    geo.dispose();
  }

  box(size, t, mat, wfn, group, radius = 0.006, seg = null) {
    const r = Math.min(radius, Math.min(...size) * 0.49);
    if (seg == null) seg = Math.max(...size) < 0.1 || r < 0.006 ? 1 : 2;
    if (DETAIL < 1) seg = 1;
    const g = r > 0.0005 && (DETAIL >= 1 || Math.max(...size) > 0.12) ? new RoundedBoxGeometry(size[0], size[1], size[2], seg, r) : new THREE.BoxGeometry(...size);
    this.prim(g, t, mat, wfn, group);
  }

  ellipsoid(radii, t, mat, wfn, group, ws = 16, hs = 12) {
    ws = segs(ws, 6);
    hs = segs(hs, 4);
    this.prim(new THREE.SphereGeometry(1, ws, hs), { ...t, s: radii }, mat, wfn, group);
  }

  /** Cilindro entre dois pontos a→b. */
  cyl(a, b, r0, r1, mat, wfn, group, seg = 12, open = false) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
    const len = A.distanceTo(Bv);
    const g = new THREE.CylinderGeometry(r1, r0, len, segs(seg, 5), 1, open);
    const dir = Bv.clone().sub(A).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _m.compose(A.clone().add(Bv).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    this.addGeometry(g, mat, wfn, group);
    g.dispose();
  }

  /**
   * Loft genérico: anéis { c:[x,y,z], u:[..], v:[..], ru, rv, n?, ox?, oz? }.
   * u/v = eixos do anel (padrão X/Z → anéis horizontais). n = expoente de
   * superelipse (2 = elipse, >2 mais quadrado). Fecha as pontas se caps.
   */
  loft(rings, mat, wfn, group = 0, { seg = 20, caps = [true, true], arc = null } = {}) {
    seg = segs(seg, 6);
    const base = this.P.length / 3;
    const verts = [];
    const ringPts = [];
    for (const R of rings) {
      const c = new THREE.Vector3(...R.c);
      const u = new THREE.Vector3(...(R.u || [1, 0, 0])).normalize();
      const v = new THREE.Vector3(...(R.v || [0, 0, 1])).normalize();
      const n = R.n || 2;
      const pts = [];
      for (let i = 0; i <= seg; i++) {
        const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2;
        const a = a0 + ((a1 - a0) * i) / seg;
        const ca = Math.cos(a), sa = Math.sin(a);
        const pu = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n);
        const pv = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
        // rv pode ser diferente na frente/atrás (rvb) para silhuetas reais
        const rv = sa < 0 && R.rvb != null ? R.rvb : R.rv;
        pts.push(c.clone().addScaledVector(u, pu * R.ru).addScaledVector(v, pv * rv));
      }
      ringPts.push(pts);
    }
    // geometria temporária para normais suaves
    const g = new THREE.BufferGeometry();
    for (const pts of ringPts) for (const p of pts) verts.push(p.x, p.y, p.z);
    const idx = [];
    const W = seg + 1;
    for (let r = 0; r < rings.length - 1; r++)
      for (let i = 0; i < seg; i++) {
        const a = r * W + i, b = a + 1, c = a + W, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    let nv = verts.length / 3;
    const capCenters = [];
    if (caps[0] || caps[1]) {
      [0, rings.length - 1].forEach((r, k) => {
        if (!caps[k]) return;
        const pts = ringPts[r];
        const cc = pts.slice(0, seg).reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(seg);
        verts.push(cc.x, cc.y, cc.z);
        capCenters.push(nv);
        for (let i = 0; i < seg; i++) {
          const a = r * W + i, b = a + 1;
          if (k === 0) idx.push(nv, a, b);
          else idx.push(nv, b, a);
        }
        nv++;
      });
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // a orientação dos triângulos depende da ordem dos anéis; corrige se a
    // normal média apontar para dentro
    const pos = g.attributes.position, nor = g.attributes.normal;
    let out = 0;
    const cent = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) cent.add(_v.fromBufferAttribute(pos, i));
    cent.divideScalar(pos.count);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).sub(cent);
      _n.fromBufferAttribute(nor, i);
      out += _v.dot(_n);
    }
    if (out < 0 && !arc) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    this.addGeometry(g, mat, wfn, group);
    g.dispose();
    return base;
  }

  /**
   * Tubo ao longo de uma polilinha [{p:[x,y,z], ru, rv, n?}]; o eixo u do anel
   * é a projeção de `side` perpendicular à tangente.
   */
  tube(points, mat, wfn, group = 0, { seg = 14, side = [1, 0, 0], caps = [true, true] } = {}) {
    const P = points.map((q) => new THREE.Vector3(...q.p));
    const rings = points.map((q, i) => {
      const t = new THREE.Vector3();
      if (i === 0) t.subVectors(P[1], P[0]);
      else if (i === P.length - 1) t.subVectors(P[i], P[i - 1]);
      else t.subVectors(P[i + 1], P[i - 1]);
      t.normalize();
      const s = new THREE.Vector3(...(q.side || side));
      const u = s.addScaledVector(t, -s.dot(t)).normalize();
      const v = new THREE.Vector3().crossVectors(u, t).normalize();
      return { c: q.p, u: u.toArray(), v: v.toArray(), ru: q.ru, rv: q.rv ?? q.ru, rvb: q.rvb, n: q.n };
    });
    return this.loft(rings, mat, wfn, group, { seg, caps });
  }

  /** Malha crua de pontos [[x,y,z]] + índices; normais suaves, orientadas para fora. */
  _ringMesh(pts, idx, mat, wfn, group) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const cent = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) cent.add(_v.fromBufferAttribute(pos, i));
    cent.divideScalar(pos.count);
    let out = 0;
    for (let i = 0; i < pos.count; i++) out += _v.fromBufferAttribute(pos, i).sub(cent).dot(_n.fromBufferAttribute(nor, i));
    if (out < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    this.addGeometry(g, mat, wfn, group);
    g.dispose();
  }

  /** Bake de AO por voxels + montagem final. */
  build({ aoVoxel = 0.011, aoDist = 0.11, aoStrength = 1.15 } = {}) {
    const n = this.P.length / 3;
    const ao = new Float32Array(n).fill(1);
    const P = this.P, I = this.I, G = this.G;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < n; i++) {
      min.x = Math.min(min.x, P[i * 3]); min.y = Math.min(min.y, P[i * 3 + 1]); min.z = Math.min(min.z, P[i * 3 + 2]);
      max.x = Math.max(max.x, P[i * 3]); max.y = Math.max(max.y, P[i * 3 + 1]); max.z = Math.max(max.z, P[i * 3 + 2]);
    }
    min.subScalar(0.05);
    max.addScalar(0.05);
    const s = aoVoxel;
    const nx = Math.ceil((max.x - min.x) / s), ny = Math.ceil((max.y - min.y) / s), nz = Math.ceil((max.z - min.z) / s);
    const grid = new Uint8Array(nx * ny * nz);
    const mark = (x, y, z, bit) => {
      const ix = Math.floor((x - min.x) / s), iy = Math.floor((y - min.y) / s), iz = Math.floor((z - min.z) / s);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
      grid[(iy * nz + iz) * nx + ix] |= bit;
    };
    // rasteriza a superfície dos triângulos
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
      const bit = 1 << G[i0];
      a.fromArray(P, i0 * 3); b.fromArray(P, i1 * 3); c.fromArray(P, i2 * 3);
      const l = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const k = Math.max(1, Math.ceil(l / (s * 0.7)));
      for (let u = 0; u <= k; u++)
        for (let v = 0; v <= k - u; v++) {
          const fu = u / k, fv = v / k, fw = 1 - fu - fv;
          mark(a.x * fw + b.x * fu + c.x * fv, a.y * fw + b.y * fu + c.y * fv, a.z * fw + b.z * fu + c.z * fv, bit);
        }
    }
    // direções do hemisfério (espiral de Fibonacci)
    const K = 20;
    const dirs = [];
    for (let i = 0; i < K; i++) {
      const y = 1 - (i + 0.5) / K; // cosθ ∈ (0,1]
      const r = Math.sqrt(1 - y * y), phi = i * 2.399963;
      dirs.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
    }
    const nrm = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
    const steps = Math.ceil(aoDist / s);
    for (let i = 0; i < n; i++) {
      const bit = 1 << G[i];
      nrm.fromArray(this.N, i * 3).normalize();
      tA.set(Math.abs(nrm.y) < 0.9 ? 0 : 1, Math.abs(nrm.y) < 0.9 ? 1 : 0, 0).cross(nrm).normalize();
      tB.crossVectors(nrm, tA);
      let occ = 0, wsum = 0;
      for (const dd of dirs) {
        d.copy(tA).multiplyScalar(dd.x).addScaledVector(nrm, dd.y).addScaledVector(tB, dd.z);
        const w = dd.y; // cosseno
        wsum += w;
        for (let st = 2; st <= steps; st++) {
          q.fromArray(P, i * 3).addScaledVector(nrm, s * 0.9).addScaledVector(d, st * s);
          const ix = Math.floor((q.x - min.x) / s), iy = Math.floor((q.y - min.y) / s), iz = Math.floor((q.z - min.z) / s);
          if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) break;
          if (grid[(iy * nz + iz) * nx + ix] & bit) {
            occ += w * (1 - (st / steps) * 0.6);
            break;
          }
        }
      }
      ao[i] = Math.max(0.12, 1 - (occ / wsum) * aoStrength);
    }
    // bandoleira: segmentos sobrepostos no repouso — AO constante
    for (let i = 0; i < n; i++) if (G[i] === GROUPS.sling) ao[i] = 0.88;
    // suaviza AO por vértices coincidentes/vizinhos via índice (1 passe)
    const acc = new Float32Array(n), cnt = new Float32Array(n);
    for (let t = 0; t < I.length; t += 3)
      for (let k = 0; k < 3; k++) {
        const i = I[t + k];
        acc[i] += ao[I[t]] + ao[I[t + 1]] + ao[I[t + 2]];
        cnt[i] += 3;
      }
    for (let i = 0; i < n; i++) ao[i] = cnt[i] ? 0.5 * ao[i] + 0.5 * (acc[i] / cnt[i]) : ao[i];

    // cor: sRGB → linear já feito pelo THREE.Color (ColorManagement)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.S, 4));
    geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}
