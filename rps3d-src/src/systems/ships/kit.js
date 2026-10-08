// Montagens reutilizáveis pelas plantas das naves: motor completo (nacela,
// bocal com pétalas, núcleo incandescente, definição de propulsor), canopy
// com nervuras, perna de trem de pouso, míssil, luzes de navegação e o
// "figurino" de cada facção (placas aparafusadas, espinhos, listras etc.).
import * as THREE from 'three/webgpu';
import {
  Z, M, onSurface, loft, plate, fin, box, cyl, cylZ, sphere, latheZ, nozzleParts, vent, rcs, antenna, pipe, gunBarrel, dish, Parts,
} from './geo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Motor: nacela (loft) de z0 a z1 (bocal em z1, abrindo para +Z).
 * Registra o propulsor em bp.thrusters.
 */
export function engine(bp, { x = 0, y = 0, z0, z1, r, style, mirror = false, nacelle = true, e = 2, cowlZone = Z.PRIMARY, ringZone = Z.TRIM, nozzleLen = null, plume = null }) {
  const P = bp.parts;
  const nl = nozzleLen ?? r * 1.2;
  if (nacelle) {
    const L = z1 - z0;
    const nac = loft([
      { z: z0, w: r * 0.55, h: r * 0.55, e },
      { z: z0 + L * 0.12, w: r * 0.92, h: r * 0.92, e },
      { z: z0 + L * 0.5, w: r * 1.02, h: r * 1.02, e },
      { z: z1 - L * 0.08, w: r * 0.98, h: r * 0.98, e },
      { z: z1, w: r * 0.9, h: r * 0.9, e },
    ], { seg: 28, sub: 3 });
    P.add(nac.geo, cowlZone, { m: M(x, y, 0), mirror, wear: 0.7 });
    // anel de acabamento + faixa escura de serviço
    const ring = cylZ(r * 1.04, r * 1.04, L * 0.04, 28);
    P.add(ring, ringZone, { m: M(x, y, z1 - L * 0.22), mirror });
    const band = cylZ(r * 1.025, r * 1.025, L * 0.1, 28);
    P.add(band, Z.DARK, { m: M(x, y, z0 + L * 0.3), mirror });
    // respiros laterais
    for (const s of [1, -1]) P.add(vent(r * 0.5, L * 0.22, 5, r * 0.06), Z.DARK, { m: M(x + s * r * 0.98, y, z0 + L * 0.55, 0, 0, -s * Math.PI / 2), mirror, detail: true });
  }
  const nz = nozzleParts(r * 0.86, nl, { petals: Math.max(8, Math.round(r * 14)) });
  P.add(nz.outer, Z.HOT, { m: M(x, y, z1), mirror });
  P.add(nz.petals, Z.DARK, { m: M(x, y, z1), mirror, detail: true });
  // garganta interna escura (o núcleo brilhante fica no fundo)
  const throat = latheZ([[r * 0.8, nl * 0.05], [r * 0.55, nl * 0.4], [r * 0.5, nl * 0.75]], 20);
  P.add(throat, Z.HOT, { m: M(x, y, z1), mirror });
  const t = { pos: V(x, y, z1 + nl * 0.6), dir: V(0, 0, 1), r: r * 0.62, len: plume ?? r * 9, core: r * 0.56, coreZ: z1 + nl * 0.42 };
  bp.thrusters.push(t);
  if (mirror) bp.thrusters.push({ ...t, pos: V(-x, y, t.pos.z) });
}

/** Canopy: vidro (loft achatado embaixo) + nervuras + trilho do peitoril. */
export function canopy(bp, { z0, z1, w, h, y, x = 0, ribs = 3, frameZone = Z.TRIM, r = 0.045, e = 2.2, bubble = 0.15 }) {
  const P = bp.parts;
  const st = [
    { z: z0, w: w * 0.2, h: h * 0.15, hb: 0.02, e },
    { z: z0 + (z1 - z0) * 0.22, w: w * 0.78, h: h * 0.8, hb: 0.02, e },
    { z: z0 + (z1 - z0) * (0.5 - bubble * 0.3), w, h, hb: 0.02, e },
    { z: z1 - (z1 - z0) * 0.15, w: w * 0.92, h: h * 0.82, hb: 0.02, e },
    { z: z1, w: w * 0.7, h: h * 0.3, hb: 0.02, e },
  ];
  const c = loft(st.map((s) => ({ ...s, y, x })), { seg: 36, sub: 4 });
  P.glassPart(c.geo);
  const zs = [];
  for (let i = 0; i < ribs; i++) zs.push(z0 + (z1 - z0) * (0.22 + (i / Math.max(1, ribs - 1)) * 0.62));
  for (const z of zs) {
    const pts = [];
    for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI; const q = c.at(z, a); pts.push(q.pos.addScaledVector(q.normal, r * 0.6)); }
    P.add(pipe(pts, r, 22), frameZone, { detail: false, wear: 0.2 });
  }
  // trilho do peitoril (os dois lados)
  for (const a of [0.04, Math.PI - 0.04]) {
    const pts = [];
    for (let k = 0; k <= 10; k++) { const z = z0 + (z1 - z0) * (0.05 + 0.9 * k / 10); const q = c.at(z, a); pts.push(q.pos.addScaledVector(q.normal, r * 0.3)); }
    P.add(pipe(pts, r * 1.25, 20), Z.DARK, { wear: 0.3 });
  }
  bp.canopy = { z0, z1, w, h, y };
  return c;
}

/**
 * Perna de trem: retorna Parts com a perna em pé (origem no pivô, perna
 * descendo em −Y). kind 'pad' (sapata) ou 'wheel'.
 */
export function gearLeg(seed, { len = 1.4, r = 0.07, pad = 0.35, kind = 'pad' } = {}) {
  const P = new Parts(seed);
  P.add(cyl(r, r, len * 0.62, 10), Z.METAL, { m: M(0, -len * 0.31, 0) });
  P.add(cyl(r * 1.45, r * 1.45, len * 0.5, 10), Z.DARK, { m: M(0, -len * 0.7, 0) });
  P.add(sphere(r * 1.7, 10, 8), Z.DARK, { m: M(0, 0, 0) });
  // braço de torque
  P.add(box(r * 0.8, len * 0.5, r * 0.8), Z.DARK, { m: M(0, -len * 0.42, r * 2.2, 0.35, 0, 0) });
  P.add(pipe([[r * 1.2, -len * 0.1, 0], [r * 2.2, -len * 0.4, r], [r * 1.5, -len * 0.78, 0]], r * 0.25, 10), Z.RUBBER);
  if (kind === 'wheel') {
    const wg = cyl(pad * 0.5, pad * 0.5, pad * 0.36, 18); wg.rotateZ(Math.PI / 2);
    P.add(wg, Z.RUBBER, { m: M(0, -len, 0) });
    const hub = cyl(pad * 0.26, pad * 0.26, pad * 0.4, 12); hub.rotateZ(Math.PI / 2);
    P.add(hub, Z.METAL, { m: M(0, -len, 0) });
  } else {
    P.add(box(pad * 1.2, pad * 0.16, pad * 1.6, pad * 0.06), Z.DARK, { m: M(0, -len - pad * 0.02, 0) });
    P.add(box(pad * 1.05, pad * 0.06, pad * 1.45, pad * 0.02), Z.RUBBER, { m: M(0, -len - pad * 0.12, 0) });
    P.add(cyl(r * 1.8, r * 2.4, pad * 0.25, 10), Z.METAL, { m: M(0, -len + pad * 0.12, 0) });
  }
  return P;
}

/** Míssil (ao longo de −Z). */
export function missile(P, m, len = 2.2, r = 0.11, zone = Z.SECONDARY) {
  const body = latheZ([[0.001, -len * 0.5], [r * 0.6, -len * 0.42], [r, -len * 0.3], [r, len * 0.45], [r * 0.7, len * 0.5]], 12);
  P.add(body, zone, { m, detail: true, wear: 0.1 });
  const tip = latheZ([[0.001, -len * 0.5 - 0.001], [r * 0.62, -len * 0.42]], 12);
  P.add(tip, Z.DARK, { m, detail: true });
  for (let i = 0; i < 4; i++) {
    const f = plate([[0, 0], [r * 2.2, r * 1.2], [r * 2.2, r * 3.2], [0, r * 4]], r * 0.12, { bevel: 0 });
    f.rotateZ(i * Math.PI / 2 + Math.PI / 4);
    f.translate(0, 0, len * 0.5 - r * 4.2);
    P.add(f, Z.DARK, { m, detail: true });
  }
  const band = cylZ(r * 1.02, r * 1.02, len * 0.05, 12); band.translate(0, 0, -len * 0.18);
  P.add(band, Z.GLOW, { m, detail: true });
}

/** Luzes de navegação nas pontas + estrobos. */
export function navLights(bp, style, { tip, strobes = [], beacon = null, size = 0.09 }) {
  const P = bp.parts;
  P.light(V(-tip.x, tip.y, tip.z), style.nav.left, 45, size);
  P.light(V(tip.x, tip.y, tip.z), style.nav.right, 45, size);
  for (const s of strobes) P.light(s, style.nav.strobe, 90, size * 0.8, 1.1);
  if (beacon) P.light(beacon, [1.0, 0.25, 0.08], 50, size * 1.2, -0.7);
}

/** Faixa luminosa (formação) ao longo do casco, na superfície do loft. */
export function stripLight(bp, L, { z0, z1, a, color, power = 5, width = 0.05, mirror = true }) {
  const pts = [];
  for (let k = 0; k <= 8; k++) { const z = z0 + (z1 - z0) * k / 8; const q = L.at(z, a); pts.push(q.pos.addScaledVector(q.normal, 0.012)); }
  const g = pipe(pts, width * 0.5, 16);
  bp.parts.glowPart(g, color, power, { mirror });
}

/**
 * Figurino da facção sobre um casco (loft). scale ≈ tamanho de referência.
 * Placas aparafusadas e canos (Frente), lâminas e espinhos (Corsários),
 * barras de perigo e holofotes (Guilda), friso dourado e cristas (Hegemonia).
 */
export function dress(bp, L, style, rng, { z0, z1, scale = 1, faction }) {
  const P = bp.parts;
  const zr = () => rng.range(z0, z1);
  if (faction === 'frente') {
    const n = Math.round(5 + scale * 3);
    for (let i = 0; i < n; i++) {
      const side = rng.chance(0.7) ? 1 : -1; // assimétrico: mais remendos de um lado
      const a = side > 0 ? rng.range(-0.6, 1.1) : Math.PI - rng.range(-0.6, 1.1);
      const q = L.at(zr(), a);
      const w = rng.range(0.4, 1.1) * scale, d = rng.range(0.5, 1.6) * scale;
      P.add(box(w, 0.05 * scale, d, 0.015 * scale), rng.pick([Z.PRIMARY, Z.SECONDARY, Z.METAL, Z.PRIMARY]), { m: onSurface(q.pos.addScaledVector(q.normal, 0.02 * scale), q.normal, rng.range(-0.3, 0.3)), wear: 1, detail: false });
      // parafusos nos cantos
      for (const [bx, bz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const bm = onSurface(q.pos.clone().addScaledVector(q.normal, 0.05 * scale), q.normal);
        bm.multiply(M(bx * w * 0.42, 0, bz * d * 0.42));
        P.add(cyl(0.025 * scale, 0.025 * scale, 0.03 * scale, 6), Z.METAL, { m: bm, detail: true });
      }
    }
    // canos expostos num lado
    const za = rng.range(z0, (z0 + z1) / 2), zb = za + (z1 - z0) * 0.4;
    const pts = [];
    for (let k = 0; k <= 6; k++) { const z = za + (zb - za) * k / 6; const q = L.at(z, -0.35); pts.push(q.pos.addScaledVector(q.normal, 0.09 * scale)); }
    P.add(pipe(pts, 0.05 * scale, 20), Z.METAL, { detail: true, wear: 1 });
    pts.forEach((p, k) => { if (k % 2 === 0) P.add(box(0.14 * scale, 0.06 * scale, 0.06 * scale), Z.DARK, { m: M(p.x, p.y, p.z), detail: true }); });
  } else if (faction === 'corsarios') {
    const n = Math.round(4 + scale * 2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      for (const s of [1, -1]) {
        const q = L.at(z0 + (z1 - z0) * t, s > 0 ? 0.25 : Math.PI - 0.25);
        const len = rng.range(0.4, 0.9) * scale * (1 - t * 0.4);
        const g = cyl(0.001, 0.09 * scale, len, 6); g.translate(0, len / 2, 0);
        const mm = onSurface(q.pos, q.normal.clone().add(V(0, 0, 0.9)).normalize());
        P.add(g, Z.TRIM, { m: mm, detail: true, wear: 0.5 });
      }
    }
    // lâmina dorsal serrilhada
    const q0 = L.at(z0 + (z1 - z0) * 0.35, Math.PI / 2);
    const pts = [[0, 0], [0.25, -0.5], [0.5, 0], [0.9, -0.55], [1.2, 0], [1.7, -0.75], [2.1, 0]].map(([z, y]) => [z * scale * 1.3, -y * scale]);
    P.add(fin(pts, 0.06 * scale, { bevel: 0.01 }), Z.SECONDARY, { m: M(0, q0.pos.y - 0.05 * scale, q0.pos.z), wear: 0.3 });
  } else if (faction === 'guilda') {
    // barras de perigo (zona secundária → listras) nas bordas
    for (const s of [1, -1]) {
      const q = L.at(z0 + (z1 - z0) * 0.15, s > 0 ? 0.1 : Math.PI - 0.1);
      P.add(box(0.08 * scale, 0.35 * scale, 1.4 * scale, 0.02 * scale), Z.SECONDARY, { m: onSurface(q.pos, q.normal), wear: 0.5 });
    }
    // holofotes de trabalho
    for (const s of [1, -1]) {
      const q = L.at(z0 + (z1 - z0) * 0.05, s > 0 ? 0.6 : Math.PI - 0.6);
      const hm = onSurface(q.pos, q.normal);
      P.add(cyl(0.09 * scale, 0.12 * scale, 0.18 * scale, 12), Z.DARK, { m: hm.clone().multiply(M(0, 0.06 * scale, 0)), detail: true });
      const lp = q.pos.clone().addScaledVector(q.normal, 0.16 * scale);
      P.light(lp, [1.0, 0.92, 0.75], 30, 0.07 * scale);
    }
    // antena de comércio (prato)
    const qd = L.at(z0 + (z1 - z0) * 0.7, Math.PI / 2);
    P.add(dish(0.45 * scale), Z.METAL, { m: onSurface(qd.pos, qd.normal, 0.4).multiply(M(0, 0.25 * scale, 0, 0.5, 0, 0)), detail: true });
  } else if (faction === 'hegemonia') {
    // friso dourado no dorso e crista
    const pts = [];
    const zs = bp.canopy ? Math.max(z0, bp.canopy.z1 + 0.3) : z0 + (z1 - z0) * 0.1;
    for (let k = 0; k <= 10; k++) { const z = zs + (z1 - zs) * (0.9 * k / 10); const q = L.at(z, Math.PI / 2); pts.push(q.pos.addScaledVector(q.normal, 0.015 * scale)); }
    P.add(pipe(pts, 0.035 * scale, 24), Z.TRIM, { wear: 0.05 });
    for (const s of [0.42, Math.PI - 0.42]) {
      const pp = [];
      for (let k = 0; k <= 10; k++) { const z = z0 + (z1 - z0) * (0.05 + 0.85 * k / 10); const q = L.at(z, s); pp.push(q.pos.addScaledVector(q.normal, 0.012 * scale)); }
      P.add(pipe(pp, 0.022 * scale, 24), Z.TRIM, { wear: 0.05 });
    }
  }
  // greebles comuns: RCS, antenas, respiros
  for (const [t, a] of [[0.08, 0.15], [0.08, Math.PI - 0.15], [0.92, 0.2], [0.92, Math.PI - 0.2], [0.5, -Math.PI / 2 + 0.6], [0.5, -Math.PI / 2 - 0.6]]) {
    const q = L.at(z0 + (z1 - z0) * t, a);
    P.add(rcs(0.22 * scale), Z.DARK, { m: onSurface(q.pos, q.normal), detail: true });
  }
  const qa = L.at(z0 + (z1 - z0) * 0.62, Math.PI / 2);
  P.add(antenna(0.9 * scale, 0.018 * scale), Z.METAL, { m: onSurface(qa.pos, qa.normal.clone().add(V(0, 0, 0.6)).normalize()), detail: true });
  const qb = L.at(z0 + (z1 - z0) * 0.4, Math.PI / 2 + 0.25);
  P.add(vent(0.4 * scale, 0.6 * scale, 6, 0.05 * scale), Z.DARK, { m: onSurface(qb.pos, qb.normal), detail: true });
  const qc = L.at(z0 + (z1 - z0) * 0.4, Math.PI / 2 - 0.25);
  P.add(vent(0.4 * scale, 0.6 * scale, 6, 0.05 * scale), Z.DARK, { m: onSurface(qc.pos, qc.normal), detail: true });
}

export { V };
