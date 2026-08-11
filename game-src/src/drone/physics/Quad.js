import * as THREE from 'three';
import { DCFG } from '../config.js';
import { clamp, damp, smoothstep } from '../../core/MathUtils.js';

/**
 * Modelo de voo do quadricóptero.
 *
 * ═══ A ÚNICA REGRA ═══
 *
 * Um quadricóptero só sabe empurrar na direção do próprio "para cima". Não
 * existe propulsor lateral, não existe empuxo para trás, não existe freio.
 * Ir para frente é inclinar para frente; parar é inclinar para trás e
 * esperar o arrasto. Toda a sensação de pilotar um drone sai daí, e este
 * arquivo é essencialmente essa restrição escrita com cuidado.
 *
 * Consequências que caem de graça e que NÃO estão codificadas em lugar
 * nenhum como caso especial:
 *
 *   • Ao inclinar, parte do empuxo deixa de segurar o peso e o drone afunda.
 *     Curvar rápido sem dar acelerador = perder altura. Todo piloto aprende
 *     isso nos primeiros dez minutos, e ninguém precisa explicar.
 *   • De cabeça para baixo o empuxo aponta para o chão. Um flip só funciona
 *     se você cortar o acelerador no meio dele.
 *   • Sair de um mergulho exige acelerador ANTES de nivelar, senão o drone
 *     chega ao chão nivelado e ainda descendo.
 *
 * ═══ TAXA COMANDADA, NÃO TORQUE ═══
 *
 * Como no modelo de voo da nave, o manche comanda VELOCIDADE ANGULAR e não
 * torque. Isso não é uma simplificação preguiçosa: é literalmente o que um
 * controlador de voo faz. O piloto de um quad em modo acro não comanda os
 * motores — ele pede 400°/s de rolagem ao Betaflight, e o PID persegue esse
 * número mexendo nos quatro motores. Nós somos o PID.
 *
 * A mixagem dos motores (`motors`) é então DERIVADA do comando, e não a
 * causa dele. Ela existe porque a mixagem é o que se vê e o que se ouve: o
 * motor externo de uma curva acelera, e é essa diferença que o áudio e as
 * hélices precisam. Inverter a direção da causalidade aqui seria mais
 * "correto" e visivelmente pior de jogar.
 */

/** Índices dos motores, na numeração do Betaflight (visto de cima):
 *      3 ┌───┐ 2      2 e 3 na frente
 *        │   │        1 e 4 atrás
 *      4 └───┘ 1      */
const M_RR = 0, M_FR = 1, M_RL = 2, M_FL = 3;

export class Quad {
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    /** Velocidade linear em espaço de MUNDO (m/s). */
    this.velocity = new THREE.Vector3();
    /**
     * Velocidade angular em espaço LOCAL (rad/s), na convenção do projeto:
     *   x = arfagem, positivo = nariz para CIMA
     *   y = guinada, positivo = nariz para a DIREITA
     *   z = rolagem, positivo = rola para a DIREITA
     * A conversão para o eixo de rotação real acontece em `_integrateRotation`
     * e tem sinais assimétricos — ver o comentário lá.
     */
    this.angularVelocity = new THREE.Vector3();

    this.armed = false;
    /** 'acro' | 'angle' */
    this.mode = 'angle';
    this.throttle = 0;

    /** Comando de cada motor (0..1), já mixado. */
    this.motors = [0, 0, 0, 0];
    /** Empuxo real de cada motor depois da inércia do conjunto motor+hélice. */
    this.motorThrust = [0, 0, 0, 0];

    this.crashed = false;
    this.crashTimer = 0;
    this.landed = true;
    /** Motivo do último acidente, para a mensagem da HUD. */
    this.crashReason = '';

    /**
     * Drone suspenso no ar, esperando ser armado.
     *
     * ═══ POR QUE ISTO PRECISOU EXISTIR ═══
     *
     * Depois de um acidente o drone renasce no último gate — que está a
     * dezenas de metros do chão. Sem este estado, ele nasce DESARMADO no ar,
     * cai, bate no chão, e a queda conta como novo acidente: um laço de
     * acidentes do qual o jogador não consegue sair, porque a cada renascer
     * ele tem menos de um segundo para armar e dar acelerador.
     *
     * Era um bug de verdade, encontrado testando o respawn. A correção é
     * congelar o drone até o piloto armar: nada de gravidade, nada de
     * integração. Fisicamente não faz sentido nenhum, e é exatamente o que
     * qualquer jogo de corrida faz ao recolocar um carro na pista.
     */
    this.suspended = false;

    // ── Bateria ────────────────────────────────────────────────────────
    this.mahUsed = 0;
    this.voltage = DCFG.quad.battery.cells * DCFG.quad.battery.fullPerCell;
    this.current = 0;
    /** Fator 0..1 de limitação por voltagem baixa. */
    this.sagLimit = 1;

    // ── Métricas e acrobacias ──────────────────────────────────────────
    this.speed = 0;
    this.altitudeAGL = 0;
    this.gForce = 0;
    this.flips = 0;
    this.rolls = 0;
    this._rollAccum = 0;
    this._pitchAccum = 0;
    this._prevVelocity = new THREE.Vector3();

    // Home: de onde decolou. Serve ao RTH e à distância no OSD.
    this.home = new THREE.Vector3();

    // Vetores reutilizados — nada aqui aloca dentro do loop de 60 fps.
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
    this._qTarget = new THREE.Quaternion();
    this._qErr = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._normal = new THREE.Vector3(0, 1, 0);
  }

  getForward(out = this._fwd) { return out.set(0, 0, -1).applyQuaternion(this.quaternion); }
  getRight(out = this._right) { return out.set(1, 0, 0).applyQuaternion(this.quaternion); }
  getUp(out = this._up) { return out.set(0, 1, 0).applyQuaternion(this.quaternion); }

  /** Empuxo máximo em aceleração (m/s²), com os quatro motores no talo. */
  get maxThrustAccel() {
    return DCFG.world.gravity * DCFG.quad.thrustToWeight;
  }

  /** Acelerador de pairar num drone NIVELADO. Mostrado no OSD porque é a
   *  referência que o piloto usa para julgar quanto sobrou de bateria. */
  get hoverThrottle() {
    return 1 / DCFG.quad.thrustToWeight;
  }

  /** 0..1 pela capacidade consumida. */
  get batteryPct() {
    return clamp(1 - this.mahUsed / DCFG.quad.battery.capacity, 0, 1);
  }

  get cellVoltage() {
    return this.voltage / DCFG.quad.battery.cells;
  }

  /** Ângulo entre o "para cima" do drone e o do mundo, em radianos.
   *  0 = nivelado, π = de cabeça para baixo. */
  get tiltAngle() {
    return Math.acos(clamp(this.getUp(this._tmp).y, -1, 1));
  }

  /** Coloca o drone num ponto e zera todo o estado dinâmico. */
  reset(position, heading = 0, { keepBattery = false } = {}) {
    this.position.copy(position);
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.motors.fill(0);
    this.motorThrust.fill(0);
    this.throttle = 0;
    this.armed = false;
    this.crashed = false;
    this.crashTimer = 0;
    this.crashReason = '';
    this.landed = true;
    this.suspended = false;
    this._rollAccum = 0;
    this._pitchAccum = 0;
    if (!keepBattery) {
      this.mahUsed = 0;
      this.voltage = DCFG.quad.battery.cells * DCFG.quad.battery.fullPerCell;
    }
    this.home.copy(position);
  }

  /**
   * @param {{throttle:number, roll:number, pitch:number, yaw:number}} cmd
   * @param {number} dt
   * @param {{heightAt:(x:number,z:number)=>number, normalAt:Function, hitProp:Function}} world
   */
  update(cmd, dt, world) {
    if (this.crashed) {
      this.crashTimer -= dt;
      // Durante o acidente o drone continua caindo e quicando, sem controle.
      // Cortar para uma tela preta seria mais simples e tiraria o peso da
      // batida: ver o próprio drone rolando na grama é a punição.
      this._integrateFall(dt, world);
      return;
    }

    if (this.suspended) {
      // Congelado no ar até armar. As hélices ficam paradas e a bateria não
      // drena: o tempo parado esperando não deveria custar voo.
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      this.motors.fill(0);
      this.motorThrust.fill(0);
      this.current = 0;
      this.throttle = 0;
      this.altitudeAGL = this.position.y - world.heightAt(this.position.x, this.position.z);
      return;
    }

    this.throttle = clamp(cmd.throttle, 0, 1);

    this._updateRates(cmd, dt);
    this._integrateRotation(dt);
    this._mixMotors(cmd, dt);
    this._updateBattery(dt);
    this._integrateLinear(dt, world);
    this._collide(dt, world);
    this._updateMetrics(dt, world);
  }

  // ─────────────────────────────────────────────────────────────────────
  /**
   * Comando → velocidade angular alvo.
   *
   * Dois modos com a MESMA saída (uma velocidade angular alvo) e origens
   * completamente diferentes. Foi assim de propósito: o resto do modelo não
   * sabe que existem modos, o que significa que trocar de modo em pleno voo
   * não pode introduzir descontinuidade nenhuma.
   */
  _updateRates(cmd, dt) {
    const R = DCFG.quad.rates;
    const av = this.angularVelocity;

    // Expo aplicada aqui e não no input: o input entrega intenção linear
    // (-1..1), e a curva é característica do MODELO, não do dispositivo.
    // Assim teclado, gamepad e touch herdam a mesma curva de graça.
    const eRoll = expo(cmd.roll, R.expo);
    const ePitch = expo(cmd.pitch, R.expo);
    const eYaw = expo(cmd.yaw, R.expo);

    let tPitch, tRoll;
    const tYaw = eYaw * R.yaw;

    if (this.mode === 'acro') {
      tPitch = ePitch * R.pitch;
      tRoll = eRoll * R.roll;
    } else {
      // ── ANGLE: laço externo de ângulo alimenta o laço interno de taxa ──
      //
      // O erro é calculado como um quaternion NO ESPAÇO DO CORPO
      // (qErr = qAtual⁻¹ · qAlvo). Fazer isso com ângulos de Euler seria mais
      // fácil de ler e quebraria de cabeça para baixo — que é exatamente a
      // situação em que o auto-nivelamento precisa funcionar, porque é a
      // situação em que o piloto recorreu a ele.
      const A = DCFG.quad.angle;
      // A guinada do alvo é a guinada ATUAL: o auto-nivelamento não deve ter
      // opinião sobre para onde o drone aponta, só sobre o quanto ele inclina.
      this._euler.setFromQuaternion(this.quaternion, 'YXZ');
      this._qTarget.setFromEuler(
        this._euler.set(ePitch * A.maxLean, this._euler.y, -eRoll * A.maxLean, 'YXZ'),
      );

      this._qErr.copy(this.quaternion).conjugate().multiply(this._qTarget);
      // Caminho curto: sem isto, um erro de 200° é corrigido dando a volta
      // longa de 160° para o outro lado — o drone gira ao contrário.
      if (this._qErr.w < 0) {
        this._qErr.set(-this._qErr.x, -this._qErr.y, -this._qErr.z, -this._qErr.w);
      }
      const w = clamp(this._qErr.w, -1, 1);
      const s = Math.sqrt(Math.max(0, 1 - w * w));
      const angle = 2 * Math.acos(w);
      // s → 0 significa erro nulo; o eixo fica indefinido e a correção é zero.
      const k = s > 1e-6 ? (angle / s) * A.p : 0;

      tPitch = clamp(this._qErr.x * k, -A.maxCorrection, A.maxCorrection);
      // O sinal de Z é invertido pela convenção da rolagem (ver
      // `_integrateRotation`), e o alvo já foi construído com -roll acima —
      // as duas inversões se cancelam e a correção sai no sentido certo.
      tRoll = clamp(-this._qErr.z * k, -A.maxCorrection, A.maxCorrection);
    }

    // Persegue o alvo. Lambda diferente para "começar a girar" e "parar de
    // girar" — a mesma assimetria do modelo de voo da nave, e pelo mesmo
    // motivo: é ela que dá inércia rotacional sem simular inércia.
    const lamP = ePitch === 0 && this.mode === 'acro' ? R.damping : R.response;
    const lamR = eRoll === 0 && this.mode === 'acro' ? R.damping : R.response;
    const lamY = eYaw === 0 ? R.damping : R.response;

    av.x = damp(av.x, tPitch, lamP, dt);
    av.y = damp(av.y, tYaw, lamY, dt);
    av.z = damp(av.z, tRoll, lamR, dt);
  }

  _integrateRotation(dt) {
    const av = this.angularVelocity;
    const angle = av.length() * dt;
    if (angle < 1e-7) return;

    // ⚠ Os sinais NÃO são simétricos, e a assimetria é consequência de a
    // frente local ser -Z (convenção do Three, herdada da câmera):
    //
    //   arfagem (+X): rotação positiva leva (0,0,-1) → (0, senθ, -cosθ).
    //                 O nariz SOBE. Sinal direto.
    //   guinada (+Y): rotação positiva leva o nariz para a ESQUERDA. Como
    //                 nossa convenção é "positivo = direita", inverte.
    //   rolagem (+Z): rotação positiva inclina o "para cima" para -X, ou
    //                 seja, rola para a ESQUERDA. Inverte também.
    //
    // Este é exatamente o mesmo bloco do modelo da nave. Ele está duplicado
    // em vez de compartilhado porque um dia um dos dois vai querer uma
    // convenção diferente, e o acoplamento custaria mais que a duplicação.
    this._axis.set(av.x, -av.y, -av.z).normalize();
    this._dq.setFromAxisAngle(this._axis, angle);
    // À direita: aplica no espaço LOCAL do drone.
    this.quaternion.multiply(this._dq);
    this.quaternion.normalize();
  }

  /**
   * Mixagem dos quatro motores.
   *
   * ═══ POR QUE ISTO EXISTE SE O EMPUXO É A MÉDIA ═══
   *
   * A força que move o drone é a SOMA dos quatro motores, e a soma é
   * conhecida sem mixar nada. A mixagem existe pela diferença entre eles,
   * que é o que se vê e o que se ouve:
   *
   *   • as hélices giram em velocidades diferentes numa curva;
   *   • o áudio de um quad manobrando é o batimento entre motores
   *     desiguais — é isso que distingue um quad de um zumbido;
   *   • a bateria drena pelo motor mais exigido, não pela média. Saturar
   *     um motor numa curva agressiva CUSTA, e é por isso que voar limpo
   *     rende mais tempo de voo.
   *
   * ═══ SATURAÇÃO ═══
   *
   * Se o acelerador está em 0,95 e a curva pede +0,2 num motor, esse motor
   * pediria 1,15 — que não existe. Cortar em 1,0 seria o óbvio e é errado:
   * o drone perderia autoridade de rolagem justamente no acelerador alto,
   * e o piloto sentiria o comando "sumir" sem entender por quê.
   *
   * A solução (o "airmode" do Betaflight) é abaixar o acelerador COMUM até
   * a diferença caber. Perde-se um pouco de altura e preserva-se o
   * controle — que é a troca certa, porque altura se recupera e controle
   * perdido vira acidente.
   */
  _mixMotors(cmd, dt) {
    const Q = DCFG.quad;
    // Comandos normalizados de eixo: quanto do fim de curso está sendo pedido.
    const p = clamp(cmd.pitch, -1, 1) * 0.34;
    const r = clamp(cmd.roll, -1, 1) * 0.34;
    const y = clamp(cmd.yaw, -1, 1) * 0.22;
    const base = this.armed ? Math.max(Q.idleThrust, this.throttle) : 0;

    // Nariz para cima = mais empuxo ATRÁS. Rolar para a direita = mais
    // empuxo à ESQUERDA. Guinada usa o torque de reação: acelerar o par que
    // gira num sentido gira o frame no sentido oposto.
    const mix = this._mixBuf ??= [0, 0, 0, 0];
    mix[M_RR] = base + p - r - y;
    mix[M_FR] = base - p - r + y;
    mix[M_RL] = base + p + r + y;
    mix[M_FL] = base - p + r - y;

    if (this.armed) {
      let hi = -Infinity, lo = Infinity;
      for (const m of mix) { if (m > hi) hi = m; if (m < lo) lo = m; }
      // Airmode: desloca os quatro juntos até caberem em [idle, 1]. Deslocar
      // preserva as DIFERENÇAS, que são o comando; cortar as destruiria.
      if (hi > 1) { const d = hi - 1; for (let i = 0; i < 4; i++) mix[i] -= d; }
      const lo2 = Math.min(mix[0], mix[1], mix[2], mix[3]);
      if (lo2 < Q.idleThrust) {
        const d = Q.idleThrust - lo2;
        for (let i = 0; i < 4; i++) mix[i] = Math.min(1, mix[i] + d);
      }
    }

    for (let i = 0; i < 4; i++) {
      this.motors[i] = this.armed ? clamp(mix[i], 0, 1) : 0;
      // Inércia do conjunto motor+hélice. É o atraso daqui que produz o
      // afundamento ao sair de um mergulho (propwash) e o "peso" do
      // punch-out — nenhum dos dois é código especial.
      this.motorThrust[i] = damp(this.motorThrust[i], this.motors[i], Q.motorResponse, dt);
    }
  }

  /**
   * Bateria de LiPo com resistência interna.
   *
   * A voltagem exibida é a de repouso MENOS o afundamento sob carga
   * (ΔV = I·R). Isso é uma linha de código e muda o jogo: o OSD passa a
   * responder ao acelerador em tempo real, e o piloto aprende a ler o quanto
   * a bateria afunda num punch como sinal de que ela está no fim — que é
   * exatamente a leitura que se faz voando de verdade.
   */
  _updateBattery(dt) {
    const B = DCFG.quad.battery;
    const load = (this.motorThrust[0] + this.motorThrust[1]
                + this.motorThrust[2] + this.motorThrust[3]) / 4;

    // A corrente cresce mais que linearmente com o empuxo: dobrar o empuxo
    // de uma hélice custa mais que o dobro de potência.
    this.current = this.armed
      ? B.idleCurrent + (B.fullCurrent - B.idleCurrent) * Math.pow(load, 1.6)
      : 0;
    this.mahUsed = Math.min(B.capacity * 1.15, this.mahUsed + this.current * dt / 3.6);

    const pct = this.batteryPct;
    // Curva de descarga: quase plana no meio, despenca no fim. O expoente
    // 0,62 reproduz o joelho característico do LiPo sem tabela nenhuma.
    const rest = B.emptyPerCell + (B.fullPerCell - B.emptyPerCell) * Math.pow(pct, 0.62);
    this.voltage = B.cells * rest - this.current * B.resistance;

    // Limite por voltagem: o drone não cai do céu, fica MOLE. A janela de
    // 0,3 V por célula é o aviso — tempo de decidir voltar.
    const cell = this.voltage / B.cells;
    this.sagLimit = smoothstep(B.sagCutoffPerCell - 0.3, B.sagCutoffPerCell, cell) * 0.75 + 0.25;
    if (pct <= 0) this.sagLimit = Math.min(this.sagLimit, 0.12);
  }

  /**
   * Integração linear: empuxo + gravidade + arrasto.
   *
   * O empuxo aponta para o "para cima" DO DRONE. Essa única linha é o jogo
   * inteiro — ver o cabeçalho do arquivo.
   */
  _integrateLinear(dt, world) {
    const Q = DCFG.quad;
    const a = this._accel.set(0, -DCFG.world.gravity, 0);

    const thrust01 = (this.motorThrust[0] + this.motorThrust[1]
                    + this.motorThrust[2] + this.motorThrust[3]) / 4;

    // Efeito solo: a hélice empurra contra ar que não tem para onde escapar.
    // É por isso que o último metro de um pouso é o difícil, e por que um
    // drone "boia" quando você tenta encostá-lo no chão.
    const agl = this.position.y - world.heightAt(this.position.x, this.position.z);
    const ge = 1 + Q.groundEffectGain
      * Math.max(0, 1 - agl / Q.groundEffectHeight);

    const accelThrust = thrust01 * this.maxThrustAccel * this.sagLimit * ge;
    a.addScaledVector(this.getUp(), accelThrust);

    // ── Arrasto quadrático, anisotrópico ──────────────────────────────
    // A decomposição no eixo vertical DO DRONE não é preciosismo: o disco
    // das hélices é uma placa que freia muito mais de barriga que de nariz.
    // É essa diferença que permite descer rápido sem virar o drone, e é ela
    // que produz o balanço ao atravessar o próprio fluxo (propwash).
    const v = this.velocity;
    const up = this._up; // já preenchido por getUp() acima
    const vUp = v.dot(up);
    this._tmp.copy(v).addScaledVector(up, -vUp);   // componente no plano do disco
    const vPlane = this._tmp.length();

    // Arrasto no plano do disco: força ∝ v², direção oposta à velocidade.
    // `-drag * vPlane` multiplicado pelo VETOR já dá o v² — o vetor carrega
    // uma das potências e a direção de uma vez.
    if (vPlane > 1e-4) a.addScaledVector(this._tmp, -Q.drag * vPlane);
    // Arrasto no eixo do disco, com `abs` para preservar o sinal: sem ele,
    // v² é sempre positivo e o arrasto ACELERARIA a queda.
    a.addScaledVector(up, -Q.drag * Q.dragVerticalMul * vUp * Math.abs(vUp));

    v.addScaledVector(a, dt);
    this.position.addScaledVector(v, dt);

    this._sanitize();
  }

  /** Queda sem controle depois de um acidente: só gravidade, arrasto alto e
   *  quique no terreno. Os motores param — hélice quebrada não gira. */
  _integrateFall(dt, world) {
    this.motors.fill(0);
    this.motorThrust.fill(0);
    this.current = 0;
    const v = this.velocity;
    v.y -= DCFG.world.gravity * dt;
    v.multiplyScalar(Math.exp(-0.9 * dt));
    this.position.addScaledVector(v, dt);
    // Tombo desordenado enquanto cai: um drone quebrado gira sem controle.
    this.angularVelocity.multiplyScalar(Math.exp(-0.6 * dt));
    this._integrateRotation(dt);

    const h = world.heightAt(this.position.x, this.position.z);
    if (this.position.y < h + DCFG.quad.radius) {
      this.position.y = h + DCFG.quad.radius;
      v.y = Math.abs(v.y) * 0.25;
      v.x *= 0.6; v.z *= 0.6;
      if (v.lengthSq() < 0.4) v.set(0, 0, 0);
    }
  }

  /**
   * Colisão com o terreno, com a água e com os obstáculos.
   *
   * Duas saídas possíveis, e a fronteira entre elas é a decisão de design
   * mais importante do arquivo: bater FORTE quebra, bater DE LEVE quica.
   * Sem o quique, ninguém tenta passar perto de nada — e passar perto das
   * coisas é o jogo inteiro.
   */
  _collide(dt, world) {
    const Q = DCFG.quad;
    const p = this.position;
    const v = this.velocity;

    // ── Água: sem perdão. Um drone que cai na água acabou. ─────────────
    if (p.y < DCFG.terrain.waterLevel && world.isWater(p.x, p.z)) {
      this.crash('ÁGUA');
      return;
    }

    const h = world.heightAt(p.x, p.z);
    const floor = h + Q.radius;
    if (p.y < floor) {
      world.normalAt(p.x, p.z, this._normal);
      const vn = v.dot(this._normal);   // negativo = indo contra o solo
      const impact = -vn;

      if (impact > Q.crashSpeed) {
        p.y = floor;
        this.crash('IMPACTO');
        return;
      }

      p.y = floor;
      if (vn < 0) {
        // Remove a componente normal e devolve uma fração — quique.
        v.addScaledVector(this._normal, -vn * (1 + Q.bounce));
      }
      // Atrito com o chão. Sem ele o drone patina na grama como num rinque.
      const friction = Math.exp(-6 * dt);
      v.x *= friction; v.z *= friction;

      // Pousado: quieto, no chão e com o acelerador baixo. A condição de
      // acelerador evita declarar "pousado" no meio de uma decolagem.
      this.landed = v.lengthSq() < 1.2 && this.throttle < 0.25;
      if (this.landed && this.mode === 'angle') {
        // Encostado e sem comando, o drone acomoda na inclinação do terreno.
        // Detalhe pequeno; sem ele o drone fica "colado" flutuando no nível.
        this.angularVelocity.multiplyScalar(Math.exp(-8 * dt));
      }
    } else {
      this.landed = false;
    }

    // ── Obstáculos ─────────────────────────────────────────────────────
    // O raio de teste é o do frame, não o das hélices: raspar hélice em
    // folha e explodir seria realista e injogável.
    if (world.hitProp(p, Q.radius * 3)) {
      // Velocidade baixa contra um tronco não quebra — só para o drone.
      // Lê a velocidade do vetor, e não de `this.speed`: a métrica só é
      // atualizada depois desta função, e usá-la aqui julgaria a batida
      // pela velocidade do frame anterior.
      if (v.length() > Q.crashSpeed) { this.crash('OBSTÁCULO'); return; }
      const back = this._tmp.copy(v).normalize().multiplyScalar(-Q.radius * 3.2 * 0.5);
      p.add(back);
      v.multiplyScalar(-Q.bounce);
    }

    // ── Geofence ───────────────────────────────────────────────────────
    // Empurrão crescente em vez de parede. A cerca de um drone de verdade
    // não bate: ela empurra de volta, e o piloto sente pelo manche.
    const F = DCFG.fence;
    const dx = p.x - this.home.x, dz = p.z - this.home.z;
    const dist = Math.hypot(dx, dz);
    if (dist > F.warnRadius) {
      // ⚠ O empurrão só age enquanto o drone AINDA NÃO está voltando rápido.
      // A primeira versão empurrava sempre, e como a aceleração se acumula
      // frame após frame, sair da cerca e voltar virava uma catapulta: o
      // drone era devolvido ao mapa a 20 m/s, de costas, sem controle. Medir
      // a velocidade RADIAL e parar de empurrar quando ela já é suficiente
      // transforma a catapulta num limite — que é o que uma cerca deveria ser.
      const inv = 1 / Math.max(dist, 1e-3);
      const vRadial = (v.x * dx + v.z * dz) * inv;   // positivo = afastando
      if (vRadial > -F.maxReturnSpeed) {
        const over = smoothstep(F.warnRadius, F.radius, dist);
        const k = F.pushAccel * over * dt * inv;
        v.x -= dx * k; v.z -= dz * k;
      }
    }
    if (p.y > F.ceiling) {
      v.y -= (p.y - F.ceiling) * 0.9 * dt;
    }
  }

  /** Declara acidente. Público porque o mundo (e a água, e o teto) também
   *  podem matar o drone, e todos devem passar pelo mesmo caminho. */
  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashReason = reason;
    this.crashTimer = DCFG.quad.respawnDelay;
    this.armed = false;
    // O drone é jogado na direção do impacto e gira sem controle.
    this.angularVelocity.set(
      (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 12,
    );
    this.velocity.multiplyScalar(0.35);
  }

  _updateMetrics(dt, world) {
    this.speed = this.velocity.length();
    this.altitudeAGL = this.position.y - world.heightAt(this.position.x, this.position.z);

    this._tmp.copy(this.velocity).sub(this._prevVelocity);
    this.gForce = dt > 0 ? this._tmp.length() / dt / DCFG.world.gravity : 0;
    this._prevVelocity.copy(this.velocity);

    // ── Contagem de acrobacias ─────────────────────────────────────────
    // Integrar a velocidade angular e contar cada 2π é o jeito barato e
    // correto: funciona em qualquer eixo, não depende de detectar "estou de
    // cabeça para baixo", e não conta duas vezes um giro interrompido no
    // meio. O acumulador zera quando o eixo fica parado, senão meia dúzia de
    // curvas ao longo de uma volta somaria um "flip" que ninguém fez.
    if (Math.abs(this.angularVelocity.z) > 2.5) {
      this._rollAccum += this.angularVelocity.z * dt;
      if (Math.abs(this._rollAccum) >= Math.PI * 2) {
        this.rolls++;
        this._rollAccum -= Math.sign(this._rollAccum) * Math.PI * 2;
      }
    } else {
      this._rollAccum = damp(this._rollAccum, 0, 4, dt);
    }
    if (Math.abs(this.angularVelocity.x) > 2.5) {
      this._pitchAccum += this.angularVelocity.x * dt;
      if (Math.abs(this._pitchAccum) >= Math.PI * 2) {
        this.flips++;
        this._pitchAccum -= Math.sign(this._pitchAccum) * Math.PI * 2;
      }
    } else {
      this._pitchAccum = damp(this._pitchAccum, 0, 4, dt);
    }
  }

  /**
   * Rede de segurança contra NaN.
   *
   * Um único NaN num integrador é permanente: a partir do frame em que ele
   * aparece o drone desaparece, sem exceção, sem log, sem recuperação. Duas
   * comparações por frame transformam a pior falha possível num soluço.
   */
  _sanitize() {
    const p = this.position, v = this.velocity;
    if (Number.isFinite(p.x + p.y + p.z) && Number.isFinite(v.x + v.y + v.z)) return;
    console.warn('[quad] estado numérico inválido — reiniciando no home');
    this.reset(this.home, 0, { keepBattery: true });
  }
}

/** Curva expo: preserva o sinal, comprime o centro. Um manche sem expo é
 *  nervoso perto do neutro; com expo demais, morto. */
function expo(v, e) {
  return Math.sign(v) * Math.pow(Math.abs(v), e);
}
