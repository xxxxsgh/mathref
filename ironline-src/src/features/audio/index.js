/**
 * Feature `audio` — áudio 100% sintetizado (WebAudio + DSP próprio).
 *
 *   dsp.js       DSP puro (filtros RBJ, ruídos, modal, grãos, onda N…) — roda no Node
 *   sounds.js    receitas: tiros em camadas, caudas, explosões, estalo/zumbido
 *                de bala, impactos e passos por material, foley de recarga,
 *                corpo/equipamento, UI de acerto, ambiente
 *   engine.js    grafo WebAudio: buses, ducking, concussão, reverb por
 *                convolução (IR gerada rua/sala), HRTF, atraso do som,
 *                absorção do ar e oclusão
 *   ambience.js  cama de guerra (vento, cidade, tiroteios e artilharia ao longe)
 *
 * Serviço `audio`: play(nome, opts) → voz | null, setVolume(v), context,
 * engine, indoor. Nomes legados dos stubs continuam valendo: 'shot',
 * 'enemy_shot', 'hit', 'impact', 'dry', 'brass'.
 *
 * Eventos ouvidos: weapon:fire/hit/reload/reloaded/dry/foley, enemy:fire/
 * damage/death, player:damage/death/step/jump/land/slide/mantle/stance/
 * sprint, vfx:explosion|explosion|grenade:explode.
 * Se a arma emitir `weapon:foley { name }` ('mag_out', 'mag_in',
 * 'mag_slap', 'bolt', 'cloth', 'gear'), a linha do tempo estimada de
 * recarga é desligada e o foley segue a animação exatamente.
 *
 * Modo screenshot: mudo (nem cria o AudioContext).
 */
import * as THREE from 'three';
import { AudioEngine } from './engine.js';
import { Ambience } from './ambience.js';
import { surfaceOf } from './sounds.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ALIAS = { shot: 'shot_player', enemy_shot: 'shot_enemy', hit: 'hitmarker', impact: 'imp_concrete', bolt_release: 'bolt' };
/** Tiro do jogador por arma (weapon:fire.id); suprimido → shot_supp(_heavy). */
const SHOT_BY_ID = { kr9: 'shot_player', p11: 'shot_pistol', mx9: 'shot_smg', br12: 'shot_shotgun', lr50: 'shot_sniper', hm60: 'shot_lmg', sr7: 'shot_dmr' };
const HEAVY = new Set(['lr50', 'sr7', 'hm60', 'br12']);

export default {
  name: 'audio',
  order: 25,
  init(ctx) {
    const eng = (this.eng = new AudioEngine(ctx));
    const amb = (this.amb = new Ambience(eng));
    const muted = !!ctx.shot;
    this.queue = []; // foley agendado no tempo do jogo
    this.envT = 0;
    this.lastAds = 0;
    this.heart = null;
    this.slideVoice = null;
    this.foleyDriven = false;
    this.enemySteps = new WeakMap();

    const play = (name, opts = {}) => {
      if (muted) return null;
      return eng.play(ALIAS[name] || name, opts);
    };
    this.play = play;

    if (!muted) {
      // Navegadores só liberam áudio depois de um gesto.
      const unlock = () => {
        eng.resume();
        if (eng.running) amb.start();
      };
      for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { passive: true });
      this._unlock = unlock;
      ctx.bus.on('input:lock', (on) => on && unlock());
    }

    ctx.provide('audio', {
      play,
      setVolume: (v) => eng.setVolume(v),
      get context() {
        return eng.ac;
      },
      get indoor() {
        return eng.indoor;
      },
      engine: eng,
      duck: (which, to, a, h, r) => eng.duck(which, to, a, h, r),
      concussion: (k) => eng.concussion(k),
    });
    if (muted) return;
    this.wire(ctx);
  },

  // ─── eventos ─────────────────────────────────────────────────────────
  wire(ctx) {
    const { bus } = ctx;
    const eng = this.eng;
    const play = this.play;
    const at = (delay, name, opts) => this.queue.push({ t: ctx.time.now + delay, name, opts });

    // ── arma do jogador ──
    bus.on('weapon:fire', (e) => {
      const k = eng.indoor;
      const w = ctx.services.weapon;
      const id = e?.id || w?.id;
      if (e?.suppressed) {
        // supressor: sem cauda de rua (quase), mecânica audível
        play(HEAVY.has(id) ? 'shot_supp_heavy' : 'shot_supp', { bus: 'weapon', volume: 0.8, reverb: 0.12 + k * 0.2, jitter: 0.03, cap: 6 });
        if (k > 0.05) play('tail_in', { bus: 'weapon', volume: 0.18 * k, reverb: 0, delay: 0.004, jitter: 0.04, cap: 5 });
      } else {
        const base = SHOT_BY_ID[id] || 'shot_player';
        const name = base === 'shot_player' && k > 0.55 ? 'shot_player_in' : base;
        const big = HEAVY.has(id) ? 1.35 : 1;
        play(name, { bus: 'weapon', volume: 0.95, reverb: 0.22 + k * 0.25, jitter: 0.025, cap: 6 });
        if (k < 0.95) play('tail_out', { bus: 'weapon', volume: 0.42 * (1 - k) * big, reverb: 0, delay: 0.012, jitter: 0.04, cap: 5, rate: big > 1 ? 0.85 : 1 });
        if (k > 0.05) play('tail_in', { bus: 'weapon', volume: 0.5 * k * big, reverb: 0, delay: 0.004, jitter: 0.04, cap: 5 });
      }
      const mag = w?.magSize || 30;
      const ammo = w?.ammo;
      if (typeof ammo === 'number' && ammo <= Math.max(3, Math.round(mag * 0.25))) play('low_ammo', { bus: 'ui', volume: 0.32, delay: 0.03, jitter: 0, rate: ammo === 0 ? 0.92 : 1 });
      eng.duck('amb', 0.35, 0.004, 0.06, 0.9);
      eng.duck('sfx', 0.72, 0.004, 0.03, 0.3);
    });
    bus.on('weapon:dry', () => play('dry', { bus: 'foley', volume: 0.7, cap: 2 }));
    bus.on('weapon:foley', (e) => {
      this.foleyDriven = true;
      if (e?.name) play(e.name, { bus: 'foley', volume: e.volume ?? 0.8, reverb: 0.08 });
    });
    bus.on('weapon:reload', (e) => {
      if (this.foleyDriven) return;
      const D = clamp(e?.duration || 2.2, 0.8, 5);
      this.queue = this.queue.filter((q) => !q.reload);
      const r = (t, name, vol) => this.queue.push({ t: ctx.time.now + t, name, opts: { bus: 'foley', volume: vol, reverb: 0.08 }, reload: true });
      r(0, 'cloth', 0.5);
      r(0.05, 'gear', 0.25);
      r(D * 0.2, 'mag_out', 0.8);
      r(D * 0.34, 'cloth_long', 0.35);
      const ins = Math.min(D * 0.62, 1.45);
      r(ins, 'mag_in', 0.95);
      r(ins + 0.13, 'mag_slap', 0.5);
      if (e?.empty) r(Math.max(ins + 0.35, D * 0.84), 'bolt', 0.95);
      else r(ins + 0.3, 'cloth', 0.3);
    });
    bus.on('weapon:reloaded', () => play('gear', { bus: 'foley', volume: 0.18 }));
    // faca: golpe (corte no ar); fôlego da luneta (segura/solta/arfa)
    bus.on('weapon:melee', () => play('knife_swing', { bus: 'foley', volume: 0.55, jitter: 0.05, cap: 3 }));
    bus.on('weapon:breath', (e) => {
      if (e?.phase === 'hold') play('breath_in', { bus: 'foley', volume: 0.35 });
      else if (e?.phase === 'release') play('breath_out', { bus: 'foley', volume: 0.3 });
      else if (e?.phase === 'gasp') play('breath_out', { bus: 'foley', volume: 0.55, rate: 0.92 });
    });

    // ── acertos ──
    let lastImpact = 0;
    bus.on('weapon:hit', (h) => {
      if (!h?.point) return;
      const now = ctx.time.now;
      const mat = h.part || h.material === 'flesh' || h.collider?.tag === 'enemy' ? 'flesh' : surfaceOf(h.material || h.collider?.material || ctx.services.world?.materialAt?.(h));
      const vol = (h.exit ? 0.45 : 0.85) * (now - lastImpact < 0.02 ? 0.6 : 1);
      lastImpact = now;
      play('imp_' + mat, { position: h.point, ref: mat === 'flesh' ? 2.5 : 3.5, volume: vol, reverb: 0.25, cap: 10, jitter: 0.06 });
    });
    let lastMarker = -1;
    bus.on('enemy:damage', (e) => {
      const info = e?.info || {};
      if (info.source && info.source !== 'player') return;
      const now = ctx.time.now;
      if (now - lastMarker < 0.03) return;
      lastMarker = now;
      play(info.part === 'head' ? 'hit_head' : 'hitmarker', { bus: 'ui', volume: 0.5, jitter: 0.02, cap: 3 });
    });
    bus.on('enemy:death', (e) => {
      play('kill', { bus: 'ui', volume: 0.5, delay: 0.04 });
      const g = e?.enemy?.group;
      if (g) at(0.55, 'body_drop', { position: g.position.clone(), ref: 3, volume: 0.9, reverb: 0.2 });
    });

    // ── tiros inimigos: disparo no lugar certo + estalo/zumbido perto ──
    bus.on('enemy:fire', (e) => {
      if (!e?.origin) return;
      const L = eng.listenerPos;
      const d = L ? L.distanceTo(e.origin) : 20;
      play(d > 90 ? 'shot_far' : 'shot_enemy', { position: e.origin, ref: d > 90 ? 30 : 9, volume: 0.95, reverb: 0.3, cap: 10, jitter: 0.04 });
      if (d < 90) play('tail_out', { position: e.origin, ref: 10, volume: 0.35 * (1 - eng.indoor * 0.7), reverb: 0.1, delay: 0.012, cap: 6, occlude: false });
      if (!L || !e.dir) return;
      // ponto de maior aproximação da trajetória
      const toL = _v.subVectors(L, e.origin);
      const s = toL.dot(e.dir);
      const hit = ctx.collision.raycast(e.origin, e.dir, 200, { filter: (c) => c.tag !== 'enemy' && c.owner !== e.enemy?.group });
      const maxS = hit ? hit.distance : 200;
      if (s > 1.5 && s < maxS + 1) {
        const closest = _w.copy(e.origin).addScaledVector(e.dir, s);
        const miss = closest.distanceTo(L);
        if (miss < 4) {
          const tBullet = s / 820; // supersônico: chega antes do estampido
          const k = clamp(1 - miss / 4, 0, 1);
          play('crack', { position: closest.clone(), ref: 1.5, volume: 0.55 + 0.45 * k, reverb: 0.25, sos: false, delay: tBullet, occlude: false, cap: 6, jitter: 0.08 });
          play('whiz', { position: closest.clone().addScaledVector(e.dir, 0.5), ref: 1.2, volume: 0.35 * k + 0.1, reverb: 0.05, sos: false, delay: tBullet - 0.15, occlude: false, cap: 6, jitter: 0.1 });
          eng.duck('amb', 0.6, 0.005, 0.05, 0.4);
        }
      }
      // impacto perto do jogador: ouve-se onde a bala bateu
      if (hit && L.distanceTo(hit.point) < 30) {
        const mat = surfaceOf(hit.collider?.material);
        play('imp_' + mat, { position: hit.point, ref: 3, volume: 0.7, reverb: 0.25, delay: hit.distance / 820, sos: true, cap: 10 });
      }
    });

    // ── explosões ──
    const boom = (e) => {
      const p = e?.point || e?.position;
      if (!p) return;
      const pos = p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]);
      const L = eng.listenerPos;
      const d = L ? L.distanceTo(pos) : 50;
      const r = e.radius ?? 6;
      const near = d < 70;
      play(near ? 'explosion' : 'explosion_far', { position: pos, ref: near ? 10 : 50, volume: 1, reverb: 0.4, cap: 4, jitter: 0.05 });
      const k = clamp(1 - d / (r * 4), 0, 1) * (e.intensity ?? 1);
      if (k > 0.05) {
        eng.concussion(k);
        eng.duck('amb', 0.2, 0.01, 0.4, 2);
      }
      eng.duck('sfx', 0.6, 0.01, 0.1, 0.8);
    };
    bus.on('vfx:explosion', boom);
    bus.on('explosion', boom);
    bus.on('grenade:explode', boom);

    // ── jogador: corpo ──
    bus.on('player:step', (e) => {
      const mat = surfaceOf(e?.material);
      const pan = (e?.foot ? 1 : -1) * 0.12;
      if (e?.stance === 'prone') {
        play('cloth', { bus: 'foley', volume: 0.35, pan, reverb: 0.02, cap: 3 });
        play('step_' + mat, { bus: 'foley', volume: 0.12, pan, rate: 0.85, reverb: 0.02, cap: 4 });
        return;
      }
      const run = e?.sprint;
      let vol = run ? (e.tactical ? 0.78 : 0.65) : clamp((e?.speed || 4) / 4.5, 0.4, 1) * 0.45;
      if (e?.stance === 'crouch') vol *= 0.45;
      vol *= 1 - 0.35 * (e?.ads || 0);
      play((run ? 'run_' : 'step_') + mat, { bus: 'foley', volume: vol, pan, reverb: 0.06, cap: 4, jitter: 0.05 });
      if (run) play('gear', { bus: 'foley', volume: e.tactical ? 0.32 : 0.22, pan: -pan, reverb: 0.02, cap: 3, delay: 0.01 });
      else if (Math.random() < 0.35) play('gear', { bus: 'foley', volume: 0.08, reverb: 0.02, cap: 2 });
    });
    bus.on('player:jump', (e) => {
      const mat = surfaceOf(e?.material);
      play('run_' + mat, { bus: 'foley', volume: 0.4, reverb: 0.05, cap: 4 });
      play('cloth', { bus: 'foley', volume: 0.45, cap: 3 });
      play('gear', { bus: 'foley', volume: e?.dive ? 0.5 : 0.3, delay: 0.03, cap: 3 });
    });
    bus.on('player:land', (e) => {
      const mat = surfaceOf(e?.material);
      const s = e?.speed || 4;
      if (e?.mantle) {
        play('step_' + mat, { bus: 'foley', volume: 0.5, cap: 4 });
        return;
      }
      const vol = clamp(0.25 + s * 0.08, 0.3, 1);
      play('land_' + mat, { bus: 'foley', volume: vol, reverb: 0.1, cap: 3, rate: e?.hard ? 0.9 : 1 });
      if (e?.hard) {
        play('body_drop', { bus: 'foley', volume: 0.6, cap: 2 });
        eng.duck('amb', 0.5, 0.005, 0.05, 0.4);
      }
    });
    bus.on('player:slide', (e) => {
      if (e?.on) {
        this.slideVoice?.stop(0.05);
        this.slideVoice = play('slide_' + surfaceOf(e.material), { bus: 'foley', volume: clamp((e.speed || 8) / 9, 0.5, 1) * 0.75, reverb: 0.06, cap: 2 });
        play('cloth_long', { bus: 'foley', volume: 0.4, cap: 2 });
      } else {
        this.slideVoice?.stop(0.18);
        this.slideVoice = null;
        play('cloth', { bus: 'foley', volume: 0.3, cap: 3 });
      }
    });
    bus.on('player:mantle', (e) => {
      play('mantle_' + surfaceOf(e?.material), { bus: 'foley', volume: 0.75, reverb: 0.06, cap: 2 });
      if (e?.vault) at(Math.max(0.2, (e.duration || 0.5) * 0.85), 'run_concrete', { bus: 'foley', volume: 0.5 });
    });
    bus.on('player:stance', (e) => {
      if (e?.stance === 'slide') return;
      if (e?.stance === 'prone') play('body_drop', { bus: 'foley', volume: 0.55, cap: 2 });
      else play(e?.from === 'prone' ? 'cloth_long' : 'cloth', { bus: 'foley', volume: e?.from === 'prone' ? 0.45 : 0.3, cap: 3 });
      if (e?.from === 'prone' || e?.stance === 'crouch') play('gear', { bus: 'foley', volume: 0.16, delay: 0.04, cap: 3 });
    });
    bus.on('player:sprint', (e) => {
      if (e?.level === 2) play('gear', { bus: 'foley', volume: 0.3, cap: 3 });
      else if (e?.level === 1) play('cloth', { bus: 'foley', volume: 0.25, cap: 3 });
    });
    bus.on('player:damage', (e) => {
      const a = clamp((e?.amount || 10) / 40, 0.2, 1);
      play('hurt', { bus: 'foley', volume: 0.5 + a * 0.4, cap: 3 });
      if ((e?.amount || 0) > 30) eng.concussion(0.35);
    });
    // partida (hud/match.js): a chegada de cada onda tem deixa sonora —
    // sirene distante e caça passando; onda limpa = respiro e equipamento
    bus.on('match:wave', (e) => {
      const p = ctx.camera?.position;
      if (p) this.play('siren', { position: new ctx.THREE.Vector3(p.x + 60, p.y + 20, p.z - 180), bus: 'amb', ref: 400, volume: 0.3, reverb: 0.7, sos: false, occlude: false, cap: 1, jitter: 0 });
      if ((e?.wave || 1) > 1) this.play('jet', { bus: 'amb', volume: 0.3, reverb: 0.25, cap: 1, delay: 1.2 });
    });
    bus.on('match:waveClear', () => {
      this.play('breath_out', { bus: 'foley', volume: 0.35, cap: 2 });
      this.play('gear', { bus: 'foley', volume: 0.18, delay: 0.3, cap: 3 });
    });
    bus.on('player:death', () => {
      eng.concussion(1);
      play('body_drop', { bus: 'foley', volume: 0.9 });
    });
  },

  // ─── por frame ───────────────────────────────────────────────────────
  frame(dt, ctx) {
    const eng = this.eng;
    if (!eng.running) return;
    eng.updateListener(ctx.camera);

    // foley agendado (no tempo do jogo: pausa junto)
    if (this.queue.length) {
      const now = ctx.time.now;
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        if (q.t > now) continue;
        this.queue.splice(i, 1);
        this.play(q.name, q.opts);
      }
    }

    // ADS: tecido + equipamento ao subir/baixar a arma
    const ads = Number(ctx.services.weapon?.ads) || 0;
    if (ads > 0.12 && this.lastAds <= 0.12) {
      this.play('cloth', { bus: 'foley', volume: 0.28, rate: 1.15, cap: 3 });
      this.play('gear', { bus: 'foley', volume: 0.12, cap: 3 });
    } else if (ads < 0.88 && this.lastAds >= 0.88) this.play('cloth', { bus: 'foley', volume: 0.2, rate: 1.05, cap: 3 });
    this.lastAds = ads;

    // batimento cardíaco com pouca vida
    const p = ctx.player;
    const low = p.alive && p.health < 35;
    if (low && !this.heart) this.heart = this.play('heartbeat', { bus: 'ui', loop: true, volume: 0.45, jitter: 0, cap: 1 });
    if (this.heart) {
      if (!low) {
        this.heart.stop(0.6);
        this.heart = null;
      } else this.heart.source.playbackRate.value = 1 + (35 - p.health) / 60;
    }

    // ambiente interno/externo (raios no mundo de colisão, 4×/s)
    this.envT -= dt;
    if (this.envT <= 0) {
      this.envT = 0.25;
      this.probeEnv(ctx);
    }

    this.enemyFootsteps(ctx);
    this.bodyLoops(dt, ctx, ads);
    this.amb.update(dt);
  },

  /**
   * Vento nos ouvidos (segue a velocidade: sprint tático, slide, queda) e
   * respiração ofegante pelo esforço acumulado — some ao mirar (o operador
   * segura o fôlego).
   */
  bodyLoops(dt, ctx, ads) {
    const p = ctx.player;
    const mv = ctx.services.movement;
    const v = p.velocity;
    const fall = Math.max(0, -v.y - 3);
    const s = Math.hypot(v.x, v.z) + fall * 0.8;
    let k = clamp((s - 5.2) / 4.5, 0, 1);
    k = Math.pow(k, 1.4) * (1 - 0.6 * ads) * (p.alive ? 1 : 0);
    const now = this.eng.ac.currentTime;
    if (k > 0.01 && !this.rushV) {
      this.rushV = this.play('rush', { bus: 'foley', loop: true, volume: 0, jitter: 0, reverb: 0, cap: 1 });
      this.rushIdle = 0;
    }
    if (this.rushV) {
      this.rushV.gain.setTargetAtTime(k * 0.3, now, k > (this.rushK || 0) ? 0.12 : 0.3);
      this.rushV.source.playbackRate.setTargetAtTime(0.8 + 0.45 * k, now, 0.2);
      this.rushK = k;
      this.rushIdle = k < 0.005 ? (this.rushIdle || 0) + dt : 0;
      if (this.rushIdle > 2) {
        this.rushV.stop(0.2);
        this.rushV = null;
      }
    }

    // esforço: sobe no sprint (bem mais no tático), desce parado
    const tac = !!mv?.tactical, spr = !!mv?.sprinting;
    const rate = tac ? 0.3 : spr ? 0.07 : -0.16;
    this.exert = clamp((this.exert || 0) + rate * dt, 0, 1);
    this.breathT = (this.breathT ?? 0) - dt;
    if (this.exert > 0.18 && this.breathT <= 0 && ads < 0.5 && p.alive) {
      const e = this.exert;
      this.breathIn = !this.breathIn;
      const vol = (0.08 + 0.28 * e) * (this.breathIn ? 0.8 : 1);
      this.play(this.breathIn ? 'breath_in' : 'breath_out', { bus: 'foley', volume: vol, reverb: 0.02, jitter: 0.05, cap: 2, rate: 1 + 0.08 * e });
      const period = 1.5 - 0.8 * e;
      this.breathT = this.breathIn ? period * 0.42 : period * 0.58;
    }
  },

  probeEnv(ctx) {
    const col = ctx.collision;
    const o = _v.copy(ctx.camera.position);
    const filt = { bullets: false, filter: (c) => c.tag !== 'enemy' };
    const up = col.raycast(o, _w.set(0, 1, 0), 40, filt);
    let enclosed = 0, sum = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = col.raycast(o, _w.set(Math.cos(a), 0.08, Math.sin(a)).normalize(), 30, filt);
      if (h) {
        enclosed++;
        sum += h.distance;
      } else sum += 30;
    }
    const roofed = up && up.distance < 12 ? 1 : 0;
    const target = clamp(roofed * (enclosed / 8) * 1.15, 0, 1);
    this.indoorK = (this.indoorK ?? target) + (target - (this.indoorK ?? target)) * 0.5;
    this.eng.setIndoor(this.indoorK);
    this.eng.roomSize = clamp(sum / 8 / 30, 0, 1);
  },

  enemyFootsteps(ctx) {
    const list = ctx.services.enemies?.list;
    if (!Array.isArray(list) || !this.eng.listenerPos) return;
    for (const e of list) {
      const g = e?.group;
      if (!g || e.alive === false) continue;
      let s = this.enemySteps.get(e);
      if (!s) {
        this.enemySteps.set(e, (s = { last: g.position.clone(), acc: 0 }));
        continue;
      }
      const d = Math.hypot(g.position.x - s.last.x, g.position.z - s.last.z);
      s.last.copy(g.position);
      if (d > 2) continue; // teleporte / respawn
      s.acc += d;
      if (s.acc > 1.45) {
        s.acc = 0;
        const dist = this.eng.listenerPos.distanceTo(g.position);
        if (dist > 45) continue;
        const run = d / Math.max(1e-3, ctx.time.frameDt || 1 / 60) > 4;
        this.play((run ? 'run_' : 'step_') + 'concrete', { position: g.position.clone().setY(g.position.y + 0.05), ref: 2, volume: run ? 0.75 : 0.55, reverb: 0.12, cap: 8 });
      }
    }
  },

  dispose() {
    if (this._unlock) for (const ev of ['pointerdown', 'keydown']) removeEventListener(ev, this._unlock);
    try {
      this.eng.ac?.close();
    } catch {}
  },
};
