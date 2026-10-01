/* ==========================================================================
   VECTRA ARENA — skins.js
   Original cosmetic skin system:
     - RARITIES        visual tiers
     - SKIN_CATALOG    all original skins and their palettes / patterns
     - WearSystem      float value -> condition + visual wear parameters
     - WeaponSkin      one concrete copy (id, name, rarity, floatValue,
                       patternSeed, wearLevel)
     - SkinTextureFactory  procedural canvas textures driven by the
                           pattern seed and the float value
   Wear is COSMETIC ONLY. Nothing in this file is read by combat code.
   ========================================================================== */

const RARITIES = {
  COMMON:    { id: 'COMMON',    color: '#a3acb9', tier: 0, sell: 40 },
  UNCOMMON:  { id: 'UNCOMMON',  color: '#4ed98a', tier: 1, sell: 120 },
  RARE:      { id: 'RARE',      color: '#3d8bff', tier: 2, sell: 350 },
  EPIC:      { id: 'EPIC',      color: '#b25cff', tier: 3, sell: 900 },
  LEGENDARY: { id: 'LEGENDARY', color: '#ff9f1c', tier: 4, sell: 2400 },
  MYTHIC:    { id: 'MYTHIC',    color: '#ff2e63', tier: 5, sell: 6000 },
};

/* Each skin: palette + procedural pattern style. `glow` = neon accent strength. */
const SKIN_CATALOG = {
  standard:        { name: 'Standard Issue',  rarity: 'COMMON',    pattern: 'plain',   base: '#2b3036', primary: '#3a4048', accent: '#59636e', glow: 0 },
  urban_static:    { name: 'Urban Static',    rarity: 'COMMON',    pattern: 'static',  base: '#3b3f45', primary: '#5d636b', accent: '#9aa1aa', glow: 0 },
  rust_protocol:   { name: 'Rust Protocol',   rarity: 'UNCOMMON',  pattern: 'camo',    base: '#3a2418', primary: '#8c4a22', accent: '#d9822b', glow: 0.15 },
  arctic_signal:   { name: 'Arctic Signal',   rarity: 'UNCOMMON',  pattern: 'signal',  base: '#c9d6df', primary: '#7fa7c2', accent: '#2fd4ff', glow: 0.35 },
  crimson_circuit: { name: 'Crimson Circuit', rarity: 'RARE',      pattern: 'circuit', base: '#16070a', primary: '#8e0f22', accent: '#ff3b55', glow: 0.8 },
  solar_grid:      { name: 'Solar Grid',      rarity: 'RARE',      pattern: 'grid',    base: '#1d1606', primary: '#a26d00', accent: '#ffd23f', glow: 0.7 },
  obsidian_pulse:  { name: 'Obsidian Pulse',  rarity: 'EPIC',      pattern: 'pulse',   base: '#07070b', primary: '#1d1b2b', accent: '#8a5cff', glow: 1.0 },
  cyberstorm:      { name: 'Cyberstorm',      rarity: 'EPIC',      pattern: 'storm',   base: '#06121f', primary: '#12406b', accent: '#3df5ff', glow: 1.0 },
  neon_rupture:    { name: 'Neon Rupture',    rarity: 'LEGENDARY', pattern: 'rupture', base: '#0b0610', primary: '#2a0f3a', accent: '#ff2bd6', glow: 1.2 },
  void_runner:     { name: 'Void Runner',     rarity: 'MYTHIC',    pattern: 'void',    base: '#020206', primary: '#140a2e', accent: '#7cf9ff', glow: 1.4 },
};

const WEAPON_LABELS = {
  rifle:  'Assault Rifle',
  sniper: 'Precision Rifle',
  pistol: 'Pistol',
  knife:  'Knife',
};

/* --------------------------------------------------------------------------
   Seeded RNG (mulberry32) so a pattern seed always produces the same art.
   -------------------------------------------------------------------------- */
function seededRandom(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* --------------------------------------------------------------------------
   WearSystem — float value (0..1) to condition and visual parameters.
   -------------------------------------------------------------------------- */
class WearSystem {
  static CONDITIONS = [
    { max: 0.07, name: 'Factory New',    short: 'FN' },
    { max: 0.15, name: 'Minimal Wear',   short: 'MW' },
    { max: 0.38, name: 'Field-Tested',   short: 'FT' },
    { max: 0.45, name: 'Well-Worn',      short: 'WW' },
    { max: 1.01, name: 'Battle-Scarred', short: 'BS' },
  ];

  static getCondition(floatValue) {
    return WearSystem.CONDITIONS.find(c => floatValue < c.max) || WearSystem.CONDITIONS[4];
  }

  /** Visual-only parameters. These are NEVER read by weapon stats. */
  static visualParams(floatValue) {
    const f = Math.max(0, Math.min(1, floatValue));
    return {
      scratches: Math.floor(f * f * 260 + f * 40),   // count of scratch strokes
      fade: Math.min(0.55, f * 0.75),                 // paint fade towards gray
      dirt: f * 0.6,                                  // dark grime blotches
      edgeWear: f,                                    // exposed metal at edges
      roughness: 0.22 + f * 0.6,
      metalness: 0.75 - f * 0.35,
      glowLoss: f * 0.7,                              // neon accents dim with wear
    };
  }
}

/* --------------------------------------------------------------------------
   WeaponSkin — one concrete copy of a skin on a given weapon.
   -------------------------------------------------------------------------- */
class WeaponSkin {
  constructor({ id, weapon, skinKey, floatValue, patternSeed }) {
    const def = SKIN_CATALOG[skinKey] || SKIN_CATALOG.standard;
    this.id = id;
    this.weapon = weapon;
    this.skinKey = SKIN_CATALOG[skinKey] ? skinKey : 'standard';
    this.name = def.name;
    this.rarity = def.rarity;
    this.floatValue = Math.max(0, Math.min(1, floatValue));
    this.patternSeed = Math.max(0, Math.min(1000, Math.round(patternSeed)));
    this.wearLevel = WearSystem.getCondition(this.floatValue).name;
  }

  get def() { return SKIN_CATALOG[this.skinKey]; }
  get rarityInfo() { return RARITIES[this.rarity]; }
  get fullName() { return `${WEAPON_LABELS[this.weapon]} | ${this.name}`; }
  get sellValue() {
    // nicer floats are worth a bit more in fictional credits
    return Math.round(this.rarityInfo.sell * (1.4 - this.floatValue * 0.6) * (this.weapon === 'knife' ? 2 : 1));
  }

  toJSON() {
    return { id: this.id, weapon: this.weapon, skinKey: this.skinKey, floatValue: this.floatValue, patternSeed: this.patternSeed };
  }
}

/* --------------------------------------------------------------------------
   SkinTextureFactory — draws the pattern + wear into canvases.
   Produces { map, emissiveMap, roughness, metalness, emissiveIntensity }.
   Results are cached per (skin, seed, float bucket, size).
   -------------------------------------------------------------------------- */
class SkinTextureFactory {
  static cache = new Map();

  static get(skin, size = 256) {
    const key = `${skin.skinKey}|${skin.patternSeed}|${skin.floatValue.toFixed(3)}|${size}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const res = this.build(skin, size);
    this.cache.set(key, res);
    return res;
  }

  static build(skin, S) {
    const def = skin.def;
    const wear = WearSystem.visualParams(skin.floatValue);
    const rng = seededRandom(skin.patternSeed * 7919 + hashString(skin.skinKey));

    const main = document.createElement('canvas');
    main.width = main.height = S;
    const glow = document.createElement('canvas');
    glow.width = glow.height = S;
    const c = main.getContext('2d');
    const g = glow.getContext('2d');

    c.fillStyle = def.base;
    c.fillRect(0, 0, S, S);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);

    // pattern seed -> rotation + offset of the whole pattern layer
    const rot = rng() * Math.PI * 2;
    const ox = (rng() - 0.5) * S * 0.5;
    const oy = (rng() - 0.5) * S * 0.5;
    [c, g].forEach(ctx => {
      ctx.save();
      ctx.translate(S / 2 + ox, S / 2 + oy);
      ctx.rotate(rot);
      ctx.translate(-S, -S); // draw on a 3S x 3S area so rotation never shows gaps
    });
    const area = S * 3;
    SkinTextureFactory.patterns[def.pattern](c, g, area, rng, def);
    c.restore();
    g.restore();

    SkinTextureFactory.applyWear(c, g, S, rng, wear, def);

    const map = new THREE.CanvasTexture(main);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    if (THREE.sRGBEncoding !== undefined) map.encoding = THREE.sRGBEncoding;
    map.anisotropy = 4;
    const emissiveMap = new THREE.CanvasTexture(glow);
    emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
    if (THREE.sRGBEncoding !== undefined) emissiveMap.encoding = THREE.sRGBEncoding;

    return {
      map, emissiveMap,
      canvas: main,
      roughness: wear.roughness,
      metalness: wear.metalness,
      emissiveIntensity: def.glow * (1 - wear.glowLoss),
    };
  }

  /** Draws wear on top of the finished pattern. */
  static applyWear(c, g, S, rng, wear, def) {
    // 1. paint fade: wash towards a dull gray-tan
    if (wear.fade > 0.01) {
      c.fillStyle = `rgba(120,116,108,${wear.fade * 0.55})`;
      c.fillRect(0, 0, S, S);
    }
    // 2. dark grime blotches
    const blotches = Math.floor(wear.dirt * 26);
    for (let i = 0; i < blotches; i++) {
      const x = rng() * S, y = rng() * S, r = 6 + rng() * S * 0.12;
      const grd = c.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(12,10,8,${0.25 + rng() * 0.35})`);
      grd.addColorStop(1, 'rgba(12,10,8,0)');
      c.fillStyle = grd;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 3. scratches: exposed bright metal lines; they also cut the neon glow
    for (let i = 0; i < wear.scratches; i++) {
      const x = rng() * S, y = rng() * S;
      const len = 4 + rng() * S * 0.14;
      const a = rng() * Math.PI;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      c.strokeStyle = `rgba(${190 + rng() * 50 | 0},${195 + rng() * 45 | 0},${200 + rng() * 40 | 0},${0.35 + rng() * 0.5})`;
      c.lineWidth = 0.5 + rng() * 1.4;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    }
    // 4. edge wear: chipped paint along the borders (face edges of the boxes)
    if (wear.edgeWear > 0.1) {
      const chips = Math.floor(wear.edgeWear * 160);
      c.fillStyle = 'rgba(170,175,182,0.75)';
      for (let i = 0; i < chips; i++) {
        const side = Math.floor(rng() * 4);
        const t = rng() * S;
        const d = rng() * rng() * S * 0.08 * wear.edgeWear;
        const w = 1 + rng() * 5, h = 1 + rng() * 3;
        const x = side === 0 ? d : side === 1 ? S - d - w : t;
        const y = side === 2 ? d : side === 3 ? S - d - h : t;
        c.fillRect(x, y, w, h);
      }
    }
    // 5. Factory New gets a subtle polished sheen band
    if (wear.fade < 0.05) {
      const grd = c.createLinearGradient(0, 0, S, S);
      grd.addColorStop(0.35, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.09)');
      grd.addColorStop(0.65, 'rgba(255,255,255,0)');
      c.fillStyle = grd;
      c.fillRect(0, 0, S, S);
    }
    // global glow dimming
    if (wear.glowLoss > 0) {
      g.fillStyle = `rgba(0,0,0,${wear.glowLoss * 0.5})`;
      g.fillRect(0, 0, S, S);
    }
  }
}

/* Pattern painters. Each draws on c (color) and g (glow) over an A x A area. */
SkinTextureFactory.patterns = {
  plain(c, g, A, rng, d) {
    c.fillStyle = d.primary;
    for (let y = 0; y < A; y += 24) c.fillRect(0, y, A, 10);
    c.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 400; i++) c.fillRect(rng() * A, rng() * A, 2, 2);
  },

  static(c, g, A, rng, d) {
    const cell = 12;
    for (let y = 0; y < A; y += cell) {
      for (let x = 0; x < A; x += cell) {
        const r = rng();
        if (r < 0.33) { c.fillStyle = d.primary; c.fillRect(x, y, cell, cell); }
        else if (r < 0.45) { c.fillStyle = d.accent; c.fillRect(x, y, cell, cell); }
      }
    }
  },

  camo(c, g, A, rng, d) {
    const cols = [d.primary, d.accent, '#1c120b'];
    for (let i = 0; i < 140; i++) {
      c.fillStyle = cols[Math.floor(rng() * cols.length)];
      c.beginPath();
      const x = rng() * A, y = rng() * A, r = 10 + rng() * 40;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = r * (0.6 + rng() * 0.6);
        k ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.fill();
    }
    g.fillStyle = d.accent;
    for (let i = 0; i < 25; i++) g.fillRect(rng() * A, rng() * A, 3, 3);
  },

  signal(c, g, A, rng, d) {
    for (let y = 0; y < A; y += 18) {
      c.strokeStyle = rng() < 0.5 ? d.primary : '#e8f1f6';
      c.lineWidth = 4 + rng() * 6;
      c.beginPath();
      const amp = 4 + rng() * 10, freq = 0.02 + rng() * 0.03;
      for (let x = 0; x <= A; x += 8) c.lineTo(x, y + Math.sin(x * freq) * amp);
      c.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const y = rng() * A;
      [c, g].forEach(ctx => { ctx.strokeStyle = d.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(A, y + (rng() - 0.5) * 30); ctx.stroke(); });
    }
  },

  circuit(c, g, A, rng, d) {
    c.fillStyle = d.primary;
    for (let i = 0; i < 60; i++) c.fillRect(rng() * A, rng() * A, 20 + rng() * 60, 20 + rng() * 60);
    for (let i = 0; i < 90; i++) {
      let x = Math.round(rng() * A / 16) * 16, y = Math.round(rng() * A / 16) * 16;
      [c, g].forEach(ctx => { ctx.strokeStyle = d.accent; ctx.lineWidth = 2; });
      c.beginPath(); g.beginPath();
      c.moveTo(x, y); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * 16 * (1 + Math.floor(rng() * 3));
        else y += (rng() < 0.5 ? -1 : 1) * 16 * (1 + Math.floor(rng() * 3));
        c.lineTo(x, y); g.lineTo(x, y);
      }
      c.stroke(); g.stroke();
      [c, g].forEach(ctx => { ctx.fillStyle = d.accent; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    }
  },

  grid(c, g, A, rng, d) {
    const s = 22;
    for (let y = 0; y < A; y += s) {
      for (let x = 0; x < A; x += s) {
        const r = rng();
        c.fillStyle = r < 0.3 ? d.primary : r < 0.36 ? d.accent : d.base;
        c.fillRect(x + 1, y + 1, s - 2, s - 2);
        if (r >= 0.3 && r < 0.36) { g.fillStyle = d.accent; g.fillRect(x + 1, y + 1, s - 2, s - 2); }
      }
    }
    [c, g].forEach(ctx => {
      ctx.strokeStyle = d.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      for (let i = 0; i < A; i += s * 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, A); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
  },

  pulse(c, g, A, rng, d) {
    c.fillStyle = d.primary;
    for (let i = 0; i < 30; i++) {
      // obsidian shards
      c.beginPath();
      const x = rng() * A, y = rng() * A;
      c.moveTo(x, y); c.lineTo(x + rng() * 60, y + rng() * 30); c.lineTo(x + rng() * 30, y + rng() * 70);
      c.fill();
    }
    for (let k = 0; k < 4; k++) {
      const cx = rng() * A, cy = rng() * A;
      for (let r = 8; r < 160; r += 14 + rng() * 10) {
        [c, g].forEach(ctx => { ctx.strokeStyle = d.accent; ctx.lineWidth = 1.5 + rng() * 1.5; ctx.globalAlpha = 1 - r / 180; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
      }
      c.globalAlpha = g.globalAlpha = 1;
    }
  },

  storm(c, g, A, rng, d) {
    for (let i = 0; i < 70; i++) {
      c.fillStyle = rng() < 0.6 ? d.primary : '#0b2440';
      c.save(); c.translate(rng() * A, rng() * A); c.rotate(-0.6); c.fillRect(0, 0, 80 + rng() * 120, 6 + rng() * 18); c.restore();
    }
    for (let i = 0; i < 16; i++) {
      // lightning bolts
      let x = rng() * A, y = rng() * A;
      [c, g].forEach(ctx => { ctx.strokeStyle = d.accent; ctx.lineWidth = 2.5; });
      c.beginPath(); g.beginPath(); c.moveTo(x, y); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (rng() - 0.3) * 30; y += 10 + rng() * 20; c.lineTo(x, y); g.lineTo(x, y); }
      c.stroke(); g.stroke();
    }
  },

  rupture(c, g, A, rng, d) {
    c.fillStyle = d.primary;
    for (let i = 0; i < 40; i++) c.fillRect(rng() * A, rng() * A, rng() * 80, rng() * 80);
    // radiating cracks of neon
    for (let k = 0; k < 6; k++) {
      const cx = rng() * A, cy = rng() * A;
      for (let i = 0; i < 9; i++) {
        let x = cx, y = cy, a = rng() * Math.PI * 2;
        [c, g].forEach(ctx => { ctx.strokeStyle = i % 3 ? d.accent : '#ffd0f6'; ctx.lineWidth = 3 - i * 0.2; });
        c.beginPath(); g.beginPath(); c.moveTo(x, y); g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { a += (rng() - 0.5) * 0.9; x += Math.cos(a) * 18; y += Math.sin(a) * 18; c.lineTo(x, y); g.lineTo(x, y); }
        c.stroke(); g.stroke();
      }
    }
  },

  void(c, g, A, rng, d) {
    const grd = c.createLinearGradient(0, 0, A, A);
    grd.addColorStop(0, d.base); grd.addColorStop(0.5, d.primary); grd.addColorStop(1, d.base);
    c.fillStyle = grd; c.fillRect(0, 0, A, A);
    // stars
    for (let i = 0; i < 500; i++) {
      const x = rng() * A, y = rng() * A, s = rng() < 0.92 ? 1 : 2.5;
      const col = rng() < 0.7 ? '#ffffff' : d.accent;
      c.fillStyle = col; c.fillRect(x, y, s, s);
      if (s > 2) { g.fillStyle = col; g.fillRect(x, y, s, s); }
    }
    // speed streaks
    for (let i = 0; i < 26; i++) {
      const x = rng() * A, y = rng() * A, len = 40 + rng() * 140;
      [c, g].forEach(ctx => {
        const lg = ctx.createLinearGradient(x, y, x + len, y);
        lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, i % 2 ? d.accent : '#c86bff');
        ctx.strokeStyle = lg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
      });
    }
  },
};
