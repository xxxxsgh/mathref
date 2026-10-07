// Mundo de colisão leve, em coordenadas de MUNDO (double).
//
// - Caixas/esferas estáticas presas a um "referencial" ({pos, quat} mutável
//   pelo dono: estação girando, interior de nave em movimento, superfície de
//   planeta girando). Formas são definidas no espaço local do referencial.
// - "Chão" procedural via provedores: fn(worldPos, out) → out preenchido com
//   { height (m acima do chão, negativo = enterrado), normal (mundo), material } ou null.
//
// Usado pelo FPS (andar), voo (pouso/colisão), combate (raycast de projéteis
// contra cenário). Naves/criaturas têm colisão própria nos seus sistemas.
import * as THREE from 'three/webgpu';

const IDENT = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

export class Collision {
  constructor() { this.shapes = new Set(); this.grounds = new Set(); }
  /** Caixa: center/half no espaço do frame; quat opcional (rotação local da caixa). */
  addBox({ frame = IDENT, center, half, quat = null, tag = '' }) {
    const s = { type: 'box', frame, center: center.clone(), half: half.clone(), quat: quat ? quat.clone() : null, tag, enabled: true };
    this.shapes.add(s); s.remove = () => this.shapes.delete(s); return s;
  }
  addSphere({ frame = IDENT, center, radius, tag = '' }) {
    const s = { type: 'sphere', frame, center: center.clone(), radius, tag, enabled: true };
    this.shapes.add(s); s.remove = () => this.shapes.delete(s); return s;
  }
  addGround(fn) { this.grounds.add(fn); return () => this.grounds.delete(fn); }

  /** Chão mais alto sob o ponto (consulta todos os provedores). */
  ground(world, out = { height: Infinity, normal: new THREE.Vector3(0, 1, 0), material: null }) {
    out.height = Infinity; out.material = null;
    const tmp = { height: Infinity, normal: new THREE.Vector3(), material: null };
    for (const g of this.grounds) {
      const r = g(world, tmp);
      if (r && tmp.height < out.height) { out.height = tmp.height; out.normal.copy(tmp.normal); out.material = tmp.material; }
    }
    return out;
  }

  _toShapeLocal(s, world, out) {
    out.copy(world).sub(s.frame.pos).applyQuaternion(_q.copy(s.frame.quat).invert()).sub(s.center);
    if (s.quat) out.applyQuaternion(_q.copy(s.quat).invert());
    return out;
  }
  _dirToWorld(s, local, out) {
    out.copy(local);
    if (s.quat) out.applyQuaternion(s.quat);
    return out.applyQuaternion(s.frame.quat);
  }

  /**
   * Empurra uma esfera para fora das formas. Retorna { pos (corrigida), hit,
   * normal, onGround } — onGround quando alguma normal aponta para `up`.
   */
  resolveSphere(world, radius, up = null, out = { pos: new THREE.Vector3(), hit: false, normal: new THREE.Vector3(), onGround: false }) {
    out.pos.copy(world); out.hit = false; out.onGround = false; out.normal.set(0, 0, 0);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.shapes) {
        if (!s.enabled) continue;
        this._toShapeLocal(s, out.pos, _p);
        let pen = 0;
        if (s.type === 'sphere') {
          const d = _p.length(); pen = s.radius + radius - d;
          if (pen > 0) _n.copy(_p).divideScalar(d || 1);
        } else {
          _c.set(THREE.MathUtils.clamp(_p.x, -s.half.x, s.half.x), THREE.MathUtils.clamp(_p.y, -s.half.y, s.half.y), THREE.MathUtils.clamp(_p.z, -s.half.z, s.half.z));
          _d.copy(_p).sub(_c); const d = _d.length();
          if (d > 1e-6) { pen = radius - d; if (pen > 0) _n.copy(_d).divideScalar(d); }
          else { // centro dentro da caixa: sai pela face mais próxima
            const ex = s.half.x - Math.abs(_p.x), ey = s.half.y - Math.abs(_p.y), ez = s.half.z - Math.abs(_p.z);
            if (ex < ey && ex < ez) { _n.set(Math.sign(_p.x) || 1, 0, 0); pen = ex + radius; }
            else if (ey < ez) { _n.set(0, Math.sign(_p.y) || 1, 0); pen = ey + radius; }
            else { _n.set(0, 0, Math.sign(_p.z) || 1); pen = ez + radius; }
          }
        }
        if (pen > 0) {
          this._dirToWorld(s, _n, _d);
          out.pos.addScaledVector(_d, pen);
          out.hit = true; out.normal.add(_d); moved = true;
          if (up && _d.dot(up) > 0.6) out.onGround = true;
        }
      }
      if (!moved) break;
    }
    if (out.hit) out.normal.normalize();
    return out;
  }

  /** Raycast contra formas e chão. Retorna { dist, point, normal, tag } ou null. */
  raycast(origin, dir, maxDist = 1000) {
    let best = null;
    const ro = new THREE.Vector3(), rd = new THREE.Vector3();
    for (const s of this.shapes) {
      if (!s.enabled) continue;
      this._toShapeLocal(s, origin, ro);
      rd.copy(dir).applyQuaternion(_q.copy(s.frame.quat).invert());
      if (s.quat) rd.applyQuaternion(_q.copy(s.quat).invert());
      let t = null; const n = new THREE.Vector3();
      if (s.type === 'sphere') {
        const b = ro.dot(rd), c = ro.lengthSq() - s.radius * s.radius, h = b * b - c;
        if (h >= 0) { t = -b - Math.sqrt(h); if (t < 0) t = null; else n.copy(ro).addScaledVector(rd, t).normalize(); }
      } else {
        let tmin = -Infinity, tmax = Infinity, axis = 0, sgn = 1;
        for (let a = 0; a < 3; a++) {
          const o = ro.getComponent(a), d = rd.getComponent(a), h = s.half.getComponent(a);
          if (Math.abs(d) < 1e-9) { if (o < -h || o > h) { tmin = Infinity; break; } continue; }
          let t1 = (-h - o) / d, t2 = (h - o) / d, s1 = -1;
          if (t1 > t2) { [t1, t2] = [t2, t1]; s1 = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sgn = s1; }
          tmax = Math.min(tmax, t2);
        }
        if (tmin <= tmax && tmin >= 0) { t = tmin; n.setComponent(axis, sgn); }
      }
      if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { dist: t, normal: this._dirToWorld(s, n, new THREE.Vector3()), tag: s.tag, shape: s };
    }
    if (this.grounds.size) { // marcha contra o chão (passos adaptativos)
      const lim = best ? best.dist : maxDist;
      const g = { height: 0, normal: new THREE.Vector3(), material: null };
      let t = 0, prevH = null;
      for (let i = 0; i < 128 && t <= lim; i++) {
        _p.copy(origin).addScaledVector(dir, t);
        this.ground(_p, g);
        if (g.height === Infinity) break;
        if (g.height <= 0) {
          let tt = t;
          if (prevH !== null) tt = t - (Math.abs(g.height) / (prevH - g.height + 1e-9)) * (t - (t - Math.max(0.05, prevH * 0.5)));
          best = { dist: Math.max(0, tt), normal: g.normal.clone(), tag: 'ground', material: g.material };
          break;
        }
        prevH = g.height;
        t += Math.max(0.05, g.height * 0.5);
      }
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.dist);
    return best;
  }
}
