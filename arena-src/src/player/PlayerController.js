import * as THREE from 'three';
import { STAND_HEIGHT, CROUCH_HEIGHT } from '../combat/Combatant.js';
import { damp } from '../core/Rng.js';

/**
 * Movimento e câmera do jogador.
 *
 * Aceleração/atrito no chão e controle aéreo limitado: dá para "strafear"
 * e parar rápido (contra-strafe), mas o pulo não vira foguete. Velocidade
 * depende da arma em mãos (WeaponDef.moveMult).
 */
export const MOVE = {
  run: 5.0,
  sprintMult: 1.32,
  crouchMult: 0.48,
  accel: 60,
  airAccel: 12,
  airMax: 1.2,
  friction: 9,
  stopSpeed: 1.5,
  jump: 5.3,
  gravity: 16,
};

const SENS_K = (0.022 * Math.PI) / 180; // rad por contagem × sensibilidade

export class PlayerController {
  /**
   * @param {import('../combat/Combatant.js').Combatant} actor
   * @param {import('../world/Collision.js').CollisionWorld} world
   * @param {import('../audio/AudioManager.js').AudioManager} audio
   */
  constructor(actor, world, audio) {
    this.actor = actor;
    this.world = world;
    this.audio = audio;
    this.sprinting = false;
    this.stepDist = 0;
    this.fallSpeed = 0;
    this.lastMouse = { dx: 0, dy: 0 };
    this.shake = 0;
    this.shakeT = 0;
    this.noSprintTimer = 0;
    this.speed = 0;
    /** @type {((impact: number) => void)|null} */
    this.onLand = null;
    this.wish = new THREE.Vector3();
  }

  /** "Trauma" de câmera (0..1): decai sozinho. Mantido baixo de propósito. */
  addShake(v) {
    this.shake = Math.min(1, this.shake + v);
  }

  /**
   * @param {number} dt
   * @param {import('../core/Input.js').Input} input
   * @param {import('../core/Settings.js').SettingsData} settings
   * @param {{ frozen: boolean, moveMult: number, zoomMult: number, firing: boolean }} o
   */
  update(dt, input, settings, o) {
    const a = this.actor;
    const b = a.body;
    // ─── olhar ───
    const { dx, dy } = input.consumeMouse();
    this.lastMouse.dx = dx;
    this.lastMouse.dy = dy;
    const k = settings.sensitivity * SENS_K * o.zoomMult;
    a.yaw -= dx * k;
    a.pitch -= dy * k * (settings.invertY ? -1 : 1);
    a.pitch = Math.max(-1.53, Math.min(1.53, a.pitch));
    a.yaw = Math.atan2(Math.sin(a.yaw), Math.cos(a.yaw));

    if (!a.alive) return;

    // ─── agachar (checa teto antes de levantar) ───
    const wantCrouch = !o.frozen && input.down('crouch');
    if (wantCrouch) a.crouching = true;
    else if (a.crouching) {
      const p = b.pos;
      const blocked = this.world.overlaps(p.x - b.halfW, p.y + CROUCH_HEIGHT, p.z - b.halfW, p.x + b.halfW, p.y + STAND_HEIGHT, p.z + b.halfW);
      if (!blocked) a.crouching = false;
    }
    b.height = a.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    a.crouch = damp(a.crouch, a.crouching ? 1 : 0, 14, dt);

    // ─── intenção de movimento ───
    let fx = 0;
    let fz = 0;
    if (!o.frozen) {
      if (input.down('forward')) fz -= 1;
      if (input.down('back')) fz += 1;
      if (input.down('left')) fx -= 1;
      if (input.down('right')) fx += 1;
    }
    // joystick virtual: analógico (inclinar pouco = andar devagar)
    let analog = 1;
    if (!o.frozen && input.axisActive) {
      fx = input.axisX;
      fz = input.axisY;
      analog = Math.min(1, Math.hypot(fx, fz));
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    // local → mundo (yaw 0 olha para -Z)
    const s = Math.sin(a.yaw);
    const c = Math.cos(a.yaw);
    const wx = fx * c + fz * s;
    const wz = -fx * s + fz * c;

    if (o.firing) this.noSprintTimer = 0.35;
    this.noSprintTimer -= dt;
    // no toque, empurrar o joystick até o fim para frente = correr
    const wantSprint = input.down('sprint') || (input.axisActive && analog > 0.95 && fz < -0.8);
    this.sprinting = !o.frozen && wantSprint && fz < 0 && !a.crouching && b.grounded && this.noSprintTimer <= 0;
    let maxSpeed = MOVE.run * o.moveMult * (input.axisActive ? Math.max(0.35, analog) : 1);
    if (this.sprinting) maxSpeed *= MOVE.sprintMult;
    if (a.crouching) maxSpeed *= MOVE.crouchMult;

    const v = b.vel;
    if (b.grounded) {
      // atrito
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const drop = Math.max(sp, MOVE.stopSpeed) * MOVE.friction * dt;
        const ns = Math.max(0, sp - drop) / sp;
        v.x *= ns;
        v.z *= ns;
      }
      // aceleração na direção desejada
      if (len > 0) {
        const cur = v.x * wx + v.z * wz;
        const add = Math.min(MOVE.accel * dt * maxSpeed * 0.25, maxSpeed - cur);
        if (add > 0) {
          v.x += wx * add;
          v.z += wz * add;
        }
      }
      if (!o.frozen && input.pressed('jump')) {
        v.y = MOVE.jump;
        b.grounded = false;
        this.audio.footstep('concrete', null, 0.8);
      }
    } else if (len > 0) {
      const cur = v.x * wx + v.z * wz;
      const add = Math.min(MOVE.airAccel * dt * maxSpeed * 0.25, MOVE.airMax - cur);
      if (add > 0) {
        v.x += wx * add;
        v.z += wz * add;
      }
    }
    // nunca acima do limite no chão (ex.: troca para arma mais pesada)
    const hs = Math.hypot(v.x, v.z);
    if (b.grounded && hs > maxSpeed) {
      v.x *= maxSpeed / hs;
      v.z *= maxSpeed / hs;
    }
    v.y -= MOVE.gravity * dt;

    const wasGrounded = b.grounded;
    const vyBefore = v.y;
    const px = b.pos.x;
    const pz = b.pos.z;
    this.world.moveBody(b, dt);
    if (!wasGrounded && b.grounded && vyBefore < -3) {
      const impact = -vyBefore;
      this.audio.land(this.surfaceBelow());
      this.onLand?.(impact);
      this.addShake(Math.min(0.15, impact * 0.012));
    }
    this.speed = Math.hypot(b.vel.x, b.vel.z);

    // passos: agachado é silencioso
    if (b.grounded && !a.crouching) {
      this.stepDist += Math.hypot(b.pos.x - px, b.pos.z - pz);
      const stride = this.sprinting ? 2.6 : 2.2;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (this.speed > 2.5) this.audio.footstep(this.surfaceBelow(), null, this.sprinting ? 1.1 : 0.7);
      }
    }
    if (b.pos.y < -6) {
      // caiu do mapa: devolve ao spawn (segurança)
      b.pos.y = 2;
    }
  }

  surfaceBelow() {
    const p = this.actor.body.pos;
    const h = this.world.raycast(p.x, p.y + 0.1, p.z, 0, -1, 0, 0.5);
    return h && h.box ? h.box.surface : 'concrete';
  }

  /**
   * Posiciona a câmera: olho + recuo + tremor.
   * @param {THREE.PerspectiveCamera} cam
   * @param {{ pitch: number, yaw: number }} recoil
   * @param {number} dt
   */
  applyCamera(cam, recoil, dt) {
    const a = this.actor;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shakeT += dt * 40;
    const sh = this.shake * this.shake;
    const sx = (Math.sin(this.shakeT * 1.3) * 0.5 + Math.sin(this.shakeT * 2.9) * 0.5) * sh * 0.02;
    const sy = (Math.sin(this.shakeT * 1.7) * 0.5 + Math.sin(this.shakeT * 3.3) * 0.5) * sh * 0.02;
    a.eye(cam.position);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(a.pitch + recoil.pitch + sy, a.yaw + recoil.yaw + sx, 0);
  }
}
