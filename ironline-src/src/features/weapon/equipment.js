/**
 * Equipamento do loadout (modelos procedurais, design original):
 *
 *  - Faca de combate "TK-7": lâmina clip-point com revestimento escuro e fio
 *    afiado brilhante (chanfro de afiação modelado: a seção vai do dorso
 *    plano ao fio em cunha), guarda curta, cabo de borracha com encaixes de
 *    dedo e pomo de aço com furo de fiel.
 *  - Granada de fragmentação "M-7": corpo liso ovoide pintado (verde-oliva com
 *    faixa amarela de marcação), espoleta com alavanca (colher), pino e argola.
 *  - Granada atordoante "S-2": corpo cilíndrico perfurado com a mesma espoleta.
 *
 * Coordenadas da faca: cabo para +Z, lâmina para −Z, fio para −Y, dorso +Y,
 * origem na guarda. Granada: centro do corpo na origem, espoleta para +Y.
 */
import * as THREE from 'three';
import { Kit, rbox, cylZ, cylY, torus, crease } from './geo.js';

/** Loft da lâmina: seção = fio (cunha) + chanfro + flancos + dorso. */
function bladeGeo() {
  const N = 40, L = 0.165;
  const flats = { pos: [], idx: [] }, edge = { pos: [], idx: [] };
  // perfil: y do dorso, y do fio, y da linha de afiação, meia-espessura
  const prof = (u) => {
    const t = u / L;
    // dorso reto até 68%, depois o "clip" desce até a ponta
    const spine = t < 0.68 ? 0.0085 : 0.0085 - 0.0128 * ((t - 0.68) / 0.32) ** 1.25;
    // fio: reto, depois a barriga sobe até a ponta
    const edgeY = t < 0.55 ? -0.0225 : -0.0225 + 0.0182 * ((t - 0.55) / 0.45) ** 1.7;
    const grind = edgeY + (spine - edgeY) * 0.36;
    const h = 0.0023 * (t < 0.85 ? 1 : 1 - 0.75 * ((t - 0.85) / 0.15));
    return { spine, edgeY, grind, h, z: -u };
  };
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * L;
    const p = prof(u);
    const tipK = i === N ? 0 : 1;
    // flancos + dorso (escuros): grind+ → spine+ → spine− → grind−
    flats.pos.push(p.h * tipK, p.grind, p.z, p.h * tipK, p.spine, p.z, -p.h * tipK, p.spine, p.z, -p.h * tipK, p.grind, p.z);
    // chanfro do fio (claro): grind− → fio → grind+
    edge.pos.push(-p.h * tipK, p.grind, p.z, 0, p.edgeY, p.z, p.h * tipK, p.grind, p.z);
  }
  const strip = (o, cols, closed = false) => {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < cols - (closed ? 0 : 1); j++) {
        const a = i * cols + j, b = i * cols + ((j + 1) % cols), c = a + cols, d = b + cols;
        o.idx.push(a, c, b, b, c, d);
      }
    }
  };
  strip(flats, 4);
  strip(edge, 3);
  const mk = (o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setIndex(o.idx);
    g.computeVertexNormals();
    return crease(g, 0.5);
  };
  // fecha a traseira da lâmina (dentro da guarda — não precisa)
  return { flats: mk(flats), edge: mk(edge) };
}

export function buildKnife(M) {
  const root = new THREE.Group();
  root.name = 'knife';
  const K = new Kit();
  const b = bladeGeo();
  K.add('blade', b.flats);
  K.add('edge', b.edge);
  // ricasso / base da lâmina
  K.add('blade', rbox(0.0048, 0.031, 0.012, 0.001, 0, -0.007, -0.004));
  // guarda curta (aço)
  K.add('steel', rbox(0.011, 0.046, 0.006, 0.0022, 0, -0.006, 0.003));
  // cabo: loft elíptico com encaixes de dedo e alargamento no pomo
  {
    const NZ = 30, NT = 22, L = 0.118;
    const pos = [], idx = [];
    for (let i = 0; i <= NZ; i++) {
      const t = i / NZ;
      const z = 0.006 + t * L;
      // encaixes de dedo (3 vales) e barriga no meio
      let r = 0.0118 + 0.0016 * Math.sin(t * Math.PI) - 0.0011 * Math.max(0, Math.sin(t * Math.PI * 3.2 + 0.3)) * (t < 0.7 ? 1 : 0);
      r += 0.003 * Math.max(0, (t - 0.86) / 0.14) ** 2; // alargamento do pomo
      for (let j = 0; j < NT; j++) {
        const th = (j / NT) * Math.PI * 2;
        // pegada: textura de losangos (relevo)
        const grip = t > 0.08 && t < 0.86 ? 0.00035 * Math.sign(Math.sin(th * 9 + z * 700)) * Math.sign(Math.sin(th * 9 - z * 700)) : 0;
        pos.push(Math.cos(th) * (r + grip) * 0.78, Math.sin(th) * (r + grip) * 1.12 - 0.006, z);
      }
    }
    for (let i = 0; i < NZ; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * NT + j, b2 = i * NT + ((j + 1) % NT), c = a + NT, d = b2 + NT;
        idx.push(a, b2, c, b2, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    K.add('rubber', g);
  }
  // pomo de aço com furo de fiel
  K.add('steel', rbox(0.02, 0.031, 0.012, 0.004, 0, -0.006, 0.128));
  K.add('cavity', rbox(0.0205, 0.0045, 0.0045, 0.0016, 0, -0.004, 0.129));
  root.add(K.build(M, 'knife'));
  return root;
}

/** Espoleta (corpo, alavanca, pino e argola) — comum às duas granadas. */
function addFuze(K, top) {
  K.add('steel', cylY(0.0105, 0.016, 0, top + 0.006, 0, 20));
  K.add('steel', cylY(0.0085, 0.006, 0, top + 0.016, 0, 18, 0.007));
}
function buildLever(M, top, bodyR) {
  const g = new THREE.Group();
  g.name = 'lever';
  const K = new Kit();
  // colher: tira curva que desce pelo flanco (+Z = frente da mão)
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * 1.15;
    pts.push([Math.sin(a) * bodyR * 0.95 + 0.004, top + 0.012 - (1 - Math.cos(a)) * 0.04 - a * 0.012]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    const len = Math.hypot(z1 - z0, y1 - y0);
    const box = rbox(0.0105, 0.0016, len + 0.001, 0.0006);
    const m = new THREE.Matrix4().makeRotationX(Math.atan2(y1 - y0, z1 - z0)).setPosition(0, (y0 + y1) / 2, (z0 + z1) / 2);
    K.add('nadeMetal', box, m);
  }
  g.add(K.build(M, 'lever'));
  return g;
}
function buildPin(M, top) {
  const g = new THREE.Group();
  g.name = 'pin';
  const K = new Kit();
  K.add('steel', cylZ(0.0011, -0.012, 0.012, { x: 0, y: top + 0.008, seg: 8 }).rotateY(Math.PI / 2));
  K.add('steel', torus(0.0115, 0.0012, -0.024, top + 0.008, 0, 0, Math.PI / 2, 0));
  g.add(K.build(M, 'pin'));
  return g;
}

export function buildFrag(M) {
  const root = new THREE.Group();
  root.name = 'frag';
  const K = new Kit();
  // corpo ovoide (lathe): Ø 60 mm, 80 mm de altura
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    const y = -Math.cos(a) * 0.04;
    const r = Math.sin(a) * 0.0298 * (1 + 0.06 * Math.cos(a));
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  K.add('nade', new THREE.LatheGeometry(pts, 36));
  // faixa amarela de marcação e anel do pescoço
  K.add('band', cylY(0.0262, 0.004, 0, 0.026, 0, 36, 0.0236));
  K.add('nadeMetal', cylY(0.0115, 0.008, 0, 0.039, 0, 24));
  const top = 0.041;
  addFuze(K, top);
  root.add(K.build(M, 'frag'));
  const lever = buildLever(M, top, 0.03);
  root.add(lever);
  const pin = buildPin(M, top);
  root.add(pin);
  return { root, lever, pin, radius: 0.032 };
}

export function buildFlash(M) {
  const root = new THREE.Group();
  root.name = 'flash';
  const K = new Kit();
  K.add('nadeMetal', cylY(0.022, 0.09, 0, -0.005, 0, 32));
  // furos de alívio em 3 fileiras
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r * 0.4;
      const y = -0.03 + r * 0.025;
      const h = cylZ(0.0035, 0.0002, -0.002, { seg: 10 });
      h.rotateY(a + Math.PI / 2);
      h.translate(Math.cos(a) * 0.0219, y, -Math.sin(a) * 0.0219);
      K.add('cavity', h);
    }
  }
  K.add('band', cylY(0.0223, 0.006, 0, 0.032, 0, 32));
  const top = 0.04;
  addFuze(K, top);
  root.add(K.build(M, 'flash'));
  const lever = buildLever(M, top, 0.023);
  root.add(lever);
  const pin = buildPin(M, top);
  root.add(pin);
  return { root, lever, pin, radius: 0.025 };
}
