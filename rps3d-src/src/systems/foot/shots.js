// Presets de screenshot do sistema `foot`. Cada um escolhe um lugar real do
// planeta (hora do dia pela elevação do sol, mata/clareira, relevo), põe o
// jogador a pé com a arma certa, monta a cena (inimigos, disparos em voo,
// clima, visor) e mantém o instante (tiros "congelados" no ar) até a captura.
import * as THREE from 'three/webgpu';
import { A } from './projectiles.js';
import { WEAPONS } from './arsenal.js';

const D2R = Math.PI / 180;
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };

function prep(ctx, sysId) { if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId); }
function body(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name); }

function sunTangent(ctx, b, d) {
  const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  const sunL = b.dirToLocal(sunW, ctx.time.world, new THREE.Vector3());
  return sunL.addScaledVector(d, -sunL.dot(d)).normalize();
}

/** Procura uma direção local com o sol a `elev`, pontuada por score(d, h). */
function search(ctx, b, elev, score, tries = 500) {
  const pl = ctx.services.planets;
  let best = null, bs = -Infinity;
  for (let i = 0; i < tries; i++) {
    const az = (i / tries) * 360 + (i % 7) * 0.37;
    const e = elev + ((i * 7919) % 11 - 5) * 0.3;
    const d = pl.dirForSun(b, e, az);
    const h = pl.heightAtLocal(b, d);
    const s = score(d, h);
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}
function slopeAt(pl, b, d, step = 3) {
  const t1 = new THREE.Vector3(0, 1, 0).cross(d).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1);
  const h0 = pl.heightAtLocal(b, d);
  const h1 = pl.heightAtLocal(b, d.clone().addScaledVector(t1, step / b.radius).normalize());
  const h2 = pl.heightAtLocal(b, d.clone().addScaledVector(t2, step / b.radius).normalize());
  return Math.hypot(h1 - h0, h2 - h0) / step;
}

/** Põe o jogador em `d` olhando para `lookL` (tangente local) com arfagem. */
function placePlayer(ctx, api, S, b, d, lookL, pitch = 0) {
  const pl = ctx.services.planets;
  const local = pl.placeOnSurface(b, d, 0.02);
  const w = b.localToWorld(local, ctx.time.world, new THREE.Vector3());
  const fW = b.dirToWorld(lookL, ctx.time.world, new THREE.Vector3());
  api.spawnAt(w, null, fW);
  S.ctrl.place(w, fW, { kind: 'body', body: b });
  S.ctrl.pitch = pitch;
  S.ctrl.grounded = true;
  return local;
}
function equipNow(S, id) {
  S.arsenal.current = id;
  S.vm.setWeapon(id);
  S.vm.equip = 1; S.vm.equipTarget = 1; S.vm.pending = null;
}
/** Projétil "congelado" no ar (para a foto). */
function frozenBolt(S, anchor, from, to, color, { width = 0.07, len = 3, intensity = 30 } = {}) {
  const dir = to.clone().sub(from).normalize();
  const p = S.proj.spawn({ anchor, pos: to.clone(), dir, speed: 0.001, damage: 0, owner: 'shot', color, width, len, life: 999, intensity });
  p.start.copy(from);
  p.vel.set(0, 0, 0);
  return p;
}
function local(b, d, alongL, sideL, fwd, side, up = 0) {
  return d.clone().multiplyScalar(b.radius).addScaledVector(fwd, alongL).addScaledVector(side, sideL).normalize();
}

export function registerShots(ctx, api, S) {
  const settle = () => { try { ctx.services.planets?.settle?.(); } catch { /* */ } };
  const tick = (n = 3) => { for (let i = 0; i < n; i++) { for (const s of ctx.systems) if (s.enabled && s.update && s.name !== 'story') { try { s.update(1 / 60, ctx); } catch (e) { ctx.errors.push(`shot tick ${s.name}: ${e}`); } } } };

  // ── Verídia: clareira na mata alienígena, sol baixo atravessando as copas ──
  ctx.shots.register('foot-veridia-forest', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 9), (d, h) => {
      if (h < 6 || h > 600) return -Infinity;
      const sl = slopeAt(pl, b, d, 4);
      if (sl > 0.12) return -Infinity;
      const P0 = d.clone().multiplyScalar(b.radius);
      const f = S.flora.forestAt(b, P0);
      return f * 100 - sl * 200 - Math.abs(h - 60) * 0.05;
    }, 900);
    const sunT = sunTangent(ctx, b, d);
    const look = sunT.clone().applyAxisAngle(d, P(ctx, 'yaw', 35) * D2R);
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.06));
    equipNow(S, 'rifle');
    S.flora.update(b, S.ctrl.local);
    try { pl.weather.force('rain', 0); } catch { /* */ }
    ctx.camera.fov = 74; ctx.camera.updateProjectionMatrix();
    S.shotHold = () => { S.vm.breath = 1.1; };
    settle();
  });

  // ── disparo do rifle de pulso: clarão, rastros em voo, impacto no alvo ──
  ctx.shots.register('foot-weapon-fire', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 6), (d, h) => {
      if (h < 8 || h > 500) return -Infinity;
      const sl = slopeAt(pl, b, d, 6);
      if (sl > 0.1) return -Infinity;
      const f = S.flora.forestAt(b, d.clone().multiplyScalar(b.radius));
      return (1 - Math.abs(f - 0.45)) * 50 - sl * 300;
    }, 700);
    const sunT = sunTangent(ctx, b, d);
    const look = sunT.clone().applyAxisAngle(d, P(ctx, 'yaw', -70) * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    placePlayer(ctx, api, S, b, d, look, 0.02);
    equipNow(S, 'rifle');
    S.flora.update(b, S.ctrl.local);
    // alvo: corsário a 22 m
    const anchor = { kind: 'body', body: b };
    S.ctrl.anchor = anchor;
    const tgtD = local(b, d, 22, -1.5, look, side);
    const tgt = pl.placeOnSurface(b, tgtD, 0);
    const e = S.director.addEnemy({ kind: 'soldier', faction: 'corsarios', anchor, pos: tgt, fwd: look.clone().negate(), state: 'combat', seed: 7 });
    e.aware = 1; e.ready = 1; e.fireT = 99; e.crouch = 0;
    e.hitX.v = -3; e.hitZ.v = 2;
    // rastros congelados do jogador rumo ao alvo
    const eyeL = S.ctrl.local.clone().addScaledVector(d, 1.62);
    const muzzle = eyeL.clone().addScaledVector(look, 0.6).addScaledVector(side, 0.12).addScaledVector(d, -0.12);
    const chest = tgt.clone().addScaledVector(d, 1.25);
    const W = WEAPONS.rifle;
    for (const k of [0.18, 0.46, 0.8]) {
      const to = muzzle.clone().lerp(chest, k).add(new THREE.Vector3().randomDirection().multiplyScalar(0.12 * k));
      frozenBolt(S, anchor, muzzle.clone().lerp(chest, Math.max(0, k - 0.12)), to, W.color, { width: 0.07, len: 3.2, intensity: 34 });
    }
    // resposta do inimigo (vermelho) passando ao lado
    const eMuzzle = tgt.clone().addScaledVector(d, 1.45).addScaledVector(look, -0.7);
    const miss = eyeL.clone().addScaledVector(side, 1.4).addScaledVector(d, 0.3);
    frozenBolt(S, anchor, eMuzzle.clone().lerp(miss, 0.35), eMuzzle.clone().lerp(miss, 0.55), [1.0, 0.22, 0.12], { len: 2.6, intensity: 30 });
    S.shotHold = (c) => {
      S.vm.flash.k = 0.95;
      S.vm.recoil.z.x = 0.012; S.vm.recoil.rx.x = 0.02;
      S.lastFireT = 0;
      // faíscas no peito do alvo (mantém algumas vivas)
      if ((S._sparkT = (S._sparkT || 0) - 1) <= 0) { S._sparkT = 3; S.proj.impact(anchor, chest.clone().addScaledVector(look, -0.25), look.clone().negate(), W.color, 'flesh', false); }
      void c;
    };
    try { pl.weather.force('rain', 0); } catch { /* */ }
    settle();
  });

  // ── Nivália: nevasca, geada no visor, flocos grudados, lanterna ──
  ctx.shots.register('foot-ice-visor-snow', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Nivália');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 10), (d, h) => {
      const sl = slopeAt(pl, b, d, 6);
      if (sl > 0.15) return -Infinity;
      // serra ao longe (1–3 km) para o fundo
      const t = sunTangent(ctx, b, d).applyAxisAngle(d, 60 * D2R);
      let ang = -1;
      for (const k of [900, 1600, 2600]) { const p = d.clone().addScaledVector(t, k / b.radius).normalize(); ang = Math.max(ang, (pl.heightAtLocal(b, p) - h) / k); }
      return -Math.abs(ang - 0.12) * 400 - sl * 200;
    }, 400);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, P(ctx, 'yaw', 60) * D2R);
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.0));
    equipNow(S, 'multitool');
    S.toolMode = 'scanner';
    S.light.toggle(true); S.suit.flashlight = true; S.light.k = 1;
    try { pl.weather.force('blizzard', P(ctx, 'storm', 0.6)); } catch { /* */ }
    S.weather = { kind: 'blizzard', intensity: 0.6 };
    S.visor.force({ snow: 0.85, frost: 0.7, fog: 0.55, wet: 0.2 });
    S.director.ensureDeposits(b, S.ctrl.local);
    S.shotHold = () => { S.visor.force({ snow: 0.85, frost: 0.72, fog: 0.5 }); };
    settle();
  });

  // ── scanner: onda de varredura em Ossário, Tharsos no céu, sentinelas ──
  ctx.shots.register('foot-scanner', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Ossário') || body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const th = body(ctx, 'Tharsos');
    // lado de Ossário voltado para Tharsos, ao entardecer
    const d = search(ctx, b, P(ctx, 'elev', 4), (d, h) => {
      const sl = slopeAt(pl, b, d, 6);
      if (sl > 0.16) return -Infinity;
      let s = -sl * 200;
      if (th) { const tl = b.dirToLocal(th.pos.clone().sub(b.pos).normalize(), ctx.time.world, new THREE.Vector3()); s += tl.dot(d) * 60; }
      return s;
    }, 500);
    let look;
    if (th) {
      const tl = b.dirToLocal(th.pos.clone().sub(b.pos).normalize(), ctx.time.world, new THREE.Vector3());
      look = tl.addScaledVector(d, -tl.dot(d)).normalize().applyAxisAngle(d, P(ctx, 'yaw', 12) * D2R);
    } else look = sunTangent(ctx, b, d).applyAxisAngle(d, 90 * D2R);
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.1));
    equipNow(S, 'multitool');
    S.toolMode = 'scanner';
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    const anchor = { kind: 'body', body: b };
    const sents = [];
    for (const [al, sl] of [[38, -9], [55, 14], [80, 2]]) {
      const p = pl.placeOnSurface(b, local(b, d, al, sl, look, side), 0);
      const e = S.director.addEnemy({ kind: 'sentinel', faction: 'vigilantes', anchor, pos: p, fwd: look.clone().negate(), seed: al });
      sents.push(e);
    }
    S.director.ensureDeposits(b, S.ctrl.local);
    S.scanner.install();
    api.scan();
    S.scanner.t = P(ctx, 'scan', 0.85);
    // todos os destaques já visíveis
    for (const f of S.scanFound) f.at = 0;
    S.shotHold = () => { if (S.scanner.t > 1.05) S.scanner.t = 1.05; };
    settle();
  });

  // ── tiroteio: acampamento da Hegemonia em Ashar, barreiras com escudo ──
  ctx.shots.register('foot-firefight', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Ashar');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 14), (d, h) => {
      const sl = slopeAt(pl, b, d, 10);
      if (sl > 0.08) return -Infinity;
      const t = sunTangent(ctx, b, d);
      const far = d.clone().addScaledVector(t.applyAxisAngle(d, 100 * D2R), 30 / b.radius).normalize();
      return -sl * 300 - Math.abs(slopeAt(pl, b, far, 10)) * 200;
    }, 400);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, P(ctx, 'yaw', 100) * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.015));
    equipNow(S, P(ctx, 'w', 0) ? 'shotgun' : 'rifle');
    const anchor = { kind: 'body', body: b };
    // acampamento a ~26 m, virado para o jogador
    const campD = local(b, d, 26, 2, look, side);
    const C = S.director.spawnCamp({ id: 'shot:camp', body: b, dir: campD, facing: look.clone().negate(), faction: 'hegemonia', squad: [{ kind: 'soldier' }, { kind: 'soldier' }, { kind: 'officer' }, { kind: 'heavy' }] });
    // posiciona a tripulação nas coberturas, espiando e atirando
    const covers = C.covers.slice().sort((a, b2) => a.pos.distanceTo(S.ctrl.local) - b2.pos.distanceTo(S.ctrl.local));
    C.enemies.forEach((e, i) => {
      const cv = covers[i * 2 % covers.length];
      if (cv) { e.pos.copy(cv.pos); e.cover = cv; cv.taken = e; e.inCover = true; }
      e.snap();
      e.state = 'combat'; e.aware = 1; e.ready = 1; e.peek = i % 2 === 0; e.crouch = e.peek ? 0.1 : 0.9; e.peekT = 99; e.fireT = 99;
      e.fwd.copy(S.ctrl.local).sub(e.pos); e.fwd.addScaledVector(e.up, -e.fwd.dot(e.up)).normalize();
      e.lastSeen = S.ctrl.local.clone();
    });
    // disparos inimigos congelados (dourados) cruzando a cena + os do jogador (azuis)
    const eyeL = S.ctrl.local.clone().addScaledVector(d, 1.62);
    C.enemies.slice(0, 3).forEach((e, i) => {
      const from = e.pos.clone().addScaledVector(e.up, 1.45).addScaledVector(e.fwd, 0.7);
      const to = eyeL.clone().addScaledVector(side, (i - 1) * 2.2 + 0.8).addScaledVector(d, -0.4 + i * 0.3);
      frozenBolt(S, anchor, from.clone().lerp(to, 0.2 + i * 0.18), from.clone().lerp(to, 0.32 + i * 0.18), [1.0, 0.72, 0.28], { len: 2.8, intensity: 32 });
    });
    const tgt = C.enemies[0].pos.clone().addScaledVector(d, 1.3);
    const muzzle = eyeL.clone().addScaledVector(look, 0.6).addScaledVector(side, 0.12).addScaledVector(d, -0.12);
    for (const k of [0.3, 0.62]) frozenBolt(S, anchor, muzzle.clone().lerp(tgt, k - 0.1), muzzle.clone().lerp(tgt, k), WEAPONS.rifle.color, { len: 3.2, intensity: 34 });
    // granada explodindo perto de uma barreira
    const gpos = A.toWorld(anchor, covers[covers.length - 1].pos.clone().addScaledVector(d, 0.6), new THREE.Vector3(), ctx.time.world);
    let boomT = 0;
    S.shotHold = () => {
      S.vm.flash.k = 0.7; S.lastFireT = 0;
      if (boomT++ === 2) { try { ctx.services.rendering?.explosion?.(gpos, 4.2, 'ground', { vel: A.velAt(anchor, covers[covers.length - 1].pos, new THREE.Vector3(), ctx.time.world), normal: b.dirToWorld(d, ctx.time.world, new THREE.Vector3()) }); } catch { /* */ } }
    };
    S.ctrl.aiming = false;
    try { pl.weather.force('sandstorm', 0.0); } catch { /* */ }
    tick(0);
    settle();
  });

  // ── bancada (desenvolvimento): arma e braços no espaço, sol lateral ──
  // ?shot=foot-dev-vm&w=rifle&aim=0&rk=0.4&insp=0.5
  ctx.shots.register('foot-dev-vm', async (ctx) => {
    prep(ctx, 'kessa');
    const sys = ctx.universe.system;
    const v = sys.bodies.find((b) => b.name === 'Verídia');
    const p = v.pos.clone().add(new THREE.Vector3(v.radius * 3, v.radius * 0.5, v.radius * 2));
    const sunDir = sys.star.pos.clone().sub(p).normalize();
    const fwd = sunDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), P(ctx, 'yaw', 110) * D2R);
    api.spawnAt(p, null, fwd);
    S.ctrl.place(p, fwd, { kind: 'world' });
    S.ctrl.upL.set(0, 1, 0);
    const id = ctx.params.get('w') || 'rifle';
    equipNow(S, id);
    const rk = P(ctx, 'rk', -1), insp = P(ctx, 'insp', -1);
    S.shotHold = () => {
      S.ctrl.aiming = !!P(ctx, 'aim', 0);
      if (rk >= 0) { S.vm.reload = S.vm.reload || { t: 0, dur: 2, shells: 3, kind: id }; S.vm.reload.t = rk * S.vm.reload.dur - 1 / 30; }
      if (insp >= 0) { S.vm.inspect = S.vm.inspect || { t: 0, dur: 3.2 }; S.vm.inspect.t = insp * 3.2 - 1 / 30; }
      if (P(ctx, 'fire', 0)) S.vm.flash.k = 1;
    };
  });
}
