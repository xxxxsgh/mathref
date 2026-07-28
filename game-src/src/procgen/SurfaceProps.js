import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { LAYER_NEAR } from '../core/Renderer.js';
import { createRng } from './rng.js';

/**
 * Vegetação, rochas e formações na superfície de um planeta.
 *
 * ═══ POR QUE ISTO É O QUE DÁ ESCALA ═══
 *
 * O terreno em chunks já existia e, mesmo com montanha, olhando de dentro da
 * nave ele parecia pequeno. O motivo não é o relevo: é que não havia NADA de
 * tamanho conhecido em cena. Sem uma árvore, uma pedra, uma agulha de rocha,
 * o olho não tem como estimar se aquela encosta tem 20 metros ou 2.000 — e um
 * mundo sem escala aparente parece uma maquete.
 *
 * Uma única pedra de 8 unidades ao lado de um paredão resolve isso de graça.
 * É o motivo de este arquivo existir, e a razão de as espécies terem alturas
 * MUITO diferentes entre si: a variedade de tamanhos é a régua.
 *
 * ═══ COMO SÃO DISTRIBUÍDAS ═══
 *
 * Por chunk, com RNG derivado de (semente do planeta, gx, gz). Determinístico:
 * o mesmo chunk gera a mesma floresta toda vez que entra no alcance. Sem isso,
 * dar meia-volta faria a paisagem inteira se reembaralhar — o defeito que mais
 * denuncia geração procedural.
 *
 * Cada candidato é sorteado no plano tangente do chunk e depois FILTRADO pelo
 * terreno: nada na água, nada em rocha íngreme demais, e cada espécie tem sua
 * faixa de altitude. Sortear-e-rejeitar é mais simples que tentar inverter a
 * função de terreno, e o custo é irrelevante porque roda uma vez por chunk.
 *
 * ═══ ORÇAMENTO ═══
 *
 * Uma `InstancedMesh` por espécie, com capacidade fixa
 * `chunksComProps × porChunk`. Cada chunk é dono de uma FATIA fixa de índices,
 * o que elimina qualquer alocação ou realocação em voo: preencher é escrever
 * matrizes numa faixa, esvaziar é zerar a escala dessa mesma faixa.
 */

/** Espécies por tipo de planeta. Cada uma é um construtor de geometria e as
 *  regras de onde ela aceita crescer. */
const ESPECIES = {
  arvore: {
    altura: [14, 34],
    inclinacaoMax: 0.30,      // não cresce em paredão
    altitude: [0.02, 0.55],   // fração da rampa acima da água
    cor: 0x2f6b32,
    corTronco: 0x4a3524,
    geometria: () => {
      // Tronco + duas copas cônicas deslocadas. Duas em vez de uma porque uma
      // copa só lê como cone geométrico; duas já leem como copa.
      const tronco = new THREE.CylinderGeometry(0.5, 0.9, 4, 5);
      tronco.translate(0, 2, 0);
      const copa1 = new THREE.ConeGeometry(3.2, 7, 6);
      copa1.translate(0, 6.5, 0);
      const copa2 = new THREE.ConeGeometry(2.2, 5, 6);
      copa2.translate(0, 9.5, 0);
      return [tronco, copa1, copa2];
    },
  },
  pedra: {
    altura: [3, 11],
    inclinacaoMax: 0.62,
    altitude: [0, 1],
    cor: 0x6b6157,
    geometria: () => {
      // Icosaedro achatado: poucas faces, silhueta irregular. Um cubo lê como
      // caixa e uma esfera lê como bola; o icosaedro de baixa ordem lê como
      // pedra sem custar geometria.
      const g = new THREE.IcosahedronGeometry(1.4, 0);
      g.scale(1, 0.72, 1.15);
      g.translate(0, 0.7, 0);
      return [g];
    },
  },
  agulha: {
    altura: [22, 70],
    inclinacaoMax: 0.45,
    altitude: [0.35, 1],      // só terreno alto: é formação de serra
    cor: 0x554c46,
    geometria: () => {
      const g = new THREE.ConeGeometry(1.6, 9, 5);
      g.translate(0, 4.5, 0);
      return [g];
    },
  },
  cristal: {
    altura: [9, 26],
    inclinacaoMax: 0.5,
    altitude: [0.1, 1],
    cor: 0x7fd4e8,
    emissivo: 0.55,
    geometria: () => {
      const a = new THREE.ConeGeometry(1.1, 6, 5);
      a.translate(0, 3, 0);
      const b = new THREE.ConeGeometry(0.7, 4, 5);
      b.rotateZ(0.34); b.translate(1.3, 2, 0);
      return [a, b];
    },
  },
  espora: {
    altura: [7, 20],
    inclinacaoMax: 0.34,
    altitude: [0, 0.6],
    cor: 0xa663c9,
    emissivo: 0.3,
    geometria: () => {
      const caule = new THREE.CylinderGeometry(0.35, 0.5, 5, 5);
      caule.translate(0, 2.5, 0);
      const chapeu = new THREE.SphereGeometry(2.1, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
      chapeu.translate(0, 5, 0);
      return [caule, chapeu];
    },
  },
};

/** Que espécies cada tipo de planeta recebe. */
const FLORA_POR_TIPO = {
  oceanic:   ['arvore', 'pedra'],
  temperate: ['arvore', 'pedra', 'agulha'],
  desert:    ['pedra', 'agulha'],
  barren:    ['pedra', 'agulha'],
  ice:       ['cristal', 'pedra'],
  toxic:     ['espora', 'pedra', 'cristal'],
  volcanic:  ['agulha', 'pedra'],
};
const FLORA_PADRAO = ['pedra', 'arvore'];

export class SurfaceProps {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.layers.set(LAYER_NEAR);
    scene.add(this.group);

    /** @type {Map<string, THREE.InstancedMesh>} */
    this.malhas = new Map();
    this.planet = null;
    this.especies = [];
    /** Quantos chunks recebem props (os mais próximos do jogador). */
    this.slots = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._pos = new THREE.Vector3();
    this._escala = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._nada = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  /**
   * Prepara as malhas para um planeta. Chamado ao entrar na atmosfera.
   * @param {import('../entities/Planet.js').Planet} planet
   * @param {number} chunksComProps quantos chunks podem ter props ao mesmo tempo
   */
  enter(planet, chunksComProps) {
    if (this.planet === planet && this.slots === chunksComProps) {
      this.group.visible = true;
      return;
    }
    this.dispose();
    this.planet = planet;
    this.slots = chunksComProps;
    this.group.visible = true;

    const P = CONFIG.surface.props;
    const nomes = FLORA_POR_TIPO[planet.spec.type] ?? FLORA_PADRAO;
    this.especies = nomes;

    for (const nome of nomes) {
      const def = ESPECIES[nome];
      const partes = def.geometria();
      const geo = mesclar(partes);
      for (const g of partes) g.dispose();

      const mat = new THREE.MeshStandardMaterial({
        color: def.cor,
        roughness: def.emissivo ? 0.35 : 0.92,
        metalness: 0.02,
        emissive: def.emissivo ? def.cor : 0x000000,
        emissiveIntensity: def.emissivo ?? 0,
        flatShading: true,
      });
      const capacidade = chunksComProps * P.porChunk;
      const im = new THREE.InstancedMesh(geo, mat, capacidade);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // O culling de frustum não funciona em InstancedMesh (ou passa tudo ou
      // nada), e a bounding sphere calculada cobriria o planeta inteiro. Como
      // as props só existem em volta do jogador, deixar passar é o correto.
      im.frustumCulled = false;
      im.layers.set(LAYER_NEAR);
      im.count = capacidade;
      for (let i = 0; i < capacidade; i++) im.setMatrixAt(i, this._nada);
      im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
      this.malhas.set(nome, im);
    }
  }

  exit() {
    this.group.visible = false;
  }

  /**
   * Preenche a fatia de um slot com as props de um chunk.
   *
   * @param {number} slot índice do chunk no pool (define a fatia de instâncias)
   * @param {number} gx @param {number} gz coordenadas de grade do chunk
   * @param {import('../systems/PlanetSurface.js').PlanetSurface} surface
   */
  preencher(slot, gx, gz, surface) {
    const P = CONFIG.surface.props;
    const p = this.planet;
    if (!p || this.especies.length === 0) return;

    // Semente derivada de (planeta, chunk): o mesmo pedaço de mundo devolve
    // sempre a mesma vegetação, em qualquer ordem de visita.
    const rng = createRng(`${p.spec.noiseSeed}:${gx}:${gz}`);
    const S = CONFIG.surface;
    const meia = S.chunkSize * 0.5;
    const amp = surface.amplitude;
    const centro = p.object.position;
    const densidade = p.spec.lifeDensity ?? 0.5;
    const quantidade = Math.round(P.porChunk * densidade);

    // Contadores por espécie dentro da fatia deste slot.
    const usados = new Map();
    for (const nome of this.especies) usados.set(nome, 0);

    for (let i = 0; i < quantidade; i++) {
      const u = (gx * S.chunkSize) + (rng() - 0.5) * S.chunkSize;
      const v = (gz * S.chunkSize) + (rng() - 0.5) * S.chunkSize;

      this._dir.copy(surface.origin)
        .addScaledVector(surface.tangent, u)
        .addScaledVector(surface.bitangent, v)
        .sub(centro)
        .normalize();

      const amostra = surface.sample(
        this._pos.copy(centro).addScaledVector(this._dir, p.radius + amp * 2),
        this._up,
      );
      if (amostra.isWater) continue;

      // Fração da rampa de altitude acima da água — a mesma variável que
      // decide a cor do terreno, então flora e pintura concordam.
      const alturaRel = (amostra.ground - p.radius) / Math.max(1e-3, amp);
      const t = Math.min(1, Math.max(0,
        (alturaRel - p.spec.waterLevel) / (1 - p.spec.waterLevel)));

      // Inclinação por diferenças finitas: duas amostras vizinhas bastam, e
      // são muito mais baratas que reconstruir a normal da malha aqui.
      const inclin = this._inclinacao(surface, centro, amp, u, v);

      const nome = this.especies[(rng() * this.especies.length) | 0];
      const def = ESPECIES[nome];
      if (inclin > def.inclinacaoMax) continue;
      if (t < def.altitude[0] || t > def.altitude[1]) continue;

      const im = this.malhas.get(nome);
      const n = usados.get(nome);
      const porEspecie = Math.floor(P.porChunk / this.especies.length);
      if (n >= porEspecie) continue;
      usados.set(nome, n + 1);

      const alturaMundo = def.altura[0] + rng() * (def.altura[1] - def.altura[0]);
      // As geometrias são construídas com ~10 unidades de altura; a escala
      // leva cada indivíduo para a altura sorteada.
      const s = alturaMundo / 10;

      // Assenta um pouco abaixo do solo: o terreno é uma malha interpolada e
      // a amostra é analítica, então elas discordam por alguns décimos. Enfiar
      // a base pra dentro esconde qualquer flutuação.
      this._pos.copy(centro).addScaledVector(this._up, amostra.ground - s * 0.6);

      // Orienta o "para cima" local do modelo com a vertical do planeta, mais
      // uma rotação aleatória em torno dela e uma pequena inclinação — nada na
      // natureza nasce perfeitamente a prumo.
      this._q.setFromUnitVectors(UP_PADRAO, this._up);
      TMP_Q.setFromAxisAngle(this._up, rng() * Math.PI * 2);
      this._q.premultiply(TMP_Q);
      TMP_Q.setFromAxisAngle(EIXO_X, (rng() - 0.5) * P.inclinacaoAleatoria);
      this._q.multiply(TMP_Q);

      this._escala.set(s * (0.8 + rng() * 0.4), s, s * (0.8 + rng() * 0.4));
      this._m.compose(this._pos, this._q, this._escala);
      im.setMatrixAt(slot * P.porChunk + n, this._m);
    }

    // Zera o resto da fatia de cada espécie: sem isso, um chunk que gerou 20
    // props e depois é reciclado para um deserto que gera 3 deixaria 17
    // árvores fantasmas flutuando na posição antiga.
    const porEspecie = Math.floor(P.porChunk / this.especies.length);
    for (const nome of this.especies) {
      const im = this.malhas.get(nome);
      for (let n = usados.get(nome); n < porEspecie; n++) {
        im.setMatrixAt(slot * P.porChunk + n, this._nada);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** Esvazia a fatia de um slot. */
  limpar(slot) {
    const P = CONFIG.surface.props;
    const porEspecie = Math.floor(P.porChunk / Math.max(1, this.especies.length));
    for (const nome of this.especies) {
      const im = this.malhas.get(nome);
      if (!im) continue;
      for (let n = 0; n < porEspecie; n++) {
        im.setMatrixAt(slot * P.porChunk + n, this._nada);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** Inclinação local por diferenças finitas no plano tangente. */
  _inclinacao(surface, centro, amp, u, v) {
    const d = CONFIG.surface.props.passoInclinacao;
    const h = (du, dv) => {
      TMP_V.copy(surface.origin)
        .addScaledVector(surface.tangent, u + du)
        .addScaledVector(surface.bitangent, v + dv)
        .sub(centro)
        .normalize()
        .multiplyScalar(this.planet.radius + amp * 2)
        .add(centro);
      return surface.sample(TMP_V, null).ground;
    };
    const dhu = (h(d, 0) - h(-d, 0)) / (2 * d);
    const dhv = (h(0, d) - h(0, -d)) / (2 * d);
    // Módulo do gradiente → tangente do ângulo com a horizontal. Normalizado
    // pra 0..1 pela mesma escala usada em _colorChunk.
    return Math.min(1, Math.hypot(dhu, dhv));
  }

  dispose() {
    for (const im of this.malhas.values()) {
      this.group.remove(im);
      im.geometry.dispose();
      im.material.dispose();
      im.dispose();
    }
    this.malhas.clear();
    this.especies = [];
    this.planet = null;
  }
}

const UP_PADRAO = new THREE.Vector3(0, 1, 0);
const EIXO_X = new THREE.Vector3(1, 0, 0);
const TMP_Q = new THREE.Quaternion();
const TMP_V = new THREE.Vector3();

/**
 * Junta várias geometrias numa só, concatenando os atributos.
 *
 * Existe porque `InstancedMesh` aceita UMA geometria, e uma árvore precisa de
 * tronco e copa. A alternativa seria uma InstancedMesh por parte, o que
 * dobraria ou triplicaria as draw calls sem ganho nenhum.
 */
function mesclar(geos) {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geos) {
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  const idx = new Uint16Array(totalIdx);

  let vOff = 0, iOff = 0;
  for (const g of geos) {
    const gp = g.attributes.position.array;
    const gn = g.attributes.normal.array;
    pos.set(gp, vOff * 3);
    nrm.set(gn, vOff * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[iOff + i] = gi[i] + vOff;
      iOff += gi.length;
    } else {
      const c = g.attributes.position.count;
      for (let i = 0; i < c; i++) idx[iOff + i] = i + vOff;
      iOff += c;
    }
    vOff += g.attributes.position.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
