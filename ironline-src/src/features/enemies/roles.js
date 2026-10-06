/**
 * Classes especiais de inimigo (além do fuzileiro comum):
 *
 *   rusher  ARROMBADOR — escopeta, máscara de gás. Não procura cobertura:
 *           corre direto (A*) até 4–5 m do jogador e dispara cartuchos de 8
 *           bagos; strafe curto quando chega; recarga longa de 6 cartuchos.
 *   sniper  ATIRADOR DE ELITE — fuzil de ferrolho com luneta. Fica longe
 *           (recua se o jogador chegar a < 20 m), ajoelhado, com LASER
 *           visível e REFLEXO na luneta (mais forte quanto mais ele aponta
 *           para a câmera). Carrega a mira (~1,6 s com o laser no alvo) e
 *           dispara um tiro de 55; ferrolho de 1,4 s; muda de posição depois
 *           de 3 tiros ou sob supressão.
 *   shield  ESCUDEIRO — escudo balístico no braço esquerdo, fuzil numa mão
 *           só. Avança devagar de frente (imune pela frente: o escudo é um
 *           volume de acerto próprio, parte `shield`), gira devagar (1,7
 *           rad/s) — flanqueie ou use explosivos/faca pelas costas.
 *   medic   SOCORRISTA — luta como fuzileiro, mas corre até companheiros
 *           abatidos há < 14 s (até 30 m), ajoelha 3,2 s e os REANIMA (o
 *           corpo volta de joelhos com 50 % da vida). Tiro nele durante a
 *           reanimação interrompe.
 *
 * Funções puras (testadas em enemies.test.mjs): pickRole, frontal,
 * rayObb, pickReviveTarget, lobVelocity.
 */
import * as THREE from 'three';

/** Armas por classe (dano no jogador por tiro/bago, cadência, carregador). */
export const GUNCFG = {
  rifle: { burst: [3, 7], pause: [0.35, 1.05], interval: 0.095, mag: 30, reload: 2.4, damage: 10, pellets: 1 },
  shotgun: { burst: [1, 1], pause: [0.8, 1.0], interval: 0.9, mag: 6, reload: 3.1, damage: 7.5, pellets: 8, spread: 0.06, range: 17 },
  sniper: { burst: [1, 1], pause: [0, 0], interval: 1.4, mag: 5, reload: 3.2, damage: 55, pellets: 1, charge: 1.6 },
  shield: { burst: [2, 4], pause: [0.5, 1.2], interval: 0.12, mag: 30, reload: 2.8, damage: 8, pellets: 1, err: 0.02 },
};

export const ROLES = {
  rusher: { id: 'rusher', name: 'BREACHER', health: 130, speed: 5.1, gun: 'shotgun' },
  sniper: { id: 'sniper', name: 'MARKSMAN', health: 90, gun: 'sniper', minDist: 20 },
  shield: { id: 'shield', name: 'SHIELD', health: 120, speed: 1.9, turn: 1.7, gun: 'shield' },
  medic: { id: 'medic', name: 'MEDIC', health: 100, gun: 'rifle', reviveTime: 3.2, reviveRange: 30, reviveWindow: 14 },
};

/** Mistura de classes por onda: [id, peso]. Ondas < `from` só fuzileiros. */
export const ROLE_MIX = { from: 3, weights: [['rusher', 0.16], ['sniper', 0.1], ['shield', 0.1], ['medic', 0.12]] };

/**
 * Sorteia a classe de um soldado que entra (null = fuzileiro comum).
 * `wave` = onda atual (0 = sem partida), `r()` → [0,1), `opts.force` força
 * uma classe ('all' = sorteia sempre entre as especiais), `opts.from`
 * substitui a onda mínima. `opts.counts` = { classe: vivos } limita
 * atiradores/escudeiros a 2 vivos.
 */
export function pickRole(wave, r, opts = {}) {
  if (opts.force && opts.force !== 'all' && ROLES[opts.force]) return opts.force;
  const from = opts.from ?? ROLE_MIX.from;
  if (opts.force !== 'all' && !(wave >= from)) return null;
  const counts = opts.counts || {};
  const pool = ROLE_MIX.weights.filter(([id]) => !((id === 'sniper' || id === 'shield') && (counts[id] || 0) >= 2));
  const total = pool.reduce((a, [, w]) => a + w, 0);
  const scale = opts.force === 'all' ? 1 / total : 1;
  let x = r();
  for (const [id, w] of pool) {
    x -= w * scale;
    if (x < 0) return id;
  }
  return null;
}

/**
 * O ponto `p` (mundo) está à FRENTE de quem olha com guinada `yaw`
 * (convenção do soldado: 0 = olha para +Z) dentro do semi-ângulo `half`?
 */
export function frontal(pos, yaw, p, half = Math.PI / 3) {
  const dx = p.x - pos.x, dz = p.z - pos.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return false;
  const c = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / l;
  return c > Math.cos(half);
}

/**
 * Raio × caixa orientada. `inv` = Matrix4 mundo→local da caixa, `half` =
 * meias-medidas (Vector3). Retorna a distância t ≥ 0 ou -1.
 */
export function rayObb(o, d, inv, half, maxT = Infinity) {
  const lo = _o.copy(o).applyMatrix4(inv);
  const ld = _d.copy(d).transformDirection(inv);
  // transformDirection normaliza: corrige a escala (sem escala na prática)
  let t0 = -Infinity, t1 = Infinity;
  for (const k of ['x', 'y', 'z']) {
    const h = half[k];
    if (Math.abs(ld[k]) < 1e-9) {
      if (lo[k] < -h || lo[k] > h) return -1;
      continue;
    }
    let a = (-h - lo[k]) / ld[k], b = (h - lo[k]) / ld[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  const t = t0 >= 0 ? t0 : t1;
  return t >= 0 && t <= maxT ? t : -1;
}
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Socorrista escolhe quem reanimar: corpo morto há < window s, a < range m,
 * não reclamado por outro socorrista, não chefe, não já reanimado 2 vezes.
 * `corpses` = [{ id, x, z, deadT, claimed, boss, revives }]. Retorna o mais
 * perto (ou null).
 */
export function pickReviveTarget(me, corpses, { range = 30, window = 14 } = {}) {
  let best = null, bd = Infinity;
  for (const c of corpses) {
    if (c.boss || c.claimed || c.deadT > window || (c.revives || 0) >= 2) continue;
    const d = Math.hypot(c.x - me.x, c.z - me.z);
    if (d > range || d >= bd) continue;
    bd = d;
    best = c;
  }
  return best;
}

/**
 * Velocidade de lançamento para um arremesso em parábola de `a` até `b`
 * com tempo de voo proporcional à distância (granada). Retorna
 * { x, y, z, t } (t = tempo de voo).
 */
export function lobVelocity(a, b, g = 9.8, k = 0.09, tMin = 0.7) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const t = Math.max(tMin, Math.min(1.8, dist * k));
  return { x: dx / t, y: (dy + 0.5 * g * t * t) / t, z: dz / t, t };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ─── comportamentos (chamados por Brain.combat) ──────────────────────────

/** ARROMBADOR: corre direto até perto e despeja cartuchos. */
export function combatRusher(br, dt, dist, threat) {
  const e = br.e;
  const pos = e.group.position;
  const role = ROLES.rusher;
  br.leanTarget = 0;
  br.desiredCrouch = 0;
  if (!br._rushCalled) {
    br._rushCalled = true;
    br.squad.callout(e, 'breach', br.now);
  }
  const stop = br.canSee ? 4.2 : 1.2;
  br.repathT = (br.repathT ?? 0) - dt;
  if (br.repathT <= 0) {
    br.repathT = 0.8;
    br.path = dist > stop ? (br.nav ? br.nav.findPath(pos, threat, 9000) : [threat.clone()]) : null;
    br.pathI = 0;
  }
  if (br.path && dist > stop) {
    br.followPath(dt, dist > 9 ? role.speed : 3.4);
    br.desiredAim = br.canSee && dist < 14 ? 1 : 0.3;
  } else {
    // perto: passo lateral curto e tiro
    br.strafeT -= dt;
    if (br.strafeT <= 0) {
      br.strafeT = 0.6 + br.r(0, 0.8);
      br.strafeDir = br.ctx.rng.next() < 0.5 ? -1 : 1;
    }
    br.strafe(dt, threat);
    br.desiredAim = 1;
  }
  if (br.canSee && dist < GUNCFG.shotgun.range) br.aimAndFire(dt, dist, 1);
  else if (br.speedTarget > 0.3) br.faceMove(dt);
  else br.faceTowards(threat, dt, 5);
}

/** ATIRADOR: fica longe, ajoelhado, carrega o tiro com o laser no alvo. */
export function combatSniper(br, dt, dist, threat) {
  const e = br.e;
  const pos = e.group.position;
  br.leanTarget = 0;
  if (!br._perchCalled && br.canSee) {
    br._perchCalled = true;
    br.squad.callout(e, 'sniper', br.now);
  }
  // perto demais (ou supressão/3 tiros): reposiciona
  br.relocT = (br.relocT ?? 0) - dt;
  const tooClose = dist < ROLES.sniper.minDist;
  if ((tooClose || br.suppression > 1.05 || (br.shotsHere || 0) >= 3) && br.relocT <= 0 && br.mode !== 'move') {
    br.relocT = 4;
    br.shotsHere = 0;
    const away = new THREE.Vector3(pos.x - threat.x, 0, pos.z - threat.z).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(br.ctx.rng.next() < 0.5 ? -1 : 1);
    const goal = pos.clone().addScaledVector(away, tooClose ? 14 : 6).addScaledVector(side, 6);
    const path = br.nav?.findPath(pos, goal, 9000);
    if (path) {
      br.releaseCover();
      br.path = path;
      br.pathI = 0;
      br.setMode('move');
      br.squad.callout(e, 'moving', br.now);
    }
  }
  if (br.mode === 'move') {
    br.charge = 0;
    br.desiredCrouch = 0;
    br.desiredAim = 0.25;
    const arrived = br.followPath(dt, 3.6);
    br.faceMove(dt);
    if (arrived) br.setMode('perch');
    return;
  }
  br.mode = 'perch';
  br.speedTarget = 0;
  br.desiredCrouch = 0.85; // ajoelhado
  br.desiredAim = 1;
  const gun = GUNCFG.sniper;
  const tgt = br.targetPoint(new THREE.Vector3());
  br.faceTowards(tgt, dt, 2.2);
  e.aimAt(tgt, dt);
  br.boltT = Math.max(0, (br.boltT ?? 0) - dt);
  const ready = br.canSee && br.reloadT < 0 && br.ammo > 0 && br.boltT <= 0 && br.flinch <= 0;
  // carga: cai rápido se perde o alvo ou leva tiro
  br.charge = ready ? Math.min(1, (br.charge || 0) + (dt / gun.charge) * br.skill) : Math.max(0, (br.charge || 0) - dt * 1.5);
  br.laser = br.canSee && br.reloadT < 0 ? 1 : 0;
  if (ready && br.charge >= 1) {
    br.charge = 0;
    br.boltT = gun.interval;
    br.shotsHere = (br.shotsHere || 0) + 1;
    br.fireShot(dist);
  }
}

/** ESCUDEIRO: avança de frente com o escudo, gira devagar. */
export function combatShield(br, dt, dist, threat) {
  const e = br.e;
  const pos = e.group.position;
  const role = ROLES.shield;
  br.leanTarget = 0;
  br.desiredCrouch = 0.18;
  if (!br._shieldCalled && br.canSee) {
    br._shieldCalled = true;
    br.squad.callout(e, 'shield', br.now);
  }
  const stop = br.canSee ? 7 : 2;
  br.repathT = (br.repathT ?? 0) - dt;
  if (br.repathT <= 0) {
    br.repathT = 1.1;
    br.path = dist > stop ? (br.nav ? br.nav.findPath(pos, threat, 9000) : [threat.clone()]) : null;
    br.pathI = 0;
  }
  if (br.path && dist > stop) br.followPath(dt, role.speed);
  else br.speedTarget = 0;
  // gira DEVAGAR para o jogador (é o que permite flanquear)
  const want = Math.atan2(threat.x - pos.x, threat.z - pos.z);
  const d = wrap(want - e.yaw);
  e.yaw += Math.sign(d) * Math.min(Math.abs(d), role.turn * dt);
  br.desiredAim = br.canSee ? 1 : 0.6;
  // atira só com o alvo dentro do arco do escudo
  if (br.canSee && Math.abs(d) < 0.6) br.aimAndFire(dt, dist, 0.8, true);
  else {
    const tgt = br.targetPoint(new THREE.Vector3());
    e.aimAt(tgt, dt);
  }
}

/**
 * SOCORRISTA: decide reanimar (antes da decisão normal). true = ocupado
 * com a reanimação (Brain.combat não segue).
 */
export function medicThink(br, dt) {
  const e = br.e;
  const role = ROLES.medic;
  const feat = e.feature;
  const rv = br.revive;
  if (rv) {
    const c = rv.corpse;
    if (c.alive || c.removed) {
      br.revive = null;
      return false;
    }
    const pos = e.group.position;
    const cp = c.corpsePos(new THREE.Vector3());
    const d = Math.hypot(cp.x - pos.x, cp.z - pos.z);
    if (rv.phase === 'go') {
      br.desiredAim = 0.3;
      br.desiredCrouch = 0;
      br.leanTarget = 0;
      const arrived = br.followPath(dt, 4.4) || d < 0.95;
      br.faceMove(dt);
      if (arrived || d < 0.95) {
        rv.phase = 'kneel';
        rv.t = 0;
        br.speedTarget = 0;
        br.squad.callout(e, 'reviving', br.now, true);
        br.ctx.bus.emit('enemy:revive', { enemy: c, medic: e, phase: 'start' });
      } else if ((rv.goT = (rv.goT || 0) + dt) > 12) {
        c.claimedBy = null;
        br.revive = null;
      }
      return true;
    }
    // ajoelhado sobre o corpo
    br.speedTarget = 0;
    br.desiredCrouch = 1;
    br.desiredAim = 0.05;
    br.faceTowards(cp, dt, 4);
    rv.t += dt;
    br.reviving = rv.t / role.reviveTime;
    if (rv.t >= role.reviveTime) {
      feat.revive(c, e);
      br.revive = null;
      br.reviving = 0;
      br.squad.callout(e, 'revived', br.now, true);
    }
    return true;
  }
  br.reviveCheckT = (br.reviveCheckT ?? 0) - dt;
  if (br.reviveCheckT > 0) return false;
  br.reviveCheckT = 0.6;
  // não larga o tiroteio se o jogador está a < 8 m
  if (br.canSee && e.group.position.distanceTo(br.ctx.player.position) < 8) return false;
  const corpses = feat.list
    .filter((o) => !o.alive && o.ragdoll && !o.removed)
    .map((o) => {
      const p = o.corpsePos(new THREE.Vector3());
      return { id: o.id, x: p.x, z: p.z, deadT: o.deadT, claimed: o.claimedBy && o.claimedBy !== e && o.claimedBy.alive, boss: o.boss, revives: o.revives, o };
    });
  const best = pickReviveTarget(e.group.position, corpses, { range: role.reviveRange, window: role.reviveWindow });
  if (!best) return false;
  const goal = new THREE.Vector3(best.x, e.group.position.y, best.z);
  const path = br.nav ? br.nav.findPath(e.group.position, goal, 9000) : [goal];
  if (!path) return false;
  best.o.claimedBy = e;
  br.releaseCover();
  br.path = path;
  br.pathI = 0;
  br.revive = { corpse: best.o, phase: 'go', t: 0 };
  br.squad.callout(e, 'medic', br.now, true);
  return true;
}
