/**
 * Fogo: chamas procedurais (billboards cilíndricos com ruído rolando,
 * mistura aditiva em HDR — o bloom do compositor faz o brilho) + luz
 * pontual laranja tremulando (luz local: contraste quente no meio da
 * paleta fria/poeirenta) + brasas subindo.
 *
 * Lista: [{ x, y, z, w, h, light (intensidade, 0 = sem luz), seed }].
 * Só 1–2 luzes pontuais no mapa: cada uma pesa em todos os shaders.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aFire;   // x, y, z, seed
attribute vec3 aSize;   // largura, altura, rotação/fase
varying vec2 vUv;
varying float vSeed;
varying float vFade;
uniform vec3 uCam;
void main() {
  vUv = uv;
  vSeed = aFire.w;
  vec3 base = aFire.xyz;
  // billboard cilíndrico (gira só em Y, de frente para a câmera)
  vec3 toCam = uCam - base;
  toCam.y = 0.0;
  float l = length(toCam);
  vec3 f = l > 1e-4 ? toCam / l : vec3(0.0, 0.0, 1.0);
  vec3 r = vec3(f.z, 0.0, -f.x);
  // camadas levemente cruzadas (volume): gira o "right" pela fase
  float a = aSize.z;
  vec3 rr = normalize(r * cos(a) + f * sin(a));
  vec3 p = base + rr * (uv.x - 0.5) * aSize.x + vec3(0.0, uv.y * aSize.y, 0.0);
  // empurra um pouco para a câmera (não corta no capô/tambor)
  p += f * 0.05;
  vFade = clamp(l / 1.5, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
varying float vFade;
uniform float uTime;
uniform float uBoost;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
// rampa de corpo negro (vermelho escuro → laranja → amarelo → quase branco):
// chama de combustível sujo à luz do dia — sem laranja de desenho animado
vec3 blackbody(float t) {
  vec3 c = vec3(0.55, 0.08, 0.01) * smoothstep(0.0, 0.25, t);
  c = mix(c, vec3(1.0, 0.36, 0.06), smoothstep(0.2, 0.5, t));
  c = mix(c, vec3(1.0, 0.62, 0.24), smoothstep(0.45, 0.78, t));
  c = mix(c, vec3(1.0, 0.86, 0.62), smoothstep(0.75, 1.0, t));
  return c;
}
void main() {
  float t = uTime * (0.85 + vSeed * 0.35);
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  // campo turbulento rolando para cima com distorção de domínio (sem
  // "espinhos" regulares): o fogo se rasga em línguas e fiapos soltos
  vec2 q = vec2(x * 1.15 + vSeed * 13.0, y * 1.7 - t * 1.85);
  vec2 w = vec2(fbm(q * 1.2), fbm(q * 1.2 + 5.2)) - 0.5;
  float n = fbm(q * 2.3 + w * 1.8 + vec2(0.0, -t * 0.7));
  float n2 = vn(q * 6.5 + w * 3.0 - vec2(0.0, t * 2.5));
  // perfil: base larga e macia, afina e ondula com a altura
  float sway = w.x * 0.7 * y + (vn(vec2(t * 0.9, vSeed * 7.0)) - 0.5) * 0.25 * y;
  float width = mix(1.0, 0.5, smoothstep(0.0, 1.0, y));
  float d = abs(x - sway) / width;
  float shape = (1.0 - d * d) - y * 0.85;
  // ruído cresce com a altura: a base é contínua, o topo se rasga em bolsões
  float dens = shape + (n - 0.5) * (0.9 + 1.6 * y) + (n2 - 0.5) * 0.3;
  float edge = smoothstep(1.0, 0.75, abs(x)) * smoothstep(1.0, 0.82, y);
  float f = smoothstep(0.0, 0.32, dens) * smoothstep(0.0, 0.1, y) * edge;
  // temperatura: núcleo denso e baixo = quente; bordas e topo = frios
  float temp = clamp(dens * 1.25 * (1.0 - y * 0.6) + 0.05, 0.0, 1.0);
  vec3 col = blackbody(temp) * (0.25 + 1.6 * temp * temp);
  // fuligem: logo acima/ao redor das línguas o gás fica preto e escurece o fundo
  float soot = smoothstep(-0.35, 0.05, dens) * (1.0 - f) * smoothstep(0.35, 0.85, y) * edge;
  soot *= 0.55 * (0.6 + 0.4 * n2);
  float flick = 0.85 + 0.15 * vn(vec2(t * 6.0, vSeed * 31.0));
  // alfa pré-multiplicado: a chama SOMA luz, a fuligem cobre
  gl_FragColor = vec4(col * f * uBoost * flick * vFade, clamp(soot + f * 0.25, 0.0, 1.0) * vFade);
}`;

const EMBER_VERT = /* glsl */ `
attribute vec4 aE; // x, y, z (base), seed
attribute vec2 aR; // raio de espalhamento, altura máxima
uniform float uTime;
varying float vA;
void main() {
  float s = aE.w;
  float life = fract(uTime * (0.25 + s * 0.2) + s * 7.31);
  vec3 p = aE.xyz;
  float ang = s * 40.0 + uTime * (0.6 + s);
  p.x += cos(ang) * aR.x * (0.3 + life) + sin(uTime * 2.0 + s * 9.0) * 0.15 * life;
  p.z += sin(ang) * aR.x * (0.3 + life);
  p.y += life * aR.y;
  vA = (1.0 - life) * smoothstep(0.0, 0.1, life);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(60.0 / -mv.z, 1.0, 4.0);
}`;
const EMBER_FRAG = /* glsl */ `
varying float vA;
uniform float uBoost;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c)) * vA;
  gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * a * uBoost * 1.5, 1.0);
}`;

const PUFF_VERT = /* glsl */ `
attribute vec4 aP;  // base x, y, z, seed
attribute vec3 aQ;  // altura total, largura inicial, largura final
uniform float uTime;
uniform vec3 uCam;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vLife;
void main() {
  vUv = uv;
  float s = aP.w;
  vSeed = s;
  float life = fract(uTime * (0.07 + s * 0.03) + s * 13.7);
  vLife = life;
  // sobe desacelerando e deriva com o vento (+x, levemente +z)
  vec3 c = aP.xyz + vec3(0.0, aQ.x * (1.0 - (1.0 - life) * (1.0 - life)), 0.0)
         + vec3(1.0, 0.0, 0.35) * life * life * aQ.x * 0.5
         + vec3(sin(s * 31.0), 0.0, cos(s * 17.0)) * life * 0.8;
  float size = mix(aQ.y, aQ.z, sqrt(life));
  vec3 f = normalize(uCam - c);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  float a = s * 6.28;
  vec2 q = (uv - 0.5) * size;
  q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  vec3 p = c + r * q.x + u * q.y;
  vA = smoothstep(0.0, 0.08, life) * (1.0 - life);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const PUFF_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vLife;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uTime2;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
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
  // alfa SUAVE (mistura normal): esfera difusa recortada por fBm distorcido
  vec2 q = vUv * 2.4 + vSeed * 9.0;
  float w = fbm(q * 0.8 + 1.7);
  float n = fbm(q + (w - 0.5) * 1.5);
  float dens = clamp((1.0 - sqrt(r2)) * 1.3 + (n - 0.5) * 1.2 - 0.06, 0.0, 1.0);
  dens = smoothstep(0.0, 0.8, dens);
  float a = dens * vA * 0.95;
  if (a < 0.004) discard;
  // iluminação: normal de esfera (tela) → lado do sol claro, núcleo denso escuro
  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 nl = normalize(vec3(c.x, c.y, z + 0.2));
  float lit = clamp(dot(nl, normalize(vec3(uSunDir.x, uSunDir.y, 0.35))) * 0.55 + 0.45, 0.0, 1.0);
  lit *= mix(0.6, 1.0, 1.0 - dens * 0.5);
  // fumaça de pneu/óleo: preta embaixo, cinza-acastanhada no alto
  vec3 alb = mix(vec3(0.03, 0.028, 0.026), vec3(0.3, 0.28, 0.26), smoothstep(0.0, 0.8, vLife)) * (0.85 + 0.3 * n);
  vec3 col = alb * (vec3(0.5, 0.56, 0.66) * (0.6 + 0.4 * c.y * 0.5 + 0.2) + uSunCol * 2.2 * lit);
  gl_FragColor = vec4(col, a);
}`;

export function createFires(list, rng) {
  const group = new THREE.Group();
  group.name = 'world:fire';
  const pos = [], uv = [], fire = [], size = [];
  const quad = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  const ep = [], er = [];
  for (const f of list) {
    // 5 línguas por foco: alturas/larguras/posições levemente diferentes
    // várias línguas estreitas sobrepostas (volume), alturas bem variadas:
    // o contorno resultante é irregular, não uma "coroa" de pontas iguais
    const n = Math.round((f.tongues || 5) * 1.8);
    for (let k = 0; k < n; k++) {
      const ox = (rng.next() - 0.5) * f.w * 0.7, oz = (rng.next() - 0.5) * (f.d ?? f.w) * 0.7;
      const tall = rng.next();
      const sw = f.w * (0.6 + rng.next() * 0.45), sh = f.h * (0.55 + tall * tall * 0.7);
      const ph = (k / n) * Math.PI;
      const s = rng.next();
      for (const [u, v] of quad) {
        pos.push(0, 0, 0);
        uv.push(u, v);
        fire.push(f.x + ox, f.y, f.z + oz, s);
        size.push(sw, sh, ph * 0.35);
      }
    }
    for (let k = 0; k < (f.embers ?? 24); k++) {
      ep.push(f.x + (rng.next() - 0.5) * f.w * 0.5, f.y + f.h * 0.3, f.z + (rng.next() - 0.5) * f.w * 0.5, rng.next());
      er.push(f.w * 0.4, f.h * 3.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFire', new THREE.Float32BufferAttribute(fire, 4));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 3));
  const uniforms = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBoost: { value: 3.2 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    // pré-multiplicado: cor soma (emissão), alfa cobre (fuligem)
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.userData.noSkyOcclusion = true;
  mesh.userData.noSunView = true;
  group.add(mesh);

  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ep.length / 4 * 3), 3));
  eg.setAttribute('aE', new THREE.Float32BufferAttribute(ep, 4));
  eg.setAttribute('aR', new THREE.Float32BufferAttribute(er, 2));
  const emat = new THREE.ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: { uTime: uniforms.uTime, uBoost: uniforms.uBoost }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const embers = new THREE.Points(eg, emat);
  embers.frustumCulled = false;
  embers.userData.noSkyOcclusion = true;
  embers.userData.noSunView = true;
  group.add(embers);

  // fumaça em puffs (partículas que sobem, crescem e somem)
  const pp = [], pu = [], pa = [], pq = [];
  for (const f of list) {
    for (let k = 0; k < (f.smoke || 0); k++) {
      const sd = rng.next();
      for (const [u, v] of quad) {
        pp.push(0, 0, 0);
        pu.push(u, v);
        pa.push(f.x + (rng.next() - 0.5) * f.w * 0.4, f.y + f.h * 0.6, f.z + (rng.next() - 0.5) * f.w * 0.4, sd);
        pq.push(f.smokeH || 14, f.w * 0.9, f.w * 4.5);
      }
    }
  }
  if (pp.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
    sg.setAttribute('aP', new THREE.Float32BufferAttribute(pa, 4));
    sg.setAttribute('aQ', new THREE.Float32BufferAttribute(pq, 3));
    const smat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: { uTime: uniforms.uTime, uTime2: uniforms.uTime, uCam: uniforms.uCam, uSunDir: { value: new THREE.Vector3(-0.32, 0.6, -0.73).normalize() }, uSunCol: { value: new THREE.Color(1.0, 0.86, 0.68) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.FrontSide,
    });
    const puffs = new THREE.Mesh(sg, smat);
    puffs.frustumCulled = false;
    puffs.renderOrder = 6;
    puffs.userData.noSkyOcclusion = true;
    puffs.userData.noSunView = true;
    group.add(puffs);
    group.userData.puffs = smat;
  }

  const lights = [];
  for (const f of list) {
    if (!f.light) continue;
    // luz de fogo à luz do dia: laranja-amarelada e contida (o sol domina)
    const L = new THREE.PointLight(0xff9450, f.light * 0.8, f.range || 14, 2);
    L.position.set(f.x, f.y + f.h * 0.45, f.z);
    L.castShadow = false;
    L.userData.base = f.light * 0.8;
    L.userData.seed = rng.next() * 100;
    group.add(L);
    lights.push(L);
  }
  group.userData.update = (t, cam) => {
    uniforms.uTime.value = t;
    uniforms.uCam.value.copy(cam.position);
    for (const L of lights) {
      const s = L.userData.seed;
      // tremulação: soma de senos incomensuráveis (sem ruído caro)
      const k = 0.78 + 0.12 * Math.sin(t * 9.1 + s) + 0.07 * Math.sin(t * 23.7 + s * 2.1) + 0.05 * Math.sin(t * 3.3 + s * 0.7);
      L.intensity = L.userData.base * k;
    }
  };
  return group;
}
