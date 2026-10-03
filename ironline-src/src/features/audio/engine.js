import { SOUNDS } from './sounds.js';
import { rngOf, white, biquad, biquadSweep, shape, mix, normalize } from './dsp.js';

/**
 * Motor WebAudio do IRONLINE.
 *
 * Grafo:
 *
 *   vozes ──► [lp de distância/oclusão] ─► ganho ─► [panner HRTF | stereo] ─► BUS
 *                                              └─► envio ─► revBus
 *
 *   bus.weapon ─┐
 *   bus.foley ──┤
 *   bus.sfx ────┼─► duckSfx ─┐
 *   bus.amb ────┴─► duckAmb ─► ambLP (oclusão: dentro de casa) ─┐
 *   revBus ─► [convolver externo | convolver interno] ──────────┼─► pre ─► concussão (lp) ─► comp ─► limiter ─► master ─► out
 *   bus.ui ───────────────────────────────────────────────────────────────────────────────────────────────► master
 *
 * - Respostas ao impulso GERADAS (rua: ecos discretos entre fachadas + cauda
 *   difusa escura; sala: reflexões densas e curtas). O mix entre as duas
 *   segue `indoor` (0..1), estimado por raios no mundo de colisão.
 * - Fontes no mundo: PannerNode HRTF, atraso pela velocidade do som,
 *   absorção do ar (passa-baixa por distância), oclusão por linha de visão.
 * - Ducking: o tiro do jogador e explosões abaixam ambiente/sfx; explosão
 *   perto aplica "concussão" (passa-baixa geral + zumbido).
 */
const SOS = 343; // m/s
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ac = null;
    this.ready = false;
    this.cache = new Map(); // nome → AudioBuffer[] (variações já geradas)
    this.voices = [];
    this.indoor = 0;
    this.roomSize = 1; // 0 = sala pequena, 1 = rua aberta
    this.volume = 0.8;
    this.counts = new Map();
    this.lastVariant = new Map();
    this._pendingGen = [];
  }

  /** Cria o AudioContext (precisa de gesto do usuário para tocar). */
  start() {
    if (this.ac) return this.ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ac;
    try {
      ac = new AC({ latencyHint: 'interactive' });
    } catch {
      ac = new AC();
    }
    this.ac = ac;
    this.sr = ac.sampleRate;
    const G = (v = 1) => {
      const g = ac.createGain();
      g.gain.value = v;
      return g;
    };
    // cadeia master
    this.master = G(this.volume);
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.concuss = ac.createBiquadFilter();
    this.concuss.type = 'lowpass';
    this.concuss.frequency.value = 20000;
    this.concuss.Q.value = 0.5;
    this.pre = G(1);
    this.pre.connect(this.concuss).connect(this.comp).connect(this.limiter).connect(this.master).connect(ac.destination);

    // buses
    this.bus = { weapon: G(1), foley: G(0.9), sfx: G(1), amb: G(0.24), ui: G(0.7) };
    this.duckSfx = G(1);
    this.duckAmb = G(1);
    this.ambLP = ac.createBiquadFilter();
    this.ambLP.type = 'lowpass';
    this.ambLP.frequency.value = 18000;
    this.bus.weapon.connect(this.pre);
    this.bus.foley.connect(this.pre);
    this.bus.sfx.connect(this.duckSfx).connect(this.pre);
    this.bus.amb.connect(this.duckAmb).connect(this.ambLP).connect(this.pre);
    this.bus.ui.connect(this.master);

    // reverb (dois convolvers com IR gerada)
    this.revBus = G(1);
    this.revOut = G(1);
    this.revIn = G(0);
    const cvO = ac.createConvolver();
    const cvI = ac.createConvolver();
    cvO.buffer = this.makeIR(false);
    cvI.buffer = this.makeIR(true);
    this.revBus.connect(this.revOut).connect(cvO).connect(this.pre);
    this.revBus.connect(this.revIn).connect(cvI).connect(this.pre);

    this.ready = true;
    // gera os buffers mais usados em fatias (sem engasgar o frame)
    this.warm(['shot_player', 'tail_out', 'tail_in', 'shot_enemy', 'crack', 'whiz', 'hitmarker', 'step_concrete', 'step_asphalt', 'run_concrete', 'run_asphalt', 'gear', 'cloth', 'imp_concrete', 'imp_flesh', 'imp_metal', 'brass', 'shot_far', 'shot_player_in', 'mag_out', 'mag_in', 'bolt', 'land_asphalt', 'land_concrete', 'wind', 'roomtone', 'rush', 'breath_in', 'breath_out']);
    return ac;
  }

  resume() {
    const ac = this.start();
    if (ac && ac.state !== 'running') ac.resume?.().catch?.(() => {});
    return ac;
  }
  get running() {
    return !!this.ac && this.ac.state === 'running';
  }
  setVolume(v) {
    this.volume = clamp(v, 0, 1.5);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ac.currentTime, 0.05);
  }

  // ─── banco de buffers ────────────────────────────────────────────────
  /** AudioBuffer da variação `v` de `name` (gera na primeira vez). */
  buffer(name, v = -1) {
    const def = SOUNDS[name];
    if (!def || !this.ac) return null;
    let arr = this.cache.get(name);
    if (!arr) this.cache.set(name, (arr = new Array(def.variants).fill(null)));
    if (v < 0) {
      // aleatória, nunca repetindo a anterior
      const last = this.lastVariant.get(name) ?? -1;
      v = Math.floor(Math.random() * def.variants);
      if (def.variants > 1 && v === last) v = (v + 1) % def.variants;
      this.lastVariant.set(name, v);
    }
    if (!arr[v]) arr[v] = this.toBuffer(def.make(this.sr, rngOf(hash(name) + v * 7919), v));
    return arr[v];
  }
  toBuffer(data) {
    const chans = Array.isArray(data) ? data : [data];
    const b = this.ac.createBuffer(chans.length, chans[0].length, this.sr);
    chans.forEach((c, i) => b.copyToChannel ? b.copyToChannel(c, i) : b.getChannelData(i).set(c));
    return b;
  }
  /** Gera todas as variações dos nomes em fatias de ~6 ms por tick. */
  warm(names) {
    for (const n of names) {
      const d = SOUNDS[n];
      if (d) for (let v = 0; v < d.variants; v++) this._pendingGen.push([n, v]);
    }
    if (this._genTimer) return;
    const tick = () => {
      const t0 = performance.now();
      while (this._pendingGen.length && performance.now() - t0 < 6) {
        const [n, v] = this._pendingGen.shift();
        const arr = this.cache.get(n);
        if (!arr || !arr[v]) this.buffer(n, v);
      }
      this._genTimer = this._pendingGen.length ? setTimeout(tick, 16) : null;
    };
    this._genTimer = setTimeout(tick, 16);
  }

  /** Resposta ao impulso estéreo gerada. */
  makeIR(indoor) {
    const sr = this.sr;
    const dur = indoor ? 1.1 : 2.6;
    const n = Math.ceil(sr * dur);
    const b = this.ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const r = rngOf(indoor ? 101 + c : 707 + c);
      const x = white(n, r);
      if (indoor) {
        biquadSweep(x, sr, 'lp', (t) => 9000 * Math.exp(-t / 0.18) + 700, 0.6);
        shape(x, sr, (t) => (t < 0.004 ? 0 : 1) * Math.exp(-t / 0.16));
        // reflexões iniciais densas (paredes a 2–6 m)
        const imp = new Float32Array(Math.ceil(sr * 0.002));
        imp[0] = 1;
        for (let k = 0; k < 18; k++) mix(x, imp, sr, 0.003 + r.next() * 0.04, (r.next() * 2 - 1) * 0.9 * (1 - k / 22));
      } else {
        // rua: cauda difusa escura + ecos discretos das fachadas
        biquadSweep(x, sr, 'lp', (t) => 4500 * Math.exp(-t / 0.5) + 350, 0.6);
        shape(x, sr, (t) => (t < 0.012 ? 0 : Math.min(1, (t - 0.012) / 0.03)) * Math.exp(-t / 0.62) * 0.55);
        const echo = white(Math.ceil(sr * 0.05), r);
        biquad(echo, sr, 'lp', 2500, 0.7);
        shape(echo, sr, (t) => Math.exp(-t / 0.008));
        for (const [t, g] of [[0.042, 0.9], [0.087, 0.7], [0.131, 0.55], [0.19, 0.45], [0.26, 0.35], [0.37, 0.25], [0.52, 0.16]]) {
          mix(x, echo, sr, t * (0.9 + r.next() * 0.25) + c * 0.004, g * (0.7 + r.next() * 0.4));
        }
      }
      normalize(x, 0.5);
      b.copyToChannel ? b.copyToChannel(x, c) : b.getChannelData(c).set(x);
    }
    return b;
  }

  // ─── tocar ───────────────────────────────────────────────────────────
  /**
   * Toca `name`. opts:
   *   position   Vector3|[x,y,z] → fonte 3D (HRTF) com atraso do som e ar
   *   volume     ganho linear (1)
   *   rate       playbackRate (1) — `pitch` aleatório: opts.jitter (±)
   *   delay      atraso extra (s)
   *   bus        'weapon'|'foley'|'sfx'|'amb'|'ui' (sfx)
   *   reverb     envio para o reverb (0.2)
   *   ref        distância de referência (m) do panner (3)
   *   pan        -1..1 (fontes não posicionais)
   *   lp         passa-baixa fixo (Hz)
   *   occlude    testa linha de visão (true para posicionais)
   *   variant    índice da variação
   *   loop       repete até stop()
   *   cap        máximo de vozes simultâneas desse nome (8)
   * Retorna { stop(fade), gain, source } ou null.
   */
  play(name, opts = {}) {
    if (!this.running) return null;
    const ac = this.ac;
    const buffer = this.buffer(name, opts.variant ?? -1);
    if (!buffer) return null;
    const cap = opts.cap ?? 8;
    if ((this.counts.get(name) || 0) >= cap) this.stealOldest(name);
    if (this.voices.length > 64) this.stealOldest(null);

    const src = ac.createBufferSource();
    src.buffer = buffer;
    const jit = opts.jitter ?? 0.03;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jit);
    if (opts.loop) src.loop = true;
    let node = src;
    let delay = opts.delay ?? 0;
    let send = opts.reverb ?? 0.2;
    let vol = opts.volume ?? 1;

    // posição → distância, ar, oclusão, atraso
    let pos = opts.position;
    if (pos && !pos.isVector3 && Array.isArray(pos)) pos = { x: pos[0], y: pos[1], z: pos[2] };
    let lpHz = opts.lp ?? 0;
    if (pos) {
      const L = this.listenerPos;
      const d = L ? Math.hypot(pos.x - L.x, pos.y - L.y, pos.z - L.z) : 0;
      if (opts.sos !== false) delay += d / SOS;
      const air = 20000 / (1 + d / 45);
      lpHz = lpHz ? Math.min(lpHz, air) : air;
      // longe: mais reverb (campo difuso), menos direto
      send *= 1 + Math.min(2.5, d / 30);
      if ((opts.occlude ?? true) && L && d > 1.5) {
        const occ = this.occlusion(L, pos, d);
        if (occ > 0) {
          lpHz = Math.min(lpHz, 3500 - occ * 2700);
          vol *= 1 - occ * 0.45;
          send *= 1 + occ * 0.6;
        }
      }
    }
    if (lpHz && lpHz < 19000) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(200, lpHz);
      f.Q.value = 0.6;
      node.connect(f);
      node = f;
    }
    const g = ac.createGain();
    g.gain.value = vol;
    node.connect(g);
    node = g;
    if (pos) {
      const p = ac.createPanner();
      p.panningModel = this.game.quality?.level === 'low' ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 3;
      p.rolloffFactor = opts.rolloff ?? 1;
      p.maxDistance = 10000;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      node.connect(p);
      node = p;
    } else if (opts.pan && ac.createStereoPanner) {
      const sp = ac.createStereoPanner();
      sp.pan.value = clamp(opts.pan, -1, 1);
      node.connect(sp);
      node = sp;
    }
    node.connect(this.bus[opts.bus || 'sfx'] || this.bus.sfx);
    if (send > 0) {
      const s = ac.createGain();
      s.gain.value = send * vol;
      node.connect(s).connect(this.revBus);
    }
    const t0 = ac.currentTime + Math.max(0, delay);
    src.start(t0, opts.offset ?? 0);
    const voice = { name, src, gain: g, t0, end: opts.loop ? Infinity : t0 + buffer.duration / src.playbackRate.value };
    this.voices.push(voice);
    this.counts.set(name, (this.counts.get(name) || 0) + 1);
    src.onended = () => this.release(voice);
    return {
      source: src,
      gain: g.gain,
      voice,
      stop: (fade = 0.06) => {
        try {
          const now = ac.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + fade);
          src.stop(now + fade + 0.01);
        } catch {}
      },
    };
  }
  release(v) {
    const i = this.voices.indexOf(v);
    if (i < 0) return;
    this.voices.splice(i, 1);
    this.counts.set(v.name, Math.max(0, (this.counts.get(v.name) || 1) - 1));
    try {
      v.src.disconnect();
    } catch {}
  }
  stealOldest(name) {
    let best = null;
    for (const v of this.voices) if ((!name || v.name === name) && v.end !== Infinity && (!best || v.t0 < best.t0)) best = v;
    if (!best) return;
    try {
      const now = this.ac.currentTime;
      best.gain.gain.setTargetAtTime(0, now, 0.01);
      best.src.stop(now + 0.05);
    } catch {}
    this.release(best);
  }

  /** 0 = livre, 1 = bloqueado por parede grossa (raios no mundo de colisão). */
  occlusion(L, P, d) {
    const col = this.game.collision;
    if (!col) return 0;
    const dir = { x: (P.x - L.x) / d, y: (P.y - L.y) / d, z: (P.z - L.z) / d };
    const o = this._o || (this._o = L.clone());
    o.set(L.x, L.y, L.z);
    const dv = this._d || (this._d = L.clone());
    dv.set(dir.x, dir.y, dir.z);
    const hit = col.raycast(o, dv, d - 0.5, { filter: (c) => c.tag !== 'enemy' && c.blocksBullets });
    return hit ? 1 : 0;
  }

  // ─── dinâmica ────────────────────────────────────────────────────────
  /** Abaixa um ganho (`duckAmb`/`duckSfx`) para `to` e volta em `release` s. */
  duck(which, to, attack = 0.01, hold = 0.05, release = 0.5) {
    if (!this.ready) return;
    const g = (which === 'amb' ? this.duckAmb : this.duckSfx).gain;
    const now = this.ac.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(Math.min(g.value, to), now, attack / 3);
    g.setTargetAtTime(1, now + attack + hold, release / 3);
  }
  /** Concussão: abafa tudo e soa um zumbido agudo que some aos poucos. */
  concussion(amount = 1) {
    if (!this.running) return;
    const ac = this.ac, now = ac.currentTime;
    const f = this.concuss.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(Math.min(f.value, 20000), now);
    f.setTargetAtTime(300 + (1 - amount) * 2500, now, 0.01);
    f.setTargetAtTime(20000, now + 0.4 + amount * 1.6, 0.9);
    const o = ac.createOscillator();
    o.frequency.value = 3650 + Math.random() * 300;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.05 * amount, now + 0.05);
    g.gain.setTargetAtTime(0, now + 0.6, 0.9 + amount);
    o.connect(g).connect(this.bus.ui);
    o.start(now);
    o.stop(now + 6);
  }

  // ─── ouvinte e ambiente ──────────────────────────────────────────────
  updateListener(camera) {
    if (!this.ready) return;
    const l = this.ac.listener;
    const p = camera.getWorldPosition(this._lp || (this._lp = camera.position.clone()));
    this.listenerPos = p;
    const e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      const t = this.ac.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.01);
      l.positionY.setTargetAtTime(p.y, t, 0.01);
      l.positionZ.setTargetAtTime(p.z, t, 0.01);
      l.forwardX.setTargetAtTime(fx, t, 0.01);
      l.forwardY.setTargetAtTime(fy, t, 0.01);
      l.forwardZ.setTargetAtTime(fz, t, 0.01);
      l.upX.setTargetAtTime(ux, t, 0.01);
      l.upY.setTargetAtTime(uy, t, 0.01);
      l.upZ.setTargetAtTime(uz, t, 0.01);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }
  /** Aplica o fator "dentro de casa" (0..1) a reverb e oclusão do ambiente. */
  setIndoor(k) {
    this.indoor = k;
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.revOut.gain.setTargetAtTime(1 - k, t, 0.25);
    this.revIn.gain.setTargetAtTime(k * 1.1, t, 0.25);
    this.ambLP.frequency.setTargetAtTime(18000 * Math.pow(1100 / 18000, k), t, 0.3);
  }
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

