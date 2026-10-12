// Materiais PBR (TSL) do sistema `foot`: armas, luvas/traje, inimigos.
//
// Tudo procedural no espaço do objeto (positionLocal × escala): tom por
// painel, micro-rugosidade, lascas/desgaste nas arestas (curvatura estimada
// pela derivada da normal), escovado direcional no metal, recartilhado nas
// empunhaduras, trama no tecido, emissivos com pulso e calor no cano.
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, uniform, positionLocal, normalLocal, normalView, mix, smoothstep, abs, max, clamp, pow, sin, fract, floor, length, fwidth, dot, normalize, time, step, uv, texture,
} from 'three/tsl';
import { vnoise, fbm, hash13, bumpNormal } from './tsl.js';

const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
const cache = new Map();

/** Curvatura aproximada (0 plano → 1 aresta arredondada). */
const curvature = () => clamp(length(fwidth(normalView)).div(length(fwidth(positionLocal)).mul(60).add(1e-4)).mul(0.02), 0, 1);

/**
 * Pintura/cerâmica sobre metal. opts: {color, metal (cor do metal sob a tinta),
 * rough, wear (0..1), scale (1/m), clearcoat, tone, seed, stripes}
 */
export function paintMat(opts = {}) {
  const { color = '#d8d4cc', metal = '#8a8d92', rough = 0.42, wear = 0.5, scale = 40, clearcoat = 0.25, tone = 0.06, seed = 1, lite = false, grime = 0.35 } = opts;
  const key = 'paint|' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = lite ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshPhysicalNodeMaterial();
  const U = { color: uniform(col(color)), metal: uniform(col(metal)), wear: uniform(wear), heat: uniform(0), grime: uniform(grime) };
  const P = positionLocal.mul(scale);
  const n1 = fbm(P.mul(0.6).add(seed * 7.1));
  const n2 = vnoise(P.mul(7.0).add(seed));
  const n3 = vnoise(P.mul(23.0));
  const curv = curvature();
  // lascas: aresta + ruído; manchas finas em superfícies planas
  const chip = smoothstep(0.62, 0.7, curv.mul(0.9).add(n1.mul(0.55)).add(n2.mul(0.2)).mul(U.wear.mul(0.9).add(0.3)));
  const scratch = smoothstep(0.86, 0.95, vnoise(P.mul(vec3(40, 1.2, 40)).add(seed * 3.3))).mul(U.wear).mul(0.6);
  const bare = max(chip, scratch);
  const grm = smoothstep(0.35, 0.9, n1).mul(U.grime).mul(float(1).sub(curv));
  const base = U.color.mul(float(1).add(n1.sub(0.5).mul(tone * 2))).mul(float(1).sub(grm.mul(0.35)));
  m.colorNode = mix(base, U.metal, bare);
  m.metalnessNode = mix(float(0.05), float(0.95), bare);
  m.roughnessNode = clamp(mix(float(rough).add(n3.sub(0.5).mul(0.12)).add(grm.mul(0.25)), float(0.28), bare), 0.08, 1);
  if (!lite) {
    m.clearcoatNode = float(clearcoat).mul(float(1).sub(bare)).mul(float(1).sub(grm));
    m.clearcoatRoughnessNode = float(0.25);
    m.normalNode = bumpNormal(n3.mul(0.00012).add(bare.mul(-0.00025)), 1);
  }
  m.emissiveNode = vec3(1.0, 0.32, 0.08).mul(U.heat.mul(U.heat).mul(4));
  m.userData.U = U;
  cache.set(key, m);
  return m;
}

/** Metal (aço escovado, alumínio anodizado, cobre). opts: {color, rough, aniso (escovado), scale} */
export function metalMat(opts = {}) {
  const { color = '#5c6066', rough = 0.32, scale = 60, brushed = 1, lite = false, heatGlow = false } = opts;
  const key = 'metal|' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardNodeMaterial();
  const U = { color: uniform(col(color)), heat: uniform(0) };
  const P = positionLocal.mul(scale);
  const brush = vnoise(P.mul(vec3(1.5, 1.5, 90))).mul(brushed);
  const n = fbm(P.mul(0.8));
  const curv = curvature();
  m.colorNode = U.color.mul(float(0.85).add(n.mul(0.25)).add(curv.mul(0.35)));
  m.metalnessNode = float(1);
  m.roughnessNode = clamp(float(rough).add(brush.sub(0.5).mul(0.16)).add(n.sub(0.5).mul(0.1)).sub(curv.mul(0.12)), 0.06, 1);
  if (!lite) m.normalNode = bumpNormal(brush.mul(0.00004), 1);
  if (heatGlow) {
    // calor do cano: corpo negro (vermelho → laranja → amarelo)
    const h = U.heat;
    m.emissiveNode = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.55, 0.15), h).mul(h.mul(h).mul(9)).mul(n.mul(0.5).add(0.75));
  }
  m.userData.U = U;
  cache.set(key, m);
  return m;
}

/** Polímero/borracha com recartilhado (empunhadura). */
export function polymerMat(opts = {}) {
  const { color = '#23262b', rough = 0.72, knurl = 0, scale = 300, lite = false } = opts;
  const key = 'poly|' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionLocal.mul(scale);
  const n = vnoise(P.mul(0.08));
  const fine = vnoise(P.mul(1.6));
  const k = knurl ? abs(sin(P.x.add(P.y).mul(1.0))).mul(abs(sin(P.x.sub(P.y).mul(1.0)))) : float(0);
  m.colorNode = vec3(...col(color).toArray()).mul(float(0.9).add(n.mul(0.2)));
  m.metalnessNode = float(0);
  m.roughnessNode = clamp(float(rough).add(fine.sub(0.5).mul(0.15)).add(k.mul(0.1)), 0.2, 1);
  if (!lite) m.normalNode = bumpNormal(fine.mul(0.00003).add(k.mul(0.00012)), 1);
  cache.set(key, m);
  return m;
}

/** Tecido técnico do traje (trama + brilho de fibra). */
export function fabricMat(opts = {}) {
  const { color = '#3a3f46', scale = 700, lite = false, stitch = '#c8a050' } = opts;
  const key = 'fab|' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = lite ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshPhysicalNodeMaterial();
  const P = positionLocal.mul(scale);
  const weave = abs(sin(P.x.mul(1.0).add(sin(P.y.mul(1.0)).mul(0.6)))).mul(abs(sin(P.z.mul(1.0).add(sin(P.y.mul(1.0)).mul(0.6)))));
  const big = fbm(positionLocal.mul(scale * 0.01));
  const seam = smoothstep(0.92, 0.97, abs(sin(positionLocal.y.mul(scale * 0.06))));
  m.colorNode = mix(vec3(...col(color).toArray()).mul(float(0.8).add(weave.mul(0.25)).add(big.mul(0.15))), vec3(...col(stitch).toArray()), seam.mul(0.6));
  m.metalnessNode = float(0);
  m.roughnessNode = float(0.86).sub(weave.mul(0.12));
  if (!lite) {
    m.sheen = 0.6; m.sheenRoughness = 0.5; m.sheenColor = new THREE.Color(0.6, 0.65, 0.7);
    m.normalNode = bumpNormal(weave.mul(0.00008).sub(seam.mul(0.0003)), 1);
  }
  cache.set(key, m);
  return m;
}

/** Emissivo HDR com pulso (células de energia, faixas, visores). */
export function glowMat(color = '#5fd8ff', intensity = 6, { pulse = 0, flicker = 0, base = 0.02 } = {}) {
  const key = `glow|${color}|${intensity}|${pulse}|${flicker}|${base}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardNodeMaterial();
  const U = { color: uniform(col(color)), power: uniform(intensity), level: uniform(1) };
  const pl = pulse ? sin(time.mul(pulse)).mul(0.25).add(0.75) : float(1);
  const fl = flicker ? float(1).sub(step(0.97, vnoise(vec3(time.mul(flicker * 10), 0, 0))).mul(0.6)) : float(1);
  m.colorNode = U.color.mul(base);
  m.roughnessNode = float(0.3);
  m.metalnessNode = float(0);
  m.emissiveNode = U.color.mul(U.power).mul(pl).mul(fl).mul(U.level);
  m.userData.U = U;
  cache.set(key, m);
  return m;
}

/** Vidro de lente/visor: escuro, com película iridescente. */
export function lensMat(opts = {}) {
  const { tint = '#0b1722', coat = '#3a7cff', lite = false, clear = false } = opts;
  const key = 'lens|' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = lite ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshPhysicalNodeMaterial();
  if (clear) { m.transparent = true; m.opacity = 0.18; m.depthWrite = false; }
  const fres = pow(float(1).sub(abs(dot(normalize(normalView), vec3(0, 0, 1)))), 3);
  m.colorNode = vec3(...col(tint).toArray());
  m.metalnessNode = float(0.2);
  m.roughnessNode = float(0.04);
  m.emissiveNode = vec3(...col(coat).toArray()).mul(fres.mul(0.6));
  if (!lite) { m.clearcoat = 1; m.clearcoatRoughness = 0.02; m.iridescence = 0.8; m.iridescenceIOR = 1.6; }
  cache.set(key, m);
  return m;
}

/** Tela (CanvasTexture) com brilho próprio. */
export function screenMat(tex, intensity = 2.2) {
  const m = new THREE.MeshStandardNodeMaterial();
  const t = texture(tex, uv());
  const scan = sin(uv().y.mul(420)).mul(0.06).add(0.94);
  m.colorNode = vec3(0.01);
  m.roughnessNode = float(0.18);
  m.metalnessNode = float(0);
  m.emissiveNode = t.rgb.mul(intensity).mul(scan);
  m.userData.U = { intensity };
  return m;
}

/** Material de casco de inimigo (armadura de soldado/sentinela) — usa paintMat. */
export function armorMat(faction, part = 'plate', lite = false) {
  const F = FACTION_LOOK[faction] || FACTION_LOOK.hegemonia;
  const c = part === 'plate' ? F.plate : part === 'trim' ? F.trim : part === 'under' ? F.under : F.plate;
  if (part === 'under') return fabricMat({ color: c, scale: 260, lite, stitch: F.trim });
  return paintMat({ color: c, metal: F.metal, rough: part === 'trim' ? 0.3 : F.rough, wear: F.wear, scale: 12, clearcoat: F.coat, seed: part === 'trim' ? 3 : 1, lite, grime: F.grime, tone: F.tone });
}

export const FACTION_LOOK = {
  hegemonia: { plate: '#e9e5dc', trim: '#c9a24a', under: '#2a2e35', metal: '#8f8a80', rough: 0.36, wear: 0.18, coat: 0.6, grime: 0.12, tone: 0.03, glow: '#ffcf6a', visor: '#ffb648' },
  corsarios: { plate: '#3b3530', trim: '#7b2a1e', under: '#1e1b1a', metal: '#6b6157', rough: 0.62, wear: 0.85, coat: 0.05, grime: 0.7, tone: 0.18, glow: '#ff3b2a', visor: '#ff4030' },
  frente: { plate: '#6d6a52', trim: '#d0662e', under: '#2c2b25', metal: '#77736a', rough: 0.55, wear: 0.6, coat: 0.1, grime: 0.45, tone: 0.12, glow: '#ff9a4a', visor: '#ff9a4a' },
  vigilantes: { plate: '#14161c', trim: '#2a3446', under: '#0b0c10', metal: '#3a4558', rough: 0.22, wear: 0.05, coat: 0.9, grime: 0.0, tone: 0.02, glow: '#7fd0ff', visor: '#8fdcff' },
  guilda: { plate: '#2f5a55', trim: '#e0b040', under: '#202426', metal: '#7b8a88', rough: 0.4, wear: 0.3, coat: 0.3, grime: 0.2, tone: 0.05, glow: '#5fd0b8', visor: '#5fd0b8' },
};

export function disposeMaterials() { for (const m of cache.values()) m.dispose?.(); cache.clear(); }
export { fract, floor, hash13 };
