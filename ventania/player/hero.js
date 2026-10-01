// O herói: modelo estilizado montado com primitivas, com um "esqueleto" de
// grupos (quadril → tronco → peito → pescoço → cabeça; ombro → braço →
// antebraço; coxa → canela → pé). Proporções levemente chibi (cabeça grande)
// para ler bem de longe. Cachecol longo com física verlet e planador.

import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';

const COL = {
  skin: '#f2c09a',
  hair: '#6b3524',
  tunic: '#1f6f7a',
  tunicTrim: '#e8c46a',
  pants: '#e6d6b4',
  boots: '#5b3a26',
  belt: '#7a4a2a',
  scarf: '#d9581f',
  scarfStripe: '#f2b24a',
  bag: '#9a6a3e',
  eyes: '#2a2440',
};

function mat(color, rim = 0.9, extra = {}) {
  return toonMaterial({ key: 'hero', color: new THREE.Color(color), rim, ...extra });
}

function limb(r0, r1, len, color, segs = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1);
  g.translate(0, -len / 2, 0); // pivô no topo, pendurado para baixo
  const m = new THREE.Mesh(g, mat(color));
  m.castShadow = true;
  return m;
}

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export class Hero {
  constructor() {
    this.root = new THREE.Group(); // nos pés, gira para a direção do movimento
    this.root.name = 'hero';
    this.body = joint(this.root, 0, 0, 0); // bob/inclinação
    const J = (this.j = {});

    // Quadril.
    J.hips = joint(this.body, 0, 0.92, 0);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8).scale(1.15, 0.8, 0.9), mat(COL.pants));
    pelvis.castShadow = true;
    J.hips.add(pelvis);

    // Tronco + túnica (cone que abre embaixo como uma saia curta).
    J.spine = joint(J.hips, 0, 0.06, 0);
    const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.5, 12, 2).translate(0, 0.1, 0), mat(COL.tunic));
    tunic.castShadow = true;
    J.spine.add(tunic);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.025, 6, 16).rotateX(Math.PI / 2).translate(0, -0.15, 0), mat(COL.tunicTrim, 0.6));
    J.spine.add(hem);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.248, 0.032, 6, 20).rotateX(Math.PI / 2).translate(0, 0.0, 0), mat(COL.belt));
    J.spine.add(belt);

    J.chest = joint(J.spine, 0, 0.32, 0);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10).scale(1.1, 0.95, 0.85), mat(COL.tunic));
    chest.castShadow = true;
    J.chest.add(chest);
    // Bolsa a tiracolo.
    // Alça da bolsa: faixa diagonal do ombro direito ao quadril esquerdo.
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.02, 5, 24).rotateX(Math.PI / 2).rotateZ(-0.75), mat(COL.belt));
    strap.position.set(0, -0.12, 0);
    strap.scale.set(1, 1, 0.82);
    J.chest.add(strap);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08).translate(-0.2, -0.33, 0.06), mat(COL.bag));
    bag.rotation.z = 0.15;
    bag.castShadow = true;
    J.spine.add(bag);

    // Cabeça.
    J.neck = joint(J.chest, 0, 0.17, 0);
    J.head = joint(J.neck, 0, 0.2, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14).scale(1, 1.06, 1), mat(COL.skin, 1.1));
    head.castShadow = true;
    J.head.add(head);
    // Cabelo: calota + franja + mecha atrás.
    const hairM = mat(COL.hair, 1.2);
    // Volume de trás/lados (esfera maior deslocada para trás) + calota.
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.225, 18, 14).scale(1.02, 1.0, 0.98), hairM);
    back.position.set(0, 0.03, -0.035);
    back.castShadow = true;
    J.head.add(back);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.222, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM);
    cap.position.set(0, 0.035, 0.0);
    J.head.add(cap);
    // Franja: mechas arredondadas caindo sobre a testa, assimétricas.
    const bangs = [[-0.11, 0.075, 0.15, 0.55, 0.065], [-0.045, 0.085, 0.175, 0.2, 0.07], [0.03, 0.08, 0.18, -0.15, 0.07], [0.1, 0.07, 0.155, -0.5, 0.06]];
    for (const [x, y, z, rz, r] of bangs) {
      const lock = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6).scale(0.9, 1.4, 0.6), hairM);
      lock.position.set(x, y, z);
      lock.rotation.set(-0.5, 0, rz);
      J.head.add(lock);
    }
    // Mecha rebelde no topo.
    const cow = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 5), hairM);
    cow.position.set(0.04, 0.23, 0.02);
    cow.rotation.set(-0.6, 0, -0.5);
    J.head.add(cow);
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6).translate(0, -0.15, 0), hairM);
    ponytail.position.set(0, 0.06, -0.2);
    ponytail.rotation.x = -0.5;
    J.head.add(ponytail);
    this.ponytail = ponytail;
    // Olhos (azul-noite escuro, nunca preto) + nariz.
    const eyeM = toonMaterial({ key: 'hero', color: new THREE.Color(COL.eyes), rim: 0 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6).scale(0.8, 1.3, 0.5), eyeM);
      e.position.set(s * 0.07, 0.0, 0.185);
      J.head.add(e);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), mat(COL.skin));
    nose.position.set(0, -0.045, 0.2);
    J.head.add(nose);
    const blushM = toonMaterial({ key: 'hero', color: new THREE.Color('#f08a7a'), rim: 0 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6).scale(1.2, 0.6, 0.3), blushM);
      b.position.set(s * 0.11, -0.055, 0.165);
      b.rotation.y = s * 0.5;
      J.head.add(b);
    }

    // Braços.
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const sh = joint(J.chest, s * 0.24, 0.08, 0);
      const upper = limb(0.065, 0.055, 0.28, COL.tunic);
      sh.add(upper);
      const el = joint(sh, 0, -0.28, 0);
      const fore = limb(0.05, 0.045, 0.25, COL.skin);
      el.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.06, 8), mat(COL.tunicTrim, 0.5));
      cuff.position.y = -0.03;
      el.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), mat(COL.skin));
      hand.position.y = -0.27;
      hand.castShadow = true;
      el.add(hand);
      J['shoulder' + side] = sh;
      J['elbow' + side] = el;
      J['hand' + side] = hand;
    }

    // Pernas.
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const hip = joint(J.hips, s * 0.1, -0.04, 0);
      const thigh = limb(0.085, 0.07, 0.42, COL.pants);
      hip.add(thigh);
      const knee = joint(hip, 0, -0.42, 0);
      const shin = limb(0.07, 0.065, 0.38, COL.boots);
      knee.add(shin);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.075, 0.08, 8), mat(COL.boots));
      cuff.position.y = -0.04;
      knee.add(cuff);
      const ankle = joint(knee, 0, -0.38, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22).translate(0, -0.03, 0.05), mat(COL.boots));
      foot.castShadow = true;
      ankle.add(foot);
      J['hip' + side] = hip;
      J['knee' + side] = knee;
      J['ankle' + side] = ankle;
    }

    // Laço do cachecol no pescoço.
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.06, 8, 16).rotateX(Math.PI / 2), mat(COL.scarf, 1.2));
    wrap.position.y = 0.1;
    wrap.scale.set(1.05, 1, 1);
    wrap.castShadow = true;
    J.chest.add(wrap);
    this.scarfAnchor = joint(J.chest, 0.05, 0.08, -0.15);

    this.glider = this._makeGlider();
    J.chest.add(this.glider);
    this.glider.visible = false;

    this.scarf = new Scarf(this);
  }

  _makeGlider() {
    const g = new THREE.Group();
    g.position.set(0, 0.95, 0.05);
    // Asa: forma de folha/arraia em tecido, com nervuras de madeira.
    const shape = new THREE.Shape();
    shape.moveTo(-1.45, 0);
    shape.quadraticCurveTo(-0.9, 0.55, 0, 0.62);
    shape.quadraticCurveTo(0.9, 0.55, 1.45, 0);
    shape.quadraticCurveTo(0.7, -0.15, 0.25, -0.35);
    shape.lineTo(0, -0.18);
    shape.lineTo(-0.25, -0.35);
    shape.quadraticCurveTo(-0.7, -0.15, -1.45, 0);
    const geo = new THREE.ShapeGeometry(shape, 12);
    geo.rotateX(Math.PI / 2 - 0.12); // borda redonda para a frente (+Z)
    // Curvatura de "vela".
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setY(i, p.getY(i) - x * x * 0.12);
    }
    geo.computeVertexNormals();
    const tex = gliderTexture();
    const sail = new THREE.Mesh(geo, toonMaterial({ key: 'glider', map: tex, side: THREE.DoubleSide, rim: 1.2 }));
    sail.castShadow = true;
    g.add(sail);
    const wood = mat('#8a5a34', 0.5);
    const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.8, 5).rotateZ(Math.PI / 2), wood);
    spar.position.set(0, -0.12, 0.0);
    g.add(spar);
    const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 5).rotateX(Math.PI / 2), wood);
    keel.position.set(0, -0.06, -0.12);
    g.add(keel);
    // Barra onde as mãos seguram.
    for (const s of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), wood);
      rod.position.set(s * 0.32, -0.45, 0.05);
      rod.rotation.z = s * 0.35;
      g.add(rod);
    }
    return g;
  }

  /** Posição mundial onde o cachecol nasce. */
  scarfOrigin(out) {
    return this.scarfAnchor.getWorldPosition(out);
  }
}

function gliderTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2e6cc';
  g.fillRect(0, 0, S, S);
  // Faixas e um padrão original de "pena/folha".
  g.fillStyle = '#d9581f';
  g.fillRect(0, S * 0.12, S, S * 0.07);
  g.fillStyle = '#1f6f7a';
  g.fillRect(0, S * 0.22, S, S * 0.03);
  g.strokeStyle = '#c9842e';
  g.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const x = S * (0.14 + i * 0.12);
    g.beginPath();
    g.moveTo(x, S * 0.3);
    g.quadraticCurveTo(x + 10, S * 0.6, x - 6, S * 0.95);
    g.stroke();
  }
  g.fillStyle = '#1f6f7a';
  g.beginPath();
  g.arc(S / 2, S * 0.55, 18, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Cachecol: corrente verlet presa nas costas do pescoço, renderizada como
 * uma fita (2 vértices por nó). Gravidade + vento + arrasto do movimento;
 * colisão simples com o corpo (esferas do tronco).
 */
class Scarf {
  constructor(hero) {
    this.hero = hero;
    this.N = 11;
    this.seg = 0.11;
    this.pts = [];
    this.prev = [];
    for (let i = 0; i < this.N; i++) {
      this.pts.push(new THREE.Vector3(0, 1.5 - i * this.seg, -0.2));
      this.prev.push(this.pts[i].clone());
    }
    const verts = new Float32Array(this.N * 2 * 3);
    const uvs = new Float32Array(this.N * 2 * 2);
    const idx = [];
    for (let i = 0; i < this.N; i++) {
      uvs.set([0, i / (this.N - 1), 1, i / (this.N - 1)], i * 4);
      if (i < this.N - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    this.geo = g;
    const tex = scarfTexture();
    this.mesh = new THREE.Mesh(g, toonMaterial({ key: 'scarf', map: tex, side: THREE.DoubleSide, rim: 1.3 }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.initialized = false;
    this._a = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._inv = new THREE.Matrix4();
  }

  reset() { this.initialized = false; }

  update(dt, wind, speedVec) {
    const anchor = this.hero.scarfOrigin(this._a);
    if (!this.initialized) {
      for (let i = 0; i < this.N; i++) {
        this.pts[i].set(anchor.x, anchor.y - i * this.seg, anchor.z);
        this.prev[i].copy(this.pts[i]);
      }
      this.initialized = true;
    }
    dt = Math.min(dt, 1 / 30);
    const g = -9.8 * dt * dt;
    const t = performance.now() * 0.001;
    const chest = this.hero.j.chest.getWorldPosition(new THREE.Vector3());
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.hero.root.quaternion);
    const chestM = this.hero.j.chest.matrixWorld;
    const chestInv = this._inv.copy(chestM).invert();
    const hips = this.hero.j.hips.getWorldPosition(new THREE.Vector3());
    for (let i = 1; i < this.N; i++) {
      const p = this.pts[i], q = this.prev[i];
      const vx = (p.x - q.x) * 0.965, vy = (p.y - q.y) * 0.965, vz = (p.z - q.z) * 0.965;
      q.copy(p);
      const k = i / this.N;
      // Vento com rajadas + leve tremulação.
      const gust = 0.6 + 0.4 * Math.sin(t * 1.7 + i * 0.6) + 0.25 * Math.sin(t * 7.3 + i * 1.9);
      // Vento + arrasto do movimento + leve tendência a cair pelas costas.
      const wx = (wind.x * 0.8 - speedVec.x * 0.9) * gust - back.x * 0.8;
      const wz = (wind.y * 0.8 - speedVec.z * 0.9) * gust - back.z * 0.8;
      p.x += vx + wx * dt * dt * 6 * k;
      p.y += vy + g + Math.sin(t * 5 + i) * 0.0006 * k - speedVec.y * dt * dt * 2;
      p.z += vz + wz * dt * dt * 6 * k;
    }
    this.pts[0].copy(anchor);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < this.N - 1; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        this._t.subVectors(b, a);
        const d = this._t.length() || 1e-6;
        const diff = (d - this.seg) / d;
        if (i === 0) b.addScaledVector(this._t, -diff);
        else {
          a.addScaledVector(this._t, diff * 0.5);
          b.addScaledVector(this._t, -diff * 0.5);
        }
      }
      // Fica atrás do tronco (no espaço do peito): nunca cruza o peito.
      for (let i = 1; i < this.N; i++) {
        const lp = this._t.copy(this.pts[i]).applyMatrix4(chestInv);
        if (lp.y > -0.8 && lp.y < 0.3 && lp.z > -0.21 && Math.abs(lp.x) < 0.34) {
          lp.z = -0.21;
          this.pts[i].copy(lp.applyMatrix4(chestM));
        }
      }
      // Colisão com o corpo.
      for (let i = 1; i < this.N; i++) {
        for (const [c, r] of [[chest, 0.27], [hips, 0.3]]) {
          this._t.subVectors(this.pts[i], c);
          const d = this._t.length();
          if (d < r) this.pts[i].addScaledVector(this._t, (r - d) / (d || 1));
        }
      }
    }
    // Fita: largura perpendicular ao segmento e à "frente" do herói.
    const pos = this.geo.attributes.position;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.hero.root.quaternion);
    const side = new THREE.Vector3();
    for (let i = 0; i < this.N; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.N - 1, i + 1)];
      this._t.subVectors(b, a).normalize();
      side.crossVectors(this._t, fwd).normalize();
      if (side.lengthSq() < 0.1) side.set(1, 0, 0);
      const w = 0.085 * (1 - 0.15 * (i / this.N));
      const p = this.pts[i];
      pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

function scarfTexture() {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = COL.scarf;
  g.fillRect(0, 0, 16, 128);
  g.fillStyle = COL.scarfStripe;
  for (const y of [100, 112]) g.fillRect(0, y, 16, 5);
  // Franja na ponta.
  g.fillStyle = '#b8461a';
  g.fillRect(0, 122, 16, 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
