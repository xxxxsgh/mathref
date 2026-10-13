// Modelos procedurais das armas e da multiferramenta (1ª pessoa e mundo).
//
// Cada build retorna { root, sockets, parts, screen? } onde sockets são
// Object3D: gripR / gripL (base das mãos, base: X = eixo da empunhadura,
// Y = dorso da mão, −Z = punho→nós dos dedos), muzzle (boca, −Z), sight (olho
// na mira), mag (carregador), eject (ejeção). parts: subgrupos móveis
// (carregador, ferrolho, bomba...).
import * as THREE from 'three/webgpu';
import { Parts, roundRect } from './geo.js';
import { paintMat, metalMat, polymerMat, glowMat, lensMat, screenMat } from '../materials.js';

const D = Math.PI / 180;

/** Materiais compartilhados pelas armas (por preset). */
export function weaponMaterials(lite) {
  return {
    ceramic: paintMat({ color: '#bfbab0', metal: '#a4a6a8', rough: 0.42, wear: 0.5, scale: 34, clearcoat: 0.3, seed: 2, lite, grime: 0.4, tone: 0.08 }),
    graphite: paintMat({ color: '#2a2d32', metal: '#a6abb2', rough: 0.5, wear: 0.62, scale: 34, clearcoat: 0.12, seed: 5, lite, grime: 0.2, tone: 0.04 }),
    navy: paintMat({ color: '#1f2a3a', metal: '#9aa6b6', rough: 0.42, wear: 0.5, scale: 34, clearcoat: 0.3, seed: 8, lite, grime: 0.18 }),
    accent: paintMat({ color: '#d2602a', metal: '#b0a69a', rough: 0.4, wear: 0.7, scale: 40, clearcoat: 0.25, seed: 11, lite, grime: 0.15 }),
    rust: paintMat({ color: '#5a2f22', metal: '#9a8a7a', rough: 0.55, wear: 0.8, scale: 30, clearcoat: 0.05, seed: 13, lite, grime: 0.5, tone: 0.14 }),
    teal: paintMat({ color: '#2f5c63', metal: '#a2b0b2', rough: 0.4, wear: 0.5, scale: 34, clearcoat: 0.3, seed: 17, lite, grime: 0.2 }),
    gunmetal: metalMat({ color: '#50545a', rough: 0.32, scale: 80, lite }),
    steel: metalMat({ color: '#2b2e33', rough: 0.42, scale: 80, lite }),
    barrel: metalMat({ color: '#3a3d42', rough: 0.3, scale: 80, lite, heatGlow: true }),
    copper: metalMat({ color: '#c07a42', rough: 0.28, scale: 120, brushed: 0.4, lite }),
    chrome: metalMat({ color: '#c8ccd2', rough: 0.12, scale: 80, brushed: 0.2, lite }),
    grip: polymerMat({ color: '#1a1c20', rough: 0.78, knurl: 1, scale: 420, lite }),
    poly: polymerMat({ color: '#25282d', rough: 0.62, scale: 300, lite }),
    lens: lensMat({ lite }),
    glass: lensMat({ lite, clear: true, tint: '#1a3040', coat: '#ff7050' }),
    decal: null,
    cyan: glowMat('#46d2ff', 9, { pulse: 2.2 }),
    cyanSoft: glowMat('#46d2ff', 2.4),
    orange: glowMat('#ff7a26', 10, { pulse: 3.1 }),
    orangeSoft: glowMat('#ff8a3a', 3),
    violet: glowMat('#c7a6ff', 12, { pulse: 1.6 }),
    green: glowMat('#6dff9a', 9, { pulse: 2.6 }),
    red: glowMat('#ff3b30', 7),
    white: glowMat('#eaf6ff', 6),
    reticle: glowMat('#ff4a3a', 20),
  };
}

/** Tela de munição (CanvasTexture redesenhada só quando muda). */
export class AmmoScreen {
  constructor(w = 256, h = 128, accent = '#46d2ff') {
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.accent = accent;
    this.last = '';
    this.draw({ ammo: 0, mag: 1, label: '' });
  }
  draw({ ammo, mag, label = '', heat = 0, mode = '' }) {
    const key = `${ammo}|${mag}|${label}|${Math.round(heat * 20)}|${mode}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.g, W = this.cv.width, H = this.cv.height;
    g.fillStyle = '#02070a'; g.fillRect(0, 0, W, H);
    const low = ammo / Math.max(1, mag) < 0.25;
    const c = low ? '#ffb040' : this.accent;
    g.fillStyle = c; g.globalAlpha = 0.16; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    g.font = `700 ${H * 0.62}px "DejaVu Sans Mono", monospace`;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 10;
    g.fillText(String(ammo).padStart(2, '0'), W * 0.66, H * 0.5);
    g.shadowBlur = 0;
    g.font = `600 ${H * 0.16}px "DejaVu Sans Mono", monospace`;
    g.textAlign = 'left';
    g.fillText(label, W * 0.7, H * 0.28);
    // barra de carga
    const n = Math.min(mag, 16);
    for (let i = 0; i < n; i++) {
      const on = i < Math.ceil(ammo / mag * n);
      g.fillStyle = on ? c : 'rgba(80,120,140,0.3)';
      g.fillRect(W * 0.7 + (i % 8) * (W * 0.035), H * (i < 8 ? 0.45 : 0.62), W * 0.025, H * 0.1);
    }
    if (heat > 0.01) { g.fillStyle = '#ff6a20'; g.fillRect(W * 0.7, H * 0.82, W * 0.28 * heat, H * 0.06); }
    g.strokeStyle = c; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(3, 3, W - 6, H - 6); g.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
}

/** Marcação pintada (estêncil) — texto em canvas com desgaste. */
const stencils = new Map();
function stencilMat(t1, t2, bg) {
  const key = t1 + t2 + bg;
  if (stencils.has(key)) return stencils.get(key);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(230,226,216,0.92)';
  g.font = '700 54px "DejaVu Sans Condensed", "Arial Narrow", sans-serif';
  g.fillText(t1, 10, 60);
  g.font = '600 30px "DejaVu Sans Mono", monospace';
  g.fillStyle = 'rgba(210,96,42,0.95)';
  g.fillText(t2, 12, 108);
  // desgaste: apaga pontos
  for (let i = 0; i < 900; i++) { g.clearRect(Math.random() * 512, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  void bg;
  stencils.set(key, m);
  return m;
}

function screenQuad(P, mat, w, h, pos, rot) {
  const geo = new THREE.PlaneGeometry(w, h);
  P.add(mat, geo, pos, rot);
}

/** Base da mão direita numa empunhadura inclinada `tilt` (rad, para trás). */
const gripRot = (tilt) => [0, 0, 0, tilt];
function gripBasis(tilt, left = false) {
  // X = eixo da empunhadura para baixo (dir.) / para cima (esq.); Y = dorso; Z = para trás
  const X = new THREE.Vector3(0, -Math.cos(tilt), Math.sin(tilt));
  const Y = new THREE.Vector3(1, 0, 0);
  if (left) { X.negate(); Y.negate(); }
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3);
}
void gripRot;

// ═══════════════════════════════════════════════════════════════════════════
// RIFLE DE PULSO — "HV-9 Lança"
export function buildRifle(M) {
  const P = new Parts();
  const W = 0.05;
  // receptor inferior (grafite)
  P.profile(M.graphite, [[-0.11, -0.032], [0.2, -0.032], [0.235, -0.012], [0.25, 0.022], [-0.11, 0.022]], 0.046, [0, 0, 0], { bevel: 0.004 });
  // receptor superior (cerâmica) — corcova traseira, chanfro frontal
  P.profile(M.ceramic, [[-0.13, 0.018], [0.27, 0.018], [0.3, 0.032], [0.29, 0.058], [0.16, 0.07], [0.02, 0.07], [-0.03, 0.088], [-0.13, 0.088], [-0.145, 0.05]], W, [0, 0, 0], { bevel: 0.006, bevelSeg: 3 });
  // faixa laranja (pintura do Rafael sobre o dourado da Hegemonia)
  P.profile(M.accent, [[0.05, 0.05], [0.25, 0.05], [0.262, 0.057], [0.06, 0.066]], W + 0.003, [0, 0, 0], { bevel: 0.0008, bevelSeg: 1 });
  // entradas de ar (fendas escuras no receptor)
  for (let i = 0; i < 5; i++) P.box(M.steel, W + 0.002, 0.012, 0.006, [0, 0.04, -(0.08 + i * 0.016)], [0, 0, 0], { r: 0.002 });
  // trilho superior + dentes
  P.box(M.gunmetal, 0.02, 0.008, 0.25, [0, 0.092, -0.06], [0, 0, 0], { r: 0.002 });
  P.teeth(M.gunmetal, 14, 0.024, 0.005, 0.008, [0, 0.098, 0.055], -0.017);
  // guarda-mão: placas laterais com janelas (bobinas visíveis)
  const slots = [];
  for (let i = 0; i < 4; i++) { const x0 = 0.31 + i * 0.045; slots.push([[x0, 0.018], [x0 + 0.03, 0.018], [x0 + 0.03, 0.046], [x0, 0.046]]); }
  for (const s of [-1, 1]) P.profile(M.ceramic, [[0.27, 0.0], [0.5, 0.0], [0.52, 0.016], [0.52, 0.062], [0.27, 0.068]], 0.007, [s * 0.026, 0, 0], { holes: slots, bevel: 0.002 });
  P.profile(M.graphite, [[0.27, 0.06], [0.51, 0.058], [0.52, 0.068], [0.27, 0.076]], 0.044, [0, 0, 0], { bevel: 0.003 });
  P.profile(M.graphite, [[0.27, -0.004], [0.51, -0.004], [0.5, 0.008], [0.27, 0.008]], 0.044, [0, 0, 0], { bevel: 0.003 });
  // cano + bobinas de aceleração
  P.cylZ(M.barrel, 0.0105, 0.0105, 0.36, [0, 0.034, -0.44], { seg: 18 });
  for (let i = 0; i < 7; i++) {
    P.ringZ(M.copper, 0.0165, 0.0045, [0, 0.034, -(0.305 + i * 0.03)], { seg: 20, tube: 6 });
    P.ringZ(M.cyan, 0.0118, 0.0012, [0, 0.034, -(0.317 + i * 0.03)], { seg: 16, tube: 4 });
  }
  // emissor da boca
  P.latheZ(M.gunmetal, [[0.0, 0.52], [0.017, 0.52], [0.02, 0.535], [0.016, 0.56], [0.019, 0.585], [0.024, 0.6], [0.02, 0.606], [0.0115, 0.6]], [0, 0.034, 0], { seg: 24 });
  P.ringZ(M.cyan, 0.0175, 0.0016, [0, 0.034, -0.596], { seg: 24, tube: 5 });
  for (let k = 0; k < 3; k++) { const a = k * 2 * Math.PI / 3 + Math.PI / 2; P.box(M.ceramic, 0.006, 0.012, 0.04, [Math.cos(a) * 0.026, 0.034 + Math.sin(a) * 0.026, -0.575], [0, 0, a - Math.PI / 2], { r: 0.0015 }); }
  // empunhadura
  P.profile(M.grip, [[-0.035, -0.03], [0.02, -0.03], [0.005, -0.135], [-0.006, -0.142], [-0.05, -0.138], [-0.038, -0.05]], 0.034, [0, 0, 0], { bevel: 0.006, bevelSeg: 3 });
  // gatilho e guarda
  P.profile(M.steel, [[0.022, -0.032], [0.03, -0.034], [0.026, -0.06], [0.02, -0.066]], 0.006, [0, 0, 0], { bevel: 0.0015 });
  P.profile(M.graphite, [[0.012, -0.03], [0.075, -0.03], [0.075, -0.075], [0.006, -0.08], [0.004, -0.072], [0.064, -0.068], [0.064, -0.04], [0.012, -0.04]], 0.012, [0, 0, 0], { bevel: 0.0015 });
  // carregador (célula de energia) — subgrupo móvel
  P.profile(M.graphite, [[0.085, -0.03], [0.14, -0.03], [0.15, -0.115], [0.098, -0.122]], 0.034, [0, 0, 0], { bevel: 0.004, group: 'mag' });
  P.box(M.cyan, 0.036, 0.04, 0.006, [0, -0.085, -0.122], [-8 * D, 0, 0], { group: 'mag' });
  P.box(M.gunmetal, 0.036, 0.008, 0.058, [0, -0.118, -0.125], [-6 * D, 0, 0], { r: 0.002, group: 'mag' });
  // coronha esqueletada
  P.profile(M.graphite, [[-0.13, 0.07], [-0.13, -0.02], [-0.3, -0.055], [-0.37, -0.066], [-0.385, 0.045], [-0.3, 0.066]], 0.036, [0, 0, 0], { holes: [[[-0.17, 0.045], [-0.29, 0.048], [-0.31, -0.03], [-0.18, -0.005]]], bevel: 0.004 });
  P.box(M.poly, 0.04, 0.12, 0.022, [0, -0.01, 0.39], [6 * D, 0, 0], { r: 0.008 });
  // mira holográfica (moldura fina, vidro transparente, ponto vermelho)
  P.box(M.gunmetal, 0.024, 0.01, 0.046, [0, 0.104, -0.0], [0, 0, 0], { r: 0.002 });
  P.section(M.graphite, [[-0.017, 0.108], [0.017, 0.108], [0.017, 0.15], [0.011, 0.158], [-0.011, 0.158], [-0.017, 0.15]], 0.014, [0, 0, -0.012], { holes: [[[-0.0135, 0.1125], [0.0135, 0.1125], [0.0135, 0.148], [0.009, 0.1535], [-0.009, 0.1535], [-0.0135, 0.148]].reverse()], bevel: 0.0012 });
  P.section(M.graphite, [[-0.017, 0.108], [0.017, 0.108], [0.017, 0.116], [-0.017, 0.116]], 0.04, [0, 0, 0.004], { bevel: 0.001 });
  P.box(M.glass, 0.029, 0.034, 0.0015, [0, 0.133, -0.012], [0, 0, 0]);
  P.box(M.steel, 0.006, 0.006, 0.012, [0.016, 0.152, 0.004], [0, 0, 0], { r: 0.001 });
  P.ringZ(M.reticle, 0.0032, 0.00035, [0, 0.133, -0.0135], { seg: 20, tube: 3 });
  P.sphere(M.reticle, 0.0006, [0, 0.133, -0.0135], { seg: 6 });
  // tampa superior traseira: painel escuro com aletas
  P.box(M.graphite, 0.034, 0.006, 0.07, [0, 0.0895, 0.085], [0, 0, 0], { r: 0.002 });
  for (let i = 0; i < 5; i++) P.box(M.steel, 0.028, 0.004, 0.005, [0, 0.0935, 0.06 + i * 0.012], [0, 0, 0]);
  P.box(M.accent, 0.052, 0.004, 0.012, [0, 0.0865, 0.125], [0, 0, 0]);
  // juntas de painel (sulcos escuros) e placa de identificação
  for (const [x0, x1, y] of [[-0.12, 0.02, 0.04], [0.03, 0.26, 0.03]]) P.box(M.steel, W + 0.0015, 0.0018, x1 - x0, [0, y, -(x0 + x1) / 2], [0, 0, 0]);
  P.box(M.steel, W + 0.0015, 0.05, 0.0018, [0, 0.045, -0.02], [0, 0, 0]);
  P.box(M.graphite, W + 0.002, 0.016, 0.07, [0, 0.074, -0.17], [0, 0, 0], { r: 0.002 });
  for (let i = 0; i < 4; i++) P.cylX(M.gunmetal, 0.0028, 0.0028, W + 0.004, [0, 0.074, -(0.145 + i * 0.016)], { seg: 6 });
  // tela de munição (lado esquerdo) + LEDs
  const scr = new AmmoScreen(256, 128, '#46d2ff');
  const scrMat = screenMat(scr.tex, 2.0);
  screenQuad(P, scrMat, 0.06, 0.03, [-W / 2 - 0.0012, 0.04, -0.03], [0, -Math.PI / 2, 0]);
  P.box(M.steel, 0.003, 0.036, 0.066, [-W / 2 - 0.0002, 0.04, -0.03], [0, 0, 0], { r: 0.001 });
  for (let i = 0; i < 3; i++) P.box(i === 0 ? M.green : M.cyanSoft, 0.003, 0.003, 0.005, [-W / 2 - 0.001, 0.078, -(0.06 + i * 0.01)], [0, 0, 0]);
  // alavanca de carga
  P.box(M.gunmetal, 0.02, 0.01, 0.014, [-W / 2 - 0.01, 0.06, 0.06], [0, 0, 0], { r: 0.003, group: 'bolt' });
  // empunhadura frontal
  P.profile(M.grip, [[0.27, 0.0], [0.32, 0.0], [0.31, -0.085], [0.28, -0.092], [0.265, -0.08]], 0.03, [0, 0, 0], { bevel: 0.006 });
  P
    .socket('gripR', [0.0, -0.045, 0.012], gripBasis(16 * D))
    .socket('gripL', [-0.008, -0.035, -0.29], gripBasis(-4 * D, true))
    .socket('muzzle', [0, 0.034, -0.61])
    .socket('sight', [0, 0.133, 0.0])
    .socket('magHand', [-0.01, -0.09, -0.12], gripBasis(0, true), 'mag')
    .socket('eject', [0.026, 0.05, -0.05]);
  const plate = stencilMat('HV-9 LANÇA', 'PULSO · 4,2 MJ', '#2a2d32');
  screenQuad(P, plate, 0.07, 0.0175, [-W / 2 - 0.0011, 0.058, -0.17], [0, -Math.PI / 2, 0]);
  const root = P.build('rifle');
  Object.defineProperty(root.userData, 'screen', { value: scr, enumerable: false, configurable: true });
  return root;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCOPETA DE PLASMA — "Brasa-12"
export function buildShotgun(M) {
  const P = new Parts();
  const W = 0.062;
  P.profile(M.rust, [[-0.12, -0.04], [0.2, -0.04], [0.225, -0.02], [0.23, 0.085], [0.12, 0.1], [-0.05, 0.1], [-0.12, 0.08]], W, [0, 0, 0], { bevel: 0.007, bevelSeg: 3 });
  P.profile(M.graphite, [[-0.11, -0.046], [0.19, -0.046], [0.2, -0.032], [-0.11, -0.032]], W + 0.004, [0, 0, 0], { bevel: 0.003 });
  // aletas de dissipação no topo
  for (let i = 0; i < 9; i++) P.box(M.gunmetal, W + 0.012, 0.022, 0.0045, [0, 0.108, -(0.0 + i * 0.016)], [0, 0, 0], { r: 0.0012 });
  P.box(M.steel, W - 0.01, 0.01, 0.15, [0, 0.098, -0.065], [0, 0, 0]);
  // canos sobrepostos
  for (const [y, r] of [[0.018, 0.016], [0.058, 0.015]]) {
    P.cylZ(M.barrel, r, r, 0.32, [0, y, -0.38], { seg: 20 });
    for (let i = 0; i < 4; i++) P.ringZ(M.copper, r + 0.004, 0.0035, [0, y, -(0.26 + i * 0.03)], { seg: 20, tube: 6 });
  }
  // câmara de plasma (janela laranja)
  P.box(M.orange, 0.004, 0.026, 0.07, [-W / 2 - 0.0005, 0.03, -0.09], [0, 0, 0]);
  P.profile(M.gunmetal, [[0.04, 0.012], [0.135, 0.012], [0.135, 0.05], [0.04, 0.05]], W + 0.006, [0, 0, 0], { holes: [[[0.05, 0.018], [0.125, 0.018], [0.125, 0.044], [0.05, 0.044]]], bevel: 0.0015 });
  // bomba (guarda-mão deslizante)
  P.section(M.grip, roundRect(-0.03, -0.004, 0.03, 0.078, 0.012), 0.13, [0, 0, -0.33], { bevel: 0.004, group: 'pump' });
  for (let i = 0; i < 6; i++) P.box(M.poly, 0.064, 0.006, 0.008, [0, -0.006, -(0.28 + i * 0.02)], [0, 0, 0], { group: 'pump' });
  // freio de boca
  for (const y of [0.018, 0.058]) {
    P.latheZ(M.steel, [[0.0, 0.53], [0.021, 0.53], [0.024, 0.545], [0.024, 0.59], [0.02, 0.6], [0.014, 0.6]], [0, y, 0], { seg: 20 });
    P.ringZ(M.orangeSoft, 0.0145, 0.0015, [0, y, -0.598], { seg: 18, tube: 4 });
  }
  P.box(M.steel, 0.05, 0.08, 0.012, [0, 0.038, -0.54], [0, 0, 0], { r: 0.004 });
  // empunhadura + gatilho
  P.profile(M.grip, [[-0.04, -0.04], [0.02, -0.04], [0.004, -0.15], [-0.008, -0.157], [-0.055, -0.15], [-0.044, -0.06]], 0.038, [0, 0, 0], { bevel: 0.007, bevelSeg: 3 });
  P.profile(M.steel, [[0.022, -0.045], [0.031, -0.047], [0.026, -0.072], [0.02, -0.078]], 0.006, [0, 0, 0], { bevel: 0.0015 });
  P.profile(M.graphite, [[0.012, -0.044], [0.08, -0.044], [0.08, -0.088], [0.006, -0.094], [0.004, -0.086], [0.07, -0.082], [0.07, -0.054], [0.012, -0.054]], 0.012, [0, 0, 0], { bevel: 0.0015 });
  // coronha curta
  P.profile(M.rust, [[-0.12, 0.08], [-0.12, -0.03], [-0.26, -0.06], [-0.3, -0.062], [-0.3, 0.06], [-0.24, 0.08]], 0.042, [0, 0, 0], { holes: [[[-0.15, 0.06], [-0.24, 0.06], [-0.25, -0.02], [-0.16, 0.0]]], bevel: 0.005 });
  P.box(M.poly, 0.046, 0.13, 0.024, [0, 0.0, 0.31], [4 * D, 0, 0], { r: 0.009 });
  // tubo lateral de cartuchos de plasma (direita) com cartuchos visíveis
  P.cylZ(M.lens, 0.012, 0.012, 0.14, [W / 2 + 0.012, 0.0, -0.08], { seg: 16 });
  for (let i = 0; i < 4; i++) P.cylZ(M.orangeSoft, 0.008, 0.008, 0.022, [W / 2 + 0.012, 0.0, -(0.03 + i * 0.03)], { seg: 10 });
  // cartucho na mão (recarga)
  P.cylZ(M.copper, 0.009, 0.009, 0.03, [0, 0, 0], { seg: 12, group: 'shell' });
  P.cylZ(M.orange, 0.0065, 0.0065, 0.032, [0, 0, 0], { seg: 10, group: 'shell' });
  // mira fantasma
  P.profile(M.steel, [[-0.03, 0.1], [0.0, 0.1], [0.0, 0.135], [-0.03, 0.135]], 0.03, [0, 0, 0], { holes: [[[-0.024, 0.11], [-0.006, 0.11], [-0.006, 0.128], [-0.024, 0.128]]], bevel: 0.0015 });
  P.box(M.orange, 0.003, 0.003, 0.003, [0, 0.112, -0.52], [0, 0, 0]);
  const scr = new AmmoScreen(256, 128, '#ff8a3a');
  screenQuad(P, screenMat(scr.tex, 2.0), 0.05, 0.025, [-W / 2 - 0.0012, 0.072, -0.0], [0, -Math.PI / 2, 0]);
  P
    .socket('gripR', [0.0, -0.055, 0.014], gripBasis(18 * D))
    .socket('gripL', [-0.004, 0.012, -0.34], gripBasis(-80 * D, true), 'pump')
    .socket('muzzle', [0, 0.038, -0.61])
    .socket('sight', [0, 0.118, 0.0])
    .socket('shellHand', [0, -0.012, 0.01], gripBasis(0, true), 'shell')
    .socket('eject', [W / 2, 0.05, -0.06]);
  const root = P.build('shotgun');
  Object.defineProperty(root.userData, 'screen', { value: scr, enumerable: false, configurable: true });
  root.userData.parts.shell.visible = false;
  return root;
}

// ═══════════════════════════════════════════════════════════════════════════
// SNIPER DE TRILHO — "Agulha"
export function buildSniper(M) {
  const P = new Parts();
  const W = 0.048;
  P.profile(M.navy, [[-0.14, -0.03], [0.28, -0.03], [0.3, -0.01], [0.3, 0.06], [0.16, 0.074], [-0.06, 0.074], [-0.14, 0.07]], W, [0, 0, 0], { bevel: 0.006, bevelSeg: 3 });
  P.profile(M.ceramic, [[-0.1, 0.02], [0.26, 0.02], [0.27, 0.034], [-0.1, 0.034]], W + 0.003, [0, 0, 0], { bevel: 0.001 });
  // trilhos paralelos com plasma entre eles
  for (const y of [0.012, 0.07]) {
    P.box(M.chrome, 0.012, 0.008, 0.72, [0, y, -0.66], [0, 0, 0], { r: 0.002 });
    P.box(M.gunmetal, 0.026, 0.012, 0.66, [0, y + (y < 0.05 ? -0.008 : 0.008), -0.66], [0, 0, 0], { r: 0.003 });
  }
  P.box(M.violet, 0.0035, 0.044, 0.68, [0, 0.041, -0.66], [0, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const z = -(0.36 + i * 0.12);
    P.box(M.navy, 0.04, 0.1, 0.018, [0, 0.041, z], [0, 0, 0], { r: 0.005 });
    P.box(M.cyanSoft, 0.042, 0.004, 0.004, [0, 0.085, z], [0, 0, 0]);
  }
  // garfo da boca
  P.box(M.steel, 0.03, 0.11, 0.025, [0, 0.041, -1.02], [0, 0, 0], { r: 0.006 });
  P.box(M.violet, 0.034, 0.006, 0.006, [0, 0.041, -1.034], [0, 0, 0]);
  // banco de capacitores (sob o chassi)
  for (let i = 0; i < 3; i++) {
    P.cylZ(M.gunmetal, 0.013, 0.013, 0.09, [0, -0.045, -(0.32 + i * 0.1)], { seg: 16 });
    P.ringZ(M.cyanSoft, 0.0135, 0.0012, [0, -0.045, -(0.32 + i * 0.1)], { seg: 16, tube: 4 });
  }
  P.box(M.navy, 0.03, 0.02, 0.32, [0, -0.03, -0.42], [0, 0, 0], { r: 0.004 });
  // bipé recolhido
  for (const s of [-1, 1]) P.cylZ(M.steel, 0.0035, 0.0035, 0.22, [s * 0.012, -0.065, -0.6], { seg: 8, rot: [0, s * 2 * D, 0] });
  // luneta
  P.cylZ(M.steel, 0.017, 0.017, 0.2, [0, 0.112, -0.12], { seg: 24 });
  P.latheZ(M.steel, [[0.0, 0.21], [0.018, 0.21], [0.025, 0.25], [0.026, 0.3], [0.021, 0.305]], [0, 0.112, 0], { seg: 24 });
  P.latheZ(M.steel, [[0.019, 0.02], [0.021, 0.015], [0.021, -0.02], [0.016, -0.025], [0.0, -0.025]], [0, 0.112, 0], { seg: 24 });
  P.add(M.lens, new THREE.CircleGeometry(0.022, 24), [0, 0.112, -0.298], [0, 0, 0]);
  P.add(M.lens, new THREE.CircleGeometry(0.016, 24), [0, 0.112, 0.02], [0, Math.PI, 0]);
  P.ringZ(M.cyanSoft, 0.0225, 0.0012, [0, 0.112, -0.296], { seg: 24, tube: 4 });
  P.cylY(M.gunmetal, 0.008, 0.008, 0.018, [0, 0.135, -0.12], { seg: 14 });
  P.cylX(M.gunmetal, 0.008, 0.008, 0.018, [0.026, 0.112, -0.12], { seg: 14 });
  for (const z of [-0.05, -0.17]) P.box(M.gunmetal, 0.024, 0.036, 0.018, [0, 0.09, z], [0, 0, 0], { r: 0.003 });
  // empunhadura + gatilho + coronha
  P.profile(M.grip, [[-0.04, -0.03], [0.018, -0.03], [0.002, -0.14], [-0.01, -0.147], [-0.055, -0.14], [-0.044, -0.05]], 0.034, [0, 0, 0], { bevel: 0.006, bevelSeg: 3 });
  P.profile(M.steel, [[0.02, -0.032], [0.028, -0.034], [0.024, -0.06], [0.018, -0.066]], 0.006, [0, 0, 0], { bevel: 0.0015 });
  P.profile(M.navy, [[-0.14, 0.07], [-0.14, -0.02], [-0.34, -0.07], [-0.44, -0.075], [-0.45, 0.05], [-0.36, 0.06], [-0.3, 0.09], [-0.2, 0.09]], 0.04, [0, 0, 0], { holes: [[[-0.18, 0.05], [-0.33, 0.035], [-0.36, -0.03], [-0.2, -0.0]]], bevel: 0.005 });
  P.box(M.poly, 0.044, 0.14, 0.024, [0, -0.01, 0.46], [4 * D, 0, 0], { r: 0.009 });
  // carregador
  P.profile(M.graphite, [[0.06, -0.03], [0.13, -0.03], [0.135, -0.095], [0.065, -0.1]], 0.032, [0, 0, 0], { bevel: 0.004, group: 'mag' });
  P.box(M.violet, 0.034, 0.03, 0.005, [0, -0.07, -0.13], [0, 0, 0], { group: 'mag' });
  const scr = new AmmoScreen(256, 128, '#c7a6ff');
  screenQuad(P, screenMat(scr.tex, 2.0), 0.05, 0.025, [-W / 2 - 0.0012, 0.045, -0.05], [0, -Math.PI / 2, 0]);
  P.box(M.gunmetal, 0.018, 0.01, 0.014, [-W / 2 - 0.01, 0.05, 0.08], [0, 0, 0], { r: 0.003, group: 'bolt' });
  P
    .socket('gripR', [-0.002, -0.045, 0.012], gripBasis(16 * D))
    .socket('gripL', [-0.006, -0.03, -0.33], gripBasis(-70 * D, true))
    .socket('muzzle', [0, 0.041, -1.05])
    .socket('sight', [0, 0.112, 0.02])
    .socket('magHand', [-0.01, -0.07, -0.1], gripBasis(0, true), 'mag')
    .socket('eject', [0.024, 0.05, -0.04]);
  const root = P.build('sniper');
  Object.defineProperty(root.userData, 'screen', { value: scr, enumerable: false, configurable: true });
  return root;
}

// ═══════════════════════════════════════════════════════════════════════════
// PISTOLA DE ÍONS — "Faísca"
export function buildPistol(M) {
  const P = new Parts();
  // armação (polímero)
  P.profile(M.poly, [[-0.03, -0.012], [0.1, -0.012], [0.11, 0.004], [-0.03, 0.006]], 0.03, [0, 0, 0], { bevel: 0.003 });
  P.profile(M.grip, [[-0.032, -0.008], [0.012, -0.01], [-0.004, -0.11], [-0.014, -0.116], [-0.046, -0.11], [-0.036, -0.03]], 0.031, [0, 0, 0], { bevel: 0.006, bevelSeg: 3 });
  // ferrolho (cerâmica + grafite)
  P.profile(M.ceramic, [[-0.04, 0.004], [0.115, 0.004], [0.125, 0.016], [0.12, 0.038], [0.0, 0.042], [-0.04, 0.038]], 0.032, [0, 0, 0], { bevel: 0.004, bevelSeg: 2, group: 'slide' });
  for (let i = 0; i < 6; i++) P.box(M.steel, 0.034, 0.024, 0.0025, [0, 0.022, 0.03 - i * 0.006], [0, 0, 0], { group: 'slide' });
  P.box(M.green, 0.0025, 0.01, 0.05, [-0.0165, 0.024, -0.06], [0, 0, 0], { group: 'slide' });
  P.box(M.green, 0.0025, 0.01, 0.05, [0.0165, 0.024, -0.06], [0, 0, 0], { group: 'slide' });
  P.box(M.steel, 0.008, 0.008, 0.008, [0, 0.046, 0.032], [0, 0, 0], { group: 'slide' });
  P.box(M.green, 0.002, 0.002, 0.002, [0, 0.0475, -0.115], [0, 0, 0], { group: 'slide' });
  // emissor
  P.latheZ(M.gunmetal, [[0.0, 0.115], [0.012, 0.115], [0.015, 0.13], [0.013, 0.145], [0.008, 0.147]], [0, 0.02, 0], { seg: 20 });
  P.ringZ(M.green, 0.0118, 0.0014, [0, 0.02, -0.142], { seg: 20, tube: 4 });
  // gatilho
  P.profile(M.steel, [[0.022, -0.012], [0.03, -0.014], [0.026, -0.036], [0.02, -0.04]], 0.005, [0, 0, 0], { bevel: 0.0012 });
  P.profile(M.poly, [[0.01, -0.01], [0.06, -0.01], [0.06, -0.05], [0.004, -0.054], [0.003, -0.048], [0.052, -0.044], [0.052, -0.018], [0.01, -0.018]], 0.01, [0, 0, 0], { bevel: 0.0012 });
  // carregador (na empunhadura)
  P.box(M.steel, 0.024, 0.012, 0.036, [0, -0.118, 0.026], [-14 * D, 0, 0], { r: 0.003, group: 'mag' });
  P.box(M.green, 0.026, 0.004, 0.02, [0, -0.108, 0.024], [-14 * D, 0, 0], { group: 'mag' });
  const scr = new AmmoScreen(256, 128, '#6dff9a');
  screenQuad(P, screenMat(scr.tex, 1.6), 0.032, 0.016, [-0.0165, -0.0, 0.0], [0, -Math.PI / 2, 0]);
  P
    .socket('gripR', [-0.001, -0.035, 0.016], gripBasis(16 * D))
    .socket('gripL', [-0.012, -0.05, 0.02], gripBasis(10 * D, true))
    .socket('muzzle', [0, 0.02, -0.15])
    .socket('sight', [0, 0.05, 0.03])
    .socket('magHand', [-0.004, -0.13, 0.03], gripBasis(0, true), 'mag')
    .socket('eject', [0.016, 0.03, -0.02]);
  const root = P.build('pistol');
  Object.defineProperty(root.userData, 'screen', { value: scr, enumerable: false, configurable: true });
  return root;
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTIFERRAMENTA — scanner, laser de mineração, lanterna, hack
export function buildMultitool(M) {
  const P = new Parts();
  const Y0 = 0.024;
  // corpo torneado (seção oval) — da traseira à boca
  P.latheZ(M.teal, [[0.0, -0.085], [0.018, -0.085], [0.026, -0.072], [0.031, -0.04], [0.033, 0.0], [0.032, 0.05], [0.034, 0.08], [0.036, 0.095]], [0, Y0, 0], { seg: 28, rot: [0, 0, 0] });
  // carenagem superior de cerâmica com nervura
  P.box(M.ceramic, 0.046, 0.022, 0.13, [0, Y0 + 0.024, -0.005], [0, 0, 0], { r: 0.01, seg: 3 });
  P.box(M.accent, 0.048, 0.006, 0.03, [0, Y0 + 0.03, 0.04], [0, 0, 0], { r: 0.002 });
  P.box(M.gunmetal, 0.012, 0.008, 0.1, [0, Y0 + 0.038, -0.01], [0, 0, 0], { r: 0.003 });
  // aletas traseiras
  for (let i = 0; i < 5; i++) P.box(M.steel, 0.07 - i * 0.006, 0.05 - i * 0.004, 0.004, [0, Y0, 0.05 + i * 0.008], [0, 0, 0], { r: 0.002 });
  // anel frontal (alojamento do emissor) e bobina luminosa
  P.ringZ(M.gunmetal, 0.04, 0.009, [0, Y0, -0.1], { seg: 32, tube: 10 });
  P.ringZ(M.ceramic, 0.042, 0.005, [0, Y0, -0.088], { seg: 32, tube: 8 });
  P.ringZ(M.cyan, 0.031, 0.0022, [0, Y0, -0.104], { seg: 32, tube: 6 });
  P.latheZ(M.steel, [[0.0, 0.07], [0.03, 0.07], [0.028, 0.1], [0.012, 0.115], [0.0, 0.118]], [0, Y0, 0], { seg: 24 });
  P.sphere(M.white, 0.008, [0, Y0, -0.12], { seg: 14 });
  // três pontas curvas à frente
  for (let k = 0; k < 3; k++) {
    const a = k * 2 * Math.PI / 3 + Math.PI / 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    P.box(M.ceramic, 0.009, 0.014, 0.055, [cx * 0.043, Y0 + cy * 0.043, -0.125], [-cy * 0.22, cx * 0.22, a - Math.PI / 2], { r: 0.003 });
    P.box(M.cyanSoft, 0.003, 0.003, 0.03, [cx * 0.047, Y0 + cy * 0.047, -0.14], [-cy * 0.22, cx * 0.22, 0]);
  }
  // cápsula lateral (lado esquerdo, voltada ao jogador)
  P.cylZ(M.glass, 0.012, 0.012, 0.085, [-0.04, Y0 - 0.004, -0.02], { seg: 18 });
  P.cylZ(M.cyan, 0.0068, 0.0068, 0.08, [-0.04, Y0 - 0.004, -0.02], { seg: 12 });
  for (const z of [0.024, -0.064]) P.ringZ(M.gunmetal, 0.0135, 0.0035, [-0.04, Y0 - 0.004, z], { seg: 18 });
  P.box(M.gunmetal, 0.012, 0.008, 0.07, [-0.03, Y0 - 0.004, -0.02], [0, 0, 0], { r: 0.002 });
  // empunhadura + gatilho
  P.profile(M.grip, [[-0.045, -0.002], [0.01, -0.004], [-0.004, -0.112], [-0.016, -0.119], [-0.06, -0.11], [-0.052, -0.024]], 0.034, [0, 0, 0], { bevel: 0.007, bevelSeg: 3 });
  P.profile(M.steel, [[0.012, -0.006], [0.022, -0.008], [0.018, -0.036], [0.01, -0.041]], 0.008, [0, 0, 0], { bevel: 0.0015 });
  P.box(M.teal, 0.04, 0.014, 0.05, [0, -0.006, 0.02], [0, 0, 0], { r: 0.006 });
  // tela superior traseira
  const scr = new ToolScreen();
  P.box(M.steel, 0.036, 0.004, 0.056, [0, Y0 + 0.037, 0.03], [-0.25, 0, 0], { r: 0.0015 });
  screenQuad(P, screenMat(scr.tex, 2.2), 0.032, 0.05, [0, Y0 + 0.0395, 0.03], [-Math.PI / 2 - 0.25, 0, 0]);
  P
    .socket('gripR', [-0.004, -0.04, 0.018], gripBasis(18 * D))
    .socket('gripL', [-0.03, 0.0, -0.05], gripBasis(-90 * D, true))
    .socket('muzzle', [0, Y0, -0.125])
    .socket('sight', [0, 0.09, 0.0]);
  const root = P.build('multitool');
  Object.defineProperty(root.userData, 'screen', { value: scr, enumerable: false, configurable: true });
  return root;
}

/** Tela da multiferramenta (modo + forma de onda/medidor). */
export class ToolScreen {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = 128; this.cv.height = 224;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.last = '';
    this.draw({ mode: 'scanner', value: 0, t: 0 });
  }
  draw({ mode = 'scanner', value = 0, t = 0, text = '' }) {
    const key = `${mode}|${Math.round(value * 30)}|${Math.round(t * 8)}|${text}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.g, W = 128, H = 224;
    const C = { scanner: '#5fe8c8', mining: '#ff9a3a', light: '#f2f6ff', hack: '#b98cff' }[mode] || '#5fe8c8';
    g.fillStyle = '#020608'; g.fillRect(0, 0, W, H);
    g.strokeStyle = C; g.fillStyle = C; g.lineWidth = 2; g.globalAlpha = 0.5; g.strokeRect(4, 4, W - 8, H - 8); g.globalAlpha = 1;
    g.font = '700 15px "DejaVu Sans Mono", monospace'; g.textAlign = 'center';
    g.fillText({ scanner: 'SCAN', mining: 'MINER', light: 'LUZ', hack: 'HACK' }[mode] || 'MULTI', W / 2, 26);
    // forma de onda
    g.beginPath();
    for (let x = 0; x <= 100; x += 2) {
      const k = x / 100;
      const y = 80 + Math.sin(k * 18 + t * 6) * 10 * (0.3 + value) * Math.sin(k * Math.PI) + Math.sin(k * 51 + t * 13) * 3;
      if (x === 0) g.moveTo(14 + x, y); else g.lineTo(14 + x, y);
    }
    g.stroke();
    // medidor circular
    g.globalAlpha = 0.25; g.beginPath(); g.arc(W / 2, 150, 34, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    g.lineWidth = 5; g.beginPath(); g.arc(W / 2, 150, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, value)); g.stroke();
    g.font = '700 18px "DejaVu Sans Mono", monospace';
    g.fillText(`${Math.round(value * 100)}`, W / 2, 157);
    g.font = '600 11px "DejaVu Sans Mono", monospace';
    g.fillText(text || 'PRONTO', W / 2, 206);
    this.tex.needsUpdate = true;
  }
}

/** Granada de pulso (puck). */
export function buildGrenade(M) {
  const P = new Parts();
  P.latheZ(M.graphite, [[0.0, -0.022], [0.026, -0.022], [0.033, -0.012], [0.033, 0.012], [0.026, 0.022], [0.0, 0.022]], [0, 0, 0], { seg: 24, rot: [Math.PI / 2, 0, 0] });
  P.ringZ(M.orange, 0.033, 0.0022, [0, 0, 0], { seg: 28, tube: 5, rot: [Math.PI / 2, 0, 0] });
  P.cylY(M.gunmetal, 0.012, 0.012, 0.05, [0, 0, 0], { seg: 16 });
  P.cylY(M.orange, 0.006, 0.006, 0.052, [0, 0, 0], { seg: 10 });
  return P.build('granada', { shadows: true });
}

export const BUILDERS = { rifle: buildRifle, shotgun: buildShotgun, sniper: buildSniper, pistol: buildPistol, multitool: buildMultitool };
