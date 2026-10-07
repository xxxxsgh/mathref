#!/usr/bin/env node
/**
 * Screenshots do RPS3D rodando de verdade (Chromium headless, GPU por software).
 *
 *   node tools/shot.mjs --params "shot=cockpit-battle" --out /caminho/x.png
 *   node tools/shot.mjs --params "shot=a" --out a.png --params "shot=b" --out b.png
 *   node tools/shot.mjs --list                    (lista presets registrados)
 *
 * Opções:
 *   --params "k=v&k2=v2"  query string (repetível; pareia com --out)
 *   --out arquivo.png     destino (repetível)
 *   --frames N            frames depois do setup do shot (padrão 45)
 *   --webgpu              tenta o backend WebGPU (no container headless o device
 *                         do Dawn/SwiftShader é perdido → tela preta; por isso o padrão é WebGL2,
 *                         que executa os MESMOS shaders TSL compilados para GLSL)
 *   --size 720|1080|ipad  resolução (padrão 720 → 1280x720; ipad → 1180x820 com toque)
 *   --q ultra|high|medium|mobile   preset de qualidade (padrão high)
 *   --eval "js"           roda no page depois do setup e antes dos frames
 *   --timeout ms          por captura (padrão 300000)
 *   --keep-errors         sai com 0 mesmo com erros de página
 *
 * Sobe o PRÓPRIO servidor Vite numa porta livre — vários agentes podem rodar
 * ao mesmo tempo. Imprime erros da página e luminância média (≈0 → tela preta).
 */
import { createServer as netServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const argv = process.argv.slice(2);
const opt = { params: [], out: [], evals: [], frames: 45, size: '720', q: 'high', webgl: true, timeout: 300000, keep: false, list: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '--params') opt.params.push(next());
  else if (a === '--out') opt.out.push(next());
  else if (a === '--eval') opt.evals.push(next());
  else if (a === '--frames') opt.frames = Number(next());
  else if (a === '--size') opt.size = next();
  else if (a === '--q') opt.q = next();
  else if (a === '--webgl') opt.webgl = true;
  else if (a === '--webgpu') opt.webgl = false;
  else if (a === '--timeout') opt.timeout = Number(next());
  else if (a === '--keep-errors') opt.keep = true;
  else if (a === '--list') opt.list = true;
}
if (opt.list) { opt.params = ['shot=__list__']; opt.out = [null]; }

const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

const { createServer } = await import(resolve(ROOT, 'node_modules/vite/dist/node/index.js'));
const port = await freePort();
const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.js'), server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${port}/mathref/rps3d/`;

const sizes = { '720': [1280, 720], '1080': [1920, 1080], ipad: [1180, 820] };
const [W, H] = sizes[opt.size] || sizes['720'];
const ARGS = process.env.RPS_CHROME_ARGS ? process.env.RPS_CHROME_ARGS.split(' ') : ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-angle=swiftshader'];
const browser = await chromium.launch({ args: ARGS });
let failed = false;
try {
  for (let i = 0; i < opt.params.length; i++) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: opt.size === 'ipad', isMobile: false });
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 400)); });
    const qs = new URLSearchParams(opt.params[i]);
    if (!qs.has('q')) qs.set('q', opt.q);
    if (opt.webgl) qs.set('backend', 'webgl');
    const url = base + '?' + qs.toString();
    const t0 = Date.now();
    await page.goto(url, { timeout: opt.timeout });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: opt.timeout, polling: 250 });
    if (opt.list) { console.log('shots:', await page.evaluate(() => window.__shots)); await page.close(); continue; }
    const ev = opt.evals.length === 1 ? opt.evals[0] : opt.evals[i];
    if (ev) await page.evaluate(ev).catch((e) => errs.push('eval: ' + e.message));
    const f0 = await page.evaluate(() => window.__frame || 0);
    await page.waitForFunction((n) => (window.__frame || 0) >= n, f0 + opt.frames, { timeout: opt.timeout, polling: 200 });
    const info = await page.evaluate(() => ({ errors: window.__errors || [], backend: window.__ctx?.backend, stats: window.__ctx?.stats, mode: window.__ctx?.game?.mode }));
    const out = opt.out[i] || resolve(ROOT, `shot-${i}.png`);
    mkdirSync(dirname(out), { recursive: true });
    const buf = await page.screenshot({ path: out, timeout: opt.timeout });
    const luma = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const t = document.createElement('canvas'); t.width = 64; t.height = 36;
      const g = t.getContext('2d'); g.drawImage(img, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data; let s = 0;
      for (let k = 0; k < d.length; k += 4) s += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      return s / (d.length / 4);
    }, buf.toString('base64')).catch(() => -1);
    const all = [...info.errors, ...errs];
    console.log(`✓ ${out}  [${qs}]  backend=${info.backend} mode=${info.mode} luma=${luma.toFixed(1)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (all.length) { failed = true; console.log('  ERROS:\n   - ' + all.slice(0, 20).join('\n   - ')); }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed && !opt.keep ? 1 : 0);
