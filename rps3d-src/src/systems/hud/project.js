// Projeção mundo → tela para a HUD (origem flutuante: tudo relativo a
// player.camWorld). Atualizada uma vez por frame em `begin()`.
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3();

export class Projector {
  constructor(ctx) {
    this.ctx = ctx;
    this.qInv = new THREE.Quaternion();
    this.q = new THREE.Quaternion();
    this.W = 1; this.H = 1; this.tx = 1; this.ty = 1;
    this.cam = new THREE.Vector3();
  }
  begin(W, H) {
    const c = this.ctx.camera;
    c.updateMatrixWorld();
    c.getWorldQuaternion(this.q);
    this.qInv.copy(this.q).invert();
    this.W = W; this.H = H;
    const t = Math.tan((c.fov * Math.PI / 180) / 2);
    this.ty = t; this.tx = t * (W / H);
    this.cam.copy(this.ctx.player.camWorld);
  }
  /** Direção de mundo → vista (câmera olha para −Z). */
  toView(world, out) { return out.copy(world).sub(this.cam).applyQuaternion(this.qInv); }
  dirToView(dir, out) { return out.copy(dir).applyQuaternion(this.qInv); }
  /**
   * Ponto de MUNDO → {x, y, on, behind, dist, ang} na tela (px).
   * `margin` (px) define a borda onde os indicadores fora de tela encostam.
   */
  project(world, out = {}, margin = 60) {
    this.toView(world, _v);
    out.dist = _v.length();
    return this.fromView(_v, out, margin);
  }
  projectDir(dir, out = {}, margin = 60) {
    this.dirToView(dir, _v);
    out.dist = Infinity;
    return this.fromView(_v, out, margin);
  }
  fromView(v, out, margin) {
    const W = this.W, H = this.H;
    const behind = v.z >= -1e-6;
    let nx, ny;
    if (!behind) { nx = (v.x / -v.z) / this.tx; ny = (v.y / -v.z) / this.ty; }
    else { nx = v.x; ny = v.y; }
    out.behind = behind;
    const x = (nx * 0.5 + 0.5) * W, y = (-ny * 0.5 + 0.5) * H;
    out.on = !behind && x >= margin * 0.5 && x <= W - margin * 0.5 && y >= margin * 0.5 && y <= H - margin * 0.5;
    out.ang = Math.atan2(-(behind ? v.y : ny), behind ? v.x : nx); // ângulo de tela (y para baixo)
    out.x = x; out.y = y;
    // ponto preso na borda (elipse inscrita, fica natural em telas largas)
    if (!out.on) {
      const ax = W / 2 - margin, ay = H / 2 - margin;
      const ca = Math.cos(out.ang), sa = Math.sin(out.ang);
      const k = 1 / Math.sqrt((ca * ca) / (ax * ax) + (sa * sa) / (ay * ay));
      out.ex = W / 2 + ca * k; out.ey = H / 2 + sa * k;
    } else { out.ex = x; out.ey = y; }
    // tamanho angular → px por metro a essa distância
    out.ppm = !behind ? (H / 2) / (this.ty * Math.max(1e-6, -v.z)) : 0;
    out.vz = v.z;
    return out;
  }
}
