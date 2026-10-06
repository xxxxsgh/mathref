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
import { cyl, torus, decal, contact } from './shapes.js';
import { bulletRect } from './decals.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { treadTire, bevelBox, bevelCyl, part, vary } from './propkit.js';

/** Pneu com banda de rodagem em blocos, eixo Z (rodando no plano XY do carro). */
const carTire = (v) => cached('cartireZ' + v, () => treadTire(v, 48, 12).clone().rotateX(Math.PI / 2));

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
  // furgão: carroceria em CAIXA (perfil extrudado com chanfro arredondado),
  // não loft superelíptico — o loft deixava o baú "inflado" como um balão
  van: {
    len: 4.8, wb: 2.9, w: 1.9, gw: 1.74, rw: 0.33, box: true,
    low: [[-2.4, 0.32], [-2.42, 0.8], [-2.25, 0.99], [-1.62, 1.1], [2.42, 1.1], [2.42, 0.32]],
    green: [[-1.6, 1.08], [-0.9, 1.88], [2.36, 1.92], [2.38, 1.08]],
    doors: [-1.42, -0.18, 1.35],
  },
};
export const CAR_TINTS = [[0.85, 0.85, 0.82], [0.62, 0.64, 0.66], [0.75, 0.68, 0.55], [0.18, 0.24, 0.36], [0.55, 0.15, 0.12], [0.22, 0.22, 0.22], [0.35, 0.42, 0.3], [0.86, 0.84, 0.72]];

// ─── carroceria por LOFT de seções (superfícies curvas, não chapas) ─────
/** Interseções de uma vertical x com um polígono fechado → [min y, max y]. */
function spanAt(poly, x) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    if ((x < Math.min(x0, x1)) || (x > Math.max(x0, x1)) || x0 === x1) continue;
    const y = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return [lo, hi];
}
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * Malha de loft: `secs` = [{ x, ring: [[z, y], …] }] (mesmo nº de pontos por
 * anel). `cls(i, j, x, z, y)` → índice de grupo por quadrilátero (várias
 * geometrias: pintura, vidro, borracha…). Tampa as pontas em leque.
 */
function loft(secs, groups, cls = () => 0) {
  const M = secs[0].ring.length;
  const out = Array.from({ length: groups }, () => []);
  const V = (i, j) => { const s0 = secs[i], q = s0.ring[j % M]; return [s0.x, q[1], q[0]]; };
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      const cx = (a[0] + c[0]) / 2, cy = (a[1] + b[1] + c[1] + d[1]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
      const g = cls(i, j, cx, cz, cy);
      if (g < 0) continue;
      out[g].push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  // tampas
  for (const [i, flip] of [[0, true], [secs.length - 1, false]]) {
    const ring = secs[i].ring;
    let zc = 0, yc = 0;
    for (const q of ring) { zc += q[0]; yc += q[1]; }
    zc /= M; yc /= M;
    const ctr = [secs[i].x, yc, zc];
    const g = Math.max(0, cls(i, 0, secs[i].x, 0, yc));
    for (let j = 0; j < M; j++) {
      const a = V(i, j), b = V(i, j + 1);
      if (flip) out[g].push(...ctr, ...a, ...b);
      else out[g].push(...ctr, ...b, ...a);
    }
  }
  return out.map((pos) => {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // normais suaves: solda vértices por posição
    g = mergeByPos(g);
    g.computeVertexNormals();
    return g;
  });
}
function mergeByPos(g) {
  const P = g.attributes.position;
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = Math.round(x * 2000) + ',' + Math.round(y * 2000) + ',' + Math.round(z * 2000);
    let j = map.get(k);
    if (j === undefined) { j = verts.length / 3; map.set(k, j); verts.push(x, y, z); }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  o.setIndex(idx);
  return o;
}
/** Abscissas com espaçamento cosseno (densas nas pontas arredondadas). */
function xsamples(x0, x1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos((i / n) * Math.PI)));
  return out;
}

/** Parte baixa: seções superelípticas, ombro arredondado, cantos em planta, arcos de roda. */
function lowerGeo(kind) {
  return cached('carlow3_' + kind, () => {
    const K = KINDS[kind];
    const ax = K.wb / 2, ar = K.rw + 0.08, ay = K.rw + 0.02;
    let xmin = Infinity, xmax = -Infinity;
    for (const [x] of K.low) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    const M = 28, hw0 = K.w / 2;
    const secs = [];
    for (const x of xsamples(xmin + 0.004, xmax - 0.004, 46)) {
      let [b, t] = spanAt(K.low, x);
      // caixa de roda: o fundo sobe no arco
      for (const wx of [-ax, ax]) {
        const d = Math.abs(x - wx);
        if (d < ar) b = Math.max(b, ay + Math.sqrt(ar * ar - d * d));
      }
      if (t - b < 0.02) b = t - 0.02;
      const endD = x > 0 ? xmax - x : x - xmin;
      const e = Math.max(0, 1 - endD / 0.7);
      const hw = hw0 * (1 - 0.17 * Math.pow(e, 1.8));
      const mid = (t + b) / 2, hh = (t - b) / 2;
      const ring = [];
      for (let j = 0; j < M; j++) {
        const th = (j / M) * Math.PI * 2;
        const c = Math.cos(th), sn = Math.sin(th);
        const up = sn > 0;
        let z = hw * spow(c, up ? 0.55 : 0.3);
        const y = mid + hh * spow(sn, up ? 0.5 : 0.2);
        // tumblehome: lateral fecha um pouco acima da linha de cintura
        z *= 1 - 0.045 * Math.max(0, (y - mid) / Math.max(hh, 0.01));
        ring.push([z, y]);
      }
      secs.push({ x, ring });
    }
    return loft(secs, 1)[0];
  });
}
/**
 * Estufa: 0 = vidro, 1 = pintura (teto, colunas, calhas), 2 = borracha
 * (vedação). Seção trapezoidal arredondada estreitando para cima.
 */
function greenGeo(kind, inset = 0) {
  return cached('cargreen2_' + kind + inset, () => {
    const K = KINDS[kind];
    const g = K.green;
    const M = 24;
    const x0 = g[0][0], x3 = g[g.length - 1][0];
    const roof0 = g[1][0], roof1 = g[2][0];
    const bx = K.doors[1];
    const hwB = (K.gw - inset) / 2, hwT = hwB - 0.13;
    const secs = [];
    const xs = xsamples(x0 + 0.01, x3 - 0.01, 40);
    for (const x of xs) {
      let [b, t] = spanAt(g, x);
      b -= 0.04;
      if (t - b < 0.02) t = b + 0.02;
      const mid = (t + b) / 2, hh = (t - b) / 2;
      const ring = [];
      for (let j = 0; j < M; j++) {
        const th = (j / M) * Math.PI * 2;
        const c = Math.cos(th), sn = Math.sin(th);
        const y = mid + hh * spow(sn, 0.28);
        const k = (y - b) / Math.max(0.01, t - b);
        const hw = hwB + (hwT - hwB) * k;
        ring.push([hw * spow(c, 0.3), y]);
      }
      secs.push({ x, ring });
    }
    return loft(secs, 3, (i, j, x, z, y) => {
      const th = ((j + 0.5) / M) * Math.PI * 2;
      const sn = Math.sin(th), c = Math.abs(Math.cos(th));
      if (sn < -0.2) return 1; // fundo (escondido)
      const [bb, tt] = spanAt(g, x);
      const roof = x > roof0 + 0.06 && x < roof1 - 0.06;
      if (sn > 0.93) return roof ? 1 : 0; // topo: teto pintado ou para-brisa/vigia
      if (sn > 0.55 && c > 0.3) return 1; // calha/coluna A e C (canto)
      // laterais
      if (y < bb + 0.025) return 2; // vedação de borracha
      if (Math.abs(x - bx) < 0.055) return 1; // coluna B
      if (kind === 'van' && x > bx) return 1; // furgão: baú sem janelas laterais
      if (x < roof0 + 0.12 && kind !== 'van') return 1; // coluna C larga
      void tt;
      return 0;
    });
  });
}
/**
 * Furgão: perfil lateral (capô curto, para-brisa inclinado, baú reto) com
 * arcos de roda recortados, extrudado na largura com chanfro arredondado de
 * 7 cm — arestas vivas mas suaves como chapa estampada. Devolve
 * [pintura, vidros] (para-brisa + janelas das portas da cabine).
 */
function flipFaces(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  const P = ng.attributes.position;
  for (let i = 0; i < P.count; i += 3) {
    const x = P.getX(i + 1), y = P.getY(i + 1), z = P.getZ(i + 1);
    P.setXYZ(i + 1, P.getX(i + 2), P.getY(i + 2), P.getZ(i + 2));
    P.setXYZ(i + 2, x, y, z);
  }
  ng.computeVertexNormals();
  return ng;
}
function vanGeo() {
  return cached('vanbody3', () => {
    const K = KINDS.van;
    const ax = K.wb / 2, ar = K.rw + 0.06, ay = 0.36, bt = 0.07;
    const sh = new THREE.Shape();
    sh.moveTo(2.35, 0.36);
    sh.lineTo(ax + ar, 0.36);
    sh.absarc(ax, ay, ar, 0, Math.PI, false);
    sh.lineTo(-ax + ar, 0.36);
    sh.absarc(-ax, ay, ar, 0, Math.PI, false);
    sh.lineTo(-2.33, 0.36);
    sh.lineTo(-2.35, 0.78);
    sh.quadraticCurveTo(-2.33, 0.93, -2.18, 0.96);
    sh.lineTo(-1.6, 1.06);
    sh.lineTo(-0.98, 1.84);
    sh.quadraticCurveTo(-0.9, 1.9, -0.75, 1.9);
    sh.lineTo(2.3, 1.9);
    sh.lineTo(2.35, 1.86);
    sh.lineTo(2.35, 0.36);
    const depth = K.w - 2 * bt;
    const paint = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments: 10, steps: 1 });
    paint.translate(0, 0, -depth / 2);
    paint.deleteAttribute('uv');
    // vidros: para-brisa no plano inclinado + janelas das portas (as duas laterais)
    const glass = [];
    const d = new THREE.Vector2(-0.98 - -1.6, 1.84 - 1.06).normalize();
    const n = new THREE.Vector3(-d.y, d.x, 0); // normal para fora (frente/cima)
    // plano XZ (normal +Y) girado para a normal do para-brisa
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const wsg = new THREE.PlaneGeometry(Math.hypot(0.62, 0.78) - 0.08, depth - 0.1).rotateX(-Math.PI / 2);
    wsg.applyQuaternion(q);
    const mid = new THREE.Vector3((-1.6 + -0.98) / 2, (1.06 + 1.84) / 2, 0).addScaledVector(n, bt + 0.004);
    wsg.translate(mid.x, mid.y, mid.z);
    glass.push(wsg.toNonIndexed());
    const win = new THREE.Shape();
    win.moveTo(-1.38, 1.2);
    win.lineTo(-0.22, 1.2);
    win.lineTo(-0.22, 1.78);
    win.lineTo(-0.86, 1.78);
    win.lineTo(-1.38, 1.2);
    const wg = new THREE.ShapeGeometry(win);
    wg.deleteAttribute('uv');
    const zr = depth / 2 + bt + 0.003;
    glass.push(wg.clone().translate(0, 0, zr).toNonIndexed());
    glass.push(flipFaces(wg.clone().translate(0, 0, -zr)));
    for (const g of glass) { if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.normal) g.computeVertexNormals(); }
    const pg = paint.index ? paint.toNonIndexed() : paint;
    pg.computeVertexNormals();
    return [pg, mergeSimpleGeos(glass)];
  });
}
function mergeSimpleGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
/** Para-choque arredondado. */
const bumperGeo = () => cached('carbumper', () => new RoundedBoxGeometry(1, 1, 1, 3, 0.18));
/** Aro de aço estampado (perfil em torno: aba, prato fundo, cubo). */
const rimGeo = () =>
  cached('carrim', () => {
    const pr = [[0.04, 0.05], [0.07, 0.055], [0.1, 0.035], [0.135, 0.02], [0.16, 0.03], [0.175, 0.055], [0.19, 0.06], [0.2, 0.0], [0.19, -0.06]];
    const g = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 22);
    g.rotateX(Math.PI / 2);
    return g;
  });

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
/** Caixa unitária com as faces voltadas para dentro (forro de cabine). */
const innerBox = () =>
  cached('innerbox', () => {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal;
    // inverte o sentido de cada triângulo e a normal
    for (let i = 0; i < P.count; i += 3) {
      for (const A of [P, N]) {
        const x = A.getX(i + 1), y = A.getY(i + 1), z = A.getZ(i + 1);
        A.setXYZ(i + 1, A.getX(i + 2), A.getY(i + 2), A.getZ(i + 2));
        A.setXYZ(i + 2, x, y, z);
      }
      if (g.attributes.uv) {
        const U = g.attributes.uv;
        const u = U.getX(i + 1), v = U.getY(i + 1);
        U.setXY(i + 1, U.getX(i + 2), U.getY(i + 2));
        U.setXY(i + 2, u, v);
      }
    }
    for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    return g;
  });

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

  // carroceria (loft: superfícies curvas com ombro, cantos arredondados em planta)
  if (K.box) {
    const [vp, vg] = vanGeo();
    B.add(vp, bodyMat, CM, { color: tint, ao: [lift + 0.3, lift + 0.8, 0.55] });
    B.add(vg, burnt ? 'black' : 'carglass', CM, { color: burnt ? [0.3, 0.28, 0.26] : [1, 1, 1] });
  } else {
    B.add(lowerGeo(kind), bodyMat, CM, { color: tint, ao: [lift + 0.3, lift + 0.8, 0.55] });
    // estufa: vidro reflexivo (transparente: bancos e o outro lado aparecem) +
    // teto/colunas/calhas na cor da carroceria + vedação de borracha
    const gg = greenGeo(kind);
    if (!burnt) B.add(gg[0], 'carglass', CM, { color: [1, 1, 1] });
    else B.add(greenGeo(kind, 0.12)[0], 'black', CM, { color: [0.3, 0.28, 0.26] });
    B.add(gg[1], bodyMat, CM, { color: tint });
    B.add(gg[2], 'black', CM, { color: [0.5, 0.5, 0.5] });
  }
  const g = K.green;
  const roofY = Math.max(g[1][1], g[2][1]);
  // superfície lateral em (x, y) — para colar vincos, frisos e maçanetas
  const sz = (xx, yy) => sideZ(K, xx, yy) + 0.003;

  // vincos (linhas de painel escuras) seguindo a curvatura lateral
  const seam = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.08));
    for (let k = 0; k < n; k++) {
      const xa = x0 + ((x1 - x0) * k) / n, ya = y0 + ((y1 - y0) * k) / n;
      const xb = x0 + ((x1 - x0) * (k + 1)) / n, yb = y0 + ((y1 - y0) * (k + 1)) / n;
      const mx = (xa + xb) / 2, my = (ya + yb) / 2, l = Math.hypot(xb - xa, yb - ya), a = Math.atan2(yb - ya, xb - xa);
      for (const s of [-1, 1]) B.add(UNIT(), 'black', L([mx, my, s * sz(mx, my)], [0, 0, a], [l + 0.004, 0.006, 0.01]), { color: [1, 1, 1] });
    }
  };
  if (!burnt) {
    for (const dx of K.doors) seam(dx, 0.38, dx + 0.02, K.box ? (dx < -1 ? 1.1 : 1.84) : g[0][1] - 0.03);
    // furgão: trilho da porta corrediça e emenda horizontal do teto da cabine
    if (K.box) seam(-0.18, 1.86, 1.35, 1.86);
    // friso de borracha lateral (proteção de porta) e soleira escura
    for (const s of [-1, 1]) {
      const xs0 = K.doors[0] - 0.05, xs1 = K.doors[K.doors.length - 1] + 0.05;
      for (let x = xs0; x < xs1 - 0.01; x += 0.25) {
        const xm = Math.min(xs1, x + 0.25);
        const fy = K.box ? 0.84 : 0.58;
        B.add(UNIT(), 'black', L([(x + xm) / 2, fy, s * (sz((x + xm) / 2, fy) + 0.006)], [0, 0, 0], [xm - x + 0.005, 0.045, 0.02]), { color: [0.7, 0.7, 0.7] });
      }
    }
    // maçanetas embutidas
    for (const dx of K.doors.slice(0, -1)) for (const s of [-1, 1]) B.add(UNIT(), 'chrome', L([dx + 0.32, 0.8, s * (sz(dx + 0.32, 0.8) + 0.004)], [0, 0, 0], [0.15, 0.024, 0.018]), { color: [0.6, 0.6, 0.58] });
    // retrovisores (braço + concha + espelho)
    for (const s of [-1, 1]) {
      const mx = g[0][0] + 0.2, my = g[0][1] + 0.08;
      const zb = sz(mx, g[0][1] - 0.02);
      B.add(UNIT(), bodyMat, L([mx, my - 0.05, s * (zb + 0.04)], [0, 0, 0], [0.06, 0.03, 0.09]), { color: tint });
      B.add(cached('mirror', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.3)), bodyMat, L([mx, my, s * (zb + 0.11)], [0, s * 0.15, 0], [0.11, 0.1, 0.17]), { color: tint });
      B.add(UNIT(), 'carglass', L([mx + 0.057, my, s * (zb + 0.11)], [0, s * 0.15, 0], [0.006, 0.075, 0.14]), { color: [1, 1, 1] });
    }
    // limpadores
    for (const s of [-0.3, 0.3]) B.add(UNIT(), 'black', L([g[0][0] + 0.1, g[0][1] + 0.03, s], [0, 0.25, 0.5], [0.5, 0.012, 0.012]), { color: [1, 1, 1] });
  }
  // para-choques (arredondados, envolvendo as quinas), faróis com refletor
  // cromado sob lente, lanternas, grade com aletas, placas
  let xmin = Infinity, xmax = -Infinity;
  for (const [px] of K.low) { xmin = Math.min(xmin, px); xmax = Math.max(xmax, px); }
  const bump = burnt ? [0.12, 0.1, 0.09] : kind === 'van' ? [0.22, 0.22, 0.22] : rng.chance(0.5) ? [0.16, 0.16, 0.16] : tint.map((c) => c * 0.95);
  B.add(bumperGeo(), 'plastic', L([xmin + 0.07, 0.42, 0], [0, 0, 0], [0.2, 0.2, K.w * 0.94]), { color: bump });
  B.add(bumperGeo(), 'plastic', L([xmax - 0.07, 0.42, 0], [0, 0, 0], [0.2, 0.2, K.w * 0.94]), { color: bump });
  const lens = cached('carlens', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.25));
  if (!burnt) {
    const [, tF] = spanAt(K.low, xmin + 0.06);
    const hy = Math.min(0.68, tF - 0.1);
    for (const s of [-1, 1]) {
      const zc = s * (hw - 0.3);
      B.add(UNIT(), 'chrome', L([xmin + 0.05, hy, zc], [0, 0, 0], [0.03, 0.12, 0.3]), { color: [0.85, 0.85, 0.82] });
      B.add(cyl(14), 'chrome', L([xmin + 0.035, hy, zc + s * 0.06], [0, 0, Math.PI / 2], [0.045, 0.02, 0.045]), { color: [1.2, 1.18, 1.1] });
      B.add(lens, 'carglass', L([xmin + 0.03, hy, zc], [0, 0, 0], [0.05, 0.14, 0.33]), { color: [1, 1, 1] });
      // pisca âmbar no canto
      B.add(lens, 'taillight', L([xmin + 0.06, hy - 0.11, s * (hw - 0.14)], [0, 0, 0], [0.04, 0.05, 0.12]), { color: [1.0, 0.45, 0.08] });
      const [, tR] = spanAt(K.low, xmax - 0.06);
      B.add(lens, 'taillight', L([xmax - 0.04, Math.min(0.74, tR - 0.1), s * (hw - 0.26)], [0, 0, 0], [0.05, 0.15, 0.3]), { color: [1, 0.12, 0.08] });
    }
    // grade: moldura escura + aletas cromadas
    B.add(UNIT(), 'black', L([xmin + 0.04, hy, 0], [0, 0, 0], [0.03, 0.13, 0.62]), { color: [1, 1, 1] });
    for (let k = 0; k < 3; k++) B.add(UNIT(), 'chrome', L([xmin + 0.025, hy - 0.04 + k * 0.04, 0], [0, 0, 0], [0.012, 0.012, 0.6]), { color: [0.55, 0.55, 0.52] });
    B.add(UNIT(), 'metal', L([xmin - 0.035, 0.42, 0], [0, 0, 0], [0.012, 0.11, 0.5]), { color: [0.95, 0.95, 0.9] });
    B.add(UNIT(), 'metal', L([xmax - 0.01, 0.56, 0], [0, 0, 0], [0.012, 0.11, 0.5]), { color: [0.95, 0.95, 0.9] });
  }
  // rodas: para-lama interno escuro, pneu, aro de aço estampado com porcas
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wx = sx * ax, wz = sz * (hw - 0.17);
      B.add(cached('archliner', () => new THREE.CylinderGeometry(1, 1, 1, 14, 1, true, -Math.PI / 2, Math.PI)), 'black', L([wx, K.rw + 0.02, sz * (hw - 0.3)], [-Math.PI / 2, 0, 0], [K.rw + 0.07, 0.42, K.rw + 0.07]), { color: [0.35, 0.33, 0.3] });
      // caixa de roda fechada por dentro: parede interna escura (nada de luz
      // atravessando o vão acima do pneu) + AO de contato sob cada roda
      B.add(cached('archwall', () => new THREE.CircleGeometry(1, 16, 0, Math.PI)), 'black', L([wx, K.rw + 0.02, sz * (hw - 0.5)], [0, sz > 0 ? 0 : Math.PI, 0], [K.rw + 0.07, K.rw + 0.07, 1]), { color: [0.18, 0.17, 0.16] });
      B.add(cached('archwall', () => new THREE.CircleGeometry(1, 16, 0, Math.PI)), 'black', L([wx, K.rw + 0.02, sz * (hw - 0.5)], [0, sz > 0 ? Math.PI : 0, 0], [K.rw + 0.07, K.rw + 0.07, 1]), { color: [0.18, 0.17, 0.16] });
      // lábio do para-lama: arco boleado acompanhando a caixa de roda
      {
        const ar = K.rw + (K.box ? 0.06 : 0.08);
        const zl = sz * (sideZ(K, wx, K.rw + 0.25) - 0.012);
        B.add(cached('archlip', () => new THREE.TorusGeometry(1, 0.075, 6, 18, Math.PI)), bodyMat, L([wx, K.box ? 0.36 : K.rw + 0.02, zl], [0, 0, 0], [ar, ar, 0.35]), { color: tint.map((c) => c * 0.92) });
      }
      const isFlat = flat && sx === 1 && sz === 1;
      const ry = isFlat ? K.rw - 0.06 : K.rw;
      if (!burnt) {
        const tk = K.rw / 0.33;
        B.add(carTire(sx > 0 ? 0 : 1), 'rubber', L([wx, ry, wz], [0, 0, rng.range(0, 6)], [tk, isFlat ? tk * 0.8 : tk, 1.05]), { color: vary(rng, [0.85, 0.85, 0.83], { tone: 0.06, fade: 0.25, dirt: 0.2 }) });
        const rimC = rng.chance(0.5) ? [0.55, 0.55, 0.53] : [0.2, 0.2, 0.2];
        B.add(rimGeo(), 'chrome', L([wx, ry, wz + sz * 0.02], [0, sz > 0 ? 0 : Math.PI, 0], [K.rw / 0.32, K.rw / 0.32, 1]), { color: rimC });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          B.add(cyl(6), 'chrome', L([wx + Math.cos(a) * 0.055, ry + Math.sin(a) * 0.055, wz + sz * 0.075], [Math.PI / 2, 0, 0], [0.012, 0.02, 0.012]), { color: [0.4, 0.4, 0.38] });
        }
        B.add(cyl(12), 'chrome', L([wx, ry, wz + sz * 0.07], [Math.PI / 2, 0, 0], [0.035, 0.015, 0.035]), { color: [0.7, 0.7, 0.68] });
      } else {
        // só o aro (pneu derretido), carro apoiado nele
        B.add(torus(0.12, 14), 'burnt', L([wx, 0.34, wz], [0, 0, 0], [0.19, 0.19, 0.3]), { color: [1, 1, 1] });
        B.add(rimGeo(), 'burnt', L([wx, 0.34, wz], [0, sz > 0 ? 0 : Math.PI, 0], [1, 1, 1]), { color: [0.8, 0.8, 0.8] });
      }
    }
  }
  // interior modelado: bancos com almofadas boleadas e encosto de cabeça,
  // banco traseiro inteiriço, painel com capô do quadro de instrumentos,
  // volante, console central, forros de porta e assoalho com tapete.
  // (queimado: só as armações de aço dos bancos e o painel derretido)
  {
    const fabric = burnt ? 'burnt' : 'fabric';
    const seatC = burnt ? [0.55, 0.5, 0.45] : vary(rng, rng.pick([[0.16, 0.15, 0.14], [0.22, 0.2, 0.17], [0.3, 0.26, 0.2], [0.13, 0.14, 0.17]]), { tone: 0.1, fade: 0.3, dirt: 0.1 });
    const fx = g[0][0] + 0.75; // banco dianteiro: atrás do para-brisa
    const rows = kind === 'van' ? [fx] : [fx, fx + 0.9];
    rows.forEach((sx, ri) => {
      const bench = ri === 1;
      for (const s of bench ? [0] : [-1, 1]) {
        const sw = bench ? K.gw - 0.25 : 0.5;
        const zc = s * 0.36;
        if (burnt) {
          // armação: tubos do assento e encosto, molas em zigue-zague
          part(B, CM, bevelBox(sw, 0.03, 0.48, 0.01), 'burnt', [sx, 0.5, zc], [0, 0, 0], [0.9, 0.85, 0.8]);
          part(B, CM, bevelBox(0.03, 0.5, sw, 0.01), 'burnt', [sx + 0.26, 0.78, zc], [0, Math.PI / 2, -0.25], [0.9, 0.85, 0.8]);
          continue;
        }
        part(B, CM, bevelBox(0.5, 0.12, sw, 0.045, { wear: 0.15 }), fabric, [sx, 0.55, zc], [0, 0, -0.06], seatC);
        part(B, CM, bevelBox(0.13, 0.58, sw - 0.02, 0.05, { wear: 0.15 }), fabric, [sx + 0.27, 0.86, zc], [0, 0, -0.22], seatC);
        if (!bench) {
          // encosto de cabeça em duas hastes
          part(B, CM, bevelBox(0.1, 0.17, 0.26, 0.045), fabric, [sx + 0.36, 1.24, zc], [0, 0, -0.18], seatC);
          for (const k of [-0.07, 0.07]) part(B, CM, bevelCyl(0.006, 0.006, 0.08, 6), 'chrome', [sx + 0.34, 1.13, zc + k], [0, 0, -0.18], [0.6, 0.6, 0.6]);
        }
      }
    });
    // painel: bloco boleado + capô do quadro + saídas de ar
    const dashX = g[0][0] + 0.22;
    part(B, CM, bevelBox(0.42, 0.22, K.gw - 0.16, 0.06, { wear: 0.1 }), 'plastic', [dashX, 0.86, 0], [0, 0, 0.18], burnt ? [0.1, 0.09, 0.08] : [0.14, 0.14, 0.135]);
    if (!burnt) {
      const dz = 0.36; // volante à esquerda (+z local = esquerda de quem olha para -x)
      part(B, CM, bevelBox(0.16, 0.08, 0.36, 0.035), 'plastic', [dashX + 0.12, 1.0, dz], [0, 0, 0.1], [0.11, 0.11, 0.105]);
      // volante: aro + cubo + coluna
      const sw = CM.clone().multiply(mat4([dashX + 0.33, 0.93, dz], [0, 0, 0.45]));
      B.add(cached('steer', () => new THREE.TorusGeometry(0.18, 0.016, 8, 24)), 'plastic', sw.clone().multiply(mat4([0, 0, 0], [0, Math.PI / 2, 0])), { color: [0.1, 0.1, 0.1] });
      B.add(cyl(10), 'plastic', sw.clone().multiply(mat4([0, 0, 0], [0, 0, Math.PI / 2], [0.05, 0.04, 0.05])), { color: [0.12, 0.12, 0.12] });
      for (const a of [0, 2.1, 4.2]) B.add(UNIT(), 'plastic', sw.clone().multiply(mat4([0, Math.cos(a) * 0.09, Math.sin(a) * 0.09], [a, 0, 0], [0.02, 0.18, 0.025])), { color: [0.11, 0.11, 0.11] });
      B.add(cyl(8), 'plastic', CM.clone().multiply(mat4([dashX + 0.2, 0.9, dz], [0, 0, Math.PI / 2 + 0.45], [0.035, 0.26, 0.035])), { color: [0.1, 0.1, 0.1] });
      // console central e alavanca de câmbio
      if (kind !== 'van') {
        part(B, CM, bevelBox(0.7, 0.18, 0.2, 0.04), 'plastic', [dashX + 0.5, 0.58, 0], [0, 0, 0], [0.13, 0.13, 0.125]);
        part(B, CM, bevelCyl(0.008, 0.01, 0.16, 6), 'chrome', [dashX + 0.45, 0.72, 0], [0, 0, 0.2], [0.3, 0.3, 0.3]);
      }
      // forros de porta (painel escuro com braço) dos dois lados
      for (const s of [-1, 1]) part(B, CM, bevelBox(K.doors[K.doors.length - 1] - K.doors[0] - 0.1, 0.32, 0.03, 0.012), 'plastic', [(K.doors[0] + K.doors[K.doors.length - 1]) / 2, 0.7, s * (K.gw / 2 - 0.02)], [0, 0, 0], [0.16, 0.155, 0.15]);
    }
    // forro interno da cabine (caixa com faces para DENTRO): pelo vidro se vê
    // um interior escuro (forro, assoalho, laterais) — não o vazio da
    // carroceria de uma face só, que deixava a fachada atrás "atravessar"
    if (!burnt) {
      const x0 = g[0][0] + 0.25, x1 = g[g.length - 1][0] - 0.15;
      const y1 = roofY - 0.06;
      B.add(innerBox(), 'fabric', L([(x0 + x1) / 2, (0.42 + y1) / 2, 0], [0, 0, 0], [x1 - x0, y1 - 0.42, K.gw - 0.1]), { color: [0.13, 0.125, 0.115] });
      // forro de teto mais claro (o que mais aparece pelo vidro)
      B.add(UNIT(), 'fabric', L([(x0 + x1) / 2, y1 - 0.01, 0], [0, 0, 0], [x1 - x0 - 0.05, 0.01, K.gw - 0.15]), { color: [0.42, 0.4, 0.36] });
      // furgão: divisória atrás dos bancos (o baú é fechado)
      if (kind === 'van') B.add(UNIT(), 'black', L([0.32, (0.42 + y1) / 2, 0], [0, 0, 0], [0.04, y1 - 0.42, K.gw - 0.12]), { color: [0.35, 0.34, 0.32] });
    }
  }
  // dano: furos de bala na lateral, para-brisa trincado
  const dmg = opts.damage ?? (burnt ? 0.6 : rng.range(0, 0.8));
  if (dmg > 0.3) {
    const side = rng.sign();
    const p = new THREE.Vector3(rng.range(-1, 1), 0.7, side * (hw + 0.012)).applyMatrix4(CM);
    decal(B, 'bulletsM', [p.x, p.y, p.z], side > 0 ? sideNormal(yaw, 1) : sideNormal(yaw, -1), [rng.range(0.5, 0.9), rng.range(0.5, 0.9)], bulletRect(rng.int(0, 3)), rng.range(-0.3, 0.3), [1, 1, 1]);
  }
  if (burnt) {
    decal(B, 'scorch', [x, 0.022, z], 'py', [K.len + 3, 5], [0, 0, 1, 1], -yaw);
    decal(B, 'stains', [x, 0.024, z], 'py', [K.len + 1.5, 3], [0.5, 0.5, 1, 1], -yaw);
    W.rubbleSpots.push({ p: [x, 0, z], r: 2.0, n: 10, small: true });
  } else {
    decal(B, 'stains', [x + rng.range(-0.5, 0.5), 0.022, z], 'py', [2.2, 2.2], [0, 0, 0.5, 0.5], rng.range(0, 6));
  }
  // sombra de contato sob o carro (o vão do assoalho é escuro)
  contact(B, x, 0, z, K.len + 0.5, K.w + 0.55, yaw, 3);
  // colisor (AABB do carro rotacionado)
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, (roofY + 0.2) / 2, 0), new THREE.Vector3(K.len, roofY - 0.1, K.w)).applyMatrix4(CM);
  B.collider(box.min.toArray(), box.max.toArray(), 'carpaint', { surface: 'metal' });
  return { kind, CM };
}

/** Meia-largura da superfície lateral da parte baixa no ponto (x, y) — mesma fórmula do loft. */
function sideZ(K, x, y) {
  if (K.box) return K.w / 2;
  let xmin = Infinity, xmax = -Infinity;
  for (const [px] of K.low) { xmin = Math.min(xmin, px); xmax = Math.max(xmax, px); }
  const [b, t] = spanAt(K.low, Math.min(xmax - 0.01, Math.max(xmin + 0.01, x)));
  const endD = x > 0 ? xmax - x : x - xmin;
  const e = Math.max(0, 1 - endD / 0.7);
  const hw = (K.w / 2) * (1 - 0.17 * Math.pow(e, 1.8));
  const mid = (t + b) / 2, hh = Math.max(0.01, (t - b) / 2);
  const q = Math.max(-1, Math.min(1, (y - mid) / hh));
  if (q > 0) {
    const sn = q * q;
    const c = Math.sqrt(Math.max(0, 1 - sn * sn));
    return hw * Math.pow(c, 0.55) * (1 - 0.045 * q);
  }
  const sn = Math.pow(-q, 5);
  const c = Math.sqrt(Math.max(0, 1 - sn * sn));
  return hw * Math.pow(c, 0.3);
}

/** Normal lateral do carro mais próxima de um eixo (para decalques). */
function sideNormal(yaw, s) {
  // eixo local +z do carro no mundo
  const zx = Math.sin(yaw) * s, zz = Math.cos(yaw) * s;
  if (Math.abs(zx) > Math.abs(zz)) return zx > 0 ? 'px' : 'nx';
  return zz > 0 ? 'pz' : 'nz';
}
