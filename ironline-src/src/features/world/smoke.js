/**
 * Colunas de fumaça distantes (incêndios na cidade) — partículas de
 * verdade, não um cartão único:
 *
 *  - cada coluna = ~34 "puffs" esféricos (billboards de frente para a
 *    câmera) que nascem na base, sobem desacelerando, crescem e derivam
 *    com o vento; o ciclo é contínuo (fase por puff) → a pluma "rola";
 *  - alfa SUAVE (mistura alfa normal, sem pontilhado/alpha-to-coverage):
 *    máscara de fBm de 4 oitavas com distorção de domínio, borda difusa;
 *  - iluminação volumétrica aproximada: normal de esfera perturbada pelo
 *    ruído (lado do sol claro e quente, núcleo denso escuro por auto-
 *    sombreamento), transmissão (brilho de borda contra o sol) e ambiente
 *    do céu de cima;
 *  - cor por idade: base preta de combustível → topo cinza-acastanhado;
 *  - perspectiva aérea própria (a névoa do compositor não pinta sobre
 *    transparentes no céu).
 * Um draw call para todas as colunas.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aCol;   // x, z da base, altura total, largura
attribute vec4 aPuff;  // fase, semente, deslocamento lateral, escala
uniform vec3 uCam;
uniform float uTime;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
varying float vDist;
varying vec3 vR;
varying vec3 vU;
varying vec3 vF;
varying float vA;
void main() {
  vUv = uv;
  float s = aPuff.y;
  vSeed = s;
  float H = aCol.z, Wd = aCol.w;
  // idade 0..1 (ciclo lento: colunas grandes sobem devagar)
  float life = fract(aPuff.x + uTime * (0.012 + 0.006 * s) * (60.0 / H));
  vLife = life;
  // sobe desacelerando (raiz) e é levada pelo vento (+x, +z leve) cada vez mais
  float rise = pow(life, 0.72);
  vec3 base = vec3(aCol.x, 0.0, aCol.y);
  vec3 c = base + vec3(0.0, rise * H, 0.0)
         + vec3(1.0, 0.0, 0.35) * pow(life, 1.7) * H * 0.55
         + vec3(cos(s * 40.0), 0.0, sin(s * 40.0)) * aPuff.z * Wd * (0.25 + life);
  float size = Wd * (0.45 + 1.9 * pow(life, 0.8)) * aPuff.w;
  vec3 f = normalize(uCam - c);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  // rotação por puff (o mesmo padrão de ruído não se alinha)
  float a = s * 6.2831 + life * (s - 0.5) * 2.0;
  vec2 q = (uv - 0.5) * size;
  q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  vec3 p = c + r * q.x + u * q.y;
  vR = r * cos(a) + u * sin(a);
  vU = -r * sin(a) + u * cos(a);
  vF = f;
  vDist = length(uCam - c);
  // entra e sai suavemente; topo se dissolve
  vA = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.55, 1.0, life));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vLife;
varying float vSeed;
varying float vDist;
varying vec3 vR;
varying vec3 vU;
varying vec3 vF;
varying float vA;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform float uHazeK;
uniform float uOpacity;
float hsh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.07 + 5.3; a *= 0.5; }
  return s;
}
void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  // máscara: esfera difusa recortada por fBm com distorção de domínio (couve-flor)
  vec2 q = vUv * 2.6 + vSeed * 17.0 + vec2(0.0, -uTime * 0.02);
  float w = fbm(q * 0.8 + 3.1);
  float n = fbm(q + (w - 0.5) * 1.6);
  float n2 = vn(q * 4.3 - w * 2.0);
  float edge = 1.0 - sqrt(r2);
  float dens = clamp(edge * 1.35 + (n - 0.5) * 1.25 + (n2 - 0.5) * 0.25 - 0.08, 0.0, 1.0);
  dens = smoothstep(0.0, 0.75, dens);
  float alpha = dens * vA * uOpacity;
  if (alpha < 0.004) discard;
  // normal de esfera perturbada pelo gradiente do ruído
  float z = sqrt(max(0.0, 1.0 - r2));
  vec2 g = vec2(vn(q + vec2(0.07, 0.0)) - vn(q - vec2(0.07, 0.0)), vn(q + vec2(0.0, 0.07)) - vn(q - vec2(0.0, 0.07)));
  vec3 nl = normalize(vR * (c.x - g.x * 1.5) + vU * (c.y - g.y * 1.5) + vF * (z + 0.25));
  float ndl = dot(nl, uSunDir);
  float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  // auto-sombreamento: núcleo denso e lado oposto ao sol mais escuros
  float selfSh = mix(0.35, 1.0, smoothstep(-0.3, 0.7, ndl)) * mix(0.55, 1.0, 1.0 - dens * 0.6);
  // transmissão contra o sol (borda fina acende)
  float back = pow(clamp(dot(-vF, uSunDir), 0.0, 1.0), 6.0) * (1.0 - dens) * 0.8;
  // albedo por idade: fuligem preta na base, cinza-acastanhado no alto
  vec3 alb = mix(vec3(0.035, 0.032, 0.03), vec3(0.34, 0.32, 0.3), smoothstep(0.02, 0.7, vLife));
  alb *= 0.85 + 0.3 * n;
  float skyK = 0.55 + 0.45 * clamp(nl.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = alb * (uSky * skyK + uSunCol * (wrap * selfSh + back));
  // perspectiva aérea
  float fogK = (1.0 - exp(-vDist * uHazeK)) * 0.85;
  col = mix(col, uHaze, fogK);
  alpha *= 1.0 - fogK * 0.35;
  gl_FragColor = vec4(col, alpha);
}`;

export function createSmoke(list, atmos) {
  const pos = [], uv = [], cols = [], puffs = [];
  const quad = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const s of list) {
    const n = s.puffs || 34;
    for (let j = 0; j < n; j++) {
      const ph = (j + rnd() * 0.6) / n;
      const sd = rnd();
      const off = (rnd() - 0.5) * 0.7;
      const sc = 0.75 + rnd() * 0.5;
      for (const [u, v] of quad) {
        pos.push(0, 0, 0);
        uv.push(u, v);
        cols.push(s.x, s.z, s.h, s.w);
        puffs.push(ph, sd, off, sc);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(cols, 4));
  g.setAttribute('aPuff', new THREE.Float32BufferAttribute(puffs, 4));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSunDir: { value: atmos.sunDir.clone() },
      uSunCol: { value: atmos.sunColor.clone().multiplyScalar(2.4) },
      uSky: { value: new THREE.Color(0.55, 0.62, 0.74) },
      uHaze: { value: new THREE.Color(0.66, 0.66, 0.66) },
      uHazeK: { value: 0.0035 },
      uOpacity: { value: 0.9 },
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'world:smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.userData.noSkyOcclusion = true;
  mesh.userData.noSunView = true;
  return mesh;
}
