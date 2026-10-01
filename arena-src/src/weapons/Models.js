import * as THREE from 'three';
import { createSkinMaterial, bakePartMatrices } from '../skins/SkinMaterial.js';

/**
 * Modelos low-poly procedurais das armas e das mãos.
 *
 * Convenção do espaço da arma: frente = -Z, cima = +Y, direita = +X,
 * origem no ponto de empunhadura (onde a mão direita segura). Cada peça
 * carrega a sua ZONA de desgaste (cabo, gatilho, carregador, quinas…) — é
 * isso que permite ao shader gastar mais onde a mão encosta.
 */

/** Materiais fixos (sem skin), compartilhados entre todas as armas. */
const M = {
  steelDark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.85, roughness: 0.42 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 1, roughness: 0.25 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0, roughness: 0.75 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x0d2236, metalness: 0.4, roughness: 0.05, emissive: 0x0a2a40, emissiveIntensity: 0.6 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.05, roughness: 0.85 }),
  gloveKnuckle: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.6 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x39414b, metalness: 0, roughness: 0.92 }),
  sight: new THREE.MeshBasicMaterial({ color: 0x7dff9e }),
};

/** Cache de materiais "simples" (bots e terceira pessoa), por cor. */
const plainCache = new Map();
function plainMat(color, metal = 0.3, rough = 0.55) {
  const k = `${color}|${metal}|${rough}`;
  let m = plainCache.get(k);
  if (!m) plainCache.set(k, (m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough })));
  return m;
}

/**
 * Construtor de peças. Peças "skin" recebem material procedural se houver
 * instância de skin; senão (bots), um material liso na cor da skin.
 */
class Builder {
  /**
   * @param {import('../skins/SkinMaterial.js').SkinInstance|null} inst
   * @param {boolean} plain
   */
  constructor(inst, plain) {
    this.inst = inst;
    this.plain = plain || !inst;
    this.root = new THREE.Group();
  }

  /**
   * @param {THREE.BufferGeometry} geo
   * @param {string|THREE.Material} paint 'base' | 'accent' | material fixo
   * @param {import('../skins/SkinMaterial.js').PartWear|null} wear
   * @param {THREE.Object3D} [parent]
   */
  mesh(geo, paint, wear, parent = this.root) {
    let mat;
    if (typeof paint !== 'string') mat = paint;
    else if (this.plain) {
      const s = this.inst?.skin;
      mat = plainMat(s ? (paint === 'accent' ? s.accent : s.base) : paint === 'accent' ? '#2a2e33' : '#454b52');
    } else mat = createSkinMaterial(/** @type {any} */ (this.inst), { zone: 'body', ...wear, layer: /** @type {any} */ (paint) });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    parent.add(m);
    return m;
  }

  /** Caixa com desgaste de quina. */
  box(w, h, d, x, y, z, paint, zone = 'body', parent = this.root, edge = 0.006) {
    const m = this.mesh(new THREE.BoxGeometry(w, h, d), paint, { zone, edgeMode: 1, half: [w / 2, h / 2, d / 2], edgeWidth: edge }, parent);
    m.position.set(x, y, z);
    return m;
  }

  /** Cilindro deitado ao longo de Z. */
  cyl(r, len, x, y, z, paint, zone = 'barrel', parent = this.root, seg = 12) {
    const m = this.mesh(new THREE.CylinderGeometry(r, r, len, seg), paint, { zone, edgeMode: 2, half: [r, len / 2, r], edgeWidth: 0.004 }, parent);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  }
}

/**
 * @typedef {Object} WeaponModel
 * @property {THREE.Group} root
 * @property {THREE.Object3D} muzzle   ponta do cano (flash, tracer)
 * @property {THREE.Object3D} eject    janela de ejeção (cápsulas)
 * @property {THREE.Object3D|null} mag   carregador (animação de recarga)
 * @property {THREE.Object3D|null} slide ferrolho/corrediça (recuo no tiro)
 * @property {THREE.Vector3} leftHand  onde apoia a mão esquerda (null = sem)
 * @property {number} length
 */

/**
 * @param {string} type
 * @param {import('../skins/SkinMaterial.js').SkinInstance|null} inst
 * @param {{ plain?: boolean }} [opts]
 * @returns {WeaponModel}
 */
export function buildWeaponModel(type, inst, opts = {}) {
  const b = new Builder(inst, !!opts.plain);
  /** @type {WeaponModel} */
  let model;
  switch (type) {
    case 'knife':
      model = buildKnife(b);
      break;
    case 'smg':
      model = buildSmg(b);
      break;
    case 'dmr':
      model = buildDmr(b);
      break;
    case 'pistol':
      model = buildPistol(b, false);
      break;
    case 'heavy':
      model = buildPistol(b, true);
      break;
    default:
      model = buildRifle(b);
  }
  if (!b.plain) bakePartMatrices(model.root);
  return model;
}

function anchor(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** VX-9 Corsair — fuzil de assalto. */
function buildRifle(b) {
  const r = b.root;
  b.box(0.058, 0.085, 0.36, 0, 0.032, -0.07, 'base', 'body');
  b.box(0.032, 0.014, 0.32, 0, 0.082, -0.07, 'accent', 'rail', r, 0.004);
  for (let i = 0; i < 8; i++) b.box(0.036, 0.006, 0.012, 0, 0.092, -0.2 + i * 0.035, M.steelDark);
  b.box(0.064, 0.07, 0.27, 0, 0.026, -0.37, 'base', 'body');
  for (let i = 0; i < 3; i++) b.box(0.066, 0.012, 0.04, 0, 0.03, -0.29 - i * 0.07, M.polymer);
  b.cyl(0.012, 0.2, 0, 0.03, -0.6, M.steelDark);
  b.box(0.032, 0.032, 0.07, 0, 0.03, -0.72, 'accent', 'muzzle', r, 0.005);
  const mag = new THREE.Group();
  mag.position.set(0, -0.02, -0.13);
  r.add(mag);
  const m1 = b.box(0.034, 0.1, 0.066, 0, -0.05, 0, 'accent', 'magazine', mag);
  m1.rotation.x = 0.12;
  const m2 = b.box(0.034, 0.06, 0.062, 0, -0.12, 0.016, 'accent', 'magazine', mag);
  m2.rotation.x = 0.3;
  b.box(0.04, 0.012, 0.072, 0, -0.155, 0.03, M.steelDark, 'magazine', mag).rotation.x = 0.3;
  const grip = b.box(0.034, 0.11, 0.046, 0, -0.06, 0.03, 'accent', 'grip');
  grip.rotation.x = -0.32;
  b.box(0.008, 0.01, 0.075, 0, -0.03, -0.035, M.steelDark, 'trigger');
  b.box(0.007, 0.03, 0.008, 0, -0.015, -0.03, 'base', 'trigger', r, 0.003);
  b.box(0.044, 0.078, 0.22, 0, 0.012, 0.21, 'base', 'stock');
  b.box(0.048, 0.09, 0.025, 0, 0.008, 0.33, M.polymer);
  b.box(0.05, 0.013, 0.022, 0.03, 0.07, 0.08, 'base', 'bolt', r, 0.004);
  b.box(0.002, 0.026, 0.05, 0.03, 0.045, -0.03, M.steelDark);
  b.box(0.018, 0.03, 0.02, 0, 0.105, 0.06, M.steelDark);
  b.box(0.006, 0.028, 0.006, 0, 0.11, -0.47, M.steelDark);
  b.box(0.003, 0.003, 0.003, 0, 0.125, -0.47, M.sight);
  return {
    root: r,
    muzzle: anchor(r, 0, 0.03, -0.76),
    eject: anchor(r, 0.034, 0.045, -0.03),
    mag,
    slide: null,
    leftHand: new THREE.Vector3(-0.005, -0.01, -0.36),
    length: 1.1,
  };
}

/** Wasp-11 — submetralhadora compacta. */
function buildSmg(b) {
  const r = b.root;
  b.box(0.054, 0.08, 0.3, 0, 0.03, -0.08, 'base', 'body');
  b.box(0.03, 0.012, 0.18, 0, 0.076, -0.1, 'accent', 'rail', r, 0.004);
  b.cyl(0.022, 0.16, 0, 0.03, -0.31, 'accent', 'barrel', r, 10);
  b.cyl(0.01, 0.06, 0, 0.03, -0.41, M.steelDark);
  const fg = b.box(0.026, 0.07, 0.03, 0, -0.035, -0.25, 'accent', 'grip');
  fg.rotation.x = 0.1;
  const mag = new THREE.Group();
  mag.position.set(0, -0.01, -0.1);
  r.add(mag);
  b.box(0.026, 0.15, 0.04, 0, -0.075, 0, 'base', 'magazine', mag);
  b.box(0.03, 0.01, 0.044, 0, -0.152, 0, M.steelDark, 'magazine', mag);
  const grip = b.box(0.032, 0.1, 0.044, 0, -0.055, 0.03, 'accent', 'grip');
  grip.rotation.x = -0.25;
  b.box(0.007, 0.008, 0.06, 0, -0.025, -0.03, M.steelDark, 'trigger');
  b.box(0.006, 0.026, 0.007, 0, -0.012, -0.025, 'base', 'trigger', r, 0.003);
  // coronha de arame dobrável
  b.box(0.006, 0.006, 0.2, 0.02, 0.05, 0.16, M.steelDark);
  b.box(0.006, 0.006, 0.2, -0.02, 0.05, 0.16, M.steelDark);
  b.box(0.046, 0.06, 0.01, 0, 0.03, 0.26, 'base', 'stock');
  b.box(0.04, 0.012, 0.02, 0.028, 0.06, 0.02, 'base', 'bolt', r, 0.004);
  b.box(0.016, 0.024, 0.016, 0, 0.09, 0.03, M.steelDark);
  b.box(0.005, 0.022, 0.005, 0, 0.09, -0.21, M.steelDark);
  return {
    root: r,
    muzzle: anchor(r, 0, 0.03, -0.45),
    eject: anchor(r, 0.03, 0.045, -0.06),
    mag,
    slide: null,
    leftHand: new THREE.Vector3(0, -0.02, -0.25),
    length: 0.8,
  };
}

/** Lancer DMR — semiautomático com luneta. */
function buildDmr(b) {
  const r = b.root;
  b.box(0.06, 0.088, 0.42, 0, 0.032, -0.08, 'base', 'body');
  b.box(0.058, 0.064, 0.38, 0, 0.026, -0.48, 'base', 'body');
  b.cyl(0.013, 0.32, 0, 0.03, -0.82, M.steelDark);
  b.box(0.036, 0.036, 0.08, 0, 0.03, -1.0, 'accent', 'muzzle', r, 0.005);
  // luneta
  b.cyl(0.024, 0.26, 0, 0.13, -0.1, 'accent', 'rail', r, 16);
  b.cyl(0.03, 0.05, 0, 0.13, -0.25, 'accent', 'rail', r, 16);
  b.cyl(0.028, 0.04, 0, 0.13, 0.04, 'accent', 'rail', r, 16);
  b.cyl(0.026, 0.004, 0, 0.13, -0.277, M.lens, 'flat', r, 16);
  b.box(0.02, 0.03, 0.02, 0, 0.095, -0.17, M.steelDark);
  b.box(0.02, 0.03, 0.02, 0, 0.095, -0.02, M.steelDark);
  const mag = new THREE.Group();
  mag.position.set(0, -0.02, -0.14);
  r.add(mag);
  b.box(0.036, 0.08, 0.075, 0, -0.04, 0, 'accent', 'magazine', mag);
  b.box(0.04, 0.01, 0.08, 0, -0.082, 0, M.steelDark, 'magazine', mag);
  const grip = b.box(0.035, 0.11, 0.046, 0, -0.06, 0.03, 'accent', 'grip');
  grip.rotation.x = -0.3;
  b.box(0.008, 0.01, 0.075, 0, -0.03, -0.035, M.steelDark, 'trigger');
  b.box(0.007, 0.03, 0.008, 0, -0.015, -0.03, 'base', 'trigger', r, 0.003);
  b.box(0.05, 0.095, 0.26, 0, 0.0, 0.24, 'base', 'stock');
  b.box(0.04, 0.03, 0.14, 0, 0.06, 0.22, 'accent', 'stock');
  b.box(0.054, 0.1, 0.025, 0, -0.005, 0.38, M.polymer);
  b.box(0.05, 0.014, 0.024, 0.032, 0.07, 0.07, 'base', 'bolt', r, 0.004);
  return {
    root: r,
    muzzle: anchor(r, 0, 0.03, -1.05),
    eject: anchor(r, 0.034, 0.045, -0.04),
    mag,
    slide: null,
    leftHand: new THREE.Vector3(0, -0.012, -0.42),
    length: 1.4,
  };
}

/** Kite P9 (leve) / Brawler .50 (pesada). */
function buildPistol(b, heavy) {
  const r = b.root;
  const s = heavy ? 1.18 : 1;
  const slide = new THREE.Group();
  r.add(slide);
  b.box(0.03 * s, 0.034 * s, 0.19 * s, 0, 0.045 * s, -0.07 * s, 'base', 'slide', slide);
  for (let i = 0; i < 5; i++) b.box(0.032 * s, 0.024 * s, 0.003, 0, 0.045 * s, 0.0 + i * 0.006 - 0.005, M.steelDark, 'slide', slide);
  b.box(0.012, 0.006, 0.008, 0, 0.066 * s, -0.15 * s, M.steelDark, 'slide', slide);
  b.box(0.003, 0.003, 0.003, 0, 0.07 * s, -0.15 * s, M.sight, 'slide', slide);
  b.box(0.018, 0.01, 0.01, 0, 0.066 * s, 0.015 * s, M.steelDark, 'slide', slide);
  if (heavy) b.box(0.034, 0.028, 0.04, 0, 0.045 * s, -0.19 * s, 'accent', 'muzzle', slide, 0.004);
  b.box(0.028 * s, 0.022 * s, 0.16 * s, 0, 0.016 * s, -0.06 * s, 'accent', 'body');
  b.box(0.01, 0.008, 0.07 * s, 0, 0.004, -0.11 * s, M.steelDark, 'rail');
  const grip = b.box(0.03 * s, 0.105 * s, 0.045 * s, 0, -0.04 * s, 0.025 * s, 'accent', 'grip');
  grip.rotation.x = -0.26;
  const mag = new THREE.Group();
  mag.position.set(0, -0.09 * s, 0.035 * s);
  mag.rotation.x = -0.26;
  r.add(mag);
  b.box(0.032 * s, 0.012, 0.05 * s, 0, 0, 0, M.steelDark, 'magazine', mag);
  b.box(0.007, 0.009, 0.055 * s, 0, -0.012 * s, -0.03 * s, M.steelDark, 'trigger');
  b.box(0.006, 0.022, 0.006, 0, 0.0, -0.02 * s, 'base', 'trigger', r, 0.003);
  b.cyl(0.006 * s, 0.01, 0, 0.045 * s, -0.168 * s, M.steelDark);
  return {
    root: r,
    muzzle: anchor(r, 0, 0.045 * s, -0.19 * s - (heavy ? 0.04 : 0)),
    eject: anchor(r, 0.02, 0.055 * s, -0.04),
    mag,
    slide,
    leftHand: null,
    length: 0.3,
  };
}

/** TALON-K — faca. Origem no centro da empunhadura. */
function buildKnife(b) {
  const r = b.root;
  const k = new THREE.Group();
  k.position.z = -0.045;
  r.add(k);
  // Lâmina: perfil 2D extrudado (comprimento em x, altura em y, espessura em z)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.011);
  shape.lineTo(0.06, 0.0125);
  shape.quadraticCurveTo(0.075, 0.016, 0.085, 0.013); // entalhe de dorso
  shape.lineTo(0.12, 0.012);
  shape.quadraticCurveTo(0.155, 0.009, 0.182, -0.002); // ponta
  shape.quadraticCurveTo(0.16, -0.017, 0.12, -0.02); // barriga
  shape.quadraticCurveTo(0.07, -0.021, 0.035, -0.016); // recurva
  shape.quadraticCurveTo(0.022, -0.01, 0.014, -0.016); // choil
  shape.lineTo(0, -0.014);
  shape.lineTo(0, 0.011);
  const thick = 0.0035;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -thick / 2);
  const blade = b.mesh(geo, 'base', { zone: 'flat', edgeMode: 0, maskDir: [3.2, -32, 0], maskBias: 0.18 }, k);
  blade.rotation.y = Math.PI / 2; // comprimento → -Z
  // sulco (fuller) dos dois lados
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.0035, 0.07), M.steelDark);
    f.position.set(sx * (thick / 2 + 0.0011), 0.004, -0.075);
    k.add(f);
  }
  // guarda
  b.box(0.014, 0.05, 0.01, 0, -0.004, 0.004, 'accent', 'guard', k, 0.003);
  b.box(0.012, 0.012, 0.016, 0, -0.026, -0.002, 'accent', 'guard', k, 0.003);
  // cabo com anéis de pegada
  b.box(0.021, 0.028, 0.105, 0, -0.002, 0.062, 'accent', 'grip', k, 0.005);
  for (let i = 0; i < 4; i++) b.box(0.023, 0.03, 0.006, 0, -0.002, 0.03 + i * 0.022, M.gloveKnuckle, 'grip', k);
  // pomo + argola
  b.box(0.025, 0.033, 0.018, 0, -0.002, 0.122, 'base', 'guard', k, 0.004);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 6, 14), M.steel);
  ring.position.set(0, -0.004, 0.136);
  ring.rotation.y = Math.PI / 2;
  k.add(ring);
  return {
    root: r,
    muzzle: anchor(r, 0, 0, -0.22),
    eject: anchor(r, 0, 0, 0),
    mag: null,
    slide: null,
    leftHand: null,
    length: 0.32,
  };
}

/**
 * Braço + luva em primeira pessoa.
 *
 * A mão (`hand`) é um subgrupo com origem no centro do punho fechado: os
 * dedos atravessam a frente de um cabo vertical de ~3 cm. Para a faca (cabo
 * horizontal) a viewmodel só gira esse subgrupo 90°.
 * @param {number} teamColor
 * @param {boolean} left
 * @returns {{ group: THREE.Group, hand: THREE.Group, forearm: THREE.Group }}
 */
export function buildArm(teamColor, left = false) {
  const group = new THREE.Group();
  const s = left ? -1 : 1;
  const forearm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.066, 0.34), M.sleeve);
  sleeve.position.set(0, 0, 0.24);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.069, 0.069, 0.02), plainMat(teamColor, 0.1, 0.6));
  band.position.set(0, 0, 0.12);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.056, 0.06), M.glove);
  cuff.position.set(0, 0, 0.07);
  forearm.add(sleeve, band, cuff);
  group.add(forearm);

  const hand = new THREE.Group();
  // dorso/palma do lado de fora do cabo
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.075, 0.062), M.glove);
  palm.position.set(s * 0.026, -0.008, 0.006);
  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.07, 0.018), M.gloveKnuckle);
  knuckles.position.set(s * 0.018, -0.008, -0.03);
  hand.add(palm, knuckles);
  // dedos: atravessam a frente do cabo, empilhados na vertical
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.016, 0.018), M.glove);
    f.position.set(-s * 0.002, 0.018 - i * 0.0175, -0.034);
    hand.add(f);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.015, 0.03), M.gloveKnuckle);
    tip.position.set(-s * 0.026, f.position.y, -0.022);
    hand.add(tip);
  }
  // polegar por cima, do lado de dentro
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.017, 0.05), M.glove);
  thumb.position.set(-s * 0.012, 0.032, -0.014);
  thumb.rotation.set(0.25, s * 0.35, 0);
  hand.add(thumb);
  group.add(hand);
  return { group, hand, forearm };
}

export const SHARED_MATERIALS = M;
