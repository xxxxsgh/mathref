/**
 * Derrubada (slide kick do jogador — `info.knockdown` / `info.knockback`
 * em `damage()`): o soldado VIVO vira ragdoll por ~1,3 s (empurrado pelo
 * chute, cai de verdade, bate no cenário) e depois LEVANTA: a pose do chão
 * (quaternions do ragdoll) se mistura em 0,9 s com a pose animada de
 * joelhos → em pé (crouch 1 → 0), já virado para o jogador.
 *
 *   startKnockdown(e, info)  derruba (não vale para chefe/execução/morto)
 *   stepKnockdown(e, dt)     passo fixo (física do ragdoll, troca de fase)
 *   frameKnockdown(e, dt)    por frame (pose: ragdoll ou mistura)
 *
 * Enquanto está no chão: sem IA, colisor segue o ragdoll, leva dano normal
 * (morrer no chão vira ragdoll de morte normal). Evento 'enemy:knockdown'
 * { enemy, phase: 'down'|'up' }.
 */
import * as THREE from 'three';
import { B, NB, PARENT, REST } from './rig.js';
import { Ragdoll } from './ragdoll.js';

export const KNOCK = { down: 1.3, getup: 0.9 };
const _v = new THREE.Vector3();
const sstep = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function startKnockdown(e, info = {}) {
  if (!e.alive || e.boss || e.exec || e.down || e.scripted) return false;
  const ctx = e.ctx;
  e.anim.update(0);
  e.dropGear?.();
  const kb = info.knockback || info.dir || new THREE.Vector3(0, 0, 1);
  const vel = new THREE.Vector3(kb.x, 0, kb.z);
  if (vel.lengthSq() < 0.5) vel.setLength(3);
  vel.y = 1.4;
  e.ragdoll = new Ragdoll(e.anim, e.group, ctx.collision, vel);
  // tranco nas pernas (rasteira) + tronco para trás
  const pt = info.point || e.group.position.clone().setY(e.group.position.y + 0.5);
  e.ragdoll.impulse(pt, vel.clone().normalize(), 2.6);
  e.down = { t: 0, phase: 'down', from: null };
  e.velocity.set(0, 0, 0);
  const br = e.brain;
  br.releaseCover();
  br.mode = null;
  br.throwT = -1;
  br.revive = null;
  br.reviving = 0;
  br.charge = 0;
  e.anim.over.wL = e.anim.over.wR = 0;
  ctx.bus.emit('enemy:knockdown', { enemy: e, phase: 'down' });
  ctx.services.audio?.play?.('body_drop', { position: e.group.position.clone(), volume: 0.9 });
  return true;
}

/** Passo fixo. true = consumiu o passo (sem IA). */
export function stepKnockdown(e, dt) {
  const d = e.down;
  d.t += dt;
  if (d.phase === 'down') {
    e.ragdoll.step(dt);
    if (d.t >= KNOCK.down) beginGetUp(e);
    return true;
  }
  if (d.t >= KNOCK.getup) {
    e.down = null;
    const br = e.brain;
    br.state = 'combat';
    br.awareness = 1;
    br.reactT = 0.35;
    br.setMode(null);
    // escudo volta para o braço
    if (e.shield && e.shield.parent !== e.group) {
      e.shield.removeFromParent();
      e.group.add(e.shield);
      e.shieldFall = null;
    }
    e.ctx.bus.emit('enemy:knockdown', { enemy: e, phase: 'up' });
  }
  return true;
}

/** Sai do ragdoll: guarda a pose do chão e reposiciona o grupo na pelve. */
function beginGetUp(e) {
  const ctx = e.ctx;
  const a = e.anim;
  e.ragdoll.pose();
  const c = e.corpsePos(new THREE.Vector3());
  const gy = ctx.collision.groundHeight?.(c.x, c.z, c.y + 1.2);
  const old = e.group.position.clone();
  e.group.position.set(c.x, Number.isFinite(gy) ? gy : old.y, c.z);
  // a guinada do grupo não muda (os quaternions guardados continuam válidos);
  // só a translação: desloca a pelve e o fuzil guardados
  const off = _v.subVectors(old, e.group.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.yaw);
  e.down = {
    t: 0,
    phase: 'up',
    Q: a.Qm.map((q) => q.clone()),
    hips: a.Pm[B.hips].clone().add(off),
    wQ: a.weaponQ.clone(),
    wP: a.weaponP.clone().add(off),
  };
  e.ragdoll = null;
  const p = a.p;
  p.crouch = 1;
  p.aim = 0;
  p.speed = 0;
  p.duck = 0;
  p.headBack = 0;
  p.reload = -1;
}

/** Por frame: pose do chão misturada com a animada. */
export function frameKnockdown(e, dt) {
  const d = e.down;
  const a = e.anim;
  if (d.phase === 'down') {
    e.ragdoll.pose();
    return;
  }
  const k = sstep(d.t / KNOCK.getup);
  // de joelhos → em pé, arma voltando à posição
  a.p.crouch = 1 - sstep((d.t - KNOCK.getup * 0.45) / (KNOCK.getup * 0.55));
  a.p.aim = sstep((d.t - KNOCK.getup * 0.6) / (KNOCK.getup * 0.4)) * 0.6;
  a.p.speed = 0;
  a.update(Math.min(dt, 1 / 20));
  if (k >= 1) return;
  const Qm = a.Qm, Pm = a.Pm;
  for (let i = 0; i < B.weapon; i++) Qm[i].slerpQuaternions(d.Q[i], Qm[i], k);
  Pm[B.hips].lerpVectors(d.hips, Pm[B.hips], k);
  a.weaponQ.slerpQuaternions(d.wQ, a.weaponQ, k);
  a.weaponP.lerpVectors(d.wP, a.weaponP, k);
  for (let i = 1; i < NB; i++) {
    if (i === B.hips || i >= B.weapon) continue;
    const par = PARENT[i];
    Pm[i].copy(REST[i]).sub(REST[par]).applyQuaternion(Qm[par]).add(Pm[par]);
  }
  a.applyModelPose();
}
