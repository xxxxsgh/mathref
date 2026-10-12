/**
 * COMBATE — lasers e foguetes da nave do jogador, asteroides destrutíveis
 * com mineração, naves hostis com IA (perseguir, atacar, flanquear, fugir)
 * e explosões. Publica o serviço `combat` (contatos e alvo para o cockpit/HUD).
 *
 * Controles (voando): Mouse0 (`fire`) laser · Mouse2 (`aim`) ou R foguete
 * teleguiado no alvo. Piratas aparecem de vez em quando no espaço.
 *
 * Depende de `ship` (casco das naves de IA via kit, bocas dos canhões, dano).
 * Sem `ship` publicado, só os asteroides e efeitos funcionam.
 *
 * Presets: params.combat.scene = 'dogfight' (espaço) | 'escort' (atmosfera,
 * um caça hostil à frente sob fogo) — encenação determinística congelada.
 *
 * Eventos: combat:hit { kind, id }, combat:kill { id }, combat:mined
 * { resource, amount }, combat:alert { count }.
 */
import * as THREE from 'three';
import { AsteroidField } from './asteroids.js';
import { Beams, Explosions, Particles, Rockets, ShieldFlashes } from './fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const ORIGIN = new THREE.Vector3();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const LASER_PLAYER = new THREE.Color(0.25, 0.95, 1.0);
const LASER_HOSTILE = new THREE.Color(1.0, 0.18, 0.08);
const RESOURCES = ['ferrita', 'silicato', 'cobalto-ionizado'];

/** Quaternion com −Z para `dir` e +Y perto de `up`. */
function quatLook(dir, up, out = new THREE.Quaternion()) {
  _m.lookAt(ORIGIN, dir, up);
  return out.setFromRotationMatrix(_m);
}

class Hostile {
  constructor(id, view) {
    this.id = id;
    this.view = view;
    this.worldPos = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.hp = 1;
    this.shield = 1;
    this.alive = true;
    this.state = 'pursue';
    this.stateT = 0;
    this.fireCd = 1 + Math.random() * 2;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.roll = 0;
    this.radius = 9;
    this.name = 'PIRATA';
  }
}

export default {
  name: 'combat',
  order: 45,

  init(ctx) {
    this.ctx = ctx;
    const lvl = ctx.quality?.level || 'high';
    this.ast = new AsteroidField(ctx, { count: 90, detailNear: lvl === 'low' ? 3 : 4, detailFar: 1 });
    ctx.scene.add(this.ast.group);
    this.beams = new Beams(48);
    this.explosions = new Explosions(12);
    this.sparks = new Particles(lvl === 'low' ? 300 : 700, true);
    this.smoke = new Particles(lvl === 'low' ? 200 : 450, false);
    this.rockets = new Rockets(16);
    this.shields = new ShieldFlashes(8);
    for (const o of [this.beams.mesh, this.explosions.group, this.sparks.points, this.smoke.points, this.rockets.group, this.shields.mesh]) ctx.scene.add(o);
    this.hostiles = [];
    this.target = null;
    this.fireCd = 0;
    this.muzzleIdx = 0;
    this.spawnT = 40 + Math.random() * 60;
    this.nextId = 1;
    this.muzzles = [];
    if (ctx.input?.bindings && !ctx.input.bindings.rocket) ctx.input.bindings.rocket = ['KeyR'];
    this.stage = ctx.shot?.preset?.params?.combat?.scene || null;
    this.stagedKey = '';
    this.publish();
  },

  publish() {
    const self = this;
    const api = {
      /** contatos para radar: [{ kind, worldPos, id }] */
      get contacts() {
        return self.contacts();
      },
      /** alvo atual: { worldPos, name, hp, radius, lead } | null */
      get target() {
        return self.targetInfo();
      },
      get hostiles() {
        return self.hostiles.filter((h) => h.alive);
      },
      get asteroids() {
        return self.ast;
      },
      spawnPirates: (n = 3) => self.spawnPirates(n),
      explode: (pos, size) => self.explode(pos, size),
      fireLaser: () => self.firePlayerLaser(),
      fireRocket: () => self.fireRocket(),
    };
    this.api = this.ctx.provide('combat', api);
  },

  contacts() {
    const out = [];
    for (const h of this.hostiles) if (h.alive) out.push({ kind: 'hostile', worldPos: h.worldPos, id: h.id });
    if (this.ast.anchor) {
      const p = this.ctx.player.worldPos;
      const list = [];
      for (const r of this.ast.rocks) {
        if (!r.alive || r.size < 12) continue;
        const w = this.ast.worldOf(r);
        const d = w.distanceTo(p);
        if (d < 2500) list.push({ d, c: { kind: 'asteroid', worldPos: w, id: `a${r.id}` } });
      }
      list.sort((a, b) => a.d - b.d);
      for (const e of list.slice(0, 16)) out.push(e.c);
    }
    return out;
  },

  targetInfo() {
    const h = this.target;
    if (!h || !h.alive) return null;
    const p = this.ctx.player;
    const dist = h.worldPos.distanceTo(p.worldPos);
    const lead = h.worldPos.clone().addScaledVector(h.velocity, dist / 3000);
    return { worldPos: h.worldPos, name: h.name, hp: h.hp, radius: h.radius, lead, distance: dist };
  },

  // ───────────────────────────────────────────────────────── criação
  makeHostile(seed) {
    const kit = this.ctx.services.ship?.kit;
    const view = kit?.createHull ? kit.createHull('hostile', seed) : null;
    const h = new Hostile(this.nextId++, view);
    if (view) {
      view.setGear(0);
      this.ctx.scene.add(view.group);
      view.plumes.update(0, 0.8, 0);
    }
    this.hostiles.push(h);
    return h;
  },

  spawnPirates(n = 3) {
    const p = this.ctx.player;
    const fwd = _v.set(0, 0, -1).applyQuaternion(p.quaternion);
    for (let i = 0; i < n; i++) {
      const h = this.makeHostile(500 + this.nextId);
      const off = new THREE.Vector3((Math.random() - 0.5) * 1600, (Math.random() - 0.5) * 600, (Math.random() - 0.5) * 1600).addScaledVector(fwd, 1800);
      h.worldPos.copy(p.worldPos).add(off);
      quatLook(off.clone().negate().normalize(), p.up, h.quaternion);
      h.velocity.set(0, 0, -400).applyQuaternion(h.quaternion);
    }
    this.ctx.bus.emit('combat:alert', { count: n });
    this.ctx.services.audio?.play?.('alert');
  },

  removeHostile(h) {
    if (h.view) this.ctx.scene.remove(h.view.group);
    this.hostiles = this.hostiles.filter((x) => x !== h);
    if (this.target === h) this.target = null;
  },

  explode(pos, size = 12, { age = 0, sparks = 1 } = {}) {
    this.explosions.add(pos, size, { age, life: 1.4 + size * 0.02 });
    const n = Math.round(clamp(size * 3, 12, 70) * sparks);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      this.sparks.emit(pos, d.multiplyScalar(size * (3 + Math.random() * 6)), [6, 2.6 + Math.random() * 2, 0.8], 0.6 + Math.random() * 1.4, 0.25 + Math.random() * size * 0.04, 0.6);
    }
    for (let i = 0; i < Math.round(n * 0.4); i++) {
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      this.smoke.emit(pos.clone().addScaledVector(d, size * 0.3), d.multiplyScalar(size * (0.6 + Math.random())), [0.08, 0.075, 0.07], 2.5 + Math.random() * 2, size * 0.35, 0.8, 1.6);
    }
    this.ctx.services.audio?.play?.('explosion', pos, { volume: clamp(size / 20, 0.3, 1) });
  },

  // ───────────────────────────────────────────────────────── armas
  firePlayerLaser() {
    const ctx = this.ctx;
    const ship = ctx.services.ship;
    const p = ctx.player;
    if (!ship?.muzzles) return;
    const mz = ship.muzzles(this.muzzles);
    const from = mz[this.muzzleIdx++ % mz.length];
    const dir = _v.set(0, 0, -1).applyQuaternion(p.quaternion);
    // assistência de mira: puxa para o ponto de interceptação do alvo
    const ti = this.targetInfo();
    if (ti && ti.distance < 1500) {
      const want = _v2.copy(ti.lead).sub(from).normalize();
      if (want.dot(dir) > Math.cos(0.12)) dir.copy(want);
    }
    const range = 1600;
    let hit = null;
    const ar = this.ast.raycast(from, dir, range);
    if (ar) hit = { kind: 'asteroid', t: ar.t, rock: ar.rock };
    for (const h of this.hostiles) {
      if (!h.alive) continue;
      const oc = _v2.copy(from).sub(h.worldPos);
      const b = oc.dot(dir);
      const c = oc.lengthSq() - h.radius * h.radius;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < range && (!hit || t < hit.t)) hit = { kind: 'hostile', t, h };
    }
    const end = from.clone().addScaledVector(dir, hit ? hit.t : range);
    this.beams.add(from, end, LASER_PLAYER, 0.32, 0.08);
    ctx.services.audio?.play?.('laser', from, { volume: 0.4 });
    if (!hit) return;
    if (hit.kind === 'asteroid') this.hitRock(hit.rock, end, dir, 6);
    else this.hitHostile(hit.h, end, dir, 0.06);
  },

  hitRock(rock, at, dir, dmg) {
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).addScaledVector(dir, -1.5).normalize();
      this.sparks.emit(at, d.multiplyScalar(15 + Math.random() * 30), [5, 2.2, 0.6], 0.3 + Math.random() * 0.4, 0.18, 1.5);
    }
    this.smoke.emit(at, dir.clone().multiplyScalar(-4), [0.25, 0.22, 0.2], 1.2, rock.size * 0.08 + 0.8, 0.6, 2);
    if (this.ast.damage(rock, dmg)) {
      const w = this.ast.worldOf(rock);
      this.explode(w, rock.size * 0.9, { sparks: 0.8 });
      const amount = Math.max(1, Math.round(rock.size * 1.5));
      const resource = RESOURCES[rock.shape % RESOURCES.length];
      this.ctx.services.gameplay?.inventory?.add?.(resource, amount);
      this.ctx.bus.emit('combat:mined', { resource, amount, worldPos: w });
    }
    this.ctx.bus.emit('combat:hit', { kind: 'asteroid', id: rock.id });
  },

  hitHostile(h, at, dir, dmg) {
    const local = _v2.copy(at).sub(h.worldPos).applyQuaternion(_q.copy(h.quaternion).invert()).normalize();
    if (h.shield > 0) {
      h.shield = Math.max(0, h.shield - dmg * 1.6);
      this.shields.add(h, h.radius * 1.15, local, new THREE.Color(1.0, 0.4, 0.25));
    } else {
      h.hp -= dmg;
      for (let i = 0; i < 5; i++) {
        const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        this.sparks.emit(at, d.multiplyScalar(20 + Math.random() * 25), [6, 3, 1], 0.4, 0.2, 1);
      }
    }
    if (h.hp < 0.35 && h.state !== 'flee') {
      h.state = 'flee';
      h.stateT = 0;
    }
    this.ctx.bus.emit('combat:hit', { kind: 'hostile', id: h.id });
    if (h.hp <= 0 && h.alive) {
      h.alive = false;
      this.explode(h.worldPos, 22);
      this.removeHostile(h);
      this.ctx.bus.emit('combat:kill', { id: h.id });
    }
  },

  fireRocket() {
    const ctx = this.ctx;
    const ship = ctx.services.ship;
    const p = ctx.player;
    const pods = ship?.points?.rocketPods;
    if (!pods) return;
    const pod = pods[(this.podIdx = ((this.podIdx || 0) + 1) % pods.length)];
    const from = new THREE.Vector3().copy(p.worldPos).add(_v.copy(pod).applyQuaternion(p.quaternion));
    const vel = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion).multiplyScalar(p.velocity.length() + 120);
    this.rockets.add(from, vel, this.target);
    ctx.services.audio?.play?.('rocket', from);
  },

  // ───────────────────────────────────────────────────────── passo
  update(dt, ctx) {
    const p = ctx.player;
    if (p.frozen) return;
    const flying = p.mode !== 'walk';
    const inSpace = p.mode === 'space';
    // campo de asteroides em volta do jogador no espaço
    if (inSpace) {
      const far = !this.ast.anchor || this.ast.anchor.distanceTo(p.worldPos) > 5000;
      if (far) {
        const fwd = _v.set(0, 0, -1).applyQuaternion(p.quaternion);
        const anchor = new THREE.Vector3().copy(p.worldPos).addScaledVector(fwd, 1200);
        const seed = (Math.floor(anchor.x / 5000) * 73856093) ^ (Math.floor(anchor.y / 5000) * 19349663) ^ (Math.floor(anchor.z / 5000) * 83492791);
        this.ast.generate(anchor, { seed, radius: 2200, count: 200, clear: [{ pos: p.worldPos.clone().sub(anchor), r: 150 }] });
      }
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.hostiles.length === 0) {
        this.spawnPirates(2 + Math.floor(Math.random() * 2));
        this.spawnT = 120 + Math.random() * 120;
      }
    } else if (this.ast.anchor && (ctx.services.ship?.air ?? 1) > 0.01) this.ast.clear();

    // armas do jogador
    this.fireCd -= dt;
    if (flying && p.moveEnabled && ctx.services.ship?.state !== 'landed') {
      if (ctx.input.action('fire') && this.fireCd <= 0) {
        this.firePlayerLaser();
        this.fireCd = 0.09;
      }
      if (ctx.input.pressed('rocket') || ctx.input.pressed('aim')) this.fireRocket();
    }
    // alvo: hostil mais alinhado com o nariz
    const fwd = _v.set(0, 0, -1).applyQuaternion(p.quaternion);
    let best = null;
    let bestScore = -Infinity;
    for (const h of this.hostiles) {
      if (!h.alive) continue;
      const to = _v2.copy(h.worldPos).sub(p.worldPos);
      const d = to.length();
      const score = to.normalize().dot(fwd) * 2 - d / 3000;
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    this.target = best;

    // foguetes
    for (const r of this.rockets.list) {
      r.t += dt;
      if (r.target?.alive) {
        const want = _v2.copy(r.target.worldPos).sub(r.pos).normalize();
        const sp = Math.min(900, r.vel.length() + 600 * dt);
        r.vel.lerp(want.multiplyScalar(sp), 1 - Math.exp(-dt * 3));
        if (r.pos.distanceTo(r.target.worldPos) < r.target.radius + 2) {
          r.t = r.life;
          this.hitHostile(r.target, r.pos, r.vel.clone().normalize(), 0.45);
          if (r.target.alive) r.target.shield = 0;
        }
      } else r.vel.multiplyScalar(1 + dt * 0.8);
      r.pos.addScaledVector(r.vel, dt);
      r.smokeAcc += dt;
      while (r.smokeAcc > 0.02) {
        r.smokeAcc -= 0.02;
        this.smoke.emit(r.pos, _v2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3), [0.55, 0.53, 0.5], 1.6, 1.0, 1.2, 2.5);
      }
      if (r.t >= r.life) this.explode(r.pos, 8, { sparks: 0.5 });
    }
    this.rockets.list = this.rockets.list.filter((r) => r.t < r.life);

    // IA
    for (const h of this.hostiles) if (h.alive) this.think(h, dt, p, ctx);
    for (const h of [...this.hostiles]) {
      if (h.alive && h.worldPos.distanceTo(p.worldPos) > 9000) this.removeHostile(h);
    }
    if (!inSpace && p.mode === 'walk') for (const h of [...this.hostiles]) this.removeHostile(h);
  },

  /** IA: perseguir → atacar → flanquear; fugir com pouca vida. */
  think(h, dt, p, ctx) {
    h.stateT += dt;
    const to = _v.copy(p.worldPos).sub(h.worldPos);
    const dist = to.length();
    const toN = to.clone().normalize();
    let want;
    let speed;
    if (h.state === 'flee') {
      want = toN.clone().negate().add(new THREE.Vector3(0, 0.3, 0).applyQuaternion(h.quaternion)).normalize();
      speed = 950;
      if (h.shield < 1) h.shield = Math.min(1, h.shield + dt * 0.1);
      if (h.stateT > 8 && h.hp > 0.2) {
        h.state = 'pursue';
        h.stateT = 0;
      }
    } else {
      if (h.state === 'pursue' && dist < 900) {
        h.state = 'attack';
        h.stateT = 0;
      } else if (h.state === 'attack' && (h.stateT > 5 || dist < 140)) {
        h.state = 'flank';
        h.stateT = 0;
        h.side = -h.side;
      } else if (h.state === 'flank' && h.stateT > 3.5) {
        h.state = dist > 900 ? 'pursue' : 'attack';
        h.stateT = 0;
      }
      const lead = _v2.copy(p.worldPos).addScaledVector(p.velocity, dist / 900).sub(h.worldPos).normalize();
      if (h.state === 'flank') {
        const side = new THREE.Vector3().crossVectors(toN, p.up).normalize().multiplyScalar(h.side);
        want = side.addScaledVector(toN, 0.25).normalize();
        speed = 620;
      } else {
        want = lead.clone();
        speed = h.state === 'pursue' ? 720 : clamp(dist * 0.9, 220, 480);
      }
    }
    // direção: gira com taxa limitada e inclina na curva
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(h.quaternion);
    const ang = Math.acos(clamp(fwd.dot(want), -1, 1));
    const maxTurn = 1.25 * dt;
    const k = ang > 1e-4 ? Math.min(1, maxTurn / ang) : 1;
    const newFwd = fwd.clone().lerp(want, k).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(h.quaternion);
    const turn = clamp(-want.dot(right) * 2, -1, 1);
    h.roll += (turn * 1.1 - h.roll) * (1 - Math.exp(-dt * 3));
    const upRef = new THREE.Vector3(0, 1, 0).applyQuaternion(h.quaternion).lerp(p.up, 0.02).normalize();
    quatLook(newFwd, upRef, h.quaternion);
    h.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), h.roll * dt * 2));
    h.velocity.lerp(newFwd.clone().multiplyScalar(speed), 1 - Math.exp(-dt * 1.5));
    h.worldPos.addScaledVector(h.velocity, dt);
    // tiro: alinhado e no alcance
    h.fireCd -= dt;
    if (h.state === 'attack' && dist < 1100 && fwd.dot(toN) > Math.cos(0.1) && h.fireCd <= 0) {
      h.fireCd = 0.35 + Math.random() * 0.4;
      const from = h.worldPos.clone().addScaledVector(fwd, 7);
      const miss = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(dist * 0.02);
      const end = p.worldPos.clone().add(miss);
      this.beams.add(from, end, LASER_HOSTILE, 0.4, 0.1);
      if (miss.length() < 9) ctx.services.ship?.damage?.(0.04);
    }
  },

  // ───────────────────────────────────────────────────────── encenação (shot)
  stageScene(ctx) {
    const p = ctx.player;
    const key = `${p.worldPos.x.toFixed(2)},${p.worldPos.y.toFixed(2)},${p.worldPos.z.toFixed(2)}`;
    if (key === this.stagedKey) return;
    this.stagedKey = key;
    for (const h of [...this.hostiles]) this.removeHostile(h);
    this.beams.list = [];
    this.explosions.list = [];
    this.sparks.p = [];
    this.smoke.p = [];
    this.rockets.list = [];
    this.shields.list = [];
    const q = p.quaternion;
    const F = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const U = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const R = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const P0 = new THREE.Vector3().copy(p.worldPos);
    const at = (f, r, u) => P0.clone().addScaledVector(F, f).addScaledVector(R, r).addScaledVector(U, u);
    const ship = ctx.services.ship;
    const muzzles = ship?.muzzles ? ship.muzzles([]).map((m) => new THREE.Vector3().copy(m)) : [at(6, 1.4, -0.6), at(6, -1.4, -0.6)];
    const look = (h, dir, upv = U, roll = 0) => {
      quatLook(dir.clone().normalize(), upv, h.quaternion);
      if (roll) h.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
      h.velocity.copy(dir).normalize().multiplyScalar(450);
    };
    if (this.stage === 'dogfight') {
      // asteroides: campo denso com rochas grandes na composição
      const extra = [
        { pos: F.clone().multiplyScalar(260).addScaledVector(R, -150).addScaledVector(U, 40), size: 46, shape: 0 },
        { pos: F.clone().multiplyScalar(520).addScaledVector(R, 260).addScaledVector(U, -90), size: 95, shape: 1 },
        { pos: F.clone().multiplyScalar(140).addScaledVector(R, 95).addScaledVector(U, -38), size: 18, shape: 2 },
        { pos: F.clone().multiplyScalar(90).addScaledVector(R, -60).addScaledVector(U, -22), size: 9, shape: 1 },
        { pos: F.clone().multiplyScalar(700).addScaledVector(R, -420).addScaledVector(U, 160), size: 120, shape: 2 },
        { pos: F.clone().multiplyScalar(-30).addScaledVector(R, -55).addScaledVector(U, 18), size: 6, shape: 0 },
        { pos: F.clone().multiplyScalar(330).addScaledVector(R, 40).addScaledVector(U, 95), size: 28, shape: 0 },
      ];
      const clear = [
        { pos: new THREE.Vector3(), r: 70 },
        { pos: F.clone().multiplyScalar(210).addScaledVector(R, 30).addScaledVector(U, 14), r: 40 },
        { pos: F.clone().multiplyScalar(110), r: 50 },
      ];
      this.ast.generate(P0.clone(), { seed: 4242, radius: 1600, count: 230, clear, extra, debris: 420 });
      // hostil A: à frente, cruzando, sob fogo (escudo piscando)
      const A = this.makeHostile(611);
      A.worldPos.copy(at(210, 30, 14));
      look(A, R.clone().multiplyScalar(-1).addScaledVector(F, -0.35).addScaledVector(U, 0.1), U, 0.5);
      A.shield = 0.4;
      A.hp = 0.7;
      // hostil B: longe à esquerda, inclinado, atirando de volta
      const B = this.makeHostile(733);
      B.worldPos.copy(at(470, -150, 70));
      look(B, P0.clone().sub(B.worldPos).addScaledVector(R, 80), U, -0.7);
      // hostil C: distante, fugindo
      const C = this.makeHostile(857);
      C.worldPos.copy(at(820, 190, 30));
      look(C, F.clone().addScaledVector(R, 0.6), U, 0.4);
      // lasers do jogador convergindo em A
      const hitA = A.worldPos.clone().addScaledVector(F, -6).addScaledVector(R, -2);
      for (const m of muzzles) this.beams.add(m, hitA, LASER_PLAYER, 0.32, 1e9);
      // rajada anterior a meio caminho
      const half = muzzles[0].clone().lerp(hitA, 0.55);
      this.beams.add(half, half.clone().lerp(hitA, 0.5), LASER_PLAYER, 0.3, 1e9);
      this.shields.add(A, A.radius * 1.2, new THREE.Vector3(0, 0.1, 1).normalize(), new THREE.Color(1.0, 0.45, 0.25), 1e9, 0.05);
      for (let i = 0; i < 26; i++) {
        const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).addScaledVector(F, -1).normalize();
        this.sparks.emit(hitA, d.multiplyScalar(30 + Math.random() * 40), [6, 2.8, 0.9], 0.8 + Math.random(), 0.22, 1);
      }
      // B atira: dois feixes vermelhos passando perto
      const fromB = B.worldPos.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(B.quaternion), 8);
      this.beams.add(fromB, at(-20, 14, 9), LASER_HOSTILE, 0.42, 1e9);
      this.beams.add(fromB.clone().addScaledVector(R, 3), at(40, 26, -6), LASER_HOSTILE, 0.42, 1e9);
      // explosão de um terceiro pirata
      const ex = at(340, -70, -10);
      this.explosions.add(ex, 26, { fixedK: 0.22 });
      for (let i = 0; i < 90; i++) {
        const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        this.sparks.emit(ex, d.multiplyScalar(60 + Math.random() * 120), [6, 2.4 + Math.random() * 2, 0.7], 2.5, 0.3 + Math.random() * 0.8, 0.5);
      }
      for (let i = 0; i < 26; i++) {
        const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        this.smoke.emit(ex.clone().addScaledVector(d, 8), d.multiplyScalar(14 + Math.random() * 10), [0.09, 0.08, 0.075], 4, 9, 0.6, 1.2);
      }
      // foguete a caminho de A com rastro
      const rs = new THREE.Vector3().copy(p.worldPos).add(new THREE.Vector3(4.6, -0.55, 1.6).applyQuaternion(q));
      const rp = rs.clone().lerp(A.worldPos, 0.42).addScaledVector(U, 6);
      this.rockets.add(rp, A.worldPos.clone().sub(rp).normalize().multiplyScalar(500), A);
      for (let i = 0; i < 40; i++) {
        const t = i / 40;
        const sp = rs.clone().lerp(rp, t).addScaledVector(U, Math.sin(t * Math.PI) * 4);
        this.smoke.emit(sp, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2), [0.6, 0.58, 0.55], 2.0, 0.8 + t * 0.4, 1, 2);
        this.smoke.p[this.smoke.p.length - 1].t = (1 - t) * 1.4;
      }
      this.target = A;
    } else if (this.stage === 'escort') {
      const A = this.makeHostile(611);
      A.worldPos.copy(at(150, 18, 9));
      look(A, F.clone().addScaledVector(R, 0.5).addScaledVector(U, 0.12), U, -0.55);
      A.shield = 0.6;
      const hitA = A.worldPos.clone().addScaledVector(F, -5);
      for (const m of muzzles) this.beams.add(m, hitA, LASER_PLAYER, 0.26, 1e9);
      this.shields.add(A, A.radius * 1.2, new THREE.Vector3(0, 0, 1), new THREE.Color(1.0, 0.45, 0.25), 1e9, 0.05);
      for (let i = 0; i < 18; i++) {
        const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).addScaledVector(F, -1).normalize();
        this.sparks.emit(hitA, d.multiplyScalar(20 + Math.random() * 30), [6, 2.8, 0.9], 0.8 + Math.random(), 0.16, 1);
      }
      const B = this.makeHostile(733);
      B.worldPos.copy(at(420, -160, 70));
      look(B, R.clone().addScaledVector(F, -0.3), U, 0.6);
      this.target = A;
    }
    // avança partículas para um estado "desenvolvido"
    this.sparks.frame(0.12, ctx.space);
    this.smoke.frame(0.05, ctx.space);
  },

  frame(dt, ctx) {
    const p = ctx.player;
    const frozen = ctx.time.frozen;
    if (this.stage && p.frozen) this.stageScene(ctx);
    const fdt = frozen ? 0 : dt;
    // naves hostis
    for (const h of this.hostiles) {
      if (!h.view) continue;
      ctx.space.toRender(h.worldPos, h.view.group.position);
      h.view.group.quaternion.copy(h.quaternion);
      h.view.group.visible = h.alive;
      h.view.plumes.update((this.t = (this.t || 0) + fdt), h.state === 'flee' ? 1.1 : 0.8, ctx.services.ship?.air ?? 0);
    }
    this.ast.frame(fdt, ctx, p.cameraWorld);
    this.beams.frame(fdt, ctx.space);
    this.explosions.frame(fdt, ctx.space, p.cameraQuat);
    this.sparks.frame(fdt, ctx.space);
    this.smoke.frame(fdt, ctx.space);
    this.rockets.frame(ctx.space);
    this.shields.frame(fdt, ctx.space);
  },

  dispose(ctx) {
    for (const h of [...this.hostiles]) this.removeHostile(h);
    for (const o of [this.ast.group, this.beams.mesh, this.explosions.group, this.sparks.points, this.smoke.points, this.rockets.group, this.shields.mesh]) ctx.scene.remove(o);
  },
};
