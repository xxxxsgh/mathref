/* ==========================================================================
   VECTRA ARENA — game.js
   - ParticleSystem   pooled GPU points (sparks, dust, smoke, energy)
   - TracerPool       short-lived bullet tracers
   - DecalPool        bullet-hole decals (recycled)
   - RoundManager     best-of-13 round flow (equipment → live → end)
   - Game             boot/loading, main loop, input, combat resolution,
                      camera effects, menus <-> match transitions
   ========================================================================== */

/* --------------------------------------------------------------------------
   ParticleSystem — one THREE.Points with a tiny shader (per-particle size,
   color and alpha). Fixed pool: no allocations while playing.
   -------------------------------------------------------------------------- */
class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.ps = [];
    for (let i = 0; i < max; i++) this.ps.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, grow: 0, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0 });
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute vec4 aColor; attribute float aSize;
        uniform float uScale; varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.05, -mv.z);
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    const p = this.ps[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.max = life;
    p.size = size; p.grow = opts.grow || 0;
    p.r = color.r; p.g = color.g; p.b = color.b; p.a = opts.alpha !== undefined ? opts.alpha : 1;
    p.grav = opts.grav !== undefined ? opts.grav : 0;
    p.drag = opts.drag || 0;
  }

  /** Burst helper: n particles from a point along a normal-ish cone. */
  burst(point, normal, n, speed, life, size, color, opts = {}) {
    for (let i = 0; i < n; i++) {
      const vx = normal.x * speed * (0.4 + Math.random()) + (Math.random() - 0.5) * speed;
      const vy = normal.y * speed * (0.4 + Math.random()) + (Math.random() - 0.5) * speed + (opts.up || 0);
      const vz = normal.z * speed * (0.4 + Math.random()) + (Math.random() - 0.5) * speed;
      this.emit(point.x, point.y, point.z, vx, vy, vz, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color, opts);
    }
  }

  clear() { for (const p of this.ps) p.life = 0; }

  update(dt, uScale) {
    this.mat.uniforms.uScale.value = uScale;
    const pos = this.pos, col = this.col, siz = this.siz;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (p.life <= 0) { siz[i] = 0; continue; }
      p.life -= dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.01) { p.y = 0.01; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.size += p.grow * dt;
      const t = Math.max(0, p.life / p.max);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.a * t;
      siz[i] = p.size;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

/* -------------------------------------------------------------------------- */
class TracerPool {
  constructor(scene, n = 24) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.items.push({ line, life: 0, max: 0.08 });
    }
    this.cursor = 0;
  }
  spawn(a, b, color = 0xffd38a, life = 0.07) {
    const t = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    const arr = t.line.geometry.attributes.position.array;
    // tracer is a segment of the real path, so it reads as a moving bullet
    const s = 0.15 + Math.random() * 0.25;
    arr[0] = a.x + (b.x - a.x) * s; arr[1] = a.y + (b.y - a.y) * s; arr[2] = a.z + (b.z - a.z) * s;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.visible = true;
    t.life = t.max = life;
  }
  update(dt) {
    for (const t of this.items) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
}

/* -------------------------------------------------------------------------- */
class DecalPool {
  constructor(scene, n = 40) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.35, 'rgba(10,10,10,0.9)');
    g.addColorStop(0.55, 'rgba(255,140,60,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const geo = new THREE.PlaneGeometry(0.14, 0.14);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.items.push(m);
    }
    this.cursor = 0;
    this._t = new THREE.Vector3();
  }
  add(point, normal) {
    const m = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.lookAt(this._t.copy(point).add(normal));
    m.rotation.z = Math.random() * Math.PI;
    m.visible = true;
  }
  clear() { for (const m of this.items) m.visible = false; }
}

/* --------------------------------------------------------------------------
   RoundManager — BEST OF 13 (first to 7)
   -------------------------------------------------------------------------- */
const BUY_TIME = 5;
const ROUND_TIME = 105;
const END_TIME = 5;

class RoundManager {
  constructor(game) {
    this.game = game;
    this.maxRounds = 13;
    this.winTarget = 7;
    this.reset();
  }

  reset() {
    this.round = 0;
    this.score = { blue: 0, red: 0 };
    this.state = 'idle';
    this.timer = 0;
  }

  alive(team) { return this.game.combatants.filter(c => c.team === team && c.alive).length; }

  startMatch() {
    this.reset();
    this.nextRound();
  }

  nextRound() {
    this.round++;
    this.state = 'buy';
    this.timer = BUY_TIME;
    this.game.resetRound();
    const ui = this.game.ui;
    ui.showBuy(true, this.timer);
    ui.roundBanner(this.round === this.maxRounds ? 'FINAL ROUND' : `ROUND ${this.round}`, 'EQUIPMENT PHASE', 'info');
    ui.updateScore();
  }

  update(dt) {
    this.timer -= dt;
    const ui = this.game.ui;
    if (this.state === 'buy') {
      ui.showBuy(true, this.timer);
      if (this.timer <= 0) {
        this.state = 'live';
        this.timer = ROUND_TIME;
        ui.showBuy(false);
        this.game.audio.roundStart();
        ui.roundBanner('FIGHT', `ROUND ${this.round} / ${this.maxRounds}`, 'info');
      }
    } else if (this.state === 'live') {
      if (this.timer <= 0) {
        const b = this.alive('blue'), r = this.alive('red');
        this.endRound(b > r ? 'blue' : 'red', 'TIME EXPIRED');
      }
    } else if (this.state === 'end') {
      if (this.timer <= 0) {
        if (this.score.blue >= this.winTarget || this.score.red >= this.winTarget || this.round >= this.maxRounds) this.game.endMatch();
        else this.nextRound();
      }
    }
  }

  checkElimination() {
    if (this.state !== 'live') return;
    if (this.alive('red') === 0) this.endRound('blue', 'ENEMY TEAM ELIMINATED');
    else if (this.alive('blue') === 0) this.endRound('red', 'BLUE TEAM ELIMINATED');
  }

  endRound(winner, reason) {
    this.score[winner]++;
    this.state = 'end';
    this.timer = END_TIME;
    const win = winner === 'blue';
    this.game.ui.roundBanner(win ? 'BLUE WINS THE ROUND' : 'RED WINS THE ROUND', reason, winner);
    this.game.audio.roundEnd(win);
    this.game.onRoundEnd(winner);
    this.game.ui.updateScore();
  }
}

/* --------------------------------------------------------------------------
   Game
   -------------------------------------------------------------------------- */
class Game {
  constructor() {
    this.save = new SaveManager();
    this.audio = new AudioManager(this.save.settings);
    this.time = 0;
    this.mode = 'loading';        // loading | menu | playing | matchEnd
    this.locked = false;
    this.noLock = /[?&]nolock/.test(location.search); // testing aid: play without pointer lock
    this.combatants = [];
    this.difficulty = 'normal';
    this.trauma = 0;
    this.deathTime = 0;
    this.spectateTarget = null;
    this.matchStats = null;
    this.input = {
      forward: false, back: false, left: false, right: false, sprint: false, crouch: false,
      fireDown: false, firePressed: false, altDown: false, altPressed: false, jumpPressed: false,
    };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.hudTimer = 0;
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
  }

  nextFrame() { return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); }

  /* ------------------------------ boot ------------------------------ */
  async boot() {
    const s = this.save.settings;
    this.ui = new UIManager(this);
    this.ui.setLoading(0.05, 'INITIALIZING RENDERER');
    await this.nextFrame();

    const canvas = document.getElementById('game-canvas');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = s.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a12);
    this.scene.fog = new THREE.FogExp2(0x0a0e18, 0.0105);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';

    this.ui.setLoading(0.12, 'LOADING PROFILE');
    await this.nextFrame();
    this.inventory = new Inventory(this.save);
    this.preview = new PreviewRenderer();
    this.ui.bind();

    this.ui.setLoading(0.2, 'GENERATING TEXTURES');
    await this.nextFrame();
    this.arena = new Arena(this.scene, s.quality);
    this.arena.buildMaterials();

    this.ui.setLoading(0.34, 'BUILDING OUTPOST');
    await this.nextFrame();
    this.arena.buildGeometry();
    this.arena.buildLights();

    this.ui.setLoading(0.5, 'RAISING THE CITY');
    await this.nextFrame();
    this.arena.buildCity();
    this.arena.buildParticles();
    this.scene.environment = createEnvironmentTexture(this.renderer);

    this.ui.setLoading(0.64, 'COMPUTING NAVIGATION');
    await this.nextFrame();
    this.arena.buildNavigation();

    this.ui.setLoading(0.76, 'ASSEMBLING WEAPONS');
    await this.nextFrame();
    this.viewModel = new ViewModel(this.renderer);
    this.arsenal = new Arsenal(this, this.viewModel);
    this.player = new Player(this);
    this.bots = new BotManager(this);
    this.rounds = new RoundManager(this);
    this.sparks = new ParticleSystem(this.scene, 500, true);
    this.smoke = new ParticleSystem(this.scene, 220, false);
    this.tracers = new TracerPool(this.scene);
    this.decals = new DecalPool(this.scene);
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 8, 2);
    this.scene.add(this.muzzleLight);
    this.botFlashes = [];
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: WeaponModels._flashTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.set(0.6, 0.6, 0.6);
      sp.visible = false;
      this.scene.add(sp);
      this.botFlashes.push({ sp, life: 0 });
    }
    this.botFlashCursor = 0;

    this.ui.setLoading(0.88, 'COMPILING SHADERS');
    await this.nextFrame();
    this.ui.buildMinimapBase(this.arena);
    this.applySettings();
    this.onResize();
    this.renderer.compile(this.scene, this.camera);

    this.ui.setLoading(1, 'READY');
    await this.nextFrame();
    this.bindInput();
    window.addEventListener('resize', () => this.onResize());

    this.mode = 'menu';
    this.ui.show('menu');
    this.checkMobile();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  checkMobile() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia && window.matchMedia('(any-pointer: fine)').matches;
    if (coarse && !fine) document.getElementById('mobile-warning').classList.remove('hidden');
  }

  /* --------------------------- settings ---------------------------- */
  applySettings() {
    const s = this.save.settings;
    const dpr = window.devicePixelRatio || 1;
    const pr = s.quality === 'low' ? Math.min(dpr, 1) * 0.75 : s.quality === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.25);
    if (this.renderer) {
      this.renderer.setPixelRatio(pr);
      this.onResize();
    }
    this.audio.applyVolumes();
    this.ui.applyCrosshair();
  }

  onResize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(w / h);
  }

  /** Horizontal FOV setting -> vertical FOV for three.js. */
  verticalFov(hfovDeg) {
    const h = THREE.MathUtils.degToRad(hfovDeg);
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / this.camera.aspect));
  }

  /* ----------------------------- input ----------------------------- */
  bindInput() {
    const inp = this.input;
    const playing = () => this.mode === 'playing';
    const keyMap = { KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint', ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch' };

    window.addEventListener('keydown', e => {
      if (!playing()) {
        if (e.code === 'Escape' && this.ui.screen && this.ui.screen !== 'menu' && this.mode === 'menu') this.ui.back();
        return;
      }
      if (keyMap[e.code]) { inp[keyMap[e.code]] = true; }
      if (e.ctrlKey || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      if (!this.locked) return;
      switch (e.code) {
        case 'Space': inp.jumpPressed = true; break;
        case 'KeyR': if (this.player.alive) this.arsenal.reload(); break;
        case 'Digit1': if (this.player.alive) this.arsenal.equipSlot(1); break;
        case 'Digit2': if (this.player.alive) this.arsenal.equipSlot(2); break;
        case 'Digit3': if (this.player.alive) this.arsenal.equipSlot(3); break;
        case 'KeyQ': if (this.player.alive && this.lastWeapon) this.arsenal.equip(this.lastWeapon); break;
        case 'KeyF': if (this.player.alive) this.arsenal.inspect(); break;
        case 'Tab': this.ui.showScoreboard(true); break;
        case 'KeyZ': this.buyPrimary('rifle'); break;
        case 'KeyX': this.buyPrimary('sniper'); break;
      }
    });
    window.addEventListener('keyup', e => {
      if (keyMap[e.code]) inp[keyMap[e.code]] = false;
      if (e.code === 'Tab') { e.preventDefault(); this.ui.showScoreboard(false); }
    });
    window.addEventListener('blur', () => { for (const k in inp) inp[k] = false; this.ui && this.ui.showScoreboard(false); });

    this.canvas.addEventListener('mousedown', e => {
      if (!playing()) return;
      if (!this.locked) { this.requestLock(); return; }
    });
    window.addEventListener('mousedown', e => {
      if (!playing() || !this.locked) return;
      if (e.button === 0) { inp.fireDown = true; inp.firePressed = true; }
      if (e.button === 2) { inp.altDown = true; inp.altPressed = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) inp.fireDown = false;
      if (e.button === 2) inp.altDown = false;
    });
    window.addEventListener('contextmenu', e => { if (playing()) e.preventDefault(); });
    window.addEventListener('wheel', e => {
      if (!playing() || !this.locked || !this.player.alive) return;
      const order = [this.arsenal.primaryId, 'pistol', 'knife'];
      const i = order.indexOf(this.arsenal.currentId);
      this.arsenal.equip(order[(i + (e.deltaY > 0 ? 1 : 2)) % 3]);
    }, { passive: true });
    document.addEventListener('mousemove', e => {
      if (!playing() || !this.locked) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      // ignore the occasional huge spike some browsers report on lock
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.mouseDX += dx;
      this.mouseDY += dy;
      if (this.player.alive) {
        const zoom = this.arsenal.ads ? this.arsenal.def.adsZoom : 1;
        this.player.look(dx, dy, 0.0022 * this.save.settings.sensitivity * zoom);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('click-resume').classList.add('hidden');
      } else if (this.mode === 'playing' && !this.noLock) {
        this.pause();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.mode === 'playing') document.getElementById('click-resume').classList.remove('hidden');
    });
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
  }

  /** Remembers the previous weapon for Q. */
  trackWeapon() {
    if (this._curW !== this.arsenal.currentId) {
      this.lastWeapon = this._curW;
      this._curW = this.arsenal.currentId;
    }
  }

  buyPrimary(id) {
    if (this.rounds.state !== 'buy' || !this.player.alive) return;
    this.arsenal.setPrimary(id);
    this.save.data.primary = id;
    this.arsenal.weapons[id].refill();
    this.arsenal.equip(id, true);
    this.ui.toast(`PRIMARY: ${WEAPON_DEFS[id].name}`);
  }

  requestLock() {
    if (this.noLock) { this.locked = true; return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => document.getElementById('click-resume').classList.remove('hidden'));
    } catch (e) {
      document.getElementById('click-resume').classList.remove('hidden');
    }
  }

  pause() {
    if (this.mode !== 'playing') return;
    for (const k in this.input) this.input[k] = false;
    this.ui.showScoreboard(false);
    if (this.ui.screen !== 'settings') document.getElementById('pause-menu').classList.remove('hidden');
  }

  resume() {
    this.audio.ui('click');
    document.getElementById('pause-menu').classList.add('hidden');
    this.requestLock();
    if (this.noLock) this.locked = true;
  }

  /* ------------------------- match flow ---------------------------- */
  async startMatch() {
    this.audio.init();
    this.audio.startMusic();
    this.ui.hideAllScreens();
    const ls = document.getElementById('screen-loading');
    ls.classList.add('active');
    document.getElementById('load-map').textContent = 'OUTPOST';
    const steps = ['SYNCING OPERATORS', 'DEPLOYING SQUADS', 'ARMING WEAPONS', 'READY'];
    for (let i = 0; i < steps.length; i++) {
      this.ui.setLoading((i + 1) / steps.length, steps[i]);
      await new Promise(r => setTimeout(r, 280));
    }
    ls.classList.remove('active');

    this.difficulty = this.save.settings.difficulty;
    this.arsenal.setPrimary(this.save.data.primary);
    this.arsenal.applySkins(this.inventory.equippedSkins());
    this.bots.create(3, 4);
    this.player.kills = this.player.deaths = this.player.headshots = 0;
    this.combatants = [this.player, ...this.bots.bots];
    this.matchStats = { kills: 0, deaths: 0, headshots: 0, damage: 0, roundsWon: 0 };
    this.mode = 'playing';
    this.ui.showHUD(true);
    this.rounds.startMatch();
    this.requestLock();
  }

  /** Called by RoundManager at the start of each round. */
  resetRound() {
    const A = this.arena;
    const bs = A.spawns.blue, rs = A.spawns.red;
    this.player.spawn(bs[0][0], bs[0][1], -Math.PI / 2);
    let bi = 1, ri = 0;
    for (const b of this.bots.bots) {
      if (b.team === 'blue') { const s = bs[bi++ % bs.length]; b.spawn(s[0], s[1], -Math.PI / 2); }
      else { const s = rs[ri++ % rs.length]; b.spawn(s[0], s[1], Math.PI / 2); }
    }
    this.arsenal.resetAll();
    this.ui.hideDeath();
    this.ui.spectate(null);
    this.spectateTarget = null;
    this.decals.clear();
    this.sparks.clear();
    this.smoke.clear();
    this.ui.updateVitals();
    this.ui.updateAmmo();
  }

  onRoundEnd(winner) {
    if (winner === 'blue') { this.matchStats.roundsWon++; this.save.progress.roundsWon++; }
    this.save.save();
  }

  endMatch() {
    this.mode = 'matchEnd';
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showHUD(false);
    this.ui.hideDeath();
    this.ui.showScoreboard(false);
    document.getElementById('pause-menu').classList.add('hidden');
    const sc = this.rounds.score;
    const win = sc.blue > sc.red;
    const m = this.matchStats;
    const p = this.save.progress;
    p.matches++;
    if (win) p.wins++; else p.losses++;
    const xp = m.kills * 100 + m.headshots * 50 + m.roundsWon * 150 + (win ? 1000 : 400);
    const levels = this.save.addXP(xp);
    const rewards = [`<div class="xp-gain">+${xp} XP</div>`];
    for (let i = 0; i < levels; i++) {
      const lvl = p.level - levels + i + 1;
      const item = this.inventory.grantReward(lvl);
      rewards.push(`<div class="reward"><img alt="" src="${this.preview.thumbnail(item)}"><div><span>LEVEL ${lvl} REWARD</span><b style="color:${item.rarityInfo.color}">${item.fullName}</b><small>${item.wearLevel} · Float ${item.floatValue.toFixed(3)} · Pattern ${item.patternSeed}</small></div></div>`);
    }
    this.save.save();
    this.ui.showMatchEnd(win, sc, [
      ['KILLS', m.kills], ['DEATHS', m.deaths], ['HEADSHOTS', m.headshots],
      ['DAMAGE', Math.round(m.damage)], ['ROUNDS WON', m.roundsWon], ['LEVEL', p.level],
    ], rewards);
  }

  quitToMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.mode = 'menu';
    this.save.save();
    for (const b of this.bots.bots) b.group.visible = false;
    this.ui.showHUD(false);
    this.ui.hideDeath();
    this.ui.setScope(false);
    ['pause-menu', 'match-end', 'scoreboard', 'click-resume'].forEach(id => document.getElementById(id).classList.add('hidden'));
    this.ui.history = [];
    this.ui.show('menu', false);
  }

  /* --------------------------- combat ------------------------------ */

  /** Player hitscan shot along the camera with a random cone of `spread`. */
  fireHitscan(def, spread) {
    const cam = this.camera;
    const origin = cam.getWorldPosition(this._v1);
    const dir = this._v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (spread > 0) {
      const right = this._v3.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const r = spread * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const hit = { point: new THREE.Vector3(), normal: new THREE.Vector3() };
    const wd = this.arena.raycastWithFloor(origin, dir, def.range, hit);

    this.raycaster.set(origin, dir);
    this.raycaster.near = 0;
    this.raycaster.far = wd;
    const hits = this.raycaster.intersectObjects(this.bots.aliveHitMeshes(), false);
    let end;
    if (hits.length) {
      const h = hits[0];
      const bot = h.object.userData.bot;
      const part = h.object.userData.part;
      end = h.point.clone();
      if (bot.team !== this.player.team) {
        const falloff = def.id === 'rifle' || def.id === 'pistol' ? Math.max(0.75, 1 - Math.max(0, h.distance - 35) / 200) : 1;
        this.applyDamage(bot, def.damage * HIT_MULTIPLIERS[part] * falloff, this.player, part, def.id, origin);
        const col = new THREE.Color(TEAM_COLORS[bot.team].glow);
        this.sparks.burst(h.point, dir.clone().negate(), part === 'head' ? 14 : 8, 3, 0.35, 0.06, col, { grav: 6 });
      } else {
        this.sparks.burst(h.point, dir.clone().negate(), 4, 2, 0.2, 0.04, new THREE.Color(0x9fdcff), { grav: 6 });
      }
    } else if (wd < def.range) {
      end = hit.point.clone();
      this.impact(hit.point, hit.normal, def.id === 'sniper');
    } else {
      end = origin.clone().addScaledVector(dir, def.range);
    }
    // tracer from the gun muzzle (approximation in world space)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(cam.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const start = origin.clone().addScaledVector(right, 0.16).addScaledVector(down, 0.12).addScaledVector(fwd, 0.7);
    if (!this.arsenal.scoped) this.tracers.spawn(start, end, 0xffd38a, def.id === 'sniper' ? 0.15 : 0.06);
    this.muzzleLight.position.copy(start);
    this.muzzleLight.intensity = 2.5;
    this.muzzleTimer = 0.05;
    // muzzle smoke
    this.smoke.emit(start.x, start.y, start.z, fwd.x * 0.6, 0.3, fwd.z * 0.6, 0.6, 0.12, new THREE.Color(0x8a8f99), { grow: 0.4, alpha: 0.25, drag: 2 });
  }

  /** Bullet impact on the environment: sparks, dust, smoke puff, decal. */
  impact(point, normal, heavy) {
    this.sparks.burst(point, normal, heavy ? 16 : 8, heavy ? 6 : 4, 0.35, 0.045, new THREE.Color(0xffb45a), { grav: 9, drag: 1 });
    this.smoke.burst(point, normal, heavy ? 6 : 3, 0.8, 0.9, 0.14, new THREE.Color(0x6b6f78), { grow: 0.35, alpha: 0.35, drag: 2.5, up: 0.3 });
    this.decals.add(point, normal);
  }

  /** Knife: short cone check in front of the player. Backstabs deal 2x. */
  meleeHit(range, damage, heavy) {
    if (this.mode !== 'playing' || !this.player.alive || this.arsenal.currentId !== 'knife') return;
    const eye = this.player.getEyePos(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let best = null, bestD = Infinity;
    const to = new THREE.Vector3();
    for (const b of this.bots.bots) {
      if (!b.alive || b.team === this.player.team) continue;
      b.getChestPos(to).sub(eye);
      const d = to.length();
      if (d > range + 0.4) continue;
      if (to.normalize().dot(fwd) < 0.65) continue;
      if (!this.arena.lineOfSight(eye, b.getChestPos(new THREE.Vector3()))) continue;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) {
      const bf = new THREE.Vector3(-Math.sin(best.yaw), 0, -Math.cos(best.yaw));
      const atk = new THREE.Vector3(best.position.x - eye.x, 0, best.position.z - eye.z).normalize();
      const backstab = bf.dot(atk) > 0.5;
      const dmg = backstab ? damage * 2 : damage;
      const p = best.getChestPos(new THREE.Vector3());
      this.applyDamage(best, dmg, this.player, 'body', 'knife', eye);
      this.audio.knifeHit();
      this.sparks.burst(p, fwd.clone().negate(), 12, 3, 0.4, 0.05, new THREE.Color(TEAM_COLORS[best.team].glow), { grav: 5 });
      this.shake(heavy ? 0.25 : 0.12);
      if (backstab) this.ui.toast('BACKSTAB');
      return;
    }
    const hit = { point: new THREE.Vector3(), normal: new THREE.Vector3() };
    const d = this.arena.raycastWithFloor(eye, fwd, range, hit);
    if (d < range) {
      this.sparks.burst(hit.point, hit.normal, 10, 3, 0.25, 0.035, new THREE.Color(0xffe0a0), { grav: 8 });
      this.audio.knifeHit();
      this.shake(0.08);
    }
  }

  /** Central damage entry point for every combatant. */
  applyDamage(victim, amount, attacker, part, weaponId, fromPos) {
    if (!victim.alive || this.rounds.state === 'buy' || this.mode !== 'playing') return;
    if (attacker && attacker.team === victim.team) return; // no friendly fire
    const dmg = victim.takeDamage(amount, attacker, part, fromPos);
    if (attacker && attacker.isPlayer) {
      this.matchStats.damage += dmg;
      this.ui.hitmarker(part === 'head', !victim.alive);
      this.audio.hit(part === 'head');
    }
    if (!victim.alive) this.onKill(attacker, victim, weaponId, part === 'head');
  }

  onKill(killer, victim, weaponId, headshot) {
    victim.deaths++;
    if (killer) killer.kills++;
    this.ui.killfeed(killer || { name: 'WORLD', team: '' }, victim, weaponId, headshot);
    const prog = this.save.progress;
    if (killer && killer.isPlayer) {
      this.matchStats.kills++;
      prog.kills++;
      if (headshot) { this.matchStats.headshots++; prog.headshots++; this.player.headshots++; }
      this.audio.kill();
      if (headshot) this.ui.toast('HEADSHOT', 'head');
    }
    if (victim.isPlayer) {
      this.matchStats.deaths++;
      prog.deaths++;
      this.audio.death();
      this.deathTime = this.time;
      this.arsenal.ads = false;
      this.ui.setScope(false);
      this.ui.showDeath(killer, this.player.damageTaken, weaponId);
    } else {
      const p = victim.getChestPos(new THREE.Vector3());
      this.sparks.burst(p, new THREE.Vector3(0, 1, 0), 24, 3, 0.7, 0.07, new THREE.Color(TEAM_COLORS[victim.team].glow), { grav: 4 });
      this.smoke.burst(p, new THREE.Vector3(0, 1, 0), 6, 0.6, 1.2, 0.3, new THREE.Color(0x3a3f4a), { grow: 0.5, alpha: 0.4, drag: 1.5 });
    }
    this.ui.updateScore();
    this.rounds.checkElimination();
  }

  onPlayerHurt(dmg, fromPos) {
    const p = this.player;
    this.audio.hurt();
    this.shake(Math.min(0.35, dmg / 60));
    this.ui.updateVitals();
    if (fromPos) {
      const dx = fromPos.x - p.position.x, dz = fromPos.z - p.position.z;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      this.ui.damageIndicator(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz));
    }
  }

  /** Visual/audio side of a bot shot (damage is applied separately). */
  botShotFx(bot, from, to, hit) {
    const col = bot.team === 'red' ? 0xff8a6a : 0x8ad8ff;
    this.tracers.spawn(from, to, col, 0.06);
    const f = this.botFlashes[this.botFlashCursor];
    this.botFlashCursor = (this.botFlashCursor + 1) % this.botFlashes.length;
    f.sp.position.copy(from);
    f.sp.visible = true;
    f.life = 0.05;
    // positional sound relative to the listener (player or spectated bot)
    const lp = this.camera.position;
    const d = lp.distanceTo(from);
    const vol = THREE.MathUtils.clamp(1 - d / 90, 0.04, 1) * 0.55;
    const yaw = this.player.yaw;
    const dx = from.x - lp.x, dz = from.z - lp.z;
    const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / (d || 1);
    this.audio.shoot('rifle', vol, side * 0.8, d > 25);
    if (!hit && d < 45) {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      dir.normalize();
      const h = { point: new THREE.Vector3(), normal: new THREE.Vector3() };
      const wd = this.arena.raycastWithFloor(from, dir, len + 20, h);
      if (wd < len + 20) this.sparks.burst(h.point, h.normal, 5, 3, 0.25, 0.04, new THREE.Color(0xffb45a), { grav: 9 });
    }
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  /* ----------------------------- loop ------------------------------ */
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);

    if (this.mode === 'menu' || this.mode === 'loading') {
      this.updateMenu(dt);
    } else if (this.mode === 'playing') {
      if (this.locked || this.noLock) this.updatePlaying(dt);
      this.render(true);
    } else if (this.mode === 'matchEnd') {
      this.arena.update(dt);
      this.render(false);
    }
    if (this.preview && this.preview.active) this.preview.update(dt);
  }

  updateMenu(dt) {
    this.time += dt;
    this.arena.update(dt);
    const t = this.time * 0.045;
    const cam = this.camera;
    cam.fov = 55;
    cam.updateProjectionMatrix();
    cam.position.set(Math.cos(t) * 52, 24 + Math.sin(this.time * 0.13) * 3, Math.sin(t) * 40);
    cam.lookAt(0, 2, 0);
    this.sparks.update(dt, this.particleScale());
    this.render(false);
  }

  particleScale() {
    return this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  updatePlaying(dt) {
    this.time += dt;
    const p = this.player, inp = this.input, a = this.arsenal;
    this.rounds.update(dt);
    if (this.mode !== 'playing') return; // match may have ended this frame
    const frozen = this.rounds.state === 'buy';
    p.frozen = frozen;

    if (p.alive) {
      p.update(dt, inp);
      a.update(dt, inp, p);
      this.trackWeapon();
    }
    this.bots.update(dt, frozen);
    this.arena.update(dt);
    this.tracers.update(dt);

    for (const f of this.botFlashes) {
      if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.sp.visible = false; }
    }
    if (this.muzzleTimer > 0) { this.muzzleTimer -= dt; if (this.muzzleTimer <= 0) this.muzzleLight.intensity = 0; }

    // ---------------- camera ----------------
    const cam = this.camera;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = this.time * 40;
    const shakeP = (Math.sin(n * 1.1) + Math.sin(n * 2.3) * 0.5) * 0.02 * sh;
    const shakeY = (Math.sin(n * 1.7 + 3) + Math.sin(n * 2.9) * 0.5) * 0.02 * sh;

    let targetFov = this.verticalFov(this.save.settings.fov);
    if (p.alive) {
      p.getEyePos(cam.position);
      cam.rotation.set(p.pitch + p.recoilPitch + shakeP, p.yaw + p.recoilYaw + shakeY, shakeY * 0.5);
      if (p.sprinting && p.horizontalSpeed > 4) targetFov += 6;
      if (a.ads) targetFov *= a.def.adsZoom;
    } else {
      this.updateSpectate(dt);
    }
    const fk = a.scoped ? 1 : 1 - Math.exp(-12 * dt);
    cam.fov += (targetFov - cam.fov) * fk;
    cam.updateProjectionMatrix();

    // ---------------- view model ----------------
    this.viewModel.update(dt, {
      moveSpeed: p.horizontalSpeed, grounded: p.grounded, sprinting: p.sprinting && p.horizontalSpeed > 4,
      mouseDX: this.mouseDX, mouseDY: this.mouseDY, ads: a.ads && !a.scoped,
      reloading: a.current ? a.current.reloading : false,
    });
    this.mouseDX = this.mouseDY = 0;

    this.sparks.update(dt, this.particleScale());
    this.smoke.update(dt, this.particleScale());

    // ---------------- HUD ----------------
    this.ui.setScope(a.scoped && p.alive);
    if (a.current && a.current.id !== 'knife' && p.alive) {
      const spread = a.computeSpread(a.current, p);
      this.ui.setCrosshairSpread(Math.min(40, spread * 500));
    } else this.ui.setCrosshairSpread(0);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.ui.updateVitals();
      this.ui.updateScore();
      if (p.alive) this.spotEnemies();
      if (!p.alive && this.time - this.deathTime > 3) {
        this.ui.hideDeath();
        this.ui.spectate(this.spectateTarget ? this.spectateTarget.name : null);
      }
    }
    this.ui.drawMinimap();
    inp.firePressed = inp.altPressed = inp.jumpPressed = false;
  }

  /** Enemies the player can currently see appear on the mini-map. */
  spotEnemies() {
    const p = this.player;
    const eye = p.getEyePos(this._v1);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const tp = this._v3;
    for (const b of this.bots.bots) {
      if (!b.alive || b.team === p.team) continue;
      b.getChestPos(tp);
      const dx = tp.x - eye.x, dz = tp.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d > 70 || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      if (this.arena.lineOfSight(eye, tp)) b.spottedUntil = this.time + 1.5;
    }
  }

  /** Third-person follow camera on a living team-mate after death. */
  updateSpectate(dt) {
    const cam = this.camera;
    if (this.time - this.deathTime < 3) {
      // slowly rise above the death position
      cam.position.y += dt * 0.6;
      cam.rotation.x = THREE.MathUtils.lerp(cam.rotation.x, -0.6, dt * 1.5);
      return;
    }
    if (!this.spectateTarget || !this.spectateTarget.alive) {
      this.spectateTarget = this.bots.bots.find(b => b.team === 'blue' && b.alive) || null;
    }
    const t = this.spectateTarget;
    if (!t) return;
    // over-the-shoulder: behind, slightly up and to the right of the team-mate
    const sx = Math.cos(t.yaw), sz = -Math.sin(t.yaw);
    const want = new THREE.Vector3(t.position.x + Math.sin(t.yaw) * 3.0 + sx * 0.9, t.position.y + 2.3, t.position.z + Math.cos(t.yaw) * 3.0 + sz * 0.9);
    cam.position.lerp(want, 1 - Math.exp(-6 * dt));
    const look = new THREE.Vector3(t.position.x - Math.sin(t.yaw) * 6 + sx * 0.5, t.position.y + 1.5, t.position.z - Math.cos(t.yaw) * 6 + sz * 0.5);
    cam.lookAt(look);
  }

  render(showViewModel) {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (showViewModel && this.player.alive && !this.arsenal.scoped && this.arsenal.current) {
      r.clearDepth();
      r.render(this.viewModel.scene, this.viewModel.camera);
    }
  }
}

/* --------------------------------------------------------------------------
   Bootstrap
   -------------------------------------------------------------------------- */
(function main() {
  if (!window.THREE) {
    document.getElementById('screen-loading').classList.remove('active');
    document.getElementById('fatal').classList.remove('hidden');
    document.getElementById('fatal-msg').textContent = 'Three.js could not be loaded (CDN unreachable and no local copy in assets/vendor). Check your connection and reload.';
    return;
  }
  const game = new Game();
  window.VECTRA = game; // handy for debugging from the console
  game.boot().catch(err => {
    console.error(err);
    document.getElementById('fatal').classList.remove('hidden');
    document.getElementById('fatal-msg').textContent = String(err && err.stack || err);
  });
})();
