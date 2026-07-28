import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../core/MathUtils.js';

/**
 * IA dos caças inimigos.
 *
 * ═══ PRINCÍPIO DE DESIGN ═══
 *
 * A IA usa exatamente o MESMO `FlightModel` do jogador, só com números piores.
 * Ela não teleporta, não gira instantaneamente e não ignora inércia. Isso
 * importa por dois motivos:
 *
 *  1. LEGIBILIDADE. O jogador aprende a prever o inimigo porque a física dele
 *     é a mesma que o jogador já internalizou nas mãos. Uma IA que se move por
 *     regras diferentes parece trapacear mesmo quando é mais fraca.
 *  2. As manobras emergem sozinhas. Um inimigo que tenta virar mais rápido do
 *     que consegue produz uma curva larga, derrapa e reposiciona — sem que
 *     nada disso precise ser programado.
 *
 * A IA só produz `pitch`, `yaw`, `roll`, `throttle`, `boost` — exatamente os
 * mesmos comandos que o jogador. Ela literalmente "aperta os botões".
 *
 * ═══ MÁQUINA DE ESTADOS ═══
 *
 *   approach  → voa até a distância de engajamento
 *   attack    → persegue com liderança de tiro e atira
 *   break     → passou perto demais: rompe, ganha distância
 *   flank     → contorna pra atacar de um ângulo, não de trás
 *   evade     → manobra evasiva depois de levar dano
 *
 * O estado `flank` existe porque, sem ele, todo inimigo cola atrás do jogador
 * e o combate vira uma fila indiana em linha reta. Forçar o reposicionamento
 * lateral é o que cria as passadas cruzadas que dão ritmo à luta.
 */

const STATE = {
  APPROACH: 'approach',
  ATTACK: 'attack',
  BREAK: 'break',
  FLANK: 'flank',
  EVADE: 'evade',
};

export class EnemyAI {
  /** @param {number} seedIndex usado só pra dessincronizar temporizadores */
  constructor(seedIndex = 0) {
    this.state = STATE.APPROACH;
    this.stateTime = 0;
    this.wantsFire = false;

    /** Ala: quando definido, este inimigo voa em formação com o líder. */
    this.leader = null;
    this.formationOffset = new THREE.Vector3();

    // Erro de mira persistente. Um vetor que caminha devagar em vez de ruído
    // por frame: ruído por frame produz tremor visível e ainda assim acerta na
    // média, porque os erros se cancelam. Um desvio lento faz o inimigo errar
    // de forma consistente e "humana".
    this._aimError = new THREE.Vector3();
    this._aimErrorTarget = new THREE.Vector3();
    this._errorTimer = Math.random() * 2;
    /** Multiplicador do erro de mira, vindo do escalonamento por onda.
     *  Menor que 1 = mira melhor. Ver `enemies.scaling.aimErrorDecay`. */
    this.aimErrorMul = 1;

    // Dessincroniza os temporizadores: sem isso, inimigos criados no mesmo
    // frame trocam de estado todos juntos e o combate parece coreografado.
    this.stateTime = (seedIndex * 0.37) % 1.5;
    this._runDuration = this._randomRun();
    this._flankSide = Math.random() < 0.5 ? -1 : 1;

    // Scratch.
    this._toTarget = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lead = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._inv = new THREE.Quaternion();
  }

  _randomRun() {
    const A = CONFIG.enemies.ai;
    return A.attackRunMin + Math.random() * (A.attackRunMax - A.attackRunMin);
  }

  /** Chamado quando o inimigo leva dano. */
  onDamaged() {
    const A = CONFIG.enemies.ai;
    if (this.state !== STATE.EVADE && Math.random() < A.evadeOnHitChance) {
      this._setState(STATE.EVADE);
      this._flankSide = Math.random() < 0.5 ? -1 : 1;
    }
  }

  _setState(s) {
    this.state = s;
    this.stateTime = 0;
    if (s === STATE.ATTACK) this._runDuration = this._randomRun();
  }

  /**
   * Produz os comandos de voo deste frame.
   * @param {import('./FlightModel.js').FlightModel} self
   * @param {{ position: THREE.Vector3, velocity: THREE.Vector3 }} target
   * @param {number} projectileSpeed
   * @param {number} dt
   * @param {object} out estado de controle a preencher (reaproveitado)
   */
  update(self, target, projectileSpeed, dt, out) {
    const A = CONFIG.enemies.ai;
    this.stateTime += dt;
    this.wantsFire = false;

    this._toTarget.copy(target.position).sub(self.position);
    const dist = this._toTarget.length();

    this._updateAimError(dt);
    this._updateState(dist, A);

    // ── Escolhe o ponto de destino conforme o estado ─────────────────
    switch (this.state) {
      case STATE.APPROACH:
      case STATE.ATTACK:
        // Ponto de interceptação: para onde atirar/voar dado que o alvo se
        // move. Ver `computeLead` abaixo.
        computeLead(self.position, target.position, target.velocity, projectileSpeed, this._lead);
        this._desired.copy(this._lead).add(this._aimError);
        break;

      case STATE.BREAK:
        // Rompe: mira num ponto ATRÁS e ao lado, pra ganhar separação rápido.
        this._desired.copy(self.position)
          .addScaledVector(self.getForward(this._tmp), 400)
          .addScaledVector(self.getRight(this._tmp), this._flankSide * 220);
        break;

      case STATE.FLANK: {
        // Contorna: um ponto deslocado lateralmente em relação ao alvo, à
        // frente dele. É isso que produz a passada cruzada em vez da fila
        // indiana atrás do jogador.
        this._tmp.copy(target.velocity);
        if (this._tmp.lengthSq() < 1) this._tmp.set(0, 0, -1);
        this._tmp.normalize();
        this._desired.copy(target.position).addScaledVector(this._tmp, A.reengageRange * 0.9);
        // Deslocamento perpendicular ao movimento do alvo.
        this._local.set(0, 1, 0).cross(this._tmp).normalize();
        this._desired.addScaledVector(this._local, this._flankSide * A.flankOffset);
        break;
      }

      case STATE.EVADE:
        // Evasiva: rola e sobe pra fora do plano de tiro, com um componente
        // senoidal que torna a trajetória difícil de liderar.
        this._desired.copy(self.position)
          .addScaledVector(self.getForward(this._tmp), 300)
          .addScaledVector(self.getUp(this._tmp), Math.sin(this.stateTime * 3.4) * 260)
          .addScaledVector(self.getRight(this._tmp), this._flankSide * 200);
        break;
    }

    // ── Formação: alas puxam pro slot do líder quando não estão atacando ──
    if (this.leader && this.state !== STATE.ATTACK && this.state !== STATE.EVADE) {
      this._tmp.copy(this.formationOffset).applyQuaternion(this.leader.quaternion)
        .add(this.leader.position);
      // Mistura, não substitui: o ala continua ciente do alvo.
      this._desired.lerp(this._tmp, 0.55);
    }

    this._steerTowards(self, this._desired, out);

    // ── Acelerador e boost ──────────────────────────────────
    if (this.state === STATE.BREAK || this.state === STATE.EVADE) {
      out.throttle = 1;
      out.boost = this.stateTime < 1.0;
    } else if (dist > A.engageRange) {
      // Boost já a partir da distância de engajamento, não do dobro dela:
      // sem isso o inimigo persegue em cruzeiro e nunca fecha a distância
      // contra um jogador acelerando.
      out.throttle = 1;
      out.boost = true;
    } else {
      // Em combate próximo, modula o acelerador pela distância: acelerar
      // sempre no máximo faz o inimigo ultrapassar o jogador toda passada.
      out.throttle = clamp(0.35 + dist / A.engageRange * 0.7, 0.3, 1);
      out.boost = false;
    }

    // ── Decisão de atirar ──────────────────────────────────
    if (this.state === STATE.ATTACK && dist < A.firingRange) {
      // Só atira se o nariz estiver dentro do cone de tiro em relação ao
      // ponto de interceptação. Atirar fora do cone gastaria tiro e, pior,
      // encheria a tela de traços que não significam ameaça — o que ensina
      // o jogador a IGNORAR os tiros inimigos.
      computeLead(self.position, target.position, target.velocity, projectileSpeed, this._lead);
      this._tmp.copy(this._lead).sub(self.position).normalize();
      const alignment = this._tmp.dot(self.getForward(this._local));
      if (alignment > Math.cos(A.firingCone * 12)) this.wantsFire = true;
    }
  }

  _updateState(dist, A) {
    switch (this.state) {
      case STATE.APPROACH:
        if (dist < A.engageRange) this._setState(STATE.ATTACK);
        break;

      case STATE.ATTACK:
        // Perto demais: rompe. Sem isso o inimigo colide com o jogador ou
        // fica orbitando dentro do raio mínimo de virada, o que parece bug.
        if (dist < A.breakRange) {
          this._flankSide = Math.random() < 0.5 ? -1 : 1;
          this._setState(STATE.BREAK);
        } else if (this.stateTime > this._runDuration) {
          // Passada esgotada: reposiciona. É o que impede a perseguição
          // infinita em linha reta.
          this._flankSide = Math.random() < 0.5 ? -1 : 1;
          this._setState(STATE.FLANK);
        } else if (dist > A.engageRange * 1.8) {
          this._setState(STATE.APPROACH);
        }
        break;

      case STATE.BREAK:
        if (dist > A.reengageRange || this.stateTime > 2.4) this._setState(STATE.FLANK);
        break;

      case STATE.FLANK:
        // Volta a atacar quando estiver reposicionado — ou por tempo, pra
        // nunca ficar preso circulando se o jogador fugir.
        if (this.stateTime > 2.8 || dist > A.engageRange * 1.4) {
          this._setState(dist < A.engageRange ? STATE.ATTACK : STATE.APPROACH);
        }
        break;

      case STATE.EVADE:
        if (this.stateTime > CONFIG.enemies.ai.evadeDuration) {
          this._setState(STATE.FLANK);
        }
        break;
    }
  }

  _updateAimError(dt) {
    const A = CONFIG.enemies.ai;
    this._errorTimer -= dt;
    if (this._errorTimer <= 0) {
      this._errorTimer = 0.8 + Math.random() * 1.6;
      this._aimErrorTarget.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).multiplyScalar(A.aimErrorMax * this.aimErrorMul);
    }
    this._aimError.lerp(this._aimErrorTarget, 1 - Math.exp(-A.aimErrorLambda * dt));
  }

  /**
   * Converte "quero ir pra ali" em comandos de pitch/yaw/roll.
   *
   * ═══ COMO ═══
   *
   * Transformamos a direção desejada para o espaço LOCAL da nave usando o
   * conjugado do quaternion de orientação. O conjugado de um quaternion
   * unitário é o inverso dele, então `v * q⁻¹` desfaz a rotação da nave e
   * responde: "onde está o alvo, do ponto de vista do piloto?".
   *
   * No espaço local, a leitura fica trivial:
   *   x > 0 → alvo à direita → guinar pra direita
   *   y > 0 → alvo acima     → cabrar
   *   z < 0 → alvo à frente
   *
   * O roll é o detalhe que separa uma IA convincente de uma robótica: caças
   * reais ROLAM pra pôr o alvo no plano vertical e depois puxam, porque o
   * pitch é o eixo mais rápido de qualquer aeronave. Fazer só yaw+pitch
   * simultâneos produz uma curva em espiral que parece de drone.
   */
  _steerTowards(self, point, out) {
    this._local.copy(point).sub(self.position);
    const dist = this._local.length();
    if (dist < 1e-3) { out.pitch = 0; out.yaw = 0; out.roll = 0; return; }
    this._local.multiplyScalar(1 / dist);

    this._inv.copy(self.quaternion).conjugate();
    this._local.applyQuaternion(this._inv);

    const x = this._local.x, y = this._local.y, z = this._local.z;

    // `-z` porque a frente local é -Z. `atan2` em vez de asin dá o sinal certo
    // mesmo com o alvo ATRÁS da nave — asin saturaria e a IA hesitaria.
    const yawErr = Math.atan2(x, -z);
    const pitchErr = Math.atan2(y, Math.hypot(x, z));

    // ═══ GANHO PROPORCIONAL — o número mais importante desta classe ═══
    //
    // Um controlador proporcional perseguindo um alvo em movimento estabiliza
    // num ERRO RESIDUAL, não em zero. O valor desse erro é ω_alvo / (K · ω_max):
    // a velocidade angular que o alvo exige, dividida pelo que o controlador
    // consegue comandar.
    //
    // Com K = 2.4 e ω_max ≈ 1.0 rad/s, contra um alvo cruzando a 300 u/s a
    // 400 unidades (ω ≈ 0.75 rad/s), o erro estabiliza em ~0.3 rad ≈ 17°.
    // O cone de tiro é de ~10°. Resultado: a IA perseguia perfeitamente e
    // NUNCA atirava — e o mesmo valia pro jogador tentando mirar.
    //
    // Com K = 6 o erro residual cai pra ~5°, dentro do cone. Na prática o
    // controlador satura (comando ±1) pra qualquer erro acima de ~10°, que é
    // exatamente o que um piloto faz: manche no batente até quase alinhar, e
    // só então dosar.
    out.yaw = clamp(yawErr * 6.0, -1, 1);
    out.pitch = clamp(pitchErr * 6.5, -1, 1);

    // Rola pra alinhar o "para cima" da nave com o lado do alvo, mas só
    // quando o alvo está razoavelmente à frente. Rolar com o alvo às costas
    // faria a nave girar no próprio eixo sem sair do lugar.
    if (-z > 0.15) {
      const rollErr = Math.atan2(x, Math.max(0.05, y + 0.6));
      out.roll = clamp(rollErr * 1.3, -1, 1);
    } else {
      out.roll = 0;
    }
  }
}

/**
 * Ponto de interceptação: onde mirar para acertar um alvo em movimento.
 *
 * ═══ A MATEMÁTICA ═══
 *
 * Queremos um tempo t tal que o projétil e o alvo estejam no mesmo lugar:
 *
 *     |D + V·t| = s·t          D = alvo − atirador, V = velocidade do alvo,
 *                              s = velocidade do projétil
 *
 * Elevando ao quadrado vira uma equação do segundo grau em t:
 *
 *     (V·V − s²)·t² + 2(D·V)·t + D·D = 0
 *
 * Escolhemos a MENOR raiz positiva (o primeiro instante em que o encontro é
 * possível). Se não houver raiz positiva, o alvo é mais rápido que o projétil
 * e fugir dele funciona — nesse caso devolvemos a posição atual, que ao menos
 * mantém a mira apontada na direção certa.
 *
 * Isso serve pra duas coisas: a IA usa pra atirar, e a HUD do jogador usa pro
 * retículo de predição.
 *
 * @param {THREE.Vector3} shooter
 * @param {THREE.Vector3} targetPos
 * @param {THREE.Vector3} targetVel
 * @param {number} speed
 * @param {THREE.Vector3} out
 */
const _d = new THREE.Vector3();
export function computeLead(shooter, targetPos, targetVel, speed, out) {
  _d.copy(targetPos).sub(shooter);

  const a = targetVel.lengthSq() - speed * speed;
  const b = 2 * _d.dot(targetVel);
  const c = _d.lengthSq();

  let t = -1;
  if (Math.abs(a) < 1e-4) {
    // Caso degenerado: alvo com exatamente a velocidade do projétil. A
    // equação vira linear.
    if (Math.abs(b) > 1e-6) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b + sq) / (2 * a);
      const t2 = (-b - sq) / (2 * a);
      // Menor raiz POSITIVA. Raízes negativas são encontros no passado.
      if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
      else t = Math.max(t1, t2);
    }
  }

  if (!(t > 0) || !Number.isFinite(t)) {
    out.copy(targetPos);
    return out;
  }
  // Teto no tempo de voo: liderar 10 segundos à frente produz um ponto de
  // mira absurdamente distante quando o alvo passa perpendicular.
  t = Math.min(t, 4);
  out.copy(targetVel).multiplyScalar(t).add(targetPos);
  return out;
}

export { STATE as AI_STATE };
