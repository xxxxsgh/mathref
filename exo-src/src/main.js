/**
 * EXOSFERA — ponto de entrada.
 *
 * O núcleo (src/core) monta renderer (reversed-Z + HDR), espaço em double
 * com origem flutuante, jogador com controladores plugáveis, seeds,
 * workers, pipeline e placeholders mínimos de universo/planeta/céu/nave.
 * TODO o conteúdo vem de FEATURES plugáveis em src/features/<nome>/index.js,
 * descobertas por import.meta.glob. Presets de screenshot em src/shots/*.js.
 * O contrato completo está em CONTRACT.md.
 */
import * as THREE from 'three';
import { Bus } from './core/Bus.js';
import { makeRng, mulberry32, createSeed } from './core/Rng.js';
import { FixedStep } from './core/FixedStep.js';
import { createQuality, classifyDevice, probeDevice, rungIndex, rungSettings, AUTO_LADDER, deviceTier } from './core/Quality.js';
import { BootScreen, yieldFrame } from './core/BootScreen.js';
import { PerfOverlay } from './core/PerfOverlay.js';
import { Governor } from './core/Governor.js';
import { createRenderer, gpuCaps } from './core/Renderer.js';
import { Input, prefersTouch } from './core/Input.js';
import { Space, WorldPos, CAMERA_NEAR, CAMERA_FAR } from './core/Space.js';
import { Player } from './core/Player.js';
import { Workers } from './core/Workers.js';
import { Ready } from './core/Ready.js';
import { Pipeline } from './core/Pipeline.js';
import { Menu } from './core/Menu.js';
import { collectPresets, parseShot, DEFAULT_PRESET } from './core/ShotPresets.js';
import { applyShot } from './core/ShotPlacer.js';
import * as Geo from './core/Geo.js';
import { installPlaceholderUniverse } from './core/placeholder/universe.js';
import { installPlaceholderPlanet } from './core/placeholder/planet.js';
import { installPlaceholderSky } from './core/placeholder/sky.js';
import { installPlaceholderShip } from './core/placeholder/ship.js';

const STEP = 1 / 60;
window.__bootStarted = true;
if (typeof globalThis.structuredClone !== 'function') globalThis.structuredClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const params = new URLSearchParams(location.search);
const presets = collectPresets(import.meta.glob('./shots/*.js', { eager: true }));
const shot = parseShot(params, presets);
const bootScreen = new BootScreen(document);
const bootLogOn = params.get('bootlog') === '1';
const bootLog = (window.__bootlog = { t0: performance.now(), steps: [], features: [] });

// Modo screenshot: RNG global semeado (Math.random também, para features
// que o usem direto serem determinísticas).
if (shot) Math.random = mulberry32(shot.seed);

const bus = new Bus();
const device = shot ? classifyDevice({ gpu: 'shot' }) : classifyDevice(probeDevice(window));
const liteParam = params.get('lite');
const autoLite = !shot && liteParam !== '0' && !!window.__bootRetry;
let tier = shot ? 'desktop' : deviceTier(device, { lite: liteParam === '1' || autoLite });
if (tier === 'low-desktop' && /^(low|medium|high|ultra)$/.test(params.get('q') || '')) tier = 'desktop';
const quality = createQuality(params.get('q') || (shot ? 'high' : autoLite ? 'low' : 'auto'), bus, device, { tier });
if (autoLite) bootScreen.note('modo leve automático — a carga anterior não terminou');
const container = document.getElementById('app');
const ui = document.getElementById('ui');
let renderer;
try {
  renderer = createRenderer(container, quality, { preserve: !!shot || params.has('preserve'), depthMode: params.get('depth') === 'log' ? 'log' : 'auto' });
} catch (err) {
  bootScreen.fail('Seu navegador não conseguiu criar o contexto gráfico (WebGL).', err?.message || err);
  throw err;
}
renderer.info.autoReset = false;
const gpu = gpuCaps(renderer);
if (!gpu.halfFloatRT) quality.hdr = false;
if (!gpu.webgl2) {
  bootScreen.fail('Este navegador não tem WebGL2 — o jogo precisa dele.', 'WebGL2 indisponível');
  throw new Error('WebGL2 indisponível');
}

let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  contextLost = true;
  console.warn('[exo] contexto WebGL perdido');
  try {
    ctx.errors.push({ feature: 'core', phase: 'webgl', message: 'contexto WebGL perdido' });
  } catch {
    /* ctx ainda não existe */
  }
  bus.emit('renderer:lost', {});
  if (!window.__ready) bootScreen.fail('A placa de vídeo reiniciou durante a carga (memória insuficiente).', 'webglcontextlost');
}, false);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  bus.emit('renderer:restored', {});
}, false);

// ─── camadas ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.name = 'world';
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, CAMERA_NEAR, CAMERA_FAR);
camera.name = 'camera';
scene.add(camera);

// Cockpit/viewmodel: desenhado por cima (depth limpo), FOV próprio, no
// referencial da NAVE (olho do piloto em player.cockpitEye). Luzes próprias
// que o núcleo orienta pelo sol do mundo a cada frame.
const cpScene = new THREE.Scene();
cpScene.name = 'cockpit';
const cpCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 60);
cpScene.add(cpCamera);
const cpSun = new THREE.DirectionalLight(0xffffff, 2.5);
const cpAmb = new THREE.HemisphereLight(0x9ec3ff, 0x202428, 0.5);
cpScene.add(cpSun, cpSun.target, cpAmb);

const input = new Input(renderer.domElement, bus);
{
  const t = params.get('touch');
  if (t === '1' || t === '0') input.touchForced = t === '1';
  if (!shot && (input.touchForced ?? (prefersTouch(window) || device.mobile))) input.setTouchMode(true);
}

const startPreset = shot ? shot.preset : DEFAULT_PRESET;
const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
const start = {
  seed: shot ? shot.seed : num('seed', DEFAULT_PRESET.seed) >>> 0,
  galaxy: shot ? startPreset.galaxy ?? 0 : num('galaxy', 0),
  systemIndex: shot ? startPreset.systemIndex ?? 0 : num('system', 0),
  planetIndex: shot ? startPreset.planetIndex ?? 0 : num('planet', 0),
};
const time = { now: 0, frame: 0, step: STEP, scale: 1, alpha: 1, virtual: !!shot, frameDt: STEP, world: 0, frozen: false };
const space = new Space();
const placeholders = {};
let pipeline;

const ctx = {
  THREE,
  Geo,
  WorldPos,
  renderer,
  canvas: renderer.domElement,
  scene,
  camera,
  cockpit: { scene: cpScene, camera: cpCamera, sun: cpSun, ambient: cpAmb, visible: true, baseChildren: cpScene.children.length },
  ui,
  bus,
  input,
  space,
  quality,
  gpu,
  depthMode: renderer.exoDepthMode,
  time,
  params,
  shot,
  start,
  seed: createSeed(start.seed),
  rng: makeRng(shot ? shot.seed : (Date.now() >>> 0)),
  workers: new Workers(),
  ready: new Ready(),
  services: {},
  features: [],
  errors: [],
  presets,
  /** Publica uma API: ctx.provide('planet', { ... }). Substitui o placeholder do núcleo. */
  provide(name, api) {
    let target = ctx.services[name];
    if (target?.placeholder && !api.placeholder) {
      try {
        placeholders[name]?.dispose();
      } catch (err) {
        report('core', `placeholder:${name}`, err);
      }
      delete placeholders[name];
      target = null;
    }
    target = target || {};
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(api));
    ctx.services[name] = target;
    bus.emit('service:ready', { name, api: target });
    return target;
  },
  service(name) {
    return ctx.services[name];
  },
  report: (...a) => report(...a),
};
const player = new Player(ctx);
ctx.player = player;
pipeline = new Pipeline(ctx);
ctx.pipeline = pipeline;
const menu = shot || params.get('menu') === '0' ? null : new Menu(ctx);
ctx.menu = menu || { disable() {}, show() {}, hide() {}, enabled: false };

function report(name, phase, err) {
  console.error(`[exo] '${name}' falhou em ${phase}:`, err);
  ctx.errors.push({ feature: name, phase, message: String(err?.message || err) });
}

// ─── placeholders (substituídos quando o sistema dono publica o serviço) ──
function installPlaceholder(name, fn) {
  if (ctx.services[name] && !ctx.services[name].placeholder) return;
  try {
    const p = fn(ctx);
    if (p.api) {
      placeholders[name] = p;
      ctx.services[name] = p.api;
    } else placeholders[name] = p;
  } catch (err) {
    report('core', `placeholder:${name}`, err);
  }
}
installPlaceholder('universe', installPlaceholderUniverse);
installPlaceholder('planet', installPlaceholderPlanet);
installPlaceholder('sky', installPlaceholderSky);
installPlaceholder('weather', () => {
  const api = {
    placeholder: true,
    weather: 'clear',
    cloudCoverage: 0.25,
    set(w) {
      api.weather = w || 'clear';
    },
  };
  return { api, dispose() {} };
});
// nave placeholder: sem serviço; some quando o sistema 'ship' publicar
placeholders['ship'] = installPlaceholderShip(ctx);
placeholders['ship'].api = { placeholder: true };
bus.on('service:ready', ({ name }) => {
  if (name === 'ship' && placeholders.ship) {
    placeholders.ship.dispose();
    delete placeholders.ship;
  }
});

// troca de planeta atual: o universe translada o mundo (novo planeta na origem)
bus.on('space:recenter', ({ offset }) => {
  space.recenter(offset);
  for (const v of [player.worldPos, player.prevPos, player.renderPos, player.cameraWorld]) v.sub(offset);
});

// ─── redimensionamento + governador ─────────────────────────────────────
const governor = new Governor({
  targetFps: Number(params.get('fps')) || device.targetFps,
  minScale: device.minScale,
  rung: quality.rung ? rungIndex(quality.rung) : rungIndex(quality.level),
  ceiling: rungIndex(device.ceiling),
  floor: AUTO_LADDER.length - 1,
  auto: quality.mode === 'auto',
  enabled: !shot && params.get('dynres') !== '0',
});
let govApplying = false;
const _sz = new THREE.Vector2();
function resize() {
  const w = container.clientWidth || innerWidth;
  const h = container.clientHeight || innerHeight;
  const k = Math.max(0.45, (quality.renderScale ?? 1) * governor.scale);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dprCap) * k);
  renderer.setSize(w, h, false);
  camera.aspect = cpCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  cpCamera.updateProjectionMatrix();
  renderer.getDrawingBufferSize(_sz);
  pipeline.setSize(_sz.x, _sz.y);
  bus.emit('resize', { width: w, height: h, dpr: renderer.getPixelRatio(), bufferWidth: _sz.x, bufferHeight: _sz.y });
}
addEventListener('resize', resize);
bus.on('quality:change', () => {
  renderer.shadowMap.enabled = !!quality.shadows;
  if (!govApplying) {
    governor.auto = quality.mode === 'auto';
    governor.rung = quality.rung ? rungIndex(quality.rung) : rungIndex(quality.level);
    governor.scale = 1;
    governor.hold(2);
  }
  resize();
});

// ─── features ───────────────────────────────────────────────────────────
const modules = import.meta.glob('./features/*/index.js');
const only = params.get('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const skip = params.get('skip')?.split(',').map((s) => s.trim()).filter(Boolean) || [];
const BOOT_WEIGHT = { planet: 5, universe: 1.5, sky: 1.5, flora: 2, render: 1.2, ship: 1.2, fauna: 1.2 };
const NAMES = {
  universe: 'galáxia', planet: 'planeta', sky: 'atmosfera', weather: 'clima', render: 'iluminação', ship: 'nave',
  flora: 'flora', fauna: 'fauna', gameplay: 'jogabilidade', audio: 'áudio',
};

async function loadFeatures() {
  const entries = [];
  const list = Object.entries(modules).filter(([path]) => {
    const folder = path.split('/')[2];
    return !(only && !only.includes(folder)) && !skip.includes(folder);
  });
  await bootScreen.step('baixando módulos', 0.02);
  const ti = performance.now();
  const mods = await Promise.all(list.map(([, load]) => load().then((m) => ({ m }), (err) => ({ err }))));
  bootLog.steps.push(['imports', Math.round(performance.now() - ti)]);
  list.forEach(([path], i) => {
    const folder = path.split('/')[2];
    const r = mods[i];
    if (r.err) return report(folder, 'import', r.err);
    const f = r.m.default || r.m;
    entries.push({ folder, name: f.name || folder, order: f.order ?? 50, def: f, ok: false, error: null });
  });
  entries.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const total = entries.reduce((s, e) => s + (BOOT_WEIGHT[e.name] || 0.6), 0) || 1;
  let acc = 0;
  for (const e of entries) {
    const w = BOOT_WEIGHT[e.name] || 0.6;
    const base = 0.05 + (acc / total) * 0.9;
    const span = (w / total) * 0.9;
    const label = `carregando ${NAMES[e.name] || e.name}`;
    ctx.bootProgress = (sub, f = 0) => bootScreen.step(sub ? `${label} — ${sub}` : label, base + span * Math.max(0, Math.min(1, f)));
    await bootScreen.step(label, base);
    const t = performance.now();
    try {
      await e.def.init?.(ctx);
      e.ok = true;
    } catch (err) {
      e.error = String(err?.message || err);
      report(e.name, 'init', err);
    }
    const ms = Math.round(performance.now() - t);
    bootLog.features.push({ name: e.name, ms, ok: e.ok });
    if (bootLogOn) console.info(`[exo] init ${e.name}: ${ms} ms${e.ok ? '' : ' (FALHOU)'}`);
    ctx.features.push(e);
    acc += w;
  }
  ctx.bootProgress = () => yieldFrame();
  await bootScreen.step('preparando a cena', 0.96);
}

function callAll(method, ...args) {
  for (const e of ctx.features) {
    const fn = e.ok && e.def[method];
    if (!fn) continue;
    try {
      fn.call(e.def, ...args);
    } catch (err) {
      e.ok = false;
      e.error = String(err?.message || err);
      report(e.name, method, err);
    }
  }
}

function placeholderFrames(dt) {
  for (const [name, p] of Object.entries(placeholders)) {
    if (!p.frame) continue;
    try {
      p.frame(dt, ctx);
    } catch (err) {
      report('core', `placeholder:${name}`, err);
      p.frame = null;
    }
  }
}

// ─── loop ───────────────────────────────────────────────────────────────
const fixed = new FixedStep(STEP, 5);
const _qi = new THREE.Quaternion();
const _d = new THREE.Vector3();

function step(dt) {
  player.update(dt);
  callAll('update', dt, ctx);
  input.endStep();
  time.now += dt;
  if (!time.frozen) time.world += dt;
}

function syncCockpit() {
  // câmera do cockpit no referencial da nave: q = q_nave⁻¹ · q_câmera
  _qi.copy(player.renderQuat).invert();
  cpCamera.quaternion.copy(_qi).multiply(player.cameraQuat);
  cpCamera.position.copy(player.cockpitEye);
  const sky = ctx.services.sky;
  if (sky?.sunDirection) {
    _d.copy(sky.sunDirection).applyQuaternion(_qi);
    cpSun.position.copy(_d).multiplyScalar(10);
    cpSun.target.position.set(0, 0, 0);
    cpSun.target.updateMatrixWorld();
    if (sky.sunColor) cpSun.color.copy(sky.sunColor);
    cpSun.intensity = (sky.sunIntensity ?? 3) * 0.8;
    if (sky.ambient) {
      cpAmb.color.copy(sky.ambient.color);
      cpAmb.intensity = sky.ambient.intensity * 0.8;
    }
  }
  cpScene.updateMatrixWorld();
}

let booted = false;
let shotReapplied = false;
let readySince = 0;
const readyTimeout = Number(params.get('readyTimeout') || 300) * 1000;

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
  // câmera em double → origem de render → reposiciona objetos flutuantes
  player.syncCamera(alpha, camera);
  space.setOrigin(player.cameraWorld);
  space.update();
  camera.updateMatrixWorld();
  syncCockpit();
  placeholderFrames(time.frozen ? 0 : dt);
  callAll('frame', dt, ctx);
  renderer.info.reset();
  if (contextLost) return;
  pipeline.render(dt);
  time.frame++;
  window.__frames = time.frame;
  ctx.ready.tick(time.frame);
  checkReady();
}

function checkReady() {
  if (window.__ready || !booted) return;
  const now = performance.now();
  if (ctx.ready.count && shot && now - readySince > readyTimeout) {
    ctx.errors.push({ feature: 'core', phase: 'ready', message: `tempo esgotado esperando: ${ctx.ready.labels().join(', ')}` });
    ctx.ready.pending.clear();
  }
  if (time.frame < 3 || !ctx.ready.settled()) return;
  if (shot && !shotReapplied) {
    // terreno pode ter mudado heightAt enquanto carregava: reaplica a pose uma vez
    shotReapplied = true;
    applyShotSafe();
    ctx.ready.changedAt = ctx.ready.frame;
    return;
  }
  window.__ready = true;
  bootLog.readyMs = Math.round(now - bootLog.t0);
  for (const f of ctx.ready.failures) ctx.errors.push({ feature: 'ready', phase: f.label, message: f.message });
  if (bootLogOn) console.info(`[exo] pronto em ${bootLog.readyMs} ms`, bootLog);
  bootScreen.done();
  bus.emit('ready', ctx);
  if (!ctx.services.hud) bootScreen.remove();
}

function applyShotSafe() {
  try {
    applyShot(ctx, shot.preset);
  } catch (err) {
    report('core', 'shot:apply', err);
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

let last = performance.now();
let perf = null;
function tick(now) {
  requestAnimationFrame(tick);
  if (window.__hold) {
    last = now;
    return;
  }
  const raw = (now - last) / 1000;
  const real = Math.min(0.1, raw);
  last = now;
  updateGovernor(raw);
  frame(time.virtual ? STEP : real);
  if (menu) menu.frame(real);
  perf?.sample(raw);
}

/** Ferramentas: roda n passos fixos sem renderizar (voo de teste etc.). */
ctx.debug = {
  steps(n = 1) {
    for (let i = 0; i < n; i++) step(STEP);
  },
  renderOnce() {
    frame(0);
  },
  workersSelfTest: () => ctx.workers.selfTest(),
};

async function boot() {
  window.__exo = ctx;
  window.__ready = false;
  window.__frames = 0;
  ctx.tier = quality.tier;
  ctx.bootProgress = () => yieldFrame();
  resize();
  await loadFeatures();
  if (bootScreen.failed) return;

  if (shot) {
    input.enabled = false;
    input.wantsLock = false;
    player.lookEnabled = false;
    player.moveEnabled = false;
    applyShotSafe();
    const n = Math.round((shot.preset.sim || 0) / STEP);
    for (let i = 0; i < n; i++) step(STEP);
    // tempo congelado: relógio do mundo parado, jogador parado
    time.frozen = true;
    player.frozen = true;
    ctx.cockpit.visible = shot.preset.cockpit ?? shot.preset.mode === 'ship';
  } else {
    const sp = ctx.services.gameplay?.spawn;
    try {
      if (sp) applyShot(ctx, { ...DEFAULT_PRESET, ...sp, camera: { ...DEFAULT_PRESET.camera, ...(sp.camera || {}) } });
      else applyShot(ctx, DEFAULT_PRESET);
    } catch (err) {
      report('core', 'spawn', err);
    }
    if (!renderer.compileAsync) {
      /* sem pré-compilação */
    } else {
      await bootScreen.step('compilando shaders', 0.97);
      const prev = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(pipeline.hdr);
        await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 20000))]);
      } catch (err) {
        console.warn('[exo] pré-compilação falhou', err);
      } finally {
        renderer.setRenderTarget(prev);
      }
    }
    perf = new PerfOverlay(ctx, { initial: params.get('fps') === 'show' || params.get('perf') === '1' });
    ctx.perf = perf;
    if (menu) menu.show();
  }
  booted = true;
  readySince = performance.now();
  governor.hold(3);
  bus.emit('game:start', ctx);
  requestAnimationFrame((t) => {
    last = t;
    tick(t);
  });
}

boot().catch((err) => {
  console.error('[exo] boot falhou', err);
  ctx.errors.push({ feature: 'core', phase: 'boot', message: String(err) });
  bootScreen.fail('O jogo não conseguiu iniciar.', err?.message || err);
});
