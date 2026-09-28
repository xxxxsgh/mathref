// Utilidades compartilhadas pelos capítulos.
import * as THREE from 'three';
import { fbm3, rng, col } from './style.js';
import { kite, tuft, rock } from './props.js';
import { dirLL, angleBetween, tangentTo } from './world.js';
import { flight } from './flight.js';

export { dirLL, angleBetween, tangentTo };

export const SPEAKERS = {
  'Ilo': '#4fc3b0',
  'Vó Brasa': '#ff9a60',
  'Dona Hora': '#f0d890',
  'Maestro Badalo': '#f3c653',
  'Cúmulo': '#c8d8ff',
  'Seu Pinhão': '#d8a070',
  'Faroleira Tuca': '#ff8a80',
  'Tatá': '#d0b0e0',
  'Vidrilho': '#9fe3e0',
  'Dona Espinha': '#9ad08a',
  'Eco': '#c8c0e0',
  'Lanternas': '#ffc870',
  'Musgo': '#b8d890',
};
export const I = 'Ilo';

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

/** A pipa espera no chão: ao interagir, Ilo parte para o próximo mundinho. */
export async function departure(g, n, flightArgs, { label = 'Subir na pipa', objective = 'Voltar para a pipa' } = {}) {
  const W = g.world;
  const k = kite(g.state.kite || 0);
  const holder = new THREE.Group();
  k.position.y = 0.9;
  k.rotation.x = -1.1;
  holder.add(k);
  W.place(holder, n);
  const h = W.hook((dt, t) => { k.userData.update(t); k.rotation.z = Math.sin(t * 1.5) * 0.1; });
  g.ui.addObjective({ id: 'leave', text: objective });
  W.guide = n;
  let go = false;
  W.interact({ at: holder, r: 2, label, act: () => { go = true; } });
  await g.until(() => go);
  W.unhook(h);
  g.ui.check('leave');
  g.sound.sfx('whoosh');
  W.hero.pose = 'raise';
  g.lock();
  let t = 0;
  const up = n.clone().normalize();
  const lift = W.hook((dt) => {
    t += dt;
    holder.position.addScaledVector(up, dt * (1 + t * 3));
    k.userData.update(t * 3);
  });
  await g.wait(1.3);
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
