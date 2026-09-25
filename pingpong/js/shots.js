// Geração de golpes: tipo (loop, drive, bloqueio, push, corte, smash, lob,
// flick), potência, mira e qualidade de contato → velocidade/rotação da bola.
// O efeito da bola recebida atrapalha quem não "lê" o efeito corretamente.
import { TY, L, W, R, clamp, lerp, gauss, rnd } from './const.js';
import { solveShot, spinVector, topspinOf } from './physics.js';

export const KINDS = {
  smash: { label: 'SMASH', speed: [11, 15.5], top: [20, 60], risk: 0.075, depth: [0.55, 1], color: '#f87171' },
  loop:  { label: 'TOPSPIN', speed: [7.2, 11.5], top: [150, 290], risk: 0.05, depth: [0.5, 1], color: '#fb923c' },
  drive: { label: 'DRIVE', speed: [6.2, 9], top: [50, 110], risk: 0.04, depth: [0.45, 0.95], color: '#fbbf24' },
  block: { label: 'BLOQUEIO', speed: [5, 7.5], top: [10, 40], risk: 0.035, depth: [0.4, 0.9], color: '#a3e635' },
  push:  { label: 'PUSH', speed: [3.8, 5.4], top: [-120, -60], risk: 0.03, depth: [0.2, 0.8], color: '#38bdf8' },
  chop:  { label: 'CORTE', speed: [4.8, 6.8], top: [-260, -150], risk: 0.035, depth: [0.55, 1], color: '#818cf8' },
  lob:   { label: 'BALÃO', speed: [4.2, 5.8], top: [70, 140], risk: 0.06, depth: [0.7, 1], color: '#c084fc' },
  flick: { label: 'FLICK', speed: [6, 8], top: [60, 120], risk: 0.05, depth: [0.5, 1], color: '#f472b6' },
};

// quanto cada golpe sofre com o efeito recebido (topspin chegando / backspin chegando)
const SPIN_SENS = {
  smash: [0.35, 1.0], loop: [0.3, 0.25], drive: [0.6, 1.0], block: [1.0, 1.0],
  push: [1.3, 0.2], chop: [0.2, 0.3], lob: [0.3, 0.4], flick: [0.6, 0.6],
};

/**
 * p: { ball, side (0|1), kind, power 0..1, aimX -1.3..1.3, depth 0..1|null,
 *      quality 0..1, spinRead 0..1, consistency (1 = normal, <1 melhor),
 *      side spin (rad/s) }
 */
export function makeShot(p) {
  const b = p.ball;
  let kind = p.kind;
  const hAbove = b.y - TY;
  // Não dá para cortar de cima uma bola baixa
  if (kind === 'smash' && hAbove < 0.16) kind = 'loop';
  // Bola abaixo do tampo: só levantando
  if (hAbove < -0.05 && (kind === 'smash' || kind === 'drive' || kind === 'block')) kind = 'lob';
  const K = KINDS[kind];
  const power = clamp(p.power, 0, 1);
  const sign = p.side === 0 ? -1 : 1;             // lado 0 bate para -z
  const incomingTop = topspinOf(b);                // + topspin, - backspin (relativo ao voo)
  const incomingSpeed = Math.hypot(b.vx, b.vy, b.vz);

  let speed = lerp(K.speed[0], K.speed[1], power);
  let top = lerp(K.top[0], K.top[1], power);
  if (kind === 'block') { speed = clamp(incomingSpeed * 0.62 + 1.5, 4.5, 9.5); top = clamp(incomingTop * 0.25, -40, 90); }
  const depth = p.depth ?? lerp(K.depth[0], K.depth[1], 0.35 + power * 0.65);

  let tx = clamp(p.aimX, -1.3, 1.3) * (W - 0.07);
  let tz = sign * (0.28 + clamp(depth, 0, 1.08) * (L - 0.33));

  // erro: contato ruim + risco do golpe + dificuldade da bola recebida
  const difficulty = clamp((incomingSpeed - 6) / 10, 0, 1) * 0.5 + clamp(Math.abs(incomingTop) / 300, 0, 1) * 0.35;
  const sigma = ((1 - clamp(p.quality, 0, 1)) * 0.16 + K.risk * (0.6 + power * 0.8) + difficulty * 0.06) * (p.consistency ?? 1);
  tx += gauss() * sigma * 0.9;
  tz += gauss() * sigma * 0.75;

  const sidespin = p.sidespin ?? 0;
  const spin = spinVector(tx - b.x, tz - b.z, top, sidespin);
  const from = { x: b.x, y: b.y, z: b.z };
  const v = solveShot(from, spin, tx, tz, speed, kind === 'smash' ? 0.015 : 0.03);

  // efeito recebido mal lido
  const sens = SPIN_SENS[kind][incomingTop >= 0 ? 0 : 1];
  const mis = clamp(incomingTop / 300, -1.1, 1.1) * (1 - clamp(p.spinRead ?? 0.5, 0, 1)) * sens;
  v.vy += mis * 1.0;
  const hs = 1 + mis * 0.1;
  v.vx *= hs; v.vz *= hs;

  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.wx = spin.wx; b.wy = spin.wy; b.wz = spin.wz;
  return {
    kind, label: K.label, color: K.color,
    kmh: Math.hypot(v.vx, v.vy, v.vz) * 3.6,
    top, power, target: { x: tx, z: tz }, misread: mis,
  };
}

// Escolha do golpe do jogador a partir do gesto (velocidade do ponteiro)
export function kindFromSwing(fy, ball, paddleZ, sideSign) {
  const hAbove = ball.y - TY;
  const incomingTop = topspinOf(ball);
  const far = Math.abs(paddleZ) > L + 0.75;
  if (fy > 2.6 && hAbove > 0.22) return 'smash';
  if (fy > 1.7) return 'loop';
  if (fy > 0.7) return hAbove < 0.02 ? 'loop' : 'drive';
  if (fy < -0.9) return far || hAbove > 0.25 ? 'chop' : 'push';
  // gesto neutro: escolha "inteligente"
  if (incomingTop < -60) return 'push';
  if (hAbove < -0.02) return 'lob';
  return 'block';
}
