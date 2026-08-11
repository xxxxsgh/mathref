/**
 * Critérios de aceite executáveis.
 *
 * O roadmap manda "rodar os critérios de aceite que dá pra verificar em código".
 * Sensação de pilotagem ninguém automatiza — mas as afirmações FÍSICAS por trás
 * dela dá: se inclinar pra frente deixasse de trocar altura por velocidade, o
 * jogo inteiro perderia o sentido e nenhum teste de unidade acusaria.
 *
 * Este arquivo sobe o build, pilota o drone pelo teclado de verdade e mede o
 * resultado. Roda contra `../drone`, então rode `npm run build` antes.
 *
 *   npm i -D playwright        (só isto; o navegador já vem no ambiente)
 *   npm run test:aceite
 *
 * Playwright NÃO é dependência do jogo — o jogo não tem nenhuma além do Three.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', 'drone');
const BASE = '/mathref/drone/';
const PORT = 8097;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright não instalado. Rode: npm i -D playwright');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  if (p === '' || p === '/' || p === '/favicon.ico') p = 'index.html';
  p = normalize(p).replace(/^(\.\.[/\\])+/, '');
  if (p === '.' || p === '/') p = 'index.html';
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

/**
 * Acha um Chromium já instalado na máquina.
 *
 * O Playwright exige a build exata que ele espera e manda rodar
 * `playwright install`. Em ambiente com navegador pré-instalado (e muitas vezes
 * sem rede pra baixar outro), a build disponível quase nunca é a esperada — mas
 * serve perfeitamente. Aqui procuramos qualquer uma e apontamos pra ela.
 */
async function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return undefined;
  const { readdir, access } = await import('node:fs/promises');
  let dirs = [];
  try {
    dirs = await readdir(base);
  } catch {
    return undefined;
  }
  // Preferir o navegador completo ao headless-shell: o shell não tem WebGL.
  for (const prefix of ['chromium-', 'chromium_headless_shell-']) {
    for (const dir of dirs.filter((d) => d.startsWith(prefix)).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const candidate = join(base, dir, rel);
        try {
          await access(candidate);
          return candidate;
        } catch {
          /* tenta o próximo */
        }
      }
    }
  }
  return undefined;
}

const browser = await chromium.launch({
  executablePath: await findChromium(),
  // SwiftShader: o CI não tem GPU. Os números de fps aqui não valem nada, mas
  // a física é idêntica — ela roda em passo fixo, independente do render.
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`http://127.0.0.1:${PORT}${BASE}?q=minimo`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const state = () => page.evaluate(() => globalThis.__DRONEFARER.debugState());
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}\n     ${detail}`);
};

const flyUp = async (ms) => {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
};

/**
 * O acelerador de teclado é catraca, não mola: depois de subir ele fica onde
 * parou. Medir perda de sustentação com o motor no talo não mediria nada — a
 * 100% o drone sobe inclinado, e deve mesmo.
 */
const setThrottle = async (target) => {
  // Toques curtos: a 1.8/s, cada 10 ms move o acelerador ~0.018. Com toques de
  // 30 ms o passo era 0.054 — mais grosso que o efeito medido depois, e a
  // medição virava sorteio.
  for (let i = 0; i < 90; i++) {
    const t = (await state()).throttle;
    if (Math.abs(t - target) < 0.02) return t;
    const key = t > target ? 'KeyS' : 'KeyW';
    await page.keyboard.down(key);
    await page.waitForTimeout(10);
    await page.keyboard.up(key);
  }
  return (await state()).throttle;
};

/** Média de várias amostras: as rajadas de vento mexem no valor instantâneo. */
const average = async (field, samples = 8, gapMs = 90) => {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += (await state())[field];
    await page.waitForTimeout(gapMs);
  }
  return +(sum / samples).toFixed(2);
};

/** Espera a inércia vertical sumir. Perto do equilíbrio isso leva segundos. */
const settle = async (limit = 0.35, maxMs = 14000) => {
  const deadline = Date.now() + maxMs;
  let s = await state();
  while (Math.abs(s.verticalSpeed) > limit && Date.now() < deadline) {
    await page.waitForTimeout(200);
    s = await state();
  }
  return s;
};

const HOVER = 1 / 3; // 1 / thrustToWeight

// ── Pairar ──────────────────────────────────────────────────────────────
const spawn = await state();
check(
  'Acelerador solto (ponto de pairar) mantém a altura',
  Math.abs(spawn.verticalSpeed) < 0.6 && spawn.altitude > 1,
  `acelerador ${spawn.throttle}, vertical ${spawn.verticalSpeed} m/s, altura ${spawn.altitude} m`,
);

// ── Mecânica central: inclinar troca altura por velocidade ──────────────
await flyUp(1400);
await setThrottle(HOVER);
const before = await settle();
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(2500);
const sinkRate = await average('verticalSpeed');
const during = await state();
await page.keyboard.up('ArrowUp');

check(
  'Pitch pra frente ganha velocidade horizontal',
  during.speedKmh > before.speedKmh + 15,
  `${before.speedKmh} → ${during.speedKmh} km/h (inclinação ${during.tiltDeg}°)`,
);
check(
  'Pitch pra frente perde sustentação e afunda',
  sinkRate < -0.8,
  `vertical ${sinkRate} m/s em média (partiu de ${before.verticalSpeed} m/s nivelado)`,
);
check('FOV sobe com a velocidade', during.fov > before.fov + 1, `${before.fov}° → ${during.fov}°`);

// ── ANGLE vs ACRO ───────────────────────────────────────────────────────
await page.waitForTimeout(1500);
const angleTilt = (await state()).tiltDeg;
check(
  'ANGLE volta ao nivelado sozinho ao soltar o stick',
  angleTilt < 8,
  `inclinação após soltar: ${angleTilt}°`,
);

await page.keyboard.press('KeyM');
await page.waitForTimeout(200);
check('Tecla M troca ANGLE → ACRO', (await state()).mode === 'ACRO', 'modo = ACRO');

await flyUp(900);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(700);
await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(120);
const acroAfter = await state();
await page.waitForTimeout(1400);
const acroSettled = await state();
check(
  'ACRO mantém a rotação depois de soltar e NÃO auto-nivela',
  acroAfter.angularSpeed > 0.15 && acroSettled.tiltDeg > 12,
  `giro residual ${acroAfter.angularSpeed} rad/s; inclinação 1,4 s depois ${acroSettled.tiltDeg}° (ANGLE: ${angleTilt}°)`,
);

// ── Crash e respawn ─────────────────────────────────────────────────────
await page.keyboard.press('KeyM');
await page.waitForTimeout(300);
await flyUp(1200);
await setThrottle(HOVER);
await page.waitForTimeout(400);
await page.keyboard.down('ArrowUp');
await page.keyboard.down('KeyS');
let crashed = false;
for (let i = 0; i < 90 && !crashed; i++) {
  await page.waitForTimeout(150);
  crashed = (await state()).crashed;
}
await page.keyboard.up('ArrowUp');
await page.keyboard.up('KeyS');
check('Bater em velocidade vira crash', crashed, `crashed = ${crashed}`);

await page.waitForTimeout(2000);
const after = await state();
check(
  'Respawn é automático, sem menu e sem tela de game over',
  !after.crashed,
  `crashed = ${after.crashed}, altura ${after.altitude} m`,
);

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
if (errors.length) console.log('\nErros de console:\n' + errors.slice(0, 6).join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} critérios passaram`);
process.exit(failed.length || errors.length ? 1 : 0);
