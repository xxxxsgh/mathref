import * as THREE from 'three';

/**
 * Objetos descartáveis que as missões colocam no mundo: marcadores, fumaça e o
 * veículo da filmagem.
 *
 * Fica separado das missões porque a missão deve descrever O QUE quer ("um
 * marcador aqui"), não saber montar geometria. E porque tudo criado por aqui
 * passa pelo mesmo `remove`, que é o que garante que abortar uma missão não
 * deixe lixo pendurado na cena.
 */
export class Stage {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.spawned = new Set();

    this.markerGeometry = new THREE.SphereGeometry(1, 14, 10);
  }

  spawnMarker(position, color = 0x35e0c8, radius = 2.5) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.markerGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(radius);
    this.scene.add(mesh);
    this.spawned.add(mesh);
    return mesh;
  }

  /**
   * Coluna de fumaça: cone alto e translúcido. Não é sistema de partículas de
   * propósito — precisa ser visto de longe e custar quase nada, e um cone
   * resolve as duas coisas.
   */
  spawnSmoke(position) {
    const geometry = new THREE.ConeGeometry(4.5, 34, 8, 1, true);
    geometry.translate(0, 17, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xd8dee6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.visible = false;
    this.scene.add(mesh);
    this.spawned.add(mesh);
    return mesh;
  }

  /** Veículo da missão de filmagem. */
  spawnVehicle() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.1, 4.4),
      new THREE.MeshLambertMaterial({ color: 0xc7513a }),
    );
    body.position.y = 0.8;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.9, 1.8),
      new THREE.MeshLambertMaterial({ color: 0x2a3038 }),
    );
    cab.position.set(0, 1.7, -0.4);
    group.add(body, cab);
    this.scene.add(group);
    this.spawned.add(group);
    return group;
  }

  remove(object) {
    if (!object || !this.spawned.has(object)) return;
    this.scene.remove(object);
    object.traverse?.((child) => {
      if (child.isMesh) {
        if (child.geometry !== this.markerGeometry) child.geometry.dispose();
        child.material.dispose();
      }
    });
    this.spawned.delete(object);
  }

  /** Rede de segurança: limpa tudo que ficou pra trás. */
  clear() {
    for (const object of [...this.spawned]) this.remove(object);
  }

  dispose() {
    this.clear();
    this.markerGeometry.dispose();
  }
}
