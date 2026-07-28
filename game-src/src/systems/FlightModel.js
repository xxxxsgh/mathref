import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, easeInOutCubic } from '../core/MathUtils.js';

/**
 * Modelo de voo — "arcade com peso".
 *
 * ═══ POR QUE NÃO É FÍSICA DE VERDADE ═══
 *
 * Um corpo rígido newtoniano recebe TORQUE e integra aceleração angular. O
 * problema é que o jogador não comanda torque, ele comanda intenção: "quero
 * virar pra lá". Com torque puro, soltar o controle deixa a nave girando pra
 * sempre (não há atmosfera no espaço), e o jogador tem que contra-comandar todo
 * movimento. Isso é simulação, e você pediu explicitamente que não fosse.
 *
 * Aqui o input define uma VELOCIDADE ANGULAR ALVO, e a velocidade angular real
 * persegue esse alvo com suavização exponencial. O "peso" vem de dois lugares:
 *
 *   1. O tempo que a velocidade angular leva pra alcançar o alvo
 *      (`pitchYawResponse` / `rollResponse`). É a inércia rotacional.
 *   2. A deriva lateral: ao virar, a velocidade linear continua apontando pra
 *      onde a nave estava, e só depois "alcança" o novo nariz (`lateralDrag`).
 *      É isso que faz a nave ter massa em vez de andar num trilho.
 *
 * Os dois são independentes, e vale ajustar um de cada vez.
 *
 * ═══ POR QUE QUATERNIONS ═══
 *
 * Ângulos de Euler (pitch/yaw/roll como três números) sofrem gimbal lock: em
 * pitch de 90° o yaw e o roll colapsam no mesmo eixo e a nave trava. Num jogo
 * com 6 graus de liberdade real isso acontece na primeira manobra vertical.
 *
 * Quaternion não tem esse problema porque representa a rotação como um único
 * eixo + ângulo, sem coordenadas privilegiadas. O custo é que a composição é
 * multiplicação, não soma, e a ORDEM importa:
 *
 *     q * dq  →  dq aplicado no espaço LOCAL da nave (o que queremos)
 *     dq * q  →  dq aplicado no espaço do MUNDO (giraria em torno dos eixos
 *                globais, ignorando pra onde a nave aponta)
 */
export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3(0, 0, 0);
    this.quaternion = new THREE.Quaternion();
    /** Velocidade linear em espaço de MUNDO (u/s). */
    this.velocity = new THREE.Vector3();
    /** Velocidade angular em espaço LOCAL (rad/s): x=pitch, y=yaw, z=roll. */
    this.angularVelocity = new THREE.Vector3();

    this.throttle = CONFIG.flight.throttleInitial;
    this.boosting = false;
    this.braking = false;
    /** Assistência de voo: desligada, a deriva lateral não é amortecida. */
    this.assistEnabled = true;

    /**
     * Multiplicadores de upgrade. Ficam AQUI, e não somados às constantes de
     * `CONFIG`, por dois motivos: o config continua sendo o balanceamento
     * base editável no painel de tuning, e reaplicar um upgrade não acumula
     * efeito (o que aconteceria se mexêssemos no config direto).
     */
    this.speedMul = 1;
    this.accelMul = 1;

    /** Estado da manobra de barrel roll. */
    this.maneuver = { active: false, dir: 0, t: 0, cooldown: 0 };
    /** Impulso lateral do barrel roll, em espaço local; decai sozinho. */
    this._kick = new THREE.Vector3();

    // Vetores reutilizados. Alocar Vector3 dentro do loop de 60fps gera lixo
    // que o coletor recolhe em pausas visíveis (stutter). Nada aqui aloca.
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._lateral = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
    this._axis = new THREE.Vector3();

    // Métricas para HUD e debug.
    this.speed = 0;
    this.lateralSpeed = 0;
    this.gForce = 0;
    this._prevVelocity = new THREE.Vector3();
  }

  /** Vetor "para frente" da nave em espaço de mundo.
   *  Convenção do Three: o -Z local é a frente (mesma da câmera). */
  getForward(out = this._fwd) {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion);
  }
  getRight(out = this._right) {
    return out.set(1, 0, 0).applyQuaternion(this.quaternion);
  }
  getUp(out = this._up) {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }

  /**
   * @param {import('../core/Input.js').ControlState} input
   * @param {number} dt
   */
  update(input, dt) {
    this.throttle = clamp(input.throttle, 0, 1);
    this.boosting = input.boost;
    this.braking = input.brake;

    this._updateManeuver(input, dt);
    this._updateAngular(input, dt);
    this._integrateRotation(dt);
    this._updateLinear(input, dt);

    // Integra a posição. Euler simples é suficiente: dt é pequeno e não há
    // forças dependentes de posição (gravidade orbital etc.) que exigiriam um
    // integrador de ordem maior.
    this.position.addScaledVector(this.velocity, dt);

    // Métricas.
    this.speed = this.velocity.length();
    this.getForward();
    this._lateral.copy(this.velocity).addScaledVector(this._fwd, -this.velocity.dot(this._fwd));
    this.lateralSpeed = this._lateral.length();
    // "G" aqui é métrica de HUD, não física: magnitude da variação de
    // velocidade por segundo, dividida por 9.81 pra dar um número legível.
    this._tmp.copy(this.velocity).sub(this._prevVelocity);
    this.gForce = dt > 0 ? this._tmp.length() / dt / 9.81 : 0;
    this._prevVelocity.copy(this.velocity);
  }

  // ─────────────────────────────────────────────────────────────────────
  _updateManeuver(input, dt) {
    const B = CONFIG.flight.barrelRoll;
    const m = this.maneuver;

    if (m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);

    if (!m.active && input.barrelRoll !== 0 && m.cooldown === 0) {
      m.active = true;
      m.dir = input.barrelRoll;
      m.t = 0;
      // Impulso lateral no espaço LOCAL — é o que transforma o roll de enfeite
      // em manobra de esquiva. Na Fase 2 isso vira desvio de tiro de verdade.
      this._kick.set(m.dir * B.lateralKick, 0, 0);
    }

    if (m.active) {
      m.t += dt / B.duration;
      if (m.t >= 1) {
        m.active = false;
        m.t = 0;
        m.cooldown = B.cooldown;
      }
    }

    // Decaimento do impulso lateral.
    const k = Math.exp(-CONFIG.flight.barrelRoll.kickDecay * dt);
    this._kick.multiplyScalar(k);
  }

  _updateAngular(input, dt) {
    const F = CONFIG.flight;
    const av = this.angularVelocity;

    let targetPitch = input.pitch * F.maxPitchRate;
    let targetYaw = input.yaw * F.maxYawRate;
    let targetRoll = input.roll * F.maxRollRate;

    // Durante o barrel roll, o roll é ditado pela curva da manobra e o input
    // manual de roll é ignorado. A derivada da curva de ease dá a velocidade
    // angular instantânea, então o giro acelera e desacelera — um roll de
    // velocidade constante parece robótico.
    if (this.maneuver.active) {
      const B = CONFIG.flight.barrelRoll;
      const t = this.maneuver.t;
      const h = 0.02;
      const dEase = (easeInOutCubic(Math.min(1, t + h)) - easeInOutCubic(Math.max(0, t - h))) / (2 * h);
      targetRoll = this.maneuver.dir * dEase * (Math.PI * 2) / B.duration;
    }

    // Quando NÃO há comando no eixo, usa-se um lambda diferente (mais lento).
    // Começar a virar deve ser mais rápido que parar de virar: essa assimetria
    // é boa parte da sensação de inércia rotacional.
    const lamPY = (input.pitch === 0 && input.yaw === 0) ? F.angularDamping : F.pitchYawResponse;
    const lamR = (targetRoll === 0) ? F.angularDamping : F.rollResponse;

    av.x = damp(av.x, targetPitch, lamPY, dt);
    av.y = damp(av.y, targetYaw, lamPY, dt);
    av.z = damp(av.z, targetRoll, this.maneuver.active ? 22 : lamR, dt);
  }

  _integrateRotation(dt) {
    const av = this.angularVelocity;
    const angle = av.length() * dt;
    if (angle < 1e-7) return;

    // Constrói o quaternion de incremento a partir do eixo de rotação
    // instantâneo (a direção da velocidade angular) e do ângulo percorrido
    // neste frame.
    //
    // ⚠ OS SINAIS AQUI NÃO SÃO TODOS IGUAIS — e essa assimetria é a causa de
    // um bug que custou caro. A frente local é -Z, e é isso que quebra a
    // simetria entre os eixos pela regra da mão direita:
    //
    //   pitch (+X): rotação POSITIVA leva (0,0,-1) → (0, senθ, -cosθ).
    //               O nariz SOBE. Sinal positivo, portanto.
    //   yaw   (+Y): rotação POSITIVA leva (0,0,-1) → (-senθ, 0, -cosθ).
    //               O nariz vai pra ESQUERDA. Nossa convenção é yaw positivo
    //               = direita, então aqui o sinal é NEGATIVO.
    //   roll  (+Z): rotação POSITIVA inclina o "up" pra +X. Convenção nossa.
    //
    // A primeira versão negava os três por analogia, o que invertia o pitch.
    // O sintoma não foi um controle "estranho" — foi a IA nunca conseguir
    // mirar em nada que estivesse acima ou abaixo dela, porque o comando de
    // pitch afastava o nariz do alvo em vez de aproximá-lo.
    this._axis.set(av.x, -av.y, -av.z).normalize();
    this._dq.setFromAxisAngle(this._axis, angle);

    // Multiplicação à DIREITA: aplica no espaço local da nave.
    this.quaternion.multiply(this._dq);
    // Erro de ponto flutuante acumula e o quaternion deixa de ser unitário,
    // o que introduz escala espúria na matriz de rotação. Renormalizar todo
    // frame é barato e elimina a deriva.
    this.quaternion.normalize();
  }

  _updateLinear(input, dt) {
    const F = CONFIG.flight;
    const fwd = this.getForward();

    // ── Decompõe a velocidade em componente frontal + componente lateral ──
    // Esta decomposição é o truque central do modelo. Tratar as duas partes
    // com regras diferentes é o que produz "arcade com peso" em vez de
    // "trilho" (só frontal) ou "gelo" (nenhum tratamento).
    const vFwd = this.velocity.dot(fwd);
    this._lateral.copy(this.velocity).addScaledVector(fwd, -vFwd);

    // ── Componente frontal: persegue a velocidade alvo do acelerador ──
    const boostMul = this.boosting ? F.boostMultiplier : 1;
    let targetSpeed = this.throttle * F.maxSpeed * this.speedMul * boostMul;
    let lambda = (targetSpeed > vFwd ? F.accelResponse : F.decelResponse) * this.accelMul;
    // O boost acelera mais rápido, senão o "chute" não é sentido.
    if (this.boosting) lambda *= 1.7;

    if (this.braking) {
      targetSpeed = F.minSpeed;
      lambda = F.brakeResponse;
    }
    const newVFwd = damp(vFwd, targetSpeed, lambda, dt);

    // ── Componente lateral: arrasto (a assistência de voo) ──
    // Com a assistência desligada a deriva não é amortecida e a nave se
    // comporta como um corpo no vácuo de verdade. Fica difícil, mas é
    // exatamente o que jogadores de Elite procuram — daí o toggle.
    const drag = this.braking ? F.brakeLateralDrag : F.lateralDrag;
    if (this.assistEnabled) {
      this._lateral.multiplyScalar(Math.exp(-drag * dt));
    }

    // ── Propulsores laterais/verticais (6DOF real) ──
    if (input.strafeX !== 0 || input.strafeY !== 0) {
      this.getRight();
      this.getUp();
      this._lateral.addScaledVector(this._right, input.strafeX * F.strafeAccel * dt);
      this._lateral.addScaledVector(this._up, input.strafeY * F.strafeAccel * dt);
    }

    // ── Impulso do barrel roll ──
    if (this._kick.lengthSq() > 1e-4) {
      this.getRight();
      this._lateral.addScaledVector(this._right, this._kick.x * dt * 4);
    }

    // Recompõe.
    this.velocity.copy(this._lateral).addScaledVector(fwd, newVFwd);
  }

  /** Velocidade máxima teórica atual, para normalizar barras de HUD. */
  get maxSpeedNow() {
    return CONFIG.flight.maxSpeed * this.speedMul
      * (this.boosting ? CONFIG.flight.boostMultiplier : 1);
  }

  /** Progresso do barrel roll em 0..1 (0 quando inativo). */
  get maneuverProgress() {
    return this.maneuver.active ? this.maneuver.t : 0;
  }
}
