/**
 * Execução (finishing move) e "marionetes" de 3ª pessoa.
 *
 * createPuppet(feature, ctx)  soldado OPERADOR (o jogador visto de fora:
 *   variante 'operator', coyote/árido com NVG) com o mesmo esqueleto,
 *   Animator e ragdoll dos inimigos — sem IA nem colisor. Usado pela
 *   execução (atacante) e pela killcam (o jogador abatido).
 *
 * canExecute(e, playerPos, playerYaw)  pura o bastante para testar: inimigo
 *   vivo, desatento (idle/alert sem enxergar o jogador), não chefe, de COSTAS
 *   para o jogador (o jogador está atrás dele, cone de 110°), a < 1,9 m.
 *
 * Coreografia (2,4 s), dirigida por stepExecution (vítima, no passo fixo
 * do inimigo) e puppetExecution (atacante, por frame):
 *   0,00–0,35  atacante avança até 0,5 m das costas da vítima
 *   0,35       mão esquerda agarra o capacete; a cabeça vai para trás
 *   0,75/1,05  dois golpes de faca no pescoço (sangue, tranco)
 *   1,10–1,60  joelhos cedem
 *   1,60       morte: ragdoll tomba para a frente (enemy:death normal com
 *              info { source:'player', weapon:'knife', melee, execution })
 *   1,60–2,40  atacante solta e recua meio passo
 */
import * as THREE from 'three';
import { createSkeleton, B } from './rig.js';
import { Animator } from './anim.js';
import { Ragdoll } from './ragdoll.js';
import { ROLE_VARIANT } from './soldier.js';
import { buildKnife } from './gear.js';

export const EXEC = { duration: 2.4, grab: 0.35, stabs: [0.75, 1.05], kill: 1.6, reach: 1.9 };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * O jogador (pés em `pp`) pode executar `e`? Retorna a distância ou -1.
 * `e` precisa de { alive, boss, exec, group.position, yaw, brain{state,canSee,awareness} }.
 */
export function canExecute(e, pp) {
  if (!e?.alive || e.boss || e.exec || e.down || e.scripted) return -1;
  const br = e.brain;
  // desatento: não enxerga o jogador (e, em combate, já o perdeu de vista)
  if (!br || br.canSee || (br.state === 'combat' && (br.lostFor ?? 0) < 1.2)) return -1;
  const p = e.group.position;
  const dx = pp.x - p.x, dz = pp.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > EXEC.reach || d < 0.2 || Math.abs(pp.y - p.y) > 0.6) return -1;
  // jogador atrás dele: o vetor inimigo→jogador aponta contra a frente dele
  const c = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / d;
  return c < -Math.cos((55 * Math.PI) / 180) ? d : -1;
}

export function createPuppet(feature, ctx, { variant = ROLE_VARIANT.operator, knife = true } = {}) {
  feature.ensureVariant(variant);
  const group = new THREE.Group();
  group.name = 'puppet';
  const { bones, skeleton, roots } = createSkeleton();
  const mesh = new THREE.SkinnedMesh(feature.geos[variant], feature.mats[variant]);
  for (const r of roots) mesh.add(r);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  group.userData.noSkyOcclusion = true;
  ctx.scene.add(group);
  const anim = new Animator(bones, 3.3);
  let blade = null;
  if (knife) {
    blade = buildKnife();
    // empunhadura reversa: lâmina saindo para baixo/frente da mão
    blade.position.set(0, -0.075, 0.03);
    blade.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.25);
    blade.visible = false;
    bones[B['hand.R']].add(blade);
  }
  const P = {
    group, mesh, anim, bones, knife: blade, ragdoll: null, velocity: new THREE.Vector3(),
    /** pose no mundo: `yaw` na convenção do MODELO (0 = olha para +Z) */
    place(pos, yaw) {
      group.position.copy(pos);
      group.rotation.set(0, yaw, 0);
      P.yaw = yaw;
    },
    joint(i, out) {
      group.updateMatrixWorld();
      return out.copy(anim.Pm[i]).applyMatrix4(group.matrixWorld);
    },
    update(dt) {
      if (P.ragdoll) {
        P.ragdoll.step(Math.min(dt, 1 / 30));
        P.ragdoll.pose();
      } else anim.update(Math.min(dt, 1 / 20));
    },
    /** cai em ragdoll (killcam: o jogador abatido) */
    die(dir, point) {
      anim.update(0);
      P.ragdoll = new Ragdoll(anim, group, ctx.collision, P.velocity);
      P.ragdoll.impulse(point || P.joint(B.chest, new THREE.Vector3()), dir.clone().normalize(), 2.4);
      let seed = 9301;
      P.ragdoll.slump(_v.copy(dir).setY(0).normalize(), () => (seed = (seed * 16807) % 2147483647) / 2147483647);
    },
    dispose() {
      group.removeFromParent();
    },
  };
  return P;
}

/** Inicia a execução na vítima (para a IA, trava o dano de terceiros). */
export function startExecution(e, puppet) {
  e.exec = { t: 0, puppet, stabbed: 0, dead: false };
  e.brain.state = 'combat';
  e.brain.mode = 'exec';
  e.brain.speedTarget = 0;
  e.brain.releaseCover?.();
  e.velocity.set(0, 0, 0);
}

/** Passo da vítima (chamado pelo Enemy.update no lugar da IA). */
export function stepExecution(e, dt, ctx) {
  const x = e.exec;
  x.t += dt;
  const t = x.t;
  const p = e.anim.p;
  const k = 1 - Math.exp(-dt * 10);
  const grab = sstep(EXEC.grab, EXEC.grab + 0.18, t);
  p.headBack += (grab * (1 - sstep(1.2, 1.6, t)) - p.headBack) * k;
  p.aim += (0 - p.aim) * k;
  p.crouch += (0.15 + sstep(1.1, 1.55, t) * 0.75 - p.crouch) * k;
  p.speed = 0;
  p.duck = 0;
  // golpes: tranco para a frente + sangue no pescoço
  for (let i = 0; i < EXEC.stabs.length; i++) {
    if (x.stabbed <= i && t >= EXEC.stabs[i]) {
      x.stabbed = i + 1;
      e.anim.hit(new THREE.Vector3(0.3 * (i ? -1 : 1), 0, 1), 'torso', 1.3);
      e.anim.headHit.v += 6;
      const neck = e.joint(B.neck, new THREE.Vector3());
      const fwd = e.facing(new THREE.Vector3());
      ctx.services.vfx?.blood?.(neck, fwd.clone(), fwd.clone());
      ctx.services.audio?.play?.('imp_flesh', { position: neck, volume: 1, cap: 4 });
    }
  }
  if (!x.dead && t >= EXEC.kill) {
    x.dead = true;
    const dir = e.facing(new THREE.Vector3()).setY(-0.2).normalize();
    const point = e.joint(B.neck, new THREE.Vector3());
    e.exec = null;
    e.damage(1e4, { part: 'neck', dir, point, source: 'player', weapon: 'knife', melee: true, execution: true });
    e.execDone = true;
  }
}

/**
 * Atacante por frame: anda até as costas da vítima, agarra, golpeia.
 * `from` = posição inicial (pés do jogador), `victim` = Enemy (posição e
 * guinada guardadas no início, já que ele cai no meio).
 */
export function puppetExecution(P, t, from, vPos, vYaw, victim) {
  const fwd = _v.set(Math.sin(vYaw), 0, Math.cos(vYaw));
  const end = _w.copy(vPos).addScaledVector(fwd, -0.5);
  const a = sstep(0, EXEC.grab, t);
  const back = sstep(1.7, 2.3, t);
  const pos = new THREE.Vector3().lerpVectors(from, end, a).addScaledVector(fwd, -0.35 * back);
  P.place(pos, vYaw);
  const p = P.anim.p;
  const moving = t < EXEC.grab ? from.distanceTo(end) / EXEC.grab : back > 0 && back < 1 ? 0.6 : 0;
  p.speed = moving;
  p.moveX = 0;
  p.moveZ = back > 0 && back < 1 ? -1 : 1;
  p.aim = 0;
  p.crouch = 0.12 + sstep(1.1, 1.55, t) * 0.35 * (1 - back);
  p.aimPitch = -0.25;
  p.aimYaw = 0;
  if (P.knife) P.knife.visible = t > 0.25 && t < 2.15;
  // mão esquerda no capacete da vítima (até ela cair)
  const ov = P.anim.over;
  const grip = sstep(0.25, EXEC.grab + 0.08, t) * (1 - sstep(1.45, 1.75, t));
  if (victim && victim.alive !== false && grip > 0) {
    const head = victim.joint ? victim.joint(B.head, new THREE.Vector3()) : vPos.clone().setY(vPos.y + 1.6);
    head.addScaledVector(fwd, -0.06).y += 0.06;
    P.group.updateMatrixWorld();
    ov.L.copy(P.group.worldToLocal(head));
  }
  ov.wL = grip;
  // mão direita: recua e golpeia duas vezes no pescoço (lado direito dele)
  let stab = 0, wind = 0;
  for (const s of EXEC.stabs) {
    wind = Math.max(wind, sstep(s - 0.22, s - 0.08, t) * (1 - sstep(s - 0.08, s, t)));
    stab = Math.max(stab, sstep(s - 0.08, s, t) * (1 - sstep(s + 0.06, s + 0.2, t)));
  }
  const hip = new THREE.Vector3(-0.24, 1.0, 0.1);
  const windP = new THREE.Vector3(-0.3, 1.25, -0.08);
  let neck = new THREE.Vector3(-0.06, 1.48, 0.42);
  if (victim && victim.alive !== false) {
    const n = victim.joint ? victim.joint(B.neck, new THREE.Vector3()) : vPos.clone().setY(vPos.y + 1.5);
    P.group.updateMatrixWorld();
    neck = P.group.worldToLocal(n).add(new THREE.Vector3(-0.08, 0, -0.02));
  }
  const R = hip.clone().lerp(windP, wind).lerp(neck, stab);
  ov.R.copy(R);
  ov.wR = sstep(0.3, 0.5, t) * (1 - sstep(1.6, 2.0, t));
}
