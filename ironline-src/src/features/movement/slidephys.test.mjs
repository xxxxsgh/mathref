/**
 * Testes da lógica pura do movimento (slide, rampa, cancel, slide-jump,
 * estamina do tático, montar). Importado por tools/unit.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T } from './tuning.js';
import {
  slideStartSpeed,
  slopeAccel,
  slideFrictionAt,
  stepSlideSpeed,
  slideMaxTime,
  slideShouldEnd,
  canCancelSlide,
  slideJumpSpeed,
  slideSpreadAt,
  tacStamina,
  canTacSprint,
  isDoubleTap,
  mountEye,
  ledgeKind,
} from './slidephys.js';

const DT = 1 / 60;
/** Simula um slide no plano/rampa e devolve { dist, time, speed }. */
function simulate(v0, slope, low = false) {
  let s = v0, t = 0, d = 0;
  while (t < 5) {
    s = stepSlideSpeed(s, t, slope, DT);
    if (low) s = Math.max(s, T.slideUnderSpeed);
    t += DT;
    d += s * DT;
    if (slideShouldEnd(s, t, slope, low)) break;
  }
  return { dist: d, time: t, speed: s };
}

test('movement: velocidade de entrada do slide tem teto', () => {
  assert.ok(Math.abs(slideStartSpeed(T.sprint) - (T.sprint + T.slideBoost)) < 1e-9);
  assert.ok(slideStartSpeed(T.tactical, { tactical: true }) > slideStartSpeed(T.tactical));
  assert.equal(slideStartSpeed(50), T.slideMaxStart);
  assert.ok(slideStartSpeed(50, { bonus: 5 }) <= T.slideMaxSpeed);
});

test('movement: slide no plano — atrito baixo no início, termina por tempo/velocidade', () => {
  assert.equal(slideFrictionAt(0.1, 0), T.slideFrictionEarly);
  assert.equal(slideFrictionAt(0.5, 0), T.slideFriction);
  const r = simulate(slideStartSpeed(T.sprint), 0);
  assert.ok(r.time <= T.slideMaxTime + DT + 1e-9, `durou ${r.time}`);
  assert.ok(r.dist > 4 && r.dist < 9, `distância ${r.dist}`);
});

test('movement: rampa — descida acelera e estica o slide, subida encurta', () => {
  assert.equal(slopeAccel(0), 0);
  assert.ok(slopeAccel(-0.3) > 0, 'descida acelera');
  assert.ok(slopeAccel(0.3) < 0, 'subida freia');
  // declive além do máximo é limitado
  assert.equal(slopeAccel(-5), slopeAccel(-T.slopeMax));
  assert.ok(slideMaxTime(-T.slopeMax) > slideMaxTime(0));
  const flat = simulate(8, 0), down = simulate(8, -0.4), up = simulate(8, 0.3);
  assert.ok(down.dist > flat.dist * 1.3, `descida ${down.dist} vs plano ${flat.dist}`);
  assert.ok(up.dist < flat.dist, `subida ${up.dist} vs plano ${flat.dist}`);
  // nunca passa do teto absoluto
  let s = 12;
  for (let i = 0; i < 600; i++) s = stepSlideSpeed(s, 0.1, -T.slopeMax, DT);
  assert.ok(s <= T.slideMaxSpeed + 1e-9);
});

test('movement: teto baixo mantém o slide até sair de baixo', () => {
  assert.equal(slideShouldEnd(0.5, 10, 0, true), false);
  assert.equal(slideShouldEnd(0.5, 10, 0, false), true);
  const r = simulate(3, 0.2, true);
  assert.ok(r.speed >= T.slideUnderSpeed - 1e-9);
});

test('movement: janelas de cancelamento do slide', () => {
  assert.equal(canCancelSlide(0, 'jump'), true, 'pulo cancela a qualquer momento');
  assert.equal(canCancelSlide(T.slideCancelMin * 0.5, 'crouch'), false, 'toque duplo acidental não cancela');
  assert.equal(canCancelSlide(T.slideCancelMin, 'crouch'), true);
});

test('movement: slide-jump mantém embalo com teto', () => {
  assert.equal(slideJumpSpeed(100), T.slideJumpCap);
  const s = slideJumpSpeed(8);
  assert.ok(s <= 8 && s >= 8 * T.slideJumpKeep - 1e-9);
  // nunca abaixo do sprint quando o slide estava mais rápido que ele
  assert.ok(slideJumpSpeed(T.sprint + 0.1) >= T.sprint - 1e-9);
  // slide lento não ganha velocidade ao pular
  assert.ok(slideJumpSpeed(3) <= 3);
});

test('movement: dispersão no slide entra alta e estabiliza', () => {
  assert.equal(slideSpreadAt(0), T.slideSpreadStart);
  assert.ok(Math.abs(slideSpreadAt(10) - T.slideSpreadSettled) < 1e-9);
  assert.ok(slideSpreadAt(T.slideSpreadSettle * 0.5) < T.slideSpreadStart);
  assert.ok(slideSpreadAt(0.1) >= 1);
});

test('movement: estamina do sprint tático', () => {
  let st = { fuel: T.tacFuel, idle: 99 };
  // gasta tudo: vira empty exatamente quando zera
  let t = 0, emptied = false;
  while (t < T.tacFuel + 1) {
    st = tacStamina(st, DT, true);
    t += DT;
    if (st.empty) {
      emptied = true;
      break;
    }
  }
  assert.ok(emptied && Math.abs(t - T.tacFuel) < 0.05, `esvaziou em ${t}`);
  assert.equal(canTacSprint(st.fuel), false);
  // não recarrega antes de tacRecharge
  for (let i = 0; i < Math.floor((T.tacRecharge - 0.1) * 60); i++) st = tacStamina(st, DT, false);
  assert.equal(st.fuel, 0);
  // depois recarrega na taxa tacRefill, até o teto
  for (let i = 0; i < 60; i++) st = tacStamina(st, DT, false);
  assert.ok(st.fuel > 0 && st.fuel < T.tacRefill * 1.01);
  for (let i = 0; i < 60 * 10; i++) st = tacStamina(st, DT, false);
  assert.equal(st.fuel, T.tacFuel);
  assert.equal(canTacSprint(st.fuel), true);
});

test('movement: duplo toque de sprint', () => {
  assert.equal(isDoubleTap(0.15), true);
  assert.equal(isDoubleTap(T.tacDoubleTap + 0.01), false);
  assert.equal(isDoubleTap(0.005), false, 'mesmo passo não conta');
});

test('movement: montar arma — altura dos olhos sobre o apoio', () => {
  const stand = T.stance.stand.eye, crouch = T.stance.crouch.eye;
  // parapeito de 1.2 m em pé: olhos descem para 1.2 + mountAbove
  assert.ok(Math.abs(mountEye(stand, 1.2, crouch) - (1.2 + T.mountAbove)) < 1e-9);
  // apoio acima dos olhos: não monta
  assert.equal(mountEye(stand, stand + 0.1, crouch), null);
  // apoio baixo demais (precisaria deitar): não monta
  assert.equal(mountEye(stand, 0.5, crouch), null);
  // apoio logo abaixo dos olhos: fica onde está
  assert.equal(mountEye(crouch, crouch - T.mountMinBelow, crouch - 0.25), crouch);
});

test('movement: classificação de bordas (vault/mantle/hang)', () => {
  assert.equal(ledgeKind(0.3, false), 'none');
  assert.equal(ledgeKind(1.0, false), 'vault');
  assert.equal(ledgeKind(1.8, false), 'mantle');
  assert.equal(ledgeKind(2.3, false), 'none');
  assert.equal(ledgeKind(2.3, true), 'hang');
  assert.equal(ledgeKind(T.hangReach + 0.1, true), 'none');
});
