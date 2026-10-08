#!/usr/bin/env node
/**
 * Screenshots determinísticos do EXOSFERA.
 *
 *   node tools/shot.mjs --params "shot=horizon&q=high" --out x.png [--size 720]
 *   node tools/shot.mjs --params "shot=horizon" --out a.png --params "shot=orbit" --out b.png
 *   node tools/shot.mjs --all [--outdir dir] [--extra "q=low"]   (todos os presets de src/shots/)
 *   node tools/shot.mjs --list                                   (lista presets e donos)
 *
 * Opções:
 *   --params "k=v&k2=v2"  query string (repetível; pareia com --out na ordem)
 *   --out arquivo.png     destino (repetível)
 *   --all                 um PNG por preset (usa --outdir e --extra); --owner x filtra por dono
 *   --outdir dir          pasta para --all (padrão: $EXO_SHOT_DIR ou o scratchpad)
 *   --extra "k=v"         somado a todos os --params (ex.: "q=low")
 *   --frames N            frames renderizados depois de __ready (padrão 4)
 *   --eval "js"           roda na página depois de __ready (recebe ctx; repetível)
 *   --size 540|720|1080   960x540 · 1280x720 (padrão) · 1920x1080
 *   --timeout ms          por captura (padrão 900000 — SwiftShader é lento)
 *   --keep-errors         não falha (exit 0) com erros de página
 *
 * O modo shot congela o tempo do mundo, espera os sistemas reportarem pronto
 * (ctx.ready → window.__ready) e então captura. Imprime erros de página e de
 * features, renderer.info (draw calls/triângulos do frame), luminância média,
 * modo de profundidade e serviços que ainda são placeholder.
 *
 * Sobe o PRÓPRIO servidor Vite numa porta livre (vários agentes em paralelo
 * não colidem) e um Chromium com SwiftShader.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.EXO_SHOT_DIR || '/tmp/claude-0/-home-user-mathref/35305c52-18c5-5949-a43a-1741756616d4/scratchpad/work/shots';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const argv = process.argv.slice(2);
const opt = { params: [], out: [], evals: [], frames: 4, size: 720, timeout: 900000, all: false, list: false, owner: null, outdir: SCRATCH, extra: '', keepErrors: false };
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
  else if (a === '--list') opt.list = true;
  else if (a === '--owner') opt.owner = next();
  else if (a === '--outdir') opt.outdir = next();
  else if (a === '--extra') opt.extra = next();
  else if (a === '--keep-errors') opt.keepErrors = true;
  else if (a === '--help' || a === '-h') {
    console.log('uso: node tools/shot.mjs --params "shot=horizon&q=high" --out x.png [--size 540|720|1080] [--frames 4] [--eval "js"] | --all [--outdir d] [--owner x] | --list');
    process.exit(0);
  } else {
    console.error('argumento desconhecido:', a);
    process.exit(2);
  }
}

/** Presets lidos direto dos arquivos (são só dados). */
async function loadPresets() {
  const { collectPresets } = await import(pathToFileURL(join(ROOT, 'src/core/ShotPresets.js')).href);
  const dir = join(ROOT, 'src/shots');
  const mods = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    try {
      mods[`./shots/${f}`] = await import(pathToFileURL(join(dir, f)).href);
    } catch (err) {
      console.error(`preset ${f} não carregou:`, err.message);
    }
  }
  return collectPresets(mods);
}

if (opt.all || opt.list) {
  const presets = await loadPresets();
  if (presets.dupes.length) console.warn('⚠ presets com nome repetido:', presets.dupes.join(', '));
  for (const [name, p] of presets.byName) {
    if (opt.owner && p.owner !== opt.owner) continue;
    if (opt.list) {
      console.log(`${name.padEnd(18)} ${String(p.owner || '?').padEnd(12)} ${p.file.padEnd(16)} ${p.desc || ''}`);
      continue;
    }
    opt.params.push(`shot=${name}`);
    opt.out.push(join(opt.outdir, `${name}.png`));
  }
  if (opt.list) process.exit(0);
}
if (!opt.params.length) opt.params.push('shot=horizon');
while (opt.out.length < opt.params.length) opt.out.push(join(SCRATCH, `shot-${opt.out.length}.png`));
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
const base = `http://127.0.0.1:${port}/mathref/exo/`;

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
  } else if (m.type() === 'warning' && /exo|THREE/.test(m.text())) console.log('  [warn]', m.text().slice(0, 300));
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
    const q = [opt.params[i], opt.extra, 'preserve=1'].filter(Boolean).join('&');
    const out = resolve(opt.out[i]);
    const evalJs = opt.evals.length === 1 ? opt.evals[0] : opt.evals[i];
    errors = [];
    const t0 = Date.now();
    console.log(`→ ${q}  (${W}x${H})`);
    await page.goto(`${base}?${q}`, { waitUntil: 'load', timeout: opt.timeout });
    await page.waitForFunction(() => window.__ready === true || !!window.__bootFailed, null, { timeout: opt.timeout, polling: 200 });
    const tReady = ((Date.now() - t0) / 1000).toFixed(1);
    if (evalJs) {
      const r = await page.evaluate(async (src) => {
        const v = await new Function('ctx', `return (async () => { ${src} })()`)(window.__exo);
        return v === undefined ? undefined : JSON.stringify(v);
      }, evalJs);
      if (r !== undefined) console.log('  eval →', r);
    }
    const bootFailed = await page.evaluate(() => window.__bootFailed || null);
    if (bootFailed) {
      console.log('  ✗ boot falhou:', JSON.stringify(bootFailed));
      failed++;
      continue;
    }
    const start = await page.evaluate(() => window.__frames);
    await page.waitForFunction((n) => window.__frames >= n, start + opt.frames, { timeout: opt.timeout, polling: 50 });
    await page.evaluate(() => (window.__hold = true));
    const stats = await page.evaluate(() => {
      const ctx = window.__exo;
      const c = ctx.renderer.domElement;
      const s = document.createElement('canvas');
      s.width = 64;
      s.height = 36;
      const g = s.getContext('2d');
      g.drawImage(c, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      const p = ctx.player;
      return {
        luma: sum / (d.length / 4) / 255,
        frames: window.__frames,
        features: ctx.features.map((f) => f.name + (f.ok ? '' : '✗')).join(','),
        placeholders: Object.entries(ctx.services).filter(([, v]) => v?.placeholder).map(([k]) => k).join(',') || '-',
        errors: ctx.errors,
        calls: ctx.renderer.info.render.calls,
        tris: ctx.renderer.info.render.triangles,
        depth: ctx.depthMode,
        mode: p.mode,
        alt: p.altitude,
        bootFailed: window.__bootFailed || null,
      };
    });
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out, timeout: opt.timeout });
    await page.evaluate(() => (window.__hold = false));
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const tris = stats.tris >= 1e6 ? `${(stats.tris / 1e6).toFixed(2)}M` : `${(stats.tris / 1e3).toFixed(1)}k`;
    console.log(`  ✓ ${out}\n    luma=${stats.luma.toFixed(3)} calls=${stats.calls} tris=${tris} depth=${stats.depth} modo=${stats.mode} alt=${stats.alt.toFixed(1)}m pronto=${tReady}s total=${dt}s\n    features=[${stats.features}] placeholders=[${stats.placeholders}]`);
    if (stats.bootFailed) {
      console.log('  ✗ boot falhou:', JSON.stringify(stats.bootFailed));
      failed++;
    }
    for (const e of stats.errors) console.log(`  [feature ${e.feature}/${e.phase}] ${e.message}`);
    if (stats.luma < 0.01) {
      console.log('  ⚠ imagem praticamente preta');
      failed++;
    }
    if (stats.calls > 400 || stats.tris > 3e6) console.log('  ⚠ acima do orçamento (400 draw calls / 3M triângulos)');
    if ((errors.length || stats.errors.length) && !opt.keepErrors) failed++;
  }
} catch (err) {
  console.error('falhou:', err.message);
  failed++;
} finally {
  await cleanup();
}
process.exit(failed ? 1 : 0);
