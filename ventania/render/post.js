// Pós-processamento:
//   RenderPass → GTAO (só alta) → Bloom suave → OutputPass (ACES + sRGB)
//   → Grading quente (em espaço de exibição, depois do tone map).
// Na qualidade baixa não há composer: o renderer aplica ACES direto.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShadowTint: { value: new THREE.Vector3(0.9, 0.9, 1.14) }, // sombras → roxo/azul
    uHighTint: { value: new THREE.Vector3(1.06, 1.0, 0.9) }, // luzes → dourado
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.04 },
    uLift: { value: 0.025 },
    uVignette: { value: 0.32 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uLift;
    uniform float uVignette;
    uniform float uTime;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // Split toning: sombras frias/roxas, luzes douradas.
      c *= mix(uShadowTint, uHighTint, smoothstep(0.1, 0.75, l));
      // Lift roxo: o preto nunca é preto.
      c = c + uLift * vec3(0.55, 0.45, 0.85) * (1.0 - l);
      c = (c - 0.5) * uContrast + 0.5;
      float l2 = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l2), c, uSaturation);
      // Vinheta suave e quente.
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
      c *= mix(vec3(0.82, 0.74, 0.88), vec3(1.0), mix(1.0, v, uVignette));
      // Grão bem leve (tira o "digital" dos degradês).
      float n = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * 0.012;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.enabled = false;
  }

  build(q, w, h) {
    this.dispose();
    this.enabled = q.post;
    if (!q.post) return;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.msaa });
    const c = (this.composer = new EffectComposer(this.renderer, rt));
    c.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.55;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.5, scale: 1.0, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // A grama (posições no vertex shader), água, céu e nuvens ficam fora do
      // G-buffer do AO: o material de sobrescrita do GTAO não sabe deslocá-los.
      const render = ao.render.bind(ao);
      ao.render = (...args) => {
        const hidden = [];
        this.scene.traverse((o) => {
          if (o.userData.noAO && o.visible) { o.visible = false; hidden.push(o); }
        });
        render(...args);
        for (const o of hidden) o.visible = true;
      };
      c.addPass(ao);
      this.ao = ao;
    }
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.6, 0.92);
      c.addPass(this.bloom);
    }
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.setSize(w, h);
  }

  setSize(w, h) {
    this.composer?.setSize(w, h);
  }

  render(dt) {
    if (this.enabled && this.composer) {
      this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100;
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      for (const p of this.composer.passes) p.dispose?.();
    }
    this.composer = null;
    this.ao = null;
    this.bloom = null;
  }
}
