// Materiais TSL do sistema planets: terreno (perto: PBR iluminado pela luz do
// sol do pipeline, com sombras em cascata; longe: auto-iluminado com o sol
// do próprio corpo), oceano, céu (casca de atmosfera) e funções comuns.
//
// Texturização: cores procedurais por bioma a partir de altitude, inclinação
// e das máscaras de terrain.js; detalhe por ruído 3D amostrado na posição
// (equivale a um triplanar sem costura e sem estiramento em penhascos), em
// várias escalas que somem com a distância antes de serrilhar. Detalhe fino
// também vira relevo de pixel (bump por derivadas de tela).
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, attribute, varying, normalize, dot, max, min, mix, smoothstep, clamp, abs, pow, exp,
  length, texture3D, positionView, normalView, faceDirection, normalLocal, positionLocal, output, sin, fract,
  select, reflect, cross, sqrt, step, uniform,
} from 'three/tsl';
import { planetNoiseTexture } from './noiseTex.js';
import { makeScatter, aerial, sunTrans, PI } from './scatter.js';
import { DET_PERIOD } from './chunkgen.js';

export const N3 = (p) => texture3D(planetNoiseTexture(), p, float(0));
/** Frequência compatível com o período do detalhe (sem costura entre chunks). */
export const fq = (meters) => Math.max(1, Math.round(DET_PERIOD / (meters * 4))) / DET_PERIOD; // λ = tamanho do traço (canal R tem 4 ciclos/período)
const C3 = (c) => vec3(c.r, c.g, c.b);

/** Normal perturbada (espaço de vista) por altura procedural — Mikkelsen 2010. */
export function bumpView(H, scale) {
  const h = float(H);
  const dHx = h.dFdx().mul(scale), dHy = h.dFdy().mul(scale);
  const sx = positionView.dFdx(), sy = positionView.dFdy();
  const vN = normalView;
  const R1 = sy.cross(vN), R2 = vN.cross(sx);
  const fDet = sx.dot(R1).mul(faceDirection);
  const grad = fDet.sign().mul(dHx.mul(R1).add(dHy.mul(R2)));
  return fDet.abs().mul(vN).sub(grad).normalize();
}

/** Desvanecimento de um detalhe de comprimento de onda λ (m) pela distância. */
const fade = (dist, lambda) => float(1).sub(smoothstep(lambda * 40, lambda * 220, dist));

/** Cobertura de nuvens (0..1) numa direção local — compartilhada com clouds.js. */
export function cloudCoverage(U, S, dir) {
  const f1 = U.R.div(26000), f2 = U.R.div(7000);
  const a = N3(dir.mul(f1).add(S.wind)).r;
  const b = N3(dir.mul(f2).add(S.wind.mul(1.7)).add(0.37)).g;
  const c = a.mul(0.68).add(b.mul(0.32));
  const lo = float(1).sub(S.cloudCov).mul(0.55).add(0.22);
  return smoothstep(lo, lo.add(0.38), c);
}

// ─── superfície por bioma ────────────────────────────────────────────────
/**
 * Nós de superfície. Retorna { albedo, rough, emissive, bump, bumpScale, metal }.
 * I = { h, m, s, q, slope, up, det, dist, lat } (nós).
 */
function surface(type, P, U, S, I) {
  const { h, m, s, q, slope, up, det, dist, lat } = I;
  const macro = N3(up.mul(U.R.div(5200)));
  const macro2 = N3(up.mul(U.R.div(1300)).add(0.5));
  const meso = N3(det.mul(fq(170)));
  const micro = N3(det.mul(fq(19)));
  const fine = N3(det.mul(fq(2.3)));
  const grain = N3(det.mul(fq(0.45))).g.sub(0.5).mul(fade(dist, 0.45));
  const fFine = fade(dist, 2.3), fMicro = fade(dist, 19), fMeso = fade(dist, 170);
  const vMicro = micro.r.sub(0.5).mul(fMicro);
  const vFine = fine.g.sub(0.5).mul(fFine);
  const vMeso = meso.r.sub(0.5).mul(fMeso);
  let albedo, rough, emissive = vec3(0), bump, bumpScale = float(1), metal = float(0);

  if (type === 'lush' || type === 'ocean' || type === 'toxic') {
    // vegetação
    const meadow = mix(C3(P.lowA), C3(P.lowB), smoothstep(0.3, 0.75, macro.r.add(m.sub(0.5).mul(0.9)).add(vMeso.mul(0.6))));
    const alienPatch = smoothstep(0.6, 0.74, macro2.g.add(vMeso.mul(0.35)).add(vMicro.mul(0.2)));
    const forestCol = mix(C3(P.forest), C3(P.alien), alienPatch);
    const forestMask = smoothstep(0.5, 0.62, m.add(meso.g.sub(0.5).mul(0.5)).add(macro.b.mul(0.25)).sub(slope.mul(1.2)).sub(smoothstep(900, 1600, h).mul(0.6)));
    // copas: manchas escuras/claras de árvores (Worley em ~6 m)
    const canopy = N3(det.mul(fq(6))).b.mul(fade(dist, 6));
    const veg = mix(meadow.mul(vFine.mul(0.5).add(vMicro.mul(0.7)).add(1)), forestCol.mul(canopy.mul(0.9).add(0.55)), forestMask);
    // rocha estratificada
    const strata = N3(vec3(h.mul(1 / 90), up.x.mul(3.0), up.z.mul(3.0)).add(vMicro.mul(0.4))).r;
    const rockCol = mix(C3(P.rock), C3(P.rock2), strata.mul(0.7).add(vMicro.mul(0.9)).add(0.1)).mul(vFine.mul(0.6).add(meso.g.sub(0.5).mul(0.5)).add(1));
    const rockMask = smoothstep(0.24, 0.42, slope.add(vMicro.mul(0.15)).add(q.mul(0.12)));
    // alta montanha (tundra) e neve
    const alpine = smoothstep(1100, 1900, h.add(vMeso.mul(300)));
    const snowLine = float(type === 'toxic' ? 99999 : 2300).sub(lat.mul(1600)).add(macro.r.sub(0.5).mul(500));
    const snow = smoothstep(snowLine, snowLine.add(250), h.add(vMicro.mul(140))).mul(float(1).sub(smoothstep(0.45, 0.65, slope)));
    // praia/várzea
    const beach = smoothstep(9, 2, h.add(vMicro.mul(6))).mul(float(1).sub(smoothstep(0.15, 0.3, slope)));
    const wet = s.mul(float(1).sub(beach)).mul(smoothstep(0.35, 0.1, slope));
    let g = mix(veg, C3(P.high).mul(vMicro.add(1)), alpine.mul(0.75));
    g = mix(g, C3(P.wet).mul(meadow.mul(1.6)), wet.mul(0.45));
    g = mix(g, rockCol, rockMask);
    g = mix(g, C3(P.sand).mul(vFine.mul(0.4).add(vMicro.mul(0.5)).add(1)), beach);
    // leito marinho
    const bed = mix(C3(P.sand), C3(P.seabed), smoothstep(-2, -60, h));
    g = mix(bed.mul(vMicro.add(1)), g, smoothstep(-3, 0.5, h));
    albedo = mix(g, C3(P.snow).mul(vFine.mul(0.15).add(1)), snow);
    rough = mix(mix(float(0.88), float(0.72), rockMask), float(0.45), max(wet.mul(0.6), snow.mul(0.7)));
    bump = vFine.mul(0.5).add(vMicro.mul(3.0)).add(canopy.mul(forestMask).mul(0.6));
    bumpScale = mix(float(0.6), float(1.4), rockMask);
    if (type === 'toxic') {
      // fungos bioluminescentes (só se percebem à noite)
      const spots = smoothstep(0.78, 0.92, N3(det.mul(fq(4))).b).mul(forestMask.add(0.3)).mul(fade(dist, 4));
      emissive = C3(P.glow).mul(spots.mul(0.6));
    }
  } else if (type === 'desert') {
    const sandCol = mix(C3(P.sand), C3(P.lowB), smoothstep(0.3, 0.7, macro.r.add(m.sub(0.5).mul(0.8)).add(vMeso.mul(0.4))));
    // ondulações de areia (marcas do vento) — bump fino
    const ripple = sin(det.x.mul(2.1).add(det.z.mul(1.3)).add(fine.r.mul(5))).mul(fFine);
    const sandMask = clamp(s.mul(1.2).add(float(1).sub(smoothstep(0.1, 0.3, slope.add(vMicro.mul(0.1))))).mul(0.85), 0, 1)
      .mul(float(1).sub(smoothstep(0.28, 0.5, slope.add(vMicro.mul(0.15)))));
    // estratos coloridos nas paredes das mesetas e cânions
    const band = h.mul(1 / 31).add(vMicro.mul(0.9)).add(macro.g.mul(3));
    const b1 = sin(band.mul(2.1)).mul(0.5).add(0.5), b2 = sin(band.mul(5.3).add(1.3)).mul(0.5).add(0.5);
    const strataCol = mix(mix(C3(P.rock), C3(P.rock2), b1), C3(P.high), b2.mul(b2).mul(0.6));
    const varnish = smoothstep(0.5, 0.85, slope).mul(0.35);
    const rockCol = strataCol.mul(float(1).sub(varnish)).mul(vFine.mul(0.7).add(vMicro.mul(0.6)).add(1));
    // salinas nas bacias
    const salt = smoothstep(-80, -200, h).mul(smoothstep(0.08, 0.02, slope));
    let g = mix(rockCol, sandCol.mul(vFine.mul(0.25).add(vMicro.mul(0.35)).add(1)), sandMask);
    g = mix(g, C3(P.snow).mul(vMicro.mul(0.4).add(0.95)), salt.mul(0.8));
    albedo = g;
    rough = mix(float(0.8), float(0.95), sandMask);
    bump = mix(vFine.mul(0.8).add(vMicro.mul(4)), ripple.mul(0.05).add(vMicro.mul(0.6)), sandMask);
    bumpScale = float(1);
  } else if (type === 'ice') {
    const snowCol = mix(C3(P.lowA), C3(P.lowB), smoothstep(0.35, 0.7, macro.r.add(vMeso.mul(0.5)))).mul(vFine.mul(0.08).add(1));
    const iceMask = smoothstep(0.55, 0.75, s.mul(0.5).add(macro2.b.mul(0.6)).add(vMeso.mul(0.5))).mul(smoothstep(0.02, 0.12, slope).mul(0.6).add(0.4));
    const iceCol = mix(C3(P.forest), C3(P.alien), smoothstep(0.3, 0.8, micro.g)).mul(vFine.mul(0.2).add(1));
    const crev = smoothstep(0.45, 0.8, q).mul(s);
    const rockMask = smoothstep(0.3, 0.5, slope.add(vMicro.mul(0.2)));
    const rockCol = mix(C3(P.rock), C3(P.rock2), micro.r).mul(vFine.mul(0.6).add(1));
    let g = mix(snowCol, iceCol, iceMask);
    g = mix(g, C3(P.wet).mul(0.6), crev);
    g = mix(g, rockCol, rockMask);
    albedo = g;
    rough = mix(mix(float(0.62), float(0.18), iceMask), float(0.8), rockMask);
    bump = vFine.mul(0.35).add(vMicro.mul(1.4)).add(rockMask.mul(vMicro.mul(3)));
    // cristais: brilho especular pontual
    metal = smoothstep(0.86, 0.95, fine.b).mul(fFine).mul(0.4);
  } else if (type === 'volcanic') {
    const ash = smoothstep(0.25, 0.08, slope).mul(smoothstep(0.35, 0.65, macro.r.add(vMeso.mul(0.5))));
    const basalt = mix(C3(P.rock), C3(P.rock2), micro.a.mul(0.7).add(vFine.mul(0.5)));
    const sulfur = smoothstep(0.7, 0.85, macro2.b.add(q.mul(0.3))).mul(smoothstep(0.3, 0.1, slope));
    const rust = smoothstep(0.55, 0.75, macro.g).mul(0.6);
    let g = mix(basalt, C3(P.lowB).mul(vMicro.mul(0.5).add(1)), ash.mul(0.8));
    g = mix(g, C3(P.forest), rust.mul(float(1).sub(ash)));
    g = mix(g, C3(P.alien).mul(vFine.mul(0.4).add(1)), sulfur);
    // lava: crosta fraturada (Worley) com incandescência nas fendas, fluindo
    const flow = N3(det.mul(fq(9)).add(vec3(0, 0, S.time.mul(0.003))));
    const flow2 = N3(det.mul(fq(2.5)).add(vec3(S.time.mul(0.004), 0, 0)));
    // crosta escura fraturada (Worley) — fendas incandescentes, mais quentes nas bordas e nos canais
    const cell = flow.b.mul(0.75).add(flow2.b.mul(0.25));
    const crack = smoothstep(0.7, 0.93, cell).mul(fMicro.mul(0.5).add(0.5));
    const lavaHot = clamp(s.mul(1.3).sub(0.15), 0, 1);
    const molten = smoothstep(0.55, 0.85, flow.r.add(macro2.r.mul(0.4)).sub(0.2)).mul(0.6);
    const heat = lavaHot.mul(max(crack, molten)).add(lavaHot.mul(float(1).sub(lavaHot)).mul(1.6));
    emissive = mix(vec3(1.0, 0.12, 0.01), vec3(1.0, 0.55, 0.12), clamp(heat, 0, 1)).mul(pow(clamp(heat, 0, 1.2), 2.0).mul(7.0));
    albedo = mix(g, vec3(0.025, 0.02, 0.018).mul(flow2.r.add(0.6)), lavaHot);
    rough = mix(float(0.75), float(0.92), ash);
    bump = vFine.mul(0.8).add(vMicro.mul(3.5)).sub(crack.mul(lavaHot).mul(0.6));
  } else { // dead
    const mare = smoothstep(-150, -500, h.add(vMeso.mul(200))).mul(0.7);
    const reg = mix(C3(P.lowA), C3(P.lowB), smoothstep(0.3, 0.7, macro.r.add(vMeso.mul(0.6)))).mul(vFine.mul(0.3).add(vMicro.mul(0.4)).add(1));
    const ej = s.mul(smoothstep(0.4, 0.7, micro.r.add(meso.g.mul(0.5))));
    const rockMask = smoothstep(0.3, 0.5, slope.add(vMicro.mul(0.2)));
    let g = mix(reg, C3(P.deep).mul(vMicro.mul(0.5).add(1.2)), mare);
    g = mix(g, C3(P.snow), ej.mul(0.6));
    g = mix(g, mix(C3(P.rock), C3(P.rock2), micro.g), rockMask);
    albedo = g;
    rough = float(0.92);
    bump = vFine.mul(0.6).add(vMicro.mul(2.6));
  }
  albedo = albedo.mul(grain.mul(0.25).add(1));
  bump = bump.add(grain.mul(0.12));
  return { albedo, rough, emissive, bump, bumpScale, metal };
}

/** Uniforms de estado por corpo (atualizados todo frame por planetView). */
export function stateUniforms() {
  return {
    sunL: uniform(new THREE.Vector3(1, 0, 0)),
    sunCol: uniform(new THREE.Vector3(4, 3.8, 3.5)),  // radiância direta (cor × intensidade)
    skyI: uniform(new THREE.Vector3(12, 11.5, 11)),   // intensidade para a dispersão
    cam: uniform(new THREE.Vector3(0, 0, 1e7)),
    time: uniform(0),
    comp: uniform(1),         // fração da luz do sol que o material precisa somar sozinho
    fogD: uniform(0), fogCol: uniform(new THREE.Vector3(0.5, 0.5, 0.5)),
    cloudCov: uniform(0.5), wind: uniform(new THREE.Vector3()),
    cloudMid: uniform(3000),
    amb: uniform(new THREE.Vector3(0.03, 0.04, 0.06)),
    skyZ: uniform(new THREE.Vector3(0.1, 0.2, 0.5)), skyH: uniform(new THREE.Vector3(0.4, 0.5, 0.6)),
    axis: uniform(new THREE.Vector3(0, 1, 0)),
    city: uniform(0),
    flash: uniform(0),
  };
}

/** Fatores comuns de iluminação própria (vértice): sol transmitido, sombra de nuvem. */
function perVertexLight(body, U, S, p, up, hasAtmo, clouds) {
  const sunG = hasAtmo ? sunTrans(U, p, S.sunL) : vec3(1);
  let cs = float(0);
  if (clouds) {
    const mu = max(dot(up, S.sunL), 0.08);
    const pc = p.add(S.sunL.mul(S.cloudMid.sub(length(p).sub(U.R)).max(0).div(mu)));
    cs = cloudCoverage(U, S, normalize(pc)).mul(smoothstep(-0.05, 0.1, dot(up, S.sunL)));
  }
  return vec4(sunG, cs);
}

/**
 * Materiais do terreno de um corpo. opts = { atmoSteps, clouds }
 * Retorna { near, far }.
 */
export function makeTerrainMaterials(body, P, U, S, opts) {
  const type = body.type;
  const hasAtmo = !!body.atmosphere;
  const scat = hasAtmo ? makeScatter(U, S, Math.max(4, Math.round(opts.atmoSteps * 0.5)), false, 'pl_aerial') : null;

  const build = (near) => {
    const aUp = attribute('aUp', 'vec3'), aDet = attribute('aDet', 'vec3'), aDat = attribute('aDat', 'vec4');
    const h = aDat.x, m = aDat.y, s = aDat.z, q = aDat.w;
    const up = normalize(aUp);
    const pL = aUp.mul(U.R.add(h)); // posição local (vértice)
    const nG = normalize(normalLocal);
    const slope = clamp(float(1).sub(dot(nG, up)), 0, 1);
    const dist = length(positionView);
    const lat = abs(dot(up, S.axis));
    const det = aDet;
    const surf = surface(type, P, U, S, { h, m, s, q, slope, up, det, dist, lat });
    const vl = varying(perVertexLight(body, U, S, pL, up, hasAtmo, opts.clouds && hasAtmo));
    const ap = hasAtmo ? varying(aerial(U, S, scat, pL)) : null;
    const sunG = vl.xyz, cShadow = vl.w;
    // luz própria do corpo (difusa lambertiana) e luzes de cidade no lado noturno
    const NdL = dot(nG, S.sunL);
    const selfDirect = surf.albedo.mul(S.sunCol).mul(sunG).mul(max(NdL, 0).div(PI));
    const dayAmt = smoothstep(-0.25, 0.25, dot(up, S.sunL));
    let night = vec3(0);
    if (body.colony) {
      const land = smoothstep(2, 20, h).mul(smoothstep(900, 100, h));
      const clus = smoothstep(0.6, 0.78, N3(up.mul(U.R.div(2500))).r).mul(smoothstep(0.5, 0.95, N3(up.mul(U.R.div(260))).b));
      night = vec3(1.0, 0.6, 0.28).mul(clus.mul(land).mul(S.city).mul(float(1).sub(dayAmt)).mul(1.4));
    }
    const mat = near ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshBasicNodeMaterial();
    mat.fog = false;
    if (near) {
      mat.colorNode = surf.albedo;
      mat.roughnessNode = surf.rough;
      mat.metalnessNode = surf.metal;
      mat.normalNode = bumpView(surf.bump, surf.bumpScale);
      // compensação: parte da luz solar que a luz da cena não entrega (eclipse da câmera)
      mat.emissiveNode = surf.emissive.add(selfDirect.mul(S.comp)).add(night);
      let o = output.rgb.mul(float(1).sub(cShadow.mul(0.62)));
      if (ap) o = o.mul(ap.w).add(ap.xyz);
      const fogF = float(1).sub(exp(dist.mul(S.fogD).negate()));
      o = mix(o, S.fogCol, fogF);
      mat.outputNode = vec4(o, output.a);
    } else {
      const amb = surf.albedo.mul(S.amb).mul(dayAmt.mul(0.9).add(0.1));
      let o = selfDirect.mul(float(1).sub(cShadow.mul(0.62))).add(amb).add(surf.emissive).add(night);
      if (ap) o = o.mul(ap.w).add(ap.xyz);
      mat.colorNode = o;
    }
    return mat;
  };
  return { near: build(true), far: build(false) };
}

// ─── oceano ──────────────────────────────────────────────────────────────
export function makeWaterMaterial(body, P, U, S, opts) {
  const hasAtmo = !!body.atmosphere;
  const scat = hasAtmo ? makeScatter(U, S, Math.max(4, Math.round(opts.atmoSteps * 0.5)), false, 'pl_aerialw') : null;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: true });
  mat.fog = false;
  const aUp = attribute('aUp', 'vec3'), aDet = attribute('aDet', 'vec3'), aDepth = attribute('aDepth', 'float');
  const up = normalize(aUp);
  const pL = aUp.mul(U.R);
  const dist = length(positionView);
  const toxic = body.type === 'toxic';
  // ondas: soma de 3 escalas de ruído rolando, normal por diferenças finitas no plano tangente
  const ref = select(abs(up.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
  const t1 = normalize(cross(up, ref)), t2 = cross(up, t1);
  const T = S.time;
  // altura das ondas (m): ondulação longa + vagas + marolas (as finas somem com a distância)
  const storm = S.fogD.mul(300).clamp(0, 1).add(1);
  const swell = (p) => N3(p.mul(fq(70)).add(vec3(T.mul(0.012), 0, T.mul(0.008)))).r.sub(0.5).mul(1.9)
    .add(N3(p.mul(fq(23)).add(vec3(0, T.mul(0.021), T.mul(-0.017)))).g.sub(0.5).mul(0.65)).mul(storm);
  const wave = (p) => swell(p)
    .add(N3(p.mul(fq(7)).add(vec3(T.mul(-0.05), T.mul(0.04), 0))).r.sub(0.5).mul(0.2).mul(fade(dist, 7)))
    .add(N3(p.mul(fq(2.1)).add(vec3(T.mul(0.09), 0, T.mul(-0.07)))).g.sub(0.5).mul(0.06).mul(fade(dist, 2.1)));
  // deslocamento de vértice só perto (chunks finos)
  const camDv = length(S.cam.sub(pL));
  mat.positionNode = positionLocal.add(aUp.mul(swell(aDet).mul(smoothstep(1800.0, 400.0, camDv))));
  const e = float(0.5);
  const w0 = wave(aDet), wx = wave(aDet.add(t1.mul(e))), wy = wave(aDet.add(t2.mul(e)));
  const n = normalize(up.sub(t1.mul(wx.sub(w0).div(e))).sub(t2.mul(wy.sub(w0).div(e))));
  const V = normalize(S.cam.sub(pL));
  const NdV = max(dot(n, V), 0.0);
  const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(NdV), 5.0)));
  const Rv = reflect(V.negate(), n);
  const sky = mix(S.skyH, S.skyZ, pow(max(dot(Rv, up), 0.0), 0.45));
  const sunG = hasAtmo ? varying(sunTrans(U, pL, S.sunL)) : vec3(1);
  const RdL = max(dot(Rv, S.sunL), 0.0);
  const spec = pow(RdL, 900.0).mul(40).add(pow(RdL, 90.0).mul(1.2)).add(pow(RdL, 12.0).mul(0.05));
  const day = smoothstep(-0.1, 0.15, dot(up, S.sunL));
  const sunDiff = S.sunCol.mul(sunG).mul(max(dot(up, S.sunL), 0.0)).div(PI);
  // água: absorção pela profundidade (raso turquesa → fundo escuro)
  const depth = max(aDepth, 0.0);
  const absorb = smoothstep(0.0, 28.0, depth);
  const body0 = mix(C3(P.shallow), C3(P.deep), absorb);
  const lit = body0.mul(sunDiff.mul(0.9).add(S.amb.mul(day.mul(0.8).add(0.2))));
  // espuma: arrebentação na costa + cristas
  const foamN = N3(aDet.mul(fq(5)).add(vec3(T.mul(0.03), 0, 0))).b;
  const shore = smoothstep(1.6, 0.0, depth).mul(smoothstep(0.35, 0.75, foamN.add(sin(depth.mul(3.0).sub(T.mul(1.6))).mul(0.25))));
  const crest = smoothstep(0.55, 0.95, w0).mul(S.fogD.mul(400).add(0.2)).mul(fade(dist, 20));
  const foam = clamp(shore.add(crest), 0, 1);
  const foamCol = vec3(0.9, 0.93, 0.95).mul(sunDiff.add(S.amb));
  let col = mix(lit, sky.mul(0.9), fres).add(S.sunCol.mul(sunG).mul(spec).mul(day).mul(float(1).sub(foam)));
  col = mix(col, foamCol, foam.mul(0.85));
  if (toxic) col = col.add(C3(P.glow).mul(0.02).mul(float(1).sub(day)));
  let alpha = clamp(smoothstep(0.0, 6.0, depth).mul(0.85).add(fres.mul(0.5)).add(foam), 0, 1);
  alpha = max(alpha, smoothstep(0.5, 3.0, depth).mul(0.6));
  let o = col;
  if (hasAtmo) { const ap = varying(aerial(U, S, scat, pL)); o = o.mul(ap.w).add(ap.xyz); }
  const fogF = float(1).sub(exp(dist.mul(S.fogD).negate()));
  o = mix(o, S.fogCol, fogF);
  mat.colorNode = o;
  mat.opacityNode = max(alpha, fogF);
  return mat;
}

// ─── céu (casca de atmosfera, faces internas) ────────────────────────────
export function makeSkyMaterial(body, U, S, opts) {
  const scat = makeScatter(U, S, opts.atmoSteps, true, 'pl_sky');
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide });
  mat.fog = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.SrcAlphaFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  const rd = normalize(positionLocal.sub(S.cam));
  const r = scat(S.cam, rd, float(1e12));
  // brilho do disco/halo do sol visto através do ar (Mie forte) já sai do integrador;
  // relâmpago ilumina as nuvens/céu por um instante
  mat.colorNode = r.xyz.add(S.skyZ.mul(S.flash).mul(0.6));
  mat.opacityNode = clamp(r.w, 0, 1);
  return mat;
}
