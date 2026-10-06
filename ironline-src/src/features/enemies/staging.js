/**
 * Encenação do preset `combat` em QUALQUER mapa.
 *
 * Os papéis do esquadrão (espiada pela quina, tiro por cima de cobertura
 * baixa, flanqueador correndo, escondido recarregando, corpo caído) foram
 * afinados na MERIDIAN STREET contra a pose `combat` da rua. Em outro mapa
 * os mesmos papéis são levados para o referencial da pose `combat` do mapa
 * atual (`ctx.shotPose('combat')`, que vem de `services.world.shotPoses`) e
 * cada um procura, perto do ponto transformado, um lugar livre no mundo de
 * colisão com a exposição que o papel pede (peito visível, cobertura baixa
 * entre ele e o jogador, ou escondido). Um mapa pode publicar a cena pronta
 * em `world.shotPoses.combatScene = [{ key, position, yaw? }]`.
 *
 * `boss = true` (captura do modo SURVIVAL, `&boss=1`): o atirador da
 * cobertura baixa dá lugar ao juggernaut, de pé e em campo aberto.
 */
import * as THREE from 'three';
import { BOSS_VARIANT } from './soldier.js';

/** Pose `combat` da rua (referência dos papéis abaixo). */
const STREET_POSE = { position: [0.5, 0, 12.5], yaw: 0.05 };

/**
 * Papéis (posições absolutas na rua). `cover`: 'high' (quina, espia
 * inclinado), 'low' (atira por cima), 'open', 'hidden'.
 */
const ROLES = [
  // quina da van (x≈3.8..5.7, z≈3.6..8.4): espiada pela direita; o clarão
  // "preso" do modo combat fica no ÚLTIMO a atirar (o da jersey)
  { key: 'main', pos: [4.1, 0, 3.0], variant: 0, sc: { aim: 1, lean: -0.9, crouch: 0.38 }, cover: 'high' },
  // atrás da jersey central, atirando por cima
  { key: 'jersey', pos: [-0.9, 0, -3.75], variant: 1, sc: { fire: true, aim: 1, crouch: 0.45, interval: 0.21 }, cover: 'low' },
  // flanqueando pela calçada esquerda, corrida agachada
  { key: 'flank', pos: [-4.4, 0, 3.6], variant: 3, sc: { speed: 4.5, dir: [0.22, 0, 0.97], aim: 0.25, crouch: 0.2, face: false }, yaw: 0.22, cover: 'open' },
  // escondido atrás da jersey do fundo (recarregando)
  { key: 'hid', pos: [3.35, 0, -7.25], variant: 2, sc: { aim: 0.4, crouch: 1 }, cover: 'hidden', reload: 0.4 },
  // corpo na pista
  { key: 'dead', pos: [1.7, 0, 9.4], variant: 1, sc: { aim: 1 }, cover: 'open', dead: true },
];
/** Chefe: de pé no meio da via, fogo contínuo de metralhadora. */
const BOSS_ROLE = { key: 'boss', pos: [-0.9, 0, 5.2], boss: true, sc: { fire: true, aim: 1, crouch: 0, interval: 0.085, shots: 8 }, cover: 'open' };

const blocking = (o) => o.blocksPlayer !== false && !o.trigger && o.tag !== 'enemy' && o.tag !== 'player' && !o.data?.enemy;

/** Gira (x, z) em torno de Y por `a` (mesma convenção de `rotation.y`). */
const rot = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

export function stagingSlots(ctx, pose, boss = false) {
  const world = ctx.services.world;
  const roles = ROLES.map((r) => ({ ...r, sc: { ...r.sc } }));
  if (boss) {
    // o chefe dispara uma rajada no aquecimento e para; o atirador da jersey
    // continua (o clarão preso do modo shot fica nele, não ilumina o chefe)
    roles.push({ ...BOSS_ROLE, sc: { ...BOSS_ROLE.sc } });
  }
  // cena publicada pelo mapa
  const custom = world?.shotPoses?.combatScene;
  if (Array.isArray(custom) && custom.length) {
    return roles
      .map((r) => {
        const c = custom.find((q) => q.key === r.key);
        return c ? { ...r, position: [...c.position], yaw: c.yaw ?? r.yaw } : null;
      })
      .filter(Boolean)
      .map((r) => (r.boss ? { ...r, variant: BOSS_VARIANT } : r));
  }
  const street = (world?.mapId ?? 'street') === 'street';
  const P = pose?.position || STREET_POSE.position;
  const d = (pose?.yaw ?? STREET_POSE.yaw) - STREET_POSE.yaw;
  const eye = new THREE.Vector3(P[0], (P[1] || 0) + 1.6, P[2]);
  const taken = [];
  const out = [];
  for (const r of roles) {
    let pos;
    if (street && !r.boss) pos = [...r.pos];
    else {
      const [lx, lz] = rot(r.pos[0] - STREET_POSE.position[0], r.pos[2] - STREET_POSE.position[2], d);
      pos = freeSpot(ctx, [P[0] + lx, P[1] || 0, P[2] + lz], r.cover, eye, taken);
    }
    taken.push(pos);
    const slot = { ...r, position: pos };
    if (!street && r.sc.dir) {
      const [dx, dz] = rot(r.sc.dir[0], r.sc.dir[2], d);
      slot.sc.dir = [dx, 0, dz];
    }
    if (!street && r.yaw != null) slot.yaw = r.yaw + d;
    if (r.boss) slot.variant = BOSS_VARIANT;
    out.push(slot);
  }
  return out;
}

/**
 * Lugar livre perto de `p` para o papel: espiral de candidatos, chão na
 * mesma altura, cápsula sem colisão, distância de outros soldados, e a
 * exposição pedida em relação ao olho do jogador.
 */
export function freeSpot(ctx, p, cover, eye, taken = []) {
  const col = ctx.collision;
  const base = p[1] || 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let best = null, bs = Infinity;
  for (let r = 0; r <= 7; r++) {
    const n = r ? 8 * r : 1;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const x = p[0] + Math.cos(ang) * r * 0.8, z = p[2] + Math.sin(ang) * r * 0.8;
      const gy = col.groundHeight(x, z, base + 1.4, 3);
      if (gy == null || Math.abs(gy - base) > 0.6) continue;
      if (col.overlapSphere(a.set(x, gy + 1.0, z), 0.42, blocking).length) continue;
      if (col.overlapSphere(a.set(x, gy + 0.45, z), 0.36, blocking).length) continue;
      if (taken.some((t) => Math.hypot(t[0] - x, t[2] - z) < 1.3)) continue;
      if (Math.hypot(eye.x - x, eye.z - z) < 4) continue;
      const opt = { filter: blocking };
      const chest = col.lineOfSight(a.set(x, gy + 1.45, z), b.copy(eye), opt);
      const low = col.lineOfSight(a.set(x, gy + 0.7, z), b.copy(eye), opt);
      let s = r * 0.8;
      if (cover === 'low') s += (chest ? 0 : 6) + (low ? 3 : 0);
      else if (cover === 'hidden') s += chest ? 2 : 0;
      else if (cover === 'high') s += chest ? 0 : 5;
      else s += chest ? 0 : 6;
      if (s < bs) { bs = s; best = [x, gy, z]; }
    }
    if (best && bs < r * 0.8 + 0.5) break; // achou um bom o bastante neste anel
  }
  return best || [p[0], base, p[2]];
}
