/**
 * TERRENO — a função de altura do planeta (pura, double, determinística).
 *
 * É A MESMA função que gera as malhas nos workers e que responde
 * `planet.heightAt` no thread principal: física, posicionamento e desenho
 * concordam (diferença < 5 cm no LOD mais fino: as oitavas mais finas têm
 * comprimento de onda ≥ 8 m, bem acima do espaçamento de 0,36 m da malha).
 *
 * Camadas (todas em metros, coordenadas = direção·R):
 *   1. domain warping grande (fBm vetorial) → coordenadas Q distorcidas
 *   2. continentes (fBm baixa frequência) → nível base, oceanos
 *   3. máscaras regionais: cordilheiras, cânions, platôs, pináculos
 *   4. "eroded fBm" (derivadas analíticas amortecem oitavas em encostas
 *      íngremes → vales lisos, cristas recortadas, aspecto de erosão hidráulica)
 *   5. ridged multifractal (cordilheiras afiadas)
 *   6. pináculos/colunas, "billow" (montes arredondados), crateras
 *   7. platôs em degraus (mesas) e cânions com paredes em terraço
 *   8. poços de CAVERNA (o teto é uma malha SDF — features.js)
 *   9. edições do jogador (escavar/preencher), aplicadas por fora (applyEdits)
 *
 * `spacing` (m) = espaçamento da malha que pede a amostra: oitavas com
 * comprimento de onda < 2·spacing são omitidas (sem serrilhado nos LODs
 * grossos e geração mais barata). heightAt usa spacing 0 (detalhe total).
 */
import { gnoise, gnoised, D, fbm, hash32, unit, smoothstep, clamp } from './noise.js';
import { dirFace, faceDir } from './cube.js';

/** Nível da quadtree que define as REGIÕES (features, edições persistidas). */
export const REGION_LEVEL = 9;
/** Nível das células de cratera. */
const CRATER_LEVEL = 7;

/** Dados extras da última amostra com `data = true`: umidade, erosão, variação regional, estratos, oclusão. */
export const DATA = new Float64Array(5);

/** Peso de uma oitava de comprimento de onda `lam` para uma malha de espaçamento `sp`. */
const ow = (lam, sp) => (sp <= 0 ? 1 : clamp(lam / (2 * sp) - 1, 0, 1));

/** Degrau suave: patamar quase plano e paredes íngremes (mesas). */
function terrace(h, step) {
  const t = h / step;
  const k = Math.floor(t);
  const f = t - k;
  return (k + 0.12 * f + 0.88 * smoothstep(0.62, 0.94, f)) * step;
}
/** Degraus em [0,1] (paredes de cânion). */
function terrace01(t, n) {
  const x = t * n;
  const k = Math.floor(x);
  const f = x - k;
  return Math.min(1, (k + 0.2 * f + 0.8 * smoothstep(0.55, 0.9, f)) / n);
}

export function createTerrain(cfg) {
  const R = cfg.radius;
  const S = cfg.style;
  const seed = cfg.seed >>> 0;
  const sea = cfg.seaLevel == null ? null : cfg.seaLevel;
  const sd = (k) => hash32(seed, 0x5eed, k) | 0;
  const sW = sd(1), sC = sd(2), sM = sd(3), sK = sd(4), sP = sd(5), sS = sd(6), sH = sd(7), sR = sd(8);
  const sK2 = sd(9), sK3 = sd(10), sSp = sd(11), sB = sd(12), sMo = sd(13), sRv = sd(14), sDet = sd(15);
  const FT = cfg.features;
  const featTotal = FT.arch + FT.floatArch + FT.floating + FT.cave;

  // limites conservadores de altura (estimativa de LOD/horizonte)
  const maxH = 900 + S.hillAmp * 1.6 + S.ridgeAmp * 1.25 + S.spires * 260 + S.billow * 200;
  const minH = (sea !== null ? -2600 : -900) - S.canyonDepth - S.hillAmp * 1.6 - 120;

  const siteCache = new Map();
  const craterCache = new Map();
  const fc = [0, 0, 0];
  const fd = [0, 0, 0];

  /**
   * Núcleo: altura (m) na direção unitária (x,y,z). `data` preenche DATA.
   * `feats` = false ignora os poços de caverna (usado para posicionar os próprios sítios).
   */
  function core(x, y, z, sp, data, feats) {
    const px = x * R, py = y * R, pz = z * R;
    // 1. warp
    const kw = 1 / 23000;
    const ax = px * kw, ay = py * kw, az = pz * kw;
    const qx = px + fbm(ax, ay, az, sW, 2) * S.warp;
    const qy = py + fbm(ax + 31.7, ay - 11.3, az + 5.1, sW + 7, 2) * S.warp;
    const qz = pz + fbm(ax - 17.9, ay + 23.3, az - 8.6, sW + 13, 2) * S.warp;
    // 2. continentes
    const kc = 1 / 95000;
    const c = fbm(qx * kc, qy * kc, qz * kc, sC, 4) * 1.7 + S.landBias;
    let h;
    if (sea !== null) h = c > 0 ? 12 + c * 520 : c * 1500;
    else h = c * 420;
    // 3. máscaras
    const km = 1 / 26000;
    const mMount = smoothstep(-0.3, 0.3, fbm(qx * km + 7.3, qy * km, qz * km, sM, 2) * 1.5 + (S.mountains - 0.7)) * Math.min(1, S.mountains * 1.2);
    const mCanyon = S.canyons > 0 ? smoothstep(0.35 - S.canyons * 0.55, 0.6 - S.canyons * 0.55, gnoise(qx / 40000, qy / 40000, qz / 40000, sK)) : 0;
    const mPlat = S.plateaus > 0 ? smoothstep(0.35 - S.plateaus * 0.6, 0.55 - S.plateaus * 0.6, gnoise(qx / 31000 + 3.3, qy / 31000, qz / 31000, sP)) : 0;
    const mSpire = S.spires > 0 ? smoothstep(0.35 - S.spires * 0.5, 0.6 - S.spires * 0.5, gnoise(qx / 18000, qy / 18000 + 9.1, qz / 18000, sS)) : 0;
    // 4. eroded fBm
    let a = 0, b = 1, f = 1 / S.hillWave, lam = S.hillWave;
    let dx = 0, dy = 0, dz = 0, er = 0, eb = 0;
    for (let i = 0; i < 9; i++) {
      const w = ow(lam, sp);
      if (w <= 0) break;
      const n = gnoised(qx * f + i * 3.1, qy * f - i * 1.7, qz * f + i * 2.3, sH + i * 977);
      let gx = D[0], gy = D[1], gz = D[2];
      const gn = gx * x + gy * y + gz * z;
      gx -= gn * x;
      gy -= gn * y;
      gz -= gn * z;
      dx += gx;
      dy += gy;
      dz += gz;
      const damp = 1 / (1 + 0.85 * (dx * dx + dy * dy + dz * dz));
      a += b * n * damp * w;
      er += damp * b;
      eb += b;
      b *= 0.47;
      f *= 2.02;
      lam /= 2.02;
    }
    const erosion = eb > 0 ? er / eb : 1;
    h += a * S.hillAmp * (0.55 + 0.9 * mMount);
    // 5. ridged multifractal
    if (mMount > 0.002) {
      let rs = 0, ra = 1, rw = 1, fr = 1 / S.ridgeWave;
      lam = S.ridgeWave;
      for (let i = 0; i < 7; i++) {
        const w = ow(lam, sp);
        if (w <= 0) break;
        let n = 1 - Math.abs(gnoise(qx * fr + i * 1.3, qy * fr, qz * fr - i * 0.7, sR + i * 31));
        n *= n;
        n *= rw;
        rw = clamp(n * 1.9, 0, 1);
        rs += n * ra * w;
        ra *= 0.5;
        fr *= 2.1;
        lam /= 2.1;
      }
      h += Math.pow(rs / 1.25, 1.35) * S.ridgeAmp * mMount;
    }
    // 6a. billow: montes arredondados (tóxico)
    if (S.billow > 0) {
      const kb = 1 / 1100;
      const n1 = Math.abs(gnoise(qx * kb, qy * kb, qz * kb, sB));
      const n2 = ow(450, sp) * Math.abs(gnoise(qx * kb * 2.4, qy * kb * 2.4, qz * kb * 2.4, sB + 3));
      h += (n1 * 0.75 + n2 * 0.25) * 190 * S.billow;
    }
    // 6b. pináculos: colunas de topo plano e lados quase verticais
    let strata = 0;
    if (mSpire > 0.01) {
      const ks = 1 / 850;
      const n = gnoise(qx * ks, qy * ks, qz * ks, sSp) + 0.25 * ow(300, sp) * gnoise(qx * ks * 3, qy * ks * 3, qz * ks * 3, sSp + 1);
      const col = smoothstep(0.3, 0.44, n);
      if (col > 0) {
        h += col * (140 + 160 * (n - 0.34)) * mSpire * 1.6;
        strata = Math.max(strata, col * mSpire);
      }
    }
    // 6c. crateras (células na face do cubo)
    if (S.craters > 0) h += craters(x, y, z) * S.craters;
    // 7a. platôs em degraus (só em terra)
    if (mPlat > 0.01 && (sea === null || h > sea + 20)) {
      // degraus irregulares: altura do degrau e deslocamento variam no espaço
      const tv = gnoise(qx / 2600, qy / 2600, qz / 2600, sP + 7);
      const step = S.terraceStep * (0.75 + 0.5 * tv);
      const off = step * gnoise(qx / 900, qy / 900, qz / 900, sP + 9);
      const ht = terrace(h + off, step) - off;
      const k = mPlat * (sea === null ? 1 : smoothstep(sea + 20, sea + 120, h));
      h += (ht - h) * k;
      strata = Math.max(strata, k);
    }
    // 7b. cânions: rede de linhas |ruído| ≈ 0 com paredes em terraço
    if (mCanyon > 0.01) {
      const kk = 1 / 12000;
      let v = gnoise(qx * kk, qy * kk, qz * kk, sK2) + 0.32 * gnoise(qx * kk * 2.9, qy * kk * 2.9, qz * kk * 2.9, sK3);
      v = Math.abs(v);
      const wc = 0.085;
      if (v < wc) {
        const t = terrace01(v / wc, 4);
        h -= S.canyonDepth * mCanyon * (1 - t);
        strata = Math.max(strata, mCanyon * (1 - t * 0.6));
      }
    }
    // detalhe fino de rocha (cristas de 30 m) onde há relevo/estratos
    if (sp < 12) {
      const w = ow(30, sp);
      h += gnoise(qx / 30, qy / 30, qz / 30, sDet) * 2.2 * w * (0.3 + strata + mMount * 0.7);
    }
    // 8. poços de caverna
    let ao = 1;
    if (feats && FT.cave > 0) {
      dirFace(x, y, z, fc);
      const n = 1 << REGION_LEVEL;
      const i = Math.min(n - 1, Math.floor(((fc[1] + 1) / 2) * n));
      const j = Math.min(n - 1, Math.floor(((fc[2] + 1) / 2) * n));
      const s = site(fc[0], i, j);
      if (s && s.type === 'cave') {
        const ddx = x - s.dir[0], ddy = y - s.dir[1], ddz = z - s.dir[2];
        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) * R;
        if (dist < s.rp * 1.25) {
          const k = 1 - smoothstep(s.rp * 0.4, s.rp * 1.15, dist);
          h += (s.h - s.dp - h) * k;
          ao = 1 - 0.85 * (1 - smoothstep(s.rp * 0.7, s.rp * 1.1, dist));
        }
      }
    }
    if (data) {
      const kmo = 1 / 16000;
      let moist = 0.5 + 0.55 * fbm(qx * kmo, qy * kmo, qz * kmo, sMo, 3);
      moist += (erosion - 0.6) * 0.5; // vales (erosão) mais úmidos
      if (sea !== null) moist += 0.25 * (1 - smoothstep(sea, sea + 300, h));
      DATA[0] = clamp(moist, 0, 1);
      DATA[1] = clamp(erosion, 0, 1);
      DATA[2] = clamp(0.5 + 0.7 * fbm(qx / 7000 + 2.2, qy / 7000, qz / 7000, sRv, 2), 0, 1);
      DATA[3] = clamp(strata * S.strata * 1.3, 0, 1);
      DATA[4] = ao;
    }
    return h;
  }

  /** Crateras: até uma por célula (nível CRATER_LEVEL), bacia + borda elevada. */
  function craters(x, y, z) {
    dirFace(x, y, z, fc);
    const n = 1 << CRATER_LEVEL;
    const ci = Math.floor(((fc[1] + 1) / 2) * n), cj = Math.floor(((fc[2] + 1) / 2) * n);
    let sum = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const key = (fc[0] * n + i) * n + j;
        let cr = craterCache.get(key);
        if (cr === undefined) {
          const hh = hash32(seed, 0xc4a7, fc[0], i, j);
          if (unit(hh) > 0.55) cr = null;
          else {
            const u = -1 + (2 * (i + unit(hash32(hh, 1)))) / n;
            const v = -1 + (2 * (j + unit(hash32(hh, 2)))) / n;
            faceDir(fc[0], u, v, fd);
            const size = (R * Math.PI) / 2 / n;
            const rr = size * (0.12 + 0.55 * Math.pow(unit(hash32(hh, 3)), 2.2));
            cr = { x: fd[0], y: fd[1], z: fd[2], r: rr };
          }
          if (craterCache.size > 4096) craterCache.clear();
          craterCache.set(key, cr);
        }
        if (!cr) continue;
        const ddx = x - cr.x, ddy = y - cr.y, ddz = z - cr.z;
        const d = (Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) * R) / cr.r;
        if (d > 2.2) continue;
        const depth = cr.r * 0.22;
        if (d < 1) sum += depth * (d * d - 1) * 0.9 + depth * 0.25;
        else sum += depth * 0.25 * Math.exp(-((d - 1) * (d - 1)) / 0.12);
      }
    }
    return sum;
  }

  /** Sítio de feature de uma região (cacheado; determinístico). */
  function site(face, i, j) {
    const n = 1 << REGION_LEVEL;
    const key = (face * n + i) * n + j;
    let s = siteCache.get(key);
    if (s !== undefined) return s;
    s = null;
    const hh = hash32(seed, 0xfea7, face, i, j);
    const r0 = unit(hh);
    if (r0 < featTotal) {
      let type;
      if (r0 < FT.arch) type = 'arch';
      else if (r0 < FT.arch + FT.floatArch) type = 'floatArch';
      else if (r0 < FT.arch + FT.floatArch + FT.floating) type = 'floating';
      else type = 'cave';
      const u = -1 + (2 * (i + 0.22 + 0.56 * unit(hash32(hh, 1)))) / n;
      const v = -1 + (2 * (j + 0.22 + 0.56 * unit(hash32(hh, 2)))) / n;
      const dir = faceDir(face, u, v, [0, 0, 0]);
      const h = core(dir[0], dir[1], dir[2], 0, false, false);
      let ok = true;
      if (sea !== null && h < sea + 3 && type !== 'floating' && type !== 'floatArch') ok = false;
      if (type === 'cave') {
        // precisa de chão razoavelmente plano: 4 amostras a 14 m
        const e = 14 / R;
        let dmax = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          faceDir(face, u + ox * e * 1.3, v + oy * e * 1.3, fd);
          dmax = Math.max(dmax, Math.abs(core(fd[0], fd[1], fd[2], 0, false, false) - h));
        }
        if (dmax > 7) ok = false;
      }
      if (ok) {
        const g = (k) => unit(hash32(hh, 100 + k));
        s = { type, face, i, j, key, hash: hh, dir, h, u, v };
        if (type === 'cave') {
          s.rp = 13 + 9 * g(1);
          s.dp = 5 + 3 * g(2);
          s.yaw = g(3) * Math.PI * 2;
        }
      }
    }
    if (siteCache.size > 20000) siteCache.clear();
    siteCache.set(key, s);
    return s;
  }

  /** Sítios num raio (m) em torno da direção — percorre a grade de regiões no plano tangente. */
  function sitesNear(x, y, z, radius) {
    const out = new Map();
    const regionArc = (R * Math.PI) / 2 / (1 << REGION_LEVEL);
    const step = regionArc * 0.5;
    const nS = Math.ceil(radius / step);
    // triedo local
    let ex = -z, ey = 0, ez = x; // up × Y ≈ leste
    let el = Math.hypot(ex, ey, ez);
    if (el < 1e-6) {
      ex = 1;
      ey = 0;
      ez = 0;
      el = 1;
    }
    ex /= el;
    ey /= el;
    ez /= el;
    const nx = y * ez - z * ey, ny = z * ex - x * ez, nz = x * ey - y * ex;
    const n = 1 << REGION_LEVEL;
    for (let b = -nS; b <= nS; b++) {
      for (let a = -nS; a <= nS; a++) {
        const ox = a * step, oy = b * step;
        if (ox * ox + oy * oy > radius * radius) continue;
        const px = x + (ex * ox + nx * oy) / R, py = y + (ey * ox + ny * oy) / R, pz = z + (ez * ox + nz * oy) / R;
        dirFace(px, py, pz, fc);
        const i = Math.min(n - 1, Math.floor(((fc[1] + 1) / 2) * n));
        const j = Math.min(n - 1, Math.floor(((fc[2] + 1) / 2) * n));
        const key = (fc[0] * n + i) * n + j;
        if (out.has(key)) continue;
        out.set(key, site(fc[0], i, j));
      }
    }
    return [...out.values()].filter(Boolean);
  }

  return {
    cfg,
    R,
    sea,
    maxH,
    minH,
    /** Altura (m) na direção unitária. */
    height(x, y, z, sp = 0) {
      return core(x, y, z, sp, false, true);
    },
    /** Altura + DATA preenchido. */
    sample(x, y, z, sp = 0) {
      return core(x, y, z, sp, true, true);
    },
    site,
    sitesNear,
  };
}

/**
 * Edições (escavar/preencher) sobre a coluna do heightfield. Cada edição é
 * uma esfera { x, y, z (m, relativos ao centro do planeta), r, s (±1) }.
 * Escavar remove o volume da esfera (o que estava acima "desaba" pela corda);
 * preencher acrescenta a corda. Bordas suaves (a corda → 0 na borda).
 */
export function applyEdits(x, y, z, R, h, edits) {
  for (let k = 0; k < edits.length; k++) {
    const e = edits[k];
    const t = e.x * x + e.y * y + e.z * z;
    const c2 = e.x * e.x + e.y * e.y + e.z * e.z - t * t;
    const r2 = e.r * e.r;
    if (c2 >= r2 || t <= 0) continue;
    const kk = Math.sqrt(r2 - c2);
    const bottom = t - kk - R, top = t + kk - R;
    if (e.s < 0) h -= clamp(h - bottom, 0, top - bottom);
    else h += clamp(top - Math.max(h, bottom), 0, top - bottom);
  }
  return h;
}
