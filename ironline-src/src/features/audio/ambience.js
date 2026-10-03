/**
 * Cama sonora de guerra: vento e ronco da cidade em loop, mais eventos
 * distantes agendados aleatoriamente ao redor do ouvinte (rajadas de fuzil
 * a centenas de metros, artilharia, um jato passando, helicóptero ao
 * longe, sirene, entulho caindo). Tudo no bus `amb`, que sofre ducking
 * quando o jogador atira e é abafado dentro de prédios.
 */
const rnd = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(engine) {
    this.e = engine;
    this.loops = [];
    this.started = false;
    this.timers = {
      gunfire: rnd(1.5, 4),
      artillery: rnd(5, 10),
      jet: rnd(35, 70),
      heli: rnd(25, 50),
      siren: rnd(14, 24),
      rubble: rnd(8, 18),
    };
    this.bursts = []; // tiros agendados de uma rajada distante
    this.t = 0;
  }

  start() {
    if (this.started || !this.e.running) return;
    this.started = true;
    const w = this.e.play('wind', { bus: 'amb', loop: true, volume: 0.55, reverb: 0, jitter: 0, cap: 2 });
    const r = this.e.play('roomtone', { bus: 'amb', loop: true, volume: 0.14, reverb: 0, jitter: 0, cap: 2 });
    for (const l of [w, r]) {
      if (!l) continue;
      // entra devagar
      const now = this.e.ac.currentTime;
      const v = l.gain.value;
      l.gain.setValueAtTime(0, now);
      l.gain.linearRampToValueAtTime(v, now + 2.5);
      this.loops.push(l);
    }
  }

  /** Ponto a `dist` m do ouvinte num azimute aleatório (altura +y). */
  around(dist, y = 4) {
    const L = this.e.listenerPos;
    if (!L) return null;
    const a = Math.random() * Math.PI * 2;
    return { x: L.x + Math.cos(a) * dist, y: L.y + y, z: L.z + Math.sin(a) * dist };
  }

  update(dt) {
    if (!this.e.running) return;
    if (!this.started) this.start();
    this.t += dt;
    const T = this.timers;
    for (const k in T) T[k] -= dt;

    // rajadas distantes (troca de tiros em outro quarteirão)
    if (T.gunfire <= 0) {
      T.gunfire = rnd(1.2, 6.5);
      const dist = rnd(140, 750);
      const p = this.around(dist, rnd(2, 12));
      if (p) {
        const auto = Math.random() < 0.6;
        const n = auto ? Math.floor(rnd(3, 11)) : Math.floor(rnd(1, 4));
        const gap = auto ? rnd(0.075, 0.12) : rnd(0.35, 0.9);
        const name = dist < 350 ? 'shot_far' : 'shot_vfar';
        let t = 0;
        for (let i = 0; i < n; i++) {
          this.bursts.push({ at: this.t + t, name, p, dist });
          t += gap * rnd(0.85, 1.2);
        }
        // às vezes alguém responde de outra direção
        if (Math.random() < 0.35) {
          const q = this.around(rnd(200, 800), rnd(2, 10));
          const m = Math.floor(rnd(2, 7));
          for (let i = 0; i < m; i++) this.bursts.push({ at: this.t + t + rnd(0.3, 1) + i * rnd(0.09, 0.14), name: 'shot_vfar', p: q, dist: 600 });
        }
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      if (b.at > this.t) continue;
      this.bursts.splice(i, 1);
      this.e.play(b.name, { position: b.p, bus: 'amb', ref: Math.max(30, b.dist * 0.16), volume: 0.6, reverb: 0.35, sos: false, occlude: false, jitter: 0.06, cap: 12 });
    }
    if (T.artillery <= 0) {
      T.artillery = rnd(7, 22);
      const d = rnd(500, 1800);
      const p = this.around(d, 10);
      if (p) this.e.play('explosion_far', { position: p, bus: 'amb', ref: d * 0.22, volume: 0.9, reverb: 0.5, sos: false, occlude: false, cap: 3 });
    }
    if (T.rubble <= 0) {
      T.rubble = rnd(12, 35);
      const p = this.around(rnd(25, 70), rnd(0, 8));
      if (p) this.e.play('rubble', { position: p, bus: 'amb', ref: 8, volume: 0.45, reverb: 0.3, sos: false, cap: 2 });
    }
    if (T.jet <= 0) {
      T.jet = rnd(60, 120);
      this.e.play('jet', { bus: 'amb', volume: 0.32, reverb: 0.25, cap: 1, jitter: 0.05 });
    }
    if (T.heli <= 0) {
      T.heli = rnd(55, 110);
      const p = this.around(rnd(350, 700), 60);
      if (p) this.e.play('heli', { position: p, bus: 'amb', ref: 160, volume: 0.6, reverb: 0.2, sos: false, occlude: false, cap: 1 });
    }
    if (T.siren <= 0) {
      T.siren = rnd(150, 260);
      const p = this.around(rnd(900, 1500), 30);
      if (p) this.e.play('siren', { position: p, bus: 'amb', ref: 400, volume: 0.22, reverb: 0.7, sos: false, occlude: false, cap: 1, jitter: 0 });
    }
  }
}
