import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { fbm2D } from './noise.js';
import { clamp, smoothstep } from '../core/MathUtils.js';

/**
 * Terreno em chunks com streaming.
 *
 * Começa em chunks já na Fase 1, mesmo com o mapa pequeno, porque a Fase 3 pede
 * mundo aberto: trocar heightmap único por chunks depois significaria reescrever
 * terreno, colisão e espalhamento de props de uma vez. Em chunks desde o começo,
 * a Fase 3 só mexe no raio de carregamento e no perfil por zona.
 *
 * A função de altura é analítica (`heightAt`), não amostrada de textura. Assim a
 * colisão consulta a MESMA altura que a malha desenha, sem interpolar mapa nem
 * fazer raycast — a fonte da verdade é uma só.
 */

const tmpColor = new THREE.Color();

export class Terrain {
  constructor(scene, quality, { seed = CONFIG.WORLD.seed } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.seed = seed;

    this.chunks = new Map(); // "cx,cz" → { mesh, cx, cz, props: [] }
    this.pending = [];

    /**
     * Perfil do relevo por posição. A Fase 3 troca este hook pelo perfil das
     * zonas; até lá é constante e o terreno é uniforme e suave, como a Fase 1
     * pede ("relevo suave, sem biomas").
     */
    this.profileAt = () => CONFIG.WORLD.terrain;

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });

    /** Callbacks de ciclo de vida — Props e POIs penduram aqui. */
    this.onChunkLoad = null;
    this.onChunkUnload = null;

    this._center = { cx: NaN, cz: NaN };
  }

  /** Altura do terreno em qualquer ponto do mundo. */
  heightAt(x, z) {
    const p = this.profileAt(x, z);
    let h =
      fbm2D(x * p.frequency, z * p.frequency, this.seed, p.octaves, p.lacunarity, p.gain) *
      p.amplitude;

    // Detalhe de alta frequência com amplitude pequena: dá textura de relevo
    // sem transformar o chão em lixa (o que arruinaria a colisão rasante).
    h += fbm2D(x * p.frequency * 7.3, z * p.frequency * 7.3, this.seed + 977, 2, 2.1, 0.5) *
      p.amplitude * 0.07;

    if (p.ridge) h += p.ridge(x, z, this.seed);
    return h;
  }

  /**
   * Normal por diferenças finitas. O passo é metade de um quad: menor que isso
   * amplifica o ruído de alta frequência e a normal fica trêmula.
   */
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = CONFIG.WORLD.chunkSize / CONFIG.WORLD.chunkSegments / 2;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  /** Inclinação do terreno em radianos (0 = plano). */
  slopeAt(x, z, tmp = new THREE.Vector3()) {
    return Math.acos(clamp(this.normalAt(x, z, tmp).y, -1, 1));
  }

  chunkCoordOf(x, z) {
    const s = CONFIG.WORLD.chunkSize;
    return { cx: Math.floor(x / s), cz: Math.floor(z / s) };
  }

  /**
   * Carrega/descarrega chunks em volta da posição.
   * Só recalcula a lista quando o drone TROCA de chunk — a cada frame seria
   * varrer o mapa inteiro 60 vezes por segundo pra descobrir que nada mudou.
   */
  update(position, budget = 2) {
    const radius = this.quality.settings.viewChunks;
    const { cx, cz } = this.chunkCoordOf(position.x, position.z);

    if (cx !== this._center.cx || cz !== this._center.cz) {
      this._center = { cx, cz };
      this._rebuildQueue(cx, cz, radius);
    }

    // Orçamento por frame: gerar 49 chunks de uma vez trava meio segundo.
    let made = 0;
    while (this.pending.length && made < budget) {
      const { cx: x, cz: z } = this.pending.shift();
      if (!this.chunks.has(`${x},${z}`)) {
        this._createChunk(x, z);
        made++;
      }
    }
    return made;
  }

  _rebuildQueue(cx, cz, radius) {
    const wanted = new Set();
    const queue = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Descarte circular: o canto do quadrado está 1,41× mais longe que a
        // borda e nunca aparece antes do fog.
        if (dx * dx + dz * dz > (radius + 0.5) * (radius + 0.5)) continue;
        const key = `${cx + dx},${cz + dz}`;
        wanted.add(key);
        if (!this.chunks.has(key)) {
          queue.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
        }
      }
    }
    // Mais perto primeiro: o buraco embaixo do drone some antes do da borda.
    queue.sort((a, b) => a.d - b.d);
    this.pending = queue;

    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key)) this._destroyChunk(key, chunk);
    }
  }

  _createChunk(cx, cz) {
    const size = CONFIG.WORLD.chunkSize;
    const seg = CONFIG.WORLD.chunkSegments;
    const originX = cx * size;
    const originZ = cz * size;

    const geometry = new THREE.PlaneGeometry(size, size, seg, seg);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const p = this.profileAt(originX + size / 2, originZ + size / 2);

    for (let i = 0; i < pos.count; i++) {
      // O plano nasce centrado na origem; o +size/2 leva o canto pro lugar.
      const wx = pos.getX(i) + originX + size / 2;
      const wz = pos.getZ(i) + originZ + size / 2;
      const h = this.heightAt(wx, wz);
      pos.setY(i, h);
      this._colorAt(wx, wz, h, p, i, colors);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, this.material);
    // Os vértices ficam em coordenada LOCAL (−size/2…+size/2) e só o Y é
    // absoluto; a malha é que carrega o deslocamento até o chunk certo.
    mesh.position.set(originX + size / 2, 0, originZ + size / 2);
    mesh.receiveShadow = this.quality.settings.shadows;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);

    const chunk = { mesh, cx, cz, originX, originZ, size, props: [], colliders: [] };
    this.chunks.set(`${cx},${cz}`, chunk);
    this.onChunkLoad?.(chunk);
    return chunk;
  }

  _colorAt(x, z, h, profile, index, colors) {
    const palette = profile.palette ?? CONFIG.WORLD.palette;
    const slope = Math.abs(this.heightAt(x + 3, z) - this.heightAt(x - 3, z)) / 6;

    // Alto e plano = grama; íngreme = rocha; baixo = areia/lama perto da água.
    const rock = smoothstep(0.35, 0.9, slope);
    const low = 1 - smoothstep(profile.seaLevel, profile.seaLevel + 14, h);

    tmpColor.setHex(palette.grass);
    tmpColor.lerp(tmpColorFrom(palette.sand), low * 0.85);
    tmpColor.lerp(tmpColorFrom(palette.rock), rock);

    // Manchas grandes de variação: sem isso o chão vira uma cor chapada e o
    // drone parece parado quando não há prop por perto.
    const mottle =
      0.86 + 0.14 * (fbm2D(x * 0.021, z * 0.021, this.seed + 4241, 2, 2.0, 0.5) + 1) * 0.5;
    colors[index * 3] = tmpColor.r * mottle;
    colors[index * 3 + 1] = tmpColor.g * mottle;
    colors[index * 3 + 2] = tmpColor.b * mottle;
  }

  _destroyChunk(key, chunk) {
    this.onChunkUnload?.(chunk);
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.chunks.delete(key);
  }

  /** Chunk que contém o ponto, se estiver carregado. */
  chunkAt(x, z) {
    const { cx, cz } = this.chunkCoordOf(x, z);
    return this.chunks.get(`${cx},${cz}`) ?? null;
  }

  /** Chunks num raio, pra consulta de colisão. */
  *chunksNear(x, z, radius = 1) {
    const { cx, cz } = this.chunkCoordOf(x, z);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chunk = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (chunk) yield chunk;
      }
    }
  }

  dispose() {
    for (const [key, chunk] of [...this.chunks]) this._destroyChunk(key, chunk);
    this.material.dispose();
  }
}

// Instância separada pra não sobrescrever `tmpColor` no meio do lerp.
const scratch = new THREE.Color();
function tmpColorFrom(hex) {
  return scratch.setHex(hex);
}
