/**
 * Equipamento à parte da malha skinnada (objetos próprios, procedurais):
 *
 *   buildShield()   escudo balístico curvo (aço pintado com riscos, mossas
 *                   de bala, faixas de alerta, visor de vidro escuro, borda
 *                   de borracha, alças atrás) — volume de acerto próprio
 *   Glint           reflexo da luneta do atirador (sprite aditivo em estrela;
 *                   intensidade pelo ângulo arma × câmera e pela carga)
 *   Laser           feixe vermelho do atirador (fita voltada para a câmera
 *                   + ponto no impacto), comprimento por raycast
 *   buildKnife()    faca da execução (mão do operador)
 *   Pulse           brilho verde da reanimação do socorrista
 *
 * Texturas em canvas, geradas uma vez e compartilhadas.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Meias-medidas do volume de acerto do escudo (espaço local do escudo). */
export const SHIELD_HALF = new THREE.Vector3(0.3, 0.52, 0.06);

let _shieldMat = null;
function shieldMaterial() {
  if (_shieldMat) return _shieldMat;
  const W = 256, H = 448;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  // aço pintado cinza-azulado com variação
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#3a4046');
  grd.addColorStop(1, '#2c3136');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  let s = 77;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.04})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  // riscos de uso
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(190,198,205,${0.06 + rnd() * 0.14})`;
    g.lineWidth = 0.6 + rnd() * 1.2;
    const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = 6 + rnd() * 40;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // faixas de alerta (chevrons) no pé
  g.save();
  g.beginPath();
  g.rect(0, H - 60, W, 44);
  g.clip();
  g.fillStyle = '#b8901f';
  g.fillRect(0, H - 60, W, 44);
  g.fillStyle = '#16181a';
  for (let x = -60; x < W + 60; x += 34) {
    g.beginPath();
    g.moveTo(x, H - 16);
    g.lineTo(x + 17, H - 16);
    g.lineTo(x + 61, H - 60);
    g.lineTo(x + 44, H - 60);
    g.fill();
  }
  g.restore();
  // número de estêncil (sem marcas)
  g.fillStyle = 'rgba(214,214,206,0.75)';
  g.font = 'bold 54px monospace';
  g.textAlign = 'center';
  g.fillText('07', W / 2, H * 0.62);
  // mossas de bala: halo claro + centro escuro
  for (let i = 0; i < 9; i++) {
    const x = 30 + rnd() * (W - 60), y = 130 + rnd() * (H - 230), r = 4 + rnd() * 4;
    const rg = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    rg.addColorStop(0, 'rgba(20,20,20,0.95)');
    rg.addColorStop(0.35, 'rgba(160,165,170,0.7)');
    rg.addColorStop(1, 'rgba(160,165,170,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _shieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.52, metalness: 0.55 });
  return _shieldMat;
}

/**
 * Escudo balístico: centro na origem, +Z = frente (para fora), +Y = cima.
 * Curvo em torno do eixo vertical (o centro avança ~4 cm).
 */
export function buildShield() {
  const grp = new THREE.Group();
  grp.name = 'riot-shield';
  const w = SHIELD_HALF.x * 2 - 0.02, h = SHIELD_HALF.y * 2 - 0.02, t = 0.03;
  const geo = new THREE.BoxGeometry(w, h, t, 12, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) - (x * x) / (w * w) * 0.17 + 0.04);
  }
  geo.computeVertexNormals();
  const plate = new THREE.Mesh(geo, shieldMaterial());
  plate.castShadow = true;
  plate.receiveShadow = true;
  grp.add(plate);
  // borda de borracha
  const rub = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
  for (const sy of [1, -1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.025, t + 0.02), rub);
    b.position.set(0, (sy * h) / 2, 0.035);
    grp.add(b);
  }
  for (const sx of [1, -1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, h, t + 0.02), rub);
    b.position.set((sx * w) / 2, 0, 0.04 - 0.17 * 0.25);
    grp.add(b);
  }
  // visor (vidro escuro reflexivo) com moldura
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1014, roughness: 0.05, metalness: 0.9 });
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.075, 0.012), glass);
  vis.position.set(0, h * 0.33, 0.058);
  grp.add(vis);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.01), rub);
  fr.position.set(0, h * 0.33, 0.05);
  grp.add(fr);
  // alças (atrás)
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.4, metalness: 0.8 });
  for (const [y, len] of [[0.05, 0.16], [-0.18, 0.12]]) {
    const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), metal);
    hnd.rotation.z = Math.PI / 2;
    hnd.position.set(0, y, -0.03);
    grp.add(hnd);
  }
  grp.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.userData.noSkyOcclusion = true;
    }
  });
  return grp;
}

// ─── reflexo da luneta ───────────────────────────────────────────────────
let _glintTex = null;
function glintTexture() {
  if (_glintTex) return _glintTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;
  const rg = g.createRadialGradient(c, c, 0, c, c, c);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.12, 'rgba(255,246,220,0.9)');
  rg.addColorStop(0.35, 'rgba(255,220,160,0.25)');
  rg.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  // raios em estrela (difração)
  g.globalCompositeOperation = 'lighter';
  for (const [a, l, w] of [[0, 1, 3], [Math.PI / 2, 1, 3], [Math.PI / 4, 0.55, 1.6], [-Math.PI / 4, 0.55, 1.6]]) {
    g.save();
    g.translate(c, c);
    g.rotate(a);
    const lg = g.createLinearGradient(-c * l, 0, c * l, 0);
    lg.addColorStop(0, 'rgba(255,240,210,0)');
    lg.addColorStop(0.5, 'rgba(255,250,235,0.95)');
    lg.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = lg;
    g.fillRect(-c * l, -w / 2, c * l * 2, w);
    g.restore();
  }
  _glintTex = new THREE.CanvasTexture(cv);
  _glintTex.colorSpace = THREE.SRGBColorSpace;
  return _glintTex;
}

export class Glint {
  /** `bone` = osso `weapon` do atirador; `local` = objetiva (espaço da arma). */
  constructor(bone, local) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sprite.position.set(local[0], local[1], local[2] + 0.02);
    this.sprite.renderOrder = 5;
    this.sprite.frustumCulled = false;
    bone.add(this.sprite);
    this.bone = bone;
    this.k = 0;
  }

  /** `charge` 0..1 (carga da mira), `aiming` 0..1. */
  update(camera, charge, aiming, dt) {
    const sp = this.sprite;
    this.bone.updateWorldMatrix(true, false);
    sp.getWorldPosition(_v);
    const fwd = _w.set(0, 0, 1).applyQuaternion(this.bone.getWorldQuaternion(_q));
    const toCam = camera.position.clone().sub(_v);
    const dist = toCam.length();
    toCam.divideScalar(dist || 1);
    const c = fwd.dot(toCam);
    const sm = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    // brilho de fundo quando a arma aponta "mais ou menos" para cá + pico
    // quando a luneta está alinhada; a carga intensifica (aviso do tiro)
    const target = aiming * (sm(0.55, 0.9, c) * 0.35 + sm(0.93, 0.995, c) * (0.65 + 0.6 * charge));
    this.k += (target - this.k) * (1 - Math.exp(-dt * 10));
    // pisca de leve (cintilação do ar)
    const flick = 0.85 + 0.15 * Math.sin(performance.now() * 0.023 + dist);
    const size = (0.06 + this.k * 0.42) * Math.max(1, dist / 14) * flick;
    sp.scale.set(size, size, 1);
    sp.material.opacity = Math.min(1, this.k * 1.4);
    sp.material.color.setScalar(1 + this.k * 3);
    sp.visible = this.k > 0.02;
  }

  dispose() {
    this.sprite.removeFromParent();
    this.sprite.material.dispose();
  }
}

// ─── laser ───────────────────────────────────────────────────────────────
let _beamTex = null;
function beamTexture() {
  if (_beamTex) return _beamTex;
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 64;
  const g = cv.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, 'rgba(255,40,30,0)');
  lg.addColorStop(0.42, 'rgba(255,60,40,0.55)');
  lg.addColorStop(0.5, 'rgba(255,220,200,1)');
  lg.addColorStop(0.58, 'rgba(255,60,40,0.55)');
  lg.addColorStop(1, 'rgba(255,40,30,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, 4, 64);
  _beamTex = new THREE.CanvasTexture(cv);
  return _beamTex;
}

export class Laser {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0); // eixo Y = comprimento, base na origem
    this.mat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xff3020, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.beam = new THREE.Mesh(geo, this.mat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 4;
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xff2a18, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.dot.scale.setScalar(0.12);
    scene.add(this.beam, this.dot);
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.n = 0;
  }

  /** from/to no mundo; `k` 0..1 intensidade. */
  update(from, to, camera, k) {
    const vis = k > 0.01;
    this.beam.visible = this.dot.visible = vis;
    if (!vis) return;
    const axis = _v.subVectors(to, from);
    let len = axis.length();
    axis.divideScalar(len || 1);
    // feixe apontado para a câmera: termina 2,5 m antes dela (senão a fita
    // vira uma faixa larga cruzando a tela); o ponto fica no fim visível
    const tc = _w.subVectors(camera.position, from).dot(axis);
    const near = Math.sqrt(Math.max(0, _w.lengthSq() - tc * tc));
    if (tc > 0 && tc < len + 0.5 && near < 0.6) len = Math.max(0.5, tc - 2.5);
    // fita: eixo Y ao longo do feixe, girada para encarar a câmera
    const toCam = _w.subVectors(camera.position, from);
    const side = new THREE.Vector3().crossVectors(axis, toCam).normalize();
    const normal = new THREE.Vector3().crossVectors(side, axis);
    const m = new THREE.Matrix4().makeBasis(side, axis, normal);
    this.beam.quaternion.setFromRotationMatrix(m);
    this.beam.position.copy(from);
    // largura cresce com a distância da câmera (sempre ~1–2 px)
    const dc = camera.position.distanceTo(from);
    this.beam.scale.set(0.01 + dc * 0.0007, len, 1);
    this.mat.opacity = 0.35 + 0.5 * k;
    this.dot.position.copy(from).addScaledVector(axis, len - 0.02);
    const dd = camera.position.distanceTo(this.dot.position);
    this.dot.scale.setScalar((0.06 + dd * 0.006) * (0.7 + 0.6 * k));
  }

  dispose() {
    this.beam.removeFromParent();
    this.dot.removeFromParent();
    this.mat.dispose();
    this.dot.material.dispose();
  }
}

// ─── faca da execução ────────────────────────────────────────────────────
export function buildKnife() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9fa3, roughness: 0.22, metalness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1c, roughness: 0.7, metalness: 0.1 });
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.012);
  shape.lineTo(0.15, -0.01);
  shape.quadraticCurveTo(0.185, 0.0, 0.19, 0.012);
  shape.lineTo(0.12, 0.014);
  shape.lineTo(0, 0.013);
  shape.lineTo(0, -0.012);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 }), steel);
  blade.position.z = -0.002;
  g.add(blade);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.026, 0.02), dark);
  handle.position.x = -0.06;
  g.add(handle);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.022), dark);
  g.add(guard);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// ─── brilho da reanimação ────────────────────────────────────────────────
export class Pulse {
  constructor(scene) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0x46ff7a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sprite.visible = false;
    scene.add(this.sprite);
  }
  update(pos, k, t) {
    this.sprite.visible = k > 0.01;
    if (!this.sprite.visible) return;
    this.sprite.position.copy(pos);
    const s = 0.35 + 0.25 * Math.sin(t * 9) * k + k * 0.4;
    this.sprite.scale.setScalar(s);
    this.sprite.material.opacity = 0.35 + 0.4 * k;
  }
  dispose() {
    this.sprite.removeFromParent();
    this.sprite.material.dispose();
  }
}
