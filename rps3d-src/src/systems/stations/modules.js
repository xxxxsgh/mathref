// Módulos reutilizáveis das estruturas espaciais: tanques, antenas, pratos,
// radiadores, asas solares, bocais, faixas de "greeble", molduras de doca,
// faróis. Tudo escreve num Kit (geo.js) na camada indicada.
import * as THREE from 'three/webgpu';
import { V3, mat } from './geo.js';
import { ZONE as Z } from './materials.js';

const TAU = Math.PI * 2;

/** Detalhes de casco (caixas, dutos, escotilhas) espalhados num retângulo da face. */
export function greebleRect(k, layer, origin, uDir, vDir, nDir, w, h, density = 0.08, scale = 1) {
  const r = k.r;
  const n = Math.round(w * h * density / (scale * scale));
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(uDir, nDir, vDir.clone().negate()));
  for (let i = 0; i < n; i++) {
    const u = (r() - 0.5) * w, v = (r() - 0.5) * h;
    const p = origin.clone().addScaledVector(uDir, u).addScaledVector(vDir, v);
    const t = r();
    const sx = (0.8 + r() * 3.5) * scale, sz = (0.8 + r() * 2.5) * scale, sy = (0.3 + r() * 1.4) * scale;
    const zone = t < 0.45 ? Z.DARK : t < 0.8 ? Z.METAL : t < 0.93 ? Z.PAINT : Z.ACCENT;
    if (t < 0.85) k.add(layer, new THREE.BoxGeometry(sx, sy, sz), mat(p.clone().addScaledVector(nDir, sy / 2), q), zone);
    else { // duto/cilindro deitado
      const g = new THREE.CylinderGeometry(sy * 0.5, sy * 0.5, sx * 2, 10);
      g.rotateZ(Math.PI / 2);
      k.add(layer, g, mat(p.clone().addScaledVector(nDir, sy * 0.5), q), Z.METAL);
    }
  }
}

/** Aglomerado de tanques esféricos/cilíndricos em volta do eixo Y. */
export function tankRing(k, layer, y, rCenter, n, rTank, spherical = true) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2;
    const p = V3(Math.sin(a) * rCenter, y, Math.cos(a) * rCenter);
    if (spherical) {
      k.sphere(layer, rTank, p, Z.PAINT, 24, 16);
      k.torus(layer, rTank * 1.01, rTank * 0.05, p, Z.DARK, 32, 6);
    } else {
      k.cyl(layer, rTank, rTank, rTank * 3.2, p, null, Z.PAINT, 20);
      k.sphere(layer, rTank, p.clone().add(V3(0, rTank * 1.6, 0)), Z.PAINT, 20, 10);
      k.sphere(layer, rTank, p.clone().add(V3(0, -rTank * 1.6, 0)), Z.PAINT, 20, 10);
      for (let j = -1; j <= 1; j++) k.torus(layer, rTank * 1.02, rTank * 0.06, p.clone().add(V3(0, j * rTank, 0)), Z.ACCENT, 32, 6);
    }
    // suportes até o eixo
    k.beam(layer, p, V3(0, y, 0).add(p.clone().setY(0).normalize().multiplyScalar(rCenter * 0.35)), rTank * 0.18, Z.DARK);
  }
}

/** Prato de antena parabólico apontando para `dir`. */
export function dish(k, layer, pos, dir, R, lights = true) {
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  k.push(mat(pos, q));
  const prof = [];
  for (let i = 0; i <= 10; i++) { const r = (i / 10) * R; prof.push([r, (r * r) / (4 * R * 0.45)]); }
  // casca externa e interna
  k.lathe(layer, prof, V3(0, 0, 0), Z.PAINT, 40);
  k.lathe(layer, prof.map(([r, y]) => [r, y + 0.02 * R]).reverse(), V3(0, 0, 0), Z.METAL, 40);
  k.torus(layer, R, R * 0.025, V3(0, prof[10][1], 0), Z.DARK, 48, 6);
  // alimentador + tripé
  const focus = V3(0, R * 0.55, 0);
  k.cyl(layer, R * 0.05, R * 0.07, R * 0.16, focus, null, Z.DARK, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    k.beam(layer, V3(Math.sin(a) * R * 0.8, prof[8][1], Math.cos(a) * R * 0.8), focus, R * 0.02, Z.DARK);
  }
  k.cyl(layer, R * 0.12, R * 0.18, R * 0.4, V3(0, -R * 0.2, 0), null, Z.DARK, 16);
  if (lights) k.light(focus.clone().add(V3(0, R * 0.1, 0)), [6, 0.4, 0.2], R * 0.035, -0.5);
  k.pop();
}

/** Mastro de antena com farol vermelho no topo. */
export function mast(k, layer, base, dir, len, w = 1) {
  const top = base.clone().addScaledVector(dir, len);
  k.truss(layer, base, top, w * 2.2, w * 0.25, w * 3, Z.DARK);
  k.pipe(layer, base, top.clone().addScaledVector(dir, len * 0.15), w * 0.2, Z.METAL);
  k.light(top.clone().addScaledVector(dir, len * 0.15 + 0.6), [12, 0.6, 0.3], w * 0.8, 0.8);
  // antenas secundárias
  for (let i = 1; i <= 3; i++) {
    const p = base.clone().addScaledVector(dir, len * (0.3 + i * 0.18));
    const side = V3(1, 0, 0).cross(dir).lengthSq() > 0.1 ? V3(1, 0, 0).cross(dir).normalize() : V3(0, 0, 1);
    k.pipe(layer, p.clone().addScaledVector(side, -w * 4), p.clone().addScaledVector(side, w * 4), w * 0.08, Z.METAL, 6);
  }
}

/** Painel radiador plano (aletas) preso por uma treliça ao ponto base. */
export function radiator(k, layer, base, outDir, along, len, wid) {
  const tip = base.clone().addScaledVector(outDir, len);
  const c = base.clone().add(tip).multiplyScalar(0.5);
  const n = V3().crossVectors(outDir, along).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(outDir, along, n));
  k.add(layer, new THREE.BoxGeometry(len, wid, 0.6), mat(c, q), Z.RADIATOR);
  // quadro
  k.beam(layer, base.clone().addScaledVector(along, wid / 2), tip.clone().addScaledVector(along, wid / 2), 1.0, Z.DARK);
  k.beam(layer, base.clone().addScaledVector(along, -wid / 2), tip.clone().addScaledVector(along, -wid / 2), 1.0, Z.DARK);
  k.beam(layer, tip.clone().addScaledVector(along, -wid / 2), tip.clone().addScaledVector(along, wid / 2), 1.0, Z.DARK);
  for (let i = 1; i < 5; i++) {
    const p = base.clone().addScaledVector(outDir, len * i / 5);
    k.beam(layer, p.clone().addScaledVector(along, -wid / 2), p.clone().addScaledVector(along, wid / 2), 0.5, Z.DARK);
  }
  k.pipe(layer, base, tip, 0.9, Z.METAL, 8);
}

/** Asa solar: treliça central e painéis dos dois lados. */
export function solarWing(k, layer, base, outDir, normal, len, wid, segs = 6) {
  const tip = base.clone().addScaledVector(outDir, len);
  const side = V3().crossVectors(normal, outDir).normalize();
  k.truss(layer, base, tip, 4, 0.5, 8, Z.DARK);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(outDir, normal, side.clone().negate()));
  const sl = (len - 10) / segs;
  for (let i = 0; i < segs; i++) {
    const c = base.clone().addScaledVector(outDir, 10 + sl * (i + 0.5));
    for (const s of [-1, 1]) {
      const p = c.clone().addScaledVector(side, s * (wid / 2 + 3));
      k.add(layer, new THREE.BoxGeometry(sl - 1.2, 0.35, wid), mat(p, q), Z.SOLAR);
      k.add(layer, new THREE.BoxGeometry(sl - 0.6, 0.5, 0.6), mat(p.clone().addScaledVector(side, wid / 2), q), Z.DARK);
      k.add(layer, new THREE.BoxGeometry(sl - 0.6, 0.5, 0.6), mat(p.clone().addScaledVector(side, -wid / 2), q), Z.DARK);
    }
  }
  k.light(tip.clone().addScaledVector(outDir, 2), [10, 10, 10], 0.9, 1.1);
}

/** Bocal de motor (lathe) com núcleo luminoso. */
export function nozzle(k, layer, pos, dir, r, glowLayer = null) {
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), dir.clone().normalize());
  k.push(mat(pos, q));
  k.lathe(layer, [[r * 0.55, 0], [r * 0.6, -r * 0.4], [r * 0.8, -r * 1.1], [r, -r * 1.8], [r * 0.95, -r * 1.85], [r * 0.5, -r * 0.5], [r * 0.45, 0]], V3(), Z.METAL, 32);
  k.cyl(layer, r * 0.7, r * 0.6, r * 0.6, V3(0, r * 0.3, 0), null, Z.DARK, 24);
  if (glowLayer) k.cyl(glowLayer, r * 0.42, r * 0.42, 0.2, V3(0, -r * 0.35, 0), null, Z.GLOW, 24);
  k.pop();
}

/** Anel de luzes ao redor do eixo Y (faixa de posição). */
export function lightRing(k, y, R, n, color, size, blink = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    k.light(V3(Math.sin(a) * R, y, Math.cos(a) * R), color, size, blink, blink ? (i % 2) * 0.5 : null);
  }
}

/**
 * Moldura de boca de doca (retângulo w×h no plano normal a `out`), com
 * listras de perigo, faixa luminosa e luzes de aproximação. Centro = base
 * do retângulo (no piso).
 */
export function dockMouth(k, layer, glowLayer, center, out, up, w, h, depth = 6, color = [0.6, 2.2, 1.8]) {
  const side = V3().crossVectors(up, out).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, out));
  k.push(mat(center, q));
  const t = 3.2;
  k.box(layer, w + t * 2, t, depth, V3(0, -t / 2, 0), null, Z.DARK);
  k.box(layer, w + t * 2, t, depth, V3(0, h + t / 2, 0), null, Z.DARK);
  k.box(layer, t, h, depth, V3(-w / 2 - t / 2, h / 2, 0), null, Z.DARK);
  k.box(layer, t, h, depth, V3(w / 2 + t / 2, h / 2, 0), null, Z.DARK);
  // faixas de perigo na borda externa
  k.box(layer, w + t * 2 + 0.2, 1.2, 0.4, V3(0, -t + 0.6, depth / 2 + 0.1), null, Z.HAZARD);
  k.box(layer, w + t * 2 + 0.2, 1.2, 0.4, V3(0, h + t - 0.6, depth / 2 + 0.1), null, Z.HAZARD);
  // faixa luminosa contínua por dentro da moldura
  if (glowLayer) {
    k.box(glowLayer, w, 0.35, 0.35, V3(0, 0.2, depth / 2 - 0.4), null, Z.GLOW);
    k.box(glowLayer, w, 0.35, 0.35, V3(0, h - 0.2, depth / 2 - 0.4), null, Z.GLOW);
    k.box(glowLayer, 0.35, h, 0.35, V3(-w / 2 + 0.2, h / 2, depth / 2 - 0.4), null, Z.GLOW);
    k.box(glowLayer, 0.35, h, 0.35, V3(w / 2 - 0.2, h / 2, depth / 2 - 0.4), null, Z.GLOW);
  }
  // luzes de aproximação (sequenciais) nos cantos
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    k.light(V3(x, -t, depth / 2 + 0.5), [color[0] * 4, color[1] * 4, color[2] * 4], 0.45, -0.7, i / n);
    k.light(V3(x, h + t, depth / 2 + 0.5), [color[0] * 4, color[1] * 4, color[2] * 4], 0.45, -0.7, i / n);
  }
  k.light(V3(-w / 2 - t, -t, depth / 2 + 0.5), [12, 0.5, 0.3], 0.8, 0.9);
  k.light(V3(w / 2 + t, -t, depth / 2 + 0.5), [0.3, 12, 1.0], 0.8, 0.9);
  k.pop();
}

/** Escotilhas/janelas redondas (luzes quentes pequenas) numa faixa circular. */
export function portholes(k, y, R, n, color = [3, 2.1, 1.2], size = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.05;
    k.light(V3(Math.sin(a) * R, y, Math.cos(a) * R), color, size, 0);
  }
}
