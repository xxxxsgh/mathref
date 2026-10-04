import { Vector3, Euler, MathUtils } from 'three';

/**
 * Jogador em primeira pessoa (estado + controlador embutido simples).
 *
 * O estado (posição dos pés, velocidade, yaw/pitch, vida…) é o CONTRATO.
 * A feature `movement` pode substituir só a física/locomoção atribuindo
 *   player.controller = { update(dt, player, ctx) { ... } }
 * e continuar usando o resto (câmera, interpolação, vida, offsets).
 *
 * Outras features mexem na câmera SEM brigar entre si através de canais
 * aditivos que o player soma ao sincronizar a câmera e zera não:
 *   player.viewOffset   (Vector3, local à câmera: bob, lean)   — dono escreve todo frame
 *   player.viewKick     ({pitch,yaw,roll} rad: recuo, impacto)  — dono escreve todo frame
 *   player.fovScale     (multiplicador: ADS, sprint)            — produto de fatores em player.fovFactors
 */
const _fwd = new Vector3();
const _right = new Vector3();
const _wish = new Vector3();
const _delta = new Vector3();

export class Player {
  constructor(camera, collision, input, bus) {
    this.camera = camera;
    this.collision = collision;
    this.input = input;
    this.bus = bus;
    this.position = new Vector3(0, 0, 0);
    this.prevPosition = new Vector3();
    this.velocity = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.35;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.stepHeight = 0.45;
    this.onGround = false;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.baseFov = 72; // FOV vertical em graus
    this.fovFactors = new Map(); // nome → fator (ex.: 'ads' → 0.7)
    this.viewOffset = new Vector3();
    this.viewKick = { pitch: 0, yaw: 0, roll: 0 };
    this.lookEnabled = true;
    this.moveEnabled = true;
    this.controller = null; // substituível pela feature movement
    this.state = { sprinting: false, crouching: false, moving: false, speed: 0 };
    this.walkSpeed = 4.6;
    this.sprintSpeed = 7.2;
    this.jumpSpeed = 5.2;
    this.gravity = 19.6;
    this._euler = new Euler(0, 0, 0, 'YXZ');
  }

  get eyePosition() {
    return new Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }
  /** Direção de visada (unitária) considerando yaw/pitch (sem kick). */
  getAimDir(out = new Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  setPose({ position, yaw, pitch }) {
    if (position) {
      this.position.set(position[0] ?? position.x, position[1] ?? position.y, position[2] ?? position.z);
      this.prevPosition.copy(this.position);
    }
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.velocity.set(0, 0, 0);
  }
  damage(amount, info = {}) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.bus?.emit('player:damage', { amount, health: this.health, ...info });
    if (this.health <= 0) {
      this.alive = false;
      this.bus?.emit('player:death', info);
    }
  }

  /** Passo fixo. */
  update(dt, ctx) {
    this.prevPosition.copy(this.position);
    if (this.lookEnabled) {
      const l = this.input.consumeLook();
      this.yaw += l.yaw;
      this.pitch = MathUtils.clamp(this.pitch + l.pitch, -1.5, 1.5);
    }
    if (!this.moveEnabled) return;
    if (this.controller) this.controller.update(dt, this, ctx);
    else this._builtin(dt);
  }

  _builtin(dt) {
    const inp = this.input;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _wish.set(0, 0, 0);
    if (inp.action('forward')) _wish.add(_fwd);
    if (inp.action('back')) _wish.sub(_fwd);
    if (inp.action('right')) _wish.add(_right);
    if (inp.action('left')) _wish.sub(_right);
    let mag = 1;
    // eixo analógico (joystick de toque): direção e intensidade proporcionais
    if (inp.axis?.active) {
      _wish.set(0, 0, 0).addScaledVector(_fwd, inp.axis.y).addScaledVector(_right, inp.axis.x);
      mag = Math.min(1, _wish.length());
    }
    const moving = _wish.lengthSq() > 1e-6;
    if (moving) _wish.normalize().multiplyScalar(mag);
    const sprint = moving && inp.action('sprint') && inp.action('forward');
    const speed = sprint ? this.sprintSpeed : this.walkSpeed;
    const accel = this.onGround ? 12 : 2.5;
    this.velocity.x = MathUtils.damp(this.velocity.x, _wish.x * speed, accel, dt);
    this.velocity.z = MathUtils.damp(this.velocity.z, _wish.z * speed, accel, dt);
    if (this.onGround && inp.pressed('jump')) {
      this.velocity.y = this.jumpSpeed;
      this.bus?.emit('player:jump', {});
    }
    this.velocity.y -= this.gravity * dt;
    const wasGrounded = this.onGround;
    const r = this.collision.moveCapsule(this.position, _delta.copy(this.velocity).multiplyScalar(dt), {
      radius: this.radius,
      height: this.height,
      stepHeight: this.stepHeight,
      wasGrounded,
    });
    this.onGround = r.onGround;
    if (r.onGround && this.velocity.y < 0) {
      if (!wasGrounded && this.velocity.y < -6) this.bus?.emit('player:land', { speed: -this.velocity.y });
      this.velocity.y = 0;
    }
    if (r.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
    if (this.position.y < -50) this.setPose({ position: [0, 2, 0] });
    this.state.sprinting = sprint;
    this.state.moving = moving;
    this.state.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Por frame de render: interpola a posição e aplica offsets/kick/FOV. */
  syncCamera(alpha = 1) {
    const cam = this.camera;
    cam.position.lerpVectors(this.prevPosition, this.position, alpha);
    cam.position.y += this.eyeHeight;
    this._euler.set(this.pitch + this.viewKick.pitch, this.yaw + this.viewKick.yaw, this.viewKick.roll);
    cam.quaternion.setFromEuler(this._euler);
    if (this.viewOffset.lengthSq() > 0) cam.position.add(_delta.copy(this.viewOffset).applyQuaternion(cam.quaternion));
    let f = 1;
    for (const v of this.fovFactors.values()) f *= v;
    const fov = this.baseFov * f;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
