// Criaturas que seguem uma trajetória com o corpo inteiro (cada vértebra
// percorre o mesmo caminho): o verme gigante do deserto (emerge da areia num
// arco, abre a boca em pétalas e mergulha de volta levantando nuvens de
// areia) e os nadadores (circulam perto da costa e vêm à tona em arco).
import * as THREE from 'three/webgpu';
import { basisZY, clamp, smooth01 } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

class PathDriver {
  constructor(c, patch) {
    this.c = c; this.patch = patch;
    c.path = this;
    c.mesh.scale.setScalar(1); c.scale = 1;
    this.N = c.rig.spine.length;
    this.seg = c.rig.dims.L / this.N;
    this.joints = [];
    for (let i = 0; i <= this.N; i++) this.joints.push(new THREE.Vector3());
    this.tan = new THREE.Vector3();
    c.hitSegment = (p0, p1) => this.hit(p0, p1);
    c.center = (out = new THREE.Vector3()) => out.copy(this.joints[Math.floor(this.N * 0.7)]);
  }
  /** Posiciona os ossos ao longo dos pontos (cauda → cabeça). */
  pose(headUp = Y) {
    const c = this.c, J = this.joints, R = c.rig;
    c.mesh.position.set(0, 0, 0); c.mesh.quaternion.identity();
    c.bones[0].position.set(0, 0, 0); c.bones[0].quaternion.identity(); c.fk(0);
    const s0 = R.spine[0];
    c.bones[s0].position.copy(J[0]); c.bones[s0].quaternion.identity(); c.fk(s0);
    for (let i = 0; i < R.spine.length; i++) c.aim(R.spine[i], _a.copy(J[i + 1]).sub(J[i]));
    // cabeça: orientação explícita (tangente + cima)
    const h = R.head;
    c.fk(h);
    basisZY(this.tan, headUp, _q);
    _qi.copy(c.mq[c.rig.bones[h].parent]).invert();
    c.bones[h].quaternion.multiplyQuaternions(_qi, _q);
    c.fk(h);
  }
  hit(p0, p1) {
    const r = this.c.rig.dims.G * 1.1;
    let best = null;
    const d = _b.copy(p1).sub(p0); const L2 = d.lengthSq() || 1;
    for (let i = 0; i < this.joints.length; i += 2) {
      const j = this.joints[i];
      const s = clamp(_a.copy(j).sub(p0).dot(d) / L2, 0, 1);
      const px = p0.x + d.x * s - j.x, py = p0.y + d.y * s - j.y, pz = p0.z + d.z * s - j.z;
      if (px * px + py * py + pz * pz < r * r * 1.4 && (!best || s < best.t)) best = { t: s, part: i >= this.N - 1 ? 'head' : 'body' };
    }
    return best;
  }
  rebase(pt, dir) { for (const j of this.joints) pt(j); dir(this.tan); }
}

export class WormDriver extends PathDriver {
  constructor(c, patch, ctx) {
    super(c, patch);
    this.ctx = ctx;
    this.state = 'under';
    this.timer = 4 + Math.random() * 6;
    this.p0 = new THREE.Vector3(); this.dir = new THREE.Vector3(1, 0, 0);
    this.arcLen = c.rig.dims.L * 1.5; this.height = c.rig.dims.L * 0.34;
    this.s = 0; this.speed = c.sp.behavior.run;
    this.open = 0; this.dustT = 0; this.hurt = false;
    this.frozen = false;
    c.mesh.visible = false;
  }
  start(p0, dir, { arcLen, height, s, speed } = {}) {
    this.p0.copy(p0); this.dir.copy(dir).setY(0).normalize();
    if (arcLen) this.arcLen = arcLen;
    if (height) this.height = height;
    this.s = s ?? -this.seg * 2;
    if (speed) this.speed = speed;
    this.state = 'arc'; this.hurt = false;
    this.c.mesh.visible = true;
    this.c.pos.copy(p0);
  }
  /** Ponto do caminho a uma distância s da entrada. */
  point(s, out) {
    const P = this.patch, R = this.c.rig.dims.G;
    const x = this.p0.x + this.dir.x * s, z = this.p0.z + this.dir.z * s;
    const gy = P.groundY(x, z);
    const t = s / this.arcLen;
    let h;
    if (t < 0) h = t * this.arcLen * 0.6 - R;            // vem subindo de baixo
    else if (t > 1) h = -(t - 1) * this.arcLen * 0.6 - R; // mergulha
    else h = this.height * Math.sin(Math.PI * t) - R * (1 - Math.sin(Math.PI * t)) * 0.8;
    return out.set(x, gy + h, z);
  }
  step(dt, W) {
    const c = this.c;
    if (this.state === 'under') {
      this.timer -= dt;
      if (this.timer <= 0 && W.player && W.onFoot) {
        // emerge de lado para o jogador, a 45–85 m
        const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 40;
        const p0 = _a.set(W.player.x + Math.cos(a) * d, 0, W.player.z + Math.sin(a) * d);
        const toP = _b.set(W.player.x - p0.x, 0, W.player.z - p0.z).normalize();
        const dir = new THREE.Vector3(-toP.z, 0, toP.x);
        p0.addScaledVector(dir, -this.arcLen * 0.5);
        const g = this.patch.ground(p0.x, p0.z, {});
        if (!g.water) this.start(p0.clone(), dir);
        else this.timer = 3;
      }
      return;
    }
    if (!this.frozen) this.s += this.speed * dt;
    if (this.s - c.rig.dims.L > this.arcLen + this.seg * 2) { this.state = 'under'; this.timer = 18 + Math.random() * 25; c.mesh.visible = false; return; }
    // dano a quem estiver na boca do buraco
    if (!this.hurt && W.player && W.onFoot && this.s > 0 && this.s < this.seg * 3) {
      if (Math.hypot(W.player.x - this.p0.x, W.player.z - this.p0.z) < c.rig.dims.G * 3) { this.hurt = true; W.emit('player:damage', { amount: c.sp.damage, type: 'kinetic', source: 'life' }); }
    }
  }
  frame(dt, ctx) {
    const c = this.c;
    if (this.state === 'under') return;
    const J = this.joints, N = this.N;
    for (let i = 0; i <= N; i++) this.point(this.s - (N - i) * this.seg, J[i]);
    this.point(this.s + this.seg * 0.5, _b);
    this.tan.copy(_b).sub(J[N]).normalize();
    this.pose(Y);
    // boca abre perto do topo do arco
    const t = clamp(this.s / this.arcLen, 0, 1);
    const target = this.s > 0 && this.s < this.arcLen ? smooth01(Math.sin(Math.PI * t) * 1.6) : 0;
    this.open += (target - this.open) * (1 - Math.exp(-dt * 3));
    for (const P of c.rig.petals) {
      const ax = _a.set(-Math.sin(P.th), Math.cos(P.th), 0);
      c.bones[P.bone].quaternion.setFromAxisAngle(ax, this.open * 0.95 + Math.sin(ctx.time.now * 6 + P.th) * 0.05 * this.open);
    }
    c.pos.copy(J[N]);
    // areia nos pontos onde o corpo atravessa o chão
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.12;
      const rp = ctx.services.rendering?.particles;
      if (rp?.dust) {
        const L = c.rig.dims.L;
        const active0 = this.s > -this.seg && this.s - L < this.seg;
        const active1 = this.s > this.arcLen - this.seg && this.s - L < this.arcLen + this.seg;
        const R = c.rig.dims.G;
        for (const [on, s] of [[active0, 0], [active1, this.arcLen]]) {
          if (!on) continue;
          const p = this.point(s, _a); p.y = this.patch.groundY(p.x, p.z);
          const w = this.patch.patchToWorld(p, new THREE.Vector3());
          const up = this.patch.dirToWorld(Y, new THREE.Vector3());
          try { rp.dust(w, up, 10, { radius: R * 2.2, color: this.dustColor || [0.62, 0.44, 0.27] }); } catch { /* */ }
        }
      }
    }
  }
}

export class MarineDriver extends PathDriver {
  constructor(c, patch, center, radius) {
    super(c, patch);
    this.center = center.clone(); this.radius = radius;
    this.s = Math.random() * radius * 6;
    this.speed = c.sp.behavior.walk;
    this.depth = c.rig.dims.G * 1.6;
    this.breachAt = this.s + 20 + Math.random() * 40;
    this.breachW = c.rig.dims.L * 1.1;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.seaY = patch.ground(center.x, center.z, {}).seaY;
  }
  point(s, out) {
    const th = this.dir * s / this.radius;
    const x = this.center.x + Math.cos(th) * this.radius, z = this.center.z + Math.sin(th) * this.radius;
    const u = (s - this.breachAt) / this.breachW;
    const bump = Math.abs(u) < 1 ? Math.cos(u * Math.PI / 2) ** 2 : 0;
    const y = this.seaY - this.depth + (this.depth + this.c.rig.dims.G * 1.1) * bump;
    return out.set(x, y, z);
  }
  step(dt) {
    if (!this.frozen) this.s += this.speed * dt;
    if (this.s - this.c.rig.dims.L > this.breachAt + this.breachW) this.breachAt = this.s + 40 + Math.random() * 80;
  }
  frame() {
    const J = this.joints, N = this.N;
    for (let i = 0; i <= N; i++) this.point(this.s - (N - i) * this.seg, J[i]);
    this.point(this.s + this.seg * 0.5, _b);
    this.tan.copy(_b).sub(J[N]).normalize();
    this.pose(Y);
    this.c.pos.copy(J[N]);
  }
  rebase(pt, dir) { super.rebase(pt, dir); pt(this.center); }
}
