/**
 * Objetos de cena: carros (intactos e carcaças queimadas), barreiras
 * (jersey, T-wall, HESCO), sacos de areia e arame farpado, entulho, postes
 * com fiação, luminárias, árvores e palmeiras, caixotes, tambores, pneus,
 * caçambas, antenas parabólicas, mato e lixo.
 *
 * Peças repetidas em grande número (sacos, pedras, tijolos, folhas, mato)
 * vão para o Instancer (InstancedMesh por geometria); o resto é mesclado
 * pelo Builder.
 */
import * as THREE from 'three';
import { mat4, jitterGeometry, cached } from './geo.js';
import { cyl, cylBetween, cylinder, cable, rebar, decal, sphere, torus, contact } from './shapes.js';
import * as RB from './rubble.js';
import { mulberry } from './noise.js';
import { bevelBox, bevelCyl, atlasBox, vary, part, CRATE_RECT, treadTire } from './propkit.js';

// ─── instanciamento ────────────────────────────────────────────────────
export class Instancer {
  constructor() {
    this.sets = new Map();
  }
  /** Registra uma instância de `geoKey` (geometria) com material `mat`. */
  add(geoKey, geo, mat, matrix, color = [1, 1, 1], opts = {}) {
    const key = `${geoKey}|${mat}|${opts.shadow === false ? 0 : 1}`;
    let s = this.sets.get(key);
    if (!s) {
      s = { geo: withColor(geo), mat, mats: [], cols: [], shadow: opts.shadow !== false };
      this.sets.set(key, s);
    }
    s.mats.push(matrix.clone());
    s.cols.push(color);
  }
  /**
   * Cria os InstancedMesh. Conjuntos grandes (entulho espalhado pelo mapa
   * inteiro) são PARTIDOS em células de `CELL` m ao longo da rua: a esfera
   * envolvente de cada parte é pequena, então o frustum culling (câmera,
   * sombra do sol, RSM) descarta o que está atrás/longe — antes um único
   * InstancedMesh de ~1500 pedaços cobria a rua toda e era sempre desenhado.
   */
  build(root, mats) {
    const out = [];
    const CELL = 26;
    const SPLIT = 160; // só vale partir conjuntos grandes (cada parte = 1 draw call)
    const _p = new THREE.Vector3();
    for (const [key, s] of this.sets) {
      const groups = new Map();
      if (s.mats.length > SPLIT) {
        s.mats.forEach((M, i) => {
          _p.setFromMatrixPosition(M);
          const c = Math.floor(_p.z / CELL) * 2 + (_p.x < 0 ? 0 : 1);
          let g = groups.get(c);
          if (!g) groups.set(c, (g = []));
          g.push(i);
        });
      } else groups.set(0, s.mats.map((_, i) => i));
      for (const [cell, idx] of groups) {
        const m = new THREE.InstancedMesh(s.geo, mats[s.mat], idx.length);
        m.name = groups.size > 1 ? `inst:${key}#${cell}` : `inst:${key}`;
        const c = new THREE.Color();
        idx.forEach((i, j) => {
          m.setMatrixAt(j, s.mats[i]);
          m.setColorAt(j, c.setRGB(...s.cols[i]));
        });
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
        m.computeBoundingBox?.();
        m.castShadow = s.shadow;
        m.receiveShadow = true;
        root.add(m);
        out.push(m);
      }
    }
    return out;
  }
}

function withColor(geo) {
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return geo;
}

// ─── geometrias base ───────────────────────────────────────────────────
/** Saco de areia: superquádrica achatada (travesseiro) com amassados. */
export const sandbagGeo = (v = 0) =>
  cached('sandbag' + v, () => {
    // travesseiro de polipropileno: corpo achatado, cantos amarrados ("orelhas"),
    // costura longitudinal e afundamento no meio (peso da areia)
    const g = new THREE.SphereGeometry(1, 20, 12);
    const P = g.attributes.position;
    const sp = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
    const r = (k) => Math.sin(k * 91.7 + v * 13.1) * 0.5 + 0.5;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const ax = Math.abs(x);
      let X = sp(x, 0.38) * 0.3, Y = sp(y, 0.72) * 0.075, Z = sp(z, 0.42) * 0.165;
      // pontas afinam (amarrado) e sobem um pouco
      const end = Math.pow(ax, 6);
      Y *= 1 - 0.55 * end;
      Z *= 1 - 0.35 * end;
      X *= 1 + 0.06 * end * (1 - Math.abs(z));
      // barriga: assenta embaixo, abaula em cima
      if (y > 0) Y *= 1 + 0.18 * (1 - ax * ax) * (0.8 + 0.4 * r(i % 37));
      else Y *= 0.7;
      // costura no topo
      if (y > 0.6 && Math.abs(z) < 0.08) Y -= 0.006;
      P.setXYZ(i, X, Y, Z);
    }
    const j = jitterGeometry(g, 0.008, 5 + v * 3);
    const Pj = j.attributes.position;
    const col = new Float32Array(Pj.count * 3);
    for (let i = 0; i < Pj.count; i++) {
      const k = 0.5 + 0.5 * Math.min(1, Math.max(0, (Pj.getY(i) + 0.05) / 0.12)) * (1 - 0.3 * Math.pow(Math.abs(Pj.getX(i)) / 0.3, 4));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    j.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const U = j.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 1.6 + v * 0.31, U.getY(i) * 0.6 + v * 0.17);
    j.computeVertexNormals();
    return j;
  });

export const rockGeo = (v) =>
  cached('rock' + v, () => {
    const g = v % 2 ? new THREE.IcosahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0);
    g.scale(1, 0.55 + (v % 3) * 0.15, 0.8);
    const j = jitterGeometry(g.toNonIndexed(), 0.5, 11 + v * 7);
    return j;
  });

const brickGeo = () => cached('brickbox', () => new THREE.BoxGeometry(0.24, 0.075, 0.12));
const leafGeo = () => cached('leafquad', () => new THREE.PlaneGeometry(1, 1));
const grassGeo = () =>
  cached('grasstuft', () => {
    const a = new THREE.PlaneGeometry(1, 1);
    a.translate(0, 0.5, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const c = a.clone().rotateY(Math.PI / 4);
    const g = mergeSimple([a, b, c]);
    // normais "para cima" para iluminar como volume, não como cartão
    const N = g.attributes.normal;
    for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
    return g;
  });

function mergeSimple(geos) {
  const pos = [], nor = [], uv = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ─── carros ── (cars.js)
export { car } from './cars.js';

// ─── barreiras ── (barriers.js)
export { jersey, twalls, hesco } from './barriers.js';

/**
 * Muro de sacos de areia ao longo de uma polilinha [[x,z],…], `rows` fiadas.
 */
export function sandbagWall(W, pts, rows = 4, opts = {}) {
  const { I, rng, B } = W;
  const bagL = 0.58, bagH = 0.13;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / bagL));
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 0.5 : 0;
      for (let i = 0; i < n + (r % 2 ? 0 : 1) - (r % 2 ? 0 : 1); i++) {
        const t = (i + 0.5 + off * (i < n - 1 ? 1 : 0)) / n;
        if (t > 1) continue;
        const x = ax + (bx - ax) * t + rng.range(-0.02, 0.02), z = az + (bz - az) * t + rng.range(-0.02, 0.02);
        const y = r * bagH + 0.075 + (opts.y || 0);
        // duas fileiras lado a lado (largura do muro ~0.7 m)
        for (const side of [-0.17, 0.17]) {
          if (r === rows - 1 && side > 0 && opts.single) continue;
          const px = x + Math.cos(yaw) * side, pz = z - Math.sin(yaw) * side;
          const M = mat4([px + rng.range(-0.03, 0.03), y + rng.range(-0.015, 0.01), pz + rng.range(-0.03, 0.03)], [rng.range(-0.09, 0.09), yaw + Math.PI / 2 + rng.range(-0.16, 0.16), rng.range(-0.09, 0.09)], [rng.range(0.88, 1.08), rng.range(0.85, 1.15), rng.range(0.9, 1.1)]);
          const v = rng.range(0.72, 1.12);
          const g = rng.chance(0.25) ? 0.9 : 1; // alguns sacos mais esverdeados/novos
          const sv = rng.int(0, 3);
          I.add('sandbag' + sv, sandbagGeo(sv), 'fabric', M, [v * g, v * rng.range(0.94, 1), v * rng.range(0.82, 1) * g]);
        }
      }
    }
    const h = rows * bagH + 0.05;
    contact(B, (ax + bx) / 2, opts.y || 0, (az + bz) / 2, 1.25, len + 0.7, yaw, 2);
    const c = new THREE.Vector3((ax + bx) / 2, h / 2 + (opts.y || 0), (az + bz) / 2);
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.7, h, len + 0.3)).applyMatrix4(mat4(c.toArray(), [0, yaw, 0]));
    B.collider(box.min.toArray(), box.max.toArray(), 'fabric', { surface: 'dirt' });
  }
}

export { concertina } from './barriers.js';

// ─── entulho ───────────────────────────────────────────────────────────
// Implementação em camadas em rubble.js; aqui só a assinatura antiga.
export function rubblePile(W, x, z, r, h, opts = {}) {
  RB.rubblePile(W, x, z, r, h, { ...opts, density: opts.n ? Math.min(1.6, opts.n / Math.max(1, r * r * 5)) : 1 });
}
export function scatterBricks(W, x, z, r, n, opts = {}) {
  RB.scatterDebris(W, x, z, r, n, opts);
}

// ─── postes, cabos, luminárias ── (infra.js)
export { utilityPole, streetLamp, cableBundle, awning } from './infra.js';

// ─── vegetação ── (vegetation.js)
export { tree, palm, grassTufts } from './vegetation.js';

// ─── miudezas ──────────────────────────────────────────────────────────
export function crate(W, x, z, yaw, s = 1, opts = {}) {
  const { B, rng } = W;
  const y = opts.y || 0;
  const w = 0.95 * s, h = 0.5 * s, d = 0.55 * s;
  const M = mat4([x, y + h / 2, z], [0, yaw, opts.tilt || 0]);
  // tom por caixa: lote de tinta, sol e sujeira diferentes
  const tint = vary(rng, opts.tint ? opts.tint.map((c) => Math.min(1, c * 1.6)) : [1, 1, 1], { tone: 0.1, fade: 0.3, dirt: 0.25 });
  // faces do atlas: lateral com estêncil A/B, cabeceiras e tampa SEM texto
  const swap = rng.chance(0.5);
  const R = { pz: swap ? CRATE_RECT.sideB : CRATE_RECT.sideA, nz: swap ? CRATE_RECT.sideA : CRATE_RECT.sideB, px: CRATE_RECT.end, nx: CRATE_RECT.end, py: CRATE_RECT.lid, ny: CRATE_RECT.end };
  B.add(atlasBox(w, h, d, 0.012 * s, R, swap ? 'cB' : 'cA'), 'crate', M, { worldUV: false, vcolor: true, color: tint });
  // tampa: tábua sobreposta 1,5 cm com bisel, levemente desalinhada
  const lid = M.clone().multiply(mat4([rng.range(-0.01, 0.01), h / 2 + 0.008, 0], [0, rng.range(-0.015, 0.015), 0]));
  B.add(atlasBox(w + 0.01, 0.018, d + 0.012, 0.006, { pz: CRATE_RECT.end, nz: CRATE_RECT.end, px: CRATE_RECT.end, nx: CRATE_RECT.end, py: CRATE_RECT.lid, ny: CRATE_RECT.lid }, 'cL'), 'crate', lid, { worldUV: false, vcolor: true, color: tint.map((c) => c * 0.97) });
  // sarrafos de reforço nas cabeceiras (madeira, UV do atlas de cabeceira)
  for (const k of [-1, 1]) {
    const cl = M.clone().multiply(mat4([k * (w / 2 - 0.04 * s), 0, 0]));
    B.add(atlasBox(0.075 * s, h + 0.022, d + 0.032, 0.008, { pz: CRATE_RECT.end, nz: CRATE_RECT.end, px: CRATE_RECT.end, nx: CRATE_RECT.end, py: CRATE_RECT.end, ny: CRATE_RECT.end }, 'cS'), 'crate', cl, { worldUV: false, vcolor: true, color: tint.map((c) => c * 0.9) });
    // cantoneiras de aço dobradas com rebites
    for (const j of [-1, 1]) {
      part(B, M, bevelBox(0.014, 0.055 * s, d + 0.04, 0.004, { wear: 0.6 }), 'metal', [k * (w / 2 + 0.004), j * (h / 2 - 0.022 * s), 0], [0, 0, 0], [0.32, 0.31, 0.27]);
      for (const zz of [-0.4, 0, 0.4]) part(B, M, bevelCyl(0.007, 0.007, 0.006, 6), 'chrome', [k * (w / 2 + 0.012), j * (h / 2 - 0.022 * s), zz * d], [0, 0, Math.PI / 2], [0.4, 0.38, 0.33]);
    }
    // fecho de mola (lingueta) na frente
    part(B, M, bevelBox(0.05, 0.07, 0.012, 0.003), 'metal', [k * w * 0.28, h / 2 - 0.04, d / 2 + 0.008], [0, 0, 0], [0.3, 0.3, 0.27]);
  }
  // alças de corda (toro achatado) presas por grampos
  for (const k of [-1, 1]) {
    B.add(torus(0.16, 12), 'fabric', M.clone().multiply(mat4([k * (w / 2 + 0.045), h * 0.12, 0], [0, Math.PI / 2, 0], [0.065 * s, 0.05 * s, 0.065 * s])), { color: vary(rng, [0.58, 0.52, 0.4], { dirt: 0.4 }) });
  }
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(w, h, d)).applyMatrix4(M);
  if (opts.collide !== false) B.collider(box.min.toArray(), box.max.toArray(), 'wood');
  if (!opts.stacked && y < 0.3) contact(B, x, y, z, w + 0.3, d + 0.3, yaw, 2);
  else if (!opts.stacked) contact(B, x, y, z, w + 0.25, d + 0.25, yaw, 2);
}

/** Lata de munição metálica (verde-oliva, alça e tampa com nervura). */
export function ammoCan(W, x, y, z, yaw) {
  const { B } = W;
  const M = mat4([x, y + 0.095, z], [0, yaw, 0]);
  const L = (p, sc) => M.clone().multiply(mat4(p, [0, 0, 0], sc));
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, 'metal', L([0, 0, 0], [0.29, 0.19, 0.15]), { color: [0.32, 0.36, 0.24], uvRand: true });
  B.add(UNIT, 'metal', L([0, 0.1, 0], [0.3, 0.02, 0.16]), { color: [0.28, 0.32, 0.21] });
  B.add(UNIT, 'metal', L([0, 0.12, 0], [0.12, 0.012, 0.025]), { color: [0.25, 0.26, 0.22] });
}

/** Radiador de ferro fundido: elementos de dupla coluna + tubos. */
export function radiator(W, a, b, y, depthDir, opts = {}) {
  const { B } = W;
  const n = opts.n || 9;
  const h = opts.h || 0.6;
  const tint = opts.tint || [0.84, 0.82, 0.76];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    for (const s of [-0.035, 0.035]) {
      const px = x + depthDir[0] * s, pz = z + depthDir[1] * s;
      cylBetween(B, [px, y + 0.08, pz], [px, y + h - 0.05, pz], 0.024, 'metal', { seg: 8, color: tint });
    }
    B.add(cached('rad_cap', () => new THREE.SphereGeometry(1, 8, 6)), 'metal', mat4([x, y + h - 0.05, z], [0, 0, 0], [0.03, 0.03, 0.06]), { color: tint });
  }
  cylBetween(B, [a[0], y + h - 0.06, a[1]], [b[0], y + h - 0.06, b[1]], 0.018, 'metal', { seg: 8, color: tint });
  cylBetween(B, [a[0], y + 0.1, a[1]], [b[0], y + 0.1, b[1]], 0.018, 'metal', { seg: 8, color: tint });
  // pés/tubos até o piso
  cylBetween(B, [a[0], y + 0.1, a[1]], [a[0], y - 0.15, a[1]], 0.012, 'metal', { seg: 6, color: [0.45, 0.42, 0.38] });
}

export function barrel(W, x, z, opts = {}) {
  const { B, rng } = W;
  const tint = opts.tint || rng.pick([[0.2, 0.3, 0.55], [0.6, 0.15, 0.1], [0.3, 0.4, 0.25], [0.15, 0.15, 0.15]]);
  const dark = tint.map((c) => c * 0.75);
  // tambor de 200 L: corpo + 2 aros de rolagem + bordas (frisos) nas tampas
  const y0 = opts.y || 0;
  const M = opts.fallen ? mat4([x, y0 + 0.29, z], [Math.PI / 2, rng.range(0, 6), 0]) : mat4([x, y0 + 0.44, z], [0, rng.range(0, 6), 0]);
  contact(B, x, y0, z, opts.fallen ? 1.2 : 0.95, opts.fallen ? 1.2 : 0.95, 0, 2);
  B.add(cyl(20), 'metal', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [0.285, 0.86, 0.285])), { color: tint, uvRand: true, ao: opts.fallen ? null : [0, 0.3, 0.6] });
  for (const y of [-0.14, 0.14]) B.add(torus(0.05, 20), 'metal', M.clone().multiply(mat4([0, y, 0], [Math.PI / 2, 0, 0], [0.29, 0.29, 0.29])), { color: dark });
  for (const y of [-0.43, 0.43]) B.add(torus(0.06, 20), 'metal', M.clone().multiply(mat4([0, y, 0], [Math.PI / 2, 0, 0], [0.283, 0.283, 0.283])), { color: dark });
  // tampão
  B.add(cyl(8), 'metal', M.clone().multiply(mat4([0.13, 0.435, 0.05], [0, 0, 0], [0.03, 0.02, 0.03])), { color: [0.3, 0.3, 0.3] });
  if (opts.fallen) B.collider([x - 0.45, y0, z - 0.45], [x + 0.45, y0 + 0.58, z + 0.45], 'metal');
  else B.collider([x - 0.3, y0, z - 0.3], [x + 0.3, y0 + 0.88, z + 0.3], 'metal');
}

const tireGeo = treadTire;

export function tire(W, x, z, opts = {}) {
  const { B, I, rng } = W;
  const flat = opts.flat ?? rng.chance(0.6);
  const y0 = opts.y || 0;
  const v = rng.int(0, 1);
  const M = flat ? mat4([x, y0 + 0.1, z], [opts.tilt || 0, rng.range(0, 6), rng.range(-0.04, 0.04)]) : new THREE.Matrix4().makeRotationY(rng.range(0, 6.28)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 + rng.range(-0.12, 0.12))).setPosition(x, y0 + 0.33, z);
  // pneus usados: borracha preta levemente acinzentada pelo pó
  const tone = rng.range(0.75, 1.0);
  I.add('tire' + v, tireGeo(v), 'rubber', M, [tone, tone, tone * 0.97]);
  if (flat) contact(B, x, opts.y || 0, z, 0.95, 0.95, 0, 1);
}

/**
 * Contêiner de lixo de carga frontal (1,9 m³), modelado como chapa de
 * verdade: casco OCO (paredes de 3 mm com bisel, fundo, frente inclinada),
 * borda superior em tubo dobrado, nervuras em U, bolsos de garfo com boca
 * escura, travessas de base, rodízios giratórios e tampas plásticas com
 * espessura e nervuras moldadas (uma aberta para trás, revelando lixo).
 * Tinta verde desbotada pelo sol com quinas gastas, ferrugem só onde a
 * tinta lascou (atlas da textura de metal com deslocamento por peça).
 */
export function dumpster(W, x, z, yaw, opts = {}) {
  const { B, rng } = W;
  const y0 = opts.y ?? 0;
  const M = mat4([x, y0, z], [0, yaw, 0]);
  const green = vary(rng, opts.tint || [0.25, 0.33, 0.27], { tone: 0.08, fade: 0.45, dirt: 0.2 });
  const inner = green.map((c) => c * 0.45);
  const L = 1.86, Hb = 0.2, Ht = 1.3; // comprimento, base e topo do casco
  const zB = 0.46, zT = 0.58; // meia-profundidade embaixo/em cima (boca mais larga)
  const tWall = 0.03;
  const slope = Math.atan2(zT - zB, Ht - Hb);
  const wallH = Math.hypot(Ht - Hb, zT - zB);
  // frente e fundo inclinados (casco oco)
  for (const sd of [-1, 1]) {
    part(B, M, bevelBox(L, wallH, tWall, 0.012, { wear: 0.5 }), 'metal', [0, (Hb + Ht) / 2, sd * (zB + zT) / 2], [sd * -slope, 0, 0], green, { ao: [y0, y0 + 0.7, 0.55] });
    // face interna escura (sujeira, sombra do casco)
    part(B, M, bevelBox(L - 0.06, wallH - 0.04, 0.004, 0.002), 'metal', [0, (Hb + Ht) / 2 + 0.01, sd * ((zB + zT) / 2 - tWall * 0.6)], [sd * -slope, 0, 0], inner);
  }
  // laterais trapezoidais (chapa extrudada de 3 cm com bisel)
  const side = cached('dumpSide3', () => {
    const sh = new THREE.Shape([new THREE.Vector2(-zB, Hb), new THREE.Vector2(zB, Hb), new THREE.Vector2(zT, Ht), new THREE.Vector2(-zT, Ht)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: tWall, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -tWall / 2);
    g.rotateY(Math.PI / 2);
    g.deleteAttribute('uv');
    return g;
  });
  for (const sd of [-1, 1]) B.add(side, 'metal', M.clone().multiply(mat4([sd * (L / 2 - tWall / 2), 0, 0])), { color: green, uvRand: true, ao: [y0, y0 + 0.7, 0.55] });
  // fundo
  part(B, M, bevelBox(L - 0.02, 0.03, zB * 2, 0.01), 'metal', [0, Hb + 0.015, 0], [0, 0, 0], inner);
  // borda superior: tubo dobrado em volta da boca
  for (const sd of [-1, 1]) {
    B.add(cyl(10), 'metal', M.clone().multiply(mat4([0, Ht + 0.01, sd * (zT + 0.012)], [0, 0, Math.PI / 2], [0.028, L + 0.04, 0.028])), { color: green.map((c) => c * 1.05), uvRand: true });
    B.add(cyl(10), 'metal', M.clone().multiply(mat4([sd * (L / 2 + 0.012), Ht + 0.01, 0], [Math.PI / 2, 0, 0], [0.028, zT * 2 + 0.04, 0.028])), { color: green.map((c) => c * 1.05), uvRand: true });
  }
  // nervuras em U (frente/fundo), acompanhando a inclinação
  for (const sd of [-1, 1]) for (const u of [-0.62, 0, 0.62]) {
    const zz = sd * ((zB + zT) / 2 + 0.03);
    part(B, M, bevelBox(0.09, wallH - 0.1, 0.035, 0.01, { wear: 0.7 }), 'metal', [u, (Hb + Ht) / 2 - 0.02, zz], [sd * -slope, 0, 0], green.map((c) => c * 0.94));
  }
  // bolsos de garfo (tubo retangular) com boca escura
  for (const sd of [-1, 1]) {
    part(B, M, bevelBox(0.16, 0.16, 0.6, 0.012, { wear: 0.8 }), 'metal', [sd * (L / 2 + 0.08), 0.98, 0], [0, 0, 0], [0.16, 0.16, 0.15]);
    part(B, M, bevelBox(0.004, 0.11, 0.52, 0.001), 'black', [sd * (L / 2 + 0.162), 0.98, 0], [0, 0, 0], [1, 1, 1]);
  }
  // travessas de base e rodízios giratórios (garfo + roda de borracha)
  for (const sd of [-1, 1]) part(B, M, bevelBox(L - 0.1, 0.07, 0.07, 0.01), 'metal', [0, Hb - 0.03, sd * (zB - 0.08)], [0, 0, 0], [0.13, 0.13, 0.12]);
  for (const sx of [-0.78, 0.78]) for (const sz of [-0.38, 0.38]) {
    const sw = rng.range(0, 6.28);
    part(B, M, bevelBox(0.08, 0.04, 0.08, 0.01), 'metal', [sx, Hb - 0.08, sz], [0, sw, 0], [0.2, 0.2, 0.19]);
    const fork = M.clone().multiply(mat4([sx, 0.08, sz], [0, sw, 0]));
    for (const k of [-1, 1]) part(B, fork, bevelBox(0.008, 0.1, 0.05, 0.002), 'metal', [k * 0.035, 0.0, 0.0], [0, 0, 0], [0.22, 0.22, 0.2]);
    B.add(cyl(14), 'rubber', fork.clone().multiply(mat4([0, -0.005, 0], [0, 0, Math.PI / 2], [0.07, 0.05, 0.07])), { color: [0.9, 0.9, 0.9] });
  }
  // tampas plásticas (5 cm, nervuras e alça moldada): uma fechada, outra aberta
  const lidC = vary(rng, [0.17, 0.18, 0.17], { tone: 0.1, fade: 0.5, dirt: 0.1 });
  const lidGeo = bevelBox(0.93, 0.04, zT * 2 + 0.1, 0.015, { wear: 0.35 });
  const ribGeo = bevelBox(0.05, 0.03, zT * 2 + 0.04, 0.01);
  const lidAt = (Ml) => {
    B.add(lidGeo, 'plastic', Ml, { worldUV: false, vcolor: true, color: lidC, uvRand: true });
    for (const u of [-0.3, 0, 0.3]) B.add(ribGeo, 'plastic', Ml.clone().multiply(mat4([u, 0.03, 0])), { worldUV: false, vcolor: true, color: lidC.map((c) => c * 0.92) });
    B.add(bevelBox(0.22, 0.03, 0.05, 0.01), 'plastic', Ml.clone().multiply(mat4([0, 0.025, zT + 0.02])), { worldUV: false, vcolor: true, color: lidC.map((c) => c * 0.85) });
  };
  // fechada: apoiada na borda, levemente empenada
  lidAt(M.clone().multiply(mat4([-0.475, Ht + 0.055, 0.0], [0.03, 0, rng.range(-0.02, 0.02)])));
  // aberta: girada na dobradiça de trás, encostada para trás
  const hinge = M.clone().multiply(mat4([0.475, Ht + 0.04, -(zT + 0.04)], [-(Math.PI / 2 + rng.range(0.25, 0.45)), 0, 0]));
  lidAt(hinge.clone().multiply(mat4([0, 0.02, zT + 0.05])));
  // dobradiças
  for (const u of [-0.75, -0.2, 0.2, 0.75]) part(B, M, bevelBox(0.06, 0.05, 0.05, 0.008), 'metal', [u, Ht + 0.02, -(zT + 0.04)], [0, 0, 0], [0.15, 0.15, 0.14]);
  // lixo dentro (visto pela tampa aberta): sacos instanciados
  for (let i = 0; i < 4; i++) {
    const v = rng.int(0, 2);
    const s0 = rng.range(0.24, 0.32);
    const p = new THREE.Vector3(rng.range(0.1, 0.8), Ht - 0.12 + rng.range(-0.05, 0.08), rng.range(-0.3, 0.3)).applyMatrix4(M);
    W.I.add('trashbag' + v, bagGeo(v), 'bag', mat4(p.toArray(), [rng.range(-0.5, 0.5), rng.range(0, 6), rng.range(-0.5, 0.5)], [s0 * 1.1, s0, s0]), rng.pick(BAG_T));
  }
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.7, 0), new THREE.Vector3(2.1, 1.4, 1.25)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  // AO de contato: mancha larga + núcleo escuro sob o casco
  contact(B, x, y0, z, 2.5, 1.6, yaw, 2);
  contact(B, x, y0, z, 1.9, 0.95, yaw, 1);
  decal(B, 'stains', [x, y0 + 0.016, z], 'py', [3.0, 2.4], [0, 0, 0.5, 0.5], rng.range(0, 6), [0.85, 0.82, 0.78]);
  // lixo transbordando em volta
  W.trashSpots.push([x, z, 1.8]);
}

export function pallet(W, x, z, yaw, y = 0) {
  const { B } = W;
  const M = mat4([x, y, z], [0, yaw, 0]);
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 5; i++) B.add(UNIT, 'wood', M.clone().multiply(mat4([-0.5 + i * 0.25, 0.13, 0], [0, 0, 0], [0.1, 0.02, 1.2])), { color: [0.85, 0.75, 0.6] });
  for (const k of [-0.5, 0, 0.5]) B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0.06, k], [0, 0, 0], [1.1, 0.1, 0.1])), { color: [0.75, 0.65, 0.5] });
}

/** Antena parabólica (registrada pelos prédios). */
export function dish(W, p, n) {
  const { B } = W;
  const g = cached('dish', () => {
    const s = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, 0.55);
    s.rotateX(Math.PI / 2);
    return s;
  });
  const yaw = Math.atan2(n[0], n[1]);
  B.add(g, 'metal', mat4(p, [0.35, yaw + Math.PI, 0], [0.45, 0.45, 0.45]), { color: [0.9, 0.9, 0.88] });
  cylBetween(B, p, [p[0] + n[0] * 0.4, p[1] - 0.1, p[2] + n[1] * 0.4], 0.015, 'metal', { color: [0.5, 0.5, 0.5] });
}

/**
 * Saco de lixo de polietileno (instanciado). Forma de saco CHEIO de
 * verdade: corpo mais alto que largo, fundo assentado e espalhado no chão,
 * volumes do conteúdo (caixas, garrafas) esticando o plástico em quinas
 * suaves, PREGAS radiais convergindo e apertando para o gargalo torcido,
 * nó com duas orelhas. AO assada na cor de vértice (pregas e base escuras).
 */
const bagGeo = (v) =>
  cached('trashbag3_' + v, () => {
    const g = new THREE.SphereGeometry(1, 48, 36);
    const P = g.attributes.position;
    const rr = mulberry(400 + v * 17);
    // volumes do conteúdo: 4 "caroços" que esticam o plástico
    const lumps = Array.from({ length: 4 }, () => [new THREE.Vector3(rr() - 0.5, rr() * 0.8 - 0.5, rr() - 0.5).normalize(), 0.08 + rr() * 0.1, 0.5 + rr() * 0.4]);
    const ph = v * 1.7;
    const ao = new Float32Array(P.count);
    const t = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      t.set(x, y, z);
      const a = Math.atan2(z, x);
      let k = 1;
      for (const [d, amp, w] of lumps) k += amp * Math.max(0, t.dot(d) - (1 - w)) / w;
      // pregas: crescem para o gargalo (y → 1); entre elas o plástico afunda
      const up = Math.max(0, y + 0.1) / 1.1;
      const pleat = Math.pow(Math.abs(Math.sin(a * 5 + ph + y * 1.5)), 0.6);
      const fold = (1 - pleat) * 0.16 * Math.pow(up, 1.6) + Math.abs(Math.sin(a * 11 + y * 4 + ph)) * 0.025 * up;
      // vincos finos do filme esticado (rugas diagonais)
      const wr = Math.max(0, Math.sin(x * 9.3 - z * 7.1 + y * 6 + ph)) * 0.028 * (1 - up * 0.5);
      k = k - fold - wr;
      // gargalo apertado
      if (y > 0.5) k *= 1 - Math.pow((y - 0.5) / 0.5, 1.3) * 0.88;
      // fundo assentado: achata e espalha
      if (y < -0.35) {
        const tt = (-0.35 - y) / 0.65;
        y = -0.35 - tt * 0.3;
        k *= 1 + tt * 0.22;
      }
      P.setXYZ(i, x * k * 0.92, y * 1.12, z * k * 0.86);
      // AO: nos vales das pregas, no gargalo e no pé
      ao[i] = Math.max(0.35, (1 - fold * 3.2) * (y < -0.3 ? 0.55 + 0.45 * (1 + (y + 0.65) / 0.35) * 0.5 : 1));
    }
    const body = jitterGeometry(g, 0.012, 300 + v * 7);
    const col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao[i];
    // jitterGeometry clona: a ordem dos vértices é a mesma
    body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // gargalo torcido + nó + orelhas
    const parts = [body];
    const neck = new THREE.CylinderGeometry(0.035, 0.07, 0.22, 8, 3);
    {
      const N = neck.attributes.position;
      for (let i = 0; i < N.count; i++) {
        const yy = N.getY(i), a = yy * 9;
        const x = N.getX(i), z = N.getZ(i);
        N.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), yy, x * Math.sin(a) + z * Math.cos(a));
      }
    }
    neck.translate(0, 1.18, 0);
    parts.push(neck);
    const knot = new THREE.SphereGeometry(0.07, 8, 6);
    knot.scale(1.2, 0.8, 1);
    knot.translate(0, 1.3, 0);
    parts.push(knot);
    for (const sd of [-1, 1]) {
      const e = new THREE.ConeGeometry(0.06, 0.28, 5, 1);
      e.scale(1, 1, 0.35);
      e.rotateZ(sd * (1.0 + v * 0.15));
      e.translate(sd * 0.13, 1.36, 0.02 * sd);
      parts.push(e);
    }
    for (const e of parts.slice(1)) {
      e.computeVertexNormals();
      const n = e.attributes.position.count;
      e.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.8), 3));
    }
    body.computeVertexNormals();
    return mergeColored(parts);
  });

/** Cores de saco: preto, cinza-escuro, verde-escuro, azul (municipal), branco encardido. */
const BAG_T = [[0.05, 0.05, 0.05], [0.07, 0.07, 0.068], [0.05, 0.07, 0.05], [0.07, 0.1, 0.16], [0.3, 0.29, 0.27], [0.045, 0.045, 0.05]];

function mergeColored(geos) {
  const pos = [], nor = [], uv = [], col = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2)));
    col.push(...(g.attributes.color ? g.attributes.color.array : new Float32Array(g.attributes.position.count * 3).fill(1)));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * Caixa de papelão: bisel, abas da tampa (abertas, dobradas ou fechadas
 * com fita), amassada (cisalhada) e às vezes desmontada no chão.
 */
function cardboardBox(W, px, y, pz, opts = {}) {
  const { B, rng } = W;
  const w = rng.range(0.32, 0.6), h = rng.range(0.22, 0.45), d = rng.range(0.26, 0.45);
  const yaw = rng.range(0, 6.28);
  const col = vary(rng, [0.68, 0.52, 0.36], { tone: 0.12, fade: 0.35, dirt: 0.35 });
  if (rng.chance(0.2)) {
    // desmontada/achatada no chão
    B.add(bevelBox(w * 1.6, 0.012, d * 1.4, 0.004), 'cardboard', mat4([px, y + 0.008, pz], [rng.range(-0.04, 0.04), yaw, rng.range(-0.04, 0.04)]), { worldUV: false, vcolor: true, color: col, uvRand: true });
    return;
  }
  const crush = rng.range(-0.08, 0.08);
  const M = mat4([px, y, pz], [rng.range(-0.04, 0.04), yaw, rng.range(-0.05, 0.05)]);
  // cisalhamento (caixa amassada para um lado)
  M.multiply(new THREE.Matrix4().set(1, crush, 0, 0, 0, 1, 0, 0, 0, crush * 0.5, 1, 0, 0, 0, 0, 1));
  part(B, M, bevelBox(w, h, d, 0.012, { wear: 0.2 }), 'cardboard', [0, h / 2, 0], [0, 0, 0], col);
  const open = rng.next();
  if (open < 0.45) {
    // abas abertas: duas longas caídas para fora, duas curtas em pé
    for (const sd of [-1, 1]) {
      part(B, M, bevelBox(w - 0.01, 0.006, d / 2, 0.002), 'cardboard', [0, h + Math.sin(0.9) * d / 4 - 0.01, sd * (d / 2 + Math.cos(0.9) * d / 4)], [sd * (0.9 + rng.range(-0.3, 0.4)), 0, 0], col.map((c) => c * 1.05));
      part(B, M, bevelBox(0.006, d * 0.45, d - 0.02, 0.002), 'cardboard', [sd * (w / 2 - 0.004), h + d * 0.18, 0], [0, 0, sd * rng.range(0.2, 0.6)], col);
    }
    // interior escuro
    part(B, M, bevelBox(w - 0.02, 0.004, d - 0.02, 0.001), 'black', [0, h - 0.004, 0], [0, 0, 0], [0.6, 0.55, 0.5]);
  } else {
    // fita adesiva na emenda da tampa
    part(B, M, bevelBox(0.05, 0.003, d + 0.01, 0.001), 'plasticW', [0, h + 0.002, 0], [0, 0, 0], rng.chance(0.6) ? [0.62, 0.5, 0.3] : [0.75, 0.73, 0.68]);
    part(B, M, bevelBox(w + 0.005, 0.004, 0.003, 0.001), 'black', [0, h + 0.001, 0], [0, 0, 0], [0.5, 0.45, 0.4]);
  }
  contact(B, px, y, pz, w + 0.2, d + 0.2, -yaw, 1);
}

/**
 * Cadeira monobloco de plástico (injetada): assento côncavo, encosto com
 * fendas verticais, braços contínuos, pernas cônicas abertas. Plástico
 * branco encardido (ou verde/bege), sujeira nas reentrâncias.
 */
function plasticChair(W, px, y, pz, opts = {}) {
  const { B, rng } = W;
  const col = vary(rng, rng.pick([[0.66, 0.65, 0.6], [0.6, 0.58, 0.52], [0.26, 0.34, 0.27], [0.6, 0.55, 0.45]]), { tone: 0.06, fade: 0.1, dirt: 0.45 });
  const yaw = rng.range(0, 6.28);
  const fallen = opts.fallen ?? rng.chance(0.6);
  const M = fallen ? mat4([px, y + 0.27, pz], [0, yaw, Math.PI / 2 + 0.12]).multiply(mat4([0, -0.4, 0])) : mat4([px, y, pz], [0, yaw, 0]);
  const SH = 0.42;
  // assento: placa boleada levemente côncava (duas metades inclinadas)
  for (const sd of [-1, 1]) part(B, M, bevelBox(0.22, 0.025, 0.42, 0.01), 'plasticW', [sd * 0.105, SH, 0.01], [0, 0, sd * 0.06], col);
  // pernas cônicas abertas (seção em L → bevelBox fino)
  for (const a of [-1, 1]) for (const b of [-1, 1]) part(B, M, bevelBox(0.045, SH + 0.02, 0.06, 0.015), 'plasticW', [a * 0.21, SH / 2, b * 0.19], [b * 0.12, 0, -a * 0.12], col.map((c) => c * 0.96));
  // encosto: moldura + ripas verticais (fendas abertas entre elas)
  const back = M.clone().multiply(mat4([0, SH + 0.02, -0.2], [-0.2, 0, 0]));
  part(B, back, bevelBox(0.42, 0.06, 0.025, 0.012), 'plasticW', [0, 0.38, 0], [0, 0, 0], col);
  for (let k = -2; k <= 2; k++) part(B, back, bevelBox(0.055, 0.34, 0.02, 0.01), 'plasticW', [k * 0.085, 0.19, -Math.abs(k) * 0.01], [0, k * 0.08, 0], col);
  // braços contínuos (do encosto à frente)
  for (const a of [-1, 1]) {
    part(B, M, bevelBox(0.05, 0.025, 0.42, 0.01), 'plasticW', [a * 0.23, SH + 0.2, -0.02], [-0.08, 0, 0], col);
    part(B, M, bevelBox(0.04, 0.2, 0.04, 0.012), 'plasticW', [a * 0.23, SH + 0.1, 0.16], [0, 0, 0], col);
  }
  contact(B, px, y, pz, fallen ? 0.9 : 0.65, 0.65, -yaw, 1);
}

/**
 * Entulho doméstico: sacos de lixo, caixas de papelão, engradados de
 * plástico e cadeiras de plástico derrubadas, em aglomerado.
 */
export function clutter(W, x, z, r, n = 6, opts = {}) {
  const { B, I, rng } = W;
  const y = opts.y || 0;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const k = rng.next();
    if (k < 0.5) {
      // sacos em montinho: o segundo encosta/empilha no primeiro
      const nb = rng.chance(0.4) ? 2 : 1;
      for (let j = 0; j < nb; j++) {
        const s = rng.range(0.24, 0.33);
        const v = rng.int(0, 2);
        const ox = j ? rng.range(-0.2, 0.2) : 0, oz = j ? rng.range(-0.2, 0.2) : 0;
        const lift = j ? s * 0.45 : 0;
        I.add('trashbag' + v, bagGeo(v), 'bag', mat4([px + ox, y + s * 0.62 + lift, pz + oz], [rng.range(-0.25, 0.25) + (j ? 0.5 : 0), rng.range(0, 6), rng.range(-0.25, 0.25)], [s * rng.range(1.0, 1.15), s * rng.range(0.9, 1.05), s]), rng.pick(BAG_T));
        if (!j) contact(B, px, y, pz, s * 2.6, s * 2.4, 0, 1);
      }
    } else if (k < 0.75) {
      cardboardBox(W, px, y, pz);
    } else if (k < 0.87) {
      // engradado de bebidas: paredes vazadas (moldura + grade), fundo
      const col = vary(rng, rng.pick([[0.6, 0.12, 0.1], [0.12, 0.28, 0.55], [0.75, 0.62, 0.15], [0.2, 0.45, 0.22]]), { tone: 0.06, fade: 0.4, dirt: 0.25 });
      const tipped = rng.chance(0.3);
      const M = mat4([px, y + (tipped ? 0.15 : 0), pz], [tipped ? Math.PI / 2 : 0, rng.range(0, 6), 0]).multiply(mat4([0, tipped ? -0.15 : 0, 0]));
      for (const sd of [-1, 1]) {
        part(B, M, bevelBox(0.4, 0.28, 0.02, 0.008), 'plasticW', [0, 0.15, sd * 0.14], [0, 0, 0], col);
        part(B, M, bevelBox(0.02, 0.28, 0.27, 0.008), 'plasticW', [sd * 0.2, 0.15, 0], [0, 0, 0], col);
        part(B, M, bevelBox(0.1, 0.04, 0.025, 0.01), 'black', [0, 0.25, sd * 0.142], [0, 0, 0], [0.4, 0.4, 0.4]);
      }
      part(B, M, bevelBox(0.4, 0.015, 0.28, 0.005), 'plasticW', [0, 0.01, 0], [0, 0, 0], col.map((c) => c * 0.7));
      for (let gx = -1; gx <= 1; gx++) part(B, M, bevelBox(0.008, 0.2, 0.26, 0.002), 'plasticW', [gx * 0.1, 0.11, 0], [0, 0, 0], col.map((c) => c * 0.85));
      contact(B, px, y, pz, 0.6, 0.5, 0, 1);
    } else {
      plasticChair(W, px, y, pz);
    }
  }
}

/** Lixo e papéis no chão (decalques do atlas 4×4). */
export function trash(W, x, z, r, n, y = 0.02) {
  const { B, rng } = W;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const q = rng.int(0, 15);
    const s = rng.range(0.25, 0.5);
    decal(B, 'trash', [x + Math.cos(a) * d, y + i * 0.0004, z + Math.sin(a) * d], 'py', [s, s], [(q % 4) / 4, Math.floor(q / 4) / 4, (q % 4 + 1) / 4, (Math.floor(q / 4) + 1) / 4], rng.range(0, 6), [0.72, 0.7, 0.66]);
  }
}

export { sphere, cable };
