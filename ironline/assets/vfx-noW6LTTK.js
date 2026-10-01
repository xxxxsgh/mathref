import{A as e,B as t,Dt as n,Et as r,F as i,G as a,H as o,K as s,M as c,Tt as l,U as u,V as d,W as f,X as p,Y as m,b as h,dt as g,et as _,ht as v,k as y,kt as b,lt as x,m as S,ot as C,rt as w,st as ee,ut as te,yt as T,z as ne}from"./three-B6FLhzCG.js";var E={SMOKE:[0,1,2],BILLOW:[3,4,5],DUST:6,BLOOD:7,STAR:[8,9],PETAL:[10,11],GLOW:12,SPARK:13,RING:14,CHIP:15},D={concrete:[0,1],brick:[2],asphalt:[3],metal:[4,5],wood:[6,7],glass:[8,9],dirt:[10],plastic:[11],rubber:[11],blood:[12,13],scorch:[14],bloodSpray:[15]},re=`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,O=`
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
`,ie=`
precision highp float;
in vec2 vUv;
out vec4 outColor;
${O}
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
}`,ae=`
precision highp float;
in vec2 vUv;
uniform int uOut;
out vec4 outColor;
${O}
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
}`;function k(e,t,n,r={}){let o=new b(n,n,{type:l,format:te,generateMipmaps:!0,minFilter:a,magFilter:f,depthBuffer:!1});o.texture.colorSpace=``;let s=new g({glslVersion:i,vertexShader:`precision highp float;\nin vec3 position;\n${re}`,fragmentShader:t,uniforms:r,depthTest:!1,depthWrite:!1}),u=new S;u.setAttribute(`position`,new c([-1,-1,0,3,-1,0,-1,3,0],3));let d=new p(u,s);d.frustumCulled=!1;let m=new w(-1,1,1,-1,0,1),h=e.getRenderTarget(),_=e.xr.enabled;return e.xr.enabled=!1,e.setRenderTarget(o),e.render(d,m),e.setRenderTarget(h),e.xr.enabled=_,u.dispose(),s.dispose(),o}function oe(e,{particleSize:t=2048,decalSize:n=1024,anisotropy:r=4}={}){let i=k(e,ie,t),a=k(e,ae,n,{uOut:{value:0}}),o=k(e,ae,n,{uOut:{value:1}});for(let e of[a,o])e.texture.anisotropy=r;return{particles:i.texture,decalAlbedo:a.texture,decalNormal:o.texture,targets:[i,a,o]}}var se=`
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aTime;   // t0, vida, arrasto k, gravidade (×9.8, negativo = empuxo)
attribute vec4 aSize;   // tamanho inicial, final, rotação, vel. angular
attribute vec4 aColor;  // rgb linear, alpha
attribute vec4 aMisc;   // tile, modo, iluminação do sol (0..1), aditivo
attribute vec4 aFx;     // emissão, expoente de decaimento do calor, fade-in, esticamento
attribute vec4 aPlane;  // plano suave: normal.xyz, d

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
    W = P + (axX * c.x + axY * c.y) * size;
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
    W = P + (axX * c.x + axY * c.y) * size;
  }
  vec3 axZ = normalize(cross(axX, axY));
  if (dot(axZ, toCam) < 0.0) axZ = -axZ;
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
}`,ce=`
uniform sampler2D uAtlas;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uGroundAmbient;
uniform float uNearFade;
uniform float uFireIntensity;

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

vec3 blackbody(float t) {
  // rampa artística: brasa vermelho-escura → laranja → amarelo → branco-quente
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.28, 0.03), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.8, t));
  return mix(c, vec3(1.0, 0.9, 0.7), smoothstep(0.85, 1.0, t)) * (0.08 + 2.2 * t * t);
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
  // perto da câmera
  fade *= clamp((vViewDist - uNearFade) / max(uNearFade * 3.0, 0.05), 0.0, 1.0);
  float heat = vFx.x * pow(max(1.0 - x, 0.0), vFx.y);

  if (vMisc.w > 0.5) {
    // aditivo: R = núcleo branco-quente, A = intensidade
    vec3 col = mix(vColor.rgb, vec3(1.0, 0.92, 0.8) * 1.6, clamp(tex.r, 0.0, 1.0));
    float i = tex.a * fade * vColor.a;
    gl_FragColor = vec4(col * heat * i, 0.0);
    if (gl_FragColor.r + gl_FragColor.g + gl_FragColor.b < 0.0005) discard;
    return;
  }

  float a = tex.a * vColor.a * fade;
  if (a < 0.003) discard;
  vec3 n = tex.rgb * 2.0 - 1.0;
  n.z = max(n.z, 0.05);
  float ndl = dot(n, vSunLocal);
  float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  // espalhamento frontal (sol atrás da fumaça): HG g=0.55, mais forte nas bordas finas
  float gg = 0.55;
  float hg = (1.0 - gg * gg) / pow(1.0 + gg * gg - 2.0 * gg * vScatter, 1.5) * 0.0796;
  float thin = (1.0 - tex.a) * tex.a * 2.0;
  // sunlit ≥ 10: na sombra no chão, mas ao sol acima da altura (sunlit − 10)
  float sunlit = vMisc.z >= 10.0 ? smoothstep(vMisc.z - 11.5, vMisc.z - 8.5, vWorld.y) : vMisc.z;
  // céu de cima, chão por baixo, miolo denso mais escuro (auto-sombra), bordas finas mais claras
  vec3 amb = mix(uGroundAmbient, uAmbient, n.y * 0.5 + 0.5) * (0.62 + 0.38 * n.z);
  vec3 albedo = vColor.rgb;
  vec3 lit = albedo * (amb + uSunColor * sunlit * (wrap * 0.3183 + hg * thin * 0.5));
  // fogo: emissão por densidade × calor
  // calor maior no miolo denso e virado para a câmera; bordas esfriam primeiro
  float core = tex.a * (0.55 + 0.45 * n.z);
  vec3 emit = heat > 0.0 ? blackbody(min(heat, 1.0) * (0.15 + 0.85 * core * core)) * uFireIntensity * min(heat, 1.5) * smoothstep(0.08, 0.35, heat) : vec3(0.0);
  gl_FragColor = vec4((lit + emit) * a, a * (1.0 - min(heat, 1.0) * 0.35));
}`,A=new h,le=class{constructor({capacity:e=4096,atlas:r,name:i=`vfx-particles`,nearFade:a=.25,clock:o=null}){this.capacity=e,this.clock=o;let s=new C(1,1),c=new d;c.index=s.index,c.setAttribute(`position`,s.getAttribute(`position`)),c.instanceCount=e;let l=n=>{let r=new t(new Float32Array(e*n),n);return r.setUsage(y),r};this.attr={aPos:l(3),aVel:l(3),aTime:l(4),aSize:l(4),aColor:l(4),aMisc:l(4),aFx:l(4),aPlane:l(4)};let u=this.attr.aTime.array;for(let t=0;t<e;t++)u[t*4]=-1e6,u[t*4+1]=1;for(let[e,t]of Object.entries(this.attr))c.setAttribute(e,t);c.boundingSphere=new T(new n,1e7),this.uniforms={uAtlas:{value:r},uTime:{value:0},uWind:{value:new n(.35,.05,.15)},uSunDir:{value:new n(.4,.8,.3).normalize()},uSunColor:{value:new h(3,2.9,2.7)},uAmbient:{value:new h(.35,.4,.48)},uGroundAmbient:{value:new h(.2,.18,.16)},uNearFade:{value:a},uFireIntensity:{value:1.9}},this.material=new v({name:i,vertexShader:se,fragmentShader:ce,uniforms:this.uniforms,transparent:!0,depthWrite:!1,depthTest:!0,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205,side:2}),this.mesh=new p(c,this.material),this.mesh.name=i,this.mesh.frustumCulled=!1,this.mesh.renderOrder=10,this.mesh.userData.noSkyOcclusion=!0,this.head=0,this.dirtyMin=1/0,this.dirtyMax=-1,this.dirtyAll=!1,this.now=0}emit(e,t,n){let r=this.head;this.head=(this.head+1)%this.capacity,this.head===0&&(this.dirtyAll=!0);let i=this.attr,a=r*3;i.aPos.array[a]=e.x,i.aPos.array[a+1]=e.y,i.aPos.array[a+2]=e.z,i.aVel.array[a]=t?t.x:0,i.aVel.array[a+1]=t?t.y:0,i.aVel.array[a+2]=t?t.z:0,a=r*4;let o=i.aTime.array;o[a]=(this.clock?this.clock():this.now)+(n.delay||0),o[a+1]=n.life??1,o[a+2]=n.drag??0,o[a+3]=n.gravity??0;let c=i.aSize.array;c[a]=n.size??.1,c[a+1]=n.size1??n.size??.1,c[a+2]=n.rot??0,c[a+3]=n.spin??0;let l=i.aColor.array;n.color&&n.color.isColor?A.copy(n.color):A.setHex(n.color??16777215,s),l[a]=A.r,l[a+1]=A.g,l[a+2]=A.b,l[a+3]=n.alpha??1;let u=i.aMisc.array;u[a]=n.tile??0,u[a+1]=n.mode??0,u[a+2]=n.sunlit??1,u[a+3]=+!!n.additive;let d=i.aFx.array;d[a]=n.emissive??+!!n.additive,d[a+1]=n.heatPow??0,d[a+2]=n.fadeIn??0,d[a+3]=n.stretch??0;let f=i.aPlane.array;return n.plane?(f[a]=n.plane[0],f[a+1]=n.plane[1],f[a+2]=n.plane[2],f[a+3]=n.plane[3]):(f[a]=0,f[a+1]=0,f[a+2]=0,f[a+3]=0),r<this.dirtyMin&&(this.dirtyMin=r),r>this.dirtyMax&&(this.dirtyMax=r),r}kill(e){this.attr.aTime.array[e*4]=-1e6,e<this.dirtyMin&&(this.dirtyMin=e),e>this.dirtyMax&&(this.dirtyMax=e)}flush(e){if(this.now=e,this.uniforms.uTime.value=e,!(this.dirtyMax<0&&!this.dirtyAll)){for(let e of Object.values(this.attr))e.clearUpdateRanges(),this.dirtyAll||e.addUpdateRange(this.dirtyMin*e.itemSize,(this.dirtyMax-this.dirtyMin+1)*e.itemSize),e.needsUpdate=!0;this.dirtyMin=1/0,this.dirtyMax=-1,this.dirtyAll=!1}}clear(){let e=this.attr.aTime.array;for(let t=0;t<this.capacity;t++)e[t*4]=-1e6;this.dirtyAll=!0}},j=new m,M=new n,N=new n,P=new n,F=new n,ue=class{constructor({capacity:e=384,albedo:i,normal:a,rng:s,surface:c=null}){this.capacity=e,this.surface=c,this._hit={point:new n,normal:new n,distance:0},this.rng=s;let l=new C(1,1);this.aDecal=new t(new Float32Array(e*4),4),this.aDecal.setUsage(y),l.setAttribute(`aDecal`,this.aDecal);let u=new _({map:i,normalMap:a,normalScale:new r(1.6,1.6),roughness:.85,metalness:0,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-4,envMapIntensity:.8});u.name=`vfx-decals`,u.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
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
 roughnessFactor = vDecal.z;`)},u.customProgramCacheKey=()=>`vfx-decals`,this.mesh=new o(l,u,e),this.mesh.name=`vfx-decals`,this.mesh.frustumCulled=!1,this.mesh.receiveShadow=!0,this.mesh.castShadow=!1,this.mesh.renderOrder=2,this.mesh.count=0,this.mesh.userData.noSkyOcclusion=!0,this.head=0,this.fading=[]}add(e,t,n,r,i=null,{roughness:a=null,alpha:o=1}={}){let s=D[n]||D.concrete,c=this.rng,l=s[c.next()*s.length|0];if(P.copy(t).normalize(),this.surface){M.copy(i||P).normalize(),i||M.negate(),F.copy(e).addScaledVector(M,-.35);let t=this.surface.raycast(F,M,.7,this._hit);t&&t.normal.dot(P)>.5&&(e=t.point,P.copy(t.normal))}let u=1;if(i){let e=Math.abs(P.dot(i));M.copy(i).addScaledVector(P,-P.dot(i)),M.lengthSq()>1e-6&&e<.85?(M.normalize(),u=Math.min(2.2,1/Math.max(e,.45))):M.set(0,0,0)}else M.set(0,0,0);if(M.lengthSq()<.5){M.set(1,0,0),Math.abs(P.x)>.9&&M.set(0,1,0),M.addScaledVector(P,-P.dot(M)).normalize();let e=c.next()*Math.PI*2;N.crossVectors(P,M),M.multiplyScalar(Math.cos(e)).addScaledVector(N,Math.sin(e)).normalize()}N.crossVectors(P,M).normalize();let d=r*(.85+c.next()*.3);n===`wood`&&Math.abs(P.y)<.7&&(N.set(0,1,0).addScaledVector(P,-P.y).normalize(),M.crossVectors(N,P).normalize(),u=1),F.copy(e).addScaledVector(P,.004),j.makeBasis(M.multiplyScalar(d*u),N.multiplyScalar(d),P),j.setPosition(F);let f=this.head;this.head=(this.head+1)%this.capacity,this.mesh.setMatrixAt(f,j),this.mesh.instanceMatrix.needsUpdate=!0;let p=a??(n===`blood`||n===`bloodSpray`?.25:n===`glass`?.15:n===`metal`?.45:.9),m=this.aDecal.array;m[f*4]=l,m[f*4+1]=0,m[f*4+2]=p,m[f*4+3]=0,this.aDecal.needsUpdate=!0,this.mesh.count=Math.max(this.mesh.count,f+1),this.fading.push({i:f,a:0,target:o})}update(e){if(!this.fading.length)return;let t=this.aDecal.array;for(let n=this.fading.length-1;n>=0;n--){let r=this.fading[n];r.a=Math.min(r.target,r.a+e*30),t[r.i*4+1]=r.a,r.a>=r.target&&this.fading.splice(n,1)}this.aDecal.needsUpdate=!0}},I=new x,de=new n,fe=new n,L=new m,pe=new n(0,1,0),me=new h,he=class{constructor(e,t,{capacity:r=64,collision:i,restitution:a=.35,friction:s=.55,lieDown:c=!0,onBounce:l=null,name:u=`vfx-rigid`,castShadow:d=!0,useColor:f=!1}){if(this.capacity=r,this.collision=i,this.restitution=a,this.friction=s,this.lieDown=c,this.onBounce=l,this.mesh=new o(e,t,r),this.mesh.name=u,this.mesh.frustumCulled=!1,this.mesh.castShadow=d,this.mesh.receiveShadow=!0,this.mesh.instanceMatrix.setUsage(y),this.mesh.count=0,f)for(let e=0;e<r;e++)this.mesh.setColorAt(e,me.setRGB(1,1,1));this.bodies=Array.from({length:r},()=>({alive:!1,pos:new n,vel:new n,quat:new x,spin:new n,scale:new n(1,1,1),life:0,age:0,ground:-1e9,groundTimer:0,bounces:0,resting:!1,halfH:.01,drag:.05,lieAxis:new n})),this.head=0,this.active=0}spawn(t,n,{spin:r=null,scale:i=1,life:a=5,color:o=null,drag:s=.05,halfH:c=.01,quat:l=null}){let u=this.head;this.head=(this.head+1)%this.capacity;let d=this.bodies[u];return d.alive=!0,d.pos.copy(t),d.vel.copy(n),l?d.quat.copy(l):d.quat.setFromEuler(new e(Math.random()*6.3,Math.random()*6.3,Math.random()*6.3)),r?d.spin.copy(r):d.spin.set((Math.random()-.5)*30,(Math.random()-.5)*30,(Math.random()-.5)*30),typeof i==`number`?d.scale.setScalar(i):d.scale.copy(i),d.life=a,d.age=0,d.drag=s,d.halfH=c,d.bounces=0,d.resting=!1,d.groundTimer=0,d.ground=this.groundAt(t),d.lieAxis.set(Math.random()-.5,0,Math.random()-.5).normalize(),o&&(this.mesh.setColorAt(u,o.isColor?o:me.set(o)),this.mesh.instanceColor.needsUpdate=!0),this.mesh.count=Math.max(this.mesh.count,u+1),d}groundAt(e){return this.collision?.groundHeight(e.x,e.z,e.y+.05,60)??-1e9}update(e){let t=!1;for(let n=0;n<this.mesh.count;n++){let r=this.bodies[n];if(!r.alive)continue;if(t=!0,r.age+=e,r.age>=r.life){r.alive=!1,L.makeScale(0,0,0),this.mesh.setMatrixAt(n,L);continue}if(!r.resting){r.vel.y-=9.8*e,r.vel.multiplyScalar(Math.max(0,1-r.drag*e)),r.pos.addScaledVector(r.vel,e);let t=r.spin.length();t>1e-4&&(I.setFromAxisAngle(de.copy(r.spin).divideScalar(t),t*e),r.quat.premultiply(I)),(r.groundTimer-=e)<=0&&(r.groundTimer=.1,r.ground=this.groundAt(r.pos));let n=r.ground+r.halfH;if(r.pos.y<n&&r.vel.y<0){r.pos.y=n;let e=-r.vel.y;r.vel.y=e*this.restitution,r.vel.x*=this.friction,r.vel.z*=this.friction,r.spin.multiplyScalar(.5).add(de.set((Math.random()-.5)*8,(Math.random()-.5)*8,(Math.random()-.5)*8).multiplyScalar(Math.min(1,e*.3))),r.bounces++,e>.6&&this.onBounce?.(r,e),(e<.8||r.bounces>4)&&(r.resting=!0,r.vel.set(0,0,0),this.lieDown&&(I.setFromUnitVectors(pe,r.lieAxis),r.quat.copy(I)))}}let i=Math.min(1,(r.life-r.age)/.4);fe.copy(r.scale).multiplyScalar(i),L.compose(r.pos,r.quat,fe),this.mesh.setMatrixAt(n,L)}t&&(this.mesh.instanceMatrix.needsUpdate=!0)}};function ge(){let e=new u([[0,-.0225],[.0047,-.0225],[.0048,-.0215],[.0042,-.0205],[.0047,-.0195],[.0047,.009],[.0043,.0125],[.0033,.0145],[.0032,.0225],[.0027,.0225],[.0027,.015]].map(([e,t])=>new r(e,t)),12);return e.computeVertexNormals(),e}function _e(){let e=new ne(.5,0).toNonIndexed(),t=e.getAttribute(`position`);for(let e=0;e<t.count;e++){let n=t.getX(e),r=t.getY(e),i=t.getZ(e),a=Math.sin(n*12.9898+r*78.233+i*37.719)*43758.5453,o=.7+.45*(a-Math.floor(a));t.setXYZ(e,n*o,r*o*.75,i*o)}return e.computeVertexNormals(),e}var R=(e,t,n)=>new h(e,t,n),z={concrete:{dust:R(.46,.44,.4),chip:R(.3,.29,.27),decal:`concrete`,size:.2,dustAmt:1,chunks:4,sparks:2,chipCount:10},brick:{dust:R(.44,.27,.19),chip:R(.3,.1,.06),decal:`brick`,size:.2,dustAmt:1,chunks:4,sparks:1,chipCount:10},asphalt:{dust:R(.3,.29,.27),chip:R(.06,.06,.06),decal:`asphalt`,size:.16,dustAmt:.8,chunks:3,sparks:3,chipCount:9},metal:{dust:R(.22,.22,.22),chip:R(.3,.3,.3),decal:`metal`,size:.13,dustAmt:.25,chunks:0,sparks:18,chipCount:0},wood:{dust:R(.42,.32,.2),chip:R(.5,.36,.2),decal:`wood`,size:.18,dustAmt:.6,chunks:5,sparks:0,chipCount:8,splinter:!0},dirt:{dust:R(.3,.23,.16),chip:R(.07,.05,.035),decal:`dirt`,size:.24,dustAmt:1.3,chunks:2,sparks:0,chipCount:16,plume:!0},glass:{dust:R(.6,.62,.64),chip:R(.75,.82,.85),decal:`glass`,size:.3,dustAmt:.35,chunks:6,sparks:0,chipCount:6,glints:!0},plastic:{dust:R(.4,.4,.4),chip:R(.5,.5,.5),decal:`plastic`,size:.12,dustAmt:.3,chunks:2,sparks:0,chipCount:4},rubber:{dust:R(.15,.15,.15),chip:R(.05,.05,.05),decal:`rubber`,size:.12,dustAmt:.3,chunks:0,sparks:0,chipCount:4},flesh:{blood:!0}};z.default=z.concrete;var B={wood:.45,plastic:.35,rubber:.3,glass:.08,dirt:0,metal:.03,concrete:.1,brick:.1,asphalt:0,flesh:.9},ve=new n,V=new n,H=new n,ye=new n,U=new n,be=new n,W=new n(0,1,0),G=new h,xe=class{constructor(e,t){this.ctx=e,this.ps=t.particles,this.vps=t.vmParticles,this.decals=t.decals,this.brass=t.brass,this.debris=t.debris,this.lights=t.lights,this.vmLight=t.vmLight,this.rng=e.rng.fork?e.rng.fork(32586):e.rng,this.budget=e.quality.particleBudget??1,this.shake={amp:0,t:0},this.heldFlash=[]}R(e,t){return e+(t-e)*this.rng.next()}n(e){let t=e*this.budget;return Math.floor(t)+ +(this.rng.next()<t-Math.floor(t))}cone(e,t,n=ve){let r=this.rng.next(),i=this.rng.next(),a=1-r*(1-Math.cos(t)),o=Math.sqrt(1-a*a),s=i*Math.PI*2;return U.set(1,0,0),Math.abs(e.x)>.9&&U.set(0,1,0),U.addScaledVector(e,-e.dot(U)).normalize(),be.crossVectors(e,U),n.copy(e).multiplyScalar(a).addScaledVector(U,Math.cos(s)*o).addScaledVector(be,Math.sin(s)*o)}envAt(e,t=W){let n=this.ctx.collision,r=this.sunDir;H.copy(e).addScaledVector(t,.08);let i=1,a=1;return n&&r&&(n.raycast(H,r,120,{filter:e=>!e.dynamic})&&(i=0),n.raycast(H,W,40,{filter:e=>!e.dynamic})&&(a=.6)),{sun:i,sky:a}}plane(e,t){return[t.x,t.y,t.z,t.x*e.x+t.y*e.y+t.z*e.z]}flashLight(e,t,n,r,i=10){let a=this.ctx.time.now,o=this.lights[0],s=1/0;for(let e of this.lights){let t=(a-e.t0)/e.life,n=t>=1?-1:e.peak*(1-t)*(1-t);n<s&&(s=n,o=e)}return o.light.position.copy(e),o.light.color.copy(t),o.light.distance=i,o.t0=a,o.life=r,o.peak=n,o.hold=!1,o}addShake(e,t=.5){let n=this.shake,r=n.dur?Math.max(0,1-n.t/n.dur):0;n.amp=Math.min(1.5,n.amp*r+e),n.t=0,n.dur=t}impact(e,t,n=`concrete`,r={}){let i=z[n]||z.default,a=this.ps,o=ye.copy(t).normalize().clone(),s=r.dir?r.dir.clone().normalize():o.clone().negate(),c=r.scale??1;if(i.blood)return this.blood(e,o,s,r);let l=this.envAt(e,o),u=l.sun,d=l.sky,f=this.plane(e,o),p=s.clone().addScaledVector(o,-2*s.dot(o)).normalize(),m=r.exit?s.clone():o.clone().lerp(p,.35).normalize(),h=G.copy(i.dust).multiplyScalar(d).clone();n!==`dirt`&&(a.emit(e.clone().addScaledVector(o,.03),null,{life:.05,size:.12*c,size1:.2*c,tile:E.GLOW,additive:!0,emissive:n===`metal`?9:2.5,color:R(1,.55,.2),rot:this.R(0,6.3)}),n===`metal`&&a.emit(e.clone().addScaledVector(o,.02),null,{life:.045,size:.3*c,tile:E.STAR[0],additive:!0,emissive:6,color:R(1,.6,.25),rot:this.R(0,6.3)}));let g=this.n(2*i.dustAmt)+1;for(let t=0;t<g;t++){let t=this.cone(m,.25).multiplyScalar(this.R(7,12)*c);a.emit(e.clone().addScaledVector(o,.03),t,{life:this.R(.3,.45),drag:9,gravity:0,size:.07*c,size1:this.R(.25,.4)*c,mode:1,stretch:.05,color:h,alpha:.85,tile:E.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f})}let _=this.n(4*i.dustAmt)+1;for(let t=0;t<_;t++){let t=this.cone(m,.5).multiplyScalar(this.R(1.5,4.5)*c);a.emit(e.clone().addScaledVector(o,.05),t,{life:this.R(.7,1.2),drag:5,gravity:-.02,size:.18*c,size1:this.R(.6,.9)*c,rot:this.R(0,6.3),spin:this.R(-1.2,1.2),color:h,alpha:.85,tile:E.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f,fadeIn:.03})}let v=this.n(3*i.dustAmt);for(let t=0;t<v;t++){let t=this.cone(o,.9).multiplyScalar(this.R(.4,1.2)*c);a.emit(e.clone().addScaledVector(o,.15),t,{life:this.R(2,3.2),drag:1.6,gravity:-.015,size:.2*c,size1:this.R(1.1,1.7)*c,rot:this.R(0,6.3),spin:this.R(-.4,.4),color:h,alpha:.3,tile:E.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f,fadeIn:.1})}if(i.dustAmt>.5){let t=this.n(3);for(let n=0;n<t;n++){let t=this.cone(m,.6).multiplyScalar(this.R(3,7)*c);a.emit(e.clone(),t,{life:this.R(.35,.6),drag:5,gravity:.1,size:.08*c,size1:.25*c,mode:1,stretch:.05,color:h,alpha:.55,tile:E.DUST,sunlit:u,plane:f})}}let y=this.n(i.chipCount*c);for(let t=0;t<y;t++){let t=this.cone(m,.7).multiplyScalar(this.R(2.5,9));a.emit(e.clone().addScaledVector(o,.02),t,{life:this.R(.4,.9),drag:.6,gravity:1,size:this.R(.012,.03),mode:1,stretch:.006,color:G.copy(i.chip).multiplyScalar(d*this.R(.6,1.2)).clone(),alpha:1,tile:E.CHIP,sunlit:u})}if(i.plume){let t=this.n(6)+2;for(let n=0;n<t;n++){let t=this.cone(V.copy(o).lerp(W,.5).normalize(),.3).multiplyScalar(this.R(3,7.5)*c);a.emit(e.clone(),t,{life:this.R(.8,1.4),drag:2.2,gravity:.35,size:.08*c,size1:this.R(.4,.7)*c,mode:1,stretch:.04,rot:this.R(0,6.3),color:G.copy(i.dust).multiplyScalar(d*this.R(.6,1)).clone(),alpha:.85,tile:E.SMOKE[this.rng.next()*3|0],sunlit:u,plane:f})}}let b=this.n(i.sparks*c);for(let t=0;t<b;t++){let t=this.cone(p.clone().lerp(o,.4).normalize(),n===`metal`?.8:.5).multiplyScalar(this.R(4,13));a.emit(e.clone().addScaledVector(o,.01),t,{life:this.R(.15,n===`metal`?.6:.25),drag:1.8,gravity:1.2,size:this.R(.008,.016),mode:1,stretch:.03,tile:E.SPARK,additive:!0,emissive:this.R(10,22),heatPow:1.4,color:R(1,.42,.1)})}if(i.glints)for(let t=0,n=this.n(10);t<n;t++){let t=this.cone(m,.9).multiplyScalar(this.R(1.5,5));a.emit(e.clone(),t,{life:this.R(.3,.8),drag:.8,gravity:1,size:this.R(.02,.04),tile:E.GLOW,additive:!0,emissive:this.R(2,5),heatPow:2,color:R(.8,.9,1)})}let x=this.n(i.chunks*c);for(let t=0;t<x;t++){let t=this.cone(m,.75).multiplyScalar(this.R(1.5,4.5)),n=this.R(.012,.035)*c;this.debris.spawn(e.clone().addScaledVector(o,.03),t,{scale:i.splinter?V.set(n*.35,n*.35,n*2.6).clone():n,life:this.R(2.5,5),drag:.3,halfH:n*.35,color:G.copy(i.chip).multiplyScalar(this.R(.7,1.3)).clone()})}r.decal!==!1&&!r.collider?.dynamic&&this.decals.add(e,o,i.decal,i.size*(r.exit?1.3:1)*(r.decalScale??1),s)}blood(e,t,n,r={}){let i=this.ps,a=this.envAt(e,W),o=a.sun,s=a.sky,c=R(.2,.006,.004).multiplyScalar(s),l=t.clone();for(let t=0,n=this.n(3)+1;t<n;t++){let t=this.cone(l,.6).multiplyScalar(this.R(.8,2.5));i.emit(e.clone(),t,{life:this.R(.3,.55),drag:6,gravity:.05,size:.06,size1:this.R(.35,.55),rot:this.R(0,6.3),color:c,alpha:.95,tile:E.BLOOD,sunlit:o,fadeIn:.03})}for(let t=0,r=this.n(4)+1;t<r;t++){let t=this.cone(n,.35).multiplyScalar(this.R(2,5));i.emit(e.clone().addScaledVector(n,.3),t,{life:this.R(.35,.7),drag:5,gravity:.2,size:.08,size1:this.R(.45,.8),rot:this.R(0,6.3),color:c,alpha:.85,tile:E.BLOOD,sunlit:o}),i.emit(e.clone().addScaledVector(n,.3),t.clone().multiplyScalar(.6),{life:this.R(.5,1),drag:2,gravity:.1,size:.12,size1:this.R(.6,1),rot:this.R(0,6.3),color:R(.12,.01,.008).multiplyScalar(s),alpha:.3,tile:E.SMOKE[this.rng.next()*3|0],sunlit:o})}for(let t=0,r=this.n(14);t<r;t++){let r=this.cone(t%2?n:l,.7).multiplyScalar(this.R(1.5,5));i.emit(e.clone(),r,{life:this.R(.4,.8),drag:.8,gravity:1,size:this.R(.01,.022),mode:1,stretch:.012,color:R(.14,.004,.003).multiplyScalar(s),tile:E.CHIP,sunlit:o})}let u=this.ctx.collision;if(u&&r.decal!==!1){let t=u.raycast(e.clone().addScaledVector(n,.4),n,3,{filter:e=>!e.dynamic&&e.material!==`flesh`});t&&this.decals.add(t.point,t.normal,`bloodSpray`,this.R(.5,.85)*(1-t.distance/4),n)}}muzzleFlashVm(e,t,r,i=0){let a=this.vps;e.updateWorldMatrix(!0,!1);let o=new n().setFromMatrixPosition(e.matrixWorld),s=new n(0,0,-1).transformDirection(e.matrixWorld),c=1-.45*i,l=R(1,.5,.16),u=E.STAR[this.rng.next()*2|0];a.emit(o.clone().addScaledVector(s,.035*c),null,{life:.05,size:this.R(.13,.18)*c,tile:u,additive:!0,emissive:9,color:l,rot:this.R(0,6.3)}),a.emit(o.clone().addScaledVector(s,.02),null,{life:.06,size:.26*c,tile:E.GLOW,additive:!0,emissive:.9,color:R(1,.45,.15)});let d=3+(this.rng.next()*2|0),f=this.R(0,6.3);for(let t=0;t<d;t++){let n=f+t/d*Math.PI*2;U.set(Math.cos(n),Math.sin(n),0).transformDirection(e.matrixWorld);let r=s.clone().multiplyScalar(.8).addScaledVector(U,this.R(.45,.8)).normalize();a.emit(o.clone().addScaledVector(s,.005),r,{life:.045,size:this.R(.045,.06)*c,mode:3,stretch:this.R(2.8,4),tile:E.PETAL[t&1],additive:!0,emissive:6,color:l})}a.emit(o.clone(),s,{life:.045,size:.07*c,mode:3,stretch:this.R(3,4.5),tile:E.PETAL[this.rng.next()*2|0],additive:!0,emissive:3.5,color:l}),this.vmLight&&(this.vmLight.light.position.copy(o).addScaledVector(s,.05),this.vmLight.t0=this.ctx.time.now,this.vmLight.life=.07,this.vmLight.peak=1.2),t&&(this.flashLight(t.clone().addScaledVector(r,.3),R(1,.6,.3),30,.07,9),this.muzzleWorld(t,r,1,i))}muzzleWorld(e,t,n=1,r=0){let i=this.ps,a=this.envAt(e);for(let o=0,s=this.n(2);o<s;o++){let o=this.cone(t,.35).multiplyScalar(this.R(1.2,3)).addScaledVector(W,.3);i.emit(e.clone().addScaledVector(t,.15),o,{life:this.R(.7,1.3),drag:3,gravity:-.03,size:.04*n,size1:this.R(.3,.5)*n,rot:this.R(0,6.3),spin:this.R(-1,1),color:R(.5,.5,.5).multiplyScalar(a.sky),alpha:.16-.08*r,tile:E.SMOKE[this.rng.next()*3|0],sunlit:a.sun,fadeIn:.1})}for(let r=0,a=this.n(3);r<a;r++){let r=this.cone(t,.25).multiplyScalar(this.R(8,18));i.emit(e.clone(),r,{life:this.R(.05,.12),drag:2,gravity:.5,size:.008*n,mode:1,stretch:.012,tile:E.SPARK,additive:!0,emissive:14,heatPow:1,color:R(1,.5,.15)})}}muzzleFlashWorld(e,t,{hold:r=!1}={}){let i=this.ps,a=r?30:.05,o=R(1,.5,.17),s=[];if(r){for(let e of this.heldFlash)i.kill(e);this.heldFlash.length=0}s.push(i.emit(e.clone().addScaledVector(t,.08),null,{life:a,size:this.R(.45,.6),tile:E.STAR[this.rng.next()*2|0],additive:!0,emissive:9,color:o,rot:this.R(0,6.3)})),s.push(i.emit(e.clone().addScaledVector(t,.1),null,{life:a*1.2,size:1.5,tile:E.GLOW,additive:!0,emissive:1.5,color:R(1,.45,.15)}));let c=this.R(0,6.3),l=new n().crossVectors(t,W);l.lengthSq()<1e-6&&l.set(1,0,0),l.normalize();let u=new n().crossVectors(l,t).normalize();for(let n=0;n<4;n++){let r=c+n/4*Math.PI*2,d=t.clone().multiplyScalar(.85).addScaledVector(l,Math.cos(r)*this.R(.4,.7)).addScaledVector(u,Math.sin(r)*this.R(.4,.7)).normalize();s.push(i.emit(e.clone(),d,{life:a,size:this.R(.13,.18),mode:3,stretch:this.R(2.6,3.6),tile:E.PETAL[n&1],additive:!0,emissive:7,color:o}))}s.push(i.emit(e.clone(),t.clone(),{life:a,size:.18,mode:3,stretch:4,tile:E.PETAL[0],additive:!0,emissive:6,color:o})),r&&this.heldFlash.push(...s);let d=this.flashLight(e.clone().addScaledVector(t,.3),R(1,.58,.28),25,r?30:.06,10);r&&(d.hold=!0),this.muzzleWorld(e,t,1.6)}tracer(e,t,{speed:n=420,length:r=4,width:i=.025,emissive:a=14,color:o=R(1,.55,.22)}={}){let s=ve.subVectors(t,e),c=s.length();c<.5||(s.divideScalar(c),this.ps.emit(e.clone(),s.clone().multiplyScalar(n),{life:c/n,size:i,mode:2,stretch:Math.min(r,c),tile:E.SPARK,additive:!0,emissive:a,color:o}))}eject(e,t,r,i=!0){let a=new n(this.R(-25,25),this.R(-40,40),this.R(15,35)),o=new x().setFromAxisAngle(new n(0,0,1),Math.PI/2+this.R(-.3,.3));r&&o.premultiply(r),this.brass.spawn(e,t,{spin:a,life:6,drag:.4,halfH:.0048,quat:o}),i&&this.ps.emit(e.clone(),t.clone().multiplyScalar(.25),{life:this.R(.4,.7),drag:4,gravity:-.04,size:.03,size1:.18,rot:this.R(0,6.3),color:R(.5,.5,.5),alpha:.12,tile:E.SMOKE[this.rng.next()*3|0],fadeIn:.1})}barrelWisp(e,t){let r=new n(this.R(-.05,.05),this.R(.25,.5),this.R(-.05,.05));this.ps.emit(e.clone(),r,{life:this.R(1,1.6),drag:.6,gravity:-.04,size:.03,size1:this.R(.18,.3),rot:this.R(0,6.3),spin:this.R(-.8,.8),color:R(.55,.55,.56),alpha:.1*t,tile:E.DUST,fadeIn:.15})}explosion(e,{radius:t=6,normal:n=W}={}){let r=this.ps,i=this.ctx,a=n.clone().normalize(),o=this.envAt(e,a),s=this.plane(e,a),c=t/6;if(!o.sun&&this.sunDir){for(let t=3;t<=30;t+=3)if(H.copy(e).addScaledVector(a,t),!this.ctx.collision.raycast(H,this.sunDir,120,{filter:e=>!e.dynamic})){o.sun=10+e.y+t;break}}for(let t=0,n=this.n(26)+8;t<n;t++){let t=this.cone(a,1).multiplyScalar(this.R(2,11)*c).addScaledVector(a,this.R(1,4)*c);r.emit(e.clone().addScaledVector(a,this.R(.4,1.2)*c).addScaledVector(this.cone(a,1.5,V),this.R(0,.8)*c),t,{life:this.R(1.4,2.4),drag:3.2,gravity:-.3,size:this.R(1,1.6)*c,size1:this.R(3.2,4.8)*c,rot:this.R(0,6.3),spin:this.R(-.6,.6),color:R(.09,.08,.07),alpha:1,tile:E.BILLOW[this.rng.next()*3|0],emissive:this.rng.next()<.3?this.R(.2,.5):this.R(.9,1.4),heatPow:this.R(1.3,2),sunlit:o.sun,plane:s,fadeIn:.015})}for(let t=0,n=this.n(22)+8;t<n;t++){let t=this.cone(a,.8).multiplyScalar(this.R(.5,4)*c).addScaledVector(a,this.R(.3,2.5)*c),n=this.R(.1,.2);r.emit(e.clone().addScaledVector(a,this.R(.8,2)*c),t,{life:this.R(5,10),drag:1.3,gravity:-.035,size:this.R(1.6,2.4)*c,size1:this.R(5,8)*c,rot:this.R(0,6.3),spin:this.R(-.2,.2),color:R(n,n*.96,n*.92).multiplyScalar(o.sky),alpha:.85,tile:E.BILLOW[this.rng.next()*3|0],sunlit:o.sun,plane:s,fadeIn:.08,delay:this.R(.15,.6)})}for(let t=0,n=this.n(22)+8;t<n;t++){let i=t/n*Math.PI*2+this.R(-.1,.1);U.set(Math.cos(i),0,Math.sin(i));let l=U.clone().multiplyScalar(this.R(9,16)*c).addScaledVector(a,this.R(.3,1.5));r.emit(e.clone().addScaledVector(U,.5*c).addScaledVector(a,.25),l,{life:this.R(2,3.5),drag:2.8,gravity:-.02,size:.8*c,size1:this.R(2.5,3.8)*c,rot:this.R(0,6.3),color:R(.3,.26,.21).multiplyScalar(o.sky),alpha:.42,tile:E.SMOKE[this.rng.next()*3|0],sunlit:o.sun,plane:s,fadeIn:.05})}r.emit(e.clone().addScaledVector(a,.06),null,{life:.35,size:.5,size1:t*2.6,mode:4,plane:s,tile:E.RING,additive:!0,emissive:1.4,heatPow:1.5,color:R(1,.8,.6)}),r.emit(e.clone().addScaledVector(a,1*c),null,{life:.22,size:.6,size1:t*2.2,tile:E.RING,additive:!0,emissive:.9,heatPow:1,color:R(1,.9,.8)}),r.emit(e.clone().addScaledVector(a,.8*c),null,{life:.12,size:2.5*c,size1:5*c,tile:E.GLOW,additive:!0,emissive:6,heatPow:2,color:R(1,.55,.25)}),r.emit(e.clone().addScaledVector(a,.6*c),null,{life:.08,size:2*c,size1:3.5*c,tile:E.STAR[0],additive:!0,emissive:5,heatPow:1,color:R(1,.65,.35),rot:this.R(0,6.3)});for(let t=0,n=this.n(50);t<n;t++){let t=this.cone(a,1.1).multiplyScalar(this.R(5,22)*c);r.emit(e.clone().addScaledVector(a,.3),t,{life:this.R(.8,2.6),drag:this.R(1.2,2.5),gravity:this.R(.15,.6),size:this.R(.012,.03),mode:1,stretch:.02,tile:E.SPARK,additive:!0,emissive:this.R(8,20),heatPow:1.2,color:R(1,.38,.08)})}for(let t=0,n=this.n(30);t<n;t++){let t=this.cone(a,.9).multiplyScalar(this.R(4,14)*c);r.emit(e.clone().addScaledVector(a,.2),t,{life:this.R(.8,1.8),drag:.4,gravity:1,size:this.R(.02,.06),mode:1,stretch:.01,color:R(.05,.04,.03),tile:E.CHIP,sunlit:o.sun})}for(let t=0,n=this.n(14);t<n;t++){let t=this.cone(a,.9).multiplyScalar(this.R(3,10)*c),n=this.R(.03,.09);this.debris.spawn(e.clone().addScaledVector(a,.2),t,{scale:n,life:this.R(4,8),drag:.2,halfH:n*.35,color:R(.12,.1,.08)})}this.decals.add(e,a,`scorch`,t*.75,null,{roughness:.95}),this.flashLight(e.clone().addScaledVector(a,1.5*c),R(1,.55,.25),600*c,.6,t*6);let l=i.camera.position.distanceTo(e),u=Math.max(0,1-l/(t*7));i.services.rendering?.flash?.(.22*u*u),this.addShake(1.1*u+.08,.9),i.bus.emit(`vfx:explosion`,{point:e.clone(),radius:t,intensity:u})}},K=2,q=new n,J=new n,Y=new n,X=new n,Z=new n,Se=new n,Ce=new n,we=new n,Te=class{constructor(e,{exclude:t=()=>!1}={}){this.root=e,this.exclude=t,this.built=!1,this.tris=null,this.cells=new Map,this.big=[],this.stamp=0,this.marks=null}accept(e){if(!e.isMesh||e.isInstancedMesh||e.isSkinnedMesh||!e.visible||this.exclude(e)||(Array.isArray(e.material)?e.material:[e.material]).some(e=>!e||e.transparent||e.colorWrite===!1||e.visible===!1||e.depthWrite===!1))return!1;let t=e.geometry;if(!t?.attributes?.position||(t.boundingSphere||t.computeBoundingSphere(),t.boundingSphere.radius>1500))return!1;for(let t=e.parent;t;t=t.parent)if(!t.visible)return!1;return!0}build(){this.built=!0;let e=[],t=0;this.root.updateMatrixWorld(!0),this.root.traverse(n=>{if(!this.accept(n))return;let r=n.geometry,i=r.index?r.index.count/3:r.attributes.position.count/3;e.push(n),t+=i});let n=new Float32Array(t*9),r=0;for(let t of e){let e=t.geometry,i=e.attributes.position,a=e.index,o=a?a.count/3:i.count/3,s=t.matrixWorld;for(let e=0;e<o;e++){let t=a?a.getX(e*3):e*3,o=a?a.getX(e*3+1):e*3+1,c=a?a.getX(e*3+2):e*3+2;q.fromBufferAttribute(i,t).applyMatrix4(s),J.fromBufferAttribute(i,o).applyMatrix4(s),Y.fromBufferAttribute(i,c).applyMatrix4(s);let l=r*9;n[l]=q.x,n[l+1]=q.y,n[l+2]=q.z,n[l+3]=J.x,n[l+4]=J.y,n[l+5]=J.z,n[l+6]=Y.x,n[l+7]=Y.y,n[l+8]=Y.z;let u=Math.floor(Math.min(q.x,J.x,Y.x)/K),d=Math.floor(Math.max(q.x,J.x,Y.x)/K),f=Math.floor(Math.min(q.z,J.z,Y.z)/K),p=Math.floor(Math.max(q.z,J.z,Y.z)/K);if((d-u+1)*(p-f+1)>256)this.big.push(r);else for(let e=u;e<=d;e++)for(let t=f;t<=p;t++){let n=e*73856093^t*19349663,i=this.cells.get(n);i||this.cells.set(n,i=[]),i.push(r)}r++}}this.tris=n,this.marks=new Uint32Array(r),this.count=r}raycast(e,t,r,i={point:new n,normal:new n,distance:0}){if(this.built||this.build(),!this.count)return null;let a=++this.stamp,o=e.x+t.x*r,s=e.z+t.z*r,c=Math.floor(Math.min(e.x,o)/K),l=Math.floor(Math.max(e.x,o)/K),u=Math.floor(Math.min(e.z,s)/K),d=Math.floor(Math.max(e.z,s)/K),f=r,p=!1,m=this.tris,h=n=>{if(this.marks[n]===a)return;this.marks[n]=a;let r=n*9;q.set(m[r],m[r+1],m[r+2]),X.set(m[r+3]-q.x,m[r+4]-q.y,m[r+5]-q.z),Z.set(m[r+6]-q.x,m[r+7]-q.y,m[r+8]-q.z),Se.crossVectors(t,Z);let o=X.dot(Se);if(Math.abs(o)<1e-9)return;let s=1/o;Ce.subVectors(e,q);let c=Ce.dot(Se)*s;if(c<0||c>1)return;we.crossVectors(Ce,X);let l=t.dot(we)*s;if(l<0||c+l>1)return;let u=Z.dot(we)*s;u<0||u>=f||(f=u,p=!0,i.normal.crossVectors(X,Z).normalize(),i.normal.dot(t)>0&&i.normal.negate())};for(let e=c;e<=l;e++)for(let t=u;t<=d;t++){let n=this.cells.get(e*73856093^t*19349663);if(n)for(let e=0;e<n.length;e++)h(n[e])}for(let e=0;e<this.big.length;e++)h(this.big[e]);return p?(i.distance=f,i.point.copy(e).addScaledVector(t,f),i):null}},Q=new n,Ee=new n,$=new n,De=new h,Oe=Math.PI/180;function ke(e,t,r){let i=e.box,a=1/0,o=`x`;for(let e of[`x`,`y`,`z`]){if(Math.abs(r[e])<1e-6)continue;let n=((r[e]>0?i.max[e]:i.min[e])-t[e])/r[e];n<a&&(a=n,o=e)}if(!isFinite(a))return null;let s=new n;return s[o]=Math.sign(r[o]),{point:t.clone().addScaledVector(r,Math.max(0,a)),normal:s,thickness:Math.max(0,a)}}var Ae={name:`vfx`,order:60,init(e){let{scene:t,vm:r,bus:i,collision:a,quality:o,renderer:s}=e,c=o.particleBudget??1,l=oe(s,{particleSize:o.level===`low`?1024:2048,anisotropy:Math.min(o.anisotropy||4,s.capabilities.getMaxAnisotropy?.()||4)});this.tex=l;let u=()=>e.time.now,d=new le({capacity:Math.max(1024,Math.round(6144*c)),atlas:l.particles,clock:u,nearFade:.3});t.add(d.mesh);let f=new le({capacity:256,atlas:l.particles,clock:u,nearFade:0,name:`vfx-vm-particles`});f.uniforms.uWind.value.set(0,0,0),r.scene.add(f.mesh);let p=()=>{let t=new Set((e.services.enemies?.list||[]).map(e=>e.group));return n=>{for(let r=n;r;r=r.parent)if(t.has(r)||r===e.camera||r.name?.startsWith(`vfx`))return!0;return!1}},m=new Te(t,{exclude:p()});i.on(`ready`,()=>{try{m.built||(m.exclude=p(),m.build())}catch(e){console.warn(`[vfx] índice de superfícies falhou`,e)}}),this.surface=m;let g=new ue({capacity:Math.round(320*Math.max(.5,c)),albedo:l.decalAlbedo,normal:l.decalNormal,rng:e.rng,surface:m});t.add(g.mesh);let v=new _({color:new h(.78,.5,.18),metalness:1,roughness:.27,envMapIntensity:1.2});v.name=`vfx-brass`;let y=()=>e.services.audio,b=new he(ge(),v,{capacity:48,collision:a,restitution:.38,friction:.6,name:`vfx-brass`,castShadow:!1,onBounce:(e,t)=>y()?.play?.(`brass`,{position:e.pos,volume:Math.min(1,t*.2)})});t.add(b.mesh);let x=new _({color:16777215,roughness:.92,metalness:0,flatShading:!0});x.name=`vfx-debris`;let S=new he(_e(),x,{capacity:Math.round(96*Math.max(.5,c)),collision:a,restitution:.25,friction:.5,lieDown:!1,name:`vfx-debris`,useColor:!0});t.add(S.mesh);let C=[];for(let e=0;e<2;e++){let n=new ee(16752736,0,10,2);n.name=`vfx-flash-${e}`,n.castShadow=!1,t.add(n),C.push({light:n,t0:-1e6,life:1,peak:0,hold:!1})}let w=new ee(16752736,0,.9,2);w.name=`vfx-vm-flash`,r.scene.add(w);let te={light:w,t0:-1e6,life:1,peak:0},T=new xe(e,{particles:d,vmParticles:f,decals:g,brass:b,debris:S,lights:C,vmLight:te});this.fx=T,this.sys={particles:d,vmParticles:f,decals:g,brass:b,debris:S,lights:C,vmLight:te},this.heat=0,this.lastFire=-1e6,this.wispTimer=0,this.shotCount=0,this.pendingTracer=null,this.lastMuzzleWorld=new n,this.lastAimDir=new n(0,0,-1);let ne=!!e.shot?.preset?.combat,E=(t,n)=>{let i=r.camera;i.updateMatrixWorld(),n.copy(t).applyMatrix4(i.matrixWorldInverse);let a=Math.tan(e.camera.fov*Oe*.5)/Math.tan(i.fov*Oe*.5);return n.x*=a,n.y*=a,n.applyMatrix4(e.camera.matrixWorld)};this.vmToWorld=E;let D=(t,n)=>t?(t.updateWorldMatrix(!0,!1),E(Q.setFromMatrixPosition(t.matrixWorld),n)):n.copy(e.player.eyePosition).addScaledVector(e.player.getAimDir($),.6);this.muzzleWorld=D;let re=t=>{let r=e.services.weapon,i=!!r?.brassByVfx||!r,a=r?.ejectPort,o=e.camera,s;if(a)a.updateWorldMatrix(!0,!1),s=E(Q.setFromMatrixPosition(a.matrixWorld),new n);else if(t){t.updateWorldMatrix(!0,!1);let e=Ee.set(0,0,-1).transformDirection(t.matrixWorld);Q.setFromMatrixPosition(t.matrixWorld).addScaledVector(e,-.36),Q.y+=.025,s=E(Q,new n)}else return;let c=new n(T.R(1.6,2.6),T.R(1.4,2.3),T.R(-.2,.5)).applyQuaternion(o.quaternion);i||(s.set(.5,-.3,-.12).applyMatrix4(o.matrixWorld),c.set(T.R(.8,1.4),T.R(-.2,.4),T.R(-.1,.2)).applyQuaternion(o.quaternion)),c.add(e.player.velocity||$.set(0,0,0)),T.eject(s,c,o.quaternion,i)};i.on(`weapon:fire`,t=>{let r=t.muzzle||e.services.weapon?.muzzle,i=D(r,new n),a=(t.dir?$.copy(t.dir):e.player.getAimDir($)).clone();this.lastMuzzleWorld.copy(i),this.lastAimDir.copy(a);let o=typeof t.ads==`number`?t.ads:t.ads?1:e.services.weapon?.ads||0;r&&e.vm.visible&&!t.suppressed?T.muzzleFlashVm(r,i,a,o):T.muzzleWorld(i,a,1,o),re(r),this.heat=Math.min(1,this.heat+.07),this.lastFire=e.time.now,this.shotCount++,this.pendingTracer=this.shotCount%3==1?{from:i.clone(),dir:a,to:null}:null}),i.on(`weapon:hit`,t=>{if(!t?.point)return;let n=t.material||t.collider?.material||e.services.world?.materialAt?.(t)||`concrete`,r=t.dir?t.dir.clone().normalize():null;T.impact(t.point,t.normal||Ee.set(0,1,0),n,{dir:r,collider:t.collider,exit:t.exit}),this.pendingTracer&&!this.pendingTracer.to&&!t.exit&&!(t.penetration>0)&&(this.pendingTracer.to=t.point.clone()),!t.ballistic&&r&&t.collider&&this.visualPenetration(t,n,r)}),i.on(`enemy:fire`,e=>{if(!e?.origin||!e?.dir)return;let t=a.raycast(e.origin,e.dir,150,{filter:t=>t.tag!==`enemy`&&t.owner!==e.enemy?.group}),n=t?t.point:e.origin.clone().addScaledVector(e.dir,150);T.muzzleFlashWorld(e.origin,e.dir,{hold:ne}),T.tracer(e.origin.clone().addScaledVector(e.dir,.4),n,ne?{speed:70,length:3.5}:{speed:380,length:5}),t&&T.impact(t.point,t.normal,t.collider?.material||`concrete`,{dir:e.dir,collider:t.collider,scale:.8})});let O=e=>{let t=e?.point||e?.position;t&&T.explosion(t.isVector3?t:new n(...t),{radius:e.radius??6,normal:e.normal})};i.on(`explosion`,O),i.on(`grenade:explode`,O);let ie={PENETRATION:B,fire(e,t,{range:n=800,damage:r=30,power:o=1,source:s=`player`,filter:c=null,maxSurfaces:l=4,emit:u=!0}={}){let d=[],f=e.clone(),p=t.clone().normalize(),m=n,h=r,g=o,_=new Set;for(let e=0;e<l&&m>0;e++){let t=a.raycast(f,p,m,{filter:e=>!_.has(e.id)&&e.tag!==s&&(!c||c(e))});if(!t)break;let n=t.collider?.material||`concrete`,r={...t,material:n,dir:p.clone(),damage:h*(t.part===`head`?2.5:1),source:s,ballistic:!0,penetration:e};t.collider?.data?.damage?.(r.damage,r),u&&i.emit(`weapon:hit`,r),d.push(r);let o=(B[n]??.05)*g,l=t.collider?ke(t.collider,t.point,p):null;if(!l||l.thickness>o)break;if(g-=l.thickness/Math.max(.001,B[n]??.05)*.5+.25,h*=.65,n!==`flesh`){let r={point:l.point,normal:l.normal,distance:t.distance+l.thickness,collider:t.collider,material:n,dir:p.clone(),damage:0,source:s,ballistic:!0,penetration:e,exit:!0};u&&i.emit(`weapon:hit`,r)}if(_.add(t.collider.id),m-=t.distance+l.thickness,f.copy(l.point).addScaledVector(p,.005),g<=0)break}return d}};e.provide(`vfx`,{impact:(e,t,n,r)=>T.impact(e,t,n||`concrete`,r||{}),tracer:(e,t,n)=>T.tracer(e,t,n),muzzleFlash:(t,r={})=>{if(!t)return;let i=D(t,new n);T.muzzleFlashVm(t,i,r.dir||e.player.getAimDir(new n),r.ads??0)},muzzleFlashWorld:(e,t,n)=>T.muzzleFlashWorld(e,t,n||{}),explosion:(e,t)=>T.explosion(e,t||{}),blood:(e,t,n)=>T.blood(e,t,n||t.clone().negate()),decal:(e,t,n,r,i)=>T.decals.add(e,t,n,r,i),eject:(t,n)=>T.eject(t,n,e.camera.quaternion),shake:(e,t)=>T.addShake(e,t),ballistics:ie,materials:Object.keys(z),vmToWorld:E,clear:()=>{d.clear(),f.clear()},get stats(){return{particles:d.capacity,decals:g.mesh.count,brass:b.mesh.count,debris:S.mesh.count}}})},visualPenetration(e,t,n){let r=this.fx,i=r.ctx;if(t===`flesh`)return;let a=B[t]??0;if(a<=0)return;let o=ke(e.collider,e.point,n);if(!o||o.thickness>a||o.thickness<.001)return;r.impact(o.point,o.normal,t,{dir:n,exit:!0,scale:.8,collider:e.collider});let s=i.collision.raycast(o.point.clone().addScaledVector(n,.005),n,300,{filter:t=>t.id!==e.collider.id&&t.tag!==`player`});s&&r.impact(s.point,s.normal,s.collider?.material||`concrete`,{dir:n,collider:s.collider,scale:.8})},update(e,t){let{brass:r,debris:i}=this.sys,a=this.pendingTracer;if(a){let e=a.to||a.from.clone().addScaledVector(a.dir,200);this.fx.tracer(a.from.clone().addScaledVector(a.dir,.5),e,{speed:520,length:3.5,width:.016,emissive:9}),this.pendingTracer=null}if(r.update(e),i.update(e),this.heat=Math.max(0,this.heat-e*.18),this.heat>.25&&t.time.now-this.lastFire>.25&&t.vm.visible&&(this.wispTimer-=e,this.wispTimer<=0)){this.wispTimer=.07;let e=t.services.weapon?.muzzle;e&&this.fx.barrelWisp(this.muzzleWorld(e,new n),this.heat)}},frame(e,t){let{particles:n,vmParticles:r,decals:i,lights:a,vmLight:o}=this.sys,s=t.time.now;this.syncLighting(t),n.flush(s),r.flush(s),i.update(1/60);for(let e of a){let t=(s-e.t0)/e.life;e.light.intensity=e.hold?e.peak:t>=0&&t<1?e.peak*(1-t)*(1-t)*(.85+.3*Math.random()):0}{let e=(s-o.t0)/o.life;o.light.intensity=e>=0&&e<1?o.peak*(1-e):0}let c=this.fx.shake;if(c.amp>0){c.t+=e;let n=Math.max(0,1-c.t/c.dur);if(n<=0)c.amp=0;else{let e=c.amp*n*n*.03,r=s*38,i=t.camera;i.rotateX(e*(Math.sin(r*1.13)*.7+Math.sin(r*2.71+1.3)*.3)),i.rotateY(e*(Math.sin(r*.97+2.1)*.7+Math.sin(r*2.33+.4)*.3)),i.rotateZ(e*.6*Math.sin(r*1.61+.7)),i.updateMatrixWorld()}}},syncLighting(e){let t=e.services.world,n=e.services.rendering,r=t?.sun,i=t?.hemi,a=this.sys.particles.uniforms,o=this.sys.vmParticles.uniforms,s=a.uSunDir.value;n?.sunDirection?s.copy(n.sunDirection):r&&s.subVectors(r.position,r.target.position).normalize(),this.fx.sunDir=s,r&&a.uSunColor.value.copy(r.color).multiplyScalar(r.intensity);let c=n?.environmentIntensity??.5;i&&(a.uAmbient.value.copy(i.color).multiplyScalar(i.intensity*.9).add(De.setRGB(.8,.92,1.15).multiplyScalar(c)),a.uGroundAmbient.value.copy(i.groundColor).multiplyScalar(i.intensity*.9).add(De.setRGB(.45,.42,.38).multiplyScalar(c))),o.uSunDir.value.copy(s),o.uSunColor.value.copy(a.uSunColor.value),o.uAmbient.value.copy(a.uAmbient.value),o.uGroundAmbient.value.copy(a.uGroundAmbient.value)}};export{Ae as default};
//# sourceMappingURL=vfx-noW6LTTK.js.map