// Objetos de cena: tudo modelado com primitivas, no mesmo traço de tinta.
import * as THREE from 'three';
import { mesh, flat, toon, PAL, starGeom, blob, rng, glow as glowSprite } from './style.js';

const G = THREE;

// ─── Cisco, a luazinha de Ilo ───

/** Braseiro da Vó Brasa: tripé, bacia e fogo que cresce quando alimentado. */
export function brazier() {
  const g = new G.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new G.CylinderGeometry(0.04, 0.05, 1.3, 6), 0x3d3a55, { outline: 0.012 });
    leg.position.set(Math.cos(a) * 0.35, 0.6, Math.sin(a) * 0.35);
    leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    g.add(leg);
  }
  const bowl = mesh(new G.SphereGeometry(0.55, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x5a4a6a, { outline: 0.02, side: G.DoubleSide });
  bowl.position.y = 1.35;
  g.add(bowl);
  const fire = new G.Group();
  fire.position.y = 1.3;
  const flames = [];
  const fmats = [0xff7a3d, 0xffb347, 0xffe07a].map((c) => new G.MeshBasicMaterial({ color: c }));
  for (let i = 0; i < 7; i++) {
    const f = new G.Mesh(new G.ConeGeometry(0.16 - (i % 3) * 0.03, 0.55, 7), fmats[i % 3]);
    f.position.set(Math.cos(i * 2.1) * 0.18, 0.25, Math.sin(i * 2.1) * 0.18);
    f.userData.ph = i * 1.3;
    fire.add(f);
    flames.push(f);
  }
  const halo = glowSprite(0xff9a40, 3.2, 0.9);
  halo.position.y = 0.3;
  fire.add(halo);
  const light = new G.PointLight(0xffa860, 4, 9, 1.4);
  light.position.y = 0.6;
  fire.add(light);
  g.add(fire);
  g.userData = {
    power: 0.35,
    update(dt, t) {
      const p = g.userData.power;
      flames.forEach((f) => {
        f.scale.set(1, p * (0.8 + Math.sin(t * 9 + f.userData.ph) * 0.25), 1);
        f.position.y = 0.15 + p * 0.1;
      });
      halo.scale.setScalar(1 + p * 2.4);
      light.intensity = 1 + p * 5;
    },
  };
  return g;
}

/** Chaminé de pedra das estufas de Cisco (solta fuligem até ser varrida). */
export function chimney() {
  const g = new G.Group();
  const body = mesh(new G.CylinderGeometry(0.28, 0.34, 0.9, 10), 0xb0705a);
  body.position.y = 0.45;
  const cap = mesh(new G.CylinderGeometry(0.36, 0.36, 0.12, 10), 0x8a5040);
  cap.position.y = 0.92;
  const hole = flat(new G.CircleGeometry(0.22, 12), 0x2a2030);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.985;
  g.add(body, cap, hole);
  for (let i = 0; i < 6; i++) {
    const b = flat(new G.PlaneGeometry(0.14, 0.07), 0x8a5040, { side: G.DoubleSide });
    const a = i * 1.1;
    b.position.set(Math.sin(a) * 0.315, 0.2 + (i % 3) * 0.22, Math.cos(a) * 0.315);
    b.rotation.y = a;
    g.add(b);
  }
  const puffs = [];
  const smokeMat = toon(0x6a6070, { transparent: true, opacity: 0.85 }, true);
  for (let i = 0; i < 5; i++) {
    const p = mesh(new G.SphereGeometry(0.12, 8, 6), 0, { mat: smokeMat, outline: 0.012 });
    p.userData.t = i / 5;
    g.add(p);
    puffs.push(p);
  }
  g.userData = {
    clean: false,
    update(dt) {
      const d = g.userData;
      for (const p of puffs) {
        p.userData.t = (p.userData.t + dt * (d.clean ? 0.12 : 0.45)) % 1;
        const t = p.userData.t;
        p.position.set(Math.sin(t * 6 + p.id) * 0.1, 1.0 + t * (d.clean ? 0.4 : 1.4), 0);
        p.scale.setScalar((d.clean ? 0.3 : 0.7) + t * (d.clean ? 0.4 : 1.4));
      }
      smokeMat.opacity = d.clean ? 0.35 : 0.85;
      smokeMat.color.set(d.clean ? 0xf0e0ff : 0x5a5060);
    },
  };
  return g;
}

/** Erva-de-sombra: brota nas frestas e engole a luz. */
export function shadeWeed() {
  const g = new G.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = mesh(new G.ConeGeometry(0.06, 0.45, 5), 0x4a2f6a, { outline: 0.012 });
    c.position.set(Math.cos(a) * 0.07, 0.2, Math.sin(a) * 0.07);
    c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(c);
  }
  const eye = mesh(new G.SphereGeometry(0.07, 8, 6), 0x2a1a40, { outline: 0.01 });
  eye.position.y = 0.12;
  g.add(eye, blob(0.2));
  return g;
}

export function coalBucket() {
  const g = new G.Group();
  const b = mesh(new G.CylinderGeometry(0.17, 0.13, 0.26, 10), 0x6a7a8a, { outline: 0.015 });
  b.position.y = 0.13;
  g.add(b);
  for (let i = 0; i < 5; i++) {
    const c = mesh(new G.DodecahedronGeometry(0.06, 0), 0x2a2430, { outline: 0.008 });
    c.position.set((i % 3 - 1) * 0.07, 0.27, (i > 2 ? 0.05 : -0.04));
    g.add(c);
  }
  const h = mesh(new G.TorusGeometry(0.16, 0.012, 5, 12, Math.PI), 0x3d3a55, { outline: 0.005 });
  h.position.y = 0.26;
  g.add(h);
  return g;
}

export function broom() {
  const g = new G.Group();
  const h = mesh(new G.CylinderGeometry(0.022, 0.022, 0.95, 5), PAL.wood, { outline: 0.008 });
  h.position.y = 0.6;
  const head = mesh(new G.ConeGeometry(0.13, 0.28, 8), 0xd8b860, { outline: 0.01 });
  head.position.y = 0.1;
  g.add(h, head);
  return g;
}

export function bench() {
  const g = new G.Group();
  const seat = mesh(new G.BoxGeometry(0.9, 0.06, 0.32), PAL.wood, { outline: 0.012 });
  seat.position.y = 0.3;
  g.add(seat);
  for (const x of [-0.38, 0.38]) {
    const l = mesh(new G.BoxGeometry(0.06, 0.3, 0.28), 0x6a4a3a, { outline: 0.008 });
    l.position.set(x, 0.15, 0);
    g.add(l);
  }
  return g;
}

/** Pipa (a "nave" de Ilo). `style` muda o desenho escolhido no caderno. */
export function kite(style = 0) {
  const g = new G.Group();
  const colors = [[0xe85a4f, 0xf3c653], [0x4fc3b0, 0xf4ead5], [0x9a6ae0, 0xffb0d0], [0x3a7ac8, 0xf3c653]][style % 4];
  const s = new G.Shape();
  if (style === 1) { // peixe
    s.moveTo(0, 0.55); s.quadraticCurveTo(0.45, 0.1, 0, -0.45); s.quadraticCurveTo(-0.45, 0.1, 0, 0.55);
  } else if (style === 2) { // estrela
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.25 : 0.6; const a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  } else if (style === 3) { // pássaro-de-papel
    s.moveTo(0, 0.3); s.lineTo(0.7, 0.05); s.lineTo(0.1, -0.05); s.lineTo(0, -0.5); s.lineTo(-0.1, -0.05); s.lineTo(-0.7, 0.05);
  } else { // losango
    s.moveTo(0, 0.6); s.lineTo(0.4, 0.05); s.lineTo(0, -0.5); s.lineTo(-0.4, 0.05);
  }
  s.closePath();
  const sail = mesh(new G.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), colors[0], { outline: 0.02, side: G.DoubleSide });
  sail.rotation.x = -Math.PI / 2;
  g.add(sail);
  const stripe = flat(new G.CircleGeometry(0.14, 12), colors[1], { side: G.DoubleSide });
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.y = 0.025;
  g.add(stripe);
  // rabiola com lacinhos
  const bows = [];
  for (let i = 0; i < 5; i++) {
    const b = mesh(new G.BoxGeometry(0.14, 0.02, 0.06), colors[i % 2], { outline: 0.006 });
    b.position.set(0, 0, 0.55 + i * 0.22);
    g.add(b);
    bows.push(b);
  }
  g.userData = {
    bows,
    update(t) { bows.forEach((b, i) => { b.position.x = Math.sin(t * 4 + i * 0.8) * 0.08 * i; b.rotation.y = Math.sin(t * 5 + i) * 0.6; }); },
  };
  g.scale.setScalar(1.6);
  return g;
}

// ─── mundinhos ───

export function gear(r = 0.35, color = 0xd4a13a) {
  const g = new G.Group();
  const disc = mesh(new G.CylinderGeometry(r, r, 0.12, 20), color, { outline: 0.015 });
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tooth = mesh(new G.BoxGeometry(0.1, 0.12, 0.12), color, { outline: 0.008 });
    tooth.position.set(Math.cos(a) * (r + 0.04), Math.sin(a) * (r + 0.04), 0);
    tooth.rotation.z = a;
    g.add(tooth);
  }
  const hub = flat(new G.CircleGeometry(r * 0.3, 12), PAL.ink, { side: G.DoubleSide });
  hub.position.z = 0.065;
  g.add(hub);
  return g;
}

/** Tique: engrenagem fujona com olhinhos e perninhas. */
export function runawayGear() {
  const g = new G.Group();
  const w = gear(0.28, 0xe0b04a);
  w.position.y = 0.34;
  g.add(w);
  for (const sd of [-1, 1]) {
    const e = flat(new G.SphereGeometry(0.035, 6, 4), PAL.ink);
    e.position.set(sd * 0.08, 0.4, 0.08);
    g.add(e);
  }
  g.add(blob(0.25));
  g.userData.wheel = w;
  return g;
}

export function bigClock() {
  const g = new G.Group();
  const post = mesh(new G.CylinderGeometry(0.08, 0.1, 1.6, 8), 0x3d3a55, { outline: 0.012 });
  post.position.y = 0.8;
  const face = mesh(new G.CylinderGeometry(0.6, 0.6, 0.1, 24), 0xf4ead5);
  face.rotation.x = Math.PI / 2;
  face.position.y = 1.9;
  const rim = mesh(new G.TorusGeometry(0.6, 0.05, 6, 24), 0xd4a13a, { outline: 0.01 });
  rim.position.y = 1.9;
  g.add(post, face, rim);
  const hands = [0.45, 0.3].map((l, i) => {
    const p = new G.Group();
    p.position.set(0, 1.9, 0.07);
    const h = flat(new G.PlaneGeometry(0.04, l), PAL.ink, { side: G.DoubleSide });
    h.position.y = l / 2;
    p.add(h);
    g.add(p);
    return p;
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = flat(new G.CircleGeometry(0.03, 6), PAL.ink);
    d.position.set(Math.sin(a) * 0.5, 1.9 + Math.cos(a) * 0.5, 0.06);
    g.add(d);
  }
  g.userData = { hands, running: false, update(dt) { if (g.userData.running) { hands[0].rotation.z -= dt * 2; hands[1].rotation.z -= dt * 0.2; } } };
  return g;
}

export function bellPost(color = 0xd4a13a) {
  const g = new G.Group();
  const pole = mesh(new G.CylinderGeometry(0.03, 0.04, 1.3, 6), PAL.wood, { outline: 0.008 });
  pole.position.y = 0.65;
  const arm = mesh(new G.BoxGeometry(0.4, 0.04, 0.04), PAL.wood, { outline: 0.006 });
  arm.position.set(0.18, 1.28, 0);
  const bell = new G.Group();
  bell.position.set(0.34, 1.25, 0);
  const b = mesh(new G.CylinderGeometry(0.06, 0.16, 0.24, 12, 1, true), color, { outline: 0.012, side: G.DoubleSide });
  b.position.y = -0.14;
  const clap = mesh(new G.SphereGeometry(0.04, 6, 4), 0x3d3a55, { outline: 0 });
  clap.position.y = -0.26;
  bell.add(b, clap);
  g.add(pole, arm, bell);
  g.userData.bell = bell;
  return g;
}

export function cloudPuff(s = 1) {
  const g = new G.Group();
  const m = toon(0xf8f4ff);
  for (let i = 0; i < 4; i++) {
    const p = mesh(new G.SphereGeometry(0.18 + (i % 2) * 0.07, 10, 8), 0, { mat: m, outline: 0.012 });
    p.position.set((i - 1.5) * 0.16, (i % 2) * 0.08, (i % 3) * 0.05);
    g.add(p);
  }
  g.scale.setScalar(s);
  return g;
}

/** Cúmulo, a baleia-nuvem que flutua sobre o Planeta Nevoeiro. */
export function cloudWhale() {
  const g = new G.Group();
  const m = toon(0xeae6fa);
  const body = mesh(new G.SphereGeometry(0.9, 18, 14), 0, { mat: m });
  body.scale.set(1, 0.75, 1.6);
  const belly = mesh(new G.SphereGeometry(0.7, 14, 10), 0xc8d4f0);
  belly.scale.set(0.9, 0.5, 1.3);
  belly.position.y = -0.3;
  const tail = mesh(new G.ConeGeometry(0.45, 0.7, 4), 0, { mat: m });
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(1.6, 1, 0.3);
  tail.position.z = -1.6;
  g.add(body, belly, tail);
  for (const sd of [-1, 1]) {
    const e = flat(new G.SphereGeometry(0.06, 8, 6), PAL.ink);
    e.position.set(sd * 0.55, 0.05, 1.05);
    const fin = mesh(new G.SphereGeometry(0.3, 8, 6), 0, { mat: m, outline: 0.015 });
    fin.scale.set(1.3, 0.2, 0.6);
    fin.position.set(sd * 0.95, -0.3, 0.2);
    g.add(e, fin);
  }
  g.userData.tail = tail;
  return g;
}

export function acornPile() {
  const g = new G.Group();
  const r = rng(9);
  for (let i = 0; i < 9; i++) {
    const a = new G.Group();
    const nut = mesh(new G.SphereGeometry(0.1, 8, 6), 0xb07a45, { outline: 0.01 });
    nut.scale.y = 1.25;
    const cap = mesh(new G.SphereGeometry(0.105, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a4a30, { outline: 0.008 });
    cap.position.y = 0.04;
    a.add(nut, cap);
    a.position.set((r() - 0.5) * 0.5, 0.1 + (i > 5 ? 0.18 : 0), (r() - 0.5) * 0.5);
    g.add(a);
  }
  return g;
}

export function lighthouse() {
  const g = new G.Group();
  for (let i = 0; i < 4; i++) {
    const seg = mesh(new G.CylinderGeometry(0.34 - i * 0.04, 0.38 - i * 0.04, 0.45, 12), i % 2 ? 0xf4ead5 : 0xd8504a);
    seg.position.y = 0.225 + i * 0.45;
    g.add(seg);
  }
  const cabin = mesh(new G.CylinderGeometry(0.26, 0.26, 0.35, 8, 1, true), 0x3d3a55, { outline: 0.012, side: G.DoubleSide });
  cabin.position.y = 2.0;
  const roof = mesh(new G.ConeGeometry(0.34, 0.3, 8), 0xd8504a);
  roof.position.y = 2.33;
  const lamp = new G.Mesh(new G.SphereGeometry(0.13, 10, 8), new G.MeshBasicMaterial({ color: 0xffe07a }));
  lamp.position.y = 2.0;
  const halo = glowSprite(0xffc850, 2.8, 0.9);
  halo.position.y = 2.0;
  const beam = new G.Mesh(new G.ConeGeometry(0.5, 3.5, 16, 1, true), new G.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.16, depthWrite: false, side: G.DoubleSide, blending: G.AdditiveBlending }));
  beam.rotation.z = Math.PI / 2;
  beam.position.set(1.75, 2.0, 0);
  const pivot = new G.Group();
  pivot.add(beam);
  const light = new G.PointLight(0xffd080, 0, 8, 1.4);
  light.position.y = 2.0;
  g.add(cabin, roof, lamp, halo, pivot, light);
  g.userData = {
    on: false,
    set(on) { g.userData.on = on; lamp.visible = halo.visible = pivot.visible = on; light.intensity = on ? 6 : 0; },
    update(dt) { pivot.rotation.y += dt * 1.6; },
  };
  pivot.position.y = 0;
  g.userData.set(false);
  return g;
}

export function mapTable() {
  const g = table(0x6a4a3a, 1.5, 0.9, 0.7);
  const map = mesh(new G.BoxGeometry(1.2, 0.02, 0.7), 0xf1e2c4, { outline: 0.01 });
  map.position.y = g.userData.top + 0.01;
  g.add(map);
  for (let i = 0; i < 5; i++) {
    const d = flat(new G.CircleGeometry(0.04 + (i % 2) * 0.03, 8), [0xd8504a, 0x3a7ac8, 0x4a8a5a][i % 3]);
    d.rotation.x = -Math.PI / 2;
    d.position.set(-0.45 + i * 0.22, g.userData.top + 0.025, (i % 2 ? 0.15 : -0.12));
    g.add(d);
  }
  return g;
}

// ─── A Grande Duna ───

/** Vidrilho: lagarta de vidro, sábia e meio sonolenta. */
export function glassWorm() {
  const g = new G.Group();
  const m = toon(0x9fe3e0, { transparent: true, opacity: 0.8 });
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const s = mesh(new G.SphereGeometry(0.2 - i * 0.015, 12, 10), 0, { mat: m, outline: 0.012 });
    s.position.set(0, 0.2, -i * 0.28);
    g.add(s);
    segs.push(s);
    const leg = mesh(new G.CylinderGeometry(0.02, 0.02, 0.12, 4), 0x4a8a9a, { outline: 0.005 });
    leg.position.set(0, 0.05, -i * 0.28);
    g.add(leg);
  }
  const head = mesh(new G.SphereGeometry(0.24, 14, 12), 0x7fd0d0);
  head.position.set(0, 0.42, 0.18);
  for (const sd of [-1, 1]) {
    const e = flat(new G.SphereGeometry(0.035, 6, 4), PAL.ink);
    e.position.set(sd * 0.09, 0.07, 0.2);
    head.add(e);
    const ant = mesh(new G.CylinderGeometry(0.012, 0.012, 0.3, 4), PAL.ink, { outline: 0 });
    ant.position.set(sd * 0.08, 0.3, 0);
    ant.rotation.z = -sd * 0.3;
    const tip = flat(new G.SphereGeometry(0.04, 6, 4), 0xffe07a);
    tip.position.y = 0.16;
    ant.add(tip);
    head.add(ant);
  }
  g.add(head, blob(0.6));
  g.userData = { segs, head, update(t) { segs.forEach((s, i) => { s.position.y = 0.2 + Math.max(0, Math.sin(t * 3 - i * 0.8)) * 0.07; }); head.position.y = 0.42 + Math.sin(t * 2) * 0.03; } };
  return g;
}

/** Dona Espinha: cacto velhinho, de óculos e flor no chapéu. */
export function cactus() {
  const g = new G.Group();
  const c = 0x6aa06a;
  const body = mesh(new G.CapsuleGeometry(0.28, 0.9, 6, 12), c);
  body.position.y = 0.72;
  g.add(body);
  for (const sd of [-1, 1]) {
    const arm = mesh(new G.CapsuleGeometry(0.12, 0.35, 4, 8), c, { outline: 0.015 });
    arm.position.set(sd * 0.42, 0.85 + (sd > 0 ? 0.15 : 0), 0);
    const elbow = mesh(new G.CapsuleGeometry(0.12, 0.12, 4, 8), c, { outline: 0.015 });
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(sd * 0.3, 0.68 + (sd > 0 ? 0.15 : 0), 0);
    g.add(arm, elbow);
    const e = flat(new G.SphereGeometry(0.035, 6, 4), PAL.ink);
    e.position.set(sd * 0.1, 1.1, 0.27);
    g.add(e);
    const gl = mesh(new G.TorusGeometry(0.07, 0.012, 5, 12), PAL.ink, { outline: 0 });
    gl.position.set(sd * 0.1, 1.1, 0.28);
    g.add(gl);
  }
  const fl = mesh(new G.SphereGeometry(0.1, 8, 6), 0xff7ab8, { outline: 0.01 });
  fl.scale.y = 0.6;
  fl.position.set(0.1, 1.42, 0.05);
  g.add(fl, blob(0.4));
  return g;
}

/** Musgo: cervinho tímido de chifres com brotinhos. */
export function mossDeer() {
  const g = new G.Group();
  const fur = 0x9a8a6a, moss = 0x7aae5a, light = 0xf1e2c4, dark = 0x3a3040;
  const body = mesh(new G.SphereGeometry(0.3, 14, 12), fur);
  body.scale.set(0.7, 0.7, 1.3);
  body.position.y = 0.72;
  const back = mesh(new G.SphereGeometry(0.22, 10, 8), moss, { outline: 0.015 });
  back.scale.set(0.9, 0.4, 1.5);
  back.position.set(0, 0.9, -0.05);
  g.add(body, back);
  for (const [x, z] of [[-0.13, 0.25], [0.13, 0.25], [-0.13, -0.25], [0.13, -0.25]]) {
    const l = mesh(new G.CylinderGeometry(0.04, 0.03, 0.55, 6), fur, { outline: 0.01 });
    l.position.set(x, 0.3, z);
    const hoof = flat(new G.SphereGeometry(0.04, 6, 4), dark);
    hoof.position.set(x, 0.03, z);
    g.add(l, hoof);
  }
  const head = new G.Group();
  head.position.set(0, 1.12, 0.4);
  const skull = mesh(new G.SphereGeometry(0.17, 12, 10), fur);
  const snout = mesh(new G.SphereGeometry(0.1, 10, 8), light, { outline: 0.012 });
  snout.scale.set(0.9, 0.8, 1.2);
  snout.position.set(0, -0.06, 0.15);
  const nose = flat(new G.SphereGeometry(0.03, 6, 4), dark);
  nose.position.set(0, -0.03, 0.27);
  head.add(skull, snout, nose);
  for (const sd of [-1, 1]) {
    const e = flat(new G.SphereGeometry(0.03, 6, 4), PAL.ink);
    e.position.set(sd * 0.09, 0.03, 0.13);
    e.scale.y = 1.4;
    const ear = mesh(new G.SphereGeometry(0.08, 8, 6), fur, { outline: 0.01 });
    ear.scale.set(0.5, 1.2, 0.3);
    ear.position.set(sd * 0.17, 0.08, -0.02);
    ear.rotation.z = -sd * 0.9;
    const antler = mesh(new G.CylinderGeometry(0.018, 0.025, 0.3, 5), 0x8a6a4a, { outline: 0.006 });
    antler.position.set(sd * 0.08, 0.26, -0.02);
    antler.rotation.z = -sd * 0.35;
    const leaf = mesh(new G.SphereGeometry(0.06, 6, 5), moss, { outline: 0.008 });
    leaf.scale.set(1.4, 0.4, 0.8);
    leaf.position.set(sd * 0.04, 0.16, 0);
    antler.add(leaf);
    head.add(e, ear, antler);
  }
  const tail = mesh(new G.SphereGeometry(0.08, 8, 6), light, { outline: 0.01 });
  tail.position.set(0, 0.85, -0.42);
  g.add(head, tail, blob(0.45));
  g.userData = { head, tail };
  return g;
}

/** Fonte das Estrelas: bacia de pedra com roldana e balde. */
export function fountain() {
  const g = new G.Group();
  const prof = [new G.Vector2(0.75, 0), new G.Vector2(1.0, 0), new G.Vector2(1.05, 0.5), new G.Vector2(0.8, 0.55), new G.Vector2(0.75, 0)];
  const ring = mesh(new G.LatheGeometry(prof, 24), 0x8a9ac0);
  g.add(ring);
  const water = flat(new G.CircleGeometry(0.78, 24), 0x2a3a7a);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  const shine = glowSprite(0x9ab8ff, 1.6, 0.6);
  shine.position.y = 0.35;
  g.add(water, shine);
  const arch = mesh(new G.TorusGeometry(0.95, 0.07, 8, 20, Math.PI), 0x6a7aa0, { outline: 0.012 });
  arch.position.y = 0.5;
  g.add(arch);
  const pulley = mesh(new G.CylinderGeometry(0.16, 0.16, 0.08, 14), 0xd4a13a, { outline: 0.012 });
  pulley.rotation.x = Math.PI / 2;
  pulley.position.y = 1.45;
  const rope = mesh(new G.CylinderGeometry(0.012, 0.012, 1, 4), 0xd8c49a, { outline: 0 });
  const bucket = new G.Group();
  const bk = mesh(new G.CylinderGeometry(0.14, 0.11, 0.2, 10), 0x8a6a4a, { outline: 0.012 });
  const lightW = new G.Mesh(new G.CircleGeometry(0.12, 10), new G.MeshBasicMaterial({ color: 0xffe07a }));
  lightW.rotation.x = -Math.PI / 2;
  lightW.position.y = 0.09;
  lightW.visible = false;
  bucket.add(bk, lightW);
  g.add(pulley, rope, bucket);
  g.userData = {
    setBucket(h) {
      const y = 0.15 + h * 1.0;
      bucket.position.set(0, y, 0);
      rope.scale.y = 1.45 - y - 0.1;
      rope.position.y = (1.45 + y + 0.1) / 2;
      pulley.rotation.z = h * 12;
      lightW.visible = h > 0.95;
    },
  };
  g.userData.setBucket(0);
  return g;
}

// ─── genéricos ───

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

/** Plantio instanciado (campos de lanternas, capim). */
export function instancedField(count, placeFn, parts) {
  const g = new G.Group();
  const dummy = new G.Object3D();
  const meshes = parts.map(({ geom, color, y = 0, basic = false }) => {
    const m = new G.InstancedMesh(geom, basic ? new G.MeshBasicMaterial({ color }) : toon(color), count);
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
