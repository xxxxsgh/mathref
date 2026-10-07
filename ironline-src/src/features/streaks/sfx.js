/**
 * Sons próprios da feature streaks, sintetizados na hora com WebAudio no
 * MESMO AudioContext da feature audio (`services.audio.context`, cujo
 * listener já acompanha a câmera — os PannerNode HRTF daqui ficam
 * espacializados de graça). Sem contexto (ou no modo shot) tudo vira no-op.
 *
 *   ping()          varredura de radar (UAV)
 *   whistle(p, s)   assobio de granada de morteiro caindo (Doppler descendente)
 *   beep(f, d)      bipes de interface (designador, alerta, torreta)
 *   motor(p)        laço de motor (drone/UAV): { set(pos, rate, gain), stop() }
 *   servo(p)        giro de servo da torreta
 *   hiss(p)         chiado de superaquecimento / vapor
 *   whoosh()        transição da killcam / corte de câmera
 *   shutter()       obturador do modo foto
 */
export class Sfx {
  constructor(ctx) {
    this.ctx = ctx;
    this.master = null;
  }

  get ac() {
    if (this.ctx.shot) return null;
    const ac = this.ctx.services.audio?.context;
    if (!ac || ac.state === 'closed') return null;
    if (!this.master || this.master.context !== ac) {
      this.master = ac.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(ac.destination);
      // ruído branco compartilhado (1 s)
      const n = ac.sampleRate;
      this.noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  /** destino: panner 3D (pos) ou direto no master */
  out(ac, pos, ref = 6) {
    if (!pos) return this.master;
    const p = ac.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }

  ping() {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    // eco curto (sonar)
    const dl = ac.createDelay(1);
    dl.delayTime.value = 0.18;
    const fb = ac.createGain();
    fb.gain.value = 0.35;
    o.connect(g);
    g.connect(this.master);
    g.connect(dl);
    dl.connect(fb);
    fb.connect(dl);
    dl.connect(this.master);
    o.start(t);
    o.stop(t + 1.0);
    setTimeout(() => {
      try {
        fb.disconnect();
        dl.disconnect();
      } catch {}
    }, 2200);
  }

  whistle(pos, dur = 1.6) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const dst = this.out(ac, pos, 14);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2300, t);
    o.frequency.exponentialRampToValueAtTime(520, t + dur);
    // vibrato do giro da aleta
    const lfo = ac.createOscillator();
    lfo.frequency.value = 23;
    const lg = ac.createGain();
    lg.gain.value = 18;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    // ar rasgando (ruído passa-banda acompanhando)
    const n = ac.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(3000, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.85);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(g);
    g.connect(dst);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(dst);
    o.start(t);
    lfo.start(t);
    n.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
    n.stop(t + dur + 0.1);
  }

  beep(freq = 1200, dur = 0.07, vol = 0.12, type = 'square', pos = null) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 4000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.out(ac, pos, 4));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Laço de motor (drone): pitch e volume ajustáveis por frame. */
  motor(pos, { base = 160, gain = 0.25 } = {}) {
    const ac = this.ac;
    if (!ac) return { set() {}, stop() {} };
    const t = ac.currentTime;
    const p = this.out(ac, pos, 5);
    const g = ac.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, t, 0.3);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value = 0.8;
    const oscs = [1, 2.02, 3.97].map((m, i) => {
      const o = ac.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = base * m;
      const og = ac.createGain();
      og.gain.value = [0.5, 0.3, 0.12][i];
      o.connect(og);
      og.connect(lp);
      o.start(t);
      return o;
    });
    // batimento das hélices (AM)
    const am = ac.createOscillator();
    am.frequency.value = 37;
    const amg = ac.createGain();
    amg.gain.value = 0.25;
    const sum = ac.createGain();
    sum.gain.value = 0.75;
    am.connect(amg);
    amg.connect(sum.gain);
    am.start(t);
    // chiado do ar das pás
    const n = ac.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const nb = ac.createBiquadFilter();
    nb.type = 'bandpass';
    nb.frequency.value = 1800;
    nb.Q.value = 0.7;
    const ng = ac.createGain();
    ng.gain.value = 0.18;
    n.connect(nb);
    nb.connect(ng);
    ng.connect(sum);
    n.start(t);
    lp.connect(sum);
    sum.connect(g);
    g.connect(p);
    return {
      set(pos2, rate = 1, gn = gain) {
        const now = ac.currentTime;
        if (pos2 && p.positionX) {
          p.positionX.setTargetAtTime(pos2.x, now, 0.03);
          p.positionY.setTargetAtTime(pos2.y, now, 0.03);
          p.positionZ.setTargetAtTime(pos2.z, now, 0.03);
        }
        oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * [1, 2.02, 3.97][i] * rate, now, 0.08));
        am.frequency.setTargetAtTime(37 * rate, now, 0.08);
        g.gain.setTargetAtTime(gn, now, 0.1);
      },
      stop() {
        const now = ac.currentTime;
        g.gain.setTargetAtTime(0, now, 0.15);
        for (const o of [...oscs, am]) o.stop(now + 0.8);
        n.stop(now + 0.8);
      },
    };
  }

  servo(pos, dur = 0.35) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, t);
    o.frequency.linearRampToValueAtTime(520, t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(410, t + dur);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.out(ac, pos, 3));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(pos, dur = 1.2, vol = 0.18) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.out(ac, pos, 3));
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  whoosh(dur = 0.5, vol = 0.2) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3500, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  shutter() {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    for (const [dt, f] of [[0, 2600], [0.06, 1800]]) {
      const n = ac.createBufferSource();
      n.buffer = this.noise;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 4;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.3, t + dt + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.05);
      n.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      n.start(t + dt);
      n.stop(t + dt + 0.06);
    }
  }
}
