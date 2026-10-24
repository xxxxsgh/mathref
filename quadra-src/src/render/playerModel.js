// Boneco low-poly de 1,75 m, montado com primitivas e animado por código
// (corrida, chute, carrinho, mergulho, queda, cansaço). A frente do modelo
// é +z local; `place()` gira para o ângulo `facing` da simulação.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a1e', '#a0662f'];
const HAIR = ['#1b1b1b', '#3b2412', '#5a3a1a', '#0d0d0d', '#7a5230', '#222'];

const geo = {
  torso: new THREE.BoxGeometry(0.42, 0.56, 0.24),
  shorts: new THREE.BoxGeometry(0.41, 0.22, 0.26),
  thigh: new THREE.CylinderGeometry(0.078, 0.062, 0.46, 8),
  shin: new THREE.CylinderGeometry(0.062, 0.05, 0.42, 8),
  foot: new THREE.BoxGeometry(0.1, 0.07, 0.25),
  upperArm: new THREE.CylinderGeometry(0.062, 0.052, 0.3, 7),
  foreArm: new THREE.CylinderGeometry(0.05, 0.042, 0.3, 7),
  hand: new THREE.SphereGeometry(0.048, 8, 6),
  head: new THREE.SphereGeometry(0.115, 14, 10),
  hair: new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8),
  number: new THREE.PlaneGeometry(0.3, 0.3),
};

const matCache = new Map();
function mat(color, rough = 0.75) {
  const k = `${color}:${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
  return matCache.get(k);
}

function numberTexture(num, fg) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = fg;
  g.font = 'bold 46px Arial Narrow, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mesh(g, m, shadow) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  return o;
}

// Lado local (±x do modelo) que corresponde ao lado `worldZ` (±1) no mundo.
function localSide(worldZ, facing) {
  return Math.sign(worldZ * -Math.cos(facing)) || 1;
}

export class PlayerModel {
  constructor(p, colors, shadows) {
    this.p = p;
    const gk = p.isGK;
    const shirt = gk ? colors.gk : colors.shirt;
    const skin = SKINS[(p.num * 7 + p.team * 3) % SKINS.length];
    const hair = HAIR[(p.num * 5 + p.team) % HAIR.length];
    const S = shadows;

    this.root = new THREE.Group();
    this.body = new THREE.Group(); // tudo que inclina (quadril para cima)
    this.root.add(this.body);

    // pernas (pivô no quadril)
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.105 * side, 0.86, 0);
      const thigh = mesh(geo.thigh, mat(skin), S);
      thigh.position.y = -0.23;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      const shin = mesh(geo.shin, mat(colors.socks), S);
      shin.position.y = -0.21;
      knee.add(shin);
      const foot = mesh(geo.foot, mat('#151515', 0.5), S);
      foot.position.set(0, -0.4, 0.05);
      knee.add(foot);
      this.body.add(hip);
      this.legs.push({ hip, knee });
    }
    const shorts = mesh(geo.shorts, mat(gk ? '#1a1a1a' : colors.shorts), S);
    shorts.position.y = 0.83;
    this.body.add(shorts);

    this.upper = new THREE.Group(); // tronco (inclina para frente correndo)
    this.upper.position.y = 0.9;
    this.body.add(this.upper);
    const torso = mesh(geo.torso, mat(shirt), S);
    torso.position.y = 0.25;
    this.upper.add(torso);
    const num = new THREE.Mesh(geo.number, new THREE.MeshBasicMaterial({ map: numberTexture(p.num, gk ? '#111' : colors.trim), transparent: true }));
    num.position.set(0, 0.3, -0.125);
    num.rotation.y = Math.PI;
    this.upper.add(num);
    const neck = mesh(geo.neck, mat(skin), S);
    neck.position.y = 0.57;
    this.upper.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.upper.add(this.head);
    this.head.add(mesh(geo.head, mat(skin, 0.6), S));
    const h = mesh(geo.hair, mat(hair, 0.9), false);
    h.position.y = 0.012;
    h.rotation.x = -0.25;
    this.head.add(h);

    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.27 * side, 0.5, 0);
      const ua = mesh(geo.upperArm, mat(shirt), S);
      ua.position.y = -0.15;
      sh.add(ua);
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      const fa = mesh(geo.foreArm, mat(skin), S);
      fa.position.y = -0.15;
      el.add(fa);
      const hand = mesh(geo.hand, mat(gk ? '#f4f4f4' : skin), S);
      hand.position.y = -0.31;
      el.add(hand);
      this.upper.add(sh);
      this.arms.push({ sh, el });
    }
    this.phase = Math.random() * 6;
    this.lastX = null;
    this.lastZ = null;
    this.vis = 0;
  }

  /** Posição/ângulo interpolados e animação do quadro. */
  place(x, z, facing, dt) {
    const p = this.p;
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, Math.PI / 2 - facing, 0);
    // velocidade visual a partir do deslocamento interpolado
    let v = 0;
    if (this.lastX != null && dt > 0) v = Math.hypot(x - this.lastX, z - this.lastZ) / dt;
    this.lastX = x;
    this.lastZ = z;
    this.vis += (Math.min(v, 9) - this.vis) * Math.min(1, dt * 12);
    this.animate(dt, this.vis);
    void p;
  }

  animate(dt, v) {
    const p = this.p;
    const run = Math.min(1, v / 7);
    this.phase += dt * v * 1.55;
    const s = Math.sin(this.phase);
    const tired = p.stamina < CONFIG.player.stamina.tiredBelow;
    const b = this.body, u = this.upper;
    // pose de base
    b.position.set(0, Math.abs(s) * 0.05 * run, 0);
    b.rotation.set(0, 0, 0);
    u.rotation.set(run * 0.22 + (tired ? 0.18 : 0), 0, 0);
    this.head.rotation.set(tired ? -0.15 : 0, 0, 0);
    const legA = s * 0.85 * run, armA = s * 0.7 * run;
    this.legs[0].hip.rotation.set(legA, 0, 0);
    this.legs[1].hip.rotation.set(-legA, 0, 0);
    this.legs[0].knee.rotation.set(Math.max(0, -Math.cos(this.phase)) * 1.1 * run, 0, 0);
    this.legs[1].knee.rotation.set(Math.max(0, Math.cos(this.phase)) * 1.1 * run, 0, 0);
    this.arms[0].sh.rotation.set(-armA, 0, 0.12);
    this.arms[1].sh.rotation.set(armA, 0, -0.12);
    this.arms[0].el.rotation.set(-0.5 - run * 0.6, 0, 0);
    this.arms[1].el.rotation.set(-0.5 - run * 0.6, 0, 0);

    if (tired && v < 0.6 && p.state === 'normal') {
      // ofegante: mãos nos joelhos, respiração
      const br = Math.sin(performance.now() * 0.009) * 0.04;
      u.rotation.x = 0.55 + br;
      this.arms[0].sh.rotation.set(-0.9, 0, 0.2);
      this.arms[1].sh.rotation.set(-0.9, 0, -0.2);
      this.arms[0].el.rotation.x = 0;
      this.arms[1].el.rotation.x = 0;
    }

    const kickLeg = p.def.pe === 'E' ? this.legs[1] : this.legs[0];
    switch (p.state) {
      case 'slide':
        b.position.y = -0.55;
        b.rotation.x = -1.15;
        this.legs[0].hip.rotation.x = -0.25;
        this.legs[1].hip.rotation.x = -0.05;
        this.legs[1].knee.rotation.x = 0.9;
        this.arms[0].sh.rotation.set(0.4, 0, 0.9);
        this.arms[1].sh.rotation.set(0.4, 0, -0.9);
        break;
      case 'ground':
        if (p.isGK && p.stateDir) {
          b.rotation.z = -localSide(p.stateDir, p.facing) * 1.45;
          b.position.y = 0.05;
        } else {
          b.position.y = -0.72;
          b.rotation.x = -1.45;
        }
        this.legs[0].hip.rotation.x = 0;
        this.legs[1].hip.rotation.x = 0.2;
        break;
      case 'dive': {
        const dv = p.keeper?.dive;
        const e = dv ? Math.min(1, dv.t / CONFIG.keeper.diveTime) : 1;
        const hgt = dv ? dv.y : 0.8;
        b.rotation.z = -localSide(dv?.dir || 1, p.facing) * 1.35 * e;
        b.position.y = Math.max(0, hgt - 0.9) * e + 0.15 * e;
        this.arms[0].sh.rotation.set(0, 0, 2.9);
        this.arms[1].sh.rotation.set(0, 0, -2.9);
        this.arms[0].el.rotation.x = 0;
        this.arms[1].el.rotation.x = 0;
        break;
      }
      case 'hold':
        this.arms[0].sh.rotation.set(-1.25, 0, 0.25);
        this.arms[1].sh.rotation.set(-1.25, 0, -0.25);
        this.arms[0].el.rotation.x = -0.3;
        this.arms[1].el.rotation.x = -0.3;
        break;
      case 'tackle':
        u.rotation.x = 0.35;
        kickLeg.hip.rotation.x = -1.0;
        kickLeg.knee.rotation.x = 0.1;
        break;
      case 'offbalance':
        b.rotation.z = Math.sin(performance.now() * 0.03) * 0.22;
        this.arms[0].sh.rotation.z = 1.0;
        this.arms[1].sh.rotation.z = -1.0;
        break;
    }
    if (p.kickT > 0 && p.state !== 'slide' && p.state !== 'tackle') {
      // chute: perna de trás e depois para frente
      const t = 1 - p.kickT / 0.3;
      const a = t < 0.35 ? 0.9 * (t / 0.35) : 0.9 - 2.3 * ((t - 0.35) / 0.65);
      kickLeg.hip.rotation.x = a;
      kickLeg.knee.rotation.x = t < 0.35 ? 1.2 * (t / 0.35) : 1.2 * (1 - (t - 0.35) / 0.65);
    }
    if (p.shield) {
      b.position.y -= 0.06;
      u.rotation.x = 0.3;
      this.arms[0].sh.rotation.z = 0.75;
      this.arms[1].sh.rotation.z = -0.75;
    }
  }
}
