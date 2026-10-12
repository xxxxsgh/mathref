// Estruturas de superfície: postos avançados, naves caídas, bunkers e as
// ruínas dos Arquitetos (arquitetura alienígena monumental com quebra-cabeça
// de luz e porta antiga). Posicionadas de forma determinística em cada corpo
// pousável (procura de terreno plano pelo serviço `planets`), vivem no
// referencial LOCAL do planeta (giram com ele) e só viram malha quando a
// câmera chega a ~30 km.
import * as THREE from 'three/webgpu';
import { Kit, V3, mat, rng, lightsGeometry } from './geo.js';
import { ZONE as Z, makeHullMaterial, makeLightsMaterial, makeHoloMaterial, makeConeMaterial } from './materials.js';
import { greebleRect, dish, mast, solarWing, lightRing, portholes } from './modules.js';

const L = 'hull';
const TAU = Math.PI * 2;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** Plano de estruturas por corpo (sistemas especiais têm nomes próprios). */
const PLAN = {
  'Verídia': [['ruins', 'Santuário dos Arquitetos', 'vigilantes'], ['outpost', 'Posto de Pesquisa Lumen', 'guilda'], ['wreck', 'Cargueiro Caído', 'hegemonia']],
  'Ashar': [['outpost', 'Posto Avançado Ashar', 'frente'], ['bunker', 'Bunker de Pedágio', 'hegemonia'], ['wreck', 'Destroços do Tributo', 'hegemonia']],
  'Nivália': [['bunker', 'Estação Glacial Vesper', 'guilda'], ['wreck', 'Explorador Perdido', 'guilda']],
  'Ossário': [['ruins', 'Necrópole dos Arquitetos', 'vigilantes']],
  'Brasa': [['outpost', 'Mina de Brasa', 'guilda']],
};

function tangentQuat(up, yaw) {
  const ref = Math.abs(up.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  const x = V3().crossVectors(ref, up).normalize();
  const z = V3().crossVectors(x, up).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw));
}

// ═══════════════════════════════════════════════════════════════════════════
// Construtores (espaço local da estrutura: Y = cima, chão em y = 0)

/** Ruínas dos Arquitetos: plataforma em terraços, portal anelar com fragmentos flutuantes, obelisco, colunata e o quebra-cabeça de luz. */
function buildRuins(k, s, lite) {
  const r = k.r;
  // terraços (descem 14 m para dentro do chão: escondem a irregularidade do relevo)
  const T = [[86, 2.2], [70, 4.4], [54, 6.6]];
  for (const [w, top] of T) {
    const H = 14 + top;
    k.box(L, w, H, w, V3(0, top - H / 2, 0), null, Z.ALIEN);
    // friso luminoso no contorno (logo abaixo da borda)
    for (const [dx, dz, lx, lz] of [[0, w / 2, w, 0.3], [0, -w / 2, w, 0.3], [w / 2, 0, 0.3, w], [-w / 2, 0, 0.3, w]]) k.box(L, lx + 0.1, 0.22, lz + 0.1, V3(dx, top - 0.45, dz), null, Z.ALIEN_GLOW);
  }
  // escadarias nos quatro lados
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    k.push(mat(V3(0, 0, 0), [0, a, 0]));
    for (let j = 0; j < 12; j++) k.box(L, 12, 0.55, 1.2, V3(0, j * 0.55 + 0.27, 43 + 2 - j * 1.2), null, Z.ALIEN);
    for (const sx of [-1, 1]) k.box(L, 1.6, 7, 16, V3(sx * 6.8, 3.5 - 1.5, 37), null, Z.ALIEN);
    k.pop();
  }
  // portal anelar (60 m) com segmentos e o "olho"
  const top = 6.6;
  k.push(mat(V3(0, top, -6), null));
  const R = 22;
  for (let i = 0; i < 18; i++) {
    if (i === 4 || i === 11) continue; // quebrado
    const a0 = (i / 18) * TAU, a1 = ((i + 1) / 18) * TAU - 0.03;
    const am = (a0 + a1) / 2;
    const p = V3(Math.cos(am) * R, Math.sin(am) * R + R + 2, 0);
    const g = new THREE.BoxGeometry(2 * R * Math.sin((a1 - a0) / 2) * 1.02, 4.2, 5);
    k.add(L, g, mat(p, [0, 0, am + Math.PI / 2]), Z.ALIEN);
    k.add(L, new THREE.BoxGeometry(2 * R * Math.sin((a1 - a0) / 2) * 0.9, 0.4, 5.3), mat(V3(Math.cos(am) * (R - 2.1), Math.sin(am) * (R - 2.1) + R + 2, 0), [0, 0, am + Math.PI / 2]), Z.ALIEN_GLOW);
  }
  // pilares do portal
  for (const sx of [-1, 1]) {
    k.box(L, 7, 14, 8, V3(sx * (R + 1), 7, 0), null, Z.ALIEN);
    k.box(L, 7.6, 0.5, 8.6, V3(sx * (R + 1), 14.2, 0), null, Z.ALIEN_GLOW);
    for (let j = 0; j < 4; j++) k.box(L, 0.3, 10, 0.3, V3(sx * (R + 1) - sx * 3.6, 6 + 0, -3 + j * 2), null, Z.ALIEN_GLOW);
  }
  // núcleo: esfera suspensa
  k.sphere(L, 3.2, V3(0, R + 2, 0), Z.ALIEN_GLOW, 32, 20);
  k.torus(L, 5.4, 0.25, V3(0, R + 2, 0), Z.ALIEN_GLOW, 64, 6, null, [Math.PI / 2, 0, 0]);
  k.light(V3(0, R + 2, 0), [3, 7, 14], 2.6, -0.15);
  k.pop();
  // porta antiga ao fundo (lacrada) entre dois pilões
  k.push(mat(V3(0, top, -26), null));
  for (const sx of [-1, 1]) {
    k.lathe(L, [[5, 0], [4.4, 16], [2.6, 24], [0.4, 28]], V3(sx * 10, 0, 0), Z.ALIEN, 6);
    k.light(V3(sx * 10, 28.4, 0), [3, 7, 14], 0.6, -0.3);
  }
  k.box(L, 26, 4, 6, V3(0, 20, 0), null, Z.ALIEN);
  k.box(L, 26.4, 0.4, 6.4, V3(0, 18.2, 0), null, Z.ALIEN_GLOW);
  k.pop();
  // obelisco
  k.lathe(L, [[4.2, 0], [3.8, 8], [2.6, 30], [1.6, 46], [0.05, 52]], V3(30, top - 2.2, 26), Z.ALIEN, 5, null, [0, 0.3, 0]);
  k.light(V3(30, top + 47, 26), [3, 7, 14], 0.9, -0.2);
  // colunata hexagonal (algumas tombadas)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI - Math.PI * 0.05;
    const p = V3(Math.cos(a) * 34 - 4, top - 4.4, Math.sin(a) * 34 * 0.6 + 8);
    const fallen = i === 3 || i === 7;
    if (fallen) k.cyl(L, 1.4, 1.5, 15, p.clone().add(V3(4, 1.3, 2)), [Math.PI / 2 - 0.08, a, 0.1], Z.ALIEN, 6);
    else {
      const h = 10 + r() * 8;
      k.cyl(L, 1.4, 1.6, h, p.clone().add(V3(0, h / 2, 0)), null, Z.ALIEN, 6);
      k.cyl(L, 1.9, 1.9, 0.8, p.clone().add(V3(0, h + 0.4, 0)), null, Z.ALIEN, 6);
      k.cyl(L, 1.62, 1.62, 0.3, p.clone().add(V3(0, h * 0.62, 0)), null, Z.ALIEN_GLOW, 6);
    }
  }
  // blocos caídos/semienterrados ao redor
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = 48 + r() * 50;
    const sz = 1.5 + r() * 5;
    k.box(L, sz * (1 + r()), sz, sz * (0.6 + r()), V3(Math.cos(a) * d, s.gy(Math.cos(a) * d, Math.sin(a) * d) + sz * 0.15 - 0.6, Math.sin(a) * d), [r() * 0.6, r() * TAU, r() * 0.5], Z.ALIEN);
  }
  // pedestais do quebra-cabeça (três prismas)
  const prisms = [V3(-14, top, 4), V3(14, top, 4), V3(0, top, 16)];
  for (const p of prisms) {
    k.cyl(L, 1.3, 1.6, 1.2, p.clone().add(V3(0, 0.6, 0)), null, Z.ALIEN, 6);
    k.cyl(L, 1.35, 1.35, 0.12, p.clone().add(V3(0, 1.22, 0)), null, Z.ALIEN_GLOW, 6);
  }
  return { top, prisms, door: V3(0, top, -26), portal: V3(0, top + R + 2, -6) };
}

/** Posto avançado modular (habitação, torre, pátio de pouso, tanques, painéis). */
function buildOutpost(k, s, lite) {
  const r = k.r;
  // laje/plataforma (desce para dentro do chão)
  k.box(L, 64, 6, 46, V3(0, -2.6, 0), null, Z.CONCRETE);
  k.box(L, 64.4, 0.25, 46.4, V3(0, 0.3, 0), null, Z.DARK);
  // módulos de habitação (cilindros deitados com janelas)
  const hab = (p, len, yaw, zone = Z.PAINT) => {
    k.push(mat(p, [0, yaw, 0]));
    k.cyl(L, 2.6, 2.6, len, V3(0, 2.9, 0), [0, 0, Math.PI / 2], zone, 24);
    for (const sx of [-1, 1]) k.cyl(L, 2.75, 2.75, 0.5, V3(sx * (len / 2 - 0.4), 2.9, 0), [0, 0, Math.PI / 2], Z.DARK, 24);
    for (let i = 0; i < 3; i++) k.cyl(L, 2.68, 2.68, 0.2, V3(-len / 2 + (i + 1) * len / 4, 2.9, 0), [0, 0, Math.PI / 2], Z.ACCENT, 24);
    k.box(L, len - 2, 0.9, 0.3, V3(0, 3.4, 2.5), null, Z.WINDOW);
    k.box(L, len - 2, 0.9, 0.3, V3(0, 3.4, -2.5), null, Z.WINDOW);
    for (const sx of [-1, 1]) k.box(L, 0.6, 0.6 + 0.3, 4, V3(sx * (len / 2 - 2), 0.45, 0), null, Z.DARK);
    greebleRect(k, L, V3(0, 5.5, 0), V3(1, 0, 0), V3(0, 0, 1), V3(0, 1, 0), len - 3, 2.6, 0.5, 0.35);
    k.light(V3(len / 2 + 0.1, 4.4, 0), [12, 8, 4], 0.3, 0);
    k.pop();
  };
  hab(V3(-14, 0.4, -10), 16, 0);
  hab(V3(-14, 0.4, 2), 16, 0, Z.ACCENT);
  hab(V3(6, 0.4, -14), 12, Math.PI / 2);
  // ligação (túnel)
  k.box(L, 3.2, 3, 6, V3(-14, 2.4, -4), null, Z.DARK);
  // cúpula de comando com vidro
  k.cyl(L, 5, 5.4, 3, V3(8, 1.9, 4), null, Z.PAINT, 32);
  k.sphere(L, 5, V3(8, 3.4, 4), Z.GLASS, 32, 12, null, TAU, Math.PI / 2);
  k.torus(L, 5.05, 0.18, V3(8, 3.4, 4), Z.DARK, 48, 6);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.beam(L, V3(8 + Math.cos(a) * 5, 3.4, 4 + Math.sin(a) * 5), V3(8, 8.4, 4), 0.14, Z.DARK); }
  k.light(V3(8, 3.0, 4), [6, 4.2, 2.4], 1.6, 0);
  // torre de comunicação
  mast(k, L, V3(22, 0.4, -12), V3(0, 1, 0), 32, 1.1);
  dish(k, L, V3(18, 9, -16), V3(0.4, 1, -0.3).normalize(), 4.2);
  k.cyl(L, 0.5, 0.7, 9, V3(18, 4.5, -16), null, Z.DARK, 10);
  // pátio de pouso
  k.cyl(L, 11, 11.4, 0.3, V3(14, 0.55, 12), null, Z.DARK, 40);
  k.torus(L, 10.4, 0.1, V3(14, 0.72, 12), Z.HAZARD, 64, 4);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; k.light(V3(14 + Math.cos(a) * 11.2, 0.8, 12 + Math.sin(a) * 11.2), [1.0, 6, 3], 0.12, -0.6, i / 16); }
  // tanques e contêineres
  for (let i = 0; i < 3; i++) { k.cyl(L, 1.8, 1.8, 6, V3(-27, 3.4, -16 + i * 4.2), null, Z.METAL, 20); k.sphere(L, 1.8, V3(-27, 6.4, -16 + i * 4.2), Z.METAL, 16, 8); k.box(L, 2, 0.6, 2, V3(-27, 0.6, -16 + i * 4.2), null, Z.DARK); }
  for (let i = 0; i < 5; i++) k.box(L, 6, 2.6, 2.5, V3(-2 + (i % 3) * 0.4, 1.7 + Math.floor(i / 3) * 2.6, 16 + (i % 3) * 2.7), [0, r() * 0.1, 0], i % 2 ? Z.ACCENT : Z.RUST);
  // campo solar
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const p = V3(-38 - j * 7, 0, -10 + i * 8); p.y = s.gy(p.x, p.z) + 1.6;
    k.box(L, 6, 0.15, 3.4, p.clone().add(V3(0, 1.0, 0)), [0.5, 0, 0], Z.SOLAR);
    k.box(L, 0.2, 1.6, 0.2, p.clone(), null, Z.DARK);
  }
  // postes de holofote (luzes quentes) + cones
  for (const p of [V3(-30, 0.4, 20), V3(26, 0.4, 20), V3(26, 0.4, -20), V3(-30, 0.4, -22)]) {
    p.y = Math.min(0.4, s.gy(p.x, p.z));
    k.cyl(L, 0.18, 0.24, 9, p.clone().add(V3(0, 4.5, 0)), null, Z.DARK, 8);
    k.box(L, 1.2, 0.5, 0.6, p.clone().add(V3(0, 9.1, 0)), null, Z.DARK);
    k.light(p.clone().add(V3(0, 8.8, 0)), [14, 11, 7], 0.35, 0);
  }
  // barreiras
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    const p = V3(Math.cos(a) * 40, 0, Math.sin(a) * 30); p.y = s.gy(p.x, p.z) + 0.45;
    k.box(L, 3, 1.2, 0.6, p, [0, -a + Math.PI / 2, 0], i % 4 ? Z.CONCRETE : Z.HAZARD);
  }
  lightRing(k, 8.6, 5.2, 12, [1.0, 4, 3], 0.08, 0);
  // tubos pressurizados entre os módulos
  k.cylX(L, 1.2, 10, V3(-1, 2.4, -10), Z.DARK, 16);
  k.cylX(L, 1.2, 8, V3(-2, 2.4, 2), Z.DARK, 16);
  for (const x of [-4, 2]) { k.torus(L, 1.25, 0.12, V3(x, 2.4, -10), Z.ACCENT, 20, 4, null, [0, 0, Math.PI / 2]); }
  // veículo de superfície (rover)
  k.push(mat(V3(-6, 0.4, 12), [0, 0.6, 0]));
  k.box(L, 2.6, 1.2, 4.8, V3(0, 1.4, 0), null, Z.ACCENT);
  k.box(L, 2.2, 0.9, 2, V3(0, 2.4, 0.9), null, Z.PAINT);
  k.box(L, 2.0, 0.6, 0.1, V3(0, 2.5, 1.92), [-0.3, 0, 0], Z.GLASS);
  for (const [x, z] of [[-1.35, 1.6], [1.35, 1.6], [-1.35, -1.6], [1.35, -1.6]]) k.cylX(L, 0.6, 0.5, V3(x, 0.6, z), Z.DARK, 14);
  k.light(V3(-0.8, 1.6, 2.45), [14, 12, 9], 0.12, 0); k.light(V3(0.8, 1.6, 2.45), [14, 12, 9], 0.12, 0);
  k.light(V3(0, 2.95, -0.4), [12, 6, 1], 0.1, 1.2);
  k.pop();
  // caixotes e tambores perto da porta
  for (let i = 0; i < 6; i++) k.box(L, 1.1, 0.9, 1.1, V3(-21 + (i % 3) * 1.2, 0.85 + Math.floor(i / 3) * 0.9, 7.5), [0, r() * 0.3, 0], i % 2 ? Z.DARK : Z.HAZARD);
  for (let i = 0; i < 5; i++) k.cyl(L, 0.35, 0.35, 1.0, V3(-16 + i * 0.8, 0.9, 9 + (i % 2) * 0.7), null, i % 2 ? Z.ACCENT : Z.RUST, 12);
  // estandarte da Frente Livre (painel laranja num mastro)
  k.cyl(L, 0.08, 0.08, 8, V3(2, 4.4, -2), null, Z.METAL, 8);
  k.box(L, 2.4, 3.2, 0.05, V3(3.25, 6.6, -2), null, Z.ACCENT);
  // janelas acesas extras e luzes de porta
  for (const z of [-10, 2]) for (const x of [-22.1, -5.9]) k.light(V3(x, 3.6, z), [12, 7, 3], 0.25, 0);
  void lite; void solarWing; void portholes;
  return { pad: V3(14, 0.7, 12) };
}

/** Bunker de concreto semienterrado com porta blindada. */
function buildBunker(k, s, lite) {
  k.box(L, 30, 12, 22, V3(0, 0, 0), null, Z.CONCRETE);
  k.box(L, 26, 4, 18, V3(0, 7.5, -1), null, Z.CONCRETE);
  for (const sx of [-1, 1]) k.box(L, 6, 10, 24, V3(sx * 16, -1, 0), [0, 0, sx * 0.5], Z.CONCRETE);
  // porta blindada
  k.box(L, 9, 7, 1.2, V3(0, 3.5, 11.4), null, Z.METAL);
  for (let i = 0; i < 4; i++) k.box(L, 9.2, 0.3, 1.3, V3(0, 1 + i * 1.7, 11.45), null, Z.HAZARD);
  k.box(L, 11, 1.2, 2, V3(0, 7.6, 11.6), null, Z.CONCRETE);
  k.light(V3(0, 7.0, 12.7), [14, 10, 5], 0.35, 0);
  k.light(V3(-5.2, 6.4, 12.4), [14, 0.6, 0.3], 0.18, -0.7);
  k.light(V3(5.2, 6.4, 12.4), [14, 0.6, 0.3], 0.18, -0.7, 0.5);
  // fendas de observação
  k.box(L, 18, 0.6, 0.4, V3(0, 9.0, 8.1), null, Z.WINDOW);
  // antena e radar
  mast(k, L, V3(-8, 9.5, -5), V3(0, 1, 0), 16, 0.6);
  dish(k, L, V3(8, 11, -4), V3(0.2, 1, 0.6).normalize(), 3);
  // sacos de areia/barreiras
  for (let i = 0; i < 10; i++) k.box(L, 2.4, 1.0, 1.0, V3(-12 + i * 2.6, 0.5, 18), [0, (i % 2) * 0.1, 0], Z.CONCRETE);
  void lite; void s;
  return {};
}

// ═══════════════════════════════════════════════════════════════════════════
export class Surface {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = []; this.byBody = new Map();
    this.sys = null;
    this.mats = new Map();
    this.near = null;
  }

  setSystem(sys) {
    for (const s of this.list) this.unbuild(s);
    this.list = []; this.byBody.clear();
    this.sys = sys;
    if (!sys) return;
    for (const b of sys.bodies) {
      if (!b.landable) continue;
      let plan = PLAN[b.name];
      if (!plan) {
        const r = rng((b.seed >>> 0) || 7);
        plan = [];
        if (b.ruins) plan.push(['ruins', 'Ruínas dos Arquitetos', 'vigilantes']);
        if (r.chance(0.6)) plan.push(['outpost', 'Entreposto ' + b.name, sys.faction === 'hegemonia' ? 'hegemonia' : 'guilda']);
        if (r.chance(0.5)) plan.push(['wreck', 'Nave Caída', r.pick(['hegemonia', 'corsarios', 'guilda'])]);
        if (r.chance(0.3)) plan.push(['bunker', 'Bunker Abandonado', 'hegemonia']);
      }
      const r = rng(((b.seed >>> 0) ^ 0x5f3759df) >>> 0);
      const arr = [];
      plan.forEach(([kind, name, faction], i) => {
        // direção determinística (latitudes moderadas)
        const a = r() * TAU, lat = (r() - 0.5) * 1.1;
        const dir = V3(Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)).normalize();
        const s = { id: `${b.id}:${kind}${i}`, kind, name, faction, body: b, bodyId: b.id, dir, yaw: r() * TAU, seed: (b.seed + i * 977) >>> 0, resolved: false, built: false, group: null, entry: null, local: null, up: null, quatL: null, puzzle: null, shapes: [], frame: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() } };
        arr.push(s); this.list.push(s);
      });
      this.byBody.set(b.id, arr);
    }
  }

  /** Acha chão plano e calcula o referencial local da estrutura. */
  resolve(s) {
    if (s.resolved) return s;
    const pl = this.ctx.services.planets, b = s.body;
    let spot = null;
    try { spot = pl?.findLandingSpot?.(b, s.dir, { maxSlope: s.kind === 'ruins' ? 0.12 : 0.08, radius: 5000, samples: 220 }); } catch { spot = null; }
    if (spot) { s.local = spot.local.clone(); s.up = spot.dir.clone(); s.dir = spot.dir.clone(); }
    else {
      let h = 0; try { h = pl?.heightAtLocal?.(b, s.dir) ?? 0; } catch { h = 0; }
      s.local = s.dir.clone().multiplyScalar(b.radius + h); s.up = s.dir.clone();
    }
    // mais baixo um pouco (fundação enterrada)
    s.local.addScaledVector(s.up, -0.3);
    s.quatL = tangentQuat(s.up, s.yaw);
    s.resolved = true;
    return s;
  }

  on(bodyId) {
    const arr = this.byBody.get(bodyId) || [];
    return arr.map((s) => { this.resolve(s); return { id: s.id, kind: s.kind, name: s.name, faction: s.faction, local: s.local.clone(), dir: s.dir.clone(), up: s.up.clone(), solved: !!s.puzzle?.solved }; });
  }
  get(id) { return this.list.find((s) => s.id === id) || null; }

  material(style, lite) {
    const key = style + (lite ? ':l' : '');
    if (!this.mats.has(key)) this.mats.set(key, makeHullMaterial(style, { lite, scale: 2.2 }));
    return this.mats.get(key);
  }

  build(s) {
    if (s.built) return;
    s.built = true;
    const ctx = this.ctx, lite = ctx.quality.name === 'mobile';
    const k = new Kit(s.seed);
    const g = new THREE.Group(); g.name = 'estrutura:' + s.id;
    let info = {};
    let style = s.faction === 'hegemonia' ? 'hegemonia' : s.faction === 'frente' ? 'frente' : 'industrial';
    // altura do relevo (m) no plano local da estrutura — para assentar peças afastadas no chão
    const pl = ctx.services.planets, b0 = s.body, R0 = s.local.length();
    s.gy = (x, z) => {
      const loc = s.local.clone().add(V3(x, 0, z).applyQuaternion(s.quatL));
      let h = 0; try { h = pl?.heightAtLocal?.(b0, loc) ?? 0; } catch { h = 0; }
      const v = pl?.view?.(b0); if (v?.terrain?.hasSea) h = Math.max(h, 0);
      return Math.max(-8, Math.min(8, b0.radius + h - R0 - (x * x + z * z) / (2 * R0)));
    };
    if (s.kind === 'ruins') { info = buildRuins(k, s, lite); style = 'guilda'; }
    else if (s.kind === 'outpost') info = buildOutpost(k, s, lite);
    else if (s.kind === 'bunker') info = buildBunker(k, s, lite);
    else if (s.kind === 'wreck') info = this.buildWreck(k, s, g);
    const geo = k.merge(L);
    if (geo) { const m = new THREE.Mesh(geo, this.material(style, lite)); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const lg = lightsGeometry(k.lights);
    if (lg) { const lmat = this.lightsMat || (this.lightsMat = makeLightsMaterial()); const o = new THREE.Mesh(lg, lmat); o.frustumCulled = false; o.renderOrder = 5; g.add(o); }
    s.info = info;
    if (s.kind === 'ruins') this.setupRuins(s, g, info, lite);
    if (s.kind === 'outpost' && !lite) {
      // cones de luz dos holofotes
      const cm = this.coneMat || (this.coneMat = makeConeMaterial([1.0, 0.8, 0.55], 0.05));
      for (const p of [V3(-30, 9.2, 20), V3(26, 9.2, 20), V3(26, 9.2, -20), V3(-30, 9.2, -22)]) {
        const o = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 5, 9, 20, 1, true), cm);
        o.position.copy(p).add(V3(0, -4.5, 0)); o.renderOrder = 4; g.add(o);
      }
    }
    s.group = g;
    const b = s.body;
    s.entry = ctx.world.add(g, null, { getPos: (out) => b.localToWorld(s.local, ctx.time.world, out) });
    // colisores (caixas simples no referencial da estrutura)
    s.colliders = this.collidersFor(s);
  }

  buildWreck(k, s, g) {
    const ctx = this.ctx, r = k.r;
    const cls = s.faction === 'guilda' ? 'explorer' : 'freighter';
    let inst = null;
    try { inst = ctx.services.ships?.create?.(cls, s.faction, { seed: s.seed, id: 'destrocos-' + s.id, lite: true, throttle: 0, gear: 0 }); } catch { inst = null; }
    if (inst) {
      try { for (let i = 0; i < 6; i++) inst.damage?.(30, V3((r() - 0.5) * inst.radius, (r() - 0.5) * 3, (r() - 0.5) * inst.length * 0.8)); } catch { /* */ }
      inst.group.position.set(0, (inst.radius || 8) * 0.25, 0);
      inst.group.rotation.set(0.12, 0.4, 0.38);
      g.add(inst.group);
      s.inst = inst;
    }
    // sulco de impacto e destroços
    k.box(L, 14, 3, 90, V3(0, -1.2, 40), [0.06, 0.4, 0], Z.ROCK);
    for (let i = 0; i < 30; i++) {
      const d = 10 + r() * 70, a = 0.4 + (r() - 0.5) * 0.6;
      k.box(L, 0.6 + r() * 3, 0.2 + r() * 1.2, 0.6 + r() * 3, V3(Math.sin(a) * d + (r() - 0.5) * 12, 0.2, Math.cos(a) * d + (r() - 0.5) * 12), [r(), r() * TAU, r()], r() < 0.5 ? Z.RUST : Z.DARK);
    }
    k.light(V3(2, 2.5, -3), [12, 4, 1], 0.6, -2.4);
    k.light(V3(-3, 1.6, 6), [12, 5, 1], 0.4, -3.1);
    return { smoke: V3(1, 3, -2) };
  }

  collidersFor(s) {
    if (s.kind === 'ruins') {
      const c = [{ center: V3(0, -6, 0), half: V3(43, 7, 43) }, { center: V3(0, -3.8, 0), half: V3(35, 7, 35) }, { center: V3(0, -1.6, 0), half: V3(27, 7, 27) }];
      c.push({ center: V3(-23, 13.6, -6), half: V3(3.5, 7, 4) }, { center: V3(23, 13.6, -6), half: V3(3.5, 7, 4) });
      c.push({ center: V3(0, 6.6 + 10, -26), half: V3(13, 10, 3) }); // porta (removida quando abre)
      return c;
    }
    if (s.kind === 'outpost') return [{ center: V3(-14, 2.9, -10), half: V3(8, 2.6, 2.6) }, { center: V3(-14, 2.9, 2), half: V3(8, 2.6, 2.6) }, { center: V3(6, 2.9, -14), half: V3(2.6, 2.6, 6) }, { center: V3(8, 2.5, 4), half: V3(5, 2.5, 5) }];
    if (s.kind === 'bunker') return [{ center: V3(0, 0, 0), half: V3(15, 6, 11) }, { center: V3(0, 7.5, -1), half: V3(13, 2, 9) }];
    return [];
  }

  // ─── quebra-cabeça de luz ────────────────────────────────────────────
  setupRuins(s, g, info, lite) {
    const r = rng(s.seed + 3);
    const target = info.prisms.map(() => r.int(0, 3));
    const state = target.map((t) => (t + 1 + r.int(0, 2)) % 4);
    const pz = { solved: false, state, target, prisms: [], beams: [], doorT: 0, door: null };
    s.puzzle = pz;
    const holo = makeHoloMaterial([0.4, 1.2, 2.6], { lines: 6, rim: true });
    const beamMat = makeHoloMaterial([0.6, 1.8, 3.6], { lines: 2, rim: false, scroll: 2.0 });
    this.holo = holo; this.beamMat = beamMat;
    info.prisms.forEach((p, i) => {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), holo);
      crystal.scale.set(0.7, 1.4, 0.7);
      crystal.position.copy(p).add(V3(0, 2.6, 0));
      g.add(crystal);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true), beamMat);
      g.add(beam);
      pz.prisms.push(crystal); pz.beams.push(beam);
    });
    // porta antiga (laje que desce quando resolvido)
    const dm = this.material('guilda', lite);
    const door = new THREE.Mesh(new THREE.BoxGeometry(17, 18, 2.2), dm);
    // zona ALIEN na laje
    const n = door.geometry.attributes.position.count;
    const ai = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ai[i * 3] = Z.ALIEN; ai[i * 3 + 1] = 0.37; }
    door.geometry.setAttribute('aInfo', new THREE.BufferAttribute(ai, 3));
    const uvA = door.geometry.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 17, uvA.getY(i) * 18);
    door.position.copy(info.door).add(V3(0, 9, 0));
    door.castShadow = true; door.receiveShadow = true;
    g.add(door);
    pz.door = door;
    this.updateBeams(s);
  }

  /** Direção do feixe de cada prisma (estado × 90°) e alcance até o alvo. */
  updateBeams(s) {
    const pz = s.puzzle, info = s.info;
    const lock = V3(0, info.top + 2.6, -6); // o anel do portal
    pz.prisms.forEach((c, i) => {
      const st = pz.state[i];
      const toLock = lock.clone().sub(c.position); toLock.y = 0;
      const base = Math.atan2(toLock.x, toLock.z);
      const ok = st === pz.target[i];
      const ang = base + (st - pz.target[i]) * (Math.PI / 2);
      const len = ok ? toLock.length() : 9;
      const dir = V3(Math.sin(ang), 0, Math.cos(ang));
      const bm = pz.beams[i];
      bm.position.copy(c.position).addScaledVector(dir, len / 2);
      bm.scale.set(1, len, 1);
      bm.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
      c.rotation.y = ang;
    });
  }

  rotatePrism(s, i) {
    const pz = s.puzzle; if (!pz || pz.solved) return;
    pz.state[i] = (pz.state[i] + 1) % 4;
    this.updateBeams(s);
    const ctx = this.ctx;
    ctx.bus.emit('notify', { text: 'PRISMA ALINHADO ' + (pz.state[i] === pz.target[i] ? '— FEIXE TRAVADO' : ''), kind: 'info' });
    if (pz.state.every((v, k) => v === pz.target[k])) this.solve(s);
  }

  solve(s) {
    const pz = s.puzzle; if (!pz || pz.solved) return;
    pz.solved = true;
    pz.prisms.forEach((_, i) => { pz.state[i] = pz.target[i]; });
    this.updateBeams(s);
    const ctx = this.ctx;
    ctx.bus.emit('notify', { text: 'A PORTA ANTIGA SE ABRE', kind: 'reward' });
    ctx.bus.emit('scan:discover', { kind: 'ruin', id: s.id, name: s.name, body: s.bodyId });
    ctx.bus.emit('story:flag', { flag: 'ruina_aberta:' + s.id, value: true });
    ctx.bus.emit('shake', { amount: 0.25, duration: 2.5 });
    ctx.bus.emit('music', { mood: 'tension', intensity: 0.7 });
    const m = this.material('guilda', ctx.quality.name === 'mobile');
    if (m.userData.U?.alienGlow) m.userData.U.alienGlow.value = 2.4;
    // tira o colisor da porta
    const doorShape = s.shapes[s.shapes.length - 1];
    if (doorShape) doorShape.enabled = false;
  }

  unbuild(s) {
    if (!s.built) return;
    s.built = false;
    s.entry?.remove();
    for (const sh of s.shapes) sh.remove();
    s.shapes = [];
    try { s.inst?.dispose?.(); } catch { /* */ }
    s.group?.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); });
    s.group = null;
  }

  update(dt, ctx) {
    // colisão e interação só perto
    const cam = ctx.player.camWorld, t = ctx.time.world;
    this.near = null;
    for (const s of this.list) {
      if (!s.built || !s.group) continue;
      s.body.localToWorld(s.local, t, s.frame.pos);
      s.frame.quat.copy(s.body.rotationAt(t, _q)).multiply(s.quatL);
      const d = cam.distanceTo(s.frame.pos);
      if (d < 1500 && !s.shapes.length) for (const c of s.colliders) s.shapes.push(ctx.collision.addBox({ frame: s.frame, center: c.center, half: c.half, tag: 'estrutura' }));
      if (d > 1800 && s.shapes.length) { for (const sh of s.shapes) sh.remove(); s.shapes = []; }
      if (s.puzzle?.solved && s.shapes.length) { const ds = s.shapes[s.shapes.length - 1]; if (ds) ds.enabled = false; }
      // prismas: interação a pé
      if (s.puzzle && !s.puzzle.solved && ctx.game.mode === 'foot' && d < 120) {
        const inv = _q.copy(s.frame.quat).invert();
        const pl = _v.copy(ctx.player.pos).sub(s.frame.pos).applyQuaternion(inv);
        s.puzzle.prisms.forEach((c, i) => {
          if (pl.distanceTo(c.position) < 3.2) {
            this.near = { s, i };
            try { ctx.services.hud?.prompt?.('GIRAR PRISMA', { id: 'stations-prisma', sub: 'ARQUITETOS · FEIXE ' + (i + 1), ttl: 0.25 }); } catch { /* */ }
            if (!ctx.services.interact && ctx.input.pressed('interact')) this.rotatePrism(s, i);
          }
        });
      }
    }
    void dt;
  }

  frame(dt, ctx) {
    const cam = ctx.player.camWorld, t = ctx.time.world;
    const sys = ctx.universe.system;
    if (!sys || sys !== this.sys) return;
    // só os corpos perto da câmera interessam
    for (const s of this.list) {
      const b = s.body;
      const dc = cam.distanceTo(b.pos) - b.radius;
      if (dc > 40000 && !s.built) continue;
      this.resolve(s);
      const wp = b.localToWorld(s.local, t, _w);
      const d = cam.distanceTo(wp);
      if (d < 30000 && !s.built) this.build(s);
      else if (d > 45000 && s.built) this.unbuild(s);
      if (!s.built) continue;
      s.group.quaternion.copy(b.rotationAt(t, _q)).multiply(s.quatL);
      // animações das ruínas: fragmentos/cristais, feixes, porta
      const pz = s.puzzle;
      if (pz) {
        pz.prisms.forEach((c, i) => { c.position.y = s.info.top + 2.6 + Math.sin(ctx.time.now * 1.3 + i) * 0.15; });
        if (pz.solved && pz.doorT < 1) {
          pz.doorT = Math.min(1, pz.doorT + dt / 6);
          pz.door.position.y = s.info.door.y + 9 - pz.doorT * 18.5;
        }
      }
      // fumaça dos destroços
      if (s.kind === 'wreck' && d < 8000 && ctx.services.rendering?.particles) {
        s.smokeT = (s.smokeT || 0) - dt;
        if (s.smokeT <= 0) {
          s.smokeT = 0.35;
          const up = b.dirToWorld(s.up, t, new THREE.Vector3());
          const p = b.localToWorld(s.local.clone().addScaledVector(s.up, 3), t, new THREE.Vector3());
          try {
            ctx.services.rendering.particles.emit('smoke', p, 3, (k, o) => {
              o.x = (Math.random() - 0.5) * 3; o.y = 0; o.z = (Math.random() - 0.5) * 3;
              o.vx = up.x * 4 + (Math.random() - 0.5); o.vy = up.y * 4 + (Math.random() - 0.5); o.vz = up.z * 4 + (Math.random() - 0.5);
              o.life = 9; o.s0 = 2; o.s1 = 14; o.drag = 0.3; o.g = -0.05; o.a = 0.08; o.b = 0.075; o.c = 0.07; o.w = 0;
            }, { ttl: 12 });
          } catch { /* sem partículas */ }
        }
      }
    }
  }
}
