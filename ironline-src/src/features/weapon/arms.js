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
import { crease, rbox, Kit } from './geo.js';
import { mulberry } from './textures.js';

// dimensões de mão grande enluvada (m)
const FINGERS = [
  // x da base, z da base, y da base, comprimentos [prox, médio, dist], raio
  { x: -0.029, z: -0.084, y: 0.001, L: [0.046, 0.028, 0.024], r: 0.0099 },
  { x: -0.0095, z: -0.088, y: 0.002, L: [0.05, 0.031, 0.025], r: 0.0102 },
  { x: 0.0098, z: -0.085, y: 0.001, L: [0.047, 0.03, 0.024], r: 0.0098 },
  { x: 0.0275, z: -0.077, y: -0.002, L: [0.037, 0.022, 0.021], r: 0.0088 },
];
const THUMB = { x: -0.03, y: -0.008, z: -0.022, L: [0.044, 0.034, 0.03], r: 0.0118 };

/** Cápsula afilada ao longo de −Z, base na origem. */
function taperCapsule(r0, r1, len, flat = 0.85) {
  const g = new THREE.CapsuleGeometry(1, 1, 6, 14);
  // cápsula unitária: cilindro y ∈ [−0.5, 0.5] + hemisférios de raio 1
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // t: 0 na base, 1 na ponta (contando os hemisférios)
    const yc = Math.max(-0.5, Math.min(0.5, v.y));
    const t = yc + 0.5;
    const r = r0 + (r1 - r0) * t;
    const capOff = v.y - yc; // parte do hemisfério (−1..1)
    // seção levemente achatada (dedo é mais largo que alto)
    const x = v.x * r * 1.04, z = v.z * r * flat;
    const y = t * len + capOff * r;
    // y → −Z (comprimento), z → Y (altura)
    p.setXYZ(i, x, z, -y);
  }
  g.computeVertexNormals();
  return g;
}

/** Palma: caixa arredondada deformada (mais larga nos nós, arco palmar). */
function palmGeo() {
  const g = rbox(0.078, 0.03, 0.094, 0.012, 0, 0, -0.045, 4);
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
    kn.add('knuckle', rbox(0.07, 0.009, 0.026, 0.004, 0.0, 0.0175, -0.074, 3));
    for (let i = 0; i < 4; i++) {
      const f = FINGERS[i];
      kn.add('knuckle', rbox(0.014, 0.006, 0.014, 0.003, f.x, 0.022, f.z + 0.004, 2));
    }
    // costuras/velcro no dorso
    kn.add('strap', rbox(0.05, 0.004, 0.022, 0.002, -0.004, 0.0165, -0.03, 2));
    const knG = kn.build(M, 'kn');
    this.mirror.add(knG);
    // punho da luva (manguito) com tira de velcro
    const cuff = new THREE.CylinderGeometry(0.03, 0.028, 0.035, 24, 1, true);
    cuff.rotateX(Math.PI / 2);
    cuff.scale(1.12, 0.74, 1);
    cuff.translate(0, 0, 0.016);
    this.mirror.add(mesh(crease(cuff, 1.2), 'glove'));
    const strap = rbox(0.06, 0.007, 0.022, 0.003, 0.002, 0.019, 0.012, 2);
    this.mirror.add(mesh(strap, 'strap'));
    const tab = rbox(0.012, 0.007, 0.02, 0.003, 0.031, 0.013, 0.012, 2);
    tab.rotateZ(-0.3);

    // dedos: cadeia de juntas
    this.fingers = FINGERS.map((f, fi) => {
      const joints = [];
      let parent = this.mirror;
      let pos = new THREE.Vector3(f.x, f.y, f.z);
      for (let s = 0; s < 3; s++) {
        const j = new THREE.Group();
        j.position.copy(pos);
        parent.add(j);
        const r0 = f.r * (1 - s * 0.07), r1 = f.r * (1 - (s + 1) * 0.07) * (s === 2 ? 0.92 : 1);
        const seg = mesh(crease(taperCapsule(r0, r1, f.L[s] - r1 * 0.3), 1.2), 'glove');
        j.add(seg);
        // reforço no dorso do segmento proximal
        if (s === 0) {
          const pad = rbox(r0 * 1.3, 0.0032, f.L[0] * 0.5, 0.0015, 0, r0 * 0.8, -f.L[0] * 0.5, 2);
          j.add(mesh(pad, 'knuckle'));
        }
        joints.push(j);
        parent = j;
        pos = new THREE.Vector3(0, 0, -f.L[s] + r1 * 0.15);
      }
      return joints;
    });
    // polegar
    {
      const cmc = new THREE.Group();
      cmc.position.set(THUMB.x, THUMB.y, THUMB.z);
      this.mirror.add(cmc);
      const meta = mesh(crease(taperCapsule(0.0165, 0.0125, THUMB.L[0], 0.8), 1.2), 'glove');
      cmc.add(meta);
      const mcp = new THREE.Group();
      mcp.position.set(0, 0, -THUMB.L[0]);
      cmc.add(mcp);
      mcp.add(mesh(crease(taperCapsule(0.0122, 0.0112, THUMB.L[1], 0.85), 1.2), 'glove'));
      const ip = new THREE.Group();
      ip.position.set(0, 0, -THUMB.L[1]);
      mcp.add(ip);
      ip.add(mesh(crease(taperCapsule(0.0112, 0.0098, THUMB.L[2] - 0.004, 0.85), 1.2), 'glove'));
      this.thumb = [cmc, mcp, ip];
    }
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
    t: [1.05, 0.62, 0.9, 0.35, 0.3],
  },
  // indicador no gatilho
  trigger: {
    f: [[0.75, 1.05, 0.55], [1.35, 1.45, 0.85], [1.4, 1.5, 0.85], [1.45, 1.5, 0.8]],
    spread: [0.0, 0.0, -0.04, -0.1],
    t: [1.05, 0.62, 0.9, 0.35, 0.3],
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
    let r = 0.0285 + 0.0135 * Math.pow(z, 0.8);
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
    r *= 1 + fold * 0.42;
    // seção elíptica (antebraço é mais largo que alto)
    p.setXYZ(i, Math.cos(th) * r * 1.1, Math.sin(th) * r * 0.86, z);
  }
  g.computeVertexNormals();
  const sl = new THREE.Mesh(g, M.sleeve);
  sl.castShadow = sl.receiveShadow = true;
  sl.frustumCulled = false;
  grp.add(sl);
  // borda interna escura (abertura da manga) — esconde o vazio no punho
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.031, 20), M.cavity);
  cap.scale.set(1.1, 0.86, 1);
  cap.position.z = 0.002;
  cap.rotation.y = Math.PI; // virada para o punho (−Z)
  grp.add(cap);
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
    grp.add(wg);
  }
  return grp;
}
