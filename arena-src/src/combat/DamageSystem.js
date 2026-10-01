/**
 * Regras de dano: queda por distância, multiplicador por região do corpo,
 * colete e capacete. Funções puras — testáveis sem o jogo rodando.
 */

/** Multiplicadores por região atingida. */
export const HITGROUP = {
  head: 'head',
  chest: 'chest',
  stomach: 'stomach',
  legs: 'legs',
};
const GROUP_MULT = { chest: 1, stomach: 1.25, legs: 0.75 };

/**
 * @typedef {Object} DamageResult
 * @property {number} health  dano no HP
 * @property {number} armor   dano no colete
 * @property {boolean} headshot
 */

/**
 * @param {import('../weapons/WeaponData.js').WeaponDef} weapon
 * @param {number} distance
 * @param {string} group
 * @param {{ armor: number, helmet: boolean }} target
 * @param {number} [baseOverride] dano base alternativo (golpes de faca)
 * @returns {DamageResult}
 */
export function computeDamage(weapon, distance, group, target, baseOverride) {
  let dmg = baseOverride ?? weapon.damage;
  // Queda exponencial: a cada 10 m multiplica por rangeMod.
  dmg *= Math.pow(weapon.rangeMod, distance / 10);
  const headshot = group === HITGROUP.head;
  dmg *= headshot ? weapon.headMult : GROUP_MULT[group] ?? 1;

  // Colete protege tronco; capacete protege cabeça; pernas nunca.
  const armored = target.armor > 0 && (headshot ? target.helmet : group !== HITGROUP.legs);
  if (!armored) return { health: Math.round(dmg), armor: 0, headshot };
  let toHealth = dmg * weapon.armorPen;
  let toArmor = (dmg - toHealth) * 0.5;
  // Colete acabando: o que ele não absorve volta para o HP.
  if (toArmor > target.armor) {
    const frac = target.armor / toArmor;
    toHealth = dmg - (dmg - toHealth) * frac;
    toArmor = target.armor;
  }
  return { health: Math.round(toHealth), armor: Math.round(toArmor), headshot };
}

/**
 * Golpe pelas costas? Compara a direção do golpe com para onde o alvo olha.
 * @param {number} attackerYawToTarget direção atacante→alvo (rad, convenção yaw)
 * @param {number} targetYaw para onde o alvo olha
 */
export function isBackstab(attackerYawToTarget, targetYaw) {
  let d = attackerYawToTarget - targetYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.abs(d) < Math.PI * 0.35;
}
