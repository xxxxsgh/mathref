import * as THREE from 'three';
import { buildWeaponModel } from '../weapons/Models.js';
import { skinById } from '../skins/SkinCatalog.js';
import { damp } from '../core/Rng.js';
import { Easing } from '../core/Easing.js';

/**
 * Visualizador de colecionável: a arma num pedestal, iluminação de estúdio,
 * órbita com o mouse (arrastar), zoom (roda), giro automático e modo de
 * comparação (duas armas empilhadas). A câmera sempre se move amortecida.
 */
export class InspectionViewer {
  /** @param {THREE.Texture} envMap */
  constructor(envMap) {
    this.scene = new THREE.Scene();
    this.scene.environment = envMap;
    this.scene.background = new THREE.Color(0x0b0d10);
    this.scene.fog = new THREE.Fog(0x0b0d10, 3, 8);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);

    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(-1.5, 2.2, 2);
    const rim = new THREE.DirectionalLight(0x8fc2ff, 2.0);
    rim.position.set(2, 0.8, -2);
    const fill = new THREE.HemisphereLight(0xcfdcec, 0x1a1410, 0.5);
    this.scene.add(key, rim, fill);

    // pedestal com anel luminoso
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.82, 0.06, 64),
      new THREE.MeshStandardMaterial({ color: 0x0f1114, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.25 }),
    );
    ped.position.y = -0.36;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.006, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.328;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.95, envMapIntensity: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.39;
    this.scene.add(ped, ring, floor);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    /** @type {{ root: THREE.Object3D, item: any }[]} */
    this.models = [];

    this.yaw = 0.6;
    this.pitch = 0.15;
    this.dist = 1.5;
    this.tYaw = 0.6;
    this.tPitch = 0.15;
    this.tDist = 1.5;
    this.minDist = 0.25;
    this.maxDist = 3;
    this.autoRotate = true;
    this.wearOn = true;
    this.intro = 0;
    this.time = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.idleTime = 0;
    this.panelShift = 0;
  }

  /**
   * Abre com um item (ou dois, para comparar).
   * @param {any[]} items
   * @param {string} rarityColor
   */
  open(items, rarityColor) {
    this.clear();
    const stacked = items.length > 1;
    let maxLen = 0;
    items.forEach((item, i) => {
      const skin = skinById(item.skinId);
      const m = buildWeaponModel(item.weaponType, { skin, floatValue: item.floatValue, patternSeed: item.patternSeed, wearSeed: item.wearSeed });
      const pivot = new THREE.Group();
      // perfil para a câmera: comprimento da arma no eixo X
      m.root.rotation.y = Math.PI / 2;
      const box = new THREE.Box3().setFromObject(m.root);
      const c = box.getCenter(new THREE.Vector3());
      m.root.position.sub(c);
      pivot.add(m.root);
      const size = box.getSize(new THREE.Vector3());
      maxLen = Math.max(maxLen, size.x);
      pivot.position.y = stacked ? (i === 0 ? 0.17 : -0.17) : 0;
      if (item.weaponType === 'knife' && !stacked) pivot.scale.setScalar(2.2);
      else if (item.weaponType === 'knife') pivot.scale.setScalar(1.6);
      else if (item.weaponType === 'pistol' || item.weaponType === 'heavy') pivot.scale.setScalar(stacked ? 1.5 : 1.9);
      this.holder.add(pivot);
      this.models.push({ root: pivot, item });
      maxLen = Math.max(maxLen, size.x * pivot.scale.x);
    });
    this.ringMat.color.set(rarityColor);
    // distância inicial que enquadra o item
    const fit = Math.max(0.6, ((maxLen * 0.5) / Math.tan(THREE.MathUtils.degToRad(16))) * 0.95);
    this.tDist = Math.min(this.maxDist, fit + (stacked ? 0.35 : 0));
    this.maxDist = Math.max(2.2, this.tDist * 1.8);
    this.minDist = Math.max(0.18, this.tDist * 0.22);
    this.dist = this.tDist * 2.4;
    this.tYaw = 0.35;
    this.tPitch = 0.18;
    this.yaw = -0.8;
    this.pitch = 0.4;
    this.intro = 0;
    this.setWear(this.wearOn);
    this.applyShift();
  }

  clear() {
    for (const m of this.models) {
      this.holder.remove(m.root);
      m.root.traverse((o) => {
        const mesh = /** @type {any} */ (o);
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          if (mesh.material.userData?.skinUniforms) mesh.material.dispose();
        }
      });
    }
    this.models = [];
  }

  /** Liga/desliga o desgaste (ver a skin "como nova" para comparar). */
  setWear(on) {
    this.wearOn = on;
    for (const m of this.models) {
      m.root.traverse((o) => {
        const u = /** @type {any} */ (o).material?.userData?.skinUniforms;
        if (u) u.uWearOn.value = on ? 1 : 0;
      });
    }
  }

  resetView() {
    this.tYaw = 0.35;
    this.tPitch = 0.12;
  }

  /**
   * Arrastar gira; roda ou pinça (dois dedos) dá zoom.
   * @param {HTMLElement} el
   */
  bind(el) {
    el.style.touchAction = 'none';
    /** @type {Map<number, { x: number, y: number }>} */
    const pts = new Map();
    let pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      this.dragging = pts.size === 1;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.idleTime = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) this.tDist = Math.max(this.minDist, Math.min(this.maxDist, this.tDist * (pinch / d)));
        pinch = d;
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.tYaw -= dx * 0.008;
      this.tPitch = Math.max(-1.3, Math.min(1.3, this.tPitch + dy * 0.006));
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = 0;
      this.dragging = false;
      if (pts.size === 1) {
        const [a] = [...pts.values()];
        this.lastX = a.x;
        this.lastY = a.y;
        this.dragging = true;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.tDist = Math.max(this.minDist, Math.min(this.maxDist, this.tDist * (1 + Math.sign(e.deltaY) * 0.12)));
        this.idleTime = 0;
      },
      { passive: false },
    );
  }

  /** @param {number} dt */
  update(dt) {
    this.time += dt;
    this.idleTime += dt;
    this.intro = Math.min(1, this.intro + dt / 1.1);
    if (this.autoRotate && !this.dragging && this.idleTime > 2.5) this.tYaw += dt * 0.35;
    const k = this.intro < 1 ? 3 + Easing.outCubic(this.intro) * 5 : 8;
    this.yaw = damp(this.yaw, this.tYaw, k, dt);
    this.pitch = damp(this.pitch, this.tPitch, k, dt);
    this.dist = damp(this.dist, this.tDist, k * 0.8, dt);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(Math.sin(this.yaw) * cp * this.dist, Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(0, 0, 0);
    // flutuação leve no pedestal
    this.holder.position.y = Math.sin(this.time * 1.4) * 0.008;
  }

  /** @param {number} aspect */
  resize(aspect) {
    this.camera.aspect = aspect;
    // telas largas: desloca a imagem para a esquerda (painel de info à direita)
    this.panelShift = aspect > 1.3 ? 1 : 0;
    this.applyShift();
  }

  applyShift() {
    const comparing = this.models.length > 1;
    this.camera.filmOffset = this.panelShift && !comparing ? 3.2 : 0;
    this.camera.updateProjectionMatrix();
  }

  /** @param {THREE.WebGLRenderer} r */
  render(r) {
    r.render(this.scene, this.camera);
  }
}
