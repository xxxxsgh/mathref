/**
 * Atlas procedurais da VFX, gerados NA GPU uma única vez (shader → alvo de
 * render → mipmaps). Nada é baixado: fumaça, clarões, faíscas e marcas de
 * tiro saem de ruído e geometria analítica.
 *
 * Atlas de partículas (4×4 tiles):
 *   0–2  baforadas de poeira/fumaça (ruído) · 3–5 couve-flor (explosões) → RGB = normal, A = densidade
 *   6    poeira fina (fios esticados)      7  névoa de sangue (manchada)
 *   8,9  estrela frontal do clarão de boca  10,11 pétala lateral do clarão
 *   12   brilho suave (gaussiana)          13  faísca/traçante (gaussiana alongada)
 *   14   anel (onda de choque)             15  lasca irregular (detrito minúsculo)
 *   Tiles aditivos (8–15): R = "núcleo branco-quente", A = intensidade.
 *
 * Atlas de decalques (4×4): albedo linear + α e um mapa de normais derivado
 * do mesmo campo de altura (diferenças finitas no próprio shader).
 *   0,1 concreto  2 tijolo  3 asfalto  4,5 metal  6,7 madeira  8,9 vidro
 *   10 terra  11 plástico/borracha  12,13 sangue  14 queimado  15 respingo de sangue
 */
import * as THREE from 'three';

export const PT = {
  SMOKE: [0, 1, 2], BILLOW: [3, 4, 5], DUST: 6, BLOOD: 7, STAR: [8, 9], PETAL: [10, 11],
  GLOW: 12, SPARK: 13, RING: 14, CHIP: 15,
};
export const DT = {
  concrete: [0, 1], brick: [2], asphalt: [3], metal: [4, 5], wood: [6, 7], glass: [8, 9],
  dirt: [10], plastic: [11], rubber: [11], blood: [12, 13], scorch: [14], bloodSpray: [15],
};

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float ridge(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0)); p = p * 2.1 + 9.7; a *= 0.5; } return s; }
`;

// ─── partículas ──────────────────────────────────────────────────────────
const PARTICLE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
${NOISE}
// Baforada: silhueta por ruído com queda radial (sem "bola"), normal de
// esfera achatada perturbada pelo gradiente do ruído → volume ao acender.
float puffD(vec2 p, float seed) {
  float r = length(p * vec2(1.0, 1.0 + 0.25 * sin(seed)));
  float n1 = fbm(vec3(p * 2.6, seed));
  float n2 = fbm(vec3(p * 6.5, seed + 4.0));
  float base = 1.0 - smoothstep(0.1, 0.92, r);
  return base * 1.35 - 0.38 + (n1 - 0.5) * 1.1 + (n2 - 0.5) * 0.4;
}
vec4 smoke(vec2 p, float seed) {
  float e = 4.0 / 512.0;
  float v = puffD(p, seed);
  float vx = puffD(p + vec2(e, 0.0), seed), vy = puffD(p + vec2(0.0, e), seed);
  vec2 q = p * 0.95;
  vec3 ns = vec3(q, sqrt(max(0.05, 1.0 - dot(q, q))));
  vec3 n = normalize(ns + vec3(-(vx - v) / e, -(vy - v) / e, 0.0) * 0.22);
  float d = smoothstep(0.0, 0.7, v);
  d = d * d * (3.0 - 2.0 * d);
  d *= 1.0 - smoothstep(0.8, 1.0, length(p));
  return vec4(n * 0.5 + 0.5, d);
}
// Variante "couve-flor" (explosões): calotas de esferas + fbm, bordas suaves.
float billowH(vec2 p, float seed) {
  float h = 0.0;
  for (int k = 0; k < 11; k++) {
    float fk = float(k);
    vec2 c = (vec2(hash12(vec2(fk, seed)), hash12(vec2(seed, fk + 7.0))) - 0.5) * 0.95;
    float r = 0.2 + 0.2 * hash12(vec2(fk * 3.1, seed * 1.7));
    c *= 1.0 - r * 0.5;
    h = max(h, sqrt(max(0.0, r * r - dot(p - c, p - c))));
  }
  return h + (fbm(vec3(p * 4.5, seed * 3.7)) - 0.5) * 0.2 + (fbm(vec3(p * 12.0, seed + 5.0)) - 0.5) * 0.06;
}
vec4 billow(vec2 p, float seed) {
  float e = 3.0 / 512.0;
  float h = billowH(p, seed);
  float hx = billowH(p + vec2(e, 0.0), seed), hy = billowH(p + vec2(0.0, e), seed);
  vec3 n = normalize(vec3(-(hx - h) / e * 0.5, -(hy - h) / e * 0.5, 1.0));
  float er = fbm(vec3(p * 6.0, seed + 2.0));
  float d = smoothstep(-0.02, 0.22, h + (er - 0.5) * 0.18);
  d *= 0.75 + 0.25 * er;
  d *= 1.0 - smoothstep(0.8, 1.0, length(p));
  return vec4(n * 0.5 + 0.5, d);
}
vec4 tile(int t, vec2 p) {
  float r = length(p);
  if (t < 3) return smoke(p, float(t) * 13.7 + 1.0);
  if (t < 6) return billow(p, float(t) * 13.7 + 1.0);
  if (t == 6) { // poeira: fiapos alongados e ralos
    float n = fbm(vec3(p.x * 3.0, p.y * 7.0, 4.0));
    float w = ridge(vec3(p * vec2(2.5, 6.0), 9.0));
    float d = smoothstep(0.35, 0.9, n * 0.6 + w * 0.6) * (1.0 - smoothstep(0.35, 1.0, r));
    return vec4(0.5, 0.5, 1.0, d * 0.9);
  }
  if (t == 7) { // névoa de sangue: manchas + gotículas
    float n = fbm(vec3(p * 3.5, 21.0));
    float d = smoothstep(0.45, 0.75, n + 0.45 - r * 0.65);
    float drops = 0.0;
    for (int k = 0; k < 14; k++) {
      vec2 c = (vec2(hash12(vec2(float(k), 3.0)), hash12(vec2(5.0, float(k)))) - 0.5) * 1.7;
      drops = max(drops, 1.0 - smoothstep(0.015, 0.035 + 0.02 * hash12(vec2(float(k), 9.0)), length(p - c)));
    }
    return vec4(0.5, 0.5, 1.0, max(d * 0.85, drops) * (1.0 - smoothstep(0.85, 1.0, r)));
  }
  if (t == 8 || t == 9) { // estrela frontal: núcleo + raios irregulares + franja turbulenta
    float a = atan(p.y, p.x);
    float prongs = t == 8 ? 4.0 : 5.0;
    float rot = t == 8 ? 0.785 : 0.3;
    float s = pow(abs(cos((a + rot) * prongs * 0.5)), 18.0);
    float s2 = pow(abs(cos((a + rot + 0.4) * prongs)), 10.0) * 0.45;
    float jag = fbm(vec3(a * 3.0, r * 6.0, float(t)));
    float rays = (s + s2) * (1.0 - smoothstep(0.0, 0.95, r / (0.55 + 0.45 * jag)));
    float core = exp(-r * r * 22.0);
    float halo = exp(-r * r * 5.0) * 0.35 * (0.6 + 0.8 * fbm(vec3(p * 7.0, float(t))));
    float i = clamp(core + rays * 0.9 + halo, 0.0, 1.0);
    return vec4(core * 1.2 + rays * 0.25, 0.0, 0.0, i);
  }
  if (t == 10 || t == 11) { // pétala: língua de fogo ao longo de +y, base em y = -1
    float y = p.y * 0.5 + 0.5;
    float wid = (0.10 + 0.32 * sin(clamp(y, 0.0, 1.0) * 3.0) * (1.0 - y * 0.55));
    float turb = fbm(vec3(p.x * 5.0, y * 4.0, float(t) * 3.0));
    float x = abs(p.x + (turb - 0.5) * 0.35 * y) / max(wid, 1e-3);
    float body = (1.0 - smoothstep(0.35, 1.0, x)) * smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.55, 1.0, y + (turb - 0.5) * 0.4));
    float holes = smoothstep(0.25, 0.6, fbm(vec3(p * vec2(6.0, 3.0), float(t) + 4.0)));
    float core = exp(-x * x * 4.0) * (1.0 - y) * (1.0 - y);
    return vec4(core, 0.0, 0.0, clamp(body * (0.45 + 0.55 * holes) + core * 0.4, 0.0, 1.0));
  }
  if (t == 12) { float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r)); return vec4(exp(-r * r * 30.0), 0.0, 0.0, g); }
  if (t == 13) { // faísca: gaussiana estreita em x, suave em y (traço)
    float g = exp(-p.x * p.x * 30.0) * (1.0 - smoothstep(0.6, 1.0, abs(p.y)));
    return vec4(exp(-p.x * p.x * 120.0), 0.0, 0.0, g);
  }
  if (t == 14) { // anel de choque com borda turbulenta
    float n = fbm(vec3(p * 5.0, 3.0));
    float ring = exp(-pow((r - 0.72 - (n - 0.5) * 0.08) * 9.0, 2.0));
    return vec4(0.0, 0.0, 0.0, ring * (1.0 - smoothstep(0.9, 1.0, r)));
  }
  // 15: lasca irregular
  float a = atan(p.y, p.x);
  float rr = 0.55 + 0.3 * vnoise(vec3(a * 1.6, 0.0, 2.0)) - 0.15 * vnoise(vec3(a * 5.0, 1.0, 3.0));
  float m = 1.0 - smoothstep(rr - 0.06, rr, r);
  return vec4(0.5 + p.x * 0.4, 0.5 + p.y * 0.4, 0.8, m);
}
void main() {
  vec2 g = vUv * 4.0;
  vec2 cell = floor(g);
  int t = int(cell.x + (3.0 - cell.y) * 4.0); // tile 0 no canto superior esquerdo (v invertido)
  vec2 p = (fract(g) - 0.5) * 2.0;
  outColor = tile(t, p * 1.04);
}`;

// ─── decalques ───────────────────────────────────────────────────────────
const DECAL_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform int uOut;
out vec4 outColor;
${NOISE}
// Cada tile devolve (albedo.rgb, alpha) e altura h por referência.
vec4 decal(int t, vec2 p, out float h) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float s = float(t) * 7.31;
  float n = fbm(vec3(p * 5.0, s));
  float n2 = fbm(vec3(p * 14.0, s + 3.0));
  h = 0.0;
  if (t <= 3) { // concreto/tijolo/asfalto: furo, cratera lascada irregular, trincas, pó de impacto
    vec3 fresh = t == 2 ? vec3(0.26, 0.11, 0.07) : (t == 3 ? vec3(0.07, 0.07, 0.065) : vec3(0.3, 0.29, 0.27));
    float holeR = 0.07 + 0.03 * n;
    float edge = 0.7 + 0.55 * vnoise(vec3(a * 1.7, 0.0, s)) + 0.25 * vnoise(vec3(a * 6.0, 1.0, s));
    float craterR = (t == 3 ? 0.24 : 0.34) * edge;
    float crater = 1.0 - smoothstep(craterR - 0.04, craterR, r);
    float hole = 1.0 - smoothstep(holeR - 0.03, holeR + 0.01, r + (n2 - 0.5) * 0.05);
    float chips = smoothstep(0.42, 0.62, n2) * crater;
    float cracks = 0.0;
    for (int k = 0; k < 6; k++) {
      float ang = hash12(vec2(float(k), s)) * 6.2832;
      float len = 0.35 + 0.5 * hash12(vec2(s, float(k) + 2.0));
      float da = abs(mod(a - ang + 3.14159 + (vnoise(vec3(r * 9.0, float(k), s)) - 0.5) * 0.4, 6.2832) - 3.14159);
      cracks = max(cracks, (1.0 - smoothstep(0.0, 0.022 / max(r, 0.05), da)) * step(holeR, r) * (1.0 - smoothstep(len * 0.6, len, r)));
    }
    float powder = (1.0 - smoothstep(0.2, 0.9, r)) * (0.4 + 0.6 * n);
    h = crater * (-0.4 + 0.4 * smoothstep(0.0, craterR, r)) - hole * 0.8 + chips * 0.15 - cracks * 0.12;
    vec3 col = fresh * (0.55 + 0.7 * n2) * (0.6 + 0.4 * smoothstep(0.0, craterR, r));
    col = mix(col, vec3(0.012), hole);
    col = mix(vec3(0.04, 0.038, 0.035), col, max(crater, 0.0));
    float al = max(max(crater * (0.75 + 0.25 * chips), cracks * 0.9), powder * 0.45);
    return vec4(col, clamp(al, 0.0, 1.0));
  }
  if (t <= 5) { // metal: furo, borda repuxada, tinta lascada mostrando aço, fuligem
    float holeR = t == 4 ? 0.06 : 0.035;
    float rim = exp(-pow((r - holeR - 0.03 - 0.015 * n) * 22.0, 2.0));
    float dent = 1.0 - smoothstep(0.0, 0.3, r);
    float hole = 1.0 - smoothstep(holeR - 0.012, holeR + 0.004, r);
    float chipR = (0.17 + 0.1 * vnoise(vec3(a * 2.3, 0.0, s)) + 0.06 * n2);
    float chipped = 1.0 - smoothstep(chipR - 0.015, chipR, r);
    float scorch = (1.0 - smoothstep(0.08, 0.7, r + (n2 - 0.5) * 0.25)) * 0.7;
    h = -dent * 0.4 + rim * 0.3 - hole * 0.7;
    vec3 steel = vec3(0.32, 0.32, 0.33) * (0.7 + 0.6 * n2);
    vec3 col = mix(vec3(0.03, 0.028, 0.025), steel, chipped);
    col = mix(col, vec3(0.55), rim * 0.7);
    col = mix(col, vec3(0.005), hole);
    float al = max(chipped, scorch);
    return vec4(col, clamp(al, 0.0, 1.0));
  }
  if (t <= 7) { // madeira: furo escuro + rasgo de fibras claras ao longo de y
    vec2 q = p * vec2(1.0, 0.45);
    float holeR = 0.1 + 0.02 * n;
    float hole = 1.0 - smoothstep(holeR - 0.02, holeR + 0.01, length(p));
    float fib = fbm(vec3(p.x * 30.0, p.y * 2.0, s));
    float tear = (1.0 - smoothstep(0.2, 0.42 + 0.2 * n, length(q * vec2(1.6, 1.0)))) * smoothstep(0.35, 0.6, fib + 0.2);
    float splinter = (1.0 - smoothstep(0.0, 0.06, abs(p.x + (n - 0.5) * 0.2))) * (1.0 - smoothstep(0.3, 0.85, abs(p.y))) * (t == 7 ? 1.0 : 0.6);
    h = -hole * 0.7 + tear * 0.1 + splinter * 0.15 - 0.15 * (1.0 - smoothstep(0.0, 0.3, length(q)));
    vec3 freshW = vec3(0.4, 0.28, 0.15) * (0.7 + 0.5 * fib);
    vec3 col = mix(freshW, vec3(0.03, 0.02, 0.01), hole);
    float al = max(max(tear, hole), splinter * 0.9);
    return vec4(col, clamp(al, 0.0, 1.0));
  }
  if (t <= 9) { // vidro: teia de trincas radiais + anéis, centro esbranquiçado
    float rad = 0.0;
    for (int k = 0; k < 11; k++) {
      float ang = hash12(vec2(float(k), s)) * 6.2832;
      float da = abs(mod(a - ang + 3.14159 + (vnoise(vec3(r * 5.0, float(k), s)) - 0.5) * 0.25, 6.2832) - 3.14159);
      rad = max(rad, (1.0 - smoothstep(0.0, 0.012 / max(r, 0.04), da)) * (1.0 - smoothstep(0.55, 0.98, r + 0.3 * hash12(vec2(float(k), 1.0)))));
    }
    float rings = 0.0;
    for (int k = 0; k < 3; k++) {
      float rr = 0.18 + float(k) * 0.17 + (n - 0.5) * 0.06;
      rings = max(rings, (1.0 - smoothstep(0.0, 0.012, abs(r - rr))) * step(0.5, vnoise(vec3(a * 4.0, float(k), s))));
    }
    float frost = 1.0 - smoothstep(0.03, 0.14 + 0.04 * n, r);
    float hole = 1.0 - smoothstep(0.035, 0.05, r);
    h = rad * 0.2 + rings * 0.15 + frost * 0.2 - hole;
    vec3 col = mix(vec3(0.85, 0.9, 0.92), vec3(0.02), hole);
    float al = max(max(rad, rings) * 0.85, frost * 0.9);
    return vec4(col, clamp(al, 0.0, 1.0));
  }
  if (t == 10) { // terra: depressão escura e úmida
    float d = 1.0 - smoothstep(0.15, 0.6 + 0.25 * n, r);
    h = -d * 0.4;
    return vec4(vec3(0.05, 0.035, 0.025) * (0.7 + 0.6 * n2), d * 0.9);
  }
  if (t == 11) { // plástico/borracha: furo com borda esbranquiçada estressada
    float hole = 1.0 - smoothstep(0.07, 0.09, r);
    float stress = exp(-pow((r - 0.13) * 12.0, 2.0)) * (0.6 + 0.4 * n2);
    h = -hole * 0.6 + stress * 0.2;
    return vec4(mix(vec3(0.75, 0.74, 0.72), vec3(0.01), hole), max(hole, stress * 0.8));
  }
  if (t <= 13 || t == 15) { // sangue: mancha com espículas radiais e gotas
    float sp = t == 15 ? 1.0 : 0.0;
    float spikes = pow(vnoise(vec3(a * (t == 12 ? 5.0 : 8.0), 0.0, s)), 3.0) * (0.6 + sp * 0.5);
    float body = 1.0 - smoothstep(0.0, 0.08, r - (0.32 - sp * 0.12 + spikes * 0.5 + (n - 0.5) * 0.15));
    float drops = 0.0;
    for (int k = 0; k < 18; k++) {
      vec2 c = (vec2(hash12(vec2(float(k), s)), hash12(vec2(s, float(k) * 1.3))) - 0.5) * 1.8;
      if (sp > 0.5) { c.y = abs(c.y) * 0.6 - 0.1; c.x *= 1.1; }
      float rr = 0.012 + 0.03 * hash12(vec2(float(k), s + 9.0)) * (1.0 - length(c) * 0.5);
      drops = max(drops, 1.0 - smoothstep(rr * 0.6, rr, length(p - c)));
    }
    float m = max(body, drops) * (1.0 - smoothstep(0.85, 1.0, r));
    h = m * 0.08;
    vec3 col = vec3(0.16, 0.008, 0.006) * (0.55 + 0.6 * n2) * (1.0 - 0.35 * body * (1.0 - smoothstep(0.0, 0.3, r)));
    return vec4(col, m * 0.95);
  }
  // 14: queimado de explosão
  float d = 1.0 - smoothstep(0.1, 0.95, r + (n - 0.5) * 0.35);
  float streaks = pow(vnoise(vec3(a * 12.0, 0.0, 4.0)), 2.0);
  h = -d * 0.05;
  return vec4(vec3(0.015, 0.012, 0.01) + vec3(0.05, 0.035, 0.02) * n2, clamp(d * (0.75 + 0.35 * streaks), 0.0, 0.97));
}
void main() {
  vec2 g = vUv * 4.0;
  vec2 cell = floor(g);
  int t = int(cell.x + (3.0 - cell.y) * 4.0);
  vec2 pt = (fract(g) - 0.5) * 2.0;
  vec2 p = pt * 0.62; // conteúdo ocupa o tile inteiro (as marcas não somem de tão pequenas)
  float mask = 1.0 - smoothstep(0.8, 0.97, max(abs(pt.x), abs(pt.y)));
  float h, hx, hy;
  vec4 c = decal(t, p, h);
  c.a *= mask;
  if (uOut == 0) { outColor = c; return; }
  float e = 1.2 / 256.0;
  decal(t, p + vec2(e, 0.0), hx);
  decal(t, p + vec2(0.0, e), hy);
  vec3 n = normalize(vec3(-(hx - h) / e * 0.08, -(hy - h) / e * 0.08, 1.0));
  outColor = vec4(n * 0.5 + 0.5, 1.0);
}`;

function bake(renderer, frag, size, uniforms = {}) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: `precision highp float;\nin vec3 position;\n${VERT}`,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  const prevXr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.render(mesh, cam);
  renderer.setRenderTarget(prev);
  renderer.xr.enabled = prevXr;
  geo.dispose();
  mat.dispose();
  return rt;
}

/** Gera os atlas (uma vez). anisotropy: dica de ctx.quality. */
export function bakeAtlases(renderer, { particleSize = 2048, decalSize = 1024, anisotropy = 4 } = {}) {
  const particles = bake(renderer, PARTICLE_FRAG, particleSize);
  const decalAlbedo = bake(renderer, DECAL_FRAG, decalSize, { uOut: { value: 0 } });
  const decalNormal = bake(renderer, DECAL_FRAG, decalSize, { uOut: { value: 1 } });
  for (const rt of [decalAlbedo, decalNormal]) rt.texture.anisotropy = anisotropy;
  return {
    particles: particles.texture,
    decalAlbedo: decalAlbedo.texture,
    decalNormal: decalNormal.texture,
    targets: [particles, decalAlbedo, decalNormal],
  };
}
