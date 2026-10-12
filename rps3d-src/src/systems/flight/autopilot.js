// Piloto automático de aproximação: pouso assistido num ponto do terreno ou
// numa plataforma/hangar (docking). Trabalha comandando VELOCIDADE e RUMO no
// modelo acoplado — a mesma física do piloto, só que com outra "mão".
//
// alvo: { frame (Frame), pos (local no frame), up (local), fwd (local, opcional),
//         hover (m acima do ponto antes de descer), onArrive(), kind: 'land'|'dock' }
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _w = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export class Autopilot {
  constructor(ctx, model) {
    this.ctx = ctx; this.m = model;
    this.target = null; this.phase = 'idle';
    this.velCmd = new THREE.Vector3();
  }
  get active() { return !!this.target; }

  engage(target) {
    this.target = { hover: 60, kind: 'land', ...target };
    this.phase = 'approach';
    this.m.setCruise(false);
  }
  cancel(reason = '') {
    if (!this.target) return;
    const t = this.target;
    this.target = null; this.phase = 'idle';
    this.m.velCommand = null; this.m.headingCommand = null;
    t.onCancel?.(reason);
  }

  /** Converte o alvo para o referencial atual da nave. */
  local(out, vec, isDir, t) {
    const T = this.target, m = this.m;
    if (T.frame.same(m.frame)) return out.copy(vec);
    if (isDir) { T.frame.dirToWorld(vec, t, _w); return m.frame.dirToLocal(_w, t, out); }
    T.frame.posToWorld(vec, t, _w); return m.frame.posToLocal(_w, t, out);
  }

  step(dt, ctl) {
    const T = this.target, m = this.m;
    if (!T) return;
    // o piloto assume: manche ou acelerador fortes cancelam
    if (Math.abs(ctl.pitch) > 0.45 || Math.abs(ctl.yaw) > 0.45 || ctl.boost) { this.cancel('piloto'); return; }
    if (m.landed || m.docked) { this.finish(); return; }
    const t = this.ctx.time.world;
    const P = m.P;
    const pos = this.local(_v, T.pos, false, t);
    const up = this.local(_v2, T.up, true, t).normalize();
    const hold = _v3.copy(pos).addScaledVector(up, T.hover);
    const toHold = hold.clone().sub(m.pos);
    const dist = toHold.length();
    const fwdT = T.fwd ? this.local(new THREE.Vector3(), T.fwd, true, t).normalize() : null;
    if (this.phase === 'approach') {
      // velocidade ∝ √distância (perfil de frenagem) limitada pelo SCM
      const vmax = Math.min(P.scm * 0.95, Math.sqrt(2 * P.accel.back * 0.55 * dist) + 2);
      this.velCmd.copy(toHold).multiplyScalar(dist > 1e-3 ? vmax / dist : 0);
      m.velCommand = this.velCmd;
      // rumo: olha para o destino (horizontal) e cada vez mais para o rumo final
      const horiz = toHold.clone().addScaledVector(up, -toHold.dot(up));
      let fwd = horiz.lengthSq() > 25 ? horiz.normalize() : (fwdT || m.fwd(new THREE.Vector3()).addScaledVector(up, -m.fwd(new THREE.Vector3()).dot(up)).normalize());
      if (fwdT && dist < 300) fwd = fwd.lerp(fwdT, 1 - dist / 300).normalize();
      m.headingCommand = { fwd, up, gain: 1.6, weight: 1 };
      if (dist < 250) m.gear = true;
      if (dist < 8 && m.vel.length() < 6) this.phase = 'descend';
      return;
    }
    if (this.phase === 'descend') {
      m.gear = true;
      const clr = m.clearance();
      const goal = _v3.copy(pos).addScaledVector(up, clr);
      const d = goal.clone().sub(m.pos);
      const h = d.dot(up) * -1; // altura acima do ponto final
      const lateral = d.clone().addScaledVector(up, -d.dot(up));
      this.velCmd.copy(lateral).multiplyScalar(0.9).addScaledVector(up, -clamp(h * 0.45, 0.6, 9));
      m.velCommand = this.velCmd;
      const fwd = fwdT || m.fwd(new THREE.Vector3()).addScaledVector(up, -m.fwd(new THREE.Vector3()).dot(up)).normalize();
      m.headingCommand = { fwd, up, gain: 1.8, weight: 1 };
      // plataformas sem terreno (anchor): o toque é declarado aqui
      if (h < 0.12 && m.gearT > 0.85) {
        m.pos.copy(goal);
        m.touchdown(up, Math.abs(m.vel.dot(up)), t);
      }
    }
  }

  finish() {
    const T = this.target;
    this.target = null; this.phase = 'idle';
    this.m.velCommand = null; this.m.headingCommand = null;
    T?.onArrive?.();
  }
}
