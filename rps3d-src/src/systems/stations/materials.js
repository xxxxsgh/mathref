// Materiais TSL das estruturas (estações, plataformas, postos, ruínas).
//
//  • casco externo: UM programa por estilo de facção; a zona do vértice
//    (aInfo.x) escolhe o acabamento — pintura com painéis rebitados, tom por
//    chapa, sujeira e escorridos, faixas de destaque, metal escuro de
//    treliça, metal nu, janelas acesas (grade por UV em metros, cada janela
//    com sua cor e algumas apagadas), painéis solares com células, radiadores
//    com aletas, faixas luminosas, listras de perigo e vidro.
//  • interior: mesmas ideias em escala humana + LUZ ASSADA POR VÉRTICE
//    (aBake = irradiância somada de todas as luminárias da sala) e um pequeno
//    conjunto de PointLights próprias (lightsNode isolado: o sol e o céu não
//    entram) para o brilho especular perto do jogador.
//  • luzes de navegação (octaedros que nunca ficam menores que ~2 px e
//    piscam), holograma, campo de contenção do hangar, cone de luz
//    volumétrica falso, letreiros em néon.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, attribute, positionLocal, normalLocal, mix, smoothstep, step, abs, max, min,
  floor, fract, pow, sin, clamp, time, select, length, dot, normalize, normalView, positionView, uv, modelWorldMatrix,
  texture, exp, lights as tslLights,
} from 'three/tsl';
import { hash13, vnoise, fbm, panelGrid, aaLine, bumpNormal } from './tsl.js';

/** Zonas de acabamento (aInfo.x). */
export const ZONE = {
  PAINT: 0, ACCENT: 1, DARK: 2, METAL: 3, WINDOW: 4, SOLAR: 5, RADIATOR: 6, GLOW: 7, HAZARD: 8, GLASS: 9,
  // interiores
  FLOOR: 10, GRATE: 11, GLOW_WARM: 25, GLOW_PINK: 26, CARPET: 27, WALL: 12, TRIM: 13, LACQUER: 14, FABRIC: 15, SCREEN: 16, WOOD: 17, RUBBER: 18, BRASS: 19,
  // estruturas de superfície / ruínas
  CONCRETE: 20, ALIEN: 21, ALIEN_GLOW: 22, ROCK: 23, RUST: 24,
};

/** Paletas por facção/estilo (linear). */
export const STYLES = {
  guilda: { primary: [0.62, 0.6, 0.56], accent: [0.05, 0.42, 0.38], dark: [0.035, 0.038, 0.042], metal: [0.5, 0.51, 0.53], glow: [0.5, 1.6, 1.35], window: [1.0, 0.72, 0.42], wear: 0.35, grime: 0.4 },
  hegemonia: { primary: [0.78, 0.78, 0.76], accent: [0.62, 0.42, 0.12], dark: [0.04, 0.04, 0.045], metal: [0.62, 0.6, 0.55], glow: [1.6, 1.25, 0.6], window: [0.9, 0.85, 0.75], wear: 0.12, grime: 0.15 },
  frente: { primary: [0.24, 0.23, 0.21], accent: [0.6, 0.22, 0.06], dark: [0.03, 0.03, 0.03], metal: [0.38, 0.36, 0.33], glow: [1.6, 0.7, 0.3], window: [1.0, 0.62, 0.32], wear: 0.8, grime: 0.8 },
  corsarios: { primary: [0.1, 0.09, 0.1], accent: [0.35, 0.08, 0.42], dark: [0.02, 0.02, 0.025], metal: [0.3, 0.29, 0.3], glow: [1.4, 0.4, 1.6], window: [1.0, 0.45, 0.8], wear: 0.7, grime: 0.7 },
  industrial: { primary: [0.46, 0.42, 0.36], accent: [0.72, 0.42, 0.05], dark: [0.035, 0.035, 0.035], metal: [0.45, 0.44, 0.42], glow: [1.6, 1.0, 0.4], window: [1.0, 0.7, 0.4], wear: 0.6, grime: 0.6 },
};

const C = (a) => new THREE.Color(a[0], a[1], a[2]);

/** Seleciona `val` quando zone == k (soma de máscaras é mais barata que ifs aninhados). */
const isZ = (zone, k) => float(1).sub(step(0.5, abs(zone.sub(k))));

/**
 * Casco externo das estruturas. opts.lite = preset mobile (sem bump).
 * opts.scale = tamanho do painel (m). Retorna o material com userData.U.
 */
export function makeHullMaterial(styleName = 'guilda', { lite = false, scale = 3.2 } = {}) {
  const style = STYLES[styleName] || STYLES.guilda;
  const m = new THREE.MeshStandardNodeMaterial();
  const U = {
    primary: uniform(C(style.primary)), accent: uniform(C(style.accent)), dark: uniform(C(style.dark)),
    metal: uniform(C(style.metal)), glow: uniform(C(style.glow)), window: uniform(C(style.window)),
    wear: uniform(style.wear), grime: uniform(style.grime), panel: uniform(scale),
    lit: uniform(1), // fração das janelas acesas (noite/apagão)
    alienGlow: uniform(1), // brilho das inscrições dos Arquitetos (quebra-cabeça resolvido = mais forte)
  };
  m.userData.U = U;
  const info = attribute('aInfo', 'vec3');
  const zone = info.x, seed = info.y;
  const UV = uv();
  const P = positionLocal;
  const n = normalize(normalLocal);

  // painéis (UV em metros)
  const pg = panelGrid(UV.x.div(U.panel), UV.y.div(U.panel.mul(0.5)), seed.mul(17.0), float(1.6));
  const seam = aaLine(pg.x, float(0.012));
  const pid = pg.y;
  const macro = panelGrid(UV.x.div(U.panel.mul(6.0)), UV.y.div(U.panel.mul(3.0)), seed.mul(5.0), float(1.4));
  const macroLine = aaLine(macro.x, float(0.004));
  const g1 = fbm(P.mul(0.06).add(seed.mul(31.0)));
  const g2 = vnoise(P.mul(vec3(0.6, 0.05, 0.6)).add(seed.mul(7.0))); // escorridos verticais
  const nearSeam = float(1).sub(smoothstep(0.0, 0.08, pg.x));

  const zP = isZ(zone, 0), zA = isZ(zone, 1), zD = isZ(zone, 2), zM = isZ(zone, 3), zW = isZ(zone, 4);
  const zS = isZ(zone, 5), zR = isZ(zone, 6), zG = isZ(zone, 7), zH = isZ(zone, 8), zGl = isZ(zone, 9);
  const zRk = isZ(zone, 23), zRu = isZ(zone, 24);
  const zCo = isZ(zone, 20), zAl = isZ(zone, 21), zAg = isZ(zone, 22);

  // ── concreto (bunkers): placas moldadas, manchas de água, poeira
  const co1 = fbm(P.mul(0.4).add(seed.mul(9.0)));
  const coForm = aaLine(panelGrid(UV.x.div(6.0), UV.y.div(3.0), seed, float(2.0)).x, float(0.006));
  const concCol = mix(vec3(0.24, 0.23, 0.21), vec3(0.36, 0.34, 0.31), co1).mul(float(1).sub(coForm.mul(0.2)));
  // ── pedra dos Arquitetos: basalto escuro polido com veios e inscrições luminosas
  const al1 = fbm(P.mul(0.18).add(seed.mul(4.0)));
  const al2 = vnoise(P.mul(vec3(0.08, 1.6, 0.08)).add(seed));
  const alienCol = mix(vec3(0.018, 0.02, 0.026), vec3(0.06, 0.065, 0.075), al1).add(vec3(0.02, 0.03, 0.05).mul(al2));
  const gu = UV.x.div(1.1), gv = UV.y.div(1.4);
  const gcell = vec2(floor(gu), floor(gv));
  const gf = vec2(fract(gu), fract(gv));
  const gh = hash13(vec3(gcell, seed.mul(3.0)));
  // glifo: barras horizontais/verticais e um anel, escolhidos por hash
  const barH = step(abs(gf.y.sub(0.5)), 0.045).mul(step(0.2, gf.x)).mul(step(gf.x, 0.8)).mul(step(0.5, gh));
  const barV = step(abs(gf.x.sub(gh.mul(0.6).add(0.2))), 0.045).mul(step(0.15, gf.y)).mul(step(gf.y, 0.85)).mul(step(0.3, fract(gh.mul(7.0))));
  const ringG = step(abs(length(gf.sub(0.5)).sub(0.28)), 0.035).mul(step(0.78, fract(gh.mul(13.0))));
  // inscrições só em faixas (a cada 7 m) e em canais verticais raros — superfície lisa no resto
  const inBand = step(abs(fract(UV.y.div(7.0)).sub(0.5)), 0.1);
  const chan = step(abs(fract(UV.x.div(9.0)).sub(0.5)), 0.012).mul(step(0.6, hash13(vec3(floor(UV.x.div(9.0)), seed, 5.0))));
  const glyph = clamp(barH.add(barV).add(ringG), 0, 1).mul(step(0.45, fract(gh.mul(31.0)))).mul(inBand).add(chan).min(1);
  const pulse = sin(time.mul(0.8).add(gh.mul(6.283)).add(UV.y.mul(0.15))).mul(0.5).add(0.5);

  // ── rocha (asteroides escavados) e ferrugem
  const rk1 = fbm(P.mul(0.035).add(seed.mul(3.0)));
  const rk2 = fbm(P.mul(0.31).add(11.0));
  const rockCol = mix(vec3(0.09, 0.085, 0.08), vec3(0.2, 0.18, 0.16), rk1).mul(rk2.mul(0.5).add(0.7));
  const rustCol = mix(vec3(0.16, 0.07, 0.03), vec3(0.3, 0.15, 0.07), rk2).mul(pid.mul(0.3).add(0.8));

  // ── pintura
  const tone = pid.sub(0.5).mul(0.12).add(macro.y.sub(0.5).mul(0.16));
  let paint = mix(U.primary, U.accent, zA).mul(tone.add(1.0));
  const grime = smoothstep(0.35, 0.85, g1.mul(0.6).add(g2.mul(0.5)).mul(U.grime.add(0.4)));
  paint = mix(paint, paint.mul(vec3(0.55, 0.52, 0.48)), grime.mul(0.55));
  const chip = step(0.78, vnoise(P.mul(2.2).add(seed))).mul(nearSeam).mul(U.wear);
  paint = mix(paint, U.metal.mul(0.7), chip);
  // ── listras de perigo
  const stripe = step(0.5, fract(UV.x.add(UV.y).mul(0.9)));
  const haz = mix(vec3(0.02, 0.02, 0.02), vec3(0.62, 0.42, 0.04), stripe);
  // ── janelas: células 2,4 × 1,6 m num passo 3,2 × 3,0 m
  const wu = UV.x.div(3.2), wv = UV.y.div(3.0);
  const cell = vec2(floor(wu), floor(wv));
  const fu = fract(wu), fv = fract(wv);
  const inWin = step(0.12, fu).mul(step(fu, 0.88)).mul(step(0.22, fv)).mul(step(fv, 0.78));
  const wh = hash13(vec3(cell, seed.mul(13.0)));
  const on = step(wh, U.lit.mul(0.72));
  const wcol = mix(U.window, vec3(0.55, 0.75, 1.0), step(0.82, hash13(vec3(cell.yx, 3.3)))).mul(hash13(vec3(cell, 9.1)).mul(0.7).add(0.5));
  const sill = smoothstep(0.22, 0.4, fv).mul(0.6).add(0.4); // luz mais forte no peitoril (gente, móveis)
  // ── painel solar: células de 1 m com grade prateada
  const su = fract(UV.x.div(1.05)), sv = fract(UV.y.div(1.05));
  const sgrid = max(aaLine(min(su, su.oneMinus()), float(0.03)), aaLine(min(sv, sv.oneMinus()), float(0.03)));
  const scell = hash13(vec3(floor(UV.x.div(1.05)), floor(UV.y.div(1.05)), seed));
  const solar = mix(vec3(0.012, 0.03, 0.09).mul(scell.mul(0.5).add(0.75)), vec3(0.35, 0.37, 0.4), sgrid);
  // ── radiador: aletas
  const fin = abs(fract(UV.x.div(0.6)).sub(0.5)).mul(2.0);
  const rad = mix(vec3(0.42, 0.42, 0.4), vec3(0.18, 0.18, 0.18), smoothstep(0.7, 1.0, fin));

  let albedo = paint.mul(zP.add(zA))
    .add(U.dark.mul(float(1).add(pid.sub(0.5).mul(0.4))).mul(zD))
    .add(U.metal.mul(g1.mul(0.3).add(0.8)).mul(zM))
    .add(mix(vec3(0.02, 0.025, 0.03), vec3(0.08, 0.08, 0.08), float(1).sub(inWin)).mul(zW))
    .add(solar.mul(zS))
    .add(rad.mul(zR))
    .add(vec3(0.05).mul(zG))
    .add(haz.mul(zH))
    .add(vec3(0.01, 0.012, 0.015).mul(zGl))
    .add(rockCol.mul(zRk)).add(rustCol.mul(zRu))
    .add(concCol.mul(zCo)).add(alienCol.mul(zAl)).add(vec3(0.02, 0.03, 0.05).mul(zAg));
  albedo = albedo.mul(float(1).sub(seam.mul(0.38).mul(zP.add(zA).add(zD).add(zM).add(zRu)))).mul(float(1).sub(macroLine.mul(0.35).mul(zP.add(zA).add(zD))));
  m.colorNode = albedo;

  const metal = zAl.mul(0.25).add(zD.mul(0.6)).add(zM.mul(0.92)).add(zS.mul(0.35)).add(zR.mul(0.7)).add(zP.add(zA).mul(chip.mul(0.9).add(0.08))).add(zW.mul(inWin.oneMinus().mul(0.6)));
  m.metalnessNode = clamp(metal, 0, 1);
  const rough = zP.add(zA).mul(float(0.42).add(grime.mul(0.3)).sub(pid.mul(0.08)))
    .add(zD.mul(0.55)).add(zM.mul(float(0.22).add(g1.mul(0.25))))
    .add(zW.mul(mix(float(0.35), float(0.05), inWin))).add(zS.mul(mix(float(0.12), float(0.3), sgrid)))
    .add(zR.mul(0.45)).add(zG.mul(0.3)).add(zH.mul(0.5)).add(zGl.mul(0.04)).add(zRk.mul(0.92)).add(zRu.mul(0.75)).add(zCo.mul(0.88)).add(zAl.mul(float(0.16).add(al1.mul(0.2)))).add(zAg.mul(0.2));
  m.roughnessNode = clamp(rough, 0.03, 1);

  // emissivo: janelas acesas, faixas luminosas, leve calor nos radiadores
  const winE = wcol.mul(inWin).mul(on).mul(sill).mul(2.4);
  const glowE = U.glow.mul(vnoise(vec3(P.mul(0.3))).mul(0.3).add(0.85));
  const vig = vec3(0.35, 0.75, 1.6).mul(U.alienGlow);
  m.emissiveNode = vig.mul(glyph).mul(pulse.mul(0.7).add(0.3)).mul(zAl).add(vig.mul(1.6).mul(zAg)).add(winE.mul(zW)).add(glowE.mul(zG)).add(vec3(0.5, 0.12, 0.03).mul(smoothstep(0.85, 1.0, fin)).mul(0.08).mul(zR));

  if (!lite) {
    // juntas afundadas + chapas levemente desalinhadas + rebites
    const notRock = float(1).sub(zRk);
    const H = seam.mul(-1.0).add(pid.mul(0.15)).add(macroLine.mul(-0.6)).mul(notRock.sub(zAl).sub(zCo)).add(glyph.mul(-0.8).mul(zAl)).add(coForm.mul(-0.5).add(co1.mul(0.8)).mul(zCo)).add(inWin.mul(-0.6).mul(zW)).add(rk2.mul(6.0).add(rk1.mul(14.0)).mul(zRk));
    m.normalNode = bumpNormal(H, float(0.06));
  }
  void n; void dot; void normalView; void positionView;
  return m;
}

/** Luzes decorativas: octaedros aditivos com tamanho mínimo em tela e pisca. */
export function makeLightsMaterial({ minPx = 0.0026, gain = 1 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.fog = false;
  const center = attribute('aCenter', 'vec3');
  const L = attribute('aLight', 'vec4');
  const S = attribute('aSize', 'vec2');
  const cw = modelWorldMatrix.mul(vec4(center, 1.0)).xyz;
  const dist = length(cw);
  const k = max(float(1), dist.mul(minPx).div(S.x));
  m.positionNode = center.add(positionLocal.sub(center).mul(k));
  const w = L.w, ph = S.y;
  const strobe = step(0.88, fract(time.mul(w).add(ph))).add(step(0.88, fract(time.mul(w).add(ph).add(0.14))));
  const pulse = sin(time.mul(w.abs().mul(6.283)).add(ph.mul(6.283))).mul(0.5).add(0.5).pow(2.0).mul(0.9).add(0.1);
  const blink = select(w.equal(0), float(1), select(w.greaterThan(0), strobe.min(1), pulse));
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const soft = pow(facing, 2.5);
  // energia conservada: quando cresce por distância, fica proporcionalmente mais fraca
  const fade = min(float(1), float(1).div(k.mul(k).mul(0.6).add(0.4)));
  m.colorNode = vec4(L.xyz.mul(blink).mul(soft).mul(fade.mul(0.85).add(0.15)).mul(gain), 1.0);
  return m;
}

/** Holograma aditivo: varredura, linhas, cintilação. color HDR. */
export function makeHoloMaterial(color = [0.3, 1.2, 1.6], { lines = 18, alpha = 1, scroll = 0.6, rim = true } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  const U = { color: uniform(C(color)), alpha: uniform(alpha) };
  m.userData.U = U;
  const P = positionLocal;
  const scan = sin(P.y.mul(lines * 6.283).sub(time.mul(scroll * 6.283))).mul(0.5).add(0.5).pow(4.0).mul(0.6).add(0.4);
  const flick = vnoise(vec3(time.mul(14.0), 0.5, 0.5)).mul(0.25).add(0.8);
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const edge = rim ? pow(float(1).sub(facing), 1.6).mul(1.4).add(0.25) : float(1);
  m.colorNode = vec4(U.color.mul(scan).mul(flick).mul(edge).mul(U.alpha), 1.0);
  return m;
}

/** Campo de contenção da boca do hangar: véu azul quase transparente com ondulação. */
export function makeFieldMaterial(color = [0.2, 0.6, 1.0]) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  const U = { color: uniform(C(color)), strength: uniform(1) };
  m.userData.U = U;
  const p = uv();
  // células hexagonais finas (só as bordas acendem, e pouco)
  const q = p.mul(0.42);
  const hx = vec2(q.x.add(q.y.mul(0.5)), q.y.mul(0.866));
  const fa = fract(hx).sub(0.5);
  const cellEdge = max(abs(fa.x), abs(fa.y)).mul(2.0);
  const grid = smoothstep(0.9, 0.99, cellEdge).mul(0.18).mul(vnoise(vec3(floor(hx), time.mul(0.3))).mul(0.8).add(0.2));
  const wave = sin(p.x.mul(0.5).add(p.y.mul(0.3)).add(time.mul(1.6))).mul(0.5).add(0.5).pow(6.0);
  const n = vnoise(vec3(p.mul(0.25), time.mul(0.4)));
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const graze = pow(float(1).sub(facing), 3.0).mul(1.5);
  const a = grid.add(wave.mul(0.06)).add(n.mul(0.025)).add(graze.mul(0.45)).add(0.008);
  m.colorNode = vec4(U.color.mul(a).mul(U.strength), 1.0);
  return m;
}

/** Cone de luz volumétrica falsa (aditivo, some nas bordas e na ponta). */
export function makeConeMaterial(color = [1, 0.85, 0.6], k = 0.06) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  const t = uv().y; // 1 no topo (fonte) → 0 na base
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const body = pow(facing, 1.8);
  const dust = vnoise(positionLocal.mul(1.7).add(vec3(0, time.mul(0.15), 0))).mul(0.5).add(0.6);
  m.colorNode = vec4(vec3(color[0], color[1], color[2]).mul(body.mul(pow(t, 1.6)).mul(dust).mul(k)), 1.0);
  return m;
}

/** Vidro escuro reflexivo (janelas vistas de dentro/fora). */
export function makeGlassMaterial({ tint = [0.02, 0.03, 0.04], opacity = 0.22 } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.colorNode = vec3(tint[0], tint[1], tint[2]);
  m.metalnessNode = float(0.0);
  m.roughnessNode = float(0.03).add(vnoise(positionLocal.mul(3.0)).mul(0.04));
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  m.opacityNode = mix(float(opacity), float(0.85), pow(float(1).sub(facing), 4.0));
  return m;
}

/** Letreiro/tela emissiva a partir de uma textura de canvas (néon, quadro de missões). */
export function makeSignMaterial(tex, { gain = 2.2, flicker = 0.08, additive = false, scan = 0 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial(additive ? { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } : { side: THREE.DoubleSide });
  m.fog = false;
  const tx = texture(tex, uv());
  const fl = vnoise(vec3(time.mul(9.0), 1.0, 2.0)).mul(flicker).add(1.0 - flicker);
  let col = tx.rgb.mul(gain).mul(fl);
  if (scan) col = col.mul(sin(uv().y.mul(scan * 6.283)).mul(0.08).add(0.92));
  m.colorNode = additive ? vec4(col.mul(tx.a), 1.0) : col;
  return m;
}

/**
 * Material dos interiores. Luz: aBake (rgb, irradiância assada por vértice)
 * no emissivo × albedo + até N PointLights próprias (pool) via lightsNode
 * isolado. Ambiente constante (o céu não entra).
 */
export function makeInteriorMaterial(styleName = 'guilda', { lite = false, pool = [] } = {}) {
  const style = STYLES[styleName] || STYLES.guilda;
  const m = new THREE.MeshStandardNodeMaterial();
  const U = {
    primary: uniform(C(style.primary)), accent: uniform(C(style.accent)), glow: uniform(C(style.glow)),
    bakeGain: uniform(1), env: uniform(new THREE.Color(0.012, 0.012, 0.014)),
  };
  m.userData.U = U;
  const info = attribute('aInfo', 'vec3');
  const bake = attribute('aBake', 'vec3');
  const zone = info.x, seed = info.y;
  const UV = uv();
  const P = positionLocal;

  const zF = isZ(zone, 10), zGr = isZ(zone, 11), zW = isZ(zone, 12), zT = isZ(zone, 13), zL = isZ(zone, 14);
  const zFa = isZ(zone, 15), zSc = isZ(zone, 16), zWo = isZ(zone, 17), zRu = isZ(zone, 18), zB = isZ(zone, 19);
  const zP = isZ(zone, 0), zA = isZ(zone, 1), zD = isZ(zone, 2), zM = isZ(zone, 3), zG = isZ(zone, 7), zH = isZ(zone, 8), zGl = isZ(zone, 9);

  // piso: placas 1,2 m com juntas, desgaste no meio (trilhas), sujeira nos cantos
  const fp = panelGrid(UV.x.div(2.4), UV.y.div(1.2), seed.mul(3.0), float(2.0));
  const fSeam = aaLine(fp.x, float(0.008));
  const zGw = isZ(zone, 25), zGp = isZ(zone, 26), zCa = isZ(zone, 27);
  const n1 = fbm(P.mul(0.7));
  const fGrime = fbm(P.mul(0.22).add(3.0));
  const floorCol = mix(vec3(0.085, 0.088, 0.092), vec3(0.12, 0.118, 0.112), fp.y.mul(0.35).add(n1.mul(0.3))).mul(float(1).sub(fSeam.mul(0.5))).mul(fGrime.mul(0.35).add(0.8));
  // tapete: padrão geométrico bordô e ocre
  const cu = fract(UV.x.mul(0.8)), cv2 = fract(UV.y.mul(0.8));
  const diamond = step(abs(cu.sub(0.5)).add(abs(cv2.sub(0.5))), 0.32);
  const carpet = mix(vec3(0.09, 0.018, 0.02), vec3(0.22, 0.12, 0.04), diamond.mul(0.6)).mul(vnoise(P.mul(30.0)).mul(0.2).add(0.85));
  // grade metálica: losangos
  const gu = fract(UV.x.mul(5.0).add(UV.y.mul(5.0))), gv = fract(UV.x.mul(5.0).sub(UV.y.mul(5.0)));
  const holes = smoothstep(0.32, 0.4, min(abs(gu.sub(0.5)), abs(gv.sub(0.5))));
  const grateCol = mix(vec3(0.24, 0.24, 0.25), vec3(0.01), holes);
  // parede: painéis 2 × 1 m com frisos
  // grade alinhada (sem fiadas desencontradas — nada de "tijolo")
  const wpu = UV.x.div(4.8), wpv = UV.y.div(3.0);
  const wfu = fract(wpu), wfv = fract(wpv);
  const wp = vec2(min(min(wfu, wfu.oneMinus()).mul(1.6), min(wfv, wfv.oneMinus())), hash13(vec3(floor(wpu), floor(wpv), seed.mul(9.0))));
  const wSeam = aaLine(wp.x, float(0.018));
  // parede: chapas grandes cinza-azuladas, faixas horizontais, sujeira escorrida
  const band = step(0.5, fract(UV.y.div(6.0).add(0.08))).mul(0.06);
  const streakW = vnoise(P.mul(vec3(1.8, 0.08, 1.8)).add(seed)).mul(0.25);
  const wallBase = mix(vec3(0.21, 0.22, 0.23), vec3(0.25, 0.255, 0.26), wp.y.mul(0.5).add(n1.mul(0.5))).add(band);
  const wallCol = mix(wallBase, U.primary.mul(0.55), float(0.25)).mul(float(1).sub(wSeam.mul(0.4))).mul(float(1).sub(streakW));
  // laca escura (balcão do bar), madeira sintética, tecido, latão
  const grain = vnoise(vec3(UV.x.mul(0.6), UV.y.mul(28.0), seed)).mul(0.6).add(vnoise(vec3(UV.x.mul(2.0), UV.y.mul(90.0), seed)).mul(0.4));
  const plank = aaLine(panelGrid(UV.y.div(0.22), UV.x.div(2.4), seed, float(0.09)).x, float(0.02));
  const plankId = hash13(vec3(floor(UV.x.div(0.22)), floor(UV.y.div(2.4)), 3.0));
  const wood = mix(vec3(0.07, 0.03, 0.014), vec3(0.2, 0.085, 0.035), grain.mul(0.7).add(plankId.mul(0.3))).mul(float(1).sub(plank.mul(0.5)));
  const fab = vnoise(P.mul(40.0)).mul(0.15).add(0.85);
  const stripe = step(0.5, fract(UV.x.add(UV.y).mul(1.6)));
  const haz = mix(vec3(0.015), vec3(0.6, 0.4, 0.03), stripe);
  const scr = vnoise(vec3(UV.mul(vec2(3.0, 30.0)), time.mul(0.6))).mul(0.5).add(0.2);

  let albedo = floorCol.mul(zF).add(grateCol.mul(zGr)).add(wallCol.mul(zW).add(wallCol.mul(zP)))
    .add(vec3(0.03, 0.032, 0.036).mul(zT)).add(vec3(0.012, 0.012, 0.014).mul(zL)).add(U.accent.mul(fab).mul(zFa))
    .add(vec3(0.01).mul(zSc)).add(wood.mul(zWo)).add(vec3(0.02).mul(zRu)).add(vec3(0.55, 0.38, 0.14).mul(zB))
    .add(U.accent.mul(0.9).mul(zA)).add(vec3(0.03).mul(zD)).add(vec3(0.45, 0.46, 0.48).mul(n1.mul(0.3).add(0.8)).mul(zM))
    .add(vec3(0.05).mul(zG.add(zGw).add(zGp))).add(haz.mul(zH)).add(vec3(0.01).mul(zGl)).add(carpet.mul(zCa));
  m.colorNode = albedo;
  m.metalnessNode = clamp(zGr.mul(0.85).add(zT.mul(0.7)).add(zB.mul(1.0)).add(zM.mul(0.9)).add(zD.mul(0.5)).add(zF.mul(0.15)).add(zL.mul(0.1)), 0, 1);
  m.roughnessNode = clamp(zCa.mul(0.95).add(zGw.mul(0.3)).add(zGp.mul(0.3)).add(zF.mul(float(0.26).add(fGrime.mul(0.35)).sub(fp.y.mul(0.06)))).add(zGr.mul(0.45)).add(zW.mul(0.5)).add(zP.mul(0.5))
    .add(zT.mul(0.3)).add(zL.mul(0.08)).add(zFa.mul(0.9)).add(zSc.mul(0.15)).add(zWo.mul(float(0.25).add(grain.mul(0.2)))).add(zRu.mul(0.85))
    .add(zB.mul(0.22)).add(zA.mul(0.4)).add(zD.mul(0.5)).add(zM.mul(0.25)).add(zG.mul(0.3)).add(zH.mul(0.5)).add(zGl.mul(0.05)), 0.03, 1);
  // luz assada (difusa) + telas e faixas luminosas
  const scrE = vec3(0.15, 0.6, 0.9).mul(scr).mul(1.5);
  m.emissiveNode = albedo.mul(bake).mul(U.bakeGain).add(U.glow.mul(zG).mul(1.6)).add(vec3(3.2, 1.7, 0.7).mul(zGw)).add(vec3(3.0, 0.5, 1.6).mul(zGp)).add(scrE.mul(zSc));
  if (!lite) {
    const H = fSeam.mul(-1.0).mul(zF).add(holes.mul(-1.5).mul(zGr)).add(wSeam.mul(-1.0).mul(zW.add(zP))).add(grain.mul(0.15).mul(zWo));
    m.normalNode = bumpNormal(H, float(0.012));
  }
  m.envNode = U.env;
  if (pool.length) m.lightsNode = tslLights(pool);
  else m.lightsNode = tslLights([]);
  return m;
}

/** Exponencial usada por alguns efeitos (reexporta para quem precisa). */
export { exp, Fn };
