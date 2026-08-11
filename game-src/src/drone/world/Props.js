import * as THREE from 'three';
import { DCFG } from '../config.js';
import { createRng, rngHelpers } from '../../procgen/rng.js';

/**
 * Obstáculos: árvores, rochas e torres.
 *
 * ═══ POR QUE ISTO É O JOGO, E NÃO CENÁRIO ═══
 *
 * Um campo vazio não tem velocidade. Voar a 100 km/h num descampado parece
 * voar a 20 — sem nada perto, não há referência de movimento. As árvores
 * existem para serem raspadas: é a proximidade delas que produz a sensação
 * de velocidade, e é a possibilidade de bater nelas que faz raspar valer
 * alguma coisa.
 *
 * ═══ MALHAS INSTANCIADAS ═══
 *
 * 620 árvores como objetos separados são 1860 draw calls (tronco + duas
 * copas) e um travamento garantido no iPad. Como `InstancedMesh`, são 3.
 * O custo é que todas compartilham o mesmo material — daí a variação vir de
 * escala, rotação e cor por instância, e não de materiais diferentes.
 *
 * ═══ COLISÃO POR GRADE ═══
 *
 * Testar o drone contra 870 obstáculos por frame é desperdício óbvio. Uma
 * grade uniforme reduz para os poucos que estão na célula vizinha. Grade
 * uniforme (e não octree/BVH) porque os props são estáticos, estão
 * espalhados de forma razoavelmente homogênea, e o custo de manutenção de
 * uma estrutura hierárquica não se pagaria.
 */

const CELL = 24;   // metros; ~ o dobro da maior copa

export class Props {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./Terrain.js').Terrain} terrain
   * @param {Array<{x:number,z:number,r:number}>} exclusions áreas proibidas
   *   (os gates do circuito). Uma árvore dentro de um gate é um acidente que
   *   o jogador não tem como prever nem como evitar — e o gate é justamente
   *   o lugar do mapa onde ele NÃO pode desviar.
   */
  constructor(scene, terrain, exclusions = []) {
    this.terrain = terrain;
    this.exclusions = exclusions;
    const P = DCFG.props;
    const r = rngHelpers(createRng(DCFG.world.seed + '-props'));

    /** @type {Array<{x:number,z:number,y0:number,y1:number,r:number}>} */
    this.colliders = [];
    /** @type {Map<number, number[]>} célula → índices em `colliders` */
    this.grid = new Map();

    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);

    this._buildTrees(r, P.trees);
    this._buildRocks(r, P.rocks);
    this._buildTowers(r, P.towers);
    this._buildPad();

    for (let i = 0; i < this.colliders.length; i++) this._index(i);
  }

  /** Ponto válido para um obstáculo: dentro do campo, fora da água, fora da
   *  clareira de decolagem e não numa parede vertical. */
  _spot(r, margin = 120) {
    const half = this.terrain.half - margin;
    for (let tries = 0; tries < 24; tries++) {
      const x = r.range(-half, half);
      const z = r.range(-half, half);
      if (Math.hypot(x, z) < DCFG.props.clearRadius) continue;
      if (this._excluded(x, z)) continue;
      if (this.terrain.isWater(x, z)) continue;
      const y = this.terrain.heightAt(x, z);
      if (y < DCFG.terrain.waterLevel + 1.5) continue;
      // Nada cresce numa parede. `normalAt().y` é o cosseno da inclinação.
      const n = this.terrain.normalAt(x, z, this._n ??= new THREE.Vector3());
      if (n.y < 0.80) continue;
      return { x, y, z };
    }
    return null;
  }

  _excluded(x, z) {
    for (const e of this.exclusions) {
      const dx = x - e.x, dz = z - e.z;
      if (dx * dx + dz * dz < e.r * e.r) return true;
    }
    return false;
  }

  _addCollider(x, z, y0, y1, radius) {
    this.colliders.push({ x, z, y0, y1, r: radius });
  }

  _index(i) {
    const c = this.colliders[i];
    // Um prop pode tocar até quatro células; indexar só a do centro deixaria
    // buracos de colisão exatamente nas bordas das células.
    const i0 = Math.floor((c.x - c.r) / CELL), i1 = Math.floor((c.x + c.r) / CELL);
    const j0 = Math.floor((c.z - c.r) / CELL), j1 = Math.floor((c.z + c.r) / CELL);
    for (let jj = j0; jj <= j1; jj++) {
      for (let ii = i0; ii <= i1; ii++) {
        const key = ii * 73856093 ^ jj * 19349663;
        let arr = this.grid.get(key);
        if (!arr) { arr = []; this.grid.set(key, arr); }
        arr.push(i);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  _buildTrees(r, count) {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.30, 1, 5);
    trunkGeo.translate(0, 0.5, 0);   // pivô na base: escalar cresce pra cima
    const canopyGeo = new THREE.ConeGeometry(1, 1, 7);
    canopyGeo.translate(0, 0.5, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b452f, roughness: 0.95 });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.88, vertexColors: false,
    });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    // Duas copas por árvore: uma larga embaixo e uma estreita em cima. Duas
    // instâncias custam quase nada e a silhueta deixa de ser "um cone".
    const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, count * 2);
    canopy.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(count * 2 * 3), 3,
    );

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    let n = 0;
    for (let i = 0; i < count; i++) {
      const s = this._spot(r);
      if (!s) continue;
      const h = r.range(5.5, 13.5);
      const w = h * r.range(0.20, 0.30);

      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.range(0, Math.PI * 2));
      pos.set(s.x, s.y, s.z);

      trunks.setMatrixAt(n, m.compose(pos, q, scl.set(1, h * 0.45, 1)));

      pos.y = s.y + h * 0.28;
      canopy.setMatrixAt(n * 2, m.compose(pos, q, scl.set(w, h * 0.55, w)));
      pos.y = s.y + h * 0.58;
      canopy.setMatrixAt(n * 2 + 1, m.compose(pos, q, scl.set(w * 0.72, h * 0.46, w * 0.72)));

      // Variação de verde por árvore. Uma mata de uma cor só lê como grama
      // vertical; a variação é o que faz parecer floresta.
      col.setHSL(r.range(0.22, 0.30), r.range(0.32, 0.52), r.range(0.17, 0.30));
      canopy.setColorAt(n * 2, col);
      col.offsetHSL(0, 0, 0.04);
      canopy.setColorAt(n * 2 + 1, col);

      this._addCollider(s.x, s.z, s.y, s.y + h * 0.95, DCFG.props.treeHitRadius);
      n++;
    }
    trunks.count = n;
    canopy.count = n * 2;
    trunks.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    trunks.castShadow = canopy.castShadow = true;
    // `frustumCulled` fica ligado: a caixa envolvente do InstancedMesh cobre
    // o mapa inteiro, então na prática nunca é descartado — mas desligar
    // custaria o teste em toda a hierarquia por nada.
    this.group.add(trunks, canopy);
    this.trees = { trunks, canopy };
  }

  _buildRocks(r, count) {
    // Icosaedro com subdivisão 0: 20 triângulos. Deformado por instância
    // via escala não-uniforme, que já basta para nenhuma pedra parecer
    // igual à outra sem gerar geometria nova.
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8d8880, roughness: 1.0, flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    let n = 0;
    for (let i = 0; i < count; i++) {
      const s = this._spot(r, 90);
      if (!s) continue;
      const size = r.range(0.8, 4.2);
      e.set(r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28));
      q.setFromEuler(e);
      // Enterrada até metade: uma pedra pousada na superfície parece adesivo.
      pos.set(s.x, s.y - size * 0.35, s.z);
      scl.set(size * r.range(0.8, 1.4), size * r.range(0.6, 1.0), size * r.range(0.8, 1.4));
      mesh.setMatrixAt(n, m.compose(pos, q, scl));
      const g = r.range(0.34, 0.62);
      col.setRGB(g, g * 0.97, g * 0.9);
      mesh.setColorAt(n, col);

      if (size > 1.6) {
        this._addCollider(s.x, s.z, s.y - size, s.y + size * 0.6,
                          size * DCFG.props.rockHitScale);
      }
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    this.rocks = mesh;
  }

  /**
   * Torres de treliça.
   *
   * Poucas e altas de propósito: elas são os PONTOS DE REFERÊNCIA do mapa.
   * Voando em FPV a 3 metros do chão, o piloto não vê o horizonte nem tem
   * mapa — ele se localiza por silhuetas altas. Sem elas, o mapa inteiro é
   * "grama e árvores" e ninguém sabe para onde está indo.
   */
  _buildTowers(r, count) {
    const legGeo = new THREE.BoxGeometry(0.35, 1, 0.35);
    legGeo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb9b3a6, roughness: 0.7, metalness: 0.35,
    });
    const legs = new THREE.InstancedMesh(legGeo, mat, count * 4);
    const braceGeo = new THREE.BoxGeometry(1, 0.22, 0.22);
    const braces = new THREE.InstancedMesh(braceGeo, mat, count * 16);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    let li = 0, bi = 0, n = 0;
    for (let i = 0; i < count; i++) {
      const s = this._spot(r, 160);
      if (!s) continue;
      const h = r.range(24, 52);
      const w = r.range(2.2, 3.4);
      const rot = r.range(0, Math.PI * 2);
      q.setFromAxisAngle(yAxis, rot);

      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        pos.set(ox * w, 0, oz * w).applyQuaternion(q).add(new THREE.Vector3(s.x, s.y, s.z));
        legs.setMatrixAt(li++, m.compose(pos, q, scl.set(1, h, 1)));
      }
      // Travessas em quatro níveis. Só nas duas faces visíveis de cada lado:
      // uma treliça completa dobraria as instâncias e ninguém contaria.
      for (let k = 1; k <= 4; k++) {
        const y = s.y + (h * k) / 4.4;
        for (const [dx, dz, rr] of [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]]) {
          pos.set(dx * w, 0, dz * w).applyQuaternion(q);
          pos.set(s.x + pos.x, y, s.z + pos.z);
          const qq = q.clone().multiply(
            new THREE.Quaternion().setFromAxisAngle(yAxis, rr * Math.PI / 2),
          );
          braces.setMatrixAt(bi++, m.compose(pos, qq, scl.set(w * 2, 1, 1)));
        }
      }

      this._addCollider(s.x, s.z, s.y, s.y + h, w * 1.5);
      n++;
    }
    legs.count = li;
    braces.count = bi;
    legs.instanceMatrix.needsUpdate = true;
    braces.instanceMatrix.needsUpdate = true;
    legs.castShadow = braces.castShadow = true;
    this.group.add(legs, braces);
    this.towers = { legs, braces };
    this.towerCount = n;
  }

  /** Plataforma de decolagem: um alvo visual no centro da clareira. Um pad
   *  não é decoração — é a resposta para "onde eu estava mesmo?" depois de
   *  uma volta inteira, e o alvo do retorno automático. */
  _buildPad() {
    const y = this.terrain.heightAt(0, 0);
    const geo = new THREE.CylinderGeometry(4, 4, 0.25, 28);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.8 });
    const pad = new THREE.Mesh(geo, mat);
    pad.position.set(0, y + 0.12, 0);
    pad.receiveShadow = true;

    const ringGeo = new THREE.TorusGeometry(3.1, 0.13, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, y + 0.26, 0);

    this.group.add(pad, ring);
    this.padHeight = y;
  }

  /**
   * Colisão do drone contra os obstáculos.
   *
   * Cilindro vertical, não esfera: uma árvore é um cilindro, e passar POR
   * CIMA dela tem que funcionar — é metade da graça. Uma esfera envolvente
   * bloquearia o espaço acima da copa, onde não há nada.
   */
  hit(pos, radius) {
    const ii = Math.floor(pos.x / CELL), jj = Math.floor(pos.z / CELL);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const key = (ii + di) * 73856093 ^ (jj + dj) * 19349663;
        const arr = this.grid.get(key);
        if (!arr) continue;
        for (const idx of arr) {
          const c = this.colliders[idx];
          if (pos.y < c.y0 || pos.y > c.y1) continue;
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const rr = c.r + radius;
          if (dx * dx + dz * dz < rr * rr) return c;
        }
      }
    }
    return null;
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    });
  }
}
