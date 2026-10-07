// Âncoras de partículas para a origem flutuante. Partículas guardam posição
// RELATIVA a uma âncora (offset pequeno em float); a âncora guarda a posição de
// MUNDO em double na CPU e, logo antes do render, vira um uniform relativo à
// câmera. Assim uma explosão a 40.000 km da estrela não treme.
//
// Âncoras podem ter velocidade (destroços herdam o movimento da nave) e expiram
// sozinhas depois de `ttl` segundos.
import * as THREE from 'three/webgpu';
import { uniformArray } from 'three/tsl';

export const MAX_ANCHORS = 64;

export class Anchors {
  constructor() {
    this.world = Array.from({ length: MAX_ANCHORS }, () => new THREE.Vector3());
    this.vel = Array.from({ length: MAX_ANCHORS }, () => new THREE.Vector3());
    this.expire = new Float64Array(MAX_ANCHORS);   // tempo (fx) em que libera
    this.used = new Uint8Array(MAX_ANCHORS);
    this.follow = new Array(MAX_ANCHORS).fill(null); // getPos(out) opcional
    this.local = Array.from({ length: MAX_ANCHORS }, () => new THREE.Vector3());
    this.node = uniformArray(this.local, 'vec3');
    this.cursor = 0;
  }
  /** Reserva uma âncora. Se todas estiverem ocupadas, recicla a que expira primeiro. */
  alloc(worldPos, vel, ttl, now, follow = null) {
    let idx = -1;
    for (let k = 0; k < MAX_ANCHORS; k++) {
      const i = (this.cursor + k) % MAX_ANCHORS;
      if (!this.used[i] || this.expire[i] <= now) { idx = i; break; }
    }
    if (idx < 0) {
      let best = Infinity;
      for (let i = 0; i < MAX_ANCHORS; i++) if (this.expire[i] < best) { best = this.expire[i]; idx = i; }
    }
    this.cursor = (idx + 1) % MAX_ANCHORS;
    this.used[idx] = 1;
    this.world[idx].copy(worldPos);
    this.vel[idx].copy(vel || _zero);
    this.expire[idx] = now + ttl;
    this.follow[idx] = follow;
    return idx;
  }
  extend(idx, until) { if (until > this.expire[idx]) this.expire[idx] = until; }
  step(dt, now) {
    for (let i = 0; i < MAX_ANCHORS; i++) {
      if (!this.used[i]) continue;
      if (this.expire[i] <= now) { this.used[i] = 0; this.follow[i] = null; continue; }
      if (this.follow[i]) this.follow[i](this.world[i]);
      else this.world[i].addScaledVector(this.vel[i], dt);
    }
  }
  /** Converte para espaço de render (chamar depois de world.sync). */
  sync(origin) {
    for (let i = 0; i < MAX_ANCHORS; i++) {
      if (this.used[i]) this.local[i].copy(this.world[i]).sub(origin);
    }
  }
  renderPos(idx, out) { return out.copy(this.local[idx]); }
}
const _zero = new THREE.Vector3();
