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
import { createQuality, classifyDevice, probeDevice, rungIndex, rungSettings, AUTO_LADDER, deviceTier } from './core/Quality.js';
import { BootScreen, yieldFrame } from './core/BootScreen.js';
import { Governor } from './core/Governor.js';
import { createRenderer, gpuCaps } from './core/Renderer.js';
import { Input, prefersTouch } from './core/Input.js';
import { Collision } from './core/Collision.js';
import { Player } from './core/Player.js';
import { parseShot, SHOT_PRESETS } from './core/Shots.js';

const STEP = 1 / 60;
window.__bootStarted = true;
// iOS < 15.4 não tem structuredClone (core/Input.js o usa nos atalhos):
// cópia JSON basta para os dados simples do jogo
if (typeof globalThis.structuredClone !== 'function') globalThis.structuredClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const params = new URLSearchParams(location.search);
const shot = parseShot(params);
const bootScreen = new BootScreen(document);
// ?bootlog=1 imprime o tempo de import/init de cada feature (window.__bootlog sempre existe)
const bootLogOn = params.get('bootlog') === '1';
const bootLog = (window.__bootlog = { t0: performance.now(), steps: [], features: [] });

// Modo screenshot: RNG global semeado (inclusive Math.random, para que
// features que o usem diretamente também sejam determinísticas).
if (shot) Math.random = mulberry32(shot.seed);

const bus = new Bus();
// Qualidade: padrão 'auto' (classe do aparelho + governador). O modo shot
// fica em 'high' fixo — capturas precisam ser comparáveis entre máquinas.
const device = shot ? classifyDevice({ gpu: 'shot' }) : classifyDevice(probeDevice(window));
// Camada do aparelho (core/Quality.js → TIER_PATCHES): celular corta o
// custo de carga/memória; ?lite=1 (botão "Tentar modo leve") ou uma carga
// anterior que não terminou (aba caiu por memória e o navegador recarregou —
// ver index.html) forçam o modo leve. ?lite=0 desliga a detecção.
const liteParam = params.get('lite');
const autoLite = !shot && liteParam !== '0' && !!window.__bootRetry;
const tier = shot ? 'desktop' : deviceTier(device, { lite: liteParam === '1' || autoLite });
const quality = createQuality(params.get('q') || (shot ? 'high' : autoLite ? 'low' : 'auto'), bus, device, { tier });
if (autoLite) bootScreen.note('modo leve automático — a carga anterior não terminou');
const container = document.getElementById('app');
const ui = document.getElementById('ui');
let renderer;
try {
  renderer = createRenderer(container, quality, { preserve: !!shot || params.has('preserve') });
} catch (err) {
  bootScreen.fail('Seu navegador não conseguiu criar o contexto gráfico (WebGL).', err?.message || err);
  throw err;
}

// Estatísticas somadas por frame (cena + viewmodel + passes de pós).
renderer.info.autoReset = false;
// Sem alvos half-float renderizáveis (GPUs móveis antigas) o compositor HDR
// e o PMREM ficam pretos: quality.hdr = false leva world/rendering ao caminho LDR.
const gpu = gpuCaps(renderer);
if (!gpu.halfFloatRT) quality.hdr = false;
if (!gpu.webgl2) {
  bootScreen.fail('Este navegador não tem WebGL2 — o jogo precisa dele.', 'WebGL2 indisponível');
  throw new Error('WebGL2 indisponível');
}

// ─── perda de contexto WebGL ──────────────────────────────────────────────
// Celulares derrubam o contexto sob pressão de memória (ou ao trocar de app).
// preventDefault() permite a restauração; o three recria o estado sozinho no
// 'webglcontextrestored' e re-sobe texturas/geometrias sob demanda. Enquanto
// perdido, o loop não renderiza. Se a perda acontecer DURANTE a carga, ou não
// voltar em 4 s, mostra a mensagem com "Tentar modo leve".
let contextLost = false;
let lostTimer = 0;
renderer.domElement.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  contextLost = true;
  console.warn('[ironline] contexto WebGL perdido');
  try {
    ctx.errors.push({ feature: 'core', phase: 'webgl', message: 'contexto WebGL perdido' });
  } catch {
    /* ctx ainda não existe */
  }
  bus.emit('renderer:lost', {});
  if (!window.__ready) bootScreen.fail('A placa de vídeo do aparelho reiniciou durante a carga (memória insuficiente).', 'webglcontextlost');
  else {
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => {
      if (contextLost) bootScreen.fail('O contexto gráfico foi perdido e não voltou.', 'webglcontextlost');
    }, 4000);
  }
}, false);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  clearTimeout(lostTimer);
  console.warn('[ironline] contexto WebGL restaurado');
  bus.emit('renderer:restored', {});
}, false);

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
  gpu,
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
    customPipeline = !!fn;
  },
  /** Pose atual dos presets de screenshot (world pode sobrescrever). */
  shotPose(name = shot?.name) {
    return ctx.services.world?.shotPoses?.[name] || SHOT_PRESETS[name]?.pose || shot?.preset.pose;
  },
};
let pipeline = () => ctx.defaultRender();
let customPipeline = false;

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

// Peso de cada feature na barra de progresso (o mundo domina a carga).
const BOOT_WEIGHT = { world: 6, rendering: 1.5, enemies: 1.2, weapon: 1.2, hud: 1 };
// Sem estas não há jogo: falha no init vira tela de erro (com modo leve).
const CRITICAL = new Set(['world']);
const NAMES = { world: 'mapa', rendering: 'iluminação', audio: 'áudio', movement: 'movimento', weapon: 'armas', enemies: 'inimigos', vfx: 'efeitos', hud: 'interface', touch: 'controles de toque', inventory: 'inventário', streaks: 'sequências' };

async function loadFeatures() {
  const entries = [];
  const list = Object.entries(modules).filter(([path]) => {
    const folder = path.split('/')[2];
    return !(only && !only.includes(folder)) && !skip.includes(folder);
  });
  // imports em paralelo (só baixa/avalia os módulos — nada pesado roda aqui)
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
    if (bootScreen.failed && contextLost) break;
    const w = BOOT_WEIGHT[e.name] || 0.6;
    const base = 0.05 + (acc / total) * 0.9;
    const span = (w / total) * 0.9;
    const label = `carregando ${NAMES[e.name] || e.name}`;
    // sub-progresso: a feature pode chamar ctx.bootProgress('texturas', 0.4)
    // (e `await` — cede um frame) durante um init longo
    ctx.bootProgress = (sub, f = 0) => bootScreen.step(sub ? `${label} — ${sub}` : label, base + span * Math.max(0, Math.min(1, f)));
    await bootScreen.step(label, base);
    const t = performance.now();
    try {
      await e.def.init?.(ctx);
      e.ok = true;
    } catch (err) {
      report(e.name, 'init', err);
      if (CRITICAL.has(e.name)) bootScreen.fail(`Falha ao carregar ${NAMES[e.name] || e.name}.`, err?.message || err);
    }
    const ms = Math.round(performance.now() - t);
    const heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined;
    bootLog.features.push({ name: e.name, ms, ok: e.ok, heapMB });
    if (bootLogOn) console.info(`[ironline] init ${e.name}: ${ms} ms${e.ok ? '' : ' (FALHOU)'}`);
    ctx.features.push(e);
    acc += w;
  }
  ctx.bootProgress = () => yieldFrame();
  await bootScreen.step('preparando a cena', 0.96);
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
  if (contextLost) return;
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
    bootLog.readyMs = Math.round(performance.now() - bootLog.t0);
    if (bootLogOn) console.info(`[ironline] pronto em ${bootLog.readyMs} ms`, bootLog);
    bootScreen.done();
    bus.emit('ready', ctx);
    // sem a hud (?only=/?skip=) ninguém remove a tela de carga
    if (!ctx.features.some((f) => f.name === 'hud' && f.ok)) bootScreen.remove();
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
  ctx.tier = quality.tier;
  ctx.bootProgress = () => yieldFrame();
  resize();
  await loadFeatures();
  if (bootScreen.failed) return; // a tela de erro fica; não inicia o loop
  // Pré-compila os shaders da cena antes do 1º frame: com
  // KHR_parallel_shader_compile a compilação não trava o thread (o 1º frame
  // em celular chegava a congelar a página por segundos). Teto de 20 s:
  // uma Promise que nunca resolve não pode prender a tela de carga.
  if (!shot && renderer.compileAsync) {
    const tc = performance.now();
    await bootScreen.step('compilando shaders', 0.97);
    // compositor próprio desenha a cena num alvo (sem tone mapping, saída
    // linear): compila as MESMAS variantes, senão o trabalho é jogado fora
    const dummy = customPipeline ? new THREE.WebGLRenderTarget(1, 1, { type: quality.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType }) : null;
    const prevRT = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(dummy);
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 20000))]);
    } catch (err) {
      console.warn('[ironline] pré-compilação falhou', err);
    } finally {
      renderer.setRenderTarget(prevRT);
      dummy?.dispose();
    }
    bootLog.steps.push(['shaders', Math.round(performance.now() - tc)]);
  }

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
  bootScreen.fail('O jogo não conseguiu iniciar.', err?.message || err);
});
