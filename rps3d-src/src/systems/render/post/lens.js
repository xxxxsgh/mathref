// Óptica da "lente da câmera": lens flare (fantasmas cromáticos + halo +
// raia anamórfica) gerado a partir do bloom HDR, sujeira de lente
// procedural e god rays em espaço de tela a partir da estrela.
//
// Os passes caros rodam em resolução reduzida via rtt().setResolutionScale.

import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, float, int, uv, Loop, fract, max, min, mix, length, normalize, dot, exp, pow, clamp, smoothstep, step, abs, rtt, screenCoordinate, interleavedGradientNoise } from 'three/tsl';

// Tintas dos fantasmas (revestimento de lente): alternam âmbar/ciano/violeta.
const GHOST_TINTS = [
  [1.0, 0.75, 0.45],
  [0.45, 0.85, 1.0],
  [0.8, 0.55, 1.0],
  [0.55, 1.0, 0.7],
  [1.0, 0.5, 0.35],
  [0.5, 0.65, 1.0],
];

/**
 * Lens flare em 1/4 de resolução.
 * @param bloomTex nó de textura com o bloom (só áreas brilhantes, já borrado)
 * @param U uniforms do pipeline (U.aspect, U.flare)
 * @returns nó de textura (rtt) RGB HDR
 */
export function lensFlarePass(bloomTex, U, { ghosts = 6, streakTaps = 14 } = {}) {
  const flare = Fn(() => {
    const st = uv();
    const fl = vec2(1).sub(st); // espelha em torno do centro
    const toC = vec2(0.5).sub(fl);
    const ghostVec = toC.mul(0.36);
    const res = vec3(0).toVar();
    const thr = float(0.08);
    for (let i = 0; i < ghosts; i++) {
      const tint = GHOST_TINTS[i % GHOST_TINTS.length];
      // espaçamento não uniforme (elementos de lente com potências diferentes)
      const k = [0.0, 0.7, 1.35, 1.9, 2.6, 3.4][i] ?? i * 0.6;
      const scale = [1.0, -0.6, 0.45, -1.4, 0.8, 2.1][i] ?? 1;
      const base = vec2(0.5).add(fl.sub(0.5).mul(scale));
      const s = base.add(ghostVec.mul(k));
      const ca = normalize(toC.add(1e-5)).mul(0.006 * (i + 1));
      const r = bloomTex.sample(s.add(ca)).r;
      const g = bloomTex.sample(s).g;
      const b = bloomTex.sample(s.sub(ca)).b;
      const c = max(vec3(r, g, b).sub(thr), vec3(0));
      // atenuação perto da borda (vinheta do fantasma)
      const w = pow(clamp(float(1).sub(length(s.sub(0.5)).mul(1.6)), 0, 1), 3.0);
      res.addAssign(c.mul(vec3(...tint)).mul(w).mul(0.3 / (1 + i * 0.25)));
    }
    // halo: anel em raio fixo (corrigido pelo aspecto)
    const dir = normalize(toC.mul(vec2(U.aspect, 1)).add(1e-5)).div(vec2(U.aspect, 1));
    const haloUV = fl.add(dir.mul(0.42));
    const haloW = pow(clamp(float(1).sub(length(vec2(0.5).sub(haloUV)).div(0.6)), 0, 1), 4.0);
    const hr = bloomTex.sample(haloUV.add(dir.mul(0.012))).r;
    const hg = bloomTex.sample(haloUV).g;
    const hb = bloomTex.sample(haloUV.sub(dir.mul(0.012))).b;
    res.addAssign(max(vec3(hr, hg, hb).sub(thr.mul(4)), vec3(0)).mul(haloW).mul(vec3(0.9, 0.8, 1.0)).mul(0.035));
    // raia anamórfica horizontal (lente "cinemascope")
    const streak = vec3(0).toVar();
    const step_ = float(0.012);
    for (let k = -streakTaps; k <= streakTaps; k++) {
      if (k === 0) continue;
      const w = Math.exp(-Math.abs(k) * 0.16);
      streak.addAssign(bloomTex.sample(st.add(vec2(step_.mul(k), 0))).rgb.mul(w));
    }
    const sl = dot(streak, vec3(0.33));
    res.addAssign(vec3(0.35, 0.55, 1.0).mul(max(sl.sub(0.6), 0)).mul(0.05));
    return vec4(res.mul(U.flare), 1);
  });
  const node = rtt(flare(), null, null, { type: THREE.HalfFloatType });
  node.setResolutionScale(0.25);
  return node;
}

/**
 * God rays em espaço de tela: máscara (céu brilhante perto da estrela) em
 * 1/2 resolução e depois desfoque radial em direção ao sol.
 */
export function godRaysPass(colorTex, depthTex, U, { samples = 48 } = {}) {
  const mask = Fn(() => {
    const st = uv();
    const d = depthTex.sample(st).r;
    const sky = step(0.999999, d);
    const c = colorTex.sample(st).rgb;
    const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    const bright = max(l.sub(0.6), 0).div(l.add(0.001));
    const dv = st.sub(U.sunUV).mul(vec2(U.aspect, 1));
    const fall = exp(dot(dv, dv).mul(-9.0));
    return vec4(c.mul(bright).mul(sky).mul(fall).min(vec3(40)), 1);
  });
  const maskTex = rtt(mask(), null, null, { type: THREE.HalfFloatType });
  maskTex.setResolutionScale(0.5);
  const rays = Fn(() => {
    const st = uv().toVar();
    const delta = U.sunUV.sub(st).div(samples).mul(0.92);
    const jitter = interleavedGradientNoise(screenCoordinate);
    const p = st.add(delta.mul(jitter)).toVar();
    const acc = vec3(0).toVar();
    const w = float(1).toVar();
    Loop({ start: int(0), end: int(samples), type: 'int', condition: '<' }, () => {
      acc.addAssign(maskTex.sample(p).rgb.mul(w));
      w.mulAssign(0.965);
      p.addAssign(delta);
    });
    return vec4(acc.div(samples).mul(U.godrays).mul(U.sunVis), 1);
  });
  const raysTex = rtt(rays(), null, null, { type: THREE.HalfFloatType });
  raysTex.setResolutionScale(0.5);
  return raysTex;
}

/**
 * Sujeira de lente procedural (manchas, digitais, poeira, bolinhas
 * desfocadas) num CanvasTexture — multiplicada pelo bloom/flare.
 */
export function makeLensDirt(w = 512, h = 288, seed = 7) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'lighter';
  // bokeh de poeira desfocada
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 2 + rnd() * rnd() * 22;
    const a = 0.03 + rnd() * 0.1;
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.75, `rgba(255,255,255,${a * 0.8})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // manchas largas
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 30 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.04 + rnd() * 0.05})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // arcos de "digital" / limpeza
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r0 = 20 + rnd() * 40;
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(255,255,255,${0.02 + rnd() * 0.02})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x, y, r0 + k * 3.2, rnd() * 6, rnd() * 6 + 1.5);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
