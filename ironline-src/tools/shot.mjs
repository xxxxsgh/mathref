#!/usr/bin/env node
/**
 * Screenshots determinísticos do IRONLINE.
 *
 *   node tools/shot.mjs --params "shot=street" --out /caminho/x.png
 *   node tools/shot.mjs --params "shot=street" --out a.png --params "shot=ads" --out b.png
 *   node tools/shot.mjs --all --outdir /caminho/dir          (todos os presets)
 *
 * Opções:
 *   --params "k=v&k2=v2"  query string (repetível; pareia com --out na ordem)
 *   --out arquivo.png     destino (repetível)
 *   --all                 um PNG por preset de src/core/Shots.js (usa --outdir e --extra)
 *   --outdir dir          pasta para --all (padrão: scratchpad)
 *   --extra "k=v"         parâmetros somados a todos os --params (ex.: "q=low")
 *   --frames N            frames renderizados depois de __ready (padrão 20)
 *   --eval "js"           roda no page depois de __ready, antes dos frames (repetível; pareia como --out, ou 1 para todos)
 *   --size 1080|720       resolução (padrão 1080 → 1920x1080)
 *   --timeout ms          por captura (padrão 600000; SwiftShader é lento — 1080p em high leva ~6 min)
 *   --keep-errors         não falha (exit 0) com erros de página
 *
 * Sobe o PRÓPRIO servidor Vite numa porta livre, então vários agentes podem
 * rodar ao mesmo tempo sem colidir. Imprime erros da página e a luminância
 * média de cada imagem (luma≈0 → tela preta).
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = '/tmp/claude-0/-home-user-mathref/1f256a66-dc60-551c-af41-f2d751cfdd82/scratchpad/ironline';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

// ─── argumentos ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = { params: [], out: [], evals: [], frames: 20, size: 1080, timeout: 600000, all: false, outdir: SCRATCH, extra: '', keepErrors: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--params') opt.params.push(next());
  else if (a === '--out') opt.out.push(next());
  else if (a === '--eval') opt.evals.push(next());
  else if (a === '--frames') opt.frames = Number(next());
  else if (a === '--size') opt.size = Number(next());
  else if (a === '--timeout') opt.timeout = Number(next());
  else if (a === '--all') opt.all = true;
  else if (a === '--outdir') opt.outdir = next();
  else if (a === '--extra') opt.extra = next();
  else if (a === '--keep-errors') opt.keepErrors = true;
  else if (a === '--help' || a === '-h') {
    console.log('uso: node tools/shot.mjs --params "shot=street" --out x.png [--frames 20] [--eval "js"] [--size 720] | --all [--outdir d]');
    process.exit(0);
  } else {
    console.error('argumento desconhecido:', a);
    process.exit(2);
  }
}
if (opt.all) {
  const { SHOT_PRESETS } = await import(join(ROOT, 'src/core/Shots.js'));
  for (const name of Object.keys(SHOT_PRESETS)) {
    opt.params.push(`shot=${name}`);
    opt.out.push(join(opt.outdir, `${name}.png`));
  }
}
if (!opt.params.length) opt.params.push('shot=street');
while (opt.out.length < opt.params.length) opt.out.push(join(SCRATCH, `shot-${opt.out.length}.png`));
const [W, H] = opt.size === 720 ? [1280, 720] : [1920, 1080];

// ─── servidor Vite próprio ───────────────────────────────────────────────
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
const base = `http://127.0.0.1:${port}/mathref/ironline/`;

// ─── navegador ───────────────────────────────────────────────────────────
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('  [pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push(m.text());
    console.log('  [console.error]', m.text());
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
  for (let i = 0; i < opt.params.length; i++) {
    // preserve=1: permite ler o canvas (luminância) também fora do modo shot.
    const q = [opt.params[i], opt.extra, 'preserve=1'].filter(Boolean).join('&');
    const out = resolve(opt.out[i]);
    const evalJs = opt.evals.length === 1 ? opt.evals[0] : opt.evals[i];
    errors = [];
    const t0 = Date.now();
    console.log(`→ ${q}`);
    await page.goto(`${base}?${q}`, { waitUntil: 'load', timeout: opt.timeout });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: opt.timeout, polling: 100 });
    if (evalJs) {
      const r = await page.evaluate(async (src) => {
        const v = await new Function('ctx', `return (async () => { ${src} })()`)(window.__ironline);
        return v === undefined ? undefined : JSON.stringify(v);
      }, evalJs);
      if (r !== undefined) console.log('  eval →', r);
    }
    const start = await page.evaluate(() => window.__frames);
    await page.waitForFunction((n) => window.__frames >= n, start + opt.frames, { timeout: opt.timeout, polling: 50 });
    const stats = await page.evaluate(() => {
      const ctx = window.__ironline;
      const c = ctx.renderer.domElement;
      const s = document.createElement('canvas');
      s.width = 64;
      s.height = 36;
      const g = s.getContext('2d');
      g.drawImage(c, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      return {
        luma: sum / (d.length / 4) / 255,
        frames: window.__frames,
        features: ctx.features.map((f) => f.name + (f.ok ? '' : '✗')).join(','),
        errors: ctx.errors,
        calls: ctx.renderer.info.render.calls,
        tris: ctx.renderer.info.render.triangles,
      };
    });
    mkdirSync(dirname(out), { recursive: true });
    // congela o loop: a captura não espera um frame novo do SwiftShader
    await page.evaluate(() => (window.__hold = true));
    await page.screenshot({ path: out, timeout: opt.timeout });
    await page.evaluate(() => (window.__hold = false));
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ✓ ${out}  luma=${stats.luma.toFixed(3)} frames=${stats.frames} calls=${stats.calls} tris=${stats.tris} [${stats.features}] ${dt}s`);
    if (stats.errors.length) {
      for (const e of stats.errors) console.log(`  [feature ${e.feature}/${e.phase}] ${e.message}`);
    }
    if (stats.luma < 0.01) {
      console.log('  ⚠ imagem praticamente preta');
      failed++;
    }
    if ((errors.length || stats.errors.length) && !opt.keepErrors) failed++;
  }
} catch (err) {
  console.error('falhou:', err.message);
  failed++;
} finally {
  await cleanup();
}
process.exit(failed ? 1 : 0);
