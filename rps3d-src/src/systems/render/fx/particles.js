// Pool de partículas na GPU (sem compute — funciona no WebGPU e WebGL2).
//
// Cada partícula é uma instância de um quad. O CPU só ESCREVE na hora do
// nascimento (posição, velocidade, tempo inicial, vida, tamanhos, tipo,
// cor); o vertex shader avalia a trajetória analiticamente em função do
// tempo (arrasto exponencial + empuxo/gravidade), então não há custo por
// frame no CPU nem readback. Partículas com tempo inicial no futuro ficam
// invisíveis até "nascerem" — rastros e explosões em camadas são
// agendados de uma vez.
//
// Buffer circular: a mais antiga é sobrescrita quando o pool enche (limite
// por ctx.quality.p.particlesMax). Só a faixa alterada sobe para a GPU.
//
// Tipos (KIND):
//   0 GLOW   brilho gaussiano (clarão, brasas, ponta de cano)
//   1 FIRE   bola de fogo pseudo-volumétrica (esfera + fbm 3D + corpo negro)
//            que esfria em fuligem — pool "mix" (alfa pré-multiplicado)
//   2 SPARK  faísca esticada pela velocidade, esfriando
//   3 SMOKE  fumaça iluminada pelo sol — pool "mix" (alfa pré-multiplicado)
//   4 RING   onda de choque (anel)
//   5 STAR   estrela de 4/6 pontas (núcleo do clarão, cano)
//   6 DROP   gota/estilhaço (água, gelo) — faísca fria sem incandescência

import * as THREE from 'three/webgpu';
import { maskVelocity } from '../mrtMask.js';
import { rand } from './rng.js';
import {
  Fn, vec2, vec3, vec4, float, uniform, uv, instancedBufferAttribute, varying, positionLocal, If, Discard,
  exp, mix, max, min, clamp, smoothstep, step, length, dot, cross, normalize, sqrt, abs, sin, cos, pow, select, mrt,
} from 'three/tsl';
import { vnoise3, blackbody } from '../tsl-lib.js';

export const KIND = { GLOW: 0, FIRE: 1, SPARK: 2, SMOKE: 3, RING: 4, STAR: 5, DROP: 6 };

export class ParticlePool {
  /**
   * @param {object} shared uniforms compartilhados do fx {time, camRight, camUp, camPos, sunDir, sunColor, ambient, up}
   * @param {number} capacity
   * @param {'add'|'alpha'} mode
   */
  constructor(shared, capacity, mode) {
    this.shared = shared;
    this.mode = mode;
    this.capacity = capacity;
    this.cursor = 0;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.wrapped = false;
    this.lastEnd = 0; // maior t0+vida registrado (para saber se o pool está vazio)
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    // a0: pos.xyz, t0 | a1: vel.xyz, vida | a2: tam0, tam1, arrasto, tipo
    // a3: cor.rgb (HDR), alfa/intensidade | a4: empuxo, giro, semente, esticar
    this.attrs = [mk(), mk(), mk(), mk(), mk()];
    // inicia mortos (t0 muito no passado)
    for (let i = 0; i < capacity; i++) {
      this.attrs[0].array[i * 4 + 3] = -1e6;
      this.attrs[1].array[i * 4 + 3] = 1;
    }
    this.attrs.forEach((a, i) => geo.setAttribute('p' + i, a));
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.material = this.makeMaterial();
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === 'alpha' ? 20 : 21;
    this.mesh.name = 'fx-particulas-' + mode;
  }

  makeMaterial() {
    const S = this.shared;
    const [A0, A1, A2, A3, A4] = this.attrs.map((a) => instancedBufferAttribute(a));
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.mode === 'alpha' ? THREE.CustomBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    if (this.mode === 'alpha') {
      // alfa pré-multiplicado: cor = emissão + fundo·(1−α)
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
      mat.blendSrcAlpha = THREE.OneFactor;
      mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      mat.blendEquation = THREE.AddEquation;
      mat.premultipliedAlpha = false;
    }
    mat.fog = false;
    mat.toneMapped = false; // o pipeline faz o tone mapping no fim

    // ── vértice: trajetória analítica + billboard
    const age = S.time.sub(A0.w);
    const life = A1.w;
    const t = age.div(life);
    const alive = step(0.0, t).mul(step(t, 1.0));
    const drag = max(A2.z, 0.001);
    const travel = float(1).sub(exp(drag.negate().mul(max(age, 0)))).div(drag);
    const ageC = clamp(age, 0, life);
    const center = A0.xyz.add(A1.xyz.mul(travel)).add(S.up.mul(A4.x.mul(ageC).mul(ageC).mul(0.5)));
    const grow = float(1).sub(pow(float(1).sub(clamp(t, 0, 1)), 2.2));
    const size = mix(A2.x, A2.y, grow).mul(alive);
    const kind = A2.w;
    const corner = positionLocal.xy;
    const rot = A4.y.mul(age).add(A4.z.mul(6.2831));
    const cr = vec2(corner.x.mul(cos(rot)).sub(corner.y.mul(sin(rot))), corner.x.mul(sin(rot)).add(corner.y.mul(cos(rot))));
    const bill = S.camRight.mul(cr.x).add(S.camUp.mul(cr.y)).mul(size);
    // faísca/gota: quad esticado na direção da velocidade projetada na tela
    const vNow = A1.xyz.mul(exp(drag.negate().mul(ageC))).add(S.up.mul(A4.x.mul(ageC)));
    const toCam = normalize(S.camPos.sub(center));
    const vProj = vNow.sub(toCam.mul(dot(vNow, toCam)));
    const vLen = length(vProj);
    const along = vProj.div(max(vLen, 1e-4));
    const side = normalize(cross(along, toCam).add(vec3(1e-5, 0, 0)));
    const stretchLen = size.add(vLen.mul(A4.w)).mul(alive);
    const sparkOff = side.mul(corner.x.mul(size)).add(along.mul(corner.y.mul(stretchLen)));
    const isStreak = kind.greaterThan(1.5).and(kind.lessThan(2.5)).or(kind.greaterThan(5.5));
    mat.positionNode = center.add(select(isStreak, sparkOff, bill));

    const vT = varying(t);
    const vKind = varying(kind);
    const vCol = varying(A3);
    const vSeed = varying(A4.z);
    const vAge = varying(age);

    // ── fragmento
    mat.colorNode = Fn(() => {
      const q = uv().sub(0.5);
      const r2 = dot(q, q).mul(4.0);
      const out = vec4(0).toVar();
      const tt = clamp(vT, 0, 1);
      // fora do disco: descarta (exceto faíscas/gotas, que usam o quad inteiro)
      If(r2.greaterThan(1.0).and(abs(vKind.sub(2.0)).greaterThan(0.5)).and(vKind.lessThan(5.5)), () => {
        Discard();
      });
      if (this.mode === 'alpha') {
        // pool "mix" (alfa pré-multiplicado): o fogo EMITE e a fuligem OCLUI,
        // então uma bola de fogo esfria e vira fumaça escura na mesma partícula
        const z = sqrt(clamp(float(1).sub(r2), 0, 1));
        const shadeOf = (nrm) => {
          const lit = dot(nrm, S.sunDirView).mul(0.5).add(0.5);
          return S.sunColor.mul(lit.mul(lit).mul(0.9).add(0.08)).add(S.ambient);
        };
        If(vKind.lessThan(1.5), () => {
          // ── FIRE
          const p3 = vec3(q.mul(2.0), z).mul(1.3).add(vec3(vSeed.mul(31.0), vSeed.mul(7.0).sub(vAge.mul(0.6)), vSeed.mul(13.0)));
          // domínio deformado + ruído "billow" (|2n−1| invertido) → couve-flor
          const wv = vnoise3(p3.mul(0.7));
          const pw = p3.add(vec3(wv, wv.mul(0.7), wv.mul(1.3)).mul(1.3));
          const bil = (x) => float(1).sub(abs(vnoise3(x).mul(2).sub(1)));
          const n = bil(pw).mul(0.48).add(bil(pw.mul(2.1)).mul(0.28)).add(bil(pw.mul(4.3)).mul(0.15)).add(bil(pw.mul(8.9)).mul(0.09));
          const body = float(1).sub(r2).mul(z.mul(0.5).add(0.6));
          const dens = smoothstep(0.04, 0.7, body.add(n.sub(0.62).mul(1.35)).sub(tt.mul(0.5)));
          // temperatura varia por dentro: veios quentes entre bolsões mais frios
          const heat = clamp(pow(dens, 1.2).mul(pow(float(1).sub(tt), 2.0)).mul(vCol.w).mul(n.mul(1.1).add(0.15)), 0, 1);
          const emis = blackbody(heat).mul(vCol.rgb).mul(dens);
          const soot = dens.mul(smoothstep(0.1, 0.6, tt.add(float(1).sub(z).mul(0.25)).add(float(0.6).sub(n).mul(0.5))));
          const fadeOut = pow(float(1).sub(tt), 0.9);
          const alpha = clamp(soot.mul(0.92).add(dens.mul(0.2)), 0, 1).mul(fadeOut);
          const nrm = normalize(vec3(q.mul(2.0).add(n.sub(0.5).mul(0.8)), z.add(0.1)));
          const sootCol = vec3(0.06, 0.055, 0.05).mul(shadeOf(nrm));
          out.assign(vec4(emis.mul(fadeOut).add(sootCol.mul(alpha)), alpha));
        }).Else(() => {
          // ── SMOKE (iluminada pela estrela, brasa no início)
          const p3 = vec3(q.mul(2.2), z.mul(0.8)).add(vec3(vSeed.mul(17.0), vSeed.mul(5.0).add(vAge.mul(0.12)), vSeed.mul(9.0)));
          const n = vnoise3(p3.mul(1.7)).mul(0.6).add(vnoise3(p3.mul(4.1)).mul(0.3)).add(vnoise3(p3.mul(9.3)).mul(0.1));
          const dens = smoothstep(0.05, 0.55, float(1).sub(r2).mul(1.25).add(n.sub(0.5).mul(1.5)).sub(tt.mul(0.35)));
          const fadeIn = smoothstep(0.0, 0.06, tt);
          const fadeOut = pow(float(1).sub(tt), 1.4);
          const alpha = clamp(dens.mul(vCol.w).mul(fadeIn).mul(fadeOut), 0, 1);
          const nrm = normalize(vec3(q.mul(2.0).add(n.sub(0.5).mul(0.9)), z.add(0.15)));
          const ember = blackbody(clamp(float(0.5).sub(tt.mul(4.0)), 0, 1).mul(dens).mul(float(1).sub(r2.mul(0.6)))).mul(0.5);
          const col = vCol.rgb.mul(shadeOf(nrm));
          out.assign(vec4(col.mul(alpha).add(ember.mul(fadeOut)), alpha));
        });
      } else {
        If(vKind.lessThan(0.5), () => {
          // GLOW
          const g = exp(r2.mul(-5.5)).add(exp(r2.mul(-28.0)).mul(1.4));
          const fade = pow(float(1).sub(tt), 1.6);
          out.assign(vec4(vCol.rgb.mul(vCol.w).mul(g).mul(fade), 1));
        })
          .ElseIf(vKind.lessThan(2.5), () => {
            // SPARK: núcleo fino, esfria de branco a laranja
            const x = q.x.mul(2.0);
            const y = q.y.add(0.5); // 0 = cauda, 1 = cabeça
            const core = exp(x.mul(x).mul(-9.0)).mul(smoothstep(0.0, 0.6, y)).mul(smoothstep(1.0, 0.85, y));
            const temp = float(1).sub(tt.mul(0.85)).mul(vCol.w);
            const c = blackbody(clamp(temp, 0, 1)).mul(vCol.rgb).mul(2.0);
            out.assign(vec4(c.mul(core), 1));
          })
          .ElseIf(vKind.lessThan(4.5), () => {
            // RING: onda de choque
            const r = sqrt(r2);
            // casca fina com falhas angulares (não um "donut" uniforme)
            const ang = q.y.div(max(r, 1e-3)).mul(3.0).add(q.x.div(max(r, 1e-3)).mul(2.0)).add(vSeed.mul(10.0));
            const brk = vnoise3(vec3(q.mul(9.0), vSeed.mul(7.0))).mul(0.7).add(0.3).mul(sin(ang).mul(0.15).add(0.85));
            const ring = exp(abs(r.sub(0.86)).mul(-45.0)).add(exp(abs(r.sub(0.8)).mul(-9.0)).mul(0.12));
            const fade = pow(float(1).sub(tt), 2.5);
            out.assign(vec4(vCol.rgb.mul(vCol.w).mul(ring).mul(brk).mul(fade).mul(step(r, 1.0)), 1));
          })
          .ElseIf(vKind.lessThan(5.5), () => {
            // STAR: espículas
            const ax = abs(q.x).mul(2.0);
            const ay = abs(q.y).mul(2.0);
            const sp = exp(ax.mul(-60.0)).mul(exp(ay.mul(-2.5))).add(exp(ay.mul(-60.0)).mul(exp(ax.mul(-2.5))));
            const d1 = abs(q.x.add(q.y)).mul(1.414);
            const d2 = abs(q.x.sub(q.y)).mul(1.414);
            const sp2 = exp(d1.mul(-80.0)).add(exp(d2.mul(-80.0))).mul(exp(r2.mul(-3.0))).mul(0.35);
            const core = exp(r2.mul(-30.0)).mul(2.0);
            const fade = pow(float(1).sub(tt), 1.3);
            out.assign(vec4(vCol.rgb.mul(vCol.w).mul(sp.add(sp2).add(core)).mul(fade), 1));
          })
          .Else(() => {
            // DROP: gota/estilhaço frio
            const x = q.x.mul(2.0);
            const y = q.y.add(0.5);
            const core = exp(x.mul(x).mul(-6.0)).mul(smoothstep(0.0, 0.5, y)).mul(smoothstep(1.0, 0.7, y));
            const fade = float(1).sub(tt);
            out.assign(vec4(vCol.rgb.mul(vCol.w).mul(core).mul(fade), 1));
          });
      }
      return out;
    })();
    // não grava velocidade (alfa 0 → o MRT de velocidade fica intacto)
    maskVelocity(mat);
    return mat;
  }

  /**
   * Agenda uma partícula. p/v em coordenadas locais do pai do pool.
   * o: {t0, life, s0, s1, drag, kind, r,g,b, a, buoy, spin, seed, stretch}
   */
  emit(px, py, pz, vx, vy, vz, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.cursor === 0) this.wrapped = true;
    const k = i * 4;
    const [a0, a1, a2, a3, a4] = this.attrs.map((a) => a.array);
    a0[k] = px;
    a0[k + 1] = py;
    a0[k + 2] = pz;
    a0[k + 3] = o.t0;
    a1[k] = vx;
    a1[k + 1] = vy;
    a1[k + 2] = vz;
    a1[k + 3] = o.life;
    a2[k] = o.s0;
    a2[k + 1] = o.s1;
    a2[k + 2] = o.drag ?? 0;
    a2[k + 3] = o.kind;
    a3[k] = o.r;
    a3[k + 1] = o.g;
    a3[k + 2] = o.b;
    a3[k + 3] = o.a ?? 1;
    a4[k] = o.buoy ?? 0;
    a4[k + 1] = o.spin ?? 0;
    a4[k + 2] = o.seed ?? rand();
    a4[k + 3] = o.stretch ?? 0.05;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    const end = o.t0 + o.life;
    if (end > this.lastEnd) this.lastEnd = end;
  }

  /** Envia a faixa alterada para a GPU. */
  flush() {
    if (this.dirtyMax < 0) return;
    const start = this.wrapped ? 0 : this.dirtyMin;
    const count = this.wrapped ? this.capacity : this.dirtyMax - this.dirtyMin + 1;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(start * 4, count * 4);
      a.needsUpdate = true;
    }
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.wrapped = false;
  }

  /** Quantas estão vivas agora (estimativa barata no CPU). */
  alive(time) {
    let n = 0;
    const a0 = this.attrs[0].array;
    const a1 = this.attrs[1].array;
    for (let i = 0; i < this.capacity; i++) {
      const t = time - a0[i * 4 + 3];
      if (t >= 0 && t <= a1[i * 4 + 3]) n++;
    }
    return n;
  }

  /** Desloca todas as posições (usado ao recentrar o pool). */
  translate(dx, dy, dz) {
    const a0 = this.attrs[0].array;
    for (let i = 0; i < this.capacity; i++) {
      a0[i * 4] += dx;
      a0[i * 4 + 1] += dy;
      a0[i * 4 + 2] += dz;
    }
    this.wrapped = true;
    this.dirtyMax = this.capacity - 1;
    this.dirtyMin = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
