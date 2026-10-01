/* ==========================================================================
   VECTRA ARENA — player.js
   Player: first-person controller (WASD, sprint, crouch, jump, gravity,
   AABB collision), health/armor, recoil state and camera placement.
   ========================================================================== */

const PLAYER_RADIUS = 0.35;
const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.2;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.08;

class Player {
  constructor(game) {
    this.game = game;
    this.isPlayer = true;
    this.name = 'YOU';
    this.team = 'blue';
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.lastShot = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.grounded = true;
    this.crouching = false;
    this.sprinting = false;
    this.sprintingHard = false;  // sprinting blocks firing for a moment
    this.height = STAND_HEIGHT;
    this.eye = STAND_EYE;
    this.stepAccum = 0;
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.damageTaken = 0;
    this.lastAttacker = null;
    this.lastFired = -10;
    this.frozen = false;
  }

  spawn(x, z, yaw) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = this.recoilYaw = 0;
    this.health = 100;
    this.armor = 50;
    this.alive = true;
    this.crouching = false;
    this.height = STAND_HEIGHT;
    this.eye = STAND_EYE;
    this.damageTaken = 0;
    this.lastAttacker = null;
  }

  get horizontalSpeed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  getEyePos(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eye, this.position.z);
  }

  getChestPos(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.height * 0.7, this.position.z);
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
  }

  /** Recoil kicks the view; recovered over time in update(). */
  addRecoil(r, shots) {
    const growth = 1 + Math.min(shots, 10) * 0.07;
    this.recoilPitch += r.pitch * growth;
    // pattern: drifts right early in the spray, then wobbles left/right
    const drift = shots < 6 ? 0.4 : Math.sin(shots * 0.7);
    this.recoilYaw += (drift + (Math.random() * 2 - 1)) * r.yaw;
    this.lastShot = this.game.time;
    this.lastFired = this.game.time;
  }

  update(dt, input) {
    if (!this.alive) return;
    const arena = this.game.arena;
    const arsenal = this.game.arsenal;
    const def = arsenal.def;

    // ---- crouch (uncrouch only if there is room above)
    const wantCrouch = input.crouch;
    if (wantCrouch && !this.crouching) this.crouching = true;
    if (!wantCrouch && this.crouching) {
      const test = { x: this.position.x, y: this.position.y + 0.01, z: this.position.z };
      if (!arena._anyOverlap(test, PLAYER_RADIUS, STAND_HEIGHT - 0.02)) this.crouching = false;
    }
    this.height = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    const targetEye = this.crouching ? CROUCH_EYE : STAND_EYE;
    this.eye = THREE.MathUtils.lerp(this.eye, targetEye, 1 - Math.exp(-14 * dt));

    // ---- desired horizontal velocity
    let fx = 0, fz = 0;
    if (!this.frozen) {
      if (input.forward) fz -= 1;
      if (input.back) fz += 1;
      if (input.left) fx -= 1;
      if (input.right) fx += 1;
    }
    // touch joystick: analog direction and magnitude
    let analog = 1;
    if (!this.frozen && input.touchMove) {
      fx = input.touchMove.x; fz = input.touchMove.y;
      analog = Math.min(1, Math.hypot(fx, fz));
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;

    this.sprinting = input.sprint && input.forward && !this.crouching && !arsenal.ads && len > 0 && !this.frozen;
    this.sprintingHard = this.sprinting && this.horizontalSpeed > 6.5;
    let speed = 5.4 * (def ? def.moveMult : 1) * Math.max(0.35, analog);
    if (this.sprinting) speed *= 1.42;
    if (this.crouching) speed *= 0.48;
    if (arsenal.ads) speed *= arsenal.scoped ? 0.45 : 0.62;

    const accel = this.grounded ? 14 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wx * speed - this.velocity.x) * k;
    this.velocity.z += (wz * speed - this.velocity.z) * k;

    // ---- jump & gravity
    if (input.jumpPressed && this.grounded && !this.frozen) {
      this.velocity.y = 6.4;
      this.grounded = false;
    }
    this.velocity.y -= 20 * dt;

    const wasGrounded = this.grounded;
    const fallSpeed = -this.velocity.y;
    const res = arena.moveBody(this.position,
      { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt },
      PLAYER_RADIUS, this.height, this.grounded ? 0.45 : 0.15);
    this.grounded = res.grounded;
    if (res.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (res.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
    if (!wasGrounded && this.grounded && fallSpeed > 5) {
      this.game.audio.land();
      this.game.viewModel.landDip = Math.min(0.06, fallSpeed * 0.006);
      this.game.shake(Math.min(0.25, fallSpeed * 0.02));
    }

    // ---- footsteps
    const hs = this.horizontalSpeed;
    if (this.grounded && hs > 1.5 && !this.crouching) {
      this.stepAccum += hs * dt;
      const stride = this.sprinting ? 2.6 : 2.1;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        this.game.audio.footstep(this.sprinting ? 0.32 : 0.22);
      }
    }

    // ---- recoil recovery
    const since = this.game.time - this.lastShot;
    if (since > 0.08) {
      const r = 1 - Math.exp(-7 * dt);
      this.recoilPitch -= this.recoilPitch * r;
      this.recoilYaw -= this.recoilYaw * r;
    }
  }

  /** Damage with armor absorption. Returns actual health removed. */
  takeDamage(amount, attacker, part, fromPos) {
    if (!this.alive) return 0;
    let dmg = amount;
    if (this.armor > 0 && part !== 'legs') {
      const absorbed = dmg * 0.4;
      dmg -= absorbed;
      this.armor = Math.max(0, this.armor - absorbed * 1.2);
    }
    dmg = Math.min(Math.round(dmg), Math.ceil(this.health)); // never count overkill
    this.health -= dmg;
    this.damageTaken += dmg;
    this.lastAttacker = attacker;
    this.game.onPlayerHurt(dmg, fromPos);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
    return dmg;
  }
}
