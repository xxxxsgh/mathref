// Testes rápidos do núcleo (sem navegador): universo determinístico, ruído, colisão.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Galaxy } from '../src/core/Universe.js';
import { Noise, Rng } from '../src/core/Rng.js';
import { Collision } from '../src/core/Collision.js';
import * as THREE from 'three/webgpu';

test('galáxia é determinística', () => {
  const a = new Galaxy(2387), b = new Galaxy(2387);
  assert.equal(a.systems.length, b.systems.length);
  assert.deepEqual(a.system('s17').bodies.map((x) => x.name), b.system('s17').bodies.map((x) => x.name));
});
test('Kessa tem 3 planetas pousáveis, gigante gasoso e estação', () => {
  const k = new Galaxy(2387).system('kessa');
  assert.ok(k.bodies.filter((b) => b.kind === 'planet' && b.landable).length >= 3);
  assert.ok(k.bodies.some((b) => b.kind === 'gas_giant'));
  assert.ok(k.stations.some((s) => s.name === 'Estação Meridiana'));
});
test('sistemas procedurais têm 2–8 planetas', () => {
  const g = new Galaxy(7);
  for (let i = 0; i < 40; i++) { const s = g.system('s' + i); const n = s.bodies.filter((b) => !b.parent).length; assert.ok(n >= 2 && n <= 8, s.id + ' ' + n); }
});
test('ruído é estável e limitado', () => {
  const n = new Noise(5);
  assert.equal(n.noise3(1.3, 2.1, -0.4), new Noise(5).noise3(1.3, 2.1, -0.4));
  for (let i = 0; i < 1000; i++) { const v = n.fbm3(i * 0.37, i * 0.11, i * 0.73); assert.ok(v >= -1 && v <= 1); }
});
test('rotação do planeta: local→mundo→local', () => {
  const p = new Galaxy(2387).system('kessa').bodies[0];
  const l = new THREE.Vector3(100, p.radius, -50);
  const w = p.localToWorld(l, 1234.5); const back = p.worldToLocal(w, 1234.5);
  assert.ok(back.distanceTo(l) < 1e-3);
});
test('colisão: esfera sai da caixa e raycast acerta', () => {
  const c = new Collision();
  c.addBox({ center: new THREE.Vector3(0, -1, 0), half: new THREE.Vector3(10, 1, 10) });
  const r = c.resolveSphere(new THREE.Vector3(0, 0.2, 0), 0.5, new THREE.Vector3(0, 1, 0));
  assert.ok(r.onGround && Math.abs(r.pos.y - 0.5) < 1e-6);
  const h = c.raycast(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0), 100);
  assert.ok(h && Math.abs(h.dist - 5) < 1e-6);
});
