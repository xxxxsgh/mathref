/**
 * TÚNEL DE WARP — sequência visual do salto entre sistemas (sem tela de
 * carregamento: o novo sistema é gerado DURANTE o túnel).
 *
 * Passada de tela cheia no estágio 'afterCockpit' (antes do bloom/tone map
 * do sistema `render`, então brilha de verdade):
 *   fase 0,00–0,16  carga: estrelas esticam em riscos radiais, clarão azul
 *   fase 0,16–0,84  túnel: paredes de plasma (ruído em coordenadas
 *                   cilíndricas 1/r), anéis de choque, riscos em 3 camadas
 *                   de velocidade, núcleo branco; tingido pela cor da
 *                   estrela de DESTINO
 *   fase 0,84–1,00  saída: clarão e dissolução sobre o sistema novo
 * Mistura pré-multiplicada: cor + destino·(1 − α).
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uPhase;
uniform float uTime;
uniform float uAspect;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec2 vUv;
${NOISE_GLSL}
float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
vec3 streaks(vec2 uv, float r, float a, float layer, float speed, float len, float dens) {
  float N = 220.0 + layer * 140.0;
  float fa = (a / 6.2831853 + 0.5) * N;
  float ai = floor(fa);
  float fx = fract(fa) - 0.5;
  float hh = h1(ai + layer * 17.0);
  if (hh > dens) return vec3(0.0);
  float head = fract(hh * 13.7 + uTime * speed * (0.6 + hh));
  head = head * head * 1.6 + 0.02;
  float l = len * head * (0.5 + hh);
  float body = smoothstep(head - l, head, r) * step(r, head);
  float thin = smoothstep(0.5, 0.0, abs(fx) * (1.0 + 4.0 * r)) ;
  float b = body * thin * (0.4 + 1.6 * h1(ai * 3.1 + layer));
  vec3 c = mix(vec3(1.0), mix(uColA, uColB, h1(ai * 7.7)), 0.65);
  return c * b * (0.6 + 2.4 * head);
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float p = uPhase;
  float charge = smoothstep(0.0, 0.16, p);
  float tunnel = smoothstep(0.1, 0.26, p) * (1.0 - smoothstep(0.8, 0.92, p));
  float exitF = smoothstep(0.82, 0.88, p) * (1.0 - smoothstep(0.88, 1.0, p));
  // riscos (3 camadas)
  float len = mix(0.02, 0.9, charge);
  vec3 col = vec3(0.0);
  col += streaks(uv, r, a, 0.0, 0.9, len, 0.55) * (0.35 + 0.5 * tunnel);
  col += streaks(uv, r, a + 0.013, 1.0, 1.4, len * 0.8, 0.4) * (0.25 + 0.5 * tunnel);
  col += streaks(uv, r, a - 0.021, 2.0, 2.3, len * 1.2, 0.3) * 0.6 * tunnel;
  // paredes do túnel: plasma em coordenadas cilíndricas (z = 1/r), mais forte perto da borda
  float z = 0.3 / max(r, 0.03) + uTime * 2.4;
  vec3 cyl = vec3(cos(a) * 1.3, sin(a) * 1.3, z * 0.5);
  float n1 = fbm(cyl, 5);
  float n2 = fbm(cyl * 2.1 + vec3(0.0, 0.0, uTime * 1.1), 3);
  float fil = pow(1.0 - abs(snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, z * 1.4))), 6.0);
  float wallMask = smoothstep(0.1, 0.55, r);
  float wall = smoothstep(-0.2, 0.75, n1) * wallMask;
  vec3 wc = mix(uColA, uColB, smoothstep(-0.45, 0.55, n2));
  col += wc * wall * tunnel * (0.25 + 0.9 * r) * 0.9;
  col += mix(wc, vec3(1.0), 0.25) * fil * wallMask * tunnel * 0.8;
  float rings = pow(0.5 + 0.5 * sin(z * 7.0 + n2 * 2.5), 10.0) * wallMask;
  col += mix(uColB, vec3(1.0), 0.3) * rings * tunnel * 0.35;
  // fim do túnel: brilho pequeno e intenso, com halo colorido
  float core = exp(-r * 22.0) * 3.0 + exp(-r * 7.0) * 0.35;
  col += mix(vec3(0.9, 0.95, 1.0), uColA, 0.25) * core * (0.3 + 0.7 * tunnel);
  // clarão de carga e de saída
  col += mix(uColA, vec3(1.0), 0.6) * (smoothstep(0.08, 0.16, p) * (1.0 - smoothstep(0.16, 0.26, p))) * 1.2;
  col += vec3(1.0, 0.97, 0.95) * exitF * 4.0;
  // vinheta escura nas bordas durante o túnel
  float vig = smoothstep(1.3, 0.45, r);
  col *= mix(1.0, vig, tunnel * 0.5);
  float alpha = clamp(charge * 0.35 + tunnel * 0.93 + exitF, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`;

export class WarpTunnel {
  constructor(ctx) {
    this.ctx = ctx;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPhase: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 16 / 9 },
        uColA: { value: new THREE.Vector3(0.25, 0.5, 1.0) },
        uColB: { value: new THREE.Vector3(0.85, 0.3, 1.0) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.active = false;
    this.phase = 0;
    this.time = 0;
    this.remove = ctx.pipeline.addPass('afterCockpit', (c, target) => this.render(target), { order: 20, owner: 'universe' });
  }

  /** Cor do túnel a partir da cor (linear) da estrela de destino. */
  setColor(rgb) {
    const c = new THREE.Color(rgb[0], rgb[1], rgb[2]);
    const hsl = {};
    c.getHSL(hsl);
    // duas cores saturadas: ciano/azul e violeta/magenta, deslocadas pela estrela de destino
    const warm = hsl.h < 0.2 || hsl.h > 0.9 ? 1 : 0;
    const a = new THREE.Color().setHSL(0.55 + 0.06 * warm, 0.95, 0.5);
    const b = new THREE.Color().setHSL(0.8 + 0.06 * warm, 0.9, 0.5);
    this.mat.uniforms.uColA.value.set(a.r, a.g, a.b);
    this.mat.uniforms.uColB.value.set(b.r, b.g, b.b);
  }

  render(target) {
    if (!this.active) return;
    const u = this.mat.uniforms;
    u.uPhase.value = this.phase;
    u.uTime.value = this.time;
    u.uAspect.value = target.width / Math.max(1, target.height);
    const r = this.ctx.renderer;
    const prev = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);
    r.autoClear = prev;
  }

  dispose() {
    this.remove?.();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
