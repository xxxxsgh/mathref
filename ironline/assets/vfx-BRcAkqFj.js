import{A as e,At as t,B as n,Ct as r,D as i,G as a,H as o,I as s,K as c,Mt as l,N as u,O as d,Pt as f,Q as p,T as m,U as h,V as g,W as _,X as v,Z as y,at as b,ct as x,dt as S,ft as C,h as ee,j as te,jt as w,kt as T,lt as ne,mt as E,nt as D,pt as re,q as ie,tt as ae,vt as oe,x as O}from"./three-Bs69fpwD.js";var k={SMOKE:[0,1,2],BILLOW:[3,4,5],DUST:6,BLOOD:7,STAR:[8,9],PETAL:[10,11],GLOW:12,SPARK:13,RING:14,CHIP:15,BURST:8,CONE:9},se={concrete:[0,1],brick:[2],asphalt:[3],metal:[4,5],wood:[6,7],glass:[8,9],dirt:[10],plastic:[11],rubber:[11],blood:[12,13],scorch:[14],bloodSpray:[15]},ce=`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,le=`
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
`,ue=`
precision highp float;
in vec2 vUv;
out vec4 outColor;
${le}
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
// Variante "couve-flor" (explosões): união SUAVE de muitas calotas pequenas
// num domínio deformado por ruído (a silhueta não vira arco de círculo nem
// "disco"), mais fbm em duas escalas; bordas ralas que se desfazem em fiapos.
float smax(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float billowH(vec2 p, float seed) {
  vec2 w = vec2(fbm(vec3(p * 1.9, seed)), fbm(vec3(p * 1.9 + 5.2, seed + 3.1))) - 0.5;
  p += w * 0.26;
  // poucos lóbulos GRANDES (a fumaça real rola em poucas couves por baforada)
  float h = sqrt(max(0.0, 0.3 - dot(p, p) * 0.55)) * 0.55;
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float ang = hash12(vec2(fk, seed)) * 6.2832;
    float rad = sqrt(hash12(vec2(seed, fk + 7.0))) * 0.42;
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float r = (0.24 + 0.2 * hash12(vec2(fk * 3.1, seed * 1.7))) * (1.0 - rad * 0.4);
    h = smax(h, sqrt(max(0.0, r * r - dot(p - c, p - c))), 0.08);
  }
  return h + (fbm(vec3(p * 5.0, seed * 3.7)) - 0.5) * 0.16 + (fbm(vec3(p * 13.0, seed + 5.0)) - 0.5) * 0.07;
}
vec4 billow(vec2 p, float seed) {
  float e = 3.0 / 512.0;
  float h = billowH(p, seed);
  float hx = billowH(p + vec2(e, 0.0), seed), hy = billowH(p + vec2(0.0, e), seed);
  vec3 n = normalize(vec3(-(hx - h) / e * 0.7, -(hy - h) / e * 0.7, 1.0));
  float er = fbm(vec3(p * 7.0, seed + 2.0));
  float er2 = fbm(vec3(p * 17.0, seed + 8.0));
  float d = smoothstep(-0.03, 0.17, h + (er - 0.5) * 0.2 + (er2 - 0.5) * 0.05);
  d *= 1.0 - smoothstep(0.75, 1.0, length(p));
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
  if (t == 8) { // clarão frontal: núcleo + lóbulos irregulares (ruído angular), SEM raios retos
    float a = atan(p.y, p.x);
    float lob = fbm(vec3(cos(a) * 1.6, sin(a) * 1.6, 3.0)) * 0.9 + fbm(vec3(cos(a) * 4.0, sin(a) * 4.0, 7.0)) * 0.35;
    float edge = 0.32 + 0.55 * lob;
    float body = 1.0 - smoothstep(edge * 0.35, edge, r);
    float wisp = smoothstep(0.35, 0.7, fbm(vec3(p * 6.0, 2.0))) * (1.0 - smoothstep(0.2, edge * 1.1, r));
    float core = exp(-r * r * 26.0);
    float i = clamp(core + body * (0.35 + 0.45 * wisp), 0.0, 1.0);
    return vec4(core * 1.1 + body * 0.15, 0.0, 0.0, i);
  }
  if (t == 9) { // cone quente do gás (visto de lado): gota ao longo de +y, base em y = -1
    float y = p.y * 0.5 + 0.5;
    float wid = 0.06 + 0.26 * pow(clamp(y, 0.0, 1.0), 0.6) * (1.0 - smoothstep(0.55, 1.0, y));
    float turb = fbm(vec3(p.x * 6.0, y * 5.0, 9.0));
    float x = abs(p.x + (turb - 0.5) * 0.2 * y) / max(wid, 1e-3);
    float body = (1.0 - smoothstep(0.3, 1.0, x)) * smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(0.5, 0.95, y + (turb - 0.5) * 0.3));
    float core = exp(-x * x * 5.0) * (1.0 - smoothstep(0.0, 0.7, y));
    return vec4(core, 0.0, 0.0, clamp(body * 0.8 + core * 0.5, 0.0, 1.0));
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
}`,de=`
precision highp float;
in vec2 vUv;
uniform int uOut;
out vec4 outColor;
${le}
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
  if (t <= 5) { // metal: furo com borda repuxada, amassado, aço nu e brilhante,
    // tinta lascada em escamas irregulares em volta, fuligem/chumbo cinza
    float holeR = t == 4 ? 0.055 : 0.035;
    float rim = exp(-pow((r - holeR - 0.025 - 0.012 * n) * 24.0, 2.0));
    float dent = 1.0 - smoothstep(0.0, 0.32 + 0.06 * n, r);
    float hole = 1.0 - smoothstep(holeR - 0.01, holeR + 0.004, r);
    float bareR = 0.1 + 0.05 * vnoise(vec3(a * 2.3, 0.0, s)) + 0.03 * n2;
    float bare = 1.0 - smoothstep(bareR - 0.012, bareR, r);
    float flakeR = 0.2 + 0.12 * vnoise(vec3(a * 3.1, 2.0, s)) + 0.08 * (n2 - 0.5);
    float flake = (1.0 - smoothstep(flakeR - 0.01, flakeR, r)) * (1.0 - bare);
    float flakeEdge = exp(-pow((r - flakeR) * 40.0, 2.0));
    float lead = (1.0 - smoothstep(0.05, 0.45, r + (n2 - 0.5) * 0.2)) * 0.5;
    h = -dent * 0.45 + rim * 0.35 - hole * 0.7 + flakeEdge * 0.08;
    vec3 steel = vec3(0.55, 0.55, 0.56) * (0.75 + 0.4 * n2);
    vec3 primer = vec3(0.2, 0.19, 0.17) * (0.8 + 0.4 * n);
    vec3 col = mix(vec3(0.07, 0.068, 0.065), primer, flake);
    col = mix(col, steel, bare);
    col = mix(col, vec3(0.7), rim * 0.5 * bare);
    col = mix(col, vec3(0.005), hole);
    float al = max(max(bare, flake * 0.9), max(lead, flakeEdge * 0.4));
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
  // 14: queimado de explosão — fuligem depositada, não "estrela": borda
  // irregular e difusa (ruído em duas escalas), manchas de fuligem mais
  // densa, miolo esfarelado e mais claro (superfície pulverizada), pó cinza
  // por fora; nenhum raio reto.
  float warp = fbm(vec3(p * 2.2, 11.0));
  float rr = r * (0.8 + 0.5 * warp) + (n - 0.5) * 0.25;
  float soot = 1.0 - smoothstep(0.15, 0.9, rr);
  float blot = smoothstep(0.35, 0.7, fbm(vec3(p * 6.0, 13.0))) * (1.0 - smoothstep(0.3, 0.95, rr));
  float pulver = (1.0 - smoothstep(0.0, 0.22, rr + (n2 - 0.5) * 0.15));
  float dust = (1.0 - smoothstep(0.6, 1.25, rr)) * 0.35 * (0.5 + n2);
  vec3 col = mix(vec3(0.16, 0.15, 0.14), vec3(0.02, 0.018, 0.016) + vec3(0.03, 0.025, 0.02) * n2, soot * 0.85 + blot * 0.15);
  col = mix(col, vec3(0.13, 0.12, 0.11) * (0.6 + 0.8 * n2), pulver * 0.7);
  h = -soot * 0.06 - pulver * 0.12 + (n2 - 0.5) * 0.08 * soot;
  float al = max(soot * (0.55 + 0.35 * blot) * (0.8 + 0.3 * n2), dust);
  return vec4(col, clamp(al, 0.0, 0.93));
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
}`;function fe(e,t,n,r={}){let i=new f(n,n,{type:T,format:C,generateMipmaps:!0,minFilter:c,magFilter:a,depthBuffer:!1});i.texture.colorSpace=``;let o=new re({glslVersion:s,vertexShader:`precision highp float;\nin vec3 position;\n${ce}`,fragmentShader:t,uniforms:r,depthTest:!1,depthWrite:!1}),l=new ee;l.setAttribute(`position`,new u([-1,-1,0,3,-1,0,-1,3,0],3));let d=new y(l,o);d.frustumCulled=!1;let p=new b(-1,1,1,-1,0,1),m=e.getRenderTarget(),h=e.xr.enabled;return e.xr.enabled=!1,e.setRenderTarget(i),e.render(d,p),e.setRenderTarget(m),e.xr.enabled=h,l.dispose(),o.dispose(),i}function pe(e,{particleSize:t=2048,decalSize:n=1024,anisotropy:r=4}={}){let i=fe(e,ue,t),a=fe(e,de,n,{uOut:{value:0}}),o=fe(e,de,n,{uOut:{value:1}});for(let e of[a,o])e.texture.anisotropy=r;return{particles:i.texture,decalAlbedo:a.texture,decalNormal:o.texture,targets:[i,a,o]}}function me(e=256){let t=new Uint8Array(e*e*4),n=(e,t)=>{let n=new Float32Array(e*e),r=t*2654435761>>>0;for(let e=0;e<n.length;e++)r^=r<<13,r^=r>>>17,r^=r<<5,r>>>=0,n[e]=r/4294967296;return n},r=[4,8,16,32,64],i=[0,1,2].map(e=>r.map((t,r)=>({p:t,t:n(t,97+e*31+r*7),a:.55**r}))),o=e=>e*e*(3-2*e);for(let n=0;n<e;n++)for(let r=0;r<e;r++){let a=(n*e+r)*4;for(let s=0;s<3;s++){let c=0,l=0;for(let{p:t,t:a,a:u}of i[s]){let i=r/e*t,s=n/e*t,d=Math.floor(i),f=Math.floor(s),p=o(i-d),m=o(s-f),h=d%t,g=(d+1)%t,_=f%t,v=(f+1)%t,y=(a[_*t+h]*(1-p)+a[_*t+g]*p)*(1-m)+(a[v*t+h]*(1-p)+a[v*t+g]*p)*m;c+=y*u,l+=u}let u=Math.min(1,Math.max(0,(c/l-.5)*1.9+.5));t[a+s]=Math.round(u*255)}t[a+3]=255}let s=new m(t,e,e,C,T);return s.wrapS=s.wrapT=E,s.magFilter=a,s.minFilter=c,s.generateMipmaps=!0,s.colorSpace=``,s.needsUpdate=!0,s}var he=class{constructor(e,t,n,{scale:r=.5,isOwn:i=()=>!1}={}){this.renderer=e,this.scene=t,this.camera=n,this.scale=r,this.isOwn=i,this.rt=null,this.hidden=[],this.scanTimer=0,this.valid=!1,this.override=new p({colorWrite:!1,side:2}),this.override.name=`vfx-depth-prepass`,this.size=new w}ensure(){let e=this.renderer.getDrawingBufferSize(this.size),n=Math.max(1,Math.round(e.x*this.scale)),r=Math.max(1,Math.round(e.y*this.scale));if(this.rt&&this.rt.width===n&&this.rt.height===r)return;this.rt?.dispose();let a=new d(n,r,t);a.format=i,a.minFilter=a.magFilter=D,this.rt=new f(n,r,{type:T,depthBuffer:!0,depthTexture:a,generateMipmaps:!1,minFilter:D,magFilter:D}),this.valid=!1}scan(){let e=[];this.scene.traverse(t=>{if(t!==this.camera){if(this.isOwn(t)){e.push(t);return}if(t.isPoints||t.isLine||t.isSprite){e.push(t);return}t.isMesh&&(Array.isArray(t.material)?t.material:[t.material]).some(e=>!e||e.transparent||e.depthWrite===!1||e.alphaTest>0||e.colorWrite===!1||e.alphaHash||e.isShaderMaterial&&!e.depthWrite)&&e.push(t)}}),this.hidden=e}render(e){let{renderer:t,scene:n,camera:r}=this;this.ensure(),((this.scanTimer-=e)<=0||!this.hidden.length)&&(this.scan(),this.scanTimer=1);let i=this.hidden.map(e=>e.visible);for(let e of this.hidden)e.visible=!1;let a=t.getRenderTarget(),o=n.overrideMaterial,s=t.autoClear,c=t.shadowMap,l=c.autoUpdate,u=c.needsUpdate,d=n.background;c.autoUpdate=!1,c.needsUpdate=!1,n.overrideMaterial=this.override,n.background=null,t.autoClear=!1,t.setRenderTarget(this.rt),t.clear(!1,!0,!1),t.render(n,r),t.setRenderTarget(a),t.autoClear=s,n.overrideMaterial=o,n.background=d,c.autoUpdate=l,c.needsUpdate=u,this.hidden.forEach((e,t)=>e.visible=i[t]),this.valid=!0}dispose(){this.rt?.dispose(),this.override.dispose()}},ge=`
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aTime;   // t0, vida, arrasto k, gravidade (×9.8, negativo = empuxo)
attribute vec4 aSize;   // tamanho inicial, final, rotação, vel. angular
attribute vec4 aColor;  // rgb linear, alpha
attribute vec4 aMisc;   // tile, modo, iluminação do sol (0..1), aditivo
attribute vec4 aFx;     // emissão, expoente de decaimento do calor, fade-in, esticamento
attribute vec4 aPlane;  // plano suave: normal.xyz, d
attribute vec4 aExt;    // turbulência (m), erosão (0..1), suavidade de profundidade (m), semente
attribute float aAsp;   // proporção largura/altura (billboard e deitada): poeira rasteira achatada

uniform float uTime;
uniform vec3 uWind;
uniform vec3 uSunDir;

varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMisc;
varying vec4 vFx;
varying vec3 vSunLocal;
varying vec3 vWorld;
varying vec4 vPlane;
varying float vSize;
varying float vAge;
varying float vViewDist;
varying float vScatter;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;
varying vec2 vLocal;
varying vec4 vExt;

void main() {
  float age = uTime - aTime.x;
  float life = aTime.y;
  float x = age / life;
  if (age < 0.0 || x >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = aTime.z;
  float mode = aMisc.y;
  float decay = k > 1e-3 ? (1.0 - exp(-k * age)) / k : age;
  vec3 g = vec3(0.0, -9.8 * aTime.w, 0.0);
  vec3 wind = aMisc.w > 0.5 ? vec3(0.0) : uWind * age;
  vec3 P = mode > 2.5 && mode < 3.5 ? aPos : aPos + aVel * decay + 0.5 * g * age * age + wind;
  vec3 V = aVel * exp(-k * age) + g * age;
  // turbulência: deslocamento suave e pseudo-rotacional que cresce com a idade
  if (aExt.x > 0.0) {
    float s = aExt.w * 6.2831;
    vec3 ph = P * 0.9 + vec3(s, s * 1.7, s * 2.3);
    vec3 tb = vec3(sin(ph.y + age * 2.1) + sin(ph.z * 1.7 + age * 3.3) * 0.5,
                   sin(ph.z + age * 1.7) * 0.6 + 0.4,
                   sin(ph.x + age * 2.5) + sin(ph.y * 1.3 + age * 2.9) * 0.5);
    P += tb * aExt.x * min(age * 1.5, 1.0);
  }

  float ix = 1.0 - x;
  float grow = 1.0 - ix * ix * ix;
  float size = mix(aSize.x, aSize.y, grow);
  float rot = aSize.z + aSize.w * age;

  vec3 camPos = cameraPosition;
  vec3 toCam = normalize(camPos - P);
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 axX, axY;
  vec2 c = position.xy; // −0.5..0.5
  vec3 W;
  if (mode < 0.5) {
    float cs = cos(rot), sn = sin(rot);
    axX = camRight * cs + camUp * sn;
    axY = -camRight * sn + camUp * cs;
    // proporção: alarga em x da TELA (não gira junto) — saia de poeira rente ao chão
    vec2 cc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * vec2(aAsp, 1.0);
    W = P + (camRight * cc.x + camUp * cc.y) * size;
  } else if (mode < 2.5) {
    vec3 dir = mode < 1.5 ? V : aVel;
    float sp = length(dir);
    dir = sp > 1e-4 ? dir / sp : camUp;
    float len;
    vec3 center;
    if (mode < 1.5) {
      len = size + sp * aFx.w;
      center = P - dir * len * 0.4;
    } else {
      // traçante: cauda presa à origem enquanto o comprimento não se forma
      len = min(aFx.w, sp * age);
      center = P - dir * len * 0.5;
    }
    axY = dir;
    axX = normalize(cross(dir, toCam) + 1e-5);
    W = center + axX * c.x * size + axY * c.y * len;
  } else if (mode < 3.5) {
    vec3 dir = normalize(aVel);
    axY = dir;
    axX = normalize(cross(dir, toCam) + 1e-5);
    // base da pétala na origem, crescendo ao longo do eixo
    W = P + axX * c.x * size + axY * (c.y + 0.5) * size * aFx.w;
  } else {
    vec3 n = normalize(aPlane.xyz);
    vec3 t = normalize(abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    float cs = cos(rot), sn = sin(rot);
    axX = t * cs + b * sn;
    axY = -t * sn + b * cs;
    W = P + (axX * c.x * aAsp + axY * c.y) * size;
  }
  vec3 axZ = normalize(cross(axX, axY));
  if (dot(axZ, toCam) < 0.0) axZ = -axZ;
  vAxX = axX; vAxY = axY; vAxZ = axZ;
  vLocal = c;
  vExt = aExt;
  vSunLocal = vec3(dot(uSunDir, axX), dot(uSunDir, axY), dot(uSunDir, axZ));
  vScatter = dot(uSunDir, -toCam);

  float tile = aMisc.x;
  vec2 cell = vec2(mod(tile, 4.0), floor(tile / 4.0));
  vUv = (vec2(cell.x, 3.0 - cell.y) + (c + 0.5)) * 0.25;
  vColor = aColor;
  vMisc = aMisc;
  vFx = aFx;
  vWorld = W;
  vPlane = aPlane;
  vSize = size;
  vAge = x;
  vec4 mv = viewMatrix * vec4(W, 1.0);
  vViewDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,_e=`
uniform sampler2D uAtlas;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uGroundAmbient;
uniform float uNearFade;
uniform float uFireIntensity;
uniform sampler2D uDetail;
uniform sampler2D uDepth;
uniform float uSoftOn;
uniform vec2 uRes;
uniform vec2 uNearFar;
uniform float uTimeF;
#define NL 3
uniform vec3 uLPos[NL];
uniform vec3 uLCol[NL];
uniform float uLRange[NL];

varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMisc;
varying vec4 vFx;
varying vec3 vSunLocal;
varying vec3 vWorld;
varying vec4 vPlane;
varying float vSize;
varying float vAge;
varying float vViewDist;
varying float vScatter;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;
varying vec2 vLocal;
varying vec4 vExt;

float linDepth(float d) {
  float n = uNearFar.x, f = uNearFar.y;
  return n * f / (f - d * (f - n));
}

vec3 blackbody(float t) {
  // corpo negro aproximado (1000 K → 2600 K, cores medidas de chama de
  // hidrocarboneto), menos saturado que uma rampa "de jogo": brasa marrom-
  // avermelhada → laranja queimado → amarelo-palha → quase branco
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.30, 0.05, 0.01), vec3(0.95, 0.36, 0.09), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(1.0, 0.66, 0.32), smoothstep(0.4, 0.8, t));
  return mix(c, vec3(1.0, 0.88, 0.72), smoothstep(0.85, 1.0, t)) * (0.05 + 2.4 * t * t);
}

void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  float x = vAge;
  float fadeIn = vFx.z > 0.0 ? smoothstep(0.0, vFx.z, x) : 1.0;
  float fade = fadeIn * (1.0 - smoothstep(0.35, 1.0, x));
  // plano suave
  if (dot(vPlane.xyz, vPlane.xyz) > 0.5) {
    float h = dot(vPlane.xyz, vWorld) - vPlane.w;
    fade *= clamp(h / max(vSize * 0.3, 0.02), 0.0, 1.0);
  }
  // partícula "suave": desvanece contra a profundidade da cena (pré-passe próprio)
  if (uSoftOn > 0.5 && vExt.z > 0.0) {
    float sz = linDepth(texture2D(uDepth, gl_FragCoord.xy / uRes).r);
    fade *= clamp((sz - vViewDist) / (vExt.z + vSize * 0.35), 0.0, 1.0);
  }
  // perto da câmera
  fade *= clamp((vViewDist - uNearFade) / max(uNearFade * 3.0, 0.05), 0.0, 1.0);
  float heat = vFx.x * pow(max(1.0 - x, 0.0), vFx.y);

  // detalhe animado ("flipbook" procedural): ruído que escoa e gira com a idade
  float det = 1.0;
  if (vExt.y > 0.0 || (heat > 0.0 && vMisc.w < 0.5)) {
    float sd = vExt.w * 17.0;
    float age = x * 1.6;
    vec2 q = vLocal * 0.9 + vec2(sd, sd * 0.37);
    vec2 flow = vec2(texture2D(uDetail, q * 0.7 + vec2(age * 0.11, 0.0)).g, texture2D(uDetail, q * 0.7 + vec2(0.0, age * 0.13)).b) - 0.5;
    det = mix(texture2D(uDetail, q + flow * 0.45 + vec2(0.0, -age * 0.18)).r, texture2D(uDetail, q * 2.3 - flow * 0.3).g, 0.4);
  }

  if (vMisc.w > 0.5) {
#ifdef DEPTH_PROXY
    discard;
#endif
    // aditivo: R = núcleo branco-quente, A = intensidade
    vec3 col = mix(vColor.rgb, vec3(1.0, 0.92, 0.8) * 1.6, clamp(tex.r, 0.0, 1.0));
    float i = tex.a * fade * vColor.a;
    gl_FragColor = vec4(col * heat * i, 0.0);
    if (gl_FragColor.r + gl_FragColor.g + gl_FragColor.b < 0.0005) discard;
    return;
  }

  float dens = tex.a;
  // erosão: a densidade "come" de fora para dentro em vez de só ficar transparente
  if (vExt.y > 0.0) {
    float er = vExt.y * smoothstep(0.1, 1.0, x);
    float d2 = dens * (0.6 + 0.8 * det);
    dens *= smoothstep(er * 0.8, er * 0.8 + 0.4, d2);
  }
  float a = dens * vColor.a * fade;
#ifdef DEPTH_PROXY
  // só o miolo denso da fumaça grande escreve profundidade
  if (vExt.z < 0.5 || a < 0.6) discard;
  gl_FragColor = vec4(0.0);
  return;
#endif
  if (a < 0.003) discard;
  vec3 n = tex.rgb * 2.0 - 1.0;
  n.z = max(n.z, 0.05);
  // poeira/fumaça fina (tiles 0–2): normal "achatada" — não pode parecer bola sólida
  if (vMisc.x < 2.5) n = normalize(mix(vec3(0.0, 0.0, 1.0), n, 0.45));
  // auto-sombreamento: a luz atravessa a densidade (Beer) pelo lado oposto ao sol
  float ndl = dot(n, vSunLocal);
  float selfSh = exp(-dens * 2.6 * clamp(0.6 - ndl * 0.9, 0.0, 1.3));
  // baforadas grandes (couve-flor, tiles 3–5): luz mais dura — topo aceso pelo
  // sol, barriga e frestas na sombra (é o que dá volume a uma coluna real)
  float big = step(2.5, vMisc.x) * step(vMisc.x, 5.5);
  float wrap = clamp(ndl * mix(0.55, 0.8, big) + mix(0.45, 0.2, big), 0.0, 1.0) * mix(mix(0.35, 0.2, big), 1.0, selfSh);
  // espalhamento frontal (sol atrás da fumaça): HG g=0.55, mais forte nas bordas finas
  float gg = 0.55;
  float hg = (1.0 - gg * gg) / pow(1.0 + gg * gg - 2.0 * gg * vScatter, 1.5) * 0.0796;
  float thin = (1.0 - dens) * dens * 2.0;
  // sunlit ≥ 10: na sombra no chão, mas ao sol acima da altura (sunlit − 10)
  float sunlit = vMisc.z >= 10.0 ? smoothstep(vMisc.z - 11.5, vMisc.z - 8.5, vWorld.y) : vMisc.z;
  // céu de cima, chão por baixo, miolo denso mais escuro (auto-sombra), bordas finas mais claras
  vec3 wn = normalize(vAxX * n.x + vAxY * n.y + vAxZ * n.z);
  vec3 amb = mix(uGroundAmbient, uAmbient, wn.y * 0.5 + 0.5) * mix(0.55 + 0.45 * n.z, 0.35 + 0.65 * n.z * n.z, big) * (0.75 + 0.25 * det);
  // luzes pontuais (clarões, explosão): difusa "wrap" com transmissão
  vec3 pl = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec3 L = uLPos[i] - vWorld;
    float d2 = dot(L, L);
    float r = uLRange[i];
    if (r <= 0.0 || d2 > r * r) continue;
    vec3 l = L * inversesqrt(d2);
    float w = clamp(1.0 - pow(d2 / (r * r), 2.0), 0.0, 1.0);
    float nl = dot(wn, l) * 0.5 + 0.5;
    pl += uLCol[i] * (w * w / max(d2, 4.0)) * (nl * 0.8 + 0.2 + thin * 0.6);
  }
  vec3 albedo = vColor.rgb;
  // esticadas (modo 1) quase não espalham para frente: viram "barra de luz" contra o sol
  float hgK = vMisc.y > 0.5 && vMisc.y < 1.5 ? 0.08 : 0.5;
  vec3 lit = albedo * (amb + uSunColor * sunlit * (wrap * 0.3183 + min(hg * thin, 0.35) * hgK) + pl * 0.03);
  // fogo: emissão por densidade × calor. Não é um disco quente por baforada:
  // o fogo aparece em BOLSÕES e filamentos (limiar sobre o ruído animado),
  // mais no miolo da partícula; a borda é fuligem fria que rola por cima.
  float rr = length(vLocal) * 2.0;
  float pocket = smoothstep(0.25, 0.7, det * 0.7 + dens * 0.45 - rr * 0.3 + min(heat, 1.0) * 0.25);
  float core = dens * (0.55 + 0.45 * n.z);
  float t = min(heat, 1.0) * (0.08 + 0.92 * core * pocket);
  vec3 emit = heat > 0.0 ? blackbody(t) * uFireIntensity * min(heat, 1.5) * smoothstep(0.05, 0.3, heat) : vec3(0.0);
  gl_FragColor = vec4((lit + emit) * a, a * (1.0 - min(heat, 1.0) * 0.3));
}`,A=new O,ve=class{constructor({capacity:t=4096,atlas:n,detail:i=null,name:a=`vfx-particles`,nearFade:s=.25,clock:c=null}){this.capacity=t,this.clock=c;let u=new x(1,1),d=new o;d.index=u.index,d.setAttribute(`position`,u.getAttribute(`position`)),d.instanceCount=t;let f=n=>{let r=new g(new Float32Array(t*n),n);return r.setUsage(e),r};this.attr={aPos:f(3),aVel:f(3),aTime:f(4),aSize:f(4),aColor:f(4),aMisc:f(4),aFx:f(4),aPlane:f(4),aExt:f(4),aAsp:f(1)},this.attr.aAsp.array.fill(1);let p=this.attr.aTime.array;for(let e=0;e<t;e++)p[e*4]=-1e6,p[e*4+1]=1;for(let[e,t]of Object.entries(this.attr))d.setAttribute(e,t);d.boundingSphere=new r(new l,1e7),this.uniforms={uAtlas:{value:n},uTime:{value:0},uWind:{value:new l(.35,.05,.15)},uSunDir:{value:new l(.4,.8,.3).normalize()},uSunColor:{value:new O(3,2.9,2.7)},uAmbient:{value:new O(.35,.4,.48)},uGroundAmbient:{value:new O(.2,.18,.16)},uNearFade:{value:s},uFireIntensity:{value:1.25},uDetail:{value:i||null},uDepth:{value:null},uSoftOn:{value:0},uRes:{value:new w(1,1)},uNearFar:{value:new w(.05,1e3)},uTimeF:{value:0},uLPos:{value:[new l,new l,new l]},uLCol:{value:[new O(0,0,0),new O(0,0,0),new O(0,0,0)]},uLRange:{value:[0,0,0]}},this.material=new oe({name:a,vertexShader:ge,fragmentShader:_e,uniforms:this.uniforms,transparent:!0,depthWrite:!1,depthTest:!0,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205,side:2}),this.mesh=new y(d,this.material),this.mesh.name=a,this.mesh.frustumCulled=!1,this.mesh.renderOrder=10,this.mesh.userData.noSkyOcclusion=!0,this.depthMaterial=new oe({name:a+`-depth`,vertexShader:ge,fragmentShader:_e,uniforms:this.uniforms,defines:{DEPTH_PROXY:1},transparent:!0,depthWrite:!0,depthTest:!0,colorWrite:!1,side:2}),this.depthMesh=new y(d,this.depthMaterial),this.depthMesh.name=a+`-depth`,this.depthMesh.frustumCulled=!1,this.depthMesh.renderOrder=11,this.depthMesh.userData.noSkyOcclusion=!0,this.mesh.add(this.depthMesh),this.head=0,this.dirtyMin=1/0,this.dirtyMax=-1,this.dirtyAll=!1,this.now=0}emit(e,t,n){let r=this.head;this.head=(this.head+1)%this.capacity,this.head===0&&(this.dirtyAll=!0);let i=this.attr,a=r*3;i.aPos.array[a]=e.x,i.aPos.array[a+1]=e.y,i.aPos.array[a+2]=e.z,i.aVel.array[a]=t?t.x:0,i.aVel.array[a+1]=t?t.y:0,i.aVel.array[a+2]=t?t.z:0,a=r*4;let o=i.aTime.array;o[a]=(this.clock?this.clock():this.now)+(n.delay||0),o[a+1]=n.life??1,o[a+2]=n.drag??0,o[a+3]=n.gravity??0;let s=i.aSize.array;s[a]=n.size??.1,s[a+1]=n.size1??n.size??.1,s[a+2]=n.rot??0,s[a+3]=n.spin??0;let c=i.aColor.array;n.color&&n.color.isColor?A.copy(n.color):A.setHex(n.color??16777215,ie),c[a]=A.r,c[a+1]=A.g,c[a+2]=A.b,c[a+3]=n.alpha??1;let l=i.aMisc.array;l[a]=n.tile??0,l[a+1]=n.mode??0,l[a+2]=n.sunlit??1,l[a+3]=+!!n.additive;let u=i.aFx.array;u[a]=n.emissive??+!!n.additive,u[a+1]=n.heatPow??0,u[a+2]=n.fadeIn??0,u[a+3]=n.stretch??0;let d=i.aPlane.array;n.plane?(d[a]=n.plane[0],d[a+1]=n.plane[1],d[a+2]=n.plane[2],d[a+3]=n.plane[3]):(d[a]=0,d[a+1]=0,d[a+2]=0,d[a+3]=0);let f=i.aExt.array;return f[a]=n.turb??0,f[a+1]=n.erode??0,f[a+2]=n.soft??0,f[a+3]=n.seed??Math.random(),i.aAsp.array[r]=n.aspect??1,r<this.dirtyMin&&(this.dirtyMin=r),r>this.dirtyMax&&(this.dirtyMax=r),r}kill(e){this.attr.aTime.array[e*4]=-1e6,e<this.dirtyMin&&(this.dirtyMin=e),e>this.dirtyMax&&(this.dirtyMax=e)}flush(e){if(this.now=e,this.uniforms.uTime.value=e,!(this.dirtyMax<0&&!this.dirtyAll)){for(let e of Object.values(this.attr))e.clearUpdateRanges(),this.dirtyAll||e.addUpdateRange(this.dirtyMin*e.itemSize,(this.dirtyMax-this.dirtyMin+1)*e.itemSize),e.needsUpdate=!0;this.dirtyMin=1/0,this.dirtyMax=-1,this.dirtyAll=!1}}clear(){let e=this.attr.aTime.array;for(let t=0;t<this.capacity;t++)e[t*4]=-1e6;this.dirtyAll=!0}},ye=new v,j=new l,M=new l,N=new l,P=new l,be=class{constructor({capacity:t=384,albedo:n,normal:r,rng:i,surface:a=null}){this.capacity=t,this.surface=a,this._hit={point:new l,normal:new l,distance:0},this.rng=i;let o=new x(1,1);this.aDecal=new g(new Float32Array(t*4),4),this.aDecal.setUsage(e),o.setAttribute(`aDecal`,this.aDecal);let s=new ae({map:n,normalMap:r,normalScale:new w(1.6,1.6),roughness:.85,metalness:0,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-4,envMapIntensity:.8});s.name=`vfx-decals`,s.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec4 aDecal;
varying vec4 vDecal;`).replace(`#include <uv_vertex>`,`#include <uv_vertex>
          vDecal = aDecal;
          vec2 dUv = (vec2(mod(aDecal.x, 4.0), 3.0 - floor(aDecal.x / 4.0)) + uv) * 0.25;
          #ifdef USE_MAP
          vMapUv = dUv;
          #endif
          #ifdef USE_NORMALMAP
          vNormalMapUv = dUv;
          #endif`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec4 vDecal;`).replace(`#include <map_fragment>`,`#include <map_fragment>
 diffuseColor.a *= vDecal.y;`).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
 roughnessFactor = vDecal.z;`).replace(`#include <metalnessmap_fragment>`,`#include <metalnessmap_fragment>
 metalnessFactor = vDecal.w * smoothstep(0.12, 0.3, dot(diffuseColor.rgb, vec3(0.33)));`)},s.customProgramCacheKey=()=>`vfx-decals-2`,this.mesh=new h(o,s,t),this.mesh.name=`vfx-decals`,this.mesh.frustumCulled=!1,this.mesh.receiveShadow=!0,this.mesh.castShadow=!1,this.mesh.renderOrder=2,this.mesh.count=0,this.mesh.userData.noSkyOcclusion=!0,this.head=0,this.fading=[]}add(e,t,n,r,i=null,{roughness:a=null,alpha:o=1}={}){let s=se[n]||se.concrete,c=this.rng,l=s[c.next()*s.length|0];if(N.copy(t).normalize(),this.surface){j.copy(i||N).normalize(),i||j.negate(),P.copy(e).addScaledVector(j,-.35);let t=this.surface.raycast(P,j,.7,this._hit);t&&t.normal.dot(N)>.5&&(e=t.point,N.copy(t.normal))}let u=1;if(i){let e=Math.abs(N.dot(i));j.copy(i).addScaledVector(N,-N.dot(i)),j.lengthSq()>1e-6&&e<.85?(j.normalize(),u=Math.min(2.2,1/Math.max(e,.45))):j.set(0,0,0)}else j.set(0,0,0);if(j.lengthSq()<.5){j.set(1,0,0),Math.abs(N.x)>.9&&j.set(0,1,0),j.addScaledVector(N,-N.dot(j)).normalize();let e=c.next()*Math.PI*2;M.crossVectors(N,j),j.multiplyScalar(Math.cos(e)).addScaledVector(M,Math.sin(e)).normalize()}M.crossVectors(N,j).normalize();let d=r*(.85+c.next()*.3);n===`wood`&&Math.abs(N.y)<.7&&(M.set(0,1,0).addScaledVector(N,-N.y).normalize(),j.crossVectors(M,N).normalize(),u=1),P.copy(e).addScaledVector(N,.004),ye.makeBasis(j.multiplyScalar(d*u),M.multiplyScalar(d),N),ye.setPosition(P);let f=this.head;this.head=(this.head+1)%this.capacity,this.mesh.setMatrixAt(f,ye),this.mesh.instanceMatrix.needsUpdate=!0;let p=a??(n===`blood`||n===`bloodSpray`?.25:n===`glass`?.15:n===`metal`?.45:.9),m=this.aDecal.array;m[f*4]=l,m[f*4+1]=0,m[f*4+2]=p,m[f*4+3]=n===`metal`?.85:0,this.aDecal.needsUpdate=!0,this.mesh.count=Math.max(this.mesh.count,f+1),this.fading.push({i:f,a:0,target:o})}update(e){if(!this.fading.length)return;let t=this.aDecal.array;for(let n=this.fading.length-1;n>=0;n--){let r=this.fading[n];r.a=Math.min(r.target,r.a+e*30),t[r.i*4+1]=r.a,r.a>=r.target&&this.fading.splice(n,1)}this.aDecal.needsUpdate=!0}},F=new S,xe=new l,Se=new l,I=new v,Ce=new l(0,1,0),we=new O,Te=class{constructor(t,n,{capacity:r=64,collision:i,restitution:a=.35,friction:o=.55,lieDown:s=!0,onBounce:c=null,onFly:u=null,name:d=`vfx-rigid`,castShadow:f=!0,useColor:p=!1}){if(this.onFly=u,this.capacity=r,this.collision=i,this.restitution=a,this.friction=o,this.lieDown=s,this.onBounce=c,this.mesh=new h(t,n,r),this.mesh.name=d,this.mesh.frustumCulled=!1,this.mesh.castShadow=f,this.mesh.receiveShadow=!0,this.mesh.instanceMatrix.setUsage(e),this.mesh.count=0,p)for(let e=0;e<r;e++)this.mesh.setColorAt(e,we.setRGB(1,1,1));this.bodies=Array.from({length:r},()=>({alive:!1,pos:new l,vel:new l,quat:new S,spin:new l,scale:new l(1,1,1),life:0,age:0,ground:-1e9,groundTimer:0,bounces:0,resting:!1,halfH:.01,drag:.05,lieAxis:new l,trail:0,trailT:0,color:new O})),this.head=0,this.active=0}spawn(e,t,{spin:n=null,scale:r=1,life:i=5,color:a=null,drag:o=.05,halfH:s=.01,quat:c=null,trail:l=0}){let u=this.head;this.head=(this.head+1)%this.capacity;let d=this.bodies[u];return d.alive=!0,d.pos.copy(e),d.vel.copy(t),c?d.quat.copy(c):d.quat.setFromEuler(new te(Math.random()*6.3,Math.random()*6.3,Math.random()*6.3)),n?d.spin.copy(n):d.spin.set((Math.random()-.5)*30,(Math.random()-.5)*30,(Math.random()-.5)*30),typeof r==`number`?d.scale.setScalar(r):d.scale.copy(r),d.life=i,d.age=0,d.drag=o,d.halfH=s,d.bounces=0,d.trail=l,d.trailT=0,d.resting=!1,d.groundTimer=0,d.ground=this.groundAt(e),d.lieAxis.set(Math.random()-.5,0,Math.random()-.5).normalize(),a&&(d.color.copy(a.isColor?a:we.set(a)),this.mesh.setColorAt(u,d.color),this.mesh.instanceColor.needsUpdate=!0),this.mesh.count=Math.max(this.mesh.count,u+1),d}groundAt(e){return this.collision?.groundHeight(e.x,e.z,e.y+.05,60)??-1e9}update(e){let t=!1;for(let n=0;n<this.mesh.count;n++){let r=this.bodies[n];if(!r.alive)continue;if(t=!0,r.age+=e,r.age>=r.life){r.alive=!1,I.makeScale(0,0,0),this.mesh.setMatrixAt(n,I);continue}if(!r.resting){r.vel.y-=9.8*e,r.vel.multiplyScalar(Math.max(0,1-r.drag*e)),r.pos.addScaledVector(r.vel,e);let t=r.spin.length();t>1e-4&&(F.setFromAxisAngle(xe.copy(r.spin).divideScalar(t),t*e),r.quat.premultiply(F)),r.trail>0&&this.onFly&&(r.trailT-=e)<=0&&(r.trailT=.035,this.onFly(r)),(r.groundTimer-=e)<=0&&(r.groundTimer=.1,r.ground=this.groundAt(r.pos));let n=r.ground+r.halfH;if(r.pos.y<n&&r.vel.y<0){r.pos.y=n;let e=-r.vel.y;r.vel.y=e*this.restitution,r.vel.x*=this.friction,r.vel.z*=this.friction,r.spin.multiplyScalar(.5).add(xe.set((Math.random()-.5)*8,(Math.random()-.5)*8,(Math.random()-.5)*8).multiplyScalar(Math.min(1,e*.3))),r.bounces++,e>.6&&this.onBounce?.(r,e),(e<.8||r.bounces>4)&&(r.resting=!0,r.vel.set(0,0,0),this.lieDown&&(F.setFromUnitVectors(Ce,r.lieAxis),r.quat.copy(F)))}}let i=Math.min(1,(r.life-r.age)/.4);Se.copy(r.scale).multiplyScalar(i),I.compose(r.pos,r.quat,Se),this.mesh.setMatrixAt(n,I)}t&&(this.mesh.instanceMatrix.needsUpdate=!0)}};function Ee(){let e=new _([[0,-.0224],[.0038,-.0224],[.0047,-.0221],[.0048,-.0214],[.0047,-.0208],[.004,-.0204],[.004,-.0196],[.0046,-.019],[.0047,-.0185],[.00455,.0105],[.0043,.0118],[.0034,.0137],[.0032,.0142],[.00318,.0222],[.00305,.0224],[.0027,.0224],[.0027,.015]].map(([e,t])=>new w(e,t)),24);return e.computeVertexNormals(),e}function De(){let e=new n(.5,1).toNonIndexed(),t=e.getAttribute(`position`),r=(e,t,n,r)=>{let i=Math.sin(e*12.9898*r+t*78.233+n*37.719*r)*43758.5453;return i-Math.floor(i)};for(let e=0;e<t.count;e++){let n=t.getX(e),i=t.getY(e),a=t.getZ(e),o=Math.round(n*2)*.31+Math.round(i*2)*.57+Math.round(a*2)*.83,s=.62+.38*r(o,o*.7,o*1.3,1)+.12*r(n,i,a,2.1);t.setXYZ(e,n*s,i*s*.7,a*s)}return e.computeVertexNormals(),e}var L=(e,t,n)=>new O(e,t,n),R={concrete:{dust:L(.36,.345,.32),chip:L(.3,.29,.27),decal:`concrete`,size:.17,dustAmt:1,chunks:4,sparks:3,chipCount:10},brick:{dust:L(.32,.18,.12),chip:L(.3,.1,.06),decal:`brick`,size:.17,dustAmt:1,chunks:4,sparks:1,chipCount:10},asphalt:{dust:L(.2,.19,.18),chip:L(.06,.06,.06),decal:`asphalt`,size:.14,dustAmt:.8,chunks:3,sparks:3,chipCount:9},metal:{dust:L(.22,.22,.22),chip:L(.3,.3,.3),decal:`metal`,size:.11,dustAmt:.25,chunks:0,sparks:14,chipCount:0},wood:{dust:L(.34,.26,.17),chip:L(.5,.36,.2),decal:`wood`,size:.18,dustAmt:.6,chunks:5,sparks:0,chipCount:8,splinter:!0},dirt:{dust:L(.24,.185,.13),chip:L(.07,.05,.035),decal:`dirt`,size:.24,dustAmt:1.3,chunks:2,sparks:0,chipCount:16,plume:!0},glass:{dust:L(.5,.52,.54),chip:L(.75,.82,.85),decal:`glass`,size:.3,dustAmt:.35,chunks:6,sparks:0,chipCount:6,glints:!0},plastic:{dust:L(.4,.4,.4),chip:L(.5,.5,.5),decal:`plastic`,size:.12,dustAmt:.3,chunks:2,sparks:0,chipCount:4},rubber:{dust:L(.15,.15,.15),chip:L(.05,.05,.05),decal:`rubber`,size:.12,dustAmt:.3,chunks:0,sparks:0,chipCount:4},flesh:{blood:!0}};R.default=R.concrete;var z={wood:.45,plastic:.35,rubber:.3,glass:.08,dirt:0,metal:.03,concrete:.1,brick:.1,asphalt:0,flesh:.9},B=new l,V=new l,H=new l,Oe=new l,U=new l,ke=new l,W=new l(0,1,0),G=new O,Ae=class{constructor(e,t){this.ctx=e,this.ps=t.particles,this.vps=t.vmParticles,this.decals=t.decals,this.brass=t.brass,this.debris=t.debris,this.lights=t.lights,this.vmLight=t.vmLight,this.rng=e.rng.fork?e.rng.fork(32586):e.rng,this.budget=e.quality.particleBudget??1,this.shake={amp:0,t:0},this.heldFlash=[],this.softUntil=0,this.lensKick=0}soft(e){this.softUntil=Math.max(this.softUntil,this.ctx.time.now+e)}debrisTrail(e){let t=e.vel.length();if(t<1.8)return;let n=Math.max(e.scale.x,e.scale.y,e.scale.z);this.ps.emit(e.pos,B.copy(e.vel).multiplyScalar(.12),{life:this.R(.35,.7)*e.trail,drag:3,gravity:-.01,size:n*1.2,size1:n*this.R(3,4.5),mode:1,stretch:.03,color:G.copy(e.color).lerp(L(.4,.37,.33),.6).clone(),alpha:.16*e.trail,tile:k.DUST,sunlit:e.lit??1,fadeIn:.08}),t>4&&this.ps.emit(e.pos,B.copy(e.vel),{life:.04,size:n*.8,mode:1,stretch:.02,gravity:0,color:e.color,alpha:.6,tile:k.CHIP,sunlit:e.lit??1}),e.trail>1.2&&this.ps.emit(e.pos,B.copy(e.vel).multiplyScalar(-.1),{life:.12,drag:1,size:.012,mode:1,stretch:.03,tile:k.SPARK,additive:!0,emissive:6,heatPow:1,color:L(1,.4,.1)})}R(e,t){return e+(t-e)*this.rng.next()}n(e){let t=e*this.budget;return Math.floor(t)+ +(this.rng.next()<t-Math.floor(t))}cone(e,t,n=B){let r=this.rng.next(),i=this.rng.next(),a=1-r*(1-Math.cos(t)),o=Math.sqrt(1-a*a),s=i*Math.PI*2;return U.set(1,0,0),Math.abs(e.x)>.9&&U.set(0,1,0),U.addScaledVector(e,-e.dot(U)).normalize(),ke.crossVectors(e,U),n.copy(e).multiplyScalar(a).addScaledVector(U,Math.cos(s)*o).addScaledVector(ke,Math.sin(s)*o)}dome(e,t=.6,n=B){let r,i,a,o;do r=this.rng.next()*2-1,i=this.rng.next()*2-1,a=this.rng.next()*2-1,o=r*r+i*i+a*a;while(o>1||o<1e-4);n.set(r,i,a).multiplyScalar(1/Math.sqrt(o));let s=n.dot(e);return s<0&&n.addScaledVector(e,-1.6*s),n.addScaledVector(e,t).normalize()}envAt(e,t=W){let n=this.ctx.collision,r=this.sunDir;H.copy(e).addScaledVector(t,.08);let i=1,a=1;return n&&r&&(n.raycast(H,r,120,{filter:e=>!e.dynamic})&&(i=0),n.raycast(H,W,40,{filter:e=>!e.dynamic})&&(a=.6)),{sun:i,sky:a}}plane(e,t){return[t.x,t.y,t.z,t.x*e.x+t.y*e.y+t.z*e.z]}flashLight(e,t,n,r,i=10,{flicker:a=.3,curve:o=2}={}){let s=this.ctx.time.now,c=this.lights[0],l=1/0;for(let e of this.lights){let t=(s-e.t0)/e.life,n=t>=1?-1:e.peak*(1-t)*(1-t);n<l&&(l=n,c=e)}return c.light.position.copy(e),c.light.color.copy(t),c.light.distance=i,c.t0=s,c.life=r,c.peak=n,c.hold=!1,c.flicker=a,c.curve=o,c}addShake(e,t=.5){let n=this.shake,r=n.dur?Math.max(0,1-n.t/n.dur):0;n.amp=Math.min(1.5,n.amp*r+e),n.t=0,n.dur=t}impact(e,t,n=`concrete`,r={}){let i=R[n]||R.default,a=this.ps,o=Oe.copy(t).normalize().clone(),s=r.dir?r.dir.clone().normalize():o.clone().negate(),c=r.scale??1;if(i.blood)return this.blood(e,o,s,r);this.soft(3.5);let l=this.envAt(e,o),u=l.sun,d=l.sky,f=this.plane(e,o),p=s.clone().addScaledVector(o,-2*s.dot(o)).normalize(),m=r.exit?s.clone():o.clone().lerp(p,.35).normalize(),h=G.copy(i.dust).multiplyScalar(d).clone();(n===`metal`||i.sparks>0&&this.rng.next()<.5)&&a.emit(e.clone().addScaledVector(o,.02),null,{life:.035,size:(n===`metal`?.06:.035)*c,size1:(n===`metal`?.09:.05)*c,tile:k.GLOW,additive:!0,emissive:n===`metal`?4:1.5,color:L(1,.78,.55),rot:this.R(0,6.3)});let g=this.n(2*i.dustAmt)+1;for(let t=0;t<g;t++){let t=this.cone(m,.25).multiplyScalar(this.R(7,12)*c);a.emit(e.clone().addScaledVector(o,.03),t,{life:this.R(.25,.4),drag:9,gravity:0,size:.07*c,size1:this.R(.25,.4)*c,rot:this.R(0,6.3),spin:this.R(-3,3),color:h,alpha:.5,tile:k.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f,soft:.12,erode:.4})}let _=this.n(4*i.dustAmt)+1;for(let t=0;t<_;t++){let t=this.cone(m,.5).multiplyScalar(this.R(1.5,4.5)*c);a.emit(e.clone().addScaledVector(o,.05),t,{life:this.R(.7,1.2),drag:5,gravity:-.02,size:.18*c,size1:this.R(.6,.9)*c,rot:this.R(0,6.3),spin:this.R(-1.2,1.2),color:h,alpha:.65,tile:k.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f,fadeIn:.03,soft:.25,erode:.5,turb:.05})}let v=this.n(3*i.dustAmt);for(let t=0;t<v;t++){let t=this.cone(o,.9).multiplyScalar(this.R(.4,1.2)*c);a.emit(e.clone().addScaledVector(o,.15),t,{life:this.R(2,3.2),drag:1.6,gravity:-.015,size:.2*c,size1:this.R(1.1,1.7)*c,rot:this.R(0,6.3),spin:this.R(-.4,.4),color:h,alpha:.32,tile:k.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f,fadeIn:.1,soft:.4,erode:.45,turb:.15})}if(i.dustAmt>.5){let t=this.n(3);for(let n=0;n<t;n++){let t=this.cone(m,.6).multiplyScalar(this.R(3,7)*c);a.emit(e.clone(),t,{life:this.R(.35,.6),drag:5,gravity:.1,size:.08*c,size1:.25*c,mode:1,stretch:.02,color:h,alpha:.55,tile:k.DUST,sunlit:u,plane:f})}}let y=this.n(i.chipCount*c);for(let t=0;t<y;t++){let t=this.cone(m,.7).multiplyScalar(this.R(2.5,9));a.emit(e.clone().addScaledVector(o,.02),t,{life:this.R(.4,.9),drag:.6,gravity:1,size:this.R(.012,.03),mode:1,stretch:.006,color:G.copy(i.chip).multiplyScalar(d*this.R(.6,1.2)).clone(),alpha:1,tile:k.CHIP,sunlit:u})}if(i.plume){let t=this.n(6)+2;for(let n=0;n<t;n++){let t=this.cone(V.copy(o).lerp(W,.5).normalize(),.3).multiplyScalar(this.R(3,7.5)*c);a.emit(e.clone(),t,{life:this.R(.8,1.4),drag:2.2,gravity:.35,size:.08*c,size1:this.R(.4,.7)*c,mode:1,stretch:.04,rot:this.R(0,6.3),color:G.copy(i.dust).multiplyScalar(d*this.R(.6,1)).clone(),alpha:.85,tile:k.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f})}}let b=this.n(i.sparks*c);for(let t=0;t<b;t++){let t=this.R(6,22)*(n===`metal`?1:.7),r=this.cone(p.clone().lerp(o,.25).normalize(),n===`metal`?.7:.45).multiplyScalar(t),i=this.rng.next();a.emit(e.clone().addScaledVector(o,.01),r,{life:this.R(.06,n===`metal`?.32:.16),drag:this.R(2,4),gravity:1,size:this.R(.0035,.007),mode:1,stretch:.014,tile:k.SPARK,additive:!0,emissive:this.R(7,14),heatPow:1.6,color:i<.6?L(1,.82,.6):L(1,.62,.32)})}if(i.glints)for(let t=0,n=this.n(10);t<n;t++){let t=this.cone(m,.9).multiplyScalar(this.R(1.5,5));a.emit(e.clone(),t,{life:this.R(.3,.8),drag:.8,gravity:1,size:this.R(.02,.04),tile:k.GLOW,additive:!0,emissive:this.R(2,5),heatPow:2,color:L(.8,.9,1)})}let x=this.n(i.chunks*c);for(let t=0;t<x;t++){let t=this.cone(m,.75).multiplyScalar(this.R(1.5,4.5)),n=this.R(.012,.035)*c;this.debris.spawn(e.clone().addScaledVector(o,.03),t,{scale:i.splinter?V.set(n*.35,n*.35,n*2.6).clone():V.set(n,n*this.R(.45,.8),n*this.R(.8,1.2)).clone(),life:this.R(2,4),drag:.3,halfH:n*.3,color:G.copy(i.chip).multiplyScalar(this.R(.7,1.3)*d).clone(),trail:i.splinter?0:.5})}r.decal!==!1&&!r.collider?.dynamic&&this.decals.add(e,o,i.decal,i.size*(r.exit?1.3:1)*(r.decalScale??1),s)}blood(e,t,n,r={}){let i=this.ps;this.soft(2);let a=this.envAt(e,W),o=a.sun,s=.55+.45*a.sky,c=L(.34,.03,.024).multiplyScalar(s),l=L(.12,.008,.006).multiplyScalar(s),u=L(.42,.06,.05).multiplyScalar(s),d=t.clone(),f=r.scale??1;for(let t=0,n=this.n(4)+3;t<n;t++){let t=this.cone(d,.7).multiplyScalar(this.R(1.5,3.5)*f);i.emit(e.clone().addScaledVector(d,.06),t,{life:this.R(.22,.4),drag:8,gravity:.05,size:.1*f,size1:this.R(.35,.55)*f,rot:this.R(0,6.3),spin:this.R(-2,2),color:c,alpha:.85,tile:k.BLOOD,sunlit:o,fadeIn:.015,erode:.6,soft:.03,seed:this.rng.next()})}for(let t=0,r=this.n(7)+4;t<r;t++){let r=this.cone(n,.38).multiplyScalar(this.R(3,8)*f);i.emit(e.clone().addScaledVector(n,.22),r,{life:this.R(.3,.55),drag:6,gravity:.2,size:.12*f,size1:this.R(.55,.95)*f,rot:this.R(0,6.3),spin:this.R(-1.5,1.5),color:t%3?c:l,alpha:.8,tile:k.BLOOD,sunlit:o,fadeIn:.02,erode:.55,soft:.15,seed:this.rng.next()})}for(let t=0,r=this.n(5)+2;t<r;t++){let t=this.cone(n,.25).multiplyScalar(this.R(6,12)*f);i.emit(e.clone().addScaledVector(n,.2),t,{life:this.R(.12,.25),drag:7,gravity:.3,size:.04*f,size1:.12*f,mode:1,stretch:.03,color:l,alpha:.85,tile:k.DUST,sunlit:o})}for(let t=0,r=this.n(5)+2;t<r;t++){let r=this.cone(t%3?n:d,.9).multiplyScalar(this.R(.5,1.6)*f);i.emit(e.clone().addScaledVector(n,this.R(-.05,.35)),r,{life:this.R(.6,1.1),drag:3,gravity:.02,size:.22*f,size1:this.R(.9,1.4)*f,rot:this.R(0,6.3),spin:this.R(-.6,.6),color:u,alpha:.3,tile:k.SMOKE[this.rng.next()*3|0],sunlit:o,fadeIn:.04,erode:.6,soft:.3,turb:.06,seed:this.rng.next()})}for(let t=0,r=this.n(26);t<r;t++){let r=this.cone(t%3?n:d,.6).multiplyScalar(this.R(1.5,6.5));i.emit(e.clone(),r,{life:this.R(.35,.8),drag:.8,gravity:1,size:this.R(.006,.016),mode:1,stretch:.012,color:l,tile:k.CHIP,sunlit:o})}let p=this.ctx.collision;if(p&&r.decal!==!1){let t=p.raycast(e.clone().addScaledVector(n,.4),n,4,{filter:e=>!e.dynamic&&e.material!==`flesh`});t&&this.decals.add(t.point,t.normal,`bloodSpray`,this.R(.45,.8)*(1-t.distance/5.5),n,{alpha:.85});let r=p.raycast(e,B.set(0,-1,0),3,{filter:e=>!e.dynamic});r&&(this.decals.add(r.point.clone().addScaledVector(n,this.R(.3,.8)),r.normal,`blood`,this.R(.22,.38),n),this.decals.add(r.point.clone().addScaledVector(n,this.R(.9,1.5)),r.normal,`bloodSpray`,this.R(.25,.4),n,{alpha:.7}))}}muzzleFlashVm(e,t,n,r=0){let i=this.vps;e.updateWorldMatrix(!0,!1);let a=new l().setFromMatrixPosition(e.matrixWorld),o=new l(0,0,-1).transformDirection(e.matrixWorld),s=this.R(.7,1.15),c=(1-.35*r)*s*1.35,u=L(1,.86,.66),d=L(1,.66,.34),f=L(1,.4,.14),p=this.R(.04,.055);i.emit(a.clone(),o,{life:p,size:this.R(.026,.034)*c,mode:3,stretch:this.R(2.2,3.2),tile:k.CONE,additive:!0,emissive:6*s,color:u}),i.emit(a.clone().addScaledVector(o,.018*c),null,{life:p,size:this.R(.065,.09)*c,tile:k.BURST,additive:!0,emissive:4.2*s,color:d,rot:this.R(0,6.3)});let m=2+(this.rng.next()*3|0),h=this.R(0,6.3);for(let t=0;t<m;t++){let n=h+t/m*Math.PI*2+this.R(-.35,.35);U.set(Math.cos(n),Math.sin(n),0).transformDirection(e.matrixWorld);let r=o.clone().multiplyScalar(this.R(.9,1.4)).addScaledVector(U,this.R(.45,.8)).normalize(),s=this.R(1.5,2.6),l=this.R(.6,1.1);i.emit(a.clone().addScaledVector(o,.004),r,{life:p*1.1,size:this.R(.028,.038)*c,mode:3,stretch:s*1.1,tile:k.PETAL[t&1],additive:!0,emissive:1.5*l,color:f}),i.emit(a.clone().addScaledVector(o,.006),r,{life:p,size:this.R(.014,.02)*c,mode:3,stretch:s,tile:k.PETAL[t+1&1],additive:!0,emissive:4.5*l,color:d})}this.rng.next()<.55&&i.emit(a.clone(),o,{life:p,size:.03*c,mode:3,stretch:this.R(2.2,3.4),tile:k.PETAL[this.rng.next()*2|0],additive:!0,emissive:1.6*s,color:f}),i.emit(a.clone().addScaledVector(o,.03),null,{life:p*1.3,size:.14*c,tile:k.GLOW,additive:!0,emissive:.12,color:L(1,.55,.25)});for(let e=0,t=this.n(2);e<t;e++){let e=this.cone(o,.25).multiplyScalar(this.R(3,6));i.emit(a.clone(),e,{life:this.R(.03,.07),drag:3,size:.0018,mode:1,stretch:.01,tile:k.SPARK,additive:!0,emissive:8,heatPow:1,color:d})}for(let e=0,t=3+this.n(1);e<t;e++){let e=this.cone(o,.6).multiplyScalar(this.R(.12,.4)).add(V.set(this.R(-.02,.02),this.R(.04,.1),0));i.emit(a.clone().addScaledVector(o,this.R(.015,.05)),e,{life:this.R(.45,.85),drag:2.4,gravity:-.006,size:.018*c,size1:this.R(.07,.12)*c,rot:this.R(0,6.3),spin:this.R(-1.2,1.2),color:L(.46,.46,.46),alpha:.075-.035*r,tile:k.SMOKE[this.rng.next()*3|0],sunlit:1,fadeIn:.12,erode:.8,turb:.008,delay:.015,seed:this.rng.next()})}this.vmLight&&(this.vmLight.light.position.copy(a).addScaledVector(o,.1),this.vmLight.light.position.y+=.03,this.vmLight.t0=this.ctx.time.now,this.vmLight.life=.07,this.vmLight.peak=1.5*s),t&&(this.flashLight(t.clone().addScaledVector(n,.25),L(1,.62,.34),70*s,.07,12,{flicker:.15}),this.muzzleWorld(t,n,1,r))}muzzleWorld(e,t,n=1,r=0){let i=this.ps,a=this.envAt(e);this.soft(2);for(let o=0,s=this.n(3);o<s;o++){let o=this.cone(t,.4).multiplyScalar(this.R(1,2.8)).addScaledVector(W,.25);i.emit(e.clone().addScaledVector(t,.15),o,{life:this.R(.7,1.3),drag:3,gravity:-.03,size:.04*n,size1:this.R(.3,.5)*n,rot:this.R(0,6.3),spin:this.R(-1,1),color:L(.5,.5,.5).multiplyScalar(a.sky),alpha:.1-.05*r,tile:k.SMOKE[this.rng.next()*3|0],sunlit:a.sun,fadeIn:.12,erode:.75,turb:.06,soft:.2,seed:this.rng.next()})}for(let r=0,a=this.n(2);r<a;r++){let r=this.cone(t,.2).multiplyScalar(this.R(8,16));i.emit(e.clone(),r,{life:this.R(.04,.09),drag:2,gravity:.5,size:.004*n,mode:1,stretch:.01,tile:k.SPARK,additive:!0,emissive:9,heatPow:1,color:L(1,.7,.4)})}}muzzleFlashWorld(e,t,{hold:n=!1}={}){let r=this.ps,i=n?30:.05,a=this.R(.75,1.15),o=L(1,.66,.34),s=L(1,.42,.15),c=[];if(n){for(let e of this.heldFlash)r.kill(e);this.heldFlash.length=0}c.push(r.emit(e.clone(),t.clone(),{life:i,size:.05*a,mode:3,stretch:2.8,tile:k.CONE,additive:!0,emissive:6*a,color:L(1,.86,.66)})),c.push(r.emit(e.clone().addScaledVector(t,.05),null,{life:i,size:this.R(.12,.17)*a,tile:k.BURST,additive:!0,emissive:3.5*a,color:o,rot:this.R(0,6.3)})),c.push(r.emit(e.clone().addScaledVector(t,.08),null,{life:i*1.2,size:.5,tile:k.GLOW,additive:!0,emissive:.25,color:L(1,.55,.25)}));let u=this.R(0,6.3),d=new l().crossVectors(t,W);d.lengthSq()<1e-6&&d.set(1,0,0),d.normalize();let f=new l().crossVectors(d,t).normalize(),p=3+(this.rng.next()*2|0);for(let n=0;n<p;n++){let l=u+n/p*Math.PI*2+this.R(-.3,.3),m=t.clone().multiplyScalar(this.R(.9,1.3)).addScaledVector(d,Math.cos(l)*this.R(.45,.75)).addScaledVector(f,Math.sin(l)*this.R(.45,.75)).normalize(),h=this.R(1.6,2.6);c.push(r.emit(e.clone(),m,{life:i,size:this.R(.06,.08)*a,mode:3,stretch:h*1.1,tile:k.PETAL[n&1],additive:!0,emissive:1.8,color:s})),c.push(r.emit(e.clone(),m,{life:i,size:this.R(.03,.04)*a,mode:3,stretch:h,tile:k.PETAL[n+1&1],additive:!0,emissive:5,color:o}))}n&&this.heldFlash.push(...c);let m=this.flashLight(e.clone().addScaledVector(t,.3),L(1,.62,.34),35*a,n?30:.06,10);n&&(m.hold=!0),this.muzzleWorld(e,t,1.4)}tracer(e,t,{speed:n=420,length:r=4,width:i=.02,emissive:a=11,color:o=L(1,.42,.16)}={}){let s=B.subVectors(t,e),c=s.length();if(c<.5)return;s.divideScalar(c);let l=Math.min(r,c),u=s.clone().multiplyScalar(n);this.ps.emit(e.clone(),u,{life:c/n,size:i*.55,mode:2,stretch:l*.85,tile:k.SPARK,additive:!0,emissive:a*1.6,color:L(1,.72,.4)}),this.ps.emit(e.clone(),u,{life:c/n,size:i*2.4,mode:2,stretch:l,tile:k.SPARK,additive:!0,emissive:a*.12,color:o})}eject(e,t,n,r=!0){let i=new l(this.R(-25,25),this.R(-40,40),this.R(15,35)),a=new S().setFromAxisAngle(new l(0,0,1),Math.PI/2+this.R(-.3,.3));n&&a.premultiply(n),this.brass.spawn(e,t,{spin:i,life:6,drag:.4,halfH:.0048,quat:a}),r&&this.ps.emit(e.clone(),t.clone().multiplyScalar(.25),{life:this.R(.35,.6),drag:4,gravity:-.04,size:.02,size1:.12,rot:this.R(0,6.3),color:L(.48,.48,.48),alpha:.06,tile:k.SMOKE[this.rng.next()*3|0],fadeIn:.12,erode:.7,seed:this.rng.next()})}barrelWisp(e,t){let n=new l(this.R(-.05,.05),this.R(.25,.5),this.R(-.05,.05));this.ps.emit(e.clone(),n,{life:this.R(1,1.6),drag:.6,gravity:-.04,size:.03,size1:this.R(.18,.3),rot:this.R(0,6.3),spin:this.R(-.8,.8),color:L(.55,.55,.56),alpha:.1*t,tile:k.DUST,fadeIn:.15})}explosion(e,{radius:t=6,normal:n=W}={}){let r=this.ps,i=this.ctx,a=n.clone().normalize(),o=this.envAt(e,a),s=this.plane(e,a),c=t/6,l=()=>this.rng.next();if(this.soft(24),!o.sun&&this.sunDir){for(let t=3;t<=30;t+=3)if(H.copy(e).addScaledVector(a,t),!this.ctx.collision.raycast(H,this.sunDir,120,{filter:e=>!e.dynamic})){o.sun=10+e.y+t;break}}let u=o.sky,d=L(.045,.039,.034),f=L(.3,.26,.21).multiplyScalar(u);r.emit(e.clone().addScaledVector(a,.9*c),null,{life:.1,size:2.2*c,size1:4.5*c,tile:k.GLOW,additive:!0,emissive:6,heatPow:2,color:L(1,.8,.6)}),r.emit(e.clone().addScaledVector(a,.6*c),null,{life:.07,size:1.8*c,size1:3.2*c,tile:k.BURST,additive:!0,emissive:4,heatPow:1,color:L(1,.78,.5),rot:this.R(0,6.3)});for(let t=0,n=this.n(26)+12;t<n;t++){let t=this.dome(a,.45,V).clone(),n=t.clone().multiplyScalar(this.R(3,9)*c).addScaledVector(a,this.R(.5,2)*c),i=this.rng.next();r.emit(e.clone().addScaledVector(a,.9*c).addScaledVector(t,this.R(.2,1.1)*c),n,{life:this.R(4,6.5),drag:3.6,gravity:-.22,size:this.R(1.2,1.8)*c,size1:this.R(3.4,4.8)*c,rot:this.R(0,6.3),spin:this.R(-.4,.4),color:d,alpha:1,tile:k.BILLOW[l()*3|0],emissive:i<.3?this.R(.3,.6):this.R(1.3,2),heatPow:this.R(6,9),sunlit:o.sun,plane:s,fadeIn:.012,erode:.28,soft:1.2*c,turb:.25*c,seed:l()})}for(let t=0,n=this.n(12)+5;t<n;t++){let t=this.dome(a,1.4,V).clone(),n=t.clone().multiplyScalar(this.R(4,8)*c);r.emit(e.clone().addScaledVector(a,1.6*c).addScaledVector(t,this.R(0,.9)*c),n,{life:this.R(5,8),drag:2.4,gravity:-.2,size:this.R(1.2,1.8)*c,size1:this.R(3.6,5.2)*c,rot:this.R(0,6.3),spin:this.R(-.35,.35),color:L(.055,.048,.042),alpha:.95,tile:k.BILLOW[l()*3|0],emissive:this.R(.35,.6),heatPow:this.R(10,14),sunlit:o.sun,plane:s,fadeIn:.015,delay:this.R(.05,.2),erode:.3,soft:1.6*c,turb:.4*c,seed:l()})}for(let t=0,n=this.n(10)+5;t<n;t++){let t=this.cone(a,.35).multiplyScalar(this.R(.6,2.2)*c);r.emit(e.clone().addScaledVector(a,this.R(.3,1.6)*c).addScaledVector(this.cone(a,1.5,V),this.R(0,.6)*c),t,{life:this.R(5,9),drag:1.4,gravity:-.05,size:this.R(1,1.6)*c,size1:this.R(2.6,3.8)*c,rot:this.R(0,6.3),spin:this.R(-.2,.2),color:L(.15,.13,.11).multiplyScalar(u),alpha:.9,tile:k.BILLOW[l()*3|0],sunlit:o.sun,plane:s,fadeIn:.02,delay:this.R(.02,.25),erode:.3,soft:1.2*c,turb:.3*c,seed:l()})}for(let t=0,n=this.n(24)+10;t<n;t++){let t=this.cone(a,.7).multiplyScalar(this.R(.6,3.5)*c).addScaledVector(a,this.R(.8,3.2)*c),n=this.rng.next(),i=this.R(.08,.15),d=L(i,i*.95,i*.88).lerp(L(.2,.17,.13),(1-n)*.6).multiplyScalar(u);r.emit(e.clone().addScaledVector(a,this.R(.8,2.4)*c),t,{life:this.R(7,13),drag:1.1,gravity:-.03-n*.02,size:this.R(1.6,2.4)*c,size1:this.R(5,8)*c,rot:this.R(0,6.3),spin:this.R(-.12,.12),color:d,alpha:.85,tile:k.BILLOW[l()*3|0],sunlit:o.sun,plane:s,fadeIn:.07,delay:this.R(.15,.8),erode:.35,soft:2.2*c,turb:.6*c,seed:l()})}for(let t=0,n=this.n(12)+4;t<n;t++){let t=this.R(0,Math.PI*2);U.set(Math.cos(t),0,Math.sin(t));let n=U.clone().multiplyScalar(this.R(1.5,4)*c);r.emit(e.clone().addScaledVector(a,this.R(.8,2)).addScaledVector(U,this.R(1,3)*c),n,{life:this.R(14,24),drag:.5,gravity:-.004,size:3*c,size1:this.R(10,15)*c,rot:this.R(0,6.3),spin:this.R(-.05,.05),color:L(.36,.32,.27).multiplyScalar(u),alpha:.16,tile:k.SMOKE[l()*3|0],sunlit:o.sun?1:.4,plane:s,fadeIn:.08,delay:this.R(.3,1.2),erode:.4,soft:3,turb:.8,seed:l(),aspect:this.R(1.4,2)})}for(let t=0,n=this.n(34)+12;t<n;t++){let i=t/n*Math.PI*2+this.R(-.15,.15);U.set(Math.cos(i),0,Math.sin(i));let u=this.R(9,20)*c,d=U.clone().multiplyScalar(u).addScaledVector(a,this.R(.2,1.4)),p=this.R(.75,1.15);r.emit(e.clone().addScaledVector(U,this.R(.3,1)*c).addScaledVector(a,this.R(.15,.5)),d,{life:this.R(2.4,4.5),drag:this.R(3,4.5),gravity:-.012,size:this.R(.5,.9)*c,size1:this.R(2.2,3.6)*c,rot:this.R(-.3,.3),spin:this.R(-.15,.15),color:f.clone().multiplyScalar(p),alpha:this.R(.3,.5),tile:k.SMOKE[l()*3|0],sunlit:o.sun,plane:s,fadeIn:.03,delay:this.R(0,.06),erode:.6,soft:1,turb:.3,seed:l(),aspect:this.R(1.8,3)})}r.emit(e.clone().addScaledVector(a,.1),null,{life:.45,size:1.5*c,size1:t*3,mode:4,plane:s,tile:k.RING,color:f,alpha:.4,sunlit:o.sun,soft:.6,fadeIn:.03});for(let t=0,n=this.n(9)+3;t<n;t++){let t=this.cone(a,.6).multiplyScalar(this.R(11,19)*c);r.emit(e.clone().addScaledVector(a,.3),t,{life:this.R(.9,1.6),drag:1.6,gravity:.55,size:.14*c,size1:this.R(.6,1)*c,mode:1,stretch:.08,color:L(.1,.085,.07).multiplyScalar(u),alpha:.55,tile:k.DUST,sunlit:o.sun,plane:s,erode:.5,soft:.5,seed:l()})}for(let t=0,n=this.n(60);t<n;t++){let t=this.cone(a,.95).multiplyScalar(this.R(5,17)*c);r.emit(e.clone().addScaledVector(a,.2),t,{life:this.R(.9,2),drag:.35,gravity:1,size:this.R(.012,.045),mode:1,stretch:.016,color:L(.06,.055,.045).multiplyScalar(this.R(.7,1.8)),tile:k.CHIP,sunlit:o.sun})}for(let t=0,n=this.n(36);t<n;t++){let t=this.cone(a,1.2).multiplyScalar(this.R(10,28)*c);r.emit(e.clone().addScaledVector(a,.4),t,{life:this.R(.15,.6),drag:this.R(2,3.5),gravity:.8,size:this.R(.006,.012),mode:1,stretch:.014,tile:k.SPARK,additive:!0,emissive:this.R(8,16),heatPow:1.4,color:L(1,.7,.4)})}for(let t=0,n=this.n(55);t<n;t++){let t=this.cone(a,1).multiplyScalar(this.R(2,10)*c);r.emit(e.clone().addScaledVector(a,this.R(.5,2)*c),t,{life:this.R(1.2,3.5),drag:this.R(1.5,3.2),gravity:this.rng.next()<.55?this.R(-.05,-.02):this.R(.1,.3),size:this.R(.006,.016),mode:1,stretch:this.R(.015,.03),tile:k.SPARK,additive:!0,emissive:this.R(4,10),heatPow:this.R(1,1.8),color:L(1,this.R(.35,.5),.12),turb:this.R(.4,1.4),seed:l(),delay:this.R(0,.25)})}let p=[L(.32,.31,.29),L(.12,.115,.11),L(.3,.13,.08),L(.2,.17,.13),L(.25,.24,.22)];for(let t=0,n=this.n(26);t<n;t++){let n=this.cone(a,.85).multiplyScalar(this.R(4,14)*c),r=.012*6**this.rng.next(),i=this.debris.spawn(e.clone().addScaledVector(a,.3),n,{scale:V.set(r*this.R(.7,1.4),r*this.R(.35,.9),r*this.R(.7,1.5)).clone(),life:this.R(6,10),drag:.2,halfH:r*.25,color:p[this.rng.next()*p.length|0].clone().multiplyScalar(this.R(.7,1.25)*u),trail:t%3==0?1.4:1});i.lit=o.sun?1:.4}this.decals.add(e,a,`scorch`,t*.8,null,{roughness:.95}),this.decals.add(e.clone().addScaledVector(U.set(this.R(-1,1),0,this.R(-1,1)),.2*c),a,`scorch`,t*.38,null,{roughness:.92,alpha:.85}),this.flashLight(e.clone().addScaledVector(a,1.4*c),L(1,.8,.6),2500*c,.14,t*10,{flicker:0,curve:2}),this.flashLight(e.clone().addScaledVector(a,1.8*c),L(1,.5,.2),320*c,1.8,t*8,{flicker:.45,curve:1.6});let m=i.camera.position.distanceTo(e),h=Math.max(0,1-m/(t*7));i.services.rendering?.flash?.(.18*h*h+.03),this.addShake(1.1*h+.08,.9),i.bus.emit(`vfx:explosion`,{point:e.clone(),radius:t,intensity:h})}},K=2,q=new l,J=new l,Y=new l,X=new l,Z=new l,je=new l,Me=new l,Ne=new l,Pe=class{constructor(e,{exclude:t=()=>!1}={}){this.root=e,this.exclude=t,this.built=!1,this.tris=null,this.cells=new Map,this.big=[],this.stamp=0,this.marks=null}accept(e){if(!e.isMesh||e.isInstancedMesh||e.isSkinnedMesh||!e.visible||this.exclude(e)||(Array.isArray(e.material)?e.material:[e.material]).some(e=>!e||e.transparent||e.colorWrite===!1||e.visible===!1||e.depthWrite===!1))return!1;let t=e.geometry;if(!t?.attributes?.position||(t.boundingSphere||t.computeBoundingSphere(),t.boundingSphere.radius>1500))return!1;for(let t=e.parent;t;t=t.parent)if(!t.visible)return!1;return!0}build(){this.built=!0;let e=[],t=0;this.root.updateMatrixWorld(!0),this.root.traverse(n=>{if(!this.accept(n))return;let r=n.geometry,i=r.index?r.index.count/3:r.attributes.position.count/3;e.push(n),t+=i});let n=new Float32Array(t*9),r=0;for(let t of e){let e=t.geometry,i=e.attributes.position,a=e.index,o=a?a.count/3:i.count/3,s=t.matrixWorld;for(let e=0;e<o;e++){let t=a?a.getX(e*3):e*3,o=a?a.getX(e*3+1):e*3+1,c=a?a.getX(e*3+2):e*3+2;q.fromBufferAttribute(i,t).applyMatrix4(s),J.fromBufferAttribute(i,o).applyMatrix4(s),Y.fromBufferAttribute(i,c).applyMatrix4(s);let l=r*9;n[l]=q.x,n[l+1]=q.y,n[l+2]=q.z,n[l+3]=J.x,n[l+4]=J.y,n[l+5]=J.z,n[l+6]=Y.x,n[l+7]=Y.y,n[l+8]=Y.z;let u=Math.floor(Math.min(q.x,J.x,Y.x)/K),d=Math.floor(Math.max(q.x,J.x,Y.x)/K),f=Math.floor(Math.min(q.z,J.z,Y.z)/K),p=Math.floor(Math.max(q.z,J.z,Y.z)/K);if((d-u+1)*(p-f+1)>256)this.big.push(r);else for(let e=u;e<=d;e++)for(let t=f;t<=p;t++){let n=e*73856093^t*19349663,i=this.cells.get(n);i||this.cells.set(n,i=[]),i.push(r)}r++}}this.tris=n,this.marks=new Uint32Array(r),this.count=r}raycast(e,t,n,r={point:new l,normal:new l,distance:0}){if(this.built||this.build(),!this.count)return null;let i=++this.stamp,a=e.x+t.x*n,o=e.z+t.z*n,s=Math.floor(Math.min(e.x,a)/K),c=Math.floor(Math.max(e.x,a)/K),u=Math.floor(Math.min(e.z,o)/K),d=Math.floor(Math.max(e.z,o)/K),f=n,p=!1,m=this.tris,h=n=>{if(this.marks[n]===i)return;this.marks[n]=i;let a=n*9;q.set(m[a],m[a+1],m[a+2]),X.set(m[a+3]-q.x,m[a+4]-q.y,m[a+5]-q.z),Z.set(m[a+6]-q.x,m[a+7]-q.y,m[a+8]-q.z),je.crossVectors(t,Z);let o=X.dot(je);if(Math.abs(o)<1e-9)return;let s=1/o;Me.subVectors(e,q);let c=Me.dot(je)*s;if(c<0||c>1)return;Ne.crossVectors(Me,X);let l=t.dot(Ne)*s;if(l<0||c+l>1)return;let u=Z.dot(Ne)*s;u<0||u>=f||(f=u,p=!0,r.normal.crossVectors(X,Z).normalize(),r.normal.dot(t)>0&&r.normal.negate())};for(let e=s;e<=c;e++)for(let t=u;t<=d;t++){let n=this.cells.get(e*73856093^t*19349663);if(n)for(let e=0;e<n.length;e++)h(n[e])}for(let e=0;e<this.big.length;e++)h(this.big[e]);return p?(r.distance=f,r.point.copy(e).addScaledVector(t,f),r):null}},Q=new l,Fe=new l,$=new l,Ie=new O,Le=Math.PI/180;function Re(e,t,n){let r=e.box,i=1/0,a=`x`;for(let e of[`x`,`y`,`z`]){if(Math.abs(n[e])<1e-6)continue;let o=((n[e]>0?r.max[e]:r.min[e])-t[e])/n[e];o<i&&(i=o,a=e)}if(!isFinite(i))return null;let o=new l;return o[a]=Math.sign(n[a]),{point:t.clone().addScaledVector(n,Math.max(0,i)),normal:o,thickness:Math.max(0,i)}}var ze={name:`vfx`,order:60,init(e){let{scene:t,vm:n,bus:r,collision:i,quality:a,renderer:o}=e,s=a.particleBudget??1,c=pe(o,{particleSize:a.level===`low`?1024:2048,anisotropy:Math.min(a.anisotropy||4,o.capabilities.getMaxAnisotropy?.()||4)});this.tex=c;let u=me();c.detail=u;let d=()=>e.time.now,f=new ve({capacity:Math.max(1024,Math.round(8192*s)),atlas:c.particles,detail:u,clock:d,nearFade:.3});t.add(f.mesh);let p=new ve({capacity:384,atlas:c.particles,detail:u,clock:d,nearFade:0,name:`vfx-vm-particles`});p.uniforms.uWind.value.set(0,0,0),p.mesh.remove(p.depthMesh),n.scene.add(p.mesh);let m=()=>{let t=new Set((e.services.enemies?.list||[]).map(e=>e.group));return n=>{for(let r=n;r;r=r.parent)if(t.has(r)||r===e.camera||r.name?.startsWith(`vfx`))return!0;return!1}},h=new Pe(t,{exclude:m()});r.on(`ready`,()=>{try{h.built||(h.exclude=m(),h.build())}catch(e){console.warn(`[vfx] índice de superfícies falhou`,e)}}),this.surface=h;let g=new be({capacity:Math.round(320*Math.max(.5,s)),albedo:c.decalAlbedo,normal:c.decalNormal,rng:e.rng,surface:h});t.add(g.mesh);let _=new ae({color:new O(.62,.43,.17),metalness:1,roughness:.36,envMapIntensity:1});_.name=`vfx-brass`;let v=()=>e.services.audio,y=new Te(Ee(),_,{capacity:48,collision:i,restitution:.38,friction:.6,name:`vfx-brass`,castShadow:!1,onBounce:(e,t)=>v()?.play?.(`brass`,{position:e.pos,volume:Math.min(1,t*.2)})});t.add(y.mesh);let b=new ae({color:16777215,roughness:.95,metalness:0,flatShading:!0,map:u});b.name=`vfx-debris`,b.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vObjP;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vObjP = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vObjP;`).replace(`#include <map_fragment>`,`
          vec3 op = vObjP * 2.3;
          float nA = texture2D(map, op.xy).r, nB = texture2D(map, op.yz + 0.37).g, nC = texture2D(map, op.zx + 0.71).b;
          float nF = texture2D(map, vObjP.xy * 9.0 + vObjP.z * 3.0).r;
          float tri = (nA + nB + nC) / 3.0;
          float cav = smoothstep(0.22, 0.48, length(vObjP));
          diffuseColor.rgb *= (0.55 + 0.75 * tri) * (0.75 + 0.5 * nF) * mix(0.55, 1.05, cav);
        `).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
roughnessFactor = clamp(0.8 + 0.25 * nF, 0.0, 1.0);`)},b.customProgramCacheKey=()=>`vfx-debris-2`;let x=new Te(De(),b,{capacity:Math.round(128*Math.max(.5,s)),collision:i,restitution:.25,friction:.5,lieDown:!1,name:`vfx-debris`,useColor:!0,onFly:e=>this.fx?.debrisTrail(e)});t.add(x.mesh);let S=[];for(let e=0;e<3;e++){let n=new ne(16752736,0,10,2);n.name=`vfx-flash-${e}`,n.castShadow=!1,t.add(n),S.push({light:n,t0:-1e6,life:1,peak:0,hold:!1,flicker:.3,curve:2})}let C=new ne(16754792,0,2.6,1);C.name=`vfx-vm-flash`,n.scene.add(C);let ee={light:C,t0:-1e6,life:1,peak:0},te=new Set([f.mesh,g.mesh,y.mesh,x.mesh,...S.map(e=>e.light)]);this.prepass=a.level===`low`?null:new he(o,t,e.camera,{scale:a.level===`ultra`?.75:.5,isOwn:e=>te.has(e)||e.name&&e.name.startsWith(`vfx`)}),this.lensBase=null,this.lensKick=0;let w=new Ae(e,{particles:f,vmParticles:p,decals:g,brass:y,debris:x,lights:S,vmLight:ee});this.fx=w,this.sys={particles:f,vmParticles:p,decals:g,brass:y,debris:x,lights:S,vmLight:ee},this.heat=0,this.lastFire=-1e6,this.wispTimer=0,this.shotCount=0,this.pendingTracer=null,this.lastMuzzleWorld=new l,this.lastAimDir=new l(0,0,-1);let T=!!e.shot?.preset?.combat,E=(t,r)=>{let i=n.camera;i.updateMatrixWorld(),r.copy(t).applyMatrix4(i.matrixWorldInverse);let a=Math.tan(e.camera.fov*Le*.5)/Math.tan(i.fov*Le*.5);return r.x*=a,r.y*=a,r.applyMatrix4(e.camera.matrixWorld)};this.vmToWorld=E;let D=(t,n)=>t?(t.updateWorldMatrix(!0,!1),E(Q.setFromMatrixPosition(t.matrixWorld),n)):n.copy(e.player.eyePosition).addScaledVector(e.player.getAimDir($),.6);this.muzzleWorld=D;let re=t=>{let n=e.services.weapon,r=!!n?.brassByVfx||!n,i=n?.ejectPort,a=e.camera,o;if(i)i.updateWorldMatrix(!0,!1),o=E(Q.setFromMatrixPosition(i.matrixWorld),new l);else if(t){t.updateWorldMatrix(!0,!1);let e=Fe.set(0,0,-1).transformDirection(t.matrixWorld);Q.setFromMatrixPosition(t.matrixWorld).addScaledVector(e,-.36),Q.y+=.025,o=E(Q,new l)}else return;let s=new l(w.R(1.6,2.6),w.R(1.4,2.3),w.R(-.2,.5)).applyQuaternion(a.quaternion);r||(o.set(.5,-.3,-.12).applyMatrix4(a.matrixWorld),s.set(w.R(.8,1.4),w.R(-.2,.4),w.R(-.1,.2)).applyQuaternion(a.quaternion)),s.add(e.player.velocity||$.set(0,0,0)),w.eject(o,s,a.quaternion,r)};r.on(`weapon:fire`,t=>{let n=t.muzzle||e.services.weapon?.muzzle,r=D(n,new l),i=(t.dir?$.copy(t.dir):e.player.getAimDir($)).clone();this.lastMuzzleWorld.copy(r),this.lastAimDir.copy(i);let a=typeof t.ads==`number`?t.ads:t.ads?1:e.services.weapon?.ads||0;n&&e.vm.visible&&!t.suppressed?w.muzzleFlashVm(n,r,i,a):w.muzzleWorld(r,i,1,a),re(n),this.heat=Math.min(1,this.heat+.07),this.lastFire=e.time.now,this.shotCount++,this.pendingTracer=this.shotCount%3==1?{from:r.clone(),dir:i,to:null}:null}),r.on(`weapon:hit`,t=>{if(!t?.point)return;let n=t.material||t.collider?.material||e.services.world?.materialAt?.(t)||`concrete`,r=t.dir?t.dir.clone().normalize():null;w.impact(t.point,t.normal||Fe.set(0,1,0),n,{dir:r,collider:t.collider,exit:t.exit}),this.pendingTracer&&!this.pendingTracer.to&&!t.exit&&!(t.penetration>0)&&(this.pendingTracer.to=t.point.clone()),!t.ballistic&&r&&t.collider&&this.visualPenetration(t,n,r)}),r.on(`enemy:fire`,e=>{if(!e?.origin||!e?.dir)return;let t=i.raycast(e.origin,e.dir,150,{filter:t=>t.tag!==`enemy`&&t.owner!==e.enemy?.group}),n=t?t.point:e.origin.clone().addScaledVector(e.dir,150);w.muzzleFlashWorld(e.origin,e.dir,{hold:T}),w.tracer(e.origin.clone().addScaledVector(e.dir,.4),n,T?{speed:70,length:3.5}:{speed:380,length:5}),t&&w.impact(t.point,t.normal,t.collider?.material||`concrete`,{dir:e.dir,collider:t.collider,scale:.8})});let ie=e=>{let t=e?.point||e?.position;t&&w.explosion(t.isVector3?t:new l(...t),{radius:e.radius??6,normal:e.normal})};r.on(`explosion`,ie),r.on(`grenade:explode`,ie);let oe={PENETRATION:z,fire(e,t,{range:n=800,damage:a=30,power:o=1,source:s=`player`,filter:c=null,maxSurfaces:l=4,emit:u=!0}={}){let d=[],f=e.clone(),p=t.clone().normalize(),m=n,h=a,g=o,_=new Set;for(let e=0;e<l&&m>0;e++){let t=i.raycast(f,p,m,{filter:e=>!_.has(e.id)&&e.tag!==s&&(!c||c(e))});if(!t)break;let n=t.collider?.material||`concrete`,a={...t,material:n,dir:p.clone(),damage:h*(t.part===`head`?2.5:1),source:s,ballistic:!0,penetration:e};t.collider?.data?.damage?.(a.damage,a),u&&r.emit(`weapon:hit`,a),d.push(a);let o=(z[n]??.05)*g,l=t.collider?Re(t.collider,t.point,p):null;if(!l||l.thickness>o)break;if(g-=l.thickness/Math.max(.001,z[n]??.05)*.5+.25,h*=.65,n!==`flesh`){let i={point:l.point,normal:l.normal,distance:t.distance+l.thickness,collider:t.collider,material:n,dir:p.clone(),damage:0,source:s,ballistic:!0,penetration:e,exit:!0};u&&r.emit(`weapon:hit`,i)}if(_.add(t.collider.id),m-=t.distance+l.thickness,f.copy(l.point).addScaledVector(p,.005),g<=0)break}return d}};e.provide(`vfx`,{impact:(e,t,n,r)=>w.impact(e,t,n||`concrete`,r||{}),tracer:(e,t,n)=>w.tracer(e,t,n),muzzleFlash:(t,n={})=>{if(!t)return;let r=D(t,new l);w.muzzleFlashVm(t,r,n.dir||e.player.getAimDir(new l),n.ads??0)},muzzleFlashWorld:(e,t,n)=>w.muzzleFlashWorld(e,t,n||{}),explosion:(e,t)=>w.explosion(e,t||{}),blood:(e,t,n)=>w.blood(e,t,n||t.clone().negate()),decal:(e,t,n,r,i)=>w.decals.add(e,t,n,r,i),eject:(t,n)=>w.eject(t,n,e.camera.quaternion),shake:(e,t)=>w.addShake(e,t),get softActive(){return w.softUntil>e.time.now},ballistics:oe,materials:Object.keys(R),vmToWorld:E,clear:()=>{f.clear(),p.clear()},get stats(){return{particles:f.capacity,decals:g.mesh.count,brass:y.mesh.count,debris:x.mesh.count}}})},visualPenetration(e,t,n){let r=this.fx,i=r.ctx;if(t===`flesh`)return;let a=z[t]??0;if(a<=0)return;let o=Re(e.collider,e.point,n);if(!o||o.thickness>a||o.thickness<.001)return;r.impact(o.point,o.normal,t,{dir:n,exit:!0,scale:.8,collider:e.collider});let s=i.collision.raycast(o.point.clone().addScaledVector(n,.005),n,300,{filter:t=>t.id!==e.collider.id&&t.tag!==`player`});s&&r.impact(s.point,s.normal,s.collider?.material||`concrete`,{dir:n,collider:s.collider,scale:.8})},update(e,t){let{brass:n,debris:r}=this.sys,i=this.pendingTracer;if(i){let e=i.to||i.from.clone().addScaledVector(i.dir,200);this.fx.tracer(i.from.clone().addScaledVector(i.dir,.5),e,{speed:520,length:3.5,width:.016,emissive:9}),this.pendingTracer=null}if(n.update(e),r.update(e),this.heat=Math.max(0,this.heat-e*.18),this.heat>.25&&t.time.now-this.lastFire>.25&&t.vm.visible&&(this.wispTimer-=e,this.wispTimer<=0)){this.wispTimer=.07;let e=t.services.weapon?.muzzle;e&&this.fx.barrelWisp(this.muzzleWorld(e,new l),this.heat)}},frame(e,t){let{particles:n,vmParticles:r,decals:i,lights:a,vmLight:o}=this.sys,s=t.time.now;this.syncLighting(t),n.flush(s),r.flush(s),i.update(1/60);let c=n.uniforms;for(let e=0;e<a.length;e++){let t=a[e],n=(s-t.t0)/t.life,r=1-t.flicker*.5+t.flicker*(.5*Math.sin(s*61+e*2)*.5+.5*Math.random());t.light.intensity=t.hold?t.peak:n>=0&&n<1?t.peak*(1-n)**t.curve*r:0,c.uLPos.value[e].copy(t.light.position),c.uLCol.value[e].copy(t.light.color).multiplyScalar(t.light.intensity),c.uLRange.value[e]=t.light.intensity>0?t.light.distance:0}{let e=(s-o.t0)/o.life;o.light.intensity=e>=0&&e<1?o.peak*(1-e):0}let l=t.services.rendering;if(l?.setLens&&l.params?.lens){let t=this.fx.lensKick;t>.001?(this.lensBase===null&&(this.lensBase=l.params.lens.ca??0),l.setLens({ca:this.lensBase+t*.02}),this.fx.lensKick*=Math.exp(-e*2.5)):this.lensBase!==null&&(l.setLens({ca:this.lensBase}),this.lensBase=null,this.fx.lensKick=0)}let u=this.fx.shake;if(u.amp>0&&t.services.movement&&!this.fx.forceShake&&(u.amp=0),u.amp>0){u.t+=e;let n=Math.max(0,1-u.t/u.dur);if(n<=0)u.amp=0;else{let e=u.amp*n*n*.03,r=s*38,i=t.camera;i.rotateX(e*(Math.sin(r*1.13)*.7+Math.sin(r*2.71+1.3)*.3)),i.rotateY(e*(Math.sin(r*.97+2.1)*.7+Math.sin(r*2.33+.4)*.3)),i.rotateZ(e*.6*Math.sin(r*1.61+.7)),i.updateMatrixWorld()}}let d=this.prepass;if(d&&this.fx.softUntil>s)try{d.render(e),c.uDepth.value=d.rt.depthTexture,c.uSoftOn.value=1,t.renderer.getDrawingBufferSize(c.uRes.value),c.uNearFar.value.set(t.camera.near,t.camera.far)}catch(e){console.warn(`[vfx] pré-passe de profundidade falhou`,e),this.prepass=null,c.uSoftOn.value=0}else c.uSoftOn.value=0},syncLighting(e){let t=e.services.world,n=e.services.rendering,r=t?.sun,i=t?.hemi,a=this.sys.particles.uniforms,o=this.sys.vmParticles.uniforms,s=a.uSunDir.value;n?.sunDirection?s.copy(n.sunDirection):r&&s.subVectors(r.position,r.target.position).normalize(),this.fx.sunDir=s,r&&a.uSunColor.value.copy(r.color).multiplyScalar(r.intensity);let c=n?.environmentIntensity??.5;i&&(a.uAmbient.value.copy(i.color).multiplyScalar(i.intensity*.9).add(Ie.setRGB(.8,.92,1.15).multiplyScalar(c)),a.uGroundAmbient.value.copy(i.groundColor).multiplyScalar(i.intensity*.9).add(Ie.setRGB(.45,.42,.38).multiplyScalar(c))),o.uSunDir.value.copy(s),o.uSunColor.value.copy(a.uSunColor.value),o.uAmbient.value.copy(a.uAmbient.value),o.uGroundAmbient.value.copy(a.uGroundAmbient.value)}};export{ze as default};
//# sourceMappingURL=vfx-BRcAkqFj.js.map