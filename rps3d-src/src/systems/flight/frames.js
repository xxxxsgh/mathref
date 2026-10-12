// Referenciais de voo.
//
// A nave integra a física no referencial em que está:
//   • 'world'  — inercial, origem na estrela (espaço aberto, quântico)
//   • 'body'   — referencial LOCAL de um planeta/lua (gira com a superfície):
//                dentro da esfera de influência o ar, o chão e a nave pousada
//                giram juntos, então pousar = simplesmente parar neste frame
//   • 'anchor' — um {pos, quat} de mundo mutável (estação, plataforma, hangar
//                de nave capital): docado/pousado em algo que se move
//
// Ao trocar de referencial a pose é convertida exatamente; a velocidade é
// convertida só em direção (ignora ω×r), como o "grid" de Star Citizen: quem
// entra na SOI parado continua parado em relação ao planeta — sem tranco.
import * as THREE from 'three/webgpu';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

export class Frame {
  constructor(kind = 'world', ref = null) {
    this.kind = kind;   // 'world' | 'body' | 'anchor'
    this.ref = ref;     // Body | {pos, quat}
  }
  static world() { return new Frame('world'); }
  static body(b) { return new Frame('body', b); }
  static anchor(a) { return new Frame('anchor', a); }
  get body() { return this.kind === 'body' ? this.ref : null; }
  same(o) { return o && o.kind === this.kind && o.ref === this.ref; }

  /** Rotação do frame (mundo ← local) no tempo t. */
  rot(t, out = new THREE.Quaternion()) {
    if (this.kind === 'body') return this.ref.rotationAt(t, out);
    if (this.kind === 'anchor') return out.copy(this.ref.quat);
    return out.identity();
  }
  origin(out = new THREE.Vector3()) {
    if (this.kind === 'body') return out.copy(this.ref.pos);
    if (this.kind === 'anchor') return out.copy(this.ref.pos);
    return out.set(0, 0, 0);
  }
  posToWorld(local, t, out = new THREE.Vector3()) {
    if (this.kind === 'world') return out.copy(local);
    this.rot(t, _q);
    return out.copy(local).applyQuaternion(_q).add(this.origin(_v));
  }
  posToLocal(world, t, out = new THREE.Vector3()) {
    if (this.kind === 'world') return out.copy(world);
    this.rot(t, _q).invert();
    return out.copy(world).sub(this.origin(_v)).applyQuaternion(_q);
  }
  dirToWorld(local, t, out = new THREE.Vector3()) {
    if (this.kind === 'world') return out.copy(local);
    return out.copy(local).applyQuaternion(this.rot(t, _q));
  }
  dirToLocal(world, t, out = new THREE.Vector3()) {
    if (this.kind === 'world') return out.copy(world);
    return out.copy(world).applyQuaternion(this.rot(t, _q).invert());
  }
  quatToWorld(local, t, out = new THREE.Quaternion()) {
    if (this.kind === 'world') return out.copy(local);
    return out.copy(this.rot(t, _q)).multiply(local);
  }
  quatToLocal(world, t, out = new THREE.Quaternion()) {
    if (this.kind === 'world') return out.copy(world);
    this.rot(t, _q2).invert();
    return out.copy(_q2).multiply(world);
  }
}

/** Converte pos/vel/quat (+ prev) de um frame para outro, no tempo t. */
export function rebase(state, from, to, t) {
  const w = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const [pk, qk] of [['pos', 'quat'], ['prevPos', 'prevQuat']]) {
    from.posToWorld(state[pk], t, w); to.posToLocal(w, t, state[pk]);
    from.quatToWorld(state[qk], t, q); to.quatToLocal(q, t, state[qk]);
  }
  from.dirToWorld(state.vel, t, d); to.dirToLocal(d, t, state.vel);
  return state;
}
