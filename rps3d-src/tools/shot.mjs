#!/usr/bin/env node
/**
 * Capturas de tela do RPS3D rodando de verdade (Chromium headless).
 *
 *   node tools/shot.mjs --scenario planet-lush-surface --out /tmp/x.png
 *   node tools/shot.mjs --scenario a --out a.png --scenario b --out b.png
 *   node tools/shot.mjs --list                       (lista cenários registrados)
 *
 * Opções:
 *   --scenario nome       cenário registrado com ctx.scenario() (repetível; pareia com --out)
 *   --params "k=v&k2=v2"  query extra para TODAS as capturas (ex.: "q=medium")
 *   --out arquivo.png     destino (repetível)
 *   --frames N            frames renderizados após o cenário montar (padrão 30)
 *   --wait ms             espera extra após os frames (padrão 0)
 *   --eval "js"           roda no page antes dos frames (recebe ctx); repetível/pareado
 *   --size 540|720|1080   resolução (padrão 720 → 1280x720)
 *   --webgpu              tenta o backend WebGPU (padrão: WebGL2, mais estável no SwiftShader)
 *   --timeout ms          por captura (padrão 600000)
 *   --keep-errors         sai 0 mesmo com erros de página
 *
 * Sobe o PRÓPRIO servidor Vite numa porta livre: vários agentes podem rodar
 * ao mesmo tempo. Imprime erros da página/sistemas e a luminância média
 * (luma≈0 → tela preta). Use --params "fixeddt=1" para simulação determinística.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = '/tmp/claude-0/-home-user-mathref/5b4325bc-ef8b-5797-a4b6-a1a6b5dad994/scratchpad/rps3d';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const argv = process.argv.slice(2);
const opt = { scen: [], out: [], evals: [], params: '', frames: 30, wait: 0, size: 720, timeout: 600000, webgpu: false, keepErrors: false, list: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--scenario') opt.scen.push(next());
  else if (a === '--out') opt.out.push(next());
  else if (a === '--eval') opt.evals.push(next());
  else if (a === '--params') opt.params = next();
  else if (a === '--frames') opt.frames = Number(next());
  else if (a === '--wait') opt.wait = Number(next());
  else if (a === '--size') opt.size = Number(next());
  else if (a === '--timeout') opt.timeout = Number(next());
  else if (a === '--webgpu') opt.webgpu = true;
  else if (a === '--keep-errors') opt.keepErrors = true;
  else if (a === '--list') opt.list = true;
  else {
    console.error('argumento desconhecido:', a);
    process.exit(2);
  }
}
if (!opt.scen.length) opt.scen.push('');
while (opt.out.length < opt.scen.length) opt.out.push(join(SCRATCH, `shot-${opt.scen[opt.out.length] || 'boot'}.png`));
const [W, H] = opt.size === 1080 ? [1920, 1080] : opt.size === 540 ? [960, 540] : [1280, 720];

async function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}
const { createServer } = await import(require.resolve('vite', { paths: [ROOT] }));
const port = await freePort();
const server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.js'),
  logLevel: 'error',
  clearScreen: false,
  server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
});
await server.listen();
const base = `http://127.0.0.1:${port}/mathref/rps3d/`;

const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'];
if (opt.webgpu) args.push('--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('  [pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    if (m.type() === 'error' || !/GPU stall|THREE\.WebGPURenderer: WebGPU is not available/.test(t)) console.log(`  [console.${m.type()}]`, t.slice(0, 400));
  }
});

let failed = 0;
const cleanup = async () => {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
};
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});

try {
  if (opt.list) {
    await page.goto(`${base}?gl=1`, { waitUntil: 'load', timeout: opt.timeout });
    await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: opt.timeout, polling: 100 });
    const l = await page.evaluate(() => [...window.__rps.scenarios.entries()].map(([k, v]) => `${k} — ${v.desc}`));
    console.log(l.join('\n') || '(nenhum cenário)');
  } else
    for (let i = 0; i < opt.scen.length; i++) {
      const q = [opt.scen[i] ? `scenario=${opt.scen[i]}` : '', opt.webgpu ? '' : 'gl=1', opt.params, 'preserve=1'].filter(Boolean).join('&');
      const out = resolve(opt.out[i]);
      const evalJs = opt.evals.length === 1 ? opt.evals[0] : opt.evals[i];
      errors = [];
      const t0 = Date.now();
      console.log(`→ ?${q}`);
      await page.goto(`${base}?${q}`, { waitUntil: 'load', timeout: opt.timeout });
      await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: opt.timeout, polling: 100 });
      const fatal = await page.evaluate(() => window.__fatal);
      if (fatal) throw new Error('fatal: ' + fatal);
      if (evalJs) {
        const r = await page.evaluate(async (src) => {
          const v = await new Function('ctx', `return (async () => { ${src} })()`)(window.__rps);
          return v === undefined ? undefined : JSON.stringify(v);
        }, evalJs);
        if (r !== undefined) console.log('  eval →', r);
      }
      const start = await page.evaluate(() => window.__frames);
      await page.waitForFunction((n) => window.__frames >= n, start + opt.frames, { timeout: opt.timeout, polling: 50 });
      if (opt.wait) await page.waitForTimeout(opt.wait);
      const stats = await page.evaluate(() => {
        const ctx = window.__rps;
        const info = ctx.renderer.info.render;
        return {
          frames: window.__frames,
          systems: ctx.systems.map((f) => f.name + (f.ok ? '' : '✗')).join(','),
          errors: ctx.errors,
          calls: info.drawCalls ?? info.calls,
          tris: info.triangles,
          backend: ctx.isWebGPU ? 'webgpu' : 'webgl2',
          preset: ctx.quality.name,
          mode: ctx.mode,
        };
      });
      mkdirSync(dirname(out), { recursive: true });
      await page.evaluate(() => (window.__hold = true));
      const png = await page.screenshot({ path: out, timeout: opt.timeout });
      await page.evaluate(() => (window.__hold = false));
      // luminância média medida na própria captura (o canvas WebGPU não é legível)
      stats.luma = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const s = document.createElement('canvas');
        s.width = 64;
        s.height = 36;
        const g = s.getContext('2d');
        g.drawImage(img, 0, 0, 64, 36);
        const d = g.getImageData(0, 0, 64, 36).data;
        let sum = 0;
        for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        return sum / (d.length / 4) / 255;
      }, png.toString('base64'));
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ✓ ${out}  luma=${stats.luma.toFixed(3)} frames=${stats.frames} calls=${stats.calls} tris=${stats.tris} ${stats.backend}/${stats.preset} mode=${stats.mode} [${stats.systems}] ${dt}s`);
      for (const e of stats.errors) console.log(`  [sistema ${e.system}/${e.phase}] ${e.message}`);
      if (stats.luma < 0.004) console.log('  ⚠ imagem praticamente preta');
      if ((errors.length || stats.errors.length) && !opt.keepErrors) failed++;
    }
} catch (err) {
  console.error('falhou:', err.message);
  failed++;
} finally {
  await cleanup();
}
process.exit(failed ? 1 : 0);
