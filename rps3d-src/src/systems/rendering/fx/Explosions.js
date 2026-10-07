// Orquestra explosões: bola de fogo volumétrica + faíscas + fumaça/fogo +
// brasas + destroços + anel de choque + distorção de calor/onda de choque na
// tela + clarão de luz pontual + tremor/flash conforme distância.
//
// Tipos (evento 'explosion' / services.rendering.explosion):
//   small    impacto/pequena (projéteis, peças)
//   missile  míssil
//   ship     caça destruído (com destroços e anel)
//   capital  nave capital: cadeia de explosões internas e um clarão final
//   ground   explosão no chão: poeira, pedras, coluna de fumaça
//   shield   impacto em escudo (faíscas azuis, sem fogo)
//   plasma   explosão energética (Vigilantes / armas de plasma)
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

const KINDS = {
  small: { fire: 1, fbLife: 0.9, sparks: 50, sparkSpeed: 60, smoke: 5, glow: 6, debris: 0, ring: 0, light: 0.6, shake: 0.15, heat: 0.6 },
  missile: { fire: 1, fbLife: 1.4, sparks: 140, sparkSpeed: 110, smoke: 14, glow: 14, debris: 6, ring: 1, light: 1.2, shake: 0.35, heat: 1 },
  ship: { fire: 3, fbLife: 2.2, sparks: 380, sparkSpeed: 160, smoke: 36, glow: 30, debris: 46, ring: 1, light: 2.2, shake: 0.6, heat: 1 },
  capital: { fire: 4, fbLife: 3.6, sparks: 700, sparkSpeed: 260, smoke: 60, glow: 50, debris: 120, ring: 2, light: 4, shake: 1.0, heat: 1 },
  ground: { fire: 2, fbLife: 2.0, sparks: 160, sparkSpeed: 70, smoke: 40, glow: 16, debris: 30, ring: 0, light: 1.6, shake: 0.6, heat: 0.9, dust: true },
  shield: { fire: 0, fbLife: 0.5, sparks: 90, sparkSpeed: 70, smoke: 0, glow: 10, debris: 0, ring: 1, light: 0.7, shake: 0.1, heat: 0.4, energy: [0.4, 0.7, 1.6] },
  plasma: { fire: 1, fbLife: 1.2, sparks: 160, sparkSpeed: 120, smoke: 4, glow: 30, debris: 0, ring: 1, light: 1.5, shake: 0.35, heat: 0.8, energy: [0.5, 0.8, 2.2] },
};

export class Explosions {
  constructor(ctx, fx, { anchors, particles, fireballs, debris, onShake, onFlash }) {
    this.ctx = ctx; this.fx = fx;
    this.anchors = anchors; this.P = particles; this.F = fireballs; this.D = debris;
    this.onShake = onShake; this.onFlash = onFlash;
    this.now = 0;
    this.queue = [];      // sub-explosões agendadas
    this.distort = [];    // fontes de distorção ativas
    this.lights = [];
    for (let i = 0; i < fx.flashLights; i++) {
      const L = new THREE.PointLight(0xffa060, 0, 1, 2);
      L.castShadow = false;
      L.userData = { t: 0, life: 1, power: 0, anchor: -1 };
      ctx.scene.add(L);
      this.lights.push(L);
    }
    this.lightCursor = 0;
  }

  /** API pública. pos em coordenadas de MUNDO. */
  spawn(pos, size = 10, kind = 'ship', opts = {}) {
    const K = KINDS[kind] || KINDS.ship;
    size = Math.max(0.3, size);
    const vel = opts.vel || null;
    const anchor = this.anchors.alloc(pos, vel, 18, this.now);
    const P = this.P;
    const energy = K.energy;
    const S = size;
    const nScale = P.budgetScale;

    // ── bola(s) de fogo ──
    for (let i = 0; i < K.fire; i++) {
      const off = i === 0 ? new THREE.Vector3() : new THREE.Vector3().randomDirection().multiplyScalar(S * 0.35);
      const fb = this.F.spawn({ size: S * (i === 0 ? 1 : 0.6 + Math.random() * 0.3), life: K.fbLife * (0.8 + Math.random() * 0.4), delay: i * 0.12 * Math.random(), hot: energy ? 0.7 : 1, smoke: energy ? 0.25 : kind === 'ground' ? 1.4 : 1 });
      fb.userData.follow = (m) => m.position.copy(this.anchors.local[anchor]).add(off);
    }
    // ── núcleo de clarão (glow) ──
    const flashCol = energy || [6, 3.6, 1.6];
    P.layers.glow.emit(1, anchor, (k, o) => { o.life = 0.35; o.s0 = S * 2.2; o.s1 = S * 3.5; o.a = flashCol[0] * 4; o.b = flashCol[1] * 4; o.c = flashCol[2] * 4; o.w = 2.5; });
    P.layers.glow.emit(1, anchor, (k, o) => { o.life = 1.0; o.s0 = S * 1.2; o.s1 = S * 2.6; o.a = flashCol[0]; o.b = flashCol[1]; o.c = flashCol[2]; o.w = 1.6; });
    // ── faíscas ──
    const ns = P.n(K.sparks * Math.min(2.5, 0.6 + S / 25));
    P.layers.spark.emit(ns, anchor, (k, o) => {
      _d.randomDirection();
      if (opts.normal) { if (_d.dot(opts.normal) < 0) _d.reflect(opts.normal); }
      const sp = K.sparkSpeed * (0.3 + Math.random() ** 0.6) * (0.5 + S / 40);
      o.vx = _d.x * sp; o.vy = _d.y * sp; o.vz = _d.z * sp;
      if (vel) { o.vx += vel.x; o.vy += vel.y; o.vz += vel.z; }
      o.life = 0.5 + Math.random() * 1.6; o.s0 = 0.05 + S * 0.006; o.s1 = o.s0 * 0.4; o.drag = 0.7 + Math.random() * 1.2;
      o.g = kind === 'ground' ? 1 : 0;
      o.a = energy ? 0.95 : 0.75 + Math.random() * 0.3; o.b = energy ? 9 : 5; o.spin = 0.045; // spin = fator de estiramento (s)
      o.delay = Math.random() * 0.08;
    });
    // ── brasas lentas ──
    P.layers.glow.emit(P.n(K.glow), anchor, (k, o) => {
      _d.randomDirection();
      const sp = K.sparkSpeed * 0.25 * Math.random();
      o.x = _d.x * S * 0.3; o.y = _d.y * S * 0.3; o.z = _d.z * S * 0.3;
      o.vx = _d.x * sp; o.vy = _d.y * sp; o.vz = _d.z * sp;
      o.life = 1.2 + Math.random() * 2.5; o.s0 = S * 0.05; o.s1 = S * 0.02; o.drag = 0.4;
      const c = energy || [3.2, 1.3, 0.35];
      o.a = c[0]; o.b = c[1]; o.c = c[2]; o.w = 1.2; o.delay = Math.random() * 0.4;
    });
    // ── fumaça/fogo ──
    if (K.smoke) {
      const dust = K.dust;
      P.layers.smoke.emit(P.n(K.smoke), anchor, (k, o) => {
        _d.randomDirection();
        if (dust && opts.normal) { if (_d.dot(opts.normal) < 0) _d.reflect(opts.normal); }
        const r = S * (0.15 + Math.random() * 0.55);
        o.x = _d.x * r; o.y = _d.y * r; o.z = _d.z * r;
        const sp = S * (0.25 + Math.random() * 0.9);
        o.vx = _d.x * sp; o.vy = _d.y * sp; o.vz = _d.z * sp;
        if (vel) { o.vx += vel.x * 0.6; o.vy += vel.y * 0.6; o.vz += vel.z * 0.6; }
        o.life = (3 + Math.random() * 5) * (dust ? 1.6 : 1) * Math.min(2, 0.7 + S / 40);
        o.s0 = S * (0.25 + Math.random() * 0.3); o.s1 = S * (1.0 + Math.random() * 1.2);
        o.drag = 0.9 + Math.random() * 0.6; o.g = dust ? -0.03 : -0.06;
        const grey = dust ? 0 : 0.05 + Math.random() * 0.06;
        if (dust) { o.a = 0.32; o.b = 0.25; o.c = 0.18; } else { o.a = grey; o.b = grey * 0.95; o.c = grey * 0.9; }
        o.w = k < K.smoke * 0.5 ? K.heat : K.heat * 0.4; // calor inicial
        o.spin = (Math.random() - 0.5) * 0.8;
        o.delay = Math.random() * 0.25;
      });
    }
    // ── destroços ──
    if (K.debris && this.D) {
      const n = Math.round(K.debris * nScale * Math.min(2, 0.5 + S / 30));
      this.D.burst(anchor, n, { size: S * 0.5, speed: K.sparkSpeed * 0.35 * (0.6 + S / 60), kind: kind === 'ground' ? 'rock' : 'metal', vel, hot: K.heat });
    }
    // ── anel de choque ──
    for (let i = 0; i < (this.ctx.params.get('rrings') === '0' ? 0 : K.ring); i++) {
      // plano do anel inclinado para a câmera (de perfil ele vira um "charuto")
      let rn = opts.normal;
      if (!rn) {
        rn = _v.copy(this.ctx.player.camWorld).sub(pos).normalize().multiplyScalar(1.1).add(new THREE.Vector3().randomDirection()).normalize().clone();
      }
      const r = this.F.ring({ size: S * (3.2 + i * 2.5), life: 0.9 + i * 0.6, color: energy ? '#9fc8ff' : i ? '#ffd2a0' : '#bcd4ff', power: energy ? 1.4 : 0.8, normal: rn, delay: i * 0.15 });
      r.userData.follow = (m) => m.position.copy(this.anchors.local[anchor]);
    }
    // ── distorção na tela ──
    this.distort.push({ pos: this.anchors.world[anchor], anchor, radius: S * 3.2, strength: Math.min(1.2, 0.4 + S / 40), ring: 0, ringWidth: 0.1, shimmer: K.heat * 0.6, age: 0, life: K.fbLife * 1.2 });
    // ── luz ──
    if (this.lights.length) {
      const L = this.lights[this.lightCursor];
      this.lightCursor = (this.lightCursor + 1) % this.lights.length;
      const c = energy ? new THREE.Color(0.5, 0.7, 1) : new THREE.Color(1, 0.6, 0.3);
      L.color.copy(c);
      L.userData = { t: 0, life: K.fbLife * 0.9, power: K.light * S * S * 60, anchor };
      L.distance = S * 60;
    }
    // ── câmera: tremor + flash conforme distância ──
    const dist = _v.copy(pos).sub(this.ctx.player.camWorld).length();
    const rel = S / Math.max(1, dist);
    const shake = K.shake * Math.min(1, rel * 18);
    if (shake > 0.01) this.onShake?.(shake, 0.4 + K.shake * 0.8);
    if (rel > 0.05 || kind === 'capital') this.onFlash?.(energy ? '#a8c8ff' : '#ffd0a0', Math.min(0.25, rel * 1.2 * K.light));

    // ── cadeia (nave capital) ──
    if (kind === 'capital' && !opts.sub) {
      for (let i = 0; i < 6; i++) {
        const off = new THREE.Vector3().randomDirection().multiplyScalar(S * (0.8 + Math.random() * 1.6));
        this.queue.push({ at: this.now + 0.35 + i * 0.4 + Math.random() * 0.3, pos: pos.clone().add(off), size: S * (0.35 + Math.random() * 0.3), kind: 'ship', opts: { vel, sub: true } });
      }
      this.queue.push({ at: this.now + 3.2, pos: pos.clone(), size: S * 1.6, kind: 'ship', opts: { vel, sub: true } });
    }
    return anchor;
  }

  update(dt) {
    this.now += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (q.at <= this.now) { this.queue.splice(i, 1); this.spawn(q.pos, q.size, q.kind, q.opts); }
    }
    for (let i = this.distort.length - 1; i >= 0; i--) {
      const s = this.distort[i];
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) { this.distort.splice(i, 1); continue; }
      s.ring = Math.min(1, s.age / (s.life * 0.45));
      s.strength *= Math.exp(-dt * 0.8);
      s.shimmer = Math.max(0, 1 - t) * (s.shimmer > 0 ? 1 : 0);
      this.anchors.extend(s.anchor, this.now + 0.5);
    }
    for (const L of this.lights) {
      const u = L.userData;
      if (u.power <= 0) { L.intensity = 0; continue; }
      u.t += dt;
      const k = u.t / u.life;
      if (k >= 1) { u.power = 0; L.intensity = 0; continue; }
      L.intensity = u.power * Math.pow(1 - k, 2) * (k < 0.05 ? k / 0.05 : 1);
    }
  }

  /** Posiciona luzes no espaço de render (depois de anchors.sync). */
  syncLights() {
    for (const L of this.lights) if (L.userData.power > 0 && L.userData.anchor >= 0) L.position.copy(this.anchors.local[L.userData.anchor]);
  }
}

export { KINDS };
