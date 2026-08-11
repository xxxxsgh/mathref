import * as THREE from 'three';
import { CONFIG, maxThrustAccel, asRadians } from '../config.js';
import { clamp, damp, smoothstep } from '../core/MathUtils.js';

/**
 * Modelo de voo do drone. Arcade com peso — não é simulador.
 *
 * Convenção de eixos (a mesma da câmera do Three): o drone olha pro -Z local,
 * +Y é a barriga pra cima, +X é a direita. A câmera FPV pendura direto na
 * orientação do drone sem rotação extra por causa disso.
 *
 * A mecânica central não é escrita à mão em lugar nenhum: o empuxo aponta
 * sempre pro +Y LOCAL, então inclinar pra frente inclina o vetor de empuxo
 * junto — ganha componente horizontal (acelera) e perde componente vertical
 * (afunda). "Pitch pra frente = mais rápido e mais baixo" cai de graça da
 * física, que é o que faz a coisa ser legível sem olhar o HUD.
 */
export class Drone {
  constructor() {
    this.position = new THREE.Vector3(0, 3, 0);
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    /** Taxas no referencial do corpo (rad/s): x = pitch, y = yaw, z = roll. */
    this.angularVelocity = new THREE.Vector3();

    this.mode = CONFIG.DRONE.startMode;
    this.throttle = 0;
    /** Proa atual em radianos — guardada porque o ANGLE precisa dela e o
     *  cálculo degenera quando o drone aponta pra cima. */
    this.heading = 0;

    this.crashed = false;
    this.crashTimer = 0;
    /** Última pose considerada segura, usada pelo respawn. */
    this.safePoint = { position: this.position.clone(), heading: 0 };
    this._safeCooldown = 0;

    /** RPM normalizado (0..1) — o áudio e a vibração da câmera leem daqui. */
    this.rpm = 0;

    // Scratch reutilizado: alocar Vector3 dentro do passo de física a 60 Hz é
    // trabalho de GC de graça pro coletor.
    this._up = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._rel = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
    this._qDes = new THREE.Quaternion();
    this._qErr = new THREE.Quaternion();
    this._euler = new THREE.Euler();
  }

  get speed() {
    return this.velocity.length();
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get verticalSpeed() {
    return this.velocity.y;
  }

  /** Inclinação em relação à horizontal, em radianos. */
  get tilt() {
    this._up.set(0, 1, 0).applyQuaternion(this.quaternion);
    return Math.acos(clamp(this._up.y, -1, 1));
  }

  toggleMode() {
    this.mode = this.mode === 'ANGLE' ? 'ACRO' : 'ANGLE';
    return this.mode;
  }

  /**
   * Um passo de simulação.
   * @param {number} dt  passo fixo, em segundos
   * @param {{throttle:number,pitch:number,roll:number,yaw:number}} axes
   * @param {object} env  vento, escalas de massa/empuxo e desvios por dano
   */
  update(dt, axes, env = {}) {
    const D = CONFIG.DRONE;
    const massScale = env.massScale ?? 1;
    const thrustScale = env.thrustScale ?? 1;

    if (this.crashed) {
      this.crashTimer -= dt;
      // Continua caindo enquanto está "morto" — congelar no ar parece bug.
      this.velocity.y -= D.gravity * dt * 0.5;
      this.velocity.multiplyScalar(Math.pow(0.02, dt));
      this.position.addScaledVector(this.velocity, dt);
      this.rpm = damp(this.rpm, 0, 0.25, dt);
      return;
    }

    this.throttle = clamp(axes.throttle, 0, 1);

    // ── 1. Taxas de rotação pedidas ──────────────────────────────────────
    if (this.mode === 'ACRO') this._acroRates(axes, this._target);
    else this._angleRates(axes, this._target);

    // Desvio por hélice quebrada (Fase 6): entra como taxa parasita constante.
    if (env.torqueBias) this._target.add(env.torqueBias);

    // ── 2. Inércia de rotação ────────────────────────────────────────────
    // Duas meia-vidas diferentes de propósito: o drone ATINGE a taxa pedida
    // rápido, mas PARA devagar. É essa assimetria que faz o ACRO parecer ter
    // massa em vez de estar preso num trilho.
    const response = D.responseHalfLife * massScale;
    const damping = D.dampingHalfLife * massScale;
    for (const axis of ['x', 'y', 'z']) {
      const target = this._target[axis];
      const halfLife = Math.abs(target) < 1e-4 ? damping : response;
      this.angularVelocity[axis] = damp(this.angularVelocity[axis], target, halfLife, dt);
    }

    // ── 3. Integra a orientação ──────────────────────────────────────────
    const angle = this.angularVelocity.length() * dt;
    if (angle > 1e-7) {
      this._axis.copy(this.angularVelocity).normalize();
      this._dq.setFromAxisAngle(this._axis, angle);
      // Multiplicação pela direita = rotação no referencial do corpo.
      this.quaternion.multiply(this._dq).normalize();
    }

    this._forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    if (Math.hypot(this._forward.x, this._forward.z) > 1e-3) {
      this.heading = Math.atan2(-this._forward.x, -this._forward.z);
    }

    // ── 4. Forças ────────────────────────────────────────────────────────
    this._up.set(0, 1, 0).applyQuaternion(this.quaternion);
    const tilt = Math.acos(clamp(this._up.y, -1, 1));

    // Saturação de motor: perto da horizontal os motores já estão no limite e
    // o empuxo disponível cai. Exagera de propósito a perda de sustentação em
    // ângulo alto, que é o que torna o mergulho perigoso.
    const saturation =
      1 -
      D.saturationLoss * smoothstep(asRadians(D.saturationStartDeg), Math.PI / 2, tilt);

    // Teto: o ar rarefeito tira empuxo antes de virar parede invisível.
    const ceiling = CONFIG.WORLD.ceiling;
    const ceilingFade = 1 - 0.85 * smoothstep(ceiling * 0.82, ceiling, this.position.y);

    const thrust =
      (this.throttle * maxThrustAccel() * saturation * thrustScale * ceilingFade) / massScale;

    this._accel.copy(this._up).multiplyScalar(thrust);
    this._accel.y -= D.gravity;

    // ── 5. Arrasto, medido contra o AR e não contra o chão ───────────────
    // É o que faz o vento empurrar: com vento de través o drone é arrastado
    // mesmo voando reto, porque a velocidade relativa ao ar é que conta.
    this._rel.copy(this.velocity);
    if (env.wind) this._rel.addScaledVector(env.wind, -CONFIG.WIND.influence);
    const airSpeed = this._rel.length();
    if (airSpeed > 1e-4) {
      const kH = D.dragHorizontal / massScale;
      const kV = D.dragVertical / massScale;
      this._accel.x -= kH * airSpeed * this._rel.x;
      this._accel.z -= kH * airSpeed * this._rel.z;
      this._accel.y -= kV * airSpeed * this._rel.y;
    }
    this.airSpeed = airSpeed;

    // ── 6. Integração semi-implícita ─────────────────────────────────────
    // Velocidade primeiro, posição com a velocidade JÁ atualizada: estável em
    // 60 Hz mesmo com empuxo alto, ao contrário do Euler explícito.
    this.velocity.addScaledVector(this._accel, dt);
    this.position.addScaledVector(this.velocity, dt);

    // RPM acompanha acelerador e esforço; o áudio e o shake da câmera leem daqui.
    const load = clamp(this.throttle + tilt * 0.12, 0, 1);
    this.rpm = damp(this.rpm, load, CONFIG.AUDIO.rpmHalfLife, dt);

    if (this._safeCooldown > 0) this._safeCooldown -= dt;
  }

  /** ACRO: o stick pede TAXA. Solto, o drone mantém a atitude que estiver. */
  _acroRates(axes, out) {
    const r = CONFIG.DRONE.rates;
    // Sinais: pitch +1 do stick = nariz pra baixo; roll +1 = rola pra direita;
    // yaw +1 = gira pra direita. Todos invertem em relação ao sentido positivo
    // da rotação nos eixos locais, daí os menos.
    out.set(
      -axes.pitch * asRadians(r.pitch),
      -axes.yaw * asRadians(r.yaw),
      -axes.roll * asRadians(r.roll),
    );
  }

  /**
   * ANGLE: o stick pede ÂNGULO e um controlador de atitude gera a taxa.
   *
   * Comparar quaternions em vez de ângulos de Euler evita gimbal lock e trata
   * certo o caso de estar de cabeça pra baixo depois de uma recuperação feia —
   * o controlador acha o caminho curto de volta em vez de rodar o longo.
   */
  _angleRates(axes, out) {
    const D = CONFIG.DRONE;
    const maxAngle = asRadians(D.maxAngleDeg);

    // A proa desejada é a atual: em ANGLE a guinada continua sendo comando de
    // taxa, então o controlador não deve ter erro nenhum em Y.
    this._euler.set(-axes.pitch * maxAngle, this.heading, -axes.roll * maxAngle, 'YXZ');
    this._qDes.setFromEuler(this._euler);

    this._qErr.copy(this.quaternion).invert().multiply(this._qDes);
    // w negativo representa a mesma rotação pelo caminho longo; inverter o
    // sinal do quaternion inteiro escolhe o curto.
    if (this._qErr.w < 0) {
      this._qErr.set(-this._qErr.x, -this._qErr.y, -this._qErr.z, -this._qErr.w);
    }

    const w = clamp(this._qErr.w, -1, 1);
    const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
    const errorAngle = 2 * Math.acos(w);

    if (sinHalf < 1e-6) {
      out.set(0, 0, 0);
    } else {
      const rate = Math.min(errorAngle * D.levelGain, asRadians(D.levelMaxRate));
      out.set(this._qErr.x, this._qErr.y, this._qErr.z)
        .multiplyScalar(1 / sinHalf)
        .multiplyScalar(rate);
    }

    out.y = -axes.yaw * asRadians(D.rates.yaw);
  }

  /** Marca a pose atual como ponto de respawn, se ela for plausível. */
  markSafe(minClearance = 1.5) {
    if (this._safeCooldown > 0 || this.crashed) return;
    this.safePoint.position.copy(this.position);
    this.safePoint.heading = this.heading;
    this._safeCooldown = 0.35;
    this._safeClearance = minClearance;
  }

  crash() {
    if (this.crashed) return false;
    this.crashed = true;
    this.crashTimer = CONFIG.DRONE.crashFreezeSeconds;
    this.angularVelocity.set(0, 0, 0);
    return true;
  }

  get canRespawn() {
    return this.crashed && this.crashTimer <= 0;
  }

  /** Volta a voar. Sem argumento, usa o último ponto seguro. */
  respawn(point = null) {
    const target = point || this.safePoint;
    this.position.copy(target.position);
    this.position.y += CONFIG.DRONE.respawnHeight;
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.heading = target.heading ?? 0;
    this.quaternion.setFromEuler(new THREE.Euler(0, this.heading, 0, 'YXZ'));
    this.crashed = false;
    this.crashTimer = 0;
    this.throttle = 0;
    this.rpm = 0;
  }
}
