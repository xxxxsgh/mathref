// Ponto de entrada. Toda a lógica de jogo mora em src/systems/*; o núcleo
// (src/core) só fornece infraestrutura. Veja CONTRACT.md.
import { createEngine } from './core/Engine.js';

const bootEl = document.getElementById('boot');
const bar = document.getElementById('boot-bar');
const msg = document.getElementById('boot-msg');

function progress(p, text) {
  bar.style.width = Math.round(p * 100) + '%';
  if (text) msg.textContent = text;
}

async function main() {
  try {
    const ctx = await createEngine({ canvas: document.getElementById('game'), ui: document.getElementById('ui'), onProgress: progress });
    ctx.start();
    if (ctx.shot) bootEl.remove(); else setTimeout(() => bootEl.classList.add('done'), 200);
    window.__ready = true;
  } catch (e) {
    console.error(e);
    msg.textContent = 'FALHA AO INICIAR';
    const pre = document.createElement('div'); pre.className = 'err'; pre.textContent = String(e.stack || e);
    bootEl.appendChild(pre);
    (window.__errors ||= []).push('boot: ' + (e.stack || e));
    window.__ready = true;
  }
}
main();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}));
}
