// Parâmetros de voo por classe de nave e constantes do modelo de voo.
//
// Unidades: m, s, m/s, m/s², rad/s. Acelerações são do conjunto de
// propulsores (já divididas pela massa) — o modelo trabalha direto com elas.
//
// Velocidades de referência (escala do jogo, ver CONTRACT.md):
//   SCM (combate)       ~250 m/s no caça
//   pós-combustor       ~560 m/s (consome combustível de boost, esquenta)
//   cruzeiro            proporcional à altitude (até centenas de km/s)
//   quântico            ~2.000 km/s entre corpos do sistema
//   salto               entre sistemas, alcance em anos-luz

export const CLASSES = {
  fighter: {
    label: 'Caça leve', mass: 22e3,
    scm: 250, boostMax: 560, reverse: 0.45, strafe: 0.55,
    accel: { fwd: 78, back: 52, lat: 56, vert: 60 },
    boostAccel: 1.9,
    rates: { pitch: 1.75, yaw: 1.2, roll: 3.1 }, angAccel: { pitch: 9, yaw: 7, roll: 16 },
    boost: { drain: 0.17, regen: 0.085, delay: 1.2, heat: 0.07 },
    quantum: { spool: 4.0, speed: 2.0e6, accelTime: 2.6, fuelPerMm: 0.006 },
    jump: { range: 82, charge: 2.6 },
    cruise: { max: 3.2e5, spool: 1.6 },
    aero: { cd: 0.24, area: 26, lift: 0.9, wing: 34, stability: 1.2 },
    gearSpeed: 140, landMaxV: 4.2, landMaxH: 6, maxSlope: 0.42,
    hullHp: 1, shieldHp: 1, heatDissip: 0.07, belly: 1.3,
  },
  interceptor: {
    label: 'Interceptador', mass: 18e3,
    scm: 290, boostMax: 680, reverse: 0.4, strafe: 0.5,
    accel: { fwd: 92, back: 50, lat: 60, vert: 62 },
    boostAccel: 2.1,
    rates: { pitch: 1.9, yaw: 1.3, roll: 3.6 }, angAccel: { pitch: 10, yaw: 8, roll: 18 },
    boost: { drain: 0.2, regen: 0.09, delay: 1.0, heat: 0.08 },
    quantum: { spool: 3.6, speed: 2.1e6, accelTime: 2.4, fuelPerMm: 0.007 },
    jump: { range: 72, charge: 2.4 },
    cruise: { max: 3.4e5, spool: 1.4 },
    aero: { cd: 0.2, area: 22, lift: 1.0, wing: 30, stability: 1.4 },
    gearSpeed: 150, landMaxV: 4.0, landMaxH: 6, maxSlope: 0.4,
    hullHp: 0.85, shieldHp: 0.9, heatDissip: 0.075, belly: 1.2,
  },
  explorer: {
    label: 'Explorador de longo alcance', mass: 60e3,
    scm: 220, boostMax: 470, reverse: 0.5, strafe: 0.5,
    accel: { fwd: 58, back: 42, lat: 40, vert: 46 },
    boostAccel: 1.7,
    rates: { pitch: 1.1, yaw: 0.85, roll: 1.9 }, angAccel: { pitch: 5, yaw: 4, roll: 8 },
    boost: { drain: 0.12, regen: 0.08, delay: 1.5, heat: 0.05 },
    quantum: { spool: 4.4, speed: 2.2e6, accelTime: 3.0, fuelPerMm: 0.004 },
    jump: { range: 140, charge: 2.8 },
    cruise: { max: 3.6e5, spool: 1.8 },
    aero: { cd: 0.3, area: 48, lift: 0.7, wing: 60, stability: 1.0 },
    gearSpeed: 120, landMaxV: 4.5, landMaxH: 5, maxSlope: 0.4,
    hullHp: 1.3, shieldHp: 1.2, heatDissip: 0.08, belly: 1.8,
  },
  freighter: {
    label: 'Cargueiro', mass: 180e3,
    scm: 180, boostMax: 360, reverse: 0.5, strafe: 0.45,
    accel: { fwd: 36, back: 28, lat: 24, vert: 30 },
    boostAccel: 1.5,
    rates: { pitch: 0.6, yaw: 0.45, roll: 0.9 }, angAccel: { pitch: 2.2, yaw: 1.8, roll: 3.2 },
    boost: { drain: 0.1, regen: 0.07, delay: 2.0, heat: 0.05 },
    quantum: { spool: 5.5, speed: 1.8e6, accelTime: 3.4, fuelPerMm: 0.005 },
    jump: { range: 92, charge: 3.2 },
    cruise: { max: 2.6e5, spool: 2.2 },
    aero: { cd: 0.45, area: 140, lift: 0.4, wing: 0, stability: 0.6 },
    gearSpeed: 90, landMaxV: 3.5, landMaxH: 4, maxSlope: 0.32,
    hullHp: 2.4, shieldHp: 1.8, heatDissip: 0.06, belly: 2.6,
  },
  frigate: {
    label: 'Fragata', mass: 900e3,
    scm: 150, boostMax: 280, reverse: 0.5, strafe: 0.35,
    accel: { fwd: 22, back: 16, lat: 12, vert: 14 },
    boostAccel: 1.4,
    rates: { pitch: 0.32, yaw: 0.26, roll: 0.45 }, angAccel: { pitch: 0.9, yaw: 0.7, roll: 1.2 },
    boost: { drain: 0.08, regen: 0.06, delay: 2.5, heat: 0.04 },
    quantum: { spool: 7, speed: 1.7e6, accelTime: 4, fuelPerMm: 0.004 },
    jump: { range: 110, charge: 3.6 },
    cruise: { max: 2.2e5, spool: 3 },
    aero: { cd: 0.5, area: 600, lift: 0.3, wing: 0, stability: 0.4 },
    gearSpeed: 70, landMaxV: 3, landMaxH: 3, maxSlope: 0.25,
    hullHp: 6, shieldHp: 5, heatDissip: 0.05, belly: 6,
  },
};

/** Constantes globais do modelo. */
export const K = {
  STEP: 1 / 60,
  RHO0: 1.2,                // densidade do ar no nível do mar (kg/m³) quando density=1
  REENTRY_V: 340,           // m/s em que o plasma começa a aparecer (ar fino)
  REENTRY_FULL: 1500,       // m/s com plasma pleno
  ATMO_SPEED_CAP: 1.0,      // fator: no ar denso o SCM cai (arrasto)
  CRUISE_ALT_RATE: 0.32,    // velocidade de cruzeiro = altitude × isto (s⁻¹)
  CRUISE_MIN: 1600,         // m/s mínimo do cruzeiro
  QUANTUM_MIN_DIST: 1.2e5,  // m — mais perto que isso não vale o quântico
  STATION_STANDOFF: 9000,
  POI_STANDOFF: 3500,
  GEAR_AUTO_RETRACT: 70,    // m acima do chão
  LAND_ASSIST_ALT: 140,     // m: abaixo disso com trem baixado o pouso assistido nivela
  SOI_HYST: 0.04,           // histerese ao entrar/sair da SOI
  PIPS_TOTAL: 6, PIP_MAX: 4,
};

/** Distribuições de energia predefinidas (teclas 4/5 percorrem). */
export const POWER_PRESETS = [
  { id: 'balanced', label: 'EQUILIBRADO', sys: 2, eng: 2, wep: 2 },
  { id: 'attack', label: 'ATAQUE', sys: 1.5, eng: 1, wep: 3.5 },
  { id: 'evade', label: 'EVASÃO', sys: 2.5, eng: 3.5, wep: 0 },
  { id: 'tank', label: 'BLINDADO', sys: 4, eng: 1, wep: 1 },
  { id: 'travel', label: 'VIAGEM', sys: 1, eng: 4, wep: 1 },
];

export function classParams(id) { return CLASSES[id] || CLASSES.fighter; }
