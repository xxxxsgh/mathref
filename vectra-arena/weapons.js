/* ==========================================================================
   VECTRA ARENA — weapons.js
   - WEAPON_DEFS       gameplay stats (never influenced by skins/wear)
   - WeaponModels      original procedural first-person models
   - KeyframeAnim      smooth interpolated animations (no teleporting)
   - KNIFE_INSPECTS    5 inspection animations + 1 rare (5%)
   - ViewModel         separate scene/camera for the first-person weapon
   - Weapon / Knife    per-weapon state (ammo, cooldowns)
   - Arsenal           loadout, switching, firing, reload, inspect
   ========================================================================== */

const WEAPON_DEFS = {
  rifle: {
    id: 'rifle', slot: 1, name: 'ASSAULT RIFLE', codename: 'VR-17 VANGUARD',
    damage: 27, interval: 0.096, auto: true, mag: 30, reserve: 90,
    reloadTime: 2.2, drawTime: 0.55, range: 220,
    spread: { base: 0.003, move: 0.04, air: 0.12, crouch: 0.6, perShot: 0.0016 },
    recoil: { pitch: 0.0105, yaw: 0.005, kick: 0.035, rot: 0.06, shake: 0.06 },
    secondary: 'ads', adsZoom: 0.8, sound: 'rifle', moveMult: 0.92,
  },
  sniper: {
    id: 'sniper', slot: 1, name: 'PRECISION RIFLE', codename: 'LX-90 LONGBOW',
    damage: 105, interval: 1.25, auto: false, mag: 5, reserve: 20,
    reloadTime: 3.0, drawTime: 0.8, range: 400,
    spread: { base: 0.06, move: 0.16, air: 0.3, crouch: 0.8, perShot: 0, scoped: 0.0004 },
    recoil: { pitch: 0.045, yaw: 0.008, kick: 0.09, rot: 0.25, shake: 0.25 },
    secondary: 'scope', adsZoom: 0.28, sound: 'sniper', moveMult: 0.82,
  },
  pistol: {
    id: 'pistol', slot: 2, name: 'PISTOL', codename: 'P-4 WARDEN',
    damage: 26, interval: 0.14, auto: false, mag: 12, reserve: 48,
    reloadTime: 1.5, drawTime: 0.3, range: 150,
    spread: { base: 0.004, move: 0.025, air: 0.08, crouch: 0.7, perShot: 0.004 },
    recoil: { pitch: 0.016, yaw: 0.006, kick: 0.05, rot: 0.14, shake: 0.05 },
    secondary: 'ads', adsZoom: 0.85, sound: 'pistol', moveMult: 1.0,
  },
  knife: {
    id: 'knife', slot: 3, name: 'KNIFE', codename: 'TK-1 TALON',
    damage: 45, heavyDamage: 95, interval: 0.42, heavyInterval: 0.95,
    range: 2.3, drawTime: 0.55, auto: true, mag: Infinity, reserve: Infinity,
    secondary: 'heavy', sound: 'knife', moveMult: 1.08,
  },
};

const HIT_MULTIPLIERS = { head: 2.0, body: 1.0, legs: 0.75 };

/* --------------------------------------------------------------------------
   Shared materials (skin materials are created per model instance)
   -------------------------------------------------------------------------- */
const WeaponMats = {
  metal:   new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.28 }),
  steel:   new THREE.MeshStandardMaterial({ color: 0xd6dbe0, metalness: 1.0, roughness: 0.18 }),
  dark:    new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.6, roughness: 0.45 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x1c1f23, metalness: 0.1, roughness: 0.8, envMapIntensity: 0.5 }),
  glove:   new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.05, roughness: 0.95, envMapIntensity: 0.25 }),
  gloveAccent: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: 0.3, roughness: 0.6, envMapIntensity: 0.3 }),
  sleeve:  new THREE.MeshStandardMaterial({ color: 0x10151b, metalness: 0.0, roughness: 1.0, envMapIntensity: 0.2 }),
  glowCyan:   new THREE.MeshBasicMaterial({ color: 0x3df5ff }),
  glowOrange: new THREE.MeshBasicMaterial({ color: 0xff8a2f }),
  glowRed:    new THREE.MeshBasicMaterial({ color: 0xff2e4a }),
  lens:    new THREE.MeshStandardMaterial({ color: 0x0a2a40, metalness: 0.9, roughness: 0.05, emissive: 0x0b4060, emissiveIntensity: 0.6 }),
};

/** Builds a small "studio" environment map so metal reflects something. */
function createEnvironmentTexture(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x06080d);
  const add = (w, h, d, x, y, z, color, k) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
    m.position.set(x, y, z);
    s.add(m);
  };
  add(8, 0.4, 8, 0, 6, 0, 0xffffff, 2.2);
  add(0.4, 4, 7, -6, 1.5, 0, 0x3df5ff, 2.5);
  add(0.4, 4, 7, 6, 1.5, 0, 0xff7a2f, 2.0);
  add(7, 3, 0.4, 0, 1.5, -6, 0x8a5cff, 1.6);
  add(7, 3, 0.4, 0, 1.5, 6, 0x9fb4c8, 0.8);
  add(40, 0.2, 40, 0, -3, 0, 0x14171c, 1);
  const rt = pmrem.fromScene(s, 0.04);
  pmrem.dispose();
  return rt.texture;
}

/** Creates the per-instance skin material and applies a WeaponSkin to it. */
function makeSkinMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 });
}

function applySkinToMaterial(mat, skin, size = 256) {
  const tex = SkinTextureFactory.get(skin, size);
  mat.map = tex.map;
  mat.emissiveMap = tex.emissiveMap;
  mat.emissiveIntensity = tex.emissiveIntensity;
  mat.roughness = tex.roughness;
  mat.metalness = tex.metalness;
  mat.userData.baseEmissive = tex.emissiveIntensity;
  mat.needsUpdate = true;
}

/** Scales the UVs of a geometry (ExtrudeGeometry uses world units for UVs). */
function scaleUVs(geo, s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
}

/* --------------------------------------------------------------------------
   WeaponModels — procedural, original designs built from primitives.
   Every model points down -Z. Returns { group, skinMat, muzzle, flash }.
   -------------------------------------------------------------------------- */
const WeaponModels = {
  _box(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  },
  _cyl(parent, mat, r1, r2, len, x, y, z, axis = 'z', seg = 12) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
    m.position.set(x, y, z);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    parent.add(m);
    return m;
  },

  /** Muzzle flash: two crossed additive quads + a star core. */
  _flash(parent, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    const tex = WeaponModels._flashTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffc070 });
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * scale, 0.32 * scale), mat);
      p.rotation.set(0, i * Math.PI / 2, 0);
      p.rotation.x = Math.PI / 2;
      p.rotation.y = i * Math.PI / 2;
      p.position.z = -0.08 * scale;
      g.add(p);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.22 * scale, 0.22 * scale), mat);
    g.add(front);
    g.visible = false;
    parent.add(g);
    return g;
  },

  _flashTexture() {
    if (this._ftex) return this._ftex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(0.25, 'rgba(255,200,120,0.9)');
    grd.addColorStop(0.6, 'rgba(255,120,40,0.35)');
    grd.addColorStop(1, 'rgba(255,80,0,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    this._ftex = new THREE.CanvasTexture(c);
    return this._ftex;
  },

  /** Gloved hand + sleeve, used by every viewmodel. */
  _arm(parent, x, y, z, rx, ry, rz, len = 0.42) {
    const arm = new THREE.Group();
    arm.position.set(x, y, z);
    arm.rotation.set(rx, ry, rz);
    this._box(arm, WeaponMats.glove, 0.07, 0.06, 0.1, 0, 0, 0);
    this._box(arm, WeaponMats.gloveAccent, 0.072, 0.02, 0.06, 0, 0.032, 0.01);
    this._box(arm, WeaponMats.glove, 0.062, 0.058, 0.06, 0, -0.005, 0.07);       // wrist
    this._box(arm, WeaponMats.sleeve, 0.08, 0.08, len, 0, -0.01, 0.1 + len / 2); // sleeve
    this._box(arm, WeaponMats.glowCyan, 0.087, 0.006, 0.05, 0, 0.03, 0.14);     // cuff light
    parent.add(arm);
    return arm;
  },

  rifle(opts = {}) {
    const group = new THREE.Group();
    const S = makeSkinMaterial();
    const B = this._box.bind(this), C = this._cyl.bind(this), M = WeaponMats;
    B(group, S, 0.07, 0.085, 0.4, 0, 0, 0);                      // receiver
    B(group, M.dark, 0.072, 0.03, 0.12, 0, -0.02, 0.06);          // lower detail
    B(group, M.dark, 0.032, 0.014, 0.34, 0, 0.05, -0.04);         // top rail
    for (let i = 0; i < 9; i++) B(group, M.metal, 0.036, 0.006, 0.012, 0, 0.06, 0.1 - i * 0.035);
    B(group, S, 0.078, 0.075, 0.27, 0, -0.004, -0.33);            // handguard
    for (let i = 0; i < 4; i++) B(group, M.dark, 0.08, 0.016, 0.03, 0, 0.005, -0.25 - i * 0.05); // vents
    B(group, M.glowCyan, 0.081, 0.006, 0.2, 0, -0.03, -0.33);     // neon strip
    C(group, M.metal, 0.012, 0.012, 0.22, 0, 0.005, -0.56);       // barrel
    C(group, M.dark, 0.02, 0.02, 0.07, 0, 0.005, -0.68, 'z', 8);  // muzzle brake
    B(group, M.polymer, 0.046, 0.17, 0.085, 0, -0.12, -0.07, 0.2);// magazine
    B(group, M.dark, 0.048, 0.02, 0.087, 0, -0.205, -0.088, 0.2);
    B(group, M.polymer, 0.042, 0.12, 0.05, 0, -0.095, 0.1, -0.35);// grip
    B(group, M.dark, 0.012, 0.035, 0.04, 0, -0.06, 0.04);          // trigger
    B(group, S, 0.055, 0.085, 0.24, 0, -0.015, 0.31);             // stock
    B(group, M.polymer, 0.06, 0.1, 0.03, 0, -0.02, 0.44);         // buttpad
    B(group, M.dark, 0.04, 0.05, 0.08, 0, 0.085, 0.02);           // optic body
    B(group, M.lens, 0.032, 0.036, 0.004, 0, 0.088, -0.021);
    B(group, M.glowRed, 0.006, 0.006, 0.002, 0, 0.092, -0.017);    // reticle dot
    B(group, M.dark, 0.012, 0.04, 0.014, 0, 0.065, -0.2);         // front post
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.005, -0.72); group.add(muzzle);
    const flash = this._flash(muzzle, 0, 1);
    if (opts.hands !== false) this._arm(group, 0.0, -0.12, 0.12, -0.35, 0.1, 0.0, 0.45);    // right hand on grip
    if (opts.hands !== false) this._arm(group, -0.03, -0.06, -0.32, -0.15, 0.45, -0.3, 0.5); // left hand on handguard
    return { group, skinMat: S, muzzle, flash };
  },

  sniper(opts = {}) {
    const group = new THREE.Group();
    const S = makeSkinMaterial();
    const B = this._box.bind(this), C = this._cyl.bind(this), M = WeaponMats;
    B(group, S, 0.07, 0.085, 0.46, 0, 0, -0.02);                  // receiver
    B(group, S, 0.075, 0.07, 0.3, 0, -0.005, -0.38);              // forend
    B(group, M.glowOrange, 0.077, 0.006, 0.22, 0, -0.028, -0.38);
    C(group, M.metal, 0.014, 0.016, 0.52, 0, 0.01, -0.78);        // long barrel
    C(group, M.dark, 0.024, 0.024, 0.1, 0, 0.01, -1.06, 'z', 6);  // suppressor-style brake
    C(group, M.dark, 0.032, 0.032, 0.34, 0, 0.1, -0.06);          // scope tube
    C(group, M.dark, 0.042, 0.032, 0.08, 0, 0.1, -0.25);          // objective bell
    C(group, M.dark, 0.036, 0.032, 0.06, 0, 0.1, 0.13);           // eyepiece
    const lensF = C(group, M.lens, 0.038, 0.038, 0.004, 0, 0.1, -0.292);
    lensF.material = M.lens;
    C(group, M.dark, 0.014, 0.014, 0.04, 0, 0.14, -0.06, 'y', 8); // turret
    C(group, M.dark, 0.014, 0.014, 0.04, 0.035, 0.1, -0.06, 'x', 8);
    B(group, M.dark, 0.02, 0.04, 0.03, 0, 0.06, -0.15);           // mounts
    B(group, M.dark, 0.02, 0.04, 0.03, 0, 0.06, 0.05);
    C(group, M.metal, 0.008, 0.008, 0.07, 0.05, 0.01, 0.08, 'x', 8); // bolt handle
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), M.metal); knob.position.set(0.085, 0.01, 0.08); group.add(knob);
    B(group, M.polymer, 0.04, 0.07, 0.07, 0, -0.08, -0.06, 0.1);  // short magazine
    B(group, M.polymer, 0.042, 0.12, 0.05, 0, -0.095, 0.14, -0.35); // grip
    B(group, S, 0.055, 0.11, 0.3, 0, -0.03, 0.37);                // stock
    B(group, M.polymer, 0.045, 0.03, 0.16, 0, 0.035, 0.33);       // cheek rest
    B(group, M.polymer, 0.06, 0.125, 0.03, 0, -0.035, 0.53);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -1.12); group.add(muzzle);
    const flash = this._flash(muzzle, 0, 1.4);
    if (opts.hands !== false) this._arm(group, 0.0, -0.12, 0.16, -0.35, 0.1, 0.0, 0.45);
    if (opts.hands !== false) this._arm(group, -0.03, -0.065, -0.4, -0.15, 0.45, -0.3, 0.5);
    return { group, skinMat: S, muzzle, flash };
  },

  pistol(opts = {}) {
    const group = new THREE.Group();
    const S = makeSkinMaterial();
    const B = this._box.bind(this), C = this._cyl.bind(this), M = WeaponMats;
    B(group, S, 0.04, 0.046, 0.21, 0, 0.03, -0.06);               // slide
    for (let i = 0; i < 5; i++) B(group, M.dark, 0.042, 0.03, 0.005, 0, 0.032, 0.02 + i * 0.01); // serrations
    B(group, M.glowCyan, 0.041, 0.004, 0.08, 0, 0.012, -0.1);
    B(group, M.polymer, 0.038, 0.032, 0.18, 0, -0.006, -0.055);   // frame
    B(group, S, 0.038, 0.13, 0.058, 0, -0.08, 0.03, -0.25);       // grip
    B(group, M.polymer, 0.04, 0.02, 0.06, 0, -0.145, 0.047, -0.25);
    C(group, M.metal, 0.008, 0.008, 0.02, 0, 0.03, -0.17);        // barrel tip
    B(group, M.dark, 0.012, 0.012, 0.012, 0, 0.058, -0.15);       // front sight
    B(group, M.dark, 0.03, 0.012, 0.012, 0, 0.058, 0.03);         // rear sight
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12, Math.PI), M.polymer);
    guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, -0.022, -0.035); group.add(guard);
    B(group, M.dark, 0.008, 0.025, 0.01, 0, -0.03, -0.03);         // trigger
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.18); group.add(muzzle);
    const flash = this._flash(muzzle, 0, 0.8);
    if (opts.hands !== false) this._arm(group, 0.0, -0.095, 0.06, -0.25, 0.05, 0.0, 0.45);
    if (opts.hands !== false) this._arm(group, -0.035, -0.1, 0.04, -0.2, 0.5, -0.6, 0.45);
    return { group, skinMat: S, muzzle, flash };
  },

  /** Gloved hand that holds the knife. Kept separate from the knife so the
      blade can spin in the fingers (and be tossed) without dragging the arm. */
  knifeHand() {
    const M = WeaponMats;
    const hand = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.set(0.004, -0.008, 0.06);
    hand.add(inner);
    this._box(inner, M.glove, 0.05, 0.055, 0.085, 0.006, -0.008, 0);
    this._box(inner, M.gloveAccent, 0.052, 0.018, 0.05, 0.006, 0.022, 0.005);
    this._box(inner, M.glove, 0.03, 0.02, 0.03, -0.022, 0.012, -0.03);   // thumb
    this._box(inner, M.glove, 0.046, 0.05, 0.05, 0.008, -0.012, 0.065);  // wrist
    this._box(inner, M.sleeve, 0.07, 0.07, 0.26, 0.012, -0.07, 0.19, 0.55, 0.1, 0); // sleeve, angled down out of view
    this._box(inner, M.glowCyan, 0.072, 0.005, 0.03, 0.012, -0.026, 0.1, 0.55, 0.1, 0);
    return hand;
  },

  /** Detailed knife: blade (extruded profile), fuller, guard, grip scales, screws, pommel. */
  knife(opts = {}) {
    const group = new THREE.Group();
    const S = makeSkinMaterial();        // blade + grip scales take the skin
    const B = this._box.bind(this), C = this._cyl.bind(this), M = WeaponMats;

    // blade profile (clip point) in shape space: x = length, y = height
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.014);
    sh.lineTo(0.105, -0.0145);
    sh.quadraticCurveTo(0.158, -0.012, 0.182, 0.006);   // belly sweeping up to tip
    sh.lineTo(0.13, 0.0135);                            // clip
    sh.lineTo(0.12, 0.016);
    sh.lineTo(0.0, 0.016);
    sh.lineTo(0, -0.014);
    const depth = 0.0035;
    const bladeGeo = new THREE.ExtrudeGeometry(sh, {
      depth, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 10,
    });
    scaleUVs(bladeGeo, 5.5);
    bladeGeo.translate(0, 0, -depth / 2);
    bladeGeo.rotateY(Math.PI / 2);      // shape x -> -z, extrusion -> x
    const blade = new THREE.Mesh(bladeGeo, S);
    blade.position.set(0, 0, -0.012);
    group.add(blade);
    // fuller groove (one each side) + spine jimping
    B(group, M.dark, depth + 0.0036, 0.0035, 0.085, 0, 0.006, -0.07);
    for (let i = 0; i < 6; i++) B(group, M.dark, 0.006, 0.003, 0.003, 0, 0.0175, -0.02 - i * 0.007);
    // edge highlight
    B(group, M.steel, 0.0015, 0.002, 0.1, 0, -0.0148, -0.065);

    // guard
    B(group, M.dark, 0.024, 0.05, 0.012, 0, 0.001, -0.006);
    C(group, M.metal, 0.007, 0.007, 0.026, 0, 0.026, -0.006, 'x', 10);
    C(group, M.metal, 0.007, 0.007, 0.026, 0, -0.024, -0.006, 'x', 10);

    // handle core + skinned grip scales
    B(group, M.polymer, 0.018, 0.028, 0.11, 0, 0, 0.055);
    B(group, S, 0.005, 0.026, 0.1, 0.0115, 0, 0.055);
    B(group, S, 0.005, 0.026, 0.1, -0.0115, 0, 0.055);
    // finger grooves under the handle
    for (let i = 0; i < 4; i++) B(group, M.gloveAccent, 0.02, 0.006, 0.012, 0, -0.016, 0.018 + i * 0.022);
    // screws (both sides)
    [0.022, 0.088].forEach(z => {
      [-1, 1].forEach(s => {
        C(group, M.steel, 0.0035, 0.0035, 0.004, s * 0.0145, 0, z, 'x', 8);
        B(group, M.dark, 0.0045, 0.0045, 0.001, s * 0.0168, 0, z, 0, 0, Math.PI / 4); // slot
      });
    });
    // pommel with a neon ring
    B(group, M.metal, 0.022, 0.032, 0.014, 0, 0, 0.116);
    C(group, M.glowCyan, 0.0105, 0.0105, 0.003, 0, 0, 0.125, 'z', 14);
    C(group, M.dark, 0.006, 0.006, 0.006, 0, 0, 0.126, 'z', 8);

    return { group, skinMat: S, muzzle: null, flash: null };
  },
};

/* --------------------------------------------------------------------------
   KeyframeAnim — keys: [t, dx,dy,dz, drx,dry,drz, flip, twist]
   Deltas are relative to the weapon's base pose. Between keys we
   interpolate with THREE.MathUtils.lerp and a smoothstep ease, so nothing
   ever teleports. `flip` rotates around the blade's local X axis (end over
   end) and `twist` around its long axis (rotate around the handle).
   -------------------------------------------------------------------------- */
class KeyframeAnim {
  constructor(name, keys, opts = {}) {
    this.name = name;
    this.keys = keys;
    this.duration = keys[keys.length - 1][0];
    this.rare = !!opts.rare;
    this.label = opts.label || name;
  }

  /** Writes the interpolated pose into `out` (array of 8 numbers). */
  sample(t, out) {
    const k = this.keys;
    if (t <= 0) { for (let i = 0; i < 8; i++) out[i] = k[0][i + 1]; return out; }
    if (t >= this.duration) { for (let i = 0; i < 8; i++) out[i] = k[k.length - 1][i + 1]; return out; }
    let j = 1;
    while (j < k.length - 1 && k[j][0] < t) j++;
    const a = k[j - 1], b = k[j];
    let u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
    u = u * u * (3 - 2 * u); // smoothstep easing
    for (let i = 0; i < 8; i++) out[i] = THREE.MathUtils.lerp(a[i + 1], b[i + 1], u);
    return out;
  }
}

const PI = Math.PI, TAU = Math.PI * 2;
const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
const K = (t, arr) => [t, ...arr];

/** Knife inspection animations. */
const KNIFE_INSPECTS = [
  // 1 — Blade Flip: center, rotate around handle, flip, blade to camera, handle, spin, return
  new KeyframeAnim('Blade Flip', [
    K(0.0, Z8),
    K(0.45, [-0.12, 0.05, 0.03, -0.35, 1.2, 0.3, 0, 0]),
    K(0.95, [-0.12, 0.05, 0.03, -0.35, 1.2, 0.3, 0, PI]),
    K(1.35, [-0.12, 0.1, 0.03, -0.35, 1.2, 0.3, TAU, PI]),
    K(1.55, [-0.12, 0.05, 0.03, -0.35, 1.2, 0.3, TAU, PI]),
    K(2.05, [-0.08, 0.035, 0.06, -0.15, 2.5, 0.2, TAU, PI]),
    K(2.6, [-0.05, 0.05, 0.06, -0.35, 0.7, 0.3, TAU, PI]),
    K(3.05, [-0.1, 0.04, 0.03, -0.35, 1.2, 0.3, 2 * TAU, PI]),
    K(3.6, [0, 0, 0, 0, 0, 0, 2 * TAU, TAU]),
  ]),
  // 2 — Handle Inspection: grip turned towards the camera, both sides of the handle
  new KeyframeAnim('Handle Inspection', [
    K(0.0, Z8),
    K(0.5, [-0.06, 0.06, 0.05, -0.35, 0.75, 0.3, 0, 0]),
    K(1.15, [-0.06, 0.06, 0.05, -0.35, 0.75, 0.3, 0, PI]),
    K(1.75, [-0.09, 0.07, 0.04, -0.4, 1.25, 0.35, 0, PI]),
    K(2.35, [-0.06, 0.06, 0.05, -0.35, 0.75, 0.3, 0, TAU]),
    K(2.95, [0, 0, 0, 0, 0, 0, 0, TAU]),
  ]),
  // 3 — Spin: three end-over-end rotations around the handle
  new KeyframeAnim('Spin', [
    K(0.0, Z8),
    K(0.3, [-0.1, 0.04, 0.02, -0.3, 1.3, 0.25, 0, 0]),
    K(1.35, [-0.1, 0.06, 0.02, -0.3, 1.3, 0.25, 3 * TAU, 0]),
    K(1.7, [-0.1, 0.04, 0.02, -0.3, 1.3, 0.25, 3 * TAU, 0]),
    K(2.2, [0, 0, 0, 0, 0, 0, 3 * TAU, 0]),
  ]),
  // 4 — Reverse Flip: toss backwards, catch, reverse twist
  new KeyframeAnim('Reverse Flip', [
    K(0.0, Z8),
    K(0.35, [-0.1, 0.06, 0.02, -0.3, 1.25, 0.3, 0, 0]),
    K(0.85, [-0.1, 0.13, 0.02, -0.3, 1.25, 0.3, -TAU, 0]),
    K(1.05, [-0.1, 0.05, 0.02, -0.3, 1.25, 0.3, -TAU, 0]),
    K(1.55, [-0.1, 0.05, 0.02, -0.3, 1.25, 0.3, -TAU, -PI]),
    K(2.05, [-0.1, 0.08, 0.02, -0.3, 1.25, 0.3, -2 * TAU, -PI]),
    K(2.7, [0, 0, 0, 0, 0, 0, -2 * TAU, -TAU]),
  ]),
  // 5 — Blade Examination: slow, close, light rolling across the blade
  new KeyframeAnim('Blade Examination', [
    K(0.0, Z8),
    K(0.6, [-0.11, 0.08, 0.05, -0.2, 1.35, 0.15, 0, 0]),
    K(1.5, [-0.13, 0.085, 0.06, -0.05, 1.5, -0.2, 0, 0]),
    K(2.3, [-0.11, 0.08, 0.05, -0.4, 1.3, 0.45, 0, 0]),
    K(2.85, [-0.1, 0.08, 0.05, -0.3, 1.35, 0.2, 0, -PI / 2]),
    K(3.4, [-0.1, 0.08, 0.05, -0.3, 1.35, 0.2, 0, 0]),
    K(4.0, [0, 0, 0, 0, 0, 0, 0, 0]),
  ]),
];

/** Rare (5%) inspection: Phantom Toss — thrown out of view, neon overdrive. */
const KNIFE_RARE_INSPECT = new KeyframeAnim('Phantom Toss', [
  K(0.0, Z8),
  K(0.3, [-0.05, -0.02, 0.0, -0.3, 1.2, 0.3, 0, 0]),
  K(0.8, [-0.08, 0.55, -0.15, -0.3, 1.2, 0.3, 3 * TAU, PI]),
  K(1.4, [-0.12, 0.07, 0.02, -0.3, 1.2, 0.3, 5 * TAU, TAU]),
  K(1.6, [-0.12, 0.03, 0.02, -0.3, 1.2, 0.3, 5 * TAU, TAU]),
  K(2.4, [-0.12, 0.05, 0.05, -0.3, 1.2, 0.3, 6 * TAU, TAU]),
  K(3.0, [0, 0, 0, 0, 0, 0, 6 * TAU, TAU]),
], { rare: true, label: '★ PHANTOM TOSS' });

const KNIFE_SLASH_R = new KeyframeAnim('slashR', [
  K(0, Z8),
  K(0.07, [0.05, 0.04, 0.02, 0.25, -0.35, -0.7, 0, 0]),
  K(0.2, [-0.22, -0.05, -0.06, -0.35, 0.95, 0.9, 0, 0]),
  K(0.42, Z8),
]);
const KNIFE_SLASH_L = new KeyframeAnim('slashL', [
  K(0, Z8),
  K(0.07, [-0.12, 0.05, 0.0, 0.2, 0.7, 0.6, 0, 0]),
  K(0.2, [0.08, -0.08, -0.06, -0.3, -0.6, -0.9, 0, 0]),
  K(0.42, Z8),
]);
const KNIFE_STAB = new KeyframeAnim('stab', [
  K(0, Z8),
  K(0.22, [0.03, -0.02, 0.09, 0.35, -0.1, 0, 0, 0]),
  K(0.36, [-0.09, 0.03, -0.26, -0.15, 0.2, 0.1, 0, 0]),
  K(0.5, [-0.09, 0.03, -0.26, -0.15, 0.2, 0.1, 0, 0]),
  K(0.95, Z8),
]);
const KNIFE_DRAW = new KeyframeAnim('draw', [
  K(0, [0.06, -0.3, 0.06, 0.9, -0.5, 0.5, -TAU, 0]),
  K(0.55, Z8),
]);
const GUN_DRAW = new KeyframeAnim('gunDraw', [
  K(0, [0.04, -0.28, 0.08, -0.9, 0.3, 0.4, 0, 0]),
  K(1, Z8),
]);
const GUN_INSPECT = new KeyframeAnim('gunInspect', [
  K(0, Z8),
  K(0.55, [-0.1, 0.05, 0.06, 0.15, 0.7, 0.55, 0, 0]),
  K(1.5, [-0.1, 0.07, 0.06, -0.15, 0.9, -0.35, 0, 0]),
  K(2.1, [-0.06, 0.02, 0.03, 0.4, 0.2, 0.2, 0, 0]),
  K(2.6, Z8),
]);

/* --------------------------------------------------------------------------
   Weapon — runtime state for one weapon in the player's hands.
   -------------------------------------------------------------------------- */
class Weapon {
  constructor(id) {
    this.def = WEAPON_DEFS[id];
    this.id = id;
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.nextFire = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.shotsInBurst = 0;
    this.skin = null;
  }
  refill() {
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.shotsInBurst = 0;
  }
  get canReload() { return this.ammo < this.def.mag && this.reserve > 0 && !this.reloading; }
}

class Knife extends Weapon {
  constructor() {
    super('knife');
    this.combo = 0;
  }
  get canReload() { return false; }
}

/* --------------------------------------------------------------------------
   ViewModel — first-person weapon rendering in its own scene so the weapon
   never clips into walls. Handles sway, bob, recoil, draw, reload, sprint,
   ADS and keyframe animations.
   -------------------------------------------------------------------------- */
class ViewModel {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.environment = createEnvironmentTexture(renderer);
    this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x20160f, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1, 2, 1);
    this.scene.add(key);
    this.rim = new THREE.PointLight(0x3df5ff, 0.6, 3);
    this.rim.position.set(-0.6, 0.3, -0.3);
    this.scene.add(this.rim);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2);
    this.flashLight.position.set(0.1, 0, -0.8);
    this.scene.add(this.flashLight);
    this.rareLight = new THREE.PointLight(0xff2bd6, 0, 1.5);
    this.rareLight.position.set(0, 0.1, -0.3);
    this.scene.add(this.rareLight);

    this.pivot = new THREE.Group();   // pose (position + euler)
    this.spinner = new THREE.Group(); // flip / twist channels
    this.pivot.add(this.spinner);
    this.scene.add(this.pivot);

    this.models = {};
    const scale = { rifle: 0.55, sniper: 0.5, pistol: 0.8, knife: 0.72 };
    for (const id of ['rifle', 'sniper', 'pistol', 'knife']) {
      const m = WeaponModels[id]();
      m.group.visible = false;
      m.group.scale.setScalar(scale[id]);
      this.spinner.add(m.group);
      this.models[id] = m;
    }

    this.knifeHand = WeaponModels.knifeHand();
    this.knifeHand.scale.setScalar(scale.knife);
    this.knifeHand.visible = false;
    this.scene.add(this.knifeHand);

    // base poses per weapon (where the weapon rests on screen)
    this.basePose = {
      rifle:  { p: [0.13, -0.135, -0.3], r: [0.0, 0.04, 0.0], ads: [0.0, -0.05, -0.24] },
      sniper: { p: [0.13, -0.14, -0.3], r: [0.0, 0.04, 0.0], ads: [0.0, -0.06, -0.2] },
      pistol: { p: [0.12, -0.12, -0.3], r: [0.0, 0.05, 0.0], ads: [0.0, -0.05, -0.27] },
      knife:  { p: [0.13, -0.125, -0.28], r: [0.42, 0.3, -0.35], ads: [0.13, -0.125, -0.28] },
    };

    this.current = null;
    this.anim = null;        // active KeyframeAnim
    this.animT = 0;
    this.animOut = new Array(8).fill(0);
    this.onAnimEnd = null;

    // procedural state
    this.sway = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.recoilZ = 0;
    this.recoilRot = 0;
    this.recoilVelZ = 0;
    this.sprintBlend = 0;
    this.adsBlend = 0;
    this.reloadBlend = 0;
    this.landDip = 0;
    this.flashTimer = 0;
    this.time = 0;
  }

  show(id) {
    for (const k in this.models) this.models[k].group.visible = (k === id);
    this.knifeHand.visible = id === 'knife';
    this.current = id;
  }

  setSkin(id, skin) {
    applySkinToMaterial(this.models[id].skinMat, skin, 256);
  }

  play(anim, onEnd = null) {
    this.anim = anim;
    this.animT = 0;
    this.onAnimEnd = onEnd;
  }

  stopAnim() {
    this.anim = null;
    this.onAnimEnd = null;
    this.rareLight.intensity = 0;
  }

  kick(def) {
    this.recoilVelZ += def.recoil ? def.recoil.kick * 18 : 0;
    this.recoilRot += def.recoil ? def.recoil.rot : 0;
    const m = this.models[this.current];
    if (m && m.flash) {
      m.flash.visible = true;
      m.flash.rotation.z = Math.random() * Math.PI;
      const s = 0.8 + Math.random() * 0.5;
      m.flash.scale.set(s, s, s);
      this.flashTimer = 0.045;
      this.flashLight.intensity = 3;
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param state {moveSpeed, grounded, sprinting, crouching, mouseDX, mouseDY, ads, reloading, reloadProgress}
   */
  update(dt, state) {
    if (!this.current) return;
    this.time += dt;
    const base = this.basePose[this.current];
    const L = THREE.MathUtils.lerp;
    const damp = (k) => 1 - Math.exp(-k * dt);

    // --- sway from mouse movement (lags behind the camera)
    this.swayTarget.set(
      THREE.MathUtils.clamp(-state.mouseDX * 0.0006, -0.05, 0.05),
      THREE.MathUtils.clamp(state.mouseDY * 0.0006, -0.04, 0.04));
    this.sway.lerp(this.swayTarget, damp(10));

    // --- bob from walking
    const moving = state.grounded && state.moveSpeed > 0.5;
    this.bobAmount = L(this.bobAmount, moving ? Math.min(1, state.moveSpeed / 5) : 0, damp(8));
    this.bobPhase += dt * (state.sprinting ? 13 : 9) * (moving ? 1 : 0.3);

    // --- recoil spring
    this.recoilVelZ -= this.recoilZ * 220 * dt;
    this.recoilVelZ *= Math.exp(-18 * dt);
    this.recoilZ += this.recoilVelZ * dt;
    this.recoilRot = L(this.recoilRot, 0, damp(12));

    this.sprintBlend = L(this.sprintBlend, state.sprinting && !this.anim ? 1 : 0, damp(9));
    this.adsBlend = L(this.adsBlend, state.ads ? 1 : 0, damp(16));
    this.reloadBlend = L(this.reloadBlend, state.reloading ? 1 : 0, damp(9));
    this.landDip = L(this.landDip, 0, damp(7));

    // --- muzzle flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        const m = this.models[this.current];
        if (m.flash) m.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }

    // --- keyframe animation
    const a = this.animOut;
    for (let i = 0; i < 8; i++) a[i] = 0;
    if (this.anim) {
      this.animT += dt;
      this.anim.sample(this.animT, a);
      if (this.anim.rare) {
        // neon overdrive during the rare inspect
        const pulse = 0.5 + 0.5 * Math.sin(this.animT * 14);
        this.rareLight.intensity = 2.5 * pulse;
        const mat = this.models.knife.skinMat;
        mat.emissiveIntensity = (mat.userData.baseEmissive || 0) + 1.2 * pulse;
      }
      if (this.animT >= this.anim.duration) {
        const wasRare = this.anim.rare;
        const cb = this.onAnimEnd;
        this.anim = null;
        this.onAnimEnd = null;
        if (wasRare) {
          this.rareLight.intensity = 0;
          const mat = this.models.knife.skinMat;
          mat.emissiveIntensity = mat.userData.baseEmissive || 0;
        }
        for (let i = 0; i < 8; i++) a[i] = 0;
        if (cb) cb();
      }
    }

    // --- idle breathing
    const breathe = Math.sin(this.time * 1.6) * 0.003;
    const breatheR = Math.sin(this.time * 1.1) * 0.01;

    // --- compose final pose
    const ads = this.adsBlend;
    const bob = this.bobAmount * (1 - ads * 0.85);
    const bx = Math.sin(this.bobPhase) * 0.011 * bob;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bob;
    const sp = this.sprintBlend, rl = this.reloadBlend;

    const px = L(base.p[0], base.ads[0], ads) + bx + this.sway.x * (1 - ads * 0.7) - sp * 0.04 + a[0];
    const py = L(base.p[1], base.ads[1], ads) + by + this.sway.y * (1 - ads * 0.7) + breathe * (1 - ads) - sp * 0.03 - rl * 0.07 - this.landDip + a[1];
    const pz = L(base.p[2], base.ads[2], ads) + this.recoilZ + sp * 0.02 + a[2];
    this.pivot.position.set(px, py, pz);
    this.pivot.rotation.set(
      base.r[0] * (1 - ads) + this.recoilRot + breatheR * 0.3 + sp * -0.25 + rl * -0.35 + this.sway.y * 1.5 + a[3],
      base.r[1] * (1 - ads) + sp * 0.7 + this.sway.x * 2 + rl * 0.3 + a[4],
      base.r[2] * (1 - ads) + sp * 0.45 + rl * 0.5 + bx * 2 + a[5]
    );
    this.spinner.rotation.set(a[6], 0, a[7]);

    // the knife hand follows the pose but not the spin; during the rare
    // toss it stays near the rest pose while the knife flies
    if (this.current === 'knife') {
      let w = 0;
      if (this.anim && this.anim.rare) {
        const t = this.animT;
        w = THREE.MathUtils.clamp(Math.min((t - 0.35) / 0.15, (1.5 - t) / 0.15), 0, 1);
      }
      const h = this.knifeHand;
      h.position.set(L(px, base.p[0] + bx, w), L(py, base.p[1] - 0.05 + by, w), L(pz, base.p[2] + 0.02, w));
      h.rotation.set(L(this.pivot.rotation.x, base.r[0], w), L(this.pivot.rotation.y, base.r[1], w), L(this.pivot.rotation.z, base.r[2], w));
    }
  }
}

/* --------------------------------------------------------------------------
   Arsenal — the player's loadout and all weapon actions.
   Gameplay values come exclusively from WEAPON_DEFS.
   -------------------------------------------------------------------------- */
class Arsenal {
  constructor(game, viewModel) {
    this.game = game;
    this.vm = viewModel;
    this.weapons = { rifle: new Weapon('rifle'), sniper: new Weapon('sniper'), pistol: new Weapon('pistol'), knife: new Knife() };
    this.primaryId = 'rifle';
    this.currentId = null;
    this.drawEnd = 0;
    this.actionEnd = 0;      // knife attack lock
    this.inspecting = false;
    this.ads = false;
    this.lastInspectIndex = -1;
  }

  get current() { return this.weapons[this.currentId]; }
  get def() { return this.current ? this.current.def : null; }
  get scoped() { return this.ads && this.currentId === 'sniper'; }

  slotWeapon(slot) {
    if (slot === 1) return this.primaryId;
    if (slot === 2) return 'pistol';
    return 'knife';
  }

  setPrimary(id) {
    this.primaryId = id === 'sniper' ? 'sniper' : 'rifle';
  }

  applySkins(skins) {
    for (const id of ['rifle', 'sniper', 'pistol', 'knife']) {
      if (skins[id]) {
        this.weapons[id].skin = skins[id];
        this.vm.setSkin(id, skins[id]);
      }
    }
  }

  resetAll() {
    for (const k in this.weapons) this.weapons[k].refill();
    this.ads = false;
    this.inspecting = false;
    this.currentId = null;
    this.equip(this.primaryId, true);
  }

  equip(id, force = false) {
    if (!force && id === this.currentId) return;
    const now = this.game.time;
    if (this.current) this.current.reloading = false;
    this.currentId = id;
    this.ads = false;
    this.inspecting = false;
    this.vm.stopAnim();
    this.vm.show(id);
    const def = this.def;
    this.drawEnd = now + def.drawTime;
    if (id === 'knife') this.vm.play(KNIFE_DRAW);
    else {
      const draw = new KeyframeAnim('draw', GUN_DRAW.keys.map(k => [k[0] * def.drawTime, ...k.slice(1)]));
      this.vm.play(draw);
    }
    this.game.audio.switchWeapon();
    this.game.ui.updateAmmo();
  }

  equipSlot(slot) { this.equip(this.slotWeapon(slot)); }

  reload() {
    const w = this.current;
    if (!w || !w.canReload || this.game.time < this.drawEnd) return;
    w.reloading = true;
    w.reloadEnd = this.game.time + w.def.reloadTime;
    this.ads = false;
    this.inspecting = false;
    this.vm.stopAnim();
    this.game.audio.reload(w.def.reloadTime);
  }

  inspect() {
    const w = this.current;
    if (!w || w.reloading || this.game.time < this.drawEnd || this.game.time < this.actionEnd) return;
    this.ads = false;
    this.inspecting = true;
    if (w.id === 'knife') {
      let anim;
      if (Math.random() < 0.05) {
        anim = KNIFE_RARE_INSPECT;
      } else {
        // random, but never the same one twice in a row
        let i;
        do { i = Math.floor(Math.random() * KNIFE_INSPECTS.length); } while (i === this.lastInspectIndex && KNIFE_INSPECTS.length > 1);
        this.lastInspectIndex = i;
        anim = KNIFE_INSPECTS[i];
      }
      this.game.audio.knifeInspect(anim.rare);
      this.game.ui.toast(anim.rare ? `${anim.label} — RARE INSPECT` : `INSPECT: ${anim.name.toUpperCase()}`, anim.rare ? 'rare' : '');
      this.vm.play(anim, () => { this.inspecting = false; });
    } else {
      this.vm.play(GUN_INSPECT, () => { this.inspecting = false; });
    }
    if (w.skin) this.game.ui.showSkinTag(w.skin);
  }

  cancelInspect() {
    if (this.inspecting) {
      this.inspecting = false;
      this.vm.stopAnim();
    }
  }

  /** Called every frame while playing. */
  update(dt, input, player) {
    const w = this.current;
    if (!w) return;
    const now = this.game.time;

    // reload completion
    if (w.reloading && now >= w.reloadEnd) {
      const need = w.def.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
      w.reloading = false;
      this.game.ui.updateAmmo();
    }

    // secondary action
    const def = w.def;
    if (def.secondary === 'ads' || def.secondary === 'scope') {
      if (input.altPressed && !w.reloading && now >= this.drawEnd) {
        this.ads = !this.ads;
        this.cancelInspect();
        if (def.secondary === 'scope') this.game.audio.ui('hover');
      }
      if (player.sprinting) this.ads = false;
    }

    if (w.id === 'knife') {
      this.updateKnife(input, now);
    } else {
      const wantFire = def.auto ? input.fireDown : input.firePressed;
      if (!input.fireDown) w.shotsInBurst = Math.max(0, w.shotsInBurst - dt * 14);
      if (wantFire && now >= this.drawEnd && !w.reloading && now >= w.nextFire && !player.sprintingHard) {
        if (w.ammo > 0) this.fireGun(w, player);
        else if (input.firePressed) { this.game.audio.dryFire(); this.reload(); }
      }
      if (w.ammo === 0 && w.reserve > 0 && !w.reloading && now >= w.nextFire) this.reload();
    }
  }

  fireGun(w, player) {
    const def = w.def;
    const now = this.game.time;
    this.cancelInspect();
    w.ammo--;
    w.nextFire = now + def.interval;
    w.shotsInBurst++;

    this.game.fireHitscan(def, this.computeSpread(w, player));
    player.addRecoil(def.recoil, w.shotsInBurst);
    this.vm.kick(def);
    this.game.audio.shoot(def.sound);
    this.game.shake(def.recoil.shake);
    if (def.secondary === 'scope') {
      // unscope briefly after each bolt shot, like re-chambering
      this.ads = false;
    }
    this.game.ui.updateAmmo();
  }

  /** Spread depends on weapon type and movement only — never on skin or wear. */
  computeSpread(w, player) {
    const def = w.def;
    const sp = def.spread;
    if (!sp) return 0;
    let spread = sp.base + Math.min(w.shotsInBurst, 12) * sp.perShot;
    const speed = player.horizontalSpeed;
    if (!player.grounded) spread += sp.air;
    else if (speed > 1) spread += sp.move * Math.min(1, speed / 6);
    if (player.crouching) spread *= sp.crouch;
    if (def.secondary === 'scope') spread = this.ads ? sp.scoped + (speed > 1 ? sp.move * 0.6 : 0) : spread;
    else if (this.ads) spread *= 0.6;
    return spread;
  }

  updateKnife(input, now) {
    if (now < this.drawEnd || now < this.actionEnd) return;
    const k = this.weapons.knife;
    const def = k.def;
    if (input.altDown) {
      this.cancelInspect();
      this.actionEnd = now + def.heavyInterval;
      this.vm.play(KNIFE_STAB);
      this.game.audio.knifeSwing(true);
      setTimeout(() => this.game.meleeHit(def.range, def.heavyDamage, true), 300);
    } else if (input.fireDown) {
      this.cancelInspect();
      this.actionEnd = now + def.interval;
      k.combo = (k.combo + 1) % 2;
      this.vm.play(k.combo ? KNIFE_SLASH_R : KNIFE_SLASH_L);
      this.game.audio.knifeSwing(false);
      setTimeout(() => this.game.meleeHit(def.range, def.damage, false), 140);
    }
  }
}
