/* ==========================================================================
   VECTRA ARENA — arena.js
   - TextureLib     procedural canvas textures for the environment
   - Arena          the OUTPOST map: geometry, AABB colliders, ray tests,
                    lights, navigation grid, spawns, city skyline, drones,
                    searchlights and ambient particles
   Collision is done with axis-aligned boxes (fast, predictable).
   ========================================================================== */

const TextureLib = {
  _canvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  },

  noise(ctx, w, h, count, alpha, light = true) {
    for (let i = 0; i < count; i++) {
      const v = light ? 255 : 0;
      ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  },

  floor() {
    return this._canvas(512, 512, (x, w, h) => {
      x.fillStyle = '#23272e'; x.fillRect(0, 0, w, h);
      this.noise(x, w, h, 5000, 0.06);
      this.noise(x, w, h, 3000, 0.12, false);
      x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 3;
      for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 256); x.lineTo(w, i * 256); x.stroke(); }
      x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 1;
      for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(i * 256 + 2, 0); x.lineTo(i * 256 + 2, h); x.stroke(); }
      // stains
      for (let i = 0; i < 8; i++) {
        const cx = Math.random() * w, cy = Math.random() * h, r = 20 + Math.random() * 60;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    });
  },

  wall() {
    return this._canvas(256, 256, (x, w, h) => {
      x.fillStyle = '#2b3038'; x.fillRect(0, 0, w, h);
      this.noise(x, w, h, 1500, 0.07);
      x.strokeStyle = '#15181d'; x.lineWidth = 4;
      x.strokeRect(2, 2, w - 4, h - 4);
      x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
      x.fillStyle = '#596370';
      [[10, 10], [w - 14, 10], [10, h - 14], [w - 14, h - 14], [10, h / 2 - 10], [w - 14, h / 2 - 10]].forEach(([a, b]) => x.fillRect(a, b, 4, 4));
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, h - 40, w, 40);
    });
  },

  concrete() {
    return this._canvas(256, 256, (x, w, h) => {
      x.fillStyle = '#4a4d52'; x.fillRect(0, 0, w, h);
      this.noise(x, w, h, 4000, 0.1);
      this.noise(x, w, h, 3000, 0.15, false);
      // hazard stripe on top
      for (let i = -2; i < 12; i++) {
        x.fillStyle = i % 2 ? '#e0a020' : '#151515';
        x.beginPath(); x.moveTo(i * 28, 0); x.lineTo(i * 28 + 28, 0); x.lineTo(i * 28 + 8, 34); x.lineTo(i * 28 - 20, 34); x.fill();
      }
    });
  },

  container(color) {
    return this._canvas(256, 256, (x, w, h) => {
      x.fillStyle = color; x.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 16) {
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i, 0, 5, h);
        x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(i + 6, 0, 2, h);
      }
      this.noise(x, w, h, 1500, 0.12, false);
      x.fillStyle = 'rgba(80,40,20,0.3)';
      for (let i = 0; i < 20; i++) x.fillRect(Math.random() * w, h - Math.random() * 60, 3 + Math.random() * 8, 10 + Math.random() * 40);
      x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 6; x.strokeRect(0, 0, w, h);
    });
  },

  crate() {
    return this._canvas(128, 128, (x, w, h) => {
      x.fillStyle = '#3a3f46'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#1a1d21'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
      x.beginPath(); x.moveTo(8, 8); x.lineTo(w - 8, h - 8); x.stroke();
      x.fillStyle = '#ff8a2f'; x.fillRect(16, h - 26, 40, 8);
      x.fillStyle = '#9aa5b1'; x.font = 'bold 14px monospace'; x.fillText('VX-07', 62, h - 18);
      this.noise(x, w, h, 600, 0.12);
    });
  },

  metalGrate() {
    return this._canvas(128, 128, (x, w, h) => {
      x.fillStyle = '#1a1d22'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#3e454e';
      for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) x.fillRect(i + 2, j + 2, 12, 12);
      x.fillStyle = '#14161a';
      for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) x.fillRect(i + 5, j + 5, 6, 6);
    });
  },

  sky() {
    return this._canvas(16, 512, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.0, '#020309');
      g.addColorStop(0.35, '#070a18');
      g.addColorStop(0.48, '#1a1030');
      g.addColorStop(0.52, '#3a1a2e');
      g.addColorStop(0.56, '#0b0d16');
      g.addColorStop(1.0, '#040508');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
  },

  windows() {
    return this._canvas(128, 256, (x, w, h) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      const cols = ['#ffb35a', '#7fdcff', '#c88bff', '#ffe7b0'];
      for (let j = 4; j < h; j += 8) {
        for (let i = 4; i < w; i += 8) {
          if (Math.random() < 0.28) {
            x.fillStyle = cols[Math.floor(Math.random() * cols.length)];
            x.globalAlpha = 0.4 + Math.random() * 0.6;
            x.fillRect(i, j, 4, 4);
          }
        }
      }
      x.globalAlpha = 1;
    });
  },

  sign(text, color, w = 512, h = 128, font = 72) {
    return this._canvas(w, h, (x) => {
      x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h);
      x.font = `900 ${font}px "Segoe UI", Arial, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = color; x.shadowBlur = 24;
      x.fillStyle = color;
      x.fillText(text, w / 2, h / 2);
      x.shadowBlur = 0; x.fillStyle = '#ffffff'; x.globalAlpha = 0.7;
      x.fillText(text, w / 2, h / 2);
    });
  },

  glowDot() {
    return this._canvas(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
  },
};

/** Box geometry whose UVs are scaled to world size so textures tile evenly. */
function worldBoxGeo(w, h, d, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0] / tile, uv.getY(idx) * dims[f][1] / tile);
    }
  }
  return g;
}

class Arena {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.colliders = [];        // { box: THREE.Box3, kind }
    this.solidMeshes = [];
    this.flickerLights = [];
    this.drones = [];
    this.searchlights = [];
    this.nodes = [];            // navigation nodes { p: Vector3, links: [idx] }
    this.bounds = { minX: -40, maxX: 40, minZ: -26, maxZ: 24 };
    this.spawns = {
      blue: [[-36, -4.5], [-36, -1.5], [-36, 1.5], [-36, 4.5], [-34, 0]],
      red:  [[36, 4.5], [36, 1.5], [36, -1.5], [36, -4.5], [34, 0]],
    };
    this._ray = new THREE.Ray();
    this._tmp = new THREE.Vector3();
    this.time = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Build steps (split so the loading bar can advance between them)    */
  /* ------------------------------------------------------------------ */

  buildMaterials() {
    const T = TextureLib;
    this.tex = {
      floor: T.floor(), wall: T.wall(), concrete: T.concrete(), crate: T.crate(), grate: T.metalGrate(),
      contA: T.container('#7a2a1c'), contB: T.container('#1d4a6b'), contC: T.container('#5a5f2a'), contD: T.container('#2f3338'),
      windows: T.windows(), glow: T.glowDot(),
    };
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      floor: std({ map: this.tex.floor, roughness: 0.85, metalness: 0.2 }),
      wall: std({ map: this.tex.wall, roughness: 0.7, metalness: 0.4 }),
      concrete: std({ map: this.tex.concrete, roughness: 0.95, metalness: 0.0 }),
      crate: std({ map: this.tex.crate, roughness: 0.6, metalness: 0.5 }),
      grate: std({ map: this.tex.grate, roughness: 0.5, metalness: 0.8 }),
      contA: std({ map: this.tex.contA, roughness: 0.6, metalness: 0.6 }),
      contB: std({ map: this.tex.contB, roughness: 0.6, metalness: 0.6 }),
      contC: std({ map: this.tex.contC, roughness: 0.6, metalness: 0.6 }),
      contD: std({ map: this.tex.contD, roughness: 0.6, metalness: 0.6 }),
      metal: std({ color: 0x4a525c, roughness: 0.4, metalness: 0.85 }),
      darkMetal: std({ color: 0x1c2026, roughness: 0.5, metalness: 0.8 }),
      tank: std({ color: 0x5b636d, roughness: 0.45, metalness: 0.75 }),
      neonBlue: new THREE.MeshBasicMaterial({ color: 0x2fa8ff }),
      neonCyan: new THREE.MeshBasicMaterial({ color: 0x3df5ff }),
      neonPurple: new THREE.MeshBasicMaterial({ color: 0xa95cff }),
      neonOrange: new THREE.MeshBasicMaterial({ color: 0xff7a1f }),
      neonRed: new THREE.MeshBasicMaterial({ color: 0xff2e4a }),
      glass: new THREE.MeshStandardMaterial({ color: 0x3df5ff, transparent: true, opacity: 0.08, roughness: 0.1, metalness: 0.9, depthWrite: false }),
    };
  }

  /** Adds a solid box: visual mesh + collider. y is the BOTTOM of the box. */
  solid(x, y, z, w, h, d, mat, opts = {}) {
    const mesh = new THREE.Mesh(worldBoxGeo(w, h, d, opts.tile || 4), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (opts.collide !== false) {
      const box = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2));
      this.colliders.push({ box, kind: opts.kind || 'solid', minimap: opts.minimap !== false });
    }
    this.solidMeshes.push(mesh);
    return mesh;
  }

  /** Decorative mesh, no collision. */
  deco(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    this.scene.add(m);
    return m;
  }

  /** Wall along X (from x1 to x2 at z) with optional openings [{x, w, y0, y1}]. */
  wallX(x1, x2, z, h, t, mat, openings = []) {
    let cur = x1;
    const sorted = openings.slice().sort((a, b) => a.x - b.x);
    for (const o of sorted) {
      const a = o.x - o.w / 2, b = o.x + o.w / 2;
      if (a > cur) this.solid((cur + a) / 2, 0, z, a - cur, h, t, mat);
      const y0 = o.y0 || 0, y1 = o.y1 || 2.9;
      if (y0 > 0) this.solid(o.x, 0, z, o.w, y0, t, mat);                 // below window
      if (y1 < h) this.solid(o.x, y1, z, o.w, h - y1, t, mat);            // above opening
      if (y0 > 0) this.deco(new THREE.BoxGeometry(o.w, 0.06, t + 0.1), this.mat.neonCyan, o.x, y0, z); // sill light
      cur = b;
    }
    if (cur < x2) this.solid((cur + x2) / 2, 0, z, x2 - cur, h, t, mat);
  }

  /** Wall along Z. */
  wallZ(z1, z2, x, h, t, mat, openings = []) {
    let cur = z1;
    const sorted = openings.slice().sort((a, b) => a.z - b.z);
    for (const o of sorted) {
      const a = o.z - o.w / 2, b = o.z + o.w / 2;
      if (a > cur) this.solid(x, 0, (cur + a) / 2, t, h, a - cur, mat);
      const y0 = o.y0 || 0, y1 = o.y1 || 2.9;
      if (y0 > 0) this.solid(x, 0, o.z, t, y0, o.w, mat);
      if (y1 < h) this.solid(x, y1, o.z, t, h - y1, o.w, mat);
      if (y0 > 0) this.deco(new THREE.BoxGeometry(t + 0.1, 0.06, o.w), this.mat.neonCyan, x, y0, o.z);
      cur = b;
    }
    if (cur < z2) this.solid(x, 0, (cur + z2) / 2, t, h, z2 - cur, mat);
  }

  /** Stairs climbing along +dir axis. Each step is 0.4 high (player can step 0.45). */
  stairs(x, z, axis, dirSign, steps, width, mat) {
    for (let i = 0; i < steps; i++) {
      const h = 0.4 * (i + 1);
      const off = (steps - 1 - i) * 0.6 * -dirSign;
      if (axis === 'x') this.solid(x + off, 0, z, 0.6, h, width, mat, { tile: 2 });
      else this.solid(x, 0, z + off, width, h, 0.6, mat, { tile: 2 });
    }
  }

  container(x, z, alongX, mat, y = 0) {
    const w = alongX ? 6 : 2.5, d = alongX ? 2.5 : 6;
    const m = this.solid(x, y, z, w, 2.6, d, mat, { tile: 2.6 });
    // door bars on one end
    const bar = new THREE.BoxGeometry(alongX ? 0.06 : 0.12, 2.4, alongX ? 0.12 : 0.06);
    for (let i = -1; i <= 1; i += 2) {
      if (alongX) this.deco(bar, this.mat.darkMetal, x + 3.02, y + 1.3, z + i * 0.5);
      else this.deco(bar, this.mat.darkMetal, x + i * 0.5, y + 1.3, z + 3.02);
    }
    return m;
  }

  crate(x, z, s = 1.2, y = 0, rot = 0) {
    const m = this.solid(x, y, z, s, s, s, this.mat.crate, { tile: s });
    m.rotation.y = rot; // tiny visual rotation only; collider stays axis-aligned
    return m;
  }

  barrier(x, z, alongX, len = 4) {
    return this.solid(x, 0, z, alongX ? len : 0.7, 1.1, alongX ? 0.7 : len, this.mat.concrete, { tile: 1.1 });
  }

  neonStrip(x, y, z, w, h, d, mat) {
    return this.deco(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }

  sign(text, color, x, y, z, ry, w = 6, h = 1.5) {
    const tex = TextureLib.sign(text, color);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    return m;
  }

  /* ---------------------------- the map ---------------------------- */

  buildGeometry() {
    const M = this.mat;

    // ground (large so the city skyline sits on something)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x040507, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const floorGeo = new THREE.PlaneGeometry(82, 52);
    const uv = floorGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 82 / 8, uv.getY(i) * 52 / 8);
    const floor = new THREE.Mesh(floorGeo, M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -1);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ---- perimeter walls
    const B = this.bounds;
    this.solid(0, 0, B.maxZ + 0.5, 82, 7, 1, M.wall);
    this.solid(0, 0, B.minZ - 0.5, 82, 7, 1, M.wall);
    this.solid(B.minX - 0.5, 0, -1, 1, 7, 52, M.wall);
    this.solid(B.maxX + 0.5, 0, -1, 1, 7, 52, M.wall);
    // neon trims on top of the perimeter
    this.neonStrip(0, 7.02, B.maxZ + 0.5, 82, 0.08, 0.3, M.neonPurple);
    this.neonStrip(0, 7.02, B.minZ - 0.5, 82, 0.08, 0.3, M.neonPurple);
    this.neonStrip(B.minX - 0.5, 7.02, -1, 0.3, 0.08, 52, M.neonBlue);
    this.neonStrip(B.maxX + 0.5, 7.02, -1, 0.3, 0.08, 52, M.neonRed);

    // ---- spawn zones (floor markings + cover)
    this.neonStrip(-36, 0.02, 0, 7, 0.02, 12.5, new THREE.MeshBasicMaterial({ color: 0x1b5cff, transparent: true, opacity: 0.12, depthWrite: false }));
    this.neonStrip(36, 0.02, 0, 7, 0.02, 12.5, new THREE.MeshBasicMaterial({ color: 0xff1b3a, transparent: true, opacity: 0.12, depthWrite: false }));
    this.neonStrip(-32.4, 0.03, 0, 0.12, 0.03, 12.5, M.neonBlue);
    this.neonStrip(32.4, 0.03, 0, 0.12, 0.03, 12.5, M.neonRed);
    [-1, 1].forEach(s => {
      this.barrier(s * 31, -6, false, 3);
      this.barrier(s * 31, 6, false, 3);
      this.crate(s * 29.5, 0, 1.4);
      this.crate(s * 29.5, 0, 1.0, 1.4, 0.3);
    });
    this.sign('BLUE BASE', '#2f8cff', B.minX + 0.02, 4.6, 0, Math.PI / 2, 7, 1.75);
    this.sign('RED BASE', '#ff2e4a', B.maxX - 0.02, 4.6, 0, -Math.PI / 2, 7, 1.75);

    // ---- central courtyard: elevated platform + stairs
    this.solid(0, 0, 0, 6, 2.4, 6, M.grate, { tile: 2 });
    this.neonStrip(0, 2.42, 3.02, 6, 0.06, 0.06, M.neonCyan);
    this.neonStrip(0, 2.42, -3.02, 6, 0.06, 0.06, M.neonCyan);
    this.solid(0, 2.4, 2.85, 6, 0.9, 0.3, M.metal);   // parapets
    this.solid(0, 2.4, -2.85, 6, 0.9, 0.3, M.metal);
    this.stairs(-3.3, 0, 'x', 1, 6, 2.2, M.grate);    // west stairs (climb towards +x)
    this.stairs(3.3, 0, 'x', -1, 6, 2.2, M.grate);    // east stairs (climb towards -x)
    // light pylon on the platform
    this.deco(new THREE.CylinderGeometry(0.12, 0.12, 5, 8), M.darkMetal, 0, 4.9, 2.2);
    this.deco(new THREE.BoxGeometry(0.5, 0.15, 0.5), M.neonPurple, 0, 7.4, 2.2);

    // containers & cover in the courtyard
    this.container(-9, -6, true, M.contA);
    this.container(9, 6, true, M.contB);
    this.container(-8.5, 6.5, false, M.contC);
    this.container(8.5, -6.5, false, M.contD);
    this.container(-9, -6, true, M.contB, 2.6);       // stacked
    this.crate(-4.8, 7.2, 1.2);
    this.crate(-4.8, 7.2, 1.0, 1.2, 0.4);
    this.crate(4.8, -7.2, 1.2);
    this.crate(6.0, -7.4, 1.2);
    this.barrier(0, -8.5, true, 4);
    this.barrier(0, 8.5, true, 4);
    this.barrier(-13, 0, false, 4);
    this.barrier(13, 0, false, 4);

    // ---- mid lanes between spawns and courtyard
    this.container(-22, -3, false, M.contD);
    this.container(22, 3, false, M.contA);
    this.barrier(-20, 7, false, 4);
    this.barrier(20, -7, false, 4);
    this.crate(-26, 3, 1.2); this.crate(-26, 4.3, 1.2); this.crate(-26, 3.6, 1.0, 1.2);
    this.crate(26, -3, 1.2); this.crate(26, -4.3, 1.2); this.crate(26, -3.6, 1.0, 1.2);
    this.barrier(-17, -10, true, 3);
    this.barrier(17, 10, true, 3);

    // industrial tanks (cylinders with a box collider)
    [[-25, 12.5], [25, -11.5]].forEach(([x, z]) => {
      const tank = this.deco(new THREE.CylinderGeometry(1.6, 1.6, 6, 20), M.tank, x, 3, z);
      tank.castShadow = tank.receiveShadow = true;
      this.deco(new THREE.CylinderGeometry(1.65, 1.65, 0.2, 20), M.neonOrange, x, 4.5, z);
      this.deco(new THREE.CylinderGeometry(1.0, 1.6, 0.8, 20), M.darkMetal, x, 6.4, z);
      this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(x - 1.5, 0, z - 1.5), new THREE.Vector3(x + 1.5, 6.8, z + 1.5)), kind: 'solid', minimap: true });
    });

    // ---- long north corridor (z 18 .. 24) with doorways and windows
    this.wallX(-30, 30, 17.6, 4.5, 0.8, M.wall, [
      { x: -24, w: 3 }, { x: 0, w: 3 }, { x: 24, w: 3 },
      { x: -12, w: 2, y0: 1.2, y1: 2.4 }, { x: 12, w: 2, y0: 1.2, y1: 2.4 },
    ]);
    this.neonStrip(0, 4.52, 17.6, 60, 0.06, 0.82, M.neonCyan);
    for (let x = -25; x <= 25; x += 10) {
      // overhead beams + strip lights
      this.deco(new THREE.BoxGeometry(0.4, 0.4, 6.4), M.darkMetal, x, 4.4, 20.9);
      this.deco(new THREE.BoxGeometry(0.15, 0.05, 4), M.neonOrange, x, 4.18, 20.9);
    }
    // pipes along the outer corridor wall
    const pipe = new THREE.CylinderGeometry(0.18, 0.18, 60, 10);
    this.deco(pipe, M.metal, 0, 3.4, 23.6, 0, 0, Math.PI / 2);
    this.deco(new THREE.CylinderGeometry(0.1, 0.1, 60, 8), M.darkMetal, 0, 3.0, 23.7, 0, 0, Math.PI / 2);
    // corridor cover
    this.crate(-16, 22.8, 1.2); this.crate(-14.8, 22.8, 1.2);
    this.crate(6, 18.9, 1.2);
    this.barrier(16, 21, false, 3);
    this.barrier(-6, 21.5, false, 3);
    this.sign('SECTOR N — CORRIDOR', '#3df5ff', 0, 3.6, 23.95, Math.PI, 7, 1.0);

    // ---- elevated catwalk (z 13..15, height 3.2) with stairs at both ends
    const cy = 3.0;
    this.solid(0, cy, 14, 26, 0.25, 2.2, M.grate, { tile: 2, minimap: false });
    this.solid(0, cy + 0.25, 13.0, 26, 1.0, 0.08, M.metal, { minimap: false });   // south railing
    this.neonStrip(0, cy + 1.27, 13.0, 26, 0.04, 0.1, M.neonPurple);
    for (let x = -12; x <= 12; x += 6) {
      this.solid(x, 0, 14, 0.35, cy, 0.35, M.darkMetal, { tile: 1 }); // support pillars
    }
    this.stairs(-14.5, 14.2, 'x', 1, 8, 1.8, M.grate);   // west stairs climb east onto the landing
    this.stairs(14.5, 14.2, 'x', -1, 8, 1.8, M.grate);   // east stairs climb west
    // landing blocks so the stairs meet the catwalk
    this.solid(-13.6, 0, 14.2, 1.2, cy + 0.25, 1.8, M.grate, { tile: 2 });
    this.solid(13.6, 0, 14.2, 1.2, cy + 0.25, 1.8, M.grate, { tile: 2 });

    // ---- south close-range rooms + flank passage
    // rooms span z -26..-16 (the perimeter wall closes their south side)
    this.buildRoom(-12, -21, 12, 10, 'A');
    this.buildRoom(12, -21, 12, 10, 'B');
    // flank passage between the rooms (x -6..6), north wall with a window
    this.wallX(-6, 6, -16, 4.5, 0.5, M.wall, [{ x: 0, w: 2.4, y0: 1.2, y1: 2.3 }]);
    this.solid(0, 4.5, -21, 12, 0.3, 10, M.darkMetal, { minimap: false }); // passage roof
    this.crate(-2, -24.5, 1.2);
    this.crate(2.5, -20.5, 1.2);
    this.neonStrip(0, 4.3, -21, 10, 0.05, 0.12, M.neonOrange);

    // decorative OUTPOST sign over the courtyard (on the corridor wall)
    this.sign('OUTPOST', '#a95cff', 0, 6.2, 17.15, Math.PI, 10, 2.5);
    this.sign('A', '#ff7a1f', -12, 3.7, -15.7, 0, 1.6, 1.6);
    this.sign('B', '#ff7a1f', 12, 3.7, -15.7, 0, 1.6, 1.6);
  }

  /** A close-quarters room centered at (cx, cz), w x d, with doors and windows. */
  buildRoom(cx, cz, w, d, label) {
    const M = this.mat, h = 4.5, t = 0.5;
    const x1 = cx - w / 2, x2 = cx + w / 2, z1 = cz - d / 2, z2 = cz + d / 2;
    // north wall: door + two windows
    this.wallX(x1, x2, z2, h, t, M.wall, [
      { x: cx, w: 2.2 },
      { x: cx - 4, w: 1.6, y0: 1.2, y1: 2.3 },
      { x: cx + 4, w: 1.6, y0: 1.2, y1: 2.3 },
    ]);
    // side walls: doors toward spawn and toward the flank passage
    this.wallZ(z1, z2, x1, h, t, M.wall, [{ z: cz - 2, w: 2.2 }]);
    this.wallZ(z1, z2, x2, h, t, M.wall, [{ z: cz - 2, w: 2.2 }]);
    // roof (visual + collider so nothing can stand on top weirdly)
    this.solid(cx, h, cz, w + 0.5, 0.3, d + 0.5, M.darkMetal, { minimap: false });
    // interior cover + light
    this.crate(cx - 3, cz - 2.5, 1.2);
    this.crate(cx + 3.5, cz + 2.2, 1.2);
    this.crate(cx + 3.5, cz + 2.2, 0.9, 1.2, 0.5);
    this.solid(cx, 0, cz - 3.5, 3, 1.0, 0.8, M.metal); // workbench
    this.neonStrip(cx, h - 0.1, cz, w - 1, 0.05, 0.15, M.neonCyan);
    const pl = new THREE.PointLight(0x58d8ff, 1.2, 12, 2);
    pl.position.set(cx, h - 0.6, cz);
    this.scene.add(pl);
    this.flickerLights.push({ light: pl, base: 1.2, seed: Math.random() * 100 });
  }

  buildLights() {
    const q = this.quality;
    this.scene.add(new THREE.HemisphereLight(0x6f86b8, 0x1a1410, 0.45));
    this.scene.add(new THREE.AmbientLight(0x404858, 0.25));

    const moon = new THREE.DirectionalLight(0xa8bcff, 0.85);
    moon.position.set(-30, 55, 25);
    moon.target.position.set(0, 0, 0);
    this.scene.add(moon);
    this.scene.add(moon.target);
    if (q !== 'low') {
      moon.castShadow = true;
      const s = q === 'high' ? 2048 : 1024;
      moon.shadow.mapSize.set(s, s);
      const cam = moon.shadow.camera;
      cam.left = -48; cam.right = 48; cam.top = 36; cam.bottom = -36;
      cam.near = 10; cam.far = 140;
      moon.shadow.bias = -0.0008;
      moon.shadow.normalBias = 0.03;
    }
    this.moon = moon;

    // a few coloured point lights (kept low for performance)
    const pts = [
      [0x2f6bff, -35, 4, 0, 1.6, 22],
      [0xff2e3a, 35, 4, 0, 1.6, 22],
      [0xa95cff, 0, 6.5, 2, 1.8, 26],
      [0xff8a2f, -15, 3.8, 21, 1.4, 16],
      [0xff8a2f, 15, 3.8, 21, 1.4, 16],
    ];
    if (q === 'low') pts.length = 3;
    pts.forEach(([c, x, y, z, i, d]) => {
      const l = new THREE.PointLight(c, i, d, 2);
      l.position.set(x, y, z);
      this.scene.add(l);
      if (c === 0xff8a2f) this.flickerLights.push({ light: l, base: i, seed: Math.random() * 100 });
    });
  }

  /* ------------------- city skyline, sky, drones ------------------- */

  buildCity() {
    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16),
      new THREE.MeshBasicMaterial({ map: TextureLib.sky(), side: THREE.BackSide, fog: false, depthWrite: false }));
    this.scene.add(sky);

    // instanced buildings around the arena
    const count = this.quality === 'low' ? 70 : 140;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0d1016, roughness: 0.9, metalness: 0.3,
      emissive: 0xffffff, emissiveMap: this.tex.windows, emissiveIntensity: 0.9,
    });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0, tries = 0;
    while (n < count && tries < 2000) {
      tries++;
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 130;
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
      const w = 8 + Math.random() * 16, d = 8 + Math.random() * 16;
      const h = 15 + Math.random() * (r > 140 ? 90 : 55);
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() < 0.7 ? 0 : Math.random());
      s.set(w, h, d);
      m4.compose(p, q, s);
      inst.setMatrixAt(n++, m4);
    }
    inst.count = n;
    this.scene.add(inst);

    // rooftop beacons & neon signs on near buildings
    const signs = [['KAIROS', '#ff2bd6'], ['NEXUS-9', '#3df5ff'], ['HALCYON', '#ffb020'], ['VECTRA', '#a95cff'], ['SYNTEX', '#3dff9a']];
    signs.forEach(([t, c], i) => {
      const a = (i / signs.length) * Math.PI * 2 + 0.4;
      const r = 72;
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
      const sgn = this.sign(t, c, x, 22 + i * 4, z, 0, 18, 4.5);
      sgn.lookAt(0, 22, 0);
      // a pillar for the sign to sit on
      const pil = new THREE.Mesh(new THREE.BoxGeometry(6, 40, 6), new THREE.MeshStandardMaterial({ color: 0x0e1117, roughness: 0.9 }));
      pil.position.set(x * 1.05, 20, z * 1.05);
      this.scene.add(pil);
    });

    // searchlights (additive cones) sweeping the sky
    const coneGeo = new THREE.CylinderGeometry(0.4, 6, 90, 16, 1, true);
    coneGeo.translate(0, 45, 0);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xa95cff : 0x6fc8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      const a = i * 2.1 + 1;
      cone.position.set(Math.cos(a) * 90, 0, Math.sin(a) * 75);
      this.scene.add(cone);
      this.searchlights.push({ mesh: cone, phase: Math.random() * 10, speed: 0.15 + Math.random() * 0.15 });
    }

    // drones / aircraft that periodically cross the sky
    for (let i = 0; i < 2; i++) this.drones.push(this.makeDrone(i));
  }

  makeDrone(i) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x14181e, metalness: 0.8, roughness: 0.4 }));
    g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 1.6), body.material);
    wing.position.z = 0.5;
    g.add(wing);
    const lights = [];
    [[-4.5, 0, 0.5, 0xff2e4a], [4.5, 0, 0.5, 0x3dff9a], [0, -0.35, -2.8, 0xffffff]].forEach(([x, y, z, c]) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: c, fog: false }));
      l.position.set(x, y, z);
      g.add(l);
      lights.push(l);
    });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0x3df5ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(5, 5, 5);
    glow.position.z = 3;
    g.add(glow);
    g.visible = false;
    this.scene.add(g);
    return { group: g, lights, t: -i * 14 - 4, dur: 22, from: new THREE.Vector3(), to: new THREE.Vector3() };
  }

  buildParticles() {
    const n = this.quality === 'low' ? 150 : this.quality === 'high' ? 600 : 350;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 52;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09, map: this.tex.glow, color: 0x9fdcff, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  /* ------------------------ navigation graph ----------------------- */

  buildNavigation() {
    const nodes = [];
    const B = this.bounds;
    const step = 3;
    for (let x = B.minX + 2; x <= B.maxX - 2; x += step) {
      for (let z = B.minZ + 2; z <= B.maxZ - 2; z += step) {
        if (!this.blockedAt(x, z, 0.7)) nodes.push({ p: new THREE.Vector3(x, 0, z), links: [] });
      }
    }
    // link neighbours if a body-wide path is clear
    const maxD = step * 1.5;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].p, b = nodes[j].p;
        const d = a.distanceTo(b);
        if (d > maxD) continue;
        if (this.clearPath(a, b, 0.45)) { nodes[i].links.push(j); nodes[j].links.push(i); }
      }
    }
    this.nodes = nodes;
  }

  /** True if a ground body with radius r would overlap any collider at (x,z). */
  blockedAt(x, z, r) {
    for (const c of this.colliders) {
      const b = c.box;
      if (b.min.y > 1.6) continue; // overhead (catwalk, roofs) does not block walking
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return x < this.bounds.minX + r || x > this.bounds.maxX - r || z < this.bounds.minZ + r || z > this.bounds.maxZ - r;
  }

  /** Path clear for a body of half-width `hw` between two ground points. */
  clearPath(a, b, hw) {
    const dir = this._tmp.subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(hw);
    const o = new THREE.Vector3();
    const d = dir.clone();
    for (const h of [0.3, 1.0]) {
      for (const s of [-1, 0, 1]) {
        o.set(a.x + side.x * s, h, a.z + side.z * s);
        if (this.raycast(o, d, len) < len) return false;
      }
    }
    return true;
  }

  nearestNode(pos) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i].p;
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** A* over the navigation grid. Returns an array of Vector3 (may be empty). */
  findPath(from, to) {
    const s = this.nearestNode(from), g = this.nearestNode(to);
    if (s < 0 || g < 0) return [];
    const N = this.nodes;
    const open = [s];
    const came = new Map();
    const gScore = new Map([[s, 0]]);
    const fScore = new Map([[s, N[s].p.distanceTo(N[g].p)]]);
    const closed = new Set();
    let guard = 0;
    while (open.length && guard++ < 3000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore.get(open[i]) < fScore.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === g) {
        const path = [N[cur].p];
        let c = cur;
        while (came.has(c)) { c = came.get(c); path.unshift(N[c].p); }
        return path;
      }
      closed.add(cur);
      for (const nb of N[cur].links) {
        if (closed.has(nb)) continue;
        const t = gScore.get(cur) + N[cur].p.distanceTo(N[nb].p) * (0.9 + Math.random() * 0.2);
        if (t < (gScore.has(nb) ? gScore.get(nb) : Infinity)) {
          came.set(nb, cur);
          gScore.set(nb, t);
          fScore.set(nb, t + N[nb].p.distanceTo(N[g].p));
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    return [];
  }

  /* ------------------------- physics helpers ----------------------- */

  /** Distance to the first collider hit along a ray (or maxDist). */
  raycast(origin, dir, maxDist, out = null) {
    this._ray.origin.copy(origin);
    this._ray.direction.copy(dir);
    let best = maxDist, bestBox = null;
    const p = this._tmp2 || (this._tmp2 = new THREE.Vector3());
    for (const c of this.colliders) {
      if (this._ray.intersectBox(c.box, p)) {
        const d = p.distanceTo(origin);
        if (d < best) { best = d; bestBox = c.box; }
      }
    }
    if (out && bestBox) {
      out.point.copy(dir).multiplyScalar(best).add(origin);
      this.boxNormal(bestBox, out.point, out.normal);
    }
    return best;
  }

  /** Floor counts as a hit plane at y = 0. */
  raycastWithFloor(origin, dir, maxDist, out) {
    let d = this.raycast(origin, dir, maxDist, out);
    if (dir.y < -1e-4) {
      const fd = -origin.y / dir.y;
      if (fd > 0 && fd < d) {
        d = fd;
        if (out) { out.point.copy(dir).multiplyScalar(fd).add(origin); out.normal.set(0, 1, 0); }
      }
    }
    return d;
  }

  boxNormal(box, p, out) {
    const e = 0.02;
    if (Math.abs(p.x - box.min.x) < e) out.set(-1, 0, 0);
    else if (Math.abs(p.x - box.max.x) < e) out.set(1, 0, 0);
    else if (Math.abs(p.y - box.max.y) < e) out.set(0, 1, 0);
    else if (Math.abs(p.y - box.min.y) < e) out.set(0, -1, 0);
    else if (Math.abs(p.z - box.min.z) < e) out.set(0, 0, -1);
    else out.set(0, 0, 1);
    return out;
  }

  /** Line of sight between two points (true = visible). */
  lineOfSight(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.01) return true;
    dir.divideScalar(len);
    return this.raycast(a, dir, len) >= len - 0.05;
  }

  _overlaps(pos, r, h, b) {
    return pos.x - r < b.max.x && pos.x + r > b.min.x &&
           pos.z - r < b.max.z && pos.z + r > b.min.z &&
           pos.y < b.max.y && pos.y + h > b.min.y;
  }

  _anyOverlap(pos, r, h) {
    for (const c of this.colliders) if (this._overlaps(pos, r, h, c.box)) return true;
    return false;
  }

  /**
   * Moves a vertical body (feet at pos, radius r, height h) by `delta`,
   * resolving collisions axis by axis. Supports stepping onto low ledges.
   * Returns { grounded, hitCeiling, hitWall }.
   */
  moveBody(pos, delta, r, h, stepHeight = 0.45) {
    const res = { grounded: false, hitCeiling: false, hitWall: false };
    const eps = 0.001;
    // horizontal axes first
    for (const axis of ['x', 'z']) {
      const d = delta[axis];
      if (d === 0) continue;
      pos[axis] += d;
      for (const c of this.colliders) {
        const b = c.box;
        if (!this._overlaps(pos, r, h, b)) continue;
        const rise = b.max.y - pos.y;
        if (stepHeight > 0 && rise > 0 && rise <= stepHeight) {
          const oldY = pos.y;
          pos.y = b.max.y + eps;
          if (!this._anyOverlap(pos, r, h)) continue; // stepped up successfully
          pos.y = oldY;
        }
        pos[axis] = d > 0 ? b.min[axis] - r - eps : b.max[axis] + r + eps;
        res.hitWall = true;
      }
    }
    // vertical
    const dy = delta.y;
    pos.y += dy;
    for (const c of this.colliders) {
      const b = c.box;
      if (!this._overlaps(pos, r, h, b)) continue;
      if (dy <= 0) { pos.y = b.max.y; res.grounded = true; }
      else { pos.y = b.min.y - h - eps; res.hitCeiling = true; }
    }
    if (pos.y <= 0) { pos.y = 0; res.grounded = true; }
    // hard bounds safety
    const B = this.bounds;
    pos.x = Math.max(B.minX + r, Math.min(B.maxX - r, pos.x));
    pos.z = Math.max(B.minZ + r, Math.min(B.maxZ - r, pos.z));
    return res;
  }

  /** Is there something directly under the feet (for ground snapping)? */
  groundBelow(pos, r, dist) {
    if (pos.y - dist <= 0) return true;
    const test = { x: pos.x, y: pos.y - dist, z: pos.z };
    for (const c of this.colliders) if (this._overlaps(test, r * 0.9, dist, c.box)) return true;
    return false;
  }

  /* ----------------------------- update ---------------------------- */

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const f of this.flickerLights) {
      const n = Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2);
      f.light.intensity = f.base * (n > 0.92 ? 0.15 : 0.9 + 0.1 * Math.sin(t * 2 + f.seed));
    }
    for (const s of this.searchlights) {
      const a = t * s.speed + s.phase;
      s.mesh.rotation.set(Math.sin(a) * 0.45, 0, Math.cos(a * 0.7) * 0.45);
    }
    for (const d of this.drones) {
      d.t += dt;
      if (d.t < 0) continue;
      if (!d.group.visible) {
        // pick a new path across the sky
        const a = Math.random() * Math.PI * 2;
        const h = 35 + Math.random() * 25;
        d.from.set(Math.cos(a) * 220, h, Math.sin(a) * 220);
        d.to.set(-Math.cos(a + 0.4) * 220, h + 10, -Math.sin(a + 0.4) * 220);
        d.group.visible = true;
        d.group.position.copy(d.from);
        d.group.lookAt(d.to);
      }
      const u = d.t / d.dur;
      d.group.position.lerpVectors(d.from, d.to, u);
      const blink = Math.sin(t * 9) > 0.6;
      d.lights[0].visible = d.lights[1].visible = blink;
      if (u >= 1) { d.group.visible = false; d.t = -(10 + Math.random() * 15); }
    }
    if (this.dust) {
      this.dust.rotation.y = Math.sin(t * 0.05) * 0.05;
      this.dust.position.y = Math.sin(t * 0.3) * 0.3;
    }
  }
}
