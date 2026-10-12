/**
 * ASTEROIDES — cinturões e halos de detritos instanciados, com LOD.
 *
 * Geometria: 4 formas procedurais (icosaedro subdividido deslocado por
 * ruído 3D + crateras, achatamento aleatório), cada uma em 3 níveis de
 * detalhe com a MESMA função de forma (≈4,5k / 720 / 180 triângulos).
 * Cor por vértice (cavidades escuras, veios minerais) × tinta da instância;
 * relevo fino no fragmento (ruído no espaço local por derivadas de tela).
 *
 * Streaming: células de CELL m num raio de NEAR_R m em volta da câmera.
 * Cada célula gera n ~ Poisson(densidade·K) rochas deterministicamente
 * (hash da célula + seed do campo). Reconstruído só quando a câmera muda
 * de célula; instâncias relativas a uma âncora flutuante (precisão).
 * Nível de detalhe por tamanho angular. Longe: poeira em pontos (THREE.Points)
 * ao longo do anel do cinturão e dos halos — a faixa vista de fora.
 *
 * Orçamento (pior caso, campo denso): 12 draw calls de rochas + 1 por
 * faixa de poeira; ≤ ~0,6M triângulos.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldPos } from '../../core/Space.js';
import { spaceMaterial } from './shading.js';

export const CELL = 1000;
export const NEAR_R = 5200;
const NEAR_SMALL = 1800;
const BIG_PER_KM3 = 5;
const SMALL_PER_KM3 = 45;
const LODS = [
  { detail: 14, max: 120 },
  { detail: 4, max: 700 },
  { detail: 1, max: 2600 },
];
const VARIANTS = 4;

// ─── ruído JS (valor 3D suave) ──────────────────────────────────────────
function h3(x, y, z, s) {
  let h = (s ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi, s), h3(xi + 1, yi, zi, s), u), l(h3(xi, yi + 1, zi, s), h3(xi + 1, yi + 1, zi, s), u), v),
    l(l(h3(xi, yi, zi + 1, s), h3(xi + 1, yi, zi + 1, s), u), l(h3(xi, yi + 1, zi + 1, s), h3(xi + 1, yi + 1, zi + 1, s), u), v),
    w,
  ) * 2 - 1;
}
export function fbm3(x, y, z, s, oct = 4) {
  let a = 0.5, f = 1, t = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    t += a * vnoise(x * f, y * f, z * f, s + i * 101);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return t / n;
}
function mulberry(a) {
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forma da rocha `v` (função da direção unitária) → raio. */
function shapeFn(v) {
  const s = 9000 + v * 7919;
  const r = mulberry(s);
  const craters = [];
  for (let i = 0; i < 7; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    craters.push([q * Math.cos(a), z, q * Math.sin(a), 0.18 + r() * 0.35, 0.08 + r() * 0.1]);
  }
  const k1 = 0.9 + r() * 0.8;
  return (x, y, z) => {
    let h = 1 + 0.32 * fbm3(x * k1, y * k1, z * k1, s, 3) + 0.1 * fbm3(x * 4.1, y * 4.1, z * 4.1, s + 7, 3);
    // facetas: degraus suaves
    h += 0.05 * Math.abs(vnoise(x * 7, y * 7, z * 7, s + 3));
    for (const c of craters) {
      const d = Math.acos(Math.max(-1, Math.min(1, x * c[0] + y * c[1] + z * c[2])));
      const t = d / c[3];
      if (t < 1.35) h += t < 1 ? -c[4] * (1 - t * t) : c[4] * 0.4 * Math.sin(((t - 1) / 0.35) * Math.PI);
    }
    return h;
  };
}

/** Geometria da forma `v` no nível `detail`. */
function rockGeometry(v, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const r = mulberry(31 + v * 17);
  const sx = 0.75 + r() * 0.5, sy = 0.55 + r() * 0.35, sz = 0.8 + r() * 0.4;
  const f = shapeFn(v);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z);
    x /= l; y /= l; z /= l;
    const h = f(x, y, z);
    pos.setXYZ(i, x * h * sx, y * h * sy, z * h * sz);
    // cor: cavidade escura, veios claros
    const cav = Math.max(0, Math.min(1, (h - 0.82) / 0.4));
    const vein = Math.max(0, fbm3(x * 6, y * 6, z * 6, 77 + v, 2));
    const k = 0.55 + 0.45 * cav;
    col[i * 3] = k * (0.95 + 0.25 * vein);
    col[i * 3 + 1] = k * (0.95 + 0.2 * vein);
    col[i * 3 + 2] = k * (0.95 + 0.1 * vein);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Material das rochas: iluminação própria do universo + relevo procedural fino. */
function rockMaterial() {
  return spaceMaterial({ rock: true, vertexColors: true, rough: 0.78, metal: 0.02, bump: 0.022 });
}

/** Poeira distante (pontos) — vértice calcula tamanho em pixels. */
const DUST_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute float aShade;
uniform float uPx;      // pixels por radiano
uniform float uFade;
varying float vA;
varying float vShade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float px = aSize / d * uPx;
  gl_PointSize = clamp(px, 1.0, 3.0);
  vA = clamp(px, 0.02, 1.0) * uFade * smoothstep(2000.0, 30000.0, d);
  vShade = aShade;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const DUST_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
varying float vA;
varying float vShade;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c)) * vA;
  gl_FragColor = vec4(uColor * vShade * a, 0.0);
}`;

export class AsteroidField {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'universe:asteroids';
    ctx.scene.add(this.root);
    this.anchor = new WorldPos();
    this.anchorHandle = ctx.space.registerFloating(this.root, this.anchor);
    this.material = rockMaterial();
    this.meshes = []; // [lod][variant]
    for (let l = 0; l < LODS.length; l++) {
      const row = [];
      for (let v = 0; v < VARIANTS; v++) {
        const geo = rockGeometry(v, LODS[l].detail);
        const im = new THREE.InstancedMesh(geo, this.material, LODS[l].max);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LODS[l].max * 3), 3);
        im.count = 0;
        im.frustumCulled = false;
        im.name = `asteroids:l${l}v${v}`;
        this.root.add(im);
        row.push(im);
      }
      this.meshes.push(row);
    }
    this.fields = [];
    this.dust = [];
    this.lastKey = '';
    this.count = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /** Campos do sistema: halos dos planetas e cinturões. */
  setSystem(sys) {
    this.fields = [];
    for (const p of sys.planets) {
      if (!p.field) continue;
      this.fields.push({ kind: 'halo', center: p.position, inner: p.field.inner, outer: p.field.outer, density: p.field.density, seed: p.field.seed, tint: p.field.tint, radius: p.radius });
    }
    for (const b of sys.belts) {
      this.fields.push({ kind: 'belt', center: b.center, normal: new THREE.Vector3().fromArray(b.normal), inner: b.inner, outer: b.outer, thickness: b.thickness, density: b.density, seed: b.seed, tint: b.tint });
    }
    this.buildDust();
    this.lastKey = '';
  }

  /** Densidade (rochas por célula, aprox.) e campo dominante no ponto. */
  densityAt(x, y, z) {
    let best = 0;
    let field = null;
    for (const f of this.fields) {
      const dx = x - f.center.x, dy = y - f.center.y, dz = z - f.center.z;
      let d = 0;
      if (f.kind === 'halo') {
        const r = Math.hypot(dx, dy, dz);
        if (r < f.inner * 0.95 || r > f.outer * 1.05) continue;
        const t = (r - f.inner) / (f.outer - f.inner);
        d = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6;
        // aglomerados e "rios" de detritos
        const k = 1 / 60000;
        const cl = fbm3(dx * k, dy * k, dz * k, f.seed, 3);
        d *= Math.min(1.6, Math.max(0.08, 0.6 + cl * 1.5)) * f.density;
        // "rios" de detritos em escala de quilômetros
        d *= Math.max(0.15, 0.6 + 1.1 * fbm3(dx / 7000, dy / 7000, dz / 7000, f.seed + 5, 2));
        // mais denso perto do plano equatorial do planeta
        d *= 0.45 + 0.55 * Math.exp(-((dy / r) ** 2) / 0.18);
      } else {
        const n = f.normal;
        const h = dx * n.x + dy * n.y + dz * n.z;
        const px = dx - n.x * h, py = dy - n.y * h, pz = dz - n.z * h;
        const r = Math.hypot(px, py, pz);
        if (r < f.inner || r > f.outer || Math.abs(h) > f.thickness * 2.5) continue;
        const t = (r - f.inner) / (f.outer - f.inner);
        d = Math.sin(Math.PI * t) * Math.exp(-((h / f.thickness) ** 2));
        const k = 1 / 90000;
        const cl = fbm3(px * k, py * k, pz * k, f.seed, 3);
        d *= Math.min(1.6, Math.max(0.08, 0.6 + cl * 1.4)) * f.density;
        d *= Math.max(0.15, 0.6 + 1.1 * fbm3(px / 7000, py / 7000, pz / 7000, f.seed + 5, 2));
      }
      if (d > best) {
        best = d;
        field = f;
      }
    }
    return { d: best, field };
  }

  /** Faixas de poeira (pontos) dos campos. */
  buildDust() {
    for (const d of this.dust) {
      d.handle.remove();
      this.ctx.scene.remove(d.points);
      d.points.geometry.dispose();
      d.points.material.dispose();
    }
    this.dust = [];
    for (const f of this.fields) {
      const N = f.kind === 'belt' ? 60000 : 16000;
      const pos = new Float32Array(N * 3);
      const size = new Float32Array(N);
      const shade = new Float32Array(N);
      const r = mulberry(f.seed ^ 0xabc);
      let e1, e2, n;
      if (f.kind === 'belt') {
        n = f.normal;
        e1 = new THREE.Vector3(1, 0, 0).cross(n);
        if (e1.lengthSq() < 1e-6) e1.set(0, 0, 1).cross(n);
        e1.normalize();
        e2 = new THREE.Vector3().crossVectors(n, e1);
      }
      for (let i = 0; i < N; i++) {
        let x, y, z;
        if (f.kind === 'belt') {
          const a = r() * Math.PI * 2;
          // aglomerados ao longo do anel
          const rr = f.inner + (f.outer - f.inner) * (0.5 + 0.5 * Math.sin((r() - 0.5) * Math.PI));
          const hh = (r() + r() + r() - 1.5) * f.thickness * 1.1;
          x = (e1.x * Math.cos(a) + e2.x * Math.sin(a)) * rr + n.x * hh;
          y = (e1.y * Math.cos(a) + e2.y * Math.sin(a)) * rr + n.y * hh;
          z = (e1.z * Math.cos(a) + e2.z * Math.sin(a)) * rr + n.z * hh;
        } else {
          const zz = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - zz * zz);
          const rr = f.inner + (f.outer - f.inner) * (0.5 + 0.5 * Math.sin((r() - 0.5) * Math.PI));
          x = q * Math.cos(a) * rr;
          y = zz * 0.35 * rr;
          z = q * Math.sin(a) * rr;
        }
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        size[i] = 300 + 2500 * r() ** 3;
        shade[i] = 0.5 + r();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: { uColor: { value: new THREE.Vector3(...f.tint).multiplyScalar(2.2) }, uPx: { value: 800 }, uFade: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.name = `asteroids:dust:${f.kind}`;
      points.renderOrder = 1;
      this.ctx.scene.add(points);
      const handle = this.ctx.space.registerFloating(points, f.center.clone());
      this.dust.push({ points, handle, field: f });
    }
  }

  syncPositions() {
    for (const d of this.dust) d.handle.worldPos.copy(d.field.center);
    this.lastKey = '';
  }

  /** Reconstrói as instâncias em volta da câmera (quando muda de célula). */
  rebuild(cam) {
    const cx = Math.floor(cam.x / CELL), cy = Math.floor(cam.y / CELL), cz = Math.floor(cam.z / CELL);
    const key = `${cx},${cy},${cz}`;
    if (key === this.lastKey) return false;
    this.lastKey = key;
    this.anchor.set((cx + 0.5) * CELL, (cy + 0.5) * CELL, (cz + 0.5) * CELL);
    const counts = this.meshes.map((row) => row.map(() => 0));
    const n = Math.ceil(NEAR_R / CELL);
    const m = this._m, q = this._q, s = this._s, p = this._p, col = this._c;
    let total = 0;
    const cell3 = (CELL / 1000) ** 3; // km³ por célula
    const place = (r, field, px, py, pz, size, dist, bright) => {
      const ang = size / Math.max(dist, 1);
      const lod = ang > 0.035 ? 0 : ang > 0.007 ? 1 : 2;
      const v = Math.floor(r() * VARIANTS);
      let l = lod;
      while (l < LODS.length && counts[l][v] >= LODS[l].max) l++;
      if (l >= LODS.length) return;
      const idx = counts[l][v]++;
      const u0 = r() * 2 - 1, u1 = r() * Math.PI * 2, u2 = r() * Math.PI * 2;
      const qq = Math.sqrt(1 - u0 * u0);
      p.set(qq * Math.cos(u1), u0, qq * Math.sin(u1));
      q.setFromAxisAngle(p, u2);
      s.setScalar(size);
      p.set(px - this.anchor.x, py - this.anchor.y, pz - this.anchor.z);
      m.compose(p, q, s);
      const im = this.meshes[l][v];
      im.setMatrixAt(idx, m);
      // tinta: base do campo, variação; às vezes gelo/mineral azulado ou ferrugem
      const t = field.tint;
      const kk = (0.6 + 0.6 * r()) * bright;
      const pick = r();
      if (pick < 0.16) col.setRGB(0.16 * kk, 0.3 * kk, 0.34 * kk); // gelo/mineral azulado
      else if (pick < 0.26) col.setRGB(0.36 * kk, 0.19 * kk, 0.11 * kk); // ferrugem
      else if (pick < 0.4) col.setRGB(0.11 * kk, 0.11 * kk, 0.12 * kk); // basalto
      else col.setRGB(t[0] * kk * 0.7, t[1] * kk * 0.7, t[2] * kk * 0.7);
      im.setColorAt(idx, col);
      total++;
    };
    for (let dx = -n; dx <= n; dx++) {
      for (let dy = -n; dy <= n; dy++) {
        for (let dz = -n; dz <= n; dz++) {
          const gx = cx + dx, gy = cy + dy, gz = cz + dz;
          const ccx = (gx + 0.5) * CELL, ccy = (gy + 0.5) * CELL, ccz = (gz + 0.5) * CELL;
          const dc = Math.hypot(ccx - cam.x, ccy - cam.y, ccz - cam.z);
          if (dc > NEAR_R + CELL) continue;
          const { d, field } = this.densityAt(ccx, ccy, ccz);
          if (d <= 0.01) continue;
          const r = mulberry(h3(gx, gy, gz, field.seed) * 4294967296);
          // população grande (25–180 m, raros gigantes) em todo o raio;
          // pequena (3–22 m) só perto da câmera
          const near = dc < NEAR_SMALL + CELL;
          const lamBig = d * BIG_PER_KM3 * cell3;
          const lamSmall = near ? d * SMALL_PER_KM3 * cell3 : 0;
          for (const [lam, small] of [[lamBig, false], [lamSmall, true]]) {
            if (lam <= 0) continue;
            let k = 0;
            const L = Math.exp(-Math.min(lam, 60));
            let pp = r();
            while (pp > L && k < 90) {
              k++;
              pp *= r();
            }
            for (let i = 0; i < k; i++) {
              const px = ccx + (r() - 0.5) * CELL, py = ccy + (r() - 0.5) * CELL, pz = ccz + (r() - 0.5) * CELL;
              const dist = Math.hypot(px - cam.x, py - cam.y, pz - cam.z);
              const lim = small ? NEAR_SMALL : NEAR_R;
              if (dist > lim) continue;
              let size = small ? 3 * Math.pow(7, r()) : 25 * Math.pow(7, r());
              if (!small && r() < 0.015) size = 300 + 1000 * r();
              size *= Math.min(1, (lim - dist) / (lim * 0.2));
              if (size < 1) continue;
              // espaço livre em volta da câmera (a nave não nasce dentro de uma rocha)
              if (dist < size * 2.5 + 120) continue;
              place(r, field, px, py, pz, size, dist, small ? 0.9 : 1);
            }
          }
        }
      }
    }
    for (let l = 0; l < LODS.length; l++) {
      for (let v = 0; v < VARIANTS; v++) {
        const im = this.meshes[l][v];
        im.count = counts[l][v];
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.visible = im.count > 0;
      }
    }
    this.count = total;
    return true;
  }

  frame(ctx, visible) {
    const cam = ctx.player.cameraWorld;
    // em pulso (milhares de km/s) as rochas próximas não fazem sentido: some e não reconstrói
    const fast = (ctx.player.velocity?.length?.() ?? 0) > 4000;
    this.root.visible = visible && !fast;
    if (visible && !fast) this.rebuild(cam);
    const H = ctx.pipeline.height || 720;
    const px = H / ((ctx.camera.fov * Math.PI) / 180);
    for (const d of this.dust) {
      d.points.visible = visible;
      d.points.material.uniforms.uPx.value = px;
    }
  }

  dispose() {
    this.anchorHandle.remove();
    for (const row of this.meshes) for (const im of row) im.geometry.dispose();
    this.material.dispose();
    this.fields = [];
    this.buildDust();
    this.ctx.scene.remove(this.root);
  }
}
