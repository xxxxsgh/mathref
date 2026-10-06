/**
 * Facas (design original): TK-7 (padrão), karambit, balisong (borboleta),
 * tanto, baioneta, kukri e cutelo — modelos procedurais chanfrados, pega
 * própria resolvida contra o cabo de cada uma, golpes e inspeções por modelo.
 *
 * Convenção (igual à TK-7 de equipment.js): cabo para +Z, lâmina para −Z,
 * fio para −Y, dorso +Y, origem na guarda.
 *
 * Lâmina = loft ao longo de uma LINHA DE CENTRO (curva para karambit/kukri):
 * cada estação tem dorso, linha de afiação e fio; a seção vai do dorso
 * (espessura cheia, com sulco/"fuller" opcional) até o chanfro de afiação
 * (material claro) que fecha no fio. Assim o desgaste de quina do shader
 * pega o fio e o dorso, e a skin pinta os flancos.
 *
 * `makeKnifeRig(M, handR, id)` devolve um objeto no formato de arma de
 * guns.js (consumido por index.js) para a faca NA MÃO (tecla 3): pose de
 * espera, golpes (swing/swing2), inspeção por modelo (balisong abre/fecha,
 * karambit gira no dedo, tanto é jogada e pega, …).
 */
import * as THREE from 'three';
import { Kit, rbox, cylZ, cylX, cylY, torus, crease, side } from './geo.js';
import { buildKnife } from './equipment.js';
import { Hand, POSES, clonePose } from './arms.js';
import { fitHand, sdCapsule } from './grip.js';
import { basis } from './guns.js';
import { Track } from './anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ─── loft da lâmina ──────────────────────────────────────────────────────
/**
 * spec:
 *  L        comprimento da linha de centro (m)
 *  path(s)  → [y, z] da linha de centro (s ∈ 0..1); padrão reta para −Z
 *  prof(s)  → { spine, edge, grind, h } offsets ao longo da normal (dorso > 0)
 *  fuller   { s0, s1, v, w, d } sulco: faixa na altura relativa v (0 = linha
 *           de afiação, 1 = dorso), meia-largura w, profundidade relativa d
 */
export function bladeLoft({ L = 0.16, N = 48, K = 6, path = null, prof, fuller = null }) {
  const P = path || ((s) => [0, -s * L]);
  const flats = { pos: [], idx: [] }, edge = { pos: [], idx: [] };
  const cols = 2 * (K + 1);
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const [cy, cz] = P(s);
    const [y2, z2] = P(Math.min(1, s + 1e-3));
    const [y1, z1] = P(Math.max(0, s - 1e-3));
    let tz = z2 - z1, ty = y2 - y1;
    const m = Math.hypot(tz, ty) || 1;
    tz /= m;
    ty /= m;
    const nz = ty, ny = -tz; // normal (lado do dorso)
    const p = prof(s);
    const tip = i === N ? 0 : 1;
    const at = (o) => [cy + ny * o, cz + nz * o];
    // flancos: linha de afiação → dorso (lado +X) e volta (lado −X)
    const side1 = [], side2 = [];
    for (let k = 0; k <= K; k++) {
      const v = k / K;
      const o = p.grind + (p.spine - p.grind) * v;
      let w = p.h * tip;
      // engrossa levemente do chanfro para o dorso (seção em cunha plana)
      w *= 0.82 + 0.18 * v;
      if (fuller && s > fuller.s0 && s < fuller.s1) {
        const fz = smooth(fuller.s0, fuller.s0 + 0.04, s) * (1 - smooth(fuller.s1 - 0.04, fuller.s1, s));
        const dv = Math.abs(v - fuller.v) / fuller.w;
        if (dv < 1) w *= 1 - fuller.d * fz * Math.sqrt(1 - dv * dv);
      }
      const [y, z] = at(o);
      side1.push([w, y, z]);
      side2.push([-w, y, z]);
    }
    for (const q of side1) flats.pos.push(...q);
    for (const q of side2.reverse()) flats.pos.push(...q);
    // chanfro do fio: grind− → fio → grind+
    const [gy, gz] = at(p.grind);
    const [ey, ez] = at(p.edge);
    const gw = p.h * tip * 0.82;
    edge.pos.push(-gw, gy, gz, 0, ey, ez, gw, gy, gz);
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = b + cols;
      flats.idx.push(a, c, b, b, c, d);
    }
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j, b = a + 1, c = a + 3, d = b + 3;
      edge.idx.push(a, c, b, b, c, d);
    }
  }
  const mk = (o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setIndex(o.idx);
    g.computeVertexNormals();
    return crease(g, 0.55);
  };
  // tampa traseira da lâmina (fica dentro da guarda/cabo, mas fecha a silhueta)
  return { flats: mk(flats), edge: mk(edge) };
}

/** Loft de cabo: seção elíptica (rx, ry) ao longo de z com raio r(t) e centro y(t). */
function handleLoft({ z0, L, NZ = 28, NT = 20, r, cy = () => 0, sx = 0.78, sy = 1.12, texture = null }) {
  const pos = [], idx = [];
  for (let i = 0; i <= NZ; i++) {
    const t = i / NZ;
    const z = z0 + t * L;
    const rr = r(t);
    for (let j = 0; j < NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const tx = texture ? texture(t, th, z) : 0;
      pos.push(Math.cos(th) * (rr + tx) * sx, Math.sin(th) * (rr + tx) * sy + cy(t), z);
    }
  }
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * NT + j, b = i * NT + ((j + 1) % NT), c = a + NT, d = b + NT;
      idx.push(a, b, c, b, d, c);
    }
  }
  // tampas
  const cap = (i, flip) => {
    const c0 = pos.length / 3;
    const t = i / NZ;
    pos.push(0, cy(t), z0 + t * L);
    for (let j = 0; j < NT; j++) {
      const a = i * NT + j, b = i * NT + ((j + 1) % NT);
      if (flip) idx.push(c0, b, a);
      else idx.push(c0, a, b);
    }
  };
  cap(0, true);
  cap(NZ, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Placa de cabo (escala) com perfil lateral (u = −z, v = y) e espessura w no lado sx. */
function scale(K, mat, pts, w, sx, x0) {
  K.add(mat, side(pts.map(([z, y]) => [-z, y]), w, { b: Math.min(0.0012, w * 0.3), seg: 2, cx: sx * (x0 + w / 2) }));
}

// ─── modelos ─────────────────────────────────────────────────────────────
/** Acabamento de fábrica da lâmina de cada faca (material 'blade' clonado por faca). */
const FINISH = {
  tk7: [0x262626, 0.38, 0.8],
  karambit: [0x2b2c2e, 0.48, 0.75], // stonewash escuro
  balisong: [0x9b9c9a, 0.3, 1.0], // inox acetinado
  tanto: [0x1d1e1f, 0.42, 0.7], // revestimento preto
  bayonet: [0x8f918f, 0.33, 1.0],
  kukri: [0x5a5853, 0.45, 0.95], // aço carbono forjado
  cleaver: [0xa2a3a1, 0.28, 1.0],
};

function karambit(M, K) {
  // lâmina em garra: linha de centro curva para baixo
  const L = 0.085;
  const path = (s) => {
    const a = s * 1.25;
    const R = L / 1.25;
    return [-(1 - Math.cos(a)) * R * 0.9 - s * 0.004, -Math.sin(a) * R];
  };
  const prof = (s) => ({
    spine: 0.0105 * (1 - s * 0.55) - 0.009 * smooth(0.7, 1, s),
    edge: -0.0105 * (1 - s * 0.45) + 0.0095 * smooth(0.75, 1, s),
    grind: -0.002 - 0.004 * (1 - s),
    h: 0.0021 * (s < 0.85 ? 1 : 1 - 0.75 * smooth(0.85, 1, s)),
  });
  const b = bladeLoft({ L, path, prof });
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // jimping (serrilha do polegar) no dorso
  for (let i = 0; i < 6; i++) {
    const [y, z] = path(0.06 + i * 0.03);
    K.add('blade', rbox(0.0046, 0.0016, 0.0012, 0.0003, 0, y + 0.0108, z, 1));
  }
  // cabo curvo (espiga + escalas de G10) e argola do dedo
  const hp = [[0.0, 0.011], [0.075, 0.016], [0.088, 0.008], [0.09, -0.012], [0.07, -0.016], [0.035, -0.014], [0.0, -0.011]];
  K.add('blade', side(hp.map(([z, y]) => [-z, y + 0.002 - z * 0.12]), 0.0042, { b: 0.0008 }));
  for (const sx of [-1, 1]) scale(K, 'g10', [[0.004, 0.0095], [0.07, 0.0135], [0.078, 0.004], [0.075, -0.012], [0.04, -0.0125], [0.004, -0.009]].map(([z, y]) => [z, y + 0.002 - z * 0.12]), 0.0032, sx, 0.0021);
  // argola
  const ringZ = 0.098, ringY = -0.009;
  K.add('blade', torus(0.0145, 0.0042, 0, ringY, ringZ, 0, Math.PI / 2, 0));
  K.add('g10', torus(0.0145, 0.0047, 0, ringY, ringZ, 0, Math.PI / 2, 0, Math.PI * 0.9).rotateX(0));
  // parafusos Torx das escalas
  for (const z of [0.022, 0.058]) for (const sx of [-1, 1]) K.add('steel', cylX(0.0022, 0.0012, sx * 0.0055, 0.0005 - z * 0.12, z, 14));
  return { handle: { a: V(0, 0.0, 0.01), b: V(0, -0.006, 0.075), r: 0.011 }, ring: { y: ringY, z: ringZ, r: 0.0145 }, len: 0.21, zRear: 0.115 };
}

function balisongBlade(M, K) {
  const L = 0.1;
  const prof = (s) => ({
    spine: 0.0085 - 0.0115 * smooth(0.6, 1, s) ** 1.2,
    edge: -0.0115 + 0.0098 * smooth(0.55, 1, s) ** 1.6,
    grind: -0.003,
    h: 0.0019 * (s < 0.88 ? 1 : 1 - 0.7 * smooth(0.88, 1, s)),
  });
  const b = bladeLoft({ L, prof, fuller: { s0: 0.08, s1: 0.5, v: 0.55, w: 0.22, d: 0.4 } });
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // espiga com os dois pinos de pivô e o pino de parada
  K.add('blade', side([[0.0, 0.0085], [0.014, 0.0085], [0.017, 0.004], [0.017, -0.009], [0.012, -0.0115], [0.0, -0.0115]].map(([z, y]) => [-z, y]), 0.0042, { b: 0.0007 }));
  for (const y of [0.0055, -0.0085]) K.add('steel', cylX(0.0024, 0.0052, 0, y, 0.008, 16));
  K.add('steel', cylX(0.0016, 0.012, 0, -0.0015, 0.015, 12));
}
/**
 * Cabo de canal da balisong (alumínio vazado), pivô na origem, ao longo de +Z.
 * Aberto, os dois cabos se encontram no meio (y entre os pinos) e formam um
 * tubo retangular; fechados, cada um gira 180° no próprio pino e cobre a
 * lâmina pelo lado do dorso (segurança) ou do fio ("mordida").
 */
function balisongHandle(M, bite) {
  const K = new Kit();
  const L = 0.118, IN = 0.007, OUT = 0.003, W = 0.0042;
  const sg = bite ? -1 : 1; // segurança: corpo para baixo do pino; mordida: para cima
  const y = (v) => v * sg;
  const prof = [[-0.005, y(OUT * 0.4)], [-0.002, y(OUT)], [L, y(OUT)], [L + 0.004, y(OUT - 0.004)], [L + 0.002, y(-IN)], [0.006, y(-IN)], [-0.004, y(-IN * 0.4)]].map(([z, yy]) => [-z, yy]);
  const holes = [];
  for (let i = 0; i < 5; i++) {
    const z = 0.022 + i * 0.019;
    const c = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 * (bite ? -1 : 1);
      c.push([-(z + Math.cos(a) * 0.0058), y(-IN / 2 + OUT / 2) + Math.sin(a) * 0.0024]);
    }
    holes.push(c);
  }
  for (const sx of [-1, 1]) K.add('alu', side(prof, W, { b: 0.0008, seg: 2, holes, cx: sx * (0.0045 + W / 2) }));
  // fundo do canal (lado de fora) e pinos/espaçadores
  K.add('alu', rbox(0.009, 0.0014, L - 0.004, 0.0005, 0, y(OUT - 0.0007), L / 2 + 0.001));
  K.add('steel', cylX(0.0021, 0.0186, 0, 0, 0, 14));
  K.add('steel', cylX(0.0019, 0.0186, 0, y(-IN / 2 + OUT / 2), L - 0.002, 14));
  // trava (latch) só no cabo de segurança, presa no fim
  if (!bite) K.add('steel', rbox(0.0036, 0.0016, 0.028, 0.0006, 0, -IN + 0.0006, L - 0.008));
  const g = new THREE.Group();
  g.add(K.build(M, bite ? 'bite' : 'safe'));
  return g;
}

function tanto(M, K) {
  const L = 0.13;
  // tanto: fio reto até a quebra (s = 0.82), depois o fio sobe em ângulo até a ponta
  const prof = (s) => ({
    spine: 0.0095 - 0.002 * smooth(0.7, 1, s) - 0.0015 * smooth(0.95, 1, s),
    edge: s < 0.82 ? -0.0135 : -0.0135 + (0.0135 + 0.0065) * ((s - 0.82) / 0.18),
    grind: s < 0.82 ? -0.0055 : -0.0055 + (0.0055 + 0.0045) * ((s - 0.82) / 0.18) ** 0.8,
    h: 0.0024 * (s < 0.9 ? 1 : 1 - 0.7 * smooth(0.9, 1, s)),
  });
  const b = bladeLoft({ L, prof, N: 60 });
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // linha da quebra (aresta secundária) marcada com um filete claro
  K.add('edge', rbox(0.0052, 0.0105, 0.0005, 0.0002, 0, -0.004, -0.82 * L + 0.0004));
  // espiga exposta (aço) com escalas de micarta e furos
  const tang = [[0.0, 0.0095], [0.1, 0.0105], [0.108, 0.006], [0.108, -0.011], [0.1, -0.0135], [0.0, -0.0135]];
  K.add('blade', side(tang.map(([z, y]) => [-z, y]), 0.0048, { b: 0.0008 }));
  for (const sx of [-1, 1]) scale(K, 'micarta', [[0.006, 0.0085], [0.096, 0.0095], [0.1, 0.004], [0.1, -0.01], [0.096, -0.0122], [0.006, -0.012]], 0.0038, sx, 0.0024);
  for (const z of [0.025, 0.07]) K.add('steel', cylX(0.003, 0.0145, 0, -0.0015, z, 16));
  K.add('cavity', cylX(0.0028, 0.0152, 0, -0.002, 0.1, 12));
  return { handle: { a: V(0, -0.0015, 0.008), b: V(0, -0.0015, 0.098), r: 0.0118 }, len: 0.24, zRear: 0.108 };
}

function bayonet(M, K) {
  const L = 0.17;
  const prof = (s) => ({
    spine: 0.0095 - 0.0128 * smooth(0.72, 1, s) ** 1.2,
    edge: -0.0135 + 0.0118 * smooth(0.62, 1, s) ** 1.5,
    grind: -0.0062 + 0.002 * smooth(0.6, 1, s),
    h: 0.0026 * (s < 0.88 ? 1 : 1 - 0.75 * smooth(0.88, 1, s)),
  });
  const b = bladeLoft({ L, prof, N: 60, fuller: { s0: 0.06, s1: 0.62, v: 0.55, w: 0.2, d: 0.55 } });
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // serrilha no dorso (perto da guarda)
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Matrix4().makeRotationX(0.55).setPosition(0, 0.0098, -(0.014 + i * 0.0052));
    K.add('blade', rbox(0.0042, 0.0026, 0.0034, 0.0006), m);
  }
  // guarda com anel de boca (em cima) e quillon
  K.add('steel', rbox(0.012, 0.044, 0.007, 0.002, 0, -0.004, 0.003));
  K.add('steel', torus(0.0095, 0.0024, 0, 0.026, 0.003, 0, 0, 0));
  // cabo de polímero com nervuras + pomo com trava de baioneta
  K.add('polymer', handleLoft({ z0: 0.007, L: 0.1, r: (t) => 0.0122 + 0.0012 * Math.sin(Math.PI * t), cy: () => -0.003, texture: (t, th) => (t > 0.08 && t < 0.9 ? -0.0008 * (Math.sin(t * 60) > 0.6 ? 1 : 0) : 0) }));
  K.add('steel', rbox(0.02, 0.03, 0.022, 0.004, 0, -0.003, 0.118));
  K.add('cavity', rbox(0.0205, 0.0062, 0.016, 0.0016, 0, 0.004, 0.122));
  K.add('steel', rbox(0.006, 0.006, 0.01, 0.0015, -0.0105, -0.006, 0.112));
  return { handle: { a: V(0, -0.003, 0.01), b: V(0, -0.003, 0.104), r: 0.0128 }, len: 0.31, zRear: 0.13 };
}

function kukri(M, K) {
  const L = 0.17;
  // lâmina recurvada: dobra para baixo no meio, barriga larga perto da ponta
  const path = (s) => {
    const z = -s * L;
    const y = -0.03 * Math.sin(Math.min(1, s * 1.15) * Math.PI * 0.5) ** 1.3 + 0.008 * s;
    return [y, z];
  };
  const prof = (s) => ({
    spine: 0.008 + 0.006 * Math.sin(Math.PI * s) * (1 - smooth(0.85, 1, s)) - 0.012 * smooth(0.86, 1, s),
    edge: -0.011 - 0.018 * Math.sin(Math.PI * Math.min(1, s * 1.05)) ** 1.5 * (1 - smooth(0.8, 1, s)) + 0.01 * smooth(0.85, 1, s),
    grind: -0.005 - 0.008 * Math.sin(Math.PI * s) * (1 - smooth(0.85, 1, s)),
    h: 0.003 * (s < 0.85 ? 1 : 1 - 0.75 * smooth(0.85, 1, s)),
  });
  const b = bladeLoft({ L, path, prof, N: 64 });
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // "cho" (entalhe) perto do cabo, no fio
  K.add('cavity', cylX(0.0024, 0.007, 0, -0.0115, -0.007, 14));
  // reforço de latão e cabo de madeira com pomo alargado
  K.add('brass', rbox(0.016, 0.03, 0.01, 0.003, 0, -0.002, 0.004));
  K.add('wood', handleLoft({ z0: 0.009, L: 0.105, r: (t) => 0.0122 + 0.0016 * Math.sin(Math.PI * t * 0.9) - 0.0016 * Math.sin(Math.PI * t * 2) * (t > 0.3 && t < 0.7 ? 1 : 0.4) + 0.005 * smooth(0.82, 1, t), cy: (t) => -0.002 - 0.006 * t * t }));
  K.add('brass', rbox(0.02, 0.026, 0.004, 0.002, 0, -0.008, 0.115));
  for (const z of [0.035, 0.075]) K.add('brass', cylX(0.0022, 0.022, 0, -0.003 - 0.004 * (z / 0.1) ** 2, z, 12));
  return { handle: { a: V(0, -0.002, 0.012), b: V(0, -0.006, 0.105), r: 0.0128 }, len: 0.3, zRear: 0.12 };
}

function cleaver(M, K) {
  const L = 0.155;
  const prof = (s) => ({
    spine: 0.012 - 0.003 * smooth(0.94, 1, s),
    edge: -0.062 + 0.004 * s + 0.07 * smooth(0.965, 1, s) ** 1.5,
    grind: -0.048 + 0.003 * s + 0.055 * smooth(0.965, 1, s) ** 1.5,
    h: 0.0026 * (s < 0.96 ? 1 : 1 - 0.6 * smooth(0.96, 1, s)),
  });
  const b = bladeLoft({ L, prof, N: 50, K: 8 });
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // furo de pendurar no canto do dorso
  K.add('cavity', cylX(0.0058, 0.0062, 0, 0.0, -0.132, 22));
  K.add('steel', torus(0.0058, 0.0007, 0, 0.0, -0.132, 0, Math.PI / 2, 0));
  // espiga + cabo de madeira com 3 rebites de latão
  K.add('blade', side([[0.0, 0.009], [0.11, 0.008], [0.115, 0.003], [0.115, -0.012], [0.11, -0.016], [0.0, -0.016]].map(([z, y]) => [-z, y]), 0.0045, { b: 0.0008 }));
  for (const sx of [-1, 1]) scale(K, 'wood', [[0.008, 0.0075], [0.106, 0.0068], [0.11, 0.002], [0.11, -0.011], [0.106, -0.0145], [0.008, -0.0145]], 0.0042, sx, 0.0023);
  for (const z of [0.025, 0.055, 0.085]) K.add('brass', cylX(0.0028, 0.0135, 0, -0.0035, z, 16));
  return { handle: { a: V(0, -0.0035, 0.01), b: V(0, -0.0035, 0.106), r: 0.0122 }, len: 0.27, zRear: 0.115 };
}

/**
 * Especificações por faca: geometria do cabo para a pega, pega (reversa ou
 * martelo), golpe e inspeção. `bounds` para o degradê da skin.
 */
export const KNIFE_MODELS = {
  tk7: { handle: { a: V(0, -0.006, 0.012), b: V(0, -0.006, 0.122), r: 0.0122 }, bounds: { zRear: 0.135, len: 0.3 }, style: 'slash', inspect: 'turn' },
  karambit: { bounds: { zRear: 0.115, len: 0.21 }, style: 'hook', inspect: 'twirl', reverse: true },
  balisong: { handle: { a: V(0, -0.0015, 0.008), b: V(0, -0.0015, 0.115), r: 0.0108 }, bounds: { zRear: 0.125, len: 0.23 }, style: 'thrust', inspect: 'flip' },
  tanto: { bounds: { zRear: 0.108, len: 0.24 }, style: 'slash', inspect: 'toss' },
  bayonet: { bounds: { zRear: 0.13, len: 0.31 }, style: 'thrust', inspect: 'turn' },
  kukri: { bounds: { zRear: 0.12, len: 0.3 }, style: 'chop', inspect: 'heft' },
  cleaver: { bounds: { zRear: 0.115, len: 0.27 }, style: 'chop', inspect: 'spin' },
};

/**
 * Modelo da faca `id` (Group). Partes móveis em userData: balisong →
 * { safe, bite } (cabos com pivô). userData.info = { handle, ring? }.
 */
export function buildKnifeModel(M, id) {
  const f = FINISH[id] || FINISH.tk7;
  if (M.blade?.color && Object.prototype.hasOwnProperty.call(M, 'blade')) {
    M.blade.color.setHex(f[0]);
    M.blade.roughness = f[1];
    M.blade.metalness = f[2];
  }
  if (id === 'tk7' || !KNIFE_MODELS[id]) {
    const k = buildKnife(M);
    k.userData.info = { handle: KNIFE_MODELS.tk7.handle };
    return k;
  }
  const root = new THREE.Group();
  root.name = 'knife:' + id;
  const K = new Kit();
  let info = {};
  if (id === 'karambit') info = karambit(M, K);
  else if (id === 'tanto') info = tanto(M, K);
  else if (id === 'bayonet') info = bayonet(M, K);
  else if (id === 'kukri') info = kukri(M, K);
  else if (id === 'cleaver') info = cleaver(M, K);
  else if (id === 'balisong') {
    balisongBlade(M, K);
    info = { handle: KNIFE_MODELS.balisong.handle };
  }
  root.add(K.build(M, id));
  if (id === 'balisong') {
    const safe = balisongHandle(M, false);
    const bite = balisongHandle(M, true);
    safe.position.set(0, 0.0055, 0.008);
    bite.position.set(0, -0.0085, 0.008);
    root.add(safe, bite);
    root.userData.safe = safe;
    root.userData.bite = bite;
  }
  root.userData.info = info;
  return root;
}

// ─── trilhas (faca na mão) ───────────────────────────────────────────────
// [px, py, pz, rx, ry, rz] somados à pose de espera (espaço da câmera)
const Z6 = [0, 0, 0, 0, 0, 0];
const T = (keys) => new Track(keys);

/** Golpes por estilo. kind: 'swing' | 'swing2' | 'quick' (golpe rápido com a arma na mão). */
export function knifeSwing(id, kind = 'swing') {
  const style = KNIFE_MODELS[id]?.style || 'slash';
  if (kind === 'quick') return quickMelee(style);
  const D = style === 'chop' ? 0.62 : style === 'thrust' ? 0.5 : 0.48;
  let keys;
  const alt = kind === 'swing2';
  if (style === 'slash') {
    keys = alt
      ? [{ t: 0, v: Z6 }, { t: 0.1, v: [-0.06, 0.05, 0.02, 0.2, -0.5, 0.9], e: 'out' }, { t: 0.2, v: [0.16, -0.06, -0.08, -0.1, 0.7, -0.6], e: 'in' }, { t: 0.3, v: [0.2, -0.1, -0.02, -0.2, 0.8, -0.8], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }]
      : [{ t: 0, v: Z6 }, { t: 0.1, v: [0.08, 0.07, 0.02, 0.35, 0.6, -0.8], e: 'out' }, { t: 0.2, v: [-0.2, -0.05, -0.1, -0.2, -0.7, 0.5], e: 'in' }, { t: 0.3, v: [-0.24, -0.1, -0.04, -0.3, -0.8, 0.6], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }];
  } else if (style === 'hook') {
    keys = alt
      ? [{ t: 0, v: Z6 }, { t: 0.09, v: [0.06, 0.05, 0.03, 0.2, 0.5, -0.3], e: 'out' }, { t: 0.19, v: [-0.22, 0.0, -0.1, -0.2, -0.6, 0.6], e: 'in' }, { t: 0.28, v: [-0.26, -0.06, -0.05, -0.3, -0.8, 0.7], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }]
      : [{ t: 0, v: Z6 }, { t: 0.09, v: [-0.04, 0.08, 0.03, 0.6, 0.2, 0.2], e: 'out' }, { t: 0.19, v: [0.02, -0.12, -0.12, -0.6, -0.1, -0.2], e: 'in' }, { t: 0.28, v: [0.04, -0.16, -0.06, -0.8, 0.0, -0.3], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }];
  } else if (style === 'thrust') {
    keys = alt
      ? [{ t: 0, v: Z6 }, { t: 0.1, v: [0.02, 0.02, 0.08, 0.1, 0.2, 0.0], e: 'out' }, { t: 0.18, v: [-0.08, 0.06, -0.2, 0.15, -0.2, 0.3], e: 'in' }, { t: 0.28, v: [-0.08, 0.05, -0.18, 0.1, -0.25, 0.35] }, { t: D, v: Z6, e: 'inOut5' }]
      : [{ t: 0, v: Z6 }, { t: 0.1, v: [0.0, -0.01, 0.07, -0.1, 0.1, 0.0], e: 'out' }, { t: 0.18, v: [-0.06, 0.05, -0.22, 0.12, -0.1, -0.1], e: 'in' }, { t: 0.28, v: [-0.06, 0.04, -0.2, 0.1, -0.12, -0.1] }, { t: D, v: Z6, e: 'inOut5' }];
  } else {
    // chop: levanta e desce por cima, pesado
    keys = alt
      ? [{ t: 0, v: Z6 }, { t: 0.16, v: [0.1, 0.12, 0.05, 0.9, 0.5, -0.5], e: 'out' }, { t: 0.28, v: [-0.16, -0.12, -0.12, -0.7, -0.4, 0.4], e: 'in' }, { t: 0.36, v: [-0.18, -0.16, -0.08, -0.85, -0.45, 0.5], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }]
      : [{ t: 0, v: Z6 }, { t: 0.16, v: [-0.02, 0.16, 0.06, 1.2, 0.1, -0.2], e: 'out' }, { t: 0.28, v: [-0.04, -0.14, -0.14, -0.8, 0.0, 0.1], e: 'in' }, { t: 0.36, v: [-0.04, -0.18, -0.1, -0.95, 0.0, 0.1], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }];
  }
  const hitAt = style === 'chop' ? 0.25 : style === 'thrust' ? 0.17 : 0.17;
  return { name: kind, duration: D, gun: T(keys), hitAt, busy: true };
}

/** Golpe rápido (V) com a arma na mão: trilha da mão auxiliar por estilo. */
function quickMelee(style) {
  const Tm = 0.62;
  let aux;
  if (style === 'thrust') {
    aux = T([
      { t: 0, v: [0.26, -0.36, -0.18, 0.6, 0.9, -0.6] },
      { t: 0.1, v: [0.08, -0.08, -0.2, 0.15, 0.25, -0.2], e: 'out' },
      { t: 0.19, v: [-0.02, -0.04, -0.46, 0.1, 0.05, -0.1], e: 'in' },
      { t: 0.3, v: [-0.02, -0.06, -0.42, 0.05, 0.05, -0.1], e: 'out' },
      { t: 0.46, v: [0.05, -0.45, -0.25, -0.5, -0.2, 0.2], e: 'inOut' },
      { t: Tm, v: [0.05, -0.6, -0.2, -0.6, -0.2, 0.2] },
    ]);
  } else if (style === 'chop') {
    aux = T([
      { t: 0, v: [0.26, -0.36, -0.18, 0.6, 0.9, -0.6] },
      { t: 0.12, v: [0.12, 0.08, -0.25, 1.3, 0.4, -0.6], e: 'out' },
      { t: 0.24, v: [-0.06, -0.16, -0.38, -0.6, 0.0, 0.1], e: 'in' },
      { t: 0.32, v: [-0.08, -0.26, -0.34, -0.8, -0.1, 0.1], e: 'out' },
      { t: 0.46, v: [-0.12, -0.45, -0.25, -0.5, -0.2, 0.2], e: 'inOut' },
      { t: Tm, v: [-0.12, -0.6, -0.2, -0.6, -0.2, 0.2] },
    ]);
  } else if (style === 'hook') {
    aux = T([
      { t: 0, v: [0.26, -0.36, -0.18, 0.6, 0.9, -0.6] },
      { t: 0.1, v: [0.14, -0.02, -0.3, 0.3, 0.9, -0.2], e: 'out' },
      { t: 0.24, v: [-0.14, -0.08, -0.38, -0.1, -0.4, 0.5], e: 'in' },
      { t: 0.32, v: [-0.22, -0.18, -0.32, -0.3, -0.6, 0.6], e: 'out' },
      { t: 0.46, v: [-0.12, -0.45, -0.25, -0.5, -0.2, 0.2], e: 'inOut' },
      { t: Tm, v: [-0.12, -0.6, -0.2, -0.6, -0.2, 0.2] },
    ]);
  } else return null; // corte padrão (aux.js)
  const gun = T([
    { t: 0, v: Z6 },
    { t: 0.1, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35], e: 'out' },
    { t: 0.38, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35] },
    { t: Tm, v: Z6, e: 'inOut5' },
  ]);
  return { name: 'melee', duration: Tm, gun, aux, item: 'knife', hitAt: style === 'chop' ? 0.22 : 0.19, busy: true, auxVis: [0.0, 0.47] };
}

/**
 * Inspeção por modelo. Trilhas extras (consumidas por rig.animate):
 *  knife   [px,py,pz,rx,ry,rz] da faca em relação à mão (lançar, girar)
 *  open    peso da mão aberta (soltou a faca)
 *  flip    [ânguloSafe, ânguloBite] dos cabos da balisong
 */
function knifeInspect(id) {
  const kind = KNIFE_MODELS[id]?.inspect || 'turn';
  const out = { name: 'inspect' };
  if (kind === 'flip') {
    // balisong: gira o pulso, abre/fecha os cabos duas vezes e trava
    const D = 3.4;
    out.duration = D;
    out.gun = T([{ t: 0, v: Z6 }, { t: 0.4, v: [-0.06, 0.06, 0.04, 0.3, 0.5, -0.3], e: 'inOut5' }, { t: 1.6, v: [-0.05, 0.07, 0.05, 0.35, 0.3, 0.6], e: 'inOut' }, { t: 2.6, v: [-0.06, 0.06, 0.04, 0.3, 0.6, -0.5], e: 'inOut' }, { t: D, v: Z6, e: 'inOut5' }]);
    const P = Math.PI;
    out.flip = T([
      { t: 0, v: [0, 0] }, { t: 0.5, v: [0, 0] },
      { t: 0.8, v: [-P, 0], e: 'inOut' }, { t: 1.1, v: [-P, P], e: 'inOut' }, // fecha
      { t: 1.4, v: [0, P], e: 'inOut' }, { t: 1.7, v: [0, 0], e: 'inOut' }, // abre
      { t: 2.0, v: [-P, 0], e: 'inOut' }, { t: 2.3, v: [-P, P], e: 'inOut' },
      { t: 2.6, v: [0, P], e: 'inOut' }, { t: 2.9, v: [0, 0], e: 'inOut' }, { t: D, v: [0, 0] },
    ]);
    out.knife = T([{ t: 0, v: Z6 }, { t: 0.8, v: Z6 }, { t: 1.25, v: [0, 0, 0, 0, 0, Math.PI], e: 'inOut' }, { t: 1.6, v: [0, 0, 0, 0, 0, Math.PI * 2], e: 'inOut' }, { t: 2.2, v: [0, 0, 0, 0, 0, Math.PI * 2] }, { t: 2.8, v: [0, 0, 0, 0, 0, Math.PI * 4], e: 'inOut' }, { t: D, v: [0, 0, 0, 0, 0, Math.PI * 4] }]);
    out.foley = [[0.8, 'knife_flip'], [1.1, 'knife_flip'], [1.7, 'knife_flip'], [2.3, 'knife_flip'], [2.9, 'knife_flip']];
  } else if (kind === 'twirl') {
    // karambit: gira duas voltas em torno do dedo na argola
    const D = 2.8;
    out.duration = D;
    out.gun = T([{ t: 0, v: Z6 }, { t: 0.4, v: [-0.02, 0.03, -0.02, 0.15, 0.3, -0.1], e: 'inOut5' }, { t: 2.3, v: [-0.02, 0.03, -0.02, 0.18, 0.35, -0.12] }, { t: D, v: Z6, e: 'inOut5' }]);
    out.knife = T([{ t: 0, v: Z6 }, { t: 0.5, v: Z6 }, { t: 1.2, v: [0, 0, 0, Math.PI * 2, 0, 0], e: 'inOut' }, { t: 1.9, v: [0, 0, 0, Math.PI * 4, 0, 0], e: 'inOut' }, { t: D, v: [0, 0, 0, Math.PI * 4, 0, 0] }]);
    out.open = T([{ t: 0, v: [0] }, { t: 0.5, v: [0] }, { t: 0.6, v: [0.3] }, { t: 1.85, v: [0.3] }, { t: 2.0, v: [0] }]);
    out.pivot = 'ring';
    out.foley = [[0.6, 'knife_flip'], [1.3, 'knife_flip']];
  } else if (kind === 'toss') {
    // tanto: joga para cima girando e pega no ar
    const D = 2.6;
    out.duration = D;
    out.gun = T([{ t: 0, v: Z6 }, { t: 0.35, v: [-0.02, 0.0, 0.03, 0.25, 0.3, -0.2], e: 'inOut' }, { t: 0.55, v: [-0.02, 0.06, 0.02, 0.1, 0.3, -0.2], e: 'out' }, { t: 1.5, v: [-0.02, 0.0, 0.02, 0.2, 0.3, -0.2], e: 'inOut' }, { t: 1.62, v: [-0.02, -0.03, 0.02, 0.28, 0.3, -0.2], e: 'out' }, { t: D, v: Z6, e: 'inOut5' }]);
    out.knife = T([{ t: 0, v: Z6 }, { t: 0.5, v: Z6 }, { t: 1.0, v: [0, 0.085, -0.01, -Math.PI * 1.5, 0, 0.2], e: 'out' }, { t: 1.5, v: [0, 0, 0, -Math.PI * 4, 0, 0], e: 'in' }, { t: D, v: [0, 0, 0, -Math.PI * 4, 0, 0] }]);
    out.open = T([{ t: 0, v: [0] }, { t: 0.5, v: [0] }, { t: 0.56, v: [1] }, { t: 1.45, v: [1] }, { t: 1.52, v: [0] }]);
    out.foley = [[0.5, 'cloth'], [1.5, 'knife_catch']];
  } else if (kind === 'spin') {
    // cutelo: gira a lâmina larga no eixo do cabo (mostra os dois lados)
    const D = 3.0;
    out.duration = D;
    out.gun = T([{ t: 0, v: Z6 }, { t: 0.5, v: [-0.06, 0.05, 0.04, 0.2, 0.7, -0.2], e: 'inOut5' }, { t: 2.5, v: [-0.06, 0.05, 0.04, 0.25, 0.7, -0.2] }, { t: D, v: Z6, e: 'inOut5' }]);
    out.knife = T([{ t: 0, v: Z6 }, { t: 0.7, v: Z6 }, { t: 1.4, v: [0, 0, 0, 0, 0, Math.PI], e: 'inOut' }, { t: 2.1, v: [0, 0, 0, 0, 0, Math.PI * 2], e: 'inOut' }, { t: D, v: [0, 0, 0, 0, 0, Math.PI * 2] }]);
    out.open = T([{ t: 0, v: [0] }, { t: 0.7, v: [0] }, { t: 0.8, v: [0.35] }, { t: 2.0, v: [0.35] }, { t: 2.15, v: [0] }]);
  } else if (kind === 'heft') {
    // kukri: sopesa (sobe/desce) e vira para olhar o fio
    const D = 3.2;
    out.duration = D;
    out.gun = T([{ t: 0, v: Z6 }, { t: 0.5, v: [-0.05, 0.05, 0.03, 0.3, 0.8, -0.3], e: 'inOut5' }, { t: 0.8, v: [-0.05, 0.03, 0.03, 0.2, 0.8, -0.3], e: 'inOut' }, { t: 1.1, v: [-0.05, 0.06, 0.03, 0.35, 0.8, -0.3], e: 'inOut' }, { t: 1.8, v: [-0.03, 0.06, 0.04, 0.9, -0.3, 1.2], e: 'inOut5' }, { t: 2.6, v: [-0.03, 0.06, 0.04, 0.95, -0.35, 1.25] }, { t: D, v: Z6, e: 'inOut5' }]);
  } else {
    // turn: olha um lado da lâmina, gira o pulso e olha o outro
    const D = 3.0;
    out.duration = D;
    out.gun = T([{ t: 0, v: Z6 }, { t: 0.5, v: [-0.06, 0.05, 0.04, 0.25, 0.8, -0.25], e: 'inOut5' }, { t: 1.3, v: [-0.06, 0.055, 0.04, 0.28, 0.85, -0.3] }, { t: 1.9, v: [-0.02, 0.06, 0.05, 0.3, -0.5, 1.1], e: 'inOut5' }, { t: 2.5, v: [-0.02, 0.062, 0.05, 0.32, -0.55, 1.15] }, { t: D, v: Z6, e: 'inOut5' }]);
  }
  return out;
}

// ─── pega ────────────────────────────────────────────────────────────────
/** SDF do cabo de cada faca (cápsula ∪ argola do karambit). */
function handleSdf(info) {
  const h = info.handle;
  const ring = info.ring;
  return (p) => {
    let d = sdCapsule({ x: p.x / 0.8, y: p.y, z: p.z }, h.a, h.b, h.r);
    if (ring) {
      // toro no plano YZ (eixo X)
      const q = Math.hypot(p.y - ring.y, p.z - ring.z) - ring.r;
      d = Math.min(d, Math.hypot(q, p.x) - 0.0045);
    }
    return d;
  };
}

/**
 * Coloca a mão na pega da faca e resolve dedos/polegar. Devolve
 * { pos, quat, pose }. reverse = pega reversa (karambit: lâmina sai pelo
 * lado do mínimo, indicador na argola).
 */
export function knifeGrip(hand, root, info, reverse = false) {
  const h = info.handle;
  const mid = h.a.clone().lerp(h.b, reverse ? 0.42 : 0.42);
  const axis = h.b.clone().sub(h.a).normalize();
  // martelo: X da mão = +Z da faca (indicador do lado da lâmina);
  // reversa: X da mão = −Z da faca
  const xAx = reverse ? axis.clone().negate() : axis.clone();
  const hb = basis(xAx.toArray(), reverse ? [1, -0.45, 0] : [1, 0.45, 0], [0, 0, 0]);
  const off = V(0, -0.011, -0.082).applyQuaternion(hb.quat);
  hb.pos.copy(V(h.r + 0.0005, mid.y, mid.z + (reverse ? -0.004 : 0.004))).sub(off);
  root.add(hand.root);
  hand.root.position.copy(hb.pos);
  hand.root.quaternion.copy(hb.quat);
  const fit = fitHand(hand, root, {
    sdf: handleSdf(info),
    gap: 0.0008,
    spread: [0.0, 0.0, -0.02, -0.05],
    maxFlex: [1.7, 1.8, 1.5],
    thumb: { target: reverse ? V(-0.004, 0.004, mid.z + 0.03) : V(-0.006, 0.0045, Math.max(0.006, h.a.z - 0.002)), weight: 25 },
  });
  return { pos: hb.pos.clone(), quat: hb.quat.clone(), pose: fit.pose };
}

/** Montagem da faca NA MÃO (formato de arma de guns.js). */
export function makeKnifeRig(M, handR, id) {
  const root = new THREE.Group();
  root.name = 'knifeRig:' + id;
  const knifeNode = new THREE.Group(); // a faca (pode sair da mão: lançar, girar)
  const model = buildKnifeModel(M, id);
  knifeNode.add(model);
  root.add(knifeNode);
  const info = model.userData.info || {};
  const spec = KNIFE_MODELS[id] || KNIFE_MODELS.tk7;
  const grip = knifeGrip(handR, root, info, !!spec.reverse);
  // ponto de giro da inspeção (argola do karambit) e pivô da faca
  const spin = info.ring ? V(0, info.ring.y, info.ring.z) : info.handle.a.clone().lerp(info.handle.b, 0.42);
  // partes "de arma" que index.js espera
  const dummy = () => new THREE.Object3D();
  const mag = new THREE.Group();
  mag.add(new THREE.Group());
  const R = { root, mag, trigger: dummy(), muzzle: dummy(), ejectPort: dummy(), sight: V(0, 0, 0), knife: knifeNode, model };
  root.add(mag, R.trigger, R.muzzle, R.ejectPort);
  const pivot = V(0, 0, 0.05);
  root.position.copy(pivot).negate();
  const pose6 = (p, r) => ({ pos: V(...p), rot: new THREE.Euler(...r) });
  const rev = !!spec.reverse;
  // espera: baixa à direita, lâmina para a frente/cima (reversa: para baixo/dentro)
  const hip = rev ? pose6([0.11, -0.05, -0.3], [-0.21, 0.32, -0.71]) : pose6([0.085, -0.088, -0.28], [0.58, 0.3, -1.58]);
  const ads = pose6(hip.pos.toArray(), [hip.rot.x, hip.rot.y, hip.rot.z]);
  const sprint = pose6([0.0, -0.06, 0.06], [-0.4, 0.3, 0.2]);
  const relaxed = clonePose(POSES.relaxed);
  const anims = {
    swing: knifeSwing(id, 'swing'),
    swing2: knifeSwing(id, 'swing2'),
    inspect: knifeInspect(id),
    equip: {
      name: 'equip', duration: 0.42, busy: true,
      gun: T([{ t: 0, v: [0.06, -0.24, 0.06, -1.0, 0.4, 0.6] }, { t: 0.3, v: [0, 0.01, 0, 0.08, -0.05, -0.05], e: 'out3' }, { t: 0.42, v: Z6, e: 'inOut' }]),
      knife: T([{ t: 0, v: [0, 0, 0, 0, 0, Math.PI * 2] }, { t: 0.32, v: Z6, e: 'out' }]),
    },
    holster: { name: 'holster', duration: 0.22, busy: true, gun: T([{ t: 0, v: Z6 }, { t: 0.22, v: [0.04, -0.26, 0.07, -0.9, 0.3, 0.4], e: 'in' }]) },
  };
  const o6 = [0, 0, 0, 0, 0, 0];
  const g = {
    id, kind: 'knife', R, root, pivot, lens: null, magSpare: null,
    hip, ads, sprint, vmFov: { hip: 50, ads: 50 }, setSight: () => {},
    handR: { pos: grip.pos, quat: grip.quat }, poseGrip: grip.pose, poseTrigger: grip.pose,
    gripL: { pos: V(0, -1, 0), quat: new THREE.Quaternion(), pose: relaxed }, gripLAds: { pos: V(0, -1, 0), quat: new THREE.Quaternion(), pose: relaxed },
    magRest: { pos: V(0, 0, 0), rot: new THREE.Euler() }, magGrip: { pos: V(), quat: new THREE.Quaternion() },
    slap: { pos: V(), quat: new THREE.Quaternion() }, catchGrip: { pos: V(), quat: new THREE.Quaternion() },
    catchRot: () => {}, anims, casing: new THREE.Group(),
    occ: (hl, hr) => [{ o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.028 }],
    recoil: { z: 0, x: 0, xAds: 0, climb: 0, climbAds: 0, kick: 0 },
    anchorL: V(-0.3, -0.7, -0.1), anchorR: V(0.3, -0.5, 0.05),
    cosmetic: {
      counter: { pos: info.handle.a.clone().lerp(info.handle.b, 0.6).add(V(-(info.handle.r * 0.82 + 0.0008), 0, 0)), scale: 0.62, parent: knifeNode },
      charm: info.ring ? V(0, info.ring.y - info.ring.r, info.ring.z) : info.handle.b.clone().add(V(0, -0.004, 0.006)),
      charmParent: knifeNode,
    },
    knifeId: id,
  };
  // peças móveis: faca (lançar/girar), cabos da balisong, mão aberta
  const tmp = new Array(6).fill(0);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  g.animate = (inf) => {
    const act = inf.act;
    const t = inf.t;
    knifeNode.position.set(0, 0, 0);
    knifeNode.quaternion.identity();
    if (act?.knife) {
      const o = act.knife.eval(t, tmp);
      // giro em torno do ponto de pega (ou da argola)
      e.set(o[3], o[4], o[5], 'XYZ');
      q.setFromEuler(e);
      knifeNode.position.copy(spin).sub(spin.clone().applyQuaternion(q)).add(V(o[0], o[1], o[2]));
      knifeNode.quaternion.copy(q);
    }
    const ud = model.userData;
    if (ud.safe) {
      const fl = act?.flip ? act.flip.eval(t, [0, 0]) : [0, 0];
      ud.safe.rotation.x = fl[0];
      ud.bite.rotation.x = fl[1];
    }
    if (act?.open) {
      const w = act.open.eval(t, [0])[0];
      if (w > 0) g.handROver = { pos: grip.pos.clone().add(V(0.004 * w, -0.004 * w, 0)), quat: grip.quat, pose: relaxed, w };
    }
  };
  return g;
}
