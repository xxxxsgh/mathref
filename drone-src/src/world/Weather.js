import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/MathUtils.js';

/**
 * Clima e hora do dia.
 *
 * O critério da fase é que voar à noite com chuva seja uma MISSÃO diferente, e
 * não a mesma com um filtro por cima. Por isso cada preset mexe em quatro
 * coisas ao mesmo tempo — o que o piloto vê, o quanto o ar empurra, o quanto o
 * drone pesa e o quanto ele enxerga adiante:
 *
 * - Chuva: bruma curta, gotas na frente da lente, peso extra (água no chassi) e
 *   vento médio. Voar rápido fica arriscado porque a visibilidade não acompanha.
 * - Névoa: visibilidade curtíssima com ar parado. O oposto da chuva — dá pra
 *   voar rápido, se você tiver decorado o caminho.
 * - Vento forte: visibilidade cheia e rajadas direcionais fortes. Todo o
 *   trabalho é de correção, não de navegação.
 * - Noite: o mundo some além do farol do drone; as luzes do cenário viram a
 *   única referência.
 *
 * O ciclo dia/noite é POR MISSÃO, não global: um relógio andando no mundo todo
 * faria o jogador esperar a hora certa pra jogar o que quer, que é o oposto de
 * "mais uma tentativa".
 */

export const WEATHER_PRESETS = {
  limpo: {
    name: 'Limpo',
    fogScale: 1,
    windScale: 1,
    massScale: 1,
    rain: 0,
    light: 1,
    sky: null,
  },
  chuva: {
    name: 'Chuva',
    fogScale: 0.42,
    windScale: 1.5,
    // Água encharcando o chassi: o drone fica mais pesado e mais lento pra
    // corrigir. É pouco, mas é sentido nas curvas apertadas.
    massScale: 1.09,
    rain: 1,
    light: 0.52,
    sky: { horizon: 0x9aa4ab, zenith: 0x4a5a68, sunIntensity: 0.25 },
  },
  nevoa: {
    name: 'Névoa',
    fogScale: 0.22,
    windScale: 0.35,
    massScale: 1,
    rain: 0,
    light: 0.72,
    sky: { horizon: 0xc3c9cc, zenith: 0x8fa0ad, sunIntensity: 0.1 },
  },
  vento: {
    name: 'Vento forte',
    fogScale: 1.15,
    windScale: 2.6,
    massScale: 1,
    rain: 0,
    light: 0.9,
    sky: { horizon: 0xb9c2c8, zenith: 0x53789c, sunIntensity: 0.7 },
  },
  noite: {
    name: 'Noite',
    fogScale: 0.6,
    windScale: 0.8,
    massScale: 1,
    rain: 0,
    light: 0.12,
    sky: { horizon: 0x1b2430, zenith: 0x070b12, sunIntensity: 0.04 },
  },
};

/**
 * Chuva com o mesmo truque da poeira: partículas paradas, caixa repetida em
 * volta do drone pelo shader. Custo por frame: dois uniforms.
 */
const RAIN_VERT = /* glsl */ `
  attribute vec3 aBase;
  attribute float aTail;
  uniform vec3  uAnchor;
  uniform vec3  uBox;
  uniform vec3  uFall;
  uniform float uLength;
  varying float vFade;

  void main() {
    vec3 rel = mod(aBase - uAnchor + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 world = uAnchor + rel;
    world -= uFall * uLength * aTail;
    vFade = 1.0 - smoothstep(uBox.x * 0.25, uBox.x * 0.5, length(rel.xz));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RAIN_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    if (vFade <= 0.01) discard;
    gl_FragColor = vec4(0.72, 0.79, 0.88, vFade * uOpacity);
  }
`;

export class Weather {
  constructor(scene, world, quality) {
    this.scene = scene;
    this.world = world;
    this.quality = quality;

    this.preset = WEATHER_PRESETS.limpo;
    this.target = this.preset;
    /** Interpola entre presets pra troca não dar corte seco. */
    this.blend = { fogScale: 1, windScale: 1, massScale: 1, rain: 0, light: 1 };

    this._buildRain();

    // Farol do drone: só serve de noite, mas fica sempre montado — criar e
    // destruir luz em tempo de execução recompila shaders no Three.
    this.headlight = new THREE.SpotLight(0xfff0d8, 0, 90, Math.PI / 5, 0.45, 1.1);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);
  }

  _buildRain() {
    const count = Math.round(this.quality.settings.dustCount * 1.6);
    const box = new THREE.Vector3(60, 46, 60);

    const base = new Float32Array(count * 2 * 3);
    const tail = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * box.x;
      const y = (Math.random() - 0.5) * box.y;
      const z = (Math.random() - 0.5) * box.z;
      for (let v = 0; v < 2; v++) {
        base[(i * 2 + v) * 3] = x;
        base[(i * 2 + v) * 3 + 1] = y;
        base[(i * 2 + v) * 3 + 2] = z;
        tail[i * 2 + v] = v;
      }
    }

    this.rainUniforms = {
      uAnchor: { value: new THREE.Vector3() },
      uBox: { value: box },
      uFall: { value: new THREE.Vector3(0, -1, 0) },
      uLength: { value: 1.8 },
      uOpacity: { value: 0 },
    };

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    geometry.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));

    this.rain = new THREE.LineSegments(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        uniforms: this.rainUniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  /** Troca de clima. `instant` pula a transição (usado ao começar missão). */
  set(id, instant = false) {
    this.target = WEATHER_PRESETS[id] ?? WEATHER_PRESETS.limpo;
    this.presetId = id;
    if (instant) {
      for (const key of Object.keys(this.blend)) this.blend[key] = this.target[key];
      this._applySky();
    }
    return this.target;
  }

  _applySky() {
    if (this.target.sky) {
      this.world.setAtmosphere(this.target.sky);
    } else {
      // Sem paleta própria: devolve o controle pra zona (Fase 3).
      this.world._atmosphereClock = 0;
    }
  }

  update(dt, dronePosition, droneQuaternion, wind) {
    // Transição de ~1,5 s: o clima mudando na cara do jogador em um frame
    // parece bug, e mudando devagar demais parece que não mudou.
    for (const key of Object.keys(this.blend)) {
      this.blend[key] = damp(this.blend[key], this.target[key], 0.45, dt);
    }
    if (this.target.sky && Math.abs(this.blend.light - this.target.light) > 0.01) this._applySky();

    // Bruma: multiplica o alcance que a zona já definiu.
    if (this.scene.fog) {
      const reach = this.quality.settings.viewChunks * CONFIG.WORLD.chunkSize;
      this.scene.fog.near = reach * 0.35 * this.blend.fogScale;
      this.scene.fog.far = reach * 0.95 * this.blend.fogScale;
    }

    this.world.hemi.intensity = 1.55 * this.blend.light;
    this.world.sun.intensity = 2.0 * this.blend.light;

    // Chuva cai inclinada pelo vento — chuva reta com vento forte na tela
    // denuncia na hora que são dois sistemas que não conversam.
    const opacity = this.blend.rain * 0.55;
    this.rain.visible = opacity > 0.02;
    if (this.rain.visible) {
      this.rainUniforms.uAnchor.value.copy(dronePosition);
      this.rainUniforms.uFall.value.set(-wind.vector.x * 0.12, -1, -wind.vector.z * 0.12).normalize();
      this.rainUniforms.uOpacity.value = opacity;
    }

    // Farol: acende conforme escurece e aponta pra onde o drone olha.
    const nightness = 1 - this.blend.light;
    this.headlight.intensity = nightness > 0.35 ? nightness * CONFIG.WEATHER.headlightIntensity : 0;
    if (this.headlight.intensity > 0) {
      this.headlight.position.copy(dronePosition);
      this.headlight.target.position
        .set(0, 0, -30)
        .applyQuaternion(droneQuaternion)
        .add(dronePosition);
      this.headlight.target.updateMatrixWorld();
    }
  }

  /** Escalas que o clima impõe ao voo. */
  get massScale() {
    return this.blend.massScale;
  }

  get windScale() {
    return this.blend.windScale;
  }

  /** Alcance de visão atual — a descoberta de POIs usa isto. */
  visibility() {
    return (this.scene.fog?.far ?? 900) * 0.9;
  }

  dispose() {
    this.scene.remove(this.rain);
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.scene.remove(this.headlight);
  }
}
