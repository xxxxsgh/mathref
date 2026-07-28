import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, VignetteEffect, ChromaticAberrationEffect,
  KernelSize, BlendFunction,
} from 'postprocessing';
import { CONFIG } from '../config.js';

/**
 * Pós-processamento.
 *
 * ═══ POR QUE A LIB DA PMNDRS E NÃO O EffectComposer DO THREE ═══
 *
 * O `EffectComposer` que vem nos addons do Three roda um passe (com seu
 * próprio render target, sua própria leitura e escrita de tela cheia) por
 * efeito. Bloom + vinheta + aberração cromática = três passes de tela cheia.
 *
 * A biblioteca da pmndrs FUNDE efeitos compatíveis num único fragment shader.
 * Os três viram um passe só. Num iPad, onde fill rate é o gargalo antes de
 * qualquer outra coisa, isso é a diferença entre 30 e 45 fps.
 *
 * ═══ A COMPLICAÇÃO DAS DUAS CÂMERAS ═══
 *
 * O jogo renderiza em duas faixas de profundidade (ver Renderer.js), com
 * limpeza de depth entre elas. O `RenderPass` padrão assume uma câmera só.
 *
 * A solução aqui é um passe customizado que executa exatamente a mesma
 * sequência de duas passadas dentro do render target do composer. Assim o
 * pós-processamento recebe a imagem completa, e a divisão de profundidade
 * permanece invisível pra ele.
 */

/** Passe que reproduz a renderização em duas faixas dentro do composer. */
class DualRangePass extends RenderPass {
  /** @param {THREE.Scene} scene @param {import('./Renderer.js').Renderer} rendererWrap */
  constructor(scene, rendererWrap) {
    super(scene, rendererWrap.camera);
    this.rendererWrap = rendererWrap;
    this.scene = scene;
    // O composer é quem decide para onde renderizar; não limpamos por conta
    // própria fora do momento certo.
    this.clear = false;
  }

  render(renderer, inputBuffer, outputBuffer) {
    const target = this.renderToScreen ? null : inputBuffer;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.rendererWrap.farCamera);
    renderer.clearDepth();
    renderer.render(this.scene, this.rendererWrap.camera);
  }
}

export class PostProcessing {
  /**
   * @param {import('./Renderer.js').Renderer} rendererWrap
   * @param {THREE.Scene} scene
   */
  constructor(rendererWrap, scene) {
    this.rendererWrap = rendererWrap;
    this.scene = scene;
    this.enabled = true;
    this.composer = null;
    this._build();
  }

  _build() {
    const P = CONFIG.post;
    const gl = this.rendererWrap.gl;

    // HalfFloat: render targets de 32 bits por canal travam ou não são
    // filtráveis em boa parte dos aparelhos iOS. Meia precisão tem alcance de
    // sobra pra HDR de bloom e roda em tudo.
    this.composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType });

    this.renderPass = new DualRangePass(this.scene, this.rendererWrap);
    this.composer.addPass(this.renderPass);

    this.bloom = new BloomEffect({
      intensity: P.bloom.intensity,
      luminanceThreshold: P.bloom.luminanceThreshold,
      luminanceSmoothing: P.bloom.luminanceSmoothing,
      mipmapBlur: P.bloom.mipmapBlur,
      kernelSize: KernelSize.MEDIUM,
      resolutionScale: P.bloom.resolutionScale,
    });

    this.vignette = new VignetteEffect({
      darkness: P.vignette.darkness,
      offset: P.vignette.offset,
    });

    this.aberration = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(P.chromaticAberration, P.chromaticAberration),
      radialModulation: true,
      modulationOffset: 0.35,
    });

    // Um único EffectPass com os três: é aqui que a fusão acontece.
    this.effectPass = new EffectPass(this.rendererWrap.camera, this.bloom, this.aberration, this.vignette);
    this.composer.addPass(this.effectPass);

    this._baseAberration = P.chromaticAberration;
    this._baseVignette = P.vignette.darkness;
    this._boostAmount = 0;
  }

  /** Liga/desliga conforme o tier de qualidade. */
  applyQuality(tierIndex, pixelRatio) {
    this.enabled = tierIndex <= CONFIG.post.enabledFrom;
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setPixelRatio?.(pixelRatio);
  }

  resize(width, height) {
    this.composer?.setSize(width, height);
  }

  /**
   * Modula os efeitos pelo estado de jogo.
   * @param {number} boost 0..1
   * @param {number} heat 0..1 calor de reentrada
   * @param {number} dt
   */
  update(boost, heat, dt) {
    if (!this.enabled) return;
    const P = CONFIG.post;

    // Suaviza: mudar aberração instantaneamente ao apertar o boost dá um
    // "estalo" visual desagradável.
    this._boostAmount += (boost - this._boostAmount) * Math.min(1, dt * 6);

    const amount = Math.max(this._boostAmount, heat * 0.8);
    const ab = this._baseAberration + amount * (P.boostAberration - this._baseAberration);
    this.aberration.offset.set(ab, ab);
    this.vignette.darkness = this._baseVignette
      + this._boostAmount * (P.boostVignette - this._baseVignette);
  }

  render(dt) {
    if (!this.enabled) {
      this.rendererWrap.render(this.scene);
      return;
    }
    this.composer.render(dt);
  }

  dispose() {
    this.composer?.dispose();
  }
}
