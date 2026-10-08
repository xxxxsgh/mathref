// Relevo procedural por bioma — FUNÇÃO DE ALTURA ÚNICA da CPU.
//
// É a mesma função que gera os vértices dos chunks (no worker ou no laço
// principal) e que responde às consultas de colisão/pouso: o que a GPU
// desenha é exatamente o que a CPU calcula (a malha é construída a partir
// desta função), então nave e jogador pisam no chão que se vê.
//
// Entrada: direção unitária no referencial LOCAL do planeta. Saída (out):
//   h  altura em metros relativa ao raio (nível do mar = 0 quando há mar)
//   m  variação/umidade 0..1 (mistura de cores, vegetação)
//   s  máscara especial 0..1 por bioma: exuberante = rio/várzea, desértico =
//      areia de duna, gelado = geleira, vulcânico = lava, morto = ejeção
//      fresca de cratera, tóxico = poça ácida
//   q  crista/estrato 0..1 (rocha exposta, camadas)
//
// Sem dependências de three: roda no Web Worker.
import { Noise } from '../../core/Rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Descritor serializável (vai para o worker). */
export function terrainDesc(body) {
  return {
    id: body.id, type: body.type, kind: body.kind, seed: body.seed >>> 0, radius: body.radius,
    amp: body.terrainAmplitude || 2000, sea: body.seaLevel ?? null,
  };
}

// hash inteiro 3D → [0,1)
function hash3(x, y, z, s) {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export class Terrain {
  constructor(desc) {
    this.d = desc;
    this.R = desc.radius;
    this.amp = Math.min(desc.amp, desc.radius * 0.04); // relevo máximo proporcional ao raio
    this.type = desc.type;
    this.kind = desc.kind;
    this.k = desc.radius / 1000; // direção unitária → km
    this.n = new Noise(desc.seed);
    this.n2 = new Noise((desc.seed ^ 0x5bd1e995) >>> 0);
    this.s0 = desc.seed | 0;
    this.hasSea = desc.sea !== null && desc.sea !== undefined;
    this.seaFrac = this.hasSea ? desc.sea : 0;
    const t = this.type;
    // vento dominante (dunas) e eixos de padrões
    const a = (desc.seed % 1000) / 1000 * Math.PI * 2;
    this.W = norm([Math.cos(a), 0.25, Math.sin(a)]);
    this.W2 = norm([-Math.sin(a) * 0.8, 0.6, Math.cos(a) * 0.8]);
    this.fn = t === 'desert' ? this.desert : t === 'ice' ? this.ice : t === 'volcanic' ? this.volcanic
      : t === 'dead' ? this.dead : t === 'gas' ? this.gas : this.lush; // lush/ocean/toxic
    this._o = { h: 0, m: 0, s: 0, q: 0 };
    // nível de lava (vulcânico) e de líquido (tóxico/oceano usam o mar)
    this.lavaLevel = -70;
  }

  fbm(n, x, y, z, oct, lac = 2.03, gain = 0.5) {
    let a = 1, f = 1, s = 0, w = 0;
    for (let o = 0; o < oct; o++) { s += a * n.noise3(x * f, y * f, z * f); w += a; a *= gain; f *= lac; }
    return s / w;
  }
  ridged(n, x, y, z, oct, lac = 2.07, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, w = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(n.noise3(x * f, y * f, z * f));
      v *= v * w; w = clamp(v * 2, 0, 1);
      s += v * a; tot += a; a *= gain; f *= lac;
    }
    return s / tot;
  }
  /** Células de Worley: distância ao ponto mais próximo (unidades de célula) + hash da célula. */
  cell(x, y, z, salt, out) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let d1 = 9, d2 = 9, hid = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cx = ix + a, cy = iy + b, cz = iz + c;
      const s = this.s0 ^ salt;
      const px = cx + 0.15 + 0.7 * hash3(cx, cy, cz, s), py = cy + 0.15 + 0.7 * hash3(cx, cy, cz, s ^ 0x1234567), pz = cz + 0.15 + 0.7 * hash3(cx, cy, cz, s ^ 0x7654321);
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < d1) { d2 = d1; d1 = d; hid = hash3(cx, cy, cz, s ^ 0x55aa55); } else if (d < d2) d2 = d;
    }
    out.d1 = Math.sqrt(d1); out.d2 = Math.sqrt(d2); out.id = hid;
    return out;
  }

  /** Amostra completa. (x,y,z) = direção unitária local. */
  sample(x, y, z, out = this._o) {
    out.h = 0; out.m = 0.5; out.s = 0; out.q = 0;
    this.fn(x, y, z, out);
    return out;
  }
  height(x, y, z) { return this.sample(x, y, z, this._o).h; }

  // ─── exuberante / oceânico / tóxico ─────────────────────────────────────
  lush(x, y, z, out) {
    const k = this.k, X = x * k, Y = y * k, Z = z * k;
    const n = this.n, n2 = this.n2, amp = this.amp;
    const ocean = this.type === 'ocean', toxic = this.type === 'toxic';
    // domínio torcido: litorais recortados, penínsulas
    const wf = 0.022;
    const wx = this.fbm(n2, X * wf + 5.2, Y * wf, Z * wf, 3) * 22;
    const wy = this.fbm(n2, X * wf, Y * wf + 9.1, Z * wf, 3) * 22;
    const wz = this.fbm(n2, X * wf, Y * wf, Z * wf + 1.7, 3) * 22;
    const Xw = X + wx, Yw = Y + wy, Zw = Z + wz;
    const cf = ocean ? 0.05 : 0.03;
    let c = this.fbm(n, Xw * cf, Yw * cf, Zw * cf, 6, 2.1, 0.52);
    c += (0.5 - this.seaFrac) * 0.5;
    let h;
    let land = 0;
    if (c < 0) {
      // plataforma continental rasa → talude → planície abissal
      const sh = sstep(0, 0.1, -c);
      h = -6 - sh * 700 - Math.max(0, -c - 0.1) * 2600;
    } else {
      land = sstep(0, 0.05, c);
      h = c * (ocean ? 380 : 520);
    }
    // colinas
    const hills = this.fbm(n, X * 0.22, Y * 0.22, Z * 0.22, 4);
    h += hills * 110 * sstep(-0.02, 0.1, c);
    // montanhas (cordilheiras ao longo de cristas)
    const mm = sstep(0.14, 0.42, c + this.fbm(n2, X * 0.05 + 3, Y * 0.05, Z * 0.05, 3) * 0.3) * (ocean ? 0.6 : 1);
    let ridge = 0;
    if (mm > 0.001) {
      ridge = this.ridged(n, Xw * 0.075, Yw * 0.075, Zw * 0.075, 7);
      const r = Math.pow(ridge, toxic ? 1.2 : 1.45);
      h += r * amp * mm * (toxic ? 0.8 : 1.25);
    }
    // vales de rios: linhas de zero de um ruído torcido
    let wet = 0;
    if (h > -10) {
      const rv = Math.abs(this.fbm(n2, Xw * 0.05 + 11, Yw * 0.05, Zw * 0.05, 3));
      const valley = 1 - sstep(0, 0.13, rv);
      const chan = 1 - sstep(0.008, 0.024, rv);
      const low = 1 - sstep(200, 1100, h);
      h -= valley * low * Math.max(0, h) * 0.65;
      const cut = chan * low * land;
      h = lerp(h, -5, cut);
      wet = Math.max(valley * low * 0.8, chan * low);
    }
    // praias suaves
    if (h > 0 && h < 30) h = h * (0.45 + 0.55 * h / 30);
    // pináculos tóxicos (fungos petrificados)
    if (toxic && h > 20) {
      this.cell(X * 1.6, Y * 1.6, Z * 1.6, 77, _c);
      if (_c.d1 < 0.22) h += (1 - _c.d1 / 0.22) ** 2 * 60 * (0.5 + _c.id);
    }
    // detalhe fino (escala de caminhada)
    const det = this.fbm(n, X * 2.4, Y * 2.4, Z * 2.4, 3) * (8 + mm * 26);
    const fine = n2.noise3(X * 22, Y * 22, Z * 22) * 1.6 + n.noise3(X * 95, Y * 95, Z * 95) * 0.35;
    h += (det + fine) * sstep(-15, 5, h);
    out.h = h;
    out.m = clamp(0.5 + this.fbm(n2, X * 0.018 + 40, Y * 0.018, Z * 0.018, 3) * 1.1 + wet * 0.25, 0, 1);
    out.s = wet;
    out.q = ridge * mm;
  }

  // ─── desértico ──────────────────────────────────────────────────────────
  desert(x, y, z, out) {
    const k = this.k, X = x * k, Y = y * k, Z = z * k;
    const n = this.n, n2 = this.n2, amp = this.amp;
    const wf = 0.03;
    const Xw = X + this.fbm(n2, X * wf + 5, Y * wf, Z * wf, 2) * 14;
    const Yw = Y + this.fbm(n2, X * wf, Y * wf + 8, Z * wf, 2) * 14;
    const Zw = Z + this.fbm(n2, X * wf, Y * wf, Z * wf + 2, 2) * 14;
    let h = this.fbm(n, X * 0.02, Y * 0.02, Z * 0.02, 4) * 380;
    // mesetas em terraços
    const t = this.fbm(n, Xw * 0.06, Yw * 0.06, Zw * 0.06, 5, 2.2, 0.5);
    const plateau = sstep(0.04, 0.085, t);
    const st = 0.055, kk = t / st, fl = Math.floor(kk), fr = kk - fl;
    const terr = (fl + sstep(0.62, 0.86, fr)) * st;
    h += plateau * (120 + Math.max(0, terr) * 1500);
    // cânions cortando as mesetas
    const rv = Math.abs(this.fbm(n2, Xw * 0.035 + 7, Yw * 0.035, Zw * 0.035, 4));
    const canyon = 1 - sstep(0.012, 0.055, rv);
    const canyonDepth = canyon * (plateau * (120 + Math.max(0, terr) * 1500) * 0.95 + 110);
    h -= canyonDepth;
    // cordilheiras esparsas
    const mm = sstep(0.18, 0.42, this.fbm(n2, X * 0.025 + 11, Y * 0.025, Z * 0.025, 3));
    let ridge = 0;
    if (mm > 0.001) { ridge = this.ridged(n, Xw * 0.09, Yw * 0.09, Zw * 0.09, 6); h += Math.pow(ridge, 1.8) * amp * 0.85 * mm; }
    // campos de dunas nas áreas baixas
    const field = (1 - plateau) * sstep(-0.35, -0.02, -t + 0.02) * (1 - mm * 0.8) * (1 - canyon * 0.5);
    let sand = 0;
    if (field > 0.01) {
      const W = this.W, W2 = this.W2;
      const warp = this.fbm(n2, X * 0.12, Y * 0.12, Z * 0.12, 2) * 2.4;
      const a = (X * W[0] + Y * W[1] + Z * W[2]) / 0.62 + warp;
      // perfil assimétrico: barlavento suave, sotavento íngreme (crista viva)
      const ph = a - Math.floor(a);
      const prof = ph < 0.72 ? sstep(0, 0.72, ph) : 1 - sstep(0.72, 1.0, ph) * 1.0;
      const dune = prof * prof * (0.55 + 0.45 * n.noise3(X * 0.3, Y * 0.3, Z * 0.3));
      const b = (X * W2[0] + Y * W2[1] + Z * W2[2]) / 0.19 + warp * 1.7;
      const ph2 = b - Math.floor(b);
      const d2 = Math.sin(ph2 * Math.PI) ** 2;
      h += field * (dune * 70 + d2 * 9);
      sand = field;
    }
    // detalhe
    const rock = 1 - field;
    h += this.fbm(n, X * 2.8, Y * 2.8, Z * 2.8, 3) * (3 + rock * 9) + n2.noise3(X * 30, Y * 30, Z * 30) * 0.9 * rock;
    out.h = h;
    out.m = clamp(0.5 + this.fbm(n2, X * 0.03 + 21, Y * 0.03, Z * 0.03, 3) * 1.2, 0, 1);
    out.s = clamp(sand + canyon * 0.0, 0, 1);
    out.q = clamp(t * 4 + 0.5, 0, 1);
  }

  // ─── gelado ─────────────────────────────────────────────────────────────
  ice(x, y, z, out) {
    const k = this.k, X = x * k, Y = y * k, Z = z * k;
    const n = this.n, n2 = this.n2, amp = this.amp;
    const wf = 0.025;
    const Xw = X + this.fbm(n2, X * wf + 5, Y * wf, Z * wf, 2) * 18;
    const Yw = Y + this.fbm(n2, X * wf, Y * wf + 8, Z * wf, 2) * 18;
    const Zw = Z + this.fbm(n2, X * wf, Y * wf, Z * wf + 2, 2) * 18;
    const c = this.fbm(n, Xw * 0.03, Yw * 0.03, Zw * 0.03, 5);
    let h = c * 420;
    const mm = sstep(0.02, 0.32, c + this.fbm(n2, X * 0.06, Y * 0.06, Z * 0.06, 3) * 0.22);
    let ridge = 0;
    if (mm > 0.001) { ridge = this.ridged(n, Xw * 0.095, Yw * 0.095, Zw * 0.095, 7); h += Math.pow(ridge, 1.9) * amp * 1.05 * mm; }
    // mantos de gelo: planícies achatadas com ondulação suave
    const g = 1 - sstep(60, 520, h);
    const sheet = 90 + this.fbm(n, X * 0.25, Y * 0.25, Z * 0.25, 3) * 30;
    h = lerp(h, sheet + (h - 60) * 0.12, g * 0.85);
    // gretas (fendas) no gelo
    const cr = Math.abs(n2.noise3(Xw * 0.7, Yw * 0.7 * 0.35, Zw * 0.7));
    const crev = (1 - sstep(0.0, 0.05, cr)) * g * sstep(0.1, 0.45, this.fbm(n2, X * 0.12 + 3, Y * 0.12, Z * 0.12, 2));
    h -= crev * 16;
    // sastrugi / neve soprada
    h += this.fbm(n, X * 3.2, Y * 3.2, Z * 3.2, 3) * (2.5 + mm * 14) + n2.noise3(X * 26, Y * 26, Z * 26) * 0.7;
    out.h = h;
    out.m = clamp(0.5 + this.fbm(n2, X * 0.04 + 7, Y * 0.04, Z * 0.04, 3) * 1.2, 0, 1);
    out.s = clamp(g, 0, 1);
    out.q = clamp(crev * 0.9 + ridge * mm * 0.3, 0, 1);
  }

  // ─── vulcânico ──────────────────────────────────────────────────────────
  volcanic(x, y, z, out) {
    const k = this.k, X = x * k, Y = y * k, Z = z * k;
    const n = this.n, n2 = this.n2, amp = this.amp;
    const wf = 0.04;
    const Xw = X + this.fbm(n2, X * wf + 5, Y * wf, Z * wf, 2) * 10;
    const Yw = Y + this.fbm(n2, X * wf, Y * wf + 8, Z * wf, 2) * 10;
    const Zw = Z + this.fbm(n2, X * wf, Y * wf, Z * wf + 2, 2) * 10;
    let h = this.fbm(n, Xw * 0.04, Yw * 0.04, Zw * 0.04, 5) * 380;
    // vulcões: cones com caldeira
    const f = 0.055;
    this.cell(Xw * f, Yw * f, Zw * f, 991, _c);
    const big = 0.55 + _c.id * 0.9;
    const cone = Math.pow(Math.max(0, 1 - _c.d1 / 0.48), 2.1) * (380 + _c.id * 700) * big;
    const cald = sstep(0.09, 0.04, _c.d1);
    h += cone - cald * cone * 0.38;
    const near = sstep(0.75, 0.2, _c.d1);
    // fluxos de basalto (cristas finas)
    const rf = this.ridged(n, Xw * 0.3, Yw * 0.3, Zw * 0.3, 4);
    h += rf * rf * 40;
    // canais de lava descendo das encostas
    const rv = Math.abs(this.fbm(n2, Xw * 0.09 + 3, Yw * 0.09, Zw * 0.09, 3));
    const ch = (1 - sstep(0.006, 0.03, rv)) * near;
    h -= ch * 22;
    let lava = ch;
    // lagos de lava nas depressões
    if (h < this.lavaLevel) { lava = 1; h = this.lavaLevel + (h - this.lavaLevel) * 0.02; }
    lava = Math.max(lava, cald * sstep(0.03, 0.0, _c.d1) * (_c.id > 0.45 ? 1 : 0));
    h += this.fbm(n, X * 2.6, Y * 2.6, Z * 2.6, 3) * 7 * (1 - lava) + n2.noise3(X * 24, Y * 24, Z * 24) * 0.8 * (1 - lava);
    out.h = h;
    out.m = clamp(0.5 + this.fbm(n2, X * 0.05 + 3, Y * 0.05, Z * 0.05, 2) * 1.2, 0, 1);
    out.s = clamp(lava, 0, 1);
    out.q = clamp(near * 0.6 + rf * 0.4, 0, 1);
  }

  // ─── morto / irradiado (crateras) ───────────────────────────────────────
  dead(x, y, z, out) {
    const k = this.k, X = x * k, Y = y * k, Z = z * k;
    const n = this.n, n2 = this.n2, amp = this.amp;
    let h = this.fbm(n, X * 0.035, Y * 0.035, Z * 0.035, 5) * 420;
    const mm = sstep(0.1, 0.35, this.fbm(n2, X * 0.03, Y * 0.03, Z * 0.03, 3));
    let ridge = 0;
    if (mm > 0.001) { ridge = this.ridged(n, X * 0.08, Y * 0.08, Z * 0.08, 6); h += ridge * ridge * amp * 0.55 * mm; }
    // crateras em 4 escalas
    let ej = 0;
    const scales = [[0.028, 650, 0.5], [0.11, 190, 0.45], [0.45, 45, 0.4], [1.9, 8, 0.38]];
    for (let i = 0; i < scales.length; i++) {
      const [f, depth, rad] = scales[i];
      this.cell(X * f, Y * f, Z * f, 300 + i * 17, _c);
      if (_c.id > 0.62) continue; // nem toda célula tem cratera
      const r = _c.d1 / (rad * (0.6 + _c.id * 0.6));
      if (r < 1.6) {
        const d = depth * (0.7 + _c.id * 0.6);
        if (r < 1) {
          const bowl = (r * r - 1) * d;
          const flat = -d * 0.72; // fundo achatado nas grandes
          h += i === 0 ? Math.max(bowl, flat) : bowl;
        }
        h += Math.exp(-((r - 1) ** 2) / 0.035) * d * 0.28;
        const e = Math.exp(-((r - 1.05) ** 2) / 0.12) * (1 - _c.id);
        ej = Math.max(ej, e * (i < 2 ? 1 : 0.6));
      }
    }
    h += this.fbm(n, X * 3, Y * 3, Z * 3, 3) * 4 + n2.noise3(X * 28, Y * 28, Z * 28) * 0.8;
    out.h = h;
    out.m = clamp(0.5 + this.fbm(n2, X * 0.02 + 9, Y * 0.02, Z * 0.02, 3) * 1.3, 0, 1);
    out.s = clamp(ej, 0, 1);
    out.q = ridge * mm;
  }

  gas(x, y, z, out) { out.h = 0; }
}

const _c = { d1: 0, d2: 0, id: 0 };
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

/** Cache de terrenos por id (main thread e worker). */
const cache = new Map();
export function getTerrain(desc) {
  let t = cache.get(desc.id);
  if (!t) { t = new Terrain(desc); cache.set(desc.id, t); }
  return t;
}
