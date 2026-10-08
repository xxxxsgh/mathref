// Gigantes gasosos: faixas zonais com rotação diferencial (cada latitude
// gira numa velocidade), turbulência nas bordas das faixas, tempestade oval
// gigante e ovais brancas, escurecimento de limbo, terminador suave e a
// sombra dos anéis projetada no disco. Anéis: centenas de faixas finas com
// divisões, cor variando com o raio, sombra do planeta, retroiluminação
// (brilham contra o sol) e transparência física.
import * as THREE from 'three/webgpu';
import {
  vec3, vec4, float, normalize, dot, max, min, mix, smoothstep, clamp, abs, pow, exp, length, positionLocal, sin, cos,
  cross, sqrt, select, uniform, fract,
} from 'three/tsl';
import { N3 } from './materials.js';
import { PI } from './scatter.js';

const C3 = (c) => vec3(c.r, c.g, c.b);

/** Densidade dos anéis num raio r (m) — nó TSL. */
function ringDensity(r, RI, RO, seedOff) {
  const x = r.sub(RI).div(RO.sub(RI));
  const n1 = N3(vec3(x.mul(3.0), seedOff, 0.31)).r;
  const n2 = N3(vec3(x.mul(11.0), seedOff.add(0.4), 0.71)).g;
  const n3 = N3(vec3(x.mul(37.0), seedOff.add(0.2), 0.13)).r;
  const n4 = N3(vec3(x.mul(97.0), seedOff.add(0.6), 0.53)).g;
  const fine = n2.mul(0.6).add(n3.mul(0.3)).add(n4.mul(0.1));
  // perfil: anel C tênue, B denso, divisão principal, A médio com lacuna fina
  const C = smoothstep(0.0, 0.05, x).mul(0.22);
  const B = smoothstep(0.2, 0.27, x).mul(smoothstep(0.605, 0.595, x)).mul(mix(float(0.75), float(1.0), smoothstep(0.3, 0.5, x)));
  const A = smoothstep(0.64, 0.655, x).mul(smoothstep(0.97, 0.94, x)).mul(0.62);
  const gapA = smoothstep(0.002, 0.007, abs(x.sub(0.875)));
  const prof = max(C.mul(smoothstep(0.24, 0.2, x)), max(B, A.mul(gapA))).add(smoothstep(0.6, 0.64, x).mul(smoothstep(0.645, 0.64, x)).mul(0.04));
  const mod = clamp(float(0.7).add(fine.sub(0.5).mul(0.8)).add(n1.sub(0.5).mul(0.6)), 0.1, 1.2);
  return clamp(prof.mul(mod), 0.0, 1.0);
}

export function makeGasGiant(body, P, U, S) {
  const R = body.radius;
  const RI = uniform(R * 1.35), RO = uniform(R * 2.35);
  const seedOff = float((body.seed % 997) / 997);

  // ── planeta ──
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.fog = false;
  const d = normalize(positionLocal);
  const ax = S.axis;
  const lat = dot(d, ax);
  // rotação diferencial em torno do eixo (Rodrigues)
  const ang = S.time.mul(float(0.0009).add(sin(lat.mul(9.0)).mul(0.0005)));
  const ca = cos(ang), sa = sin(ang);
  const dr = d.mul(ca).add(cross(ax, d).mul(sa)).add(ax.mul(lat).mul(float(1).sub(ca)));
  const w1 = N3(dr.mul(2.2).add(seedOff)).r.sub(0.5);
  const w2 = N3(dr.mul(7.5).add(vec3(lat.mul(3.0), 0, 0))).g.sub(0.5);
  const w3 = N3(dr.mul(24.0)).r.sub(0.5);
  // estrias zonais finas (ruído esticado ao longo das faixas) e cisalhamento nas bordas
  const streak = N3(vec3(dr.x.mul(3.0), lat.mul(38.0), dr.z.mul(3.0)).add(w1.mul(0.4))).r.sub(0.5);
  const streak2 = N3(vec3(dr.x.mul(9.0), lat.mul(90.0), dr.z.mul(9.0)).add(w2.mul(0.6))).g.sub(0.5);
  // faixas: perfil zonal (1D ao longo da latitude) com larguras irregulares,
  // deformado pela turbulência — mais forte nas bordas (cisalhamento)
  const latW = lat.add(w1.mul(0.035)).add(w2.mul(0.018)).add(streak.mul(0.012)).add(w3.mul(0.004));
  const z1 = N3(vec3(latW.mul(1.9), seedOff, 0.31)).r;
  const z2 = N3(vec3(latW.mul(6.3), seedOff.add(0.37), 0.77)).g;
  const z3 = N3(vec3(latW.mul(17.0), seedOff.add(0.61), 0.13)).r;
  const zone = z1.mul(0.62).add(z2.mul(0.28)).add(z3.mul(0.1));
  const belt = smoothstep(0.42, 0.62, zone);           // 1 = zona clara, 0 = cinturão escuro
  const shear = float(1).sub(abs(belt.mul(2.0).sub(1.0)));  // bordas entre faixas
  let col = mix(C3(P.shallow), C3(P.deep), smoothstep(0.25, 0.5, zone));
  col = mix(col, C3(P.lowA), belt);
  col = mix(col, C3(P.rock), smoothstep(0.62, 0.85, z3).mul(float(1).sub(belt)).mul(0.6));
  col = mix(col, C3(P.sand), smoothstep(0.55, 0.8, z2).mul(belt).mul(0.5));
  // festões cinza-azulados na região equatorial
  const fest = smoothstep(0.12, 0.0, abs(lat.sub(0.06))).mul(smoothstep(0.55, 0.75, N3(dr.mul(6.0).add(0.2)).b));
  col = mix(col, C3(P.seabed), fest.mul(0.55));
  // turbulência visível nas bordas: redemoinhos claros/escuros
  col = col.mul(float(1).add(shear.mul(w2.mul(1.4).add(streak2.mul(0.9)))));
  // regiões polares mais escuras e azuladas
  col = mix(col, C3(P.high).mul(0.7), smoothstep(0.72, 0.95, abs(lat)).mul(0.55));
  // tempestade oval gigante (hemisfério sul)
  const ref = normalize(cross(ax, vec3(0.31, 0.0, 0.95)));
  const lon = dot(dr, ref);
  const sx = lon.mul(1.0), sy = lat.add(0.34).mul(2.6);
  const sd = sqrt(sx.mul(sx).add(sy.mul(sy))).add(w2.mul(0.06));
  const storm = smoothstep(0.17, 0.07, sd);
  const swirl = sin(sd.mul(80.0).add(w1.mul(6.0))).mul(0.5).add(0.5);
  col = mix(col, mix(C3(P.rock), C3(P.sand), swirl.mul(0.5)), storm);
  // ovais brancas menores
  const ov = smoothstep(0.82, 0.9, N3(dr.mul(5.3).add(1.3)).b).mul(smoothstep(0.25, 0.5, abs(lat)));
  col = mix(col, C3(P.snow), ov.mul(0.7));
  col = col.mul(w3.mul(0.2).add(1.0));
  // sombra dos anéis no disco
  let ringSh = float(0);
  if (body.rings) {
    const p = d.mul(R);
    const den = dot(S.sunL, ax);
    const t = p.dot(ax).negate().div(select(abs(den).lessThan(1e-4), float(1e-4), den));
    const q = p.add(S.sunL.mul(t));
    ringSh = ringDensity(length(q), RI, RO, seedOff).mul(select(t.greaterThan(0.0), float(0.85), float(0)));
  }
  const NdL = dot(d, S.sunL);
  const V = normalize(S.cam.sub(d.mul(R)));
  const NdV = max(dot(d, V), 0.0);
  const diff = smoothstep(-0.12, 0.35, NdL).mul(max(NdL.add(0.12), 0.0).div(1.12));
  const limb = pow(NdV, 0.32);
  const lit = col.mul(S.sunCol).mul(diff.div(PI)).mul(float(1).sub(ringSh)).mul(limb);
  // tom quente no terminador (luz atravessando mais atmosfera)
  const term = smoothstep(0.25, 0.0, NdL).mul(smoothstep(-0.15, 0.05, NdL));
  mat.colorNode = lit.add(col.mul(S.sunCol).mul(term.mul(0.03)).mul(vec3(1.0, 0.5, 0.25))).add(col.mul(S.amb).mul(0.05))
    // lado noturno: luz refletida pelos anéis e pelas luas (nunca preto absoluto)
    .add(col.mul(S.sunCol).mul(float(1).sub(smoothstep(-0.2, 0.1, NdL))).mul(body.rings ? 0.006 : 0.002));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), mat);
  sphere.frustumCulled = false;

  const group = new THREE.Group();
  group.add(sphere);

  // ── anéis ──
  if (body.rings) {
    const geo = ringGeometry(R * 1.35, R * 2.35, 384, 6, S.axis.value);
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    rm.fog = false;
    const p = positionLocal;
    const r = length(p);
    const dens = ringDensity(r, RI, RO, seedOff);
    const x = r.sub(RI).div(RO.sub(RI));
    const tone = N3(vec3(x.mul(5.0), seedOff.add(0.9), 0.77)).r;
    const tone2 = N3(vec3(x.mul(23.0), seedOff.add(0.3), 0.27)).g;
    // gelo sujo: creme/cinza claro, poeira mais escura no anel interno
    let rc = mix(C3(P.rock2), C3(P.snow), smoothstep(0.3, 0.75, tone).mul(0.75));
    rc = mix(rc, C3(P.deep), smoothstep(0.6, 0.85, tone2).mul(0.25));
    rc = mix(rc, C3(P.high).mul(0.6), smoothstep(0.3, 0.1, x).mul(0.7));
    // sombra do planeta sobre os anéis
    const b = dot(p, S.sunL);
    const c = dot(p, p).sub(R * R);
    const disc = b.mul(b).sub(c);
    const shadow = select(b.lessThan(0.0), smoothstep(-R * 0.02, R * 0.02, disc.negate().div(R)), float(1));
    const V2 = normalize(S.cam.sub(p));
    const n = S.axis;
    const lightSide = dot(n, S.sunL), viewSide = dot(n, V2);
    // mesma face iluminada e vista → reflexão; faces opostas → luz atravessando (mais fraca, mais quente)
    const same = select(lightSide.mul(viewSide).greaterThan(0.0), float(1), float(0));
    const mu = dot(V2.negate(), S.sunL);
    const fwd = pow(max(mu, 0.0), 6.0).mul(1.6);
    const refl = pow(abs(lightSide), 0.5).mul(0.75).add(0.3); // anel espesso: espalhamento múltiplo
    const trans = float(1).sub(dens).mul(0.35).add(fwd).mul(abs(lightSide).add(0.15));
    const light = mix(trans, refl, same);
    rm.colorNode = rc.mul(S.sunCol).mul(light).mul(shadow).div(PI).add(rc.mul(S.amb).mul(0.02));
    rm.opacityNode = clamp(dens.mul(0.82), 0, 1);
    const ring = new THREE.Mesh(geo, rm);
    ring.frustumCulled = false;
    ring.renderOrder = -2;
    group.add(ring);
  }
  return { group, sphere, material: mat };
}

/** Anel plano perpendicular ao eixo (vértices já no referencial local do planeta). */
function ringGeometry(ri, ro, seg, rings, axis) {
  const ax = axis.clone().normalize();
  const t1 = new THREE.Vector3(0.31, 0, 0.95).cross(ax).normalize();
  const t2 = new THREE.Vector3().crossVectors(ax, t1).normalize();
  const pos = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const r = ri + (ro - ri) * (j / rings);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(t1.x * Math.cos(a) * r + t2.x * Math.sin(a) * r, t1.y * Math.cos(a) * r + t2.y * Math.sin(a) * r, t1.z * Math.cos(a) * r + t2.z * Math.sin(a) * r);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
