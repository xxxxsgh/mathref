/**
 * PIPELINE DE RENDER (ctx.pipeline).
 *
 * Camadas, de trás para frente:
 *   1. MUNDO   ctx.scene + ctx.camera → alvo HDR (HalfFloat, depth FLOAT32,
 *              MSAA = quality.msaa), espaço LINEAR, sem tone mapping.
 *   2. ganchos 'afterWorld'  (passadas de tela cheia que precisam do depth do
 *              mundo: nuvens volumétricas, neblina, água… — ver addPass)
 *   3. COCKPIT ctx.cockpit.scene + ctx.cockpit.camera (FOV próprio) → mesmo
 *              alvo HDR, depth limpo antes (fica sempre por cima)
 *   4. ganchos 'afterCockpit'
 *   5. SAÍDA   tone mapping ACES + exposição + sRGB → canvas (OutputPass)
 *   6. HUD     DOM em ctx.ui (fora do WebGL)
 *
 * O padrão do núcleo é esse render DIRETO (sem pós). O sistema `render`
 * instala a cadeia completa (bloom, AO, TAA, gradação…) com
 *   ctx.pipeline.install((ctx, dt) => { ... }, 'render')
 * e usa os blocos abaixo para não duplicar lógica:
 *   pipeline.hdr                 WebGLRenderTarget HDR (texture + depthTexture)
 *   pipeline.renderWorld(target) desenha o mundo (limpa cor+depth)
 *   pipeline.runStage('afterWorld', target)
 *   pipeline.renderCockpit(target)
 *   pipeline.runStage('afterCockpit', target)
 *   pipeline.present(texture)    tone map + sRGB para a tela
 * Uma cadeia instalada que lança no render é desinstalada (volta ao padrão)
 * e o erro vai para ctx.errors.
 *
 * `renderer.info` é zerado pelo núcleo antes do pipeline e soma TODAS as
 * passadas do frame (autoReset = false) — é o número do orçamento.
 */
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Pipeline {
  constructor(ctx) {
    this.ctx = ctx;
    const { renderer, quality, gpu } = ctx;
    this.renderer = renderer;
    this.samples = Math.max(0, Math.min(quality.msaa | 0, gpu?.maxSamples || 0));
    this.hdrType = quality.hdr !== false ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdr = this._makeTarget(1, 1);
    this.output = new OutputPass();
    this.output.renderToScreen = true;
    this.output.material.depthTest = false;
    this.output.material.depthWrite = false;
    this.custom = null;
    this.owner = null;
    this.stages = { afterWorld: [], afterCockpit: [] };
    this.width = 1;
    this.height = 1;
  }

  _makeTarget(w, h) {
    const depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    const t = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
      samples: this.samples,
    });
    t.texture.name = 'exo.hdr';
    return t;
  }

  /** Tamanho em pixels de desenho (o núcleo chama no resize). */
  setSize(w, h) {
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.hdr.setSize(w, h);
    this.ctx.bus.emit('pipeline:resize', { width: w, height: h });
  }

  get exposure() {
    return this.renderer.toneMappingExposure;
  }
  set exposure(v) {
    this.renderer.toneMappingExposure = v;
  }

  /** Instala a cadeia do sistema `render`. fn(ctx, dt). */
  install(fn, owner = 'render') {
    this.custom = fn;
    this.owner = owner;
    this.ctx.bus.emit('pipeline:install', { owner });
  }

  /** Volta ao render direto do núcleo. */
  reset() {
    this.custom = null;
    this.owner = null;
  }

  /**
   * Passada extra num estágio (sem trocar a cadeia): fn(ctx, target, dt).
   * order menor roda antes. Devolve uma função que remove.
   */
  addPass(stage, fn, { order = 50, owner = '?' } = {}) {
    const list = this.stages[stage];
    if (!list) throw new Error(`estágio de pipeline desconhecido: ${stage}`);
    const e = { fn, order, owner };
    list.push(e);
    list.sort((a, b) => a.order - b.order);
    return () => {
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
    };
  }

  runStage(stage, target = this.hdr, dt = 0) {
    for (const e of this.stages[stage]) {
      try {
        e.fn(this.ctx, target, dt);
      } catch (err) {
        this.stages[stage].splice(this.stages[stage].indexOf(e), 1);
        this.ctx.report?.(e.owner, `pass:${stage}`, err);
      }
    }
  }

  renderWorld(target = this.hdr) {
    const r = this.renderer;
    r.setRenderTarget(target);
    r.clear(true, true, false);
    r.render(this.ctx.scene, this.ctx.camera);
  }

  renderCockpit(target = this.hdr) {
    const cp = this.ctx.cockpit;
    if (!cp.visible || cp.scene.children.length <= cp.baseChildren) return;
    const r = this.renderer;
    const prev = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    r.clearDepth();
    r.render(cp.scene, cp.camera);
    r.autoClear = prev;
  }

  /** Tone mapping (renderer.toneMapping, exposição) + sRGB → tela. */
  present(texture = this.hdr.texture) {
    this.output.render(this.renderer, null, { texture });
  }

  /** Render padrão do núcleo. */
  renderDefault(dt) {
    this.renderWorld(this.hdr);
    this.runStage('afterWorld', this.hdr, dt);
    this.renderCockpit(this.hdr);
    this.runStage('afterCockpit', this.hdr, dt);
    this.present(this.hdr.texture);
  }

  render(dt) {
    if (this.custom) {
      try {
        this.custom(this.ctx, dt);
        return;
      } catch (err) {
        this.ctx.report?.(this.owner || 'pipeline', 'render', err);
        this.reset();
      }
    }
    this.renderDefault(dt);
  }
}
