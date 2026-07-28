import * as THREE from 'three';
import { LAYER_NEAR } from '../core/Renderer.js';

/**
 * Domo de céu atmosférico.
 *
 * ═══ O PROBLEMA ═══
 *
 * `scene.background` é o cubemap estelar. Ele é correto no espaço e errado no
 * chão: voando a 100 unidades de altitude num planeta com atmosfera, o céu
 * continuava sendo campo de estrelas — a sensação era de estar numa lua sem
 * ar, não dentro de uma atmosfera.
 *
 * Trocar `scene.background` por uma cor resolveria, mas a troca é abrupta:
 * não dá pra interpolar entre uma textura e uma cor.
 *
 * ═══ A SOLUÇÃO ═══
 *
 * Uma esfera grande, centrada NA CÂMERA, desenhada por dentro, com opacidade
 * igual à densidade atmosférica. Ela some por cima do campo de estrelas de
 * forma contínua durante a descida, e as estrelas voltam a aparecer conforme
 * se sobe. Custo: um draw call e nenhum teste de profundidade.
 *
 * O gradiente vertical (horizonte claro, zênite escuro) é o que mais
 * contribui pra leitura de "estou dentro de uma atmosfera", mais até que a
 * cor em si — é o mesmo motivo pelo qual o céu real clareia perto do chão.
 */
export class SkyDome {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;

    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      // ⚠ `depthTest` TEM que ficar ligado. O Three renderiza toda a fila de
      // objetos transparentes DEPOIS da fila de opacos, independentemente de
      // `renderOrder` — então um domo transparente sem teste de profundidade
      // pinta por cima do terreno, da nave e de tudo mais, e a tela inteira
      // vira a cor do céu. Com o teste ligado, o domo (a 6000 unidades) é
      // descartado onde houver qualquer geometria mais próxima, e só aparece
      // onde de fato há céu.
      depthTest: true,
      // `fog: false` é essencial: o domo É o céu, então aplicar névoa nele
      // faria a névoa se colorir com ela mesma, num laço visual esquisito.
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x1b3a6b) },
        uHorizon: { value: new THREE.Color(0x8fb8e0) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xffd9a0) },
        uOpacity: { value: 0 },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uUp;
        uniform float uOpacity;

        void main() {
          vec3 d = normalize(vDir);
          // Altura angular acima do horizonte, 0..1.
          float h = clamp(dot(d, normalize(uUp)) * 0.5 + 0.5, 0.0, 1.0);
          // Expoente > 1 concentra o clareamento perto do horizonte, que é
          // como o espalhamento atmosférico de fato se comporta.
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

          // Halo solar: a estrela vista de dentro da atmosfera espalha luz
          // num cone largo. Sem isso o céu fica chapado e sem direção.
          float sd = max(0.0, dot(d, normalize(uSunDir)));
          col += uSunColor * pow(sd, 8.0) * 0.55;
          col += uSunColor * pow(sd, 220.0) * 3.0;

          gl_FragColor = vec4(col, uOpacity);
        }
      `,
    });

    // Raio grande, mas bem dentro do plano `far` da faixa próxima. Como o
    // domo acompanha a câmera e não escreve profundidade, o valor exato só
    // precisa ser maior que qualquer geometria próxima.
    const geo = new THREE.SphereGeometry(6000, 24, 16);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.geometry = geo;
    this.mesh.frustumCulled = false;
    // Primeiro da fila de transparentes: o céu vem antes de rastros de motor,
    // partículas e impactos, que devem aparecer sobre ele.
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    this.mesh.layers.set(LAYER_NEAR);
    scene.add(this.mesh);
  }

  /**
   * @param {THREE.Vector3} cameraPos
   * @param {number} density 0..1
   * @param {THREE.Vector3} up normal da superfície
   * @param {THREE.Vector3} sunDir direção da estrela
   * @param {number} atmosphereColor cor da atmosfera do planeta
   */
  update(cameraPos, density, up, sunDir, atmosphereColor) {
    const visible = density > 0.004;
    this.mesh.visible = visible;
    if (!visible) return;

    // O domo acompanha a câmera: ele representa o infinito, então nunca deve
    // parecer que a nave se aproxima da "parede" dele.
    this.mesh.position.copy(cameraPos);

    const u = this.material.uniforms;
    u.uOpacity.value = Math.min(1, density * 1.25);
    u.uUp.value.copy(up);
    u.uSunDir.value.copy(sunDir);
    u.uHorizon.value.setHex(atmosphereColor);
    // Zênite = a mesma cor, mais escura e dessaturada. Derivar em vez de
    // configurar garante que qualquer paleta de planeta produza um céu
    // coerente sem ajuste manual.
    u.uZenith.value.setHex(atmosphereColor).multiplyScalar(0.28).offsetHSL(0, -0.15, 0);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
