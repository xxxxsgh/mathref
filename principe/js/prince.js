// Personagens bípedes montados com primitivas: o pequeno príncipe (com o
// cachecol dourado simulado) e os adultos dos asteroides.
import * as THREE from 'three';
import { mesh, flat, toon, PAL, starGeom, blob } from './style.js';

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const EYE = new THREE.SphereGeometry(1, 10, 8);

function approach(obj, key, target, k) { obj[key] += (target - obj[key]) * k; }

export class Biped {
  constructor(spec = {}) {
    const s = this.spec = Object.assign({
      coat: PAL.coat, legs: PAL.coatDark, skin: PAL.skin, boots: PAL.boot, sleeves: null,
      headR: 0.28, bodyTop: 0.17, bodyBot: 0.3, bodyH: 0.55, robe: false, scale: 1,
      legLen: 0.48, shadow: 0.38,
    }, spec);
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.scale.setScalar(s.scale);
    this.root.add(this.inner);
    this.body = new THREE.Group();
    this.inner.add(this.body);
    this.inner.add(blob(s.shadow));
    this.pose = 'walk';
    this.phase = 0;
    this.t = Math.random() * 10;
    this.fall = 0;

    const hipY = this.hipY = s.robe ? 0.26 : s.legLen;
    this.legs = [-1, 1].map((sd) => {
      const p = new THREE.Group();
      p.position.set(sd * 0.09, hipY, 0);
      const leg = mesh(new THREE.CylinderGeometry(0.075, 0.065, hipY - 0.02, 8), s.legs, { outline: 0.02 });
      leg.position.y = -(hipY - 0.02) / 2;
      const boot = mesh(new THREE.SphereGeometry(0.085, 10, 8), s.boots, { outline: 0.02 });
      boot.scale.set(1, 0.7, 1.4);
      boot.position.set(0, -hipY + 0.05, 0.03);
      p.add(leg, boot);
      this.body.add(p);
      return p;
    });

    if (s.robe) {
      const h = hipY + s.bodyH;
      const torso = mesh(new THREE.CylinderGeometry(s.bodyTop, s.bodyBot * 1.25, h, 18), s.coat);
      torso.position.y = h / 2 + 0.04;
      this.body.add(torso);
      this.torso = torso;
    } else {
      const torso = mesh(new THREE.CylinderGeometry(s.bodyTop, s.bodyBot, s.bodyH, 16), s.coat);
      torso.position.y = hipY + s.bodyH / 2 - 0.08;
      this.body.add(torso);
      this.torso = torso;
    }
    const shoulderY = this.shoulderY = hipY + s.bodyH - 0.12;
    this.arms = [-1, 1].map((sd) => {
      const p = new THREE.Group();
      p.position.set(sd * (s.bodyTop + 0.05), shoulderY, 0);
      const arm = mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 8), s.sleeves ?? s.coat, { outline: 0.02 });
      arm.position.y = -0.18;
      const hand = mesh(new THREE.SphereGeometry(0.062, 10, 8), s.skin, { outline: 0.018 });
      hand.position.y = -0.37;
      p.add(arm, hand);
      p.rotation.z = sd * 0.12;
      p.userData.hand = hand;
      this.body.add(p);
      return p;
    });

    const neckY = this.neckY = hipY + s.bodyH - 0.06;
    const head = this.head = new THREE.Group();
    head.position.y = neckY + s.headR * 0.92;
    const skull = mesh(new THREE.SphereGeometry(s.headR, 20, 16), s.skin, { outline: 0.025 });
    head.add(skull);
    const r = s.headR;
    for (const sd of [-1, 1]) {
      const eye = flat(EYE, PAL.ink);
      eye.scale.set(r * 0.085, r * 0.12, r * 0.06);
      eye.position.set(sd * r * 0.34, r * 0.1, r * 0.92);
      head.add(eye);
      const cheek = flat(EYE, PAL.cheek, { transparent: true, opacity: 0.7 });
      cheek.scale.set(r * 0.16, r * 0.09, r * 0.05);
      cheek.position.set(sd * r * 0.55, -r * 0.18, r * 0.8);
      head.add(cheek);
    }
    const nose = mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), s.nose ?? s.skin, { outline: 0.012 });
    nose.position.set(0, -r * 0.05, r * 0.98);
    head.add(nose);
    this.body.add(head);

    this.height = (head.position.y + r) * s.scale;
    if (s.decorate) s.decorate(this);
  }

  /** Posiciona o boneco sobre a superfície: `up` é a normal, `fwd` a direção do olhar. */
  setPose(pos, up, fwd) {
    _z.copy(fwd).addScaledVector(up, -fwd.dot(up));
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(up, -up.z);
    _z.normalize();
    _x.crossVectors(up, _z);
    _m.makeBasis(_x, up, _z);
    this.root.quaternion.setFromRotationMatrix(_m);
    this.root.position.copy(pos);
  }

  /** amt: 0..1 intensidade da caminhada. */
  animate(dt, amt = 0, air = false) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 12);
    if (amt > 0.03) this.phase += dt * (5 + 6 * amt);
    else this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * k;
    const sw = Math.sin(this.phase) * 0.75 * Math.min(1, amt * 1.4);
    const [L, R] = this.legs, [AL, AR] = this.arms;
    const breathe = Math.sin(this.t * 2.2) * 0.012;
    let legL = sw, legR = -sw, armL = -sw * 0.8, armR = sw * 0.8, armZL = -0.12, armZR = 0.12;
    let bodyY = Math.abs(Math.cos(this.phase)) * 0.05 * amt + breathe, headX = 0, headY = 0, bodyX = 0;
    if (air) { legL = -0.6; legR = 0.25; armL = -1.2; armR = -1.0; armZL = -0.5; armZR = 0.5; }

    switch (this.pose) {
      case 'sit': legL = legR = -1.45; bodyY = -this.hipY + 0.14; armL = armR = -0.5; break;
      case 'cry': legL = legR = -1.45; bodyY = -this.hipY + 0.14; armL = armR = -2.1; armZL = 0.35; armZR = -0.35; headX = 0.45 + Math.sin(this.t * 7) * 0.03; break;
      case 'hang': armL = armR = -2.95; armZL = -0.15; armZR = 0.15; legL = Math.sin(this.t * 2) * 0.25; legR = Math.sin(this.t * 2 + 1.3) * 0.25; bodyY = 0; break;
      case 'raise': armL = armR = -2.7; armZL = -0.5; armZR = 0.5; break;
      case 'wave': armR = -2.6; armZR = 0.4 + Math.sin(this.t * 9) * 0.35; break;
      case 'reach': armR = -1.35; armZR = 0.05; break;
      case 'pull': armL = armR = -1.8 + Math.sin(this.t * 6) * 0.5; armZL = 0.25; armZR = -0.25; break;
      case 'clap': { const c = Math.max(0, Math.sin(this.t * 14)); armL = armR = -1.3; armZL = 0.25 + c * 0.35; armZR = -0.25 - c * 0.35; break; }
      case 'bow': bodyX = 0.5; headX = 0.3; armL = armR = 0.2; break;
      case 'lookup': headX = -0.55; break;
      case 'think': armR = -2.2; armZR = -0.6; headY = 0.2; headX = -0.15; break;
      case 'shout': armL = armR = -2.0; armZL = 0.9; armZR = -0.9; headX = -0.35; break;
      case 'drink': armL = armR = -2.3; armZL = 0.55; armZR = -0.55; headX = -0.4; break;
      case 'lie': legL = legR = 0; break;
    }
    approach(L.rotation, 'x', legL, k); approach(R.rotation, 'x', legR, k);
    approach(AL.rotation, 'x', armL, k); approach(AR.rotation, 'x', armR, k);
    approach(AL.rotation, 'z', armZL, k); approach(AR.rotation, 'z', armZR, k);
    approach(this.body.position, 'y', bodyY, k);
    approach(this.body.rotation, 'x', bodyX, k);
    approach(this.head.rotation, 'x', headX, k);
    approach(this.head.rotation, 'y', headY, k);
    // queda lenta ("como cai uma árvore")
    const fallTarget = this.pose === 'lie' ? Math.PI / 2 - 0.08 : 0;
    this.fall += (fallTarget - this.fall) * (1 - Math.exp(-dt * (this.pose === 'lie' ? 1.1 : 6)));
    this.inner.rotation.z = this.fall;
    this.inner.position.y = Math.sin(this.fall) * 0.12 * this.spec.scale;
  }

  handWorld(side = 1, out = new THREE.Vector3()) {
    return this.arms[side > 0 ? 1 : 0].userData.hand.getWorldPosition(out);
  }
}

// ─── o pequeno príncipe ───
const SCARF_N = 11, SCARF_SEG = 0.09;

export class Prince extends Biped {
  constructor() {
    super({
      coat: PAL.coat, legs: PAL.coatDark, headR: 0.3, bodyTop: 0.16, bodyBot: 0.29, bodyH: 0.52, legLen: 0.44,
      decorate: (b) => {
        const r = b.spec.headR;
        // cabelo em mechas pontudas, cor de trigo
        const hairMat = { outline: 0.018 };
        const cap = mesh(new THREE.SphereGeometry(r * 1.04, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), PAL.hair, hairMat);
        cap.position.y = r * 0.06;
        cap.rotation.x = -0.25;
        b.head.add(cap);
        const tuft = new THREE.ConeGeometry(0.075, 0.26, 6);
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < 13; i++) {
          const a = (i / 13) * Math.PI * 2;
          const lat = 0.55 + (i % 3) * 0.22;
          const dir = new THREE.Vector3(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat) - 0.35).normalize();
          if (dir.z > 0.55 && dir.y < 0.75) continue; // deixa a franja livre para o rosto
          const c = mesh(tuft, PAL.hair, hairMat);
          c.position.copy(dir).multiplyScalar(r * 0.98);
          c.quaternion.setFromUnitVectors(up, dir);
          c.rotateX(0.35);
          b.head.add(c);
        }
        // cinto dourado e dragonas em forma de estrela
        const belt = mesh(new THREE.CylinderGeometry(0.235, 0.245, 0.05, 16), PAL.gold, { outline: 0.012 });
        belt.position.y = b.hipY + 0.1;
        b.body.add(belt);
        const sg = starGeom(0.07, 0.032, 0.03);
        for (const sd of [-1, 1]) {
          const st = mesh(sg, PAL.gold, { outline: 0.01 });
          st.position.set(sd * 0.17, b.shoulderY + 0.07, 0);
          st.rotation.x = -Math.PI / 2;
          b.body.add(st);
        }
        // gola do cachecol
        const ring = mesh(new THREE.TorusGeometry(0.13, 0.055, 8, 16), PAL.gold, { outline: 0.015 });
        ring.rotation.x = Math.PI / 2;
        ring.position.y = b.neckY + 0.02;
        b.body.add(ring);
      },
    });
    // cachecol: fita simulada (verlet) em coordenadas de mundo
    this.sp = []; this.spPrev = [];
    for (let i = 0; i < SCARF_N; i++) { this.sp.push(new THREE.Vector3()); this.spPrev.push(new THREE.Vector3()); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SCARF_N * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < SCARF_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.ribbon = new THREE.Mesh(g, toon(PAL.gold, { side: THREE.DoubleSide }));
    this.ribbon.frustumCulled = false;
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SCARF_N * 2 * 3), 3));
    const eidx = [];
    for (let i = 0; i < SCARF_N - 1; i++) eidx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    eidx.push((SCARF_N - 1) * 2, (SCARF_N - 1) * 2 + 1);
    eg.setIndex(eidx);
    this.ribbonEdge = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: PAL.ink }));
    this.ribbonEdge.frustumCulled = false;
    this.ribbon.add(this.ribbonEdge);
    this.scarfReady = false;
    this.wind = new THREE.Vector3();
    this.gravity = new THREE.Vector3(0, -1, 0);
  }

  addTo(scene) { scene.add(this.root, this.ribbon); }
  set visible(v) { this.root.visible = v; this.ribbon.visible = v; }
  get visible() { return this.root.visible; }

  resetScarf() { this.scarfReady = false; }

  updateScarf(dt, up) {
    dt = Math.min(dt, 1 / 30);
    this.root.updateMatrixWorld(true);
    const anchor = _v.set(0, this.neckY + 0.02, -0.15);
    this.body.localToWorld(anchor);
    const back = _w.set(0, 0, -1).transformDirection(this.root.matrixWorld);
    if (!this.scarfReady || this.sp[0].distanceTo(anchor) > 2) {
      for (let i = 0; i < SCARF_N; i++) {
        this.sp[i].copy(anchor).addScaledVector(back, i * SCARF_SEG).addScaledVector(up, -i * 0.03);
        this.spPrev[i].copy(this.sp[i]);
      }
      this.scarfReady = true;
    }
    this.sp[0].copy(anchor);
    this.spPrev[0].copy(anchor);
    const t = this.t;
    const side = _x.set(1, 0, 0).transformDirection(this.root.matrixWorld);
    for (let i = 1; i < SCARF_N; i++) {
      const p = this.sp[i], q = this.spPrev[i];
      const vx = (p.x - q.x) * 0.94, vy = (p.y - q.y) * 0.94, vz = (p.z - q.z) * 0.94;
      q.copy(p);
      const fl = Math.sin(t * 8 + i * 0.8) * 1.4 * (i / SCARF_N);
      // brisa constante: o cachecol flutua para trás e um pouco para o lado
      const ax = -up.x * 1.1 + this.wind.x + side.x * (fl + 0.9) + back.x * 3.2;
      const ay = -up.y * 1.1 + this.wind.y + side.y * (fl + 0.9) + back.y * 3.2;
      const az = -up.z * 1.1 + this.wind.z + side.z * (fl + 0.9) + back.z * 3.2;
      p.x += vx + ax * dt * dt; p.y += vy + ay * dt * dt; p.z += vz + az * dt * dt;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < SCARF_N; i++) {
        const a = this.sp[i - 1], b = this.sp[i];
        _z.subVectors(b, a);
        const len = _z.length() || 1e-5;
        b.copy(a).addScaledVector(_z, SCARF_SEG / len);
      }
    }
    const pos = this.ribbon.geometry.attributes.position.array;
    const epos = this.ribbonEdge.geometry.attributes.position.array;
    for (let i = 0; i < SCARF_N; i++) {
      const w = 0.075 * (1 - (i / SCARF_N) * 0.35);
      const p = this.sp[i];
      pos[i * 6] = p.x - side.x * w; pos[i * 6 + 1] = p.y - side.y * w; pos[i * 6 + 2] = p.z - side.z * w;
      pos[i * 6 + 3] = p.x + side.x * w; pos[i * 6 + 4] = p.y + side.y * w; pos[i * 6 + 5] = p.z + side.z * w;
    }
    epos.set(pos);
    this.ribbon.geometry.attributes.position.needsUpdate = true;
    this.ribbon.geometry.computeVertexNormals();
    this.ribbonEdge.geometry.attributes.position.needsUpdate = true;
  }
}

// ─── adultos e outros bípedes ───
export function makePerson(o = {}) {
  const b = new Biped({
    robe: o.robe ?? true, coat: o.coat ?? 0x7a86b8, legs: o.legs ?? 0x3d3a55, sleeves: o.sleeves,
    skin: o.skin ?? 0xf6d2b4, headR: o.headR ?? 0.27, bodyTop: o.bodyTop ?? 0.2, bodyBot: o.bodyBot ?? 0.34,
    bodyH: o.bodyH ?? 0.62, scale: o.scale ?? 1.35, nose: o.nose, shadow: o.shadow ?? 0.45,
    decorate: (b) => {
      const r = b.spec.headR;
      if (o.hair) {
        const h = mesh(new THREE.SphereGeometry(r * 1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), o.hair, { outline: 0.015 });
        h.rotation.x = -0.35; h.position.y = r * 0.02;
        b.head.add(h);
      }
      if (o.beard) {
        const bd = mesh(new THREE.ConeGeometry(r * 0.75, r * (o.beardLen ?? 1.6), 12), o.beard, { outline: 0.015 });
        bd.rotation.x = Math.PI;
        bd.position.set(0, -r * 0.85, r * 0.45);
        b.head.add(bd);
        const mus = mesh(new THREE.CapsuleGeometry(r * 0.12, r * 0.6, 4, 8), o.beard, { outline: 0.01 });
        mus.rotation.z = Math.PI / 2;
        mus.position.set(0, -r * 0.28, r * 0.9);
        b.head.add(mus);
      }
      if (o.glasses) {
        for (const sd of [-1, 1]) {
          const g = mesh(new THREE.TorusGeometry(r * 0.17, r * 0.03, 6, 14), PAL.ink, { outline: 0 });
          g.position.set(sd * r * 0.34, r * 0.1, r * 0.97);
          b.head.add(g);
        }
      }
      const hat = o.hat;
      if (hat === 'crown') {
        const c = mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.7, r * 0.5, 10, 1, true), PAL.gold, { outline: 0.015, side: THREE.DoubleSide });
        c.position.y = r * 0.95;
        b.head.add(c);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const sp = mesh(new THREE.ConeGeometry(r * 0.13, r * 0.4, 5), PAL.gold, { outline: 0.01 });
          sp.position.set(Math.sin(a) * r * 0.72, r * 1.35, Math.cos(a) * r * 0.72);
          b.head.add(sp);
        }
        b.hat = c;
      } else if (hat === 'top') {
        const g = new THREE.Group();
        const brim = mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, r * 0.08, 20), o.hatColor ?? 0x5b3f78, { outline: 0.015 });
        const top = mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.8, r * 1.4, 18), o.hatColor ?? 0x5b3f78, { outline: 0.015 });
        top.position.y = r * 0.72;
        const band = mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, r * 0.2, 18), PAL.gold, { outline: 0 });
        band.position.y = r * 0.18;
        const feather = mesh(new THREE.SphereGeometry(r * 0.3, 10, 8), o.feather ?? 0xe86aa6, { outline: 0.012 });
        feather.scale.set(0.45, 1.9, 0.6);
        feather.position.set(r * 0.72, r * 0.95, 0);
        feather.rotation.z = -0.35;
        g.add(brim, top, band, feather);
        g.position.y = r * 0.8;
        b.head.add(g);
        b.hat = g;
      } else if (hat === 'cap') {
        const c = mesh(new THREE.SphereGeometry(r * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), o.hatColor ?? 0x3f5b8a, { outline: 0.015 });
        c.position.y = r * 0.05;
        const visor = mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, r * 0.06, 14, 1, false, -Math.PI / 2, Math.PI), o.hatColor ?? 0x3f5b8a, { outline: 0.01 });
        visor.position.set(0, r * 0.1, r * 0.75);
        b.head.add(c, visor);
        if (o.goggles) {
          for (const sd of [-1, 1]) {
            const gg = mesh(new THREE.TorusGeometry(r * 0.2, r * 0.07, 6, 12), 0x8a6a3a, { outline: 0.01 });
            gg.position.set(sd * r * 0.33, r * 0.55, r * 0.78);
            gg.rotation.x = -0.6;
            b.head.add(gg);
          }
        }
      } else if (hat === 'beret') {
        const c = mesh(new THREE.SphereGeometry(r * 1.1, 16, 8), o.hatColor ?? 0x6b3d5a, { outline: 0.015 });
        c.scale.set(1, 0.35, 1);
        c.position.set(r * 0.15, r * 0.85, -r * 0.05);
        b.head.add(c);
      }
      if (o.trim) {
        const t = mesh(new THREE.TorusGeometry(b.spec.bodyBot * 1.25, 0.06, 8, 24), o.trim, { outline: 0.012 });
        t.rotation.x = Math.PI / 2;
        t.position.y = 0.08;
        b.body.add(t);
        const c = mesh(new THREE.TorusGeometry(b.spec.bodyTop + 0.02, 0.07, 8, 20), o.trim, { outline: 0.012 });
        c.rotation.x = Math.PI / 2;
        c.position.y = b.neckY;
        b.body.add(c);
      }
      if (o.decorate) o.decorate(b);
    },
  });
  return b;
}
