// Geometria procedural de flora por arquétipo (árvores-parasol, baobás de
// bulbo, palmas-leque, samambaias, tubos luminosos, flores gigantes, vagens
// explosivas, colunas e barris do deserto, pinhos de gelo, árvores de
// cristal, cogumelos gigantes, esporeiras, árvores de cinza, corais, rochas).
//
// Toda peça leva cor + aEx por vértice: x = emissivo, y = rugosidade,
// z = flexibilidade ao vento (m por unidade de balanço), w = translucidez.
// `q` (0..1) controla o detalhe (LOD).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = new THREE.Color(), C2 = new THREE.Color();

/** Normaliza para não-indexado com só position/normal. */
function prep(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

/**
 * Pinta a peça. o: { hex, hex2 (gradiente por altura local), y0, y1, emis, rough, flex (num|fn(p)),
 * trans, ao (escurece embaixo), up (cor no topo — neve/musgo), upHex, jitter }
 */
function paint(g, o) {
  g = prep(g);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const n = pos.count;
  const col = new Float32Array(n * 3), ex = new Float32Array(n * 4);
  const a = new THREE.Color(o.hex), b = new THREE.Color(o.hex2 || o.hex), up = o.upHex ? new THREE.Color(o.upHex) : null;
  const y0 = o.y0 ?? 0, y1 = o.y1 ?? 1;
  const P = V();
  for (let i = 0; i < n; i++) {
    P.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const t = Math.min(1, Math.max(0, (P.y - y0) / (y1 - y0 || 1)));
    C.copy(a).lerp(b, o.gradFn ? o.gradFn(P, t) : t);
    if (o.ao) { const k = 1 - o.ao * (1 - Math.min(1, Math.max(0, nor.getY(i) * 0.5 + 0.5))) ** 1.3; C.multiplyScalar(k); }
    if (o.aoBase) { const k = 1 - o.aoBase * Math.max(0, 1 - P.y / o.aoBaseH); C.multiplyScalar(k); }
    if (up) { const k = Math.max(0, Math.min(1, (nor.getY(i) - (o.upMin ?? 0.55)) * 4)) * (o.up ?? 1); C.lerp(up, k); }
    col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b;
    ex[i * 4] = typeof o.emis === 'function' ? o.emis(P, t) : o.emis || 0;
    ex[i * 4 + 1] = o.rough ?? 0.8;
    ex[i * 4 + 2] = typeof o.flex === 'function' ? o.flex(P) : o.flex ?? 0;
    ex[i * 4 + 3] = o.trans ?? 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 4));
  return g;
}
function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), V(...scale));
  return g.applyMatrix4(m);
}
function merge(parts) {
  const g = mergeGeometries(parts.filter(Boolean), false);
  g.computeBoundingSphere();
  return g;
}

/** Tubo ao longo de pontos com raios (anéis com transporte paralelo). mod(t, th) modula o raio. */
function tubeGeo(pts, radii, sides = 8, mod = null, capTop = true) {
  const pos = [], idx = [];
  const n = pts.length;
  const T = [], N = [];
  for (let i = 0; i < n; i++) T.push(pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  let ref = Math.abs(T[0].y) < 0.95 ? V(0, 1, 0) : V(1, 0, 0);
  let nn = ref.clone().addScaledVector(T[0], -ref.dot(T[0])).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) { nn = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i])); if (nn.lengthSq() < 1e-8) nn = N[i - 1].clone(); nn.normalize(); }
    N.push(nn);
  }
  for (let i = 0; i < n; i++) {
    const B = V().crossVectors(T[i], N[i]);
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2;
      const r = radii[i] * (mod ? mod(i / (n - 1), th) : 1);
      const p = pts[i].clone().addScaledVector(N[i], Math.cos(th) * r).addScaledVector(B, Math.sin(th) * r);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + (k + 1) % sides, c = (i + 1) * sides + k, d = (i + 1) * sides + (k + 1) % sides;
    idx.push(a, c, b, b, c, d);
  }
  if (capTop) {
    const tip = pts[n - 1].clone().addScaledVector(T[n - 1], radii[n - 1] * 0.6);
    const ti = pos.length / 3; pos.push(tip.x, tip.y, tip.z);
    for (let k = 0; k < sides; k++) idx.push((n - 1) * sides + k, ti, (n - 1) * sides + (k + 1) % sides);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Caminho curvo: de a na direção d, curvando por `bend` por unidade, em `segs` passos. */
function curvePts(a, d, len, bend, segs) {
  const pts = [a.clone()]; const p = a.clone(), dd = d.clone().normalize();
  for (let i = 0; i < segs; i++) { dd.add(bend.clone().multiplyScalar(1 / segs)).normalize(); p.addScaledVector(dd, len / segs); pts.push(p.clone()); }
  return pts;
}
/** Bolha com ruído. */
function blob(r, detail, amp, seed, flat = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 3.1 / r + seed) * Math.sin(y * 2.7 / r + seed * 1.3) * Math.sin(z * 3.3 / r + seed * 0.7);
    const l = 1 + n * amp;
    p.setXYZ(i, x * l, y * l * flat, z * l);
  }
  g.computeVertexNormals();
  return g;
}
/**
 * Lâmina/folha em fita: comprimento L, largura w, queda `droop`, dobra
 * central `fold`, segmentos `s`. Ao longo de +X. width(t) opcional.
 */
function blade(L, w, droop, s = 8, fold = 0.25, widthFn = null, curlUp = 0) {
  const pos = [], idx = [];
  for (let i = 0; i <= s; i++) {
    const t = i / s;
    const x = t * L, y = droop * (t * 0.35 - t * t) + curlUp * t * t * L;
    const ww = w * (widthFn ? widthFn(t) : Math.sin(Math.min(1, t * 1.1 + 0.02) * Math.PI) * (1 - t * 0.25));
    const f = ww * fold;
    pos.push(x, y + f, -ww, x, y - f * 0.3, 0, x, y + f, ww);
  }
  for (let i = 0; i < s; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Prisma (cristal) com ponta. */
function prism(sides, r, h, tip, taper = 0.85) {
  const g = new THREE.CylinderGeometry(r * taper, r, h, sides, 1, false);
  g.translate(0, h / 2, 0);
  const c = new THREE.ConeGeometry(r * taper, tip, sides, 1, true);
  c.translate(0, h + tip / 2, 0);
  return merge([prep(g), prep(c)]);
}

const flexY = (H, k = 1, p = 2) => (P) => Math.max(0, P.y / H) ** p * k;

// ═══ VERÍDIA (exuberante) ════════════════════════════════════════════════
function parasol(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 11 + r() * 6;
  const sides = q > 0.5 ? 10 : 6, segs = q > 0.5 ? 12 : 6;
  // tronco em S suave com anéis
  const pts = [], radii = [];
  const bx = (r() - 0.5) * 1.6, bz = (r() - 0.5) * 1.6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(V(Math.sin(t * Math.PI) * bx, t * H, Math.sin(t * Math.PI * 0.8) * bz));
    radii.push(0.42 * (1 - t * 0.7) + (i === 0 ? 0.25 : 0));
  }
  parts.push(paint(tubeGeo(pts, radii, sides, (t, th) => 1 + 0.07 * Math.sin(t * 60) + 0.05 * Math.cos(th * 5 + t * 8), false), { hex: c.trunk, hex2: c.trunk, y0: 0, y1: H, rough: 0.9, flex: flexY(H, 0.6), aoBase: 0.35, aoBaseH: 3, gradFn: (P, t) => t }));
  // raízes aéreas
  const nr = q > 0.5 ? 5 : 3;
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * Math.PI * 2 + r() * 0.5;
    const rp = curvePts(V(Math.cos(a) * 0.2, 1.4 + r() * 0.8, Math.sin(a) * 0.2), V(Math.cos(a), -0.3, Math.sin(a)), 2.2 + r(), V(0, -2.2, 0), q > 0.5 ? 6 : 3);
    parts.push(paint(tubeGeo(rp, rp.map((_, k) => 0.12 * (1 - k / rp.length * 0.5)), q > 0.5 ? 6 : 4), { hex: c.trunk, rough: 0.95, flex: 0, ao: 0.3 }));
  }
  // camadas de copa: anéis de lâminas radiais
  const tiers = 2 + (r() < 0.6 ? 1 : 0);
  const top = pts[pts.length - 1];
  for (let k = 0; k < tiers; k++) {
    const y = top.y - k * (1.6 + r() * 0.6);
    const R = 3.4 + k * 1.3 + r() * 0.8;
    const nb = q > 0.5 ? 22 + k * 4 : 11 + k * 2;
    const cx = top.x * (1 - k * 0.15), cz = top.z * (1 - k * 0.15);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + r() * 0.2;
      const g = blade(R * (0.85 + r() * 0.3), 0.5 + r() * 0.25, 0.9 + k * 0.4, q > 0.5 ? 7 : 4, 0.3, (t) => Math.sin(Math.min(1, t * 1.05 + 0.04) * Math.PI) ** 0.7 * (1 - t * 0.2));
      xf(g, [cx, y + 0.1, cz], [0, -a, 0.1 + r() * 0.12]);
      parts.push(paint(g, { hex: c.leaf, hex2: c.leaf2, gradFn: (P) => Math.min(1, Math.hypot(P.x - cx, P.z - cz) / R) ** 1.4, rough: 0.55, trans: 0.75, flex: (P) => 0.4 + Math.hypot(P.x - cx, P.z - cz) / R * 0.9, ao: 0.45 }));
    }
    // cubo central do anel
    const hub = blob(0.6 + k * 0.1, q > 0.5 ? 2 : 1, 0.15, seed + k, 0.5);
    xf(hub, [cx, y + 0.1, cz]);
    parts.push(paint(hub, { hex: c.leaf, rough: 0.7, flex: 0.4, trans: 0.3, ao: 0.4 }));
    // galhos curtos até o anel
    if (k > 0) parts.push(paint(tubeGeo([V(top.x * 0.9, y - 0.2, top.z * 0.9), V(cx, y + 0.1, cz)], [0.18, 0.12], 5, null, false), { hex: c.trunk, rough: 0.9, flex: flexY(H, 0.6) }));
  }
  // gavinhas penduradas com bulbos luminosos
  const nt = q > 0.5 ? 9 : 4;
  for (let i = 0; i < nt; i++) {
    const a = r() * Math.PI * 2, d = 1.5 + r() * 2.8;
    const L = 1.5 + r() * 3;
    const x = top.x + Math.cos(a) * d, z = top.z + Math.sin(a) * d, y = top.y - 0.3 - r() * 1.2;
    parts.push(paint(tubeGeo([V(x, y, z), V(x + 0.1, y - L * 0.5, z), V(x, y - L, z)], [0.025, 0.02, 0.015], 4, null, false), { hex: c.leaf2, rough: 0.7, flex: 1.0, trans: 0.4 }));
    const bulb = new THREE.SphereGeometry(0.13 + r() * 0.08, q > 0.5 ? 8 : 5, q > 0.5 ? 6 : 4);
    xf(bulb, [x, y - L - 0.1, z], [0, 0, 0], [1, 1.5, 1]);
    parts.push(paint(bulb, { hex: c.glow, emis: 1, rough: 0.3, flex: 1.0, trans: 0.8 }));
  }
  return merge(parts);
}

function bulbtree(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 6 + r() * 4;
  const segs = q > 0.5 ? 14 : 7, sides = q > 0.5 ? 14 : 8;
  const pts = [], radii = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(V(Math.sin(t * 2) * 0.2, t * H, 0));
    radii.push(0.5 + 1.1 * Math.sin(Math.min(1, t * 2.2) * Math.PI) * (1 - t) ** 0.5 + (t > 0.85 ? -0.1 : 0));
  }
  parts.push(paint(tubeGeo(pts, radii, sides, (t, th) => 1 + 0.06 * Math.cos(th * 9) + 0.03 * Math.sin(t * 30 + th * 3), false), { hex: c.trunk, hex2: c.leaf2, gradFn: (P, t) => Math.max(0, t - 0.6) * 0.5, y0: 0, y1: H, rough: 0.85, flex: flexY(H, 0.25), aoBase: 0.3, aoBaseH: 1.5 }));
  const top = pts[pts.length - 1];
  const nf = q > 0.5 ? 14 : 7;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * Math.PI * 2 + r() * 0.3;
    const g = blade(3.5 + r() * 2, 0.45 + r() * 0.2, 3 + r() * 1.5, q > 0.5 ? 9 : 5, 0.35);
    xf(g, [top.x, top.y + 0.2, top.z], [0, -a, -0.5 - r() * 0.4]);
    parts.push(paint(g, { hex: c.leaf, hex2: c.leaf2, gradFn: (P) => Math.min(1, Math.hypot(P.x - top.x, P.z - top.z) / 4), rough: 0.55, trans: 0.7, flex: (P) => 0.3 + Math.hypot(P.x - top.x, P.z - top.z) * 0.25, ao: 0.35 }));
  }
  // vagens luminosas sob a coroa
  for (let i = 0; i < (q > 0.5 ? 6 : 3); i++) {
    const a = r() * Math.PI * 2;
    const g = new THREE.SphereGeometry(0.22, q > 0.5 ? 10 : 6, q > 0.5 ? 8 : 5);
    xf(g, [top.x + Math.cos(a) * 0.7, top.y - 0.4 - r() * 0.4, top.z + Math.sin(a) * 0.7], [0, 0, 0], [1, 1.6, 1]);
    parts.push(paint(g, { hex: c.glow, emis: 0.9, rough: 0.3, flex: 0.3, trans: 0.9 }));
  }
  return merge(parts);
}

function fanpalm(seed, c, q) {
  const r = rng(seed); const parts = [];
  const ns = 2 + Math.floor(r() * 3);
  for (let s = 0; s < ns; s++) {
    const a = (s / ns) * Math.PI * 2 + r();
    const H = 4 + r() * 4;
    const lean = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.25 + r() * 0.3);
    const pts = curvePts(V(0, 0, 0), V(lean.x, 1, lean.z), H, V(lean.x * 0.8, 0, lean.z * 0.8), q > 0.5 ? 8 : 4);
    parts.push(paint(tubeGeo(pts, pts.map((_, k) => 0.2 * (1 - k / pts.length * 0.5)), q > 0.5 ? 8 : 5, (t, th) => 1 + 0.1 * Math.max(0, Math.sin(t * 40)), false), { hex: c.trunk, rough: 0.9, flex: flexY(H, 0.5) }));
    const top = pts[pts.length - 1];
    const nl = q > 0.5 ? 6 : 4;
    for (let i = 0; i < nl; i++) {
      const b = (i / nl) * Math.PI * 2 + r() * 0.4;
      // leque plissado: várias lâminas estreitas abertas
      const nfan = q > 0.5 ? 9 : 5;
      for (let k = 0; k < nfan; k++) {
        const fa = (k / (nfan - 1) - 0.5) * 1.6;
        const g = blade(1.9 + r() * 0.5, 0.2, 0.8, q > 0.5 ? 5 : 3, 0.5);
        xf(g, [0, 0, 0], [fa * 0.2, fa, 0]);
        xf(g, [top.x, top.y, top.z], [0, -b, -0.35 - r() * 0.25]);
        parts.push(paint(g, { hex: c.leaf, hex2: c.leaf2, gradFn: (P) => Math.min(1, P.distanceTo(top) / 2), rough: 0.5, trans: 0.65, flex: (P) => 0.4 + P.distanceTo(top) * 0.4, ao: 0.3 }));
      }
    }
  }
  return merge(parts);
}

function fern(seed, c, q) {
  const r = rng(seed); const parts = [];
  const nf = q > 0.5 ? 9 : 5;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * Math.PI * 2 + r() * 0.4;
    const L = 1.0 + r() * 0.8;
    const s = q > 0.5 ? 7 : 4;
    // ráquis curvo + folíolos
    const rpts = curvePts(V(0, 0, 0), V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5), L, V(Math.cos(a) * 1.4, -1.8, Math.sin(a) * 1.4), s);
    parts.push(paint(tubeGeo(rpts, rpts.map((_, k) => 0.025 * (1 - k / rpts.length * 0.7)), 4, null, false), { hex: c.leaf, rough: 0.7, flex: (P) => P.y * 0.6 + 0.2 }));
    for (let k = 1; k < rpts.length; k++) {
      const p = rpts[k];
      const t = k / rpts.length;
      for (const side of [-1, 1]) {
        const g = blade(0.35 * (1 - t * 0.6), 0.07, 0.08, 3, 0.2);
        xf(g, [p.x, p.y, p.z], [0, -a + side * 1.3, -0.3]);
        parts.push(paint(g, { hex: c.leaf2, hex2: c.leaf, gradFn: () => t, rough: 0.55, trans: 0.7, flex: (P) => P.y * 0.6 + 0.3 }));
      }
    }
  }
  // brotos enrolados no centro
  for (let i = 0; i < 2; i++) {
    const pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; const ang = t * Math.PI * 2.4; pts.push(V(Math.sin(ang) * 0.12 * (1 - t) + i * 0.1, 0.3 + t * 0.3 + Math.cos(ang) * 0.1 * t, 0)); }
    parts.push(paint(tubeGeo(pts, pts.map(() => 0.03), 5), { hex: c.leaf2, rough: 0.6, flex: 0.2, trans: 0.3 }));
  }
  return merge(parts);
}

function tubebloom(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.4;
    const h = 0.5 + r() * 1.3;
    const g = new THREE.CylinderGeometry(0.09 + r() * 0.04, 0.06, h, q > 0.5 ? 10 : 6, 1, true);
    // boca alargada
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y > h * 0.4) { const s = 1 + (y / h - 0.4) * 0.9; p.setX(k, p.getX(k) * s); p.setZ(k, p.getZ(k) * s); } }
    g.computeVertexNormals();
    xf(g, [Math.cos(a) * d, h / 2, Math.sin(a) * d], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3]);
    parts.push(paint(g, { hex: c.accent, hex2: c.glow, y0: 0, y1: h, gradFn: (P, t) => t ** 3, emis: (P, t) => Math.max(0, t - 0.75) * 3, rough: 0.45, trans: 0.6, flex: (P) => P.y * 0.5 }));
  }
  // folhas na base
  for (let i = 0; i < 5; i++) {
    const g = blade(0.7, 0.14, 0.4, 4, 0.3);
    xf(g, [0, 0.02, 0], [0, i * 1.25, -0.6]);
    parts.push(paint(g, { hex: c.leaf, rough: 0.6, trans: 0.5, flex: 0.2 }));
  }
  return merge(parts);
}

function orbshrub(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const h = 0.6 + r() * 1.1;
    const pts = curvePts(V(0, 0, 0), V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4), h, V(Math.cos(a) * 0.6, -0.4, Math.sin(a) * 0.6), q > 0.5 ? 5 : 3);
    parts.push(paint(tubeGeo(pts, pts.map(() => 0.025), 4, null, false), { hex: c.leaf, rough: 0.7, flex: (P) => P.y * 0.8 }));
    const tip = pts[pts.length - 1];
    const g = new THREE.SphereGeometry(0.12 + r() * 0.1, q > 0.5 ? 12 : 6, q > 0.5 ? 9 : 5);
    xf(g, [tip.x, tip.y + 0.05, tip.z]);
    parts.push(paint(g, { hex: c.glow, emis: 0.8, rough: 0.2, trans: 1, flex: (P) => P.y * 0.8 }));
  }
  const base = blob(0.35, 1, 0.3, seed, 0.5); xf(base, [0, 0.1, 0]);
  parts.push(paint(base, { hex: c.leaf, rough: 0.7, flex: 0.05, ao: 0.4 }));
  return merge(parts);
}

function bloom(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 0.9 + r() * 1.0;
  const stem = curvePts(V(0, 0, 0), V(0.1, 1, 0), H, V(0.25, 0, 0), q > 0.5 ? 6 : 3);
  parts.push(paint(tubeGeo(stem, stem.map((_, k) => 0.05 * (1 - k / stem.length * 0.4)), 6, null, false), { hex: c.leaf, rough: 0.6, flex: (P) => P.y * 0.5 }));
  const top = stem[stem.length - 1];
  const np = 6;
  for (let i = 0; i < np; i++) {
    const g = blade(0.75, 0.32, -0.1, q > 0.5 ? 6 : 4, 0.45, (t) => Math.sin(Math.min(1, t * 1.05 + 0.05) * Math.PI) ** 0.6, 0.35);
    xf(g, [top.x, top.y, top.z], [0, (i / np) * Math.PI * 2, 0.45]);
    parts.push(paint(g, { hex: c.accent, hex2: c.leaf2, gradFn: (P) => 1 - Math.min(1, P.distanceTo(top) / 0.7), rough: 0.45, trans: 0.8, flex: (P) => P.y * 0.5 + 0.1 }));
  }
  const st = new THREE.SphereGeometry(0.12, 10, 8); xf(st, [top.x, top.y + 0.08, top.z], [0, 0, 0], [1, 0.7, 1]);
  parts.push(paint(st, { hex: c.glow, emis: 1.2, rough: 0.3, flex: (P) => P.y * 0.5 }));
  for (let i = 0; i < 4; i++) {
    const g = blade(0.8, 0.18, 0.5, 4, 0.3);
    xf(g, [0, 0.05, 0], [0, i * 1.6 + r(), -0.5]);
    parts.push(paint(g, { hex: c.leaf, rough: 0.55, trans: 0.5, flex: 0.2 }));
  }
  return merge(parts);
}

function boompod(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, d = 0.25 + r() * 0.2;
    const s = 0.28 + r() * 0.14;
    const g = new THREE.SphereGeometry(s, q > 0.5 ? 14 : 7, q > 0.5 ? 10 : 5);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k); const rib = 1 + 0.08 * Math.cos(Math.atan2(z, x) * 8); p.setXYZ(k, x * rib, y * 1.35 + (y > 0 ? y * y * 1.2 : 0), z * rib); }
    g.computeVertexNormals();
    xf(g, [Math.cos(a) * d, s * 1.3, Math.sin(a) * d], [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4]);
    parts.push(paint(g, { hex: c.accent, hex2: c.glow, y0: 0.1, y1: 1.1, gradFn: (P, t) => t ** 2, emis: (P, t) => t ** 3 * 1.2, rough: 0.25, trans: 0.7, flex: 0.05 }));
  }
  for (let i = 0; i < 7; i++) {
    const g = blade(0.9, 0.12, 0.3, 4, 0.5, (t) => (1 - t) * 0.9 + 0.1);
    xf(g, [0, 0.05, 0], [0, i * 0.9, -0.35]);
    parts.push(paint(g, { hex: c.leaf, hex2: c.trunk, gradFn: (P) => Math.min(1, P.length()), rough: 0.6, trans: 0.4, flex: 0.2 }));
  }
  return merge(parts);
}

function grass(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const h = 0.35 + r() * 0.55;
    const g = new THREE.PlaneGeometry(0.06, h, 1, 3);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + h / 2; const t = y / h; p.setX(k, p.getX(k) * (1 - t * 0.9)); p.setZ(k, t * t * 0.18); p.setY(k, y); }
    g.computeVertexNormals();
    xf(g, [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3], [r() * 0.25, r() * Math.PI, 0]);
    const tipAlt = r() < 0.25;
    parts.push(paint(g, { hex: c.leaf, hex2: tipAlt ? c.accent : c.leaf2, y0: 0, y1: h, gradFn: (P, t) => t ** 2 * (tipAlt ? 0.8 : 0.6), rough: 0.7, trans: 0.6, flex: (P) => P.y * 2.4 }));
  }
  return merge(parts);
}

function rock(seed, c, q) {
  const r = rng(seed);
  const g = blob(1, q > 0.5 ? 2 : 1, 0.28, seed, 0.62);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.15) p.setY(i, -0.15 + (y + 0.15) * 0.2); }
  g.computeVertexNormals();
  xf(g, [0, 0.12, 0], [r() * 0.3, r() * 6, r() * 0.3], [1 + r() * 0.5, 0.7 + r() * 0.4, 1 + r() * 0.3]);
  const moss = ['lush', 'ocean', 'toxic'].includes(c.biome);
  return merge([paint(g, { hex: c.rock2, hex2: c.rock, y0: -0.1, y1: 0.8, rough: 0.92, flex: 0, upHex: moss ? c.leaf : c.biome === 'ice' ? '#f4f8fc' : null, up: 0.85, upMin: 0.6, ao: 0.3 })]);
}

// ═══ ASHAR (desértico) ═══════════════════════════════════════════════════
function ribbed(n, amp) { return (t, th) => 1 + amp * Math.max(-0.4, Math.cos(th * n)); }
function pillar(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 3.5 + r() * 4;
  const sides = q > 0.5 ? 24 : 12;
  const main = curvePts(V(0, 0, 0), V(0, 1, 0), H, V((r() - 0.5) * 0.1, 0, 0), q > 0.5 ? 10 : 5);
  const rr = 0.38 + r() * 0.12;
  parts.push(paint(tubeGeo(main, main.map((_, k) => rr * (k === main.length - 1 ? 0.85 : 1)), sides, ribbed(12, 0.1)), { hex: c.leaf, hex2: c.leaf2, y0: 0, y1: H, gradFn: (P, t) => t * 0.4, rough: 0.6, flex: flexY(H, 0.05), aoBase: 0.3, aoBaseH: 1 }));
  const na = Math.floor(r() * 3) + 1;
  for (let i = 0; i < na; i++) {
    const a = r() * Math.PI * 2, y = H * (0.35 + r() * 0.3);
    const out = V(Math.cos(a), 0, Math.sin(a));
    const arm = [V(out.x * rr * 0.6, y, out.z * rr * 0.6), V(out.x * 1.0, y + 0.1, out.z * 1.0), V(out.x * 1.2, y + 0.7, out.z * 1.2), V(out.x * 1.2, y + 1.8 + r(), out.z * 1.2)];
    parts.push(paint(tubeGeo(arm, arm.map(() => rr * 0.65), sides, ribbed(10, 0.1)), { hex: c.leaf, hex2: c.leaf2, y0: 0, y1: H, gradFn: (P, t) => t * 0.4, rough: 0.6, flex: flexY(H, 0.05) }));
    const fl = new THREE.SphereGeometry(0.16, 8, 6); xf(fl, [arm[3].x, arm[3].y + rr * 0.5, arm[3].z], [0, 0, 0], [1, 0.6, 1]);
    parts.push(paint(fl, { hex: c.accent, emis: 0.3, rough: 0.5, flex: 0.05, trans: 0.6 }));
  }
  // flores no topo
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fl = new THREE.SphereGeometry(0.13, 8, 6); xf(fl, [Math.cos(a) * rr * 0.6, H + rr * 0.3, Math.sin(a) * rr * 0.6], [0, 0, 0], [1, 0.6, 1]);
    parts.push(paint(fl, { hex: c.accent, emis: 0.35, rough: 0.5, flex: 0.1, trans: 0.6 }));
  }
  // espinhos (pontos claros nas costelas)
  if (q > 0.5) for (let i = 0; i < 40; i++) {
    const th = Math.floor(r() * 12) / 12 * Math.PI * 2, y = r() * H;
    const g = new THREE.ConeGeometry(0.012, 0.12, 3); g.rotateZ(-Math.PI / 2);
    xf(g, [Math.cos(th) * rr * 1.1, y, Math.sin(th) * rr * 1.1], [0, -th, 0]);
    parts.push(paint(g, { hex: '#efe4c8', rough: 0.5, flex: 0 }));
  }
  return merge(parts);
}
function barrel(seed, c, q) {
  const r = rng(seed); const parts = [];
  const h = 0.6 + r() * 0.6, rr = 0.45 + r() * 0.2;
  const pts = []; const radii = [];
  const s = q > 0.5 ? 8 : 4;
  for (let i = 0; i <= s; i++) { const t = i / s; pts.push(V(0, t * h, 0)); radii.push(rr * Math.sin(0.35 + t * 2.4) ** 0.6); }
  parts.push(paint(tubeGeo(pts, radii, q > 0.5 ? 22 : 12, ribbed(14, 0.12)), { hex: c.leaf, hex2: c.leaf2, y0: 0, y1: h, rough: 0.55, flex: 0, aoBase: 0.3, aoBaseH: 0.3 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const g = blade(0.22, 0.08, -0.05, 3, 0.3, null, 0.6);
    xf(g, [Math.cos(a) * 0.1, h * 0.98, Math.sin(a) * 0.1], [0, -a, 0.6]);
    parts.push(paint(g, { hex: c.accent, emis: 0.15, rough: 0.5, trans: 0.7, flex: 0.1 }));
  }
  return merge(parts);
}
function brush(seed, c, q) {
  const r = rng(seed); const parts = [];
  const branch = (p, d, len, rad, depth) => {
    const pts = curvePts(p, d, len, V((r() - 0.5) * 0.8, 0.2, (r() - 0.5) * 0.8), 3);
    parts.push(paint(tubeGeo(pts, pts.map((_, k) => rad * (1 - k / pts.length * 0.5)), 4, null, false), { hex: c.trunk, rough: 0.95, flex: (P) => P.y * 0.4 }));
    const e = pts[pts.length - 1];
    if (depth <= 0) {
      const b = blob(0.12 + r() * 0.1, 0, 0.3, r() * 10); xf(b, [e.x, e.y, e.z]);
      parts.push(paint(b, { hex: c.leaf, hex2: c.leaf2, rough: 0.8, trans: 0.3, flex: (P) => P.y * 0.5 }));
      return;
    }
    const nb = depth > 1 ? 3 : 2;
    for (let i = 0; i < nb; i++) branch(e, d.clone().add(V((r() - 0.5) * 1.4, 0.3, (r() - 0.5) * 1.4)).normalize(), len * 0.7, rad * 0.65, depth - 1);
  };
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2; branch(V(0, 0, 0), V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize(), 0.5 + r() * 0.3, 0.04, q > 0.5 ? 2 : 1); }
  return merge(parts);
}
function spitter(seed, c, q) {
  const r = rng(seed); const parts = [];
  const neck = curvePts(V(0, 0, 0), V(0.2, 1, 0), 0.7, V(0.3, -0.2, 0), 5);
  parts.push(paint(tubeGeo(neck, neck.map((_, k) => 0.12 - k * 0.01), 8, null, false), { hex: c.leaf, rough: 0.6, flex: (P) => P.y * 0.3 }));
  const top = neck[neck.length - 1];
  const head = new THREE.SphereGeometry(0.32, q > 0.5 ? 16 : 8, q > 0.5 ? 12 : 6, 0, Math.PI * 2, 0, Math.PI * 0.8);
  xf(head, [top.x + 0.1, top.y + 0.15, top.z], [0, 0, -1.2], [1, 1.2, 1]);
  parts.push(paint(head, { hex: c.accent, hex2: c.leaf, y0: 0, y1: 1.2, rough: 0.35, trans: 0.6, flex: (P) => P.y * 0.3 }));
  const inner = new THREE.SphereGeometry(0.24, 10, 8); xf(inner, [top.x + 0.22, top.y + 0.18, top.z]);
  parts.push(paint(inner, { hex: c.glow, emis: 1.3, rough: 0.3, flex: (P) => P.y * 0.3 }));
  for (let i = 0; i < 6; i++) {
    const g = blade(0.8, 0.2, 0.2, 4, 0.6, (t) => 1 - t * 0.8);
    xf(g, [0, 0.03, 0], [0, i * 1.05 + r(), -0.25]);
    parts.push(paint(g, { hex: c.leaf, hex2: c.leaf2, gradFn: (P) => Math.min(1, P.length()), rough: 0.5, trans: 0.4, flex: 0.1 }));
  }
  return merge(parts);
}

// ═══ NIVÁLIA (gelo) ══════════════════════════════════════════════════════
function frostpine(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 6 + r() * 6;
  parts.push(paint(tubeGeo([V(0, 0, 0), V(0, H * 0.5, 0), V(0, H, 0)], [0.28, 0.18, 0.04], q > 0.5 ? 8 : 5, null, false), { hex: c.trunk, rough: 0.9, flex: flexY(H, 0.3) }));
  const tiers = q > 0.5 ? 7 : 4;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const y = H * (0.25 + t * 0.72);
    const R = (1 - t) * 2.4 + 0.4;
    const nb = q > 0.5 ? 14 : 7;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + k * 0.4 + r() * 0.2;
      const g = blade(R, 0.38 * (1 - t * 0.4), 1.2 + R * 0.3, q > 0.5 ? 5 : 3, 0.55, (u) => (1 - u) ** 0.6);
      xf(g, [0, y, 0], [0, -a, 0.15]);
      parts.push(paint(g, { hex: c.leaf, hex2: c.leaf2, gradFn: (P) => Math.min(1, Math.hypot(P.x, P.z) / R) * 0.5, upHex: '#f6fbff', up: 0.95, upMin: 0.35, rough: 0.6, trans: 0.2, flex: (P) => (P.y / H) ** 2 * 0.3 + Math.hypot(P.x, P.z) * 0.15, ao: 0.4 }));
    }
  }
  return merge(parts);
}
function crystaltree(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 9 : 5;
  const H = 3 + r() * 4;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const tilt = i === 0 ? 0 : 0.25 + r() * 0.55;
    const h = i === 0 ? H : H * (0.35 + r() * 0.5);
    const g = prism(6, 0.18 + r() * 0.2 + (i === 0 ? 0.15 : 0), h, 0.5 + r() * 0.6);
    xf(g, [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [tilt * Math.cos(a), 0, tilt * Math.sin(a)]);
    parts.push(paint(g, { hex: c.leaf2, hex2: c.accent, y0: 0, y1: H, emis: (P, t) => 0.12 + t ** 2 * 0.6, rough: 0.12, trans: 1, flex: 0 }));
  }
  const base = blob(0.6, 1, 0.3, seed, 0.4); parts.push(paint(base, { hex: c.rock2 || c.trunk, rough: 0.9, upHex: '#f4f8fc', up: 0.8 }));
  return merge(parts);
}
function icebulb(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, h = 0.4 + r() * 0.9;
    const pts = curvePts(V(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1), V(Math.cos(a) * 0.2, 1, Math.sin(a) * 0.2), h, V(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4), 4);
    parts.push(paint(tubeGeo(pts, pts.map(() => 0.03), 5, null, false), { hex: c.leaf, rough: 0.6, flex: (P) => P.y * 0.3 }));
    const tip = pts[pts.length - 1];
    const g = new THREE.SphereGeometry(0.15 + r() * 0.08, q > 0.5 ? 12 : 6, q > 0.5 ? 9 : 5); xf(g, [tip.x, tip.y + 0.08, tip.z], [0, 0, 0], [1, 1.3, 1]);
    parts.push(paint(g, { hex: c.glow, emis: 0.9, rough: 0.1, trans: 1, flex: (P) => P.y * 0.3 }));
  }
  return merge(parts);
}
function crystal(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, tilt = 0.2 + r() * 0.7, h = 0.4 + r() * 1.4;
    const g = prism(r() < 0.5 ? 6 : 5, 0.1 + r() * 0.15, h, 0.2 + r() * 0.3);
    xf(g, [Math.cos(a) * 0.15, -0.05, Math.sin(a) * 0.15], [tilt * Math.cos(a), 0, tilt * Math.sin(a)]);
    parts.push(paint(g, { hex: c.accent, hex2: c.glow, y0: 0, y1: 1.5, emis: (P, t) => 0.15 + t * 0.6, rough: 0.12, trans: 1, flex: 0 }));
  }
  return merge(parts);
}

// ═══ TÓXICO (fungos) ═════════════════════════════════════════════════════
function capfungus(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 3 + r() * 4.5;
  const stem = curvePts(V(0, 0, 0), V((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3), H, V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5), q > 0.5 ? 10 : 5);
  parts.push(paint(tubeGeo(stem, stem.map((_, k) => { const t = k / (stem.length - 1); return 0.25 + 0.35 * (1 - t) ** 4 + 0.05 * Math.sin(t * 20); }), q > 0.5 ? 12 : 7, (t, th) => 1 + 0.05 * Math.cos(th * 7 + t * 5), false), { hex: c.trunk, hex2: c.leaf2, y0: 0, y1: H, gradFn: (P, t) => t * 0.4, rough: 0.7, flex: flexY(H, 0.25), aoBase: 0.3, aoBaseH: 1 }));
  const top = stem[stem.length - 1];
  const R = 1.6 + r() * 1.6;
  // chapéu: calota achatada com borda caída
  const cap = new THREE.SphereGeometry(R, q > 0.5 ? 28 : 12, q > 0.5 ? 12 : 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const p = cap.attributes.position;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k); const rr2 = Math.hypot(x, z) / R; p.setY(k, (y - R * 0.15) * 0.45 - rr2 ** 3 * R * 0.25); p.setX(k, x * (1 + 0.04 * Math.sin(Math.atan2(z, x) * 7))); }
  cap.computeVertexNormals();
  xf(cap, [top.x, top.y + 0.1, top.z]);
  const spotR = rng(seed + 5); const spots = [];
  for (let i = 0; i < 14; i++) spots.push(V((spotR() - 0.5) * 1.6 * R, 0, (spotR() - 0.5) * 1.6 * R));
  parts.push(paint(cap, { hex: c.leaf, hex2: c.accent, gradFn: (P) => { let s = 0; for (const sp of spots) { const d = Math.hypot(P.x - top.x - sp.x, P.z - top.z - sp.z); s = Math.max(s, 1 - d / (R * 0.16)); } return Math.min(1, Math.max(0, s * 3)); }, emis: (P) => { let s = 0; for (const sp of spots) { const d = Math.hypot(P.x - top.x - sp.x, P.z - top.z - sp.z); s = Math.max(s, 1 - d / (R * 0.16)); } return Math.max(0, s) * 0.5; }, rough: 0.45, trans: 0.35, flex: flexY(H, 0.25) }));
  // lamelas luminosas por baixo (disco com raios)
  const gills = new THREE.CircleGeometry(R * 0.93, q > 0.5 ? 40 : 16, 0, Math.PI * 2);
  const gp = gills.attributes.position;
  for (let k = 0; k < gp.count; k++) { const x = gp.getX(k), y = gp.getY(k); const rr2 = Math.hypot(x, y) / R; gp.setZ(k, -(-0.15 * R * 0.45 - rr2 ** 3 * R * 0.25) - 0.05 + rr2 * 0.1); }
  gills.rotateX(Math.PI / 2);
  xf(gills, [top.x, top.y + 0.05 - R * 0.07, top.z]);
  parts.push(paint(gills, { hex: c.glow, hex2: c.leaf2, gradFn: (P) => Math.min(1, Math.hypot(P.x - top.x, P.z - top.z) / R), emis: (P) => 0.9 * (1 - Math.min(1, Math.hypot(P.x - top.x, P.z - top.z) / R) * 0.5), rough: 0.6, trans: 0.5, flex: flexY(H, 0.25) }));
  // filamentos pendurados
  for (let i = 0; i < (q > 0.5 ? 10 : 4); i++) {
    const a = r() * Math.PI * 2, d = R * (0.6 + r() * 0.3), L = 0.6 + r() * 1.6;
    const x = top.x + Math.cos(a) * d, z = top.z + Math.sin(a) * d, y = top.y - R * 0.2;
    parts.push(paint(tubeGeo([V(x, y, z), V(x, y - L * 0.5, z + 0.05), V(x, y - L, z)], [0.02, 0.015, 0.01], 4), { hex: c.glow, emis: 0.7, rough: 0.5, flex: 0.8, trans: 0.8 }));
  }
  return merge(parts);
}
function shroomcluster(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 9 : 5;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.5;
    const h = 0.15 + r() * 0.55, R = 0.08 + r() * 0.16;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push(paint(tubeGeo([V(x, 0, z), V(x + 0.02, h * 0.5, z), V(x, h, z)], [0.035, 0.03, 0.028], 5, null, false), { hex: c.leaf2, rough: 0.6, flex: (P) => P.y * 0.2 }));
    const cap = new THREE.SphereGeometry(R, q > 0.5 ? 12 : 6, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
    xf(cap, [x, h - R * 0.1, z], [0, 0, 0], [1, 0.6, 1]);
    parts.push(paint(cap, { hex: c.glow, hex2: c.accent, gradFn: (P) => Math.min(1, Math.abs(P.y - h) / R * 2), emis: 1.0, rough: 0.35, trans: 0.9, flex: (P) => P.y * 0.2 }));
  }
  return merge(parts);
}
function sporepuff(seed, c, q) {
  const r = rng(seed); const parts = [];
  const g = blob(0.45, q > 0.5 ? 3 : 1, 0.12, seed, 0.85); xf(g, [0, 0.42, 0]);
  const pores = []; for (let i = 0; i < 20; i++) pores.push(V(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  parts.push(paint(g, { hex: c.leaf, hex2: c.glow, gradFn: (P) => { const d = P.clone().sub(V(0, 0.42, 0)).normalize(); let s = 0; for (const p of pores) s = Math.max(s, d.dot(p)); return s > 0.96 ? 1 : 0; }, emis: (P) => { const d = P.clone().sub(V(0, 0.42, 0)).normalize(); let s = 0; for (const p of pores) s = Math.max(s, d.dot(p)); return s > 0.96 ? 1.2 : 0; }, rough: 0.6, trans: 0.4, flex: 0.05 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pts = curvePts(V(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3), V(Math.cos(a), 0.6, Math.sin(a)), 0.6 + r() * 0.4, V(0, -1.5, 0), 5);
    parts.push(paint(tubeGeo(pts, pts.map((_, k) => 0.05 * (1 - k / pts.length * 0.7)), 5), { hex: c.leaf2, rough: 0.6, flex: (P) => P.y * 0.5, trans: 0.4 }));
  }
  return merge(parts);
}
function tendril(seed, c, q) {
  const r = rng(seed); const parts = [];
  const n = q > 0.5 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, h = 1.0 + r() * 1.8;
    const pts = []; const s = q > 0.5 ? 14 : 7;
    for (let k = 0; k <= s; k++) { const t = k / s; const curl = t ** 2 * 2.5; pts.push(V(Math.cos(a) * (0.1 + t * 0.4) + Math.sin(curl * 3) * 0.15 * t, t * h, Math.sin(a) * (0.1 + t * 0.4) + Math.cos(curl * 3) * 0.15 * t)); }
    parts.push(paint(tubeGeo(pts, pts.map((_, k) => 0.07 * (1 - k / pts.length * 0.85)), q > 0.5 ? 7 : 4, (t, th) => 1 + 0.25 * Math.max(0, Math.sin(t * 50)) * Math.max(0, Math.cos(th))), { hex: c.leaf, hex2: c.glow, y0: 0, y1: h, gradFn: (P, t) => t ** 2, emis: (P, t) => t ** 4 * 1.2, rough: 0.4, trans: 0.6, flex: (P) => P.y * 0.6 }));
  }
  return merge(parts);
}

// ═══ BRASA (vulcânico) ═══════════════════════════════════════════════════
function ashtree(seed, c, q) {
  const r = rng(seed); const parts = [];
  const H = 4 + r() * 4;
  const ember = (P) => (Math.sin(P.y * 9 + Math.sin(P.x * 13) * 2) > 0.93 ? 1.4 : 0);
  const trunk = curvePts(V(0, 0, 0), V(0.1, 1, 0), H, V((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8), q > 0.5 ? 9 : 5);
  parts.push(paint(tubeGeo(trunk, trunk.map((_, k) => 0.35 * (1 - k / trunk.length * 0.8)), q > 0.5 ? 9 : 5, (t, th) => 1 + 0.12 * Math.cos(th * 4 + t * 12), false), { hex: c.trunk, hex2: c.accent, gradFn: (P) => ember(P) * 0.6, emis: (P) => ember(P) * 0.8, rough: 0.95, flex: flexY(H, 0.1) }));
  const nb = q > 0.5 ? 7 : 4;
  for (let i = 0; i < nb; i++) {
    const t = 0.45 + r() * 0.5; const p = trunk[Math.floor(t * (trunk.length - 1))];
    const a = r() * Math.PI * 2;
    const pts = curvePts(p, V(Math.cos(a), 0.5 + r() * 0.5, Math.sin(a)), 1.2 + r() * 1.8, V(0, 0.6, 0), 4);
    parts.push(paint(tubeGeo(pts, pts.map((_, k) => 0.1 * (1 - k / pts.length * 0.8)), 5), { hex: c.trunk, hex2: c.accent, gradFn: (P) => ember(P) * 0.6, emis: (P) => ember(P) * 0.8, rough: 0.95, flex: flexY(H, 0.1) }));
  }
  return merge(parts);
}
function emberbloom(seed, c, q) {
  const r = rng(seed); const parts = [];
  const g = blob(0.35, q > 0.5 ? 2 : 1, 0.25, seed, 0.7); xf(g, [0, 0.25, 0]);
  parts.push(paint(g, { hex: c.trunk, hex2: c.glow, y0: 0, y1: 0.6, gradFn: (P, t) => (Math.sin(P.x * 20) * Math.sin(P.z * 20) > 0.5 ? 1 : 0), emis: (P) => (Math.sin(P.x * 20) * Math.sin(P.z * 20) > 0.5 ? 1.6 : 0), rough: 0.9, flex: 0 }));
  for (let i = 0; i < 5; i++) {
    const gg = blade(0.6, 0.15, 0.2, 4, 0.4, null, 0.3);
    xf(gg, [0, 0.35, 0], [0, i * 1.26 + r(), -0.1]);
    parts.push(paint(gg, { hex: c.trunk, hex2: c.accent, gradFn: (P) => Math.min(1, P.length() * 1.2), emis: (P) => Math.min(1, P.length()) * 0.5, rough: 0.8, flex: 0.05 }));
  }
  return merge(parts);
}

// ═══ COSTA (oceânico) ════════════════════════════════════════════════════
function coral(seed, c, q) {
  const r = rng(seed); const parts = [];
  const branch = (p, d, len, rad, depth) => {
    const pts = curvePts(p, d, len, V((r() - 0.5) * 0.6, 0.4, (r() - 0.5) * 0.6), 3);
    parts.push(paint(tubeGeo(pts, pts.map((_, k) => rad * (1 - k / pts.length * 0.3)), 5), { hex: c.accent, hex2: c.glow, y0: 0, y1: 1.2, emis: (P, t) => t ** 3 * 0.6, rough: 0.6, flex: 0.02 }));
    if (depth <= 0) return;
    const e = pts[pts.length - 1];
    for (let i = 0; i < 2; i++) branch(e, d.clone().add(V((r() - 0.5) * 1.2, 0.4, (r() - 0.5) * 1.2)).normalize(), len * 0.75, rad * 0.75, depth - 1);
  };
  for (let i = 0; i < 3; i++) branch(V(0, 0, 0), V((r() - 0.5) * 0.8, 1, (r() - 0.5) * 0.8).normalize(), 0.35 + r() * 0.2, 0.06, q > 0.5 ? 3 : 2);
  return merge(parts);
}

export const BUILDERS = {
  parasol, bulbtree, fanpalm, fern, tubebloom, orbshrub, bloom, boompod, grass, rock,
  pillar, barrel, brush, spitter, frostpine, crystaltree, icebulb, crystal,
  capfungus, shroomcluster, sporepuff, tendril, ashtree, emberbloom, coral,
};

/** Protótipos (2 níveis de detalhe × variantes) de uma espécie de flora. */
export function buildFloraProtos(sp, variants = 3) {
  const B = BUILDERS[sp.arch];
  const c = { ...sp.colors, biome: sp.biome };
  const out = [];
  for (let v = 0; v < variants; v++) {
    const seed = (sp.seed + v * 7919) >>> 0;
    out.push({ hi: B(seed, c, 1), lo: B(seed, c, 0.3) });
  }
  return out;
}
