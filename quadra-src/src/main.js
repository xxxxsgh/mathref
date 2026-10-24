// ═══════════════════════════════════════════════════════════════════════════
// QUADRA VIVA — ponto de entrada no navegador.
// Liga simulação (sim/), passo fixo (loop.js), render (render/), entrada,
// áudio e HUD. Parâmetros de URL úteis para testes:
//   ?q=low|medium|high  qualidade      ?auto=1  começa direto (sem menu)
//   ?human=-1           IA × IA        ?half=1  minutos por tempo
//   ?debug=1            modo de teste  ?seed=N  partida reproduzível
// ═══════════════════════════════════════════════════════════════════════════
import './ui/styles.css';
import { CONFIG, VENUES } from './config.js';
import { FixedStep } from './loop.js';
import { Match } from './sim/match.js';
import { TEAMS } from './sim/teams.js';
import { BallState, GEO } from './sim/ball.js';
import { laneClearance, shotAim, shotErrorDeg } from './sim/actions.js';
import { DEG } from './sim/math.js';
import { Scene3D } from './render/scene.js';
import { Input } from './input/input.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = params.get('q') || (coarse ? 'medium' : 'high');

const scene = new Scene3D(document.getElementById('app'), quality);
const input = new Input();
const audio = new Audio();
const hud = new Hud(document.getElementById('ui'), input);

const S = {
  match: null,
  loop: null,
  opts: null,
  paused: false,
  debug: params.get('debug') === '1',
  ballPrev: { x: 0, y: CONFIG.ball.radius, z: 0 },
  excite: 0,
  fps: 0,
  stepsLast: 0,
  landing: null,
};
window.__qv = S; // para testes e2e e depuração no console

function startMatch(opts) {
  S.opts = opts;
  hud.clearScreen();
  hud.show(true);
  const human = opts.human ?? 0;
  S.match = new Match({
    home: TEAMS[opts.home ?? 0],
    away: TEAMS[opts.away ?? 1],
    venue: opts.venue || 'ginasio',
    human,
    assist: opts.assist || 'assistido',
    halfMinutes: Number(opts.half ?? CONFIG.match.halfMinutes),
    seed: params.has('seed') ? Number(params.get('seed')) : undefined,
  });
  S.match.debug = S.debug;
  scene.build(S.match);
  S.ballPrev = { ...S.match.ball.pos };
  S.loop = new FixedStep(CONFIG.sim.dt, CONFIG.sim.maxStepsPerFrame, (dt) => {
    const m = S.match;
    S.ballPrev = { ...m.ball.pos };
    m.step(dt, input.snapshot());
  });
  S.paused = false;
  input.enabled = true;
  audio.start(VENUES[opts.venue || 'ginasio'].crowd);
}

function togglePause() {
  if (!S.match || S.match.phase === 'end') return;
  S.paused = !S.paused;
  if (S.paused) {
    hud.pause(
      () => togglePause(),
      () => startMatch(S.opts),
      () => {
        S.match = null;
        hud.menu(startMatch);
      },
      () => toggleDebug(),
      S.debug,
    );
  } else {
    hud.clearScreen();
    S.loop.reset();
  }
}

function toggleDebug() {
  S.debug = !S.debug;
  if (S.match) S.match.debug = S.debug;
}

input.onSystem = (what) => {
  if (what === 'pause') togglePause();
  else if (what === 'debug') toggleDebug();
  else if (what === 'camera') scene.toggleZoom();
};
hud.onPause = togglePause;
hud.onDebug = toggleDebug;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.match && !S.paused && S.match.phase !== 'end') togglePause();
});

function vibrate(p) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* sem vibração */
  }
}

/** Eventos da simulação → som, vibração, rede, câmera. */
function handleEvents(m) {
  const human = m.human;
  for (const e of m.events) {
    switch (e.type) {
      case 'kick':
        audio.kick(e.speed);
        break;
      case 'shot':
        if (e.player.team === human) vibrate(CONFIG.controls.vibrate.shot);
        S.excite = Math.max(S.excite, 0.3);
        break;
      case 'touch':
      case 'trap':
        audio.touch();
        break;
      case 'bounce':
        audio.bounce(e.vy);
        break;
      case 'post':
        audio.post();
        vibrate(CONFIG.controls.vibrate.post);
        S.excite = Math.max(S.excite, 0.6);
        break;
      case 'net':
        audio.net();
        scene.netHit(e);
        break;
      case 'goalScored':
        audio.goal();
        vibrate(CONFIG.controls.vibrate.goal);
        S.excite = 1.6;
        break;
      case 'save':
        audio.save();
        S.excite = Math.max(S.excite, 0.5);
        break;
      case 'whistle':
        audio.whistle(e.kind === 'end');
        break;
      case 'snap':
        S.ballPrev = { ...m.ball.pos };
        scene.snapCamera(m);
        break;
      case 'end':
        setTimeout(() => {
          if (S.match === m)
            hud.end(
              m,
              () => startMatch(S.opts),
              () => {
                S.match = null;
                hud.menu(startMatch);
              },
            );
        }, 1800);
        break;
    }
  }
  m.events.length = 0;
}

/** Modo de teste: linhas de passe, cone do chute, vetor da bola e texto. */
function debugOverlay(m, ctrl) {
  scene.debugBegin();
  const b = m.ball;
  const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  // vetor de velocidade da bola
  scene.debugLine({ x: b.pos.x, y: b.pos.y, z: b.pos.z }, { x: b.pos.x + b.vel.x * 0.3, y: b.pos.y + b.vel.y * 0.3, z: b.pos.z + b.vel.z * 0.3 }, '#ffffff');
  // trajetória prevista
  const pr = m.pred;
  for (let i = 1; i < pr.length; i += 2) scene.debugLine(pr[i - 1], pr[i], '#5ab0ff');
  const carrier = m.owner || (ctrl && ctrl.cp);
  if (carrier && !carrier.isGK) {
    // linhas de passe: verde = linha livre, vermelho = bloqueada
    for (const t of m.players) {
      if (t === carrier || !t.onCourt || t.team !== carrier.team) continue;
      const lane = laneClearance(m, carrier.team, carrier.pos.x, carrier.pos.z, t.pos.x, t.pos.z);
      scene.debugLine(carrier.pos, t.pos, lane > 1 ? '#3ddc97' : lane > 0.6 ? '#f2c14e' : '#ef476f');
    }
    // cone de erro do chute
    if (m.owner === carrier) {
      const ch = carrier.charge;
      const over = ch && ch.kind === 'shoot' ? ch.over : 0;
      const aim = shotAim(m, carrier, ctrl && ctrl.cp === carrier ? ctrl.dir : null);
      const ang = Math.atan2(aim.z - b.pos.z, aim.x - b.pos.x);
      const err = shotErrorDeg(m, carrier, 'normal', over, ang);
      const L = Math.hypot(aim.x - b.pos.x, aim.z - b.pos.z);
      for (const k of [-1, 0, 1]) {
        const a = ang + k * err * DEG;
        scene.debugLine({ x: b.pos.x, z: b.pos.z }, { x: b.pos.x + Math.cos(a) * L, z: b.pos.z + Math.sin(a) * L }, k ? '#ff9f1c' : '#ffd23f');
      }
    }
  }
  scene.debugEnd();
  const cp = ctrl && ctrl.cp;
  const lines = [
    `bola  ${sp.toFixed(1)} m/s (${(sp * 3.6).toFixed(0)} km/h)  ${b.state}`,
    `      y ${b.pos.y.toFixed(2)} m  giro ${b.spin.toFixed(2)}  dono ${m.owner ? m.owner.name : '—'}`,
    `fase  ${m.phase}${m.restart ? ' / ' + m.restart.type : ''}  vantagem ${m.advantage ? m.advantage.t.toFixed(1) + ' s' : '—'}`,
  ];
  if (cp) {
    lines.push(`você  ${cp.name}  ${cp.speed.toFixed(1)} m/s  ${cp.state}`);
    lines.push(`      fôlego ${cp.stamina.toFixed(0)}  ${cp.stamina < CONFIG.player.stamina.tiredBelow ? 'CANSADO' : ''}${cp.charge ? `  força ${(cp.charge.power * 100).toFixed(0)}%${cp.charge.over ? ' +' + cp.charge.over.toFixed(2) + ' s' : ''}` : ''}`);
  }
  const team = m.players.filter((p) => p.onCourt).map((p) => `${p.team ? 'B' : 'A'}${String(p.num).padStart(2)} ${p.stamina.toFixed(0).padStart(3)}`);
  lines.push(`fôlego ${team.slice(0, 5).join(' ')}`);
  lines.push(`       ${team.slice(5).join(' ')}`);
  lines.push(`fps ${S.fps.toFixed(0)}  passos/quadro ${S.stepsLast}  atraso descartado ${S.loop.dropped.toFixed(2)} s`);
  return lines.join('\n');
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;
  const dt = Math.min(0.1, Math.max(0, now - last / 1000));
  last = nowMs;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    S.fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
  const m = S.match;
  if (!m) return;
  let alpha = 1;
  if (!S.paused) {
    const r = S.loop.frame(now);
    S.stepsLast = r.steps;
    alpha = r.alpha;
    handleEvents(m);
  }
  S.excite = Math.max(0, S.excite - dt * 0.4);
  const ctrl = m.controller;
  // ponto de queda da bola alta (ajuda a achar a bola no ar)
  if (m.ball.state === BallState.AEREA && m.ball.pos.y > 0.6) {
    const pr = m.pred;
    let land = null;
    for (let i = 1; i < pr.length; i++) if (pr[i].y <= CONFIG.ball.radius + 0.02 && pr[i - 1].y > pr[i].y) {
      land = pr[i];
      break;
    }
    S.landing = land;
  } else S.landing = null;
  // tensão da torcida: bola perto de um dos gols
  const tension = Math.max(0, 1 - Math.abs(Math.abs(m.ball.pos.x) - GEO.halfL) / 12);
  audio.frame(dt, m.phase === 'play' ? tension : 0);
  scene.render(m, alpha, dt, {
    ballPrev: S.ballPrev,
    controlled: ctrl ? ctrl.cp : null,
    passTarget: ctrl ? ctrl.preview : null,
    landing: S.landing,
    excite: S.excite,
    debug: S.debug,
  });
  hud.update(m, ctrl, S.debug ? debugOverlay(m, ctrl) : null);
}
requestAnimationFrame(frame);

if (params.get('auto') === '1') {
  startMatch({
    home: 0,
    away: 1,
    venue: params.get('venue') || 'ginasio',
    assist: 'assistido',
    half: Number(params.get('half') || CONFIG.match.halfMinutes),
    human: params.has('human') ? Number(params.get('human')) : 0,
  });
} else hud.menu(startMatch);
