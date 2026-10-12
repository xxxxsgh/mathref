// Interior andável da Estação Meridiana (disco de atracação, hangar 03).
//
// Coordenadas do CONVÉS: referencial da estação deslocado para o piso dos
// hangares (y = 0 no piso; +Y = "cima" da gravidade artificial; o hangar 0
// abre para +Z). Salas:
//
//   hangar 03       x −32…32   z 50…130   pé-direito 26 (boca em z = 130)
//   corredor leste  x  32…46   z 60…64    → bar "O Último Salto"
//   bar             x  46…80   z 44…80    janela panorâmica em x = 80
//   corredor oeste  x −46…−32  z 60…64    → mercado / oficina
//   mercado         x −84…−46  z 40…84    quadro de missões, bancas, oficina
//
// Luz: irradiância ASSADA POR VÉRTICE de todas as luminárias da sala (com
// oclusão de canto barata) + um conjunto pequeno de PointLights próprias
// que acompanham o jogador (brilho especular). O hangar também recebe o sol
// pela boca (sombra em cascata).
import * as THREE from 'three/webgpu';
import {
  vec3, vec4, float, attribute, uniform, mix, smoothstep, normalize, normalView, positionView, abs, dot, pow, sin, time,
  texture, uv, lights as tslLights, positionLocal, max, normalWorld,
} from 'three/tsl';
import { Kit, V3, mat, rng, lightsGeometry } from './geo.js';
import { ZONE as Z, makeInteriorMaterial, makeLightsMaterial, makeConeMaterial, makeGlassMaterial, makeFieldMaterial, makeHoloMaterial, makeSignMaterial } from './materials.js';
import { SignAtlas, neonText, paintedText, screenPanel, guildLogo } from './signs.js';
import { MERIDIANA } from './meridiana.js';
import { Crowd } from './npcs.js';
import { vnoise } from './tsl.js';

const L = 'int';
const TAU = Math.PI * 2;
const POOL = { ultra: 8, high: 6, medium: 4, mobile: 0 };

export const ROOMS = {
  hangar: { x0: -32, x1: 32, z0: 50, z1: 130, h: 26 },
  corrE: { x0: 32.4, x1: 45.6, z0: 60, z1: 64, h: 3.6 },
  bar: { x0: 46, x1: 74, z0: 46, z1: 76, h: 4.6 },
  corrW: { x0: -45.6, x1: -32.4, z0: 60, z1: 64, h: 3.6 },
  market: { x0: -84, x1: -46, z0: 40, z1: 84, h: 8 },
};

// ═══════════════════════════════════════════════════════════════════════════
// Construtor de salas
class Builder {
  constructor(seed) {
    this.k = new Kit(seed);
    this.r = rng(seed + 5);
    this.lamps = [];     // {pos, color:[r,g,b], intensity, range, room}
    this.rooms = [];     // {name, min, max, amb:[r,g,b]}
    this.cols = [];      // {center, half}
    this.terminals = []; // {id, pos, label, sub, action, panel}
    this.signs = [];     // {name, w, h, pos, rot, kind}
    this.cones = [];     // {pos, h, r0, r1, color, k}
    this.bottles = new Kit(seed + 9);
    this.glass = [];     // {w, h, pos, rot}
    this.holos = [];     // {geo, pos, rot, color}
    this.spots = {};     // pontos nomeados (NPCs, câmera)
  }
  col(center, half) { this.cols.push({ center: center.clone(), half: half.clone() }); }
  lamp(pos, color, intensity, range, room) { this.lamps.push({ pos: pos.clone(), color, intensity, range, room }); }
  sign(name, w, h, pos, rot = null, kind = 'paint') { this.signs.push({ name, w, h, pos: pos.clone(), rot: rot || [0, 0, 0], kind }); }
  cone(pos, h, r0, r1, color, k = 0.05) { this.cones.push({ pos: pos.clone(), h, r0, r1, color, k }); }

  /**
   * Parede retilínea alinhada a X ou Z. along: 'x' (z fixo) ou 'z' (x fixo).
   * a0..a1 = extensão; fixed = coordenada fixa; n = lado de dentro (+1/−1).
   * openings: [{c, w, y0, y1, glass}] (c = centro ao longo da parede).
   */
  wall(along, a0, a1, fixed, n, h, openings = [], zone = Z.WALL, thick = 0.4, collide = true) {
    const k = this.k;
    const ops = openings.slice().sort((p, q) => p.c - q.c);
    const piece = (b0, b1, y0, y1, z = zone) => {
      if (b1 - b0 < 0.01 || y1 - y0 < 0.01) return;
      const c = (b0 + b1) / 2, len = b1 - b0, hh = y1 - y0;
      const off = fixed - n * thick / 2;
      const pos = along === 'x' ? V3(c, (y0 + y1) / 2, off) : V3(off, (y0 + y1) / 2, c);
      const w = along === 'x' ? len : thick, d = along === 'x' ? thick : len;
      k.boxSeg(L, w, hh, d, pos, 1.6, null, z);
      if (collide) this.col(pos, V3(w / 2, hh / 2, d / 2));
    };
    let cur = a0;
    for (const o of ops) {
      const b0 = o.c - o.w / 2, b1 = o.c + o.w / 2;
      piece(cur, b0, 0, h);
      piece(b0, b1, 0, o.y0 ?? 0);
      piece(b0, b1, o.y1 ?? h, h);
      if (o.glass) {
        const off = fixed - n * 0.05;
        const c = o.c;
        const gp = along === 'x' ? V3(c, (o.y0 + o.y1) / 2, off) : V3(off, (o.y0 + o.y1) / 2, c);
        this.glass.push({ w: o.w, h: o.y1 - o.y0, pos: gp, rot: along === 'x' ? [0, 0, 0] : [0, Math.PI / 2, 0] });
        if (collide) this.col(gp, along === 'x' ? V3(o.w / 2, (o.y1 - o.y0) / 2, 0.2) : V3(0.2, (o.y1 - o.y0) / 2, o.w / 2));
        // caixilhos verticais
        const nm = Math.max(1, Math.round(o.w / 3.4));
        for (let i = 0; i <= nm; i++) {
          const t = b0 + (i / nm) * o.w;
          const mp = along === 'x' ? V3(t, (o.y0 + o.y1) / 2, fixed - n * 0.12) : V3(fixed - n * 0.12, (o.y0 + o.y1) / 2, t);
          k.box(L, along === 'x' ? 0.16 : 0.3, o.y1 - o.y0, along === 'x' ? 0.3 : 0.16, mp, null, Z.TRIM);
        }
        const sill = along === 'x' ? V3(o.c, o.y0 - 0.05, fixed - n * 0.25) : V3(fixed - n * 0.25, o.y0 - 0.05, o.c);
        k.box(L, along === 'x' ? o.w : 0.5, 0.1, along === 'x' ? 0.5 : o.w, sill, null, Z.TRIM);
      }
      cur = b1;
    }
    piece(cur, a1, 0, h);
  }

  /** Sala retangular: piso, teto, paredes com aberturas. sides: {w,e,s,n} → openings[] | null (sem parede). */
  room(name, R, { sides = {}, floorZone = Z.FLOOR, wallZone = Z.WALL, ceilZone = Z.WALL, amb = [0.02, 0.02, 0.022], ceil = true } = {}) {
    const k = this.k;
    const w = R.x1 - R.x0, d = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    k.boxSeg(L, w, 0.4, d, V3(cx, -0.2, cz), 1.5, null, floorZone);
    this.col(V3(cx, -1, cz), V3(w / 2 + 0.4, 1, d / 2 + 0.4));
    if (ceil) { k.boxSeg(L, w, 0.4, d, V3(cx, R.h + 0.2, cz), 2.0, null, ceilZone); this.col(V3(cx, R.h + 1, cz), V3(w / 2, 1, d / 2)); }
    const S = { w: sides.w, e: sides.e, s: sides.s, n: sides.n };
    if (S.w !== null) this.wall('z', R.z0 - 0.4, R.z1 + 0.4, R.x0, 1, R.h, S.w || [], wallZone);
    if (S.e !== null) this.wall('z', R.z0 - 0.4, R.z1 + 0.4, R.x1, -1, R.h, S.e || [], wallZone);
    if (S.s !== null) this.wall('x', R.x0, R.x1, R.z0, 1, R.h, S.s || [], wallZone);
    if (S.n !== null) this.wall('x', R.x0, R.x1, R.z1, -1, R.h, S.n || [], wallZone);
    this.rooms.push({ name, min: V3(R.x0, 0, R.z0), max: V3(R.x1, R.h, R.z1), amb });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Mobiliário
function stool(B, x, z, h = 0.78) {
  const k = B.k;
  k.cyl(L, 0.22, 0.26, 0.04, V3(x, 0.02, z), null, Z.TRIM, 16);
  k.cyl(L, 0.035, 0.035, h - 0.06, V3(x, h / 2, z), null, Z.BRASS, 8);
  k.torus(L, 0.17, 0.012, V3(x, 0.32, z), Z.BRASS, 16, 4);
  k.cyl(L, 0.2, 0.18, 0.08, V3(x, h, z), null, Z.FABRIC, 16);
}
function roundTable(B, x, z, r = 0.55, h = 0.74) {
  const k = B.k;
  k.cyl(L, r, r, 0.05, V3(x, h, z), null, Z.LACQUER, 28);
  k.torus(L, r, 0.012, V3(x, h - 0.02, z), Z.GLOW_WARM, 28, 4);
  k.cyl(L, 0.05, 0.07, h - 0.05, V3(x, h / 2, z), null, Z.TRIM, 10);
  k.cyl(L, 0.32, 0.36, 0.04, V3(x, 0.02, z), null, Z.TRIM, 20);
}
function booth(B, x, z, rot, len = 2.2) {
  const k = B.k;
  k.push(mat(V3(x, 0, z), [0, rot, 0]));
  // banco em U
  k.box(L, len, 0.45, 0.6, V3(0, 0.22, -0.95), null, Z.LACQUER);
  k.box(L, len, 0.12, 0.62, V3(0, 0.5, -0.95), null, Z.FABRIC);
  k.box(L, len, 0.75, 0.16, V3(0, 0.95, -1.22), null, Z.FABRIC);
  k.box(L, len, 0.45, 0.6, V3(0, 0.22, 0.95), null, Z.LACQUER);
  k.box(L, len, 0.12, 0.62, V3(0, 0.5, 0.95), null, Z.FABRIC);
  k.box(L, len, 0.75, 0.16, V3(0, 0.95, 1.22), null, Z.FABRIC);
  k.box(L, len + 0.1, 0.06, 0.2, V3(0, 1.36, 1.25), null, Z.BRASS);
  k.box(L, len + 0.1, 0.06, 0.2, V3(0, 1.36, -1.25), null, Z.BRASS);
  // mesa
  k.box(L, len * 0.85, 0.05, 0.9, V3(0, 0.74, 0), null, Z.WOOD);
  k.box(L, 0.12, 0.7, 0.12, V3(0, 0.37, 0), null, Z.TRIM);
  k.box(L, len * 0.86, 0.015, 0.02, V3(0, 0.715, 0.45), null, Z.GLOW_PINK);
  k.pop();
  const c = new THREE.Vector3(x, 0, z);
  B.col(V3(x, 0.5, z), V3(Math.abs(Math.cos(rot)) * len / 2 + Math.abs(Math.sin(rot)) * 1.3, 0.5, Math.abs(Math.sin(rot)) * len / 2 + Math.abs(Math.cos(rot)) * 1.3));
  return c;
}
/** Luminária pendente com cúpula, cabo, lâmpada e cone de luz. */
function pendant(B, x, y, z, ceilY, color, room, intensity = 3.2, coneK = 0.05) {
  const k = B.k;
  k.cyl(L, 0.006, 0.006, ceilY - y, V3(x, (ceilY + y) / 2 + 0.15, z), null, Z.TRIM, 4);
  k.lathe(L, [[0.04, 0.28], [0.08, 0.26], [0.2, 0.12], [0.3, 0.0], [0.29, -0.01], [0.19, 0.11], [0.07, 0.24]], V3(x, y, z), Z.BRASS, 24);
  k.light(V3(x, y + 0.04, z), [color[0] * 9, color[1] * 9, color[2] * 9], 0.07, 0);
  B.lamp(V3(x, y - 0.1, z), color, intensity, 7, room);
  B.cone(V3(x, y - 0.02, z), y - 0.05, 0.26, 1.1, color, coneK);
}
/** Prateleiras retroiluminadas com garrafas. */
function backbar(B, x0, x1, z, y0, rows, room) {
  const k = B.k, r = B.r;
  const w = x1 - x0, cx = (x0 + x1) / 2;
  k.box(L, w + 0.4, rows * 0.55 + 0.4, 0.3, V3(cx, y0 + rows * 0.275, z + 0.15), null, Z.LACQUER);
  // painel luminoso atrás das garrafas
  k.box(L, w, rows * 0.55, 0.04, V3(cx, y0 + rows * 0.275, z + 0.32), null, Z.GLOW_WARM);
  for (let i = 0; i <= rows; i++) {
    const y = y0 + i * 0.55;
    k.box(L, w + 0.3, 0.035, 0.34, V3(cx, y, z + 0.5), null, Z.BRASS);
    if (i < rows) {
      let xx = x0 + 0.12;
      while (xx < x1 - 0.12) {
        const kind = r();
        const bh = 0.2 + r() * 0.16, br = 0.035 + r() * 0.025;
        const p = V3(xx, y + 0.02 + bh / 2, z + 0.5 + (r() - 0.5) * 0.08);
        const hue = r();
        B.bottles.cyl('b', br, br, bh, p, null, 0, 10, hue);
        B.bottles.cyl('b', br * 0.35, br * 0.9, bh * 0.35, p.clone().add(V3(0, bh * 0.62, 0)), null, 0, 8, hue);
        if (kind > 0.8) B.bottles.sphere('b', br * 1.2, p.clone().add(V3(0, -bh * 0.1, 0)), 0, 10, 8, hue);
        xx += br * 2 + 0.03 + r() * 0.05;
      }
    }
  }
  B.lamp(V3(cx - w / 4, y0 + rows * 0.3, z + 0.9), [1.0, 0.7, 0.4], 6, 7, room);
  B.lamp(V3(cx + w / 4, y0 + rows * 0.3, z + 0.9), [1.0, 0.6, 0.3], 6, 7, room);
  B.lamp(V3(cx, y0 + rows * 0.6, z + 1.2), [1.0, 0.55, 0.3], 4, 8, room);
}
/** Planta alienígena em vaso (folhas em leque com pontas bioluminescentes). */
function plant(B, x, z, s = 1) {
  const k = B.k, r = B.r;
  k.cyl(L, 0.32 * s, 0.24 * s, 0.6 * s, V3(x, 0.3 * s, z), null, Z.LACQUER, 16);
  k.cyl(L, 0.3 * s, 0.3 * s, 0.03, V3(x, 0.6 * s, z), null, Z.RUBBER, 16);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.4;
    const tilt = 0.35 + r() * 0.5;
    const len = (0.7 + r() * 0.7) * s;
    const dir = V3(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
    const base = V3(x, 0.6 * s, z);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
    const g = new THREE.ConeGeometry(0.09 * s, len, 4, 1);
    g.scale(1, 1, 0.25);
    k.add(L, g, mat(base.clone().addScaledVector(dir, len / 2), q), Z.ACCENT);
    k.light(base.clone().addScaledVector(dir, len), [0.4, 2.4, 1.6], 0.03 * s, -0.25, r());
  }
}
/** Contêiner de carga com nervuras. */
function container(B, pos, rot, zone = Z.PAINT, size = [6, 2.6, 2.5]) {
  const k = B.k;
  k.push(mat(pos, [0, rot, 0]));
  k.box(L, size[0], size[1], size[2], V3(0, size[1] / 2, 0), null, zone);
  for (let i = 0; i <= 10; i++) {
    const x = -size[0] / 2 + (i / 10) * size[0];
    k.box(L, 0.08, size[1] - 0.1, size[2] + 0.06, V3(x, size[1] / 2, 0), null, zone);
  }
  k.box(L, size[0] + 0.1, 0.18, size[2] + 0.1, V3(0, size[1] - 0.05, 0), null, Z.TRIM);
  k.box(L, size[0] + 0.1, 0.18, size[2] + 0.1, V3(0, 0.09, 0), null, Z.TRIM);
  k.pop();
  const hx = Math.abs(Math.cos(rot)) * size[0] / 2 + Math.abs(Math.sin(rot)) * size[2] / 2;
  const hz = Math.abs(Math.sin(rot)) * size[0] / 2 + Math.abs(Math.cos(rot)) * size[2] / 2;
  if (pos.y < 0.5) B.col(V3(pos.x, size[1] / 2, pos.z), V3(hx, size[1] / 2, hz));
}
function crate(B, pos, s = 1, rot = 0) {
  const k = B.k;
  k.push(mat(pos, [0, rot, 0]));
  k.box(L, 1.2 * s, 0.9 * s, 0.9 * s, V3(0, 0.45 * s, 0), null, Z.TRIM);
  k.box(L, 1.24 * s, 0.1 * s, 0.94 * s, V3(0, 0.85 * s, 0), null, Z.HAZARD);
  k.box(L, 0.08 * s, 0.92 * s, 0.94 * s, V3(-0.5 * s, 0.45 * s, 0), null, Z.METAL);
  k.box(L, 0.08 * s, 0.92 * s, 0.94 * s, V3(0.5 * s, 0.45 * s, 0), null, Z.METAL);
  k.pop();
}
/** Terminal de pé com tela. */
function kiosk(B, x, z, rot, id, label, sub, panel, room) {
  const k = B.k;
  k.push(mat(V3(x, 0, z), [0, rot, 0]));
  k.box(L, 0.7, 0.08, 0.5, V3(0, 0.04, 0), null, Z.TRIM);
  k.box(L, 0.3, 1.0, 0.25, V3(0, 0.55, 0), null, Z.WALL);
  k.box(L, 0.78, 0.55, 0.08, V3(0, 1.32, 0.05), [-0.35, 0, 0], Z.TRIM);
  k.box(L, 0.7, 0.47, 0.02, V3(0, 1.335, 0.1), [-0.35, 0, 0], Z.SCREEN);
  k.box(L, 0.6, 0.02, 0.02, V3(0, 1.06, 0.18), null, Z.GLOW);
  k.pop();
  const p = V3(x, 1.3, z).add(V3(Math.sin(rot), 0, Math.cos(rot)).multiplyScalar(0.3));
  B.terminals.push({ id, pos: p, label, sub, panel, room });
  B.lamp(p.clone().add(V3(Math.sin(rot) * 0.4, 0, Math.cos(rot) * 0.4)), [0.3, 0.8, 1.0], 0.5, 2.5, room);
  B.col(V3(x, 0.7, z), V3(0.4, 0.7, 0.4));
}

// ═══════════════════════════════════════════════════════════════════════════
// Hangar 03
function buildHangar(B) {
  const k = B.k, R = ROOMS.hangar, r = B.r;
  const door = { c: 62, w: 3.2, y0: 0, y1: 3.4 };
  B.room('hangar', R, {
    sides: { w: [door], e: [door], s: [{ c: 0, w: 10, y0: 0, y1: 7 }], n: null },
    floorZone: Z.FLOOR, wallZone: Z.WALL, ceilZone: Z.TRIM, amb: [0.035, 0.038, 0.045],
  });
  // porta grande de carga (fechada) na parede do fundo
  k.box(L, 10, 7, 0.5, V3(0, 3.5, R.z0 + 0.05), null, Z.METAL);
  for (let i = 0; i < 5; i++) k.box(L, 10, 0.16, 0.56, V3(0, 0.8 + i * 1.4, R.z0 + 0.06), null, Z.TRIM);
  k.box(L, 10.6, 0.5, 0.6, V3(0, 7.25, R.z0 + 0.3), null, Z.HAZARD);
  B.col(V3(0, 3.5, R.z0), V3(5, 3.5, 0.5));
  for (const s of [-1, 1]) k.box(L, 0.3, 7.5, 0.6, V3(s * 5.15, 3.75, R.z0 + 0.3), null, Z.HAZARD);
  k.light(V3(-5.6, 6.6, R.z0 + 0.5), [10, 4, 0.5], 0.12, -0.6);
  k.light(V3(5.6, 6.6, R.z0 + 0.5), [10, 4, 0.5], 0.12, -0.6, 0.5);
  // cabine de controle (janela alta sobre a porta)
  k.box(L, 16, 4.4, 0.3, V3(0, 13, R.z0 + 0.35), null, Z.TRIM);
  k.box(L, 15.2, 3.6, 0.1, V3(0, 13, R.z0 + 0.52), null, Z.GLASS);
  k.box(L, 15, 3.4, 0.05, V3(0, 13, R.z0 + 0.3), null, Z.SCREEN);
  k.box(L, 17, 0.3, 1.4, V3(0, 10.7, R.z0 + 0.9), null, Z.TRIM);
  B.lamp(V3(0, 12.6, R.z0 + 1.6), [0.35, 0.8, 1.0], 2.2, 7, 'hangar');
  // pilares, frisos inferiores, faixas de perigo
  for (const sx of [-1, 1]) {
    const x = sx * R.x1;
    for (let z = R.z0 + 4; z <= R.z1 - 2; z += 8) {
      if (Math.abs(z - 62) < 2.5) continue;
      k.box(L, 1.4, R.h, 1.6, V3(x - sx * 0.7, R.h / 2, z), null, Z.DARK);
      k.box(L, 0.4, R.h - 1, 0.5, V3(x - sx * 1.5, R.h / 2, z), null, Z.METAL);
      k.box(L, 1.6, 0.6, 1.8, V3(x - sx * 0.8, 0.3, z), null, Z.HAZARD);
      // mãos-francesas no alto
      k.beam(L, V3(x - sx * 1.4, R.h - 6, z), V3(x - sx * 6, R.h - 0.5, z), 0.5, Z.DARK);
      // luminária de serviço âmbar no pilar
      k.box(L, 0.25, 0.35, 0.5, V3(x - sx * 1.55, 3.4, z), null, Z.TRIM);
      k.light(V3(x - sx * 1.72, 3.4, z), [9, 5.2, 2.0], 0.1, 0);
      B.lamp(V3(x - sx * 2.2, 3.3, z), [1.0, 0.62, 0.28], 2.2, 7, 'hangar');
    }
    k.box(L, 0.2, 2.4, R.z1 - R.z0, V3(x - sx * 0.1, 1.2, (R.z0 + R.z1) / 2), null, Z.TRIM);
    k.box(L, 0.25, 0.35, R.z1 - R.z0, V3(x - sx * 0.12, 0.18, (R.z0 + R.z1) / 2), null, Z.HAZARD);
    // dutos e cabos ao longo das paredes
    for (let i = 0; i < 3; i++) k.pipe(L, V3(x - sx * (0.5 + i * 0.32), 5.2 + i * 0.4, R.z0 + 0.5), V3(x - sx * (0.5 + i * 0.32), 5.2 + i * 0.4, R.z1 - 0.5), 0.13 + i * 0.03, i === 1 ? Z.ACCENT : Z.METAL, 10);
    for (let z = R.z0 + 2; z < R.z1; z += 4) k.box(L, 1.4, 0.12, 0.2, V3(x - sx * 0.8, 5.0, z), null, Z.DARK);
    // passarela a 9 m
    const cw = 2.6, y = 9;
    k.box(L, cw, 0.12, R.z1 - R.z0 - 4, V3(x - sx * (cw / 2 + 0.2), y, (R.z0 + R.z1) / 2 + 1), null, Z.GRATE);
    k.box(L, 0.2, 0.3, R.z1 - R.z0 - 4, V3(x - sx * (cw + 0.2), y - 0.12, (R.z0 + R.z1) / 2 + 1), null, Z.DARK);
    k.pipe(L, V3(x - sx * (cw + 0.15), y + 1.05, R.z0 + 2), V3(x - sx * (cw + 0.15), y + 1.05, R.z1 - 2), 0.045, Z.METAL, 8);
    k.pipe(L, V3(x - sx * (cw + 0.15), y + 0.55, R.z0 + 2), V3(x - sx * (cw + 0.15), y + 0.55, R.z1 - 2), 0.03, Z.METAL, 8);
    for (let z = R.z0 + 3; z < R.z1 - 2; z += 2.5) k.box(L, 0.06, 1.05, 0.06, V3(x - sx * (cw + 0.15), y + 0.52, z), null, Z.METAL);
    for (let z = R.z0 + 4; z < R.z1 - 2; z += 8) k.beam(L, V3(x - sx * 0.4, y - 2.4, z), V3(x - sx * (cw + 0.1), y - 0.1, z), 0.18, Z.DARK);
    // luzes de borda na passarela
    for (let z = R.z0 + 5; z < R.z1 - 3; z += 6) k.light(V3(x - sx * (cw + 0.2), y - 0.2, z), [0.4, 2.6, 2.2], 0.05, 0);
    // escada de marinheiro
    const lz = R.z0 + 14;
    for (const dz of [-0.25, 0.25]) k.box(L, 0.06, y, 0.06, V3(x - sx * 0.5, y / 2, lz + dz), null, Z.METAL);
    for (let yy = 0.4; yy < y; yy += 0.35) k.box(L, 0.04, 0.04, 0.5, V3(x - sx * 0.5, yy, lz), null, Z.METAL);
  }
  // passarela do fundo
  k.box(L, R.x1 * 2 - 6, 0.12, 2.6, V3(0, 9, R.z0 + 1.7), null, Z.GRATE);
  k.pipe(L, V3(R.x0 + 3, 10.05, R.z0 + 2.95), V3(R.x1 - 3, 10.05, R.z0 + 2.95), 0.045, Z.METAL, 8);
  // teto: treliças e painéis de luz
  for (let z = R.z0 + 6; z < R.z1; z += 10) {
    k.box(L, R.x1 * 2, 1.4, 0.6, V3(0, R.h - 0.7, z), null, Z.DARK);
    k.box(L, R.x1 * 2, 0.2, 1.2, V3(0, R.h - 1.4, z), null, Z.DARK);
    for (const x of [-18, -6, 6, 18]) {
      const zz = z + 5;
      if (zz > R.z1 - 2) continue;
      k.box(L, 7, 0.25, 1.2, V3(x, R.h - 0.35, zz), null, Z.TRIM);
      k.box(L, 6.6, 0.06, 0.9, V3(x, R.h - 0.5, zz), null, Z.GLOW);
      B.lamp(V3(x, R.h - 1.5, zz), [0.95, 0.97, 1.0], 26, 34, 'hangar');
      if ((x === -6 || x === 6) && zz < R.z1 - 10) B.cone(V3(x, R.h - 0.6, zz), R.h - 1, 1.2, 6.5, [0.9, 0.95, 1.0], 0.035);
    }
  }
  // ponte rolante
  for (const sx of [-1, 1]) k.box(L, 0.8, 1.0, R.z1 - R.z0 - 2, V3(sx * 27, R.h - 3, (R.z0 + R.z1) / 2), null, Z.DARK);
  const cz = 70;
  k.box(L, 56, 1.8, 1.4, V3(0, R.h - 4.2, cz), null, Z.HAZARD);
  k.box(L, 56, 0.4, 1.6, V3(0, R.h - 3.2, cz), null, Z.DARK);
  k.box(L, 3, 1.6, 3, V3(-8, R.h - 5.6, cz), null, Z.DARK);
  k.cyl(L, 0.06, 0.06, 9, V3(-8.8, R.h - 10.8, cz), null, Z.METAL, 6);
  k.cyl(L, 0.06, 0.06, 9, V3(-7.2, R.h - 10.8, cz), null, Z.METAL, 6);
  container(B, V3(-8, R.h - 18.3, cz), 0.2, Z.ACCENT);
  // carga empilhada nos cantos do fundo
  container(B, V3(-24, 0, 58), 0, Z.PAINT);
  container(B, V3(-24, 2.6, 58), 0.04, Z.ACCENT);
  container(B, V3(-24, 0, 61.2), 0, Z.TRIM, [6, 2.6, 2.5]);
  container(B, V3(23, 0, 57), Math.PI / 2, Z.ACCENT);
  container(B, V3(19.6, 0, 57), Math.PI / 2, Z.PAINT);
  for (let i = 0; i < 9; i++) crate(B, V3(12 + (i % 3) * 1.35, 0 + Math.floor(i / 3) * 0.95 * (i % 3 === 1 ? 0 : 0), 54 + Math.floor(i / 3) * 1.1), 1, r() * 0.2);
  crate(B, V3(13.35, 0.9, 54), 1, 0.1); crate(B, V3(12, 0.9, 55.1), 1, -0.15);
  for (let i = 0; i < 6; i++) { const p = V3(-14 + (i % 3) * 0.75, 0, 53 + Math.floor(i / 3) * 0.75); k.cyl(L, 0.32, 0.32, 0.95, p.clone().setY(0.475), null, i % 2 ? Z.ACCENT : Z.HAZARD, 16); k.torus(L, 0.33, 0.025, p.clone().setY(0.3), Z.TRIM, 16, 4); k.torus(L, 0.33, 0.025, p.clone().setY(0.7), Z.TRIM, 16, 4); }
  B.col(V3(13.4, 0.9, 55.2), V3(2.1, 0.9, 1.7));
  B.col(V3(-13.3, 0.5, 53.4), V3(1.2, 0.5, 0.8));
  // plataforma de pouso
  const pz = 94;
  k.cyl(L, 15, 15.4, 0.22, V3(0, 0.11, pz), null, Z.TRIM, 64);
  k.torus(L, 14.4, 0.09, V3(0, 0.23, pz), Z.HAZARD, 96, 4);
  k.torus(L, 10.5, 0.05, V3(0, 0.23, pz), Z.GLOW, 96, 4);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.light(V3(Math.sin(a) * 15.2, 0.25, pz + Math.cos(a) * 15.2), [0.5, 4.2, 3.2], 0.06, -0.5, i / 24); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; k.box(L, 2.2, 0.03, 0.5, V3(Math.sin(a) * 12.3, 0.235, pz + Math.cos(a) * 12.3), [0, a, 0], Z.HAZARD); }
  B.sign('pad03', 10, 2.5, V3(0, 0.24, pz + 8.5), [-Math.PI / 2, 0, Math.PI], 'floor');
  // marcações pintadas no piso: quadro da baia, setas, manchas
  for (const [x, z, w, d] of [[0, pz - 20, 40, 0.5], [0, pz + 20, 40, 0.5], [-20, pz, 0.5, 40], [20, pz, 0.5, 40]]) k.box(L, w, 0.02, d, V3(x, 0.012, z), null, Z.HAZARD);
  for (let i = 0; i < 4; i++) { const z = pz + 24 + i * 6; for (const sx of [-1, 1]) k.box(L, 3.2, 0.02, 0.5, V3(sx * 1.3, 0.012, z), [0, sx * 0.7, 0], Z.GLOW_WARM); }
  for (let i = 0; i < 10; i++) k.cyl(L, 0.6 + r() * 1.6, 0.6 + r() * 1.6, 0.012, V3((r() - 0.5) * 50, 0.008, 56 + r() * 66), null, Z.RUBBER, 18);
  // faixas-guia da boca até a plataforma
  for (const sx of [-1, 1]) {
    k.box(L, 0.3, 0.03, R.z1 - pz - 16, V3(sx * 7, 0.015, (pz + 15 + R.z1) / 2), null, Z.HAZARD);
    for (let z = pz + 18; z < R.z1 - 1; z += 3) k.light(V3(sx * 7.6, 0.06, z), [0.5, 4.2, 3.2], 0.05, -0.8, (z - pz) / 40);
  }
  // estação de reabastecimento
  k.cyl(L, 0.9, 0.9, 3.4, V3(-17, 1.7, 100), null, Z.ACCENT, 20);
  k.cyl(L, 0.9, 0.9, 3.4, V3(-17, 1.7, 102.2), null, Z.ACCENT, 20);
  k.box(L, 1.4, 1.6, 2.6, V3(-15.6, 0.8, 101.1), null, Z.TRIM);
  k.box(L, 0.6, 0.4, 0.05, V3(-14.88, 1.2, 101.1), [0, Math.PI / 2, 0], Z.SCREEN);
  k.pipe(L, V3(-14.9, 0.5, 100.4), V3(-11, 0.05, 98), 0.07, Z.RUBBER, 8);
  k.pipe(L, V3(-11, 0.05, 98), V3(-6.5, 0.05, 96.5), 0.07, Z.RUBBER, 8);
  B.col(V3(-16.5, 1.7, 101.1), V3(1.2, 1.7, 2.2));
  // braço robótico de manutenção
  k.cyl(L, 0.8, 1.0, 0.6, V3(15, 0.3, 102), null, Z.DARK, 20);
  k.cyl(L, 0.45, 0.45, 2.6, V3(15, 1.9, 102), null, Z.HAZARD, 16);
  k.beam(L, V3(15, 3.2, 102), V3(12.6, 5.0, 99.8), 0.5, Z.HAZARD);
  k.beam(L, V3(12.6, 5.0, 99.8), V3(10.2, 3.6, 97.6), 0.4, Z.HAZARD);
  k.sphere(L, 0.42, V3(12.6, 5.0, 99.8), Z.DARK, 12, 8);
  k.cyl(L, 0.2, 0.12, 0.6, V3(10.2, 3.3, 97.6), null, Z.METAL, 10);
  k.light(V3(10.2, 3.0, 97.6), [2, 6, 9], 0.06, 0);
  B.col(V3(15, 1.5, 102), V3(0.9, 1.5, 0.9));
  // ferramentas: bancada e carrinho
  k.box(L, 3, 0.08, 1, V3(26.5, 0.95, 86), null, Z.TRIM);
  k.box(L, 3, 0.9, 0.9, V3(26.5, 0.45, 86), null, Z.ACCENT);
  k.box(L, 3, 1.6, 0.06, V3(27.9, 1.8, 86), [0, Math.PI / 2, 0], Z.GRATE);
  B.col(V3(26.5, 0.5, 86), V3(1.6, 0.5, 0.6));
  B.lamp(V3(26.5, 2.4, 86), [1.0, 0.85, 0.65], 1.6, 4, 'hangar');
  // placas e letreiros
  B.sign('hangar03', 26, 6.5, V3(0, 18.2, R.z0 + 0.62), [0, 0, 0], 'paint');
  B.sign('logo', 4.4, 4.4, V3(-12.5, 18.5, R.z0 + 0.64), [0, 0, 0], 'neon');
  B.sign('logo', 4.4, 4.4, V3(12.5, 18.5, R.z0 + 0.64), [0, 0, 0], 'neon');
  B.sign('toBar', 3.6, 0.9, V3(R.x1 - 0.62, 4.2, 62), [0, -Math.PI / 2, 0], 'neon');
  B.sign('toMarket', 3.6, 0.9, V3(R.x0 + 0.62, 4.2, 62), [0, Math.PI / 2, 0], 'neon');
  B.sign('warn', 5, 0.8, V3(0, 7.9, R.z0 + 0.62), [0, 0, 0], 'paint');
  B.sign('noFire', 3.2, 0.8, V3(R.x1 - 0.62, 2.4, 80), [0, -Math.PI / 2, 0], 'paint');
  B.sign('noFire', 3.2, 0.8, V3(R.x0 + 0.62, 2.4, 80), [0, Math.PI / 2, 0], 'paint');
  // molduras das portas laterais
  for (const sx of [-1, 1]) {
    const x = sx * (R.x1 - 0.5);
    k.box(L, 0.3, 3.9, 0.35, V3(x, 1.95, 62 - 1.8), null, Z.TRIM);
    k.box(L, 0.3, 3.9, 0.35, V3(x, 1.95, 62 + 1.8), null, Z.TRIM);
    k.box(L, 0.3, 0.35, 3.9, V3(x, 3.72, 62), null, Z.TRIM);
    k.box(L, 0.08, 0.06, 3.4, V3(x - sx * 0.12, 3.5, 62), null, Z.GLOW);
    k.light(V3(x - sx * 0.2, 3.95, 60.1), [0.4, 6, 1.5], 0.06, 0);
  }
  // boca: moldura interna espessa e piso de transição
  k.box(L, R.x1 * 2, 2.2, 2.4, V3(0, R.h - 1.1, R.z1 - 1.2), null, Z.DARK);
  for (const sx of [-1, 1]) k.box(L, 2.2, R.h, 2.4, V3(sx * (R.x1 - 1.1), R.h / 2, R.z1 - 1.2), null, Z.DARK);
  k.box(L, R.x1 * 2 - 4.4, 0.3, 2.4, V3(0, 0.15, R.z1 - 1.2), null, Z.HAZARD);
  for (let i = 0; i < 16; i++) { const x = -28 + i * (56 / 15); k.light(V3(x, R.h - 2.3, R.z1 - 0.1), [0.4, 3.2, 2.6], 0.08, -0.7, i / 16); k.light(V3(x, 0.35, R.z1 - 0.1), [0.4, 3.2, 2.6], 0.08, -0.7, i / 16); }
  B.col(V3(0, R.h / 2, R.z1 + 0.6), V3(R.x1, R.h / 2, 0.5)); // campo de contenção: não sai andando para o vácuo
  B.spots.pad = V3(0, 0, pz);
  B.spots.hangarCam = V3(-21, 1.7, 122);
  // mecânicos
  B.spots.mech = [V3(-9, 0, 99), V3(11.5, 0, 98), V3(20, 0, 84), V3(-20, 0, 70)];
  void r;
}

// ═══════════════════════════════════════════════════════════════════════════
// Corredores
function buildCorridor(B, name, R, dir) {
  const k = B.k;
  B.room(name, R, { sides: { w: null, e: null }, floorZone: Z.GRATE, wallZone: Z.WALL, ceilZone: Z.TRIM, amb: [0.02, 0.022, 0.026] });
  const cz = (R.z0 + R.z1) / 2;
  for (let x = R.x0 + 1; x < R.x1; x += 2.2) {
    k.box(L, 0.3, R.h, 0.25, V3(x, R.h / 2, R.z0 + 0.12), null, Z.TRIM);
    k.box(L, 0.3, R.h, 0.25, V3(x, R.h / 2, R.z1 - 0.12), null, Z.TRIM);
    k.box(L, 0.3, 0.25, R.z1 - R.z0, V3(x, R.h - 0.12, cz), null, Z.TRIM);
  }
  k.box(L, R.x1 - R.x0, 0.05, 0.12, V3((R.x0 + R.x1) / 2, R.h - 0.3, R.z0 + 0.3), null, Z.GLOW);
  k.box(L, R.x1 - R.x0, 0.05, 0.12, V3((R.x0 + R.x1) / 2, R.h - 0.3, R.z1 - 0.3), null, Z.GLOW);
  k.box(L, R.x1 - R.x0, 0.04, 0.08, V3((R.x0 + R.x1) / 2, 0.08, R.z0 + 0.25), null, Z.GLOW);
  k.box(L, R.x1 - R.x0, 0.04, 0.08, V3((R.x0 + R.x1) / 2, 0.08, R.z1 - 0.25), null, Z.GLOW);
  for (let x = R.x0 + 3; x < R.x1; x += 4.5) B.lamp(V3(x, R.h - 0.5, cz), [0.85, 0.92, 1.0], 1.4, 5, name);
  k.pipe(L, V3(R.x0, R.h - 0.7, R.z0 + 0.45), V3(R.x1, R.h - 0.7, R.z0 + 0.45), 0.08, Z.METAL, 8);
  k.pipe(L, V3(R.x0, R.h - 0.95, R.z0 + 0.45), V3(R.x1, R.h - 0.95, R.z0 + 0.45), 0.06, Z.ACCENT, 8);
  void dir;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bar "O Último Salto"
function buildBar(B) {
  const k = B.k, R = ROOMS.bar;
  B.room('bar', R, {
    sides: { w: [{ c: 62, w: 3.2, y0: 0, y1: 3.4 }], e: [{ c: 61, w: 24, y0: 0.6, y1: 4.0, glass: true }] },
    floorZone: Z.FLOOR, wallZone: Z.WALL, ceilZone: Z.LACQUER, amb: [0.05, 0.035, 0.03],
  });
  // painéis de madeira nas paredes (até 1,3 m) + friso de latão
  for (const [ax, a0, a1, f, n] of [['x', R.x0, R.x1, R.z0, 1], ['x', R.x0, R.x1, R.z1, -1], ['z', R.z0, R.z1, R.x0, 1]]) {
    const len = a1 - a0, c = (a0 + a1) / 2;
    const p = ax === 'x' ? V3(c, 0.65, f + n * 0.06) : V3(f + n * 0.06, 0.65, c);
    k.boxSeg(L, ax === 'x' ? len : 0.08, 1.3, ax === 'x' ? 0.08 : len, p, 1.5, null, Z.WOOD);
    const q = ax === 'x' ? V3(c, 1.32, f + n * 0.1) : V3(f + n * 0.1, 1.32, c);
    k.box(L, ax === 'x' ? len : 0.05, 0.05, ax === 'x' ? 0.05 : len, q, null, Z.BRASS);
    // ripas verticais na parte alta
    for (let t = a0 + 0.6; t < a1 - 0.3; t += 1.2) {
      const rp = ax === 'x' ? V3(t, 3.9, f + n * 0.05) : V3(f + n * 0.05, 3.9, t);
      k.box(L, ax === 'x' ? 0.08 : 0.06, 5.2, ax === 'x' ? 0.06 : 0.08, rp, null, Z.LACQUER);
    }
  }
  // teto com caixotões e faixas âmbar
  for (let x = R.x0 + 3.5; x < R.x1; x += 4.5) k.box(L, 0.4, 0.4, R.z1 - R.z0, V3(x, R.h - 0.25, (R.z0 + R.z1) / 2), null, Z.LACQUER);
  for (let z = R.z0 + 4.5; z < R.z1; z += 4.5) k.box(L, R.x1 - R.x0, 0.4, 0.4, V3((R.x0 + R.x1) / 2, R.h - 0.25, z), null, Z.LACQUER);
  for (let x = R.x0 + 3.5; x < R.x1; x += 4.5) k.box(L, 0.05, 0.03, R.z1 - R.z0, V3(x, R.h - 0.42, (R.z0 + R.z1) / 2), null, Z.GLOW_WARM);
  // tapete
  k.box(L, 12, 0.02, 14, V3(59, 0.01, 63), null, Z.CARPET);
  // balcão em L ao longo da parede sul
  const cz = 51.0, x0 = 49.5, x1 = 66;
  k.box(L, x1 - x0, 1.02, 0.7, V3((x0 + x1) / 2, 0.51, cz), null, Z.LACQUER);
  k.box(L, x1 - x0 + 0.3, 0.07, 0.95, V3((x0 + x1) / 2, 1.06, cz + 0.05), null, Z.WOOD);
  k.box(L, x1 - x0, 0.03, 0.04, V3((x0 + x1) / 2, 0.98, cz + 0.37), null, Z.GLOW_WARM);
  k.box(L, x1 - x0, 0.05, 0.02, V3((x0 + x1) / 2, 0.12, cz + 0.37), null, Z.GLOW_PINK);
  k.pipe(L, V3(x0, 0.22, cz + 0.62), V3(x1, 0.22, cz + 0.62), 0.03, Z.BRASS, 8);
  for (let x = x0 + 0.5; x < x1; x += 2) k.box(L, 0.04, 0.2, 0.04, V3(x, 0.12, cz + 0.62), null, Z.BRASS);
  // perna do L
  k.box(L, 0.7, 1.02, 4, V3(x1 + 0.35, 0.51, cz + 1.65), null, Z.LACQUER);
  k.box(L, 0.95, 0.07, 4.3, V3(x1 + 0.4, 1.06, cz + 1.65), null, Z.WOOD);
  k.box(L, 0.04, 0.03, 4, V3(x1 + 0.72, 0.98, cz + 1.65), null, Z.GLOW_WARM);
  B.col(V3((x0 + x1) / 2, 0.55, cz), V3((x1 - x0) / 2, 0.55, 0.4));
  B.col(V3(x1 + 0.35, 0.55, cz + 1.65), V3(0.4, 0.55, 2));
  for (let x = x0 + 1; x < x1; x += 1.6) stool(B, x, cz + 1.1);
  // copos e chopeira no balcão
  for (let i = 0; i < 7; i++) { const x = x0 + 1.2 + i * 2.2; k.cyl(L, 0.035, 0.03, 0.12, V3(x, 1.16, cz + 0.1), null, Z.GLASS, 10); }
  for (let i = 0; i < 3; i++) { k.cyl(L, 0.03, 0.03, 0.4, V3(58 + i * 0.35, 1.3, cz - 0.15), null, Z.BRASS, 8); k.sphere(L, 0.05, V3(58 + i * 0.35, 1.52, cz - 0.15), Z.TRIM, 8, 6); }
  // prateleira de garrafas
  backbar(B, 50, 65, R.z0 + 0.05, 1.2, 3, 'bar');
  k.box(L, 15.5, 1.0, 0.6, V3(57.5, 0.5, R.z0 + 0.4), null, Z.LACQUER);
  B.col(V3(57.5, 1.5, R.z0 + 0.4), V3(8, 1.5, 0.5));
  // letreiros
  B.sign('barNeon', 8, 1.0, V3(57.5, 3.6, R.z0 + 0.3), [0, 0, 0], 'neon');
  B.sign('open', 1.6, 0.4, V3(68.5, 2.6, R.z0 + 0.12), [0, 0, 0], 'neon');
  B.sign('news', 3.6, 1.8, V3(R.x0 + 0.12, 2.5, 68), [0, Math.PI / 2, 0], 'screen');
  B.sign('logo', 1.2, 1.2, V3(R.x0 + 0.12, 2.6, 55), [0, Math.PI / 2, 0], 'neon');
  B.lamp(V3(57.5, 3.4, R.z0 + 1.2), [1.0, 0.25, 0.6], 5, 8, 'bar');
  // cabines ao longo da janela
  B.spots.booths = [];
  for (const z of [51, 57.4, 63.8, 70.2]) B.spots.booths.push(booth(B, R.x1 - 1.8, z, Math.PI / 2, 2.4));
  for (const z of [51, 57.4, 63.8, 70.2]) pendant(B, R.x1 - 1.8, 2.15, z, R.h, [1.0, 0.6, 0.3], 'bar', 6, 0.05);
  // mesas redondas
  B.spots.tables = [V3(55, 0, 58), V3(61.5, 0, 57.5), V3(56.5, 0, 64.5), V3(63, 0, 65), V3(52.5, 0, 70.5), V3(60, 0, 71.5), V3(66.5, 0, 60.5)];
  for (const t of B.spots.tables) {
    roundTable(B, t.x, t.z);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + t.x; stool(B, t.x + Math.sin(a) * 1.0, t.z + Math.cos(a) * 1.0, 0.62); }
    pendant(B, t.x, 2.6, t.z, R.h, [1.0, 0.58, 0.28], 'bar', 9, 0.06);
    B.col(V3(t.x, 0.4, t.z), V3(0.55, 0.4, 0.55));
  }
  // plantas e jukebox holográfica
  plant(B, R.x1 - 0.9, R.z1 - 1.0, 1.1);
  plant(B, R.x1 - 0.9, R.z0 + 1.0, 1.0);
  plant(B, R.x0 + 1.0, R.z0 + 7.5, 1.0);
  k.cyl(L, 0.45, 0.55, 1.1, V3(R.x0 + 1.2, 0.55, 74.6), null, Z.LACQUER, 20);
  k.torus(L, 0.47, 0.02, V3(R.x0 + 1.2, 1.1, 74.6), Z.GLOW, 24, 4);
  B.holos.push({ geo: new THREE.IcosahedronGeometry(0.32, 1), pos: V3(R.x0 + 1.2, 1.65, 74.6), color: [1.2, 0.35, 1.4] });
  B.lamp(V3(R.x0 + 1.2, 1.8, 74.6), [0.9, 0.3, 1.0], 1.2, 4, 'bar');
  B.terminals.push({ id: 'jukebox', pos: V3(R.x0 + 1.2, 1.3, 74.6), label: 'Jukebox', sub: 'TROCAR A MÚSICA', panel: null, room: 'bar', music: true });
  B.col(V3(R.x0 + 1.2, 0.6, 74.6), V3(0.55, 0.6, 0.55));
  // luz da janela (reflexo do planeta) — pouca, fria
  B.lamp(V3(R.x1 - 1.0, 3.2, 62), [0.35, 0.55, 0.9], 6, 12, 'bar');
  // arandelas quentes nas paredes
  for (const z of [52, 58, 64, 72]) { k.box(L, 0.12, 0.5, 0.25, V3(R.x0 + 0.12, 2.6, z), null, Z.BRASS); k.box(L, 0.05, 0.4, 0.18, V3(R.x0 + 0.2, 2.6, z), null, Z.GLOW_WARM); B.lamp(V3(R.x0 + 0.5, 2.7, z), [1.0, 0.6, 0.3], 3, 5, 'bar'); }
  B.spots.bartender = V3(57.5, 0, 48.3);
  B.spots.barCam = V3(49, 1.62, 73.5);
  B.spots.iara = V3(R.x1 - 1.8 - 0.95, 0, 57.4);
  B.spots.counter = [V3(51.5, 0, 52.1), V3(54.7, 0, 52.1), V3(60.3, 0, 52.1), V3(63.5, 0, 52.1)];
}

// ═══════════════════════════════════════════════════════════════════════════
// Mercado / oficina / quadro de missões
function buildMarket(B) {
  const k = B.k, R = ROOMS.market;
  B.room('market', R, {
    sides: { e: [{ c: 62, w: 3.2, y0: 0, y1: 3.4 }], w: [{ c: 70, w: 22, y0: 1.0, y1: 6.6, glass: true }] },
    floorZone: Z.FLOOR, wallZone: Z.WALL, ceilZone: Z.TRIM, amb: [0.04, 0.04, 0.042],
  });
  // teto: grade de luminárias
  for (let x = R.x0 + 5; x < R.x1 - 2; x += 8) for (let z = R.z0 + 5; z < R.z1 - 2; z += 8) {
    k.box(L, 3.2, 0.12, 3.2, V3(x, R.h - 0.1, z), null, Z.TRIM);
    k.box(L, 2.8, 0.04, 2.8, V3(x, R.h - 0.18, z), null, Z.GLOW);
    B.lamp(V3(x, R.h - 0.8, z), [1.0, 0.94, 0.85], 6, 12, 'market');
  }
  // bancas (norte e sul)
  const stalls = [
    { x: -78, z: 80.8, rot: Math.PI, sign: 'stParts', col: Z.ACCENT },
    { x: -70, z: 80.8, rot: Math.PI, sign: 'stFood', col: Z.HAZARD },
    { x: -62, z: 80.8, rot: Math.PI, sign: 'stOre', col: Z.ACCENT },
    { x: -54, z: 80.8, rot: Math.PI, sign: 'stTech', col: Z.PAINT },
    { x: -62, z: 43.2, rot: 0, sign: 'stGuild', col: Z.ACCENT },
    { x: -54, z: 43.2, rot: 0, sign: 'stMed', col: Z.PAINT },
  ];
  for (const s of stalls) {
    k.push(mat(V3(s.x, 0, s.z), [0, s.rot, 0]));
    k.box(L, 6, 1.05, 0.9, V3(0, 0.52, 0.9), null, Z.LACQUER);
    k.box(L, 6.2, 0.06, 1.1, V3(0, 1.08, 0.95), null, Z.WOOD);
    k.box(L, 6, 0.04, 0.03, V3(0, 1.0, 1.45), null, Z.GLOW);
    k.box(L, 6, 2.6, 0.3, V3(0, 1.3, -0.9), null, Z.TRIM);
    for (let i = 0; i < 3; i++) k.box(L, 5.6, 0.05, 0.5, V3(0, 0.9 + i * 0.7, -0.6), null, Z.METAL);
    // toldo
    const g = new THREE.BoxGeometry(6.4, 0.06, 2.4);
    k.add(L, g, mat(V3(0, 3.0, 0.4), [0.28, 0, 0]), s.col);
    for (const sx of [-1, 1]) k.box(L, 0.08, 3.0, 0.08, V3(sx * 3.05, 1.5, 1.45), null, Z.TRIM);
    k.pop();
    // mercadorias nas prateleiras
    const rr = B.r;
    for (let i = 0; i < 14; i++) {
      const lx = -2.6 + rr() * 5.2, ly = 0.95 + Math.floor(rr() * 3) * 0.7;
      const p = V3(s.x + (s.rot ? -lx : lx), ly + 0.12, s.z + (s.rot ? 0.6 : -0.6));
      if (rr() < 0.5) k.box(L, 0.2 + rr() * 0.3, 0.24, 0.3, p, null, rr() < 0.5 ? Z.ACCENT : Z.TRIM);
      else k.cyl(L, 0.1, 0.1, 0.26, p, null, rr() < 0.5 ? Z.BRASS : Z.HAZARD, 10);
    }
    const sp = V3(s.x, 3.55, s.z + (s.rot ? -1.65 : 1.65));
    B.sign(s.sign, 3.4, 0.85, sp, [0, s.rot, 0], 'neon');
    B.lamp(V3(s.x, 2.6, s.z + (s.rot ? -1.4 : 1.4)), s.col === Z.HAZARD ? [1.0, 0.7, 0.3] : [0.6, 0.95, 1.0], 2.2, 6, 'market');
    B.col(V3(s.x, 1.3, s.z + (s.rot ? -0.0 : 0.0)), V3(3.1, 1.3, 1.5));
  }
  // quadro de missões: pilar holográfico de duas faces no centro
  const mb = V3(-62, 0, 62);
  k.box(L, 5.2, 0.3, 1.4, mb.clone().add(V3(0, 0.15, 0)), null, Z.TRIM);
  k.box(L, 5.0, 0.12, 1.2, mb.clone().add(V3(0, 0.32, 0)), null, Z.GLOW);
  for (const sx of [-1, 1]) k.box(L, 0.3, 4.4, 0.5, mb.clone().add(V3(sx * 2.45, 2.2, 0)), null, Z.TRIM);
  k.box(L, 5.2, 0.3, 0.6, mb.clone().add(V3(0, 4.5, 0)), null, Z.TRIM);
  B.sign('board', 4.5, 3.6, mb.clone().add(V3(0, 2.45, 0.08)), [0, 0, 0], 'screen');
  B.sign('board', 4.5, 3.6, mb.clone().add(V3(0, 2.45, -0.08)), [0, Math.PI, 0], 'screen');
  B.lamp(mb.clone().add(V3(0, 2.4, 1.6)), [0.35, 1.0, 0.9], 2.4, 7, 'market');
  B.lamp(mb.clone().add(V3(0, 2.4, -1.6)), [0.35, 1.0, 0.9], 2.4, 7, 'market');
  B.terminals.push({ id: 'missions', pos: mb.clone().add(V3(0, 1.6, 1.1)), label: 'Quadro de missões', sub: 'CONTRATOS DA GUILDA', panel: 'missions', room: 'market' });
  B.terminals.push({ id: 'missions2', pos: mb.clone().add(V3(0, 1.6, -1.1)), label: 'Quadro de missões', sub: 'CONTRATOS DA GUILDA', panel: 'missions', room: 'market' });
  B.col(mb.clone().add(V3(0, 2.2, 0)), V3(2.6, 2.2, 0.4));
  // terminais
  kiosk(B, -66, 46, 0, 'market', 'Terminal de comércio', 'COMPRAR E VENDER', 'market', 'market');
  kiosk(B, -50, 74, -Math.PI / 2, 'market2', 'Terminal de comércio', 'COMPRAR E VENDER', 'market', 'market');
  // oficina no canto oeste/sul: motor no cavalete, braço, painel de ferramentas
  const ws = V3(-77, 0, 50);
  k.box(L, 9, 0.06, 10, ws.clone().add(V3(0, 0.03, 0)), null, Z.HAZARD);
  k.box(L, 8.6, 0.08, 9.6, ws.clone().add(V3(0, 0.06, 0)), null, Z.GRATE);
  k.box(L, 3.2, 0.5, 1.6, ws.clone().add(V3(0, 0.6, 1)), null, Z.DARK);
  k.cyl(L, 0.9, 1.1, 3.2, ws.clone().add(V3(0, 1.85, 1)), [0, 0, Math.PI / 2], Z.METAL, 24);
  k.lathe(L, [[0.95, 0], [1.2, 0.4], [1.25, 0.9], [1.0, 1.0]], ws.clone().add(V3(1.6, 1.85, 1)), Z.METAL, 24, null, [0, 0, -Math.PI / 2]);
  k.torus(L, 1.05, 0.06, ws.clone().add(V3(-0.6, 1.85, 1)), Z.BRASS, 24, 6, null, [0, 0, Math.PI / 2]);
  k.torus(L, 1.05, 0.06, ws.clone().add(V3(0.4, 1.85, 1)), Z.BRASS, 24, 6, null, [0, 0, Math.PI / 2]);
  k.light(ws.clone().add(V3(2.7, 1.85, 1)), [2, 5, 9], 0.25, -0.4);
  k.box(L, 6, 3, 0.15, ws.clone().add(V3(0, 2.2, -4.6)), null, Z.GRATE);
  for (let i = 0; i < 10; i++) k.box(L, 0.08, 0.5 + (i % 3) * 0.2, 0.05, ws.clone().add(V3(-2.5 + i * 0.55, 2.4, -4.48)), null, i % 2 ? Z.ACCENT : Z.METAL);
  k.cyl(L, 0.6, 0.7, 0.5, ws.clone().add(V3(3, 0.25, -2)), null, Z.DARK, 16);
  k.beam(L, ws.clone().add(V3(3, 0.5, -2)), ws.clone().add(V3(2.6, 2.8, -0.6)), 0.35, Z.HAZARD);
  k.beam(L, ws.clone().add(V3(2.6, 2.8, -0.6)), ws.clone().add(V3(1.6, 2.6, 0.6)), 0.3, Z.HAZARD);
  B.lamp(ws.clone().add(V3(0, 3.5, 1)), [1.0, 0.85, 0.6], 4, 8, 'market');
  B.col(ws.clone().add(V3(0, 1.4, 1)), V3(2.2, 1.4, 1.3));
  kiosk(B, -71, 50, -Math.PI / 2, 'workshop', 'Oficina', 'REPAROS E MELHORIAS', 'workshop', 'market');
  B.sign('stWorkshop', 4.2, 1.0, V3(-77, 5.4, R.z0 + 0.25), [0, 0, 0], 'neon');
  // plantas e bancos
  plant(B, -48, 82, 1.2); plant(B, -48, 42, 1.2);
  for (const z of [56, 68]) { k.box(L, 2.4, 0.45, 0.6, V3(-70, 0.22, z), null, Z.LACQUER); k.box(L, 2.4, 0.08, 0.62, V3(-70, 0.48, z), null, Z.FABRIC); B.col(V3(-70, 0.25, z), V3(1.2, 0.25, 0.3)); }
  B.spots.oren = V3(-62, 0, 41.8);
  B.spots.vendors = [V3(-78, 0, 82.2), V3(-70, 0, 82.2), V3(-54, 0, 82.2), V3(-54, 0, 41.8)];
  B.spots.marketWalk = [V3(-50, 0, 58), V3(-56, 0, 70), V3(-68, 0, 74), V3(-74, 0, 62), V3(-66, 0, 52), V3(-56, 0, 50), V3(-58, 0, 64), V3(-72, 0, 68)];
  B.spots.marketCam = V3(-48.5, 1.65, 46);
}

// ═══════════════════════════════════════════════════════════════════════════
// Atlas de letreiros da estação
function makeAtlas() {
  const A = new SignAtlas(4, 16, 512, 128);
  A.add('barNeon', neonText('O ÚLTIMO SALTO', '#ff4fa8', { px: 92, glow: 30, italic: true }), 4, 2);
  A.add('open', neonText('ABERTO', '#5ff0ff', { px: 72 }), 1);
  A.add('toBar', neonText('BAR  ►', '#ffb347', { px: 70 }), 1);
  A.add('toMarket', neonText('◄  MERCADO', '#5fd0b8', { px: 60 }), 1);
  A.add('hangar03', paintedText('HANGAR 03', { fg: '#e6a62a', px: 200, weight: 900 }), 4, 2);
  A.add('pad03', paintedText('03', { fg: '#d9dde0', px: 118, weight: 900 }), 1);
  A.add('warn', paintedText('CUIDADO · CARGA SUSPENSA', { fg: '#141414', bg: '#d9a21c', px: 50 }), 2);
  A.add('noFire', paintedText('PROIBIDO ARMAS', { fg: '#f2ede2', bg: '#b3261e', px: 58 }), 2);
  A.add('stParts', neonText('PEÇAS', '#5ff0ff', { px: 76 }), 1);
  A.add('stFood', neonText('RAÇÕES', '#ffb347', { px: 76 }), 1);
  A.add('stOre', neonText('MINÉRIOS', '#9dff6a', { px: 70 }), 1);
  A.add('stTech', neonText('ELETRÔNICOS', '#c07bff', { px: 58 }), 1);
  A.add('stGuild', neonText('GUILDA · CÂMBIO', '#5fd0b8', { px: 50 }), 1);
  A.add('stMed', neonText('MÉDICO', '#ff6a6a', { px: 76 }), 1);
  A.add('stWorkshop', neonText('OFICINA', '#ffd27a', { px: 76 }), 1);
  A.add('news', screenPanel('CANAL DA FENDA', [['Hegemonia anuncia novo pedágio de salto', ''], ['Frota de Varela vista perto de Halden', ''], ['Desertor procurado: 100.000 ¢', ''], ['Comboio da Guilda chega a Tharsos', ''], ['Tempestade de íons no Cinturão', ''], ['Ruínas em Verídia "respondem"?', '']], { px: 28 }), 2, 2);
  A.add('board', screenPanel('CONTRATOS · ESTAÇÃO MERIDIANA', [['Escolta: cargueiro até Tharsos', '4.200 ¢'], ['Recompensa: Navalha "Corvo-3"', '7.800 ¢'], ['Entrega: peças para Ashar', '2.100 ¢'], ['Resgate: sinal de socorro, Cinturão', '5.400 ¢'], ['Exploração: ruínas de Ossário', '6.000 ¢'], ['Coleta: hélio-3 em Tharsos', '3.300 ¢'], ['Sabotagem: posto de pedágio', '9.500 ¢']], { px: 26 }), 2, 2);
  A.add('logo', guildLogo('#5fd0b8'), 1, 1);
  return A;
}

// ═══════════════════════════════════════════════════════════════════════════
/** Luz assada: soma das luminárias da sala de cada vértice + oclusão de canto. */
function bake(geo, lamps, rooms) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const out = new Float32Array(p.count * 3);
  const roomOf = (x, y, z) => {
    for (const r of rooms) if (x >= r.min.x - 0.6 && x <= r.max.x + 0.6 && z >= r.min.z - 0.6 && z <= r.max.z + 0.6 && y >= -0.6 && y <= r.max.y + 0.6) return r;
    return null;
  };
  const byRoom = new Map();
  for (const l of lamps) { if (!byRoom.has(l.room)) byRoom.set(l.room, []); byRoom.get(l.room).push(l); }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const r = roomOf(x, y, z);
    let cr = 0.006, cg = 0.006, cb = 0.007;
    if (r) {
      cr = r.amb[0]; cg = r.amb[1]; cb = r.amb[2];
      for (const l of byRoom.get(r.name) || []) {
        const dx = l.pos.x - x, dy = l.pos.y - y, dz = l.pos.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > l.range * l.range) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const ndl = (nx * dx + ny * dy + nz * dz) / d;
        const wrap = Math.max(0, (ndl + 0.15) / 1.15);
        if (wrap <= 0) continue;
        const win = Math.max(0, 1 - (d / l.range) ** 4) ** 2;
        const e = l.intensity * wrap * win / (d2 + 0.6);
        cr += l.color[0] * e; cg += l.color[1] * e; cb += l.color[2] * e;
      }
      // oclusão de canto: perto do piso, do teto e das paredes da sala
      const dw = Math.min(x - r.min.x, r.max.x - x, z - r.min.z, r.max.z - z);
      const fy = Math.min(y, r.max.y - y);
      const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, Math.min(dw * 0.9 + 0.12, 1)) * 0.5 + Math.min(1, Math.max(0, fy) * 0.8) * 0.5);
      const k = ny > 0.7 ? 0.62 + 0.38 * Math.min(1, dw / 1.4) : ao;
      cr *= k; cg *= k; cb *= k;
    }
    out[i * 3] = cr; out[i * 3 + 1] = cg; out[i * 3 + 2] = cb;
  }
  geo.setAttribute('aBake', new THREE.BufferAttribute(out, 3));
}

/** Material das garrafas: vidro colorido retroiluminado (matiz pela semente). */
function bottleMaterial(pool) {
  const m = new THREE.MeshStandardNodeMaterial();
  const info = attribute('aInfo', 'vec3');
  const hue = info.y;
  const c = vec3(sin(hue.mul(6.283)).mul(0.5).add(0.5), sin(hue.mul(6.283).add(2.1)).mul(0.5).add(0.5), sin(hue.mul(6.283).add(4.2)).mul(0.5).add(0.5));
  const tint = mix(vec3(0.55, 0.32, 0.08), c, 0.55);
  m.colorNode = tint.mul(0.12);
  m.roughnessNode = float(0.06);
  m.metalnessNode = float(0.0);
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  m.emissiveNode = tint.mul(pow(facing, 1.5).mul(1.6).add(0.15));
  m.envNode = vec3(0.02, 0.02, 0.025);
  m.lightsNode = tslLights(pool);
  return m;
}

/** Placas pintadas: textura do atlas iluminada como a parede (luz assada média). */
function paintMaterial(tex, pool, gain = 0.55) {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const tx = texture(tex, uv());
  const wear = vnoise(positionLocal.mul(7.0)).mul(0.6).add(vnoise(positionLocal.mul(29.0)).mul(0.4));
  m.colorNode = tx.rgb;
  m.opacityNode = tx.a.mul(smoothstep(0.2, 0.45, wear)).mul(0.95);
  m.roughnessNode = float(0.6);
  m.emissiveNode = tx.rgb.mul(gain);
  m.envNode = vec3(0.01);
  m.lightsNode = tslLights(pool);
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════
export class Interior {
  constructor(ctx, view) {
    this.ctx = ctx; this.view = view;
    this.built = false; this.active = false; this.visible = false;
    this.group = new THREE.Group(); this.group.name = 'interior-meridiana';
    this.group.position.set(0, MERIDIANA.floorY, 0);
    this.colFrame = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.shapes = [];
    this.pool = [];
    this.mats = [];
    this.crowd = null;
    this.hangarLights = [];
    this.near = null;
    this.t = 0;
  }

  get up() { return this.view.dirToWorld(V3(0, 1, 0), new THREE.Vector3()); }
  /** Convés → mundo. */
  toWorld(p, out = new THREE.Vector3()) { return this.view.toWorld(V3(p.x, p.y + MERIDIANA.floorY, p.z), out); }
  toDeck(w, out = new THREE.Vector3()) { this.view.toLocal(w, out); out.y -= MERIDIANA.floorY; return out; }
  /** Ponto de nascimento a pé (ao lado da nave na plataforma), em mundo. */
  spawnWorld(out = new THREE.Vector3()) { return this.toWorld(V3(-6, 0.05, 104), out); }
  get rooms() { return this.B?.rooms || []; }
  get terminals() { return this.B?.terminals || []; }
  get bounds() { return { min: V3(-84, 0, 40), max: V3(80, 26, 130) }; }

  build() {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx, lite = ctx.quality.name === 'mobile';
    const B = new Builder(2387);
    this.B = B;
    buildHangar(B);
    buildCorridor(B, 'corrE', ROOMS.corrE, 1);
    buildCorridor(B, 'corrW', ROOMS.corrW, -1);
    buildBar(B);
    buildMarket(B);
    // luzes reais (fora da cena): pool que acompanha o jogador
    const n = POOL[ctx.quality.name] ?? 4;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.castShadow = false; l.matrixAutoUpdate = false; l.matrixWorldAutoUpdate = false;
      this.pool.push(l);
    }
    const sun = ctx.services.rendering?.sun?.light || null;
    const matRooms = makeInteriorMaterial('guilda', { lite, pool: this.pool });
    this.mats.push(matRooms);
    this.mat = matRooms;
    // hangar: também recebe o sol pela boca
    const matHangar = makeInteriorMaterial('guilda', { lite, pool: sun ? [sun, ...this.pool] : this.pool });
    this.mats.push(matHangar);
    // separa a geometria do hangar das salas (o hangar recebe sol)
    const geo = B.k.merge(L);
    bake(geo, B.lamps, B.rooms);
    // divide por posição: hangar = z ≥ 49.6 e |x| ≤ 32.5
    const split = splitGeometry(geo, (x, y, z) => z >= 49.5 && x >= -32.5 && x <= 32.5);
    const mkMesh = (g, m, name) => { if (!g) return; const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = true; o.receiveShadow = true; this.group.add(o); return o; };
    mkMesh(split.a, matHangar, 'hangar');
    this.mainMesh = mkMesh(split.b, matRooms, 'salas');
    // luzes pequenas (lâmpadas, LEDs)
    const lm = makeLightsMaterial({ minPx: 0.0012, gain: 1 });
    this.mats.push(lm);
    const lg = lightsGeometry(B.k.lights);
    if (lg) { const o = new THREE.Mesh(lg, lm); o.renderOrder = 5; o.frustumCulled = false; this.group.add(o); }
    // garrafas
    const bg = B.bottles.merge('b');
    if (bg) { const bm = bottleMaterial(this.pool); this.mats.push(bm); const o = new THREE.Mesh(bg, bm); o.name = 'garrafas'; this.group.add(o); }
    // vidros
    const gm = makeGlassMaterial({ opacity: 0.12 });
    this.mats.push(gm);
    for (const gl of B.glass) { const o = new THREE.Mesh(new THREE.PlaneGeometry(gl.w, gl.h), gm); o.position.copy(gl.pos); o.rotation.set(...gl.rot); o.renderOrder = 6; this.group.add(o); }
    // cones de luz volumétrica falsa
    if (!lite) {
      const cmats = new Map();
      for (const c of B.cones) {
        const key = c.color.join(',') + c.k;
        if (!cmats.has(key)) { const m = makeConeMaterial(c.color, c.k); cmats.set(key, m); this.mats.push(m); }
        const o = new THREE.Mesh(new THREE.CylinderGeometry(c.r0, c.r1, c.h, 24, 1, true), cmats.get(key));
        o.position.set(c.pos.x, c.pos.y - c.h / 2, c.pos.z); o.renderOrder = 4;
        this.group.add(o);
      }
    }
    // letreiros
    const atlas = makeAtlas();
    this.atlas = atlas;
    const tex = atlas.texture();
    const neon = makeSignMaterial(tex, { gain: 3.2, flicker: 0.06, additive: true });
    const screen = makeSignMaterial(tex, { gain: 1.25, flicker: 0.03, additive: false, scan: 90 });
    const paint = paintMaterial(tex, this.pool, 0.45);
    const floorPaint = paintMaterial(tex, this.pool, 0.6);
    this.mats.push(neon, screen, paint, floorPaint);
    for (const s of B.signs) {
      const g = atlas.plane(s.name, s.w, s.h);
      const m = s.kind === 'neon' ? neon : s.kind === 'screen' ? screen : s.kind === 'floor' ? floorPaint : paint;
      const o = new THREE.Mesh(g, m);
      o.position.copy(s.pos); o.rotation.set(...s.rot);
      o.renderOrder = s.kind === 'neon' ? 7 : 3;
      this.group.add(o);
      if (s.kind === 'neon') B.lamp(s.pos.clone().add(V3(0, -0.3, 0)), [0.9, 0.4, 0.7], 0.6, 4, null);
    }
    // hologramas
    for (const h of B.holos) {
      const hm = makeHoloMaterial(h.color, { lines: 9 });
      this.mats.push(hm);
      const o = new THREE.Mesh(h.geo, hm); o.position.copy(h.pos); o.userData.spin = true; this.group.add(o);
    }
    // campo de contenção visto de dentro
    const fm = makeFieldMaterial([0.25, 0.75, 1.0]);
    this.mats.push(fm);
    {
      const R = ROOMS.hangar;
      const g = new THREE.PlaneGeometry(R.x1 * 2 - 4.4, R.h - 2.2);
      const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 60, uvA.getY(i) * 24);
      const o = new THREE.Mesh(g, fm); o.position.set(0, (R.h - 2.2) / 2, R.z1 - 0.3); o.renderOrder = 7; this.group.add(o);
    }
    // NPCs
    this.crowd = new Crowd(ctx, this, B.spots, this.pool);
    this.group.add(this.crowd.group);
    // luzes de cena do hangar (iluminam a nave estacionada e os NPCs)
    if (!lite) {
      for (const p of [V3(-8, 18, 88), V3(9, 14, 108)]) {
        const l = new THREE.PointLight(0xdfe8ff, 0, 60, 1.6);
        l.castShadow = false;
        l.position.copy(p);
        this.group.add(l);
        this.hangarLights.push(l);
      }
    }
    this.view.group.add(this.group);
    this.group.updateMatrixWorld(true);
    this.refreshLights(V3(0, 1.7, 100));
  }

  /** Registra os colisores (entrar a pé). */
  activate() {
    this.build();
    if (this.active) return;
    this.active = true;
    this.syncFrame();
    for (const c of this.B.cols) this.shapes.push(this.ctx.collision.addBox({ frame: this.colFrame, center: c.center, half: c.half, tag: 'estacao:interior' }));
  }
  deactivate() {
    if (!this.active) return;
    this.active = false;
    for (const s of this.shapes) s.remove();
    this.shapes = [];
  }
  syncFrame() {
    this.colFrame.quat.copy(this.view.frame.quat);
    this.view.toWorld(V3(0, MERIDIANA.floorY, 0), this.colFrame.pos);
  }

  /** Sala que contém um ponto do convés. */
  roomAt(p) {
    for (const r of this.rooms) if (p.x >= r.min.x - 0.3 && p.x <= r.max.x + 0.3 && p.z >= r.min.z - 0.3 && p.z <= r.max.z + 0.3 && p.y > -1 && p.y < r.max.y + 1) return r;
    return null;
  }

  refreshLights(eye) {
    if (!this.pool.length) return;
    const lamps = this.B.lamps;
    const sorted = lamps.map((l) => [l, l.pos.distanceToSquared(eye) / Math.max(0.2, l.intensity)]).sort((a, b) => a[1] - b[1]);
    this.pool.forEach((pl, i) => {
      const e = sorted[i]; if (!e) { pl.intensity = 0; return; }
      const l = e[0];
      pl.position.copy(l.pos); pl.color.setRGB(l.color[0], l.color[1], l.color[2]);
      pl.intensity = l.intensity * 1.6; pl.distance = l.range;
    });
    this.syncPool();
  }
  syncPool() {
    const g = this.group;
    g.updateWorldMatrix(true, false);
    for (const l of this.pool) { l.matrix.makeTranslation(l.position.x, l.position.y, l.position.z); l.matrixWorld.multiplyMatrices(g.matrixWorld, l.matrix); }
  }

  frame(dt, ctx, dist) {
    this.t += dt;
    const show = dist < 6000;
    if (show && !this.built) this.build();
    if (!this.built) return;
    if (show !== this.visible) {
      this.visible = show;
      this.group.visible = show;
      if (this.view.bay0Cavity) this.view.bay0Cavity.visible = !show;
    }
    if (!show) { for (const l of this.hangarLights) l.intensity = 0; return; }
    const eye = this.toDeck(ctx.player.camWorld, new THREE.Vector3());
    this.eye = eye;
    // luzes próprias perto do olho (reordena a cada ~0,25 s)
    this._lt = (this._lt || 0) - dt;
    if (this._lt <= 0) { this._lt = 0.25; this.refreshLights(eye); }
    else this.syncPool();
    // luzes de cena do hangar: só com a câmera dentro/perto
    const inHangar = eye.z > 40 && eye.z < 200 && Math.abs(eye.x) < 60 && eye.y > -10 && eye.y < 60;
    for (const l of this.hangarLights) l.intensity = inHangar ? 260 : 0;
    // NPCs
    this.crowd?.frame(dt, ctx, eye);
    for (const o of this.group.children) if (o.userData.spin) { o.rotation.y += dt * 0.8; o.rotation.x = Math.sin(this.t * 0.7) * 0.3; }
    // no mobile (sem pool) a luz assada já basta
    void dt;
  }

  /** Lógica (passo fixo): interações por proximidade quando a pé aqui dentro. */
  update(dt, ctx) {
    if (!this.active || ctx.game.mode !== 'foot') { this.near = null; return; }
    this.syncFrame();
    const eye = this.toDeck(ctx.player.camWorld, new THREE.Vector3());
    // saiu do interior (pela nave) → desativa
    if (!this.roomAt(V3(eye.x, eye.y - 1.6, eye.z)) && eye.distanceTo(V3(0, 0, 94)) > 60) { this.deactivate(); return; }
    const fwd = V3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    const fwdL = fwd.applyQuaternion(this.view.frame.quat.clone().invert());
    let best = null, bs = -Infinity;
    const cand = [...this.terminals.map((t) => ({ kind: 'terminal', ref: t, pos: t.pos })), ...(this.crowd?.talkables() || [])];
    for (const c of cand) {
      const d = c.pos.clone().sub(eye); const dist = d.length();
      if (dist > 2.6) continue;
      const s = d.normalize().dot(fwdL) - dist * 0.1;
      if (s > 0.35 && s > bs) { bs = s; best = c; }
    }
    this.near = best;
    const hud = ctx.services.hud;
    if (best) {
      const label = best.kind === 'terminal' ? best.ref.label : best.ref.name;
      const sub = best.kind === 'terminal' ? best.ref.sub : best.ref.role;
      try { hud?.prompt?.(label.toUpperCase(), { id: 'stations', sub, action: 'interact', ttl: 0.25 }); } catch { /* */ }
      // sem o sistema `foot`, a tecla de interagir é nossa
      if (!ctx.services.foot && ctx.input.pressed('interact')) this.use(best);
    }
  }

  use(c) {
    const ctx = this.ctx, hud = ctx.services.hud;
    if (!c) return;
    if (c.kind === 'terminal') {
      const t = c.ref;
      if (t.music) { ctx.bus.emit('music', { mood: 'station', intensity: 0.6 }); ctx.bus.emit('notify', { text: 'JUKEBOX: "NOITES NA FENDA" — TOCANDO', kind: 'info' }); return; }
      if (hud?.openPanel) hud.openPanel(t.panel, { station: this.view.st, terminal: t.id });
      else ctx.bus.emit('notify', { text: t.label.toUpperCase() + ' — INDISPONÍVEL', kind: 'warn' });
      return;
    }
    if (c.kind === 'npc') this.crowd.talk(c.ref, this.view.st);
  }

  dispose() {
    this.deactivate();
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    this.crowd?.dispose();
    this.atlas?.tex?.dispose();
  }
}

/** Divide uma geometria indexada em duas pelo centróide dos triângulos. */
function splitGeometry(geo, test) {
  const idx = geo.index.array, p = geo.attributes.position;
  const A = [], Bv = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    (test(x, y, z) ? A : Bv).push(a, b, c);
  }
  const mk = (list) => {
    if (!list.length) return null;
    const g = geo.clone();
    g.setIndex(list);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  };
  return { a: mk(A), b: mk(Bv) };
}

void vec4; void uniform; void max; void normalWorld; void time;
