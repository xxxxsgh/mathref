import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createShip, getGlowTexture } from './ShipModel.js';
import { FlightModel } from '../systems/FlightModel.js';
import { damp, clamp } from '../core/MathUtils.js';

/**
 * A nave do jogador: junta o modelo de voo (estado/física) com a
 * representação visual (malha, chamas de motor, rastro).
 *
 * Separação proposital: `FlightModel` não sabe que existe Three.js além dos
 * tipos de vetor. Isso mantém o feel de voo testável e ajustável sem mexer em
 * nada gráfico — e na Fase 2 os inimigos reaproveitam o mesmo modelo de voo.
 */
export class Ship {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.flight = new FlightModel();

    const built = createShip();
    this.object = built.group;
    // Escala global do modelo. Ajustar aqui é mais simples que reequilibrar
    // as dezenas de dimensões das primitivas em ShipModel.js.
    built.group.scale.setScalar(1.25);
    this.mesh = built.mesh;
    this._disposeModel = built.dispose;
    scene.add(this.object);

    // ── Chamas de motor ──────────────────────────────────────────────────────────────
    // Duas peças por bocal:
    //  - um sprite de brilho (sempre virado pra câmera) = o núcleo quente
    //  - um plano esticado ao longo de -Z = o rastro direcional
    // Ambos aditivos: cores se somam ao fundo, que é como luz se comporta.
    const glowTex = getGlowTexture();
    this.flameMaterial = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x66f0ff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.trailMaterial = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0x3ad9ff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.flames = [];
    this.trails = [];
    for (const n of built.nozzles) {
      const sprite = new THREE.Sprite(this.flameMaterial);
      sprite.position.copy(n).add(new THREE.Vector3(0, 0, 0.28));
      sprite.scale.setScalar(1.1);
      this.object.add(sprite);
      this.flames.push(sprite);

      // Dois planos cruzados em X fingem volume com 2 quads em vez de um cone
      // de verdade. O truque só funciona com blending aditivo, senão a
      // interseção dos planos aparece.
      const pair = [];
      for (let i = 0; i < 2; i++) {
        const geo = new THREE.PlaneGeometry(0.85, 1, 1, 1);
        // Move o pivô pra borda do plano: assim escalar em Y cresce o rastro
        // PRA TRÁS a partir do bocal, em vez de crescer pros dois lados.
        geo.translate(0, 0.5, 0);
        const m = new THREE.Mesh(geo, this.trailMaterial);
        // +90° em X leva o +Y do plano para o +Z do objeto, que é PRA TRÁS
        // (a frente da nave é -Z). O segundo plano recebe 90° extra em Y pra
        // ficar perpendicular ao primeiro.
        m.rotation.x = Math.PI / 2;
        m.rotation.y = (i * Math.PI) / 2;
        m.position.copy(n).add(new THREE.Vector3(0, 0, 0.3));
        this.object.add(m);
        pair.push(m);
      }
      this.trails.push(pair);
    }

    this._trailLength = CONFIG.ship.trailLengthBase;
    this._glow = CONFIG.ship.engineGlowMin;
    /** Inclinação visual acumulada (radianos). Ver _updateBank. */
    this._bank = 0;
    this._bankPitch = 0;
  }

  get position() { return this.flight.position; }
  get quaternion() { return this.flight.quaternion; }
  get speed() { return this.flight.speed; }

  /** @param {import('../core/Input.js').ControlState} input @param {number} dt */
  update(input, dt) {
    this.flight.update(input, dt);

    // A malha copia a transformação do modelo de voo. É aqui, e só aqui, que
    // o estado de física vira estado de cena.
    this.object.position.copy(this.flight.position);
    this.object.quaternion.copy(this.flight.quaternion);

    this._updateBank(input, dt);
    this._updateEngines(dt);
  }

  /**
   * Inclinação da nave para dentro da curva.
   *
   * ═══ POR QUE SÓ A MALHA, E NÃO O VOO ═══
   *
   * A tentação é rolar o quaternion de voo de verdade. Não dá: isso gira os
   * EIXOS DE CONTROLE junto. Depois de inclinar 40°, o comando de "cabrar"
   * do jogador passaria a apontar 40° para o lado, e ele perderia a noção de
   * onde é para cima. É desorientador e, pior, imprevisível.
   *
   * Inclinar apenas a malha dá toda a leitura visual — a nave "deita" na
   * curva, como um caça — sem tocar em nada da física. É o mesmo truque do
   * Star Fox, e a razão de ele funcionar lá.
   */
  _updateBank(input, dt) {
    const F = CONFIG.flight;
    // Durante o barrel roll a malha não deve inclinar: a manobra já é uma
    // rotação completa e somar inclinação a ela vira tremor.
    const target = this.flight.maneuver.active ? 0 : -input.yaw * F.autoBank;
    const targetPitch = this.flight.maneuver.active ? 0 : input.pitch * F.autoBankPitch;
    this._bank = damp(this._bank, target, F.autoBankLambda, dt);
    this._bankPitch = damp(this._bankPitch, targetPitch, F.autoBankLambda, dt);
    this.mesh.rotation.z = this._bank;
    this.mesh.rotation.x = this._bankPitch;
  }

  _updateEngines(dt) {
    const S = CONFIG.ship;
    const f = this.flight;

    // Intensidade do motor = acelerador, com piso (motor nunca apaga) e teto
    // no boost. O freio apaga quase tudo, o que dá leitura visual imediata.
    let target = S.engineGlowMin + f.throttle * (S.engineGlowMax - S.engineGlowMin);
    if (f.boosting) target = S.engineGlowMax * 1.55;
    if (f.braking) target = S.engineGlowMin * 0.45;
    this._glow = damp(this._glow, target, 9, dt);

    const targetLen = f.boosting
      ? S.trailLengthBoost
      : S.trailLengthBase * (0.35 + f.throttle * 1.1);
    this._trailLength = damp(this._trailLength, targetLen, S.trailLambda, dt);

    const g = clamp(this._glow, 0, 2.2);
    for (const s of this.flames) {
      // Pulsação leve e dessincronizada por bocal, pra não parecer um LED.
      s.scale.setScalar(0.75 + g * 0.95);
    }
    this.flameMaterial.opacity = clamp(g * 0.85, 0, 1);

    for (const pair of this.trails) {
      for (const m of pair) {
        m.scale.set(0.55 + g * 0.55, this._trailLength, 1);
      }
    }
    this.trailMaterial.opacity = clamp(g * 0.5, 0, 0.85);
  }

  dispose() {
    this.scene.remove(this.object);
    this._disposeModel();
    this.flameMaterial.dispose();
    this.trailMaterial.dispose();
    for (const pair of this.trails) for (const m of pair) m.geometry.dispose();
  }
}
