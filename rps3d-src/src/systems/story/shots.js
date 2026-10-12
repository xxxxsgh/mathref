// Presets de screenshot do sistema story (o jogo real, câmera real).
//
//   story-title             tela de título: órbita lenta do caça do Rafael sobre
//                           Aurora, frota da Hegemonia ao fundo, logo e menu
//   story-opening-order     cockpit em plena batalha no instante da ordem de
//                           bombardeio: câmera lenta, legenda, escolha
//   story-opening-betrayal  externa: Rafael vira as armas contra o Lança-8; a
//                           lança orbital do Inflexível desce sobre Aurora
//   story-jump-arrival      chegada em Kessa: Verídia, nebulosa da Fenda, caças
//                           da Frente Livre e a primeira transmissão
//
// Parâmetros de URL para ajuste fino: ver P(...) em cada preset.
import * as THREE from 'three/webgpu';
import { haldenFrame, buildAuroraCast, startBombardment, LINES } from './opening.js';
import { arrivalPose, arrivalShot, spawnFrenteEscort } from './scenes.js';
import { custom } from './cinema.js';
import { lookQuat } from './stage.js';
import { DIALOGS } from './campaign.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;

export function registerShots(ctx, S) {
  const P = (k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };
  const settle = () => { try { ctx.services.planets?.settle?.(); } catch { /* */ } };
  const useSystem = (id) => { if (ctx.universe.systemId !== id) ctx.universe.setSystem(id); };

  // ── título ─────────────────────────────────────────────────────────────
  ctx.shots.register('story-title', async () => {
    useSystem('halden');
    S.title.hasSave = false;
    S.title.active = true;
    ctx.game.setMode('title');
    S.title.build();
    S.dir.play(S.title.shot());
    S.dir.t = P('tt', 4);
    S.ui.letterbox(0, true);
    S.title.menu();
    settle();
  });

  // ── a ordem, no cockpit ────────────────────────────────────────────────
  ctx.shots.register('story-opening-order', async () => {
    useSystem('halden');
    const fr = haldenFrame(ctx, { alpha: P('alpha', 31), py: P('py', 22), pp: P('pp', -17) });
    S.frame = fr;
    S.spawnPlayer(fr.C, fr.q, { vel: fr.F.clone().multiplyScalar(140), throttle: 0.5, enter: true, faction: 'hegemonia' });
    const cast = buildAuroraCast(S, fr, { full: 'stage' });
    S.cast = cast;
    // fogo cruzado já em andamento
    const r = ctx.services.rendering;
    for (const a of [...cast.enemies, ...cast.allies]) a.target && a.fire && a.shoot();
    if (r?.particles) {
      for (let i = 0; i < 8; i++) {
        const src = fr.at(90 + i * 45, (i % 2 ? 1 : -1) * (14 + i * 4), -4 + i * 1.5);
        r.particles.bolt(src, fr.F.clone().addScaledVector(fr.R, (i % 3 - 1) * 0.02).addScaledVector(fr.U, 0.01 * i).normalize(), { color: 'gold', length: 18, width: 0.4, brightness: 36 });
      }
      for (let i = 0; i < 5; i++) r.particles.bolt(fr.at(520 + i * 80, -50 + i * 30, 30 + i * 6), fr.F.clone().negate().addScaledVector(fr.R, 0.08 * (i - 2)).normalize(), { color: 'red', length: 22, width: 0.6, brightness: 30 });
      r.explosion?.(fr.at(P('ef', 900), P('er', 210), P('eu', 120)), 30, 'ship');
    }
    S.cockpitMessage('COMANDO SOLAR · CANAL 1 — ORDEM DE BOMBARDEIO', ['ORDEM: BOMBARDEAR AURORA']);
    S.grade({ saturation: 0.86, contrast: 1.16, vignette: 0.48 });
    ctx.time.scale = P('slow', 0.35);
    S.ui.letterbox(P('lb', 0.45), true);
    S.say(LINES.order[0], LINES.order[1], { hold: true });
    const d = DIALOGS.ordem;
    S.ui.choose(d.prompt, d.choices, { timeout: 0 });
    S.ui.selectChoice(P('sel', 0));
    settle();
  });

  // ── a traição, externa ─────────────────────────────────────────────────
  ctx.shots.register('story-opening-betrayal', async () => {
    useSystem('halden');
    const fr = haldenFrame(ctx, { alpha: P('alpha', 31), py: P('py', 22), pp: P('pp', -17) });
    S.frame = fr;
    // o caça do Rafael em curva fechada (rolagem forte)
    const q = fr.q.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), P('yaw', 8) * D2R))
      .multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), P('pitch', -4) * D2R))
      .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), P('roll', -35) * D2R));
    S.spawnPlayer(fr.C, q, { vel: V(0, 0, -1).applyQuaternion(q).multiplyScalar(P('spd', 30)), throttle: 1, enter: false, faction: 'hegemonia' });
    ctx.game.setMode('cinematic', { scene: 'betrayal' });
    const cast = buildAuroraCast(S, fr, { full: 'stage' });
    S.cast = cast;
    const pose = S.playerPose();
    const F = V(0, 0, -1).applyQuaternion(pose.quat), U = V(0, 1, 0).applyQuaternion(pose.quat), R = V(1, 0, 0).applyQuaternion(pose.quat);
    // Lança-8 à frente, cruzando a mira; Davi rompendo a formação
    const l8 = cast.actors.lanca8, l6 = cast.actors.davi;
    if (l8) {
      const p8 = pose.pos.clone().addScaledVector(F, P('l8f', 80)).addScaledVector(R, P('l8r', 16)).addScaledVector(U, P('l8u', -6));
      const d8 = F.clone().addScaledVector(R, 0.7).normalize();
      l8.motion = (dt, t, a) => { a.pos.addScaledVector(d8, 150 * dt); a.vel.copy(d8).multiplyScalar(150); };
      l8.pos.copy(p8); l8.quat.copy(lookQuat(d8, U.clone().applyAxisAngle(d8, 0.9)));
      l8.fire = null;
    }
    if (l6) {
      const d6 = F.clone().addScaledVector(R, -0.8).addScaledVector(U, 0.35).normalize();
      l6.motion = (dt, t, a) => { a.pos.addScaledVector(d6, 160 * dt); };
      l6.pos.copy(pose.pos).addScaledVector(F, 60).addScaledVector(R, -40).addScaledVector(U, 12);
      l6.quat.copy(lookQuat(d6, U.clone().applyAxisAngle(d6, -1.1)));
    }
    S.beams = startBombardment(S, cast);
    for (let i = 0; i < 5; i++) S.playerShoot(() => l8, l8);
    S.stage.after(0.05, () => S.playerShoot(() => l8, l8), 0.1);
    const r = ctx.services.rendering;
    if (r && l8) {
      // impactos no escudo do Lança-8 (não uma explosão: ele sobrevive à primeira rajada)
      for (let i = 0; i < 3; i++) r.particles.sparks(l8.pos.clone().add(V((i - 1) * 2.5, 0.8, i * 1.5)), null, 30, { energy: i !== 1, speed: 45 });
      // o dogfight continua lá atrás: um caça da Águia explodindo sobre Aurora
      r.explosion?.(fr.at(P('ef', 1300), P('er', -380), P('eu', -160)), P('es', 34), 'ship', { normal: fr.U.clone().addScaledVector(fr.F, 0.35).normalize() });
    }
    S.ui.letterbox(1, true);
    S.say('davi', LINES.betrayal[0][1], { hold: true });
    // câmera no referencial da batalha: atrás/à esquerda do Rafael, olhando
    // para o Lança-8 e para Aurora (com a lança orbital) ao fundo
    S.dir.play(custom(1e9, () => {
      const p = S.playerPose();
      const pos = p.pos.clone().addScaledVector(fr.R, P('cx', -12)).addScaledVector(fr.U, P('cy', 5)).addScaledVector(fr.F, -P('cz', 22));
      const look = p.pos.clone().addScaledVector(fr.F, P('lz', 80)).addScaledVector(fr.R, P('lx', 22)).addScaledVector(fr.U, -P('ly', 16));
      return { pos, look, up: fr.U, fov: P('fov', 52), roll: P('croll', 4) * D2R };
    }, { hold: true }));
    settle();
  });

  // ── chegada em Kessa ───────────────────────────────────────────────────
  ctx.shots.register('story-jump-arrival', async () => {
    useSystem('kessa');
    const a = arrivalPose(ctx, ctx.universe.system, { phi: P('phi', 75), sep: P('sep', 50), dist: P('dist', 3.1) });
    const look = a.look.clone().applyAxisAngle(V(0, 1, 0), P('hy', 0) * D2R);
    const q = lookQuat(look, V(0, 1, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), P('roll', -8) * D2R));
    S.spawnPlayer(a.pos, q, { vel: look.clone().multiplyScalar(P('spd', 25)), throttle: 0.4, enter: false, faction: 'hegemonia' });
    ctx.game.setMode('cinematic', { scene: 'arrival' });
    spawnFrenteEscort(S);
    S.ui.letterbox(1, true);
    S.ui.location('KESSA', 'FENDA DE ÓRION · ESPAÇO LIVRE', 1e6);
    S.say('iara', DIALOGS.contato.lines[0].text, { hold: true });
    const sh = arrivalShot(S, 1e9, { side: P('side', 3), up: P('up', -5), fwd: P('fwd', 30), push: 0, fov: P('fov', 50), lookUp: P('lu', 0.5), ahead: P('ahead', 30), neb: P('neb', 0.45), roll: P('croll', 0.04) });
    sh.hold = true;
    S.dir.play(sh);
    try { ctx.services.space?.jumpFx?.('stop', {}); } catch { /* */ }
    settle();
  });
}
