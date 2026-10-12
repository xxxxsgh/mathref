// Registro de interações a pé (ctx.services.interact).
//
//   register({ getPos(out)|pos(out)|pos:Vector3, radius, label|text, sub,
//              onUse|use, enabled(), hold (s), kind, priority, cone }) → remove()
//
// Escolhe o alvo mais próximo do centro da visão dentro do raio, mostra o
// prompt na HUD (ou num rótulo próprio, sem HUD) e chama onUse ao apertar
// interagir (ou ao segurar `hold` segundos).
import * as THREE from 'three/webgpu';

const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();

export class Interact {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = new Set();
    this.current = null;
    this.holdT = 0;
    this.blocked = false; // ex.: durante o minijogo de hack
    const self = this;
    this.api = {
      register(def) { return self.register(def); },
      add(def) { return self.register(def); },
      remove(h) { if (h && typeof h === 'function') h(); else if (h) self.items.delete(h); },
      get current() { return self.current?.def || null; },
      list: () => [...self.items].map((i) => i.def),
    };
  }

  register(def) {
    const it = { def, id: def.id || null };
    if (it.id) for (const o of this.items) if (o.id === it.id) this.items.delete(o);
    this.items.add(it);
    const remove = () => { this.items.delete(it); if (this.current === it) this.current = null; };
    remove.update = (d) => Object.assign(def, d);
    return remove;
  }

  posOf(def, out) {
    if (typeof def.getPos === 'function') return def.getPos(out) || out;
    if (typeof def.pos === 'function') return def.pos(out) || out;
    if (def.pos?.isVector3) return out.copy(def.pos);
    if (def.position?.isVector3) return out.copy(def.position);
    return null;
  }

  /** Passo fixo: escolhe o alvo e trata a tecla. eye/fwd em mundo. */
  update(dt, eye, fwd, enabled = true) {
    const ctx = this.ctx;
    let best = null, bs = -Infinity;
    if (enabled && !this.blocked) {
      for (const it of this.items) {
        const d = it.def;
        try { if (d.enabled && !d.enabled()) continue; } catch { continue; }
        const p = this.posOf(d, _p);
        if (!p) continue;
        const v = _d.copy(p).sub(eye);
        const dist = v.length();
        const R = d.radius ?? 2.5;
        if (dist > R) continue;
        const dot = dist > 0.01 ? v.divideScalar(dist).dot(fwd) : 1;
        const cone = d.cone ?? (dist < 1.2 ? -0.2 : 0.55);
        if (dot < cone) continue;
        const s = dot * 2 - dist / R + (d.priority || 0);
        if (s > bs) { bs = s; best = it; }
      }
    }
    if (best !== this.current) { this.current = best; this.holdT = 0; }
    const hud = ctx.services.hud;
    if (best) {
      const d = best.def;
      const label = String(d.label || d.text || 'Usar');
      const hold = d.hold || 0;
      if (hold > 0 && ctx.input.down('interact')) this.holdT += dt; else this.holdT = 0;
      try { hud?.prompt?.(label, { id: 'foot', action: 'interact', sub: d.sub || '', hold: hold > 0 ? Math.min(1, this.holdT / hold) : undefined, ttl: 0.25, priority: 2 }); } catch { /* */ }
      const fire = hold > 0 ? this.holdT >= hold : ctx.input.pressed('interact');
      if (fire) {
        this.holdT = 0;
        try { (d.onUse || d.use)?.(d); } catch (e) { ctx.errors.push('interact ' + (d.id || label) + ': ' + (e.stack || e)); }
        return true;
      }
    } else {
      try { hud?.prompt?.(null, { id: 'foot' }); } catch { /* */ }
    }
    return false;
  }
}

export function lookDir(ctx, out = _f) { return out.set(0, 0, -1).applyQuaternion(ctx.camera.quaternion); }
