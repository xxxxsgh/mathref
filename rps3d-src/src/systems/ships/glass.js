// Vidro do canopy visto de DENTRO, com o tempo lá fora escrito nele:
//   chuva   — gotas paradas (perladas) + gotas que escorrem com o vento/gravidade
//   poeira  — véu fosco acumulado nas bordas baixas
//   gelo    — geada cristalina crescendo das bordas
//   fogo    — plasma da reentrada lambendo a frente do vidro
// Sempre: manchas/arranhões que acendem quando o sol está no quadro
// (veiling glare) e reflexo físico do ambiente (material físico transparente).
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, positionLocal, mix, smoothstep, step, abs, max, min, floor, fract, pow, exp, sin, clamp,
  time, length, dot, normalize, positionView, atan,
} from 'three/tsl';
import { hash13, hash33, vnoise, fbm } from './tsl.js';

/** Uma camada de gotas paradas: retorna vec3(máscara, nx, ny). */
const dropLayer = Fn(([q, dens, sd]) => {
  const c = floor(q);
  const f = fract(q).sub(0.5);
  const h = hash33(vec3(c, sd));
  const ctr = h.xy.sub(0.5).mul(0.55);
  const r = mix(float(0.1), float(0.32), h.z.mul(h.z)).mul(step(h.z.mul(0.7).add(h.x.mul(0.3)), dens));
  const dv = f.sub(ctr);
  const d = length(dv.mul(vec2(1.0, 0.85)));
  const m = float(1).sub(smoothstep(r.mul(0.72), r, d)).mul(step(0.001, r));
  const n = dv.div(max(r, 0.001));
  return vec3(m, n);
}).setLayout({ name: 'sh_dropLayer', type: 'vec3', inputs: [{ name: 'q', type: 'vec2' }, { name: 'dens', type: 'float' }, { name: 'sd', type: 'float' }] });

/** Gotas escorrendo (colunas com velocidade própria) + rastro molhado. */
const runLayer = Fn(([q, spd, dens, tm]) => {
  const col = floor(q.x);
  const hc = hash13(vec3(col, 3.7, 1.1));
  const live = step(hc, dens);
  const y = q.y.add(tm.mul(spd).mul(hc.mul(0.8).add(0.4))).add(hc.mul(17.0));
  const cell = floor(y.div(3.0));
  const hy = hash13(vec3(col, cell, 9.3));
  const fy = fract(y.div(3.0)).mul(3.0).sub(1.5);
  const fx = fract(q.x).sub(0.5).add(sin(y.mul(1.7).add(hc.mul(9.0))).mul(0.12));
  const r = hy.mul(0.12).add(0.14);
  const d = length(vec2(fx, fy.mul(0.75)));
  const head = float(1).sub(smoothstep(r.mul(0.7), r, d));
  const trail = float(1).sub(smoothstep(0.015, 0.05, abs(fx))).mul(step(0.0, fy)).mul(exp(fy.mul(-0.9))).mul(0.55);
  return vec3(max(head, trail).mul(live).mul(step(0.25, hy)), fx.div(r), fy.div(r.mul(1.3)));
}).setLayout({ name: 'sh_runLayer', type: 'vec3', inputs: [{ name: 'q', type: 'vec2' }, { name: 'spd', type: 'float' }, { name: 'dens', type: 'float' }, { name: 'tm', type: 'float' }] });

/**
 * Material do vidro interno. base = {y (base do canopy), cx, cz} no espaço
 * da cabine (para mapear o vidro em coordenadas de superfície).
 */
export function makeCockpitGlass(base = { y: -0.3 }) {
  const U = {
    rain: uniform(0), dust: uniform(0), ice: uniform(0), fire: uniform(0),
    wind: uniform(0),            // 0 parado (gotas descem) … 1 em voo (escorrem para trás)
    sunDirV: uniform(new THREE.Vector3(0, 0, -1)), sunColor: uniform(new THREE.Color(1, 0.95, 0.88)), sunVis: uniform(1),
    smudge: uniform(1), light: uniform(1),
  };
  const m = new THREE.MeshPhysicalNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  m.userData.U = U;
  const P = positionLocal;
  // coordenadas de superfície: arco em torno do eixo longitudinal (s) e comprimento (z), em metros
  const ang = atan(P.x, P.y.sub(base.y).max(0.02));
  const s = ang.mul(0.55);
  const z = P.z;
  const uvS = vec2(s, z);
  // altura acima do peitoril → bordas baixas acumulam poeira/gelo
  const low = float(1).sub(smoothstep(0.0, 0.32, P.y.sub(base.y)));
  const front = smoothstep(-0.3, -1.3, z);

  // ── chuva ──
  const rainA = U.rain;
  const d1 = dropLayer(uvS.mul(26.0), rainA.mul(0.75), float(1.0));
  const d2 = dropLayer(uvS.mul(52.0).add(vec2(0.37, 0.71)), rainA.mul(0.9), float(2.0));
  const d3 = dropLayer(uvS.mul(110.0).add(vec2(0.13, 0.29)), rainA.mul(0.95), float(3.0));
  // escorrimento: com vento as gotas correm para trás (+z); paradas, descem pelas laterais (|s| cresce)
  const flowQ = mix(vec2(abs(s).mul(-1.0), z.mul(0.25)).yx, vec2(s, z.negate()), U.wind);
  const run = runLayer(flowQ.mul(vec2(18.0, 6.0)).mul(vec2(1.0, 1.0)), mix(float(0.35), float(3.5), U.wind), rainA.mul(0.55), time);
  const dm = max(max(d1.x, d2.x), max(d3.x, run.x));
  const dn = select3(d1, d2, d3, run);
  // ── geada ──
  const fr1 = fbm(P.mul(16.0));
  const feather = float(1).sub(abs(vnoise(P.mul(70.0)).mul(2.0).sub(1.0)));
  const frost = smoothstep(0.45, 0.75, low.mul(0.75).add(fr1.mul(0.55)).add(U.ice.mul(0.65)).sub(0.55).add(feather.mul(0.18))).mul(U.ice);
  // ── poeira ──
  const dustN = fbm(P.mul(9.0).add(3.0));
  const dust = U.dust.mul(low.mul(0.55).add(0.18)).mul(dustN.mul(0.8).add(0.4));
  // ── manchas / arranhões (sempre) ──
  const smear = smoothstep(0.55, 0.85, fbm(P.mul(vec3(7.0, 7.0, 3.0)))).mul(0.6);
  const scratch = smoothstep(0.985, 1.0, sin(P.x.mul(140.0).add(P.y.mul(410.0)).add(vnoise(P.mul(6.0)).mul(9.0))).mul(0.5).add(0.5)).mul(0.5);
  const dirt = smear.add(scratch).mul(U.smudge);
  // brilho do sol nas manchas (só quando se olha perto do sol)
  const vdir = normalize(positionView);
  const glare = pow(max(dot(vdir, U.sunDirV), 0.0), 40.0).mul(U.sunVis);
  // ── fogo de reentrada ──
  const fl = fbm(vec3(s.mul(5.0), z.mul(3.0).add(time.mul(5.0)), time.mul(0.7)));
  const fire = U.fire.mul(smoothstep(0.38, 0.8, fl.add(front.mul(0.35)).add(low.mul(0.15)))).mul(front.mul(0.7).add(0.3));

  // cor do vidro
  const dropCol = mix(vec3(0.03, 0.035, 0.04), vec3(0.42, 0.46, 0.5), smoothstep(-1.0, 0.8, dn.y.negate())).mul(smoothstep(1.05, 0.6, length(dn)).mul(0.8).add(0.2));
  let col = vec3(0.01, 0.012, 0.014);
  col = mix(col, dropCol, dm);
  col = mix(col, vec3(0.42, 0.34, 0.25), clamp(dust.mul(1.4), 0, 1));
  col = mix(col, vec3(0.72, 0.82, 0.9), frost);
  m.colorNode = col;
  m.opacityNode = clamp(float(0.03).add(dm.mul(0.55)).add(dust.mul(0.6)).add(frost.mul(0.82)).add(dirt.mul(0.04)), 0, 0.95);
  m.metalnessNode = float(0);
  m.roughnessNode = clamp(float(0.03).add(frost.mul(0.6)).add(dust.mul(0.5)).add(dirt.mul(0.08)), 0.02, 1);
  m.ior = 1.5;
  m.specularIntensityNode = float(1);
  // realce especular da gota + brilho nas manchas + plasma
  const hl = float(1).sub(smoothstep(0.08, 0.32, length(dn.sub(vec2(-0.3, 0.38))))).mul(dm);
  m.emissiveNode = vec3(U.sunColor).mul(dirt.mul(glare).mul(0.35).add(hl.mul(0.12).mul(U.light)))
    .add(vec3(3.2, 1.1, 0.25).mul(fire.mul(5.0)))
    .add(vec3(0.6, 0.7, 0.8).mul(frost.mul(0.02).mul(U.light)));
  return m;
}

// escolhe a normal da gota mais visível entre as camadas (sem ramos)
function select3(a, b, c, r) {
  const ab = mix(a.yz, b.yz, step(a.x, b.x));
  const mab = max(a.x, b.x);
  const abc = mix(ab, c.yz, step(mab, c.x));
  const mabc = max(mab, c.x);
  return mix(abc, r.yz, step(mabc, r.x));
}
