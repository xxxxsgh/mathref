import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

/**
 * HUD — construída em DOM, atualizada por frame.
 *
 * Duas regras de performance que valem pra toda a UI do projeto:
 *
 *  1. Nada de `innerHTML` no loop. Guardamos referências aos nós de texto na
 *     construção e escrevemos em `textContent`. Recriar HTML 60x/s obriga o
 *     navegador a reparsear e reconstruir a árvore toda vez.
 *  2. Barras animam com `transform: scaleX()`, nunca `width`. `width` dispara
 *     recálculo de layout; `transform` é processado no compositor e não toca
 *     no layout.
 *
 * O elemento mais importante aqui não é o velocímetro: é o MARCADOR DE VETOR
 * DE VELOCIDADE. Ele mostra pra onde a nave está de fato indo, que durante a
 * deriva não é pra onde ela aponta. Sem ele, o "peso" do modelo de voo é
 * sentido mas não é lido — e o jogador não entende por que errou a curva.
 */
export class HUD {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud__center"></div>

      <div class="hud__reticle" id="hud-reticle">
        <svg viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="14" stroke-width="1.2" opacity="0.55"/>
          <line x1="23" y1="3"  x2="23" y2="10" stroke-width="1.4"/>
          <line x1="23" y1="36" x2="23" y2="43" stroke-width="1.4"/>
          <line x1="3"  y1="23" x2="10" y2="23" stroke-width="1.4"/>
          <line x1="36" y1="23" x2="43" y2="23" stroke-width="1.4"/>
        </svg>
      </div>

      <div class="hud__velocity-marker" id="hud-vel">
        <svg viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="5"/>
          <line x1="13" y1="3" x2="13" y2="8"/>
          <line x1="0"  y1="13" x2="8" y2="13"/>
          <line x1="18" y1="13" x2="26" y2="13"/>
        </svg>
      </div>

      <div class="hud__alert" id="hud-alert">ASSISTÊNCIA DE VOO DESLIGADA</div>

      <div class="hud__corner hud__corner--bl">
        <div class="hud__label">Velocidade</div>
        <div><span class="hud__value" id="hud-speed">0</span><span class="hud__unit">u/s</span></div>
        <div class="hud__bar"><div class="hud__bar-fill" id="hud-speed-bar"></div></div>
      </div>

      <div class="hud__corner hud__corner--br">
        <div class="hud__label">Acelerador</div>
        <div><span class="hud__value" id="hud-throttle">0</span><span class="hud__unit">%</span></div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--throttle" id="hud-throttle-bar"></div></div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--boost" id="hud-boost-bar"></div></div>
      </div>

      <div class="hud__corner hud__corner--tl">
        <div class="hud__label">Deriva lateral</div>
        <div><span class="hud__value" id="hud-drift" style="font-size:18px">0</span><span class="hud__unit">u/s</span></div>
        <div class="hud__label" style="margin-top:6px">Força G</div>
        <div><span class="hud__value" id="hud-g" style="font-size:18px">0.0</span></div>
      </div>
    `;

    this.el = {
      reticle: root.querySelector('#hud-reticle'),
      vel: root.querySelector('#hud-vel'),
      alert: root.querySelector('#hud-alert'),
      speed: root.querySelector('#hud-speed'),
      speedBar: root.querySelector('#hud-speed-bar'),
      throttle: root.querySelector('#hud-throttle'),
      throttleBar: root.querySelector('#hud-throttle-bar'),
      boostBar: root.querySelector('#hud-boost-bar'),
      drift: root.querySelector('#hud-drift'),
      g: root.querySelector('#hud-g'),
    };

    this._velProj = new THREE.Vector3();
    this._lastAlert = null;
    // Cache dos textos: escrever em `textContent` marca o nó como sujo mesmo
    // quando o valor não mudou. Comparar antes evita trabalho inútil de layout.
    this._cache = { speed: -1, throttle: -1, drift: -1, g: -1 };
  }

  show() { this.root.classList.add('is-visible'); }

  /**
   * @param {import('../entities/Ship.js').Ship} ship
   * @param {import('../core/Input.js').ControlState} input
   * @param {THREE.PerspectiveCamera} camera
   */
  update(ship, input, camera) {
    const f = ship.flight;

    // ── Retículo ─────────────────────────────────────────────────────────
    // Só é mostrado quando o mouse está em uso; no gamepad/touch a mira segue
    // o nariz da nave e o retículo móvel só confundiria.
    if (input.aimActive && input.source === 'keyboard') {
      const half = Math.min(window.innerWidth, window.innerHeight) * 0.5;
      this.el.reticle.style.transform =
        `translate(${input.aimX * half}px, ${input.aimY * half}px)`;
      this.el.reticle.style.opacity = '1';
    } else {
      this.el.reticle.style.opacity = '0';
    }

    // ── Marcador de vetor de velocidade ──────────────────────────────────
    // Projeta a direção da velocidade no plano da tela. Se o vetor estiver
    // atrás da câmera (voando de ré), escondemos — projetar aí produz uma
    // posição espelhada e sem sentido.
    if (f.speed > 4) {
      this._velProj.copy(f.velocity).normalize().add(f.position).project(camera);
      if (this._velProj.z < 1) {
        const x = this._velProj.x * window.innerWidth * 0.5;
        const y = -this._velProj.y * window.innerHeight * 0.5;
        this.el.vel.style.transform = `translate(${x}px, ${y}px)`;
        this.el.vel.style.opacity = String(clamp(f.lateralSpeed / 22, 0.16, 1));
      } else {
        this.el.vel.style.opacity = '0';
      }
    } else {
      this.el.vel.style.opacity = '0';
    }

    // ── Números ──────────────────────────────────────────────────────────
    const speed = Math.round(f.speed);
    if (speed !== this._cache.speed) {
      this.el.speed.textContent = String(speed);
      this._cache.speed = speed;
    }
    const throttlePct = Math.round(f.throttle * 100);
    if (throttlePct !== this._cache.throttle) {
      this.el.throttle.textContent = String(throttlePct);
      this._cache.throttle = throttlePct;
    }
    const drift = Math.round(f.lateralSpeed);
    if (drift !== this._cache.drift) {
      this.el.drift.textContent = String(drift);
      this.el.drift.classList.toggle('is-warn', drift > 45);
      this._cache.drift = drift;
    }
    const g = Math.round(f.gForce * 10) / 10;
    if (g !== this._cache.g) {
      this.el.g.textContent = g.toFixed(1);
      this._cache.g = g;
    }

    // ── Barras ───────────────────────────────────────────────────────────
    const maxRef = CONFIG.flight.maxSpeed * CONFIG.flight.boostMultiplier;
    this.el.speedBar.style.transform = `scaleX(${clamp(f.speed / maxRef, 0, 1)})`;
    this.el.throttleBar.style.transform = `scaleX(${f.throttle})`;
    this.el.boostBar.style.transform = `scaleX(${f.boosting ? 1 : 0})`;

    // ── Aviso ────────────────────────────────────────────────────────────
    const alert = !f.assistEnabled ? 'assist' : null;
    if (alert !== this._lastAlert) {
      this.el.alert.classList.toggle('is-on', alert !== null);
      this._lastAlert = alert;
    }
  }
}
