// Câmera do modo 'ship': cockpit em 1ª pessoa (olhar livre, cabeça que
// acompanha curvas e sente G) e câmera externa de perseguição (braço com
// mola, atraso de rotação, FOV que abre com a velocidade, órbita no olhar
// livre, nunca atravessa o chão).
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const clamp = THREE.MathUtils.clamp;

export class FlightCamera {
  constructor(ctx) {
    this.ctx = ctx;
    this.third = false;
    this.chaseQ = new THREE.Quaternion();
    this.chasePos = new THREE.Vector3();
    this.lag = new THREE.Vector3();
    this.headExtra = new THREE.Quaternion();
    this.look = { yaw: 0, pitch: 0 };   // cabeça (cockpit) acompanhando curvas
    this.fov = 72; this.baseFov = 72; this.chaseFov = 64;
    this.init = false;
    this.orbit = { yaw: 0, pitch: 0 };
  }
  reset() { this.init = false; }

  /**
   * shipPos/shipQ: pose de mundo interpolada. model: FlightModel. ctl: controles.
   * eye: posição do olho no referencial da nave.
   */
  frame(dt, { shipPos, shipQ, model, controls, eye, length, ground }) {
    const ctx = this.ctx, cam = ctx.camera;
    const av = model.angVel;
    // FOV: abre com boost/quântico/cruzeiro
    const qk = model.mode === 'quantum' ? 1 : model.mode === 'jump' ? 1 : model.cruise.on ? 0.5 : 0;
    const target = (this.third ? this.chaseFov : this.baseFov) + (model.boosting ? 5 : 0) + qk * 10 + Math.min(4, model.speed / 300) * (this.third ? 1 : 0.5);
    this.fov += (target - this.fov) * (1 - Math.exp(-dt * 2.5));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    if (!this.third) {
      // a cabeça olha um pouco para dentro da curva e balança com a força G
      const ty = clamp(av.y * 0.07, -0.12, 0.12), tp = clamp(av.x * 0.05 - (model.accelLocal.y / 9.81) * 0.004, -0.1, 0.1);
      this.look.yaw += (ty - this.look.yaw) * (1 - Math.exp(-dt * 3));
      this.look.pitch += (tp - this.look.pitch) * (1 - Math.exp(-dt * 3));
      const h = controls.head;
      _q.setFromEuler(_e.set(h.pitch + this.look.pitch, h.yaw - this.look.yaw, -clamp(av.z * 0.012, -0.04, 0.04), 'YXZ'));
      this.headExtra.copy(_q);
      ctx.player.camWorld.copy(eye).applyQuaternion(shipQ).add(shipPos);
      cam.quaternion.copy(shipQ).multiply(_q);
      this.init = false;
      return;
    }
    // ─── perseguição ───────────────────────────────────────────────────
    const L = Math.max(10, length);
    const dist = L * 1.4 + 5, height = L * 0.3 + 1.2;
    if (!this.init) { this.chaseQ.copy(shipQ); this.lag.set(0, 0, 0); this.init = true; }
    // rotação com atraso (a nave "gira dentro" do quadro)
    this.chaseQ.slerp(shipQ, 1 - Math.exp(-dt * 4.2)).normalize();
    // atraso linear: aceleração empurra a nave para longe / para perto
    const a = model.accelLocal;
    _v.set(clamp(-a.x * 0.012, -1.5, 1.5), clamp(-a.y * 0.01, -1.2, 1.2), clamp(a.z * 0.02, -2.5, 4));
    this.lag.lerp(_v, 1 - Math.exp(-dt * 3));
    // órbita com olhar livre
    const h = controls.head;
    this.orbit.yaw += (h.yaw - this.orbit.yaw) * (1 - Math.exp(-dt * 8));
    this.orbit.pitch += (h.pitch - this.orbit.pitch) * (1 - Math.exp(-dt * 8));
    _q2.setFromEuler(_e.set(this.orbit.pitch * 0.8, this.orbit.yaw, 0, 'YXZ'));
    const off = _v2.set(0, height, dist).applyQuaternion(_q2).add(this.lag).applyQuaternion(this.chaseQ);
    const camPos = ctx.player.camWorld.copy(shipPos).add(off);
    // não atravessa o chão
    if (ground) {
      const g = ground(camPos);
      if (g && g.height < 1.6) camPos.addScaledVector(g.up, 1.6 - g.height);
    }
    // olha para um ponto um pouco à frente da nave
    // olha um pouco à frente da nave; orbitando, o alvo volta para a própria nave
    const ahead = Math.max(0, Math.cos(this.orbit.yaw)) * Math.max(0, Math.cos(this.orbit.pitch * 1.5));
    const aim = _v.set(0, L * 0.12 * ahead, -L * 0.9 * ahead).applyQuaternion(shipQ).add(shipPos);
    const up = _v2.set(0, 1, 0).applyQuaternion(this.chaseQ);
    const m = new THREE.Matrix4().lookAt(camPos, aim, up);
    cam.quaternion.setFromRotationMatrix(m);
  }
}
