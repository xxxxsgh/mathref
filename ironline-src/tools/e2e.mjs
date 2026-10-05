#!/usr/bin/env node
/**
 * Teste ponta a ponta do IRONLINE: joga uma partida curta de verdade (fora
 * do modo shot) num Chromium headless e falha se algo quebrar.
 *
 *   node tools/e2e.mjs [--q low|medium|high] [--size 640x360] [--timeout ms] [--shots dir] [--extra "k=v&k2=v2"]
 *                      [--mode waves|hardpoint|survival] [--map street|factory]
 *
 * `--mode hardpoint`: o bot fica no centro da zona (anel do HARDPOINT) e
 * atira em quem aparecer; confere captura e vitória pela posse (`hold=12`).
 * `--mode survival`: as ondas curtas terminam no chefe (juggernaut).
 *
 * Roteiro:
 *   1. carrega o jogo (`?waves=1,1&wi=1`: duas ondas de 1 soldado, intervalo
 *      de 1 s) e confere o menu principal;
 *   2. abre o loadout e faz DEPLOY a partir dele;
 *   3. anda (WASD/sprint) e confere que o jogador se moveu;
 *   4. procura o inimigo da onda, chega perto com linha de visada, mira no
 *      peito e atira até matá-lo (confere `enemy:death` e o placar);
 *   5. recarrega (confere `weapon:reload` e o carregador cheio);
 *   6. repete para a 2ª onda até a partida acabar e confere o relatório
 *      pós-ação (`hud.screen === 'end'`, vitória);
 *   7. falha se houver pageerror, console.error ou erro de feature.
 *
 * Sobe o próprio servidor Vite numa porta livre (como tools/shot.mjs).
 * SwiftShader é lento: por padrão roda em `q=low` e 640×360.
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
const opt = { q: 'low', size: '640x360', timeout: 600000, shots: '', extra: '', mode: '', map: '' };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--q') opt.q = argv[++i];
  else if (a === '--size') opt.size = argv[++i];
  else if (a === '--timeout') opt.timeout = Number(argv[++i]);
  else if (a === '--shots') opt.shots = argv[++i];
  else if (a === '--extra') opt.extra = argv[++i]; // parâmetros de URL somados (ex.: "dynres=0")
  else if (a === '--mode') opt.mode = argv[++i];
  else if (a === '--map') opt.map = argv[++i];
  else {
    console.error('argumento desconhecido:', a);
    process.exit(2);
  }
}
const [W, H] = opt.size.split('x').map(Number);

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

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
// queda do processo da página (memória, GPU) — registra na hora, com o tempo
page.on('crash', () => {
  errors.push('page crash');
  console.log('  [page crash]');
});
page.on('pageerror', (e) => {
  errors.push('pageerror: ' + e.message);
  console.log('  [pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push('console: ' + m.text());
    console.log('  [console.error]', m.text());
  }
});

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
let failures = 0;
function check(cond, msg) {
  if (cond) log('  ✓', msg);
  else {
    log('  ✗', msg);
    failures++;
  }
  return cond;
}
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, arg, ms, every = 150) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(fn, arg)) return true;
    await wait(every);
  }
  return false;
}
async function snap(name) {
  if (!opt.shots) return;
  mkdirSync(opt.shots, { recursive: true });
  await ev(() => (window.__hold = true));
  await page.screenshot({ path: join(opt.shots, name + '.png'), timeout: 120000 });
  await ev(() => (window.__hold = false));
}

/**
 * Um "bot" no navegador: escolhe o inimigo vivo mais próximo, garante
 * linha de visada a ≤ 14 m (aproximando o jogador pela rua se preciso),
 * mira no peito e segura o gatilho. Devolve um resumo do estado.
 */
async function botTick() {
  return ev(() => {
    const ctx = window.__ironline;
    const T = ctx.THREE;
    const p = ctx.player;
    const en = ctx.services.enemies;
    const m = ctx.services.hud.match;
    const alive = (en?.list || []).filter((e) => e.alive);
    const st = { phase: m.phase, kills: m.kills, wave: m.wave, alive: alive.length, screen: ctx.services.hud.screen, firing: false };
    if (m.phase !== 'play' || (!alive.length && !m.zone)) {
      ctx.input.simulate('fire', false);
      return st;
    }
    // HARDPOINT: segura o centro da zona e só atira em quem está à vista
    const zone = m.zone;
    if (zone) {
      const zp = p.position;
      if (Math.hypot(zp.x - zone.x, zp.z - zone.z) > 1.5) p.setPose({ position: [zone.x, zone.y || 0, zone.z] });
      st.zone = { cap: +m.zs.cap.toFixed(2), hold: +m.zs.hold.toFixed(1), owner: m.zs.owner };
      const eye = p.eyePosition;
      let tgt = null;
      for (const e of alive) {
        const c = e.group.position.clone().setY(e.group.position.y + 1.15);
        if (ctx.collision.lineOfSight(eye, c, { filter: (o) => !o.data?.enemy }) && (!tgt || c.distanceTo(eye) < tgt.distanceTo(eye))) tgt = c;
      }
      if (!tgt) {
        ctx.input.simulate('fire', false);
        return st;
      }
      const d = tgt.clone().sub(eye);
      p.yaw = Math.atan2(-d.x, -d.z);
      p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      ctx.input.simulate('fire', true);
      st.firing = true;
      return st;
    }
    let best = null;
    for (const e of alive) {
      const d = e.group.position.distanceTo(p.position);
      if (!best || d < best.d) best = { e, d };
    }
    const tgt = best.e.group.position.clone();
    // peito de verdade (agachado atrás de cobertura fica bem mais baixo)
    const chest = tgt.clone().setY(tgt.y + 1.15 - (best.e.anim?.p?.crouch || 0) * 0.5);
    const eye = p.eyePosition;
    const filt = { filter: (c) => !c.data?.enemy };
    const los = ctx.collision.lineOfSight ? ctx.collision.lineOfSight(eye, chest, filt) : true;
    if (best.d > 14 || !los) {
      // aproxima: ~9 m do inimigo, do lado do jogador, num ponto livre COM
      // linha de visada até o peito (contorna a cobertura pelos lados)
      const dz = p.position.z > tgt.z ? 9 : -9;
      let first = null;
      for (const [dx, k] of [[0, 1], [2, 1], [-2, 1], [4, 0.8], [-4, 0.8], [6, 0.6], [-6, 0.6], [0, 0.6], [3, 0.4], [-3, 0.4]]) {
        const P = new T.Vector3(tgt.x + dx, 0, tgt.z + dz * k);
        const c = new T.Vector3(P.x, 1, P.z);
        if (ctx.collision.overlapSphere(c, 0.45, (o) => !o.trigger && !o.data?.enemy).length) continue;
        const y = ctx.collision.groundHeight ? ctx.collision.groundHeight(P.x, P.z, 3) : 0;
        const pos = [P.x, Number.isFinite(y) ? y : 0, P.z];
        first ||= pos;
        const ey = new T.Vector3(P.x, pos[1] + 1.62, P.z);
        if (!ctx.collision.lineOfSight || ctx.collision.lineOfSight(ey, chest, filt)) {
          first = pos;
          break;
        }
      }
      if (first) p.setPose({ position: first });
    }
    const e2 = p.eyePosition;
    const d = chest.clone().sub(e2);
    p.yaw = Math.atan2(-d.x, -d.z);
    p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    ctx.input.simulate('fire', true);
    st.firing = true;
    st.dist = +e2.distanceTo(chest).toFixed(1);
    return st;
  });
}

try {
  log(`carregando (q=${opt.q}, ${W}x${H})`);
  const modeQ = opt.mode ? `&mode=${opt.mode}${opt.mode === 'hardpoint' ? '&hold=12' : ''}` : '';
  const mapQ = opt.map ? `&map=${opt.map}` : '';
  await page.goto(`${base}?q=${opt.q}&waves=1,1&wi=1&mt=900${modeQ}${mapQ}${opt.extra ? '&' + opt.extra : ''}`, { waitUntil: 'load', timeout: opt.timeout });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: opt.timeout, polling: 200 });
  // instrumentação: conta eventos do bus
  await ev(() => {
    const ctx = window.__ironline;
    window.__ev = {};
    for (const t of ['weapon:fire', 'weapon:hit', 'weapon:reload', 'weapon:reloaded', 'enemy:death', 'enemy:fire', 'player:damage', 'player:death', 'match:start', 'match:wave', 'match:waveClear', 'player:jump']) {
      ctx.bus.on(t, () => (window.__ev[t] = (window.__ev[t] || 0) + 1));
    }
  });
  const feats = await ev(() => window.__ironline.features.map((f) => f.name + (f.ok ? '' : '✗')).join(','));
  log('features:', feats);
  check(!feats.includes('✗'), 'todas as features iniciaram');
  // fps real no menu (cena ao vivo)
  await snap('1-menu');
  check(await until(() => window.__ironline.services.hud?.screen === 'main', null, 20000), 'menu principal aberto');

  // loadout → deploy
  await ev(() => window.__ironline.services.hud.open('loadout'));
  check(await until(() => window.__ironline.services.hud.screen === 'loadout', null, 10000), 'loadout aberto');
  await snap('2-loadout');
  await ev(() => window.__ironline.services.hud.deploy());
  check(await until(() => window.__ironline.services.hud.match.phase === 'play' && !window.__ironline.services.hud.screen, null, 10000), 'deploy: partida em andamento');
  check(await ev(() => window.__ev['match:start'] === 1), 'match:start emitido');

  // anda: frente + direita com sprint por ~1,5 s de simulação
  const p0 = await ev(() => window.__ironline.player.position.toArray());
  await ev(() => {
    const i = window.__ironline.input;
    i.simulate('forward', true);
    i.simulate('sprint', true);
  });
  const sim0 = await ev(() => window.__ironline.time.now);
  await until((s) => window.__ironline.time.now - s > 1.5, sim0, 120000, 100);
  await ev(() => {
    const i = window.__ironline.input;
    i.simulate('forward', false);
    i.simulate('sprint', false);
    i.simulate('jump', true);
  });
  await wait(300);
  await ev(() => window.__ironline.input.simulate('jump', false));
  const p1 = await ev(() => window.__ironline.player.position.toArray());
  const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  check(moved > 1.5, `jogador andou ${moved.toFixed(2)} m`);

  // onda 1 → abate, recarga; onda 2 → fim
  // espera em TEMPO DE JOGO (até 12 s simulados; teto real de 15 min): sob
  // carga o SwiftShader anda ~0,01 s de jogo por segundo real
  {
    const g0 = await ev(() => window.__ironline.time.now);
    let ok = false;
    for (const end = Date.now() + 900000; Date.now() < end; ) {
      const s = await ev(() => {
        const c = window.__ironline;
        return { ok: c.services.hud.match.wave >= 1 && c.services.enemies.count() > 0, t: c.time.now };
      });
      if (s.ok) { ok = true; break; }
      if (s.t - g0 > 12) break;
      await wait(500);
    }
    check(ok, 'onda 1 entrou');
  }
  let reloaded = false;
  let shotTaken = false;
  // a partida tem até 240 s de JOGO (teto real: --timeout × 6)
  const end = Date.now() + opt.timeout * 6;
  const gEnd = (await ev(() => window.__ironline.time.now)) + 240;
  let last = null;
  while (Date.now() < end && (await ev(() => window.__ironline.time.now)) < gEnd) {
    const st = await botTick();
    if (JSON.stringify([st.phase, st.kills, st.wave, st.alive, st.screen]) !== last) {
      last = JSON.stringify([st.phase, st.kills, st.wave, st.alive, st.screen]);
      log('estado', st);
    }
    if (st.firing && !shotTaken && (await ev(() => (window.__ev['weapon:fire'] || 0) > 2))) {
      shotTaken = true;
      await snap('3-combat');
    }
    if (st.kills >= 1 && !reloaded && opt.mode !== 'hardpoint') {
      await ev(() => window.__ironline.input.simulate('fire', false));
      check(await ev(() => (window.__ev['enemy:death'] || 0) >= 1), 'inimigo morto (enemy:death)');
      check(await ev(() => (window.__ev['weapon:hit'] || 0) >= 1), 'tiros acertaram (weapon:hit)');
      await wait(400);
      const before = await ev(() => window.__ironline.services.weapon.ammo);
      await ev(() => window.__ironline.input.simulate('reload', true));
      await wait(250);
      await ev(() => window.__ironline.input.simulate('reload', false));
      check(await until(() => (window.__ev['weapon:reload'] || 0) >= 1, null, 30000), `recarga iniciada (munição antes: ${before})`);
      // espera em TEMPO DE JOGO (até 8 s simulados; teto real de 15 min): no
      // SwiftShader um frame leva vários segundos e o jogo anda ~0,08 s/frame
      const g0 = await ev(() => window.__ironline.time.now);
      let done = false;
      for (const end = Date.now() + 900000; Date.now() < end; ) {
        const s = await ev(() => {
          const c = window.__ironline, w = c.services.weapon;
          return { ok: !w.reloading && w.ammo === w.magSize, t: c.time.now };
        });
        if (s.ok) { done = true; break; }
        if (s.t - g0 > 8) break;
        await wait(500);
      }
      check(done, 'recarga concluída (carregador cheio)');
      reloaded = true;
    }
    if (st.phase === 'end' || st.screen === 'end') break;
    await wait(120);
  }
  await ev(() => window.__ironline.input.simulate('fire', false));
  check(await until(() => window.__ironline.services.hud.screen === 'end', null, 30000), 'relatório pós-ação aberto');
  const fin = await ev(() => {
    const m = window.__ironline.services.hud.match;
    return { win: m.win, kills: m.kills, deaths: m.deaths, shots: m.shots, hits: m.hits, score: m.score, waves: m.wave, ev: window.__ev, captured: m.zs?.captured || 0, hold: +(m.zs?.hold || 0).toFixed(1), boss: !!m.bossKilled };
  });
  log('final', fin);
  check(fin.win === true, opt.mode === 'hardpoint' ? 'partida vencida (posse da zona)' : 'partida vencida (todas as ondas limpas)');
  if (opt.mode === 'hardpoint') {
    check(fin.captured >= 1, `zona capturada (${fin.captured}×, posse ${fin.hold} s)`);
  } else {
    check(fin.kills >= 2, `abates: ${fin.kills}`);
    check(fin.ev['match:wave'] >= 2 && fin.ev['match:waveClear'] >= 1, 'ondas anunciadas');
  }
  if (opt.mode === 'survival') check(fin.boss, 'chefe (juggernaut) entrou e foi abatido');
  await snap('4-end');

  // desempenho (indicativo: SwiftShader na CPU, não representa GPU real)
  const perf = await ev(async () => {
    const f0 = window.__frames, t = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const r = window.__ironline.renderer.info.render;
    return { fps: ((window.__frames - f0) / ((performance.now() - t) / 1000)).toFixed(1), calls: r.calls, tris: r.triangles };
  });
  log('desempenho (SwiftShader, tela de fim):', perf);
  const ferr = await ev(() => window.__ironline.errors);
  check(!ferr.length, 'sem erros de feature' + (ferr.length ? ': ' + JSON.stringify(ferr) : ''));
  check(!errors.length, 'sem erros de página/console' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
} catch (err) {
  log('falhou:', err.message);
  failures++;
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
log(failures ? `FALHOU (${failures})` : 'OK');
process.exit(failures ? 1 : 0);
