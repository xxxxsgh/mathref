// Presets de screenshot do combate (simulação real, IA real, câmera de cena).
//
//   combat-dogfight         órbita de Aurora (Halden): câmera colada num caça da
//                           Hegemonia perseguindo um caça da Frente, rajadas
//                           douradas, escudo do alvo piscando, rastros de motor
//   combat-capital-battle   destróier e porta-caças da Hegemonia sob ataque:
//                           torres atirando, flak, hangar lançando caças,
//                           brechas fumegando, uma torre explodindo
//   combat-missile          Kessa: míssil IR com rastro de fumaça curvando atrás
//                           de um corsário que solta flares
//   combat-explosion        um caça explode ao lado do porta-caças: bola de
//                           fogo, destroços, estilhaços e onda de choque
//
// Parâmetros de URL: warm (s de simulação antes da captura), cx/cy/cz
// (deslocamento da câmera, m, no referencial do alvo), fov, seed.
import * as THREE from 'three/webgpu';
import { lookQuat } from './math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };
const STEP = 1 / 60;

function prepare(ctx, S, sysId, fov) {
  if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
  ctx.game.setMode('cinematic');
  ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix();
  S.director.enabled = false;
  const sim = S.sim;
  sim.clear();
  sim._r = new ctx.Rng(P(ctx, 'seed', 7));
  sim.relations.reset();
  sim.capitalBias = 2.2;
}

/** Roda a simulação `sec` segundos sem emitir eventos (rastros e posições se formam). */
function warm(S, sec) {
  const sim = S.sim;
  sim.quiet = true;
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) {
    sim.step(STEP);
    S.battle?.step(STEP);
    // rastros também (o desenho usa o relógio da simulação)
    if (i % 2 === 0) sim.frame(STEP * 2, 1);
  }
  sim.quiet = false;
}

/** Câmera presa a uma nave: offset no referencial dela, olhando para `look()`. */
function chaseRig(ctx, ship, offset, look, upFrom = ship) {
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), l = new THREE.Vector3(), up = new THREE.Vector3();
  return () => {
    if (!ship.alive && !ship.renderPos) return;
    const sq = ship.group?.quaternion || ship.quat;
    p.copy(offset).applyQuaternion(sq).add(ship.renderPos || ship.pos);
    look(l);
    up.set(0, 1, 0).applyQuaternion(upFrom.group?.quaternion || upFrom.quat);
    lookQuat(l.sub(p), up, q);
    ctx.player.camWorld.copy(p); ctx.player.pos.copy(p);
    ctx.camera.quaternion.copy(q);
  };
}

function fixedRig(ctx, pos, lookAt, upv = V(0, 1, 0)) {
  const q = lookQuat(lookAt.clone().sub(pos), upv);
  const p = pos.clone();
  return () => { ctx.player.camWorld.copy(p); ctx.player.pos.copy(p); ctx.camera.quaternion.copy(q); };
}

function body(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name) || ctx.universe.system.bodies[0]; }

export function registerShots(ctx, api, S) {
  // ── dogfight sobre Aurora ─────────────────────────────────────────────────
  ctx.shots.register('combat-dogfight', async (ctx) => {
    prepare(ctx, S, 'halden', P(ctx, 'fov', 58));
    const sim = S.sim;
    const aur = body(ctx, 'Aurora');
    const poi = ctx.universe.system.pois.find((p) => p.kind === 'opening_battle');
    const center = poi ? poi.pos.clone() : aur.pos.clone().add(V(aur.radius * 2.6, aur.radius * 0.5, 0));
    // frente da batalha cruzando o limbo de Aurora (planeta grande embaixo)
    const toP = aur.pos.clone().sub(center).normalize();
    const side = new THREE.Vector3().crossVectors(toP, V(0, 1, 0)).normalize();
    const fwd = toP.clone().multiplyScalar(0.55).addScaledVector(side, 0.83).normalize();
    const b = api.startBattle('aurora', { center, forward: fwd, playerIn: false });
    // dupla principal: caçador dourado atrás de um caça da Frente
    const F = b.frame.F, R = b.frame.R, U = b.frame.U;
    const p0 = b.at(400, -120, 60);
    const prey = sim.spawn('frente', 'fighter', p0, { quat: lookQuat(F.clone().addScaledVector(R, 0.25), U), vel: F.clone().multiplyScalar(230), battle: b, side: 'frente', ai: { mode: 'evade' }, tags: ['nofuga'], toughness: 6, callsign: 'FAÍSCA-2' });
    const hero = sim.spawn('hegemonia', 'fighter', p0.clone().addScaledVector(F, -260).addScaledVector(U, 25).addScaledVector(R, -30), { quat: lookQuat(F, U), vel: F.clone().multiplyScalar(240), battle: b, side: 'hegemonia', ai: { mode: 'engage', target: prey, focus: prey }, toughness: 6, callsign: 'ÁGUIA-1' });
    b.ships.push(prey, hero);
    prey.ai.target = null;
    warm(S, P(ctx, 'warm', 2.6));
    // depois do aquecimento, garante a perseguição e rajadas no ar
    hero.ai.target = prey; hero.ai.setMode('engage');
    const off = V(P(ctx, 'cx', 9), P(ctx, 'cy', 4.2), P(ctx, 'cz', 21));
    S.rig = chaseRig(ctx, hero, off, (out) => out.copy(hero.renderPos).lerp(prey.renderPos, 0.82));
    S.rig(ctx);
    ctx.services.planets?.settle?.();
    ctx.services.rendering?.cut?.();
  });

  // ── batalha de capitais ───────────────────────────────────────────────────
  ctx.shots.register('combat-capital-battle', async (ctx) => {
    prepare(ctx, S, 'halden', P(ctx, 'fov', 62));
    const sim = S.sim;
    const aur = body(ctx, 'Aurora');
    const poi = ctx.universe.system.pois.find((p) => p.kind === 'opening_battle');
    const center = poi ? poi.pos.clone() : aur.pos.clone().add(V(aur.radius * 2.6, aur.radius * 0.5, 0));
    const b = api.startBattle('aurora', { center, playerIn: false });
    // a milícia vai direto para as capitais
    sim.capitalBias = 0.25;
    warm(S, P(ctx, 'warm', 5));
    const des = b.ships.find((s) => s.classId === 'destroyer');
    const car = b.ships.find((s) => s.classId === 'carrier');
    const ref = des || car;
    if (!ref) return;
    // dano visível: brechas e uma torre a ponto de explodir
    if (ref.capital) {
      ref.hull = ref.hullMax * 0.55;
      ref.capital.addBreach(ref.capital.randomHullPoint(), 0.9);
      ref.capital.addBreach(ref.capital.randomHullPoint(), 0.7);
    }
    warm(S, 1.2);
    const F = ref.fwd(new THREE.Vector3()), U = ref.up(new THREE.Vector3()), R = ref.right(new THREE.Vector3());
    const L = ref.length || 560;
    const camPos = ref.pos.clone().addScaledVector(R, P(ctx, 'cr', 0.95) * L).addScaledVector(U, P(ctx, 'cu', 0.28) * L).addScaledVector(F, P(ctx, 'cf', -0.55) * L);
    const lookAt = ref.pos.clone().addScaledVector(F, L * 0.22).addScaledVector(R, -L * 0.1);
    S.rig = fixedRig(ctx, camPos, lookAt, U);
    S.rig(ctx);
    // uma torre explode durante a captura
    if (ref.capital) {
      const t = ref.capital.turrets.filter((x) => x.alive).sort((a, c) => ref.capital.turretWorld(a, new THREE.Vector3()).distanceTo(camPos) - ref.capital.turretWorld(c, new THREE.Vector3()).distanceTo(camPos))[1];
      if (t) ref.capital.damageTurret(t, 1e6, null);
    }
    ctx.services.planets?.settle?.();
    ctx.services.rendering?.cut?.();
  });

  // ── míssil e flares em Kessa ──────────────────────────────────────────────
  ctx.shots.register('combat-missile', async (ctx) => {
    prepare(ctx, S, 'kessa', P(ctx, 'fov', 56));
    const sim = S.sim;
    const ver = body(ctx, 'Verídia');
    const poi = ctx.universe.system.pois.find((p) => p.kind === 'arrival');
    const base = poi ? poi.pos.clone() : ver.pos.clone().add(V(ver.radius * 4, 0, 0));
    const toV = ver.pos.clone().sub(base).normalize();
    const side = new THREE.Vector3().crossVectors(toV, V(0, 1, 0)).normalize();
    const F = toV.clone().multiplyScalar(0.35).addScaledVector(side, 0.94).normalize();
    const U = new THREE.Vector3().crossVectors(side, F).normalize().negate();
    if (U.y < 0) U.negate();
    const prey = sim.spawn('corsarios', 'fighter', base.clone(), { quat: lookQuat(F, U), vel: F.clone().multiplyScalar(250), ai: { mode: 'evade' }, tags: ['nofuga'], toughness: 20, callsign: 'NAVALHA-3' });
    const shooter = sim.spawn('frente', 'fighter', base.clone().addScaledVector(F, -900).addScaledVector(U, -60).addScaledVector(side, 140), { quat: lookQuat(F, U), vel: F.clone().multiplyScalar(240), ai: { mode: 'engage', target: prey }, toughness: 20 });
    // dois corsários de escolta ao fundo
    sim.spawn('corsarios', 'interceptor', base.clone().addScaledVector(F, 500).addScaledVector(side, -600).addScaledVector(U, 180), { quat: lookQuat(F.clone().addScaledVector(side, 0.4), U), ai: { mode: 'evade' }, tags: ['nofuga'] });
    warm(S, 0.5);
    const m = sim.missiles.launch(shooter, prey, 'ir');
    m.def = { ...m.def, life: 30 }; // não se autodestrói durante a captura
    warm(S, P(ctx, 'warm', 1.3));
    sim.missiles.deploy(prey, 'flare', 4);
    warm(S, 0.35);
    // a captura mostra o míssil indo atrás do alvo (sem detonar ainda)
    if (m.alive) m.target = null;
    if (m.alive) m.dir.copy(prey.pos).sub(m.pos).normalize();
    const off = V(P(ctx, 'cx', 3.2), P(ctx, 'cy', 1.4), P(ctx, 'cz', 7.5));
    if (m.alive) {
      const q = new THREE.Quaternion(), p = new THREE.Vector3(), l = new THREE.Vector3();
      S.rig = () => {
        p.copy(off).applyQuaternion(m.quat).add(m.renderPos);
        l.copy(prey.renderPos);
        lookQuat(l.sub(p), U, q);
        ctx.player.camWorld.copy(p); ctx.player.pos.copy(p); ctx.camera.quaternion.copy(q);
      };
    } else S.rig = chaseRig(ctx, shooter, V(6, 3, 18), (out) => out.copy(prey.renderPos));
    S.rig(ctx);
    ctx.services.planets?.settle?.();
    ctx.services.rendering?.cut?.();
  });

  // ── explosão ──────────────────────────────────────────────────────────────
  ctx.shots.register('combat-explosion', async (ctx) => {
    prepare(ctx, S, 'halden', P(ctx, 'fov', 60));
    const sim = S.sim;
    const aur = body(ctx, 'Aurora');
    const poi = ctx.universe.system.pois.find((p) => p.kind === 'opening_battle');
    const center = poi ? poi.pos.clone() : aur.pos.clone().add(V(aur.radius * 2.6, aur.radius * 0.5, 0));
    const b = api.startBattle('aurora', { center, playerIn: false });
    warm(S, P(ctx, 'warm', 3));
    const car = b.ships.find((s) => s.classId === 'carrier') || b.ships[0];
    const F = car.fwd(new THREE.Vector3()), U = car.up(new THREE.Vector3()), R = car.right(new THREE.Vector3());
    const L = car.length || 760;
    // vítima: caça da Frente passando sobre o convés
    const vpos = car.pos.clone().addScaledVector(U, L * 0.14).addScaledVector(R, L * 0.32).addScaledVector(F, L * 0.1);
    const victim = sim.spawn('frente', 'fighter', vpos, { quat: lookQuat(F.clone().negate().addScaledVector(R, 0.3), U), vel: F.clone().multiplyScalar(-200), ai: false });
    const camPos = vpos.clone().addScaledVector(R, P(ctx, 'cr', 150)).addScaledVector(U, P(ctx, 'cu', 30)).addScaledVector(F, P(ctx, 'cf', 120));
    S.rig = fixedRig(ctx, camPos, vpos.clone().addScaledVector(R, -60).addScaledVector(U, -10), U);
    S.rig(ctx);
    // impactos no escudo e a explosão
    for (let i = 0; i < 5; i++) sim.damage(victim, 18, { pos: victim.pos.clone().add(V(sim.rand() - 0.5, sim.rand() - 0.5, sim.rand() - 0.5).multiplyScalar(8)), from: null, def: { kind: 'kinetic', shieldMul: 1, hullMul: 1 } });
    victim.hull = 1;
    sim.finishDeath(victim, null);
    // estilhaços de flak próximos
    for (let i = 0; i < 4; i++) {
      const fp = vpos.clone().add(V(sim.rand() - 0.5, sim.rand() - 0.2, sim.rand() - 0.5).multiplyScalar(260));
      sim.projectiles.flash({ pos: fp, size: 14, color: [1.0, 0.6, 0.3], life: 0.5, intensity: 6, kind: 2 });
      sim.flakSmoke(fp);
    }
    ctx.services.planets?.settle?.();
    ctx.services.rendering?.cut?.();
  });
}
