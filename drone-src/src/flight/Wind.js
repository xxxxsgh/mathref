import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { asRadians } from '../config.js';
import { smoothstep } from '../core/MathUtils.js';

/**
 * Vento: uma componente constante mais rajadas.
 *
 * As rajadas são somas de senóides com frequências em razão irracional entre
 * si. O padrão nunca se repete de forma audível/visível, custa três `sin` por
 * frame e — ao contrário de ruído aleatório por frame — é contínuo, então não
 * chacoalha o drone com impulsos descorrelacionados.
 */
export class Wind {
  constructor() {
    this.time = 0;
    this.vector = new THREE.Vector3();
    /** Intensidade da rajada agora, 0..1 — a HUD e o áudio mostram isso. */
    this.gust = 0;
    /** Fontes de turbulência local (penhascos, estruturas, térmicas). */
    this.sources = [];

    this._tmp = new THREE.Vector3();
  }

  /** Multiplicador por zona/clima, ajustado pelas Fases 3 e 6. */
  setScale(scale = 1, directionDeg = null) {
    this.scale = scale;
    if (directionDeg !== null) this.directionDeg = directionDeg;
  }

  update(dt) {
    const W = CONFIG.WIND;
    this.time += dt;
    if (!W.enabled) {
      this.vector.set(0, 0, 0);
      this.gust = 0;
      return;
    }

    const scale = this.scale ?? 1;
    const dir = asRadians(this.directionDeg ?? W.directionDeg);
    const t = this.time * W.gustFrequency * Math.PI * 2;

    // Três harmônicos incomensuráveis: período efetivo longo o bastante pra
    // não dar pra decorar.
    const gust =
      0.55 * Math.sin(t) + 0.3 * Math.sin(t * 2.317 + 1.7) + 0.15 * Math.sin(t * 5.113 + 4.1);
    this.gust = (gust + 1) * 0.5;

    const speed = (W.baseSpeed + this.gust * W.gustAmplitude) * scale;
    this.vector.set(Math.sin(dir) * speed, 0, Math.cos(dir) * speed);

    // Componente vertical pequena: é o que dá a sensação de ar mexido em vez
    // de um ventilador apontado de lado.
    this.vector.y = Math.sin(t * 1.61 + 0.9) * W.gustAmplitude * 0.16 * scale;
  }

  /**
   * Vento no ponto pedido = vento global + turbulência das fontes próximas.
   * Térmicas (Fase 6) entram como fontes de componente vertical positiva.
   */
  sample(position, out = new THREE.Vector3()) {
    out.copy(this.vector);
    if (!CONFIG.WIND.enabled) return out;

    for (const source of this.sources) {
      const dist = this._tmp.subVectors(position, source.position).length();
      if (dist > source.radius) continue;
      const falloff = 1 - smoothstep(source.radius * 0.25, source.radius, dist);
      if (source.type === 'thermal') {
        out.y += source.strength * falloff;
      } else {
        // Turbulência: empurrão radial oscilante, pra fora da estrutura.
        const phase = this.time * 2.4 + source.phase;
        const push = Math.sin(phase) * source.strength * falloff;
        this._tmp.normalize().multiplyScalar(push);
        out.add(this._tmp);
      }
    }
    return out;
  }

  addSource(position, { type = 'turbulence', radius, strength, phase = 0 } = {}) {
    const source = {
      position: position.clone(),
      type,
      radius: radius ?? CONFIG.WIND.turbulenceRadius,
      strength: strength ?? CONFIG.WIND.turbulenceStrength,
      phase,
    };
    this.sources.push(source);
    return source;
  }

  clearSources() {
    this.sources.length = 0;
  }
}
