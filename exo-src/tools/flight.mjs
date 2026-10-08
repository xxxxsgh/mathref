#!/usr/bin/env node
/**
 * Teste de VOO CONTÍNUO no navegador: da órbita (1 000 km) até o solo num
 * único voo, com o planeta que estiver ativo (placeholder ou sistema real).
 *
 *   node tools/flight.mjs [--outdir dir] [--size 540|720] [--extra "q=low"] [--from 1e6]
 *
 * Congela o loop (window.__hold), comanda o controlador do modo 'space'
 * (empuxo para frente, nariz apontado para o centro do planeta), avança
 * passos fixos com ctx.debug.steps() e, em cada marco de altitude, renderiza
 * um frame e captura a tela. Falha se: a altitude subir, a posição virar
 * NaN, o voo não chegar ao solo em 120 s de jogo, a câmera de render sair de
 * (0,0,0), a imagem ficar preta, ou houver erro de página/feature.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.EXO_SHOT_DIR || '/tmp/claude-0/-home-user-mathref/35305c52-18c5-5949-a43a-1741756616d4/scratchpad/work/flight';
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const argv = process.argv.slice(2);
const opt = { outdir: SCRATCH, size: 540, extra: '', from: 1e6 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--outdir') opt.outdir = argv[++i];
  else if (a === '--size') opt.size = Number(argv[++i]);
  else if (a === '--extra') opt.extra = argv[++i];
  else if (a === '--from') opt.from = Number(argv[++i]);
}
const [W, H] = opt.size === 720 ? [1280, 720] : [960, 540];
mkdirSync(opt.outdir, { recursive: true });

const freePort = () => new Promise((res, rej) => {
  const s = createNetServer();
  s.unref();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const { createServer } = await import(require.resolve('vite', { paths: [ROOT] }));
const port = await freePort();
const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'error', clearScreen: false, server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
try {
  const q = ['shot=orbit', 'hud=0', opt.extra, 'preserve=1'].filter(Boolean).join('&');
  await page.goto(`http://127.0.0.1:${port}/mathref/exo/?${q}`, { waitUntil: 'load', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 200 });
  await page.evaluate((from) => {
    window.__hold = true;
    const ctx = window.__exo;
    const p = ctx.player;
    p.frozen = false;
    ctx.time.frozen = false;
    // mira 4° para dentro do limbo: a reta corta a esfera, chegada rasante
    const dip = ctx.Geo.horizonDip(ctx.services.planet.radius, from);
    p.place({ mode: 'space', lat: 5, lon: 40, alt: from, heading: 30, pitch: -(dip + 4) });
    ctx.services.sky?.setTime?.(0.45);
    p.controllers.space.command = { x: 0, y: 0, z: 1 };
    window.__flight = { last: p.altitude, maxRise: 0, steps: 0 };
  }, opt.from);
  const marks = [opt.from, 1e5, 1e4, 1e3, 100, 10, 0];
  for (const mark of marks) {
    const r = await page.evaluate((mark) => {
      const ctx = window.__exo;
      const p = ctx.player;
      const f = window.__flight;
      const min = p.controllers.space.minAltitude + 0.01;
      while (p.altitude > Math.max(mark, min) && f.steps < 60 * 120) {
        ctx.debug.steps(1);
        f.steps++;
        if (!Number.isFinite(p.worldPos.x + p.worldPos.y + p.worldPos.z)) return { error: 'posição NaN' };
        f.maxRise = Math.max(f.maxRise, p.altitude - f.last);
        f.last = p.altitude;
      }
      ctx.debug.renderOnce();
      const cam = ctx.camera.position;
      return { alt: p.altitude, t: f.steps / 60, speed: p.speed, maxRise: f.maxRise, cam: Math.hypot(cam.x, cam.y, cam.z), calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles, errors: ctx.errors };
    }, mark);
    if (r.error) throw new Error(r.error);
    const name = `flight-${mark === 0 ? 'solo' : mark}.png`;
    const out = join(opt.outdir, name);
    await page.screenshot({ path: out });
    const luma = await page.evaluate(() => {
      const c = window.__exo.renderer.domElement;
      const s = document.createElement('canvas');
      s.width = 32;
      s.height = 18;
      const g = s.getContext('2d');
      g.drawImage(c, 0, 0, 32, 18);
      const d = g.getImageData(0, 0, 32, 18).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      return sum / (d.length / 4) / 255;
    });
    console.log(`  alt=${r.alt.toFixed(2).padStart(12)} m  t=${r.t.toFixed(1).padStart(5)} s  v=${r.speed.toFixed(1).padStart(10)} m/s  luma=${luma.toFixed(3)} calls=${r.calls} tris=${r.tris}  → ${out}`);
    if (r.maxRise > 1e-3) {
      console.log(`  ✗ a altitude subiu ${r.maxRise} m durante a descida`);
      failed++;
    }
    if (r.cam !== 0) {
      console.log('  ✗ a câmera de render saiu da origem');
      failed++;
    }
    // de longe o planeta é um disco pequeno no preto: só confere perto
    if (mark <= 1e5 && luma < 0.01) {
      console.log('  ✗ imagem preta');
      failed++;
    }
    if (r.errors.length) {
      for (const e of r.errors) console.log(`  [feature ${e.feature}/${e.phase}] ${e.message}`);
      failed++;
    }
    if (mark === 0 && r.t >= 120) {
      console.log('  ✗ não chegou ao solo em 120 s');
      failed++;
    }
  }
  if (errors.length) {
    for (const e of errors) console.log('  [página]', e);
    failed++;
  }
} catch (err) {
  console.error('falhou:', err.message);
  failed++;
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
console.log(failed ? `✗ voo: ${failed} problema(s)` : '✓ voo contínuo órbita → solo ok');
process.exit(failed ? 1 : 0);
