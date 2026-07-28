import { Engine } from './core/Engine.js';
import { Tuner } from './ui/Tuner.js';
import { detectMobile } from './core/Quality.js';

/**
 * Ponto de entrada.
 *
 * O jogo NÃO começa sozinho. A tela inicial existe por três motivos técnicos,
 * não estéticos:
 *   1. `AudioContext` no iOS só destrava dentro de um gesto do usuário;
 *   2. `requestPointerLock` também exige gesto;
 *   3. compilar os shaders e gerar o cubemap do céu leva algumas centenas de
 *      milissegundos — melhor gastar isso atrás de um botão do que num
 *      primeiro frame travado.
 */

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('viewport'));
const boot = document.getElementById('boot');
const bootButton = document.getElementById('boot-start');
const bootHelp = document.getElementById('boot-help');

const isMobile = detectMobile();

bootHelp.innerHTML = isMobile
  ? `
    <div>Metade <b>esquerda</b> da tela: manche (pitch / yaw)</div>
    <div>Metade <b>direita</b>, arrastar vertical: acelerador</div>
    <div>Botões: boost, freio e giro de tonel</div>
    <div style="margin-top:10px;opacity:.7">Use o iPad em modo paisagem</div>
  `
  : `
    <div><kbd>W</kbd><kbd>S</kbd> pitch &nbsp; <kbd>A</kbd><kbd>D</kbd> yaw &nbsp; <kbd>Q</kbd><kbd>E</kbd> roll</div>
    <div><kbd>mouse</kbd> mira &nbsp; <kbd>R</kbd><kbd>F</kbd> acelerador &nbsp; <kbd>←↑↓→</kbd> propulsores laterais</div>
    <div><kbd>Shift</kbd> boost &nbsp; <kbd>Espaço</kbd> freio &nbsp; <kbd>Z</kbd><kbd>C</kbd> giro de tonel</div>
    <div style="margin-top:10px;opacity:.7"><kbd>F3</kbd> debug &nbsp; <kbd>G</kbd> tuning &nbsp; <kbd>H</kbd> assistência de voo</div>
    <div style="margin-top:6px;opacity:.55">Gamepad é detectado automaticamente — aperte qualquer botão nele</div>
  `;

let engine = null;

function launch() {
  bootButton.disabled = true;
  bootButton.textContent = 'CARREGANDO…';

  // Dois rAF antes de construir: o primeiro deixa o navegador pintar o estado
  // "CARREGANDO", o segundo garante que essa pintura terminou. Sem isso o
  // trabalho pesado (compilar shaders, gerar o cubemap) bloqueia a thread
  // antes do texto aparecer, e o botão parece ter travado.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      engine = new Engine(canvas);
    } catch (err) {
      console.error(err);
      bootButton.textContent = 'ERRO';
      bootHelp.innerHTML = `<div style="color:#ff6b5e">Falha ao iniciar o renderer.<br>${
        String(err?.message ?? err)
      }</div>`;
      return;
    }

    const tuner = new Tuner(engine);
    engine.onToggleTuner = () => tuner.toggle();

    engine.input.onUserStart();
    engine.start();

    boot.classList.add('is-hidden');
    // Remove da árvore depois da transição: um elemento fullscreen com
    // backdrop parado sobre o canvas continua custando composição.
    setTimeout(() => { boot.style.display = 'none'; }, 700);

    // Expõe pro console. Ajustar `game.ship.flight` ou `game.quality` ao vivo
    // é a forma mais rápida de investigar um comportamento estranho.
    window.game = engine;
    console.info(
      '%cStarfarer%c — `window.game` disponível no console. F3 = debug, G = tuning.',
      'color:#7de8ff;font-weight:bold', 'color:#888',
    );
  }));
}

bootButton.addEventListener('click', launch);
// Enter/Espaço na tela inicial também inicia — evita obrigar o uso do mouse.
window.addEventListener('keydown', (e) => {
  if (engine) return;
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    launch();
  }
});
