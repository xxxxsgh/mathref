import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { terrainHeight } from '../procgen/noise.js';
import { SurfaceProps } from '../procgen/SurfaceProps.js';
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
        this.chunks.push({ mesh, gx: 0, gz: 0, state: CHUNK_STATE.EMPTY, props: false });
    }

    /** Fila de chunks a reconstruir. */
    this.rebuildQueue = [];
    /** Fila de fatias de vegetação a preencher: [slot, gx, gz, distância²]. */
    this.propsQueue = [];
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

    // Rascunho da passada de cor, dimensionado para um chunk. Alocado uma vez
    // e reaproveitado por todos: são ~1.900 floats, e criá-los por chunk daria
    // lixo pro coletor exatamente durante a descida, que é o pior momento.
    const nv = (S.resolution + 1) * (S.resolution + 1);
    this._vHeight = new Float32Array(nv);
    this._vWater = new Uint8Array(nv);
    this._vDir = new Float32Array(nv * 3);

    // Vegetação e rochas. Vive num objeto separado porque não tem nada a ver
    // com streaming de malha: só precisa saber quando um chunk ficou pronto.
    this.props = new SurfaceProps(scene);
  }

  /**
   * Aplica a névoa atmosférica.
   *
   * Ela cumpre duas funções, e a segunda é a que importa mais:
   *  1. perspectiva aérea — dá noção de distância e escala no solo;
   *  2. esconde a BORDA da grade de chunks. Sem névoa, o terreno acaba numa
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
    for (const c of this.chunks) {
      c.state = CHUNK_STATE.EMPTY;
      c.mesh.visible = false;
      c.props = false;
    }
    this.rebuildQueue.length = 0;
    this.propsQueue.length = 0;
    this.props.enter(planet, this._slotsComProps());
  }

  exit() {
    if (this.scene.fog) this.scene.fog = null;
    this.active = false;
    this.planet = null;
    this.group.visible = false;
    for (const c of this.chunks) { c.mesh.visible = false; c.props = false; }
    this.rebuildQueue.length = 0;
    this.propsQueue.length = 0;
    this.chunkCount = 0;
    this.props.exit();
  }

  /** Quantos chunks podem carregar props ao mesmo tempo: o quadrado da janela
   *  de raio `raioEmChunks`, limitado pelo tamanho da grade. */
  _slotsComProps() {
    const r = CONFIG.surface.props.raioEmChunks;
    const lado = Math.min(this.gridSize, r * 2 + 1);
    return lado * lado;
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

    // ── Base tangente ────────────────────────────────────────────────────
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

    // ── Coordenadas de grade do jogador ────────────────────────────
    this._tmp.copy(playerPos).sub(this.origin);
    const u = this._tmp.dot(this.tangent);
    const v = this._tmp.dot(this.bitangent);
    const gx = Math.round(u / S.chunkSize);
    const gz = Math.round(v / S.chunkSize);

    if (gx !== this.centerGX || gz !== this.centerGZ) {
      this.centerGX = gx;
      this.centerGZ = gz;
      this._reindex();
      this._reindexProps();
    }

    // ── Reconstrução limitada por frame ──────────────────────────────
    // Gerar um chunk custa alguns milissegundos. Fazer todos de uma vez
    // causaria um engasgo de 100ms+ exatamente no momento da descida.
    let budget = S.chunksPerFrame;
    while (budget > 0 && this.rebuildQueue.length > 0) {
      const chunk = this.rebuildQueue.shift();
      this._buildChunk(chunk);
      budget--;
    }

    // ── Vegetação, com orçamento próprio ──────────────────────────────
    // Espalhar props num chunk custa ~5 amostras de terreno por candidato.
    // Com 34 candidatos em 25 chunks, refazer tudo de uma vez quando a janela
    // rola seria um engasgo maior que o da própria malha — e viria logo depois
    // dele. Orçamento separado espalha os dois no tempo.
    let orcamentoProps = S.props.porFrame;
    while (orcamentoProps > 0 && this.propsQueue.length > 0) {
      const [slot, px, pz] = this.propsQueue.shift();
      this.props.preencher(slot, px, pz, this);
      orcamentoProps--;
    }

    this.chunkCount = this.chunks.reduce((n, c) => n + (c.mesh.visible ? 1 : 0), 0);
  }

  /**
   * Refaz a fila de vegetação quando a janela de chunks rola.
   *
   * O slot de cada chunk é derivado da POSIÇÃO dele dentro da janela, não de
   * uma tabela de alocação. Isso elimina qualquer bookkeeping — mas significa
   * que mover a janela remapeia todos os slots, e portanto tudo precisa ser
   * reescrito. Como a janela só rola quando o jogador cruza 900 unidades, o
   * custo é raro; espalhá-lo pelo orçamento por frame resolve o resto.
   */
  _reindexProps() {
    const r = CONFIG.surface.props.raioEmChunks;
    const lado = Math.min(this.gridSize, r * 2 + 1);
    const meio = (lado - 1) / 2;
    this.propsQueue.length = 0;
    for (let dz = -meio; dz <= meio; dz++) {
      for (let dx = -meio; dx <= meio; dx++) {
        const slot = (dz + meio) * lado + (dx + meio);
        this.propsQueue.push([slot, this.centerGX + dx, this.centerGZ + dz,
                              dx * dx + dz * dz]);
      }
    }
    // Mais perto primeiro, pela mesma razão dos chunks: o que o jogador vê
    // primeiro é o chão em volta dele.
    this.propsQueue.sort((a, b) => a[3] - b[3]);
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

        // Guarda o que a passada de cor vai precisar. Recalcular `terrainHeight`
        // lá custaria uma segunda avaliação de FBM de 5 oitavas por vértice —
        // o passo mais caro da geração de chunk, dobrado à toa.
        const v = j * n + i;
        this._vHeight[v] = height;
        this._vWater[v] = isWater ? 1 : 0;
        this._vDir[v * 3] = dir.x;
        this._vDir[v * 3 + 1] = dir.y;
        this._vDir[v * 3 + 2] = dir.z;
      }
    }

    // Normais calculadas a partir da malha: mais barato e mais correto que
    // derivar analiticamente o gradiente do FBM de 5 oitavas. Precisa vir
    // ANTES da cor, porque a cor depende da inclinação.
    geo.computeVertexNormals();
    this._colorChunk(geo, col, n);

    // Reposiciona a malha na origem do chunk pra manter precisão em Float32.
    // Depois das normais: translação não muda normal, mas deixar por último
    // mantém as posições em espaço de mundo enquanto alguém precisa delas.
    const ci = ((res / 2 | 0) * n + (res / 2 | 0)) * 3;
    const ox = pos[ci], oy = pos[ci + 1], oz = pos[ci + 2];
    for (let k = 0; k < pos.length; k += 3) {
      pos[k] -= ox; pos[k + 1] -= oy; pos[k + 2] -= oz;
    }
    chunk.mesh.position.set(ox, oy, oz);

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeBoundingSphere();

    chunk.mesh.visible = true;
    chunk.state = CHUNK_STATE.READY;
  }

  /**
   * Cor do terreno.
   *
   * ═══ POR QUE A INCLINAÇÃO É O QUE MAIS IMPORTA ═══
   *
   * A versão anterior colorizava só por altitude e latitude. O resultado, no
   * chão, era um degradê contínuo que não descrevia NADA da forma do terreno:
   * subir uma encosta e atravessar uma planície na mesma altitude davam
   * exatamente a mesma cor, e o relevo desaparecia visualmente mesmo estando
   * ali na geometria.
   *
   * Inclinação resolve isso porque é a variável que a natureza usa: em
   * paredão nada cresce e a rocha fica exposta; em terreno plano acumula solo,
   * areia, vegetação, neve. Pintar por inclinação faz o olho ler a topografia
   * antes mesmo de a iluminação ajudar — que é o que transforma "terreno
   * colorido" em "montanha".
   *
   * As faixas, na ordem em que se sobrepõem:
   *   praia   — terra baixa perto da linha d'água
   *   solo    — a rampa de altitude original (mid → high)
   *   rocha   — onde a inclinação passa do limiar, sobrepõe tudo
   *   neve    — altitude alta E terreno pouco inclinado (não gruda em paredão)
   *   gelo    — calotas polares, por latitude
   */
  _colorChunk(geo, col, n) {
    const p = this.planet;
    const amp = this.amplitude;
    const nrm = geo.attributes.normal.array;
    const C = CONFIG.surface.paint;

    const solo = TMP_COLOR_A.setHex(p.spec.colors.mid);
    const alto = TMP_COLOR_B.setHex(p.spec.colors.high);
    const out = TMP_COLOR_C;
    const agua = TMP_COLOR_D.setHex(p.spec.colors.low);
    const polar = TMP_COLOR_E.setHex(p.spec.colors.polar);
    // Rocha e areia derivam da paleta do planeta em vez de serem fixas: uma
    // rocha cinza num mundo tóxico roxo denunciaria na hora que a cor não é
    // do lugar. Dessaturar e escurecer o tom alto mantém tudo da mesma família.
    const rocha = TMP_COLOR_F.setHex(p.spec.colors.high);
    rocha.offsetHSL(0, -C.rockDesaturate, -C.rockDarken);
    const areia = TMP_COLOR_G.setHex(p.spec.colors.mid);
    areia.offsetHSL(0, -0.1, C.beachLighten);

    const total = n * n;
    for (let v = 0; v < total; v++) {
      const k = v * 3;
      const height = this._vHeight[v];
      const dx = this._vDir[k], dy = this._vDir[k + 1], dz = this._vDir[k + 2];

      if (this._vWater[v]) {
        out.copy(agua);
      } else {
        const t = Math.min(1, Math.max(0,
          (height / amp - p.spec.waterLevel) / (1 - p.spec.waterLevel)));
        out.copy(solo).lerp(alto, smooth(0.25, 0.8, t));

        // Praia: só bem perto da água, senão o planeta inteiro fica claro.
        const praia = 1 - smooth(0, C.beachBand, t);
        if (praia > 0) out.lerp(areia, praia * 0.8);

        // Inclinação = 1 - (normal · direção radial). Zero no plano, cresce
        // até 1 num paredão vertical. O produto escalar já está normalizado
        // dos dois lados, então não há raiz quadrada nenhuma aqui.
        const inclin = 1 - Math.abs(nrm[k] * dx + nrm[k + 1] * dy + nrm[k + 2] * dz);
        const r = smooth(C.rockSlopeMin, C.rockSlopeMax, inclin);
        if (r > 0) out.lerp(rocha, r);

        // Neve: alta E plana. O `1 - r` é o que impede a neve de se agarrar
        // numa parede vertical, que é o erro clássico deste efeito.
        const neve = smooth(C.snowMin, C.snowMax, t) * (1 - r);
        if (neve > 0) out.lerp(polar, neve * C.snowStrength);
      }

      const gelo = smooth(1 - p.spec.iceAmount, 1 - p.spec.iceAmount + 0.2, Math.abs(dy));
      if (gelo > 0) out.lerp(polar, gelo);

      col[k] = out.r; col[k + 1] = out.g; col[k + 2] = out.b;
    }
  }

  dispose() {
    for (const c of this.chunks) c.mesh.geometry.dispose();
    this.scene.remove(this.group);
    this.props.dispose();
    this.material.dispose();
    this.waterMaterial.dispose();
  }
}

const TMP_COLOR_A = new THREE.Color();
const TMP_COLOR_B = new THREE.Color();
const TMP_COLOR_C = new THREE.Color();
const TMP_COLOR_D = new THREE.Color();
const TMP_COLOR_E = new THREE.Color();
const TMP_COLOR_F = new THREE.Color();
const TMP_COLOR_G = new THREE.Color();

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
