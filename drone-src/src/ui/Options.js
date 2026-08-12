import { CONFIG } from '../config.js';
import { TIER_ORDER } from '../core/Quality.js';

/**
 * Menu de opções.
 *
 * Tudo aqui é preferência de acessibilidade ou de conforto, e por isso tudo é
 * salvo. Especialmente os eixos invertidos e o expo: quem voa de rádio há anos
 * tem uma preferência formada, e obrigar a reaprender é motivo pra fechar a aba.
 *
 * O toggle de efeitos de câmera FPV está aqui — e não só no tier de qualidade —
 * porque distorção e ruído enjoam algumas pessoas. Isso é acessibilidade, não
 * desempenho.
 */
export class Options {
  constructor(container, { save, quality, audio, camera, post, input, onQuality }) {
    this.save = save;
    this.quality = quality;
    this.audio = audio;
    this.camera = camera;
    this.post = post;
    this.input = input;
    this.onQuality = onQuality;
    this.open = false;

    this.root = document.createElement('div');
    this.root.id = 'options';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="panel">
        <header><h2>OPÇÕES</h2><span class="hint">ESC fecha</span></header>
        <div class="rows" data-el="rows"></div>
        <footer>
          <button data-act="reset">APAGAR PROGRESSO</button>
          <span class="hint">recordes, créditos e upgrades</span>
        </footer>
      </div>`;
    container.appendChild(this.root);
    this.rowsEl = this.root.querySelector('[data-el="rows"]');

    this.root.addEventListener('input', (e) => this._onInput(e));
    this.root.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-act]');
      if (button?.dataset.act === 'reset' && confirm('Apagar todo o progresso?')) {
        this.save.reset();
        location.reload();
      }
    });
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
    return this.open;
  }

  _onInput(e) {
    const field = e.target.dataset.field;
    if (!field) return;
    const options = this.save.options;
    const value = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);

    switch (field) {
      case 'quality':
        options.quality = TIER_ORDER[value];
        this.quality.setTier(options.quality);
        // Escolher tier à mão desliga a degradação automática: senão o jogo
        // desfaz a escolha do jogador alguns segundos depois.
        this.quality.overridden = true;
        this.onQuality?.();
        break;
      case 'tilt':
        options.cameraTilt = value;
        this.camera.setTilt(value);
        break;
      case 'expo':
        options.expoScale = value;
        this.input.options.expoScale = value;
        break;
      case 'invertPitch':
      case 'invertRoll':
        options[field] = value;
        this.input.options[field] = value;
        break;
      case 'fpvEffects':
        options.fpvEffects = value;
        this.post.userEnabled = value;
        break;
      default:
        if (field.startsWith('vol:')) {
          const bus = field.slice(4);
          this.audio.setVolume(bus, value);
        }
    }
    // `flush` e não `write`: o write agrupa por 400 ms, e recarregar a página
    // logo depois de mexer num controle perderia a escolha.
    this.save.flush();
    this._refreshLabels();
  }

  _refreshLabels() {
    for (const el of this.root.querySelectorAll('[data-out]')) {
      const input = this.root.querySelector(`[data-field="${el.dataset.out}"]`);
      if (!input || input.type === 'checkbox') continue;
      el.textContent = el.dataset.suffix
        ? `${Number(input.value).toFixed(el.dataset.decimals || 0)}${el.dataset.suffix}`
        : input.value;
    }
  }

  render() {
    const o = this.save.options;
    const volume = o.volume;
    const tierIndex = Math.max(0, TIER_ORDER.indexOf(o.quality ?? this.quality.tier));

    const slider = (field, label, min, max, step, value, suffix = '', decimals = 0) => `
      <label class="row">
        <span>${label}</span>
        <input type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}">
        <b data-out="${field}" data-suffix="${suffix}" data-decimals="${decimals}"></b>
      </label>`;

    const toggle = (field, label, checked) => `
      <label class="row">
        <span>${label}</span>
        <input type="checkbox" data-field="${field}" ${checked ? 'checked' : ''}>
        <b></b>
      </label>`;

    this.rowsEl.innerHTML = [
      '<h3>IMAGEM</h3>',
      slider('quality', 'Qualidade', 0, 3, 1, tierIndex),
      toggle('fpvEffects', 'Efeitos de câmera FPV', o.fpvEffects !== false),
      slider(
        'tilt',
        'Inclinação da câmera',
        CONFIG.CAMERA.tiltMinDeg,
        CONFIG.CAMERA.tiltMaxDeg,
        1,
        o.cameraTilt ?? CONFIG.CAMERA.tiltDeg,
        '°',
      ),
      '<h3>CONTROLES</h3>',
      slider('expo', 'Expo dos sticks', 0, 1.6, 0.05, o.expoScale ?? 1, '×', 2),
      toggle('invertPitch', 'Inverter pitch', o.invertPitch),
      toggle('invertRoll', 'Inverter roll', o.invertRoll),
      '<h3>SOM</h3>',
      slider('vol:master', 'Geral', 0, 1, 0.05, volume.master, '', 2),
      slider('vol:engine', 'Motor', 0, 1, 0.05, volume.engine, '', 2),
      slider('vol:wind', 'Vento', 0, 1, 0.05, volume.wind, '', 2),
      slider('vol:sfx', 'Efeitos', 0, 1, 0.05, volume.sfx, '', 2),
      slider('vol:music', 'Música', 0, 1, 0.05, volume.music, '', 2),
    ].join('');

    // O slider de qualidade mostra o nome do tier, não o índice.
    const qualityOut = this.rowsEl.querySelector('[data-out="quality"]');
    const qualityInput = this.rowsEl.querySelector('[data-field="quality"]');
    const syncQuality = () => {
      qualityOut.textContent = CONFIG.QUALITY.tiers[TIER_ORDER[qualityInput.value]].label;
    };
    qualityInput.addEventListener('input', syncQuality);
    this._refreshLabels();
    syncQuality();
  }

  /** Aplica as preferências salvas na abertura do jogo. */
  applySaved() {
    const o = this.save.options;
    if (o.quality) {
      this.quality.setTier(o.quality);
      this.quality.overridden = true;
    }
    if (o.cameraTilt != null) this.camera.setTilt(o.cameraTilt);
    if (o.fpvEffects === false) this.post.userEnabled = false;
    this.input.options.expoScale = o.expoScale ?? 1;
    this.input.options.invertPitch = Boolean(o.invertPitch);
    this.input.options.invertRoll = Boolean(o.invertRoll);
  }
}
