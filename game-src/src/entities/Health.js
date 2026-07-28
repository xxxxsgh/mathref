import { CONFIG } from '../config.js';

/**
 * Escudo + casco.
 *
 * ═══ POR QUE DUAS CAMADAS ═══
 *
 * Uma barra de vida só produz um combate binário: ou você está bem, ou vai
 * morrer. Escudo regenerável cria um ritmo: você aguenta uma passada, rompe o
 * contato, se recupera, volta. É o loop de tensão-alívio que faz combate
 * aéreo funcionar, e é o motivo de Halo, Everspace e Elite usarem isso.
 *
 * O detalhe que faz funcionar é o ATRASO de regeneração: o escudo só volta
 * depois de alguns segundos SEM levar dano. Sem o atraso, regeneração vira
 * apenas uma barra de vida maior e o ritmo desaparece.
 */
export class Health {
  /** @param {'player'|'enemy'} kind */
  constructor(kind) {
    const C = CONFIG.combat[kind];
    this.kind = kind;
    this.hullMax = C.hullMax;
    this.shieldMax = C.shieldMax;
    this.hull = C.hullMax;
    this.shield = C.shieldMax;
    this.regenRate = C.shieldRegen;
    this.regenDelay = C.shieldRegenDelay;
    this.radius = C.collisionRadius;

    this._sinceDamage = 999;
    this.alive = true;
    this.invulnerable = 0;
    /** Sinalizadores de um frame, lidos pelos efeitos e pela HUD. */
    this.justHitShield = false;
    this.justHitHull = false;
  }

  get shieldPct() { return this.shieldMax > 0 ? this.shield / this.shieldMax : 0; }
  get hullPct() { return this.hull / this.hullMax; }

  /**
   * @param {number} amount
   * @returns {{ destroyed: boolean, absorbedByShield: boolean }}
   */
  applyDamage(amount) {
    if (!this.alive || this.invulnerable > 0) {
      return { destroyed: false, absorbedByShield: this.shield > 0 };
    }
    this._sinceDamage = 0;

    let absorbedByShield = false;
    if (this.shield > 0) {
      absorbedByShield = true;
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      this.justHitShield = true;
    }
    if (amount > 0) {
      this.hull -= amount;
      this.justHitHull = true;
    }

    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      return { destroyed: true, absorbedByShield };
    }
    return { destroyed: false, absorbedByShield };
  }

  /** @param {number} dt */
  update(dt) {
    this.justHitShield = false;
    this.justHitHull = false;
    if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (!this.alive) return;

    this._sinceDamage += dt;
    if (this._sinceDamage >= this.regenDelay && this.shield < this.shieldMax) {
      this.shield = Math.min(this.shieldMax, this.shield + this.regenRate * dt);
    }
  }

  /** Fração 0..1 de quão perto o escudo está de voltar a regenerar.
   *  A HUD usa isso pra mostrar ao jogador quando vale a pena romper contato —
   *  informação sem a qual a mecânica de escudo é invisível. */
  get regenProgress() {
    if (this.shield >= this.shieldMax) return 1;
    return Math.min(1, this._sinceDamage / this.regenDelay);
  }

  reset() {
    this.hull = this.hullMax;
    this.shield = this.shieldMax;
    this.alive = true;
    this._sinceDamage = 999;
    this.justHitShield = false;
    this.justHitHull = false;
  }
}
