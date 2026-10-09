/**
 * OCEANO ESFÉRICO no nível do mar — malha e material.
 *
 * Malha: UMA calota centrada no ponto sob a câmera, anéis em progressão
 * geométrica até além do horizonte (1 draw call do pé do jogador à órbita).
 * Vértices relativos a uma âncora flutuante (R·(dir − u)), refeita quando a
 * câmera anda/sobe o bastante.
 *
 * Material (ShaderMaterial próprio; lê cópias da cor e da profundidade do
 * mundo feitas logo antes — ver index.js):
 *   - ondas de Gerstner deslocam os vértices perto da câmera; as normais
 *     por pixel somam Gerstner + 4 camadas de detalhe (triplanar periódico),
 *     com filtragem por distância (a variância perdida vira rugosidade);
 *   - reflexo: céu do IBL (PMREM do `sky`) + SSR barato (marcha em espaço de
 *     tela contra a profundidade do mundo) com Fresnel de Schlick;
 *   - refração: cor do fundo deslocada pela normal, com absorção espectral
 *     (Beer–Lambert) e espalhamento de volume pela cor do bioma;
 *   - espuma na costa (pela espessura de água) e nas cristas (jacobiano);
 *   - cáusticas no leito (laplaciano das ondulações), sol especular GGX;
 *   - por baixo (câmera submersa): janela de Snell + reflexão interna total.
 */
import * as THREE from 'three';
import { DETAIL_BASE, DETAIL_LAYERS, GERSTNER_COUNT } from './waves.js';
import { DEPTH_GLSL } from './glsl.js';

const RINGS = 96;
const SEGS = 144;

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#define NW ${GERSTNER_COUNT}
uniform vec3 uWaveDir[NW];
uniform vec4 uWave[NW];      // k, amp, omega(n/u), Q
uniform float uPhase0[NW];
uniform float uRingQ;        // razão entre anéis − 1 (tamanho relativo da célula)
uniform vec3 uCenterR;       // centro do planeta em espaço de render
varying vec3 vP;             // posição de render deslocada
varying vec3 vBase;          // posição de render sem deslocamento
varying vec3 vUp;
varying float vViewZ;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 up = normalize(p - uCenterR);
  float dist = length(p);
  vec3 disp = vec3(0.0);
  for (int i = 0; i < NW; i++) {
    float k = uWave[i].x;
    float a = uWave[i].y;
    float lambda = 6.2831853 / k;
    // a malha só representa ondas maiores que ~4 células
    float cell = max(dist, 1.0) * uRingQ;
    a *= 1.0 - smoothstep(lambda * 0.18, lambda * 0.3, cell);
    if (a <= 0.0) continue;
    vec3 D = uWaveDir[i];
    vec3 Dt = normalize(D - dot(D, up) * up + 1e-6);
    float ph = k * dot(D, p) + uPhase0[i];
    disp += up * (a * sin(ph)) + Dt * (uWave[i].w * a * cos(ph));
  }
  vBase = p;
  p += disp;
  vP = p;
  vUp = up;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <cube_uv_reflection_fragment>
${DEPTH_GLSL}
#define NW ${GERSTNER_COUNT}
uniform vec3 uWaveDir[NW];
uniform vec4 uWave[NW];
uniform float uPhase0[NW];
uniform sampler2D tDetail;
uniform vec4 uLayer[4];       // 1/T, A, scrollU, scrollV
uniform vec3 uCamMod;         // posição da câmera mod ${DETAIL_BASE} m (double na CPU)
uniform float uGradScale;
uniform sampler2D tSceneColor;
uniform sampler2D tSceneZ;    // distância no eixo (m), céu = 1e12
uniform float uHasScene;
uniform vec2 uRes;
uniform mat4 uProj;
uniform float uPixAngle;      // rad por pixel
uniform vec3 uSunDir;
uniform vec3 uSunE;           // irradiância do sol (cor × intensidade)
uniform vec3 uSkyFallback;    // radiância do céu sem IBL
uniform sampler2D envMap;
uniform float uHasEnv;
uniform float uEnvGain;
uniform vec3 uSigma;          // extinção (1/m)
uniform vec3 uScatter;        // albedo de volume (cor do bioma)
uniform vec3 uEmissive;       // brilho próprio (mares tóxicos/radioativos)
uniform float uTime;
uniform float uSSR;           // 0/1
uniform int uSSRSteps;
uniform float uUnder;         // câmera submersa
uniform vec3 uFogInscat;      // luz espalhada na água à profundidade da câmera
uniform float uFoamAmt;
uniform float uCaustics;
varying vec3 vP;
varying vec3 vBase;
varying vec3 vUp;
varying float vViewZ;

vec3 skyRad(vec3 dir, float rough) {
#ifdef ENVMAP_TYPE_CUBE_UV
  if (uHasEnv > 0.5) return textureCubeUV(envMap, dir, rough).rgb * uEnvGain;
#endif
  float h = clamp(dir.y, 0.0, 1.0);
  return uSkyFallback * (0.6 + 0.4 * h);
}

// gradiente de altura de uma camada de detalhe (triplanar periódico)
vec3 detailGrad(vec3 wP, vec3 up, vec3 bw, vec4 L, out float h, out float lap) {
  vec3 g = vec3(0.0);
  h = 0.0; lap = 0.0;
  vec2 sc = L.zw;
  if (bw.x > 0.02) {
    vec4 t = texture2D(tDetail, wP.zy * L.x + sc);
    g += vec3(0.0, t.y, t.x) * bw.x; h += t.z * bw.x; lap += t.w * bw.x;
  }
  if (bw.y > 0.02) {
    vec4 t = texture2D(tDetail, wP.xz * L.x + sc);
    g += vec3(t.x, 0.0, t.y) * bw.y; h += t.z * bw.y; lap += t.w * bw.y;
  }
  if (bw.z > 0.02) {
    vec4 t = texture2D(tDetail, wP.xy * L.x + sc);
    g += vec3(t.x, t.y, 0.0) * bw.z; h += t.z * bw.z; lap += t.w * bw.z;
  }
  return g * L.x * L.y;
}

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vUp);
  float dist = length(vP);
  vec3 V = -vP / dist;
  float foot = dist * uPixAngle; // tamanho do pixel no chão (m)

  // ── Gerstner (normal analítica + jacobiano para a espuma de crista) ──
  vec3 gsum = vec3(0.0);
  float jac = 1.0;
  float lostVar = 0.0;
  for (int i = 0; i < NW; i++) {
    float k = uWave[i].x;
    float a = uWave[i].y;
    float lambda = 6.2831853 / k;
    float f = 1.0 - smoothstep(lambda * 0.08, lambda * 0.25, foot);
    lostVar += (1.0 - f) * (k * a) * (k * a) * 0.5;
    a *= f;
    vec3 D = uWaveDir[i];
    vec3 Dt = normalize(D - dot(D, up) * up + 1e-6);
    float ph = k * dot(D, vBase) + uPhase0[i];
    gsum += Dt * (k * a * cos(ph));
    jac -= uWave[i].w * k * a * sin(ph);
  }

  // ── detalhe (ondulações) ──
  vec3 wP = vBase + uCamMod;
  vec3 bw = pow(abs(up), vec3(6.0));
  bw /= (bw.x + bw.y + bw.z);
  vec3 dg = vec3(0.0);
  float hA = 0.0, lapA = 0.0, hB = 0.0, lapB = 0.0, hC = 0.0, hh, ll;
  for (int i = 0; i < 4; i++) {
    vec4 L = uLayer[i];
    float T = 1.0 / L.x;
    float f = 1.0 - smoothstep(T * 0.02, T * 0.12, foot);
    float slope = L.y * L.x * uGradScale;
    lostVar += (1.0 - f) * slope * slope * 0.25;
    if (f <= 0.0) continue;
    vec3 g = detailGrad(wP, up, bw, L, hh, ll);
    dg += g * f;
    if (i == 1) { hA = hh; lapA = ll; }
    if (i == 2) { hB = hh; lapB = ll; }
    if (i == 3) { hC = hh; }
  }
  vec3 grad = gsum + dg;
  grad -= up * dot(grad, up);
  vec3 N = normalize(up - grad);
  // mais calmo muito longe (variância perdida vira rugosidade)
  float rough = clamp(0.035 + sqrt(lostVar) * 0.9, 0.035, 0.42);

  bool below = uUnder > 0.5;
  vec3 Nf = below ? -N : N;
  float NoV = max(dot(Nf, V), 1e-3);
  vec2 suv = gl_FragCoord.xy / uRes;

  // ── céu / sol ──
  vec3 L = normalize(uSunDir);
  vec3 ambUp = skyRad(up, 1.0);          // radiância difusa do céu
  float sunUp = smoothstep(-0.05, 0.08, dot(L, up));

  if (below) {
    // por baixo: janela de Snell (céu transmitido) ou reflexão interna total
    vec3 T = refract(-V, Nf, 1.333);
    vec3 col;
    float fr = 1.0;
    if (dot(T, T) > 0.0) {
      float c = max(dot(V, Nf), 0.0);
      fr = 0.02 + 0.98 * pow(1.0 - c, 5.0);
      col = skyRad(T, 0.0) * (1.0 - fr);
    } else col = vec3(0.0);
    // reflexão interna total: a própria água (mesma luz da névoa submersa)
    col += uFogInscat * fr;
    // névoa da coluna d'água até a superfície (igual à passada de névoa)
    vec3 tr = exp(-(uSigma + 0.012) * min(dist, 1e5));
    col = col * tr + uFogInscat * (1.0 - tr);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  // ── profundidade do mundo atrás da água ──
  float sceneZ = texture2D(tSceneZ, suv).r;
  float waterZ = max(vViewZ, 1e-3);
  float rayK = dist / waterZ;
  float thick = max(sceneZ - waterZ, 0.0) * rayK;           // ao longo do raio
  float depthV = thick * max(dot(V, up), 0.05);             // vertical aprox.

  // ── refração ──
  vec3 Nv = (viewMatrix * vec4(N - up, 0.0)).xyz;
  vec2 ruv = suv + Nv.xy * clamp(thick * 0.6, 0.0, 1.0) * 0.06 / max(1.0, dist * 0.02);
  float rZ = texture2D(tSceneZ, ruv).r;
  if (rZ < waterZ) { ruv = suv; rZ = sceneZ; }
  float rThick = max(rZ - waterZ, 0.0) * rayK;
  vec3 bed = texture2D(tSceneColor, ruv).rgb;
  // cáusticas no leito (luz focada pelas ondulações), somem com a profundidade
  if (uCaustics > 0.0 && rZ < 1e11) {
    vec3 bp = (V * -1.0) * (rZ * rayK) + uCamMod;    // ponto do leito (mod)
    vec3 bpL = bp;
    float hc, lc1, lc2;
    vec3 g1 = detailGrad(bpL * 1.0 + vec3(uTime * 0.11, 0.0, uTime * 0.07), up, bw, uLayer[1], hc, lc1);
    vec3 g2 = detailGrad(bpL * 1.7 - vec3(uTime * 0.05, uTime * 0.04, 0.0), up, bw, uLayer[2], hc, lc2);
    float focus = max(0.0, -(lc1 * 0.8 + lc2 * 0.6));
    float cz = rThick * max(dot(V, up), 0.05);
    float caus = pow(focus, 2.0) * 4.5 * smoothstep(0.05, 0.6, cz) * exp(-cz * 0.18);
    caus *= 1.0 - smoothstep(60.0, 220.0, dist);
    bed += bed * caus * uCaustics * sunUp * max(dot(L, up), 0.0) * 1.4;
  }
  vec3 tr = exp(-uSigma * rThick);
  vec3 inscat = uScatter * (uSunE * sunUp * max(dot(L, up), 0.0) * 0.35 / PI + ambUp * 0.9);
  vec3 refr = uHasScene > 0.5 ? bed * tr + inscat * (1.0 - tr) : inscat;
  refr += uEmissive * (1.0 - tr.g * 0.5);

  // ── reflexo ──
  vec3 R = reflect(-V, N);
  // não refletir abaixo do horizonte local (sem auto-reflexo da água)
  float rup = dot(R, up);
  if (rup < 0.02) R = normalize(R + up * (0.02 - rup));
  vec3 refl = skyRad(R, rough * 0.8);
  if (uSSR > 0.5 && uHasScene > 0.5 && dist < 6000.0) {
    float t = 0.6 + dist * 0.015;
    vec3 hit = vec3(0.0);
    float hitW = 0.0;
    for (int i = 0; i < 24; i++) {
      if (i >= uSSRSteps) break;
      vec3 q = vP + R * t;
      vec4 c = uProj * (viewMatrix * vec4(q, 1.0));
      if (c.w <= 0.0) break;
      vec2 quv = c.xy / c.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.y < 0.0 || quv.x > 1.0 || quv.y > 1.0) break;
      float qz = -(viewMatrix * vec4(q, 1.0)).z;
      float sz = texture2D(tSceneZ, quv).r;
      if (qz > sz && qz - sz < t * 0.35 + 0.5) {
        vec2 e = min(quv, 1.0 - quv);
        float edge = smoothstep(0.0, 0.08, min(e.x, e.y));
        hit = texture2D(tSceneColor, quv).rgb;
        hitW = edge * (1.0 - smoothstep(0.6, 1.0, float(i) / float(uSSRSteps)));
        break;
      }
      t *= 1.32;
    }
    refl = mix(refl, hit, hitW);
  }
  float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  F = mix(F, 0.06, smoothstep(0.1, 0.4, rough) * 0.5);

  // ── sol especular (GGX) ──
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float a = rough * rough;
  float k = a * 0.5;
  float G = NoL / (NoL * (1.0 - k) + k) * NoV / (NoV * (1.0 - k) + k);
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = uSunE * sunUp * D_GGX(NoH, max(a, 0.002)) * G * Fs / max(4.0 * NoV, 1e-3);
  spec = min(spec, vec3(400.0));

  vec3 col = mix(refr, refl, F) + spec;

  // ── espuma ──
  float foamN = hA * 0.5 + hB * 0.5;
  // renda: células da soma das ondulações (fina perto, some longe)
  float lace = smoothstep(0.05, 0.45, hA * 0.45 + hB * 0.55 + hC * 0.35 + 0.18);
  // costa: linha viva na borda + faixas que correm para a praia, rasgadas
  float edge = 1.0 - smoothstep(0.02, 0.22 + foamN * 0.08, depthV);
  float shore = 1.0 - smoothstep(0.0, 1.5, depthV + foamN * 0.4);
  float bands = 0.5 + 0.5 * sin(depthV * 6.0 - uTime * 1.4 + foamN * 5.0);
  float fShore = max(edge * (0.7 + 0.3 * lace), shore * smoothstep(0.25, 0.9, bands) * lace);
  // cristas: onde a superfície se comprime (jacobiano baixo)
  float fCrest = smoothstep(0.62, 0.35, jac) * lace;
  float foam = clamp((fShore + fCrest * 0.7) * uFoamAmt, 0.0, 1.0);
  foam *= 1.0 - smoothstep(300.0, 2000.0, dist);
  vec3 foamCol = vec3(0.82) * (uSunE * sunUp * max(dot(up, L), 0.0) / PI + ambUp * 0.9);
  col = mix(col, foamCol, foam);

  gl_FragColor = vec4(col, 1.0);
}`;

export class Ocean {
  constructor(ctx, { detail, waves }) {
    this.ctx = ctx;
    this.waves = waves;
    const nv = 1 + RINGS * SEGS;
    this.pos = new Float32Array(nv * 3);
    const idx = [];
    for (let j = 0; j < SEGS; j++) idx.push(0, 1 + j, 1 + ((j + 1) % SEGS));
    for (let i = 0; i < RINGS - 1; i++) {
      for (let j = 0; j < SEGS; j++) {
        const a = 1 + i * SEGS + j, b = 1 + i * SEGS + ((j + 1) % SEGS);
        idx.push(a, a + SEGS, b, b, a + SEGS, b + SEGS);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.geo = g;
    const N = GERSTNER_COUNT;
    this.uniforms = {
      uDepthMode: { value: ctx.depthMode === 'reversed' ? 0 : ctx.depthMode === 'log' ? 1 : 2 },
      uNear: { value: ctx.camera.near },
      uFar: { value: ctx.camera.far },
      uWaveDir: { value: Array.from({ length: N }, () => new THREE.Vector3(1, 0, 0)) },
      uWave: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
      uPhase0: { value: new Float32Array(N) },
      uRingQ: { value: 0.1 },
      uCenterR: { value: new THREE.Vector3() },
      tDetail: { value: detail },
      uLayer: { value: DETAIL_LAYERS.map(() => new THREE.Vector4()) },
      uCamMod: { value: new THREE.Vector3() },
      uGradScale: { value: detail.userData.gradScale || 1 },
      tSceneColor: { value: null },
      tSceneZ: { value: null },
      uHasScene: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uProj: { value: new THREE.Matrix4() },
      uPixAngle: { value: 0.001 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunE: { value: new THREE.Color(3, 3, 3) },
      uSkyFallback: { value: new THREE.Color(0.3, 0.5, 0.9) },
      envMap: { value: null },
      uHasEnv: { value: 0 },
      uEnvGain: { value: 1 },
      uSigma: { value: new THREE.Vector3(0.35, 0.06, 0.04) },
      uScatter: { value: new THREE.Color(0.01, 0.1, 0.12) },
      uEmissive: { value: new THREE.Color(0, 0, 0) },
      uTime: { value: 0 },
      uSSR: { value: 1 },
      uSSRSteps: { value: 20 },
      uUnder: { value: 0 },
      uFogInscat: { value: new THREE.Color() },
      uFoamAmt: { value: 1 },
      uCaustics: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      name: 'water:ocean',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });
    this.envHeight = 0;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'water:ocean';
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); // desenhado à parte, depois da cópia do mundo
    this.scene.add(this.mesh);
    this.anchor = new ctx.WorldPos();
    this.handle = ctx.space.registerFloating(this.mesh, this.anchor);
    this.anchorDir = new THREE.Vector3(2, 0, 0);
    this.anchorAlt = -1;
    this.radius = 0;
    this._u = new THREE.Vector3();
  }

  /** Define o envMap (PMREM) — recompila quando o tamanho muda. */
  setEnv(tex) {
    const u = this.uniforms;
    if (!tex) {
      u.uHasEnv.value = 0;
      return;
    }
    const h = tex.image?.height || 0;
    u.envMap.value = tex;
    u.uHasEnv.value = h ? 1 : 0;
    if (h && h !== this.envHeight) {
      this.envHeight = h;
      const maxMip = Math.log2(h) - 2;
      const texelHeight = 1 / h;
      const texelWidth = 1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16));
      this.mat.defines = {
        ENVMAP_TYPE_CUBE_UV: '',
        CUBEUV_TEXEL_WIDTH: texelWidth,
        CUBEUV_TEXEL_HEIGHT: texelHeight,
        CUBEUV_MAX_MIP: `${maxMip}.0`,
      };
      this.mat.needsUpdate = true;
    }
  }

  rebuild(u, alt, R) {
    const ctx = this.ctx;
    const a = Math.max(1.5, alt);
    const th1 = Math.max(0.35, a * 0.01) / R;
    const thMax = Math.min(Math.PI * 0.95, Math.acos(R / (R + a)) + Math.max(0.05, 8000 / R));
    const q = Math.pow(thMax / th1, 1 / (RINGS - 1));
    const fr = ctx.Geo.tangentFrame(u);
    const e = fr.east, n = fr.north;
    const c = ctx.space.planetCenter;
    this.anchor.set(c.x + u.x * R, c.y + u.y * R, c.z + u.z * R);
    const pos = this.pos;
    pos[0] = pos[1] = pos[2] = 0;
    let th = th1;
    for (let i = 0; i < RINGS; i++) {
      const st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j < SEGS; j++) {
        const ph = ((j + (i & 1) * 0.5) / SEGS) * Math.PI * 2;
        const cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
        const o = (1 + i * SEGS + j) * 3;
        pos[o] = R * (ct * u.x + cp * e.x + sp * n.x - u.x);
        pos[o + 1] = R * (ct * u.y + cp * e.y + sp * n.y - u.y);
        pos[o + 2] = R * (ct * u.z + cp * e.z + sp * n.z - u.z);
      }
      th *= q;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.anchorDir.copy(u);
    this.anchorAlt = a;
    this.uniforms.uRingQ.value = q - 1;
  }

  /** Por frame: refaz a calota se preciso e atualiza fases/uniformes. */
  update(R) {
    const ctx = this.ctx;
    const c = ctx.space.planetCenter;
    const o = ctx.space.origin;
    const u = this._u.set(o.x - c.x, o.y - c.y, o.z - c.z);
    const r = u.length();
    u.multiplyScalar(1 / r);
    const alt = Math.max(1.5, Math.abs(r - R));
    const moved = this.anchorDir.x > 1 ? Infinity : this.anchorDir.angleTo(u) * R;
    if (R !== this.radius || moved > Math.max(15, alt * 0.3) || alt > this.anchorAlt * 1.3 || alt < this.anchorAlt / 1.3) {
      this.radius = R;
      this.rebuild(u, alt, R);
    }
    const U = this.uniforms;
    // centro do planeta em espaço de render (double → float perto da câmera
    // não importa: só a direção "para cima" usa)
    U.uCenterR.value.set(c.x - o.x, c.y - o.y, c.z - o.z);
    // posição da câmera módulo o período do detalhe (exato: periódico)
    const B = DETAIL_BASE;
    const m = (v) => v - Math.floor(v / B) * B;
    U.uCamMod.value.set(m(o.x - c.x), m(o.y - c.y), m(o.z - c.z));
    return r - R;
  }

  dispose() {
    this.handle.remove();
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
