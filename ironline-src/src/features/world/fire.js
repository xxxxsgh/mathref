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
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float t = uTime * (1.0 + vSeed * 0.3);
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  vec2 q = vec2(x * 1.6 + vSeed * 17.0, y * 2.2 - t * 2.4);
  float n = vn(q * 1.7) * 0.55 + vn(q * 3.9 + 3.1) * 0.3 + vn(q * 8.3 + 7.7) * 0.15;
  // perfil: base larga, ponta afilada e ondulante
  float sway = (vn(vec2(y * 2.0 - t * 1.3, vSeed * 9.0)) - 0.5) * 0.5 * y;
  float w = mix(0.95, 0.12, pow(y, 0.8));
  float d = abs(x - sway) / w;
  float body = (1.0 - d) * 1.25 - y * 0.85 + (n - 0.5) * 1.15;
  float flame = smoothstep(0.0, 0.5, body) * smoothstep(0.0, 0.06, y);
  // núcleo quente (amarelo-branco) e bordas vermelhas/fuliginosas
  float core = smoothstep(0.35, 0.95, body) * (1.0 - y * 0.7);
  vec3 col = mix(vec3(0.85, 0.12, 0.01), vec3(1.0, 0.48, 0.08), smoothstep(0.0, 0.45, body));
  col = mix(col, vec3(1.0, 0.86, 0.55), core);
  float flick = 0.85 + 0.15 * vn(vec2(t * 6.0, vSeed * 31.0));
  gl_FragColor = vec4(col * flame * uBoost * flick * vFade, 1.0);
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
  float a = dens * vA * 0.75;
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
    const n = f.tongues || 5;
    for (let k = 0; k < n; k++) {
      const ox = (rng.next() - 0.5) * f.w * 0.55, oz = (rng.next() - 0.5) * (f.d ?? f.w) * 0.55;
      const sw = f.w * (0.5 + rng.next() * 0.45), sh = f.h * (0.6 + rng.next() * 0.5);
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
  const uniforms = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBoost: { value: 7 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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
    const L = new THREE.PointLight(0xff7a2e, f.light, f.range || 14, 2);
    L.position.set(f.x, f.y + f.h * 0.45, f.z);
    L.castShadow = false;
    L.userData.base = f.light;
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
