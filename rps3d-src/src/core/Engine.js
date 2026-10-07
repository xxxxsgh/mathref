// Núcleo do RPS3D: cria o renderer (WebGPU com fallback WebGL2), o contexto
// compartilhado `ctx`, carrega os sistemas de src/systems/*/index.js e roda
// o laço (passo fixo para lógica, frame variável para visual).
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { Bus } from './Bus.js';
import { Input } from './Input.js';
import { makeQuality, detectPreset, PRESETS } from './Quality.js';
import { Save } from './Save.js';
import { Galaxy, FACTIONS, BIOMES } from './Universe.js';
import { World } from './World.js';
import { Collision } from './Collision.js';
import { Rng, Noise } from './Rng.js';

const STEP = 1 / 60;

export async function createEngine({ canvas, ui, onProgress = () => {} }) {
  const params = new URLSearchParams(location.search);
  const bus = new Bus();
  const errors = [];
  window.__errors = errors;
  addEventListener('error', (e) => errors.push(String(e.message || e)));
  addEventListener('unhandledrejection', (e) => errors.push('promise: ' + String(e.reason?.stack || e.reason)));

  // ─── renderer ──────────────────────────────────────────────────────────
  // three r186 passa `swizzle: 'rgba'` em todo createView(); Chromes de 2025
  // (≤141) esperavam outro tipo nesse campo e lançam TypeError em TODO frame.
  // 'rgba' é o padrão, então removê-lo é inócuo em qualquer navegador.
  if (self.GPUTexture && !GPUTexture.prototype.__rpsPatched) {
    const cv = GPUTexture.prototype.createView;
    GPUTexture.prototype.createView = function (d) {
      if (d && d.swizzle === 'rgba') { const { swizzle, ...rest } = d; return cv.call(this, rest); }
      return cv.call(this, d);
    };
    GPUTexture.prototype.__rpsPatched = true;
  }
  const forceWebGL = params.get('backend') === 'webgl' || !navigator.gpu;
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: false, forceWebGL,
    logarithmicDepthBuffer: true, // faixa de 0,05 m a 1e9 m (cockpit ↔ planetas)
    powerPreference: 'high-performance',
    alpha: false,
  });
  await renderer.init();
  const backend = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl';
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const save = new Save(bus);
  const prefs = await save.prefs().catch(() => ({}));
  const qName = params.get('q') || prefs.quality || detectPreset(backend);
  const quality = makeQuality(PRESETS[qName] ? qName : 'high');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2e9);
  scene.add(camera); // filhos da câmera (cockpit, armas) renderizam

  const player = {
    mode: 'title',                 // title | cinematic | ship | foot | map
    camWorld: new THREE.Vector3(), // posição de MUNDO da câmera (quem controla a câmera escreve)
    pos: new THREE.Vector3(),      // posição de mundo do corpo do jogador (pé ou nave)
    vel: new THREE.Vector3(),
    ship: null,                    // estado da nave atual (preenchido por `flight`)
    body: null,                    // estado a pé (preenchido por `foot`)
    bodyId: null,                  // corpo celeste dominante (SOI) atual
    altitude: Infinity,            // altitude sobre o corpo dominante (m)
  };

  const galaxy = new Galaxy(Number(params.get('seed')) || 2387);
  const universe = {
    galaxy, FACTIONS, BIOMES,
    systemId: null, system: null,
    /** Troca de sistema estelar (salto). Emite 'system:change'. */
    setSystem(id) {
      const prev = universe.systemId;
      universe.systemId = id; universe.system = galaxy.system(id);
      bus.emit('system:change', { from: prev, to: id, system: universe.system });
      return universe.system;
    },
  };

  const services = {};
  const shots = new Map();
  const time = { now: 0, frame: 0, step: STEP, scale: 1, alpha: 0, frameDt: STEP, world: 600, virtual: false };

  const ctx = {
    THREE, TSL, renderer, backend, canvas, ui, scene, camera,
    bus, input: new Input(canvas), quality, time, params, save, prefs,
    universe, player, collision: new Collision(), services, errors,
    Rng, Noise,
    world: null,
    game: {
      mode: 'title', paused: false,
      setMode(to, data = {}) {
        const from = ctx.game.mode;
        ctx.game.mode = to; player.mode = to;
        bus.emit('mode:change', { from, to, data });
      },
      setPaused(p) { ctx.game.paused = p; time.scale = p ? 0 : 1; bus.emit('pause', { paused: p }); },
    },
    /** Publica uma API para outros sistemas: ctx.provide('planets', api). */
    provide(name, api) { services[name] = api; bus.emit('service:' + name, api); return api; },
    /** Espera um serviço existir (útil se a ordem de init não garantir). */
    need(name) { return services[name] ? Promise.resolve(services[name]) : new Promise((res) => bus.once('service:' + name, res)); },
    /** Registra um preset de screenshot: ?shot=nome. setup(ctx) posiciona câmera/estado. */
    shots: { register(name, setup, opts = {}) { shots.set(name, { setup, ...opts }); }, list: () => [...shots.keys()] },
    /**
     * Função de render. Padrão: cena direto. O sistema `rendering` substitui
     * por um pipeline de pós-processamento. Assinatura: (ctx, dt) => void.
     */
    render: (c) => renderer.render(scene, camera),
    systems: [],
    log: (...a) => console.log('[rps3d]', ...a),
  };
  ctx.world = new World(scene, camera, player);
  window.__ctx = ctx;

  // ─── tamanho / DPR ─────────────────────────────────────────────────────
  ctx.resize = () => {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, quality.dprCap) * quality.dynamicScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    bus.emit('resize', { w, h, dpr });
  };
  addEventListener('resize', ctx.resize);
  ctx.resize();

  // ─── sistemas ──────────────────────────────────────────────────────────
  const only = params.get('systems')?.split(',');
  const mods = import.meta.glob('../systems/*/index.js');
  const loaded = [];
  const entries = Object.entries(mods);
  let i = 0;
  for (const [path, load] of entries) {
    const dir = path.split('/').at(-2);
    if (only && !only.includes(dir)) continue;
    try {
      const m = await load();
      const sys = m.default || Object.values(m).find((v) => v && v.name && (v.init || v.update || v.frame));
      if (sys) loaded.push(sys); else console.warn('[rps3d] sistema sem export:', dir);
    } catch (e) { errors.push(`import ${dir}: ${e.stack || e}`); console.error(e); }
    onProgress(++i / entries.length * 0.3, 'CARREGANDO ' + dir.toUpperCase());
  }
  loaded.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  ctx.systems = loaded;

  // Sistema inicial: o da abertura (o sistema `story` pode trocar).
  universe.setSystem(params.get('system') || 'halden');

  let k = 0;
  for (const s of loaded) {
    s.enabled = true;
    try { await s.init?.(ctx); }
    catch (e) { s.enabled = false; errors.push(`init ${s.name}: ${e.stack || e}`); console.error(`[rps3d] init ${s.name}`, e); }
    onProgress(0.3 + (++k / loaded.length) * 0.65, 'INICIALIZANDO ' + String(s.name).toUpperCase());
  }

  // ─── modo screenshot ───────────────────────────────────────────────────
  const shotName = params.get('shot');
  ctx.shot = null;
  if (shotName) {
    save.disabled = true;
    time.virtual = true;
    const preset = shots.get(shotName);
    ctx.shot = { name: shotName, known: !!preset };
    if (!preset) errors.push(`shot desconhecido: ${shotName}. Conhecidos: ${[...shots.keys()].join(', ')}`);
    else {
      try { await preset.setup(ctx); } catch (e) { errors.push(`shot ${shotName}: ${e.stack || e}`); }
    }
  } else {
    await save.load().catch((e) => console.warn('[save]', e));
    setInterval(() => { if (ctx.game.mode !== 'title') save.write(); }, 60000);
    addEventListener('visibilitychange', () => { if (document.hidden && ctx.game.mode !== 'title') save.write(); });
  }
  window.__shots = [...shots.keys()];

  // ─── laço ──────────────────────────────────────────────────────────────
  let last = performance.now(), acc = 0;
  const fpsWin = [];
  ctx.stats = { fps: 0, ms: 0, drawCalls: 0, triangles: 0 };
  function disable(s, where, e) {
    s.enabled = false;
    const msg = `${where} ${s.name}: ${e.stack || e}`;
    errors.push(msg); console.error('[rps3d] sistema desligado —', msg);
    bus.emit('system:error', { name: s.name, where, error: e });
  }
  async function tick() {
    const now = performance.now();
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (time.virtual) dt = 1 / 30;
    fpsWin.push(dt); if (fpsWin.length > 60) fpsWin.shift();
    const avg = fpsWin.reduce((a, b) => a + b, 0) / fpsWin.length;
    ctx.stats.fps = 1 / avg; ctx.stats.ms = avg * 1000;
    time.frameDt = dt * time.scale;
    time.now += dt;
    ctx.input.poll(dt);
    acc += dt * time.scale;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      time.world += STEP;
      for (const s of loaded) if (s.enabled && s.update) { try { s.update(STEP, ctx); } catch (e) { disable(s, 'update', e); } }
      ctx.input.endStep();
      acc -= STEP; steps++;
    }
    if (steps === 6) acc = 0;
    time.alpha = acc / STEP;
    for (const s of loaded) if (s.enabled && s.frame) { try { s.frame(time.frameDt, ctx); } catch (e) { disable(s, 'frame', e); } }
    ctx.world.sync();
    try { await ctx.render(ctx, time.frameDt); }
    catch (e) { errors.push('render: ' + (e.stack || e)); console.error(e); ctx.render = (c) => renderer.render(scene, camera); }
    const info = renderer.info.render;
    ctx.stats.drawCalls = info.drawCalls ?? info.calls ?? 0; ctx.stats.triangles = info.triangles ?? 0;
    time.frame++;
    window.__frame = time.frame;
  }
  ctx.start = () => renderer.setAnimationLoop(tick);
  ctx.stop = () => renderer.setAnimationLoop(null);
  bus.emit('boot:done', ctx);
  onProgress(1, 'PRONTO');
  return ctx;
}
