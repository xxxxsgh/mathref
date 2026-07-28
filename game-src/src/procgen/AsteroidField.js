import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRng, mix, hashString } from './rng.js';
import { SpatialHash } from '../systems/SpatialHash.js';
import { LAYER_NEAR } from '../core/Renderer.js';

/**
 * Cinturão de asteroides.
 *
 * ═══ INSTANCING + LOD ═══
 *
 * São milhares de rochas. Como Mesh individuais seriam milhares de draw calls
 * e o jogo morreria. Usamos `InstancedMesh` com três NÍVEIS DE DETALHE, cada
 * um com sua própria malha e sua própria lista de instâncias:
 *
 *   LOD 0 — perto:  ~120 triângulos, com relevo
 *   LOD 1 — médio:  ~44 triângulos
 *   LOD 2 — longe:  ~20 triângulos (quase um dado)
 *
 * Isso são 3 draw calls no total, não 3 por asteroide. A cada frame varremos
 * os asteroides, decidimos o LOD de cada um pela distância à câmera e
 * escrevemos a matriz no buffer do LOD correspondente.
 *
 * ═══ CULLING ═══
 *
 * `frustumCulled` não ajuda em InstancedMesh (ou passa tudo, ou nada), então
 * o culling é feito por nós: asteroides além de `viewDistance` simplesmente
 * não entram em nenhum buffer. Como a varredura já acontece para o LOD, o
 * culling sai de graça.
 *
 * ═══ COLISÃO ═══
 *
 * Aqui sim vale spatial hash: milhares de objetos ESTÁTICOS consultados por
 * poucos móveis. O índice é construído uma vez, na geração.
 */
export class AsteroidField {
  /**
   * @param {THREE.Scene} scene
   * @param {object} spec {center, innerRadius, outerRadius, thickness, count, seed}
   */
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    const A = CONFIG.asteroids;

    const rng = createRng(mix(hashString(spec.seed), 0xA57E));
    this.count = spec.count;

    // Dados por asteroide em arrays paralelos (não objetos): melhor
    // localidade de cache na varredura por frame, que é o laço mais quente
    // deste sistema.
    this.positions = new Float32Array(this.count * 3);
    this.scales = new Float32Array(this.count);
    this.quats = new Float32Array(this.count * 4);
    this.spins = new Float32Array(this.count * 4);   // eixo(3) + velocidade(1)
    this.radii = new Float32Array(this.count);
    this.alive = new Uint8Array(this.count).fill(1);
    this.hp = new Float32Array(this.count);
    this.resource = new Uint8Array(this.count);      // 0 = comum, 1..n = minério

    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3();

    for (let i = 0; i < this.count; i++) {
      // Distribuição no anel: o raio é sorteado com raiz quadrada para que a
      // densidade por ÁREA seja uniforme. Sortear o raio linearmente
      // concentraria os asteroides na borda interna, porque anéis externos
      // têm mais área.
      const t = Math.sqrt(rng());
      const r = spec.innerRadius + t * (spec.outerRadius - spec.innerRadius);
      const ang = rng() * Math.PI * 2;
      // A espessura vertical usa duas amostras somadas (aproximação de
      // gaussiana): concentra no plano do cinturão e rarefaz nas bordas,
      // como um disco de verdade.
      const h = (rng() + rng() - 1) * spec.thickness;

      const i3 = i * 3;
      this.positions[i3] = spec.center.x + Math.cos(ang) * r;
      this.positions[i3 + 1] = spec.center.y + h;
      this.positions[i3 + 2] = spec.center.z + Math.sin(ang) * r;

      // Tamanhos: `rng()^3` dá muitos pequenos e poucos grandes, que é a
      // distribuição real de corpos por fragmentação — e visualmente mais
      // interessante que tamanhos uniformes.
      const sizeRoll = Math.pow(rng(), 3);
      const scale = A.minSize + sizeRoll * (A.maxSize - A.minSize);
      this.scales[i] = scale;
      this.radii[i] = scale * 1.15;   // raio de colisão, um pouco generoso
      this.hp[i] = A.baseHp * scale;

      axis.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      const i4 = i * 4;
      this.spins[i4] = axis.x; this.spins[i4 + 1] = axis.y; this.spins[i4 + 2] = axis.z;
      this.spins[i4 + 3] = (rng() - 0.5) * A.maxSpin;

      q.setFromAxisAngle(axis, rng() * Math.PI * 2);
      this.quats[i4] = q.x; this.quats[i4 + 1] = q.y;
      this.quats[i4 + 2] = q.z; this.quats[i4 + 3] = q.w;

      // Minério: uma fração dos asteroides carrega recurso. A raridade é o
      // que dá sentido a procurar em vez de atirar no primeiro que aparece.
      this.resource[i] = rng() < A.resourceChance ? 1 + Math.floor(rng() * 3) : 0;
    }

    // ── Malhas de LOD ─────────────────────────────────────────────────────
    // São TRÊS níveis, definidos por DOIS limiares de distância
    // (`lodDistances`). Derivar o número de níveis do array de limiares
    // criaria só dois — e a seleção abaixo, que vai até o nível 2, quebraria.
    this.lods = [0, 1, 2].map((level) => {
      const geo = makeAsteroidGeometry(level, mix(hashString(spec.seed), level));
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8d8478,
        roughness: 0.92,
        metalness: 0.06,
        flatShading: true,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, this.count);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.layers.set(LAYER_NEAR);
      scene.add(mesh);
      return { mesh, geo, mat };
    });

    // Asteroides com minério ganham uma malha própria, emissiva — é o sinal
    // visual que transforma "atirar em pedra" numa decisão.
    const oreGeo = makeAsteroidGeometry(1, 777);
    // Emissivo CONTIDO. Com intensidade alta o minério vira um borrão chapado
    // e a forma da rocha some — ele precisa brilhar o bastante pra ser
    // notado de longe, e pouco o bastante pra ainda parecer uma pedra.
    this.oreMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c4238, emissive: 0x1f8f68, emissiveIntensity: 0.55,
      roughness: 0.75, flatShading: true,
    });
    this.oreMesh = new THREE.InstancedMesh(oreGeo, this.oreMaterial, this.count);
    this.oreMesh.count = 0;
    this.oreMesh.frustumCulled = false;
    this.oreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.oreMesh.layers.set(LAYER_NEAR);
    scene.add(this.oreMesh);
    this.oreGeo = oreGeo;

    // ── Índice espacial ───────────────────────────────────────────────────
    // Célula do tamanho do maior asteroide × 2: grande o bastante pra que um
    // objeto raramente ocupe muitas células, pequena o bastante pra que cada
    // célula tenha poucos ocupantes.
    this.hash = new SpatialHash(A.maxSize * 2.5);
    this.rebuildIndex();

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._spinQ = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._scl = new THREE.Vector3();
    this.visibleCount = 0;
  }

  rebuildIndex() {
    this.hash.clear(this.count);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      this.hash.insert(i, this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2], this.radii[i]);
    }
  }

  /** @param {THREE.Vector3} cameraPos @param {number} dt */
  update(cameraPos, dt) {
    const A = CONFIG.asteroids;
    const d = A.lodDistances;
    const viewDist2 = A.viewDistance * A.viewDistance;

    const counts = [0, 0, 0];
    let oreCount = 0;

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const i3 = i * 3, i4 = i * 4;
      const dx = this.positions[i3] - cameraPos.x;
      const dy = this.positions[i3 + 1] - cameraPos.y;
      const dz = this.positions[i3 + 2] - cameraPos.z;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 > viewDist2) continue;   // culling por distância

      // Rotação própria. Compor um quaternion de giro por frame é mais barato
      // que reconstruir a orientação a partir de um ângulo acumulado, e não
      // acumula erro perceptível em rochas.
      const spinRate = this.spins[i4 + 3];
      if (spinRate !== 0) {
        this._axis.set(this.spins[i4], this.spins[i4 + 1], this.spins[i4 + 2]);
        this._spinQ.setFromAxisAngle(this._axis, spinRate * dt);
        this._q.set(this.quats[i4], this.quats[i4 + 1], this.quats[i4 + 2], this.quats[i4 + 3]);
        this._q.multiply(this._spinQ).normalize();
        this.quats[i4] = this._q.x; this.quats[i4 + 1] = this._q.y;
        this.quats[i4 + 2] = this._q.z; this.quats[i4 + 3] = this._q.w;
      } else {
        this._q.set(this.quats[i4], this.quats[i4 + 1], this.quats[i4 + 2], this.quats[i4 + 3]);
      }

      this._pos.set(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);
      this._scl.setScalar(this.scales[i]);
      this._m.compose(this._pos, this._q, this._scl);

      if (this.resource[i] > 0) {
        if (oreCount < this.count) this.oreMesh.setMatrixAt(oreCount++, this._m);
        continue;
      }

      // Seleção de LOD. Comparamos distâncias ao QUADRADO pra evitar a raiz
      // quadrada — num laço que roda milhares de vezes por frame isso importa.
      const dist = Math.sqrt(dist2);
      let level = 2;
      if (dist < d[0]) level = 0;
      else if (dist < d[1]) level = 1;
      this.lods[level].mesh.setMatrixAt(counts[level]++, this._m);
    }

    for (let l = 0; l < 3; l++) {
      this.lods[l].mesh.count = counts[l];
      if (counts[l] > 0) this.lods[l].mesh.instanceMatrix.needsUpdate = true;
    }
    this.oreMesh.count = oreCount;
    if (oreCount > 0) this.oreMesh.instanceMatrix.needsUpdate = true;

    this.visibleCount = counts[0] + counts[1] + counts[2] + oreCount;
  }

  /**
   * Colisão de uma esfera contra o campo.
   * @returns {number} índice do asteroide atingido, ou -1
   */
  querySphere(x, y, z, radius) {
    const candidates = this.hash.query(x, y, z, radius);
    for (let k = 0; k < candidates.length; k++) {
      const i = candidates[k];
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      const dx = this.positions[i3] - x;
      const dy = this.positions[i3 + 1] - y;
      const dz = this.positions[i3 + 2] - z;
      const rr = this.radii[i] + radius;
      if (dx * dx + dy * dy + dz * dz <= rr * rr) return i;
    }
    return -1;
  }

  /** Colisão de um segmento (projétil) contra o campo. @returns {number} */
  querySegment(ax, ay, az, bx, by, bz) {
    const candidates = this.hash.querySegment(ax, ay, az, bx, by, bz, 0);
    let bestIdx = -1;
    let bestT = Infinity;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const segLen2 = dx * dx + dy * dy + dz * dz;

    for (let k = 0; k < candidates.length; k++) {
      const i = candidates[k];
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      const cx = this.positions[i3] - ax;
      const cy = this.positions[i3 + 1] - ay;
      const cz = this.positions[i3 + 2] - az;
      let t = segLen2 > 1e-9 ? (cx * dx + cy * dy + cz * dz) / segLen2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = cx - dx * t, py = cy - dy * t, pz = cz - dz * t;
      const r = this.radii[i];
      if (px * px + py * py + pz * pz > r * r) continue;
      // O primeiro acerto ao longo do trajeto é o que vale — atravessar o
      // asteroide da frente pra acertar o de trás seria errado.
      if (t < bestT) { bestT = t; bestIdx = i; }
    }
    return bestIdx;
  }

  /** Aplica dano. @returns {{destroyed: boolean, resource: number}} */
  damage(index, amount) {
    this.hp[index] -= amount;
    if (this.hp[index] > 0) return { destroyed: false, resource: 0 };
    this.alive[index] = 0;
    // Índice reconstruído sob demanda: destruir asteroides é raro o bastante
    // pra não valer uma remoção incremental (que exigiria guardar em quais
    // células cada objeto foi inserido).
    this._indexDirty = true;
    return { destroyed: true, resource: this.resource[index] };
  }

  getPosition(index, out) {
    const i3 = index * 3;
    return out.set(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);
  }
  getRadius(index) { return this.radii[index]; }
  getScale(index) { return this.scales[index]; }

  /** Chamado uma vez por frame, depois das colisões. */
  flushIndex() {
    if (!this._indexDirty) return;
    this._indexDirty = false;
    this.rebuildIndex();
  }

  dispose() {
    for (const l of this.lods) {
      this.scene.remove(l.mesh);
      l.mesh.dispose(); l.geo.dispose(); l.mat.dispose();
    }
    this.scene.remove(this.oreMesh);
    this.oreMesh.dispose(); this.oreGeo.dispose(); this.oreMaterial.dispose();
  }
}

/**
 * Gera a malha de um asteroide num nível de detalhe.
 *
 * Parte de um icosaedro (subdividido conforme o LOD) e desloca cada vértice
 * ao longo da própria normal por um ruído. Icosaedro em vez de esfera UV
 * porque ele tem triângulos de tamanho uniforme — numa esfera UV os polos
 * acumulam vértices que não contribuem com nada e o deslocamento fica
 * visivelmente mais denso lá.
 */
function makeAsteroidGeometry(level, seed) {
  const detail = [2, 1, 0][level];
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const rng = createRng(seed);

  // Alguns eixos de deformação sorteados: em vez de ruído 3D (caro e sem
  // necessidade aqui), somamos senóides ao longo de eixos aleatórios. Dá
  // formas irregulares convincentes com pouquíssimo código.
  const axes = [];
  for (let a = 0; a < 4; a++) {
    axes.push({
      v: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
      freq: 1.6 + rng() * 3.4,
      amp: 0.1 + rng() * 0.2,
      phase: rng() * Math.PI * 2,
    });
  }

  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let d = 1;
    for (const a of axes) d += Math.sin(v.dot(a.v) * a.freq + a.phase) * a.amp;
    // Achatamento leve: asteroides raramente são esféricos.
    v.multiplyScalar(d);
    v.y *= 0.82;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
