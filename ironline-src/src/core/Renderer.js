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
