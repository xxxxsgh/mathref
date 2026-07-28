import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../core/MathUtils.js';

/**
 * Piloto automático: aproximar, pousar e decolar num botão só.
 *
 * ═══ A DECISÃO CENTRAL: ELE NÃO MOVE A NAVE ═══
 *
 * A implementação óbvia seria escrever direto em `flight.position` e
 * interpolar até o chão. Seria muito mais curta — e estaria errada, por dois
 * motivos que só aparecem jogando:
 *
 *  1. Vira teletransporte. A nave deixa de ter massa no exato momento em que
 *     o piloto automático liga, e o corte é sentido: a inércia some, a deriva
 *     lateral some, a câmera para de balançar. O jogo inteiro muda de textura
 *     por 40 segundos.
 *  2. Cria uma SEGUNDA física. Qualquer ajuste no FlightModel — e você vai
 *     ajustar, é o arquivo que define o feel — passa a valer só metade do
 *     tempo, e a outra metade começa a divergir em silêncio.
 *
 * Então este arquivo não move nada. Ele ESCREVE NO MESMO `ControlState` que o
 * jogador escreve: pitch, yaw, roll, acelerador, freio, propulsores. São mãos
 * virtuais no mesmo manche. Todo o voo continua saindo do FlightModel, com a
 * mesma inércia rotacional, a mesma deriva e o mesmo arrasto atmosférico.
 *
 * O efeito colateral bom disso: assumir o controle no meio é instantâneo e
 * contínuo. Não há estado a desfazer — basta parar de escrever.
 *
 * ═══ AS TRÊS FASES ═══
 *
 *   APROXIMAR  fora da atmosfera: aponta pro planeta, acelera, e usa o
 *              cruzeiro pra atravessar dezenas de milhares de unidades.
 *              Freia antes de tocar a atmosfera, senão a reentrada cozinha
 *              o casco (o calor cresce com v³).
 *   POUSAR     dentro da atmosfera: nivela no horizonte local, freia, e
 *              serve a velocidade vertical com os propulsores até encostar.
 *   DECOLAR    pousado: nariz pra cima e acelerador cheio até sair.
 *
 * A transição entre elas é automática — o botão é sempre "a próxima coisa
 * óbvia", que é o que faz um botão só bastar.
 */

/** @enum {string} */
export const AP = {
  OFF: 'off',
  APPROACH: 'approach',
  LAND: 'land',
  TAKEOFF: 'takeoff',
};

export class Autopilot {
  constructor() {
    /** @type {string} */
    this.mode = AP.OFF;
    /** Planeta que está sendo trabalhado nesta sessão de piloto automático. */
    this.planet = null;
    /** Ação disponível agora: {id, label, hint} ou null se não há nenhuma. */
    this.action = null;
    /** Última razão de desengate, pra HUD poder dizer o que houve. */
    this.lastMessage = null;
    /** Distância até a superfície do alvo (para a HUD). Infinity fora de fase. */
    this.targetDistance = Infinity;

    this._request = false;
    this._timer = 0;
    /** Comando do jogador no instante do engate. Ver _playerIsFlying. */
    this._base = null;
    this._writtenThrottle = null;
    this._probeTimer = 0;
    this._probeDir = null;
    /** Segundos restantes de bloqueio de cruzeiro por dano recebido. */
    this._underFire = 0;
    this._lastHp = null;

    // Nenhum destes aloca no loop.
    this._dir = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._heading = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._localUp = new THREE.Vector3();
    this._invQ = new THREE.Quaternion();
    // Vetores exclusivos das sondas de terreno. Separados dos de cima de
    // propósito: `_driestDirection` roda NO MEIO do cálculo de rumo, e
    // reaproveitar `_dir` ali apagaria o rumo já calculado — de forma
    // intermitente, porque a sonda só roda a cada 0,4 s.
    this._probe = new THREE.Vector3();
    this._probeFwd = new THREE.Vector3();
    this._probeTan = new THREE.Vector3();
    this._probePos = new THREE.Vector3();
    this._probeBest = new THREE.Vector3();
  }

  get active() { return this.mode !== AP.OFF; }

  /** Chamado pela tecla, pelo botão da HUD ou pelo gamepad. */
  request() { this._request = true; }

  /** @param {string|null} message */
  disengage(message = null) {
    if (this.mode === AP.OFF) return;
    this.mode = AP.OFF;
    this.planet = null;
    this.targetDistance = Infinity;
    this._writtenThrottle = null;
    this._base = null;
    this.lastMessage = message;
  }

  /**
   * @param {import('../core/Input.js').ControlState} s  estado JÁ preenchido
   *   pelo jogador — lido para detectar retomada manual, e depois sobrescrito.
   * @param {import('./FlightModel.js').FlightModel} flight
   * @param {import('./PlanetaryFlight.js').PlanetaryFlight} pf
   * @param {import('./PlanetSurface.js').PlanetSurface} surface
   * @param {import('../procgen/SolarSystem.js').SolarSystem} system
   * @param {{ enemies: Array, aliveEnemies: number }} combat
   * @param {number} dt
   * @returns {{ landed: boolean, engaged: string|null, disengaged: string|null }}
   */
  update(s, flight, pf, surface, system, combat, dt) {
    const A = CONFIG.autopilot;
    const out = { landed: false, engaged: null, disengaged: null };

    this._updateUnderFire(combat, dt);
    this._updateAvailableAction(flight, pf, system);

    // ── Retomada manual ───────────────────────────────────────────────────
    // Qualquer comando de voo desengata. O gatilho de tiro NÃO entra na
    // lista: querer atirar durante uma aproximação é legítimo, e no touch o
    // botão de tiro costuma ficar pressionado.
    // Silencioso de propósito: o rótulo do botão volta de "CANCELAR" para
    // "POUSAR" no mesmo frame, e isso já é o aviso. Uma mensagem grande no
    // meio da tela toda vez que a pessoa encosta no manche seria ruído.
    if (this.active && this._playerIsFlying(s)) this.disengage(null);

    // ── Botão ─────────────────────────────────────────────────────────────
    if (this._request) {
      this._request = false;
      if (this.active) {
        this.disengage(null);        // cancelar é deliberado: não precisa aviso
      } else if (this.action) {
        this.mode = this.action.id;
        this.planet = this.action.planet;
        this._timer = 0;
        this._writtenThrottle = null;
        this._probeDir = null;
        this._captureBaseline(s);
        out.engaged = this.action.label;
      }
    }

    if (!this.active) {
      // Solta o cruzeiro suavemente mesmo depois de desengatar: cortar de uma
      // vez faria o teto de velocidade do FlightModel morder e dar um tranco.
      flight.cruiseMul = damp(flight.cruiseMul, 1, A.cruiseLambda, dt);
      this.targetDistance = Infinity;
      return out;
    }

    // ── Tetos de tempo ────────────────────────────────────────────────────
    this._timer += dt;
    const limit = this.mode === AP.APPROACH ? A.timeoutApproach
      : this.mode === AP.LAND ? A.timeoutLand : A.timeoutTakeoff;
    if (this._timer > limit) {
      this.disengage('PILOTO AUTOMÁTICO EXPIROU');
      out.disengaged = this.lastMessage;
      flight.cruiseMul = damp(flight.cruiseMul, 1, A.cruiseLambda, dt);
      return out;
    }

    // A partir daqui o estado é NOSSO. Zeramos o que o jogador não tocou pra
    // não herdar meio comando de um frame anterior.
    s.pitch = 0; s.yaw = 0; s.roll = 0;
    s.strafeX = 0; s.strafeY = 0;
    s.boost = false; s.brake = false; s.barrelRoll = 0;

    if (this.mode === AP.APPROACH) this._approach(s, flight, pf, dt, out);
    else if (this.mode === AP.LAND) this._land(s, flight, pf, surface, dt, out);
    else this._takeoff(s, flight, pf, dt, out);

    // Guarda o que escrevemos no acelerador: é assim que sabemos, no próximo
    // frame, se foi o JOGADOR que mexeu nele.
    this._writtenThrottle = s.throttle;
    return out;
  }

  // ═══════════════════════════════════════════════════════════════════════
  /** Decide qual é "a próxima coisa óbvia" e monta o rótulo do botão. */
  _updateAvailableAction(flight, pf, system) {
    const A = CONFIG.autopilot;

    if (pf.landed) {
      this.action = { id: AP.TAKEOFF, label: 'DECOLAR', hint: 'sair da atmosfera', planet: pf.planet };
      return;
    }
    if (pf.inAtmosphere && pf.planet) {
      this.action = {
        id: AP.LAND, label: 'POUSAR',
        hint: `PLANETA ${pf.planet.spec.name}`, planet: pf.planet,
      };
      return;
    }

    // Fora da atmosfera: o planeta pousável mais próximo. Mesma regra que o
    // PlanetaryFlight usa, pra o botão nunca apontar pra um corpo que a
    // física não aceitaria.
    let best = null;
    let bestDist = Infinity;
    for (const p of system.planets) {
      if (!p.spec.landable) continue;
      const d = flight.position.distanceTo(p.object.position) - p.radius;
      if (d < bestDist) { bestDist = d; best = p; }
    }
    this.action = (best && bestDist < A.approachRange)
      ? {
          id: AP.APPROACH, label: 'APROXIMAR',
          hint: `PLANETA ${best.spec.name} · ${best.spec.type.toUpperCase()}`,
          planet: best,
        }
      : null;
  }

  /**
   * O jogador mexeu em algo que conta como retomar o controle?
   *
   * ⚠ A comparação é com o comando que existia NO MOMENTO DO ENGATE, não com
   * zero. A primeira versão testava magnitude ("|pitch| > 0.2 ⇒ o jogador está
   * pilotando") e tinha um furo que só aparece no desktop sem Pointer Lock:
   * ali o mouse é um manche de posição ABSOLUTA, então o cursor parado em
   * qualquer canto da tela já é uma deflexão permanente. O piloto automático
   * engatava e desengatava no mesmo frame, para sempre, sem que ninguém
   * tivesse tocado em nada.
   *
   * Comparar com a linha de base mede o que realmente importa: o jogador MEXEU
   * depois de apertar o botão.
   */
  _playerIsFlying(s) {
    const b = this._base;
    if (!b) return false;
    const T = 0.25;
    if (Math.abs(s.pitch - b.pitch) > T) return true;
    if (Math.abs(s.yaw - b.yaw) > T) return true;
    if (Math.abs(s.roll - b.roll) > T) return true;
    if (Math.abs(s.strafeX - b.strafeX) > T) return true;
    if (Math.abs(s.strafeY - b.strafeY) > T) return true;
    // Boost/freio/tonneau são momentâneos: só contam ao SUBIR. Se já estavam
    // pressionados no engate, soltá-los não deve cancelar nada.
    if ((s.boost && !b.boost) || (s.brake && !b.brake)) return true;
    if (s.barrelRoll !== 0 && b.barrelRoll === 0) return true;
    // O acelerador é absoluto e persiste entre frames, então "mudou" só conta
    // se o valor for diferente do que NÓS deixamos lá.
    if (this._writtenThrottle !== null
        && Math.abs(s.throttle - this._writtenThrottle) > 0.02) return true;
    return false;
  }

  /** Congela o comando do jogador no instante do engate. */
  _captureBaseline(s) {
    this._base = {
      pitch: s.pitch, yaw: s.yaw, roll: s.roll,
      strafeX: s.strafeX, strafeY: s.strafeY,
      boost: s.boost, brake: s.brake, barrelRoll: s.barrelRoll,
    };
  }

  /**
   * Aponta o nariz numa direção do mundo.
   *
   * O erro é medido no espaço LOCAL da nave, onde a frente é -Z. `atan2` (em
   * vez de acos ou de projeção linear) por um motivo específico: ele continua
   * dando o sinal certo quando o alvo está ATRÁS, e a nave escolhe um lado e
   * gira. Um erro linear passaria por zero nas costas e a nave ficaria
   * paralisada apontando exatamente ao contrário.
   *
   * @param {THREE.Vector3} dir   unitário, espaço de mundo
   * @param {THREE.Vector3|null} upRef  para nivelar as asas; null = sem roll
   * @returns {number} erro angular total (rad)
   */
  _steer(s, flight, dir, upRef) {
    const A = CONFIG.autopilot;
    this._invQ.copy(flight.quaternion).conjugate();
    const l = this._local.copy(dir).applyQuaternion(this._invQ);

    const yawErr = Math.atan2(l.x, -l.z);
    const pitchErr = Math.atan2(l.y, -l.z);
    s.yaw = clamp(yawErr * A.steerGain, -1, 1);
    s.pitch = clamp(pitchErr * A.steerGain, -1, 1);

    if (upRef) {
      const u = this._localUp.copy(upRef).applyQuaternion(this._invQ);
      // Queremos o +Y local alinhado com a referência. Roll positivo leva o
      // "para cima" da nave em direção ao +X local (ver _integrateRotation em
      // FlightModel.js), então o sinal do erro é usado direto.
      s.roll = clamp(Math.atan2(u.x, u.y) * A.rollGain, -1, 1);
    }
    return Math.hypot(yawErr, pitchErr);
  }

  // ═══════════════════════════════════════════════════════════════════════
  _approach(s, flight, pf, dt, out) {
    const A = CONFIG.autopilot;
    const S = CONFIG.surface;
    const planet = this.planet;

    this._dir.copy(planet.object.position).sub(flight.position);
    const dist = this._dir.length();
    const surfaceDist = dist - planet.radius;
    this.targetDistance = surfaceDist;
    this._dir.divideScalar(dist || 1);

    const err = this._steer(s, flight, this._dir, null);

    // Acelerador proporcional ao alinhamento: fora de rumo, quase nada. É a
    // diferença entre uma curva limpa e uma banana com deriva lateral.
    const aligned = clamp(1 - err / A.alignTolerance, 0, 1);
    s.throttle = 0.12 + aligned * 0.88;

    // ── Cruzeiro ──
    const entryAlt = planet.radius * S.entryAltitudeFactor;
    const wantCruise = surfaceDist > Math.max(A.cruiseMinDistance, entryAlt * 1.6)
      && aligned > 0.55 && this._underFire === 0;
    flight.cruiseMul = damp(flight.cruiseMul, wantCruise ? A.cruiseMultiplier : 1,
                            A.cruiseLambda, dt);

    // ── Freia antes da atmosfera ──
    // O calor de reentrada cresce com v³: chegar rápido não é "chegar antes",
    // é chegar em chamas. Freamos enquanto ainda há espaço pra isso.
    if (surfaceDist < entryAlt * 1.15 && flight.speed > S.heatReferenceSpeed * 0.72) {
      s.brake = true;
      s.throttle = 0;
    }

    if (pf.inAtmosphere) {
      this.mode = AP.LAND;
      this._timer = 0;
      this._probeDir = null;
      out.engaged = 'POUSANDO';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  _land(s, flight, pf, surface, dt, out) {
    const A = CONFIG.autopilot;
    const S = CONFIG.surface;

    if (!pf.planet) {                       // saiu da influência do planeta
      this.disengage('PLANETA PERDIDO');
      out.disengaged = this.lastMessage;
      return;
    }
    this.planet = pf.planet;
    this.targetDistance = pf.altitude;
    flight.cruiseMul = damp(flight.cruiseMul, 1, A.cruiseLambda, dt);

    const up = pf.up;
    const alt = pf.altitude;

    // Velocidade horizontal (o que precisa ir a zero pra pousar) e o rumo
    // atual projetado no plano tangente — a base dos dois regimes.
    const vs = pf.verticalSpeed;
    const vHoriz = Math.sqrt(Math.max(0, flight.velocity.lengthSq() - vs * vs));
    const fwd = flight.getForward(this._fwd);
    this._heading.copy(fwd).addScaledVector(up, -fwd.dot(up));
    if (this._heading.lengthSq() < 1e-4) {
      // Nariz exatamente na vertical: qualquer direção tangente serve.
      const u = flight.getUp();
      this._heading.copy(u).addScaledVector(up, -u.dot(up));
    }
    this._heading.normalize();

    // Perfil de descida: taxa proporcional à altitude. Rápido no alto, quase
    // parado ao encostar, sem nenhuma etapa explícita.
    let vsTarget = -clamp(alt * A.descentRate, A.descentMin, A.descentMax);
    if (pf.heat > A.heatLimit) vsTarget = 0;             // nivela até esfriar

    if (alt > A.flareAltitude && pf.heat <= A.heatLimit) {
      // ══ REGIME 1: desce voando ══
      // O nariz aponta na direção da VELOCIDADE desejada e o motor dá a
      // intensidade. É o único eixo com autoridade de verdade (ver a nota em
      // config.js) e, de quebra, é o que um piloto faria: você não desce de
      // paraquedas, você voa pra baixo.
      const hTarget = clamp(alt * A.horizFactor, 0, A.horizMax);

      // O desvio de água só vale aqui: neste regime a nave de fato SE MOVE na
      // direção do nariz, então apontar pra terra firme leva pra lá. Depois do
      // flare ela está praticamente parada e mudar de rumo não muda nada.
      const away = this._driestDirection(flight, surface, up, dt);
      if (away) this._heading.lerp(away, 0.5).normalize();

      this._dir.copy(this._heading).multiplyScalar(hTarget).addScaledVector(up, vsTarget);
      const vTarget = this._dir.length();
      this._dir.divideScalar(vTarget || 1);
      this._steer(s, flight, this._dir, up);
      s.throttle = clamp(vTarget / (CONFIG.flight.maxSpeed * flight.speedMul), 0, 1);
    } else {
      // ══ REGIME 2: nivela e assenta ══
      // Nariz no horizonte local. Isso não é só estética: é o que alinha o
      // propulsor "para cima" da nave com a vertical do planeta, e sem esse
      // alinhamento o servo de velocidade vertical empurraria de lado.
      this._steer(s, flight, this._heading, up);
      s.throttle = 0;
      // Freia enquanto ainda houver velocidade horizontal pra matar. Depois
      // solta: `brakeLateralDrag` também amortece a descida, e segurar o
      // freio até o fim limitaria o toque a 16 u/s eternos.
      s.brake = vHoriz > S.landingSpeed;
      if (vHoriz > S.landingSpeed * A.fastFactor) vsTarget = 0;   // paira até frear

      const settle = S.hullClearance * 1.2;
      if (alt <= settle || pf.landingProgress > 0.01) {
        // Encostou: para de empurrar. Continuar acionando o propulsor contra o
        // solo faria a nave tremer sobre o terreno em vez de assentar.
        s.strafeY = 0;
      } else {
        s.strafeY = clamp((vsTarget - vs) * A.vsGain, -1, 1);
      }
    }

    if (pf.landed) {
      out.landed = true;
      this.disengage(null);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  _takeoff(s, flight, pf, dt, out) {
    const A = CONFIG.autopilot;
    flight.cruiseMul = damp(flight.cruiseMul, 1, A.cruiseLambda, dt);

    if (!pf.planet) {                       // já está fora: nada a fazer
      this.disengage(null);
      return;
    }
    this.targetDistance = pf.altitude;

    // Nariz na vertical local e acelerador cheio. Sem referência de roll: com
    // o nariz alinhado ao "para cima", o eixo de roll fica degenerado e
    // qualquer tentativa de nivelar viraria giro sem sentido.
    this._steer(s, flight, pf.up, null);
    s.throttle = 1;

    if (!pf.inAtmosphere) {
      this.disengage(null);
      out.disengaged = 'ÓRBITA ALCANÇADA';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Quatro sondas de terreno em cruz, no plano tangente. Devolve a direção
   * tangente mais seca, ou null se onde estamos já é terra firme.
   *
   * Amostrado a cada `waterProbeInterval` e não por frame: são quatro
   * avaliações de ruído FBM, e o rumo não muda rápido o bastante pra
   * justificar 240 delas por segundo.
   */
  _driestDirection(flight, surface, up, dt) {
    const A = CONFIG.autopilot;
    this._probeTimer -= dt;
    if (this._probeTimer > 0) return this._probeDir;
    this._probeTimer = A.waterProbeInterval;

    if (!surface.active) { this._probeDir = null; return null; }
    const here = surface.sample(flight.position, null);
    if (!here.isWater) { this._probeDir = null; return null; }

    // Base tangente estável: o rumo atual projetado, mais sua perpendicular.
    const fwd = flight.getForward(this._probeFwd);
    this._probeFwd.addScaledVector(up, -fwd.dot(up));
    if (this._probeFwd.lengthSq() < 1e-4) this._probeFwd.set(up.y, -up.x, 0);
    this._probeFwd.normalize();
    this._probeTan.copy(up).cross(this._probeFwd).normalize();

    let found = false;
    let bestGround = -Infinity;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      this._probe.copy(this._probeFwd).multiplyScalar(Math.cos(a))
        .addScaledVector(this._probeTan, Math.sin(a));
      const p = surface.sample(
        this._probePos.copy(flight.position).addScaledVector(this._probe, A.waterProbe),
        null,
      );
      // O solo mais ALTO é o mais provável de estar acima do nível do mar; e
      // entre dois secos, o mais alto também é o mais fácil de avistar.
      if (!p.isWater && p.ground > bestGround) {
        bestGround = p.ground;
        found = true;
        this._probeBest.copy(this._probe);
      }
    }
    this._probeDir = found ? this._probeBest : null;
    return this._probeDir;
  }

  /**
   * Conta os segundos restantes de bloqueio por estar sob fogo.
   *
   * Detecta a queda de escudo+casco em vez de perguntar ao Combat se alguém
   * atirou: qualquer fonte de dano conta (tiro, colisão, calor), e o
   * Autopilot não precisa saber nada sobre como o combate é implementado.
   */
  _updateUnderFire(combat, dt) {
    this._underFire = Math.max(0, this._underFire - dt);
    const h = combat?.playerHealth;
    if (!h) return;
    const hp = h.hull + h.shield;
    if (this._lastHp !== null && hp < this._lastHp - 0.01) {
      this._underFire = CONFIG.autopilot.cruiseBlockAfterHit;
    }
    this._lastHp = hp;
  }
}
