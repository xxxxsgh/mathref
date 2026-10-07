// Tempestade de íons: nuvem de plasma volumétrica (raymarching numa esfera
// em escala real, de dentro ou de fora) iluminada por dentro pelos
// relâmpagos, e raios ramificados em fita HDR (deslocamento de ponto médio).
// Gera interferência (0..1) e emite eventos no barramento:
//   'space:lightning' {position, distance, intensity, stormId}
//   'fx:flash' / 'fx:shake' quando o raio cai perto da câmera.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, positionWorld, cameraPosition, normalize, dot, sqrt, max, min, exp, mix, clamp, Loop, If, length, attribute, varying, abs, select, pow,
} from 'three/tsl';
import { makeRng, hash } from '../../core/Rng.js';
import { noise4, camU, sstep } from './tslUtil.js';

const MAX_FLASH = 4;
const BOLTS = 5;

export class IonStorm {
  /**
   * @param center {x,y,z} sistema · @param radius m
   */
  constructor(ctx, id, center, radius, seed = 1) {
    this.ctx = ctx;
    this.id = id;
    this.center = { ...center };
    this.radius = radius;
    this.rng = makeRng(hash('storm', seed));
    this.group = new THREE.Group();
    this.group.name = 'ion-storm-' + id;
    this.uCam = uniform(new THREE.Vector3(0, 0, -3)); // câmera relativa (em raios)
    this.flashes = [];
    for (let i = 0; i < MAX_FLASH; i++) this.flashes.push({ u: uniform(new THREE.Vector4(0, 0, 0, 0)), t: 0 });
    const steps = Math.max(12, Math.min(40, Math.round((ctx.quality.p.nebulaSteps || 24) * 0.7)));
    this.volume = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.makeVolumeMaterial(steps));
    this.volume.scale.setScalar(radius);
    this.volume.frustumCulled = false;
    this.volume.renderOrder = 3;
    this.group.add(this.volume);
    // raios (pool)
    this.bolts = [];
    for (let i = 0; i < BOLTS; i++) this.bolts.push(this.makeBolt());
    this.timer = 1.5;
    this.interference = 0;
    this.time = 0;
    this.frozen = false; // cenário: mantém o raio aceso
  }

  makeVolumeMaterial(STEPS) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    m.fog = false;
    const uCam = this.uCam;
    const fl = this.flashes.map((f) => f.u);
    const r = this.rng;
    const lobesDef = [];
    for (let i = 0; i < 6; i++) {
      const c = [r.range(-0.45, 0.45), r.range(-0.25, 0.25), r.range(-0.45, 0.45)];
      lobesDef.push([c[0], c[1] * 1.25, c[2], r.range(0.42, 0.68)]);
    }
    m.colorNode = Fn(() => {
      const rd = normalize(positionWorld.sub(cameraPosition));
      const ro = uCam;
      const b = dot(ro, rd);
      const c = dot(ro, ro).sub(1.0);
      const disc = max(b.mul(b).sub(c), 0.0);
      const sq = sqrt(disc);
      const t0 = max(b.negate().sub(sq), 0.0);
      const t1 = b.negate().add(sq);
      const dt = max(t1.sub(t0), 0.0).div(STEPS);
      const col = vec3(0).toVar();
      const T = float(1).toVar();
      const time = camU.time;
      Loop(STEPS, ({ i }) => {
        const p = ro.add(rd.mul(t0.add(dt.mul(float(i).add(0.5)))));
        // lobos (cúmulos) achatados + bordas recortadas por ruído
        const q = p.mul(vec3(1.0, 1.25, 1.0));
        let lobes = float(0);
        for (const L of lobesDef) {
          const d = q.sub(vec3(L[0], L[1], L[2]));
          lobes = lobes.add(exp(dot(d, d).mul(-2.2 / (L[3] * L[3]))));
        }
        const w = noise4(q.mul(0.6).add(vec3(time.mul(0.004), 0.3, time.mul(-0.003)))).xyw.sub(0.5).mul(0.95);
        const a = noise4(q.mul(1.2).add(w).add(vec3(0, time.mul(0.005), 0)));
        const bb = noise4(q.mul(2.2).add(w.mul(1.5)));
        const n = a.z.mul(0.5).add(a.y.mul(0.3)).add(a.w.mul(0.2));
        const detail = bb.x.mul(0.5).add(bb.y.mul(0.3)).add(bb.w.mul(0.2));
        const dn = clamp(lobes.mul(1.1).sub(0.62).add(n.sub(0.45).mul(3.2)).add(detail.sub(0.5).mul(0.9)), 0.0, 1.0)
          .mul(float(1.0).sub(sstep(0.55, 0.95, length(p).add(w.y.mul(0.7)))));
        const dens = dn.mul(dn).mul(1.6);
        // corpo índigo/magenta escuro + filamentos elétricos ciano
        const body = mix(vec3(0.07, 0.03, 0.24), vec3(0.32, 0.05, 0.38), a.x);
        const rid = float(1.0).sub(abs(bb.y.sub(0.5)).mul(2.0));
        const fil = pow(rid, 30.0).mul(sstep(0.45, 0.7, a.x));
        // relâmpagos iluminando a nuvem por dentro (bolsões de luz)
        let flash = float(0);
        for (const f of fl) {
          const d = p.sub(f.xyz);
          flash = flash.add(f.w.div(dot(d, d).mul(260.0).add(0.1)));
        }
        const lit = body.mul(sstep(0.35, 0.75, n).mul(0.22).add(0.03))
          .add(vec3(0.52, 0.4, 1.0).mul(flash))
          .add(vec3(0.1, 0.75, 1.0).mul(fil).mul(flash.mul(0.8).add(0.12)));
        col.addAssign(T.mul(lit).mul(dens).mul(dt).mul(7.0));
        T.mulAssign(exp(dens.mul(dt).mul(-7.0)));
      });
      return vec4(col, float(1).sub(T));
    })();
    return m;
  }

  makeBolt() {
    const MAXV = 900;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('across', new THREE.BufferAttribute(new Float32Array(MAXV), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('heat', new THREE.BufferAttribute(new Float32Array(MAXV), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(MAXV * 3), 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const intensity = uniform(0);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.fog = false;
    const across = varying(attribute('across', 'float'), 'vAcross');
    const heat = varying(attribute('heat', 'float'), 'vHeat');
    m.colorNode = Fn(() => {
      const x = abs(across);
      const core = exp(x.mul(x).mul(-90.0));
      const halo = exp(x.mul(-3.5)).mul(0.28).mul(float(1).sub(x));
      const c = mix(vec3(0.45, 0.4, 1.0), vec3(0.92, 0.95, 1.0), core);
      return vec4(c.mul(core.add(halo)).mul(intensity).mul(heat), 1.0);
    })();
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, intensity, life: 0, max: 0, flash: null, pos: new THREE.Vector3() };
  }

  /** Gera um raio entre dois pontos (locais ao centro da tempestade). */
  strike(force = null) {
    const r = this.rng;
    const R = this.radius;
    const bolt = this.bolts.find((b) => b.life <= 0) || this.bolts[0];
    const randIn = (s) => {
      let x, y, z;
      do {
        x = r() * 2 - 1;
        y = r() * 2 - 1;
        z = r() * 2 - 1;
      } while (x * x + y * y + z * z > 1);
      return new THREE.Vector3(x * R * s, y * R * s * 0.6, z * R * s);
    };
    const A = force?.from || randIn(0.5);
    const B = force?.to || A.clone().add(randIn(0.4));
    // ponto médio deslocado recursivamente
    let pts = [A, B];
    const len0 = A.distanceTo(B);
    for (let lvl = 0; lvl < 6; lvl++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const m = a.clone().add(b).multiplyScalar(0.5);
        const l = a.distanceTo(b);
        m.add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(l * 0.45));
        out.push(m, b);
      }
      pts = out;
    }
    const strands = [{ pts, w: Math.max(14, len0 * 0.004), heat: 1 }];
    // ramos
    const nb = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const i0 = Math.floor(r() * (pts.length * 0.7));
      const s = pts[i0];
      const dir = pts[Math.min(pts.length - 1, i0 + 4)].clone().sub(s).normalize();
      dir.add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.2)).normalize();
      const e = s.clone().addScaledVector(dir, len0 * r.range(0.12, 0.3));
      let bp = [s, e];
      for (let lvl = 0; lvl < 4; lvl++) {
        const out = [bp[0]];
        for (let i = 0; i < bp.length - 1; i++) {
          const a = bp[i], b = bp[i + 1];
          const m = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(a.distanceTo(b) * 0.5));
          out.push(m, b);
        }
        bp = out;
      }
      strands.push({ pts: bp, w: strands[0].w * 0.45, heat: 0.55 });
    }
    // fita contínua voltada para a câmera (no instante do raio)
    const camRel = this.camRel || new THREE.Vector3(0, 0, R * 3);
    const geo = bolt.mesh.geometry;
    const pos = geo.attributes.position;
    const acr = geo.attributes.across;
    const heat = geo.attributes.heat;
    const index = geo.index;
    let v = 0;
    let ii = 0;
    const tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
    for (const st of strands) {
      const P = st.pts;
      if (v + P.length * 2 > pos.count) break;
      const v0 = v;
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        tan.subVectors(b, a);
        view.subVectors(camRel, P[i]);
        side.crossVectors(tan, view).normalize();
        const taper = 1 - (i / P.length) * 0.65;
        // largura mínima em pixels para não sumir de longe
        const minW = view.length() * 0.0035;
        const w = Math.max(st.w * taper * 4, minW);
        for (const s2 of [-1, 1]) {
          const p = P[i];
          pos.setXYZ(v, p.x + side.x * w * s2, p.y + side.y * w * s2, p.z + side.z * w * s2);
          acr.setX(v, s2);
          heat.setX(v, st.heat * (i === 0 || i === P.length - 1 ? 0 : 1));
          v++;
        }
      }
      for (let i = 0; i < P.length - 1; i++) {
        const a = v0 + i * 2;
        index.array.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], ii);
        ii += 6;
      }
    }
    pos.needsUpdate = acr.needsUpdate = heat.needsUpdate = index.needsUpdate = true;
    geo.setDrawRange(0, ii);
    bolt.mesh.visible = true;
    bolt.max = bolt.life = r.range(0.25, 0.55);
    bolt.pos.copy(A).add(B).multiplyScalar(0.5);
    // luz na nuvem
    const fslot = this.flashes.reduce((a, b) => (b.t < a.t ? b : a));
    fslot.t = bolt.life;
    fslot.u.value.set(bolt.pos.x / R, bolt.pos.y / R, bolt.pos.z / R, 0);
    fslot.hold = 0;
    bolt.flash = fslot;
    // eventos
    const world = this.ctx.world;
    const posLocal = new THREE.Vector3(this.center.x - world.origin.x + bolt.pos.x, this.center.y - world.origin.y + bolt.pos.y, this.center.z - world.origin.z + bolt.pos.z);
    const dist = this.camRel ? this.camRel.distanceTo(bolt.pos) : 1e9;
    const intensity = len0 / R;
    this.ctx.bus.emit('space:lightning', { stormId: this.id, position: posLocal, distance: dist, intensity });
    if (dist < R * 0.9) {
      const k = Math.min(1, 4000 / Math.max(dist, 500));
      this.ctx.bus.emit('fx:flash', { color: 0x9fc4ff, intensity: 0.6 * k });
      if (dist < 5000) this.ctx.bus.emit('fx:shake', { intensity: 0.35 * k, duration: 0.4 });
      this.spike = Math.max(this.spike || 0, k);
    }
    return bolt;
  }

  /** Clarão interno (relâmpago oculto na nuvem) em `p` (local à tempestade). */
  flashAt(p, w = 1, life = 0.4) {
    const fslot = this.flashes.reduce((a, b) => (b.t < a.t ? b : a));
    fslot.t = life;
    fslot.u.value.set(p.x / this.radius, p.y / this.radius, p.z / this.radius, w);
    fslot.hold = w;
    return fslot;
  }

  /** Passo fixo: agenda raios. */
  update(dt) {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0 && !this.frozen) {
      // 2/3 dos relâmpagos ficam escondidos na nuvem (só clarão)
      if (this.rng() < 0.35) this.strike();
      else {
        const R = this.radius, r = this.rng;
        this.flashAt(new THREE.Vector3((r() - 0.5) * R, (r() - 0.5) * R * 0.6, (r() - 0.5) * R), r.range(0.4, 1.1), r.range(0.15, 0.4));
      }
      this.timer = this.rng.range(0.3, 1.8);
    }
    for (const b of this.bolts) {
      if (b.life > 0 && !this.frozen) {
        b.life -= dt;
        if (b.life <= 0) b.mesh.visible = false;
      }
    }
    this.spike = Math.max(0, (this.spike || 0) - dt * 1.5);
  }

  /** Por frame: posiciona, atualiza brilho dos raios e interferência. */
  frame(ctx, camLocal) {
    const w = ctx.world;
    this.group.position.set(this.center.x - w.origin.x, this.center.y - w.origin.y, this.center.z - w.origin.z);
    this.camRel = camLocal.clone().sub(this.group.position);
    this.uCam.value.copy(this.camRel).divideScalar(this.radius);
    for (const b of this.bolts) {
      if (b.life <= 0 && !this.frozen) continue;
      const f = this.frozen ? 0.8 : b.life / b.max;
      // tremulação de retorno (o raio pisca 2–3 vezes)
      const flick = this.frozen ? 1 : 0.55 + 0.45 * Math.sign(Math.sin(f * 40 + b.max * 100));
      b.intensity.value = 22 * f * flick;
      if (b.flash) b.flash.u.value.w = 0.9 * f * flick;
    }
    for (const fl of this.flashes) {
      if (fl.t > 0 && !this.frozen) {
        fl.t -= 1 / 60;
        if (fl.hold) fl.u.value.w = fl.hold * Math.max(0, fl.t) * (0.6 + 0.4 * Math.sign(Math.sin(fl.t * 70))) * 3;
        if (fl.t <= 0) {
          fl.u.value.w = 0;
          fl.hold = 0;
        }
      }
    }
    const d = this.camRel.length() / this.radius;
    const base = d < 1 ? 0.45 + 0.4 * (1 - d) : Math.max(0, 0.45 * (1 - (d - 1)));
    this.interference = Math.min(1, base + (this.spike || 0) * 0.5);
    this.distance = this.camRel.length();
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
