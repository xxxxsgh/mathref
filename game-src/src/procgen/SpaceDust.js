import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { wrapSymmetric, damp } from '../core/MathUtils.js';

/**
 * Poeira espacial — partículas que dão referência de movimento.
 *
 * ═══ POR QUE ISSO EXISTE ═══
 *
 * Voar no vazio com um skybox no infinito NÃO tem sensação de velocidade
 * nenhuma. O céu está a distância infinita, então ele não sofre paralaxe: a
 * 300 u/s a tela fica exatamente igual a 0 u/s. O jogo parece travado.
 *
 * A solução clássica é povoar o espaço próximo com partículas quase invisíveis
 * que passam voando. É provavelmente o efeito com melhor relação
 * custo/sensação do projeto inteiro: ~2600 pontos num único draw call.
 *
 * ═══ COMO O WRAP FUNCIONA ═══
 *
 * As partículas vivem num cubo CENTRADO NA NAVE. Quando a nave se move, cada
 * partícula que sai por um lado do cubo reaparece do lado oposto. Assim 2600
 * partículas cobrem espaço infinito, e nunca precisamos criar ou destruir
 * nada. Isso é feito na CPU porque o wrap depende da posição da nave, mas são
 * ~2600 comparações por frame — irrelevante perto de qualquer custo de GPU.
 */
export class SpaceDust {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.geometry = null;
    this.points = null;
    this.material = null;
    this.count = 0;
    this._opacity = 0;
    this._center = new THREE.Vector3();
    this._rng = createRng(CONFIG.world.seed + ':dust');
  }

  /** (Re)cria o buffer de partículas para um tier de qualidade. */
  setQuality(tier) {
    const count = CONFIG.dust.count[tier.dust];
    if (count === this.count && this.points) return;
    this._build(count);
  }

  _build(count) {
    this.dispose();
    this.count = count;

    const half = CONFIG.dust.boxSize * 0.5;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const rng = this._rng;

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (rng() * 2 - 1) * half;
      positions[i * 3 + 1] = (rng() * 2 - 1) * half;
      positions[i * 3 + 2] = (rng() * 2 - 1) * half;
      // Tamanhos variados: partículas grandes leem como "perto" e criam
      // paralaxe percebida mesmo todas estando no mesmo cubo.
      scales[i] = 0.45 + rng() * rng() * 1.9;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    // Frustum culling desligado: a bounding box seria recalculada toda vez que
    // mexemos nas posições, e o objeto está sempre em volta da câmera de
    // qualquer forma. Deixar ligado só gastaria CPU pra nunca descartar nada.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CONFIG.dust.boxSize);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: CONFIG.dust.size },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(CONFIG.dust.color) },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aScale;
        uniform float uSize;
        uniform float uPixelRatio;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // Atenuação por distância: gl_PointSize é em PIXELS, então dividir
          // pela distância em espaço de visão é o que faz a partícula se
          // comportar como um objeto 3D e não como um pixel fixo na tela.
          float dist = max(0.001, -mv.z);
          gl_PointSize = uSize * aScale * uPixelRatio * (300.0 / dist);
          // Some perto da câmera: uma partícula colada na lente vira um borrão
          // gigante e denuncia o truque.
          vFade = smoothstep(2.0, 14.0, dist) * smoothstep(160.0, 90.0, dist);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          // gl_PointCoord vai de 0 a 1 dentro do quad do ponto. Distância ao
          // centro dá um disco suave sem precisar de textura.
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d));
          gl_FragColor = vec4(uColor, a * vFade * uOpacity);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);
  }

  setPixelRatio(r) {
    if (this.material) this.material.uniforms.uPixelRatio.value = r;
  }

  /** @param {THREE.Vector3} shipPos @param {number} speed @param {number} dt */
  update(shipPos, speed, dt) {
    if (!this.points) return;

    const half = CONFIG.dust.boxSize * 0.5;
    const pos = this.geometry.attributes.position;
    const arr = pos.array;

    // Deslocamento da nave desde o último frame. As partículas são estáticas
    // no mundo, então basta mover o OBJETO junto com a nave e envolver as
    // posições locais que saíram do cubo.
    const dx = shipPos.x - this._center.x;
    const dy = shipPos.y - this._center.y;
    const dz = shipPos.z - this._center.z;
    this._center.copy(shipPos);
    this.points.position.copy(shipPos);

    if (dx || dy || dz) {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 0] = wrapSymmetric(arr[i + 0] - dx, half);
        arr[i + 1] = wrapSymmetric(arr[i + 1] - dy, half);
        arr[i + 2] = wrapSymmetric(arr[i + 2] - dz, half);
      }
      pos.needsUpdate = true;
    }

    // Fade por velocidade: parado, a poeira estática em volta da nave só
    // polui a tela. Ela só interessa quando comunica movimento.
    const target =
      speed > CONFIG.dust.speedFadeIn ? CONFIG.dust.opacity : 0;
    this._opacity = damp(this._opacity, target, 3.5, dt);
    this.material.uniforms.uOpacity.value = this._opacity;
  }

  dispose() {
    if (this.points) this.scene.remove(this.points);
    this.geometry?.dispose();
    this.material?.dispose();
    this.points = null;
    this.geometry = null;
    this.material = null;
  }
}
