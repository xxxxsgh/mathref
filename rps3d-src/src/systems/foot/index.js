// Sistema `foot` — FPS a pé do RPS3D.
//
//  • controlador de personagem sobre planetas que GIRAM (gravidade radial,
//    referencial local do corpo), em interiores de naves/estações (gravidade
//    artificial no referencial deles) e em EVA; correr, pular, agachar,
//    jetpack com combustível e chamas, escalada leve, degraus, inclinação
//  • câmera do modo 'foot' com balanço de cabeça, afundar ao pousar, recuo
//  • braços e armas em 1ª pessoa (PBR procedural, animação procedural:
//    andar, mirar, recarga, recuo, inspecionar, granada); rifle de pulso,
//    escopeta de plasma, sniper de trilho (zoom), pistola de íons, granadas
//  • multiferramenta: scanner (onda de varredura + destaques), laser de
//    mineração, lanterna volumétrica, hack (minijogo)
//  • traje com capacete: visor com gotas/neve/cinza/geada/rachaduras;
//    sobrevivência (O₂, temperatura, toxinas, radiação, energia) por bioma
//  • inimigos em terra (Hegemonia em acampamentos com coberturas, Corsários,
//    sentinelas Vigilantes nas ruínas) com IA e reações; abordagem de naves
//  • vegetação de reserva (sem o sistema `life`)
//
// Serviços:
//   ctx.services.foot = { spawnAt(worldPos, frame?, fwd?), weapons, suit, hud(),
//     state, equip(id), board(payload), spawnCamp(o), spawnSentinels(...),
//     director, controller, scan(), setFlashlight(b), visor, toLocal(world) }
//   ctx.services.interact = { register({getPos, radius, label, onUse, ...}) → remove }
// Emite: foot:fire, foot:step, foot:mantle, foot:kill, scan:discover,
//   player:damage, player:death, notify, radio. Escuta: mode:change, board,
//   weather, system:change, player:damage (de outros sistemas), game:new.
import * as THREE from 'three/webgpu';
import { Controller, K as CK } from './controller.js';
import { Interact } from './interact.js';
import { ViewModel } from './viewmodel/viewmodel.js';
import { Beams, COLORS } from './beams.js';
import { Projectiles, A, blast } from './projectiles.js';
import { Arsenal, WEAPONS, SLOTS } from './arsenal.js';
import { Suit } from './suit.js';
import { Visor } from './visor.js';
import { Scanner, Flashlight, MiningLaser, HackGame } from './tool.js';
import { Director } from './enemies/director.js';
import { Flora } from './flora.js';
import { Boarding } from './board.js';
import { registerShots } from './shots.js';
import { clamp, damp, spring, rng, hashStr } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Zv = new THREE.Vector3(0, 0, 1);
const TOOL_MODES = ['scanner', 'mining', 'hack'];

const S = {
  ctx: null, ctrl: null, interact: null, vm: null, beams: null, proj: null, arsenal: null, suit: null, visor: null,
  scanner: null, light: null, mining: null, hack: null, director: null, flora: null, boarding: null,
  active: false, pendingAnchor: null, eyeWorld: new THREE.Vector3(), camKick: { x: 0, v: 0 }, camRoll: { x: 0, v: 0 },
  bob: 0, land: { x: 0, v: 0 }, fov: 74, toolMode: 'scanner', weather: { kind: 'clear', intensity: 0 },
  sitesT: 0, deathT: 0, jetFxT: 0, stepFxT: 0, shotHold: null, hudData: {}, lastWeapon: 'rifle', aimHeld: false,
  insideT: 0, inside: false, scanFound: [], deviceTouch: false, lastFireT: 9,
};

// ═══════════════════════════════════════════════════════════════════════════
function enterFoot(ctx, data = {}) {
  S.active = true;
  const c = S.ctrl;
  let pos = data.pos ? data.pos.clone() : null;
  if (!pos) pos = ctx.player.camWorld.clone().addScaledVector(upGuess(ctx, ctx.player.camWorld), -CK.eye);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
  if (data.interior && data.frame) {
    c.anchor = { kind: 'frame', frame: data.frame, up: new THREE.Vector3(0, 1, 0), id: 'nave' };
    c.place(pos, fwd);
    S.pendingAnchor = null;
  } else {
    S.pendingAnchor = { pos, fwd, t: 0 };
    c.anchor = { kind: 'world' };
    c.place(pos, fwd);
    resolveAnchor(ctx);
  }
  c.pitch = clamp(Math.asin(clamp(fwd.dot(c.worldUp), -1, 1)), -1.2, 1.2);
  S.vm.visible = true;
  if (!S.vm.root.parent) ctx.camera.add(S.vm.root);
  if (!S.vm.current) S.vm.setWeapon(S.arsenal.current);
  S.vm.equip = 0; S.vm.equipTarget = 1;
  S.visor.install();
  S.scanner.install();
  S.light.attach(true);
  S.suit.dead = false;
  ctx.camera.fov = S.fov; ctx.camera.updateProjectionMatrix();
}

function leaveFoot(ctx) {
  S.active = false;
  S.vm.visible = false;
  S.vm.root.removeFromParent();
  S.mining.stopBeam();
  S.hack.stop();
  S.light.toggle(false); S.light.frame(1); S.light.attach(false);
  S.visor.U.on.value = 0;
  ctx.player.frameVel?.set(0, 0, 0);
  try { ctx.services.hud?.prompt?.(null, { id: 'foot' }); } catch { /* */ }
}

function upGuess(ctx, world) {
  const b = ctx.universe.system?.dominantBody?.(world);
  if (b && world.distanceTo(b.pos) - b.radius < 20000) return _u.copy(world).sub(b.pos).normalize();
  return _u.set(0, 1, 0);
}

/** Escolhe o referencial (interior de estação ativo → planeta → espaço). */
function resolveAnchor(ctx) {
  const c = S.ctrl, pa = S.pendingAnchor;
  const pos = pa ? pa.pos : c.worldPos;
  const fwd = pa ? pa.fwd : c.dirToWorld(c.fwd, new THREE.Vector3());
  const st = ctx.services.stations;
  try {
    const near = st?.nearest?.(pos);
    const it = near ? st.interiorOf?.(near.station?.id || near.station) : null;
    if (it?.active && it.colFrame) {
      c.place(pos, fwd, { kind: 'frame', frame: it.colFrame, up: new THREE.Vector3(0, 1, 0), id: 'estacao' });
      return 'station';
    }
  } catch { /* */ }
  const b = ctx.universe.system?.dominantBody?.(pos);
  if (b && b.altitudeOf(pos) < Math.max(8000, b.radius * 0.2) && b.kind !== 'gas_giant') {
    c.place(pos, fwd, { kind: 'body', body: b });
    return 'body';
  }
  if (c.anchor.kind !== 'world') c.place(pos, fwd, { kind: 'world' });
  return 'world';
}

// ─── entrada → comandos ─────────────────────────────────────────────────────
function readInput(ctx) {
  const I = ctx.input;
  const hacking = !!S.hack.active;
  return {
    moveX: hacking ? 0 : I.axis('moveX'), moveY: hacking ? 0 : I.axis('moveY'),
    jump: !hacking && I.down('up'), jumpPressed: !hacking && I.pressed('up'),
    crouch: !hacking && I.down('down'), sprint: !hacking && I.down('boost'),
    brake: I.down('down'), speedMul: S.vm.reload ? 0.85 : 1,
  };
}

// ─── armas ────────────────────────────────────────────────────────────────
function weaponStep(dt, ctx) {
  const I = ctx.input, ar = S.arsenal, vm = S.vm, c = S.ctrl;
  if (S.hack.active || S.suit.dead) { ar.triggerHeld = false; return; }
  ar.step(dt);
  // troca: números, roda, ferramenta
  const keys = ['power1', 'power2', 'power3', 'power4', 'power5'];
  keys.forEach((k, i) => { if (I.pressed(k)) equip(SLOTS[i]); });
  // gamepad: Y/triângulo (alvo) troca de arma; direcional: granada / scanner / lanterna / ferramenta
  if (I.pressed('target')) { const i = SLOTS.indexOf(ar.current); equip(SLOTS[(i + 1) % SLOTS.length]); }
  const padG = I.pressed('countermeasure'), padScan = I.pressed('quantum'), padLight = I.pressed('decouple'), padTool = I.pressed('gear');
  const wheel = ctx.input.wheel;
  if (wheel && !c.aiming) {
    const w = I.takeWheel();
    if (w) { const i = SLOTS.indexOf(ar.current); equip(SLOTS[(i + (w > 0 ? 1 : SLOTS.length - 1)) % SLOTS.length]); }
  }
  if (I.pressed('tool') || padTool) {
    if (ar.current !== 'multitool') equip('multitool');
    else { S.toolMode = TOOL_MODES[(TOOL_MODES.indexOf(S.toolMode) + 1) % TOOL_MODES.length]; ctx.bus.emit('notify', { text: `MULTIFERRAMENTA: ${{ scanner: 'ANÁLISE', mining: 'LASER DE MINERAÇÃO', hack: 'INTRUSÃO' }[S.toolMode]}`, kind: 'info' }); }
  }
  if (I.pressed('light') || padLight) { S.suit.flashlight = S.light.toggle(); }
  if (I.pressed('scan') || padScan) doScan(ctx);
  if ((I.pressed('grenade') || padG) && ar.grenades > 0 && !vm.throwA && !vm.reload) {
    ar.grenades--;
    vm.throwGrenade(() => throwGrenade(ctx));
  }
  // mira
  c.aiming = I.down('secondary') && !c.sprinting && ar.current !== 'multitool';
  const w = ar.def;
  // recarga
  if (ar.reloading) {
    if (ar.stepReload(dt)) { /* fim */ }
    // escopeta: atirar interrompe a recarga
    if (w?.shellReload && I.pressed('primary') && ar.ammo[w.id] > 0) { ar.cancelReload(); vm.cancelReload(); }
  } else if (I.pressed('reload')) {
    if (ar.needsReload()) startReload(ctx); else if (ar.current !== 'multitool') vm.startInspect();
  }
  if (ar.current === 'multitool') { toolStep(dt, ctx); return; }
  S.mining.step(dt, false);
  if (!w || vm.equip < 0.85 || vm.throwA || c.sprinting) { ar.triggerHeld = false; return; }
  const trig = w.auto ? I.down('primary') : I.pressed('primary');
  if (trig) {
    if (ar.ammo[w.id] <= 0) { if (ar.needsReload()) startReload(ctx); else if (I.pressed('primary')) ctx.bus.emit('notify', { text: 'SEM MUNIÇÃO', kind: 'warn' }); return; }
    if (ar.canFire()) fire(ctx, w);
  }
}

function equip(id) {
  const ar = S.arsenal;
  if (!ar.owned.has(id) || id === ar.current) return;
  ar.cancelReload(); S.vm.cancelReload();
  S.mining.stopBeam();
  ar.current = id;
  S.vm.switchTo(id);
  S.ctx.bus.emit('foot:equip', { weapon: id });
}

function startReload(ctx) {
  const dur = S.arsenal.beginReload();
  if (dur > 0) {
    const r = S.arsenal.reloading;
    S.vm.startReload(dur, { shells: r.shells || 0 });
    ctx.bus.emit('foot:reload', { weapon: S.arsenal.current });
  }
}

/** Origem/direção do disparo (local do âncora) com dispersão. */
function aimRay(ctx, spread) {
  const c = S.ctrl, t = ctx.time.world;
  const eyeL = c.toLocal(S.eyeWorld, new THREE.Vector3(), t);
  const fW = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
  if (spread > 0) {
    const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.camera.quaternion);
    fW.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  }
  const dirL = c.dirToLocal(fW, new THREE.Vector3());
  return { eyeL, dirL, fW };
}

function fire(ctx, w) {
  const ar = S.arsenal, vm = S.vm, c = S.ctrl, t = ctx.time.world;
  ar.consume();
  S.lastFireT = 0;
  const spread = ar.spread(c, vm.aimK);
  const an = c.anchor;
  // origem visual: boca da arma (render → mundo → local)
  const muzzleW = vm.muzzleWorld(new THREE.Vector3());
  const muzzleL = muzzleW ? c.toLocal(muzzleW.add(ctx.world.origin), new THREE.Vector3(), t) : null;
  const n = w.pellets || 1;
  for (let i = 0; i < n; i++) {
    const { eyeL, dirL } = aimRay(ctx, spread);
    if (w.hitscan) {
      S.proj.hitscan({ anchor: an, pos: eyeL, dir: dirL, damage: w.damage, headMul: w.headMul, owner: 'player', color: w.color, width: 0.05, intensity: 70, range: w.range, weapon: w.id, visualFrom: muzzleL });
    } else {
      // o projétil nasce no olho (precisão) mas o rastro parte da boca: corrige a cauda
      const p = S.proj.spawn({ anchor: an, pos: eyeL.clone().addScaledVector(dirL, 0.4), dir: dirL, speed: w.speed, damage: w.damage, headMul: w.headMul, owner: 'player', color: w.color, width: w.width, len: w.len, life: (w.range || 300) / w.speed, kind: w.kind || 'bolt', weapon: w.id, intensity: w.pellets ? 22 : 30 });
      if (muzzleL) p.start.copy(muzzleL);
    }
  }
  vm.fire(w.id, 1);
  // recuo da visão (parte fica: padrão vertical)
  const kick = { rifle: 0.006, shotgun: 0.03, sniper: 0.035, pistol: 0.012 }[w.id] || 0.01;
  c.pitch = clamp(c.pitch + kick * (1 - vm.aimK * 0.4), -1.5, 1.5);
  c.look((Math.random() - 0.5) * kick * 0.5, 0);
  S.camKick.v += kick * 9;
  S.camRoll.v += (Math.random() - 0.5) * kick * 6;
  ctx.input.rumble?.(w.id === 'shotgun' || w.id === 'sniper' ? 0.8 : 0.3, 0.3, 70);
  if (muzzleW) {
    const vel = A.velAt(an, muzzleL, new THREE.Vector3(), t);
    try { ctx.services.rendering?.particles?.glow(muzzleW, w.id === 'shotgun' ? 0.9 : 0.4, [w.color[0] * 6, w.color[1] * 6, w.color[2] * 6], 0.06, vel); } catch { /* */ }
  }
  ctx.bus.emit('foot:fire', { weapon: w.id, pos: S.eyeWorld.clone(), dir: new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion) });
  // inimigos ouvem
  for (const e of S.director.enemies) if (e.alive && e.state !== 'combat' && e.pos.distanceTo(S.ctrl.local) < w.noise) { e.aware = Math.max(e.aware, 0.9); e.lastSeen = S.ctrl.local.clone(); e.state = 'alert'; }
  if (ar.ammo[w.id] === 0 && ar.reserve[w.id] > 0) setTimeout(() => { if (S.arsenal.current === w.id && !S.arsenal.reloading) startReload(ctx); }, 250);
}

function throwGrenade(ctx) {
  const c = S.ctrl, t = ctx.time.world;
  const { eyeL, dirL } = aimRay(ctx, 0);
  const up = c.upL;
  const v = dirL.clone().multiplyScalar(17).addScaledVector(up, 3.5).add(c.vel);
  const mesh = S.vm.grenade.clone(true);
  mesh.visible = true; mesh.scale.setScalar(1);
  mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  S.proj.throwGrenade({ anchor: c.anchor, pos: eyeL.addScaledVector(dirL, 0.5), vel: v, owner: 'player', damage: 110, radius: 7.5, fuse: 2.0, mesh });
  ctx.bus.emit('foot:grenade', { pos: S.eyeWorld.clone() });
  void t;
}

// ─── multiferramenta ──────────────────────────────────────────────────────
function toolStep(dt, ctx) {
  const I = ctx.input, c = S.ctrl, vm = S.vm;
  const mode = S.toolMode;
  const firing = I.down('primary') && vm.equip > 0.85 && !c.sprinting;
  const fW = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
  if (mode === 'mining') {
    const muzzleW = vm.muzzleWorld(new THREE.Vector3());
    const mw = muzzleW ? muzzleW.add(ctx.world.origin) : S.eyeWorld.clone();
    const res = S.mining.step(dt, firing, S.eyeWorld, fW, mw, S.director.deposits, c.anchor);
    if (res) collect(ctx, res);
    S.vm.setHeat(S.mining.heat);
    return;
  }
  S.mining.step(dt, false);
  if (mode === 'scanner' && I.pressed('primary')) doScan(ctx);
  if (mode === 'hack' && I.pressed('primary')) {
    const cur = S.interact.current;
    if (cur?.hack) startHack(ctx, cur);
    else ctx.bus.emit('notify', { text: 'NENHUM SISTEMA VULNERÁVEL À FRENTE', kind: 'info' });
  }
}

function collect(ctx, res) {
  const d = res.deposit;
  d.hp--;
  const name = d.kind.toUpperCase();
  const eco = ctx.services.economy;
  let ok = false;
  try { ok = eco?.addResource?.(d.kind, res.amount) ?? eco?.add?.(d.kind, res.amount) ?? false; } catch { ok = false; }
  if (!ok) S.inventory[d.kind] = (S.inventory[d.kind] || 0) + res.amount;
  ctx.bus.emit('notify', { text: `+${res.amount} ${name}`, kind: 'reward' });
  ctx.bus.emit('foot:mine', { resource: d.kind, amount: res.amount });
  if (d.hp <= 0) {
    d.dead = true;
    blast(ctx, { kind: 'body', body: d.body }, d.local.clone().addScaledVector(d.local.clone().normalize(), 0.6), 1.6, 'rock');
    d.entry?.remove();
  }
}

function startHack(ctx, def) {
  const h = def.hack || {};
  S.interact.blocked = true;
  S.hack.start({
    difficulty: h.difficulty ?? 0.4, label: h.label || def.label,
    onSuccess: () => { S.interact.blocked = false; try { h.onSuccess?.(); } catch (e) { ctx.errors.push('hack: ' + e); } ctx.bus.emit('notify', { text: 'ACESSO LIBERADO', kind: 'reward' }); },
    onFail: (why) => { S.interact.blocked = false; try { h.onFail?.(why); } catch { /* */ } if (why !== 'cancel') { ctx.bus.emit('notify', { text: 'INTRUSÃO DETECTADA', kind: 'warn' }); S.director.alarm = true; } },
  });
}

// ─── scanner ──────────────────────────────────────────────────────────────
function doScan(ctx) {
  if (!S.scanner.pulse()) return;
  S.suit.energy = Math.max(0, S.suit.energy - 0.01);
  const hud = ctx.services.hud;
  try { hud?.scanPulse?.(); } catch { /* */ }
  ctx.bus.emit('foot:scan', { pos: S.eyeWorld.clone() });
  // marca o que estiver em alcance (inimigos, depósitos, interações) conforme a onda passa
  const t0 = ctx.time.now;
  const items = [];
  const c = S.ctrl;
  for (const e of S.director.enemies) if (e.alive) items.push({ kind: 'hostile', label: e.kind === 'sentinel' ? 'Sentinela Vigilante' : e.rig.look?.name || 'Hostil', get: (out) => A.toWorld(e.anchor, e.center(_w), out, ctx.time.world), dist: e.pos.distanceTo(c.local), color: e.kind === 'sentinel' ? '#7fd0ff' : '#ff5a48' });
  for (const d of S.director.deposits) if (!d.dead) items.push({ kind: 'poi', label: `Depósito · ${d.kind}`, get: (out) => d.worldPos(out), dist: d.local.distanceTo(c.local), color: '#ffc850', discover: { kind: 'mineral', id: `${d.body.id}:${d.kind}`, name: d.kind } });
  try {
    const life = ctx.services.life;
    const found = life?.scan?.(S.eyeWorld, S.scanner.max) || [];
    for (const f of found) items.push({ kind: 'poi', label: f.name || f.label, get: (out) => out.copy(f.pos || f.getPos?.(out) || S.eyeWorld), dist: (f.pos || S.eyeWorld).distanceTo(S.eyeWorld), color: '#72f0a8' });
  } catch { /* */ }
  try {
    const sts = ctx.services.stations?.structuresOn?.(c.anchor.body?.id) || [];
    for (const st of sts) {
      const b = c.anchor.body; if (!b) break;
      const d = st.local.distanceTo(c.local);
      if (d > 2500) continue;
      items.push({ kind: 'poi', label: st.name, get: (out) => b.localToWorld(st.local, ctx.time.world, out), dist: d, color: st.kind === 'ruin' ? '#8cc4ff' : '#a6ecff', discover: st.kind === 'ruin' ? { kind: 'ruin', id: st.id, name: st.name } : null });
    }
  } catch { /* */ }
  for (const it of items) {
    if (it.dist > (it.kind === 'poi' && it.label?.startsWith?.('Depósito') ? S.scanner.max : 2500)) continue;
    const delay = Math.min(2.2, it.dist / S.scanner.max * 2.0);
    S.scanFound.push({ ...it, at: t0 + delay, until: t0 + delay + 9 });
  }
}
function scanFrame(ctx) {
  const hud = ctx.services.hud;
  const now = ctx.time.now;
  for (let i = S.scanFound.length - 1; i >= 0; i--) {
    const f = S.scanFound[i];
    if (!f.shown && now >= f.at) {
      f.shown = true;
      f.id = 'scan:' + Math.random().toString(36).slice(2, 8);
      try { f.h = hud?.marker?.(f.id, (out) => f.get(out), { label: f.label, kind: f.kind, color: f.color, modes: ['foot'], maxDist: 3000 }); } catch { /* */ }
      if (f.discover && !S.discovered.has(f.discover.id)) {
        S.discovered.add(f.discover.id);
        ctx.bus.emit('scan:discover', { ...f.discover, body: S.ctrl.anchor.body?.id || null });
      }
    }
    if (now > f.until) { try { f.h?.remove?.(); hud?.removeMarker?.(f.id); } catch { /* */ } S.scanFound.splice(i, 1); }
  }
}

// ─── dano ao jogador ──────────────────────────────────────────────────────
function playerHit(amount, info = {}) {
  const ctx = S.ctx;
  const a = amount / 110;
  const dirL = info.dir ? info.dir.clone() : null;
  S.suit.damage(a, info.weapon === 'grenade' ? 'kinetic' : 'energy', dirL);
  ctx.bus.emit('player:damage', { amount: a, type: 'energy', source: 'foot' });
  S.camKick.v -= 0.4 * Math.min(1, a * 6);
  S.camRoll.v += (Math.random() - 0.5) * 2 * Math.min(1, a * 6);
  ctx.input.rumble?.(0.6, 0.4, 120);
  if (S.suit.dead) onDeath(ctx, 'combate');
}
function onDeath(ctx, cause) {
  if (S.deathT > 0) return;
  S.deathT = 0.001;
  S.ctrl.frozen = true;
  ctx.bus.emit('notify', { text: 'SINAIS VITAIS CRÍTICOS — TRAJE EM MODO DE EMERGÊNCIA', kind: 'warn' });
  void cause;
}
function respawn(ctx) {
  S.deathT = 0;
  S.suit.respawn();
  S.ctrl.frozen = false;
  // volta para perto da nave (se houver), senão no lugar
  const sh = ctx.player.ship;
  if (sh?.pos && sh.landed && ctx.services.flight) {
    const p = sh.pos.clone();
    const up = upGuess(ctx, p).clone();
    const side = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize();
    S.ctrl.place(p.addScaledVector(side, 8));
    resolveAnchor(ctx);
  }
  S.director.alarm = false;
  for (const e of S.director.enemies) if (e.alive) { e.state = 'idle'; e.aware = 0; }
  ctx.bus.emit('notify', { text: 'TRAJE ESTABILIZADO', kind: 'info' });
}

// ─── locais de encontro (planeta atual) ───────────────────────────────────
function sitesFor(ctx, body) {
  if (!body || !body.landable) return [];
  if (S.sites.has(body.id)) return S.sites.get(body.id);
  const r = rng(hashStr('sitios:' + body.id));
  const out = [];
  const sysFaction = ctx.universe.system?.faction;
  // estruturas do sistema `stations` (postos, ruínas, naves caídas), se houver
  const near = [];
  try {
    for (const st of ctx.services.stations?.structuresOn?.(body.id) || []) {
      const dir = (st.dir || st.local).clone().normalize();
      near.push(dir);
      const off = (m) => dir.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(m / body.radius)).normalize();
      if (st.kind === 'ruins' || st.kind === 'ruin') out.push({ id: st.id + ':sent', kind: 'ruin', dir: off(30), n: 2 + (r() < 0.5 ? 1 : 0), dormant: true });
      else if ((st.kind === 'outpost' || st.kind === 'bunker' || st.kind === 'checkpoint') && st.faction === 'hegemonia') out.push({ id: st.id + ':camp', kind: 'camp', faction: 'hegemonia', dir: off(70) });
      else if (st.kind === 'wreck') out.push({ id: st.id + ':camp', kind: 'camp', faction: 'corsarios', dir: off(55) });
    }
  } catch { /* */ }
  // locais próprios (determinísticos)
  const n = near.length ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    if (near.some((d0) => d0.angleTo(dir) * body.radius < 1500)) continue;
    const kind = body.ruins && i < 2 && !near.length ? 'ruin' : 'camp';
    const faction = sysFaction === 'hegemonia' ? 'hegemonia' : r() < 0.55 ? 'corsarios' : 'hegemonia';
    out.push({ id: `${body.id}:sitio${i}`, kind, faction, dir, n: 2 + Math.floor(r() * 2) });
  }
  S.sites.set(body.id, out);
  return out;
}
function updateSites(ctx, dt) {
  S.sitesT -= dt;
  if (S.sitesT > 0) return;
  S.sitesT = 1.0;
  const c = S.ctrl;
  if (c.anchor.kind !== 'body' || ctx.shot) return;
  const b = c.anchor.body;
  const pl = c.local;
  const R = b.radius;
  for (const s of sitesFor(ctx, b)) {
    const p = s.dir.clone().multiplyScalar(R);
    const d = p.distanceTo(pl);
    const live = S.director.camps.find((C) => C.id === s.id) || S.liveSent.get(s.id);
    if (!live && d < 700 && !S.director.cleared.has(s.id)) {
      if (s.kind === 'camp') {
        const facing = pl.clone().sub(p); facing.addScaledVector(s.dir, -facing.dot(s.dir));
        const squad = [{ kind: 'soldier' }, { kind: 'soldier' }, { kind: s.faction === 'hegemonia' ? 'officer' : 'soldier' }];
        if (rng(hashStr(s.id))() < 0.4) squad.push({ kind: 'heavy' });
        S.director.spawnCamp({ id: s.id, body: b, dir: s.dir, facing: facing.normalize(), faction: s.faction, squad });
      } else {
        const list = S.director.spawnSentinels(b, s.dir, s.n, s.id);
        list.forEach((e) => { e.squad = { id: s.id }; if (s.dormant !== false) { e.state = 'dormant'; } });
        S.liveSent.set(s.id, list);
      }
    } else if (live && d > 1400) {
      if (s.kind === 'camp') S.director.removeCamp(live);
      else { for (const e of live) S.director.removeEnemy(e); S.liveSent.delete(s.id); }
    }
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────
function hudData(ctx) {
  const ar = S.arsenal, w = ar.def, s = S.suit, c = S.ctrl;
  const d = S.hudData;
  d.health = s.health; d.o2 = s.o2; d.energy = s.energy; d.temp = s.temp; d.tox = s.tox; d.rad = s.rad; d.shield = s.shield;
  d.jetpack = c.fuel; d.jetting = c.jetting;
  d.weapon = ar.current; d.weaponName = w ? w.name : 'Multiferramenta';
  d.ammo = w ? ar.ammo[w.id] : 0; d.mag = w ? w.mag : 0; d.reserve = w ? ar.reserve[w.id] : 0;
  d.grenades = ar.grenades;
  d.reloading = ar.reloading ? Math.min(1, ar.reloading.t / ar.reloading.dur) : 0;
  d.tool = ar.current === 'multitool' ? S.toolMode : (S.light.on ? 'light' : 'scanner');
  d.mining = S.mining.active ? S.mining.progress : 0;
  d.aiming = c.aiming && S.vm.aimK > 0.6;
  d.spread = w ? clamp(ar.spread(c, S.vm.aimK) * 40, 0, 1.5) : 0.2;
  d.moving = c.speed > 0.5; d.firing = S.lastFireT < 0.15;
  d.scanning = S.scanner.t >= 0;
  d.body = c.anchor.kind === 'body' ? c.anchor.body : null;
  d.range = S.lastRange || 0;
  d.inside = S.inside;
  return d;
}

// ─── API ──────────────────────────────────────────────────────────────────
const api = {
  /** Põe o jogador a pé em worldPos (pés). frame opcional {pos, quat, up?}. */
  spawnAt(worldPos, frame = null, fwd = null) {
    const ctx = S.ctx;
    if (ctx.game.mode !== 'foot') ctx.game.setMode('foot', { pos: worldPos.clone(), frame, interior: !!frame, from: 'api' });
    if (frame) S.ctrl.place(worldPos, fwd, { kind: 'frame', frame, up: frame.up || new THREE.Vector3(0, 1, 0) });
    else { S.pendingAnchor = { pos: worldPos.clone(), fwd: fwd || S.ctrl.dirToWorld(S.ctrl.fwd, new THREE.Vector3()), t: 0 }; resolveAnchor(ctx); S.pendingAnchor = null; }
    return S.ctrl;
  },
  get weapons() { return { arsenal: S.arsenal, defs: WEAPONS, slots: SLOTS, equip, get current() { return S.arsenal.current; }, giveAmmo: (id, n) => S.arsenal.addAmmo(id, n), addGrenades: (n) => { S.arsenal.grenades = Math.min(S.arsenal.maxGrenades, S.arsenal.grenades + n); } }; },
  get suit() { return S.suit; },
  get state() { return hudData(S.ctx); },
  hud() { return S.active ? hudData(S.ctx) : null; },
  equip,
  board(payload) { return S.boarding.board(payload); },
  spawnCamp(o) { return S.director.spawnCamp(o); },
  spawnSentinels(body, dir, n, id) { return S.director.spawnSentinels(body, dir, n, id); },
  get director() { return S.director; },
  get controller() { return S.ctrl; },
  get visor() { return S.visor; },
  get flora() { return S.flora; },
  get viewmodel() { return S.vm; },
  scan() { doScan(S.ctx); },
  setFlashlight(on) { S.suit.flashlight = S.light.toggle(!!on); },
  setToolMode(m) { if (TOOL_MODES.includes(m)) S.toolMode = m; },
  toLocal(world, out) { return S.ctrl.toLocal(world, out); },
  get inventory() { return S.inventory; },
  /** Interior/hack: registra uma porta hackeável. */
  hackable(def) { return S.interact.register({ ...def, hack: def.hack || { difficulty: 0.4 } }); },
};

// ═══════════════════════════════════════════════════════════════════════════
export default {
  name: 'foot',
  order: 35,
  async init(ctx) {
    S.ctx = ctx;
    S.ctrl = new Controller(ctx);
    S.interact = new Interact(ctx);
    S.vm = new ViewModel(ctx);
    S.beams = new Beams(ctx);
    S.proj = new Projectiles(ctx, S.beams);
    S.arsenal = new Arsenal();
    S.suit = new Suit(ctx);
    S.visor = new Visor(ctx);
    S.scanner = new Scanner(ctx);
    S.light = new Flashlight(ctx, ctx.camera);
    S.mining = new MiningLaser(ctx, S.beams);
    S.hack = new HackGame(ctx, ctx.camera);
    S.director = new Director(ctx, { get ctrl() { return S.ctrl; }, get eyeWorld() { return S.eyeWorld; }, get projectiles() { return S.proj; }, get beams() { return S.beams; }, get vm() { return S.vm; }, playerHit, onKill: (e) => onKill(ctx, e) });
    S.flora = new Flora(ctx);
    S.boarding = new Boarding(ctx, { get ctrl() { return S.ctrl; }, get director() { return S.director; }, get interact() { return S.interact; }, api });
    S.proj.targets = () => S.director.targets();
    S.inventory = {};
    S.discovered = new Set();
    S.sites = new Map(); S.liveSent = new Map();
    S.vm.onReloadDone = () => {};
    ctx.player.body = S.ctrl;
    ctx.provide('foot', api);
    ctx.provide('interact', S.interact.api);

    ctx.bus.on('mode:change', ({ from, to, data }) => {
      if (to === 'foot') enterFoot(ctx, data || {});
      else if (from === 'foot') leaveFoot(ctx);
    });
    ctx.bus.on('board', (p) => { if (!ctx.services.combat) S.boarding.board(p); });
    ctx.bus.on('weather', (w) => { S.weather = { kind: w.kind, intensity: w.intensity }; });
    ctx.bus.on('system:change', () => { S.director.clear(); S.flora.clear(); S.proj.clear(); S.sites.clear(); S.liveSent.clear(); });
    ctx.bus.on('player:damage', (e) => { if (e?.source === 'foot' || !S.active) return; if (e.type === 'fall') return; S.suit.damage((e.amount || 0) * (e.amount > 1 ? 0.01 : 1), e.type || 'kinetic'); if (S.suit.dead) onDeath(ctx, e.type); });
    ctx.bus.on('player:enterShip', () => { S.suit.refill(); });
    ctx.bus.on('dock:complete', () => { S.suit.refill(); });
    ctx.bus.on('game:new', () => { S.arsenal = new Arsenal(); S.suit = new Suit(ctx); S.inventory = {}; S.discovered.clear(); S.director.clear(); S.director.cleared.clear(); });
    ctx.save.register('foot', {
      serialize: () => ({ arsenal: S.arsenal.serialize(), suit: S.suit.serialize(), inv: S.inventory, disc: [...S.discovered], cleared: [...S.director.cleared], tool: S.toolMode }),
      deserialize: (d) => { if (!d) return; S.arsenal.deserialize(d.arsenal); S.suit.deserialize(d.suit); S.inventory = d.inv || {}; S.discovered = new Set(d.disc || []); S.director.cleared = new Set(d.cleared || []); S.toolMode = d.tool || 'scanner'; },
    });
    registerShots(ctx, api, S);
  },

  update(dt, ctx) {
    if (ctx.game.mode !== 'foot' || !S.active) return;
    const c = S.ctrl, t = ctx.time.world;
    if (S.pendingAnchor) { S.pendingAnchor.t += dt; if (S.pendingAnchor.t > 0.05) { resolveAnchor(ctx); S.pendingAnchor = null; } }
    // re-ancoragem: saiu de um interior ou entrou na SOI
    if (c.anchor.kind === 'frame' && c.lastSupport !== 'shape' && c.airT > 0.6) {
      const b = ctx.universe.system?.dominantBody?.(c.worldPos);
      if (b && b.altitudeOf(c.worldPos) < 3000) c.setAnchor({ kind: 'body', body: b });
    } else if (c.anchor.kind === 'world') {
      const b = ctx.universe.system?.dominantBody?.(c.worldPos);
      if (b && b.altitudeOf(c.worldPos) < 6000 && b.kind !== 'gas_giant') c.setAnchor({ kind: 'body', body: b });
    }
    S.director.syncFrames(t);
    if (S.boarding.active) S.boarding.update(dt);
    const inp = readInput(ctx);
    if (S.deathT > 0) { inp.moveX = inp.moveY = 0; inp.jump = inp.jumpPressed = false; }
    c.step(dt, inp);
    if (c.anchor.kind === 'body' && S.flora.pushTrunks(c.local, CK.radius)) c.syncWorld(t);
    // eventos de passo (áudio/poeira)
    if (c.footstep > 0) ctx.bus.emit('foot:step', { intensity: c.footstep, material: c.groundMat, sprint: c.sprinting });
    // olho no mundo (passo) para lógica
    S.eyeWorld.copy(c.worldPos).addScaledVector(c.worldUp, c.eyeHeight());
    weaponStep(dt, ctx);
    S.hack.step(dt, ctx.input);
    S.lastFireT += dt;
    const fW = _v.set(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    const used = S.interact.update(dt, S.eyeWorld, fW, !S.suit.dead);
    // ponte de reserva: terminais/NPCs do interior da estação (se ainda não registrados aqui)
    if (!used && !S.interact.current && ctx.input.pressed('interact') && c.anchor.id === 'estacao') {
      try {
        const st = ctx.services.stations, near = st?.nearest?.(c.worldPos);
        const it = near ? st.interiorOf?.(near.station?.id ?? near.station) : null;
        if (it?.near && typeof it.use === 'function') it.use(it.near);
      } catch { /* */ }
    }
    // abrigo: interior de nave/estação
    S.inside = c.anchor.kind === 'frame';
    const body = c.anchor.kind === 'body' ? c.anchor.body : null;
    let weather = S.weather;
    try { weather = ctx.services.planets?.weatherAt?.(c.worldPos) || S.weather; } catch { /* */ }
    S.weatherNow = weather;
    S.suit.step(dt, { body, worldPos: c.worldPos, inside: S.inside, weather, jetting: c.jetting, sprinting: c.sprinting, underwater: c.swim > 0.5 });
    if (S.suit.dead && S.deathT === 0) onDeath(ctx, 'ambiente');
    if (S.deathT > 0) { S.deathT += dt; if (S.deathT > 3.5) respawn(ctx); }
    // inimigos, projéteis, encontros
    const eyeL = c.toLocal(S.eyeWorld, _w, t);
    S.director.update(dt, c.anchor, c.local, eyeL, !S.suit.dead && S.deathT === 0);
    S.proj.update(dt);
    updateSites(ctx, dt);
    if (body) S.director.ensureDeposits(body, c.local);
    if (body && !S.inside) S.flora.update(body, c.local); else if (!body) S.flora.clear();
    // estado público
    ctx.player.pos.copy(c.worldPos);
    c.dirToWorld(c.vel, ctx.player.vel);
  },

  frame(dt, ctx) {
    S.beams.frame(dt);
    if (ctx.game.mode !== 'foot' || !S.active) {
      if (S.vm.root.parent) S.vm.root.removeFromParent();
      S.director.frame(dt);
      return;
    }
    const c = S.ctrl, t = ctx.time.world;
    // olhar (mouse/stick/toque)
    const look = ctx.input.takeLook();
    const sens = c.aiming ? (S.arsenal.current === 'sniper' ? 0.3 : 0.65) : 1;
    if (!S.hack.active && S.deathT === 0) c.look(look.x * sens, look.y * sens);
    // câmera
    spring(S.camKick, 0, 220, 20, dt);
    spring(S.camRoll, 0, 160, 16, dt);
    const sp = c.grounded ? Math.min(1.4, c.speed / 4.2) : 0;
    S.bob = damp(S.bob, sp * (1 - S.vm.aimK * 0.85), 6, dt);
    const bt = c.stepT;
    spring(S.land, 0, 90, 11, dt);
    if (c.landImpact > 0) { S.land.v -= c.landImpact * 1.6; c.landImpact = 0; }
    const eye = c.interpWorld(ctx.time.alpha, _v, t);
    const up = c.worldUp;
    const hq = c.headQuat(_q, t);
    const right = _w.set(1, 0, 0).applyQuaternion(hq);
    const bobY = (Math.abs(Math.sin(bt)) * 0.045 - 0.02) * S.bob;
    const bobX = Math.sin(bt) * 0.022 * S.bob;
    eye.addScaledVector(up, c.eyeHeight() + bobY + S.land.x * 0.08).addScaledVector(right, bobX);
    if (S.deathT > 0) eye.addScaledVector(up, -Math.min(1, S.deathT) * 1.2);
    ctx.player.camWorld.copy(eye);
    S.eyeWorld.copy(eye);
    // velocidade do referencial (chão que gira / nave): a reprojeção do TAA pode descontá-la
    const fv = ctx.player.frameVel;
    if (fv) {
      if (c.anchor.kind === 'body') A.velAt(c.anchor, c.local, fv, t);
      else if (c.anchor.kind === 'frame') { const fp = c.anchor.frame.pos; if (S.lastFramePos && dt > 0) fv.copy(fp).sub(S.lastFramePos).divideScalar(dt); S.lastFramePos = (S.lastFramePos || new THREE.Vector3()).copy(fp); }
      else fv.set(0, 0, 0);
      const R = ctx.services.rendering;
      if (R?.cut && !R.frameVelAware && fv.lengthSq() > 4) R.cut();
    }
    _q2.setFromAxisAngle(X, S.camKick.x + Math.cos(bt * 2) * 0.004 * S.bob + S.land.x * 0.05);
    hq.multiply(_q2);
    _q2.setFromAxisAngle(Zv, S.camRoll.x + Math.sin(bt) * 0.006 * S.bob + (S.deathT > 0 ? Math.min(1, S.deathT) * 0.6 : 0));
    hq.multiply(_q2);
    ctx.camera.quaternion.copy(hq);
    // FOV: correr abre, mirar fecha (zoom da sniper)
    const aimFov = S.vm.pose?.aimFov ?? 0.8;
    const target = S.fov * (1 + (c.sprinting ? 0.07 : 0)) * (1 - (1 - aimFov) * S.vm.aimK);
    const f = damp(ctx.camera.fov, target, 14, dt);
    if (Math.abs(f - ctx.camera.fov) > 0.01) { ctx.camera.fov = f; ctx.camera.updateProjectionMatrix(); }
    S.shotHold?.(ctx, dt);
    // arma
    S.vm.frame({
      dt, lookDX: c.lookYaw, lookDY: c.lookPitch, speed: c.speed, grounded: c.grounded, sprint: c.sprinting, aim: c.aiming,
      crouch: c.crouching, stepT: c.stepT, landImpact: 0, jetting: c.jetting,
    });
    c.lookYaw = 0; c.lookPitch = 0;
    // tela da arma / pulso
    const ar = S.arsenal, w = ar.def;
    if (w) S.vm.screen({ ammo: ar.ammo[w.id], mag: w.mag, label: w.model.toUpperCase().slice(0, 6), heat: ar.heat[w.id] || 0 });
    else S.vm.models.multitool?.userData.screen?.draw({ mode: S.toolMode, value: S.toolMode === 'mining' ? S.mining.heat : S.scanner.t >= 0 ? S.scanner.t / S.scanner.dur : 0, t: ctx.time.now, text: S.toolMode === 'mining' ? `${Math.round(S.mining.progress * 100)}%` : '' });
    if (w) S.vm.setHeat(ar.heat[w.id] || 0);
    const dayH = dayHour(ctx, c);
    S.vm.wrist.draw({ hour: dayH, o2: S.suit.o2, hp: S.suit.health });
    // ferramentas e efeitos
    const night = clamp(-(S.suit.dayElev ?? 0.3) * 5 + 0.3, 0, 1);
    S.light.frame(dt, 0.25 + (S.weatherNow?.intensity || 0) * 0.8 + night * 0.2);
    S.scanner.frame(dt, up);
    if (S.scanner.t >= 0) {
      const e1L = new THREE.Vector3(0, 1, 0).cross(c.upL); if (e1L.lengthSq() < 1e-6) e1L.set(1, 0, 0); e1L.normalize();
      const e2L = new THREE.Vector3().crossVectors(c.upL, e1L);
      const eyeL = c.toLocal(S.eyeWorld, new THREE.Vector3(), t);
      S.scanner.setGrid(c.dirToWorld(e1L, new THREE.Vector3()), c.dirToWorld(e2L, new THREE.Vector3()), eyeL.dot(e1L), eyeL.dot(e2L));
    }
    S.hack.frame(dt);
    scanFrame(ctx);
    S.director.frame(dt);
    S.flora.frame(ctx, night);
    jetFx(ctx, dt);
    // visor
    const upCam = _u.copy(up).applyQuaternion(_q2.copy(ctx.camera.quaternion).invert());
    const down = new THREE.Vector2(-upCam.x, upCam.y); // uv: y para baixo
    if (down.lengthSq() < 1e-4) down.set(0, 1);
    S.visor.frame(dt, { on: true, weather: S.weatherNow || S.weather, temp: S.suit.temp, inside: S.inside, health: S.suit.health, down: down.normalize(), exert: c.sprinting || c.jetting, frame: 1 });
    // alcance (luneta)
    if (S.vm.aimK > 0.5 && ar.current === 'sniper') {
      S.rangeT = (S.rangeT || 0) - dt;
      if (S.rangeT <= 0) { S.rangeT = 0.2; const r = ctx.collision.raycast(S.eyeWorld, new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion), 3000); S.lastRange = r ? r.dist : 0; }
    }
    // HUD: retícula
    try { ctx.services.hud?.setCrosshair?.(S.hack.active ? 'none' : ar.current === 'multitool' ? (S.toolMode === 'mining' ? 'mining' : 'tool') : (S.vm.aimK > 0.7 && ar.current === 'sniper' ? 'scope' : null)); } catch { /* */ }
  },

  dispose() { S.beams?.dispose(); S.director?.clear(); S.flora?.clear(); },
};

function dayHour(ctx, c) {
  const b = c.anchor.kind === 'body' ? c.anchor.body : null;
  if (!b) return 12;
  const up = _u.copy(c.worldPos).sub(b.pos).normalize();
  const sun = _w.copy(ctx.universe.system.star.pos).sub(c.worldPos).normalize();
  const axis = new THREE.Vector3(Math.sin(b.axialTilt || 0), Math.cos(b.axialTilt || 0), 0);
  const u = up.clone().addScaledVector(axis, -up.dot(axis)).normalize();
  const s = sun.clone().addScaledVector(axis, -sun.dot(axis)).normalize();
  const H = Math.atan2(new THREE.Vector3().crossVectors(u, s).dot(axis), u.dot(s));
  return ((12 - H / (Math.PI * 2) * 24) % 24 + 24) % 24;
}

/** Chamas do jetpack (partículas para baixo + brilho) e poeira dos passos. */
function jetFx(ctx, dt) {
  const c = S.ctrl, P = ctx.services.rendering?.particles;
  if (!P) return;
  S.jetFxT -= dt;
  if (c.jetting && S.jetFxT <= 0) {
    S.jetFxT = 0.03;
    const t = ctx.time.world;
    const hq = c.headQuat(_q, t);
    const back = _w.set(0, 0, 1).applyQuaternion(hq); back.addScaledVector(c.worldUp, -back.dot(c.worldUp)).normalize();
    const side = _v.crossVectors(back, c.worldUp).normalize();
    const vel = A.velAt(c.anchor, c.local, new THREE.Vector3(), t).add(c.dirToWorld(c.vel, new THREE.Vector3()));
    for (const s of [-1, 1]) {
      const p = c.worldPos.clone().addScaledVector(c.worldUp, 1.05).addScaledVector(back, 0.32).addScaledVector(side, s * 0.16);
      try {
        P.emit('glow', p, 2, (k, o) => { o.vx = -c.worldUp.x * 9 + (Math.random() - 0.5); o.vy = -c.worldUp.y * 9 + (Math.random() - 0.5); o.vz = -c.worldUp.z * 9 + (Math.random() - 0.5); o.life = 0.18; o.s0 = 0.16; o.s1 = 0.05; o.a = 8; o.b = 4; o.c = 1.6; o.w = 1.2; }, { vel, ttl: 1 });
        P.emit('spark', p, 1, (k, o) => { o.vx = -c.worldUp.x * 12; o.vy = -c.worldUp.y * 12; o.vz = -c.worldUp.z * 12; o.life = 0.25; o.s0 = 0.03; o.s1 = 0.01; o.drag = 1; o.g = 0; o.a = 0.9; o.b = 6; o.spin = 0.02; }, { vel, ttl: 1 });
      } catch { /* */ }
    }
    // poeira no chão sob o jato
    if (Math.random() < 0.25 && c.airT < 1.2) {
      const g = ctx.collision.ground(c.worldPos);
      if (g.height < 4) try { P.dust(c.worldPos.clone().addScaledVector(c.worldUp, -g.height), c.worldUp, 3, { radius: 1.5, color: dustColor(c.groundMat) }); } catch { /* */ }
    }
  }
  // poeira dos passos correndo em areia/neve
  if (c.footstep > 0.5 && c.sprinting) {
    const m = String(c.groundMat || '');
    if (m.startsWith('desert') || m.startsWith('ice') || m.startsWith('dead')) {
      try { P.dust(c.worldPos.clone(), c.worldUp, 2, { radius: 0.5, color: dustColor(m) }); } catch { /* */ }
    }
  }
}
function dustColor(m) {
  m = String(m || '');
  if (m.startsWith('ice')) return [0.8, 0.86, 0.95];
  if (m.startsWith('desert')) return [0.62, 0.42, 0.25];
  if (m.startsWith('volcanic')) return [0.18, 0.16, 0.15];
  return [0.35, 0.32, 0.27];
}

function onKill(ctx, e) {
  // saque: munição para a arma atual
  const ar = S.arsenal;
  const id = ar.current in WEAPONS ? ar.current : 'rifle';
  const n = Math.ceil(WEAPONS[id].mag * (e.kind === 'heavy' ? 0.8 : 0.4));
  ar.addAmmo(id, n);
  if (Math.random() < 0.3 && ar.grenades < ar.maxGrenades) ar.grenades++;
  if (!ctx.shot) ctx.bus.emit('notify', { text: `${e.kind === 'sentinel' ? 'SENTINELA DESTRUÍDA' : 'HOSTIL ABATIDO'} · +${n} MUNIÇÃO`, kind: 'reward' });
  try { ctx.services.factions?.change?.(e.faction, -1); } catch { /* */ }
}

export { api as footApi, COLORS };
