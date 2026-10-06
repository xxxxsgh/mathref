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
import { Kit, side, section, top, rbox, cylZ, cylX, cylY, torus, roundRect, crease } from './geo.js';
import { engravingTexture, buttonGlyphTexture } from './textures.js';

// ─── dimensões principais ────────────────────────────────────────────────
export const DIM = {
  upperTop: 0.0165, // topo do receptor superior
  railTop: 0.0245, // topo dos dentes do trilho
  hgFront: 0.585, // frente do guarda-mão (u)
  muzzle: 0.68, // ponta do freio de boca (u)
  sightY: 0.0545, // linha de visada da holográfica (centro da janela)
  optic: [0.07, 0.15], // u da holográfica (trás, frente)
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
  // janela de ejeção: frestas escuras em volta da capa, nervuras da capa,
  // defletor de cápsulas (cunha atrás da janela) e mola da capa
  for (const sy of [-1, 1]) K.add('cavity', rbox(0.0008, 0.0009, 0.061, 0.0002, 0.0141, sy * 0.0084, -0.105, 1));
  K.add('cavity', rbox(0.0008, 0.017, 0.0009, 0.0002, 0.0141, 0, -0.0745, 1));
  K.add('cavity', rbox(0.0008, 0.017, 0.0009, 0.0002, 0.0141, 0, -0.1355, 1));
  for (const v of [-0.004, 0.0, 0.004]) K.add('steel', rbox(0.0009, 0.0011, 0.05, 0.0004, 0.0156, v, -0.106, 1));
  K.add('steel', cylZ(0.0011, -0.073, -0.137, { x: 0.0152, y: -0.0088, seg: 8 })); // eixo da capa
  {
    const m = new THREE.Matrix4().makeRotationY(-0.35).setPosition(0.0165, 0.0035, -0.069);
    K.add('receiver', rbox(0.006, 0.014, 0.014, 0.0018), m);
  }
  // botão de retém do carregador (lado direito) com cerca de proteção
  K.add('steel', cylX(0.0046, 0.0035, 0.0148, -0.043, -0.137, 20));
  K.add('cavity', cylX(0.0049, 0.0012, 0.0136, -0.043, -0.137, 20));
  for (let i = 0; i < 5; i++) K.add('cavity', rbox(0.0004, 0.0006, 0.007, 0.0001, 0.0167, -0.0455 + i * 0.0013, -0.137, 1));
  K.add('receiver', torus(0.0062, 0.0012, 0.014, -0.043, -0.137, 0, Math.PI / 2, 0, Math.PI));
  // trilho superior contínuo (receptor)
  rail(K, 'rail', 0.006, 0.234, D.upperTop);

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
  // lado direito do poço: marcação de calibre e pictogramas de cadência
  const engrR = engravingTexture([
    { text: '5.56 NATO', font: 'bold 46px monospace' },
    { text: 'MULTI-CAL  KR9-A2', font: 'bold 30px monospace', alpha: 0.85 },
    { text: 'IRONLINE ARMS  SEMI-AUTO', font: '26px monospace', alpha: 0.8 },
  ]);
  const engrRMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.014), engrMat.clone());
  engrRMesh.material.alphaMap = engrR;
  engrRMesh.position.set(0.0148, -0.07, -0.172);
  engrRMesh.rotation.y = Math.PI / 2;
  root.add(engrRMesh);
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
  // corpo da coronha (perfil esqueletizado, polímero fosco)
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
  K.add('polymer', side(stock, 0.036, { b: 0.004, seg: 3, holes: [stockHole] }));
  // descanso de bochecha
  K.add('polymer', rbox(0.038, 0.012, 0.11, 0.005, 0, 0.022, 0.17));
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
  rail(K, 'rail', hg0 + 0.002, hg1 - 0.003, D.upperTop);
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
  // batente de mão (handstop) angulado sob o guarda-mão, à frente da mão
  // de apoio: a pega é "C-clamp" no próprio guarda-mão (polegar por cima)
  {
    const zc = -0.548;
    const hs = new THREE.Shape();
    hs.moveTo(0.024, 0);
    hs.lineTo(-0.012, 0);
    hs.quadraticCurveTo(-0.016, -0.004, -0.012, -0.009);
    hs.bezierCurveTo(-0.002, -0.014, 0.012, -0.024, 0.02, -0.031);
    hs.quadraticCurveTo(0.026, -0.034, 0.028, -0.028);
    hs.lineTo(0.03, -0.004);
    hs.quadraticCurveTo(0.03, 0, 0.024, 0);
    const m = new THREE.Matrix4().makeTranslation(0, -0.0315, 0);
    m.multiply(new THREE.Matrix4().makeTranslation(0, 0, zc + 0.012));
    const g = side(hs, 0.016, { b: 0.0026, seg: 3 });
    K.add('polymer', g, m);
    for (const dz of [-0.008, 0.008]) K.add('steel', cylY(0.0021, 0.0012, 0, -0.0324, zc + dz, 10));
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

  // ─── massa de mira e alça DOBRADAS (rebatidas sobre o trilho: a ótica
  // é a mira primária, então não roubam o quadro no ADS) ─────────────────
  for (const [u, L] of [[hg1 - 0.022, 0.03], [0.02, 0.026]]) {
    K.add('receiver', rbox(0.019, 0.0045, L, 0.0016, 0, D.railTop + 0.0022, -u)); // base
    K.add('receiver', rbox(0.013, 0.0025, L * 0.8, 0.001, 0, D.railTop + 0.0055, -u - 0.002)); // folha rebatida
    K.add('steel', cylX(0.0018, 0.021, 0, D.railTop + 0.0035, -u + L / 2 - 0.004, 12)); // eixo
  }

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

  // ─── mira holográfica (kit próprio: a ótica 3x pode substituí-la) ──
  const KO = new Kit();
  const optic = new THREE.Group();
  optic.name = 'holo';
  // ───────────────────────────────────────────────
  const [o0, o1] = D.optic;
  const oy = D.railTop;
  // base + garra de trilho
  KO.add('receiver', rbox(0.034, 0.012, o1 - o0, 0.0025, 0, oy + 0.006, -(o0 + o1) / 2));
  KO.add('receiver', rbox(0.04, 0.008, 0.018, 0.002, 0, oy + 0.001, -(o0 + 0.035)));
  // alavanca QD (esquerda)
  KO.add('steel', rbox(0.004, 0.006, 0.03, 0.0018, -0.022, oy + 0.002, -(o0 + 0.04)));
  KO.add('steel', cylX(0.004, 0.006, -0.0215, oy + 0.002, -(o0 + 0.022), 14));
  // capô: seção em arco com a janela vazada — paredes finas (3 mm) e janela
  // grande, como numa holográfica real; capô curto (pouco "túnel" no ADS)
  const HT = oy + 0.0455, WB = oy + 0.0125, WT = oy + 0.0405, WX = 0.0178;
  const HX = 0.0208;
  const hoodOut = roundRect(-HX, oy + 0.006, HX, HT, 0.0075, 6);
  const win = roundRect(-WX, WB, WX, WT, 0.0048, 6);
  const hoodLen = 0.038;
  const hz0 = o0 + 0.024; // traseira do capô (capô curto, na frente da base)
  KO.add('receiver', section(hoodOut, -hz0, hoodLen, { b: 0.0012, seg: 3, holes: [win] }));
  // lábio traseiro e frontal: chanfro largo voltado para fora (moldura fina)
  const rim = () => roundRect(-HX - 0.0006, oy + 0.006, HX + 0.0006, HT + 0.0006, 0.008, 6);
  const rimHole = () => roundRect(-WX + 0.0004, WB + 0.0004, WX - 0.0004, WT - 0.0004, 0.0044, 6);
  // molduras da janela em borracha fosca: no ADS a borda vista de frente
  // fica escura e fina (sem o chanfro claro refletindo o céu)
  KO.add('rubber', section(rim(), -(hz0 - 0.001), 0.003, { b: 0.0004, holes: [rimHole()] }));
  // moldura da frente: a face dela que olha para o atirador aparece como um
  // anel em perspectiva dentro da janela no ADS — fosca quase preta
  KO.add('cavity', section(rim(), -(hz0 + hoodLen - 0.0022), 0.003, { b: 0.0004, holes: [rimHole()] }));
  // nervura superior do capô + parafusos de fixação no topo
  KO.add('receiver', rbox(0.009, 0.0022, hoodLen - 0.016, 0.0009, 0, HT + 0.0006, -(hz0 + hoodLen / 2)));
  for (const u of [hz0 + 0.009, hz0 + hoodLen - 0.009]) {
    KO.add('steel', cylY(0.0016, 0.0012, 0, HT + 0.0018, -u, 10));
    KO.add('cavity', rbox(0.0022, 0.0004, 0.0005, 0.0001, 0, HT + 0.0024, -u, 1));
  }
  // forro interno do capô (fosco escuro): sem ele as paredes da janela
  // refletem o céu e o "túnel" fica claro demais no ADS
  {
    // cobre o túnel inteiro (inclusive as faces internas das molduras)
    const zc = -(hz0 + hoodLen / 2), L = hoodLen + 0.0016, e = 0.0006;
    KO.add('cavity', rbox(WX * 2, 0.0006, L, 0.0002, 0, WB + e, zc, 1));
    KO.add('cavity', rbox(WX * 2, 0.0006, L, 0.0002, 0, WT - e, zc, 1));
    KO.add('cavity', rbox(0.0006, WT - WB, L, 0.0002, -WX + e, (WB + WT) / 2, zc, 1));
    KO.add('cavity', rbox(0.0006, WT - WB, L, 0.0002, WX - e, (WB + WT) / 2, zc, 1));
  }
  // corpo inferior (bateria/eletrônica) atrás do capô: rampa com painel de botões
  KO.add('receiver', side([[o0 - 0.004, oy + 0.006], [hz0 + 0.004, oy + 0.006], [hz0 + 0.004, WB - 0.0005], [o0 + 0.002, WB - 0.0045], [o0 - 0.004, oy + 0.0105]], 0.04, { b: 0.0016, seg: 3 }));
  // botões de brilho (− / NV / +) na rampa traseira, borracha com relevo
  const glyphMat = new THREE.MeshStandardMaterial({
    color: 0xd8d2c4, emissive: 0x4a463e, roughness: 0.6, metalness: 0, alphaMap: buttonGlyphTexture(), transparent: true,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  [-0.011, 0, 0.011].forEach((x, i) => {
    const m = new THREE.Matrix4().makeRotationX(-0.75).setPosition(x, oy + 0.0118, -(o0 + 0.0035));
    KO.add('rubber', rbox(0.0085, 0.0028, 0.0075, 0.0012), m);
    // ícone pintado no topo do botão (− / NV / +)
    const pg = new THREE.PlaneGeometry(0.0066, 0.0058);
    const uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, 0.00145, 0);
    pg.applyMatrix4(m);
    optic.add(new THREE.Mesh(pg, glyphMat));
  });
  // emissor do laser (janelinha escura na base, frente da janela)
  KO.add('cavity', rbox(0.01, 0.0015, 0.008, 0.0006, 0, WB + 0.0006, -(hz0 + hoodLen - 0.009)));
  // tampa de bateria (lado direito, serrilhada) e alavanca QD
  KO.add('receiver', cylX(0.0062, 0.005, 0.022, oy + 0.0095, -(o1 - 0.012), 24));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    KO.add('receiver', rbox(0.0045, 0.0012, 0.0012, 0.0004, 0.022, oy + 0.0095 + Math.sin(a) * 0.0062, -(o1 - 0.012) + Math.cos(a) * 0.0062));
  }
  // fenda de moeda na tampa da bateria + anel de vedação
  KO.add('cavity', rbox(0.0008, 0.0009, 0.0072, 0.0002, 0.0246, oy + 0.0095, -(o1 - 0.012), 1));
  KO.add('rubber', cylX(0.0066, 0.0012, 0.0193, oy + 0.0095, -(o1 - 0.012), 24));
  // parafusos laterais do capô
  for (const u of [hz0 + 0.01, hz0 + hoodLen - 0.01]) {
    for (const sx of [-1, 1]) {
      KO.add('steel', cylX(0.0017, 0.0012, sx * (HX + 0.0003), oy + 0.022, -u, 12));
      KO.add('cavity', cylX(0.0007, 0.0013, sx * (HX + 0.0005), oy + 0.022, -u, 6));
    }
  }

  optic.add(KO.build(M, 'holo'));
  root.add(optic);
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
    root, rifle, optic, mag: magPivot, magBody, chargingHandle: ch, boltCatch, trigger: trig, selector: sel, muzzle, ejectPort,
    sight: new THREE.Vector3(0, (WB + WT) / 2, -(hz0 + hoodLen / 2)),
    opticWindow: { y: (WB + WT) / 2, z0: -hz0, z1: -(hz0 + hoodLen), w: WX * 2, h: WT - WB },
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

/**
 * Cápsula deflagrada 5,56 (para o ejetor): base com aro e canal de extração,
 * espoleta percutida, corpo levemente cônico, ombro, gargalo e boca aberta
 * escurecida pela queima. Latão com fuligem perto da boca (material próprio).
 */
export function buildCasing(M) {
  const k = new Kit();
  const S = 20;
  // coordenadas: base em +Z, boca em −Z (comprimento total ≈ 45 mm)
  k.add('brass', cylZ(0.0048, 0.0225, 0.0212, { seg: S })); // aro
  k.add('brass', cylZ(0.0041, 0.0212, 0.0192, { seg: S, r1: 0.0046 })); // canal de extração (chanfro)
  k.add('brass', cylZ(0.0047, 0.0192, -0.0105, { seg: S, r1: 0.00455 })); // corpo cônico
  k.add('brass', cylZ(0.00455, -0.0105, -0.0135, { seg: S, r1: 0.0031 })); // ombro
  k.add('brass', cylZ(0.0031, -0.0135, -0.0215, { seg: S })); // gargalo
  k.add('cavity', cylZ(0.0026, -0.0213, -0.0217, { seg: 14 })); // boca (interior queimado)
  k.add('steel', cylZ(0.0018, 0.0226, 0.0224, { seg: 12 })); // espoleta
  const g = k.build(M, 'casing', { shadows: false });
  // base + gargalo levemente mais escuros: latão "queimado" separado
  return g;
}
