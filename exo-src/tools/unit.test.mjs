/**
 * Testes unitários do núcleo do EXOSFERA (sem DOM):  npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Vector3 } from 'three';
import { Bus } from '../src/core/Bus.js';
import { createSeed, sfc32, xmur3, makeRng } from '../src/core/Rng.js';
import { FixedStep } from '../src/core/FixedStep.js';
import { PriorityQueue } from '../src/core/PriorityQueue.js';
import { WorkerPool } from '../src/core/Workers.js';
import { Space, WorldPos, compressDistance, CAMERA_NEAR, CAMERA_FAR } from '../src/core/Space.js';
import { checkDepthRange, depthReversedF32 } from '../src/core/Depth.js';
import { dirFromLatLon, latLonFromDir, tangentFrame, headingVector, headingOf, horizonDip } from '../src/core/Geo.js';
import { Player } from '../src/core/Player.js';
import { Ready } from '../src/core/Ready.js';
import { createQuality, QUALITY_PRESETS } from '../src/core/Quality.js';
import { collectPresets, parseShot } from '../src/core/ShotPresets.js';
import { anchorLatLon } from '../src/core/ShotPlacer.js';
import { generateSystem, kelvinToRGB } from '../src/core/placeholder/universeGen.js';
import { raySphere } from '../src/core/placeholder/planet.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const f32 = Math.fround;

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
});

test('hierarquia de seed: mesmo caminho = mesma sequência, independente da ordem', () => {
  const a = createSeed(1337);
  const b = createSeed(1337);
  // consome outros caminhos em b antes — não pode afetar
  b.derive('galaxy', 0, 'system', 99).next();
  const ra = a.derive('galaxy', 0, 'system', 12, 'planet', 3);
  const rb = b.derive('galaxy', 0, 'system', 12, 'planet', 3);
  const sa = [ra.next(), ra.next(), ra.next()];
  assert.deepEqual(sa, [rb.next(), rb.next(), rb.next()]);
  // filho = caminho concatenado
  assert.equal(a.derive('galaxy', 0, 'system', 12).derive('planet', 3).next(), a.derive('galaxy', 0, 'system', 12, 'planet', 3).next());
  assert.notEqual(a.derive('galaxy', 0, 'system', 13).next(), a.derive('galaxy', 0, 'system', 12).next());
  assert.notEqual(createSeed(1338).derive('x').next(), createSeed(1337).derive('x').next());
  assert.equal(a.hash('galaxy', 0), b.hash('galaxy', 0));
  // distribuição grosseira do sfc32
  const h = xmur3('teste');
  const r = sfc32(h(), h(), h(), h());
  let s = 0;
  for (let i = 0; i < 20000; i++) s += r();
  assert.ok(Math.abs(s / 20000 - 0.5) < 0.01);
  const rr = a.derive('ints');
  for (let i = 0; i < 200; i++) {
    const v = rr.int(2, 5);
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

test('fila de prioridade: ordem, remoção e reconstrução', () => {
  const q = new PriorityQueue((a, b) => a.p - b.p || a.s - b.s);
  const items = [5, 1, 4, 1, 9, 2, 6].map((p, s) => ({ p, s }));
  items.forEach((x) => q.push(x));
  q.remove(items[4]);
  items[0].p = -1;
  q.rebuild();
  const out = [];
  while (q.size) out.push(q.pop().p);
  assert.deepEqual(out, [-1, 1, 1, 2, 4, 6]);
});

test('pool de workers: prioridade, key substitui, cancelamento e fallback', async () => {
  // Worker falso: responde em ordem de chegada, um job por vez
  const log = [];
  class FakeWorker {
    postMessage(msg) {
      log.push(msg.payload.tag);
      setTimeout(() => this.onmessage({ data: { id: msg.id, ok: true, result: { tag: msg.payload.tag, x: msg.payload.x * 2 } } }), 1);
    }
    terminate() {}
  }
  globalThis.Worker = FakeWorker;
  const pool = new WorkerPool('t', () => new FakeWorker(), { size: 1 });
  const ps = [];
  // enfileira tudo no mesmo tick: o 1º despacho só ocorre no microtask
  ps.push(pool.run('f', { tag: 'baixa', x: 1 }, { priority: 10 }));
  ps.push(pool.run('f', { tag: 'alta', x: 2 }, { priority: 0 }));
  ps.push(pool.run('f', { tag: 'velho', x: 3 }, { priority: 5, key: 'k' }));
  ps.push(pool.run('f', { tag: 'novo', x: 4 }, { priority: 5, key: 'k' }));
  const c = pool.run('f', { tag: 'cancelado', x: 5 }, { priority: 1 });
  c.cancel();
  const res = await Promise.allSettled([...ps, c]);
  assert.deepEqual(log, ['alta', 'novo', 'baixa']);
  assert.equal(res[1].value.x, 4);
  assert.ok(res[2].reason.cancelled, 'job substituído pela mesma key é cancelado');
  assert.ok(res[4].reason.cancelled);
  await pool.idle();
  assert.equal(pool.busy, 0);
  delete globalThis.Worker;
  // sem Worker: fallback no thread principal
  const fb = new WorkerPool('fb', () => {
    throw new Error('sem worker');
  }, { size: 2, fallback: { sq: ({ v }) => v * v } });
  const origWarn = console.warn;
  console.warn = () => {};
  assert.equal(await fb.run('sq', { v: 7 }), 49);
  console.warn = origWarn;
});

test('geo: lat/lon ↔ direção, triedo destro e rumo', () => {
  for (const [lat, lon] of [[0, 0], [12.5, 24], [-45, 170], [80, -100]]) {
    const d = dirFromLatLon(lat, lon);
    assert.ok(Math.abs(d.length() - 1) < 1e-12);
    const ll = latLonFromDir(d);
    assert.ok(Math.abs(ll.lat - lat) < 1e-9 && Math.abs(ll.lon - lon) < 1e-9);
    const f = tangentFrame(d);
    const c = new Vector3().crossVectors(f.east, f.north);
    assert.ok(c.distanceTo(d) < 1e-9, 'leste × norte = up');
    assert.ok(Math.abs(headingOf(d, headingVector(d, 73)) - 73) < 1e-9);
  }
  const d0 = dirFromLatLon(0, 0);
  assert.ok(d0.distanceTo(new Vector3(1, 0, 0)) < 1e-12);
  assert.ok(Math.abs(horizonDip(120000, 25000) - 34.1) < 0.1);
});

test('precisão: origem flutuante mantém o chão exato em float32 (solo a 1,7 m)', () => {
  const R = 150000;
  const space = new Space();
  const dir = dirFromLatLon(33.3, -71.7);
  const feet = new WorldPos().addScaledVector(dir, R);
  const eye = feet.clone().addScaledVector(dir, 1.7);
  space.setOrigin(eye);
  // ponto do chão a 0,37 m dos pés, no plano tangente
  const f = tangentFrame(dir);
  const g = feet.clone().addScaledVector(f.east, 0.37);
  const r = space.toRender(g);
  const exact = [g.x - eye.x, g.y - eye.y, g.z - eye.z];
  const errRel = Math.max(...[r.x, r.y, r.z].map((v, i) => Math.abs(f32(v) - exact[i])));
  assert.ok(errRel < 1e-6, `erro relativo à câmera ${errRel}`);
  // ingênuo: coordenadas absolutas em float32 erram milímetros (z-fight/jitter)
  const errAbs = Math.max(...['x', 'y', 'z'].map((k) => Math.abs(f32(g[k]) - f32(eye[k]) - exact['xyz'.indexOf(k)])));
  assert.ok(errAbs > 1e-3, `absoluto deveria errar > 1 mm (${errAbs})`);
  // órbita (1e7 m): distância à câmera exata em double
  const far = new WorldPos().addScaledVector(dir, R + 1e7);
  space.setOrigin(far);
  const rr = space.toRender(feet);
  assert.ok(Math.abs(rr.length() - 1e7) < 1e-6);
});

test('compressão de distância: monótona e preserva tamanho angular', () => {
  const C = 5e7;
  let prev = 0;
  for (const d of [1e3, 4e7, 5e7, 6e7, 1e8, 1e9, 3e9, 1e11]) {
    const dc = compressDistance(d, C);
    assert.ok(dc >= prev && dc <= d + 1e-6);
    assert.ok(dc < CAMERA_FAR / 10);
    prev = dc;
  }
  const space = new Space();
  const obj = { position: new Vector3(), scale: new Vector3(1, 1, 1) };
  obj.scale.setScalar(1.5e7);
  const h = space.registerFloating(obj, new WorldPos(3e9, 0, 0), { compress: true });
  const ang = obj.scale.x / obj.position.length();
  assert.ok(Math.abs(ang - 1.5e7 / 3e9) < 1e-12);
  h.remove();
  assert.equal(obj.scale.x, 1.5e7);
  // recentrar desloca os worldPos registrados
  const o2 = { position: new Vector3(), scale: new Vector3(1, 1, 1) };
  const wp = new WorldPos(1e7, 5, 0);
  space.registerFloating(o2, wp);
  space.recenter(new WorldPos(1e7, 0, 0));
  space.update();
  assert.deepEqual(wp.toArray(), [0, 5, 0]);
});

test('profundidade: reversed-Z float32 sem z-fighting de 0,1 m a 1e7 m', () => {
  const rev = checkDepthRange('reversed', { near: CAMERA_NEAR, far: CAMERA_FAR });
  assert.ok(rev.ok, `reversed falhou em ${JSON.stringify(rev.worst)}`);
  const log = checkDepthRange('log', { near: CAMERA_NEAR, far: CAMERA_FAR });
  assert.ok(log.ok, `log falhou em ${JSON.stringify(log.worst)}`);
  const std = checkDepthRange('standard', { near: CAMERA_NEAR, far: CAMERA_FAR });
  assert.ok(!std.ok, 'o depth convencional de 24 bits deveria falhar (referência)');
  // 0,1 m de separação a 50 km continua distinguível no reversed-Z
  assert.ok(depthReversedF32(50000, CAMERA_NEAR, CAMERA_FAR) > depthReversedF32(50000.1, CAMERA_NEAR, CAMERA_FAR));
});

/** ctx falso mínimo para o jogador. */
function fakeCtx(R = 120000) {
  const space = new Space();
  const input = {
    keys: new Set(),
    axis: { x: 0, y: 0, active: false },
    action: (n) => input.keys.has(n),
    pressed: () => false,
    consumeLook: () => ({ yaw: 0, pitch: 0 }),
  };
  const ctx = {
    space,
    input,
    bus: new Bus(),
    services: {
      planet: { radius: R, center: space.planetCenter, gravity: 9.8, heightAt: () => 0 },
    },
  };
  ctx.player = new Player(ctx);
  return ctx;
}

test('voo contínuo órbita → solo (placeholder), sem jitter no ponto de vista', () => {
  const R = 120000;
  const ctx = fakeCtx(R);
  const p = ctx.player;
  p.place({ mode: 'space', lat: 20, lon: 30, alt: 1e7, heading: 0, pitch: -89.9 });
  const ctrl = p.controllers.space;
  ctrl.command = { x: 0, y: 0, z: 1 };
  const dt = 1 / 60;
  let prevAlt = p.altitude;
  let steps = 0;
  let maxJitter = 0;
  const ground = new WorldPos();
  const rPrev = new Vector3();
  const rNow = new Vector3();
  let havePrev = false;
  while (p.altitude > ctrl.minAltitude + 0.01 && steps < 60 * 120) {
    p.update(dt);
    steps++;
    assert.ok(Number.isFinite(p.worldPos.x + p.worldPos.y + p.worldPos.z), 'posição finita');
    assert.ok(p.altitude <= prevAlt + 1e-6, `altitude não pode subir (${prevAlt} → ${p.altitude})`);
    prevAlt = p.altitude;
    if (p.altitude < 2000) {
      // ponto fixo do chão visto da câmera: o movimento em render deve
      // ser exatamente o oposto do da câmera (sem salto de float32)
      if (!havePrev) {
        ground.copy(p.worldPos).setLength(R);
      }
      p.syncCamera(1);
      ctx.space.setOrigin(p.cameraWorld);
      ctx.space.toRender(ground, rNow);
      const fr = new Vector3(f32(rNow.x), f32(rNow.y), f32(rNow.z));
      const err = fr.distanceTo(rNow);
      maxJitter = Math.max(maxJitter, err / Math.max(1, rNow.length()));
      if (havePrev) assert.ok(rNow.distanceTo(rPrev) < 1e3);
      rPrev.copy(rNow);
      havePrev = true;
    }
  }
  assert.ok(p.altitude <= ctrl.minAltitude + 0.01, `chegou ao solo (alt=${p.altitude.toFixed(2)} m em ${(steps / 60).toFixed(1)} s)`);
  assert.ok(steps / 60 < 90, `tempo de descida razoável (${(steps / 60).toFixed(1)} s)`);
  assert.ok(maxJitter < 1e-7, `erro relativo float32 ${maxJitter}`);
  // nunca abaixo do solo
  p.update(dt);
  assert.ok(p.altitude >= ctrl.minAltitude - 1e-6);
});

test('a pé: gravidade radial, apoio no chão e transporte do rumo', () => {
  const ctx = fakeCtx(80000);
  const p = ctx.player;
  p.place({ mode: 'walk', lat: 0, lon: 0, alt: 1.7, heading: 90 });
  // cai de 3 m e pousa
  p.worldPos.addScaledVector(p.up, 3);
  for (let i = 0; i < 120; i++) p.update(1 / 60);
  assert.ok(p.grounded && Math.abs(p.altitude) < 1e-6);
  // anda 30 s para "leste" e continua no chão, em pé
  ctx.input.keys.add('forward');
  const start = p.worldPos.clone();
  for (let i = 0; i < 1800; i++) p.update(1 / 60);
  const moved = p.worldPos.distanceTo(start);
  assert.ok(moved > 100, `andou ${moved.toFixed(1)} m`);
  assert.ok(Math.abs(p.altitude) < 1e-6);
  const bodyUp = new Vector3(0, 1, 0).applyQuaternion(p.quaternion);
  assert.ok(bodyUp.angleTo(p.up) < 1e-6, 'corpo em pé na normal local');
  assert.ok(Math.abs(headingOf(p.up, new Vector3(0, 0, -1).applyQuaternion(p.quaternion)) - 90) < 0.5, 'rumo preservado');
});

test('ready: estável só sem pendências por 2 frames', async () => {
  const r = new Ready();
  let res;
  r.wait(new Promise((x) => (res = x)), 'terreno');
  r.tick(5);
  assert.equal(r.settled(), false);
  res();
  await new Promise((x) => setTimeout(x, 0));
  r.tick(6);
  assert.equal(r.settled(), false);
  r.tick(8);
  assert.equal(r.settled(), true);
});

test('qualidade: presets e orçamento de referência', () => {
  for (const k of ['low', 'medium', 'high', 'ultra']) {
    const q = createQuality(k);
    assert.equal(q.level, k);
    assert.ok(q.terrainError > 0 && q.floraDensity > 0);
  }
  assert.ok(QUALITY_PRESETS.high.msaa >= 0);
});

test('presets de screenshot: canônicos válidos e sobrescritas da URL', async () => {
  const dir = join(ROOT, 'src/shots');
  const mods = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) mods[f] = await import(pathToFileURL(join(dir, f)).href);
  const presets = collectPresets(mods);
  assert.deepEqual(presets.dupes, []);
  for (const n of ['horizon', 'orbit', 'cockpit', 'sunset']) {
    const p = presets.byName.get(n);
    assert.ok(p, `preset ${n}`);
    assert.ok(['walk', 'ship', 'space'].includes(p.mode));
    assert.ok(p.owner && p.camera && typeof p.timeOfDay === 'number');
  }
  const s = parseShot(new URLSearchParams('shot=orbit&seed=7&time=0.3&lat=1'), presets);
  assert.equal(s.seed, 7);
  assert.equal(s.preset.timeOfDay, 0.3);
  assert.equal(s.preset.camera.lat, 1);
  assert.equal(s.preset.mode, 'space');
});

test('universo placeholder: determinístico e na escala documentada', () => {
  const a = generateSystem(createSeed(1337), { systemIndex: 0 });
  const b = generateSystem(createSeed(1337), { systemIndex: 0 });
  assert.equal(JSON.stringify(a.planets.map((p) => [p.radius, p.position.toArray()])), JSON.stringify(b.planets.map((p) => [p.radius, p.position.toArray()])));
  const c = generateSystem(createSeed(1337), { systemIndex: 1 });
  assert.notEqual(a.name + a.planets[0].radius, c.name + c.planets[0].radius);
  for (const p of a.planets) assert.ok(p.radius >= 60000 && p.radius <= 200000);
  assert.equal(a.planets[a.currentPlanetIndex].position.length(), 0);
  assert.ok(a.planets[0].moons.length >= 1);
  const rgb = kelvinToRGB(5800);
  assert.ok(rgb.every((v) => v > 0.7 && v <= 1));
  assert.ok(kelvinToRGB(3000)[2] < kelvinToRGB(9000)[2]);
});

test('âncora de preset: corpo aparece na elevação pedida', () => {
  const ctx = fakeCtx(120000);
  const moon = { position: new WorldPos(700000, 120000, -300000) };
  const ll = anchorLatLon(ctx, moon, 16, 30, 1.7);
  const u = dirFromLatLon(ll.lat, ll.lon);
  const eye = new WorldPos().addScaledVector(u, 120000 + 1.7);
  const v = new Vector3().subVectors(moon.position, eye);
  const el = (Math.asin(v.dot(u) / v.length()) * 180) / Math.PI;
  assert.ok(Math.abs(el - 16) < 0.01, `elevação ${el}`);
  const t = raySphere(new WorldPos(0, 0, 200000), new Vector3(0, 0, -1), new WorldPos(), 120000);
  assert.ok(Math.abs(t - 80000) < 1e-9);
});
