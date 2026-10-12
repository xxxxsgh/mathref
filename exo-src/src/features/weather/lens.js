/**
 * EFEITOS NO VISOR / CANOPI (estágio 'afterCockpit' — por cima de tudo, antes
 * do tone mapping).
 *
 *   chuva   gotas paradas (duas escalas) que refratam a imagem invertida e
 *           pegam um brilho especular, mais gotas escorrendo com rastro
 *   ácida   idem, tingidas e com bordas corroídas
 *   neve    geada cristalina crescendo das bordas + flocos grudados
 *   poeira  película de poeira nas bordas, riscos de areia, tinta quente
 *   calor   ondulação da imagem inteira (mais forte embaixo)
 *
 * Como a passada não pode ler o alvo em que desenha, copia o HDR para uma
 * textura em meia resolução (borrada de graça) e desenha a sobreposição com
 * mistura alfa pré-multiplicada. 2 desenhos quando ativo, 0 quando não.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COPY = /* glsl */ `
uniform sampler2D uSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uSrc, vUv).rgb, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform float uTime;
uniform float uAspect;
uniform float uRain;
uniform float uAcid;
uniform float uSnow;
uniform float uDust;
uniform float uHeat;
uniform vec3 uDustTint;
uniform vec3 uAcidTint;
uniform vec3 uLight;      // radiância de referência (brilho das gotas/geada)
varying vec2 vUv;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.0)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.07 + 3.1; a *= 0.5; }
  return s;
}

// camada de gotas paradas: devolve (normal da gota xy, máscara, raio em uv)
vec4 drops(vec2 uv, float scale, float amount, float seed) {
  vec2 p = vec2(uv.x * uAspect, uv.y) * scale;
  vec2 id = floor(p);
  vec4 best = vec4(0.0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 c = id + vec2(x, y);
    vec2 r = h22(c + seed);
    if (r.x > amount) continue;
    vec2 ctr = c + 0.2 + 0.6 * h22(c + seed + 7.0);
    float rad = 0.1 + 0.28 * r.y * r.y;
    vec2 d = p - ctr;
    d.y *= 1.0 + 0.25 * r.y;           // gotas levemente alongadas
    float dist = length(d);
    if (dist < rad) {
      float m = smoothstep(rad, rad * 0.86, dist);
      if (m > best.z) best = vec4(d / rad, m, rad / scale);
    }
  }
  return best;
}

// gotas escorrendo com rastro
vec4 runs(vec2 uv, float amount) {
  vec2 p = vec2(uv.x * uAspect * 7.0, uv.y);
  float col = floor(p.x);
  float r = h21(vec2(col, 3.7));
  if (r > amount * 0.6) return vec4(0.0);
  float speed = 0.05 + 0.12 * h21(vec2(col, 9.1));
  float y = fract(h21(vec2(col, 1.3)) - uTime * speed);
  float x = fract(p.x) - 0.5 + 0.08 * sin(uv.y * 40.0 + col);
  float dy = uv.y - y;
  float head = smoothstep(0.022, 0.012, length(vec2(x * 0.14, dy * 1.4)));
  float trail = smoothstep(0.06, 0.0, abs(x)) * smoothstep(0.0, 0.02, dy) * (1.0 - smoothstep(0.02, 0.32, dy)) * 0.55;
  float m = max(head, trail * step(0.0, dy));
  return vec4(vec2(x * 4.0, -0.3), m * 0.8, 0.006);
}

void main() {
  vec2 uv = vUv;
  vec4 acc = vec4(0.0);          // cor pré-multiplicada + alfa
  float wet = max(uRain, uAcid);
  if (wet > 0.01) {
    vec4 a = drops(uv, 18.0, 0.13 * wet, 1.0);
    vec4 b = drops(uv, 8.0, 0.07 * wet, 5.0);
    vec4 c = runs(uv, wet);
    vec4 d = a;
    if (b.z > d.z) d = b;
    if (c.z > d.z) d = c;
    if (d.z > 0.0) {
      // cada gota é uma lente: imagem do entorno INVERTIDA e reduzida
      vec2 n = d.xy;
      float ln = length(n);
      vec2 nu = vec2(n.x / uAspect, n.y);
      vec2 suv = clamp(uv - nu * d.w * 4.5, vec2(0.002), vec2(0.998));
      vec3 col = texture2D(uSrc, suv).rgb;
      // borda escura (refração rasante) e brilho especular do céu
      col *= mix(1.05, 0.22, smoothstep(0.45, 1.0, ln));
      float spec = pow(max(0.0, 1.0 - length(n - vec2(-0.35, 0.45)) * 2.2), 3.0);
      col += uLight * spec * 0.9;
      col = mix(col, col * uAcidTint, uAcid / max(wet, 1e-3) * 0.65);
      float al = d.z * 0.92;
      acc = vec4(col * al, al);
    }
    // borrão leve de água no vidro
    float film = fbm(uv * vec2(uAspect, 1.0) * 3.0 + 4.0) * 0.18 * wet;
    acc = acc + vec4(texture2D(uSrc, uv).rgb * film, film) * (1.0 - acc.a);
  }
  if (uSnow > 0.01) {
    vec2 q = uv * vec2(uAspect, 1.0);
    float e = min(min(uv.x, 1.0 - uv.x) * uAspect, min(uv.y, 1.0 - uv.y));
    float n = fbm(q * 9.0) * 0.7 + fbm(q * 32.0) * 0.3;
    float frost = smoothstep(0.0, 0.16, (0.12 + 0.07 * uSnow) - e + (n - 0.5) * 0.2) * uSnow;
    // veios de cristal: cristas de um fBm (linhas ramificadas), mais finos longe da borda
    float rv = 1.0 - abs(fbm(q * 14.0 + n * 2.0) * 2.0 - 1.0);
    float rv2 = 1.0 - abs(fbm(q * 31.0 + 7.0) * 2.0 - 1.0);
    float needles = (pow(rv, 16.0) * 0.5 + pow(rv2, 20.0) * 0.3) * frost;
    vec3 bg = texture2D(uSrc, uv + (n - 0.5) * 0.02).rgb;
    vec3 fc = mix(bg * 0.55 + uLight * 0.6 * vec3(0.72, 0.86, 1.12), uLight * vec3(1.3, 1.45, 1.7), clamp(needles, 0.0, 1.0));
    float al = clamp(frost * (0.45 + 0.35 * n), 0.0, 0.8);
    // flocos grudados
    vec4 fl = drops(uv, 24.0, 0.07 * uSnow, 11.0);
    float fa = fl.z * 0.85;
    fc = mix(fc, uLight * 1.2, fa);
    al = max(al, fa);
    acc = vec4(fc * al, al) + acc * (1.0 - al);
  }
  if (uDust > 0.01) {
    vec2 q = uv * vec2(uAspect, 1.0);
    float e = min(min(uv.x, 1.0 - uv.x) * uAspect, min(uv.y, 1.0 - uv.y));
    float grime = fbm(q * 6.0 + 9.0);
    float m = (smoothstep(0.35, 0.0, e) * 0.5 + 0.2 * grime) * uDust;
    float streak = smoothstep(0.75, 1.0, fbm(vec2(q.x * 2.0 + q.y * 9.0, q.y * 1.0) * 4.0)) * 0.35 * uDust;
    float al = clamp(m * 0.55 + streak, 0.0, 0.7);
    vec3 col = uDustTint * (dot(uLight, vec3(0.33)) * 0.9 + 0.02);
    acc = vec4(col * al, al) + acc * (1.0 - al);
  }
  if (uHeat > 0.01) {
    float k = uHeat * (0.25 + 0.75 * smoothstep(0.75, 0.2, uv.y));
    vec2 off = vec2(sin(uv.y * 90.0 + uTime * 6.0 + sin(uv.x * 23.0) * 2.0), cos(uv.x * 70.0 + uTime * 5.0)) * 0.0022 * k;
    vec3 col = texture2D(uSrc, uv + off).rgb;
    float al = clamp(k, 0.0, 1.0) * 0.9 * (1.0 - acc.a);
    acc = acc + vec4(col * al, al);
  }
  gl_FragColor = acc;
}`;

export class LensPass {
  constructor(ctx) {
    this.ctx = ctx;
    this.src = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.mCopy = new THREE.ShaderMaterial({ uniforms: { uSrc: { value: null } }, vertexShader: VERT, fragmentShader: COPY, depthTest: false, depthWrite: false });
    this.u = {
      uSrc: { value: this.src.texture },
      uTime: { value: 0 },
      uAspect: { value: 1.7 },
      uRain: { value: 0 },
      uAcid: { value: 0 },
      uSnow: { value: 0 },
      uDust: { value: 0 },
      uHeat: { value: 0 },
      uDustTint: { value: new THREE.Vector3(0.9, 0.6, 0.35) },
      uAcidTint: { value: new THREE.Vector3(0.8, 1.0, 0.4) },
      uLight: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.mLens = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new FullScreenQuad(this.mCopy);
    this.active = false;
  }

  render(target) {
    if (!this.active || !target) return;
    const r = this.ctx.renderer;
    const w = Math.max(1, target.width >> 1);
    const h = Math.max(1, target.height >> 1);
    if (this.src.width !== w || this.src.height !== h) this.src.setSize(w, h);
    this.u.uAspect.value = target.width / Math.max(1, target.height);
    const prevT = r.getRenderTarget();
    const prevClear = r.autoClear;
    r.autoClear = false;
    this.mCopy.uniforms.uSrc.value = target.texture;
    this.quad.material = this.mCopy;
    r.setRenderTarget(this.src);
    this.quad.render(r);
    this.quad.material = this.mLens;
    r.setRenderTarget(target);
    this.quad.render(r);
    r.setRenderTarget(prevT);
    r.autoClear = prevClear;
  }

  dispose() {
    this.src.dispose();
    this.mCopy.dispose();
    this.mLens.dispose();
    this.quad.dispose();
  }
}
