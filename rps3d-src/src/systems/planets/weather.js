// Clima dinâmico por bioma. Cada corpo tem um tipo de tempestade (chuva,
// tempestade de areia, nevasca, chuva de cinzas, névoa ácida, tempestade
// elétrica) cuja intensidade varia no tempo E no espaço (frentes regionais
// de ruído), então voar alguns km muda o tempo. Perto do chão:
//   • neblina de altura/visibilidade nos materiais do planeta (uniforms)
//   • partículas em volta da câmera (riscos de chuva, flocos, areia, cinza)
//     presas ao mundo (a câmera atravessa) e levadas pelo vento
//   • relâmpagos (flash no céu/nuvens + evento 'flash')
//   • cobertura de nuvens aumenta
// Emite 'weather' {kind, intensity} quando muda. api.force(kind, i) fixa
// (cinemáticas/missões/screenshots); api.force(null) devolve ao automático.
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, attribute, uniform, fract, normalize, cross, length, smoothstep, mix, max, abs, positionLocal,
  select, dot, clamp, uv, vec2, varying, pow,
} from 'three/tsl';
import { Noise } from '../../core/Rng.js';

export const KINDS = {
  lush: { kind: 'rain', fog: 1 / 900, color: [0.55, 0.6, 0.66], fall: 11, wind: 6, len: 0.9, width: 0.012, alpha: 0.32, p: [0.75, 0.8, 0.88], clouds: 0.45 },
  ocean: { kind: 'rain', fog: 1 / 800, color: [0.55, 0.62, 0.7], fall: 12, wind: 10, len: 1.0, width: 0.012, alpha: 0.32, p: [0.75, 0.82, 0.9], clouds: 0.45 },
  desert: { kind: 'sandstorm', fog: 1 / 300, color: [0.86, 0.55, 0.3], fall: 0.6, wind: 26, len: 0.35, width: 0.02, alpha: 0.45, p: [1.0, 0.72, 0.45], clouds: 0.1 },
  ice: { kind: 'blizzard', fog: 1 / 260, color: [0.82, 0.88, 0.96], fall: 2.2, wind: 18, len: 0.14, width: 0.14, alpha: 1.0, p: [1, 1, 1], clouds: 0.4 },
  volcanic: { kind: 'ash', fog: 1 / 420, color: [0.32, 0.29, 0.28], fall: 1.1, wind: 4, len: 0.04, width: 0.04, alpha: 0.7, p: [0.35, 0.33, 0.32], clouds: 0.3 },
  toxic: { kind: 'acid', fog: 1 / 260, color: [0.55, 0.68, 0.25], fall: 6, wind: 5, len: 0.5, width: 0.014, alpha: 0.3, p: [0.75, 0.95, 0.35], clouds: 0.35 },
  dead: { kind: 'electric', fog: 1 / 3000, color: [0.3, 0.32, 0.38], fall: 0, wind: 9, len: 0.2, width: 0.02, alpha: 0.25, p: [0.6, 0.7, 0.8], clouds: 0 },
  gas: null,
};

const BOX = 46; // lado da caixa de partículas (m)

export class Weather {
  constructor(ctx, planets) {
    this.ctx = ctx; this.planets = planets;
    this.noise = new Noise(9173);
    this.forced = null;
    this.state = { kind: 'clear', intensity: 0, body: null, visibility: Infinity, wind: new THREE.Vector3() };
    this.lastEmit = { kind: '', intensity: -1, t: -9 };
    this.offset = new THREE.Vector3();
    this.prevCam = null;
    this.flashT = 0; this.nextFlash = 3;
    this.windW = new THREE.Vector3();
    const q = ctx.quality.name;
    this.count = { ultra: 7000, high: 5000, medium: 3000, mobile: 1400 }[q] || 4000;
    this.buildParticles();
  }

  setSystem() { this.prevCam = null; }

  /** Fixa clima (null → automático). */
  force(kind, intensity = 1) { this.forced = kind ? { kind, intensity } : null; }

  /** Intensidade automática para um corpo numa direção local, no tempo t. */
  intensityAt(body, dirLocal, t) {
    if (!KINDS[body.type]) return 0;
    const s = (body.seed % 1000) * 0.137;
    const n = this.noise.noise3(dirLocal.x * 2.2 + s, dirLocal.y * 2.2 + t / 900, dirLocal.z * 2.2 - s);
    const n2 = this.noise.noise3(t / 2600 + s, s * 0.3, 1.7);
    // onde o mapa de clima tem nuvens úmidas, chove/neva de verdade
    const v = this.planets.view?.(body);
    const smp = v?.S?.wtex?.sampler;
    if (smp) {
      // o mapa deriva em longitude (S.wmapU): desfaz a deriva para consultar
      const a = v.wmapAt(t) * Math.PI * 2;
      const c = Math.cos(a), si = Math.sin(a);
      const w = smp(dirLocal.x * c - dirLocal.z * si, dirLocal.y, dirLocal.x * si + dirLocal.z * c);
      return THREE.MathUtils.smoothstep(w.wet * 0.9 + w.cov * 0.25 + n * 0.25 + n2 * 0.15, 0.45, 0.95);
    }
    return THREE.MathUtils.smoothstep(n * 0.7 + n2 * 0.5, 0.18, 0.62);
  }

  at(worldPos) {
    const body = this.planets.bodyAt(worldPos);
    const W = body && KINDS[body.type];
    if (!W) return { kind: 'clear', intensity: 0, visibility: Infinity, wind: new THREE.Vector3() };
    const t = this.ctx.time.world;
    const local = body.worldToLocal(worldPos, t, new THREE.Vector3());
    const alt = local.length() - body.radius;
    const dir = local.normalize();
    let i = this.forced ? this.forced.intensity : this.intensityAt(body, dir, t);
    const kind = this.forced?.kind || W.kind;
    i *= THREE.MathUtils.clamp(1 - (alt - 2500) / 3000, 0, 1);
    const vis = i > 0.01 ? Math.min(60000, 3 / (W.fog * (0.15 + i * 2.2))) : Infinity;
    return { kind: i > 0.02 ? kind : 'clear', intensity: i, visibility: vis, wind: this.windW.clone().multiplyScalar(i) };
  }

  buildParticles() {
    const N = this.count;
    const seed = new Float32Array(N * 4 * 4), corner = new Float32Array(N * 4 * 2);
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        seed[v * 4] = a; seed[v * 4 + 1] = b; seed[v * 4 + 2] = c; seed[v * 4 + 3] = d;
        corner[v * 2] = k & 1 ? 1 : -1; corner[v * 2 + 1] = k >> 1;
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const U = this.U = {
      off: uniform(new THREE.Vector3()), vel: uniform(new THREE.Vector3(0, -10, 0)), len: uniform(0.5), width: uniform(0.02),
      color: uniform(new THREE.Vector3(1, 1, 1)), alpha: uniform(0), box: uniform(BOX), count: uniform(1),
    };
    const aSeed = attribute('aSeed', 'vec4'), aCorner = attribute('aCorner', 'vec2');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.fog = false;
    // posição presa ao mundo: fract(seed + deslocamento acumulado / caixa)
    const jitter = vec3(aSeed.w.mul(0.37), aSeed.w.mul(0.71), aSeed.w.mul(0.13)).sub(0.3).mul(0.25);
    const center = fract(aSeed.xyz.add(U.off.div(U.box)).add(jitter.mul(0))).sub(0.5).mul(U.box);
    const v = U.vel.add(vec3(aSeed.w.sub(0.5), aSeed.x.sub(0.5), aSeed.y.sub(0.5)).mul(length(U.vel).mul(0.25)));
    const along = normalize(v);
    const view = normalize(center);
    const side = normalize(cross(along, view));
    const lenScale = U.len.mul(aSeed.w.mul(0.6).add(0.7));
    const pos = center.add(side.mul(aCorner.x.mul(U.width))).add(along.mul(aCorner.y.sub(0.5).mul(lenScale).add(U.width.mul(aCorner.y.sub(0.5)).mul(2.0))));
    // só uma fração das partículas aparece conforme a intensidade
    const alive = select(aSeed.w.lessThan(U.count), float(1), float(0));
    m.positionNode = pos.mul(alive);
    const dist = length(center);
    const fadeN = smoothstep(0.4, 1.6, dist).mul(smoothstep(U.box.mul(0.5), U.box.mul(0.3), dist));
    const edge = float(1).sub(abs(varying(aCorner.x))); // perfil macio através do risco
    m.colorNode = U.color;
    m.opacityNode = U.alpha.mul(fadeN).mul(pow(edge, 0.8)).mul(alive);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.mesh.name = 'pl.weather';
    this.ctx.scene.add(this.mesh);
  }

  frame(ctx, dt, body, view, inside) {
    const S = view?.S;
    const W = body && KINDS[body.type];
    const cam = ctx.player.camWorld;
    if (!W || !view || !view.A) {
      this.mesh.visible = false;
      if (S) { S.fogD.value = 0; S.flash.value = 0; }
      this.setState('clear', 0, body);
      this.prevCam = cam.clone();
      return;
    }
    const t = ctx.time.world;
    const dir = view.camLocal.clone().normalize();
    const alt = view.altitude;
    let I = this.forced ? this.forced.intensity : this.intensityAt(body, dir, t);
    const kind = this.forced?.kind || W.kind;
    const ground = THREE.MathUtils.clamp(1 - (alt - 2500) / 3000, 0, 1);
    I *= ground * inside;
    // vento: tangente ao chão, direção girando devagar
    const upW = body.dirToWorld(dir, t, new THREE.Vector3());
    const ref = Math.abs(upW.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(upW, ref).normalize(), e2 = new THREE.Vector3().crossVectors(upW, e1);
    const wa = t * 0.002 + (body.seed % 100);
    this.windW.copy(e1).multiplyScalar(Math.cos(wa)).addScaledVector(e2, Math.sin(wa)).multiplyScalar(W.wind * (0.4 + I));

    // neblina e cobertura de nuvens nos materiais do corpo
    const sunUp = Math.max(0, view.sunLocal.dot(dir));
    const sT = view.sunT, sc = S.sunCol.value, amb = S.amb.value;
    const fogCol = new THREE.Vector3(
      (amb.x * 0.55 + sc.x * sT[0] * sunUp * 0.07) * W.color[0] * 1.6,
      (amb.y * 0.55 + sc.y * sT[1] * sunUp * 0.07) * W.color[1] * 1.6,
      (amb.z * 0.55 + sc.z * sT[2] * sunUp * 0.07) * W.color[2] * 1.6);
    S.fogCol.value.copy(fogCol);
    S.fogD.value = W.fog * Math.pow(I, 3.5) * 1.2;
    S.cloudCov.value = Math.min(1, I * W.clouds + (view.cloudBoost || 0)) * (view.cloud ? 1 : 0);

    // partículas
    const show = I > 0.02 && W.fall + W.wind > 0 && kind !== 'electric';
    this.mesh.visible = show;
    if (show) {
      const U = this.U;
      const vel = this.windW.clone().addScaledVector(upW, -W.fall * (0.8 + I * 0.4));
      // acumula deslocamento (mundo − câmera) módulo caixa, em double
      if (this.prevCam) {
        // deslocamento da câmera em relação ao AR (que gira com o planeta)
        const dc = this.prevLocal ? body.dirToWorld(view.camLocal.clone().sub(this.prevLocal), t, new THREE.Vector3()) : new THREE.Vector3();
        if (dc.length() > BOX * 4) dc.set(0, 0, 0);
        this.offset.addScaledVector(vel, dt).sub(dc);
      }
      for (const k of ['x', 'y', 'z']) this.offset[k] = ((this.offset[k] % BOX) + BOX) % BOX;
      U.off.value.copy(this.offset);
      // velocidade relativa à câmera dá o rastro (corrida/voo estica as gotas)
      const camVel = this.prevLocal && dt > 0 ? body.dirToWorld(view.camLocal.clone().sub(this.prevLocal), t, new THREE.Vector3()).divideScalar(dt) : new THREE.Vector3();
      if (camVel.length() > 400) camVel.set(0, 0, 0);
      U.vel.value.copy(vel).sub(camVel);
      const speed = U.vel.value.length();
      U.len.value = W.len * Math.min(6, 0.4 + speed * 0.06);
      U.width.value = W.width;
      const light = Math.min(2.2, amb.length() * 3.5 + sunUp * 0.9 + 0.1);
      U.color.value.set(W.p[0] * light, W.p[1] * light, W.p[2] * light);
      U.alpha.value = W.alpha * Math.min(1, I * 1.4);
      U.count.value = Math.min(1, 0.15 + I);
    }
    this.prevCam = cam.clone();
    this.prevLocal = view.camLocal.clone();

    // relâmpagos (tempestade elétrica e chuva forte)
    if ((kind === 'electric' && I > 0.15) || (kind === 'rain' && I > 0.7)) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flashT = 0.35;
        this.nextFlash = 2 + Math.random() * 7 / (0.3 + I);
        ctx.bus.emit('flash', { color: kind === 'electric' ? '#a8c8ff' : '#dfe8ff', intensity: 0.25 + I * 0.25 });
      }
    }
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT > 0 ? (Math.sin(this.flashT * 60) * 0.5 + 0.5) * this.flashT * 3 : 0;
    S.flash.value = f;
    this.setState(I > 0.02 ? kind : 'clear', I, body);
  }

  setState(kind, intensity, body) {
    const s = this.state;
    s.kind = kind; s.intensity = intensity; s.body = body;
    const t = this.ctx.time.now;
    const L = this.lastEmit;
    if (kind !== L.kind || (Math.abs(intensity - L.intensity) > 0.08 && t - L.t > 1)) {
      L.kind = kind; L.intensity = intensity; L.t = t;
      this.ctx.bus.emit('weather', { kind, intensity: Math.round(intensity * 100) / 100, body: body?.id ?? null });
    }
  }
}
