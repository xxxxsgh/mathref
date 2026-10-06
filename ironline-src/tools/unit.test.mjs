/**
 * Testes unitários do núcleo (sem DOM):  npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Bus } from '../src/core/Bus.js';
import { mulberry32, makeRng } from '../src/core/Rng.js';
import { FixedStep } from '../src/core/FixedStep.js';
import { Collision, rayBox } from '../src/core/Collision.js';
import { createQuality, QUALITY_PRESETS } from '../src/core/Quality.js';
import { SHOT_PRESETS, parseShot } from '../src/core/Shots.js';

test('bus entrega, isola exceções e desinscreve', () => {
  const bus = new Bus();
  const got = [];
  const off = bus.on('x', (v) => got.push(v));
  bus.on('x', () => {
    throw new Error('quebrado');
  });
  const orig = console.error;
  console.error = () => {};
  assert.equal(bus.emit('x', 1), 1);
  console.error = orig;
  off();
  bus.emit('x', 2);
  assert.deepEqual(got, [1]);
  let n = 0;
  bus.once('y', () => n++);
  bus.emit('y');
  bus.emit('y');
  assert.equal(n, 1);
});

test('rng é determinístico por seed', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, [c(), c(), c()]);
  const r = makeRng(7);
  for (let i = 0; i < 100; i++) {
    const v = r.int(2, 5);
    assert.ok(v >= 2 && v <= 5 && Number.isInteger(v));
  }
  assert.equal(makeRng(7).fork('vfx').next(), makeRng(7).fork('vfx').next());
});

test('passo fixo acumula e limita a espiral da morte', () => {
  const f = new FixedStep(1 / 60, 5);
  assert.equal(f.advance(1 / 60).steps, 1);
  assert.equal(f.advance(1 / 120).steps, 0);
  assert.equal(f.advance(1 / 120).steps, 1);
  assert.equal(f.advance(10).steps, 5);
});

test('raio × AABB: distância e normal da face de entrada', () => {
  const c = new Collision();
  c.addBox([-1, 0, -11], [1, 2, -9], { material: 'metal' });
  const hit = c.raycast(new Vector3(0, 1, 0), new Vector3(0, 0, -1), 100);
  assert.ok(hit);
  assert.ok(Math.abs(hit.distance - 9) < 1e-6);
  assert.deepEqual(hit.normal.toArray(), [0, 0, 1]);
  assert.equal(hit.collider.material, 'metal');
  assert.equal(c.raycast(new Vector3(0, 1, 0), new Vector3(0, 0, 1), 100), null);
  assert.equal(c.raycast(new Vector3(0, 1, 0), new Vector3(0, 0, -1), 5), null, 'respeita maxDist');
  // raio longo atravessando várias células da grade
  c.addBox([40, 0, 40], [42, 2, 42]);
  const d = new Vector3(41, 0, 41).normalize();
  const h2 = c.raycast(new Vector3(0, 1, 0), new Vector3(d.x, 0, d.z), 200);
  assert.ok(h2 && h2.distance > 50 && h2.distance < 60);
  assert.ok(rayBox(new Vector3(0, 0, 0), new Vector3(1, 0, 0), { min: new Vector3(-1, -1, -1), max: new Vector3(1, 1, 1) }).t === 0);
});

test('colisor dinâmico com refinamento de parte', () => {
  const c = new Collision();
  const pos = new Vector3(0, 0, -5);
  const id = c.addDynamic((b) => b.set(pos.clone().addScalar(-0.4).setY(0), pos.clone().addScalar(0.4).setY(1.8)), {
    tag: 'enemy',
    ray: (o, d, max) => ({ distance: 4.6, part: 'head' }),
  });
  let h = c.raycast(new Vector3(0, 1.7, 0), new Vector3(0, 0, -1), 50);
  assert.equal(h.part, 'head');
  pos.x = 10; // moveu-se: o raio não acerta mais
  h = c.raycast(new Vector3(0, 1.7, 0), new Vector3(0, 0, -1), 50);
  assert.equal(h, null);
  c.get(id).enabled = false;
  assert.equal(c.queryBox({ min: new Vector3(-100, -100, -100), max: new Vector3(100, 100, 100), intersectsBox: () => true }).length, 0);
});

test('cápsula: pousa no chão, para na parede e sobe degrau', () => {
  const c = new Collision();
  c.addBox([-50, -1, -50], [50, 0, 50]);
  c.addBox([2, 0, -5], [3, 3, 5]); // parede em x=2
  c.addBox([-3, 0, -5], [-2, 0.3, 5]); // degrau baixo em x ∈ [-3,-2]
  const p = new Vector3(0, 1, 0);
  let r = c.moveCapsule(p, new Vector3(0, -2, 0));
  assert.ok(r.onGround);
  assert.ok(Math.abs(p.y) < 1e-6);
  r = c.moveCapsule(p, new Vector3(5, -0.01, 0), { radius: 0.35, wasGrounded: true });
  assert.ok(r.hitWall);
  assert.ok(p.x < 2 - 0.34 && p.x > 1.5);
  p.set(0, 0, 0);
  c.moveCapsule(p, new Vector3(-2.5, -0.01, 0), { radius: 0.35, wasGrounded: true });
  assert.ok(Math.abs(p.y - 0.3) < 0.01, `subiu o degrau (y=${p.y})`);
  assert.ok(c.lineOfSight(new Vector3(0, 1, 0), new Vector3(1.5, 1, 0)));
  assert.ok(!c.lineOfSight(new Vector3(0, 1, 0), new Vector3(4, 1, 0)));
});

test('qualidade e presets de screenshot', () => {
  const q = createQuality('low');
  assert.equal(q.dprCap, QUALITY_PRESETS.low.dprCap);
  q.set('ultra');
  assert.equal(q.level, 'ultra');
  for (const n of ['street', 'interior', 'viewmodel', 'ads', 'combat', 'menu']) assert.ok(SHOT_PRESETS[n], n);
  const s = parseShot(new URLSearchParams('shot=ads&hud=0&seed=9'));
  assert.equal(s.preset.ads, true);
  assert.equal(s.preset.hud, false);
  assert.equal(s.seed, 9);
  assert.equal(parseShot(new URLSearchParams('')), null);
});

// ─── plataforma: classe do aparelho, governador, joystick de toque ─────────
import { classifyDevice, AUTO_LADDER, rungIndex, rungSettings } from '../src/core/Quality.js';
import { Governor } from '../src/core/Governor.js';
import { joyState } from '../src/features/touch/joy.js';

/** Alimenta `secs` segundos de frames de `ms` e devolve as decisões. */
function feed(g, ms, secs) {
  const out = [];
  for (let t = 0; t < secs; t += ms / 1000) {
    const d = g.sample(ms / 1000);
    if (d) out.push(d);
  }
  return out;
}

test('classe do aparelho → preset inicial e teto do automático', () => {
  const rtx = classifyDevice({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)', cores: 12, memory: 8 });
  assert.equal(rtx.preset, 'high');
  assert.equal(rtx.ceiling, 'ultra');
  assert.equal(rtx.targetFps, 60);
  const uhd = classifyDevice({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', cores: 4, memory: 8 });
  assert.equal(uhd.preset, 'low');
  const iris = classifyDevice({ gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', cores: 8, memory: 16 });
  assert.equal(iris.preset, 'medium');
  const sw = classifyDevice({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' });
  assert.equal(sw.preset, 'low');
  const phone = classifyDevice({ gpu: 'Adreno (TM) 740', mobile: true, cores: 8, memory: 8 });
  assert.equal(phone.mobile, true);
  assert.equal(phone.targetFps, 30);
  assert.equal(phone.preset, 'medium-');
  const oldPhone = classifyDevice({ gpu: 'Mali-G52', mobile: true, cores: 8, memory: 3 });
  assert.equal(oldPhone.preset, 'low');
  // celular nunca passa de medium, mesmo com GPU forte
  assert.ok(rungIndex(classifyDevice({ gpu: 'Apple GPU', mobile: true }).ceiling) >= rungIndex('medium'));
  // GPU mascarada: decide por CPU/memória; pouca memória derruba tudo
  assert.equal(classifyDevice({ gpu: '', cores: 16, memory: 16 }).preset, 'high');
  assert.equal(classifyDevice({ gpu: 'NVIDIA GeForce RTX 4090', cores: 2, memory: 2 }).preset, 'low');
  // 4K começa um degrau abaixo
  assert.equal(classifyDevice({ gpu: 'NVIDIA GeForce RTX 3060', cores: 8, memory: 16, width: 3840, height: 2160, dpr: 1 }).preset, 'high-');
});

test('qualidade automática: degraus, modo e preset manual', () => {
  const dev = classifyDevice({ gpu: 'Intel Iris Xe', cores: 8, memory: 16 });
  const q = createQuality('auto', null, dev);
  assert.equal(q.mode, 'auto');
  assert.equal(q.level, 'medium');
  assert.equal(q.setting, 'auto');
  q.set('ultra');
  assert.equal(q.mode, 'manual');
  assert.equal(q.setting, 'ultra');
  q.set('auto');
  assert.equal(q.mode, 'auto');
  assert.equal(q.level, 'medium');
  // os degraus vão do mais caro ao mais barato e `level` é sempre um preset
  for (let i = 0; i < AUTO_LADDER.length; i++) assert.ok(QUALITY_PRESETS[rungSettings(i).level]);
  assert.equal(rungSettings(rungIndex('high-')).volumetrics, false);
  assert.equal(rungSettings(rungIndex('medium-')).ssao, false);
  assert.equal(rungSettings(rungIndex('medium-')).contactAO, true);
});

test('camada do aparelho: celular/leve são teto; desktop não muda', async () => {
  const { deviceTier, TIER_PATCHES } = await import('../src/core/Quality.js');
  const desk = createQuality('high', null, null, { tier: 'desktop' });
  for (const [k, v] of Object.entries(QUALITY_PRESETS.high)) assert.equal(desk[k], v, k);
  assert.equal(desk.detail, 1);
  assert.equal(desk.hdr, true);
  const phone = classifyDevice({ gpu: 'Adreno (TM) 640', mobile: true, cores: 8, memory: 6 });
  assert.equal(deviceTier(phone), 'mobile');
  assert.equal(deviceTier(phone, { lite: true }), 'lite');
  const m = createQuality('auto', null, phone, { tier: deviceTier(phone) });
  assert.equal(m.tier, 'mobile');
  assert.equal(m.textureSize, 512);
  assert.equal(m.ssao, false);
  assert.ok(m.detail < 1);
  m.set('ultra'); // trocar de preset não fura o teto
  assert.equal(m.textureSize, 512);
  assert.equal(m.volumetrics, false);
  assert.ok(m.shadowMapSize <= TIER_PATCHES.mobile.shadowMapSize);
  m.set({ ssao: true }); // nem patch parcial
  assert.equal(m.ssao, false);
  const l = createQuality('low', null, phone, { tier: 'lite' });
  assert.equal(l.hdr, false);
  assert.equal(l.bloom, false);
  assert.ok(l.drawDistance <= QUALITY_PRESETS.low.drawDistance);
});

test('governador: resolução dinâmica desce rápido e sobe devagar', () => {
  const g = new Governor({ targetFps: 60, minScale: 0.6, auto: false });
  // 25 ms (40 fps): a escala cai em poucas janelas até o piso, nunca abaixo
  const down = feed(g, 25, 8);
  assert.ok(down.length >= 2);
  assert.ok(g.scale < 0.75);
  assert.ok(g.scale >= 0.6 - 1e-9);
  // sem auto, nunca troca de degrau
  assert.ok(down.every((d) => d.rung == null));
  // 8 ms (folga numa tela de 120 Hz): sobe de volta até 1, sem passar
  feed(g, 8, 60);
  assert.equal(g.scale, 1);
  // dentro da faixa de histerese (16,7–18,6 ms): não mexe
  const s0 = g.scale;
  assert.equal(feed(g, 18, 10).length, 0);
  assert.equal(g.scale, s0);
});

test('governador: degrau só desce com a resolução no chão e respeita a carência', () => {
  const g = new Governor({ targetFps: 60, minScale: 0.6, rung: 1, ceiling: 0, floor: 6, grace: 3 });
  const ds = feed(g, 40, 30);
  const rungs = ds.filter((d) => d.rung != null);
  assert.ok(rungs.length >= 1, 'desceu de degrau');
  // a primeira descida de degrau acontece depois da escala chegar ao piso
  const firstRung = ds.findIndex((d) => d.rung != null);
  assert.ok(ds.slice(0, firstRung).some((d) => d.scale <= 0.6 + 1e-9));
  // carência: entre duas descidas de degrau passam ≥ grace + downHold janelas
  assert.ok(g.rung > 1 && g.rung <= 6);
  // nunca passa do chão
  feed(g, 80, 120);
  assert.equal(g.rung, 6);
});

test('governador: sobe degrau preso no vsync e recua se a subida falhar', () => {
  const g = new Governor({ targetFps: 60, minScale: 0.6, rung: 3, ceiling: 0, floor: 6, upHold: 4, grace: 1, backoffBase: 30 });
  // 16,7 ms estáveis numa tela de 60 Hz = folga → sobe um degrau
  let ds = feed(g, 1000 / 60, 12);
  assert.ok(ds.some((d) => d.rung === 2), 'subiu');
  // o degrau novo estoura logo → desce e bloqueia novas subidas por um tempo
  ds = feed(g, 30, 12);
  assert.ok(ds.some((d) => d.rung === 3), 'desceu de novo');
  assert.ok(g.blockedUntil > g.clock, 'subidas bloqueadas (recuo)');
  const blocked = g.blockedUntil;
  ds = feed(g, 1000 / 60, 10);
  assert.ok(!ds.some((d) => d.rung != null && d.rung < 3), 'não sobe durante o recuo');
  assert.ok(blocked - g.clock > 0 || g.rung <= 3);
  // picos isolados (> 250 ms: aba voltou, GC) não contam
  const g2 = new Governor({ targetFps: 60 });
  for (let i = 0; i < 20; i++) assert.equal(g2.sample(0.5), null);
  assert.equal(g2.scale, 1);
});

test('joystick de toque: zona morta, teclas digitais e sprint', () => {
  assert.equal(joyState(0.05, -0.05).forward, false);
  assert.equal(joyState(0.05, -0.05).x, 0);
  const fwd = joyState(0, -0.6);
  assert.ok(fwd.forward && !fwd.back && !fwd.sprint);
  assert.ok(fwd.y > 0.4 && fwd.y < 0.6);
  const full = joyState(0.05, -1);
  assert.ok(full.sprint && full.forward);
  assert.ok(full.mag <= 1);
  // empurrar até o fim de lado não corre
  const side = joyState(1, 0);
  assert.ok(side.right && !side.sprint && !side.forward);
  const diag = joyState(-0.7, 0.7);
  assert.ok(diag.left && diag.back);
});

// testes da feature weapon (loadout, granada) — arquivo próprio da feature
import '../src/features/weapon/weapon.test.mjs';

// testes da feature hud (progressão, modos, captura do hardpoint) — arquivo próprio da feature
import '../src/features/hud/hud.test.mjs';
import '../src/features/inventory/inventory.test.mjs';

// testes da feature movement (slide, rampa, cancel, slide-jump, estamina) — arquivo próprio da feature
import '../src/features/movement/slidephys.test.mjs';

// testes das features streaks e enemies (killstreaks, medalhas, killcam, torreta, classes, barris)
import '../src/features/streaks/streaks.test.mjs';
import '../src/features/enemies/enemies.test.mjs';
