// Naves capitais (destróier e porta-caças) e torres separáveis.
//
// Escala real: destróier ~560 m, porta-caças ~760 m. O casco é um loft em
// cunha com trincheiras, superestruturas em blocos, ponte de comando, janelas
// (milhares de pontos luminosos fundidos numa malha), hangares iluminados
// com campo de contenção e torres independentes (base + berço com canos)
// que o combate pode mirar e destacar uma a uma.
import * as THREE from 'three/webgpu';
import { Z, M, onSurface, loft, plate, fin, box, cyl, cylZ, sphere, latheZ, vent, rcs, antenna, pipe, gunBarrel, dish, Parts, torusZ } from './geo.js';
import { engine, navLights, V } from './kit.js';

/** Torre: base giratória (yaw) + berço (pitch) com 1–3 canos. Origem na base, +Y = normal do casco. */
export function turret(bp, pos, up, size, kind = 'medium', style = null) {
  const P = new Parts(bp.seed + bp.turrets.length * 13);
  const s = size;
  P.add(cyl(s * 0.95, s * 1.1, s * 0.28, 20), Z.DARK, { m: M(0, s * 0.14, 0) });
  P.add(cyl(s * 0.8, s * 0.92, s * 0.5, 20), Z.PRIMARY, { m: M(0, s * 0.45, 0), wear: 0.6 });
  P.add(box(s * 1.5, s * 0.55, s * 1.2, s * 0.12), Z.PRIMARY, { m: M(0, s * 0.68, s * 0.15), wear: 0.6 });
  P.add(box(s * 0.5, s * 0.25, s * 0.5, s * 0.05), Z.DARK, { m: M(s * 0.45, s * 1.02, s * 0.45), detail: true });
  P.add(vent(s * 0.6, s * 0.5, 5, s * 0.05), Z.DARK, { m: M(-s * 0.4, s * 0.96, s * 0.4), detail: true });
  P.add(antenna(s * 0.9, s * 0.02), Z.METAL, { m: M(s * 0.55, s * 0.95, s * 0.6), detail: true });
  P.light(V(-s * 0.6, s * 0.98, -s * 0.2), [1, 0.3, 0.1], 30, s * 0.05, -0.8);
  const B = new Parts(bp.seed + bp.turrets.length * 17 + 5);
  const n = kind === 'heavy' ? 3 : kind === 'pd' ? 2 : 2;
  const blen = kind === 'heavy' ? s * 3.2 : kind === 'pd' ? s * 1.6 : s * 2.4;
  const br = kind === 'heavy' ? s * 0.12 : s * 0.07;
  B.add(box(s * (0.4 + n * 0.32), s * 0.5, s * 0.9, s * 0.1), Z.PRIMARY, { m: M(0, 0, 0), wear: 0.5 });
  B.add(box(s * (0.3 + n * 0.32), s * 0.06, s * 0.92), Z.TRIM, { m: M(0, s * 0.22, 0), detail: true });
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * s * 0.34;
    B.add(gunBarrel(blen, br), Z.METAL, { m: M(x, 0, -s * 0.4) });
  }
  bp.turrets.push({ pos: pos.clone(), up: up.clone().normalize(), size: s, kind, parts: P, barrel: B, barrelPivot: V(0, s * 0.72, -s * 0.1) });
}

function windowRows(bp, L, { z0, z1, a, rows = 3, step = 2.2, color = [1.0, 0.82, 0.55], power = 3.5, size = 0.6, spacing = 3.2, mirror = true, rng }) {
  const g = [];
  for (let r = 0; r < rows; r++) for (let z = z0; z < z1; z += spacing) {
    if (rng && rng.chance(0.18)) continue;
    const q = L.at(z, a + r * step * 0.01);
    const m = onSurface(q.pos.addScaledVector(q.normal, 0.06), q.normal);
    const b = box(size, 0.05, size * 0.6).applyMatrix4(m);
    g.push(b.toNonIndexed());
  }
  for (const b of g) bp.parts.glowPart(b, color, power, { mirror });
}

/** Destróier / porta-caças da Hegemonia (funciona para qualquer facção humana). */
export function buildCapital(bp, style, rng, classId, faction) {
  const P = bp.parts;
  const carrier = classId === 'carrier';
  const S = carrier ? 1.35 : 1;
  const e = 3.4;
  // casco em cunha
  const st = carrier ? [
    { z: -380, w: 8, h: 6, e: 2.6, y: -6 },
    { z: -330, w: 52, h: 18, hb: 16, e: 3.5, y: -4 },
    { z: -200, w: 95, h: 30, hb: 26, e: 4.5 },
    { z: 0, w: 120, h: 38, hb: 30, e: 5 },
    { z: 220, w: 118, h: 40, hb: 32, e: 5 },
    { z: 340, w: 100, h: 38, hb: 30, e: 4.5 },
    { z: 380, w: 82, h: 32, hb: 26, e: 4 },
  ] : [
    { z: -290, w: 4, h: 3, e: 2.5, y: -2 },
    { z: -240, w: 30, h: 12, hb: 10, e: 3, y: -2 },
    { z: -120, w: 62, h: 24, hb: 20, e: 3.4 },
    { z: 40, w: 86, h: 30, hb: 26, e: 3.8 },
    { z: 180, w: 88, h: 34, hb: 28, e: 4 },
    { z: 262, w: 72, h: 30, hb: 26, e: 4 },
    { z: 285, w: 60, h: 26, hb: 22, e: 3.5 },
  ];
  const L = loft(st, { seg: 48, sub: 4 });
  P.add(L.geo, Z.PRIMARY, { wear: 0.4 });
  bp.hullLoft = L;
  const zMin = st[0].z, zMax = st[st.length - 1].z;
  // quilha inferior escura e faixa secundária ao longo do flanco
  const keel = loft(st.slice(1).map((s) => ({ ...s, w: s.w * 0.55, h: s.hb * 0.25, hb: s.hb * 1.12, y: (s.y || 0) - s.hb * 0.1 })), { seg: 32, sub: 3 });
  P.add(keel.geo, Z.DARK, { wear: 0.6 });
  // trincheiras: faixas laterais em degrau
  for (const s of [1, -1]) {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const z = zMin + 60 + (zMax - zMin - 90) * k / 12; const q = L.at(z, s > 0 ? 0 : Math.PI); pts.push([q.pos.x + s * 1.5, q.pos.y, z]); }
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0, z0] = pts[k], [x1, , z1] = pts[k + 1];
      const len = z1 - z0;
      P.add(box(5, 7 * S, len * 1.02), Z.SECONDARY, { m: M((x0 + x1) / 2, y0, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, len), 0), wear: 0.3 });
      P.add(box(3.2, 2.2, len * 0.9), Z.DARK, { m: M((x0 + x1) / 2 + s * 1.6, y0 + 4.2 * S, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, len), 0), detail: true });
    }
  }
  // conveses em degraus (terraços) sobre o dorso: a silhueta em camadas que
  // dá escala; cada terraço tem friso, janelas corridas e luzes de borda
  const tierDefs = carrier ? [[0.62, -260, 0.24], [0.36, -60, 0.24]] : [[0.62, -95, 0.3], [0.4, -5, 0.3], [0.22, 95, 0.34]];
  const surfs = [{ L, a0: 0.62, a1: 1.0, w: 1 }];
  let prevTop = (z) => { const p = L.params(z); return (p.y || 0) + p.h; };
  const tiers = [];
  for (const [ws, zs, hk] of tierDefs) {
    const base = prevTop;
    const tst = st.filter((q) => q.z >= zs - 1).map((q) => {
      const p = L.params(q.z);
      const th = p.h * hk;
      return { z: q.z, w: p.w * ws, h: th, hb: th * 0.9, y: base(q.z) - th * 0.15, e: 7 };
    });
    tst.unshift({ ...tst[0], z: zs, w: tst[0].w * 0.25, h: tst[0].h * 0.2 });
    const T = loft(tst, { seg: 40, sub: 4 });
    P.add(T.geo, Z.PRIMARY, { wear: 0.35 });
    tiers.push(T);
    surfs.push({ L: T, a0: 0.0, a1: 0.5, w: 0.6 });
    // friso de acabamento nas quinas superiores e faixa escura na base
    for (const ang of [0.42, Math.PI - 0.42]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const z = zs + 4 + (zMax - zs - 6) * k / 16; const q = T.at(z, ang); pts.push(q.pos.addScaledVector(q.normal, 0.25)); }
      P.add(pipe(pts, 0.55, 48), Z.TRIM, { wear: 0.1 });
    }
    // faixa escura recuada no flanco do terraço (onde ficam as janelas)
    for (const sd of [1, -1]) for (let z = zs + 10; z < zMax - 8; z += 6) {
      const q = T.at(z + 3, sd > 0 ? 0.02 : Math.PI - 0.02);
      const th = T.params(z + 3).h;
      P.add(box(0.5, th * 0.5, 6.05), Z.DARK, { m: M(q.pos.x, q.pos.y + th * 0.08, z + 3, 0, 0, 0), wear: 0.3 });
    }
    // janelas corridas no flanco do terraço
    for (const ang of [0.02, Math.PI - 0.02]) for (let z = zs + 14; z < zMax - 8; z += 3.1) {
      if (rng.chance(0.22)) continue;
      const q = T.at(z, ang);
      const m = onSurface(q.pos.addScaledVector(q.normal, 0.3), q.normal);
      bp.parts.glowPart(box(1.6, 0.06, 0.55).applyMatrix4(m), rng.chance(0.15) ? [0.7, 0.85, 1.0] : [1.0, 0.8, 0.5], rng.range(2.5, 5));
    }
    prevTop = (z) => { const p = T.params(z); return z < zs ? base(z) : (p.y || 0) + p.h; };
  }
  bp.tiers = tiers;
  const topAt = prevTop;
  // superestruturas em aglomerados (cidade de greebles) nos conveses e no dorso:
  // um bloco-mãe, satélites menores, radiadores em pente, canos e luzes
  const nClusters = carrier ? 72 : 46;
  for (let i = 0; i < nClusters; i++) {
    const sf = rng.chance(0.4) ? surfs[0] : surfs[1 + Math.floor(rng.next() * (surfs.length - 1))];
    const zLo = sf.L.stations[0].z + 14, zHi = zMax - 16;
    const zc = rng.range(zLo, zHi);
    const side = rng.chance(0.5) ? 1 : -1;
    const ac = Math.PI / 2 - side * rng.range(sf.a0, sf.a1);
    const n = rng.int(3, 7);
    for (let k = 0; k < n; k++) {
      const z = zc + (k === 0 ? 0 : rng.range(-14, 14) * sf.w);
      const a = ac + (k === 0 ? 0 : rng.range(-0.08, 0.08));
      const q = sf.L.at(z, a);
      const big = k === 0;
      const w = (big ? rng.range(8, 16) : rng.range(2, 7)) * S * sf.w, h = (big ? rng.range(3, 7) : rng.range(1, 4)) * sf.w, d = (big ? rng.range(12, 26) : rng.range(3, 10)) * sf.w;
      const zone = big ? rng.pick([Z.PRIMARY, Z.PRIMARY, Z.SECONDARY]) : rng.pick([Z.PRIMARY, Z.DARK, Z.METAL, Z.PRIMARY]);
      const bm = onSurface(q.pos, q.normal, rng.chance(0.25) ? Math.PI / 2 : 0);
      P.add(box(w, h, d, Math.min(0.8, h * 0.18)), zone, { m: bm.clone().multiply(M(0, h / 2 - 0.4, 0)), wear: 0.5, detail: !big });
      if (big) {
        // degrau superior e friso
        P.add(box(w * 0.7, h * 0.4, d * 0.6, 0.3), Z.PRIMARY, { m: bm.clone().multiply(M(0, h + h * 0.2 - 0.4, -d * 0.1)), wear: 0.4 });
        P.add(box(w + 0.3, 0.35, d + 0.3), Z.TRIM, { m: bm.clone().multiply(M(0, h - 0.4, 0)), detail: true });
        // janelas na face
        for (let j = 0; j < Math.floor(d / 3); j++) P.glowPart(box(0.25, 0.5, 1.4).applyMatrix4(bm.clone().multiply(M(w / 2 + 0.05, h * 0.55, -d / 2 + 1.5 + j * 3))), [1.0, 0.82, 0.55], 4);
      } else if (rng.chance(0.4)) {
        // radiador em pente
        const fins = rng.int(4, 9);
        for (let f = 0; f < fins; f++) P.add(box(w, h * 1.4, 0.25), Z.METAL, { m: bm.clone().multiply(M(0, h * 0.7, -d / 2 + (f + 0.5) * d / fins)), detail: true });
      }
      if (rng.chance(0.3)) P.add(vent(w * 0.7, d * 0.5, 6, 0.5), Z.DARK, { m: bm.clone().multiply(M(0, h - 0.1, 0)), detail: true });
      if (rng.chance(0.15)) P.light(q.pos.clone().addScaledVector(q.normal, h + 0.4), rng.chance(0.5) ? [1.0, 0.3, 0.1] : style.glow, 30, 0.45, rng.chance(0.4) ? -0.5 : 0);
      if (rng.chance(0.12)) P.add(antenna(rng.range(4, 12), 0.18), Z.METAL, { m: bm.clone().multiply(M(w * 0.3, h - 0.3, 0)), detail: true });
    }
  }
  // placas de blindagem sobrepostas no dorso (relevo em grande escala)
  for (let i = 0; i < (carrier ? 90 : 60); i++) {
    const sf = rng.chance(0.55) ? surfs[0] : surfs[1 + Math.floor(rng.next() * (surfs.length - 1))];
    const z = rng.range(sf.L.stations[0].z + 20, zMax - 20);
    const a = Math.PI / 2 + rng.range(-1, 1) * (sf === surfs[0] ? 1.0 : 0.45);
    const q = sf.L.at(z, a);
    const pz = rng.next(); P.add(box(rng.range(8, 22) * sf.w, 1.4, rng.range(10, 34) * sf.w, 0.4), pz < 0.62 ? Z.PRIMARY : pz < 0.9 ? Z.SECONDARY : Z.METAL, { m: onSurface(q.pos, q.normal), wear: 0.6 });
  }
  if (carrier) {
    // pista de pouso no convés de proa: faixas escuras, luzes de aproximação e círculos de pouso
    for (const x of [-26, 26]) {
      for (let z = zMin + 60; z < -262; z += 6) {
        const q = L.at(z, Math.PI / 2 - x / 140);
        P.add(box(14, 0.25, 6.2), Z.DARK, { m: onSurface(q.pos, q.normal) });
        if (Math.round(z / 6) % 2 === 0) for (const sx of [-6.5, 6.5]) P.light(q.pos.clone().add(V(sx, 0.4, 0)), [1.0, 0.75, 0.35], 25, 0.35, 0);
      }
    }
    for (let k = 0; k < 4; k++) {
      const z = -240 + k * 120, q = L.at(z, Math.PI / 2 - (k % 2 ? 0.8 : -0.8));
      P.add(torusZ(9, 0.5, 32).rotateX(Math.PI / 2), Z.TRIM, { m: onSurface(q.pos, q.normal).multiply(M(0, 0.3, 0)) });
      bp.parts.glowPart(torusZ(7.6, 0.18, 32).rotateX(Math.PI / 2), [1.0, 0.7, 0.3], 3, { m: onSurface(q.pos, q.normal).multiply(M(0, 0.45, 0)) });
    }
  }
  // espinha central: canaleta escura com luzes de pista no dorso principal
  for (let z = zMin + 70; z < zMax - 30; z += 9) {
    if (z > -100) break;
    const q = L.at(z, Math.PI / 2);
    P.add(box(5, 1.2, 9.2), Z.DARK, { m: onSurface(q.pos, q.normal) });
    P.light(q.pos.clone().addScaledVector(q.normal, 0.8), style.glow, 20, 0.35, 0);
  }
  // placas de blindagem no flanco inferior
  for (let i = 0; i < 70; i++) {
    const z = rng.range(zMin + 70, zMax - 20), a = rng.chance(0.5) ? rng.range(-0.7, -0.15) : Math.PI + rng.range(0.15, 0.7);
    const q = L.at(z, a);
    P.add(box(rng.range(10, 24), 0.8, rng.range(10, 30)), rng.pick([Z.PRIMARY, Z.PRIMARY, Z.METAL]), { m: onSurface(q.pos, q.normal), wear: 0.7 });
  }
  // ponte de comando
  const bz = zMax - (carrier ? 160 : 110);
  const top = topAt(bz) - 1;
  const tower = loft([
    { z: bz - 40, w: 6, h: 2, hb: 1, y: top + 2, e: 4 },
    { z: bz - 28, w: 16, h: 18, hb: 1, y: top + 2, e: 5 },
    { z: bz + 10, w: 20, h: 26, hb: 1, y: top + 2, e: 5 },
    { z: bz + 30, w: 16, h: 22, hb: 1, y: top + 2, e: 5 },
    { z: bz + 36, w: 8, h: 8, hb: 1, y: top + 2, e: 4 },
  ], { seg: 28, sub: 3 });
  P.add(tower.geo, Z.PRIMARY, { wear: 0.3 });
  P.add(box(34, 5, 14, 1.2), Z.PRIMARY, { m: M(0, top + 30, bz - 6) });
  P.add(box(34.4, 1.6, 14.4), Z.TRIM, { m: M(0, top + 32.8, bz - 6) });
  // janelas da ponte (faixa contínua)
  bp.parts.glowPart(box(32, 1.2, 0.3), [1.0, 0.85, 0.6], 6, { m: M(0, top + 30.5, bz - 13.2) });
  for (const s of [1, -1]) bp.parts.glowPart(box(0.3, 1.2, 12), [1.0, 0.85, 0.6], 5, { m: M(s * 17.1, top + 30.5, bz - 6) });
  P.add(antenna(26, 0.5), Z.METAL, { m: M(4, top + 35, bz - 2), detail: true });
  P.add(antenna(18, 0.4), Z.METAL, { m: M(-6, top + 35, bz + 2), detail: true });
  P.add(dish(7), Z.METAL, { m: M(0, top + 27, bz + 24, -0.6, 0, 0), detail: true });
  P.add(sphere(5, 20, 10, Math.PI * 2, Math.PI / 2), Z.METAL, { m: M(-10, top + 28, bz + 16) });
  bp.eye = V(0, top + 30.5, bz - 10);
  // janelas espalhadas pelo casco
  windowRows(bp, L, { z0: zMin + 90, z1: zMax - 30, a: 0.18, rows: 2, spacing: 4.6, size: 1.1, rng });
  windowRows(bp, L, { z0: zMin + 120, z1: zMax - 40, a: 0.55, rows: 1, spacing: 7, size: 1.4, rng, color: [0.8, 0.9, 1.0] });
  // motores
  const ez = zMax;
  const engs = carrier ? [[0, 0, 22], [-48, -2, 17], [48, -2, 17], [-24, 14, 15], [24, 14, 15], [-24, -16, 15], [24, -16, 15]] : [[0, 0, 19], [-36, -2, 15], [36, -2, 15], [-18, 13, 12], [18, 13, 12]];
  for (const [x, y, r] of engs) engine(bp, { x, y, z0: ez - 30, z1: ez + 4, r, style, ringZone: Z.TRIM, plume: r * 7, nozzleLen: r * 0.9 });
  P.add(box(st[st.length - 1].w * 1.7, st[st.length - 1].h * 1.6, 8, 2), Z.DARK, { m: M(0, 0, ez - 2) });
  // hangares
  if (carrier) {
    for (const s of [1, -1]) {
      const hz = -40, hw = 70, hh = 22;
      const x = s * (L.params(hz).w - 4);
      // moldura
      P.add(box(10, hh + 10, hw + 10), Z.TRIM, { m: M(x, -2, hz), wear: 0.3 });
      P.add(box(6, hh, hw), Z.DARK, { m: M(x - s * 2.5, -2, hz) });
      // interior iluminado: piso, teto, nervuras
      for (let k = 0; k < 8; k++) bp.parts.glowPart(box(1, 0.4, hw * 0.9), [1.0, 0.85, 0.6], 4, { m: M(x - s * 4, -2 + hh * 0.45 - k * 0.2, hz - hw * 0.45 + k * hw * 0.13) });
      for (let k = 0; k < 6; k++) bp.parts.glowPart(box(1.2, hh * 0.9, 0.6), [0.55, 0.75, 1.0], 2.2, { m: M(x - s * 5, -2, hz - hw * 0.42 + k * hw * 0.168) });
      bp.parts.glowPart(box(0.4, hh * 0.92, hw * 0.92), [0.25, 0.45, 1.0], 0.9, { m: M(x + s * 2.6, -2, hz) });
      bp.hangars.push({ id: s > 0 ? 'hangar_d' : 'hangar_e', pos: V(x + s * 8, -2, hz), dir: V(s, 0, 0), size: V(hh, hh, hw) });
    }
    // tubos de lançamento na proa
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 16;
      P.add(cylZ(5, 5, 60, 16), Z.DARK, { m: M(x, -18, -300) });
      bp.parts.glowPart(new THREE.CircleGeometry(3.6, 16).rotateY(Math.PI), [0.6, 0.8, 1.0], 3, { m: M(x, -18, -330.5) });
      bp.hangars.push({ id: `tubo${i}`, pos: V(x, -18, -335), dir: V(0, 0, -1), size: V(8, 8, 60) });
    }
  } else {
    const hz = 60, hw = 46, hh = 14;
    P.add(box(hw + 10, 4, hh * 2 + 10), Z.TRIM, { m: M(0, -L.params(hz).hb + 1, hz) });
    for (let k = 0; k < 5; k++) bp.parts.glowPart(box(hw * 0.8, 0.3, 0.8), [1.0, 0.85, 0.6], 3.5, { m: M(0, -L.params(hz).hb - 1.2, hz - hh + k * hh * 0.5) });
    bp.parts.glowPart(box(hw * 0.95, 0.3, hh * 1.9), [0.25, 0.45, 1.0], 0.7, { m: M(0, -L.params(hz).hb - 2.6, hz) });
    bp.hangars.push({ id: 'hangar', pos: V(0, -L.params(hz).hb - 6, hz), dir: V(0, -1, 0), size: V(hw, 8, hh * 2) });
  }
  // torres
  const tz = carrier ? [-260, -180, -100, 60, 140, 260] : [-200, -150, -90, -30, 30, 120, 200];
  for (const z of tz) {
    for (const s of [1, -1]) {
      const a = Math.PI / 2 - s * (carrier ? 0.75 : 0.62);
      const q = L.at(z, a);
      turret(bp, q.pos.addScaledVector(q.normal, -0.5), q.normal, carrier ? 7 : 6.5, z < 0 && !carrier ? 'heavy' : 'medium', style);
    }
  }
  for (const z of [-60, 100, 220]) {
    for (const s of [1, -1]) {
      const q = L.at(z, -Math.PI / 2 + s * 0.4);
      turret(bp, q.pos, q.normal, 3.5, 'pd', style);
    }
  }
  // dorsal pesado na linha central (destróier)
  if (!carrier) for (const z of [-170, -110]) { const q = L.at(z, Math.PI / 2); turret(bp, q.pos, q.normal, 9, 'heavy', style); }
  // luzes
  navLights(bp, style, { tip: V(st[3].w + 1, 0, 0), strobes: [V(0, top + 48, bz - 2), V(0, -st[3].hb - 2, 0)], beacon: V(0, top + 36, bz + 4), size: 1.4 });
  for (let i = 0; i < 12; i++) { const q = L.at(zMin + 40 + i * (zMax - zMin - 60) / 12, 0.05); P.light(q.pos.addScaledVector(q.normal, 0.5), style.glow, 25, 0.8, 0, { mirror: true }); }
  bp.colliders.push({ center: V(0, 0, (zMin + zMax) / 2), half: V(st[3].w, st[3].h, (zMax - zMin) / 2) });
  bp.length = zMax - zMin; bp.radius = (zMax - zMin) * 0.55;
}
