/**
 * Controlador A PÉ padrão do núcleo (o sistema de gameplay pode trocá-lo com
 * ctx.player.setController('walk', ...)).
 *
 * Gravidade RADIAL para o centro do planeta (planet.gravity, padrão 9,8),
 * "cima" = normal local; o corpo é transportado ao longo da esfera pelo
 * menor giro (o rumo não "torce" ao andar). Solo = planet.heightAt(dir).
 * Integração em double. Mouse: rumo em torno do up, inclinação em p.pitch.
 * WASD anda, Shift corre, Espaço pula (segurado no ar = jetpack curto).
 */
import { Vector3, Quaternion } from 'three';

const _q = new Quaternion();
const _f = new Vector3();
const _r = new Vector3();
const _w = new Vector3();
const _h = new Vector3();

export class WalkController {
  constructor(o = {}) {
    this.name = 'walk';
    this.walkSpeed = o.walkSpeed ?? 4.5;
    this.runSpeed = o.runSpeed ?? 9;
    this.jumpSpeed = o.jumpSpeed ?? 5.5;
    this.accel = o.accel ?? 14;
    this.airAccel = o.airAccel ?? 2.5;
    this.jetpack = o.jetpack ?? 16;
    this.fuel = 1;
  }

  enter(p) {
    p.uprightFromCurrent();
    p.grounded = p.altitude < 0.05;
  }

  update(dt, p, ctx) {
    const input = ctx.input;
    const planet = p.planet;
    const g = planet?.gravity ?? 9.8;
    p.updateSurface();
    const up = p.up;
    p.alignBodyToUp();

    if (p.lookEnabled) {
      const look = input.consumeLook();
      if (look.yaw) p.quaternion.premultiply(_q.setFromAxisAngle(up, look.yaw)).normalize();
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + look.pitch));
    }

    // desejo de movimento no plano tangente
    _f.set(0, 0, -1).applyQuaternion(p.quaternion);
    _r.set(1, 0, 0).applyQuaternion(p.quaternion);
    let fx = 0;
    let fz = 0;
    if (p.moveEnabled) {
      fz = (input.action('forward') ? 1 : 0) - (input.action('back') ? 1 : 0) + (input.axis?.active ? input.axis.y : 0);
      fx = (input.action('right') ? 1 : 0) - (input.action('left') ? 1 : 0) + (input.axis?.active ? input.axis.x : 0);
    }
    _w.set(0, 0, 0).addScaledVector(_f, fz).addScaledVector(_r, fx);
    if (_w.lengthSq() > 1) _w.normalize();
    const speed = input.action('sprint') ? this.runSpeed : this.walkSpeed;
    _w.multiplyScalar(speed);

    const v = p.velocity;
    let vUp = v.dot(up);
    _h.copy(v).addScaledVector(up, -vUp);
    const a = p.grounded ? this.accel : this.airAccel;
    _h.lerp(_w, 1 - Math.exp(-a * dt));

    vUp -= g * dt;
    if (p.moveEnabled && p.grounded && input.pressed('jump')) {
      vUp = this.jumpSpeed;
      p.grounded = false;
    } else if (p.moveEnabled && !p.grounded && input.action('jump') && this.fuel > 0) {
      vUp += this.jetpack * dt;
      this.fuel = Math.max(0, this.fuel - dt * 0.35);
    }
    if (p.grounded) this.fuel = Math.min(1, this.fuel + dt * 0.5);

    v.copy(_h).addScaledVector(up, vUp);
    p.worldPos.addScaledVector(v, dt);

    // solo
    const s = p.updateSurface();
    if (s.altitude <= 0) {
      const c = p.center;
      p.worldPos.set(c.x, c.y, c.z).addScaledVector(s.up, s.groundR);
      const vn = v.dot(s.up);
      if (vn < 0) v.addScaledVector(s.up, -vn);
      p.grounded = true;
      p.altitude = 0;
    } else {
      // gruda em descidas suaves (não "voa" ao andar morro abaixo)
      const vn = v.dot(s.up);
      if (p.grounded && s.altitude < 0.35 && vn <= 0.5) {
        const c = p.center;
        p.worldPos.set(c.x, c.y, c.z).addScaledVector(s.up, s.groundR);
        if (vn > 0) v.addScaledVector(s.up, -vn);
        p.altitude = 0;
      } else p.grounded = false;
    }
  }
}
