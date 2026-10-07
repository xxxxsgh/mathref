// RAFAEL PAOLI SHOOTER 3D: REVOLUTION — ponto de entrada.
//
// Monta o contexto compartilhado (ctx), descobre os sistemas em
// src/systems/*/index.js, inicializa em ordem e roda o laço:
//   update(dt fixo 1/60) → lógica/física/IA
//   frame(dt variável)   → visual/câmera/HUD
// Ver CONTRACT.md para as regras entre sistemas.

import * as THREE from 'three/webgpu';
import { Bus } from './core/Bus.js';
import { Input } from './core/Input.js';
import { Quality, detectPreset } from './core/Quality.js';
import { Save } from './core/Save.js';
import { Galaxy } from './core/Galaxy.js';
import { World } from './core/World.js';
import { freeCam } from './core/FreeCam.js';

const params = new URLSearchParams(location.search);
const bootEl = document.getElementById('boot');
const bootBar = bootEl.querySelector('.bar i');
const bootMsg = bootEl.querySelector('.msg');
function boot(msg, frac) {
  if (msg) bootMsg.textContent = msg;
  if (frac !== undefined) bootBar.style.width = Math.round(frac * 100) + '%';
}

async function start() {
  const canvas = document.getElementById('game');
  const wantGL = params.get('gl') === '1' || !navigator.gpu;
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: false, // AA vem do pós-processamento (TAA/FXAA) — MSAA não combina com o pipeline HDR
    forceWebGL: wantGL,
    logarithmicDepthBuffer: true, // de 5 cm a bilhões de metros no mesmo frame
    powerPreference: 'high-performance',
    alpha: false,
    preserveDrawingBuffer: params.has('preserve'),
  });
  boot('inicializando GPU', 0.05);
  await renderer.init();
  const isWebGPU = !!renderer.backend?.isWebGPUBackend;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const bus = new Bus();
  const quality = new Quality(bus, params.get('q') || detectPreset(isWebGPU));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const root = new THREE.Group();
  root.name = 'world-root';
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 5e9);
  scene.add(camera);
  // Luz da estrela — o sistema "space" atualiza direção/cor/intensidade.
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  sun.position.set(0, 0, 1);
  scene.add(sun, sun.target);
  const ambient = new THREE.HemisphereLight(0x8899bb, 0x110d0a, 0.05);
  scene.add(ambient);

  const ui = document.getElementById('ui');
  const ctx = {
    THREE,
    renderer,
    isWebGPU,
    scene,
    root,
    camera,
    sun,
    ambient,
    bus,
    quality,
    params,
    ui,
    input: new Input(canvas),
    save: new Save(),
    galaxy: new Galaxy(params.get('seed') || 'fenda-de-orion'),
    services: new Map(),
    systems: [],
    errors: [],
    scenarios: new Map(),
    mode: 'boot',
    paused: false,
    time: 0, // tempo de jogo acumulado (s)
    frameCount: 0,
    fps: 0,
    // Estado serializável do jogo (save). Cada sistema cuida da sua chave.
    state: { version: 1, systemId: 'orfeu', credits: 1500, rep: { hegemony: -20, free: 0, corsairs: -10, guild: 0, watchers: 0 } },
    boot,
  };
  ctx.world = new World(ctx);

  /** Publica uma API para outros sistemas (ctx.services.get(nome)). */
  ctx.provide = (name, api) => {
    ctx.services.set(name, api);
    bus.emit('service:' + name, api);
    return api;
  };
  /** Obtém um serviço (ou undefined se o sistema não existe/falhou). */
  ctx.get = (name) => ctx.services.get(name);
  /** Troca o modo de jogo: 'menu' | 'cinematic' | 'ship' | 'foot' | 'map' | 'station'. */
  ctx.setMode = (mode, data = {}) => {
    const prev = ctx.mode;
    ctx.mode = mode;
    bus.emit('mode:change', { mode, prev, ...data });
  };
  /** Registra um cenário de teste/captura (?scenario=nome). */
  ctx.scenario = (name, desc, setup) => ctx.scenarios.set(name, { desc, setup });
  /** Camada DOM própria de um sistema dentro de #ui. */
  ctx.uiLayer = (name, z = 0) => {
    let el = ui.querySelector(`[data-layer="${name}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.layer = name;
      el.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${z}`;
      ui.appendChild(el);
    }
    return el;
  };
  // Render padrão; o sistema "render" substitui por um pipeline de pós.
  ctx.render = () => renderer.render(scene, camera);
  canvas.addEventListener('click', () => {
    if (['ship', 'foot', 'station', 'free'].includes(ctx.mode)) ctx.input.lock();
  });

  window.__rps = ctx;

  // ─── redimensionamento ───────────────────────────────────────────────
  const resize = () => {
    const pr = Math.min(devicePixelRatio || 1, quality.p.pixelRatioMax) * quality.renderScale;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    bus.emit('resize', { w: innerWidth, h: innerHeight, pr });
  };
  addEventListener('resize', resize);
  bus.on('quality:change', resize);
  resize();

  // ─── descoberta e init dos sistemas ──────────────────────────────────
  const mods = import.meta.glob('./systems/*/index.js');
  const loaded = [];
  for (const [path, load] of Object.entries(mods)) {
    try {
      const m = await load();
      const sys = m.default || m.system;
      if (!sys?.name) throw new Error('sem export default {name,...}');
      loaded.push(sys);
    } catch (err) {
      const name = path.split('/')[2];
      ctx.errors.push({ system: name, phase: 'import', message: err.message });
      console.error(`[rps3d] falha ao importar ${name}`, err);
    }
  }
  loaded.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  ctx.world.loadSystem(ctx.state.systemId);
  for (let i = 0; i < loaded.length; i++) {
    const sys = loaded[i];
    boot(`carregando ${sys.label || sys.name}`, 0.1 + 0.8 * (i / loaded.length));
    try {
      await sys.init?.(ctx);
      sys.ok = true;
    } catch (err) {
      sys.ok = false;
      ctx.errors.push({ system: sys.name, phase: 'init', message: err.message });
      console.error(`[rps3d] init de ${sys.name} falhou`, err);
    }
    ctx.systems.push(sys);
  }
  // recarrega o sistema estelar agora que todos escutam 'world:system'
  ctx.world.loadSystem(ctx.state.systemId);

  const run = (sys, phase, dt) => {
    if (!sys.ok || !sys[phase]) return;
    try {
      sys[phase](dt, ctx);
    } catch (err) {
      sys._errs = (sys._errs || 0) + 1;
      if (sys._errs <= 3) {
        ctx.errors.push({ system: sys.name, phase, message: err.message });
        console.error(`[rps3d] ${sys.name}.${phase}`, err);
      }
      if (sys._errs > 120) sys.ok = false; // sistema quebrado não derruba o jogo
    }
  };

  // ─── cenário de teste / início ───────────────────────────────────────
  const scen = params.get('scenario');
  if (scen) {
    const s = ctx.scenarios.get(scen);
    if (!s) {
      ctx.errors.push({ system: 'core', phase: 'scenario', message: `cenário desconhecido: ${scen} (existem: ${[...ctx.scenarios.keys()].join(', ')})` });
    } else {
      try {
        await s.setup(ctx);
      } catch (err) {
        ctx.errors.push({ system: 'core', phase: 'scenario', message: err.message });
        console.error(err);
      }
    }
  } else {
    bus.emit('game:boot', {}); // o sistema de menu/história decide o que mostrar
  }

  boot('pronto', 1);
  bootEl.classList.add('hide');
  setTimeout(() => bootEl.remove(), 900);

  // ─── laço ────────────────────────────────────────────────────────────
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  let fpsAcc = 0;
  let fpsN = 0;
  window.__frames = 0;
  window.__ready = true;
  const loop = async () => {
    if (window.__hold) {
      requestAnimationFrame(loop);
      return;
    }
    const now = performance.now();
    // ?fixeddt=1 → simulação determinística (capturas no SwiftShader lento)
    let dt = params.has('fixeddt') ? STEP : Math.min(0.1, (now - last) / 1000);
    last = now;
    fpsAcc += dt;
    fpsN++;
    if (fpsAcc > 0.5) {
      ctx.fps = fpsN / fpsAcc;
      fpsAcc = 0;
      fpsN = 0;
    }
    ctx.input.pollGamepad();
    if (!ctx.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        ctx.time += STEP;
        ctx.world.time += STEP * ctx.world.timeScale;
        for (const s of ctx.systems) run(s, 'update', STEP);
        ctx.input.endStep();
        acc -= STEP;
        steps++;
      }
      if (steps === 5) acc = 0;
    }
    ctx.alpha = acc / STEP;
    freeCam(ctx, dt);
    for (const s of ctx.systems) run(s, 'frame', dt);
    ctx.world.rebase();
    if (quality.govern(dt)) resize();
    try {
      await ctx.render();
    } catch (err) {
      if (ctx.frameCount < 3) {
        ctx.errors.push({ system: 'core', phase: 'render', message: err.message });
        console.error(err);
      }
    }
    ctx.frameCount++;
    window.__frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ─── save automático ─────────────────────────────────────────────────
  const doSave = () => {
    bus.emit('save:collect', ctx.state); // sistemas escrevem no estado
    return ctx.save.put('autosave', ctx.state);
  };
  ctx.saveGame = doSave;
  setInterval(() => {
    if (['ship', 'foot', 'station'].includes(ctx.mode)) doSave();
  }, 60000);
  addEventListener('pagehide', () => doSave());

  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start().catch((err) => {
  console.error(err);
  boot('falha: ' + err.message);
  window.__fatal = err.message;
});
