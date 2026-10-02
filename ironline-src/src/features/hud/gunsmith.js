/**
 * Prévia 3D da arma no loadout ("gunsmith"): clona o modelo publicado em
 * `services.weapon.gun` (sem as mãos) e o renderiza num WebGLRenderer
 * próprio, com luz de estúdio (RoomEnvironment + key/rim), girando devagar.
 *
 * Contexto WebGL separado de propósito: não interfere no pipeline da
 * feature rendering e é destruído ao sair da tela.
 */
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class Gunsmith {
  constructor(THREE, gun, host, { w = 1100, h = 440, k = 1 } = {}) {
    this.THREE = THREE;
    this.w = w;
    this.h = h;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(2, k));
    r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    r.domElement.style.width = w + 'px';
    r.domElement.style.height = h + 'px';
    r.domElement.className = 'gs-canvas';
    host.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = this.env;
    scene.environmentIntensity = 0.55;

    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(2, 3, 1.5);
    const rim = new THREE.DirectionalLight(0xbcd6ff, 3.2);
    rim.position.set(-2.5, 1.2, -2);
    const fill = new THREE.DirectionalLight(0xffb870, 0.6);
    fill.position.set(0, -2, 1);
    scene.add(key, rim, fill);

    // clone sem mãos/mangas e sem objetos auxiliares
    const model = gun.clone(true);
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.scale.set(1, 1, 1);
    const drop = [];
    model.traverse((o) => {
      if (/^(hand|sleeve)/i.test(o.name) || o.isSkinnedMesh) drop.push(o);
    });
    for (const o of drop) o.parent?.remove(o);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    // centraliza
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const pivot = (this.pivot = new THREE.Group());
    model.position.sub(c);
    pivot.add(model);
    scene.add(pivot);
    this.size = size;
    // câmera: vista lateral (o cano aponta para -Z → direita da tela vista de +X)
    const len = Math.max(size.x, size.y, size.z);
    const cam = (this.camera = new THREE.PerspectiveCamera(20, w / h, 0.01, 50));
    const dist = (len * 0.5) / Math.tan((20 * Math.PI) / 360) / (w / h) * 1.18 + size.x;
    cam.position.set(dist, len * 0.08, -len * 0.05);
    cam.lookAt(0, 0, 0);
    this.t = 0;
    this.ok = true;
  }

  render(dt) {
    if (!this.ok) return;
    this.t += dt;
    this.pivot.rotation.y = Math.sin(this.t * 0.35) * 0.32 - 0.12;
    this.pivot.rotation.x = Math.sin(this.t * 0.23) * 0.04;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ok = false;
    try {
      this.env.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    } catch {}
    this.renderer.domElement.remove();
  }
}

/**
 * Silhueta 2D da arma real (vista lateral ortográfica, branco chapado com
 * alpha) — vira o ícone do painel de munição, do feed e dos slots, sempre
 * fiel ao modelo 3D da feature weapon.
 * Retorna { url, aspect } ou null.
 */
export function gunSilhouette(THREE, gun, { h = 160 } = {}) {
  let r;
  try {
    const model = gun.clone(true);
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    const drop = [];
    model.traverse((o) => {
      if (/^(hand|sleeve)/i.test(o.name) || o.isSkinnedMesh || o.isLight || o.isPoints || o.isSprite) drop.push(o);
    });
    for (const o of drop) o.parent?.remove(o);
    const scene = new THREE.Scene();
    scene.add(model);
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    // vista de +X: horizontal = Z (cano em -Z fica à direita), vertical = Y
    const aspect = size.z / Math.max(1e-3, size.y);
    const H = h, W = Math.round(h * aspect);
    const cam = new THREE.OrthographicCamera(-size.z / 2, size.z / 2, size.y / 2, -size.y / 2, 0.01, 20);
    cam.position.set(c.x + 5, c.y, c.z);
    cam.lookAt(c);
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.overrideMaterial.dispose();
    // versão "sombreada" para o painel de munição: tons de cinza por normal
    // (luz de estúdio de cima/frente) — trilhos, guarda-mão, ferrolho e mira
    // ganham leitura de volume em vez de um recorte chapado
    scene.overrideMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); float l = 0.5 + 0.5 * max(dot(n, normalize(vec3(-0.25, 0.85, 0.6))), 0.0) + 0.12 * max(n.y, 0.0); float rim = pow(1.0 - abs(n.z), 3.0) * 0.18; gl_FragColor = vec4(vec3(min(1.0, l + rim)), 1.0); }',
    });
    r.render(scene, cam);
    const sh = document.createElement('canvas');
    sh.width = W + 4; sh.height = H + 4;
    const g2 = sh.getContext('2d');
    // contorno escuro de 1 px (legível sobre céu claro), depois o sombreado
    g2.filter = 'brightness(0)';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) g2.drawImage(r.domElement, 2 + dx * 1.5, 2 + dy * 1.5);
    g2.filter = 'none';
    g2.globalAlpha = 1;
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const g3 = tmp.getContext('2d');
    g3.drawImage(r.domElement, 0, 0);
    g2.globalCompositeOperation = 'destination-out';
    g2.drawImage(tmp, 2, 2);
    g2.globalCompositeOperation = 'source-over';
    g2.drawImage(tmp, 2, 2);
    const shaded = sh.toDataURL('image/png');
    scene.overrideMaterial.dispose();
    return { url, shaded, aspect: (W + 4) / (H + 4) };
  } catch (err) {
    console.warn('[hud] silhueta da arma indisponível', err);
    return null;
  } finally {
    try {
      r?.dispose();
      r?.forceContextLoss();
    } catch {}
  }
}
