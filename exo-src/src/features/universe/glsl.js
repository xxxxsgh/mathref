/**
 * GLSL compartilhado do universo: ruído 3D (simplex de Ashima/Gustavson,
 * domínio público/MIT), fbm, ridged, células (crateras) e utilidades.
 */
export const NOISE_GLSL = /* glsl */ `
vec3 u_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 u_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 u_perm(vec4 x) { return u_mod289(((x * 34.0) + 10.0) * x); }
vec4 u_tis(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = u_mod289(i);
  vec4 p = u_perm(u_perm(u_perm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = u_tis(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    n += a;
    p = p * 2.03 + vec3(1.7, -3.1, 2.3);
    a *= 0.5;
  }
  return s / n;
}
float ridged(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0, w = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float r = 1.0 - abs(snoise(p));
    r *= r;
    s += a * r * w;
    w = clamp(r * 1.4, 0.0, 1.0);
    n += a;
    p = p * 2.07 + vec3(-2.3, 1.1, 0.7);
    a *= 0.5;
  }
  return s / n;
}
vec3 u_hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float u_hash1(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
/** crateras: x = perfil (bacia negativa, borda positiva), y = id da célula */
vec2 craters(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float best = 8.0; vec3 bid = vec3(0.0); float bs = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 o = vec3(float(i), float(j), float(k));
    vec3 h = u_hash3(ip + o);
    vec3 r = o + h - fp;
    float d = dot(r, r);
    if (d < best) { best = d; bid = ip + o; bs = h.x; }
  }
  float d = sqrt(best) / (0.25 + 0.3 * bs);
  float bowl = smoothstep(1.0, 0.0, d);
  float rim = smoothstep(0.75, 1.0, d) * smoothstep(1.35, 1.0, d);
  float present = step(0.45, u_hash1(bid + 3.1));
  return vec2((rim * 0.6 - bowl * bowl) * present, u_hash1(bid));
}
`;

/** Espalhamento simples de bordas (atmosfera vista de fora). */
export const LIGHT_GLSL = /* glsl */ `
float u_phaseHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
vec3 u_aces(vec3 x) { return x; }
`;
