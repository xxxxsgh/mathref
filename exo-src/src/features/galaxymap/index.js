/**
 * MAPA GALÁCTICO 3D (tecla M) — dono: universe.
 *
 * Lê o modelo da galáxia publicado pelo serviço `universe`
 * (`universe.galaxy.model`): nada é importado de outra feature.
 *
 * Camadas (cena própria, desenhada no estágio 'afterCockpit' por cima de
 * tudo — passa pelo bloom e pelo tone mapping do `render`):
 *   - nuvem da galáxia: ~150 mil pontos amostrados da densidade estelar
 *     (bojo âmbar, braços azulados, berçários rosados), cada ponto um
 *     borrão gaussiano de tamanho em anos-luz com brilho conservado
 *     (a galáxia vira um brilho contínuo de longe e se desfaz de perto);
 *   - nebulosas: sprites volumétricos (ruído no fragmento) nos braços;
 *   - poeira: sprites multiplicativos escurecendo a borda interna dos braços;
 *   - núcleo: brilho central + barra;
 *   - sistemas locais REAIS (os mesmos índices do universo) num raio de
 *     ~520 al do foco, com cor/tamanho da classe espectral, clicáveis;
 *   - marcadores: sistema atual, seleção, rota tracejada animada, alcance
 *     do salto, rótulos (DOM) dos vizinhos.
 *
 * Controles: arrastar = girar · roda = zoom · botão direito/WASD = mover o
 * foco · clique = selecionar · Enter/F ou botão = SALTAR (túnel de warp do
 * universe) · C = centralizar na seleção · M/Esc = fechar.
 *
 * Parâmetros de preset (preset.params): mapOpen (bool), mapSelect ('auto' |
 * índice), mapCam { yaw, pitch, dist (al) }.
 */
import * as THREE from 'three';

const WARP_RANGE = 320; // al
const LOCAL_R = 400;
const CLASS_COLOR = {
  O: [0.55, 0.68, 1.0], B: [0.68, 0.8, 1.0], A: [0.88, 0.92, 1.0], F: [1.0, 0.97, 0.88],
  G: [1.0, 0.9, 0.62], K: [1.0, 0.68, 0.38], M: [1.0, 0.45, 0.3],
};
const CLASS_SIZE = { O: 2.0, B: 1.7, A: 1.35, F: 1.15, G: 1.0, K: 0.9, M: 0.75 };
const BIOME_PT = {
  lush: 'exuberante', ocean: 'oceânico', frozen: 'congelado', toxic: 'tóxico', scorched: 'escaldante',
  exotic: 'exótico', radioactive: 'radioativo', barren: 'estéril', gas: 'gigante gasoso',
};

// ─── shaders ─────────────────────────────────────────────────────────────
const CLOUD_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uGain;
varying vec3 vColor;
varying float vI;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float px = aSize * uScale / d;
  gl_PointSize = clamp(px * 0.35, 1.0, 3.0);
  // estrelas resolvidas por cima do volume: brilho cai com a distância, some muito perto
  vI = uGain * clamp(px * 0.12, 0.12, 1.0) * smoothstep(60.0, 300.0, d);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
const CLOUD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vI;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float g = exp(-dot(c, c) * 9.0);
  gl_FragColor = vec4(vColor * vI * g, 1.0);
}`;

const NEB_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uScale;
uniform float uGain;
varying vec3 vColor;
varying float vSeed;
varying float vI;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float px = aSize * uScale / d;
  gl_PointSize = clamp(px, 2.0, 420.0);
  vI = uGain * smoothstep(2.0, 12.0, px) * smoothstep(420.0, 160.0, px);
  vColor = aColor;
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;
const NOISE2 = /* glsl */ `
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float f2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }`;
const NEB_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vSeed;
varying float vI;
${NOISE2}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  vec2 q = c * 3.0 + vSeed;
  float w = f2(q + f2(q * 1.7) * 1.5);
  float a = smoothstep(1.0, 0.2, r) * smoothstep(0.35, 0.85, w);
  gl_FragColor = vec4(vColor * a * vI, 1.0);
}`;
const DUST_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vSeed;
varying float vI;
${NOISE2}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  vec2 q = c * 2.5 + vSeed;
  float w = f2(q + f2(q * 2.1));
  float a = smoothstep(1.0, 0.3, r) * smoothstep(0.4, 0.8, w) * clamp(vI, 0.0, 1.0);
  gl_FragColor = vec4(mix(vec3(1.0), vec3(0.35, 0.3, 0.32), a * 0.85), 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aFlag;
uniform float uPx;
uniform float uScale;
uniform vec3 uFocus;
uniform float uRadius;
varying vec3 vColor;
varying float vFlag;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(0.1, -mv.z);
  // tamanho em pixels: classe + leve perspectiva
  float px = uPx * aSize * clamp(900.0 / d, 0.5, 2.2);
  gl_PointSize = clamp(px, 2.0, 40.0);
  float df = length(position - uFocus);
  vFade = smoothstep(16000.0, 4000.0, d) * (uRadius > 0.0 ? pow(smoothstep(uRadius, uRadius * 0.15, df), 1.5) : 1.0) * (0.35 + 0.65 * aSize / 2.0);
  vColor = aColor;
  vFlag = aFlag;
  gl_Position = projectionMatrix * mv;
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFlag;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float core = exp(-r * r * 40.0);
  float halo = exp(-r * 5.0) * 0.4;
  float spikes = (exp(-abs(c.x) * 70.0) + exp(-abs(c.y) * 70.0)) * exp(-r * 3.5) * 0.3;
  vec3 sat = pow(vColor, vec3(1.8));
  vec3 col = sat * (core * 5.0 + halo * 2.2 + spikes * 1.5) + vec3(core * 0.8);
  col *= 1.0 + vFlag * 1.5;
  gl_FragColor = vec4(col * vFade, 1.0);
}`;

const MARK_VERT = /* glsl */ `
uniform float uSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
  gl_Position = projectionMatrix * mv;
}`;
const MARK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a;
  if (uKind < 0.5) {
    // seleção: anel duplo pulsante com marcas
    float ring = smoothstep(0.06, 0.0, abs(r - 0.78)) + 0.6 * smoothstep(0.04, 0.0, abs(r - (0.55 + 0.08 * sin(uTime * 3.0))));
    float ang = atan(c.y, c.x);
    float ticks = step(0.9, abs(sin(ang * 2.0 + uTime))) * smoothstep(0.1, 0.0, abs(r - 0.92));
    a = ring + ticks;
  } else {
    // atual: losango
    float dmd = abs(c.x) + abs(c.y);
    a = smoothstep(0.05, 0.0, abs(dmd - 0.36)) + smoothstep(0.2, 0.0, dmd) * 0.25;
  }
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

const LINE_VERT = /* glsl */ `
attribute float aT;
varying float vT;
void main() {
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uLen;
varying float vT;
void main() {
  float d = fract(vT * uLen / 14.0 - uTime * 0.8);
  float a = smoothstep(0.0, 0.1, d) * smoothstep(0.65, 0.5, d);
  gl_FragColor = vec4(uColor * (0.35 + a * 1.4), 1.0);
}`;

const ROUTE_VERT = /* glsl */ `
attribute float aT;
uniform vec3 uA;
uniform vec3 uB;
uniform float uPx;
varying float vT;
void main() {
  vT = aT;
  vec3 p = mix(uA, uB, aT);
  // arco suave acima do plano
  p.y += sin(aT * 3.14159) * length(uB - uA) * 0.08;
  gl_PointSize = uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const ROUTE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uLen;
varying float vT;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float g = exp(-dot(c, c) * 10.0);
  float d = fract(vT * uLen / 10.0 - uTime * 0.6);
  float a = 0.25 + 1.2 * smoothstep(0.0, 0.15, d) * smoothstep(0.7, 0.45, d);
  gl_FragColor = vec4(uColor * a * g, 1.0);
}`;

const VOL_VERT = /* glsl */ `
varying vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const VOL_FRAG = (galGlsl) => /* glsl */ `
precision highp float;
uniform vec3 uCamPos;
uniform mat4 uCamWorld;
uniform mat4 uProjInv;
varying vec2 vNdc;
${galGlsl}
void main() {
  vec4 v = uProjInv * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(mat3(uCamWorld) * (v.xyz / v.w));
  vec3 ro = uCamPos;
  float t0 = 0.0, t1 = 2e5;
  const float H = 4500.0, RC = 46000.0;
  if (abs(rd.y) > 1e-5) {
    float ta = (-H - ro.y) / rd.y, tb = (H - ro.y) / rd.y;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  } else if (abs(ro.y) > H) t1 = -1.0;
  // cilindro
  vec2 o = ro.xz, d = rd.xz;
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - RC * RC;
  float disc = b * b - a * c;
  if (disc < 0.0 || a < 1e-9) { if (c > 0.0) t1 = -1.0; }
  else {
    float s = sqrt(disc);
    t0 = max(t0, (-b - s) / a);
    t1 = min(t1, (-b + s) / a);
  }
  vec3 acc = vec3(0.0);
  if (t1 > t0) {
    float T = 1.0;
    float jit = fract(sin(dot(vNdc, vec2(12.9898, 78.233))) * 43758.5453);
    float t = t0;
    for (int i = 0; i < 110; i++) {
      vec3 p = ro + rd * t;
      float dt = clamp(abs(p.y) * 0.4 + (t - t0) * 0.012, 14.0, 1600.0);
      vec3 pp = ro + rd * (t + dt * jit);
      vec3 em; float dust;
      galSample(pp, em, dust);
      acc += T * em * dt * 0.0011;
      T *= exp(-dust * dt * 0.0016);
      t += dt;
      if (t > t1 || T < 0.02) break;
    }
  }
  acc *= 0.7;
  acc = acc / (1.0 + 0.45 * acc);
  gl_FragColor = vec4(acc, 1.0);
}`;

function mulberry(a) {
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  name: 'galaxymap',
  order: 66,

  init(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.built = false;
    this.focus = new THREE.Vector3();
    this.cam = { yaw: 0.6, pitch: 0.75, dist: 900 };
    this.camT = { ...this.cam };
    this.selected = null;
    this.hover = null;
    this.local = [];
    this.localCenter = null;
    this.time = 0;
    this.labels = [];
    const pp = ctx.shot?.preset?.params || {};
    this.shotOpen = !!pp.mapOpen;
    this.removePass = ctx.pipeline.addPass('afterCockpit', (c, target) => this.render(target), { order: 30, owner: 'galaxymap' });
    this.offs = [
      ctx.bus.on('system:enter', () => {
        if (this.built) this.onSystem();
      }),
    ];
    const self = this;
    this.api = ctx.provide('galaxymap', {
      get open() {
        return self.open;
      },
      show: () => this.setOpen(true),
      hide: () => this.setOpen(false),
      toggle: () => this.setOpen(!this.open),
      select: (i) => this.select(i),
    });
    if (this.shotOpen) this.setOpen(true);
  },

  get uni() {
    return this.ctx.services.universe;
  },
  get model() {
    return this.uni?.galaxy?.model || null;
  },

  // ─── construção da cena ────────────────────────────────────────────
  build() {
    const G = this.model;
    if (!G) return false;
    const ctx = this.ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 2e6);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const rnd = mulberry(G.gseed ^ 0x5eed);

    // nuvem da galáxia
    const n = ctx.quality?.level === 'low' ? 70000 : 150000;
    const cloud = G.sampleCloud(n, 1);
    const col = new Float32Array(cloud.count * 3);
    const size = new Float32Array(cloud.count);
    const PAL = [
      [1.0, 0.86, 0.72], // disco
      [0.62, 0.76, 1.0], // braço
      [1.0, 0.8, 0.52], // bojo
      [1.0, 0.42, 0.72], // berçário
    ];
    for (let i = 0; i < cloud.count; i++) {
      const k = cloud.kind[i];
      let c = PAL[k];
      const t = rnd();
      if (k === 1 && t < 0.25) c = [0.5, 0.85, 1.0];
      if (k === 3 && t < 0.4) c = [0.45, 0.7, 1.0];
      if (k === 0 && t < 0.3) c = [1.0, 0.7, 0.5];
      const b = (k === 2 ? 0.55 : k === 3 ? 1.8 : k === 1 ? 1.15 : 0.5) * (0.5 + rnd());
      col[i * 3] = c[0] * b;
      col[i * 3 + 1] = c[1] * b;
      col[i * 3 + 2] = c[2] * b;
      size[i] = (k === 2 ? 220 : 140) * (0.5 + rnd());
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cloud.pos), 3));
    cg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    cg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: { uScale: { value: 500 }, uGain: { value: 0.5 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const cloudPts = new THREE.Points(cg, this.cloudMat);
    cloudPts.frustumCulled = false;
    cloudPts.renderOrder = 1;
    this.world.add(cloudPts);

    // nebulosas e poeira (sprites) ao longo dos braços
    const mk = (count, filter, colors, sz, frag, blending, order, gain) => {
      const pos = [];
      const cc = [];
      const ss = [];
      const sd = [];
      for (let i = 0; i < cloud.count && pos.length / 3 < count; i += 7) {
        if (!filter(cloud.kind[i], i)) continue;
        pos.push(cloud.pos[i * 3], cloud.pos[i * 3 + 1] * 0.6, cloud.pos[i * 3 + 2]);
        const c = colors[Math.floor(rnd() * colors.length)];
        cc.push(...c);
        ss.push(sz[0] + (sz[1] - sz[0]) * rnd());
        sd.push(rnd() * 100);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(cc), 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(ss), 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(sd), 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: NEB_VERT,
        fragmentShader: frag,
        uniforms: { uScale: { value: 500 }, uGain: { value: gain } },
        blending: blending === 'multiply' ? THREE.CustomBlending : blending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      if (blending === 'multiply') {
        // destino × cor da fonte (escurece o que já foi desenhado)
        m.blendSrc = THREE.ZeroFactor;
        m.blendDst = THREE.SrcColorFactor;
        m.blendSrcAlpha = THREE.ZeroFactor;
        m.blendDstAlpha = THREE.OneFactor;
      }
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = order;
      this.world.add(p);
      return m;
    };
    this.nebMat = mk(
      1400,
      (k) => k === 3 || (k === 1 && rnd() < 0.15),
      [[0.22, 0.45, 1.0], [0.85, 0.25, 0.75], [0.25, 0.85, 0.95], [0.55, 0.3, 1.0]],
      [700, 2200],
      NEB_FRAG,
      THREE.AdditiveBlending,
      2,
      0.07,
    );
    this.dustMat = null;

    this.buildVolume();

    // núcleo
    const coreTex = (() => {
      const S = 256;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,250,235,1)');
      gr.addColorStop(0.12, 'rgba(255,225,170,0.75)');
      gr.addColorStop(0.4, 'rgba(255,170,90,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.coreTex = coreTex;
    const coreMat = new THREE.SpriteMaterial({ map: coreTex, color: new THREE.Color(1.3, 1.1, 0.85), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
    const core = new THREE.Sprite(coreMat);
    core.scale.set(14000, 14000, 1);
    core.renderOrder = 4;
    this.world.add(core);
    const core2 = new THREE.Sprite(coreMat.clone());
    core2.material.color.setRGB(2.6, 2.3, 1.9);
    core2.scale.set(4200, 4200, 1);
    core2.renderOrder = 4;
    this.world.add(core2);

    // estrelas de fundo (fora da galáxia)
    {
      const N = 2500;
      const p = new Float32Array(N * 3);
      const c = new Float32Array(N * 3);
      const s = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, q = Math.sqrt(1 - z * z);
        p.set([q * Math.cos(a) * 6e5, z * 6e5, q * Math.sin(a) * 6e5], i * 3);
        const b = 0.15 + 0.5 * rnd() ** 3;
        c.set([b, b, b * 1.1], i * 3);
        s[i] = 0.35 + rnd() * 0.4;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
      g.setAttribute('aFlag', new THREE.BufferAttribute(new Float32Array(N), 1));
      const m = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uPx: { value: 3 }, uScale: { value: 500 }, uFocus: { value: new THREE.Vector3() }, uRadius: { value: 0 } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
      const bg = new THREE.Points(g, m);
      bg.frustumCulled = false;
      bg.renderOrder = 0;
      this.bg = bg;
      this.scene.add(bg);
    }

    // sistemas locais (pontos clicáveis)
    this.localGeo = new THREE.BufferGeometry();
    this.localMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uPx: { value: 9 }, uScale: { value: 500 }, uFocus: { value: new THREE.Vector3() }, uRadius: { value: LOCAL_R } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.localPts = new THREE.Points(this.localGeo, this.localMat);
    this.localPts.frustumCulled = false;
    this.localPts.renderOrder = 6;
    this.world.add(this.localPts);

    // marcadores
    const mark = (kind, color, size) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const m = new THREE.ShaderMaterial({
        vertexShader: MARK_VERT,
        fragmentShader: MARK_FRAG,
        uniforms: { uSize: { value: size }, uColor: { value: new THREE.Vector3(...color) }, uTime: { value: 0 }, uKind: { value: kind } },
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = 8;
      this.world.add(p);
      return p;
    };
    this.selMark = mark(0, [1.6, 1.25, 0.5], 46);
    this.curMark = mark(1, [0.4, 1.4, 1.6], 30);
    // rota
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    lg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 1]), 1));
    this.routeMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: { uColor: { value: new THREE.Vector3(1.4, 1.1, 0.45) }, uTime: { value: 0 }, uLen: { value: 100 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    {
      const N = 400;
      const t = new Float32Array(N);
      for (let i = 0; i < N; i++) t[i] = i / (N - 1);
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      lg.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      this.routeMat.vertexShader = ROUTE_VERT;
      this.routeMat.fragmentShader = ROUTE_FRAG;
      this.routeMat.uniforms.uA = { value: new THREE.Vector3() };
      this.routeMat.uniforms.uB = { value: new THREE.Vector3() };
      this.routeMat.uniforms.uPx = { value: 4 };
    }
    this.route = new THREE.Points(lg, this.routeMat);
    this.route.frustumCulled = false;
    this.route.renderOrder = 7;
    this.world.add(this.route);
    // alcance do salto (círculo no plano galáctico)
    {
      const N = 160;
      const p = new Float32Array((N + 1) * 3);
      const t = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        p.set([Math.cos(a) * WARP_RANGE, 0, Math.sin(a) * WARP_RANGE], i * 3);
        t[i] = i / N;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: LINE_VERT,
        fragmentShader: LINE_FRAG,
        uniforms: { uColor: { value: new THREE.Vector3(0.18, 0.45, 0.6) }, uTime: { value: 0 }, uLen: { value: Math.PI * 2 * WARP_RANGE * 0.25 } },
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      this.rangeRing = new THREE.LineLoop(g, m);
      this.rangeRing.frustumCulled = false;
      this.rangeRing.renderOrder = 5;
      this.world.add(this.rangeRing);
      this.rangeMat = m;
    }
    this.buildUI();
    this.built = true;
    this.onSystem();
    return true;
  },

  /** Galáxia volumétrica (ray-marching do modelo publicado pelo universe), meia resolução. */
  buildVolume() {
    const gal = this.uni.galaxy;
    const uniforms = {
      uCamPos: { value: new THREE.Vector3() },
      uCamWorld: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uJit: { value: 0 },
    };
    for (const [k, v] of Object.entries(gal.glslUniforms || {})) uniforms[k] = { value: v };
    this.volMat = new THREE.ShaderMaterial({
      vertexShader: VOL_VERT,
      fragmentShader: VOL_FRAG(gal.glsl),
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.volRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.volRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.volScene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.volMat);
    q.frustumCulled = false;
    this.volScene.add(q);
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tVol; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tVol, vUv).rgb, 1.0); }',
      uniforms: { tVol: { value: this.volRT.texture } },
      depthTest: false,
      depthWrite: false,
    });
    this.compScene = new THREE.Scene();
    const q2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    q2.frustumCulled = false;
    this.compScene.add(q2);
    this.volKey = '';
  },

  /** Sistema atual mudou: recentra o foco e os marcadores. */
  onSystem() {
    const sys = this.uni?.currentSystem;
    if (!sys) return;
    const p = sys.galacticPosition;
    this.current = { index: sys.index, pos: p };
    this.focus.set(p[0], p[1], p[2]);
    this.localCenter = null;
    this.selected = null;
    this.refreshLocal();
    this.updateInfo();
  },

  refreshLocal() {
    const G = this.model;
    // longe (visão geral): sistemas locais ficam em volta do sistema atual
    const f = this.cam.dist < 3500 || !this.current ? this.focus : new THREE.Vector3(...this.current.pos);
    if (this.localCenter && this.localCenter.distanceTo(f) < 90) return;
    this.localCenter = f.clone();
    const list = G.systemsNear([f.x, f.y, f.z], LOCAL_R, 3500);
    const N = list.length;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const flag = new Float32Array(N);
    this.local = list.map((e, i) => {
      const st = G.star(e.index);
      pos.set(e.pos, i * 3);
      const c = CLASS_COLOR[st.cls];
      col.set(c, i * 3);
      size[i] = CLASS_SIZE[st.cls] * (st.binary ? 1.15 : 1);
      return { index: e.index, pos: e.pos, star: st };
    });
    this.localFlag = flag;
    const g = this.localGeo;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aFlag', new THREE.BufferAttribute(flag, 1));
    g.computeBoundingSphere();
  },

  select(index) {
    const G = this.model;
    if (index == null || !G) {
      this.selected = null;
      this.updateInfo();
      return;
    }
    index = G.resolve(index);
    const st = G.star(index);
    this.selected = { index, pos: st.pos, star: st, info: this.uni.systemInfo(index) };
    this.updateInfo();
  },

  /** Escolha automática para a vitrine: vizinho notável a 150–400 al. */
  autoSelect() {
    const cand = this.local.filter((e) => {
      const d = Math.hypot(e.pos[0] - this.current.pos[0], e.pos[1] - this.current.pos[1], e.pos[2] - this.current.pos[2]);
      return d > 120 && d < 300 && e.index !== this.current.index;
    });
    const score = (e) => ({ O: 5, B: 4, A: 3, F: 2, G: 2, K: 1, M: 0 })[e.star.cls] + (e.star.binary ? 1.5 : 0);
    cand.sort((a, b) => score(b) - score(a));
    if (cand[0]) this.select(cand[0].index);
  },

  // ─── interface (DOM) ────────────────────────────────────────────────
  buildUI() {
    const ctx = this.ctx;
    const root = document.createElement('div');
    root.className = 'gmap';
    root.style.cssText = 'position:absolute;inset:0;display:none;pointer-events:none;font-family:system-ui,"Segoe UI",sans-serif;color:#dfe9ff';
    root.innerHTML = `
      <style>
        .gmap .panel{position:absolute;right:28px;top:50%;transform:translateY(-50%);width:300px;padding:18px 20px;background:linear-gradient(180deg,rgba(10,18,40,.72),rgba(6,10,24,.6));border:1px solid rgba(140,190,255,.28);border-radius:4px;backdrop-filter:blur(6px);box-shadow:0 0 40px rgba(60,120,255,.15)}
        .gmap h2{margin:0 0 2px;font-size:22px;letter-spacing:.12em;font-weight:600;text-transform:uppercase}
        .gmap .sub{font-size:11px;letter-spacing:.28em;text-transform:uppercase;opacity:.65;margin-bottom:12px}
        .gmap .row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid rgba(140,190,255,.12)}
        .gmap .row b{font-weight:600;color:#fff}
        .gmap .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;box-shadow:0 0 8px currentColor}
        .gmap .pl{font-size:12px;opacity:.85;line-height:1.6;margin-top:8px}
        .gmap .btn{margin-top:14px;width:100%;padding:10px 0;font:600 13px system-ui;letter-spacing:.3em;text-transform:uppercase;color:#0b1020;background:linear-gradient(90deg,#ffd27a,#ffb347);border:0;border-radius:2px;cursor:pointer;pointer-events:auto}
        .gmap .btn[disabled]{background:#3a4258;color:#8b93a8;cursor:default}
        .gmap .top{position:absolute;left:28px;top:24px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;opacity:.8}
        .gmap .top b{display:block;font-size:20px;letter-spacing:.16em;opacity:1;margin-top:4px}
        .gmap .hint{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);font-size:11px;letter-spacing:.2em;opacity:.55;text-transform:uppercase;white-space:nowrap}
        .gmap .lbl{position:absolute;font-size:10px;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap;transform:translate(10px,-50%);text-shadow:0 0 6px #000;opacity:.8}
        .gmap .lbl.sel{font-size:12px;color:#ffd894;opacity:1}
        .gmap .lbl.cur{color:#8ff0ff;opacity:1}
      </style>
      <div class="top"></div>
      <div class="panel"></div>
      <div class="labels"></div>
      <div class="hint">arrastar: girar · roda: zoom · botão direito / WASD: mover · clique: selecionar · enter: saltar · M: fechar</div>`;
    ctx.ui.appendChild(root);
    this.ui = { root, top: root.querySelector('.top'), panel: root.querySelector('.panel'), labels: root.querySelector('.labels') };
    // eventos do mouse (só com o mapa aberto)
    const cv = ctx.canvas;
    let drag = null;
    const onDown = (e) => {
      if (!this.open) return;
      drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0 };
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!this.open) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.b === 2 || e.shiftKey) this.pan(-dx, -dy);
      else {
        this.camT.yaw -= dx * 0.005;
        this.camT.pitch = Math.max(-1.45, Math.min(1.45, this.camT.pitch + dy * 0.005));
      }
    };
    const onUp = (e) => {
      if (!this.open || !drag) return;
      if (drag.moved < 5 && drag.b === 0) this.pick(e.clientX, e.clientY);
      drag = null;
    };
    const onWheel = (e) => {
      if (!this.open) return;
      e.preventDefault();
      this.camT.dist = Math.max(25, Math.min(140000, this.camT.dist * Math.exp(e.deltaY * 0.0012)));
    };
    const onCtx = (e) => {
      if (this.open) e.preventDefault();
    };
    cv.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', onCtx);
    this.unlisten = () => {
      cv.removeEventListener('pointerdown', onDown);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('contextmenu', onCtx);
    };
  },

  updateInfo() {
    if (!this.ui) return;
    const uni = this.uni;
    const gal = uni.galaxy;
    const sys = uni.currentSystem;
    const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
    this.ui.top.innerHTML = `galáxia ${gal.name} · ~${fmt(gal.systemCount / 1e6)} milhões de sistemas<b>${sys.name}</b>`;
    const s = this.selected;
    if (!s) {
      this.ui.panel.innerHTML = `<h2>${sys.name}</h2><div class="sub">sistema atual · classe ${sys.class}</div><div class="pl">${sys.planets.map((p) => `${p.name} — ${BIOME_PT[p.biome] || p.biome}`).join('<br>')}</div><div class="row"><span>alcance do salto</span><b>${WARP_RANGE} al</b></div>`;
      return;
    }
    const inf = s.info;
    const c = CLASS_COLOR[inf.class].map((v) => Math.round(Math.min(1, v) * 255)).join(',');
    const d = inf.distance;
    const inRange = d <= WARP_RANGE && !inf.current;
    const jumps = Math.max(1, Math.ceil(d / WARP_RANGE));
    this.ui.panel.innerHTML = `
      <h2>${inf.name}</h2>
      <div class="sub"><span class="dot" style="color:rgb(${c});background:rgb(${c})"></span>classe ${inf.class}${inf.binary ? ' · binária' : ''} · ${fmt(inf.temperature)} K</div>
      <div class="row"><span>distância</span><b>${d.toFixed(1)} al</b></div>
      <div class="row"><span>saltos</span><b>${inf.current ? '—' : jumps}</b></div>
      <div class="row"><span>planetas</span><b>${inf.planets.length}</b></div>
      <div class="row"><span>cinturão / estação</span><b>${inf.belt ? 'sim' : 'não'} / ${inf.station ? 'sim' : 'não'}</b></div>
      <div class="pl">${inf.planets.map((p) => `${p.name} — ${BIOME_PT[p.biome] || p.biome}${p.rings ? ' · anéis' : ''}${p.moons ? ` · ${p.moons} lua${p.moons > 1 ? 's' : ''}` : ''}`).join('<br>')}</div>
      <button class="btn" ${inRange ? '' : 'disabled'}>${inf.current ? 'você está aqui' : inRange ? 'saltar' : 'fora de alcance'}</button>`;
    const btn = this.ui.panel.querySelector('.btn');
    btn?.addEventListener('click', () => this.jump());
  },

  setOpen(on) {
    const ctx = this.ctx;
    if (on === this.open) return;
    if (on && !this.built && !this.build()) return;
    this.open = on;
    this.ui.root.style.display = on ? 'block' : 'none';
    const p = ctx.player;
    const r = ctx.services.render;
    if (on) {
      this.prev = { move: p.moveEnabled, look: p.lookEnabled, auto: r?.autoExposure, exp: r?.exposure };
      if (!ctx.shot) {
        p.moveEnabled = false;
        p.lookEnabled = false;
        ctx.input.exitLock?.();
        ctx.input.wantsLock = false;
      }
      if (r && !ctx.shot) {
        r.autoExposure = false;
        r.setExposure?.(1.0);
      }
      this.onSystem();
      this.cam = { ...this.camT };
    } else if (this.prev) {
      p.moveEnabled = this.prev.move;
      p.lookEnabled = this.prev.look;
      if (!ctx.shot) ctx.input.wantsLock = true;
      if (r && this.prev.auto != null) {
        r.autoExposure = this.prev.auto;
        if (this.prev.exp) r.setExposure?.(this.prev.exp);
      }
    }
    ctx.bus.emit('galaxymap:toggle', { open: on });
  },

  pan(dx, dy) {
    const k = this.cam.dist * 0.0016;
    const fw = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const rt = new THREE.Vector3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
    this.focus.addScaledVector(rt, dx * k).addScaledVector(fw, -dy * k);
  },

  pick(x, y) {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const sx = ((x - rect.left) / rect.width) * 2 - 1;
    const sy = -((y - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3();
    let best = null;
    let bd = (16 / rect.width) * 2;
    bd *= bd;
    for (const e of this.local) {
      v.set(e.pos[0] - this.focus.x, e.pos[1] - this.focus.y, e.pos[2] - this.focus.z).project(this.camera);
      if (v.z > 1) continue;
      const dd = (v.x - sx) ** 2 + (((v.y - sy) * rect.height) / rect.width) ** 2;
      if (dd < bd) {
        bd = dd;
        best = e;
      }
    }
    this.select(best ? best.index : null);
  },

  jump() {
    const s = this.selected;
    if (!s || s.info.current || s.info.distance > WARP_RANGE) return;
    this.setOpen(false);
    this.uni.warpTo(s.index, 0, { tunnel: true });
  },

  // ─── laço ───────────────────────────────────────────────────────────
  update(dt, ctx) {
    const input = ctx.input;
    if (this.shotOpen) return;
    if (input.pressed('map')) {
      input.consume?.('map');
      if (!this.uni?.warping) this.setOpen(!this.open);
    }
    if (!this.open) return;
    if (input.pressed('pause')) {
      input.consume?.('pause');
      this.setOpen(false);
      return;
    }
    if (input.down('Enter') || input.pressed('interact')) this.jump();
    if (input.down('KeyC') && this.selected) this.focus.set(...this.selected.pos);
    const sp = 120 * dt * 60;
    if (input.action('forward')) this.pan(0, -sp * 0.06);
    if (input.action('back')) this.pan(0, sp * 0.06);
    if (input.action('left')) this.pan(-sp * 0.06, 0);
    if (input.action('right')) this.pan(sp * 0.06, 0);
  },

  frame(dt, ctx) {
    if (!this.open) return;
    if (!this.built) return;
    if (this.shotOpen && !this._shotInit) {
      this._shotInit = true;
      const pp = ctx.shot.preset.params;
      if (pp.mapCam) Object.assign(this.camT, pp.mapCam);
      if (pp.mapCam?.yaw === 'core' || typeof pp.mapCam?.coreYaw === 'number') {
        // câmera do lado oposto ao núcleo: o núcleo fica atrás do foco
        const f = this.current.pos;
        this.camT.yaw = Math.atan2(f[0], f[2]) + (pp.mapCam.coreYaw || 0);
      }
      this.cam = { ...this.camT };
      if (pp.mapSelect === 'auto') this.autoSelect();
      else if (pp.mapSelect != null) this.select(pp.mapSelect);
      if (pp.mapFocusMid && this.selected) {
        const a = this.current.pos, b = this.selected.pos;
        this.focus.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      }
      if (pp.mapFocusToward) {
        // desloca o foco em direção ao núcleo (fração da distância)
        this.focus.multiplyScalar(1 - pp.mapFocusToward);
        this.localCenter = null;
        this.refreshLocal();
      }
      if (pp.mapShift) {
        this.cam = { ...this.camT };
        this.pan(pp.mapShift[0], pp.mapShift[1]);
      }
    }
    this.time += ctx.time.frozen ? 0 : dt;
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ['yaw', 'pitch', 'dist']) this.cam[key] += (this.camT[key] - this.cam[key]) * (ctx.shot ? 1 : k);
    this.refreshLocal();
  },

  render(target) {
    if (!this.open || !this.built) return;
    const ctx = this.ctx;
    const r = ctx.renderer;
    const W = target.width, H = target.height;
    const cam = this.camera;
    cam.aspect = W / Math.max(1, H);
    const c = this.cam;
    cam.position.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    cam.near = Math.max(0.5, c.dist * 0.002);
    cam.far = 2e6;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.world.position.set(-this.focus.x, -this.focus.y, -this.focus.z);
    this.world.updateMatrixWorld(true);
    this.bg.position.copy(cam.position);
    const scale = H / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.cloudMat.uniforms.uScale.value = scale;
    this.nebMat.uniforms.uScale.value = scale;
    this.localMat.uniforms.uPx.value = Math.max(4, H / 110);
    if (this.localCenter) this.localMat.uniforms.uFocus.value.copy(this.localCenter);
    // marcadores
    const t = this.time;
    const setP = (pts, p) => {
      const a = pts.geometry.attributes.position;
      a.setXYZ(0, p[0], p[1], p[2]);
      a.needsUpdate = true;
    };
    setP(this.curMark, this.current.pos);
    this.curMark.material.uniforms.uSize.value = Math.max(22, H / 26);
    this.rangeRing.position.set(this.current.pos[0], this.current.pos[1], this.current.pos[2]);
    this.rangeMat.uniforms.uTime.value = t * 0.2;
    const s = this.selected;
    this.selMark.visible = !!s;
    this.route.visible = !!s && !s.info.current;
    if (s) {
      setP(this.selMark, s.pos);
      this.selMark.material.uniforms.uTime.value = t;
      this.selMark.material.uniforms.uSize.value = Math.max(34, H / 15);
      this.routeMat.uniforms.uA.value.set(...this.current.pos);
      this.routeMat.uniforms.uB.value.set(...s.pos);
      this.routeMat.uniforms.uPx.value = Math.max(3, H / 180);
      this.routeMat.uniforms.uTime.value = t;
      this.routeMat.uniforms.uLen.value = s.info.distance;
    }
    // render
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    // volume (re-renderizado só quando a câmera muda)
    const vw = Math.max(4, W >> 1), vh = Math.max(4, H >> 1);
    if (this.volRT.width !== vw || this.volRT.height !== vh) {
      this.volRT.setSize(vw, vh);
      this.volKey = '';
    }
    const vu = this.volMat.uniforms;
    vu.uCamPos.value.copy(cam.position).add(this.focus);
    vu.uCamWorld.value.copy(cam.matrixWorld);
    vu.uProjInv.value.copy(cam.projectionMatrixInverse);
    const key = `${vu.uCamPos.value.toArray().map((v) => v.toFixed(1))}|${cam.quaternion.toArray().map((v) => v.toFixed(4))}|${vw}`;
    r.autoClear = false;
    if (key !== this.volKey) {
      this.volKey = key;
      r.setRenderTarget(this.volRT);
      r.render(this.volScene, this.orthoCam);
    }
    r.setRenderTarget(target);
    r.setClearColor(0x010208, 1);
    r.clear(true, true, false);
    r.render(this.compScene, this.orthoCam);
    r.render(this.scene, cam);
    r.autoClear = prevAuto;
    r.setClearColor(prevClear, prevAlpha);
    this.updateLabels(W, H);
  },

  /** Rótulos DOM: atual, selecionado e os vizinhos mais próximos do foco. */
  updateLabels() {
    const box = this.ui.labels;
    const rect = this.ctx.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const items = [];
    if (this.current) items.push({ pos: this.current.pos, name: this.uni.currentSystem.name, cls: 'cur' });
    if (this.selected && !this.selected.info.current) items.push({ pos: this.selected.pos, name: this.selected.info.name, cls: 'sel' });
    if (this.cam.dist < 2500) {
      for (const e of this.local.slice(1, 10)) {
        if (this.selected && e.index === this.selected.index) continue;
        items.push({ pos: e.pos, name: e.star.name, cls: '' });
      }
    }
    while (box.children.length < items.length) box.appendChild(document.createElement('div'));
    const placed = [];
    [...box.children].forEach((el, i) => {
      const it = items[i];
      if (!it) {
        el.style.display = 'none';
        return;
      }
      v.set(it.pos[0] - this.focus.x, it.pos[1] - this.focus.y, it.pos[2] - this.focus.z).project(this.camera);
      const px = ((v.x + 1) / 2) * rect.width;
      let py = ((1 - v.y) / 2) * rect.height;
      const hit = () => placed.some((q) => Math.abs(q[0] - px) < 110 && Math.abs(q[1] - py) < 15);
      let clash = hit();
      if (clash && it.cls) {
        for (let k = 0; k < 3 && clash; k++) {
          py -= 16;
          clash = hit();
        }
        clash = false;
      }
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (clash && !it.cls)) {
        el.style.display = 'none';
        return;
      }
      placed.push([px, py]);
      el.style.display = 'block';
      el.className = `lbl ${it.cls}`;
      el.textContent = it.name;
      el.style.left = `${px}px`;
      el.style.top = `${py}px`;
    });
  },

  dispose() {
    for (const off of this.offs || []) off();
    this.removePass?.();
    this.unlisten?.();
    this.ui?.root.remove();
    this.scene?.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.coreTex?.dispose();
    this.volRT?.dispose();
    this.volMat?.dispose();
    this.compMat?.dispose();
  },
};
