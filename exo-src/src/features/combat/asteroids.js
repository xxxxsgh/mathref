/**
 * ASTEROIDES DESTRUTÍVEIS do combate/mineração.
 *
 * Campo local ancorado numa WorldPos (as instâncias ficam em coordenadas
 * relativas à âncora — floats pequenos). 3 formas × 2 LODs em InstancedMesh
 * (≤ 6 chamadas) + entulho fino (1 chamada). Cada rocha tem vida ∝ tamanho;
 * ao ser destruída some (escala 0), gera explosão, fragmentos e minério.
 *
 * Material: PBR com cor por vértice (camadas minerais), relevo procedural
 * por derivadas de tela (bump sem textura) e veios de cristal emissivos.
 */
import * as THREE from 'three';

function mulberry32(a) {
  a >>>= 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ruído de valor 3D simples (CPU) */
function makeNoise3(rand) {
  const P = new Uint8Array(512);
  const G = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    P[i] = i;
    G[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = P[i];
    P[i] = P[j];
    P[j] = t;
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x, y, z) => G[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    let fx = x - xi;
    let fy = y - yi;
    let fz = z - zi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    fz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy),
      fz,
    );
  };
}

/** Geometria de rocha: icosaedro deformado (sulcos, facetas, crateras). */
export function rockGeometry(seed, detail) {
  const rand = mulberry32(seed);
  const n3 = makeNoise3(rand);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const sx = 0.75 + rand() * 0.5;
  const sy = 0.6 + rand() * 0.4;
  const sz = 0.8 + rand() * 0.5;
  const craters = [];
  for (let i = 0; i < 5; i++) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    craters.push({ v, r: 0.25 + rand() * 0.35, d: 0.08 + rand() * 0.1 });
  }
  const v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    // fbm + cristas
    let a = 0.5;
    let f = 1.3;
    for (let o = 0; o < 4; o++) {
      const nv = n3(v.x * f + 11, v.y * f + 7, v.z * f + 3);
      r += (nv - 0.5) * a * (o === 0 ? 0.9 : 0.6);
      f *= 2.1;
      a *= 0.5;
    }
    const ridge = 1 - Math.abs(n3(v.x * 2.4 + 5, v.y * 2.4, v.z * 2.4) * 2 - 1);
    r += ridge * ridge * 0.12;
    for (const c of craters) {
      const d = v.distanceTo(c.v);
      if (d < c.r) {
        const t = d / c.r;
        r -= c.d * (1 - t * t) - (t > 0.7 ? (t - 0.7) * c.d * 1.5 : 0);
      }
    }
    // facetas: quantiza o raio levemente
    r = Math.round(r * 9) / 9 * 0.4 + r * 0.6;
    pos.setXYZ(i, v.x * r * sx, v.y * r * sy, v.z * r * sz);
    // camadas minerais na cor
    const band = n3(v.x * 3 + v.y * 5, v.y * 3, v.z * 3 + 9);
    const k = 0.55 + band * 0.45;
    col[i * 3] = k;
    col[i * 3 + 1] = k * (0.95 + band * 0.05);
    col[i * 3 + 2] = k * 0.92;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals(); // facetado (não indexado)
  // mistura normal facetada com a radial suave (facetas legíveis mas não "low poly")
  const p2 = ng.attributes.position;
  const nn = ng.attributes.normal;
  for (let i = 0; i < nn.count; i++) {
    v.fromBufferAttribute(p2, i).normalize();
    const fx = nn.getX(i) * 0.7 + v.x * 0.3;
    const fy = nn.getY(i) * 0.7 + v.y * 0.3;
    const fz = nn.getZ(i) * 0.7 + v.z * 0.3;
    const l = Math.hypot(fx, fy, fz);
    nn.setXYZ(i, fx / l, fy / l, fz / l);
  }
  ng.computeBoundingSphere();
  return ng;
}

/** Material de rocha com relevo e veios emissivos procedurais. */
export function rockMaterial(vein = new THREE.Color(0.6, 0.25, 1.0)) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, color: 0xffffff });
  const uniforms = { uVein: { value: vein }, uVeinAmt: { value: 1 } };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRock;\nvarying vec3 vRockOff;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRock = position;
        #ifdef USE_INSTANCING
          vRockOff = instanceMatrix[3].xyz * 0.013;
        #else
          vRockOff = vec3(0.0);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRock; varying vec3 vRockOff;
        uniform vec3 uVein; uniform float uVeinAmt;
        float rh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float rn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(rh(i), rh(i+vec3(1,0,0)), f.x), mix(rh(i+vec3(0,1,0)), rh(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(rh(i+vec3(0,0,1)), rh(i+vec3(1,0,1)), f.x), mix(rh(i+vec3(0,1,1)), rh(i+vec3(1,1,1)), f.x), f.y), f.z); }
        float rf(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * rn(p); p *= 2.13; a *= 0.5; } return s; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 rp = vRock * 3.0 + vRockOff;
        float rH = rf(rp * 2.0);
        float rC = rf(rp * 0.7 + 4.0);
        diffuseColor.rgb *= mix(vec3(0.42, 0.4, 0.38), vec3(0.85, 0.8, 0.72), rC) * (0.75 + 0.5 * rH);
        float vein = smoothstep(0.035, 0.0, abs(rn(rp * 1.3 + 9.0) - 0.5)) * uVeinAmt;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bump procedural por derivadas de tela (perturbNormalArb)
          float hb = rf(rp * 6.0) * 0.6 + rH * 0.4;
          vec2 dHdxy = vec2(dFdx(hb), dFdy(hb)) * 1.6;
          vec3 vSigmaX = dFdx(-vViewPosition);
          vec3 vSigmaY = dFdy(-vViewPosition);
          vec3 R1 = cross(vSigmaY, normal);
          vec3 R2 = cross(normal, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          normal = normalize(abs(fDet) * normal - vGrad);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uVein * vein * 2.5;`,
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.6, rC) - vein * 0.6;`);
  };
  m.customProgramCacheKey = () => 'exo-rock';
  return m;
}

export class AsteroidField {
  constructor(ctx, { count = 90, detailNear = 4, detailFar = 2 } = {}) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'combat:asteroids';
    this.shapes = [];
    this.mats = [rockMaterial(new THREE.Color(0.75, 0.3, 1.0)), rockMaterial(new THREE.Color(0.2, 0.9, 1.0)), rockMaterial(new THREE.Color(1.0, 0.5, 0.15))];
    this.count = count;
    for (let s = 0; s < 3; s++) {
      const near = new THREE.InstancedMesh(rockGeometry(101 + s * 17, detailNear), this.mats[s], count);
      const far = new THREE.InstancedMesh(rockGeometry(101 + s * 17, detailFar), this.mats[s], count);
      for (const m of [near, far]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = false;
        m.receiveShadow = false;
        this.group.add(m);
      }
      this.shapes.push({ near, far });
    }
    // entulho fino
    const deb = rockGeometry(77, 1);
    this.debris = new THREE.InstancedMesh(deb, this.mats[0], 500);
    this.debris.frustumCulled = false;
    this.debris.count = 0;
    this.group.add(this.debris);
    this.rocks = [];
    this.anchor = null;
    this.handle = null;
    this.dirty = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  /** Gera o campo em volta de `anchor` (WorldPos). opts: { seed, radius, count, clear: [{pos (local Vector3), r}] , big } */
  generate(anchor, opts = {}) {
    const rand = mulberry32(opts.seed ?? 1);
    this.anchor = anchor.clone();
    this.rocks = [];
    const R = opts.radius ?? 1800;
    const N = Math.min(this.count * 3, opts.count ?? 180);
    for (let i = 0; i < N; i++) {
      const dir = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.55, rand() * 2 - 1);
      const pos = dir.multiplyScalar(R * Math.cbrt(rand()));
      const big = rand() < 0.12;
      const size = big ? 40 + rand() * 90 : 4 + Math.pow(rand(), 2.2) * 36;
      if (opts.clear?.some((c) => c.pos.distanceTo(pos) < c.r + size)) continue;
      this.addRock(pos, size, rand);
    }
    for (const r of opts.extra || []) this.addRock(r.pos, r.size, rand, r.shape);
    // entulho
    this.debrisList = [];
    const nd = Math.min(500, opts.debris ?? 360);
    for (let i = 0; i < nd; i++) {
      const pos = new THREE.Vector3(rand() * 2 - 1, (rand() * 2 - 1) * 0.6, rand() * 2 - 1).multiplyScalar(R * 0.7 * Math.cbrt(rand()));
      this.debrisList.push({ pos, size: 0.4 + rand() * 2.2, rot: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6) });
    }
    this.dirty = true;
  }

  addRock(pos, size, rand, shape) {
    const r = {
      id: this.rocks.length,
      pos: pos.clone(),
      size,
      shape: shape ?? Math.floor(rand() * 3) % 3,
      rot: new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28),
      spin: new THREE.Vector3((rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1),
      hp: size * 2.5,
      maxHp: size * 2.5,
      alive: true,
      tint: 0.75 + rand() * 0.4,
    };
    this.rocks.push(r);
    return r;
  }

  /** Posição de mundo de uma rocha (WorldPos-compatível). */
  worldOf(r, out = new THREE.Vector3()) {
    return out.copy(this.anchor).add(r.pos);
  }

  /** Raio-esfera contra as rochas vivas. origem/dir em MUNDO. → { rock, t } | null */
  raycast(origin, dir, maxT) {
    if (!this.anchor) return null;
    let best = null;
    const o = new THREE.Vector3(origin.x - this.anchor.x, origin.y - this.anchor.y, origin.z - this.anchor.z);
    for (const r of this.rocks) {
      if (!r.alive) continue;
      const rad = r.size * 0.85;
      const oc = o.clone().sub(r.pos);
      const b = oc.dot(dir);
      const c = oc.lengthSq() - rad * rad;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxT) continue;
      if (!best || t < best.t) best = { rock: r, t };
    }
    return best;
  }

  damage(r, n) {
    if (!r.alive) return false;
    r.hp -= n;
    if (r.hp <= 0) {
      r.alive = false;
      this.dirty = true;
      return true;
    }
    return false;
  }

  /** Atualiza instâncias (LOD pela distância à câmera). */
  frame(dt, ctx, camWorld) {
    if (!this.anchor) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    ctx.space.toRender(this.anchor, this.group.position);
    const cam = new THREE.Vector3(camWorld.x - this.anchor.x, camWorld.y - this.anchor.y, camWorld.z - this.anchor.z);
    const counts = this.shapes.map(() => [0, 0]);
    const m = this._m;
    for (const r of this.rocks) {
      if (!r.alive) continue;
      r.rot.x += r.spin.x * dt;
      r.rot.y += r.spin.y * dt;
      r.rot.z += r.spin.z * dt;
      const d = cam.distanceTo(r.pos);
      const lod = d < Math.max(450, r.size * 12) ? 0 : 1;
      const sh = this.shapes[r.shape];
      const mesh = lod === 0 ? sh.near : sh.far;
      const idx = counts[r.shape][lod]++;
      if (idx >= this.count) continue;
      this._q.setFromEuler(r.rot);
      this._s.setScalar(r.size);
      m.compose(r.pos, this._q, this._s);
      mesh.setMatrixAt(idx, m);
    }
    this.shapes.forEach((sh, i) => {
      sh.near.count = Math.min(this.count, counts[i][0]);
      sh.far.count = Math.min(this.count, counts[i][1]);
      sh.near.instanceMatrix.needsUpdate = true;
      sh.far.instanceMatrix.needsUpdate = true;
    });
    if (this.dirty && this.debrisList) {
      let k = 0;
      for (const d of this.debrisList) {
        this._q.setFromEuler(d.rot);
        this._s.setScalar(d.size);
        m.compose(d.pos, this._q, this._s);
        this.debris.setMatrixAt(k++, m);
      }
      this.debris.count = k;
      this.debris.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
  }

  clear() {
    this.rocks = [];
    this.anchor = null;
    for (const sh of this.shapes) sh.near.count = sh.far.count = 0;
    this.debris.count = 0;
  }
}
