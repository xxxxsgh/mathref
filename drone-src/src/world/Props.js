import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { cellRandom, fbm2D } from './noise.js';

/**
 * Objetos de cenário espalhados pelos chunks.
 *
 * Isto NÃO é decoração — é a prioridade número um da Fase 1. Sem referência
 * visual perto do drone não existe sensação de velocidade: voando a 100 km/h
 * sobre terreno vazio a imagem quase não muda, e o jogo parece travado. Poste,
 * árvore e container passando raspando é o que informa a velocidade, muito mais
 * do que qualquer número no HUD.
 *
 * Tudo é InstancedMesh: um draw call por tipo de prop por chunk, não por objeto.
 */

const UP = new THREE.Vector3(0, 1, 0);

/** Tipos de prop. `collider` descreve a forma que a colisão usa. */
export const PROP_TYPES = {
  pole: {
    // Poste alto e fino: a referência vertical mais barata que existe.
    build: () => {
      const g = new THREE.CylinderGeometry(0.12, 0.18, 9, 5, 1, true);
      g.translate(0, 4.5, 0);
      return g;
    },
    color: 0x8d9299,
    collider: { type: 'cylinder', radius: 0.45, height: 9 },
    scale: [0.75, 1.4],
  },
  tree: {
    build: () => {
      const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.4, 5);
      trunk.translate(0, 1.7, 0);
      const crown = new THREE.ConeGeometry(1.7, 5.2, 7);
      crown.translate(0, 5.4, 0);
      return mergeGeometries([trunk, crown]);
    },
    color: 0x3d5138,
    collider: { type: 'cylinder', radius: 0.8, height: 8 },
    scale: [0.7, 1.6],
  },
  container: {
    build: () => {
      const g = new THREE.BoxGeometry(6.1, 2.6, 2.44);
      g.translate(0, 1.3, 0);
      return g;
    },
    color: 0x9c5136,
    collider: { type: 'box', half: [3.05, 1.3, 1.22] },
    scale: [1, 1],
    yawSnap: true,
  },
  hangar: {
    build: () => {
      const walls = new THREE.BoxGeometry(22, 8, 14);
      walls.translate(0, 4, 0);
      const roof = new THREE.CylinderGeometry(7.2, 7.2, 22, 10, 1, true, 0, Math.PI);
      roof.rotateZ(Math.PI / 2);
      roof.translate(0, 8, 0);
      return mergeGeometries([walls, roof]);
    },
    color: 0x6e7681,
    collider: { type: 'box', half: [11, 7, 7] },
    scale: [1, 1],
    yawSnap: true,
  },
  antenna: {
    build: () => {
      const g = new THREE.CylinderGeometry(0.06, 0.5, 26, 4, 1, true);
      g.translate(0, 13, 0);
      return g;
    },
    color: 0xa8452f,
    collider: { type: 'cylinder', radius: 0.9, height: 26 },
    scale: [0.8, 1.3],
  },
};

/**
 * Junta geometrias sem depender do BufferGeometryUtils dos examples.
 * Só precisamos do caso simples: mesmos atributos, tudo não-indexado.
 */
function mergeGeometries(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  let offset = 0;
  for (const g of parts) {
    g.computeVertexNormals();
    position.set(g.attributes.position.array, offset * 3);
    normal.set(g.attributes.normal.array, offset * 3);
    offset += g.attributes.position.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return merged;
}

/**
 * Decide o que nasce numa célula a partir de UM único sorteio.
 *
 * O mesmo `r` responde as duas perguntas — "nasce alguma coisa?" e "o quê?" —
 * reaproveitando a parte de baixo da faixa depois de renormalizar. Um hash a
 * menos por célula, e a distribuição continua uniforme porque as duas leituras
 * são de intervalos independentes do mesmo número.
 */
function pickWeighted(entries, totalWeight, presence, r) {
  if (r >= presence) return null;
  let acc = 0;
  const target = (r / presence) * totalWeight;
  for (const [name, weight] of entries) {
    acc += weight;
    if (target <= acc) return name;
  }
  return entries[entries.length - 1][0];
}

export class Props {
  constructor(scene, terrain, quality) {
    this.scene = scene;
    this.terrain = terrain;
    this.quality = quality;

    this.geometries = {};
    this.materials = {};
    for (const [name, def] of Object.entries(PROP_TYPES)) {
      this.geometries[name] = def.build();
      this.materials[name] = new THREE.MeshLambertMaterial({ color: def.color });
    }

    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._scaleVec = new THREE.Vector3();
    this._posVec = new THREE.Vector3();

    /** Regras de espalhamento por zona — a Fase 3 sobrescreve. */
    this.mixAt = () => ({ pole: 1.0, tree: 2.2, container: 0.7, hangar: 0.05, antenna: 0.08 });
  }

  /** Popula um chunk recém-criado. Chamado pelo `onChunkLoad` do Terrain. */
  populate(chunk) {
    const density = CONFIG.WORLD.propDensity * this.quality.settings.propDensity;
    const mix = this.mixAt(chunk.originX + chunk.size / 2, chunk.originZ + chunk.size / 2);

    const entries = Object.entries(mix).filter(([, weight]) => weight > 0);
    if (!entries.length) return;
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    // Probabilidade de uma célula qualquer receber ALGUMA coisa. O 0.16 é o
    // que faz 64 células virarem ~10 props num chunk com a mistura padrão.
    const presence = Math.min(1, totalWeight * density * 0.16);

    // Um balde por tipo, sempre — inclusive pros raros. Criar balde só pra
    // quem "provavelmente aparece" fazia o hangar ser sorteado e descartado.
    const buckets = Object.fromEntries(entries.map(([name]) => [name, []]));

    // Uma grade de células por chunk, com jitter. Grade + jitter em vez de
    // aleatório puro porque aleatório puro amontoa objetos em alguns pontos e
    // deixa buracos vazios em outros — e é justamente o vazio que mata a
    // sensação de velocidade.
    const cells = 8;
    const cellSize = chunk.size / cells;
    for (let gz = 0; gz < cells; gz++) {
      for (let gx = 0; gx < cells; gx++) {
        const worldCellX = chunk.cx * cells + gx;
        const worldCellZ = chunk.cz * cells + gz;
        const r = cellRandom(worldCellX, worldCellZ, this.terrain.seed);
        const r2 = cellRandom(worldCellX + 7919, worldCellZ - 104729, this.terrain.seed);
        const r3 = cellRandom(worldCellX - 31337, worldCellZ + 15485863, this.terrain.seed);

        const name = pickWeighted(entries, totalWeight, presence, r);
        if (!name) continue;

        const x = chunk.originX + (gx + 0.15 + r2 * 0.7) * cellSize;
        const z = chunk.originZ + (gz + 0.15 + r3 * 0.7) * cellSize;

        // Nada em ladeira forte: prop plantado num barranco fica flutuando
        // com metade do tronco pra fora.
        const slope = this.terrain.slopeAt(x, z, this._posVec);
        if (slope > 0.55) continue;

        const y = this.terrain.heightAt(x, z);
        const def = PROP_TYPES[name];
        const scale = def.scale[0] + (def.scale[1] - def.scale[0]) * r2;
        const yaw = def.yawSnap ? Math.round(r3 * 4) * (Math.PI / 2) : r3 * Math.PI * 2;

        buckets[name].push({ x, y, z, scale, yaw });
      }
    }

    for (const [name, items] of Object.entries(buckets)) {
      if (!items.length) continue;
      const mesh = new THREE.InstancedMesh(
        this.geometries[name],
        this.materials[name],
        items.length,
      );
      mesh.castShadow = this.quality.settings.shadows;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;

      const def = PROP_TYPES[name];
      items.forEach((item, i) => {
        this._quat.setFromAxisAngle(UP, item.yaw);
        this._scaleVec.set(item.scale, item.scale, item.scale);
        this._posVec.set(item.x, item.y, item.z);
        this._matrix.compose(this._posVec, this._quat, this._scaleVec);
        mesh.setMatrixAt(i, this._matrix);

        chunk.colliders.push(this._makeCollider(def, item));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();

      this.scene.add(mesh);
      chunk.props.push(mesh);
    }
  }

  _makeCollider(def, item) {
    const c = def.collider;
    if (c.type === 'box') {
      return {
        type: 'box',
        x: item.x,
        y: item.y + c.half[1] * item.scale,
        z: item.z,
        half: [c.half[0] * item.scale, c.half[1] * item.scale, c.half[2] * item.scale],
        yaw: item.yaw,
      };
    }
    return {
      type: 'cylinder',
      x: item.x,
      y: item.y,
      z: item.z,
      radius: c.radius * item.scale,
      height: c.height * item.scale,
    };
  }

  /** Libera as instâncias de um chunk que saiu do alcance. */
  clear(chunk) {
    for (const mesh of chunk.props) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    chunk.props.length = 0;
    chunk.colliders.length = 0;
  }

  dispose() {
    for (const g of Object.values(this.geometries)) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

export { mergeGeometries };
