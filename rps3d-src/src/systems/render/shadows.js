// Sombras em cascata (CSM) na luz da estrela (ctx.sun).
//
// - Cascatas/tamanho/alcance vêm do preset (shadowCascades, shadowMapSize,
//   shadowFar) e são recriadas em 'quality:change'.
// - O CSMShadowNode recalcula as caixas de cada cascata a partir da câmera
//   todo frame, então funciona com a origem flutuante (tudo é local) e com
//   o sol mudando de direção (lê sun.position → sun.target.position).
// - Com 1 cascata (mobile) continua sendo CSM: a caixa segue a câmera.
// - Divisões próprias (geométricas a partir de ~6 m): a divisão "practical"
//   com near = 5 cm desperdiça a 1ª cascata em centímetros.

import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

export class Shadows {
  constructor(ctx) {
    this.ctx = ctx;
    this.csm = null;
  }

  build() {
    const { ctx } = this;
    const p = ctx.quality.p;
    const sun = ctx.sun;
    this.dispose();
    const cascades = Math.max(1, p.shadowCascades | 0);
    const far = p.shadowFar || 400;
    const margin = Math.max(200, far * 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2;
    const cam = sun.shadow.camera;
    cam.near = 0.5;
    cam.far = far * 2.5 + margin * 2;
    cam.updateProjectionMatrix();
    // o mapa antigo pode ter outro tamanho: força recriação
    sun.shadow.map?.dispose?.();
    sun.shadow.map = null;

    const first = Math.min(8, far * 0.02);
    const csm = new CSMShadowNode(sun, {
      cascades,
      maxFar: far,
      mode: 'custom',
      lightMargin: margin,
      customSplitsCallback: (n, near, farV, breaks) => {
        // progressão geométrica de "first" até farV
        const ratio = n > 1 ? Math.pow(farV / first, 1 / (n - 1)) : 1;
        for (let i = 1; i < n; i++) breaks.push((first * Math.pow(ratio, i - 1)) / farV);
        breaks.push(1);
      },
    });
    csm.fade = true;
    sun.shadow.shadowNode = csm;
    this.csm = csm;
  }

  /** Chamado em resize/fov: frustums das cascatas dependem da projeção. */
  updateFrustums() {
    if (this.csm?.camera) this.csm.updateFrustums();
  }

  dispose() {
    if (this.csm) {
      this.csm.dispose();
      this.csm = null;
    }
  }
}
