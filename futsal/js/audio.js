// Áudio 100% sintetizado com Web Audio API (nenhum arquivo externo):
// efeitos, torcida ambiente reativa, trilha chiptune original nos menus e
// narração por frases-chave em português via speechSynthesis.
import { pick, clamp } from './util.js';

const PHRASES = {
  goal: ['Gooooool!', 'É gol! Que golaço!', 'Gol! A rede balançou!', 'Golaço! Não deu pro goleiro!', 'Olha o gol! É dele!', 'Gol! Explode a torcida!'],
  ownGoal: ['Gol contra! Que azar!', 'Contra! Mandou pro próprio gol!'],
  save: ['Que defesa!', 'Defendeu o goleiro!', 'Espalmou! Que reflexo!', 'Milagre do goleiro!', 'Segurou firme!'],
  post: ['Na trave!', 'Carimbou a trave!', 'Bateu na trave! Uh!', 'No travessão!'],
  foul: ['Falta!', 'Apita o árbitro, falta.', 'Falta marcada.', 'Derrubou, é falta.'],
  foul5: ['Quinta falta! Mais uma e é tiro livre sem barreira.'],
  foul6: ['Sexta falta! Tiro livre direto, sem barreira!'],
  yellow: ['Cartão amarelo!', 'Amarelo para ele.', 'Advertido com o amarelo.'],
  red: ['Cartão vermelho! Expulso!', 'Vermelho! Vai mais cedo pro chuveiro!'],
  penalty: ['Pênalti!', 'É pênalti! Marca da cal!'],
  miss: ['Pra fora!', 'Passou perto!', 'Isolou!', 'Uh! Raspando a trave!'],
  end: ['Fim de jogo!', 'Termina a partida!', 'Apita o árbitro, acabou!'],
  half: ['Fim do primeiro tempo.', 'Intervalo!'],
  start: ['Bola rolando!', 'Começa a partida!', 'Rola a bola!'],
  skill: ['Que drible!', 'Que lindo!', 'Que categoria!', 'Deixou pra trás!'],
  fourSec: ['Estourou os quatro segundos!', 'Demorou demais, quatro segundos!'],
  keeperOut: ['Goleiro-linha!', 'Vai com o goleiro-linha!'],
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.excite = 0;
    this.lastPhrase = {};
    this.voice = null;
    this.speaking = 0;
    this.musicOn = false;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      this.applyVolumes();
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startCrowd();
      // iOS: toca um buffer vazio para destravar
      const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
    } catch { this.ctx = null; }
    this.pickVoice();
    try {
      speechSynthesis.onvoiceschanged = () => this.pickVoice();
      // iOS só libera a voz se a primeira fala acontecer num toque do usuário
      if (!this.voiceUnlocked) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); this.voiceUnlocked = true; }
    } catch { /* sem voz */ }
  }

  pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => v.lang === 'pt-BR') || vs.find((v) => v.lang && v.lang.startsWith('pt')) || null;
    } catch { this.voice = null; }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.settings.vol;
    this.sfxBus.gain.value = v.sfx;
    this.musicBus.gain.value = v.music * 0.5;
  }

  suspend() { try { this.ctx?.suspend(); speechSynthesis.cancel(); } catch { /* ignora */ } }
  resume() { try { this.ctx?.resume(); } catch { /* ignora */ } }

  // ─── utilitários de síntese ──────────────────────────────────────────────
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  osc(type, f0, f1, dur, peak, dest = this.sfxBus, t = this.ctx.currentTime) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, 0.005, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(freq, q, dur, peak, type = 'bandpass', t = this.ctx.currentTime, dest = this.sfxBus) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const t = this.ctx.currentTime;
      switch (name) {
        case 'kick': {
          const p = clamp(o.power ?? 0.5, 0.1, 1.2);
          this.osc('sine', 150 + p * 60, 45, 0.14, 0.5 + p * 0.45);
          this.noiseHit(1800 + p * 1500, 0.8, 0.05, 0.15 + p * 0.25, 'highpass');
          break;
        }
        case 'touch': this.osc('sine', 120, 60, 0.07, 0.18); break;
        case 'bounce': this.osc('sine', 95, 55, 0.1, clamp((o.v || 2) / 8, 0.05, 0.4)); break;
        case 'post': {
          const g = clamp((o.v || 6) / 14, 0.15, 0.6);
          for (const [f, k] of [[523, 1], [1311, 0.6], [2156, 0.35], [3400, 0.2]]) this.osc('triangle', f, f * 0.995, 0.7, g * k);
          break;
        }
        case 'net': this.noiseHit(1400, 0.6, 0.45, 0.35); this.noiseHit(500, 0.5, 0.3, 0.2); break;
        case 'squeak': this.osc('sine', 1700 + Math.random() * 500, 2600, 0.05, 0.05); break;
        case 'whistle': {
          const pattern = o.pattern || 'short';
          const blasts = pattern === 'end' ? [[0, 0.22], [0.3, 0.22], [0.6, 0.9]] : pattern === 'long' ? [[0, 0.75]] : [[0, 0.28]];
          for (const [st, dur] of blasts) {
            const c = this.ctx, osc = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
            osc.type = 'sine'; osc.frequency.value = 2900;
            lfo.frequency.value = 32; lg.gain.value = 140;
            lfo.connect(lg); lg.connect(osc.frequency);
            g.gain.setValueAtTime(0.0001, t + st);
            g.gain.exponentialRampToValueAtTime(0.22, t + st + 0.02);
            g.gain.setValueAtTime(0.22, t + st + dur - 0.04);
            g.gain.exponentialRampToValueAtTime(0.0001, t + st + dur);
            osc.connect(g); g.connect(this.sfxBus);
            osc.start(t + st); lfo.start(t + st); osc.stop(t + st + dur + 0.05); lfo.stop(t + st + dur + 0.05);
          }
          break;
        }
        case 'cheer': {
          this.excite = Math.min(1.5, this.excite + (o.amount || 1));
          this.noiseHit(900, 0.4, 2.2, 0.35 * (o.amount || 1), 'bandpass');
          this.noiseHit(2400, 0.5, 1.6, 0.15 * (o.amount || 1), 'bandpass');
          break;
        }
        case 'ooh': this.excite = Math.min(1.2, this.excite + 0.5); this.noiseHit(450, 1.2, 1.1, 0.25, 'bandpass'); break;
        case 'click': this.osc('square', 660, 660, 0.04, 0.06); break;
        case 'select': this.osc('square', 880, 1320, 0.08, 0.06); break;
        case 'card': this.osc('square', 440, 330, 0.18, 0.08); break;
      }
    } catch { /* áudio é opcional */ }
  }

  // ─── Torcida ambiente ─────────────────────────────────────────────────────
  startCrowd() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.6;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2200;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
    s.connect(f); f.connect(f2); f2.connect(this.crowdGain); this.crowdGain.connect(this.sfxBus);
    s.start();
    this.crowdFilter = f;
  }

  setCrowd(level, dt) {
    if (!this.ctx || !this.crowdGain) return;
    this.excite = Math.max(0, this.excite - dt * 0.35);
    const target = level <= 0 ? 0 : clamp(0.05 * level + this.excite * 0.16, 0, 0.4);
    const g = this.crowdGain.gain;
    g.value += (target - g.value) * Math.min(1, dt * 3);
    this.crowdFilter.frequency.value = 600 + this.excite * 500;
  }

  // ─── Trilha (chiptune original) ──────────────────────────────────────────
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    const bpm = 118, sixteenth = 60 / bpm / 4;
    // progressão I - vi - IV - V em Ré maior; melodia em escala pentatônica
    const roots = [50, 47, 43, 45];
    const pent = [0, 2, 4, 7, 9, 12, 14, 16];
    const mel = [7, -1, 5, 4, 5, -1, 3, 2, 3, -1, 4, -1, 2, 1, 0, -1, 4, -1, 3, 4, 5, -1, 6, 5, 4, -1, 2, -1, 3, 2, 1, -1];
    const f = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (this.nextT < this.ctx.currentTime + 0.25) {
        const s = this.step, bar = Math.floor(s / 16) % 4, pos = s % 16;
        const root = roots[bar];
        if (pos % 4 === 0) this.osc('triangle', f(root - 12), f(root - 12), sixteenth * 3.5, 0.22, this.musicBus, this.nextT);
        if (pos % 4 === 2) this.osc('triangle', f(root - 5), f(root - 5), sixteenth * 1.5, 0.12, this.musicBus, this.nextT);
        const m = mel[(s % 32)];
        if (m >= 0 && pos % 2 === 0) {
          const n = root + 12 + pent[(m + bar) % pent.length];
          this.osc('square', f(n), f(n), sixteenth * 1.8, 0.05, this.musicBus, this.nextT);
        }
        if (pos % 2 === 1) this.noiseHit(8000, 1, 0.03, 0.04, 'highpass', this.nextT, this.musicBus);
        if (pos === 4 || pos === 12) this.noiseHit(1800, 0.8, 0.09, 0.08, 'bandpass', this.nextT, this.musicBus);
        this.nextT += sixteenth;
        this.step++;
      }
      this.musicTimer = setTimeout(tick, 80);
    };
    tick();
  }

  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }

  // ─── Narração ─────────────────────────────────────────────────────────────
  say(key, priority = 1) {
    const vol = this.settings.vol.voice;
    if (vol <= 0) return;
    const bank = PHRASES[key];
    if (!bank) return;
    try {
      if (!('speechSynthesis' in window)) return;
      const now = performance.now();
      if (speechSynthesis.speaking && priority < 2 && now - this.speaking < 1800) return;
      if (priority >= 2) speechSynthesis.cancel();
      // evita repetir a mesma frase seguida
      let phrase = pick(bank);
      if (bank.length > 1) while (phrase === this.lastPhrase[key]) phrase = pick(bank);
      this.lastPhrase[key] = phrase;
      const u = new SpeechSynthesisUtterance(phrase);
      u.lang = 'pt-BR';
      if (this.voice) u.voice = this.voice;
      u.volume = vol;
      u.rate = key === 'goal' ? 1.15 : 1.08;
      u.pitch = key === 'goal' ? 1.2 : 1;
      speechSynthesis.speak(u);
      this.speaking = now;
    } catch { /* sem narração */ }
  }
}
