// Nuvens volumétricas por raymarching numa casca esférica (base → topo).
// A câmera pode estar acima (órbita), dentro (atravessando as nuvens na
// reentrada) ou abaixo (céu nublado). Três materiais com o mesmo programa:
// casca externa (faces frontais, teste de profundidade) e, de dentro/abaixo,
// faces de trás SEM teste de profundidade — o raio para sozinho no que já foi
// desenhado (relevo, nave, cabine) lendo o buffer de profundidade, então
// nuvens na frente de uma montanha aparecem e as de trás não.
//
// Densidade = mapa de clima (weatherMap.js: cobertura, tipo de nuvem,
// umidade) × perfil vertical (estrato chato ↔ cúmulo alto, por tipo) × forma
// Perlin-Worley 3D − erosão por ruído fino (fiapos no topo, enrolado na base).
// Luz: Beer + "powder" + fase dupla de Henyey-Greenstein, duas amostras de
// sombra em direção ao sol, aproximação de espalhamento múltiplo (lóbulo de
// Beer atenuado), ambiente do céu escurecendo nas bases úmidas, perspectiva
// aérea no fim. Passos concentrados perto da câmera quando dentro/abaixo.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, dot, sqrt, max, min, exp, select, length, Loop, If, Break, normalize, positionLocal, smoothstep,
  clamp, mix, pow, uniform, screenCoordinate, fract, sin, viewportDepthTexture, logarithmicDepthToViewZ, cameraNear, cameraFar,
  screenUV, positionView,
} from 'three/tsl';
import { N3, cloudCoverage, weatherAt } from './materials.js';
import { sunTrans, PI } from './scatter.js';

const hg = (mu, g) => {
  const g2 = g * g;
  return float(1 - g2).div(pow(max(float(1 + g2).sub(mu.mul(2 * g)), 1e-4), 1.5)).mul(1 / (4 * PI));
};

/** Camada de nuvens (raios absolutos, m). */
export function cloudLayer(body) {
  const R = body.radius;
  const type = body.type;
  let base = 1500, thick = 1500;
  if (type === 'ice') { base = 1100; thick = 1300; }
  if (type === 'desert') { base = 2600; thick = 1000; }
  if (type === 'volcanic') { base = 1400; thick = 1700; }
  if (type === 'toxic') { base = 900; thick = 1600; }
  if (type === 'ocean') { base = 1200; thick = 1600; }
  if (body.kind === 'gas_giant') { base = 2000; thick = 4000; }
  return { base: R + base, top: R + base + thick };
}

export function makeCloudMaterials(body, U, S, opts) {
  const L = cloudLayer(body);
  const C = {
    base: uniform(L.base), top: uniform(L.top), density: uniform(0.0042),
    tint: uniform(new THREE.Vector3(1, 1, 1)), dark: uniform(new THREE.Vector3(0.62, 0.66, 0.74)),
  };
  if (body.type === 'volcanic') { C.tint.value.set(0.62, 0.56, 0.52); C.dark.value.set(0.25, 0.22, 0.21); }
  if (body.type === 'toxic') { C.tint.value.set(0.86, 0.95, 0.62); C.dark.value.set(0.45, 0.5, 0.3); }
  if (body.type === 'desert') { C.tint.value.set(1.0, 0.92, 0.82); C.dark.value.set(0.7, 0.6, 0.52); }
  if (body.type === 'ice') { C.tint.value.set(0.95, 0.98, 1.0); C.dark.value.set(0.6, 0.66, 0.76); }
  const steps = Math.max(10, opts.cloudSteps | 0);

  const remap = (v, lo, hi) => clamp(v.sub(lo).div(hi.sub(lo)), 0.0, 1.0);
  /** Densidade num ponto local p com amostra do mapa de clima w (vec4) e cobertura cov. */
  const density = (p, w, cov) => {
    const r = length(p);
    const hn = r.sub(C.base).div(C.top.sub(C.base));
    // tipo 0 → estrato (topo baixo e achatado); 1 → cúmulo que ocupa a camada toda
    const topLim = mix(float(0.32), float(1.0), w.y);
    const grad = smoothstep(0.0, 0.08, hn).mul(smoothstep(topLim, topLim.mul(0.45), hn));
    const n = N3(p.mul(1 / 2600).add(S.wind.mul(3.1)));
    const shape = n.r.mul(0.6).add(n.b.mul(0.55));
    const base = remap(shape.mul(grad), float(1).sub(cov), float(1)).mul(cov);
    // erosão: fiapos no topo, bordas enroladas na base
    const det = N3(p.mul(1 / 540).add(S.wind.mul(6.0)).add(vec3(0, S.time.mul(0.0008), 0))).a;
    const mod = mix(det, float(1).sub(det), clamp(hn.mul(3.0), 0.0, 1.0)).mul(0.36);
    return remap(base, mod, float(1)).mul(mix(float(1.2), float(2.2), cov));
  };

  const marchFn = (useDepth, curve) => Fn(() => {
    const ro = S.cam;
    const rd = normalize(positionLocal.sub(ro)).toVar();
    const b = dot(ro, rd).toVar();
    const perp = ro.sub(rd.mul(b));
    const p2 = dot(perp, perp).toVar();
    const r0 = length(ro).toVar();
    const dT = C.top.mul(C.top).sub(p2).toVar(), dB = C.base.mul(C.base).sub(p2).toVar(), dG = U.R.mul(U.R).sub(p2).toVar();
    const sT = sqrt(max(dT, 0.0)).toVar(), sB = sqrt(max(dB, 0.0)).toVar();
    const hitB = dB.greaterThan(0.0).toVar();
    const tStart = float(0).toVar(), tEnd = float(0).toVar(), seg = float(0).toVar();
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
    tEnd.assign(min(tEnd, tStart.add(useDepth ? 48000.0 : 90000.0)));
    if (useDepth) {
      const dz = viewportDepthTexture(screenUV).x;
      const vz = logarithmicDepthToViewZ(dz, cameraNear, cameraFar);
      const cosA = normalize(positionView).z.negate().max(1e-3);
      const sceneD = vz.negate().div(cosA);
      tEnd.assign(select(dz.lessThan(0.99999), min(tEnd, sceneD), tEnd));
    }
    seg.assign(max(tEnd.sub(tStart), 0.0).mul(select(dT.greaterThan(0.0), float(1), float(0))));
    const jit = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233)).add(S.time.mul(7.13))).mul(43758.5453)).toVar();
    const trans = float(1).toVar();
    const acc = vec3(0).toVar();
    const tFirst = float(-1).toVar();
    const mu = dot(rd, S.sunL).toVar();
    const phase = mix(hg(mu, 0.42), hg(mu, -0.15), 0.35).mul(4 * PI).toVar();
    // luz do sol nas nuvens: transmitância avaliada perto do chão (≈350 m) para
    // que os pores do sol tinjam as nuvens como numa atmosfera "grande"
    const pm0 = ro.add(rd.mul(tStart.add(seg.mul(0.3))));
    const pm = normalize(pm0).mul(U.R.add(350.0));
    const sunC = S.sunCol.mul(body.atmosphere ? sunTrans(U, pm, S.sunL) : vec3(1)).mul(C.tint).toVar();
    const ambC = S.amb.mul(2.4).add(S.skyZ.mul(0.25)).mul(C.tint).toVar();
    const sigma = C.density;
    const k = float(curve);
    If(seg.greaterThan(1.0), () => {
      Loop(steps, ({ i }) => {
        // distribuição t = seg·x^k (k>1 concentra os passos perto da câmera)
        const x0 = float(i).add(jit).div(steps);
        const t = tStart.add(seg.mul(pow(x0, k)));
        const ds = seg.mul(k).mul(pow(max(x0, 0.5 / steps), k.sub(1.0))).div(steps);
        const p = ro.add(rd.mul(t));
        const w = weatherAt(S, normalize(p));
        const cov = cloudCoverage(U, S, null, w);
        If(cov.greaterThan(0.015), () => {
          const d = density(p, w, cov);
          If(d.greaterThan(0.001), () => {
            If(tFirst.lessThan(0.0), () => { tFirst.assign(t); });
            const pa = p.add(S.sunL.mul(180.0)), pb = p.add(S.sunL.mul(700.0));
            const l1 = density(pa, w, cov);
            const wb = weatherAt(S, normalize(pb));
            const l2 = density(pb, wb, cloudCoverage(U, S, null, wb));
            const od = l1.mul(180.0).add(l2.mul(520.0)).mul(sigma);
            // espalhamento múltiplo aproximado: soma de lóbulos de Beer cada vez mais fracos
            const Tl = exp(od.negate()).add(exp(od.mul(-0.25)).mul(0.32)).add(exp(od.mul(-0.06)).mul(0.1));
            const powder = float(1).sub(exp(d.mul(sigma).mul(-480.0))).mul(0.65).add(0.35);
            const hn = length(p).sub(C.base).div(C.top.sub(C.base));
            // bases úmidas (chuva) escurecem; topos recebem mais céu
            const amb = ambC.mul(mix(C.dark, vec3(1.0), clamp(hn.mul(1.2).add(0.15).sub(w.z.mul(0.35)), 0.0, 1.0)));
            const lum = sunC.mul(Tl).mul(phase).mul(powder).add(amb);
            const Ts = exp(d.mul(sigma).mul(ds).negate());
            acc.addAssign(lum.mul(trans).mul(float(1).sub(Ts)));
            trans.mulAssign(Ts);
            If(trans.lessThan(0.012), () => { Break(); });
          });
        });
      });
    });
    const alpha = float(1).sub(trans);
    // perspectiva aérea simplificada: nuvens longe dissolvem na cor do horizonte
    const far = max(tFirst, 0.0);
    const haze = float(1).sub(exp(far.mul(-1 / 38000)));
    const col = mix(acc, S.skyH.mul(alpha), haze.mul(0.8));
    return vec4(col.add(S.skyZ.mul(S.flash).mul(alpha).mul(2.0)), alpha);
  });

  const nodeOuter = marchFn(false, 1.0)();
  let nodeIn = null;
  const mk = (side, depthTest) => {
    const nd = depthTest ? nodeOuter : (nodeIn ||= marchFn(true, 1.7)());
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
  const inside = mk(THREE.BackSide, false);
  return { C, layer: L, outer: mk(THREE.FrontSide, true), below: inside, inside };
}
