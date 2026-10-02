/**
 * Braços em primeira pessoa: mãos com luvas táticas articuladas (15 falanges
 * por mão), protetor de nós dos dedos, punho com velcro, palma de couro,
 * mangas de camuflagem com dobras e relógio tático no pulso esquerdo.
 *
 * Mão (espaço local, mão DIREITA): punho na origem, dedos para −Z, palma
 * para −Y, dorso para +Y, polegar no lado −X. A esquerda é espelhada (o
 * WebGLRenderer inverte o winding sozinho para determinante negativo).
 *
 * Poses de dedos: { f: [[mcp,pip,dip] × 4 dedos], spread: [4], t: [cmcYaw,
 * cmcPitch, cmcRoll, mcp, ip] } — ângulos em rad, flexão positiva fecha a mão.
 */
import * as THREE from 'three';
import { crease, rbox, Kit, mergeGeometries } from './geo.js';
import { mulberry } from './textures.js';

// dimensões de mão grande enluvada (m)
export const FINGERS = [
  // x da base, z da base, y da base, comprimentos [prox, médio, dist], raio
  { x: -0.029, z: -0.084, y: 0.001, L: [0.042, 0.025, 0.022], r: 0.0099 },
  { x: -0.0095, z: -0.088, y: 0.002, L: [0.046, 0.028, 0.023], r: 0.0102 },
  { x: 0.0098, z: -0.085, y: 0.001, L: [0.043, 0.027, 0.022], r: 0.0098 },
  { x: 0.0275, z: -0.077, y: -0.002, L: [0.034, 0.02, 0.019], r: 0.0088 },
];
export const THUMB = { x: -0.03, y: -0.008, z: -0.022, L: [0.035, 0.031, 0.027], r: 0.0118 };

const smoothstep01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Palma: caixa arredondada deformada (mais larga nos nós, arco palmar). */
function palmGeo() {
  const g = rbox(0.078, 0.03, 0.094, 0.0135, 0, 0, -0.045, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.max(0, Math.min(1, -z / 0.09)); // 0 punho → 1 nós
    x *= 0.74 + 0.26 * t;
    // dorso arqueado, palma côncava, eminência tenar (lado do polegar) saliente
    y += 0.009 * (1 - (x / 0.04) ** 2) * (y > 0 ? 1 : -0.4);
    // nós dos dedos: crista transversal no dorso
    if (y > 0) y += 0.004 * Math.exp(-(((t - 0.88) / 0.08) ** 2));
    if (y < 0 && x < 0) y -= 0.006 * Math.max(0, -x / 0.04) * (1 - t) ;
    // afunila em altura no punho
    y *= 0.82 + 0.18 * t;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return crease(g, 1.2);
}

/**
 * Tubo de um dígito (dedo/polegar) com pesos de skinning, ao longo de −Z a
 * partir da junta-base (x, y, z). sj = posições das 3 juntas ao longo do
 * eixo; len = comprimento até a ponta; bones = [palma, b0, b1, b2].
 */
function digitTube({ x, y, z, sj, len, r, rad = null, back = 0.014, bones, thumb = false }) {
  const SEG = 18;
  // estações ao longo do eixo: mais densas nas juntas e na ponta
  const st = [];
  for (let s = -back; s < len - r * 1.2; s += 0.0026) st.push(s);
  for (let k = 0; k <= 10; k++) st.push(len - r * 1.2 + r * 1.2 * Math.sin((k / 10) * Math.PI / 2));
  const R0 = rad || [r * 1.02, r, r * 0.93, r * 0.86];
  const radAt = (s) => {
    // raio por segmento (afunila) com transição suave nas juntas
    if (s <= 0) return R0[0];
    if (s >= sj[2]) return R0[2] + (R0[3] - R0[2]) * Math.min(1, (s - sj[2]) / (len - sj[2]));
    if (s >= sj[1]) return R0[1] + (R0[2] - R0[1]) * ((s - sj[1]) / (sj[2] - sj[1]));
    return R0[0] + (R0[1] - R0[0]) * (s / sj[1]);
  };
  const pos = [], skI = [], skW = [], idx = [];
  const sm = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    let rr = radAt(s);
    // ponta arredondada (calota elíptica)
    const tipStart = len - rr * 1.2;
    let cap = 1;
    if (s > tipStart) cap = Math.sqrt(Math.max(0, 1 - ((s - tipStart) / (len - tipStart)) ** 2));
    // pesos: palma → b0 → b1 → b2
    const t0 = sm(-r * 0.75, r * 0.55, s), t1 = sm(sj[1] - r * 0.55, sj[1] + r * 0.45, s), t2 = sm(sj[2] - r * 0.5, sj[2] + r * 0.4, s);
    const w = [1 - t0, t0 - t1, t1 - t2, t2];
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      let k = rr;
      // nós (dorso) levemente salientes; polpas na face palmar
      for (let q = 1; q < 3; q++) {
        const g = Math.exp(-(((s - sj[q]) / (r * 0.7)) ** 2));
        k += r * 0.07 * g * Math.max(0, sn);
        // vinco de flexão na palma
        k -= r * 0.09 * Math.exp(-(((s - sj[q]) / (r * 0.22)) ** 2)) * Math.max(0, -sn);
        // tecido franzido no dorso sobre a junta
        k += r * 0.025 * Math.sin(s * 1400 + th) * g * Math.max(0, sn);
      }
      for (let q = 0; q < 3; q++) {
        const mid = q < 2 ? (sj[q] + sj[q + 1]) / 2 : (sj[2] + len) / 2;
        const half = q < 2 ? (sj[q + 1] - sj[q]) / 2 : (len - sj[2]) / 2;
        k += r * 0.06 * Math.exp(-(((s - mid) / (half * 0.6)) ** 2)) * Math.max(0, -sn);
      }
      // ponta: dorso achatado (unha sob a luva)
      const flat = s > sj[2] ? 0.86 - 0.08 * Math.max(0, sn) * sm(sj[2], len, s) : 0.86;
      k *= cap;
      pos.push(x + c * k * (thumb ? 1.08 : 1.06), y + sn * k * (thumb ? 0.9 : flat), z - s);
      skI.push(bones[0], bones[1], bones[2], bones[3]);
      skW.push(w[0], w[1], w[2], w[3]);
    }
  }
  const row = SEG + 1;
  for (let i = 0; i < st.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skW, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Hand {
  constructor(M, { left = false } = {}) {
    this.left = left;
    this.root = new THREE.Group();
    this.root.name = left ? 'handL' : 'handR';
    this.mirror = new THREE.Group();
    if (left) this.mirror.scale.x = -1;
    this.root.add(this.mirror);
    const mesh = (g, m) => {
      const o = new THREE.Mesh(g, M[m]);
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
      return o;
    };
    // palma + couro da palma + protetor de nós
    this.mirror.add(mesh(palmGeo(), 'glove'));
    const leather = rbox(0.066, 0.006, 0.07, 0.003, -0.002, -0.0165, -0.05, 2);
    this.mirror.add(mesh(leather, 'gloveLeather'));
    const kn = new Kit();
    // protetor de nós moldado: placa única arqueada acompanhando o dorso,
    // com 4 domos baixos (um por nó) — sem "teclas" quadradas
    {
      const plate = rbox(0.068, 0.0055, 0.024, 0.0026, 0, 0, 0, 3);
      const pp = plate.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i);
        pp.setY(i, pp.getY(i) + 0.0175 + 0.009 * (1 - (x / 0.04) ** 2) - 0.002);
        pp.setZ(i, pp.getZ(i) - 0.072 + 0.006 * (x / 0.034) ** 2);
      }
      plate.computeVertexNormals();
      kn.add('knuckle', plate);
      for (let i = 0; i < 4; i++) {
        const f = FINGERS[i];
        const d = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        d.scale(0.0072, 0.0032, 0.0078);
        d.translate(f.x * 0.92, 0.0175 + 0.009 * (1 - (f.x / 0.04) ** 2) + 0.0006, f.z + 0.012 + 0.006 * (f.x / 0.034) ** 2);
        kn.add('knuckle', d);
      }
    }
    const knG = kn.build(M, 'kn');
    this.mirror.add(knG);
    // dedos e polegar: UMA malha contínua com skinning (16 ossos: palma +
    // 3 por dígito). As juntas são THREE.Bone na mesma hierarquia que o
    // resolvedor de pega usa; o tecido dobra liso nas articulações (vinco
    // na face palmar, franzido no dorso) em vez de cápsulas encaixadas.
    const palmBone = new THREE.Bone();
    this.mirror.add(palmBone);
    const bones = [palmBone];
    const digitGeos = [];
    this.fingers = FINGERS.map((f) => {
      const joints = [];
      let parent = this.mirror;
      let pos = new THREE.Vector3(f.x, f.y, f.z);
      const sj = [0];
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Bone();
        j.position.copy(pos);
        parent.add(j);
        joints.push(j);
        bones.push(j);
        parent = j;
        const r1 = f.r * (1 - (k + 1) * 0.07) * (k === 2 ? 0.92 : 1);
        const step = f.L[k] - r1 * 0.15;
        if (k < 2) sj.push(sj[k] + step);
        pos = new THREE.Vector3(0, 0, -step);
      }
      const len = sj[2] + f.L[2] - f.r * 0.06;
      digitGeos.push(digitTube({ x: f.x, y: f.y, z: f.z, sj, len, r: f.r, back: 0.016, bones: [0, bones.length - 3, bones.length - 2, bones.length - 1] }));
      return joints;
    });
    {
      const cmc = new THREE.Bone();
      cmc.position.set(THUMB.x, THUMB.y, THUMB.z);
      this.mirror.add(cmc);
      const mcp = new THREE.Bone();
      mcp.position.set(0, 0, -THUMB.L[0]);
      cmc.add(mcp);
      const ip = new THREE.Bone();
      ip.position.set(0, 0, -THUMB.L[1]);
      mcp.add(ip);
      bones.push(cmc, mcp, ip);
      this.thumb = [cmc, mcp, ip];
      const n = bones.length;
      digitGeos.push(digitTube({ x: THUMB.x, y: THUMB.y, z: THUMB.z, sj: [0, THUMB.L[0], THUMB.L[0] + THUMB.L[1]], len: THUMB.L[0] + THUMB.L[1] + THUMB.L[2] - 0.002, r: 0.0128, rad: [0.0152, 0.0116, 0.0104, 0.0094], back: 0.012, thumb: true, bones: [0, n - 3, n - 2, n - 1] }));
    }
    const dg = mergeGeometries(digitGeos, false);
    const skin = new THREE.SkinnedMesh(dg, M.glove);
    skin.castShadow = skin.receiveShadow = true;
    skin.frustumCulled = false;
    this.mirror.add(skin);
    this.root.updateMatrixWorld(true);
    skin.bind(new THREE.Skeleton(bones));
    this.skin = skin;
    this.pose = clonePose(POSES.relaxed);
  }

  /** Aplica uma pose de dedos (ver POSES). */
  apply(p) {
    for (let i = 0; i < 4; i++) {
      const [a, b, c] = p.f[i];
      const j = this.fingers[i];
      j[0].rotation.set(-a, p.spread[i], 0, 'YXZ');
      j[1].rotation.set(-b, 0, 0);
      j[2].rotation.set(-c, 0, 0);
    }
    const [yaw, pitch, roll, mcp, ip] = p.t;
    this.thumb[0].rotation.set(-pitch, yaw, roll, 'YXZ');
    this.thumb[1].rotation.set(-mcp, 0, 0);
    this.thumb[2].rotation.set(-ip, 0, 0);
  }
}

// ─── poses de dedos ──────────────────────────────────────────────────────
export const POSES = {
  relaxed: {
    f: [[0.3, 0.4, 0.25], [0.35, 0.45, 0.3], [0.4, 0.5, 0.3], [0.45, 0.5, 0.3]],
    spread: [0.06, 0.0, -0.05, -0.12],
    t: [0.45, 0.3, 0.4, 0.2, 0.2],
  },
  // mão direita no punho de pistola: indicador estendido ao lado do guarda-mato
  grip: {
    f: [[0.25, 0.35, 0.15], [1.35, 1.45, 0.85], [1.4, 1.5, 0.85], [1.45, 1.5, 0.8]],
    spread: [0.0, 0.0, -0.04, -0.1],
    t: [1.0, 1.0, 0.9, 0.45, 0.35],
  },
  // indicador no gatilho
  trigger: {
    f: [[0.75, 1.05, 0.55], [1.35, 1.45, 0.85], [1.4, 1.5, 0.85], [1.45, 1.5, 0.8]],
    spread: [0.0, 0.0, -0.04, -0.1],
    t: [1.0, 1.0, 0.9, 0.45, 0.35],
  },
  // mão esquerda na empunhadura vertical (dedos pela frente, polegar ao lado)
  guard: {
    f: [[0.11, 0.56, 0.42], [1.7, 1.04, 0.78], [1.56, 1.11, 0.83], [1.13, 1.03, 0.77]],
    spread: [0.05, 0.03, -0.04, -0.12],
    t: [0.1, -0.35, 0.0, 0.12, 0.1],
  },
  // segurando o carregador (dedos fechados em volta do corpo)
  mag: {
    f: [[1.0, 1.0, 0.5], [1.1, 1.05, 0.55], [1.15, 1.1, 0.55], [1.2, 1.1, 0.55]],
    spread: [0.05, 0.0, -0.04, -0.08],
    t: [0.9, 0.55, 0.9, 0.3, 0.25],
  },
  // mão aberta, tapa na base / no retém
  flat: {
    f: [[0.12, 0.12, 0.08], [0.1, 0.1, 0.08], [0.12, 0.12, 0.1], [0.16, 0.14, 0.1]],
    spread: [0.12, 0.02, -0.08, -0.18],
    t: [0.55, 0.15, 0.2, 0.05, 0.05],
  },
  // pinça na alavanca de manejo
  pinch: {
    f: [[0.9, 1.1, 0.6], [1.2, 1.4, 0.8], [1.3, 1.45, 0.8], [1.35, 1.45, 0.75]],
    spread: [0.0, 0.0, -0.04, -0.08],
    t: [0.95, 0.5, 0.8, 0.4, 0.45],
  },
};

export function clonePose(p) {
  return { f: p.f.map((a) => a.slice()), spread: p.spread.slice(), t: p.t.slice() };
}
/** out = mistura ponderada de poses: list = [[pose, peso], …] (pesos somam 1). */
export function blendPoses(out, list) {
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 3; k++) out.f[i][k] = 0;
    out.spread[i] = 0;
  }
  for (let k = 0; k < 5; k++) out.t[k] = 0;
  for (const [p, w] of list) {
    if (w <= 0) continue;
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 3; k++) out.f[i][k] += p.f[i][k] * w;
      out.spread[i] += p.spread[i] * w;
    }
    for (let k = 0; k < 5; k++) out.t[k] += p.t[k] * w;
  }
  return out;
}

/**
 * Antebraço com manga: tubo ao longo de +Z de 0 (punho) a 1 (cotovelo),
 * escalado em Z para o comprimento real a cada frame. Dobras de tecido por
 * deslocamento dos vértices (ondas que circulam + ruído).
 */
export const SLEEVE_L = 0.34;
const CUFF_L = 0.026; // manguito da luva antes da barra da manga
/** Peso do osso do antebraço ao longo da manga (0 = segue a mão). */
const wristW = (z) => {
  const u = Math.min(1, Math.max(0, (z + 0.004) / 0.045));
  return u * u * (3 - 2 * u);
};
export function buildSleeve(M, { left = false, watch = false } = {}) {
  const grp = new THREE.Group();
  grp.name = left ? 'sleeveL' : 'sleeveR';
  const R = mulberry(left ? 77 : 33);
  const seg = 36, rings = 64;
  const g = new THREE.CylinderGeometry(1, 1, 1, seg, rings, true);
  g.rotateX(Math.PI / 2); // eixo Y → Z (y=+0.5 → z=−0.5)
  g.translate(0, 0, 0.5); // z ∈ [0, 1]
  const p = g.attributes.position;
  const folds = Array.from({ length: 10 }, () => ({ z: 0.1 + R() * 0.8, a: R() * Math.PI * 2, w: 0.04 + R() * 0.05, k: 0.05 + R() * 0.07, tw: (R() - 0.5) * 2 }));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(y, x);
    // raio: punho → antebraço → cotovelo
    let r = 0.031 + 0.019 * Math.pow(z, 0.75);
    // punho franzido: o tecido sobra e embola sobre a luva (anéis apertados)
    const near = Math.exp(-z / 0.12);
    r += 0.0055 * Math.exp(-(((z - 0.028) / 0.022) ** 2));
    r += 0.0028 * near * Math.sin(z * 95 + Math.sin(th * 2 + z * 30) * 1.4) * (0.6 + 0.4 * Math.cos(th - 0.8));
    // dobras: anéis enviesados que circulam parcialmente
    let fold = 0;
    for (const f of folds) {
      const zz = z - f.z - Math.sin(th + f.a) * 0.04 * f.tw;
      fold += f.k * Math.exp(-((zz / f.w) ** 2)) * (0.5 + 0.5 * Math.cos(th - f.a));
    }
    fold += 0.025 * Math.sin(th * 3 + z * 9) * Math.sin(z * 14);
    // vincos longos do tecido puxado (ao longo do antebraço)
    fold += 0.018 * Math.sin(th * 5 + Math.sin(z * 6) * 1.5) * (1 - near);
    r *= 1 + fold * 1.35;
    // bainha do punho: degrau costurado (barra dobrada) e vinco da costura
    r += 0.0034 * (1 - smoothstep01((z - 0.034) / 0.007));
    r -= 0.0011 * Math.exp(-(((z - 0.029) / 0.0022) ** 2));
    // tecido cede embaixo (gravidade) e o antebraço engrossa (músculo)
    r += 0.0055 * z * Math.max(0, -Math.sin(th));
    r += 0.0055 * Math.exp(-(((z - 0.62) / 0.22) ** 2)) * (0.55 + 0.45 * Math.cos(th - 1.0));
    // seção elíptica (antebraço é mais largo que alto)
    p.setXYZ(i, Math.cos(th) * r * 1.1, Math.sin(th) * r * 0.86, z);
  }
  // comprimento real embutido (o triplanar da camuflagem não estica no eixo)
  g.scale(1, 1, SLEEVE_L);
  g.translate(0, 0, CUFF_L);
  g.computeVertexNormals();
  // skinning de 2 ossos: o começo da manga segue o eixo da MÃO (punho) e o
  // resto segue o antebraço — o pulso dobra liso em vez de quebrar em quina
  {
    const n = p.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const w = wristW(p.getZ(i));
      si[i * 4] = 0; si[i * 4 + 1] = 1;
      sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  const bWrist = new THREE.Bone(), bArm = new THREE.Bone();
  grp.add(bWrist, bArm);
  const sl = new THREE.SkinnedMesh(g, M.sleeve);
  sl.castShadow = sl.receiveShadow = true;
  sl.frustumCulled = false;
  grp.add(sl);
  grp.updateMatrixWorld(true);
  sl.bind(new THREE.Skeleton([bWrist, bArm]));
  grp.userData.bWrist = bWrist;
  grp.userData.bArm = bArm;
  // manguito da luva: tubo curto com skinning nos MESMOS ossos — o pulso
  // dobra junto, sem ponta rígida apontando para a câmera; tira de velcro
  {
    const cg = new THREE.CylinderGeometry(1, 1, 1, 28, 14, true);
    cg.rotateX(Math.PI / 2);
    cg.translate(0, 0, 0.5);
    const cp = cg.attributes.position;
    const sg = new THREE.TorusGeometry(1, 1, 8, 28);
    const sp = sg.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const th = Math.atan2(cp.getY(i), cp.getX(i));
      const t = cp.getZ(i);
      const z = -0.014 + t * (CUFF_L + 0.02);
      let r = 0.0285 + 0.0035 * t + 0.0006 * Math.sin(th * 7 + t * 9);
      cp.setXYZ(i, Math.cos(th) * r * 1.1, Math.sin(th) * r * 0.8, z);
    }
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), zz = sp.getZ(i);
      const th = Math.atan2(y, x);
      const rr = Math.hypot(x, y) - 1; // −1..1 (tubo)
      const r = 0.0318 + rr * 0.0018;
      sp.setXYZ(i, Math.cos(th) * r * 1.1, Math.sin(th) * r * 0.8, 0.008 + zz * 0.0065);
    }
    const mk = (geo, mat) => {
      geo.computeVertexNormals();
      const q = geo.attributes.position;
      const si = new Uint16Array(q.count * 4), sw = new Float32Array(q.count * 4);
      for (let i = 0; i < q.count; i++) {
        const w = wristW(q.getZ(i));
        si[i * 4 + 1] = 1;
        sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      const m = new THREE.SkinnedMesh(geo, M[mat]);
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      grp.add(m);
      m.bind(sl.skeleton, sl.bindMatrix);
      return m;
    };
    mk(cg, 'glove');
    mk(sg, 'strap');
  }
  // borda interna escura (abertura da manga) — esconde o vazio no punho
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.031, 20), M.cavity);
  cap.scale.set(1.1, 0.86, 1);
  cap.position.z = CUFF_L + 0.002;
  cap.rotation.y = Math.PI; // virada para o punho (−Z)
  bWrist.add(cap);
  grp.userData.sleeve = sl;
  grp.userData.cap = cap;

  if (watch) {
    // relógio tático: caixa de polímero, luneta, vidro escuro e pulseira
    const w = new Kit();
    w.add('polymer', rbox(0.04, 0.012, 0.042, 0.008, 0, 0, 0, 3));
    w.add('steel', rbox(0.034, 0.004, 0.036, 0.007, 0, 0.007, 0, 3));
    w.add('rubber', rbox(0.006, 0.006, 0.006, 0.002, 0.022, 0.002, -0.008, 1));
    w.add('rubber', rbox(0.006, 0.006, 0.006, 0.002, 0.022, 0.002, 0.008, 1));
    const band = new THREE.TorusGeometry(0.033, 0.0035, 6, 32);
    band.rotateY(Math.PI / 2);
    band.scale(1, 0.82, 1.0);
    band.translate(0, -0.028, 0);
    w.add('strap', band);
    const wg = w.build(M, 'watch');
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.0145, 32),
      new THREE.MeshPhysicalMaterial({ color: 0x0b0e10, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, emissive: new THREE.Color(0.004, 0.012, 0.009), emissiveIntensity: 1 }),
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.y = 0.0095;
    wg.add(glass);
    // ponteiros luminosos
    const hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.6, 0.35) });
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0004, 0.009), hm);
    h1.position.set(0.002, 0.0098, -0.004);
    h1.rotation.y = 0.5;
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0004, 0.012), hm);
    h2.position.set(-0.003, 0.0098, -0.002);
    h2.rotation.y = -1.1;
    wg.add(h1, h2);
    wg.scale.setScalar(0.82);
    grp.userData.watch = wg;
    bArm.add(wg);
  }
  return grp;
}
