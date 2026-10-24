#!/usr/bin/env node
/**
 * Teste ponta a ponta do QUADRA VIVA num Chromium headless.
 *
 *   node tools/e2e.mjs [--shots dir] [--size 960x540] [--q low] [--touch]
 *
 * Roteiro:
 *   1. abre o menu e confere os botões; clica em JOGAR;
 *   2. dá a saída com um passe (J) e confere que a bola entrou em jogo;
 *   3. anda/corre com o jogador controlado (WASD + Shift) e confere o
 *      deslocamento; carrega e solta um chute (K);
 *   4. liga o modo de teste (F3) e tira prints;
 *   5. acelera a partida (IA × IA, tempo curto) até o fim e confere a tela
 *      de fim de jogo;
 *   6. falha com pageerror, console.error ou NaN no estado.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const argv = process.argv.slice(2);
const opt = { shots: '', size: '960x540', q: 'low', touch: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--shots') opt.shots = argv[++i];
  else if (a === '--size') opt.size = argv[++i];
  else if (a === '--q') opt.q = argv[++i];
  else if (a === '--touch') opt.touch = true;
  else {
    console.error('argumento desconhecido:', a);
    process.exit(2);
  }
}
const [W, H] = opt.size.split('x').map(Number);
if (opt.shots) mkdirSync(opt.shots, { recursive: true });

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
const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'error', clearScreen: false, server: { port, host: '127.0.0.1' } });
await server.listen();
const base = `http://127.0.0.1:${port}/mathref/quadra/`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: opt.touch, isMobile: opt.touch, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const fail = async (msg) => {
  console.error('FALHOU:', msg);
  if (opt.shots) await page.screenshot({ path: join(opt.shots, 'falha.png') }).catch(() => {});
  await browser.close();
  await server.close();
  process.exit(1);
};
const shot = async (name) => {
  if (opt.shots) await page.screenshot({ path: join(opt.shots, `${name}.png`) });
};
const state = () =>
  page.evaluate(() => {
    const S = window.__qv, m = S.match;
    if (!m) return null;
    const cp = m.controller?.cp;
    return {
      phase: m.phase,
      clock: m.clock,
      ball: { ...m.ball.pos },
      ballState: m.ball.state,
      score: m.teams.map((t) => t.score),
      cp: cp ? { name: cp.name, x: cp.pos.x, z: cp.pos.z, stamina: cp.stamina } : null,
      kicks: S.kicks || 0,
      finite: m.players.every((p) => Number.isFinite(p.pos.x + p.pos.z)) && Number.isFinite(m.ball.pos.x + m.ball.pos.y + m.ball.pos.z),
    };
  });
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(`${base}?q=${opt.q}&seed=11`, { waitUntil: 'load' });
  await page.waitForSelector('.primary', { timeout: 20000 });
  await shot('01-menu');
  await page.click('.primary');
  await wait(800);
  let s = await state();
  if (!s || s.phase !== 'restart') await fail(`esperava saída de bola, fase = ${s && s.phase}`);
  await shot('02-saida');

  // saída: passe
  await page.keyboard.down('KeyJ');
  await wait(120);
  await page.keyboard.up('KeyJ');
  await wait(600);
  s = await state();
  if (s.phase !== 'play') await fail(`a bola não entrou em jogo (fase ${s.phase})`);
  console.log('ok: saída de bola com passe');

  // correr
  const before = (await state()).cp;
  await page.keyboard.down('KeyS');
  await page.keyboard.down('ShiftLeft');
  await wait(1200);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyS');
  const after = (await state()).cp;
  const moved = before && after && (after.name !== before.name || Math.hypot(after.x - before.x, after.z - before.z) > 1.5);
  if (!moved) await fail(`o jogador controlado não se moveu: ${JSON.stringify({ before, after })}`);
  console.log('ok: movimento', before.name, '→', after.name);
  await shot('03-jogo');

  // chute carregado
  await page.keyboard.down('KeyK');
  await wait(700);
  await page.keyboard.up('KeyK');
  await wait(400);

  // modo de teste
  await page.keyboard.press('F3');
  await wait(500);
  const dbg = await page.evaluate(() => document.querySelector('.debug')?.textContent || '');
  if (!dbg.includes('bola')) await fail('modo de teste não apareceu');
  console.log('ok: modo de teste');
  await shot('04-teste');
  await page.keyboard.press('F3');

  // pausa
  await page.keyboard.press('Escape');
  await wait(300);
  if (!(await page.$('.screen'))) await fail('pausa não abriu');
  await page.keyboard.press('Escape');
  await wait(300);
  console.log('ok: pausa');

  // IA × IA em tempo acelerado até o fim
  await page.evaluate(() => {
    const S = window.__qv;
    const m = S.match;
    m.controller = null;
    m.human = -1;
    m.halfLen = Math.min(m.halfLen, 20);
    // acelera: roda 8 passos extras por quadro
    const orig = S.loop.stepFn;
    S.loop.stepFn = (dt) => {
      for (let i = 0; i < 8 && m.phase !== 'end'; i++) orig(dt);
    };
  });
  const t0 = Date.now();
  let phases = new Set();
  while (Date.now() - t0 < 120000) {
    s = await state();
    phases.add(s.phase);
    if (!s.finite) await fail('NaN no estado');
    if (s.phase === 'end') break;
    await wait(500);
  }
  if (s.phase !== 'end') await fail(`partida não terminou (fase ${s.phase}, relógio ${s.clock})`);
  await page.waitForSelector('.final', { timeout: 8000 }).catch(() => fail('tela de fim não apareceu'));
  console.log('ok: fim de jogo', s.score.join(' x '), 'fases vistas:', [...phases].join(','));
  await shot('05-fim');
} catch (e) {
  await fail(e.stack || String(e));
}

if (errors.length) await fail(errors.join('\n'));
console.log('E2E OK');
await browser.close();
await server.close();
