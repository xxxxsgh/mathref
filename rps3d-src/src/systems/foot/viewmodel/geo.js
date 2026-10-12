// Construtor de modelos procedurais por partes: caixas chanfradas, cilindros,
// perfis extrudados (com furos e chanfro), tornos (lathe), toros. As partes de
// mesmo material são fundidas numa malha só (poucos draw calls por arma).
//
// Convenção: −Z = frente (cano), +Y = cima, +X = direita. Metros.
// Perfis 2D de extrusão: x = distância para a FRENTE, y = altura; a
// espessura vai no eixo X do modelo, centrada.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);

function norm(g) {
  let geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.morphAttributes = {};
  return geo;
}

export class Parts {
  constructor() { this.byMat = new Map(); this.sockets = {}; this.groups = new Map(); }

  /** Adiciona uma geometria já posicionada. rot: [rx,ry,rz] (rad) ou Quaternion. group: nome de subgrupo móvel. */
  add(mat, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = null, group = null) {
    if (rot.isQuaternion) _q.copy(rot); else _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    if (scale) _s.set(...scale); else _s.set(1, 1, 1);
    _m.compose(new THREE.Vector3(...pos), _q, _s);
    const g = norm(geo).applyMatrix4(_m);
    const key = group || '';
    if (!this.groups.has(key)) this.groups.set(key, new Map());
    const bm = this.groups.get(key);
    if (!bm.has(mat)) bm.set(mat, []);
    bm.get(mat).push(g);
    return this;
  }

  box(mat, w, h, d, pos, rot, { r = 0, seg = 2, group } = {}) {
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
    return this.add(mat, geo, pos, rot, null, group);
  }
  /** Cilindro ao longo de Z (frente). */
  cylZ(mat, r0, r1, len, pos, { seg = 20, open = false, rot = [0, 0, 0], group } = {}) {
    const geo = new THREE.CylinderGeometry(r0, r1, len, seg, 1, open);
    geo.rotateX(Math.PI / 2);
    return this.add(mat, geo, pos, rot, null, group);
  }
  cylY(mat, r0, r1, len, pos, { seg = 20, rot = [0, 0, 0], group } = {}) {
    return this.add(mat, new THREE.CylinderGeometry(r0, r1, len, seg), pos, rot, null, group);
  }
  cylX(mat, r0, r1, len, pos, { seg = 20, group } = {}) {
    const geo = new THREE.CylinderGeometry(r0, r1, len, seg); geo.rotateZ(Math.PI / 2);
    return this.add(mat, geo, pos, [0, 0, 0], null, group);
  }
  sphere(mat, r, pos, { seg = 16, scale = null, group } = {}) {
    return this.add(mat, new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)), pos, [0, 0, 0], scale, group);
  }
  /** Toro no plano XY (anel ao redor do eixo Z). */
  ringZ(mat, R, r, pos, { seg = 24, tube = 8, arc = Math.PI * 2, rot = [0, 0, 0], group } = {}) {
    return this.add(mat, new THREE.TorusGeometry(R, r, tube, seg, arc), pos, rot, null, group);
  }
  /** Torno ao longo de Z: perfil [[raio, z], ...] (z positivo = frente). */
  latheZ(mat, prof, pos, { seg = 24, group, rot = [0, 0, 0] } = {}) {
    const pts = prof.map(([r, z]) => new THREE.Vector2(Math.max(1e-4, r), z));
    const geo = new THREE.LatheGeometry(pts, seg);
    geo.rotateX(-Math.PI / 2); // y → −z (frente)
    return this.add(mat, geo, pos, rot, null, group);
  }
  /**
   * Perfil lateral extrudado: pts [[x(frente), y], ...]; holes [[[x,y],...]];
   * width = espessura (X); bevel = chanfro (m).
   */
  profile(mat, pts, width, pos = [0, 0, 0], { holes = [], bevel = 0.003, bevelSeg = 2, rot = [0, 0, 0], group, curveSeg = 6 } = {}) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const depth = Math.max(1e-4, width - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: bevelSeg, curveSegments: curveSeg, steps: 1 });
    geo.translate(0, 0, -depth / 2);
    geo.rotateY(Math.PI / 2); // x(perfil) → −Z (frente); extrusão → X
    return this.add(mat, geo, pos, rot, null, group);
  }
  /** Perfil de seção (frente): pts [[x, y]] extrudado ao longo de Z (comprimento len). */
  section(mat, pts, len, pos = [0, 0, 0], { bevel = 0.002, rot = [0, 0, 0], group, holes = [] } = {}) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const depth = Math.max(1e-4, len - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -depth / 2);
    return this.add(mat, geo, pos, rot, null, group);
  }
  /** Fileira de dentes (trilho picatinny, aletas). */
  teeth(mat, n, w, h, d, start, step, axis = 'z', { group, r = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const p = start.slice();
      p[axis === 'z' ? 2 : axis === 'x' ? 0 : 1] += step * i;
      this.box(mat, w, h, d, p, [0, 0, 0], { group, r });
    }
    return this;
  }
  /** Soquete nomeado (empunhaduras, cano, ejeção) — Object3D criado no build. */
  socket(name, pos, rot = [0, 0, 0], group = null) { this.sockets[name] = { pos, rot, group }; return this; }

  /** Monta: Group raiz com subgrupos móveis (por nome) e soquetes. */
  build(name = 'modelo', { shadows = false } = {}) {
    const root = new THREE.Group(); root.name = name;
    const sub = { '': root };
    for (const [gname, bm] of this.groups) {
      let parent = root;
      if (gname) { parent = new THREE.Group(); parent.name = gname; root.add(parent); sub[gname] = parent; }
      for (const [mat, geos] of bm) {
        const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = shadows; mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        parent.add(mesh);
      }
    }
    const sockets = {};
    for (const [k, s] of Object.entries(this.sockets)) {
      const o = new THREE.Object3D(); o.name = 'soquete:' + k;
      o.position.set(...s.pos); o.rotation.set(...s.rot);
      (s.group ? sub[s.group] || root : root).add(o);
      sockets[k] = o;
    }
    root.userData.sockets = sockets;
    root.userData.parts = sub;
    return root;
  }
}

/** Retângulo arredondado como perfil (pts) — cantos com raio r. */
export function roundRect(x0, y0, x1, y1, r, seg = 3) {
  const pts = [];
  const c = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  for (const [cx, cy, a0] of c) for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
