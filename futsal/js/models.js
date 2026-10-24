// Jogadores low-poly com textura pixelada. A cena é renderizada em baixa
// resolução, então caixas simples viram "sprites" de pixel art na tela.
// Todas as animações são procedurais (rotação das juntas).
import * as THREE from 'three';
import { drawKitTexture, SKIN_TONES, HAIR_COLS } from './data.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GEO = {
  torso: box(0.44, 0.55, 0.25),
  head: box(0.26, 0.27, 0.26),
  hair: box(0.28, 0.09, 0.28),
  sleeve: box(0.13, 0.2, 0.13),
  arm: box(0.1, 0.34, 0.1),
  shorts: box(0.44, 0.24, 0.27),
  thigh: box(0.14, 0.36, 0.15),
  sock: box(0.13, 0.36, 0.14),
  shoe: box(0.15, 0.09, 0.27),
  glove: box(0.13, 0.12, 0.13),
};
Object.values(GEO).forEach((g) => g.translate(0, 0, 0));

const matCache = new Map();
function lambert(color) {
  const key = 'c' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(key);
}

function texMat(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t });
}

const SHOE_COLS = ['#f8fafc', '#111827', '#ef4444', '#f59e0b', '#22d3ee'];

export function buildPlayerModel(player, kit, isGK) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.9;
  root.add(body);

  const shirtMat = texMat(drawKitTexture(kit, player.number));
  const sleeveMat = lambert(kit.shirt);
  const skin = lambert(SKIN_TONES[player.skin % 4]);
  const hairM = lambert(HAIR_COLS[player.hair % 5]);
  const shortsM = lambert(kit.shorts);
  const sockM = lambert(kit.socks);
  const shoeM = lambert(SHOE_COLS[(player.number || 0) % SHOE_COLS.length]);

  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  add(body, GEO.torso, shirtMat, 0, 0.32, 0);
  add(body, GEO.shorts, shortsM, 0, -0.02, 0);
  const head = new THREE.Group();
  head.position.y = 0.6;
  body.add(head);
  add(head, GEO.head, skin, 0, 0.13, 0);
  if (player.hair !== 3 || player.age < 30) add(head, GEO.hair, hairM, 0, 0.29, -0.01);

  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.29, 0.56, 0);
    body.add(a);
    add(a, GEO.sleeve, sleeveMat, 0, -0.08, 0);
    add(a, GEO.arm, isGK ? sleeveMat : skin, 0, -0.32, 0);
    if (isGK) add(a, GEO.glove, lambert('#f8fafc'), 0, -0.52, 0);
    arms.push(a);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.11, -0.08, 0);
    body.add(l);
    add(l, GEO.thigh, skin, 0, -0.16, 0);
    add(l, GEO.sock, sockM, 0, -0.5, 0);
    add(l, GEO.shoe, shoeM, 0, -0.78, 0.05);
    legs.push(l);
  }
  root.scale.setScalar(1.15);
  root.userData = { body, head, arms, legs, phase: Math.random() * 6 };
  return root;
}

// Ângulo de direção (x = cos, z = sin) para rotação Y do modelo (frente = +z).
export const facingToRotY = (a) => Math.atan2(Math.cos(a), Math.sin(a));

// Aplica a pose conforme o estado do jogador. `p` é um jogador da partida
// (ou um quadro do replay com os mesmos campos).
export function posePlayer(model, p, dt) {
  const u = model.userData;
  const { body, arms, legs, head } = u;
  model.position.set(p.x, 0, p.z);
  model.rotation.y = facingToRotY(p.facing);
  const sp = p.speed || 0;
  u.phase += dt * (3 + sp * 2.1);
  const ph = u.phase;

  // pose neutra
  body.position.set(0, 0.9, 0);
  body.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  for (const a of arms) a.rotation.set(0, 0, 0);
  for (const l of legs) l.rotation.set(0, 0, 0);

  const t = p.animT || 0;
  switch (p.anim) {
    case 'kick': {
      const k = Math.min(1, t / 0.3);
      const swing = k < 0.45 ? (k / 0.45) * 1.1 : 1.1 - ((k - 0.45) / 0.55) * 2.5;
      legs[1].rotation.x = swing;
      legs[0].rotation.x = -0.15;
      arms[0].rotation.x = -swing * 0.5; arms[0].rotation.z = -0.5;
      arms[1].rotation.z = 0.4;
      body.rotation.x = k > 0.45 ? 0.12 : -0.08;
      break;
    }
    case 'pass': {
      const k = Math.min(1, t / 0.22);
      const swing = k < 0.4 ? (k / 0.4) * 0.6 : 0.6 - ((k - 0.4) / 0.6) * 1.3;
      legs[1].rotation.x = swing;
      legs[1].rotation.y = -0.5;
      arms[0].rotation.z = -0.35; arms[1].rotation.z = 0.35;
      break;
    }
    case 'slide': {
      body.position.y = 0.42;
      body.rotation.x = -1.15;
      legs[1].rotation.x = -0.3; legs[0].rotation.x = 0.5;
      arms[0].rotation.x = -0.6; arms[1].rotation.x = 1.2;
      break;
    }
    case 'fall': {
      const k = Math.min(1, t / 0.35);
      body.position.y = 0.9 - 0.72 * k;
      body.rotation.x = (p.fallDir || 1) * 1.45 * k;
      arms[0].rotation.x = -1.4 * k; arms[1].rotation.x = -1.6 * k;
      break;
    }
    case 'dive': {
      const k = Math.min(1, t / 0.25);
      const s = p.diveSide || 1;
      const air = Math.sin(Math.min(1, t / 0.6) * Math.PI) * 0.35 * (p.diveHigh ? 1.6 : 1);
      body.position.y = 0.9 - 0.45 * k + air;
      body.rotation.z = -s * 1.35 * k;
      arms[0].rotation.z = s > 0 ? 0 : -2.6 * k; arms[1].rotation.z = s > 0 ? 2.6 * k : 0;
      arms[0].rotation.x = -0.5 * k; arms[1].rotation.x = -0.5 * k;
      legs[0].rotation.z = -0.25 * s; legs[1].rotation.z = -0.25 * s;
      break;
    }
    case 'hold': {
      arms[0].rotation.x = -1.3; arms[1].rotation.x = -1.3;
      arms[0].rotation.z = 0.25; arms[1].rotation.z = -0.25;
      runLegs(legs, ph, sp);
      break;
    }
    case 'throw': {
      const k = Math.min(1, t / 0.35);
      arms[1].rotation.x = k < 0.5 ? -3.0 * (k / 0.5) : -3.0 + (k - 0.5) * 4.5;
      arms[0].rotation.x = -0.6;
      body.rotation.x = k > 0.5 ? 0.15 : -0.1;
      break;
    }
    case 'tackle': {
      const k = Math.min(1, t / 0.3);
      legs[1].rotation.x = -1.0 * Math.sin(k * Math.PI);
      body.rotation.x = 0.25 * Math.sin(k * Math.PI);
      arms[0].rotation.z = -0.6; arms[1].rotation.z = 0.6;
      body.position.y = 0.9 - 0.12 * Math.sin(k * Math.PI);
      break;
    }
    case 'celebrate': {
      const j = Math.abs(Math.sin(t * 7));
      body.position.y = 0.9 + j * 0.3;
      arms[0].rotation.z = -2.7; arms[1].rotation.z = 2.7;
      arms[0].rotation.x = Math.sin(t * 14) * 0.3; arms[1].rotation.x = -Math.sin(t * 14) * 0.3;
      legs[0].rotation.x = -j * 0.4; legs[1].rotation.x = j * 0.2;
      break;
    }
    case 'sad': {
      body.rotation.x = 0.35;
      head.rotation.x = 0.5;
      arms[0].rotation.z = -0.1; arms[1].rotation.z = 0.1;
      break;
    }
    case 'shield': {
      body.position.y = 0.82;
      body.rotation.x = 0.2;
      arms[0].rotation.z = -0.9; arms[1].rotation.z = 0.9;
      runLegs(legs, ph, sp * 0.6);
      break;
    }
    case 'skill': {
      const k = Math.min(1, t / 0.35);
      legs[1].rotation.x = -0.9 * Math.sin(k * Math.PI);
      legs[1].rotation.z = 0.4 * Math.sin(k * Math.PI * 2);
      arms[0].rotation.z = -0.8; arms[1].rotation.z = 0.8;
      body.rotation.z = 0.2 * Math.sin(k * Math.PI * 2);
      break;
    }
    case 'ready': { // goleiro em posição de expectativa
      body.position.y = 0.78;
      body.rotation.x = 0.25;
      legs[0].rotation.z = -0.25; legs[1].rotation.z = 0.25;
      legs[0].rotation.x = -0.3; legs[1].rotation.x = -0.3;
      arms[0].rotation.z = -0.7; arms[1].rotation.z = 0.7;
      arms[0].rotation.x = -0.6; arms[1].rotation.x = -0.6;
      if (sp > 0.5) { legs[0].rotation.z += Math.sin(ph) * 0.2; legs[1].rotation.z -= Math.sin(ph) * 0.2; }
      break;
    }
    default: { // correr / parado
      if (sp > 0.3) {
        runLegs(legs, ph, sp);
        const a = Math.min(1, sp / 6) * 0.9;
        arms[0].rotation.x = Math.sin(ph) * a; arms[1].rotation.x = -Math.sin(ph) * a;
        arms[0].rotation.z = -0.12; arms[1].rotation.z = 0.12;
        body.rotation.x = Math.min(0.28, sp * 0.035);
        body.position.y = 0.9 + Math.abs(Math.sin(ph)) * 0.05 * Math.min(1, sp / 4);
      } else {
        const br = Math.sin(ph * 0.5) * 0.015;
        body.position.y = 0.9 + br;
        arms[0].rotation.z = -0.1; arms[1].rotation.z = 0.1;
      }
    }
  }
}

function runLegs(legs, ph, sp) {
  const a = Math.min(1, sp / 6) * 0.95;
  legs[0].rotation.x = -Math.sin(ph) * a;
  legs[1].rotation.x = Math.sin(ph) * a;
}

// Bola low-poly com gomos pixelados.
export function buildBall() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 32, 16);
  g.fillStyle = '#1e293b';
  for (const [x, y] of [[2, 3], [10, 9], [18, 3], [26, 9], [6, 13], [22, 13], [14, 0]]) g.fillRect(x, y, 4, 3);
  g.fillStyle = '#facc15';
  for (const [x, y] of [[6, 6], [22, 6], [14, 11]]) g.fillRect(x, y, 3, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshLambertMaterial({ map: t, flatShading: true }));
  return m;
}
