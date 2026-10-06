import * as THREE from 'three';

/**
 * Faíscas do slide em superfície dura (metal: muitas; concreto/asfalto: só
 * em alta velocidade, poucas — são os cravos/biqueira raspando). Pontos
 * aditivos com gravidade e esfriamento (branco-amarelado → laranja → some).
 * 1 draw call, orçamento escalado por `quality.particleBudget`.
 */
const MAX = 72;

/** Faíscas por segundo e por m/s, por material (0 = nenhuma). */
export const SPARK_RATE = { metal: 9, concrete: 0.9, asphalt: 0.7, brick: 0.5, glass: 1.2 };

function dotTexture() {
  const N = 32;
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
      const a = Math.max(0, 1 - r);
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(Math.pow(a, 1.8) * 255);
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export class Sparks {
  constructor(ctx) {
    this.ctx = ctx;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.n = 0;
    this.acc = 0;
    this.mat = new THREE.PointsMaterial({
      size: 0.05,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    ctx.scene.add(this.points);
    for (let i = 0; i < MAX; i++) this.life[i] = 0;
  }
  budget() {
    const b = this.ctx.quality?.particleBudget; // 0..1
    return b ? Math.max(0.3, Math.min(1, b)) : 1;
  }
  /** Emite ao longo do slide: `rate` faíscas/s, saindo para trás e para cima. */
  trail(dt, pos, dir, speed, material) {
    const r = SPARK_RATE[material] || 0;
    if (!r || speed < 3) return;
    const minSpeed = material === 'metal' ? 3 : 7;
    if (speed < minSpeed) return;
    this.acc += r * speed * dt * this.budget();
    while (this.acc >= 1) {
      this.acc -= 1;
      this.emit(pos, dir, speed);
    }
  }
  emit(pos, dir, speed) {
    // procura um slot livre (ou sobrescreve o mais velho em ciclo)
    let i = -1;
    for (let k = 0; k < MAX; k++) {
      const j = (this.n + k) % MAX;
      if (this.life[j] <= 0) {
        i = j;
        break;
      }
    }
    if (i < 0) i = this.n % MAX;
    this.n = (i + 1) % MAX;
    const R = Math.random;
    this.pos[i * 3] = pos.x + (R() - 0.5) * 0.08;
    this.pos[i * 3 + 1] = pos.y + 0.02;
    this.pos[i * 3 + 2] = pos.z + (R() - 0.5) * 0.08;
    // arrastadas pela bota: saem com parte da velocidade do jogador (no
    // referencial da câmera recuam devagar e ficam no quadro perto do pé)
    const back = (0.45 + R() * 0.4) * speed;
    const side = (R() - 0.5) * 2.6;
    this.vel[i * 3] = dir.x * back - dir.z * side;
    this.vel[i * 3 + 1] = 0.8 + R() * 2.2;
    this.vel[i * 3 + 2] = dir.z * back + dir.x * side;
    this.max[i] = this.life[i] = 0.18 + R() * 0.3;
  }
  /** Rajada (chute em metal, impacto do dive em superfície dura). */
  burst(pos, dir, count = 10, speed = 5) {
    for (let k = 0; k < count; k++) this.emit(pos, dir, speed);
  }
  update(dt) {
    if (dt <= 0) return;
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      live++;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      const drag = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // esfria: branco-amarelado → laranja → vermelho escuro
      const u = Math.max(0, this.life[i] / this.max[i]);
      const h = u * 3.2;
      this.col[i * 3] = Math.min(3, h + 0.4);
      this.col[i * 3 + 1] = Math.min(2.2, h * 0.75);
      this.col[i * 3 + 2] = Math.min(1, h * 0.25 * u);
    }
    this.points.visible = live > 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
  dispose() {
    this.ctx.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
