/**
 * FÍSICA DE VOO da nave — controlador dos modos 'ship' e 'space' do jogador.
 *
 * Um só modelo contínuo, ponderado pela DENSIDADE DO AR `air` (0 no vácuo,
 * 1 ao nível do solo; exp(−alt/H) com H da atmosfera do planeta e corte no
 * topo da atmosfera):
 *
 *   ATMOSFÉRICO (air → 1)
 *     • empuxo ao longo do nariz até a velocidade-alvo do acelerador
 *     • arrasto quadrático + amortecimento LATERAL forte (a asa "morde" o ar:
 *       a velocidade segue o nariz)
 *     • gravidade radial g·(R/r)² compensada pela SUSTENTAÇÃO ∝ v² (abaixo
 *       da velocidade de estol a nave afunda devagar)
 *     • curva coordenada: guinada inclina (bank) a nave; sem comando de
 *       rolagem ela volta a nivelar com o horizonte
 *   ESPACIAL (air → 0)
 *     • newtoniano ASSISTIDO: empuxo acelera, a assistência só amortece
 *       devagar a deriva lateral (a nave "escorrega" nas curvas)
 *     • sem auto-nivelamento; rolagem livre
 *   REENTRADA: v alta com ar → calor (shipState.heat) e frenagem limitada
 *   PULSO: só fora da atmosfera; acelera até ~5e5 m/s com freio por
 *     proximidade de corpos (cai do pulso perto do planeta)
 *
 * Pouso/decolagem assistidos e nave pousada são estados do mesmo
 * controlador (auto-piloto). Tudo integrado em double no passo fixo.
 */
import * as THREE from 'three';
import { SHIP_POINTS } from './model.js';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _a = new THREE.Vector3();
const _w = new THREE.Vector3();

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class ShipController {
  /** @param ship  estado compartilhado (index.js) */
  constructor(ship) {
    this.name = 'ship';
    this.ship = ship;
    this.angVel = new THREE.Vector3(); // rad/s no referencial da nave (pitch x, yaw y, roll z)
    this.throttle = 0.45; // 0..1
    this.command = null; // bots/testes: { x, y, z, boost }
    this.pulseTimer = 0;
  }

  enter(p, ctx) {
    p.cockpitEye.copy(SHIP_POINTS.eye);
  }

  /** Ambiente na posição atual: ar, gravidade, topo da atmosfera. */
  env(p, ctx) {
    const planet = p.planet;
    const R = planet?.radius ?? 1e5;
    const atm = ctx.services.sky?.atmosphere || ctx.services.universe?.currentPlanet?.atmosphere || null;
    const top = atm ? Math.max(1000, atm.radius - R) : 0;
    const H = atm?.rayleighHeight ? atm.rayleighHeight * 1.6 : R * 0.04;
    const alt = p.altitude;
    let air = 0;
    if (atm) air = Math.exp(-Math.max(0, alt) / H) * smooth(top, top * 0.85, alt);
    const r = R + alt + (p.groundHeight || 0);
    const g = (planet?.gravity ?? 9.8) * Math.pow(R / Math.max(R, r), 2);
    return { air, top, g, R, hasAtm: !!atm };
  }

  update(dt, p, ctx) {
    const S = this.ship;
    const input = ctx.input;
    const q = p.quaternion;
    p.updateSurface();
    const E = this.env(p, ctx);
    S.air = E.air;
    S.atmTop = E.top;

    // auto-piloto (pouso, decolagem, pousada)
    if (S.auto) {
      this.autopilot(dt, p, ctx, E);
      return;
    }

    // ── comandos
    let look = { yaw: 0, pitch: 0 };
    if (p.lookEnabled) look = input.consumeLook();
    let roll = 0;
    let cz = 0;
    let cx = 0;
    let cy = 0;
    let boost = false;
    if (this.command) {
      cz = this.command.z || 0;
      cx = this.command.x || 0;
      cy = this.command.y || 0;
      roll = this.command.roll || 0;
      boost = !!this.command.boost;
      if (this.command.yaw) look.yaw += this.command.yaw * dt;
      if (this.command.pitch) look.pitch += this.command.pitch * dt;
    } else if (p.moveEnabled) {
      cz = (input.action('forward') ? 1 : 0) - (input.action('back') ? 1 : 0);
      cx = (input.action('right') ? 1 : 0) - (input.action('left') ? 1 : 0);
      cy = (input.action('jump') ? 1 : 0) - (input.action('descend') ? 1 : 0);
      roll = (input.action('rollLeft') ? 1 : 0) - (input.action('rollRight') ? 1 : 0);
      boost = input.action('sprint');
      if (input.pressed('pulse')) S.requestPulse = !S.pulsing;
    }
    const air = E.air;

    // ── rotação: taxa angular desejada a partir do mouse (deltas por passo)
    const maxPitch = 1.5 - 0.4 * air;
    const maxYaw = 1.1 - 0.3 * air;
    const pulseK = S.pulsing ? 0.25 : 1;
    const tx = clamp(look.pitch / dt, -maxPitch, maxPitch) * pulseK;
    let ty = clamp(look.yaw / dt, -maxYaw, maxYaw) * pulseK;
    let tz = roll * (2.2 - 0.6 * air);
    // curva coordenada: no ar a guinada puxa a inclinação lateral
    _f.set(0, 0, -1).applyQuaternion(q);
    _u.set(0, 1, 0).applyQuaternion(q);
    _r.set(1, 0, 0).applyQuaternion(q);
    const up = p.up;
    const bankNow = Math.atan2(-_r.dot(up), _u.dot(up)); // + = asa direita baixa? (rolagem à direita)
    if (!roll && air > 0.02 && Math.abs(_f.dot(up)) < 0.97) {
      const bankTarget = clamp(-ty * 0.75, -1.0, 1.0);
      tz += (bankNow - bankTarget) * 2.6 * smooth(0.02, 0.3, air);
    }
    const k = 1 - Math.exp(-dt * (6 + 4 * air));
    this.angVel.x += (tx - this.angVel.x) * k;
    this.angVel.y += (ty - this.angVel.y) * k;
    this.angVel.z += (tz - this.angVel.z) * k;
    q.multiply(_q.setFromAxisAngle(X, this.angVel.x * dt));
    q.multiply(_q.setFromAxisAngle(Y, this.angVel.y * dt));
    q.multiply(_q.setFromAxisAngle(Z, this.angVel.z * dt));
    // no ar, parte da guinada vira giro em torno do up local (curva plana)
    if (air > 0.02) q.premultiply(_q.setFromAxisAngle(up, this.angVel.y * dt * 0.35 * air));
    q.normalize();
    S.bank = bankNow;

    // ── acelerador
    if (cz > 0) this.throttle = Math.min(1, this.throttle + dt * 0.7);
    else if (cz < 0) this.throttle = Math.max(0, this.throttle - dt * 0.9);
    else this.throttle += (0.45 - this.throttle) * (1 - Math.exp(-dt * 0.6)) * (this.throttle > 0.45 ? 1 : 0.3);
    S.throttle = this.throttle;
    S.boost = boost;

    // ── pulso
    if (S.requestPulse !== undefined) {
      const can = E.air < 0.002 && p.altitude > E.top * 1.2 + 2000;
      S.pulsing = S.requestPulse && can;
      S.requestPulse = undefined;
      ctx.bus.emit('ship:pulse', { on: S.pulsing });
    }
    if (S.pulsing && (E.air > 0.002 || p.altitude < E.top + 1500)) {
      S.pulsing = false;
      ctx.bus.emit('ship:pulse', { on: false });
    }

    // ── velocidade-alvo
    const vAirMin = 35;
    const vAirCruise = 150;
    const vAirMax = 330;
    const vSpaceCruise = 900;
    const vSpaceMax = 2600;
    const thr = this.throttle;
    const lerp = (a, b, t) => a + (b - a) * t;
    let vt;
    const airMix = smooth(0, 0.25, air);
    const vAir = thr < 0.45 ? lerp(vAirMin, vAirCruise, thr / 0.45) : lerp(vAirCruise, vAirMax, (thr - 0.45) / 0.55);
    const vSp = thr < 0.45 ? lerp(0, vSpaceCruise, thr / 0.45) : lerp(vSpaceCruise, vSpaceMax, (thr - 0.45) / 0.55);
    vt = lerp(vSp, vAir, airMix) * (boost ? 1.9 : 1);
    if (S.pulsing) {
      this.pulseTimer += dt;
      const pulseV = ctx.services.universe?.pulseSpeed ?? 5e5;
      // freio de proximidade: limita pelo afastamento da atmosfera
      const vProx = Math.max(vSpaceMax, (p.altitude - E.top) * 0.6);
      vt = Math.min(pulseV, vProx) * smooth(0, 3.5, this.pulseTimer) + vSpaceMax * (1 - smooth(0, 3.5, this.pulseTimer));
    } else this.pulseTimer = 0;
    // perto do solo nunca acima do que dá para frear (freio de proximidade)
    const vGround = 40 + Math.max(0, p.altitude) * 1.8;
    vt = Math.min(vt, Math.max(vGround, 60));

    // ── forças
    const v = p.velocity;
    _f.set(0, 0, -1).applyQuaternion(q);
    _u.set(0, 1, 0).applyQuaternion(q);
    _r.set(1, 0, 0).applyQuaternion(q);
    const vf = v.dot(_f);
    _a.set(0, 0, 0);
    // empuxo / freio ao longo do nariz
    const accMax = S.pulsing ? 2e5 : (boost ? 90 : 55) + 140 * (1 - airMix);
    // frenagem no ar é limitada (reentrada longa e quente); no vácuo, retrofoguetes
    const decMax = S.pulsing ? 3e5 : 30 + 180 * (1 - airMix);
    let dv = vt - vf;
    if (!S.pulsing && dv < 0 && vf > 1000) dv = Math.max(dv, -1.5 * vf); // sai do pulso freando forte
    _a.addScaledVector(_f, clamp(dv * 1.6, -decMax, accMax));
    // translação direta (A/D lateral, Espaço/Ctrl vertical): propulsores RCS
    _a.addScaledVector(_r, cx * 18);
    _a.addScaledVector(_u, cy * 18);
    // amortecimento lateral (assistência de voo / sustentação lateral da asa)
    _v.copy(v).addScaledVector(_f, -vf);
    const latK = S.pulsing ? 6 : 2.8 * airMix + 0.35 * (1 - airMix);
    _a.addScaledVector(_v, -latK);
    // gravidade e sustentação
    const gEff = E.g * airMix; // no vácuo a assistência anula a queda (arcade)
    _a.addScaledVector(up, -gEff);
    const lift = gEff * clamp((vf - 15) / 55, 0, 1.0);
    _a.addScaledVector(up, lift);
    // arrasto quadrático (só no ar)
    const sp = v.length();
    if (sp > 1 && air > 0) _a.addScaledVector(v, -0.0004 * air * sp);
    v.addScaledVector(_a, dt);

    // ── calor de reentrada: v alta em ar rarefeito
    const heatT = clamp(((sp - 420) / 900) * smooth(0, 0.02, air) * (1 - smooth(0.25, 0.6, air)) * 1.4, 0, 1);
    S.heat += (heatT - S.heat) * (1 - Math.exp(-dt * 1.5));

    p.worldPos.addScaledVector(v, dt);

    // ── solo: nunca atravessa; impacto forte arranha o escudo
    const s = p.updateSurface();
    const minAlt = 2.4;
    if (s.altitude < minAlt) {
      const c = p.center;
      p.worldPos.set(c.x, c.y, c.z).addScaledVector(s.up, s.groundR + minAlt);
      const vn = v.dot(s.up);
      if (vn < 0) {
        if (vn < -18) ctx.bus.emit('ship:impact', { speed: -vn });
        v.addScaledVector(s.up, -vn * 1.3);
      }
      p.updateSurface();
    }
    p.grounded = false;

    // ── modo do jogador pelo ar: 'space' acima da atmosfera
    const wantSpace = E.air < 0.001 && p.altitude > E.top;
    if (wantSpace && p.mode === 'ship') p.setMode('space');
    else if (!wantSpace && p.mode === 'space' && p.altitude < E.top * 0.98) p.setMode('ship');
    S.state = S.pulsing ? 'pulse' : p.mode === 'space' ? 'space' : 'flying';
  }

  // ────────────────────────────────────────────── auto-piloto
  autopilot(dt, p, ctx, E) {
    const S = this.ship;
    const A = S.auto;
    const q = p.quaternion;
    const v = p.velocity;
    const up = p.up;
    const input = ctx.input;
    A.t += dt;
    if (p.lookEnabled) input.consumeLook();
    const planet = p.planet;
    const n = planet?.normalAt ? planet.normalAt(up, _w) : _w.copy(up);
    // alvo de orientação: nivelado sobre o terreno (mistura normal/up), mesmo rumo
    _f.set(0, 0, -1).applyQuaternion(q);
    const lvlUp = _u.copy(up).lerp(n, 0.5).normalize();
    _f.addScaledVector(lvlUp, -_f.dot(lvlUp));
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1).applyQuaternion(q).cross(lvlUp).cross(lvlUp).negate();
    _f.normalize();
    const m = new THREE.Matrix4().makeBasis(_r.crossVectors(_f, lvlUp).normalize(), lvlUp, _f.clone().negate());
    _q2.setFromRotationMatrix(m);
    const gh = SHIP_POINTS.gearHeight;
    if (A.kind === 'landing') {
      q.slerp(_q2, 1 - Math.exp(-dt * 1.8));
      // horizontal → 0, vertical: desce proporcional à altura
      const vUp = v.dot(up);
      _v.copy(v).addScaledVector(up, -vUp).multiplyScalar(Math.exp(-dt * 1.4));
      const alt = p.altitude - gh;
      const target = -clamp(alt * 0.55, 1.2, 38);
      const nv = vUp + (target - vUp) * (1 - Math.exp(-dt * 2.5));
      v.copy(_v).addScaledVector(up, nv);
      p.worldPos.addScaledVector(v, dt);
      const s = p.updateSurface();
      S.throttle = 0.25 + 0.2 * clamp(alt / 40, 0, 1);
      S.gearTarget = alt < 90 ? 1 : 0;
      if (s.altitude <= gh + 0.02) {
        const c = p.center;
        p.worldPos.set(c.x, c.y, c.z).addScaledVector(s.up, s.groundR + gh);
        v.set(0, 0, 0);
        S.auto = { kind: 'landed', t: 0 };
        S.state = 'landed';
        S.gearTarget = 1;
        ctx.bus.emit('ship:land', { worldPos: p.worldPos.clone() });
        A.resolve?.();
      }
      S.state = 'flying';
      if (S.auto.kind === 'landed') S.state = 'landed';
    } else if (A.kind === 'landed') {
      q.slerp(_q2, 1 - Math.exp(-dt * 6));
      v.set(0, 0, 0);
      const s = p.updateSurface();
      const c = p.center;
      p.worldPos.set(c.x, c.y, c.z).addScaledVector(s.up, s.groundR + gh);
      p.updateSurface();
      S.throttle = 0;
      S.gearTarget = 1;
      S.state = 'landed';
      if (p.moveEnabled && !this.command && (input.pressed('jump') || input.pressed('forward'))) S.api.takeoff();
      if (this.command && (this.command.y > 0 || this.command.z > 0)) S.api.takeoff();
    } else if (A.kind === 'takeoff') {
      const alt = p.altitude - gh;
      const vUp = v.dot(up);
      const target = alt < 30 ? 9 + alt * 0.3 : 4;
      v.addScaledVector(up, (target - vUp) * (1 - Math.exp(-dt * 2)));
      // ganha velocidade para frente depois de sair do solo
      _f.set(0, 0, -1).applyQuaternion(q);
      if (alt > 12) v.addScaledVector(_f, dt * 22);
      p.worldPos.addScaledVector(v, dt);
      p.updateSurface();
      S.throttle = 0.7;
      S.gearTarget = alt > 6 ? 0 : 1;
      S.state = 'flying';
      if (alt > 32) {
        this.throttle = 0.4;
        S.auto = null;
        ctx.bus.emit('ship:takeoff', {});
        A.resolve?.();
      }
    }
    p.grounded = false;
  }

  /** Câmera de 3ª pessoa cinematográfica (index.js decide se usa). */
  camera(p, ctx, cam) {
    this.ship.cameraHook?.(p, ctx, cam);
  }
}
