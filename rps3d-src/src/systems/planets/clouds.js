// Nuvens volumétricas por raymarching numa casca esférica (base → topo).
// A câmera pode estar acima (órbita), dentro (atravessando as nuvens na
// reentrada) ou abaixo (céu nublado). Três materiais com o mesmo programa:
// casca externa (faces frontais, teste de profundidade), interna abaixo da
// base (faces de trás, com teste) e dentro da camada (sem teste de
// profundidade — o raio termina no chão por conta própria).
//
// Densidade = cobertura 2D em escala de clima (compartilhada com a sombra de
// nuvens no terreno) × perfil vertical de cúmulo − erosão por ruído 3D.
// Luz: Beer + "powder" + fase dupla de Henyey-Greenstein, duas amostras de
// sombra em direção ao sol, ambiente do céu; névoa de distância no fim.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, dot, sqrt, max, min, exp, select, length, Loop, If, Break, normalize, positionLocal, smoothstep,
  clamp, mix, pow, uniform, screenCoordinate, fract, sin, viewportDepthTexture, logarithmicDepthToViewZ, cameraNear, cameraFar,
  screenUV, positionView,
} from 'three/tsl';
import { N3, cloudCoverage } from './materials.js';
import { sunTrans, PI } from './scatter.js';

const hg = (mu, g) => {
  const g2 = g * g;
  return float(1 - g2).div(pow(max(float(1 + g2).sub(mu.mul(2 * g)), 1e-4), 1.5)).mul(1 / (4 * PI));
};

export function cloudLayer(body) {
  const R = body.radius;
  const amp = body.terrainAmplitude || 2000;
  const type = body.type;
  const a = Math.min(amp, R * 0.04);
  let base = Math.max(1300, a * 0.75), thick = 1900;
  if (type === 'ice') { base = Math.max(1000, a * 0.6); thick = 1800; }
  if (type === 'desert') { base = Math.max(2000, a * 1.1); thick = 1300; }
  if (type === 'volcanic' || type === 'toxic') { base = Math.max(1100, a * 0.7); thick = 2000; }
  if (body.kind === 'gas_giant') { base = 2000; thick = 4000; }
  return { base: R + base, top: R + base + thick };
}

export function makeCloudMaterials(body, U, S, opts) {
  const L = cloudLayer(body);
  const C = { base: uniform(L.base), top: uniform(L.top), density: uniform(0.0035), tint: uniform(new THREE.Vector3(1, 1, 1)) };
  if (body.type === 'volcanic') C.tint.value.set(0.55, 0.5, 0.48);
  if (body.type === 'toxic') C.tint.value.set(0.85, 0.95, 0.6);
  if (body.type === 'desert') C.tint.value.set(1.0, 0.9, 0.78);
  const steps = Math.max(8, opts.cloudSteps | 0);

  // forma de cúmulo (à la Nubis): ruído base Perlin-Worley × gradiente de
  // altura, recortado pela cobertura do clima, bordas erodidas por ruído fino
  // (enrolado embaixo, fiapos no topo)
  const remap = (v, lo, hi) => clamp(v.sub(lo).div(hi.sub(lo)), 0.0, 1.0);
  const density = (p, cov) => {
    const r = length(p);
    const hn = r.sub(C.base).div(C.top.sub(C.base));
    const grad = smoothstep(0.0, 0.1, hn).mul(smoothstep(1.0, 0.5, hn.sub(cov.mul(0.2))));
    const n = N3(p.mul(1 / 3400).add(S.wind.mul(3.1)));
    const shape = n.r.mul(0.55).add(n.b.mul(0.6));
    const base = shape.mul(grad);
    const withCov = remap(base, float(1).sub(cov), float(1)).mul(cov);
    const det = N3(p.mul(1 / 760).add(S.wind.mul(6.0)).add(vec3(0, S.time.mul(0.0008), 0))).a;
    const mod = mix(det, float(1).sub(det), clamp(hn.mul(3.0), 0.0, 1.0)).mul(0.32);
    return remap(withCov, mod, float(1)).mul(1.6);
  };

  const marchFn = (useDepth) => Fn(() => {
    const ro = S.cam;
    const rd = normalize(positionLocal.sub(ro)).toVar();
    const b = dot(ro, rd).toVar();
    const perp = ro.sub(rd.mul(b));
    const p2 = dot(perp, perp).toVar();
    const r0 = length(ro).toVar();
    const dT = C.top.mul(C.top).sub(p2).toVar(), dB = C.base.mul(C.base).sub(p2).toVar(), dG = U.R.mul(U.R).sub(p2).toVar();
    const sT = sqrt(max(dT, 0.0)).toVar(), sB = sqrt(max(dB, 0.0)).toVar();
    const hitB = dB.greaterThan(0.0).toVar();
    const tStart = float(0).toVar(), tEnd = float(0).toVar(), ds = float(0).toVar(), seg = float(0).toVar();
    // acima do topo
    If(r0.greaterThan(C.top), () => {
      tStart.assign(max(b.negate().sub(sT), 0.0));
      tEnd.assign(select(hitB.and(b.negate().sub(sB).greaterThan(0.0)), b.negate().sub(sB), b.negate().add(sT)));
    }).ElseIf(r0.greaterThan(C.base), () => {
      tStart.assign(0.0);
      tEnd.assign(select(hitB.and(b.negate().sub(sB).greaterThan(0.0)), b.negate().sub(sB), b.negate().add(sT)));
    }).Else(() => {
      const hitG = dG.greaterThan(0.0).and(b.negate().sub(sqrt(max(dG, 0.0))).greaterThan(0.0));
      tStart.assign(b.negate().add(sB));
      tEnd.assign(select(hitG, tStart, b.negate().add(sT)));
    });
    tEnd.assign(min(tEnd, tStart.add(70000.0)));
    if (useDepth) {
      // dentro da camada não há teste de profundidade: o raio para no que já
      // foi desenhado (cabine, nave, relevo) lendo o buffer de profundidade
      const dz = viewportDepthTexture(screenUV).x;
      const vz = logarithmicDepthToViewZ(dz, cameraNear, cameraFar);
      const cosA = normalize(positionView).z.negate().max(1e-3);
      const sceneD = vz.negate().div(cosA);
      tEnd.assign(select(dz.lessThan(0.99999), min(tEnd, sceneD), tEnd));
    }
    seg.assign(max(tEnd.sub(tStart), 0.0).mul(select(dT.greaterThan(0.0), float(1), float(0))));
    ds.assign(seg.div(steps));
    const jit = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233)).add(S.time.mul(7.13))).mul(43758.5453)).toVar();
    const trans = float(1).toVar();
    const acc = vec3(0).toVar();
    const tFirst = float(-1).toVar();
    const mu = dot(rd, S.sunL).toVar();
    const phase = mix(hg(mu, 0.62), hg(mu, -0.18), 0.28).mul(4 * PI).toVar();
    // luz do sol na altura das nuvens (atravessou a atmosfera)
    const pm = ro.add(rd.mul(tStart.add(seg.mul(0.5))));
    const sunC = S.sunCol.mul(body.atmosphere ? sunTrans(U, pm, S.sunL) : vec3(1)).mul(C.tint).toVar();
    const ambC = S.amb.mul(2.2).mul(C.tint).add(S.skyZ.mul(0.15)).toVar();
    const sigma = C.density;
    If(seg.greaterThan(1.0), () => {
      Loop(steps, ({ i }) => {
        const t = tStart.add(ds.mul(float(i).add(jit)));
        const p = ro.add(rd.mul(t));
        const dir = normalize(p);
        const cov = cloudCoverage(U, S, dir);
        If(cov.greaterThan(0.02), () => {
          const d = density(p, cov);
          If(d.greaterThan(0.001), () => {
            If(tFirst.lessThan(0.0), () => { tFirst.assign(t); });
            // sombra em direção ao sol (2 amostras)
            const l1 = density(p.add(S.sunL.mul(160.0)), cov);
            const l2 = density(p.add(S.sunL.mul(620.0)), cloudCoverage(U, S, normalize(p.add(S.sunL.mul(620.0)))));
            const od = l1.mul(160.0).add(l2.mul(460.0)).mul(sigma);
            const Tl = exp(od.negate()).mul(0.75).add(exp(od.mul(-0.25)).mul(0.25));
            const powder = float(1).sub(exp(d.mul(sigma).mul(-420.0))).mul(0.7).add(0.3);
            const hn = length(p).sub(C.base).div(C.top.sub(C.base));
            const lum = sunC.mul(Tl).mul(phase).mul(powder).add(ambC.mul(hn.mul(0.6).add(0.4)));
            const sd = d.mul(sigma);
            const Ts = exp(sd.mul(ds).negate());
            acc.addAssign(lum.mul(trans).mul(float(1).sub(Ts)));
            trans.mulAssign(Ts);
            If(trans.lessThan(0.015), () => { Break(); });
          });
        });
      });
    });
    const alpha = float(1).sub(trans);
    if (typeof location !== 'undefined' && location.search.includes('cdbg=2')) return vec4(alpha, select(tFirst.greaterThan(0.0), float(1), float(0)), ds.div(100.0), 1.0);
    if (typeof location !== 'undefined' && location.search.includes('cdbg=1')) {
      const pe = ro.add(rd.mul(tStart.add(seg.mul(0.5))));
      return vec4(seg.div(8000.0), cloudCoverage(U, S, normalize(pe)), density(pe, cloudCoverage(U, S, normalize(pe))), 1.0);
    }
    // névoa de distância: nuvens longe dissolvem na cor do horizonte
    const haze = float(1).sub(exp(max(tFirst, 0.0).mul(-1 / 52000)));
    const col = mix(acc, S.skyH.mul(alpha), haze.mul(0.75));
    return vec4(col.add(S.skyZ.mul(S.flash).mul(alpha).mul(2.0)), alpha);
  });

  const node = marchFn(false)();
  let nodeD = null;
  const mk = (side, depthTest) => {
    const nd = depthTest ? node : (nodeD ||= marchFn(true)());
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest, side });
    m.fog = false;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
    m.colorNode = nd.xyz;
    m.opacityNode = nd.w;
    return m;
  };
  return { C, layer: L, outer: mk(THREE.FrontSide, true), below: mk(THREE.BackSide, true), inside: mk(THREE.BackSide, false) };
}
