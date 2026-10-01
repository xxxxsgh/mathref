import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './Collision.js';
import { NavGraph } from './NavGraph.js';
import { floorTexture, wallTexture, crateTexture, hazardTexture } from './Textures.js';

/**
 * RELAY-7 — a arena.
 *
 * Mapa compacto e espelhado no eixo X (justo para os dois lados):
 *
 *   z+  ┌──────────────── LANE NORTE (linha de visão longa) ────────────────┐
 *       │ SPAWN │   ▄▄ caixas baixas ▄▄      ▄▄        ▄▄  caixas    │ SPAWN │
 *       │  A    │ ══beco══  [PLATAFORMA ELEVADA + escadas]  ══beco══ │   B   │
 *       │       │ ▓prédio▓     PÁTIO CENTRAL (UPLINK)      ▓prédio▓  │       │
 *       │       │ ── mid ──►          ◎                ◄── mid ──    │       │
 *       │       │ ▓prédio▓▓▓▓▓   ▓▓▓▓ ┐ conector ┌ ▓▓▓▓   ▓▓▓▓▓▓▓▓ │       │
 *   z-  └─────── CORREDOR SUL coberto (curta distância, flanco) ──────────┘
 *
 * Tudo é caixa alinhada aos eixos: a mesma lista alimenta o render (mesclado
 * por material → poucas draw calls) e a colisão (AABB exata).
 */

/** Bordas do mapa (para clamp de segurança de quem cair fora). */
export const BOUNDS = { minX: -42, maxX: 42, minZ: -20, maxZ: 26 };

/** Centro e raio do Uplink — o objetivo do round. */
export const UPLINK = { x: 0, z: 0, radius: 3.6 };

/**
 * Peças da metade x ≥ 0. `m: false` = peça central, não espelhada.
 * [x0, x1, z0, z1, y0, y1, material, espelhar?]
 * @type {[number, number, number, number, number, number, string, boolean?][]}
 */
const PIECES = [
  // --- chão e limites ---
  [-42, 42, -20, 26, -1, 0, 'floor', false],
  [-43, 43, 26, 27, 0, 8, 'wall', false],
  [-43, 43, -21, -20, 0, 8, 'wall', false],
  [42, 43, -21, 27, 0, 8, 'wall'],
  // --- parede frontal do spawn (aberturas: norte, mid, corredor) ---
  [29.5, 30.5, 23, 26, 0, 7, 'wall'],
  [29.5, 30.5, 3, 17, 0, 7, 'wall'],
  [29.5, 30.5, -15, -3, 0, 7, 'wall'],
  // --- muro que separa a lane norte do beco (com vão em x 18–21) ---
  [12, 18, 14.6, 15.4, 0, 4, 'wall2'],
  [21, 29.5, 14.6, 15.4, 0, 4, 'wall2'],
  // --- prédios do mid ---
  [14, 26, 4, 12, 0, 5, 'building'],
  [12, 29.5, -15, -4, 0, 5, 'building'],
  [3, 12, -15, -9, 0, 5, 'building'],
  // --- corredor sul: teto e pilares em zigue-zague ---
  [-29.5, 29.5, -20, -15, 4, 4.4, 'roof', false],
  [7.5, 8.5, -20, -18.2, 0, 4, 'pillar'],
  [15.5, 16.5, -16.8, -15, 0, 4, 'pillar'],
  [23, 24, -20, -18.6, 0, 4, 'pillar'],
  // --- pátio central ---
  [7, 9, -7, -5, 0, 2.2, 'crate'],
  [7.2, 8.8, -6.8, -5.2, 2.2, 3.3, 'crate'],
  [3.85, 5.15, 3.85, 5.15, 0, 1.3, 'crate2'],
  [9, 10, 2, 3, 0, 4, 'pillar'],
  [2.3, 4.7, -2.8, -2.2, 0, 1.1, 'barrier'],
  [-0.3, 0.3, -0.3, 0.3, 0, 1.0, 'rail', false],
  // --- plataforma elevada + parapeito ---
  [-7, 7, 9, 14, 0, 3, 'platform', false],
  [2.5, 6.5, 9, 9.25, 3, 3.9, 'rail'],
  // --- lane norte: coberturas baixas (não bloqueiam a visão em pé) ---
  [21.2, 22.8, 18.7, 20.3, 0, 1.1, 'crate'],
  [8.8, 10.2, 21.8, 23.2, 0, 1.0, 'crate2'],
  [-1.5, 1.5, 23.4, 24.6, 0, 1.4, 'barrier', false],
  [15.4, 16.6, 23.9, 25.1, 0, 2.0, 'crate'],
  [4.75, 5.25, 15.75, 18.25, 0, 1.0, 'barrier'],
  // --- mid: cobertura no meio do caminho ---
  [19.3, 20.7, -1.7, -0.3, 0, 1.2, 'crate2'],
  // --- spawn: caixotes ---
  [36, 37.5, 9, 10.5, 0, 1.4, 'crate'],
  [36, 37.5, -10.5, -9, 0, 1.4, 'crate'],
];

/** Escada da plataforma: 8 degraus de 0,375 m subindo em direção ao centro. */
function stairPieces() {
  /** @type {typeof PIECES} */
  const out = [];
  for (let i = 1; i <= 8; i++) {
    const x0 = 7 + (8 - i) * 0.4;
    out.push([x0, x0 + 0.4, 9.25, 11.6, 0, 0.375 * i, 'stairs']);
  }
  return out;
}

/** Pontos de spawn (lado B, olhando para -X). O lado A é o espelho. */
const SPAWNS_B = [
  [35, 0],
  [35, -3.5],
  [35, 3.5],
  [38.5, -1.8],
  [38.5, 1.8],
];

/**
 * Nós de navegação (metade x ≥ 0; nós com x > 0 ganham espelho "~nome").
 * [nome, x, y, z]
 * @type {[string, number, number, number][]}
 */
const NODES = [
  ['sp', 36, 0, 0],
  ['spN', 35, 0, 20],
  ['spS', 35, 0, -17.5],
  ['exN', 27, 0, 20],
  ['laneE', 19.5, 0, 19],
  ['laneM', 9, 0, 19],
  ['lane0', 0, 0, 20],
  ['exM', 28, 0, 0],
  ['midR', 20, 0, 1.5],
  ['alleyE', 28, 0, 13.3],
  ['alleyM', 19.5, 0, 13.3],
  ['alleyW', 11.4, 0, 13.3],
  ['stairsBot', 11, 0, 10.4],
  ['stairsTop', 6.3, 3, 10.4],
  ['plat0', 0, 3, 11.5],
  ['ctN', 11.3, 0, 6.5],
  ['ctE', 12.5, 0, 0],
  ['ctNE', 5, 0, 6.5],
  ['c0', 0, 0, 2],
  ['ctSE', 6, 0, -4],
  ['cS', 0, 0, -6],
  ['conS', 0, 0, -12],
  ['cor0', 0, 0, -17.5],
  ['corM', 11, 0, -17.5],
  ['corE', 20, 0, -17.5],
  ['exS', 28.5, 0, -17.5],
];

/** Arestas (lado x ≥ 0); espelhadas automaticamente. */
const EDGES = [
  ['sp', 'spN'],
  ['sp', 'spS'],
  ['sp', 'exM'],
  ['spN', 'exN'],
  ['spS', 'exS'],
  ['exN', 'laneE'],
  ['laneE', 'laneM'],
  ['laneM', 'lane0'],
  ['laneE', 'alleyM'],
  ['exM', 'midR'],
  ['exM', 'alleyE'],
  ['alleyE', 'alleyM'],
  ['alleyM', 'alleyW'],
  ['alleyW', 'laneM'],
  ['alleyW', 'stairsBot'],
  ['stairsBot', 'stairsTop'],
  ['stairsTop', 'plat0'],
  ['stairsBot', 'ctN'],
  ['ctN', 'ctE'],
  ['ctN', 'ctNE'],
  ['ctNE', 'c0'],
  ['midR', 'ctE'],
  ['ctE', 'c0'],
  ['ctE', 'ctSE'],
  ['ctSE', 'cS'],
  ['cS', 'conS'],
  ['conS', 'cor0'],
  ['cor0', 'corM'],
  ['corM', 'corE'],
  ['corE', 'exS'],
];

/** Materiais com "voz" própria para impacto e passos. */
const SURFACE = {
  floor: 'concrete',
  wall: 'concrete',
  wall2: 'concrete',
  building: 'concrete',
  roof: 'metal',
  pillar: 'concrete',
  crate: 'metal',
  crate2: 'metal',
  barrier: 'concrete',
  rail: 'metal',
  platform: 'metal',
  stairs: 'metal',
};

export class Arena {
  /** @param {THREE.Scene} scene @param {{ shadows: boolean }} opts */
  constructor(scene, opts) {
    this.scene = scene;
    this.collision = new CollisionWorld();
    this.group = new THREE.Group();
    this.group.name = 'arena';
    scene.add(this.group);

    const all = [...PIECES, ...stairPieces()];
    /** @type {[number, number, number, number, number, number, string][]} */
    const boxes = [];
    for (const p of all) {
      const [x0, x1, z0, z1, y0, y1, mat, mirror = true] = p;
      boxes.push([x0, x1, z0, z1, y0, y1, mat]);
      if (mirror && x0 >= 0) boxes.push([-x1, -x0, z0, z1, y0, y1, mat]);
    }
    for (const [x0, x1, z0, z1, y0, y1, mat] of boxes) {
      this.collision.addBox(x0, y0, z0, x1, y1, z1, SURFACE[mat] || 'concrete');
    }
    this.collision.build();
    this.boxes = boxes;

    this.buildVisuals(boxes, opts.shadows);
    this.buildUplink();

    /** Spawns por time: 0 = VANGUARD (lado A, x < 0), 1 = EMBER (lado B). */
    this.spawns = [
      SPAWNS_B.map(([x, z]) => ({ x: -x, z, yaw: -Math.PI / 2 })),
      SPAWNS_B.map(([x, z]) => ({ x, z, yaw: Math.PI / 2 })),
    ];

    this.nav = new NavGraph(this.collision);
    /** @type {Map<string, number>} */
    const ids = new Map();
    for (const [name, x, y, z] of NODES) {
      ids.set(name, this.nav.addNode(x, y, z, name));
      if (x > 0.01) ids.set('~' + name, this.nav.addNode(-x, y, z, '~' + name));
    }
    for (const [a, b] of EDGES) {
      this.nav.link(/** @type {number} */ (ids.get(a)), /** @type {number} */ (ids.get(b)));
      const ma = ids.has('~' + a) ? '~' + a : a;
      const mb = ids.has('~' + b) ? '~' + b : b;
      if (ma !== a || mb !== b) this.nav.link(/** @type {number} */ (ids.get(ma)), /** @type {number} */ (ids.get(mb)));
    }
    this.navIds = ids;
    this.coverPoints = this.computeCoverPoints(boxes);

    /** Locais para alvos de treino (modo prática). */
    this.targetSpots = [
      { x: -8, z: 2, moving: false },
      { x: -4, z: -6, moving: true },
      { x: 4, z: 8, moving: false },
      { x: 9, z: -2, moving: true },
      { x: 0, z: 11.5, y: 3, moving: false },
      { x: 18, z: 19, moving: true },
      { x: -20, z: 1.5, moving: false },
      { x: 12, z: -17.5, moving: true },
    ];
  }

  /**
   * Caixas → geometria com UV em espaço de mundo (textura em metros, sem
   * esticar), mescladas por material: o mapa inteiro custa ~12 draw calls.
   */
  buildVisuals(boxes, shadows) {
    const floorTex = floorTexture();
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.02 }),
      wall: new THREE.MeshStandardMaterial({ map: wallTexture('#aeb4ba', '#262b31'), roughness: 0.88 }),
      wall2: new THREE.MeshStandardMaterial({ map: wallTexture('#8f99a3', '#2d6f73'), roughness: 0.85 }),
      building: new THREE.MeshStandardMaterial({ map: wallTexture('#c9c2b4', '#5c3b2b'), roughness: 0.9 }),
      roof: new THREE.MeshStandardMaterial({ color: '#3b4148', roughness: 0.6, metalness: 0.4 }),
      pillar: new THREE.MeshStandardMaterial({ map: wallTexture('#9aa0a6', '#d29b1d'), roughness: 0.85 }),
      crate: new THREE.MeshStandardMaterial({ map: crateTexture('#b8622a'), roughness: 0.55, metalness: 0.35 }),
      crate2: new THREE.MeshStandardMaterial({ map: crateTexture('#3f6f78'), roughness: 0.55, metalness: 0.35 }),
      barrier: new THREE.MeshStandardMaterial({ map: wallTexture('#a3a7ab', '#a33a2c'), roughness: 0.9 }),
      rail: new THREE.MeshStandardMaterial({ color: '#59616b', roughness: 0.35, metalness: 0.8 }),
      platform: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6, metalness: 0.3 }),
      stairs: new THREE.MeshStandardMaterial({ color: '#4d555e', roughness: 0.5, metalness: 0.6 }),
    };
    /** escala da textura (metros por repetição) por material */
    const texScale = { floor: 4, wall: 4, wall2: 4, building: 5, pillar: 4, crate: 1.5, crate2: 1.5, barrier: 2.5, platform: 2, roof: 4, rail: 1, stairs: 1 };
    /** @type {Record<string, THREE.BufferGeometry[]>} */
    const byMat = {};
    for (const [x0, x1, z0, z1, y0, y1, mat] of boxes) {
      (byMat[mat] ||= []).push(boxGeometry(x0, y0, z0, x1, y1, z1, texScale[mat] || 4));
    }
    for (const [mat, geos] of Object.entries(byMat)) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mats[mat]);
      mesh.receiveShadow = shadows;
      mesh.castShadow = shadows && mat !== 'floor';
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.materials = mats;
    // Linhas de chão marcando as zonas de spawn — ajudam a ler o mapa.
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 46),
        new THREE.MeshBasicMaterial({ color: side < 0 ? '#2fd3c4' : '#ff7a3d', transparent: true, opacity: 0.55 }),
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(side * 31, 0.01, 3);
      this.group.add(strip);
    }
  }

  buildUplink() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(UPLINK.radius - 0.25, UPLINK.radius, 64),
      new THREE.MeshBasicMaterial({ color: '#e8edf2', transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(UPLINK.radius - 0.25, 64),
      new THREE.MeshBasicMaterial({ color: '#e8edf2', transparent: true, opacity: 0.08 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.015;
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#e8edf2', transparent: true, opacity: 0.5 }),
    );
    beacon.position.y = 2.5;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#e8edf2' }));
    lamp.position.y = 1.08;
    g.add(ring, disc, beacon, lamp);
    g.position.set(UPLINK.x, 0, UPLINK.z);
    this.scene.add(g);
    this.uplinkVisual = { group: g, ring, disc, beacon, lamp };
  }

  /**
   * Pinta o Uplink com a cor de quem está capturando.
   * @param {number} owner -1 neutro, 0/1 time
   * @param {number} progress 0..1
   * @param {number} time segundos (para pulsar)
   */
  setUplinkState(owner, progress, time) {
    const col = owner === 0 ? 0x2fd3c4 : owner === 1 ? 0xff7a3d : 0xe8edf2;
    const v = this.uplinkVisual;
    for (const m of [v.ring, v.disc, v.beacon, v.lamp]) /** @type {any} */ (m.material).color.setHex(col);
    const pulse = 0.5 + 0.5 * Math.sin(time * (owner >= 0 ? 10 : 2));
    /** @type {any} */ (v.disc.material).opacity = 0.06 + progress * 0.25 + (owner >= 0 ? pulse * 0.08 : 0);
    /** @type {any} */ (v.beacon.material).opacity = 0.25 + progress * 0.6;
    v.beacon.scale.y = 0.3 + progress * 1.2;
    v.beacon.position.y = 1 + (3 * v.beacon.scale.y) / 2;
  }

  /**
   * Pontos de cobertura: ao redor de cada obstáculo de altura de cobertura,
   * um ponto em cada face, a 0,7 m dela. O bot escolhe na hora o que fica
   * escondido da ameaça atual.
   */
  computeCoverPoints(boxes) {
    const pts = [];
    for (const [x0, x1, z0, z1, y0, y1, mat] of boxes) {
      if (y0 > 0.1 || y1 < 1.0 || mat === 'floor' || mat === 'wall' || mat === 'roof' || mat === 'platform') continue;
      if (x1 - x0 > 14 || z1 - z0 > 14) continue;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const cand = [
        [x0 - 0.7, cz],
        [x1 + 0.7, cz],
        [cx, z0 - 0.7],
        [cx, z1 + 0.7],
      ];
      for (const [x, z] of cand) {
        if (x < BOUNDS.minX + 1 || x > BOUNDS.maxX - 1 || z < BOUNDS.minZ + 1 || z > BOUNDS.maxZ - 1) continue;
        if (this.collision.overlaps(x - 0.35, 0.05, z - 0.35, x + 0.35, 1.7, z + 0.35)) continue;
        pts.push({ x, z, low: y1 < 1.6 });
      }
    }
    return pts;
  }
}

/**
 * Caixa com UV em metros (u,v = coordenadas do mundo / escala).
 * Sem faces de baixo para peças no chão — nunca são vistas.
 */
function boxGeometry(x0, y0, z0, x1, y1, z1, scale) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const face = (corners, n, uvs) => {
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(...corners[i]);
      nor.push(...n);
      uv.push(uvs[i][0] / scale, uvs[i][1] / scale);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // +X
  face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]]);
  // -X
  face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
  // +Y
  face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
  // -Y (só se a peça não estiver apoiada no chão)
  if (y0 > 0.01) face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  // +Z
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  // -Z
  face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
