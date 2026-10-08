// Interiores andáveis das naves maiores (cargueiro, explorador, fragata).
//
// A nave é uma sequência de SEGMENTOS ao longo de z (ponte → corredor → baia
// → sala de máquinas…), cada um com largura e pé-direito próprios, seção
// octogonal (chanfros nas quinas), cavernas estruturais, anteparas com portas
// entre segmentos e o "recheio" do tipo: consoles e janela na ponte, armários
// no corredor, caixotes/contêineres e guindaste na baia, reator na máquina.
//
// Tudo no espaço LOCAL da nave (mesmo referencial do casco). Colisores em
// caixas (ctx.collision com o frame da nave), ponto de nascimento, assento.
//
// Luz: o material do interior tem lightsNode PRÓPRIO — um pequeno conjunto
// de PointLights fora da cena (seguem o jogador e ocupam as luminárias mais
// próximas), sem o sol e sem o IBL do céu (ambiente constante escuro). No
// mobile fica só a luz falsa no emissivo (fileira de luminárias + 3 pontos).
import * as THREE from 'three/webgpu';
import { Z, M, Parts, box, cyl, cylZ, sphere, pipe, vent, torusZ } from './geo.js';
import { makeHullMaterial, makeLightsMaterial } from './materials.js';
import { vec3, float, abs, dot, normalize, normalView, positionView, positionLocal, uv, time, lights as tslLights } from 'three/tsl';
import { vnoise } from './tsl.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const STYLE = {
  primary: [0.2, 0.215, 0.235], secondary: [0.035, 0.037, 0.042], trim: [0.85, 0.42, 0.05],
  metal: [0.3, 0.3, 0.31], dark: [0.016, 0.017, 0.02], glow: [0.45, 0.85, 1.0],
  paint: { metal: 0.3, rough: 0.45, clearcoat: 0.1 }, wear: 0.65, patch: 0, hazard: 1, teeth: 0, circuits: 0, iridescence: 0,
};

/** Segmentos por classe: [tipo, z0, z1, meia-largura, teto]. Piso comum F. */
const SPEC = {
  freighter: {
    F: -1.5, seat: V(-0.55, -0.95, -21.4), spawn: 'corridor',
    segs: [['bridge', -23.2, -17, 1.65, 1.75], ['corridor', -17, -3, 1.2, 1.75], ['hold', -3, 13, 3.3, 2.9], ['engine', 13, 21.5, 2.1, 2.2]],
  },
  explorer: {
    F: -1.35, seat: V(0, -0.85, -13.8), spawn: 'corridor',
    segs: [['bridge', -15.5, -10.5, 1.5, 1.6], ['corridor', -10.5, -4, 1.1, 1.6], ['hold', -4, 4, 2.3, 2.1], ['engine', 4, 11, 1.7, 1.8]],
  },
  frigate: {
    F: -3.0, seat: V(0, -2.4, -37.4), spawn: 'corridor',
    segs: [['bridge', -40, -32, 2.8, 1.2], ['corridor', -32, -12, 1.35, 0.6], ['hold', -12, 18, 4.2, 2.4], ['corridor', 18, 30, 1.35, 0.6], ['engine', 30, 44, 3.0, 1.4]],
    crew: [['sit', 0.95, -37.9, 0], ['sit', -0.95, -37.9, 0], ['stand', 1.6, -36.0, 2.6], ['stand', 0.9, -20, -1.4], ['stand', -2.6, 4, 0.9], ['stand', -0.8, 24, 1.9], ['stand', 1.9, 36, 3.6]],
  },
};

export function buildInterior(ctx, classId) {
  const sp = SPEC[classId];
  if (!sp) return null;
  const lite = ctx.quality?.name === 'mobile';
  const P = new Parts(9001);
  const rng = mulberry(77 + classId.length);
  const cols = [];
  const col = (c, h) => cols.push({ center: c, half: h });
  const F = sp.F;
  const segs = sp.segs.map(([kind, z0, z1, W, C]) => ({ kind, z0, z1, W, C }));
  const zMin = segs[0].z0, zMax = segs[segs.length - 1].z1;
  const lamps = [];   // luminárias reais (posição local, cor, intensidade)
  const cones = [];   // cones de luz volumétrica falsa {x, y, z, h, r0, r1, col}

  for (const s of segs) buildSegment(P, s, F, col, lamps, cones, rng);
  // anteparas entre segmentos (porta central 1,3 × 2,1 m)
  for (let i = 0; i < segs.length - 1; i++) bulkhead(P, segs[i], segs[i + 1], F, col);
  // paredes das pontas
  const a = segs[0], b = segs[segs.length - 1];
  if (a.kind !== 'bridge') endWall(P, a, F, a.z0, col);
  endWall(P, b, F, b.z1, col);
  for (const [pose, x, z, yaw] of sp.crew || []) crewMember(P, V(x, F, z), yaw, pose, rng);

  // ── material ────────────────────────────────────────────────────────────
  const mat = makeHullMaterial(STYLE, { panel: 0.8, lite, fill: true, isolate: true });
  const U = mat.userData.U;
  const hall = segs.find((s) => s.kind === 'corridor') || segs[0];
  const hold = segs.find((s) => s.kind === 'hold') || hall;
  const eng = segs.find((s) => s.kind === 'engine') || hall;
  const brg = segs.find((s) => s.kind === 'bridge') || hall;
  U.fillAmb.value.setRGB(0.06, 0.065, 0.075);
  U.rowCol.value.setRGB(3.4, 2.9, 2.3);
  U.row.value.set(3.2, hall.C - 0.12, 0, 1.05);
  U.rowPh.value = hall.z0 + 1.6 - 1.6;
  U.box.value.set(hall.W, F, hall.C, 0);
  U.aoK.value = 0.6;
  U.realLight.value = 1;
  const rz = (eng.z0 + eng.z1) / 2;
  U.lamps.array[0].set(0, (F + eng.C) / 2, rz, 2.2); U.lampCol.array[0].setRGB(0.6, 1.1, 1.6);
  U.lamps.array[1].set(0, F + 1.2, brg.z0 + 1.0, 1.4); U.lampCol.array[1].setRGB(0.4, 0.8, 1.3);
  U.lamps.array[2].set(0, hold.C - 0.4, (hold.z0 + hold.z1) / 2, 4); U.lampCol.array[2].setRGB(1.2, 1.0, 0.75);
  // com luzes reais (fora do mobile) o preenchimento falso vira só um piso de ambiente
  if (!lite) {
    U.fillAmb.value.setRGB(0.006, 0.0065, 0.008); U.rowCol.value.multiplyScalar(0.04);
    for (const c of U.lampCol.array) c.multiplyScalar(0.12);
  }

  const group = new THREE.Group();
  group.name = `interior:${classId}`;
  const hull = Parts.merge(P.hull), det = Parts.merge(P.detail), lit = Parts.merge(P.lights), gl = Parts.merge(P.glass);
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.receiveShadow = true; o.castShadow = true; group.add(o); return o; };
  mk(hull, mat); if (det) mk(det, mat);
  const litMesh = mk(lit, makeLightsMaterial()); litMesh.castShadow = false;
  if (gl) {
    // janelas da ponte: vidro escuro com reflexo (o espaço aparece através)
    const gm = new THREE.MeshPhysicalNodeMaterial({ transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0.0, color: 0x0a1218, depthWrite: false, side: THREE.DoubleSide });
    const gw = new THREE.Mesh(gl, gm); gw.renderOrder = 6; group.add(gw);
  }
  // cones de luz (poeira em suspensão) — aditivos, baratos
  if (!lite) {
    const mats = new Map();
    for (const c of cones) {
      const key = c.col.join(',') + c.k;
      if (!mats.has(key)) mats.set(key, makeConeMaterial(c.col, c.k));
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r0, c.r1, c.h, 20, 1, true), mats.get(key));
      m.position.set(c.x, c.y - c.h / 2, c.z);
      m.renderOrder = 4;
      group.add(m);
    }
    const rc = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, (eng.C - F) * 0.9, 24, 1, true), makeConeMaterial([0.45, 0.8, 1.0], 0.05, true));
    rc.position.set(0, (F + eng.C) / 2, rz);
    group.add(rc);
  }

  // ── luzes reais (fora da cena; só o material do interior as vê) ─────────
  const pool = [];
  if (!lite) {
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 2);
      l.castShadow = false; l.matrixAutoUpdate = false; l.matrixWorldAutoUpdate = false;
      pool.push(l);
    }
    mat.lightsNode = tslLights(pool);
  }
  const syncLights = () => {
    group.updateWorldMatrix(true, false);
    for (const l of pool) { l.matrix.makeTranslation(l.position.x, l.position.y, l.position.z); l.matrixWorld.multiplyMatrices(group.matrixWorld, l.matrix); }
  };
  const update = (eyeLocal) => {
    if (!pool.length) return;
    const sorted = lamps.map((l) => [l, l.pos.distanceToSquared(eyeLocal) / l.intensity]).sort((p, q) => p[1] - q[1]);
    pool.forEach((pl, i) => {
      const e = sorted[i]; if (!e) { pl.intensity = 0; return; }
      pl.position.copy(e[0].pos); pl.color.copy(e[0].color); pl.intensity = e[0].intensity; pl.distance = e[0].range;
    });
    syncLights();
  };
  update(V(0, 0, (hall.z0 + hall.z1) / 2));
  // no momento do render (depois da origem flutuante) a matriz já é a final
  if (pool.length) group.children[0].onBeforeRender = () => { for (const l of pool) l.matrixWorld.multiplyMatrices(group.matrixWorld, l.matrix); };

  const spawnSeg = segs.find((s) => s.kind === sp.spawn) || segs[0];
  return {
    group, material: mat, colliders: cols, lamps, update, segments: segs,
    spawn: V(0, F + 0.05, (spawnSeg.z0 + spawnSeg.z1) / 2),
    seat: sp.seat.clone(),
    eyeHeight: 1.65,
    floorY: F, ceilY: Math.max(...segs.map((s) => s.C)),
    bounds: { min: V(-Math.max(...segs.map((s) => s.W)), F, zMin), max: V(Math.max(...segs.map((s) => s.W)), Math.max(...segs.map((s) => s.C)), zMax) },
  };
}

// ─── segmento ─────────────────────────────────────────────────────────────
function buildSegment(P, sg, F, col, lamps, cones, rng) {
  const { kind, z0, z1, W, C } = sg;
  const H = C - F, midY = (F + C) / 2, L = z1 - z0, midZ = (z0 + z1) / 2;
  // casca: piso, teto, paredes
  P.add(box(W * 2 + 0.2, 0.12, L), Z.DARK, { m: M(0, F - 0.06, midZ) });
  P.add(box(W * 2 + 0.2, 0.12, L), Z.SECONDARY, { m: M(0, C + 0.06, midZ) });
  for (const s of [1, -1]) P.add(box(0.12, H, L), Z.PRIMARY, { m: M(s * (W + 0.06), midY, midZ) });
  col(V(0, F - 0.25, midZ), V(W + 0.3, 0.25, L / 2));
  col(V(0, C + 0.25, midZ), V(W + 0.3, 0.25, L / 2));
  for (const s of [1, -1]) col(V(s * (W + 0.25), midY, midZ), V(0.25, H / 2 + 0.3, L / 2));

  // piso: chapas de grade com canaleta central e frisos de luz nas bordas
  for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.2) {
    P.add(box(W * 2 - 0.2, 0.04, 1.1, 0.01), Z.METAL, { m: M(0, F + 0.02, z), wear: 0.8 });
    const n = Math.max(3, Math.round(W * 2));
    for (let k = -n; k <= n; k++) P.add(box(0.03, 0.05, 1.0), Z.DARK, { m: M(k * (W - 0.2) / n, F + 0.045, z), detail: true });
  }
  for (const s of [1, -1]) P.glowPart(box(0.04, 0.012, L - 1), [0.45, 0.8, 1.0], 1.6, { m: M(s * (W - 0.42), F + 0.06, midZ) });

  // cavernas (nervuras) a cada 1,6 m
  for (let z = z0 + 0.8; z < z1 - 0.3; z += 1.6) {
    for (const s of [1, -1]) {
      P.add(box(0.22, H, 0.26, 0.03), Z.PRIMARY, { m: M(s * (W - 0.1), midY, z), wear: 0.7 });
      P.add(box(0.24, 0.35, 0.28), Z.SECONDARY, { m: M(s * (W - 0.1), F + 0.2, z), wear: 0.9 });
    }
    P.add(box(W * 2, 0.24, 0.26, 0.03), Z.PRIMARY, { m: M(0, C - 0.1, z) });
  }
  // chanfros (seção octogonal), luz fria embutida no superior, friso de segurança no inferior
  const ch = Math.min(0.5, H * 0.16);
  for (let z = z0 + 1.6; z < z1 - 0.2; z += 1.6) {
    for (const s of [1, -1]) {
      P.add(box(ch * 1.48, 0.07, 1.44, 0.015), Z.PRIMARY, { m: M(s * (W - ch * 0.5), C - ch * 0.5, z, 0, 0, -s * Math.PI / 4), wear: 0.5 });
      P.add(box(0.06, 0.02, 1.3), Z.DARK, { m: M(s * (W - ch * 0.56), C - ch * 0.56, z, 0, 0, -s * Math.PI / 4) });
      P.glowPart(box(0.035, 0.012, 1.26), [0.5, 0.82, 1.0], 4.5, { m: M(s * (W - ch * 0.6), C - ch * 0.6, z, 0, 0, -s * Math.PI / 4) });
      P.add(box(0.6, 0.07, 1.44, 0.015), Z.SECONDARY, { m: M(s * (W - 0.2), F + 0.2, z, 0, 0, s * Math.PI / 4), wear: 0.9 });
      P.add(box(0.05, 0.02, 1.44), Z.TRIM, { m: M(s * (W - 0.36), F + 0.06, z), wear: 0.9 });
      // painel de parede embutido com moldura e placa
      P.add(box(0.04, Math.min(1.3, H * 0.4), 1.3, 0.02), Z.PRIMARY, { m: M(s * (W - 0.02), F + 1.25, z), wear: 0.6 });
      P.add(box(0.03, 0.08, 1.3), Z.DARK, { m: M(s * (W - 0.03), F + 1.95, z) });
    }
  }
  // dutos no teto
  for (const x of [-W * 0.45, W * 0.45]) P.add(cylZ(0.09, 0.09, L - 0.4, 10), Z.METAL, { m: M(x, C - 0.32, midZ), wear: 0.6 });
  P.add(pipe([[W - 0.35, C - 0.25, z0 + 0.4], [W - 0.37, C - 0.28, midZ], [W - 0.35, C - 0.25, z1 - 0.4]], 0.035, 30), Z.TRIM);
  P.add(pipe([[-W + 0.35, C - 0.45, z0 + 0.4], [-W + 0.38, C - 0.48, midZ], [-W + 0.35, C - 0.45, z1 - 0.4]], 0.05, 30), Z.RUBBER);

  // luminárias (emissivo + luz real + cone)
  const lampRow = (x, step, intensity, range, k) => {
    for (let z = z0 + step / 2; z < z1 - 0.3; z += step) {
      P.add(box(0.9, 0.06, 0.5, 0.02), Z.DARK, { m: M(x, C - 0.03, z) });
      P.glowPart(box(0.8, 0.02, 0.4), [1.0, 0.92, 0.8], 7, { m: M(x, C - 0.07, z) });
      lamps.push({ pos: V(x, C - 0.25, z), color: new THREE.Color(1.0, 0.8, 0.6), intensity, range });
      cones.push({ x, y: C - 0.07, z, h: H - 0.12, r0: 0.42, r1: Math.min(1.4, H * 0.42), col: [1.0, 0.86, 0.66], k });
    }
  };

  if (kind === 'corridor') {
    lampRow(0, 3.2, 2.0, 8, 0.035);
    for (let z = z0 + 1.6; z < z1 - 0.8; z += 1.6) for (const s of [1, -1]) wallProp(P, s, W, F, C, z, rng, col);
  } else if (kind === 'hold') {
    for (const x of [-W * 0.5, W * 0.5]) lampRow(x, 4, 5, 11, 0.045);
    holdContents(P, sg, F, col, rng);
  } else if (kind === 'engine') {
    lampRow(0, 4, 1.6, 7, 0.03);
    reactor(P, sg, F, col, lamps);
  } else if (kind === 'bridge') {
    bridge(P, sg, F, col, lamps);
  }
}

/** Antepara entre dois segmentos, com porta central aberta (1,3 × 2,1 m). */
function bulkhead(P, a, b, F, col) {
  const z = a.z1, Wm = Math.max(a.W, b.W), Cm = Math.max(a.C, b.C), H = Cm - F;
  const dw = 0.65, dh = Math.min(2.1, Math.min(a.C, b.C) - F - 0.05);
  for (const s of [1, -1]) {
    const w = Wm - dw;
    P.add(box(w, H, 0.24), Z.PRIMARY, { m: M(s * (dw + w / 2), F + H / 2, z), wear: 0.6 });
    col(V(s * (dw + w / 2), F + H / 2, z), V(w / 2, H / 2, 0.12));
    // batente com faixa de perigo e luz âmbar
    P.add(box(0.14, dh, 0.36, 0.02), Z.SECONDARY, { m: M(s * (dw + 0.07), F + dh / 2, z) });
    P.add(box(0.03, dh * 0.9, 0.38), Z.TRIM, { m: M(s * (dw + 0.01), F + dh / 2, z), wear: 0.8 });
    P.glowPart(box(0.02, dh * 0.8, 0.02), [1.0, 0.6, 0.18], 3, { m: M(s * (dw - 0.01), F + dh / 2, z - 0.2) });
    P.glowPart(box(0.02, dh * 0.8, 0.02), [1.0, 0.6, 0.18], 3, { m: M(s * (dw - 0.01), F + dh / 2, z + 0.2) });
    // painel de acesso da porta
    P.add(box(0.16, 0.24, 0.05, 0.01), Z.DARK, { m: M(s * (dw + 0.3), F + 1.3, z - 0.14) });
    P.glowPart(box(0.1, 0.12, 0.01), [0.3, 1.0, 0.5], 2.2, { m: M(s * (dw + 0.3), F + 1.33, z - 0.17) });
  }
  // verga sobre a porta
  const top = H - dh;
  P.add(box(dw * 2, top, 0.24), Z.PRIMARY, { m: M(0, F + dh + top / 2, z) });
  col(V(0, F + dh + top / 2, z), V(dw, top / 2, 0.12));
  P.add(box(dw * 2 + 0.3, 0.12, 0.38), Z.SECONDARY, { m: M(0, F + dh + 0.06, z) });
  // portas de correr recolhidas (folhas aparecendo no batente)
  for (const s of [1, -1]) P.add(box(0.06, dh, 0.1), Z.METAL, { m: M(s * (dw + 0.2), F + dh / 2, z), wear: 0.4 });
}

function endWall(P, sg, F, z, col) {
  const H = sg.C - F;
  P.add(box(sg.W * 2, H, 0.14), Z.PRIMARY, { m: M(0, F + H / 2, z) });
  col(V(0, F + H / 2, z + Math.sign(z) * 0.2), V(sg.W, H / 2, 0.25));
  // escotilha de serviço fechada
  P.add(box(1.0, 1.7, 0.08, 0.06), Z.SECONDARY, { m: M(0, F + 0.95, z - Math.sign(z) * 0.08) });
  P.add(box(0.9, 0.06, 0.1), Z.TRIM, { m: M(0, F + 1.0, z - Math.sign(z) * 0.1) });
  P.glowPart(box(0.08, 0.08, 0.02), [1.0, 0.15, 0.08], 3, { m: M(0.6, F + 1.4, z - Math.sign(z) * 0.1) });
}

/** Objetos de parede no corredor (armário, painel, respiro, extintor…). */
function wallProp(P, s, W, F, C, z, rng, col) {
  const kind = Math.floor(rng() * 5);
  const x = s * (W - 0.2);
  if (kind === 0) {
    P.add(box(0.3, 1.9, 1.1, 0.02), Z.PRIMARY, { m: M(x, F + 0.95, z + 0.8), wear: 0.7 });
    P.add(box(0.02, 0.5, 0.06), Z.METAL, { m: M(x - s * 0.16, F + 1.1, z + 0.4) });
    P.add(box(0.02, 1.7, 0.02), Z.DARK, { m: M(x - s * 0.16, F + 0.95, z + 0.8) });
    P.glowPart(box(0.01, 0.05, 0.12), [0.3, 1.0, 0.45], 2, { m: M(x - s * 0.16, F + 1.5, z + 0.8) });
    col(V(x, F + 0.95, z + 0.8), V(0.18, 0.95, 0.55));
  } else if (kind === 1) {
    P.add(box(0.12, 0.7, 0.9, 0.02), Z.DARK, { m: M(x, F + 1.35, z + 0.8) });
    P.glowPart(box(0.01, 0.42, 0.62), [0.25, 0.6, 0.9], 1.4, { m: M(x - s * 0.065, F + 1.38, z + 0.8) });
    for (let k = 0; k < 4; k++) P.glowPart(box(0.012, 0.03, 0.05), k % 2 ? [1.0, 0.6, 0.15] : [0.3, 1.0, 0.45], 2.4, { m: M(x - s * 0.065, F + 1.0, z + 0.5 + k * 0.18) });
  } else if (kind === 2) {
    P.add(vent(0.6, 0.8, 7, 0.04), Z.DARK, { m: M(x, F + 0.7, z + 0.8, 0, 0, s * Math.PI / 2) });
    P.add(pipe([[x, F + 0.2, z + 0.2], [x - s * 0.1, F + 1.2, z + 0.5], [x, C - 0.4, z + 1.2]], 0.04, 16), Z.METAL);
  } else if (kind === 3) {
    P.add(cyl(0.08, 0.08, 0.5, 12), Z.TRIM, { m: M(x - s * 0.1, F + 0.9, z + 0.8) });
    P.add(box(0.06, 0.08, 0.06), Z.DARK, { m: M(x - s * 0.1, F + 1.19, z + 0.8) });
    P.add(box(0.25, 0.3, 0.4, 0.02), Z.DARK, { m: M(x, F + 0.35, z + 0.8) });
  } else {
    // traje pendurado num nicho (capacete + mochila)
    P.add(box(0.28, 1.6, 0.8, 0.03), Z.SECONDARY, { m: M(x, F + 1.0, z + 0.8) });
    P.add(sphere(0.15, 14, 10), Z.PRIMARY, { m: M(x - s * 0.1, F + 1.55, z + 0.8) });
    P.glowPart(sphere(0.1, 12, 8, Math.PI * 2, Math.PI * 0.5).rotateZ(s * Math.PI / 2), [0.2, 0.5, 0.7], 0.6, { m: M(x - s * 0.2, F + 1.55, z + 0.8) });
    P.add(box(0.2, 0.7, 0.42, 0.05), Z.TRIM, { m: M(x - s * 0.1, F + 1.05, z + 0.8), wear: 0.7 });
  }
}

/** Baia de carga: caixotes detalhados, contêineres corrugados, guindaste, marcações. */
function holdContents(P, sg, F, col, rng) {
  const { z0, z1, W, C } = sg;
  const midZ = (z0 + z1) / 2;
  // marcação de piso: faixa de perigo em volta da área de carga
  for (const s of [1, -1]) P.add(box(0.12, 0.012, z1 - z0 - 1.6), Z.TRIM, { m: M(s * 0.95, F + 0.07, midZ), wear: 0.9 });
  for (let z = z0 + 1; z < z1 - 0.8; z += 0.5) P.add(box(0.5, 0.012, 0.18), Z.TRIM, { m: M(0, F + 0.07, z, 0, 0.6, 0), wear: 1, detail: true });
  // trilhos de amarração nas paredes
  for (const s of [1, -1]) for (const y of [0.55, 1.6]) P.add(box(0.05, 0.05, z1 - z0 - 0.8), Z.METAL, { m: M(s * (W - 0.3), F + y, midZ) });
  // pilhas ao longo das paredes
  for (const s of [1, -1]) {
    let z = z0 + 0.9;
    while (z < z1 - 1.4) {
      const big = rng() < 0.35;
      if (big) {
        const d = 2.4, w = 1.25, h = 1.3;
        container(P, s * (W - 0.4 - w / 2), F, z + d / 2, w, h, d, rng() < 0.5 ? Z.TRIM : Z.SECONDARY);
        col(V(s * (W - 0.4 - w / 2), F + h / 2, z + d / 2), V(w / 2, h / 2, d / 2));
        if (rng() < 0.6) { const w2 = 0.8, h2 = 0.7; crate(P, s * (W - 0.4 - w2 / 2), F + h, z + 0.6, w2, h2, 0.8, rng); }
        z += d + 0.3;
      } else {
        const w = 0.7 + rng() * 0.5, h = 0.55 + rng() * 0.45, d = 0.7 + rng() * 0.5;
        const x = s * (W - 0.4 - w / 2);
        crate(P, x, F, z + d / 2, w, h, d, rng);
        col(V(x, F + h / 2, z + d / 2), V(w / 2, h / 2, d / 2));
        if (rng() < 0.55) {
          const w2 = w * (0.6 + rng() * 0.3), h2 = 0.4 + rng() * 0.35, d2 = d * (0.6 + rng() * 0.3);
          crate(P, x + (rng() - 0.5) * 0.1, F + h, z + d / 2, w2, h2, d2, rng, (rng() - 0.5) * 0.4);
        }
        z += d + 0.15 + rng() * 0.3;
      }
    }
  }
  // empilhadeira-robô (carrinho) no meio
  const cz = z0 + (z1 - z0) * 0.62;
  P.add(box(0.9, 0.35, 1.3, 0.06), Z.TRIM, { m: M(0.15, F + 0.32, cz), wear: 0.8 });
  for (const [x, z] of [[-0.25, -0.5], [0.55, -0.5], [-0.25, 0.5], [0.55, 0.5]]) { const w = cyl(0.14, 0.14, 0.12, 14); w.rotateZ(Math.PI / 2); P.add(w, Z.RUBBER, { m: M(0.15 + x, F + 0.14, cz + z) }); }
  P.add(box(0.08, 1.4, 0.08), Z.METAL, { m: M(-0.15, F + 1.0, cz - 0.55) });
  P.add(box(0.08, 1.4, 0.08), Z.METAL, { m: M(0.45, F + 1.0, cz - 0.55) });
  P.add(box(0.7, 0.05, 0.6), Z.DARK, { m: M(0.15, F + 0.55, cz - 0.95) });
  P.glowPart(box(0.12, 0.05, 0.02), [1.0, 0.55, 0.1], 4, { m: M(0.15, F + 0.55, cz + 0.66), blink: -0.8 });
  col(V(0.15, F + 0.5, cz), V(0.5, 0.5, 0.8));
  // guindaste em pórtico no teto
  P.add(box(0.22, 0.18, z1 - z0 - 0.6), Z.TRIM, { m: M(-0.6, C - 0.6, midZ), wear: 0.6 });
  P.add(box(0.22, 0.18, z1 - z0 - 0.6), Z.TRIM, { m: M(0.6, C - 0.6, midZ), wear: 0.6 });
  const gz = z0 + (z1 - z0) * 0.35;
  P.add(box(1.6, 0.25, 0.4, 0.03), Z.SECONDARY, { m: M(0, C - 0.78, gz), wear: 0.7 });
  P.add(box(0.5, 0.35, 0.55, 0.04), Z.DARK, { m: M(0.1, C - 1.05, gz) });
  P.add(cyl(0.012, 0.012, 1.0, 4), Z.METAL, { m: M(0.1, C - 1.7, gz) });
  P.add(box(0.36, 0.1, 0.24, 0.02), Z.TRIM, { m: M(0.1, C - 2.25, gz) });
  P.glowPart(box(0.05, 0.05, 0.02), [1.0, 0.25, 0.08], 6, { m: M(0.35, C - 1.0, gz - 0.29), blink: 1.2 });
}

/** Caixote: corpo, cantoneiras metálicas, nervuras, etiqueta e alças. */
function crate(P, x, y, z, w, h, d, rng, yaw = (rng() - 0.5) * 0.12) {
  const R = M(x, y + h / 2, z, 0, yaw, 0);
  const at = (px, py, pz) => R.clone().multiply(M(px, py, pz));
  const zone = rng() < 0.45 ? Z.SECONDARY : rng() < 0.5 ? Z.PRIMARY : Z.TRIM;
  P.add(box(w, h, d, 0.02), zone, { m: R, wear: 1 });
  const t = 0.045;
  for (const sx of [1, -1]) for (const sz of [1, -1]) P.add(box(t, h + 0.01, t), Z.METAL, { m: at(sx * (w / 2 - t / 2 + 0.01), 0, sz * (d / 2 - t / 2 + 0.01)), wear: 0.8 });
  for (const sy of [1, -1]) {
    P.add(box(w + 0.02, t, t), Z.METAL, { m: at(0, sy * (h / 2 - t / 2 + 0.005), d / 2 - t / 2 + 0.01), detail: true });
    P.add(box(w + 0.02, t, t), Z.METAL, { m: at(0, sy * (h / 2 - t / 2 + 0.005), -d / 2 + t / 2 - 0.01), detail: true });
    P.add(box(t, t, d + 0.02), Z.METAL, { m: at(w / 2 - t / 2 + 0.01, sy * (h / 2 - t / 2 + 0.005), 0), detail: true });
    P.add(box(t, t, d + 0.02), Z.METAL, { m: at(-w / 2 + t / 2 - 0.01, sy * (h / 2 - t / 2 + 0.005), 0), detail: true });
  }
  // nervura central e etiqueta
  P.add(box(w + 0.015, h * 0.12, 0.03), Z.DARK, { m: at(0, 0, 0), detail: true });
  P.add(box(w * 0.35, h * 0.22, 0.01), zone === Z.TRIM ? Z.PRIMARY : Z.TRIM, { m: at(-w * 0.2, h * 0.15, d / 2 + 0.006), detail: true });
  // alças
  for (const sx of [1, -1]) P.add(box(0.012, 0.05, d * 0.3), Z.DARK, { m: at(sx * (w / 2 + 0.01), h * 0.25, 0), detail: true });
}

/** Contêiner corrugado com portas e travas. */
function container(P, x, y, z, w, h, d, zone) {
  P.add(box(w, h, d, 0.03), zone, { m: M(x, y + h / 2, z), wear: 1 });
  const n = Math.round(d / 0.16);
  for (let i = 0; i < n; i++) for (const s of [1, -1]) P.add(box(0.035, h * 0.86, 0.07), zone, { m: M(x + s * (w / 2 + 0.012), y + h / 2, z - d / 2 + (i + 0.5) * d / n), detail: true, wear: 1 });
  for (const sy of [1, -1]) P.add(box(w + 0.05, 0.08, d + 0.05), Z.DARK, { m: M(x, y + h / 2 + sy * (h / 2 - 0.04), z) });
  for (const sz of [1, -1]) P.add(box(w + 0.06, h, 0.06), Z.DARK, { m: M(x, y + h / 2, z + sz * (d / 2 - 0.03)) });
  for (const sx of [-0.2, 0.2]) P.add(box(0.03, h * 0.8, 0.03), Z.METAL, { m: M(x + sx, y + h / 2, z + d / 2 + 0.02), detail: true });
}

/** Sala de máquinas: reator em coluna com anéis, núcleo azul, canos e passarela. */
function reactor(P, sg, F, col, lamps) {
  const { z0, z1, W, C } = sg;
  const H = C - F, midY = (F + C) / 2, rz = (z0 + z1) / 2;
  P.add(cyl(0.75, 0.75, H * 0.9, 24), Z.METAL, { m: M(0, midY, rz), wear: 0.5 });
  for (let k = 0; k < 4; k++) P.add(torusZ(0.8, 0.06, 24).rotateX(Math.PI / 2), Z.TRIM, { m: M(0, F + 0.4 + k * H * 0.25, rz) });
  P.glowPart(cyl(0.45, 0.45, H * 0.82, 20, true), [0.45, 0.8, 1.0], 5, { m: M(0, midY, rz) });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add(box(0.12, H * 0.82, 0.12), Z.DARK, { m: M(Math.cos(a) * 0.62, midY, rz + Math.sin(a) * 0.62) });
  }
  col(V(0, midY, rz), V(0.85, H / 2, 0.85));
  for (const s of [1, -1]) {
    P.add(pipe([[0, C - 0.4, rz], [s * 0.8, C - 0.3, rz - 1.5], [s * (W - 0.3), C - 0.6, rz - 3]], 0.08, 20), Z.METAL);
    P.add(pipe([[0, F + 0.3, rz], [s * 0.9, F + 0.2, rz + 1.2], [s * (W - 0.35), F + 0.5, rz + 2.6]], 0.07, 20), Z.TRIM);
    // consoles de controle
    P.add(box(0.5, 1.0, 0.8, 0.04), Z.SECONDARY, { m: M(s * (W - 0.45), F + 0.5, rz - 2.2) });
    P.glowPart(box(0.01, 0.35, 0.55), [0.3, 0.85, 1.0], 1.6, { m: M(s * (W - 0.71), F + 1.15, rz - 2.2), m2: null });
  }
  lamps.push({ pos: V(0, midY, rz + 1.1), color: new THREE.Color(0.45, 0.8, 1.0), intensity: 5, range: 12 });
}

/** Ponte: console frontal sob a janela, assentos, painel de teto. */
function bridge(P, sg, F, col, lamps) {
  const { z0, z1, W, C } = sg;
  const H = C - F;
  // parede frontal com janela panorâmica (vidro em P.glass)
  const wy0 = F + 1.15, wy1 = Math.min(C - 0.15, F + 2.05);
  P.add(box(W * 2, wy0 - F, 0.14), Z.PRIMARY, { m: M(0, F + (wy0 - F) / 2, z0) });
  P.add(box(W * 2, C - wy1, 0.14), Z.PRIMARY, { m: M(0, wy1 + (C - wy1) / 2, z0) });
  col(V(0, F + H / 2, z0 - 0.2), V(W, H / 2, 0.25));
  P.glassPart(box(W * 2 - 0.1, wy1 - wy0, 0.02), { m: M(0, (wy0 + wy1) / 2, z0 - 0.02) });
  for (const x of [-W * 0.34, 0, W * 0.34]) P.add(box(0.12, wy1 - wy0, 0.2), Z.DARK, { m: M(x, (wy0 + wy1) / 2, z0 + 0.02) });
  P.add(box(W * 2, 0.1, 0.22), Z.DARK, { m: M(0, wy0, z0 + 0.04) });
  P.add(box(W * 2, 0.1, 0.22), Z.DARK, { m: M(0, wy1, z0 + 0.04) });
  // console frontal inclinado com telas
  P.add(box(W * 2 - 0.2, 0.5, 1.0, 0.04), Z.DARK, { m: M(0, F + 0.95, z0 + 0.6, 0.4, 0, 0) });
  const n = Math.max(2, Math.round(W * 1.4));
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * (W * 1.6 / n);
    P.glowPart(box(W * 1.2 / n, 0.01, 0.32), k % 2 ? [0.3, 0.7, 1.0] : [0.35, 1.0, 0.6], 2.2, { m: M(x, F + 1.23, z0 + 0.65, 0.4, 0, 0) });
    for (let j = 0; j < 4; j++) P.glowPart(box(0.04, 0.012, 0.03), j % 2 ? [1.0, 0.6, 0.15] : [0.4, 0.9, 1.0], 2.6, { m: M(x - 0.15 + j * 0.1, F + 1.12, z0 + 0.93, 0.4, 0, 0) });
  }
  col(V(0, F + 0.55, z0 + 0.6), V(W, 0.55, 0.5));
  // assentos
  const seats = W > 2 ? [-0.95, 0.95] : [-0.55, 0.55];
  for (const x of seats) {
    const z = z0 + 2.1;
    P.add(box(0.55, 0.12, 0.55, 0.04), Z.SECONDARY, { m: M(x, F + 0.5, z) });
    P.add(box(0.55, 0.85, 0.12, 0.04), Z.SECONDARY, { m: M(x, F + 1.0, z + 0.3, -0.15, 0, 0) });
    P.add(box(0.3, 0.2, 0.1, 0.04), Z.SECONDARY, { m: M(x, F + 1.5, z + 0.36, -0.15, 0, 0) });
    P.add(cyl(0.05, 0.08, 0.45, 10), Z.METAL, { m: M(x, F + 0.22, z) });
    for (const s of [1, -1]) P.add(box(0.06, 0.06, 0.4, 0.02), Z.DARK, { m: M(x + s * 0.3, F + 0.75, z - 0.02) });
    col(V(x, F + 0.6, z + 0.1), V(0.3, 0.6, 0.35));
  }
  // painel de teto com interruptores
  P.add(box(W, 0.08, 1.2, 0.03), Z.DARK, { m: M(0, C - 0.05, z0 + 1.5) });
  for (let i = 0; i < 12; i++) P.glowPart(box(0.04, 0.01, 0.025), i % 3 ? [0.4, 0.9, 1.0] : [1.0, 0.55, 0.12], 2.5, { m: M(-W * 0.4 + i * W * 0.8 / 11, C - 0.1, z0 + 1.3 + (i % 2) * 0.2) });
  lamps.push({ pos: V(0, F + 1.4, z0 + 0.9), color: new THREE.Color(0.4, 0.75, 1.0), intensity: 1.2, range: 5 });
  lamps.push({ pos: V(0, C - 0.3, (z0 + z1) / 2 + 0.6), color: new THREE.Color(1.0, 0.8, 0.6), intensity: 1.4, range: 7 });
}

/** Tripulante low-poly (≈1,75 m): botas, pernas, tronco com colete, braços, capacete aberto. */
function crewMember(P, base, yaw, pose, rng) {
  const sit = pose === 'sit';
  const R = new THREE.Matrix4().makeRotationY(yaw).setPosition(base);
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => R.clone().multiply(M(x, y, z, rx, ry, rz));
  const suit = rng() < 0.5 ? Z.PRIMARY : Z.SECONDARY;
  const hipY = sit ? 0.56 : 0.95;
  for (const s of [1, -1]) {
    if (sit) {
      P.add(box(0.15, 0.15, 0.46, 0.05), suit, { m: at(s * 0.11, hipY, -0.2) });
      P.add(box(0.13, 0.46, 0.14, 0.05), suit, { m: at(s * 0.11, hipY - 0.25, -0.43) });
      P.add(box(0.13, 0.08, 0.26, 0.03), Z.DARK, { m: at(s * 0.11, 0.04, -0.5) });
    } else {
      P.add(box(0.15, 0.48, 0.16, 0.05), suit, { m: at(s * 0.11, 0.7, 0) });
      P.add(box(0.13, 0.42, 0.14, 0.05), suit, { m: at(s * 0.11, 0.27, 0.01) });
      P.add(box(0.13, 0.09, 0.27, 0.03), Z.DARK, { m: at(s * 0.11, 0.045, -0.05) });
    }
    P.add(box(0.11, 0.32, 0.12, 0.04), suit, { m: at(s * 0.25, hipY + 0.42, sit ? -0.08 : 0, sit ? -0.6 : 0.05, 0, s * 0.08) });
    P.add(box(0.1, 0.3, 0.1, 0.04), suit, { m: at(s * 0.27, hipY + 0.2, sit ? -0.3 : 0.02, sit ? -1.2 : 0, 0, 0) });
    P.add(box(0.08, 0.1, 0.08, 0.03), Z.DARK, { m: at(s * 0.27, hipY + (sit ? 0.12 : 0.02), sit ? -0.45 : 0.03) });
  }
  P.add(box(0.36, 0.22, 0.22, 0.06), suit, { m: at(0, hipY + 0.06, 0.02) });
  P.add(box(0.4, 0.42, 0.24, 0.07), suit, { m: at(0, hipY + 0.36, 0) });
  P.add(box(0.42, 0.3, 0.27, 0.05), Z.TRIM, { m: at(0, hipY + 0.4, 0.005) });
  P.add(box(0.3, 0.06, 0.05), Z.DARK, { m: at(0, hipY + 0.32, -0.14) });
  P.glowPart(box(0.05, 0.02, 0.01), [0.3, 1.0, 0.5], 2.5, { m: at(0.08, hipY + 0.33, -0.17) });
  P.add(sphere(0.115, 12, 10), Z.RUBBER, { m: at(0, hipY + 0.71, 0) });
  P.add(sphere(0.135, 14, 10, Math.PI * 2, Math.PI * 0.62), Z.PRIMARY, { m: at(0, hipY + 0.73, 0.02, -0.25, 0, 0) });
  P.add(box(0.2, 0.12, 0.2, 0.04), Z.DARK, { m: at(0, hipY + 0.42, 0.18) });
}

/** Cone de luz volumétrica falsa: aditivo, some nas bordas (fresnel) e para baixo. */
function makeConeMaterial(color, k = 0.05, flat = false) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  const facing = abs(dot(normalize(normalView), normalize(positionView).negate()));
  const along = flat ? float(1).sub(abs(uv().y.sub(0.5)).mul(2)).pow(0.6) : uv().y.pow(1.6);
  const dust = vnoise(positionLocal.mul(vec3(6, 1.5, 6)).add(vec3(0, time.mul(0.15), 0))).mul(0.5).add(0.6);
  m.colorNode = vec3(color[0], color[1], color[2]).mul(facing.pow(2.5)).mul(along).mul(dust).mul(k);
  return m;
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
