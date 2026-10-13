// Comportamentos (passo fixo): bando pastando que entra em alerta e foge,
// bichos miúdos ariscos, predadores que caçam herbívoros e o jogador,
// territoriais que ameaçam (empinam/rugem) e investem, voadores em bando
// circulando sobre o relevo. A saída é rumo + velocidade desejados; a
// integração evita água e encostas íngremes.
import * as THREE from 'three/webgpu';
import { clamp, damp, dampAngle, wrapAngle } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function setGoal(c, dx, dz, speed) {
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) { c.goalSpeed = 0; return; }
  c.goalHeading = Math.atan2(dx, dz);
  c.goalSpeed = speed;
}
function hdist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function newState(c, s, T) { c.state = s; c.stateT = T; }

/** Decide o próximo objetivo da criatura. W = { player, playerNear, onFoot, t, rand, all, emit } */
export function think(c, dt, W) {
  if (!c.alive) { c.goalSpeed = 0; return; }
  const sp = c.sp, B = sp.behavior;
  c.stateT -= dt;
  c.attackCd = Math.max(0, c.attackCd - dt);
  c.alarmT = Math.max(0, (c.alarmT || 0) - dt);
  c.jawT = Math.max(0, c.jawT - dt * 1.5);
  c.rear = damp(c.rear || 0, c.state === 'threat' ? 1 : 0, 5, dt);
  const P = W.player;
  const dP = P ? hdist(c.pos, P) : Infinity;
  const look = c.look;
  // olhar: alerta segue o jogador
  if (P && dP < 45 && c.state !== 'graze' && c.state !== 'flee') {
    const ang = wrapAngle(Math.atan2(P.x - c.pos.x, P.z - c.pos.z) - c.heading);
    look.tyaw = clamp(ang, -1.1, 1.1);
    look.tpitch = -0.15;
  } else { look.tyaw = Math.sin(W.t * 0.3 + c.seed * 10) * 0.35; look.tpitch = 0; }
  c.alert = damp(c.alert, c.state === 'alert' || c.state === 'threat' || c.state === 'flee' ? 1 : 0, 3, dt);
  if (sp.plan === 'flyer') { flyer(c, dt, W, dP); return; }
  switch (sp.role) {
    case 'grazer': case 'critter': grazer(c, dt, W, dP); break;
    case 'predator': predator(c, dt, W, dP); break;
    case 'territorial': territorial(c, dt, W, dP); break;
    default: wander(c, dt, W, B.walk);
  }
}

function wander(c, dt, W, speed) {
  if (c.stateT > 0) return;
  const r = W.rand;
  const home = c.herd ? c.herd.center : c.home;
  const k = r();
  if (k < 0.45) { newState(c, 'graze', 5 + r() * 9); c.goalSpeed = 0; }
  else if (k < 0.62) { newState(c, 'idle', 2 + r() * 4); c.goalSpeed = 0; }
  else {
    // passeia em torno do centro do bando
    const a = r() * Math.PI * 2, d = r() * (c.herd ? 14 : 22);
    _v.set(home.x + Math.cos(a) * d - c.pos.x, 0, home.z + Math.sin(a) * d - c.pos.z);
    setGoal(c, _v.x, _v.z, speed * (0.7 + r() * 0.5));
    newState(c, 'walk', 3 + r() * 5);
  }
}

function fearOf(c, W, dP) {
  const sp = c.sp;
  const base = sp.role === 'critter' ? 11 : 20;
  let fear = null;
  const R = base * (W.loud ? 2.2 : 1) * (W.onFoot ? 1 : 1.6);
  if (dP < R) fear = W.player;
  // predadores próximos
  for (const o of W.near(c, 26)) if (o.alive && o.sp.role === 'predator' && o !== c && (o.state === 'chase' || o.state === 'stalk' || Math.random() < 0.02)) { fear = o.pos; break; }
  return fear;
}

function grazer(c, dt, W, dP) {
  const B = c.sp.behavior;
  const f = c.alarmT > 0 ? c.alarmFrom : fearOf(c, W, dP);
  if (f) {
    if (c.state !== 'flee') {
      c.alarmFrom = f.clone ? f.clone() : f;
      // alarme se espalha pelo bando
      if (c.herd) for (const o of c.herd.members) if (o !== c && o.alive && !(o.alarmT > 0)) { o.alarmT = 4 + Math.random() * 3; o.alarmFrom = c.alarmFrom; }
      c.alarmT = Math.max(c.alarmT, 5);
    }
    _v.set(c.pos.x - f.x, 0, c.pos.z - f.z).normalize();
    // fuga com leve zigue-zague e coesão
    const zig = Math.sin(W.t * 1.7 + c.seed * 9) * 0.5;
    const a = Math.atan2(_v.x, _v.z) + zig * 0.5;
    c.goalHeading = a; c.goalSpeed = B.run * (0.85 + c.seed * 0.3);
    newState(c, 'flee', 1);
    return;
  }
  if (c.state === 'flee') { newState(c, 'alert', 2 + Math.random() * 2); c.goalSpeed = 0; }
  // jogador perto mas não ameaçador: alerta (para e observa)
  if (dP < 40 && c.state !== 'alert' && Math.random() < dt * 0.6) { newState(c, 'alert', 2 + Math.random() * 3); c.goalSpeed = 0; return; }
  // coesão do bando
  if (c.herd && c.state !== 'walk') {
    const d = hdist(c.pos, c.herd.center);
    if (d > 16) { setGoal(c, c.herd.center.x - c.pos.x, c.herd.center.z - c.pos.z, B.walk); newState(c, 'walk', 2.5); return; }
  }
  wander(c, dt, W, B.walk);
}

function attack(c, W, dP, reach) {
  if (dP < reach && W.onFoot) {
    c.goalSpeed = 0;
    c.jawT = 1;
    if (c.attackCd <= 0) {
      c.attackCd = 1.3 + Math.random() * 0.5;
      W.emit('player:damage', { amount: c.sp.damage, type: 'kinetic', source: 'life', creature: c.id });
      W.emit('shake', { amount: 0.35, duration: 0.3 });
    }
    return true;
  }
  return false;
}

function predator(c, dt, W, dP) {
  const B = c.sp.behavior;
  const reach = (c.rig.dims.L + c.rig.dims.headR) * c.scale * 0.9 + 1.0;
  if (c.hp < c.sp.hp * 0.3) {
    _v.set(c.pos.x - W.player.x, 0, c.pos.z - W.player.z);
    setGoal(c, _v.x, _v.z, B.run); newState(c, 'flee', 1); return;
  }
  // jogador a pé ao alcance: espreita → persegue → ataca
  if (W.onFoot && (dP < 60 || c.provoked)) {
    const ang = Math.atan2(W.player.x - c.pos.x, W.player.z - c.pos.z);
    c.look.tyaw = 0; c.look.tpitch = -0.1;
    if (attack(c, W, dP, reach)) { c.goalHeading = ang; newState(c, 'attack', 0.5); return; }
    c.goalHeading = ang;
    c.goalSpeed = dP < 28 || c.provoked ? B.run : B.walk * 0.8;
    newState(c, dP < 28 ? 'chase' : 'stalk', 0.5);
    return;
  }
  // caça herbívoros
  if (c.state === 'chase' && c.prey && c.prey.alive && c.stateT > -10) {
    setGoal(c, c.prey.pos.x - c.pos.x, c.prey.pos.z - c.pos.z, B.run * 0.9);
    if (hdist(c.pos, c.prey.pos) < reach) { c.jawT = 1; c.prey.alarmT = 5; c.prey.alarmFrom = c.pos.clone(); newState(c, 'rest', 6); c.goalSpeed = 0; c.prey = null; }
    return;
  }
  if (c.stateT <= 0 && Math.random() < 0.25) {
    let best = null, bd = 90;
    for (const o of W.near(c, 90)) if (o.alive && (o.sp.role === 'grazer' || o.sp.role === 'critter')) { const d = hdist(o.pos, c.pos); if (d < bd && o.alive) { bd = d; best = o; } }
    if (best) { c.prey = best; newState(c, 'chase', 12); return; }
  }
  wander(c, dt, W, B.walk);
}

function territorial(c, dt, W, dP) {
  const B = c.sp.behavior;
  const reach = (c.rig.dims.L * 0.6 + c.rig.dims.headR + c.rig.dims.G) * c.scale + 1.2;
  const dHome = W.player ? hdist(c.home, W.player) : Infinity;
  const intruder = W.onFoot && (dHome < 20 || c.provoked);
  if (intruder) {
    const ang = Math.atan2(W.player.x - c.pos.x, W.player.z - c.pos.z);
    c.goalHeading = ang;
    if (c.state !== 'threat' && c.state !== 'charge' && c.state !== 'attack') { newState(c, 'threat', 1.6); c.goalSpeed = 0; c.jawT = 1; W.emit('life:roar', { id: c.id }); return; }
    if (c.state === 'threat' && c.stateT > 0) { c.goalSpeed = 0; c.jawT = 1; return; }
    if (attack(c, W, dP, reach)) { newState(c, 'attack', 0.6); return; }
    c.goalSpeed = B.run; newState(c, 'charge', 0.5);
    return;
  }
  if (c.state === 'charge' || c.state === 'attack' || (hdist(c.pos, c.home) > 26)) {
    c.provoked = false;
    setGoal(c, c.home.x - c.pos.x, c.home.z - c.pos.z, B.walk * 1.4); newState(c, 'walk', 3); return;
  }
  wander(c, dt, W, B.walk);
}

function flyer(c, dt, W, dP) {
  const fl = c.herd;
  // cada um tem um "lugar" no bando que gira em torno do centro
  const ang = (c.slot || 0) + W.t * (fl?.omega || 0.12);
  const R = (fl?.radius || 50) + Math.sin(W.t * 0.3 + c.seed * 7) * 8;
  const cx = (fl?.center.x || c.home.x) + Math.cos(ang) * R, cz = (fl?.center.z || c.home.z) + Math.sin(ang) * R;
  const gy = W.groundY(c.pos.x, c.pos.z);
  let alt = (fl?.alt || 30) + Math.sin(W.t * 0.5 + c.seed * 11) * 4 + (c.slotY || 0);
  if (dP < 25) alt += 15;
  _v.set(cx - c.pos.x, gy + alt - c.pos.y, cz - c.pos.z);
  const sp = c.sp.behavior.walk * (fl?.speedK || 1);
  const d = _v.length();
  _w.copy(_v).multiplyScalar(Math.min(1, d / 10) * sp / Math.max(1, d));
  // tangente para manter o giro
  _w.x += -Math.sin(ang) * sp * 0.7; _w.z += Math.cos(ang) * sp * 0.7;
  c.goalVel = (c.goalVel || new THREE.Vector3()).copy(_w);
}

/** Integra movimento (andadores) — passo fixo. */
export function integrate(c, dt, patch) {
  const sp = c.sp;
  if (sp.plan === 'flyer') {
    const gv = c.goalVel || c.vel;
    const prevH = Math.atan2(c.vel.x, c.vel.z);
    c.vel.lerp(gv, 1 - Math.exp(-dt * 0.9));
    const h = Math.atan2(c.vel.x, c.vel.z);
    c._turn = damp(c._turn || 0, wrapAngle(h - prevH) / Math.max(dt, 1e-3), 2, dt);
    c.heading = h;
    c.pos.addScaledVector(c.vel, dt);
    return;
  }
  if (!c.alive) { c.vel.multiplyScalar(Math.exp(-dt * 6)); return; }
  const turnK = c.goalSpeed > sp.behavior.walk * 1.5 ? 3.2 : 2.0;
  if (c.goalSpeed > 0.05) c.heading = dampAngle(c.heading, c.goalHeading ?? c.heading, turnK, dt);
  // não anda de lado: velocidade sempre na frente
  let s = Math.hypot(c.vel.x, c.vel.z);
  const ali = c.goalSpeed > 0.05 ? Math.max(0, Math.cos(wrapAngle((c.goalHeading ?? c.heading) - c.heading))) : 1;
  s = damp(s, (c.goalSpeed || 0) * (0.35 + 0.65 * ali), c.goalSpeed > s ? 2.2 : 4, dt);
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  // evita água e paredões à frente
  if (s > 0.2) {
    const look = 2 + s * 0.9;
    const ax = c.pos.x + fx * look, az = c.pos.z + fz * look;
    const g = patch.ground(ax, az, c._ga || (c._ga = {}));
    const rise = (g.y - c.pos.y) / look;
    if (g.water || rise > 0.85) {
      c.goalHeading = c.heading + (c.seed > 0.5 ? 1.6 : -1.6);
      s *= 0.5;
      if (c.state === 'walk') c.stateT = Math.min(c.stateT, 1);
    }
  }
  c.vel.set(fx * s, 0, fz * s);
  c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
}

/** Separação simples entre vizinhos (evita sobreposição). */
export function separate(list, dt) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (a.sp.plan === 'flyer' || a.sp.plan === 'worm' || a.sp.plan === 'marine') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.sp.plan === 'flyer' || b.sp.plan === 'worm' || b.sp.plan === 'marine') continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const R = (a.radius + b.radius) * 0.75;
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (R - d) * Math.min(1, dt * 4) * 0.5;
      const nx = dx / d, nz = dz / d;
      if (a.alive) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
      if (b.alive) { b.pos.x += nx * push; b.pos.z += nz * push; }
    }
  }
}
