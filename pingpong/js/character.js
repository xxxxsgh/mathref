// Personagem humanoide procedural: tronco em torno (lathe), cabeça com rosto,
// braços e pernas com IK de dois ossos, passos com pés plantados,
// torção de tronco, cabeça seguindo a bola.
import * as THREE from 'three';
import { clamp, lerp, damp } from './const.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

function limb(len, r0, r1, mat) {
  // cilindro com esferas nas pontas, de 0 a len em +Y
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 14), mat);
  cyl.position.y = len / 2; g.add(cyl);
  const s0 = new THREE.Mesh(new THREE.SphereGeometry(r0, 14, 10), mat); g.add(s0);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(r1, 14, 10), mat); s1.position.y = len; g.add(s1);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function orient(obj, from, to) {
  obj.position.copy(from);
  _d.subVectors(to, from).normalize();
  obj.quaternion.setFromUnitVectors(UP, _d);
}
// IK de dois ossos. Retorna cotovelo/joelho em `outMid` e fim em `outEnd`.
function ik2(S, T, a, b, pole, outMid, outEnd) {
  _a.subVectors(T, S);
  let d = _a.length();
  const dir = _a.normalize();
  d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  _b.subVectors(pole, S);
  _b.addScaledVector(dir, -_b.dot(dir));
  if (_b.lengthSq() < 1e-8) _b.set(0, -1, 0);
  _b.normalize();
  outMid.copy(S).addScaledVector(dir, x).addScaledVector(_b, h);
  outEnd.copy(S).addScaledVector(dir, d);
}

function shirtTexture(color, accent, number, name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(color); g.fillRect(0, 0, 512, 256);
  // faixas laterais
  g.fillStyle = hex(accent);
  g.fillRect(118, 0, 16, 256); g.fillRect(378, 0, 16, 256);
  g.fillRect(0, 26, 512, 8);
  // número nas costas (u = 0.5)
  if (number != null) {
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.font = '900 120px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(number), 256, 150);
    if (name) { g.font = '800 34px Outfit, system-ui, sans-serif'; g.fillText(name.toUpperCase().slice(0, 10), 256, 66); }
  }
  // logo no peito (u = 0)
  g.fillStyle = hex(accent); g.beginPath(); g.arc(30, 90, 14, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Character {
  /**
   * opts: { shirt, accent, shorts, skin, hair, hairStyle, shoes, scale, number, name, facing (+1 olha para +z, -1 para -z) }
   */
  constructor(scene, opts) {
    this.o = Object.assign({ shirt: 0xf97316, accent: 0xffffff, shorts: 0x111827, skin: 0xe0ac69, hair: 0x1c1917, hairStyle: 'short', shoes: 0xffffff, scale: 1, number: 7, name: '', facing: 1, band: null }, opts);
    const s = this.o.scale;
    this.s = s;
    this.scene = scene;
    this.root = new THREE.Group();       // pelve (posição/orientação do corpo)
    this.limbs = new THREE.Group();      // membros em espaço do mundo
    scene.add(this.root, this.limbs);
    this.yaw = this.o.facing > 0 ? 0 : Math.PI;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.twist = 0; this.lean = 0.22; this.crouch = 0; this.bob = 0;
    this.lookAt = new THREE.Vector3(0, 1, 0);
    this.celebrate = 0; this.sad = 0;

    const M = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    this.mSkin = M(this.o.skin, 0.62);
    this.mShirt = new THREE.MeshStandardMaterial({ map: shirtTexture(this.o.shirt, this.o.accent, this.o.number, this.o.name), roughness: 0.8 });
    this.mShirtPlain = M(this.o.shirt, 0.8);
    this.mShorts = M(this.o.shorts, 0.85);
    this.mHair = M(this.o.hair, 0.9);
    this.mShoe = M(this.o.shoes, 0.55);
    this.mSock = M(0xf5f5f5, 0.9);

    // Dimensões
    this.hipW = 0.1 * s;
    this.thigh = 0.44 * s; this.shin = 0.43 * s; this.ankle = 0.075 * s;
    this.upper = 0.29 * s; this.fore = 0.27 * s;
    this.standH = this.thigh + this.shin + this.ankle - 0.02 * s;

    // Tronco
    this.spine = new THREE.Group(); this.root.add(this.spine);
    const prof = [[0.0, 0.0], [0.155, 0.0], [0.165, 0.08], [0.15, 0.2], [0.17, 0.33], [0.19, 0.44], [0.17, 0.52], [0.09, 0.56], [0.0, 0.57]].map(([r, y]) => new THREE.Vector2(r * s, y * s));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), this.mShirt);
    torso.scale.z = 0.72; torso.castShadow = true;
    this.spine.add(torso);
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.165 * s, 0.175 * s, 0.2 * s, 20), this.mShorts);
    shorts.scale.z = 0.75; shorts.position.y = -0.04 * s; shorts.castShadow = true;
    this.root.add(shorts);
    // Pescoço e cabeça
    this.neck = new THREE.Group(); this.neck.position.y = 0.55 * s; this.spine.add(this.neck);
    const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.055 * s, 0.1 * s, 12), this.mSkin);
    neckM.position.y = 0.04 * s; this.neck.add(neckM);
    this.head = new THREE.Group(); this.head.position.y = 0.17 * s; this.neck.add(this.head);
    this.buildHead();
    // Ombros (pontos de referência)
    this.shR = new THREE.Object3D(); this.shR.position.set(-0.2 * s, 0.47 * s, 0); this.spine.add(this.shR);
    this.shL = new THREE.Object3D(); this.shL.position.set(0.2 * s, 0.47 * s, 0); this.spine.add(this.shL);
    const shoulderPad = (x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 14, 10), this.mShirtPlain); m.position.set(x, 0.46 * s, 0); m.castShadow = true; this.spine.add(m); };
    shoulderPad(-0.18 * s); shoulderPad(0.18 * s);

    // Braços
    this.armR = { up: limb(this.upper, 0.055 * s, 0.045 * s, this.mShirtPlain), fo: limb(this.fore, 0.042 * s, 0.035 * s, this.mSkin), hand: this.hand() };
    this.armL = { up: limb(this.upper, 0.055 * s, 0.045 * s, this.mShirtPlain), fo: limb(this.fore, 0.042 * s, 0.035 * s, this.mSkin), hand: this.hand() };
    // manga curta: antebraço de pele, parte superior metade camiseta
    for (const a of [this.armR, this.armL]) {
      const skinUp = limb(this.upper * 0.5, 0.047 * s, 0.045 * s, this.mSkin);
      skinUp.position.y = this.upper * 0.5; a.up.add(skinUp);
      a.up.children[0].scale.set(1, 0.5, 1); a.up.children[0].position.y = this.upper * 0.25;
      a.up.children[2].visible = false;
      this.limbs.add(a.up, a.fo, a.hand);
    }
    // Pernas
    this.legR = this.leg(); this.legL = this.leg();
    this.footR = { pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1 };
    this.footL = { pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1 };
    this._mid = new THREE.Vector3(); this._end = new THREE.Vector3(); this._S = new THREE.Vector3(); this._P = new THREE.Vector3();
    this.handTargetR = new THREE.Vector3();
    this.handTargetL = new THREE.Vector3();
    this.freeHand = null; // alvo explícito para a mão livre (saque)
    // sombra de contato (suave, ajuda muito sem shadow map)
    if (!Character.blobTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      Character.blobTex = new THREE.CanvasTexture(c);
    }
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.9 * s), new THREE.MeshBasicMaterial({ map: Character.blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.limbs.add(this.blob);
    this.placed = false;
  }

  hand() {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045 * this.s, 12, 10), this.mSkin);
    palm.scale.set(1, 1.15, 0.7); palm.castShadow = true; g.add(palm);
    return g;
  }

  leg() {
    const s = this.s;
    const th = limb(this.thigh, 0.075 * s, 0.058 * s, this.mSkin);
    // bermuda cobrindo parte da coxa
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * s, 0.085 * s, this.thigh * 0.45, 14), this.mShorts);
    sh.position.y = this.thigh * 0.2; sh.castShadow = true; th.add(sh);
    const sn = limb(this.shin, 0.055 * s, 0.042 * s, this.mSkin);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.046 * s, 0.044 * s, 0.12 * s, 12), this.mSock);
    sock.position.y = this.shin - 0.05 * s; sn.add(sock);
    const shoe = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.035 * s, 0.25 * s), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
    sole.position.set(0, 0.018 * s, 0.05 * s);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 14, 10), this.mShoe);
    upper.scale.set(0.85, 0.65, 1.9); upper.position.set(0, 0.05 * s, 0.05 * s);
    sole.castShadow = upper.castShadow = true;
    shoe.add(sole, upper);
    this.limbs.add(th, sn, shoe);
    return { th, sn, shoe };
  }

  buildHead() {
    const s = this.s, h = this.head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115 * s, 28, 22), this.mSkin);
    skull.scale.set(0.92, 1.05, 1); skull.castShadow = true; h.add(skull);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.3 });
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 14, 10), white);
      e.position.set(sx * 0.04 * s, 0.015 * s, 0.098 * s); e.scale.z = 0.6; h.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 10, 8), dark);
      p.position.set(sx * 0.04 * s, 0.013 * s, 0.112 * s); h.add(p);
      this.eyes.push(p);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.008 * s, 0.01 * s), this.mHair);
      brow.position.set(sx * 0.042 * s, 0.05 * s, 0.105 * s); brow.rotation.z = -sx * 0.12; h.add(brow);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016 * s, 10, 8), this.mSkin);
    nose.position.set(0, -0.012 * s, 0.115 * s); nose.scale.set(0.8, 1.1, 1); h.add(nose);
    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022 * s, 0.005 * s, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a2e2e, roughness: 0.6 }));
    this.mouth.position.set(0, -0.05 * s, 0.1 * s); this.mouth.rotation.z = Math.PI; h.add(this.mouth);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 10, 8), this.mSkin);
      ear.position.set(sx * 0.105 * s, 0, 0); ear.scale.set(0.5, 1, 0.8); h.add(ear);
    }
    // Cabelo
    const st = this.o.hairStyle;
    const cap = (thetaLen = Math.PI / 2.1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.122 * s, 26, 16, 0, Math.PI * 2, 0, thetaLen), this.mHair); m.scale.set(0.95, 1.05, 1.04); m.position.y = 0.012 * s; m.rotation.x = -0.25; m.castShadow = true; return m; };
    if (st !== 'bald') h.add(cap(st === 'buzz' ? Math.PI / 2.6 : Math.PI / 2.1));
    if (st === 'long') {
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 20, 14), this.mHair);
      back.scale.set(1, 1.45, 0.6); back.position.set(0, -0.07 * s, -0.06 * s); h.add(back);
    }
    if (st === 'bun' || st === 'ponytail') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 14, 10), this.mHair);
      bun.position.set(0, st === 'bun' ? 0.11 * s : 0.02 * s, -0.11 * s); h.add(bun);
      if (st === 'ponytail') { const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.2 * s, 10), this.mHair); tail.position.set(0, -0.08 * s, -0.14 * s); tail.rotation.x = Math.PI + 0.3; h.add(tail); }
    }
    if (st === 'spiky') {
      for (let i = 0; i < 9; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.09 * s, 6), this.mHair);
        const a = (i / 9) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.06 * s, 0.1 * s, Math.sin(a) * 0.06 * s - 0.01 * s);
        sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); h.add(sp);
      }
    }
    if (st === 'afro') {
      const af = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 20, 16), this.mHair);
      af.position.set(0, 0.05 * s, -0.02 * s); af.scale.set(1, 0.9, 1); h.add(af);
    }
    if (this.o.band) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.113 * s, 0.012 * s, 8, 28), new THREE.MeshStandardMaterial({ color: this.o.band, roughness: 0.7 }));
      band.rotation.x = Math.PI / 2 - 0.2; band.position.y = 0.045 * s; h.add(band);
    }
    if (this.o.beard) {
      const bd = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.4), this.mHair);
      bd.position.set(0, -0.005 * s, 0.01 * s); bd.scale.set(0.95, 1.05, 1.02); h.add(bd);
    }
    if (this.o.glasses) {
      const fm = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 });
      for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.026 * s, 0.004 * s, 6, 16), fm); r.position.set(sx * 0.042 * s, 0.015 * s, 0.117 * s); h.add(r); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.03 * s, 0.004 * s, 0.004 * s), fm); br.position.set(0, 0.02 * s, 0.12 * s); h.add(br);
    }
  }

  // Coloca o corpo instantaneamente
  place(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.placed = false;
  }

  setVisible(v) { this.root.visible = v; this.limbs.visible = v; }

  // translúcido (jogador na frente da câmera)
  setGhost(alpha) {
    if (this._ghost === alpha) return;
    this._ghost = alpha;
    const on = alpha < 0.999;
    const f = o => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { m.transparent = on; m.opacity = alpha; m.depthWrite = !on || alpha > 0.5; m.needsUpdate = true; }
      o.castShadow = true;
    };
    this.root.traverse(f); this.limbs.traverse(f);
  }

  /**
   * update: x,z alvo do corpo já resolvido pelo chamador (this.pos).
   * paddleGrip: posição mundial do cabo da raquete (mão direita).
   */
  update(dt, t, paddleGrip, opts = {}) {
    const s = this.s;
    // Orientação e postura
    const f = this.o.facing;
    this.root.rotation.set(0, this.yaw, 0);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const crouch = opts.crouch ?? 0.06;
    const hipY = this.standH - crouch * s - Math.min(0.05, speed * 0.02) + Math.sin(t * 2.2) * 0.004 + this.bob;
    this.root.position.set(this.pos.x, hipY + (this.celebrate > 0 ? Math.max(0, Math.sin(t * 12)) * 0.12 * this.celebrate : 0), this.pos.z);

    // torção do tronco segue a raquete (lado forehand/backhand)
    _a.copy(paddleGrip); this.root.worldToLocal(_a);
    const tw = clamp(-_a.x * 1.1, -0.9, 0.9) + (opts.swing || 0) * 0.6 * Math.sign(-_a.x || 1);
    this.twist = damp(this.twist, tw, 10, dt);
    const leanT = (opts.lean ?? 0.25) - this.sad * 0.25;
    this.lean = damp(this.lean, leanT, 6, dt);
    this.spine.rotation.set(this.lean, this.twist * 0.7, -this.vel.x * f * 0.03);
    this.spine.position.y = 0.06 * s;
    this.root.updateMatrixWorld(true);

    // Cabeça olha para a bola
    _b.copy(this.lookAt); this.head.parent.worldToLocal(_b);
    const yawH = clamp(Math.atan2(_b.x, _b.z), -1.1, 1.1);
    const pitchH = clamp(-Math.atan2(_b.y - 0.17 * s, Math.hypot(_b.x, _b.z)), -0.6, 0.6) - this.sad * 0.4;
    this.neck.rotation.y = damp(this.neck.rotation.y, yawH, 12, dt);
    this.head.rotation.x = damp(this.head.rotation.x, pitchH, 12, dt);
    this.mouth.scale.y = this.celebrate > 0 ? 1.6 : 1;
    this.mouth.rotation.z = this.sad > 0.1 ? 0 : Math.PI;

    // Braço direito → raquete
    this.shR.getWorldPosition(this._S);
    this._P.copy(this._S).add(_c.set(-f * 0.25, -0.6, -f * 0.1).applyAxisAngle(UP, 0));
    // polo do cotovelo: para baixo e para fora (lado direito)
    _c.set(-0.35 * s, -0.4, -0.15).applyQuaternion(this.root.quaternion);
    this._P.copy(this._S).add(_c);
    ik2(this._S, paddleGrip, this.upper, this.fore, this._P, this._mid, this._end);
    orient(this.armR.up, this._S, this._mid);
    orient(this.armR.fo, this._mid, this._end);
    this.armR.hand.position.copy(this._end);
    this.handReach = this._S.distanceTo(paddleGrip) - (this.upper + this.fore);

    // Braço esquerdo: equilíbrio ou segurando a bola
    this.shL.getWorldPosition(this._S);
    if (this.freeHand) this.handTargetL.copy(this.freeHand);
    else {
      _c.set(0.2 * s, -0.3 * s + Math.sin(t * 2) * 0.01, 0.24 * s).applyQuaternion(this.spine.getWorldQuaternion(_q));
      this.handTargetL.copy(this._S).add(_c);
      if (this.celebrate > 0) this.handTargetL.set(this._S.x, this._S.y + 0.55, this._S.z);
    }
    _c.set(0.35 * s, -0.4, -0.15).applyQuaternion(this.root.quaternion);
    this._P.copy(this._S).add(_c);
    ik2(this._S, this.handTargetL, this.upper, this.fore, this._P, this._mid, this._end);
    orient(this.armL.up, this._S, this._mid);
    orient(this.armL.fo, this._mid, this._end);
    this.armL.hand.position.copy(this._end);

    // Pernas com pés plantados
    const stance = (opts.stance ?? 0.2) * s;
    this.stepFoot(this.footR, this.footL, -stance, dt, f);
    this.stepFoot(this.footL, this.footR, stance, dt, f);
    this.placed = true;
    this.blob.position.set(this.pos.x, 0.014, this.pos.z);
    this.solveLeg(this.legR, this.footR, -this.hipW);
    this.solveLeg(this.legL, this.footL, this.hipW);
  }

  stepFoot(foot, other, lx, dt, f) {
    // posição "de casa" do pé no chão
    _a.set(lx, 0, 0.02).applyAxisAngle(UP, this.yaw).add(this.pos);
    _a.addScaledVector(this.vel, 0.12);
    _a.y = 0;
    if (!this.placed) { foot.pos.copy(_a); foot.from.copy(_a); foot.to.copy(_a); foot.t = 1; return; }
    if (foot.t >= 1) {
      const dist = Math.hypot(foot.pos.x - _a.x, foot.pos.z - _a.z);
      if (dist > 0.16 * this.s && other.t >= 1) {
        foot.from.copy(foot.pos); foot.to.copy(_a); foot.t = 0;
      }
    }
    if (foot.t < 1) {
      foot.t = Math.min(1, foot.t + dt / 0.13);
      const e = foot.t * foot.t * (3 - 2 * foot.t);
      foot.pos.lerpVectors(foot.from, foot.to, e);
      foot.pos.y = Math.sin(Math.PI * foot.t) * 0.07 * this.s;
      if (foot.t >= 1) this.onStep && this.onStep();
    }
  }

  solveLeg(leg, foot, lx) {
    const s = this.s;
    _a.set(lx, -0.02 * s, 0).applyMatrix4(this.root.matrixWorld);  // quadril
    _b.set(foot.pos.x, foot.pos.y + this.ankle, foot.pos.z);           // tornozelo
    // polo do joelho: para frente
    _c.set(lx * 0.5, -0.3, 0.6).applyQuaternion(this.root.quaternion).add(_a);
    ik2(_a, _b, this.thigh, this.shin, _c, this._mid, this._end);
    orient(leg.th, _a, this._mid);
    orient(leg.sn, this._mid, this._end);
    leg.shoe.position.set(this._end.x, foot.pos.y, this._end.z);
    leg.shoe.rotation.set(0, this.yaw + (lx > 0 ? 0.15 : -0.15), 0);
  }

  dispose() {
    this.scene.remove(this.root, this.limbs);
    const kill = o => { if (o.geometry) o.geometry.dispose(); };
    this.root.traverse(kill); this.limbs.traverse(kill);
  }
}
