/**
 * Receitas de síntese (todas procedurais). Cada entrada de SOUNDS:
 *   { variants, make(sr, rng, v) → Float32Array | [L, R], loop? }
 * `v` é o índice da variação (0..variants-1). O banco (bank.js) chama
 * `make` uma vez por variação, sob demanda, e cacheia o AudioBuffer.
 *
 * Camadas do tiro (perto): transiente/onda N de boca + "blast" de banda
 * larga + corpo grave saturado (punch) + sub + mecânica (ferrolho
 * destravando, mola, ferrolho batendo) + primeiras reflexões do chão e
 * das fachadas. A cauda (rolando entre os prédios) é um buffer à parte,
 * escolhido por ambiente (externo/interno) na hora de tocar.
 */
import {
  buf, white, pink, brown, biquad, biquadSweep, onepole, shape, ad, mix, gain, normalize, saturate, fade,
  copy, burst, modal, sweep, grains, nwave, stereoOf, rngOf,
} from './dsp.js';

const TAU = Math.PI * 2;
const R = (rng, a, b) => rng.range(a, b);

// ─── tiros ───────────────────────────────────────────────────────────────
/**
 * Tiro próximo. o.cal: 1 = 5.56 (seco, estalado), 1.3 = 7.62 (mais grave).
 * o.mech: volume da mecânica (o atirador ouve; inimigos quase não).
 */
function gunshot(sr, rng, o = {}) {
  const cal = o.cal ?? 1;
  const mech = o.mech ?? 1;
  const dur = o.dur ?? 0.7;
  const n = Math.ceil(sr * dur);
  const ch = [buf(sr, dur), buf(sr, dur)];
  const seedBase = Math.floor(rng.next() * 1e9);

  // 1) blast de banda larga: parte comum + parte por canal (largura estéreo)
  const blastMono = (k) => {
    const r = rngOf(seedBase + k * 7919);
    const x = white(n, r);
    biquad(x, sr, 'hp', 70, 0.7);
    biquad(x, sr, 'peak', 1400 / cal, 0.8, 5);
    biquad(x, sr, 'peak', 3800, 1.2, 2);
    biquad(x, sr, 'lp', 12500 / Math.sqrt(cal), 0.6);
    shape(x, sr, (t) => (t < 0.00015 ? t / 0.00015 : 1) * (0.85 * Math.exp(-t / (0.0055 * cal)) + 0.26 * Math.exp(-t / (0.03 * cal)) + 0.05 * Math.exp(-t / 0.11)));
    return x;
  };
  const [bL, bR] = stereoOf(blastMono, 0.35);

  // 2) corpo: senoide com queda rápida de pitch, saturada (o "soco" no peito)
  const f0 = R(rng, 150, 175) / cal, f1 = R(rng, 46, 54) / Math.sqrt(cal);
  const body = sweep(sr, 0.25, (t) => f1 + (f0 - f1) * Math.exp(-t / 0.014), (t) => (t < 0.0008 ? t / 0.0008 : 1) * Math.exp(-t / (0.034 * cal)));
  saturate(body, 3.2);
  fade(body, sr, 0, 0.08);
  // 3) sub (sente mais do que ouve)
  const sub = sweep(sr, 0.3, (t) => 38 + 22 * Math.exp(-t / 0.025), (t) => (t < 0.003 ? t / 0.003 : 1) * Math.exp(-t / (0.05 * cal)));
  fade(sub, sr, 0, 0.1);
  // 3b) "boom" de médios (200–700 Hz): o que dá peso no meio do mix
  const boomMono = (k) => {
    const r = rngOf(seedBase + 31 + k * 104729);
    const x = white(Math.ceil(sr * 0.3), r);
    biquad(x, sr, 'bp', R(rng, 320, 380) / Math.sqrt(cal), 0.9);
    biquad(x, sr, 'lowshelf', 160, 0.7, 3);
    shape(x, sr, (t) => (t < 0.0006 ? t / 0.0006 : 1) * (Math.exp(-t / (0.022 * cal)) + 0.15 * Math.exp(-t / 0.08)));
    return normalize(x, 1);
  };
  const [boomL, boomR] = stereoOf(boomMono, 0.4);
  // 4) onda N da boca (estalo agudo do primeiro milissegundo)
  const nw = nwave(sr, 0.00032, 1);
  biquad(nw, sr, 'hp', 900, 0.7);

  for (let c = 0; c < 2; c++) {
    const d = ch[c];
    mix(d, c ? bR : bL, sr, 0, 0.95);
    mix(d, body, sr, 0.0004, 0.5);
    mix(d, sub, sr, 0.0008, 0.3);
    mix(d, c ? boomR : boomL, sr, 0.0003, 0.75);
    mix(d, nw, sr, 0, 0.9);
  }

  // 5) mecânica: ferrolho destrava (~6 ms), mola, ferrolho fecha (~48 ms)
  if (mech > 0) {
    const clank = (at, scale, a) => {
      const base = [1820, 2630, 3540, 5080, 7350, 9100];
      const modes = base.map((f, i) => ({ f: f * scale * R(rng, 0.97, 1.03), tau: R(rng, 0.008, 0.03) / (1 + i * 0.35), a: [1, 0.8, 0.7, 0.55, 0.4, 0.25][i], ph: rng.next() * TAU }));
      const m = modal(sr, 0.12, modes, { at: 0 });
      const click = burst(sr, 0.01, rng, { type: 'hp', f: 2500, env: ad(0.0001, 0.0012) });
      mix(m, click, sr, 0, 1.4);
      for (let c = 0; c < 2; c++) mix(ch[c], m, sr, at, a * mech * (c ? 0.32 : 0.22)); // janela de ejeção à direita
    };
    clank(R(rng, 0.005, 0.008), 1, 0.9);
    clank(R(rng, 0.044, 0.052), R(rng, 0.86, 0.92), 1.0);
    // zumbido da mola do recuperador
    const spring = burst(sr, 0.09, rng, { type: [['bp', 950, 4], ['peak', 2400, 3, 6]], env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.07)) * 0.7 });
    for (let c = 0; c < 2; c++) mix(ch[c], spring, sr, 0.008, 0.08 * mech);
  }

  // 6) primeiras reflexões (chão ~8 ms, fachadas 20–70 ms), escuras e alternadas
  const er = blastMono(9);
  biquad(er, sr, 'lp', 3800, 0.7);
  const taps = o.indoor
    ? [[0.0045, 0.5, 0], [0.009, 0.38, 1], [0.013, 0.33, 0], [0.019, 0.27, 1], [0.026, 0.2, 0], [0.034, 0.16, 1]]
    : [[0.0075, 0.42, 0], [0.021, 0.2, 1], [0.034, 0.14, 0], [0.052, 0.11, 1], [0.071, 0.08, 0]];
  for (const [t, g, side] of taps) {
    mix(ch[side], er, sr, t * R(rng, 0.92, 1.08), g);
    mix(ch[1 - side], er, sr, t * R(rng, 0.95, 1.12) + 0.0012, g * 0.55);
  }

  for (const d of ch) {
    saturate(d, 1.35);
    fade(d, sr, 0, 0.05);
  }
  const m = Math.max(...ch.map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  for (const d of ch) gain(d, 0.97 / m);
  return ch;
}

/** Tiro distante (100 m+): sem transiente, só o "pop" grave e a rolagem. */
function gunshotFar(sr, rng, o = {}) {
  const dur = 1.6;
  const n = Math.ceil(sr * dur);
  const x = white(n, rng);
  biquad(x, sr, 'lp', o.lp ?? 1100, 0.7);
  biquad(x, sr, 'hp', 60, 0.7);
  shape(x, sr, (t) => (t < 0.002 ? t / 0.002 : 1) * (0.9 * Math.exp(-t / 0.018) + 0.22 * Math.exp(-t / 0.18) * (1 + 0.6 * Math.sin(t * 23))));
  const thump = sweep(sr, 0.3, (t) => 48 + 50 * Math.exp(-t / 0.02), (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.06));
  mix(x, thump, sr, 0, 0.8);
  // ecos discretos dos prédios
  const echo = copy(x);
  biquad(echo, sr, 'lp', 700, 0.7);
  for (const [t, g] of [[0.13, 0.4], [0.27, 0.28], [0.41, 0.2], [0.66, 0.13]]) mix(x, echo, sr, t * R(rng, 0.85, 1.2), g);
  fade(x, sr, 0, 0.3);
  return normalize(x, 0.9);
}

/** Cauda externa: o tiro rolando entre fachadas (≈2 s, estéreo, escurece). */
function tailOutdoor(sr, rng, o = {}) {
  const dur = o.dur ?? 2.4;
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k);
    const n = Math.ceil(sr * dur);
    const x = pink(n, r);
    biquadSweep(x, sr, 'lp', (t) => 3200 * Math.exp(-t / 0.35) + 260, 0.6);
    biquad(x, sr, 'hp', 55, 0.7);
    // AM lenta "rolante" (trovão)
    const am = white(n, r);
    onepole(am, sr, 9);
    onepole(am, sr, 9);
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(am[i]));
    const bumps = [[0.06, 1], [0.16, 0.75], [0.29, 0.6], [0.47, 0.42], [0.72, 0.3], [1.05, 0.18]].map(([t, g]) => [t * r.range(0.8, 1.25), g * r.range(0.7, 1.1)]);
    shape(x, sr, (t) => {
      let e = Math.exp(-t / 0.55) * 0.55;
      for (const [bt, g] of bumps) {
        const d = (t - bt) / 0.05;
        if (d > -3 && d < 12) e += g * (d < 0 ? Math.exp(-d * d) : Math.exp(-d * 0.35)) * 0.6;
      }
      return e * (t < 0.012 ? t / 0.012 : 1);
    });
    for (let i = 0; i < n; i++) x[i] *= 0.6 + 0.8 * Math.abs(am[i] / (mx || 1));
    return x;
  };
  const L = mk(1), Rr = mk(2);
  fade(L, sr, 0.004, 0.4);
  fade(Rr, sr, 0.004, 0.4);
  const m = Math.max(...[L, Rr].map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  return [gain(L, 0.9 / m), gain(Rr, 0.9 / m)];
}

/** Cauda interna: sala de concreto — densa, curta, com modos da sala. */
function tailIndoor(sr, rng) {
  const dur = 0.9;
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k);
    const n = Math.ceil(sr * dur);
    const x = white(n, r);
    biquadSweep(x, sr, 'lp', (t) => 7000 * Math.exp(-t / 0.12) + 500, 0.6);
    shape(x, sr, (t) => (t < 0.003 ? t / 0.003 : 1) * Math.exp(-t / 0.13));
    const modes = [118, 173, 241, 315, 402].map((f) => ({ f: f * r.range(0.95, 1.05), tau: r.range(0.08, 0.16), a: r.range(0.3, 0.6), ph: r.next() * TAU }));
    mix(x, modal(sr, dur, modes), sr, 0.004, 0.35);
    return x;
  };
  const L = mk(1), Rr = mk(2);
  fade(L, sr, 0.002, 0.2);
  fade(Rr, sr, 0.002, 0.2);
  const m = Math.max(...[L, Rr].map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  return [gain(L, 0.9 / m), gain(Rr, 0.9 / m)];
}

/** Explosão (perto): estalo, soco grave saturado, ronco longo e detritos. */
function explosion(sr, rng, o = {}) {
  const far = !!o.far;
  const dur = far ? 4.5 : 4;
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k);
    const n = Math.ceil(sr * dur);
    const x = new Float32Array(n);
    if (!far) mix(x, burst(sr, 0.15, r, { type: [['hp', 200], ['lp', 9000]], env: ad(0.0002, 0.012) }), sr, 0, 1.2);
    const boom = sweep(sr, 1.6, (t) => 28 + 70 * Math.exp(-t / 0.05), (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.35));
    saturate(boom, 2.5);
    mix(x, boom, sr, 0, far ? 0.8 : 1.0);
    const rum = brown(n, r);
    biquadSweep(rum, sr, 'lp', (t) => (far ? 380 : 1600) * Math.exp(-t / 0.5) + 90, 0.7);
    shape(rum, sr, (t) => Math.min(1, t / 0.01) * (Math.exp(-t / (far ? 1.4 : 0.9)) * (1 + 0.5 * Math.sin(t * 7.3 + k))));
    mix(x, rum, sr, far ? 0.02 : 0, 1.3);
    if (!far) {
      // detritos caindo
      mix(x, grains(sr, dur, r, { count: 140, span: [0.25, 2.6], fLo: 1200, fHi: 5500, len: [0.001, 0.006], amp: [0.03, 0.18], decayOver: 1.2 }), sr, 0, 1);
    }
    return x;
  };
  const L = mk(1), Rr = mk(2);
  for (const d of [L, Rr]) fade(d, sr, 0, 0.8);
  const m = Math.max(...[L, Rr].map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  return [gain(L, 0.95 / m), gain(Rr, 0.95 / m)];
}

// ─── balística perto do jogador ──────────────────────────────────────────
function crack(sr, rng) {
  const x = buf(sr, 0.12);
  mix(x, nwave(sr, R(rng, 0.00028, 0.00042), 1), sr, 0.001, 1);
  // "tsss" curtinho + reflexão do chão
  mix(x, burst(sr, 0.06, rng, { type: 'hp', f: 3500, env: ad(0.0002, 0.006) }), sr, 0.001, 0.45);
  mix(x, nwave(sr, 0.0004, 0.4), sr, 0.0065 + R(rng, 0, 0.003), 1);
  biquad(x, sr, 'peak', 4500, 1, 4);
  return normalize(x, 0.95);
}
function whiz(sr, rng) {
  const dur = 0.42;
  const n = Math.ceil(sr * dur);
  const x = white(n, rng);
  const fA = R(rng, 3000, 3800), fB = R(rng, 1100, 1500), tc = R(rng, 0.15, 0.2);
  biquadSweep(x, sr, 'bp', (t) => fB + (fA - fB) / (1 + Math.exp((t - tc) / 0.025)), 3.5);
  const tone = sweep(sr, dur, (t) => (fB + (fA - fB) / (1 + Math.exp((t - tc) / 0.025))) * 0.62, () => 1);
  mix(x, tone, sr, 0, 0.12);
  shape(x, sr, (t) => {
    const d = (t - tc) / (t < tc ? 0.07 : 0.11);
    return Math.exp(-d * d);
  });
  return normalize(x, 0.9);
}

// ─── impactos por material ───────────────────────────────────────────────
function impact(sr, rng, mat) {
  const dur = mat === 'glass' ? 0.7 : mat === 'metal' ? 0.6 : 0.35;
  const x = buf(sr, dur);
  const thud = (f, tau, g) => mix(x, sweep(sr, 0.2, (t) => f * (1 + 0.6 * Math.exp(-t / 0.006)), (t) => Math.min(1, t / 0.0006) * Math.exp(-t / tau)), sr, 0, g);
  switch (mat) {
    case 'metal': {
      mix(x, burst(sr, 0.02, rng, { type: 'hp', f: 2500, env: ad(0.0001, 0.0015) }), sr, 0, 0.9);
      const f = R(rng, 0.85, 1.2);
      const modes = [1010, 2330, 3870, 5640, 7710, 9900].map((m, i) => ({ f: m * f * R(rng, 0.97, 1.03), tau: R(rng, 0.04, 0.15) / (1 + i * 0.4), a: [0.7, 1, 0.8, 0.5, 0.35, 0.2][i], ph: rng.next() * TAU }));
      mix(x, modal(sr, dur, modes), sr, 0, 0.45);
      thud(140, 0.02, 0.4);
      if (rng.chance(0.4)) {
        // ricochete: assobio descendente com vibrato
        const f0 = R(rng, 2600, 3800), f1 = f0 * R(rng, 0.45, 0.6), L = R(rng, 0.25, 0.4);
        const ric = sweep(sr, L, (t) => (f0 + (f1 - f0) * (t / L)) * (1 + 0.012 * Math.sin(t * 260)), (t) => Math.min(1, t / 0.01) * Math.pow(1 - t / L, 1.5));
        mix(x, ric, sr, R(rng, 0.01, 0.03), 0.22);
      }
      break;
    }
    case 'wood': {
      mix(x, burst(sr, 0.05, rng, { type: 'bp', f: R(rng, 500, 800), q: 1.6, env: ad(0.0002, 0.014) }), sr, 0, 1.0);
      const modes = [180, 310, 530, 870].map((m) => ({ f: m * R(rng, 0.9, 1.1), tau: R(rng, 0.02, 0.045), a: R(rng, 0.4, 1), ph: rng.next() * TAU }));
      mix(x, modal(sr, 0.2, modes), sr, 0, 0.5);
      mix(x, grains(sr, dur, rng, { count: 18, span: [0.003, 0.09], fLo: 2000, fHi: 5000, amp: [0.1, 0.5], decayOver: 1 }), sr, 0, 0.6);
      break;
    }
    case 'flesh': {
      thud(72, 0.03, 0.9);
      mix(x, burst(sr, 0.08, rng, { type: 'lp', f: 900, env: ad(0.0006, 0.02) }), sr, 0, 0.9);
      const sq = burst(sr, 0.09, rng, { type: 'bp', f: R(rng, 1100, 1700), q: 2, env: (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.03) * (0.6 + 0.4 * Math.sin(t * 380)) });
      mix(x, sq, sr, 0.004, 0.55);
      break;
    }
    case 'glass': {
      mix(x, burst(sr, 0.05, rng, { type: 'hp', f: 3000, env: ad(0.0001, 0.006) }), sr, 0, 0.9);
      // estilhaços: dezenas de "plins" agudos espalhados
      for (let k = 0; k < 46; k++) {
        const t = 0.004 + Math.pow(rng.next(), 1.7) * 0.5;
        const f = R(rng, 2800, 9500);
        mix(x, modal(sr, 0.08, [{ f, tau: R(rng, 0.008, 0.035), a: 1 }, { f: f * R(rng, 1.4, 2.7), tau: 0.01, a: 0.5 }]), sr, t, R(rng, 0.05, 0.3) * (1 - t * 1.4));
      }
      mix(x, burst(sr, 0.35, rng, { type: 'hp', f: 2500, env: ad(0.002, 0.06) }), sr, 0, 0.25);
      break;
    }
    case 'dirt': {
      mix(x, burst(sr, 0.15, rng, { type: [['lp', 1500], ['hp', 120]], env: ad(0.0008, 0.03) }), sr, 0, 1.0);
      thud(85, 0.025, 0.55);
      mix(x, grains(sr, dur, rng, { count: 30, span: [0.01, 0.25], fLo: 1800, fHi: 5000, amp: [0.05, 0.25], decayOver: 1 }), sr, 0, 0.7);
      break;
    }
    case 'rubber':
    case 'plastic': {
      thud(160, 0.02, 0.8);
      mix(x, burst(sr, 0.05, rng, { type: 'bp', f: 900, q: 1.2, env: ad(0.0003, 0.01) }), sr, 0, 0.7);
      break;
    }
    default: {
      // concreto / tijolo / asfalto: estalo seco, baque, lascas e poeira
      const dark = mat === 'asphalt' ? 0.7 : mat === 'brick' ? 0.85 : 1;
      mix(x, burst(sr, 0.04, rng, { type: [['hp', 1200], ['lp', 9000 * dark]], env: ad(0.0001, 0.0028) }), sr, 0, 1.1);
      thud(110 * dark, 0.014, 0.6);
      mix(x, grains(sr, dur, rng, { count: 34, span: [0.006, 0.2], fLo: 2200 * dark, fHi: 6500 * dark, len: [0.0004, 0.002], amp: [0.08, 0.5], decayOver: 1.4 }), sr, 0, 0.75);
      mix(x, burst(sr, 0.3, rng, { type: 'bp', f: 4200 * dark, q: 0.6, env: ad(0.004, 0.06) }), sr, 0.003, 0.08);
    }
  }
  fade(x, sr, 0, mat === 'metal' || mat === 'glass' ? 0.15 : 0.03);
  return normalize(x, 0.92);
}

// ─── passos e corpo ──────────────────────────────────────────────────────
/** Um apoio (calcanhar ou ponta) numa superfície. */
function contact(sr, rng, mat, hard) {
  const x = buf(sr, 0.25);
  const g = 0.6 + hard * 0.4;
  // o baque grave é discreto: o que define a superfície são os médios/agudos
  const thud = (f, tau, a) => mix(x, sweep(sr, 0.12, (t) => f * (1 + 0.5 * Math.exp(-t / 0.005)), (t) => Math.min(1, t / 0.0012) * Math.exp(-t / tau)), sr, 0, a * 0.5);
  // corpo de médios da sola (borracha dura no chão)
  mix(x, burst(sr, 0.05, rng, { type: [['lp', 1400], ['hp', 180]], env: ad(0.0004, 0.007) }), sr, 0, 0.45 * g);
  switch (mat) {
    case 'metal': {
      thud(110, 0.012, 0.5 * g);
      const modes = [270, 610, 1140, 1880, 2860, 4100].map((f, i) => ({ f: f * R(rng, 0.94, 1.06), tau: R(rng, 0.04, 0.12) / (1 + i * 0.3), a: R(rng, 0.4, 1), ph: rng.next() * TAU }));
      mix(x, modal(sr, 0.25, modes), sr, 0.001, 0.22 * g);
      mix(x, burst(sr, 0.01, rng, { type: 'bp', f: 3000, q: 0.8, env: ad(0.0002, 0.002) }), sr, 0, 0.35 * g);
      break;
    }
    case 'wood': {
      thud(150, 0.022, 0.75 * g);
      mix(x, modal(sr, 0.2, [190, 345, 620].map((f) => ({ f: f * R(rng, 0.9, 1.1), tau: R(rng, 0.03, 0.06), a: R(rng, 0.5, 1) }))), sr, 0, 0.25 * g);
      mix(x, burst(sr, 0.02, rng, { type: 'bp', f: 2200, q: 0.7, env: ad(0.0003, 0.003) }), sr, 0, 0.3 * g);
      break;
    }
    case 'dirt': {
      thud(80, 0.016, 0.45 * g);
      mix(x, burst(sr, 0.1, rng, { type: [['lp', 2400], ['hp', 200]], env: ad(0.002, 0.018) }), sr, 0, 0.45 * g);
      mix(x, grains(sr, 0.2, rng, { count: Math.round(35 + 30 * hard), span: [0, 0.07], fLo: 1500, fHi: 4800, len: [0.0006, 0.003], amp: [0.08, 0.4] }), sr, 0, 0.75 * g);
      break;
    }
    case 'glass': {
      thud(95, 0.012, 0.4 * g);
      mix(x, grains(sr, 0.2, rng, { count: 30, span: [0, 0.08], fLo: 2500, fHi: 8000, len: [0.001, 0.01], amp: [0.1, 0.5] }), sr, 0, 0.6 * g);
      break;
    }
    case 'rubber':
    case 'plastic': {
      thud(120, 0.014, 0.7 * g);
      break;
    }
    default: {
      // concreto / asfalto / tijolo: bota de solado duro
      const dark = mat === 'asphalt' ? 0.75 : 1;
      thud(95, 0.011, 0.6 * g);
      mix(x, burst(sr, 0.02, rng, { type: 'bp', f: 2600 * dark, q: 0.9, env: ad(0.00015, 0.0026) }), sr, 0, 0.9 * g);
      mix(x, burst(sr, 0.06, rng, { type: 'bp', f: 4200 * dark, q: 0.8, env: (t) => Math.min(1, t / 0.006) * Math.exp(-t / 0.018) }), sr, 0.002, 0.1 * g);
      mix(x, grains(sr, 0.2, rng, { count: Math.round((mat === 'asphalt' ? 14 : 7) * (0.6 + hard)), span: [0, 0.05], fLo: 2500 * dark, fHi: 7000 * dark, len: [0.0003, 0.0015], amp: [0.05, 0.3] }), sr, 0, 0.5 * g);
    }
  }
  return x;
}
/** Passo: calcanhar + ponta (e arrasto) — `hard` 0 andando, 1 correndo. */
function footstep(sr, rng, mat, hard) {
  const x = buf(sr, 0.35);
  mix(x, contact(sr, rng, mat, hard), sr, 0.002, 1);
  mix(x, contact(sr, rng, mat, hard * 0.5), sr, hard ? R(rng, 0.022, 0.035) : R(rng, 0.045, 0.07), hard ? 0.55 : 0.45);
  // arrasto de sola
  mix(x, burst(sr, 0.12, rng, { type: 'bp', f: R(rng, 2500, 4000), q: 0.6, env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.09)) * 0.5 }), sr, 0.02, 0.05 + hard * 0.04);
  fade(x, sr, 0, 0.02);
  return normalize(x, 0.9);
}
/** Equipamento chacoalhando (fivelas, carregadores na placa, alça da arma). */
function gear(sr, rng, amt = 1) {
  const dur = 0.25;
  const x = buf(sr, dur);
  const k = Math.round(4 + 6 * amt);
  for (let i = 0; i < k; i++) {
    const t = Math.pow(rng.next(), 1.4) * 0.1;
    const f = R(rng, 2200, 6800);
    mix(x, modal(sr, 0.06, [{ f, tau: R(rng, 0.004, 0.018), a: 1 }, { f: f * R(rng, 1.5, 2.3), tau: 0.006, a: 0.4 }]), sr, t, R(rng, 0.2, 1));
  }
  // tecido + plástico (bolsas)
  mix(x, burst(sr, dur, rng, { type: 'bp', f: R(rng, 900, 1600), q: 0.7, env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.18)) * 0.5 }), sr, 0, 0.6 * amt);
  mix(x, burst(sr, 0.05, rng, { type: 'bp', f: 700, q: 1.5, env: ad(0.002, 0.012) }), sr, R(rng, 0.0, 0.03), 0.4);
  fade(x, sr, 0, 0.02);
  return normalize(x, 0.8);
}
function cloth(sr, rng, len = 0.3) {
  const n = Math.ceil(sr * len);
  const x = white(n, rng);
  biquad(x, sr, 'bp', R(rng, 1000, 1800), 0.6);
  biquad(x, sr, 'lowshelf', 400, 0.7, 4);
  const am = white(n, rng);
  onepole(am, sr, 40);
  onepole(am, sr, 40);
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(am[i]));
  shape(x, sr, (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t / len)), 1.5));
  for (let i = 0; i < n; i++) x[i] *= 0.3 + Math.abs(am[i]) / (mx || 1);
  return normalize(x, 0.7);
}
function landing(sr, rng, mat) {
  const x = buf(sr, 0.5);
  mix(x, contact(sr, rng, mat, 1), sr, 0, 1);
  mix(x, contact(sr, rng, mat, 0.8), sr, R(rng, 0.012, 0.025), 0.85);
  // corpo assentando (peito/joelhos) + equipamento
  mix(x, sweep(sr, 0.2, (t) => 60 + 30 * Math.exp(-t / 0.01), (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.05)), sr, 0.01, 0.7);
  mix(x, gear(sr, rng, 1), sr, 0.015, 0.55);
  fade(x, sr, 0, 0.03);
  return normalize(x, 0.95);
}
/** Slide: atrito contínuo (≈1.1 s, perde energia no fim). */
function slideScrape(sr, rng, mat) {
  const dur = 1.2;
  const n = Math.ceil(sr * dur);
  const x = white(n, rng);
  const f = mat === 'dirt' ? 1400 : mat === 'metal' ? 2600 : mat === 'wood' ? 1200 : 2000;
  biquadSweep(x, sr, 'bp', (t) => f * (1 - 0.35 * t), 0.5);
  biquad(x, sr, 'lowshelf', 300, 0.7, 6);
  const am = white(n, rng);
  onepole(am, sr, 25);
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(am[i]));
  shape(x, sr, (t) => Math.min(1, t / 0.02) * (t < 0.15 ? 1.3 - t * 2 : 1) * Math.exp(-Math.max(0, t - 0.5) / 0.35));
  for (let i = 0; i < n; i++) x[i] *= 0.65 + 0.6 * Math.abs(am[i]) / (mx || 1);
  const gr = grains(sr, dur, rng, { count: mat === 'dirt' ? 220 : 90, span: [0, 0.95], fLo: 1600, fHi: 6000, len: [0.0004, 0.002], amp: [0.05, 0.3], decayOver: 0.6 });
  mix(x, gr, sr, 0, mat === 'dirt' ? 1.2 : 0.6);
  mix(x, gear(sr, rng, 1), sr, 0, 0.35);
  fade(x, sr, 0.002, 0.2);
  return normalize(x, 0.85);
}
function mantleFoley(sr, rng, mat) {
  const x = buf(sr, 0.6);
  // duas mãos (luvas) batendo na borda
  const slap = (at, g) => {
    mix(x, burst(sr, 0.06, rng, { type: [['lp', 2200], ['hp', 150]], env: ad(0.0005, 0.012) }), sr, at, g);
    mix(x, contact(sr, rng, mat, 0.3), sr, at, g * 0.45);
  };
  slap(0, 0.9);
  slap(R(rng, 0.03, 0.06), 0.75);
  mix(x, cloth(sr, rng, 0.35), sr, 0.02, 0.55);
  mix(x, gear(sr, rng, 0.9), sr, 0.12, 0.5);
  mix(x, burst(sr, 0.2, rng, { type: 'bp', f: 1800, q: 0.7, env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.18)) }), sr, 0.15, 0.2);
  fade(x, sr, 0, 0.04);
  return normalize(x, 0.9);
}
function bodyDrop(sr, rng) {
  const x = buf(sr, 0.5);
  mix(x, sweep(sr, 0.3, (t) => 55 + 40 * Math.exp(-t / 0.012), (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.07)), sr, 0, 1);
  mix(x, burst(sr, 0.12, rng, { type: 'lp', f: 900, env: ad(0.002, 0.03) }), sr, 0, 0.7);
  mix(x, gear(sr, rng, 1), sr, 0.01, 0.6);
  mix(x, cloth(sr, rng, 0.3), sr, 0.0, 0.4);
  return normalize(x, 0.9);
}

// ─── arma: foley ─────────────────────────────────────────────────────────
function metalClick(sr, rng, base = 2800, tau = 0.008, a = 1) {
  return modal(sr, 0.06, [base, base * 1.63, base * 2.4, base * 3.3].map((f, i) => ({ f: f * R(rng, 0.97, 1.03), tau: tau / (1 + i * 0.3), a: a / (1 + i * 0.5), ph: rng.next() * TAU })));
}
function dryFire(sr, rng) {
  const x = buf(sr, 0.12);
  mix(x, metalClick(sr, rng, 3100, 0.006), sr, 0, 0.8);
  mix(x, burst(sr, 0.02, rng, { type: 'hp', f: 3000, env: ad(0.0001, 0.001) }), sr, 0, 0.7);
  mix(x, sweep(sr, 0.05, () => 900, ad(0.0005, 0.008)), sr, 0.001, 0.3);
  mix(x, metalClick(sr, rng, 4300, 0.004), sr, R(rng, 0.012, 0.018), 0.35);
  return normalize(x, 0.8);
}
function magOut(sr, rng) {
  const x = buf(sr, 0.45);
  mix(x, metalClick(sr, rng, 3600, 0.005), sr, 0, 0.6); // botão do retém
  mix(x, burst(sr, 0.2, rng, { type: 'bp', f: 2400, q: 1.2, env: (t) => Math.min(1, t / 0.05) * Math.exp(-Math.max(0, t - 0.08) / 0.03) }), sr, 0.02, 0.4); // carregador deslizando
  // estalo de polímero/metal saindo
  mix(x, modal(sr, 0.1, [1150, 2380, 3290, 4700].map((f) => ({ f: f * R(rng, 0.95, 1.05), tau: R(rng, 0.01, 0.03), a: R(rng, 0.5, 1) }))), sr, 0.13, 0.6);
  mix(x, burst(sr, 0.03, rng, { type: 'hp', f: 2000, env: ad(0.0002, 0.003) }), sr, 0.13, 0.6);
  mix(x, cloth(sr, rng, 0.25), sr, 0.15, 0.3);
  fade(x, sr, 0, 0.02);
  return normalize(x, 0.9);
}
function magIn(sr, rng) {
  const x = buf(sr, 0.4);
  mix(x, burst(sr, 0.1, rng, { type: 'bp', f: 2000, q: 1.2, env: (t) => Math.min(1, t / 0.06) }), sr, 0, 0.25); // entrando no poço
  // assenta: estalo firme + trava
  mix(x, sweep(sr, 0.1, () => 210, ad(0.0005, 0.015)), sr, 0.08, 0.5);
  mix(x, modal(sr, 0.12, [980, 2140, 3060, 4420, 6100].map((f) => ({ f: f * R(rng, 0.95, 1.05), tau: R(rng, 0.012, 0.035), a: R(rng, 0.5, 1) }))), sr, 0.08, 0.8);
  mix(x, burst(sr, 0.03, rng, { type: 'hp', f: 1500, env: ad(0.0001, 0.003) }), sr, 0.08, 0.9);
  mix(x, metalClick(sr, rng, 3900, 0.006), sr, 0.095, 0.5); // retém trava
  fade(x, sr, 0, 0.02);
  return normalize(x, 0.95);
}
function magSlap(sr, rng) {
  const x = buf(sr, 0.2);
  mix(x, burst(sr, 0.08, rng, { type: [['lp', 1800], ['hp', 120]], env: ad(0.0004, 0.012) }), sr, 0, 1);
  mix(x, sweep(sr, 0.1, () => 170, ad(0.0005, 0.02)), sr, 0, 0.5);
  mix(x, metalClick(sr, rng, 2500, 0.01), sr, 0.002, 0.3);
  return normalize(x, 0.85);
}
function boltRelease(sr, rng) {
  const x = buf(sr, 0.45);
  mix(x, metalClick(sr, rng, 3400, 0.004), sr, 0, 0.4); // retém do ferrolho
  mix(x, burst(sr, 0.04, rng, { type: 'hp', f: 3500, env: (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.012) }), sr, 0.006, 0.4); // "shk"
  // ferrolho batendo à frente: metal pesado
  mix(x, modal(sr, 0.3, [1580, 2870, 4390, 6080, 8300].map((f, i) => ({ f: f * R(rng, 0.97, 1.03), tau: R(rng, 0.03, 0.08) / (1 + i * 0.3), a: [1, 0.9, 0.7, 0.45, 0.3][i], ph: rng.next() * TAU }))), sr, 0.03, 0.75);
  mix(x, sweep(sr, 0.12, (t) => 140 + 60 * Math.exp(-t / 0.01), ad(0.0005, 0.025)), sr, 0.03, 0.7);
  mix(x, burst(sr, 0.03, rng, { type: 'hp', f: 1500, env: ad(0.0001, 0.003) }), sr, 0.03, 1);
  fade(x, sr, 0, 0.03);
  return normalize(x, 0.95);
}
function brass(sr, rng) {
  const x = buf(sr, 0.45);
  const base = R(rng, 0.92, 1.1);
  let t = 0, g = 1;
  for (let b = 0; b < 3 + (rng.chance(0.5) ? 1 : 0); b++) {
    const modes = [3900, 6420, 8820, 11300].map((f, i) => ({ f: f * base * R(rng, 0.99, 1.01), tau: R(rng, 0.03, 0.07) / (1 + i * 0.4), a: [1, 0.7, 0.45, 0.3][i], ph: rng.next() * TAU }));
    mix(x, modal(sr, 0.2, modes), sr, t, g);
    t += R(rng, 0.05, 0.11) * g + 0.02;
    g *= R(rng, 0.35, 0.55);
  }
  return normalize(x, 0.6);
}
function lowAmmo(sr, rng) {
  return normalize(modal(sr, 0.15, [{ f: 3350, tau: 0.035, a: 1 }, { f: 5080, tau: 0.02, a: 0.5 }, { f: 1690, tau: 0.02, a: 0.3 }]), 0.6);
}

// ─── UI / jogador ────────────────────────────────────────────────────────
function hitmarker(sr, rng, head) {
  const x = buf(sr, head ? 0.35 : 0.12);
  mix(x, burst(sr, 0.01, rng, { type: 'hp', f: 4000, env: ad(0.0001, 0.0008) }), sr, 0, 0.6);
  mix(x, modal(sr, 0.08, [{ f: 3150, tau: 0.007, a: 1 }, { f: 5400, tau: 0.004, a: 0.6 }, { f: 1600, tau: 0.006, a: 0.4 }]), sr, 0, 0.9);
  if (head) {
    mix(x, modal(sr, 0.3, [{ f: 2090, tau: 0.09, a: 1 }, { f: 4620, tau: 0.05, a: 0.5 }, { f: 6900, tau: 0.03, a: 0.3 }]), sr, 0.006, 0.7);
    // capacete: estalo metálico
    mix(x, metalClick(sr, rng, 2700, 0.02), sr, 0, 0.4);
  }
  fade(x, sr, 0, 0.01);
  return normalize(x, 0.8);
}
function killConfirm(sr, rng) {
  const x = buf(sr, 0.3);
  mix(x, burst(sr, 0.08, rng, { type: [['lp', 2500], ['hp', 100]], env: ad(0.0003, 0.02) }), sr, 0, 0.8);
  mix(x, sweep(sr, 0.15, (t) => 110 + 80 * Math.exp(-t / 0.01), ad(0.0006, 0.03)), sr, 0, 0.6);
  mix(x, modal(sr, 0.2, [{ f: 880, tau: 0.04, a: 0.6 }, { f: 2640, tau: 0.03, a: 0.5 }, { f: 3960, tau: 0.02, a: 0.4 }]), sr, 0.002, 0.6);
  return normalize(x, 0.85);
}
function hurt(sr, rng) {
  const x = buf(sr, 0.4);
  mix(x, sweep(sr, 0.3, (t) => 62 + 50 * Math.exp(-t / 0.01), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.06)), sr, 0, 1);
  mix(x, burst(sr, 0.15, rng, { type: 'lp', f: 700, env: ad(0.001, 0.03) }), sr, 0, 0.9);
  mix(x, gear(sr, rng, 0.7), sr, 0.01, 0.35);
  return normalize(x, 0.9);
}
function heartbeat(sr) {
  const x = buf(sr, 0.6);
  const beat = (at, f, a) => mix(x, sweep(sr, 0.25, (t) => f * (1 + 0.4 * Math.exp(-t / 0.02)), (t) => Math.min(1, t / 0.008) * Math.exp(-t / 0.05)), sr, at, a);
  beat(0, 46, 1);
  beat(0.27, 54, 0.7);
  return normalize(x, 0.9);
}

// ─── ambiente ────────────────────────────────────────────────────────────
/** Vento estéreo em loop (sem emenda: crossfade do fim no começo). */
function wind(sr, rng) {
  const dur = 14, xf = 2;
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k);
    const n = Math.ceil(sr * (dur + xf));
    const x = pink(n, r);
    const lfo = (t) => 0.5 + 0.5 * Math.sin(t * 0.37 + k) * Math.sin(t * 0.13 + 2 * k);
    biquadSweep(x, sr, 'bp', (t) => 280 + 520 * lfo(t), 0.9);
    const g = white(n, r);
    onepole(g, sr, 0.6);
    onepole(g, sr, 0.6);
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(g[i]));
    for (let i = 0; i < n; i++) x[i] *= 0.35 + 0.9 * Math.abs(g[i]) / (mx || 1);
    // assobio de quinas (fraco)
    const wh = white(n, r);
    biquadSweep(wh, sr, 'bp', (t) => 1400 + 600 * lfo(t * 1.7), 12);
    mix(x, wh, sr, 0, 0.12);
    const out = new Float32Array(Math.ceil(sr * dur));
    const nx = Math.ceil(sr * xf);
    for (let i = 0; i < out.length; i++) out[i] = x[i];
    for (let i = 0; i < nx; i++) {
      const a = i / nx;
      out[i] = x[i] * a + x[out.length + i] * (1 - a);
    }
    return out;
  };
  const L = mk(1), Rr = mk(2);
  const m = Math.max(...[L, Rr].map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  return [gain(L, 0.8 / m), gain(Rr, 0.8 / m)];
}
/** Ronco grave da cidade (geradores, distante) — loop. */
function roomtone(sr, rng) {
  const dur = 10, xf = 1.5;
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k);
    const n = Math.ceil(sr * (dur + xf));
    const x = brown(n, r);
    biquad(x, sr, 'lp', 180, 0.7);
    biquad(x, sr, 'hp', 30, 0.7);
    mix(x, sweep(sr, dur + xf, () => 50, () => 0.08), sr, 0, 1); // gerador
    const out = new Float32Array(Math.ceil(sr * dur));
    const nx = Math.ceil(sr * xf);
    for (let i = 0; i < out.length; i++) out[i] = x[i];
    for (let i = 0; i < nx; i++) {
      const a = i / nx;
      out[i] = x[i] * a + x[out.length + i] * (1 - a);
    }
    return out;
  };
  const L = mk(1), Rr = mk(2);
  const m = Math.max(...[L, Rr].map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  return [gain(L, 0.8 / m), gain(Rr, 0.8 / m)];
}
function jetFlyby(sr, rng) {
  const dur = 10;
  const n = Math.ceil(sr * dur);
  const tc = R(rng, 4.5, 5.5);
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k);
    const x = pink(n, r);
    biquadSweep(x, sr, 'lp', (t) => 400 + 3200 * Math.exp(-((t - tc) * (t - tc)) / 2.5), 0.7);
    const tone = white(n, r);
    biquadSweep(tone, sr, 'bp', (t) => 900 + 500 / (1 + Math.exp((t - tc) / 0.6)), 8);
    mix(x, tone, sr, 0, 0.3);
    shape(x, sr, (t) => Math.exp(-((t - tc) * (t - tc)) / (t < tc ? 6 : 3.5)));
    return x;
  };
  const L = mk(1), Rr = mk(2);
  // passa de um lado para o outro
  for (let i = 0; i < n; i++) {
    const p = 1 / (1 + Math.exp(-(i / sr - tc) / 0.9));
    L[i] *= 1.2 - p * 0.8;
    Rr[i] *= 0.4 + p * 0.8;
  }
  const m = Math.max(...[L, Rr].map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  for (const d of [L, Rr]) fade(d, sr, 0.5, 0.5);
  return [gain(L, 0.9 / m), gain(Rr, 0.9 / m)];
}
function heliFar(sr, rng) {
  const dur = 12;
  const n = Math.ceil(sr * dur);
  const x = pink(n, rng);
  biquad(x, sr, 'lp', 420, 0.8);
  const rate = R(rng, 4.6, 5.4);
  shape(x, sr, (t) => {
    const ph = (t * rate) % 1;
    return (0.35 + Math.exp(-ph * 9) * 1.4) * Math.sin(Math.PI * Math.min(1, t / dur));
  });
  mix(x, sweep(sr, dur, () => rate * 9, (t) => 0.06 * Math.sin(Math.PI * Math.min(1, t / dur))), sr, 0, 1);
  fade(x, sr, 0.3, 0.5);
  return normalize(x, 0.9);
}
function siren(sr) {
  const dur = 14;
  const x = sweep(sr, dur, (t) => 380 + 420 * (0.5 - 0.5 * Math.cos((TAU * t) / 7)), (t) => Math.sin(Math.PI * Math.min(1, t / dur)));
  const h = sweep(sr, dur, (t) => 2 * (380 + 420 * (0.5 - 0.5 * Math.cos((TAU * t) / 7))), (t) => 0.25 * Math.sin(Math.PI * Math.min(1, t / dur)));
  mix(x, h, sr, 0, 1);
  biquad(x, sr, 'lp', 1500, 0.7);
  return normalize(x, 0.8);
}
function rubble(sr, rng) {
  const x = grains(sr, 2.2, rng, { count: 160, span: [0, 1.8], fLo: 600, fHi: 3500, len: [0.002, 0.012], amp: [0.05, 0.6], decayOver: 0.8 });
  const thump = burst(sr, 0.4, rng, { type: 'lp', f: 300, env: ad(0.01, 0.12) });
  mix(x, thump, sr, 0, 0.8);
  biquad(x, sr, 'lp', 2500, 0.7);
  fade(x, sr, 0, 0.3);
  return normalize(x, 0.8);
}

// ─── armas v3: supressor, bomba, ferrolho, fita, faca ────────────────────
/**
 * Tiro SUPRIMIDO: sem onda N nem estalo de boca — um "tump" grave filtrado
 * pelo supressor, um chiado curto de gás e a mecânica bem mais audível
 * (no tiro aberto ela fica mascarada).
 */
function suppressedShot(sr, rng, o = {}) {
  const cal = o.cal ?? 1;
  const dur = 0.42;
  const ch = [buf(sr, dur), buf(sr, dur)];
  const thump = burst(sr, 0.14, rng, { type: [['lp', 950 / Math.sqrt(cal)], ['hp', 70]], env: ad(0.0006, 0.022 * cal) });
  const pop = burst(sr, 0.02, rng, { type: 'bp', f: 2300, q: 0.8, env: ad(0.0002, 0.004) });
  const body = sweep(sr, 0.16, (t) => 75 / cal + 55 * Math.exp(-t / 0.01), ad(0.0008, 0.03 * cal));
  const hiss = burst(sr, 0.1, rng, { type: 'hp', f: 3200, env: ad(0.003, 0.03) });
  for (let c = 0; c < 2; c++) {
    mix(ch[c], thump, sr, 0, 1);
    mix(ch[c], pop, sr, 0, 0.3);
    mix(ch[c], body, sr, 0.0005, 0.6);
    mix(ch[c], hiss, sr, 0.004, 0.14);
    mix(ch[c], metalClick(sr, rng, 2400, 0.02), sr, R(rng, 0.005, 0.008), c ? 0.55 : 0.4);
    mix(ch[c], metalClick(sr, rng, 2050, 0.03), sr, R(rng, 0.042, 0.05), c ? 0.6 : 0.45);
  }
  for (const d of ch) fade(d, sr, 0, 0.06);
  const m = Math.max(...ch.map((d) => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)));
  for (const d of ch) gain(d, 0.9 / m);
  return ch;
}
/** Arrasto metálico curto (telha/ferrolho deslizando) + batida no fim. */
function slideClack(sr, rng, { len = 0.09, f = 1900, hit = 1300, hitA = 0.8, heavy = 0.5 } = {}) {
  const x = buf(sr, len + 0.25);
  mix(x, burst(sr, len, rng, { type: 'bp', f: f * R(rng, 0.92, 1.08), q: 1.1, env: (t) => Math.min(1, t / 0.015) * (0.6 + 0.4 * Math.sin(t * 90)) }), sr, 0, 0.4);
  mix(x, modal(sr, 0.2, [hit, hit * 1.7, hit * 2.6, hit * 3.9].map((ff, i) => ({ f: ff * R(rng, 0.96, 1.04), tau: R(rng, 0.02, 0.06) / (1 + i * 0.3), a: [1, 0.8, 0.5, 0.3][i], ph: rng.next() * TAU }))), sr, len, hitA);
  mix(x, sweep(sr, 0.1, (t) => 150 + 60 * Math.exp(-t / 0.01), ad(0.0005, 0.02)), sr, len, heavy);
  mix(x, burst(sr, 0.02, rng, { type: 'hp', f: 1800, env: ad(0.0001, 0.003) }), sr, len, 0.7);
  fade(x, sr, 0, 0.03);
  return normalize(x, 0.9);
}
function shellIn(sr, rng) {
  const x = buf(sr, 0.3);
  mix(x, burst(sr, 0.06, rng, { type: 'bp', f: 1500, q: 1, env: (t) => Math.min(1, t / 0.02) }), sr, 0, 0.3); // casca entrando
  mix(x, metalClick(sr, rng, 3300, 0.006), sr, 0.055, 0.7); // aro no elevador
  mix(x, modal(sr, 0.12, [820, 1730, 2900].map((f) => ({ f: f * R(rng, 0.95, 1.05), tau: R(rng, 0.01, 0.03), a: 1 }))), sr, 0.06, 0.5);
  mix(x, metalClick(sr, rng, 4100, 0.004), sr, 0.08, 0.35); // mola do tubo
  fade(x, sr, 0, 0.02);
  return normalize(x, 0.85);
}
function linkRattle(sr, rng) {
  const x = grains(sr, 0.5, rng, { count: 34, span: [0, 0.38], fLo: 2500, fHi: 6500, len: [0.002, 0.008], amp: [0.1, 0.6], decayOver: 0.4 });
  mix(x, cloth(sr, rng, 0.3), sr, 0, 0.3);
  fade(x, sr, 0, 0.04);
  return normalize(x, 0.8);
}
function whoosh(sr, rng) {
  const len = R(rng, 0.2, 0.28);
  const x = white(Math.ceil(sr * len), rng);
  biquadSweep(x, sr, 'bp', (t) => 700 + 2600 * Math.sin(Math.PI * Math.min(1, t / len)), 1.6);
  shape(x, sr, (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t / len)), 2));
  return normalize(x, 0.7);
}
function knifeFlip(sr, rng) {
  const x = buf(sr, 0.2);
  mix(x, metalClick(sr, rng, 3800, 0.012), sr, 0, 0.8);
  mix(x, metalClick(sr, rng, 4600, 0.008), sr, R(rng, 0.03, 0.05), 0.6);
  mix(x, whoosh(sr, rng).slice(0, Math.ceil(sr * 0.1)), sr, 0, 0.15);
  return normalize(x, 0.7);
}
function knifeCatch(sr, rng) {
  const x = buf(sr, 0.2);
  mix(x, burst(sr, 0.05, rng, { type: [['lp', 1600], ['hp', 120]], env: ad(0.0005, 0.012) }), sr, 0, 0.9);
  mix(x, metalClick(sr, rng, 3000, 0.01), sr, 0.004, 0.3);
  return normalize(x, 0.7);
}

// ─── registro ────────────────────────────────────────────────────────────
const MATS = ['concrete', 'asphalt', 'brick', 'metal', 'wood', 'dirt', 'glass', 'rubber'];

// ─── corpo em velocidade: vento nos ouvidos e respiração ─────────────────
/**
 * "Rush" de vento nos ouvidos (loop estéreo, 6 s com crossfade): ruído rosa
 * em banda larga com rajadas lentas e turbulência rápida, L/R
 * descorrelacionados. O volume e o pitch seguem a velocidade em tempo real.
 */
function rush(sr, rng) {
  const dur = 6, xf = 1;
  const mk = (k) => {
    const r = rngOf(Math.floor(rng.next() * 1e9) + k * 31);
    const n = Math.ceil(sr * (dur + xf));
    const x = pink(n, r);
    biquad(x, sr, 'hp', 140, 0.7);
    biquadSweep(x, sr, 'lp', (t) => 1800 + 900 * Math.sin(t * 1.9 + k) * Math.sin(t * 0.7), 0.7);
    // turbulência: AM com ruído lento (orelha cortando o ar)
    const am = white(n, r);
    onepole(am, sr, 9);
    onepole(am, sr, 9);
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(am[i]));
    for (let i = 0; i < n; i++) x[i] *= 0.55 + 0.8 * Math.abs(am[i]) / (mx || 1);
    const out = new Float32Array(Math.ceil(sr * dur));
    const nx = Math.ceil(sr * xf);
    for (let i = 0; i < out.length; i++) out[i] = x[i];
    for (let i = 0; i < nx; i++) {
      const a = i / nx;
      out[i] = x[i] * a + x[out.length + i] * (1 - a);
    }
    return normalize(out, 0.5);
  };
  return [mk(0), mk(1)];
}

/**
 * Respiração ofegante (pós sprint tático): ruído com formantes de vogal
 * aberta/sopro, envelope assimétrico. inhale = mais agudo e curto.
 */
function breath(sr, rng, inhale) {
  const len = inhale ? R(rng, 0.32, 0.42) : R(rng, 0.42, 0.55);
  const n = Math.ceil(sr * (len + 0.05));
  const x = new Float32Array(n);
  const forms = inhale ? [[620, 4, 1], [1250, 5, 0.7], [2600, 6, 0.35], [4200, 3, 0.25]] : [[520, 4, 1], [1050, 5, 0.65], [2300, 6, 0.3], [3600, 3, 0.15]];
  for (const [f, q, g] of forms) {
    const b = white(n, rng);
    biquad(b, sr, 'bp', f * R(rng, 0.92, 1.08), q);
    mix(x, b, sr, 0, g);
  }
  // fricção (sopro nos dentes/lábios)
  const h = white(n, rng);
  biquad(h, sr, 'hp', inhale ? 3500 : 2500, 0.7);
  mix(x, h, sr, 0, 0.18);
  shape(x, sr, (t) => {
    const u = Math.min(1, t / len);
    const env = inhale ? Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.3) : Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 1.6);
    return env * (1 + 0.15 * Math.sin(t * 90));
  });
  fade(x, sr, 0.01, 0.04);
  return normalize(x, 0.6);
}

export const SOUNDS = {
  shot_player: { variants: 5, make: (sr, rng) => gunshot(sr, rng, { cal: 1, mech: 1 }) },
  shot_player_in: { variants: 3, make: (sr, rng) => gunshot(sr, rng, { cal: 1, mech: 1, indoor: true }) },
  // tiros do jogador por arma (cal: timbre/corpo; mech: mecânica)
  shot_pistol: { variants: 4, make: (sr, rng) => gunshot(sr, rng, { cal: 0.85, mech: 0.8, dur: 0.55 }) },
  shot_smg: { variants: 5, make: (sr, rng) => gunshot(sr, rng, { cal: 0.78, mech: 0.75, dur: 0.5 }) },
  shot_shotgun: { variants: 3, make: (sr, rng) => gunshot(sr, rng, { cal: 1.75, mech: 0.3, dur: 0.95 }) },
  shot_sniper: { variants: 3, make: (sr, rng) => gunshot(sr, rng, { cal: 1.95, mech: 0.2, dur: 1.1 }) },
  shot_lmg: { variants: 5, make: (sr, rng) => gunshot(sr, rng, { cal: 1.28, mech: 0.9, dur: 0.7 }) },
  shot_dmr: { variants: 4, make: (sr, rng) => gunshot(sr, rng, { cal: 1.35, mech: 0.8, dur: 0.8 }) },
  shot_supp: { variants: 4, make: (sr, rng) => suppressedShot(sr, rng, { cal: 1 }) },
  shot_supp_heavy: { variants: 3, make: (sr, rng) => suppressedShot(sr, rng, { cal: 1.6 }) },
  pump_back: { variants: 2, make: (sr, rng) => slideClack(sr, rng, { len: 0.08, f: 1700, hit: 1150, hitA: 0.7 }) },
  pump_fwd: { variants: 2, make: (sr, rng) => slideClack(sr, rng, { len: 0.07, f: 2000, hit: 1350, hitA: 1, heavy: 0.8 }) },
  shell_in: { variants: 4, make: shellIn },
  bolt_up: { variants: 2, make: (sr, rng) => normalize(metalClick(sr, rng, 2700, 0.015), 0.7) },
  bolt_back: { variants: 2, make: (sr, rng) => slideClack(sr, rng, { len: 0.11, f: 2300, hit: 1700, hitA: 0.6, heavy: 0.3 }) },
  bolt_fwd: { variants: 2, make: (sr, rng) => slideClack(sr, rng, { len: 0.1, f: 2100, hit: 1450, hitA: 0.9, heavy: 0.6 }) },
  bolt_down: { variants: 2, make: (sr, rng) => normalize(metalClick(sr, rng, 3100, 0.012), 0.75) },
  cover_open: { variants: 1, make: (sr, rng) => slideClack(sr, rng, { len: 0.05, f: 1200, hit: 900, hitA: 0.6, heavy: 0.2 }) },
  cover_close: { variants: 1, make: (sr, rng) => slideClack(sr, rng, { len: 0.03, f: 1400, hit: 1000, hitA: 1, heavy: 1 }) },
  belt: { variants: 2, make: linkRattle },
  knife_swing: { variants: 4, make: whoosh },
  knife_flip: { variants: 3, make: knifeFlip },
  knife_catch: { variants: 2, make: knifeCatch },
  shot_enemy: { variants: 4, make: (sr, rng) => gunshot(sr, rng, { cal: 1.3, mech: 0.25, dur: 0.6 }) },
  shot_far: { variants: 4, make: (sr, rng) => gunshotFar(sr, rng) },
  shot_vfar: { variants: 3, make: (sr, rng) => gunshotFar(sr, rng, { lp: 520 }) },
  tail_out: { variants: 3, make: (sr, rng) => tailOutdoor(sr, rng) },
  tail_in: { variants: 2, make: (sr, rng) => tailIndoor(sr, rng) },
  explosion: { variants: 2, make: (sr, rng) => explosion(sr, rng) },
  explosion_far: { variants: 3, make: (sr, rng) => explosion(sr, rng, { far: true }) },
  crack: { variants: 4, make: crack },
  whiz: { variants: 4, make: whiz },
  dry: { variants: 2, make: dryFire },
  mag_out: { variants: 2, make: magOut },
  mag_in: { variants: 2, make: magIn },
  mag_slap: { variants: 2, make: magSlap },
  bolt: { variants: 2, make: boltRelease },
  brass: { variants: 6, make: brass },
  low_ammo: { variants: 1, make: lowAmmo },
  hitmarker: { variants: 3, make: (sr, rng) => hitmarker(sr, rng, false) },
  hit_head: { variants: 2, make: (sr, rng) => hitmarker(sr, rng, true) },
  kill: { variants: 2, make: killConfirm },
  hurt: { variants: 3, make: hurt },
  heartbeat: { variants: 1, make: heartbeat },
  gear: { variants: 6, make: (sr, rng) => gear(sr, rng, 1) },
  cloth: { variants: 5, make: (sr, rng) => cloth(sr, rng, 0.3) },
  cloth_long: { variants: 3, make: (sr, rng) => cloth(sr, rng, 0.55) },
  body_drop: { variants: 3, make: bodyDrop },
  wind: { variants: 1, make: wind, loop: true },
  rush: { variants: 1, make: rush, loop: true },
  breath_in: { variants: 4, make: (sr, rng) => breath(sr, rng, true) },
  breath_out: { variants: 4, make: (sr, rng) => breath(sr, rng, false) },
  roomtone: { variants: 1, make: roomtone, loop: true },
  jet: { variants: 2, make: jetFlyby },
  heli: { variants: 1, make: heliFar },
  siren: { variants: 1, make: siren },
  rubble: { variants: 3, make: rubble },
};
for (const m of MATS) {
  SOUNDS['step_' + m] = { variants: 8, make: (sr, rng) => footstep(sr, rng, m, 0) };
  SOUNDS['run_' + m] = { variants: 8, make: (sr, rng) => footstep(sr, rng, m, 1) };
  SOUNDS['land_' + m] = { variants: 3, make: (sr, rng) => landing(sr, rng, m) };
  SOUNDS['imp_' + m] = { variants: m === 'glass' ? 3 : 5, make: (sr, rng) => impact(sr, rng, m) };
  SOUNDS['slide_' + m] = { variants: 2, make: (sr, rng) => slideScrape(sr, rng, m) };
  SOUNDS['mantle_' + m] = { variants: 2, make: (sr, rng) => mantleFoley(sr, rng, m) };
}
SOUNDS.imp_flesh = { variants: 4, make: (sr, rng) => impact(sr, rng, 'flesh') };
SOUNDS.imp_plastic = SOUNDS.imp_rubber;

/** Normaliza o nome de material do mundo para um dos bancos. */
export function surfaceOf(mat) {
  if (!mat) return 'concrete';
  if (MATS.includes(mat)) return mat;
  if (mat === 'flesh') return 'flesh';
  if (mat === 'plastic') return 'rubber';
  if (mat === 'tiles' || mat === 'pavers' || mat === 'plaster') return 'concrete';
  if (mat === 'fabric' || mat === 'grass' || mat === 'sand' || mat === 'gravel') return 'dirt';
  return 'concrete';
}
