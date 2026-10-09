/**
 * ONDAS do oceano.
 *
 *  - Conjunto de ondas de Gerstner (geometria + normais por pixel), com
 *    direções fixas no referencial do MUNDO (espalhadas em torno do vento) e
 *    fase calculada em DOUBLE na CPU para a origem de render — a fase no
 *    shader é k·(D·p_render) + fase0, sem perda de precisão longe do centro.
 *  - Textura de detalhe periódica (ondulações): soma de senoides com números
 *    de onda inteiros (encaixa sem costura), guardando gradiente, altura e
 *    laplaciano (o laplaciano negativo concentra luz = cáusticas).
 */
import * as THREE from 'three';

export const DETAIL_SIZE = 256;
/** Período-base (m) das camadas de detalhe — todas dividem este valor. */
export const DETAIL_BASE = 96;
/** Camadas de detalhe: período (m), amplitude (m), velocidade (m/s) */
export const DETAIL_LAYERS = [
  { T: 48, A: 0.12, v: [0.55, 0.2] },
  { T: 12, A: 0.075, v: [-0.32, 0.42] },
  { T: 3, A: 0.022, v: [0.24, -0.18] },
  { T: 0.75, A: 0.005, v: [-0.09, -0.12] },
];

/** RNG pequeno e determinístico. */
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Textura de detalhe RGBA (meia precisão): R,G = gradiente dh/du, dh/dv (por
 * unidade de uv, normalizado), B = altura (−1..1), A = laplaciano (−1..1).
 */
export function makeDetailTexture(seed = 7) {
  const N = DETAIL_SIZE;
  const rnd = mulberry(seed);
  const waves = [];
  // espectro tipo Phillips: mais energia nas frequências baixas, viés de direção
  for (let i = 0; i < 56; i++) {
    let kx, ky, k;
    do {
      kx = Math.round((rnd() * 2 - 1) * 22);
      ky = Math.round((rnd() * 2 - 1) * 22);
      k = Math.hypot(kx, ky);
    } while (k < 1.5);
    const dirBias = 0.55 + 0.45 * Math.abs(kx / k);
    const a = dirBias * Math.pow(k, -1.35) * (0.6 + 0.8 * rnd());
    waves.push({ kx, ky, k, a, ph: rnd() * Math.PI * 2 });
  }
  const H = new Float32Array(N * N);
  const GX = new Float32Array(N * N);
  const GY = new Float32Array(N * N);
  const L = new Float32Array(N * N);
  const TAU = Math.PI * 2;
  for (const w of waves) {
    const fx = TAU * w.kx, fy = TAU * w.ky;
    for (let y = 0; y < N; y++) {
      const vy = y / N;
      for (let x = 0; x < N; x++) {
        const arg = fx * (x / N) + fy * vy + w.ph;
        const s = Math.sin(arg), c = Math.cos(arg);
        const o = y * N + x;
        // cristas pontudas: senoide "trocoidal" barata (|sin| suavizado)
        H[o] += w.a * s;
        GX[o] += w.a * fx * c;
        GY[o] += w.a * fy * c;
        L[o] -= w.a * (fx * fx + fy * fy) * s;
      }
    }
  }
  let mh = 0, mg = 0, ml = 0;
  for (let o = 0; o < N * N; o++) {
    mh = Math.max(mh, Math.abs(H[o]));
    mg = Math.max(mg, Math.abs(GX[o]), Math.abs(GY[o]));
    ml = Math.max(ml, Math.abs(L[o]));
  }
  const data = new Uint16Array(N * N * 4);
  const h2 = THREE.DataUtils.toHalfFloat;
  // gradiente guardado em unidades de "altura normalizada por uv"
  for (let o = 0; o < N * N; o++) {
    data[o * 4] = h2(GX[o] / mh);
    data[o * 4 + 1] = h2(GY[o] / mh);
    data[o * 4 + 2] = h2(H[o] / mh);
    data[o * 4 + 3] = h2(L[o] / ml);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.name = 'water:detail';
  // escala do gradiente: |grad| máx em unidades de altura/uv (para o shader)
  t.userData.gradScale = mg / mh;
  return t;
}

export const GERSTNER_COUNT = 6;

/**
 * Conjunto de ondas de Gerstner em torno de um vento. `frame` = { east,
 * north, up } no ponto de referência; as direções ficam fixas no mundo.
 */
export class WaveSet {
  constructor(seed = 1) {
    this.rnd = mulberry(seed);
    this.dirs = [];
    this.k = new Float32Array(GERSTNER_COUNT);
    this.amp = new Float32Array(GERSTNER_COUNT);
    this.omega = new Float32Array(GERSTNER_COUNT);
    this.Q = new Float32Array(GERSTNER_COUNT);
    this.lambda = new Float32Array(GERSTNER_COUNT);
    this.phase0 = new Float32Array(GERSTNER_COUNT);
    this.windAngle = this.rnd() * Math.PI * 2;
    this.spread = [];
    for (let i = 0; i < GERSTNER_COUNT; i++) {
      this.dirs.push(new THREE.Vector3(1, 0, 0));
      this.spread.push((this.rnd() * 2 - 1) * (0.25 + i * 0.12));
    }
    this.state = 0.5;
    this.setSeaState(0.5);
  }

  /** 0 = espelho, 1 = mar agitado. */
  setSeaState(s) {
    this.state = s;
    const base = [26, 16.5, 10.5, 6.8, 4.3, 2.9];
    for (let i = 0; i < GERSTNER_COUNT; i++) {
      const L = base[i] * (0.75 + 0.6 * s);
      this.lambda[i] = L;
      const k = (Math.PI * 2) / L;
      this.k[i] = k;
      this.amp[i] = L * (0.004 + 0.011 * s) * (i === 0 ? 1.2 : 1);
      this.omega[i] = Math.sqrt(9.81 * k);
      // inclinação total ≤ ~0,7 (sem laços)
      this.Q[i] = Math.min(1, (0.55 + 0.25 * s) / (k * this.amp[i] * GERSTNER_COUNT));
    }
  }

  /** Direções no tangente local de `frame` (fixas daí em diante). */
  orient(frame) {
    for (let i = 0; i < GERSTNER_COUNT; i++) {
      const a = this.windAngle + this.spread[i];
      this.dirs[i].set(0, 0, 0).addScaledVector(frame.east, Math.cos(a)).addScaledVector(frame.north, Math.sin(a)).normalize();
    }
  }

  /**
   * Fase de cada onda na ORIGEM de render (double): k·(D·O) − ω·t, em
   * [0, 2π). O shader soma k·(D·p_render).
   */
  updatePhases(origin, center, time) {
    const TAU = Math.PI * 2;
    const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
    for (let i = 0; i < GERSTNER_COUNT; i++) {
      const d = this.dirs[i];
      let ph = this.k[i] * (d.x * ox + d.y * oy + d.z * oz) - this.omega[i] * time;
      ph -= Math.floor(ph / TAU) * TAU;
      this.phase0[i] = ph;
    }
  }

  /** Altura (m) da superfície sobre o nível do mar num ponto (relativo ao centro). */
  heightAt(px, py, pz, time) {
    let h = 0;
    for (let i = 0; i < GERSTNER_COUNT; i++) {
      const d = this.dirs[i];
      const ph = this.k[i] * (d.x * px + d.y * py + d.z * pz) - this.omega[i] * time;
      h += this.amp[i] * Math.sin(ph);
    }
    return h;
  }
}
