// Efeitos visuais do voo do jogador:
//
//  • Bainha de plasma da reentrada: casca deformada em volta da nave, proa
//    achatada (onda de choque) e cauda esticada pelo fluxo, com estrias de
//    plasma correndo para trás e cor de corpo negro (branco-rosado na proa →
//    laranja → vermelho na cauda). Visível de fora e pelo canopy.
//  • Pele aquecida: sobreposição aditiva no próprio casco que acende as
//    bordas de ataque (normal contra o fluxo) em vermelho-laranja.
//  • Rastro de brasas e faíscas da reentrada (partículas do rendering).
//  • Distorção de calor atrás dos motores; poeira levantada perto do chão.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, float, mix, smoothstep, pow, abs, dot, normalize, max, min, clamp, atan, sin, exp,
  positionGeometry, normalView, positionView, normalWorld, time, mx_noise_float, mx_fractal_noise_float, frontFacing, select,
} from 'three/tsl';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

/** Cor de plasma: t 0 (frio, cauda) → 1 (proa quente). HDR linear. */
const plasmaColor = (t) => {
  const red = vec3(1.0, 0.16, 0.03), orange = vec3(1.0, 0.42, 0.09), hot = vec3(1.0, 0.78, 0.55), white = vec3(0.95, 0.88, 1.0);
  return mix(mix(red, orange, smoothstep(0.0, 0.45, t)), mix(hot, white, smoothstep(0.82, 1.0, t)), smoothstep(0.45, 0.85, t));
};

function makeSheathMaterial(U) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  // deformação: esfera unitária → proa achatada + cauda longa e afinando
  m.positionNode = Fn(() => {
    const g = positionGeometry;
    const back = smoothstep(0.0, 1.0, g.z);         // 0 na proa/meio → 1 na ponta da cauda
    const zf = select(g.z.lessThan(0.0), g.z.mul(0.62), g.z.mul(float(1.0).add(U.tail)));
    const shrink = mix(1.0, 0.18, pow(back, 0.8));
    const wob = mx_noise_float(vec3(g.x.mul(3.0), g.y.mul(3.0), g.z.mul(2.0).sub(time.mul(6.0)))).mul(0.08).mul(back.add(0.25));
    return vec3(g.x.mul(shrink).mul(wob.add(1.0)), g.y.mul(shrink).mul(wob.add(1.0)), zf);
  })();
  m.colorNode = Fn(() => {
    const g = positionGeometry;
    const zf = g.z;                                         // −1 proa … +1 cauda
    const bow = smoothstep(0.15, -0.95, zf);
    const ang = atan(g.y, g.x);
    // estrias de plasma correndo para trás
    const s1 = mx_noise_float(vec3(ang.mul(3.2), zf.mul(3.0).sub(time.mul(11.0)), time.mul(0.7))).mul(0.5).add(0.5);
    const s2 = mx_fractal_noise_float(vec3(ang.mul(7.0), zf.mul(6.0).sub(time.mul(17.0)), 3.1), 3, 2.0, 0.5).mul(0.5).add(0.5);
    const streak = pow(s1.mul(0.6).add(s2.mul(0.6)), 2.2);
    const V = normalize(positionView).negate();
    const ndv = abs(dot(normalize(normalView), V));
    const rim = pow(float(1.0).sub(ndv), 1.7);
    const tailFade = float(1.0).sub(smoothstep(-0.1, 1.0, zf).mul(0.92));
    // de fora: borda luminosa + capa da proa; de dentro (cockpit): só a proa à frente
    const outside = rim.mul(bow.mul(1.6).add(0.45)).add(pow(bow, 3.0).mul(ndv).mul(0.9));
    const inside = pow(bow, 2.4).mul(ndv.mul(0.6).add(0.4)).mul(0.75);
    const shape = select(frontFacing, outside, inside);
    const flick = sin(time.mul(41.0).add(ang.mul(5.0))).mul(0.06).add(0.94);
    const I = U.intensity;
    const heatT = clamp(bow.mul(0.75).add(streak.mul(0.25)).add(I.sub(0.6).mul(0.4)), 0.0, 1.0);
    const col = plasmaColor(heatT);
    // ionização forte: franja violeta na borda
    const ion = vec3(0.55, 0.42, 1.0).mul(rim.mul(bow).mul(smoothstep(0.6, 1.0, I)).mul(0.9));
    return col.mul(shape.mul(streak.mul(1.3).add(0.35)).mul(tailFade).mul(flick)).add(ion).mul(I.mul(I).mul(U.gain));
  })();
  return m;
}

function makeSkinMaterial(U) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.fog = false;
  m.depthFunc = THREE.LessEqualDepth;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
  m.colorNode = Fn(() => {
    const n = normalize(normalWorld);
    const facing = max(dot(n, U.flowDir.negate()), 0.0);  // face contra o vento
    const lead = pow(facing, 2.2);
    const n1 = mx_noise_float(positionGeometry.mul(0.9).add(vec3(0.0, 0.0, time.mul(3.0)))).mul(0.5).add(0.5);
    const I = U.intensity;
    const t = clamp(lead.mul(I).mul(1.2).add(n1.mul(0.2)), 0.0, 1.0);
    const col = plasmaColor(t.mul(0.8));
    return col.mul(lead.mul(n1.mul(0.6).add(0.7)).add(pow(facing, 0.6).mul(0.12))).mul(I.mul(I).mul(U.skinGain));
  })();
  return m;
}

export class FlightFx {
  constructor(ctx) {
    this.ctx = ctx;
    this.U = {
      intensity: uniform(0), tail: uniform(3), gain: uniform(5.5), skinGain: uniform(2.6),
      flowDir: uniform(new THREE.Vector3(0, 0, -1)),
    };
    const q = ctx.quality?.name;
    const seg = q === 'mobile' ? [32, 20] : [64, 40];
    this.sheath = new THREE.Mesh(new THREE.SphereGeometry(1, seg[0], seg[1]), makeSheathMaterial(this.U));
    this.sheath.frustumCulled = false;
    this.sheath.renderOrder = 14;
    this.sheath.visible = false;
    this.sheath.name = 'voo:plasma';
    this.sheathPos = new THREE.Vector3();
    this.entry = ctx.world.add(this.sheath, this.sheathPos);
    this.skinMat = makeSkinMaterial(this.U);
    this.skins = [];
    this.emitT = 0; this.dustT = 0;
    this.haze = null;
  }

  /** Liga as sobreposições de pele aquecida na instância da nave. */
  attachShip(inst) {
    for (const s of this.skins) s.removeFromParent();
    this.skins = [];
    if (!inst) return;
    for (const k of ['hull']) {
      const src = inst.meshes?.[k];
      if (!src?.geometry) continue;
      const m = new THREE.Mesh(src.geometry, this.skinMat);
      m.renderOrder = 3; m.visible = false; m.name = 'voo:pele-quente';
      m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
      inst.group.add(m);
      this.skins.push(m);
    }
  }

  /**
   * Por frame. state: { pos (mundo), quat, velW (mundo), reentry 0..1, radius,
   * length, exterior (nave visível de fora?), thrust 0..1, boost, groundInfo }
   */
  frame(dt, s) {
    const ctx = this.ctx, U = this.U;
    const I = s.reentry;
    U.intensity.value = I;
    const on = I > 0.015;
    this.sheath.visible = on;
    for (const k of this.skins) k.visible = on && s.exterior;
    const sp = s.velW.length();
    if (on && sp > 1) {
      const flow = _v.copy(s.velW).divideScalar(sp);
      U.flowDir.value.copy(flow);
      // a casca aponta −Z para o vento relativo (a velocidade)
      const up = _v2.set(0, 1, 0).applyQuaternion(s.quat);
      _m.lookAt(new THREE.Vector3(), flow, up);
      this.sheath.quaternion.setFromRotationMatrix(_m);
      const R = s.radius;
      this.sheath.scale.set(R * 0.72, R * 0.42, R * 0.78);
      U.tail.value = 2.2 + I * 5.5;
      this.sheathPos.copy(s.pos).addScaledVector(flow, R * 0.18);
      // brasas e faíscas da reentrada
      const rp = ctx.services.rendering?.particles;
      this.emitT -= dt;
      if (rp && this.emitT <= 0 && s.exterior) {
        this.emitT = 1 / 30;
        const n = Math.round(2 + I * 6);
        const tailPos = _v2.copy(s.pos).addScaledVector(flow, -R * 0.5);
        const vx = s.velW.x, vy = s.velW.y, vz = s.velW.z;
        try {
          rp.emit('spark', tailPos, n, (k, o) => {
            const j = 0.55 + Math.random() * 0.3;
            o.x = (Math.random() - 0.5) * R * 0.8; o.y = (Math.random() - 0.5) * R * 0.4; o.z = (Math.random() - 0.5) * R * 0.8;
            o.vx = vx * j + (Math.random() - 0.5) * 30; o.vy = vy * j + (Math.random() - 0.5) * 30; o.vz = vz * j + (Math.random() - 0.5) * 30;
            o.life = 0.25 + Math.random() * 0.4; o.s0 = 0.5 + I; o.s1 = 0.15; o.drag = 2.2; o.g = 0; o.a = 0.9; o.b = 8 + I * 10; o.spin = 0.02;
          });
          rp.emit('glow', tailPos, Math.round(1 + I * 2), (k, o) => {
            const j = 0.75 + Math.random() * 0.15;
            o.x = (Math.random() - 0.5) * R * 0.5; o.y = (Math.random() - 0.5) * R * 0.3; o.z = (Math.random() - 0.5) * R * 0.5;
            o.vx = vx * j; o.vy = vy * j; o.vz = vz * j;
            o.life = 0.3 + Math.random() * 0.25; o.s0 = R * (0.6 + I * 0.7); o.s1 = R * (1.4 + I); o.drag = 1.5; o.g = 0;
            o.a = 3.5 * I; o.b = 1.1 * I; o.c = 0.25 * I; o.w = 1.2;
          }, { ttl: 2 });
        } catch { /* partículas indisponíveis */ }
      }
    }
    // distorção de calor atrás dos motores (só de fora)
    const rnd = ctx.services.rendering;
    if (rnd?.addDistortion && !this.haze) this.haze = rnd.addDistortion({ radius: 4, strength: 0, ring: 0, shimmer: 1 });
    if (this.haze) {
      const back = _v.set(0, 0, 1).applyQuaternion(s.quat);
      this.haze.pos.copy(s.pos).addScaledVector(back, s.length * 0.62 + 3);
      this.haze.radius = s.radius * 0.5 + 2;
      this.haze.strength = s.exterior ? Math.min(0.5, s.thrust * 0.22 + (s.boost ? 0.2 : 0)) : 0;
    }
    // poeira levantada pelos propulsores perto do chão
    const g = s.groundInfo;
    if (g && g.height < 45 && rnd?.particles?.dust && (s.thrust > 0.05 || s.hover)) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.12;
        const k = 1 - g.height / 45;
        const col = DUST[g.material] || DUST.default;
        try { rnd.particles.dust(g.point, g.up, Math.round(4 + k * 10), { radius: 4 + k * 10, color: col }); } catch { /* sem partículas */ }
      }
    }
  }

  dispose() {
    this.entry.remove();
    this.sheath.geometry.dispose(); this.sheath.material.dispose();
    for (const s of this.skins) s.removeFromParent();
    this.haze?.remove();
  }
}

const DUST = {
  default: [0.32, 0.27, 0.21], desert: [0.62, 0.42, 0.26], lush: [0.3, 0.32, 0.22], ice: [0.85, 0.9, 0.95],
  volcanic: [0.16, 0.13, 0.12], toxic: [0.42, 0.45, 0.2], dead: [0.4, 0.38, 0.36], ocean: [0.7, 0.75, 0.78],
};
