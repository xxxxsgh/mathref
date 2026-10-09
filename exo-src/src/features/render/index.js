/**
 * RENDER — cadeia HDR completa do EXOSFERA (instalada em ctx.pipeline) e
 * sombras em cascata. Publica o serviço `render` (CONTRACT.md §13).
 *
 * Frame (ver também a ordem do núcleo em CONTRACT.md §2):
 *   1. jitter TAA na projeção  →  mundo no alvo HDR  →  estágio 'afterWorld'
 *      (SSAO deste sistema na ordem 1, água na 5, perspectiva aérea na 10…)
 *   2. TAA (high+), borrão de movimento da câmera (só rápido), exposição
 *      automática, raios crepusculares — tudo que precisa da profundidade
 *      do MUNDO roda antes do cockpit (que limpa o depth)
 *   3. cockpit + 'afterCockpit'
 *   4. bloom multinível (+ seletivo), composição (aberração, vinheta,
 *      ACES, gradação, sRGB) e saída (FXAA ou nitidez + grão)
 *
 * Qualidade (ctx.quality) — cada preset DESLIGA de verdade os passes caros:
 *   low     1 cascata 1024, sem SSAO/bloom/TAA/raios; FXAA
 *   medium  2 cascatas, SSAO, bloom; FXAA
 *   high    3 cascatas, SSAO, bloom, TAA, raios, borrão de movimento
 *   ultra   4 cascatas 4096 + o resto
 *
 * Arquivos: csm.js (sombras), ssao.js, post.js (TAA, borrão, exposição,
 * bloom, raios, composição, saída), glsl.js / util.js (comuns).
 *
 * Parâmetros de preset (preset.params): renderExposure (número fixo, sem
 * adaptação), renderGodrays (multiplicador), renderBloom (força), renderEV
 * (compensação em EV), renderDebug ('ao' | 'bloom' | 'rays' | 'exposure').
 */
import * as THREE from 'three';
import { CascadedShadows } from './csm.js';
import { SSAOPass } from './ssao.js';
import { Blitter, makeTarget, fsMaterial, resizeTarget } from './util.js';
import { CameraHistory, TAAPass, MotionBlurPass, ExposurePass, BloomPass, GodRaysPass, CompositePass, FinalPass, CopyPass } from './post.js';

const DEPTH_COPY_FRAG = /* glsl */ `
uniform sampler2D tDepth;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDepth, vUv).r, 0.0, 0.0, 1.0); }`;

export default {
  name: 'render',
  order: 90,

  async init(ctx) {
    const { renderer } = ctx;
    this.ctx = ctx;
    this.blit = new Blitter(renderer);
    this.hist = new CameraHistory(ctx);
    this.csm = new CascadedShadows(ctx);
    this.ssao = new SSAOPass(ctx);
    this.taa = new TAAPass(ctx, this.hist);
    this.mb = new MotionBlurPass(ctx, this.hist);
    this.exposure = new ExposurePass(ctx);
    this.bloom = new BloomPass(ctx);
    this.rays = new GodRaysPass(ctx);
    this.composite = new CompositePass(ctx);
    this.final = new FinalPass(ctx);
    this.copy = new CopyPass();
    // profundidade do mundo salva antes do cockpit (que limpa o depth)
    const floatOk = !!renderer.extensions.has?.('EXT_color_buffer_float');
    this.worldDepth = makeTarget(1, 1, { name: 'exo.worldDepth', type: floatOk ? THREE.FloatType : THREE.HalfFloatType, filter: THREE.NearestFilter });
    this.mDepthCopy = fsMaterial(DEPTH_COPY_FRAG, { tDepth: { value: null } });
    this.raysTex = null;

    const P = ctx.shot?.preset?.params || {};
    this.settings = {
      baseExposure: 1,
      fixedExposure: typeof P.renderExposure === 'number' ? P.renderExposure : null,
      ev: typeof P.renderEV === 'number' ? P.renderEV : 0,
      bloomStrength: typeof P.renderBloom === 'number' ? P.renderBloom : 0.22,
      bloomThreshold: 1.0,
      raysStrength: typeof P.renderGodrays === 'number' ? P.renderGodrays : 1,
      grain: 0.02,
      debug: P.renderDebug || ctx.params.get('rdebug') || null,
    };
    this.bloom.uP.uThreshold.value = this.settings.bloomThreshold;
    this.rays.strength = this.settings.raysStrength;

    this.removeAO = null;
    this.applyQuality();
    this.offs = [
      ctx.bus.on('quality:change', () => this.applyQuality()),
      ctx.bus.on('renderer:restored', () => {
        this.taa.reset = true;
        this.exposure.first = true;
      }),
    ];

    ctx.pipeline.install((c, dt) => this.renderChain(dt), 'render');
    this.publish();
  },

  /** Liga/desliga passes conforme o preset de qualidade. */
  applyQuality() {
    const ctx = this.ctx;
    const q = ctx.quality;
    const lvl = q.level || 'high';
    const highish = lvl === 'high' || lvl === 'ultra';
    this.on = {
      ssao: !!q.ssao,
      bloom: q.bloom !== false && lvl !== 'low',
      taa: !!q.taa && ctx.gpu?.webgl2 !== false,
      // borrão só aparece em velocidade alta; nos presets altos fica disponível
      motionBlur: !!q.motionBlur || highish,
      rays: !!q.volumetrics,
      fxaa: !q.taa,
    };
    this.csm.configure();
    // recompila materiais com o patch novo das cascatas
    ctx.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
    if (this.on.ssao && !this.removeAO) {
      this.removeAO = ctx.pipeline.addPass('afterWorld', (c, target) => this.ssao.render(this.blit, target, c.camera), { order: 1, owner: 'render' });
    } else if (!this.on.ssao && this.removeAO) {
      this.removeAO();
      this.removeAO = null;
    }
    this.taa.reset = true;
  },

  publish() {
    const self = this;
    const ctx = this.ctx;
    const api = {
      setBloom({ strength, threshold, radius } = {}) {
        if (typeof strength === 'number') self.settings.bloomStrength = strength;
        if (typeof threshold === 'number') self.bloom.uP.uThreshold.value = threshold;
        if (typeof radius === 'number') self.bloom.uU.uRadius.value = THREE.MathUtils.clamp(radius, 0, 1.5);
      },
      registerSelectiveBloom(obj) {
        self.bloom.register(obj);
      },
      unregisterSelectiveBloom(obj) {
        self.bloom.unregister(obj);
      },
      shadows: {
        get csm() {
          return self.csm;
        },
        get cascades() {
          return self.csm.count;
        },
        setLightDirection(dir) {
          self.csm.setLightDirection(dir);
        },
      },
      /** exposição BASE (a automática multiplica por cima) */
      get exposure() {
        return self.settings.baseExposure;
      },
      setExposure(v) {
        if (typeof v === 'number' && v > 0) self.settings.baseExposure = v;
      },
      get autoExposure() {
        return self.exposure.auto;
      },
      set autoExposure(v) {
        self.exposure.auto = !!v;
      },
      setGodRays(strength) {
        if (typeof strength === 'number') self.rays.strength = self.settings.raysStrength = strength;
      },
      /** draw calls / triângulos acumulados por fase no último frame */
      get stats() {
        return self.stats;
      },
      /** lê a exposição efetiva e a luminância média (depuração; síncrono, lento) */
      readExposure() {
        const b = new Uint16Array(4);
        ctx.renderer.readRenderTargetPixels(self.exposure.a, 0, 0, 1, 1, b);
        return { exposure: THREE.DataUtils.fromHalfFloat(b[0]), avgLum: THREE.DataUtils.fromHalfFloat(b[1]) };
      },
      /** internos (só depuração/ferramentas) */
      get _internal() {
        return self;
      },
      /** passes ativos (depuração / HUD de desempenho) */
      get passes() {
        return { ...self.on };
      },
    };
    this.api = ctx.provide('render', api);
  },

  frame(dt, ctx) {
    // sombras seguem o sol (o sky já atualizou neste frame: order 15 < 90)
    this.csm.update();
    // IBL: o sky gera o PMREM por bioma; se ninguém pôs na cena, põe aqui
    const env = ctx.services.sky?.envMap;
    if (env && !ctx.scene.environment) ctx.scene.environment = env;
  },

  renderChain(dt) {
    const ctx = this.ctx;
    const P = ctx.pipeline;
    const cam = ctx.camera;
    const on = this.on;
    const blit = this.blit;
    const S = this.settings;
    const hdr = P.hdr;

    this.hist.update(dt);
    const info = ctx.renderer.info.render;
    const st = (this.stats = this.stats || {});
    const mark = (k) => {
      st[k] = `${info.calls}/${(info.triangles / 1e3).toFixed(0)}k`;
      if (this.probeOn) {
        const b = new Uint16Array(4);
        ctx.renderer.readRenderTargetPixels(hdr, hdr.width >> 1, hdr.height >> 2, 1, 1, b);
        st['px_' + k] = [...b].map((v) => +THREE.DataUtils.fromHalfFloat(v).toFixed(3)).join(',');
      }
    };
    mark('start');
    const taaOn = on.taa;
    if (taaOn) this.taa.jitter(cam, P.width, P.height);
    try {
      P.renderWorld(hdr);
      mark('w0');
      P.runStage('afterWorld', hdr, dt);
    } finally {
      if (taaOn) this.taa.unjitter(cam);
    }
    let depth = hdr.depthTexture;
    mark('world');

    // ── antes do cockpit: tudo que lê a profundidade do mundo ──────────
    let cur = hdr;
    if (taaOn) cur = this.taa.render(blit, hdr, depth);
    const mbAmt = on.motionBlur ? this.mb.strength(dt) : 0;
    if (mbAmt > 0.02) cur = this.mb.render(blit, cur, depth, mbAmt, dt);
    if (cur !== hdr) this.copy.render(blit, cur.texture, hdr);

    // exposição medida no mundo (o interior escuro do cockpit não conta)
    const base = (S.fixedExposure ?? S.baseExposure) * Math.pow(2, S.ev);
    this.exposure.auto = S.fixedExposure == null && this.exposure.auto !== false;
    const expTex = this.exposure.render(blit, hdr, base, dt);

    let rays = null;
    if (on.rays && this.rays.prepare() > 0.01) rays = this.rays.render(blit, hdr, depth, expTex);

    const cp = ctx.cockpit;
    const cockpitOn = cp.visible && cp.scene.children.length > cp.baseChildren;
    if (cockpitOn && on.bloom && this.bloom.selective.size) {
      resizeTarget(this.worldDepth, hdr.width, hdr.height);
      this.mDepthCopy.uniforms.tDepth.value = depth;
      blit.draw(this.mDepthCopy, this.worldDepth);
      depth = this.worldDepth.texture;
    }

    mark('preCockpit');
    P.renderCockpit(hdr);
    P.runStage('afterCockpit', hdr, dt);
    mark('cockpit');

    const bloom = on.bloom ? this.bloom.render(blit, hdr, depth, expTex) : null;
    const sky = ctx.services.sky;
    const rayColor = this._rayColor || (this._rayColor = new THREE.Color());
    if (sky?.sunColor) {
      const c = sky.sunColor;
      rayColor.setRGB(c.r ?? c[0] ?? 1, c.g ?? c[1] ?? 1, c.b ?? c[2] ?? 1);
      const m = Math.max(rayColor.r, rayColor.g, rayColor.b, 1e-4);
      rayColor.multiplyScalar(1 / m);
    } else rayColor.setRGB(1, 0.9, 0.75);

    let ldrSrc = hdr;
    const dbg = S.debug;
    const ldr = this.composite.render(blit, ldrSrc, {
      bloom: dbg === 'rays' ? null : bloom,
      bloomStrength: S.bloomStrength,
      rays,
      rayStrength: 1.5 * this.rays.intensity * (cockpitOn ? 0.6 : 1),
      rayColor,
      exposure: expTex,
    });
    this.final.render(blit, ldr, { fxaa: on.fxaa, sharpen: taaOn ? 0.22 : 0, grain: S.grain });
    mark('end');
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    this.removeAO?.();
    ctx.pipeline.reset();
    this.csm?.dispose();
    for (const p of [this.ssao, this.taa, this.mb, this.exposure, this.bloom, this.rays, this.composite, this.final, this.copy, this.blit]) p?.dispose?.();
    this.worldDepth?.dispose();
    this.mDepthCopy?.dispose();
  },
};
