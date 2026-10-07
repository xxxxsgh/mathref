// Fábrica de materiais PBR procedurais (render.pbr).
//
// Um único MeshPhysicalNodeMaterial cujos canais (cor, metalicidade,
// rugosidade, normal, oclusão, emissivo, clearcoat, sheen) saem de padrões
// TSL avaliados por pixel:
//   - chapas de casco com sulcos chanfrados, rebites e numeração (panels.js)
//   - sujeira acumulada em cavidades + escorridos verticais (gravidade local)
//   - desgaste: tinta lascada nas bordas das chapas e nas arestas
//     geométricas (curvatura por derivadas de tela) revelando metal nu
//   - faixas de pintura com lascas
//   - triplanar (sem UV) com normais por "gradiente de superfície" — sem
//     costuras nem inversões; ou UV com base tangente por derivadas
//   - microdetalhes por ruído (rocha, concreto, borracha, tecido, carbono)
//
// Unidades: triplanarScale = chapas por metro (no espaço local do objeto).

import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, positionLocal, normalLocal, positionView, normalView, uv, abs, pow, max, min, mix, clamp,
  smoothstep, step, dot, cross, normalize, length, sin, fract, floor, select, transformNormalToView, sign, sqrt, exp, color as tslColor,
} from 'three/tsl';
import { panelPattern } from './panels.js';
import { vnoise3, fbm3, vnoise2, hash12 } from '../tsl-lib.js';

// ─── presets de material ───────────────────────────────────────────────
export const PRESETS = {
  // casco genérico: tinta cinza-grafite semi-metálica, bem usado
  hull: { color: 0x7d838b, metalness: 0.55, roughness: 0.42, panel: 1, grime: 0.55, wear: 0.45, triplanarScale: 0.45, groove: 0.01, clearcoat: 0.15, stripe: 0 },
  // Hegemonia Solar: cerâmica branca polida + filetes dourados
  hullWhite: { color: 0xe9e6df, metalness: 0.08, roughness: 0.28, panel: 1, grime: 0.18, wear: 0.12, triplanarScale: 0.3, groove: 0.007, clearcoat: 0.7, clearcoatRoughness: 0.12, stripe: 1, stripeColor: 0xc8a050, stripeMetal: 1, panelVar: 0.04 },
  hullGold: { color: 0xd4a94f, metalness: 1, roughness: 0.22, panel: 1, grime: 0.1, wear: 0.05, triplanarScale: 0.8, rivets: false, panelVar: 0.05 },
  // Frente Livre: chapas remendadas oliva/ferrugem, muita sujeira
  hullRebel: { color: 0x5f6b4c, metalness: 0.35, roughness: 0.62, panel: 1, grime: 0.9, wear: 0.8, triplanarScale: 0.9, panelVar: 0.32, stripe: 1, stripeColor: 0xc8682a, rust: 0.7 },
  // Corsários: preto fosco com vermelho sangue
  pirate: { color: 0x26262a, metalness: 0.5, roughness: 0.5, panel: 1, grime: 0.7, wear: 0.6, triplanarScale: 0.7, stripe: 1, stripeColor: 0x8a1410, panelVar: 0.15 },
  // Guilda: azul petróleo com faixas âmbar
  guild: { color: 0x2c4a5a, metalness: 0.45, roughness: 0.35, panel: 1, grime: 0.3, wear: 0.25, triplanarScale: 0.55, stripe: 1, stripeColor: 0xe0a030, clearcoat: 0.4 },
  plastic: { color: 0xc23b2a, metalness: 0, roughness: 0.32, panel: 0, grime: 0.15, wear: 0.0, clearcoat: 0.3, micro: 0.25 },
  rubber: { color: 0x141416, metalness: 0, roughness: 0.88, panel: 0, grime: 0.2, wear: 0, micro: 1, microScale: 90, sheen: 0.15 },
  // vidro: transparente com opacidade por Fresnel (reflexos do ambiente nas bordas).
  // Sem transmission por padrão: o pré-passe de transmissão quebra os vetores de
  // velocidade do TRAA no three r185 (passe {transmission: 1} para forçar).
  glass: { color: 0xdfeaf0, metalness: 0, roughness: 0.03, panel: 0, grime: 0, wear: 0, glass: 1, ior: 1.5, specular: 1, clearcoat: 1, clearcoatRoughness: 0.02 },
  visor: { color: 0xd6a650, metalness: 1, roughness: 0.06, panel: 0, grime: 0.05, wear: 0, iridescence: 0.6, clearcoat: 1 },
  // tecido do traje: trama + costuras acolchoadas + sheen
  suit: { color: 0xc9c2b0, metalness: 0, roughness: 0.82, panel: 1, fabric: 1, grime: 0.45, wear: 0.0, triplanarScale: 3.2, rivets: false, decals: false, sheen: 1, sheenColor: 0xffffff, panelVar: 0.05, groove: 0.03 },
  carbon: { color: 0x1a1c20, metalness: 0.2, roughness: 0.35, panel: 0, carbon: 1, clearcoat: 1, clearcoatRoughness: 0.05, triplanarScale: 30 },
  gold: { color: 0xffc35a, metalness: 1, roughness: 0.18, panel: 0, micro: 0.2 },
  chrome: { color: 0xeeeeee, metalness: 1, roughness: 0.05, panel: 0, micro: 0.1 },
  steel: { color: 0x9a9da2, metalness: 1, roughness: 0.38, panel: 0, micro: 0.5, brushed: 1, triplanarScale: 1 },
  concrete: { color: 0x8c8780, metalness: 0, roughness: 0.88, panel: 1, rivets: false, decals: false, grime: 0.6, noise: 0.45, micro: 0.3, microScale: 6, triplanarScale: 0.2, groove: 0.006, panelVar: 0.12 },
  rock: { color: 0x6a5f55, metalness: 0, roughness: 0.9, panel: 0, noise: 1.6, grime: 0.3, triplanarScale: 1.2 },
  ceramic: { color: 0xf2efe8, metalness: 0, roughness: 0.18, panel: 1, rivets: false, decals: false, grime: 0.1, triplanarScale: 2.5, clearcoat: 1, groove: 0.02 },
  emissivePanel: { color: 0x3a3f46, metalness: 0.6, roughness: 0.4, panel: 1, grime: 0.4, wear: 0.3, emissive: 0x9fd8ff, emissiveIntensity: 6, emissivePattern: 'windows', triplanarScale: 0.8 },
  // bocal de motor: metal com coloração térmica (azul/violeta/palha) e brilho interno
  thruster: { color: 0x8a8580, metalness: 1, roughness: 0.32, panel: 0, heatTint: 1, emissive: 0xff7a30, emissiveIntensity: 0, micro: 0.3 },
};

const DEFAULTS = {
  color: 0x9aa0a8,
  metalness: 0.5,
  roughness: 0.45,
  panel: 1,
  grime: 0.4,
  wear: 0.3,
  emissive: 0x000000,
  emissiveIntensity: 0,
  triplanarScale: 0.6,
  mapping: 'triplanar',
  normalStrength: 1,
  panelVar: 0.1,
  rivets: true,
  decals: true,
  stripe: 0,
  stripeColor: 0xd0a040,
  stripeMetal: 0,
  seed: 0,
};

const _matCache = new Map();

// ─── helpers de normal ──────────────────────────────────────────────────

/** Bump por derivadas de tela (Mikkelsen) sobre a normal N (view). */
function bumpView(h, N, scale) {
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = cross(dpdy, N);
  const r2 = cross(N, dpdx);
  const det = dot(dpdx, r1);
  const dh = vec2(h.dFdx(), h.dFdy()).mul(scale);
  const g = sign(det).mul(r1.mul(dh.x).add(r2.mul(dh.y)));
  return normalize(abs(det).mul(N).sub(g));
}

/** Curvatura (1/raio, em 1/m) por derivadas de tela — para desgaste em arestas. */
function curvature() {
  const n = normalView;
  const dn = length(n.dFdx()).add(length(n.dFdy()));
  const dp = length(positionView.dFdx()).add(length(positionView.dFdy()));
  return dn.div(max(dp, 1e-5));
}

// ─── padrões especiais ──────────────────────────────────────────────────

/** Trama de tecido (sarja) em coordenadas 2D: devolve {h, grad}. */
function weave(p) {
  const s = 26;
  const u = p.x.mul(s);
  const v = p.y.mul(s);
  const iu = floor(u);
  const iv = floor(v);
  const over = fract(iu.add(iv).mul(0.5)).greaterThan(0.25); // alterna urdume/trama
  const fu = fract(u).sub(0.5);
  const fv = fract(v).sub(0.5);
  const h = select(over, float(1).sub(fv.mul(fv).mul(4)), float(1).sub(fu.mul(fu).mul(4))).mul(0.5);
  const grad = select(over, vec2(0, fv.mul(-4)), vec2(fu.mul(-4), 0)).mul(s * 0.5);
  return { h, grad };
}

/** Fibra de carbono (sarja 2×2) → {tone, h}. */
function carbonWeave(p) {
  const s = 1;
  const u = p.x.mul(s);
  const v = p.y.mul(s);
  const k = floor(u.add(floor(v))).mul(0.5);
  const dir = fract(k.mul(0.5)).greaterThan(0.2);
  const fu = fract(u);
  const fv = fract(v);
  const fib = select(dir, sin(fv.mul(80)).mul(0.5).add(0.5), sin(fu.mul(80)).mul(0.5).add(0.5));
  const tone = select(dir, float(0.75), float(1.15)).mul(fib.mul(0.3).add(0.85));
  const edge = min(min(fu, fu.oneMinus()), min(fv, fv.oneMinus()));
  return { tone, h: smoothstep(0, 0.08, edge) };
}

// ─── fábrica ────────────────────────────────────────────────────────────

/**
 * Cria um material PBR procedural.
 * @param {object} opts ver PRESETS/DEFAULTS
 */
export function createPBR(opts = {}, ctx = null) {
  const o = { ...DEFAULTS, ...(PRESETS[opts.preset] || {}), ...opts };
  const mat = new THREE.MeshPhysicalNodeMaterial();
  mat.name = 'pbr:' + (opts.preset || 'custom');
  // uniforms ajustáveis em runtime (mat.userData.u)
  const u = {
    color: uniform(new THREE.Color(o.color)),
    stripeColor: uniform(new THREE.Color(o.stripeColor)),
    emissive: uniform(new THREE.Color(o.emissive)),
    emissiveIntensity: uniform(o.emissiveIntensity),
    metalness: uniform(o.metalness),
    roughness: uniform(o.roughness),
    grime: uniform(o.grime),
    wear: uniform(o.wear),
    heat: uniform(o.heat ?? 0), // 0..1 brilho de bocal quente
  };
  mat.userData.u = u;
  mat.userData.opts = o;
  const seed = float(o.seed);
  const scale = o.triplanarScale;

  // ── coordenadas e base geométrica
  const P = positionLocal.mul(scale);
  const Nl = normalize(normalLocal);

  // ── padrão de chapas (triplanar ou UV)
  let pat = null; // {h, gradObj (vec3, em obj), d, id, cavity, edge, rivet, decal, lp}
  let fabricH = null;
  const popts = { groove: o.groove, rivets: o.rivets, decals: o.decals, seed, decalProb: o.decalProb };
  const needPanel = o.panel > 0;
  let triW = null;
  if (o.mapping === 'uv') {
    const st = uv().mul(scale);
    if (needPanel) {
      const pp = panelPattern(st, popts);
      pat = { ...pp, gradUV: pp.grad };
    }
  } else {
    const an = pow(abs(Nl), vec3(6));
    triW = an.div(an.x.add(an.y).add(an.z));
    if (needPanel) {
      const px = panelPattern(vec2(P.z, P.y), { ...popts, seed: seed.add(1.7) });
      const py = panelPattern(vec2(P.x, P.z), { ...popts, seed: seed.add(3.1) });
      const pz = panelPattern(vec2(P.x, P.y), { ...popts, seed: seed.add(5.3) });
      const W = (a, b, c) => a.mul(triW.x).add(b.mul(triW.y)).add(c.mul(triW.z));
      pat = {
        h: W(px.h, py.h, pz.h),
        gradObj: vec3(0, px.grad.y, px.grad.x).mul(triW.x).add(vec3(py.grad.x, 0, py.grad.y).mul(triW.y)).add(vec3(pz.grad.x, pz.grad.y, 0).mul(triW.z)),
        d: W(px.d, py.d, pz.d),
        id: px.id.mul(triW.x).add(py.id.mul(triW.y)).add(pz.id.mul(triW.z)),
        cavity: W(px.cavity, py.cavity, pz.cavity),
        edge: W(px.edge, py.edge, pz.edge),
        rivet: W(px.rivet, py.rivet, pz.rivet),
        decal: W(px.decal, py.decal, pz.decal),
        lp: px.lp.mul(triW.x).add(py.lp.mul(triW.y)).add(pz.lp.mul(triW.z)),
        size: px.size.mul(triW.x).add(py.size.mul(triW.y)).add(pz.size.mul(triW.z)),
      };
      if (o.fabric) {
        const wx = weave(vec2(P.z, P.y));
        const wy = weave(vec2(P.x, P.z));
        const wz = weave(vec2(P.x, P.y));
        fabricH = W(wx.h, wy.h, wz.h);
        pat.gradObj = pat.gradObj.mul(0.35).add(
          vec3(0, wx.grad.y, wx.grad.x).mul(triW.x).add(vec3(wy.grad.x, 0, wy.grad.y).mul(triW.y)).add(vec3(wz.grad.x, wz.grad.y, 0).mul(triW.z)).mul(0.012),
        );
      }
    }
  }

  // ── ruídos de detalhe (espaço do objeto, independente de UV)
  const big = fbm3(positionLocal.mul(0.9).add(seed), 3); // manchas grandes
  const mid = vnoise3(positionLocal.mul(6.0).add(seed.mul(2)));
  const fine = vnoise3(positionLocal.mul(o.microScale ?? 40));

  // ── máscaras
  const cav = pat ? pat.cavity : float(0);
  const panelId = pat ? pat.id : vec2(0.5);
  const panelTone = float(1).add(panelId.x.sub(0.5).mul(o.panelVar * 2));
  // escorridos: ruído esticado em Y local, mais fortes logo abaixo de sulcos
  const streak = smoothstep(0.55, 0.95, vnoise2(vec2(positionLocal.x.add(positionLocal.z).mul(9.0), positionLocal.y.mul(0.9)).add(seed)));
  const grimeMask = clamp(cav.mul(0.9).add(big.sub(0.45).mul(1.2)).add(streak.mul(0.45)).add(mid.sub(0.5).mul(0.3)), 0, 1).mul(u.grime);
  const curv = curvature();
  const edgeGeo = smoothstep(6.0, 40.0, curv);
  const wearNoise = vnoise3(positionLocal.mul(14.0).add(seed.mul(5)));
  const wearBase = (pat ? pat.edge.mul(0.32) : float(0)).add(edgeGeo.mul(0.9));
  const wearMask = smoothstep(0.62, 0.78, wearBase.mul(0.6).add(wearNoise.mul(0.55)).add(big.mul(0.15))).mul(u.wear);

  // faixas de pintura (em Y local e em X local) com lascas
  let stripeMask = float(0);
  if (o.stripe) {
    const sw = o.stripeWidth ?? 0.12;
    const at = o.stripeAt ?? 0.0;
    const axisV = o.stripeAxis === 'y' ? positionLocal.y : o.stripeAxis === 'z' ? positionLocal.z : positionLocal.x;
    const a = abs(axisV.sub(at));
    const b1 = smoothstep(sw, sw * 0.97, a);
    const b2 = smoothstep(sw * 0.22, sw * 0.2, abs(a.sub(sw * 1.6)));
    stripeMask = clamp(b1.add(b2), 0, 1).mul(float(1).sub(smoothstep(0.5, 0.8, wearNoise.add(edgeGeo.mul(0.5))).mul(0.8)));
  }

  // ── cor
  const base = u.color.mul(panelTone);
  let paint = mix(base, u.stripeColor, stripeMask);
  if (o.carbon) {
    const cw = carbonWeave(vec2(P.x.add(P.z), P.y));
    paint = paint.mul(cw.tone);
  }
  if (o.noise) {
    const n2 = fbm3(positionLocal.mul(2.5 * (o.triplanarScale || 1)), 4);
    paint = paint.mul(n2.mul(0.7).add(0.55)).mul(mid.mul(0.25).add(0.88));
  }
  if (o.fabric && fabricH) paint = paint.mul(fabricH.mul(0.25).add(0.8));
  const bare = vec3(0.58, 0.59, 0.6).mul(mid.mul(0.2).add(0.9));
  let albedo = mix(paint, bare, wearMask);
  if (o.rust) {
    const rust = smoothstep(0.5, 0.85, big.add(cav.mul(0.4)).add(mid.sub(0.5).mul(0.4))).mul(o.rust);
    albedo = mix(albedo, vec3(0.32, 0.13, 0.05).mul(mid.mul(0.6).add(0.6)), rust);
  }
  if (o.heatTint) {
    // coloração térmica: palha → bronze → violeta → azul conforme a "temperatura" ao longo do bocal
    const tt = clamp(positionLocal.y.mul(-0.9).add(0.5).add(mid.sub(0.5).mul(0.2)), 0, 1);
    const tint = mix(mix(vec3(0.85, 0.7, 0.45), vec3(0.55, 0.3, 0.45), smoothstep(0.2, 0.5, tt)), vec3(0.25, 0.35, 0.75), smoothstep(0.5, 0.9, tt));
    albedo = albedo.mul(tint.mul(1.3));
  }
  const grimeCol = vec3(0.075, 0.066, 0.055);
  albedo = mix(albedo, grimeCol, grimeMask.mul(0.82));
  if (pat) {
    // decalque: branco sobre escuro, preto sobre claro
    const lum = dot(u.color, vec3(0.3, 0.59, 0.11));
    const decalCol = select(lum.greaterThan(0.45), vec3(0.04), vec3(0.85, 0.82, 0.74));
    albedo = mix(albedo, decalCol, pat.decal.mul(float(1).sub(wearMask)).mul(0.92));
    // fundo do sulco mais escuro
    albedo = albedo.mul(mix(0.55, 1.0, pat.h.min(1)));
  }
  mat.colorNode = albedo;

  // ── metalicidade / rugosidade
  let metal = mix(u.metalness, float(1), wearMask);
  if (o.stripe) metal = mix(metal, float(o.stripeMetal), stripeMask.mul(float(1).sub(wearMask)));
  metal = metal.mul(float(1).sub(grimeMask.mul(0.6)));
  mat.metalnessNode = clamp(metal, 0, 1);
  let rough = u.roughness
    .add(panelId.y.sub(0.5).mul(0.12 * (o.panel ? 1 : 0)))
    .add(grimeMask.mul(0.38))
    .sub(wearMask.mul(0.12))
    .add(fine.sub(0.5).mul(0.08 * (o.micro ?? 0.5)));
  if (o.brushed) rough = rough.add(sin(positionLocal.x.mul(900).add(fine.mul(6))).mul(0.04));
  mat.roughnessNode = clamp(rough, 0.03, 1);

  // ── normal
  let nView = normalView;
  if (pat) {
    const k = 0.012 * o.normalStrength * (o.panelDepth ?? 1);
    if (pat.gradObj) {
      // inclinação = dh/dp · escala · (profundidade k/escala) = grad·k
      const G = pat.gradObj.mul(k);
      const sg = G.sub(Nl.mul(dot(Nl, G))); // gradiente de superfície
      const nl = normalize(Nl.sub(sg));
      nView = transformNormalToView(nl);
    } else if (pat.gradUV) {
      // base tangente por derivadas (Schüler) para mapeamento UV
      const st = uv();
      const dp1 = positionView.dFdx();
      const dp2 = positionView.dFdy();
      const du1 = st.dFdx();
      const du2 = st.dFdy();
      const N = normalView;
      const dp2p = cross(dp2, N);
      const dp1p = cross(N, dp1);
      const T = dp2p.mul(du1.x).add(dp1p.mul(du2.x));
      const B = dp2p.mul(du1.y).add(dp1p.mul(du2.y));
      const inv = float(1).div(sqrt(max(dot(T, T), dot(B, B))));
      const g = T.mul(inv).mul(pat.gradUV.x).add(B.mul(inv).mul(pat.gradUV.y)).mul(k);
      nView = normalize(N.sub(g));
    }
  }
  // microrrelevo por ruído (rocha/concreto/borracha) via derivadas de tela
  const microAmt = (o.noise ? 0.6 * o.noise : 0) + (o.micro ?? 0) * 0.08 + (o.rust ? 0.15 : 0);
  if (microAmt > 0) {
    const hN = o.noise ? fbm3(positionLocal.mul(3.0 * (o.triplanarScale || 1)), 4).add(fine.mul(0.15)) : fine;
    nView = bumpView(hN, nView, microAmt * (o.noise ? 1.4 : 0.6));
  }
  if (o.carbon) {
    const cw = carbonWeave(vec2(P.x.add(P.z), P.y));
    nView = bumpView(cw.h, nView, 0.02);
  }
  if (nView !== normalView) mat.normalNode = nView;

  // ── oclusão (cavidades e sulcos)
  if (pat) mat.aoNode = mix(0.5, 1.0, clamp(pat.h, 0, 1)).mul(float(1).sub(cav.mul(0.2)));

  // ── emissivo
  if (o.emissiveIntensity > 0 || o.emissivePattern || o.heatTint) {
    let em = u.emissive.mul(u.emissiveIntensity);
    if (o.emissivePattern === 'windows' && pat) {
      // janelas: retângulos em algumas chapas, com intensidade variando
      const lp = pat.lp;
      const win = step(0.12, lp.x).mul(step(lp.x, 0.88)).mul(step(0.3, lp.y)).mul(step(lp.y, 0.7)).mul(step(panelId.y, 0.35));
      const flick = hash12(panelId.mul(53.1)).mul(0.7).add(0.3);
      em = em.mul(win.mul(flick));
    } else if (o.emissivePattern === 'strips' && pat) {
      em = em.mul(smoothstep(pat.gw ?? 0.014, 0.0, pat.d).mul(step(panelId.x, 0.5)));
    }
    if (o.heatTint) {
      const tt = clamp(positionLocal.y.mul(-0.9).add(0.2), 0, 1);
      em = em.add(vec3(1.0, 0.35, 0.08).mul(u.heat.mul(u.heat).mul(tt).mul(8)));
    }
    mat.emissiveNode = em;
  }

  // ── propriedades físicas extras
  if (o.clearcoat) {
    mat.clearcoat = o.clearcoat;
    mat.clearcoatRoughness = o.clearcoatRoughness ?? 0.1;
    mat.clearcoatNode = float(o.clearcoat).mul(float(1).sub(grimeMask.mul(0.8)).sub(wearMask));
  }
  if (o.sheen) {
    mat.sheen = o.sheen;
    mat.sheenColor = new THREE.Color(o.sheenColor ?? 0xffffff);
    mat.sheenRoughness = 0.6;
  }
  if (o.iridescence) {
    mat.iridescence = o.iridescence;
    mat.iridescenceIOR = 1.6;
  }
  if (o.glass && !o.transmission) {
    // Fresnel de Schlick na opacidade: quase invisível de frente, espelhado de lado
    const nv = abs(dot(normalize(positionView).negate(), normalView));
    const fres = pow(float(1).sub(nv), 5.0);
    mat.transparent = true;
    mat.depthWrite = false;
    mat.opacityNode = mix(float(o.glassOpacity ?? 0.12), float(0.95), fres).add(grimeMask.mul(0.2));
    mat.side = THREE.DoubleSide;
  }
  if (o.transmission) {
    mat.transmission = o.transmission;
    mat.ior = o.ior ?? 1.5;
    mat.thickness = o.thickness ?? 0.02;
    mat.transparent = false;
    // vidro: sujeira/gotas mínimas na rugosidade
    mat.roughnessNode = clamp(u.roughness.add(fine.sub(0.5).mul(0.02)), 0.0, 1);
  }
  if (o.specular !== undefined) mat.specularIntensity = o.specular;
  if (!o.glass) mat.side = o.side ?? THREE.FrontSide;
  if (o.flatShading) mat.flatShading = true;
  return mat;
}

export { _matCache };
