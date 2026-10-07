// Cenários de captura/teste do sistema "space" (modo 'free').
import * as THREE from 'three/webgpu';
import { bodyPosition } from '../../core/Galaxy.js';

/** Move a origem flutuante para `sysPos` e aponta a câmera para `lookSys`. */
export function placeCamera(ctx, sysPos, lookSys, up = [0, 1, 0]) {
  const w = ctx.world;
  const cam = ctx.camera;
  if (cam.parent !== ctx.scene) ctx.scene.add(cam);
  cam.position.set(sysPos.x - w.origin.x, sysPos.y - w.origin.y, sysPos.z - w.origin.z);
  w.shift(cam.position.x, cam.position.y, cam.position.z);
  cam.position.set(0, 0, 0);
  cam.up.set(up[0], up[1], up[2]);
  cam.lookAt(lookSys.x - w.origin.x, lookSys.y - w.origin.y, lookSys.z - w.origin.z);
  cam.updateMatrixWorld();
}

const V = (o) => new THREE.Vector3(o.x, o.y, o.z);
const O = (v) => ({ x: v.x, y: v.y, z: v.z });

function findSystem(ctx, pred) {
  for (let i = 0; i < ctx.galaxy.count; i++) {
    const s = ctx.galaxy.get('sys-' + i);
    if (pred(s)) return s;
  }
  return null;
}

/** Espera o cubo do céu do sistema ficar pronto (renderiza no 1º frame). */
function settle(ctx) {
  ctx.setMode('free');
  ctx.get('space')?.setAutoEvents(false);
}

export function registerScenarios(ctx, S, api) {
  ctx.scenario('space-orfeu', 'Orfeu: Tália em crescente, a estrela Orfeu e a Via Láctea', async (ctx) => {
    if (ctx.world.system?.id !== 'orfeu') ctx.world.loadSystem('orfeu');
    settle(ctx);
    const sys = ctx.world.system;
    const b = sys.bodies.find((q) => q.id === 'talia');
    const T = bodyPosition(sys, b, ctx.world.time);
    const away = V(T).normalize();
    const side = new THREE.Vector3().crossVectors(away, new THREE.Vector3(0, 1, 0)).normalize();
    const R = b.radius;
    const cam = V(T).addScaledVector(away, 2.2 * R).addScaledVector(side, 3.2 * R).add(new THREE.Vector3(0, 0.55 * R, 0));
    const dp = V(T).sub(cam).normalize();
    const ds = cam.clone().negate().normalize();
    const look = dp.multiplyScalar(0.55).add(ds.multiplyScalar(0.45)).normalize();
    placeCamera(ctx, O(cam), O(cam.clone().add(look)));
  });

  ctx.scenario('space-milkyway', 'Via Láctea e o centro galáctico, sem nada na frente', async (ctx) => {
    settle(ctx);
    const g = S.layout.gc;
    const p = { x: 0, y: S.system.star.radius * 60, z: -S.system.star.radius * 60 };
    placeCamera(ctx, p, { x: p.x + g[0], y: p.y + g[1], z: p.z + g[2] }, S.layout.galN);
  });

  ctx.scenario('space-nebula', 'Nebulosa densa (sistema procedural com nebulosa forte)', async (ctx) => {
    let best = null;
    for (let i = 0; i < 80; i++) {
      const s = ctx.galaxy.get('sys-' + i);
      if (s.star.type === 'black_hole') continue;
      if (!best || s.nebula.density > best.nebula.density) best = s;
    }
    ctx.world.loadSystem(best.id);
    settle(ctx);
    const blob = S.layout.blobs[0];
    const st = S.system.star;
    // de longe da estrela, olhando a nuvem principal (estrela fora do quadro)
    const p = { x: -blob.c[0] * st.radius * 300, y: -blob.c[1] * st.radius * 300, z: -blob.c[2] * st.radius * 300 };
    placeCamera(ctx, p, { x: p.x + blob.c[0], y: p.y + blob.c[1], z: p.z + blob.c[2] });
  });

  ctx.scenario('space-blackhole', 'Buraco negro: disco de acreção com feixe relativístico e lente gravitacional', async (ctx) => {
    const sys = findSystem(ctx, (s) => s.star.type === 'black_hole');
    ctx.world.loadSystem(sys.id);
    settle(ctx);
    const bh = S.blackHole;
    const rs = bh.rs;
    const el = 0.11; // ~6° acima do plano do disco
    const dist = 23;
    const dir = bh.W.clone().multiplyScalar(Math.cos(el)).addScaledVector(bh.N, Math.sin(el));
    const cam = dir.multiplyScalar(dist * rs);
    // mira um pouco ao lado do centro: a sombra fica levemente fora do meio
    const look = bh.U.clone().multiplyScalar(-1.2 * rs);
    placeCamera(ctx, O(cam), O(look), [bh.N.x, bh.N.y, bh.N.z]);
  });

  ctx.scenario('space-binary', 'Estrela binária: principal e companheira azulada', async (ctx) => {
    const sys = findSystem(ctx, (s) => s.star.type === 'binary' && s.star.companion);
    ctx.world.loadSystem(sys.id);
    settle(ctx);
    const c = sys.star.companion;
    // posição da companheira agora
    const cp = ctx.world.toSystem(new THREE.Vector3());
    const a = (sys.seed % 628) / 100 + ctx.world.time * ((Math.PI * 2) / 5400);
    const comp = new THREE.Vector3(Math.cos(a) * c.separation, Math.sin(a) * c.separation * 0.12, Math.sin(a) * c.separation);
    const mid = comp.clone().multiplyScalar(0.5);
    const axis = comp.clone().normalize();
    const perp = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
    const cam = mid.clone().addScaledVector(perp, c.separation * 2.6).add(new THREE.Vector3(0, c.separation * 0.35, 0));
    void cp;
    placeCamera(ctx, O(cam), O(mid));
  });

  for (const [type, name, k] of [['blue_giant', 'space-bluegiant', 9], ['white_dwarf', 'space-whitedwarf', 14], ['red_dwarf', 'space-reddwarf', 9]]) {
    ctx.scenario(name, `Estrela do tipo ${type} vista de perto (coroa, granulação, proeminências)`, async (ctx) => {
      const sys = findSystem(ctx, (s) => s.star.type === type);
      ctx.world.loadSystem(sys.id);
      settle(ctx);
      const R = sys.star.radius;
      const p = { x: R * k * 0.8, y: R * k * 0.25, z: R * k * 0.55 };
      placeCamera(ctx, p, { x: -R * 1.6, y: 0, z: R * 0.6 });
    });
  }

  ctx.scenario('space-belt', 'Dentro do Cinturão de Orfeu: rochas, veios minerais e poeira', async (ctx) => {
    if (ctx.world.system?.id !== 'orfeu') ctx.world.loadSystem('orfeu');
    settle(ctx);
    const belt = S.belts[0];
    const d = belt.def;
    const rr = (d.innerR + d.outerR) / 2;
    // procura um aglomerado denso perto do ângulo 0,35 rad
    let best = null;
    for (let i = 0; i < 60; i++) {
      const a = 0.35 + i * 0.0021;
      const p = { x: Math.cos(a) * rr, y: 0, z: Math.sin(a) * rr };
      const v = belt.density(p.x, p.y, p.z);
      if (!best || v > best.v) best = { v, p, a };
    }
    const p = best.p;
    // olha ao longo do cinturão, com a estrela de lado (luz rasante)
    const tang = { x: -Math.sin(best.a), y: 0, z: Math.cos(best.a) };
    const toStar = { x: -Math.cos(best.a), y: 0, z: -Math.sin(best.a) };
    const lk = new THREE.Vector3(tang.x * 0.8 + toStar.x * 0.35, -0.06, tang.z * 0.8 + toStar.z * 0.35).normalize();
    // não começa dentro de uma rocha: recua até ter folga
    belt.gather(p);
    for (let k = 0; k < 40; k++) {
      const clash = belt.active.some((r) => Math.hypot(r.sys.x - p.x, r.sys.y - p.y, r.sys.z - p.z) < r.radius * 2.2 + 250);
      if (!clash) break;
      p.x -= lk.x * 400;
      p.y -= lk.y * 400 - 150;
      p.z -= lk.z * 400;
      belt.lastCell = '';
      belt.gather(p);
    }
    placeCamera(ctx, p, { x: p.x + lk.x, y: p.y + lk.y, z: p.z + lk.z });
    // garante um asteroide de minério raro (brilho emissivo) bem no quadro
    let best2 = null;
    for (const r of belt.active) {
      const v = new THREE.Vector3(r.sys.x - p.x, r.sys.y - p.y, r.sys.z - p.z);
      const d = v.length();
      const ang = v.normalize().dot(lk);
      if (ang > 0.93 && d > r.radius * 3 && d < 2500 && r.radius > 25 && (!best2 || d < best2.d)) best2 = { r, d };
    }
    if (best2) best2.r.resource = 'cristal-arquiteto';
  });

  ctx.scenario('space-dust', 'Poeira em parallax e pedregulhos riscando a 400 m/s dentro do cinturão', async (ctx) => {
    if (ctx.world.system?.id !== 'orfeu') ctx.world.loadSystem('orfeu');
    settle(ctx);
    const belt = S.belts[0];
    const d = belt.def;
    const rr = (d.innerR + d.outerR) / 2;
    const a = 0.6;
    const p = { x: Math.cos(a) * rr, y: 3000, z: Math.sin(a) * rr };
    const tang = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const toStar = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
    // olha meio de lado em relação ao movimento: os riscos ficam visíveis
    const look = tang.clone().multiplyScalar(0.75).addScaledVector(toStar, 0.6).normalize();
    placeCamera(ctx, p, { x: p.x + look.x, y: p.y + look.y, z: p.z + look.z });
    S.drift = tang.clone().multiplyScalar(400).add(new THREE.Vector3(0, -30, 0));
  });

  ctx.scenario('space-ionstorm', 'Tempestade de íons: nuvem de plasma e relâmpagos ramificados', async (ctx) => {
    if (ctx.world.system?.id !== 'orfeu') ctx.world.loadSystem('orfeu');
    settle(ctx);
    const sys = ctx.world.system;
    const b = sys.bodies.find((q) => q.id === 'nivalis');
    const N = bodyPosition(sys, b, ctx.world.time);
    const p = { x: N.x + 900000, y: 30000, z: N.z + 500000 };
    // olha para o polo galáctico (fundo escuro realça a tempestade)
    const gn = S.layout.galN;
    const gc = S.layout.gc;
    const lk = new THREE.Vector3(gn[0] * 0.8 + gc[0] * 0.25, gn[1] * 0.8 + gc[1] * 0.25, gn[2] * 0.8 + gc[2] * 0.25).normalize();
    placeCamera(ctx, p, { x: p.x + lk.x, y: p.y + lk.y, z: p.z + lk.z });
    const fwd = new THREE.Vector3();
    ctx.camera.getWorldDirection(fwd);
    const R = 18000;
    const center = fwd.clone().multiplyScalar(R * 1.3);
    const ev = api.spawnEvent('ionstorm', center, { radius: R, persistent: true });
    const st = S.events.list.find((e) => e.id === ev.id).storm;
    st.frame(ctx, new THREE.Vector3());
    // raio "congelado" na frente da nuvem para a captura (coordenadas da tempestade)
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const from = right.clone().multiplyScalar(-0.12 * R).addScaledVector(up, 0.38 * R).addScaledVector(fwd, -0.42 * R);
    const to = right.clone().multiplyScalar(0.1 * R).addScaledVector(up, -0.3 * R).addScaledVector(fwd, -0.5 * R);
    st.strike({ from, to });
    // relâmpagos internos (só luz na nuvem) em outros pontos
    st.flashAt(right.clone().multiplyScalar(0.35 * R).addScaledVector(up, 0.15 * R), 0.9);
    st.flashAt(right.clone().multiplyScalar(-0.4 * R).addScaledVector(up, -0.2 * R).addScaledVector(fwd, 0.1 * R), 0.7);
    st.strike();
    st.frozen = !ctx.params.has('live');
  });

  ctx.scenario('space-debris', 'Campo de destroços da Batalha de Tália', async (ctx) => {
    if (ctx.world.system?.id !== 'orfeu') ctx.world.loadSystem('orfeu');
    settle(ctx);
    const f = S.debris[0];
    const c = f.def.center;
    // mira o casco partido maior (primeira peça), visto de perto
    const h = f.pieces[0].off;
    const tgt = { x: c.x + h.x, y: c.y + h.y, z: c.z + h.z };
    const p = { x: tgt.x - 260, y: tgt.y + 90, z: tgt.z + 420 };
    placeCamera(ctx, p, { x: tgt.x + 60, y: tgt.y, z: tgt.z });
  });

  ctx.scenario('space-derelict', 'Nave à deriva e baliza de socorro', async (ctx) => {
    if (ctx.world.system?.id !== 'orfeu') ctx.world.loadSystem('orfeu');
    settle(ctx);
    const sys = ctx.world.system;
    const T = bodyPosition(sys, sys.bodies.find((q) => q.id === 'talia'), ctx.world.time);
    const p = { x: T.x - 400000, y: 5000, z: T.z + 300000 };
    placeCamera(ctx, p, { x: p.x + 1, y: p.y, z: p.z });
    const fwd = new THREE.Vector3();
    ctx.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    api.spawnEvent('derelict', fwd.clone().multiplyScalar(150).addScaledVector(right, -25), { persistent: true, faction: 'hegemony', name: 'Patrulha HS-114' });
    api.spawnEvent('distress', fwd.clone().multiplyScalar(320).addScaledVector(right, 110).add(new THREE.Vector3(0, 25, 0)), { persistent: true });
  });
}
