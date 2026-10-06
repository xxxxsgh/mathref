import * as THREE from 'three';

/**
 * Cria o WebGLRenderer com a configuração base do jogo.
 * - Saída sRGB, tone mapping ACES (a feature rendering pode trocar).
 * - Iluminação: desde o r155 o three usa unidades físicas por padrão
 *   (o antigo `physicallyCorrectLights` não existe mais) — intensidades de
 *   luz são em candela/lux, PointLight decai com o inverso do quadrado.
 * - DPR limitado por quality.dprCap.
 */
export function createRenderer(container, quality, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: !!quality.msaa,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserve,
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !!quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dprCap));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  return renderer;
}

/**
 * Capacidades da GPU relevantes para a carga (nunca lança):
 *   webgl2, maxTexture, halfFloatRT (RGBA16F renderizável — sem isso o
 *   compositor HDR e o PMREM ficam pretos), renderer (nome da GPU).
 * O main.js desliga `quality.hdr` quando halfFloatRT é falso.
 */
export function gpuCaps(renderer) {
  const caps = { webgl2: false, maxTexture: 0, halfFloatRT: false };
  try {
    const gl = renderer.getContext();
    caps.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    caps.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    if (!caps.webgl2) return caps;
    if (!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) return caps;
    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    caps.halfFloatRT = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
  } catch {
    /* fica com o que deu para ler */
  }
  return caps;
}
