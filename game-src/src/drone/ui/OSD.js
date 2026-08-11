import * as THREE from 'three';
import { DCFG } from '../config.js';
import { clamp, damp } from '../../core/MathUtils.js';
import { formatTime } from '../race/Course.js';

/**
 * OSD — a interface sobreposta ao vídeo.
 *
 * ═══ POR QUE "OSD" E NÃO "HUD" ═══
 *
 * Não é preciosismo de vocabulário: é o que a coisa É. Num drone, os números
 * não são desenhados pelo jogo — são desenhados pelo controlador de voo NO
 * SINAL DE VÍDEO ANALÓGICO, antes de ele ser transmitido. É por isso que
 * eles são monocromáticos, de fonte fixa, sem transparência, e é por isso
 * que continuam legíveis quando a imagem está cheia de chuvisco.
 *
 * Todo o visual daqui segue essa lógica. Sem gradientes, sem painéis de
 * vidro fosco, sem sombras coloridas — nada disso caberia num sinal PAL de
 * 625 linhas, e a estética que sai da restrição é justamente a que os
 * pilotos reconhecem.
 *
 * ═══ O QUE ENTRA E O QUE FICA DE FORA ═══
 *
 * Um OSD de verdade tem espaço para uns 12 campos. O que está aqui é o que
 * um piloto de fato olha:
 *
 *   • VOLTAGEM — o instrumento mais importante. Ver o cabeçalho da bateria
 *     em physics/Quad.js: ela afunda sob carga, e é essa oscilação que diz
 *     quanto resta.
 *   • ALTITUDE e VELOCIDADE — as duas que decidem se dá para passar.
 *   • DISTÂNCIA DE CASA — a que decide se dá para voltar.
 *   • HORIZONTE ARTIFICIAL — sem ele, um voo em acro sobre terreno uniforme
 *     é uma adivinhação.
 *
 * ═══ REGRA DE PERFORMANCE ═══
 *
 * Só `transform` e `opacity` mudam por frame — as duas propriedades que o
 * navegador resolve no compositor sem recalcular layout. Barras usam
 * `scaleX`, nunca `width`. Texto só é reescrito quando o VALOR EXIBIDO muda,
 * não quando o número muda: `12.4 V` reescrito 60 vezes por segundo com o
 * mesmo conteúdo ainda custa um reflow.
 */
export class OSD {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="osd__grain" id="osd-grain"></div>
      <div class="osd__vignette"></div>

      <!-- Horizonte artificial -->
      <div class="osd__horizon" id="osd-horizon">
        <div class="osd__horizon-bar"></div>
        <div class="osd__horizon-tick osd__horizon-tick--l"></div>
        <div class="osd__horizon-tick osd__horizon-tick--r"></div>
      </div>

      <!-- Mira fixa: onde o drone aponta -->
      <div class="osd__crosshair">
        <svg viewBox="0 0 40 40"><path d="M8 20 h9 M23 20 h9 M20 8 v4 M20 28 v4"/></svg>
      </div>

      <!-- Marcador do próximo gate -->
      <div class="osd__gate" id="osd-gate">
        <div class="osd__gate-box"></div>
        <div class="osd__gate-label" id="osd-gate-label">1</div>
      </div>

      <!-- Linha superior -->
      <div class="osd__row osd__row--top">
        <div class="osd__cell">
          <span class="osd__big" id="osd-volts">25.2</span><span class="osd__u">V</span>
          <div class="osd__sub"><span id="osd-mah">0</span> mAh · <span id="osd-amps">0</span> A</div>
        </div>
        <div class="osd__cell osd__cell--center">
          <span class="osd__state" id="osd-armed">DESARMADO</span>
          <div class="osd__sub"><span id="osd-mode">ANGLE</span> · <span id="osd-view">FPV</span></div>
        </div>
        <div class="osd__cell osd__cell--right">
          <span class="osd__big" id="osd-lap">--:--.---</span>
          <div class="osd__sub">GATE <span id="osd-gatenum">1/9</span> · REC <span id="osd-best">--:--.---</span></div>
        </div>
      </div>

      <!-- Linha inferior -->
      <div class="osd__row osd__row--bottom">
        <div class="osd__cell">
          <span class="osd__big" id="osd-alt">0</span><span class="osd__u">m</span>
          <div class="osd__sub">VS <span id="osd-vs">0.0</span> m/s</div>
        </div>
        <div class="osd__cell osd__cell--center">
          <div class="osd__throttle">
            <div class="osd__throttle-fill" id="osd-thr"></div>
            <div class="osd__throttle-hover" id="osd-hover"></div>
          </div>
          <div class="osd__sub">ACELERADOR <span id="osd-thrnum">0</span>%</div>
        </div>
        <div class="osd__cell osd__cell--right">
          <span class="osd__big" id="osd-spd">0</span><span class="osd__u">km/h</span>
          <div class="osd__sub">CASA <span id="osd-dist">0</span> m · <span id="osd-time">0:00</span></div>
        </div>
      </div>

      <!-- Avisos e mensagens -->
      <div class="osd__warn" id="osd-warn"></div>
      <div class="osd__msg" id="osd-msg"></div>
      <div class="osd__rth" id="osd-rth"></div>
      <div class="osd__tricks" id="osd-tricks"></div>
    `;

    const $ = (id) => root.querySelector('#' + id);
    this.el = {
      grain: $('osd-grain'),
      horizon: $('osd-horizon'),
      gate: $('osd-gate'), gateLabel: $('osd-gate-label'),
      volts: $('osd-volts'), mah: $('osd-mah'), amps: $('osd-amps'),
      armed: $('osd-armed'), mode: $('osd-mode'), view: $('osd-view'),
      lap: $('osd-lap'), gatenum: $('osd-gatenum'), best: $('osd-best'),
      alt: $('osd-alt'), vs: $('osd-vs'),
      thr: $('osd-thr'), hover: $('osd-hover'), thrnum: $('osd-thrnum'),
      spd: $('osd-spd'), dist: $('osd-dist'), time: $('osd-time'),
      warn: $('osd-warn'), msg: $('osd-msg'), rth: $('osd-rth'), tricks: $('osd-tricks'),
    };

    // Cache dos textos já escritos. Ver a regra de performance no cabeçalho.
    this._text = {};
    this._msgTimer = 0;
    this._warnTimer = 0;
    this._flightTime = 0;
    this._vs = 0;
    this._prevY = 0;

    this._v = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();

    // Marcador do acelerador de pairar: a referência mais útil da barra.
    // Acima dela o drone sobe, abaixo desce. Não muda nunca, então é
    // posicionada uma vez.
    this.el.hover.style.transform = `translateX(${(1 / DCFG.quad.thrustToWeight) * 100}%)`;
  }

  show() { this.root.classList.add('is-visible'); }
  hide() { this.root.classList.remove('is-visible'); }

  /** Escreve só quando o TEXTO muda. Um número reformatado igual ao anterior
   *  ainda causaria invalidação de layout no navegador. */
  _set(key, value) {
    if (this._text[key] === value) return;
    this._text[key] = value;
    this.el[key].textContent = value;
  }

  /** Mensagem grande no centro, por alguns segundos. */
  message(text, duration = 2, kind = '') {
    this.el.msg.textContent = text;
    this.el.msg.className = 'osd__msg is-visible' + (kind ? ' osd__msg--' + kind : '');
    this._msgTimer = duration;
  }

  /** Aviso persistente (bateria, cerca, sinal). Sempre o MAIS GRAVE vence:
   *  empilhar avisos produz uma tela cheia de texto onde nada é lido. */
  _warn(text, kind) {
    this._pendingWarn = { text, kind };
  }

  /**
   * @param {import('../physics/Quad.js').Quad} quad
   * @param {import('../core/DroneInput.js').StickState} stick
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../race/Course.js').Course} course
   * @param {{signalLoss:number, viewName:string, rth:string}} ctx
   */
  update(quad, stick, camera, course, ctx, dt) {
    this._pendingWarn = null;
    if (quad.armed && !quad.crashed) this._flightTime += dt;

    // ── Bateria ───────────────────────────────────────────────────────
    const cell = quad.cellVoltage;
    this._set('volts', quad.voltage.toFixed(1));
    this._set('mah', String(Math.round(quad.mahUsed)));
    this._set('amps', quad.current.toFixed(0));
    const B = DCFG.quad.battery;
    const low = cell < B.warnPerCell;
    this.el.volts.classList.toggle('is-critical', cell < B.sagCutoffPerCell);
    this.el.volts.classList.toggle('is-warn', low && cell >= B.sagCutoffPerCell);
    if (cell < B.sagCutoffPerCell) this._warn('BATERIA CRÍTICA · VOLTE', 'bad');
    else if (low) this._warn('BATERIA BAIXA', 'warn');

    // ── Estado ────────────────────────────────────────────────────────
    this._set('armed', quad.crashed ? 'DESTRUÍDO' : quad.armed ? 'ARMADO' : 'DESARMADO');
    this.el.armed.classList.toggle('is-armed', quad.armed && !quad.crashed);
    this._set('mode', quad.mode === 'acro' ? 'ACRO' : 'ANGLE');
    this._set('view', ctx.viewName);

    // ── Corrida ───────────────────────────────────────────────────────
    this._set('lap', course.running ? formatTime(course.lapTime) : '--:--.---');
    this._set('gatenum', `${course.nextIndex + 1}/${course.gates.length}`);
    this._set('best', formatTime(course.bestLap));

    // ── Voo ───────────────────────────────────────────────────────────
    this._set('alt', String(Math.round(quad.altitudeAGL)));
    // Velocidade vertical suavizada: o valor cru pula demais para ser lido,
    // e VS é um número que se OLHA, não que se mede.
    this._vs = damp(this._vs, quad.velocity.y, 6, dt);
    this._set('vs', (this._vs >= 0 ? '+' : '') + this._vs.toFixed(1));
    this._set('spd', String(Math.round(quad.speed * 3.6)));

    const dist = Math.hypot(quad.position.x - quad.home.x, quad.position.z - quad.home.z);
    this._set('dist', String(Math.round(dist)));
    const t = Math.floor(this._flightTime);
    this._set('time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);

    this.el.thr.style.transform = `scaleX(${stick.throttle})`;
    this._set('thrnum', String(Math.round(stick.throttle * 100)));

    if (dist > DCFG.fence.warnRadius) this._warn('LIMITE DA ÁREA', 'warn');
    if (ctx.signalLoss > 0.55) this._warn('SINAL FRACO', 'warn');

    // ── Acrobacias ────────────────────────────────────────────────────
    const tricks = quad.flips + quad.rolls;
    this._set('tricks', tricks > 0 ? `↻ ${quad.rolls}  ⟳ ${quad.flips}` : '');

    // ── Horizonte artificial ──────────────────────────────────────────
    this._updateHorizon(camera);
    // ── Marcador do próximo gate ──────────────────────────────────────
    this._updateGateMarker(course, camera);

    // ── Chuvisco do link de vídeo ─────────────────────────────────────
    // Opacidade só; a textura é estática no CSS e o deslocamento é feito por
    // `transform`. Reanimar um canvas de ruído por frame custaria mais que
    // toda a interface junta.
    this.el.grain.style.opacity = String(clamp(ctx.signalLoss * 0.85, 0, 0.85));
    if (ctx.signalLoss > 0.02) {
      this.el.grain.style.transform =
        `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 6}px)`;
    }

    // ── RTH ───────────────────────────────────────────────────────────
    this._set('rth', ctx.rth ? `⌂ RTH · ${ctx.rth}` : '');
    this.el.rth.classList.toggle('is-visible', !!ctx.rth);

    // ── Avisos e mensagens ────────────────────────────────────────────
    const w = this._pendingWarn;
    if (w) {
      this._set('warn', w.text);
      this.el.warn.className = 'osd__warn is-visible osd__warn--' + w.kind;
    } else if (this._text.warn !== '') {
      this._set('warn', '');
      this.el.warn.className = 'osd__warn';
    }

    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.el.msg.classList.remove('is-visible');
    }
  }

  /**
   * Horizonte artificial.
   *
   * ═══ A MATEMÁTICA, PORQUE OS SINAIS SÃO FÁCEIS DE ERRAR ═══
   *
   * O horizonte na tela é a projeção do plano horizontal do mundo. Precisamos
   * de duas coisas: o ÂNGULO da linha e a ALTURA dela.
   *
   * ÂNGULO — o "para cima" do mundo, escrito nos eixos da câmera, tem
   * componente `worldUp·direita` no eixo X da tela e `worldUp·cima` no eixo
   * Y. Como esses eixos são unitários, isso é simplesmente `direita.y` e
   * `cima.y`. O ângulo do vetor em relação ao topo da tela é
   * `atan2(direita.y, cima.y)` — e ele entra NEGADO no CSS, porque o CSS
   * mede rotação no sentido horário e a tela tem Y para baixo.
   *
   * ALTURA — a projeção em perspectiva NÃO é linear no ângulo. A altura em
   * pixels é `tan(elevação) / tan(fov/2) × meia-altura`. Usar o ângulo
   * direto (a aproximação óbvia) faz o horizonte "descolar" do terreno
   * conforme a câmera inclina, e o erro cresce justamente nos mergulhos,
   * onde o instrumento é mais necessário.
   */
  _updateHorizon(camera) {
    camera.matrixWorld.extractBasis(this._camRight, this._camUp, this._v);
    // A terceira coluna da base é o +Z da câmera, que aponta para TRÁS.
    this._camFwd.copy(this._v).negate();

    const roll = Math.atan2(this._camRight.y, this._camUp.y);
    const elev = Math.asin(clamp(this._camFwd.y, -1, 1));

    const halfH = window.innerHeight / 2;
    const tanHalfFov = Math.tan((camera.fov * Math.PI / 180) / 2);
    // Clamp: perto de ±90° a tangente explode e o elemento sairia para
    // milhares de pixels, o que em alguns navegadores derruba o compositor.
    const offset = clamp(Math.tan(elev) / tanHalfFov * halfH, -halfH * 2.2, halfH * 2.2);

    this.el.horizon.style.transform =
      `translateY(${offset.toFixed(1)}px) rotate(${(-roll).toFixed(4)}rad)`;
    // Some quando a câmera aponta quase para cima ou para baixo: ali a linha
    // não significa mais nada e só polui.
    this.el.horizon.style.opacity = String(clamp(1.15 - Math.abs(elev) / 1.35, 0, 1));
  }

  /**
   * Marcador do próximo gate.
   *
   * Projeta a posição do gate na tela. Quando ele está atrás da câmera, a
   * projeção do Three devolve coordenadas espelhadas e válidas — o erro
   * clássico é desenhar o marcador do gate que ficou para trás como se
   * estivesse à frente. A verificação do sinal de `z` no espaço da câmera
   * resolve, e é por isso que o marcador vira uma SETA na borda em vez de
   * sumir: em FPV, "para onde eu viro?" é a única pergunta que importa.
   */
  _updateGateMarker(course, camera) {
    const g = course.nextGate;
    // O teste robusto de "atrás da câmera" é o produto escalar com a direção
    // de vista — e não o `z` do NDC, que também passa de 1 no plano `far`.
    this._camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const behind = this._v.copy(g.position).sub(camera.position).dot(this._camFwd) < 0;

    this._v.copy(g.position).project(camera);
    let x = this._v.x, y = this._v.y;
    if (behind) { x = -x; y = -y; }

    const margin = 0.86;
    const off = behind || Math.abs(x) > margin || Math.abs(y) > margin;
    if (off) {
      // Projeta na borda mantendo a DIREÇÃO: uma seta que aponta para o gate
      // é mais útil que um marcador preso num canto.
      const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
      x = (x / m) * margin;
      y = (y / m) * margin;
    }

    const px = (x * 0.5 + 0.5) * window.innerWidth;
    const py = (-y * 0.5 + 0.5) * window.innerHeight;
    this.el.gate.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    this.el.gate.classList.toggle('is-off', off);
    this._set('gateLabel', off ? '▲' : String(g.index === 0 ? 'S' : g.index + 1));
  }

  /** Zera o cronômetro de voo — chamado ao reiniciar a bateria. */
  resetFlightTime() { this._flightTime = 0; }
}
