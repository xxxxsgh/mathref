import * as THREE from 'three';
import { clamp, formatTime, formatDelta } from '../core/MathUtils.js';

/**
 * HUD. Duas camadas com propósitos diferentes:
 *
 * - Voo (bateria, altura, velocidade, modo): confirma o que o piloto já deveria
 *   estar sentindo. Se precisar crescer pra pilotagem funcionar, o problema está
 *   no voo, não aqui.
 * - Corrida (cronômetro, gate atual, seta, split): informa o que é impossível
 *   deduzir da imagem — onde fica o próximo gate e se a volta está boa.
 *
 * Tudo em DOM: texto nítido em qualquer DPI e zero draw call.
 */
export class HUD {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="hud-mode">
        <span class="tag" data-el="mode">ANGLE</span>
        <div class="zone" data-el="zone"></div>
        <div class="signal" data-el="signal"><span></span>SINAL</div>
      </div>

      <div id="objective" data-el="objective"></div>

      <div id="hud-race">
        <div class="race-line">
          <span class="circuit" data-el="circuit"></span>
          <span class="best" data-el="best"></span>
        </div>
        <div class="timer" data-el="timer">0:00.000</div>
        <div class="race-line">
          <span class="gates" data-el="gates"></span>
          <span class="delta" data-el="delta"></span>
        </div>
        <div class="combo" data-el="combo"></div>
      </div>

      <div id="hud-center">
        <div class="reticle"></div>
        <div class="banner" data-el="banner"></div>
      </div>

      <div class="gate-marker" data-el="marker"><b data-el="marker-dist"></b></div>

      <div id="hud-bottom">
        <div class="gauge">
          <span class="label">BATERIA</span>
          <div class="bar"><i data-el="battery-fill"></i></div>
          <span class="value" data-el="battery">100%</span>
        </div>
        <div class="gauge center">
          <span class="value big" data-el="speed">0</span>
          <span class="label">km/h</span>
        </div>
        <div class="gauge right">
          <span class="value big" data-el="altitude">0</span>
          <span class="label">m AGL</span>
        </div>
      </div>

      <div id="finish" data-el="finish">
        <div class="medal" data-el="finish-medal"></div>
        <div class="finish-time" data-el="finish-time"></div>
        <div class="finish-detail" data-el="finish-detail"></div>
        <div class="finish-hint">R para reiniciar · [ ] troca de circuito</div>
      </div>`;
    container.appendChild(this.root);

    this.els = {};
    for (const el of this.root.querySelectorAll('[data-el]')) this.els[el.dataset.el] = el;

    this._bannerTimer = 0;
    this._deltaTimer = 0;
    this._lastBattery = -1;
    this._lastMode = '';
    this._v = new THREE.Vector3();
  }

  update(state, dt) {
    const { speedKmh, altitude, batteryPercent, mode, batteryCritical, batteryWarning } = state;

    this.els.speed.textContent = Math.round(speedKmh);
    // Perto do chão o decimal importa (rasar a 0,4 m é diferente de 1,2 m);
    // alto, não — e o número pulando distrai.
    this.els.altitude.textContent = altitude < 10 ? altitude.toFixed(1) : Math.round(altitude);

    const percent = Math.round(batteryPercent);
    if (percent !== this._lastBattery) {
      this._lastBattery = percent;
      this.els.battery.textContent = `${percent}%`;
      this.els['battery-fill'].style.width = `${clamp(batteryPercent, 0, 100)}%`;
      this.els['battery-fill'].className = batteryCritical ? 'critical' : batteryWarning ? 'warn' : '';
    }

    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this.els.mode.textContent = mode;
      this.els.mode.className = `tag ${mode === 'ACRO' ? 'acro' : ''}`;
    }

    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.els.banner.classList.remove('on');
    }
    if (this._deltaTimer > 0) {
      this._deltaTimer -= dt;
      if (this._deltaTimer <= 0) this.els.delta.textContent = '';
    }
  }

  /**
   * Camada de corrida.
   * @param {object|null} race  saída de `Race.hudState`
   * @param {THREE.Camera} camera  pra projetar a seta-guia na tela
   */
  updateRace(race, camera) {
    const panel = this.root.querySelector('#hud-race');
    if (!race) {
      panel.classList.add('hidden');
      this.els.marker.classList.remove('on');
      return;
    }
    panel.classList.remove('hidden');

    this.els.circuit.textContent = race.circuit.name.toUpperCase();
    this.els.best.textContent = race.bestTime != null ? `REC ${formatTime(race.bestTime)}` : '';
    this.els.timer.textContent = formatTime(race.elapsed);
    this.els.timer.className = `timer ${race.state}`;
    this.els.gates.textContent =
      race.state === 'armed'
        ? 'cruze o gate 1 para largar'
        : `gate ${Math.min(race.gateIndex + 1, race.gateTotal)}/${race.gateTotal}`;

    this.els.combo.textContent = race.combo > 1 ? `×${race.combo}` : '';
    this.els.combo.style.opacity = race.combo > 1 ? String(0.35 + race.comboRatio * 0.65) : '0';

    this._updateMarker(race, camera);
  }

  /**
   * Seta-guia. Dentro da tela vira um alvo em cima do gate; fora, encosta na
   * borda apontando pra onde virar. Sem isso o jogador procura o gate girando
   * no lugar, que é o oposto de uma corrida.
   */
  _updateMarker(race, camera) {
    const marker = this.els.marker;
    if (!race.gatePosition || race.state === 'finished') {
      marker.classList.remove('on');
      return;
    }

    this._v.copy(race.gatePosition).project(camera);
    // Atrás da câmera o w é negativo e a projeção espelha x e y; desespelhar é
    // o que faz a seta apontar pro lado certo quando o gate ficou pra trás.
    const behind = this._v.z > 1;
    let x = behind ? -this._v.x : this._v.x;
    let y = behind ? -this._v.y : this._v.y;

    const onScreen = !behind && Math.abs(x) < 0.94 && Math.abs(y) < 0.94;
    if (!onScreen) {
      // Empurra pra borda mantendo a direção.
      const scale = 0.94 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
      x *= scale;
      y *= scale;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    marker.style.transform =
      `translate(${(x * 0.5 + 0.5) * w}px, ${(-y * 0.5 + 0.5) * h}px)` +
      ` translate(-50%, -50%) rotate(${onScreen ? 0 : Math.atan2(-y, x) + Math.PI / 2}rad)`;
    marker.classList.toggle('off-screen', !onScreen);
    marker.classList.add('on');
    this.els['marker-dist'].textContent =
      race.gateDistance != null ? `${Math.round(race.gateDistance)}m` : '';
  }

  /**
   * Camada de mundo: zona, sinal de rádio e o objetivo corrente.
   *
   * O objetivo é UMA linha, sempre. Se não der pra entender o que fazer em dois
   * segundos, o problema é a missão — não o espaço no HUD.
   */
  updateWorld({ zone, signal, objective, onPad }) {
    this.els.zone.textContent = zone ?? '';

    const bar = this.els.signal;
    bar.firstElementChild.style.width = `${clamp(signal * 100, 0, 100)}%`;
    bar.className = `signal ${signal < 0.22 ? 'critical' : signal < 0.6 ? 'warn' : ''}`;
    // Com sinal cheio o indicador some: informação que nunca muda vira ruído.
    bar.style.opacity = signal > 0.985 ? '0' : '1';

    const text = objective ?? (onPad ? 'RECARREGANDO NA BASE' : '');
    if (text !== this._lastObjective) {
      this._lastObjective = text;
      this.els.objective.textContent = text;
      this.els.objective.classList.toggle('on', Boolean(text));
    }
  }

  /** Split ao cruzar um gate: verde ganhou, vermelho perdeu. */
  showDelta(delta) {
    if (delta == null) return;
    this.els.delta.textContent = formatDelta(delta);
    this.els.delta.className = `delta ${delta <= 0 ? 'good' : 'bad'}`;
    this._deltaTimer = 2.2;
  }

  showFinish(info) {
    const medals = { ouro: '🥇 OURO', prata: '🥈 PRATA', bronze: '🥉 BRONZE' };
    this.els['finish-medal'].textContent = info.medal ? medals[info.medal] : 'SEM MEDALHA';
    this.els['finish-medal'].className = `medal ${info.medal ?? ''}`;
    this.els['finish-time'].textContent = formatTime(info.time);

    const bits = [];
    if (info.improved) bits.push('RECORDE');
    else if (info.delta != null) bits.push(`${formatDelta(info.delta)} do recorde`);
    if (info.scrapes === 0) bits.push('volta limpa');
    if (info.perfects) bits.push(`${info.perfects} no centro`);
    bits.push(`+${info.earned} cr`);
    this.els['finish-detail'].textContent = bits.join(' · ');

    this.els.finish.classList.add('on');
  }

  hideFinish() {
    this.els.finish.classList.remove('on');
  }

  banner(text, seconds = 1.6, kind = '') {
    this.els.banner.textContent = text;
    this.els.banner.className = `banner on ${kind}`;
    this._bannerTimer = seconds;
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }
}

/** Converte m/s pra km/h — a unidade que o jogador tem intuição. */
export const toKmh = (metersPerSecond) => metersPerSecond * 3.6;
