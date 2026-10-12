// Cenas roteirizadas (async): cada uma recebe o núcleo da história (S) e
// devolve quando termina. Todas aceitam "pular" (S.dir.skip) e terminam num
// estado de jogo consistente.
import * as THREE from 'three/webgpu';
import { chase, custom, ease } from './cinema.js';
import { haldenFrame, buildAuroraCast, startBombardment, LINES } from './opening.js';
import { loopMotion, formationMotion, driftMotion, lookQuat } from './stage.js';
import { ACTS, ENDINGS } from './campaign.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const _q = new THREE.Quaternion();

/** Pose do jogador como provedor (nave do flight ou câmera). */
const playerP = (S) => () => S.playerPose();

// ─── ABERTURA ───────────────────────────────────────────────────────────────
export async function opening(S) {
  const ctx = S.ctx, dir = S.dir, ui = S.ui;
  if (ctx.universe.systemId !== 'halden') ctx.universe.setSystem('halden');
  const fr = haldenFrame(ctx);
  S.frame = fr;
  S.stage.clear();
  S.spawnPlayer(fr.C, fr.q, { vel: fr.F.clone().multiplyScalar(140), throttle: 0.45, enter: false, faction: 'hegemonia' });
  ctx.game.setMode('cinematic', { scene: 'opening' });
  const cast = buildAuroraCast(S, fr);
  S.cast = cast;
  const combat = ctx.services.combat;
  if (combat?.startBattle) {
    try { S.battle = combat.startBattle('aurora', { center: fr.at(700, 0, 0), forward: fr.F, up: fr.U, playerIn: true }); } catch (e) { S.err('aurora', e); }
  }
  S.factions.reset();
  S.music('cinematic', 0.5);
  ui.fade(1, 0); ui.letterbox(1, true);
  ui.showSkip(true);

  // ── cartão do Ato I ──
  const act = ACTS[1];
  ui.card({ kicker: act.kicker, title: act.title, sub: 'Halden · Núcleo Hegemônico · 2387', lines: LINES.intro });
  await dir.wait(1.4);
  for (let i = 0; i < LINES.intro.length; i++) { ui.revealCardLine(i); await dir.wait(3.0); }
  await dir.wait(1.6);
  ui.hideCard();

  // ── plano 1: a proa do Soberano lançando caças, Aurora embaixo ──
  const sob = cast.get('soberano') || playerP(S);
  ui.fade(0, 2.8);
  dir.play(chase(sob, { from: V(-260, 60, -520), to: V(-120, 30, -780), lookFrom: V(0, -40, -300), lookTo: V(0, -20, -420), fov: [34, 30], dur: 9, handheld: 0.0015 }));
  await dir.wait(1.5);
  await S.say('comando', LINES.radioIntro[0][1]);
  await dir.wait(1.2);

  // ── plano 2: o caça do Rafael na cunha, Davi na asa ──
  dir.play(chase(playerP(S), { from: V(-9, 2.2, -16), to: V(-6, 1.4, -11), lookFrom: V(0, 0.5, 0), lookTo: V(0, 0.3, 2), fov: [44, 40], roll: [0.06, 0.02], dur: 7, handheld: 0.003 }));
  await S.say('davi', LINES.radioIntro[1][1]);
  await dir.wait(1.0);

  // ── fim da introdução: cockpit ──
  dir.endSkip();
  ui.hideCard(); ui.fade(0, 0.5); ui.showSkip(false);
  dir.release();
  ctx.game.setMode('ship', { scene: 'opening' });
  ui.letterbox(0);
  S.music('combat', 0.6);
  S.setObjective({ id: 'a1_ordem:0', text: 'Proteja o Soberano — abata os caças da milícia', mission: 'A Ordem' });
  S.kills = 0;
  const chatter = LINES.combat.slice();
  S.stage.after(4, () => { const l = chatter.shift(); if (l) S.radio(l[0], l[1]); }, 8);
  await dir.until(() => S.kills >= 2, ctx.services.combat ? 32 : 18);

  // ── a ordem ──
  const choice = await orderBeat(S);
  // ── a traição ──
  await betrayalBeat(S, choice);
}

/** A ordem de bombardeio: câmera lenta, legendas e a escolha. */
export async function orderBeat(S) {
  const ctx = S.ctx, ui = S.ui, dir = S.dir;
  S.music('tension', 0.8);
  S.slowmo(0.3, 1.2);
  ui.letterbox(0.45);
  S.grade({ saturation: 0.82, contrast: 1.18, vignette: 0.5 });
  S.cockpitMessage('COMANDO SOLAR · CANAL 1 — ORDEM DE BOMBARDEIO', ['ORDEM: BOMBARDEAR AURORA']);
  await S.say(LINES.order[0], LINES.order[1], { hold: true });
  const choice = await S.runDialog('ordem', { keepSubtitle: true });
  S.slowmo(1, 1.5);
  ui.clearSubtitle();
  const after = LINES.afterChoice[choice] || LINES.afterChoice.recusar;
  for (const [who, text] of after) await S.say(who, text);
  S.grade(null);
  S.cockpitMessage(null);
  return choice;
}

/** Rafael vira a nave contra a própria ala. */
export async function betrayalBeat(S, choice) {
  const ctx = S.ctx, ui = S.ui, dir = S.dir, cast = S.cast;
  const flight = ctx.services.flight;
  ctx.game.setMode('cinematic', { scene: 'betrayal' });
  ui.letterbox(1);
  S.music('combat', 1);
  ui.showSkip(true);
  // manobra: rolagem e curva fechada sobre a ala
  try { flight?.setInputOverride?.({ pitch: -0.55, yaw: 0.25, roll: 0.9, strafeX: 0, strafeY: 0, throttle: 1, boost: true }); } catch { /* */ }
  const l8 = cast?.actors?.lanca8, l6 = cast?.actors?.davi;
  // Lança-8 se separa da formação à frente do Rafael
  if (l8?.alive) {
    const P0 = S.playerPose();
    const base = P0.pos.clone();
    const F = V(0, 0, -1).applyQuaternion(P0.quat), U = V(0, 1, 0).applyQuaternion(P0.quat);
    l8.motion = loopMotion({ center: () => base.addScaledVector(F, 140 / 60), e1: F, e2: U.clone().applyAxisAngle(F, 0.5), R: 140, w: 0.5, phase: 0.6, wobble: 12 });
    l8.fire = null;
  }
  S.defect(choice);
  const target = l8?.alive ? () => l8 : (cast?.get('lanca8') || playerP(S));
  // tiros do Rafael (cenográficos) sobre o Lança-8
  const shooter = S.stage.after(0.5, () => S.playerShoot(target, l8), 0.12);
  // plano A: atrás e abaixo do Rafael, mira no Lança-8, Soberano ao fundo
  dir.play(chase(playerP(S), { from: V(4.5, -1.6, 14), to: V(3.2, -1.0, 10), lookFrom: V(0, 0.5, -60), lookTo: V(0, 0.2, -80), fov: [46, 42], roll: [-0.05, 0.08], dur: 3.4, handheld: 0.006 }));
  await S.say('davi', LINES.betrayal[0][1]);
  try { flight?.setInputOverride?.({ pitch: -0.15, yaw: 0.1, roll: 0, throttle: 1, boost: true }); } catch { /* */ }
  if (l8?.alive) {
    S.stage.after(0.4, () => { if (l8.alive) l8.explode(26); S.kills++; });
  }
  // plano B: lateral, a lança orbital acende e desce sobre Aurora
  if (cast) S.beams = startBombardment(S, cast);
  const inf = cast?.get('inflexivel');
  if (inf) {
    dir.play(custom(4.8, (u) => {
      const p = S.playerPose(), s = inf();
      const toS = s.pos.clone().sub(p.pos);
      const side = new THREE.Vector3().crossVectors(toS, S.frame.U).normalize();
      const pos = p.pos.clone().addScaledVector(side, -26 - 8 * u).addScaledVector(S.frame.U, 6).addScaledVector(toS.clone().normalize(), -30 + 10 * u);
      const look = p.pos.clone().lerp(s.pos, 0.18 + 0.12 * u);
      return { pos, look, up: S.frame.U, fov: 50 - 6 * u, focus: p.pos };
    }, { handheld: 0.004 }));
  }
  await S.say('varela', LINES.betrayal[1][1]);
  shooter.dead = true; S.stage.timers = S.stage.timers.filter((t) => t !== shooter);
  try { flight?.setInputOverride?.(null); } catch { /* */ }
  dir.endSkip();
  ui.showSkip(false);
  dir.release();
  ctx.game.setMode('ship', { scene: 'betrayal' });
  ui.letterbox(0);
  S.radio('rafael', LINES.betrayal[2][1]);
  // Davi e as esquadrilhas viram caçadores (palco, sem combat)
  S.huntPlayer();
}

// ─── CHEGADA EM KESSA ───────────────────────────────────────────────────────
export function arrivalPose(ctx, sys = ctx.universe.system) {
  const ver = sys.bodies.find((b) => b.name === 'Verídia');
  const toS = sys.star.pos.clone().sub(ver.pos).normalize();
  // chegada a ~2,6 raios do centro, lado diurno em crescente largo
  const up = V(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(toS, up).normalize();
  const dir = toS.clone().multiplyScalar(-0.25).addScaledVector(side, 0.95).addScaledVector(up, 0.18).normalize();
  const pos = ver.pos.clone().addScaledVector(dir, ver.radius * 2.6);
  const look = ver.pos.clone().sub(pos).normalize().addScaledVector(side, -0.28).normalize();
  return { pos, look, ver, toS, side, up };
}

export async function arrival(S) {
  const ctx = S.ctx, ui = S.ui, dir = S.dir;
  const flight = ctx.services.flight;
  S.stage.clear();
  ctx.game.setMode('cinematic', { scene: 'arrival' });
  ui.letterbox(1, true);
  ui.showSkip(true);
  S.music('cinematic', 0.7);
  try { flight?.hit?.(0); } catch { /* */ }
  const escorts = spawnFrenteEscort(S);
  // plano A: à frente da nave, olhando para trás — Verídia e a nebulosa ao fundo
  dir.play(arrivalShot(S, 8.5));
  ui.location('KESSA', 'FENDA DE ÓRION · ESPAÇO LIVRE');
  await dir.wait(2.6);
  const choice = await S.runDialog('contato');
  void choice;
  dir.endSkip();
  ui.showSkip(false);
  dir.release();
  ctx.game.setMode('ship', { scene: 'arrival' });
  ui.letterbox(0);
  S.music('explore', 0.4);
  // escolta se afasta depois de um tempo
  S.stage.after(14, () => { for (const e of escorts) { if (!e.alive) continue; const v = e.fwd(new THREE.Vector3()).multiplyScalar(260); e.motion = driftMotion(v); S.stage.after(12, () => e.dispose()); } });
}

/** Dois caças da Frente Livre de armas apontadas para o Rafael. */
export function spawnFrenteEscort(S, { pose = null } = {}) {
  const leader = pose || playerP(S);
  const out = [];
  const mk = (off, seed) => S.stage.add({
    classId: 'fighter', faction: 'frente', seed, throttle: 0.55,
    motion: (dt, t, a) => {
      const L = leader(); if (!L) return;
      const s = Math.sin(t * 0.7 + seed) * 1.5;
      a.pos.copy(off).add(V(s, s * 0.4, 0)).applyQuaternion(L.quat).add(L.pos);
      // nariz apontado para o jogador (vigilância), inclinado
      const d = L.pos.clone().sub(a.pos).normalize();
      const up = V(0, 1, 0).applyQuaternion(L.quat).applyAxisAngle(d, Math.sin(t * 0.4 + seed) * 0.15 + (off.x > 0 ? -0.25 : 0.25));
      a.quat.copy(lookQuat(d, up));
      if (L.vel) a.vel.copy(L.vel);
    },
  });
  out.push(mk(V(-34, 8, -58), 21), mk(V(46, -6, -92), 23));
  return out;
}

export function arrivalShot(S, dur = 8, o = {}) {
  const k = { side: o.side ?? -11, up: o.up ?? 3.5, fwd: o.fwd ?? 20, push: o.push ?? -5, fov: o.fov ?? 50, lookUp: o.lookUp ?? 0.5, ahead: o.ahead ?? 30 };
  return custom(dur, (u) => {
    const p = S.playerPose();
    const F = V(0, 0, -1).applyQuaternion(p.quat), U = V(0, 1, 0).applyQuaternion(p.quat), R = V(1, 0, 0).applyQuaternion(p.quat);
    const pos = p.pos.clone().addScaledVector(F, -k.fwd - k.push * u).addScaledVector(R, k.side).addScaledVector(U, k.up);
    const look = p.pos.clone().addScaledVector(U, k.lookUp).addScaledVector(F, k.ahead).addScaledVector(R, -1.5 * u);
    return { pos, look, up: U, fov: k.fov - 3 * u, focus: p.pos, roll: o.roll ?? 0.04 };
  }, { handheld: 0.002, ease: ease.inOut });
}

// ─── ATO III: DESPERTAR ─────────────────────────────────────────────────────
export async function awakening(S) {
  const ctx = S.ctx, ui = S.ui, dir = S.dir;
  ctx.game.setMode('cinematic', { scene: 'awakening' });
  ui.letterbox(1);
  S.music('cinematic', 0.9);
  const act = ACTS[3];
  ui.fade(1, 1.2);
  await dir.wait(1.3);
  ui.card({ kicker: act.kicker, title: act.title, sub: act.sub, lines: ['Em toda a Fenda, as ruínas dos Arquitetos acenderam ao mesmo tempo.', 'E, do outro lado das rotas de salto, a frota de Varela respondeu.'] });
  for (let i = 0; i < 2; i++) { await dir.wait(2.6); ui.revealCardLine(i); }
  await dir.wait(3.2);
  ui.hideCard(); ui.fade(0, 1.6);
  ctx.services.rendering?.flash?.('#7fb8ff', 0.6);
  dir.play(chase(playerP(S), { from: V(0, 4, 26), to: V(-6, 3, 18), lookFrom: V(0, 0, -200), lookTo: V(0, 0, -400), fov: [50, 44], dur: 9, handheld: 0.003 }));
  await S.say('vigia', 'A FENDA DESPERTA. PORTADOR, VENHA A NIVÁLIA.');
  await S.say('okonkwo', 'Rafael! O Soberano acabou de saltar para Kessa. Volte ao Refúgio — agora!');
  dir.endSkip();
  dir.release();
  ctx.game.setMode('ship', { scene: 'awakening' });
  ui.letterbox(0);
  S.music('tension', 0.6);
}

// ─── FINAL ──────────────────────────────────────────────────────────────────
export async function ending(S) {
  const ctx = S.ctx, ui = S.ui, dir = S.dir;
  const st = S.state;
  st.rep = Object.fromEntries(S.factions.list.map((f) => [f, S.factions.rep(f)]));
  const end = ENDINGS.find((e) => e.when(st)) || ENDINGS[ENDINGS.length - 1];
  st.ending = end.id;
  ctx.game.setMode('cinematic', { scene: 'ending' });
  ui.letterbox(1);
  S.music('cinematic', 1);
  if (end.id === 'revolucao') {
    const sob = S.cast?.get?.('soberano');
    const p = sob ? sob().pos.clone() : S.playerPose().pos.clone().add(V(0, 0, -3000));
    for (let i = 0; i < 5; i++) S.stage.after(i * 0.7, () => ctx.bus.emit('explosion', { pos: p.clone().add(V((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 600)), size: 220 + i * 60, kind: 'capital' }));
  }
  dir.play(chase(playerP(S), { from: V(-10, 3, 22), to: V(-30, 8, 60), lookFrom: V(0, 0, 0), lookTo: V(0, 0, -100), fov: [45, 36], dur: 12, handheld: 0.002 }));
  await dir.wait(4);
  ui.fade(1, 2.5);
  await dir.wait(2.6);
  ui.card({ kicker: 'FIM', title: end.title, sub: 'Rafael Paoli Shooter 3D: Revolution', lines: end.lines });
  for (let i = 0; i < end.lines.length; i++) { await dir.wait(3.2); ui.revealCardLine(i); }
  await dir.wait(5);
  ui.hideCard();
  dir.endSkip();
  dir.release();
  ui.fade(0, 2);
  ctx.game.setMode('ship', { scene: 'postgame' });
  ui.letterbox(0);
  S.notify('A FENDA CONTINUA — MISSÕES DISPONÍVEIS NAS ESTAÇÕES', 'info');
  S.save();
}

export const SCENES = { opening, arrival, awakening, ending };
