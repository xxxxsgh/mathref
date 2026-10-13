// Diretor de encontros em terra: acampamentos (Hegemonia, Corsários),
// sentinelas nas ruínas, depósitos minerais; liga/desliga por distância,
// coberturas compartilhadas, linha de visada, disparos/granadas inimigos,
// falas de rádio, alarme do esquadrão, saques (munição) e o alvo "jogador".
import * as THREE from 'three/webgpu';
import { Enemy } from './enemy.js';
import { buildCamp, buildDeposit } from './props.js';
import { LOOKS } from './humanoid.js';
import { A, blast } from '../projectiles.js';
import { COLORS } from '../beams.js';
import { quatFromFwdUp, anyPerp, rng, hashStr } from '../util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const RES = { lush: ['carbono', 'cristal'], desert: ['ferro', 'ouro'], ice: ['cristal', 'cobalto'], volcanic: ['enxofre', 'ouro'], toxic: ['cobalto', 'enxofre'], ocean: ['carbono', 'cristal'], dead: ['relíquia', 'cobalto'] };

export class Director {
  constructor(ctx, foot) {
    this.ctx = ctx; this.foot = foot;
    this.enemies = [];
    this.camps = [];
    this.deposits = [];
    this.frames = new Map(); // corpo → {pos, quat} (referencial de colisão)
    this.playerPos = new THREE.Vector3(); this.playerEye = new THREE.Vector3();
    this.playerAlive = true; this.playerStealth = false;
    this.alarm = false;
    this.barkT = 0; this.grenadeT = 4;
    this.lastAnchor = null;
    this.siteCheckT = 0;
    this.enabled = true;
    this.cleared = new Set();
    this.depositCells = new Map();
    const self = this;
    // o jogador como alvo dos projéteis inimigos
    this.playerTarget = {
      isPlayer: true, faction: 'jogador',
      get alive() { return self.playerAlive; },
      hitSegment(p0, p1) {
        const c = foot.ctrl;
        if (!self.playerAlive || !self.lastAnchor) return null;
        const up = A.up(self.lastAnchor, self.playerPos, _v);
        const h = c.bodyHeight();
        const b0 = new THREE.Vector3().copy(self.playerPos).addScaledVector(up, 0.3);
        const b1 = new THREE.Vector3().copy(self.playerPos).addScaledVector(up, h - 0.25);
        const r = segSegLocal(p0, p1, b0, b1);
        if (r.d < 0.38) return { t: r.s, part: r.t > 0.85 ? 'head' : 'body' };
        return null;
      },
      center(out) { return out.copy(self.playerPos).addScaledVector(A.up(self.lastAnchor || { kind: 'world' }, self.playerPos, _v), 1.0); },
      damage(amount, info = {}) { foot.playerHit(amount, info); },
    };
  }

  /** Referencial de colisão de um corpo (atualizado a cada passo). */
  frameFor(body) {
    let f = this.frames.get(body.id);
    if (!f) { f = { pos: body.pos.clone(), quat: new THREE.Quaternion(), body }; this.frames.set(body.id, f); }
    return f;
  }
  syncFrames(t) { for (const f of this.frames.values()) { f.pos.copy(f.body.pos); f.body.rotationAt(t, f.quat); } }

  anchorOf(body) { return { kind: 'body', body }; }

  /** Ponto no chão (local) sob `local`. */
  groundAt(anchor, local) {
    const pl = this.ctx.services.planets;
    if (anchor.kind === 'body') {
      if (pl?.placeOnSurface) return pl.placeOnSurface(anchor.body, local, 0, _w).clone();
      return null;
    }
    if (anchor.kind === 'frame') {
      const t = this.ctx.time.world;
      const up = A.up(anchor, local, new THREE.Vector3());
      const o = A.toWorld(anchor, local.clone().addScaledVector(up, 1.0), new THREE.Vector3(), t);
      const r = this.ctx.collision.raycast(o, A.dirToWorld(anchor, up.clone().negate(), new THREE.Vector3(), t), 3);
      if (r) return A.toLocal(anchor, r.point, new THREE.Vector3(), t);
    }
    return null;
  }

  lineOfSight(fromL, toL, anchor) {
    const t = this.ctx.time.world;
    const a = A.toWorld(anchor, fromL, new THREE.Vector3(), t), b = A.toWorld(anchor, toL, new THREE.Vector3(), t);
    const d = b.clone().sub(a); const L = d.length();
    if (L < 1e-3) return true;
    const r = this.ctx.collision.raycast(a, d.divideScalar(L), L);
    return !r || r.dist > L - 0.6;
  }

  pushOut(e) {
    const col = this.ctx.collision;
    if (!col.shapes.size) return;
    const t = this.ctx.time.world;
    const c = e.pos.clone().addScaledVector(e.up, 0.6);
    const w = A.toWorld(e.anchor, c, new THREE.Vector3(), t);
    const r = col.resolveSphere(w, 0.35, null);
    if (r.hit) { const l = A.toLocal(e.anchor, r.pos, new THREE.Vector3(), t); e.pos.add(l.sub(c)); }
  }

  // ─── acampamentos ─────────────────────────────────────────────────────
  /**
   * Acampamento num corpo: o = { body, dir (local unit), facing (local, tangente),
   * faction, squad: [{kind}], id }
   */
  spawnCamp(o) {
    const ctx = this.ctx, pl = ctx.services.planets;
    const body = o.body;
    const anchor = this.anchorOf(body);
    const up = o.dir.clone().normalize();
    const fwd = (o.facing || anyPerp(up)).clone().addScaledVector(up, -(o.facing || anyPerp(up)).dot(up)).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const R = body.radius;
    const hAt = (d) => (pl?.heightAtLocal ? pl.heightAtLocal(body, d) : 0);
    const h0 = Math.max(hAt(up), pl?.view?.(body)?.terrain?.hasSea ? 0 : -1e9);
    const center = up.clone().multiplyScalar(R + h0);
    const heightAt = (x, z) => {
      const d = up.clone().multiplyScalar(R).addScaledVector(right, x).addScaledVector(fwd, -z).normalize();
      return hAt(d) - h0 - 0.08;
    };
    const r = rng(hashStr(o.id || 'camp'));
    const camp = buildCamp(o.faction, r, heightAt, { lite: ctx.quality.name === 'mobile' });
    const qL = quatFromFwdUp(fwd, up, new THREE.Quaternion());
    const C = { id: o.id, body, anchor, center, qL, group: camp.group, shapes: [], covers: [], lights: [], enemies: [], faction: o.faction, mat: camp.mat };
    C.entry = ctx.world.add(camp.group, new THREE.Vector3(), { getPos: (out) => body.localToWorld(center, ctx.time.world, out) });
    // colisores no referencial do corpo
    const fr = this.frameFor(body);
    for (const c of camp.colliders) {
      const cl = c.center.clone().applyQuaternion(qL).add(center);
      const q = qL.clone().multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.ry || 0));
      C.shapes.push(ctx.collision.addBox({ frame: fr, center: cl, half: c.half, quat: q, tag: 'foot:camp' }));
    }
    for (const cv of camp.covers) {
      C.covers.push({ pos: cv.pos.clone().applyQuaternion(qL).add(center), normalL: cv.normal.clone().applyQuaternion(qL).normalize(), height: cv.height, taken: null, camp: C });
    }
    // luzes (no grupo do acampamento)
    const lightBudget = ctx.quality.name === 'mobile' ? 0 : ctx.quality.name === 'medium' ? 1 : 2;
    camp.lights.slice(0, lightBudget).forEach((L) => {
      const pl2 = new THREE.PointLight(L.color, L.intensity, L.dist, 2);
      pl2.position.copy(L.pos); pl2.castShadow = false;
      camp.group.add(pl2); C.lights.push(pl2);
    });
    // esquadrão
    const squad = o.squad || [{ kind: 'soldier' }, { kind: 'soldier' }, { kind: 'officer' }];
    squad.forEach((s, i) => {
      const a = (i / squad.length) * Math.PI * 2 + r() * 0.5;
      const rr = 2 + r() * 4;
      const p = center.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(fwd, Math.sin(a) * rr * 0.6 - 2);
      const e = this.addEnemy({ kind: s.kind, faction: o.faction, anchor, pos: p, fwd: fwd.clone(), seed: hashStr((o.id || '') + i), squad: C, state: s.state });
      C.enemies.push(e);
    });
    this.camps.push(C);
    return C;
  }

  removeCamp(C) {
    for (const s of C.shapes) s.remove();
    C.entry?.remove();
    for (const e of C.enemies) this.removeEnemy(e);
    const i = this.camps.indexOf(C); if (i >= 0) this.camps.splice(i, 1);
  }

  addEnemy(o) {
    const e = new Enemy(this, o);
    this.enemies.push(e);
    return e;
  }
  removeEnemy(e) {
    e.dispose();
    const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1);
  }
  clear() {
    for (const C of [...this.camps]) this.removeCamp(C);
    for (const e of [...this.enemies]) this.removeEnemy(e);
    for (const d of this.deposits) d.entry?.remove();
    this.deposits.length = 0; this.depositCells.clear();
    this.alarm = false;
  }

  /** Sentinelas numa ruína. */
  spawnSentinels(body, dir, n = 2, id = 'ruina') {
    const anchor = this.anchorOf(body);
    const up = dir.clone().normalize();
    const t1 = anyPerp(up);
    const r = rng(hashStr(id));
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = 4 + r() * 8;
      const d = up.clone().multiplyScalar(body.radius).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(new THREE.Vector3().crossVectors(up, t1), Math.sin(a) * rr).normalize();
      const p = this.groundAt(anchor, d.multiplyScalar(body.radius)) || d.multiplyScalar(body.radius);
      out.push(this.addEnemy({ kind: 'sentinel', faction: 'vigilantes', anchor, pos: p, fwd: t1.clone(), seed: hashStr(id + i) }));
    }
    return out;
  }

  // ─── coberturas ───────────────────────────────────────────────────────
  pickCover(e, P, far = false) {
    let best = null, bs = -Infinity;
    for (const C of this.camps) {
      if (C.anchor.body !== e.anchor.body) continue;
      for (const c of C.covers) {
        if (c.taken && c.taken !== e && c.taken.alive) continue;
        const toP = _v.copy(P).sub(c.pos); const dP = toP.length(); toP.divideScalar(dP || 1);
        const prot = toP.dot(c.normalL);
        if (prot < 0.35 || dP < 5) continue;
        const dE = c.pos.distanceTo(e.pos);
        const s = prot * 10 - dE * 0.35 - Math.abs(dP - (far ? 30 : 16)) * 0.15;
        if (s > bs) { bs = s; best = c; }
      }
    }
    return best;
  }

  // ─── disparos inimigos ────────────────────────────────────────────────
  muzzleLocal(e, out) {
    const t = this.ctx.time.world;
    const m = e.rig.muzzle || e.rig.eye;
    e.root.updateMatrixWorld(true);
    // deslocamento boca − raiz no espaço de render (mesmo frame), girado para o local do âncora
    const off = m.getWorldPosition(out).sub(e.root.getWorldPosition(_w));
    A.dirToLocal(e.anchor, off, off, t);
    return off.add(e.pos);
  }
  enemyFire(e, P, dist) {
    const target = P.clone().addScaledVector(A.up(e.anchor, P, _w), 1.15);
    const from = this.muzzleLocal(e, new THREE.Vector3());
    const dir = target.sub(from).normalize();
    const ctrl = this.foot.ctrl;
    const err = e.S.spread + dist * 0.0005 + Math.min(1, ctrl.speed / 6) * 0.025 + e.suppress * 0.03 + (ctrl.crouching ? 0.01 : 0);
    const jit = new THREE.Vector3().randomDirection().multiplyScalar(err);
    dir.add(jit).normalize();
    const look = LOOKS[e.faction] || LOOKS.hegemonia;
    this.foot.projectiles.spawn({
      anchor: e.anchor, pos: from, dir, speed: e.kind === 'heavy' ? 130 : 160, damage: e.S.dmg, owner: e, color: look.bolt, width: 0.08, len: 2.6, intensity: 10, life: 1.4, kind: 'enemy',
    });
    // clarão na boca
    const w = A.toWorld(e.anchor, from, new THREE.Vector3(), this.ctx.time.world);
    try { this.ctx.services.rendering?.particles?.glow(w, 0.5, [look.bolt[0] * 10, look.bolt[1] * 10, look.bolt[2] * 10], 0.07, A.velAt(e.anchor, from, new THREE.Vector3(), this.ctx.time.world)); } catch { /* */ }
    this.ctx.bus.emit('foot:enemyFire', { faction: e.faction, pos: w });
  }
  enemyGrenade(e, P) {
    this.grenadeT = 9 + Math.random() * 6;
    const from = e.eye(new THREE.Vector3());
    const up = A.up(e.anchor, from, new THREE.Vector3());
    const to = P.clone().sub(from);
    const g = e.anchor.body?.gravity || 9.2;
    const flat = to.clone().addScaledVector(up, -to.dot(up));
    const d = flat.length();
    const T = Math.max(1.0, d / 14);
    const v = flat.divideScalar(T).addScaledVector(up, (to.dot(up) + 0.5 * g * T * T) / T);
    const mesh = this.foot.vm?.grenade?.clone?.(true);
    if (mesh) mesh.visible = true;
    this.foot.projectiles.throwGrenade({ anchor: e.anchor, pos: from, vel: v, owner: e, damage: 60, radius: 6.5, fuse: T + 0.8, mesh });
  }
  canGrenade() { return this.grenadeT <= 0; }

  sentinelBeam(e, P) {
    const from = e.center(new THREE.Vector3()).addScaledVector(e.fwd, 0.55);
    const target = P.clone().addScaledVector(A.up(e.anchor, P, _w), 1.1);
    const ctrl = this.foot.ctrl;
    const dir = target.sub(from).normalize().add(new THREE.Vector3().randomDirection().multiplyScalar(0.012 + Math.min(1, ctrl.speed / 6) * 0.03)).normalize();
    this.foot.projectiles.hitscan({ anchor: e.anchor, pos: from, dir, damage: e.S.dmg, owner: e, color: [0.45, 0.8, 1.0], width: 0.12, intensity: 70, range: 200 });
    this.ctx.bus.emit('shake', { amount: 0.08, duration: 0.25 });
  }
  aimLaser(e) {
    const ctx = this.ctx, self = this;
    return this.foot.beams.add({
      width: 0.012, color: [0.5, 0.85, 1.0], intensity: 10, life: 0, style: 1,
      get: (a, b) => {
        const t = ctx.time.world;
        const from = e.center(new THREE.Vector3()).addScaledVector(e.fwd, 0.55);
        const to = self.playerPos.clone().addScaledVector(A.up(e.anchor, self.playerPos, _w), 1.1);
        A.toWorld(e.anchor, from, a, t); A.toWorld(e.anchor, to, b, t);
        return e.alive;
      },
    });
  }

  raiseAlarm(e) {
    this.alarm = true;
    for (const o of this.enemies) if (o.alive && o !== e && o.anchor.body === e.anchor.body && o.pos.distanceTo(e.pos) < 70) { o.aware = Math.max(o.aware, 0.85); if (o.state === 'idle') o.state = 'alert'; }
    this.ctx.bus.emit('music', { mood: 'combat', intensity: 0.8 });
  }
  /** Sentinela desperta: as vizinhas também, e a primeira vez fala (o mistério). */
  wake(e) {
    e.state = 'combat'; e.aware = 1;
    for (const o of this.enemies) if (o !== e && o.state === 'dormant' && o.pos.distanceTo(e.pos) < 60) { o.state = 'combat'; o.aware = 1; }
    if (!this.wokeOnce && !this.ctx.shot) {
      this.wokeOnce = true;
      this.ctx.bus.emit('radio', { faction: 'vigilantes', speaker: '???', text: '…ESTRUTURA VIOLADA. CONTAGEM DE GUARDIÕES: INSUFICIENTE. INICIANDO PROTOCOLO DE VIGÍLIA.', priority: 2 });
    }
    this.ctx.bus.emit('music', { mood: 'tension', intensity: 0.9 });
  }
  bark(e, kind) {
    if (this.barkT > 0 || this.ctx.shot) return;
    const B = BARKS_OF(e.faction); if (!B?.[kind]) return;
    this.barkT = 5 + Math.random() * 4;
    const text = B[kind][Math.floor(Math.random() * B[kind].length)];
    const speaker = e.faction === 'hegemonia' ? `SOLDADO HEG-${(hashStr(String(e.root.id)) % 90) + 10}` : e.faction === 'corsarios' ? 'CORSÁRIO' : 'COMBATENTE';
    this.ctx.bus.emit('radio', { faction: e.faction, speaker, text, priority: 1, channel: 'local' });
  }
  onDeath(e, info) {
    const others = this.enemies.filter((o) => o.alive && o.anchor.body === e.anchor.body && o.pos.distanceTo(e.pos) < 50);
    if (others.length) this.bark(others[0], 'down');
    this.ctx.bus.emit('foot:kill', { faction: e.faction, kind: e.kind, byPlayer: info?.owner === 'player' });
    if (info?.owner === 'player') {
      this.foot.onKill?.(e);
      if (e.kind === 'sentinel') {
        blast(this.ctx, e.anchor, e.center(new THREE.Vector3()), 2.6, 'energy');
      }
    }
    if (!others.length) {
      this.alarm = false;
      if (e.squad && !this.cleared.has(e.squad.id)) { this.cleared.add(e.squad.id); if (!this.ctx.shot) this.ctx.bus.emit('notify', { text: e.faction === 'vigilantes' ? 'SENTINELAS DESATIVADAS' : 'ÁREA LIMPA', kind: 'reward' }); }
      this.ctx.bus.emit('music', { mood: 'explore', intensity: 0.4 });
    }
  }

  // ─── depósitos minerais (laser de mineração) ──────────────────────────
  ensureDeposits(body, playerLocal) {
    const R = body.radius;
    const up = playerLocal.clone().normalize();
    const cell = 160;
    const t1 = new THREE.Vector3(0, 1, 0).cross(up); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
    const key0 = (v) => `${Math.round(v.x * R / cell)}:${Math.round(v.y * R / cell)}:${Math.round(v.z * R / cell)}`;
    const k = body.id + '|' + key0(up);
    if (this.depositCells.has(k)) return;
    this.depositCells.set(k, true);
    const r = rng(hashStr(k));
    const pl = this.ctx.services.planets;
    const kinds = RES[body.type] || ['cristal'];
    const n = 2 + Math.floor(r() * 3);
    const t2 = new THREE.Vector3().crossVectors(up, t1);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = 15 + r() * 120;
      const d = up.clone().multiplyScalar(R).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).normalize();
      if (pl?.view?.(body)?.terrain?.hasSea && pl.heightAtLocal(body, d) < 1) continue;
      const local = pl?.placeOnSurface ? pl.placeOnSurface(body, d, -0.2) : d.multiplyScalar(R);
      const kind = kinds[Math.floor(r() * kinds.length)];
      this.addDeposit(body, local, kind, r);
    }
    // limpa depósitos distantes
    for (let i = this.deposits.length - 1; i >= 0; i--) {
      const D = this.deposits[i];
      if (D.body !== body || D.local.distanceTo(playerLocal) > 900) { D.entry?.remove(); this.deposits.splice(i, 1); }
    }
  }

  /** Cria um depósito minerável num ponto local do corpo. */
  addDeposit(body, local, kind, r = Math.random) {
    const d = local.clone().normalize();
    const dep = buildDeposit(kind, r, { lite: this.ctx.quality.name === 'mobile' });
    const qL = quatFromFwdUp(anyPerp(d), d, new THREE.Quaternion());
    const D = { kind, local: local.clone(), body, radius: 1.2, hp: 3, dead: false, group: dep.group, qL, mat: dep.mat, heat: 0, hardness: 2.2, yieldPer: 4 + Math.floor(r() * 4) };
    D.worldPos = (out) => body.localToWorld(D.local.clone().addScaledVector(d, 0.6), this.ctx.time.world, out);
    D.entry = this.ctx.world.add(dep.group, new THREE.Vector3(), { getPos: (out) => body.localToWorld(D.local, this.ctx.time.world, out) });
    this.deposits.push(D);
    return D;
  }

  // ─── passo ────────────────────────────────────────────────────────────
  update(dt, playerAnchor, playerLocal, playerEyeLocal, alive) {
    const t = this.ctx.time.world;
    this.syncFrames(t);
    this.barkT -= dt; this.grenadeT -= dt;
    this.playerAlive = alive;
    let lastA = null;
    for (const e of this.enemies) {
      if (e.anchor !== lastA) {
        lastA = e.anchor;
        if (playerAnchor && sameAnchor(e.anchor, playerAnchor)) { this.playerPos.copy(playerLocal); this.playerEye.copy(playerEyeLocal); }
        else {
          const pw = this.foot.ctrl.worldPos, ew = this.foot.eyeWorld;
          A.toLocal(e.anchor, pw, this.playerPos, t); A.toLocal(e.anchor, ew, this.playerEye, t);
        }
        this.lastAnchor = e.anchor;
      }
      try { e.update(dt); } catch (err) { this.ctx.errors.push('foot inimigo: ' + (err.stack || err)); this.removeEnemy(e); break; }
    }
    // remove mortos antigos e longe
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (!e.alive && e.deadT > 40) this.removeEnemy(e); }
    // sincroniza a orientação dos acampamentos e o calor dos depósitos
    for (const D of this.deposits) { D.heat = Math.max(0, (D.heat || 0) - dt * 0.6); }
  }
  frame(dt) {
    const t = this.ctx.time.world;
    for (const e of this.enemies) e.frame(dt);
    for (const C of this.camps) C.group.quaternion.copy(C.body.rotationAt(t, _q)).multiply(C.qL);
    for (const D of this.deposits) { D.group.quaternion.copy(D.body.rotationAt(t, _q)).multiply(D.qL); D.mat.userData.U.flash.value = D.heat * 0.6; }
  }
  targets() {
    const list = [...this.enemies.filter((e) => e.alive), this.playerTarget];
    // criaturas (sistema `life`): qualquer alvo com hitSegment/damage no mesmo referencial
    try { const extra = this.ctx.services.life?.targets?.(this.lastAnchor) || []; for (const x of extra) if (x && x.alive !== false && x.hitSegment && x.damage) list.push(x); } catch { /* */ }
    return list;
  }
}

function sameAnchor(a, b) { return a.kind === b.kind && (a.kind === 'body' ? a.body === b.body : a.kind === 'frame' ? a.frame === b.frame : true); }

const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
function segSegLocal(p0, p1, q0, q1) {
  const d1 = _s1.copy(p1).sub(p0), d2 = _s2.copy(q1).sub(q0), r = _s3.copy(p0).sub(q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2);
  const den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  let tt = e > 1e-9 ? (b * s + f) / e : 0;
  if (tt < 0) { tt = 0; s = a > 1e-9 ? Math.min(1, Math.max(0, -c / a)) : 0; } else if (tt > 1) { tt = 1; s = a > 1e-9 ? Math.min(1, Math.max(0, (b - c) / a)) : 0; }
  const cp = p0.clone().addScaledVector(d1, s), cq = q0.clone().addScaledVector(d2, tt);
  return { s, t: tt, d: cp.distanceTo(cq) };
}

const BARK_TABLE = {
  hegemonia: {
    spot: ['Contato! É o desertor — fogo à vontade!', 'Alvo confirmado: Paoli. Ninguém recua!', 'Visual no traidor! Cerquem pelo flanco!'],
    hurt: ['Fui atingido!', 'Preciso de cobertura!'], grenade: ['Granada!', 'Granada saindo!'], down: ['Homem abatido!', 'Perdemos o Seis!'],
  },
  corsarios: {
    spot: ['Olha só, carne fresca da Hegemonia!', 'Pega ele! O traje vale uma fortuna!', 'Ei! Esse aí não pagou o pedágio!'],
    hurt: ['Desgraçado!', 'Me acertou!'], grenade: ['Toma essa!', 'Presente pra você!'], down: ['Perdemos o Rato!', 'Caiu mais um!'],
  },
};
function BARKS_OF(f) { return BARK_TABLE[f]; }
void COLORS;
