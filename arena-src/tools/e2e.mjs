/**
 * Teste de ponta a ponta no Chromium headless.
 *
 * Sobe o `vite preview`, abre o jogo e percorre os sistemas principais
 * (menu, inventário, visualizador, partida de treino e competitiva,
 * troca de arma, inspeção da faca com cancelamento, recarga, tiro, bots,
 * rounds, loja, save). Falha se houver erro de console ou de página.
 * Screenshots vão para tools/shots/.
 *
 *   npm run build && npm run test:e2e
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const PORT = 4789;
const BASE = `http://localhost:${PORT}/mathref/arena/`;
mkdirSync(new URL('./shots/', import.meta.url), { recursive: true });
const shot = (page, name) => page.screenshot({ path: new URL(`./shots/${name}.png`, import.meta.url).pathname });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => {
  server.stdout.on('data', (d) => d.toString().includes('localhost') && res());
  setTimeout(res, 4000);
});

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`page: ${e.message}\n${e.stack}`));

const results = [];
async function check(name, fn) {
  try {
    const r = await fn();
    results.push(`✔ ${name}${r ? ` — ${r}` : ''}`);
  } catch (e) {
    results.push(`✘ ${name} — ${e.message}`);
  }
}
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(2500);
  await shot(page, '01-menu');

  await check('menu principal renderiza', async () => {
    const t = await page.textContent('.menu-list');
    if (!t.includes('JOGAR') || !t.includes('INVENTÁRIO')) throw new Error('itens do menu ausentes');
  });

  await check('inventário inicial e IDs únicos', () =>
    ev(() => {
      const inv = window.__np.inventory;
      const ids = new Set(inv.items.map((i) => i.id));
      if (ids.size !== inv.items.length) throw new Error('IDs duplicados');
      if (!/^ITEM-\d{7}$/.test(inv.items[0].id)) throw new Error('formato de ID');
      return `${inv.items.length} itens`;
    }),
  );

  await page.click('text=INVENTÁRIO');
  await sleep(2500);
  await page.click('.card >> nth=0');
  await sleep(300);
  await shot(page, '02-inventory');

  await check('visualizador de inspeção abre', async () => {
    await page.click('.side >> text=Inspecionar');
    await sleep(2200);
    await shot(page, '03-viewer');
    const st = await ev(() => window.__np.state);
    if (st !== 'viewer') throw new Error(`estado ${st}`);
    // gira e dá zoom
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(800, 300, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -300);
    await sleep(800);
    await shot(page, '04-viewer-rotated');
    await page.keyboard.press('Escape');
    await sleep(300);
  });

  await check('comparação no visualizador', async () => {
    await ev(() => {
      const g = window.__np;
      const knives = g.inventory.items.filter((i) => i.weaponType === 'knife');
      g.ui.openViewer([knives[0], knives[1]]);
    });
    await sleep(1800);
    await shot(page, '05-compare');
    await page.keyboard.press('Escape');
    await sleep(300);
  });

  await check('loadout equipa skin', async () => {
    await ev(() => window.__np.ui.show('loadout'));
    await sleep(2000);
    await shot(page, '06-loadout');
    return ev(() => {
      const inv = window.__np.inventory;
      const r = inv.items.find((i) => i.weaponType === 'rifle' && !i.equipped);
      inv.equip(r.id);
      if (inv.equippedFor('rifle').id !== r.id) throw new Error('não equipou');
      return r.id;
    });
  });

  await check('mercado lista e compra', async () => {
    await ev(() => window.__np.ui.show('market'));
    await sleep(2000);
    await shot(page, '07-market');
    return ev(() => {
      const inv = window.__np.inventory;
      inv.save.data.progression.shards += 99999;
      const l = inv.market()[0];
      const before = inv.items.length;
      const it = inv.buyListing(l.listingId);
      if (!it || inv.items.length !== before + 1) throw new Error('compra falhou');
      if (Math.abs(it.floatValue - l.floatValue) > 1e-12 || it.patternSeed !== l.patternSeed) throw new Error('item difere da listagem');
      const v = inv.sell(it.id);
      return `comprado e vendido por ${v}`;
    });
  });

  await check('configurações', async () => {
    await ev(() => window.__np.ui.show('settings'));
    await sleep(400);
    await page.click('text=Mira');
    await sleep(200);
    await shot(page, '08-settings');
    return ev(() => {
      const s = window.__np.settings;
      s.set('fov', 90);
      if (window.__np.camera.fov !== 90) throw new Error('FOV não aplicou');
      s.set('fov', 74);
    });
  });

  // ───── partida de treino ─────
  await check('partida de treino inicia', async () => {
    await ev(() => window.__np.startMatch({ mode: 'practice', difficulty: 'normal', teamSize: 3 }));
    await sleep(500);
    await ev(() => {
      const g = window.__np;
      g.ui.closeOverlay();
      g.input.locked = true; // headless não tem pointer lock
    });
    await sleep(1200);
    await shot(page, '09-practice');
    return ev(() => `${window.__np.match.combat.actors.length} combatentes`);
  });

  // segura a tecla por `sec` segundos de SIMULAÇÃO (independe do FPS headless)
  const key = async (code, sec = 0.05) => {
    await ev(([c, t]) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      window.__np.simulate(t);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    }, [code, sec]);
  };
  const sim = (sec) => ev((t) => window.__np.simulate(t), sec);

  await check('movimento WASD + pulo', async () => {
    const before = await ev(() => window.__np.match.player.body.pos.clone());
    await key('KeyW', 0.8);
    await key('Space', 0.05);
    await sim(0.6);
    const after = await ev(() => window.__np.match.player.body.pos.clone());
    const d = Math.hypot(after.x - before.x, after.z - before.z);
    if (d < 1) throw new Error(`moveu só ${d.toFixed(2)} m`);
    return `${d.toFixed(2)} m`;
  });

  await check('tiro consome munição e cria efeitos', async () => {
    const r = await ev(async () => {
      const g = window.__np;
      const m = g.match;
      const ws = m.player.weapon;
      const before = ws.ammo;
      // aponta para um alvo de treino
      const t = m.targets[0].actor;
      const p = m.player;
      const dx = t.body.pos.x - p.body.pos.x;
      const dz = t.body.pos.z - p.body.pos.z;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2(t.body.pos.y + 1.2 - (p.body.pos.y + 1.62), Math.hypot(dx, dz));
      m.wc.state = 'ready';
      m.wc.nextFire = 0;
      g.input.buttons[0] = true;
      g.input.buttonsPressed[0] = true;
      g.simulate(0.45);
      g.input.buttons[0] = false;
      return { before, after: ws.ammo, name: ws.def.name };
    });
    await shot(page, '10-firing');
    if (r.after >= r.before) throw new Error(`munição ${r.before} → ${r.after}`);
    return `${r.name}: ${r.before} → ${r.after}`;
  });

  await check('recarga', async () => {
    await key('KeyR');
    await sim(0.6);
    await sleep(300);
    await shot(page, '11-reload');
    await sim(2.5);
    return ev(() => {
      const ws = window.__np.match.player.weapon;
      if (ws.ammo !== ws.def.mag) throw new Error(`ammo ${ws.ammo}`);
      return `${ws.ammo}/${ws.reserve}`;
    });
  });

  await check('troca para faca + inspeção', async () => {
    await key('Digit3');
    await sim(1.2);
    const s0 = await ev(() => window.__np.match.wc.state);
    await key('KeyF');
    await sim(0.9);
    await sleep(200);
    await shot(page, '12-knife-inspect-a');
    await sim(0.7);
    await sleep(200);
    await shot(page, '13-knife-inspect-b');
    const st = await ev(() => ({ state: window.__np.match.wc.state, label: window.__np.match.wc.inspectLabel, type: window.__np.match.player.weapon.def.type }));
    if (st.type !== 'knife') throw new Error('não trocou para faca');
    if (st.state !== 'inspecting') throw new Error(`estado ${st.state} (antes: ${s0})`);
    return st.label;
  });

  await check('cancelar inspeção com ataque', async () => {
    await ev(() => {
      const g = window.__np;
      g.input.buttons[0] = true;
      g.input.buttonsPressed[0] = true;
      g.simulate(1 / 60);
      g.input.buttons[0] = false;
    });
    const st = await ev(() => window.__np.match.wc.state);
    if (st === 'inspecting') throw new Error('não cancelou');
    await sleep(600);
    return st;
  });

  await check('todas as variações de inspeção da faca (incl. rara)', async () => {
    const r = await ev(async () => {
      const g = window.__np;
      const wc = g.match.wc;
      const seen = new Set();
      let rng = 0;
      for (let i = 0; i < 400 && seen.size < 5; i++) {
        wc.state = 'ready';
        wc.lastKnifeInspect = '';
        wc.rng = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);
        wc.startInspect();
        seen.add(wc.lastKnifeInspect);
      }
      wc.rng = Math.random;
      wc.cancelInspect();
      return [...seen].sort().join('');
    });
    if (r !== 'ABCDE') throw new Error(`variações vistas: ${r}`);
    return r;
  });

  await check('screenshot da inspeção rara', async () => {
    await ev(() => {
      const wc = window.__np.match.wc;
      wc.state = 'ready';
      wc.rng = () => 0.99;
      wc.startInspect();
      wc.rng = Math.random;
    });
    await sleep(1300);
    await shot(page, '14-knife-rare-1');
    await sleep(1800);
    await shot(page, '15-knife-rare-2');
    await sleep(1200);
    await shot(page, '16-knife-rare-3');
    return ev(() => window.__np.match.wc.inspectLabel);
  });

  await check('pistola e inspeção de arma', async () => {
    await sim(1);
    await key('Digit2');
    await sim(0.8);
    await key('KeyF');
    await sim(1.2);
    await sleep(200);
    await shot(page, '17-pistol-inspect');
    const st = await ev(() => window.__np.match.wc.state);
    if (st !== 'inspecting') throw new Error(st);
    return st;
  });

  await check('bots se movem e combatem', async () => {
    const before = await ev(() => window.__np.match.bots.map((b) => b.actor.body.pos.clone()));
    await sim(6);
    await sleep(300);
    const r = await ev((before) => {
      const m = window.__np.match;
      let moved = 0;
      m.bots.forEach((b, i) => {
        if (Math.hypot(b.actor.body.pos.x - before[i].x, b.actor.body.pos.z - before[i].z) > 1) moved++;
      });
      const shots = m.bots.reduce((s, b) => s + (b.actor.weapons.primary ? b.actor.weapons.primary.def.mag - b.actor.weapons.primary.ammo : 0), 0);
      const states = m.bots.map((b) => b.state).join(',');
      return { moved, total: m.bots.length, states, shots };
    }, before);
    await shot(page, '18-bots');
    if (r.moved < 2) throw new Error(`só ${r.moved}/${r.total} moveram (${r.states})`);
    return `${r.moved}/${r.total} moveram; estados: ${r.states}`;
  });

  await check('loja (treino)', async () => {
    await ev(() => window.__np.ui.toggleBuyMenu());
    await sleep(300);
    await shot(page, '19-buy');
    const r = await ev(() => {
      const m = window.__np.match;
      const err = m.purchase(m.player, 'dmr');
      return { err, primary: m.player.weapons.primary.def.id };
    });
    await ev(() => window.__np.ui.closeBuyMenu());
    if (r.primary !== 'dmr') throw new Error(r.err);
    return 'DMR comprada';
  });

  await check('luneta do DMR', async () => {
    await ev(() => {
      const g = window.__np;
      g.ui.closeOverlay();
      g.input.locked = true;
      // bots do treino podem matar o jogador no meio do teste
      const p = g.match.player;
      if (!p.alive) p.resetForRound();
      p.spawnProtect = 999;
      g.match.wc.equip('primary');
    });
    await sim(1.2);
    await ev(() => {
      const g = window.__np;
      g.input.buttonsPressed[2] = true;
      g.simulate(0.1);
    });
    await sleep(400);
    await shot(page, '20-scope');
    const z = await ev(() => window.__np.match.wc.zoomed);
    await ev(() => (window.__np.match.wc.zoomed = false));
    if (!z) throw new Error('não deu zoom');
  });

  await check('placar (Tab)', async () => {
    await ev(() => window.__np.ui.showScoreboard());
    await sleep(200);
    await shot(page, '21-scoreboard');
    await ev(() => window.__np.ui.hideScoreboard());
  });

  // ───── competitivo ─────
  await check('partida competitiva: fases do round', async () => {
    await ev(() => window.__np.startMatch({ mode: 'competitive', difficulty: 'hard', teamSize: 3 }));
    await sleep(300);
    await ev(() => {
      const g = window.__np;
      g.ui.closeOverlay();
      g.input.locked = true;
    });
    await sleep(1000);
    await shot(page, '22-comp-buy');
    const ph0 = await ev(() => window.__np.match.round.phase);
    await ev(() => (window.__np.match.round.timer = 0.05));
    await sleep(3000);
    await shot(page, '23-comp-live');
    const ph1 = await ev(() => window.__np.match.round.phase);
    if (ph0 !== 'buy' || ph1 !== 'live') throw new Error(`${ph0} → ${ph1}`);
    return `${ph0} → ${ph1}`;
  });

  await check('round termina e placar atualiza (simulação acelerada)', async () => {
    const r = await ev(async () => {
      const g = window.__np;
      const m = g.match;
      // acelera: deixa os bots lutarem por um tempo em passos fixos
      for (let i = 0; i < 60 * 70 && m.round.phase === 'live'; i++) m.update(1 / 60, { menuOpen: false });
      return { phase: m.round.phase, score: m.round.score.join(':'), reason: m.round.lastResult?.reason, feed: m.feed.length };
    });
    await shot(page, '24-comp-roundend');
    if (r.phase === 'live') throw new Error('round não terminou em 70 s simulados');
    return `${r.score} (${r.reason}); kill feed ${r.feed}`;
  });

  await check('partida completa até o fim', async () => {
    const r = await ev(async () => {
      const g = window.__np;
      const m = g.match;
      for (let i = 0; i < 60 * 60 * 30 && !m.over; i++) {
        m.update(1 / 30, { menuOpen: false });
        if (m.round.phase === 'buy') m.round.timer = Math.min(m.round.timer, 0.05);
      }
      return { over: m.over, score: m.round.score.join(':'), rounds: m.round.round, result: m.result };
    });
    await sleep(500);
    await shot(page, '25-match-end');
    if (!r.over) throw new Error(`não terminou: ${r.score} após ${r.rounds} rounds`);
    return `${r.score} em ${r.rounds} rounds; +${r.result.shards} fragmentos`;
  });

  await check('save persiste após recarregar', async () => {
    const before = await ev(() => {
      const g = window.__np;
      g.save.flush();
      return { n: g.inventory.items.length, rifle: g.inventory.equippedFor('rifle').id, matches: g.save.data.progression.matches, f: g.inventory.items[0].floatValue };
    });
    await page.reload({ waitUntil: 'load' });
    await sleep(1500);
    const after = await ev(() => {
      const g = window.__np;
      return { n: g.inventory.items.length, rifle: g.inventory.equippedFor('rifle').id, matches: g.save.data.progression.matches, f: g.inventory.items[0].floatValue };
    });
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
    return `${after.n} itens, ${after.matches} partida(s)`;
  });

  await check('desempenho (frames de partida)', async () => {
    await ev(() => window.__np.startMatch({ mode: 'practice', difficulty: 'normal', teamSize: 5 }));
    await ev(() => {
      window.__np.ui.closeOverlay();
      window.__np.input.locked = true;
    });
    await sleep(500);
    const ms = await ev(async () => {
      const g = window.__np;
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) g.match.update(1 / 60, { menuOpen: false });
      return (performance.now() - t0) / 120;
    });
    return `simulação ${ms.toFixed(2)} ms/frame (10 combatentes + alvos, sem render)`;
  });
  // ───── celular (toque) ─────
  await check('celular: controles de toque (joystick, mira, tiro, pulo)', async () => {
    await page.close(); // renderização por software: uma página por vez
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const mp = await ctx.newPage();
    mp.on('pageerror', (e) => errors.push(`mobile page: ${e.message}`));
    mp.on('console', (m) => m.type() === 'error' && errors.push(`mobile console: ${m.text()}`));
    await mp.goto(BASE, { waitUntil: 'load' });
    await sleep(1500);
    await mp.screenshot({ path: new URL('./shots/m1-menu.png', import.meta.url).pathname });
    const touch = await mp.evaluate(() => document.body.classList.contains('touch') && window.__np.input.touchMode);
    if (!touch) throw new Error('modo toque não detectado');
    await mp.evaluate(() => window.__np.startMatch({ mode: 'practice', difficulty: 'easy', teamSize: 2 }));
    await sleep(400);
    await mp.tap('.click-to-play');
    await sleep(600);
    const r = await mp.evaluate(() => {
      const g = window.__np;
      const layer = document.querySelector('.touch-layer');
      if (layer.classList.contains('hidden')) throw new Error('camada de toque escondida');
      g.match.bots.forEach((b) => (b.actor.alive = false));
      const P = (type, target, id, x, y) =>
        target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const p = g.match.player;
      const pos0 = p.body.pos.clone();
      const yaw0 = p.yaw;
      // joystick: polegar esquerdo empurra para frente
      P('pointerdown', layer, 11, 150, 260);
      P('pointermove', layer, 11, 150, 200);
      // mira: dedo direito arrasta para a esquerda
      P('pointerdown', layer, 12, 600, 200);
      P('pointermove', layer, 12, 560, 200);
      g.simulate(0.8);
      P('pointerup', layer, 11, 150, 200);
      P('pointerup', layer, 12, 560, 200);
      const moved = Math.hypot(p.body.pos.x - pos0.x, p.body.pos.z - pos0.z);
      const turned = Math.abs(p.yaw - yaw0);
      // tiro
      const ws = p.weapon;
      const ammo0 = ws.ammo;
      const fire = document.querySelector('.t-fire');
      P('pointerdown', fire, 13, 700, 280);
      g.simulate(0.3);
      P('pointerup', fire, 13, 700, 280);
      // pulo
      const jump = document.querySelector('.t-jump');
      P('pointerdown', jump, 14, 800, 330);
      g.simulate(1 / 60);
      P('pointerup', jump, 14, 800, 330);
      g.simulate(0.1);
      const jumped = !p.body.grounded || p.body.pos.y > 0.05;
      return { moved, turned, shots: ammo0 - ws.ammo, jumped };
    });
    await sleep(500);
    await mp.screenshot({ path: new URL('./shots/m2-match.png', import.meta.url).pathname });
    await mp.tap('.t-pause');
    await sleep(300);
    const paused = await mp.evaluate(() => window.__np.ui.overlayKind);
    await mp.screenshot({ path: new URL('./shots/m3-pause.png', import.meta.url).pathname });
    await ctx.close();
    if (r.moved < 1) throw new Error(`não andou (${r.moved.toFixed(2)})`);
    if (r.turned < 0.05) throw new Error('não mirou');
    if (r.shots < 1) throw new Error('não atirou');
    if (!r.jumped) throw new Error('não pulou');
    if (paused !== 'pause') throw new Error(`pausa: ${paused}`);
    return `andou ${r.moved.toFixed(1)} m, girou ${(r.turned * 57.3).toFixed(0)}°, ${r.shots} tiros, pulou, pausou`;
  });
} finally {
  console.log(results.join('\n'));
  if (errors.length) console.log('\nERROS:\n' + errors.join('\n'));
  await browser.close();
  server.kill();
  const failed = results.filter((r) => r.startsWith('✘')).length;
  process.exit(failed || errors.length ? 1 : 0);
}
