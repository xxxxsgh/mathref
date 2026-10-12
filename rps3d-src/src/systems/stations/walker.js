// Andar a pé de RESERVA dentro das estações: só age quando o sistema `foot`
// não existe (ou foi desligado por erro) e o jogador está a pé num interior
// ativo. Controlador simples em primeira pessoa no referencial da estação:
// gravidade artificial, colisão por esferas contra os colisores do interior,
// pulo, corrida, olhar com mouse/stick/toque.
import * as THREE from 'three/webgpu';
import { V3 } from './geo.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class FootFallback {
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;
    this.pos = new THREE.Vector3();   // convés (pés)
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.grounded = false;
    this.res = { pos: new THREE.Vector3(), hit: false, normal: new THREE.Vector3(), onGround: false };
  }

  start(it) {
    const ctx = this.ctx;
    this.on = true;
    it.toDeck(ctx.player.pos, this.pos);
    if (this.pos.y < -0.5 || this.pos.y > 30) this.pos.copy(it.toDeck(it.spawnWorld(), new THREE.Vector3()));
    // olhar inicial: direção atual da câmera no referencial da estação
    const qL = _q.copy(it.view.frame.quat).invert().multiply(ctx.camera.quaternion);
    _e.setFromQuaternion(qL, 'YXZ');
    this.yaw = _e.y; this.pitch = THREE.MathUtils.clamp(_e.x, -1.2, 1.2);
    this.vel.set(0, 0, 0);
  }

  update(dt, ctx, it) {
    const want = !ctx.services.foot && ctx.game.mode === 'foot' && it?.active;
    if (!want) { this.on = false; return; }
    if (!this.on) this.start(it);
    const inp = ctx.input;
    const look = inp.takeLook();
    this.yaw -= look.x; this.pitch = THREE.MathUtils.clamp(this.pitch - look.y, -1.35, 1.35);
    const mx = inp.axis('moveX'), my = inp.axis('moveY');
    const sprint = inp.down('boost');
    const sp = sprint ? 5.6 : 3.1;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // frente = −Z da câmera girada por yaw → (−sin, −cos)
    const wx = (-fx * my + fz * mx) * sp, wz = (-fz * my - fx * mx) * sp;
    const k = Math.min(1, dt * (this.grounded ? 12 : 2));
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    this.vel.y -= 9.0 * dt;
    if (this.grounded && inp.pressed('up')) { this.vel.y = 4.2; this.grounded = false; }
    this.pos.addScaledVector(this.vel, dt);
    // colisão: duas esferas (pés e peito) no mundo
    const up = it.up;
    this.grounded = false;
    for (const h of [0.4, 1.25]) {
      const wp = it.toWorld(_v.set(this.pos.x, this.pos.y + h, this.pos.z), new THREE.Vector3());
      ctx.collision.resolveSphere(wp, 0.38, up, this.res);
      if (this.res.hit) {
        const dl = it.toDeck(this.res.pos, _w);
        this.pos.set(dl.x, dl.y - h, dl.z);
        if (this.res.onGround) { this.grounded = true; if (this.vel.y < 0) this.vel.y = 0; }
      }
    }
    if (this.pos.y < -5) this.pos.copy(it.toDeck(it.spawnWorld(), new THREE.Vector3()));
    this.apply(ctx, it);
  }

  apply(ctx, it) {
    it.toWorld(this.pos, ctx.player.pos);
    it.toWorld(_v.set(this.pos.x, this.pos.y + 1.65, this.pos.z), ctx.player.camWorld);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    _q2.setFromEuler(_e);
    ctx.camera.quaternion.copy(it.view.frame.quat).multiply(_q2);
    ctx.player.vel.set(0, 0, 0);
  }

  frame(dt, ctx, it) {
    if (this.on && it) this.apply(ctx, it);
    void V3;
  }
}
