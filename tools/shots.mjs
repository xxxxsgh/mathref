// Screenshots do Ventania em 6 ângulos fixos, para enxergar o jogo e se
// autoavaliar em toda etapa.
//
//   npm run shots -- <rótulo> [--q=medium] [--time=17.1] [--poses=chao,lago] [--w=1280 --h=720]
//
// Sobe um servidor local, abre o jogo com ?shot=1 (sem menu e sem pointer
// lock; o loop só avança quando o script manda), posiciona cada pose, roda
// alguns frames com dt fixo e salva em shots/<rótulo>/. Também monta
// shots/<rótulo>/sheet.png com as 6 imagens lado a lado.
//
// O Three.js é servido de node_modules (mesma versão do importmap), então
// funciona offline e não depende do CDN.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer, ROOT } from './serve.mjs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const label = args.find((a) => !a.startsWith('--')) || 'atual';
const quality = opt.q || 'medium';
const time = opt.time ? Number(opt.time) : 17.1;
const W = Number(opt.w) || 1280, H = Number(opt.h) || 720;
const PORT = 8091;

const pkg = JSON.parse(await readFile(join(ROOT, 'node_modules/three/package.json'), 'utf8'));
const html = await readFile(join(ROOT, 'ventania/index.html'), 'utf8');
const cdnVersion = html.match(/three@([\d.]+)/)?.[1];
if (cdnVersion !== pkg.version) {
  console.warn(`AVISO: importmap usa three@${cdnVersion}, node_modules tem ${pkg.version}.`);
}

const server = await startServer(PORT);
const outDir = join(ROOT, 'shots', label);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

// CDN do Three → node_modules local. Fontes: bloqueadas (cai no fallback).
await page.route(/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/(.*)$/, async (route) => {
  const rel = route.request().url().replace(/^.*three@[\d.]+\//, '');
  try {
    const body = await readFile(join(ROOT, 'node_modules/three', rel));
    await route.fulfill({ body, contentType: 'text/javascript' });
  } catch {
    await route.fulfill({ status: 404, body: 'not found' });
  }
});
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '', contentType: 'text/css' }));

const t0 = Date.now();
await page.goto(`http://localhost:${PORT}/ventania/?shot=1&q=${quality}`);
await page.waitForFunction(() => window.__ventania?.ready, null, { timeout: 180000 });
console.log(`mundo pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const poses = opt.poses ? String(opt.poses).split(',') : await page.evaluate(() => window.__ventania.poses);
await page.evaluate((t) => window.__ventania.setTime(t), time);

const files = [];
for (const [i, name] of poses.entries()) {
  const ts = Date.now();
  await page.evaluate((n) => {
    window.__ventania.setPose(n);
    window.__ventania.step(50, 1 / 60);
  }, name);
  const file = join(outDir, `${i + 1}-${name}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  files.push(file);
  console.log(`  ${name.padEnd(8)} ${((Date.now() - ts) / 1000).toFixed(1)}s → ${file.replace(ROOT + '/', '')}`);
}

// Folha de contato.
const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
const sheet = await browser.newPage({ viewport: { width: 1920, height: 720 } });
await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
${imgs.map((src, i) => `<div style="position:relative"><img src="${src}" style="width:100%;display:block"><span style="position:absolute;left:8px;top:6px;color:#fff;font:bold 18px sans-serif;text-shadow:0 1px 3px #000">${poses[i]}</span></div>`).join('')}
</body>`);
await sheet.screenshot({ path: join(outDir, 'sheet.png'), fullPage: true });

const info = await page.evaluate(() => {
  const g = window.__ventania;
  g.setPose('chao');
  g.step(30, 1 / 60, false);
  const s = g.stats();
  const m = g.renderer.info.memory;
  return { draws: s.calls, tris: s.tris, geos: m.geometries, tex: m.textures };
});
console.log(`frame (pose chao, cena + sombras): ${info.draws} draws, ${(info.tris / 1e6).toFixed(2)} M triângulos`);
if (errors.length) {
  console.log(`\n${errors.length} mensagens de console:`);
  for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e);
}
await writeFile(join(outDir, 'console.txt'), errors.join('\n'));
await browser.close();
server.close();
