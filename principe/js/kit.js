// Utilidades compartilhadas pelos capítulos.
import * as THREE from 'three';
import { fbm3, rng, col } from './style.js';
import { bird, tuft, rock } from './props.js';
import { dirLL, angleBetween, tangentTo } from './world.js';
import { flight } from './flight.js';

export { dirLL, angleBetween, tangentTo };

export const SPEAKERS = {
  'Pequeno Príncipe': '#f3c653',
  'Aviador': '#9ad0ff',
  'Rosa': '#ff8a9a',
  'Rei': '#d0a8ff',
  'Vaidoso': '#ff9ad0',
  'Bêbado': '#a8d0b0',
  'Homem de negócios': '#f0e4a0',
  'Acendedor': '#ffd08a',
  'Geógrafo': '#d8b890',
  'Serpente': '#e9cf4a',
  'Flor': '#f2e6f5',
  'Eco': '#c8c0e0',
  'Rosas': '#ff9aaa',
  'Raposa': '#f5a060',
};
export const P = 'Pequeno Príncipe';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export { ss as smoothstep };

/** Cor do chão em manchas de aquarela posterizadas. */
export function paint(c1, c2, c3, { scale = 2.2, seed = 0 } = {}) {
  const A = col(c1), B = col(c2), C = col(c3);
  return (n) => {
    const f = fbm3(n.x * scale + seed, n.y * scale + seed * 0.7, n.z * scale - seed);
    const step = Math.floor(f * 6) / 6;
    const c = A.clone().lerp(B, ss(0.3, 0.7, step));
    if (f > 0.66) c.lerp(C, 0.55);
    return c;
  };
}

/** Distribui enfeites pelo planeta, longe dos pontos `avoid` (vetores unitários). */
export function scatter(W, count, seed, make, avoid = [], minAng = 0.25) {
  const r = rng(seed);
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 20) {
    tries++;
    const n = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (n.lengthSq() < 0.01) continue;
    n.normalize();
    if (avoid.some((a) => angleBetween(a, n) < minAng)) continue;
    W.place(make(r, placed), n, { yaw: r() * Math.PI * 2 });
    placed++;
  }
}

export function decorate(W, seed, { tufts = 20, rocks = 8, avoid = [], tuftColor, rockColor, minAng } = {}) {
  scatter(W, tufts, seed, () => tuft(tuftColor), avoid, minAng);
  scatter(W, rocks, seed + 1, (r) => rock(0.6 + r() * 0.9, rockColor), avoid, minAng);
}

/** Bando de pássaros pousado: ao interagir, parte para o próximo asteroide. */
export async function departure(g, n, flightArgs, { label = 'Partir com os pássaros', objective = 'Partir com os pássaros selvagens' } = {}) {
  const W = g.world;
  const flock = new THREE.Group();
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const b = bird();
    b.position.set((i % 3 - 1) * 0.45, 0.15 + (i % 2) * 0.1, Math.floor(i / 3) * 0.45 - 0.2);
    b.rotation.y = Math.random() * Math.PI;
    flock.add(b);
    birds.push(b);
  }
  W.place(flock, n);
  const h = W.hook((dt) => {
    for (const b of birds) {
      b.userData.t += dt * 3;
      const f = Math.max(0, Math.sin(b.userData.t)) * 0.4;
      b.userData.wings[0].rotation.z = f; b.userData.wings[1].rotation.z = -f;
    }
  });
  g.ui.addObjective({ id: 'leave', text: objective });
  W.guide = n;
  let go = false;
  W.interact({ at: flock, r: 2, label, act: () => { go = true; } });
  await g.until(() => go);
  W.unhook(h);
  g.ui.check('leave');
  g.sound.sfx('whoosh');
  W.prince.pose = 'raise';
  g.lock();
  // os pássaros levantam voo
  let t = 0;
  const up = n.clone().normalize();
  const lift = W.hook((dt) => {
    t += dt;
    for (const b of birds) {
      b.userData.t += dt * 12;
      const f = Math.sin(b.userData.t) * 0.8;
      b.userData.wings[0].rotation.z = f; b.userData.wings[1].rotation.z = -f;
    }
    flock.position.addScaledVector(up, dt * 2.5);
  });
  await g.wait(1.4);
  W.unhook(lift);
  g.unlock();
  await flight(g, flightArgs);
}

/** Prende um objeto na mão (ou nas costas) do avatar. */
export function carry(W, obj, where = 'hand') {
  const b = W.avatar;
  obj.removeFromParent();
  if (where === 'hand') {
    b.arms[1].userData.hand.add(obj);
    obj.position.set(0, -0.08, 0.1);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(0.8 / b.spec.scale);
  } else {
    b.body.add(obj);
    obj.position.set(0, 0.55, -0.35);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(0.55);
  }
  return obj;
}

/** Posição (vetor unitário) mais próxima do jogador entre alvos pendentes. */
export function nearestOf(W, list) {
  let best = null, bd = Infinity;
  for (const n of list) {
    const d = angleBetween(W.ctrl.n, n);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** Entrada padrão de capítulo: cartão sobre o preto e depois aparece a cena. */
export async function opening(g, kicker, title, text, onReveal = null) {
  g.ui.setChapter(title);
  g.world.mode = 'walk';
  g.lock();
  await g.ui.fade(1, 10);
  await g.ui.card(kicker, title, text, 2800);
  if (onReveal) onReveal();
  g.ui.fade(0, 1200);
  await g.wait(0.6);
  g.unlock();
}

export const worldPos = (o) => (o.root || o).getWorldPosition(new THREE.Vector3());

/** Anima por `dur` segundos chamando fn(t de 0 a 1, dt). */
export function tween(g, dur, fn) {
  return new Promise((res) => {
    let t = 0;
    const h = g.world.hook((dt) => {
      t = Math.min(1, t + dt / dur);
      fn(t, dt);
      if (t >= 1) { g.world.unhook(h); res(); }
    });
  });
}
