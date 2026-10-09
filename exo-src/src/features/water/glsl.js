/**
 * GLSL comum da água (cópia local — features não importam umas das outras).
 * DEPTH_GLSL: valor do depth do alvo HDR → distância ao longo do eixo da
 * câmera (m); céu → 1e12. Modos: 0 reversed-Z, 1 logarítmico, 2 padrão.
 */
export const DEPTH_GLSL = /* glsl */ `
uniform float uDepthMode;
uniform float uNear;
uniform float uFar;
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
`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
