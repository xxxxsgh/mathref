// Materiais TSL do sistema `life`.
//
// Criaturas: pele PBR com padrões procedurais presos ao corpo (listras ao
// longo do arco do tronco, manchas/rosetas por células 3D na pose de
// repouso, faixas), ventre claro, micro-variação, queratina brilhante
// (chifres, garras, cascos, placas), olhos úmidos, órgãos bioluminescentes
// que acendem à noite, membranas translúcidas (contra-luz) e um termo de
// dispersão subsuperficial barato (borda + transmissão para o sol).
//
// Flora: cor/emissivo por vértice, vento no vértice (rajadas + oscilação por
// instância, flexibilidade por vértice), translucidez das folhas contra o sol
// e brilho noturno dos órgãos luminosos.
import * as THREE from 'three/webgpu';
import {
  attribute, uniform, vec3, float, mix, smoothstep, clamp, sin, pow, max, abs, dot, normalize, select, positionGeometry, positionView,
  normalView, time, instanceIndex, hash, positionLocal, length, fract,
} from 'three/tsl';
import { fbm3, cells3, vnoise } from './tsl.js';

/** Uniforms compartilhados de ambiente (atualizados pelo sistema a cada frame). */
export const ENV = {
  night: uniform(0),                              // 0 dia … 1 noite
  sunView: uniform(new THREE.Vector3(0, 1, 0)),   // direção do sol no espaço de vista
  sunCol: uniform(new THREE.Color(1, 0.95, 0.85)),// cor × intensidade (relativa)
  windDir: uniform(new THREE.Vector3(1, 0, 0)),   // no espaço do remendo
  wind: uniform(0.6),                             // força 0..2
  gust: uniform(0),                               // rajada atual
};

const C = (hex) => new THREE.Color(hex);

export function creatureMaterial(g) {
  const m = new THREE.MeshStandardNodeMaterial();
  const M = attribute('aMask', 'vec4');
  const P = positionGeometry;
  const sk = g.skin;
  const U = { hit: uniform(0) };
  const scale = Math.max(0.3, g.plan === 'worm' ? g.girth * 2 : g.girth * 2.2);
  const base = vec3(C(sk.base)), belly = vec3(C(sk.belly)), patc = vec3(C(sk.pat)), acc = vec3(C(sk.accent)), glow = vec3(C(sk.glow)), eye = vec3(C(sk.eye));
  const Pn = P.div(scale);
  // micro-variação e manchas grandes de tom
  const n1 = fbm3(Pn.mul(2.2));
  const n2 = vnoise(Pn.mul(9.0));
  // padrão
  const arcM = M.y.mul(g.plan === 'worm' ? g.L / scale : (g.L * 2.2) / scale).mul(sk.patScale);
  const dorsal = smoothstep(-0.45, 0.25, M.z);
  let pat;
  if (sk.pattern === 'stripes') {
    const w = sin(arcM.mul(5.5).add(n1.mul(3.5)).add(M.z.mul(1.2)));
    pat = smoothstep(0.35, 0.6, w).mul(dorsal);
  } else if (sk.pattern === 'spots') {
    const c = cells3(Pn.mul(3.2 * sk.patScale));
    pat = float(1).sub(smoothstep(0.22, 0.3, c.add(n2.mul(0.06)))).mul(dorsal);
  } else if (sk.pattern === 'rosettes') {
    const c = cells3(Pn.mul(2.6 * sk.patScale));
    pat = smoothstep(0.17, 0.22, c).mul(float(1).sub(smoothstep(0.27, 0.32, c))).mul(dorsal);
  } else if (sk.pattern === 'bands') {
    const w = sin(arcM.mul(3.0).add(n1.mul(1.5)));
    pat = smoothstep(0.55, 0.75, w).mul(smoothstep(-0.8, 0.0, M.z));
  } else pat = float(0);
  // linha dorsal mais escura (contra-sombreamento natural)
  const back = smoothstep(0.55, 0.95, M.z).mul(0.35);
  let skin = mix(base, belly, clamp(M.x.mul(1.2), 0, 1));
  skin = mix(skin, patc, clamp(pat.mul(0.88).add(back), 0, 1));
  skin = skin.mul(float(0.82).add(n1.mul(0.3)).add(n2.mul(0.08)));
  if (sk.fur) skin = skin.mul(float(0.92).add(vnoise(Pn.mul(40)).mul(0.16)));
  const r = M.w;
  const isEye = abs(r.sub(1)).lessThan(0.5);
  const isKer = abs(r.sub(2)).lessThan(0.5);
  const isGlow = abs(r.sub(3)).lessThan(0.5);
  const isMem = abs(r.sub(4)).lessThan(0.5);
  const isMouth = abs(r.sub(5)).lessThan(0.5);
  const ker = mix(acc.mul(0.55), acc, smoothstep(0.2, 0.8, n2)).mul(mix(float(0.55), float(1.0), M.y.mul(0.0).add(n1)));
  const mem = mix(base.mul(1.1), patc, pat.mul(0.6).add(0.15)).mul(float(0.9).add(n1.mul(0.25)));
  const mouth = vec3(0.32, 0.06, 0.08);
  let col = select(isEye, vec3(0.02, 0.02, 0.025), skin);
  col = select(isKer, ker, col);
  col = select(isGlow, glow.mul(0.5), col);
  col = select(isMem, mem, col);
  col = select(isMouth, mouth, col);
  m.colorNode = col;
  const rough = select(isEye, float(0.06), select(isKer, float(0.32), select(isMem, float(0.55), float(sk.rough).add(n2.mul(0.15)))));
  m.roughnessNode = rough;
  m.metalnessNode = float(0);
  // emissivo: órgãos luminosos (acendem à noite), brilho dos olhos, contra-luz
  const nightK = ENV.night.mul(1.6).add(0.25);
  const pulse = sin(time.mul(1.7).add(P.z.mul(1.3)).add(P.x)).mul(0.25).add(0.85);
  const gAmt = float(sk.glow);
  const vdir = normalize(positionView);
  const back2 = pow(clamp(dot(vdir, ENV.sunView), 0, 1), 3.0);
  const fres = pow(float(1).sub(abs(dot(normalView, vdir.negate()))), 3.0);
  const sss = skin.mul(vec3(1.0, 0.55, 0.42)).mul(fres.mul(0.18).add(back2.mul(fres).mul(0.6))).mul(ENV.sunCol);
  const memT = mem.mul(back2.mul(1.4).add(0.05)).mul(ENV.sunCol);
  let em = select(isGlow, glow.mul(gAmt.mul(nightK).mul(pulse).mul(4.0)), sss);
  em = select(isEye, eye.mul(float(0.15).add(ENV.night.mul(0.9))), em);
  em = select(isMem, memT, em);
  if (sk.fur) em = em.add(belly.mul(fres.mul(0.12)).mul(ENV.sunCol));
  // clarão de dano
  em = em.add(vec3(1.0, 0.25, 0.15).mul(U.hit.mul(2.5)));
  m.emissiveNode = em;
  m.userData.U = U;
  return m;
}

/** Material de flora (cor/emissivo/vento por vértice, instanciado). */
export function floraMaterial({ ground = false, glowBoost = 1 } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const col = attribute('color', 'vec3');
  const ex = attribute('aEx', 'vec4'); // x emissivo, y rugosidade, z flexibilidade, w translucidez
  const seed = hash(instanceIndex);
  const P = positionLocal;
  // vento: oscilação lenta + rajada + tremor das folhas, ponderado pela flexibilidade
  const ph = seed.mul(6.283);
  const sway = sin(time.mul(1.15).add(ph).add(P.x.mul(0.05)).add(P.z.mul(0.04))).mul(0.65)
    .add(sin(time.mul(2.6).add(ph.mul(1.7))).mul(0.25))
    .add(ENV.gust.mul(0.9));
  const flex = ex.z.mul(ENV.wind);
  const flutter = sin(time.mul(9.0).add(positionGeometry.x.mul(7.0)).add(positionGeometry.z.mul(5.0)).add(ph)).mul(ex.w).mul(0.04).mul(ENV.wind);
  const off = ENV.windDir.mul(sway.mul(flex).mul(ground ? 0.35 : 0.22)).add(vec3(0, flutter, 0));
  m.positionNode = P.add(off);
  // variação de tom por instância e ruído ao longo da planta
  const nv = vnoise(positionGeometry.mul(2.3).add(seed.mul(31.0)));
  const tint = mix(float(0.82), float(1.14), seed);
  let base = col.mul(tint).mul(float(0.86).add(nv.mul(0.28)));
  if (ground) base = base.mul(mix(float(0.55), float(1.25), clamp(positionGeometry.y.mul(2.2), 0, 1)));
  m.colorNode = base;
  m.roughnessNode = ex.y;
  m.metalnessNode = float(0);
  // translucidez (folhas contra o sol) + bioluminescência
  const vdir = normalize(positionView);
  const back = pow(clamp(dot(vdir, ENV.sunView), 0, 1), 4.0);
  const trans = base.mul(vec3(1.05, 1.15, 0.7)).mul(ex.w.mul(back).mul(0.9)).mul(ENV.sunCol);
  const glowK = ENV.night.mul(1.5).add(0.22).mul(glowBoost);
  const pulse = sin(time.mul(0.9).add(ph)).mul(0.18).add(0.9);
  m.emissiveNode = col.mul(ex.x.mul(glowK).mul(pulse).mul(3.2)).add(trans);
  void max; void length; void fract;
  return m;
}
