/**
 * Trechos GLSL compartilhados pelas passadas do sistema `render`.
 *
 * Profundidade: o alvo HDR do núcleo usa reversed-Z (depth limpo = 0 = céu)
 * ou depth logarítmico (fallback). `DEPTH_GLSL` converte o valor lido do
 * depth em DISTÂNCIA AO LONGO DO EIXO DA CÂMERA (m, positiva) e devolve um
 * valor enorme (1e12) para o céu. Uniforms: uDepthMode (0 reversed, 1 log,
 * 2 padrão), uNear, uFar.
 */

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const SKY_Z = 1e12;

export const DEPTH_GLSL = /* glsl */ `
uniform float uDepthMode;
uniform float uNear;
uniform float uFar;
// distância ao longo do eixo da câmera (m); céu → 1e12
float exoViewZ(float d) {
  if (uDepthMode < 0.5) {
    if (d <= 0.0) return 1e12;
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    return dd / (d + c);
  } else if (uDepthMode < 1.5) {
    if (d >= 1.0) return 1e12;
    return exp2(d * log2(uFar + 1.0)) - 1.0;
  }
  if (d >= 1.0) return 1e12;
  float ndc = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / ((uFar + uNear) - ndc * (uFar - uNear));
}
// inverso: distância no eixo → valor de depth do modo atual
float exoDepthFromViewZ(float z) {
  if (uDepthMode < 0.5) {
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    return clamp(dd / max(z, uNear) - c, 0.0, 1.0);
  } else if (uDepthMode < 1.5) {
    return clamp(log2(1.0 + z) / log2(uFar + 1.0), 0.0, 1.0);
  }
  float ndc = ((uFar + uNear) - 2.0 * uNear * uFar / max(z, uNear)) / (uFar - uNear);
  return clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
}
`;

/** Uniforms correspondentes a DEPTH_GLSL. */
export function depthUniforms(ctx) {
  return {
    uDepthMode: { value: ctx.depthMode === 'reversed' ? 0 : ctx.depthMode === 'log' ? 1 : 2 },
    uNear: { value: ctx.camera.near },
    uFar: { value: ctx.camera.far },
  };
}

/** Luminância (Rec.709 linear). */
export const LUMA_GLSL = /* glsl */ `
float exoLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** Ruído/hash baratos. */
export const HASH_GLSL = /* glsl */ `
float exoHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float exoIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
