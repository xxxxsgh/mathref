// Modelo de voo 6DOF da nave do jogador.
//
// Estado no referencial atual (frames.js): pos, vel, quat, angVel (taxas nos
// eixos da nave: x = arfagem, y = guinada, z = rolagem — convenção de
// controle: + = nariz para cima / para a direita / asa direita para baixo).
// Nave: frente −Z, cima +Y, direita +X.
//
// • Acoplado (assistência): o computador de voo comanda VELOCIDADE — o
//   acelerador é a velocidade desejada à frente, A/D e Espaço/C strafes. Ele
//   compensa gravidade e arrasto e respeita os limites de cada propulsor.
// • Desacoplado: os comandos viram EMPUXO puro; a nave mantém a inércia.
// • Boost (pós-combustor): mais aceleração e velocidade, gasta combustível
//   de boost e esquenta.
// • Atmosfera: arrasto quadrático (área efetiva depende do ângulo com o
//   vento), sustentação das asas, estabilidade de flecha (o nariz tende a
//   seguir o vento), gravidade do corpo; reentrada = fluxo de calor ∝ ρ, v.
// • Chão: pouso com trem (inclinação, velocidade vertical/horizontal), toque
//   suave, impacto com dano; plataformas/estações via ctx.collision.
// • Energia: 6 "pips" entre SIS (escudos), MOT (motor) e ARM (armas).
import * as THREE from 'three/webgpu';
import { Frame, rebase } from './frames.js';
import { classParams, K, POWER_PRESETS } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _w = new THREE.Vector3(), _n = new THREE.Vector3(), _g = new THREE.Vector3(), _a = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const approach = (v, t, rate) => v + clamp(t - v, -rate, rate);

export class FlightModel {
  constructor(ctx, classId = 'fighter') {
    this.ctx = ctx;
    this.frame = Frame.world();
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion(); this.angVel = new THREE.Vector3();
    this.prevPos = new THREE.Vector3(); this.prevQuat = new THREE.Quaternion();
    this.accelLocal = new THREE.Vector3();   // aceleração sentida (eixos da nave) — câmera/força G
    this.thrustLocal = new THREE.Vector3();  // empurro comandado normalizado (visual dos propulsores)
    this.setClass(classId);
    // estado dos sistemas
    this.coupled = true;
    this.throttle = 0.0;           // −1..1 (negativo = ré)
    this.boosting = false; this.boostFuel = 1; this.boostCool = 0; this.overheat = false;
    this.heat = 0.08;
    this.pips = { sys: 2, eng: 2, wep: 2 }; this.presetIdx = 0;
    this.shields = { f: 1, b: 1, l: 1, r: 1 }; this.hull = 1; this.lastHit = 99;
    this.fuel = 1; this.qfuel = 1;
    this.gear = false; this.gearT = 0;
    this.landed = false; this.docked = false; this.landSettle = 0;
    this.groundUp = new THREE.Vector3(0, 1, 0);
    this.mode = 'scm';             // scm | cruise | quantum | jump | landed | docked
    this.cruise = { on: false, spool: 0, speed: 0 };
    // ambiente (atualizado a cada passo)
    this.env = {
      body: null, alt: Infinity, altBody: Infinity, ground: Infinity, normal: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 1, 0),
      density: 0, inAtmo: false, atmoTop: 0, gravity: 0, g: new THREE.Vector3(), slope: 0, material: null, water: false,
      nearStation: null, stationDist: Infinity, cruiseAlt: Infinity,
    };
    this.reentry = 0; this.dynPressure = 0; this.gforce = 1; this.stall = 0;
    this.velCommand = null;        // autopiloto: velocidade desejada (frame) ou null
    this.headingCommand = null;    // autopiloto: {fwd, up} (frame) ou null
    this.ownShapes = [];
    this.asteroids = []; this.astTimer = 0;
    this.impact = 0;               // última pancada (0..1) para câmera/áudio
    this.events = [];              // eventos de borda para o sistema emitir
    this.time = 0;
  }

  setClass(id) {
    this.classId = id; this.P = classParams(id);
  }

  // ─── referenciais ──────────────────────────────────────────────────────
  setFrame(f, t) {
    if (this.frame.same(f)) return;
    rebase(this, this.frame, f, t);
    this.frame = f;
  }
  worldPos(t, out = new THREE.Vector3(), alpha = 1) {
    _v.copy(this.prevPos).lerp(this.pos, alpha);
    return this.frame.posToWorld(_v, t, out);
  }
  worldQuat(t, out = new THREE.Quaternion(), alpha = 1) {
    _q.copy(this.prevQuat).slerp(this.quat, alpha);
    return this.frame.quatToWorld(_q, t, out);
  }
  worldVel(t, out = new THREE.Vector3()) { return this.frame.dirToWorld(this.vel, t, out); }
  get speed() { return this.vel.length(); }
  fwd(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }

  /** Teleporta para pose de mundo (zera histórico). */
  placeWorld(pos, quat, vel = null, t = this.ctx.time.world) {
    this.frame = Frame.world();
    this.pos.copy(pos); this.prevPos.copy(pos);
    this.quat.copy(quat); this.prevQuat.copy(quat);
    this.vel.copy(vel || _v.set(0, 0, 0)); this.angVel.set(0, 0, 0);
    this.landed = false; this.docked = false;
    this.updateFrame(t, true);
  }

  /** Escolhe o referencial: corpo cuja SOI contém a nave (com histerese). */
  updateFrame(t, force = false) {
    if (this.landed || this.docked || this.mode === 'quantum' || this.mode === 'jump') return;
    if (this.frame.kind === 'anchor') return;
    const sys = this.ctx.universe.system;
    if (!sys) return;
    const wp = this.frame.posToWorld(this.pos, t, _w);
    const cur = this.frame.body;
    if (cur) {
      if (!sys.bodies.includes(cur) || wp.distanceTo(cur.pos) > cur.soi * (1 + K.SOI_HYST)) {
        this.setFrame(Frame.world(), t);
      } else return;
    }
    let best = null, bd = Infinity;
    for (const b of sys.bodies) {
      const d = wp.distanceTo(b.pos);
      if (d < b.soi * (1 - K.SOI_HYST) && d - b.radius < bd) { bd = d - b.radius; best = b; }
    }
    if (best) this.setFrame(Frame.body(best), t);
    else if (force && this.frame.kind !== 'world') this.setFrame(Frame.world(), t);
  }

  // ─── ambiente ──────────────────────────────────────────────────────────
  sampleEnv(t) {
    const E = this.env, ctx = this.ctx;
    const sys = ctx.universe.system;
    const pl = ctx.services.planets;
    E.body = this.frame.body; E.water = false; E.material = null;
    E.density = 0; E.inAtmo = false; E.gravity = 0; E.g.set(0, 0, 0);
    E.alt = Infinity; E.ground = Infinity; E.altBody = Infinity;
    const b = E.body;
    if (b) {
      const r = this.pos.length();
      const view = pl?.view?.(b);
      this.sampleGround();
      E.material = b.type;
      // gravidade (sempre para o centro)
      E.gravity = (b.gravity || 9.2) * Math.min(1, (b.radius / Math.max(r, b.radius)) ** 2);
      E.g.copy(E.up).multiplyScalar(-E.gravity);
      // atmosfera
      const A = view?.A;
      if (A) {
        E.atmoTop = A.top - b.radius;
        if (r < A.top) { E.density = Math.min(10, Math.exp(-(r - A.R) / A.HR)) * (b.atmosphere?.density ?? 1); E.inAtmo = true; }
      } else if (b.atmosphere) {
        const HR = b.radius * (b.kind === 'gas_giant' ? 0.005 : 0.08);
        E.atmoTop = HR * 6.5;
        if (E.altBody < E.atmoTop) { E.density = Math.exp(-Math.max(0, E.altBody) / HR) * (b.atmosphere.density ?? 1); E.inAtmo = true; }
      } else E.atmoTop = 0;
    }
    // altitude de cruzeiro: distância à coisa mais próxima (corpo ou estação)
    const wp = this.frame.posToWorld(this.pos, t, _w);
    let ca = Infinity; E.nearStation = null; E.stationDist = Infinity;
    if (sys) {
      for (const bb of sys.bodies) {
        const top = bb.atmosphere ? bb.radius * (bb.kind === 'gas_giant' ? 0.05 : 0.52) : bb.radius * 0.03;
        ca = Math.min(ca, wp.distanceTo(bb.pos) - bb.radius - top);
      }
      for (const st of sys.stations) {
        const d = wp.distanceTo(st.pos);
        if (d < E.stationDist) { E.stationDist = d; E.nearStation = st; }
        ca = Math.min(ca, d - 2500);
      }
    }
    E.cruiseAlt = ca;
  }


  /** Chão sob a nave (referencial do corpo): up, ground (m acima), normal, slope, water. */
  sampleGround() {
    const E = this.env, b = E.body;
    if (!b) return;
    const pl = this.ctx.services.planets;
    const r = this.pos.length();
    E.up.copy(this.pos).divideScalar(r || 1);
    let h = 0, sea = null;
    const view = pl?.view?.(b);
    if (view?.terrain) {
      try { h = view.terrain.height(E.up.x, E.up.y, E.up.z); sea = view.terrain.hasSea ? 0 : null; } catch { h = 0; }
    }
    const groundH = sea !== null ? Math.max(h, sea) : h;
    E.water = sea !== null && h < sea;
    E.altBody = r - b.radius;
    E.ground = r - b.radius - groundH;
    E.alt = E.ground;
    if (E.ground < 600 && view?.terrain && !E.water && pl?.normalAtLocal) {
      try { pl.normalAtLocal(b, E.up, clamp(E.ground * 0.04 + 1.2, 1.2, 8), E.normal); } catch { E.normal.copy(E.up); }
    } else E.normal.copy(E.up);
    E.slope = 1 - E.normal.dot(E.up);
    if (b.kind === 'gas_giant') E.ground = E.alt = E.altBody + b.radius * 0.02;
  }

  // ─── energia / calor / escudos ─────────────────────────────────────────
  get engF() { return 0.82 + (this.pips.eng / K.PIP_MAX) * 0.33; }
  get energy() { return { shield: this.pips.sys / K.PIP_MAX, engine: this.pips.eng / K.PIP_MAX, weapons: this.pips.wep / K.PIP_MAX }; }
  /** Prioriza um subsistema (como no Elite): +1 pip nele, tirando dos outros. */
  bumpPip(key) {
    const p = this.pips, others = Object.keys(p).filter((k) => k !== key);
    if (p[key] >= K.PIP_MAX) return;
    let take = Math.min(1, K.PIP_MAX - p[key]);
    p[key] += take;
    // tira dos outros proporcionalmente, sem negativos
    for (let i = 0; i < 8 && take > 1e-6; i++) {
      const pool = others.filter((k) => p[k] > 0);
      if (!pool.length) break;
      const each = take / pool.length;
      for (const k of pool) { const d = Math.min(each, p[k]); p[k] -= d; take -= d; }
    }
    this.normalizePips();
  }
  setPips(o) { Object.assign(this.pips, o); this.normalizePips(); }
  normalizePips() {
    const p = this.pips;
    for (const k in p) p[k] = clamp(Math.round(p[k] * 2) / 2, 0, K.PIP_MAX);
    let sum = p.sys + p.eng + p.wep;
    // garante soma = 6 (ajusta o maior/menor)
    const keys = ['sys', 'eng', 'wep'];
    for (let i = 0; i < 12 && Math.abs(sum - K.PIPS_TOTAL) > 1e-6; i++) {
      const d = K.PIPS_TOTAL - sum;
      const k = d > 0 ? keys.filter((x) => p[x] < K.PIP_MAX).sort((a, b) => p[a] - p[b])[0] : keys.filter((x) => p[x] > 0).sort((a, b) => p[b] - p[a])[0];
      if (!k) break;
      const step = Math.sign(d) * Math.min(0.5, Math.abs(d));
      p[k] = clamp(p[k] + step, 0, K.PIP_MAX);
      sum = p.sys + p.eng + p.wep;
    }
  }
  applyPreset(i) {
    this.presetIdx = ((i % POWER_PRESETS.length) + POWER_PRESETS.length) % POWER_PRESETS.length;
    const pr = POWER_PRESETS[this.presetIdx];
    this.setPips({ sys: pr.sys, eng: pr.eng, wep: pr.wep });
    return pr;
  }

  /** Dano recebido (combate). posWorld opcional decide o quadrante do escudo. */
  hit(damage, posWorld = null, t = this.ctx.time.world) {
    let q = 'f';
    if (posWorld) {
      this.frame.posToLocal(posWorld, t, _v).sub(this.pos).applyQuaternion(_qi.copy(this.quat).invert());
      q = Math.abs(_v.z) > Math.abs(_v.x) ? (_v.z < 0 ? 'f' : 'b') : (_v.x < 0 ? 'l' : 'r');
    }
    const P = this.P;
    let dmg = damage * 0.01 / (P.shieldHp || 1);
    const s = this.shields[q];
    const absorbed = Math.min(s, dmg);
    this.shields[q] = s - absorbed;
    dmg -= absorbed;
    const shield = absorbed > 0 && dmg <= 0;
    if (dmg > 0) this.hull = Math.max(0, this.hull - dmg * (P.shieldHp || 1) / (P.hullHp || 1));
    this.lastHit = 0;
    return { shield, quadrant: q };
  }

  stepSystems(dt, ctl) {
    const P = this.P, E = this.env;
    // boost
    const wantBoost = ctl.boost && !this.overheat && this.boostFuel > 0.02 && !this.landed && this.mode === 'scm';
    this.boosting = wantBoost;
    if (wantBoost) { this.boostFuel = Math.max(0, this.boostFuel - P.boost.drain * dt); this.boostCool = P.boost.delay; }
    else {
      this.boostCool = Math.max(0, this.boostCool - dt);
      if (this.boostCool <= 0) this.boostFuel = Math.min(1, this.boostFuel + P.boost.regen * dt * (0.6 + this.pips.eng / K.PIP_MAX * 0.8));
    }
    // calor: boost, reentrada, armas (combate soma via addHeat), sol/ambiente quente
    let heatIn = (wantBoost ? P.boost.heat : 0) + this.reentry * 0.16 + (this.mode === 'cruise' ? 0.006 : 0);
    const hz = E.body?.hazard?.temp ?? 0;
    if (E.inAtmo && hz > 0.3) heatIn += hz * 0.01 * Math.min(1, E.density * 2);
    const cool = P.heatDissip * (E.inAtmo ? 1 + Math.min(1, E.density) * 0.6 : 1) * (hz < -0.3 && E.inAtmo ? 1.4 : 1);
    this.heat = clamp(this.heat + (heatIn - cool * (0.35 + this.heat)) * dt, 0, 1.2);
    if (this.heat >= 1) this.overheat = true;
    if (this.overheat && this.heat < 0.62) this.overheat = false;
    // escudos regeneram (proporcional aos pips de SIS) 3 s após o último impacto
    this.lastHit += dt;
    if (this.lastHit > 3) {
      const rate = 0.045 * (0.35 + this.pips.sys / K.PIP_MAX * 1.3) * dt;
      for (const k in this.shields) this.shields[k] = Math.min(1, this.shields[k] + rate);
    }
    // reentrada danifica escudo inferior/frontal se extrema
    if (this.reentry > 0.75) this.shields.f = Math.max(0, this.shields.f - (this.reentry - 0.75) * 0.05 * dt);
    // trem
    const gt = this.gear ? 1 : 0;
    this.gearT = approach(this.gearT, gt, dt / 2.4);
  }

  // ─── passo principal ───────────────────────────────────────────────────
  /** ctl: { pitch, yaw, roll (−1..1), strafeX, strafeY, throttle (−1..1), boost } */
  step(dt, ctl, t) {
    this.time += dt;
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    this.events.length = 0;
    this.updateFrame(t);
    this.sampleEnv(t);
    this.stepSystems(dt, ctl);
    this.impact = Math.max(0, this.impact - dt * 2);
    if (this.mode === 'quantum' || this.mode === 'jump') return; // travel.js move a nave
    if (this.landed || this.docked) { this.stepLanded(dt, ctl, t); return; }
    this.stepRotation(dt, ctl);
    if (this.cruise.on) this.stepCruise(dt, ctl, t);
    else this.stepLinear(dt, ctl);
    this.collide(dt, t);
    this.computeReentry(dt);
  }

  stepRotation(dt, ctl) {
    const P = this.P, E = this.env;
    let { pitch, yaw, roll } = ctl;
    // autopiloto de rumo (quântico alinhando, docking, pouso assistido)
    if (this.headingCommand) {
      const hc = this.headingCommand;
      const r = this.rateToward(hc.fwd, hc.up, hc.gain ?? 2.2);
      const w = hc.weight ?? 1;
      pitch = pitch * (1 - w) + r.x * w; yaw = yaw * (1 - w) + r.y * w; roll = roll * (1 - w) + r.z * w;
    }
    // pouso assistido: com trem baixado perto do chão, nivela as asas com o terreno
    if (this.coupled && this.gearT > 0.5 && E.body && E.ground < K.LAND_ASSIST_ALT && !this.headingCommand) {
      const k = (1 - E.ground / K.LAND_ASSIST_ALT) * 0.9;
      const fwd = this.fwd(_v3);
      const flat = fwd.addScaledVector(E.normal, -fwd.dot(E.normal));
      if (flat.lengthSq() > 1e-4) {
        const r = this.rateToward(flat.normalize(), E.normal, 1.6);
        const free = Math.abs(pitch) < 0.05 ? 1 : 0.35;
        pitch += r.x * k * free; roll = roll * (1 - k * 0.8) + r.z * k;
      }
    }
    // cruzeiro: manobra mais lenta
    const rk = this.cruise.on ? 0.55 : 1;
    // controle mais "mole" com estol/ar rarefeito em velocidade alta no ar denso
    const tgt = _v.set(clamp(pitch, -1, 1) * P.rates.pitch * rk, clamp(yaw, -1, 1) * P.rates.yaw * rk, clamp(roll, -1, 1) * P.rates.roll * rk);
    const av = this.angVel;
    av.x = approach(av.x, tgt.x, P.angAccel.pitch * dt);
    av.y = approach(av.y, tgt.y, P.angAccel.yaw * dt);
    av.z = approach(av.z, tgt.z, P.angAccel.roll * dt);
    // estabilidade aerodinâmica (o nariz procura o vento relativo)
    if (E.inAtmo && this.speed > 30) {
      const q = 0.5 * E.density * this.speed * this.speed * K.RHO0;
      const vs = _v2.copy(this.vel).applyQuaternion(_qi.copy(this.quat).invert()).normalize();
      const s = Math.min(3, q * P.aero.stability * 1e-4);
      av.x += vs.y * s * dt * 6; // vento vindo de cima → nariz sobe? (vs.y>0: nave subindo → nariz sobe)
      av.y += vs.x * s * dt * 6;
    }
    // integra: ω no corpo = (pitch, −yaw, −roll)
    _v.set(av.x, -av.y, -av.z);
    const ang = _v.length() * dt;
    if (ang > 1e-9) { _q.setFromAxisAngle(_v.normalize(), ang); this.quat.multiply(_q).normalize(); }
  }

  /** Taxas de controle (−1..1) para levar a frente/cima da nave até fwd/up. */
  rateToward(fwd, up, gain = 2) {
    const inv = _qi.copy(this.quat).invert();
    const f = _v4.copy(fwd).applyQuaternion(inv);
    const out = { x: 0, y: 0, z: 0 };
    // erro de arfagem (nariz para cima = +) e guinada (+ = direita)
    out.x = clamp(Math.atan2(f.y, -f.z) * gain, -1, 1);
    out.y = clamp(Math.atan2(f.x, -f.z) * gain, -1, 1);
    if (f.z > 0) { out.x = f.y >= 0 ? 1 : -1; out.y = f.x >= 0 ? 1 : -1; }
    if (up) {
      const u = _v2.copy(up).applyQuaternion(inv);
      // rolagem: + = asa direita para baixo; quer u alinhado com +Y no plano XY
      out.z = clamp(Math.atan2(u.x, u.y) * gain * 0.8, -1, 1);
    }
    return out;
  }

  stepLinear(dt, ctl) {
    const P = this.P, E = this.env;
    const inv = _qi.copy(this.quat).invert();
    const vS = _v.copy(this.vel).applyQuaternion(inv);            // velocidade nos eixos da nave
    const gS = _g.copy(E.g).applyQuaternion(inv);                 // gravidade nos eixos da nave
    const aeroW = this.aero(_a);                                  // aceleração aerodinâmica (frame)
    const aeroS = _v2.copy(aeroW).applyQuaternion(inv);
    const ef = this.engF;
    const boostK = this.boosting ? P.boostAccel : 1;
    const A = P.accel;
    const thrust = _v3;
    let vmax = (this.boosting ? P.boostMax : P.scm) * (0.9 + ef * 0.1);
    if (this.gearT > 0.3) vmax = Math.min(vmax, P.gearSpeed);
    const sub = E.inAtmo ? Math.min(1, E.density * 4) : 0; // 0 no vácuo → 1 no ar denso
    if (this.coupled) {
      // velocidade desejada (eixos da nave)
      let tgt;
      if (this.velCommand) tgt = _v4.copy(this.velCommand).applyQuaternion(inv);
      else {
        const th = ctl.throttle;
        const fwdV = th >= 0 ? -th * vmax : -th * vmax * P.reverse;
        tgt = _v4.set(ctl.strafeX * vmax * P.strafe, ctl.strafeY * vmax * P.strafe, fwdV);
        // boost com acelerador baixo ainda empurra para a frente
        if (this.boosting) tgt.z = Math.min(tgt.z, -vmax);
      }
      // responsividade do assistente
      const kResp = 2.4;
      thrust.copy(tgt).sub(vS).multiplyScalar(kResp).sub(gS).sub(aeroS);
      // freio aerodinâmico + retrofoguetes na reentrada (o computador segura a descida)
      const sp = vS.length();
      let brakeX = 1;
      if (E.inAtmo && sp > P.scm * 1.25) brakeX = 1 + clamp((sp - P.scm * 1.25) / 800, 0, 1) * (0.5 + this.densTerm() * 1.5);
      // GPWS: se for bater em < 3 s, prioridade a subir
      if (E.body && E.ground < 2500 && !this.velCommand) {
        const vUp = this.vel.dot(E.up);
        const tti = vUp < -1 ? E.ground / -vUp : Infinity;
        if (tti < 3.2 && this.gearT < 0.5) {
          const upS = _n.copy(E.up).applyQuaternion(inv);
          thrust.addScaledVector(upS, (3.2 - tti) * 40);
          this.events.push({ type: 'gpws', tti });
        }
      }
      thrust.x = clamp(thrust.x, -A.lat * ef * brakeX, A.lat * ef * brakeX);
      thrust.y = clamp(thrust.y, -A.vert * ef * brakeX, A.vert * ef * brakeX);
      thrust.z = clamp(thrust.z, -A.fwd * ef * boostK, A.back * ef * brakeX);
    } else {
      const th = ctl.throttle;
      thrust.set(ctl.strafeX * A.lat * ef, ctl.strafeY * A.vert * ef, th >= 0 ? -th * A.fwd * ef * boostK : -th * A.back * ef);
      if (this.boosting && th < 0.2) thrust.z = -A.fwd * ef * boostK;
    }
    this.thrustLocal.set(thrust.x / A.lat, thrust.y / A.vert, thrust.z < 0 ? thrust.z / A.fwd : thrust.z / A.back);
    // aceleração total no frame
    const acc = _w.copy(thrust).applyQuaternion(this.quat).add(aeroW).add(E.g);
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);
    // força G sentida (sem a gravidade)
    this.accelLocal.copy(thrust).add(aeroS);
    this.gforce = 1 + this.accelLocal.y / 9.81;
    this.dynPressure = 0.5 * K.RHO0 * E.density * this.vel.lengthSq();
    this.subsonic = sub;
  }

  /** Arrasto + sustentação (aceleração, referencial do frame). */
  aero(out) {
    out.set(0, 0, 0);
    const E = this.env, P = this.P;
    if (!E.inAtmo || E.density <= 1e-6) { this.stall = 0; return out; }
    const sp = this.vel.length();
    if (sp < 0.5) return out;
    const rho = K.RHO0 * E.density;
    const vhat = _n.copy(this.vel).divideScalar(sp);
    const fwd = this.fwd(_v4);
    const align = Math.abs(vhat.dot(fwd));
    const area = P.aero.area * (1 + 3.2 * (1 - align));
    const drag = 0.5 * rho * sp * sp * P.aero.cd * area / P.mass;
    out.addScaledVector(vhat, -drag);
    // sustentação (asas): ângulo de ataque no plano de simetria
    if (P.aero.wing > 0) {
      const up = this.up(_v2);
      const sinA = -vhat.dot(up);
      const cosA = vhat.dot(fwd);
      if (cosA > 0.2) {
        const alpha = Math.atan2(sinA, cosA);
        const stall = sstep(0.32, 0.55, Math.abs(alpha));
        this.stall = stall;
        const cl = P.aero.lift * Math.sin(2 * alpha) * (1 - stall * 0.7);
        const L = 0.5 * rho * sp * sp * cl * P.aero.wing / P.mass;
        const ldir = up.addScaledVector(vhat, -up.dot(vhat));
        if (ldir.lengthSq() > 1e-6) out.addScaledVector(ldir.normalize(), Math.min(L, 60));
      }
    }
    return out;
  }

  densTerm() {
    const d = this.env.density;
    if (d <= 0) return 0;
    return clamp((Math.log10(d) + 3.6) / 2.0, 0, 1);
  }

  computeReentry(dt) {
    const E = this.env;
    let I = 0;
    if (E.inAtmo) {
      const sp = this.speed;
      const sT = clamp((sp - K.REENTRY_V) / (K.REENTRY_FULL - K.REENTRY_V), 0, 1);
      I = Math.sqrt(sT) * Math.pow(this.densTerm(), 0.7);
    }
    // suaviza (o plasma não some num quadro)
    this.reentry += (I - this.reentry) * (1 - Math.exp(-dt * (I > this.reentry ? 5 : 2)));
    if (this.reentry < 0.002) this.reentry = 0;
  }

  // ─── cruzeiro (supercruzeiro sublight: velocidade ∝ altitude) ──────────
  setCruise(on) {
    if (on === this.cruise.on) return;
    this.cruise.on = on;
    this.cruise.spool = 0;
    this.cruise.speed = this.vel.length();
    this.mode = on ? 'cruise' : 'scm';
  }
  stepCruise(dt, ctl, t) {
    const P = this.P, E = this.env, C = this.cruise;
    C.spool = Math.min(1, C.spool + dt / P.cruise.spool);
    const alt = Math.max(0, E.cruiseAlt);
    const limit = clamp(alt * K.CRUISE_ALT_RATE, K.CRUISE_MIN, P.cruise.max) * (0.15 + 0.85 * clamp(Math.max(ctl.throttle, 0.05), 0, 1));
    const target = limit * C.spool;
    // aceleração proporcional à velocidade (sensação exponencial) com piso
    const acc = Math.max(400, C.speed * 1.1);
    C.speed = approach(C.speed, target, acc * dt);
    const fwd = this.fwd(_v);
    // velocidade sempre segue o nariz (com pequeno atraso)
    _v2.copy(fwd).multiplyScalar(C.speed);
    this.vel.lerp(_v2, 1 - Math.exp(-dt * 3));
    this.pos.addScaledVector(this.vel, dt);
    this.thrustLocal.set(0, 0, -0.6 - C.spool * 0.4);
    this.accelLocal.set(0, 0, 0);
    // saídas automáticas
    if (E.inAtmo || E.ground < 1200 || E.stationDist < 4000) {
      const keep = E.inAtmo ? Math.min(C.speed, 1650) : Math.min(C.speed, P.scm * 1.4);
      this.vel.setLength(Math.max(keep, 1));
      this.setCruise(false);
      this.events.push({ type: 'cruise:drop', reason: E.inAtmo ? 'atmo' : E.stationDist < 4000 ? 'station' : 'ground' });
    }
  }

  // ─── chão / colisões ───────────────────────────────────────────────────
  clearance() { return this.gearT > 0.85 ? (this.P.gearHeight ?? this.gearHeight ?? 1.8) : this.P.belly; }

  collide(dt, t) {
    const E = this.env, P = this.P;
    // terreno do corpo dominante (reamostrado na posição nova)
    this.sampleGround();
    if (E.body && E.body.kind !== 'gas_giant') {
      const clr = this.clearance();
      const pen = clr - E.ground;
      if (pen > 0) {
        const n = E.water ? E.up : E.normal;
        const vn = this.vel.dot(n);
        const vt = _v.copy(this.vel).addScaledVector(n, -vn);
        const upDot = this.up(_v2).dot(n);
        const gearOk = this.gearT > 0.85 && !E.water;
        const slopeOk = E.slope <= (1 - Math.cos(Math.asin(Math.min(1, P.maxSlope)))) + 1e-3 || E.slope < 0.09;
        if (gearOk && vn > -P.landMaxV && vt.length() < P.landMaxH && upDot > 0.82 && slopeOk) {
          this.pos.addScaledVector(n, pen);
          this.touchdown(n, Math.abs(vn), t);
          return;
        }
        // impacto
        this.pos.addScaledVector(n, pen);
        const hard = Math.max(0, -vn);
        this.vel.addScaledVector(n, -vn * (vn < 0 ? 1.28 : 0)).addScaledVector(vt, -Math.min(1, 0.6 * dt * 10));
        if (hard > 2.5) {
          const dmg = Math.max(0, hard - 5) * 0.011 * (gearOk ? 0.5 : 1);
          this.hull = Math.max(0, this.hull - dmg / (P.hullHp || 1));
          this.impact = Math.min(1, hard / 30);
          this.events.push({ type: 'impact', speed: hard, ground: true, water: E.water });
          if (hard > 75) this.events.push({ type: 'destroyed', cause: 'impacto' });
        }
        // o chão sempre vence a gravidade
        this.angVel.multiplyScalar(0.7);
      }
    }
    // formas (estações, plataformas, capitais) — mundo
    const col = this.ctx.collision;
    if (col.shapes.size > this.ownShapes.length) {
      for (const s of this.ownShapes) s.enabled = false;
      const wp = this.frame.posToWorld(this.pos, t, _w);
      const r = this.radius * 0.55;
      const res = col.resolveSphere(wp, r, null, this._res || (this._res = { pos: new THREE.Vector3(), hit: false, normal: new THREE.Vector3(), onGround: false }));
      for (const s of this.ownShapes) s.enabled = true;
      if (res.hit) {
        const nW = res.normal, nL = this.frame.dirToLocal(nW, t, _n);
        const vn = this.vel.dot(nL);
        this.frame.posToLocal(res.pos, t, this.pos);
        if (vn < 0) {
          this.vel.addScaledVector(nL, -vn * 1.3);
          if (-vn > 3) {
            this.hull = Math.max(0, this.hull - Math.max(0, -vn - 6) * 0.01 / (P.hullHp || 1));
            this.impact = Math.min(1, -vn / 30);
            this.events.push({ type: 'impact', speed: -vn, posWorld: res.pos.clone().addScaledVector(nW, -r) });
          }
        }
      }
    }
    // asteroides (deepspace)
    const space = this.ctx.services.space;
    if (space?.asteroidsNear) {
      this.astTimer -= dt;
      const wp = this.frame.posToWorld(this.pos, t, _w);
      if (this.astTimer <= 0) {
        this.astTimer = 0.25;
        try { if (space.beltDensityAt?.(wp) > 0 || this.asteroids.length) space.asteroidsNear(wp, 600 + this.speed * 0.6, this.asteroids); } catch { this.asteroids.length = 0; }
      }
      for (const a of this.asteroids) {
        const d = _v.copy(wp).sub(a.pos);
        const dist = d.length(), min = a.radius * 0.92 + this.radius * 0.5;
        if (dist < min && dist > 1e-6) {
          d.divideScalar(dist);
          wp.addScaledVector(d, min - dist);
          this.frame.posToLocal(wp, t, this.pos);
          const nL = this.frame.dirToLocal(d, t, _n);
          const vn = this.vel.dot(nL);
          if (vn < 0) {
            this.vel.addScaledVector(nL, -vn * 1.35);
            this.hull = Math.max(0, this.hull - Math.max(0, -vn - 5) * 0.012 / (P.hullHp || 1));
            this.impact = Math.min(1, -vn / 30);
            this.events.push({ type: 'impact', speed: -vn, posWorld: wp.clone().addScaledVector(d, -this.radius * 0.5), asteroid: a.id });
          }
        }
      }
    }
  }

  touchdown(n, vImpact, t) {
    this.landed = true; this.mode = 'landed';
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    this.groundUp.copy(n);
    this.landSettle = 1;
    this.impact = Math.min(1, vImpact / 8);
    this.events.push({ type: 'land', speed: vImpact });
  }

  /** Pousado: assenta suavemente (alinha com a normal) e espera decolagem. */
  stepLanded(dt, ctl, t) {
    const E = this.env;
    this.thrustLocal.set(0, 0, 0); this.accelLocal.set(0, 0, 0);
    if (this.landSettle > 0) {
      this.landSettle = Math.max(0, this.landSettle - dt / 0.8);
      // alinha o "cima" com a normal mantendo a proa
      const fwd = this.fwd(_v).addScaledVector(this.groundUp, -this.fwd(_v2).dot(this.groundUp));
      if (fwd.lengthSq() > 1e-6) {
        _m.lookAt(_v3.set(0, 0, 0), fwd.normalize(), this.groundUp);
        _q.setFromRotationMatrix(_m);
        this.quat.slerp(_q, 1 - Math.exp(-dt * 6));
      }
      // assenta na altura do trem
      if (E.body && this.frame.kind === 'body') {
        const err = this.clearance() - E.ground;
        this.pos.addScaledVector(E.up, err * (1 - Math.exp(-dt * 8)));
      }
    }
    if (this.docked) return;
    const wantUp = ctl.strafeY > 0.3 || ctl.takeoff;
    if (wantUp && this.landSettle <= 0.2) this.liftOff();
  }

  liftOff() {
    if (!this.landed) return;
    this.landed = false; this.docked = false; this.mode = 'scm';
    const n = this.groundUp;
    this.vel.copy(n).multiplyScalar(4.5);
    this.pos.addScaledVector(n, 0.3);
    this.events.push({ type: 'takeoff' });
  }

  get radius() { return this._radius || 8; }
  set radius(v) { this._radius = v; }
}
