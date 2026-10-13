// Outras arquiteturas de estação:
//   platform  Plataforma Tharsos — refinaria flutuante no gigante gasoso:
//             convés hexagonal, plataformas de pouso abertas em braços,
//             chaminés com chama, esferas de gás, repulsores e o tubo coletor
//             que desce até as nuvens.
//   rebel     Refúgio Cinza — base da Frente Livre escavada num asteroide:
//             rocha com face cortada, boca de hangar, módulos aparafusados,
//             andaimes, painéis remendados.
//   military  postos da Hegemonia (Bastião Halden) — agulha angular branca e
//             dourada, coroa de aletas, torres de canhão, fenda de hangar.
//   generic   estação comercial/entreposto menor.
//
// Cada uma exporta { layout(st) → {radius, bays}, build(st, opts) → {kit, ring?, animate?} }.
import * as THREE from 'three/webgpu';
import { Kit, V3, mat, rng } from './geo.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE as Z } from './materials.js';
import { greebleRect, tankRing, dish, mast, radiator, solarWing, nozzle, lightRing, dockMouth, portholes } from './modules.js';
import { bayCavity } from './meridiana.js';

const TAU = Math.PI * 2;
const L = 'hull';

function hangarBay(index, number, pad, out, up, w, h, d, mouthDist, hover = 6) {
  const mouth = pad.clone().addScaledVector(out, d / 2).addScaledVector(up, h * 0.42);
  return {
    index, number, kind: 'hangar', pad, up, out, fwd: out.clone().negate(), w, h, d, hover,
    path: [mouth.clone().addScaledVector(out, mouthDist), mouth.clone().addScaledVector(out, mouthDist * 0.33), mouth.clone().addScaledVector(out, 90), mouth.clone(), pad.clone().addScaledVector(up, hover + 1)],
  };
}
function padBay(index, number, pad, up, fwd, hover = 8) {
  return {
    index, number, kind: 'pad', pad, up, out: up.clone(), fwd, w: 52, h: 40, d: 52, hover,
    path: [pad.clone().addScaledVector(up, 1400).addScaledVector(fwd, -900), pad.clone().addScaledVector(up, 380).addScaledVector(fwd, -200), pad.clone().addScaledVector(up, 70), pad.clone().addScaledVector(up, hover + 1)],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Plataforma Tharsos
export const buildPlatform = {
  layout() {
    const bays = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 6;
      const n = V3(Math.sin(a), 0, Math.cos(a));
      bays.push(padBay(i, i + 1, n.clone().multiplyScalar(250).setY(6), V3(0, 1, 0), n.clone().negate()));
    }
    return { radius: 420, bays };
  },
  build(st, { lite }) {
    const k = new Kit(st.seed || 99);
    // convés hexagonal em dois níveis
    k.cyl(L, 180, 186, 12, V3(0, -6, 0), null, Z.PAINT, 6);
    k.cyl(L, 186, 186, 2, V3(0, -12.5, 0), null, Z.DARK, 6);
    k.cyl(L, 176, 176, 0.4, V3(0, 0.2, 0), null, Z.DARK, 6);
    k.cyl(L, 150, 172, 26, V3(0, -26, 0), null, Z.PAINT, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const n = V3(Math.sin(a), 0, Math.cos(a));
      k.box(L, 6, 1.2, 330, n.clone().multiplyScalar(0).setY(0.6), [0, a, 0], Z.HAZARD);
      greebleRect(k, L, n.clone().multiplyScalar(110).setY(0.4), V3().crossVectors(V3(0, 1, 0), n), n, V3(0, 1, 0), 60, 50, 0.04, 1.6);
    }
    lightRing(k, 1.2, 182, 36, [12, 9, 4], 0.6, 0);
    lightRing(k, -13, 186, 24, [12, 0.6, 0.3], 0.8, 0.6);
    // braços com plataformas de pouso
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 6;
      const n = V3(Math.sin(a), 0, Math.cos(a));
      const c = n.clone().multiplyScalar(250);
      k.truss(L, n.clone().multiplyScalar(170).setY(-6), c.clone().setY(-6), 10, 1.2, 12, Z.DARK);
      k.box(L, 14, 4, 80, n.clone().multiplyScalar(212).setY(2), [0, a, 0], Z.PAINT);
      k.cyl(L, 30, 32, 6, c.clone().setY(3), null, Z.DARK, 40);
      k.cyl(L, 28, 28, 0.6, c.clone().setY(6.1), null, Z.PAINT, 40);
      k.torus(L, 22, 0.35, c.clone().setY(6.4), Z.HAZARD, 64, 6);
      k.box(L, 2, 0.3, 18, c.clone().setY(6.5).addScaledVector(V3(Math.cos(a), 0, -Math.sin(a)), -6), [0, a, 0], Z.HAZARD);
      k.box(L, 2, 0.3, 18, c.clone().setY(6.5).addScaledVector(V3(Math.cos(a), 0, -Math.sin(a)), 6), [0, a, 0], Z.HAZARD);
      k.box(L, 12, 0.3, 2, c.clone().setY(6.5), [0, a, 0], Z.HAZARD);
      for (let j = 0; j < 16; j++) { const b = (j / 16) * TAU; k.light(c.clone().add(V3(Math.sin(b) * 29.5, 6.6, Math.cos(b) * 29.5)), [1.2, 6, 3], 0.4, -0.6, j / 16); }
      k.cyl(L, 6, 9, 30, c.clone().setY(-18), null, Z.METAL, 20);
      nozzle(k, L, c.clone().setY(-34), V3(0, -1, 0), 8, L);
      // torre de sinalização da plataforma
      k.cyl(L, 1, 1.4, 24, c.clone().addScaledVector(n, 31).setY(14), null, Z.DARK, 8);
      k.light(c.clone().addScaledVector(n, 31).setY(27), [12, 9, 2], 0.9, 0.9);
    }
    // refinaria: chaminés, colunas e esferas
    const r = rng(st.seed || 5);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3, rr = 60 + r() * 50;
      const p = V3(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      const h = 40 + r() * 70, rad = 4 + r() * 6;
      k.cyl(L, rad, rad * 1.1, h, p.clone().setY(h / 2), null, i % 3 ? Z.METAL : Z.PAINT, 20);
      for (let j = 1; j < h / 12; j++) k.torus(L, rad * 1.15, 0.5, p.clone().setY(j * 12), Z.DARK, 24, 4);
      k.cyl(L, rad * 1.3, rad * 1.3, 3, p.clone().setY(h), null, Z.DARK, 20);
      k.light(p.clone().setY(h + 2), [12, 0.6, 0.3], 0.7, 0.7);
    }
    tankRing(k, L, 18, 40, 6, 13, true);
    // edifício de controle
    k.box(L, 60, 26, 40, V3(-40, 13, -30), [0, 0.5, 0], Z.PAINT);
    k.box(L, 61, 6, 41, V3(-40, 20, -30), [0, 0.5, 0], Z.WINDOW);
    k.box(L, 50, 6, 30, V3(-40, 29, -30), [0, 0.5, 0], Z.ACCENT);
    mast(k, L, V3(-40, 32, -30), V3(0, 1, 0), 60, 1.5);
    dish(k, L, V3(-62, 34, -18), V3(0.6, 1, 0.3).normalize(), 9);
    // chaminé de queima (a chama é animada à parte)
    k.cyl(L, 3, 4, 140, V3(120, 70, -40), null, Z.DARK, 16);
    k.truss(L, V3(120, 0, -40), V3(120, 140, -40), 12, 0.8, 10, Z.DARK);
    // repulsores sob o convés
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const p = V3(Math.sin(a) * 120, -42, Math.cos(a) * 120);
      k.torus(L, 24, 4, p, Z.DARK, 48, 10);
      k.torus(L, 20, 1.6, p.clone().add(V3(0, -2, 0)), Z.GLOW, 48, 8);
      k.cyl(L, 18, 22, 10, p.clone().add(V3(0, 4, 0)), null, Z.METAL, 32);
    }
    // tubo coletor descendo às nuvens
    k.cyl(L, 8, 8, 700, V3(0, -390, 0), null, Z.METAL, 20, null, false, 0, 14);
    for (let y = -60; y > -740; y -= 40) k.torus(L, 9, 1.4, V3(0, y, 0), Z.ACCENT, 24, 6);
    k.lathe(L, [[8, -735], [18, -760], [34, -800], [36, -806], [12, -790]], V3(), Z.PAINT, 32);
    lightRing(k, -800, 36, 12, [12, 9, 3], 0.8, 0.5);
    // chama da chaminé + luz quente
    const flame = new THREE.Group();
    const ex = { flame, animate: null };
    return {
      kit: k,
      extra: [],
      animate(t, view) { void t; void view; void ex; void lite; },
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Refúgio Cinza (asteroide)
export const buildRebel = {
  layout() {
    const pad = V3(0, -24, 150);
    return { radius: 520, bays: [hangarBay(0, 2, pad, V3(0, 0, 1), V3(0, 1, 0), 56, 24, 70, 1500, 5)] };
  },
  build(st, { lite }) {
    const k = new Kit(st.seed || 777);
    const R = 300;
    let g = new THREE.IcosahedronGeometry(R, lite ? 24 : 44);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position;
    const r = rng(st.seed || 77);
    const ph = [r() * 10, r() * 10, r() * 10];
    const noise = (x, y, z) => {
      let s = 0, a = 1, f = 1 / 160;
      for (let o = 0; o < 5; o++) { s += a * Math.sin(x * f + ph[0] + o) * Math.sin(y * f * 1.3 + ph[1]) * Math.sin(z * f * 0.9 + ph[2] + o * 2); a *= 0.5; f *= 2.1; }
      return s;
    };
    const zcut = 168; // face cortada (boca do hangar) em +Z
    for (let i = 0; i < p.count; i++) {
      const v = V3(p.getX(i), p.getY(i), p.getZ(i));
      const n = v.clone().normalize();
      const ridge = 1 - Math.abs(Math.sin(n.x * 9.1 + ph[0]) * Math.sin(n.y * 7.3 + ph[1]) * Math.sin(n.z * 8.2 + ph[2]));
      let rr = R * (1 + 0.22 * noise(v.x, v.y, v.z) + 0.08 * Math.sin(n.x * 3 + n.y * 2) + 0.035 * ridge * ridge + 0.012 * noise(v.x * 6, v.y * 6, v.z * 6));
      rr *= 1 + 0.25 * Math.max(0, n.x) * 0.6 - 0.12 * Math.max(0, -n.y); // alongado
      v.copy(n).multiplyScalar(rr);
      if (v.z > zcut && Math.abs(v.x) < 160 && Math.abs(v.y) < 120) v.z = zcut + Math.max(0, (Math.max(Math.abs(v.x) - 110, Math.abs(v.y) - 80)) * 0.6);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    // normais suaves ANTES de desindexar (senão a rocha fica facetada)
    g.computeVertexNormals();
    // remove os triângulos da boca do hangar
    const ng = g.toNonIndexed();
    const nn = ng.attributes.normal;
    const keepN = [];
    const pp = ng.attributes.position;
    const keep = [];
    for (let t = 0; t < pp.count; t += 3) {
      let inMouth = true;
      for (let j = 0; j < 3; j++) {
        const x = pp.getX(t + j), y = pp.getY(t + j), z = pp.getZ(t + j);
        if (!(z > zcut - 6 && Math.abs(x) < 31 && y > -26 && y < 2)) inMouth = false;
      }
      if (!inMouth) for (let j = 0; j < 3; j++) { keep.push(pp.getX(t + j), pp.getY(t + j), pp.getZ(t + j)); keepN.push(nn.getX(t + j), nn.getY(t + j), nn.getZ(t + j)); }
    }
    const rock = new THREE.BufferGeometry();
    rock.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    rock.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
    // UV em metros (projeção esférica)
    const uv = new Float32Array((keep.length / 3) * 2);
    for (let i = 0; i < keep.length / 3; i++) { const x = keep[i * 3], y = keep[i * 3 + 1], z = keep[i * 3 + 2]; uv[i * 2] = Math.atan2(x, z) * R; uv[i * 2 + 1] = y; }
    rock.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    k.add(L, rock, null, Z.ROCK);
    // boca do hangar
    const pad = V3(0, -24, 150);
    const b = { out: V3(0, 0, 1), up: V3(0, 1, 0), side: V3(1, 0, 0) };
    dockMouth(k, L, L, V3(0, -24, zcut + 2), b.out, b.up, 56, 24, 8, [2.2, 1.0, 0.4]);
    bayCavity(k, L, b, { w: 56, h: 24, d: 70 }, -24, zcut + 2 + 0);
    // placa de aço em volta da boca
    k.box(L, 120, 70, 3, V3(0, -10, zcut - 1), null, Z.RUST);
    k.box(L, 120, 4, 6, V3(0, 18, zcut + 1), null, Z.ACCENT);
    void pad;
    // módulos aparafusados à rocha
    const mods = [[V3(140, 120, 120), 0.4], [V3(-180, 80, 90), -0.5], [V3(60, 230, 40), 0.1], [V3(-90, -160, 140), 0.9], [V3(200, -60, 60), 1.3]];
    for (const [pos, yaw] of mods) {
      const n = pos.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw));
      k.push(mat(pos, q));
      k.cyl(L, 9, 9, 40, V3(0, 0, 0), [0, 0, Math.PI / 2], Z.RUST, 20);
      k.cyl(L, 9.4, 9.4, 3, V3(-12, 0, 0), [0, 0, Math.PI / 2], Z.ACCENT, 20);
      k.cyl(L, 9.4, 9.4, 3, V3(12, 0, 0), [0, 0, Math.PI / 2], Z.DARK, 20);
      k.box(L, 30, 3, 6, V3(0, 3, 8.5), null, Z.WINDOW);
      k.box(L, 6, 18, 6, V3(0, -12, 0), null, Z.DARK);
      for (let j = 0; j < 5; j++) k.light(V3(-16 + j * 8, 9.6, 0), [3.6, 2.2, 1.1], 0.4, 0);
      k.light(V3(20, 0, 0), [12, 0.5, 0.2], 0.6, 0.6);
      k.pop();
    }
    // painéis solares remendados e antenas
    solarWing(k, L, V3(220, 150, -40), V3(0.7, 0.7, -0.1).normalize(), V3(0, 0, 1), 160, 26, lite ? 3 : 5);
    solarWing(k, L, V3(-230, 140, -80), V3(-0.7, 0.6, -0.2).normalize(), V3(0, 0, 1), 140, 26, lite ? 3 : 5);
    mast(k, L, V3(30, 300, -20), V3(0.1, 1, -0.05).normalize(), 90, 1.8);
    dish(k, L, V3(-120, 250, 60), V3(-0.3, 1, 0.4).normalize(), 18);
    dish(k, L, V3(150, 30, 230), V3(0.6, 0.2, 1).normalize(), 12);
    // andaimes na face do hangar
    for (const s of [-1, 1]) {
      k.truss(L, V3(s * 50, -60, zcut + 4), V3(s * 50, 40, zcut + 4), 6, 0.6, 6, Z.DARK);
      k.truss(L, V3(s * 50, 40, zcut + 4), V3(s * 90, 40, zcut - 6), 6, 0.6, 6, Z.DARK);
      for (let j = 0; j < 6; j++) k.light(V3(s * 52, -50 + j * 18, zcut + 7), [4, 2.2, 1], 0.45, 0);
    }
    // luzes-guia no chão rochoso diante da boca
    for (let j = 0; j < 10; j++) for (const s of [-1, 1]) k.light(V3(s * 34, -27, zcut + 10 + j * 14), [5, 2.4, 0.8], 0.6, -0.8, 1 - j / 10);
    return { kit: k };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Posto militar da Hegemonia
export const buildMilitary = {
  layout() {
    const pad = V3(0, -140, 60);
    return { radius: 700, bays: [hangarBay(0, 1, pad, V3(0, 0, 1), V3(0, 1, 0), 70, 26, 90, 1600, 6)] };
  },
  build(st, { lite }) {
    const k = new Kit(st.seed || 55);
    // agulha central octogonal
    k.lathe(L, [[4, -620], [40, -560], [70, -420], [88, -200], [92, -150], [92, 40], [80, 200], [50, 380], [20, 520], [3, 600]], V3(), Z.PAINT, 8);
    for (const y of [-300, -150, 40, 200, 380]) k.lathe(L, [[0, y - 4], [95 - Math.abs(y) * 0.08, y - 3], [96 - Math.abs(y) * 0.08, y + 3], [0, y + 4]], V3(), Z.ACCENT, 8);
    k.lathe(L, [[93, -40], [93.2, -10]], V3(), Z.WINDOW, 8);
    k.lathe(L, [[86, 120], [86.2, 150]], V3(), Z.WINDOW, 8);
    // coroa: aletas douradas
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      const n = V3(Math.sin(a), 0, Math.cos(a));
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3().crossVectors(V3(0, 1, 0), n), V3(0, 1, 0), n));
      k.add(L, new THREE.BoxGeometry(6, 260, 120), mat(n.clone().multiplyScalar(110).setY(260), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, 0)))), i % 2 ? Z.ACCENT : Z.PAINT);
      k.light(n.clone().multiplyScalar(150).setY(390), [12, 9, 4], 0.8, 0.5);
    }
    // asas com baterias
    for (const s of [-1, 1]) {
      k.box(L, 520, 30, 120, V3(s * 300, -120, 0), [0, 0, s * 0.08], Z.PAINT);
      k.box(L, 522, 6, 122, V3(s * 300, -100, 0), [0, 0, s * 0.08], Z.ACCENT);
      k.box(L, 500, 4, 2, V3(s * 300, -120, 61), [0, 0, s * 0.08], Z.WINDOW);
      for (let j = 0; j < 4; j++) {
        const x = s * (140 + j * 110);
        k.cyl(L, 14, 16, 10, V3(x, -100 + j * s * 9 * 0, 0), null, Z.DARK, 16);
        k.box(L, 22, 10, 26, V3(x, -88, 0), null, Z.PAINT);
        k.cylZ(L, 1.6, 40, V3(x - 4, -86, 30), Z.METAL, 10);
        k.cylZ(L, 1.6, 40, V3(x + 4, -86, 30), Z.METAL, 10);
      }
      k.light(V3(s * 560, -120, 0), s < 0 ? [12, 0.5, 0.3] : [0.3, 12, 1], 1.2, 0.8);
    }
    radiator(k, L, V3(0, -420, 70), V3(0, 0, 1), V3(0, 1, 0), 200, 60);
    radiator(k, L, V3(0, -420, -70), V3(0, 0, -1), V3(0, 1, 0), 200, 60);
    // fenda do hangar
    dockMouth(k, L, L, V3(0, -140, 105), V3(0, 0, 1), V3(0, 1, 0), 70, 26, 10, [2.4, 1.8, 0.6]);
    bayCavity(k, L, { out: V3(0, 0, 1), up: V3(0, 1, 0), side: V3(1, 0, 0) }, { w: 70, h: 26, d: 90 }, -140, 105);
    k.box(L, 110, 60, 8, V3(0, -128, 100), null, Z.ACCENT);
    mast(k, L, V3(0, 600, 0), V3(0, 1, 0), 120, 2.5);
    lightRing(k, -560, 42, 8, [12, 12, 12], 0.9, 0.7);
    portholes(k, 300, 66, 24, [3.0, 2.8, 2.4], 0.5);
    void lite;
    return { kit: k };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Estação genérica (comércio / entreposto)
export const buildGeneric = {
  layout() {
    const pad = V3(0, 3, 90);
    return { radius: 380, bays: [hangarBay(0, 1, pad, V3(0, 0, 1), V3(0, 1, 0), 48, 20, 60, 1200, 5)] };
  },
  build(st, { lite }) {
    const k = new Kit(st.seed || 3);
    k.cyl(L, 40, 40, 160, V3(0, 0, 0), null, Z.PAINT, 32);
    k.cyl(L, 120, 120, 30, V3(0, 15, 0), null, Z.PAINT, 48);
    k.cyl(L, 121, 121, 8, V3(0, 18, 0), null, Z.WINDOW, 48);
    k.cyl(L, 124, 124, 2, V3(0, 30, 0), null, Z.ACCENT, 48);
    tankRing(k, L, -60, 50, 6, 12, true);
    dockMouth(k, L, L, V3(0, 3, 121), V3(0, 0, 1), V3(0, 1, 0), 48, 20, 6);
    bayCavity(k, L, { out: V3(0, 0, 1), up: V3(0, 1, 0), side: V3(1, 0, 0) }, { w: 48, h: 20, d: 60 }, 3, 121);
    solarWing(k, L, V3(40, -40, 0), V3(1, 0, 0), V3(0, 0, 1), 160, 24, lite ? 3 : 5);
    solarWing(k, L, V3(-40, -40, 0), V3(-1, 0, 0), V3(0, 0, 1), 160, 24, lite ? 3 : 5);
    mast(k, L, V3(0, 80, 0), V3(0, 1, 0), 60, 1.6);
    lightRing(k, 31, 124, 24, [12, 12, 12], 0.7, 0.6);
    const ring = new Kit((st.seed || 3) + 1);
    ring.ring(L, 230, 24, 30, -20, lite ? 32 : 64, { outer: Z.WINDOW, inner: Z.PAINT, top: Z.PAINT, bottom: Z.PAINT });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const n = V3(Math.sin(a), 0, Math.cos(a));
      ring.add(L, new THREE.BoxGeometry(10, 170, 10), mat(n.clone().multiplyScalar(130).setY(-20), new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), n)), Z.DARK);
    }
    lightRing(ring, -4, 243, 32, [0.6, 3.0, 2.6], 0.5, 0);
    return { kit: k, ring, ringPeriod: 80 };
  },
};
