import * as THREE from 'three';
import { buildWeaponModel } from '../weapons/Models.js';
import { TEAM_COLORS } from '../combat/Combatant.js';
import { damp } from '../core/Rng.js';

/**
 * Corpo de terceira pessoa (bots e alvos). Low-poly, montado com caixas,
 * animado proceduralmente: passada, agachar, inclinar o tronco com a mira,
 * recuo do tiro e queda ao morrer. Materiais lisos e compartilhados por time.
 */

const mats = new Map();
function mat(color, rough = 0.7, metal = 0.1) {
  const k = `${color}-${rough}-${metal}`;
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class BotModel {
  /**
   * @param {number} team
   * @param {boolean} shadows
   */
  constructor(team, shadows) {
    const tc = TEAM_COLORS[team];
    const suit = mat(team === 0 ? 0x2c3a3f : 0x3f312b, 0.85);
    const armor = mat(team === 0 ? 0x4a5d63 : 0x5e4a3f, 0.6, 0.3);
    const accent = mat(tc, 0.4, 0.2);
    const dark = mat(0x16181b, 0.6, 0.3);
    const visor = new THREE.MeshStandardMaterial({ color: 0x0a0c0f, roughness: 0.1, metalness: 0.6, emissive: tc, emissiveIntensity: 0.55 });

    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.position.y = 0.9;
    this.root.add(this.hips);

    // pernas (pivô no quadril)
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    for (const [leg, x] of [[this.legL, -0.11], [this.legR, 0.11]]) {
      leg.position.set(x, 0, 0);
      leg.add(box(0.15, 0.48, 0.17, suit, 0, -0.24, 0));
      leg.add(box(0.14, 0.44, 0.15, suit, 0, -0.66, 0.01));
      leg.add(box(0.16, 0.08, 0.26, dark, 0, -0.86, -0.04));
      leg.add(box(0.16, 0.12, 0.05, armor, 0, -0.45, -0.1));
      this.hips.add(leg);
    }
    // tronco (pivô na cintura)
    this.torso = new THREE.Group();
    this.torso.position.y = 0.06;
    this.hips.add(this.torso);
    this.torso.add(box(0.42, 0.56, 0.24, suit, 0, 0.3, 0));
    this.torso.add(box(0.46, 0.4, 0.3, armor, 0, 0.36, 0));
    this.torso.add(box(0.47, 0.05, 0.31, accent, 0, 0.2, 0));
    this.torso.add(box(0.3, 0.22, 0.12, dark, 0, 0.12, 0.2));
    // cabeça
    this.head = new THREE.Group();
    this.head.position.y = 0.58;
    this.torso.add(this.head);
    this.head.add(box(0.24, 0.26, 0.26, armor, 0, 0.1, 0));
    this.head.add(box(0.22, 0.08, 0.04, visor, 0, 0.12, -0.13));
    this.head.add(box(0.26, 0.04, 0.28, accent, 0, 0.24, 0));
    // braços segurando a arma
    this.arms = new THREE.Group();
    this.arms.position.set(0, 0.5, 0);
    this.torso.add(this.arms);
    const armR = box(0.11, 0.11, 0.42, suit, 0.2, -0.08, -0.12);
    armR.rotation.x = 0.3;
    const armL = box(0.11, 0.11, 0.46, suit, -0.12, -0.06, -0.26);
    armL.rotation.set(0.2, 0.5, 0);
    this.arms.add(armR, armL);
    this.weaponHolder = new THREE.Group();
    this.weaponHolder.position.set(0.12, -0.12, -0.3);
    this.weaponHolder.scale.setScalar(1.15);
    this.arms.add(this.weaponHolder);
    this.weaponType = '';
    this.muzzle = new THREE.Object3D();

    this.root.traverse((o) => {
      if (/** @type {any} */ (o).isMesh) o.castShadow = shadows;
    });
    this.walk = 0;
    this.deathT = 0;
    this.kick = 0;
    this.crouchSm = 0;
  }

  /** @param {string} type @param {any} skinInst */
  setWeapon(type, skinInst) {
    if (this.weaponType === type) return;
    this.weaponType = type;
    this.weaponHolder.clear();
    const m = buildWeaponModel(type, skinInst, { plain: true });
    this.weaponHolder.add(m.root);
    this.muzzle = m.muzzle;
  }

  fireKick() {
    this.kick = 1;
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number, z: number, yaw: number, pitch: number, speed: number, crouch: number, alive: boolean }} s
   */
  update(dt, s) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;
    if (!s.alive) {
      // queda: tomba para trás e afunda um pouco
      this.deathT = Math.min(1, this.deathT + dt * 2.4);
      const e = 1 - Math.pow(1 - this.deathT, 3);
      this.root.rotation.x = e * 1.45;
      this.root.position.y = s.y + e * 0.12;
      this.legL.rotation.x = this.legR.rotation.x = -e * 0.3;
      return;
    }
    this.deathT = 0;
    this.root.rotation.x = 0;
    this.walk += dt * s.speed * 2.1;
    const amp = Math.min(1, s.speed / 4) * 0.55;
    this.legL.rotation.x = Math.sin(this.walk) * amp;
    this.legR.rotation.x = -Math.sin(this.walk) * amp;
    this.crouchSm = damp(this.crouchSm, s.crouch, 12, dt);
    const c = this.crouchSm;
    this.hips.position.y = 0.9 - c * 0.38 + Math.abs(Math.cos(this.walk)) * 0.03 * amp;
    this.legL.rotation.x += -c * 0.9;
    this.legR.rotation.x += c * 0.4;
    this.torso.rotation.x = s.pitch * 0.55 + c * 0.15;
    this.head.rotation.x = s.pitch * 0.4;
    this.kick = damp(this.kick, 0, 18, dt);
    this.arms.rotation.x = s.pitch * 0.45 + this.kick * 0.12;
    this.arms.position.z = this.kick * 0.04;
  }
}

/** Alvo de treino: placa com silhueta num suporte. */
export class TargetModel {
  constructor() {
    this.root = new THREE.Group();
    const stand = mat(0x30353b, 0.5, 0.6);
    const board = mat(0xe8e1cf, 0.8);
    const ring = mat(0xd8452b, 0.6);
    this.root.add(box(0.06, 0.9, 0.06, stand, 0, 0.45, 0));
    this.root.add(box(0.5, 0.05, 0.5, stand, 0, 0.025, 0));
    this.plate = new THREE.Group();
    this.plate.position.y = 0.9;
    this.root.add(this.plate);
    this.plate.add(box(0.48, 0.62, 0.04, board, 0, 0.31, 0));
    this.plate.add(box(0.26, 0.26, 0.045, board, 0, 0.73, 0));
    this.plate.add(box(0.12, 0.12, 0.05, ring, 0, 0.73, 0));
    this.plate.add(box(0.2, 0.2, 0.05, ring, 0, 0.35, 0));
    this.fallT = 0;
  }

  update(dt, s) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;
    this.fallT = s.alive ? Math.max(0, this.fallT - dt * 3) : Math.min(1, this.fallT + dt * 5);
    this.plate.rotation.x = -this.fallT * 1.5;
  }
}
