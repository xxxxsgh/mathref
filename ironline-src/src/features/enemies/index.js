/**
 * Feature `enemies` — soldados inimigos.
 *
 *   soldier.js  modelo procedural (corpo + equipamento tático + fuzil),
 *               4 variantes de silhueta, 1 malha skinnada / 1 draw call por soldado
 *   material.js PBR com camuflagem/trama/rugas/sujeira triplanar e AO assado
 *   rig.js      esqueleto (19 ossos), IK de 2 ossos, raio × cápsula
 *   anim.js     animação procedural (marcha sem deslizar, mira, recuo,
 *               reação a impacto, recarga, agachar, inclinar)
 *   ragdoll.js  morte com ragdoll de Verlet (fuzil cai separado)
 *   nav.js      grade de navegação + mapa de coberturas (A*)
 *   brain.js    IA (percepção, cobertura, flanco, supressão, rajadas, callouts)
 *   sling.js    bandoleira de 2 pontos (ossos livres esticados entre fuzil e corpo)
 *   contact.js  sombras de contato no chão (pés, corpo, cadáver) + poças de sangue
 *
 * Contrato: services.enemies { list, spawn(pose), count() } + extras
 * (nav, squad, kill(e), clear()). Eventos: enemy:fire, enemy:damage,
 * enemy:death, enemy:callout { enemy, kind, text, position },
 * enemy:footstep { enemy, position, speed }, enemy:reload { enemy }.
 * Partes de acerto (collider.part): head, neck, torso, arm, leg.
 */
import * as THREE from 'three';
import { createSkeleton, B, rayCapsule } from './rig.js';
import { withDetail } from './geo.js';
import { buildSoldierGeometry, VARIANTS, RIFLE, REGULAR_VARIANTS, BOSS_VARIANT } from './soldier.js';
import { createSoldierMaterial, updateSoldierLighting, CAMO, setSoldierTextureSize } from './material.js';
import { ContactShadows } from './contact.js';
import { Animator } from './anim.js';
import { Ragdoll } from './ragdoll.js';
import { NavGrid } from './nav.js';
import { Brain, Squad, BOSS } from './brain.js';
import { stagingSlots } from './staging.js';
import { ROLES, ROLE_MIX, pickRole, frontal, rayObb } from './roles.js';
import { ROLE_VARIANT } from './soldier.js';
import { GUNS } from './rolegear.js';
import { buildShield, SHIELD_HALF, Glint, Laser, Pulse } from './gear.js';
import { EnemyGrenades } from './grenades.js';
import { ExplosiveProps } from './props.js';
import { startKnockdown, stepKnockdown, frameKnockdown } from './knockdown.js';
import { createPuppet, canExecute, startExecution, stepExecution, puppetExecution, EXEC } from './execution.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const MUZZLE = new THREE.Vector3(...RIFLE.muzzle);
const _inv = new THREE.Matrix4();
const _sq = new THREE.Quaternion();

// cápsulas de acerto: [osso A, osso B (ou null = esfera), raio, parte, offset em A]
const HITBOXES = [
  ['head', null, 0.125, 'head', new THREE.Vector3(0, 0.1, 0.0)],
  ['neck', 'head', 0.065, 'neck'],
  ['spine', 'neck', 0.175, 'torso'],
  ['hips', 'spine', 0.165, 'torso'],
  ['upperArm.L', 'foreArm.L', 0.062, 'arm'],
  ['foreArm.L', 'hand.L', 0.052, 'arm'],
  ['upperArm.R', 'foreArm.R', 0.062, 'arm'],
  ['foreArm.R', 'hand.R', 0.052, 'arm'],
  ['thigh.L', 'shin.L', 0.088, 'leg'],
  ['shin.L', 'foot.L', 0.066, 'leg'],
  ['thigh.R', 'shin.R', 0.088, 'leg'],
  ['shin.R', 'foot.R', 0.066, 'leg'],
].map(([a, b, r, part, off]) => ({ a: B[a], b: b ? B[b] : -1, r, part, off }));
const PART_MULT = { head: 1, neck: 1.25, torso: 1, arm: 0.8, leg: 0.75 };
/**
 * Chefe (juggernaut): blindagem pesada no tronco/membros; a viseira é o
 * ponto fraco. Explosões e faca perdem parte do efeito.
 */
const BOSS_MULT = { head: 1, neck: 0.8, torso: 0.55, arm: 0.45, leg: 0.5 };

/**
 * Região da grade de navegação, só a partir do serviço `world`:
 * `world.navBounds` (se o mapa publicar) ou `world.bounds` recortado à
 * área onde a ação acontece (pontos de nascimento do jogador e de entrada
 * inimiga + 50 m) — mapas longos (a avenida tem 210 m) não pagam a grade
 * inteira. Sem mundo: área padrão de 48 × 166 m.
 */
export function navRegion(world, pad = 50) {
  const b = world?.navBounds || world?.bounds;
  if (!b) return new THREE.Box3(new THREE.Vector3(-24, -1, -110), new THREE.Vector3(24, 10, 56));
  const r = new THREE.Box3(new THREE.Vector3(b.min.x, -1, b.min.z), new THREE.Vector3(b.max.x, 10, b.max.z));
  if (world.navBounds) return r;
  const pts = [...(world.spawnPoints || []), ...(world.enemySpawns || [])].map((s) => s.position);
  if (pts.length) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
    }
    r.min.x = Math.max(r.min.x, x0 - pad); r.max.x = Math.min(r.max.x, x1 + pad);
    r.min.z = Math.max(r.min.z, z0 - pad); r.max.z = Math.min(r.max.z, z1 + pad);
  }
  return r;
}

let nextId = 1;

class Enemy {
  constructor(feature, ctx, pose, geos, mats) {
    this.feature = feature;
    this.ctx = ctx;
    this.id = nextId++;
    const boss = !!pose.boss || !!VARIANTS[pose.variant]?.boss;
    // classe especial: pose.role ou a variante de uma classe
    const roleId = boss ? null : pose.role || (VARIANTS[pose.variant]?.role !== 'operator' ? VARIANTS[pose.variant]?.role : null);
    this.role = ROLES[roleId] || null;
    const variant = boss ? BOSS_VARIANT : this.role ? ROLE_VARIANT[this.role.id] : pose.variant ?? this.id % REGULAR_VARIANTS;
    this.variant = variant;
    this.boss = boss;
    this.muzzleLocal = new THREE.Vector3(...(GUNS[VARIANTS[variant].gun] || GUNS.rifle).muzzle);
    feature.ensureVariant(variant);
    const group = new THREE.Group();
    group.name = 'enemy-' + this.id;
    const { bones, skeleton, roots } = createSkeleton();
    const mesh = new THREE.SkinnedMesh(geos[variant], mats[variant]);
    for (const r of roots) mesh.add(r);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.noSkyOcclusion = true;
    group.userData.noSkyOcclusion = true;
    group.add(mesh);
    this.group = group;
    this.mesh = mesh;
    this.bones = bones;
    this.anim = new Animator(bones, this.id * 0.71);
    this.home = pose;
    this.maxHealth = boss ? BOSS.health : this.role?.health ?? 100;
    this.revives = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.onGround = true;
    this.ragdoll = null;
    this.deadT = 0;
    this.lastHit = null;
    this.place(pose);
    ctx.scene.add(group);
    this.brain = new Brain(this, ctx, feature.squad, feature.nav);
    this.colliderId = ctx.collision.addDynamic((box) => this.bounds(box), {
      tag: 'enemy',
      material: 'flesh',
      owner: group,
      blocksPlayer: true,
      ray: (o, d, max) => this.raycast(o, d, max),
      data: { kind: 'enemy', enemy: this, damage: (amount, info) => this.damage(amount, info) },
    });
    this.collider = ctx.collision.get(this.colliderId);
    // equipamento à parte (gear.js)
    if (this.role?.id === 'shield') {
      this.shield = buildShield();
      group.add(this.shield);
    }
    if (this.role?.id === 'sniper') {
      this.glint = new Glint(bones[B.weapon], GUNS.sniper.scope);
      this.laser = new Laser(ctx.scene);
      this._laserTo = new THREE.Vector3();
    }
  }

  /** pose do mundo: yaw no padrão do jogador (0 = olha para -Z) */
  place(pose) {
    const p = pose.position;
    this.group.position.set(p[0], p[1] ?? 0, p[2]);
    this.yaw = pose.faceYaw ?? (pose.yaw ?? 0) + Math.PI;
    this.group.rotation.set(0, this.yaw, 0);
  }

  facing(out = _w) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** AABB do colisor dinâmico */
  bounds(box) {
    if (this.ragdoll) return this.ragdoll.bounds(box);
    const p = this.group.position;
    const h = 1.9 - this.anim.p.crouch * 0.45;
    box.min.set(p.x - 0.55, p.y, p.z - 0.55);
    box.max.set(p.x + 0.55, p.y + h, p.z + 0.55);
    return box;
  }

  /** junta no mundo */
  joint(i, out) {
    this.group.updateMatrixWorld();
    return out.copy(this.anim.Pm[i]).applyMatrix4(this.group.matrixWorld);
  }

  raycast(o, d, max) {
    this.group.updateMatrixWorld();
    let best = null;
    // escudo: volume próprio na frente do corpo (parte 'shield')
    if (this.shield && this.alive && this.shield.parent === this.group) {
      this.shield.updateMatrixWorld();
      _inv.copy(this.shield.matrixWorld).invert();
      const t = rayObb(o, d, _inv, SHIELD_HALF, max);
      if (t >= 0) {
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.shield.getWorldQuaternion(_sq));
        best = { distance: t, point: o.clone().addScaledVector(d, t), normal, part: 'shield' };
        max = t;
      }
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const h of HITBOXES) {
      this.joint(h.a, a);
      if (h.off) {
        _v.copy(h.off).applyQuaternion(this.anim.Qm[h.a]);
        _v.applyQuaternion(this.group.quaternion);
        a.add(_v);
      }
      if (h.b >= 0) this.joint(h.b, b);
      else b.copy(a).y += 0.0001;
      const t = rayCapsule(o, d, a, b, h.r);
      if (t >= 0 && t <= max && (!best || t < best.distance)) {
        const point = o.clone().addScaledVector(d, t);
        // normal aproximada: do eixo da cápsula até o ponto
        const ab = b.clone().sub(a);
        const k = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
        const normal = point.clone().sub(a.clone().addScaledVector(ab, k)).normalize();
        best = { distance: t, point, normal, part: h.part };
      }
    }
    return best;
  }

  muzzleWorld(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return out.copy(this.muzzleLocal).applyQuaternion(this.anim.weaponQ).add(this.anim.weaponP).applyMatrix4(this.group.matrixWorld);
  }

  /** gira o tronco/arma para um ponto do mundo (suavizado) */
  aimAt(target, dt) {
    const g = this.group.position;
    const dx = target.x - g.x, dz = target.z - g.z;
    const dy = target.y - (g.y + 1.45 - this.anim.p.crouch * 0.4);
    const yaw = Math.atan2(dx, dz);
    const rel = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const k = 1 - Math.exp(-dt * 14);
    const p = this.anim.p;
    p.aimYaw += (THREE.MathUtils.clamp(rel, -1.1, 1.1) - p.aimYaw) * k;
    p.aimPitch += (THREE.MathUtils.clamp(pitch, -0.9, 0.9) - p.aimPitch) * k;
  }

  damage(amount, info = {}) {
    const ctx = this.ctx;
    const part = info.part || 'torso';
    // execução em andamento: só o golpe da própria execução conta
    if (this.exec && !info.execution) return;
    // finalização "segurando" a faca: o golpe normal não interrompe
    if (this.finisherLock > ctx.time.now && info.melee && !info.execution && !info.backstab) return;
    // escudo: bala/faca de frente param no aço (faísca de metal, sem dano)
    if (part === 'shield' && this.alive) return this.shieldHit(info);
    let dmg = amount * ((this.boss ? BOSS_MULT : PART_MULT)[part] ?? 1);
    if (this.boss && (info.explosion || info.melee)) dmg *= 0.7;
    // explosão de frente para o escudo: o aço segura boa parte
    if (this.shield && this.alive && info.explosion && info.point && info.dir) {
      const origin = info.point.clone().addScaledVector(info.dir, -(info.distance || 2));
      if (frontal(this.group.position, this.yaw, origin, 1.0)) dmg *= 0.4;
    }
    const dir = info.dir ? info.dir.clone().normalize() : new THREE.Vector3(0, 0, -1);
    if (!this.alive) {
      // corpo: só um tranco local (bala de fuzil não "arrasta" um corpo de
      // 80 kg); tiros perdidos de outros inimigos não mexem no cadáver
      if (this.ragdoll && info.point && info.source !== 'enemy') this.ragdoll.impulse(info.point, dir, 0.45);
      return;
    }
    this.health -= dmg;
    this.lastHit = { part, dir, point: info.point?.clone?.() };
    // `silent`: encenação de screenshot (corpo já caído) — sem eventos de HUD/áudio
    if (!info.silent) ctx.bus.emit('enemy:damage', { enemy: this, amount: dmg, info });
    const local = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    // o chefe quase não cambaleia
    this.anim.hit(local, part, Math.min(this.boss ? 0.35 : 1.5, dmg / (this.boss ? 90 : 30)));
    this.brain.onHit(dmg);
    if (this.health <= 0) this.die(info, dir);
    // slide kick (feature movement): derrubada de verdade + levantar
    else if (info.knockdown) startKnockdown(this, info);
  }

  /** Bala no escudo: o colisor vira 'metal' só para este impacto (vfx/áudio). */
  shieldHit(info) {
    const c = this.collider;
    c.material = 'metal';
    queueMicrotask(() => (c.material = 'flesh'));
    this.anim.hitPitch.v += 1.2;
    this.brain.suppress(0.08);
    if (info.source === 'player' || info.source === undefined) this.ctx.bus.emit('enemy:shieldHit', { enemy: this, info });
  }

  /** Posição do corpo (ragdoll) no chão — para o socorrista. */
  corpsePos(out = new THREE.Vector3()) {
    if (this.ragdoll) {
      const b = this.ragdoll.bounds(new THREE.Box3());
      b.getCenter(out);
      out.y = this.group.position.y;
      return out;
    }
    return out.copy(this.group.position);
  }

  /**
   * Volta à vida (socorrista): de joelhos no lugar do corpo, 50 % da vida,
   * já em combate. Quem reanima fica em `revivedBy`.
   */
  revive(by) {
    if (this.alive || this.removed) return false;
    const ctx = this.ctx;
    const c = this.corpsePos(new THREE.Vector3());
    const gy = ctx.collision.groundHeight?.(c.x, c.z, c.y + 1.5);
    this.group.position.set(c.x, Number.isFinite(gy) ? gy : c.y, c.z);
    if (by?.group) this.yaw = Math.atan2(by.group.position.x - c.x, by.group.position.z - c.z) + Math.PI;
    this.group.rotation.set(0, this.yaw, 0);
    this.ragdoll = null;
    this.alive = true;
    this.health = this.maxHealth * 0.5;
    this.deadT = 0;
    this.revives++;
    this.revivedBy = by || null;
    this.claimedBy = null;
    this.collider.data.kind = 'enemy';
    this.collider.blocksPlayer = true;
    const p = this.anim.p;
    p.crouch = 1;
    p.aim = 0;
    p.reload = -1;
    p.duck = 0;
    p.headBack = 0;
    this.anim.over.wL = this.anim.over.wR = 0;
    this.velocity.set(0, 0, 0);
    const br = this.brain;
    br.state = 'combat';
    br.mode = null;
    br.reloadT = -1;
    br.ammo = br.magSize;
    br.awareness = 1;
    br.throwT = -1;
    br.reactT = 0.8;
    if (this.shield) {
      this.shield.removeFromParent();
      this.group.add(this.shield);
      this.shieldFall = null;
    }
    this.anim.update(0);
    ctx.bus.emit('enemy:revive', { enemy: this, medic: by, phase: 'done' });
    ctx.services.vfx?.impact?.(this.group.position.clone().setY(this.group.position.y + 0.1), new THREE.Vector3(0, 1, 0), 'dirt', { scale: 1.4 });
    return true;
  }

  die(info, dir) {
    const ctx = this.ctx;
    this.alive = false;
    this.exec = null;
    this.brain.revive = null;
    this.brain.reviving = 0;
    this.brain.throwT = -1;
    this.anim.over.wL = this.anim.over.wR = 0;
    this.dropGear();
    this.health = 0;
    this.deadT = 0;
    this.collider.data.kind = 'corpse';
    this.collider.blocksPlayer = false;
    this.brain.state = 'dead';
    this.brain.releaseCover();
    // atualiza a pose atual antes de converter em partículas (se já estava
    // no chão derrubado, o mesmo ragdoll continua)
    const wasDown = this.down?.phase === 'down' && this.ragdoll;
    this.down = null;
    if (!wasDown) {
      this.anim.update(0);
      this.ragdoll = new Ragdoll(this.anim, this.group, ctx.collision, this.velocity);
    }
    const part = info?.part || 'torso';
    const pt = info?.point || this.joint(B.chest, new THREE.Vector3());
    const strength = part === 'head' ? 3.2 : part === 'leg' ? 1.6 : 2.4;
    this.ragdoll.impulse(pt, dir, strength);
    // sorteio da queda com semente própria do soldado: o mesmo tiro dá a
    // mesma queda (independe de quantas features consumiram o rng global)
    let seed = (this.id * 2654435761) % 2147483647 || 1;
    this.ragdoll.slump(_v.copy(dir).setY(0).normalize(), () => (seed = (seed * 16807) % 2147483647) / 2147483647);
    if (info?.silent) return;
    ctx.bus.emit('enemy:death', { enemy: this, info: info || {} });
    // um companheiro avisa
    const mate = this.feature.list.find((o) => o.alive && o !== this);
    if (mate) this.feature.squad.callout(mate, 'mandown', ctx.time.now, true);
  }

  /** Larga o escudo (cai no chão) e apaga laser/reflexo. */
  dropGear() {
    if (this.shield && this.shield.parent === this.group) {
      this.shield.updateMatrixWorld();
      const m = this.shield.matrixWorld.clone();
      this.ctx.scene.add(this.shield);
      m.decompose(this.shield.position, this.shield.quaternion, this.shield.scale);
      const gy = this.ctx.collision.groundHeight?.(this.shield.position.x, this.shield.position.z, this.shield.position.y + 0.5) ?? this.group.position.y;
      this.shieldFall = { t: 0, q0: this.shield.quaternion.clone(), p0: this.shield.position.clone(), gy, yaw: this.yaw };
    }
    this.laser?.update(_v, _v, this.ctx.camera, 0);
    if (this.glint) this.glint.sprite.visible = false;
  }

  /** passo fixo: IA + locomoção */
  update(dt) {
    if (this.shieldFall) {
      // escudo tomba e assenta deitado (face para cima)
      const f = this.shieldFall;
      f.t = Math.min(1, f.t + dt / 0.55);
      const e = f.t * f.t;
      const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, f.yaw, 0, 'YXZ'));
      this.shield.quaternion.copy(f.q0).slerp(flat, e);
      this.shield.position.lerpVectors(f.p0, _v.set(f.p0.x, f.gy + 0.05, f.p0.z), e);
      if (f.t >= 1) this.shieldFall = null;
    }
    if (!this.alive) {
      this.deadT += dt;
      this.ragdoll?.step(dt);
      return;
    }
    const br = this.brain;
    const p = this.anim.p;
    // derrubado (slide kick): ragdoll e depois levanta
    if (this.down) {
      stepKnockdown(this, dt);
      this.speed = 0;
      return;
    }
    // execução: a vítima segue a coreografia (sem IA, sem andar)
    if (this.exec) {
      stepExecution(this, dt, this.ctx);
      this.speed = 0;
      return;
    }
    br.update(dt);
    // suavização dos parâmetros de pose
    const k = 1 - Math.exp(-dt * 6);
    p.crouch += (br.desiredCrouch - p.crouch) * k;
    p.aim += (br.desiredAim - p.aim) * (1 - Math.exp(-dt * 9));
    p.lean += (br.leanTarget - p.lean) * k;
    p.duck += ((br.duck || 0) - p.duck) * (1 - Math.exp(-dt * 8));
    if (br.state === 'idle' && br.lookYaw != null) p.aimYaw += (br.lookYaw - p.aimYaw) * k * 0.5;
    // locomoção
    const target = br.moveDir && br.speedTarget > 0 ? _v.copy(br.moveDir).multiplyScalar(br.speedTarget * (1 - p.crouch * 0.55)) : _v.set(0, 0, 0);
    const acc = 1 - Math.exp(-dt * (br.speedTarget > 2.5 ? 5 : 8));
    this.velocity.x += (target.x - this.velocity.x) * acc;
    this.velocity.z += (target.z - this.velocity.z) * acc;
    // separação entre inimigos
    for (const o of this.feature.list) {
      if (o === this || !o.alive) continue;
      const dx = this.group.position.x - o.group.position.x, dz = this.group.position.z - o.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.6 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.velocity.x += (dx / d) * (0.8 - d) * 4 * dt * 60 * 0.05;
        this.velocity.z += (dz / d) * (0.8 - d) * 4 * dt * 60 * 0.05;
      }
    }
    this.velocity.y = this.onGround ? -0.5 : this.velocity.y - 9.8 * dt;
    const pos = this.group.position;
    if (!this.scripted || this.scripted.speed) {
      const res = this.ctx.collision.moveCapsule(pos, _w.copy(this.velocity).multiplyScalar(dt), {
        radius: 0.3,
        height: 1.75,
        stepHeight: 0.45,
        wasGrounded: this.onGround,
        filter: (c) => c.owner !== this.group && c.tag !== 'enemy' && c.tag !== 'player',
      });
      this.onGround = res.onGround;
      if (res.onGround) this.velocity.y = 0;
      if (this.scripted?.speed) {
        // pose congelada no meio da passada: volta ao ponto (só anima)
        pos.set(...this.home.position);
      }
    }
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.scripted?.speed) this.speed = this.scripted.speed;
    this.group.rotation.y = this.yaw;
    // direção do movimento no espaço do modelo
    if (this.speed > 0.05) {
      const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
      const vx = this.scripted?.speed ? br.moveDir.x : this.velocity.x / this.speed;
      const vz = this.scripted?.speed ? br.moveDir.z : this.velocity.z / this.speed;
      p.moveX = vx * c + vz * s;
      p.moveZ = -vx * s + vz * c;
    }
    p.speed = this.speed;
    // passos (cruzamento de fase da marcha) para o áudio
    const ph = this.anim.phase;
    if (this.speed > 0.6 && !this.scripted) {
      const prev = this._ph ?? ph;
      if ((prev < 0.5 && ph >= 0.5) || ph < prev) {
        this.ctx.bus.emit('enemy:footstep', { enemy: this, position: this.group.position.clone(), speed: this.speed, heavy: this.boss });
        // passo pesado do chefe: baque grave da blindagem (áudio público)
        if (this.boss && !this.ctx.shot) this.ctx.services.audio?.play?.('land_concrete', { position: this.group.position.clone(), rate: 0.62, volume: 0.9, cap: 2, jitter: 0.05 });
      }
    }
    this._ph = ph;
  }

  /** Escudo diante do peito, mão esquerda na alça (antes da animação). */
  poseShield() {
    const a = this.anim;
    const ch = a.Pm[B.chest];
    const yr = a.p.aimYaw * 0.85;
    const s = Math.sin(yr), c = Math.cos(yr);
    // frente (+Z girado) e esquerda (+X girado) no espaço do modelo
    const cx = ch.x + s * 0.44 + c * 0.1, cz = ch.z + c * 0.44 - s * 0.1;
    const cy = ch.y - 0.27;
    this.shield.position.set(cx, cy, cz);
    this.shield.rotation.set(-0.05, yr, 0);
    a.over.L.set(cx - s * 0.1 + c * 0.02, cy + 0.06, cz - c * 0.1 - s * 0.02);
    a.over.wL = 1;
  }

  /** por frame de render: animação/ragdoll → ossos */
  frame(dt) {
    if (this.down) return frameKnockdown(this, Math.min(dt, 1 / 20));
    if (this.ragdoll) {
      this.ragdoll.pose();
      return;
    }
    if (this.shield) this.poseShield();
    if (this.glint) this.frameSniper(dt);
    if (this.role?.id === 'medic') {
      const br = this.brain;
      if (br.reviving > 0 && br.revive?.corpse) {
        this.pulse ||= new Pulse(this.ctx.scene);
        const cp = br.revive.corpse.corpsePos(new THREE.Vector3());
        cp.y += 0.35;
        this.pulse.update(cp, Math.min(1, br.reviving * 1.2), this.ctx.time.now);
      } else this.pulse?.update(_v, 0, 0);
    }
    // LOD: longe da câmera anima a cada 2 frames
    const cam = this.ctx.camera.position;
    const d2 = cam.distanceToSquared(this.group.position);
    this._skip = (this._skip || 0) + 1;
    // LOD de animação: longe ou atrás da câmera anima menos vezes por segundo
    // (o custo de CPU não cresce com o número/tipo de inimigos)
    let every = d2 > 70 * 70 ? 3 : d2 > 30 * 30 ? 2 : 1;
    if (every < 3 && d2 > 15 * 15) {
      const f = this.ctx.camera.getWorldDirection(_w);
      const p = this.group.position;
      if ((p.x - cam.x) * f.x + (p.z - cam.z) * f.z < 0) every = 4;
    }
    if (this.feature.animLoad > 8 && every < 2 && d2 > 12 * 12) every = 2;
    // LOD de malha: além de ~25 m (com histerese) troca para a geometria leve
    const low = this.feature.lowGeos[this.variant];
    if (low && low !== this.feature.geos[this.variant]) {
      const far = d2 > (this.mesh.geometry === low ? 22 * 22 : 26 * 26);
      const want = far ? low : this.feature.geos[this.variant];
      if (this.mesh.geometry !== want) this.mesh.geometry = want;
    }
    if (this._skip % every) return;
    // screenshot: o corredor encenado congela no meio da passada depois do
    // aquecimento (como uma foto) — a pose não muda entre os frames de
    // acumulação temporal e não deixa "fantasma" nas pernas/fuzil
    this._animN = (this._animN || 0) + 1;
    if (this.ctx.shot && this.scripted?.speed && this._animN > 40) return;
    this.anim.update(Math.min(dt, 1 / 20));
  }

  /** Atirador: reflexo da luneta e laser (comprimento por raycast). */
  frameSniper(dt) {
    const br = this.brain;
    const ctx = this.ctx;
    const aiming = this.alive && br.state === 'combat' ? this.anim.p.aim : 0;
    this.glint.update(ctx.camera, br.charge || 0, aiming, dt);
    const on = this.alive && br.laser ? Math.max(0.25, br.charge || 0) : 0;
    const from = this.muzzleWorld(new THREE.Vector3());
    if (on > 0) {
      this._lt = (this._lt || 0) + 1;
      const dir = _w.set(0, 0, 1).applyQuaternion(this.anim.weaponQ).applyQuaternion(this.group.quaternion).normalize();
      if (this._lt % 3 === 1 || !this._laserLen) {
        const hit = ctx.collision.raycast(from, dir, 140, { filter: (c) => c.owner !== this.group && c.tag !== 'player' });
        this._laserLen = hit ? hit.distance : 140;
        // o laser "acha" o jogador: termina nele se passa rente
        const pl = ctx.player;
        const pc = _v.copy(pl.position).setY(pl.position.y + 1.3).sub(from);
        const t = pc.dot(dir);
        if (pl.alive && t > 0 && t < this._laserLen && Math.sqrt(Math.max(0, pc.lengthSq() - t * t)) < 0.35) this._laserLen = t;
      }
      this._laserTo.copy(from).addScaledVector(dir, this._laserLen);
    }
    this.laser.update(from, this._laserTo || from, ctx.camera, on);
  }

  dispose() {
    this.removed = true;
    this.laser?.dispose();
    this.glint?.dispose();
    this.pulse?.dispose();
    this.shield?.removeFromParent();
    this.ctx.scene.remove(this.group);
    this.ctx.collision.remove(this.colliderId);
    this.brain.releaseCover();
  }
}

export default {
  name: 'enemies',
  order: 50,

  async init(ctx) {
    const t0 = performance.now();
    this.ctx = ctx;
    this.list = [];
    const boot = (label, f) => ctx.bootProgress?.(label, f);
    // celular/lite: texturas 256² e AO assada em voxels mais grossos
    this.mobile = (ctx.quality?.tier ?? 'desktop') !== 'desktop';
    if (this.mobile) setSoldierTextureSize(256);
    this.geoOpts = this.mobile ? { aoVoxel: 0.02, aoDist: 0.1 } : undefined;
    // aparelho fraco (celular/lite ou q=low): TODOS os soldados com o LOD de
    // poucos polígonos e sem a população de fundo no menu (só o herói)
    this.weak = this.mobile || ctx.quality?.level === 'low';
    this.lowGeos = VARIANTS.map(() => null);
    // TODAS as variantes sob demanda (ensureVariant no spawn): só as que a
    // população inicial usa são geradas aqui, uma por vez cedendo um frame
    this.geos = VARIANTS.map(() => null);
    this.mats = VARIANTS.map(() => null);
    const initial = ctx.shot || this.weak ? [] : (ctx.services.world?.enemySpawns || []).map((sp, i) => sp.variant ?? (nextId + i) % REGULAR_VARIANTS);
    const need = [...new Set(initial)];
    if (!need.length) need.push(0);
    for (let k = 0; k < need.length; k++) {
      await boot('Soldados', k / (need.length + 2));
      this.ensureVariant(need[k]);
    }
    const tGeo = performance.now() - t0;
    await boot('Navegação', need.length / (need.length + 2));
    this.wave = 0;
    this.grenades = new EnemyGrenades(ctx);
    this.props = new ExplosiveProps(ctx);
    // chefe no preset de combate (captura do modo sobrevivência)
    if (ctx.shot?.preset?.combat && ctx.params.get('boss') === '1') this.ensureVariant(BOSS_VARIANT);
    this.squad = new Squad(ctx);
    this.contact = new ContactShadows(ctx.scene);

    // grade de navegação na região jogável
    const world = ctx.services.world;
    const region = navRegion(world);
    this.nav = null;
    if (!ctx.shot) {
      try {
        this.nav = new NavGrid(ctx.collision, region, 0.5).build();
        // orçamento de A* por passo (fatiamento de tempo): no máximo 3 buscas
        // por passo fixo para TODO o esquadrão; quem estoura tenta de novo
        // (undefined = "sem orçamento", tratado como "sem caminho agora")
        const raw = this.nav.findPath.bind(this.nav);
        this.pathBudget = 3;
        this.nav.findPath = (a, b, max) => (this.pathBudget-- > 0 ? raw(a, b, max) : undefined);
      } catch (err) {
        console.warn('[enemies] grade de navegação falhou', err);
      }
    }
    const g0 = this.geos.find((g) => g);
    this.stats = { geoMs: Math.round(tGeo), verts: g0?.attributes.position.count, tris: g0 ? g0.index.count / 3 : 0, nav: this.nav?.stats, mobile: this.mobile };

    // classes especiais: ?roles=all|rusher|sniper|shield|medic força; senão
    // entram a partir da onda ROLE_MIX.from (as ondas 1–2 são só fuzileiros)
    const forceRole = ctx.params.get('roles');
    const spawn = (pose) => {
      if (!pose.boss && pose.role === undefined && !VARIANTS[pose.variant]?.role && !ctx.shot) {
        const counts = {};
        for (const o of this.list) if (o.alive && o.role) counts[o.role.id] = (counts[o.role.id] || 0) + 1;
        const role = pickRole(this.wave, () => ctx.rng.next(), { force: this.forceRole ?? forceRole, counts });
        if (role) pose = { ...pose, role };
      }
      const e = new Enemy(this, ctx, pose, this.geos, this.mats);
      this.list.push(e);
      return e;
    };
    this.spawnFn = spawn;

    // ── percepção auditiva e supressão pelos tiros do jogador ──
    ctx.bus.on('weapon:fire', (f) => {
      if (!f?.origin) return;
      const dir = f.dir;
      for (const e of this.list) {
        if (!e.alive) continue;
        const d = e.group.position.distanceTo(f.origin);
        if (d < 70) e.brain.hear(f.origin, d / 340 + 0.15 + e.brain.reaction * 0.5);
        if (dir) {
          // distância do raio do tiro ao peito do inimigo
          const c = _v.copy(e.group.position).setY(e.group.position.y + 1.2).sub(f.origin);
          const t = c.dot(dir);
          if (t > 0) {
            const miss = Math.sqrt(Math.max(0, c.lengthSq() - t * t));
            if (miss < 2.5) e.brain.suppress(((2.5 - miss) / 2.5) * 0.4);
            // bala rente: sobressalto (lado da passagem)
            if (miss < 1.1 && miss > 0.25 && t < 120) {
              const side = Math.sign(c.x * dir.z - c.z * dir.x) || 1;
              e.anim.nearMiss(side, (1.1 - miss) / 0.85);
            }
          }
        }
      }
    });
    ctx.bus.on('weapon:hit', (h) => {
      if (!h?.point || h.collider?.data?.enemy) return;
      for (const e of this.list) if (e.alive && e.group.position.distanceToSquared(h.point) < 4) e.brain.suppress(0.25);
    });

    // ── granadas do JOGADOR: previsão simples (balística + quiques) para
    // os soldados perto do ponto de queda fugirem (e devolverem, se a
    // feature weapon publicar `throwBack`) ──
    this.playerNades = [];
    ctx.bus.on('weapon:throw', (g) => {
      if (!g?.position || !g.velocity || g.kind === 'flash') return;
      this.playerNades.push({ p: g.position.clone(), v: g.velocity.clone(), fuse: g.fuse ?? 3, t: 0 });
    });
    ctx.bus.on('weapon:grenadeBounce', (b) => {
      if (!b?.position) return;
      let best = null, bd = 3;
      for (const n of this.playerNades) {
        const d = n.p.distanceTo(b.position);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (best) {
        best.p.copy(b.position);
        best.v.multiplyScalar(0.35);
        if ((b.speed ?? 0) < 1.5) best.v.set(0, 0, 0);
      }
    });
    ctx.bus.on('match:wave', (w) => {
      this.wave = w?.wave || this.wave;
      this.waveOf = w?.of ?? Infinity;
    });
    ctx.bus.on('match:start', () => {
      this.wave = 0;
      this.grenades.clear();
      // props novos a cada partida
      if (!ctx.shot) {
        this.props.clear();
        this.props.populate(ctx.services.world, this.nav, ctx.rng.fork ? ctx.rng.fork('props') : ctx.rng);
      }
    });

    await boot('Esquadrão', (need.length + 1) / (need.length + 2));
    // ── população ──
    const preset = ctx.shot?.preset;
    if (ctx.shot) {
      if (preset?.combat) this.spawnCombatScene(ctx, preset);
    } else if (!this.weak) {
      for (const sp of world?.enemySpawns || []) spawn(sp);
    }
    // props explosivos (barris/botijões) perto das entradas e coberturas
    if (!ctx.shot) this.props.populate(world, this.nav, ctx.rng.fork ? ctx.rng.fork('props') : ctx.rng);
    else if (ctx.params.get('props') === '1') this.stageProps(ctx);

    const self = this;
    this.auto = true;
    ctx.provide('enemies', {
      list: this.list,
      spawn,
      count: () => this.list.filter((e) => e.alive).length,
      kill: (e, info = {}) => e.damage(1e4, { part: 'torso', dir: new THREE.Vector3(0, 0, -1), ...info }),
      clear: () => {
        for (const e of this.list) e.dispose();
        this.list.length = 0;
      },
      /**
       * auto = true (padrão): o esquadrão é reposto sozinho quando corpos
       * somem. A partida (hud/match.js) desliga isso e conduz as ondas.
       */
      get auto() { return self.auto; },
      set auto(v) { self.auto = !!v; },
      nav: this.nav,
      squad: this.squad,
      stats: () => this.stats,
      hitboxes: HITBOXES,
      /** nº de variantes do sorteio comum (o chefe é pedido com `spawn({ boss: true })`). */
      variants: REGULAR_VARIANTS,
      bossVariant: BOSS_VARIANT,
      boss: BOSS,
      /** Chefes vivos. */
      bosses: () => this.list.filter((e) => e.alive && e.boss),
      /** Gera a geometria do chefe antes da hora (evita engasgo ao entrar). */
      prepareBoss: () => this.ensureVariant(BOSS_VARIANT),
      /**
       * Objetivo do esquadrão (modo HARDPOINT): `{ x, y, z, radius }` ou null.
       * Com objetivo, os soldados de assalto (e quem não vê o jogador) vão
       * para a zona e lutam de dentro dela.
       */
      setObjective: (o) => (this.squad.objective = o ? { x: o.x, y: o.y ?? 0, z: o.z, radius: o.radius ?? 4.5 } : null),
      get objective() { return self.squad.objective; },
      /** Manda um soldado para o objetivo/jogador já em combate (ondas). */
      assault: (e, opts) => e?.brain?.assault?.(opts),

      // ── classes especiais (roles.js) ──
      roles: ROLES,
      roleMix: ROLE_MIX,
      /** Força/limpa a classe dos próximos spawns: null | 'all' | id. */
      setRoleForce: (r) => (this.forceRole = r),
      /** Variante de uma classe (para `spawn({ role })` ou `variant`). */
      roleVariant: (id) => ROLE_VARIANT[id],
      /** Socorrista: reanima um corpo (também chamável por QA). */
      revive: (e, by) => this.revive(e, by),

      // ── execução / marionetes (execution.js) ──
      exec: EXEC,
      /** Distância se o jogador pode executar `e` (por trás, desatento), senão -1. */
      canExecute: (e, pos = ctx.player.position) => canExecute(e, pos),
      /** Melhor alvo de execução perto do jogador (ou null). */
      executionTarget: (pos = ctx.player.position) => {
        let best = null, bd = Infinity;
        for (const e of this.list) {
          const d = canExecute(e, pos);
          if (d >= 0 && d < bd) {
            bd = d;
            best = e;
          }
        }
        return best;
      },
      /** Operador em 3ª pessoa: { group, anim, place, update, die, joint, dispose }. */
      createPuppet: (opts) => createPuppet(this, ctx, opts),
      /** Começa a execução da vítima; devolve a função de animação do atacante. */
      execute: (e, puppet) => {
        startExecution(e, puppet);
        const vPos = e.group.position.clone(), vYaw = e.yaw;
        return (P, t, from) => puppetExecution(P, t, from, vPos, vYaw, e);
      },

      // ── killcam: retratos e "fantasmas" (poses gravadas aplicadas só no render) ──
      /** Retrato compacto de todos os vivos (para o anel da killcam). */
      snapshot: () => this.snapshot(),
      ghost: {
        /** Aplica retratos (Map id → retrato) neste frame; restaura no próximo passo. */
        apply: (map) => (this.ghostMap = map),
        end: () => {
          this.ghostMap = null;
          this.restoreGhosts();
        },
      },

      // ── props e granadas ──
      props: this.props,
      grenades: this.grenades,
    });
  },

  revive(e, by) {
    return e?.revive?.(by) || false;
  },

  snapshot() {
    const out = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const g = e.group.position, p = e.anim.p;
      out.push({ id: e.id, x: g.x, y: g.y, z: g.z, yaw: e.yaw, aimYaw: p.aimYaw, aimPitch: p.aimPitch, crouch: p.crouch, aim: p.aim, speed: p.speed, moveX: p.moveX, moveZ: p.moveZ, lean: p.lean, reload: p.reload });
    }
    return out;
  },

  /** Fantasmas da killcam: aplica a pose gravada (guarda a real). */
  applyGhosts() {
    const map = this.ghostMap;
    if (!map) return;
    for (const e of this.list) {
      const s = map.get(e.id);
      if (!s || !e.alive || e.ragdoll) continue;
      if (!e._real) {
        const p = e.anim.p;
        e._real = { x: e.group.position.x, y: e.group.position.y, z: e.group.position.z, yaw: e.yaw, p: { ...p, over: undefined } };
      }
      e.group.position.set(s.x, s.y, s.z);
      e.yaw = s.yaw;
      e.group.rotation.y = s.yaw;
      Object.assign(e.anim.p, { aimYaw: s.aimYaw, aimPitch: s.aimPitch, crouch: s.crouch, aim: s.aim, speed: s.speed, moveX: s.moveX, moveZ: s.moveZ, lean: s.lean, reload: s.reload });
    }
  },
  restoreGhosts() {
    for (const e of this.list) {
      const r = e._real;
      if (!r) continue;
      e._real = null;
      e.group.position.set(r.x, r.y, r.z);
      e.yaw = r.yaw;
      e.group.rotation.y = r.yaw;
      const { over, ...p } = r.p;
      Object.assign(e.anim.p, p);
    }
  },

  /** Shot com ?props=1: alguns props diante da pose do preset. */
  stageProps(ctx) {
    const pl = ctx.shotPose(ctx.shot.name) || ctx.shot.preset.pose;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    const rx = -fz, rz = fx;
    const P = (f, r) => [pl.position[0] + fx * f + rx * r, pl.position[2] + fz * f + rz * r];
    for (const [f, r, kind] of [[6, -2.2, 'barrel'], [6.4, -1.5, 'barrel'], [5.6, -1.6, 'canister'], [8, 2.4, 'barrel'], [9, 3.0, 'canister']]) {
      const [x, z] = P(f, r);
      const y = ctx.collision.groundHeight?.(x, z, 3);
      this.props.add(kind, x, Number.isFinite(y) ? y : 0, z, f * 1.7);
    }
  },

  /** Granadas do jogador: integra a previsão e manda fugir quem está perto. */
  updatePlayerNades(dt, ctx) {
    for (let i = this.playerNades.length - 1; i >= 0; i--) {
      const n = this.playerNades[i];
      n.t += dt;
      if (n.t > n.fuse + 0.1) {
        this.playerNades.splice(i, 1);
        continue;
      }
      if (n.v.lengthSq() > 0) {
        n.v.y -= 9.8 * dt;
        n.p.addScaledVector(n.v, dt);
        const gy = ctx.collision.groundHeight?.(n.p.x, n.p.z, n.p.y + 0.5);
        if (Number.isFinite(gy) && n.p.y < gy) {
          n.p.y = gy;
          n.v.set(n.v.x * 0.3, 0, n.v.z * 0.3);
          if (n.v.lengthSq() < 0.2) n.v.set(0, 0, 0);
        }
      }
      const left = n.fuse - n.t;
      if (left > 2.4 || n.warned) continue;
      let any = false;
      for (const e of this.list) {
        if (!e.alive || e.exec || e.boss) continue;
        const d = Math.hypot(e.group.position.x - n.p.x, e.group.position.z - n.p.z);
        if (d > 5.5) continue;
        any = true;
        // devolve (gancho da weapon) se está em cima dela e há tempo
        const tb = ctx.services.weapon?.throwBack;
        if (tb && d < 2.2 && left > 1.3 && !n.thrownBack && e.brain.state !== 'idle') {
          n.thrownBack = true;
          e.brain.squad.callout(e, 'incoming', ctx.time.now, true);
          e.brain.throwT = 0;
          e.brain.thrown = true; // a granada é a do jogador (a weapon a relança)
          tb({ position: n.p.clone(), target: ctx.player.position.clone(), by: e });
          continue;
        }
        e.brain.evade(n.p);
      }
      if (any) n.warned = true;
    }
  },

  /** LOD de poucos polígonos (segmentos ~45 %, caixas sem arredondar, AO grossa). */
  buildLow(i) {
    return withDetail(0.45, () => buildSoldierGeometry(VARIANTS[i], { aoVoxel: 0.022, aoDist: 0.1 }));
  },

  /** Gera geometria/material de uma variante sob demanda (o chefe). */
  ensureVariant(i) {
    if (!this.geos[i]) {
      const t0 = performance.now();
      this.geos[i] = this.weak ? this.buildLow(i) : buildSoldierGeometry(VARIANTS[i], this.geoOpts);
      if (this.weak) this.lowGeos[i] = this.geos[i];
      if (this.stats) (this.stats.lazyGeoMs ||= {})[VARIANTS[i].name] = Math.round(performance.now() - t0);
    }
    if (!this.mats[i]) this.mats[i] = createSoldierMaterial({ camo: CAMO[VARIANTS[i].camo] || CAMO.woodland });
  },

  /**
   * Cena do preset `combat`: o esquadrão USANDO a cobertura do mapa —
   * um espia pela quina da van (inclinado, tiro com a mão direita), outro
   * atira por cima da barreira jersey meio agachado, um terceiro corre
   * agachado flanqueando pela calçada, um quarto se esconde atrás da
   * barreira do fundo e há um corpo caído na pista (ragdoll assentado).
   */
  spawnCombatScene(ctx, preset) {
    const pl = ctx.shotPose('combat') || preset.pose;
    const face = (x, z) => Math.atan2(pl.position[0] - x, pl.position[2] - z);
    const mk = (P, variant, sc, yaw) => {
      const e = this.spawnFn({ position: P, faceYaw: yaw ?? face(P[0], P[2]), variant });
      e.scripted = sc;
      e.brain.state = 'combat';
      e.brain.awareness = 1;
      e.brain.canSee = true;
      return e;
    };
    const slots = stagingSlots(ctx, pl, ctx.params.get('boss') === '1');
    let main = null, dead = null;
    for (const sl of slots) {
      const e = mk(sl.position, sl.variant, sl.sc, sl.yaw);
      if (sl.boss) e.health = e.maxHealth * 0.62; // barra do chefe já gasta na captura
      if (sl.reload != null) e.anim.p.reload = sl.reload;
      if (sl.key === 'main') main = e;
      if (sl.dead) dead = e;
    }
    for (const e of this.list) for (let i = 0; i < 40; i++) {
      e.update(1 / 60);
      e.frame(1 / 60);
    }
    const T = THREE;
    dead &&
      dead.damage(1e4, { part: 'torso', silent: true, point: dead.joint(B.chest, new T.Vector3()), dir: new T.Vector3(0.25, 0, -1).normalize() });
    if (dead) {
      for (let i = 0; i < 560; i++) dead.update(1 / 60);
      dead.frame(1 / 60);
    }
    this.main = main;
  },

  update(dt, ctx) {
    this.restoreGhosts();
    this.pathBudget = 3;
    this.animLoad = this.list.length;
    for (const e of this.list) e.update(dt);
    this.grenades.update(dt);
    this.props.update(dt);
    if (this.playerNades.length) this.updatePlayerNades(dt, ctx);
    // variantes comuns que a população inicial não usou: geradas em
    // segundo plano, uma a cada 0,6 s de jogo (antes das ondas chegarem)
    if (!ctx.shot) {
      this.warmRegT = (this.warmRegT ?? 0.6) - dt;
      if (this.warmRegT <= 0) {
        this.warmRegT = 0.6;
        const i = this.geos.findIndex((g, k) => !g && k < REGULAR_VARIANTS);
        if (i >= 0) this.ensureVariant(i);
        else {
          // desktop: LOD distante (> 25 m) das variantes já em uso
          const j = this.geos.findIndex((g, k) => g && !this.lowGeos[k] && k !== ROLE_VARIANT.operator);
          if (j >= 0) this.lowGeos[j] = this.buildLow(j);
        }
      }
    }
    // pré-aquece as variantes das classes especiais uma onda antes (sem engasgo)
    // (só se a partida tiver ondas onde elas entram: ?waves=1,1 nunca gera)
    if (!ctx.shot && ((this.wave >= ROLE_MIX.from - 1 && (this.waveOf ?? Infinity) >= ROLE_MIX.from) || ctx.params.get('roles'))) {
      this.warmT = (this.warmT ?? 0) - dt;
      if (this.warmT <= 0) {
        this.warmT = 0.8;
        const id = ['rusher', 'sniper', 'shield', 'medic'].find((r) => !this.geos[ROLE_VARIANT[r]]);
        if (id) this.ensureVariant(ROLE_VARIANT[id]);
      }
    }
    // corpos somem e o esquadrão é reposto (fora do modo screenshot)
    if (!ctx.shot) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (!e.alive && e.deadT > 20 && !e.claimedBy?.alive) {
          e.dispose();
          this.list.splice(i, 1);
          this.respawnT = (this.respawnT ?? 0) + 1;
        }
      }
      if (this.auto === false) this.respawnT = 0;
      if (this.respawnT > 0) {
        const spawns = ctx.services.world?.enemySpawns || [];
        const pl = ctx.player.position;
        const far = spawns.filter((s) => Math.hypot(s.position[0] - pl.x, s.position[2] - pl.z) > 28);
        if (far.length) {
          this.spawnFn(far[Math.floor(ctx.rng.next() * far.length)]);
          this.respawnT--;
        }
      }
      if (!this.list.some((e) => e.alive && e.brain.state === 'combat') && ctx.time.now - this.squad.lastSeen > 25) this.squad.alert = false;
    }
  },

  frame(dt, ctx) {
    const fdt = ctx.time.virtual ? 1 / 60 : dt;
    updateSoldierLighting(ctx);
    this.applyGhosts();
    this.props.frame(ctx.time.virtual ? ctx.time.now : performance.now() * 0.001);
    for (const e of this.list) e.frame(fdt);
    this.contact.update(this.list);
  },

  dispose(ctx) {
    this.grenades?.clear();
    this.props?.clear();
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    this.contact?.mesh.removeFromParent();
    this.contact?.blood?.removeFromParent();
  },
};
