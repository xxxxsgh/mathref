import { Easing } from '../core/Easing.js';

/**
 * Animação procedural da viewmodel por keyframes.
 *
 * Uma POSE tem quatro canais, todos como DESLOCAMENTO em relação à pose de
 * descanso da arma (então "tudo zero" = idle):
 *   rp/rr — posição/rotação da mão (e de tudo que ela segura)
 *   ip/ir — posição/rotação do ITEM em relação à mão (giros nos dedos)
 *   m     — deslocamento do carregador (0 encaixado, 1 fora)
 *
 * Rotações são Euler interpoladas componente a componente — de propósito:
 * quaternions pegam o caminho mais curto e "comeriam" giros de 360°/720°,
 * que são justamente o charme da inspeção da faca.
 *
 * Toda troca de clipe faz crossfade a partir da pose atual, então nunca há
 * salto de transform (ex.: cancelar a inspeção no meio de um giro).
 */

/** @typedef {{ rp: number[], rr: number[], ip: number[], ir: number[], m: number }} Pose */

/**
 * @typedef {Object} Key
 * @property {number} t
 * @property {number[]} [rp]
 * @property {number[]} [rr]
 * @property {number[]} [ip]
 * @property {number[]} [ir]
 * @property {number} [m]
 * @property {keyof typeof Easing} [e]  easing do trecho que TERMINA nesta key
 */

/**
 * @typedef {Object} Clip
 * @property {string} name
 * @property {Key[]} keys
 * @property {number} duration
 * @property {number} [blendIn]
 * @property {boolean} [loop]
 * @property {Record<string, number>} [events] nome → instante (s)
 */

export function zeroPose() {
  return { rp: [0, 0, 0], rr: [0, 0, 0], ip: [0, 0, 0], ir: [0, 0, 0], m: 0 };
}

/** @param {Pose} out @param {Pose} src */
export function copyPose(out, src) {
  for (const c of ['rp', 'rr', 'ip', 'ir']) for (let i = 0; i < 3; i++) out[c][i] = src[c][i];
  out.m = src.m;
  return out;
}

/** Normaliza ângulos para (-π, π] — usado ao "congelar" a pose para crossfade. */
function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Preenche canais omitidos repetindo o valor da key anterior (hold) e
 * garante uma key em t=0 com a pose zero. Feito uma vez por clipe.
 * @param {Clip} clip
 */
export function prepareClip(clip) {
  if (clip.keys[0].t > 0) clip.keys.unshift({ t: 0 });
  let prev = zeroPose();
  for (const k of clip.keys) {
    k.rp = k.rp ? [...k.rp] : [...prev.rp];
    k.rr = k.rr ? [...k.rr] : [...prev.rr];
    k.ip = k.ip ? [...k.ip] : [...prev.ip];
    k.ir = k.ir ? [...k.ir] : [...prev.ir];
    k.m = k.m ?? prev.m;
    prev = /** @type {Pose} */ (/** @type {any} */ (k));
  }
  clip.duration = clip.duration ?? clip.keys[clip.keys.length - 1].t;
  return clip;
}

/**
 * Amostra um clipe no tempo t.
 * @param {Clip} clip @param {number} t @param {Pose} out
 */
export function sampleClip(clip, t, out) {
  const keys = clip.keys;
  if (t <= 0) return copyPose(out, /** @type {any} */ (keys[0]));
  const last = keys[keys.length - 1];
  if (t >= last.t) return copyPose(out, /** @type {any} */ (last));
  let i = 1;
  while (i < keys.length && keys[i].t < t) i++;
  const a = /** @type {any} */ (keys[i - 1]);
  const b = /** @type {any} */ (keys[i]);
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 1;
  const e = Easing[b.e || 'inOutSine'](u);
  for (const c of ['rp', 'rr', 'ip', 'ir']) for (let j = 0; j < 3; j++) out[c][j] = a[c][j] + (b[c][j] - a[c][j]) * e;
  out.m = a.m + (b.m - a.m) * e;
  return out;
}

export class Animator {
  constructor() {
    /** @type {Pose} */
    this.pose = zeroPose();
    /** @type {Clip|null} */
    this.clip = null;
    this.time = 0;
    this.speed = 1;
    this.from = zeroPose();
    this.blend = 0;
    this.blendTime = 0;
    this.sampled = zeroPose();
    /** @type {Set<string>} eventos já disparados no clipe atual */
    this.fired = new Set();
    /** @type {((name: string, clip: Clip) => void)|null} */
    this.onEvent = null;
    this.finished = true;
  }

  /**
   * @param {Clip} clip
   * @param {{ blend?: number, speed?: number }} [opts]
   */
  play(clip, opts = {}) {
    // Congela a pose atual (com ângulos normalizados) como origem do crossfade.
    copyPose(this.from, this.pose);
    for (const c of ['rr', 'ir']) for (let i = 0; i < 3; i++) this.from[c][i] = wrap(this.from[c][i]);
    this.blendTime = opts.blend ?? clip.blendIn ?? 0.12;
    this.blend = this.blendTime > 0 ? 0 : 1;
    this.clip = clip;
    this.time = 0;
    this.speed = opts.speed ?? 1;
    this.fired.clear();
    this.finished = false;
  }

  /** Volta suavemente para o idle (pose zero) — usado em cancelamentos. */
  stop(blend = 0.18) {
    this.play(IDLE_CLIP, { blend });
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.clip) return;
    this.time += dt * this.speed;
    const clip = this.clip;
    if (clip.events) {
      for (const [name, at] of Object.entries(clip.events)) {
        if (!this.fired.has(name) && this.time >= at) {
          this.fired.add(name);
          this.onEvent?.(name, clip);
        }
      }
    }
    let t = this.time;
    if (t >= clip.duration) {
      if (clip.loop) {
        this.time %= clip.duration;
        t = this.time;
        this.fired.clear();
      } else if (!this.finished) {
        this.finished = true;
        this.onEvent?.('end', clip);
      }
    }
    sampleClip(clip, t, this.sampled);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendTime);
      const e = Easing.outCubic(this.blend);
      const p = this.pose;
      for (const c of ['rp', 'rr', 'ip', 'ir']) {
        for (let j = 0; j < 3; j++) p[c][j] = this.from[c][j] + (this.sampled[c][j] - this.from[c][j]) * e;
      }
      p.m = this.from.m + (this.sampled.m - this.from.m) * e;
    } else {
      copyPose(this.pose, this.sampled);
    }
  }

  get playing() {
    return !!this.clip && !this.finished;
  }

  get name() {
    return this.clip?.name ?? '';
  }
}

/** @type {Clip} */
export const IDLE_CLIP = prepareClip({ name: 'idle', keys: [{ t: 0 }, { t: 1 }], duration: 1, loop: true });
