// Ponto de entrada: laço principal, API de roteiro (g) e menus.
import * as THREE from 'three';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { World, tangentTo } from './world.js';
import { CHAPTERS, SPEAKERS } from './chapters.js';

const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'ilo-save-v1';

function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; }
}

function boot() {
  const canvas = $('#gl');
  const input = new Input(canvas);
  const sound = new Sound();
  const ui = new UI(input, sound);
  let world;
  try {
    world = new World(canvas, input, ui, sound);
  } catch (e) {
    console.error(e);
    const b = $('#boot');
    b.classList.add('err');
    b.textContent = 'Não foi possível iniciar o WebGL neste navegador. Tente atualizar o navegador ou ativar a aceleração de hardware.';
    return;
  }

  const saved = loadSave();
  const g = {
    world, ui, sound, input,
    state: { chapter: 0, max: 0, dust: 0, sunsets: 0, sparks: 0, kite: 0, freed: false, ...(saved || {}) },
    timers: [], waiters: [], paused: false, running: false,

    save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(g.state)); } catch { /* sem storage */ } },
    wait(s) { return new Promise((r) => g.timers.push({ t: s, r })); },
    until(pred) { return new Promise((r) => g.waiters.push({ pred, r })); },
    lock() { world.locked++; },
    unlock() { world.locked = Math.max(0, world.locked - 1); },

    async say(who, text) {
      g.lock();
      try {
        if (!who) await ui.say('', text, { narr: true });
        else await ui.say(who, text, { color: SPEAKERS[who] });
      } finally { g.unlock(); }
    },
    /** Sequência de falas. `npc`: objeto/boneco para enquadrar e virar de frente. */
    async talk(lines, { npc = null, turn = true, zoom = 1 } = {}) {
      g.lock();
      try {
        if (npc) {
          const root = npc.root || npc;
          const tp = root.getWorldPosition(new THREE.Vector3());
          world.focus(tp, zoom);
          if (world.planet) {
            const c = world.ctrl;
            c.face.copy(tangentTo(c.n, tp.clone().normalize()));
            if (turn) world.lookAt(root, world.playerPos);
          }
        }
        for (const l of lines) {
          if (typeof l === 'function') { await l(); continue; }
          const [who, text] = l;
          if (!who) await ui.say('', text, { narr: true });
          else await ui.say(who, text, { color: SPEAKERS[who] });
        }
      } finally {
        ui.hideDialog();
        if (npc) world.focus(null);
        g.unlock();
      }
    },
    async choose(opts) { g.lock(); try { return await ui.choose(opts); } finally { g.unlock(); } },
    async ask(who, text, opts) {
      g.lock();
      try {
        await ui.say(who, text, { color: SPEAKERS[who], narr: !who, keep: true });
        return await ui.choose(opts);
      } finally { ui.hideDialog(); g.unlock(); }
    },
  };
  window.__g = g; // útil para depuração no console

  // ─── laço ───
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (g.paused) { input.endFrame(); return; }
    for (let i = g.timers.length - 1; i >= 0; i--) {
      const t = g.timers[i];
      t.t -= dt;
      if (t.t <= 0) { g.timers.splice(i, 1); t.r(); }
    }
    for (let i = g.waiters.length - 1; i >= 0; i--) {
      const w = g.waiters[i];
      if (w.pred()) { g.waiters.splice(i, 1); w.r(); }
    }
    if (input.wasPressed('pause') && g.running) setPause(true);
    if (input.wasPressed('mute')) toggleMute();
    world.update(dt);
    input.endFrame();
  }

  // ─── menus ───
  const menu = $('#menu'), pause = $('#pause');
  function setPause(v) {
    g.paused = v;
    pause.classList.toggle('hidden', !v);
    if (sound.ctx) v ? sound.ctx.suspend() : sound.ctx.resume();
  }
  function toggleMute() {
    const m = sound.toggleMute();
    $('#bMute').classList.toggle('off', m);
  }
  $('#bMute').classList.toggle('off', sound.muted);
  $('#bMute').addEventListener('click', toggleMute);
  $('#bPause').addEventListener('click', () => setPause(true));
  $('#bResume').addEventListener('click', () => setPause(false));
  $('#bToMenu').addEventListener('click', () => { location.reload(); });
  $('#bRestartCh').addEventListener('click', () => {
    try { sessionStorage.setItem('ilo-autostart', String(g.state.chapter)); } catch { /* ok */ }
    location.reload();
  });

  async function runFrom(i) {
    sound.init();
    menu.classList.add('hidden');
    document.body.classList.add('playing');
    ui.showHud(true);
    ui.setDust(g.state.dust);
    g.running = true;
    for (; i < CHAPTERS.length; i++) {
      g.state.chapter = i;
      g.state.max = Math.max(g.state.max, i);
      g.save();
      world.mode = 'none';
      await CHAPTERS[i].run(g);
    }
    // fim: volta ao menu
    g.running = false;
    g.state.chapter = 0;
    g.save();
    location.reload();
  }

  const list = $('#chapterList');
  CHAPTERS.forEach((c, i) => {
    const b = document.createElement('button');
    b.textContent = c.title;
    b.disabled = i > g.state.max;
    b.addEventListener('click', () => runFrom(i));
    list.appendChild(b);
  });
  $('#bChapters').addEventListener('click', () => list.classList.toggle('hidden'));
  if (saved && (saved.chapter > 0)) {
    const bc = $('#bContinue');
    bc.classList.remove('hidden');
    bc.textContent = `Continuar · ${CHAPTERS[saved.chapter]?.short || ''}`;
    bc.addEventListener('click', () => runFrom(saved.chapter));
  }
  $('#bNew').addEventListener('click', () => { Object.assign(g.state, { dust: 0, sunsets: 0, sparks: 0, kite: 0, freed: false }); runFrom(0); });

  // cena de fundo do menu: um pequeno planeta girando
  CHAPTERS.menuScene(g);
  requestAnimationFrame(frame);
  $('#boot').remove();
  ui.fade(0, 1200);
  sound.play('menu');
  const unlockAudio = () => { sound.init(); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);

  let auto = null;
  try { auto = sessionStorage.getItem('ilo-autostart'); sessionStorage.removeItem('ilo-autostart'); } catch { /* ok */ }
  const q = new URLSearchParams(location.search).get('cap');
  if (q !== null) auto = q;
  if (auto !== null && CHAPTERS[+auto]) runFrom(+auto);
}

boot();
