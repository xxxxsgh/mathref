// Medições objetivas do "feel" do controle: pilota o herói pelo teclado de
// verdade (eventos de tecla no navegador) com dt fixo e mede.
//
//   node tools/feel.mjs
//
// Não substitui jogar, mas pega regressões: aceleração, parada, altura de
// pulo, coyote time, planador, rampa, colisão e FOV da câmera.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer, ROOT } from './serve.mjs';

const PORT = 8092;
const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/(.*)$/, async (route) => {
  const rel = route.request().url().replace(/^.*three@[\d.]+\//, '');
  await route.fulfill({ body: await readFile(join(ROOT, 'node_modules/three', rel)), contentType: 'text/javascript' });
});
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '', contentType: 'text/css' }));
await page.goto(`http://localhost:${PORT}/ventania/?shot=1&q=low`);
await page.waitForFunction(() => window.__ventania?.ready);

const V = (fn, arg) => page.evaluate(fn, arg);
const step = (n) => V((n) => window.__ventania.step(n, 1 / 60, false), n);
const state = () => V(() => window.__ventania.state());
const spawn = (x, z, yaw = 0, camYaw = Math.PI) =>
  V(([x, z, yaw, cy]) => {
    const g = window.__ventania;
    g.player.spawn(x, z, yaw);
    g.cam.free = null;
    g.cam.yaw = cy;
    g.cam.snap(g.player);
    g.cam.yaw = cy;
  }, [x, z, yaw, camYaw]);
const hspeed = (s) => Math.hypot(s.vel[0], s.vel[2]);
const results = [];
const report = (name, value, ok, note = '') => {
  results.push({ name, value, ok, note });
  console.log(`${ok ? '✔' : '✘'} ${name.padEnd(34)} ${String(value).padEnd(14)} ${note}`);
};

// Câmera com yaw = PI fica ao norte olhando para o sul; W = andar para o sul.
// Usamos campo aberto perto do spawn.
const FIELD = [15, 150];

// 1. Aceleração ao andar.
await spawn(...FIELD, 0, Math.PI);
await step(5);
await page.keyboard.down('KeyW');
let t90 = null;
for (let i = 1; i <= 90; i++) {
  await step(1);
  const s = await state();
  if (t90 === null && hspeed(s) >= 0.9 * 4.3) t90 = i / 60;
}
report('andar: tempo até 90% da velocidade', `${t90?.toFixed(2)} s`, t90 !== null && t90 >= 0.12 && t90 <= 0.35, 'alvo 0.12–0.35 s (responsivo, com peso)');

// 2. Correr: velocidade e FOV.
await page.keyboard.down('ShiftLeft');
await step(90);
let s = await state();
report('correr: velocidade', `${hspeed(s).toFixed(2)} m/s`, Math.abs(hspeed(s) - 8.4) < 0.3, 'alvo 8.4');
report('correr: FOV abre', `${s.fov.toFixed(1)}°`, s.fov > 62, 'base 58°');

// 3. Parada a partir da corrida.
let p0 = s.pos;
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
let tStop = null;
for (let i = 1; i <= 90; i++) {
  await step(1);
  s = await state();
  if (tStop === null && hspeed(s) < 0.2) tStop = i / 60;
}
const stopDist = Math.hypot(s.pos[0] - p0[0], s.pos[2] - p0[2]);
report('parar da corrida: distância', `${stopDist.toFixed(2)} m`, stopDist > 0.3 && stopDist < 1.3, 'alvo 0.3–1.3 m (sem deslizar)');
report('parar da corrida: tempo', `${tStop?.toFixed(2)} s`, tStop !== null && tStop < 0.45, '');

// 4. Pulo curto (toque) vs longo (segurar).
async function jump(holdFrames) {
  await spawn(...FIELD, 0, Math.PI);
  await step(10);
  const y0 = (await state()).pos[1];
  await page.keyboard.down('Space');
  let maxY = y0, frames = 0, landed = false;
  for (let i = 0; i < 120; i++) {
    if (i === holdFrames) await page.keyboard.up('Space');
    await step(1);
    const st = await state();
    maxY = Math.max(maxY, st.pos[1]);
    if (i > 5 && st.grounded && !landed) { landed = true; frames = i; }
  }
  await page.keyboard.up('Space');
  return { h: maxY - y0, air: frames / 60 };
}
const short = await jump(3), long = await jump(40);
report('pulo curto: altura', `${short.h.toFixed(2)} m`, short.h > 0.5 && short.h < 1.1, '');
report('pulo longo: altura', `${long.h.toFixed(2)} m`, long.h > 1.4 && long.h < 2.2, 'alvo ~1.6–1.9 m');
report('pulo longo: tempo no ar', `${long.air.toFixed(2)} s`, long.air > 0.5 && long.air < 0.9, '');

// 5. Coyote time: sai da borda de uma coluna e pula 5 frames depois.
const col = await V(() => {
  const g = window.__ventania;
  // Coluna intacta solitária (-95,-60).
  const x = -95, z = -60;
  const top = g.player.world.colliders.groundAt(x, z, 999, 0.35, 0.45).y;
  return { x, z, top };
});
async function offEdge(delayFrames) {
  await V(({ x, z, top }) => {
    const g = window.__ventania;
    g.player.spawn(x, z, 0);
    g.player.pos.y = top;
    g.player.grounded = true;
    g.cam.free = null;
    g.cam.yaw = Math.PI;
  }, col);
  await step(3);
  await page.keyboard.down('KeyW');
  let left = -1, jumped = false;
  for (let i = 0; i < 80; i++) {
    await step(1);
    const st = await state();
    if (left < 0 && !st.grounded) left = i;
    if (left >= 0 && i === left + delayFrames) await page.keyboard.press('Space');
    if (left >= 0 && st.vel[1] > 5) jumped = true;
  }
  await page.keyboard.up('KeyW');
  return jumped;
}
report('coyote: pula 5 frames após sair', (await offEdge(5)) ? 'pulou' : 'não pulou', await offEdge(5), 'janela 0.14 s');
report('coyote: 20 frames após sair', (await offEdge(20)) ? 'pulou' : 'não pulou', !(await offEdge(20)), 'não deve pular');

// 6. Planador: do topo do arco.
await V(() => {
  const g = window.__ventania;
  // No ar, 25 m acima da encosta sul da colina.
  g.player.spawn(-150, -110, 0);
  g.player.pos.y += 25;
  g.player.grounded = false;
  g.player.vel.set(0, 0, 0);
  g.cam.free = null;
});
await step(20);
await page.keyboard.press('Space');
await page.keyboard.down('KeyW');
await step(30);
let g0 = await state();
await step(120);
let g1 = await state();
await page.keyboard.up('KeyW');
const sink = (g0.pos[1] - g1.pos[1]) / 2;
const gs = hspeed(g1);
report('planador: abriu', g1.gliding ? 'sim' : 'não', g1.gliding, '');
report('planador: taxa de descida', `${sink.toFixed(2)} m/s`, sink > 1.5 && sink < 3.5, 'alvo ~2.3');
report('planador: velocidade horizontal', `${gs.toFixed(2)} m/s`, gs > 8 && gs < 12, '');
report('planador: FOV', `${g1.fov.toFixed(1)}°`, g1.fov > 63, '');

// 7. Rampa: parado numa encosta íngreme não escorrega.
const slope = await V(() => {
  const t = window.__ventania.player.world.terrain;
  let best = null;
  for (let a = 0; a < 64; a++) {
    for (const d of [60, 80, 100]) {
      const x = -150 + Math.cos(a / 10) * d, z = -165 + Math.sin(a / 10) * d;
      const n = t.normalAt(x, z);
      if (n.y < 0.85 && n.y > 0.65 && (!best || n.y < best.ny)) best = { x, z, ny: n.y };
    }
  }
  return best;
});
await spawn(slope.x, slope.z);
await step(10);
let sp0 = await state();
await step(120);
let sp1 = await state();
const drift = Math.hypot(sp1.pos[0] - sp0.pos[0], sp1.pos[2] - sp0.pos[2]);
report(`rampa (normal.y=${slope.ny.toFixed(2)}): deriva parado`, `${drift.toFixed(3)} m`, drift < 0.01, 'sem deslizar');

// 8. Descer rampa correndo sem "voar".
await spawn(slope.x, slope.z, 0, 0);
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
let airFrames = 0;
for (let i = 0; i < 90; i++) {
  await step(1);
  if (!(await state()).grounded) airFrames++;
}
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
report('correr na encosta: frames no ar', airFrames, airFrames < 6, 'gruda no chão');

// 9. Colisão da câmera: atrás da coluna.
await V(() => {
  const g = window.__ventania;
  g.player.spawn(-95, -60 + 1.6, 0); // jogador ao sul da coluna, câmera ao norte (atrás dela)
  g.cam.free = null;
  g.cam.yaw = Math.PI;
  g.cam.pitch = 0.1;
  g.cam.wantDist = g.cam.dist = 6;
  g.cam.snap(g.player);
  g.cam.yaw = Math.PI;
});
await step(60);
s = await state();
report('câmera: encurta atrás da coluna', `${s.camDist.toFixed(2)} m`, s.camDist < 2.0, 'dist 6 sem obstáculo');

// 10. Colisão do jogador com tronco/coluna: não atravessa.
await V(() => {
  const g = window.__ventania;
  g.player.spawn(-95, -60 - 3, 0);
  g.cam.free = null;
  g.cam.yaw = Math.PI;
});
await page.keyboard.down('KeyW');
await step(120);
await page.keyboard.up('KeyW');
s = await state();
const dCol = Math.hypot(s.pos[0] + 95, s.pos[2] + 60);
report('colisão: não atravessa coluna', `${dCol.toFixed(2)} m`, dCol > 0.9, 'raio coluna 0.62 + jogador 0.35');

// 11. (C5) Curva de 90° correndo: não perde embalo.
await spawn(...FIELD, 0, Math.PI);
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await step(60);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyD');
let minSp = 99, tAlign = null;
for (let i = 1; i <= 60; i++) {
  await step(1);
  const st = await state();
  minSp = Math.min(minSp, hspeed(st));
  // D com câmera ao norte = andar para oeste (-X).
  if (tAlign === null && st.vel[0] < -0.95 * hspeed(st)) tAlign = i / 60;
}
await page.keyboard.up('KeyD');
await page.keyboard.up('ShiftLeft');
report('curva 90° correndo: velocidade mínima', `${minSp.toFixed(2)} m/s`, minSp > 7, 'não "corta" o embalo');
report('curva 90° correndo: tempo p/ alinhar', `${tAlign?.toFixed(2)} s`, tAlign !== null && tAlign < 0.3, '');

// 12. (C5) Reversão de 180° correndo.
await spawn(...FIELD, 0, Math.PI);
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await step(60);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
let tRev = null;
for (let i = 1; i <= 90; i++) {
  await step(1);
  const st = await state();
  if (tRev === null && st.vel[2] < -4) tRev = i / 60;
}
await page.keyboard.up('KeyS');
await page.keyboard.up('ShiftLeft');
report('reversão 180°: tempo até 4 m/s de volta', `${tRev?.toFixed(2)} s`, tRev !== null && tRev < 0.4, '');

// 13. (C3) Aterrissar planando mantém embalo por um instante.
await V(() => {
  const g = window.__ventania;
  g.player.spawn(15, 150, 0);
  g.player.pos.y += 3.2;
  g.player.grounded = false;
  g.player.gliding = true;
  g.player.vel.set(0, -2.3, 9.5);
  g.cam.free = null;
  g.cam.yaw = Math.PI;
});
await page.keyboard.down('KeyW');
let landedAt = -1, spAfter = null;
for (let i = 0; i < 120; i++) {
  await step(1);
  const st = await state();
  if (landedAt < 0 && st.grounded) landedAt = i;
  if (landedAt >= 0 && i === landedAt + 9) spAfter = hspeed(st);
}
await page.keyboard.up('KeyW');
report('aterrissar planando: velocidade 0.15 s depois', `${spAfter?.toFixed(2)} m/s`, spAfter > 6, 'embalo (andar = 4.3)');

// 14. (C4) Pulo comum não treme a câmera.
await spawn(...FIELD, 0, Math.PI);
await page.keyboard.down('Space');
await step(30);
await page.keyboard.up('Space');
await step(40);
const shake = await V(() => window.__ventania.cam.shake);
report('pulo comum: tremida de câmera', shake.toFixed(2), shake === 0, '');

// 15. (C1/C2) Câmera atrás de copa e herói oculto quando espremida.
const tree = await V(() => window.__ventania.player.world.colliders.all.find((c) => c.camOnly && Math.hypot(c.x - 15, c.z - 150) < 200));
await V((t) => {
  const g = window.__ventania;
  g.player.spawn(t.x, t.z + 3.5, 0);
  g.cam.free = null;
  g.cam.yaw = Math.PI;
  g.cam.pitch = 0.75;
  g.cam.wantDist = g.cam.dist = 7;
  g.cam.snap(g.player);
  g.cam.yaw = Math.PI;
}, tree);
await step(60);
s = await state();
const inside = await V(() => {
  const g = window.__ventania;
  const p = g.renderer && g.cam.camera.position;
  return g.player.world.colliders.inside(p.x, p.y, p.z, 0);
});
report('câmera não entra na copa', inside ? 'dentro' : 'fora', !inside, `dist ${s.camDist.toFixed(2)}`);
await V(() => {
  const g = window.__ventania;
  g.player.spawn(-95, -60 + 1.4, 0);
  g.cam.free = null; g.cam.yaw = Math.PI; g.cam.pitch = 0.1; g.cam.wantDist = g.cam.dist = 6;
  g.cam.snap(g.player); g.cam.yaw = Math.PI;
});
await step(60);
const heroVis = await V(() => window.__ventania.player.hero.root.visible);
report('câmera espremida: herói oculto', heroVis ? 'visível' : 'oculto', !heroVis, 'não mostra o "oco" da cabeça');

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} ok`);
if (errors.length) console.log('erros:', errors);
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
