import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/MathUtils.js';

/**
 * Photo mode: pausa, câmera livre e exportação em PNG.
 *
 * A profundidade de campo é falsa de propósito — um desfoque de verdade custaria
 * um passe separado com buffer de profundidade, e aqui o efeito só precisa
 * separar o assunto do fundo numa imagem parada. Bruma extra atrás do ponto de
 * foco entrega isso por quase nada.
 */
export class PhotoMode {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.active = false;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 3000);
    this.focus = 40;
    this._velocity = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._move = new THREE.Vector3();
    this._fogBackup = null;
  }

  enter(fromCamera) {
    this.active = true;
    this.camera.position.copy(fromCamera.position);
    this.camera.quaternion.copy(fromCamera.quaternion);
    this._euler.setFromQuaternion(fromCamera.quaternion);
    this._velocity.set(0, 0, 0);
    this._fogBackup = this.scene.fog ? { near: this.scene.fog.near, far: this.scene.fog.far } : null;
  }

  exit() {
    this.active = false;
    if (this._fogBackup && this.scene.fog) {
      this.scene.fog.near = this._fogBackup.near;
      this.scene.fog.far = this._fogBackup.far;
    }
  }

  /**
   * Câmera livre com os mesmos eixos do voo — quem acabou de pilotar não
   * precisa aprender outro esquema pra tirar a foto.
   */
  update(dt, axes, aspect) {
    if (!this.active) return null;
    const P = CONFIG.PHOTO;

    this._euler.y -= axes.yaw * P.turnSpeed * dt;
    this._euler.x = THREE.MathUtils.clamp(
      this._euler.x + axes.pitch * P.turnSpeed * dt,
      -Math.PI / 2.1,
      Math.PI / 2.1,
    );
    this.camera.quaternion.setFromEuler(this._euler);

    // Reaproveita os eixos do voo em vez de inventar um esquema novo: o
    // acelerador (W/S) anda pra frente e pra trás, o roll (←/→) faz o
    // deslocamento lateral, e o olhar continua no mesmo lugar de sempre.
    // Quem acabou de pilotar não precisa reaprender nada pra tirar a foto.
    const forward = (axes.throttle - 1 / 3) * 1.5;

    // Movimento com inércia: sem ela, cada toque no stick sacode o
    // enquadramento e nunca se consegue uma imagem parada.
    this._move.set(axes.roll, 0, -forward).applyQuaternion(this.camera.quaternion);
    this._velocity.x = damp(this._velocity.x, this._move.x * P.speed, P.halfLife, dt);
    this._velocity.y = damp(this._velocity.y, this._move.y * P.speed, P.halfLife, dt);
    this._velocity.z = damp(this._velocity.z, this._move.z * P.speed, P.halfLife, dt);
    this.camera.position.addScaledVector(this._velocity, dt);

    // "DOF": a bruma fecha logo depois do ponto de foco.
    if (this.scene.fog) {
      this.scene.fog.near = this.focus * 0.9;
      this.scene.fog.far = this.focus * P.blurFalloff;
    }

    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    return this.camera;
  }

  setFocus(delta) {
    this.focus = THREE.MathUtils.clamp(this.focus + delta, 3, 900);
  }

  /**
   * Exporta o frame atual.
   *
   * `preserveDrawingBuffer` é falso (ligá-lo custa desempenho o tempo todo), e
   * por isso o canvas é lido IMEDIATAMENTE depois de um render forçado, antes
   * do navegador limpar o buffer.
   */
  capture(renderFrame) {
    renderFrame();
    const url = this.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.download = `dronefarer-${stamp}.png`;
    link.href = url;
    link.click();
    return link.download;
  }
}
