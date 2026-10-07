// Asteroides do showcase: icosfera deslocada por fBm + crateras (CPU, uma vez),
// oclusão de cavidade por vértice, material PBR com estratos, regolito claro
// nas faces expostas, veios metálicos e microdetalhe por bump procedural.
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, mix, smoothstep, positionLocal, normalLocal, abs, bumpMap, max, pow, dot, normalize, mx_worley_noise_float } from 'three/tsl';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise3 } from '../tslib.js';
import { Noise, Rng } from '../../../core/Rng.js';

export function asteroidGeometry(seed, detail = 5, cutAmount = 0.88) {
  const N = new Noise(seed), r = new Rng(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.getAttribute('position');
  const ao = new Float32Array(pos.count);
  const rdir = () => new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize();
  const craters = Array.from({ length: r.int(5, 11) }, () => ({ c: rdir(), r: r.range(0.12, 0.42), d: r.range(0.05, 0.14) }));
  const cuts = Array.from({ length: r.int(6, 12) }, () => ({ n: rdir(), d: r.range(0.62, 0.92) }));
  const stretch = new THREE.Vector3(r.range(0.75, 1.3), r.range(0.6, 0.95), r.range(0.8, 1.2));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let h = N.fbm3(v.x * 1.1, v.y * 1.1, v.z * 1.1, 4) * 0.4 + N.fbm3(v.x * 5.5 + 9, v.y * 5.5, v.z * 5.5, 3) * 0.035;
    // relevo "ridged" para quinas afiadas
    h += (0.5 - Math.abs(N.noise3(v.x * 2.4 + 3, v.y * 2.4, v.z * 2.4))) * 0.12;
    for (const c of craters) {
      const d = v.distanceTo(c.c) / c.r;
      if (d < 1.3) h += d < 1 ? -c.d * (1 - d * d) : c.d * 0.35 * (1 - (d - 1) / 0.3);
    }
    v.multiplyScalar(1 + h).multiply(stretch);
    // facetas: planos de fratura cortam o corpo (aspecto anguloso, lascado)
    for (const c of cuts) {
      const k = v.dot(c.n) - c.d;
      if (k > 0) v.addScaledVector(c.n, -k * cutAmount);
    }
    ao[i] = v.length() - 1;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // AO aproximado = altura relativa normalizada
  let lo = Infinity, hi = -Infinity;
  for (const a of ao) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
  for (let i = 0; i < ao.length; i++) ao[i] = (ao[i] - lo) / Math.max(1e-6, hi - lo);
  g.setAttribute('cav', new THREE.BufferAttribute(ao, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function asteroidMaterial(tint = [0.3, 0.27, 0.24], scale = 1) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionLocal;
  const pm = positionLocal.mul(scale); // metros (rocha herói) ou unidades do objeto
  const cav = attribute('cav', 'float');
  const strata = vnoise3(vec3(p.y.mul(9), p.x.mul(0.8), p.z.mul(0.8))).mul(0.5).add(vnoise3(p.mul(3.2)).mul(0.5));
  const fine = vnoise3(p.mul(22)).mul(0.6).add(vnoise3(p.mul(61)).mul(0.4));
  // detalhe em escala de metros: placas fraturadas (Worley) + seixos + grão
  const cn = vnoise3(pm.mul(0.07)).mul(0.7).add(vnoise3(pm.mul(0.21)).mul(0.3));
  const cell = vnoise3(pm.mul(0.045));
  const cracks = float(0); // (fendas desligadas: liam como curvas de nível)
  const mid = vnoise3(pm.mul(0.35)).mul(0.6).add(vnoise3(pm.mul(1.3)).mul(0.4));
  const grit = vnoise3(pm.mul(5.0));
  const base = mix(vec3(0.06, 0.055, 0.052), vec3(...tint), strata.mul(0.55).add(fine.mul(0.2)).add(mid.mul(0.25)));
  const regolith = smoothstep(0.45, 0.85, cav).mul(0.35).mul(mid.mul(0.8).add(0.4));
  // veios metálicos só nas rochas do campo (na rocha herói viravam "curvas de nível")
  const veins = scale > 1 ? float(0) : smoothstep(0.82, 0.9, vnoise3(p.mul(7.3).add(4.1)));
  const col = mix(base, vec3(0.42, 0.39, 0.35), regolith).mul(mix(float(0.35), float(1), smoothstep(0.0, 0.55, cav)));
  const col2 = mix(col, vec3(0.6, 0.48, 0.32), veins.mul(0.8)).mul(float(1).sub(cracks.mul(0.6))).mul(grit.mul(0.25).add(0.85));
  m.colorNode = col2.mul(scale > 1 ? mix(float(0.55), float(1.0), mid) : float(1));
  m.metalnessNode = veins.mul(0.85);
  m.roughnessNode = mix(float(0.93), float(0.35), veins);
  const h = fine.mul(0.012).add(strata.mul(0.02));
  m.normalNode = scale > 1
    ? bumpMap(h.add(mid.mul(0.6 / scale)).add(cell.mul(2.5 / scale)).sub(cracks.mul(0.25 / scale)).add(grit.mul(0.05 / scale)))
    : bumpMap(h);
  return m;
}

/** Campo de asteroides instanciado em volta de um ponto (espaço local do grupo). */
export function asteroidField({ count = 40, radius = 6000, seed = 7, minSize = 20, maxSize = 380, keepOut = null, detail = 5 }) {
  const r = new Rng(seed);
  const group = new THREE.Group();
  group.name = 'rps.showcase.asteroids';
  const geos = [asteroidGeometry(seed + 1, detail), asteroidGeometry(seed + 2, detail), asteroidGeometry(seed + 3, Math.max(3, detail - 1))];
  const mats = [asteroidMaterial(), asteroidMaterial([0.26, 0.25, 0.24]), asteroidMaterial([0.34, 0.27, 0.21])];
  const per = Math.ceil(count / 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let k = 0; k < 3; k++) {
    const im = new THREE.InstancedMesh(geos[k], mats[k], per);
    im.castShadow = true; im.receiveShadow = true;
    for (let i = 0; i < per; i++) {
      for (let tries = 0; tries < 20; tries++) {
        p.set(r.range(-1, 1), r.range(-0.35, 0.35), r.range(-1, 1)).multiplyScalar(radius);
        if (!keepOut || !keepOut(p)) break;
      }
      const size = minSize + (maxSize - minSize) * Math.pow(r.next(), 3);
      q.setFromEuler(new THREE.Euler(r.range(0, 6), r.range(0, 6), r.range(0, 6)));
      s.setScalar(size);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
    }
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}
