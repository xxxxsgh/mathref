// Tráfego de naves NPC em volta das estações: cargueiros e caças entrando e
// saindo dos hangares pelos corredores de aproximação, e algumas naves em
// órbita de espera. Modelos do serviço `ships` (com reserva própria simples
// se ele não existir). Só roda perto da estação (≤ 40 km) e respeita o preset.
import * as THREE from 'three/webgpu';
import { V3 } from './geo.js';

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const BUDGET = { ultra: 9, high: 7, medium: 4, mobile: 2 };

const CLASSES = {
  guilda: [['freighter', 'guilda'], ['freighter', 'guilda'], ['explorer', 'guilda'], ['fighter', 'guilda'], ['freighter', 'frente'], ['interceptor', 'guilda'], ['explorer', 'frente'], ['freighter', 'corsarios']],
  hegemonia: [['fighter', 'hegemonia'], ['interceptor', 'hegemonia'], ['freighter', 'hegemonia'], ['fighter', 'hegemonia']],
  frente: [['fighter', 'frente'], ['freighter', 'frente'], ['interceptor', 'frente'], ['explorer', 'frente']],
  industrial: [['freighter', 'guilda'], ['freighter', 'guilda'], ['explorer', 'guilda']],
};

/** Nave de reserva (sem o sistema `ships`): casco simples com motor brilhante. */
function fallbackShip(ctx) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.6, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 16, 8), m); body.rotation.x = Math.PI / 2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 5), m); wing.position.z = 3; g.add(wing);
  const eng = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 4, 8) })); eng.position.z = 8.5; g.add(eng);
  void ctx;
  return { group: g, setThrottle() {}, setGear() {}, setLights() {}, dispose() { g.traverse((o) => o.geometry?.dispose()); m.dispose(); }, length: 16 };
}

class Npc {
  constructor(ctx, view, lane, kind, idx, cls) {
    this.ctx = ctx; this.view = view; this.lane = lane; this.kind = kind; this.idx = idx;
    let inst = null;
    try { inst = ctx.services.ships?.create?.(cls[0], cls[1], { lite: ctx.quality.name !== 'ultra', seed: 900 + idx * 31, id: `trafego-${view.st.id}-${idx}`, throttle: 0.5, noDecals: false }); } catch (e) { ctx.errors.push('stations: ships.create: ' + (e.stack || e)); }
    this.inst = inst || fallbackShip(ctx);
    try { this.inst.setLights?.(true); } catch { /* */ }
    this.pos = new THREE.Vector3();
    this.entry = ctx.world.add(this.inst.group, this.pos);
    this.s = 0; this.dir = 1; this.wait = 0; this.speed = 0;
    this.len = this.inst.length || 20;
    this.orbitR = view.radius * (1.9 + (idx % 3) * 0.35); this.orbitW = 0.028 * (idx % 2 ? 1 : -1) * (600 / this.orbitR); this.orbitPh = idx * 1.7;
  }
  dispose() { this.entry.remove(); try { this.inst.dispose(); } catch { /* */ } }
}

export class Traffic {
  constructor(ctx) { this.ctx = ctx; this.byView = new Map(); this.paused = false; }
  clear() { for (const list of this.byView.values()) for (const n of list) n.dispose(); this.byView.clear(); }

  ensure(view) {
    if (this.byView.has(view)) return this.byView.get(view);
    const ctx = this.ctx;
    const n = Math.min(BUDGET[ctx.quality.name] ?? 4, view.arch === 'meridiana' ? 9 : view.arch === 'platform' ? 3 : 3);
    const pool = CLASSES[view.style] || CLASSES.guilda;
    const list = [];
    const lanes = view.bays.filter((b) => b.index !== 0 || view.bays.length === 1);
    for (let i = 0; i < n; i++) {
      const orbit = i >= Math.max(1, n - 2) && view.arch === 'meridiana';
      const lane = lanes.length ? lanes[i % lanes.length] : null;
      const npc = new Npc(ctx, view, lane, orbit || !lane ? 'orbit' : 'lane', i, pool[i % pool.length]);
      if (npc.kind === 'lane') {
        npc.pathW = lane.path.map((p) => p.clone());
        npc.cum = [0];
        for (let k = 1; k < npc.pathW.length; k++) npc.cum.push(npc.cum[k - 1] + npc.pathW[k].distanceTo(npc.pathW[k - 1]));
        npc.total = npc.cum[npc.cum.length - 1];
        // espalha no tempo: uns entrando, outros saindo
        npc.dir = i % 2 ? -1 : 1;
        npc.s = ((i * 0.37) % 1) * npc.total;
      }
      list.push(npc);
    }
    this.byView.set(view, list);
    return list;
  }

  /** Ponto local no caminho da faixa. */
  at(npc, s, out) {
    const P = npc.pathW, C = npc.cum;
    for (let i = 1; i < P.length; i++) if (s <= C[i]) return out.copy(P[i - 1]).lerp(P[i], (s - C[i - 1]) / Math.max(1e-6, C[i] - C[i - 1]));
    return out.copy(P[P.length - 1]);
  }

  frame(dt, ctx, views) {
    for (const v of views.values()) {
      const near = v.built && v.visible && ctx.player.camWorld.distanceTo(v.frame.pos) < 40000 && !this.paused;
      if (!near) { if (this.byView.has(v)) { for (const n of this.byView.get(v)) n.dispose(); this.byView.delete(v); } continue; }
      const list = this.ensure(v);
      for (const n of list) this.step(n, dt, v, ctx);
    }
  }

  step(n, dt, v, ctx) {
    const inst = n.inst;
    if (n.kind === 'orbit') {
      const a = n.orbitPh + ctx.time.world * n.orbitW;
      const local = V3(Math.cos(a) * n.orbitR, Math.sin(a * 0.7) * n.orbitR * 0.12 + (n.idx % 2 ? 260 : -180), Math.sin(a) * n.orbitR);
      const tan = V3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.sign(n.orbitW));
      v.toWorld(local, n.pos);
      this.orient(inst, v.dirToWorld(tan, _v), v.dirToWorld(V3(0, 1, 0), _w));
      inst.setThrottle?.(0.55); inst.setGear?.(false);
      return;
    }
    const lane = n.lane;
    if (n.wait > 0) { n.wait -= dt; inst.group.visible = false; if (n.wait <= 0) { n.dir = -n.dir; } return; }
    inst.group.visible = true;
    const remain = n.dir > 0 ? n.total - n.s : n.s;
    // perfil: rápido longe, devagar no hangar
    const target = THREE.MathUtils.clamp(remain * 0.22 + 6, 6, 190);
    n.speed += (target - n.speed) * Math.min(1, dt * 0.8);
    n.s += n.dir * n.speed * dt;
    if (n.s >= n.total) { n.s = n.total; n.wait = 6 + (n.idx % 3) * 4; }
    if (n.s <= 0) { n.s = 0; n.wait = 2 + (n.idx % 4) * 3; n.speed = 40; }
    const p = this.at(n, n.s, _v.set(0, 0, 0));
    v.toWorld(p, n.pos);
    const ahead = this.at(n, THREE.MathUtils.clamp(n.s + n.dir * 30, 0, n.total), new THREE.Vector3());
    let fwd = ahead.sub(p);
    if (fwd.lengthSq() < 1e-4 || remain < 30) fwd = n.dir > 0 ? lane.fwd.clone() : lane.out.clone();
    fwd.normalize();
    this.orient(inst, v.dirToWorld(fwd, new THREE.Vector3()), v.dirToWorld(lane.up, new THREE.Vector3()));
    inst.setThrottle?.(Math.min(1, 0.2 + n.speed / 200));
    inst.setGear?.(remain < 220);
  }

  orient(inst, fwd, up) {
    _m.lookAt(V3(), fwd, up);
    _q.setFromRotationMatrix(_m);
    inst.group.quaternion.copy(_q);
  }
}
