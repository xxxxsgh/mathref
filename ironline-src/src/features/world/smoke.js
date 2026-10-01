/**
 * Colunas de fumaça distantes (incêndios na cidade): billboards cilíndricos
 * (giram só em Y para a câmera) com ruído fBm animado em shader, base
 * escura e densa abrindo em pluma inclinada pelo vento, iluminação do sol
 * do lado de cá (borda clara) e perspectiva aérea. Um draw call.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aSmoke; // x, z, altura, largura
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
varying float vDist;
varying vec3 vWorld;
uniform vec3 uCam;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec3 base = vec3(aSmoke.x, 0.0, aSmoke.y);
  vec3 toCam = uCam - base; toCam.y = 0.0;
  vec3 f = normalize(toCam);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  float h = aSmoke.z, w = aSmoke.w;
  // pluma abre e inclina com a altura (vento)
  float t = uv.y;
  float wid = w * (0.35 + 1.6 * t);
  vec3 p = base + r * (uv.x - 0.5) * wid + vec3(0.0, t * h, 0.0) + vec3(1.0, 0.0, 0.35) * t * t * h * 0.45;
  vWorld = p;
  vDist = length(uCam - p);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
varying float vDist;
varying vec3 vWorld;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uHaze;
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
void main() {
  float t = vUv.y;
  vec2 q = vec2(vUv.x * 2.2, vUv.y * 5.0 - uTime * 0.09) + vSeed * 13.0;
  float n = fbm(q + vec2(fbm(q * 0.7 + uTime * 0.03), 0.0) * 1.4);
  float n2 = fbm(q * 2.3 + 3.7);
  // borda da pluma recortada pelo ruído (nada de laterais retas)
  float dx = abs(vUv.x - 0.5) * 2.0;
  float body = 1.0 - dx * (1.15 - 0.35 * t) + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.35;
  float dens = smoothstep(0.05, 0.4, body) * smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.55, 1.0, t + (n - 0.5) * 0.3));
  // cor: base preta (combustível), topo cinza; lado do sol levemente mais claro
  vec3 dark = vec3(0.045, 0.043, 0.04), grey = vec3(0.24, 0.23, 0.22);
  vec3 col = mix(dark, grey, smoothstep(0.05, 0.9, t) * 0.75 + (n - 0.5) * 0.3);
  col += uSunCol * smoothstep(0.45, 0.8, n) * 0.06 * (0.3 + t);
  // perspectiva aérea
  float fogK = 1.0 - exp(-vDist * 0.003);
  col = mix(col, uHaze, fogK * 0.35);
  float a = dens;
  // alfa pontilhado (estável no espaço da tela): grava profundidade, então
  // o céu/névoa do compositor não pinta por cima; o TAA suaviza o pontilhado
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uTime * 60.0 * 0.618034);
  if (a < dither * 0.98 + 0.01) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSmoke(list, atmos) {
  const pos = [], uv = [], sm = [], seed = [];
  const quad = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  const rows = 12;
  for (const s of list) {
    for (let j = 0; j < rows; j++) {
      for (const [u, v] of quad) {
        const vv = (j + v) / rows;
        pos.push(0, 0, 0);
        uv.push(u, vv);
        sm.push(s.x, s.z, s.h, s.w);
        seed.push(s.seed ?? Math.random());
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSmoke', new THREE.Float32BufferAttribute(sm, 4));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSunDir: { value: atmos.sunDir.clone() },
      uSunCol: { value: atmos.sunColor.clone() },
      uHaze: { value: new THREE.Color(0.62, 0.62, 0.62) },
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'world:smoke';
  mesh.frustumCulled = false;
  mesh.userData.noSkyOcclusion = true;
  mesh.userData.noSunView = true;
  return mesh;
}
