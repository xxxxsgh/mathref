// Raquete, bola (com rastro e sombra), efeitos visuais.
import * as THREE from 'three';
import { TY, L, W, R, clamp, rnd } from './const.js';

export const PADDLES = [
  { id: 'classica', name: 'Clássica', price: 0, fore: 0xc81e1e, back: 0x151515, wood: 0xb07a45, lvl: 1, stats: 'Equilibrada' },
  { id: 'oceano', name: 'Oceano', price: 300, fore: 0x0284c7, back: 0x0f172a, wood: 0x7c5a3a, lvl: 2 },
  { id: 'floresta', name: 'Floresta', price: 450, fore: 0x15803d, back: 0x14532d, wood: 0x9a6b3f, lvl: 3 },
  { id: 'neon', name: 'Neon', price: 800, fore: 0x22ff88, back: 0x111111, wood: 0x222222, glow: 0x22ff88, lvl: 5 },
  { id: 'roxa', name: 'Ametista', price: 1100, fore: 0x9333ea, back: 0x1e1b4b, wood: 0xe9d5ff, lvl: 7 },
  { id: 'ouro', name: 'Ouro', price: 2000, fore: 0xfbbf24, back: 0x78350f, wood: 0x3b2513, glow: 0xfbbf24, lvl: 10 },
  { id: 'fogo', name: 'Fogo', price: 3000, fore: 0xff3d00, back: 0x1a0500, wood: 0xffb300, glow: 0xff5500, lvl: 13 },
  { id: 'gelo', name: 'Gelo', price: 3500, fore: 0xbae6fd, back: 0x0c4a6e, wood: 0xe0f2fe, glow: 0x7dd3fc, lvl: 15 },
  { id: 'galaxia', name: 'Galáxia', price: 5000, fore: 0x4338ca, back: 0x020617, wood: 0xc7d2fe, glow: 0x818cf8, lvl: 18 },
];
export const BALLS = [
  { id: 'branca', name: 'Branca', price: 0, color: 0xfbfbf7, logo: '#f97316' },
  { id: 'laranja', name: 'Laranja', price: 200, color: 0xff8a1f, logo: '#ffffff' },
  { id: 'neon', name: 'Neon', price: 600, color: 0xb6ff3b, logo: '#111111', glow: true },
  { id: 'rubi', name: 'Rubi', price: 1200, color: 0xff2d55, logo: '#ffffff', glow: true },
  { id: 'estrela', name: 'Estrela', price: 2500, color: 0xfff1a8, logo: '#b45309', glow: true },
];

function bladeShape() {
  const s = new THREE.Shape();
  const rx = 0.076, ry = 0.08;
  s.moveTo(-0.014, -0.068);
  s.bezierCurveTo(-0.05, -0.066, -rx, -0.035, -rx, 0.0);
  s.bezierCurveTo(-rx, 0.05, -0.04, ry, 0, ry);
  s.bezierCurveTo(0.04, ry, rx, 0.05, rx, 0.0);
  s.bezierCurveTo(rx, -0.035, 0.05, -0.066, 0.014, -0.068);
  s.lineTo(-0.014, -0.068);
  return s;
}

export class Paddle {
  constructor(scene, skin) {
    this.group = new THREE.Group();
    const shape = bladeShape();
    const woodG = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.001, bevelSegments: 2, curveSegments: 24 });
    woodG.translate(0, 0, -0.003);
    const rubG = new THREE.ShapeGeometry(shape, 24);
    this.mWood = new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.55 });
    this.mFore = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.78, side: THREE.DoubleSide });
    this.mBack = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.78, side: THREE.DoubleSide });
    const wood = new THREE.Mesh(woodG, this.mWood);
    const fore = new THREE.Mesh(rubG, this.mFore); fore.position.z = 0.0052;
    const back = new THREE.Mesh(rubG, this.mBack); back.position.z = -0.0052; back.rotation.y = Math.PI;
    // cabo
    const hShape = new THREE.Shape();
    hShape.moveTo(-0.013, 0); hShape.lineTo(0.013, 0); hShape.lineTo(0.016, -0.085); hShape.quadraticCurveTo(0, -0.1, -0.016, -0.085); hShape.lineTo(-0.013, 0);
    const handleG = new THREE.ExtrudeGeometry(hShape, { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3 });
    handleG.translate(0, -0.066, -0.011);
    const handle = new THREE.Mesh(handleG, this.mWood);
    [wood, fore, back, handle].forEach(m => { m.castShadow = true; this.group.add(m); });
    this.blade = new THREE.Group();
    this.group.add(this.blade);
    this.grip = new THREE.Vector3(0, -0.12, 0);
    scene.add(this.group);
    this.setSkin(skin || PADDLES[0]);
    this.gripWorld = new THREE.Vector3();
  }
  setSkin(sk) {
    this.mFore.color.setHex(sk.fore); this.mBack.color.setHex(sk.back); this.mWood.color.setHex(sk.wood);
    this.mFore.emissive.setHex(sk.glow || 0); this.mFore.emissiveIntensity = sk.glow ? 0.55 : 0;
  }
  getGrip() { this.group.updateMatrixWorld(true); return this.gripWorld.copy(this.grip).applyMatrix4(this.group.matrixWorld); }
}

function ballTexture(color, logo) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 128);
  g.fillStyle = logo;
  g.font = '900 30px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★ 40+', 64, 64);
  g.fillRect(150, 58, 70, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TRAIL_N = 26;
export class BallView {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0, emissive: 0x000000 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), this.mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    // sombra falsa (ajuda a ler profundidade)
    const sh = document.createElement('canvas'); sh.width = sh.height = 64;
    const g = sh.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);
    // rastro (fita de triângulos)
    this.hist = [];
    const pos = new Float32Array(TRAIL_N * 2 * 3), col = new Float32Array(TRAIL_N * 2 * 4);
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.tg = new THREE.BufferGeometry();
    this.tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.tg.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.tg.setIndex(idx);
    this.trail = new THREE.Mesh(this.tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.spinAngle = new THREE.Quaternion();
    this.setSkin(BALLS[0]);
  }
  setSkin(sk) {
    this.mat.map = ballTexture(sk.color, sk.logo); this.mat.needsUpdate = true;
    this.mat.emissive.setHex(sk.glow ? sk.color : 0x000000); this.mat.emissiveIntensity = sk.glow ? 0.5 : 0;
  }
  clearTrail() { this.hist.length = 0; }
  update(b, dt, camera, showTrail, visible = true) {
    this.mesh.visible = this.blob.visible = visible;
    this.trail.visible = visible && showTrail;
    this.mesh.position.set(b.x, b.y, b.z);
    // rotação visual (reduzida para não estroboscopar)
    const w = Math.hypot(b.wx, b.wy, b.wz);
    if (w > 0.1) {
      _ax.set(b.wx / w, b.wy / w, b.wz / w);
      _qq.setFromAxisAngle(_ax, Math.min(w, 60) * dt * 0.6);
      this.mesh.quaternion.premultiply(_qq);
    }
    const over = Math.abs(b.x) <= W && Math.abs(b.z) <= L && b.y > TY - 0.01;
    const gy = over ? TY + 0.002 : 0.016;
    const h = Math.max(0, b.y - gy);
    this.blob.position.set(b.x, gy, b.z);
    this.blob.scale.setScalar(0.6 + h * 1.4);
    this.blob.material.opacity = clamp(0.9 - h * 0.9, 0.12, 0.9);

    // rastro
    if (!showTrail) { this.hist.length = 0; return; }
    this.hist.unshift(b.x, b.y, b.z);
    if (this.hist.length > TRAIL_N * 3) this.hist.length = TRAIL_N * 3;
    const n = this.hist.length / 3;
    const pos = this.tg.attributes.position.array, col = this.tg.attributes.color.array;
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    const top = (b.wx * b.vz - b.wz * b.vx) / (Math.hypot(b.vx, b.vz) || 1);
    // cor: topspin = laranja/vermelho, backspin = azul
    const cr = top >= 0 ? 1 : 0.35, cg = top >= 0 ? 0.55 - Math.min(0.4, top / 400) : 0.7, cb = top >= 0 ? 0.2 : 1;
    const alpha = clamp((speed - 3) / 10, 0.12, 0.75);
    camera.getWorldPosition(_cam);
    for (let i = 0; i < TRAIL_N; i++) {
      const k = Math.min(i, n - 1);
      const x = this.hist[k * 3] ?? b.x, y = this.hist[k * 3 + 1] ?? b.y, z = this.hist[k * 3 + 2] ?? b.z;
      const k2 = Math.min(k + 1, n - 1);
      _dir.set((this.hist[k2 * 3] ?? x) - x, (this.hist[k2 * 3 + 1] ?? y) - y, (this.hist[k2 * 3 + 2] ?? z) - z);
      if (_dir.lengthSq() < 1e-9) _dir.set(0, 0, 1);
      _side.subVectors(_cam, _v.set(x, y, z)).cross(_dir).normalize();
      const wdt = R * 0.9 * (1 - i / TRAIL_N);
      pos[i * 6] = x + _side.x * wdt; pos[i * 6 + 1] = y + _side.y * wdt; pos[i * 6 + 2] = z + _side.z * wdt;
      pos[i * 6 + 3] = x - _side.x * wdt; pos[i * 6 + 4] = y - _side.y * wdt; pos[i * 6 + 5] = z - _side.z * wdt;
      const a = alpha * (1 - i / TRAIL_N) * (i < n ? 1 : 0);
      for (const j of [0, 4]) { col[i * 8 + j] = cr; col[i * 8 + j + 1] = cg; col[i * 8 + j + 2] = cb; col[i * 8 + j + 3] = a; }
    }
    this.tg.attributes.position.needsUpdate = true;
    this.tg.attributes.color.needsUpdate = true;
  }
}
const _ax = new THREE.Vector3(), _qq = new THREE.Quaternion(), _cam = new THREE.Vector3(), _dir = new THREE.Vector3(), _side = new THREE.Vector3(), _v = new THREE.Vector3();

// Partículas, anéis de quique, flash de impacto
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    const geo = new THREE.SphereGeometry(0.006, 6, 4);
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.parts.push({ m, v: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.rings = [];
    const rg = new THREE.RingGeometry(0.7, 1, 32);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.rings.push({ m, life: 0, max: 1, size: 0.1 });
    }
    this.flash = new THREE.PointLight(0xffc38a, 0, 1.5, 2);
    scene.add(this.flash);
    this.flashT = 0;
  }
  burst(x, y, z, color, n = 16, speed = 1.8, life = 0.5) {
    let k = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      p.life = p.max = life * rnd(0.6, 1.1);
      p.m.visible = true; p.m.position.set(x, y, z);
      p.m.material.color.setHex(color);
      p.v.set(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.4, 1.1));
      if (++k >= n) break;
    }
  }
  ring(x, y, z, color = 0xffffff, size = 0.12, life = 0.45) {
    const r = this.rings.find(r => r.life <= 0) || this.rings[0];
    r.life = r.max = life; r.size = size; r.m.visible = true;
    r.m.position.set(x, y, z); r.m.material.color.setHex(color);
  }
  hitFlash(x, y, z, power) {
    this.flash.position.set(x, y, z); this.flash.intensity = 3 + power * 6; this.flashT = 0.12;
  }
  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt; p.v.y -= 5 * dt; p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0, p.life / p.max);
      if (p.life <= 0) p.m.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(r.size * (0.3 + k));
      r.m.material.opacity = (1 - k) * 0.8;
      if (r.life <= 0) r.m.visible = false;
    }
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity *= 0.8; if (this.flashT <= 0) this.flash.intensity = 0; }
  }
}
