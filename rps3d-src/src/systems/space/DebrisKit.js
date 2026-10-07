// Kit de destroços: geometrias procedurais (chapas de casco rasgadas, seções
// de casco abertas com cavernas internas, contêineres corrugados, treliças,
// tanques e bocais de motor) e o material metálico PBR com painéis, rebites,
// tinta da facção desgastada, queimaduras de plasma e brasas emissivas.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Fn, float, vec3, vec4, positionGeometry, normalGeometry, instancedBufferAttribute, fract, abs, max, min, mix, floor, sin, step, clamp, uniform,
} from 'three/tsl';
import { makeRng } from '../../core/Rng.js';
import { fbm, hash13, camU, bumpNormal, sstep } from './tslUtil.js';

export const KINDS = ['plate', 'section', 'container', 'girder', 'tank', 'engine', 'hulkFront', 'hulkRear', 'hull'];

function clean(g) {
  g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}
const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = [1, 1, 1]) => {
  const g = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return clean(g);
};

function plate(r) {
  const g = new THREE.BoxGeometry(6, 0.25, 4, 14, 1, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // borda rasgada: recorta irregularmente o contorno
    const edge = Math.max(Math.abs(x) / 3, Math.abs(z) / 2);
    if (edge > 0.7) {
      const cut = 0.55 + 0.45 * Math.abs(Math.sin(x * 2.3 + z * 3.1) * Math.cos(z * 1.7 - x));
      x *= cut + 0.1;
      z *= cut + 0.1;
    }
    y += Math.sin(x * 0.6) * 0.35 + Math.cos(z * 0.9) * 0.2; // chapa empenada
    p.setXYZ(i, x, y, z);
  }
  const parts = [clean(g)];
  for (let k = -1; k <= 1; k++) parts.push(box(0.25, 0.45, 3.2, k * 1.6, -0.3 + Math.sin(k * 1.6 * 0.6) * 0.35, 0));
  return mergeGeometries(parts);
}

function section(r) {
  const cyl = new THREE.CylinderGeometry(3, 3, 8, 24, 8, true, 0, 4.0);
  const p = cyl.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    if (y > 2) p.setY(i, y - (1 + Math.sin(a * 7) * 0.8 + Math.sin(a * 13) * 0.6) * ((y - 2) / 2) * 1.4); // ponta rasgada
  }
  const parts = [clean(cyl)];
  // cavernas internas (anéis estruturais)
  for (let k = -3; k <= 1; k += 2) {
    const t = new THREE.TorusGeometry(2.85, 0.14, 6, 24, 4.0);
    t.rotateX(Math.PI / 2);
    t.translate(0, k, 0);
    parts.push(clean(t));
  }
  // longarinas
  for (let a = 0.3; a < 4.0; a += 0.9) parts.push(box(0.2, 7.5, 0.3, Math.cos(a) * 2.8, -0.4, Math.sin(a) * 2.8));
  const g = mergeGeometries(parts);
  g.rotateZ(Math.PI / 2);
  return g;
}

function container() {
  const parts = [box(2.6, 2.6, 6.1)];
  for (let z = -2.6; z <= 2.61; z += 0.52) {
    parts.push(box(2.72, 0.12, 0.16, 0, 1.3, z));
    parts.push(box(2.72, 0.12, 0.16, 0, -1.3, z));
    parts.push(box(0.12, 2.5, 0.16, 1.32, 0, z));
    parts.push(box(0.12, 2.5, 0.16, -1.32, 0, z));
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(box(0.3, 0.3, 6.3, sx * 1.3, sy * 1.3, 0));
  return mergeGeometries(parts);
}

function girder() {
  const parts = [];
  const L = 12;
  for (const [x, y] of [[-0.6, -0.6], [0.6, -0.6], [0, 0.5]]) parts.push(box(0.18, 0.18, L, x, y, 0));
  for (let z = -L / 2 + 0.6; z < L / 2; z += 1.2) {
    parts.push(box(1.2, 0.1, 0.1, 0, -0.6, z));
    parts.push(box(0.1, 1.3, 0.1, -0.3, -0.05, z + 0.6, 0.5, 0, -0.5));
    parts.push(box(0.1, 1.3, 0.1, 0.3, -0.05, z + 0.6, 0.5, 0, 0.5));
  }
  const g = mergeGeometries(parts);
  // dobra (viga torcida pela explosão)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 2) p.setY(i, p.getY(i) + (z - 2) * (z - 2) * 0.06);
  }
  g.computeVertexNormals();
  return g;
}

function tank() {
  const parts = [clean(new THREE.CylinderGeometry(1.4, 1.4, 4, 20, 1, true))];
  const top = new THREE.SphereGeometry(1.4, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  top.translate(0, 2, 0);
  const bot = new THREE.SphereGeometry(1.4, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bot.translate(0, -2, 0);
  parts.push(clean(top), clean(bot));
  for (const y of [-1.2, 0, 1.2]) {
    const t = new THREE.TorusGeometry(1.44, 0.09, 6, 24);
    t.rotateX(Math.PI / 2);
    t.translate(0, y, 0);
    parts.push(clean(t));
  }
  parts.push(box(0.4, 0.4, 3.4, 1.5, 0, 0, Math.PI / 2, 0, 0));
  return mergeGeometries(parts);
}

function engine() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(0.9 + Math.pow(t, 1.6) * 1.5, t * 3.4 - 1.7));
  }
  const noz = new THREE.LatheGeometry(pts, 24);
  const parts = [clean(noz)];
  parts.push(clean(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 16).translate(0, -2.9, 0)));
  for (let a = 0; a < 6.28; a += 1.047) parts.push(box(0.15, 2.6, 0.15, Math.cos(a) * 1.15, -2.9, Math.sin(a) * 1.15));
  const g = mergeGeometries(parts);
  g.rotateX(Math.PI / 2);
  return g;
}

/**
 * Casco de nave grande (facetado, em cunha) com superestrutura, sponsons,
 * bloco de motores e "greebles". Comprimento ~40 unidades ao longo de −Z
 * (proa em −Z, como as naves do jogo).
 */
function shipHull(r) {
  const prof = [
    [0.0, -21], [0.9, -19.5], [2.4, -15], [3.8, -9], [4.6, -3], [4.9, 3], [4.6, 10], [4.0, 16], [3.6, 19], [0.0, 19.2],
  ];
  const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 8);
  lathe.rotateX(Math.PI / 2); // eixo Y → Z (proa em −Z)
  lathe.rotateZ(Math.PI / 8);
  lathe.scale(1.0, 0.62, 1.0); // achatado: cunha
  const parts = [clean(lathe)];
  // quilha e espinha dorsal
  parts.push(box(1.2, 1.0, 30, 0, -2.8, 0));
  parts.push(box(1.6, 0.8, 26, 0, 3.0, 2));
  // torre de comando
  parts.push(box(3.2, 2.2, 5.0, 0, 4.2, 9));
  parts.push(box(2.2, 1.6, 3.2, 0, 6.0, 9.6));
  parts.push(box(5.0, 0.35, 1.2, 0, 6.9, 9.0));
  // sponsons laterais
  for (const sx of [-1, 1]) {
    parts.push(box(1.6, 1.4, 14, sx * 5.0, -0.2, 4));
    parts.push(box(0.6, 0.6, 9, sx * 5.9, 0.4, -4));
  }
  // bloco de motores
  for (const [x, y] of [[-2.4, 0.4], [2.4, 0.4], [0, -1.2], [-3.8, -1.0], [3.8, -1.0]]) {
    const c = new THREE.CylinderGeometry(1.1, 1.3, 3.2, 12);
    c.rotateX(Math.PI / 2);
    c.translate(x, y, 20.2);
    parts.push(clean(c));
  }
  // greebles (caixinhas no casco)
  for (let i = 0; i < 70; i++) {
    const z = r.range(-14, 16);
    const a = r.range(-2.4, 2.4);
    const rr = 4.2 * (1 - Math.abs(z) / 26);
    const x = Math.sin(a) * rr, y = Math.cos(a) * rr * 0.62;
    parts.push(box(r.range(0.3, 1.4), r.range(0.2, 0.6), r.range(0.4, 2.5), x, y, z, 0, 0, -a * 0.6));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Mantém só os triângulos cujo centróide passa no teste (casco partido). */
function cutGeometry(g, keep) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const out = [];
  const outN = [];
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (!keep(cx, cy, cz)) continue;
    for (let k = 0; k < 3; k++) {
      out.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
      outN.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
    }
  }
  const h = new THREE.BufferGeometry();
  h.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  h.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  return h;
}

let _geos = null;
/** Geometrias do kit (criadas uma vez). */
export function debrisGeometries() {
  if (_geos) return _geos;
  const r = makeRng(4242);
  _geos = {
    plate: plate(r),
    section: section(r),
    container: container(),
    girder: girder(),
    tank: tank(),
    engine: engine(),
  };
  const hull = shipHull(makeRng(77));
  // linha de fratura irregular
  const cut = (x, y, z) => z - 1.5 * Math.sin(x * 1.3) - 1.2 * Math.cos(y * 2.1) - 0.8 * Math.sin(x * 3.7 + y * 2.9);
  _geos.hull = hull;
  _geos.hulkFront = cutGeometry(hull, (x, y, z) => cut(x, y, z) < -1.5);
  _geos.hulkRear = cutGeometry(hull, (x, y, z) => cut(x, y, z) > 1.0);
  for (const k in _geos) {
    if (k !== 'hull' && k !== 'hulkFront' && k !== 'hulkRear') _geos[k].computeVertexNormals();
    _geos[k].computeBoundingSphere();
  }
  return _geos;
}

/**
 * Material metálico de destroços. Atributos por instância:
 *   aPaint (vec4) = cor da tinta rgb, desgaste 0..1
 *   aFx    (vec4) = semente, queimado 0..1, brasas 0..1, escala (m/unidade)
 */
export function debrisMaterial(paintAttr, fxAttr) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, metalness: 0.75, roughness: 0.5 });
  const aPaint = instancedBufferAttribute(paintAttr);
  const aFx = instancedBufferAttribute(fxAttr);
  const P = positionGeometry;
  const N = normalGeometry;
  // painéis: grade em 3 eixos, ponderada pela normal (triplanar barato)
  const panel = Fn(() => {
    const q = P.mul(0.55);
    const lx = sstep(0.93, 0.975, abs(fract(q.y).sub(0.5)).mul(2.0)).max(sstep(0.93, 0.975, abs(fract(q.z).sub(0.5)).mul(2.0)));
    const ly = sstep(0.93, 0.975, abs(fract(q.x).sub(0.5)).mul(2.0)).max(sstep(0.93, 0.975, abs(fract(q.z.mul(0.5)).sub(0.5)).mul(2.0)));
    const lz = sstep(0.93, 0.975, abs(fract(q.x).sub(0.5)).mul(2.0)).max(sstep(0.93, 0.975, abs(fract(q.y.mul(0.5)).sub(0.5)).mul(2.0)));
    const an = abs(N);
    return lx.mul(an.x).add(ly.mul(an.y)).add(lz.mul(an.z));
  })();
  const cellId = hash13(floor(P.mul(0.55)).add(aFx.x));
  const scorch = Fn(() => {
    const n = fbm(P.mul(0.18).add(aFx.x));
    return sstep(0.45, 0.65, n.add(aFx.y.mul(0.2))).mul(aFx.y.mul(1.4)).clamp(0.0, 1.0);
  })();
  const wear = Fn(() => sstep(0.55, 0.75, fbm(P.mul(0.7).add(aFx.x.add(3.0))).add(aPaint.w.mul(0.3))))();
  m.colorNode = Fn(() => {
    const metal = vec3(0.55, 0.56, 0.58).mul(cellId.mul(0.25).add(0.8));
    let c = mix(aPaint.xyz.mul(cellId.mul(0.2).add(0.85)), metal, wear);
    c = c.mul(float(1.0).sub(panel.mul(0.32)));
    c = mix(c, vec3(0.03, 0.025, 0.02), scorch.mul(0.92));
    return c;
  })();
  m.metalnessNode = mix(float(0.25), float(0.95), wear).mul(float(1).sub(scorch.mul(0.6)));
  m.roughnessNode = mix(float(0.55), float(0.3), wear).add(scorch.mul(0.4)).add(panel.mul(0.2)).clamp(0.05, 1.0);
  m.emissiveNode = Fn(() => {
    // brasas: fendas incandescentes nas partes mais queimadas, tremulando
    const f = fbm(P.mul(1.6).add(vec3(camU.time.mul(0.15), aFx.x, 0.0)));
    const ember = sstep(0.62, 0.78, f).mul(scorch).mul(aFx.z);
    const flick = sin(camU.time.mul(9.0).add(aFx.x.mul(40.0))).mul(0.25).add(0.75);
    return vec3(1.0, 0.36, 0.08).mul(ember).mul(flick).mul(6.0);
  })();
  m.normalNode = bumpNormal(panel.mul(-0.6).add(fbm(P.mul(1.2)).mul(0.15)), aFx.w.mul(0.1));
  return m;
}

/** Cores de facção (linear) para tinta de destroços. */
export const PAINTS = {
  hegemony: [[0.86, 0.84, 0.78], [0.72, 0.55, 0.18]],
  free: [[0.55, 0.16, 0.08], [0.62, 0.42, 0.14], [0.28, 0.3, 0.26]],
  corsairs: [[0.08, 0.08, 0.1], [0.45, 0.04, 0.05]],
  guild: [[0.06, 0.18, 0.42], [0.78, 0.8, 0.84]],
  civil: [[0.5, 0.48, 0.42], [0.62, 0.38, 0.12], [0.2, 0.35, 0.3], [0.55, 0.12, 0.1]],
};
