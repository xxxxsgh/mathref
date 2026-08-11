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

// ══════════════════════════════════════════════════════════════════════════
// FASE 2 — corrida
//
// Pilotar a volta inteira por script exigiria um piloto automático, que testaria
// o piloto e não a corrida. Em vez disso o drone é teleportado de um lado ao
// outro do plano de cada gate: é exatamente o que a detecção enxerga (o segmento
// entre dois passos de física), e isola a lógica de corrida do voo.
// ══════════════════════════════════════════════════════════════════════════
/**
 * Põe o drone alguns metros ATRÁS do gate com velocidade de atravessá-lo, e
 * deixa a física levar.
 *
 * Teleportar direto pro outro lado não funciona: a detecção olha o segmento
 * entre dois passos de física, e um teleporte acontece ENTRE os passos — os dois
 * extremos acabam do mesmo lado do plano e o cruzamento nunca existe. Empurrar
 * com velocidade real é o que a corrida enxerga de verdade.
 */
const crossGate = async (index) => {
  await page.evaluate((index) => {
    const g = globalThis.__DRONEFARER.game;
    const gate = g.race.gates.gates[index];
    g.drone.position.copy(gate.position).addScaledVector(gate.normal, -5);
    g.drone.velocity.copy(gate.normal).multiplyScalar(25);
    g.drone.crashed = false;
  }, index);
  await page.waitForTimeout(320);
};

await page.keyboard.press('KeyR');
await page.waitForTimeout(300);
const armed = await state();
check(
  'R reinicia a volta na hora: cronômetro zerado e gate 1 ativo',
  armed.race.state === 'armed' && armed.race.elapsed === 0 && armed.race.gate === 0,
  `estado ${armed.race.state}, tempo ${armed.race.elapsed}, gate ${armed.race.gate + 1}`,
);

await crossGate(0);
const started = await state();
check(
  'Cruzar o gate 1 larga o cronômetro',
  started.race.state === 'running' && started.race.elapsed > 0,
  `estado ${started.race.state}, tempo ${started.race.elapsed}s, gate ${started.race.gate + 1}`,
);

for (let i = 1; i < started.race.gates; i++) await crossGate(i);
const finished = await state();
check(
  'Passar por todos os gates na ordem termina a volta',
  finished.race.state === 'finished' && finished.race.splits === finished.race.gates,
  `estado ${finished.race.state}, ${finished.race.splits} splits de ${finished.race.gates} gates`,
);
check(
  'Melhor tempo e ghost gravados no fim da volta',
  finished.race.best != null && finished.race.hasGhost,
  `recorde ${finished.race.best}s, ghost ${finished.race.hasGhost}`,
);
check(
  'Passar no centro com combo rende créditos',
  finished.race.credits > 0,
  `${finished.race.credits} créditos`,
);

// ── Ordem obrigatória: pular gate não conta ─────────────────────────────
await page.keyboard.press('KeyR');
await page.waitForTimeout(250);
await crossGate(0);
const gateBefore = (await state()).race.gate;
// Atravessa o gate 5 estando no 2: deve ser ignorado.
await crossGate(4);
const gateAfter = (await state()).race.gate;
check(
  'A ordem é obrigatória: cruzar um gate fora de vez não conta',
  gateAfter === gateBefore,
  `continuou no gate ${gateAfter + 1} depois de atravessar o 5`,
);

// ── Troca de circuito ───────────────────────────────────────────────────
await page.keyboard.press('BracketRight');
await page.waitForTimeout(400);
const switched = await state();
check(
  'A tecla ] troca de circuito e rearma a volta',
  switched.race.circuit !== 'aberto' && switched.race.state === 'armed',
  `circuito ${switched.race.circuit}, estado ${switched.race.state}`,
);

// ── Persistência ────────────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);
const reloaded = await state();
check(
  'Recorde e ghost sobrevivem ao recarregar (localStorage versionado)',
  reloaded.race.best != null && reloaded.race.hasGhost && reloaded.race.credits > 0,
  `recorde ${reloaded.race.best}s, ghost ${reloaded.race.hasGhost}, ${reloaded.race.credits} créditos`,
);

// ══════════════════════════════════════════════════════════════════════════
// FASE 3 — mundo aberto
// ══════════════════════════════════════════════════════════════════════════
const teleport = async (x, z, y = 60) => {
  await page.evaluate(
    ({ x, y, z }) => {
      const g = globalThis.__DRONEFARER.game;
      g.drone.position.set(x, g.world.groundHeight(x, z) + y, z);
      g.drone.velocity.set(0, 0, 0);
      g.drone.crashed = false;
    },
    { x, y, z },
  );
  await page.waitForTimeout(700);
};

// As zonas precisam ser diferentes no TERRENO e no que nasce nele, não só na
// cor. Comparar densidade de props e relevo é o jeito de medir isso.
const sampleZone = async (x, z) =>
  page.evaluate(
    ({ x, z }) => {
      const g = globalThis.__DRONEFARER.game;
      const t = g.world.terrain;
      // Desvio de altura numa amostra em cruz: mede o quão acidentado é.
      let min = Infinity;
      let max = -Infinity;
      for (let i = -8; i <= 8; i++) {
        for (const [dx, dz] of [
          [i * 40, 0],
          [0, i * 40],
        ]) {
          const h = t.heightAt(x + dx, z + dz);
          min = Math.min(min, h);
          max = Math.max(max, h);
        }
      }
      const mix = g.world.props.mixAt(x, z);
      return { relief: +(max - min).toFixed(1), trees: +mix.tree.toFixed(2), containers: +mix.container.toFixed(2) };
    },
    { x, z },
  );

const vale = await sampleZone(0, 0);
const floresta = await sampleZone(-320, -980);
const costa = await sampleZone(1180, 240);
check(
  'As três zonas diferem em relevo E no que nasce nelas',
  floresta.trees > vale.trees * 4 && vale.containers > floresta.containers * 4 && costa.relief > vale.relief * 2,
  `vale ${vale.relief}m/${vale.containers} cont · floresta ${floresta.relief}m/${floresta.trees} árv · costa ${costa.relief}m`,
);

await teleport(1100, -900, 90); // longe da base, longe de tudo
const far = await state();
check(
  'O sinal degrada com a distância da base em vez de parede invisível',
  far.world.signal < 0.5 && far.world.distanceFromHome > 1200,
  `sinal ${far.world.signal} a ${far.world.distanceFromHome} m`,
);

await teleport(0, 0, 30);
// O sinal é suavizado no tempo (meia-vida ~0,4 s) pra não piscar a cada rajada
// que empurra o drone dois metros; recuperar não é instantâneo, e não deve ser.
await page.waitForTimeout(1600);
const back = await state();
check(
  'Voltar recupera o sinal (a degradação é reversível)',
  back.world.signal > 0.9,
  `sinal ${back.world.signal} a ${back.world.distanceFromHome} m da base`,
);

await teleport(340, -420, 40); // torre
const nearPoi = await state();
check(
  'Avistar um ponto de interesse o registra no mapa',
  nearPoi.world.poisFound > 0,
  `${nearPoi.world.poisFound} ponto(s) encontrado(s), zona ${nearPoi.world.zone}`,
);

await page.keyboard.press('Space'); // inicia o desafio do POI
await page.waitForTimeout(400);
check(
  'Cada ponto de interesse oferece um desafio curto',
  (await state()).world.challenge === 'torre',
  `desafio ativo: ${(await state()).world.challenge}`,
);

const beforeMap = await state();
await page.keyboard.press('Tab');
await page.waitForTimeout(900);
const withMap = await state();
check(
  'TAB abre o mapa e o jogo pausa enquanto ele está aberto',
  withMap.world.mapOpen && Math.abs(withMap.altitude - beforeMap.altitude) < 0.5,
  `mapa ${withMap.world.mapOpen}, altura ${beforeMap.altitude} → ${withMap.altitude} m`,
);
await page.keyboard.press('Tab');
await page.waitForTimeout(200);

// ══════════════════════════════════════════════════════════════════════════
// FASE 4 — missões
// ══════════════════════════════════════════════════════════════════════════
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
check('J abre o quadro de missões', (await state()).mission.boardOpen, 'quadro aberto');

await page.keyboard.press('Digit1');
await page.waitForTimeout(500);
const mission = await state();
check(
  'Aceitar uma missão pelo número começa ela na hora',
  mission.mission.id === 'insp-torre' && !mission.mission.boardOpen,
  `missão ${mission.mission.id}`,
);

// O critério do roadmap: dá pra entender o objetivo em 2 s. O que dá pra medir
// é a forma — uma linha só, curta, sem lista de tarefas.
const objectives = await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  const out = {};
  for (const def of g.missions.list) {
    g.missions.start(def.id);
    out[def.type] = g.missions.objective();
  }
  g.missions.abort();
  return out;
});
const types = Object.keys(objectives);
check(
  'Os cinco tipos de missão existem e cada um comunica o objetivo em uma linha',
  types.length === 5 &&
    Object.values(objectives).every((o) => typeof o === 'string' && o.length > 0 && o.length < 90 && !o.includes('\n')),
  types.map((t) => `${t}: "${objectives[t]}"`).join('\n     '),
);

// Entrega: pegar a carga tem que MUDAR o voo, não só marcar um objetivo.
await page.evaluate(() => globalThis.__DRONEFARER.game.missions.start('entrega-vale'));
await page.waitForTimeout(200);
await teleport(60, 40, 3);
await page.waitForTimeout(400);
const carrying = await state();
check(
  'Pegar a carga acrescenta peso de verdade ao drone',
  carrying.mission.payloadKg > 0,
  `${carrying.mission.payloadKg} kg a bordo`,
);

await page.evaluate(() => globalThis.__DRONEFARER.game.missions.abort());
await page.waitForTimeout(200);
check(
  'Abortar a missão devolve o drone ao peso normal e limpa a cena',
  (await state()).mission.payloadKg === 0,
  'carga zerada',
);

// ══════════════════════════════════════════════════════════════════════════
// FASE 5 — economia e upgrades
// ══════════════════════════════════════════════════════════════════════════
// Nenhum upgrade pode ser só vantagem: todo tier tem que piorar alguma coisa.
const tradeoffs = await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  const save = g.save;
  const before = { ...save.progress };
  const results = [];
  // "Pior" depende do eixo: mais massa, arrasto, consumo e sensibilidade ao
  // vento são custos; mais empuxo, giro, bateria e alcance são ganhos.
  const worseIfUp = ['mass', 'drag', 'wind', 'drain'];
  const lines = ['motores', 'bateria', 'helices', 'camera', 'antena'];

  for (const line of lines) {
    save.progress.credits = 999999;
    save.progress.upgrades = {};
    save.progress.equipped = {};
    g.applyLoadout();
    const base = { ...g.spec };

    // Compra os três tiers e olha o topo da linha.
    for (let i = 0; i < 3; i++) globalThis.__DRONEFARER.buyUpgrade(save, line);
    g.applyLoadout();
    const top = { ...g.spec };

    const gains = [];
    const costs = [];
    for (const key of Object.keys(base)) {
      if (typeof base[key] !== 'number' || Math.abs(top[key] - base[key]) < 1e-6) continue;
      const up = top[key] > base[key];
      const short = key.replace('Scale', '');
      if (worseIfUp.includes(short) === up) costs.push(short);
      else gains.push(short);
    }
    results.push({ line, gains, costs });
  }

  Object.assign(save.progress, before);
  g.applyLoadout();
  return results;
});

check(
  'Toda linha de upgrade tem ganho E custo — nenhuma é só vantagem',
  tradeoffs.length === 5 && tradeoffs.every((t) => t.gains.length > 0 && t.costs.length > 0),
  tradeoffs.map((t) => `${t.line}: +${t.gains.join(',')} / −${t.costs.join(',')}`).join('\n     '),
);

// Duas builds têm que VOAR diferente, não só exibir números diferentes.
const builds = await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  const save = g.save;
  const snapshot = JSON.parse(JSON.stringify(save.progress));
  const measure = (chassis) => {
    save.progress.chassis = chassis;
    save.progress.unlockedChassis = ['leve', 'equilibrado', 'cargueiro'];
    g.applyLoadout();
    // Tempo pra girar 90° com o stick no talo, integrando o mesmo modelo de voo
    // que o jogo usa — não uma fórmula paralela.
    const drone = g.drone;
    drone.quaternion.identity();
    drone.angularVelocity.set(0, 0, 0);
    drone.mode = 'ACRO';
    let angle = 0;
    let t = 0;
    const axes = { throttle: 0.33, pitch: 0, roll: 1, yaw: 0 };
    while (angle < Math.PI / 2 && t < 5) {
      drone.update(1 / 60, axes, {
        rateScale: g.spec.rateScale,
        massScale: g.spec.massScale,
        thrustScale: g.spec.thrustScale,
        dragScale: g.spec.dragScale,
      });
      angle += Math.abs(drone.angularVelocity.z) / 60;
      t += 1 / 60;
    }
    return +t.toFixed(3);
  };
  const leve = measure('leve');
  const cargueiro = measure('cargueiro');
  Object.assign(save.progress, snapshot);
  g.applyLoadout();
  return { leve, cargueiro };
});

check(
  'Chassis diferentes voam de forma perceptivelmente diferente',
  builds.cargueiro > builds.leve * 1.25,
  `90° de rolagem: leve ${builds.leve}s · cargueiro ${builds.cargueiro}s (${(builds.cargueiro / builds.leve).toFixed(2)}× mais lento)`,
);

// Comprado ≠ instalado: é o que permite tirar a antena antes de uma corrida.
const equipping = await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  const save = g.save;
  const snapshot = JSON.parse(JSON.stringify(save.progress));
  save.progress.credits = 99999;
  save.progress.upgrades = {};
  save.progress.equipped = {};
  globalThis.__DRONEFARER.buyUpgrade(save, 'antena');
  g.applyLoadout();
  const equipped = g.spec.dragScale;
  globalThis.__DRONEFARER.setEquipped(save, 'antena', 0);
  g.applyLoadout();
  const removed = g.spec.dragScale;
  const owned = save.progress.upgrades.antena;
  Object.assign(save.progress, snapshot);
  g.applyLoadout();
  return { equipped: +equipped.toFixed(3), removed: +removed.toFixed(3), owned };
});

check(
  'Dá pra desinstalar um upgrade sem perdê-lo (comprado ≠ instalado)',
  equipping.equipped > equipping.removed && equipping.owned === 1,
  `arrasto instalado ×${equipping.equipped} → desinstalado ×${equipping.removed}, tier comprado ainda ${equipping.owned}`,
);

// ══════════════════════════════════════════════════════════════════════════
// FASE 6 — risco, dano e clima
// ══════════════════════════════════════════════════════════════════════════
const crashHard = async () =>
  page.evaluate(() => {
    const g = globalThis.__DRONEFARER.game;
    // Impacto forte contra o chão, no mesmo caminho que uma batida de verdade.
    g._onCollision({ hard: true, impact: 22, normal: { y: 0.9 }, kind: 'terrain' });
  });

await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  g.save.progress.noRisk = false;
  g.damage.clear();
  g.drone.crashed = false;
});
await crashHard();
await page.waitForTimeout(300);
const damaged = await state();
check(
  'Bater forte avaria peças e gera conta de reparo',
  damaged.risk.parts.helice > 0 && damaged.risk.repairCost > 0,
  `${Object.entries(damaged.risk.parts).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ')} → ${damaged.risk.repairCost} cr`,
);

// Hélice quebrada tem que MUDAR o voo, não só acender um aviso.
const pull = await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  const drone = g.drone;
  const measure = (bias) => {
    drone.quaternion.identity();
    drone.angularVelocity.set(0, 0, 0);
    drone.crashed = false;
    drone.mode = 'ACRO';
    const axes = { throttle: 0.33, pitch: 0, roll: 0, yaw: 0 };
    for (let i = 0; i < 120; i++) drone.update(1 / 60, axes, { torqueBias: bias });
    return +drone.angularVelocity.length().toFixed(3);
  };
  const healthy = measure(null);
  const broken = measure(g.damage.torqueBias());
  return { healthy, broken };
});
check(
  'Hélice quebrada puxa o drone mesmo com o stick centrado',
  pull.broken > 0.05 && pull.healthy < 0.01,
  `giro parasita com stick solto: intacto ${pull.healthy} rad/s · avariado ${pull.broken} rad/s`,
);

// Carga cara + batida = prejuízo. É esse custo que faz pensar duas vezes.
await page.evaluate(() => {
  const g = globalThis.__DRONEFARER.game;
  g.missions.start('entrega-vale');
  g.payloadKg = 1.4;
  g.drone.crashed = false;
});
await crashHard();
await page.waitForTimeout(300);
const lost = await state();
check(
  'Crash forte com carga perde a carga e cancela a entrega',
  lost.mission.payloadKg === 0 && lost.mission.id === null,
  `carga ${lost.mission.payloadKg} kg, missão ${lost.mission.id}`,
);

// Modo sem risco: mesmo voo, sem conta pra pagar.
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
await page.evaluate(() => {
  globalThis.__DRONEFARER.game.damage.clear();
  globalThis.__DRONEFARER.game.drone.crashed = false;
});
await crashHard();
await page.waitForTimeout(300);
const safe = await state();
check(
  'Modo sem risco (N) treina sem custo: bater não avaria nem cobra',
  safe.risk.noRisk && safe.risk.repairCost === 0 && safe.risk.parts.helice === 0,
  `sem risco ${safe.risk.noRisk}, reparo ${safe.risk.repairCost} cr`,
);
await page.keyboard.press('KeyN');
await page.waitForTimeout(200);

// Clima: noite com chuva tem que ser outra missão, não a mesma com filtro.
const weathers = await page.evaluate(async () => {
  const g = globalThis.__DRONEFARER.game;
  const out = {};
  for (const id of ['limpo', 'chuva', 'nevoa', 'vento', 'noite']) {
    g.weather.set(id, true);
    g.weather.update(0.016, g.drone.position, g.drone.quaternion, g.wind);
    out[id] = {
      visibility: Math.round(g.weather.visibility()),
      wind: +g.weather.windScale.toFixed(2),
      light: +g.world.hemi.intensity.toFixed(2),
      rain: g.weather.rain.visible,
    };
  }
  g.weather.set('limpo', true);
  return out;
});
check(
  'Cada clima muda visibilidade, vento e luz ao mesmo tempo',
  weathers.nevoa.visibility < weathers.limpo.visibility * 0.4 &&
    weathers.vento.wind > weathers.limpo.wind * 2 &&
    weathers.noite.light < weathers.limpo.light * 0.3 &&
    weathers.chuva.rain,
  Object.entries(weathers)
    .map(([k, v]) => `${k}: ${v.visibility}m vis · vento ×${v.wind} · luz ${v.light}`)
    .join('\n     '),
);

// ══════════════════════════════════════════════════════════════════════════
// FASE 7 — áudio
//
// "De olhos fechados dá pra saber o que está acontecendo" não se automatiza. O
// que dá pra verificar é que os parâmetros do som REALMENTE seguem o estado do
// voo — se a frequência do motor não mudasse com o RPM, nenhum ouvido salvaria.
// ══════════════════════════════════════════════════════════════════════════
// O laço do jogo é parado durante a medição: senão ele reescreve os mesmos
// parâmetros a 60 fps com o estado real do voo e briga com os valores injetados.
const audioReady = await page.evaluate(async () => {
  const g = globalThis.__DRONEFARER.game;
  if (!g.audio.unlock()) return false;
  await g.audio.ctx.resume();
  g.engine.stop();
  return g.audio.ctx.state === 'running';
});

/**
 * `setTargetAtTime` é uma rampa exponencial, não uma atribuição: logo depois de
 * agendar, `.value` ainda é o valor ANTIGO. Medir sem deixar o relógio de áudio
 * andar compararia quatro vezes o mesmo número — foi exatamente o que aconteceu
 * na primeira versão deste teste.
 */
const sampleAudio = async (rpm, airSpeed, proximity) => {
  await page.evaluate(
    ({ rpm, airSpeed, proximity }) => {
      const g = globalThis.__DRONEFARER.game;
      for (let i = 0; i < 4; i++) {
        g.audio.update(0.05, {
          rpm,
          airSpeed,
          approachSpeed: 0,
          proximity,
          silent: false,
          batteryWarning: false,
          batteryCritical: false,
        });
      }
    },
    { rpm, airSpeed, proximity },
  );
  await page.waitForTimeout(450); // ~10 constantes de tempo da suavização
  return page.evaluate(() => {
    const g = globalThis.__DRONEFARER.game;
    return {
      fundamental: +g.audio.engine.partials[0].osc.frequency.value.toFixed(1),
      brightness: +g.audio.engine.filter.frequency.value.toFixed(0),
      windGain: +g.audio.wind.gain.gain.value.toFixed(3),
      wallEcho: +g.audio.proximity.wet.gain.value.toFixed(3),
    };
  });
};

const audio = audioReady
  ? {
      idle: await sampleAudio(0.05, 1, 0),
      full: await sampleAudio(1, 1, 0),
      fast: await sampleAudio(0.5, 30, 0),
      nearWall: await sampleAudio(0.5, 1, 1),
      music: await page.evaluate(() => {
        const g = globalThis.__DRONEFARER.game;
        g.audio.setMusic('critico');
        return g.audio._musicLayer;
      }),
    }
  : { unavailable: true };

await page.evaluate(() => globalThis.__DRONEFARER.game.engine.start());

if (audio.unavailable) {
  check('Áudio disponível no ambiente de teste', false, 'Web Audio indisponível');
} else {
  check(
    'O motor sobe de tom E de brilho com o RPM (não é volume, é esforço)',
    audio.full.fundamental > audio.idle.fundamental * 2.5 &&
      audio.full.brightness > audio.idle.brightness * 2,
    `marcha lenta ${audio.idle.fundamental} Hz / corte ${audio.idle.brightness} Hz → ` +
      `máximo ${audio.full.fundamental} Hz / corte ${audio.full.brightness} Hz`,
  );
  check(
    'O vento acompanha a velocidade do AR, não o RPM',
    audio.fast.windGain > audio.full.windGain * 3,
    `parado ${audio.full.windGain} → a 30 m/s ${audio.fast.windGain}`,
  );
  check(
    'Parede perto muda o som (eco curto aparece)',
    audio.nearWall.wallEcho > 0.2 && audio.full.wallEcho < 0.05,
    `longe ${audio.full.wallEcho} → colado ${audio.nearWall.wallEcho}`,
  );
  check(
    'A música troca de camada por contexto',
    audio.music === 'critico',
    `camada ativa: ${audio.music}`,
  );
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
if (errors.length) console.log('\nErros de console:\n' + errors.slice(0, 6).join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} critérios passaram`);
process.exit(failed.length || errors.length ? 1 : 0);
