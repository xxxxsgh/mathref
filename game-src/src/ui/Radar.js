import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Radar 3D em canvas 2D.
 *
 * ═══ O PROBLEMA QUE ELE RESOLVE ═══
 *
 * Num combate 6DOF, o inimigo pode estar em qualquer lugar de uma esfera em
 * volta de você — inclusive atrás e acima. Um radar 2D de topo (tipo minimapa)
 * perde justamente a informação mais importante: a altura relativa. Você vê um
 * ponto à sua frente e não sabe se precisa cabrar ou picar.
 *
 * ═══ COMO SE LÊ ═══
 *
 * O disco elíptico é o plano horizontal DA NAVE (não do mundo). O centro é
 * você, o topo é a sua frente. Cada contato tem:
 *   - uma posição no disco  → onde está no plano da nave
 *   - uma HASTE VERTICAL    → o quanto ele está acima ou abaixo desse plano
 *
 * A haste é a peça essencial: sem ela o radar é 2D. É a mesma solução do
 * Elite de 1984, e continua sendo a melhor porque cabe num espaço pequeno e é
 * lida sem interpretação consciente.
 *
 * Desenhado em canvas 2D, não em WebGL: são ~10 formas por frame, e o custo é
 * menor que criar geometria. Também evita mais um draw call na cena 3D.
 */
export class Radar {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // O canvas é desenhado no DPR do dispositivo pra não sair borrado no
    // iPad; o CSS controla o tamanho visual.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = CONFIG.hud.radar.size;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    this.ctx.scale(dpr, dpr);
    this.size = size;

    this._local = new THREE.Vector3();
    this._inv = new THREE.Quaternion();
  }

  /**
   * @param {THREE.Quaternion} shipQuat
   * @param {THREE.Vector3} shipPos
   * @param {Array<{position: THREE.Vector3, active: boolean}>} contacts
   * @param {object|null} target contato destacado
   */
  update(shipQuat, shipPos, contacts, target) {
    const R = CONFIG.hud.radar;
    const ctx = this.ctx;
    const s = this.size;
    const cx = s / 2;
    const cy = s / 2;
    const rx = s * 0.42;              // semi-eixo horizontal
    const ry = rx * R.tilt;           // semi-eixo vertical (a perspectiva)

    ctx.clearRect(0, 0, s, s);

    // ── Grade do disco ────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(125, 232, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(125, 232, 255, 0.13)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Eixos: o vertical marca a frente da nave.
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy); ctx.lineTo(cx + rx, cy);
    ctx.moveTo(cx, cy - ry); ctx.lineTo(cx, cy + ry);
    ctx.stroke();

    // Marca da própria nave.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx + 3, cy + 3);
    ctx.lineTo(cx - 3, cy + 3);
    ctx.closePath();
    ctx.fill();

    // ── Contatos ──────────────────────────────────────────────────────────
    // Conjugado do quaternion = inverso (ele é unitário). Aplicá-lo leva um
    // vetor do mundo pro espaço da nave, que é onde o radar faz sentido.
    this._inv.copy(shipQuat).conjugate();

    for (const c of contacts) {
      if (!c.active) continue;
      this._local.copy(c.position).sub(shipPos);
      const dist = this._local.length();
      if (dist > R.range) continue;
      this._local.applyQuaternion(this._inv);

      // Normaliza pela raiz da distância, não pela distância: com escala
      // linear, tudo se aglomera no centro e contatos próximos ficam
      // indistinguíveis justamente quando mais importam.
      const norm = Math.sqrt(dist / R.range);
      const len = Math.hypot(this._local.x, this._local.z) || 1;
      const nx = (this._local.x / len) * norm;
      // -z é a frente da nave; no disco, a frente é pra CIMA.
      const nz = (-this._local.z / len) * norm;

      const px = cx + nx * rx;
      const py = cy - nz * ry;
      // Altura relativa, comprimida: o alcance vertical útil é menor que o
      // horizontal, senão a haste sai do disco.
      const heightNorm = Math.max(-1, Math.min(1, this._local.y / (R.range * 0.5)));
      const stalk = heightNorm * ry * 0.85;

      const isTarget = target && c === target;
      const color = isTarget ? '#ffb454' : '#ff6b5e';

      // Haste: liga o plano do disco à altura real do contato.
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - stalk);
      ctx.stroke();

      // Ponto do contato, no topo da haste.
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      const r = isTarget ? 3.4 : 2.4;
      ctx.beginPath();
      ctx.arc(px, py - stalk, r, 0, Math.PI * 2);
      ctx.fill();

      if (isTarget) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(px, py - stalk, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}
