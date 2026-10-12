// Presets de screenshot do combate (simulação real, IA real, câmera de cena).
//
//   combat-dogfight         mergulho sobre Aurora (Halden): câmera atrás de um
//                           caça da Hegemonia que persegue um caça da Frente,
//                           rajadas douradas, escudo do alvo piscando, a
//                           batalha da abertura ao fundo
//   combat-capital-battle   destróier e porta-caças da Hegemonia com o planeta
//                           embaixo: torres atirando, flak, caças da milícia
//                           fazendo passadas, canhões pesados contra a fragata,
//                           brechas fumegando, uma torre explodindo
//   combat-missile          Kessa sobre Verídia: míssil IR com rastro de fumaça
//                           atrás de um corsário que solta flares
//   combat-explosion        um caça em chamas explode sobre o convés do
//                           porta-caças: bola de fogo, destroços em brasa
//
// Todos montam o enquadramento a partir do sol e do planeta (fase "gibosa":
// terminador visível, luz lateral nas naves). Parâmetros de URL: warm, alt
// (altitude em raios), phase (graus do ponto subsolar), hdg (rumo em graus
// relativo ao sol), pitch, cx/cy/cz (câmera), fov, seed.
import * as THREE from 'three/webgpu';
import { lookQuat } from './math.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };
const D2R = Math.PI / 180;
const STEP = 1 / 60;

function prepare(ctx, S, sysId, fov) {
  if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
  ctx.game.setMode('cinematic');
  ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix();
  S.director.enabled = false;
  const sim = S.sim;
  if (S.battle) { S.battle.ended = true; S.battle.dispose(); S.battle = null; }
  sim.clear();
  sim._r = new ctx.Rng(P(ctx, 'seed', 7));
  sim.relations.reset();
  sim.capitalBias = 2.2;
}

/** Roda a simulação `sec` segundos sem emitir eventos. each(i) roda a cada passo. */
function warm(S, sec, each = null) {
  const sim = S.sim;
  sim.quiet = true;
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) {
    each?.(i);
    sim.step(STEP);
    S.battle?.step(STEP);
    if (i % 2 === 0) sim.frame(STEP * 2, 1);
  }
  sim.quiet = false;
}

/**
 * Referencial de cena sobre um planeta: posição a `alt` raios de altitude,
 * com o ponto abaixo a `phase` graus do ponto subsolar; F = rumo tangente
 * (hdg 0 = em direção ao sol, 90 = sol pela esquerda), U = radial.
 */
function orbitFrame(ctx, body, { alt = 0.45, phase = 62, hdg = 90, roll = 0 } = {}) {
  const sunW = ctx.universe.system.star.pos.clone().sub(body.pos).normalize();
  const dir = sunW.clone().applyAxisAngle(V(0, 1, 0), phase * D2R).normalize();
  const d = body.radius * (1 + alt);
  const pos = body.pos.clone().addScaledVector(dir, d);
  const U = dir.clone();
  const sunT = sunW.clone().addScaledVector(U, -sunW.dot(U)).normalize();
  const side = new THREE.Vector3().crossVectors(U, sunT).normalize();
  const F = sunT.clone().multiplyScalar(Math.cos(hdg * D2R)).addScaledVector(side, Math.sin(hdg * D2R)).normalize();
  if (roll) U.applyAxisAngle(F, roll * D2R);
  const R = new THREE.Vector3().crossVectors(F, U).normalize();
  // ângulo do horizonte abaixo da horizontal
  const hb = 90 - Math.asin(Math.min(1, body.radius / d)) / D2R;
  return { pos, F, U, R, hb, d, sunW };
}

/** Direção F inclinada `deg` graus para baixo (em direção ao planeta). */
function pitched(fr, deg) {
  return fr.F.clone().multiplyScalar(Math.cos(deg * D2R)).addScaledVector(fr.U, -Math.sin(deg * D2R)).normalize();
}

/** Base de câmera para uma direção de olhar, com "cima" mais próximo de `up`. */
function basis(dir, up) {
  const F = dir.clone().normalize();
  const R = new THREE.Vector3().crossVectors(F, up).normalize();
  const U = new THREE.Vector3().crossVectors(R, F).normalize();
  return { F, R, U };
}

function setCam(ctx, pos, look, up) {
  ctx.player.camWorld.copy(pos); ctx.player.pos.copy(pos);
  ctx.camera.quaternion.copy(lookQuat(look.clone().sub(pos), up));
}

/** Tempo (s) entre o fim do setup e a captura (shot.mjs --frames 8, 30 quadros/s virtuais). */
const T_CAP = 8 / 30;
/** Posição prevista (velocidade constante) daqui a `t` s. */
const ahead = (o, t = T_CAP) => o.pos.clone().addScaledVector(o.vel, t);

/**
 * Câmera PARADA no mundo, posicionada pelo ponto previsto da captura: as naves
 * passam por ela (sem borrão de movimento da câmera, TAA estável).
 */
function staticRig(ctx, pos, look, up) {
  const p = pos.clone(), l = look.clone();
  return () => setCam(ctx, p, l, up);
}

/** Câmera presa a uma nave (offset no referencial de uma base fixa), olhando para look(). */
function followRig(ctx, ship, off, look, up) {
  const p = new THREE.Vector3(), l = new THREE.Vector3();
  return () => {
    p.copy(ship.renderPos || ship.pos).add(off);
    look(l);
    setCam(ctx, p, l, up);
  };
}

/** Rajada de todas as armas do atirador na antecipação do alvo. */
function volley(sim, s, T, spread = 0.7, rate = 1) {
  for (const w of s.weapons) {
    if (w.cd > 0) continue;
    w.cd = 1 / (w.def.rof * rate);
    const muzzle = s.toWorld(w.hp, new THREE.Vector3());
    const L = sim.lead(T, w.def.speed, s);
    const dir = (L ? L.pos : T.pos).clone().sub(muzzle).normalize();
    sim.projectiles.fire(s, w.def, muzzle, dir, { inherit: s.vel, muzzleLocal: w.hp, spreadMul: spread });
  }
}

function body(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name) || ctx.universe.system.bodies[0]; }

function finish(ctx, S) {
  S.rig?.(ctx);
  ctx.services.rendering?.sun?.setShadowRange?.(P(ctx, 'shadow', 900));
  ctx.services.planets?.settle?.();
  ctx.services.rendering?.cut?.();
}

export function registerShots(ctx, api, S) {
  // ── depuração: raios cruzando a vista a várias distâncias (câmera parada) ──
  ctx.shots.register('combat-test-bolts', async (ctx) => {
    prepare(ctx, S, 'kessa', 60);
    const sim = S.sim;
    const base = V(3e7, 4e6, 0);
    const F = V(0, 0, -1), U = V(0, 1, 0);
    const guns = [];
    for (let i = 0; i < 4; i++) {
      const d = [40, 90, 200, 600][i];
      const s = sim.spawn('hegemonia', 'fighter', base.clone().add(V(-d * 0.9, -d * 0.25 + i * 3, -d)), { quat: lookQuat(V(1, 0, 0), U), vel: V(), ai: false, force: true });
      guns.push(s);
    }
    const shoot = () => { for (const g of guns) { g.vel.set(0, 0, 0); for (const w of g.weapons) { if (w.cd > 0) continue; w.cd = 1 / w.def.rof; sim.projectiles.fire(g, w.def, g.toWorld(w.hp, V()), V(1, 0, 0), { muzzleLocal: w.hp }); } } };
    warm(S, 0.5, shoot);
    S.shotHook = shoot;
    S.rig = () => setCam(ctx, base, base.clone().add(F), U);
    finish(ctx, S);
  });

  // ── dogfight: mergulho sobre Aurora ───────────────────────────────────────
  ctx.shots.register('combat-dogfight', async (ctx) => {
    prepare(ctx, S, 'halden', P(ctx, 'fov', 44));
    const sim = S.sim;
    const aur = body(ctx, 'Aurora');
    const fr = orbitFrame(ctx, aur, { alt: P(ctx, 'alt', 0.42), phase: P(ctx, 'phase', 64), hdg: P(ctx, 'hdg', 112) });
    // olhar: horizonte ~e graus abaixo do centro
    const dive = pitched(fr, P(ctx, 'pitch', fr.hb - P(ctx, 'e', -8)));
    const B = basis(dive, fr.U);
    // batalha da abertura à frente (capitais e esquadrilhas ao fundo)
    const center = fr.pos.clone().addScaledVector(B.F, 2600).addScaledVector(B.U, 300);
    api.startBattle('aurora', { center, forward: B.F.clone().addScaledVector(B.R, 0.6).normalize(), up: B.U, playerIn: false });
    const b = S.battle;
    // dupla principal
    const hero = sim.spawn('hegemonia', 'fighter', fr.pos.clone(), { quat: lookQuat(B.F, B.U), vel: B.F.clone().multiplyScalar(235), ai: false, battle: b, side: 'hegemonia', toughness: 20, callsign: 'ÁGUIA-1', shadows: true, force: true });
    const pp = fr.pos.clone().addScaledVector(B.F, P(ctx, 'gap', 300)).addScaledVector(B.R, 9).addScaledVector(B.U, 5);
    const preyF = B.F.clone().addScaledVector(B.R, 0.16).addScaledVector(B.U, 0.05).normalize();
    const prey = sim.spawn('frente', 'fighter', pp, { quat: lookQuat(preyF, B.U.clone().applyAxisAngle(preyF, -0.55)), vel: B.F.clone().multiplyScalar(232), ai: false, battle: b, side: 'frente', toughness: 30, callsign: 'FAÍSCA-2', shadows: true, force: true });
    b?.ships.push(hero, prey);
    prey.ctl.throttle = 0.95; prey.ctl.roll = -0.25; prey.ctl.yaw = 0.06;
    hero.ctl.throttle = 0.95;
    // rajadas contínuas nos últimos 0,9 s (raios no ar + impactos no escudo)
    const w = P(ctx, 'warm', 2.2);
    const fireFrom = Math.round((w - 0.9) / STEP);
    warm(S, w, (i) => { if (i >= fireFrom) volley(sim, hero, prey, 0.5, 1.6); });
    // durante a captura continua atirando
    S.shotHook = () => volley(sim, hero, prey, 0.5, 1.6);
    const off = B.R.clone().multiplyScalar(P(ctx, 'cx', 5)).addScaledVector(B.U, P(ctx, 'cy', 5.5)).addScaledVector(B.F, -P(ctx, 'cz', 30));
    const hA = ahead(hero), pA = ahead(prey);
    S.rig = staticRig(ctx, hA.clone().add(off), hA.clone().lerp(pA, P(ctx, 'look', 0.22)), B.U);
    finish(ctx, S);
  });

  // ── batalha de capitais sobre Aurora ──────────────────────────────────────
  ctx.shots.register('combat-capital-battle', async (ctx) => {
    prepare(ctx, S, 'halden', P(ctx, 'fov', 60));
    const sim = S.sim;
    const aur = body(ctx, 'Aurora');
    const fr = orbitFrame(ctx, aur, { alt: P(ctx, 'alt', 0.3), phase: P(ctx, 'phase', 42), hdg: P(ctx, 'hdg', 70) });
    const { F, U, R } = fr;
    const b = api.startBattle({ id: 'shot', kind: 'shot', center: fr.pos, forward: F, up: U, endWhenClear: false, groups: [] });
    const des = sim.spawn('hegemonia', 'destroyer', fr.pos.clone(), { quat: lookQuat(F, U), battle: b, name: 'Inflexível', shadows: true, force: true });
    const L = des.length || 560;
    const car = sim.spawn('hegemonia', 'carrier', fr.pos.clone().addScaledVector(R, -1.9 * L).addScaledVector(F, -0.5 * L).addScaledVector(U, -0.45 * L), { quat: lookQuat(F.clone().addScaledVector(R, 0.08).normalize(), U), battle: b, name: 'Soberano', launch: true, firstLaunch: 0.5, launchInterval: 2.5, maxLaunch: 4, shadows: true, force: true });
    const esp = sim.spawn('frente', 'frigate', fr.pos.clone().addScaledVector(R, -4.2 * L).addScaledVector(F, 2.6 * L).addScaledVector(U, 0.2 * L), { quat: lookQuat(F.clone().negate().addScaledVector(R, 0.5).normalize(), U), battle: b, name: 'Esperança', ai: false, toughness: 4, force: true });
    b.ships.push(des, car, esp);
    if (des.capital) { des.capital.cruise = 0.25; }
    // milícia fazendo passadas contra as torres + caças de escolta
    const mil = [];
    for (let i = 0; i < P(ctx, 'n', 9); i++) {
      const a = (i / 9) * Math.PI * 2;
      const p = fr.pos.clone().addScaledVector(F, Math.cos(a) * L * 0.65).addScaledVector(R, Math.sin(a) * L * 0.5 + L * 0.15).addScaledVector(U, L * (0.18 + 0.12 * Math.sin(a * 2)));
      const d = des.pos.clone().sub(p).normalize();
      const s = sim.spawn('frente', i % 3 === 2 ? 'interceptor' : 'fighter', p, { quat: lookQuat(d, U), battle: b, side: 'frente', ai: { mode: 'strafe', focus: des, target: des }, toughness: 8, tags: ['nofuga'], force: true });
      if (s) { b.ships.push(s); mil.push(s); }
    }
    for (let i = 0; i < 4; i++) {
      const t = mil[i * 2];
      if (!t) continue;
      const p = t.pos.clone().addScaledVector(t.fwd(V()), -260).addScaledVector(U, 30 * i);
      const s = sim.spawn('hegemonia', 'interceptor', p, { quat: t.quat.clone(), battle: b, side: 'hegemonia', ai: { mode: 'engage', target: t, focus: t }, toughness: 4, force: true });
      if (s) b.ships.push(s);
    }
    sim.capitalBias = 0.2;
    warm(S, P(ctx, 'warm', 3.2));
    // dano visível: casco a 55%, brechas fumegando
    if (des.capital) {
      des.hull = des.hullMax * 0.55;
      for (let i = 0; i < 3; i++) des.capital.addBreach(des.capital.randomHullPoint(), 0.9);
    }
    warm(S, 1.0);
    // a milícia que sobreviveu faz uma passada rasante sobre o convés, no quadro
    const runs = mil.filter((x) => x.alive && x.state === 'ok').slice(0, P(ctx, 'nrun', 5));
    runs.forEach((x, i) => {
      const p = des.pos.clone().addScaledVector(U, L * (0.12 + 0.05 * i)).addScaledVector(R, L * (0.05 + 0.09 * i)).addScaledVector(F, L * (0.35 - 0.16 * i));
      const d = F.clone().negate().addScaledVector(R, (i % 2 ? 0.25 : -0.15)).addScaledVector(U, -0.06).normalize();
      x.pos.copy(p); x.prevPos.copy(p); x.renderPos.copy(p);
      x.quat.copy(lookQuat(d, U)); x.prevQuat.copy(x.quat);
      x.vel.copy(d).multiplyScalar(210);
      x.ai.setMode('strafe');
      x.trail?.stop(sim.renderNow);
      if (sim.fx) x.trail = sim.fx.engineTrails.alloc({ life: 0.55, width: Math.max(0.25, x.nozzleR * 0.45), minDist: 5, color: x.engineColor, intensity: 1.6, alpha: 0.85, seed: i });
    });
    warm(S, 0.25, (i) => { if (i % 3 === 0) for (const x of runs) if (x.alive) volley(sim, x, des, 1.2); });
    const camPos = des.pos.clone().addScaledVector(R, P(ctx, 'cr', 0.55) * L).addScaledVector(U, P(ctx, 'cu', 0.62) * L).addScaledVector(F, P(ctx, 'cf', 0.3) * L);
    const lookAt = des.pos.clone().addScaledVector(F, -L * P(ctx, 'lf', 0.05)).addScaledVector(R, -L * P(ctx, 'lr', 0.12)).addScaledVector(U, -L * P(ctx, 'lu', 0.05));
    S.rig = () => setCam(ctx, camPos, lookAt, U);
    // uma torre do lado da câmera explode durante a captura
    if (des.capital) {
      const ts = des.capital.turrets.filter((x) => x.alive).sort((a, c) => des.capital.turretWorld(a, V()).distanceTo(camPos) - des.capital.turretWorld(c, V()).distanceTo(camPos));
      const t = ts[Math.min(ts.length - 1, P(ctx, 'tur', 2))];
      if (t) S.timers.push({ t: 0.08, fn: () => des.capital.damageTurret(t, 1e6, null) });
    }
    finish(ctx, S);
  });

  // ── míssil e flares em Kessa ──────────────────────────────────────────────
  ctx.shots.register('combat-missile', async (ctx) => {
    prepare(ctx, S, 'kessa', P(ctx, 'fov', 52));
    const sim = S.sim;
    const ver = body(ctx, 'Verídia');
    const fr = orbitFrame(ctx, ver, { alt: P(ctx, 'alt', 0.38), phase: P(ctx, 'phase', 58), hdg: P(ctx, 'hdg', 105) });
    const dive = pitched(fr, P(ctx, 'pitch', fr.hb - P(ctx, 'e', -6)));
    const B = basis(dive, fr.U);
    const preyF = B.F.clone().addScaledVector(B.R, -0.12).normalize();
    const prey = sim.spawn('corsarios', 'fighter', fr.pos.clone(), { quat: lookQuat(preyF, B.U.clone().applyAxisAngle(preyF, 0.6)), vel: preyF.clone().multiplyScalar(240), ai: false, tags: ['nofuga'], toughness: 40, callsign: 'NAVALHA-3', shadows: true, force: true });
    prey.ctl.throttle = 1; prey.ctl.boost = true; prey.ctl.roll = 0.3; prey.ctl.pitch = 0.08;
    const shooter = sim.spawn('frente', 'fighter', fr.pos.clone().addScaledVector(B.F, -950).addScaledVector(B.R, 40).addScaledVector(B.U, 25), { quat: lookQuat(B.F, B.U), vel: B.F.clone().multiplyScalar(230), ai: false, toughness: 40, force: true });
    // corsários de escolta ao fundo
    for (let i = 0; i < 2; i++) {
      const s = sim.spawn('corsarios', 'interceptor', fr.pos.clone().addScaledVector(B.F, 700 + i * 300).addScaledVector(B.R, -380 + i * 650).addScaledVector(B.U, 120 - i * 220), { quat: lookQuat(B.F.clone().addScaledVector(B.R, 0.4 - i * 0.8).normalize(), B.U), ai: false, force: true });
      if (s) s.ctl.throttle = 0.9;
    }
    warm(S, 0.3);
    const m = sim.missiles.launch(shooter, prey, 'ir');
    m.def = { ...m.def, life: 60 };
    // voa até ficar a ~gap m do alvo; flares quando o alvo percebe (~650 m)
    let flared = false;
    const gap = P(ctx, 'gap', 210);
    for (let k = 0; k < 400 && m.alive; k++) {
      const d = m.pos.distanceTo(prey.pos);
      if (!flared && d < 700) {
        flared = true; sim.missiles.deploy(prey, 'flare', 6);
        for (const dc of sim.missiles.decoys) m.checked.add(dc); // na captura o míssil não morde o flare
      }
      if (d < gap) break;
      warm(S, STEP * 2);
    }
    // a captura mostra o míssil a caminho (sem detonar)
    if (m.alive) { m.decoyed = true; m.target = null; }
    // câmera à frente do alvo olhando para trás: o corsário soltando flares
    // em primeiro plano e o míssil chegando com o rastro de fumaça
    const off = V().addScaledVector(B.R, P(ctx, 'cx', 26)).addScaledVector(B.U, P(ctx, 'cy', 7)).addScaledVector(B.F, P(ctx, 'cz', 8));
    const tgt = m.alive ? m : shooter;
    const pA = ahead(prey), tA = ahead(tgt);
    S.rig = staticRig(ctx, pA.clone().add(off), pA.clone().lerp(tA, P(ctx, 'look', 0.35)), B.U);
    finish(ctx, S);
  });

  // ── explosão sobre o convés do porta-caças ────────────────────────────────
  ctx.shots.register('combat-explosion', async (ctx) => {
    prepare(ctx, S, 'halden', P(ctx, 'fov', 56));
    const sim = S.sim;
    const aur = body(ctx, 'Aurora');
    const fr = orbitFrame(ctx, aur, { alt: P(ctx, 'alt', 0.34), phase: P(ctx, 'phase', 42), hdg: P(ctx, 'hdg', 80) });
    const { F, U, R } = fr;
    const b = api.startBattle({ id: 'shot', kind: 'shot', center: fr.pos, forward: F, up: U, endWhenClear: false, groups: [] });
    const car = sim.spawn('hegemonia', 'carrier', fr.pos.clone(), { quat: lookQuat(F, U), battle: b, name: 'Soberano', shadows: true, force: true, launch: false });
    const L = car.length || 760;
    b.ships.push(car);
    // vítima: caça da Frente atingido, em chamas, cruzando sobre o convés
    const vpos = car.pos.clone().addScaledVector(U, L * P(ctx, 'vu', 0.16)).addScaledVector(R, L * P(ctx, 'vr', 0.3)).addScaledVector(F, L * P(ctx, 'vf', 0.05));
    const vdir = F.clone().negate().addScaledVector(R, 0.25).addScaledVector(U, -0.12).normalize();
    const victim = sim.spawn('frente', 'fighter', vpos.clone().addScaledVector(vdir, -170), { quat: lookQuat(vdir, U), vel: vdir.clone().multiplyScalar(170), ai: false, force: true, shadows: true });
    b.ships.push(victim);
    // perseguidor dourado que acabou de acertar
    const chaser = sim.spawn('hegemonia', 'interceptor', vpos.clone().addScaledVector(vdir, -480).addScaledVector(U, 30).addScaledVector(R, -40), { quat: lookQuat(vdir, U), vel: vdir.clone().multiplyScalar(220), ai: false, force: true });
    b.ships.push(chaser);
    // caças ao fundo
    for (let i = 0; i < 4; i++) {
      const p = car.pos.clone().addScaledVector(F, (i - 1.5) * 380).addScaledVector(R, -L * 0.8 - i * 120).addScaledVector(U, 180 + i * 90);
      const s = sim.spawn(i % 2 ? 'frente' : 'hegemonia', 'fighter', p, { quat: lookQuat(F.clone().addScaledVector(R, i % 2 ? 0.5 : -0.3).normalize(), U), battle: b, side: i % 2 ? 'frente' : 'hegemonia', ai: { mode: 'engage' }, force: true });
      if (s) b.ships.push(s);
    }
    warm(S, 0.6, (i) => { if (i % 6 === 0) volley(sim, chaser, victim, 0.8); });
    // atingido: entra em parafuso pegando fogo (rastro de fumaça) e explode
    victim.hull = 1; victim.shield = 0;
    sim.die(victim, chaser, { burn: true });
    victim.dieT = 99;
    warm(S, P(ctx, 'burn', 1.0));
    // câmera fixa no ponto previsto da explosão (a vítima continua andando até lá)
    const boom = P(ctx, 'boom', 0.0);
    const at = victim.pos.clone().addScaledVector(victim.vel, boom + 1 / 60);
    const camPos = at.clone().addScaledVector(R, P(ctx, 'cr', 75)).addScaledVector(U, P(ctx, 'cu', 22)).addScaledVector(F, P(ctx, 'cf', 45));
    const lookAt = at.clone().addScaledVector(R, -P(ctx, 'lr', 25)).addScaledVector(U, -P(ctx, 'lu', 22)).addScaledVector(F, -P(ctx, 'lf', 28));
    S.rig = () => setCam(ctx, camPos, lookAt, U);
    S.timers.push({ t: boom, fn: () => { victim.dieT = 0; } });
    finish(ctx, S);
  });
}
