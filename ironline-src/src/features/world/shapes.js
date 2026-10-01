/**
 * Primitivas reutilizáveis (geometrias cacheadas) e ajudantes de forma:
 * cilindros, cabos em catenária, vergalhões, decalques em atlas.
 */
import * as THREE from 'three';
import { cached, mat4 } from './geo.js';

export const cyl = (seg = 10, open = false) =>
  cached(`cyl${seg}${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));
export const cone = (rTop, seg = 8) => cached(`cone${rTop}_${seg}`, () => new THREE.CylinderGeometry(rTop, 1, 1, seg, 1));
export const sphere = (w = 10, h = 8) => cached(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h));
export const plane = () => cached('plane', () => new THREE.PlaneGeometry(1, 1));
export const torus = (t, seg = 16) => cached(`tor${t}_${seg}`, () => new THREE.TorusGeometry(1, t, 6, seg));

/** Cilindro entre dois pontos (raio r). */
export function cylBetween(B, a, b, r, mat, opts = {}) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(Bv, A);
  const len = d.length();
  if (len < 1e-4) return;
  const mid = A.clone().add(Bv).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const M = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r, len, r));
  B.add(cyl(opts.seg || 6, opts.open), mat, M, opts);
}

/** Cilindro vertical (base em y). */
export function cylinder(B, x, y, z, r, h, mat, opts = {}) {
  B.add(cyl(opts.seg || 12), mat, mat4([x, y + h / 2, z], opts.rot || [0, 0, 0], [r, h, r]), opts);
}

/**
 * Cabo pendurado entre a e b com flecha `sag` (catenária aproximada por
 * parábola). Tubo fino de baixa resolução.
 */
export function cable(B, a, b, sag, r = 0.012, mat = 'cable', segs = 9) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs, r, 3, false);
  const c = B.cast;
  B.cast = false;
  B.add(g, mat, null, { worldUV: false, color: [1, 1, 1] });
  B.cast = c;
}

/** Vergalhão torto saindo de um ponto (concreto destruído). */
export function rebar(B, p, dir, len, rng, mat = 'metal') {
  const pts = [new THREE.Vector3(...p)];
  const d = new THREE.Vector3(...dir).normalize();
  const seg = 4;
  for (let i = 1; i <= seg; i++) {
    d.x += (rng.next() - 0.5) * 0.5;
    d.y += (rng.next() - 0.5) * 0.5 - 0.15 * i; // vergalhão "cai" com o peso
    d.z += (rng.next() - 0.5) * 0.5;
    d.normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, len / seg));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.012, 3, false);
  B.add(g, mat, null, { color: [0.45, 0.3, 0.22] });
}

/**
 * Decalque: quad no plano de uma face. center [x,y,z], normal ('px'|'nx'|'pz'|'nz'|'py'),
 * size [w,h], rect de UV no atlas [u0,v0,u1,v1], rotação no plano.
 */
const NORMAL_ROT = {
  px: [0, Math.PI / 2, 0],
  nx: [0, -Math.PI / 2, 0],
  pz: [0, 0, 0],
  nz: [0, Math.PI, 0],
  py: [-Math.PI / 2, 0, 0],
  ny: [Math.PI / 2, 0, 0],
};
export function decal(B, mat, center, normal, size, rect = [0, 0, 1, 1], roll = 0, color = [1, 1, 1]) {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
  }
  const r = NORMAL_ROT[normal] || normal;
  let M;
  if (normal === 'py') {
    M = new THREE.Matrix4().compose(
      new THREE.Vector3(...center),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, roll, 'YXZ')).premultiply(new THREE.Quaternion()),
      new THREE.Vector3(size[0], size[1], 1),
    );
    // rotação no plano do chão: gira em torno de Y
    const Ry = new THREE.Matrix4().makeRotationY(roll);
    const T = new THREE.Matrix4().makeTranslation(...center);
    const Rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const S = new THREE.Matrix4().makeScale(size[0], size[1], 1);
    M = T.multiply(Ry).multiply(Rx).multiply(S);
  } else {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ'));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    M = new THREE.Matrix4().compose(new THREE.Vector3(...center), q, new THREE.Vector3(size[0], size[1], 1));
  }
  B.add(g, mat, M, { worldUV: false, color });
}
