/**
 * IRONLINE — ponto de entrada.
 *
 * O núcleo (src/core) monta renderer, cena, câmeras, entrada, colisão,
 * jogador e o loop. TODO o conteúdo do jogo vem de FEATURES plugáveis em
 * src/features/<nome>/index.js, descobertas aqui por import.meta.glob.
 * O contrato completo está em CONTRACT.md.
 */
import * as THREE from 'three';
import { Bus } from './core/Bus.js';
import { makeRng, mulberry32 } from './core/Rng.js';
import { FixedStep } from './core/FixedStep.js';
import { createQuality, classifyDevice, probeDevice, rungIndex, rungSettings, AUTO_LADDER } from './core/Quality.js';
import { Governor } from './core/Governor.js';
import { createRenderer } from './core/Renderer.js';
import { Input, prefersTouch } from './core/Input.js';
import { Collision } from './core/Collision.js';
import { Player } from './core/Player.js';
import { parseShot, SHOT_PRESETS } from './core/Shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const shot = parseShot(params);

// Modo screenshot: RNG global semeado (inclusive Math.random, para que
// features que o usem diretamente também sejam determinísticas).
if (shot) Math.random = mulberry32(shot.seed);

const bus = new Bus();
// Qualidade: padrão 'auto' (classe do aparelho + governador). O modo shot
// fica em 'high' fixo — capturas precisam ser comparáveis entre máquinas.
const device = shot ? classifyDevice({ gpu: 'shot' }) : classifyDevice(probeDevice(window));
const quality = createQuality(params.get('q') || (shot ? 'high' : 'auto'), bus, device);
const container = document.getElementById('app');
const ui = document.getElementById('ui');
const renderer = createRenderer(container, quality, { preserve: !!shot || params.has('preserve') });

// Estatísticas somadas por frame (cena + viewmodel + passes de pós).
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.name = 'world';
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, quality.drawDistance + 200);
camera.name = 'camera';
scene.add(camera); // filhos da câmera (ex.: luzes presas à visão) funcionam

// Cena da arma em primeira pessoa: desenhada por cima, com depth limpo,
// FOV próprio e near curto para a arma não atravessar paredes.
const vmScene = new THREE.Scene();
vmScene.name = 'viewmodel';
const vmCamera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.01, 20);
vmScene.add(vmCamera);

const collision = new Collision();
const input = new Input(renderer.domElement, bus);
// toque: ?touch=1|0 força; senão liga em aparelhos só de toque (e troca
// sozinho ao primeiro toque/clique — ver core/Input.js)
{
  const t = params.get('touch');
  if (t === '1' || t === '0') input.touchForced = t === '1';
  if (!shot && (input.touchForced ?? (prefersTouch(window) || device.mobile))) input.setTouchMode(true);
}
const player = new Player(camera, collision, input, bus);

const time = { now: 0, frame: 0, step: STEP, scale: 1, alpha: 1, virtual: !!shot, frameDt: STEP };

const ctx = {
  THREE,
  renderer,
  canvas: renderer.domElement,
  scene,
  camera,
  vm: { scene: vmScene, camera: vmCamera, visible: true },
  ui,
  bus,
  input,
  collision,
  player,
  quality,
  time,
  params,
  shot,
  rng: makeRng(shot ? shot.seed : (Date.now() >>> 0)),
  services: {},
  features: [],
  errors: [],
  /** Publica uma API para outras features: ctx.provide('audio', { play }) */
  provide(name, api) {
    // defineProperties (e não Object.assign) para preservar getters vivos
    // como `get ammo()` — Object.assign os congelaria no valor atual.
    const target = ctx.services[name] || {};
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(api));
    ctx.services[name] = target;
    bus.emit('service:ready', { name, api: ctx.services[name] });
    return ctx.services[name];
  },
  /** Lê um serviço (pode ser undefined se a feature não carregou). */
  service(name) {
    return ctx.services[name];
  },
  /** Desenha a cena da viewmodel por cima do que estiver no alvo atual. */
  renderViewmodel(target = null) {
    if (!ctx.vm.visible) return;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
    renderer.autoClear = prevAuto;
  },
  /** Pipeline padrão: cena + viewmodel. */
  defaultRender() {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    ctx.renderViewmodel(null);
  },
  /**
   * Gancho do compositor: a feature `rendering` troca o pipeline inteiro
   * (pós-processamento etc.). fn(ctx, frameDt). Passar null restaura o padrão.
   */
  setRenderPipeline(fn) {
    pipeline = fn || (() => ctx.defaultRender());
  },
  /** Pose atual dos presets de screenshot (world pode sobrescrever). */
  shotPose(name = shot?.name) {
    return ctx.services.world?.shotPoses?.[name] || SHOT_PRESETS[name]?.pose || shot?.preset.pose;
  },
};
let pipeline = () => ctx.defaultRender();

// ─── redimensionamento + governador de desempenho ───────────────────────
// `governor.scale` (minScale..1) multiplica o pixel ratio quando o tempo de
// frame real passa do orçamento (60 fps; 30 em celular). Em qualidade
// 'auto' ele também desce/sobe degraus de AUTO_LADDER com histerese (ver
// core/Governor.js). Fora do modo shot; `?dynres=0` desliga.
const governor = new Governor({
  targetFps: Number(params.get('fps')) || device.targetFps,
  minScale: device.minScale,
  rung: quality.rung ? rungIndex(quality.rung) : rungIndex(quality.level),
  ceiling: rungIndex(device.ceiling),
  floor: AUTO_LADDER.length - 1,
  auto: quality.mode === 'auto',
  enabled: !shot && params.get('dynres') !== '0',
});
const govLog = params.has('govlog');
let govApplying = false;
function resize() {
  const w = container.clientWidth || innerWidth;
  const h = container.clientHeight || innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dprCap) * governor.scale);
  renderer.setSize(w, h, false);
  camera.aspect = vmCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
  bus.emit('resize', { width: w, height: h, dpr: renderer.getPixelRatio() });
}
addEventListener('resize', resize);
bus.on('quality:change', () => {
  renderer.shadowMap.enabled = !!quality.shadows;
  // troca vinda de fora (menu de configurações): o governador acompanha
  if (!govApplying) {
    governor.auto = quality.mode === 'auto';
    governor.rung = quality.rung ? rungIndex(quality.rung) : rungIndex(quality.level);
    governor.scale = 1;
    governor.hold(2);
  }
  resize();
});

// ─── carregamento das features ───────────────────────────────────────────
const modules = import.meta.glob('./features/*/index.js');
const only = params.get('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const skip = params.get('skip')?.split(',').map((s) => s.trim()).filter(Boolean) || [];

async function loadFeatures() {
  const entries = [];
  for (const [path, load] of Object.entries(modules)) {
    const folder = path.split('/')[2];
    if (only && !only.includes(folder)) continue;
    if (skip.includes(folder)) continue;
    try {
      const mod = await load();
      const f = mod.default || mod;
      entries.push({ folder, name: f.name || folder, order: f.order ?? 50, def: f, ok: false, error: null });
    } catch (err) {
      report(folder, 'import', err);
    }
  }
  entries.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  for (const e of entries) {
    try {
      await e.def.init?.(ctx);
      e.ok = true;
    } catch (err) {
      report(e.name, 'init', err);
    }
    ctx.features.push(e);
  }
}

function report(name, phase, err) {
  console.error(`[ironline] feature '${name}' falhou em ${phase}:`, err);
  ctx.errors.push({ feature: name, phase, message: String(err?.message || err) });
}

function callAll(method, ...args) {
  for (const e of ctx.features) {
    const fn = e.ok && e.def[method];
    if (!fn) continue;
    try {
      fn.call(e.def, ...args);
    } catch (err) {
      // Uma feature que lança no update é desligada para não inundar o console.
      e.ok = false;
      report(e.name, method, err);
    }
  }
}

// ─── loop ───────────────────────────────────────────────────────────────
const fixed = new FixedStep(STEP, 5);

function applyShotPose() {
  const pose = ctx.shotPose();
  if (pose) player.setPose(pose);
}

function step(dt) {
  if (shot) applyShotPose();
  player.update(dt, ctx);
  callAll('update', dt, ctx);
  input.endStep();
  time.now += dt;
}

function frame(frameDt) {
  const dt = frameDt * time.scale;
  let alpha = 1;
  if (time.virtual) {
    if (time.scale > 0) step(STEP);
  } else if (time.scale > 0) {
    const r = fixed.advance(dt);
    for (let i = 0; i < r.steps; i++) step(STEP);
    alpha = r.alpha;
  }
  time.alpha = alpha;
  time.frameDt = dt;
  player.syncCamera(alpha);
  camera.updateMatrixWorld();
  callAll('frame', dt, ctx);
  renderer.info.reset();
  try {
    pipeline(ctx, dt);
  } catch (err) {
    report('pipeline', 'render', err);
    pipeline = () => ctx.defaultRender();
  }
  time.frame++;
  window.__frames = time.frame;
  if (!window.__ready && time.frame >= 3) {
    window.__ready = true;
    bus.emit('ready', ctx);
  }
}

function updateGovernor(realDt) {
  if (!governor.enabled) return;
  if (time.scale <= 0 || document.hidden) {
    governor.hold(0.5);
    return;
  }
  const d = governor.sample(realDt);
  if (!d) return;
  if (govLog) console.info('[ironline] governador', d, governor.last);
  if (d.rung != null && quality.mode === 'auto') {
    govApplying = true;
    try {
      quality.set({ ...rungSettings(d.rung), rung: AUTO_LADDER[d.rung].name });
    } finally {
      govApplying = false;
    }
    bus.emit('quality:auto', { rung: AUTO_LADDER[d.rung].name, scale: governor.scale, reason: d.reason });
  } else resize();
}
ctx.governor = governor;
// compatibilidade: ctx.dynres.scale / enabled / min (API antiga)
ctx.dynres = {
  get scale() { return governor.scale; },
  get enabled() { return governor.enabled; },
  set enabled(v) { governor.enabled = !!v; },
  get min() { return governor.minScale; },
};

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  // __hold: ferramentas (shot.mjs/e2e) congelam o loop para capturar a tela
  // sem disputar a GPU (SwiftShader leva segundos por frame).
  if (window.__hold) {
    last = now;
    return;
  }
  const raw = (now - last) / 1000;
  const real = Math.min(0.1, raw);
  last = now;
  updateGovernor(raw); // sem limite: o governador descarta picos > 250 ms sozinho
  frame(time.virtual ? STEP : real);
}

async function boot() {
  window.__ironline = ctx;
  window.__ready = false;
  window.__frames = 0;
  resize();
  await loadFeatures();

  if (shot) {
    input.enabled = false;
    input.wantsLock = false;
    player.lookEnabled = false;
    player.moveEnabled = false;
    ctx.vm.visible = shot.preset.viewmodel !== false;
    applyShotPose();
    // Aquecimento determinístico (animações, IA, partículas assentarem).
    const n = Math.round((shot.preset.sim || 0) / STEP);
    for (let i = 0; i < n; i++) step(STEP);
    if (shot.pause) time.scale = 0;
  } else {
    const sp = ctx.services.world?.spawnPoints?.[0];
    if (sp) player.setPose(sp);
    else player.setPose({ position: [0, 1, 0] });
  }
  bus.emit('game:start', ctx);
  requestAnimationFrame((t) => {
    last = t;
    tick(t);
  });
}

boot().catch((err) => {
  console.error('[ironline] boot falhou', err);
  ctx.errors.push({ feature: 'core', phase: 'boot', message: String(err) });
});
