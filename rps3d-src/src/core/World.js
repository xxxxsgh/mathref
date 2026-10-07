// Origem flutuante. Posições de mundo são doubles (THREE.Vector3 em JS já é
// double) com origem na estrela; a GPU só vê floats, então tudo é desenhado
// RELATIVO À CÂMERA: a câmera fica sempre em (0,0,0) e cada objeto registrado
// recebe `position = posMundo - origem` todo frame.
//
// Quem controla a câmera escreve `ctx.player.camWorld` (posição de mundo) e
// `ctx.camera.quaternion`. O núcleo chama world.sync() logo antes de render.
import * as THREE from 'three/webgpu';

export class World {
  constructor(scene, camera, player) {
    this.scene = scene; this.camera = camera; this.player = player;
    this.origin = new THREE.Vector3();
    this.entries = new Set();
  }
  /**
   * Registra um Object3D com posição de mundo. `pos` é referenciado (não
   * copiado): o dono pode mutá-lo livremente. `getPos` (opcional) é chamado
   * todo frame no lugar de `pos` (para coisas presas a referenciais que giram).
   */
  add(object, pos, { getPos = null, parent = this.scene } = {}) {
    const e = { object, pos: pos || new THREE.Vector3(), getPos };
    this.entries.add(e);
    if (parent && object.parent !== parent) parent.add(object);
    e.remove = () => { this.entries.delete(e); object.parent?.remove(object); };
    return e;
  }
  /** Mundo → espaço de render (relativo à câmera). */
  toLocal(world, out = new THREE.Vector3()) { return out.copy(world).sub(this.origin); }
  toWorld(local, out = new THREE.Vector3()) { return out.copy(local).add(this.origin); }
  sync() {
    this.origin.copy(this.player.camWorld);
    this.camera.position.set(0, 0, 0);
    const tmp = new THREE.Vector3();
    for (const e of this.entries) {
      const p = e.getPos ? e.getPos(tmp) : e.pos;
      e.object.position.copy(p).sub(this.origin);
    }
  }
}
