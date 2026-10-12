/**
 * GERADORES PARAMÉTRICOS de plantas, fungos, cristais e rochas (puros).
 *
 * Cada gerador recebe (rnd, lod, P) — rnd determinístico, lod 0 (perto) ou 1
 * (média distância: menos segmentos/cartas, cartas maiores para manter a
 * cobertura) e P = parâmetros/cores da espécie — e devolve um GeoBuilder em
 * coordenadas locais (+Y = normal da esfera, base na origem).
 *
 * Árvores: esqueleto por ramificação recursiva estilo L-system (filotaxia de
 * 137,5°, gravitropismo, encurtamento por nível) com tubos de transporte
 * paralelo e cartas de folha arqueadas nas pontas; copa com normais de
 * volume (iluminada como uma massa, com translucidez nas bordas).
 */
import * as THREE from 'three';
import { GeoBuilder, KIND, lerp3, mul3 } from './builder.js';
import { L } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const GOLD = 2.39996323; // ângulo áureo (rad)

function perp(d) {
  const a = Math.abs(d.y) < 0.9 ? UP : V(1, 0, 0);
  return V().crossVectors(d, a).normalize();
}
function rotAround(v, axis, ang) {
  return v.clone().applyAxisAngle(axis, ang);
}
const soft = (dir, w) => new THREE.Vector4(dir.x, dir.y, dir.z, w);

// ─── grama ────────────────────────────────────────────────────────────
/** Tufo de grama: lâminas afiladas e arqueadas, base escura (oclusão) → ponta clara. */
export function grassClump(rnd, lod, P) {
  const B = new GeoBuilder();
  const blades = lod === 0 ? P.blades ?? 11 : Math.ceil((P.blades ?? 11) * 0.5);
  const segs = lod === 0 ? 3 : 2;
  const H = P.height ?? 0.7;
  B.H = H;
  const R = P.radius ?? 0.28;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
    const base = V(Math.cos(a) * r, -0.04, Math.sin(a) * r);
    const h = H * (0.55 + rnd() * 0.6) * (lod ? 1.08 : 1);
    const w = (P.width ?? 0.05) * (0.7 + rnd() * 0.6) * (lod ? 1.7 : 1);
    // inclina para fora do centro do tufo e arqueia
    const out = V(Math.cos(a), 0, Math.sin(a));
    const lean = (P.lean ?? 0.35) * (0.4 + rnd());
    const fa = rnd() * Math.PI * 2;
    const face = V(Math.cos(fa), 0, Math.sin(fa)); // direção da largura
    const bend = out.clone().multiplyScalar(lean);
    const dark = 0.75 + rnd() * 0.5;
    const ph = rnd() * 6.28;
    const rows = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const c = V().copy(base).addScaledVector(UP, h * t * (1 - lean * 0.25 * t)).addScaledVector(bend, h * t * t);
      const col = lerp3(mul3(P.colBase, dark), P.colTip, Math.pow(t, 0.8));
      const ww = w * (i === segs ? 0 : 1 - Math.pow(t, 1.6) * 0.75);
      const sw = Math.min(1.5, t * t * (h / H));
      const sv = soft(V().copy(UP).addScaledVector(out, 0.35).normalize(), 0.55);
      if (i === segs) {
        rows.push([B.vert(c, 0.5, 1, col, [L.BLADE, KIND.LEAF, P.emit ?? 0, 0.55], [sw, 0.25, ph, 0.55], sv)]);
      } else {
        rows.push([
          B.vert(V().copy(c).addScaledVector(face, -ww / 2), 0, t, col, [L.BLADE, KIND.LEAF, P.emit ?? 0, 0.55], [sw, 0.25 * t, ph, 0.55], sv),
          B.vert(V().copy(c).addScaledVector(face, ww / 2), 1, t, col, [L.BLADE, KIND.LEAF, P.emit ?? 0, 0.55], [sw, 0.25 * t, ph, 0.55], sv),
        ]);
      }
    }
    for (let i = 0; i < segs - 1; i++) B.quad(rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]);
    B.tri(rows[segs - 1][0], rows[segs][0], rows[segs - 1][1]);
  }
  return B;
}

// ─── flores e plantas rasteiras ───────────────────────────────────────
export function flowerPatch(rnd, lod, P) {
  const B = new GeoBuilder();
  const n = lod === 0 ? P.count ?? 5 : 3;
  const H = P.height ?? 0.6;
  B.H = H;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (P.spread ?? 0.4);
    const base = V(Math.cos(a) * r, -0.03, Math.sin(a) * r);
    const h = H * (0.6 + rnd() * 0.6);
    const tip = V(base.x + (rnd() - 0.5) * 0.15, h, base.z + (rnd() - 0.5) * 0.15);
    const mid = V().lerpVectors(base, tip, 0.5).add(V((rnd() - 0.5) * 0.08, 0, (rnd() - 0.5) * 0.08));
    B.tube([base, mid, tip], [0.012, 0.009, 0.006], { seg: 3, layer: L.STEM, color: () => P.stem, kind: KIND.LEAF, rough: 0.6, flutter: 0.1 });
    // cabeça: carta quase horizontal com pétalas radiais
    const s = (P.head ?? 0.14) * (0.7 + rnd() * 0.6);
    const tilt = V((rnd() - 0.5) * 0.6, 1, (rnd() - 0.5) * 0.6).normalize();
    const sd = perp(tilt);
    const fw = V().crossVectors(tilt, sd).normalize();
    const o = V().copy(tip).addScaledVector(fw, -s);
    B.card(o, fw, sd, s * 2, s * 2, {
      segs: 1, layer: L.PETAL, colBase: P.petal, colTip: P.petal, kind: KIND.LEAF, emit: P.emit ?? 0.6,
      fold: -0.25, flutter: 0.15, downDir: tilt.clone().negate(), droop: 0, soft: soft(tilt, 0.3),
    });
    // folhinhas na base
    if (lod === 0) {
      for (let k = 0; k < 2; k++) {
        const la = rnd() * Math.PI * 2;
        const d = V(Math.cos(la), 0.9, Math.sin(la)).normalize();
        B.card(base, d, perp(d), h * 0.45, 0.06, { segs: 2, layer: L.SPIKE, colBase: mul3(P.leaf, 0.6), colTip: P.leaf, droop: 0.08, fold: 0.3, soft: soft(UP, 0.4) });
      }
    }
  }
  return B;
}

/** Roseta: folhas largas saindo do centro, subindo e caindo (samambaia, couve alienígena). */
export function rosette(rnd, lod, P) {
  const B = new GeoBuilder();
  const n = lod === 0 ? P.leaves ?? 9 : Math.ceil((P.leaves ?? 9) * 0.6);
  const Lf = P.length ?? 1;
  B.H = Lf * 0.8;
  for (let i = 0; i < n; i++) {
    const a = i * GOLD + rnd() * 0.3;
    const elev = (P.elev ?? 0.9) * (0.5 + rnd() * 0.6);
    const d = V(Math.cos(a), elev, Math.sin(a)).normalize();
    const side = perp(d);
    const l = Lf * (0.65 + rnd() * 0.5) * (lod ? 1.1 : 1);
    const w = l * (P.aspect ?? 0.45) * (lod ? 1.15 : 1);
    B.card(V(0, -0.02, 0), d, side, l, w, {
      segs: lod === 0 ? 4 : 2, layer: P.layer ?? L.FRILL, colBase: P.colBase, colTip: P.colTip,
      droop: l * (P.droop ?? 0.5), fold: P.fold ?? 0.25, curl: P.curl ?? 0.1, flutter: 0.35, phase: rnd() * 6,
      emit: P.emit ?? 0, soft: soft(V(d.x, 0.8, d.z).normalize(), 0.4),
    });
  }
  return B;
}

// ─── árvores ──────────────────────────────────────────────────────────
/**
 * Árvore por ramificação recursiva. P:
 *   height, trunkR, lean, levels: [{ n, start, end, angle, len, droop }],
 *   leaf: { layer, size, aspect, perBranch, droop, fold }, palm (bool),
 *   bark, leafBase, leafTip
 */
export function tree(rnd, lod, P) {
  const B = new GeoBuilder();
  const H = P.height;
  B.H = H;
  const crown = V(0, H * (P.crownY ?? 0.75), 0);
  const segT = lod === 0 ? 8 : 4;
  const radial = lod === 0 ? P.radial ?? 7 : 4;
  // tronco: curva em S suave com inclinação
  const la = rnd() * Math.PI * 2;
  const lean = V(Math.cos(la), 0, Math.sin(la)).multiplyScalar((P.lean ?? 0.08) * H);
  const trunk = [];
  const radii = [];
  for (let i = 0; i <= segT; i++) {
    const t = i / segT;
    const p = V(0, H * t * (P.trunkLen ?? 1), 0).addScaledVector(lean, t * t);
    p.x += Math.sin(t * 3.1 + la) * H * 0.02;
    p.z += Math.cos(t * 2.7 + la) * H * 0.02;
    trunk.push(p);
    // base alargada (raízes) e afinamento
    radii.push(P.trunkR * (1 + 1.2 * Math.pow(Math.max(0, 1 - t * 6), 2)) * (1 - t * (P.taper ?? 0.6)));
  }
  const barkCol = (t) => lerp3(mul3(P.bark, 0.55), P.bark, Math.min(1, t * 2));
  B.tube(trunk, radii, { seg: radial, layer: L.BARK, color: barkCol, uvU: 2, uvV: P.trunkR * 8, rough: 0.92, swayMul: 0.6 });
  // raízes de apoio (só perto)
  if (lod === 0 && P.roots) {
    for (let k = 0; k < P.roots; k++) {
      const a = (k / P.roots) * Math.PI * 2 + rnd();
      const d = V(Math.cos(a), 0, Math.sin(a));
      const p0 = V(0, P.trunkR * 3, 0).addScaledVector(d, P.trunkR * 0.5);
      const p1 = V(0, P.trunkR * 0.8, 0).addScaledVector(d, P.trunkR * 2.4);
      const p2 = V(0, -0.2, 0).addScaledVector(d, P.trunkR * 3.6);
      B.tube([p0, p1, p2], [P.trunkR * 0.45, P.trunkR * 0.3, P.trunkR * 0.15], { seg: 4, layer: L.BARK, color: () => mul3(P.bark, 0.6), uvU: 1, uvV: 1, swayMul: 0 });
    }
  }
  const leafCfg = P.leaf;
  const leaves = [];
  const addLeafFan = (origin, dir, scale) => {
    // leque de folhas grandes na ponta (palmeira/folha larga)
    const n = lod === 0 ? leafCfg.fan : Math.max(3, Math.ceil(leafCfg.fan * 0.55));
    for (let k = 0; k < n; k++) {
      const a = k * GOLD + rnd();
      const side0 = perp(dir);
      const out = rotAround(side0, dir, a);
      const d = V().copy(dir).multiplyScalar(leafCfg.up ?? 0.4).addScaledVector(out, 1).normalize();
      leaves.push({ o: origin.clone(), d, s: scale * (0.75 + rnd() * 0.5) * (lod ? 1.2 : 1) });
    }
  };
  const branch = (start, dir, len, rad, level) => {
    const cfg = P.levels[level];
    const segs = lod === 0 ? 4 : 2;
    const pts = [start.clone()];
    const rr = [rad];
    let p = start.clone(), d = dir.clone();
    for (let i = 1; i <= segs; i++) {
      // gravitropismo (droop < 0 sobe, > 0 cai) + ruído
      d.y -= (cfg.droop ?? 0) * (1 / segs);
      d.x += (rnd() - 0.5) * 0.25;
      d.z += (rnd() - 0.5) * 0.25;
      d.normalize();
      p = p.clone().addScaledVector(d, len / segs);
      pts.push(p);
      rr.push(rad * (1 - (i / segs) * 0.75));
    }
    if (rad > (lod === 0 ? 0.015 : 0.05)) B.tube(pts, rr, { seg: lod === 0 ? 5 : 3, layer: L.BARK, color: () => mul3(P.bark, 0.85), uvU: 1, uvV: Math.max(0.3, rad * 8) });
    const next = P.levels[level + 1];
    if (next && !(lod === 1 && level + 1 >= P.levels.length - 1 && P.levels.length > 2)) {
      const n = lod === 0 ? next.n : Math.ceil(next.n * 0.6);
      for (let k = 0; k < n; k++) {
        const t = next.start + (next.end - next.start) * ((k + rnd() * 0.5) / n);
        const i = Math.min(segs - 1, Math.floor(t * segs));
        const f = t * segs - i;
        const sp = V().lerpVectors(pts[i], pts[i + 1], f);
        const pd = V().subVectors(pts[i + 1], pts[i]).normalize();
        const out = rotAround(perp(pd), pd, k * GOLD + rnd());
        const cd = V().copy(pd).multiplyScalar(Math.cos(next.angle)).addScaledVector(out, Math.sin(next.angle)).normalize();
        branch(sp, cd, len * next.len * (0.8 + rnd() * 0.4) * (1 - t * 0.3), rad * 0.55, level + 1);
      }
    } else if (lod === 1 && next) {
      // LOD1: sem os galhos finos, as folhas vão direto neste nível
      addLeafFan(p, d, leafCfg.size * 1.15);
    }
    if (!next) {
      // folhas ao longo e na ponta do galho terminal
      if (leafCfg.fan) addLeafFan(p, d, leafCfg.size);
      const per = lod === 0 ? leafCfg.perBranch ?? 0 : Math.ceil((leafCfg.perBranch ?? 0) * 0.4);
      for (let k = 0; k < per; k++) {
        const t = 0.3 + 0.7 * ((k + rnd()) / per);
        const i = Math.min(segs - 1, Math.floor(t * segs));
        const sp = V().lerpVectors(pts[i], pts[i + 1], t * segs - i);
        const out = rotAround(perp(d), d, k * GOLD + rnd());
        const ld = V().copy(d).multiplyScalar(0.5).addScaledVector(out, 1).normalize();
        leaves.push({ o: sp, d: ld, s: leafCfg.size * (0.6 + rnd() * 0.5) * (lod ? 1.35 : 1) });
      }
    }
  };
  // ramos do 1º nível saindo do tronco (ou leque no topo, para palmeiras)
  const top = trunk[trunk.length - 1];
  const topDir = V().subVectors(top, trunk[trunk.length - 2]).normalize();
  if (P.palm) {
    const whorls = P.whorls ?? 2;
    for (let w = 0; w < whorls; w++) {
      const n = lod === 0 ? leafCfg.fan : Math.ceil(leafCfg.fan * 0.6);
      for (let k = 0; k < n; k++) {
        const a = k * (Math.PI * 2 / n) + w * 0.6 + rnd() * 0.3;
        const out = V(Math.cos(a), 0, Math.sin(a));
        const d = V().copy(out).addScaledVector(UP, (leafCfg.up ?? 0.5) - w * 0.25).normalize();
        leaves.push({ o: V().copy(top).addScaledVector(topDir, -w * H * 0.03), d, s: leafCfg.size * (1 - w * 0.12) * (0.85 + rnd() * 0.3) });
      }
    }
  } else {
    const c = P.levels[0];
    const n = lod === 0 ? c.n : Math.ceil(c.n * 0.7);
    for (let k = 0; k < n; k++) {
      const t = c.start + (c.end - c.start) * ((k + rnd() * 0.4) / n);
      const i = Math.min(segT - 1, Math.floor(t * segT));
      const sp = V().lerpVectors(trunk[i], trunk[i + 1], t * segT - i);
      const out = V(Math.cos(k * GOLD), 0, Math.sin(k * GOLD));
      const d = V().copy(UP).multiplyScalar(Math.cos(c.angle)).addScaledVector(out, Math.sin(c.angle)).normalize();
      branch(sp, d, H * c.len * (1.1 - t * 0.5) * (0.8 + rnd() * 0.4), P.trunkR * 0.5 * (1 - t * 0.5), 0);
    }
    // ponta do tronco também folheia
    if (leafCfg.fan) addLeafFan(top, topDir, leafCfg.size);
  }
  // cartas de folha
  crown.y = 0;
  let cy = 0, cn = 0;
  for (const lf of leaves) {
    cy += lf.o.y;
    cn++;
  }
  crown.y = cn ? cy / cn : H * 0.75;
  for (const lf of leaves) {
    const side = perp(lf.d);
    // gira a carta ao redor do próprio eixo para ficar "deitada" (face para cima)
    const up = V().crossVectors(side, lf.d);
    if (up.y < 0) side.negate();
    const l = lf.s, w = l * (leafCfg.aspect ?? 0.45);
    const sd = V().subVectors(lf.o, crown).setY((lf.o.y - crown.y) * 0.6).normalize();
    // oclusão aproximada: folhas internas/baixas mais escuras
    const occ = 0.55 + 0.45 * Math.max(0, Math.min(1, (lf.o.y - crown.y) / (H * 0.25) * 0.5 + 0.6));
    B.card(lf.o, lf.d, side, l, w, {
      segs: lod === 0 ? 3 : 2, layer: leafCfg.layer, colBase: mul3(P.leafBase, occ), colTip: mul3(P.leafTip, occ),
      droop: l * (leafCfg.droop ?? 0.4), fold: leafCfg.fold ?? 0.2, curl: leafCfg.curl ?? 0, flutter: 0.6, phase: rnd() * 6.28,
      soft: soft(sd, P.softness ?? 0.5), emit: P.leafEmit ?? 0,
    });
  }
  return B;
}

// ─── fungos gigantes ──────────────────────────────────────────────────
export function mushroom(rnd, lod, P) {
  const B = new GeoBuilder();
  const H = P.height;
  B.H = H;
  const caps = lod === 0 ? P.caps ?? 1 : 1;
  for (let c = 0; c < caps; c++) {
    const main = c === 0;
    const h = main ? H : H * (0.35 + rnd() * 0.3);
    const ang = main ? 0 : rnd() * Math.PI * 2;
    const off = main ? V() : V(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(P.stemR * (2 + rnd() * 2));
    const lean = V(Math.cos(ang + 1), 0, Math.sin(ang + 1)).multiplyScalar(h * (main ? P.lean ?? 0.15 : 0.3));
    const pts = [], rr = [];
    const seg = lod === 0 ? 8 : 4;
    const sr = P.stemR * (main ? 1 : 0.5);
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const p = V().copy(off).addScaledVector(UP, h * t).addScaledVector(lean, Math.sin(t * Math.PI * 0.5) ** 2);
      pts.push(p);
      rr.push(sr * (1 + 0.9 * Math.pow(1 - t, 4)) * (0.85 + 0.15 * Math.sin(t * 9)));
    }
    B.tube(pts, rr, { seg: lod === 0 ? 10 : 6, layer: L.STEM, color: (t) => lerp3(mul3(P.stem, 0.5), P.stem, Math.min(1, t * 1.5)), uvU: 2, uvV: h / 2, kind: KIND.FUNGUS, rough: 0.7, swayMul: 0.35, emit: 0 });
    // chapéu (torno): topo abaulado com borda caída + lamelas por baixo
    const top = pts[pts.length - 1];
    const Rc = P.capR * (main ? 1 : 0.45) * (0.85 + rnd() * 0.3);
    const ch = Rc * (P.capH ?? 0.35);
    const segA = lod === 0 ? 22 : 10;
    const segR = lod === 0 ? 6 : 3;
    const ringIdx = [];
    const tilt = V((rnd() - 0.5) * 0.2, 1, (rnd() - 0.5) * 0.2).normalize();
    const tq = new THREE.Quaternion().setFromUnitVectors(UP, tilt);
    const wav = P.wavy ?? 0.08;
    const profile = (r) => ch * (1 - Math.pow(r, P.capPow ?? 2.2)) - ch * 0.35 * Math.pow(r, 6);
    for (let i = 0; i <= segR; i++) {
      const r = i / segR;
      const ring = [];
      for (let k = 0; k <= segA; k++) {
        const a = (k / segA) * Math.PI * 2;
        const wv = 1 + wav * Math.sin(a * 5 + c) * r;
        const p = V(Math.cos(a) * Rc * r * wv, profile(r) + wav * Rc * 0.3 * Math.sin(a * 7) * r * r, Math.sin(a) * Rc * r * wv).applyQuaternion(tq).add(top);
        const col = lerp3(P.capTop, P.capRim, Math.pow(r, 1.5));
        ring.push(B.vert(p, k / segA, r * 0.95, col, [L.CAP, KIND.FUNGUS, P.emit ?? 0.8, 0.55], [B.sway(p.y) * 0.4, 0.02, 0, 0]));
      }
      ringIdx.push(ring);
    }
    for (let i = 0; i < segR; i++) for (let k = 0; k < segA; k++) B.quad(ringIdx[i][k], ringIdx[i][k + 1], ringIdx[i + 1][k + 1], ringIdx[i + 1][k]);
    // lamelas: da borda ao caule, por baixo
    const under = [];
    for (let i = 0; i <= 2; i++) {
      const r = 1 - (i / 2) * (1 - sr / Rc);
      const ring = [];
      for (let k = 0; k <= segA; k++) {
        const a = (k / segA) * Math.PI * 2;
        const wv = 1 + wav * Math.sin(a * 5 + c) * r;
        const y = profile(1) - ch * 0.12 + ch * 0.25 * (i / 2);
        const p = V(Math.cos(a) * Rc * r * wv, i === 0 ? profile(1) + wav * Rc * 0.3 * Math.sin(a * 7) - ch * 0.06 : y, Math.sin(a) * Rc * r * wv).applyQuaternion(tq).add(top);
        ring.push(B.vert(p, (k / segA) * 2, i / 2, lerp3(P.gill, mul3(P.gill, 0.4), i / 2), [L.GILL, KIND.FUNGUS, P.gillEmit ?? 1.2, 0.8], [B.sway(p.y) * 0.4, 0, 0, 0]));
      }
      under.push(ring);
    }
    for (let i = 0; i < 2; i++) for (let k = 0; k < segA; k++) B.quad(under[i][k], under[i][k + 1], under[i + 1][k + 1], under[i + 1][k]);
  }
  return B;
}

/** Tentáculos/talos alienígenas que se curvam para fora, com bulbos luminosos na ponta. */
export function tendrils(rnd, lod, P) {
  const B = new GeoBuilder();
  const H = P.height;
  B.H = H;
  const n = lod === 0 ? P.count ?? 9 : Math.ceil((P.count ?? 9) * 0.6);
  for (let i = 0; i < n; i++) {
    const a = i * GOLD + rnd() * 0.5;
    const out = V(Math.cos(a), 0, Math.sin(a));
    const h = H * (0.5 + rnd() * 0.6);
    const seg = lod === 0 ? 7 : 4;
    const pts = [], rr = [];
    const curl = (P.curl ?? 0.6) * (0.6 + rnd() * 0.8);
    const r0 = P.r * (0.6 + rnd() * 0.6);
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const p = V().addScaledVector(out, r0 * 2 + h * curl * t * t).addScaledVector(UP, h * Math.sin(t * Math.PI * 0.45) / Math.sin(Math.PI * 0.45));
      pts.push(p);
      rr.push(r0 * Math.pow(1 - t * 0.92, 1.2));
    }
    B.tube(pts, rr, { seg: lod === 0 ? 6 : 4, layer: L.STEM, color: (t) => lerp3(mul3(P.col, 0.45), P.col, t), uvU: 1, uvV: h / 3, kind: KIND.FUNGUS, rough: 0.5, emit: 0 });
    if (P.bulb) {
      const tip = pts[pts.length - 1];
      const br = r0 * (P.bulb ?? 1.6);
      const segs = lod === 0 ? 8 : 5;
      const rings = [];
      for (let y = 0; y <= segs / 2; y++) {
        const th = (y / (segs / 2)) * Math.PI;
        const ring = [];
        for (let k = 0; k <= segs; k++) {
          const ph = (k / segs) * Math.PI * 2;
          const nn = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
          const p = V().copy(tip).addScaledVector(nn, br).add(V(0, br * 0.6, 0));
          ring.push(B.vert(p, k / segs, y / (segs / 2), P.bulbCol, [L.BULB, KIND.LEAF, P.emit ?? 1.5, 0.35], [B.sway(p.y), 0.05, 0, 0], null, nn));
        }
        rings.push(ring);
      }
      for (let y = 0; y < rings.length - 1; y++) for (let k = 0; k < segs; k++) B.quad(rings[y][k], rings[y][k + 1], rings[y + 1][k + 1], rings[y + 1][k]);
    }
    // folhas espinhosas ao longo
    if (P.spikes && lod === 0) {
      for (let k = 2; k < pts.length - 1; k += 2) {
        const d = V().subVectors(pts[k + 1], pts[k]).normalize();
        const s = perp(d);
        const ld = V().copy(d).multiplyScalar(0.4).addScaledVector(s, rnd() > 0.5 ? 1 : -1).normalize();
        B.card(pts[k], ld, perp(ld), H * 0.18, H * 0.05, { segs: 2, layer: L.SPIKE, colBase: mul3(P.col, 0.6), colTip: P.col, droop: 0.1, fold: 0.4, soft: soft(UP, 0.3) });
      }
    }
  }
  return B;
}

// ─── cristais ─────────────────────────────────────────────────────────
export function crystals(rnd, lod, P) {
  const B = new GeoBuilder();
  const n = lod === 0 ? P.count ?? 7 : Math.ceil((P.count ?? 7) * 0.6);
  const H = P.height;
  B.H = H * 50; // praticamente sem balanço
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const a = rnd() * Math.PI * 2;
    const tiltA = main ? rnd() * 0.15 : 0.25 + rnd() * 0.55;
    const d = V(Math.cos(a) * Math.sin(tiltA), Math.cos(tiltA), Math.sin(a) * Math.sin(tiltA)).normalize();
    const len = H * (main ? 1 : 0.35 + rnd() * 0.55);
    const r = P.r * (main ? 1 : 0.4 + rnd() * 0.5) * (len / H) ** 0.3;
    const base = V(Math.cos(a), -0.15, Math.sin(a)).multiplyScalar(main ? 0 : P.r * (0.6 + rnd() * 1.4));
    base.y = -0.3 * r;
    const s1 = perp(d), s2 = V().crossVectors(d, s1);
    const sides = 6;
    const ringB = [], ringT = [];
    for (let k = 0; k < sides; k++) {
      const an = (k / sides) * Math.PI * 2;
      const off = V().addScaledVector(s1, Math.cos(an) * r).addScaledVector(s2, Math.sin(an) * r);
      ringB.push(V().copy(base).add(off));
      ringT.push(V().copy(base).addScaledVector(d, len * 0.78).addScaledVector(off, 0.92));
    }
    const tip = V().copy(base).addScaledVector(d, len);
    const col = P.col;
    const mat = [L.CRYSTAL, KIND.CRYSTAL, P.emit ?? 1.4, 0.12];
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      // face lateral (normal plana)
      const nrm = V().subVectors(ringB[k2], ringB[k]).cross(V().subVectors(ringT[k], ringB[k])).normalize().negate();
      const v0 = B.vert(ringB[k], 0, 0, mul3(col, 0.6), mat, [0, 0, 0, 0], null, nrm);
      const v1 = B.vert(ringB[k2], 1, 0, mul3(col, 0.6), mat, [0, 0, 0, 0], null, nrm);
      const v2 = B.vert(ringT[k2], 1, 1, col, mat, [0, 0, 0, 0], null, nrm);
      const v3 = B.vert(ringT[k], 0, 1, col, mat, [0, 0, 0, 0], null, nrm);
      B.quad(v0, v3, v2, v1);
      // faceta da ponta
      const nt = V().subVectors(ringT[k2], ringT[k]).cross(V().subVectors(tip, ringT[k])).normalize().negate();
      const t0 = B.vert(ringT[k], 0, 0, col, mat, [0, 0, 0, 0], null, nt);
      const t1 = B.vert(ringT[k2], 1, 0, col, mat, [0, 0, 0, 0], null, nt);
      const t2 = B.vert(tip, 0.5, 1, mul3(col, 1.3), mat, [0, 0, 0, 0], null, nt);
      B.tri(t0, t2, t1);
    }
  }
  return B;
}

// ─── rochas ───────────────────────────────────────────────────────────
function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}

/** Rocha facetada: icosaedro deslocado por ruído, achatada, com musgo no topo. */
export function rock(rnd, lod, P) {
  const B = new GeoBuilder();
  const detail = lod === 0 ? P.detail ?? 2 : 1;
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const pos = ico.getAttribute('position');
  const sx = 0.8 + rnd() * 0.6, sy = (P.flat ?? 0.6) * (0.7 + rnd() * 0.5), sz = 0.8 + rnd() * 0.5;
  const o = V(rnd() * 100, rnd() * 100, rnd() * 100);
  const disp = (p) => {
    const n = vnoise(p.x * 1.6 + o.x, p.y * 1.6 + o.y, p.z * 1.6 + o.z) * 0.55 + vnoise(p.x * 3.5 + o.x, p.y * 3.5, p.z * 3.5 + o.z) * 0.25;
    const q = V().copy(p).multiplyScalar(0.7 + n * 0.6);
    q.set(q.x * sx, q.y * sy, q.z * sz);
    if (q.y < -0.15) q.y = -0.15 - (q.y + 0.15) * 0.15; // base achatada
    return q.multiplyScalar(P.size);
  };
  const B_H = P.size;
  B.H = B_H * 100;
  for (let i = 0; i < pos.count; i += 3) {
    const a = disp(V().fromBufferAttribute(pos, i));
    const b = disp(V().fromBufferAttribute(pos, i + 1));
    const c = disp(V().fromBufferAttribute(pos, i + 2));
    const n = V().subVectors(b, a).cross(V().subVectors(c, a)).normalize();
    const moss = Math.max(0, Math.min(1, (n.y - (P.mossStart ?? 0.55)) * 3.5)) * (P.moss ?? 0);
    const ids = [a, b, c].map((p) => {
      const h = Math.max(0, Math.min(1, (p.y / P.size + 0.15) / 0.8));
      let col = lerp3(mul3(P.col, 0.5), P.col, h);
      col = lerp3(col, P.mossCol ?? col, moss);
      // u/v por projeção planar dominante (sem costura visível na faceta)
      const ax = Math.abs(n.x), ay = Math.abs(n.y);
      const uv = ax > ay && ax > Math.abs(n.z) ? [p.z, p.y] : ay > Math.abs(n.z) ? [p.x, p.z] : [p.x, p.y];
      return B.vert(p, uv[0] * 0.5, uv[1] * 0.5, col, [L.ROCK, KIND.OPAQUE, 0, 0.9], [0, 0, 0, 0], null, n);
    });
    B.tri(ids[0], ids[1], ids[2]);
  }
  ico.dispose();
  return B;
}
