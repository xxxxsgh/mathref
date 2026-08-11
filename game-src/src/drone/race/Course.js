import * as THREE from 'three';
import { DCFG } from '../config.js';
import { createRng, rngHelpers } from '../../procgen/rng.js';

/**
 * Circuito de gates.
 *
 * ═══ A DETECÇÃO NÃO PODE SER POR DISTÂNCIA ═══
 *
 * O jeito ingênuo de detectar a passagem é `distancia(drone, gate) < raio`.
 * Isso falha de duas maneiras, e as duas acontecem sempre:
 *
 *   1. TÚNEL. A 30 m/s e 60 fps, o drone anda 50 cm por frame; num frame
 *      lento (120 ms), 3,6 metros. Um gate tem 4 metros de vão. O drone
 *      atravessa entre dois frames e o teste nunca vê a proximidade. O
 *      sintoma é o pior possível: o jogador passa pelo gate, vê que passou,
 *      e o jogo diz que não. Nada destrói mais rápido a confiança num jogo
 *      de corrida.
 *   2. Passar RASPANDO POR FORA conta, porque a distância ao centro não
 *      sabe distinguir "atravessou o vão" de "passou ao lado".
 *
 * A solução é testar o SEGMENTO percorrido no frame contra o PLANO do gate.
 * Se as extremidades do segmento estão em lados opostos do plano, houve
 * travessia — em qualquer velocidade, com qualquer dt. O ponto exato de
 * cruzamento sai da interpolação, e é nele que se testa se passou dentro do
 * vão. Isso é exato, não aproximado, e custa dois produtos escalares.
 *
 * ═══ SÓ O PRÓXIMO GATE CONTA ═══
 *
 * A ordem é obrigatória. Sem ela o circuito vira "voe por nove argolas em
 * qualquer ordem", que não é um traçado — e traçado é o que se aprende e o
 * que se melhora numa corrida.
 */

const STORAGE_KEY = 'drone-vale.recordes.v1';

export class Course {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../world/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'circuito';
    scene.add(this.group);

    /** @type {Array<{position:THREE.Vector3, normal:THREE.Vector3, right:THREE.Vector3, up:THREE.Vector3, index:number, mesh:THREE.Group, material:THREE.MeshStandardMaterial}>} */
    this.gates = [];
    this._buildGates();

    this.nextIndex = 0;
    this.lap = 0;
    this.lapTime = 0;
    this.running = false;
    this.lastLap = 0;
    this.bestLap = this._loadBest();
    /** Marca a volta em que o recorde caiu, para a HUD comemorar uma vez só. */
    this.justRecord = false;

    this._prev = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._hasPrev = false;
    this._pulse = 0;
  }

  /** Círculos onde não deve nascer obstáculo. Chamado antes de gerar os props:
   *  uma árvore dentro de um gate é um acidente que o jogador não tem como
   *  prever e não tem como evitar. */
  get exclusions() {
    return this.gates.map((g) => ({ x: g.position.x, z: g.position.z, r: 14 }));
  }

  _buildGates() {
    const C = DCFG.course;
    const r = rngHelpers(createRng(DCFG.world.seed + '-course'));
    const pts = [];

    for (let i = 0; i < C.gates; i++) {
      const a = (i / C.gates) * Math.PI * 2;
      // Raio variável por gate: um círculo perfeito produz um traçado de
      // uma curva só, onde não há nada para decidir. A variação cria retas,
      // curvas fechadas e mudanças de altura — que é onde está o traçado.
      const rad = C.radius + r.range(-C.radiusJitter, C.radiusJitter);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const ground = this.terrain.heightAt(x, z);
      const h = r.range(C.heightMin, C.heightMax);
      pts.push(new THREE.Vector3(x, ground + h, z));
    }

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      // A normal do gate é a tangente do traçado: o gate fica de frente para
      // quem chega. Usar a direção do próximo ponto só produziria gates
      // tortos nas curvas, onde a entrada não é a saída.
      const normal = new THREE.Vector3().subVectors(next, prev).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, normal).normalize();
      // Reortogonaliza o "para cima" do gate: em trechos muito inclinados o
      // (0,1,0) não é perpendicular à tangente e o quadro sairia enviesado.
      const gUp = new THREE.Vector3().crossVectors(normal, right).normalize();

      const { mesh, material } = this._gateMesh(i, p, normal, right, gUp);
      this.group.add(mesh);
      this.gates.push({ position: p, normal, right, up: gUp, index: i, mesh, material });
    }
  }

  /** Quadro do gate: quatro barras e dois pilares até o chão quando é baixo.
   *  Os pilares não são enfeite — eles ancoram o gate visualmente ao terreno.
   *  Um quadrado flutuando no ar não dá nenhuma pista de altura. */
  _gateMesh(i, pos, normal, right, up) {
    const C = DCFG.course;
    const g = new THREE.Group();
    const a = C.aperture;
    const bar = 0.28;

    const isStart = i === 0;
    const material = new THREE.MeshStandardMaterial({
      color: isStart ? 0xffd23f : 0xff5a3c,
      emissive: isStart ? 0x6b4a00 : 0x4a1200,
      emissiveIntensity: 1,
      roughness: 0.5,
      metalness: 0.2,
    });

    const hGeo = new THREE.BoxGeometry(a * 2 + bar, bar, bar);
    const vGeo = new THREE.BoxGeometry(bar, a * 2 + bar, bar);
    for (const dy of [-a, a]) {
      const m = new THREE.Mesh(hGeo, material);
      m.position.copy(up).multiplyScalar(dy);
      g.add(m);
    }
    for (const dx of [-a, a]) {
      const m = new THREE.Mesh(vGeo, material);
      m.position.copy(right).multiplyScalar(dx);
      g.add(m);
    }

    // Pilares até o chão.
    const ground = this.terrain.heightAt(pos.x, pos.z);
    const legH = pos.y - a - ground;
    if (legH > 0.5) {
      const legGeo = new THREE.BoxGeometry(0.16, legH, 0.16);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x2f3439, roughness: 0.9 });
      for (const dx of [-a, a]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.copy(right).multiplyScalar(dx);
        leg.position.y = -a - legH / 2;
        g.add(leg);
      }
    }

    // Número do gate, desenhado num canvas. Voando em FPV não há minimapa;
    // o número é o que responde "qual é o próximo?" sem tirar os olhos da
    // imagem.
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({
        map: makeNumberTexture(i === 0 ? 'S' : String(i + 1)),
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    label.position.copy(up).multiplyScalar(a + 1.2);
    // Meia-volta: o +Z do plano aponta ao longo da normal do gate, que é o
    // sentido de PASSAGEM — ou seja, para longe de quem está chegando. Sem
    // esta rotação o piloto vê o VERSO da placa e o número aparece espelhado
    // (um "2" vira algo entre um "S" e um borrão, que foi como isto apareceu
    // na primeira captura de tela).
    label.rotation.y = Math.PI;
    g.add(label);

    g.position.copy(pos);
    // Orienta o grupo inteiro: as barras já foram posicionadas nos eixos do
    // gate, então basta a rotação do quadro olhar ao longo da normal.
    const m4 = new THREE.Matrix4().makeBasis(right, up, normal);
    g.quaternion.setFromRotationMatrix(m4);
    // As barras foram posicionadas em espaço de MUNDO acima; desfaz a
    // rotação nelas para que a orientação do grupo não a aplique duas vezes.
    const inv = g.quaternion.clone().invert();
    for (const child of g.children) child.position.applyQuaternion(inv);
    // As ROTAÇÕES das BARRAS ficam na identidade de propósito: o eixo X local
    // de uma barra já vira `right` quando o grupo rotaciona. Corrigir também
    // a rotação delas aplicaria a orientação duas vezes. (A placa do número é
    // a exceção, e o porquê está junto dela.)

    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { mesh: g, material };
  }

  // ─────────────────────────────────────────────────────────────────────
  /** Posição do próximo gate — para a seta da HUD e para o respawn. */
  get nextGate() { return this.gates[this.nextIndex]; }

  /**
   * Avisa que o drone foi TELEPORTADO (respawn, bateria nova).
   *
   * ═══ POR QUE ISTO É OBRIGATÓRIO ═══
   *
   * A detecção por travessia de plano compara a posição deste frame com a do
   * frame anterior. Num teleporte esse "segmento" tem centenas de metros e
   * atravessa meio mapa — inclusive o plano do próximo gate, que passaria a
   * contar como cruzado sem que o drone tenha chegado perto dele.
   *
   * É o efeito colateral direto da escolha de detectar por segmento em vez
   * de por distância, e a única forma de evitá-lo é o teleporte se declarar.
   */
  notifyTeleport() {
    this._hasPrev = false;
  }

  reset() {
    this.nextIndex = 0;
    this.lap = 0;
    this.lapTime = 0;
    this.running = false;
    this._hasPrev = false;
  }

  /** Volta ao gate anterior depois de um acidente. Recomeçar do zero a cada
   *  batida transformaria o circuito num exercício de memorização; voltar ao
   *  último gate conquistado é o que mantém a tentativa viva. */
  respawnPoint(out = new THREE.Vector3()) {
    const idx = (this.nextIndex - 1 + this.gates.length) % this.gates.length;
    const g = this.gates[idx];
    // Um pouco ANTES do gate e acima: nascer dentro do quadro faria o
    // primeiro movimento ser uma colisão.
    return out.copy(g.position).addScaledVector(g.normal, -6).setY(g.position.y + 1.5);
  }

  /** Direção em que olhar ao renascer: para o próximo gate. */
  respawnHeading() {
    const g = this.nextGate;
    const from = this.respawnPoint(this._local);
    return Math.atan2(-(g.position.x - from.x), -(g.position.z - from.z));
  }

  /**
   * @param {THREE.Vector3} position posição do drone NESTE frame
   * @param {number} dt
   * @returns {{crossed:boolean, lapDone:boolean, record:boolean, gate:number}}
   */
  update(position, dt) {
    const out = { crossed: false, lapDone: false, record: false, gate: this.nextIndex };
    this._pulse += dt;

    if (this.running) this.lapTime += dt;

    if (!this._hasPrev) {
      this._prev.copy(position);
      this._hasPrev = true;
      this._updateVisuals();
      return out;
    }

    const g = this.nextGate;
    // Distância assinada do ponto anterior e do atual ao plano do gate.
    const d0 = this._local.copy(this._prev).sub(g.position).dot(g.normal);
    const d1 = this._local.copy(position).sub(g.position).dot(g.normal);

    // Cruzou de trás para a frente neste frame? O sentido importa: voltar
    // atravessando o gate ao contrário não pode contar como passagem.
    if (d0 < 0 && d1 >= 0) {
      // Fração do segmento em que o plano foi atingido. Note que `_prev`
      // ainda NÃO foi atualizado — o ponto de cruzamento precisa dos dois
      // extremos do segmento, e sobrescrever antes daqui foi um bug real:
      // a interpolação virava `position + t·0` e o teste do vão passava a
      // ser feito na posição final, não no ponto onde o gate foi cruzado.
      const t = d0 / (d0 - d1);
      this._hit.copy(position).sub(this._prev).multiplyScalar(t).add(this._prev);
      this._local.copy(this._hit).sub(g.position);
      const lx = Math.abs(this._local.dot(g.right));
      const ly = Math.abs(this._local.dot(g.up));
      const lim = DCFG.course.aperture * DCFG.course.forgiveness;

      if (lx <= lim && ly <= lim) {
        out.crossed = true;
        out.gate = this.nextIndex;
        this._advance(out);
      }
    }

    this._prev.copy(position);
    this._updateVisuals();
    return out;
  }

  _advance(out) {
    if (this.nextIndex === 0) {
      if (this.running) {
        // Fechou a volta.
        this.lastLap = this.lapTime;
        out.lapDone = true;
        this.lap++;
        if (!this.bestLap || this.lapTime < this.bestLap) {
          this.bestLap = this.lapTime;
          this._saveBest();
          out.record = true;
          this.justRecord = true;
        }
      }
      // Cruzar a linha de partida sempre reinicia o cronômetro: é a mesma
      // passagem que fecha uma volta e abre a seguinte.
      this.running = true;
      this.lapTime = 0;
    }
    this.nextIndex = (this.nextIndex + 1) % this.gates.length;
  }

  /** O próximo gate pulsa e os outros ficam apagados. É a única indicação de
   *  ordem que existe no mundo 3D, e ela precisa ser legível de 300 metros. */
  _updateVisuals() {
    for (const g of this.gates) {
      const isNext = g.index === this.nextIndex;
      const target = isNext ? 1.6 + Math.sin(this._pulse * 5) * 0.7 : 0.12;
      g.material.emissiveIntensity = target;
      g.material.emissive.setHex(isNext ? 0x39ff88 : (g.index === 0 ? 0x6b4a00 : 0x4a1200));
      g.material.color.setHex(isNext ? 0x9dffc4 : (g.index === 0 ? 0xffd23f : 0xff5a3c));
    }
  }

  _loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      return typeof data?.bestLap === 'number' ? data.bestLap : 0;
    } catch { return 0; }
  }

  _saveBest() {
    // localStorage lança em modo privado no Safari e quando a cota estoura.
    // Perder um recorde é aceitável; derrubar o jogo por causa dele não é.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestLap: this.bestLap }));
    } catch { /* sem armazenamento: o recorde vale só nesta sessão */ }
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose?.();
      o.material?.dispose?.();
    });
  }
}

/** Textura com um número, desenhada num canvas. Um canvas de 128px por gate
 *  é mais barato — em bytes e em código — que qualquer fonte 3D. */
function makeNumberTexture(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(8,14,20,0.72)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 112, 18);
  ctx.fill();
  ctx.strokeStyle = '#7de8ff';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#eafaff';
  ctx.font = 'bold 74px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** m:ss.mmm — o formato de qualquer cronômetro de corrida. */
export function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
