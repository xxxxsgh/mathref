// Objetos de cena: tudo modelado com primitivas, no mesmo traço de tinta.
import * as THREE from 'three';
import { mesh, flat, toon, PAL, starGeom, blob, rng, glow as glowSprite } from './style.js';

const G = THREE;

export function rose() {
  const g = new G.Group();
  const stem = mesh(new G.CylinderGeometry(0.022, 0.028, 0.55, 6), PAL.stem, { outline: 0.012 });
  stem.position.y = 0.275;
  g.add(stem);
  for (const [y, sd] of [[0.2, 1], [0.32, -1]]) {
    const lf = mesh(new G.SphereGeometry(0.07, 8, 6), PAL.leaf, { outline: 0.012 });
    lf.scale.set(1.6, 0.35, 0.8);
    lf.position.set(sd * 0.08, y, 0);
    lf.rotation.z = sd * 0.5;
    g.add(lf);
  }
  for (let i = 0; i < 4; i++) {
    const th = mesh(new G.ConeGeometry(0.018, 0.07, 5), 0x8a5a3a, { outline: 0.006 });
    const a = i * 1.7;
    th.position.set(Math.cos(a) * 0.025, 0.1 + i * 0.1, Math.sin(a) * 0.025);
    th.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4);
    g.add(th);
  }
  const bloom = new G.Group();
  bloom.position.y = 0.58;
  const core = mesh(new G.SphereGeometry(0.075, 12, 10), PAL.rose, { outline: 0.015 });
  core.scale.y = 1.2;
  bloom.add(core);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p = mesh(new G.SphereGeometry(0.075, 10, 8), i % 2 ? PAL.rose : 0xf0677a, { outline: 0.012 });
    p.scale.set(0.9, 1.3, 0.45);
    p.position.set(Math.cos(a) * 0.07, 0.01, Math.sin(a) * 0.07);
    p.rotation.y = -a + Math.PI / 2;
    p.rotation.x = 0.35;
    bloom.add(p);
  }
  g.add(bloom);
  g.userData.bloom = bloom;
  g.scale.setScalar(1.6);
  return g;
}

export function glassGlobe() {
  const g = new G.Group();
  const m = new G.Mesh(new G.SphereGeometry(0.62, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new G.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.2, depthWrite: false, side: G.DoubleSide }));
  m.position.y = 0.36;
  const rim = mesh(new G.TorusGeometry(0.62, 0.02, 6, 32), 0xdfefff, { outline: 0.01 });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.06;
  const knob = mesh(new G.SphereGeometry(0.06, 8, 6), 0xdfefff, { outline: 0.01 });
  knob.position.y = 1.0;
  const shine = flat(new G.PlaneGeometry(0.06, 0.35), 0xffffff, { transparent: true, opacity: 0.6, side: G.DoubleSide });
  shine.position.set(-0.32, 0.65, 0.4);
  shine.rotation.z = 0.5;
  g.add(m, rim, knob, shine);
  return g;
}

export function folding() {
  // biombo de três painéis
  const g = new G.Group();
  for (let i = -1; i <= 1; i++) {
    const p = mesh(new G.BoxGeometry(0.4, 0.8, 0.04), 0xf1e2c4, { outline: 0.012 });
    p.position.set(i * 0.38, 0.45, i === 0 ? 0 : 0.1);
    p.rotation.y = i * 0.5;
    const fr = mesh(new G.BoxGeometry(0.44, 0.05, 0.06), PAL.wood, { outline: 0.008 });
    fr.position.y = 0.4;
    p.add(fr);
    const art = flat(new G.CircleGeometry(0.1, 12), 0xe38aa0);
    art.position.set(0, 0.1, 0.025);
    p.add(art);
    g.add(p);
  }
  return g;
}

export function volcano(active = true) {
  const g = new G.Group();
  const cone = mesh(new G.CylinderGeometry(0.24, 0.62, 0.6, 12), active ? 0x8a6f7a : 0x7a7688);
  cone.position.y = 0.3;
  const crater = flat(new G.CircleGeometry(0.22, 14), active ? PAL.lava : 0x4a4058);
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = 0.605;
  g.add(cone, crater);
  const smoke = new G.Group();
  g.add(smoke);
  const puffs = [];
  const smokeMat = toon(0x9d94ad, { transparent: true, opacity: 0.85 }, true);
  for (let i = 0; i < 5; i++) {
    const p = mesh(new G.SphereGeometry(0.12, 8, 6), 0, { mat: smokeMat, outline: 0.012 });
    p.userData.t = i / 5;
    smoke.add(p);
    puffs.push(p);
  }
  g.userData = {
    active, clean: !active, crater, puffs, smokeMat,
    update(dt) {
      const d = g.userData;
      for (const p of puffs) {
        p.userData.t = (p.userData.t + dt * (d.clean ? 0.15 : 0.4)) % 1;
        const t = p.userData.t;
        p.position.set(Math.sin(t * 6 + p.id) * 0.08, 0.65 + t * (d.clean ? 0.5 : 1.3), 0);
        p.scale.setScalar((d.clean ? 0.4 : 0.6) + t * (d.clean ? 0.5 : 1.3));
        p.visible = d.active;
      }
      smokeMat.opacity = d.clean ? 0.45 : 0.85;
      smokeMat.color.set(d.clean ? 0xcfc6de : 0x7d7390);
    },
  };
  return g;
}

export function sprout() {
  const g = new G.Group();
  const s = mesh(new G.CylinderGeometry(0.03, 0.05, 0.3, 6), 0x6f9a4a, { outline: 0.012 });
  s.position.y = 0.15;
  g.add(s);
  for (const sd of [-1, 1]) {
    const lf = mesh(new G.SphereGeometry(0.08, 8, 6), 0x7fb35a, { outline: 0.012 });
    lf.scale.set(1.7, 0.35, 0.9);
    lf.position.set(sd * 0.11, 0.3, 0);
    lf.rotation.z = sd * 0.5;
    g.add(lf);
  }
  g.add(blob(0.18));
  return g;
}

export function baobab(scale = 1) {
  const g = new G.Group();
  const trunk = mesh(new G.CylinderGeometry(0.35, 0.6, 1.8, 10), 0x9a7a62);
  trunk.position.y = 0.9;
  g.add(trunk);
  const r = rng(7);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const br = mesh(new G.CylinderGeometry(0.06, 0.14, 0.9, 6), 0x9a7a62, { outline: 0.02 });
    br.position.set(Math.cos(a) * 0.35, 2.0, Math.sin(a) * 0.35);
    br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    g.add(br);
    const fol = mesh(new G.SphereGeometry(0.4 + r() * 0.2, 10, 8), 0x5f8f55);
    fol.position.set(Math.cos(a) * 0.8, 2.4 + r() * 0.2, Math.sin(a) * 0.8);
    g.add(fol);
  }
  g.scale.setScalar(scale);
  return g;
}

export function wateringCan() {
  const g = new G.Group();
  const body = mesh(new G.CylinderGeometry(0.14, 0.16, 0.26, 12), 0x6f9fc8, { outline: 0.015 });
  body.position.y = 0.13;
  const spout = mesh(new G.CylinderGeometry(0.025, 0.035, 0.34, 6), 0x6f9fc8, { outline: 0.01 });
  spout.position.set(0, 0.2, 0.2);
  spout.rotation.x = 1.0;
  const handle = mesh(new G.TorusGeometry(0.1, 0.018, 6, 12, Math.PI), 0x4f7fa8, { outline: 0.008 });
  handle.position.set(0, 0.26, -0.02);
  handle.rotation.y = Math.PI / 2;
  g.add(body, spout, handle);
  return g;
}

export function chair() {
  const g = new G.Group();
  const seat = mesh(new G.BoxGeometry(0.42, 0.05, 0.4), PAL.wood, { outline: 0.012 });
  seat.position.y = 0.32;
  g.add(seat);
  for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) {
    const l = mesh(new G.CylinderGeometry(0.025, 0.025, 0.32, 5), PAL.wood, { outline: 0.008 });
    l.position.set(x, 0.16, z);
    g.add(l);
  }
  const back = mesh(new G.BoxGeometry(0.42, 0.4, 0.04), PAL.wood, { outline: 0.012 });
  back.position.set(0, 0.54, -0.19);
  g.add(back);
  return g;
}

export function rake() {
  const g = new G.Group();
  const h = mesh(new G.CylinderGeometry(0.02, 0.02, 0.9, 5), PAL.wood, { outline: 0.008 });
  h.position.y = 0.45;
  const head = mesh(new G.BoxGeometry(0.28, 0.04, 0.04), 0x8a8a9a, { outline: 0.008 });
  head.position.y = 0.9;
  g.add(h, head);
  g.rotation.z = 0.35;
  return g;
}

export function rock(s = 1, color = PAL.rock) {
  const m = mesh(new G.DodecahedronGeometry(0.3 * s, 0), color, { outline: 0.02 });
  m.scale.set(1, 0.6, 0.9);
  m.position.y = 0.08 * s;
  m.rotation.y = s * 3;
  return m;
}

export function tuft(color = 0x7fae68) {
  const g = new G.Group();
  const geo = new G.ConeGeometry(0.035, 0.22, 4);
  for (let i = 0; i < 4; i++) {
    const c = mesh(geo, color, { outline: 0.008 });
    c.position.set((i - 1.5) * 0.04, 0.1, (i % 2) * 0.03);
    c.rotation.z = (i - 1.5) * 0.25;
    g.add(c);
  }
  return g;
}

export function bottle(color = 0x5fa36b, empty = false) {
  const g = new G.Group();
  const m = toon(color, { transparent: true, opacity: empty ? 0.55 : 0.95 });
  const b = mesh(new G.CylinderGeometry(0.07, 0.07, 0.22, 10), 0, { mat: m, outline: 0.01 });
  b.position.y = 0.11;
  const n = mesh(new G.CylinderGeometry(0.025, 0.05, 0.1, 8), 0, { mat: m, outline: 0.008 });
  n.position.y = 0.27;
  g.add(b, n);
  return g;
}

export function table(color = PAL.wood, w = 0.9, d = 0.6, h = 0.55) {
  const g = new G.Group();
  const top = mesh(new G.BoxGeometry(w, 0.06, d), color, { outline: 0.015 });
  top.position.y = h;
  g.add(top);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = mesh(new G.CylinderGeometry(0.03, 0.03, h, 6), color, { outline: 0.01 });
    l.position.set(x * (w / 2 - 0.06), h / 2, z * (d / 2 - 0.06));
    g.add(l);
  }
  g.userData.top = h + 0.03;
  return g;
}

export function paperStack(n = 5) {
  const g = new G.Group();
  for (let i = 0; i < n; i++) {
    const p = mesh(new G.BoxGeometry(0.22, 0.012, 0.3), 0xfbf5e6, { outline: 0.006 });
    p.position.y = i * 0.014;
    p.rotation.y = (i * 0.37) % 0.3;
    g.add(p);
  }
  return g;
}

export function lampPost() {
  const g = new G.Group();
  const pole = mesh(new G.CylinderGeometry(0.05, 0.08, 1.9, 8), 0x3d3a55, { outline: 0.015 });
  pole.position.y = 0.95;
  const cage = mesh(new G.CylinderGeometry(0.16, 0.12, 0.3, 6, 1, true), 0x3d3a55, { outline: 0.012, side: G.DoubleSide });
  cage.position.y = 2.05;
  const cap = mesh(new G.ConeGeometry(0.22, 0.18, 6), 0x3d3a55, { outline: 0.012 });
  cap.position.y = 2.29;
  const flameMat = new G.MeshBasicMaterial({ color: 0xffd36b });
  const flame = new G.Mesh(new G.SphereGeometry(0.09, 10, 8), flameMat);
  flame.scale.y = 1.5;
  flame.position.y = 2.05;
  const glow = glowSprite(0xffb84a, 2.2, 0.9);
  glow.position.y = 2.05;
  const light = new G.PointLight(0xffc36b, 0, 7, 1.5);
  light.position.y = 2.05;
  g.add(pole, cage, cap, flame, glow, light);
  g.userData = {
    on: false,
    set(on) { g.userData.on = on; flame.visible = on; glow.visible = on; light.intensity = on ? 6 : 0; },
  };
  g.userData.set(false);
  return g;
}

export function bigBook() {
  const g = new G.Group();
  for (const sd of [-1, 1]) {
    const cover = mesh(new G.BoxGeometry(0.55, 0.05, 0.75), 0x7a3b3b, { outline: 0.015 });
    cover.position.set(sd * 0.28, 0, 0);
    cover.rotation.z = -sd * 0.08;
    const pages = mesh(new G.BoxGeometry(0.5, 0.08, 0.7), 0xfbf5e6, { outline: 0.01 });
    pages.position.set(sd * 0.27, 0.06, 0);
    pages.rotation.z = -sd * 0.08;
    g.add(cover, pages);
  }
  return g;
}

export function flag(color = 0xe04a5f) {
  const g = new G.Group();
  const pole = mesh(new G.CylinderGeometry(0.025, 0.025, 1.3, 6), PAL.wood, { outline: 0.01 });
  pole.position.y = 0.65;
  const cloth = mesh(new G.BoxGeometry(0.02, 0.28, 0.42), color, { outline: 0.01, unique: true });
  cloth.position.set(0, 1.15, 0.22);
  g.add(pole, cloth);
  g.userData.cloth = cloth;
  return g;
}

export function rat() {
  const g = new G.Group();
  const body = mesh(new G.SphereGeometry(0.16, 12, 10), 0x9a93a3, { outline: 0.015 });
  body.scale.set(0.8, 0.7, 1.3);
  body.position.y = 0.12;
  const head = mesh(new G.ConeGeometry(0.1, 0.22, 10), 0x9a93a3, { outline: 0.012 });
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.14, 0.26);
  for (const sd of [-1, 1]) {
    const ear = mesh(new G.SphereGeometry(0.06, 8, 6), 0xd8a6b3, { outline: 0.01 });
    ear.scale.z = 0.3;
    ear.position.set(sd * 0.07, 0.24, 0.17);
    g.add(ear);
  }
  const tail = mesh(new G.TorusGeometry(0.16, 0.012, 4, 12, Math.PI * 1.2), 0xd8a6b3, { outline: 0.006 });
  tail.position.set(0, 0.1, -0.3);
  tail.rotation.y = Math.PI / 2;
  const eye = flat(new G.SphereGeometry(0.018, 6, 4), PAL.ink);
  eye.position.set(0.05, 0.19, 0.3);
  const eye2 = eye.clone(); eye2.position.x = -0.05;
  g.add(body, head, tail, eye, eye2, blob(0.18));
  return g;
}

export function fox() {
  const g = new G.Group();
  const orange = 0xe8833a, white = 0xfbf1e0, dark = 0x4a3040;
  const body = mesh(new G.SphereGeometry(0.28, 14, 12), orange);
  body.scale.set(0.75, 0.75, 1.35);
  body.position.y = 0.42;
  const chest = mesh(new G.SphereGeometry(0.17, 12, 10), white, { outline: 0.015 });
  chest.position.set(0, 0.42, 0.26);
  g.add(body, chest);
  const head = new G.Group();
  head.position.set(0, 0.72, 0.36);
  const skull = mesh(new G.SphereGeometry(0.19, 14, 12), orange);
  const snout = mesh(new G.ConeGeometry(0.1, 0.26, 10), white, { outline: 0.015 });
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.04, 0.22);
  const nose = flat(new G.SphereGeometry(0.035, 8, 6), dark);
  nose.position.set(0, -0.04, 0.35);
  head.add(skull, snout, nose);
  for (const sd of [-1, 1]) {
    const ear = mesh(new G.ConeGeometry(0.08, 0.34, 4), orange, { outline: 0.015 });
    ear.position.set(sd * 0.1, 0.25, -0.02);
    ear.rotation.z = -sd * 0.2;
    const inner = flat(new G.ConeGeometry(0.04, 0.2, 4), dark);
    inner.position.set(0, -0.03, 0.03);
    ear.add(inner);
    head.add(ear);
    const eye = flat(new G.SphereGeometry(0.03, 8, 6), PAL.ink);
    eye.position.set(sd * 0.08, 0.04, 0.16);
    eye.scale.y = 1.4;
    head.add(eye);
  }
  g.add(head);
  for (const [x, z] of [[-0.12, 0.22], [0.12, 0.22], [-0.12, -0.25], [0.12, -0.25]]) {
    const l = mesh(new G.CylinderGeometry(0.045, 0.04, 0.34, 6), dark, { outline: 0.012 });
    l.position.set(x, 0.17, z);
    g.add(l);
  }
  const tail = new G.Group();
  tail.position.set(0, 0.5, -0.42);
  const t1 = mesh(new G.SphereGeometry(0.16, 12, 10), orange);
  t1.scale.set(0.8, 0.8, 2.2);
  t1.position.z = -0.3;
  const tip = mesh(new G.SphereGeometry(0.11, 10, 8), white, { outline: 0.015 });
  tip.position.z = -0.62;
  tail.add(t1, tip);
  tail.rotation.x = -0.5;
  g.add(tail, blob(0.4));
  g.userData = { head, tail };
  return g;
}

export function snake() {
  const g = new G.Group();
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 4.2;
    const r = 0.45 - t * 0.28;
    pts.push(new G.Vector3(Math.cos(a) * r, 0.06 + t * 0.35 + (t > 0.85 ? (t - 0.85) * 2.5 : 0), Math.sin(a) * r));
  }
  const curve = new G.CatmullRomCurve3(pts);
  const body = mesh(new G.TubeGeometry(curve, 80, 0.06, 8), 0xe9cf4a, { outline: 0.015 });
  const last = pts[pts.length - 1];
  const head = mesh(new G.SphereGeometry(0.09, 12, 10), 0xe9cf4a, { outline: 0.015 });
  head.scale.set(1, 0.8, 1.4);
  head.position.copy(last).add(new G.Vector3(0, 0.02, 0.05));
  for (const sd of [-1, 1]) {
    const eye = flat(new G.SphereGeometry(0.018, 6, 4), PAL.ink);
    eye.position.set(sd * 0.05, 0.04, 0.06);
    head.add(eye);
  }
  g.add(body, head, blob(0.5));
  g.userData.head = head;
  return g;
}

export function threePetal() {
  const g = new G.Group();
  const stem = mesh(new G.CylinderGeometry(0.015, 0.02, 0.4, 5), PAL.stem, { outline: 0.008 });
  stem.position.y = 0.2;
  g.add(stem);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const p = mesh(new G.SphereGeometry(0.07, 8, 6), 0xf2e6f5, { outline: 0.01 });
    p.scale.set(0.6, 0.25, 1.4);
    p.position.set(Math.sin(a) * 0.08, 0.42, Math.cos(a) * 0.08);
    p.rotation.y = a;
    g.add(p);
  }
  const c = mesh(new G.SphereGeometry(0.04, 8, 6), PAL.gold, { outline: 0.008 });
  c.position.y = 0.43;
  g.add(c);
  g.scale.setScalar(1.8);
  return g;
}

export function well() {
  const g = new G.Group();
  const prof = [new G.Vector2(0.62, 0), new G.Vector2(0.85, 0), new G.Vector2(0.85, 0.7), new G.Vector2(0.62, 0.7), new G.Vector2(0.62, 0)];
  const ring = mesh(new G.LatheGeometry(prof, 20), 0xb9a48c);
  g.add(ring);
  const water = flat(new G.CircleGeometry(0.62, 20), 0x1c2a4a);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.35;
  g.add(water);
  for (const sd of [-1, 1]) {
    const post = mesh(new G.BoxGeometry(0.1, 1.5, 0.1), PAL.wood, { outline: 0.012 });
    post.position.set(sd * 0.78, 1.15, 0);
    g.add(post);
  }
  const beam = mesh(new G.CylinderGeometry(0.05, 0.05, 1.7, 8), PAL.wood, { outline: 0.012 });
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 1.8;
  const pulley = mesh(new G.CylinderGeometry(0.2, 0.2, 0.08, 14), 0x8a8078, { outline: 0.012 });
  pulley.rotation.z = Math.PI / 2;
  pulley.position.y = 1.8;
  const rope = mesh(new G.CylinderGeometry(0.012, 0.012, 1, 4), 0xd8c49a, { outline: 0 });
  const bucket = mesh(new G.CylinderGeometry(0.14, 0.11, 0.2, 10), 0x8a6a4a, { outline: 0.012 });
  g.add(beam, pulley, rope, bucket);
  g.userData = {
    pulley,
    setBucket(h) { // h: 0 fundo, 1 topo
      const y = 0.2 + h * 1.25;
      bucket.position.set(0, y, 0);
      rope.scale.y = 1.8 - y - 0.1;
      rope.position.y = (1.8 + y + 0.1) / 2;
      pulley.rotation.x = h * 12;
    },
  };
  g.userData.setBucket(0);
  return g;
}

export function plane() {
  const g = new G.Group();
  const red = 0xc4533a, cream = 0xf1e2c4;
  const fus = mesh(new G.CylinderGeometry(0.35, 0.18, 3.0, 12), cream);
  fus.rotation.x = Math.PI / 2;
  fus.position.y = 0.55;
  const nose = mesh(new G.CylinderGeometry(0.36, 0.36, 0.4, 12), red);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.55, 1.6);
  const prop = mesh(new G.BoxGeometry(1.4, 0.12, 0.04), PAL.wood, { outline: 0.012 });
  prop.position.set(0, 0.55, 1.83);
  prop.rotation.z = 0.7;
  for (const y of [0.25, 1.15]) {
    const w = mesh(new G.BoxGeometry(4.2, 0.07, 0.8), red);
    w.position.set(0, y, 0.6);
    g.add(w);
  }
  for (const x of [-1.6, 1.6, -0.5, 0.5]) {
    const s = mesh(new G.CylinderGeometry(0.025, 0.025, 0.9, 5), PAL.wood, { outline: 0.008 });
    s.position.set(x, 0.7, 0.6);
    g.add(s);
  }
  const tailH = mesh(new G.BoxGeometry(1.4, 0.05, 0.4), red);
  tailH.position.set(0, 0.62, -1.4);
  const tailV = mesh(new G.BoxGeometry(0.05, 0.6, 0.45), red);
  tailV.position.set(0, 0.9, -1.4);
  const cockpit = flat(new G.CircleGeometry(0.22, 12), 0x3a2f4a);
  cockpit.rotation.x = -Math.PI / 2;
  cockpit.position.set(0, 0.905, -0.1);
  g.add(fus, nose, prop, tailH, tailV, cockpit);
  g.rotation.x = 0.18; // nariz enterrado na areia
  g.rotation.z = 0.12;
  return g;
}

export function toolbox() {
  const g = new G.Group();
  const b = mesh(new G.BoxGeometry(0.5, 0.22, 0.26), 0xb8483a, { outline: 0.012 });
  b.position.y = 0.11;
  const h = mesh(new G.TorusGeometry(0.1, 0.02, 6, 10, Math.PI), 0x3d3a55, { outline: 0.006 });
  h.position.y = 0.22;
  g.add(b, h);
  return g;
}

export function blanket() {
  const m = mesh(new G.BoxGeometry(1.0, 0.04, 1.6), 0x8a5a7a, { outline: 0.012 });
  m.position.y = 0.02;
  return m;
}

export function wall(len = 3, h = 0.8) {
  const g = new G.Group();
  const w = mesh(new G.BoxGeometry(len, h, 0.35), 0xc8b49a);
  w.position.y = h / 2;
  g.add(w);
  const r = rng(len * 10);
  for (let i = 0; i < len * 2; i++) {
    const s = flat(new G.PlaneGeometry(0.25, 0.12), 0xa89478);
    s.position.set((r() - 0.5) * len * 0.9, r() * h * 0.8 + 0.1, 0.18);
    g.add(s);
  }
  return g;
}

export function bird() {
  const g = new G.Group();
  const body = mesh(new G.SphereGeometry(0.14, 10, 8), 0xf7f3ea, { outline: 0.015 });
  body.scale.set(0.8, 0.7, 1.4);
  const beak = mesh(new G.ConeGeometry(0.03, 0.1, 5), PAL.gold, { outline: 0.006 });
  beak.rotation.x = -Math.PI / 2;
  beak.position.z = -0.22;
  g.add(body, beak);
  const wings = [-1, 1].map((sd) => {
    const p = new G.Group();
    const w = mesh(new G.BoxGeometry(0.45, 0.02, 0.18), 0xf7f3ea, { outline: 0.01 });
    w.position.x = sd * 0.24;
    p.add(w);
    g.add(p);
    return p;
  });
  g.userData = { wings, t: Math.random() * 6 };
  return g;
}

export function fallenStar() {
  const g = new G.Group();
  const s = mesh(starGeom(0.22, 0.1, 0.07), PAL.gold, { outline: 0.012, emissive: 0x6a4a10 });
  s.position.y = 0.45;
  const glow = glowSprite(0xffc850, 1.6, 0.9);
  glow.position.y = 0.45;
  g.add(s, glow, blob(0.2));
  g.userData.star = s;
  return g;
}

/** Plantio instanciado (roseiral e trigal). Retorna um grupo com update(t). */
export function instancedField(count, placeFn, parts) {
  const g = new G.Group();
  const dummy = new G.Object3D();
  const meshes = parts.map(({ geom, color, y = 0 }) => {
    const m = new G.InstancedMesh(geom, toon(color), count);
    m.userData.y = y;
    g.add(m);
    return m;
  });
  for (let i = 0; i < count; i++) {
    placeFn(i, dummy);
    dummy.updateMatrix();
    const base = dummy.matrix.clone();
    meshes.forEach((m) => {
      const off = new G.Matrix4().makeTranslation(0, m.userData.y, 0);
      m.setMatrixAt(i, base.clone().multiply(off));
    });
  }
  meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; });
  return g;
}
