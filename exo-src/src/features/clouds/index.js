/**
 * NUVENS VOLUMÉTRICAS do EXOSFERA (feature `clouds`, publica `clouds`).
 *
 * Camada esférica de cúmulos/estratos/cumulonimbos por raymarching, visível
 * do chão, de DENTRO (atravessando a camada) e de cima (voo alto/órbita):
 *
 *   noise.js    ruído Perlin-Worley 3D (forma 64³ e detalhe 32³) e o mapa de
 *               clima esférico (cubemap: cobertura, tipo, tempestade, cirros),
 *               tudo gerado na GPU no init a partir da seed do planeta
 *   shaders.js  densidade, raymarch (Beer + pó, Henyey-Greenstein duplo,
 *               multiespalhamento por oitavas, ambiente por altura, relâmpago,
 *               cirros, perspectiva aérea pela atmosfera do `sky`), reprojeção
 *               temporal, sombras no terreno e composição bilateral
 *   pass.js     alvos e passadas no estágio afterWorld do pipeline
 *
 * Integração (só por serviços):
 *   sky      sky.glsl/uniforms/luts (transmitância até o sol em cada nuvem e
 *            perspectiva aérea idêntica à do céu); sem eles: cor do sol
 *            constante e névoa simples (fallback)
 *   weather  cobertura, tipo, tempestade, neblina, relâmpago, vento
 *            (placeholder → só `cloudCoverage`)
 *   planet   raio e nível do mar
 *
 * Serviço `clouds` (opcional para outros sistemas):
 *   layer { bottom, top } (m acima do raio), enabled, coverage,
 *   shadowAt(worldPos) → 0..1 (aproximação no CPU: só o mapa de clima)
 *
 * Parâmetros de preset (preset.params): cloudCoverage (0..1), cloudType
 * (−1..1), cloudBase/cloudTop (m), cloudSun (fator), clouds: false.
 */
import * as THREE from 'three';
import { generateCloudNoise, generateWeatherMap } from './noise.js';
import { CloudPasses } from './pass.js';

/** Qualidade → (escala de resolução, passos, passos de luz). */
const QUALITY = [
  { scale: 0.25, steps: 28, light: 3 },
  { scale: 0.35, steps: 40, light: 4 },
  { scale: 0.5, steps: 56, light: 5 },
  { scale: 0.5, steps: 80, light: 6 },
];

/** Altitudes da camada por bioma (m acima do nível de referência). */
const LAYER = {
  frozen: [1500, 4800],
  toxic: [1800, 5200],
  scorched: [2600, 5600],
  default: [2100, 5700],
};

export default {
  name: 'clouds',
  order: 22,

  async init(ctx) {
    const { renderer } = ctx;
    const P = ctx.shot?.preset?.params || {};
    this.P = P;
    // ajustes artísticos (mudáveis em tempo real pela depuração)
    this.tune = { ambTop: 0.6, ambBottom: 0.3, sigma: 0.16, msA: 0.25, msB: 0.6, msC: 0.5, powder: 1, detail: 0.6, sun: 2.5 };
    const seedOf = () => {
      const info = ctx.services.universe?.currentPlanet;
      return (info?.seed ?? ctx.seed.hash('galaxy', ctx.start.galaxy, 'system', ctx.start.systemIndex, 'planet', ctx.start.planetIndex)) >>> 0;
    };
    this.seed = seedOf();
    const t0 = performance.now();
    const noise = generateCloudNoise(renderer, ctx.seed.hash('clouds', 'noise'));
    this.noise = noise;
    this.weatherMap = generateWeatherMap(renderer, this.seed ^ 0x5bd1e995, 256);
    await ctx.bootProgress?.('nuvens', 0.5);
    const sky = ctx.services.sky;
    const atmoGlsl = sky && !sky.placeholder && typeof sky.glsl === 'string' ? sky.glsl : null;
    this.passes = new CloudPasses(ctx, {
      shape: noise.shape.texture,
      detail: noise.detail.texture,
      weather: this.weatherMap.texture,
      atmoGlsl,
      atmoUniforms: atmoGlsl ? sky.uniforms : null,
    });
    this.genMs = performance.now() - t0;
    this.applyQuality(ctx);
    this.offs = [
      ctx.bus.on('quality:change', () => this.applyQuality(ctx)),
      ctx.bus.on('system:enter', () => this.regen(ctx)),
      ctx.bus.on('planet:enter', () => this.regen(ctx)),
    ];
    const ps = this.passes;
    this.removeShadow = ctx.pipeline.addPass('afterWorld', (c, target) => ps.renderShadow(target), { order: 11, owner: 'clouds' });
    this.removeClouds = ctx.pipeline.addPass('afterWorld', (c, target) => ps.renderClouds(target, this._frameInfo), { order: 12, owner: 'clouds' });
    this._frameInfo = { camera: ctx.camera, camWorld: new THREE.Vector3(), static: false };
    this.state = { windOff: new THREE.Vector3(), detOff: new THREE.Vector3(), drift: 0, lastT: null, coverage: 0.45 };
    // modo shot: acumula alguns frames da reprojeção antes do "pronto"
    if (ctx.shot) {
      this.shotFrames = Number(ctx.params.get('cloudFrames')) || P.cloudFrames || 5;
      this.readyDone = ctx.ready.busy('nuvens: acumulação temporal');
    }

    const self = this;
    this.api = ctx.provide('clouds', {
      get layer() {
        return { bottom: self.layer?.[0] ?? 2100, top: self.layer?.[1] ?? 5700 };
      },
      get enabled() {
        return self.passes.cloudsOn;
      },
      set enabled(v) {
        self.passes.cloudsOn = !!v;
      },
      get coverage() {
        return self.state.coverage;
      },
      /** internos (depuração/ferramentas) */
      get _internal() {
        return self;
      },
      /** sombra aproximada (CPU) no ponto: 1 = sol livre */
      shadowAt(worldPos) {
        const c = ctx.space.planetCenter;
        const d = new THREE.Vector3(worldPos.x - c.x, worldPos.y - c.y, worldPos.z - c.z).normalize();
        const cov = self.state.coverage;
        void d;
        return 1 - 0.6 * cov;
      },
    });
  },

  regen(ctx) {
    const info = ctx.services.universe?.currentPlanet;
    const seed = (info?.seed ?? this.seed) >>> 0;
    if (seed === this.seed) return;
    this.seed = seed;
    this.weatherMap.dispose();
    this.weatherMap = generateWeatherMap(ctx.renderer, seed ^ 0x5bd1e995, 256);
    this.passes.U.uWeather.value = this.weatherMap.texture;
    this.passes.histCount = 0;
  },

  applyQuality(ctx) {
    const q = ctx.quality;
    const lvl = Math.max(0, Math.min(3, q.cloudQuality ?? 2));
    const Q = QUALITY[lvl];
    const ps = this.passes;
    ps.scale = Number(ctx.params.get('cloudScale')) || Q.scale;
    ps.marchU.uSteps.value = Number(ctx.params.get('cloudSteps')) || Q.steps;
    ps.marchU.uLightSteps.value = Q.light;
    ps.marchU.uCirrus.value = lvl === 0 ? 0 : 0.7;
    ps.histCount = 0;
  },

  frame(dt, ctx) {
    const ps = this.passes;
    const { space, camera, player } = ctx;
    const P = this.P;
    const S = this.state;
    const planet = ctx.services.planet;
    const sky = ctx.services.sky;
    const W = ctx.services.weather;
    const U = ps.U;
    const M = ps.marchU;

    // ─── camada ───────────────────────────────────────────────────────
    const R = planet?.radius || 120000;
    const sea = Math.max(0, planet?.seaLevel ?? 0);
    const biome = ctx.services.universe?.currentPlanet?.biome || P.biome || P.atmoBiome || 'default';
    const lay = LAYER[biome] || LAYER.default;
    const bottom = P.cloudBase ?? W?.cloud?.base ?? lay[0];
    const top = P.cloudTop ?? W?.cloud?.top ?? lay[1];
    this.layer = [bottom, top];
    U.uRin.value = R + sea + bottom;
    U.uRout.value = R + sea + top;
    M.uRground.value = R + Math.min(0, planet?.seaLevel ?? 0) - 400;
    M.uCirrusR.value = R + sea + top + 4200;

    // atmosfera ausente (mundo sem ar) → sem nuvens
    const hasAir = !sky?.params || sky.params.has !== false;
    const wc = W?.cloud || {};
    const cov = P.cloudCoverage ?? wc.coverage ?? W?.cloudCoverage ?? 0.45;
    S.coverage = hasAir ? cov : 0;
    ps.cloudsOn = P.clouds !== false && hasAir && S.coverage > 0.01 && ctx.params.get('clouds') !== '0';

    // câmera relativa ao centro do planeta (double → float)
    const o = space.origin;
    const c = space.planetCenter;
    const cx = o.x - c.x;
    const cy = o.y - c.y;
    const cz = o.z - c.z;
    U.uCamPos.value.set(cx, cy, cz);
    const camR = Math.hypot(cx, cy, cz);
    if (camR > R * 6) ps.cloudsOn = false;
    this._frameInfo.camWorld.set(o.x, o.y, o.z);
    this._frameInfo.static = !!ctx.time.frozen;
    const up = (S._up ||= new THREE.Vector3()).set(cx, cy, cz).divideScalar(Math.max(1, camR));

    // ─── clima → densidade ─────────────────────────────────────────────
    U.uCoverage.value = S.coverage;
    U.uTypeBias.value = P.cloudType ?? wc.typeBias ?? 0;
    U.uStorm.value = wc.storm ?? 0;
    const lv = W?.levels;
    M.uRainShaft.value = lv ? Math.min(1, (lv.rain || 0) + (lv.acid || 0) + 0.6 * (lv.snow || 0)) : 0;
    U.uDetailAmt.value = wc.detail ?? this.tune.detail;
    const dark = wc.darkness ?? 0;
    U.uSigma.value = this.tune.sigma * (1 + dark * 0.8) * (wc.density ?? 1);
    ps._shadowStrength = 0.82 * (P.cloudShadow ?? 1);
    M.uCirrus.value = (ctx.quality.cloudQuality ?? 2) > 0 ? (wc.cirrus ?? 0.7) * (P.cirrus ?? 1) : 0;

    // vento: deriva da textura (referencial do planeta) + rotação lenta do mapa de clima
    const t = ctx.time.world || 0;
    const tdt = S.lastT == null ? 0 : Math.max(0, Math.min(1, t - S.lastT));
    S.lastT = t;
    const wind = W?.wind;
    const fr = (S._fr ||= { e: new THREE.Vector3(), n: new THREE.Vector3() });
    fr.e.set(0, 1, 0).cross(up);
    if (fr.e.lengthSq() < 1e-6) fr.e.set(1, 0, 0);
    fr.e.normalize();
    fr.n.copy(up).cross(fr.e).normalize();
    const we = wind ? wind.x : 8;
    const wn = wind ? wind.z ?? 0 : 3;
    const wv = (S._wv ||= new THREE.Vector3()).copy(fr.e).multiplyScalar(we).addScaledVector(fr.n, wn);
    S.windOff.addScaledVector(wv, tdt * U.uShapeScale.value);
    S.detOff.addScaledVector(wv, tdt * U.uDetailScale.value * 1.6).addScaledVector(up, -tdt * 0.6 * U.uDetailScale.value);
    for (const k of ['x', 'y', 'z']) {
      S.windOff[k] -= Math.floor(S.windOff[k]);
      S.detOff[k] -= Math.floor(S.detOff[k]);
    }
    U.uShapeOff.value.copy(S.windOff);
    U.uDetailOff.value.copy(S.detOff);
    U.uShear.value.copy(wv).multiplyScalar(0.012 / Math.max(1, wv.length()));
    S.drift = (t * Math.hypot(we, wn) * 0.15) / R;
    U.uWeatherRot.value.setFromMatrix4((S._rm ||= new THREE.Matrix4()).makeRotationY(S.drift));

    // ─── luz ──────────────────────────────────────────────────────────
    const su = sky?.uniforms;
    let sunDir = sky?.sunDirection || up;
    let sunE = null;
    if (ps.hasAtmo && su?.uLightE) {
      const ld = su.uLightDir.value;
      const le = su.uLightE.value;
      const sunUp = ld[0].dot(up);
      // noite: a lua dominante vira a luz das nuvens
      if (sunUp < -0.15 && le[2].x + le[2].y + le[2].z > 0) {
        sunDir = ld[2];
        sunE = le[2];
      } else {
        sunDir = ld[0];
        sunE = le[0];
      }
      M.uSunE.value.copy(sunE).multiplyScalar((P.cloudSun ?? 1) * this.tune.sun);
    } else {
      const sc = sky?.sunColor;
      const si = sky?.sunIntensity ?? 3;
      M.uSunE.value.set((sc?.r ?? 1) * si, (sc?.g ?? 1) * si, (sc?.b ?? 1) * si);
    }
    U.uSunDir.value.copy(sunDir).normalize();
    // ambiente: irradiância do céu (sky.ambient) → radiância; escurece na tempestade
    const amb = sky?.ambient;
    const ai = (amb?.intensity ?? 0.5) / Math.PI;
    const ac = amb?.color || { r: 0.6, g: 0.75, b: 1 };
    const ambK = (1 - 0.55 * dark) * (P.cloudAmbient ?? 1);
    const kt = this.tune.ambTop * ai * ambK;
    const kb = this.tune.ambBottom * ai * ambK;
    M.uAmbTop.value.set(ac.r * kt, ac.g * kt, ac.b * kt);
    M.uAmbBottom.value.set(ac.r * kb, ac.g * kb, ac.b * kb);
    M.uMsA.value = this.tune.msA;
    M.uMsB.value = this.tune.msB;
    M.uMsC.value = this.tune.msC;
    M.uPowder.value = this.tune.powder;
    // luz refletida pelo chão na base das nuvens
    const ga = sky?.params?.groundAlbedo || [0.15, 0.15, 0.13];
    const cosS = Math.max(0, U.uSunDir.value.dot(up));
    const se = M.uSunE.value;
    const gb = (cosS * 0.35) / Math.PI;
    M.uGroundBounce.value.set(se.x * ga[0] * gb, se.y * ga[1] * gb, se.z * ga[2] * gb).multiplyScalar(1 - dark * 0.7);
    if (!ps.hasAtmo) {
      const fog = sky?.fogAt?.(o);
      const fc = fog?.color || { r: 0.5, g: 0.6, b: 0.8 };
      M.uHazeColor.value.set(fc.r, fc.g, fc.b);
    }

    // relâmpago (weather)
    const lt = W?.lightning;
    if (lt && lt.flash > 0 && lt.worldPos) {
      M.uFlashPos.value.set(lt.worldPos.x - c.x, lt.worldPos.y - c.y, lt.worldPos.z - c.z);
      const col = lt.color || [0.75, 0.82, 1];
      const e = lt.flash * 6;
      M.uFlashE.value.set(col[0] * e, col[1] * e, col[2] * e);
    } else M.uFlashE.value.set(0, 0, 0);

    // ─── neblina do clima ─────────────────────────────────────────────
    const fog = W?.fog;
    const cu = ps.compU;
    cu.uUp.value.copy(up);
    if (fog && fog.density > 0) {
      const alt = Math.max(0, player.altitude ?? 0);
      const H = fog.height || 900;
      cu.uFogSigma.value = fog.density * Math.exp(-alt / H);
      cu.uFogH.value = H;
      const fcol = fog.color || [0.5, 0.5, 0.5];
      cu.uFogColor.value.set(fcol[0], fcol[1], fcol[2]);
      cu.uFogMax.value = fog.maxDist || 60000;
      ps.fogOn = true;
    } else {
      cu.uFogSigma.value = 0;
      ps.fogOn = false;
    }

    // ─── câmera ───────────────────────────────────────────────────────
    camera.updateMatrixWorld();
    ps.setCorners(camera);
    U.uNear.value = camera.near;
    U.uFar.value = camera.far;
    M.uMaxDist.value = camR > U.uRout.value ? 2.2e6 : 180000;

    if (this.readyDone && (ps.histCount >= this.shotFrames || !ps.cloudsOn)) {
      this.readyDone();
      this.readyDone = null;
    }
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    this.removeShadow?.();
    this.removeClouds?.();
    this.passes?.dispose();
    this.noise?.shape.dispose();
    this.noise?.detail.dispose();
    this.weatherMap?.dispose();
    this.readyDone?.();
    void ctx;
  },
};
