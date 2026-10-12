/**
 * RUÍDOS DAS NUVENS — gerados na GPU uma vez no init (nenhum asset).
 *
 *   forma   64³ RGBA8 tileável: R = Perlin-Worley (Perlin fBm "inflado" pelo
 *           Worley), G/B/A = fBm de Worley em 3 frequências (4, 8, 16 células)
 *   detalhe 32³ RGBA8 tileável: R/G/B = fBm de Worley (2, 4, 8 células) —
 *           erosão das bordas (fiapos embaixo, couve-flor em cima)
 *   clima   cubemap 256² por face (GL spec, amostrado com a DIREÇÃO do centro
 *           do planeta — sem costura nem polo): R = cobertura, G = tipo
 *           (0 estrato … 1 cumulonimbo), B = células de tempestade,
 *           A = cirros
 *
 * As texturas 3D são escritas camada a camada (setRenderTarget(rt, z)).
 * Tudo depende só da seed (uniform uint) → determinístico.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Hash inteiro + ruídos periódicos (período em células). */
const NOISE_GLSL = /* glsl */ `
uniform uint uSeed;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 c) {
  uvec3 h = pcg3(uvec3(c + 4096) ^ uvec3(uSeed, uSeed * 7u + 3u, uSeed * 13u + 11u));
  return vec3(h) * (1.0 / 4294967295.0);
}
// Worley periódico: 1 − distância à semente mais próxima (bolhas "cheias")
float worley(vec3 p, float period) {
  vec3 pc = floor(p);
  vec3 pf = p - pc;
  float d = 1e9;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z);
    vec3 c = mod(pc + o, period);
    vec3 fp = o + hash3(ivec3(c)) - pf;
    d = min(d, dot(fp, fp));
  }
  return 1.0 - clamp(sqrt(d), 0.0, 1.0);
}
float worleyFbm(vec3 uvw, float f) {
  return worley(uvw * f, f) * 0.625 + worley(uvw * f * 2.0, f * 2.0) * 0.25 + worley(uvw * f * 4.0, f * 4.0) * 0.125;
}
vec3 grad3(ivec3 c) { return normalize(hash3(c) * 2.0 - 1.0 + 1e-4); }
float perlin(vec3 p, float period) {
  vec3 pc = floor(p);
  vec3 pf = p - pc;
  vec3 w = pf * pf * pf * (pf * (pf * 6.0 - 15.0) + 10.0);
  float n[8];
  for (int i = 0; i < 8; i++) {
    vec3 o = vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
    vec3 c = mod(pc + o, period);
    n[i] = dot(grad3(ivec3(c)), pf - o);
  }
  float x0 = mix(n[0], n[1], w.x), x1 = mix(n[2], n[3], w.x);
  float x2 = mix(n[4], n[5], w.x), x3 = mix(n[6], n[7], w.x);
  return mix(mix(x0, x1, w.y), mix(x2, x3, w.y), w.z);
}
float perlinFbm(vec3 uvw, float f, int oct) {
  float s = 0.0, a = 1.0, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += perlin(uvw * f, f) * a;
    n += a;
    a *= 0.5;
    f *= 2.0;
  }
  return s / n;
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
`;

const SHAPE_FRAG = /* glsl */ `
precision highp float;
${NOISE_GLSL}
uniform float uZ;
in vec2 vUv;
out vec4 oC;
void main() {
  vec3 uvw = vec3(vUv, uZ);
  float pf = perlinFbm(uvw, 4.0, 5) * 0.5 + 0.5;
  pf = clamp(pf * 1.25 - 0.12, 0.0, 1.0);
  float w1 = worleyFbm(uvw, 4.0);
  float pw = clamp(remap(pf, 0.0, 1.0, w1, 1.0), 0.0, 1.0);
  float w2 = worleyFbm(uvw, 8.0);
  float w3 = worleyFbm(uvw, 16.0);
  oC = vec4(pw, w1, w2, w3);
}`;

const DETAIL_FRAG = /* glsl */ `
precision highp float;
${NOISE_GLSL}
uniform float uZ;
in vec2 vUv;
out vec4 oC;
void main() {
  vec3 uvw = vec3(vUv, uZ);
  oC = vec4(worleyFbm(uvw, 2.0), worleyFbm(uvw, 4.0), worleyFbm(uvw, 8.0), 1.0);
}`;

/** Ruído de valor 3D não periódico (para o mapa de clima na esfera). */
const WEATHER_FRAG = /* glsl */ `
precision highp float;
uniform uint uSeed;
uniform int uFace;
uniform vec3 uOff;
in vec2 vUv;
out vec4 oC;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float h1(vec3 c) {
  uvec3 h = pcg3(uvec3(ivec3(c) + 65536) ^ uvec3(uSeed, uSeed * 5u + 1u, uSeed * 17u + 9u));
  return float(h.x) * (1.0 / 4294967295.0);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h1(i), h1(i + vec3(1, 0, 0)), f.x), mix(h1(i + vec3(0, 1, 0)), h1(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h1(i + vec3(0, 0, 1)), h1(i + vec3(1, 0, 1)), f.x), mix(h1(i + vec3(0, 1, 1)), h1(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += vnoise(p) * a;
    n += a;
    a *= 0.5;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
  }
  return s / n;
}
vec3 faceDir(int f, vec2 uv) {
  float u = uv.x * 2.0 - 1.0, v = uv.y * 2.0 - 1.0;
  vec3 d;
  if (f == 0) d = vec3(1.0, -v, -u);
  else if (f == 1) d = vec3(-1.0, -v, u);
  else if (f == 2) d = vec3(u, 1.0, v);
  else if (f == 3) d = vec3(u, -1.0, -v);
  else if (f == 4) d = vec3(u, -v, 1.0);
  else d = vec3(-u, -v, -1.0);
  return normalize(d);
}
void main() {
  vec3 d = faceDir(uFace, vUv);
  vec3 p = d * 9.0 + uOff;
  // domínio deformado: frentes e redemoinhos em vez de manchas redondas
  vec3 q = vec3(fbm(p * 0.6, 4), fbm(p * 0.6 + 5.2, 4), fbm(p * 0.6 + 11.7, 4));
  vec3 pw = p + (q - 0.5) * 6.0;
  float cov = fbm(pw * 1.1, 6);
  cov = smoothstep(0.28, 0.72, cov);
  // faixas de latitude (zona de convergência no equador, ventos de oeste)
  float lat = abs(d.y);
  cov = clamp(cov + 0.12 * (1.0 - smoothstep(0.0, 0.25, lat)) - 0.08 * smoothstep(0.3, 0.5, lat) * (1.0 - smoothstep(0.6, 0.8, lat)), 0.0, 1.0);
  float typ = fbm(pw * 0.8 + 31.0, 4);
  typ = smoothstep(0.3, 0.75, typ);
  float storm = fbm(pw * 1.7 + 77.0, 5);
  storm = smoothstep(0.55, 0.78, storm) * smoothstep(0.35, 0.7, cov);
  float cir = fbm(vec3(d.x * 3.0, d.y * 14.0, d.z * 3.0) + uOff * 1.3 + 50.0, 5);
  cir = smoothstep(0.42, 0.75, cir);
  oC = vec4(cov, typ, storm, cir);
}`;

function quad(material) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, mesh, geo };
}

/** Gera as duas texturas 3D. Devolve { shape, detail } (Data3DTexture de render target). */
export function generateCloudNoise(renderer, seed, { shapeRes = 64, detailRes = 32 } = {}) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mk = (res) => {
    const rt = new THREE.WebGL3DRenderTarget(res, res, res, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const t = rt.texture;
    t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    return rt;
  };
  const prevTarget = renderer.getRenderTarget();
  const out = {};
  for (const [key, res, frag] of [
    ['shape', shapeRes, SHAPE_FRAG],
    ['detail', detailRes, DETAIL_FRAG],
  ]) {
    const rt = mk(res);
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: 'precision highp float;\nin vec3 position;\nin vec2 uv;\n' + VERT,
      fragmentShader: frag,
      uniforms: { uSeed: { value: seed >>> 0 }, uZ: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    const q = quad(mat);
    for (let z = 0; z < res; z++) {
      mat.uniforms.uZ.value = (z + 0.5) / res;
      renderer.setRenderTarget(rt, z);
      renderer.render(q.scene, cam);
    }
    mat.dispose();
    q.geo.dispose();
    out[key] = rt;
  }
  renderer.setRenderTarget(prevTarget);
  return out;
}

/** Mapa de clima esférico (cubemap). */
export function generateWeatherMap(renderer, seed, size = 256) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const off = new THREE.Vector3(((seed % 1000) / 1000) * 37.1, (((seed >>> 10) % 1000) / 1000) * 41.7, (((seed >>> 20) % 1000) / 1000) * 29.3);
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: 'precision highp float;\nin vec3 position;\nin vec2 uv;\n' + VERT,
    fragmentShader: WEATHER_FRAG,
    uniforms: { uSeed: { value: seed >>> 0 }, uFace: { value: 0 }, uOff: { value: off } },
    depthTest: false,
    depthWrite: false,
  });
  const q = quad(mat);
  const prevTarget = renderer.getRenderTarget();
  for (let f = 0; f < 6; f++) {
    mat.uniforms.uFace.value = f;
    renderer.setRenderTarget(rt, f);
    renderer.render(q.scene, cam);
  }
  renderer.setRenderTarget(prevTarget);
  mat.dispose();
  q.geo.dispose();
  return rt;
}
