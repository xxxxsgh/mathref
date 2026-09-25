// Câmera: jogo (3 modos), cinemática de abertura, replay lateral, menu orbital.
import * as THREE from 'three';
import { TY, L, clamp, damp, lerp, smoothstep } from './const.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 2.6, 5.5);
    this.look = new THREE.Vector3(0, TY, 0);
    this.P = new THREE.Vector3(); this.T = new THREE.Vector3();
    this.shakeAmt = 0;
    this.introT = 0;
    this.rt = 0;
    this.side = 1;
    this.fov = 48;
    this.cut = false;
  }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  intro() { this.introT = 0; this.cut = true; }
  replayStart() { this.rt = 0; this.side = Math.random() < 0.5 ? -1 : 1; this.cut = true; }

  update(dt, g) {
    const cam = this.cam, P = this.P, T = this.T;
    const portrait = cam.aspect < 0.9;
    let fov = 48, rate = 5, lrate = 7;
    const st = g.settings;
    if (g.mode === 'menu') {
      const a = g.t * 0.07 + 0.6;
      P.set(Math.sin(a) * 5.4, 2.4 + Math.sin(g.t * 0.2) * 0.25, Math.cos(a) * 5.4);
      T.set(0, TY + 0.15, 0);
      fov = portrait ? 66 : 44; rate = 2; lrate = 2;
    } else if (g.phase === 'intro') {
      this.introT += dt;
      const k = this.introT;
      const cb = g.cChar.pos, pb = g.pChar.pos;
      if (k < 1.5) {
        const u = k / 1.5;
        P.set(cb.x + lerp(1.4, 0.9, u), 1.65, cb.z + lerp(1.5, 1.2, u));
        T.set(cb.x, 1.45, cb.z);
        fov = portrait ? 60 : 38;
        if (this.cut) { this.pos.copy(P); this.look.copy(T); this.cut = false; }
        rate = 8; lrate = 10;
      } else {
        const u = smoothstep(1.5, 3.2, k);
        P.set(lerp(3.2, 0.3, u), lerp(2.2, 2.2, u), lerp(-0.5, L + 2.8, u));
        T.set(0, TY, lerp(0, -0.9, u));
        fov = portrait ? 64 : 48;
        if (k - dt < 1.5) { this.pos.copy(P); this.look.copy(T); }
        rate = 20; lrate = 20;
      }
    } else if (g.phase === 'replay') {
      this.rt += dt;
      const b = g.ball;
      P.set(this.side * 3.4, 1.85 + Math.sin(this.rt * 0.4) * 0.08, clamp(b.z * 0.4, -1.1, 1.1) + this.side * 0.3);
      T.set(b.x * 0.3, clamp(b.y * 0.5 + TY * 0.5, TY, TY + 0.4), clamp(b.z * 0.7, -1.6, 1.6));
      fov = portrait ? 66 : 42;
      if (this.cut) { this.pos.copy(P); this.look.copy(T); this.cut = false; }
      rate = 3; lrate = 5;
    } else {
      const px = g.player.pad.x;
      const mode = st.camera;
      if (mode === 'tv') { P.set(0, 3.7, L + 4.4); T.set(0, TY - 0.15, -0.15); fov = 40; }
      else if (mode === 'baixa') { P.set(px * 0.35 + 0.45, 1.95, L + 2.5); T.set(px * 0.12, TY - 0.05, -0.8); fov = 50; }
      else { P.set(px * 0.22 + 0.25, 2.7, L + 3.5); T.set(px * 0.08, TY - 0.25, -0.65); fov = 45; }
      if (portrait) { P.y += 0.55; P.z += 1.5; fov += 18; T.z += 0.35; }
      // ponto final: câmera aproxima
      if (g.slow > 0) { rate = 1.5; }
    }
    if (this.fov !== fov) { this.fov = damp(this.fov, fov, 4, dt); if (Math.abs(this.fov - fov) < 0.05) this.fov = fov; cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.pos.x = damp(this.pos.x, P.x, rate, dt); this.pos.y = damp(this.pos.y, P.y, rate, dt); this.pos.z = damp(this.pos.z, P.z, rate, dt);
    this.look.x = damp(this.look.x, T.x, lrate, dt); this.look.y = damp(this.look.y, T.y, lrate, dt); this.look.z = damp(this.look.z, T.z, lrate, dt);
    cam.position.copy(this.pos);
    if (this.shakeAmt > 0 && st.shake) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 0.35);
    cam.lookAt(this.look);
  }
}
