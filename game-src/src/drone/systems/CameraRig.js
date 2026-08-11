import * as THREE from 'three';
import { DCFG } from '../config.js';
import { dampVec3, damp, clamp } from '../../core/MathUtils.js';

/**
 * Rig de câmera: três vistas, e a primeira é o jogo.
 *
 * ═══ FPV: A CÂMERA É PARAFUSADA NO DRONE ═══
 *
 * Esta é a decisão que define o modo. A câmera de FPV NÃO é estabilizada:
 * ela rola, inclina e vira exatamente com o frame, inclusive de cabeça para
 * baixo. Todo instinto de programador de jogos manda suavizar isso — e
 * suavizar destrói o modo, porque a rotação da imagem É a informação. É por
 * ela que o piloto sabe onde está o chão quando não há horizonte visível.
 *
 * Então: sem suavização, sem interpolação, sem "up" do mundo. A câmera copia
 * o quaternion do drone e adiciona um único ângulo fixo — a inclinação da
 * câmera para cima.
 *
 * ═══ POR QUE A INCLINAÇÃO PARA CIMA É OBRIGATÓRIA ═══
 *
 * O drone inclina PARA BAIXO para ir para frente. A 60 km/h ele está a uns
 * 25° de nariz baixo. Com a câmera alinhada ao frame, o piloto passaria o
 * voo inteiro olhando para o chão à sua frente. Inclinar a câmera 25° para
 * cima cancela exatamente isso: em velocidade de cruzeiro, a imagem fica
 * nivelada. Em drones de verdade, esse ângulo é o ajuste que mais se discute
 * — mais inclinação, mais velocidade, menos visão ao pairar.
 *
 * ═══ AS OUTRAS DUAS VISTAS ═══
 *
 * Perseguidora: existe para aprender. Ver o próprio drone inclinar ensina a
 * relação inclinação→movimento em segundos; em FPV isso leva horas.
 *
 * Solo (LOS): a câmera fica onde o piloto está, no chão, e acompanha o drone
 * como quem olha para o céu. É como se voa de verdade sem óculos — e é a
 * vista que revela a escala: aquele ponto lá longe tem 25 centímetros.
 */

export const VIEW_FPV = 0;
export const VIEW_CHASE = 1;
export const VIEW_LOS = 2;
const VIEW_NAMES = ['FPV', 'PERSEGUIDORA', 'SOLO'];

export class CameraRig {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this.view = VIEW_FPV;

    this._pos = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._offset = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._qTilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), DCFG.camera.fpvTilt,
    );
    this._m = new THREE.Matrix4();
    this._shake = new THREE.Vector3();
    this._t = 0;
    this._crashShake = 0;
    this._fov = DCFG.world.fovFPV;
    this._chaseInit = false;
  }

  get viewName() { return VIEW_NAMES[this.view]; }

  cycleView() {
    this.view = (this.view + 1) % 3;
    this._chaseInit = false;
    return this.viewName;
  }

  /** Chamado num acidente: sacode a câmera por um instante. Em FPV isso é
   *  literalmente o que o link de vídeo faz quando o drone bate. */
  kick(amount = 1) {
    this._crashShake = Math.min(1.4, this._crashShake + amount);
  }

  /**
   * @param {import('../physics/Quad.js').Quad} quad
   * @param {THREE.Vector3} homePos posição do piloto, para a vista de solo
   * @param {number} dt
   */
  update(quad, homePos, dt) {
    this._t += dt;
    this._crashShake = damp(this._crashShake, 0, 3.5, dt);

    if (this.view === VIEW_FPV) this._updateFPV(quad, dt);
    else if (this.view === VIEW_CHASE) this._updateChase(quad, dt);
    else this._updateLOS(quad, homePos, dt);

    const targetFov = this.view === VIEW_FPV ? DCFG.world.fovFPV
      : this.view === VIEW_CHASE ? DCFG.world.fovChase : DCFG.world.fovLOS;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 9, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  _updateFPV(quad, dt) {
    this.camera.quaternion.copy(quad.quaternion).multiply(this._qTilt);

    // A câmera fica no pod, não no centro de massa. São 4 centímetros e
    // fazem diferença num rolamento: o mundo gira em torno do frame, não em
    // torno do olho, e é assim que se vê num drone de verdade.
    this._offset.set(0, 0.02, -0.04).applyQuaternion(quad.quaternion);
    this.camera.position.copy(quad.position).add(this._offset);

    // ── Vibração ─────────────────────────────────────────────────────
    // Duas fontes, e as duas são reais:
    //   • motores — a alta frequência que aparece no vídeo analógico como
    //     "jello". Proporcional ao empuxo, não à velocidade.
    //   • ar — o tranco de voar rápido perto do chão.
    // Amplitude minúscula de propósito: acima de poucos milímetros isso
    // deixa de ser textura e vira enjoo.
    const thrust = (quad.motorThrust[0] + quad.motorThrust[1]
                  + quad.motorThrust[2] + quad.motorThrust[3]) / 4;
    const amp = (thrust * 0.0016 + quad.speed * DCFG.camera.shakeSpeed * 0.0008)
      + this._crashShake * DCFG.camera.shakeCrash * 0.06;
    if (amp > 1e-5) {
      const t = this._t;
      this._shake.set(
        Math.sin(t * 137.3) * amp,
        Math.sin(t * 111.7 + 1.7) * amp,
        Math.sin(t * 97.1 + 3.1) * amp * 0.5,
      ).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this._shake);
    }
  }

  _updateChase(quad, dt) {
    // A perseguidora usa só a GUINADA do drone, não a atitude completa.
    // Copiar a rolagem faria a câmera dar cambalhotas junto num flip, o que
    // é injogável — e a vista de terceira pessoa existe justamente para dar
    // uma referência estável enquanto o drone gira.
    const fwd = quad.getForward(this._look).clone();
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();

    this._desired.copy(quad.position)
      .addScaledVector(fwd, -DCFG.camera.chaseDistance)
      .add(this._up.clone().multiplyScalar(DCFG.camera.chaseHeight));

    if (!this._chaseInit) { this._pos.copy(this._desired); this._chaseInit = true; }
    dampVec3(this._pos, this._desired, DCFG.camera.chaseLambda, dt);
    this.camera.position.copy(this._pos);

    // Olha um pouco À FRENTE do drone, não para ele. Enquadrar o drone no
    // centro esconde para onde ele vai — e para onde ele vai é a informação.
    this._look.copy(quad.position).addScaledVector(fwd, 2.2);
    this._m.lookAt(this.camera.position, this._look, this._up);
    this.camera.quaternion.setFromRotationMatrix(this._m);

    if (this._crashShake > 0.01) {
      const a = this._crashShake * DCFG.camera.shakeCrash * 0.35;
      this.camera.position.x += Math.sin(this._t * 61) * a;
      this.camera.position.y += Math.sin(this._t * 73 + 2) * a;
    }
  }

  _updateLOS(quad, homePos, dt) {
    this.camera.position.set(homePos.x, homePos.y + DCFG.camera.losHeight, homePos.z + 2.5);
    // Acompanha o drone com um atraso pequeno: a cabeça de um piloto não é
    // uma torre de tiro. O atraso também esconde o tremor do drone a
    // distância, que numa lente de 42° viraria ruído.
    this._look.lerp(quad.position, clamp(dt * 9, 0, 1));
    this._m.lookAt(this.camera.position, this._look, this._up);
    this.camera.quaternion.setFromRotationMatrix(this._m);
  }

  /** Reancora a câmera depois de um respawn, para ela não "voar" da posição
   *  antiga até a nova ao longo de meio segundo. */
  snapTo(quad) {
    this._chaseInit = false;
    this._look.copy(quad.position);
    this._crashShake = 0;
    this.update(quad, quad.home, 1 / 60);
  }
}
