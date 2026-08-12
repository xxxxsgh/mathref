import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Killcam: repete os últimos 8 segundos antes da batida, de fora.
 *
 * Serve pra ENTENDER o erro. Em primeira pessoa, uma batida é meio segundo de
 * tela girando e nada explicado; de fora e mais devagar, dá pra ver que o drone
 * chegou baixo demais na curva. Por isso a câmera é orbital e o tempo roda a 60%.
 *
 * O buffer é circular e de tamanho fixo: grava sempre, custa uma escrita de oito
 * números por quadro e nunca aloca durante o voo.
 */
const STRIDE = 8; // t, x, y, z, qx, qy, qz, qw

export class Killcam {
  constructor(scene, model) {
    this.model = model;
    this.seconds = CONFIG.KILLCAM.seconds;
    this.hz = CONFIG.KILLCAM.hz;
    this.capacity = Math.ceil(this.seconds * this.hz);

    this.buffer = new Float32Array(this.capacity * STRIDE);
    this.count = 0;
    this.head = 0;
    this._clock = 0;

    this.playing = false;
    this.playhead = 0;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._focus = new THREE.Vector3();
  }

  record(dt, elapsed, position, quaternion) {
    if (this.playing) return;
    this._clock -= dt;
    if (this._clock > 0) return;
    this._clock = 1 / this.hz;

    const o = this.head * STRIDE;
    this.buffer[o] = elapsed;
    this.buffer[o + 1] = position.x;
    this.buffer[o + 2] = position.y;
    this.buffer[o + 3] = position.z;
    this.buffer[o + 4] = quaternion.x;
    this.buffer[o + 5] = quaternion.y;
    this.buffer[o + 6] = quaternion.z;
    this.buffer[o + 7] = quaternion.w;

    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** Índice real do i-ésimo quadro mais antigo ainda guardado. */
  _slot(i) {
    const start = this.count < this.capacity ? 0 : this.head;
    return ((start + i) % this.capacity) * STRIDE;
  }

  get available() {
    return this.count > this.hz; // pelo menos um segundo de material
  }

  /**
   * Começa a repetição.
   *
   * Guardamos 8 s, mas só os últimos `replaySeconds` vão ao ar: o interessante
   * é a aproximação e o impacto, não o minuto anterior. E o tempo desacelerado
   * multiplica a duração real — 8 s a 0,6× seriam 13 s parado, o que destrói o
   * loop de "mais uma tentativa" que a Fase 2 inteira existe pra proteger.
   */
  start() {
    if (!this.available) return false;
    const first = this.buffer[this._slot(0)];
    const last = this.buffer[this._slot(this.count - 1)];
    const span = Math.min(CONFIG.KILLCAM.replaySeconds, last - first);
    this.playing = true;
    this.playhead = Math.max(0, last - first - span);
    this.model.visible = true;
    return true;
  }

  stop() {
    this.playing = false;
  }

  /** @returns {THREE.Camera|null} câmera a usar neste frame, ou null se acabou */
  update(dt, aspect) {
    if (!this.playing) return null;

    // Tempo desacelerado: o erro fica legível, que é o ponto todo.
    this.playhead += dt * CONFIG.KILLCAM.timeScale;
    const first = this.buffer[this._slot(0)];
    const last = this.buffer[this._slot(this.count - 1)];
    const time = first + this.playhead;

    if (time >= last) {
      this.stop();
      return null;
    }

    // Busca linear: são no máximo 8 × 30 = 240 quadros.
    let index = 0;
    while (index < this.count - 2 && this.buffer[this._slot(index + 1)] <= time) index++;

    const o0 = this._slot(index);
    const o1 = this._slot(index + 1);
    const t0 = this.buffer[o0];
    const t1 = this.buffer[o1];
    const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

    this._a.set(this.buffer[o0 + 1], this.buffer[o0 + 2], this.buffer[o0 + 3]);
    this._b.set(this.buffer[o1 + 1], this.buffer[o1 + 2], this.buffer[o1 + 3]);
    this._qa.set(this.buffer[o0 + 4], this.buffer[o0 + 5], this.buffer[o0 + 6], this.buffer[o0 + 7]);
    this._qb.set(this.buffer[o1 + 4], this.buffer[o1 + 5], this.buffer[o1 + 6], this.buffer[o1 + 7]);

    this._focus.lerpVectors(this._a, this._b, alpha);
    this.model.position.copy(this._focus);
    this.model.quaternion.copy(this._qa).slerp(this._qb, alpha);

    // Órbita lenta em volta do drone: mostra o traçado de vários ângulos sem
    // exigir que o jogador mexa em nada.
    const angle = this.playhead * CONFIG.KILLCAM.orbitSpeed;
    const r = CONFIG.KILLCAM.distance;
    this.camera.position.set(
      this._focus.x + Math.cos(angle) * r,
      this._focus.y + CONFIG.KILLCAM.height,
      this._focus.z + Math.sin(angle) * r,
    );
    this.camera.lookAt(this._focus);
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    return this.camera;
  }

  clear() {
    this.count = 0;
    this.head = 0;
  }
}
