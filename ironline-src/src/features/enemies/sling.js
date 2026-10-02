/**
 * Bandoleira de 2 pontos do fuzil.
 *
 * Trecho da frente: argola do guarda-mão → ombro esquerdo (sobre a alça do
 * colete). Trecho de trás: axila direita → argola da coronha. O trecho que
 * passa pelas costas é geometria fixa no peito (soldier.js).
 *
 * Cada trecho é uma curva com barriga (catenária aproximada: a flecha cresce
 * com a folga) dividida em segmentos; cada segmento é um osso livre que leva
 * uma fita de comprimento unitário (Y de 0 a 1 no repouso) até o lugar —
 * posição no início do segmento, Y alinhado ao segmento e escalado pelo
 * comprimento, X = largura da fita deitada sobre o corpo.
 *
 * Funciona igual com a animação e com o ragdoll (o fuzil "pendurado" no
 * corpo morto puxa a fita).
 */
import * as THREE from 'three';
import { B, SLING_BONES } from './rig.js';

// pontos no espaço do fuzil
const W_FRONT = new THREE.Vector3(-0.026, 0.05, 0.4);
const W_REAR = new THREE.Vector3(-0.024, 0.03, -0.215);
// pontos no espaço do peito (relativos ao osso chest, repouso)
const C_SHOULDER = new THREE.Vector3(0.115, 0.2, 0.135);
const C_ARMPIT = new THREE.Vector3(-0.17, 0.0, -0.06);
// comprimentos naturais dos trechos (folga além disso vira barriga)
const LEN_FRONT = 0.62;
const LEN_REAR = 0.5;

const _a = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _y = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _f = new THREE.Vector3();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);

function curve(a, c, sag, t, out) {
  return out.lerpVectors(a, c, t).addScaledVector(DOWN, sag * 4 * t * (1 - t));
}

function placeSpan(bones, idx, a, c, natural, fwd, n) {
  const d = a.distanceTo(c);
  // flecha: folga/2 (aprox. de corda frouxa), limitada
  const sag = THREE.MathUtils.clamp((natural - d) * 0.55, 0.012, 0.16);
  for (let k = 0; k < n; k++) {
    curve(a, c, sag, k / n, _p0);
    curve(a, c, sag, (k + 1) / n, _p1);
    const bone = bones[SLING_BONES[idx + k]];
    _y.subVectors(_p1, _p0);
    const len = _y.length();
    if (len < 1e-5 || d > 1.6) {
      // esticada demais (corpo/fuzil separados de forma implausível): some
      bone.scale.setScalar(1e-4);
      bone.position.copy(_p0);
      continue;
    }
    _y.divideScalar(len);
    _x.crossVectors(_y, fwd);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    bone.quaternion.setFromRotationMatrix(_m);
    bone.position.copy(_p0);
    bone.scale.set(1, len, 1);
  }
}

/** Posiciona os ossos da bandoleira a partir da pose atual (Qm/Pm + fuzil). */
export function solveSling(anim) {
  const { Qm, Pm, bones } = anim;
  const qc = Qm[B.chest], pc = Pm[B.chest];
  _f.set(0, 0, 1).applyQuaternion(qc);
  // trecho da frente: 3 segmentos
  _a.copy(W_FRONT).applyQuaternion(anim.weaponQ).add(anim.weaponP);
  _c.copy(C_SHOULDER).applyQuaternion(qc).add(pc);
  placeSpan(bones, 0, _a, _c, LEN_FRONT, _f, 3);
  // trecho de trás: 2 segmentos (axila → coronha)
  _a.copy(C_ARMPIT).applyQuaternion(qc).add(pc);
  _c.copy(W_REAR).applyQuaternion(anim.weaponQ).add(anim.weaponP);
  placeSpan(bones, 3, _a, _c, LEN_REAR, _f.set(-1, 0, 0).applyQuaternion(qc), 2);
}

