import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Pool } from '../core/Pool.js';

/**
 * Sistema de projéteis.
 *
 * ═══ INSTANCED RENDERING ═══
 *
 * 300 projéteis em tela como 300 Mesh separados = 300 draw calls. Cada draw
 * call tem custo fixo de CPU (validação de estado, upload de uniforms) que
 * independe de quantos triângulos ela desenha. 300 draw calls de 2 triângulos
 * cada custa MUITO mais que 1 draw call de 600 triângulos.
 *
 * `InstancedMesh` resolve isso: uma geometria, um material, N matrizes de
 * transformação num buffer. A GPU desenha as N cópias numa chamada só.
 *
 * O truque de sempre com InstancedMesh: `count` controla quantas instâncias
 * são desenhadas, e elas são sempre as PRIMEIRAS do buffer. Como o pool
 * libera slots no meio, reescrevemos as matrizes compactadas todo frame —
 * ou seja, o índice no pool não é o índice de instância.
 *
 * ═══ POR QUE PROJÉTIL E NÃO HITSCAN ═══
 *
 * Hitscan resolve o acerto no instante do disparo. Isso elimina a liderança de
 * alvo, que é a habilidade central de um jogo de caça, e mata o feedback de
 * "errei por pouco" — que é o que ensina o jogador a mirar.
 */
export class Projectiles {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const W = CONFIG.weapons;

    this.pool = new Pool(
      W.maxProjectiles,
      () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        prevPosition: new THREE.Vector3(),
        life: 0,
        damage: 0,
        faction: 0,       // 0 = jogador, 1 = inimigo
        __poolIndex: -1,
      }),
      (p) => { p.life = 0; },
    );

    // Geometria: um plano fino alongado em Z. Não é um cilindro — a espessura
    // real de um traço de energia nunca é percebida, e um plano custa 2
    // triângulos contra 32 de um cilindro.
    const geo = new THREE.PlaneGeometry(W.projectileWidth, W.projectileLength);
    geo.rotateX(Math.PI / 2);   // deita o comprimento no eixo Z

    // Dois materiais (cores diferentes por facção) exigiriam dois InstancedMesh.
    // Fazemos isso mesmo: separar por facção também deixa a colisão mais
    // simples e evita um atributo de instância só pra cor.
    this.meshes = [];
    this.materials = [];
    for (const key of ['player', 'enemy']) {
      const mat = new THREE.MeshBasicMaterial({
        color: W[key].color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false,   // tiro deve saturar, não ser rebaixado pelo ACES
      });
      const mesh = new THREE.InstancedMesh(geo, mat, W.maxProjectiles);
      mesh.frustumCulled = false;   // as instâncias se movem; a bbox seria inútil
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(mat);
    }
    this.geometry = geo;

    // Scratch sem alocação por frame.
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 0, 1);
    this._tmp = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._aim = new THREE.Vector3();
  }

  get activeCount() { return this.pool.activeCount; }

  /**
   * Dispara uma salva a partir de uma nave.
   * @param {THREE.Vector3} origin posição da nave
   * @param {THREE.Quaternion} orientation
   * @param {THREE.Vector3} inheritVelocity velocidade da nave (soma no tiro)
   * @param {'player'|'enemy'} kind
   * @param {number} faction
   * @param {THREE.Vector3} [aimPoint] ponto de convergência; se ausente, usa
   *        a distância de convergência do config ao longo do nariz
   */
  fire(origin, orientation, inheritVelocity, kind, faction, aimPoint) {
    const W = CONFIG.weapons[kind];

    // Ponto de convergência: sem ele, canhões nas pontas das asas disparam
    // dois feixes paralelos que nunca acertam o mesmo alvo. Convergir num
    // ponto à frente é como caças reais são regulados.
    if (aimPoint) {
      this._aim.copy(aimPoint);
    } else {
      this._aim.set(0, 0, -W.convergence).applyQuaternion(orientation).add(origin);
    }

    for (const m of W.muzzles) {
      const p = this.pool.acquireForced();
      this._muzzle.set(m[0], m[1], m[2]).applyQuaternion(orientation).add(origin);
      p.position.copy(this._muzzle);
      p.prevPosition.copy(this._muzzle);

      this._dir.copy(this._aim).sub(this._muzzle).normalize();
      // Dispersão: pequeno desvio aleatório. Sem nenhuma dispersão, uma
      // rajada acerta sempre o mesmo pixel e o combate fica clínico demais.
      if (W.spread > 0) {
        this._dir.x += (Math.random() - 0.5) * W.spread * 2;
        this._dir.y += (Math.random() - 0.5) * W.spread * 2;
        this._dir.z += (Math.random() - 0.5) * W.spread * 2;
        this._dir.normalize();
      }

      // A velocidade da nave SOMA na do projétil. Sem isso, voando pra frente
      // rápido a nave alcança o próprio tiro — o que além de errado, permite
      // ao jogador se acertar.
      p.velocity.copy(this._dir).multiplyScalar(W.projectileSpeed).add(inheritVelocity);
      p.life = W.life;
      p.damage = W.damage;
      p.faction = faction;
    }
  }

  /** @param {number} dt */
  update(dt) {
    this.pool.forEachActive((p) => {
      p.prevPosition.copy(p.position);
      p.position.addScaledVector(p.velocity, dt);
      p.life -= dt;
      if (p.life <= 0) this.pool.release(p);
    });
    this._writeInstances();
  }

  /** Reescreve as matrizes de instância, compactadas por facção. */
  _writeInstances() {
    const counts = [0, 0];
    this.pool.forEachActive((p) => {
      const mesh = this.meshes[p.faction];
      const i = counts[p.faction]++;
      if (i >= mesh.instanceMatrix.count) return;

      // Orienta o traço ao longo da própria velocidade. `setFromUnitVectors`
      // acha a rotação mínima entre dois vetores unitários — exatamente o que
      // precisamos, e sem passar por ângulos de Euler.
      this._dir.copy(p.velocity).normalize();
      this._q.setFromUnitVectors(this._up, this._dir);
      this._m.compose(p.position, this._q, this._scale);
      mesh.setMatrixAt(i, this._m);
    });

    for (let f = 0; f < 2; f++) {
      this.meshes[f].count = counts[f];
      // `needsUpdate` só quando há o que enviar: subir um buffer vazio pra GPU
      // todo frame é desperdício puro.
      if (counts[f] > 0) this.meshes[f].instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Testa todos os projéteis contra uma esfera e reporta os acertos.
   *
   * ⚠ Usa varredura de SEGMENTO, não teste de ponto. A 900 u/s um projétil
   * anda 15 unidades por frame a 60fps — mais que o raio de uma nave. Testar
   * só a posição atual faria o tiro ATRAVESSAR o alvo sem acertar sempre que
   * o frame caísse. É o clássico "tunelamento", e ele aparece justamente
   * quando o jogo está engasgando, ou seja, no pior momento possível.
   *
   * @param {THREE.Vector3} center
   * @param {number} radius
   * @param {number} excludeFaction projéteis dessa facção são ignorados
   * @param {(damage: number, hitPoint: THREE.Vector3) => void} onHit
   */
  collideSphere(center, radius, excludeFaction, onHit) {
    const r2 = radius * radius;
    this.pool.forEachActive((p) => {
      if (p.faction === excludeFaction) return;

      // Distância mínima do segmento [prev → atual] ao centro da esfera.
      const ax = p.prevPosition.x, ay = p.prevPosition.y, az = p.prevPosition.z;
      const bx = p.position.x - ax, by = p.position.y - ay, bz = p.position.z - az;
      const cx = center.x - ax, cy = center.y - ay, cz = center.z - az;
      const segLen2 = bx * bx + by * by + bz * bz;
      // t = projeção do centro sobre o segmento, limitada a [0,1] para que o
      // ponto mais próximo caia dentro do trecho percorrido neste frame.
      let t = segLen2 > 1e-9 ? (cx * bx + cy * by + cz * bz) / segLen2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = cx - bx * t, dy = cy - by * t, dz = cz - bz * t;
      if (dx * dx + dy * dy + dz * dz > r2) return;

      this._tmp.set(ax + bx * t, ay + by * t, az + bz * t);
      onHit(p.damage, this._tmp);
      this.pool.release(p);
    });
  }

  clear() {
    this.pool.releaseAll();
    for (const m of this.meshes) m.count = 0;
  }

  dispose() {
    for (const m of this.meshes) { this.scene.remove(m); m.dispose(); }
    for (const m of this.materials) m.dispose();
    this.geometry.dispose();
  }
}
