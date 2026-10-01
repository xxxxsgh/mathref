/**
 * Condição (float) de uma skin.
 *
 * O float é um número em [0, 1] sorteado quando o item nasce e nunca muda.
 * Ele só decide a APARÊNCIA (ver SkinMaterial.js); o combate não o lê.
 */
export const WEAR_TIERS = /** @type {const} */ ([
  { id: 'FN', name: 'Factory New', label: 'Nova de Fábrica', min: 0.0, max: 0.07, color: '#7cf3c2' },
  { id: 'MW', name: 'Minimal Wear', label: 'Pouco Usada', min: 0.07, max: 0.15, color: '#a8e86a' },
  { id: 'FT', name: 'Field-Tested', label: 'Testada em Campo', min: 0.15, max: 0.38, color: '#f1d45b' },
  { id: 'WW', name: 'Well-Worn', label: 'Bem Desgastada', min: 0.38, max: 0.45, color: '#f19a4b' },
  { id: 'BS', name: 'Battle-Scarred', label: 'Veterana de Guerra', min: 0.45, max: 1.0, color: '#ef5b5b' },
]);

/**
 * Categoria de desgaste para um float. Os limites são semiabertos
 * ([min, max)), exceto o último, que inclui 1.0.
 * @param {number} f
 */
export function wearTier(f) {
  const v = Math.min(1, Math.max(0, f));
  for (const t of WEAR_TIERS) if (v < t.max) return t;
  return WEAR_TIERS[WEAR_TIERS.length - 1];
}

/** Float formatado como nos jogos do gênero: 0.0123456789 → "0.012345678". */
export function formatFloat(f) {
  return f.toFixed(9);
}

/**
 * Regiões de contato da arma e quanto cada uma desgasta além da base.
 * São a "surfaceWearMask" da fórmula:
 *
 *   wearIntensity = baseWear(float) + ruído(seed) + surfaceWearMask(região, quina, gradiente)
 *
 * Áreas que a mão, o coldre ou o atrito tocam o tempo todo gastam primeiro.
 */
export const WEAR_ZONES = {
  bladeEdge: 1.0,
  grip: 0.8,
  trigger: 0.85,
  magazine: 0.7,
  slide: 0.7, // partes móveis
  bolt: 0.75,
  muzzle: 0.6,
  guard: 0.6,
  stock: 0.45,
  body: 0.22,
  barrel: 0.35,
  rail: 0.5,
  flat: 0.12, // superfícies protegidas (laterais largas, interior)
};
