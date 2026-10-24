// Câmeras: transmissão de TV (lateral elevada), atrás do jogador, zoom
// automático perto do gol e os 3 ângulos do replay.
import * as THREE from 'three';
import { COURT } from './physics.js';
import { clamp, lerp } from './util.js';

const { HL, HW } = COURT;

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'tv';
    this.pos = new THREE.Vector3(0, 14, 24);
    this.look = new THREE.Vector3(0, 0, 0);
    this.fov = 30;
    this.shakeT = 0;
    this.yaw = 0;
  }

  // Direção do direcional na tela → mundo.
  inputBasis() {
    const f = new THREE.Vector3();
    this.cam.getWorldDirection(f);
    f.y = 0; f.normalize();
    // direita = frente × cima
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  }

  shake(s = 0.3) { this.shakeT = Math.max(this.shakeT, s); }

  snap() { this.snapNext = true; }

  update(dt, match, focusIdx) {
    const b = match.ball;
    const k = this.snapNext ? 1 : 1 - Math.exp(-dt * 3.2);
    this.snapNext = false;
    let tp, tl, fov;
    const nearGoal = Math.abs(b.x) > HL - 7 && Math.abs(b.z) < 7;
    const focus = focusIdx >= 0 ? match.players[focusIdx] : null;

    if (match.state === 'shootoutWait' || (match.state === 'restart' && match.restart?.shootout)) {
      // pênaltis: atrás do cobrador
      tp = new THREE.Vector3(HL - 15.5, 4.6, 3.2);
      tl = new THREE.Vector3(HL - 1, 0.6, 0);
      fov = 32;
    } else if (this.mode === 'behind' && focus) {
      const dir = match.teams[focus.team].dir;
      tp = new THREE.Vector3(focus.x - dir * 9, 5.5, focus.z * 0.7);
      tl = new THREE.Vector3(focus.x + dir * 6, 0.5, focus.z * 0.85 + b.z * 0.15);
      fov = 46;
    } else {
      // transmissão: segue a bola no comprimento, com a câmera do lado +z
      const cx = clamp(b.x * 0.9, -HL + 7, HL - 7);
      const zoom = nearGoal ? 0.82 : 1;
      tp = new THREE.Vector3(cx, 15.5 * zoom, 25 * zoom + b.z * 0.25);
      tl = new THREE.Vector3(cx + (nearGoal ? Math.sign(b.x) * 1.2 : 0), 0, b.z * 0.35 - 0.8);
      fov = nearGoal ? 27 : 31;
    }
    this.pos.lerp(tp, k);
    this.look.lerp(tl, k);
    this.fov = lerp(this.fov, fov, k);
    this.apply(dt);
  }

  apply(dt) {
    this.cam.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeT * 0.4;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
    }
    this.cam.lookAt(this.look);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }

  // Ângulos do replay: 0 lateral, 1 atrás do gol, 2 aproximada.
  replayView(angle, frame, side, scorerIdx) {
    const b = frame.b;
    let p, l, fov;
    if (angle === 0) {
      p = new THREE.Vector3(clamp(b.x * 0.85, -HL + 6, HL - 6), 9, 17);
      l = new THREE.Vector3(b.x, 0.5, b.z * 0.5);
      fov = 30;
    } else if (angle === 1) {
      p = new THREE.Vector3(side * (HL + 7), 3.4, 0);
      l = new THREE.Vector3(b.x, 0.6, b.z);
      fov = 40;
    } else {
      const s = scorerIdx >= 0 ? frame.p[scorerIdx] : null;
      const fx = s ? (s.x + b.x) / 2 : b.x, fz = s ? (s.z + b.z) / 2 : b.z;
      p = new THREE.Vector3(fx - side * 3.5, 1.8, fz + 4.5);
      l = new THREE.Vector3(fx, 0.8, fz);
      fov = 42;
    }
    const k = this.replaySnap ? 1 : 0.15;
    this.replaySnap = false;
    this.pos.lerp(p, k); this.look.lerp(l, k); this.fov = lerp(this.fov, fov, k);
    this.apply(0);
  }
}

// Controla a reprodução do replay a partir do buffer gravado pela partida.
export class ReplayPlayer {
  constructor(match, side) {
    this.frames = match.replayBuf.slice(-200);
    this.side = side;
    this.angle = 0;
    this.t = 0;
    this.done = false;
    // quem marcou: último jogador próximo da bola antes do gol
    this.scorer = -1;
    const last = match.ball.lastTouch;
    if (last) this.scorer = last.i;
    this.speeds = [1, 1, 0.4];
    this.startFrac = [0.35, 0.55, 0.55];
  }

  update(dt) {
    const n = this.frames.length;
    const start = Math.floor(n * this.startFrac[this.angle]);
    this.t += dt * 30 * this.speeds[this.angle];
    const idx = start + Math.floor(this.t);
    if (idx >= n - 1) {
      this.angle++;
      this.t = 0;
      this.newAngle = true;
      if (this.angle > 2) { this.done = true; return this.frames[n - 1]; }
    }
    const i = Math.min(n - 1, start + Math.floor(this.t));
    const a = this.frames[i], c = this.frames[Math.min(n - 1, i + 1)];
    const f = this.t - Math.floor(this.t);
    // interpolação suave entre quadros (importante na câmera lenta)
    return {
      p: a.p.map((pa, j) => {
        const pc = c.p[j];
        return { ...pa, x: pa.x + (pc.x - pa.x) * f, z: pa.z + (pc.z - pa.z) * f, animT: pa.animT + (pc.animT - pa.animT) * f };
      }),
      b: { x: a.b.x + (c.b.x - a.b.x) * f, y: a.b.y + (c.b.y - a.b.y) * f, z: a.b.z + (c.b.z - a.b.z) * f, trail: a.b.trail },
    };
  }
}
