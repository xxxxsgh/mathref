// Planeta de vitrine do sistema rendering — SÓ para os presets de screenshot
// quando o sistema `planets` não está presente. É um impostor de órbita
// (esfera + nuvens + casca de atmosfera), não o planeta jogável: serve para
// compor as cenas de teste do pipeline (terminador, brilho atmosférico,
// reflexo especular do oceano, bloom na borda iluminada).
//
// Atmosfera: integração analítica barata de Rayleigh/Mie ao longo da corda
// que atravessa a casca (densidade exponencial aproximada pela espessura
// ótica da corda), com avermelhamento perto do terminador e anel de Mie
// voltado para o sol. Tudo em espaço de objeto — escala de km sem problema de
// precisão porque a câmera está na origem e o planeta é um único objeto.
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, normalize, positionLocal, positionWorld, cameraPosition, dot, max, min, pow, mix, smoothstep, exp, abs,
  clamp, length, sqrt, uniform, select, normalWorld, modelWorldMatrixInverse,
} from 'three/tsl';
import { fbm5, fbm3, vnoise3 } from '../tslib.js';

const PALETTES = {
  lush: { deep: [0.004, 0.02, 0.05], shallow: [0.01, 0.07, 0.11], low: [0.05, 0.12, 0.05], mid: [0.08, 0.16, 0.09], high: [0.22, 0.18, 0.15], alien: [0.16, 0.07, 0.17], sea: 0.5, ray: [0.18, 0.42, 1.0], mie: [1.0, 0.85, 0.7], clouds: 0.42 },
  desert: { deep: [0.12, 0.06, 0.035], shallow: [0.2, 0.11, 0.06], low: [0.3, 0.17, 0.08], mid: [0.4, 0.26, 0.13], high: [0.2, 0.11, 0.07], alien: [0.34, 0.13, 0.06], sea: -1, ray: [0.75, 0.48, 0.3], mie: [1.0, 0.75, 0.5], clouds: 0.2 },
  ocean: { deep: [0.003, 0.016, 0.045], shallow: [0.01, 0.08, 0.12], low: [0.09, 0.13, 0.06], mid: [0.13, 0.15, 0.08], high: [0.28, 0.25, 0.22], alien: [0.06, 0.14, 0.1], sea: 0.62, ray: [0.16, 0.4, 1.0], mie: [1.0, 0.86, 0.72], clouds: 0.5 },
  ice: { deep: [0.05, 0.12, 0.2], shallow: [0.2, 0.32, 0.42], low: [0.55, 0.63, 0.7], mid: [0.75, 0.8, 0.86], high: [0.92, 0.94, 0.97], alien: [0.4, 0.55, 0.7], sea: 0.4, ray: [0.35, 0.55, 1.0], mie: [0.9, 0.9, 1.0], clouds: 0.6 },
};

/**
 * @param {object} o {radius (m), type: lush|desert|ice, sun: uniforms do sol, seed}
 * @returns THREE.Group (posicione com world.add no centro do planeta)
 */
export function makeShowcasePlanet({ radius = 38000, type = 'lush', sun, seed = 3, clouds, cities = false } = {}) {
  const P = PALETTES[type] || PALETTES.lush;
  const g = new THREE.Group();
  g.name = 'rps.showcase.planet';
  const sd = vec3(seed * 1.7, seed * 3.1, seed * 0.7);
  const atmoH = 0.035; // espessura da atmosfera (fração do raio)

  // ── superfície ──
  const surf = new THREE.MeshStandardNodeMaterial();
  const n = normalize(positionLocal);
  const warp = fbm3(n.mul(2.2).add(sd));
  const h = fbm5(n.mul(3.1).add(warp.mul(1.4)).add(sd));
  const ridge = float(1).sub(abs(vnoise3(n.mul(9).add(sd)).mul(2).sub(1)));
  const detail = fbm3(n.mul(38).add(sd)).mul(0.6).add(fbm3(n.mul(140).add(sd)).mul(0.4));
  const ridgeFine = float(1).sub(abs(vnoise3(n.mul(60).add(warp.mul(3))).mul(2).sub(1)));
  const canyon = smoothstep(0.7, 0.95, ridgeFine).mul(smoothstep(0.45, 0.7, vnoise3(n.mul(11).add(sd)))).mul(0.6);
  const lat = abs(n.y);
  // altura normalizada (fbm5 concentra em ~0,3–0,7)
  const hN = smoothstep(0.3, 0.7, h);
  const sea = float(P.sea);
  const land = smoothstep(sea, sea.add(0.015), hN);
  const elev = clamp(hN.sub(sea.max(0)).div(float(1).sub(sea.max(0))), 0, 1);
  const water = mix(vec3(...P.deep), vec3(...P.shallow), smoothstep(sea.sub(0.1), sea, hN));
  const biome = vnoise3(n.mul(5).add(sd.mul(2)));
  const g0 = mix(mix(vec3(...P.low), vec3(...P.alien), smoothstep(0.5, 0.72, biome)), vec3(...P.mid), smoothstep(0.15, 0.5, elev));
  // estratos (mesetas) e cânions escuros
  const strata = vnoise3(vec3(elev.mul(26), n.x.mul(3), n.z.mul(3))).mul(0.35).add(0.82);
  const g1 = mix(g0, vec3(...P.high), smoothstep(0.45, 0.85, elev.add(ridge.mul(0.15)))).mul(strata);
  const ground = g1.mul(detail.mul(0.7).add(0.6)).mul(float(1).sub(canyon.mul(0.6)));
  // calotas polares
  const ice = smoothstep(0.8, 0.92, lat.add(detail.mul(0.12)).add(elev.mul(0.08)));
  const base = mix(water, ground, type === 'desert' ? float(1) : land);
  surf.colorNode = mix(base, vec3(0.85, 0.88, 0.92), type === 'desert' ? float(0) : ice);
  surf.roughnessNode = type === 'desert' ? float(0.95) : mix(float(0.2), float(0.92), max(land, ice.mul(0.6)));
  surf.metalnessNode = float(0);
  if (cities) {
    // colônia: luzes de cidades no lado noturno, aglomeradas perto da costa
    const coast = smoothstep(0.08, 0.0, abs(hN.sub(sea).sub(0.03)));
    const cl = smoothstep(0.62, 0.82, vnoise3(n.mul(16).add(sd))).mul(coast.mul(0.85).add(0.15));
    const dots = pow(smoothstep(0.55, 0.95, vnoise3(n.mul(520))), 2).mul(0.8).add(smoothstep(0.7, 0.95, vnoise3(n.mul(150))).mul(0.3));
    const night = smoothstep(0.06, -0.12, dot(normalWorld, sun.dir));
    surf.emissiveNode = vec3(1.0, 0.62, 0.28).mul(cl.mul(dots).mul(max(land, coast)).mul(night).mul(3));
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 256, 128), surf));

  // ── nuvens ──
  const cov = clouds ?? P.clouds;
  if (cov > 0) {
    const cm = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
    const cn = normalize(positionLocal);
    const cw = fbm3(cn.mul(3).add(sd.mul(1.3)));
    // faixas zonais + redemoinhos
    const band = vnoise3(vec3(cn.x.mul(2), cn.y.mul(11), cn.z.mul(2)).add(cw.mul(2.5)));
    const c = fbm5(cn.mul(5.5).add(cw.mul(2)).add(vec3(band.mul(0.8))));
    const dens = smoothstep(float(1 - cov).mul(0.7).add(0.22), float(1 - cov).mul(0.7).add(0.48), c.mul(0.8).add(band.mul(0.2)));
    cm.colorNode = vec3(0.92, 0.93, 0.95);
    cm.opacityNode = dens.mul(0.95);
    cm.roughnessNode = float(1);
    const cl = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.006, 192, 96), cm);
    cl.rotation.set(0.3, seed, 0.1);
    g.add(cl);
  }

  // ── atmosfera (casca externa, aditiva) ──
  const am = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  am.fog = false;
  const Ra = 1 + atmoH;
  am.colorNode = Fn(() => {
    // espaço de objeto normalizado pelo raio do planeta
    const ro = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz.div(radius).toVar();
    const rd = normalize(positionLocal.div(radius).sub(ro)).toVar();
    const L = normalize(modelWorldMatrixInverse.mul(vec4(sun.dir, 0)).xyz);
    const b = dot(ro, rd);
    const c = dot(ro, ro).sub(Ra * Ra);
    const disc = b.mul(b).sub(c).max(0);
    const sq = sqrt(disc);
    const tN = b.negate().sub(sq).max(0);
    // termina no chão se o raio acerta o planeta
    const cg = dot(ro, ro).sub(1);
    const dg = b.mul(b).sub(cg);
    const hitG = dg.greaterThan(0).and(b.negate().sub(sqrt(dg.max(0))).greaterThan(0));
    const tF = mix(b.negate().add(sq), b.negate().sub(sqrt(dg.max(0))), select(hitG, float(1), float(0)));
    const len = tF.sub(tN).max(0);
    // ponto médio da corda: altura mínima ≈ densidade dominante
    const mid = ro.add(rd.mul(tN.add(len.mul(0.5))));
    const hMin = length(mid).sub(1).div(atmoH).clamp(0, 1);
    const dens = exp(hMin.mul(-4.2));
    const depth = len.div(atmoH).mul(dens).toVar();
    // iluminação: ângulo solar no ponto médio (com penumbra do terminador)
    const mu = dot(normalize(mid), L);
    const lit = smoothstep(-0.22, 0.25, mu);
    const sunset = smoothstep(-0.2, 0.05, mu).mul(smoothstep(0.38, 0.02, mu));
    const ray = vec3(...P.ray);
    const extinction = exp(vec3(1.0, 0.55, 0.25).mul(depth).mul(-0.55).mul(float(1).sub(lit.mul(0.5))));
    const rayC = mix(ray.mul(0.6), vec3(1.0, 0.42, 0.16), sunset.mul(0.85)).mul(extinction.mul(0.5).add(0.5));
    const cosT = dot(rd, L);
    const mie = pow(max(cosT, 0), 18).mul(2.2).add(pow(max(cosT, 0), 3).mul(0.25));
    const phaseR = cosT.mul(cosT).mul(0.35).add(0.75);
    const col = rayC.mul(phaseR).add(vec3(...P.mie).mul(mie).mul(mix(float(1), vec3(1.0, 0.55, 0.3), sunset)));
    const I = float(1).sub(exp(depth.mul(-1.1))).mul(select(hitG, float(0.45), float(1)));
    return vec4(col.mul(I).mul(lit).mul(sun.intensity.mul(sun.visibility).mul(0.55)), 1);
  })();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * Ra, 160, 80), am));

  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}
