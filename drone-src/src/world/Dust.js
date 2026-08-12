import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Poeira rasante que vira risco de velocidade.
 *
 * Truque central: as partículas NÃO se movem e nunca são reescritas pela CPU.
 * Elas ficam paradas numa caixa e o shader repete a caixa em torno do drone com
 * um `mod`. Voar para sempre numa direção continua mostrando poeira nova, ao
 * custo de zero atualização por frame — o que importa quando são 900 partículas
 * num iPad.
 *
 * Cada partícula é um segmento de reta: o primeiro vértice fica no lugar, o
 * segundo é puxado pra trás pela velocidade do drone. Parado vira ponto, rápido
 * vira risco — o alongamento é a informação de velocidade, de graça na GPU.
 */

const VERT = /* glsl */ `
  attribute vec3 aBase;
  attribute float aTail;

  uniform vec3  uAnchor;
  uniform vec3  uBox;
  uniform vec3  uVelocity;
  uniform float uStreak;
  uniform float uRadius;

  varying float vFade;

  void main() {
    // Repete a caixa em volta do drone. O mod do GLSL já devolve positivo,
    // então isto funciona pra qualquer distância percorrida.
    vec3 rel = mod(aBase - uAnchor + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 world = uAnchor + rel;

    // A cauda fica pra trás no sentido do movimento.
    world -= uVelocity * uStreak * aTail;

    float dist = length(rel);
    // Some antes de chegar na borda da caixa, senão as partículas piscam ao
    // dar a volta pelo outro lado.
    vFade = 1.0 - smoothstep(uRadius * 0.55, uRadius, dist);

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    if (vFade <= 0.01) discard;
    gl_FragColor = vec4(uColor, vFade * uOpacity);
  }
`;

export class Dust {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;

    this.uniforms = {
      uAnchor: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3() },
      uVelocity: { value: new THREE.Vector3() },
      uStreak: { value: CONFIG.WORLD.dust.streakScale },
      uRadius: { value: CONFIG.WORLD.dust.radius },
      uColor: { value: new THREE.Color(0xc9d4dd) },
      uOpacity: { value: 0.5 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = null;
    this.build();
    quality.onChange(() => this.build());
  }

  build() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    const count = this.quality.settings.dustCount;
    const D = CONFIG.WORLD.dust;
    const boxXZ = D.radius * 2;
    const boxY = D.maxHeight;
    this.uniforms.uBox.value.set(boxXZ, boxY, boxXZ);

    const base = new Float32Array(count * 2 * 3);
    const tail = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * boxXZ;
      const y = (Math.random() - 0.5) * boxY;
      const z = (Math.random() - 0.5) * boxXZ;
      // Os dois vértices do segmento nascem no MESMO ponto; quem os separa é o
      // deslocamento por velocidade no shader.
      for (let v = 0; v < 2; v++) {
        base[(i * 2 + v) * 3] = x;
        base[(i * 2 + v) * 3 + 1] = y;
        base[(i * 2 + v) * 3 + 2] = z;
        tail[i * 2 + v] = v;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    geometry.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    // `position` não é usado pelo shader, mas o Three exige o atributo pra
    // calcular contagem de vértices e bounding.
    geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));

    this.mesh = new THREE.LineSegments(geometry, this.material);
    this.mesh.frustumCulled = false; // a caixa acompanha o drone; culling erraria
    this.scene.add(this.mesh);
  }

  /**
   * @param {THREE.Vector3} position  posição do drone
   * @param {THREE.Vector3} velocity  velocidade atual
   * @param {number} groundY          altura do terreno sob o drone
   */
  update(position, velocity, groundY) {
    const D = CONFIG.WORLD.dust;
    // A caixa fica ancorada no CHÃO, não no drone: subindo, o drone sai da
    // camada de poeira em vez de levá-la junto — que é o que denuncia altura.
    this.uniforms.uAnchor.value.set(position.x, groundY + D.maxHeight * 0.5, position.z);
    this.uniforms.uVelocity.value.copy(velocity);

    // Longe do chão não há poeira nenhuma pra levantar.
    const agl = position.y - groundY;
    const fade = Math.max(0, 1 - agl / D.maxHeight);
    this.uniforms.uOpacity.value = 0.5 * fade;
    this.mesh.visible = fade > 0.02;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
