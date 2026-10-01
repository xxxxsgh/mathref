/**
 * Corpos rígidos baratos (cápsulas de munição, detritos): InstancedMesh +
 * física simples na CPU no passo fixo — gravidade, arrasto, giro, quique no
 * chão com restituição/atrito e "deitar" ao parar. O chão vem de
 * collision.groundHeight, reconsultado a cada poucos passos por corpo.
 */
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export class RigidPool {
  /**
   * geometry/material: malha base (eixo longo = +Y para "deitar").
   * opts: { capacity, collision, restitution, friction, lieDown, onBounce }
   */
  constructor(geometry, material, { capacity = 64, collision, restitution = 0.35, friction = 0.55, lieDown = true, onBounce = null, name = 'vfx-rigid', castShadow = true, useColor = false }) {
    this.capacity = capacity;
    this.collision = collision;
    this.restitution = restitution;
    this.friction = friction;
    this.lieDown = lieDown;
    this.onBounce = onBounce;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    if (useColor) {
      for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
    }
    this.bodies = Array.from({ length: capacity }, () => ({
      alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(),
      spin: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), life: 0, age: 0, ground: -1e9,
      groundTimer: 0, bounces: 0, resting: false, halfH: 0.01, drag: 0.05, lieAxis: new THREE.Vector3(),
    }));
    this.head = 0;
    this.active = 0;
  }

  spawn(pos, vel, { spin = null, scale = 1, life = 5, color = null, drag = 0.05, halfH = 0.01, quat = null }) {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    const b = this.bodies[i];
    b.alive = true;
    b.pos.copy(pos);
    b.vel.copy(vel);
    if (quat) b.quat.copy(quat);
    else b.quat.setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
    if (spin) b.spin.copy(spin);
    else b.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    if (typeof scale === 'number') b.scale.setScalar(scale);
    else b.scale.copy(scale);
    b.life = life;
    b.age = 0;
    b.drag = drag;
    b.halfH = halfH;
    b.bounces = 0;
    b.resting = false;
    b.groundTimer = 0;
    b.ground = this.groundAt(pos);
    b.lieAxis.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    if (color) {
      this.mesh.setColorAt(i, color.isColor ? color : _c.set(color));
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    return b;
  }

  groundAt(p) {
    const g = this.collision?.groundHeight(p.x, p.z, p.y + 0.05, 60);
    return g ?? -1e9;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.mesh.count; i++) {
      const b = this.bodies[i];
      if (!b.alive) continue;
      any = true;
      b.age += dt;
      if (b.age >= b.life) {
        b.alive = false;
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      if (!b.resting) {
        b.vel.y -= 9.8 * dt;
        b.vel.multiplyScalar(Math.max(0, 1 - b.drag * dt));
        b.pos.addScaledVector(b.vel, dt);
        const w = b.spin.length();
        if (w > 1e-4) {
          _q.setFromAxisAngle(_v.copy(b.spin).divideScalar(w), w * dt);
          b.quat.premultiply(_q);
        }
        if ((b.groundTimer -= dt) <= 0) {
          b.groundTimer = 0.1;
          b.ground = this.groundAt(b.pos);
        }
        const floor = b.ground + b.halfH;
        if (b.pos.y < floor && b.vel.y < 0) {
          b.pos.y = floor;
          const impact = -b.vel.y;
          b.vel.y = impact * this.restitution;
          b.vel.x *= this.friction;
          b.vel.z *= this.friction;
          b.spin.multiplyScalar(0.5).add(_v.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8).multiplyScalar(Math.min(1, impact * 0.3)));
          b.bounces++;
          if (impact > 0.6) this.onBounce?.(b, impact);
          if (impact < 0.8 || b.bounces > 4) {
            b.resting = true;
            b.vel.set(0, 0, 0);
            if (this.lieDown) {
              // deita: eixo longo (+Y local) na horizontal, giro aleatório
              _q.setFromUnitVectors(_up, b.lieAxis);
              b.quat.copy(_q);
            }
          }
        }
      }
      // encolhe no fim da vida
      const k = Math.min(1, (b.life - b.age) / 0.4);
      _s.copy(b.scale).multiplyScalar(k);
      _m.compose(b.pos, b.quat, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Cápsula deflagrada (5.56 garrafinha) por torno; eixo +Y, origem no centro. */
export function brassGeometry() {
  const pts = [
    [0.0, -0.0225], [0.0047, -0.0225], [0.0048, -0.0215], [0.0042, -0.0205], [0.0047, -0.0195],
    [0.0047, 0.009], [0.0043, 0.0125], [0.0033, 0.0145], [0.0032, 0.0225], [0.0027, 0.0225], [0.0027, 0.015],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 12);
  g.computeVertexNormals();
  return g;
}

/** Pedra/lasca irregular de faces planas (raio ~0.5). */
export function chunkGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed();
  const p = g.getAttribute('position');
  // desloca vértices coincidentes do mesmo jeito (hash da posição) → sólido fechado
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const f = 0.7 + 0.45 * (h - Math.floor(h));
    p.setXYZ(i, x * f, y * f * 0.75, z * f);
  }
  g.computeVertexNormals();
  return g;
}
