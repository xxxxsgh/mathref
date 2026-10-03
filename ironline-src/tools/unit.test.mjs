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
