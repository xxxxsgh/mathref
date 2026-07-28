import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** Layers de renderização. Ver o comentário do construtor. */
export const LAYER_NEAR = 0;
export const LAYER_FAR = 1;

/** Marca um objeto e todos os seus filhos para a faixa distante. */
export function setFarLayer(object) {
  object.traverse((o) => o.layers.set(LAYER_FAR));
}

/** Luzes precisam alcançar as DUAS faixas: no Three, uma luz só ilumina
 *  objetos cujas layers ela também tem habilitadas. */
export function lightAllLayers(light) {
  light.layers.enable(LAYER_NEAR);
  light.layers.enable(LAYER_FAR);
}

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

    // ═══ DUAS CÂMERAS, DOIS INTERVALOS DE PROFUNDIDADE ═══
    //
    // Problema: o sistema solar tem planetas a centenas de milhares de
    // unidades, e a nave tem detalhes de meia unidade. Um único par
    // near/far cobrindo 0.5 → 300000 tem razão de 600.000:1, e o depth
    // buffer (24 bits, com precisão distribuída de forma NÃO linear —
    // concentrada perto do `near`) simplesmente não tem resolução pra isso.
    // O sintoma é z-fighting: superfícies piscando uma sobre a outra.
    //
    // As saídas usuais e por que não as escolhi:
    //   • logarithmicDepthBuffer do Three — resolve, mas escreve gl_FragDepth
    //     em todo fragmento, o que desliga o early-Z da GPU. Num dispositivo
    //     móvel, com fill rate como gargalo, isso é caro demais.
    //   • aumentar o `near` — perderia o detalhe próximo da nave.
    //
    // A solução aqui é dividir a cena em duas FAIXAS de profundidade e
    // renderizar cada uma com sua própria câmera, limpando o depth buffer
    // entre elas. Cada faixa tem razão near/far modesta (~1000:1), que o
    // buffer resolve com folga. As duas câmeras compartilham posição e
    // orientação — são a mesma câmera, com "alcances" diferentes.
    //
    // A separação é feita por LAYER do Three:
    //   layer 0 = perto (nave, inimigos, projéteis, asteroides, partículas)
    //   layer 1 = longe (estrela, planetas, estações distantes)
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.world.fov, 1, CONFIG.world.near, CONFIG.world.nearFar,
    );
    this.camera.layers.set(LAYER_NEAR);

    this.farCamera = new THREE.PerspectiveCamera(
      CONFIG.world.fov, 1, CONFIG.world.farNear, CONFIG.world.far,
    );
    this.farCamera.layers.set(LAYER_FAR);

    // Não limpamos automaticamente: o ciclo de duas passadas precisa
    // controlar exatamente quando o color e o depth buffer são zerados.
    this.gl.autoClear = false;

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
    if (this.farCamera) {
      this.farCamera.aspect = w / h;
      this.farCamera.updateProjectionMatrix();
    }
  }

  /**
   * Renderiza em duas passadas de profundidade.
   *
   * Ordem: limpa tudo → desenha a faixa DISTANTE (que também traz o
   * skybox como background) → limpa SÓ o depth → desenha a faixa próxima.
   *
   * Limpar o depth entre as passadas é o que garante que qualquer objeto
   * próximo apareça na frente de qualquer objeto distante — o que é
   * fisicamente correto aqui, já que as faixas não se sobrepõem.
   */
  render(scene) {
    this.gl.clear(true, true, false);

    // A passada distante desenha o background. Se ela for pulada, o skybox
    // some — por isso o background fica sempre nela.
    this.gl.render(scene, this.farCamera);

    this.gl.clearDepth();
    this.gl.render(scene, this.camera);
  }

  /** Mantém a câmera distante sincronizada com a próxima. Chamado depois do
   *  rig de câmera, todo frame. */
  syncCameras() {
    this.farCamera.position.copy(this.camera.position);
    this.farCamera.quaternion.copy(this.camera.quaternion);
    if (this.farCamera.fov !== this.camera.fov) {
      this.farCamera.fov = this.camera.fov;
      this.farCamera.updateProjectionMatrix();
    }
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
