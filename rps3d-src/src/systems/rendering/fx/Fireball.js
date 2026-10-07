// Bola de fogo volumétrica por raymarching (uma esfera por explosão):
// densidade = fBm turbulento deslocando uma frente esférica em expansão,
// temperatura alta no núcleo que esfria com o tempo (corpo negro), extinção
// que engrossa em fumaça escura iluminada pelo sol no fim da vida. Saída com
// alfa pré-multiplicado: emissão HDR + transmitância (escurece o fundo).
//
// Também aqui: anéis de onda de choque (disco aditivo em expansão, plano
// aleatório) — o "anel" clássico de explosão no espaço.
//
// Um único material por tipo; os parâmetros de cada instância vêm de
// uniforms por objeto (onObjectUpdate), então N explosões = 1 programa.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, Loop, exp, max, min, mix, clamp, smoothstep, length, normalize, dot, sqrt, pow,
  positionLocal, cameraPosition, modelWorldMatrixInverse, If, Break, abs, uv,
} from 'three/tsl';
import { vnoise3, blackbody } from '../tslib.js';

export class FireballPool {
  constructor(ctx, sun, fx, size) {
    this.ctx = ctx; this.sun = sun;
    this.steps = fx.fireballSteps;
    this.items = [];
    this.material = this.makeMaterial();
    this.ringMaterial = this.makeRingMaterial();
    this.group = new THREE.Group();
    this.group.name = 'rps.fireballs';
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(geo, this.material);
      m.visible = false; m.frustumCulled = true; m.renderOrder = 11;
      m.userData = { age: 0, life: 1, seed: Math.random() * 100, hot: 1, smoke: 1, active: false };
      this.group.add(m);
      this.items.push(m);
    }
    this.rings = [];
    for (let i = 0; i < Math.max(2, Math.ceil(size / 2)); i++) {
      const r = new THREE.Mesh(ringGeo, this.ringMaterial);
      r.visible = false; r.renderOrder = 13;
      r.userData = { age: 0, life: 1, active: false, color: new THREE.Color(0.6, 0.75, 1), power: 1 };
      this.group.add(r);
      this.rings.push(r);
    }
    ctx.scene.add(this.group);
    this.cursor = 0; this.ringCursor = 0;
  }

  makeMaterial() {
    const S = this.sun.uniforms;
    const objU = (key, def = 0) => uniform(def).onObjectUpdate(({ object }) => object.userData[key]);
    const uAge = objU('phase'), uSeed = objU('seed'), uHot = objU('hot', 1), uSmoke = objU('smoke', 1);
    const steps = this.steps;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide });
    mat.fog = false;
    mat.premultipliedAlpha = true;
    mat.blending = THREE.NormalBlending;
    mat.colorNode = Fn(() => {
      const ro = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz.toVar();
      const rd = normalize(positionLocal.sub(ro)).toVar();
      const b = dot(ro, rd);
      const c = dot(ro, ro).sub(1);
      const h = b.mul(b).sub(c).max(0);
      const sh = sqrt(h);
      const t0 = b.negate().sub(sh).max(0).toVar();
      const t1 = b.negate().add(sh);
      const dt = t1.sub(t0).div(steps).toVar();
      const a = clamp(uAge, 0, 1);
      // raio da frente: expansão rápida (curva de explosão) e depois lenta
      const R = float(0.2).add(float(0.6).mul(float(1).sub(pow(float(1).sub(a), 3.2)))).toVar();
      const cool = pow(float(1).sub(a), 1.15).mul(uHot).toVar();
      const early = clamp(float(1).sub(a.mul(3.2)), 0, 1);
      const fadeOut = float(1).sub(smoothstep(0.7, 1.0, a));
      // sol no espaço local (escala uniforme: só rotação/escala importam p/ direção)
      const sunL = normalize(modelWorldMatrixInverse.mul(vec4(S.dir, 0)).xyz);
      const T = float(1).toVar();
      const em = vec3(0).toVar();
      // jitter da posição inicial para esconder fatias
      const j = vnoise3(positionLocal.mul(91.7)).sub(0.5);
      const t = t0.add(dt.mul(j.add(0.5))).toVar();
      Loop(steps, () => {
        const p = ro.add(rd.mul(t));
        const r = length(p);
        // ruído "piroclástico": bulbos grandes + turbulência que sobe com a idade
        const q = p.mul(2.1).add(vec3(uSeed, uSeed.mul(0.7), a.mul(-1.1)));
        const n1 = vnoise3(q);
        const n2 = vnoise3(q.mul(2.4).add(n1.mul(2.1)));
        const n3 = vnoise3(q.mul(5.3).sub(n2.mul(1.3)));
        const n = n1.mul(0.55).add(n2.mul(0.3)).add(n3.mul(0.15));
        const shape = R.mul(n.mul(0.7).add(0.55)).sub(r);
        const dens = clamp(shape.div(R).mul(8), 0, 1).mul(fadeOut).toVar();
        If(dens.greaterThan(0.002), () => {
          const core = smoothstep(R.mul(1.05), R.mul(0.15), r);
          const heat = core.mul(0.8).add(n2.sub(0.42).mul(0.8)).add(n3.sub(0.5).mul(0.3)).add(early.mul(0.35)).mul(cool).clamp(0, 1.1);
          // fogo é opticamente fino; fuligem fria é espessa
          const sigma = dens.mul(mix(float(1.6), float(7.5), a)).mul(uSmoke).mul(mix(float(1), float(0.3), heat.min(1))).max(1e-3);
          const st = exp(sigma.mul(dt).negate());
          const glow = blackbody(heat.min(1)).mul(pow(heat, 2.4).mul(58)).mul(dens);
          // fumaça: espalhamento simples do sol (luz de borda + ambiente)
          const lit = dot(normalize(p), sunL).mul(0.5).add(0.5);
          const smoke = vec3(0.05, 0.043, 0.038).mul(S.color.mul(S.intensity.mul(S.visibility).mul(lit.mul(lit).mul(0.35))).add(0.02));
          em.addAssign(glow.add(smoke.mul(sigma)).mul(T).mul(float(1).sub(st)).div(sigma));
          T.mulAssign(st);
        });
        t.addAssign(dt);
        If(T.lessThan(0.01), () => { Break(); });
      });
      return vec4(em, float(1).sub(T));
    })();
    return mat;
  }

  makeRingMaterial() {
    const objU = (key, def = 0) => uniform(def).onObjectUpdate(({ object }) => object.userData[key]);
    const uPhase = objU('phase'), uPow = objU('power', 1);
    const uCol = uniform(new THREE.Color()).onObjectUpdate(({ object }, self) => object.userData.color);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    mat.fog = false;
    mat.colorNode = Fn(() => {
      const q = uv().mul(2).sub(1);
      const r = length(q);
      const a = clamp(uPhase, 0, 1);
      const rad = float(1).sub(pow(float(1).sub(a), 2.5)).max(0.03);
      const w = mix(float(0.05), float(0.18), a);
      const x = r.sub(rad).div(w);
      const band = exp(x.mul(x).negate());
      // disco interno tênue; máscara dura no círculo unitário (cantos do quad = 0)
      const inner = float(1).sub(clamp(r.div(rad), 0, 1)).mul(0.05);
      const mask = clamp(float(1).sub(r).mul(20), 0, 1).mul(smoothstep(0.0, 0.03, a));
      const n = vnoise3(vec3(q.mul(6), a.mul(3))).mul(0.7).add(0.3);
      const fade = pow(float(1).sub(a), 1.7).mul(mask);
      return vec4(uCol.mul(band.mul(n).add(inner.mul(n))).mul(fade).mul(uPow).mul(3), 1);
    })();
    return mat;
  }

  /** Inicia uma bola de fogo (pos em espaço de render é aplicada pelo dono a cada frame). */
  spawn({ size, life, hot = 1, smoke = 1, delay = 0 }) {
    const m = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    Object.assign(m.userData, { age: -delay, life, seed: Math.random() * 100, hot, smoke, active: true, phase: 0 });
    m.scale.setScalar(size);
    m.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    m.visible = false;
    return m;
  }
  ring({ size, life, color, power = 1, normal = null, delay = 0 }) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    Object.assign(r.userData, { age: -delay, life, active: true, phase: 0, power });
    if (color) r.userData.color.set(color);
    r.scale.setScalar(size);
    const n = normal ? normal.clone().normalize() : new THREE.Vector3(Math.random() - 0.5, 1.6, Math.random() - 0.5).normalize();
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    r.visible = false;
    return r;
  }

  /** Posiciona no espaço de render (depois de world.sync/anchors.sync). */
  place() {
    for (const list of [this.items, this.rings]) for (const m of list) if (m.userData.active && m.userData.follow) m.userData.follow(m);
  }

  update(dt) {
    for (const list of [this.items, this.rings]) {
      for (const m of list) {
        const u = m.userData;
        if (!u.active) continue;
        u.age += dt;
        u.phase = Math.max(0, u.age / u.life);
        m.visible = u.age >= 0 && u.phase < 1;
        if (u.phase >= 1) { u.active = false; m.visible = false; u.follow = null; }
      }
    }
  }
}
