/**
 * Serviço `planet` PLACEHOLDER: esfera lisa (heightAt = 0) com cor de bioma
 * "exuberante" por vértice. O sistema planet substitui com
 * ctx.provide('planet', ...).
 *
 * Malha: uma CALOTA polar centrada no ponto sob a câmera, com anéis em
 * progressão geométrica (0,3 m no centro → horizonte geométrico), refeita
 * quando a câmera se afasta da âncora. Vértices em double relativos à
 * âncora (R·(dir − u)), âncora registrada como objeto flutuante. Cobre tudo
 * o que é visível da esfera em qualquer altitude, com erro de corda
 * desprezível perto da câmera — o chão desenhado coincide com o chão físico
 * (heightAt) do solo à órbita.
 */
import * as THREE from 'three';
import { WorldPos } from '../Space.js';
import { tangentFrame } from '../Geo.js';
import { fbm3 } from './noise.js';

const RINGS = 80;
const SEGS = 112;

export const LUSH_PALETTE = {
  grass: [0.07, 0.2, 0.035],
  forest: [0.03, 0.1, 0.02],
  dry: [0.28, 0.24, 0.08],
  rock: [0.2, 0.18, 0.16],
  sand: [0.55, 0.48, 0.32],
  water: [0.02, 0.07, 0.12],
  sky: [0.35, 0.55, 0.95],
};

/** Interseção raio × esfera em double. Devolve t ≥ 0 ou null. */
export function raySphere(o, d, c, R) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - R * R;
  const h = b * b - cc;
  if (h < 0) return null;
  const s = Math.sqrt(h);
  const t0 = -b - s;
  const t1 = -b + s;
  if (t0 >= 0) return t0;
  if (t1 >= 0) return 0; // origem dentro da esfera
  return null;
}

export function installPlaceholderPlanet(ctx) {
  const uni = ctx.services.universe;
  const info = uni?.currentPlanet || {};
  const center = ctx.space.planetCenter;
  let R = info.radius || 120000;
  const palette = LUSH_PALETTE;

  const nv = 1 + RINGS * SEGS;
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = [];
  for (let j = 0; j < SEGS; j++) idx.push(0, 1 + j, 1 + ((j + 1) % SEGS));
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = 1 + i * SEGS + j;
      const b = 1 + i * SEGS + ((j + 1) % SEGS);
      const c = a + SEGS;
      const d = b + SEGS;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'placeholder:planet';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  const anchor = new WorldPos();
  const handle = ctx.space.registerFloating(mesh, anchor);
  const anchorDir = new THREE.Vector3(2, 0, 0); // inválido → força a 1ª construção
  let anchorAlt = -1;
  let builds = 0;

  function colorAt(x, y, z, out, o) {
    // x,y,z = direção unitária; escalas em m sobre a superfície
    const s = R;
    const big = fbm3((x * s) / 40000, (y * s) / 40000, (z * s) / 40000, 4);
    const mid = fbm3((x * s) / 6000 + 11, (y * s) / 6000, (z * s) / 6000, 3);
    const fine = fbm3((x * s) / 400, (y * s) / 400 + 7, (z * s) / 400, 2);
    const g = palette.grass, f = palette.forest, d = palette.dry, r = palette.rock;
    const tf = Math.min(1, Math.max(0, mid * 1.6 + 0.3));
    const td = Math.min(1, Math.max(0, big * 1.8 - 0.1));
    const tr = Math.min(1, Math.max(0, (big + mid * 0.5) * 3 - 1.4));
    for (let k = 0; k < 3; k++) {
      let v = g[k] + (f[k] - g[k]) * tf;
      v += (d[k] - v) * td * 0.7;
      v += (r[k] - v) * tr;
      out[o + k] = v * (1 + fine * 0.18);
    }
  }

  function rebuild(u, alt) {
    builds++;
    const a = Math.max(2, alt);
    const th1 = Math.max(0.3, a * 0.01) / R;
    const thMax = Math.min(Math.PI * 0.995, Math.acos(R / (R + a)) + Math.max(0.03, 4000 / R));
    const q = Math.pow(thMax / th1, 1 / (RINGS - 1));
    const fr = tangentFrame(u);
    const e = fr.east, n = fr.north;
    anchor.set(center.x + u.x * R, center.y + u.y * R, center.z + u.z * R);
    pos[0] = pos[1] = pos[2] = 0;
    nor[0] = u.x; nor[1] = u.y; nor[2] = u.z;
    colorAt(u.x, u.y, u.z, col, 0);
    let th = th1;
    for (let i = 0; i < RINGS; i++) {
      const st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j < SEGS; j++) {
        const ph = (j / SEGS) * Math.PI * 2;
        const cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
        const dx = ct * u.x + cp * e.x + sp * n.x;
        const dy = ct * u.y + cp * e.y + sp * n.y;
        const dz = ct * u.z + cp * e.z + sp * n.z;
        const o = (1 + i * SEGS + j) * 3;
        // R·(dir − u) em double → pequeno perto da âncora
        pos[o] = R * (dx - u.x);
        pos[o + 1] = R * (dy - u.y);
        pos[o + 2] = R * (dz - u.z);
        nor[o] = dx; nor[o + 1] = dy; nor[o + 2] = dz;
        colorAt(dx, dy, dz, col, o);
      }
      th *= q;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeBoundingSphere();
    anchorDir.copy(u);
    anchorAlt = a;
    handle.worldPos.copy(anchor);
  }

  const _u = new THREE.Vector3();
  function frame() {
    R = ctx.services.universe?.currentPlanet?.radius || R;
    const cam = ctx.space.origin;
    _u.set(cam.x - center.x, cam.y - center.y, cam.z - center.z);
    const r = _u.length();
    _u.multiplyScalar(1 / r);
    const alt = Math.max(2, r - R);
    const moved = anchorDir.x > 1 ? Infinity : anchorDir.angleTo(_u) * R;
    if (moved > Math.max(15, alt * 0.4) || alt > anchorAlt * 1.3 || alt < anchorAlt / 1.3) rebuild(_u, alt);
    ctx.space.toRender(anchor, mesh.position);
  }

  const api = {
    placeholder: true,
    get radius() {
      return R;
    },
    center,
    get gravity() {
      return ctx.services.universe?.currentPlanet?.gravity ?? 9.8;
    },
    seaLevel: null,
    palette,
    heightAt() {
      return 0;
    },
    normalAt(dir, out = new THREE.Vector3()) {
      return out.copy(dir).normalize();
    },
    biomeAt() {
      return { id: 'placeholder', name: 'placeholder', palette, temperature: 22, humidity: 0.6, flora: 0, fauna: 0 };
    },
    isOcean() {
      return false;
    },
    surfacePoint(dir, out = new WorldPos()) {
      return out.set(center.x + dir.x * R, center.y + dir.y * R, center.z + dir.z * R);
    },
    raycast(origin, dir, maxDist = Infinity) {
      const t = raySphere(origin, dir, center, R);
      if (t == null || t > maxDist) return null;
      const point = new WorldPos(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
      const normal = new THREE.Vector3(point.x - center.x, point.y - center.y, point.z - center.z).normalize();
      return { distance: t, point, normal };
    },
    edit() {
      return false;
    },
    get stats() {
      return { builds, chunks: 1 };
    },
  };
  return {
    api,
    frame,
    dispose() {
      handle.remove();
      ctx.scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
