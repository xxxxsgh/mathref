import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Criação e gestão do renderer.
 *
 * Este arquivo é deliberadamente o ÚNICO lugar que sabe que estamos em WebGL2.
 * Se um dia migrarmos para `three/webgpu` (ver docs/FASE-0-STACK.md), a mudança
 * fica contida aqui e no pós-processamento — não espalhada pelo projeto.
 */
export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;

    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // `powerPreference: high-performance` faz o macOS escolher a GPU dedicada
      // em notebooks com gráficos híbridos. Ignorado no iOS.
      powerPreference: 'high-performance',
      // Sem stencil e sem alpha: economiza banda de memória por frame. Só ligue
      // stencil se algum efeito de máscara precisar (nenhum precisa hoje).
      stencil: false,
      alpha: false,
    });

    // ACES é o tone mapping que faz emissivos fortes (motores, estrelas)
    // saturarem pra branco de forma cinematográfica em vez de estourarem em
    // blocos chapados de cor. É o que dá o look "capa de livro de ficção".
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.06;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.shadowMap.enabled = false; // ligado pela qualidade

    this._pixelRatio = 1;
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    // `orientationchange` no iPad dispara ANTES do layout terminar de ajustar,
    // então o resize imediato lê dimensões erradas. O frame extra corrige.
    window.addEventListener('orientationchange', () => {
      requestAnimationFrame(() => requestAnimationFrame(this._onResize));
    });

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.world.fov,
      1,
      CONFIG.world.near,
      CONFIG.world.far,
    );

    this._onResize();
  }

  /** Aplica um tier de qualidade vindo do Quality manager. */
  applyQuality(tier) {
    this._pixelRatio = Math.min(
      tier.pixelRatio,
      CONFIG.quality.maxPixelRatio,
      window.devicePixelRatio || 1,
    );
    this.gl.shadowMap.enabled = tier.shadows;
    this._onResize();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // `false` no terceiro argumento: NÃO deixa o Three escrever style.width/height
    // no canvas. O CSS já cuida do tamanho visual; deixar os dois mexerem causa
    // um loop de resize no Safari.
    this.gl.setPixelRatio(this._pixelRatio);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(scene) {
    this.gl.render(scene, this.camera);
  }

  /** Estatísticas cruas do frame anterior, para o painel de debug.
   *  `renderer.info` é a fonte de verdade do Three — mais confiável que
   *  contar objetos na mão, porque conta o que de fato foi desenhado depois
   *  do frustum culling. */
  get info() {
    return this.gl.info;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.gl.dispose();
  }
}
