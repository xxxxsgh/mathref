import * as THREE from 'three';
import { mergeGeometries } from './Props.js';

/**
 * Pontos de interesse: marcos visíveis de longe, cada um com um desafio curto.
 *
 * Todos os desafios usam UMA mecânica só — tocar checkpoints numa ordem dentro
 * de um tempo. O que muda é ONDE os checkpoints estão, e é a geometria do marco
 * que transforma isso em coisas diferentes: um checkpoint debaixo do arco vira
 * "passe por baixo da ponte", três descendo o poço viram "entre na mina". Cinco
 * desafios distintos sem cinco sistemas distintos.
 */

const ACCENT = 0x35e0c8;

export const POI_DEFS = [
  {
    id: 'torre',
    name: 'Torre de observação',
    challenge: 'Suba a torre por fora e desça pelo meio',
    x: 340,
    z: -420,
    timeLimit: 26,
    reward: 260,
    build: () => tower(46),
    // Sobe por fora, cruza o topo e desce pelo eixo central.
    checkpoints: [
      { x: 14, y: 10, z: 0 },
      { x: 0, y: 48, z: 0 },
      { x: 0, y: 22, z: 0 },
      { x: 0, y: 4, z: 12 },
    ],
  },
  {
    id: 'ponte',
    name: 'Ponte velha',
    challenge: 'Passe por baixo do vão, ida e volta',
    x: -260,
    z: -330,
    timeLimit: 22,
    reward: 240,
    build: () => bridge(),
    checkpoints: [
      { x: -34, y: 6, z: 0 },
      { x: 0, y: 5, z: 0 },
      { x: 34, y: 6, z: 0 },
      { x: 0, y: 5, z: 0 },
    ],
  },
  {
    id: 'mina',
    name: 'Mina a céu aberto',
    challenge: 'Desça até o fundo do poço e volte',
    x: -640,
    z: -760,
    timeLimit: 30,
    reward: 300,
    build: () => mine(),
    checkpoints: [
      { x: 0, y: 2, z: 0 },
      { x: 6, y: -16, z: 4 },
      { x: -5, y: -30, z: -3 },
      { x: 0, y: 8, z: 0 },
    ],
  },
  {
    id: 'naufragio',
    name: 'Naufrágio',
    challenge: 'Contorne o casco rente à água',
    x: 1240,
    z: 90,
    timeLimit: 24,
    reward: 320,
    build: () => wreck(),
    checkpoints: [
      { x: 26, y: 3, z: 0 },
      { x: 0, y: 3, z: 20 },
      { x: -26, y: 3, z: 0 },
      { x: 0, y: 12, z: -20 },
    ],
  },
  {
    id: 'antena',
    name: 'Antena de rádio',
    challenge: 'Chegue no topo — e o sinal melhora perto dela',
    x: 620,
    z: 520,
    timeLimit: 28,
    reward: 280,
    // A antena é também um repetidor: perto dela o rádio recupera alcance.
    repeater: 520,
    build: () => antenna(72),
    checkpoints: [
      { x: 10, y: 18, z: 0 },
      { x: -8, y: 44, z: 6 },
      { x: 0, y: 74, z: 0 },
    ],
  },
];

// ── Geometria dos marcos ────────────────────────────────────────────────
function tower(height) {
  const parts = [];
  const legs = 4;
  for (let i = 0; i < legs; i++) {
    const angle = (i / legs) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.BoxGeometry(0.7, height, 0.7);
    leg.translate(Math.cos(angle) * 5, height / 2, Math.sin(angle) * 5);
    parts.push(leg);
  }
  for (let h = 8; h < height; h += 10) {
    const ring = new THREE.TorusGeometry(7, 0.32, 4, 4);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, h, 0);
    parts.push(ring);
  }
  const deck = new THREE.CylinderGeometry(8.5, 8.5, 1.2, 8);
  deck.translate(0, height, 0);
  parts.push(deck);
  return mergeGeometries(parts);
}

function bridge() {
  const parts = [];
  const deck = new THREE.BoxGeometry(96, 1.8, 9);
  deck.translate(0, 13, 0);
  parts.push(deck);
  for (const x of [-34, 34]) {
    const pillar = new THREE.BoxGeometry(5, 26, 7);
    pillar.translate(x, 0, 0);
    parts.push(pillar);
  }
  // Arco: aros achatados sob o tabuleiro dão o vão por onde se passa.
  for (const x of [-17, 17]) {
    const arch = new THREE.TorusGeometry(15, 0.9, 5, 10, Math.PI);
    arch.rotateY(Math.PI / 2);
    arch.translate(x, 0, 0);
    parts.push(arch);
  }
  return mergeGeometries(parts);
}

function mine() {
  const parts = [];
  // Terraços descendo: um cone invertido em degraus.
  for (let i = 0; i < 5; i++) {
    const r = 46 - i * 8;
    const ring = new THREE.CylinderGeometry(r, r - 6, 3, 12, 1, true);
    ring.translate(0, -i * 8 - 2, 0);
    parts.push(ring);
  }
  return mergeGeometries(parts);
}

function wreck() {
  const parts = [];
  const hull = new THREE.CylinderGeometry(7, 4.5, 54, 8, 1, false);
  hull.rotateZ(Math.PI / 2);
  hull.rotateY(0.25);
  hull.translate(0, 4, 0);
  parts.push(hull);
  const mast = new THREE.CylinderGeometry(0.5, 0.8, 26, 5);
  mast.translate(4, 16, 2);
  parts.push(mast);
  const deck = new THREE.BoxGeometry(16, 5, 9);
  deck.translate(-9, 8, 0);
  parts.push(deck);
  return mergeGeometries(parts);
}

function antenna(height) {
  const parts = [];
  const mast = new THREE.CylinderGeometry(0.5, 2.2, height, 6);
  mast.translate(0, height / 2, 0);
  parts.push(mast);
  for (const h of [height * 0.45, height * 0.7, height * 0.92]) {
    const bar = new THREE.BoxGeometry(14, 0.4, 0.4);
    bar.translate(0, h, 0);
    parts.push(bar);
  }
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const guy = new THREE.CylinderGeometry(0.1, 0.1, height * 1.05, 3);
    guy.rotateZ(0.28);
    guy.rotateY(angle);
    guy.translate(0, height * 0.45, 0);
    parts.push(guy);
  }
  return mergeGeometries(parts);
}

/**
 * Gerencia os marcos: construção, descoberta e o desafio de cada um.
 */
export class POIs {
  constructor(scene, terrain, save, onEvent) {
    this.scene = scene;
    this.terrain = terrain;
    this.save = save;
    this.onEvent = onEvent ?? (() => {});

    this.list = [];
    this.active = null; // desafio em andamento

    this.material = new THREE.MeshLambertMaterial({ color: 0x767c85 });
    this.checkpointGeometry = new THREE.SphereGeometry(3.4, 12, 8);
    this.checkpointMaterial = new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });

    this._build();
  }

  _build() {
    const found = new Set(this.save.progress.poisFound);

    for (const def of POI_DEFS) {
      const groundY = this.terrain.heightAt(def.x, def.z);
      const origin = new THREE.Vector3(def.x, groundY, def.z);

      const mesh = new THREE.Mesh(def.build(), this.material);
      mesh.position.copy(origin);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.scene.add(mesh);

      const checkpoint = new THREE.Mesh(this.checkpointGeometry, this.checkpointMaterial);
      checkpoint.visible = false;
      this.scene.add(checkpoint);

      this.list.push({
        def,
        origin,
        mesh,
        marker: checkpoint,
        discovered: found.has(def.id),
        done: this.save.progress.missionsDone.includes(`poi:${def.id}`),
      });
    }
  }

  /** Posição absoluta de um checkpoint do desafio. */
  _checkpointPosition(poi, index) {
    const c = poi.def.checkpoints[index];
    return new THREE.Vector3(poi.origin.x + c.x, poi.origin.y + c.y, poi.origin.z + c.z);
  }

  /**
   * @param {THREE.Vector3} position posição do drone
   * @param {number} visibility  alcance de visão atual (bruma/clima reduzem)
   */
  update(dt, position, visibility = 900) {
    for (const poi of this.list) {
      const distance = position.distanceTo(poi.origin);

      // Descoberta por avistamento: entrou no alcance de visão, apareceu no
      // mapa. Não exige tocar no marco — é um ponto de referência, não um item.
      if (!poi.discovered && distance < Math.min(visibility, 520)) {
        poi.discovered = true;
        this.save.progress.poisFound.push(poi.def.id);
        this.save.write();
        this.onEvent('poiFound', { poi });
      }

      // Oferece o desafio ao chegar perto, se não houver outro rolando.
      if (!this.active && poi.discovered && distance < 90) {
        this.onEvent('poiNear', { poi });
      }
    }

    if (this.active) this._updateChallenge(dt, position);
  }

  startChallenge(poi) {
    if (this.active) return false;
    this.active = {
      poi,
      index: 0,
      remaining: poi.def.timeLimit,
      target: this._checkpointPosition(poi, 0),
    };
    poi.marker.position.copy(this.active.target);
    poi.marker.visible = true;
    this.onEvent('challengeStart', { poi });
    return true;
  }

  /** Desafio mais próximo que pode ser iniciado agora. */
  nearestAvailable(position, radius = 90) {
    let best = null;
    let bestDistance = radius;
    for (const poi of this.list) {
      const d = position.distanceTo(poi.origin);
      if (d < bestDistance) {
        best = poi;
        bestDistance = d;
      }
    }
    return best;
  }

  _updateChallenge(dt, position) {
    const run = this.active;
    run.remaining -= dt;

    if (run.remaining <= 0) {
      run.poi.marker.visible = false;
      this.onEvent('challengeFail', { poi: run.poi });
      this.active = null;
      return;
    }

    if (position.distanceTo(run.target) > 4.6) return;

    run.index++;
    if (run.index >= run.poi.def.checkpoints.length) {
      const first = !run.poi.done;
      run.poi.done = true;
      if (first) {
        this.save.progress.missionsDone.push(`poi:${run.poi.def.id}`);
        this.save.progress.credits += run.poi.def.reward;
        this.save.write();
      }
      run.poi.marker.visible = false;
      this.onEvent('challengeDone', {
        poi: run.poi,
        reward: first ? run.poi.def.reward : Math.round(run.poi.def.reward * 0.25),
        time: run.poi.def.timeLimit - run.remaining,
      });
      this.active = null;
      return;
    }

    run.target = this._checkpointPosition(run.poi, run.index);
    run.poi.marker.position.copy(run.target);
    this.onEvent('checkpoint', { poi: run.poi, index: run.index });
  }

  cancelChallenge() {
    if (!this.active) return;
    this.active.poi.marker.visible = false;
    this.active = null;
  }

  /** Repetidores de rádio conhecidos (a antena é um). */
  get repeaters() {
    return this.list
      .filter((poi) => poi.def.repeater && poi.discovered)
      .map((poi) => ({ position: poi.origin, range: poi.def.repeater }));
  }

  get discovered() {
    return this.list.filter((poi) => poi.discovered);
  }

  hudState(position) {
    if (!this.active) return null;
    return {
      name: this.active.poi.def.name,
      challenge: this.active.poi.def.challenge,
      index: this.active.index,
      total: this.active.poi.def.checkpoints.length,
      remaining: this.active.remaining,
      distance: position.distanceTo(this.active.target),
      target: this.active.target,
    };
  }

  dispose() {
    for (const poi of this.list) {
      this.scene.remove(poi.mesh);
      this.scene.remove(poi.marker);
      poi.mesh.geometry.dispose();
    }
    this.material.dispose();
    this.checkpointGeometry.dispose();
    this.checkpointMaterial.dispose();
  }
}
