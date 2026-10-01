/**
 * Ferramenta de ajuste visual: abre uma partida de treino e tira
 * screenshots da viewmodel em poses específicas.
 *   node tools/vmshot.mjs tools/poses.json
 * poses.json: [{ "name": "rifle", "slot": "primary", "base": {...}, "inspect": "A", "t": 1.2, "eval": "..." }]
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
const poses = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PORT = 4790;
mkdirSync(new URL('./shots/', import.meta.url), { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
console.log("goto"); await page.goto(`http://localhost:${PORT}/mathref/arena/`, { waitUntil: "load" }); console.log("loaded");
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__np;
  g.startMatch({ mode: 'practice', difficulty: 'easy', teamSize: 1 });
  g.ui.closeOverlay();
  g.input.locked = true;
  const m = g.match;
  // congela bots e coloca o jogador num canto neutro olhando o pátio
  m.bots.forEach((b) => (b.actor.alive = false));
  m.player.body.pos.set(-20, 0, 1.5);
  m.player.yaw = -Math.PI / 2;
});
for (const p of poses) {
  console.log('pose', p.name);
  await page.evaluate(async (p) => {
    const g = window.__np;
    const m = g.match;
    if (p.base) Object.assign(g.vm.base[p.type || (p.slot === 'melee' ? 'knife' : p.slot === 'secondary' ? 'pistol' : 'rifle')], p.base);
    if (p.slot) m.wc.equip(p.slot);
    if (p.eval) new Function('g', 'm', p.eval)(g, m);
    await new Promise((r) => setTimeout(r, 900));
    m.wc.state = 'ready';
    const a = g.vm.animator;
    if (p.inspect) {
      const { KNIFE_INSPECTS, GUN_INSPECTS } = window.__clips || {};
      const list = m.player.weapon.def.type === 'knife' ? g.__clips.KNIFE_INSPECTS : g.__clips.GUN_INSPECTS;
      const v = list.find((x) => x.id === p.inspect);
      a.play(v.clip, { blend: 0 });
      a.time = p.t || 0;
      a.update(0.0001);
      g.vm.animator.speed = 0;
    } else if (p.clip) {
      a.play(g.__clips[p.clip], { blend: 0 });
      a.time = p.t || 0;
      a.update(0.0001);
      a.speed = 0;
    } else {
      a.stop(0);
      a.update(0.0001);
      a.speed = 0;
    }
  }, p);
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL(`./shots/vm-${p.name}.png`, import.meta.url).pathname });
  await page.evaluate(() => (window.__np.vm.animator.speed = 1));
}
await browser.close();
server.kill();
process.exit(0);
