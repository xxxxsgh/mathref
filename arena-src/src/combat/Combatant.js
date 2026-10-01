import * as THREE from 'three';
import { rayBox } from '../world/Collision.js';
import { WEAPONS } from '../weapons/WeaponData.js';

/**
 * Qualquer coisa que leva tiro e luta: o jogador, os bots e os alvos de
 * treino. Guarda corpo físico, vida, colete, armas e estatísticas.
 */

export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.25;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.12;

export const TEAM_NAMES = ['VANGUARD', 'EMBER'];
export const TEAM_COLORS = [0x2fd3c4, 0xff7a3d];
export const TEAM_CSS = ['#2fd3c4', '#ff7a3d'];

/**
 * @typedef {Object} WeaponState
 * @property {import('../weapons/WeaponData.js').WeaponDef} def
 * @property {number} ammo
 * @property {number} reserve
 * @property {any} [item] item do inventário (skin) — só visual
 */

/** @param {string} id @param {any} [item] @returns {WeaponState} */
export function makeWeaponState(id, item = null) {
  const def = WEAPONS[id];
  return { def, ammo: def.mag, reserve: def.reserve, item };
}

let nextId = 1;

export class Combatant {
  /**
   * @param {{ name: string, team: number, isBot?: boolean, isTarget?: boolean }} o
   */
  constructor(o) {
    this.id = nextId++;
    this.name = o.name;
    this.team = o.team;
    this.isBot = !!o.isBot;
    this.isTarget = !!o.isTarget;
    this.body = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      halfW: 0.3,
      height: STAND_HEIGHT,
      grounded: false,
      stepHeight: 0.42,
    };
    this.yaw = 0;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
    /** 0 em pé … 1 agachado (suavizado) */
    this.crouch = 0;
    this.crouching = false;
    this.money = 800;
    /** @type {{ primary: WeaponState|null, secondary: WeaponState|null, melee: WeaponState }} */
    this.weapons = { primary: null, secondary: makeWeaponState('pistol'), melee: makeWeaponState('knife') };
    /** @type {'primary'|'secondary'|'melee'} */
    this.slot = 'secondary';
    this.stats = { kills: 0, deaths: 0, assists: 0, damage: 0, headshots: 0, score: 0 };
    /** dano recebido por atacante neste round (para assistências) */
    /** @type {Map<number, number>} */
    this.damageFrom = new Map();
    this.lastDamageTime = -10;
    this.spawnProtect = 0;
  }

  get weapon() {
    return this.weapons[this.slot] || this.weapons.melee;
  }

  /** Altura dos olhos suavizada pelo agachamento. */
  eyeHeight() {
    return EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouch;
  }

  /** @param {THREE.Vector3} out */
  eye(out) {
    return out.set(this.body.pos.x, this.body.pos.y + this.eyeHeight(), this.body.pos.z);
  }

  /** Direção de mira (yaw/pitch → vetor). Yaw 0 olha para -Z. */
  aimDir(out, yaw = this.yaw, pitch = this.pitch) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  /**
   * Teste de raio contra as hitboxes. Fase larga (caixa envolvente) antes
   * das quatro hitboxes, então raios que passam longe custam um teste só.
   * @returns {{ t: number, group: string }|null}
   */
  rayTest(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.alive) return null;
    const p = this.body.pos;
    const s = 1 + (CROUCH_HEIGHT / STAND_HEIGHT - 1) * this.crouch;
    const H = STAND_HEIGHT * s;
    BROAD.minX = p.x - 0.35;
    BROAD.maxX = p.x + 0.35;
    BROAD.minZ = p.z - 0.35;
    BROAD.maxZ = p.z + 0.35;
    BROAD.minY = p.y;
    BROAD.maxY = p.y + H + 0.05;
    if (rayBox(ox, oy, oz, dx, dy, dz, BROAD, maxT) < 0) return null;

    let best = maxT;
    let group = '';
    // cabeça: esfera
    const hy = p.y + 1.63 * s;
    const hx = p.x;
    const hz = p.z;
    const r = 0.145;
    const lx = ox - hx;
    const ly = oy - hy;
    const lz = oz - hz;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - r * r;
    const disc = b * b - c;
    if (disc >= 0) {
      const t = -b - Math.sqrt(disc);
      if (t >= 0 && t < best) {
        best = t;
        group = 'head';
      }
    }
    // tronco e pernas: AABBs
    const parts = [
      ['chest', 1.18 * s, 1.5 * s, 0.24],
      ['stomach', 0.9 * s, 1.18 * s, 0.22],
      ['legs', 0, 0.9 * s, 0.2],
    ];
    for (const [g, y0, y1, w] of parts) {
      BOX.minX = p.x - w;
      BOX.maxX = p.x + w;
      BOX.minZ = p.z - w;
      BOX.maxZ = p.z + w;
      BOX.minY = p.y + y0;
      BOX.maxY = p.y + y1;
      const t = rayBox(ox, oy, oz, dx, dy, dz, BOX, best);
      if (t >= 0 && t < best) {
        best = t;
        group = g;
      }
    }
    return group ? { t: best, group } : null;
  }

  resetForRound() {
    this.health = 100;
    this.alive = true;
    this.crouch = 0;
    this.crouching = false;
    this.body.vel.set(0, 0, 0);
    this.body.height = STAND_HEIGHT;
    this.damageFrom.clear();
    this.spawnProtect = 0;
  }
}

const BROAD = /** @type {any} */ ({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
const BOX = /** @type {any} */ ({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
