// População de fauna ao redor do jogador. A superfície é dividida em células
// fixas no planeta (faces do cubo-esfera, 160 m): cada célula tem — sempre
// igual, pela seed — um grupo (bando, dupla de predadores, territorial,
// revoada, nadadores) ou nada. Células entram/saem conforme a distância,
// respeitando quality.creatureBudget. O verme gigante do deserto é um
// habitante único que emerge perto do jogador.
import * as THREE from 'three/webgpu';
import { rng, hmix, hashStr, clamp } from './util.js';
import { speciesFor } from './species.js';
import { buildCreature } from './creatureGeo.js';
import { creatureMaterial } from './materials.js';
import { Creature, CreatureProto } from './creature.js';
import { think, integrate, separate } from './behavior.js';
import { WormDriver, MarineDriver } from './path.js';

const CELL = 160;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function toFace(d) {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  if (ax >= ay && ax >= az) return { f: d.x > 0 ? 0 : 1, u: d.y / ax, v: d.z / ax };
  if (ay >= az) return { f: d.y > 0 ? 2 : 3, u: d.x / ay, v: d.z / ay };
  return { f: d.z > 0 ? 4 : 5, u: d.x / az, v: d.y / az };
}
export function fromFace(f, u, v, out = new THREE.Vector3()) {
  switch (f) {
    case 0: out.set(1, u, v); break; case 1: out.set(-1, u, v); break;
    case 2: out.set(u, 1, v); break; case 3: out.set(u, -1, v); break;
    case 4: out.set(u, v, 1); break; default: out.set(u, v, -1);
  }
  return out.normalize();
}

const ROLE_W = { grazer: 3.2, critter: 1.6, predator: 0.75, territorial: 0.8, flyer: 1.3, marine: 0, worm: 0 };

export class Fauna {
  constructor(ctx, patch) {
    this.ctx = ctx; this.patch = patch;
    this.protos = new Map();
    this.creatures = [];
    this.cells = new Map();
    this.herds = [];
    this.worm = null;
    this.cellT = 0;
    this.enabled = true;
    this.loudT = 0;
  }
  get budget() { return Math.max(4, Math.round(this.ctx.quality.creatureBudget ?? 24)); }

  proto(sp) {
    let p = this.protos.get(sp.id);
    if (!p) { p = new CreatureProto(sp, buildCreature(sp), creatureMaterial(sp)); this.protos.set(sp.id, p); }
    return p;
  }

  spawn(sp, pos, heading = 0, opts = {}) {
    const c = new Creature(this.proto(sp), pos, heading, opts);
    this.patch.group.add(c.mesh);
    this.creatures.push(c);
    if (sp.plan === 'worm') new WormDriver(c, this.patch, this.ctx);
    if (sp.plan === 'marine') new MarineDriver(c, this.patch, opts.center || pos, opts.radius || 40);
    if (c.path?.dustColor === undefined && sp.plan === 'worm') {
      const pal = this.patch.body?.palette?.[3];
      if (pal) { const k = new THREE.Color(pal); c.path.dustColor = [k.r * 0.8, k.g * 0.7, k.b * 0.6]; }
    }
    c.mesh.castShadow = !!this.ctx.quality.shadows;
    return c;
  }
  remove(c) {
    c.mesh.parent?.remove(c.mesh);
    c.mesh.skeleton?.dispose?.();
    const i = this.creatures.indexOf(c); if (i >= 0) this.creatures.splice(i, 1);
    if (c.herd) { const k = c.herd.members.indexOf(c); if (k >= 0) c.herd.members.splice(k, 1); }
    if (this.worm === c) this.worm = null;
  }
  clear() {
    for (const c of [...this.creatures]) this.remove(c);
    this.cells.clear(); this.herds = []; this.worm = null;
  }
  rebase(pt, dir) {
    for (const c of this.creatures) c.rebase(pt, dir);
    for (const h of this.herds) pt(h.center);
    for (const cell of this.cells.values()) if (cell.center) pt(cell.center);
  }

  // ── células ───────────────────────────────────────────────────────────
  cellKey(f, i, j) { return `${f}:${i}:${j}`; }

  /** Atualiza células ao redor do ponto local `local` (referencial do planeta). */
  updateCells(local, force = false) {
    const body = this.patch.body; if (!body) return;
    const sps = speciesFor(body).fauna;
    if (!sps.length) return;
    const R = body.radius;
    const d = _v.copy(local).normalize();
    const F = toFace(d);
    const ci = Math.floor(F.u * R / CELL), cj = Math.floor(F.v * R / CELL);
    const K = 3;
    const want = [];
    for (let i = ci - K; i <= ci + K; i++) for (let j = cj - K; j <= cj + K; j++) {
      const key = this.cellKey(F.f, i, j);
      const dir = fromFace(F.f, (i + 0.5) * CELL / R, (j + 0.5) * CELL / R, new THREE.Vector3());
      const cl = dir.multiplyScalar(R);
      const dist = cl.distanceTo(_w.copy(d).multiplyScalar(R));
      want.push({ key, f: F.f, i, j, dist, cl });
    }
    want.sort((a, b) => a.dist - b.dist);
    // remove distantes
    for (const [key, cell] of this.cells) {
      const w = want.find((x) => x.key === key);
      if (!w || w.dist > 620) {
        for (const c of cell.members) this.remove(c);
        this.cells.delete(key);
      }
    }
    let count = this.creatures.length;
    const budget = this.budget;
    for (const w of want) {
      if (w.dist > 420 || this.cells.has(w.key)) continue;
      const cell = this.populate(body, sps, w);
      this.cells.set(w.key, cell);
      count += cell.members.length;
      if (count >= budget && !force) break;
    }
    // trava dura: se passou do orçamento, remove as células mais distantes
    if (this.creatures.length > budget * 1.25) {
      const far = [...this.cells.entries()].map(([k, c]) => ({ k, c, d: c.center ? c.center.length() : 0 })).sort((a, b) => b.d - a.d);
      for (const x of far) { if (this.creatures.length <= budget) break; for (const c of x.c.members) this.remove(c); this.cells.delete(x.k); }
    }
  }

  populate(body, sps, w) {
    const cell = { members: [], center: null };
    const r = rng(hmix(body.seed >>> 0, hashStr(w.key)));
    const density = clamp((body.fauna ?? 0.7) * 0.85 + 0.15, 0, 1);
    if (r() > 0.62 * density + 0.08) return cell;
    // ponto do grupo
    const R = body.radius;
    const P = this.patch;
    const ju = (w.i + 0.2 + r() * 0.6) * CELL / R, jv = (w.j + 0.2 + r() * 0.6) * CELL / R;
    const dir = fromFace(w.f, ju, jv, new THREE.Vector3());
    const local = dir.multiplyScalar(R);
    const pc = P.toPatch(local, new THREE.Vector3());
    const g = P.ground(pc.x, pc.z, {});
    pc.y = g.y;
    let pool = sps.filter((s) => s.plan !== 'worm');
    if (g.water) pool = pool.filter((s) => s.plan === 'marine' || s.plan === 'flyer');
    else pool = pool.filter((s) => s.plan !== 'marine');
    if (!pool.length) return cell;
    const sp = r.weighted(pool, (s) => (s.plan === 'marine' ? 4 : ROLE_W[s.role] ?? 1));
    cell.center = pc.clone();
    this.spawnGroup(sp, pc, r, cell);
    return cell;
  }

  /** Cria um grupo da espécie em torno de pc (remendo). */
  spawnGroup(sp, pc, r = rng(Math.random() * 1e9), cell = null, count = null) {
    const P = this.patch;
    const B = sp.behavior;
    const n = count ?? r.int(B.herd[0], B.herd[1]);
    const herd = { members: [], center: pc.clone(), species: sp };
    if (sp.plan === 'flyer') {
      herd.radius = 35 + r() * 40; herd.alt = 22 + r() * 30; herd.omega = (r() < 0.5 ? -1 : 1) * (0.08 + r() * 0.08); herd.speedK = 0.9 + r() * 0.3;
    }
    const out = [];
    for (let k = 0; k < n; k++) {
      let pos;
      if (sp.plan === 'flyer') {
        const a = (k / n) * Math.PI * 2 + r() * 0.3;
        pos = new THREE.Vector3(pc.x + Math.cos(a) * herd.radius, 0, pc.z + Math.sin(a) * herd.radius);
        pos.y = P.groundY(pos.x, pos.z) + herd.alt + (r() - 0.5) * 6;
      } else if (sp.plan === 'marine') {
        pos = pc.clone();
      } else {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (4 + n * 1.6) * Math.sqrt(sp.L / 2);
        pos = new THREE.Vector3(pc.x + Math.cos(a) * d, 0, pc.z + Math.sin(a) * d);
        const g = P.ground(pos.x, pos.z, {});
        if (g.water) continue;
        pos.y = g.y;
      }
      const scale = sp.plan === 'marine' || sp.plan === 'worm' ? 1 : (k === 0 && n > 2 ? 1.12 : 0.82 + r() * 0.3);
      const c = this.spawn(sp, pos, r() * Math.PI * 2, { scale, center: pc, radius: 30 + r() * 30 });
      c.herd = herd; herd.members.push(c);
      c.slot = (k / n) * Math.PI * 2; c.slotY = (r() - 0.5) * 8;
      c.state = sp.plan === 'flyer' ? 'fly' : r() < 0.6 ? 'graze' : 'idle';
      c.stateT = 2 + r() * 8;
      if (sp.plan === 'flyer') c.vel.set(-Math.sin(c.slot), 0, Math.cos(c.slot)).multiplyScalar(sp.behavior.walk);
      out.push(c);
      cell?.members.push(c);
    }
    this.herds.push(herd);
    return out;
  }

  /** Verme gigante: habitante único do corpo desértico. */
  ensureWorm() {
    const body = this.patch.body;
    if (!body || this.worm) return this.worm;
    const sp = speciesFor(body).fauna.find((s) => s.plan === 'worm');
    if (!sp) return null;
    this.worm = this.spawn(sp, new THREE.Vector3(), 0);
    return this.worm;
  }

  // ── passo fixo ─────────────────────────────────────────────────────────
  step(dt, W) {
    this.loudT = Math.max(0, this.loudT - dt);
    W.loud = this.loudT > 0;
    W.near = (c, rr) => this.creatures.filter((o) => o !== c && Math.abs(o.pos.x - c.pos.x) < rr && Math.abs(o.pos.z - c.pos.z) < rr);
    for (const h of this.herds) {
      let n = 0; _v.set(0, 0, 0);
      for (const m of h.members) if (m.alive) { _v.add(m.pos); n++; }
      if (n && h.species.plan !== 'flyer') h.center.copy(_v.divideScalar(n));
    }
    for (const c of this.creatures) {
      if (c.path) { c.path.step(dt, W); continue; }
      think(c, dt, W);
      integrate(c, dt, this.patch);
      if (!c.alive) { c.deadLife = (c.deadLife || 0) + dt; }
    }
    separate(this.creatures, dt);
    for (const c of [...this.creatures]) if (!c.alive && c.deadLife > 90) this.remove(c);
  }

  frame(dt, camP, t) {
    const shadows = !!this.ctx.quality.shadows;
    for (const c of this.creatures) {
      if (c.path) { c.path.frame(dt, this.ctx); continue; }
      c.animate(dt, this.patch, camP, t);
      if (shadows) c.mesh.castShadow = c.lod < 2;
    }
  }
}
