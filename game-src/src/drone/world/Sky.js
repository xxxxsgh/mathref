import * as THREE from 'three';
import { DCFG } from '../config.js';

/**
 * Céu: uma cúpula com gradiente, sol e nuvens em shader.
 *
 * ═══ POR QUE SHADER E NÃO CUBEMAP ═══
 *
 * O jogo de nave gera um cubemap do céu estrelado uma vez e o usa como
 * background — a escolha certa lá, porque estrelas são estáticas e o custo é
 * pago uma vez.
 *
 * Aqui o céu tem que MEXER: as nuvens andam, e o horizonte é a referência de
 * atitude do piloto em FPV. Um cubemap regenerado custaria 100–300 ms por
 * atualização; um shader de gradiente custa um punhado de instruções por
 * pixel e é o mesmo pixel que já seria pintado de qualquer jeito.
 *
 * ═══ AS NUVENS SÃO O INSTRUMENTO MAIS IMPORTANTE ═══
 *
 * Sem nada no céu, um piloto em FPV inclinado 40° não tem como saber se está
 * inclinado — o céu é uma cor chapada em qualquer atitude. As nuvens dão
 * TEXTURA ao céu, e textura é o que torna a rotação visível. É por isso que
 * elas existem aqui, e não por serem bonitas.
 */

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  // A direção no espaço do MUNDO é o que o fragmento precisa: a cúpula
  // acompanha a câmera, então a posição local já É a direção de visada.
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;

varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;

// Ruído de valor 2D, a mesma família do usado na CPU. Duas dimensões bastam:
// as nuvens vivem num plano.
float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.07; a *= 0.5; }
  return s;
}

void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  // Expoente < 1 alarga a faixa clara junto ao horizonte. Um gradiente
  // linear coloca o meio-tom na altura errada e o céu parece pintado.
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));

  // ── Sol ──────────────────────────────────────────────────────────────
  float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  // Disco com borda suave + halo largo. O halo é o que integra o sol ao céu;
  // sem ele fica um adesivo redondo.
  col += uSunColor * pow(sd, 1400.0) * 12.0;
  col += uSunColor * pow(sd, 12.0) * 0.30;

  // ── Nuvens ───────────────────────────────────────────────────────────
  // Projeção do raio num plano horizontal a uma altura fixa. A divisão por
  // vDir.y é o que dá a perspectiva correta: as nuvens se comprimem em
  // direção ao horizonte sozinhas, sem geometria nenhuma.
  if (vDir.y > 0.015) {
    vec2 uv = vDir.xz / vDir.y * 0.30;
    uv += vec2(uTime * 0.0045, uTime * 0.0022);
    float n = fbm(uv * 1.6);
    // Duas oitavas defasadas dão a borda esgarçada de nuvem real; um
    // smoothstep só produziria manchas de contorno liso.
    float cover = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.22, vDir.y);
    float lit = smoothstep(0.45, 0.85, n);
    vec3 cloud = mix(vec3(0.72, 0.76, 0.83), vec3(1.0, 0.99, 0.96), lit);
    col = mix(col, cloud, cover * 0.82);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    const W = DCFG.world;
    this.sunDir = new THREE.Vector3(...W.sunDirection).normalize();

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uZenith: { value: new THREE.Color(W.skyZenith) },
        uHorizon: { value: new THREE.Color(W.skyHorizon) },
        uSunDir: { value: this.sunDir },
        uSunColor: { value: new THREE.Color(W.sunColor) },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      // Sem profundidade: a cúpula é o fundo de tudo. Escrever no depth
      // buffer a colocaria em competição com a geometria distante e
      // produziria recorte no horizonte quando o `far` da câmera mudasse.
      depthWrite: false,
      fog: false,
    });

    const geo = new THREE.SphereGeometry(1, 32, 20);
    this.mesh = new THREE.Mesh(geo, this.material);
    // Escala fixa e um pouco menor que o `far`: a cúpula é reposicionada na
    // câmera todo frame, então o raio absoluto não importa — só precisa ser
    // maior que qualquer geometria e caber no frustum.
    this.mesh.scale.setScalar(DCFG.world.far * 0.42);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this._time = 0;
  }

  /** @param {THREE.Vector3} cameraPosition */
  update(cameraPosition, dt) {
    this._time += dt;
    this.material.uniforms.uTime.value = this._time;
    // A cúpula acompanha a câmera: é o que a faz parecer infinitamente
    // distante. Sem isso, voar 900 metros para o norte sairia por baixo dela.
    this.mesh.position.copy(cameraPosition);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
