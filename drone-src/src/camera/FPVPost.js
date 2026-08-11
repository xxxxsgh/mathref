import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Pós-processamento do feed FPV num PASSE ÚNICO.
 *
 * Distorção de barril, aberração cromática, vinheta, grão e perda de sinal são
 * todos efeitos de tela cheia sem dependência entre si — cabem no mesmo
 * fragment shader. Uma cadeia de passes faria a mesma coisa lendo e escrevendo
 * a tela quatro vezes, que num iPad é exatamente o custo que não temos.
 *
 * Cada efeito tem intensidade própria e vai a zero sozinho, então desligar por
 * tier de qualidade é só zerar o uniform — sem recompilar shader.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uBarrel;
  uniform float uChromatic;
  uniform float uVignette;
  uniform float uNoise;
  uniform float uSignal;     // 1 = imagem limpa, 0 = sinal perdido
  uniform float uDamage;     // avaria da câmera (Fase 6)
  uniform float uFlash;
  uniform vec3  uFlashColor;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // k > 0 amostra cada vez mais longe do centro conforme se afasta dele, o que
  // comprime as bordas — é o que dá o aspecto de lente grande-angular.
  //
  // A divisão pelo fator do canto (onde dot(c,c) = 0.5) reescala a imagem de
  // volta pra tela cheia. Sem ela a distorção puxa os cantos pra fora do render
  // target e sobra uma moldura preta comendo o quadro, que é exatamente o que
  // um feed FPV de verdade não tem.
  vec2 distort(vec2 uv, float k) {
    vec2 c = uv - 0.5;
    return 0.5 + c * (1.0 + k * dot(c, c)) / (1.0 + k * 0.5);
  }

  void main() {
    float glitch = max(1.0 - uSignal, uDamage);
    vec2 uv = vUv;

    // Tearing: faixas horizontais deslocadas, como um receptor analógico
    // perdendo sincronia. Quantizado no tempo pra "segurar" cada quadro ruim
    // por alguns frames em vez de virar chuvisco contínuo.
    if (glitch > 0.001) {
      float band = floor(uv.y * 90.0);
      float n = hash(vec2(band, floor(uTime * 12.0)));
      float tear = step(1.0 - glitch * 0.55, n);
      uv.x += (n - 0.5) * 0.12 * glitch * tear;
    }

    vec2 base = distort(uv, uBarrel);
    vec3 color;
    if (uChromatic > 0.0) {
      // Só R e B se separam; o verde fica no lugar porque é onde o olho tem
      // mais resolução e mexer nele parece imagem fora de foco, não lente.
      color.r = texture2D(tDiffuse, distort(uv, uBarrel + uChromatic)).r;
      color.g = texture2D(tDiffuse, base).g;
      color.b = texture2D(tDiffuse, distort(uv, uBarrel - uChromatic)).b;
    } else {
      color = texture2D(tDiffuse, base).rgb;
    }

    // A distorção pode pedir pixel de fora do render target. Ali não existe
    // imagem: preto, como a borda de uma lente.
    vec2 inside = step(vec2(0.0), base) * step(base, vec2(1.0));
    color *= inside.x * inside.y;

    float r = length(vUv - 0.5) * 1.4142;
    color *= mix(1.0, 1.0 - uVignette, smoothstep(0.35, 1.0, r));

    float grain = hash(vUv * uResolution + fract(uTime) * 137.0) - 0.5;
    color += grain * (uNoise + glitch * 0.5);

    // Blocos perdidos: o codec digital falhando em cima do ruído analógico.
    if (glitch > 0.15) {
      vec2 blocks = floor(vUv * vec2(48.0, 27.0));
      float b = hash(blocks + floor(uTime * 9.0));
      if (b < glitch * 0.22) color = vec3(b * 0.65);
    }

    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(lum), glitch * 0.45);

    color = mix(color, uFlashColor, clamp(uFlash, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class FPVPost {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.enabled = quality.settings.post;
    /** Desligável pelo menu, independente do tier. */
    this.userEnabled = true;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      // HalfFloat e não Float: render targets de 32 bits não são filtráveis em
      // boa parte dos iOS e o resultado é tela preta sem erro nenhum.
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uResolution: { value: new THREE.Vector2(size.x, size.y) },
      uTime: { value: 0 },
      uBarrel: { value: CONFIG.CAMERA.barrel },
      uChromatic: { value: CONFIG.CAMERA.chromatic },
      uVignette: { value: CONFIG.CAMERA.vignette },
      uNoise: { value: CONFIG.CAMERA.noise },
      uSignal: { value: 1 },
      uDamage: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(0xffffff) },
    };

    // ShaderMaterial e não RawShaderMaterial: o prefixo que o Three injeta já
    // declara `position`/`uv` e resolve a diferença de GLSL entre WebGL 1 e 2.
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.applyTier(quality.settings);
  }

  /** Liga/desliga cada efeito conforme o tier — sem recompilar o shader. */
  applyTier(settings) {
    this.enabled = settings.post;
    const fx = settings.postEffects;
    const C = CONFIG.CAMERA;
    this.uniforms.uBarrel.value = fx.barrel ? C.barrel : 0;
    this.uniforms.uChromatic.value = fx.chromatic ? C.chromatic : 0;
    this.uniforms.uVignette.value = fx.vignette ? C.vignette : 0;
    this.uniforms.uNoise.value = fx.noise ? C.noise : 0;
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.uniforms.uResolution.value.set(size.x, size.y);
  }

  /** Clarão branco/colorido de tela cheia (passar num gate, tomar impacto). */
  flash(amount = 0.6, color = 0xffffff) {
    this.uniforms.uFlash.value = clamp(amount, 0, 1);
    this.uniforms.uFlashColor.value.setHex(color);
  }

  setSignal(value) {
    this.uniforms.uSignal.value = clamp(value, 0, 1);
  }

  setDamage(value) {
    this.uniforms.uDamage.value = clamp(value, 0, 1);
  }

  render(scene, camera, dt) {
    this.uniforms.uTime.value += dt;
    // O clarão decai sozinho: quem chama `flash()` não precisa lembrar de
    // desligar, e o efeito nunca fica preso aceso.
    this.uniforms.uFlash.value = Math.max(0, this.uniforms.uFlash.value - dt * 3.2);

    const active =
      this.enabled &&
      this.userEnabled &&
      (this.uniforms.uBarrel.value > 0 ||
        this.uniforms.uVignette.value > 0 ||
        this.uniforms.uNoise.value > 0 ||
        this.uniforms.uSignal.value < 1 ||
        this.uniforms.uDamage.value > 0 ||
        this.uniforms.uFlash.value > 0);

    if (!active) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
