import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bota de combate procedural em escala real (≈30 cm de comprimento, solado
 * de ≈3 cm, cano de ≈20 cm) — substitui o perfil extrudado "chapado".
 *
 *   pé       loft de seções superelípticas (calcanhar → bico), peito do pé
 *            subindo para o cano, biqueira arredondada em planta e elevação
 *   cano     tubo elíptico com colarinho acolchoado e língua na frente
 *   solado   loft próprio, mais largo, com salto, arco e cravos (lugs) na
 *            sola + vira (welt) saliente
 *   cadarço  cruzado (X) no peito do pé e no cano, com ilhoses/ganchos
 *
 * Espaço da bota: -Z = frente, +Y = cima, X = lado; origem no tornozelo,
 * chão em y = SOLE_BOTTOM. UVs: u em volta da seção, v ao longo do pé (o
 * cano usa a faixa v ∈ [0.62, 1] do mesmo atlas).
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const SOLE_BOTTOM = -0.097;
const SOLE_TOP = -0.068;
const HEEL_Z = 0.088;
const TOE_Z = -0.212;

/** Meia-largura do pé em s ∈ [0,1] (calcanhar → bico), em planta. */
function halfWidth(s) {
  const heel = 0.04 + 0.012 * smooth(0, 0.55, s);
  // bico: arredonda em ~30% finais
  const toe = s > 0.72 ? Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.72) / 0.29, 2))) : 1;
  const back = s < 0.07 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.07, 2))) : 1;
  return heel * (0.18 + 0.82 * toe) * (0.25 + 0.75 * back);
}
/** Altura do topo do cabedal em s (peito do pé desce para o bico). */
function topY(s) {
  const instep = 0.05 - 0.085 * smooth(0.18, 0.86, s);
  const toeDrop = s > 0.86 ? -0.028 * smooth(0.86, 1.0, s) : 0;
  return instep + toeDrop;
}

/**
 * Loft genérico: `sec(s)` → { cx, hw, yb, yt, n } (centro X, meia-largura,
 * base, topo, expoente superelíptico). Fecha as pontas com tampas.
 */
function loft(sec, zOf, { rings = 30, seg = 28, v0 = 0, v1 = 1, flatBottom = true } = {}) {
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const s = r / rings;
    const S = sec(s);
    const z = zOf(s);
    const cy = (S.yb + S.yt) * 0.5, hh = (S.yt - S.yb) * 0.5;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      const th = u * TAU; // 0 = topo, π = base
      const sx = Math.sin(th), sy = Math.cos(th);
      const n = S.n || 2.6;
      let x = Math.sign(sx) * Math.pow(Math.abs(sx), 2 / n) * S.hw;
      let y = cy + Math.sign(sy) * Math.pow(Math.abs(sy), 2 / (sy < 0 && flatBottom ? n * 2.2 : n)) * hh;
      pos.push(x + (S.cx || 0), y, z);
      uv.push(u, v0 + (v1 - v0) * s);
    }
  }
  const row = seg + 1;
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < seg; k++) {
      const a = r * row + k, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  for (const [r, flip] of [[0, false], [rings, true]]) {
    const c = pos.length / 3;
    const S = sec(r / rings);
    pos.push(S.cx || 0, (S.yb + S.yt) * 0.5, zOf(r / rings));
    uv.push(0.5, v0 + (v1 - v0) * (r / rings));
    for (let k = 0; k < seg; k++) {
      const a = r * row + k;
      if (flip) idx.push(c, a, a + 1);
      else idx.push(c, a + 1, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const zOfFoot = (s) => HEEL_Z + (TOE_Z - HEEL_Z) * s;

function upperGeometry() {
  const g = loft(
    (s) => ({ hw: halfWidth(s), yb: SOLE_TOP - 0.002, yt: Math.max(SOLE_TOP + 0.012, topY(s)), n: 2.8, cx: 0.004 * Math.sin(Math.PI * s) }),
    zOfFoot,
    { rings: 34, seg: 30, v0: 0, v1: 0.6 },
  );
  // vincos de flexão sobre os dedos (onde a bota dobra) — afunda o topo
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    const s = (z - HEEL_Z) / (TOE_Z - HEEL_Z);
    if (y > SOLE_TOP + 0.02 && s > 0.55 && s < 0.78) {
      const w = Math.sin((s - 0.55) / 0.23 * Math.PI * 3) * 0.0016 * smooth(SOLE_TOP + 0.02, SOLE_TOP + 0.045, y);
      p.setY(i, y + w);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Cano: tubo elíptico do tornozelo para cima, com colarinho acolchoado. */
function shaftGeometry() {
  const rings = 16, seg = 28, H0 = -0.045, H1 = 0.165;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = H0 + (H1 - H0) * t;
    const collar = smooth(0.82, 0.96, t) * (1 - smooth(0.97, 1, t) * 0.35);
    const rx = 0.047 + 0.006 * (1 - t) + 0.007 * collar;
    const rz = 0.055 + 0.01 * (1 - t) + 0.007 * collar;
    const oz = 0.018 - 0.006 * t;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      const th = u * TAU;
      // língua/cadarço: frente levemente achatada
      const front = Math.max(0, -Math.cos(th));
      const flat = 1 - 0.12 * Math.pow(front, 6);
      pos.push(Math.sin(th) * rx, y, Math.cos(th) * rz * flat + oz);
      uv.push(u, 0.62 + 0.38 * t);
    }
  }
  const row = seg + 1;
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < seg; k++) {
      const a = r * row + k, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // tampa de cima (interior escuro, quase nunca visível)
  const c = pos.length / 3;
  pos.push(0, H1 - 0.01, 0.012);
  uv.push(0.5, 1);
  for (let k = 0; k < seg; k++) {
    const a = rings * row + k;
    idx.push(c, a, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Solado: vira + entressola + salto, com cravos na sola. */
function soleGeometry() {
  const parts = [];
  const hw = (s) => halfWidth(Math.min(1, s * 1.0)) * 1.1 + 0.003;
  // entressola (do salto ao bico), arco levemente mais alto no meio
  const mid = loft(
    (s) => {
      const arch = smooth(0.3, 0.42, s) * (1 - smooth(0.55, 0.66, s));
      return { hw: hw(s), yb: SOLE_BOTTOM + 0.009 + arch * 0.006 - (s > 0.85 ? (s - 0.85) * 0.03 : 0), yt: SOLE_TOP + 0.004, n: 5 };
    },
    (s) => HEEL_Z + 0.006 + (TOE_Z - 0.006 - HEEL_Z - 0.006) * s,
    { rings: 30, seg: 26, v0: 0, v1: 1, flatBottom: false },
  );
  parts.push(mid);
  // cravos (lugs): blocos em chevron na sola, 9 fileiras × 2–3
  const lugs = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let r = 0; r < 11; r++) {
    const s = 0.04 + r * 0.088;
    if (s > 0.33 && s < 0.5) continue; // arco: sem cravo
    const z = HEEL_Z + (TOE_Z - HEEL_Z) * s;
    const w = halfWidth(s) * 1.05;
    const n = w > 0.04 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = n === 3 ? (i - 1) * w * 0.66 : (i - 0.5) * w * 0.8;
      const b = box.clone();
      b.scale(w * (n === 3 ? 0.52 : 0.62), 0.009, 0.034);
      b.rotateY((x > 0 ? 1 : x < 0 ? -1 : 0) * 0.45);
      b.translate(x, SOLE_BOTTOM + 0.0045, z);
      lugs.push(b);
    }
  }
  const lugG = mergeGeometries(lugs.map((g) => g.toNonIndexed()));
  // UV dos cravos: canto escuro do atlas
  const luv = lugG.attributes.uv;
  for (let i = 0; i < luv.count; i++) luv.setXY(i, 0.5 + luv.getX(i) * 0.01, 0.05 + luv.getY(i) * 0.01);
  const midN = mid.toNonIndexed();
  return mergeGeometries([midN, lugG]);
}

/** Cadarço em X + ilhoses (peito do pé) e ganchos (cano). */
function laceGeometry() {
  const parts = [];
  const cyl = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 5, 1);
  cyl.rotateZ(Math.PI / 2); // ao longo de X
  const ring = new THREE.TorusGeometry(0.0042, 0.0014, 5, 10);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  const seg = (a, b) => {
    const g = cyl.clone();
    _d.subVectors(b, a);
    const L = _d.length();
    g.scale(L, 1, 1);
    _q.setFromUnitVectors(X, _d.normalize());
    g.applyQuaternion(_q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
  };
  const eye = (p, n) => {
    const g = ring.clone();
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    g.applyQuaternion(_q);
    g.translate(p.x, p.y, p.z);
    parts.push(g);
  };
  // peito do pé (à frente do cano): 3 fileiras; fenda de ~2.4 cm
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const s = 0.47 + i * 0.075;
    const z = zOfFoot(s);
    const y = topY(s) + 0.002;
    const gap = 0.015 - 0.002 * i;
    pts.push([new THREE.Vector3(-gap, y, z), new THREE.Vector3(gap, y, z)]);
  }
  // cano: ganchos na frente
  for (let i = 0; i < 4; i++) {
    const y = 0.035 + i * 0.034;
    const z = -0.047 + i * 0.002;
    pts.unshift([new THREE.Vector3(-0.017, y, z), new THREE.Vector3(0.017, y, z)]);
  }
  // pts em ordem de cima → bico
  for (let i = 0; i < pts.length - 1; i++) {
    seg(pts[i][0], pts[i + 1][1]);
    seg(pts[i][1], pts[i + 1][0]);
  }
  seg(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  // laço no topo
  const top = pts[0];
  seg(top[0], _a.set(-0.03, top[0].y + 0.006, top[0].z - 0.012).clone());
  seg(top[1], _b.set(0.028, top[1].y - 0.014, top[1].z - 0.016).clone());
  for (const [l, r] of pts) {
    eye(l, new THREE.Vector3(-0.3, 1, -0.4).normalize());
    eye(r, new THREE.Vector3(0.3, 1, -0.4).normalize());
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  return g;
}

// ─── texturas ───────────────────────────────────────────────────────────
function hash2(x, y, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, s, px) {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const w = (a) => ((a % px) + px) % px;
  const a = hash2(w(i), j, s), b = hash2(w(i + 1), j, s), c = hash2(w(i), j + 1, s), d = hash2(w(i + 1), j + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm2(x, y, s, px, o = 5) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) {
    v += vnoise(x * f, y * f, s + i * 17, px * f) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return v / n;
}
const g22 = (v) => Math.round(Math.pow(clamp(v, 0, 1), 1 / 2.2) * 255);

/**
 * Atlas da bota (W×H): cor (sRGB), normal e ORM (R=AO, G=rugosidade).
 *   v < 0.6 : pé — camurça coyote, biqueira de couro liso (mais escura,
 *             esfolada no bico), costuras pespontadas, poeira acumulada
 *             perto da sola e nos vincos, sal/manchas d'água.
 *   v ≥ 0.62: cano — nylon cordura (trama), costura vertical.
 *   solado  : borracha preta com poeira clara nas bordas.
 */
export function bootTextures() {
  const W = 256, H = 512;
  const col = new Uint8Array(W * H * 4);
  const nrm = new Uint8Array(W * H * 4);
  const orm = new Uint8Array(W * H * 4);
  const hgt = new Float32Array(W * H);
  const alb = new Float32Array(W * H * 3);
  const rough = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const i = y * W + x;
      // "altura na seção": topo (u=0/1) → 1, base (u=0.5) → 0
      const up = 0.5 + 0.5 * Math.cos(u * TAU);
      const n1 = fbm2(u * 8, v * 16, 3, 8);
      const n2 = fbm2(u * 32, v * 64, 9, 32, 3);
      const n3 = fbm2(u * 3, v * 6, 21, 3, 4);
      let r, g, b, ro, h = 0;
      if (v < 0.6) {
        const s = v / 0.6;
        // camurça coyote (linear) com variação de nap
        const nap = 0.86 + n2 * 0.22 + (n1 - 0.5) * 0.12;
        r = 0.255 * nap; g = 0.19 * nap; b = 0.125 * nap;
        ro = 0.9 - n2 * 0.06;
        h = n2 * 0.25;
        // biqueira/contraforte de couro liso: bico (s>0.78) e calcanhar (s<0.16), parte baixa
        const capT = smooth(0.76, 0.8, s) + (1 - smooth(0.12, 0.16, s));
        const lowBand = 1 - smooth(0.42, 0.5, up);
        const cap = clamp(capT * (s > 0.5 ? 1 : lowBand), 0, 1);
        if (cap > 0) {
          const scuff = smooth(0.55, 0.8, n1 + (s > 0.9 ? 0.25 : 0)) * 0.6;
          const lr = 0.17 + scuff * 0.1, lg = 0.125 + scuff * 0.08, lb = 0.08 + scuff * 0.06;
          r = r * (1 - cap) + lr * cap; g = g * (1 - cap) + lg * cap; b = b * (1 - cap) + lb * cap;
          ro = ro * (1 - cap) + (0.52 + scuff * 0.3 + n2 * 0.1) * cap;
          h += cap * 0.15;
        }
        // costura pespontada na borda da biqueira e do contraforte
        const edge = Math.min(Math.abs(s - 0.78), Math.abs(s - 0.14));
        if (edge < 0.006) {
          const dash = Math.sin(u * 220) > -0.2 ? 1 : 0;
          h -= 0.3;
          r *= 0.7; g *= 0.7; b *= 0.7;
          if (dash && Math.abs(edge - 0.003) < 0.0016) {
            r = 0.21; g = 0.18; b = 0.13; h += 0.6;
          }
        }
        // vincos de flexão (escurecidos de poeira úmida)
        if (s > 0.55 && s < 0.78 && up > 0.6) {
          const cr = Math.pow(Math.abs(Math.sin((s - 0.55) / 0.23 * Math.PI * 3 + n1 * 2)), 8);
          h -= cr * 0.4;
          r *= 1 - cr * 0.25; g *= 1 - cr * 0.25; b *= 1 - cr * 0.25;
        }
        // poeira acumulada perto da sola e mancha de sal/água em ondas
        const dust = (1 - smooth(0.0, 0.32, up)) * (0.55 + n1 * 0.6);
        const tide = smooth(0.02, 0.0, Math.abs(up - 0.22 - (n3 - 0.5) * 0.12)) * 0.5;
        const d = clamp(dust * 0.55 + tide, 0, 0.85);
        r = r * (1 - d) + 0.42 * d; g = g * (1 - d) + 0.38 * d; b = b * (1 - d) + 0.32 * d;
        ro = ro * (1 - d) + 0.97 * d;
      } else if (v >= 0.62) {
        // cordura: trama 2×2, coyote mais acinzentado
        const t = (v - 0.62) / 0.38;
        const wx = Math.sin(u * TAU * 90), wy = Math.sin(t * TAU * 55);
        const weave = (wx > 0) !== (wy > 0) ? 1 : 0;
        const k = 0.86 + weave * 0.08 + (n2 - 0.5) * 0.1;
        r = 0.2 * k; g = 0.165 * k; b = 0.12 * k;
        ro = 0.8 + weave * 0.06;
        h = weave * 0.35 + n2 * 0.1;
        // costuras verticais (laterais) e colarinho escuro acolchoado
        const sd = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75));
        if (sd < 0.008) { h -= 0.3; r *= 0.75; g *= 0.75; b *= 0.75; }
        if (t > 0.86) {
          const c = smooth(0.86, 0.9, t);
          r = r * (1 - c) + 0.08 * c; g = g * (1 - c) + 0.07 * c; b = b * (1 - c) + 0.06 * c;
          h += Math.sin(t * 160) * 0.1 * c;
        }
        const d = (1 - smooth(0, 0.35, t)) * 0.3 * n1;
        r = r * (1 - d) + 0.4 * d; g = g * (1 - d) + 0.36 * d; b = b * (1 - d) + 0.3 * d;
      } else {
        // faixa de transição / borracha (solado e cravos)
        r = g = b = 0.035;
        ro = 0.9;
      }
      alb[i * 3] = r; alb[i * 3 + 1] = g; alb[i * 3 + 2] = b;
      rough[i] = ro;
      hgt[i] = h;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      col[i * 4] = g22(alb[i * 3]);
      col[i * 4 + 1] = g22(alb[i * 3 + 1]);
      col[i * 4 + 2] = g22(alb[i * 3 + 2]);
      col[i * 4 + 3] = 255;
      const hx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x + W - 1) % W)];
      const hy = hgt[Math.min(H - 1, y + 1) * W + x] - hgt[Math.max(0, y - 1) * W + x];
      const k = 3;
      const nx = -hx * k, ny = -hy * k, l = Math.hypot(nx, ny, 1);
      nrm[i * 4] = (nx / l * 0.5 + 0.5) * 255;
      nrm[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
      nrm[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
      nrm[i * 4 + 3] = 255;
      orm[i * 4] = 255;
      orm[i * 4 + 1] = Math.round(clamp(rough[i], 0, 1) * 255);
      orm[i * 4 + 2] = 0;
      orm[i * 4 + 3] = 255;
    }
  }
  const mk = (d, srgb) => {
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(col, true), normalMap: mk(nrm, false), roughnessMap: mk(orm, false) };
}

/** Borracha do solado: preta, cravos gastos, poeira clara nas bordas. */
export function soleTexture() {
  const W = 128, H = 256;
  const col = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const i = (y * W + x) * 4;
      const side = 0.5 + 0.5 * Math.cos(u * TAU); // topo da seção → 1
      const n = fbm2(u * 10, v * 20, 5, 10, 4);
      const dust = clamp((1 - side) * 0.5 + (n - 0.45) * 0.8, 0, 0.55);
      const k = 0.03 + n * 0.012;
      // ranhura horizontal da vira (linha escura no meio da lateral)
      const groove = Math.abs(side - 0.55) < 0.03 ? 0.6 : 1;
      col[i] = g22((k * (1 - dust) + 0.3 * dust) * groove);
      col[i + 1] = g22((k * (1 - dust) + 0.27 * dust) * groove);
      col[i + 2] = g22((k * (1 - dust) + 0.23 * dust) * groove);
      col[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(col, W, H, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Geometrias da bota (compartilhadas pelas duas pernas). */
export function bootGeometries() {
  const upper = mergeGeometries([upperGeometry().toNonIndexed(), shaftGeometry().toNonIndexed()]);
  return { upper, sole: soleGeometry(), laces: laceGeometry() };
}
