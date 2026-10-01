/**
 * Grade de comparação visual: a mesma skin em vários floats e seeds,
 * renderizada pelo mesmo pipeline das miniaturas.
 *   node tools/wearshot.mjs '[{"skin":"knife_neon_rupture","type":"knife","v":[[0.01,5],[0.1,5]]}]' nome
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
const PORT = 4791;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:${PORT}/mathref/arena/`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const rows = JSON.parse(process.argv[2]);
await page.evaluate(async (rows) => {
  const g = window.__np;
  g.thumbs.w = 310;
  g.thumbs.h = 165;
  g.thumbs.renderer = null;
  const wrap = document.createElement('div');
  const cols = Math.max(...rows.map((r) => r.v.length));
  wrap.style.cssText = `position:fixed;inset:0;background:#15181c;z-index:99;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:8px;color:#ddd;font:12px sans-serif;align-content:start`;
  document.body.appendChild(wrap);
  let k = 0;
  for (const r of rows) {
    for (const [f, seed, ws] of r.v) {
      const cell = document.createElement('div');
      wrap.appendChild(cell);
      await new Promise((res) =>
        g.thumbs.request(`w${k++}`, { skinId: r.skin, weaponType: r.type, floatValue: f, patternSeed: seed, wearSeed: ws ?? 99 }, (url) => {
          cell.innerHTML = `<img src="${url}" style="width:100%"><div>${r.skin} f=${f} seed=${seed}${ws ? ' ws=' + ws : ''}</div>`;
          res();
        }),
      );
    }
  }
}, rows);
await page.waitForTimeout(300);
await page.screenshot({ path: new URL(`./shots/wear-${process.argv[3] || 'grid'}.png`, import.meta.url).pathname });
await browser.close();
server.kill();
process.exit(0);
