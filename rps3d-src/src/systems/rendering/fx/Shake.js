// Tremor de câmera por "trauma" (Squirrel Eiserloh): o trauma acumula com
// eventos e decai; o deslocamento angular é trauma² × ruído suave em 3 eixos.
// Aplicado só durante o render (o dono da câmera nunca vê a rotação extra).
import * as THREE from 'three/webgpu';

const _e = new THREE.Euler(), _q = new THREE.Quaternion();

function smoothNoise(t, seed) {
  // soma de senos incomensuráveis: barato e sem padrão visível
  return Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 5.17 + seed * 3.1) * 0.2;
}

export class CameraShake {
  constructor() {
    this.trauma = 0; this.hold = 0; this.t = 0;
    this.maxAngle = 0.045; // rad
    this.continuous = 0;   // tremor contínuo (reentrada, boost) 0..1
  }
  add(amount, duration = 0.5) {
    this.trauma = Math.min(1, this.trauma + amount);
    this.hold = Math.max(this.hold, duration * 0.4);
  }
  update(dt) {
    this.t += dt;
    if (this.hold > 0) this.hold -= dt;
    else this.trauma = Math.max(0, this.trauma - dt * 1.1);
  }
  apply(camera) {
    const k = Math.max(this.trauma * this.trauma, this.continuous * 0.25);
    if (k < 1e-4) return;
    const f = 18;
    _e.set(
      smoothNoise(this.t * f, 1.3) * this.maxAngle * k,
      smoothNoise(this.t * f, 7.1) * this.maxAngle * k,
      smoothNoise(this.t * f * 0.8, 4.2) * this.maxAngle * k * 0.6,
    );
    _q.setFromEuler(_e);
    camera.quaternion.multiply(_q);
    camera.updateMatrixWorld();
  }
}
