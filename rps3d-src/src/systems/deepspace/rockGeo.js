// Geometria procedural de asteroides (CPU, uma vez): icosfera subdividida,
// deformada por elipsoide + fBm + crateras com borda elevada + blocos
// (facetas de fratura). Vértices soldados → normais suaves. Três LODs por
// formato, todos com a MESMA silhueta (mesma função de deslocamento).
import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise, Rng } from '../../core/Rng.js';

const LOD_DETAIL = {
  ultra: [22, 9, 3],
  high: [16, 7, 3],
  medium: [11, 5, 2],
  mobile: [8, 4, 1],
};

/** Função de forma (raio relativo para uma direção). */
function makeShape(seed) {
  const r = new Rng(seed);
  const nz = new Noise(seed);
  const ax = new THREE.Vector3(r.range(0.7, 1.15), r.range(0.55, 0.9), r.range(0.8, 1.3));
  const craters = [];
  const nc = r.int(5, 11);
  for (let i = 0; i < nc; i++) {
    const d = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    craters.push({ d, size: r.range(0.12, 0.42) * (i === 0 ? 1.5 : 1), depth: r.range(0.05, 0.13) });
  }
  // planos de fratura (dão aspecto de bloco quebrado)
  const cuts = [];
  const ncut = r.int(1, 3);
  for (let i = 0; i < ncut; i++) cuts.push({ n: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), k: r.range(0.62, 0.8) });
  const off = new THREE.Vector3(r.range(0, 100), r.range(0, 100), r.range(0, 100));
  return (d) => {
    let h = 1;
    // forma geral (baixa frequência forte)
    h += nz.fbm3(d.x * 1.1 + off.x, d.y * 1.1 + off.y, d.z * 1.1 + off.z, 3) * 0.32;
    // rugosidade
    h += nz.fbm3(d.x * 4.3 + off.y, d.y * 4.3 + off.z, d.z * 4.3 + off.x, 4) * 0.075;
    h += (nz.ridged3(d.x * 7 + off.z, d.y * 7 + off.x, d.z * 7 + off.y, 4) - 0.35) * 0.09;
    // terraços/blocos: quantização suave do relevo médio
    const tq = nz.fbm3(d.x * 2.6 + off.x, d.y * 2.6, d.z * 2.6 + off.z, 2) * 0.12;
    h += (Math.round(tq * 6) / 6 - tq) * 0.35;
    for (const c of craters) {
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(c.d))));
      const x = ang / c.size;
      if (x < 1.6) {
        // perfil de cratera: bacia + borda elevada
        const bowl = x < 1 ? (x * x - 1) * c.depth : 0;
        const rim = Math.exp(-((x - 1) * (x - 1)) / 0.04) * c.depth * 0.35;
        h += bowl + rim;
      }
    }
    // escala elipsoidal
    const e = 1 / Math.sqrt((d.x / ax.x) ** 2 + (d.y / ax.y) ** 2 + (d.z / ax.z) ** 2);
    h *= e;
    // fraturas: achata atrás do plano
    for (const c of cuts) {
      const t = d.dot(c.n) * h;
      if (t > c.k) h -= (t - c.k) * 0.85;
    }
    return h;
  };
}

function buildLOD(shape, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const h = shape(v);
    pos.setXYZ(i, v.x * h, v.y * h, v.z * h);
  }
  g.computeVertexNormals();
  // oclusão de cavidade por vértice: compara o raio com a média num cone em
  // volta (côncavo → escuro, arestas convexas → claras). Substitui a sombra
  // própria em escala grande, que o CSM não cobre no espaço.
  const ao = new Float32Array(pos.count);
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h0 = v.length();
    v.divideScalar(h0);
    t1.set(Math.abs(v.y) < 0.9 ? 0 : 1, Math.abs(v.y) < 0.9 ? 1 : 0, 0).cross(v).normalize();
    t2.crossVectors(v, t1);
    let acc = 0, accW = 0;
    for (const [rad, w] of [[0.07, 1], [0.16, 0.7], [0.3, 0.45]]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rad * 7;
        q.copy(v).addScaledVector(t1, Math.cos(a) * rad).addScaledVector(t2, Math.sin(a) * rad).normalize();
        acc += shape(q) * w; accW += w;
      }
    }
    const diff = (h0 - acc / accW) / 0.06;
    ao[i] = Math.max(0, Math.min(1, 0.62 + diff * 0.5));
  }
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  g.computeBoundingSphere();
  return g;
}

/** Cria `variants` formatos × 3 LODs. Retorna [[lod0, lod1, lod2], ...]. */
export function makeRockGeometries(qualityName, variants = 5, seed = 9137) {
  const det = LOD_DETAIL[qualityName] || LOD_DETAIL.high;
  const out = [];
  for (let k = 0; k < variants; k++) {
    const shape = makeShape(seed + k * 101);
    out.push(det.map((d) => buildLOD(shape, d)));
  }
  return out;
}

/** Peças de destroço: chapas de casco dobradas, vigas e blocos com greebles. */
export function makeDebrisGeometries(seed = 501) {
  const r = new Rng(seed);
  const out = [];
  // chapa de casco curva, rasgada (contorno irregular de baixa frequência), com nervuras
  for (let k = 0; k < 3; k++) {
    const g = new THREE.BoxGeometry(2, 0.1, 1.5, 20, 1, 14);
    const p = g.attributes.position, v = new THREE.Vector3();
    const bend = r.range(0.25, 0.7), tear = new Noise(seed + k * 17);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const th = Math.atan2(v.z / 0.75, v.x);
      const emax = 0.72 + 0.32 * tear.noise3(Math.cos(th) * 1.3, Math.sin(th) * 1.3, k * 3.1) + 0.08 * tear.noise3(Math.cos(th) * 5, Math.sin(th) * 5, k);
      const e = Math.hypot(v.x, v.z / 0.75);
      if (e > emax) { v.x *= emax / e; v.z *= emax / e; }
      v.y += Math.sin(v.x * bend * 1.6) * 0.32 + tear.noise3(v.x * 1.5, v.z * 1.5, k) * 0.05;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    const parts = [g];
    // nervuras estruturais por baixo da chapa
    for (let j = -1; j <= 1; j++) {
      const rib = new THREE.BoxGeometry(0.07, 0.18, 1.0 - Math.abs(j) * 0.25, 1, 1, 6);
      const rp = rib.attributes.position;
      const x = j * 0.42;
      for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); v.x += x; v.y += Math.sin(v.x * bend * 1.6) * 0.32 - 0.12; rp.setXYZ(i, v.x, v.y, v.z); }
      parts.push(rib);
    }
    out.push(mergeGeos(parts));
  }
  // viga estrutural (perfil em I)
  {
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, -0.3); shape.lineTo(0.3, -0.3); shape.lineTo(0.3, -0.24); shape.lineTo(0.06, -0.24); shape.lineTo(0.06, 0.24);
    shape.lineTo(0.3, 0.24); shape.lineTo(0.3, 0.3); shape.lineTo(-0.3, 0.3); shape.lineTo(-0.3, 0.24); shape.lineTo(-0.06, 0.24);
    shape.lineTo(-0.06, -0.24); shape.lineTo(-0.3, -0.24); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, steps: 6 });
    g.translate(0, 0, -1.5);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.x += Math.sin(v.z * 0.9) * 0.15; p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    out.push(g);
  }
  // bloco de módulo (caixa com reentrâncias)
  {
    const parts = [];
    const base = new THREE.BoxGeometry(1.4, 0.9, 1.0);
    parts.push(base);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.BoxGeometry(r.range(0.15, 0.5), r.range(0.1, 0.3), r.range(0.15, 0.5));
      b.translate(r.range(-0.6, 0.6), 0.45 + 0.05, r.range(-0.4, 0.4));
      parts.push(b);
    }
    const cyl = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 12);
    cyl.rotateZ(Math.PI / 2); cyl.translate(0, -0.25, 0.55);
    parts.push(cyl);
    out.push(mergeGeos(parts));
  }
  return out;
}

function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
