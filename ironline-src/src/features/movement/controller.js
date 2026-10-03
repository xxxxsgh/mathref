import * as THREE from 'three';
import { T } from './tuning.js';

/**
 * Controlador de locomoção (passo fixo de 1/60 s). Substitui o embutido do
 * core via `player.controller`. Mantém coerentes `position/velocity/
 * onGround/state/eyeHeight/height` e emite eventos no bus:
 *
 *   player:jump    { speed }
 *   player:land    { speed, height, material, hard }
 *   player:step    { foot, material, speed, stance, sprint, tactical }
 *   player:slide   { on, speed, material }
 *   player:mantle  { height, vault, duration, material }
 *   player:stance  { stance, from }
 *   player:sprint  { level }               0 parado, 1 sprint, 2 tático
 *
 * Toda a "pose de câmera" (bob, mergulho na aterrissagem, roll, FOV) fica em
 * camera.js — aqui só a física e os estados.
 */
const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _box = new THREE.Box3();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Controller {
  constructor(ctx) {
    this.ctx = ctx;
    this.stance = 'stand';
    this.sprint = 0; // 0 | 1 | 2 (tático)
    this.tacFuel = T.tacFuel;
    this.tacIdle = 99;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.crouchHeld = 0;
    this.proneFromHold = false;
    this.airTime = 0;
    this.fallTop = 0;
    this.lastVy = 0;
    this.slide = null; // { t, dir, speed }
    this.slideCooldown = 0;
    this.mantle = null; // { t, dur, a, b, c, vault, height }
    this.lean = 0; // -1..1 (já limitado por parede)
    this.leanLimit = 1;
    this.stepPhase = 0; // passos acumulados (inteiro = pé no chão)
    this.prevStepPhase = 0;
    this.foot = 0;
    this.groundMaterial = 'concrete';
    this.moveInput = { x: 0, y: 0 };
    this.sinceSprint = 0;
    this.diving = false;
    this.stuckT = 0;
  }

  // ─── utilidades ───────────────────────────────────────────────────────
  blocks(c) {
    return !c.trigger && c.blocksPlayer && c.tag !== 'enemy';
  }
  /** A cápsula (AABB) caberia em `pos` com `height`? */
  fits(pos, height, radius) {
    const col = this.ctx.collision;
    _box.min.set(pos.x - radius + 0.01, pos.y + 0.02, pos.z - radius + 0.01);
    _box.max.set(pos.x + radius - 0.01, pos.y + height, pos.z + radius - 0.01);
    const out = col.queryBox(_box, [], (c) => !c.trigger && c.blocksPlayer);
    for (const c of out) {
      const b = c.box;
      if (b.min.x < _box.max.x && b.max.x > _box.min.x && b.min.y < _box.max.y && b.max.y > _box.min.y && b.min.z < _box.max.z && b.max.z > _box.min.z) return false;
    }
    return true;
  }
  ray(origin, dir, dist) {
    return this.ctx.collision.raycast(origin, dir, dist, { bullets: false, filter: (c) => this.blocks(c) });
  }
  setStance(p, s) {
    if (s === this.stance) return true;
    const def = T.stance[s];
    if (def.height > p.height + 1e-3 && !this.fits(p.position, def.height, p.radius)) return false;
    const from = this.stance;
    this.stance = s;
    p.height = def.height;
    if (s !== 'stand') this.sprint = 0;
    this.ctx.bus.emit('player:stance', { stance: s, from });
    return true;
  }

  // ─── passo fixo ───────────────────────────────────────────────────────
  update(dt, p, ctx) {
    const inp = this.input || ctx.input; // entrada virtual no modo shot (roteiro ?mv=)
    const bus = ctx.bus;
    const weapon = ctx.services.weapon;
    const ads = clamp(Number(weapon?.ads) || 0, 0, 1);

    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    if (inp.pressed('jump')) this.jumpBuf = T.jumpBuffer;

    _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    const fy = (inp.action('forward') ? 1 : 0) - (inp.action('back') ? 1 : 0);
    const fx = (inp.action('right') ? 1 : 0) - (inp.action('left') ? 1 : 0);
    this.moveInput.x = fx;
    this.moveInput.y = fy;

    // mantle em andamento: trilha cinemática, sem física
    if (this.mantle) {
      this.stepMantle(dt, p);
      this.finishState(dt, p, fy, fx);
      return;
    }

    // ─ postura ─
    const grounded = p.onGround;
    const hSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    if (inp.pressed('crouch')) {
      this.crouchHeld = 0;
      this.proneFromHold = false;
      if (this.slide) this.endSlide(p, 'crouch');
      else if (this.sprint > 0 && grounded && hSpeed > T.slideMinSpeed && this.slideCooldown <= 0 && this.stance === 'stand') this.startSlide(p);
      else if (this.stance === 'stand') this.setStance(p, 'crouch');
      else if (this.stance === 'crouch') this.setStance(p, 'stand');
      else if (this.stance === 'prone') this.setStance(p, 'crouch');
    }
    if (inp.action('crouch')) {
      this.crouchHeld += dt;
      if (this.crouchHeld > T.proneHold && !this.proneFromHold && this.stance === 'crouch' && !this.slide) {
        this.proneFromHold = true;
        this.setStance(p, 'prone');
      }
    }
    if (inp.pressed('prone')) {
      if (this.stance === 'prone') this.setStance(p, 'stand') || this.setStance(p, 'crouch');
      else if (this.sprint > 0 && grounded && hSpeed > T.slideMinSpeed) this.startDive(p);
      else {
        if (this.slide) this.endSlide(p, 'crouch');
        this.setStance(p, 'prone');
      }
    }

    // ─ sprint ─
    const firing = inp.action('fire');
    const wantsAds = inp.action('ads') || ads > 0.35;
    const canSprint = fy > 0 && !firing && !wantsAds && !this.slide;
    if (inp.pressed('sprint') && fy > 0) {
      if (this.sprint === 0) {
        if (this.stance !== 'stand') this.setStance(p, 'stand');
        if (this.stance === 'stand' && canSprint) this.startSprint(1);
      } else if (this.sprint === 1 && this.sinceSprint > 0.04 && this.tacFuel > 0.6) this.startSprint(2);
    } else if (inp.action('sprint') && this.sprint === 0 && canSprint && this.stance === 'stand' && grounded) this.startSprint(1);
    if (this.sprint > 0 && (!canSprint || this.stance !== 'stand')) this.startSprint(0);
    // bateu numa parede correndo: larga o sprint
    if (this.sprint > 0 && grounded && this.sinceSprint > 0.35 && hSpeed < 1.2) {
      this.stuckT += dt;
      if (this.stuckT > 0.15) this.startSprint(0);
    } else this.stuckT = 0;
    this.sinceSprint += dt;
    if (this.sprint === 2) {
      this.tacFuel -= dt;
      this.tacIdle = 0;
      if (this.tacFuel <= 0) {
        this.tacFuel = 0;
        this.startSprint(1);
      }
    } else {
      this.tacIdle += dt;
      if (this.tacIdle > T.tacRecharge) this.tacFuel = Math.min(T.tacFuel, this.tacFuel + T.tacRefill * dt);
    }

    // ─ pulo / mantle ─
    this.coyote = grounded ? T.coyote : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0) {
      const m = this.stance !== 'prone' ? this.findMantle(p, grounded) : null;
      if (m) {
        this.jumpBuf = 0;
        this.startMantle(p, m);
        this.finishState(dt, p, fy, fx);
        return;
      }
      if (this.coyote > 0) {
        this.jumpBuf = 0;
        if (this.slide) {
          // slide-cancel: levanta e pula mantendo o embalo
          this.endSlide(p, 'stand');
          if (this.stance === 'stand') this.doJump(p, 1.0);
        } else if (this.stance === 'prone') this.setStance(p, 'crouch');
        else if (this.stance === 'crouch') this.setStance(p, 'stand');
        else this.doJump(p, 1);
      }
    } else if (!grounded && fy > 0 && p.velocity.y < 2.5 && this.airTime > 0.08 && this.stance === 'stand') {
      // no ar empurrando contra uma borda: agarra automaticamente
      const m = this.findMantle(p, false);
      if (m) {
        this.startMantle(p, m);
        this.finishState(dt, p, fy, fx);
        return;
      }
    }

    // ─ velocidade horizontal ─
    const v = p.velocity;
    if (this.slide) this.stepSlide(dt, p, fx);
    else {
      _wish.set(0, 0, 0).addScaledVector(_fwd, fy).addScaledVector(_right, fx);
      const moving = _wish.lengthSq() > 0;
      if (moving) _wish.normalize();
      let target = this.targetSpeed(p, fy, fx, ads);
      if (!moving) target = 0;
      const cur = Math.hypot(v.x, v.z);
      if (grounded) {
        const tx = _wish.x * target, tz = _wish.z * target;
        let dx = tx - v.x, dz = tz - v.z;
        let rate;
        if (target < 0.01) rate = T.decel;
        else if (cur > target + 0.15 && v.x * tx + v.z * tz > 0) rate = T.overspeedDecel + (T.decel - T.overspeedDecel) * (1 - clamp((cur - target) / 4, 0, 1)) * 0.35;
        else if (this.sprint === 2 && cur > T.sprint * 0.92) rate = T.accelTac;
        else if (this.sprint > 0 && cur > T.walk * 0.92) rate = T.accelSprint;
        else rate = T.accel;
        // curva: acelera mais forte longe do alvo, encosta suave perto
        const dl = Math.hypot(dx, dz);
        const step = rate * dt * (0.55 + 0.45 * clamp(dl / 2.5, 0, 1)) * (dl < 0.6 ? 0.7 + dl * 0.5 : 1);
        if (dl > step) {
          dx *= step / dl;
          dz *= step / dl;
        }
        v.x += dx;
        v.z += dz;
      } else if (moving) {
        // controle aéreo: muda direção, não ganha velocidade
        const nx = v.x + _wish.x * T.airAccel * dt, nz = v.z + _wish.z * T.airAccel * dt;
        const ns = Math.hypot(nx, nz);
        const cap = Math.max(cur, Math.min(target, cur + T.airMaxBoost) * 0.9);
        const k = ns > cap && ns > 0 ? cap / ns : 1;
        v.x = nx * k;
        v.z = nz * k;
      }
    }

    // ─ vertical + colisão ─
    v.y -= T.gravity * dt;
    if (grounded && v.y < 0 && !this.diving) v.y = Math.min(v.y, -0.5);
    const wasGrounded = grounded;
    this.lastVy = v.y;
    const r = ctx.collision.moveCapsule(p.position, _delta.copy(v).multiplyScalar(dt), {
      radius: p.radius,
      height: p.height,
      stepHeight: this.stance === 'prone' ? 0.25 : p.stepHeight,
      wasGrounded,
    });
    let onGround = r.onGround;
    let gcol = r.groundCollider;
    // cola no chão descendo degrau/rampa (não "voa" escada abaixo)
    if (!onGround && wasGrounded && v.y <= 0 && !this.diving) {
      _tmp.copy(p.position);
      const snap = ctx.collision.moveCapsule(_tmp, _delta.set(0, -(p.stepHeight + 0.05), 0), { radius: p.radius, height: p.height, stepHeight: 0, wasGrounded: false });
      if (snap.onGround) {
        p.position.copy(_tmp);
        onGround = true;
        gcol = snap.groundCollider;
      }
    }
    if (gcol) this.groundMaterial = ctx.services.world?.materialAt?.({ collider: gcol, point: p.position }) || gcol.material || 'concrete';
    if (r.hitCeiling && v.y > 0) v.y = 0;

    if (onGround) {
      if (!wasGrounded) this.onLand(p, -this.lastVy);
      if (v.y < 0) v.y = 0;
      this.airTime = 0;
      this.fallTop = p.position.y;
    } else {
      this.airTime += dt;
      this.fallTop = Math.max(this.fallTop, p.position.y);
    }
    p.onGround = onGround;
    if (p.position.y < -50) {
      const sp = ctx.services.world?.spawnPoints?.[0];
      p.setPose(sp || { position: [0, 2, 0] });
    }

    this.finishState(dt, p, fy, fx);
  }

  targetSpeed(p, fy, fx, ads) {
    let s;
    if (this.stance === 'prone') s = T.prone;
    else if (this.stance === 'crouch') s = T.crouch;
    else if (this.sprint === 2) s = T.tactical;
    else if (this.sprint === 1) s = T.sprint;
    else s = T.walk;
    if (fy < 0) s *= T.backMul;
    else if (fy === 0 && fx !== 0) s *= T.strafeMul;
    if (this.sprint === 0) s *= 1 - (1 - T.adsMul) * ads;
    return s * (p.speedMul ?? 1);
  }

  startSprint(level) {
    if (level === this.sprint) return;
    this.sprint = level;
    this.sinceSprint = 0;
    this.ctx.bus.emit('player:sprint', { level });
  }

  doJump(p, mul) {
    p.velocity.y = T.jump * mul;
    p.onGround = false;
    this.coyote = 0;
    this.diving = false;
    this.ctx.bus.emit('player:jump', { speed: Math.hypot(p.velocity.x, p.velocity.z), material: this.groundMaterial });
  }

  onLand(p, impact) {
    const height = this.fallTop - p.position.y;
    const hard = impact > 7.5;
    this.ctx.bus.emit('player:land', { speed: impact, height, material: this.groundMaterial, hard, stance: this.stance });
    if (this.diving) {
      this.diving = false;
      this.setStance(p, 'prone');
      p.velocity.x *= 0.35;
      p.velocity.z *= 0.35;
    }
    if (impact > T.fallDamageFrom && !this.ctx.shot) p.damage((impact - T.fallDamageFrom) * T.fallDamagePer, { source: 'fall' });
    // pousar macio mata um pouco do embalo
    const k = hard ? 0.72 : 0.92;
    if (!this.slide) {
      p.velocity.x *= k;
      p.velocity.z *= k;
    }
  }

  // ─── slide ────────────────────────────────────────────────────────────
  startSlide(p) {
    const v = p.velocity;
    const s = Math.hypot(v.x, v.z);
    const dir = new THREE.Vector3(v.x / s, 0, v.z / s);
    const speed = Math.min(T.slideMaxStart, s + T.slideBoost * (this.sprint === 2 ? 1.25 : 1));
    this.startSprint(0);
    this.stance = 'slide';
    p.height = T.stance.slide.height;
    this.slide = { t: 0, dir, speed };
    this.ctx.bus.emit('player:stance', { stance: 'slide', from: 'stand' });
    this.ctx.bus.emit('player:slide', { on: true, speed, material: this.groundMaterial });
  }
  stepSlide(dt, p, fx) {
    const s = this.slide;
    s.t += dt;
    const fr = s.t < T.slideEarly ? T.slideFrictionEarly : T.slideFriction;
    s.speed = Math.max(0, s.speed - fr * dt);
    // leve direção (A/D) e alinhamento com o olhar
    const yawDir = Math.atan2(-s.dir.x, -s.dir.z);
    const look = this.ctx.player.yaw;
    let dy = look - yawDir;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const steer = clamp(dy, -T.slideSteer * dt, T.slideSteer * dt) * 0.6 - fx * T.slideSteer * dt * 0.5;
    const ny = yawDir + steer;
    s.dir.set(-Math.sin(ny), 0, -Math.cos(ny));
    p.velocity.x = s.dir.x * s.speed;
    p.velocity.z = s.dir.z * s.speed;
    if (!p.onGround && s.t > 0.1) {
      // saiu de uma borda deslizando: vira queda agachado
      this.endSlide(p, 'crouch');
      return;
    }
    if (s.speed < T.slideEndSpeed || s.t > T.slideMaxTime) this.endSlide(p, 'crouch');
  }
  endSlide(p, to = 'crouch') {
    if (!this.slide) return;
    const speed = this.slide.speed;
    this.slide = null;
    this.slideCooldown = T.slideCooldown;
    this.stance = 'slide';
    // tenta a postura pedida; sem espaço, agacha (ou fica deitado sob algo)
    if (!(to === 'stand' && this.setStance(p, 'stand'))) this.setStance(p, 'crouch') || this.setStance(p, 'prone');
    this.ctx.bus.emit('player:slide', { on: false, speed, material: this.groundMaterial });
  }

  startDive(p) {
    const v = p.velocity;
    const s = Math.hypot(v.x, v.z) || 1;
    v.x += (v.x / s) * T.diveBoost;
    v.z += (v.z / s) * T.diveBoost;
    v.y = T.diveUp;
    p.onGround = false;
    this.coyote = 0;
    this.diving = true;
    this.startSprint(0);
    this.ctx.bus.emit('player:jump', { speed: s, dive: true, material: this.groundMaterial });
  }

  // ─── mantle / vault ───────────────────────────────────────────────────
  findMantle(p, grounded) {
    const pos = p.position;
    const f = _d.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    // usa a direção do movimento se o jogador estiver indo de lado
    const reach = p.radius + T.mantleReach + Math.min(0.5, Math.hypot(p.velocity.x, p.velocity.z) * 0.06);
    let wall = null;
    for (const h of [0.3, 0.62, 0.95, 1.28, 1.6, 1.92]) {
      if (h > T.mantleMax + 0.05) break;
      _o.set(pos.x, pos.y + h, pos.z);
      const hit = this.ray(_o, f, reach);
      if (hit && hit.normal.dot(f) < -0.6) {
        wall = hit;
        break;
      }
    }
    if (!wall) return null;
    // topo: raio para baixo um pouco além da face
    const topY0 = pos.y + T.mantleMax + 0.35;
    _o.copy(wall.point).addScaledVector(f, 0.22);
    _o.y = topY0;
    const top = this.ray(_o, DOWN, T.mantleMax + 0.6);
    if (!top || top.normal.y < 0.7) return null;
    const ledge = top.point.y;
    const height = ledge - pos.y;
    if (height < 0.42 || height > T.mantleMax) return null;
    // vão livre acima da cabeça até o topo da borda
    _o.set(pos.x, pos.y + p.height - 0.05, pos.z);
    const ceil = this.ray(_o, UP, Math.max(0.05, ledge + 0.4 - _o.y));
    if (ceil && ledge + 0.4 > _o.y) return null;
    const wp = wall.point;

    // vault: obstáculo baixo e fino com chão mais baixo do outro lado
    if (height <= T.vaultMax) {
      for (const depth of [0.3, 0.55, 0.8]) {
        if (depth > T.vaultDepth) break;
        _o.copy(wp).addScaledVector(f, depth + 0.1);
        _o.y = ledge + 0.05;
        const below = this.ray(_o, DOWN, height + 1.5);
        const gy = below ? below.point.y : null;
        if (gy !== null && gy < ledge - 0.4 && below.normal.y > 0.7) {
          const land = new THREE.Vector3().copy(wp).addScaledVector(f, depth + p.radius + 0.25);
          land.y = gy + 0.01;
          // o chão de pouso pode ser outro: confere com um raio no ponto final
          _o.set(land.x, ledge + 0.05, land.z);
          const g2 = this.ray(_o, DOWN, height + 1.5);
          if (!g2) break;
          land.y = g2.point.y + 0.01;
          if (!this.fits(land, T.stance.stand.height, p.radius)) break;
          // espaço por cima do obstáculo (corpo passa agachado)
          _tmp.copy(wp).addScaledVector(f, depth * 0.5);
          _tmp.y = ledge + 0.02;
          if (!this.fits(_tmp, 1.0, p.radius * 0.8)) break;
          return { vault: true, height, ledge, land, wall: wp.clone(), dir: f.clone(), material: top.collider?.material || 'concrete' };
        }
        if (gy !== null && Math.abs(gy - ledge) < 0.15) continue; // ainda em cima do obstáculo
      }
    }
    // mantle: sobe e fica em cima
    const land = new THREE.Vector3().copy(wp).addScaledVector(f, p.radius + 0.12);
    land.y = ledge + 0.01;
    let stanceAfter = 'stand';
    if (!this.fits(land, T.stance.stand.height, p.radius)) {
      if (this.fits(land, T.stance.crouch.height, p.radius)) stanceAfter = 'crouch';
      else return null;
    }
    return { vault: false, height, ledge, land, wall: wp.clone(), dir: f.clone(), stanceAfter, material: top.collider?.material || 'concrete' };
  }

  startMantle(p, m) {
    const a = p.position.clone();
    const dur = m.vault ? T.vaultTime + m.height * 0.05 : T.mantleTimeBase + m.height * T.mantleTimePerM;
    // ponto de controle: sobre a borda (vault) ou rente à face (mantle)
    const c = m.vault ? m.wall.clone().addScaledVector(m.dir, 0.25) : a.clone().addScaledVector(m.dir, 0.12);
    c.y = m.ledge + (m.vault ? 0.42 : 0.08);
    const keep = Math.max(Math.hypot(p.velocity.x, p.velocity.z), m.vault ? 4.2 : 0);
    this.mantle = { t: 0, dur, a, b: m.land, c, vault: m.vault, height: m.height, dir: m.dir, keep, stanceAfter: m.stanceAfter || 'stand', material: m.material };
    if (this.slide) {
      this.slide = null;
      this.stance = 'stand';
    }
    if (this.stance !== 'stand') this.setStance(p, 'stand');
    this.startSprint(this.sprint > 0 && m.vault ? this.sprint : 0);
    p.velocity.set(0, 0, 0);
    p.onGround = false;
    this.ctx.bus.emit('player:mantle', { height: m.height, vault: m.vault, duration: dur, material: m.material });
  }

  stepMantle(dt, p) {
    const m = this.mantle;
    m.t += dt;
    const u = clamp(m.t / m.dur, 0, 1);
    const prev = _tmp.copy(p.position);
    if (m.vault) {
      // Bézier quadrática a→c→b, tempo suavizado
      const s = smooth(u);
      const i = 1 - s;
      p.position.set(
        i * i * m.a.x + 2 * i * s * m.c.x + s * s * m.b.x,
        i * i * m.a.y + 2 * i * s * m.c.y + s * s * m.b.y,
        i * i * m.a.z + 2 * i * s * m.c.z + s * s * m.b.z,
      );
    } else {
      // sobe (rápido, ease-out) e depois avança por cima da borda
      const up = easeOut(clamp(u / 0.62, 0, 1));
      const fw = smooth(clamp((u - 0.38) / 0.62, 0, 1));
      p.position.x = m.a.x + (m.c.x - m.a.x) * up + (m.b.x - m.c.x) * fw;
      p.position.z = m.a.z + (m.c.z - m.a.z) * up + (m.b.z - m.c.z) * fw;
      p.position.y = m.a.y + (m.c.y - m.a.y) * up + (m.b.y - m.c.y) * fw;
    }
    p.velocity.copy(p.position).sub(prev).divideScalar(Math.max(dt, 1e-4));
    if (u >= 1) {
      p.position.copy(m.b);
      p.velocity.set(m.dir.x * m.keep * (m.vault ? 0.95 : 0.4), 0, m.dir.z * m.keep * (m.vault ? 0.95 : 0.4));
      p.onGround = true;
      this.airTime = 0;
      this.fallTop = p.position.y;
      if (!m.vault) this.groundMaterial = m.material;
      if (m.stanceAfter !== 'stand') this.setStance(p, m.stanceAfter);
      this.mantle = null;
      this.ctx.bus.emit('player:land', { speed: m.vault ? 3.5 : 2.2, height: 0, material: this.groundMaterial, hard: false, mantle: true, stance: this.stance });
    }
  }

  // ─── estado comum + lean + passos ─────────────────────────────────────
  finishState(dt, p, fy, fx) {
    const ctx = this.ctx;
    const inp = this.input || ctx.input; // entrada virtual no modo shot (roteiro ?mv=)
    // altura dos olhos acompanha a postura (com mergulho no mantle)
    let eyeT = T.stance[this.stance].eye;
    if (this.mantle) {
      const u = this.mantle.t / this.mantle.dur;
      eyeT = T.stance.stand.eye - Math.sin(Math.PI * u) * (this.mantle.vault ? 0.32 : 0.22);
    }
    const k = 1 - Math.exp(-T.eyeLerp * dt * (eyeT < p.eyeHeight ? 1.25 : 1));
    p.eyeHeight += (eyeT - p.eyeHeight) * k;

    // lean (Q/E): limitado por paredes ao lado da cabeça
    const canLean = !this.slide && !this.mantle && this.sprint === 0 && this.stance !== 'prone';
    let lt = 0;
    if (canLean) lt = (inp.action('leanRight') ? 1 : 0) - (inp.action('leanLeft') ? 1 : 0);
    if (lt !== 0) {
      _o.set(p.position.x, p.position.y + p.eyeHeight, p.position.z);
      _d.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(lt);
      const hit = this.ray(_o, _d, T.leanDist + 0.25);
      this.leanLimit = hit ? clamp((hit.distance - 0.22) / T.leanDist, 0, 1) : 1;
      lt *= this.leanLimit;
    }
    this.lean += (lt - this.lean) * (1 - Math.exp(-T.leanSpeed * dt));
    if (Math.abs(this.lean) < 1e-4) this.lean = 0;

    // passos: fase avança com a distância percorrida no chão
    this.prevStepPhase = this.stepPhase;
    const hs = Math.hypot(p.velocity.x, p.velocity.z);
    if (p.onGround && !this.slide && !this.mantle && hs > 0.35) {
      const stride = this.stance === 'prone' ? 0.75 : this.stance === 'crouch' ? 0.62 + hs * 0.2 : 0.95 + hs * 0.165;
      const before = Math.floor(this.stepPhase);
      this.stepPhase += (hs * dt) / stride;
      if (Math.floor(this.stepPhase) !== before) {
        this.foot ^= 1;
        ctx.bus.emit('player:step', {
          foot: this.foot,
          material: this.groundMaterial,
          speed: hs,
          stance: this.stance,
          sprint: this.sprint > 0,
          tactical: this.sprint === 2,
          ads: Number(ctx.services.weapon?.ads) || 0,
        });
      }
    }

    const st = p.state;
    st.moving = fy !== 0 || fx !== 0;
    // `speed` alimenta o balanço de passada da arma/HUD: no slide os pés não
    // pisam (o corpo desliza), então ele cai para ~0.9 m/s — ainda "em
    // movimento" para quem só testa > 0.5, mas sem bob de corrida na arma.
    // A velocidade física real fica em `groundSpeed`.
    st.groundSpeed = hs;
    st.speed = this.slide ? Math.min(hs, 0.9) : hs;
    st.sprinting = this.sprint > 0 && hs > 1;
    st.tactical = this.sprint === 2 && hs > 1;
    st.crouching = this.stance === 'crouch' || this.stance === 'slide';
    st.prone = this.stance === 'prone';
    st.sliding = !!this.slide;
    st.mantling = !!this.mantle;
    st.vaulting = !!this.mantle?.vault;
    st.stance = this.stance;
    st.lean = this.lean;
    st.airborne = !p.onGround;
  }
}
