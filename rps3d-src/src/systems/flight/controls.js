// Controles de voo: teclado + mouse (manche virtual estilo Star Citizen),
// gamepad (analógicos diretos) e toque (eixos virtuais da HUD).
//
//   mouse X/Y         guinada / arfagem (manche virtual que recentra sozinho)
//   W / S             acelerador (segure para subir/descer; roda do mouse = degraus)
//   A / D             strafe lateral        Espaço / C   strafe vertical
//   Q / E             rolagem               Shift        boost (pós-combustor)
//   V                 acoplado/desacoplado  N            trem de pouso
//   J                 quântico (no alvo ou no que está na mira) / cruzeiro
//   1 2 3             prioriza escudos / motor / armas   4 equilibra   5 próximo perfil
//   B                 câmera externa ↔ cockpit           Alt (segurar) olhar livre
//   F                 levantar da cadeira / pedir pouso na estação
//   Backspace         corta o acelerador
import * as THREE from 'three/webgpu';

const clamp = THREE.MathUtils.clamp;
const expo = (v, e = 1.6) => Math.sign(v) * Math.abs(v) ** e;

export class FlightControls {
  constructor(ctx) {
    this.ctx = ctx;
    const inp = ctx.input;
    // ações próprias do voo (não mexem no núcleo: bindings em tempo de execução)
    if (!inp.bindings.flightCamera) inp.bind('flightCamera', { keys: ['KeyB'] });
    if (!inp.bindings.flightCut) inp.bind('flightCut', { keys: ['Backspace'] });
    this.vstick = { x: 0, y: 0 };     // manche virtual do mouse/toque (−1..1)
    this.head = { yaw: 0, pitch: 0 }; // olhar livre (rad)
    this.idle = 0;
    this.out = { pitch: 0, yaw: 0, roll: 0, strafeX: 0, strafeY: 0, throttle: 0, boost: false, takeoff: false };
    this.override = null;
    this.mouseRange = 0.22;            // rad de mouse para deflexão total
    this.recenter = 2.2;               // 1/s
  }

  /** Lê o input bruto (chamado a cada passo fixo). `throttle` é o estado atual do acelerador. */
  read(dt, model, camMode) {
    const inp = this.ctx.input, o = this.out;
    if (this.override) {
      const ov = typeof this.override === 'function' ? this.override(dt, model) : this.override;
      Object.assign(o, { pitch: 0, yaw: 0, roll: 0, strafeX: 0, strafeY: 0, boost: false, takeoff: false }, ov || {});
      if (ov?.throttle !== undefined) model.throttle = ov.throttle;
      o.throttle = model.throttle;
      return o;
    }
    const look = inp.takeLook();
    const free = inp.down('freelook');
    const pad = inp.device === 'gamepad';
    if (free) {
      // olhar livre: o mouse gira a cabeça, o manche volta ao centro
      this.head.yaw = clamp(this.head.yaw - look.x * 1.1, -2.5, 2.5);
      this.head.pitch = clamp(this.head.pitch - look.y * 1.1, -1.2, 1.35);
      this.vstick.x *= Math.exp(-dt * 6); this.vstick.y *= Math.exp(-dt * 6);
    } else {
      this.head.yaw *= Math.exp(-dt * 5); this.head.pitch *= Math.exp(-dt * 5);
      if (!pad) {
        this.vstick.x = clamp(this.vstick.x + look.x / this.mouseRange, -1, 1);
        this.vstick.y = clamp(this.vstick.y + look.y / this.mouseRange, -1, 1);
        const moved = Math.abs(look.x) + Math.abs(look.y) > 1e-5;
        this.idle = moved ? 0 : this.idle + dt;
        // recentra quando o mouse para (manche "relativo" — sem cursor para caçar)
        const k = Math.exp(-dt * this.recenter * (this.idle > 0.08 ? 1 : 0.35));
        this.vstick.x *= k; this.vstick.y *= k;
        const L = Math.hypot(this.vstick.x, this.vstick.y);
        if (L > 1) { this.vstick.x /= L; this.vstick.y /= L; }
      }
    }
    // analógicos (gamepad / toque: eixos virtuais)
    const ax = inp.axis('lookX'), ay = inp.axis('lookY');
    let yaw = (pad ? 0 : expo(this.vstick.x, 1.35)) + expo(ax, 1.6);
    let pitch = (pad ? 0 : -expo(this.vstick.y, 1.35)) - expo(ay, 1.6);
    if (free) { yaw = expo(ax, 1.6); pitch = -expo(ay, 1.6); }
    o.yaw = clamp(yaw, -1, 1); o.pitch = clamp(pitch, -1, 1);
    o.roll = inp.axis('roll');
    o.strafeX = inp.axis('moveX') * (pad ? 0 : 1);
    o.strafeY = inp.axis('lift');
    // acelerador: W/S (ou analógico esquerdo Y) movem a alavanca
    const ty = inp.axis('moveY');
    let th = model.throttle;
    if (Math.abs(ty) > 0.05) th += ty * dt * (pad ? 0.9 : 0.75);
    const wheel = inp.takeWheel();
    if (wheel) th -= wheel * 0.1;
    if (inp.pressed('flightCut')) th = 0;
    // detentes: passa devagar pelo zero
    if (Math.abs(th) < 0.02 && Math.abs(ty) < 0.05) th = 0;
    model.throttle = clamp(th, -1, 1);
    o.throttle = model.throttle;
    // no gamepad, analógico esquerdo X faz strafe lateral
    if (pad) o.strafeX = inp.axis('moveX');
    o.boost = inp.down('boost');
    o.takeoff = false;
    return o;
  }

  /** Bordas (ações de um toque) — lidas no passo fixo. */
  edges() {
    const inp = this.ctx.input;
    if (this.override) return {};
    return {
      decouple: inp.pressed('decouple'), gear: inp.pressed('gear'), quantum: inp.pressed('quantum'),
      camera: inp.pressed('flightCamera'), interact: inp.pressed('interact'),
      p1: inp.pressed('power1'), p2: inp.pressed('power2'), p3: inp.pressed('power3'), p4: inp.pressed('power4'), p5: inp.pressed('power5'),
    };
  }

  headQuat(out = new THREE.Quaternion()) {
    return out.setFromEuler(new THREE.Euler(this.head.pitch, this.head.yaw, 0, 'YXZ'));
  }
}
