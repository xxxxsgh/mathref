// Buraco negro com disco de acreção e LENTE GRAVITACIONAL de verdade.
//
// Uma esfera (raio = 30 rs) em volta do buraco é desenhada com um shader que
// integra a trajetória curva de cada raio de luz (aproximação clássica da
// geodésica nula de Schwarzschild: a' = -1,5·h²·r̂/r⁴ em unidades de rs).
// Cada raio pode:
//   · cair no horizonte (sombra preta, com anel de fótons na borda),
//   · cruzar o disco fino de acreção uma ou mais vezes (a imagem de trás do
//     disco aparece curvada por cima e por baixo da sombra),
//   · escapar — e então amostra o MESMO céu (cubemap + estrelas) na direção
//     final, ou seja, estrelas e nebulosa atrás do buraco aparecem distorcidas
//     e formam o anel de Einstein.
// O disco tem perfil de temperatura de Shakura–Sunyaev, rotação diferencial
// kepleriana (com cruzamento de fases para não "enrolar" com o tempo),
// Doppler relativístico (um lado azulado e muito mais brilhante) e
// desvio gravitacional para o vermelho perto da borda interna.
//
// Fora da esfera, o desvio fraco (2·rs/b) é aplicado pelo fundo (skyDome) e o
// desvio do trecho de raio fora da esfera é somado aqui na saída — sem emenda.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, sqrt, cross,
  positionWorld, Loop, If, Break, int, atan, cos, sin, log, fract,
} from 'three/tsl';
import { n3, hash13 } from './tsl.js';

globalThis.__bhdbg = new URLSearchParams(location.search).get('bhdbg') === '1';
const STEPS = { ultra: 180, high: 130, medium: 84, mobile: 56 };
const RB = 30; // raio da esfera de integração (em rs)

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class BlackHole {
  constructor(ctx, { star, getPos, sky }) {
    this.ctx = ctx; this.star = star; this.getPos = getPos; this.sky = sky;
    const acc = star.accretion || { inner: star.radius * 3, outer: star.radius * 22, tilt: 0.25 };
    const rs = star.radius;
    this.rs = rs;
    const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), acc.tilt).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
    const e1 = new THREE.Vector3(1, 0, 0).projectOnPlane(n).normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    this.normal = n;
    const u = this.u = {
      camRel: uniform(new THREE.Vector3(0, 0, 100)),
      n: uniform(n), e1: uniform(e1), e2: uniform(e2),
      inner: uniform(acc.inner / rs), outer: uniform(Math.min(acc.outer / rs, RB - 4)),
      time: uniform(0),
      gain: uniform(1),
    };
    const N = STEPS[ctx.quality.name] || STEPS.high;
    const U = sky.u;

    const diskSample = (hit, vdir) => {
      // ponto de cruzamento → cor/opacidade do disco
      const x = dot(hit, u.e1), y = dot(hit, u.e2);
      const rho = sqrt(x.mul(x).add(y.mul(y))).toVar();
      const phi = atan(y, x);
      const inR = u.inner, outR = u.outer;
      const edge = smoothstep(inR.mul(0.92), inR.mul(1.12), rho).mul(smoothstep(outR, outR.mul(0.55), rho));
      // perfil de temperatura (Shakura–Sunyaev): pico logo depois da borda interna
      const xin = inR.div(rho);
      const temp = pow(rho.div(inR), -0.75).mul(pow(max(float(1).sub(sqrt(xin.mul(0.96))), 0.0), 0.25)).mul(1.25).toVar();
      // velocidade orbital (β) e Doppler relativístico
      const beta = clamp(sqrt(float(0.5).div(rho)), 0.0, 0.7);
      const tang = normalize(cross(u.n, hit));
      const kdir = vdir.negate(); // o fóton viaja para o observador
      const gam = float(1).div(sqrt(float(1).sub(beta.mul(beta))));
      const D = float(1).div(gam.mul(float(1).sub(beta.mul(dot(tang, kdir)))));
      const g = D.mul(sqrt(max(float(1).sub(float(1).div(rho)), 0.02))).toVar();
      // turbulência com rotação diferencial (duas fases cruzadas)
      const w = beta.div(rho).mul(2.2);
      const P = 24.0;
      const ta = fract(u.time.div(P)).mul(P), tb = fract(u.time.div(P).add(0.5)).mul(P);
      const wa = abs(fract(u.time.div(P)).mul(2).sub(1));
      const lr = log(rho);
      const tex = (tt, off) => {
        const p1 = phi.sub(w.mul(tt));
        // filamentos esticados ao longo da órbita: alta frequência radial, baixa angular
        const a = n3(vec3(cos(p1.mul(2)).mul(0.45), sin(p1.mul(2)).mul(0.45), lr.mul(1.1).add(off))).a;
        const b2 = n3(vec3(cos(p1.mul(5)).mul(0.8), sin(p1.mul(5)).mul(0.8), lr.mul(2.6).add(off.mul(2.0)))).r;
        return a.mul(0.62).add(b2.mul(0.5));
      };
      const turb = mix(tex(tb, float(0.37)), tex(ta, float(0.0)), wa).toVar();
      const dens = edge.mul(smoothstep(0.3, 0.85, turb).mul(0.7).add(0.3)).toVar();
      // cor de corpo negro deslocada pelo Doppler
      const tt = temp.mul(g).toVar();
      const col = mix(vec3(0.9, 0.16, 0.03), vec3(1.0, 0.55, 0.2), smoothstep(0.2, 0.55, tt)).toVar();
      col.assign(mix(col, vec3(1.0, 0.86, 0.66), smoothstep(0.55, 0.95, tt)));
      col.assign(mix(col, vec3(0.9, 0.93, 1.0), smoothstep(0.95, 1.4, tt)));
      col.assign(mix(col, vec3(0.6, 0.72, 1.0), smoothstep(1.4, 2.2, tt)));
      const I = pow(g, 5.0).mul(pow(temp, 2.2)).mul(dens).mul(turb.mul(1.3).add(0.25)).mul(4.5).mul(u.gain);
      const alpha = clamp(dens.mul(0.95), 0.0, 0.97);
      if (globalThis.__bhdbg) return vec4(vec3(smoothstep(1.0, 1.3, g), smoothstep(0.5, 1.0, temp).mul(0.3), smoothstep(1.0, 0.7, g)), 1.0);
      return vec4(col.mul(I), alpha);
    };

    const node = Fn(() => {
      const rd = normalize(positionWorld).toVar();
      const ro = u.camRel.toVar();
      // entrada na esfera de integração
      const b = dot(ro, rd);
      const c = dot(ro, ro).sub(RB * RB);
      const disc = b.mul(b).sub(c);
      const tEnter = max(b.negate().sub(sqrt(max(disc, 0.0))), 0.0);
      const p = ro.add(rd.mul(tEnter)).toVar();
      const v = rd.toVar();
      const hv = cross(p, v);
      const h2 = dot(hv, hv);
      const col = vec3(0).toVar();
      const T = float(1).toVar();
      const captured = float(0).toVar();
      const jit = hash13(rd.mul(997.0)).mul(0.3).add(0.85);
      Loop({ start: int(0), end: int(N), type: 'int', condition: '<' }, () => {
        const r = length(p);
        const dt = clamp(r.mul(0.07), 0.025, 1.6).mul(jit);
        const r2 = r.mul(r);
        const acc = p.mul(h2.mul(-1.5).div(r2.mul(r2).mul(r)));
        v.addAssign(acc.mul(dt));
        const pn = p.add(v.mul(dt)).toVar();
        const y0 = dot(p, u.n), y1 = dot(pn, u.n);
        If(y0.mul(y1).lessThan(0.0), () => {
          const f = y0.div(y0.sub(y1));
          const hit = mix(p, pn, f);
          const ds = diskSample(hit, normalize(v));
          col.addAssign(ds.rgb.mul(T));
          T.mulAssign(float(1).sub(ds.a));
        });
        p.assign(pn);
        const rn = length(p);
        If(rn.lessThan(1.0), () => { captured.assign(1); Break(); });
        If(rn.greaterThan(RB + 0.5).and(dot(p, v).greaterThan(0.0)), () => { Break(); });
        If(T.lessThan(0.01), () => { Break(); });
      });
      // céu atrás: direção final + desvio do trecho fora da esfera
      const vd = normalize(v).toVar();
      const bb = sqrt(h2);
      const outside = dot(ro, ro).greaterThan(RB * RB).select(1.0, 0.5);
      const aOut = float(2).div(max(bb, 1.0)).mul(float(1).sub(sqrt(max(float(1).sub(bb.div(RB).mul(bb.div(RB))), 0.0)))).mul(outside);
      const perp = p.sub(vd.mul(dot(p, vd)));
      const pu = perp.div(max(length(perp), 1e-4));
      vd.assign(normalize(vd.mul(cos(aOut)).sub(pu.mul(sin(aOut)))));
      const skyc = this.sky.sample(vd, U.pa).mul(U.exposure);
      const bg = skyc.mul(float(1).sub(captured));
      return vec4(col.add(bg.mul(T)).mul(float(1).sub(U.hyper)), 1);
    });

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
    mat.colorNode = node();
    mat.fog = false;
    const mesh = this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    mesh.name = 'buraco-negro';
    mesh.scale.setScalar(RB * rs);
    mesh.frustumCulled = false;
    mesh.renderOrder = -9000;
    this.entry = ctx.world.add(mesh, null, { getPos: (out) => getPos(out) });
  }

  frame(ctx, t) {
    const p = this.getPos(_v);
    const rel = ctx.player.camWorld.clone().sub(p).divideScalar(this.rs);
    this.u.camRel.value.copy(rel);
    this.u.time.value = t;
    // lente fraca no fundo
    const U = this.sky.u;
    U.bhOn.value = 1;
    U.bhDir.value.copy(rel).negate().normalize();
    U.bhDist.value = rel.length();
  }

  dispose() {
    this.entry.remove();
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.sky.u.bhOn.value = 0;
  }
}
