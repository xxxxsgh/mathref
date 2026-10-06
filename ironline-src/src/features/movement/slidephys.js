import { T as DEF } from './tuning.js';

/**
 * Lógica pura do movimento (sem THREE, sem DOM) — testada em
 * `slidephys.test.mjs`. O controlador chama estas funções; tudo recebe a
 * tabela de tuning como último argumento (padrão: tuning.js) para os testes
 * poderem variar números.
 */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Velocidade inicial do slide a partir da velocidade atual (com teto). */
export function slideStartSpeed(cur, { tactical = false, bonus = 0 } = {}, T = DEF) {
  const s = cur + T.slideBoost * (tactical ? 1.25 : 1) + bonus;
  return Math.min(T.slideMaxStart + bonus, s, T.slideMaxSpeed);
}

/**
 * Aceleração ao longo da direção do slide causada pelo declive.
 * `slope` = dh/dx na direção do movimento (negativo = descendo).
 * Retorna m/s² (positivo = acelera).
 */
export function slopeAccel(slope, T = DEF) {
  const s = clamp(slope, -T.slopeMax, T.slopeMax);
  const sin = s / Math.sqrt(1 + s * s);
  return -T.gravity * sin * T.slopeGain;
}

/** Atrito do slide no instante `t` (s), reduzido em descida forte. */
export function slideFrictionAt(t, slope, T = DEF) {
  const base = t < T.slideEarly ? T.slideFrictionEarly : T.slideFriction;
  const down = clamp(-slope / T.slopeMax, 0, 1);
  return base * (1 - T.slopeFrictionCut * down);
}

/** Um passo da velocidade escalar do slide (atrito + rampa), com teto. */
export function stepSlideSpeed(speed, t, slope, dt, T = DEF) {
  const a = slopeAccel(slope, T) - slideFrictionAt(t, slope, T);
  return clamp(speed + a * dt, 0, T.slideMaxSpeed);
}

/** Duração máxima do slide (descida forte estica). */
export function slideMaxTime(slope, T = DEF) {
  return T.slideMaxTime + T.slopeExtend * clamp(-slope / T.slopeMax, 0, 1);
}

/**
 * O slide deve terminar? `lowCeiling` = não caberia agachado (sob obstáculo):
 * nesse caso ele continua (velocidade mínima garantida pelo controlador).
 */
export function slideShouldEnd(speed, t, slope, lowCeiling, T = DEF) {
  if (lowCeiling) return false;
  return speed < T.slideEndSpeed || t > slideMaxTime(slope, T);
}

/** Janela de cancelamento: pulo cancela sempre; agachar só após slideCancelMin. */
export function canCancelSlide(t, how, T = DEF) {
  if (how === 'jump') return true;
  return t >= T.slideCancelMin;
}

/**
 * Velocidade horizontal saindo de um slide-jump: mantém o embalo com teto.
 * Nunca fica abaixo da velocidade de sprint (o pulo não "freia").
 */
export function slideJumpSpeed(slideSpeed, T = DEF) {
  return clamp(slideSpeed * T.slideJumpKeep, Math.min(T.sprint, slideSpeed), T.slideJumpCap);
}

/** Multiplicador de dispersão da arma no slide (entra alto, estabiliza). */
export function slideSpreadAt(t, T = DEF) {
  const u = clamp(t / T.slideSpreadSettle, 0, 1);
  const e = u * u * (3 - 2 * u);
  return T.slideSpreadStart + (T.slideSpreadSettled - T.slideSpreadStart) * e;
}

/**
 * Estamina do sprint tático. Estado { fuel, idle } → novo estado.
 * `active` = tático ligado neste passo. Recarga só depois de `tacRecharge` s.
 */
export function tacStamina(st, dt, active, T = DEF) {
  let { fuel, idle } = st;
  if (active) {
    fuel = Math.max(0, fuel - dt);
    idle = 0;
  } else {
    idle += dt;
    if (idle > T.tacRecharge) fuel = Math.min(T.tacFuel, fuel + T.tacRefill * dt);
  }
  return { fuel, idle, empty: active && fuel <= 0 };
}

/** Dá para entrar no tático com este combustível? */
export function canTacSprint(fuel, T = DEF) {
  return fuel > T.tacMinStart;
}

/** Dois toques de sprint contam como duplo toque? */
export function isDoubleTap(sinceLastTap, T = DEF) {
  return sinceLastTap > 0.02 && sinceLastTap <= T.tacDoubleTap;
}

/**
 * Altura dos olhos montado num apoio de topo `ledgeY` (relativo aos pés).
 * Retorna null se o apoio não serve (alto demais ou baixo demais).
 */
export function mountEye(eye, ledgeH, minEye, T = DEF) {
  const below = eye - ledgeH;
  if (below < T.mountMinBelow - 0.02) return null;
  const target = ledgeH + T.mountAbove;
  if (target > eye + 1e-3) return eye; // já está na altura certa
  if (eye - target > T.mountMaxBelow || target < minEye) return null;
  return target;
}

/** Classifica uma borda pela altura (pés → topo): vault/mantle/hang/none. */
export function ledgeKind(h, airborne, T = DEF) {
  if (h < 0.42) return 'none';
  if (h <= T.vaultMax) return 'vault';
  if (h <= T.mantleMax) return 'mantle';
  if (airborne && h <= T.hangReach) return 'hang';
  return 'none';
}
