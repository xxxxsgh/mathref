/**
 * Feature `rendering` — iluminação global e compositor de pós-processamento.
 *
 * O que esta feature faz (todas as peças estão nesta pasta):
 *  - Atmosfera física (Atmosphere.js): céu por espalhamento Rayleigh/Mie/ozônio
 *    via sky-view LUT, nuvens fbm iluminadas, disco solar; o mesmo céu vira
 *    ambiente PMREM (IBL) em scene.environment e na viewmodel.
 *  - Sombra do sol ajustada à câmera com snap de texel (Shadows.js) e PCF
 *    suave; luz de rebatimento (GI falso) do chão iluminado.
 *  - Poeira em suspensão iluminada só dentro dos feixes de sol (Dust.js).
 *  - Pipeline HDR próprio (ctx.setRenderPipeline):
 *      cena (MSAA, HalfFloat, depth) ─┬─ AO ½ res + blur bilateral
 *                                     ├─ volumétrico ½ res (shadow map) + blur
 *      viewmodel (alvo próprio, α) ───┴─ combine: motion blur, AO, névoa de
 *                                        altura/perspectiva aérea, god rays,
 *                                        viewmodel com DOF de ADS
 *      → cadeia de bloom (13-tap/tenda) → exposição automática
 *      → tonemap: ACES + gradação + aberração + sujeira de lente + vinheta
 *      → final: FXAA ou nitidez CAS, grão de filme, dithering → tela
 *  - Presets de qualidade (low/medium/high/ultra) com orçamento por passe
 *    (ver ORÇAMENTO abaixo) e troca ao vivo por `quality:change`.
 *
 * Serviço publicado: ctx.services.rendering (ver `api` em init()).
 * Contrato da cena: o world publica `sun` (DirectionalLight). Se o world
 * deixar `scene.background` como Color/null, o céu físico assume; se puser
 * uma textura, ela é respeitada. `scene.fog` do world é substituída pela
 * névoa de altura do compositor (os parâmetros dela viram dica de densidade).
 *
 * ORÇAMENTO (GPU intermediária, 1080p, preset high — alvo ≤ 3,5 ms de pós):
 *   AO ½ res 12 amostras + 2 blurs ≈ 0,6 ms · volumétrico ½ res 20 passos ≈ 0,7 ms
 *   combine ≈ 0,4 ms · bloom 6 níveis ≈ 0,5 ms · tonemap+final ≈ 0,5 ms
 *   céu: LUT 192×108 e PMREM só quando o sol muda.
 */
import * as THREE from 'three';
import { Atmosphere } from './Atmosphere.js';
import { ShadowFitter } from './Shadows.js';
import { Dust } from './Dust.js';
import { SkyOcclusion } from './SkyOcclusion.js';
import { SunView } from './SunView.js';
import { LocalProbe } from './LocalProbe.js';
import { makeLensDirt } from './LensDirt.js';
import { FsQuad, postMaterial, makeTarget } from './FsQuad.js';
import {
  AO_FRAG, BLUR_FRAG, VOLUMETRIC_FRAG, COMBINE_FRAG, BLOOM_DOWN_FRAG,
  BLOOM_UP_FRAG, EXPOSURE_FRAG, TONEMAP_FRAG, FINAL_FRAG, COMMON, GI_FRAG, TAA_FRAG,
} from './shaders.js';

/** Configuração por nível de qualidade (o que cada preset liga e quanto custa). */
const TIERS = {
  low: { msaa: 0, ao: false, aoSamples: 6, vol: false, volSteps: 12, bloomLevels: 5, motion: false, dust: 0, fxaa: true, sharpen: 0.0, dirt: false, gi: 0, taa: false, contact: false, far: 1024 },
  medium: { msaa: 4, ao: true, aoSamples: 10, vol: false, volSteps: 14, bloomLevels: 6, motion: false, dust: 0, fxaa: false, sharpen: 0.3, dirt: true, gi: 12, taa: false, contact: true, far: 1024 },
  // high/ultra: TAA substitui o MSAA (high) — resolve fios finos, brilho especular e o ruído de AO/GI/volumétrico
  high: { msaa: 0, ao: true, aoSamples: 14, vol: true, volSteps: 20, bloomLevels: 6, motion: true, dust: 700, fxaa: false, sharpen: 0.5, dirt: true, gi: 16, taa: true, contact: true, far: 2048 },
  ultra: { msaa: 4, ao: true, aoSamples: 18, vol: true, volSteps: 28, bloomLevels: 7, motion: true, dust: 1100, fxaa: false, sharpen: 0.45, dirt: true, gi: 24, taa: true, contact: true, far: 2048 },
};

/** Parâmetros artísticos padrão (todos ajustáveis pelo serviço). */
function defaultParams() {
  return {
    exposure: 1.0,          // compensação manual (multiplicador)
    autoExposure: { enabled: true, key: 0.14, strength: 0.55, minEV: -2.0, maxEV: 2.2, biasEV: 0.0, speedUp: 2.5, speedDown: 1.4 },
    environmentIntensity: 0.55,
    indoorAmbient: 0.62,    // fração extra do ambiente sob teto (o world já escurece o interior dele)
    coveredAmbient: 0.4,    // quanto do ambiente a CENA já tem sob teto (estimativa p/ albedo)
    bounce: 0.1,            // luz de rebatimento fake (só sem GI)
    indoorTint: new THREE.Color(1.08, 1.0, 0.88), // tom da luz indireta sob teto
    // GI de 1 rebatimento do sol (RSM). strength > 1 compensa os rebatimentos
    // múltiplos (1/(1−ρ)) e a luz que entra pelas janelas
    gi: { strength: 3.2, radius: 8 },
    contact: 0.85,          // sombras de contato em espaço de tela
    ao: { radius: 1.8, intensity: 4.2, bias: 0.6, strength: 1.0 },
    fog: { density: 0.0014, falloff: 0.045, base: 0.0, start: 18, max: 0.92, tint: new THREE.Color(1, 1, 1), sun: 0.12 },
    taa: { alpha: 0.1, gamma: 1.0 },
    vol: { density: 0.0025, falloff: 0.09, base: 0.0, maxDist: 70, strength: 0.45, phaseG: 0.72, indoorDust: 22 },
    bloom: { strength: 0.05, radius: 1.0, dirt: 0.5 },
    grade: {
      whiteBalance: new THREE.Color(1.02, 1.0, 0.965),
      contrast: 1.3,
      saturation: 1.08,
      // split-toning: sombras levemente frias (azul-petróleo), altas quentes
      shadowTint: new THREE.Color(0.93, 0.99, 1.06),
      highlightTint: new THREE.Color(1.06, 1.0, 0.92),
      lift: new THREE.Color(0.004, 0.006, 0.009),
      gain: new THREE.Color(1.0, 1.0, 1.0),
    },
    clarity: 0.22,          // contraste local (micro-contraste estilo 'clarity')
    lens: { ca: 0.006, vignette: 0.3, grain: 0.032, sharpen: null },
    menuBlur: 0,
    motionBlur: 0.5,
    adsDof: 1.0,
  };
}

const rendering = {
  name: 'rendering',
  order: 20,

  async init(ctx) {
    const { renderer, scene, camera, quality, bus } = ctx;
    this.ctx = ctx;
    this.params = defaultParams();
    this.flashAmt = 0;
    this.debugView = null;
    this.frameIndex = 0;
    this.stats = { ms: 0, passes: 0 };

    // Base do renderer. PCFSoft foi depreciado no three r18x — PCF com
    // raio (amostragem Vogel) é o caminho suave.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // só para o pipeline padrão de fallback
    renderer.toneMappingExposure = 1.0;

    // ── sol, céu e ambiente ──
    const world = ctx.service('world');
    this.sun = world?.sun || null;
    this.atmo = new Atmosphere(renderer);
    this.sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
    this.shadowFit = new ShadowFitter();
    if (this.sun) this.shadowFit.readDirection(this.sun, this.sunDir);
    this.atmo.setSun(this.sunDir, this.sun?.intensity ?? 3);

    // Céu: o físico assume se o fundo for Color/null. Se o world tiver um
    // domo próprio (services.world.sky), ele é escondido — céu, IBL e névoa
    // precisam vir do MESMO modelo para casar (perspectiva aérea = céu).
    // Para manter o céu do world: ?sky=world ou rendering.setSky({ takeover: false }).
    const bg = scene.background;
    this.ownsSky = (!bg || bg.isColor) && ctx.params.get('sky') !== 'world';
    if (this.ownsSky) {
      scene.background = null;
      this.atmo.attach(scene, camera);
      this.worldSky = world?.sky || null;
      if (this.worldSky) this.worldSky.visible = false;
      if (world?.environment && scene.environment === world.environment) scene.environment = null;
    }
    if (scene.fog) {
      // névoa do world vira dica de densidade da névoa de altura
      const f = scene.fog;
      if (f.isFogExp2) this.params.fog.density = Math.min(0.0013, f.density * 0.3);
      scene.fog = null;
    }
    this.atmo.updateLut(true);
    this.env = this.atmo.updateEnvironment(true);
    this.applyEnvironment();

    // luz de rebatimento (GI falso): vem de baixo, cor do chão iluminado
    this.bounceLight = new THREE.DirectionalLight(0xffffff, 0);
    this.bounceLight.name = 'ironline-bounce';
    this.bounceLight.castShadow = false;
    scene.add(this.bounceLight, this.bounceLight.target);

    // poeira
    this.dust = null;

    // oclusão de céu (interiores mais escuros que a rua, janelas estouram)
    this.skyOcc = new SkyOcclusion(512, 110);
    this.atmo.dome.userData.noSkyOcclusion = true;
    this.atmo.dome.userData.noSunView = true;

    // vistas do sol: RSM (GI) e cascata larga de sombra
    this.rsm = new SunView({ size: 256, radius: 24, color: true, forward: 0.35, depthRange: 400 });
    this.farView = null; // criado em configure() (tamanho por qualidade)
    this.ambient = new THREE.Color(0.1, 0.1, 0.1);
    this.ambientDirty = true;
    this.jitter = new THREE.Vector2();
    // sonda de reflexo local para a viewmodel (medium+)
    this.probe = ctx.quality.level === 'low' ? null : new LocalProbe(renderer, ctx.quality.level === 'ultra' ? 192 : 128);
    this.taaFrames = 0;

    // ── pipeline ──
    this.dirtTex = makeLensDirt(11);
    this.buildMaterials();
    this.configure();

    this.offs = [
      bus.on('resize', () => this.resize()),
      bus.on('quality:change', () => this.configure()),
    ];
    this.prevViewProj = new THREE.Matrix4();
    this.hasPrev = false;

    ctx.setRenderPipeline((c, dt) => this.render(c, dt));

    const self = this;
    const P = this.params;
    this.api = ctx.provide('rendering', {
      /** Compensação manual de exposição (multiplicador; 1 = neutro). */
      setExposure(v) {
        P.exposure = v;
        renderer.toneMappingExposure = v;
      },
      get exposure() { return P.exposure; },
      /** Ambiente PMREM do céu (Texture) — use em envMap se precisar. */
      get environment() { return self.env; },
      get environmentIntensity() { return P.environmentIntensity; },
      set environmentIntensity(v) { P.environmentIntensity = v; self.applyEnvironment(); self.ambientDirty = true; },
      /** Direção (normalizada) PARA o sol e cor física dele (transmitância × intensidade). */
      get sunDirection() { return self.sunDir; },
      get sunColor() { return self.atmo.uniforms.uSunColor.value; },
      /** Transmitância atmosférica pura (0..1) — cor "física" do sol. */
      get sunTransmittance() { return self.atmo.sunTransmittance; },
      /** Patches parciais. Ex.: setFog({ density: 0.004 }). */
      setFog(p) { Object.assign(P.fog, p); },
      setVolumetrics(p) { Object.assign(P.vol, p); },
      setAO(p) { Object.assign(P.ao, p); },
      setBloom(p) { Object.assign(P.bloom, p); },
      setGrade(p) { Object.assign(P.grade, p); },
      setLens(p) { Object.assign(P.lens, p); },
      setAutoExposure(p) { Object.assign(P.autoExposure, p); },
      /** GI do sol (RSM): { strength, radius }. strength 0 desliga. */
      setGI(p) { Object.assign(P.gi, p); },
      /** Sombras de contato (0..1). */
      setContact(v) { P.contact = v; },
      /** TAA: { alpha, gamma }. */
      setTAA(p) { Object.assign(P.taa, p); },
      /** Radiância ambiente estimada (E/π do céu + hemisfério) — usada pelo GI. */
      get ambient() { return self.ambient; },
      /** Céu: { haze, cloudCover, cloudDensity, skyScale, sunDisk, groundAlbedo }. */
      setSky(p) {
        if ('takeover' in p) {
          self.atmo.dome.visible = !!p.takeover;
          if (self.worldSky) self.worldSky.visible = !p.takeover;
        }
        Object.assign(self.atmo.params, p);
        self.atmo.uniforms.uCloudCover.value = self.atmo.params.cloudCover;
        self.atmo.uniforms.uCloudDensity.value = self.atmo.params.cloudDensity;
        self.atmo.uniforms.uSunDisk.value = self.atmo.params.sunDisk;
        self.atmo.uniforms.uSkySat.value = self.atmo.params.skySaturation;
        self.atmo.dirty = true;
      },
      /** Desfoque do mundo atrás de menus (0..1). */
      setMenuBlur(v) { P.menuBlur = v; },
      /** Clarão de tela (explosão/flashbang): soma HDR que decai sozinho. */
      flash(v = 1) { self.flashAmt = Math.max(self.flashAmt, v); },
      /** 'ao' | 'vol' | 'depth' | 'bloom' | 'occ' | 'gi' | 'albedo' | null — depuração. */
      setDebug(v) { self.debugView = v || null; },
      get params() { return P; },
      get stats() { return self.stats; },
      /** Lê a exposição automática atual (debug; força sync com a GPU). */
      readExposure() {
        const t = self.rt?.exp[self.expIndex];
        if (!t) return null;
        const buf = new Uint16Array(4);
        renderer.readRenderTargetPixels(t, 0, 0, 1, 1, buf);
        return { exposure: THREE.DataUtils.fromHalfFloat(buf[0]), avgLum: THREE.DataUtils.fromHalfFloat(buf[1]) };
      },
      get hdr() { return true; },
    });
  },

  // ─── materiais dos passes ───────────────────────────────────────────────
  buildMaterials() {
    const U = (v) => ({ value: v });
    const common = () => ({ uProjInv: U(new THREE.Matrix4()), uNearFar: U(new THREE.Vector2(0.05, 700)) });
    this.mats = {
      ao: postMaterial('ao', AO_FRAG, {
        ...common(), tDepth: U(null), uFullTexel: U(new THREE.Vector2()), uAoRes: U(new THREE.Vector2()),
        uRadius: U(1), uIntensity: U(1), uBias: U(0.5), uProjScale: U(500), uFrame: U(0),
      }, { AO_SAMPLES: 12 }),
      blur: postMaterial('blur', BLUR_FRAG, { ...common(), tSrc: U(null), tDepth: U(null), uDir: U(new THREE.Vector2()), uDepthSharp: U(8) }),
      vol: postMaterial('vol', VOLUMETRIC_FRAG, {
        ...common(), tDepth: U(null), tShadow: U(null), uViewInv: U(new THREE.Matrix4()), uShadowMatrix: U(new THREE.Matrix4()),
        uCamPos: U(new THREE.Vector3()), uMaxDist: U(60), uDensity: U(0.01), uHeightFalloff: U(0.1), uBaseHeight: U(0),
        uFrame: U(0), uShadowBias: U(0.0015), tSkyOcc: U(null), uSkyOccMatrix: U(new THREE.Matrix4()), uIndoorDust: U(0),
        tRsmDepth: U(null), uRsmMatrix: U(new THREE.Matrix4()), uRsmOn: U(0),
      }, { VOL_STEPS: 20 }),
      combine: postMaterial('combine', COMBINE_FRAG, {
        ...common(), tScene: U(null), tDepth: U(null), tAo: U(null), tVol: U(null), tVm: U(null), tLut: U(this.atmo.lut.texture), tGi: U(null),
        uViewInv: U(new THREE.Matrix4()), uProj: U(new THREE.Matrix4()), uPrevViewProj: U(new THREE.Matrix4()), uCamPos: U(new THREE.Vector3()),
        uSunDir: U(this.sunDir), uSunDirView: U(new THREE.Vector3()), uSunRadiance: U(new THREE.Color()), uSunIrr: U(new THREE.Color()),
        uAmbient: U(new THREE.Color()), uCoveredAmb: U(0.4), uSkyScale: U(1), uAoStrength: U(0), uGiStrength: U(0), uContact: U(0),
        uFogDensity: U(0), uFogFalloff: U(0.05), uFogBase: U(0), uFogStart: U(10), uFogMax: U(0.9), uFogTint: U(new THREE.Color(1, 1, 1)), uFogSun: U(0),
        uVolStrength: U(0), uPhaseG: U(0.6), uMotion: U(0), uVmBlur: U(0), uVmOn: U(1), uRes: U(new THREE.Vector2()), uFrame: U(0),
        tSkyOcc: U(null), uSkyOccMatrix: U(new THREE.Matrix4()), uSkyOccOn: U(0), uIndoor: U(0.4), uIndoorTint: U(new THREE.Color(1, 1, 1)), uDebug: U(0),
        tShadow: U(null), uShadowMatrix: U(new THREE.Matrix4()),
        tFar: U(null), uFarMatrix: U(new THREE.Matrix4()), uFarOn: U(0), uFarTexel: U(new THREE.Vector2()),
      }),
      gi: postMaterial('gi', GI_FRAG, {
        ...common(), tDepth: U(null), tRsmColor: U(null), tRsmDepth: U(null), uViewInv: U(new THREE.Matrix4()),
        uRsmMatrix: U(new THREE.Matrix4()), uRsmInv: U(new THREE.Matrix4()), uSunDir: U(this.sunDir), uRadiusUv: U(0.1),
        uSampleArea: U(1), uRsmTexel: U(new THREE.Vector2()), uFullTexel: U(new THREE.Vector2()), uFrame: U(0),
        tSkyOcc: U(null), uSkyOccMatrix: U(new THREE.Matrix4()), uSkyOccOn: U(0),
      }, { GI_SAMPLES: 16 }),
      taa: postMaterial('taa', TAA_FRAG, {
        ...common(), tCur: U(null), tHist: U(null), tDepth: U(null), tVm: U(null), uViewInv: U(new THREE.Matrix4()),
        uPrevViewProj: U(new THREE.Matrix4()), uCamPos: U(new THREE.Vector3()), uTexel: U(new THREE.Vector2()),
        uAlpha: U(0.1), uHistValid: U(0), uGamma: U(1),
      }),
      down: postMaterial('bloom-down', BLOOM_DOWN_FRAG, { ...common(), tSrc: U(null), uTexel: U(new THREE.Vector2()), uKaris: U(0) }),
      up: postMaterial('bloom-up', BLOOM_UP_FRAG, { ...common(), tLow: U(null), tCur: U(null), uTexel: U(new THREE.Vector2()), uRadius: U(1), uCurWeight: U(1) }),
      exposure: postMaterial('exposure', EXPOSURE_FRAG, {
        ...common(), tSmall: U(null), tPrev: U(null), uRate: U(1), uKey: U(0.16), uStrength: U(0.6),
        uRange: U(new THREE.Vector2(-2, 2)), uBiasEV: U(0),
      }),
      tonemap: postMaterial('tonemap', TONEMAP_FRAG, {
        ...common(), tHdr: U(null), tBloom: U(null), tExposure: U(null), tDirt: U(this.dirtTex),
        uBloom: U(0.05), uDirt: U(1), uExposure: U(1), uCA: U(0), uMenuBlur: U(0),
        uWhiteBalance: U(new THREE.Color()), uContrast: U(1), uSaturation: U(1),
        uShadowTint: U(new THREE.Color()), uHighlightTint: U(new THREE.Color()), uLift: U(new THREE.Color()), uGain: U(new THREE.Color()),
        uVignette: U(0.3), uFlash: U(0), uClarity: U(0), uRes: U(new THREE.Vector2()),
      }),
      final: postMaterial('final', FINAL_FRAG, {
        ...common(), tLdr: U(null), uTexel: U(new THREE.Vector2()), uGrain: U(0.03), uSharpen: U(0), uFxaa: U(0), uTime: U(0),
      }),
      debug: postMaterial('debug', `${COMMON}
        uniform sampler2D tSrc; uniform float uMode;
        void main() {
          vec4 c = texture(tSrc, vUv);
          vec3 o = uMode < 0.5 ? c.rrr : uMode < 1.5 ? vec3(c.r * 4.0) : uMode < 2.5 ? vec3(fract(linearZ(c.r) / 20.0)) : uMode < 3.5 ? c.rgb / (1.0 + c.rgb) : c.rgb;
          outColor = vec4(pow(o, vec3(1.0 / 2.2)), 1.0);
        }`, { ...common(), tSrc: U(null), uMode: U(0) }),
    };
    this.quad = new FsQuad(this.mats.final);
  },

  /** (Re)configura alvos e defines conforme ctx.quality. */
  configure() {
    const q = this.ctx.quality;
    const tier = { ...(TIERS[q.level] || TIERS.high) };
    if (!q.msaa) tier.msaa = 0;
    if (!q.ssao) tier.ao = false;
    if (!q.volumetrics) tier.vol = false;
    if (!q.motionBlur) tier.motion = false;
    if (q.taa === false) tier.taa = false;
    // sem TAA, o MSAA volta (se a qualidade permitir)
    if (q.msaa && tier.msaa === 0 && !tier.taa) tier.msaa = 4;
    if (!q.shadows) tier.far = 0;
    tier.bloom = q.bloom !== false;
    this.tier = tier;

    this.shadowFit.configure(q);
    const setDef = (m, k, v) => {
      if (m.defines[k] !== v) {
        m.defines[k] = v;
        m.needsUpdate = true;
      }
    };
    setDef(this.mats.ao, 'AO_SAMPLES', tier.aoSamples);
    setDef(this.mats.vol, 'VOL_STEPS', tier.volSteps);
    if (tier.gi) setDef(this.mats.gi, 'GI_SAMPLES', tier.gi);
    if (this.farView && (!tier.far || this.farView.size !== tier.far)) {
      this.farView.dispose();
      this.farView = null;
    }
    if (tier.far && !this.farView) this.farView = new SunView({ size: tier.far, radius: 190, color: false, forward: 0.55, depthRange: 700 });
    this.taaFrames = 0;

    // poeira (só high/ultra)
    const scene = this.ctx.scene;
    if (this.dust && (!tier.dust || this.dust.count !== tier.dust)) {
      scene.remove(this.dust.points);
      this.dust.dispose();
      this.dust = null;
    }
    if (tier.dust && !this.dust && this.sun) {
      this.dust = new Dust(tier.dust, 16);
      this.dust.count = tier.dust;
      scene.add(this.dust.points);
    }
    this.disposeTargets();
    this.resize();
  },

  disposeTargets() {
    if (!this.rt) return;
    for (const v of Object.values(this.rt)) {
      if (Array.isArray(v)) v.forEach((t) => t.dispose());
      else v?.dispose?.();
    }
    this.rt = null;
  },

  resize() {
    const { renderer } = this.ctx;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    if (this.rt && this.size?.x === w && this.size?.y === h) return;
    this.disposeTargets();
    this.size = new THREE.Vector2(w, h);
    const t = this.tier;
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);

    const depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    const sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: t.msaa,
      depthBuffer: true,
      depthTexture,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    sceneRT.texture.colorSpace = THREE.NoColorSpace;
    const vmRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: t.msaa,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    vmRT.texture.colorSpace = THREE.NoColorSpace;

    const bloom = [], bloomUp = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < t.bloomLevels; i++) {
      bloom.push(makeTarget(bw, bh));
      bloomUp.push(makeTarget(bw, bh));
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
    }
    const exp = [0, 1].map(() => makeTarget(1, 1, { type: THREE.HalfFloatType, filter: THREE.NearestFilter }));
    this.rt = {
      scene: sceneRT,
      vm: vmRT,
      ao: makeTarget(hw, hh, { type: THREE.UnsignedByteType }),
      ao2: makeTarget(hw, hh, { type: THREE.UnsignedByteType }),
      vol: makeTarget(hw, hh),
      vol2: makeTarget(hw, hh),
      combine: makeTarget(w, h),
      gi: makeTarget(Math.ceil(w / 4), Math.ceil(h / 4)),
      gi2: makeTarget(Math.ceil(w / 4), Math.ceil(h / 4)),
      hist: t.taa ? [makeTarget(w, h), makeTarget(w, h)] : [],
      ldr: makeTarget(w, h, { type: THREE.UnsignedByteType }),
      bloom,
      bloomUp,
      exp,
      white: makeTarget(1, 1, { type: THREE.UnsignedByteType }),
      zero: makeTarget(1, 1),
    };
    this.expIndex = 0;
    this.histIndex = 0;
    this.taaFrames = 0;
    this.expPrimed = false;
    this.needsClears = true;
  },

  // ─── por frame: sol, céu, sombra, poeira ─────────────────────────────
  frame(dt, ctx) {
    const { camera } = ctx;
    const sun = this.sun || ctx.service('world')?.sun || null;
    if (sun && !this.sun) this.sun = sun;
    if (sun) {
      this.shadowFit.readDirection(sun, this.sunDir);
      if (this.shadowFit.update(sun, camera, this.sunDir)) this.shadowDirty = true;
    }
    const intensity = sun?.intensity ?? 3;
    this.atmo.setSun(this.sunDir, intensity);
    this.atmo.uniforms.uTime.value = ctx.time.now;
    if (this.atmo.updateLut()) {
      this.ambientDirty = true;
      const env = this.atmo.updateEnvironment();
      if (env) {
        this.env = env;
        this.applyEnvironment();
      }
    }

    // rebatimento: de baixo, oposto ao azimute do sol, cor = chão × sol
    const bl = this.bounceLight;
    const up = Math.max(this.sunDir.y, 0);
    bl.position.set(-this.sunDir.x * 0.5, -1, -this.sunDir.z * 0.5).add(camera.position);
    bl.target.position.copy(camera.position);
    bl.target.updateMatrixWorld();
    bl.color.copy(this.atmo.params.groundAlbedo).multiply(this.atmo.sunTransmittance);
    // com GI real (RSM) a luz fake sai de cena
    bl.intensity = this.tier?.gi && this.params.gi.strength > 0 ? 0 : intensity * this.params.bounce * up * 2.5;
    if (this.ambientDirty) this.updateAmbient(ctx);

    if (this.dust) {
      const h = this.size?.y || 1080;
      const pxScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      this.dust.update(camera, sun, this.atmo.uniforms.uSunColor.value, ctx.time.now, pxScale);
      this.dust.uniforms.uIntensity.value = 0.35;
    }
    this.flashAmt *= Math.exp(-(dt || 1 / 60) * 3.5);
  },

  /**
   * Radiância ambiente equivalente que os materiais da cena recebem
   * (IBL difuso do céu × environmentIntensity + hemisfério do world). O
   * compositor divide a cor da cena por isso (+ sol) para estimar o albedo e
   * então somar GI/AO/sombras como diferenças de luz.
   */
  updateAmbient(ctx) {
    const a = this.atmo.readAmbient(ctx.renderer);
    if (!a) return;
    this.ambientDirty = false;
    const amb = this.ambient.setRGB(0, 0, 0);
    if (ctx.scene.environment) {
      amb.r = (a.up.r + a.side.r) * 0.5;
      amb.g = (a.up.g + a.side.g) * 0.5;
      amb.b = (a.up.b + a.side.b) * 0.5;
      amb.multiplyScalar(ctx.scene.environmentIntensity ?? 1);
    }
    const hemi = ctx.service('world')?.hemi;
    if (hemi?.visible !== false && hemi?.isHemisphereLight) {
      const k = hemi.intensity / Math.PI;
      amb.r += (hemi.color.r * 0.75 + hemi.groundColor.r * 0.25) * k;
      amb.g += (hemi.color.g * 0.75 + hemi.groundColor.g * 0.25) * k;
      amb.b += (hemi.color.b * 0.75 + hemi.groundColor.b * 0.25) * k;
    }
  },

  applyEnvironment() {
    const { scene, vm } = this.ctx;
    if (!this.env) return;
    if (!scene.environment || scene.environment === this.prevEnv) scene.environment = this.env;
    scene.environmentIntensity = this.params.environmentIntensity;
    // viewmodel: reflexos do mesmo céu, salvo se a weapon definir o seu
    if (vm?.scene && !this.probe?.texture && (!vm.scene.environment || vm.scene.environment === this.prevEnv)) {
      vm.scene.environment = this.env;
      vm.scene.environmentIntensity = this.params.environmentIntensity * 0.9;
    }
    this.prevEnv = this.env;
  },

  // ─── render ───────────────────────────────────────────────────────────
  render(ctx, dt) {
    const t0 = performance.now();
    const { renderer, scene, camera, vm } = ctx;
    if (!this.rt) this.resize();
    const rt = this.rt;
    const M = this.mats;
    const P = this.params;
    const tier = this.tier;
    const q = this.quad;
    const w = this.size.x, h = this.size.y;
    let passes = 0;
    const draw = (mat, target) => {
      q.material = mat;
      q.render(renderer, target);
      passes++;
    };

    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    if (this.needsClears) {
      renderer.setClearColor(0xffffff, 1);
      renderer.setRenderTarget(rt.white);
      renderer.clear();
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rt.zero);
      renderer.clear();
      this.needsClears = false;
    }

    const sun = this.sun;
    const shadowsOn = !!(sun?.castShadow && renderer.shadowMap.enabled);
    const hideInSunView = [this.atmo.dome, this.dust?.points, this.worldSky].filter(Boolean);
    // 0) vistas do sol: RSM (GI) e cascata larga — só quando a câmera anda
    const giOn = !!(tier.gi && P.gi.strength > 0 && sun);
    if (giOn) {
      // a cada 6 quadros ou ao andar ~1,4 m (o custo é uma cena 256²)
      if (this.rsm.update(renderer, scene, camera, this.sunDir, { moveFrac: 0.06, maxAge: 6, hide: hideInSunView })) passes++;
    }
    const farOn = !!(this.farView && shadowsOn);
    if (farOn && this.farView.update(renderer, scene, camera, this.sunDir, { moveFrac: 0.08, maxAge: 240, hide: hideInSunView })) passes++;

    // sonda local → reflexos/IBL da viewmodel (só se a arma está à vista)
    if (this.probe && vm.visible) {
      const prevProbe = this.probe.texture;
      if (this.probe.update(scene, camera, { hide: [this.dust?.points] })) {
        passes += 6;
        const cur = vm.scene.environment;
        if (!cur || cur === this.env || cur === this.prevEnv || cur === prevProbe) vm.scene.environment = this.probe.texture;
      }
    }

    // jitter subpixel do TAA (Halton 2,3 · 16 amostras)
    const taaOn = !!(tier.taa && rt.hist.length);
    let jx = 0, jy = 0;
    if (taaOn) {
      const n = (frameJitter(this.frameIndex) % 16) + 1;
      jx = (halton(n, 2) - 0.5) * 2 / w;
      jy = (halton(n, 3) - 0.5) * 2 / h;
      camera.projectionMatrix.elements[8] += jx;
      camera.projectionMatrix.elements[9] += jy;
      vm.camera.projectionMatrix.elements[8] += jx;
      vm.camera.projectionMatrix.elements[9] += jy;
    }

    // Shadow map do sol sob demanda: re-renderiza quando o frustum muda
    // (câmera andou/sol girou) e, para objetos móveis (inimigos, portas), a
    // cada 2 quadros (3 no modo shot). O mapa de 4096² é o passe mais caro.
    renderer.shadowMap.autoUpdate = false;
    const every = ctx.shot ? 3 : 2;
    renderer.shadowMap.needsUpdate = !!this.shadowDirty || this.frameIndex % every === 0 || !sun?.shadow?.map;
    this.shadowDirty = false;

    // 1) cena do mundo
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(rt.scene);
    renderer.clear();
    renderer.render(scene, camera);
    passes++;

    // 2) viewmodel em alvo próprio (α pré-multiplicado)
    const vmOn = vm.visible;
    if (vmOn) {
      // a viewmodel tem a própria luz com sombra (mapa pequeno): sempre atualiza
      renderer.shadowMap.needsUpdate = true;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rt.vm);
      renderer.clear();
      renderer.render(vm.scene, vm.camera);
      passes++;
    }
    renderer.setClearColor(prevClear, prevAlpha);
    if (taaOn) {
      camera.projectionMatrix.elements[8] -= jx;
      camera.projectionMatrix.elements[9] -= jy;
      vm.camera.projectionMatrix.elements[8] -= jx;
      vm.camera.projectionMatrix.elements[9] -= jy;
    }
    // matrizes de reprojeção (sem jitter)
    const vp = _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!this.hasPrev) this.prevViewProj.copy(vp), (this.hasPrev = true);
    const prevVP = _pvp.copy(this.prevViewProj);
    this.prevViewProj.copy(vp);
    // ruído por quadro: com TAA acumulando, varia sempre (também no modo shot)
    const noiseFrame = taaOn ? this.frameIndex : ctx.shot ? 0 : this.frameIndex % 8;
    const occOn = !!this.skyOcc && (P.indoorAmbient < 0.999 || giOn);
    if (occOn) this.skyOcc.update(renderer, scene, camera);

    const depth = rt.scene.depthTexture;
    const setCommon = (m) => {
      m.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
      m.uniforms.uNearFar.value.set(camera.near, camera.far);
    };
    for (const m of Object.values(M)) setCommon(m);
    const frame = this.frameIndex++;

    // 3) AO
    let aoTex = rt.white.texture;
    if (tier.ao) {
      const u = M.ao.uniforms;
      u.tDepth.value = depth;
      u.uFullTexel.value.set(1 / w, 1 / h);
      u.uAoRes.value.set(rt.ao.width, rt.ao.height);
      u.uRadius.value = P.ao.radius;
      u.uIntensity.value = P.ao.intensity;
      u.uBias.value = P.ao.bias;
      u.uProjScale.value = rt.ao.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      u.uFrame.value = noiseFrame;
      draw(M.ao, rt.ao);
      this.blur(rt.ao, rt.ao2, depth, 10, draw);
      aoTex = rt.ao.texture;
    }

    // 3b) GI de um rebatimento (RSM), ¼ de resolução + blur bilateral
    let giTex = rt.zero.texture;
    if (giOn && this.rsm.valid) {
      const u = M.gi.uniforms;
      u.tDepth.value = depth;
      u.tRsmColor.value = this.rsm.rt.texture;
      u.tRsmDepth.value = this.rsm.rt.depthTexture;
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uRsmMatrix.value.copy(this.rsm.matrix);
      u.uRsmInv.value.copy(this.rsm.inverse);
      const R = P.gi.radius;
      u.uRadiusUv.value = R / (2 * this.rsm.radius);
      u.uSampleArea.value = (Math.PI * R * R) / (M.gi.defines.GI_SAMPLES || 16);
      u.uRsmTexel.value.set(1 / this.rsm.size, 1 / this.rsm.size);
      u.uFullTexel.value.set(1 / w, 1 / h);
      u.uFrame.value = noiseFrame;
      u.uSkyOccOn.value = occOn ? 1 : 0;
      if (occOn) {
        u.tSkyOcc.value = this.skyOcc.rt.depthTexture;
        u.uSkyOccMatrix.value.copy(this.skyOcc.matrix);
      }
      draw(M.gi, rt.gi);
      this.blur(rt.gi, rt.gi2, depth, 6, draw);
      giTex = rt.gi.texture;
    }

    // 4) volumétrico (precisa do shadow map do sol deste frame)
    let volTex = rt.zero.texture;
    const shadowTex = shadowsOn ? sun.shadow.map?.depthTexture : null;
    if (tier.vol && shadowTex && P.vol.strength > 0) {
      const u = M.vol.uniforms;
      u.tDepth.value = depth;
      u.tShadow.value = shadowTex;
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uShadowMatrix.value.copy(sun.shadow.matrix);
      camera.getWorldPosition(u.uCamPos.value);
      u.uMaxDist.value = P.vol.maxDist;
      u.uDensity.value = P.vol.density;
      u.uHeightFalloff.value = P.vol.falloff;
      u.uBaseHeight.value = P.vol.base;
      u.uFrame.value = taaOn ? frame : ctx.shot ? 0 : frame;
      if (occOn) {
        u.tSkyOcc.value = this.skyOcc.rt.depthTexture;
        u.uSkyOccMatrix.value.copy(this.skyOcc.matrix);
        u.uIndoorDust.value = P.vol.indoorDust;
      } else u.uIndoorDust.value = 0;
      u.uRsmOn.value = giOn && this.rsm.valid ? 1 : 0;
      if (u.uRsmOn.value) {
        u.tRsmDepth.value = this.rsm.rt.depthTexture;
        u.uRsmMatrix.value.copy(this.rsm.matrix);
      }
      draw(M.vol, rt.vol);
      this.blur(rt.vol, rt.vol2, depth, 4, draw);
      volTex = rt.vol.texture;
    }

    // 5) combine (mundo + viewmodel)
    {
      const u = M.combine.uniforms;
      u.tScene.value = rt.scene.texture;
      u.tDepth.value = depth;
      u.tAo.value = aoTex;
      u.tVol.value = volTex;
      u.tVm.value = vmOn ? rt.vm.texture : rt.zero.texture;
      u.uVmOn.value = vmOn ? 1 : 0;
      u.tGi.value = giTex;
      u.uGiStrength.value = giTex === rt.zero.texture ? 0 : P.gi.strength;
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uProj.value.copy(camera.projectionMatrix);
      camera.getWorldPosition(u.uCamPos.value);
      u.uPrevViewProj.value.copy(prevVP);
      u.uFrame.value = noiseFrame;
      u.uMotion.value = tier.motion && !ctx.shot ? P.motionBlur : 0;
      u.uSunRadiance.value.copy(this.atmo.uniforms.uSunColor.value);
      u.uSunDirView.value.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
      if (sun) u.uSunIrr.value.copy(sun.color).multiplyScalar(sun.intensity);
      else u.uSunIrr.value.setRGB(0, 0, 0);
      u.uAmbient.value.copy(this.ambient);
      u.uCoveredAmb.value = P.coveredAmbient;
      u.uContact.value = tier.contact ? P.contact : 0;
      u.uFogSun.value = P.fog.sun ?? 0;
      u.uFarOn.value = farOn && this.farView.valid ? 1 : 0;
      if (farOn) {
        u.tFar.value = this.farView.rt.depthTexture;
        u.uFarMatrix.value.copy(this.farView.matrix);
        u.uFarTexel.value.set(1 / this.farView.size, 1 / this.farView.size);
      }
      u.uSkyScale.value = this.atmo.uniforms.uSkyScale.value;
      u.uAoStrength.value = tier.ao ? P.ao.strength : 0;
      u.uFogDensity.value = P.fog.density;
      u.uFogFalloff.value = P.fog.falloff;
      u.uFogBase.value = P.fog.base;
      u.uFogStart.value = P.fog.start;
      u.uFogMax.value = P.fog.max;
      u.uFogTint.value.copy(P.fog.tint);
      u.uVolStrength.value = volTex === rt.zero.texture ? 0 : P.vol.strength;
      u.uPhaseG.value = P.vol.phaseG;
      const ads = ctx.service('weapon')?.ads || 0;
      u.uVmBlur.value = ads * P.adsDof;
      u.uRes.value.set(w, h);
      // oclusão de céu + sombra do sol na superfície
      if (occOn) {
        u.tSkyOcc.value = this.skyOcc.rt.depthTexture;
        u.uSkyOccMatrix.value.copy(this.skyOcc.matrix);
      }
      u.uSkyOccOn.value = occOn ? 1 : 0;
      u.uIndoor.value = P.indoorAmbient;
      u.uIndoorTint.value.copy(P.indoorTint);
      u.uDebug.value = { occ: 1, gi: 2, albedo: 3 }[this.debugView] || 0;
      const hasShadow = shadowTex ? 1 : 0;
      if ((M.combine.defines.HAS_SHADOW || 0) !== hasShadow) {
        if (hasShadow) M.combine.defines.HAS_SHADOW = 1;
        else delete M.combine.defines.HAS_SHADOW;
        M.combine.needsUpdate = true;
      }
      if (shadowTex) {
        u.tShadow.value = shadowTex;
        u.uShadowMatrix.value.copy(sun.shadow.matrix);
      }
      draw(M.combine, rt.combine);
    }

    // 5b) TAA: acumula o quadro com jitter no histórico reprojetado
    let hdr = rt.combine;
    if (taaOn) {
      const u = M.taa.uniforms;
      const prev = rt.hist[this.histIndex];
      const next = rt.hist[1 - this.histIndex];
      u.tCur.value = rt.combine.texture;
      u.tHist.value = prev.texture;
      u.tDepth.value = depth;
      u.tVm.value = vmOn ? rt.vm.texture : rt.zero.texture;
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uPrevViewProj.value.copy(prevVP);
      camera.getWorldPosition(u.uCamPos.value);
      u.uTexel.value.set(1 / w, 1 / h);
      u.uHistValid.value = this.taaFrames > 0 ? 1 : 0;
      // modo shot (câmera parada): média progressiva → supersample limpo
      u.uAlpha.value = ctx.shot ? Math.max(1 / (this.taaFrames + 1), 0.06) : P.taa.alpha;
      u.uGamma.value = ctx.shot ? Math.max(P.taa.gamma, 1.25) : P.taa.gamma;
      draw(M.taa, next);
      this.histIndex = 1 - this.histIndex;
      this.taaFrames++;
      hdr = next;
    } else this.taaFrames = 0;

    // 6) bloom: cadeia de downsample (13 taps) + upsample (tenda)
    const L = rt.bloom.length;
    let src = hdr;
    for (let i = 0; i < L; i++) {
      const u = M.down.uniforms;
      u.tSrc.value = src.texture;
      u.uTexel.value.set(1 / src.width, 1 / src.height);
      u.uKaris.value = i === 0 ? 1 : 0;
      draw(M.down, rt.bloom[i]);
      src = rt.bloom[i];
    }
    let low = rt.bloom[L - 1];
    for (let i = L - 2; i >= 0; i--) {
      const u = M.up.uniforms;
      u.tLow.value = low.texture;
      u.tCur.value = rt.bloom[i].texture;
      u.uTexel.value.set(1 / low.width, 1 / low.height);
      u.uRadius.value = P.bloom.radius;
      u.uCurWeight.value = 1;
      draw(M.up, rt.bloomUp[i]);
      low = rt.bloomUp[i];
    }
    const bloomTex = rt.bloomUp[0].texture;

    // 7) exposição automática (média log ponderada ao centro, adaptação)
    const AE = P.autoExposure;
    let expTex;
    if (AE.enabled) {
      const u = M.exposure.uniforms;
      const prev = rt.exp[this.expIndex];
      const next = rt.exp[1 - this.expIndex];
      u.tSmall.value = rt.bloom[Math.min(3, L - 1)].texture;
      u.tPrev.value = this.expPrimed ? prev.texture : rt.zero.texture;
      u.uKey.value = AE.key;
      u.uStrength.value = AE.strength;
      u.uRange.value.set(AE.minEV, AE.maxEV);
      u.uBiasEV.value = AE.biasEV;
      const fdt = Math.max(dt || 1 / 60, 1 / 240);
      u.uRate.value = ctx.shot ? 1 : 1 - Math.exp(-fdt * AE.speedUp);
      draw(M.exposure, next);
      this.expIndex = 1 - this.expIndex;
      this.expPrimed = true;
      expTex = next.texture;
    } else expTex = rt.white.texture;

    // 8) tonemap + gradação
    {
      const u = M.tonemap.uniforms;
      const G = P.grade;
      u.tHdr.value = hdr.texture;
      u.tBloom.value = bloomTex;
      u.tExposure.value = expTex;
      u.uBloom.value = tier.bloom ? P.bloom.strength : 0;
      u.uDirt.value = tier.dirt && tier.bloom ? P.bloom.dirt : 0;
      u.uExposure.value = P.exposure;
      u.uCA.value = P.lens.ca;
      u.uMenuBlur.value = P.menuBlur;
      u.uWhiteBalance.value.copy(G.whiteBalance);
      u.uContrast.value = G.contrast;
      u.uSaturation.value = G.saturation;
      u.uShadowTint.value.copy(G.shadowTint);
      u.uHighlightTint.value.copy(G.highlightTint);
      u.uLift.value.copy(G.lift);
      u.uGain.value.copy(G.gain);
      u.uVignette.value = P.lens.vignette;
      u.uFlash.value = this.flashAmt;
      u.uClarity.value = tier.bloom ? P.clarity : 0;
      u.uRes.value.set(w, h);
      draw(M.tonemap, rt.ldr);
    }

    // 9) final → tela
    {
      const u = M.final.uniforms;
      u.tLdr.value = rt.ldr.texture;
      u.uTexel.value.set(1 / w, 1 / h);
      u.uGrain.value = P.lens.grain;
      u.uFxaa.value = tier.fxaa ? 1 : 0;
      u.uSharpen.value = P.lens.sharpen ?? tier.sharpen;
      u.uTime.value = ctx.time.now;
      draw(M.final, null);
    }

    if (this.debugView === 'occ' || this.debugView === 'gi' || this.debugView === 'albedo') {
      M.debug.uniforms.tSrc.value = rt.combine.texture;
      M.debug.uniforms.uMode.value = 4;
      draw(M.debug, null);
    } else if (this.debugView) this.drawDebug(depth, aoTex, volTex, bloomTex, draw);
    renderer.setRenderTarget(null);
    this.stats.ms = performance.now() - t0;
    this.stats.passes = passes;
  },

  blur(a, b, depth, sharp, draw) {
    const u = this.mats.blur.uniforms;
    u.tDepth.value = depth;
    u.uDepthSharp.value = sharp;
    u.tSrc.value = a.texture;
    u.uDir.value.set(1 / a.width, 0);
    draw(this.mats.blur, b);
    u.tSrc.value = b.texture;
    u.uDir.value.set(0, 1 / a.height);
    draw(this.mats.blur, a);
  },

  drawDebug(depth, ao, vol, bloom, draw) {
    const m = this.mats.debug;
    const map = { ao: [ao, 0], vol: [vol, 1], depth: [depth, 2], bloom: [bloom, 3] }[this.debugView];
    if (!map) return;
    m.uniforms.tSrc.value = map[0];
    m.uniforms.uMode.value = map[1];
    draw(m, null);
  },

  dispose(ctx) {
    this.offs?.forEach((off) => off());
    ctx.renderer.shadowMap.autoUpdate = true;
    ctx.setRenderPipeline(null);
    this.disposeTargets();
    Object.values(this.mats || {}).forEach((m) => m.dispose());
    this.atmo?.dome.removeFromParent();
    this.atmo?.dispose();
    this.dust?.points.removeFromParent();
    this.dust?.dispose();
    this.skyOcc?.dispose();
    this.rsm?.dispose();
    this.probe?.dispose();
    this.farView?.dispose();
    this.bounceLight?.removeFromParent();
    this.dirtTex?.dispose();
  },
};

const _vp = new THREE.Matrix4();
const _pvp = new THREE.Matrix4();

/** Sequência de Halton (base b), índice ≥ 1. */
function halton(i, b) {
  let f = 1, r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}
const frameJitter = (i) => i;

export default rendering;
