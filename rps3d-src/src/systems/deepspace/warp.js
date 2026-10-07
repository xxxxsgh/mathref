// Efeitos de VIAGEM QUÂNTICA e SALTO entre sistemas.
//
// Quântico (≈2.000 km/s): o céu sofre aberração relativística (estrelas se
// juntam à frente, azuladas; atrás, avermelhadas e apagadas), a poeira vira
// fios longos e um túnel de luz fino envolve a nave, com um núcleo brilhante
// no ponto de fuga. Entrada com clarão e tremor; interdição corta seco.
//
// Salto: carga (o túnel acelera, a aberração cresce até β≈0,93, a cor puxa
// para o violeta), CLARÃO, e a nave entra no hiperespaço — um vórtice de
// nebulosa em espiral com relâmpagos, nas cores do destino; o céu some (e o
// novo céu é assado aos poucos, escondido). Na saída: clarão, as estrelas
// "freiam" de volta ao lugar e o túnel se desfaz.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, fract, floor, atan, cos, sin,
  positionLocal, positionWorld, uv,
} from 'three/tsl';
import { n3, hash13 } from './tsl.js';

const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, -1), _v = new THREE.Vector3();
const TUN_R = 38, TUN_LEN = 4200, TUN_BACK = 150;

export class Warp {
  constructor(ctx, state) {
    this.ctx = ctx; this.S = state;
    this.q = 0; this.qTarget = 0;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.dirFixed = null;
    this.jumpPhase = 'idle'; // idle | charge | hyper | exit
    this.jt = 0;
    this.j = 0;          // intensidade do salto 0..1
    this.hyper = 0;      // 0..1 dentro do hiperespaço
    this.beta = 0;
    this.chargeTime = 2.6;
    this.flashT = 0;

    const u = this.u = {
      time: uniform(0),
      q: uniform(0),
      hyper: uniform(0),
      charge: uniform(0),
      colA: uniform(new THREE.Color(0.35, 0.55, 1.0)),
      colB: uniform(new THREE.Color(0.75, 0.4, 1.0)),
      flash: uniform(0),
    };

    const geo = new THREE.CylinderGeometry(TUN_R, TUN_R * 0.55, TUN_LEN + TUN_BACK, 64, 24, true);
    geo.rotateX(Math.PI / 2); // eixo Y → Z
    geo.translate(0, 0, -(TUN_LEN - TUN_BACK) / 2); // de +BACK (atrás) até -LEN (frente)
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
    mat.colorNode = Fn(() => {
      const p = positionLocal;
      const ang = atan(p.y, p.x);
      const z = p.z.negate(); // distância à frente (m)
      const zf = z.div(TUN_LEN);
      const t = u.time;
      // ── modo quântico: fios de luz em faixas angulares ──
      const N = 90.0;
      const a01 = ang.div(Math.PI * 2).add(0.5);
      const idx = floor(a01.mul(N));
      const fr = fract(a01.mul(N)).sub(0.5);
      const hsh = hash13(vec3(idx, 3.1, 7.7));
      const hsh2 = hash13(vec3(idx, 11.3, 1.7));
      const across = exp(fr.mul(fr).mul(-90.0).div(hsh.mul(0.8).add(0.2)));
      const dash = smoothstep(0.35, 1.0, fract(z.mul(hsh2.mul(0.004).add(0.0015)).add(t.mul(hsh.mul(2.5).add(1.5))).add(hsh2.mul(9.0))));
      // cor por fio: azul elétrico → branco → violeta (aberração cromática)
      const lineCol = mix(mix(vec3(0.25, 0.5, 1.6), vec3(1.4, 1.5, 1.7), hsh2), vec3(0.9, 0.45, 1.6), step01(hsh2, 0.15).oneMinus().mul(0.0).add(smoothstep(0.85, 0.95, hsh2)));
      const bright = pow(hsh, 3.0).mul(3.0).add(0.25);
      const lines = lineCol.mul(across.mul(dash).mul(step01(hsh, 0.7)).mul(bright));
      // névoa azul que converge ao ponto de fuga + pulsos de distorção
      const pulse = exp(abs(fract(z.mul(0.0007).sub(t.mul(0.9))).sub(0.5)).mul(-14.0)).mul(0.35);
      const haze = mix(u.colA, vec3(0.3, 0.55, 1.2), 0.5).mul(pow(zf.clamp(0, 1), 1.6).mul(0.35).add(pulse.mul(zf.clamp(0, 1))));
      // bainha de energia: véus de plasma correndo pelas paredes do túnel
      const wp = vec3(cos(ang).mul(1.6), sin(ang).mul(1.6), z.mul(0.0019).sub(t.mul(2.4)));
      const wv = n3(wp).a;
      const wv2 = n3(wp.mul(2.2).add(vec3(1.3, 0, t.mul(-1.1)))).r;
      const veil = pow(wv, 4.0).mul(1.6).add(smoothstep(0.55, 0.8, wv2).mul(0.25));
      const veilCol = mix(vec3(0.18, 0.42, 1.3), vec3(0.75, 0.3, 1.4), smoothstep(0.4, 0.7, wv2));
      const sheath = veilCol.mul(veil).mul(smoothstep(TUN_LEN * 0.5, 120.0, z)).mul(0.9);
      const quantum = lines.add(haze).add(sheath).mul(u.q.mul(float(1).sub(u.hyper)));
      // ── modo hiperespaço: vórtice de nebulosa em espiral ──
      const tw = ang.add(z.mul(0.0012)).add(t.mul(0.9));
      const sp = vec3(cos(tw).mul(0.7), sin(tw).mul(0.7), z.mul(0.0011).sub(t.mul(1.6)));
      const c1 = n3(sp).r;
      const c2 = n3(sp.mul(2.3).add(4.1)).a;
      const sw0 = smoothstep(0.5, 0.82, c1.mul(0.7).add(c2.mul(0.45)));
      const swirl = sw0.mul(sw0);
      const bolt = smoothstep(0.86, 0.96, n3(sp.mul(3.1).add(vec3(0, 0, t.mul(3.0)))).a).mul(step01(fract(t.mul(0.7)), 0.35));
      const satA = pow(u.colA, vec3(1.6)).mul(2.6), satB = pow(u.colB, vec3(1.6)).mul(2.6);
      const hcol = mix(satB, satA, smoothstep(0.3, 0.7, c2)).mul(swirl.mul(0.9).add(0.01)).add(vec3(0.8, 0.88, 1.0).mul(bolt.mul(4.0)));
      const hyp = hcol.mul(u.hyper);
      // carga: anéis pulsando para frente
      const ring = exp(abs(fract(z.mul(0.0016).sub(t.mul(2.2))).sub(0.5)).mul(-18.0)).mul(u.charge).mul(0.9);
      const near = smoothstep(0.0, 260.0, z).mul(smoothstep(TUN_LEN, TUN_LEN * 0.6, z));
      const col = quantum.add(hyp).add(u.colB.mul(ring));
      return vec4(col.mul(near), 1);
    })();
    mat.fog = false;
    const mesh = this.tunnel = new THREE.Mesh(geo, mat);
    mesh.name = 'tunel-quantico';
    mesh.frustumCulled = false;
    mesh.renderOrder = -500;
    mesh.visible = false;
    ctx.scene.add(mesh);

    // núcleo brilhante no ponto de fuga
    const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    cm.colorNode = Fn(() => {
      const q = uv().mul(2).sub(1);
      const r = length(q);
      const core = exp(r.mul(r).mul(-60.0)).mul(6.0).add(exp(r.mul(-7.0)).mul(0.8));
      const rays = pow(abs(cos(atan(q.y, q.x).mul(6.0).add(u.time))), 30.0).mul(exp(r.mul(-4.0))).mul(0.6);
      const c = mix(u.colA, u.colB, u.hyper).mul(core.add(rays)).mul(max(u.q, u.hyper)).mul(smoothstep(1.0, 0.8, r));
      return vec4(c, 1);
    })();
    cm.fog = false;
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cm);
    this.core.frustumCulled = false;
    this.core.renderOrder = -499;
    this.core.visible = false;
    ctx.scene.add(this.core);
  }

  // ── API ─────────────────────────────────────────────────────────────
  quantum(on, intensity = 1, dir = null) {
    this.qTarget = on ? Math.max(0, Math.min(1, intensity)) : 0;
    if (dir) this.dirFixed = dir.clone().normalize();
    else if (!on) this.dirFixed = null;
    if (on && !this.silent && this.q < 0.05 && this.qTarget > 0.5) this.flash(0.6, '#9fc4ff');
  }
  skipSpool() { this.q = this.qTarget; }
  interdict() {
    this.q = 0; this.qTarget = 0; this.beta = 0;
    this.flash(0.9, '#ff6a4a');
    this.ctx.bus.emit('shake', { amount: 0.8, duration: 0.9 });
  }
  jump(phase, opts = {}) {
    if (phase === 'start') {
      this.jumpPhase = opts.skipCharge ? 'hyper' : 'charge';
      this.jt = 0;
      if (opts.skipCharge) { this.hyper = 1; this.j = 1; this.beta = 0.93; }
      this.setDest(opts.to);
    } else if (phase === 'stop') {
      if (this.jumpPhase === 'idle') return;
      this.jumpPhase = 'exit'; this.jt = 0;
      if (!opts.fromBus) this.flash(1.2, '#e8f0ff'); // o pipeline já pisca no evento jump:end
      this.ctx.bus.emit('shake', { amount: 0.6, duration: 0.7 });
    }
  }
  setDest(id) {
    const g = this.ctx.universe.galaxy;
    const e = id ? g.entry(id) : null;
    const neb = e?.nebula;
    if (neb) { this.u.colA.value.setRGB(...neb.color2); this.u.colB.value.setRGB(...neb.color); }
    else { this.u.colA.value.setRGB(0.35, 0.55, 1.0); this.u.colB.value.setRGB(0.7, 0.4, 1.0); }
  }
  get inJump() { return this.jumpPhase === 'charge' || this.jumpPhase === 'hyper'; }
  flash(intensity, color) { this.ctx.bus.emit('flash', { color, intensity }); this.flashT = intensity; }
  state() { return { quantum: this.q, jump: this.j, hyper: this.hyper, phase: this.jumpPhase }; }

  update(dt) {
    // spool/despool suave do quântico
    const k = this.qTarget > this.q ? 1.4 : 2.2;
    this.q += Math.sign(this.qTarget - this.q) * Math.min(Math.abs(this.qTarget - this.q), k * dt);
    this.jt += dt;
    switch (this.jumpPhase) {
      case 'charge': {
        const c = Math.min(1, this.jt / this.chargeTime);
        this.j = c; this.beta = c * c * 0.85; this.hyper = 0;
        this.u.charge.value = c;
        if (c >= 1) { this.jumpPhase = 'hyper'; this.jt = 0; this.flash(1.4, '#ffffff'); this.ctx.bus.emit('shake', { amount: 1.0, duration: 0.6 }); }
        break;
      }
      case 'hyper':
        this.j = 1; this.hyper = Math.min(1, this.hyper + dt * 3); this.beta = 0.93; this.u.charge.value = 0;
        break;
      case 'exit': {
        const e = Math.min(1, this.jt / 1.6);
        this.hyper = Math.max(0, 1 - e * 3);
        this.beta = 0.93 * Math.pow(1 - e, 2.2);
        this.j = 1 - e;
        if (e >= 1) { this.jumpPhase = 'idle'; this.j = 0; this.beta = 0; this.hyper = 0; }
        break;
      }
      default:
        this.u.charge.value = 0;
    }
  }

  frame(dt, ctx) {
    const u = this.u;
    u.time.value += dt;
    const qv = Math.max(this.q, this.jumpPhase === 'idle' ? 0 : this.j);
    u.q.value = qv;
    u.hyper.value = this.hyper;
    // direção do movimento
    if (this.dirFixed) this.dir.copy(this.dirFixed);
    else if (ctx.player.vel && ctx.player.vel.lengthSq() > 1e4) this.dir.copy(ctx.player.vel).normalize();
    else this.dir.copy(_z).applyQuaternion(ctx.camera.quaternion);
    const dome = this.S.dome?.u;
    if (dome) {
      dome.beta.value = Math.max(this.beta, this.q * 0.62);
      dome.velDir.value.copy(this.dir);
      dome.hyper.value = this.hyper * 0.97;
    }
    const vis = qv > 0.003 || this.hyper > 0.003;
    this.tunnel.visible = vis; this.core.visible = vis;
    if (!vis) return;
    _q.setFromUnitVectors(_z, this.dir);
    this.tunnel.quaternion.copy(_q);
    this.tunnel.position.set(0, 0, 0);
    // núcleo: billboard no ponto de fuga
    const d = 3000;
    this.core.position.copy(this.dir).multiplyScalar(d);
    this.core.quaternion.copy(ctx.camera.quaternion);
    this.core.scale.setScalar(d * 0.06);
  }
}

const step01 = (h, p) => smoothstep(p + 0.02, p - 0.02, h);
