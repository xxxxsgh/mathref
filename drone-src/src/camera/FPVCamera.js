import * as THREE from 'three';
import { CONFIG, asRadians } from '../config.js';
import { clamp, damp, smoothstep } from '../core/MathUtils.js';

/**
 * Câmera FPV: presa na casca do drone, inclinada pra cima como num FPV real.
 *
 * O tilt é o detalhe que mais muda a pilotagem. Com a câmera inclinada, voar
 * rápido exige inclinar o drone pra frente — e a câmera inclinada compensa,
 * mantendo o horizonte na tela. Sem tilt, voar rápido significa olhar pro chão.
 */
export class FPVCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.CAMERA.fovBase,
      aspect,
      CONFIG.CAMERA.near,
      CONFIG.CAMERA.far,
    );

    this.tiltDeg = CONFIG.CAMERA.tiltDeg;
    this.thirdPerson = false;
    this.fov = CONFIG.CAMERA.fovBase;

    /** Amplitude do screen shake, decai sozinha. */
    this.shake = 0;
    /** 1 = imagem limpa; abaixo disso o pós-processamento degrada o feed. */
    this.signal = 1;

    this._pos = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._tiltQuat = new THREE.Quaternion();
    this._shakeQuat = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._chaseTarget = new THREE.Vector3();
    this._chasePos = new THREE.Vector3();
    this._time = 0;
  }

  setTilt(deg) {
    this.tiltDeg = clamp(deg, CONFIG.CAMERA.tiltMinDeg, CONFIG.CAMERA.tiltMaxDeg);
  }

  addShake(amount) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  toggleThirdPerson() {
    this.thirdPerson = !this.thirdPerson;
    return this.thirdPerson;
  }

  /**
   * @param {number} dt        tempo real do frame (não o passo fixo)
   * @param {import('../flight/Drone.js').Drone} drone
   * @param {THREE.Vector3} renderPos  posição já interpolada pro render
   */
  update(dt, drone, renderPos = drone.position) {
    const C = CONFIG.CAMERA;
    this._time += dt;

    // ── FOV pela velocidade ──────────────────────────────────────────────
    // Sobe rápido e volta com easing: o "puxão" de acelerar fica marcado, e
    // desacelerar não dá a sensação de zoom pra dentro.
    const speedFactor = clamp(drone.horizontalSpeed / C.fovSpeedRef, 0, 1);
    // O zoom da câmera (upgrade da Fase 5) é um FOV menor: a lente longa
    // enxerga mais longe e enquadra menos — o custo real de uma teleobjetiva.
    const targetFov = (C.fovBase + (C.fovMax - C.fovBase) * speedFactor) / (this.zoom ?? 1);
    this.fov = damp(this.fov, targetFov, C.fovHalfLife, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // ── Decaimento do shake ──────────────────────────────────────────────
    this.shake = damp(this.shake, 0, C.shakeHalfLife, dt);
    // Vibração contínua do motor: pequena, mas é o que impede a imagem de
    // parecer uma câmera flutuando em trilho.
    const buzz = drone.rpm * C.shakeFromThrottle;
    const jitter = this.shake + buzz;

    if (this.thirdPerson) {
      this._updateChase(dt, drone, renderPos);
    } else {
      this._updateFpv(drone, renderPos);
    }

    if (jitter > 0.0005) {
      // Frequências diferentes por eixo pra não virar oscilação em diagonal.
      const t = this._time;
      this._euler.set(
        Math.sin(t * 51.3) * jitter * 0.045,
        Math.sin(t * 43.7 + 1.3) * jitter * 0.045,
        Math.sin(t * 61.1 + 2.7) * jitter * 0.06,
        'XYZ',
      );
      this._shakeQuat.setFromEuler(this._euler);
      this.camera.quaternion.multiply(this._shakeQuat);
    }
  }

  _updateFpv(drone, renderPos) {
    const C = CONFIG.CAMERA;
    this._offset.set(C.offset.x, C.offset.y, C.offset.z).applyQuaternion(drone.quaternion);
    this.camera.position.copy(renderPos).add(this._offset);

    // Tilt no referencial do corpo: rotação positiva em X levanta o nariz da
    // câmera, exatamente como inclinar o berço da lente pra trás.
    this._tiltQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), asRadians(this.tiltDeg));
    this.camera.quaternion.copy(drone.quaternion).multiply(this._tiltQuat);
  }

  /** 3ª pessoa: só pra debug e screenshot, não é modo de jogo. */
  _updateChase(dt, drone, renderPos) {
    const C = CONFIG.CAMERA.thirdPerson;
    this._chaseTarget
      .set(0, C.height, C.distance)
      // Só a proa entra: seguir o roll do drone em 3ª pessoa embrulha o estômago.
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), drone.heading)
      .add(renderPos);

    this._chasePos.set(
      damp(this.camera.position.x, this._chaseTarget.x, C.halfLife, dt),
      damp(this.camera.position.y, this._chaseTarget.y, C.halfLife, dt),
      damp(this.camera.position.z, this._chaseTarget.z, C.halfLife, dt),
    );
    this.camera.position.copy(this._chasePos);
    this.camera.lookAt(renderPos);
  }

  /** Qualidade do sinal (Fase 3) — 1 perto de casa, 0 fora de alcance. */
  setSignal(value) {
    this.signal = clamp(value, 0, 1);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Escurece a imagem quando o drone entra dentro de geometria (Fase 6). */
  static occlusionFade(distance, radius) {
    return smoothstep(0, radius, distance);
  }
}
