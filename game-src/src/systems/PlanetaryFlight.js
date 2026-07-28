import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, smoothstep } from '../core/MathUtils.js';

/**
 * Voo planetário: gravidade, entrada atmosférica, colisão com o solo e pouso.
 *
 * ═══ A TRANSIÇÃO SEM TELA DE CARREGAMENTO ═══
 *
 * O pedido era voar do espaço até a superfície sem corte. O que torna isso
 * possível não é nenhum truque de carregamento — é o fato de o terreno ser
 * gerado por função. Não há nada pra baixar: `PlanetSurface` calcula os
 * chunks à medida que eles entram no alcance, com orçamento por frame.
 *
 * O que a transição precisa, então, é de RITMO. Uma descida que muda de estado
 * de repente parece um teletransporte. Por isso ela é dividida em faixas de
 * altitude, e cada uma acrescenta um efeito:
 *
 *   > entryAltitude          espaço: nada muda
 *   entryAltitude → 0.55×    atmosfera alta: chunks começam a existir
 *   0.55× → 0.2×             reentrada: fricção, calor, tremor, arrasto
 *   < 0.2×                   voo atmosférico: gravidade cheia, arrasto cheio
 *
 * ═══ CALOR DE REENTRADA ═══
 *
 * O calor cresce com velocidade³ × densidade do ar. O cubo (e não o quadrado
 * do arrasto) é intencional: torna a diferença entre "descer devagar" e
 * "mergulhar a 700 u/s" dramática. Descer rápido é possível, mas custa escudo.
 * Isso transforma a reentrada numa decisão em vez de uma animação.
 */
export class PlanetaryFlight {
  constructor() {
    /** @type {import('../entities/Planet.js').Planet|null} */
    this.planet = null;
    this.altitude = Infinity;
    this.groundRadius = 0;
    this.overWater = false;

    /** 0 = espaço, 1 = ao nível do solo. */
    this.atmosphereDensity = 0;
    /** 0..1 — acúmulo de calor de reentrada. */
    this.heat = 0;
    this.landed = false;
    this.landingProgress = 0;
    this.crashed = false;

    this.up = new THREE.Vector3(0, 1, 0);
    this._tmp = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._sample = null;
  }

  get inAtmosphere() { return this.atmosphereDensity > 0.001; }
  get verticalSpeed() { return this._verticalSpeed; }

  /**
   * @param {import('./FlightModel.js').FlightModel} flight
   * @param {import('./PlanetSurface.js').PlanetSurface} surface
   * @param {import('../procgen/SolarSystem.js').SolarSystem} system
   * @param {import('../core/Input.js').ControlState} input
   * @param {number} dt
   * @returns {{ damage: number, crashed: boolean }}
   */
  update(flight, surface, system, input, dt) {
    const S = CONFIG.surface;
    let damage = 0;
    this.crashed = false;

    // ── Planeta mais próximo que aceita pouso ─────────────────────────────
    let nearest = null;
    let nearestAlt = Infinity;
    for (const p of system.planets) {
      if (!p.spec.landable) continue;
      const d = flight.position.distanceTo(p.object.position) - p.radius;
      if (d < nearestAlt) { nearestAlt = d; nearest = p; }
    }

    const entryAlt = nearest ? nearest.radius * S.entryAltitudeFactor : 0;
    const shouldEngage = nearest && nearestAlt < entryAlt;

    if (!shouldEngage) {
      // Saiu da influência do planeta: solta tudo de forma suave.
      if (this.planet) { surface.exit(); this.planet = null; }
      this.atmosphereDensity = damp(this.atmosphereDensity, 0, 3, dt);
      this.heat = damp(this.heat, 0, 0.9, dt);
      this.altitude = Infinity;
      this.landed = false;
      this._verticalSpeed = 0;
      return { damage: 0, crashed: false };
    }

    if (this.planet !== nearest) {
      this.planet = nearest;
      surface.enter(nearest);
    }

    // ── Amostra o terreno sob a nave ──────────────────────────────────────
    const s = surface.sample(flight.position, this.up);
    this.altitude = s.altitude;
    this.groundRadius = s.ground;
    this.overWater = s.isWater;

    // ── Densidade atmosférica ─────────────────────────────────────────────
    // 0 na altitude de entrada, 1 ao nível do solo. A curva é quadrática:
    // o ar "engrossa" devagar no começo e rápido no fim, como de fato ocorre.
    const t = clamp(1 - this.altitude / entryAlt, 0, 1);
    this.atmosphereDensity = t * t;
    const rho = this.atmosphereDensity;

    // ── Gravidade ─────────────────────────────────────────────────────────
    // Só liga junto com a atmosfera, e cresce com ela. Gravidade cheia já na
    // borda da influência puxaria a nave pra baixo sem aviso nenhum, o que o
    // jogador leria como perda de controle.
    const g = this.planet.spec.surfaceGravity * rho;
    flight.velocity.addScaledVector(this.up, -g * dt);

    // ── Arrasto atmosférico ───────────────────────────────────────────────
    // Reduz a velocidade máxima efetiva dentro da atmosfera. É o que faz o
    // voo baixo parecer "denso" em vez de idêntico ao voo no vácuo.
    if (rho > 0.001) {
      flight.velocity.multiplyScalar(Math.exp(-S.airDrag * rho * dt));
    }

    // ── Velocidade vertical (para HUD e pouso) ───────────────────────────
    this._verticalSpeed = flight.velocity.dot(this.up);

    // ── Calor de reentrada ────────────────────────────────────────────────
    const speed = flight.speed;
    // v³·ρ: o expoente cúbico é o que dá peso à decisão de frear antes de
    // entrar. Normalizado pela velocidade de referência pra ficar em 0..1.
    const heating = Math.pow(speed / S.heatReferenceSpeed, 3) * rho * S.heatRate;
    this.heat = clamp(this.heat + (heating - S.heatCooling) * dt, 0, 1.6);
    if (this.heat > 1) {
      damage += (this.heat - 1) * S.heatDamage * dt;
    }

    // ── Colisão com o solo ────────────────────────────────────────────────
    const clearance = S.hullClearance;
    if (this.altitude < clearance) {
      const impactSpeed = -this._verticalSpeed;
      // Empurra a nave pra fora do terreno.
      flight.position.copy(this.planet.object.position)
        .addScaledVector(this.up, this.groundRadius + clearance);

      if (impactSpeed > S.crashSpeed) {
        // Batida: dano proporcional ao excesso de velocidade.
        damage += (impactSpeed - S.crashSpeed) * S.crashDamagePerSpeed;
        this.crashed = true;
        // Quica um pouco, pra a batida ser sentida em vez de só descontar vida.
        const vn = flight.velocity.dot(this.up);
        flight.velocity.addScaledVector(this.up, -vn * 1.4);
        flight.velocity.multiplyScalar(0.45);
      } else {
        // Pouso: zera a componente vertical e freia a horizontal.
        const vn = flight.velocity.dot(this.up);
        if (vn < 0) flight.velocity.addScaledVector(this.up, -vn);
        flight.velocity.multiplyScalar(Math.exp(-S.groundFriction * dt));
      }
    }

    // ── Estado de pouso ───────────────────────────────────────────────────
    // Pousado = perto do chão, devagar, e sem acelerador. Exigir as três
    // condições evita que raspar o solo em alta velocidade conte como pouso.
    const canLand = this.altitude < clearance * S.landingAltitudeFactor
      && flight.speed < S.landingSpeed
      && input.throttle < 0.08;
    if (canLand) {
      this.landingProgress = Math.min(1, this.landingProgress + dt / S.landingTime);
    } else {
      this.landingProgress = Math.max(0, this.landingProgress - dt / (S.landingTime * 0.5));
    }
    this.landed = this.landingProgress >= 1;

    if (this.landed) {
      // Trava a nave: sem isso ela desliza lentamente pelo terreno.
      flight.velocity.multiplyScalar(Math.exp(-8 * dt));
      flight.angularVelocity.multiplyScalar(Math.exp(-6 * dt));
    }

    return { damage, crashed: this.crashed };
  }

  /** Intensidade 0..1 do efeito visual de reentrada. */
  get entryEffect() {
    return clamp(this.heat, 0, 1);
  }
}
