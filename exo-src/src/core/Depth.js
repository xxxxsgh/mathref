/**
 * PROFUNDIDADE — escolha e análise (puro, testável).
 *
 * Decisão: REVERSED-Z com buffer de profundidade FLOAT32.
 *   - O three 0.185 suporta `new WebGLRenderer({ reversedDepthBuffer: true })`
 *     quando a extensão EXT_clip_control existe (o SwiftShader do Chromium
 *     de teste tem). O three então usa clip [0,1], clear 0, teste GREATER e
 *     a projeção reversa (near → 1, far → 0) em TODAS as câmeras — inclusive
 *     ShaderMaterial (usa a projectionMatrix do three, nada a fazer).
 *   - Reversed-Z só rende com depth em PONTO FLUTUANTE: o mundo é desenhado
 *     no alvo HDR do núcleo (core/Pipeline.js), que tem DepthTexture
 *     FloatType (DEPTH_COMPONENT32F). A distribuição do float (denso perto
 *     de 0) cancela a hipérbole 1/z → erro RELATIVO ~constante (~1e-7·z).
 *   - FALLBACK: sem EXT_clip_control, `logarithmicDepthBuffer: true`
 *     (gl_FragDepth = log2(1+z)/log2(1+far)): erro relativo ~1,5e-6·z num
 *     depth de 24 bits; custa o early-Z. `?depth=log` força o fallback.
 *
 * REGRA para ShaderMaterial/RawShaderMaterial dos sistemas: inclua
 *   #include <common> / <logdepthbuf_pars_vertex> / <logdepthbuf_vertex>
 *   #include <logdepthbuf_pars_fragment> / <logdepthbuf_fragment>
 * Elas são no-op com reversed-Z e corretas no fallback. Quem escreve
 * gl_FragDepth à mão (ex.: impostores com interseção analítica) deve usar
 * `depthFromViewZ()` equivalente no shader para os dois modos (ver
 * CONTRACT.md → Profundidade).
 *
 * Orçamento de precisão garantido (tools/unit.test.mjs):
 *   near 0,1 m · far 1e10 m · superfícies separadas por max(1 mm, 2e-6·z)
 *   são distinguíveis de z = 0,1 m até z = 1e7 m (órbita).
 *   Ex.: 0,1 m de separação a 50 km; 20 m a 1e7 m.
 */

const f32 = Math.fround;

/**
 * Profundidade gravada (float32) com reversed-Z para um ponto à distância z
 * (z > 0, ao longo do eixo de visão). Emula as operações da GPU em float32.
 */
export function depthReversedF32(z, near, far) {
  const c = near / (far - near);
  const d = (far * near) / (far - near);
  // clip.z = c·zv + d, clip.w = −zv, com zv = −z
  const cz = f32(f32(f32(c) * f32(-z)) + f32(d));
  const w = f32(z);
  return f32(cz / w);
}

/** Profundidade logarítmica (fallback) quantizada em 24 bits. */
export function depthLog24(z, far) {
  const v = Math.log2(1 + z) / Math.log2(1 + far);
  return Math.round(v * 16777215);
}

/** Profundidade convencional (sem reversed) quantizada em 24 bits — referência do que NÃO usar. */
export function depthStandard24(z, near, far) {
  const ndc = (far + near) / (far - near) - (2 * far * near) / ((far - near) * z);
  return Math.round((ndc * 0.5 + 0.5) * 16777215);
}

/** Separação mínima exigida (m) a uma distância z. */
export function requiredSeparation(z) {
  return Math.max(1e-3, 2e-6 * z);
}

/**
 * Verifica se superfícies a z e z+sep geram profundidades distintas e na
 * ordem certa, em toda a faixa [zMin, zMax] (amostragem logarítmica).
 * Devolve { ok, worst: { z, sep } }.
 */
export function checkDepthRange(mode, { near = 0.1, far = 1e10, zMin = 0.1, zMax = 1e7, samples = 400, sep = requiredSeparation } = {}) {
  let ok = true;
  let worst = null;
  for (let i = 0; i <= samples; i++) {
    const z = zMin * Math.pow(zMax / zMin, i / samples);
    const s = sep(z);
    let a, b, good;
    if (mode === 'reversed') {
      a = depthReversedF32(z, near, far);
      b = depthReversedF32(z + s, near, far);
      good = a > b; // reversed: mais perto = maior
    } else if (mode === 'log') {
      a = depthLog24(z, far);
      b = depthLog24(z + s, far);
      good = a < b;
    } else {
      a = depthStandard24(z, near, far);
      b = depthStandard24(z + s, near, far);
      good = a < b;
    }
    if (!good) {
      ok = false;
      if (!worst) worst = { z, sep: s };
    }
  }
  return { ok, worst };
}
