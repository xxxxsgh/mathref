/**
 * Mobília modelada (mesas, cadeiras, mesa de escritório de aço, arquivo,
 * armário de vestiário, estante) com o kit de propkit.js: peças boleadas,
 * UV por peça em metros (veio acompanhando a tábua), desgaste nas quinas,
 * variação de tom/sujeira por instância e sombra de contato no chão.
 *
 * Cada função recebe { x, y, z, yaw } e um `pose` opcional:
 *   'up'       em pé
 *   'side'     tombado de lado
 *   'top'      virado de tampo para baixo / encostado (mesa barricada)
 * e devolve a matriz do objeto. Colisores são caixas alinhadas ao mundo
 * envolvendo a pose final.
 */
import * as THREE from 'three';
import { mat4 } from './geo.js';
import { contact } from './shapes.js';
import { bevelBox, bevelCyl, vary, part } from './propkit.js';

const _b = new THREE.Box3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Colisor alinhado ao mundo para uma caixa local (centro/tamanho) sob M. */
function collideLocal(B, M, center, size, mat, opts = {}) {
  _b.setFromCenterAndSize(_c.set(...center), _s.set(...size)).applyMatrix4(M);
  B.collider(_b.min.toArray(), _b.max.toArray(), mat, opts);
}

/** Matriz para a pose: em pé, de lado (rola 90° em z) ou tombada para trás. */
function poseMatrix(x, y, z, yaw, pose, lift, extra = [0, 0, 0]) {
  if (pose === 'side') return mat4([x, y + lift, z], [extra[0], yaw, Math.PI / 2 + extra[2]]);
  if (pose === 'back') return mat4([x, y + lift, z], [-Math.PI / 2 + extra[0], yaw, extra[2]]);
  if (pose === 'top') return mat4([x, y + lift, z], [Math.PI + extra[0], yaw, extra[2]]);
  return mat4([x, y, z], [extra[0], yaw, extra[2]]);
}

/**
 * Mesa de madeira maciça (refeitório/escritório velho): tampo de 4 cm com
 * bisel, saia de 9 cm, pernas cônicas com sapata, travessa baixa. Verniz
 * escuro gasto nas bordas. pose 'barricade' = tombada de lado com o tampo
 * virado para a ameaça (como em interior.js).
 */
export function woodTable(W, x, y, z, yaw, opts = {}) {
  const { B, rng } = W;
  const L = opts.len || 1.6, D = opts.depth || 0.85, H = 0.76;
  const base = vary(rng, opts.tint || [0.5, 0.36, 0.25], { tone: 0.1, fade: 0.2, dirt: 0.15 });
  const leg = base.map((c) => c * 0.85);
  const pose = opts.pose || 'up';
  // tombada: o tampo vira parede (rotação em torno do eixo longo)
  const M = pose === 'barricade'
    ? mat4([x, y + D / 2 + 0.005, z], [Math.PI / 2 - 0.06, yaw, 0]).multiply(mat4([0, -H + 0.02, 0]))
    : poseMatrix(x, y, z, yaw, pose, 0);
  const top = bevelBox(L, 0.04, D, 0.012, { wear: 0.45 });
  part(B, M, top, 'wood', [0, H - 0.02, 0], [0, 0, 0], base);
  // saia (avental) recuada 6 cm
  for (const s of [-1, 1]) {
    part(B, M, bevelBox(L - 0.2, 0.09, 0.022, 0.006), 'wood', [0, H - 0.085, s * (D / 2 - 0.07)], [0, 0, 0], leg);
    part(B, M, bevelBox(0.022, 0.09, D - 0.2, 0.006), 'wood', [s * (L / 2 - 0.1), H - 0.085, 0], [0, 0, 0], leg);
  }
  // pernas cônicas (seção quadrada boleada → cilindro de 4 lados girado)
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    part(B, M, bevelBox(0.055, H - 0.06, 0.055, 0.008, { wear: 0.4 }), 'wood', [a * (L / 2 - 0.1), (H - 0.06) / 2, b * (D / 2 - 0.07)], [0, 0, 0], leg);
    // sapata de feltro/metal
    part(B, M, bevelCyl(0.02, 0.022, 0.012, 8), 'black', [a * (L / 2 - 0.1), 0.006, b * (D / 2 - 0.07)], [0, 0, 0], [0.4, 0.4, 0.4]);
  }
  // travessa baixa no comprimento
  part(B, M, bevelBox(L - 0.25, 0.035, 0.03, 0.006), 'wood', [0, 0.16, 0], [0, 0, 0], leg);
  for (const a of [-1, 1]) part(B, M, bevelBox(0.03, 0.035, D - 0.18, 0.006), 'wood', [a * (L / 2 - 0.1), 0.16, 0], [0, 0, 0], leg);
  if (opts.collide !== false) collideLocal(B, M, [0, H / 2, 0], [L, H, D], 'wood');
  if (pose === 'barricade') contact(B, x, y, z, L + 0.4, 1.0, yaw, 2);
  else contact(B, x, y, z, L + 0.3, D + 0.3, yaw, 1);
  return M;
}

/**
 * Cadeira de madeira escolar/de escritório: assento com bisel e leve
 * concavidade, pernas traseiras contínuas até o encosto (curvo), duas
 * réguas no encosto, travessas entre as pernas.
 */
export function woodChair(W, x, y, z, yaw, opts = {}) {
  const { B, rng } = W;
  const base = vary(rng, opts.tint || [0.46, 0.33, 0.22], { tone: 0.12, fade: 0.25, dirt: 0.2 });
  const pose = opts.pose || 'up';
  const tilt = opts.tilt || 0;
  // de costas no chão: deitada sobre o encosto; de lado: sobre as pernas laterais
  const M = pose === 'back' ? mat4([x, y + 0.03, z], [-Math.PI / 2 + 0.25, yaw, 0]).multiply(mat4([0, -0.2, 0.22]))
    : pose === 'side' ? mat4([x, y + 0.23, z], [0, yaw, Math.PI / 2 + tilt]).multiply(mat4([0, -0.23, 0]))
      : mat4([x, y, z], [0, yaw, tilt]);
  const S = 0.44, SH = 0.46;
  part(B, M, bevelBox(S, 0.03, S, 0.01, { wear: 0.5 }), 'wood', [0, SH, 0.01], [0, 0, 0], base);
  const leg = base.map((c) => c * 0.88);
  // pernas da frente
  for (const a of [-1, 1]) part(B, M, bevelBox(0.034, SH - 0.015, 0.034, 0.006, { wear: 0.4 }), 'wood', [a * (S / 2 - 0.03), (SH - 0.015) / 2, S / 2 - 0.035], [0, 0, 0], leg);
  // pernas traseiras inclinadas que continuam no encosto
  for (const a of [-1, 1]) {
    part(B, M, bevelBox(0.036, SH, 0.036, 0.006), 'wood', [a * (S / 2 - 0.03), SH / 2, -S / 2 + 0.03], [0.06, 0, 0], leg);
    part(B, M, bevelBox(0.034, 0.46, 0.03, 0.006), 'wood', [a * (S / 2 - 0.03), SH + 0.24, -S / 2 + 0.005], [-0.12, 0, 0], leg);
  }
  // réguas do encosto (levemente curvas: 3 segmentos)
  for (const yy of [0.62, 0.84]) {
    for (let k = -1; k <= 1; k++) {
      part(B, M, bevelBox(0.15, yy > 0.7 ? 0.08 : 0.05, 0.018, 0.006), 'wood', [k * 0.135, SH + (yy - 0.46), -S / 2 + 0.0 - Math.abs(k) * 0.012 - (yy - 0.46) * 0.12], [-0.12, -k * 0.18, 0], base);
    }
  }
  // travessas
  for (const a of [-1, 1]) part(B, M, bevelBox(0.022, 0.022, S - 0.07, 0.005), 'wood', [a * (S / 2 - 0.03), 0.17, 0], [0, 0, 0], leg);
  part(B, M, bevelBox(S - 0.07, 0.022, 0.022, 0.005), 'wood', [0, 0.22, S / 2 - 0.035], [0, 0, 0], leg);
  contact(B, x, y, z, 0.7, 0.7, yaw, 1);
  return M;
}

/**
 * Mesa de escritório de aço (anos 70): tampo de laminado com borda de
 * alumínio, gaveteiro à direita (3 gavetas com puxador), painel frontal,
 * pés niveladores. Tinta cinza-esverdeada lascada.
 */
export function steelDesk(W, x, y, z, yaw, opts = {}) {
  const { B, rng } = W;
  const L = 1.5, D = 0.75, H = 0.74;
  const paint = vary(rng, opts.tint || [0.42, 0.46, 0.42], { tone: 0.08, fade: 0.3, dirt: 0.25 });
  const pose = opts.pose || 'up';
  // 'side': tombada de costas (tampo vira parede vertical)
  const M = pose === 'side' ? mat4([x, y + D / 2, z], [-Math.PI / 2, yaw, 0]).multiply(mat4([0, -H / 2, 0])) : mat4([x, y, z], [0, yaw, opts.tilt || 0]);
  // tampo: laminado bege + friso de alumínio
  part(B, M, bevelBox(L, 0.03, D, 0.008, { wear: 0.3 }), 'plastic', [0, H - 0.015, 0], [0, 0, 0], vary(rng, [0.62, 0.58, 0.5], { tone: 0.06, dirt: 0.3 }));
  part(B, M, bevelBox(L + 0.012, 0.022, D + 0.012, 0.004), 'chrome', [0, H - 0.02, 0], [0, 0, 0], [0.5, 0.5, 0.48]);
  // gaveteiro (corpo + 3 frentes rebaixadas + puxadores)
  const gx = L / 2 - 0.22;
  part(B, M, bevelBox(0.42, H - 0.06, D - 0.04, 0.01, { wear: 0.5 }), 'metal', [gx, (H - 0.06) / 2 + 0.02, 0], [0, 0, 0], paint);
  for (let k = 0; k < 3; k++) {
    const yy = 0.12 + k * 0.2;
    const open = opts.open && k === 1 ? 0.22 : 0;
    part(B, M, bevelBox(0.38, 0.18, 0.02, 0.006, { wear: 0.6 }), 'metal', [gx, yy, D / 2 - 0.01 + open], [0, 0, 0], paint.map((c) => c * 1.04));
    part(B, M, bevelBox(0.12, 0.014, 0.02, 0.005), 'chrome', [gx, yy + 0.05, D / 2 + 0.008 + open], [0, 0, 0], [0.55, 0.55, 0.52]);
    if (open) part(B, M, bevelBox(0.36, 0.14, 0.4, 0.004), 'metal', [gx, yy, D / 2 - 0.2 + open], [0, 0, 0], paint.map((c) => c * 0.7));
  }
  // lateral esquerda + painel de modéstia
  part(B, M, bevelBox(0.03, H - 0.06, D - 0.04, 0.008, { wear: 0.5 }), 'metal', [-L / 2 + 0.03, (H - 0.06) / 2 + 0.02, 0], [0, 0, 0], paint);
  part(B, M, bevelBox(L - 0.5, 0.4, 0.02, 0.006), 'metal', [-0.21, H - 0.26, -D / 2 + 0.06], [0, 0, 0], paint.map((c) => c * 0.9));
  for (const a of [-L / 2 + 0.03, gx - 0.18, gx + 0.18]) for (const b of [-D / 2 + 0.04, D / 2 - 0.04]) part(B, M, bevelCyl(0.014, 0.016, 0.03, 8), 'black', [a, 0.01, b], [0, 0, 0], [0.5, 0.5, 0.5]);
  if (opts.collide !== false) collideLocal(B, M, [0, H / 2, 0], [L, H, D], 'metal');
  contact(B, x, y, z, L + 0.3, D + 0.3, yaw, 2);
  return M;
}

/**
 * Arquivo de aço de 4 gavetas (pode estar tombado: pose 'side'), puxadores
 * e porta-etiquetas cromados, tinta gasta nas quinas, uma gaveta aberta.
 */
export function fileCabinet(W, x, y, z, yaw, opts = {}) {
  const { B, rng } = W;
  const w = 0.47, h = 1.32, d = 0.62;
  const paint = vary(rng, opts.tint || [0.36, 0.4, 0.36], { tone: 0.08, fade: 0.3, dirt: 0.25 });
  const pose = opts.pose || 'up';
  const M = pose === 'side' ? mat4([x, y + w / 2, z], [0, yaw, Math.PI / 2 - 0.03]).multiply(mat4([0, -h / 2, 0])) : mat4([x, y, z], [0, yaw, 0]);
  part(B, M, bevelBox(w, h, d, 0.012, { wear: 0.6 }), 'metal', [0, h / 2, 0], [0, 0, 0], paint);
  const openK = opts.open ?? rng.int(-1, 3);
  for (let k = 0; k < 4; k++) {
    const yy = 0.18 + k * 0.315;
    const o = openK === k ? rng.range(0.15, 0.35) : 0;
    part(B, M, bevelBox(w - 0.03, 0.29, 0.02, 0.008, { wear: 0.7 }), 'metal', [0, yy, d / 2 + 0.006 + o], [0, 0, 0], paint.map((c) => c * 1.05));
    part(B, M, bevelBox(0.13, 0.022, 0.03, 0.006), 'chrome', [0, yy + 0.04, d / 2 + 0.03 + o], [0, 0, 0], [0.55, 0.55, 0.5]);
    part(B, M, bevelBox(0.08, 0.035, 0.006, 0.002), 'chrome', [0, yy + 0.095, d / 2 + 0.018 + o], [0, 0, 0], [0.5, 0.48, 0.45]);
    if (o) {
      part(B, M, bevelBox(w - 0.05, 0.25, o + 0.05, 0.004), 'metal', [0, yy - 0.01, d / 2 - 0.02 + o / 2], [0, 0, 0], paint.map((c) => c * 0.6));
      // pastas suspensas
      for (let f = 0; f < 5; f++) part(B, M, bevelBox(w - 0.08, 0.2, 0.012, 0.002), 'fabric', [0, yy + 0.04, d / 2 - 0.02 + o - 0.04 - f * 0.05], [rng.range(-0.15, 0.15), 0, 0], vary(rng, [0.75, 0.62, 0.4], { tone: 0.1 }));
    }
  }
  if (opts.collide !== false) collideLocal(B, M, [0, h / 2, 0], [w, h, d], 'metal');
  contact(B, x, y, z, pose === 'side' ? h + 0.3 : w + 0.3, d + 0.3, yaw, 2);
  return M;
}

/** Armário de vestiário (3 portas com venezianas, uma aberta e empenada). */
export function lockers(W, x, y, z, yaw, opts = {}) {
  const { B, rng } = W;
  const n = opts.n || 3, cw = 0.38, h = 1.85, d = 0.48;
  const paint = vary(rng, opts.tint || [0.3, 0.38, 0.44], { tone: 0.08, fade: 0.35, dirt: 0.2 });
  const M = mat4([x, y, z], [0, yaw, opts.tilt || 0]);
  const w = n * cw;
  part(B, M, bevelBox(w, h, d, 0.01, { wear: 0.6 }), 'metal', [0, h / 2 + 0.08, 0], [0, 0, 0], paint);
  part(B, M, bevelBox(w - 0.02, 0.08, d - 0.04, 0.004), 'black', [0, 0.04, -0.02], [0, 0, 0], [0.5, 0.5, 0.5]);
  for (let k = 0; k < n; k++) {
    const cx = -w / 2 + cw * (k + 0.5);
    const open = opts.open === k;
    const ang = open ? rng.range(1.2, 1.9) : rng.range(0, 0.04);
    // porta gira na dobradiça esquerda
    const hinge = M.clone().multiply(mat4([cx - cw / 2 + 0.01, 0, d / 2 + 0.01], [0, -ang, 0]));
    part(B, hinge, bevelBox(cw - 0.025, h - 0.06, 0.018, 0.006, { wear: 0.7 }), 'metal', [cw / 2 - 0.01, h / 2 + 0.08, 0], [0, 0, 0], paint.map((c) => c * (0.95 + rng.next() * 0.1)));
    // venezianas (fendas escuras)
    for (let s = 0; s < 5; s++) part(B, hinge, bevelBox(cw - 0.12, 0.012, 0.006, 0.002), 'black', [cw / 2 - 0.01, h - 0.05 - s * 0.035, 0.011], [0, 0, 0], [0.4, 0.4, 0.4]);
    part(B, hinge, bevelBox(0.02, 0.12, 0.025, 0.006), 'chrome', [cw - 0.06, h / 2 + 0.1, 0.02], [0, 0, 0], [0.5, 0.5, 0.48]);
    if (open) part(B, M, bevelBox(cw - 0.04, 0.012, d - 0.05, 0.003), 'metal', [cx, h - 0.25, 0], [0, 0, 0], paint.map((c) => c * 0.55));
  }
  if (opts.collide !== false) collideLocal(B, M, [0, h / 2 + 0.05, 0], [w, h + 0.1, d], 'metal');
  contact(B, x, y, z, w + 0.3, d + 0.35, yaw, 2);
  return M;
}

/**
 * Estante de aço com prateleiras e caixas de papelão / pastas em cima.
 */
export function shelf(W, x, y, z, yaw, opts = {}) {
  const { B, rng } = W;
  const w = opts.w || 1.0, d = 0.4, h = opts.h || 1.9;
  const paint = vary(rng, opts.tint || [0.55, 0.55, 0.5], { tone: 0.06, fade: 0.2, dirt: 0.3 });
  const M = mat4([x, y, z], [0, yaw, opts.tilt || 0]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) part(B, M, bevelBox(0.035, h, 0.035, 0.004), 'metal', [a * (w / 2 - 0.018), h / 2, b * (d / 2 - 0.018)], [0, 0, 0], paint);
  const n = 5;
  for (let k = 0; k < n; k++) {
    const yy = 0.1 + k * ((h - 0.15) / (n - 1));
    part(B, M, bevelBox(w, 0.025, d, 0.004, { wear: 0.5 }), 'metal', [0, yy, 0], [0, 0, 0], paint.map((c) => c * 0.96));
    if (k === n - 1) continue;
    let u = -w / 2 + 0.04;
    while (u < w / 2 - 0.15) {
      const bw = rng.range(0.18, 0.36);
      if (u + bw > w / 2 - 0.03) break;
      if (rng.chance(0.75)) {
        const bh = rng.range(0.12, 0.28);
        const kind = rng.next();
        const col = kind < 0.6 ? vary(rng, [0.62, 0.48, 0.33], { tone: 0.12, dirt: 0.25 }) : vary(rng, rng.pick([[0.2, 0.25, 0.42], [0.45, 0.15, 0.12], [0.75, 0.7, 0.55]]), { tone: 0.1, fade: 0.4 });
        part(B, M, bevelBox(bw - 0.02, bh, d - rng.range(0.04, 0.12), 0.006, { wear: 0.3 }), kind < 0.6 ? 'wood' : 'fabric', [u + bw / 2, yy + 0.013 + bh / 2, rng.range(-0.02, 0.02)], [0, rng.range(-0.08, 0.08), rng.chance(0.15) ? rng.range(-0.2, 0.2) : 0], col);
      }
      u += bw;
    }
  }
  if (opts.collide !== false) collideLocal(B, M, [0, h / 2, 0], [w, h, d], 'metal');
  contact(B, x, y, z, w + 0.3, d + 0.3, yaw, 2);
  return M;
}
