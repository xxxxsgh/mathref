// Rastros de vapor nas pontas das asas (vórtices de ponta de asa) quando a
// nave puxa G no ar denso, e esteiras finas de condensação em altitude.
// Fitas de N pontos guardados em double (mundo); a malha é reescrita
// relativa à câmera a cada frame (origem flutuante).
import * as THREE from 'three/webgpu';
import { Fn, attribute, vec3, float, smoothstep, pow, abs, mix, uniform, uv } from 'three/tsl';

const N = 72;

class Ribbon {
  constructor(mat) {
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.side = Array.from({ length: N }, () => new THREE.Vector3());
    this.age = new Float32Array(N).fill(1e9);
    this.str = new Float32Array(N);
    this.head = 0; this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.aux = new Float32Array(N * 2 * 2); // (s ao longo, intensidade)
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aux', new THREE.BufferAttribute(this.aux, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2 * 2).map((_, i) => (i % 2 === 0 ? ((i / 2) % 2) : 0)), 2));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }
  push(p, side, s) {
    this.head = (this.head + 1) % N;
    this.pts[this.head].copy(p); this.side[this.head].copy(side);
    this.age[this.head] = 0; this.str[this.head] = s;
    this.count = Math.min(N, this.count + 1);
  }
  last() { return this.pts[this.head]; }
  update(dt, origin, life, width) {
    let alive = 0;
    for (let k = 0; k < N; k++) {
      const i = (this.head - k + N) % N;
      const a = this.age[i];
      const o = k * 6, ox = k * 4;
      if (k >= this.count || a > life) {
        // colapsa no último ponto válido (triângulos degenerados)
        const j = (this.head - Math.max(0, alive - 1) + N) % N;
        const p = this.pts[j];
        this.pos[o] = this.pos[o + 3] = p.x - origin.x; this.pos[o + 1] = this.pos[o + 4] = p.y - origin.y; this.pos[o + 2] = this.pos[o + 5] = p.z - origin.z;
        this.aux[ox] = this.aux[ox + 2] = 1; this.aux[ox + 1] = this.aux[ox + 3] = 0;
        continue;
      }
      alive++;
      const p = this.pts[i], sd = this.side[i];
      const w = width * (0.35 + Math.min(1, a / life) * 2.2);
      this.pos[o] = p.x - origin.x + sd.x * w; this.pos[o + 1] = p.y - origin.y + sd.y * w; this.pos[o + 2] = p.z - origin.z + sd.z * w;
      this.pos[o + 3] = p.x - origin.x - sd.x * w; this.pos[o + 4] = p.y - origin.y - sd.y * w; this.pos[o + 5] = p.z - origin.z - sd.z * w;
      const f = a / life;
      this.aux[ox] = this.aux[ox + 2] = f;
      this.aux[ox + 1] = this.aux[ox + 3] = this.str[i];
    }
    for (let i = 0; i < N; i++) this.age[i] += dt;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aux.needsUpdate = true;
    this.mesh.visible = alive > 1;
  }
}

export class WingTrails {
  constructor(ctx) {
    this.ctx = ctx;
    this.U = { light: uniform(new THREE.Color(1, 1, 1)) };
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.fog = false;
    const aux = attribute('aux', 'vec2');
    mat.colorNode = this.U.light;
    mat.opacityNode = Fn(() => {
      const f = aux.x, s = aux.y;
      const across = abs(uv().x.sub(0.5)).mul(2.0);
      const edge = pow(float(1.0).sub(across), 1.5);
      const fade = smoothstep(1.0, 0.0, f).mul(smoothstep(0.0, 0.04, f).mul(0.7).add(0.3));
      return edge.mul(fade).mul(s).mul(0.55);
    })();
    this.mat = mat;
    this.ribbons = [new Ribbon(mat), new Ribbon(mat)];
    this.group = new THREE.Group();
    for (const r of this.ribbons) this.group.add(r.mesh);
    ctx.scene.add(this.group);
    this.strength = 0;
    this.tips = [new THREE.Vector3(-6, 0, 2), new THREE.Vector3(6, 0, 2)];
  }
  setShip(radius) { this.tips[0].set(-radius * 0.62, -radius * 0.02, radius * 0.25); this.tips[1].set(radius * 0.62, -radius * 0.02, radius * 0.25); }

  /** s: { pos, quat (mundo), velW, density, gforce, speed, exterior, sunColor } */
  frame(dt, s) {
    const ctx = this.ctx;
    // condensação: G alto no ar denso, ou esteira fina em altitude com velocidade
    const pull = THREE.MathUtils.clamp((Math.abs(s.gforce - 1) - 1.2) / 3, 0, 1);
    const dens = THREE.MathUtils.clamp(s.density * 3, 0, 1);
    const target = s.exterior && s.speed > 60 ? Math.max(pull * dens, s.contrail || 0) : 0;
    this.strength += (target - this.strength) * (1 - Math.exp(-dt * 5));
    const origin = ctx.world.origin;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.quat);
    const life = 1.6;
    const width = 0.35 + s.speed * 0.0012;
    for (let k = 0; k < 2; k++) {
      const r = this.ribbons[k];
      const p = this.tips[k].clone().applyQuaternion(s.quat).add(s.pos);
      if (this.strength > 0.01 || r.count) {
        const lastP = r.last();
        if (r.count === 0 || lastP.distanceTo(p) > Math.max(1.5, s.speed * 0.012)) r.push(p, up, this.strength);
        else { lastP.copy(p); r.str[r.head] = this.strength; }
      }
      r.update(dt, origin, life, width);
      if (this.strength < 0.01 && r.mesh.visible === false) r.count = 0;
    }
    if (s.sunColor) this.U.light.value.copy(s.sunColor).multiplyScalar(0.9).addScalar(0.08);
    void right;
  }
  dispose() { this.group.removeFromParent(); for (const r of this.ribbons) r.geo.dispose(); this.mat.dispose(); }
}
