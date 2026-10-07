// Efeitos ópticos do sol (e de luzes fortes) em TSL:
//  • sunFlare: flare analítico a partir da posição do sol na tela — núcleo,
//    estrela de difração (6 pontas + raias finas), raia anamórfica azulada,
//    halo arco-íris e "fantasmas" (discos e hexágonos da íris) ao longo do eixo
//    sol→centro. Oclusão por amostragem da profundidade num disco em volta do
//    sol (cabine, naves, asteroides e planetas tapam) × eclipse analítico.
//  • godRays: raios crepusculares em meia resolução (desfoque radial da máscara
//    de céu brilhante a partir do sol).
//  • anamorphic: raias horizontais de qualquer luz forte (motores, explosões).
//  • lensDirt: sujeira/marcas da lente que acendem com bloom e flare.
import { Fn, vec2, vec3, vec4, float, uv, exp, abs, pow, cos, sin, atan, max, min, mix, clamp, smoothstep, length, dot, fract, floor, Loop, rtt, select } from 'three/tsl';
import { viewDistFromDepth } from './common.js';
import { hash12 } from '../tslib.js';

/** Fator de oclusão do sol (0 tapado … 1 livre) amostrando a profundidade. */
export const sunOcclusion = (U, depthTex) => {
  const occ = float(0).toVar();
  const r = max(U.sunRadiusUv, U.invRes.y.mul(2.5));
  const pts = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  for (const [x, y] of pts) {
    const q = U.sunUv.add(vec2(float(x).div(U.aspect), float(y)).mul(r));
    const inside = q.x.greaterThan(0).and(q.x.lessThan(1)).and(q.y.greaterThan(0)).and(q.y.lessThan(1));
    const d = viewDistFromDepth(U, depthTex.sample(clamp(q, 0.001, 0.999)).r);
    occ.addAssign(select(inside.and(d.greaterThan(U.sunDist.mul(0.45))), float(1), float(0)));
  }
  return occ.div(pts.length);
};

const hexSdf = (q) => {
  const a = abs(q);
  return max(a.x.mul(0.8660254).add(a.y.mul(0.5)), a.y);
};

/** Flare analítico do sol. Retorna vec3 HDR a somar antes do tone mapping. */
export const sunFlare = (U, depthTex, { ghosts = 5, strength } = {}) => Fn(() => {
  const p = uv();
  const asp = vec2(U.aspect, 1);
  const P = p.sub(U.sunUv).mul(asp).toVar();
  const d = length(P).toVar();
  // visibilidade: frente da câmera, dentro/perto da tela, não ocluído
  const edge = max(abs(U.sunUv.x.sub(0.5)), abs(U.sunUv.y.sub(0.5)));
  const onScreen = float(1).sub(smoothstep(0.5, 0.75, edge));
  const occ = sunOcclusion(U, depthTex);
  const vis = occ.mul(U.sunVis).mul(U.sunFront).mul(onScreen).mul(U.sunPower).mul(strength).toVar();
  const sc = U.sunColor;
  // núcleo + coroa
  const core = exp(d.mul(-60)).mul(2.2).add(exp(d.mul(-11)).mul(0.22)).add(exp(d.mul(-3.2)).mul(0.035));
  // estrela de difração: 6 pontas principais + raias finas pseudoaleatórias
  const ang = atan(P.y, P.x);
  const sp1 = pow(abs(cos(ang.mul(3).add(0.35))), float(90)).mul(exp(d.mul(-5)));
  const sp2 = pow(abs(cos(ang.mul(3).add(0.35 + 0.5236))), float(260)).mul(exp(d.mul(-9))).mul(0.5);
  const fine = hash12(vec2(floor(ang.mul(57.3).add(200)), 1.7)).mul(0.6).add(0.4);
  const rays = pow(fine, float(6)).mul(exp(d.mul(-7))).mul(0.25);
  const burst = sp1.mul(0.4).add(sp2.mul(0.8)).add(rays.mul(0.5).mul(smoothstep(0.004, 0.03, d)));
  // raia anamórfica horizontal (azulada)
  const streak = exp(abs(P.y).mul(-520)).mul(exp(abs(P.x).mul(-2.2))).mul(0.4)
    .add(exp(abs(P.y).mul(-90)).mul(exp(abs(P.x).mul(-3.5))).mul(0.12));
  const streakCol = vec3(0.35, 0.55, 1.0);
  // halo arco-íris
  const rr = d.sub(0.38).div(0.018);
  const ring = exp(rr.mul(rr).negate()).mul(0.035);
  const hue = d.sub(0.36).mul(28);
  const rainbow = vec3(cos(hue).mul(0.5).add(0.5), cos(hue.sub(2.1)).mul(0.5).add(0.5), cos(hue.sub(4.2)).mul(0.5).add(0.5));
  const col = sc.mul(core.add(burst)).add(streakCol.mul(streak)).add(rainbow.mul(ring)).toVar();
  // fantasmas ao longo do eixo sol → centro
  const axis = vec2(0.5, 0.5).sub(U.sunUv);
  const G = [
    [0.55, 0.035, [0.4, 0.8, 1.0], 0.10, 1], [0.78, 0.07, [0.9, 0.5, 1.0], 0.05, 0],
    [1.12, 0.022, [1.0, 0.85, 0.5], 0.14, 1], [1.45, 0.11, [0.3, 1.0, 0.6], 0.035, 0],
    [1.8, 0.05, [1.0, 0.4, 0.3], 0.06, 1], [-0.35, 0.03, [0.5, 0.7, 1.0], 0.07, 1],
    [2.15, 0.16, [0.5, 0.6, 1.0], 0.025, 0], [0.3, 0.015, [1, 1, 1], 0.12, 1],
  ].slice(0, ghosts);
  for (const [t, size, c, inten, hex] of G) {
    const q = p.sub(U.sunUv.add(axis.mul(t))).mul(asp);
    const sdf = hex ? hexSdf(q) : length(q);
    const disc = smoothstep(size, size * 0.82, sdf);
    const rim = smoothstep(size * 0.8, size * 0.97, sdf).mul(disc).mul(1.4);
    col.addAssign(vec3(...c).mul(disc.mul(0.55).add(rim)).mul(inten));
  }
  return col.mul(vis);
})();

/** Raios crepusculares em meia resolução. Retorna nó de textura (rtt). */
export const godRays = (U, colorTex, depthTex, { samples = 32, scale = 0.5 } = {}) => {
  const node = Fn(() => {
    const p = uv();
    const delta = p.sub(U.sunUv).mul(0.92 / samples).toVar();
    const coord = p.toVar();
    const acc = vec3(0).toVar();
    const decay = float(1).toVar();
    // jitter por pixel (quebra o bandeamento; TAA/bloom suavizam)
    const j = hash12(p.mul(U.resolution).add(U.frame.mul(7.13).mod(64)));
    coord.subAssign(delta.mul(j));
    const asp = vec2(U.aspect, 1);
    Loop(samples, () => {
      coord.subAssign(delta);
      const c = clamp(coord, 0.0005, 0.9995);
      const dist = viewDistFromDepth(U, depthTex.sample(c).r);
      const sky = smoothstep(U.sunDist.mul(0.2), U.sunDist.mul(0.45), dist);
      const lum = min(dot(colorTex.sample(c).level(0).rgb, vec3(0.2126, 0.7152, 0.0722)), 3.0);
      const near = exp(length(c.sub(U.sunUv).mul(asp)).mul(-9));
      acc.addAssign(vec3(sky.mul(near.mul(1.6).add(lum.mul(near).mul(0.25)))).mul(decay));
      decay.mulAssign(0.958);
    });
    return vec4(acc.div(samples), 1);
  })();
  return rtt(node, null, null, { resolutionScale: scale });
};

/** Raias anamórficas de luzes fortes (¼ de resolução, gather horizontal). */
export const anamorphic = (U, colorTex, { taps = 20, scale = 0.25, threshold = 2.5 } = {}) => {
  // 1) limiar em baixa resolução
  const bright = rtt(Fn(() => {
    const c = colorTex.sample(uv()).rgb;
    const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return vec4(c.mul(smoothstep(threshold, threshold * 2.5, l)).min(40), 1);
  })(), null, null, { resolutionScale: scale });
  // 2) espalhamento horizontal largo
  const streak = rtt(Fn(() => {
    const p = uv();
    const acc = vec3(0).toVar();
    const step = U.invRes.x.mul(1 / scale).mul(3.2);
    for (let i = -taps; i <= taps; i++) {
      const w = Math.exp(-Math.abs(i) / (taps * 0.35));
      acc.addAssign(bright.sample(p.add(vec2(step.mul(i), 0))).rgb.mul(w));
    }
    return vec4(acc.mul(1 / (taps * 0.7)), 1);
  })(), null, null, { resolutionScale: scale });
  return streak;
};

/** Sujeira de lente procedural (0..1), estável na tela. */
export const lensDirt = (U) => Fn(() => {
  const p = uv().mul(vec2(U.aspect, 1));
  const acc = float(0).toVar();
  // manchas (blobs) em 3 escalas
  for (const [s, k] of [[5.0, 0.55], [11.0, 0.3], [23.0, 0.18]]) {
    const g = p.mul(s);
    const id = floor(g), f = fract(g);
    const h = hash12(id.add(s));
    const c = vec2(hash12(id.add(3.1 + s)), hash12(id.add(7.7 + s))).mul(0.6).add(0.2);
    const rad = h.mul(0.35).add(0.12);
    const blob = smoothstep(rad, rad.mul(0.2), length(f.sub(c))).mul(select(h.greaterThan(0.45), float(1), float(0)));
    acc.addAssign(blob.mul(k).mul(h.mul(0.6).add(0.4)));
  }
  // vinheta de sujeira mais forte nas bordas
  const e = length(uv().sub(0.5).mul(vec2(U.aspect, 1)));
  return acc.mul(smoothstep(0.15, 0.9, e).mul(0.7).add(0.3)).add(0.08);
})();
