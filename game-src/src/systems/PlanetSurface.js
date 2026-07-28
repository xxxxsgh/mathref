import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { terrainHeight } from '../procgen/noise.js';
import { LAYER_NEAR } from '../core/Renderer.js';

/**
 * Terreno planetário em chunks.
 *
 * ═══ A GEOMETRIA DOS CHUNKS ═══
 *
 * O erro comum é gerar chunks numa grade plana e "curvá-los" depois. Isso
 * produz costuras e distorção crescente longe do centro.
 *
 * Aqui cada chunk é um pedaço de ESFERA desde o início. O procedimento por
 * vértice é:
 *
 *   1. posição no plano tangente local (u, v em torno do ponto de referência)
 *   2. ponto = centro_esfera + tangente·u + bitangente·v + normal·raio
 *   3. NORMALIZA esse ponto → volta pra superfície da esfera unitária
 *   4. multiplica por (raio + altura(direção))
 *
 * O passo 3 é o que faz a curvatura sair correta de graça: qualquer ponto do
 * plano tangente, normalizado, cai na esfera. Chunks vizinhos compartilham as
 * mesmas direções nas bordas, então a mesma função de altura devolve a mesma
 * altura dos dois lados — sem costura, sem precisar de lógica de emenda.
 *
 * ═══ STREAMING ═══
 *
 * Só existem chunks numa grade em volta do jogador. Quando ele se move mais de
 * um chunk, a grade rola: chunks que saíram são reciclados para as posições
 * que entraram (pool — nunca criamos ou destruímos BufferGeometry em voo).
 *
 * A geração de um chunk é síncrona e leva alguns milissegundos. Para não
 * causar engasgo, no máximo `chunksPerFrame` são reconstruídos por frame; os
 * demais esperam. É por isso que a grade tem uma margem: quando um chunk
 * finalmente aparece, ele já está longe o bastante pra que ninguém veja o
 * "pop".
 */

const CHUNK_STATE = { EMPTY: 0, READY: 1 };

export class PlanetSurface {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.planet = null;
    this.active = false;

    const S = CONFIG.surface;
    this.gridSize = S.gridSize;          // ímpar: há um chunk central
    const total = this.gridSize * this.gridSize;

    this.group = new THREE.Group();
    this.group.layers.set(LAYER_NEAR);
    scene.add(this.group);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d4f8c, roughness: 0.18, metalness: 0.1,
      transparent: true, opacity: 0.86,
    });

    /** @type {Array<{mesh: THREE.Mesh, gx: number, gz: number, state: number}>} */
    this.chunks = [];
    for (let i = 0; i < total; i++) {
      const geo = new THREE.BufferGeometry();
      const n = S.resolution + 1;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
      geo.setIndex(new THREE.BufferAttribute(buildIndices(S.resolution), 1));
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.visible = false;
      mesh.frustumCulled = true;
      mesh.layers.set(LAYER_NEAR);
      this.group.add(mesh);
      this.chunks.push({ mesh, gx: 0, gz: 0, state: CHUNK_STATE.EMPTY });
    }

    /** Fila de chunks a reconstruir. */
    this.rebuildQueue = [];
    this.centerGX = 0;
    this.centerGZ = 0;
    this.hasCenter = false;

    // Base tangente local, fixada ao entrar na superfície. Recalculá-la a cada
    // frame faria a grade girar sob os pés do jogador; ela só é refeita quando
    // ele se afasta muito do ponto de referência original.
    this.origin = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.bitangent = new THREE.Vector3();
    this.normal = new THREE.Vector3();

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.chunkCount = 0;
  }

  /**
   * Aplica a névoa atmosférica.
   *
   * Ela cumpre duas funções, e a segunda é a que importa mais:
   *  1. perspectiva aérea — dá noção de distância e escala no solo;
   *  2. esconde a BORDA da grade de chunks. Sem névoa o terreno acaba numa
   *     linha reta no horizonte, e o streaming fica evidente.
   *
   * `FogExp2` e não `Fog` linear: a queda exponencial não tem um ponto de
   * início visível, então não há uma "parede" de névoa se aproximando.
   *
   * @param {number} density 0..1 — densidade atmosférica do voo planetário
   */
  applyFog(density) {
    if (!this.planet || density < 0.002) {
      if (this.scene.fog) this.scene.fog = null;
      return;
    }
    const color = this._fogColor ??= new THREE.Color();
    color.setHex(this.planet.spec.colors.atmosphere);
    // Escurece a névoa no lado noturno seria o ideal; por ora um fator fixo
    // impede que ela fique mais clara que o céu e "brilhe" sozinha.
    color.multiplyScalar(0.55);

    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(color.getHex(), 0);
    this.scene.fog.color.copy(color);
    // A densidade cresce com o quadrado da atmosfera: quase nada em altitude,
    // espessa ao nível do solo.
    this.scene.fog.density = CONFIG.surface.fogDensityAtGround * density * density;
  }

  /** Entra em modo superfície para um planeta. */
  enter(planet) {
    if (this.planet === planet && this.active) return;
    this.planet = planet;
    this.active = true;
    this.group.visible = true;
    this.hasCenter = false;
    for (const c of this.chunks) { c.state = CHUNK_STATE.EMPTY; c.mesh.visible = false; }
    this.rebuildQueue.length = 0;
  }

  exit() {
    if (this.scene.fog) this.scene.fog = null;
    this.active = false;
    this.planet = null;
    this.group.visible = false;
    for (const c of this.chunks) c.mesh.visible = false;
    this.rebuildQueue.length = 0;
    this.chunkCount = 0;
  }

  /** Amplitude (em unidades) da variação de altura deste planeta. */
  get amplitude() {
    return this.planet ? this.planet.radius * CONFIG.surface.reliefFactor : 0;
  }

  /**
   * Altura do terreno sob uma posição de mundo.
   * Usado pela colisão, pelo pouso e pela HUD de altitude.
   * @param {THREE.Vector3} worldPos
   * @returns {{ ground: number, altitude: number, isWater: boolean, up: THREE.Vector3 }}
   */
  sample(worldPos, upOut) {
    const p = this.planet;
    this._dir.copy(worldPos).sub(p.object.position);
    const dist = this._dir.length();
    this._dir.multiplyScalar(1 / dist);
    const { height, isWater } = terrainHeight(
      this._dir.x, this._dir.y, this._dir.z, p.spec, this.amplitude,
    );
    const ground = p.radius + height;
    if (upOut) upOut.copy(this._dir);
    return { ground, altitude: dist - ground, isWater, up: this._dir };
  }

  /** @param {THREE.Vector3} playerPos @param {number} dt */
  update(playerPos, dt) {
    if (!this.active || !this.planet) return;
    const S = CONFIG.surface;
    const p = this.planet;

    this._dir.copy(playerPos).sub(p.object.position).normalize();

    // ── Base tangente ─────────────────────────────────────────────────────
    // Refeita só quando o jogador se afasta bastante do ponto de referência.
    // Como a grade é definida NESSA base, recalculá-la todo frame faria os
    // chunks se reindexarem e reconstruírem sem parar.
    if (!this.hasCenter || this._dir.dot(this.normal) < S.baseRefreshCos) {
      this.normal.copy(this._dir);
      // Tangente arbitrária mas estável: produto vetorial com o eixo do mundo
      // menos alinhado à normal, pra evitar o caso degenerado nos polos.
      this._tmp.set(0, 1, 0);
      if (Math.abs(this.normal.y) > 0.95) this._tmp.set(1, 0, 0);
      this.tangent.copy(this._tmp).cross(this.normal).normalize();
      this.bitangent.copy(this.normal).cross(this.tangent).normalize();
      this.origin.copy(p.object.position).addScaledVector(this.normal, p.radius);
      this.hasCenter = true;
      // Invalida tudo: a grade mudou de referencial.
      for (const c of this.chunks) c.state = CHUNK_STATE.EMPTY;
      this.centerGX = NaN;
    }

    // ── Coordenadas de grade do jogador ───────────────────────────────────
    this._tmp.copy(playerPos).sub(this.origin);
    const u = this._tmp.dot(this.tangent);
    const v = this._tmp.dot(this.bitangent);
    const gx = Math.round(u / S.chunkSize);
    const gz = Math.round(v / S.chunkSize);

    if (gx !== this.centerGX || gz !== this.centerGZ) {
      this.centerGX = gx;
      this.centerGZ = gz;
      this._reindex();
    }

    // ── Reconstrução limitada por frame ───────────────────────────────────
    // Gerar um chunk custa alguns milissegundos. Fazer todos de uma vez
    // causaria um engasgo de 100ms+ exatamente no momento da descida.
    let budget = S.chunksPerFrame;
    while (budget > 0 && this.rebuildQueue.length > 0) {
      const chunk = this.rebuildQueue.shift();
      this._buildChunk(chunk);
      budget--;
    }

    this.chunkCount = this.chunks.reduce((n, c) => n + (c.mesh.visible ? 1 : 0), 0);
  }

  /** Reatribui os chunks às células da grade em volta do jogador. */
  _reindex() {
    const half = (this.gridSize - 1) / 2;
    const wanted = [];
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        wanted.push([this.centerGX + dx, this.centerGZ + dz, dx * dx + dz * dz]);
      }
    }
    // Mais perto primeiro: se o orçamento por frame não der conta, o que
    // aparece antes é o chão debaixo do jogador, não o horizonte.
    wanted.sort((a, b) => a[2] - b[2]);

    // Chunks que já estão na célula certa são mantidos.
    const keep = new Set();
    for (const c of this.chunks) {
      if (c.state !== CHUNK_STATE.READY) continue;
      const idx = wanted.findIndex(([x, z]) => x === c.gx && z === c.gz);
      if (idx >= 0) { keep.add(c); wanted[idx][3] = c; }
    }

    this.rebuildQueue.length = 0;
    const free = this.chunks.filter((c) => !keep.has(c));
    let fi = 0;
    for (const w of wanted) {
      if (w[3]) continue;   // já coberta
      const c = free[fi++];
      if (!c) break;
      c.gx = w[0];
      c.gz = w[1];
      c.state = CHUNK_STATE.EMPTY;
      c.mesh.visible = false;
      this.rebuildQueue.push(c);
    }
  }

  /** Gera a geometria de um chunk. */
  _buildChunk(chunk) {
    const S = CONFIG.surface;
    const p = this.planet;
    const res = S.resolution;
    const n = res + 1;
    const amp = this.amplitude;

    const geo = chunk.mesh.geometry;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;

    const baseU = chunk.gx * S.chunkSize;
    const baseV = chunk.gz * S.chunkSize;
    const step = S.chunkSize / res;

    const center = p.object.position;
    const dir = this._tmp;
    const world = this._tmp2;
    const colorLow = TMP_COLOR_A, colorMid = TMP_COLOR_B, out = TMP_COLOR_C;
    colorLow.setHex(p.spec.colors.mid);
    colorMid.setHex(p.spec.colors.high);
    const water = TMP_COLOR_D.setHex(p.spec.colors.low);
    const polar = TMP_COLOR_E.setHex(p.spec.colors.polar);

    // A malha é gerada em espaço LOCAL do grupo, com a origem no centro do
    // chunk. Coordenadas absolutas na casa dos 40.000 em Float32 perderiam
    // precisão suficiente pra fazer os vértices tremerem visivelmente.
    let originSet = false;

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const uu = baseU + (i - res / 2) * step;
        const vv = baseV + (j - res / 2) * step;

        // Ponto no plano tangente → normalizado → superfície da esfera.
        dir.copy(this.origin)
          .addScaledVector(this.tangent, uu)
          .addScaledVector(this.bitangent, vv)
          .sub(center)
          .normalize();

        const { height, isWater } = terrainHeight(dir.x, dir.y, dir.z, p.spec, amp);
        world.copy(center).addScaledVector(dir, p.radius + height);

        if (!originSet && i === res / 2 | 0 && j === res / 2 | 0) originSet = true;

        const k = (j * n + i) * 3;
        pos[k] = world.x; pos[k + 1] = world.y; pos[k + 2] = world.z;

        // Cor por altitude + latitude, coerente com o shader visto da órbita.
        const t = Math.min(1, Math.max(0, (height / amp - p.spec.waterLevel) / (1 - p.spec.waterLevel)));
        if (isWater) out.copy(water);
        else out.copy(colorLow).lerp(colorMid, smooth(0.25, 0.8, t));
        const lat = Math.abs(dir.y);
        const ice = smooth(1 - p.spec.iceAmount, 1 - p.spec.iceAmount + 0.2, lat);
        if (ice > 0) out.lerp(polar, ice);

        col[k] = out.r; col[k + 1] = out.g; col[k + 2] = out.b;
      }
    }

    // Reposiciona a malha na origem do chunk pra manter precisão em Float32.
    const ci = ((res / 2 | 0) * n + (res / 2 | 0)) * 3;
    const ox = pos[ci], oy = pos[ci + 1], oz = pos[ci + 2];
    for (let k = 0; k < pos.length; k += 3) {
      pos[k] -= ox; pos[k + 1] -= oy; pos[k + 2] -= oz;
    }
    chunk.mesh.position.set(ox, oy, oz);

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    // Normais calculadas a partir da malha: mais barato e mais correto que
    // derivar analiticamente o gradiente do FBM de 5 oitavas.
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    chunk.mesh.visible = true;
    chunk.state = CHUNK_STATE.READY;
  }

  dispose() {
    for (const c of this.chunks) c.mesh.geometry.dispose();
    this.scene.remove(this.group);
    this.material.dispose();
    this.waterMaterial.dispose();
  }
}

const TMP_COLOR_A = new THREE.Color();
const TMP_COLOR_B = new THREE.Color();
const TMP_COLOR_C = new THREE.Color();
const TMP_COLOR_D = new THREE.Color();
const TMP_COLOR_E = new THREE.Color();

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Índices de uma grade res×res de quads. Iguais para todos os chunks, mas
 *  cada BufferGeometry precisa do próprio buffer. */
function buildIndices(res) {
  const n = res + 1;
  const idx = new Uint32Array(res * res * 6);
  let o = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;
      idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
  }
  return idx;
}
