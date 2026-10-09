/**
 * ÁGUA — oceanos esféricos no nível do mar. Publica o serviço `water`.
 *
 * Passada no estágio 'afterWorld' (ordem 5: depois do SSAO, antes da
 * perspectiva aérea, que então cobre o mar distante):
 *   1. copia a cor e a profundidade LINEAR do mundo (o depth do alvo HDR
 *      não pode ser lido enquanto é o destino do desenho);
 *   2. câmera submersa → névoa/absorção da coluna d'água sobre o mundo
 *      (multiplicativa + aditiva, espectral);
 *   3. desenha a calota do oceano (ocean.js) no alvo HDR com teste de
 *      profundidade — refração, reflexo, espuma e cáusticas leem as cópias.
 *
 * A malha antiga de oceano do `planet` ('planet:ocean'), se existir, fica
 * oculta enquanto esta água está ativa — o planet continua dono do
 * terreno/leito, a água é daqui. Sem `planet.seaLevel` não há mar.
 *
 * Qualidade: high = SSR 20 passos + cáusticas; medium = SSR 10; low = sem
 * SSR/cáusticas (cópias em meia resolução não são usadas: a refração lê o
 * mundo em resolução cheia, que é barato — 2 desenhos).
 *
 * API (`ctx.services.water`):
 *   active, seaLevel, seaRadius, underwater (câmera), depth (m da câmera
 *   abaixo da superfície), heightAt(worldPos) (m sobre o nível do mar, ondas),
 *   isUnderwater(worldPos), setSeaState(0..1), palette { sigma, scatter }
 */
import * as THREE from 'three';
import { makeDetailTexture, WaveSet, DETAIL_LAYERS, GERSTNER_COUNT } from './waves.js';
import { Ocean } from './ocean.js';
import { DEPTH_GLSL, QUAD_VERT } from './glsl.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const COPY_COLOR = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`;

const COPY_Z = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tDepth;
varying vec2 vUv;
void main() { gl_FragColor = vec4(exoViewZ(texture2D(tDepth, vUv).r), 0.0, 0.0, 1.0); }`;

// névoa submersa: modo 0 = transmitância (multiplica), 1 = luz espalhada (soma)
const FOG = /* glsl */ `
uniform sampler2D tZ;
uniform vec2 uTan;
uniform vec3 uSigma;
uniform vec3 uInscat;
uniform float uMode;
uniform vec3 uUpV;       // "para cima" local em espaço de visão
uniform float uCamDepth; // m abaixo da superfície
varying vec2 vUv;
void main() {
  float z = texture2D(tZ, vUv).r;
  vec3 rv = vec3((vUv * 2.0 - 1.0) * uTan, -1.0);
  float len = length(rv);
  float d = min(z * len, 1e5);
  vec3 T = exp(-uSigma * d);
  // a distância de visibilidade também espalha (partículas em suspensão)
  T *= exp(-0.012 * d);
  if (uMode < 0.5) {
    // a luz do sol/céu chega ao ponto atravessando a água acima dele
    vec3 Tl = vec3(1.0);
    if (z < 1e11) {
      float pd = max(uCamDepth + dot(-rv / len, uUpV) * d, 0.0);
      Tl = exp(-uSigma * pd * 0.8);
      Tl = mix(Tl, vec3(dot(Tl, vec3(0.33))), 0.35);
    }
    gl_FragColor = vec4(T * Tl, 1.0);
  } else gl_FragColor = vec4(uInscat * (1.0 - T), 1.0);
}`;

function fs(frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, ...extra });
}

function target(w, h, type, filter = THREE.LinearFilter, format = THREE.RGBAFormat) {
  const t = new THREE.WebGLRenderTarget(w, h, { type, format, depthBuffer: false, stencilBuffer: false, minFilter: filter, magFilter: filter, colorSpace: THREE.LinearSRGBColorSpace });
  t.texture.generateMipmaps = false;
  return t;
}

export default {
  name: 'water',
  order: 12,

  async init(ctx) {
    const { renderer } = ctx;
    this.ctx = ctx;
    const seed = ctx.seed?.hash?.('water') ?? 7;
    this.detail = makeDetailTexture((seed % 1000) + 3);
    this.waves = new WaveSet(seed);
    this.ocean = new Ocean(ctx, { detail: this.detail, waves: this.waves });
    const floatOk = !!renderer.extensions.has?.('EXT_color_buffer_float');
    this.sceneColor = target(1, 1, THREE.HalfFloatType);
    this.sceneZ = target(1, 1, floatOk ? THREE.FloatType : THREE.HalfFloatType, THREE.NearestFilter);
    this.quad = new FullScreenQuad(null);
    this.mColor = fs(COPY_COLOR, { tSrc: { value: null } });
    this.uZ = {
      uDepthMode: { value: ctx.depthMode === 'reversed' ? 0 : ctx.depthMode === 'log' ? 1 : 2 },
      uNear: { value: ctx.camera.near },
      uFar: { value: ctx.camera.far },
      tDepth: { value: null },
    };
    this.mZ = fs(COPY_Z, this.uZ);
    this.uFog = { tZ: { value: this.sceneZ.texture }, uTan: { value: new THREE.Vector2(1, 1) }, uSigma: { value: new THREE.Vector3() }, uInscat: { value: new THREE.Color() }, uMode: { value: 0 }, uUpV: { value: new THREE.Vector3(0, 1, 0) }, uCamDepth: { value: 0 } };
    const blendMul = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
    const blendAdd = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
    this.mFogMul = fs(FOG, this.uFog, blendMul);
    this.mFogAdd = fs(FOG, { ...this.uFog, uMode: { value: 1 } }, blendAdd);

    this.active = false;
    this.seaRadius = 0;
    this.camAlt = 1e9;
    this.under = false;
    this.planetOcean = null;
    this.searchIn = 0;
    this.paletteKey = '';
    this.sigma = new THREE.Vector3(0.35, 0.06, 0.04);
    this.scatter = new THREE.Color(0.01, 0.1, 0.12);
    this.oriented = false;
    this.frameCount = 0;
    this.sunE = new THREE.Color();
    this.inscat = new THREE.Color();
    this._c = new THREE.Color();
    this._qi = new THREE.Quaternion();

    const P = ctx.shot?.preset?.params || {};
    this.seaStateOverride = typeof P.seaState === 'number' ? P.seaState : null;
    if (this.seaStateOverride != null) this.waves.setSeaState(this.seaStateOverride);

    this.removePass = ctx.pipeline.addPass('afterWorld', (c, t) => this.render(t), { order: 5, owner: 'water' });
    this.applyQuality();
    this.offs = [
      ctx.bus.on('quality:change', () => this.applyQuality()),
      ctx.bus.on('planet:enter', () => (this.paletteKey = '')),
      ctx.bus.on('service:ready', ({ name }) => {
        if (name === 'planet') this.paletteKey = '';
      }),
    ];
    this.publish();
  },

  applyQuality() {
    const q = this.ctx.quality;
    const lvl = q.level || 'high';
    const U = this.ocean.uniforms;
    U.uSSR.value = lvl === 'low' ? 0 : 1;
    U.uSSRSteps.value = lvl === 'high' || lvl === 'ultra' ? 20 : 10;
    U.uCaustics.value = lvl === 'low' ? 0 : 1;
  },

  publish() {
    const self = this;
    const ctx = this.ctx;
    const api = {
      get active() {
        return self.active;
      },
      get seaLevel() {
        return ctx.services.planet?.seaLevel ?? null;
      },
      get seaRadius() {
        return self.seaRadius;
      },
      get underwater() {
        return self.under;
      },
      /** metros da câmera abaixo da superfície (negativo = acima) */
      get depth() {
        return -self.camAlt;
      },
      heightAt(worldPos) {
        const c = ctx.space.planetCenter;
        return self.waves.heightAt(worldPos.x - c.x, worldPos.y - c.y, worldPos.z - c.z, ctx.time.world);
      },
      isUnderwater(worldPos) {
        if (!self.active) return false;
        const c = ctx.space.planetCenter;
        const r = Math.hypot(worldPos.x - c.x, worldPos.y - c.y, worldPos.z - c.z);
        return r < self.seaRadius + api.heightAt(worldPos);
      },
      setSeaState(s) {
        self.seaStateOverride = THREE.MathUtils.clamp(s, 0, 1);
        self.waves.setSeaState(self.seaStateOverride);
      },
      get palette() {
        return { sigma: self.sigma.clone(), scatter: self.scatter.clone() };
      },
      get mesh() {
        return self.ocean.mesh;
      },
    };
    this.api = ctx.provide('water', api);
  },

  /** Absorção e espalhamento a partir da paleta do bioma. */
  updatePalette(planet) {
    const pal = planet.palette || planet.biomeAt?.(ctx_up(this.ctx))?.palette;
    const w = pal?.water || [0.01, 0.13, 0.17];
    const key = w.join(',') + (pal?.emissiveWater || '');
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    const m = Math.max(w[0], w[1], w[2], 1e-3);
    const sig = w.map((x) => -Math.log(THREE.MathUtils.clamp(x / m, 0.04, 0.97)) * 0.14 + 0.012);
    this.sigma.set(sig[0], sig[1], sig[2]);
    // albedo de volume: a cor do bioma, um pouco mais saturada e clara
    this.scatter.setRGB(w[0] * 0.9, w[1] * 0.9, w[2] * 0.9);
    const U = this.ocean.uniforms;
    U.uSigma.value.copy(this.sigma);
    U.uScatter.value.copy(this.scatter);
    const em = pal?.emissiveWater;
    U.uEmissive.value.setRGB(em?.[0] || 0, em?.[1] || 0, em?.[2] || 0);
    this.uFog.uSigma.value.copy(this.sigma);
  },

  hidePlanetOcean(ctx) {
    if (this.planetOcean && this.planetOcean.parent) {
      this.planetOcean.visible = false;
      return;
    }
    if (this.searchIn-- > 0) return;
    this.searchIn = 60;
    this.planetOcean = ctx.scene.getObjectByName('planet:ocean') || null;
    if (this.planetOcean) this.planetOcean.visible = false;
  },

  frame(dt, ctx) {
    const planet = ctx.services.planet;
    const sea = planet?.seaLevel;
    this.active = !!planet && sea != null && Number.isFinite(sea) && !!planet.radius;
    this.ocean.mesh.visible = this.active;
    if (!this.active) {
      this.under = false;
      return;
    }
    this.hidePlanetOcean(ctx);
    const R = planet.radius + sea;
    this.seaRadius = R;
    this.updatePalette(planet);
    const O = ctx.space.origin;
    const c = ctx.space.planetCenter;
    if (!this.oriented) {
      const u = new THREE.Vector3(O.x - c.x, O.y - c.y, O.z - c.z).normalize();
      this.waves.orient(ctx.Geo.tangentFrame(u));
      this.oriented = true;
    }
    // estado do mar pelo clima (vento/tempestade), salvo sobrescrita
    if (this.seaStateOverride == null) {
      const w = ctx.services.weather;
      const wind = w?.wind?.length?.() ?? 4;
      const storm = w?.weather === 'storm' ? 0.4 : 0;
      const s = THREE.MathUtils.clamp(0.25 + wind * 0.03 + storm, 0, 1);
      if (Math.abs(s - this.waves.state) > 0.02) this.waves.setSeaState(s);
    }
    const t = ctx.time.world;
    const alt = this.ocean.update(R);
    const camWave = this.waves.heightAt(O.x - c.x, O.y - c.y, O.z - c.z, t);
    this.camAlt = alt - camWave;
    this.under = this.camAlt < 0;

    const U = this.ocean.uniforms;
    this.waves.updatePhases(O, c, t);
    for (let i = 0; i < GERSTNER_COUNT; i++) {
      U.uWaveDir.value[i].copy(this.waves.dirs[i]);
      U.uWave.value[i].set(this.waves.k[i], this.waves.amp[i], this.waves.omega[i], this.waves.Q[i]);
      U.uPhase0.value[i] = this.waves.phase0[i];
    }
    DETAIL_LAYERS.forEach((L, i) => {
      const su = ((L.v[0] * t) / L.T) % 1;
      const sv = ((L.v[1] * t) / L.T) % 1;
      U.uLayer.value[i].set(1 / L.T, L.A, su, sv);
    });
    U.uTime.value = t % 3600;
    U.uUnder.value = this.under ? 1 : 0;

    // luz: sol do sky (cor × intensidade = irradiância), IBL para o céu
    const sky = ctx.services.sky;
    const sun = sky?.sun;
    if (sky?.sunDirection) U.uSunDir.value.copy(sky.sunDirection);
    if (sun) this.sunE.copy(sun.color).multiplyScalar(sun.intensity);
    else this.sunE.setRGB(3, 3, 3);
    U.uSunE.value.copy(this.sunE);
    const env = sky?.envMap || ctx.scene.environment;
    this.ocean.setEnv(env && env.mapping === THREE.CubeUVReflectionMapping ? env : null);
    U.uEnvGain.value = ctx.scene.environmentIntensity ?? 1;
    const fog = sky?.fogAt?.(O)?.color;
    if (fog) U.uSkyFallback.value.copy(fog);
    else if (planet.palette?.sky) U.uSkyFallback.value.setRGB(...planet.palette.sky);

    // névoa submersa: luz que chega à profundidade da câmera
    if (this.under) {
      const amb = sky?.ambient;
      const a = this._c.set(0.3, 0.4, 0.5);
      if (amb?.color) a.copy(amb.color).multiplyScalar((amb.intensity ?? 1) * 0.35);
      const up = ctx.player?.up;
      const sd = up && sky?.sunDirection ? Math.max(0, sky.sunDirection.dot(up)) : 0.5;
      const d = Math.max(0, -this.camAlt);
      this.inscat.copy(this.sunE).multiplyScalar(sd * 0.08).add(a);
      this.inscat.multiply(this.scatter).multiplyScalar(2.2);
      this.inscat.r *= Math.exp(-this.sigma.x * d);
      this.inscat.g *= Math.exp(-this.sigma.y * d);
      this.inscat.b *= Math.exp(-this.sigma.z * d);
      this.uFog.uInscat.value.copy(this.inscat);
    }
  },

  render(target) {
    if (!this.active) return;
    const ctx = this.ctx;
    const r = ctx.renderer;
    const cam = ctx.camera;
    const w = target.width, h = target.height;
    if (this.sceneColor.width !== w || this.sceneColor.height !== h) {
      this.sceneColor.setSize(w, h);
      this.sceneZ.setSize(w, h);
    }
    const prevClear = r.autoClear;
    r.autoClear = false;
    // 1. cópias do mundo
    this.mColor.uniforms.tSrc.value = target.texture;
    this.quad.material = this.mColor;
    r.setRenderTarget(this.sceneColor);
    this.quad.render(r);
    this.uZ.tDepth.value = target.depthTexture;
    this.quad.material = this.mZ;
    r.setRenderTarget(this.sceneZ);
    this.quad.render(r);

    const U = this.ocean.uniforms;
    U.tSceneColor.value = this.sceneColor.texture;
    U.tSceneZ.value = this.sceneZ.texture;
    U.uHasScene.value = 1;
    U.uRes.value.set(w, h);
    U.uProj.value.copy(cam.projectionMatrix);
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    U.uPixAngle.value = (2 * tanY) / h;

    // 2. névoa submersa sobre o mundo
    if (this.under) {
      this.uFog.uTan.value.set(tanY * cam.aspect, tanY);
      const up = ctx.player?.up;
      if (up) this.uFog.uUpV.value.copy(up).applyQuaternion(this._qi.copy(cam.quaternion).invert());
      this.uFog.uCamDepth.value = Math.max(0, -this.camAlt);
      r.setRenderTarget(target);
      this.quad.material = this.mFogMul;
      this.quad.render(r);
      this.quad.material = this.mFogAdd;
      this.quad.render(r);
    }

    // 3. oceano
    r.setRenderTarget(target);
    r.render(this.ocean.scene, cam);
    r.autoClear = prevClear;
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    this.removePass?.();
    this.ocean?.dispose();
    this.detail?.dispose();
    this.sceneColor?.dispose();
    this.sceneZ?.dispose();
    this.quad?.dispose();
    for (const m of [this.mColor, this.mZ, this.mFogMul, this.mFogAdd]) m?.dispose();
    if (this.planetOcean) this.planetOcean.visible = true;
  },
};

function ctx_up(ctx) {
  return ctx.player?.up || new THREE.Vector3(0, 1, 0);
}
