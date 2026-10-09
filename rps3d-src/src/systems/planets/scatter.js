// Dispersão atmosférica (Rayleigh + Mie, espalhamento simples) em TSL — as
// mesmas fórmulas de atmoModel.js. Integração ao longo do raio da câmera com
// N passos; a luz que chega a cada passo é atenuada pela profundidade óptica
// até o sol dada pela função de Chapman (sem laço interno), o que inclui de
// graça a sombra do planeta (pôr do sol avermelhado, noite escura).
//
// Coordenadas: referencial LOCAL do planeta, em metros. A interseção com as
// esferas usa a distância perpendicular (estável em float32 mesmo com a
// câmera a 10⁷ m do planeta).
import {
  Fn, vec3, vec4, float, dot, sqrt, max, min, exp, select, length, Loop, normalize, pow, uniform,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { atmoParams } from './atmoModel.js';

export const PI = Math.PI;

/** Uniforms de atmosfera de um corpo (valores atualizados por planetView). */
export function atmoUniforms(body) {
  const A = atmoParams(body) || { R: body.radius, top: body.radius * 1.001, HR: 1, HM: 1, betaR: [0, 0, 0], betaM: [0, 0, 0], betaMe: [0, 0, 0], mieExt: 1.1, g: 0.76 };
  return {
    A,
    R: uniform(A.R), top: uniform(A.top), HR: uniform(A.HR), HM: uniform(A.HM),
    betaR: uniform(new THREE.Vector3(...A.betaR)), betaM: uniform(new THREE.Vector3(...A.betaM)), betaMe: uniform(new THREE.Vector3(...A.betaMe)),
    mieExt: uniform(A.mieExt), g: uniform(A.g), xk: uniform(A.xk || 1),
  };
}

const chap = Fn(([X, h, mu]) => {
  const c = sqrt(X.add(h));
  const e = exp(h.negate());
  const pos = c.div(c.mul(mu).add(1.0)).mul(e);
  const x0 = sqrt(max(float(1.0).sub(mu.mul(mu)), 0.0)).mul(X.add(h));
  const neg = sqrt(x0).mul(2.0).mul(exp(min(X.sub(x0), 80.0))).sub(c.div(float(1.0).sub(c.mul(mu))).mul(e));
  return select(mu.greaterThanEqual(0.0), pos, neg);
}).setLayout({ name: 'pl_chapman', type: 'float', inputs: [{ name: 'X', type: 'float' }, { name: 'h', type: 'float' }, { name: 'mu', type: 'float' }] });

/** Transmitância do sol (vec3) num ponto local p. */
export function sunTrans(U, p, L) {
  const r = length(p);
  const h = r.sub(U.R);
  const mu = dot(p, L).div(r);
  const odR = U.HR.mul(chap(U.R.mul(U.xk).div(U.HR), h.div(U.HR), mu));
  const odM = U.HM.mul(chap(U.R.mul(U.xk).div(U.HM), h.div(U.HM), mu));
  return exp(U.betaR.mul(odR).add(U.betaMe.mul(odM)).negate());
}

/** Fases (Rayleigh e Cornette-Shanks). */
export function phases(mu, g) {
  const pR = mu.mul(mu).add(1.0).mul(3.0 / (16.0 * PI));
  const g2 = g.mul(g);
  const pM = float(3.0 / (8.0 * PI)).mul(float(1.0).sub(g2)).mul(mu.mul(mu).add(1.0))
    .div(g2.add(2.0).mul(pow(max(g2.add(1.0).sub(g.mul(mu).mul(2.0)), 1e-4), 1.5)));
  return { pR, pM };
}

/**
 * Fábrica do integrador. Retorna fn(ro, rd, tMax) → vec4(I.rgb (já × sunI), T escalar).
 * ground=true termina o raio na esfera do raio médio (céu); false só usa tMax.
 */
export function makeScatter(U, S, steps, ground, name) {
  return Fn(([ro, rd, tMax]) => {
    const b = dot(ro, rd);
    const perp = ro.sub(rd.mul(b));
    const p2 = dot(perp, perp);
    const disc = U.top.mul(U.top).sub(p2);
    const s = sqrt(max(disc, 0.0));
    const t0 = max(b.negate().sub(s), 0.0).toVar();
    const t1 = min(b.negate().add(s), tMax).toVar();
    if (ground) {
      const dg = U.R.mul(U.R).sub(p2);
      const tg = b.negate().sub(sqrt(max(dg, 0.0)));
      t1.assign(select(dg.greaterThan(0.0).and(tg.greaterThan(0.0)), min(t1, tg), t1));
    }
    const ds = float(0).toVar();
    ds.assign(max(t1.sub(t0), 0.0).mul(select(disc.greaterThan(0.0), float(1.0), float(0.0))).div(steps));
    const odR = float(0).toVar(), odM = float(0).toVar();
    const sR = vec3(0).toVar(), sM = vec3(0).toVar();
    const XR = U.R.mul(U.xk).div(U.HR), XM = U.R.mul(U.xk).div(U.HM);
    Loop(steps, ({ i }) => {
      const t = t0.add(ds.mul(float(i).add(0.5)));
      const p = ro.add(rd.mul(t));
      const r = length(p);
      const h = r.sub(U.R);
      const dR = exp(h.div(U.HR).negate()).mul(ds);
      const dM = exp(h.div(U.HM).negate()).mul(ds);
      odR.addAssign(dR.mul(0.5)); odM.addAssign(dM.mul(0.5));
      const mu = dot(p, S.sunL).div(r);
      const lR = U.HR.mul(chap(XR, h.div(U.HR), mu));
      const lM = U.HM.mul(chap(XM, h.div(U.HM), mu));
      const Ts = exp(U.betaR.mul(odR.add(lR)).add(U.betaMe.mul(odM.add(lM))).negate());
      sR.addAssign(Ts.mul(dR)); sM.addAssign(Ts.mul(dM));
      odR.addAssign(dR.mul(0.5)); odM.addAssign(dM.mul(0.5));
    });
    const mu = dot(rd, S.sunL);
    const { pR, pM } = phases(mu, U.g);
    const I = sR.mul(U.betaR).mul(pR).add(sM.mul(U.betaM).mul(pM)).mul(S.skyI);
    const T = exp(U.betaR.mul(odR).add(U.betaMe.mul(odM)).negate());
    return vec4(I, dot(T, vec3(0.3, 0.45, 0.25)));
  });
}

/** Perspectiva aérea do ponto local p visto da câmera (vec4: I, T). */
export function aerial(U, S, scat, p) {
  const v = p.sub(S.cam);
  const d = length(v);
  return scat(S.cam, v.div(max(d, 1e-3)), d);
}

export { normalize };
