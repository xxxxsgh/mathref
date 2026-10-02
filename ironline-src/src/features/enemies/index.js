/**
 * Feature `enemies` — soldados inimigos.
 *
 *   soldier.js  modelo procedural (corpo + equipamento tático + fuzil),
 *               3 variantes, 1 malha skinnada / 1 draw call por soldado
 *   material.js PBR com camuflagem/trama/rugas/sujeira triplanar e AO assado
 *   rig.js      esqueleto (19 ossos), IK de 2 ossos, raio × cápsula
 *   anim.js     animação procedural (marcha sem deslizar, mira, recuo,
 *               reação a impacto, recarga, agachar, inclinar)
 *   ragdoll.js  morte com ragdoll de Verlet (fuzil cai separado)
 *   nav.js      grade de navegação + mapa de coberturas (A*)
 *   brain.js    IA (percepção, cobertura, flanco, supressão, rajadas, callouts)
 *   sling.js    bandoleira de 2 pontos (ossos livres esticados entre fuzil e corpo)
 *   contact.js  sombras de contato no chão (pés, corpo, cadáver) — 1 draw call
 *
 * Contrato: services.enemies { list, spawn(pose), count() } + extras
 * (nav, squad, kill(e), clear()). Eventos: enemy:fire, enemy:damage,
 * enemy:death, enemy:callout { enemy, kind, text, position },
 * enemy:footstep { enemy, position, speed }, enemy:reload { enemy }.
 * Partes de acerto (collider.part): head, neck, torso, arm, leg.
 */
import * as THREE from 'three';
import { createSkeleton, B, rayCapsule } from './rig.js';
import { buildSoldierGeometry, VARIANTS, RIFLE } from './soldier.js';
import { createSoldierMaterial, updateSoldierLighting, CAMO } from './material.js';
import { ContactShadows } from './contact.js';
import { Animator } from './anim.js';
import { Ragdoll } from './ragdoll.js';
import { NavGrid } from './nav.js';
import { Brain, Squad } from './brain.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const MUZZLE = new THREE.Vector3(...RIFLE.muzzle);

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

let nextId = 1;

class Enemy {
  constructor(feature, ctx, pose, geos, mats) {
    this.feature = feature;
    this.ctx = ctx;
    this.id = nextId++;
    const variant = pose.variant ?? this.id % VARIANTS.length;
    this.variant = variant;
    const group = new THREE.Group();
    group.name = 'enemy-' + this.id;
    const { bones, skeleton, roots } = createSkeleton();
    const mesh = new THREE.SkinnedMesh(geos[variant], mats[variant % mats.length]);
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
    this.health = 100;
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
    return out.copy(MUZZLE).applyQuaternion(this.anim.weaponQ).add(this.anim.weaponP).applyMatrix4(this.group.matrixWorld);
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
    const dmg = amount * (PART_MULT[part] ?? 1);
    const dir = info.dir ? info.dir.clone().normalize() : new THREE.Vector3(0, 0, -1);
    if (!this.alive) {
      // corpo: só física
      if (this.ragdoll && info.point) this.ragdoll.impulse(info.point, dir, 1.6);
      return;
    }
    this.health -= dmg;
    this.lastHit = { part, dir, point: info.point?.clone?.() };
    // `silent`: encenação de screenshot (corpo já caído) — sem eventos de HUD/áudio
    if (!info.silent) ctx.bus.emit('enemy:damage', { enemy: this, amount: dmg, info });
    const local = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    this.anim.hit(local, part, Math.min(1.5, dmg / 30));
    this.brain.onHit(dmg);
    if (this.health <= 0) this.die(info, dir);
  }

  die(info, dir) {
    const ctx = this.ctx;
    this.alive = false;
    this.health = 0;
    this.deadT = 0;
    this.collider.data.kind = 'corpse';
    this.collider.blocksPlayer = false;
    this.brain.state = 'dead';
    this.brain.releaseCover();
    // atualiza a pose atual antes de converter em partículas
    this.anim.update(0);
    this.ragdoll = new Ragdoll(this.anim, this.group, ctx.collision, this.velocity);
    const part = info?.part || 'torso';
    const pt = info?.point || this.joint(B.chest, new THREE.Vector3());
    const strength = part === 'head' ? 3.2 : part === 'leg' ? 1.6 : 2.4;
    this.ragdoll.impulse(pt, dir, strength);
    this.ragdoll.slump(_v.copy(dir).setY(0).normalize(), () => ctx.rng.next());
    if (info?.silent) return;
    ctx.bus.emit('enemy:death', { enemy: this, info: info || {} });
    // um companheiro avisa
    const mate = this.feature.list.find((o) => o.alive && o !== this);
    if (mate) this.feature.squad.callout(mate, 'mandown', ctx.time.now, true);
  }

  /** passo fixo: IA + locomoção */
  update(dt) {
    if (!this.alive) {
      this.deadT += dt;
      this.ragdoll?.step(dt);
      return;
    }
    const br = this.brain;
    br.update(dt);
    const p = this.anim.p;
    // suavização dos parâmetros de pose
    const k = 1 - Math.exp(-dt * 6);
    p.crouch += (br.desiredCrouch - p.crouch) * k;
    p.aim += (br.desiredAim - p.aim) * (1 - Math.exp(-dt * 9));
    p.lean += (br.leanTarget - p.lean) * k;
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
      if ((prev < 0.5 && ph >= 0.5) || ph < prev) this.ctx.bus.emit('enemy:footstep', { enemy: this, position: this.group.position.clone(), speed: this.speed });
    }
    this._ph = ph;
  }

  /** por frame de render: animação/ragdoll → ossos */
  frame(dt) {
    if (this.ragdoll) {
      this.ragdoll.pose();
      return;
    }
    // LOD: longe da câmera anima a cada 2 frames
    const cam = this.ctx.camera.position;
    const d2 = cam.distanceToSquared(this.group.position);
    this._skip = (this._skip || 0) + 1;
    if (d2 > 60 * 60 && this._skip % 2) return;
    this.anim.update(Math.min(dt, 1 / 20));
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.ctx.collision.remove(this.colliderId);
    this.brain.releaseCover();
  }
}

export default {
  name: 'enemies',
  order: 50,

  init(ctx) {
    const t0 = performance.now();
    this.ctx = ctx;
    this.list = [];
    this.geos = VARIANTS.map((v) => buildSoldierGeometry(v));
    const tGeo = performance.now() - t0;
    this.mats = VARIANTS.map((v) => createSoldierMaterial({ camo: CAMO[v.camo] || CAMO.woodland }));
    this.squad = new Squad(ctx);
    this.contact = new ContactShadows(ctx.scene);

    // grade de navegação na região jogável
    const world = ctx.services.world;
    const region = new THREE.Box3(new THREE.Vector3(-24, -1, -110), new THREE.Vector3(24, 10, 56));
    if (world?.bounds) {
      region.min.x = Math.max(region.min.x, world.bounds.min.x);
      region.max.x = Math.min(region.max.x, world.bounds.max.x);
      region.min.z = Math.max(region.min.z, world.bounds.min.z);
      region.max.z = Math.min(region.max.z, world.bounds.max.z);
    }
    this.nav = null;
    if (!ctx.shot) {
      try {
        this.nav = new NavGrid(ctx.collision, region, 0.5).build();
      } catch (err) {
        console.warn('[enemies] grade de navegação falhou', err);
      }
    }
    this.stats = { geoMs: Math.round(tGeo), verts: this.geos[0].attributes.position.count, tris: this.geos[0].index.count / 3, nav: this.nav?.stats };

    const spawn = (pose) => {
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
          }
        }
      }
    });
    ctx.bus.on('weapon:hit', (h) => {
      if (!h?.point || h.collider?.data?.enemy) return;
      for (const e of this.list) if (e.alive && e.group.position.distanceToSquared(h.point) < 4) e.brain.suppress(0.25);
    });

    // ── população ──
    const preset = ctx.shot?.preset;
    if (ctx.shot) {
      if (preset?.combat) this.spawnCombatScene(ctx, preset);
    } else {
      for (const sp of world?.enemySpawns || []) spawn(sp);
    }

    ctx.provide('enemies', {
      list: this.list,
      spawn,
      count: () => this.list.filter((e) => e.alive).length,
      kill: (e, info = {}) => e.damage(1e4, { part: 'torso', dir: new THREE.Vector3(0, 0, -1), ...info }),
      clear: () => {
        for (const e of this.list) e.dispose();
        this.list.length = 0;
      },
      nav: this.nav,
      squad: this.squad,
      stats: () => this.stats,
      hitboxes: HITBOXES,
    });
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
    const P = preset.enemy?.position || [1.5, 0, 4];
    // quina da van (x≈3.8..5.7, z≈3.6..8.4): espiada pela direita
    // (o clarão "preso" do modo combat fica no ÚLTIMO a atirar: o da jersey,
    // mais longe — o da van mira sem atirar e continua legível)
    const main = mk([P[0] + 3.1, 0, P[2] - 1.0], 0, { aim: 1, lean: -0.9, crouch: 0.12 });
    // atrás da jersey central, atirando por cima
    mk([-0.9, 0, -3.75], 1, { fire: true, aim: 1, crouch: 0.45, interval: 0.21 });
    // flanqueando pela calçada esquerda, corrida agachada
    mk([-4.4, 0, 3.6], 2, { speed: 4.3, dir: [0.22, 0, 0.97], aim: 0.3, crouch: 0.25, face: false }, 0.22);
    // escondido atrás da jersey do fundo (recarregando)
    const hid = mk([3.35, 0, -7.25], 0, { aim: 0.4, crouch: 1 });
    hid.anim.p.reload = 0.4;
    // corpo na pista
    const dead = mk([1.7, 0, 9.4], 2, { aim: 1 });
    for (const e of this.list) for (let i = 0; i < 40; i++) {
      e.update(1 / 60);
      e.frame(1 / 60);
    }
    const T = THREE;
    this.list.find((e) => e === dead) &&
      dead.damage(1e4, { part: 'torso', silent: true, point: dead.joint(B.chest, new T.Vector3()), dir: new T.Vector3(0.25, 0, -1).normalize() });
    for (let i = 0; i < 360; i++) dead.update(1 / 60);
    dead.frame(1 / 60);
    this.main = main;
  },

  update(dt, ctx) {
    for (const e of this.list) e.update(dt);
    // corpos somem e o esquadrão é reposto (fora do modo screenshot)
    if (!ctx.shot) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (!e.alive && e.deadT > 20) {
          e.dispose();
          this.list.splice(i, 1);
          this.respawnT = (this.respawnT ?? 0) + 1;
        }
      }
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
    for (const e of this.list) e.frame(fdt);
    this.contact.update(this.list);
  },

  dispose(ctx) {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    this.contact?.mesh.removeFromParent();
  },
};
