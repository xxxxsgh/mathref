/**
 * Braços em primeira pessoa: mãos com luvas táticas anatômicas, manguito com
 * velcro, mangas de camuflagem com dobras e relógio tático no pulso esquerdo.
 *
 * Mão (espaço local, mão DIREITA): punho na origem, dedos para −Z, palma
 * para −Y, dorso para +Y, polegar no lado −X. A esquerda é espelhada (o
 * WebGLRenderer inverte o winding sozinho para determinante negativo).
 *
 * A mão inteira (palma + 4 dedos + polegar) é UMA malha com skinning de 14
 * ossos. Proporções de mão masculina adulta com luva justa (largura nos nós
 * ≈ 8,3 cm, dedo médio ≈ 9,8 cm da junta MCP à ponta, dedos com ~2 mm de
 * folga entre si — nada de "luva de boxe"). A borda da palma perto dos nós é
 * ponderada nas falanges proximais, então ao fechar a mão os nós se
 * arredondam como numa mão de verdade; a eminência tenar segue o polegar.
 *
 * A luva tem painéis em cores de vértice (o material multiplica a trama):
 * dorso em tecido coyote, palma e pontas dos dedos em couro sintético
 * escuro, protetor de nós em TPU moldado baixo (segmentado entre os dedos),
 * almofadas nas falanges proximais, costuras laterais (fourchettes) em
 * relevo e vincos de flexão nas juntas.
 *
 * Poses de dedos: { f: [[mcp,pip,dip] × 4 dedos], spread: [4], t: [cmcYaw,
 * cmcPitch, cmcRoll, mcp, ip] } — ângulos em rad, flexão positiva fecha a mão.
 */
import * as THREE from 'three';
import { rbox, Kit, mergeGeometries } from './geo.js';
import { mulberry } from './textures.js';

// dimensões (m): base = junta MCP; comprimentos das falanges [prox, média, distal]
export const FINGERS = [
  { x: -0.0302, z: -0.086, y: 0.0012, L: [0.045, 0.026, 0.021], r: 0.0091 }, // indicador
  { x: -0.0101, z: -0.0895, y: 0.0022, L: [0.049, 0.029, 0.022], r: 0.0094 }, // médio
  { x: 0.0101, z: -0.0868, y: 0.0012, L: [0.046, 0.027, 0.021], r: 0.0089 }, // anelar
  { x: 0.0292, z: -0.0785, y: -0.0012, L: [0.036, 0.021, 0.019], r: 0.0079 }, // mínimo
];
// polegar: osso 0 = metacarpo (sai da base da palma), 1 = proximal, 2 = distal
export const THUMB = { x: -0.026, y: -0.0095, z: -0.018, L: [0.041, 0.032, 0.027], r: 0.0104, rad: [0.0132, 0.0111, 0.0103, 0.0093] };

const smoothstep01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sm = (a, b, t) => smoothstep01((t - a) / (b - a));
const gauss = (d, w) => Math.exp(-((d / w) ** 2));

// ─── cores dos painéis da luva (albedo linear) ───────────────────────────
const C_FAB = [0.05, 0.052, 0.035]; // tecido verde-oliva (dorso)
const C_LEA = [0.026, 0.025, 0.024]; // couro sintético (palma, pontas)
const C_TPU = [0.017, 0.017, 0.017]; // protetor moldado / almofadas
const C_PAN = [0.03, 0.031, 0.024]; // painel dorsal de borracha (verde quase preto)
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** z da junta MCP interpolado pela posição x (arco dos nós). */
function mcpZ(x) {
  const F = FINGERS;
  if (x <= F[0].x) return F[0].z + (x - F[0].x) * 0.12;
  if (x >= F[3].x) return F[3].z + (x - F[3].x) * -0.5;
  for (let i = 0; i < 3; i++) {
    if (x <= F[i + 1].x) {
      const t = (x - F[i].x) / (F[i + 1].x - F[i].x);
      return F[i].z + (F[i + 1].z - F[i].z) * t;
    }
  }
  return F[3].z;
}

/**
 * Palma: loft de seções superelípticas do punho até os nós, com arco
 * dorsal, eminências tenar/hipotenar, cavidade palmar, cabeças dos
 * metacarpos e protetor de nós moldado. Skinning: palma (0), proximais dos
 * dedos (fb[i]) perto dos nós e metacarpo do polegar (tb) na tenar.
 */
function palmGeo(fb, tb) {
  const NU = 34, NT = 44;
  const pos = [], col = [], skI = [], skW = [], idx = [];
  const zW = 0.012;
  for (let iu = 0; iu <= NU; iu++) {
    const u = iu / NU;
    const W = 0.0285 + 0.0125 * smoothstep01(u / 0.62);
    const H = 0.0152 - 0.0024 * smoothstep01((u - 0.3) / 0.7);
    // calota frontal (os dedos nascem dela): a seção encolhe no fim
    const cap = u < 0.8 ? 1 : Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2));
    const capS = 0.22 + 0.78 * cap;
    for (let it = 0; it < NT; it++) {
      const th = (it / NT) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const n = s > 0 ? 3.0 : 2.3;
      let x = W * Math.sign(c) * Math.abs(c) ** (2 / n);
      let y = H * Math.sign(s) * Math.abs(s) ** (2 / n);
      const xn = x / W;
      // dorso: cabeças dos metacarpos (nós) e leve arco transversal
      if (s > 0) {
        y += 0.0018 * (1 - xn * xn) * u;
        let kn = 0;
        for (const f of FINGERS) kn += gauss(x - f.x, 0.0068);
        y += 0.0021 * kn * gauss(u - 0.9, 0.08) * s;
        // tendões extensores: cristas suaves do nó em direção ao punho
        let tend = 0;
        for (const f of FINGERS) tend += gauss(x - f.x * (0.55 + 0.45 * u), 0.0035);
        y += 0.0006 * tend * sm(0.25, 0.7, u) * (1 - sm(0.8, 0.9, u)) * s;
      } else {
        // palma: tenar (lado do polegar, −X), hipotenar (+X), cavidade central
        const ten = gauss(x + 0.017, 0.012) * gauss(u - 0.35, 0.22);
        const hyp = gauss(x - 0.022, 0.011) * gauss(u - 0.55, 0.25);
        y -= (0.0055 * ten + 0.0036 * hyp) * -s;
        y += 0.0022 * gauss(x + 0.002, 0.012) * gauss(u - 0.62, 0.16) * -s;
        // calos na base dos dedos (almofadas da palma)
        y -= 0.0012 * gauss(u - 0.9, 0.06) * -s;
      }
      // protetor de nós: painel de TPU moldado, segmentado entre os dedos
      const padU = sm(0.69, 0.74, u) * (1 - sm(0.93, 0.97, u));
      const padX = 1 - sm(0.034, 0.038, Math.abs(x + 0.0005));
      let pad = padU * padX * sm(0.35, 0.6, s);
      let groove = 0;
      for (const gx of [-0.0202, 0.0, 0.0197]) groove += gauss(x - gx, 0.0014);
      y += (0.0024 - 0.0014 * groove) * pad;
      // painel dorsal de borracha fina sobre os metacarpos (borda em relevo)
      const dPanU = sm(0.24, 0.29, u) * (1 - sm(0.59, 0.64, u));
      const dPanX = 1 - sm(0.023, 0.027, Math.abs(x + 0.002 - 0.003 * u));
      const dpan = dPanU * dPanX * sm(0.35, 0.6, s);
      y += 0.001 * dpan;
      // eixo: z do punho até os nós (a palma vai além dos nós na face palmar: membrana)
      const zf = mcpZ(x) + 0.004 + 0.009 * Math.min(0, s);
      const z = zW + (zf - zW) * u;
      x *= capS;
      const yc = -0.0015;
      y = yc + (y - yc) * capS;
      pos.push(x, y, z);
      // ─ cores dos painéis ─
      const pal = sm(0.05, -0.25, s); // 1 = face palmar
      let C = mix3(C_FAB, C_LEA, pal);
      C = mix3(C, C_TPU, pad);
      C = mix3(C, C_PAN, dpan * 0.9);
      // costuras: lateral (palma/dorso), borda do protetor e do painel, faixa do punho
      let seam = gauss(s + 0.1, 0.05);
      seam += gauss(padU * padX - 0.5, 0.18) * (s > 0.3 ? 1 : 0) * 0.7;
      seam += gauss(u - 0.16, 0.012) * (s > -0.2 ? 0.8 : 0);
      seam += gauss(dpan - 0.5, 0.16) * (s > 0.3 ? 0.8 : 0);
      const dk = 1 - 0.45 * Math.min(1, seam);
      col.push(C[0] * dk, C[1] * dk, C[2] * dk);
      // ─ skinning ─
      const wf = sm(0.7, 1.0, u) * 0.7;
      const ws = FINGERS.map((f) => gauss(x / capS - f.x, 0.0105));
      const order = [0, 1, 2, 3].sort((a, b) => ws[b] - ws[a]);
      const a = order[0], b = order[1];
      const sum = ws[a] + ws[b] || 1;
      const wA = (wf * ws[a]) / sum, wB = (wf * ws[b]) / sum;
      const wT = 0.45 * gauss(x + 0.022, 0.012) * gauss(u - 0.4, 0.2) * sm(0.2, -0.4, s);
      const wP = Math.max(0, 1 - wA - wB - wT);
      skI.push(0, fb[a], fb[b], tb);
      skW.push(wP, wA, wB, wT);
    }
  }
  for (let iu = 0; iu < NU; iu++) {
    for (let it = 0; it < NT; it++) {
      const a = iu * NT + it, b = iu * NT + ((it + 1) % NT), c2 = a + NT, d = b + NT;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skW, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Tubo de um dígito (dedo/polegar) com pesos de skinning, ao longo de −Z a
 * partir da junta-base (x, y, z). sj = posições das 3 juntas ao longo do
 * eixo; len = comprimento até a ponta; rad = raios [base, médio, distal,
 * ponta]; bones = [palma, b0, b1, b2].
 */
function digitTube({ x, y, z, sj, len, rad, back = 0.014, bones, thumb = false }) {
  const SEG = 22;
  const r = rad[1];
  // estações: densas nas juntas e na ponta
  const st = [];
  for (let s = -back; s < len - r * 1.15; s += 0.0022) st.push(s);
  for (let k = 0; k <= 12; k++) st.push(len - r * 1.15 + r * 1.15 * Math.sin((k / 12) * Math.PI / 2));
  const radAt = (s) => {
    if (s <= 0) return rad[0];
    if (s >= sj[2]) return rad[2] + (rad[3] - rad[2]) * Math.min(1, (s - sj[2]) / (len - sj[2]));
    if (s >= sj[1]) return rad[1] + (rad[2] - rad[1]) * ((s - sj[1]) / (sj[2] - sj[1]));
    return rad[0] + (rad[1] - rad[0]) * (s / sj[1]);
  };
  const pos = [], col = [], skI = [], skW = [], idx = [];
  const tipSeam = sj[2] + (len - sj[2]) * 0.3; // borda do reforço de couro da ponta
  const padC = sj[0] + (sj[1] - sj[0]) * 0.5, padH = (sj[1] - sj[0]) * 0.3;
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    const rr = radAt(s);
    const tipStart = len - rr * 1.15;
    const cap = s > tipStart ? Math.sqrt(Math.max(0, 1 - ((s - tipStart) / (len - tipStart)) ** 2)) : 1;
    // pesos: palma → b0 → b1 → b2
    const t0 = sm(-r * 0.9, r * 0.5, s), t1 = sm(sj[1] - r * 0.5, sj[1] + r * 0.45, s), t2 = sm(sj[2] - r * 0.45, sj[2] + r * 0.4, s);
    const w = [1 - t0, t0 - t1, t1 - t2, t2];
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      let k = rr;
      for (let q = 1; q < 3; q++) {
        const g = gauss(s - sj[q], r * 0.75);
        // junta: nó saliente no dorso, vinco de flexão na palma, tecido franzido
        k += r * 0.07 * g * Math.max(0, sn);
        k -= r * 0.1 * gauss(s - sj[q], r * 0.2) * Math.max(0, -sn);
        k += r * 0.03 * Math.sin(s * 1500 + th * 2) * g * Math.max(0, sn);
      }
      // polpas das falanges na face palmar
      for (let q = 0; q < 3; q++) {
        const a = sj[q], b = q < 2 ? sj[q + 1] : len;
        k += r * 0.07 * gauss(s - (a + b) / 2, (b - a) * 0.3) * Math.max(0, -sn);
      }
      // almofada de TPU na falange proximal (dedos, dorso)
      let pad = 0;
      if (!thumb) {
        pad = (1 - sm(padH * 0.8, padH * 1.15, Math.abs(s - padC))) * sm(0.45, 0.7, sn);
        k += r * 0.09 * pad;
      }
      // costura lateral (fourchette) em relevo, um pouco para a palma
      const seamS = gauss(sn + 0.18, 0.07) * (s > -0.004 ? 1 : 0);
      k += r * 0.025 * seamS;
      // ponta: dorso achatado (unha sob a luva)
      const flat = s > sj[2] ? 1 - 0.1 * Math.max(0, sn) * sm(sj[2], len, s) : 1;
      k *= cap;
      const ex = thumb ? 1.06 : 1.0, ey = thumb ? 0.9 : 0.92 * flat;
      pos.push(x + c * k * ex, y + sn * k * ey, z - s);
      // cores: dorso tecido; palma e reforço da ponta em couro; almofada TPU
      const pal = sm(0.0, -0.3, sn);
      const tip = sm(tipSeam - 0.0012, tipSeam + 0.0008, s + Math.max(0, -sn) * 0.012);
      let C = mix3(C_FAB, C_LEA, Math.max(pal, tip));
      C = mix3(C, C_TPU, pad);
      let seam = seamS * (1 - tip) + gauss(s + Math.max(0, -sn) * 0.012 - tipSeam, 0.0009) * 0.8;
      if (!thumb) seam += gauss((1 - sm(padH * 0.8, padH * 1.15, Math.abs(s - padC))) * sm(0.45, 0.7, sn) - 0.5, 0.2) * 0.5 * (sn > 0.3 ? 1 : 0);
      const dk = 1 - 0.45 * Math.min(1, seam);
      col.push(C[0] * dk, C[1] * dk, C[2] * dk);
      skI.push(bones[0], bones[1], bones[2], bones[3]);
      skW.push(w[0], w[1], w[2], w[3]);
    }
  }
  for (let i = 0; i < st.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
    // esqueleto: palma + 3 por dedo + 3 do polegar (THREE.Bone na mesma
    // hierarquia que o resolvedor de pega usa)
    const palmBone = new THREE.Bone();
    this.mirror.add(palmBone);
    const bones = [palmBone];
    const digitGeos = [];
    const fb = [];
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
        if (k < 2) sj.push(sj[k] + f.L[k]);
        pos = new THREE.Vector3(0, 0, -f.L[k]);
      }
      fb.push(bones.length - 3);
      const len = sj[2] + f.L[2];
      const rad = [f.r * 1.04, f.r * 0.97, f.r * 0.91, f.r * 0.84];
      digitGeos.push(digitTube({ x: f.x, y: f.y, z: f.z, sj, len, rad, back: 0.018, bones: [0, bones.length - 3, bones.length - 2, bones.length - 1] }));
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
      digitGeos.push(digitTube({ x: THUMB.x, y: THUMB.y, z: THUMB.z, sj: [0, THUMB.L[0], THUMB.L[0] + THUMB.L[1]], len: THUMB.L[0] + THUMB.L[1] + THUMB.L[2], rad: THUMB.rad, back: 0.01, thumb: true, bones: [0, n - 3, n - 2, n - 1] }));
      digitGeos.push(palmGeo(fb, n - 3));
    }
    const dg = mergeGeometries(digitGeos, false);
    const skin = new THREE.SkinnedMesh(dg, M.gloveV || M.glove);
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
    let r = 0.0275 + 0.019 * Math.pow(z, 0.75);
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
    r *= 1 + fold * 1.0;
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
      let r = 0.0262 + 0.0035 * t + 0.0006 * Math.sin(th * 7 + t * 9);
      cp.setXYZ(i, Math.cos(th) * r * 1.1, Math.sin(th) * r * 0.8, z);
    }
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), zz = sp.getZ(i);
      const th = Math.atan2(y, x);
      const rr = Math.hypot(x, y) - 1; // −1..1 (tubo)
      const r = 0.0293 + rr * 0.0018;
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
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), M.cavity);
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
    // lume de dia: quase apagado (o verde aceso lia como brinquedo)
    const hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.12, 0.1) });
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
