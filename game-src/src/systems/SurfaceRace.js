import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRng } from '../procgen/rng.js';
import { LAYER_NEAR } from '../core/Renderer.js';

/**
 * Corridas de superfície: um circuito de argolas seguindo o relevo do planeta.
 *
 * ═══ POR QUE CORRIDA, E NÃO MAIS COMBATE ═══
 *
 * O terreno, a reentrada e o pouso são o sistema mais caro do projeto e até
 * agora entregavam uma mensagem de POUSADO. O reflexo seria pôr inimigos lá —
 * mas combate na superfície já existe, e mais dele não dá RAZÃO pra explorar,
 * só muda o cenário do mesmo loop.
 *
 * Corrida dá. Ela transforma o relevo de plano de fundo em obstáculo: o vale
 * que era paisagem vira a linha rápida, a crista vira a decisão de passar por
 * cima ou contornar. É a única mecânica que faz o jogador OLHAR o terreno.
 *
 * E é barata: usa o `sample` do terreno que já existe, o modelo de voo que já
 * existe, e um cronômetro.
 *
 * ═══ O CIRCUITO ═══
 *
 * Gerado a partir de (semente do planeta, índice do circuito). Determinístico:
 * o mesmo planeta tem sempre a mesma pista, no mesmo lugar. Isso é o que
 * permite ter recorde — um circuito que muda a cada visita não tem tempo a
 * bater.
 *
 * O traçado é uma caminhada sobre a ESFERA: a cada passo o rumo gira um ângulo
 * sorteado e a posição avança por rotação, o que dá comprimento de arco exato
 * em qualquer latitude (ver a nota em `montar` sobre por que o plano tangente
 * não serve). A argola é posta a uma altura ACIMA DO TERRENO daquele ponto —
 * como a altura segue o relevo, o circuito mergulha nos vales e sobe nas
 * serras sem nenhuma lógica de traçado.
 *
 * ═══ DETECÇÃO ═══
 *
 * Cruzamento de PLANO, não proximidade. A 300 u/s a nave anda 5 unidades por
 * frame, então um teste de esfera funcionaria — mas ele também contaria passar
 * raspando por FORA da argola, o que o jogador lê como roubo. Testar o plano e
 * o raio no ponto de cruzamento é a diferença entre "passei pela argola" e
 * "passei perto da argola".
 */

export class SurfaceRace {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.layers.set(LAYER_NEAR);
    this.group.visible = false;
    scene.add(this.group);

    /** @type {Array<{pos: THREE.Vector3, normal: THREE.Vector3, mesh: THREE.Mesh}>} */
    this.checkpoints = [];
    this.planet = null;
    /** 'inativa' | 'pronta' | 'correndo' | 'concluida' */
    this.estado = 'inativa';
    this.indice = 0;          // próxima argola a cruzar
    this.tempo = 0;
    this.ultimoTempo = null;
    this.recorde = null;
    this.novoRecorde = false;

    const R = CONFIG.race;
    const geo = new THREE.TorusGeometry(R.raio, R.espessura, 6, 24);
    this._geo = geo;
    this.matAtivo = new THREE.MeshBasicMaterial({
      color: R.corAtiva, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    this.matProximo = new THREE.MeshBasicMaterial({
      color: R.corProxima, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    this.matFeito = new THREE.MeshBasicMaterial({
      color: R.corFeita, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    });

    for (let i = 0; i < R.maxCheckpoints; i++) {
      const m = new THREE.Mesh(geo, this.matProximo);
      m.visible = false;
      m.frustumCulled = true;
      m.layers.set(LAYER_NEAR);
      this.group.add(m);
      this.checkpoints.push({
        pos: new THREE.Vector3(), normal: new THREE.Vector3(), mesh: m, ativo: false,
      });
    }

    this._prev = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._temPrev = false;
    this._pulso = 0;
  }

  get ativa() { return this.estado === 'correndo'; }
  get total() { return this._total; }

  /** Posição da próxima argola, para o marcador da HUD. Null se não há. */
  get alvo() {
    if (this.estado === 'inativa' || this.estado === 'concluida') return null;
    const c = this.checkpoints[this.indice];
    return c && c.ativo ? c.pos : null;
  }

  /**
   * Monta o circuito deste planeta. Chamado ao entrar na atmosfera.
   * @param {import('../entities/Planet.js').Planet} planet
   * @param {import('./PlanetSurface.js').PlanetSurface} surface
   * @param {number|null} recorde melhor tempo salvo, em segundos
   */
  montar(planet, surface, recorde) {
    if (this.planet === planet && this.estado !== 'inativa') return;
    // O traçado depende de `surface.sample`, que só funciona com a superfície
    // ativa. Chamar fora disso é erro de quem chama, mas explodir aqui deixa
    // o jogo sem terreno e sem corrida — sair calado é o menor dano.
    if (!surface.active || !surface.planet) return;
    const R = CONFIG.race;
    this.planet = planet;
    this.recorde = recorde;
    this.estado = 'pronta';
    this.indice = 0;
    this.tempo = 0;
    this.novoRecorde = false;
    this._temPrev = false;
    this.group.visible = true;

    const rng = createRng(`${planet.spec.noiseSeed}:corrida`);
    const n = R.checkpoints[0]
      + Math.floor(rng() * (R.checkpoints[1] - R.checkpoints[0] + 1));
    this._total = n;

    // Âncora do circuito: um ponto fixo da esfera, sorteado pela semente do
    // planeta. Fixo, e não onde o jogador está, porque o circuito precisa ser
    // um LUGAR — algo que se procura e ao qual se volta.
    const a = rng() * Math.PI * 2;
    const b = Math.acos(2 * rng() - 1);
    const ancora = this._tmp.set(
      Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a),
    ).normalize().clone();

    // Base tangente na âncora.
    const t1 = new THREE.Vector3(0, 1, 0);
    if (Math.abs(ancora.y) > 0.95) t1.set(1, 0, 0);
    const tangente = new THREE.Vector3().crossVectors(t1, ancora).normalize();
    const bitangente = new THREE.Vector3().crossVectors(ancora, tangente).normalize();

    const centro = planet.object.position;
    const amp = surface.amplitude;

    // ⚠ CAMINHADA ESFÉRICA, não no plano tangente.
    //
    // A primeira versão acumulava (u, v) no plano tangente da âncora e
    // normalizava o resultado. Funciona perto da âncora e degrada longe dela:
    // a normalização comprime distâncias conforme o ponto se afasta, e o
    // espaçamento medido entre argolas caía de 620 para 174 no fim do
    // circuito. As últimas argolas se amontoavam.
    //
    // Aqui a caminhada é feita na própria esfera: `dir` é a posição atual e
    // `rumoVec` o rumo (tangente a ela). Andar é ROTACIONAR `dir` em torno de
    // (dir × rumoVec) pelo ângulo passo/raio — o que dá comprimento de arco
    // exato em qualquer ponto do planeta. Curvar é rotacionar `rumoVec` em
    // torno de `dir`.
    const dir = ancora.clone();
    const rumoVec = tangente.clone();
    {
      // Rumo inicial aleatório no plano tangente da âncora.
      const a0 = rng() * Math.PI * 2;
      rumoVec.copy(tangente).multiplyScalar(Math.cos(a0))
        .addScaledVector(bitangente, Math.sin(a0)).normalize();
    }
    const eixo = new THREE.Vector3();
    const giro = new THREE.Quaternion();

    for (let i = 0; i < R.maxCheckpoints; i++) {
      const c = this.checkpoints[i];
      if (i >= n) { c.ativo = false; c.mesh.visible = false; continue; }

      // Curva: gira o rumo em torno da vertical local.
      giro.setFromAxisAngle(dir, (rng() - 0.5) * R.curvaMaxima);
      rumoVec.applyQuaternion(giro).normalize();

      // Passo: gira a posição em torno do eixo perpendicular ao par
      // (posição, rumo). Arco exato = passo, em qualquer latitude.
      const passo = R.espacamento * (0.75 + rng() * 0.5);
      eixo.crossVectors(dir, rumoVec).normalize();
      giro.setFromAxisAngle(eixo, passo / planet.radius);
      dir.applyQuaternion(giro).normalize();

      // Reortogonaliza o rumo: depois de girar a posição, ele deixa de ser
      // exatamente tangente, e o erro acumularia ao longo do circuito.
      rumoVec.addScaledVector(dir, -rumoVec.dot(dir)).normalize();

      // Altura ACIMA DO TERRENO daquele ponto — é isto que faz o circuito
      // acompanhar o relevo em vez de flutuar num plano.
      const amostra = surface.sample(
        this._tmp.copy(centro).addScaledVector(dir, planet.radius + amp * 3), this._up,
      );
      const alt = R.altura[0] + rng() * (R.altura[1] - R.altura[0]);
      c.pos.copy(centro).addScaledVector(this._up, amostra.ground + alt);
      c.ativo = true;
      c.mesh.position.copy(c.pos);
      c.mesh.visible = true;
    }

    // Normais: cada argola encara a PRÓXIMA. Assim atravessá-la já aponta a
    // nave para o caminho seguinte, em vez de exigir uma curva cega logo após
    // o cruzamento.
    for (let i = 0; i < n; i++) {
      const atual = this.checkpoints[i];
      const prox = this.checkpoints[Math.min(i + 1, n - 1)];
      if (i === n - 1 && n > 1) {
        atual.normal.copy(atual.pos).sub(this.checkpoints[i - 1].pos).normalize();
      } else {
        atual.normal.copy(prox.pos).sub(atual.pos).normalize();
      }
      // O toro nasce no plano XY com o eixo em +Z: alinhar +Z com a normal
      // deixa o buraco virado para o sentido da pista.
      atual.mesh.quaternion.setFromUnitVectors(EIXO_Z, atual.normal);
    }
    this._pintar();
  }

  desmontar() {
    this.estado = 'inativa';
    this.planet = null;
    this.group.visible = false;
    for (const c of this.checkpoints) { c.ativo = false; c.mesh.visible = false; }
  }

  /**
   * @param {THREE.Vector3} shipPos
   * @param {number} dt
   * @returns {{ iniciou: boolean, cruzou: number, concluiu: boolean }}
   */
  update(shipPos, dt) {
    const out = { iniciou: false, cruzou: 0, concluiu: false };
    if (this.estado === 'inativa') return out;

    // Pulsa a argola ativa: um alvo estático numa paisagem estática some.
    this._pulso += dt * CONFIG.race.pulsoVelocidade;
    const c = this.checkpoints[this.indice];
    if (c && c.ativo) {
      const s = 1 + Math.sin(this._pulso) * CONFIG.race.pulsoAmplitude;
      c.mesh.scale.setScalar(s);
    }

    if (!this._temPrev) {
      this._prev.copy(shipPos);
      this._temPrev = true;
      return out;
    }

    if (this.estado === 'correndo') this.tempo += dt;

    if (c && c.ativo && this._cruzou(this._prev, shipPos, c)) {
      if (this.estado === 'pronta') {
        this.estado = 'correndo';
        this.tempo = 0;
        out.iniciou = true;
      }
      this.indice++;
      out.cruzou = this.indice;
      if (this.indice >= this._total) {
        this.estado = 'concluida';
        this.ultimoTempo = this.tempo;
        this.novoRecorde = this.recorde === null || this.tempo < this.recorde;
        if (this.novoRecorde) this.recorde = this.tempo;
        out.concluiu = true;
      }
      this._pintar();
    }

    this._prev.copy(shipPos);
    return out;
  }

  /**
   * A nave cruzou o plano da argola DENTRO do raio?
   *
   * Dois testes, e os dois importam. O sinal do produto escalar dá o
   * cruzamento do plano infinito; o raio no ponto de interseção é o que
   * distingue atravessar a argola de passar por fora dela.
   */
  _cruzou(a, b, c) {
    const da = this._tmp.copy(a).sub(c.pos).dot(c.normal);
    const db = this._tmp.copy(b).sub(c.pos).dot(c.normal);
    if ((da > 0) === (db > 0)) return false;      // não trocou de lado
    const f = da / (da - db);                     // fração do trecho até o plano
    this._tmp.copy(a).lerp(b, f).sub(c.pos);
    const R = CONFIG.race.raio;
    return this._tmp.lengthSq() <= R * R;
  }

  _pintar() {
    for (let i = 0; i < this._total; i++) {
      const c = this.checkpoints[i];
      c.mesh.material = i < this.indice ? this.matFeito
        : i === this.indice ? this.matAtivo
        : this.matProximo;
      if (i !== this.indice) c.mesh.scale.setScalar(1);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this._geo.dispose();
    this.matAtivo.dispose();
    this.matProximo.dispose();
    this.matFeito.dispose();
  }
}

const EIXO_Z = new THREE.Vector3(0, 0, 1);

/** Tempo em m:ss.cc — a leitura que uma corrida pede. */
export function formatarTempo(s) {
  if (s === null || s === undefined) return '—';
  const m = Math.floor(s / 60);
  const seg = s - m * 60;
  return `${m}:${seg < 10 ? '0' : ''}${seg.toFixed(2)}`;
}
