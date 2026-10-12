// Sistema `flight` — voo da nave do jogador.
//
//  • física 6DOF com inércia, assistência (acoplado) e desacoplado, boost com
//    combustível e calor, energia entre escudos/motor/armas (teclas 1–5)
//  • velocidades: SCM ~250 m/s, pós-combustor, cruzeiro ∝ altitude,
//    quântico ~2.000 km/s com spool e alvo, salto entre sistemas
//  • voo atmosférico (arrasto, sustentação, gravidade), reentrada com
//    plasma/pele quente e evento 'reentry', pouso em qualquer lugar plano ou
//    plataforma (trem, inclinação, toque suave; a nave fica presa ao
//    referencial do planeta que gira), decolagem, docking, interdição,
//    colisão com terreno/asteroides/estações
//  • câmera do modo 'ship' (cockpit + externa com B), sentar/levantar
//
// Serviço ctx.services.flight:
//   spawnPlayerShip(pos, quat, classId?, opts?) → estado (ctx.player.ship)
//       opts: { faction, vel, body (Body|id: pos/quat no referencial LOCAL do
//               corpo), landed, gear, enter (troca o modo p/ 'ship', padrão true),
//               throttle, third }
//   setTarget(alvo|null)          alvo: Body | estação | POI | {pos,name} | id | id de sistema
//   quantumTo(alvo?)              inicia o quântico (ou o salto se o alvo for um sistema)
//   jumpTo(systemId, {force, arrival}?)
//   interdict(by?) → bool         (combate chama; corta quântico/cruzeiro)
//   dockAt(estação) / undock()    land() / takeOff()
//   exitSeat() / enterSeat()
//   setPower({sys,eng,wep} | presetIndex) · bumpPower('sys'|'eng'|'wep')
//   setCruise(bool) · setCoupled(bool) · setGear(bool) · setCamera('cockpit'|'chase')
//   setInputOverride(obj|fn|null) — cenas: {pitch,yaw,roll,strafeX,strafeY,throttle,boost}
//   addHeat(v) · hit(dano, posMundo?) · repair() · refuel()
//   get state / instance / model
//
// Emite: quantum:*, jump:*, reentry, land, takeoff, player:exitShip,
// player:enterShip, dock:request/complete, undock, shake, explosion,
// ship:destroyed, player:death, notify. Escuta: ship:hit (alvo = 'player').
import * as THREE from 'three/webgpu';
import { FlightModel } from './model.js';
import { FlightControls } from './controls.js';
import { FlightCamera } from './camera.js';
import { FlightFx } from './fx.js';
import { WingTrails } from './trails.js';
import { Quantum, Jump, resolveTarget } from './travel.js';
import { Autopilot } from './autopilot.js';
import { Frame } from './frames.js';
import { CLASSES, K, POWER_PRESETS } from './config.js';
import { registerShots } from './shots.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;

const S = {
  ctx: null, model: null, controls: null, cam: null, fx: null, quantum: null, jump: null, ap: null,
  inst: null, instEntry: null, instPos: new THREE.Vector3(), ship: null,
  eye: new THREE.Vector3(0, 1.1, -3), wp: new THREE.Vector3(), wq: new THREE.Quaternion(), wv: new THREE.Vector3(),
  target: null, autoT: 0, climbT: 0, msg: '', msgT: 0, deadT: 0, platT: 0, shotHold: null, lastSafe: null,
  ctl: { pitch: 0, yaw: 0, roll: 0, strafeX: 0, strafeY: 0, throttle: 0, boost: false, takeoff: false },
  neutral: { pitch: 0, yaw: 0, roll: 0, strafeX: 0, strafeY: 0, throttle: 0, boost: false, takeoff: false },
  pendingRestore: null, dockStation: null, interior: null, frameObj: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, groundInfo: { height: Infinity, up: new THREE.Vector3(), point: new THREE.Vector3(), material: null },
};

function notify(text, kind = 'info') {
  S.msg = text; S.msgT = 4;
  S.ctx.bus.emit('notify', { text, kind });
}

// ─── nave ────────────────────────────────────────────────────────────────
function makeShipState(classId, faction) {
  return {
    id: 'player', classId, faction, model: '', label: CLASSES[classId]?.label || classId,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), velLocal: new THREE.Vector3(), angVel: new THREE.Vector3(),
    throttle: 0, speed: 0, energy: { shield: 0.5, engine: 0.5, weapons: 0.5 }, pips: { sys: 2, eng: 2, wep: 2 },
    shields: { f: 1, b: 1, l: 1, r: 1 }, hull: 1, heat: 0, overheat: false, boost: 0, boosting: false, boostFuel: 1, fuel: 1, qfuel: 1,
    mode: 'scm', coupled: true, gear: false, gearT: 0, landed: false, docked: false, station: null,
    quantum: { state: 'idle', target: null, name: '', spool: 0, eta: 0, progress: 0, reason: '' },
    jump: { state: 'idle', to: null, range: 0, reason: '' },
    cruise: false, body: null, bodyId: null, altitude: Infinity, inAtmo: false, density: 0, reentry: 0, gforce: 1, stall: 0,
    thirdPerson: false, instance: null, target: null, radius: 9, length: 18, frame: 'world', autopilot: null,
  };
}

function spawnPlayerShip(pos, quat, classId = 'fighter', opts = {}) {
  const ctx = S.ctx;
  const faction = opts.faction || 'hegemonia';
  if (!CLASSES[classId]) classId = 'fighter';
  // instância visual (ships); sem ela o voo continua (só não há modelo)
  if (S.inst) { try { S.inst.dispose(); } catch { /* já liberada */ } S.instEntry?.remove(); S.inst = null; }
  const ships = ctx.services.ships;
  let inst = null;
  try { inst = ships?.create?.(classId, faction, { id: 'player', seed: 7, throttle: 0, gear: opts.landed || opts.gear ? 1 : 0, shadows: true }); } catch (e) { ctx.errors.push('flight: ships.create: ' + (e.stack || e)); }
  S.inst = inst;
  if (inst) {
    S.instEntry = ctx.world.add(inst.group, S.instPos);
    try { inst.setLights?.(true); } catch { /* opcional */ }
    if (opts.gear || opts.landed) inst.setGear?.(true, true);
  }
  const m = S.model;
  m.setClass(classId);
  m.radius = inst?.radius || (classId === 'fighter' ? 9 : 20);
  m.length = inst?.length || m.radius * 2;
  m.gearHeight = inst?.gearHeight || 1.9;
  // olho: o cockpit do caça (ships) ou o olho do blueprint
  let eye = null;
  try { if (classId === 'fighter' && ships?.cockpit?.eye) eye = ships.cockpit.eye.clone(); } catch { /* sem cockpit */ }
  try { ships?.cockpit?.show?.(classId === 'fighter' ? 'auto' : false); } catch { /* sem cockpit */ }
  // naves grandes: interior andável preso ao referencial da nave; olho na cadeira do piloto
  if (S.interior) { try { S.interior.remove?.(); } catch { /* */ } S.interior = null; }
  if (inst && classId !== 'fighter' && ships?.attachInterior) {
    try {
      S.interior = ships.attachInterior(inst, S.frameObj);
      if (S.interior?.seat) eye = S.interior.seat.clone().add(new THREE.Vector3(0, 0.8, -0.1));
    } catch (e) { ctx.errors.push('flight: interior: ' + (e.stack || e)); S.interior = null; }
  }
  if (!eye && inst?.eye) eye = inst.eye.clone();
  S.eye.copy(eye || new THREE.Vector3(0, m.radius * 0.12, -m.length * 0.28));
  // pose
  const t = ctx.time.world;
  const body = typeof opts.body === 'string' ? ctx.universe.system?.body(opts.body) : opts.body;
  m.mode = 'scm'; m.cruise.on = false; m.velCommand = null; m.headingCommand = null; m.landed = false; m.docked = false;
  if (body) {
    m.frame = Frame.body(body);
    m.pos.copy(pos); m.prevPos.copy(pos); m.quat.copy(quat); m.prevQuat.copy(quat);
    m.vel.copy(opts.vel || _v.set(0, 0, 0)); m.angVel.set(0, 0, 0);
  } else m.placeWorld(pos, quat, opts.vel || null, t);
  m.gear = !!(opts.gear || opts.landed); m.gearT = m.gear ? 1 : 0;
  m.throttle = opts.throttle ?? 0;
  m.hull = 1; for (const k in m.shields) m.shields[k] = 1;
  m.sampleEnv(t);
  if (opts.landed && m.frame.body) {
    m.sampleGround();
    m.pos.addScaledVector(m.env.up, m.clearance() - m.env.ground);
    m.prevPos.copy(m.pos);
    m.touchdown(m.env.normal.clone(), 0, t);
    m.landSettle = 0.001;
    m.events.length = 0;
  }
  S.ship = makeShipState(classId, faction);
  S.ship.instance = inst; S.ship.model = inst?.model || '';
  S.ship.radius = m.radius; S.ship.length = m.length;
  ctx.player.ship = S.ship;
  S.cam.third = !!opts.third; S.cam.reset();
  S.fx.attachShip(inst);
  S.trails.setShip(m.radius);
  // colisores do próprio interior (naves grandes) ficam fora da colisão do voo
  m.ownShapes = inst ? [...ctx.collision.shapes].filter((sh) => sh.tag === 'interior:' + inst.id) : [];
  m.worldPos(t, S.frameObj.pos); m.worldQuat(t, S.frameObj.quat);
  syncState(t, 1);
  if (opts.enter !== false && ctx.game.mode !== 'ship') ctx.game.setMode('ship', { ship: S.ship });
  return S.ship;
}

// ─── alvo / viagem ─────────────────────────────────────────────────────────
function setTarget(target) {
  S.target = target ? resolveTarget(S.ctx, target) : null;
  if (S.ship) S.ship.target = S.target ? { kind: S.target.kind, id: S.target.id, name: S.target.name, ref: S.target.ref } : null;
  return S.target;
}

/** Corpo/estação/POI mais perto da mira (até 9°). */
function targetUnderCrosshair() {
  const ctx = S.ctx, sys = ctx.universe.system, t = ctx.time.world;
  if (!sys) return null;
  const pos = S.model.worldPos(t, _v3);
  const fwd = S.model.frame.dirToWorld(S.model.fwd(_v), t, _v2.set(0, 0, 0)).normalize();
  const cands = [...sys.bodies, ...sys.stations.filter((s) => !s.hidden), ...sys.pois.filter((p) => p.kind !== 'arrival')];
  let best = null, bs = Math.cos(9 * Math.PI / 180);
  for (const c of cands) {
    const d = new THREE.Vector3().copy(c.pos).sub(pos);
    const dist = d.length();
    const ang = d.divideScalar(dist).dot(fwd);
    const size = c.radius ? Math.min(0.2, Math.asin(Math.min(1, c.radius / dist))) : 0;
    const score = ang + size * 0.5;
    if (score > bs) { bs = score; best = c; }
  }
  return best;
}

function quantumTo(target) {
  if (target !== undefined && target !== null) setTarget(target);
  if (!S.target) { notify('QUÂNTICO: SEM ALVO', 'warn'); return false; }
  if (S.target.kind === 'system') return jumpTo(S.target.id);
  const ok = S.quantum.begin(S.target);
  if (!ok) notify('QUÂNTICO: ' + S.quantum.reason, 'warn');
  else notify(`MOTOR QUÂNTICO CARREGANDO — ${S.target.name.toUpperCase()}`);
  return ok;
}

function jumpTo(systemId, opts = {}) {
  if (S.quantum.active) S.quantum.cancel();
  const ok = S.jump.begin(systemId, opts);
  if (!ok) notify('SALTO: ' + S.jump.reason, 'warn');
  else notify(`SALTO PARA ${S.ctx.universe.galaxy.entry(systemId)?.name?.toUpperCase() || systemId} — CARREGANDO`);
  return ok;
}

function interdict(by = null) {
  const m = S.model;
  if (S.quantum.interdict(by)) { notify('INTERDIÇÃO! MOTOR QUÂNTICO DESLIGADO', 'warn'); return true; }
  if (m.cruise.on) {
    m.setCruise(false);
    m.vel.setLength(Math.min(m.vel.length(), 380));
    m.angVel.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 4);
    S.ctx.bus.emit('quantum:interdicted', { target: S.target?.ref || null, by, pos: m.worldPos(S.ctx.time.world, new THREE.Vector3()) });
    notify('INTERDIÇÃO! CRUZEIRO INTERROMPIDO', 'warn');
    return true;
  }
  return false;
}

// ─── pouso / docking ───────────────────────────────────────────────────────
function land() {
  const m = S.model, ctx = S.ctx;
  if (m.landed || m.docked) return true;
  m.gear = true;
  const b = m.frame.body, pl = ctx.services.planets;
  if (!b || m.env.ground > 6000 || !pl?.findLandingSpot) { notify('TREM DE POUSO BAIXADO'); return false; }
  let spot = null;
  try { spot = pl.findLandingSpot(b, m.pos, { maxSlope: 0.08, radius: Math.min(3000, 600 + m.env.ground) }); } catch { spot = null; }
  if (!spot) { notify('NENHUM LOCAL PLANO ENCONTRADO', 'warn'); return false; }
  const up = spot.normal.clone();
  const fwd = m.fwd(new THREE.Vector3()); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  S.ap.engage({ frame: m.frame, pos: spot.local.clone(), up, fwd, hover: 45, kind: 'land', onArrive: () => notify('POUSO CONCLUÍDO') });
  notify('POUSO ASSISTIDO — DESCENDO');
  return true;
}

function takeOff() {
  const m = S.model;
  if (!m.landed && !m.docked) return false;
  const wasDocked = m.docked;
  m.liftOff();
  if (wasDocked) { S.ctx.bus.emit('undock', { station: S.dockStation }); S.dockStation = null; }
  S.climbT = 2.6;
  return true;
}

function padFor(station) {
  const ctx = S.ctx, st = ctx.services.stations;
  for (const k of ['dockingPad', 'padFor', 'requestDock']) {
    try {
      const p = st?.[k]?.(station, { ship: S.ship });
      if (p && p.frame && p.pos) return p;
    } catch { /* tenta o próximo */ }
  }
  // reserva: ponto fixo ao lado da estação, no referencial dela
  const sys = ctx.universe.system;
  const body = sys?.body(station.body);
  const out = body ? station.pos.clone().sub(body.pos).normalize() : new THREE.Vector3(0, 1, 0);
  const anchor = station.frame || { pos: station.pos, quat: new THREE.Quaternion() };
  const side = new THREE.Vector3().crossVectors(out, new THREE.Vector3(0, 1, 0)).normalize();
  if (side.lengthSq() < 0.5) side.set(1, 0, 0);
  return { frame: anchor, pos: out.clone().multiplyScalar(420).addScaledVector(side, 160), up: out.clone(), fwd: side.clone().negate(), reserve: true };
}

function dockAt(station) {
  const ctx = S.ctx, m = S.model;
  if (typeof station === 'string') station = ctx.universe.system?.station(station);
  if (!station) return false;
  if (m.docked) return true;
  ctx.bus.emit('dock:request', { station });
  const pad = padFor(station);
  const frame = Frame.anchor(pad.frame);
  if (pad.reserve) ctx.bus.emit('dock:granted', { station, pad }); // com `stations`, quem autoriza é ele
  S.dockStation = station;
  S.ap.engage({
    frame, pos: pad.pos.clone(), up: (pad.up || new THREE.Vector3(0, 1, 0)).clone(), fwd: pad.fwd ? pad.fwd.clone() : null,
    hover: pad.hover ?? 35, kind: 'dock',
    onArrive: () => {
      const t = ctx.time.world;
      m.setFrame(frame, t);
      m.docked = true; m.landed = true; m.mode = 'docked';
      ctx.bus.emit('dock:complete', { station });
      notify(`ATRACADO — ${station.name.toUpperCase()}`, 'reward');
    },
    onCancel: () => { S.dockStation = null; },
  });
  notify(`AUTORIZAÇÃO DE POUSO — ${station.name.toUpperCase()}`);
  return true;
}

// ─── a pé ──────────────────────────────────────────────────────────────────
function exitSeat() {
  const ctx = S.ctx, m = S.model;
  if (!S.ship || ctx.game.mode !== 'ship') return false;
  const t = ctx.time.world;
  if (S.interior) {
    // levanta da cadeira e anda dentro da nave (que pode estar voando)
    const local = (S.interior.spawn || new THREE.Vector3()).clone();
    const wq = m.worldQuat(t, new THREE.Quaternion());
    const pos = local.clone().applyQuaternion(wq).add(m.worldPos(t, new THREE.Vector3()));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(wq);
    S.cam.third = false;
    ctx.player.pos.copy(pos); ctx.player.camWorld.copy(pos).addScaledVector(up, S.interior.eyeHeight || 1.65);
    if (!m.landed && !m.docked && m.coupled) m.throttle = 0;
    ctx.game.setMode('foot', { from: 'ship', interior: true, frame: S.frameObj, local, pos: pos.clone(), up, ship: S.ship, seat: S.interior.seat?.clone() });
    ctx.bus.emit('player:exitShip', { ship: S.ship, pos: pos.clone(), up, interior: true, frame: S.frameObj });
    return true;
  }
  if (!m.landed && !m.docked) { notify('POUSE ANTES DE SAIR DA NAVE', 'warn'); return false; }
  const wq = m.worldQuat(t, new THREE.Quaternion());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(wq);
  // escada do lado esquerdo do cockpit
  const local = new THREE.Vector3(-(m.radius * 0.42 + 1.6), -m.clearance() + 0.05, -m.length * 0.12);
  const pos = local.applyQuaternion(wq).add(m.worldPos(t, new THREE.Vector3()));
  // apoia no chão
  const pl = ctx.services.planets, b = m.frame.body;
  if (b && pl?.surfaceAt) {
    try { const s = pl.surfaceAt(pos, {}); if (Number.isFinite(s.altitude)) pos.addScaledVector(s.normal || up, -s.altitude); } catch { /* sem chão */ }
  }
  S.cam.third = false;
  ctx.player.pos.copy(pos);
  ctx.player.vel.set(0, 0, 0);
  ctx.player.camWorld.copy(pos).addScaledVector(up, 1.7);
  m.throttle = 0;
  ctx.game.setMode('foot', { from: 'ship', pos: pos.clone(), up: up.clone(), ship: S.ship, body: b || null });
  ctx.bus.emit('player:exitShip', { ship: S.ship, pos: pos.clone(), up, body: b || null });
  return true;
}

function enterSeat() {
  const ctx = S.ctx;
  if (!S.ship) return false;
  if (ctx.game.mode !== 'ship') ctx.game.setMode('ship', { ship: S.ship });
  S.cam.reset();
  ctx.bus.emit('player:enterShip', { ship: S.ship });
  return true;
}

// ─── API ────────────────────────────────────────────────────────────────────
const api = {
  spawnPlayerShip, setTarget, quantumTo, jumpTo, interdict, dockAt, land, takeOff, exitSeat, enterSeat,
  undock: takeOff,
  setPower(p) { const m = S.model; if (typeof p === 'number') return m.applyPreset(p); m.setPips(p); return m.pips; },
  bumpPower(k) { S.model.bumpPip(k); return S.model.pips; },
  presets: POWER_PRESETS, classes: CLASSES,
  setCruise(on) { return toggleCruise(on); },
  setCoupled(on) { S.model.coupled = !!on; },
  setGear(on) { S.model.gear = !!on; },
  setCamera(m) { S.cam.third = m === 'chase' || m === 'external' || m === true; S.cam.reset(); },
  setInputOverride(o) { S.controls.override = o || null; },
  addHeat(v) { S.model.heat = Math.min(1.2, S.model.heat + v); },
  hit(dmg, pos) { return S.model.hit(dmg, pos); },
  repair() { S.model.hull = 1; for (const k in S.model.shields) S.model.shields[k] = 1; try { S.inst?.repair?.(); } catch { /* */ } },
  refuel(q = 1, j = 1) { S.model.qfuel = Math.min(1, S.model.qfuel + q); S.model.fuel = Math.min(1, S.model.fuel + j); S.model.boostFuel = 1; },
  targetUnderCrosshair,
  jumpRange() { return S.jump.range(); },
  /** Sistemas ao alcance do salto: [{id, name, ly, starType, faction}] (mais perto primeiro). */
  jumpTargets() {
    const u = S.ctx.universe, r = S.jump.range();
    return u.galaxy.neighbors(u.systemId, r).map((e) => ({ id: e.id, name: e.name, ly: u.galaxy.distance(u.systemId, e.id), starType: e.starType, faction: e.faction, region: e.region })).sort((a, b) => a.ly - b.ly);
  },
  canJump(id) { return S.jump.check(id, false) || ''; },
  get state() { return S.ship; },
  get instance() { return S.inst; },
  get model() { return S.model; },
  get target() { return S.target; },
  get camera() { return S.cam; },
  /** Pose de mundo atual (interpolada). */
  pose() { return { pos: S.wp.clone(), quat: S.wq.clone() }; },
};

function toggleCruise(on) {
  const m = S.model;
  const want = on ?? !m.cruise.on;
  if (want) {
    if (m.landed || m.docked) { notify('NAVE POUSADA', 'warn'); return false; }
    if (m.env.inAtmo && m.env.density > 0.002) { notify('CRUZEIRO INDISPONÍVEL NA ATMOSFERA', 'warn'); return false; }
    if (S.quantum.active || S.jump.active) return false;
    m.gear = false;
    m.setCruise(true);
    notify('CRUZEIRO ATIVADO');
  } else if (m.cruise.on) { m.setCruise(false); m.vel.setLength(Math.min(m.vel.length(), m.P.scm * 1.4)); notify('CRUZEIRO DESATIVADO'); }
  return m.cruise.on;
}

// ─── passo fixo ────────────────────────────────────────────────────────────
function handleEdges(e) {
  const m = S.model;
  if (e.decouple) { m.coupled = !m.coupled; notify(m.coupled ? 'VOO ACOPLADO' : 'VOO DESACOPLADO'); }
  if (e.gear && !m.landed) { m.gear = !m.gear; notify(m.gear ? 'TREM BAIXADO' : 'TREM RECOLHIDO'); if (m.gear && m.cruise.on) m.setCruise(false); }
  if (e.camera) { S.cam.third = !S.cam.third; S.cam.reset(); }
  if (e.p1) m.bumpPip('sys');
  if (e.p2) m.bumpPip('eng');
  if (e.p3) m.bumpPip('wep');
  if (e.p4) m.applyPreset(0);
  if (e.p5) { const p = m.applyPreset(m.presetIdx + 1); notify('ENERGIA: ' + p.label); }
  if (e.quantum) {
    if (S.quantum.state === 'spool') { S.quantum.cancel(); notify('QUÂNTICO CANCELADO'); }
    else if (S.quantum.active || S.jump.active) { /* nada */ }
    else if (m.cruise.on) toggleCruise(false);
    else {
      const aim = targetUnderCrosshair();
      const cur = S.target;
      if (aim && (!cur || cur.ref !== aim)) setTarget(aim);
      const t = S.target;
      const far = t && t.kind !== 'system' && S.quantum.check(t) === '';
      if (t?.kind === 'system') jumpTo(t.id);
      else if (far && (aim === t?.ref || !aim)) quantumTo();
      else toggleCruise(true);
    }
  }
  if (e.interact) {
    if (m.landed || m.docked) exitSeat();
    else if (m.env.nearStation && m.env.stationDist < 12000 && !S.ap.active) dockAt(m.env.nearStation);
    else if (m.env.body && m.env.ground < 1500 && !S.ap.active) land();
  }
}

function update(dt, ctx) {
  // início de reserva: sem `story`, o jogo começa voando na abertura
  if (!S.ship && !ctx.shot && ctx.game.mode === 'title' && !ctx.services.story) {
    S.autoT += dt;
    if (S.autoT > 0.6) startDefault(ctx);
  }
  if (!S.ship && S.pendingRestore) restore(S.pendingRestore);
  if (!S.ship) return;
  const m = S.model, t = ctx.time.world;
  if (S.shotHold) { S.shotHold(dt); return; }
  const mode = ctx.game.mode;
  const piloting = mode === 'ship' && ctx.input.enabled !== false;
  let ctl;
  if ((S.controls.override || piloting) && S.deadT <= 0) ctl = S.controls.read(dt, m, S.cam.third);
  else { ctl = S.neutral; ctl.throttle = m.throttle; }
  if (piloting && S.deadT <= 0) handleEdges(S.controls.edges());
  // re-embarque sem o sistema de interação
  if (mode === 'foot' && !S.interactHooked && ctx.input.pressed('interact')) {
    if (S.interior?.seat) {
      const seatW = S.interior.seat.clone().applyQuaternion(S.frameObj.quat).add(S.frameObj.pos);
      if (ctx.player.pos.distanceTo(seatW) < 2.2) enterSeat();
    } else if (ctx.player.pos.distanceTo(S.wp) < m.radius + 5) enterSeat();
  }
  // subida automática após decolar
  if (S.climbT > 0) {
    S.climbT -= dt;
    const up = m.env.body ? m.env.up : m.up(_v);
    if (!m.velCommand || m.velCommand === S.climbVec) { S.climbVec = (S.climbVec || new THREE.Vector3()).copy(up).multiplyScalar(14); m.velCommand = S.climbVec; }
    if (S.climbT <= 0 || Math.abs(ctl.pitch) + Math.abs(ctl.yaw) > 0.4 || ctl.throttle > 0.05) { S.climbT = 0; if (m.velCommand === S.climbVec) m.velCommand = null; }
  }
  if (S.ap.active) S.ap.step(dt, ctl);
  m.step(dt, ctl, t);
  if (S.quantum.active) S.quantum.step(dt, ctl);
  if (S.jump.active) S.jump.step(dt, ctl);
  // recolhe o trem sozinho depois de subir
  if (!m.landed && m.gear && !S.ap.active && m.env.ground > K.GEAR_AUTO_RETRACT && m.speed > 45 && S.gearAuto) { m.gear = false; S.gearAuto = false; }
  if (m.landed) S.gearAuto = true;
  // plataformas (formas de colisão sob o trem)
  platformCheck(dt, t);
  m.worldPos(t, S.frameObj.pos); m.worldQuat(t, S.frameObj.quat);
  for (const ev of m.events) onModelEvent(ev, t);
  m.events.length = 0;
  if (S.msgT > 0) S.msgT -= dt;
  // morte → renascer (sem story)
  if (S.deadT > 0) {
    S.deadT -= dt;
    if (S.deadT <= 0 && !ctx.services.story) respawnSafe();
  }
}

function platformCheck(dt, t) {
  const m = S.model, col = S.ctx.collision;
  if (m.landed || m.docked || m.gearT < 0.85 || col.shapes.size <= m.ownShapes.length) return;
  S.platT -= dt;
  if (S.platT > 0) return;
  S.platT = 1 / 20;
  const wp = m.worldPos(t, _v);
  const down = m.frame.dirToWorld(m.up(_v2), t, _v3).negate();
  for (const s of m.ownShapes) s.enabled = false;
  let hit = null;
  try {
    const saved = col.grounds; col.grounds = new Set(); // só formas (o terreno o modelo já trata)
    hit = col.raycast(wp, down, m.clearance() + 2);
    col.grounds = saved;
  } catch { hit = null; }
  for (const s of m.ownShapes) s.enabled = true;
  if (!hit || !hit.shape) return;
  const clr = m.clearance();
  if (hit.dist > clr + 0.25) return;
  const nW = hit.normal;
  const vW = m.worldVel(t, _v2);
  const vn = vW.dot(nW);
  if (nW.dot(down) > -0.8 || vn < -m.P.landMaxV || vW.length() > m.P.landMaxH + 2) return;
  // pousa preso ao referencial da forma (plataforma/estação que se move)
  const frame = Frame.anchor(hit.shape.frame);
  m.setFrame(frame, t);
  const nL = frame.dirToLocal(nW, t, new THREE.Vector3());
  m.pos.addScaledVector(nL, clr - hit.dist);
  m.touchdown(nL, Math.abs(vn), t);
}

function onModelEvent(ev, t) {
  const ctx = S.ctx, m = S.model, bus = ctx.bus;
  const wp = m.worldPos(t, new THREE.Vector3());
  switch (ev.type) {
    case 'land': {
      const station = m.frame.kind === 'anchor' ? S.dockStation : null;
      bus.emit('land', { body: m.frame.body || null, station, pos: wp });
      bus.emit('shake', { amount: Math.min(0.35, 0.06 + ev.speed * 0.05), duration: 0.35 });
      const rnd = ctx.services.rendering;
      if (rnd?.particles?.dust) {
        const up = m.frame.dirToWorld(m.groundUp, t, new THREE.Vector3());
        try { rnd.particles.dust(wp.clone().addScaledVector(up, -m.clearance()), up, 30, { radius: 9 + m.radius * 0.6 }); } catch { /* */ }
      }
      S.lastSafe = { body: m.frame.body?.id, pos: m.pos.clone(), quat: m.quat.clone() };
      notify(m.frame.body ? `POUSADO — ${m.frame.body.name.toUpperCase()}` : 'POUSADO');
      break;
    }
    case 'takeoff': bus.emit('takeoff', { body: m.frame.body || null, station: S.dockStation, pos: wp }); break;
    case 'impact': {
      bus.emit('shake', { amount: Math.min(1, 0.15 + ev.speed * 0.02), duration: 0.5 });
      const rnd = ctx.services.rendering;
      const p = ev.posWorld || wp;
      try { rnd?.particles?.sparks?.(p, null, Math.min(80, 10 + ev.speed * 2), { speed: 20 + ev.speed }); } catch { /* */ }
      if (ev.ground && rnd?.particles?.dust) { try { rnd.particles.dust(p, m.frame.dirToWorld(m.env.normal, t, new THREE.Vector3()), 20, { radius: 8 }); } catch { /* */ } }
      ctx.input.rumble?.(Math.min(1, ev.speed / 30), 0.6, 250);
      if (m.hull <= 0) destroyShip('colisão');
      break;
    }
    case 'destroyed': destroyShip(ev.cause); break;
    case 'gpws': if (S.msgT <= 0) { S.msg = 'PUXE PARA CIMA'; S.msgT = 1; } break;
    case 'cruise:drop':
      notify(ev.reason === 'atmo' ? 'ENTRADA ATMOSFÉRICA — CRUZEIRO DESLIGADO' : ev.reason === 'station' ? 'ESTAÇÃO PRÓXIMA — CRUZEIRO DESLIGADO' : 'SUPERFÍCIE PRÓXIMA — CRUZEIRO DESLIGADO', 'warn');
      break;
    default: break;
  }
}

function destroyShip(cause) {
  const ctx = S.ctx, m = S.model;
  if (S.deadT > 0) return;
  const t = ctx.time.world;
  const wp = m.worldPos(t, new THREE.Vector3());
  ctx.bus.emit('explosion', { pos: wp.clone(), size: m.radius * 2.5, kind: 'ship' });
  ctx.bus.emit('ship:destroyed', { id: 'player', faction: S.ship.faction, pos: wp.clone(), byPlayer: false, size: m.radius });
  ctx.bus.emit('player:death', { cause });
  m.hull = 0; m.vel.set(0, 0, 0); m.angVel.set(0, 0, 0); m.throttle = 0;
  S.deadT = 4;
}

function respawnSafe() {
  const ctx = S.ctx, sys = ctx.universe.system;
  const ls = S.lastSafe;
  if (ls && sys.body(ls.body)) spawnPlayerShip(ls.pos, ls.quat, S.ship.classId, { body: ls.body, landed: true, faction: S.ship.faction });
  else {
    const st = sys.stations.find((s) => !s.hidden) || null;
    const p = st ? st.pos.clone().add(new THREE.Vector3(0, 0, 3000)) : new THREE.Vector3(5e6, 0, 0);
    spawnPlayerShip(p, new THREE.Quaternion(), S.ship.classId, { faction: S.ship.faction });
  }
}

function startDefault(ctx) {
  const sys = ctx.universe.system;
  const poi = sys.pois.find((p) => p.kind === 'opening_battle') || sys.pois.find((p) => p.kind === 'arrival');
  const near = poi ? sys.body(poi.near) : sys.bodies.find((b) => b.landable);
  const pos = poi ? poi.pos.clone() : near ? near.pos.clone().add(new THREE.Vector3(near.radius * 3, near.radius * 0.5, 0)) : new THREE.Vector3(5e6, 0, 0);
  const look = near ? near.pos.clone().sub(pos).normalize() : new THREE.Vector3(0, 0, -1);
  _m.lookAt(_v.set(0, 0, 0), look, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(_m);
  spawnPlayerShip(pos, q, 'fighter', { faction: 'hegemonia', vel: look.clone().multiplyScalar(120), throttle: 0.45 });
  const canvas = ctx.canvas;
  if (canvas && !S.lockHooked) {
    S.lockHooked = true;
    canvas.addEventListener('click', () => { if ((ctx.game.mode === 'ship' || ctx.game.mode === 'foot') && !ctx.services.hud) ctx.input.requestLock(); });
  }
}

// ─── save ──────────────────────────────────────────────────────────────────
function serialize() {
  if (!S.ship) return null;
  const m = S.model;
  const f = m.frame;
  return {
    v: 1, classId: m.classId, faction: S.ship.faction, system: S.ctx.universe.systemId,
    frame: f.kind === 'body' ? { kind: 'body', body: f.body.id } : { kind: 'world' },
    pos: (f.kind === 'anchor' ? m.worldPos(S.ctx.time.world, new THREE.Vector3()) : m.pos).toArray(),
    quat: (f.kind === 'anchor' ? m.worldQuat(S.ctx.time.world, new THREE.Quaternion()) : m.quat).toArray(),
    landed: m.landed && f.kind === 'body', gear: m.gear, pips: { ...m.pips }, hull: m.hull, fuel: m.fuel, qfuel: m.qfuel, coupled: m.coupled,
  };
}
function restore(d) {
  S.pendingRestore = null;
  if (!d || !d.pos) return;
  const ctx = S.ctx;
  if (d.system && ctx.universe.systemId !== d.system) ctx.universe.setSystem(d.system);
  const pos = new THREE.Vector3().fromArray(d.pos), q = new THREE.Quaternion().fromArray(d.quat);
  spawnPlayerShip(pos, q, d.classId, { faction: d.faction, body: d.frame?.kind === 'body' ? d.frame.body : null, landed: d.landed, gear: d.gear, enter: false });
  const m = S.model;
  if (d.pips) m.setPips(d.pips);
  m.hull = d.hull ?? 1; m.fuel = d.fuel ?? 1; m.qfuel = d.qfuel ?? 1; m.coupled = d.coupled ?? true;
}

// ─── por frame ─────────────────────────────────────────────────────────────
function syncState(t, alpha) {
  const ctx = S.ctx, m = S.model, sh = S.ship;
  m.worldPos(t, S.wp, alpha);
  m.worldQuat(t, S.wq, alpha);
  m.worldVel(t, S.wv);
  sh.pos.copy(S.wp); sh.quat.copy(S.wq); sh.vel.copy(S.wv);
  sh.velLocal.copy(m.vel).applyQuaternion(_q.copy(m.quat).invert());
  sh.angVel.copy(m.angVel);
  sh.throttle = m.throttle; sh.speed = m.speed; sh.energy = m.energy; Object.assign(sh.pips, m.pips);
  Object.assign(sh.shields, m.shields); sh.hull = m.hull; sh.heat = m.heat; sh.overheat = m.overheat;
  sh.boost = m.boosting ? 1 : 0; sh.boosting = m.boosting; sh.boostFuel = m.boostFuel; sh.fuel = m.fuel; sh.qfuel = m.qfuel;
  sh.mode = m.cruise.on ? 'cruise' : m.mode; sh.coupled = m.coupled; sh.gear = m.gear; sh.gearT = m.gearT; sh.landed = m.landed; sh.docked = m.docked;
  sh.station = m.docked ? S.dockStation : null;
  const Q = S.quantum, J = S.jump;
  sh.quantum.state = Q.state; sh.quantum.target = Q.target?.ref || null; sh.quantum.name = Q.target?.name || S.target?.name || '';
  sh.quantum.spool = Q.state === 'spool' ? Math.min(1, Q.spoolT / m.P.quantum.spool) : Q.state === 'travel' ? 1 : 0;
  sh.quantum.eta = S.target && S.target.kind !== 'system' ? (Q.active ? Q.eta : Q.estimate()) : 0;
  sh.quantum.progress = Q.progress; sh.quantum.reason = Q.reason;
  sh.jump.state = J.state; sh.jump.to = J.to; sh.jump.range = J.range(); sh.jump.reason = J.reason;
  sh.cruise = m.cruise.on;
  sh.body = m.env.body; sh.bodyId = m.env.body?.id || null;
  sh.altitude = m.env.body ? m.env.ground : Infinity;
  sh.inAtmo = m.env.inAtmo; sh.density = m.env.density; sh.reentry = m.reentry; sh.gforce = m.gforce; sh.stall = m.stall;
  sh.thirdPerson = S.cam.third; sh.frame = m.frame.kind; sh.autopilot = S.ap.active ? S.ap.target.kind : null;
}

function horizonAngles(m) {
  // atitude no referencial local do planeta (ou "plano da eclíptica" no espaço)
  const up = m.env.body ? m.env.up : _v.set(0, 1, 0);
  const b = m.env.body;
  const axis = b ? _v2.set(Math.sin(b.axialTilt || 0), Math.cos(b.axialTilt || 0), 0) : _v2.set(0, 0, -1);
  const north = axis.clone().addScaledVector(up, -axis.dot(up));
  if (north.lengthSq() < 1e-6) north.set(1, 0, 0);
  north.normalize();
  const east = new THREE.Vector3().crossVectors(north, up);
  const f = m.fwd(new THREE.Vector3()), r = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quat);
  const pitch = Math.asin(clamp(f.dot(up), -1, 1));
  const heading = Math.atan2(f.dot(east), f.dot(north));
  const rh = r.clone().addScaledVector(up, -r.dot(up));
  const roll = Math.atan2(r.dot(up), rh.length()) * -1;
  return { pitch, heading, roll };
}

let _mapSys = null, _map = null;
function feedCockpit(ctx, ctl) {
  let cp = null;
  try { cp = ctx.services.ships?.cockpit; } catch { cp = null; }
  if (!cp) return;
  const m = S.model, sh = S.ship;
  const att = horizonAngles(m);
  const Q = S.quantum;
  const modeLabel = Q.state === 'spool' ? 'QT CARGA' : Q.state === 'travel' ? 'QUÂNTICO' : S.jump.active ? 'SALTO' : m.docked ? 'ATRACADO' : m.landed ? 'POUSADO' : m.cruise.on ? 'CRUZEIRO' : S.ap.active ? 'AUTO' : m.coupled ? (m.boosting ? 'BOOST' : 'SCM') : 'DESACOPL.';
  const warnings = [];
  if (m.overheat) warnings.push('SUPERAQUECIMENTO');
  else if (m.heat > 0.8) warnings.push('TEMPERATURA ALTA');
  if (m.reentry > 0.35) warnings.push('REENTRADA');
  if (m.hull < 0.3) warnings.push('CASCO CRÍTICO');
  if (m.stall > 0.5 && m.env.inAtmo) warnings.push('ESTOL');
  if (S.msg === 'PUXE PARA CIMA' && S.msgT > 0) warnings.push('PUXE PARA CIMA');
  const sys = ctx.universe.system;
  if (sys && _mapSys !== sys.id) {
    _mapSys = sys.id;
    _map = { sys: sys.id, bodies: sys.bodies.map((b) => ({ name: b.name, x: b.pos.x, z: b.pos.z, kind: b.kind, parent: b.parent })), player: { x: 0, z: 0 }, dest: null };
    for (const st of sys.stations || []) if (!st.hidden) _map.bodies.push({ name: st.name, x: st.pos.x, z: st.pos.z, kind: 'station', parent: st.body });
  }
  if (_map) {
    _map.player.x = S.wp.x; _map.player.z = S.wp.z;
    if (S.target && S.target.kind !== 'system') { const p = S.target.pos(_v3); _map.dest = { x: p.x, z: p.z }; } else _map.dest = null;
  }
  let message = S.msgT > 0 ? S.msg : '';
  if (!message && S.target) {
    const eta = sh.quantum.eta;
    message = S.target.kind === 'system' ? `ALVO DE SALTO: ${S.target.name.toUpperCase()}` : `ALVO: ${S.target.name.toUpperCase()}${eta > 0 ? ` · QT ${Math.ceil(eta)} s` : ''}`;
  }
  const d = {
    speed: Q.state === 'travel' ? Q.v : m.speed, altitude: m.env.body ? m.env.ground : Infinity, throttle: Math.max(0, m.throttle), boost: m.boosting ? 1 : 0,
    heading: att.heading, pitch: att.pitch, roll: att.roll, mode: modeLabel,
    shields: m.shields, hull: m.hull, energy: m.energy, heat: Math.min(1, m.heat), fuel: m.boostFuel,
    gear: m.gearT > 0.5, warnings, message, velLocal: m.speed > 3 ? sh.velLocal.clone().normalize() : null,
    stick: { x: ctl.yaw, y: -ctl.pitch, roll: ctl.roll, yaw: 0 }, head: S.cam.headExtra,
    systemName: sys?.name || '', location: (m.env.body ? m.env.body.name : sys?.name || '').toUpperCase() + (m.env.inAtmo ? ' · ATMOSFERA' : ''),
  };
  if (_map) d.map = _map;
  cp.setData(d);
  cp._fed = true;
  if (cp.auto) cp.auto.input = false;
  if (m.reentry > 0.02) try { cp.onReentry?.(m.reentry); } catch { /* */ }
}

function groundForCamera(p) {
  const m = S.model, b = m.env.body;
  if (!b || m.env.ground > 400) return null;
  const pl = S.ctx.services.planets;
  if (!pl?.heightAtLocal) return null;
  const t = S.ctx.time.world;
  const local = b.worldToLocal(p, t, _v);
  const r = local.length();
  const dir = local.divideScalar(r || 1);
  let h = 0;
  try { h = pl.heightAtLocal(b, dir); } catch { return null; }
  const view = pl.view?.(b);
  if (view?.terrain?.hasSea) h = Math.max(h, 0);
  const g = S._cg || (S._cg = { height: 0, up: new THREE.Vector3() });
  g.height = r - b.radius - h;
  b.dirToWorld(dir, t, g.up);
  return g;
}

function frame(dt, ctx) {
  if (!S.ship) return;
  const m = S.model;
  const t = ctx.time.world;
  const alpha = S.shotHold ? 1 : ctx.time.alpha;
  syncState(t, alpha);
  const mode = ctx.game.mode;
  const inShip = mode === 'ship';
  const cockpitView = inShip && !S.cam.third;
  // modelo exterior
  const inst = S.inst;
  if (inst) {
    S.instPos.copy(S.wp);
    inst.group.quaternion.copy(S.wq);
    const tl = m.thrustLocal;
    const thr = m.mode === 'quantum' || m.mode === 'jump' ? 1 : Math.max(0, -tl.z) * 0.9 + Math.min(0.25, Math.hypot(tl.x, tl.y) * 0.15) + (m.landed ? 0 : 0.06);
    inst.setThrottle?.(thr);
    inst.setBoost?.(m.boosting ? 1 : m.cruise.on ? 0.6 : 0);
    inst.setGear?.(m.gear);
    inst.group.visible = (!cockpitView || !!S.interior) && m.hull > 0;
  }
  // câmera
  if (inShip) {
    S.cam.frame(dt, { shipPos: S.wp, shipQ: S.wq, model: m, controls: S.controls, eye: S.eye, length: m.length, ground: groundForCamera });
    ctx.player.pos.copy(S.wp);
    ctx.player.vel.copy(S.wv);
    ctx.player.altitude = m.env.body ? m.env.ground : Infinity;
    feedCockpit(ctx, S.controls.override || mode === 'ship' ? S.controls.out : S.neutral);
  }
  // efeitos
  const gi = S.groundInfo;
  if (m.env.body && m.env.ground < 60 && !m.landed) {
    gi.height = m.env.ground;
    m.frame.dirToWorld(m.env.normal, t, gi.up);
    gi.point.copy(S.wp).addScaledVector(gi.up, -(m.env.ground + 0.2));
    gi.material = m.env.body.type;
  } else gi.height = Infinity;
  S.fx.frame(dt, {
    pos: S.wp, quat: S.wq, velW: S.wv, reentry: m.reentry, radius: m.radius, length: m.length,
    exterior: !cockpitView, thrust: Math.max(0, -m.thrustLocal.z), boost: m.boosting, groundInfo: gi, hover: !m.landed && m.env.ground < 30,
  });
  const E = m.env;
  S.trails.frame(dt, {
    pos: S.wp, quat: S.wq, velW: S.wv, density: E.density, gforce: m.gforce, speed: m.speed, exterior: !cockpitView && m.mode !== 'quantum' && ctx.params.get('trails') !== '0',
    contrail: E.inAtmo && E.density > 0.008 && E.density < 0.25 && m.speed > 260 && m.reentry < 0.1 ? 0.3 : 0,
    sunColor: ctx.services.rendering?.sun?.color || null, frame: m.frame, t,
  });
  if (m.reentry > 0.02) ctx.bus.emit('reentry', { intensity: m.reentry });
  // trepidação da reentrada / turbulência no ar denso em alta velocidade
  S.shakeT = (S.shakeT || 0) - dt;
  const buffet = Math.max(m.reentry * 0.8, m.env.inAtmo ? Math.min(0.3, m.dynPressure / 2e5) * 0.5 : 0, m.stall * 0.3);
  if (inShip && buffet > 0.05 && S.shakeT <= 0 && !S.shotHold) {
    S.shakeT = 0.22;
    ctx.bus.emit('shake', { amount: buffet * 0.22, duration: 0.3 });
    ctx.input.rumble?.(buffet * 0.5, buffet * 0.3, 200);
  }
}

export default {
  name: 'flight',
  order: 25,
  async init(ctx) {
    S.ctx = ctx;
    S.model = new FlightModel(ctx, 'fighter');
    S.controls = new FlightControls(ctx);
    S.cam = new FlightCamera(ctx);
    S.fx = new FlightFx(ctx);
    S.trails = new WingTrails(ctx);
    S.quantum = new Quantum(ctx, S.model);
    S.jump = new Jump(ctx, S.model);
    S.ap = new Autopilot(ctx, S.model);
    ctx.provide('flight', api);
    S.frameNow = () => frame(0, ctx);
    ctx.bus.on('ship:hit', (e) => {
      if (!S.ship || !e || (e.target !== 'player' && e.target !== S.ship.id)) return;
      if (ctx.services.combat?.ownsPlayerDamage) return;
      S.model.hit(e.damage ?? 5, e.pos || null);
      if (S.model.hull <= 0) destroyShip('combate');
    });
    ctx.bus.on('system:change', (e) => {
      // troca de sistema fora do salto (story/debug): a nave sai do referencial antigo
      if (!S.ship || S.jump.active) return;
      const m = S.model;
      if (m.frame.kind !== 'world') { m.frame = Frame.world(); }
      S.target = null; if (S.ship) S.ship.target = null;
      _mapSys = null;
      void e;
    });
    ctx.bus.on('mode:change', (e) => {
      if (e?.to === 'ship') { S.cam.reset(); S.cam.fov = ctx.camera.fov; }
    });
    // interação (sistema foot/interact): embarcar na nave pousada
    const hookInteract = (it) => {
      if (!it || S.interactHooked) return;
      const def = {
        id: 'flight:embarcar', label: 'EMBARCAR', text: 'Embarcar na nave', radius: 4.5, kind: 'ship',
        pos: (out = new THREE.Vector3()) => {
          if (!S.ship) return out.set(1e12, 0, 0);
          if (S.interior?.seat) return out.copy(S.interior.seat).applyQuaternion(S.frameObj.quat).add(S.frameObj.pos);
          return out.set(-(S.model.radius * 0.42 + 1.2), 0, -S.model.length * 0.12).applyQuaternion(S.wq).add(S.wp);
        },
        enabled: () => !!S.ship && ctx.game.mode === 'foot',
        onUse: () => enterSeat(), use: () => enterSeat(),
      };
      for (const k of ['register', 'add', 'addTarget']) {
        if (typeof it[k] === 'function') { try { it[k](def); S.interactHooked = true; break; } catch { /* tenta outro */ } }
      }
    };
    if (ctx.services.interact) hookInteract(ctx.services.interact);
    ctx.bus.on('service:interact', hookInteract);
    ctx.save.register('flight', { serialize, deserialize: (d) => { S.pendingRestore = d; } });
    registerShots(ctx, api, S);
  },
  update(dt, ctx) { update(dt, ctx); },
  frame(dt, ctx) { frame(dt, ctx); },
  dispose() {
    S.fx?.dispose();
    S.trails?.dispose();
    try { S.inst?.dispose(); } catch { /* */ }
    S.instEntry?.remove();
  },
};

export { api as flightApi };
