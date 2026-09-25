// Boot: renderer, pós-processamento, ginásio, jogo, UI, loop principal.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Arena } from './arena.js';
import { Audio } from './audio.js';
import { Save } from './data.js';
import { FX } from './props.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const bootBar = document.getElementById('bootBar');
const bootMsg = document.getElementById('bootMsg');
const step = (p, m) => { bootBar.style.width = p + '%'; if (m) bootMsg.textContent = m; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

async function boot() {
  const save = new Save();
  const S = save.s;
  step(10, 'Ligando as luzes…');
  await nextFrame();

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.quality !== 'baixa', powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = S.quality !== 'baixa';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 60);

  step(30, 'Montando a mesa…');
  await nextFrame();
  const arena = new Arena(scene, renderer, S.quality);
  const fx = new FX(scene);
  const audio = new Audio(S);
  step(55, 'Chamando os jogadores…');
  await nextFrame();
  const input = new Input(canvas);
  const ui = new UI({ save, audio, camera });
  const game = new Game({ scene, camera, arena, audio, save, ui, fx, input, renderer });
  ui.game = game;

  // pós-processamento
  let composer = null, bloom = null;
  function setupPost() {
    composer = null;
    if (S.quality === 'baixa') return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    if (S.quality === 'alta') {
      bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.5, 0.88);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    resize();
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    const pr = S.quality === 'alta' ? Math.min(devicePixelRatio, 2) : S.quality === 'media' ? Math.min(devicePixelRatio, 1.5) : 1;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    input.aspect = w / h;
    if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
  }
  addEventListener('resize', resize);
  setupPost();

  step(80, 'Aquecendo a torcida…');
  // pré-compila shaders
  game.toMenu();
  game.update(0.016);
  renderer.compile(scene, camera);
  await nextFrame();

  // pausa / sair
  let paused = false;
  const setPause = p => {
    if (game.mode === 'menu' || game.phase === 'over') return;
    paused = p;
    document.getElementById('pause').classList.toggle('hidden', !p);
    document.body.classList.toggle('ingame', !p);
  };
  ui.onPause = setPause;
  ui.onQuit = () => { setPause(false); paused = false; document.getElementById('pause').classList.add('hidden'); game.toMenu(); ui.showMenu('home'); };
  ui.onRestart = () => {
    setPause(false);
    const m = game.mode;
    if (m === 'match') game.startMatch({ opponent: game.opp, games: game.ref.gamesToWin, career: game.career });
    else if (m === 'rally') game.startRally();
    else if (m === 'targets') game.startTargets();
    else if (m === 'tutorial') game.startTutorial();
  };
  ui.onSettings = k => {
    audio.applyVolumes();
    if (k === 'music') { if (S.music && game.mode === 'menu') audio.startMusic(); else if (!S.music) audio.stopMusic(); }
    if (k === 'quality') location.reload();
  };
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') setPause(!paused);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode !== 'menu') setPause(true); });

  // áudio só depois de um gesto do usuário
  const unlock = () => { audio.init(); if (game.mode === 'menu' && S.music) audio.startMusic(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

  step(100, 'Pronto!');
  ui.showMenu('home');
  const b = document.getElementById('boot'); b.classList.add('out'); setTimeout(() => b.remove(), 700);

  // recompensa diária / primeira vez
  setTimeout(() => {
    const r = save.claimDaily();
    if (r) ui.daily(r);
    if (!save.d.tutorial && save.d.stats.played === 0) {
      document.getElementById('help').classList.remove('hidden');
    }
  }, 600);

  // loop
  let last = performance.now(), acc = 0, frames = 0, fpsT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) game.update(dt);
    arena.update(game.t, dt);
    fx.update(dt);
    if (composer) composer.render(); else renderer.render(scene, camera);
    // qualidade adaptativa: se muito lento em "alta", desliga o bloom
    frames++; fpsT += dt;
    if (fpsT > 4) { const fps = frames / fpsT; frames = 0; fpsT = 0; if (fps < 32 && bloom && bloom.enabled) bloom.enabled = false; }
  }
  requestAnimationFrame(loop);
  window.__vt = { game, save, ui };
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot().catch(e => {
  console.error(e);
  const m = document.getElementById('bootMsg');
  if (m) m.textContent = 'Erro ao iniciar: ' + e.message;
});
