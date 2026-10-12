// Viagem quântica (entre corpos do sistema, ~2.000 km/s) e salto entre
// sistemas. Máquinas de estado que movem o FlightModel enquanto ativas.
//
// Quântico:  idle → spool (alinha com o alvo, carrega o motor) → travel
//            (perfil de velocidade suave: acelera, cruza, freia) → idle
//            Interdição corta a viagem (nave cai fora girando).
// Salto:     idle → charge (warp do deepspace carrega) → hyper (no túnel; o
//            sistema é trocado aqui, escondido) → idle (chegada).
import * as THREE from 'three/webgpu';
import { Frame } from './frames.js';
import { K } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;

/**
 * Normaliza um alvo de navegação: corpo, estação, POI, id (string) ou
 * {pos, name}. Retorna { kind, id, name, ref, pos(out), standoff, body } ou null.
 */
export function resolveTarget(ctx, target) {
  if (!target) return null;
  const sys = ctx.universe.system;
  if (typeof target === 'string') {
    if (ctx.universe.galaxy.entry(target)) return { kind: 'system', id: target, name: ctx.universe.galaxy.entry(target).name, ref: target };
    target = sys?.body(target) || sys?.station(target) || sys?.pois.find((p) => p.id === target) || null;
    if (!target) return null;
  }
  if (target.system && !target.pos) return resolveTarget(ctx, target.system);
  if (target.kind && target.radius && target.rotationAt) { // Body
    const b = target;
    const atmoTop = b.atmosphere ? b.radius * (b.kind === 'gas_giant' ? 0.05 : 0.52) : 0;
    return {
      kind: 'body', id: b.id, name: b.name, ref: b, body: b,
      pos: (out = new THREE.Vector3()) => out.copy(b.pos),
      standoff: b.radius + atmoTop + b.radius * (b.kind === 'gas_giant' ? 0.9 : 0.62),
    };
  }
  if (target.faction !== undefined && target.pos && (target.kind === 'trade' || target.kind === 'military' || target.kind === 'floating' || target.kind === 'outpost' || target.kind === 'rebel' || target.station)) {
    const st = target;
    return { kind: 'station', id: st.id, name: st.name, ref: st, pos: (out = new THREE.Vector3()) => out.copy(st.pos), standoff: K.STATION_STANDOFF };
  }
  if (target.pos) {
    const p = target.pos;
    return {
      kind: target.kind === 'ship' ? 'ship' : 'poi', id: target.id || 'ponto', name: target.name || nameOfPoi(target), ref: target,
      pos: (out = new THREE.Vector3()) => (typeof p === 'function' ? p(out) : out.copy(p)),
      standoff: target.standoff ?? K.POI_STANDOFF,
    };
  }
  return null;
}

function nameOfPoi(p) {
  return ({ derelict: 'Nave à deriva', distress: 'Sinal de socorro', ambush: 'Sinal desconhecido', ion_storm: 'Tempestade de íons', debris: 'Campo de destroços', convoy: 'Comboio', checkpoint: 'Posto de controle', arrival: 'Ponto de chegada', opening_battle: 'Batalha de Aurora' })[p.kind] || 'Ponto de interesse';
}

export class Quantum {
  constructor(ctx, model) {
    this.ctx = ctx; this.m = model;
    this.state = 'idle';
    this.t = 0; this.target = null;
    this.start = new THREE.Vector3(); this.end = new THREE.Vector3(); this.dir = new THREE.Vector3();
    this.D = 0; this.T = 0; this.vmax = 0; this.ta = 0; this.s = 0; this.v = 0;
    this.spoolT = 0; this.reason = '';
  }
  get active() { return this.state !== 'idle'; }
  get progress() { return this.state === 'travel' && this.D > 0 ? this.s / this.D : 0; }
  get eta() { return this.state === 'travel' ? Math.max(0, this.T - this.t) : this.state === 'spool' ? this.m.P.quantum.spool - this.spoolT + this.estimate() : this.estimate(); }
  estimate() {
    if (!this.target) return 0;
    const t = this.ctx.time.world;
    const wp = this.m.worldPos(t, _v);
    const D = Math.max(0, wp.distanceTo(this.target.pos(_v2)) - this.target.standoff);
    const P = this.m.P.quantum;
    return D / P.speed + P.accelTime;
  }

  /** Verifica se dá para iniciar: retorna '' ou o motivo. */
  check(target) {
    const m = this.m, E = m.env;
    if (!target) return 'SEM ALVO';
    if (target.kind === 'system') return 'ALVO É OUTRO SISTEMA — USE O SALTO';
    if (m.landed || m.docked) return 'NAVE POUSADA';
    if (E.inAtmo && E.density > 0.0025) return 'DENTRO DA ATMOSFERA';
    if (m.mode === 'jump') return 'SALTO EM ANDAMENTO';
    const t = this.ctx.time.world;
    const wp = m.worldPos(t, _v);
    const D = wp.distanceTo(target.pos(_v2)) - target.standoff;
    if (D < K.QUANTUM_MIN_DIST) return 'ALVO PRÓXIMO DEMAIS';
    const fuel = D / 1e6 * m.P.quantum.fuelPerMm;
    if (fuel > m.qfuel + 1e-6) return 'COMBUSTÍVEL QUÂNTICO INSUFICIENTE';
    return '';
  }

  begin(target) {
    const why = this.check(target);
    if (why) { this.reason = why; return false; }
    this.target = target; this.state = 'spool'; this.spoolT = 0; this.t = 0; this.reason = '';
    this.m.setCruise(false);
    this.ctx.bus.emit('quantum:spool', { target: target.ref, name: target.name });
    return true;
  }
  cancel() {
    if (this.state === 'spool') { this.state = 'idle'; this.m.headingCommand = null; this.ctx.bus.emit('quantum:end', { target: this.target?.ref, cancelled: true }); }
  }

  /** Direção (mundo) até o alvo, a partir da nave. */
  dirTo(out) {
    const t = this.ctx.time.world;
    return out.copy(this.target.pos(_v2)).sub(this.m.worldPos(t, _v)).normalize();
  }

  step(dt, ctl) {
    const m = this.m, t = this.ctx.time.world;
    if (this.state === 'spool') {
      this.spoolT += dt;
      // o computador ajuda a alinhar (o piloto pode corrigir)
      const dW = this.dirTo(_v);
      const dL = m.frame.dirToLocal(dW, t, new THREE.Vector3());
      const steer = Math.abs(ctl.pitch) + Math.abs(ctl.yaw) > 0.15;
      m.headingCommand = steer ? null : { fwd: dL, up: null, gain: 2.4, weight: 1 };
      const align = m.fwd(_v2).dot(dL);
      this.align = align;
      if (this.spoolT >= m.P.quantum.spool && align > Math.cos(4 * Math.PI / 180)) this.engage();
      // o spool desfaz se mergulhar na atmosfera
      if (m.env.inAtmo && m.env.density > 0.0025) { this.reason = 'ATMOSFERA'; this.cancel(); }
      return;
    }
    if (this.state !== 'travel') return;
    this.t += dt;
    const { D, T, ta, vmax } = this;
    const a = vmax / ta;
    let s, v;
    const tt = this.t;
    if (T <= 2 * ta) { // triangular
      const th = T / 2;
      if (tt < th) { s = 0.5 * a * tt * tt; v = a * tt; } else { const r = Math.max(0, T - tt); s = D - 0.5 * a * r * r; v = a * r; }
    } else if (tt < ta) { s = 0.5 * a * tt * tt; v = a * tt; }
    else if (tt < T - ta) { s = 0.5 * a * ta * ta + vmax * (tt - ta); v = vmax; }
    else { const r = Math.max(0, T - tt); s = D - 0.5 * a * r * r; v = a * r; }
    this.s = clamp(s, 0, D); this.v = v;
    m.pos.copy(this.start).addScaledVector(this.dir, this.s);
    m.vel.copy(this.dir).multiplyScalar(Math.max(v, 1));
    m.thrustLocal.set(0, 0, -1);
    if (tt >= T) this.finish();
  }

  engage() {
    const m = this.m, t = this.ctx.time.world;
    m.headingCommand = null;
    m.setFrame(Frame.world(), t);
    m.mode = 'quantum';
    const P = m.P.quantum;
    this.start.copy(m.pos);
    const tp = this.target.pos(new THREE.Vector3());
    this.dir.copy(tp).sub(this.start).normalize();
    this.end.copy(tp).addScaledVector(this.dir, -this.target.standoff);
    this.D = this.start.distanceTo(this.end);
    this.vmax = P.speed; this.ta = P.accelTime;
    const a = this.vmax / this.ta;
    this.T = this.D >= this.vmax * this.ta ? this.D / this.vmax + this.ta : 2 * Math.sqrt(this.D / a);
    this.t = 0; this.state = 'travel';
    m.qfuel = Math.max(0, m.qfuel - this.D / 1e6 * P.fuelPerMm);
    // alinha exatamente
    _m.lookAt(_v.set(0, 0, 0), this.dir, m.up(_v2));
    _q.setFromRotationMatrix(_m); // −Z (frente da nave) → dir
    m.quat.copy(_q); m.prevQuat.copy(_q);
    m.angVel.set(0, 0, 0);
    this.ctx.bus.emit('quantum:start', { target: this.target.ref, name: this.target.name, dir: this.dir.clone(), duration: this.T });
  }

  finish() {
    const m = this.m;
    this.state = 'idle';
    m.mode = 'scm';
    m.vel.copy(this.dir).multiplyScalar(m.P.scm * 0.6);
    this.ctx.bus.emit('quantum:end', { target: this.target.ref, name: this.target.name });
    this.arrived = this.target;
    m.updateFrame(this.ctx.time.world, true);
  }

  /** Interdição: corta a viagem; a nave sai girando. Retorna true se havia viagem. */
  interdict(by = null) {
    if (this.state === 'idle') return false;
    const m = this.m;
    const wasTravel = this.state === 'travel';
    this.state = 'idle';
    m.headingCommand = null;
    m.mode = 'scm';
    if (wasTravel) {
      m.vel.copy(this.dir).multiplyScalar(420);
      m.angVel.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 5);
      m.heat = Math.min(1, m.heat + 0.25);
      m.impact = 1;
    }
    this.ctx.bus.emit('quantum:interdicted', { target: this.target?.ref, by, pos: m.worldPos(this.ctx.time.world, new THREE.Vector3()) });
    m.updateFrame(this.ctx.time.world, true);
    return true;
  }
}

export class Jump {
  constructor(ctx, model) {
    this.ctx = ctx; this.m = model;
    this.state = 'idle'; this.t = 0; this.from = null; this.to = null; this.swapped = false; this.reason = '';
  }
  get active() { return this.state !== 'idle'; }
  range() { return this.m.P.jump.range * (0.85 + this.m.fuel * 0.15); }
  check(to, force) {
    const g = this.ctx.universe.galaxy, m = this.m;
    if (!g.entry(to)) return 'SISTEMA DESCONHECIDO';
    if (to === this.ctx.universe.systemId) return 'JÁ ESTÁ NESTE SISTEMA';
    if (force) return '';
    if (m.landed || m.docked) return 'NAVE POUSADA';
    if (m.mode === 'quantum') return 'EM VIAGEM QUÂNTICA';
    if (m.env.body && m.env.altBody < m.env.body.radius * 1.2) return 'MASSA PRÓXIMA DEMAIS';
    const d = g.distance(this.ctx.universe.systemId, to);
    if (d > this.range()) return `FORA DE ALCANCE (${d.toFixed(0)} AL)`;
    if (m.fuel < d / 400) return 'COMBUSTÍVEL INSUFICIENTE';
    return '';
  }
  begin(to, { force = false, arrival = null } = {}) {
    const why = this.check(to, force);
    if (why) { this.reason = why; return false; }
    const m = this.m;
    this.from = this.ctx.universe.systemId; this.to = to; this.t = 0; this.swapped = false; this.arrival = arrival;
    this.state = 'charge';
    m.setCruise(false);
    if (!force) m.fuel = Math.max(0, m.fuel - this.ctx.universe.galaxy.distance(this.from, to) / 400);
    this.ctx.bus.emit('jump:start', { from: this.from, to });
    return true;
  }
  step(dt, ctl) {
    const m = this.m;
    if (this.state === 'idle') return;
    this.t += dt;
    const C = m.P.jump.charge;
    if (this.state === 'charge') {
      // a nave acelera e segura o rumo; o piloto ainda manobra de leve
      m.mode = 'scm';
      if (this.t >= C) { this.state = 'hyper'; this.t = 0; m.mode = 'jump'; m.setFrame(Frame.world(), this.ctx.time.world); }
      return;
    }
    if (this.state === 'hyper') {
      m.mode = 'jump';
      m.vel.copy(m.fwd(_v)).multiplyScalar(2.6e5);
      m.pos.addScaledVector(m.vel, dt);
      m.thrustLocal.set(0, 0, -1);
      if (!this.swapped && this.t > 0.7) this.swap();
      if (this.t > 3.6) this.finish();
    }
  }
  swap() {
    const ctx = this.ctx, m = this.m;
    this.swapped = true;
    const sys = ctx.universe.setSystem(this.to);
    // chegada: POI 'arrival' do sistema, senão fora da SOI do primeiro planeta, do lado do sol
    let pos, look;
    const arr = this.arrival || sys.pois.find((p) => p.kind === 'arrival');
    if (arr?.pos) {
      pos = arr.pos.clone();
      const near = sys.body(arr.near) || sys.bodies[0];
      look = near ? near.pos.clone().sub(pos).normalize() : new THREE.Vector3(0, 0, -1);
    } else {
      const b = sys.bodies.find((x) => x.landable) || sys.bodies[0];
      if (b) {
        const toSun = sys.star.pos.clone().sub(b.pos).normalize();
        const side = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize();
        pos = b.pos.clone().addScaledVector(toSun.multiplyScalar(0.5).add(side).normalize(), b.soi * 1.15);
        look = b.pos.clone().sub(pos).normalize();
      } else { pos = new THREE.Vector3(5e6, 0, 0); look = new THREE.Vector3(-1, 0, 0); }
    }
    _m.lookAt(_v.set(0, 0, 0), look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(_m);
    m.placeWorld(pos.addScaledVector(look, -2.6e5 * 2.9), q, look.clone().multiplyScalar(2.6e5), ctx.time.world);
    m.mode = 'jump';
  }
  finish() {
    const m = this.m;
    this.state = 'idle';
    m.mode = 'scm';
    m.vel.copy(m.fwd(_v)).multiplyScalar(m.P.scm * 0.8);
    m.updateFrame(this.ctx.time.world, true);
    this.ctx.bus.emit('jump:end', { from: this.from, to: this.to });
  }
}
