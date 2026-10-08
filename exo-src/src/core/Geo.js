/**
 * Convenções geográficas do EXOSFERA (puro, sem DOM — testável em node).
 *
 * MUNDO: 1 unidade = 1 metro. O referencial do mundo é FIXO NO PLANETA ATUAL
 * (gira com ele): centro do planeta = ctx.space.planetCenter (por padrão a
 * origem do mundo, (0,0,0)), eixo de rotação = +Y (polo norte em +Y).
 *
 * Latitude/longitude (graus) → direção unitária a partir do centro:
 *   dir = ( cos(lat)·cos(lon),  sin(lat),  −cos(lat)·sin(lon) )
 * Assim, em (lat 0, lon 0): up = +X, norte = +Y, leste = −Z, e o triedo
 * (leste, norte, up) é destro: leste × norte = up.
 *
 * Rumo (heading, graus): 0 = norte, 90 = leste (horário visto de cima).
 * Pitch (graus): positivo = para cima.
 */
import { Vector3, Quaternion, Matrix4 } from 'three';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
const Y = new Vector3(0, 1, 0);

/** Direção unitária (double) a partir de lat/lon em graus. */
export function dirFromLatLon(latDeg, lonDeg, out = new Vector3()) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const c = Math.cos(la);
  return out.set(c * Math.cos(lo), Math.sin(la), -c * Math.sin(lo));
}

/** { lat, lon } em graus de uma direção (não precisa estar normalizada). */
export function latLonFromDir(d) {
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, d.y / len))) * RAD;
  const lon = Math.atan2(-d.z, d.x) * RAD;
  return { lat, lon };
}

/**
 * Triedo local (leste, norte, up) para uma direção `up` unitária.
 * Nos polos, "norte" degenera: usa −Z/+X como referência estável.
 */
export function tangentFrame(up, out = { east: new Vector3(), north: new Vector3(), up: new Vector3() }) {
  out.up.copy(up);
  out.north.copy(Y).addScaledVector(up, -up.y);
  if (out.north.lengthSq() < 1e-12) {
    // polo: norte arbitrário mas contínuo
    out.north.set(-1, 0, 0).addScaledVector(up, up.x);
  }
  out.north.normalize();
  out.east.crossVectors(out.north, up).normalize();
  return out;
}

/** Vetor de avanço no plano tangente para um rumo (graus). */
export function headingVector(up, headingDeg, out = new Vector3()) {
  const f = tangentFrame(up);
  const h = headingDeg * DEG;
  return out.copy(f.north).multiplyScalar(Math.cos(h)).addScaledVector(f.east, Math.sin(h)).normalize();
}

/** Rumo (graus, 0..360) de um vetor qualquer projetado no plano tangente de `up`. */
export function headingOf(up, v) {
  const f = tangentFrame(up);
  const n = v.dot(f.north);
  const e = v.dot(f.east);
  let h = Math.atan2(e, n) * RAD;
  if (h < 0) h += 360;
  return h;
}

/** Elevação (graus) de um vetor v visto de um ponto com normal `up`. */
export function elevationOf(up, v) {
  const l = v.length() || 1;
  return Math.asin(Math.max(-1, Math.min(1, v.dot(up) / l))) * RAD;
}

const _m = new Matrix4();
const _r = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
/**
 * Quaternion de orientação (convenção three: câmera olha para −Z, +Y para
 * cima) com avanço `forward` e cima aproximado `up`.
 */
export function quatFromForwardUp(forward, up, out = new Quaternion()) {
  _f.copy(forward).normalize();
  _r.crossVectors(_f, up);
  if (_r.lengthSq() < 1e-12) _r.set(1, 0, 0).cross(_f);
  _r.normalize();
  _u.crossVectors(_r, _f).normalize();
  _m.makeBasis(_r, _u, _f.negate());
  return out.setFromRotationMatrix(_m);
}

/**
 * Orientação para (up local, rumo, pitch): o corpo fica em pé (+Y = up) e a
 * visão inclina `pitch` graus.
 */
export function quatFromHeadingPitch(up, headingDeg, pitchDeg, out = new Quaternion()) {
  const fwd = headingVector(up, headingDeg, new Vector3());
  const p = pitchDeg * DEG;
  const dir = fwd.multiplyScalar(Math.cos(p)).addScaledVector(up, Math.sin(p));
  return quatFromForwardUp(dir, up, out);
}

/** Ângulo de mergulho do horizonte geométrico (graus) a `alt` m sobre uma esfera de raio R. */
export function horizonDip(R, alt) {
  return Math.acos(Math.max(-1, Math.min(1, R / (R + Math.max(0, alt))))) * RAD;
}

/** Distância até o horizonte (m). */
export function horizonDistance(R, alt) {
  return Math.sqrt(Math.max(0, alt) * (2 * R + Math.max(0, alt)));
}
