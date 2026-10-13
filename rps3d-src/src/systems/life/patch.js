// "Remendo" local na superfície de um planeta: um referencial tangente
// (origem C0 no chão, +Y = vertical, X/Z no plano) preso ao planeta que gira.
// Fauna e flora vivem aqui em float32 com precisão de milímetros; o remendo é
// recentrado quando o jogador se afasta (tudo é guardado também no
// referencial LOCAL do planeta, em double, então nada salta).
import * as THREE from 'three/webgpu';
import { anyPerp } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Patch {
  constructor(ctx) {
    this.ctx = ctx;
    this.body = null;
    this.C0 = new THREE.Vector3();
    this.qL = new THREE.Quaternion();     // remendo → local do planeta
    this.qInv = new THREE.Quaternion();
    this.group = new THREE.Group();
    this.group.name = 'life-remendo';
    this.entry = null;
    this.frame = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }; // para ctx.collision (mundo)
    this.version = 0;
    this.terrain = null;
    this.hasSea = false;
  }

  get active() { return !!this.body; }

  /** (Re)centra no ponto local `centerLocal` do corpo. */
  center(body, centerLocal) {
    const ctx = this.ctx;
    const pl = ctx.services.planets;
    const up = _v.copy(centerLocal).normalize();
    const h = pl?.heightAtLocal ? pl.heightAtLocal(body, up) : 0;
    this.body = body;
    this.R = body.radius;
    this.C0.copy(up).multiplyScalar(body.radius + h);
    const e1 = anyPerp(up, new THREE.Vector3());
    const e2 = new THREE.Vector3().crossVectors(e1, up);
    // base: x = e1, y = up, z = e2  (x × y = z)
    const m = new THREE.Matrix4().makeBasis(e1, up.clone(), e2);
    this.qL.setFromRotationMatrix(m);
    this.qInv.copy(this.qL).invert();
    const view = pl?.view?.(body);
    this.terrain = view?.terrain || null;
    this.hasSea = !!this.terrain?.hasSea;
    if (!this.entry) this.entry = ctx.world.add(this.group, new THREE.Vector3(), { getPos: (out) => this.body ? this.body.localToWorld(this.C0, ctx.time.world, out) : out.set(0, 0, 0) });
    this.version++;
    this.sync();
  }

  clear() {
    this.body = null;
    this.entry?.remove(); this.entry = null;
    this.version++;
  }

  /** Orientação do grupo e do referencial de colisão (chamar por passo/frame). */
  sync() {
    if (!this.body) return;
    const t = this.ctx.time.world;
    this.body.rotationAt(t, _q);
    this.group.quaternion.copy(_q).multiply(this.qL);
    this.frame.quat.copy(this.group.quaternion);
    this.body.localToWorld(this.C0, t, this.frame.pos);
  }

  /** Local do planeta → remendo. */
  toPatch(local, out = new THREE.Vector3()) { return out.copy(local).sub(this.C0).applyQuaternion(this.qInv); }
  /** Remendo → local do planeta. */
  toLocal(p, out = new THREE.Vector3()) { return out.copy(p).applyQuaternion(this.qL).add(this.C0); }
  /** Direção do remendo → local. */
  dirToLocal(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this.qL); }
  dirToPatch(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this.qInv); }
  /** Mundo → remendo. */
  worldToPatch(world, out = new THREE.Vector3()) {
    this.body.worldToLocal(world, this.ctx.time.world, _w);
    return this.toPatch(_w, out);
  }
  patchToWorld(p, out = new THREE.Vector3()) {
    this.toLocal(p, _w);
    return this.body.localToWorld(_w, this.ctx.time.world, out);
  }
  dirToWorld(d, out = new THREE.Vector3()) {
    this.dirToLocal(d, _w);
    return this.body.dirToWorld(_w, this.ctx.time.world, out);
  }

  /** Altura do terreno (m sobre o raio) numa direção local unitária. */
  heightDir(d) { return this.terrain ? this.terrain.height(d.x, d.y, d.z) : 0; }

  /**
   * Chão sob o ponto do remendo (x, z) (y ignorado): preenche out
   * { y (altura do chão no remendo), up (vertical local no remendo), h
   * (altura do terreno), water (true se for mar) , seaY }.
   */
  ground(x, z, out = {}, y = 0) {
    _v.set(x, y, z).applyQuaternion(this.qL).add(this.C0);
    const d = _v.normalize();
    const h = this.heightDir(d);
    const g = Math.max(h, this.hasSea ? 0 : -1e9);
    // ponto do chão no remendo
    const P = _w.copy(d).multiplyScalar(this.R + g).sub(this.C0).applyQuaternion(this.qInv);
    out.y = P.y;
    out.h = h;
    out.water = this.hasSea && h < 0;
    out.up = (out.up || new THREE.Vector3()).copy(d).applyQuaternion(this.qInv);
    if (this.hasSea) { const S = _w.copy(d).multiplyScalar(this.R).sub(this.C0).applyQuaternion(this.qInv); out.seaY = S.y; } else out.seaY = -1e9;
    return out;
  }
  /** Só a altura do chão (sem alocar). */
  groundY(x, z) {
    _v.set(x, 0, z).applyQuaternion(this.qL).add(this.C0);
    const d = _v.normalize();
    const h = this.heightDir(d);
    const g = Math.max(h, this.hasSea ? 0 : -1e9);
    return _w.copy(d).multiplyScalar(this.R + g).sub(this.C0).applyQuaternion(this.qInv).y;
  }
  /** Normal do terreno no remendo por diferenças finitas. */
  normal(x, z, eps = 1.5, out = new THREE.Vector3()) {
    const h0 = this.groundY(x, z), h1 = this.groundY(x + eps, z), h2 = this.groundY(x, z + eps);
    return out.set(-(h1 - h0) / eps, 1, -(h2 - h0) / eps).normalize();
  }
}
