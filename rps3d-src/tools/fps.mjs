#!/usr/bin/env node
/**
 * Mede FPS por preset de qualidade num cenário (preset de shot).
 *   node tools/fps.mjs --shot bench-planet --seconds 10 [--webgpu] [--presets ultra,high,medium,mobile]
 *
 * AVISO: no container a GPU é SwiftShader (CPU). Os números servem para
 * COMPARAR presets e achar regressões, não como FPS real de um PC/iPad.
 */
import { createServer as netServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const argv = process.argv.slice(2);
const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const shot = get('--shot', 'bench');
const seconds = Number(get('--seconds', 10));
const presets = get('--presets', 'ultra,high,medium,mobile').split(',');
const webgl = !argv.includes('--webgpu'); // WebGPU headless perde o device neste container
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const { createServer } = await import(resolve(ROOT, 'node_modules/vite/dist/node/index.js'));
const port = await freePort();
const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.js'), server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-angle=swiftshader'] });
const rows = [];
for (const q of presets) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // `realtime=1` mantém o tempo real (o modo shot normalmente usa tempo virtual).
  const url = `http://127.0.0.1:${port}/mathref/rps3d/?shot=${shot}&q=${q}&realtime=1${webgl ? '&backend=webgl' : ''}`;
  await page.goto(url, { timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.evaluate(() => { if (window.__ctx) window.__ctx.time.virtual = false; });
  await page.waitForTimeout(2000);
  const f0 = await page.evaluate(() => window.__frame);
  await page.waitForTimeout(seconds * 1000);
  const f1 = await page.evaluate(() => window.__frame);
  const st = await page.evaluate(() => ({ ...window.__ctx?.stats, backend: window.__ctx?.backend, scale: window.__ctx?.quality?.dynamicScale, errors: (window.__errors || []).length }));
  rows.push({ preset: q, fps: ((f1 - f0) / seconds).toFixed(1), drawCalls: st.drawCalls, tris: st.triangles, scale: st.scale, backend: st.backend, errors: st.errors });
  await page.close();
}
console.table(rows);
await browser.close(); await server.close();
