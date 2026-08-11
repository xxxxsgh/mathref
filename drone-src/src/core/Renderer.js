import * as THREE from 'three';

/**
 * Criação e configuração do renderizador, isolada num arquivo só.
 *
 * Está separado de propósito: se um dia migrarmos para WebGPU, o alvo da
 * mudança é este arquivo e não um refactor espalhado pelo projeto.
 */
export function createRenderer(quality) {
  const renderer = new THREE.WebGLRenderer({
    antialias: quality.settings.pixelRatio <= 1.25,
    // `powerPreference` alto evita que o Chrome escolha a GPU integrada num
    // notebook com placa dedicada.
    powerPreference: 'high-performance',
    // Sem stencil e sem depth no canvas de saída: o pós-processamento desenha
    // num quad, e o depth real vive no render target da cena.
    stencil: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.settings.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;

  applyShadowSettings(renderer, quality.settings);

  renderer.domElement.id = 'view';
  return renderer;
}

export function applyShadowSettings(renderer, settings) {
  renderer.shadowMap.enabled = settings.shadows;
  // PCFSoft custa caro no iPad; PCF simples entrega 90% do resultado.
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

/**
 * Redimensionamento com debounce implícito: no iOS a rotação de tela dispara
 * vários eventos seguidos, e recriar render targets em cada um engasga.
 */
export function attachResize(renderer, camera, onResize) {
  let pending = 0;
  const apply = () => {
    pending = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    onResize?.(w, h, renderer.getPixelRatio());
  };
  const schedule = () => {
    if (pending) return;
    pending = requestAnimationFrame(apply);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  return apply;
}
