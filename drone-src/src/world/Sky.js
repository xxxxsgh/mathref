import * as THREE from 'three';

/**
 * Céu em gradiente, desenhado numa esfera invertida.
 *
 * Uma cor sólida de fundo funcionaria, mas o gradiente dá horizonte — e sem
 * horizonte visível a inclinação do drone não é legível, que é justamente o que
 * a Fase 1 pede pra dar de graça sem HUD.
 *
 * A esfera acompanha a câmera e não tem profundidade, então não importa o
 * tamanho do mundo: ela nunca é alcançada nem entra no cálculo de fog.
 */
const VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3  uHorizon;
  uniform vec3  uZenith;
  uniform vec3  uGround;
  uniform vec3  uSunDirection;
  uniform vec3  uSunColor;
  uniform float uSunIntensity;

  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);

    // Abaixo do horizonte não é céu: é a bruma sobre o chão, que fecha o mundo
    // quando o drone olha pra baixo além do último chunk carregado.
    float up = dir.y;
    vec3 color = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, up));
    color = mix(uGround, color, smoothstep(-0.12, 0.02, up));

    // Halo do sol: exponente alto pra virar disco com brilho, não mancha.
    float sun = max(dot(dir, normalize(uSunDirection)), 0.0);
    color += uSunColor * pow(sun, 220.0) * uSunIntensity;
    color += uSunColor * pow(sun, 8.0) * 0.09 * uSunIntensity;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uHorizon: { value: new THREE.Color(0xbccedb) },
      uZenith: { value: new THREE.Color(0x5386b8) },
      uGround: { value: new THREE.Color(0x2a3038) },
      uSunDirection: { value: new THREE.Vector3(0.4, 0.55, 0.72).normalize() },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uSunIntensity: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.material);
    // Sem depth test, a ordem é que decide: `renderOrder` negativo garante que
    // o céu seja o primeiro a pintar e todo o resto vá por cima.
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Cores por zona/clima/hora. Todos os campos são opcionais. */
  setPalette({ horizon, zenith, ground, sunColor, sunIntensity } = {}) {
    if (horizon !== undefined) this.uniforms.uHorizon.value.set(horizon);
    if (zenith !== undefined) this.uniforms.uZenith.value.set(zenith);
    if (ground !== undefined) this.uniforms.uGround.value.set(ground);
    if (sunColor !== undefined) this.uniforms.uSunColor.value.set(sunColor);
    if (sunIntensity !== undefined) this.uniforms.uSunIntensity.value = sunIntensity;
  }

  setSunDirection(vector) {
    this.uniforms.uSunDirection.value.copy(vector).normalize();
  }

  /** Cor do horizonte — o fog usa a mesma, senão a bruma "recorta" contra o céu. */
  get horizonColor() {
    return this.uniforms.uHorizon.value;
  }

  update(cameraPosition) {
    this.mesh.position.copy(cameraPosition);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
