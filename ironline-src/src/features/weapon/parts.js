/**
 * Peças compartilhadas pelas armas novas (design original): punho de
 * pistola no MESMO gabarito do KR-9 (a mão direita resolvida encaixa igual),
 * guarda-mato, gatilho, trilhos Picatinny, ranhuras M-LOK, dispositivos de
 * boca, lunetas/miras e os ACESSÓRIOS (supressor, empunhadura vertical,
 * laser, ótica 3x).
 *
 * Convenção (igual ao fuzil): X direita, Y cima, frente −Z, eixo do cano em
 * y = 0, perfis laterais em (u = frente, v = cima). O punho/gatilho ficam em
 * u ≈ 0,08 (gatilho em z = −0,082, y = −0,049) em TODAS as armas longas.
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX, cylY, torus, roundRect } from './geo.js';
import { makeScopeLens, makeGlint } from './scope.js';
import { makeLens } from './optic.js';

export const M4 = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);

/** Trapézio (seção do trilho). */
const trap = (hb, ht, h) => [[-hb, 0], [hb, 0], [ht, h], [-ht, h]];

/** Trilho Picatinny ao longo de u ∈ [u0,u1] com base em y. */
export function picatinny(K, mat, u0, u1, yBase, { w = 0.021, x = 0 } = {}) {
  const len = u1 - u0;
  K.add(mat, section(trap(w * 0.5, w * 0.42, 0.0035), -u0, len, { b: 0.0006 }), M4(x, yBase, 0));
  for (let u = u0 + 0.003; u + 0.005 <= u1; u += 0.01) K.add(mat, rbox(w, 0.0042, 0.0052, 0.0008, x, yBase + 0.0056, -(u + 0.0026), 1));
}
/** Trilho lateral/inferior (girado em torno do eixo do cano): ang = 0 topo, π/2 esquerda, π baixo. */
export function railAt(K, mat, u0, u1, r, ang, { w = 0.019 } = {}) {
  const k = new Kit();
  picatinny(k, mat, u0, u1, 0, { w });
  const m = new THREE.Matrix4().makeRotationZ(ang).multiply(M4(0, r, 0));
  for (const [mt, list] of k.parts) for (const g of list) K.add(mt, g, m);
}
/** Ranhura M-LOK (furo arredondado) como Path para `side(..., { holes })`. */
export const slot = (u, v, len, hgt) => roundRect(u - len / 2, v - hgt / 2, u + len / 2, v + hgt / 2, hgt / 2 - 1e-4, 4);

/**
 * Punho de pistola no gabarito do KR-9 (a mesma SDF serve para a mão).
 * style: 0 = liso com pastilhas, 1 = encaixes de dedo, 2 = palma cheia.
 */
export function pistolGrip(K, { mat = 'polymer', pad = 'rubber', style = 0 } = {}) {
  const g = new THREE.Shape();
  g.moveTo(0.044, -0.046);
  g.bezierCurveTo(0.046, -0.07, 0.034, -0.08, 0.036, -0.092);
  if (style === 1) {
    // três encaixes de dedo na frente
    g.bezierCurveTo(0.037, -0.1, 0.029, -0.103, 0.03, -0.109);
    g.bezierCurveTo(0.031, -0.118, 0.024, -0.12, 0.025, -0.127);
    g.bezierCurveTo(0.026, -0.136, 0.019, -0.142, 0.017, -0.152);
  } else {
    g.bezierCurveTo(0.037, -0.1, 0.028, -0.106, 0.027, -0.116);
    g.bezierCurveTo(0.026, -0.13, 0.02, -0.142, 0.017, -0.152);
  }
  g.lineTo(0.016, -0.158);
  g.lineTo(-0.024, -0.152);
  if (style === 2) g.bezierCurveTo(-0.03, -0.13, -0.02, -0.1, -0.012, -0.072);
  else g.bezierCurveTo(-0.026, -0.13, -0.016, -0.1, -0.011, -0.072);
  g.bezierCurveTo(-0.008, -0.058, -0.016, -0.05, -0.028, -0.048);
  g.lineTo(-0.026, -0.044);
  g.lineTo(0.044, -0.044);
  K.add(mat, side(g, style === 2 ? 0.031 : 0.029, { b: 0.0065, seg: 4, curve: 16 }));
  for (const sx of [-1, 1]) {
    const p = new THREE.Shape();
    p.moveTo(0.028, -0.07);
    p.bezierCurveTo(0.03, -0.09, 0.022, -0.11, 0.018, -0.14);
    p.lineTo(-0.014, -0.138);
    p.bezierCurveTo(-0.012, -0.11, -0.006, -0.09, -0.004, -0.07);
    K.add(pad, side(p, 0.002, { b: 0.0007, cx: sx * (style === 2 ? 0.0155 : 0.0145) }));
    // pontilhado em relevo (losangos) na pastilha
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 3; j++) {
        const v = -0.08 - i * 0.0062, u = 0.016 - j * 0.0085 - (i % 2) * 0.004 + (i * 0.0011);
        K.add(pad, rbox(0.0012, 0.0026, 0.0026, 0.0006, sx * (style === 2 ? 0.0165 : 0.0155), v, -u, 1));
      }
    }
  }
  K.add(mat, rbox(0.03, 0.006, 0.042, 0.0025, 0, -0.157, 0.003));
}

/** Guarda-mato (u 0,044..0,128). */
export function triggerGuard(K, mat) {
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
  K.add(mat, side(tg, 0.011, { b: 0.0012 }));
}

/** Gatilho (grupo móvel, pivô no topo). `flat` = gatilho reto de precisão. */
export function buildTrigger(M, { flat = false, mat = 'steel' } = {}) {
  const trig = new THREE.Group();
  const k = new Kit();
  const t = new THREE.Shape();
  if (flat) {
    t.moveTo(0.0, 0.0);
    t.lineTo(0.0045, -0.003);
    t.lineTo(0.0045, -0.02);
    t.lineTo(0.0015, -0.02);
    t.lineTo(0.0015, -0.005);
    t.lineTo(-0.003, -0.002);
  } else {
    t.moveTo(0.0, 0.0);
    t.quadraticCurveTo(0.006, -0.008, 0.004, -0.02);
    t.lineTo(0.001, -0.02);
    t.quadraticCurveTo(0.002, -0.009, -0.003, -0.002);
  }
  k.add(mat, side(t, 0.006, { b: 0.0012 }));
  trig.add(k.build(M, 'trigger'));
  trig.position.set(0, -0.049, -0.082);
  return trig;
}

/** Seletor (alavanca no lado esquerdo). */
export function buildSelector(M, x = -0.0145, y = -0.031, z = -0.03) {
  const sel = new THREE.Group();
  const k = new Kit();
  k.add('steel', cylX(0.0055, 0.003, 0, 0, 0, 20));
  k.add('steel', rbox(0.0025, 0.004, 0.019, 0.0012, -0.0004, 0, -0.008));
  k.add('steel', rbox(0.004, 0.0055, 0.004, 0.0015, -0.0012, 0.0005, -0.0165));
  sel.add(k.build(M, 'selector'));
  sel.position.set(x, y, z);
  sel.rotation.x = -0.45;
  return sel;
}

/** Olhal de bandoleira (QD) no lado esquerdo. */
export function swivel(K, mat, x, y, z) {
  K.add(mat, cylX(0.0055, 0.004, x, y, z, 20));
  K.add('cavity', cylX(0.0032, 0.0042, x - 0.0003, y, z, 16));
}

/** Pino com cabeça e fenda (lado esquerdo e direito). */
export function pin(K, u, v, w, r = 0.0026) {
  K.add('steel', cylX(r, w + 0.0006, 0, v, -u, 16));
  for (const sx of [-1, 1]) K.add('cavity', rbox(0.0008, 0.0006, r * 1.3, 0.0002, sx * (w / 2 + 0.0002), v, -u, 1));
}

/** Parafuso cabeça Allen visto de lado (sx = lado). */
export function screw(K, x, y, z, sx = -1, r = 0.0021) {
  K.add('steel', cylX(r, 0.0012, x, y, z, 14));
  K.add('cavity', cylX(r * 0.45, 0.0014, x + sx * 0.0002, y, z, 6));
}

// ─── boca ──────────────────────────────────────────────────────────────
/**
 * Dispositivo de boca a partir de u (para a frente). type: 'flash' (3 pontas),
 * 'brake' (janelas laterais), 'comp' (compensador com portas em cima).
 * Devolve o comprimento.
 */
export function muzzleDevice(K, type, u, r = 0.011) {
  if (type === 'flash') {
    const L = 0.052;
    K.add('burnt', cylZ(r, -u, -(u + 0.012), { seg: 24 }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const g = rbox(0.0062, 0.0042, L - 0.012, 0.0012, 0, r * 0.82, -(u + 0.012 + (L - 0.012) / 2));
      g.rotateZ(a - Math.PI / 2);
      K.add('burnt', g);
    }
    K.add('cavity', cylZ(r * 0.55, -(u + 0.011), -(u + L), { seg: 16 }));
    return L;
  }
  if (type === 'brake') {
    const L = 0.072;
    K.add('burnt', rbox(r * 2.5, r * 2.0, L, 0.003, 0, 0, -(u + L / 2), 2));
    for (let i = 0; i < 3; i++) {
      const z = -(u + 0.014 + i * 0.019);
      K.add('cavity', rbox(r * 2.52, r * 1.2, 0.0095 - i * 0.001, 0.0015, 0, 0, z, 1));
    }
    K.add('cavity', cylZ(r * 0.45, -(u + L - 0.002), -(u + L + 0.0005), { seg: 16 }));
    return L;
  }
  // comp
  const L = 0.045;
  K.add('burnt', cylZ(r * 1.05, -u, -(u + L), { seg: 24 }));
  for (let i = 0; i < 4; i++) K.add('cavity', rbox(0.0045, 0.004, 0.0042, 0.0012, 0, r * 0.95, -(u + 0.012 + i * 0.009), 1));
  for (const sx of [-1, 1]) K.add('cavity', rbox(0.004, r * 1.2, 0.007, 0.0015, sx * r, 0, -(u + 0.03), 1));
  K.add('cavity', cylZ(r * 0.5, -(u + L - 0.001), -(u + L + 0.0005), { seg: 16 }));
  return L;
}

// ─── acessórios ────────────────────────────────────────────────────────
/** Supressor (tubo com tampa frontal, anéis, chave e textura de cerakote). */
export function buildSuppressor(M, { len = 0.16, r = 0.019 } = {}) {
  const g = new THREE.Group();
  g.name = 'suppressor';
  const K = new Kit();
  K.add('suppressor', cylZ(r, 0, -len, { seg: 36 }));
  // tampa de trás (cônica) e acoplamento
  K.add('steel', cylZ(r * 0.62, 0.012, 0, { seg: 28, r1: r * 0.98 }));
  for (let i = 0; i < 10; i++) K.add('steel', rbox(0.003, r * 0.35, 0.011, 0.0008, Math.cos((i / 10) * Math.PI * 2) * r * 0.7, Math.sin((i / 10) * Math.PI * 2) * r * 0.7, 0.006, 1).rotateZ(0));
  // anéis de pega e frente chanfrada
  for (const z of [-0.012, -0.018, -len + 0.016]) K.add('suppressor', cylZ(r * 1.025, z, z - 0.003, { seg: 36 }));
  K.add('steel', cylZ(r * 0.98, -len, -len - 0.006, { seg: 36, r1: r * 0.7 }));
  K.add('cavity', cylZ(r * 0.3, -len - 0.004, -len - 0.0066, { seg: 20 }));
  // marcação (faixa em baixo-relevo)
  K.add('cavity', cylZ(r * 1.002, -len * 0.55, -len * 0.55 - 0.0012, { seg: 36 }));
  g.add(K.build(M, 'suppressor'));
  g.userData.len = len + 0.006;
  return g;
}

/** Empunhadura vertical (polímero com encaixe no trilho). */
export function buildForegrip(M) {
  const g = new THREE.Group();
  g.name = 'foregrip';
  const K = new Kit();
  // base de trilho com trava
  K.add('polymer', rbox(0.024, 0.009, 0.05, 0.002, 0, -0.0045, 0));
  K.add('steel', cylX(0.0035, 0.03, 0, -0.005, 0.012, 16));
  // corpo levemente inclinado para a frente com encaixes
  const s = new THREE.Shape();
  s.moveTo(0.02, -0.008);
  s.bezierCurveTo(0.024, -0.03, 0.02, -0.06, 0.024, -0.085);
  s.lineTo(0.022, -0.096);
  s.lineTo(-0.016, -0.096);
  s.lineTo(-0.018, -0.085);
  s.bezierCurveTo(-0.014, -0.06, -0.018, -0.03, -0.016, -0.008);
  K.add('polymer', side(s, 0.028, { b: 0.006, seg: 3 }));
  for (let i = 0; i < 4; i++) K.add('rubber', rbox(0.0295, 0.0035, 0.034, 0.0015, 0, -0.025 - i * 0.015, -0.002));
  K.add('rubber', rbox(0.031, 0.006, 0.042, 0.0025, 0, -0.096, -0.002));
  g.add(K.build(M, 'foregrip'));
  return g;
}

/** Módulo de laser (caixa com janela do emissor e botão). Feixe fica no index. */
export function buildLaser(M) {
  const g = new THREE.Group();
  g.name = 'laser';
  const K = new Kit();
  K.add('receiver', rbox(0.024, 0.02, 0.05, 0.004, 0, 0, 0, 2));
  K.add('rubber', rbox(0.012, 0.004, 0.012, 0.0015, 0, 0.011, 0.012));
  // janelas dos emissores (laser + IR)
  K.add('cavity', cylZ(0.0042, -0.025, -0.0256, { x: -0.004, y: 0.003, seg: 18 }));
  K.add('steel', cylZ(0.0048, -0.0245, -0.0258, { x: 0.005, y: -0.003, seg: 18 }));
  // aletas de ajuste (parafusos de zeragem)
  K.add('steel', cylX(0.0022, 0.003, -0.0135, 0.004, 0.006, 12));
  K.add('steel', cylY(0.0022, 0.003, 0.004, 0.0115, -0.008, 12));
  g.add(K.build(M, 'laser'));
  const emitter = new THREE.Object3D();
  emitter.position.set(-0.004, 0.003, -0.026);
  g.add(emitter);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0036, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.12) }));
  glass.position.set(-0.004, 0.003, -0.0258);
  glass.rotation.y = Math.PI;
  g.add(glass);
  g.userData.emitter = emitter;
  return g;
}

/**
 * Luneta (tubo, sino da objetiva, ocular, torres, anéis, base). O pivô é o
 * centro do tubo, eixo ao longo de −Z; z = 0 no fim da ocular (lado do olho).
 * Devolve { root, lens, glint, len }.
 */
export function buildScope(M, { len = 0.32, tube = 0.015, obj = 0.026, eye = 0.02, zoom = 8, reticle = 'mil', view = null, rings = [0.1, 0.2], turretH = 0.02, ringH = 0.032, color } = {}) {
  const root = new THREE.Group();
  root.name = 'scope';
  const K = new Kit();
  const S = 40;
  // ocular: sino + anel de dioptria serrilhado
  const eyeL = 0.075, objL = 0.085;
  // ocular aberta (sem tampa na frente da lente) + anel escuro em volta da lente
  K.add('scope', cylZ(eye, 0, -0.012, { seg: S, open: true }));
  K.add('rubber', cylZ(eye + 0.0012, -0.003, -0.01, { seg: S, open: true }));
  K.add('cavity', new THREE.RingGeometry(eye * 0.8, eye * 1.001, S).translate(0, 0, -0.0062));
  K.add('rubber', new THREE.RingGeometry(eye * 0.97, eye + 0.0013, S).translate(0, 0, 0.0001));
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    K.add('scope', rbox(0.0016, 0.0016, 0.007, 0.0005, Math.cos(a) * (eye + 0.0016), Math.sin(a) * (eye + 0.0016), -0.0065, 1));
  }
  K.add('scope', cylZ(eye, -0.012, -eyeL, { seg: S, r1: tube }));
  // anel de aumento (com aleta)
  K.add('scope', cylZ(tube * 1.12, -eyeL, -eyeL - 0.022, { seg: S }));
  K.add('scope', rbox(0.004, 0.005, 0.016, 0.0012, 0, tube * 1.12 + 0.0018, -eyeL - 0.011));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    K.add('rubber', rbox(0.0014, 0.0014, 0.018, 0.0004, Math.cos(a) * tube * 1.13, Math.sin(a) * tube * 1.13, -eyeL - 0.011, 1));
  }
  // tubo central + sela das torres
  const z1 = -(len - objL);
  K.add('scope', cylZ(tube, -eyeL - 0.022, z1, { seg: S }));
  const tz = -(eyeL + 0.022 + (len - objL - eyeL - 0.022) * 0.5);
  K.add('scope', rbox(tube * 2.3, tube * 2.1, 0.05, 0.008, 0, 0, tz, 3));
  // torres: elevação (topo), deriva (direita), paralaxe (esquerda)
  const turret = (ax, h, r) => {
    const k = new Kit();
    k.add('scope', cylY(r, h, 0, h / 2, 0, 30));
    k.add('scope', cylY(r * 1.06, h * 0.45, 0, h * 0.78, 0, 30));
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      k.add('scope', rbox(0.0012, h * 0.42, 0.0012, 0.0004, Math.cos(a) * r * 1.07, h * 0.78, Math.sin(a) * r * 1.07, 1));
    }
    k.add('steel', cylY(r * 0.35, 0.0012, 0, h + 0.0006, 0, 16));
    // marcas de clique (traços brancos) na saia
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.add('dot', rbox(0.0007, h * 0.18, 0.0007, 0.0002, Math.cos(a) * r * 1.0, h * 0.33, Math.sin(a) * r * 1.0, 1));
    }
    const m = new THREE.Matrix4();
    if (ax === 'top') m.makeTranslation(0, tube * 0.9, tz);
    else if (ax === 'right') m.makeRotationZ(-Math.PI / 2).setPosition(tube * 0.9, 0, tz);
    else m.makeRotationZ(Math.PI / 2).setPosition(-tube * 0.9, 0, tz);
    for (const [mt, list] of k.parts) for (const g of list) K.add(mt, g, m);
  };
  turret('top', turretH, 0.012);
  turret('right', turretH * 0.85, 0.011);
  turret('left', turretH * 0.7, 0.0105);
  // sino da objetiva + para-sol
  K.add('scope', cylZ(tube, z1, z1 - 0.02, { seg: S, r1: obj }));
  K.add('scope', cylZ(obj, z1 - 0.02, -len, { seg: S }));
  K.add('scope', cylZ(obj * 1.03, -len + 0.006, -len, { seg: S }));
  K.add('cavity', cylZ(obj * 0.94, -len + 0.0004, -len - 0.0002, { seg: S }));
  // anéis + base em monobloco (alumínio), parafusos
  for (const rz of rings) {
    const z = -(len * rz + eyeL * 0.6);
    K.add('mount', torus(tube + 0.0022, 0.0028, 0, 0, z, 0, 0, 0));
    K.add('mount', rbox(0.008, 0.004, 0.012, 0.001, 0, tube + 0.004, z));
    K.add('mount', rbox(tube * 2.2, ringH - tube, 0.014, 0.002, 0, -tube - (ringH - tube) / 2 + 0.001, z));
    for (const sx of [-1, 1]) {
      K.add('mount', rbox(0.006, 0.01, 0.014, 0.0015, sx * (tube + 0.003), 0, z));
      screw(K, sx * (tube + 0.006), 0.003, z, sx, 0.0017);
      screw(K, sx * (tube + 0.006), -0.003, z, sx, 0.0017);
    }
    K.add('mount', rbox(0.026, 0.006, 0.018, 0.0015, 0, -ringH + 0.002, z));
  }
  root.add(K.build(M, 'scope'));
  // lente da ocular (imagem ampliada) e da objetiva (vidro escuro)
  const lens = makeScopeLens({ radius: eye * 0.82, zoom, reticle, view, color });
  lens.position.set(0, 0, -0.006);
  root.add(lens);
  const objLens = new THREE.Mesh(new THREE.CircleGeometry(obj * 0.93, 40), new THREE.MeshPhysicalMaterial({
    color: 0x0a1418, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.6, iridescenceIOR: 1.6,
  }));
  objLens.position.set(0, 0, -len + 0.002);
  objLens.rotation.y = Math.PI;
  root.add(objLens);
  const glint = makeGlint(0.09);
  glint.position.set(0, 0, -len - 0.004);
  root.add(glint);
  return { root, lens, glint, len, ringH };
}

/** Mira reflexa compacta (janela inclinada + capô) com a lente holográfica. */
export function buildReflex(M, { w = 0.026, h = 0.02, depth = 0.03, base = 0.006 } = {}) {
  const root = new THREE.Group();
  root.name = 'reflex';
  const K = new Kit();
  // corpo/base (sobre o trilho)
  K.add('receiver', rbox(w + 0.008, base, depth + 0.012, 0.0018, 0, base / 2, -depth / 2));
  // aro da janela (perfil em U invertido)
  const hx = w / 2 + 0.003, ht = base + h + 0.004;
  for (const sx of [-1, 1]) K.add('receiver', rbox(0.004, h + 0.004, depth * 0.5, 0.0015, sx * (hx - 0.002), base + (h + 0.004) / 2, -depth * 0.6));
  K.add('receiver', rbox(w + 0.008, 0.004, depth * 0.55, 0.0018, 0, ht - 0.002, -depth * 0.6));
  // caixa da bateria (lado direito) e botões
  K.add('receiver', cylX(0.0055, 0.006, hx + 0.003, base + 0.006, -depth * 0.2, 24));
  K.add('rubber', rbox(0.006, 0.003, 0.006, 0.0012, 0, base + 0.0015, -0.002));
  K.add('steel', cylX(0.003, 0.004, -hx - 0.001, base * 0.5, -depth * 0.5, 12));
  root.add(K.build(M, 'reflex'));
  const lens = makeLens({ w, h, intensity: 10 });
  lens.position.set(0, base + h / 2 + 0.001, -depth * 0.6);
  root.add(lens);
  return { root, lens, sightY: base + h / 2 + 0.001, sightZ: -depth * 0.6 };
}

/** Ótica 3x compacta (prisma) — usa a lente com imagem ampliada. */
export function buildOptic3x(M, view) {
  const root = new THREE.Group();
  root.name = 'optic3x';
  const K = new Kit();
  const len = 0.105, r = 0.0135;
  // corpo prismático (caixa arredondada) + ocular redonda + objetiva
  K.add('scope', rbox(0.034, 0.03, 0.05, 0.007, 0, 0.002, -0.05, 3));
  K.add('scope', cylZ(r * 1.25, 0, -0.026, { seg: 36, r1: r * 1.05, open: true }));
  K.add('rubber', cylZ(r * 1.32, -0.002, -0.012, { seg: 36, open: true }));
  K.add('cavity', new THREE.RingGeometry(r * 1.02, r * 1.26, 36).translate(0, 0, -0.0062));
  K.add('rubber', new THREE.RingGeometry(r * 1.2, r * 1.33, 36).translate(0, 0, -0.0019));
  K.add('scope', cylZ(r * 1.05, -0.074, -len, { seg: 36, r1: r * 1.3 }));
  K.add('cavity', cylZ(r * 1.2, -len + 0.0004, -len - 0.0002, { seg: 36 }));
  // torre e botão de iluminação
  K.add('scope', cylY(0.008, 0.008, 0, 0.021, -0.05, 24));
  K.add('scope', cylX(0.0075, 0.007, 0.02, 0.004, -0.045, 24));
  // base com alavanca QD
  K.add('mount', rbox(0.026, 0.012, 0.06, 0.002, 0, -0.019, -0.05));
  K.add('steel', rbox(0.004, 0.006, 0.03, 0.0015, -0.015, -0.019, -0.05));
  root.add(K.build(M, 'optic3x'));
  const lens = makeScopeLens({ radius: r * 1.05, zoom: 3, reticle: 'ring', view, color: [1, 0.25, 0.05] });
  lens.material.uniforms.uRetScale.value = 2.2;
  lens.position.set(0, 0, -0.006);
  root.add(lens);
  const glint = makeGlint(0.05);
  glint.position.set(0, 0, -len - 0.003);
  root.add(glint);
  return { root, lens, glint, len, ringH: 0.025 };
}

/** Miras de ferro rebatíveis (traseira de abertura + dianteira de poste). */
export function ironSights(K, uRear, uFront, yRail, { h = 0.022 } = {}) {
  // traseira: torre com abertura (anel) — o olho alinha a abertura com o poste
  K.add('steel', rbox(0.02, 0.008, 0.016, 0.0018, 0, yRail + 0.004, -uRear));
  K.add('steel', rbox(0.004, h, 0.006, 0.0012, -0.007, yRail + h / 2 + 0.006, -uRear));
  K.add('steel', rbox(0.004, h, 0.006, 0.0012, 0.007, yRail + h / 2 + 0.006, -uRear));
  K.add('steel', torus(0.0032, 0.0012, 0, yRail + h + 0.002, -uRear, 0, 0, 0));
  // dianteira: poste protegido por orelhas
  K.add('steel', rbox(0.018, 0.008, 0.014, 0.0018, 0, yRail + 0.004, -uFront));
  for (const sx of [-1, 1]) K.add('steel', rbox(0.003, h + 0.002, 0.008, 0.001, sx * 0.0072, yRail + h / 2 + 0.006, -uFront));
  K.add('steel', rbox(0.0018, h - 0.002, 0.0018, 0.0005, 0, yRail + h / 2 + 0.006, -uFront));
  return { y: yRail + h + 0.002 };
}
