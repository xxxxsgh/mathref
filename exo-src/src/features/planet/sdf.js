/**
 * FEATURES SDF (puro — worker): arcos, arcos flutuantes, rochas suspensas e
 * cavernas (domo de rocha com entrada + túnel curto sobre o poço que o
 * terreno cava). Cada sítio é decidido por região em terrain.js (mesma seed →
 * mesmo lugar); aqui viramos a SDF local em malha.
 *
 * Extração: SURFACE NETS (variante dual do marching cubes: um vértice por
 * célula cruzada, na média dos cruzamentos das arestas; quads nas arestas
 * com troca de sinal) — malha mais limpa que o MC clássico e sem tabelas.
 * Normais = gradiente da SDF; oclusão = amostras da SDF ao longo da normal.
 *
 * Coordenadas locais: x = leste, y = norte, z = cima, origem no chão do
 * sítio (âncora = dir·(R + h)). Saída já girada para os eixos do mundo,
 * relativa à âncora.
 */
import { gnoise, fbm, hash32, unit, clamp } from './noise.js';
import { terrainFor } from './mesher.js';

const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};
const ellip = (x, y, z, a, b, c) => {
  // aproximação de distância a elipsoide (IQ)
  const k0 = Math.sqrt((x * x) / (a * a) + (y * y) / (b * b) + (z * z) / (c * c));
  const k1 = Math.sqrt((x * x) / (a * a * a * a) + (y * y) / (b * b * b * b) + (z * z) / (c * c * c * c));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b, c);
};
const capsule = (x, y, z, ax, ay, az, bx, by, bz, r) => {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
};

/** Monta a SDF do sítio. Devolve { f(x,y,z), box:[x0,y0,z0,x1,y1,z1], kind }. */
export function siteSDF(T, s) {
  const R = T.R;
  const g = (k) => unit(hash32(s.hash, 300 + k));
  const ns = s.hash | 0;
  // triedo local (igual ao core/Geo.tangentFrame)
  const ux = s.dir[0], uy = s.dir[1], uz = s.dir[2];
  let nx = -ux * uy, ny = 1 - uy * uy, nz = -uz * uy;
  let nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9) {
    nx = -1 + ux * ux;
    ny = ux * uy;
    nz = ux * uz;
    nl = Math.hypot(nx, ny, nz);
  }
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const ex = ny * uz - nz * uy, ey = nz * ux - nx * uz, ez = nx * uy - ny * ux;
  const frame = { e: [ex, ey, ez], n: [nx, ny, nz], u: [ux, uy, uz] };
  /** altura do chão (local z) num ponto local (x, y) */
  const ground = (x, y) => {
    const dx = ux + (ex * x + nx * y) / R, dy = uy + (ey * x + ny * y) / R, dz = uz + (ez * x + nz * y) / R;
    const l = Math.hypot(dx, dy, dz);
    // a queda da curvatura ((x²+y²)/2R ≈ 1 cm a 50 m) é desprezível
    return T.height(dx / l, dy / l, dz / l, 0) - s.h;
  };
  const rock = (x, y, z, amp, sc) => amp * (fbm(x / sc, y / sc, z / sc, ns, 3) + 0.25 * gnoise(x / (sc * 0.3), y / (sc * 0.3), z / (sc * 0.3), ns + 9));

  if (s.type === 'arch' || s.type === 'floatArch') {
    const floating = s.type === 'floatArch';
    const span = floating ? 30 + 60 * g(1) : 34 + 66 * g(1);
    const a = span / 2;
    const Hs = span * (floating ? 0.35 + 0.3 * g(2) : 0.5 + 0.55 * g(2));
    const t0 = 3.5 + span * 0.075 * (0.7 + 0.7 * g(3));
    const yaw = g(4) * Math.PI * 2;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const lift = floating ? 45 + 90 * g(5) : 0;
    const tilt = floating ? (g(6) - 0.5) * 0.9 : 0;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    // pés no chão: base abaixo do ponto mais baixo sob as pernas
    let z0 = 0;
    if (!floating) z0 = Math.min(0, ground(cy * a, sy * a), ground(-cy * a, -sy * a)) - 4;
    const b = Hs - z0;
    const f = (x, y, z) => {
      // eixo do arco no plano xr–z
      let xr = x * cy + y * sy;
      let yr = -x * sy + y * cy;
      let zz = z - z0 - lift;
      if (floating) {
        const y2 = yr * ct - zz * st;
        zz = yr * st + zz * ct;
        yr = y2;
      }
      const qz = (zz * a) / b;
      const rq = Math.hypot(xr, qz);
      const th = Math.atan2(qz, xr);
      const sn = Math.sin(th);
      let d;
      if (floating) {
        const t = t0 * Math.max(0, sn + 0.18) * 1.1;
        d = Math.hypot(rq - a, yr / 1.25) - t;
      } else if (qz >= 0) {
        const t = t0 * (0.75 + 0.7 * (1 - sn));
        d = Math.hypot(rq - a, yr / 1.35) - t;
      } else {
        d = Math.hypot(Math.abs(xr) - a, yr / 1.35) - t0 * 1.45;
      }
      d *= Math.min(1, b / a);
      d += rock(x, y, z, 1.1 + t0 * 0.06, 11);
      d += 0.6 * Math.sin(z * 0.55 + 2.5 * gnoise(x / 14, y / 14, z / 14, ns + 3));
      return d;
    };
    const m = t0 * 2.4 + 4;
    const zmin = floating ? lift - 25 : z0 - 2;
    const zmax = floating ? lift + Hs + m + 20 : Hs + m;
    const ext = a + m;
    return { f, box: [-ext, -ext, zmin, ext, ext, zmax], frame, kind: s.type, lift };
  }

  if (s.type === 'floating') {
    const k = 1 + Math.floor(g(1) * 4);
    const base = 70 + 120 * g(2);
    const isl = [];
    for (let i = 0; i < k; i++) {
      const r = (i === 0 ? 20 : 9) + 24 * g(10 + i);
      const ang = g(20 + i) * Math.PI * 2;
      const dd = i === 0 ? 0 : 25 + 45 * g(30 + i);
      isl.push({ x: Math.cos(ang) * dd, y: Math.sin(ang) * dd, z: base + (g(40 + i) - 0.5) * 40, r });
    }
    const f = (x, y, z) => {
      let d = 1e9;
      for (const o of isl) {
        const px = x - o.x, py = y - o.y, pz = z - o.z;
        let di = ellip(px, py, pz, o.r, o.r * 0.92, o.r * 0.45);
        const dd = ellip(px, py, pz + o.r * 0.75, o.r * 0.72, o.r * 0.66, o.r * 1.45);
        di = smin(di, dd, o.r * 0.35);
        di = Math.max(di, pz - o.r * 0.22);
        di += rock(x, y, z, 0.1 * o.r + 0.8, Math.max(4, o.r * 0.35));
        d = Math.min(d, di);
      }
      return d;
    };
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const o of isl) {
      const m = o.r * 1.35 + 3;
      x0 = Math.min(x0, o.x - m);
      y0 = Math.min(y0, o.y - m);
      x1 = Math.max(x1, o.x + m);
      y1 = Math.max(y1, o.y + m);
      z0 = Math.min(z0, o.z - o.r * 2.5 - 3);
      z1 = Math.max(z1, o.z + o.r * 0.4 + 3);
    }
    return { f, box: [x0, y0, z0, x1, y1, z1], frame, kind: 'floating', lift: base };
  }

  // caverna: domo oco + lóbulo do túnel + entrada (cápsula) + clarabóia
  const rp = s.rp, dp = s.dp;
  const A = rp * 1.28, Hc = rp * 0.8 + 4;
  const th = 3 + 1.5 * g(1);
  const yaw = s.yaw;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const lr = 4 + 1.5 * g(2);
  const skyX = (g(3) - 0.5) * rp * 0.6, skyY = (g(4) - 0.5) * rp * 0.6;
  const f = (x, y, z) => {
    const xr = x * cy + y * sy, yr = -x * sy + y * cy;
    let d = ellip(xr, yr, z, A, A * 0.92, Hc);
    d = smin(d, ellip(xr - A * 0.95, yr, z + 1, A * 0.75, A * 0.55, Hc * 0.7), 4);
    const inner = ellip(xr, yr, z + dp * 0.4, A - th, A * 0.92 - th, Hc - th + dp * 0.4);
    d = Math.max(d, -inner);
    // entrada + túnel curto descendo para o poço
    d = Math.max(d, -capsule(xr, yr, z, A * 1.9, 0, lr * 0.55, A * 0.2, 0, -dp * 0.55, lr));
    // clarabóia
    d = Math.max(d, -capsule(x, y, z, skyX, skyY, Hc + 6, skyX * 0.9, skyY * 0.9, Hc - th - 4, 1.6 + g(5) * 1.4));
    d += rock(x, y, z, 1.3, 6);
    return d;
  };
  const ext = A * 2 + 6;
  return { f, box: [-ext, -ext, -dp - 6, ext, ext, Hc + 6], frame, kind: 'cave', lift: 0 };
}

/**
 * payload: { cfg, face, i, j, res } → { pos, nor (Int8 ×4: normal + oclusão), data (Uint8 ×4), index, anchor, bounds, kind }
 */
export function buildFeature(p) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const T = terrainFor(p.cfg);
  const s = T.site(p.face, p.i, p.j);
  if (!s) return { empty: true };
  const S = siteSDF(T, s);
  const [x0, y0, z0, x1, y1, z1] = S.box;
  const ext = Math.max(x1 - x0, y1 - y0, z1 - z0);
  const cs = ext / (p.res || 56);
  const nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1, nz = Math.ceil((z1 - z0) / cs) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) F[id(i, j, k)] = S.f(x0 + i * cs, y0 + j * cs, z0 + k * cs);
    }
  }
  // borda do volume sempre "fora" (malha fechada)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) F[id(i, j, k)] = Math.max(F[id(i, j, k)], cs * 0.5);
  }
  // vértices: um por célula com troca de sinal
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const vx = [], vy = [], vz = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) {
          const va = cv[a], vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellV[cid(i, j, k)] = vx.length;
        vx.push(x0 + (i + sx / n) * cs);
        vy.push(y0 + (j + sy / n) * cs);
        vz.push(z0 + (k + sz / n) * cs);
      }
    }
  }
  // quads nas arestas da grade com troca de sinal
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const fa = F[id(i, j, k)], fb = F[id(i + 1, j, k)];
        if (fa < 0 === fb < 0) continue;
        // eixo x; plano (y, z)
        quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], !(fa < 0));
      }
    }
  }
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const fa = F[id(i, j, k)], fb = F[id(i, j + 1, k)];
        if (fa < 0 === fb < 0) continue;
        // eixo y; plano (z, x)
        quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], !(fa < 0));
      }
    }
  }
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const fa = F[id(i, j, k)], fb = F[id(i, j, k + 1)];
        if (fa < 0 === fb < 0) continue;
        // eixo z; plano (x, y)
        quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], !(fa < 0));
      }
    }
  }
  const nv = vx.length;
  const fr = S.frame;
  const pos = new Float32Array(nv * 3);
  const nor = new Int8Array(nv * 4);
  const data = new Uint8Array(nv * 4);
  const e = cs * 0.5;
  let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  const rv = unit(hash32(s.hash, 5)) * 255;
  for (let v = 0; v < nv; v++) {
    const x = vx[v], y = vy[v], z = vz[v];
    let gx = S.f(x + e, y, z) - S.f(x - e, y, z);
    let gy = S.f(x, y + e, z) - S.f(x, y - e, z);
    let gz = S.f(x, y, z + e) - S.f(x, y, z - e);
    const gl = 1 / (Math.hypot(gx, gy, gz) || 1);
    gx *= gl;
    gy *= gl;
    gz *= gl;
    // oclusão por SDF ao longo da normal
    let occ = 0, w = 1;
    for (let q = 1; q <= 4; q++) {
      const hq = q * cs * 1.6;
      occ += w * Math.max(0, hq - S.f(x + gx * hq, y + gy * hq, z + gz * hq));
      w *= 0.5;
    }
    const ao = clamp(1 - occ / (cs * 2.2), 0.15, 1);
    // local → mundo (relativo à âncora)
    const wx = fr.e[0] * x + fr.n[0] * y + fr.u[0] * z;
    const wy = fr.e[1] * x + fr.n[1] * y + fr.u[1] * z;
    const wz = fr.e[2] * x + fr.n[2] * y + fr.u[2] * z;
    pos[v * 3] = wx;
    pos[v * 3 + 1] = wy;
    pos[v * 3 + 2] = wz;
    if (wx < bx0) bx0 = wx;
    if (wy < by0) by0 = wy;
    if (wz < bz0) bz0 = wz;
    if (wx > bx1) bx1 = wx;
    if (wy > by1) by1 = wy;
    if (wz > bz1) bz1 = wz;
    nor[v * 4] = (fr.e[0] * gx + fr.n[0] * gy + fr.u[0] * gz) * 127;
    nor[v * 4 + 1] = (fr.e[1] * gx + fr.n[1] * gy + fr.u[1] * gz) * 127;
    nor[v * 4 + 2] = (fr.e[2] * gx + fr.n[2] * gy + fr.u[2] * gz) * 127;
    nor[v * 4 + 3] = ao * 127;
    data[v * 4] = 110;
    data[v * 4 + 1] = 130;
    data[v * 4 + 2] = rv;
    data[v * 4 + 3] = 230;
  }
  const index = nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  const R = T.R;
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    pos, nor, data, index,
    anchor: [s.dir[0] * (R + s.h), s.dir[1] * (R + s.h), s.dir[2] * (R + s.h)],
    bounds: { cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2, cz: (bz0 + bz1) / 2, r: Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2 },
    kind: S.kind,
    lift: S.lift,
    ms: t1 - t0,
    tris: idx.length / 3,
  };
}
