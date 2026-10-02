/**
 * Operador do menu principal ("hero shot"): um soldado da feature enemies
 * (criado pela API pública `services.enemies.spawn`, depois RETIRADO da IA,
 * da colisão e da cena do mundo) renderizado num WebGLRenderer próprio com
 * luz de estúdio — key quente, contraluz fria forte, preenchimento baixo —
 * sobre o mundo desfocado e graduado (filtro CSS no canvas principal).
 *
 * Contexto WebGL separado (como o gunsmith): não interfere no pipeline da
 * feature rendering e é destruído ao sair da tela. Geometria/material são
 * os compartilhados da feature enemies — nada é descartado aqui.
 */
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class Hero {
  constructor(ctx, host, { w = 900, h = 1080, k = 1 } = {}) {
    const THREE = ctx.THREE;
    const en = ctx.services.enemies;
    if (!en?.spawn) throw new Error('serviço enemies indisponível');
    this.ctx = ctx;
    // ── o operador: soldado tirado da simulação ──
    const e = en.spawn({ position: [0, -400, 0], yaw: 0, variant: 2 });
    const li = en.list?.indexOf(e) ?? -1;
    if (li >= 0) en.list.splice(li, 1);
    if (e.colliderId != null) ctx.collision.remove(e.colliderId);
    try { e.brain?.releaseCover?.(); } catch {}
    ctx.scene.remove(e.group);
    this.e = e;
    if (!e.anim?.update) throw new Error('animador do soldado indisponível');

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!ctx.shot }));
    r.setPixelRatio(Math.min(1.5, k));
    r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.setClearColor(0x000000, 0);
    r.domElement.style.width = w + 'px';
    r.domElement.style.height = h + 'px';
    r.domElement.className = 'hero-canvas';
    host.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = this.env;
    scene.environmentIntensity = 0.32;

    const key = new THREE.DirectionalLight(0xffd9ad, 2.6);
    key.position.set(2.2, 3.0, 2.6);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 5.5);
    rim.position.set(-2.8, 2.2, -2.4);
    const rim2 = new THREE.DirectionalLight(0xffa860, 3.2);
    rim2.position.set(3.0, 1.2, -2.2);
    const fill = new THREE.HemisphereLight(0x8aa0b8, 0x2a1e14, 0.5);
    scene.add(key, rim, rim2, fill);

    const g = e.group;
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0.38, 0); // 3/4 para a câmera
    scene.add(g);
    // pose: pronto-baixo, leve inclinação de cabeça para a câmera
    const p = e.anim.p;
    p.speed = 0; p.aim = 0.15; p.aimYaw = -0.25; p.aimPitch = -0.05; p.crouch = 0; p.lean = 0;
    e.anim.update(0.5);
    e.anim.applyModelPose?.();

    const cam = (this.camera = new THREE.PerspectiveCamera(19, w / h, 0.05, 50));
    cam.position.set(0.15, 1.12, 6.4);
    cam.lookAt(0.05, 0.98, 0);
    this.t = 0;
    this.ok = true;
  }

  render(dt) {
    if (!this.ok) return;
    this.t += dt;
    const e = this.e;
    // respiração/oscilação suave (o animador cuida do idle)
    e.group.rotation.y = 0.38 + Math.sin(this.t * 0.25) * 0.04;
    e.anim.update(Math.min(dt, 1 / 20));
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ok = false;
    try {
      this.scene.remove(this.e.group);
      this.env.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    } catch {}
    this.renderer.domElement.remove();
  }
}
