// Os Vigilantes: máquinas dos Arquitetos. Nada de casco "humano": núcleo
// cristalino facetado (obsidiana com circuitos de luz), coração luminoso
// visível pelas frestas, anéis segmentados que giram, estilhaços flutuantes
// e o "olho" — uma lente acesa na proa.
import * as THREE from 'three/webgpu';
import { Z, M, box, cyl, sphere, torusZ, plate, Parts, mergeGeometries } from './geo.js';
import { V } from './kit.js';

const SIZE = { fighter: 14, interceptor: 18, freighter: 40, explorer: 34, frigate: 110, destroyer: 480, carrier: 620 };

function facet(geo) { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; }

/** Triângulo com a normal apontando para fora do eixo central. */
function tri(out, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
  if (nx * cx + ny * cy + nz * cz < 0) out.push(...a, ...c, ...b); else out.push(...a, ...b, ...c);
}

/** Cristal alongado (bipirâmide) — facetado. */
function crystal(w, h, len, sides = 6, front = 0.42) {
  const g = new THREE.CylinderGeometry(1, 1, 1, sides, 1, true);
  // reconstrói como bipirâmide: anel no meio, pontas nos extremos
  const pos = [];
  const ring = [];
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 + Math.PI / sides; ring.push([Math.cos(a) * w, Math.sin(a) * h]); }
  const zf = -len * front, zb = len * (1 - front), zr = 0;
  for (let i = 0; i < sides; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % sides];
    tri(pos, [0, 0, zf], [x1, y1, zr], [x0, y0, zr]);
    tri(pos, [0, 0, zb], [x0, y0, zr], [x1, y1, zr]);
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

export function buildVigilant(bp, style, rng, classId) {
  const P = bp.parts;
  const s = (SIZE[classId] || 14) / 14;
  const big = classId === 'frigate' || classId === 'destroyer' || classId === 'carrier';
  const long = classId === 'interceptor' ? 1.5 : classId === 'explorer' ? 1.3 : 1;
  const wide = classId === 'freighter' ? 1.6 : classId === 'carrier' ? 1.5 : 1;
  // núcleo: dois cristais encaixados (facetas desencontradas)
  P.add(crystal(1.6 * s * wide, 1.1 * s, 13 * s * long, 6, 0.45), Z.PRIMARY, { wear: 0 });
  P.add(crystal(1.15 * s * wide, 1.5 * s, 9 * s * long, 4, 0.5), Z.SECONDARY, { m: M(0, 0, 0.6 * s, 0, 0, Math.PI / 4) });
  // coração luminoso (visível entre as placas)
  P.glowPart(crystal(0.7 * s * wide, 0.7 * s, 6 * s * long, 6, 0.5), style.glow, 1.6, { m: M(0, 0, 1.2 * s) });
  // olho na proa
  P.add(sphere(0.62 * s, 20, 14), Z.DARK, { m: M(0, 0.15 * s, -5.6 * s * long) });
  P.glowPart(sphere(0.42 * s, 20, 14), [0.6, 0.85, 1.0], 3.6, { m: M(0, 0.15 * s, -5.85 * s * long) });
  P.glowPart(torusZ(0.78 * s, 0.05 * s, 32), style.glow, 2, { m: M(0, 0.15 * s, -5.5 * s * long) });
  // lâminas (aletas) — estilhaços longos para trás
  const nBlades = big ? 8 : 5;
  for (let i = 0; i < nBlades; i++) {
    const a = (i / nBlades) * Math.PI * 2 + 0.3;
    const len = (6 + (i % 2) * 3) * s * long;
    const g = plate([[0, 0], [0.35 * s, len * 0.3], [0.12 * s, len], [-0.2 * s, len * 0.45]], 0.12 * s, { bevel: 0.02 * s });
    g.rotateZ(Math.PI / 2);
    const m = M(Math.cos(a) * 1.6 * s * wide, Math.sin(a) * 1.3 * s, 1.5 * s * long, 0, 0, a - Math.PI / 2);
    m.multiply(M(0, 0, 0, -0.18, 0, 0));
    P.add(facet(g), Z.TRIM, { m, wear: 0 });
  }
  // anel segmentado giratório
  const rings = big ? 3 : 1;
  for (let r = 0; r < rings; r++) {
    const R = (3.4 + r * 1.2) * s * wide;
    const ring = new Parts(bp.seed * 31 + r);
    const segs = 6 + r * 2;
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const t = torusZ(R, 0.18 * s, 12, (Math.PI * 2 / segs) * 0.72);
      t.rotateZ(a0);
      ring.add(facet(t.toNonIndexed()), Z.PRIMARY, { wear: 0 });
      // nó luminoso em cada segmento
      const am = a0 + (Math.PI * 2 / segs) * 0.36;
      ring.glowPart(box(0.2 * s, 0.2 * s, 0.4 * s), style.glow, 1.8, { m: M(Math.cos(am) * R, Math.sin(am) * R, 0, 0, 0, am) });
    }
    bp.spinners.push({ pivot: V(0, 0, (1.0 + r * 2.4) * s * long), parts: ring, axis: 'z', speed: (r % 2 ? -0.35 : 0.5) / (1 + r) });
  }
  // estilhaços flutuantes
  const nSh = big ? 14 : 6;
  for (let i = 0; i < nSh; i++) {
    const sh = new Parts(bp.seed * 53 + i);
    const g = crystal(0.35 * s, 0.25 * s, rng.range(1.6, 3.2) * s, 4, 0.5);
    sh.add(g, Z.PRIMARY, { wear: 0 });
    sh.glowPart(box(0.06 * s, 0.06 * s, 1.2 * s), style.glow, 1.3, { m: M(0, 0.26 * s, 0) });
    const a = (i / nSh) * Math.PI * 2;
    const rr = rng.range(2.4, 3.2) * s * wide;
    bp.spinners.push({ pivot: V(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, rng.range(-4, 3) * s * long), parts: sh, axis: 'z', speed: rng.range(-0.3, 0.3), bob: 0.25 * s });
  }
  // "motores": anéis de luz na popa
  const zt = 7.6 * s * long;
  for (const [x, y] of big ? [[0, 0], [1.4, 0], [-1.4, 0]] : [[0, 0]]) {
    bp.thrusters.push({ pos: V(x * s, y * s, zt + 0.3 * s), dir: V(0, 0, 1), r: 0.55 * s, len: 8 * s, core: 0.5 * s, coreZ: zt });
    P.glowPart(torusZ(0.62 * s, 0.07 * s, 24), style.glow, 2.4, { m: M(x * s, y * s, zt - 0.1 * s) });
  }
  if (classId === 'destroyer' || classId === 'carrier' || classId === 'frigate') {
    // pilares-antena (torres "vivas")
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bp.turrets.push(vigTurret(bp, V(Math.cos(a) * 1.4 * s * wide, Math.sin(a) * 1.0 * s, (i - 2.5) * 1.6 * s), V(Math.cos(a), Math.sin(a), 0), 0.6 * s, style));
    }
  }
  bp.hardpoints.push({ id: 'olho', type: 'beam', pos: V(0, 0.15 * s, -6.4 * s * long), dir: V(0, 0, -1) });
  for (const x of [-1, 1]) bp.hardpoints.push({ id: x < 0 ? 'lamina_e' : 'lamina_d', type: 'gun', pos: V(x * 1.6 * s, 0, -3 * s * long), dir: V(0, 0, -1) });
  bp.eye = V(0, 0.6 * s, -3.5 * s * long);
  bp.colliders.push({ center: V(0, 0, 0.5 * s), half: V(3.6 * s * wide, 3.2 * s, 7.5 * s * long) });
  bp.gearHeight = 1.4 * s; // pairam (sem trem)
}

function vigTurret(bp, pos, up, size, style) {
  const P = new Parts(bp.seed + 999);
  P.add(crystal(size * 0.6, size * 0.6, size * 2.4, 4, 0.5).rotateX(Math.PI / 2), Z.PRIMARY, { m: M(0, size, 0) });
  P.glowPart(sphere(size * 0.25, 10, 8), style.glow, 3, { m: M(0, size * 2.0, 0) });
  const B = new Parts(bp.seed + 1999);
  B.add(crystal(size * 0.18, size * 0.18, size * 2, 4, 0.2), Z.TRIM, { m: M(0, 0, -size * 0.6) });
  return { pos, up: up.clone().normalize(), size, kind: 'beam', parts: P, barrel: B, barrelPivot: V(0, size * 1.6, 0) };
}
