#!/usr/bin/env node
/**
 * Diagnóstico de carga em CELULAR (emulado) do IRONLINE.
 *
 *   npm run build && node tools/mobile.mjs [opções]
 *
 * Serve a pasta PUBLICADA (../ironline, saída do `vite build`) em
 * /mathref/ironline/ — igual ao GitHub Pages — e abre no Chromium com
 * emulação de celular (isMobile, toque, DPR 3, UA de Android ou iPhone),
 * CPU estrangulada via CDP e, opcionalmente, limites típicos de GPU de
 * celular. Mede até o menu principal:
 *   - tempo até __ready e até a tela de carga (#boot) sumir
 *   - progresso que a tela de carga mostrou (textos vistos)
 *   - tempo de init por feature (via ?bootlog=1 → window.__bootlog)
 *   - tarefas longas (PerformanceObserver 'longtask')
 *   - heap JS (CDP Performance.getMetrics), renderer.info.memory,
 *     estimativa de bytes de textura e de geometria, triângulos/draw calls
 *   - extensões/limites WebGL vistos pela página
 *
 * Opções:
 *   --device android|iphone   (padrão android)
 *   --cpu N                   estrangulamento de CPU (padrão 6)
 *   --params "k=v&…"          query extra (ex.: "q=low&map=factory")
 *   --gpu "Adreno (TM) 640"   finge o nome da GPU (WEBGL_debug_renderer_info)
 *   --phonegl                 simula GPU de celular: MAX_TEXTURE_SIZE 4096 e
 *                             sem EXT_color_buffer_float/half_float/float_blend
 *   --out arquivo.png         screenshot do menu
 *   --json arquivo.json       grava o relatório
 *   --timeout ms              (padrão 900000)
 *   --size WxH                viewport CSS (padrão 412x915 android, 390x844 iphone)
 *   --dpr N                   deviceScaleFactor (padrão 3)
 *   --dist dir                serve outra pasta de build (ex.: build sem minificar p/ perfil)
 *   --desktop                 sem emulação de celular (1280x720, DPR 1) — p/ comparar shots
 *   --frames N                frames extras depois do menu, antes da captura
 *   --perf S                  mede S segundos depois do menu: fps, ms (média/p90), draw calls, triângulos, escala
 *   --profile                 perfil de CPU (CDP) da carga: top funções por tempo próprio
 *   --eval "js"               roda depois do menu (recebe ctx, pode usar await); imprime o retorno
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let DIST = resolve(ROOT, '../ironline');
const BASE = '/mathref/ironline/';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const argv = process.argv.slice(2);
const opt = { device: 'android', cpu: 6, params: '', gpu: '', phonegl: false, out: '', json: '', timeout: 900000, size: '', dpr: 3, eval: '', profile: false, desktop: false, frames: 0, perf: 0 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--device') opt.device = next();
  else if (a === '--cpu') opt.cpu = Number(next());
  else if (a === '--params') opt.params = next();
  else if (a === '--gpu') opt.gpu = next();
  else if (a === '--phonegl') opt.phonegl = true;
  else if (a === '--out') opt.out = next();
  else if (a === '--json') opt.json = next();
  else if (a === '--timeout') opt.timeout = Number(next());
  else if (a === '--size') opt.size = next();
  else if (a === '--dpr') opt.dpr = Number(next());
  else if (a === '--eval') opt.eval = next();
  else if (a === '--profile') opt.profile = true;
  else if (a === '--desktop') opt.desktop = true;
  else if (a === '--frames') opt.frames = Number(next());
  else if (a === '--perf') opt.perf = Number(next());
  else if (a === '--dist') DIST = resolve(next());
  else {
    console.error('argumento desconhecido:', a);
    process.exit(2);
  }
}

const DEVICES = {
  android: {
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    size: [412, 915],
  },
  iphone: {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    size: [390, 844],
  },
};
const dev = DEVICES[opt.device] || DEVICES.android;
const [vw, vh] = opt.size ? opt.size.split('x').map(Number) : dev.size;

// ─── servidor estático da pasta publicada ───────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    p = normalize(p.slice(BASE.length)).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, p || 'index.html');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}${BASE}?${['bootlog=1', opt.params].filter(Boolean).join('&')}`;

// ─── navegador ───────────────────────────────────────────────────────────
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--enable-precise-memory-info'],
});
const context = await browser.newContext(opt.desktop
  ? { viewport: { width: opt.size ? vw : 1280, height: opt.size ? vh : 720 }, deviceScaleFactor: 1 }
  : {
    viewport: { width: vw, height: vh },
    deviceScaleFactor: opt.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: dev.ua,
  });
// Antes de qualquer script da página: tarefas longas, simulação de GPU de
// celular e registro dos textos da tela de carga.
await context.addInitScript(({ gpu, phonegl }) => {
  window.__probe = { longtasks: [], bootTexts: [], ext: {}, contextLost: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__probe.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const BLOCK = new Set(['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_float_blend', 'OES_texture_float_linear', 'WEBGL_color_buffer_float']);
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const gp = C.prototype.getParameter;
    const ge = C.prototype.getExtension;
    const gse = C.prototype.getSupportedExtensions;
    C.prototype.getParameter = function (p) {
      if (gpu && p === 0x9246) return gpu; // UNMASKED_RENDERER_WEBGL
      if (phonegl && (p === 0x0d33 || p === 0x84e8)) return 4096; // MAX_TEXTURE_SIZE / MAX_RENDERBUFFER_SIZE
      if (phonegl && p === 0x851c) return 4096; // MAX_CUBE_MAP_TEXTURE_SIZE
      return gp.call(this, p);
    };
    C.prototype.getExtension = function (n) {
      if (phonegl && BLOCK.has(n)) {
        window.__probe.ext[n] = 'bloqueada';
        return null;
      }
      const r = ge.call(this, n);
      window.__probe.ext[n] = r ? 'ok' : 'ausente';
      return r;
    };
    C.prototype.getSupportedExtensions = function () {
      const l = gse.call(this) || [];
      return phonegl ? l.filter((n) => !BLOCK.has(n)) : l;
    };
  }
  addEventListener('webglcontextlost', () => window.__probe.contextLost++, true);
  const seen = new Set();
  const poll = () => {
    const b = document.getElementById('boot');
    const t = b?.textContent?.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      window.__probe.bootTexts.push([Math.round(performance.now()), t.replace(/\s+/g, ' ').slice(0, 120)]);
    }
    if (b && !window.__probe.bootGoneAt) setTimeout(poll, 50);
    else if (!window.__probe.bootGoneAt) window.__probe.bootGoneAt = Math.round(performance.now());
  };
  document.addEventListener('DOMContentLoaded', poll);
}, { gpu: opt.gpu, phonegl: opt.phonegl });

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
if (opt.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opt.cpu });
if (opt.profile) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
}

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('crash', () => errors.push('CRASH da aba'));

const metrics = async () => {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const o = Object.fromEntries(m.map((x) => [x.name, x.value]));
  return { heapUsedMB: +(o.JSHeapUsedSize / 1048576).toFixed(1), heapTotalMB: +(o.JSHeapTotalSize / 1048576).toFixed(1) };
};

let peakHeap = 0;
const sampler = setInterval(async () => {
  try {
    const m = await metrics();
    peakHeap = Math.max(peakHeap, m.heapUsedMB);
  } catch {}
}, 1000);

const t0 = Date.now();
let status = 'ok';
console.log(`→ ${opt.device} cpu×${opt.cpu}${opt.phonegl ? ' phonegl' : ''}${opt.gpu ? ` gpu="${opt.gpu}"` : ''} ${vw}x${vh}@${opt.dpr}  ${url}`);
try {
  await page.goto(url, { waitUntil: 'load', timeout: opt.timeout });
  await page.waitForFunction(() => window.__ready === true || window.__bootFailed, null, { timeout: opt.timeout, polling: 250 });
  if (await page.evaluate(() => !!window.__bootFailed)) status = 'boot-falhou';
  // espera a tela de carga sumir (a hud a remove; no máx. +20 s)
  await page.waitForFunction(() => !document.getElementById('boot') || window.__bootFailed, null, { timeout: 20000 * Math.max(1, opt.cpu / 2), polling: 250 }).catch(() => {
    status = 'boot-preso';
  });
} catch (e) {
  status = 'timeout: ' + e.message.split('\n')[0];
}
if (opt.frames && status === 'ok') {
  const f0 = await page.evaluate(() => window.__frames);
  await page.waitForFunction((n) => window.__frames >= n, f0 + opt.frames, { timeout: opt.timeout, polling: 100 }).catch(() => {});
}
const wallS = +((Date.now() - t0) / 1000).toFixed(1);
clearInterval(sampler);
let profileTop = null;
if (opt.profile) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  const counts = new Map();
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
  for (const [id, us] of counts) {
    const n = byId.get(id);
    const cf = n.callFrame;
    const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + us);
  }
  profileTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, us]) => `${Math.round(us / 1000)} ms  ${k}`);
}

let report = { profileTop, device: opt.device, cpu: opt.cpu, phonegl: opt.phonegl, gpu: opt.gpu, params: opt.params, status, wallS, errors };
try {
  const after = await metrics();
  peakHeap = Math.max(peakHeap, after.heapUsedMB);
  const page_ = await page.evaluate(() => {
    const ctx = window.__ironline;
    const out = { probe: window.__probe, bootlog: window.__bootlog || null, frames: window.__frames, ready: window.__ready };
    if (!ctx) return out;
    const r = ctx.renderer;
    const gl = r.getContext();
    out.quality = { level: ctx.quality.level, mode: ctx.quality.mode, rung: ctx.quality.rung, tier: ctx.quality.tier, device: ctx.quality.device };
    out.info = { calls: r.info.render.calls, tris: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length };
    out.gl = {
      version: gl.getParameter(gl.VERSION),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxTexUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      pixelRatio: r.getPixelRatio(),
    };
    // estimativa de bytes de textura (RGBA8 + mips) e de geometria
    const texs = new Set();
    const geos = new Set();
    const visit = (o) => {
      if (o.geometry) geos.add(o.geometry);
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) for (const k in m) {
        const v = m[k];
        if (v && v.isTexture) texs.add(v);
        if (k === 'uniforms') for (const u of Object.values(v || {})) if (u?.value?.isTexture) texs.add(u.value);
      }
    };
    ctx.scene.traverse(visit);
    ctx.vm.scene.traverse(visit);
    if (ctx.scene.environment?.isTexture) texs.add(ctx.scene.environment);
    let texBytes = 0;
    let bigTex = [];
    for (const t of texs) {
      const im = t.image;
      const w = im?.width || im?.[0]?.width || 0;
      const h = im?.height || im?.[0]?.height || 0;
      const faces = Array.isArray(im) ? im.length : t.isCubeTexture ? 6 : 1;
      const bpp = t.type === 1016 /* HalfFloat */ ? 8 : t.type === 1015 /* Float */ ? 16 : 4;
      const b = w * h * bpp * faces * (t.generateMipmaps !== false ? 1.33 : 1);
      texBytes += b;
      bigTex.push([`${t.name || t.uuid.slice(0, 6)} ${w}x${h}`, Math.round(b / 1048576 * 10) / 10]);
    }
    bigTex.sort((a, b) => b[1] - a[1]);
    let geoBytes = 0;
    let tris = 0;
    for (const g of geos) {
      for (const a of Object.values(g.attributes || {})) geoBytes += a.array?.byteLength || 0;
      if (g.index) geoBytes += g.index.array.byteLength;
      tris += (g.index ? g.index.count : g.attributes?.position?.count || 0) / 3;
    }
    out.mem = { textures: texs.size, texMB: Math.round(texBytes / 1048576), geometries: geos.size, geoMB: Math.round(geoBytes / 1048576), sceneTris: Math.round(tris), topTex: bigTex.slice(0, 8) };
    out.world = ctx.services.world?.stats;
    out.features = ctx.features.map((f) => f.name + (f.ok ? '' : '✗'));
    out.errors = ctx.errors;
    return out;
  });
  const lt = page_.probe?.longtasks || [];
  report = {
    ...report,
    heap: { ...after, peakUsedMB: peakHeap },
    ...page_,
    longtasks: { count: lt.length, totalMs: lt.reduce((s, x) => s + x[1], 0), max: lt.reduce((m, x) => Math.max(m, x[1]), 0) },
  };
  delete report.probe?.longtasks;
  if (opt.perf) {
    report.perf = await page.evaluate(async (secs) => {
      const ctx = window.__ironline;
      const r = ctx.renderer;
      const dts = [];
      let calls = 0, tris = 0, n = 0;
      await new Promise((res) => {
        const t0 = performance.now();
        let last = t0;
        const f = (t) => {
          dts.push(t - last);
          last = t;
          calls += r.info.render.calls;
          tris += r.info.render.triangles;
          n++;
          // pelo menos 8 frames (SwiftShader pode levar segundos por frame)
          if (t - t0 < secs * 1000 || n < 9) requestAnimationFrame(f);
          else res();
        };
        requestAnimationFrame(f);
      });
      dts.shift();
      const s = dts.slice().sort((a, b) => a - b);
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      return {
        frames: s.length, fps: +(1000 / mean).toFixed(1), meanMs: +mean.toFixed(1), p90Ms: +s[Math.min(s.length - 1, Math.floor(s.length * 0.9))].toFixed(1),
        calls: Math.round(calls / n), tris: Math.round(tris / n), pixelRatio: r.getPixelRatio(),
        buffer: [r.domElement.width, r.domElement.height], level: ctx.quality.level, rung: ctx.quality.rung, tier: ctx.quality.tier,
        govScale: ctx.governor?.scale, renderScale: ctx.quality.renderScale,
      };
    }, opt.perf).catch((e) => 'perf falhou: ' + e.message);
  }
  if (opt.eval) {
    report.eval = await page.evaluate(async (src) => {
      const v = await new Function('ctx', `return (async () => { ${src} })()`)(window.__ironline);
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    }, opt.eval).catch((e) => 'eval falhou: ' + e.message);
  }
  if (opt.out) {
    mkdirSync(dirname(resolve(opt.out)), { recursive: true });
    await page.evaluate(() => (window.__hold = true)).catch(() => {});
    await page.screenshot({ path: resolve(opt.out), timeout: 120000 }).catch(async (e) => {
      // SwiftShader sob carga: a captura do compositor pode estourar o tempo —
      // lê o canvas direto (exige preserve=1 para não sair vazio)
      console.log('screenshot falhou, usando o canvas:', e.message.split('\n')[0]);
      const url = await page.evaluate(() => window.__ironline?.renderer.domElement.toDataURL('image/png')).catch(() => null);
      if (url) writeFileSync(resolve(opt.out), Buffer.from(url.split(',')[1], 'base64'));
    });
  }
} catch (e) {
  report.evalError = e.message;
}
console.log(JSON.stringify(report, null, 1));
if (opt.json) {
  mkdirSync(dirname(resolve(opt.json)), { recursive: true });
  writeFileSync(resolve(opt.json), JSON.stringify(report, null, 1));
}
await browser.close().catch(() => {});
server.close();
process.exit(status === 'ok' && !errors.length ? 0 : 1);
