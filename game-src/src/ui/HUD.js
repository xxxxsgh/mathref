import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';
import { Radar } from './Radar.js';
import { NavMarkers } from './NavMarkers.js';

/**
 * HUD — construída em DOM, atualizada por frame.
 *
 * Duas regras de performance que valem pra toda a UI do projeto:
 *
 *  1. Nada de `innerHTML` no loop. Guardamos referências aos nós na construção
 *     e escrevemos em `textContent`. Recriar HTML 60x/s obriga o navegador a
 *     reparsear e reconstruir a árvore toda vez.
 *  2. Barras animam com `transform: scaleX()`, nunca `width`. `width` dispara
 *     recálculo de layout; `transform` é processado no compositor.
 *
 * Os dois elementos que mais importam pro gameplay não são as barras:
 *
 *  • MARCADOR DE VETOR DE VELOCIDADE — mostra pra onde a nave está de fato
 *    indo, que durante a deriva não é pra onde ela aponta. Sem ele o "peso"
 *    do modelo de voo é sentido mas não é lido.
 *  • RETÍCULO DE PREDIÇÃO — onde mirar pra acertar um alvo em movimento.
 *    Sem ele, liderar o tiro vira adivinhação, e o combate parece injusto.
 */
export class HUD {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <!-- Marcadores de navegação (planetas e estações) -->
      <div class="hud__nav" id="hud-nav"></div>

      <div class="hud__center"></div>

      <div class="hud__reticle" id="hud-reticle">
        <svg viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="14" stroke-width="1.2" opacity="0.55"/>
          <line x1="23" y1="3"  x2="23" y2="10" stroke-width="1.4"/>
          <line x1="23" y1="36" x2="23" y2="43" stroke-width="1.4"/>
          <line x1="3"  y1="23" x2="10" y2="23" stroke-width="1.4"/>
          <line x1="36" y1="23" x2="43" y2="23" stroke-width="1.4"/>
        </svg>
      </div>

      <div class="hud__velocity-marker" id="hud-vel">
        <svg viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="5"/>
          <line x1="13" y1="3" x2="13" y2="8"/>
          <line x1="0"  y1="13" x2="8" y2="13"/>
          <line x1="18" y1="13" x2="26" y2="13"/>
        </svg>
      </div>

      <!-- Retículo de predição: para onde atirar, não onde o alvo está. -->
      <div class="hud__lead" id="hud-lead">
        <svg viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="7.5" stroke-width="1.6"/>
          <circle cx="17" cy="17" r="1.8" fill="currentColor" stroke="none"/>
        </svg>
      </div>

      <!-- Caixa de alvo: enquadra o inimigo travado. -->
      <div class="hud__target" id="hud-target">
        <svg viewBox="0 0 60 60">
          <path d="M6 20 V6 H20" /><path d="M40 6 H54 V20" />
          <path d="M54 40 V54 H40" /><path d="M20 54 H6 V40" />
        </svg>
        <div class="hud__target-dist" id="hud-target-dist"></div>
        <div class="hud__target-bar"><div class="hud__target-bar-fill" id="hud-target-shield"></div></div>
        <div class="hud__target-bar"><div class="hud__target-bar-fill hud__target-bar-fill--hull" id="hud-target-hull"></div></div>
      </div>

      <!-- Seta de alvo fora de tela -->
      <div class="hud__offscreen" id="hud-offscreen">
        <svg viewBox="0 0 24 24"><path d="M12 2 L22 20 H2 Z"/></svg>
      </div>

      <div class="hud__alert" id="hud-alert"></div>

      <div class="hud__corner hud__corner--bl">
        <div class="hud__label">Velocidade</div>
        <div><span class="hud__value" id="hud-speed">0</span><span class="hud__unit">u/s</span></div>
        <div class="hud__bar"><div class="hud__bar-fill" id="hud-speed-bar"></div></div>
      </div>

      <div class="hud__corner hud__corner--br">
        <div class="hud__label">Acelerador</div>
        <div><span class="hud__value" id="hud-throttle">0</span><span class="hud__unit">%</span></div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--throttle" id="hud-throttle-bar"></div></div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--boost" id="hud-boost-bar"></div></div>
      </div>

      <!-- Integridade: escudo em cima do casco, como as camadas de fato são -->
      <div class="hud__corner hud__corner--tl">
        <div class="hud__label">Escudo <span id="hud-shield-num" class="hud__mini"></span></div>
        <div class="hud__bar hud__bar--wide"><div class="hud__bar-fill hud__bar-fill--shield" id="hud-shield-bar"></div></div>
        <div class="hud__label" style="margin-top:8px">Casco <span id="hud-hull-num" class="hud__mini"></span></div>
        <div class="hud__bar hud__bar--wide"><div class="hud__bar-fill hud__bar-fill--hull" id="hud-hull-bar"></div></div>
        <div class="hud__label" style="margin-top:8px">Canhões</div>
        <div class="hud__bar hud__bar--wide"><div class="hud__bar-fill hud__bar-fill--heat" id="hud-heat-bar"></div></div>
      </div>

      <!-- Radar -->
      <div class="hud__radar">
        <canvas id="hud-radar-canvas"></canvas>
        <div class="hud__radar-label" id="hud-contacts">0 contatos</div>
      </div>

      <!-- Painel planetário: só aparece dentro da atmosfera. -->
      <div class="hud__planet" id="hud-planet">
        <div class="hud__label">Altitude</div>
        <div><span class="hud__value" id="hud-alt" style="font-size:22px">0</span><span class="hud__unit">u</span></div>
        <div class="hud__label" style="margin-top:6px">Vertical</div>
        <div><span class="hud__value" id="hud-vspeed" style="font-size:16px">0</span><span class="hud__unit">u/s</span></div>
        <div class="hud__label" style="margin-top:8px">Casco térmico</div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--heat" id="hud-thermal"></div></div>
        <div class="hud__landing" id="hud-landing">
          <div class="hud__landing-ring"><div class="hud__landing-fill" id="hud-landing-fill"></div></div>
          <span id="hud-landing-text">POUSO</span>
        </div>
      </div>

      <!-- Missão atual -->
      <div class="hud__mission">
        <div class="hud__mission-title" id="hud-mission"></div>
        <div class="hud__mission-brief" id="hud-mission-brief"></div>
      </div>

      <!-- Marcador de destino da missão -->
      <div class="hud__waypoint" id="hud-waypoint">
        <svg viewBox="0 0 26 26"><path d="M13 2 L24 13 L13 24 L2 13 Z"/></svg>
        <div class="hud__waypoint-label" id="hud-waypoint-label"></div>
      </div>

      <!-- Carga -->
      <div class="hud__cargo">
        <div class="hud__label">Carga <span class="hud__mini" id="hud-cargo-num"></span></div>
        <div class="hud__bar"><div class="hud__bar-fill hud__bar-fill--cargo" id="hud-cargo-bar"></div></div>
      </div>

      <!-- Aviso de aproximação de planeta -->
      <div class="hud__approach" id="hud-approach">
        <div class="hud__approach-title" id="hud-approach-title"></div>
        <div class="hud__approach-hint" id="hud-approach-hint"></div>
      </div>

      <!-- Botão contextual: aproximar / pousar / decolar / cancelar.
           'data-touch-ui' faz o TouchSource ignorar o toque aqui — sem isso,
           tocar o botão também nasceria um manche flutuante embaixo dele. -->
      <button class="hud__action" id="hud-action" type="button" data-touch-ui>
        <span class="hud__action-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 L12 15 M6 11 L12 17 L18 11 M4 21 L20 21"/></svg>
        </span>
        <span class="hud__action-text">
          <b id="hud-action-label"></b>
          <span id="hud-action-hint"></span>
        </span>
        <kbd class="hud__action-key" id="hud-action-key">L</kbd>
      </button>

      <!-- Painel da corrida de superfície -->
      <div class="hud__race" id="hud-race">
        <div class="hud__race-time" id="hud-race-time">0:00.00</div>
        <div class="hud__race-line">
          <span id="hud-race-cp">0/0</span>
          <span id="hud-race-best"></span>
        </div>
        <div class="hud__race-delta" id="hud-race-delta"></div>
      </div>

      <div class="hud__status" id="hud-status"></div>
      <div class="hud__bigmsg" id="hud-bigmsg"></div>
    `;

    const q = (id) => root.querySelector(`#${id}`);
    this.el = {
      reticle: q('hud-reticle'),
      vel: q('hud-vel'),
      lead: q('hud-lead'),
      target: q('hud-target'),
      targetDist: q('hud-target-dist'),
      targetShield: q('hud-target-shield'),
      targetHull: q('hud-target-hull'),
      offscreen: q('hud-offscreen'),
      alert: q('hud-alert'),
      speed: q('hud-speed'),
      speedBar: q('hud-speed-bar'),
      throttle: q('hud-throttle'),
      throttleBar: q('hud-throttle-bar'),
      boostBar: q('hud-boost-bar'),
      shieldBar: q('hud-shield-bar'),
      shieldNum: q('hud-shield-num'),
      hullBar: q('hud-hull-bar'),
      hullNum: q('hud-hull-num'),
      heatBar: q('hud-heat-bar'),
      contacts: q('hud-contacts'),
      planet: q('hud-planet'),
      alt: q('hud-alt'),
      vspeed: q('hud-vspeed'),
      thermal: q('hud-thermal'),
      landing: q('hud-landing'),
      landingFill: q('hud-landing-fill'),
      mission: q('hud-mission'),
      missionBrief: q('hud-mission-brief'),
      waypoint: q('hud-waypoint'),
      waypointLabel: q('hud-waypoint-label'),
      cargoNum: q('hud-cargo-num'),
      cargoBar: q('hud-cargo-bar'),
      status: q('hud-status'),
      bigmsg: q('hud-bigmsg'),
    };

    this.radar = new Radar(q('hud-radar-canvas'));
    this.nav = new NavMarkers(q('hud-nav'));
    this.el.approach = q('hud-approach');
    this.el.approachTitle = q('hud-approach-title');
    this.el.approachHint = q('hud-approach-hint');
    this.el.race = q('hud-race');
    this.el.raceTime = q('hud-race-time');
    this.el.raceCp = q('hud-race-cp');
    this.el.raceBest = q('hud-race-best');
    this.el.raceDelta = q('hud-race-delta');
    this.el.action = q('hud-action');
    this.el.actionLabel = q('hud-action-label');
    this.el.actionHint = q('hud-action-hint');
    this.el.actionKey = q('hud-action-key');

    /** Preenchido pelo Engine. Chamado no clique/toque do botão contextual. */
    this.onAction = null;
    // `pointerdown` e não `click`: no iPad o `click` sintético chega ~300ms
    // depois do toque em alguns contextos, e num botão de pouso essa demora é
    // sentida como "não funcionou".
    this.el.action.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onAction?.();
    });

    this._proj = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();
    this._cache = {};
    this._lastAlert = null;
    this._bigMsgTimer = 0;
    this._damageFlash = 0;
    this._planetVisible = false;
    this._entryGlow = 0;
    this._invCam = new THREE.Quaternion();
    this._approachTitle = null;
    this._approachHint = null;
    this._actionLabel = null;
    this._actionHint = null;
    this._actionKey = null;
    this._actionOn = false;
    this._raceOn = false;
    /** Injetado pelo Engine: usado pelo radar pra mostrar corpos celestes. */
    this._system = null;
  }

  show() { this.root.classList.add('is-visible'); }

  /** Mensagem grande e temporária no centro (morte, onda, superaquecimento). */
  bigMessage(text, duration = 2.2, tone = '') {
    this.el.bigmsg.textContent = text;
    this.el.bigmsg.className = `hud__bigmsg is-on ${tone ? `is-${tone}` : ''}`;
    this._bigMsgTimer = duration;
  }

  /** Pulso vermelho na borda da tela ao levar dano no casco. */
  flashDamage() { this._damageFlash = 1; }

  /**
   * @param {import('../entities/Ship.js').Ship} ship
   * @param {import('../core/Input.js').ControlState} input
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../systems/Combat.js').Combat} combat
   * @param {number} dt
   */
  update(ship, input, camera, combat, dt, planetary, missions, progression) {
    const f = ship.flight;
    if (missions) this._updateMission(camera, missions);
    if (progression) this._updateCargo(progression);

    if (planetary) { this._updatePlanetary(planetary); this._updateApproach(planetary, ship); }
    this._updateReticle(input);
    this._updateVelocityMarker(f, camera);
    this._updateTargeting(camera, combat);
    this._updateGauges(f, combat);
    this._updateAlerts(f, combat, dt, progression);

    this.nav.update(camera, f.position);
    this.radar.update(f.quaternion, f.position, combat.enemies, combat.currentTarget,
                      this._system);
    this._set('contacts', 'contacts', `${combat.aliveEnemies} contato${combat.aliveEnemies === 1 ? '' : 's'}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  /** Painel de voo atmosférico + vinheta de reentrada. */
  _updatePlanetary(pf) {
    const show = pf.inAtmosphere;
    if (show !== this._planetVisible) {
      this._planetVisible = show;
      this.el.planet.classList.toggle('is-on', show);
    }
    if (!show) {
      if (this._entryGlow !== 0) {
        this._entryGlow = 0;
        this.root.style.setProperty('--entry-glow', '0');
      }
      return;
    }

    const alt = Math.round(pf.altitude);
    this._set('alt', 'alt', String(alt));
    const vs = Math.round(pf.verticalSpeed);
    this._set('vspeed', 'vspeed', (vs > 0 ? '+' : '') + vs);
    this.el.vspeed.classList.toggle('is-bad', vs < -CONFIG.surface.crashSpeed);

    this.el.thermal.style.transform = `scaleX(${Math.min(1, pf.heat)})`;
    this.el.thermal.classList.toggle('is-critical', pf.heat > 0.85);

    // Indicador de pouso: um anel que preenche enquanto as condições são
    // mantidas. Sem ele, "por que não pousou ainda?" não tem resposta visível.
    const lp = pf.landingProgress;
    this.el.landing.classList.toggle('is-on', lp > 0.01);
    this.el.landingFill.style.transform = `scaleX(${lp})`;

    // Vinheta de reentrada dirigida por custom property — o navegador anima
    // no compositor, sem tocar no layout.
    const glow = pf.entryEffect;
    if (Math.abs(glow - this._entryGlow) > 0.01) {
      this._entryGlow = glow;
      this.root.style.setProperty('--entry-glow', String(glow));
    }
  }

  /** Linha de missão + marcador de destino projetado na tela. */
  _updateMission(camera, missions) {
    this._set('mission', 'mission', missions.statusText);
    const m = missions.current;
    this._set('missionBrief', 'missionBrief', m?.brief ?? '');

    if (!missions.hasMarker || missions.completed) {
      this.el.waypoint.style.opacity = '0';
      return;
    }

    this._proj.copy(missions.marker).project(camera);
    const onScreen = this._proj.z < 1 &&
      Math.abs(this._proj.x) < 0.94 && Math.abs(this._proj.y) < 0.94;

    const dist = Math.round(missions.marker.distanceTo(camera.position));
    this._set('waypointLabel', 'wpLabel', `${missions.markerLabel} · ${dist}`);

    if (onScreen) {
      const x = this._proj.x * window.innerWidth * 0.5;
      const y = -this._proj.y * window.innerHeight * 0.5;
      this.el.waypoint.style.transform = `translate(${x}px, ${y}px)`;
    } else {
      // Fora de tela: gruda na borda, na direção correta. Mesma matemática do
      // marcador de alvo — sem isso, "voe até tal lugar" não diz pra onde.
      this._tmp.copy(missions.marker).sub(camera.position);
      this._tmp.applyQuaternion(this._invCam.copy(camera.quaternion).conjugate());
      let ang = Math.atan2(this._tmp.x, -this._tmp.y);
      if (this._tmp.z > 0) ang = Math.atan2(-this._tmp.x, this._tmp.y);
      const mgn = CONFIG.hud.offscreenMargin;
      const px = Math.sin(ang) * (window.innerWidth * 0.5 - mgn);
      const py = -Math.cos(ang) * (window.innerHeight * 0.5 - mgn);
      this.el.waypoint.style.transform = `translate(${px}px, ${py}px)`;
    }
    this.el.waypoint.style.opacity = '1';
  }

  _updateCargo(progression) {
    this._set('cargoNum', 'cargoNum', `${progression.cargo}/${progression.cargoCapacity}`);
    this.el.cargoBar.style.transform = `scaleX(${progression.cargoPct})`;
    this.el.cargoBar.classList.toggle('is-critical', progression.cargoFull);
  }

  /**
   * Aviso de aproximação de planeta.
   *
   * Sem isso, chegar perto de um planeta não produz nenhuma resposta da
   * interface, e o jogador não tem como saber que pousar é possível — muito
   * menos QUE condições o pouso exige. A dica muda conforme a fase da
   * aproximação, virando um tutorial passivo.
   */
  _updateApproach(pf, ship) {
    let title = '';
    let hint = '';

    if (pf.planet && Number.isFinite(pf.altitude)) {
      const nome = `PLANETA ${pf.planet.spec.name}`;
      if (pf.landed) {
        title = `${nome} · POUSADO`;
        hint = 'Acelerador para decolar';
      } else if (pf.landingProgress > 0.01) {
        title = `${nome} · POUSANDO`;
        hint = 'Mantenha estável';
      } else if (pf.altitude < 260) {
        title = nome;
        hint = 'Freie e corte o acelerador — ou use POUSAR';
      } else if (pf.heat > 0.55) {
        title = `${nome} · REENTRADA`;
        hint = 'Freie — o casco está aquecendo';
      } else if (pf.inAtmosphere) {
        title = `${nome} · ATMOSFERA`;
        hint = `Altitude ${Math.round(pf.altitude)} · desça devagar`;
      }
    }

    if (title !== this._approachTitle) {
      this._approachTitle = title;
      this.el.approachTitle.textContent = title;
      this.el.approachHint.textContent = hint;
      this.el.approach.classList.toggle('is-on', title !== '');
    } else if (hint !== this._approachHint) {
      this._approachHint = hint;
      this.el.approachHint.textContent = hint;
    }
  }

  /**
   * Botão contextual de aproximar / pousar / decolar.
   *
   * Um botão só, e o rótulo muda conforme a situação. A alternativa — três
   * botões, dois deles sempre inúteis — ocuparia o triplo do espaço numa tela
   * de iPad em paisagem e ainda obrigaria o jogador a decidir qual apertar,
   * quando em qualquer momento só existe uma resposta certa.
   *
   * @param {import('../systems/Autopilot.js').Autopilot} ap
   * @param {import('../core/Input.js').ControlState} input
   */
  setAutopilot(ap, input) {
    let label = '';
    let hint = '';

    if (ap.active) {
      label = 'CANCELAR';
      hint = ap.mode === 'approach'
        ? `APROXIMANDO · ${formatDistance(ap.targetDistance)}`
        : ap.mode === 'land'
          ? `POUSANDO · ${formatDistance(ap.targetDistance)}`
          : 'DECOLANDO';
    } else if (ap.action) {
      label = ap.action.label;
      hint = ap.action.hint;
    }

    const on = label !== '';
    if (on !== this._actionOn) {
      this._actionOn = on;
      this.el.action.classList.toggle('is-on', on);
    }
    this.el.action.classList.toggle('is-engaged', ap.active);
    if (!on) return;

    if (label !== this._actionLabel) {
      this._actionLabel = label;
      this.el.actionLabel.textContent = label;
    }
    if (hint !== this._actionHint) {
      this._actionHint = hint;
      this.el.actionHint.textContent = hint;
    }

    // A dica de tecla depende do que o jogador está usando AGORA. No touch ela
    // some: o botão é o controle, e mostrar "L" ao lado dele seria ruído.
    const key = input.source === 'gamepad' ? 'Y' : input.source === 'touch' ? '' : 'L';
    if (key !== this._actionKey) {
      this._actionKey = key;
      this.el.actionKey.textContent = key;
      this.el.actionKey.style.display = key ? '' : 'none';
    }
  }

  /**
   * Painel da corrida.
   *
   * Fica no alto à esquerda do centro e não num canto: num circuito você está
   * olhando pra frente o tempo todo, e um cronômetro num canto da tela obriga
   * a desviar o olhar exatamente quando não dá.
   *
   * @param {import('../systems/SurfaceRace.js').SurfaceRace} race
   */
  setRace(race, formatar) {
    const on = race.estado === 'correndo' || race.estado === 'concluida';
    if (on !== this._raceOn) {
      this._raceOn = on;
      this.el.race.classList.toggle('is-on', on);
    }
    if (!on) return;

    this._set('raceTime', 'raceTime', formatar(race.tempo));
    this._set('raceCp', 'raceCp', `ARGOLA ${Math.min(race.indice + 1, race.total)}/${race.total}`);
    this._set('raceBest', 'raceBest',
      race.recorde !== null ? `RECORDE ${formatar(race.recorde)}` : 'SEM RECORDE');

    // Diferença contra o recorde, só quando existe um. É o número que
    // transforma uma volta solitária numa disputa.
    let delta = '';
    if (race.estado === 'concluida') {
      delta = race.novoRecorde ? 'NOVO RECORDE' : `+${(race.tempo - race.recorde).toFixed(2)}s`;
    }
    this._set('raceDelta', 'raceDelta', delta);
    this.el.raceDelta.classList.toggle('is-good', race.novoRecorde);
  }

  _updateReticle(input) {
    if (input.aimActive && input.source === 'keyboard') {
      const half = Math.min(window.innerWidth, window.innerHeight) * 0.5;
      this.el.reticle.style.transform =
        `translate(${input.aimX * half}px, ${input.aimY * half}px)`;
      this.el.reticle.style.opacity = '1';
    } else {
      this.el.reticle.style.opacity = '0';
    }
  }

  _updateVelocityMarker(f, camera) {
    // Projeta a direção da velocidade no plano da tela. Se o vetor estiver
    // atrás da câmera (voando de ré), esconde — projetar aí produz uma
    // posição espelhada e sem sentido.
    if (f.speed > 4) {
      this._proj.copy(f.velocity).normalize().add(f.position).project(camera);
      if (this._proj.z < 1) {
        const x = this._proj.x * window.innerWidth * 0.5;
        const y = -this._proj.y * window.innerHeight * 0.5;
        this.el.vel.style.transform = `translate(${x}px, ${y}px)`;
        this.el.vel.style.opacity = String(clamp(f.lateralSpeed / 22, 0.16, 1));
        return;
      }
    }
    this.el.vel.style.opacity = '0';
  }

  _updateTargeting(camera, combat) {
    const target = combat.currentTarget;
    if (!target || !target.active) {
      this.el.target.style.opacity = '0';
      this.el.lead.style.opacity = '0';
      this.el.offscreen.style.opacity = '0';
      return;
    }

    // ── Caixa em volta do alvo ──────────────────────────────────
    this._proj.copy(target.position).project(camera);
    const onScreen = this._proj.z < 1 &&
      Math.abs(this._proj.x) < 1 && Math.abs(this._proj.y) < 1;

    if (onScreen) {
      const x = this._proj.x * window.innerWidth * 0.5;
      const y = -this._proj.y * window.innerHeight * 0.5;
      // A caixa encolhe com a distância, como um objeto real faria. Tamanho
      // fixo faria um alvo distante parecer estar do lado.
      const dist = target.position.distanceTo(camera.position);
      const scale = clamp(360 / dist, 0.42, 1.7);
      this.el.target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      this.el.target.style.opacity = '1';
      this.el.offscreen.style.opacity = '0';

      this._set('targetDist', 'tdist', `${Math.round(dist)}`);
      this.el.targetShield.style.transform = `scaleX(${target.health.shieldPct})`;
      this.el.targetHull.style.transform = `scaleX(${target.health.hullPct})`;
    } else {
      // ── Seta de fora de tela ─────────────────────────────────────
      // Sem isso, perder o alvo de vista significa perdê-lo de vez: em 6DOF
      // não há "virar a cabeça" pra procurar.
      this.el.target.style.opacity = '0';
      this._tmp.copy(target.position).sub(camera.position);
      // Leva pro espaço da câmera pra saber se está à frente ou atrás.
      this._tmp.applyQuaternion(this._invCam.copy(camera.quaternion).conjugate());
      let ang = Math.atan2(this._tmp.x, -this._tmp.y);
      // Alvo ATRÁS: a direção na tela é a oposta.
      if (this._tmp.z > 0) ang = Math.atan2(-this._tmp.x, this._tmp.y);

      const m = CONFIG.hud.offscreenMargin;
      const rx = window.innerWidth * 0.5 - m;
      const ry = window.innerHeight * 0.5 - m;
      const px = Math.sin(ang) * rx;
      const py = -Math.cos(ang) * ry;
      this.el.offscreen.style.transform =
        `translate(${px}px, ${py}px) rotate(${ang}rad)`;
      this.el.offscreen.style.opacity = '1';
    }

    // ── Retículo de predição ────────────────────────────────────────
    if (combat.hasLead) {
      this._proj.copy(combat.leadPoint).project(camera);
      if (this._proj.z < 1) {
        const x = this._proj.x * window.innerWidth * 0.5;
        const y = -this._proj.y * window.innerHeight * 0.5;
        this.el.lead.style.transform = `translate(${x}px, ${y}px)`;
        this.el.lead.style.opacity = '1';
      } else {
        this.el.lead.style.opacity = '0';
      }
    } else {
      this.el.lead.style.opacity = '0';
    }
  }

  _updateGauges(f, combat) {
    const h = combat.playerHealth;

    this._set('speed', 'speed', String(Math.round(f.speed)));
    this._set('throttle', 'throttle', String(Math.round(f.throttle * 100)));
    this._set('shieldNum', 'shieldNum', `${Math.round(h.shield)}`);
    this._set('hullNum', 'hullNum', `${Math.round(h.hull)}`);

    const maxRef = CONFIG.flight.maxSpeed * CONFIG.flight.boostMultiplier;
    this.el.speedBar.style.transform = `scaleX(${clamp(f.speed / maxRef, 0, 1)})`;
    this.el.throttleBar.style.transform = `scaleX(${f.throttle})`;
    // A barra mostra o TANQUE, não se o boost está ligado. Um indicador
    // aceso/apagado não responde à única pergunta que importa no meio de uma
    // fuga: quanto ainda dá pra correr.
    this.el.boostBar.style.transform = `scaleX(${f.boostPct})`;
    this.el.boostBar.classList.toggle('is-critical', f.boostPct < 0.25);
    this.el.shieldBar.style.transform = `scaleX(${h.shieldPct})`;
    this.el.hullBar.style.transform = `scaleX(${h.hullPct})`;
    this.el.heatBar.style.transform = `scaleX(${combat.heatPct})`;

    // Casco baixo fica vermelho e pulsa. É o aviso que o jogador vê pela
    // visão periférica, sem tirar os olhos do centro da tela.
    this.el.hullBar.classList.toggle('is-critical', h.hullPct < 0.3);
    this.el.heatBar.classList.toggle('is-critical', combat.isOverheated);
    // Escudo caído mas em recarga: mostra o progresso do atraso, senão a
    // mecânica de regeneração é invisível pro jogador.
    this.el.shieldBar.classList.toggle('is-regen', h.shield < h.shieldMax && h.regenProgress >= 1);
  }

  _updateAlerts(f, combat, dt, progression) {
    if (this._bigMsgTimer > 0) {
      this._bigMsgTimer -= dt;
      if (this._bigMsgTimer <= 0) this.el.bigmsg.className = 'hud__bigmsg';
    }

    if (this._damageFlash > 0) {
      this._damageFlash = Math.max(0, this._damageFlash - dt * 2.6);
      this.root.style.setProperty('--damage-flash', String(this._damageFlash));
    }

    let alert = null;
    if (combat.isOverheated) alert = 'CANHÕES SUPERAQUECIDOS';
    else if (!f.assistEnabled) alert = 'ASSISTÊNCIA DE VOO DESLIGADA';
    else if (combat.playerHealth.hullPct < 0.25) alert = 'CASCO CRÍTICO';

    if (alert !== this._lastAlert) {
      this.el.alert.textContent = alert ?? '';
      this.el.alert.classList.toggle('is-on', alert !== null);
      this._lastAlert = alert;
    }

    const recorde = progression?.stats.bestWave ?? 0;
    this._set('status', 'status',
      `ONDA ${combat.waveIndex}  ·  ABATES ${combat.kills}`
      + (recorde > 0 ? `  ·  RECORDE ${recorde}` : ''));
  }

  /** Escreve em `textContent` só quando o valor mudou. */
  _set(key, cacheKey, value) {
    if (this._cache[cacheKey] === value) return;
    this._cache[cacheKey] = value;
    const el = this.el[key];
    if (el) el.textContent = value;
  }
}

/** Distância legível. Números de cinco dígitos no HUD viram ruído: o que o
 *  jogador precisa saber é a ordem de grandeza, não a unidade. */
function formatDistance(d) {
  if (!Number.isFinite(d)) return '—';
  if (d <= 0) return 'CHEGANDO';
  if (d >= 1000) return `${(d / 1000).toFixed(1)} km`;
  return `${Math.round(d)} u`;
}
