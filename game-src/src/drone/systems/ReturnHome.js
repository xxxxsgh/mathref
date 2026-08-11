import * as THREE from 'three';
import { DCFG } from '../config.js';
import { clamp } from '../../core/MathUtils.js';

/**
 * Retorno automático (RTH).
 *
 * ═══ POR QUE UM DRONE PRECISA DISTO ═══
 *
 * Em FPV você não vê o drone: vê a imagem dele. Quando a bateria acaba a 700
 * metros e o chuvisco cobre metade da tela, saber para onde voltar é um
 * problema real — e é o problema que fez todo fabricante implementar RTH.
 *
 * No jogo ele cumpre a mesma função que o piloto automático cumpre no jogo
 * de nave: impedir que a distância vire punição. Errar o caminho de volta e
 * ter que refazer 700 metros sem bateria não é dificuldade, é tédio.
 *
 * ═══ COMO ELE PILOTA ═══
 *
 * O RTH não teleporta e não "seta a velocidade": ele PILOTA, escrevendo nos
 * mesmos quatro eixos que o jogador usaria. Consequência importante: ele
 * está sujeito às mesmas leis. Se a bateria não dá empuxo, o RTH também não
 * sobe. Se o vento empurra, ele corrige como o jogador corrigiria.
 *
 * Isso poderia ter sido feito movendo a posição do drone diretamente, e o
 * resultado seria um drone que atravessa árvores e ignora a física — o que
 * quebraria a única regra que o jogo tem.
 *
 * ═══ TRÊS FASES ═══
 *
 *   SUBIR   até uma altura em que não há árvore (o RTH não desvia de nada —
 *           nem o de verdade; ele sobe para não precisar desviar);
 *   CRUZAR  em linha reta até em cima do ponto de decolagem;
 *   DESCER  devagar, até pousar.
 */

const OFF = 'off', CLIMB = 'subindo', CRUISE = 'voltando', DESCEND = 'descendo';

export class ReturnHome {
  constructor() {
    this.state = OFF;
    this._toHome = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  get engaged() { return this.state !== OFF; }
  get label() { return this.state === OFF ? '' : this.state.toUpperCase(); }

  /** @param {import('../physics/Quad.js').Quad} quad */
  toggle(quad) {
    if (this.engaged) { this.disengage(); return 'RTH CANCELADO'; }
    if (!quad.armed || quad.crashed) return null;
    this.state = CLIMB;
    this._prevMode = quad.mode;
    // O RTH exige auto-nivelamento: pilotar em acro por controle automático
    // seria possível e não faria sentido nenhum — é o modo que existe para
    // não precisar pensar em atitude.
    quad.mode = 'angle';
    return 'RTH ENGATADO';
  }

  disengage(quad) {
    if (quad && this._prevMode) quad.mode = this._prevMode;
    this.state = OFF;
    this._prevMode = null;
  }

  /**
   * Escreve nos comandos. Roda ANTES da física, porque o que ele escreve é o
   * comando DESTE frame — depois seria tarde, e o drone voaria sempre com um
   * quadro de atraso.
   *
   * @param {{throttle:number, roll:number, pitch:number, yaw:number}} cmd
   * @param {import('../physics/Quad.js').Quad} quad
   * @param {{heightAt:(x:number,z:number)=>number}} world
   */
  update(cmd, quad, world, dt) {
    if (!this.engaged) return null;

    // Qualquer toque no manche cancela. Um automatismo que exige encontrar o
    // botão de desligar é pior que não ter automatismo — e no momento em que
    // o piloto quer o controle de volta, ele o quer AGORA.
    const R = DCFG.rth;
    if (Math.abs(cmd.roll) > R.cancelStick || Math.abs(cmd.pitch) > R.cancelStick
        || Math.abs(cmd.yaw) > R.cancelStick) {
      this.disengage(quad);
      return 'RTH CANCELADO';
    }
    if (quad.crashed || !quad.armed) { this.disengage(quad); return null; }

    this._toHome.copy(quad.home).sub(quad.position);
    const horizontal = Math.hypot(this._toHome.x, this._toHome.z);
    const ground = world.heightAt(quad.position.x, quad.position.z);
    const agl = quad.position.y - ground;

    // ── Máquina de estados ────────────────────────────────────────────
    if (this.state === CLIMB && agl >= R.cruiseAltitude * 0.92) this.state = CRUISE;
    if (this.state === CRUISE && horizontal < R.arriveRadius) this.state = DESCEND;
    // Se o terreno subiu durante o cruzeiro, volta a subir. Sem isto o RTH
    // atravessa a encosta — que é exatamente o acidente que ele deveria
    // evitar.
    if (this.state === CRUISE && agl < R.cruiseAltitude * 0.6) this.state = CLIMB;

    // ── Velocidade horizontal alvo ────────────────────────────────────
    let targetSpeed = 0;
    if (this.state === CRUISE) {
      // Desacelera na chegada: um controlador de velocidade constante
      // ultrapassaria o alvo e ficaria oscilando em volta dele.
      targetSpeed = Math.min(R.speed, horizontal * 0.55);
    }

    const dirX = horizontal > 1e-3 ? this._toHome.x / horizontal : 0;
    const dirZ = horizontal > 1e-3 ? this._toHome.z / horizontal : 0;
    // Erro de velocidade = o que queremos menos o que temos. Comandar a
    // inclinação a partir do ERRO (e não da direção do alvo) é o que faz o
    // drone frear ao chegar em vez de passar direto.
    const errX = dirX * targetSpeed - quad.velocity.x;
    const errZ = dirZ * targetSpeed - quad.velocity.z;

    // Projeta o erro nos eixos do drone: é nesses eixos que o manche fala.
    quad.getForward(this._fwd);
    quad.getRight(this._right);
    const fwdErr = errX * this._fwd.x + errZ * this._fwd.z;
    const rightErr = errX * this._right.x + errZ * this._right.z;

    const k = 0.16;
    // Inclinar para FRENTE é nariz para baixo, e nariz para baixo é arfagem
    // NEGATIVA na nossa convenção — daí o sinal.
    cmd.pitch = clamp(-fwdErr * k, -0.85, 0.85);
    cmd.roll = clamp(rightErr * k, -0.85, 0.85);

    // ── Guinada: aponta para casa ─────────────────────────────────────
    // Não é necessário para voltar (o drone anda de lado sem problema), mas
    // é necessário para o PILOTO: em FPV a imagem tem que mostrar para onde
    // se está indo, senão a volta inteira é de costas.
    if (horizontal > R.arriveRadius * 2) {
      const cross = this._fwd.x * dirZ - this._fwd.z * dirX;
      const dot = this._fwd.x * dirX + this._fwd.z * dirZ;
      // atan2 do produto vetorial pelo escalar dá o ângulo COM SINAL entre
      // os dois vetores no plano — que é o erro de guinada.
      const yawErr = Math.atan2(cross, dot);
      cmd.yaw = clamp(-yawErr * 0.9, -0.6, 0.6);
    } else {
      cmd.yaw = 0;
    }

    // ── Acelerador: controlador de velocidade vertical ────────────────
    let targetVy = 0;
    if (this.state === CLIMB) targetVy = R.climbRate;
    else if (this.state === DESCEND) targetVy = -R.descendRate;
    else targetVy = clamp((ground + R.cruiseAltitude - quad.position.y) * 0.5,
                          -R.cruiseDescend, R.climbRate);

    // Parte de HOVER e corrige pelo erro. Partir do acelerador de pairar é o
    // que evita o controlador ter que "descobrir" a gravidade toda vez.
    const vyErr = targetVy - quad.velocity.y;
    // Divide pelo cosseno da inclinação: inclinado, parte do empuxo vai para
    // o lado e falta empuxo para segurar o peso. É a mesma compensação que o
    // piloto faz sem perceber ao dar gás na curva.
    const tilt = Math.max(0.35, quad.getUp(this._vel).y);
    cmd.throttle = clamp(quad.hoverThrottle / tilt + vyErr * 0.055, 0, 1);

    if (this.state === DESCEND && quad.landed) {
      this.disengage(quad);
      quad.armed = false;
      return 'POUSADO EM CASA';
    }
    return null;
  }
}
