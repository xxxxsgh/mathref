/**
 * PRECIPITAÇÃO NA GPU — partículas ancoradas na câmera.
 *
 * Cada tipo (chuva, chuva ácida, neve, poeira) é UM desenho instanciado: um
 * quad por partícula, posição = semente·caixa + velocidade·t, dobrada (mod)
 * numa caixa centrada na câmera. A caixa vive no TRIEDO LOCAL (leste, cima,
 * norte) e o deslocamento da câmera dentro dela é calculado em double no CPU
 * (posição de mundo mod caixa) → andar/voar faz as gotas passarem
 * corretamente, sem "nadar" junto com a câmera.
 *
 * Chuva: riscos esticados pela velocidade RELATIVA à câmera (motion blur
 * barato). Neve: flocos redondos com balanço. Poeira: sopros grandes e
 * suaves + grãos rápidos. Tudo em HDR, iluminado pela luz do céu/sol que o
 * weather passa a cada frame.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aSeed;
attribute vec2 aCorner;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uOffset;
uniform mat3 uFrame;      // local (leste, cima, norte) → render
uniform vec3 uVel;        // velocidade local (m/s)
uniform vec3 uCamVel;     // velocidade local da câmera
uniform float uSize;
uniform float uStretch;   // s de exposição do risco
uniform float uKind;      // 0 chuva, 1 neve, 2 poeira
uniform float uCount;     // fração de partículas ativas (intensidade)
uniform float uFar;
varying vec2 vC;
varying float vA;
void main() {
  float isOn = step(aSeed.w, uCount);
  float sp = 0.75 + 0.5 * fract(aSeed.w * 7.31);
  vec3 vel = uVel * sp;
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  if (uKind > 0.5) {
    // balanço (neve/poeira): turbulência por partícula
    float ph = aSeed.w * 40.0;
    p += vec3(sin(uTime * 1.3 + ph), 0.35 * sin(uTime * 0.9 + ph * 1.7), cos(uTime * 1.1 + ph * 0.7)) * (uKind > 1.5 ? 2.5 : 0.7);
  }
  p = mod(p - uOffset, uBox) - uBox * 0.5;
  vec3 w = uFrame * p;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float dist = -mv.z;
  vec3 rel = uFrame * (vel - uCamVel);
  vec3 vv = (viewMatrix * vec4(rel, 0.0)).xyz;
  vec3 a = mv.xyz;
  vec3 b = mv.xyz - vv * uStretch;
  float size = uSize * (uKind > 1.5 ? (0.4 + 2.2 * fract(aSeed.w * 13.7)) : (0.6 + 0.8 * fract(aSeed.w * 3.3)));
  // nunca mais fino que ~1 pixel (senão some no SwiftShader/baixa resolução)
  float pix = dist * 2.0 / (projectionMatrix[1][1] * uFar);
  float fat = max(1.0, pix / max(size, 1e-4));
  size *= fat;
  vec3 pos;
  if (uKind < 1.5) {
    // risco (chuva) ou floco arrastado pelo vento (neve): lado perpendicular
    // ao risco na tela; a neve nunca fica menor que um disco
    vec3 d = b - a;
    if (uKind > 0.5) {
      float L = length(d);
      float Lmin = size * 2.0;
      if (L < Lmin) {
        d = (L > 1e-6 ? d / L : vec3(0.0, 1.0, 0.0)) * Lmin;
        b = a + d;
      }
      a -= d * 0.5;
      b -= d * 0.5;
      d = b - a;
    }
    vec3 side = normalize(cross(d + vec3(1e-5, 0.0, 0.0), a));
    pos = mix(a, b, aCorner.y) + side * aCorner.x * size * (uKind > 0.5 ? 1.0 : 0.5);
  } else {
    pos = a + vec3(aCorner.x, aCorner.y * 2.0 - 1.0, 0.0) * size;
  }
  vC = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
  float fadeNear = smoothstep(0.25, 1.2, dist);
  float fadeFar = 1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p));
  vA = isOn / (uKind > 0.5 && uKind < 1.5 ? fat * fat : fat) * fadeNear * fadeFar * (dist > 0.0 ? 1.0 : 0.0);
  gl_Position = projectionMatrix * vec4(pos, 1.0);
  if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uAlpha;
uniform float uKind;
varying vec2 vC;
varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  float m;
  if (uKind < 0.5) m = (1.0 - vC.x * vC.x) * smoothstep(-1.0, -0.6, vC.y) * (1.0 - smoothstep(0.6, 1.0, vC.y));
  else {
    float r = length(vC);
    m = uKind > 1.5 ? pow(max(0.0, 1.0 - r), 2.0) : smoothstep(1.0, 0.35, r);
  }
  float a = m * vA * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

const KIND_CFG = {
  rain: { kind: 0, count: 14000, box: [40, 40, 40], vel: [0, -11, 0], size: 0.004, stretch: 0.05, alpha: 0.16 },
  acid: { kind: 0, count: 12000, box: [40, 40, 40], vel: [0, -8, 0], size: 0.008, stretch: 0.05, alpha: 0.3 },
  snow: { kind: 1, count: 12000, box: [34, 34, 34], vel: [0, -1.4, 0], size: 0.03, stretch: 0.022, alpha: 0.85 },
  dust: { kind: 2, count: 2600, box: [60, 30, 60], vel: [0, -0.2, 0], size: 0.9, stretch: 0, alpha: 0.09 },
};

export class Precipitation {
  constructor(ctx, budget = 1) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.layers = {};
    for (const [name, cfg] of Object.entries(KIND_CFG)) {
      const n = Math.max(200, Math.round(cfg.count * budget));
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      geo.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const seeds = new Float32Array(n * 4);
      const rnd = ctx.seed.derive('weather', 'particles', name);
      for (let i = 0; i < n * 4; i++) seeds[i] = rnd.next();
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      geo.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uBox: { value: new THREE.Vector3(...cfg.box) },
          uOffset: { value: new THREE.Vector3() },
          uFrame: { value: new THREE.Matrix3() },
          uVel: { value: new THREE.Vector3(...cfg.vel) },
          uCamVel: { value: new THREE.Vector3() },
          uSize: { value: cfg.size },
          uStretch: { value: cfg.stretch },
          uKind: { value: cfg.kind },
          uCount: { value: 0 },
          uFar: { value: 1 },
          uColor: { value: new THREE.Color(1, 1, 1) },
          uAlpha: { value: cfg.alpha },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.scene.add(mesh);
      this.layers[name] = { mesh, mat, cfg };
    }
    this._frame = new THREE.Matrix3();
  }

  /**
   * Atualiza uniformes. `levels` = { rain, acid, snow, dust } (0..1),
   * frame = { east, up, north } (Vector3), camLocal = posição da câmera no
   * triedo local (double), wind local (Vector3 leste/cima/norte),
   * colors = { rain, acid, snow, dust } (Color, radiância).
   */
  update({ time, levels, frame, camLocal, camVel, wind, colors, viewH = 540 }) {
    this._frame.set(frame.east.x, frame.up.x, frame.north.x, frame.east.y, frame.up.y, frame.north.y, frame.east.z, frame.up.z, frame.north.z);
    let any = false;
    for (const [name, L] of Object.entries(this.layers)) {
      const lv = levels[name] || 0;
      L.mesh.visible = lv > 0.01;
      if (!L.mesh.visible) continue;
      any = true;
      const u = L.mat.uniforms;
      u.uTime.value = time;
      u.uFrame.value.copy(this._frame);
      const box = u.uBox.value;
      u.uOffset.value.set(mod(camLocal.x, box.x), mod(camLocal.y, box.y), mod(camLocal.z, box.z));
      const k = L.cfg.kind;
      // vento: chuva inclina, neve/poeira são carregadas quase por inteiro
      const wk = k === 0 ? 0.55 : k === 1 ? 0.9 : 1.0;
      u.uVel.value.set(L.cfg.vel[0] + wind.x * wk, L.cfg.vel[1] + wind.y * wk, L.cfg.vel[2] + wind.z * wk);
      u.uCamVel.value.copy(camVel);
      u.uCount.value = lv;
      u.uColor.value.copy(colors[name] || colors.rain);
      u.uFar.value = viewH;
    }
    return any;
  }

  render(renderer, camera) {
    renderer.render(this.scene, camera);
  }

  dispose() {
    for (const L of Object.values(this.layers)) {
      L.mesh.geometry.dispose();
      L.mat.dispose();
    }
  }
}

function mod(a, b) {
  return a - Math.floor(a / b) * b;
}
