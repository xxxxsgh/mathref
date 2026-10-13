// Multiferramenta: scanner (onda de varredura na profundidade da cena +
// destaques), lanterna volumétrica (refletor + cone de luz espalhada),
// laser de mineração (feixe contínuo, calor, faíscas, rende recursos) e hack
// de portas/terminais (minijogo de sintonia de fase num painel holográfico).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, uv, texture as textureNode, smoothstep, abs, fract, length, exp, sin, mix, max, If, positionGeometry, pow, clamp,
} from 'three/tsl';
import { COLORS } from './beams.js';
import { A } from './projectiles.js';
import { clamp as clampN } from './util.js';

// ═══════════════════════════════════════════════════════════════════════════
export class Scanner {
  constructor(ctx) {
    this.ctx = ctx;
    this.U = { r: uniform(0), on: uniform(0), width: uniform(6), color: uniform(new THREE.Color(0.25, 1.0, 0.75)), up: uniform(new THREE.Vector3(0, 1, 0)), fade: uniform(1), e1: uniform(new THREE.Vector3(1, 0, 0)), e2: uniform(new THREE.Vector3(0, 0, 1)), off: uniform(new THREE.Vector2()) };
    this.t = -1; this.dur = 2.4; this.max = 140;
    this.cooldown = 0;
    this.installed = false;
    this.found = [];
  }
  install() {
    const R = this.ctx.services.rendering;
    if (!R?.addPostEffect || this.installed) return;
    const U = this.U;
    R.addPostEffect('foot-scan', ({ color, uv: p, depth, U: PU }) => {
      const out = vec3(color).toVar();
      If(U.on.greaterThan(0.001), () => {
        const ndc = vec2(p.x.mul(2).sub(1), float(1).sub(p.y.mul(2)));
        const v = vec3(ndc.x.mul(PU.tanHalf.x).mul(depth), ndc.y.mul(PU.tanHalf.y).mul(depth), depth.negate());
        const d = length(v);
        const valid = smoothstep(4000, 1500, d);
        const band = smoothstep(U.width, 0, abs(d.sub(U.r))).mul(valid);
        const trail = smoothstep(U.r, U.r.sub(U.width.mul(6)), d).mul(smoothstep(U.r.sub(U.width.mul(14)), U.r.sub(U.width.mul(6)), d)).mul(valid);
        // curvas de nível (altura relativa ao jogador) e grade presa ao chão, só na esteira da onda
        const wp = PU.camRot.mul(vec4(v, 0)).xyz;
        const hgt = wp.dot(U.up);
        const contour = smoothstep(0.06, 0.0, abs(fract(hgt.div(1.5)).sub(0.5)).sub(0.44)).mul(trail);
        const g1 = wp.dot(U.e1).add(U.off.x), g2 = wp.dot(U.e2).add(U.off.y);
        const lw = d.mul(0.0025).add(0.02);
        const grid = max(smoothstep(lw, 0.0, abs(fract(g1.div(4)).sub(0.5)).sub(0.5).abs()), smoothstep(lw, 0.0, abs(fract(g2.div(4)).sub(0.5)).sub(0.5).abs())).mul(trail);
        const ring = smoothstep(0.1, 0.0, abs(fract(d.div(6)).sub(0.5)).sub(0.45)).mul(trail).mul(0.3);
        const glow = band.mul(1.4).add(contour.mul(0.35)).add(grid.mul(0.4)).add(ring.mul(0.2)).mul(U.fade);
        out.assign(vec3(color).add(U.color.mul(glow).mul(1.8)).add(vec3(color).mul(band.mul(U.fade).mul(0.4))));
      });
      return out;
    }, { stage: 'hdr', order: 40 });
    this.installed = true;
  }
  pulse() {
    if (this.cooldown > 0) return false;
    this.t = 0; this.cooldown = 3.2;
    this.install();
    return true;
  }
  /** Base tangente da grade (mundo) e deslocamento (local do chão, m). */
  setGrid(e1W, e2W, ox, oy) { this.U.e1.value.copy(e1W); this.U.e2.value.copy(e2W); this.U.off.value.set(ox % 4, oy % 4); }
  frame(dt, upW) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const U = this.U;
    if (this.t < 0) { U.on.value = 0; return; }
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.t = -1; U.on.value = 0; return; }
    U.on.value = 1;
    U.r.value = (1 - (1 - k) ** 2.2) * this.max;
    U.width.value = 3 + k * 9;
    U.fade.value = 1 - k ** 3;
    if (upW) U.up.value.copy(upW);
  }
  get radius() { return this.t < 0 ? -1 : this.U.r.value; }
}

// ═══════════════════════════════════════════════════════════════════════════
export class Flashlight {
  constructor(ctx, camera) {
    this.ctx = ctx;
    this.on = false; this.k = 0;
    const L = new THREE.SpotLight(0xe8f2ff, 0, 60, 0.42, 0.55, 1.6);
    L.castShadow = false;
    L.position.set(0.12, 0.06, 0.05);
    L.target.position.set(0.0, -0.2, -10);
    this.camera = camera;
    this.light = L;
    // cone volumétrico falso (luz espalhada no ar)
    const geo = new THREE.ConeGeometry(1, 1, 32, 8, true);
    geo.translate(0, -0.5, 0); geo.rotateX(Math.PI / 2); // ápice em 0, abre para −Z
    const U = this.U = { k: uniform(0), haze: uniform(0.4) };
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.colorNode = Fn(() => {
      const z = positionGeometry.z.negate(); // 0..1 ao longo do cone
      const r = length(positionGeometry.xy).div(z.max(0.02));
      const core = exp(r.mul(r).mul(-2.5));
      const along = smoothstep(0.0, 0.08, z).mul(pow(float(1).sub(z), 1.6));
      return vec4(vec3(0.9, 0.95, 1.0).mul(core.mul(along).mul(U.k).mul(U.haze).mul(0.22)), 1);
    })();
    const cone = new THREE.Mesh(geo, m);
    cone.scale.set(9, 9, 26);
    cone.position.copy(L.position);
    cone.lookAt(new THREE.Vector3(0.0, -0.2, -10).sub(L.position).add(L.position));
    cone.renderOrder = 13;
    cone.frustumCulled = false;
    this.cone = cone;
  }
  /** Liga/desliga a presença das luzes na cena (só no modo a pé: luzes custam em todos os materiais). */
  attach(on) {
    const c = this.camera, L = this.light;
    if (on && !L.parent) c.add(L, L.target, this.cone);
    else if (!on && L.parent) { c.remove(L, L.target, this.cone); }
  }
  toggle(v = !this.on) { this.on = v; return v; }
  frame(dt, haze = 0.4) {
    this.k += ((this.on ? 1 : 0) - this.k) * (1 - Math.exp(-14 * dt));
    this.light.intensity = this.k * 160;
    this.U.k.value = this.k;
    this.U.haze.value = haze;
    this.cone.visible = this.k > 0.01;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
export class MiningLaser {
  constructor(ctx, beams) {
    this.ctx = ctx; this.beams = beams;
    this.active = false; this.heat = 0; this.overheat = false;
    this.target = null; this.progress = 0;
    this.hit = null;
    this.beam = null; this.halo = null;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    this.sparkT = 0;
  }
  /** Passo: firing = gatilho; origem/dir em mundo; deposits = lista minerável. */
  step(dt, firing, eyeW, dirW, muzzleW, deposits, anchor) {
    const ctx = this.ctx;
    if (this.overheat) { this.heat -= dt * 0.35; if (this.heat <= 0.25) this.overheat = false; firing = false; }
    this.active = firing;
    if (!firing) { this.heat = Math.max(0, this.heat - dt * 0.4); this.stopBeam(); this.progress = Math.max(0, this.progress - dt * 0.2); return null; }
    this.heat += dt * 0.12;
    if (this.heat >= 1) { this.overheat = true; ctx.bus.emit('notify', { text: 'LASER SUPERAQUECIDO', kind: 'warn' }); }
    const range = 28;
    // alvo: depósito mais próximo do raio, senão cenário
    let best = null, bt = range;
    for (const d of deposits) {
      if (d.dead) continue;
      const c = d.worldPos(new THREE.Vector3());
      const oc = c.clone().sub(eyeW);
      const t = oc.dot(dirW);
      if (t < 0 || t > range) continue;
      const dist2 = oc.lengthSq() - t * t;
      if (dist2 < d.radius * d.radius && t < bt) { bt = t - Math.sqrt(Math.max(0, d.radius * d.radius - dist2)) * 0.7; best = d; }
    }
    const r = ctx.collision.raycast(eyeW, dirW, range);
    let end;
    if (best && (!r || r.dist > bt)) end = eyeW.clone().addScaledVector(dirW, bt);
    else if (r) { end = r.point.clone(); best = null; } else end = eyeW.clone().addScaledVector(dirW, range);
    this.from.copy(muzzleW); this.to.copy(end);
    this.startBeam(anchor);
    // efeitos no ponto
    this.sparkT -= dt;
    const P = ctx.services.rendering?.particles;
    const vel = anchor ? A.velAt(anchor, A.toLocal(anchor, end, new THREE.Vector3(), ctx.time.world), new THREE.Vector3(), ctx.time.world) : null;
    if (P && this.sparkT <= 0 && (best || r)) {
      this.sparkT = 0.05;
      const n = r?.normal || dirW.clone().negate();
      try {
        P.emit('spark', end, 4, (k, o) => { const d = new THREE.Vector3().randomDirection().addScaledVector(n, 1.2).normalize(); o.vx = d.x * 5; o.vy = d.y * 5; o.vz = d.z * 5; o.life = 0.3 + Math.random() * 0.3; o.s0 = 0.02; o.s1 = 0.008; o.drag = 2; o.g = 1; o.a = 0.95; o.b = 8; o.spin = 0.02; }, { vel, ttl: 2 });
        P.glow(end, 0.5, [8, 4, 1.2], 0.08, vel);
        if (Math.random() < 0.3) P.emit('smoke', end, 1, (k, o) => { o.vx = n.x; o.vy = n.y; o.vz = n.z; o.life = 1.5; o.s0 = 0.1; o.s1 = 0.8; o.drag = 1; o.g = -0.03; o.a = 0.3; o.b = 0.28; o.c = 0.26; o.w = 0.6; }, { vel, ttl: 3 });
      } catch { /* */ }
    }
    if (best) {
      this.progress += dt / (best.hardness || 2.5);
      best.heat = Math.min(1, (best.heat || 0) + dt * 0.8);
      if (this.progress >= 1) { this.progress = 0; return { deposit: best, amount: best.yieldPer || 6 }; }
    } else this.progress = Math.max(0, this.progress - dt * 0.5);
    this.target = best;
    return null;
  }
  startBeam() {
    if (this.beam) return;
    const self = this;
    this.beam = this.beams.add({ width: 0.03, color: COLORS.orange, intensity: 40, life: 0, style: 1, get: (a, b) => { a.copy(self.from); b.copy(self.to); return true; } });
    this.halo = this.beams.add({ width: 0.22, color: [1.0, 0.5, 0.2], intensity: 2.5, life: 0, style: 1, get: (a, b) => { a.copy(self.from); b.copy(self.to); return true; } });
  }
  stopBeam() { this.beam?.remove(); this.halo?.remove(); this.beam = this.halo = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Hack: sintonizar a fase/frequência de um sinal com o alvo antes do tempo.
export class HackGame {
  constructor(ctx, camera) {
    this.ctx = ctx;
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 320;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    const U = { k: uniform(0) };
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    m.colorNode = Fn(() => {
      const p = uv();
      const scan = sin(p.y.mul(500)).mul(0.08).add(0.92);
      const edge = smoothstep(0.0, 0.03, p.x).mul(smoothstep(1.0, 0.97, p.x)).mul(smoothstep(0.0, 0.04, p.y)).mul(smoothstep(1.0, 0.96, p.y));
      return vec4(this.texSample(p).rgb.mul(1.6).mul(scan).mul(edge).mul(U.k), 1);
    })();
    this.U = U;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), m);
    this.mesh.position.set(0, -0.02, -0.5);
    this.mesh.renderOrder = 30;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
    this.active = null;
  }
  texSample(p) { return textureNode(this.tex, p); }
  /** Começa um hack: o = { difficulty 0..1, onSuccess, onFail, label } */
  start(o) {
    this.active = { ...o, t: 0, time: 9 - (o.difficulty || 0.4) * 4, phase: Math.random() * Math.PI * 2, freq: 1 + Math.random() * 2, tPhase: Math.random() * Math.PI * 2, tFreq: 1 + Math.random() * 2, lock: 0, sel: 0, done: false };
    this.mesh.visible = true;
  }
  stop() { this.active = null; this.mesh.visible = false; this.U.k.value = 0; }
  /** Passo (entrada: eixos para ajustar, interagir para alternar fase/frequência). */
  step(dt, input) {
    const h = this.active; if (!h) return;
    h.t += dt;
    if (h.done) { if (h.t > h.doneT + 0.9) this.stop(); return; }
    if (input.pressed('tool') || input.pressed('pause')) { h.done = true; h.doneT = h.t; h.result = 'cancel'; h.onFail?.('cancel'); return; }
    if (input.pressed('interact') || input.pressed('primary')) h.sel = 1 - h.sel;
    const ax = input.axis('moveX') + input.takeWheel() * 0.4;
    if (h.sel === 0) h.phase += ax * dt * 2.2; else h.freq = clampN(h.freq + ax * dt * 1.2, 0.6, 3.6);
    const dp = Math.abs(Math.atan2(Math.sin(h.phase - h.tPhase), Math.cos(h.phase - h.tPhase)));
    const df = Math.abs(h.freq - h.tFreq);
    const match = Math.max(0, 1 - dp / 0.5) * Math.max(0, 1 - df / 0.25);
    h.match = match;
    h.lock = match > 0.82 ? h.lock + dt : Math.max(0, h.lock - dt * 0.5);
    if (h.lock > 1.1) { h.done = true; h.doneT = h.t; h.result = 'ok'; h.onSuccess?.(); }
    else if (h.t > h.time) { h.done = true; h.doneT = h.t; h.result = 'fail'; h.onFail?.('time'); }
  }
  frame(dt) {
    const h = this.active;
    if (!h) return;
    this.U.k.value = Math.min(1, this.U.k.value + dt * 6);
    const g = this.g, W = 512, H = 320;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,30,40,0.55)'; g.fillRect(0, 0, W, H);
    const C = h.done ? (h.result === 'ok' ? '#6dff9a' : '#ff5a48') : '#b98cff';
    g.strokeStyle = C; g.lineWidth = 2; g.strokeRect(6, 6, W - 12, H - 12);
    g.font = '700 22px "DejaVu Sans Mono", monospace'; g.fillStyle = C; g.textAlign = 'left';
    g.fillText(h.done ? (h.result === 'ok' ? 'ACESSO LIBERADO' : h.result === 'cancel' ? 'CANCELADO' : 'FALHA — ALARME') : `INTRUSÃO · ${h.label || 'TRAVA'}`, 22, 40);
    g.font = '600 14px "DejaVu Sans Mono", monospace';
    g.fillText(`TEMPO ${Math.max(0, h.time - h.t).toFixed(1)}s`, 380, 40);
    // alvo (tracejado) e sinal do jogador
    const wave = (ph, fr, col, dash) => {
      g.strokeStyle = col; g.lineWidth = dash ? 2 : 3; g.setLineDash(dash ? [8, 6] : []);
      g.beginPath();
      for (let x = 0; x <= 460; x += 4) { const y = 165 + Math.sin(x / 460 * Math.PI * 2 * fr + ph) * 60; if (x === 0) g.moveTo(26 + x, y); else g.lineTo(26 + x, y); }
      g.stroke(); g.setLineDash([]);
    };
    wave(h.tPhase, h.tFreq, 'rgba(255,255,255,0.55)', true);
    wave(h.phase, h.freq, C, false);
    g.fillStyle = C;
    g.fillText(`${h.sel === 0 ? '▶' : ' '} FASE   ${h.sel === 1 ? '▶' : ' '} FREQUÊNCIA`, 22, 270);
    g.fillRect(22, 284, 468 * Math.min(1, (h.lock || 0) / 1.1), 8);
    g.strokeRect(22, 284, 468, 8);
    this.tex.needsUpdate = true;
  }
}

void max; void mix; void clamp; void abs; void fract;
