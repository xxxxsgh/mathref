import { Engine } from './Engine.js';
import { detectMobile } from '../core/Quality.js';

/**
 * Ponto de entrada do modo drone.
 *
 * O jogo não começa sozinho, e os motivos são técnicos, não estéticos:
 *   1. o `AudioContext` do iOS só destrava dentro de um gesto do usuário —
 *      e sem áudio este jogo perde metade da informação, porque o som dos
 *      motores é o instrumento que diz quanto empuxo está sendo pedido;
 *   2. gerar o terreno, os 870 obstáculos e compilar os shaders leva algumas
 *      centenas de milissegundos. Melhor gastar isso atrás de um botão do
 *      que num primeiro frame travado.
 */

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('viewport'));
const boot = document.getElementById('boot');
const bootButton = document.getElementById('boot-start');
const bootHelp = document.getElementById('boot-help');

const isMobile = detectMobile();

bootHelp.innerHTML = isMobile
  ? `
    <div>Manche <b>esquerdo</b>: acelerador (vertical) e giro (horizontal)</div>
    <div>Manche <b>direito</b>: inclinar e rolar</div>
    <div>Os manches nascem onde o dedo encosta — e o acelerador <b>fica onde
        você largou</b>, como num rádio de verdade</div>
    <div style="margin-top:10px;opacity:.7">Use o aparelho deitado</div>
  `
  : `
    <div><kbd>W</kbd><kbd>S</kbd> acelerador &nbsp; <kbd>A</kbd><kbd>D</kbd> giro (yaw)</div>
    <div><kbd>↑</kbd><kbd>↓</kbd> inclinar &nbsp; <kbd>←</kbd><kbd>→</kbd> rolar</div>
    <div><kbd>Enter</kbd> armar &nbsp; <kbd>M</kbd> modo acro/angle &nbsp;
         <kbd>C</kbd> câmera &nbsp; <kbd>H</kbd> retorno automático</div>
    <div><kbd>R</kbd> bateria nova &nbsp; <kbd>T</kbd> reiniciar circuito &nbsp;
         <kbd>F3</kbd> telemetria &nbsp; <kbd>Esc</kbd> pausa</div>
    <div style="margin-top:10px;opacity:.7">
      Um <b>gamepad</b> é muito melhor: os dois analógicos são exatamente os
      dois manches de um rádio. Aperte qualquer botão nele para conectar.
    </div>
  `;

let engine = null;

function launch() {
  if (engine) return;
  bootButton.disabled = true;
  bootButton.textContent = 'CARREGANDO…';

  // Dois rAF antes de construir: o primeiro deixa o navegador pintar o
  // estado "CARREGANDO", o segundo garante que essa pintura terminou. Sem
  // isso o trabalho pesado bloqueia a thread antes de o texto aparecer, e o
  // botão parece ter travado.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      engine = new Engine(canvas);
    } catch (err) {
      console.error(err);
      bootButton.textContent = 'ERRO';
      bootHelp.innerHTML = `<div style="color:#ff5f4d">Falha ao iniciar o renderer.<br>${
        String(err?.message ?? err)
      }</div>`;
      return;
    }

    // Destrava o áudio DENTRO do gesto do usuário — no iOS não há outra
    // oportunidade depois deste ponto.
    engine.audio.unlock();
    engine.start();

    boot.classList.add('is-hidden');
    // Remove da árvore depois da transição: um elemento em tela cheia parado
    // sobre o canvas continua custando composição a cada frame.
    setTimeout(() => { boot.style.display = 'none'; }, 700);

    // Ajustar `game.quad` ou `game.course` ao vivo no console é a forma mais
    // rápida de investigar um comportamento estranho.
    window.game = engine;
    console.info(
      '%cDRONE%c — `window.game` no console. F3 = telemetria.',
      'color:#6bff9d;font-weight:bold', 'color:#888',
    );
  }));
}

bootButton.addEventListener('click', launch);
// Enter e Espaço também iniciam: obrigar o uso do mouse numa tela que só tem
// um botão é atrito sem motivo.
window.addEventListener('keydown', (e) => {
  if (engine) return;
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    launch();
  }
});
