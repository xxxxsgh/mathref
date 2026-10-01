/**
 * Carros civis (sedã, hatch, van) e carcaças queimadas.
 *
 * Carroceria em duas peças como num modelo de verdade: parte baixa larga
 * (perfil com caixas de roda recortadas por arcos, chanfro arredondado) e
 * estufa mais estreita (tumblehome) com vidros, colunas A/B/C e teto.
 * Vincos de porta/capô/porta-malas, maçanetas, retrovisores, limpadores,
 * faróis/lanternas, placas, para-choques, rodas com pneu de perfil
 * arredondado, aro com raios e cubo, para-lamas internos escuros.
 * Dano: furos de bala, para-brisa trincado, pneu murcho (carro adernado),
 * poeira; carcaça queimada = metal enferrujado, sem vidros, bancos em
 * esqueleto, aros no chão, cinza e fuligem em volta.
 */
import * as THREE from 'three';
import { cached, mat4 } from './geo.js';
import { cyl, torus, decal } from './shapes.js';

const KINDS = {
  sedan: {
    len: 4.5, wb: 2.62, w: 1.74, gw: 1.42, rw: 0.31,
    low: [[-2.25, 0.3], [-2.31, 0.48], [-2.28, 0.68], [-2.14, 0.79], [-1.1, 0.9], [-0.92, 0.93], [1.22, 0.95], [1.48, 0.96], [2.12, 0.93], [2.29, 0.8], [2.31, 0.52], [2.26, 0.3]],
    green: [[-0.92, 0.93], [-0.33, 1.38], [0.72, 1.4], [1.42, 0.97]],
    doors: [-0.6, 0.45, 1.35],
  },
  hatch: {
    len: 4.0, wb: 2.45, w: 1.68, gw: 1.38, rw: 0.3,
    low: [[-2.0, 0.3], [-2.06, 0.5], [-2.02, 0.7], [-1.88, 0.8], [-1.05, 0.92], [-0.95, 0.94], [1.75, 0.98], [1.98, 0.92], [2.03, 0.6], [2.0, 0.3]],
    green: [[-0.95, 0.94], [-0.42, 1.42], [1.62, 1.44], [1.92, 0.99]],
    doors: [-0.62, 0.42],
  },
  van: {
    len: 4.8, wb: 2.9, w: 1.82, gw: 1.66, rw: 0.32,
    low: [[-2.4, 0.32], [-2.44, 0.52], [-2.38, 0.86], [-2.0, 1.02], [-1.6, 1.08], [2.38, 1.08], [2.42, 0.6], [2.38, 0.32]],
    green: [[-1.6, 1.08], [-0.9, 1.88], [2.36, 1.92], [2.38, 1.08]],
    doors: [-0.75, 0.5],
  },
};
export const CAR_TINTS = [[0.85, 0.85, 0.82], [0.62, 0.64, 0.66], [0.75, 0.68, 0.55], [0.18, 0.24, 0.36], [0.55, 0.15, 0.12], [0.22, 0.22, 0.22], [0.35, 0.42, 0.3], [0.86, 0.84, 0.72]];

/** Perfil da parte baixa com caixas de roda (arcos) recortadas. */
function lowerGeo(kind) {
  return cached('carlow_' + kind, () => {
    const K = KINDS[kind];
    const ax = K.wb / 2, ar = K.rw + 0.07, ay = K.rw + 0.02;
    const sh = new THREE.Shape();
    const p = K.low;
    sh.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) sh.lineTo(p[i][0], p[i][1]);
    // fundo: de trás para frente, subindo nos arcos das rodas
    sh.lineTo(ax + ar, p[p.length - 1][1]);
    sh.absarc(ax, ay, ar, 0, Math.PI, false);
    sh.lineTo(-ax + ar, p[0][1]);
    sh.absarc(-ax, ay, ar, 0, Math.PI, false);
    sh.lineTo(p[0][0], p[0][1]);
    const w = K.w - 0.16;
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
    g.translate(0, 0, -w / 2);
    g.computeVertexNormals();
    return g;
  });
}
/** Estufa (vidros): perfil extrudado mais estreito. */
function greenGeo(kind, inset = 0) {
  return cached('cargreen_' + kind + inset, () => {
    const K = KINDS[kind];
    const pts = K.green.map(([x, y]) => new THREE.Vector2(x, y));
    const sh = new THREE.Shape(pts);
    const w = K.gw - 0.1 - inset;
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 2 });
    g.translate(0, 0, -w / 2);
    g.computeVertexNormals();
    return g;
  });
}
/** Pneu com perfil arredondado (torno). */
const tireGeo = () =>
  cached('cartire', () => {
    const pts = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push(new THREE.Vector2(0.22 + Math.cos(a) * 0.1, Math.sin(a) * 0.105));
    }
    const g = new THREE.LatheGeometry(pts, 20);
    g.rotateX(Math.PI / 2);
    return g;
  });

const UNIT = () => cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));

/**
 * Carro. opts: { kind: 'sedan'|'hatch'|'van', burnt, tint, flat (pneu
 * murcho → adernado), damage (0..1 furos/trincas), doorOpen }
 */
export function car(W, x, z, yaw, opts = {}) {
  const { B, rng } = W;
  const kind = opts.kind || rng.pick(['sedan', 'hatch', 'sedan', 'van']);
  const K = KINDS[kind];
  const burnt = !!opts.burnt;
  const tint = burnt ? [1, 1, 1] : opts.tint || rng.pick(CAR_TINTS);
  const flat = opts.flat ?? (burnt || rng.chance(0.3));
  const lift = burnt ? -0.15 : 0;
  const roll = (opts.roll || 0) + (flat ? rng.range(0.02, 0.05) * rng.sign() : 0);
  const pitch = (opts.pitch || 0) + (flat ? rng.range(-0.02, 0.02) : 0);
  const CM = mat4([x, lift, z], [pitch, yaw, roll]);
  const L = (pos, rot = [0, 0, 0], sc = [1, 1, 1]) => CM.clone().multiply(mat4(pos, rot, sc));
  const bodyMat = burnt ? 'burnt' : 'carpaint';
  const hx = K.len / 2, ax = K.wb / 2, hw = K.w / 2;

  // carroceria
  B.add(lowerGeo(kind), bodyMat, CM, { color: tint, ao: [lift + 0.3, lift + 0.85, 0.5] });
  // estufa: vidro (ou vazio queimado) + colunas + teto
  if (!burnt) B.add(greenGeo(kind), 'glass', CM, { color: [1, 1, 1] });
  // queimado: sem vidros — cabine carbonizada escura atrás das colunas
  else B.add(greenGeo(kind, 0.1), 'black', CM, { color: [0.35, 0.33, 0.3] });
  const g = K.green;
  const roofY = Math.max(g[1][1], g[2][1]);
  const pillar = (a, b, wdt = 0.08) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const s of [-1, 1]) B.add(UNIT(), bodyMat, L([mx, my, s * (K.gw / 2 - 0.02)], [0, 0, ang], [l + 0.02, wdt, 0.05]), { color: tint });
  };
  pillar(g[0], g[1]); // coluna A
  pillar(g[2], g[3], 0.12); // coluna C
  // coluna B (vertical no meio das portas)
  const bxp = K.doors[1];
  for (const s of [-1, 1]) B.add(UNIT(), bodyMat, L([bxp, (g[0][1] + roofY) / 2, s * (K.gw / 2 - 0.03)], [0, 0, 0.08], [0.09, roofY - g[0][1], 0.05]), { color: burnt ? tint : [0.08, 0.08, 0.08] });
  // teto
  B.add(UNIT(), bodyMat, L([(g[1][0] + g[2][0]) / 2, roofY + 0.015, 0], [0, 0, 0], [g[2][0] - g[1][0] + 0.06, 0.05, K.gw - 0.06]), { color: tint });

  // vincos (linhas de painel escuras, 5 mm) nas laterais
  const seam = (x0, y0, x1, y1) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, l = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
    for (const s of [-1, 1]) B.add(UNIT(), 'black', L([mx, my, s * (hw + 0.002)], [0, 0, a], [l, 0.006, 0.012]), { color: [1, 1, 1] });
  };
  if (!burnt) {
    for (const dx of K.doors) seam(dx, 0.36, dx, 0.92);
    seam(K.doors[0], 0.36, K.doors[K.doors.length - 1], 0.36);
    // capô e tampa traseira (linhas no topo)
    const hood = K.low[4];
    for (const s of [-1, 1]) B.add(UNIT(), 'black', L([(hood[0] + K.low[3][0]) / 2 + 0.3, hood[1] + 0.015, s * (hw - 0.22)], [0, 0, -0.1], [Math.abs(hood[0] - K.low[3][0]) + 0.5, 0.004, 0.006]), { color: [1, 1, 1] });
    // maçanetas
    for (const dx of K.doors.slice(0, -1)) for (const s of [-1, 1]) B.add(UNIT(), 'chrome', L([dx + 0.32, 0.82, s * (hw + 0.005)], [0, 0, 0], [0.16, 0.025, 0.02]), { color: [0.6, 0.6, 0.58] });
    // retrovisores
    for (const s of [-1, 1]) {
      B.add(UNIT(), bodyMat, L([g[0][0] + 0.18, g[0][1] + 0.08, s * (hw + 0.06)], [0, s * 0.2, 0], [0.1, 0.1, 0.16]), { color: tint });
      B.add(UNIT(), 'glass', L([g[0][0] + 0.235, g[0][1] + 0.08, s * (hw + 0.07)], [0, 0, 0], [0.01, 0.07, 0.12]), { color: [1, 1, 1] });
    }
    // limpadores
    for (const s of [-0.3, 0.3]) B.add(UNIT(), 'black', L([g[0][0] + 0.12, g[0][1] + 0.04, s], [0, 0.25, 0.55], [0.5, 0.012, 0.012]), { color: [1, 1, 1] });
  }
  // para-choques, faróis, lanternas, placas
  const fx = K.low[1][0], bx = K.low[K.low.length - 2][0];
  const bump = burnt ? [0.12, 0.1, 0.09] : kind === 'van' ? [0.25, 0.25, 0.25] : tint.map((c) => c * 0.95);
  B.add(UNIT(), 'plastic', L([fx - 0.02, 0.42, 0], [0, 0, 0], [0.16, 0.2, K.w - 0.1]), { color: bump });
  B.add(UNIT(), 'plastic', L([bx + 0.02, 0.42, 0], [0, 0, 0], [0.16, 0.2, K.w - 0.1]), { color: bump });
  if (!burnt) {
    for (const s of [-1, 1]) {
      B.add(UNIT(), 'glass', L([K.low[2][0] + 0.02, 0.66, s * (hw - 0.3)], [0, 0, 0], [0.08, 0.13, 0.36]), { color: [2.2, 2.2, 2.0] });
      B.add(UNIT(), 'plastic', L([K.low[K.low.length - 3][0] - 0.02, 0.72, s * (hw - 0.26)], [0, 0, 0], [0.08, 0.15, 0.3]), { color: [1.6, 0.18, 0.14] });
    }
    B.add(UNIT(), 'chrome', L([fx - 0.06, 0.66, 0], [0, 0, 0], [0.04, 0.12, 0.62]), { color: [0.2, 0.2, 0.2] }); // grade
    B.add(UNIT(), 'metal', L([fx - 0.11, 0.42, 0], [0, 0, 0], [0.02, 0.11, 0.5]), { color: [0.95, 0.95, 0.9] });
    B.add(UNIT(), 'metal', L([bx + 0.11, 0.5, 0], [0, 0, 0], [0.02, 0.11, 0.5]), { color: [0.95, 0.95, 0.9] });
  }
  // rodas: para-lama interno escuro, pneu, aro com raios
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wx = sx * ax, wz = sz * (hw - 0.17);
      B.add(cached('archliner', () => new THREE.CylinderGeometry(1, 1, 1, 14, 1, true, -Math.PI / 2, Math.PI)), 'black', L([wx, K.rw + 0.02, sz * (hw - 0.3)], [-Math.PI / 2, 0, 0], [K.rw + 0.06, 0.4, K.rw + 0.06]), { color: [1, 1, 1] });
      const isFlat = flat && sx === 1 && sz === 1;
      const ry = isFlat ? K.rw - 0.06 : K.rw;
      if (!burnt) {
        B.add(tireGeo(), 'rubber', L([wx, ry, wz], [0, 0, 0], [K.rw / 0.32, isFlat ? 0.75 : 1, K.rw / 0.32]), { color: [1, 1, 1] });
        B.add(cyl(14), 'chrome', L([wx, ry, wz + sz * 0.06], [Math.PI / 2, 0, 0], [0.17, 0.02, 0.17]), { color: [0.5, 0.5, 0.48] });
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          B.add(UNIT(), 'chrome', L([wx + Math.cos(a) * 0.09, ry + Math.sin(a) * 0.09, wz + sz * 0.07], [0, 0, a], [0.13, 0.035, 0.02]), { color: [0.45, 0.45, 0.43] });
        }
        B.add(cyl(8), 'chrome', L([wx, ry, wz + sz * 0.08], [Math.PI / 2, 0, 0], [0.04, 0.02, 0.04]), { color: [0.35, 0.35, 0.33] });
      } else {
        // só o aro (pneu derretido), carro apoiado nele
        B.add(torus(0.12, 14), 'burnt', L([wx, 0.34, wz], [0, 0, 0], [0.19, 0.19, 0.3]), { color: [1, 1, 1] });
        B.add(cyl(14), 'burnt', L([wx, 0.34, wz], [Math.PI / 2, 0, 0], [0.17, 0.12, 0.17]), { color: [0.8, 0.8, 0.8] });
      }
    }
  }
  // interior: bancos (escuros; esqueleto de molas no queimado)
  {
    const seatC = burnt ? [0.12, 0.1, 0.08] : [0.12, 0.11, 0.1];
    for (const sx of [-0.25, 0.7]) for (const s of [-1, 1]) {
      if (kind === 'van' && sx > 0) continue;
      B.add(UNIT(), burnt ? 'burnt' : 'fabric', L([sx, 0.62, s * 0.38], [0, 0, 0], [0.5, 0.12, 0.48]), { color: burnt ? [1, 1, 1] : seatC });
      B.add(UNIT(), burnt ? 'burnt' : 'fabric', L([sx + 0.24, 0.92, s * 0.38], [0, 0, -0.2], [0.1, 0.55, 0.46]), { color: seatC });
    }
    B.add(UNIT(), 'plastic', L([g[0][0] + 0.15, 0.9, 0], [0, 0, 0.3], [0.35, 0.12, K.gw - 0.2]), { color: burnt ? [0.08, 0.07, 0.06] : [0.15, 0.15, 0.15] });
  }
  // dano: furos de bala na lateral, para-brisa trincado
  const dmg = opts.damage ?? (burnt ? 0.6 : rng.range(0, 0.8));
  if (dmg > 0.3) {
    const side = rng.sign();
    const p = new THREE.Vector3(rng.range(-1, 1), 0.7, side * (hw + 0.012)).applyMatrix4(CM);
    decal(B, 'bullets', [p.x, p.y, p.z], side > 0 ? sideNormal(yaw, 1) : sideNormal(yaw, -1), [0.9, 0.5], [0.2, 0.3, 0.8, 0.7], rng.range(0, 6));
  }
  if (burnt) {
    decal(B, 'scorch', [x, 0.022, z], 'py', [K.len + 3, 5], [0, 0, 1, 1], -yaw);
    decal(B, 'stains', [x, 0.024, z], 'py', [K.len + 1.5, 3], [0.5, 0.5, 1, 1], -yaw);
    W.rubbleSpots.push({ p: [x, 0, z], r: 2.0, n: 10, small: true });
  } else {
    decal(B, 'stains', [x + rng.range(-0.5, 0.5), 0.022, z], 'py', [2.2, 2.2], [0, 0, 0.5, 0.5], rng.range(0, 6));
  }
  // colisor (AABB do carro rotacionado)
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, (roofY + 0.2) / 2, 0), new THREE.Vector3(K.len, roofY - 0.1, K.w)).applyMatrix4(CM);
  B.collider(box.min.toArray(), box.max.toArray(), 'carpaint', { surface: 'metal' });
  return { kind, CM };
}

/** Normal lateral do carro mais próxima de um eixo (para decalques). */
function sideNormal(yaw, s) {
  // eixo local +z do carro no mundo
  const zx = Math.sin(yaw) * s, zz = Math.cos(yaw) * s;
  if (Math.abs(zx) > Math.abs(zz)) return zx > 0 ? 'px' : 'nx';
  return zz > 0 ? 'pz' : 'nz';
}
