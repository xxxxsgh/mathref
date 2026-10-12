// Rastros em fita virados para a câmera: fumaça de míssil/flare/destroço em
// chamas (mistura alfa, erodida por ruído, iluminada pelo sol, com fogo na
// boca) e rastros de motor (aditivos, finos, cor do propulsor da facção).
//
// Cada rastro guarda pontos em double (mundo) num anel; a cada quadro as
// fitas são reconstruídas relativas à câmera numa única malha dinâmica.
import * as THREE from 'three/webgpu';
import { Fn, attribute, uv, uniform, vec3, vec4, float, pow, exp, smoothstep, abs, mix, clamp } from 'three/tsl';
import { fbm3, blackbody, sstep } from './tsl.js';

const STRIDE = 7; // x y z t w heat s
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _tan = new THREE.Vector3(), _side = new THREE.Vector3(), _view = new THREE.Vector3();

class Trail {
  constructor(batch, slot, opts) {
    this.batch = batch; this.slot = slot;
    this.N = batch.points;
    this.buf = new Float64Array(this.N * STRIDE);
    this.reset(opts);
  }
  reset(o = {}) {
    this.count = 0; this.head = 0; this.alive = true; this.emitting = true;
    this.life = o.life ?? 3;            // vida de cada ponto (s)
    this.width = o.width ?? 1;          // largura inicial (m)
    this.grow = o.grow ?? 6;            // largura final = width * grow (fumaça)
    this.minDist = o.minDist ?? 4;      // distância mínima entre pontos
    this.color = o.color || [0.5, 0.5, 0.52]; // albedo (fumaça) ou cor HDR (motor)
    this.intensity = o.intensity ?? 1;
    this.alpha = o.alpha ?? 1;
    this.seed = o.seed ?? Math.random();
    this.heat = o.heat ?? 0;
    this.s = 0;
    this.last = new THREE.Vector3(1e30, 0, 0);
    this.live = new THREE.Vector3();
    this.hasLive = false;
    this.endT = Infinity;
  }
  /** Posição atual do emissor (mundo). Adiciona ponto quando andou o bastante. */
  push(pos, now, heat = this.heat) {
    if (!this.emitting) return;
    this.live.copy(pos); this.hasLive = true; this.liveHeat = heat;
    const d = this.count ? pos.distanceTo(this.last) : Infinity;
    if (d < this.minDist) return;
    if (this.count) this.s += d;
    const i = this.head;
    const b = this.buf, o = i * STRIDE;
    b[o] = pos.x; b[o + 1] = pos.y; b[o + 2] = pos.z; b[o + 3] = now; b[o + 4] = this.width; b[o + 5] = heat; b[o + 6] = this.s;
    this.head = (i + 1) % this.N;
    this.count = Math.min(this.count + 1, this.N);
    this.last.copy(pos);
  }
  /** Para de emitir; some quando o último ponto expirar. */
  stop(now) { this.emitting = false; this.hasLive = false; this.endT = now + this.life; }
  release() { this.alive = false; this.batch.free.push(this.slot); this.batch.trails[this.slot] = null; }
}

export class RibbonBatch {
  /** mode: 'smoke' (alfa) | 'glow' (aditivo) */
  constructor(ctx, { trails = 48, points = 40, mode = 'smoke' } = {}) {
    this.ctx = ctx; this.mode = mode; this.points = points; this.maxTrails = trails;
    this.trails = new Array(trails).fill(null);
    this.free = [];
    for (let i = trails - 1; i >= 0; i--) this.free.push(i);
    const vPerTrail = (points + 1) * 2;
    const nv = trails * vPerTrail;
    this.vPerTrail = vPerTrail;
    this.pos = new Float32Array(nv * 3);
    this.uvs = new Float32Array(nv * 2);
    this.ex = new Float32Array(nv * 4);
    this.cl = new Float32Array(nv * 4);
    const idx = [];
    for (let t = 0; t < trails; t++) {
      const base = t * vPerTrail;
      for (let k = 0; k < points; k++) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage);
    this.aEx = new THREE.BufferAttribute(this.ex, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCl = new THREE.BufferAttribute(this.cl, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('uv', this.aUv);
    g.setAttribute('rEx', this.aEx); g.setAttribute('rCol', this.aCl);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    this.geometry = g;
    this.U = { sun: uniform(new THREE.Color(1, 0.95, 0.9)), ambient: uniform(new THREE.Color(0.05, 0.055, 0.07)), sunDir: uniform(new THREE.Vector3(0, 1, 0)) };
    this.material = mode === 'smoke' ? smokeMaterial(this.U) : glowMaterial();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === 'smoke' ? 9 : 13;
    this.mesh.name = 'combat.ribbons.' + mode;
    ctx.scene.add(this.mesh);
    this.maxUsed = 0;
  }

  alloc(opts) {
    if (!this.free.length) {
      // recicla o rastro mais antigo que já parou de emitir
      let best = -1, bt = Infinity;
      for (let i = 0; i < this.maxTrails; i++) { const t = this.trails[i]; if (t && !t.emitting && t.endT < bt) { bt = t.endT; best = i; } }
      if (best < 0) return null;
      this.trails[best].release();
    }
    const slot = this.free.pop();
    let t = this._pool?.[slot];
    if (!this._pool) this._pool = [];
    if (!t) { t = new Trail(this, slot, opts); this._pool[slot] = t; } else t.reset(opts);
    this.trails[slot] = t;
    return t;
  }

  /** Reconstrói a malha. now = relógio do combate; origin = origem flutuante. */
  update(now, origin, sunWorldDir = null) {
    const P = this.pos, UV = this.uvs, EX = this.ex, CL = this.cl;
    let used = 0;
    if (sunWorldDir) this.U.sunDir.value.copy(sunWorldDir);
    for (let ti = 0; ti < this.maxTrails; ti++) {
      const tr = this.trails[ti];
      const base = ti * this.vPerTrail;
      if (!tr) { this._clear(base); continue; }
      if (!tr.emitting && now > tr.endT) { tr.release(); this._clear(base); continue; }
      used = ti + 1;
      // pontos válidos do mais novo para o mais velho
      const list = this._list || (this._list = []);
      list.length = 0;
      if (tr.hasLive) list.push(-1);
      for (let k = 0; k < tr.count; k++) {
        const i = (tr.head - 1 - k + tr.N) % tr.N;
        const age = now - tr.buf[i * STRIDE + 3];
        if (age > tr.life) break;
        list.push(i);
      }
      const n = Math.min(list.length, this.points + 1);
      const get = (j, out) => {
        const i = list[j];
        if (i < 0) return out.copy(tr.live).sub(origin);
        const o = i * STRIDE; return out.set(tr.buf[o] - origin.x, tr.buf[o + 1] - origin.y, tr.buf[o + 2] - origin.z);
      };
      for (let j = 0; j <= this.points; j++) {
        const v = base + j * 2;
        if (j >= n || n < 2) { this._degen(v, P); continue; }
        get(j, _p);
        // tangente pelos vizinhos
        if (j + 1 < n) get(j + 1, _q).sub(_p).negate(); else get(j - 1, _q).sub(_p);
        _tan.copy(_q).normalize();
        _view.copy(_p).normalize();
        _side.crossVectors(_tan, _view);
        const sl = _side.length();
        if (sl < 1e-5) _side.set(1, 0, 0); else _side.divideScalar(sl);
        const i = list[j];
        const o = i * STRIDE;
        const birth = i < 0 ? now : tr.buf[o + 3];
        const age01 = Math.min(1, (now - birth) / tr.life);
        const w0 = i < 0 ? tr.width : tr.buf[o + 4];
        const heat = i < 0 ? tr.liveHeat ?? tr.heat : tr.buf[o + 5];
        const s = i < 0 ? tr.s + (tr.count ? tr.live.distanceTo(tr.last) : 0) : tr.buf[o + 6];
        const grow = this.mode === 'smoke' ? 1 + (tr.grow - 1) * Math.pow(age01, 0.55) : 1 - age01 * 0.6;
        const w = w0 * grow * (j === 0 && this.mode === 'smoke' ? 0.35 : 1);
        const fadeEnd = !tr.emitting ? Math.max(0, Math.min(1, (tr.endT - now) / (tr.life * 0.35))) : 1;
        for (let sd = 0; sd < 2; sd++) {
          const sign = sd ? 1 : -1;
          const vi = v + sd;
          P[vi * 3] = _p.x + _side.x * w * sign; P[vi * 3 + 1] = _p.y + _side.y * w * sign; P[vi * 3 + 2] = _p.z + _side.z * w * sign;
          UV[vi * 2] = sign; UV[vi * 2 + 1] = age01;
          EX[vi * 4] = tr.alpha * fadeEnd; EX[vi * 4 + 1] = heat; EX[vi * 4 + 2] = s / Math.max(0.5, tr.width * 2.2); EX[vi * 4 + 3] = tr.seed * 37.0;
          CL[vi * 4] = tr.color[0]; CL[vi * 4 + 1] = tr.color[1]; CL[vi * 4 + 2] = tr.color[2]; CL[vi * 4 + 3] = tr.intensity;
        }
      }
    }
    const cnt = Math.max(used, this.maxUsed) * this.vPerTrail;
    this.maxUsed = used;
    for (const [a, w] of [[this.aPos, 3], [this.aUv, 2], [this.aEx, 4], [this.aCl, 4]]) {
      a.clearUpdateRanges();
      if (cnt > 0) { a.addUpdateRange(0, cnt * w); a.needsUpdate = true; }
    }
    this.geometry.setDrawRange(0, Math.max(used, 0) * this.points * 6);
    this.mesh.visible = used > 0;
  }

  _degen(v, P) {
    for (let k = 0; k < 6; k++) P[v * 3 + k] = 0;
    this.ex[v * 4] = 0; this.ex[(v + 1) * 4] = 0;
  }
  _clear(base) {
    const P = this.pos;
    for (let k = 0; k < this.vPerTrail * 3; k++) P[base * 3 + k] = 0;
  }
  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

function smokeMaterial(U) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.blending = THREE.NormalBlending; mat.premultipliedAlpha = true; mat.fog = false;
  const E = attribute('rEx', 'vec4'), C = attribute('rCol', 'vec4');
  const q = uv();
  mat.colorNode = Fn(() => {
    const age = q.y, across = q.x;
    const n = fbm3(vec3(across.mul(0.9), E.z.mul(0.42), E.w.add(age.mul(1.3))));
    const n2 = fbm3(vec3(across.mul(2.3).add(4.0), E.z.mul(1.1), E.w.mul(0.5).sub(age.mul(2.0))));
    const edge = sstep(1.0, 0.15, abs(across).add(n.sub(0.5).mul(0.85)).add(n2.sub(0.5).mul(0.3)));
    const fadeIn = smoothstep(0.0, 0.025, age);
    const fade = pow(float(1).sub(age), 1.4);
    const dens = edge.mul(n.mul(0.9).add(0.35)).mul(fade).mul(fadeIn).mul(E.x);
    // luz: lado claro/escuro pelo ruído + sol direto, um pouco de espalhamento
    const lit = n2.mul(0.6).add(0.55);
    const smokeCol = C.xyz.mul(U.sun.mul(lit.mul(0.55)).add(U.ambient.mul(2.0)));
    // fogo: perto da boca (idade baixa) e onde há calor
    const heat = E.y.mul(pow(float(1).sub(smoothstep(0.0, 0.16, age)), 2.0)).mul(smoothstep(0.25, 0.8, n).mul(0.8).add(0.2));
    const fire = blackbody(heat.min(1)).mul(heat.mul(heat).mul(5.0));
    const a = clamp(dens.mul(0.85), 0, 1);
    return vec4(smokeCol.mul(a).add(fire.mul(a.mul(0.7).add(0.3).mul(edge))), a);
  })();
  return mat;
}

function glowMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  mat.fog = false;
  const E = attribute('rEx', 'vec4'), C = attribute('rCol', 'vec4');
  const q = uv();
  mat.colorNode = Fn(() => {
    const across = exp(q.x.mul(q.x).mul(-3.5));
    const core = pow(across, 6.0);
    const fade = pow(float(1).sub(q.y), 2.2).mul(smoothstep(0.0, 0.02, q.y).mul(0.6).add(0.4));
    const col = mix(C.xyz, vec3(1, 0.95, 0.9), core.mul(0.15)).mul(C.w).mul(across.add(core)).mul(fade).mul(E.x);
    return vec4(col, float(1));
  })();
  return mat;
}
