import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildDroneModel } from '../flight/DroneModel.js';

/**
 * Fantasma da melhor volta: um drone translúcido refazendo a corrida junto.
 *
 * O ponto NÃO é mostrar que existe um tempo melhor — o cronômetro já faz isso.
 * É mostrar ONDE ele foi melhor. Ver o fantasma abrir 10 m numa curva específica
 * diz o que corrigir; um número no fim da volta não diz nada.
 *
 * As amostras vão pro localStorage, então o formato é um array plano de números
 * arredondados em vez de objetos: uma volta de 60 s a 20 Hz cabe em ~35 KB assim,
 * contra ~140 KB em JSON de objetos.
 */
const STRIDE = 8; // t, x, y, z, qx, qy, qz, qw

export class Ghost {
  constructor(scene) {
    this.scene = scene;
    this.model = buildDroneModel({ color: 0x35e0c8, accent: 0xffffff, ghost: true });
    this.model.visible = false;
    scene.add(this.model);

    this.samples = null;
    this.recording = null;
    this._recordClock = 0;
    this._cursor = 0;

    this._posA = new THREE.Vector3();
    this._posB = new THREE.Vector3();
    this._quatA = new THREE.Quaternion();
    this._quatB = new THREE.Quaternion();
  }

  // ── Gravação ──────────────────────────────────────────────────────────
  startRecording() {
    this.recording = [];
    this._recordClock = 0;
  }

  /** Chamado no passo fixo enquanto a corrida acontece. */
  record(dt, elapsed, position, quaternion) {
    if (!this.recording) return;
    this._recordClock -= dt;
    if (this._recordClock > 0) return;
    this._recordClock = 1 / CONFIG.RACE.ghostHz;

    // Duas casas em metros = 1 cm de precisão. Mais que isso é ruído que só
    // ocupa espaço: o fantasma é uma referência visual, não uma perícia.
    this.recording.push(
      +elapsed.toFixed(3),
      +position.x.toFixed(2),
      +position.y.toFixed(2),
      +position.z.toFixed(2),
      +quaternion.x.toFixed(3),
      +quaternion.y.toFixed(3),
      +quaternion.z.toFixed(3),
      +quaternion.w.toFixed(3),
    );
  }

  /** Encerra e devolve a gravação (pra salvar só se o tempo foi melhor). */
  stopRecording() {
    const done = this.recording;
    this.recording = null;
    return done;
  }

  // ── Reprodução ────────────────────────────────────────────────────────
  load(samples) {
    this.samples = Array.isArray(samples) && samples.length >= STRIDE * 2 ? samples : null;
    this._cursor = 0;
    this.model.visible = false;
    return Boolean(this.samples);
  }

  rewind() {
    this._cursor = 0;
  }

  get hasGhost() {
    return Boolean(this.samples);
  }

  /**
   * Posiciona o fantasma no instante `elapsed` da corrida atual.
   * O cursor avança pra frente e nunca volta a varrer o array desde o início:
   * a busca é O(1) amortizado no caso normal, que é o tempo andando pra frente.
   */
  play(elapsed) {
    if (!this.samples) return;
    const data = this.samples;
    const last = data.length - STRIDE;

    if (elapsed >= data[last]) {
      // O fantasma terminou a volta; some em vez de congelar na linha.
      this.model.visible = false;
      return;
    }

    while (this._cursor + STRIDE <= last && data[this._cursor + STRIDE] <= elapsed) {
      this._cursor += STRIDE;
    }
    while (this._cursor > 0 && data[this._cursor] > elapsed) {
      this._cursor -= STRIDE;
    }

    const i = this._cursor;
    const t0 = data[i];
    const t1 = data[i + STRIDE];
    const alpha = t1 > t0 ? (elapsed - t0) / (t1 - t0) : 0;

    this._posA.set(data[i + 1], data[i + 2], data[i + 3]);
    this._posB.set(data[i + STRIDE + 1], data[i + STRIDE + 2], data[i + STRIDE + 3]);
    this._quatA.set(data[i + 4], data[i + 5], data[i + 6], data[i + 7]);
    this._quatB.set(
      data[i + STRIDE + 4],
      data[i + STRIDE + 5],
      data[i + STRIDE + 6],
      data[i + STRIDE + 7],
    );

    this.model.position.lerpVectors(this._posA, this._posB, alpha);
    this.model.quaternion.copy(this._quatA).slerp(this._quatB, alpha);
    this.model.visible = true;
  }

  hide() {
    this.model.visible = false;
  }

  /** Distância entre o drone e o fantasma — a HUD mostra quem está na frente. */
  distanceTo(position) {
    return this.model.visible ? this.model.position.distanceTo(position) : null;
  }

  dispose() {
    this.scene.remove(this.model);
    this.model.userData.dispose?.();
  }
}
