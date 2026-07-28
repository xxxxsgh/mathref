import { CONFIG } from '../../config.js';
import { clamp, damp, applyExpo } from '../MathUtils.js';

/**
 * Teclado + mouse (desktop).
 *
 * O mouse NÃO controla uma câmera livre. Ele move um retículo virtual, e o
 * deslocamento desse retículo em relação ao centro da tela vira comando de
 * pitch/yaw — como um manche com mola de retorno. Três motivos:
 *
 *  1. Funciona com E sem Pointer Lock. O Pointer Lock é irregular fora do
 *     desktop, então um esquema que depende dele nasce quebrado.
 *  2. O retículo é exatamente o elemento de HUD que a mira preditiva da Fase 2
 *     precisa. Ele já existe como estado de jogo, não como enfeite.
 *  3. Mira relativa ao centro é mais legível que acumular delta infinito: você
 *     sempre sabe o quanto está comandando olhando pra tela.
 */
export class KeyboardMouseSource {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {Set<string>} teclas fisicamente pressionadas agora */
    this.keys = new Set();
    /** @type {Set<string>} teclas que passaram a ser pressionadas neste frame */
    this.pressedThisFrame = new Set();

    // Retículo em espaço normalizado: (0,0) = centro, raio 1 = comando máximo.
    this.aimX = 0;
    this.aimY = 0;
    this.pointerLocked = false;
    this.firing = false;
    this.mouseMovedRecently = false;
    this._idleTimer = 0;

    this._onKeyDown = (e) => {
      // Evita que Space role a página e F3 abra a busca do Firefox.
      if (e.code === 'Space' || e.code === 'F3' || e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedThisFrame.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    // Ao perder o foco da janela o navegador para de mandar keyup. Sem isso a
    // nave fica com a tecla "grudada" quando você alt-tab durante uma curva.
    this._onBlur = () => this.keys.clear();

    this._onMouseMove = (e) => {
      if (!CONFIG.input.mouse.enabled) return;
      const m = CONFIG.input.mouse;
      if (this.pointerLocked) {
        // Com lock só existe delta. Integramos e clampamos num círculo.
        this.aimX += e.movementX * m.sensitivity;
        this.aimY += e.movementY * m.sensitivity;
        const mag = Math.hypot(this.aimX, this.aimY);
        if (mag > 1) { this.aimX /= mag; this.aimY /= mag; }
      } else {
        // Sem lock usamos a posição absoluta, normalizada pela MENOR dimensão
        // da tela. Normalizar por largura e altura separadamente deformaria a
        // sensibilidade em telas ultrawide.
        const half = Math.min(window.innerWidth, window.innerHeight) * 0.5;
        this.aimX = clamp((e.clientX - window.innerWidth / 2) / half, -1, 1);
        this.aimY = clamp((e.clientY - window.innerHeight / 2) / half, -1, 1);
      }
      this.mouseMovedRecently = true;
      this._idleTimer = 0;
    };

    // Botão do mouse. Usamos mousedown/mouseup em vez de `click` porque
    // precisamos do estado CONTÍNUO (segurar o gatilho), não do evento.
    this._onMouseDown = (e) => {
      if (e.button === CONFIG.input.mouse.fireButton) this.firing = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === CONFIG.input.mouse.fireButton) this.firing = false;
    };

    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };

    // Clique no canvas re-adquire o lock se ele foi perdido (Esc, alt-tab).
    this._onCanvasClick = () => this.requestPointerLockIfEnabled();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    // Ao perder o foco o mouseup pode nunca chegar, e o gatilho fica preso.
    window.addEventListener('blur', () => { this.firing = false; });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    canvas.addEventListener('click', this._onCanvasClick);
  }

  requestPointerLockIfEnabled() {
    if (!CONFIG.input.mouse.enabled || !CONFIG.input.mouse.usePointerLock) return;
    // `requestPointerLock` rejeita fora de um gesto do usuário e em vários
    // navegadores móveis. A promise rejeitada não é erro — é o caso normal.
    const req = this.canvas.requestPointerLock?.();
    if (req && typeof req.catch === 'function') req.catch(() => {});
  }

  /** @param {boolean[]} _ */
  _any(codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  _pressed(codes) {
    for (const c of codes) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  /** @param {import('../Input.js').ControlState} s */
  apply(s, actions, dt) {
    const K = CONFIG.input.keyboard;
    const M = CONFIG.input.mouse;

    let usedKeyboard = false;

    // ── Eixos de rotação por tecla ──
    const kPitch = (this._any(K.pitchUp) ? 1 : 0) - (this._any(K.pitchDown) ? 1 : 0);
    const kYaw = (this._any(K.yawRight) ? 1 : 0) - (this._any(K.yawLeft) ? 1 : 0);
    const kRoll = (this._any(K.rollRight) ? 1 : 0) - (this._any(K.rollLeft) ? 1 : 0);
    if (kPitch || kYaw || kRoll) usedKeyboard = true;
    s.pitch += kPitch;
    s.yaw += kYaw;
    s.roll += kRoll;

    // ── Propulsores laterais (6DOF) ──
    s.strafeX += (this._any(K.strafeRight) ? 1 : 0) - (this._any(K.strafeLeft) ? 1 : 0);
    s.strafeY += (this._any(K.strafeUp) ? 1 : 0) - (this._any(K.strafeDown) ? 1 : 0);

    // ── Acelerador: tecla altera em taxa constante, não instantâneo ──
    const tUp = this._any(K.throttleUp) ? 1 : 0;
    const tDown = this._any(K.throttleDown) ? 1 : 0;
    if (tUp || tDown) {
      s.throttle += (tUp - tDown) * CONFIG.flight.throttleRate * dt;
      usedKeyboard = true;
    }

    if (this._any(K.fire) || this.firing) s.fire = true;
    if (this._any(K.boost)) s.boost = true;
    if (this._any(K.brake)) s.brake = true;

    if (this._pressed(K.barrelRollLeft)) s.barrelRoll = -1;
    else if (this._pressed(K.barrelRollRight)) s.barrelRoll = 1;

    if (this._pressed(K.land)) actions.land = true;
    if (this._pressed(K.toggleDebug)) actions.toggleDebug = true;
    if (this._pressed(K.toggleTuner)) actions.toggleTuner = true;
    if (this._pressed(K.toggleAssist)) actions.toggleAssist = true;

    // ── Mouse como manche ──
    if (M.enabled) {
      // Recentragem lenta quando o mouse fica parado. Sem isso, com Pointer
      // Lock o retículo fica onde parou e a nave gira pra sempre — o erro mais
      // comum nesse esquema de controle.
      this._idleTimer += dt;
      if (M.recenter > 0 && this.pointerLocked && this._idleTimer > 0.08) {
        this.aimX = damp(this.aimX, 0, M.recenter, dt);
        this.aimY = damp(this.aimY, 0, M.recenter, dt);
      }

      const mag = Math.hypot(this.aimX, this.aimY);
      if (mag > M.deadzone) {
        // Reescala pra que o comando comece em 0 na borda da deadzone, e
        // aplica a curva expo na MAGNITUDE (não em cada eixo separado): assim
        // a direção do comando é preservada e as diagonais não ficam mais
        // fracas que os eixos puros.
        const linear = (mag - M.deadzone) / (1 - M.deadzone);
        const curved = applyExpo(linear, M.expo ?? 1) * M.gain;
        const k = curved / mag;
        s.yaw += clamp(this.aimX * k, -1, 1);
        s.pitch += clamp(-this.aimY * k * (M.invertY ? -1 : 1), -1, 1);
      }
      s.aimX = this.aimX;
      s.aimY = this.aimY;
      s.aimActive = true;
    }

    if (usedKeyboard || this.mouseMovedRecently) s.source = 'keyboard';
    this.mouseMovedRecently = false;
    this.pressedThisFrame.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.canvas.removeEventListener('click', this._onCanvasClick);
  }
}
