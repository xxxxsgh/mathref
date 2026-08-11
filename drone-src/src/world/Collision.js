import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Colisão simples: uma esfera (o drone) contra o terreno e contra os colliders
 * dos props.
 *
 * Não há broadphase global porque os colliders já vivem dentro do chunk que os
 * contém — consultar os 9 chunks vizinhos já é a broadphase, de graça.
 *
 * Regra de game feel: bater devagar RASPA (empurra pra fora e tira velocidade),
 * bater rápido QUEBRA. Sem essa distinção, encostar de leve num poste terminaria
 * a corrida, e o jogo ficaria sobre evitar o cenário em vez de rasgar por dentro
 * dele.
 */
export class Collision {
  constructor(terrain) {
    this.terrain = terrain;
    this._normal = new THREE.Vector3();
    this._closest = new THREE.Vector3();
    this._delta = new THREE.Vector3();
  }

  /**
   * Resolve a posição do drone no lugar.
   * @returns {null|{hard:boolean, impact:number, normal:THREE.Vector3, kind:string}}
   */
  resolve(drone) {
    if (drone.crashed) return null;
    const radius = CONFIG.DRONE.radius;

    const ground = this._resolveTerrain(drone, radius);
    if (ground) return ground;

    return this._resolveProps(drone, radius);
  }

  _resolveTerrain(drone, radius) {
    const { position, velocity } = drone;
    const h = this.terrain.heightAt(position.x, position.z);
    const penetration = h + radius - position.y;
    if (penetration <= 0) return null;

    this.terrain.normalAt(position.x, position.z, this._normal);
    position.y = h + radius;

    const along = velocity.dot(this._normal);
    // Velocidade de aproximação: só a componente CONTRA a superfície conta.
    // Rasar o chão a 100 km/h paralelo não é impacto nenhum.
    const impact = -along;

    if (impact > CONFIG.DRONE.crashSpeed) {
      return { hard: true, impact, normal: this._normal, kind: 'terrain' };
    }

    if (along < 0) {
      // Reflete e tira energia: o drone escorrega pelo chão em vez de grudar.
      velocity.addScaledVector(this._normal, -along * (1 + CONFIG.DRONE.scrapeRestitution));
    }
    return impact > 1.2 ? { hard: false, impact, normal: this._normal, kind: 'terrain' } : null;
  }

  _resolveProps(drone, radius) {
    const { position, velocity } = drone;

    for (const chunk of this.terrain.chunksNear(position.x, position.z, 1)) {
      for (const collider of chunk.colliders) {
        const hit =
          collider.type === 'box'
            ? this._sphereBox(position, radius, collider)
            : this._sphereCylinder(position, radius, collider);
        if (!hit) continue;

        const along = velocity.dot(this._normal);
        const impact = -along;
        position.addScaledVector(this._normal, hit);

        if (impact > CONFIG.DRONE.crashSpeed) {
          return { hard: true, impact, normal: this._normal, kind: collider.type };
        }
        if (along < 0) {
          velocity.addScaledVector(this._normal, -along * (1 + CONFIG.DRONE.scrapeRestitution));
        }
        return impact > 1.2
          ? { hard: false, impact, normal: this._normal, kind: collider.type }
          : null;
      }
    }
    return null;
  }

  /** Esfera vs. caixa girada em Y. Devolve a penetração e escreve `_normal`. */
  _sphereBox(center, radius, box) {
    // Leva o centro da esfera pro referencial da caixa; assim o teste vira o
    // caso alinhado aos eixos, que é trivial.
    const dx = center.x - box.x;
    const dz = center.z - box.z;
    const cos = Math.cos(-box.yaw);
    const sin = Math.sin(-box.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const ly = center.y - box.y;

    const cx = Math.max(-box.half[0], Math.min(lx, box.half[0]));
    const cy = Math.max(-box.half[1], Math.min(ly, box.half[1]));
    const cz = Math.max(-box.half[2], Math.min(lz, box.half[2]));

    let nx = lx - cx;
    let ny = ly - cy;
    let nz = lz - cz;
    let distSq = nx * nx + ny * ny + nz * nz;

    if (distSq > radius * radius) return 0;

    if (distSq < 1e-8) {
      // Centro dentro da caixa: empurra pela face mais próxima, senão a normal
      // fica indefinida e o drone é cuspido numa direção aleatória.
      const gaps = [
        box.half[0] - Math.abs(lx),
        box.half[1] - Math.abs(ly),
        box.half[2] - Math.abs(lz),
      ];
      const axis = gaps.indexOf(Math.min(...gaps));
      nx = axis === 0 ? Math.sign(lx) || 1 : 0;
      ny = axis === 1 ? Math.sign(ly) || 1 : 0;
      nz = axis === 2 ? Math.sign(lz) || 1 : 0;
      distSq = 0;
      const penetration = radius + gaps[axis];
      this._rotateOut(nx, ny, nz, box.yaw);
      return penetration;
    }

    const dist = Math.sqrt(distSq);
    this._rotateOut(nx / dist, ny / dist, nz / dist, box.yaw);
    return radius - dist;
  }

  /** Devolve a normal do referencial da caixa pro mundo. */
  _rotateOut(nx, ny, nz, yaw) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    this._normal.set(nx * cos - nz * sin, ny, nx * sin + nz * cos).normalize();
  }

  /** Esfera vs. cilindro vertical (poste, tronco, antena). */
  _sphereCylinder(center, radius, cyl) {
    if (center.y + radius < cyl.y || center.y - radius > cyl.y + cyl.height) return 0;

    const dx = center.x - cyl.x;
    const dz = center.z - cyl.z;
    const distSq = dx * dx + dz * dz;
    const reach = cyl.radius + radius;
    if (distSq > reach * reach) return 0;

    const dist = Math.sqrt(distSq);
    if (dist < 1e-5) {
      // Exatamente no eixo: qualquer direção horizontal serve.
      this._normal.set(1, 0, 0);
      return reach;
    }
    this._normal.set(dx / dist, 0, dz / dist);
    return reach - dist;
  }
}
