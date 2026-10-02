/**
 * Pré-passe de profundidade em meia resolução para partículas "suaves".
 *
 * O compositor da feature `rendering` desenha as partículas no MESMO passe da
 * cena, então a profundidade dele não pode ser lida durante esse desenho
 * (laço de realimentação). Aqui renderizamos só a profundidade dos opacos,
 * num alvo próprio de ½ resolução, ANTES do compositor — e só enquanto há
 * partículas suaves vivas (impactos, explosões). Fumaça encostada numa
 * barreira ou fachada desvanece em vez de cortar numa linha dura.
 *
 * Transparentes, alpha-test (folhagem), linhas e pontos ficam de fora (com
 * o material de override virariam quadrados sólidos).
 */
import * as THREE from 'three';

export class DepthPrepass {
  constructor(renderer, scene, camera, { scale = 0.5, isOwn = () => false } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.scale = scale;
    this.isOwn = isOwn;
    this.rt = null;
    this.hidden = [];
    this.scanTimer = 0;
    this.valid = false;
    this.override = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.override.name = 'vfx-depth-prepass';
    this.size = new THREE.Vector2();
  }

  ensure() {
    const s = this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(s.x * this.scale)), h = Math.max(1, Math.round(s.y * this.scale));
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    this.rt?.dispose();
    const depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      depthTexture,
      generateMipmaps: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.valid = false;
  }

  /** Lista de objetos a esconder no pré-passe (refeita a cada ~1 s). */
  scan() {
    const out = [];
    this.scene.traverse((o) => {
      if (o === this.camera) return;
      if (this.isOwn(o)) { out.push(o); return; }
      if (o.isPoints || o.isLine || o.isSprite) { out.push(o); return; }
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => !m || m.transparent || m.depthWrite === false || m.alphaTest > 0 || m.colorWrite === false || m.alphaHash || m.isShaderMaterial && !m.depthWrite)) out.push(o);
    });
    this.hidden = out;
  }

  render(dt) {
    const { renderer, scene, camera } = this;
    this.ensure();
    if ((this.scanTimer -= dt) <= 0 || !this.hidden.length) {
      this.scan();
      this.scanTimer = 1;
    }
    const vis = this.hidden.map((o) => o.visible);
    for (const o of this.hidden) o.visible = false;
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevAuto = renderer.autoClear;
    const sm = renderer.shadowMap;
    const prevSmAuto = sm.autoUpdate, prevSmNeeds = sm.needsUpdate;
    const prevBg = scene.background;
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    scene.overrideMaterial = this.override;
    scene.background = null;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear(false, true, false);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    sm.autoUpdate = prevSmAuto;
    sm.needsUpdate = prevSmNeeds;
    this.hidden.forEach((o, i) => (o.visible = vis[i]));
    this.valid = true;
  }

  dispose() {
    this.rt?.dispose();
    this.override.dispose();
  }
}
