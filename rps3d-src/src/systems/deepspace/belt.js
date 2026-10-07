// Cinturões de asteroides: DADOS determinísticos + render instanciado.
//
// Dados: três populações independentes em grades de células (cada célula
// gera seus asteroides a partir da seed, então qualquer sistema — mineração,
// colisão, radar, missões — consulta os mesmos asteroides sem guardar nada):
//   A  pequenos   (5–90 m)     células de 3 km,  visíveis até ~14 km
//   B  grandes    (90–700 m)   células de 12 km, visíveis até ~70 km
//   C  colossos   (1–3,2 km)   células de 48 km, visíveis até ~220 km
// A densidade vem do perfil do cinturão (radial × vertical) × aglomerados.
//
// Render: 5 formatos × 3 LODs em InstancedMesh, matrizes relativas a uma
// âncora perto da câmera (origem flutuante), reconstruídas ao se mover.
// Cascalho distante: impostores esféricos iluminados, gerados na GPU numa
// caixa periódica em volta da câmera (densidade do cinturão no local).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, sqrt, fract,
  positionGeometry, instanceIndex, uv, cross, Discard, If,
} from 'three/tsl';
import { Rng, Noise, mix as mixSeed } from '../../core/Rng.js';
import { makeRockGeometries } from './rockGeo.js';
import { makeRockMaterial, ROCK_TYPES } from './rockMaterial.js';
import { hash33 } from './tsl.js';

const POP = [
  { key: 'A', cell: 3000, perCell: 24, rMin: 6, rMax: 110, alpha: 1.5, vis: 16000 },
  { key: 'B', cell: 12000, perCell: 14, rMin: 110, rMax: 900, alpha: 1.7, vis: 80000 },
  { key: 'C', cell: 48000, perCell: 1.2, rMin: 1000, rMax: 3600, alpha: 1.6, vis: 260000 },
];
const BUDGET = { ultra: 3200, high: 2200, medium: 1300, mobile: 700 };
const GRAVEL = { ultra: 7000, high: 5000, medium: 2800, mobile: 1400 };
const VARIANTS = 5;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();

export class AsteroidField {
  constructor(ctx) {
    this.ctx = ctx;
    this.belts = [];
    this.removed = new Set();
    this.noise = new Noise(4242);
    const q = ctx.quality.name;
    this.budget = BUDGET[q] || BUDGET.high;
    this.anchor = new THREE.Vector3();
    this.lastBuild = new THREE.Vector3(Infinity, 0, 0);
    this.buildTimer = 0;
    this.colliders = new Map();

    // ── malhas instanciadas: variante × LOD ──
    const geos = makeRockGeometries(q, VARIANTS);
    this.material = makeRockMaterial(q);
    this.group = new THREE.Group();
    this.group.name = 'asteroides';
    this.meshes = [];
    const perMesh = Math.ceil(this.budget / VARIANTS) + 64;
    for (let k = 0; k < VARIANTS; k++) {
      const row = [];
      for (let l = 0; l < 3; l++) {
        const base = geos[k][l];
        const g = new THREE.BufferGeometry();
        g.setIndex(base.index);
        g.setAttribute('position', base.attributes.position);
        g.setAttribute('normal', base.attributes.normal);
        g.setAttribute('aAO', base.attributes.aAO);
        const cap = l === 0 ? Math.ceil(perMesh * 0.25) : perMesh;
        const aRock = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        aRock.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aRock', aRock);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
        const mesh = new THREE.InstancedMesh(g, this.material, cap);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = l === 0; mesh.receiveShadow = l === 0;
        mesh.name = `asteroide-v${k}-lod${l}`;
        mesh.userData = { cap, aRock };
        this.group.add(mesh);
        row.push(mesh);
      }
      this.meshes.push(row);
    }
    this.entry = ctx.world.add(this.group, this.anchor);
    this.group.visible = false;

    this.gravel = new Gravel(ctx, GRAVEL[q] || GRAVEL.high);
    this.list = [];
  }

  setSystem(sys) {
    this.belts = (sys.belts || []).map((b) => ({ ...b, center: b.center.clone(), mid: (b.radiusInner + b.radiusOuter) / 2, half: (b.radiusOuter - b.radiusInner) / 2 }));
    this.sysSeed = sys.seed;
    this.lastBuild.set(Infinity, 0, 0);
    for (const c of this.colliders.values()) c.remove();
    this.colliders.clear();
  }

  /** Densidade do cinturão (0..1) num ponto de mundo. */
  densityAt(p) {
    let best = 0;
    for (const b of this.belts) {
      _v.copy(p).sub(b.center);
      const R = Math.hypot(_v.x, _v.z);
      const x = (R - b.mid) / b.half;          // -1..1 dentro
      if (Math.abs(x) > 1.4) continue;
      const radial = Math.exp(-x * x * 2.2);
      const yv = _v.y / (b.thickness * 0.5);
      const vertical = Math.exp(-yv * yv * 1.6);
      if (radial * vertical < 0.01) continue;
      // aglomerados (escala de ~250 km) e lacunas
      const n = this.noise.fbm3(_v.x / 2.5e5, _v.y / 1.2e5, _v.z / 2.5e5, 3);
      const clump = Math.max(0, Math.min(1, 0.55 + n * 1.1));
      best = Math.max(best, radial * vertical * clump * (b.density ?? 1));
    }
    return best;
  }

  /** Gera os asteroides de uma célula (pop, ix, iy, iz) → push em out. */
  cellAsteroids(pop, ix, iy, iz, out) {
    const C = pop.cell;
    _w.set((ix + 0.5) * C, (iy + 0.5) * C, (iz + 0.5) * C);
    const dens = this.densityAt(_w);
    if (dens < 0.02) return;
    const r = new Rng(mixSeed(this.sysSeed ^ 0x51ab, ix * 73856093 ^ iy * 19349663, iz * 83492791 + pop.key.charCodeAt(0)));
    const lam = pop.perCell * dens;
    let n = Math.floor(lam) + (r.next() < lam - Math.floor(lam) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const id = `${pop.key}${ix},${iy},${iz}:${i}`;
      const u = r.next();
      // lei de potência truncada
      const a = pop.alpha;
      const rmin = pop.rMin, rmax = pop.rMax;
      const radius = Math.pow(Math.pow(rmin, -a) - u * (Math.pow(rmin, -a) - Math.pow(rmax, -a)), -1 / a);
      const px = (ix + r.next()) * C, py = (iy + r.next()) * C, pz = (iz + r.next()) * C;
      const tpick = r.next();
      // composição: mais gelo nas bordas externas, metálicos raros, cristal raríssimo
      const type = tpick < 0.012 ? 4 : tpick < 0.11 ? 2 : tpick < 0.42 ? 1 : tpick < 0.86 ? 0 : 3;
      const qx = r.next(), qy = r.next(), qz = r.next();
      const variant = Math.floor(r.next() * VARIANTS);
      const sA = r.next() * 10, sB = r.next() * 10;
      if (this.removed.has(id)) continue;
      out.push({ id, x: px, y: py, z: pz, radius, type, variant, qx, qy, qz, sA, sB });
    }
  }

  /** Visita todas as células de uma população dentro do raio. */
  forCells(pop, p, rad, fn) {
    const C = pop.cell;
    const x0 = Math.floor((p.x - rad) / C), x1 = Math.floor((p.x + rad) / C);
    const y0 = Math.floor((p.y - rad) / C), y1 = Math.floor((p.y + rad) / C);
    const z0 = Math.floor((p.z - rad) / C), z1 = Math.floor((p.z + rad) / C);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 60000) return;
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) fn(ix, iy, iz);
  }

  /** API: asteroides dentro de r (dados para mineração/colisão). */
  query(p, rad, out = []) {
    out.length = 0;
    if (!this.belts.length || this.densityAt(p) <= 0 && this.nearestBeltDist(p) > rad + 2e5) return out;
    const tmp = [];
    for (const pop of POP) {
      tmp.length = 0;
      this.forCells(pop, p, rad + pop.rMax, (ix, iy, iz) => this.cellAsteroids(pop, ix, iy, iz, tmp));
      for (const a of tmp) {
        const d = Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z);
        if (d - a.radius > rad) continue;
        const t = ROCK_TYPES[a.type];
        out.push({ id: a.id, pos: new THREE.Vector3(a.x, a.y, a.z), radius: a.radius, distance: d, type: t.id, typeName: t.name, resources: t.resources, kind: 'asteroid' });
      }
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  nearestBeltDist(p) {
    let best = Infinity;
    for (const b of this.belts) {
      _v.copy(p).sub(b.center);
      const R = Math.hypot(_v.x, _v.z);
      const dr = Math.max(0, Math.abs(R - b.mid) - b.half);
      const dy = Math.max(0, Math.abs(_v.y) - b.thickness);
      best = Math.min(best, Math.hypot(dr, dy));
    }
    return best;
  }

  remove(id) { this.removed.add(id); this.lastBuild.set(Infinity, 0, 0); const c = this.colliders.get(id); if (c) { c.remove(); this.colliders.delete(id); } }

  /** Reconstrói as instâncias em volta da câmera. */
  rebuild(cam, pa) {
    this.anchor.set(Math.round(cam.x / 1000) * 1000, Math.round(cam.y / 1000) * 1000, Math.round(cam.z / 1000) * 1000);
    const list = this.list; list.length = 0;
    for (const pop of POP) this.forCells(pop, cam, pop.vis, (ix, iy, iz) => this.cellAsteroids(pop, ix, iy, iz, list));
    // ordena por tamanho aparente; corta pelo orçamento
    for (const a of list) {
      const d = Math.max(1, Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z) - a.radius * 0.5);
      a.d = d; a.px = a.radius / d / pa; // raio em pixels
    }
    list.sort((a, b) => b.px - a.px);
    const counts = this.meshes.map((row) => row.map(() => 0));
    let used = 0;
    const live = new Set();
    for (const a of list) {
      if (a.px < 0.7 || used >= this.budget) break;
      const lod = a.px > 70 ? 0 : a.px > 12 ? 1 : 2;
      let mesh = this.meshes[a.variant][lod];
      let l = lod;
      while (counts[a.variant][l] >= mesh.userData.cap && l < 2) { l++; mesh = this.meshes[a.variant][l]; }
      const i = counts[a.variant][l];
      if (i >= mesh.userData.cap) continue;
      counts[a.variant][l]++;
      used++;
      // rotação estável (quaternion uniforme a partir de 3 números)
      const u1 = a.qx, u2 = a.qy * Math.PI * 2, u3 = a.qz * Math.PI * 2;
      const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
      _q.set(s1 * Math.sin(u2), s1 * Math.cos(u2), s2 * Math.sin(u3), s2 * Math.cos(u3));
      _v.set(a.x - this.anchor.x, a.y - this.anchor.y, a.z - this.anchor.z);
      _s.setScalar(a.radius);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(i, _m);
      const ar = mesh.userData.aRock.array;
      ar[i * 4] = a.sA; ar[i * 4 + 1] = a.sB; ar[i * 4 + 2] = a.type; ar[i * 4 + 3] = a.radius;
      // colisores esféricos para os próximos
      if (a.d < 2500 + a.radius) {
        live.add(a.id);
        if (!this.colliders.has(a.id)) this.colliders.set(a.id, this.ctx.collision.addSphere({ center: new THREE.Vector3(a.x, a.y, a.z), radius: a.radius * 0.82, tag: 'asteroide' }));
      }
    }
    for (const [id, c] of this.colliders) if (!live.has(id)) { c.remove(); this.colliders.delete(id); }
    for (let k = 0; k < VARIANTS; k++) for (let l = 0; l < 3; l++) {
      const mesh = this.meshes[k][l];
      mesh.count = counts[k][l];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.aRock.needsUpdate = true;
      mesh.instanceMatrix.clearUpdateRanges?.();
    }
    this.lastBuild.copy(cam);
    this.buildTimer = 0;
    this.visibleCount = used;
  }

  /** Força a construção imediata (shots). */
  warm(p) { this.lastBuild.set(Infinity, 0, 0); }

  frame(dt, ctx) {
    const cam = ctx.player.camWorld;
    if (!this.belts.length) { this.group.visible = false; this.gravel.setDensity(0); return; }
    const near = this.nearestBeltDist(cam);
    const speed = ctx.player.vel?.length?.() || 0;
    const inside = near < 2.5e5 && speed < 6e4;
    this.group.visible = inside;
    const dens = this.densityAt(cam);
    this.gravel.setDensity(speed < 6e4 ? dens : 0);
    this.gravel.frame(ctx);
    if (!inside) return;
    const pa = ctx.services.space?.uniforms?.pa.value || 0.002;
    this.buildTimer += dt;
    if (cam.distanceTo(this.lastBuild) > 400 || (this.buildTimer > 1.5 && cam.distanceTo(this.lastBuild) > 20)) this.rebuild(cam, pa);
  }
}

/**
 * Cascalho: milhares de pedrinhas como impostores esféricos iluminados,
 * posições geradas na GPU (hash do índice) numa caixa periódica de lado L
 * em volta da câmera — paralaxe correta sem tocar a CPU.
 */
class Gravel {
  constructor(ctx, count) {
    this.ctx = ctx;
    this.count = count;
    const L = this.L = 26000;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(2, 2);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.instanceCount = count;
    const u = this.u = {
      camMod: uniform(new THREE.Vector3()),
      right: uniform(new THREE.Vector3(1, 0, 0)),
      up: uniform(new THREE.Vector3(0, 1, 0)),
      sun: uniform(new THREE.Vector3(0, 0, 1)),
      sunColor: uniform(new THREE.Color(1, 0.9, 0.8)),
      density: uniform(0),
      pa: uniform(0.002),
    };
    const h = hash33(vec3(float(instanceIndex), float(instanceIndex).mul(0.37).add(11.0), 3.7));
    const h2 = hash33(vec3(float(instanceIndex).mul(1.13), 7.1, float(instanceIndex).mul(0.71)));
    const center = fract(h.mul(L).sub(u.camMod).div(L)).sub(0.5).mul(L).toVar('gc');
    const rad = pow(h2.x, 3.0).mul(55.0).add(4.0);
    const dist = length(center);
    // nunca menor que ~1,2 px (evita cintilação), brilho compensado
    const size = max(rad, dist.mul(u.pa).mul(1.2));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    mat.positionNode = center.add(u.right.mul(positionGeometry.x.mul(size))).add(u.up.mul(positionGeometry.y.mul(size)));
    mat.colorNode = Fn(() => {
      const q = uv().mul(2).sub(1).toVar();
      const r2 = dot(q, q);
      // contorno irregular
      const wob = hash33(h2.add(vec3(q.mul(3.0).floor(), 1))).x.mul(0.12);
      If(r2.greaterThan(float(1).sub(wob)), () => { Discard(); });
      const nz = sqrt(max(float(1).sub(r2), 0.0));
      // normal no espaço de visão aproximada → mundo pelas bases right/up/frente
      const fwd = normalize(cross(u.right, u.up)).negate();
      const n = normalize(u.right.mul(q.x).add(u.up.mul(q.y)).add(fwd.mul(nz.negate())));
      const lit = max(dot(n, u.sun), 0.0);
      const alb = mix(vec3(0.08, 0.075, 0.07), vec3(0.3, 0.25, 0.2), h2.y);
      const fade = smoothstep(L * 0.5, L * 0.32, dist).mul(smoothstep(250.0, 900.0, dist));
      const sub = clamp(rad.div(size), 0.0, 1.0); // fração de pixel coberta
      const c = alb.mul(u.sunColor).mul(lit.mul(3.2).add(0.015));
      return vec4(c, fade.mul(sub.mul(0.8).add(0.2)).mul(u.density).mul(step01(h2.z, u.density)));
    })();
    mat.fog = false;
    const mesh = this.mesh = new THREE.Mesh(g, mat);
    mesh.name = 'cascalho';
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    ctx.scene.add(mesh);
  }
  setDensity(d) { this.u.density.value = Math.min(1, d * 1.4); this.mesh.visible = d > 0.01; }
  frame(ctx) {
    if (!this.mesh.visible) return;
    const L = this.L, c = ctx.player.camWorld;
    const m = (x) => ((x % L) + L) % L;
    this.u.camMod.value.set(m(c.x), m(c.y), m(c.z));
    const q = ctx.camera.quaternion;
    this.u.right.value.set(1, 0, 0).applyQuaternion(q);
    this.u.up.value.set(0, 1, 0).applyQuaternion(q);
    const sys = ctx.universe.system;
    if (sys) { sys.sunDir(c, this.u.sun.value); this.u.sunColor.value.setRGB(...sys.star.color); }
    this.u.pa.value = ctx.services.space?.uniforms?.pa.value || 0.002;
  }
}

/** 1 se h < densidade (desliga parte das pedras onde o cinturão é ralo). */
const step01 = (h, d) => smoothstep(d.add(0.02), d.sub(0.02), h);
