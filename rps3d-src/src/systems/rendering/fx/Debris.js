// Destroços de explosão: placas de casco retorcidas, longarinas e pedaços de
// rocha (explosões no chão). InstancedMesh com integração na CPU (só peças
// ativas; até ~2k), material PBR com bordas incandescentes que esfriam
// (corpo negro por instância) e rastro de fumaça/brasas das peças quentes.
import * as THREE from 'three/webgpu';
import { Fn, attribute, vec3, float, mix, smoothstep, pow, positionLocal, normalLocal, abs, fract, max, uniform } from 'three/tsl';
import { blackbody, vnoise3, hash13 } from '../tslib.js';
import { Rng } from '../../../core/Rng.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();

/** Placa de casco irregular (polígono extrudado e torcido). */
function plateGeometry(r) {
  const shape = new THREE.Shape();
  const n = r.int(5, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.25, 0.25);
    const rad = r.range(0.45, 1.0);
    const x = Math.cos(a) * rad * r.range(0.8, 1.5), y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: r.range(0.06, 0.14), bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1, steps: 1 });
  g.center();
  // torção/amassado
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) + Math.sin(x * 2.1 + y) * 0.12 + x * x * 0.08);
  }
  g.computeVertexNormals();
  return g;
}
/** Longarina (viga em I curta e partida). */
function strutGeometry(r) {
  const g = new THREE.BoxGeometry(0.16, 0.16, r.range(1.4, 2.4), 1, 1, 4);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setX(i, pos.getX(i) + Math.sin(z * 1.7) * 0.12);
    if (z > 0.6) pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.15);
  }
  g.computeVertexNormals();
  return g;
}
/** Pedaço de rocha. */
function rockGeometry(r) {
  const g = new THREE.IcosahedronGeometry(0.6, 1);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const k = 0.75 + 0.45 * Math.abs(Math.sin(_p.x * 4.1 + r.range(0, 6)) * Math.cos(_p.y * 3.3 + _p.z * 2.7));
    _p.multiplyScalar(k);
    pos.setXYZ(i, _p.x, _p.y * 0.8, _p.z);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

class DebrisBatch {
  constructor(geo, cap, mat) {
    this.cap = cap;
    this.heat = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.heat.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('dheat', this.heat);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
  }
}

export class DebrisSystem {
  constructor(ctx, fx, particles, anchors) {
    this.ctx = ctx; this.particles = particles; this.anchors = anchors;
    const r = new Rng(9001);
    const cap = fx.debrisCap;
    this.group = new THREE.Group();
    this.group.name = 'rps.debris';
    const metal = this.material(false);
    const rock = this.material(true);
    this.batches = {
      plate: new DebrisBatch(plateGeometry(r), Math.ceil(cap * 0.5), metal),
      strut: new DebrisBatch(strutGeometry(r), Math.ceil(cap * 0.2), metal),
      rock: new DebrisBatch(rockGeometry(r), Math.ceil(cap * 0.3), rock),
    };
    for (const b of Object.values(this.batches)) this.group.add(b.mesh);
    ctx.scene.add(this.group);
    this.trailTimer = 0;
  }

  material(isRock) {
    const heat = attribute('dheat', 'float');
    const m = new THREE.MeshStandardNodeMaterial();
    const p = positionLocal.mul(3.0);
    const n = vnoise3(p).mul(0.6).add(vnoise3(p.mul(3.1)).mul(0.4));
    if (isRock) {
      m.colorNode = mix(vec3(0.16, 0.12, 0.09), vec3(0.36, 0.3, 0.24), n);
      m.roughnessNode = float(0.92);
      m.metalnessNode = float(0.0);
    } else {
      // painel metálico chamuscado: base clara com fuligem, linhas de painel
      const panel = smoothstep(0.92, 0.97, fract(positionLocal.x.mul(2.2)).max(fract(positionLocal.y.mul(2.2))));
      const soot = smoothstep(0.35, 0.75, n);
      const base = mix(vec3(0.55, 0.56, 0.58), vec3(0.05, 0.045, 0.04), soot);
      m.colorNode = base.mul(float(1).sub(panel.mul(0.5)));
      m.roughnessNode = mix(float(0.35), float(0.85), soot);
      m.metalnessNode = mix(float(0.85), float(0.2), soot);
    }
    // bordas e fendas incandescentes que esfriam
    const crack = smoothstep(0.62, 0.78, n);
    m.emissiveNode = blackbody(heat.mul(0.85)).mul(pow(heat, 2.5).mul(crack.add(heat.mul(0.04))).mul(9));
    return m;
  }

  /** Lança n peças de um ponto (âncora + offset). */
  burst(anchorIdx, n, { size = 1, speed = 40, kind = 'metal', vel = null, hot = 1, spread = 1 }) {
    const P = this.particles;
    for (let i = 0; i < n; i++) {
      const type = kind === 'rock' ? 'rock' : Math.random() < 0.72 ? 'plate' : 'strut';
      const b = this.batches[type];
      if (b.items.length >= b.cap) b.items.shift();
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize();
      const sp = speed * (0.25 + Math.random() * 0.9) * spread;
      const v = dir.multiplyScalar(sp);
      if (vel) v.add(vel);
      b.items.push({
        anchor: anchorIdx,
        off: dir.clone().normalize().multiplyScalar(size * 0.2 * Math.random()),
        vel: v,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6 + Math.random() * 6),
        scale: size * (0.08 + Math.random() ** 2 * 0.35),
        heat: hot * (0.6 + Math.random() * 0.4),
        age: 0, life: 6 + Math.random() * 8,
        trail: hot > 0.3 && Math.random() < 0.35,
        world: this.anchors.world[anchorIdx].clone(),
        gScale: type === 'rock' ? 1 : 0,
      });
    }
  }

  update(dt, ctx) {
    const g = this.particles.u.gravity.value;
    this.trailTimer += dt;
    const doTrail = this.trailTimer > 0.05;
    if (doTrail) this.trailTimer = 0;
    const origin = ctx.world.origin;
    for (const b of Object.values(this.batches)) {
      const items = b.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        if (it.age > it.life) { items.splice(i, 1); continue; }
        it.vel.addScaledVector(g, dt * it.gScale);
        it.vel.multiplyScalar(Math.exp(-dt * (g.lengthSq() > 0 ? 0.3 : 0.02)));
        it.off.addScaledVector(it.vel, dt);
        _q.setFromAxisAngle(_w.copy(it.w).normalize(), it.w.length() * dt);
        it.q.premultiply(_q);
        it.heat *= Math.exp(-dt * 0.9);
        if (doTrail && it.trail && it.heat > 0.12) {
          const a = it.anchor;
          const o = it.off;
          this.particles.layers.smoke.emit(1, a, (k, e) => {
            e.x = o.x; e.y = o.y; e.z = o.z; e.vx = it.vel.x * 0.1; e.vy = it.vel.y * 0.1; e.vz = it.vel.z * 0.1;
            e.life = 2.5 + Math.random() * 2; e.s0 = it.scale * 1.5; e.s1 = it.scale * 7; e.drag = 0.6; e.g = -0.05;
            e.a = 0.08; e.b = 0.075; e.c = 0.07; e.w = it.heat * 0.9; e.spin = (Math.random() - 0.5) * 0.6;
          });
        }
      }
      // matrizes (espaço de render)
      const n = Math.min(items.length, b.cap);
      for (let i = 0; i < n; i++) {
        const it = items[i];
        _p.copy(this.anchors.local[it.anchor]).add(it.off);
        const fade = Math.min(1, (it.life - it.age) / 1.5);
        _s.setScalar(it.scale * Math.max(0.001, fade));
        _m.compose(_p, it.q, _s);
        b.mesh.setMatrixAt(i, _m);
        b.heat.array[i] = it.heat;
      }
      b.mesh.count = n;
      if (n) { b.mesh.instanceMatrix.needsUpdate = true; b.heat.needsUpdate = true; }
    }
  }

  /** Mantém as âncoras usadas por destroços vivas. */
  keepAlive(now) {
    for (const b of Object.values(this.batches)) for (const it of b.items) this.anchors.extend(it.anchor, now + 1);
  }
}
