// Kit de modelagem dos inimigos e adereços: primitivas com cor/PBR POR
// VÉRTICE fundidas por segmento (um draw call por osso), e o material único
// que lê esses atributos (+ detalhe procedural, desgaste, brilho controlado
// por uniform do indivíduo: visor apagando ao morrer, flash de acerto).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  attribute, uniform, vec3, float, positionLocal, mix, smoothstep, clamp, length, fwidth, normalView, max,
} from 'three/tsl';
import { vnoise, fbm, bumpNormal } from '../tsl.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const C = new THREE.Color();

/** Paleta: nome → [cor, metal, rugosidade, emissivo, desgaste] */
export function pal(hex, metal = 0, rough = 0.5, emis = 0, wear = 0.3) { return { hex, metal, rough, emis, wear }; }

export class Kit {
  constructor() { this.segs = new Map(); }
  _push(seg, geo, p, pos, rot, scale) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (rot?.isQuaternion) _q.copy(rot); else _q.setFromEuler(_e.set(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0, 'YXZ'));
    _s.set(...(scale || [1, 1, 1]));
    _m.compose(new THREE.Vector3(...(pos || [0, 0, 0])), _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), pbr = new Float32Array(n * 4);
    C.set(p.hex);
    for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; pbr[i * 4] = p.metal; pbr[i * 4 + 1] = p.rough; pbr[i * 4 + 2] = p.emis; pbr[i * 4 + 3] = p.wear; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 4));
    if (!this.segs.has(seg)) this.segs.set(seg, []);
    this.segs.get(seg).push(g);
    return this;
  }
  box(seg, p, w, h, d, pos, rot, r = 0) {
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
    return this._push(seg, geo, p, pos, rot);
  }
  cyl(seg, p, r0, r1, len, pos, rot, segs = 12) { return this._push(seg, new THREE.CylinderGeometry(r0, r1, len, segs), p, pos, rot); }
  sphere(seg, p, r, pos, scale, segs = 12) { return this._push(seg, new THREE.SphereGeometry(r, segs, Math.max(6, segs * 0.6 | 0)), p, pos, null, scale); }
  capsule(seg, p, r, len, pos, rot, segs = 10) { return this._push(seg, new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, segs), p, pos, rot); }
  torus(seg, p, R, r, pos, rot, segs = 16) { return this._push(seg, new THREE.TorusGeometry(R, r, 6, segs), p, pos, rot); }
  geo(seg, p, geo, pos, rot, scale) { return this._push(seg, geo, p, pos, rot, scale); }
  /** Perfil extrudado (x = frente, y = cima) com espessura em X. */
  profile(seg, p, pts, width, pos, rot, bevel = 0.004) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const depth = Math.max(1e-4, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2);
    return this._push(seg, g, p, pos, rot);
  }

  /** Monta { root, bones: {seg: Group} } — os segmentos ficam soltos (o rig os posiciona). */
  build(mat, { shadows = true } = {}) {
    const bones = {};
    for (const [seg, geos] of this.segs) {
      const g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      const grp = new THREE.Group(); grp.name = seg; grp.add(mesh);
      bones[seg] = grp;
    }
    return bones;
  }
}

/** Material dos inimigos/adereços (atributos por vértice). */
export function kitMaterial({ lite = false, scale = 9 } = {}) {
  const m = new THREE.MeshStandardNodeMaterial();
  const U = { glow: uniform(1), flash: uniform(0), flashCol: uniform(new THREE.Color(1, 0.9, 0.7)), dissolve: uniform(0) };
  const col = attribute('color', 'vec3');
  const pbr = attribute('aPbr', 'vec4');
  const P = positionLocal.mul(scale);
  const n1 = fbm(P.mul(0.7));
  const n2 = vnoise(P.mul(9.0));
  const curv = clamp(length(fwidth(normalView)).mul(2.5), 0, 1);
  const chip = smoothstep(0.66, 0.74, curv.mul(0.6).add(n1.mul(0.5)).add(n2.mul(0.25)).mul(pbr.w.mul(0.9).add(0.25)));
  const dirt = smoothstep(0.45, 0.95, n1).mul(pbr.w).mul(0.35);
  const isGlow = smoothstep(0.5, 1.0, pbr.z);
  const base = col.mul(float(1).add(n1.sub(0.5).mul(0.12))).mul(float(1).sub(dirt));
  m.colorNode = mix(mix(base, vec3(0.55, 0.55, 0.56), chip.mul(float(1).sub(isGlow))), col.mul(0.1), isGlow);
  m.metalnessNode = mix(pbr.x, float(0.9), chip);
  m.roughnessNode = clamp(pbr.y.add(n2.sub(0.5).mul(0.14)).add(dirt.mul(0.3)), 0.06, 1);
  m.emissiveNode = col.mul(pbr.z.mul(U.glow).mul(5.0)).add(U.flashCol.mul(U.flash));
  if (!lite) m.normalNode = bumpNormal(n2.mul(0.0015).sub(chip.mul(0.002)), 1);
  m.userData.U = U;
  void max;
  return m;
}
