import * as THREE from 'three';

/**
 * Cria o WebGLRenderer do EXOSFERA.
 * - Profundidade: reversed-Z (EXT_clip_control) com depth float32 no alvo
 *   HDR do núcleo; fallback logarítmico. Ver core/Depth.js. `?depth=log`
 *   força o fallback (teste).
 * - Saída sRGB, tone mapping ACES — aplicados na passada de saída do
 *   pipeline (o mundo é desenhado LINEAR/HDR num alvo HalfFloat).
 * - Sem MSAA no canvas: o antisserrilhado é do alvo HDR (samples).
 * - Unidades físicas de luz (padrão do three desde r155).
 */
export function probeClipControl() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const ok = !!gl.getExtension('EXT_clip_control');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export function createRenderer(container, quality, { preserve = false, depthMode = 'auto' } = {}) {
  const reversed = depthMode !== 'log' && probeClipControl();
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserve,
    stencil: false,
    reversedDepthBuffer: reversed,
    logarithmicDepthBuffer: !reversed,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !!quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dprCap));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  /** 'reversed' | 'log' ('standard' só se o three recusar o reversed já sondado) */
  renderer.exoDepthMode = renderer.capabilities.reversedDepthBuffer ? 'reversed' : reversed ? 'standard' : 'log';
  return renderer;
}

/**
 * Capacidades da GPU relevantes (nunca lança):
 *   webgl2, maxTexture, halfFloatRT (RGBA16F renderizável), maxSamples, clipControl.
 */
export function gpuCaps(renderer) {
  const caps = { webgl2: false, maxTexture: 0, halfFloatRT: false, maxSamples: 0, clipControl: false };
  try {
    const gl = renderer.getContext();
    caps.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    caps.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    if (!caps.webgl2) return caps;
    caps.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
    caps.clipControl = !!renderer.capabilities.reversedDepthBuffer;
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
