import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp, dampVec3, clamp, smoothstep } from '../core/MathUtils.js';

/**
 * Câmera de perseguição com mola.
 *
 * ═══ A IDEIA CENTRAL ═══
 *
 * A câmera NÃO é filha da nave. Se fosse, ela copiaria a rotação exatamente e o
 * resultado seria a nave imóvel no centro da tela com o cenário girando em
 * volta — que é a receita de enjoo e de "não sinto a curva".
 *
 * Em vez disso existe uma ÂNCORA: uma orientação que persegue a da nave com
 * atraso. A câmera fica a um offset fixo dessa âncora. Quando você entra numa
 * curva forte, a âncora fica pra trás, a nave sai do centro da tela e você
 * "sente" a força lateral. Quando a curva termina, a âncora alcança e tudo
 * recentraliza. Esse atraso é o efeito mais barato de sensação de força que
 * existe, e é o que separa uma câmera de jogo de uma câmera de visualizador 3D.
 *
 * Três camadas de suavização, cada uma com um propósito:
 *   - rotationLambda: o atraso da âncora  → sensação de força na curva
 *   - positionLambda: a mola de posição   → absorve trepidação
 *   - swayGain:       deslocamento lateral proporcional à velocidade angular
 *                     → exagera a curva de propósito
 */
export class CameraRig {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;

    /** Orientação-âncora: persegue a da nave com atraso. */
    this.anchorQuat = new THREE.Quaternion();
    /** Posição suavizada da câmera. */
    this.position = new THREE.Vector3();
    this.initialized = false;

    this.fov = CONFIG.camera.fovBase;
    this.sway = new THREE.Vector3();

    // Sem alocação no loop.
    this._desired = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._targetSway = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._flatQuat = new THREE.Quaternion();
    this._up = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._shakeOffset = new THREE.Vector3();
    this._time = 0;
    // Scratch exclusivo do _applyPartialRoll, pra ele não pisar nos vetores
    // que o update() ainda vai usar depois.
    this._rollFwd = new THREE.Vector3();
    this._rollUp = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._prevShipPos = new THREE.Vector3();
    this._shipDelta = new THREE.Vector3();

    /**
     * Referência de "para cima" do mundo.
     *
     * No espaço é o +Y global — uma escolha arbitrária, mas estável, que dá
     * ao jogador uma noção de horizonte. Num planeta ela precisa ser a
     * NORMAL DA SUPERFÍCIE, senão o horizonte aparece inclinado num ângulo
     * aleatório (o que quer que sobre do +Y global naquele ponto do globo) e
     * voar baixo fica desorientador.
     *
     * O Engine interpola entre os dois conforme a densidade atmosférica.
     */
    this.upReference = new THREE.Vector3(0, 1, 0);
  }

  /** @param {import('./FlightModel.js').FlightModel} ship @param {number} dt */
  update(ship, dt) {
    const C = CONFIG.camera;
    this._time += dt;

    // ── 1. Âncora persegue a orientação da nave ──────────────────────────
    if (!this.initialized) {
      this.anchorQuat.copy(ship.quaternion);
    } else {
      // Slerp com taxa exponencial. `rotationLambda` é MENOR que o de posição
      // de propósito — é essa diferença que produz o atraso.
      this.anchorQuat.slerp(ship.quaternion, 1 - Math.exp(-C.rotationLambda * dt));
    }

    // O roll da câmera segue só uma FRAÇÃO do roll da nave. Copiar 100% do
    // roll num barrel roll faz o mundo inteiro girar e embrulha o estômago;
    // copiar 0% faz a manobra não ser lida. `rollFollow` interpola entre a
    // âncora completa e uma versão sem roll dela.
    this._applyPartialRoll(C.rollFollow);

    // ── 2. Posição desejada: offset no espaço da âncora ─────────────────
    const speedNorm = clamp(ship.speed / CONFIG.flight.maxSpeed, 0, 2);
    const boostAmount = ship.boosting ? 1 : 0;

    const pullback =
      C.offset[2] +
      speedNorm * C.pullbackSpeedGain +
      boostAmount * C.pullbackBoostGain;

    this._offset.set(C.offset[0], C.offset[1], pullback);
    this._offset.applyQuaternion(this._flatQuat);
    this._desired.copy(ship.position).add(this._offset);

    // ── 3. Sway: desloca lateralmente conforme a velocidade angular ─────
    // Exagera a curva. A nave vira pra esquerda → a câmera desliza um pouco
    // pra direita, o que aumenta a sensação de inércia.
    this._targetSway.set(
      -ship.angularVelocity.y * C.swayGain,
      ship.angularVelocity.x * C.swayGain * 0.6,
      0,
    );
    dampVec3(this.sway, this._targetSway, C.swayLambda, dt);
    this._tmp.copy(this.sway).applyQuaternion(this._flatQuat);
    this._desired.add(this._tmp);

    // ── 4. Mola de posição ──────────────────────────────────────────────
    if (!this.initialized) {
      this.position.copy(this._desired);
      this._prevShipPos.copy(ship.position);
      this.initialized = true;
    } else {
      // ⚠ Ponto sutil e importante: amortecimento exponencial em direção a um
      // alvo EM MOVIMENTO nunca alcança o alvo. Ele estabiliza num erro
      // constante de v/lambda — a 223 u/s com lambda 7.5 isso é ~30 unidades
      // de atraso permanente. O sintoma é péssimo: quanto mais rápido você
      // voa, mais longe a câmera fica e MENOR a nave aparece. Ou seja, o
      // efeito é exatamente o inverso do que queremos de sensação de
      // velocidade.
      //
      // A correção é amortecer no referencial que ACOMPANHA a nave: primeiro
      // transporta a câmera pelo mesmo deslocamento que a nave sofreu neste
      // frame, e só então amortece o resíduo. Assim a velocidade constante
      // não gera atraso nenhum, e o atraso passa a vir só da ACELERAÇÃO —
      // que é precisamente o que queremos sentir (apertar o boost joga a
      // câmera pra trás, e ela reacomoda).
      this._shipDelta.copy(ship.position).sub(this._prevShipPos);
      this.position.add(this._shipDelta);
      dampVec3(this.position, this._desired, C.positionLambda, dt);
    }
    this._prevShipPos.copy(ship.position);

    // ── 5. Tremor no boost ──────────────────────────────────────────────
    // Ruído senoidal em frequências incomensuráveis (não múltiplas entre si),
    // pra não criar um padrão perceptível de repetição.
    if (ship.boosting && C.boostShake > 0) {
      const a = C.boostShake;
      this._shakeOffset.set(
        Math.sin(this._time * 47.3) * a,
        Math.sin(this._time * 61.7) * a,
        0,
      );
      this._shakeOffset.applyQuaternion(this._flatQuat);
    } else {
      this._shakeOffset.multiplyScalar(Math.exp(-12 * dt));
    }

    this.camera.position.copy(this.position).add(this._shakeOffset);

    // ── 6. Orientação: olha À FRENTE da nave, não pra ela ────────────────
    // Mirar na nave faz a câmera "perseguir" e a nave parecer sempre fugindo.
    // Mirar num ponto adiante mantém a nave no terço inferior do quadro e o
    // destino visível — que é pra onde o jogador olha de verdade.
    ship.getForward(this._tmp);
    this._lookTarget.copy(ship.position).addScaledVector(this._tmp, C.lookAhead);

    // `lookAt` da câmera precisa de um "up". Usar o up do MUNDO faria a câmera
    // ignorar o roll da nave; usar o up da âncora (já com roll parcial) faz o
    // roll ser lido corretamente.
    this._up.set(0, 1, 0).applyQuaternion(this._flatQuat);
    this._m.lookAt(this.camera.position, this._lookTarget, this._up);
    this.camera.quaternion.setFromRotationMatrix(this._m);

    // ── 7. FOV dinâmico ─────────────────────────────────────────────────
    // Abrir o FOV com a velocidade é o que comunica velocidade. O número
    // absoluto de u/s não significa nada pro jogador; a distorção de
    // perspectiva nas bordas da tela, sim.
    const targetFov =
      C.fovBase +
      smoothstep(0.15, 1.0, speedNorm) * C.fovSpeedGain +
      boostAmount * C.fovBoostGain;
    this.fov = damp(this.fov, targetFov, C.fovLambda, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Mistura a âncora completa com uma versão "sem roll" dela, resultando em
   *  `_flatQuat`. Implementado extraindo a direção frontal da âncora e
   *  reconstruindo uma base com up do mundo — assim o roll some — e depois
   *  fazendo slerp de volta pra âncora original na proporção pedida. */
  _applyPartialRoll(amount) {
    if (amount >= 0.999) {
      this._flatQuat.copy(this.anchorQuat);
      return;
    }
    this._rollFwd.set(0, 0, -1).applyQuaternion(this.anchorQuat);
    // Caso degenerado: nariz apontando exatamente pro up do mundo. Aí não há
    // "sem roll" bem definido (qualquer roll é equivalente), então mantemos a
    // âncora como está em vez de produzir uma base instável.
    // Caso degenerado: nariz alinhado com a própria referência de "cima".
    if (Math.abs(this._rollFwd.dot(this.upReference)) > 0.999) {
      this._flatQuat.copy(this.anchorQuat);
      return;
    }
    // Matrix4.lookAt(eye, target, up) monta uma base cujo -Z aponta de `eye`
    // pra `target`. Com eye na origem e target = frente, obtemos a MESMA
    // direção frontal da âncora, mas com o up preso ao mundo — ou seja, sem
    // roll nenhum.
    this._origin.set(0, 0, 0);
    this._rollUp.copy(this.upReference);
    this._m.lookAt(this._origin, this._rollFwd, this._rollUp);
    this._flatQuat.setFromRotationMatrix(this._m);
    // Interpola de volta em direção à âncora completa: 0 = sem roll nenhum,
    // 1 = roll integral da nave.
    this._flatQuat.slerp(this.anchorQuat, amount);
  }

  /** Reposiciona instantaneamente (respawn, troca de câmera). */
  snapTo(ship) {
    this.initialized = false;
    this.anchorQuat.copy(ship.quaternion);
    this._prevShipPos.copy(ship.position);
    this.sway.set(0, 0, 0);
  }
}
