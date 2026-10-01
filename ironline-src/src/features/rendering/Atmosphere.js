/**
 * Atmosfera física: céu por espalhamento (Rayleigh + Mie + ozônio), nuvens
 * procedurais, disco solar e ambiente PMREM para IBL.
 *
 * Abordagem (inspirada em Hillaire 2020, "A Scalable and Production Ready
 * Sky and Atmosphere Rendering Technique"):
 *  - um "sky-view LUT" (azimute relativo ao sol × elevação não linear) é
 *    renderizado numa textura HalfFloat pequena SÓ quando o sol muda;
 *  - o domo do céu (esfera presa à câmera) amostra o LUT, soma o disco do sol
 *    com escurecimento de borda e uma camada de nuvens fbm iluminada;
 *  - a mesma esfera (sem disco solar) vira ambiente PMREM (scene.environment);
 *  - a transmitância até o sol é integrada também em JS (cor física do sol,
 *    cor do nevoeiro/perspectiva aérea).
 *
 * Unidades do modelo: km. A saída é escalada por `skyScale × sun.intensity`
 * para casar com as intensidades das luzes da cena (unidades do three).
 */
import * as THREE from 'three';
import { FsQuad, RAW_VERT } from './FsQuad.js';

// Coeficientes por km (Hillaire 2020 / Bruneton).
const RG = 6360.0;
const RT = 6460.0;
const BETA_R = [5.802e-3, 13.558e-3, 33.1e-3];
const BETA_M = 3.996e-3;
const BETA_M_EXT = 4.4e-3;
const BETA_O = [0.65e-3, 1.881e-3, 0.085e-3];
const HR = 8.0;
const HM = 1.2;

export const ATMO_GLSL = /* glsl */ `
const float RG = 6360.0;
const float RT = 6460.0;
const vec3 BETA_R = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float BETA_M = 3.996e-3;
const float BETA_M_EXT = 4.4e-3;
const vec3 BETA_O = vec3(0.65e-3, 1.881e-3, 0.085e-3);
const float HR = 8.0;
const float HM = 1.2;
const float PI_A = 3.14159265;

float raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  d = sqrt(d);
  float t1 = -b - d;
  float t2 = -b + d;
  if (t1 > 0.0) return t1;
  if (t2 > 0.0) return t2;
  return -1.0;
}
// densidades (rayleigh, mie, ozônio) na altitude h (km)
vec3 atmoDensity(float h, float haze) {
  return vec3(exp(-h / HR), exp(-h / HM) * haze, max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}
vec3 extinctionOf(vec3 d) {
  return BETA_R * d.x + BETA_M_EXT * d.y + BETA_O * d.z;
}
// Mapeamento do sky-view LUT: u = azimute relativo ao sol [0, π], v = elevação
// com mais resolução perto do horizonte.
vec2 skyLutUv(vec3 dir, vec3 sunDir) {
  float elev = asin(clamp(dir.y, -1.0, 1.0));
  float l = elev / (PI_A * 0.5);
  float v = 0.5 + 0.5 * sign(l) * sqrt(abs(l));
  vec2 a = dir.xz; vec2 s = sunDir.xz;
  float la = length(a), ls = length(s);
  float cphi = (la > 1e-4 && ls > 1e-4) ? dot(a / la, s / ls) : 1.0;
  float u = acos(clamp(cphi, -1.0, 1.0)) / PI_A;
  return vec2(u, v);
}
`;

/** Shader do LUT: integra espalhamento simples + aproximação de múltiplo. */
const LUT_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec3 uSunDir;
uniform float uHaze;
uniform float uAltitude;
uniform vec3 uGroundAlbedo;
${ATMO_GLSL}

vec3 transmittanceToTop(vec3 p, vec3 s, float haze) {
  if (raySphere(p, s, RG) > 0.0 && dot(p, s) < 0.0) {
    // o planeta bloqueia o sol (atrás do horizonte), com transição suave
    float hor = dot(normalize(p), s);
    if (hor < -0.03) return vec3(0.0);
  }
  float tMax = raySphere(p, s, RT);
  const int N = 10;
  float dt = tMax / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 q = p + s * (float(i) + 0.5) * dt;
    od += atmoDensity(length(q) - RG, haze) * dt;
  }
  return exp(-extinctionOf(od));
}

void main() {
  float u = vUv.x, v = vUv.y;
  float l = (v - 0.5) * 2.0;
  float elev = sign(l) * l * l * PI_A * 0.5;
  float phi = u * PI_A;
  vec3 s = normalize(uSunDir);
  float sAz = atan(s.z, s.x);
  float az = sAz + phi;
  vec3 rd = vec3(cos(elev) * cos(az), sin(elev), cos(elev) * sin(az));
  vec3 ro = vec3(0.0, RG + uAltitude, 0.0);

  float tGround = raySphere(ro, rd, RG);
  float tTop = raySphere(ro, rd, RT);
  bool hitGround = tGround > 0.0;
  float tMax = hitGround ? tGround : tTop;
  tMax = min(tMax, 400.0);

  float mu = dot(rd, s);
  float phaseR = 3.0 / (16.0 * PI_A) * (1.0 + mu * mu);
  float g = 0.8;
  float g2 = g * g;
  float phaseM = 3.0 / (8.0 * PI_A) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));

  const int N = 32;
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    // distribuição quadrática: mais passos perto do observador
    float f = (float(i) + 0.5) / float(N);
    float t = tMax * f * f;
    float dt = t - tPrev;
    tPrev = t;
    vec3 p = ro + rd * t;
    float h = length(p) - RG;
    vec3 d = atmoDensity(h, uHaze);
    vec3 ext = extinctionOf(d);
    vec3 Ts = transmittanceToTop(p, s, uHaze);
    vec3 scatR = BETA_R * d.x;
    vec3 scatM = vec3(BETA_M * d.y);
    // espalhamento simples + termo isotrópico aproximando o múltiplo
    vec3 ms = (scatR + scatM) * (0.06 + 0.25 * max(s.y + 0.1, 0.0));
    vec3 S = Ts * (scatR * phaseR + scatM * phaseM) + ms * (0.4 + 0.6 * Ts);
    vec3 Tstep = exp(-ext * dt);
    // integração analítica por segmento (energia conservada)
    L += T * (S - S * Tstep) / max(ext, vec3(1e-7));
    T *= Tstep;
  }
  if (hitGround) {
    vec3 p = ro + rd * tGround;
    vec3 n = normalize(p);
    vec3 Ts = transmittanceToTop(p, s, uHaze);
    vec3 irr = Ts * max(dot(n, s), 0.0) + vec3(0.08, 0.1, 0.13) * max(s.y + 0.15, 0.0);
    L += T * uGroundAlbedo * irr / PI_A;
  }
  outColor = vec4(L, 1.0);
}
`;

/** Domo do céu (e versão ambiente, sem disco solar). */
function skyMaterial(uniforms, envMode) {
  return new THREE.ShaderMaterial({
    name: envMode ? 'ironline-sky-env' : 'ironline-sky',
    uniforms,
    defines: envMode ? { ENV_MODE: 1 } : {},
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w; // sempre no plano distante
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform sampler2D uLut;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;     // transmitância até o sol × intensidade
      uniform float uSkyScale;
      uniform float uSunDisk;
      uniform float uSkySat;
      uniform float uTime;
      uniform float uCloudCover;
      uniform float uCloudDensity;
      uniform vec2 uCloudWind;
      ${ATMO_GLSL}

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p, int oct) {
        float s = 0.0, a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 6; i++) {
          if (i >= oct) break;
          s += a * vnoise(p);
          p = m * p;
          a *= 0.5;
        }
        return s;
      }
      // densidade de nuvem num ponto do plano das nuvens (km)
      float cloudDensity(vec2 p, int oct) {
        vec2 q = p * 0.42 + uCloudWind * uTime;
        vec2 w = vec2(fbm(q * 0.7 + 3.1, 3), fbm(q * 0.7 - 1.7, 3));
        float raw = fbm(q + w * 0.9, oct) * 0.75 + vnoise(q * 0.35 + 7.0) * 0.35;
        // normaliza (fbm tem pouca variância) para cobertura previsível
        float base = clamp((raw - 0.53) * 2.8 + 0.5, 0.0, 1.0);
        // erosão de detalhe nas bordas (aspecto de cúmulo)
        if (oct > 3) base -= (fbm(q * 3.3 + 11.0, 3) - 0.47) * 0.42 * (1.0 - base);
        float cov = 1.0 - uCloudCover;
        // borda larga e macia (sem contorno "recortado") + miolo mais denso
        return smoothstep(cov - 0.03, cov + 0.3, base) * (0.5 + 0.5 * smoothstep(cov + 0.05, cov + 0.5, base));
      }

      void main() {
        vec3 dir = normalize(vDir);
        vec3 s = normalize(uSunDir);
        vec3 sky = texture2D(uLut, skyLutUv(dir, s)).rgb * uSkyScale;
        #ifndef ENV_MODE
        // saturação artística do domo (o LUT puro fica para névoa/IBL)
        float sl = dot(sky, vec3(0.2126, 0.7152, 0.0722));
        sky = max(mix(vec3(sl), sky, uSkySat), 0.0);
        #endif
        vec3 col = sky;

        // ── nuvens: plano a ~1.6 km, iluminação com espalhamento direcional ──
        if (dir.y > 0.0 && uCloudCover > 0.001) {
          float t = 2.4 / max(dir.y, 0.03);
          vec2 p = dir.xz * t;
          #ifdef ENV_MODE
          float d = cloudDensity(p, 3);
          #else
          float d = cloudDensity(p, 5);
          #endif
          if (d > 0.001) {
            // auto-sombreamento: duas amostras rumo ao sol (Beer) + termo de
            // espalhamento múltiplo (Beer "achatado") — miolo escuro, bordas
            // e topo voltados ao sol com contorno prateado
            vec2 toSun = normalize(s.xz + 1e-4);
            float ds1 = cloudDensity(p + toSun * 0.18, 3);
            float ds2 = cloudDensity(p + toSun * 0.55, 3);
            float od = (ds1 * 0.65 + ds2 * 0.35 + d * 0.3) * 4.2 * uCloudDensity;
            float light = max(exp(-od), exp(-od * 0.22) * 0.45);
            float powder = 1.0 - exp(-d * uCloudDensity * 3.0);
            float mu = dot(dir, s);
            float hgF = (1.0 - 0.36) / pow(1.36 - 1.2 * mu, 1.5) / (4.0 * PI_A);
            float hgB = (1.0 - 0.04) / pow(1.04 + 0.4 * mu, 1.5) / (4.0 * PI_A);
            float phase = hgF * 0.75 + hgB * 0.25;
            vec3 zen = texture2D(uLut, skyLutUv(vec3(0.0, 1.0, 0.0), s)).rgb * uSkyScale;
            vec3 hor = texture2D(uLut, skyLutUv(normalize(vec3(dir.x, 0.05, dir.z)), s)).rgb * uSkyScale;
            vec3 amb = mix(hor, zen, 0.55) * (0.62 + 0.38 * (1.0 - d));
            vec3 lit = uSunColor * light * mix(1.0, powder, 0.55) * (0.16 + phase * 2.6) + amb * (0.55 + 0.45 * light);
            float alpha = 1.0 - exp(-d * uCloudDensity * 4.5);
            // perspectiva aérea: nuvens longe somem no céu do horizonte
            float fade = smoothstep(0.0, 0.2, dir.y);
            lit = mix(hor, lit, smoothstep(0.0, 0.35, dir.y) * 0.6 + 0.4);
            col = mix(col, lit, alpha * fade);
          }
        }

        #ifndef ENV_MODE
        // ── disco solar com escurecimento de borda ──
        float cosA = dot(dir, s);
        float sunR = 0.0055;
        float dd = acos(clamp(cosA, -1.0, 1.0));
        if (dd < sunR * 1.6) {
          float x = clamp(dd / sunR, 0.0, 1.0);
          float limb = pow(max(1.0 - x * x, 0.0), 0.25);
          float edge = 1.0 - smoothstep(0.85, 1.25, dd / sunR);
          col += uSunColor * uSunDisk * limb * edge;
        }
        #else
        // ambiente: chão abaixo do horizonte já vem do LUT; reduz brilho
        // extremo da auréola para não gerar "vaga-lumes" no PMREM
        col = min(col, vec3(8.0));
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class Atmosphere {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.sunDir = new THREE.Vector3(0.5, 0.7, 0.3).normalize();
    this.params = {
      haze: 0.6,          // multiplicador de aerossóis (Mie)
      altitude: 0.15,     // km do observador
      groundAlbedo: new THREE.Color(0.28, 0.26, 0.23),
      skyScale: 2.2,      // calibração céu ↔ luzes da cena
      sunDisk: 18,
      skySaturation: 1.22,
      cloudCover: 0.5,
      cloudDensity: 1.15,
      cloudWind: new THREE.Vector2(0.004, 0.0015),
      ...opts,
    };
    this.lut = new THREE.WebGLRenderTarget(192, 108, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    });
    this.lut.texture.colorSpace = THREE.NoColorSpace;
    this.lutQuad = new FsQuad(
      new THREE.RawShaderMaterial({
        name: 'ironline-skylut',
        glslVersion: THREE.GLSL3,
        uniforms: {
          uSunDir: { value: this.sunDir.clone() },
          uHaze: { value: this.params.haze },
          uAltitude: { value: this.params.altitude },
          uGroundAlbedo: { value: this.params.groundAlbedo },
        },
        vertexShader: RAW_VERT,
        fragmentShader: LUT_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );

    this.uniforms = {
      uLut: { value: this.lut.texture },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSkyScale: { value: 1 },
      uSunDisk: { value: this.params.sunDisk },
      uSkySat: { value: this.params.skySaturation },
      uTime: { value: 0 },
      uCloudCover: { value: this.params.cloudCover },
      uCloudDensity: { value: this.params.cloudDensity },
      uCloudWind: { value: this.params.cloudWind },
    };
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.dome = new THREE.Mesh(geo, skyMaterial(this.uniforms, false));
    this.dome.name = 'ironline-sky';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1e6;
    this.dome.castShadow = this.dome.receiveShadow = false;
    this.dome.matrixAutoUpdate = false;

    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(geo, skyMaterial(this.uniforms, true));
    this.envDome.scale.setScalar(100);
    this.envDome.frustumCulled = false;
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.sunIntensity = 3;
    this.sunTransmittance = new THREE.Color(1, 1, 1);
    this._lastLutDir = new THREE.Vector3(0, -2, 0);
    this._lastEnvDir = new THREE.Vector3(0, -2, 0);
    this._lastEnvKey = '';
    this.dirty = true;
  }

  /** Dome segue a câmera; raio < far da câmera. */
  attach(scene, camera) {
    scene.add(this.dome);
    this.dome.onBeforeRender = (r, s, cam) => {
      const rad = Math.min(cam.far * 0.9, 5000);
      this.dome.matrixWorld.makeScale(rad, rad, rad).setPosition(cam.getWorldPosition(_tmp));
    };
  }

  setSun(dir, intensity) {
    this.sunDir.copy(dir).normalize();
    this.sunIntensity = intensity;
    computeTransmittance(this.sunDir, this.params, this.sunTransmittance);
    this.uniforms.uSunColor.value.copy(this.sunTransmittance).multiplyScalar(intensity);
    this.uniforms.uSkyScale.value = this.params.skyScale * intensity;
  }

  /** Re-renderiza o LUT se o sol mudou; retorna true se mudou. */
  updateLut(force = false) {
    if (!force && !this.dirty && this._lastLutDir.angleTo(this.sunDir) < 0.002) return false;
    const u = this.lutQuad.material.uniforms;
    u.uSunDir.value.copy(this.sunDir);
    u.uHaze.value = this.params.haze;
    u.uAltitude.value = this.params.altitude;
    this.lutQuad.render(this.renderer, this.lut);
    this._lastLutDir.copy(this.sunDir);
    this.dirty = false;
    return true;
  }

  /** Gera (ou regenera) o ambiente PMREM quando o sol/céu mudou bastante. */
  updateEnvironment(force = false) {
    const key = `${this.params.cloudCover.toFixed(3)}|${this.params.haze.toFixed(3)}|${this.uniforms.uSkyScale.value.toFixed(3)}`;
    if (!force && this.envRT && this._lastEnvDir.angleTo(this.sunDir) < 0.03 && key === this._lastEnvKey) return null;
    const prev = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.envRT.texture.name = 'ironline-env';
    prev?.dispose();
    this._lastEnvDir.copy(this.sunDir);
    this._lastEnvKey = key;
    return this.envRT.texture;
  }

  /**
   * Radiância ambiente equivalente do céu (lê o LUT na CPU; só quando o sol
   * muda). Devolve E/π para uma normal para cima e para uma normal
   * horizontal (média nos azimutes) — já na escala da cena (× skyScale).
   * É o que o IBL difuso do three entrega (PMREM rugosidade 1 ≈ cosseno).
   */
  readAmbient(renderer) {
    const W = this.lut.width, H = this.lut.height;
    const buf = new Uint16Array(W * H * 4);
    try {
      renderer.readRenderTargetPixels(this.lut, 0, 0, W, H, buf);
    } catch {
      return null;
    }
    const f = THREE.DataUtils.fromHalfFloat;
    const up = [0, 0, 0], side = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      const l = (v - 0.5) * 2;
      const elev = Math.sign(l) * l * l * Math.PI * 0.5;
      // dω = cos(elev) · d(elev) · dφ ; d(elev)/dv = 2π|l| ; φ cobre [0, π] (×2 simétrico)
      const dOmega = Math.cos(elev) * (2 * Math.PI * Math.abs(l)) * (1 / H) * (Math.PI / W) * 2;
      const cu = Math.max(Math.sin(elev), 0);
      const cs = Math.cos(elev) / Math.PI;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        for (let k = 0; k < 3; k++) {
          const L = f(buf[i + k]);
          if (!Number.isFinite(L)) continue;
          up[k] += L * cu * dOmega;
          side[k] += L * cs * dOmega;
        }
      }
    }
    const sc = this.uniforms.uSkyScale.value / Math.PI;
    this.ambientUp = new THREE.Color(up[0] * sc, up[1] * sc, up[2] * sc);
    this.ambientSide = new THREE.Color(side[0] * sc, side[1] * sc, side[2] * sc);
    return { up: this.ambientUp, side: this.ambientSide };
  }

  dispose() {
    this.lut.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.envDome.material.dispose();
    this.lutQuad.dispose();
  }
}

const _tmp = new THREE.Vector3();

/** Transmitância atmosférica do observador até o sol (JS, mesmo modelo). */
export function computeTransmittance(sunDir, params, out = new THREE.Color()) {
  const ro = [0, RG + params.altitude, 0];
  const s = [sunDir.x, sunDir.y, sunDir.z];
  // interseção com o topo
  const b = ro[0] * s[0] + ro[1] * s[1] + ro[2] * s[2];
  const c = ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2] - RT * RT;
  const tMax = -b + Math.sqrt(Math.max(b * b - c, 0));
  const N = 64;
  const dt = tMax / N;
  let odR = 0, odM = 0, odO = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    const x = ro[0] + s[0] * t, y = ro[1] + s[1] * t, z = ro[2] + s[2] * t;
    const h = Math.hypot(x, y, z) - RG;
    odR += Math.exp(-h / HR) * dt;
    odM += Math.exp(-h / HM) * params.haze * dt;
    odO += Math.max(0, 1 - Math.abs(h - 25) / 15) * dt;
  }
  const tr = [0, 1, 2].map((k) => Math.exp(-(BETA_R[k] * odR + BETA_M_EXT * odM + BETA_O[k] * odO)));
  // horizonte: sol abaixo do horizonte apaga
  const fade = THREE.MathUtils.smoothstep(sunDir.y, -0.03, 0.02);
  return out.setRGB(tr[0] * fade, tr[1] * fade, tr[2] * fade, THREE.LinearSRGBColorSpace);
}
