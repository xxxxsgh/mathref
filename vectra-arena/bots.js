/* ==========================================================================
   VECTRA ARENA — bots.js
   Bot: waypoint-navigating AI soldier with perception (view cone + ray
   line-of-sight + hearing), reaction time, strafing and burst fire.
   BotManager: creates teams, updates every bot, exposes hit meshes.
   ========================================================================== */

const BOT_DIFFICULTY = {
  easy:   { reaction: 0.85, accuracy: 0.16, turn: 3.0, burst: [2, 3], pause: [0.6, 1.1], headChance: 0.06, viewDist: 38, damage: 18 },
  normal: { reaction: 0.45, accuracy: 0.27, turn: 5.0, burst: [3, 5], pause: [0.35, 0.7], headChance: 0.12, viewDist: 50, damage: 22 },
  hard:   { reaction: 0.25, accuracy: 0.40, turn: 8.0, burst: [4, 7], pause: [0.2, 0.45], headChance: 0.2, viewDist: 65, damage: 25 },
};

const BOT_NAMES = {
  blue: ['ECHO', 'NOVA', 'KESTREL', 'HALO'],
  red: ['RAVEN', 'VIPER', 'ONYX', 'SPECTER', 'WRAITH'],
};

const TEAM_COLORS = {
  blue: { main: 0x1d4fd8, glow: 0x3db8ff, css: '#3db8ff' },
  red:  { main: 0xb3122c, glow: 0xff3a52, css: '#ff3a52' },
};

const BOT_RADIUS = 0.35;
const BOT_HEIGHT = 1.8;

class Bot {
  constructor(manager, team, name, index) {
    this.manager = manager;
    this.game = manager.game;
    this.team = team;
    this.name = name;
    this.index = index;
    this.isPlayer = false;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.aimPitch = 0;
    this.health = 100;
    this.armor = 50;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.lastFired = -10;
    this.spottedUntil = 0;     // shown on the enemy mini-map until this time

    // AI state
    this.state = 'patrol';
    this.target = null;
    this.targetSeenAt = -10;
    this.lastKnown = new THREE.Vector3();
    this.reactionLeft = 0;
    this.engageTime = 0;
    this.nextPerception = Math.random() * 0.2;
    this.path = [];
    this.goal = null;
    this.lane = null;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.burstLeft = 0;
    this.nextShot = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.deathT = 0;
    this.walkPhase = 0;

    this.buildModel();
  }

  get diff() { return BOT_DIFFICULTY[this.game.difficulty] || BOT_DIFFICULTY.normal; }

  /* ---------------------------- model ---------------------------- */
  buildModel() {
    const tc = TEAM_COLORS[this.team];
    const armor = new THREE.MeshStandardMaterial({ color: tc.main, roughness: 0.5, metalness: 0.6 });
    const suit = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.8, metalness: 0.2 });
    const glow = new THREE.MeshBasicMaterial({ color: tc.glow });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.4, metalness: 0.8 });

    const g = new THREE.Group();
    g.rotation.order = 'YXZ'; // yaw first, then the death tilt
    this.group = g;
    this.hitMeshes = [];
    const part = (geo, mat, x, y, z, parent, tag) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      if (tag) { m.userData.bot = this; m.userData.part = tag; this.hitMeshes.push(m); }
      return m;
    };

    // legs pivot at the hips so they can swing
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0.9, 0); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0.9, 0); g.add(this.legR);
    part(new THREE.BoxGeometry(0.2, 0.9, 0.22), suit, 0, -0.45, 0, this.legL, 'legs');
    part(new THREE.BoxGeometry(0.2, 0.9, 0.22), suit, 0, -0.45, 0, this.legR, 'legs');
    part(new THREE.BoxGeometry(0.22, 0.25, 0.24), armor, 0, -0.35, -0.02, this.legL);
    part(new THREE.BoxGeometry(0.22, 0.25, 0.24), armor, 0, -0.35, -0.02, this.legR);

    this.torso = new THREE.Group(); this.torso.position.set(0, 0.9, 0); g.add(this.torso);
    part(new THREE.BoxGeometry(0.52, 0.68, 0.3), suit, 0, 0.34, 0, this.torso, 'body');
    part(new THREE.BoxGeometry(0.5, 0.42, 0.34), armor, 0, 0.42, -0.01, this.torso);
    part(new THREE.BoxGeometry(0.3, 0.035, 0.02), glow, 0, 0.5, -0.185, this.torso);    // chest light
    part(new THREE.BoxGeometry(0.36, 0.3, 0.14), dark, 0, 0.42, 0.22, this.torso);     // backpack
    // head
    this.head = part(new THREE.BoxGeometry(0.27, 0.29, 0.29), armor, 0, 0.86, 0, this.torso, 'head');
    part(new THREE.BoxGeometry(0.24, 0.07, 0.02), glow, 0, 0.88, -0.15, this.torso);   // visor
    // arms + gun (aiming forward)
    this.arms = new THREE.Group(); this.arms.position.set(0, 0.55, 0); this.torso.add(this.arms);
    part(new THREE.BoxGeometry(0.12, 0.12, 0.45), suit, 0.27, 0, -0.18, this.arms);
    part(new THREE.BoxGeometry(0.12, 0.12, 0.45), suit, -0.2, -0.02, -0.25, this.arms);
    part(new THREE.BoxGeometry(0.08, 0.12, 0.7), dark, 0.12, 0.03, -0.45, this.arms);
    part(new THREE.BoxGeometry(0.085, 0.02, 0.4), glow, 0.12, 0.095, -0.45, this.arms);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0.12, 0.03, -0.82); this.arms.add(this.muzzle);

    // team-mate name tag
    if (this.team === 'blue') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      x.font = '700 30px "Segoe UI", Arial'; x.textAlign = 'center'; x.fillStyle = tc.css;
      x.shadowColor = '#000'; x.shadowBlur = 6;
      x.fillText(this.name, 128, 40);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      s.scale.set(0.8, 0.2, 1);
      s.position.y = 2.25;
      s.renderOrder = 10;
      g.add(s);
      this.tag = s;
    }
    this.game.scene.add(g);
  }

  getEyePos(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + 1.65, this.position.z); }
  getChestPos(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + 1.3, this.position.z); }

  spawn(x, z, yaw) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.health = 100;
    this.armor = 50;
    this.alive = true;
    this.state = 'patrol';
    this.target = null;
    this.path = [];
    this.goal = null;
    this.burstLeft = 0;
    this.deathT = 0;
    this.group.visible = true;
    this.group.rotation.set(0, yaw, 0);
    this.group.position.copy(this.position);
    this.torso.rotation.set(0, 0, 0);
    // each bot picks a lane: north corridor, courtyard or south rooms
    const lanes = [[0, 21], [0, 5], [0, -5], [0, -21]];
    this.lane = lanes[(this.index + Math.floor(Math.random() * 4)) % lanes.length];
    this.laneDone = false;
    this.lastPos.copy(this.position);
  }

  takeDamage(amount, attacker, part) {
    if (!this.alive) return 0;
    let dmg = amount;
    if (this.armor > 0 && part !== 'legs') {
      const absorbed = dmg * 0.4;
      dmg -= absorbed;
      this.armor = Math.max(0, this.armor - absorbed * 1.2);
    }
    dmg = Math.min(Math.round(dmg), Math.ceil(this.health)); // never count overkill
    this.health -= dmg;
    // getting shot makes the bot react towards the attacker
    if (attacker && attacker.alive && attacker.team !== this.team) {
      if (!this.target || this.game.time - this.targetSeenAt > 0.5) {
        this.lastKnown.copy(attacker.position);
        this.targetSeenAt = this.game.time - 0.6;
        if (this.state === 'patrol') { this.state = 'hunt'; this.path = []; }
      }
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathT = 0;
      this.deathDir = attacker ? Math.sign(Math.random() - 0.5) : 1;
    }
    return dmg;
  }

  /* ----------------------------- AI ------------------------------ */
  update(dt, frozen) {
    if (!this.alive) { this.animateDeath(dt); return; }
    const now = this.game.time;
    const d = this.diff;

    if (!frozen) {
      this.nextPerception -= dt;
      if (this.nextPerception <= 0) {
        this.nextPerception = 0.15 + Math.random() * 0.1;
        this.perceive(d);
      }
    }

    const seeing = this.target && this.target.alive && now - this.targetSeenAt < 0.35;
    let moveX = 0, moveZ = 0, speed = 0;

    if (frozen) {
      // equipment phase: stand still
    } else if (seeing) {
      this.state = 'engage';
      this.engageTime += dt;
      const tp = this.target.getChestPos(this._v || (this._v = new THREE.Vector3()));
      const dx = tp.x - this.position.x, dz = tp.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      this.turnTowards(Math.atan2(-dx, -dz), d.turn, dt);
      this.aimPitch = Math.atan2(tp.y - (this.position.y + 1.45), dist);
      // strafe sideways instead of charging in
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.strafeTimer = 0.5 + Math.random() * 0.9;
        if (Math.random() < 0.25) this.strafeDir = 0; // sometimes stand and aim
      }
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      moveX = -nz * this.strafeDir;
      moveZ = nx * this.strafeDir;
      if (dist > 28) { moveX += nx * 0.6; moveZ += nz * 0.6; } // close distance a little
      speed = 2.6;
      this.reactionLeft -= dt;
      if (this.reactionLeft <= 0) this.shoot(dt, d, dist);
    } else {
      this.engageTime = 0;
      if (this.target && this.target.alive && now - this.targetSeenAt < 6) this.state = 'hunt';
      else if (this.state !== 'patrol') { this.state = 'patrol'; this.path = []; this.target = null; }
      const dest = this.followPath();
      if (dest) {
        const dx = dest.x - this.position.x, dz = dest.z - this.position.z;
        const l = Math.hypot(dx, dz) || 1;
        moveX = dx / l; moveZ = dz / l;
        speed = this.state === 'hunt' ? 4.6 : 3.9;
        this.turnTowards(Math.atan2(-dx, -dz), d.turn * 0.7, dt);
        this.aimPitch *= 0.9;
      }
    }

    // integrate movement with collision
    const ml = Math.hypot(moveX, moveZ);
    if (ml > 0) { moveX /= ml; moveZ /= ml; }
    const k = 1 - Math.exp(-10 * dt);
    this.velocity.x += (moveX * speed - this.velocity.x) * k;
    this.velocity.z += (moveZ * speed - this.velocity.z) * k;
    this.velocity.y -= 20 * dt;
    const res = this.game.arena.moveBody(this.position,
      { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt }, BOT_RADIUS, BOT_HEIGHT, 0.45);
    if (res.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (res.hitWall && this.state !== 'engage') this.stuckTimer += dt * 2;

    // stuck detection -> repath
    this.stuckTimer += dt;
    if (this.stuckTimer > 1.2) {
      if (!frozen && this.state !== 'engage' && this.position.distanceTo(this.lastPos) < 0.5) {
        this.path = [];
        this.goal = this.randomGoal();
      }
      this.stuckTimer = 0;
      this.lastPos.copy(this.position);
    }

    this.animate(dt);
  }

  turnTowards(targetYaw, rate, dt) {
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = rate * dt;
    this.yaw += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
    return Math.abs(diff);
  }

  /** View cone + line of sight + hearing. Picks the nearest visible enemy. */
  perceive(d) {
    const now = this.game.time;
    const eye = this.getEyePos(this._e || (this._e = new THREE.Vector3()));
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best = null, bestD = Infinity;
    const tp = this._tp || (this._tp = new THREE.Vector3());
    for (const enemy of this.game.combatants) {
      if (!enemy.alive || enemy.team === this.team) continue;
      enemy.getEyePos(tp);
      const dx = tp.x - eye.x, dz = tp.z - eye.z;
      const dist = Math.hypot(dx, dz);
      if (dist > d.viewDist) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      const heard = (now - enemy.lastFired < 0.6 && dist < 30) || dist < 4;
      if (dot < 0.34 && !heard) continue;      // ~140° view cone
      // check head and chest so partial cover still counts as visible
      let visible = this.game.arena.lineOfSight(eye, tp);
      if (!visible) { enemy.getChestPos(tp); visible = this.game.arena.lineOfSight(eye, tp); }
      if (!visible) continue;
      if (dist < bestD) { bestD = dist; best = enemy; }
    }
    if (best) {
      if (best !== this.target || now - this.targetSeenAt > 1.5) {
        this.reactionLeft = this.diff.reaction * (0.8 + Math.random() * 0.4);
        this.engageTime = 0;
      }
      this.target = best;
      this.targetSeenAt = now;
      this.lastKnown.copy(best.position);
      // team spotting for the mini-map
      if (this.team === 'blue' && !best.isPlayer) best.spottedUntil = now + 1.5;
    }
  }

  shoot(dt, d, dist) {
    const now = this.game.time;
    if (now < this.nextShot) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = d.burst[0] + Math.floor(Math.random() * (d.burst[1] - d.burst[0] + 1));
    }
    this.burstLeft--;
    this.nextShot = now + (this.burstLeft > 0 ? 0.11 : d.pause[0] + Math.random() * (d.pause[1] - d.pause[0]));
    this.lastFired = now;
    if (this.team === 'red') this.spottedUntil = now + 1.2;

    // hit probability: difficulty, distance, aim settling, movement
    const target = this.target;
    let p = d.accuracy;
    p *= THREE.MathUtils.clamp(1.25 - dist / 55, 0.35, 1.2);
    p *= Math.min(1, 0.45 + this.engageTime * 0.6);
    const ts = Math.hypot(target.velocity.x, target.velocity.z);
    if (ts > 3) p *= 0.75;
    if (target.crouching) p *= 0.9;
    const hit = Math.random() < p;

    const from = this.muzzle.getWorldPosition(this._m || (this._m = new THREE.Vector3()));
    const to = target.getChestPos(new THREE.Vector3());
    if (hit) {
      // make sure the shot is not blocked (target might have just moved behind cover)
      const eye = this.getEyePos(new THREE.Vector3());
      if (!this.game.arena.lineOfSight(eye, to)) return this.game.botShotFx(this, from, to, false);
      const r = Math.random();
      const part = r < d.headChance ? 'head' : r > 0.85 ? 'legs' : 'body';
      if (part === 'head') to.y += 0.35; else if (part === 'legs') to.y -= 0.7;
      const dmg = d.damage * HIT_MULTIPLIERS[part] * (0.85 + Math.random() * 0.15);
      this.game.botShotFx(this, from, to, true);
      this.game.applyDamage(target, dmg, this, part, 'rifle', this.position);
    } else {
      to.x += (Math.random() - 0.5) * 1.6;
      to.y += (Math.random() - 0.3) * 1.2;
      to.z += (Math.random() - 0.5) * 1.6;
      this.game.botShotFx(this, from, to, false);
    }
  }

  /* --------------------------- navigation -------------------------- */
  randomGoal() {
    const n = this.game.arena.nodes;
    return n[Math.floor(Math.random() * n.length)].p.clone();
  }

  chooseGoal() {
    if (this.state === 'hunt') return this.lastKnown.clone();
    if (!this.laneDone && this.lane) return new THREE.Vector3(this.lane[0] + (Math.random() - 0.5) * 6, 0, this.lane[1]);
    // push into the enemy half, then roam
    if (Math.random() < 0.5) {
      const enemySpawn = this.game.arena.spawns[this.team === 'blue' ? 'red' : 'blue'];
      const s = enemySpawn[Math.floor(Math.random() * enemySpawn.length)];
      return new THREE.Vector3(s[0] * 0.75, 0, s[1] + (Math.random() - 0.5) * 10);
    }
    return this.randomGoal();
  }

  followPath() {
    if (!this.path.length) {
      this.goal = this.chooseGoal();
      this.path = this.game.arena.findPath(this.position, this.goal).map(p => p.clone());
      if (!this.path.length) return null;
    }
    // skip waypoints we can already walk straight past (path smoothing)
    while (this.path.length > 1) {
      const nxt = this.path[1];
      const a = new THREE.Vector3(this.position.x, 0, this.position.z);
      if (a.distanceTo(nxt) < 7 && this.game.arena.clearPath(a, nxt, 0.4)) this.path.shift();
      else break;
    }
    const p = this.path[0];
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    if (dx * dx + dz * dz < 0.8) {
      this.path.shift();
      if (!this.path.length) {
        if (this.lane && !this.laneDone) this.laneDone = true;
        if (this.state === 'hunt') { this.state = 'patrol'; this.target = null; }
        return null;
      }
    }
    return this.path[0];
  }

  /* --------------------------- animation --------------------------- */
  animate(dt) {
    const g = this.group;
    g.position.copy(this.position);
    g.rotation.y = this.yaw;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkPhase += dt * speed * 2.2;
    // audible footsteps when close to the listener (reveals flanking enemies)
    this.stepAccum = (this.stepAccum || 0) + speed * dt;
    if (this.stepAccum > 2.3) {
      this.stepAccum = 0;
      const lp = this.game.camera.position;
      const d = lp.distanceTo(this.position);
      if (d < 16 && this.game.mode === 'playing') {
        const yaw = this.game.player.yaw;
        const dx = this.position.x - lp.x, dz = this.position.z - lp.z;
        const pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / (d || 1);
        this.game.audio.footstep(0.22 * (1 - d / 16), pan * 0.8);
      }
    }
    const swing = Math.sin(this.walkPhase) * Math.min(1, speed / 4) * 0.6;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.arms.rotation.x = this.aimPitch * 0.9;
    this.torso.rotation.y = 0;
  }

  animateDeath(dt) {
    if (this.deathT > 3) return;
    this.deathT += dt;
    const u = Math.min(1, this.deathT / 0.5);
    const e = u * u;
    this.group.rotation.set(-e * Math.PI / 2 * 0.95, this.yaw, e * 0.3 * this.deathDir);
    this.group.position.y = this.position.y - e * 0.1;
    if (this.deathT > 2.5) this.group.visible = false;
  }
}

class BotManager {
  constructor(game) {
    this.game = game;
    this.bots = [];
  }

  /** Creates `allies` blue bots and `enemies` red bots. */
  create(allies, enemies) {
    for (const b of this.bots) this.game.scene.remove(b.group);
    this.bots = [];
    for (let i = 0; i < allies; i++) this.bots.push(new Bot(this, 'blue', BOT_NAMES.blue[i % 4], i + 1));
    for (let i = 0; i < enemies; i++) this.bots.push(new Bot(this, 'red', BOT_NAMES.red[i % 5], i));
  }

  update(dt, frozen) {
    for (const b of this.bots) b.update(dt, frozen);
  }

  /** Hit meshes of bots that are alive (for player raycasts). */
  aliveHitMeshes() {
    const out = [];
    for (const b of this.bots) if (b.alive) out.push(...b.hitMeshes);
    return out;
  }
}
