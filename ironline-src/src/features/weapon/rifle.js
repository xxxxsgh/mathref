/**
 * Modelo procedural do fuzil de assalto "KR-9" (design original do IRONLINE).
 *
 * Carabina de pistão curto, receptor superior monolítico em alumínio preto,
 * guarda-mão longo e coronha em cerakote coyote, carregador curvo de polímero,
 * mira holográfica com capô, lanterna compacta, freio de boca de 3 câmaras.
 *
 * Coordenadas (m): X direita, Y cima, frente −Z, eixo do cano em y = 0,
 * z = 0 na face traseira do receptor. Comprimento total ≈ 0,86 m.
 *
 * Devolve as peças móveis separadas (carregador, alavanca de manejo,
 * retém do ferrolho, gatilho, ferrolho visível) e pontos de referência
 * (boca, janela de ejeção, linha de visada, pegas das mãos).
 */
import * as THREE from 'three';
import { Kit, side, section, top, rbox, cylZ, cylX, cylY, torus, roundRect } from './geo.js';
import { engravingTexture } from './textures.js';

// ─── dimensões principais ────────────────────────────────────────────────
export const DIM = {
  upperTop: 0.0165, // topo do receptor superior
  railTop: 0.0245, // topo dos dentes do trilho
  hgFront: 0.545, // frente do guarda-mão (u)
  muzzle: 0.64, // ponta do freio de boca (u)
  sightY: 0.0545, // linha de visada da holográfica (centro da janela)
  optic: [0.035, 0.118], // u da holográfica (trás, frente)
};

/** Dentes de trilho Picatinny ao longo de u ∈ [u0,u1] em y = yBase. */
function rail(kit, mat, u0, u1, yBase, { w = 0.021, x = 0, vertical = false } = {}) {
  // base do trilho
  const len = u1 - u0;
  if (!vertical) {
    kit.add(mat, section(trap(w * 0.5, w * 0.42, 0.0035), -u0, len, { b: 0.0006 }), new THREE.Matrix4().makeTranslation(x, yBase, 0));
    const pitch = 0.01;
    for (let u = u0 + 0.003; u + 0.005 <= u1; u += pitch) {
      kit.add(mat, rbox(w, 0.0042, 0.0052, 0.0008, x, yBase + 0.0035 + 0.0021, -(u + 0.0026), 1));
    }
  }
}
/** Trapézio (seção do trilho): base larga embaixo. */
function trap(hb, ht, h) {
  return [[-hb, 0], [hb, 0], [ht, h], [-ht, h]];
}

/** Ranhura M-LOK (furo arredondado) como Path. */
function slot(u, v, len, hgt) {
  return roundRect(u - len / 2, v - hgt / 2, u + len / 2, v + hgt / 2, hgt / 2 - 1e-4, 4);
}

export function buildRifle(M, opts = {}) {
  const root = new THREE.Group();
  root.name = 'KR-9';
  const K = new Kit();
  const D = DIM;

  // ─── receptor superior ─────────────────────────────────────────────────
  // perfil lateral: rebaixo traseiro (alavanca), chanfro frontal para o guarda-mão
  K.add('receiver', side([
    [0.0, -0.016], [0.232, -0.016], [0.236, -0.012], [0.236, 0.0125], [0.232, D.upperTop],
    [0.012, D.upperTop], [0.004, 0.0125], [0.0, 0.0105],
  ], 0.0275, { b: 0.0016, seg: 3 }));
  // nervura lateral (degrau) — quebra a superfície como num upper fresado
  for (const sx of [-1, 1]) {
    K.add('receiver', side([[0.06, -0.006], [0.228, -0.006], [0.228, 0.004], [0.075, 0.004]], 0.003, { b: 0.0008, cx: sx * 0.0145 }));
  }
  // capa da janela de ejeção (lado direito) e assistente de ferrolho
  K.add('steel', rbox(0.002, 0.016, 0.06, 0.0007, 0.0145, 0.0, -0.105));
  K.add('receiver', cylZ(0.0062, -0.03, -0.065, { x: 0.017, y: 0.004, seg: 16 }));
  // trilho superior contínuo (receptor)
  rail(K, 'receiver', 0.006, 0.234, D.upperTop);

  // ─── receptor inferior ─────────────────────────────────────────────────
  const lower = new THREE.Shape();
  lower.moveTo(-0.008, -0.0158);
  lower.lineTo(0.228, -0.0158);
  lower.lineTo(0.228, -0.03);
  lower.quadraticCurveTo(0.226, -0.036, 0.215, -0.04);
  lower.lineTo(0.211, -0.084);
  lower.quadraticCurveTo(0.212, -0.091, 0.218, -0.093); // alargamento do poço
  lower.lineTo(0.218, -0.098);
  lower.lineTo(0.128, -0.098);
  lower.lineTo(0.128, -0.093);
  lower.quadraticCurveTo(0.134, -0.09, 0.135, -0.084);
  lower.lineTo(0.137, -0.052);
  lower.lineTo(0.06, -0.049);
  lower.lineTo(0.0, -0.049);
  lower.quadraticCurveTo(-0.014, -0.046, -0.016, -0.034);
  lower.lineTo(-0.016, -0.022);
  lower.quadraticCurveTo(-0.014, -0.016, -0.008, -0.0158);
  K.add('receiver', side(lower, 0.0255, { b: 0.0018, seg: 3 }));
  // painéis rebaixados do poço do carregador (relevo lateral)
  for (const sx of [-1, 1]) {
    K.add('receiver', side([[0.142, -0.054], [0.205, -0.054], [0.203, -0.084], [0.144, -0.084]], 0.0016, { b: 0.0005, cx: sx * 0.0128 }));
  }
  // guarda-mato
  const tg = new THREE.Shape();
  tg.moveTo(0.128, -0.05);
  tg.lineTo(0.128, -0.06);
  tg.quadraticCurveTo(0.126, -0.071, 0.112, -0.072);
  tg.lineTo(0.048, -0.071);
  tg.lineTo(0.044, -0.06);
  tg.lineTo(0.05, -0.06);
  tg.lineTo(0.054, -0.0665);
  tg.lineTo(0.11, -0.0665);
  tg.quadraticCurveTo(0.121, -0.066, 0.122, -0.058);
  tg.lineTo(0.122, -0.05);
  K.add('receiver', side(tg, 0.011, { b: 0.0012 }));

  // pinos de desmontagem (aço), retém do ferrolho, seletor
  for (const [u, v] of [[0.004, -0.028], [0.221, -0.024], [0.07, -0.037], [0.088, -0.037]]) {
    K.add('steel', cylX(u < 0.05 || u > 0.2 ? 0.0032 : 0.0022, 0.0275, 0, v, -u));
    // cabeças com fenda (ambos os lados)
    for (const sx of [-1, 1]) K.add('cavity', rbox(0.0008, 0.0006, 0.004, 0.0002, sx * 0.0139, v, -u));
  }
  // seletor de tiro (alavanca no lado esquerdo) — SAFE / AUTO
  const sel = new THREE.Group();
  {
    const k = new Kit();
    k.add('steel', cylX(0.0055, 0.003, 0, 0, 0, 20));
    k.add('steel', rbox(0.0025, 0.004, 0.019, 0.0012, -0.0004, 0, -0.008));
    k.add('steel', rbox(0.004, 0.0055, 0.004, 0.0015, -0.0012, 0.0005, -0.0165));
    const s = k.build(M, 'selector');
    sel.add(s);
    sel.position.set(-0.0145, -0.031, -0.03);
    sel.rotation.x = -0.45;
  }
  root.add(sel);

  // gravação a laser no lado esquerdo do receptor inferior
  const engr = engravingTexture([
    { text: 'IRONLINE ARMS', font: 'bold 44px monospace' },
    { text: 'KR-9  CAL 5.56x45', font: 'bold 34px monospace', alpha: 0.9 },
    { text: 'SN IL-04217', font: '30px monospace', alpha: 0.85 },
  ]);
  const engrMat = new THREE.MeshStandardMaterial({
    color: 0x9b978e, roughness: 0.35, metalness: 0.8, alphaMap: engr, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const engrMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.016), engrMat);
  engrMesh.position.set(-0.0148, -0.068, -0.17);
  engrMesh.rotation.y = -Math.PI / 2;
  root.add(engrMesh);
  // marcações do seletor
  const selTex = engravingTexture([{ text: 'SAFE', font: 'bold 70px monospace', x: 10 }, { text: 'AUTO', font: 'bold 70px monospace', x: 10 }], { w: 256, h: 256 });
  const selMark = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.014), engrMat.clone());
  selMark.material.alphaMap = selTex;
  selMark.material.color.set(0xb8b2a2);
  selMark.position.set(-0.0148, -0.034, -0.052);
  selMark.rotation.y = -Math.PI / 2;
  root.add(selMark);

  // ─── punho de pistola (polímero, textura de pegada) ────────────────────
  const grip = new THREE.Shape();
  grip.moveTo(0.044, -0.046);
  grip.bezierCurveTo(0.046, -0.07, 0.034, -0.08, 0.036, -0.092);
  grip.bezierCurveTo(0.037, -0.1, 0.028, -0.106, 0.027, -0.116);
  grip.bezierCurveTo(0.026, -0.13, 0.02, -0.142, 0.017, -0.152);
  grip.lineTo(0.016, -0.158);
  grip.lineTo(-0.024, -0.152);
  grip.bezierCurveTo(-0.026, -0.13, -0.016, -0.1, -0.011, -0.072);
  grip.bezierCurveTo(-0.008, -0.058, -0.016, -0.05, -0.028, -0.048);
  grip.lineTo(-0.026, -0.044);
  grip.lineTo(0.044, -0.044);
  K.add('polymer', side(grip, 0.029, { b: 0.0065, seg: 4, curve: 16 }));
  // pastilhas de textura (painel lateral levemente saliente)
  for (const sx of [-1, 1]) {
    const pad = new THREE.Shape();
    pad.moveTo(0.028, -0.07);
    pad.bezierCurveTo(0.03, -0.09, 0.022, -0.11, 0.018, -0.14);
    pad.lineTo(-0.014, -0.138);
    pad.bezierCurveTo(-0.012, -0.11, -0.006, -0.09, -0.004, -0.07);
    K.add('rubber', side(pad, 0.002, { b: 0.0007, cx: sx * 0.0145 }));
  }
  // tampa do punho
  K.add('polymer', rbox(0.03, 0.006, 0.042, 0.0025, 0, -0.157, 0.003));

  // ─── tubo do amortecedor + coronha ajustável ───────────────────────────
  K.add('receiver', cylZ(0.0148, 0.0, 0.205, { y: -0.004, seg: 28 }));
  // castelo / porca do tubo
  K.add('steel', cylZ(0.0175, 0.0, 0.012, { y: -0.004, seg: 12 }));
  // placa de bandoleira traseira
  K.add('steel', rbox(0.031, 0.026, 0.003, 0.001, 0, -0.006, 0.004));
  // corpo da coronha (perfil esqueletizado)
  const stock = new THREE.Shape();
  stock.moveTo(-0.075, 0.018);
  stock.lineTo(-0.252, 0.026);
  stock.quadraticCurveTo(-0.262, 0.026, -0.262, 0.016);
  stock.lineTo(-0.262, -0.098);
  stock.quadraticCurveTo(-0.262, -0.106, -0.252, -0.106);
  stock.lineTo(-0.232, -0.104);
  stock.bezierCurveTo(-0.19, -0.07, -0.13, -0.035, -0.09, -0.028);
  stock.lineTo(-0.075, -0.026);
  stock.quadraticCurveTo(-0.068, -0.02, -0.068, -0.004);
  stock.quadraticCurveTo(-0.068, 0.018, -0.075, 0.018);
  const stockHole = new THREE.Path();
  stockHole.moveTo(-0.215, -0.02);
  stockHole.lineTo(-0.24, -0.02);
  stockHole.quadraticCurveTo(-0.246, -0.02, -0.246, -0.028);
  stockHole.lineTo(-0.246, -0.074);
  stockHole.bezierCurveTo(-0.23, -0.06, -0.21, -0.04, -0.2, -0.032);
  stockHole.quadraticCurveTo(-0.198, -0.02, -0.215, -0.02);
  K.add('tan', side(stock, 0.036, { b: 0.004, seg: 3, holes: [stockHole] }));
  // descanso de bochecha
  K.add('tan', rbox(0.038, 0.012, 0.11, 0.005, 0, 0.022, 0.17));
  // soleira de borracha
  K.add('rubber', side([[-0.258, 0.03], [-0.274, 0.03], [-0.276, -0.108], [-0.258, -0.11]], 0.04, { b: 0.004, seg: 3 }));
  // trava de ajuste (alavanca)
  K.add('polymer', rbox(0.012, 0.01, 0.05, 0.003, 0, -0.026, 0.11));
  // QD cup
  K.add('steel', cylX(0.0055, 0.006, -0.019, -0.04, 0.2, 16));
  K.add('cavity', cylX(0.0035, 0.0062, -0.019, -0.04, 0.2, 12));

  // ─── guarda-mão (cerakote coyote, ranhuras M-LOK vazadas) ──────────────
  const hg0 = 0.236, hg1 = D.hgFront;
  const slots = [];
  for (let u = hg0 + 0.03; u + 0.032 <= hg1 - 0.01; u += 0.043) slots.push(slot(u + 0.016, -0.006, 0.032, 0.0085));
  for (const sx of [-1, 1]) {
    K.add('tan', side([[hg0, -0.024], [hg1, -0.024], [hg1, 0.0105], [hg0, 0.0105]], 0.0045, { b: 0.0012, seg: 2, cx: sx * 0.0195, holes: slots.map((s) => s.slice()) }));
  }
  // chanfros inferiores (45°) e base inferior com ranhuras
  for (const sx of [-1, 1]) {
    const g = rbox(0.0085, 0.004, hg1 - hg0, 0.0012);
    const m = new THREE.Matrix4().makeRotationZ(sx * Math.PI / 4).setPosition(sx * 0.0162, -0.0272, -(hg0 + hg1) / 2);
    K.add('tan', g, m);
  }
  const botSlots = [];
  for (let u = hg0 + 0.05; u + 0.032 <= hg1 - 0.02; u += 0.06) botSlots.push(slot(u + 0.016, 0, 0.032, 0.0085));
  K.add('tan', top([[hg0, -0.0115], [hg1, -0.0115], [hg1, 0.0115], [hg0, 0.0115]], 0.0045, { b: 0.0012, cy: -0.0295, holes: botSlots }));
  // topo do guarda-mão + trilho
  K.add('tan', top([[hg0, -0.0205], [hg1, -0.0205], [hg1, 0.0205], [hg0, 0.0205]], 0.006, { b: 0.0014, cy: 0.0135 }));
  rail(K, 'receiver', hg0 + 0.002, hg1 - 0.003, D.upperTop);
  // anel frontal chanfrado
  K.add('tan', section(roundRect(-0.021, -0.031, 0.021, 0.0165, 0.006), -hg1 + 0.004, 0.006, { b: 0.0016, holes: [roundRect(-0.012, -0.012, 0.012, 0.012, 0.011, 6)] }));
  // interior escuro (dá profundidade às ranhuras)
  K.add('cavity', rbox(0.031, 0.032, hg1 - hg0 - 0.01, 0.002, 0, -0.007, -(hg0 + hg1) / 2));
  // parafusos sextavados das laterais
  for (const sx of [-1, 1]) {
    for (const u of [hg0 + 0.012, hg1 - 0.012]) {
      K.add('steel', cylX(0.0028, 0.0012, sx * 0.0222, 0.002, -u, 14));
      K.add('cavity', cylX(0.0013, 0.0014, sx * 0.0226, 0.002, -u, 6));
    }
  }
  // QD de bandoleira no guarda-mão (esquerda) com olhal
  K.add('steel', cylX(0.0058, 0.005, -0.0235, -0.017, -(hg0 + 0.02), 16));
  K.add('steel', torus(0.008, 0.0014, -0.027, -0.025, -(hg0 + 0.02), 0, Math.PI / 2, 0.3));

  // ─── cano, bloco de gás, freio de boca ─────────────────────────────────
  K.add('steel', cylZ(0.0082, -hg1 + 0.002, -(hg1 + 0.03), { seg: 24 }));
  K.add('burnt', cylZ(0.0118, -(hg1 + 0.028), -(hg1 + 0.034), { seg: 24, r1: 0.0122 }));
  // freio: núcleo escuro + anéis com janelas laterais + espinha superior/inferior
  const b0 = hg1 + 0.034, b1 = D.muzzle;
  K.add('cavity', cylZ(0.0072, -b0, -b1 + 0.004, { seg: 16 }));
  const rings = [b0, b0 + 0.016, b0 + 0.032, b1 - 0.008];
  for (let i = 0; i < rings.length; i++) {
    const u = rings[i];
    const len = i === rings.length - 1 ? 0.008 : 0.006;
    K.add('burnt', cylZ(0.0124, -u, -(u + len), { seg: 28 }));
  }
  for (const sy of [-1, 1]) {
    K.add('burnt', rbox(0.011, 0.006, b1 - b0, 0.0018, 0, sy * 0.0094, -(b0 + b1) / 2));
  }
  // coroa da boca (escura por dentro)
  K.add('cavity', cylZ(0.0042, -(b1 - 0.001), -(b1 + 0.0004), { seg: 16 }));

  // ─── massa de mira dobrável (frente) e alça dobrável (trás) ────────────
  K.add('receiver', rbox(0.02, 0.006, 0.024, 0.002, 0, D.railTop + 0.003, -(hg1 - 0.02)));
  K.add('receiver', rbox(0.012, 0.003, 0.022, 0.0012, 0, D.railTop + 0.0068, -(hg1 - 0.022)));
  K.add('receiver', rbox(0.02, 0.006, 0.02, 0.002, 0, D.railTop + 0.003, -0.016));
  K.add('receiver', rbox(0.014, 0.003, 0.018, 0.0012, 0, D.railTop + 0.0068, -0.015));

  // ─── lanterna compacta (lado esquerdo, frente) ─────────────────────────
  {
    const lz = hg1 - 0.012, x = -0.034, y = 0.004;
    K.add('receiver', rbox(0.012, 0.014, 0.03, 0.003, -0.025, y, -(lz - 0.018))); // base M-LOK
    K.add('receiver', cylZ(0.0105, -(lz - 0.042), -lz, { x, y, seg: 24 }));
    // cabeça (bezel) mais larga com serrilha
    K.add('receiver', cylZ(0.0128, -lz, -(lz + 0.016), { x, y, seg: 24, r1: 0.0132 }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      K.add('receiver', rbox(0.0025, 0.0025, 0.012, 0.0008, x + Math.cos(a) * 0.0131, y + Math.sin(a) * 0.0131, -(lz + 0.008)));
    }
    // botão traseiro
    K.add('rubber', cylZ(0.0075, -(lz - 0.046), -(lz - 0.042), { x, y, seg: 16 }));
  }
  // lente da lanterna (vidro com refletor)
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe6ea, roughness: 0.05, metalness: 1.0, clearcoat: 1, clearcoatRoughness: 0.02 });
  const flLens = new THREE.Mesh(new THREE.CircleGeometry(0.0108, 28), lensMat);
  flLens.position.set(-0.034, 0.004, -(hg1 - 0.012 + 0.0162));
  flLens.rotation.y = Math.PI;
  root.add(flLens);

  // ─── mira holográfica ──────────────────────────────────────────────────
  const [o0, o1] = D.optic;
  const oy = D.railTop;
  // base + garra de trilho
  K.add('receiver', rbox(0.034, 0.012, o1 - o0, 0.0025, 0, oy + 0.006, -(o0 + o1) / 2));
  K.add('receiver', rbox(0.04, 0.008, 0.018, 0.002, 0, oy + 0.001, -(o0 + 0.035)));
  // alavanca QD (esquerda)
  K.add('steel', rbox(0.004, 0.006, 0.03, 0.0018, -0.022, oy + 0.002, -(o0 + 0.04)));
  K.add('steel', cylX(0.004, 0.006, -0.0215, oy + 0.002, -(o0 + 0.022), 14));
  // capô: seção em arco com a janela vazada (janela mais larga que alta)
  const HT = oy + 0.0465, WB = oy + 0.0138, WT = oy + 0.0388, WX = 0.0162;
  const hoodOut = roundRect(-0.0215, oy + 0.006, 0.0215, HT, 0.0095, 6);
  const win = roundRect(-WX, WB, WX, WT, 0.0042, 6);
  const hoodLen = 0.072;
  K.add('receiver', section(hoodOut, -(o0 + 0.008), hoodLen, { b: 0.002, seg: 3, holes: [win] }));
  // molduras traseira e frontal (mais grossas, chanfradas)
  const rim = () => roundRect(-0.0224, oy + 0.006, 0.0224, HT + 0.0009, 0.0102, 6);
  const rimHole = () => roundRect(-WX + 0.0008, WB + 0.0008, WX - 0.0008, WT - 0.0008, 0.0036, 6);
  K.add('receiver', section(rim(), -(o0 + 0.006), 0.006, { b: 0.0015, holes: [rimHole()] }));
  K.add('receiver', section(rim(), -(o0 + 0.074), 0.006, { b: 0.0015, holes: [rimHole()] }));
  // nervura superior do capô (reforço) e vidro escuro do emissor (base)
  K.add('receiver', rbox(0.012, 0.003, hoodLen - 0.01, 0.0012, 0, HT + 0.001, -(o0 + 0.044)));
  // forro interno do capô (fosco escuro): sem ele as paredes da janela
  // refletem o céu e o "túnel" fica claro demais no ADS
  {
    const zc = -(o0 + 0.008 + hoodLen / 2), L = hoodLen - 0.002, e = 0.0004;
    K.add('cavity', rbox(WX * 2, 0.0006, L, 0.0002, 0, WB + e, zc, 1));
    K.add('cavity', rbox(WX * 2, 0.0006, L, 0.0002, 0, WT - e, zc, 1));
    K.add('cavity', rbox(0.0006, WT - WB, L, 0.0002, -WX + e, (WB + WT) / 2, zc, 1));
    K.add('cavity', rbox(0.0006, WT - WB, L, 0.0002, WX - e, (WB + WT) / 2, zc, 1));
  }
  // botões de brilho (traseira, lado esquerdo) e tampa de bateria (frente)
  for (const [x, w] of [[-0.009, 0.008], [0.001, 0.008], [0.011, 0.008]]) K.add('rubber', rbox(w, 0.005, 0.003, 0.0015, x, oy + 0.009, -(o0 + 0.002)));
  K.add('receiver', cylX(0.0058, 0.006, -0.02, oy + 0.007, -(o1 - 0.008), 20));
  K.add('steel', rbox(0.0012, 0.0012, 0.008, 0.0004, -0.0232, oy + 0.007, -(o1 - 0.008)));
  // parafusos do capô
  for (const u of [o0 + 0.02, o1 - 0.02]) {
    for (const sx of [-1, 1]) K.add('steel', cylX(0.0018, 0.0012, sx * 0.0222, oy + 0.026, -u, 10));
  }

  const rifle = K.build(M, 'rifle');
  root.add(rifle);

  // ─── peças móveis ──────────────────────────────────────────────────────
  // carregador (pivô no topo, dentro do poço)
  const magPivot = new THREE.Group();
  magPivot.name = 'mag';
  magPivot.position.set(0, -0.05, -0.172);
  const magBody = buildMag(M);
  magPivot.add(magBody);
  root.add(magPivot);

  // alavanca de manejo (desliza +Z)
  const ch = new THREE.Group();
  ch.name = 'chargingHandle';
  {
    const k = new Kit();
    k.add('receiver', rbox(0.012, 0.005, 0.03, 0.0015, 0, 0.0125, 0.003));
    k.add('receiver', side([[-0.012, 0.008], [-0.002, 0.008], [-0.002, 0.016], [-0.012, 0.016]], 0.036, { b: 0.0018 }));
    k.add('rubber', rbox(0.006, 0.006, 0.008, 0.002, -0.019, 0.012, 0.008));
    ch.add(k.build(M, 'ch'));
  }
  root.add(ch);

  // retém do ferrolho (lado esquerdo; pressionado no recarregamento vazio)
  const boltCatch = new THREE.Group();
  {
    const k = new Kit();
    k.add('steel', side([[0, 0], [0.024, 0.0], [0.026, 0.006], [0.004, 0.009]], 0.0025, { b: 0.0006 }));
    boltCatch.add(k.build(M, 'bc'));
    boltCatch.position.set(-0.0142, -0.034, -0.128);
  }
  root.add(boltCatch);

  // gatilho
  const trig = new THREE.Group();
  {
    const k = new Kit();
    const t = new THREE.Shape();
    t.moveTo(0.0, 0.0);
    t.quadraticCurveTo(0.006, -0.008, 0.004, -0.02);
    t.lineTo(0.001, -0.02);
    t.quadraticCurveTo(0.002, -0.009, -0.003, -0.002);
    k.add('steel', side(t, 0.006, { b: 0.0012 }));
    trig.add(k.build(M, 'trigger'));
    trig.position.set(0, -0.049, -0.082);
  }
  root.add(trig);

  // ponto da boca e janela de ejeção
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -(D.muzzle + 0.005));
  root.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.016, 0.003, -0.105);
  root.add(ejectPort);

  return {
    root, rifle, mag: magPivot, magBody, chargingHandle: ch, boltCatch, trigger: trig, selector: sel, muzzle, ejectPort,
    sight: new THREE.Vector3(0, (WB + WT) / 2, -(o0 + 0.04)),
    opticWindow: { y: (WB + WT) / 2, z0: -(o0 + 0.008), z1: -(o0 + 0.08), w: WX * 2, h: WT - WB },
  };
}

/** Carregador curvo de polímero com nervuras, base saliente e cartuchos. */
export function buildMag(M) {
  const K = new Kit();
  // coordenadas relativas ao pivô (topo do carregador, centro)
  const s = new THREE.Shape();
  s.moveTo(-0.034, 0.012);
  s.lineTo(0.028, 0.012);
  s.lineTo(0.03, -0.035);
  s.quadraticCurveTo(0.038, -0.125, 0.066, -0.188);
  s.lineTo(0.002, -0.2);
  s.quadraticCurveTo(-0.022, -0.12, -0.032, -0.04);
  s.lineTo(-0.034, 0.012);
  K.add('polymer', side(s, 0.0235, { b: 0.0016, seg: 2, curve: 16 }));
  // nervuras laterais horizontais (pegada) seguindo a curva
  for (let i = 0; i < 4; i++) {
    const v = -0.135 - i * 0.012;
    const f = (-v - 0.04) / 0.15;
    const uf = 0.03 + f * f * 0.02 + 0.004, ub = -0.032 + f * f * 0.018 + 0.01;
    for (const sx of [-1, 1]) {
      K.add('polymer', side([[ub, v], [uf - 0.006, v], [uf - 0.006, v + 0.004], [ub, v + 0.004]], 0.0015, { b: 0.0006, cx: sx * 0.0122 }));
    }
  }
  // janela/painel de marcação (relevo leve)
  for (const sx of [-1, 1]) {
    K.add('polymer', side([[-0.022, -0.03], [0.02, -0.03], [0.024, -0.1], [-0.018, -0.1]], 0.0012, { b: 0.0004, cx: sx * 0.0121 }));
  }
  // base saliente
  const bp = new THREE.Shape();
  bp.moveTo(-0.002, -0.195);
  bp.lineTo(0.07, -0.183);
  bp.quadraticCurveTo(0.077, -0.185, 0.076, -0.193);
  bp.lineTo(0.073, -0.203);
  bp.lineTo(-0.004, -0.215);
  bp.quadraticCurveTo(-0.009, -0.211, -0.002, -0.195);
  K.add('polymer', side(bp, 0.03, { b: 0.0025, seg: 3 }));
  // lábios de alimentação (aço) e cartuchos no topo
  K.add('steel', rbox(0.0245, 0.004, 0.05, 0.001, 0, 0.012, 0.001));
  const g = K.build(M, 'mag');
  // cartuchos visíveis (latão + ponta de cobre)
  const ammo = new Kit();
  for (const [x, y] of [[-0.0045, 0.019], [0.0045, 0.0155]]) {
    ammo.add('brass', cylZ(0.0048, 0.024, -0.01, { x, y, seg: 16, r1: 0.0048 }));
    ammo.add('brass', cylZ(0.0048, -0.01, -0.016, { x, y, seg: 16, r1: 0.0031 }));
    ammo.add('copper', cylZ(0.0031, -0.016, -0.033, { x, y, seg: 16, r1: 0.0008 }));
  }
  const rounds = ammo.build(M, 'rounds');
  rounds.name = 'rounds';
  g.add(rounds);
  return g;
}

/** Cápsula deflagrada (para o ejetor). */
export function buildCasing(M) {
  const k = new Kit();
  k.add('brass', cylZ(0.0048, 0.022, -0.012, { seg: 12 }));
  k.add('brass', cylZ(0.0048, -0.012, -0.018, { seg: 12, r1: 0.0031 }));
  k.add('cavity', cylZ(0.003, -0.018, -0.0185, { seg: 10 }));
  return k.build(M, 'casing', { shadows: false });
}
