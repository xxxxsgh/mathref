// Dados do combate: armas, atributos por classe, personalidade de IA por
// facção, cores dos disparos e hostilidade padrão entre facções.
//
// Unidades: metros, segundos. Dano em "pontos" (casco de um caça ≈ 100).

/** Cores HDR lineares dos disparos de energia por facção (núcleo é sempre quase branco). */
export const BOLT_COLORS = {
  hegemonia: [1.0, 0.66, 0.2],
  frente: [1.0, 0.26, 0.09],
  corsarios: [0.95, 0.2, 1.0],
  guilda: [0.25, 1.0, 0.75],
  vigilantes: [0.45, 0.85, 1.0],
  player: [1.0, 0.66, 0.2],
  ion: [0.35, 0.65, 1.0],
  kinetic: [1.0, 0.78, 0.5],
  flak: [1.0, 0.55, 0.25],
};

/**
 * Armas. kind: energy | kinetic | ion | flak | heavy.
 *  speed (m/s), range (m), damage (pontos), rof (tiros/s), heat (por tiro, 0..1),
 *  spread (rad), length/width (visual, m), shieldMul/hullMul (eficácia)
 */
export const WEAPONS = {
  laser: { id: 'laser', label: 'CANHÃO DE LASER', kind: 'energy', speed: 1750, range: 2400, damage: 9, rof: 7.5, heat: 0.028, spread: 0.0016, length: 42, width: 1.2, intensity: 11, shieldMul: 1.25, hullMul: 0.85 },
  massa: { id: 'massa', label: 'CANHÃO DE MASSA', kind: 'kinetic', speed: 2600, range: 3200, damage: 15, rof: 4.2, heat: 0.04, spread: 0.0012, length: 40, width: 0.6, intensity: 9, shieldMul: 0.7, hullMul: 1.35 },
  ion: { id: 'ion', label: 'CANHÃO DE ÍONS', kind: 'ion', speed: 1500, range: 2000, damage: 5, rof: 3, heat: 0.05, spread: 0.002, length: 18, width: 1.4, intensity: 30, shieldMul: 3.2, hullMul: 0.25, disable: 1 },
  pd: { id: 'pd', label: 'DEFESA DE PONTO', kind: 'flak', speed: 1500, range: 2600, damage: 4, rof: 9, heat: 0, spread: 0.012, length: 16, width: 0.7, intensity: 16, shieldMul: 1, hullMul: 1, flak: 26 },
  heavy: { id: 'heavy', label: 'CANHÃO PESADO', kind: 'heavy', speed: 1050, range: 6000, damage: 80, rof: 0.55, heat: 0, spread: 0.003, length: 70, width: 4.2, intensity: 34, shieldMul: 1, hullMul: 1.1 },
  pulso: { id: 'pulso', label: 'PULSO ANTIGO', kind: 'energy', speed: 2300, range: 2800, damage: 9, rof: 6, heat: 0.02, spread: 0.0008, length: 30, width: 0.7, intensity: 34, shieldMul: 1.4, hullMul: 1 },
};

/** Mísseis. seeker: 'ir' (despistado por flares) | 'radar' (por chaff). */
export const MISSILES = {
  ir: { id: 'ir', label: 'MÍSSIL IR', seeker: 'ir', speed0: 260, speed: 720, accel: 420, turn: 3.4, nav: 3.6, life: 9, lockTime: 1.8, range: 3800, damage: 95, blast: 34, fov: 0.32 },
  radar: { id: 'radar', label: 'MÍSSIL RADAR', seeker: 'radar', speed0: 240, speed: 640, accel: 360, turn: 2.6, nav: 3.2, life: 12, lockTime: 2.4, range: 5200, damage: 120, blast: 40, fov: 0.42 },
  torpedo: { id: 'torpedo', label: 'TORPEDO', seeker: 'radar', speed0: 120, speed: 300, accel: 80, turn: 0.6, nav: 2.4, life: 30, lockTime: 3.5, range: 8000, damage: 900, blast: 120, fov: 0.3 },
};

/**
 * Atributos de combate por classe (independem do modelo visual de `ships`).
 *  speed/boost (m/s), accel (m/s²), grip (aderência lateral 0..1: 1 = acoplado),
 *  turn {pitch, yaw, roll} (rad/s), hull/shield (pontos), regen (escudo/s),
 *  weapons (ids), missiles {tipo: qtd}, cm {flare, chaff}, boardable
 */
export const CLASS_STATS = {
  fighter: { speed: 235, boost: 400, accel: 95, grip: 2.4, turn: { pitch: 1.55, yaw: 0.85, roll: 3.4 }, hull: 80, shield: 60, regen: 7, weapons: ['laser', 'laser'], missiles: { ir: 2 }, cm: { flare: 8, chaff: 4 }, boardable: false },
  interceptor: { speed: 285, boost: 470, accel: 120, grip: 2.8, turn: { pitch: 1.95, yaw: 1.0, roll: 4.0 }, hull: 60, shield: 45, regen: 8, weapons: ['laser', 'massa'], missiles: { ir: 2 }, cm: { flare: 10, chaff: 4 }, boardable: false },
  explorer: { speed: 175, boost: 300, accel: 50, grip: 1.4, turn: { pitch: 0.75, yaw: 0.45, roll: 1.4 }, hull: 260, shield: 200, regen: 10, weapons: ['laser', 'laser'], missiles: { radar: 2 }, cm: { flare: 6, chaff: 6 }, boardable: true },
  freighter: { speed: 125, boost: 210, accel: 28, grip: 0.9, turn: { pitch: 0.35, yaw: 0.25, roll: 0.7 }, hull: 620, shield: 320, regen: 12, weapons: ['massa'], missiles: {}, cm: { flare: 6, chaff: 6 }, boardable: true },
  frigate: { speed: 95, boost: 150, accel: 16, grip: 0.7, turn: { pitch: 0.2, yaw: 0.15, roll: 0.35 }, hull: 1700, shield: 900, regen: 20, weapons: ['massa', 'massa'], missiles: { radar: 4 }, cm: { flare: 10, chaff: 10 }, boardable: true },
  destroyer: { speed: 45, boost: 60, accel: 4, grip: 0.4, turn: { pitch: 0.035, yaw: 0.04, roll: 0.05 }, hull: 9000, shield: 4200, regen: 40, weapons: [], missiles: { torpedo: 6 }, cm: {}, boardable: false, capital: true, turretHp: 260 },
  carrier: { speed: 32, boost: 45, accel: 3, grip: 0.4, turn: { pitch: 0.025, yaw: 0.03, roll: 0.04 }, hull: 14000, shield: 6000, regen: 50, weapons: [], missiles: {}, cm: {}, boardable: false, capital: true, turretHp: 220, hangarWave: 4 },
};

/**
 * Personalidade de IA por facção.
 *  discipline: mantém formação/alvo do líder · aggression: persegue até mais perto
 *  accuracy: dispersão da mira · flares: chance de reagir a míssil · missileUse
 *  flee: fração de casco em que foge · pack: ataca todos o mesmo alvo
 *  formation: 'cunha' | 'par' | 'enxame' | 'solto'
 */
export const FACTION_AI = {
  hegemonia: { discipline: 0.92, aggression: 0.6, accuracy: 0.82, flares: 0.85, missileUse: 0.55, flee: 0, pack: false, formation: 'cunha', jink: 0.5, weapons: null },
  frente: { discipline: 0.45, aggression: 0.85, accuracy: 0.64, flares: 0.55, missileUse: 0.4, flee: 0.12, pack: false, formation: 'par', jink: 0.8, weapons: ['massa', 'laser'] },
  corsarios: { discipline: 0.2, aggression: 0.95, accuracy: 0.55, flares: 0.4, missileUse: 0.35, flee: 0.28, pack: true, formation: 'enxame', jink: 1.0, weapons: ['massa', 'massa'] },
  guilda: { discipline: 0.7, aggression: 0.3, accuracy: 0.6, flares: 0.7, missileUse: 0.2, flee: 0.5, pack: false, formation: 'solto', jink: 0.6, weapons: null },
  vigilantes: { discipline: 1, aggression: 1, accuracy: 0.92, flares: 0, missileUse: 0, flee: 0, pack: true, formation: 'cunha', jink: 0.3, weapons: ['pulso', 'pulso'] },
};

/** Hostilidade padrão (pares não listados = neutros). 'player' é o jogador. */
export const DEFAULT_HOSTILE = [
  ['hegemonia', 'frente'],
  ['corsarios', 'hegemonia'], ['corsarios', 'frente'], ['corsarios', 'guilda'], ['corsarios', 'player'],
  ['vigilantes', 'hegemonia'], ['vigilantes', 'frente'], ['vigilantes', 'corsarios'], ['vigilantes', 'guilda'], ['vigilantes', 'player'],
];

export const FACTION_LABEL = {
  hegemonia: 'Hegemonia Solar', frente: 'Frente Livre', corsarios: 'Corsários do Vazio', guilda: 'Guilda dos Mercadores', vigilantes: 'Vigilantes', player: 'Rafael Paoli',
};

/** Indicativos de rádio por facção (nomes dos pilotos de IA). */
export const CALLSIGNS = {
  hegemonia: ['LANÇA', 'ÁGUIA', 'CETRO', 'SOLAR', 'AURIC'],
  frente: ['FAÍSCA', 'BRASA', 'PEDRA', 'VENTO', 'RAIZ'],
  corsarios: ['CORVO', 'NAVALHA', 'GANCHO', 'VÍBORA', 'SUCATA'],
  guilda: ['MERCANTE', 'BALANÇA', 'ÂNCORA'],
  vigilantes: ['—', '—', '—'],
};

/** Orçamento de naves de IA simultâneas por preset de qualidade. */
export const SHIP_BUDGET = { ultra: 44, high: 34, medium: 24, mobile: 14 };
/** Projéteis simultâneos (visual + simulação). */
export const BOLT_BUDGET = { ultra: 900, high: 700, medium: 450, mobile: 260 };
