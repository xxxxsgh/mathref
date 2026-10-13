// Presets de screenshot do sistema `foot`. Cada um escolhe um lugar real do
// planeta (hora do dia pela elevação do sol, mata/clareira, relevo), põe o
// jogador a pé com a arma certa, monta a cena (inimigos, disparos em voo,
// clima, visor) e mantém o instante (tiros "congelados" no ar) até a captura.
import * as THREE from 'three/webgpu';
import { A, blast } from './projectiles.js';
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

/** O sol chega ao ponto? (nenhum relevo acima da elevação do sol nos próximos km) */
function sunlit(ctx, b, d, h) {
  const pl = ctx.services.planets;
  const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  const sunL = b.dirToLocal(sunW, ctx.time.world, new THREE.Vector3());
  const el = Math.asin(Math.max(-1, Math.min(1, sunL.dot(d))));
  const t = sunL.clone().addScaledVector(d, -sunL.dot(d)).normalize();
  let worst = 0;
  for (const k of [200, 500, 1000, 1800, 3000, 5000]) {
    const p = d.clone().addScaledVector(t, k / b.radius).normalize();
    const a = (pl.heightAtLocal(b, p) - h - k * k / (2 * b.radius)) / k;
    worst = Math.max(worst, a - Math.tan(el - 0.02));
  }
  return worst <= 0;
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
      if (!sunlit(ctx, b, d, h)) return -Infinity;
      const P0 = d.clone().multiplyScalar(b.radius);
      const f = S.flora.forestAt(b, P0);
      return f * 100 - sl * 200 - Math.abs(h - 60) * 0.05;
    }, 900);
    const sunT = sunTangent(ctx, b, d);
    const look = sunT.clone().applyAxisAngle(d, P(ctx, 'yaw', 35) * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    // a nave do Rafael pousada numa clareira à direita
    const f = ctx.services.flight;
    const shipD = local(b, d, P(ctx, 'sa', 20), P(ctx, 'ss', 13), look, side);
    let shipL = null;
    if (f?.spawnPlayerShip && P(ctx, 'ship', 1)) {
      try {
        const sp = pl.findLandingSpot?.(b, shipD, { maxSlope: 0.1, radius: 30, samples: 40 });
        shipL = sp ? sp.local.clone() : pl.placeOnSurface(b, shipD, 0);
        const up = shipL.clone().normalize();
        const sfwd = look.clone().multiplyScalar(-0.5).addScaledVector(side, -0.85); sfwd.addScaledVector(up, -sfwd.dot(up)).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), sfwd, up));
        f.spawnPlayerShip(shipL, q, 'fighter', { body: b, landed: true, gear: true, enter: false, faction: 'hegemonia' });
      } catch (e) { ctx.errors.push('foot shot nave: ' + (e.stack || e)); }
    }
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.06));
    equipNow(S, 'rifle');
    if (shipL) S.flora.clearings = [{ body: b, local: shipL, radius: 13, all: true }];
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
    const yawW = P(ctx, 'yaw', 150);
    const d = search(ctx, b, P(ctx, 'elev', 20), (d, h) => {
      if (h < 8 || h > 500) return -Infinity;
      const sl = slopeAt(pl, b, d, 6);
      if (sl > 0.1) return -Infinity;
      const t = sunTangent(ctx, b, d).applyAxisAngle(d, yawW * D2R);
      const far = d.clone().addScaledVector(t, 13 / b.radius).normalize();
      if (!sunlit(ctx, b, d, h)) return -Infinity;
      const f = S.flora.forestAt(b, d.clone().multiplyScalar(b.radius));
      return (1 - Math.abs(f - 0.55)) * 40 - sl * 300 - slopeAt(pl, b, far, 6) * 200 - Math.abs(pl.heightAtLocal(b, far) - h) * 3;
    }, 700);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, yawW * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.0));
    equipNow(S, 'rifle');
    const anchor = { kind: 'body', body: b };
    S.ctrl.anchor = anchor;
    const tgtD = local(b, d, P(ctx, 'dist', 13), -0.8, look, side);
    const tgt = pl.placeOnSurface(b, tgtD, 0);
    // clareira entre o jogador e o alvo (o capim não esconde a cena)
    S.flora.clearings = [{ body: b, local: tgt.clone(), radius: 4.5 }, ...[2.5, 5.5, 9].map((k) => ({ body: b, local: pl.placeOnSurface(b, local(b, d, k, -0.4, look, side), 0), radius: 1.6 + k * 0.25 }))];
    S.flora.update(b, S.ctrl.local);
    const e = S.director.addEnemy({ kind: 'soldier', faction: 'corsarios', anchor, pos: tgt, fwd: look.clone().negate().applyAxisAngle(d, 0.35), state: 'combat', seed: 7 });
    e.aware = 1; e.ready = 1; e.fireT = 99; e.crouch = 0; e.hold = true;
    e.hitX.x = -0.22; e.hitZ.x = 0.16; e.aimPitch = 0.04;
    // rastros congelados do jogador rumo ao alvo
    const eyeL = S.ctrl.local.clone().addScaledVector(d, 1.62);
    const muzzle = eyeL.clone().addScaledVector(look, 0.32).addScaledVector(side, 0.05).addScaledVector(d, -0.06);
    const chest = tgt.clone().addScaledVector(d, 1.3);
    const W = WEAPONS.rifle;
    for (const k of [0.24, 0.55, 0.86]) {
      const to = muzzle.clone().lerp(chest, k).add(new THREE.Vector3().randomDirection().multiplyScalar(0.06 * k));
      frozenBolt(S, anchor, muzzle.clone().lerp(chest, Math.max(0.02, k - 0.18)), to, W.color, { width: 0.05 + k * 0.03, len: 3.0, intensity: 8 + k * 6 });
    }
    // resposta do inimigo (vermelho) passando à esquerda
    const eMuzzle = tgt.clone().addScaledVector(d, 1.45).addScaledVector(look, -0.65);
    const miss = eyeL.clone().addScaledVector(side, -1.6).addScaledVector(d, 0.4);
    frozenBolt(S, anchor, eMuzzle.clone().lerp(miss, 0.4), eMuzzle.clone().lerp(miss, 0.56), [1.0, 0.22, 0.12], { width: 0.09, len: 2.6, intensity: 7 });
    S.shotHold = () => {
      S.vm.flash.k = 1;
      S.vm.recoil.z.x = 0.014; S.vm.recoil.rx.x = 0.025;
      S.lastFireT = 0;
      if ((S._sparkT = (S._sparkT || 0) - 1) <= 0) { S._sparkT = 2; S.proj.impact(anchor, chest.clone().addScaledVector(look, -0.28), look.clone().negate(), W.color, 'metal', true); }
    };
    try { pl.weather.force('rain', 0); } catch { /* */ }
    settle();
  });

  // ── Verídia sob tempestade: gotas escorrendo no visor, pistola e lanterna ──
  ctx.shots.register('foot-veridia-rain', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 4), (d, h) => {
      if (h < 6 || h > 500) return -Infinity;
      const sl = slopeAt(pl, b, d, 4);
      if (sl > 0.12) return -Infinity;
      const f = S.flora.forestAt(b, d.clone().multiplyScalar(b.radius));
      return f * 80 - sl * 200;
    }, 600);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, P(ctx, 'yaw', 120) * D2R);
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.02));
    equipNow(S, 'pistol');
    S.light.toggle(true); S.suit.flashlight = true; S.light.k = 1;
    S.flora.update(b, S.ctrl.local);
    try { pl.weather.force('rain', P(ctx, 'storm', 0.85)); } catch { /* */ }
    S.weather = { kind: 'rain', intensity: 0.85 };
    S.visor.force({ rain: 0.9, wet: 0.8 });
    S.shotHold = () => { S.visor.force({ rain: 0.9, wet: 0.8 }); };
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
    S.visor.force({ snow: 0.85, frost: 0.7, fog: 0.55, wet: 0.06 });
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
    // terreno aberto: plano onde fica o acampamento e sem paredões no quadro
    const yawF = P(ctx, 'yaw', 155);
    const d = search(ctx, b, P(ctx, 'elev', 16), (d, h) => {
      const sl = slopeAt(pl, b, d, 10);
      if (sl > 0.08) return -Infinity;
      const t = sunTangent(ctx, b, d).applyAxisAngle(d, yawF * D2R);
      let s = -sl * 300, ang = -1;
      for (const k of [15, 25, 35]) s -= slopeAt(pl, b, d.clone().addScaledVector(t, k / b.radius).normalize(), 8) * 150;
      for (const a of [-40, -20, 0, 20, 40]) {
        const tt = t.clone().applyAxisAngle(d, a * D2R);
        for (const k of [60, 150, 300, 600]) { const p = d.clone().addScaledVector(tt, k / b.radius).normalize(); ang = Math.max(ang, (pl.heightAtLocal(b, p) - h) / k); }
      }
      return s - Math.max(0, ang - 0.06) * 800;
    }, 500);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, yawF * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', 0.015));
    equipNow(S, P(ctx, 'w', 0) ? 'shotgun' : 'rifle');
    const anchor = { kind: 'body', body: b };
    // acampamento a ~26 m, virado para o jogador
    const campD = local(b, d, P(ctx, 'dist', 17), 1.5, look, side);
    const C = S.director.spawnCamp({ id: 'shot:camp', body: b, dir: campD, facing: look.clone().negate(), faction: 'hegemonia', squad: [{ kind: 'soldier' }, { kind: 'soldier' }, { kind: 'officer' }, { kind: 'heavy' }] });
    // posiciona a tripulação nas coberturas, espiando e atirando
    const covers = C.covers.slice().sort((a, b2) => a.pos.distanceTo(S.ctrl.local) - b2.pos.distanceTo(S.ctrl.local));
    const roles = ['peek', 'run', 'peek', 'open'];
    C.enemies.forEach((e, i) => {
      const role = roles[i % roles.length];
      const cv = covers[(i * 2 + 1) % covers.length];
      if (cv) { e.pos.copy(cv.pos); e.cover = cv; cv.taken = e; e.inCover = true; }
      e.state = 'combat'; e.aware = 1; e.ready = 1; e.peekT = 99; e.fireT = 99;
      e.lastSeen = S.ctrl.local.clone();
      if (role === 'peek') { e.peek = true; e.crouch = 0.0; e.pos.addScaledVector(side, i ? 0.9 : -0.9); }
      if (role === 'run') {
        e.cover = null; e.inCover = false;
        e.pos.addScaledVector(side, 2.6).addScaledVector(look, -1.2);
        e.holdSpeed = 4.4; e.phase = 1.2; e.ready = 0.4;
      }
      if (role === 'open') { e.cover = null; e.inCover = false; e.pos.addScaledVector(look, -1.8).addScaledVector(side, -3); e.crouch = 0; }
      e.snap(); e.hold = true;
      e.fwd.copy(S.ctrl.local).sub(e.pos); e.fwd.addScaledVector(e.up, -e.fwd.dot(e.up)).normalize();
      if (role === 'run') e.fwd.copy(side);
    });
    // disparos inimigos congelados (dourados) cruzando a cena + os do jogador (azuis)
    const eyeL = S.ctrl.local.clone().addScaledVector(d, 1.62);
    C.enemies.slice(0, 3).forEach((e, i) => {
      const from = e.pos.clone().addScaledVector(e.up, 1.45).addScaledVector(e.fwd, 0.7);
      const to = eyeL.clone().addScaledVector(side, (i - 1) * 2.2 + 0.8).addScaledVector(d, -0.4 + i * 0.3);
      frozenBolt(S, anchor, from.clone().lerp(to, 0.2 + i * 0.18), from.clone().lerp(to, 0.32 + i * 0.18), [1.0, 0.62, 0.2], { len: 2.8, intensity: 11 });
    });
    const tgt = C.enemies[0].pos.clone().addScaledVector(d, 1.3);
    const muzzle = eyeL.clone().addScaledVector(look, 0.6).addScaledVector(side, 0.12).addScaledVector(d, -0.12);
    for (const k of [0.3, 0.62]) frozenBolt(S, anchor, muzzle.clone().lerp(tgt, k - 0.1), muzzle.clone().lerp(tgt, k), WEAPONS.rifle.color, { len: 3.2, intensity: 12 });
    // marcas de tiros nas barreiras e faíscas no ponto atingido
    const hits = [];
    covers.slice(0, 6).forEach((cv, i) => {
      const p = cv.pos.clone().addScaledVector(cv.normalL, 1.18).addScaledVector(d, 0.35 + (i % 3) * 0.28).addScaledVector(side, (i % 2 ? 0.5 : -0.4));
      S.decals.add(anchor, p, cv.normalL, WEAPONS.rifle.color, 0.28 + (i % 2) * 0.12);
      hits.push({ p, n: cv.normalL.clone() });
    });
    let hitT = 0;
    // granada explodindo perto de uma barreira
    const gpos = covers[covers.length - 1].pos.clone().addScaledVector(d, 0.3);
    let boomT = 0;
    S.shotHold = () => {
      S.vm.flash.k = 0.7; S.lastFireT = 0;
      if (boomT++ === 5) blast(ctx, anchor, gpos, 4.2, 'plasma');
      if (hits.length && hitT++ % 3 === 0) { const h = hits[(hitT / 3 | 0) % hits.length]; S.proj.impact(anchor, h.p, h.n, WEAPONS.rifle.color, 'metal', false); }
    };
    S.ctrl.aiming = false;
    try { pl.weather.force('clear', 0.0); } catch { /* */ }
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

  // ── bancada: inimigos no espaço (sol lateral) ─ ?shot=foot-dev-enemy
  ctx.shots.register('foot-dev-enemy', async (ctx) => {
    prep(ctx, 'kessa');
    const sys = ctx.universe.system;
    const v = sys.bodies.find((b) => b.name === 'Verídia');
    const p = v.pos.clone().add(new THREE.Vector3(v.radius * 3, v.radius * 0.5, v.radius * 2));
    const sunDir = sys.star.pos.clone().sub(p).normalize();
    const fwd = sunDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), P(ctx, 'yaw', 150) * D2R); fwd.y = 0; fwd.normalize();
    api.spawnAt(p, null, fwd);
    S.ctrl.place(p, fwd, { kind: 'world' });
    S.ctrl.pitch = -0.08;
    equipNow(S, 'pistol');
    S.vm.visible = !!P(ctx, 'vm', 0);
    const an = { kind: 'world' };
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const list = [['hegemonia', 'soldier', -1.6], ['hegemonia', 'heavy', 0], ['corsarios', 'soldier', 1.6], ['vigilantes', 'sentinel', 3.6]];
    for (const [f, k, x] of list) {
      const pos = p.clone().addScaledVector(fwd, P(ctx, 'dist', 5)).addScaledVector(right, x).add(new THREE.Vector3(0, -1.6, 0));
      const e = S.director.addEnemy({ kind: k, faction: f, anchor: an, pos, fwd: fwd.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4), state: 'combat', seed: 3 });
      e.ready = 1; e.aware = 1; e.fireT = 99; e.lastSeen = S.ctrl.local.clone(); e.up.set(0, 1, 0);
      e.crouch = P(ctx, 'crouch', 0); e.hold = true;
    }
  });

  // ── teste de fumaça: percorre ações a pé (tiro, recarga, troca, granada,
  //    scanner, mineração, hack, pulo/jetpack) num acampamento hostil ──
  ctx.shots.register('foot-dev-smoke', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const d = search(ctx, b, 30, (d, h) => (h < 5 ? -Infinity : -slopeAt(pl, b, d, 6) * 100), 200);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, 90 * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    placePlayer(ctx, api, S, b, d, look, 0);
    equipNow(S, 'rifle');
    S.director.spawnCamp({ id: 'smoke:camp', body: b, dir: local(b, d, 30, 0, look, side), facing: look.clone().negate(), faction: 'corsarios' });
    S.director.spawnSentinels(b, local(b, d, 40, 10, look, side), 1, 'smoke:sent');
    const I = ctx.input;
    let f = 0;
    const plan = {
      1: ['primary', 1], 4: ['primary', 0], 5: ['reload', 1], 6: ['reload', 0], 8: ['power2', 1], 9: ['power2', 0],
      14: ['primary', 1], 15: ['primary', 0], 16: ['grenade', 1], 17: ['grenade', 0], 19: ['scan', 1], 20: ['scan', 0],
      21: ['tool', 1], 22: ['tool', 0], 23: ['primary', 1], 26: ['primary', 0], 27: ['tool', 1], 28: ['tool', 0], 29: ['up', 1], 34: ['up', 0],
      35: ['power3', 1], 36: ['power3', 0], 37: ['secondary', 1], 39: ['primary', 1], 40: ['primary', 0], 41: ['secondary', 0], 42: ['light', 1], 43: ['light', 0],
    };
    S.shotHold = () => {
      f++;
      const a = plan[f];
      if (a) I.setVirtual(a[0], a[1]);
      I.setVirtualAxis('moveY', f > 10 && f < 30 ? 1 : 0);
      if (f === 46) {
        // entra no interior da Meridiana a pé
        try {
          const st = ctx.services.stations; const it = st?.interiorOf?.('kessa:st0');
          if (it) { it.activate(); api.spawnAt(it.spawnWorld(new THREE.Vector3()), it.colFrame, null); S.ctrl.anchor.id = 'estacao'; }
        } catch (e) { ctx.errors.push('smoke estação: ' + (e.stack || e)); }
      }
      if (f > 47 && f < 58) I.setVirtualAxis('moveY', 1);
      if (f === 52) { I.setVirtual('up', 1); } if (f === 53) I.setVirtual('up', 0);
      if (f === 30) { S.toolMode = 'hack'; S.interact.register({ id: 'smoke:door', label: 'Porta', getPos: (o) => o.copy(S.eyeWorld).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion), 1), hack: { difficulty: 0.2 } }); }
    };
  });

  // ── abordagem (desenvolvimento): cargueiro da Hegemonia à deriva ──
  ctx.shots.register('foot-dev-board', async (ctx) => {
    prep(ctx, 'kessa');
    const ships = ctx.services.ships;
    if (!ships?.create) { ctx.errors.push('foot-dev-board: sem ships'); return; }
    const sys = ctx.universe.system;
    const v = sys.bodies.find((b) => b.name === 'Verídia');
    const pos = v.pos.clone().add(new THREE.Vector3(v.radius * 2.2, v.radius * 0.4, v.radius * 1.6));
    const cls = ctx.params.get('cls') || 'freighter';
    const inst = ships.create(cls, 'hegemonia', { id: 'abordagem-teste', seed: 5 });
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    inst.group.quaternion.copy(quat);
    const src = { pos: pos.clone(), quat: quat.clone() };
    ctx.world.add(inst.group, src.pos);
    api.board({ ship: 'abordagem-teste', classId: cls, faction: 'hegemonia', pos: src.pos, quat: src.quat, instance: inst, combatant: src });
    equipNow(S, 'shotgun');
    const I = ctx.input;
    let f = 0;
    S.shotHold = () => {
      f++;
      inst.group.quaternion.copy(src.quat);
      I.setVirtualAxis('moveY', f > 3 && f < 14 ? 1 : 0);
      if (f === 8) I.setVirtual('primary', 1); if (f === 9) I.setVirtual('primary', 0);
    };
  });

  // ── multiferramenta (desenvolvimento): laser de mineração num cristal / hack ──
  // ?shot=foot-dev-tools&hack=1
  ctx.shots.register('foot-dev-tools', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, ctx.params.get('body') || 'Nivália');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 6), (d, h) => (h < 3 ? -Infinity : -slopeAt(pl, b, d, 6) * 100 + (sunlit(ctx, b, d, h) ? 50 : 0)), 300);
    const look = sunTangent(ctx, b, d).applyAxisAngle(d, P(ctx, 'yaw', 140) * D2R);
    const side = new THREE.Vector3().crossVectors(look, d).normalize();
    placePlayer(ctx, api, S, b, d, look, P(ctx, 'pitch', -0.22));
    equipNow(S, 'multitool');
    const depL = pl.placeOnSurface(b, local(b, d, 3.6, 0.3, look, side), -0.2);
    S.director.addDeposit(b, depL, b.type === 'ice' ? 'cristal' : 'carbono');
    try { pl.weather.force('blizzard', P(ctx, 'storm', 0.15)); } catch { /* */ }
    const I = ctx.input;
    if (P(ctx, 'hack', 0)) {
      S.toolMode = 'hack';
      S.hack.start({ difficulty: 0.4, label: 'PORTA DO BUNKER' });
      S.hack.active.phase = S.hack.active.tPhase + 0.4; S.hack.active.lock = 0.5;
    } else {
      S.toolMode = 'mining';
      I.setVirtual('primary', 1);
    }
    S.shotHold = () => { S.mining.heat = Math.min(S.mining.heat, 0.6); };
    settle();
  });
}
