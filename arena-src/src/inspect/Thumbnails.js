import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildWeaponModel } from '../weapons/Models.js';
import { skinById } from '../skins/SkinCatalog.js';

/**
 * Miniaturas 3D dos itens para os cards do inventário.
 *
 * Um renderer pequeno e separado desenha cada arma com a skin real (padrão,
 * float, seed) e guarda o PNG em cache por item. A geração é feita em fila,
 * algumas por frame, para não travar a interface ao abrir o inventário.
 */
export class Thumbnails {
  constructor() {
    this.w = 320;
    this.h = 170;
    this.renderer = null;
    /** @type {Map<string, string>} */
    this.cache = new Map();
    /** @type {{ key: string, inst: any, type: string, cb: (url: string) => void }[]} */
    this.queue = [];
    this.running = false;
  }

  init() {
    if (this.renderer) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(this.w, this.h, false);
    r.setPixelRatio(1);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-1, 2, 2);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.4));
    this.camera = new THREE.PerspectiveCamera(30, this.w / this.h, 0.01, 20);
  }

  /**
   * @param {string} key  cache (ex.: id do item)
   * @param {{ skinId: string, floatValue: number, patternSeed: number, wearSeed: number, weaponType: string }} item
   * @param {(url: string) => void} cb
   */
  request(key, item, cb) {
    const hit = this.cache.get(key);
    if (hit) return cb(hit);
    this.queue.push({ key, type: item.weaponType, inst: { skin: skinById(item.skinId), floatValue: item.floatValue, patternSeed: item.patternSeed, wearSeed: item.wearSeed }, cb });
    if (!this.running) this.pump();
  }

  pump() {
    this.running = true;
    const step = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 12) {
        const job = /** @type {any} */ (this.queue.shift());
        const hit = this.cache.get(job.key);
        if (hit) {
          job.cb(hit);
          continue;
        }
        const url = this.render(job.type, job.inst);
        this.cache.set(job.key, url);
        job.cb(url);
      }
      if (this.queue.length) requestAnimationFrame(step);
      else this.running = false;
    };
    requestAnimationFrame(step);
  }

  render(type, inst) {
    this.init();
    const m = buildWeaponModel(type, inst);
    const root = m.root;
    // de perfil, levemente inclinado; enquadra pelo comprimento
    root.rotation.set(0.05, Math.PI / 2, type === 'knife' ? 0.55 : 0.1);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.sub(c);
    this.scene.add(root);
    const size = box.getSize(new THREE.Vector3());
    const t = Math.tan(THREE.MathUtils.degToRad(15));
    const aspect = this.w / this.h;
    const dist = Math.max((size.x * 0.56) / (t * aspect), (size.y * 0.62) / t) + size.z / 2;
    this.camera.position.set(0, 0, dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();
    const r = /** @type {THREE.WebGLRenderer} */ (this.renderer);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    this.scene.remove(root);
    root.traverse((o) => {
      const mesh = /** @type {any} */ (o);
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        if (mesh.material.userData?.skinUniforms) mesh.material.dispose();
      }
    });
    return url;
  }
}
