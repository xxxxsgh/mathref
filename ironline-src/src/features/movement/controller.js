import * as THREE from 'three';
import { T } from './tuning.js';
import {
  slideStartSpeed,
  stepSlideSpeed,
  slideShouldEnd,
  canCancelSlide,
  slideJumpSpeed,
  slideSpreadAt,
  tacStamina,
  canTacSprint,
  isDoubleTap,
  mountEye,
} from './slidephys.js';

/**
 * Controlador de locomoção (passo fixo de 1/60 s). Substitui o embutido do
 * core via `player.controller`. Mantém coerentes `position/velocity/
 * onGround/state/eyeHeight/height` e emite eventos no bus:
 *
 *   player:jump      { speed, slide?, dive? }
 *   player:land      { speed, height, material, hard }
 *   player:step      { foot, material, speed, stance, sprint, tactical }
 *   player:slide     { phase:'start'|'end', on, speed, material, reason? }
 *   player:slideKick { target, hit, damage?, killed? }
 *   player:dive      { phase:'start'|'land', speed }
 *   player:tacSprint { phase:'start'|'end', fuel }
 *   player:mount     { on, kind:'ledge'|'wall', height? }
 *   player:hang      { phase:'start'|'climb'|'drop' }
 *   player:cover     { height }
 *   player:mantle    { height, vault, duration, material, climb? }
 *   player:stance    { stance, from }
 *   player:sprint    { level }               0 parado, 1 sprint, 2 tático
 *
 * Publica em `ctx.player` (para a arma/streaks lerem sem depender do
 * serviço): `sliding`, `slideSpread`, `slideRecoil`, `mounted`,
 * `mountRecoil`, `mountSway`, `tacSprint`, `hanging`, `diving`.
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
const _tmp2 = new THREE.Vector3();
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
    this.sinceSprintTap = 99; // s desde o último toque de sprint (duplo toque)
    this.coyote = 0;
    this.jumpBuf = 0;
    this.crouchBuf = 0; // agachar apertado no ar → slide ao pousar
    this.crouchHeld = 0;
    this.proneFromHold = false;
    this.airTime = 0;
    this.fallTop = 0;
    this.lastVy = 0;
    this.slide = null; // { t, dir, speed, level, low, slope }
    this.slideCooldown = 0;
    this.slope = 0; // dh/dx suavizado na direção do slide (− = descida)
    this.kick = null; // { t, hit } pose/estado do slide kick
    this.kickCooldown = 0;
    this.mantle = null; // { t, dur, a, b, c, vault, height, slideAfter }
    this.hang = null; // { ledge, dir, t, fwdT }
    this.mount = null; // { kind, eye, height, lost }
    this.cover = 0; // s restantes do "encaixe" de cobertura após o slide
    this.lean = 0; // -1..1 (já limitado por parede)
    this.leanLimit = 1;
    this.stepPhase = 0; // passos acumulados (inteiro = pé no chão)
    this.prevStepPhase = 0;
    this.foot = 0;
    this.groundMaterial = 'concrete';
    this.moveInput = { x: 0, y: 0 };
    this.sinceSprint = 0;
    this.diving = false;
    this.diveSlide = 0; // s de deslize de bruços após o impacto do dive
    this.stuckT = 0;
    this.hitWall = false;
  }

  /** Zera estados transitórios (respawn, teleporte, ferramentas de teste). */
  reset(p) {
    this.slide = null;
    this.mantle = null;
    this.hang = null;
    this.mount = null;
    this.kick = null;
    this.diving = false;
    this.diveSlide = 0;
    this.cover = 0;
    this.lean = 0;
    this.jumpBuf = this.crouchBuf = 0;
    this.slideCooldown = this.kickCooldown = 0;
    this.sinceSprintTap = 99;
    this.startSprint(0);
    this.stance = 'stand';
    p.height = T.stance.stand.height;
    p.eyeHeight = T.stance.stand.eye;
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
    if (s !== 'stand') this.startSprint(0);
    if (from === 'prone') this.diveSlide = 0;
    this.ctx.bus.emit('player:stance', { stance: s, from });
    return true;
  }
  /** Agachado caberia aqui? (false = teto baixo: só deslizando/deitado) */
  lowCeiling(p) {
    return !this.fits(p.position, T.stance.crouch.height, p.radius);
  }

  // ─── passo fixo ───────────────────────────────────────────────────────
  update(dt, p, ctx) {
    const inp = this.input || ctx.input; // entrada virtual no modo shot (roteiro ?mv=)
    const weapon = ctx.services.weapon;
    const ads = clamp(Number(weapon?.ads) || 0, 0, 1);

    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.crouchBuf = Math.max(0, this.crouchBuf - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.cover = Math.max(0, this.cover - dt);
    this.sinceSprintTap += dt;
    if (this.kick) {
      this.kick.t += dt;
      // janela ativa: a perna fica estendida ~75 % da pose; o primeiro alvo
      // que entrar no alcance leva o chute
      if (!this.kick.done && this.slide && this.kick.t > dt * 0.5 && this.kick.t <= T.kickTime * 0.75) this.tryKick(p);
      if (!this.kick.done && this.kick.t > T.kickTime * 0.75) {
        this.kick.done = true;
        ctx.bus.emit('player:slideKick', { target: null, hit: false });
      }
      if (this.kick.t > T.kickTime) this.kick = null;
    }
    if (inp.pressed('jump')) this.jumpBuf = T.jumpBuffer;
    if (inp.pressed('crouch')) this.crouchBuf = T.crouchBuffer;

    _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    let fy = (inp.action('forward') ? 1 : 0) - (inp.action('back') ? 1 : 0);
    let fx = (inp.action('right') ? 1 : 0) - (inp.action('left') ? 1 : 0);
    // joystick analógico (toque): direção contínua; sprint pelo próprio eixo
    const ax = inp.axis;
    if (ax?.active && !this.input) {
      fy = Math.abs(ax.y) > 0.12 ? ax.y : 0;
      fx = Math.abs(ax.x) > 0.12 ? ax.x : 0;
    }
    this.moveInput.x = fx;
    this.moveInput.y = fy;

    // pendurado numa borda alta: estado próprio
    if (this.hang) {
      this.stepHang(dt, p, fx, fy, inp);
      this.finishState(dt, p, fy, fx, ads);
      return;
    }
    // mantle em andamento: trilha cinemática, sem física
    if (this.mantle) {
      if (inp.pressed('crouch')) this.mantle.slideAfter = true;
      this.stepMantle(dt, p);
      this.finishState(dt, p, fy, fx, ads);
      return;
    }

    // ─ postura ─
    const grounded = p.onGround;
    const hSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    const fastEnough = hSpeed > T.slideMinSpeed;
    if (inp.pressed('crouch')) {
      this.crouchHeld = 0;
      this.proneFromHold = false;
      if (this.slide) {
        // slide-cancel (#39): toque de agachar levanta e devolve o sprint
        if (canCancelSlide(this.slide.t, 'crouch')) {
          if (this.slide.low) this.slide.pendingCancel = true; // teto baixo: cancela ao sair
          else this.cancelSlide(p);
        }
      } else if (!grounded && this.stance === 'stand' && fastEnough) {
        // no ar: fica guardado (crouchBuf) e vira slide ao pousar
      } else if ((this.sprint > 0 || hSpeed > T.sprint * 0.95) && grounded && fastEnough && this.slideCooldown <= 0 && this.stance === 'stand') this.startSlide(p);
      else if (this.stance === 'stand') this.setStance(p, 'crouch');
      else if (this.stance === 'crouch') this.setStance(p, 'stand');
      else if (this.stance === 'prone') this.setStance(p, 'crouch');
    }
    if (inp.action('crouch')) {
      this.crouchHeld += dt;
      if (this.crouchHeld > T.proneHold && !this.proneFromHold && this.stance === 'crouch' && !this.slide && this.cover <= 0) {
        this.proneFromHold = true;
        this.setStance(p, 'prone');
      }
    }
    if (inp.pressed('prone')) {
      if (this.stance === 'prone' && !this.diving) this.setStance(p, 'stand') || this.setStance(p, 'crouch');
      else if (this.slide) this.startDive(p, 'slide'); // slide → dive
      else if (this.sprint > 0 && grounded && fastEnough) this.startDive(p, 'sprint');
      else if (!this.diving) this.setStance(p, 'prone');
    }

    // ─ slide kick (#42): corpo a corpo durante o slide ─
    if (this.slide && inp.pressed('melee')) {
      inp.consume?.('melee'); // a arma não saca a faca neste toque
      if (this.kickCooldown <= 0) this.doKick(p);
    }

    // ─ sprint / sprint tático (#48) ─
    const firing = inp.action('fire');
    const wantsAds = inp.action('ads') || ads > 0.35;
    const canSprint = fy > 0 && !firing && !wantsAds && !this.slide && !this.diving;
    if (inp.pressed('sprint') && fy > 0) {
      const dbl = isDoubleTap(this.sinceSprintTap);
      this.sinceSprintTap = 0;
      if (this.sprint === 0) {
        if (this.stance !== 'stand' && !this.slide) this.setStance(p, 'stand');
        if (this.stance === 'stand' && canSprint) this.startSprint(dbl && canTacSprint(this.tacFuel) ? 2 : 1);
      } else if (this.sprint === 1 && this.sinceSprint > 0.04 && canTacSprint(this.tacFuel)) this.startSprint(2);
    } else if (inp.action('sprint') && this.sprint === 0 && canSprint && this.stance === 'stand' && grounded) this.startSprint(1);
    if (this.sprint > 0 && (!canSprint || this.stance !== 'stand')) this.startSprint(0);
    // bateu numa parede correndo: larga o sprint
    if (this.sprint > 0 && grounded && this.sinceSprint > 0.35 && hSpeed < 1.2) {
      this.stuckT += dt;
      if (this.stuckT > 0.15) this.startSprint(0);
    } else this.stuckT = 0;
    this.sinceSprint += dt;
    const ts = tacStamina({ fuel: this.tacFuel, idle: this.tacIdle }, dt, this.sprint === 2);
    this.tacFuel = ts.fuel;
    this.tacIdle = ts.idle;
    if (ts.empty) this.startSprint(1);

    // ─ pulo / mantle / slide-jump ─
    this.coyote = grounded ? T.coyote : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0) {
      const m = this.stance !== 'prone' && !this.slide?.low ? this.findMantle(p, grounded, false) : null;
      if (m) {
        this.jumpBuf = 0;
        this.startMantle(p, m);
        this.finishState(dt, p, fy, fx, ads);
        return;
      }
      if (this.coyote > 0) {
        if (this.slide) {
          if (!this.slide.low) {
            this.jumpBuf = 0;
            this.slideJump(p); // #40
          }
        } else {
          this.jumpBuf = 0;
          if (this.stance === 'prone') this.setStance(p, 'crouch');
          else if (this.stance === 'crouch') this.setStance(p, 'stand');
          else this.doJump(p, 1);
        }
      }
    } else if (!grounded && fy > 0 && p.velocity.y < 2.5 && this.airTime > 0.08 && this.stance === 'stand' && !this.diving) {
      // no ar empurrando contra uma borda: agarra (mantle) ou pendura (#52)
      const m = this.findMantle(p, false, true);
      if (m?.hang) {
        this.startHang(p, m);
        this.finishState(dt, p, fy, fx, ads);
        return;
      }
      if (m) {
        this.startMantle(p, m);
        this.finishState(dt, p, fy, fx, ads);
        return;
      }
    }

    // ─ velocidade horizontal ─
    const v = p.velocity;
    if (this.slide) this.stepSlide(dt, p, fx);
    else if (this.diveSlide > 0 && grounded) {
      // de bruços depois do dive: desliza com atrito alto, sem controle
      this.diveSlide -= dt;
      const cur = Math.hypot(v.x, v.z);
      const ns = Math.max(0, cur - 7 * dt);
      if (cur > 1e-3) {
        v.x *= ns / cur;
        v.z *= ns / cur;
      }
    } else {
      _wish.set(0, 0, 0).addScaledVector(_fwd, fy).addScaledVector(_right, fx);
      const moving = _wish.lengthSq() > 0.0001;
      const mag = Math.min(1, _wish.length());
      if (moving) _wish.normalize();
      let target = this.targetSpeed(p, fy, fx, ads) * (ax?.active && !this.input ? mag : 1);
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
    const preSpeed = Math.hypot(v.x, v.z);
    const r = ctx.collision.moveCapsule(p.position, _delta.copy(v).multiplyScalar(dt), {
      radius: p.radius,
      height: p.height,
      stepHeight: this.stance === 'prone' ? 0.25 : p.stepHeight,
      wasGrounded,
    });
    this.hitWall = r.hitWall;
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
    // parede no slide: a velocidade real cai (moveCapsule bloqueia o eixo)
    if (this.slide && r.hitWall && this.slide.t > 0.06) {
      const real = (Math.hypot(p.position.x - p.prevPosition.x, p.position.z - p.prevPosition.z) || 0) / dt;
      if (real < preSpeed * 0.45) {
        this.slide.speed = Math.max(0, real);
        this.endSlide(p, 'crouch', 'impact');
      }
    }

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

    this.stepMount(dt, p, ads, inp);
    this.finishState(dt, p, fy, fx, ads);
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
    return s * (this.ctx.player.speedMul ?? 1);
  }

  startSprint(level) {
    if (level === this.sprint) return;
    const prev = this.sprint;
    this.sprint = level;
    this.sinceSprint = 0;
    this.ctx.bus.emit('player:sprint', { level });
    if (level === 2) this.ctx.bus.emit('player:tacSprint', { phase: 'start', fuel: this.tacFuel / T.tacFuel });
    else if (prev === 2) this.ctx.bus.emit('player:tacSprint', { phase: 'end', fuel: this.tacFuel / T.tacFuel });
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
    const dove = this.diving;
    this.ctx.bus.emit('player:land', { speed: impact, height, material: this.groundMaterial, hard, stance: dove ? 'prone' : this.stance, dive: dove });
    if (dove) {
      // impacto do dive (#43): cai de bruços e escorrega um pouco
      this.diving = false;
      this.setStance(p, 'prone');
      p.velocity.x *= T.diveLandKeep * 1.6;
      p.velocity.z *= T.diveLandKeep * 1.6;
      this.diveSlide = T.diveSlide;
      this.ctx.bus.emit('player:dive', { phase: 'land', speed: impact, material: this.groundMaterial });
    }
    if (impact > T.fallDamageFrom && !this.ctx.shot) p.damage((impact - T.fallDamageFrom) * T.fallDamagePer, { source: 'fall' });
    const hs = Math.hypot(p.velocity.x, p.velocity.z);
    // agachar guardado no ar → slide encadeado ao pousar (slide-hop)
    if (!dove && this.crouchBuf > 0 && this.stance === 'stand' && hs > T.slideMinSpeed) {
      this.crouchBuf = 0;
      this.startSlide(p, { chain: true });
      return;
    }
    // pousar macio mata um pouco do embalo
    const k = hard ? 0.72 : 0.92;
    if (!this.slide && !dove) {
      p.velocity.x *= k;
      p.velocity.z *= k;
    }
  }

  // ─── slide ────────────────────────────────────────────────────────────
  startSlide(p, { chain = false, bonus = 0 } = {}) {
    const v = p.velocity;
    const s = Math.hypot(v.x, v.z) || 1;
    const dir = new THREE.Vector3(v.x / s, 0, v.z / s);
    const level = this.sprint || (s > T.sprint * 1.05 ? 1 : 0);
    // em cadeia dentro do cooldown: sem o boost (não acumula velocidade infinita)
    const fresh = this.slideCooldown <= 0;
    const speed = fresh || bonus > 0 ? slideStartSpeed(s, { tactical: this.sprint === 2, bonus }) : Math.min(s, T.slideMaxStart);
    this.startSprint(0);
    this.stance = 'slide';
    p.height = T.stance.slide.height;
    this.slide = { t: 0, dir, speed, level: Math.max(1, level), low: false, pendingCancel: false, chain };
    this.slope = 0;
    this.cover = 0;
    this.ctx.bus.emit('player:stance', { stance: 'slide', from: 'stand' });
    this.ctx.bus.emit('player:slide', { phase: 'start', on: true, speed, material: this.groundMaterial, chain });
  }
  /** Declive (dh/dx) do chão ao longo de `dir`, medido à frente e atrás dos pés. */
  measureSlope(p, dir) {
    const d = T.slopeProbe;
    const top = p.position.y + 0.9;
    _o.set(p.position.x + dir.x * d, top, p.position.z + dir.z * d);
    const a = this.ray(_o, DOWN, 2.6);
    _o.set(p.position.x - dir.x * d, top, p.position.z - dir.z * d);
    const b = this.ray(_o, DOWN, 2.6);
    if (!a || !b) return 0;
    return (a.point.y - b.point.y) / (2 * d);
  }
  stepSlide(dt, p, fx) {
    const s = this.slide;
    s.t += dt;
    // rampa (#44): mede o declive e suaviza (degraus de rampa viram média)
    const raw = p.onGround ? this.measureSlope(p, s.dir) : 0;
    this.slope += (clamp(raw, -T.slopeMax, T.slopeMax) - this.slope) * (1 - Math.exp(-10 * dt));
    s.speed = stepSlideSpeed(s.speed, s.t, this.slope, dt);
    // sob obstáculo baixo (#45): continua deslizando até caber agachado
    s.low = this.lowCeiling(p);
    if (s.low) s.speed = Math.max(s.speed, T.slideUnderSpeed);
    // leve direção (A/D) e alinhamento com o olhar
    const yawDir = Math.atan2(-s.dir.x, -s.dir.z);
    const look = this.ctx.player.yaw;
    let dy = look - yawDir;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const steer = clamp(dy, -T.slideSteer * dt, T.slideSteer * dt) * 0.6 - fx * T.slideSteer * dt * 0.5;
    s.steer = steer / Math.max(dt, 1e-4);
    const ny = yawDir + steer;
    s.dir.set(-Math.sin(ny), 0, -Math.cos(ny));
    p.velocity.x = s.dir.x * s.speed;
    p.velocity.z = s.dir.z * s.speed;
    if (!p.onGround && s.t > 0.1 && !s.low) {
      // saiu de uma borda deslizando: vira queda (mantém o sprint guardado)
      this.endSlide(p, 'stand', 'air');
      return;
    }
    if (!s.low && s.pendingCancel) {
      this.cancelSlide(p);
      return;
    }
    if (slideShouldEnd(s.speed, s.t, this.slope, s.low)) this.endSlide(p, 'auto', 'time');
  }
  /**
   * Encerra o slide. `to`: 'stand' | 'crouch' | 'auto' (fim natural: muro
   * baixo à frente → agacha em cobertura; segurando frente+sprint → levanta
   * correndo; senão agacha).
   */
  endSlide(p, to = 'crouch', reason = 'end') {
    if (!this.slide) return;
    const s = this.slide;
    const inp = this.input || this.ctx.input;
    this.slide = null;
    this.slideCooldown = T.slideCooldown;
    this.stance = 'slide';
    let cover = null;
    if (to === 'auto' || reason === 'impact') {
      cover = this.findCover(p, s.dir);
      if (cover) to = 'crouch';
      else if (to === 'auto') to = inp.action('forward') && inp.action('sprint') ? 'stand' : 'crouch';
    }
    // tenta a postura pedida; sem espaço, agacha (ou fica deitado sob algo)
    if (!(to === 'stand' && this.setStance(p, 'stand'))) this.setStance(p, 'crouch') || this.setStance(p, 'prone');
    if (to === 'stand' && this.stance === 'stand' && inp.action('forward') && p.onGround) this.startSprint(s.level);
    this.ctx.bus.emit('player:slide', { phase: 'end', on: false, speed: s.speed, material: this.groundMaterial, reason, duration: s.t });
    if (cover && this.stance === 'crouch') {
      // slide para a cobertura (#46): agacha colado no muro, pronto para montar
      this.cover = 1.2;
      this.crouchHeld = 0;
      this.proneFromHold = true; // segurar agachar aqui não deita
      p.velocity.x *= 0.25;
      p.velocity.z *= 0.25;
      this.ctx.bus.emit('player:cover', { height: cover.height });
    }
  }
  /** Slide-cancel (#39): levanta mantendo o embalo e devolve o sprint. */
  cancelSlide(p) {
    const s = this.slide;
    if (!s) return;
    if (!this.fits(p.position, T.stance.stand.height, p.radius)) return;
    const level = s.level;
    const keep = T.slideCancelKeep;
    p.velocity.x *= keep;
    p.velocity.z *= keep;
    this.endSlide(p, 'stand', 'cancel');
    if (this.stance === 'stand') this.startSprint(level === 2 && canTacSprint(this.tacFuel) ? 2 : 1);
  }
  /** Slide-jump (#40): sai do slide pulando com o embalo (com teto). */
  slideJump(p) {
    const s = this.slide;
    if (!this.fits(p.position, T.stance.stand.height, p.radius)) return;
    const hs = slideJumpSpeed(s.speed);
    const level = s.level;
    this.endSlide(p, 'stand', 'jump');
    if (this.stance !== 'stand') return;
    p.velocity.x = s.dir.x * hs;
    p.velocity.z = s.dir.z * hs;
    this.doJump(p, T.slideJumpUp);
    this.startSprint(level === 2 && canTacSprint(this.tacFuel) ? 2 : 1);
  }
  /** Muro baixo logo à frente (bloqueia na cintura, livre no peito)? */
  findCover(p, dir) {
    const reach = p.radius + T.coverProbe;
    _o.set(p.position.x, p.position.y + T.coverLow, p.position.z);
    const low = this.ray(_o, dir, reach);
    if (!low || Math.abs(low.normal.y) > 0.5) return null;
    _o.y = p.position.y + T.coverHigh;
    const high = this.ray(_o, dir, reach + 0.3);
    if (high) return null;
    // altura do topo do muro
    _o.copy(low.point).addScaledVector(dir, 0.08);
    _o.y = p.position.y + T.coverHigh;
    const top = this.ray(_o, DOWN, T.coverHigh);
    return { height: top ? top.point.y - p.position.y : T.coverLow + 0.3 };
  }

  // ─── slide kick (#42) ─────────────────────────────────────────────────
  doKick(p) {
    this.kickCooldown = T.kickCooldown;
    this.kick = { t: 0, hit: false, done: false };
    this.tryKick(p);
  }
  /** Procura um alvo no alcance do chute; acerta no máximo um. */
  tryKick(p) {
    const ctx = this.ctx;
    const s = this.slide;
    if (!s || !this.kick || this.kick.done) return;
    const dir = s.dir;
    let best = null;
    // 1) inimigos (serviço enemies): à frente, perto, na altura do corpo
    for (const e of ctx.services.enemies?.list || []) {
      if (!e?.alive || !e.group) continue;
      const ep = e.group.position;
      const dx = ep.x - p.position.x, dz = ep.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > T.kickRange + 0.35 || Math.abs(ep.y - p.position.y) > 1.2) continue;
      if (d > 0.05 && (dx * dir.x + dz * dir.z) / d < T.kickCone) continue;
      const col = e.collider || (e.colliderId != null ? ctx.collision.get(e.colliderId) : null);
      if (!col?.data?.damage) continue;
      if (!best || d < best.d) best = { d, target: e, col, point: new THREE.Vector3(ep.x, ep.y + 0.55, ep.z) };
    }
    // 2) qualquer coisa danificável (alvos, objetos) num raio à frente
    if (!best) {
      _o.copy(p.position).addScaledVector(dir, 0.9);
      _o.y += 0.5;
      const near = ctx.collision.overlapSphere?.(_o, 0.85, (c) => c.tag !== 'player' && !!c.data?.damage && c.enabled !== false) || [];
      for (const c of near) {
        const b = c.box;
        const pt = b ? new THREE.Vector3((b.min.x + b.max.x) / 2, Math.min(b.max.y, p.position.y + 0.55), (b.min.z + b.max.z) / 2) : _o.clone();
        const d = pt.distanceTo(p.position);
        if (!best || d < best.d) best = { d, target: c.data.enemy || c, col: c, point: pt };
      }
    }
    if (!best) return;
    const kdir = new THREE.Vector3(dir.x, 0.35, dir.z).normalize();
    const info = {
      point: best.point,
      normal: kdir.clone().negate(),
      distance: best.d,
      collider: best.col,
      part: 'leg',
      dir: kdir,
      damage: T.kickDamage,
      source: 'player',
      weapon: 'slideKick',
      melee: true,
      kick: true,
      knockdown: true,
      knockback: new THREE.Vector3(dir.x * T.kickKnock, 0, dir.z * T.kickKnock),
      sliding: true,
    };
    best.col.data.damage(T.kickDamage, info);
    // empurrão: soma na velocidade do alvo, se ele tiver (o cérebro retoma o controle depois)
    const tv = best.target?.velocity;
    if (tv && best.target.alive !== false) {
      tv.x += info.knockback.x;
      tv.z += info.knockback.z;
    }
    ctx.bus.emit('weapon:hit', info);
    this.kick.hit = true;
    this.kick.done = true;
    s.speed *= T.kickSlow;
    ctx.bus.emit('player:slideKick', { target: best.target, hit: true, damage: T.kickDamage, killed: best.target?.alive === false, point: best.point });
  }

  // ─── dive (#43) ───────────────────────────────────────────────────────
  startDive(p, from = 'sprint') {
    const v = p.velocity;
    if (from === 'slide' && this.slide) {
      const s = this.slide;
      v.x = s.dir.x * s.speed;
      v.z = s.dir.z * s.speed;
      this.slide = null;
      this.slideCooldown = T.slideCooldown;
      this.ctx.bus.emit('player:slide', { phase: 'end', on: false, speed: s.speed, material: this.groundMaterial, reason: 'dive', duration: s.t });
    }
    const s = Math.hypot(v.x, v.z) || 1;
    v.x += (v.x / s) * T.diveBoost;
    v.z += (v.z / s) * T.diveBoost;
    v.y = T.diveUp * (from === 'slide' ? 0.75 : 1);
    p.onGround = false;
    this.coyote = 0;
    this.diving = true;
    this.startSprint(0);
    // corpo baixo no ar (cabeça à frente): cápsula de agachado
    this.stance = 'crouch';
    p.height = T.stance.crouch.height;
    this.ctx.bus.emit('player:jump', { speed: s, dive: true, material: this.groundMaterial });
    this.ctx.bus.emit('player:dive', { phase: 'start', speed: s, from });
  }

  // ─── mantle / vault / pendurar ────────────────────────────────────────
  /**
   * Procura uma borda à frente. `allowHang`: bordas acima do mantle (até
   * hangReach dos pés) retornam { hang: true } para pendurar.
   */
  findMantle(p, grounded, allowHang = false) {
    const pos = p.position;
    const f = _d.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const reach = p.radius + T.mantleReach + Math.min(0.5, Math.hypot(p.velocity.x, p.velocity.z) * 0.06);
    const maxH = allowHang ? T.hangReach : T.mantleMax;
    let wall = null;
    for (const h of [0.3, 0.62, 0.95, 1.28, 1.6, 1.92, 2.2, 2.5]) {
      if (h > maxH + 0.05) break;
      _o.set(pos.x, pos.y + h, pos.z);
      const hit = this.ray(_o, f, reach);
      if (hit && hit.normal.dot(f) < -0.6) {
        wall = hit;
        break;
      }
    }
    if (!wall) return null;
    // topo: raio para baixo um pouco além da face
    const topY0 = pos.y + maxH + 0.35;
    _o.copy(wall.point).addScaledVector(f, 0.22);
    _o.y = topY0;
    const top = this.ray(_o, DOWN, maxH + 0.6);
    if (!top || top.normal.y < 0.7) return null;
    const ledge = top.point.y;
    const height = ledge - pos.y;
    if (height < 0.42 || height > maxH) return null;
    const wp = wall.point;
    const material = top.collider?.material || 'concrete';
    if (height > T.mantleMax) {
      // alta demais para o mantle: pendura (#52) se houver onde ficar em cima
      const land = new THREE.Vector3().copy(wp).addScaledVector(f, p.radius + 0.12);
      land.y = ledge + 0.01;
      let stanceAfter = 'stand';
      if (!this.fits(land, T.stance.stand.height, p.radius)) {
        if (this.fits(land, T.stance.crouch.height, p.radius)) stanceAfter = 'crouch';
        else return null;
      }
      return { hang: true, height, ledge, land, wall: wp.clone(), dir: f.clone(), stanceAfter, material };
    }
    // vão livre acima da cabeça até o topo da borda
    _o.set(pos.x, pos.y + p.height - 0.05, pos.z);
    const ceil = this.ray(_o, UP, Math.max(0.05, ledge + 0.4 - _o.y));
    if (ceil && ledge + 0.4 > _o.y) return null;

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
          return { vault: true, height, ledge, land, wall: wp.clone(), dir: f.clone(), material };
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
    return { vault: false, height, ledge, land, wall: wp.clone(), dir: f.clone(), stanceAfter, material };
  }

  startMantle(p, m, { climb = false } = {}) {
    const a = p.position.clone();
    const dur = climb ? T.climbTime : m.vault ? T.vaultTime + m.height * 0.05 : T.mantleTimeBase + m.height * T.mantleTimePerM;
    // ponto de controle: sobre a borda (vault) ou rente à face (mantle)
    const c = m.vault ? m.wall.clone().addScaledVector(m.dir, 0.25) : a.clone().addScaledVector(m.dir, 0.12);
    c.y = m.ledge + (m.vault ? 0.42 : 0.08);
    const keep = Math.max(Math.hypot(p.velocity.x, p.velocity.z), m.vault ? 4.2 : 0);
    // sprint antes do vault (para encadear em slide #47)
    const sprintLevel = this.sprint || (this.slide ? this.slide.level : 0);
    this.mantle = { t: 0, dur, a, b: m.land, c, vault: m.vault, height: m.height, dir: m.dir, keep, stanceAfter: m.stanceAfter || 'stand', material: m.material, slideAfter: this.crouchBuf > 0 && m.vault, sprintLevel, climb };
    if (this.slide) {
      this.slide = null;
      this.stance = 'stand';
      p.height = T.stance.stand.height;
    }
    this.mount = null;
    if (this.stance !== 'stand') this.setStance(p, 'stand');
    this.startSprint(this.sprint > 0 && m.vault ? this.sprint : 0);
    p.velocity.set(0, 0, 0);
    p.onGround = false;
    this.ctx.bus.emit('player:mantle', { height: m.height, vault: m.vault, duration: dur, material: m.material, climb });
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
      // vault → slide (#47): agachar apertado durante o vault encadeia um slide
      if (m.vault && (m.slideAfter || this.crouchBuf > 0) && this.stance === 'stand') {
        this.crouchBuf = 0;
        const sp = Math.max(m.keep * 0.95, T.sprint);
        p.velocity.set(m.dir.x * sp, 0, m.dir.z * sp);
        this.sprint = m.sprintLevel || 1;
        this.slideCooldown = 0;
        this.startSlide(p, { chain: true, bonus: T.vaultSlideBoost });
        this.ctx.bus.emit('player:vaultSlide', { speed: this.slide?.speed || sp });
      }
    }
  }

  startHang(p, m) {
    // pés logo abaixo da borda: olhos a hangEye abaixo do topo, colado na face
    const pos = _tmp.copy(m.wall).addScaledVector(m.dir, -(p.radius + 0.04));
    pos.y = m.ledge - T.hangEye - T.stance.stand.eye;
    if (!this.fits(pos, T.stance.stand.height, p.radius)) return false;
    p.position.copy(pos);
    p.velocity.set(0, 0, 0);
    p.onGround = false;
    this.startSprint(0);
    this.slide = null;
    this.mount = null;
    this.hang = { ledge: m.ledge, dir: m.dir.clone(), t: 0, fwdT: 0, m };
    this.ctx.bus.emit('player:hang', { phase: 'start', height: m.height, material: m.material });
    this.ctx.bus.emit('player:land', { speed: 2.4, height: 0, material: m.material, hard: false, mantle: true, stance: 'hang' });
    return true;
  }
  stepHang(dt, p, fx, fy, inp) {
    const h = this.hang;
    h.t += dt;
    p.velocity.set(0, 0, 0);
    p.onGround = false;
    this.airTime = 0;
    this.fallTop = p.position.y;
    // soltar: agachar ou trás
    if (inp.pressed('crouch') || (fy < 0 && h.t > 0.2)) {
      this.hang = null;
      p.velocity.set(-h.dir.x * 1.2, 0, -h.dir.z * 1.2);
      this.ctx.bus.emit('player:hang', { phase: 'drop' });
      return;
    }
    // subir: pulo, ou segurar frente por 0.25 s
    h.fwdT = fy > 0 ? h.fwdT + dt : 0;
    if ((this.jumpBuf > 0 || h.fwdT > 0.25) && h.t > 0.12) {
      this.jumpBuf = 0;
      // recalcula o ponto de pouso a partir da posição atual (após shimmy)
      const land = _tmp2.copy(p.position).addScaledVector(h.dir, p.radius + 0.04 + p.radius + 0.12);
      land.y = h.ledge + 0.01;
      let stanceAfter = 'stand';
      if (!this.fits(land, T.stance.stand.height, p.radius)) {
        if (this.fits(land, T.stance.crouch.height, p.radius)) stanceAfter = 'crouch';
        else return;
      }
      const wall = _o.copy(p.position).addScaledVector(h.dir, p.radius + 0.04);
      this.hang = null;
      this.ctx.bus.emit('player:hang', { phase: 'climb' });
      this.startMantle(p, { vault: false, height: h.ledge - p.position.y, ledge: h.ledge, land: land.clone(), wall: wall.clone(), dir: h.dir, stanceAfter, material: h.m.material }, { climb: true });
      return;
    }
    // shimmy lateral (A/D), só se a borda continua e a cápsula cabe
    if (fx !== 0) {
      const tx = -h.dir.z, tz = h.dir.x; // direita da face
      const step = fx * T.hangShimmy * dt;
      _tmp2.set(p.position.x + tx * step, p.position.y, p.position.z + tz * step);
      _o.set(_tmp2.x, h.ledge - 0.15, _tmp2.z);
      const face = this.ray(_o, h.dir, p.radius + 0.25);
      _o.set(_tmp2.x + h.dir.x * (p.radius + 0.25), h.ledge + 0.3, _tmp2.z + h.dir.z * (p.radius + 0.25));
      const top = this.ray(_o, DOWN, 0.5);
      if (face && top && Math.abs(top.point.y - h.ledge) < 0.12 && this.fits(_tmp2, T.stance.stand.height, p.radius)) p.position.copy(_tmp2);
    }
  }

  // ─── montar a arma (#50) ──────────────────────────────────────────────
  stepMount(dt, p, ads, inp) {
    const hs = Math.hypot(p.velocity.x, p.velocity.z);
    const want = (ads > 0.5 || inp.action('ads')) && p.onGround && !this.slide && !this.mantle && !this.hang && this.stance !== 'prone' && hs < T.mountBreak + (this.mount ? 0.4 : 0);
    if (!want) {
      if (this.mount) this.setMount(null, p);
      return;
    }
    const found = this.probeMount(p);
    if (found) this.setMount(found, p);
    else if (this.mount) {
      this.mount.lost += dt;
      if (this.mount.lost > 0.15) this.setMount(null, p);
    }
  }
  probeMount(p) {
    const base = T.stance[this.stance]?.eye ?? T.stance.stand.eye;
    const pos = p.position;
    const f = _d.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    // borda: algo plano abaixo da linha dos olhos logo à frente
    for (const ahead of [0.1, 0.3, 0.5, T.mountReach]) {
      _o.set(pos.x + f.x * (p.radius + ahead), pos.y + base + 0.04, pos.z + f.z * (p.radius + ahead));
      const top = this.ray(_o, DOWN, T.mountMaxBelow + 0.25);
      if (!top || top.normal.y < 0.7) continue;
      const h = top.point.y - pos.y;
      if (h < 0.45) continue;
      const eye = mountEye(base, h, this.stance === 'crouch' ? T.stance.crouch.eye - 0.25 : T.stance.crouch.eye);
      if (eye == null) continue;
      // linha de tiro por cima do apoio livre
      _o.set(pos.x, pos.y + eye, pos.z);
      if (this.ray(_o, f, p.radius + ahead + 0.6)) continue;
      return { kind: 'ledge', eye, height: h };
    }
    // parede ao lado (ombro): apoia de lado na quina
    for (const side of [1, -1]) {
      _o.set(pos.x, pos.y + base - 0.2, pos.z);
      _tmp.set(-f.z * side, 0, f.x * side);
      const hit = this.ray(_o, _tmp, p.radius + 0.32);
      if (hit && Math.abs(hit.normal.y) < 0.3) return { kind: 'wall', eye: null, side };
    }
    return null;
  }
  setMount(m, p) {
    const prev = this.mount;
    if (m) {
      if (prev && prev.kind === m.kind) {
        prev.lost = 0;
        if (m.eye != null) prev.eye = m.eye;
        return;
      }
      this.mount = { ...m, lost: 0 };
      this.ctx.bus.emit('player:mount', { on: true, kind: m.kind, height: m.height, side: m.side });
    } else if (prev) {
      this.mount = null;
      this.ctx.bus.emit('player:mount', { on: false, kind: prev.kind });
    }
  }

  // ─── estado comum + lean + passos ─────────────────────────────────────
  finishState(dt, p, fy, fx, ads = 0) {
    const ctx = this.ctx;
    const inp = this.input || ctx.input; // entrada virtual no modo shot (roteiro ?mv=)
    // altura dos olhos acompanha a postura (com mergulho no mantle)
    let eyeT = T.stance[this.stance].eye;
    if (this.mantle) {
      const u = this.mantle.t / this.mantle.dur;
      eyeT = T.stance.stand.eye - Math.sin(Math.PI * u) * (this.mantle.vault ? 0.32 : 0.22);
    }
    if (this.mount?.kind === 'ledge' && this.mount.eye != null) eyeT = this.mount.eye;
    if (this.diving) eyeT = 1.0;
    const k = 1 - Math.exp(-T.eyeLerp * dt * (eyeT < p.eyeHeight ? 1.25 : 1));
    p.eyeHeight += (eyeT - p.eyeHeight) * k;

    // lean (#51, Q/E): offset de câmera limitado por parede ao lado da cabeça
    const canLean = !this.slide && !this.mantle && !this.hang && this.sprint === 0 && this.stance !== 'prone';
    let lt = 0;
    if (canLean) lt = (inp.action('leanRight') ? 1 : 0) - (inp.action('leanLeft') ? 1 : 0);
    if (lt !== 0) lt *= this.leanRoom(p, lt);
    this.lean += (lt - this.lean) * (1 - Math.exp(-T.leanSpeed * dt));
    if (Math.abs(this.lean) < 1e-4) this.lean = 0;

    // passos: fase avança com a distância percorrida no chão
    this.prevStepPhase = this.stepPhase;
    const hs = Math.hypot(p.velocity.x, p.velocity.z);
    if (p.onGround && !this.slide && !this.mantle && this.diveSlide <= 0 && hs > 0.35) {
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
    st.speed = this.slide || this.hang ? Math.min(hs, 0.9) : hs;
    st.sprinting = this.sprint > 0 && hs > 1;
    st.tactical = this.sprint === 2 && hs > 1;
    st.crouching = this.stance === 'crouch' || this.stance === 'slide';
    st.prone = this.stance === 'prone';
    st.sliding = !!this.slide;
    st.mantling = !!this.mantle;
    st.vaulting = !!this.mantle?.vault;
    st.hanging = !!this.hang;
    st.diving = this.diving;
    st.mounted = this.mount?.kind || null;
    st.cover = this.cover > 0;
    st.stance = this.stance;
    st.lean = this.lean;
    st.airborne = !p.onGround && !this.hang;

    // ── publicado direto em ctx.player (arma / streaks leem com `?? 1`) ──
    p.sliding = !!this.slide;
    p.slideSpread = this.slide ? slideSpreadAt(this.slide.t) : 1;
    p.slideRecoil = this.slide ? T.slideRecoil : 1;
    p.mounted = this.mount?.kind || null;
    p.mountRecoil = this.mount ? T.mountRecoil : 1;
    p.mountSway = this.mount ? T.mountSway : 1;
    p.tacSprint = this.sprint === 2 && hs > 1;
    p.hanging = !!this.hang;
    p.diving = this.diving;
  }

  /** Fração (0..1) do lean que cabe: raios na altura da cabeça, com raio de cabeça. */
  leanRoom(p, side) {
    const eyeY = p.position.y + p.eyeHeight;
    _d.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(side); // direita × lado
    _tmp.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); // frente
    let room = 1;
    const need = T.leanDist + T.leanHeadR;
    for (const [up, fw] of [[0, 0], [0.12, 0.05], [-0.15, 0.08]]) {
      _o.set(p.position.x + _tmp.x * fw, eyeY + up, p.position.z + _tmp.z * fw);
      const hit = this.ray(_o, _d, need + 0.05);
      if (hit) room = Math.min(room, clamp((hit.distance - T.leanHeadR) / T.leanDist, 0, 1));
    }
    this.leanLimit = room;
    return room;
  }
}
