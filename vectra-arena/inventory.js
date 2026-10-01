/* ==========================================================================
   VECTRA ARENA — inventory.js
   - Inventory        owned items (WeaponSkin), equip / sell / rewards,
                      persisted through SaveManager
   - PreviewRenderer  second WebGL renderer used for inventory thumbnails
                      and the full-screen INSPECTION viewer
   Selling is fictional: it only grants in-game credits (no real money,
   no purchases, no random paid rewards).
   ========================================================================== */

class Inventory {
  constructor(save) {
    this.save = save;
    if (!Array.isArray(save.data.inventory) || !save.data.inventory.length) this.generateStarter();
    this.items = save.data.inventory.map(o => new WeaponSkin(o));
    this.validateEquipped();
  }

  newId() { return this.save.data.nextItemId++; }

  generateStarter() {
    const d = this.save.data;
    d.inventory = [];
    d.nextItemId = 1;
    const add = (weapon, skinKey, floatValue, patternSeed) => {
      const o = { id: d.nextItemId++, weapon, skinKey, floatValue, patternSeed };
      d.inventory.push(o);
      return o;
    };
    // default "Standard Issue" for each weapon (cannot be sold)
    const std = {};
    for (const w of ['rifle', 'sniper', 'pistol', 'knife']) std[w] = add(w, 'standard', 0.2, 0);
    // a varied starter collection so every rarity and wear level is visible
    const knife = add('knife', 'cyberstorm', 0.287, 734);
    add('knife', 'crimson_circuit', 0.031, 112);
    add('knife', 'neon_rupture', 0.612, 405);
    add('knife', 'void_runner', 0.094, 7);
    const rifle = add('rifle', 'obsidian_pulse', 0.012, 268);
    add('rifle', 'rust_protocol', 0.414, 51);
    add('rifle', 'urban_static', 0.79, 903);
    add('rifle', 'void_runner', 0.143, 640);
    add('rifle', 'obsidian_pulse', 0.52, 981);
    const sniper = add('sniper', 'arctic_signal', 0.055, 333);
    add('sniper', 'solar_grid', 0.33, 812);
    const pistol = add('pistol', 'crimson_circuit', 0.19, 455);
    add('pistol', 'cyberstorm', 0.47, 22);
    add('pistol', 'neon_rupture', 0.081, 777);
    d.equipped = { rifle: rifle.id, sniper: sniper.id, pistol: pistol.id, knife: knife.id };
    void std;
    this.save.save();
  }

  validateEquipped() {
    const eq = this.save.data.equipped;
    for (const w of ['rifle', 'sniper', 'pistol', 'knife']) {
      const item = this.get(eq[w]);
      if (!item || item.weapon !== w) {
        const fallback = this.items.find(i => i.weapon === w);
        if (!fallback) {
          const o = { id: this.newId(), weapon: w, skinKey: 'standard', floatValue: 0.2, patternSeed: 0 };
          this.items.push(new WeaponSkin(o));
          eq[w] = o.id;
        } else eq[w] = fallback.id;
      }
    }
    this.persist();
  }

  get(id) { return this.items.find(i => i.id === id) || null; }

  isEquipped(item) { return this.save.data.equipped[item.weapon] === item.id; }

  equippedSkin(weapon) { return this.get(this.save.data.equipped[weapon]); }

  equippedSkins() {
    return { rifle: this.equippedSkin('rifle'), sniper: this.equippedSkin('sniper'), pistol: this.equippedSkin('pistol'), knife: this.equippedSkin('knife') };
  }

  equip(id) {
    const item = this.get(id);
    if (!item) return false;
    this.save.data.equipped[item.weapon] = item.id;
    this.persist();
    return true;
  }

  canSell(item) {
    return item && item.skinKey !== 'standard' && !this.isEquipped(item);
  }

  sell(id) {
    const item = this.get(id);
    if (!this.canSell(item)) return 0;
    const value = item.sellValue;
    this.items = this.items.filter(i => i.id !== id);
    this.save.data.progress.credits += value;
    this.persist();
    return value;
  }

  filter(cat) {
    const order = (a, b) => RARITIES[b.rarity].tier - RARITIES[a.rarity].tier || a.floatValue - b.floatValue;
    let list = this.items;
    if (cat === 'knives') list = list.filter(i => i.weapon === 'knife');
    else if (cat === 'rifles') list = list.filter(i => i.weapon === 'rifle' || i.weapon === 'sniper');
    else if (cat === 'pistols') list = list.filter(i => i.weapon === 'pistol');
    return list.slice().sort(order);
  }

  /** Level-up reward: deterministic skin rotation, random float + seed. */
  grantReward(level) {
    const keys = Object.keys(SKIN_CATALOG).filter(k => k !== 'standard');
    const skinKey = keys[(level * 3) % keys.length];
    const weapons = ['rifle', 'pistol', 'sniper', 'knife'];
    const weapon = weapons[level % weapons.length];
    const o = { id: this.newId(), weapon, skinKey, floatValue: Math.round(Math.random() * 1000) / 1000, patternSeed: Math.floor(Math.random() * 1001) };
    const item = new WeaponSkin(o);
    this.items.push(item);
    this.persist();
    return item;
  }

  persist() {
    this.save.data.inventory = this.items.map(i => i.toJSON());
    this.save.save();
  }
}

/* --------------------------------------------------------------------------
   PreviewRenderer — thumbnails + interactive inspection viewer.
   -------------------------------------------------------------------------- */
class PreviewRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'inspect-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.environment = createEnvironmentTexture(this.renderer);
    this.camera = new THREE.PerspectiveCamera(32, 1.6, 0.01, 50);

    // lighting rig with switchable presets
    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x15100c, 0.8);
    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    this.key.position.set(2, 3, 3);
    this.fill = new THREE.PointLight(0x3df5ff, 1.2, 10);
    this.fill.position.set(-2, 0.5, 1.5);
    this.rim = new THREE.PointLight(0xa95cff, 1.4, 10);
    this.rim.position.set(1.5, -0.5, -2);
    this.scene.add(this.hemi, this.key, this.fill, this.rim);
    this.lightPresets = [
      { name: 'STUDIO', hemi: 0.8, key: 1.6, fill: [0x3df5ff, 1.2], rim: [0xa95cff, 1.4] },
      { name: 'NEON', hemi: 0.3, key: 0.5, fill: [0xff2bd6, 2.6], rim: [0x3df5ff, 2.6] },
      { name: 'DAYLIGHT', hemi: 1.3, key: 2.4, fill: [0xffffff, 0.6], rim: [0xffe2b0, 0.6] },
      { name: 'EMERGENCY', hemi: 0.25, key: 0.4, fill: [0xff6a1f, 2.4], rim: [0xff2e4a, 1.6] },
    ];
    this.lightIndex = 0;

    // background particles for the inspection screen
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 5;
      pos[i * 3 + 2] = -1.5 - Math.random() * 4;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.bgParticles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.025, color: 0x6fdcff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.bgParticles);
    // holographic ring under the item
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.004, 6, 80), new THREE.MeshBasicMaterial({ color: 0x3df5ff, transparent: true, opacity: 0.5 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = -0.35;
    this.scene.add(this.ring);

    this.holder = new THREE.Group();   // user rotation
    this.scene.add(this.holder);
    this.models = {};
    this.current = null;
    this.thumbCache = new Map();

    // inspection state
    this.active = false;
    this.autoRotate = true;
    this.rotY = 0.5; this.rotX = 0.15;
    this.zoom = 1;
    this.dragging = false;
    this.time = 0;
  }

  /** Lazily builds a model per weapon type (no hands) and centers it. */
  model(weapon) {
    if (this.models[weapon]) return this.models[weapon];
    const built = WeaponModels[weapon]({ hands: false });
    const wrap = new THREE.Group();
    built.group.rotation.y = Math.PI / 2;        // lie sideways, barrel/blade pointing left
    wrap.add(built.group);
    const box = new THREE.Box3().setFromObject(wrap);
    const c = box.getCenter(new THREE.Vector3());
    built.group.position.sub(c);
    const size = box.getSize(new THREE.Vector3());
    const m = { wrap, skinMat: built.skinMat, size: Math.max(size.x, size.y * 1.6) };
    if (built.flash) built.flash.visible = false;
    this.models[weapon] = m;
    return m;
  }

  setItem(item, texSize = 256) {
    for (const k in this.models) this.models[k].wrap.visible = false;
    const m = this.model(item.weapon);
    if (m.wrap.parent !== this.holder) this.holder.add(m.wrap);
    m.wrap.visible = true;
    applySkinToMaterial(m.skinMat, item, texSize);
    this.current = { item, m };
    // holographic ring sized to the item
    this.ring.scale.setScalar(m.size * 0.75);
    this.ring.position.y = -m.size * 0.32;
  }

  frame(m, zoom = 1) {
    const dist = (m.size / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * 1.08 / zoom;
    this.camera.position.set(0, 0.0, dist);
    this.camera.lookAt(0, 0, 0);
  }

  applyLight(i) {
    const p = this.lightPresets[i];
    this.hemi.intensity = p.hemi;
    this.key.intensity = p.key;
    this.fill.color.setHex(p.fill[0]); this.fill.intensity = p.fill[1];
    this.rim.color.setHex(p.rim[0]); this.rim.intensity = p.rim[1];
    return p.name;
  }

  /** Renders a static thumbnail for an inventory card (cached). */
  thumbnail(item) {
    const key = `${item.id}|${item.skinKey}|${item.floatValue}|${item.patternSeed}`;
    if (this.thumbCache.has(key)) return this.thumbCache.get(key);
    const wasActive = this.active;
    const prevSize = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(320, 200, false);
    this.camera.aspect = 1.6;
    this.camera.updateProjectionMatrix();
    this.applyLight(0);
    this.bgParticles.visible = false;
    this.ring.visible = false;
    this.setItem(item);
    this.holder.rotation.set(0.12, 0.35, 0);
    this.frame(this.current.m, 1.45);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.thumbCache.set(key, url);
    this.bgParticles.visible = true;
    this.ring.visible = true;
    if (wasActive) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(prevSize.x, prevSize.y, false);
      this.applyLight(this.lightIndex);
    }
    return url;
  }

  /* ---------------- interactive inspection viewer ---------------- */

  open(container, item) {
    this.active = true;
    container.appendChild(this.canvas);
    this.container = container;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.resize();
    this.applyLight(this.lightIndex);
    this.setItem(item, 512);
    this.rotY = 0.5; this.rotX = 0.15; this.zoom = 1;
    if (!this._bound) this.bindInput();
  }

  close() {
    this.active = false;
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }

  resize() {
    if (!this.container) return;
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    this._bound = true;
    let lx = 0, ly = 0;
    this.canvas.addEventListener('mousedown', e => { this.dragging = true; lx = e.clientX; ly = e.clientY; this.canvas.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup', () => { this.dragging = false; this.canvas.style.cursor = 'grab'; });
    window.addEventListener('mousemove', e => {
      if (!this.dragging || !this.active) return;
      this.rotY += (e.clientX - lx) * 0.01;
      this.rotX += (e.clientY - ly) * 0.01;
      this.rotX = Math.max(-1.3, Math.min(1.3, this.rotX));
      lx = e.clientX; ly = e.clientY;
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.7, Math.min(3.2, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    }, { passive: false });
    // touch support for tablets
    this.canvas.addEventListener('touchstart', e => { const t = e.touches[0]; lx = t.clientX; ly = t.clientY; this.dragging = true; }, { passive: true });
    this.canvas.addEventListener('touchmove', e => {
      const t = e.touches[0];
      this.rotY += (t.clientX - lx) * 0.01; this.rotX += (t.clientY - ly) * 0.01;
      lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    this.canvas.addEventListener('touchend', () => { this.dragging = false; });
  }

  update(dt) {
    if (!this.active || !this.current) return;
    this.time += dt;
    if (this.autoRotate && !this.dragging) this.rotY += dt * 0.5;
    this.holder.rotation.y = THREE.MathUtils.lerp(this.holder.rotation.y, this.rotY, 1 - Math.exp(-10 * dt));
    this.holder.rotation.x = THREE.MathUtils.lerp(this.holder.rotation.x, this.rotX, 1 - Math.exp(-10 * dt));
    this.holder.position.y = Math.sin(this.time * 1.2) * 0.015;
    this.frame(this.current.m, this.zoom);
    this.bgParticles.rotation.y += dt * 0.03;
    this.bgParticles.position.y = Math.sin(this.time * 0.4) * 0.1;
    this.ring.rotation.z += dt * 0.4;
    this.ring.material.opacity = 0.35 + Math.sin(this.time * 2) * 0.15;
    this.renderer.render(this.scene, this.camera);
  }
}
