/**
 * Sons próprios do movimento, sintetizados com WebAudio no MESMO contexto do
 * serviço `audio` (entram no barramento `foley` dele, então respeitam volume
 * geral, compressor e reverb). Nada de arquivo: ruído filtrado e osciladores.
 *
 *   loop de slide   cama de ruído contínua, timbre por superfície, volume e
 *                   brilho seguem a velocidade; "grão" aleatório no ganho.
 *                   Complementa o transiente de início que a feature audio
 *                   toca em 'player:slide' (slide longo/rampa não fica mudo).
 *   chute           baque grave + estalo (slide kick acertou)
 *   impacto do dive baque de corpo no chão
 *   trava de montar clique metálico curto (arma apoiada)
 *
 * Mudo no modo shot e enquanto o contexto de áudio não estiver rodando.
 */
const SURF = {
  // freq. central do passa-banda, Q, ganho, mistura de "rangido" metálico
  concrete: { f: 1900, q: 0.8, g: 0.2, ring: 0 },
  asphalt: { f: 1500, q: 0.7, g: 0.22, ring: 0 },
  brick: { f: 1300, q: 0.8, g: 0.2, ring: 0 },
  dirt: { f: 650, q: 0.55, g: 0.3, ring: 0 },
  grass: { f: 900, q: 0.5, g: 0.18, ring: 0 },
  wood: { f: 1050, q: 1.3, g: 0.2, ring: 0 },
  metal: { f: 3100, q: 3.2, g: 0.15, ring: 0.05 },
  glass: { f: 3600, q: 2.0, g: 0.12, ring: 0.02 },
};
const surf = (m) => SURF[m] || SURF.concrete;

export class MoveSfx {
  constructor(ctx) {
    this.ctx = ctx;
    this.loop = null;
    this.noise = null;
    this.grainT = 0;
  }
  /** Engine do serviço audio (ou null se mudo / indisponível). */
  engine() {
    if (this.ctx.shot) return null;
    const eng = this.ctx.services.audio?.engine;
    if (!eng?.ac || !eng.running || !eng.bus?.foley) return null;
    return eng;
  }
  noiseBuffer(ac) {
    if (this.noise && this.noise.sampleRate === ac.sampleRate) return this.noise;
    const n = Math.floor(ac.sampleRate * 1.5);
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    // ruído rosa aproximado (filtro de Paul Kellet, versão econômica)
    let b0 = 0, b1 = 0, b2 = 0;
    let s = 12345;
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      const w = (s / 2147483647) * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    }
    return (this.noise = b);
  }

  startSlide(material) {
    const eng = this.engine();
    if (!eng) return;
    this.stopSlide(0.02);
    const ac = eng.ac;
    const S = surf(material);
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer(ac);
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = S.f;
    bp.Q.value = S.q;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(lp).connect(g).connect(eng.bus.foley);
    let osc = null, og = null;
    if (S.ring > 0) {
      // rangido metálico: triângulo agudo com leve vibrato
      osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 880 + Math.random() * 160;
      og = ac.createGain();
      og.gain.value = 0;
      osc.connect(og).connect(g);
      osc.start();
    }
    src.start();
    this.loop = { src, bp, lp, g, osc, og, S, ac };
  }
  /** Por frame: volume/brilho seguem a velocidade (0..~12 m/s). */
  updateSlide(speed, dt) {
    const L = this.loop;
    if (!L) return;
    const k = Math.min(1, Math.max(0, speed / 9));
    const now = L.ac.currentTime;
    this.grainT -= dt;
    let grain = 1;
    if (this.grainT <= 0) {
      this.grainT = 0.03 + Math.random() * 0.05;
      grain = 0.7 + Math.random() * 0.5;
      L.g.gain.setTargetAtTime(L.S.g * (0.25 + 0.75 * k) * grain, now, 0.025);
      L.bp.frequency.setTargetAtTime(L.S.f * (0.7 + 0.45 * k), now, 0.05);
      L.lp.frequency.setTargetAtTime(2200 + 4200 * k, now, 0.05);
      if (L.og) L.og.gain.setTargetAtTime(L.S.ring * k * (Math.random() < 0.3 ? 1 : 0.2), now, 0.04);
    }
  }
  stopSlide(fade = 0.15) {
    const L = this.loop;
    if (!L) return;
    this.loop = null;
    try {
      const now = L.ac.currentTime;
      L.g.gain.cancelScheduledValues(now);
      L.g.gain.setValueAtTime(L.g.gain.value, now);
      L.g.gain.linearRampToValueAtTime(0, now + fade);
      L.src.stop(now + fade + 0.02);
      L.osc?.stop(now + fade + 0.02);
    } catch {}
  }

  /** Baque curto: seno com queda de pitch + estalo de ruído. */
  thump({ f0 = 110, f1 = 42, dur = 0.16, vol = 0.6, click = 0.35, clickF = 2400 } = {}) {
    const eng = this.engine();
    if (!eng) return;
    const ac = eng.ac;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(eng.bus.foley);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (click > 0) {
      const n = ac.createBufferSource();
      n.buffer = this.noiseBuffer(ac);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = clickF;
      bp.Q.value = 0.9;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(click, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.connect(bp).connect(ng).connect(eng.bus.foley);
      n.start(t, Math.random());
      n.stop(t + 0.06);
    }
  }
  kick(hit) {
    if (hit) this.thump({ f0: 120, f1: 45, dur: 0.18, vol: 0.75, click: 0.5, clickF: 1800 });
    else this.thump({ f0: 300, f1: 160, dur: 0.08, vol: 0.12, click: 0.25, clickF: 3500 }); // só o "vush" da perna
  }
  diveImpact(material) {
    const soft = material === 'dirt' || material === 'grass';
    this.thump({ f0: 95, f1: 38, dur: 0.24, vol: 0.85, click: soft ? 0.25 : 0.55, clickF: soft ? 900 : 1700 });
  }
  mountClick() {
    this.thump({ f0: 1400, f1: 900, dur: 0.035, vol: 0.12, click: 0.3, clickF: 4200 });
  }
  dispose() {
    this.stopSlide(0.02);
  }
}
