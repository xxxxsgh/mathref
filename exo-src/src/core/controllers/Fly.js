/**
 * Controlador de VOO padrão do núcleo — usado em 'ship' e 'space' até o
 * sistema 'ship' instalar o seu (ctx.player.setController('ship', ...)).
 *
 * 6DOF livre: mouse = guinada/arfagem no referencial da nave, Q/E rolagem,
 * W/S frente/ré, A/D lateral, Espaço/Ctrl sobe/desce, Shift pós-combustor.
 * A velocidade máxima ESCALA COM A ALTITUDE (v = altitude·altFactor, entre
 * minSpeed e maxSpeed, aplicada como teto imediato — freio de proximidade):
 * da órbita ao solo num voo contínuo, desacelerando exponencialmente perto
 * da superfície. Integração em double; nunca entra
 * no solo (minAltitude).
 * Em 'ship', perto do solo, nivela devagar a rolagem com o horizonte
 * (autoLevel) quando não há comando de rolagem.
 */
import { Vector3, Quaternion } from 'three';
import { quatFromForwardUp } from '../Geo.js';

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _q2 = new Quaternion();
const _w = new Vector3();
const _f = new Vector3();

export class FlyController {
  constructor(o = {}) {
    this.name = o.name || 'ship';
    this.altFactor = o.altFactor ?? 0.6;
    this.minSpeed = o.minSpeed ?? 8;
    this.maxSpeed = o.maxSpeed ?? 5e5;
    this.boost = o.boost ?? 4;
    this.response = o.response ?? 3;
    this.rollRate = o.rollRate ?? 1.6;
    this.minAltitude = o.minAltitude ?? 2.5;
    this.autoLevel = o.autoLevel ?? true;
    /** comando externo (testes/bots): { x, y, z } em −1..1 no referencial da nave, ou null */
    this.command = null;
  }

  /** Velocidade máxima na altitude dada. */
  speedAt(altitude, boost = false) {
    const v = Math.min(this.maxSpeed, Math.max(this.minSpeed, Math.max(0, altitude) * this.altFactor));
    return boost ? v * this.boost : v;
  }

  update(dt, p, ctx) {
    const input = ctx.input;
    const q = p.quaternion;
    if (p.lookEnabled) {
      const look = input.consumeLook();
      if (look.yaw) q.multiply(_q.setFromAxisAngle(Y, look.yaw));
      if (look.pitch) q.multiply(_q.setFromAxisAngle(X, look.pitch));
    }
    let roll = 0;
    if (p.moveEnabled) roll = (input.action('rollLeft') ? 1 : 0) - (input.action('rollRight') ? 1 : 0);
    if (roll) q.multiply(_q.setFromAxisAngle(Z, roll * this.rollRate * dt));
    q.normalize();

    p.updateSurface();
    if (this.autoLevel && !roll && p.altitude < 20000) {
      _f.set(0, 0, -1).applyQuaternion(q);
      if (Math.abs(_f.dot(p.up)) < 0.95) {
        quatFromForwardUp(_f, p.up, _q2);
        const k = 1 - Math.exp(-dt * 0.8 * (1 - p.altitude / 20000));
        q.slerp(_q2, k);
      }
    }

    // empuxo desejado no referencial da nave
    let cx = 0;
    let cy = 0;
    let cz = 0;
    if (this.command) {
      cx = this.command.x || 0;
      cy = this.command.y || 0;
      cz = this.command.z || 0;
    } else if (p.moveEnabled) {
      cz = (input.action('forward') ? 1 : 0) - (input.action('back') ? 1 : 0);
      cx = (input.action('right') ? 1 : 0) - (input.action('left') ? 1 : 0);
      cy = (input.action('jump') ? 1 : 0) - (input.action('descend') ? 1 : 0);
    }
    _w.set(cx, cy, -cz);
    if (_w.lengthSq() > 1) _w.normalize();
    const vmax = this.speedAt(p.altitude, !!(this.command?.boost || input.action('sprint')));
    _w.applyQuaternion(q).multiplyScalar(vmax);
    p.velocity.lerp(_w, 1 - Math.exp(-this.response * dt));
    // freio de proximidade: |v| nunca passa do limite da altitude atual
    // (acelera suave, freia na hora) → aproximação exponencial, sem
    // atravessar o solo nem chegar nele a milhares de m/s
    const sp = p.velocity.length();
    if (sp > vmax) p.velocity.multiplyScalar(vmax / sp);
    p.worldPos.addScaledVector(p.velocity, dt);

    const s = p.updateSurface();
    if (s.altitude < this.minAltitude) {
      const c = p.center;
      p.worldPos.set(c.x, c.y, c.z).addScaledVector(s.up, s.groundR + this.minAltitude);
      const vn = p.velocity.dot(s.up);
      if (vn < 0) p.velocity.addScaledVector(s.up, -vn);
      p.updateSurface();
    }
    p.grounded = false;
  }
}
