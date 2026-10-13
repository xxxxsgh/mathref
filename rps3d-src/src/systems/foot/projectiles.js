// Projéteis de energia a pé (jogador e inimigos), granadas e impactos.
//
// Tudo vive no referencial do ÂNCORA do combate (local do planeta que gira,
// interior de nave/estação ou mundo): posições locais, convertidas para mundo
// só para colidir (ctx.collision) e desenhar. Alvos (inimigos, jogador)
// expõem hitSegment(p0, p1) no mesmo referencial local.
import * as THREE from 'three/webgpu';
import { COLORS } from './beams.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Conversões de um âncora {kind:'body'|'frame'|'world'}. */
export const A = {
  toWorld(an, l, out, t) {
    if (an.kind === 'body') return an.body.localToWorld(l, t, out);
    if (an.kind === 'frame') return out.copy(l).applyQuaternion(an.frame.quat).add(an.frame.pos);
    return out.copy(l);
  },
  toLocal(an, w, out, t) {
    if (an.kind === 'body') return an.body.worldToLocal(w, t, out);
    if (an.kind === 'frame') return out.copy(w).sub(an.frame.pos).applyQuaternion(_q.copy(an.frame.quat).invert());
    return out.copy(w);
  },
  dirToWorld(an, d, out, t) {
    if (an.kind === 'body') return an.body.dirToWorld(d, t, out);
    if (an.kind === 'frame') return out.copy(d).applyQuaternion(an.frame.quat);
    return out.copy(d);
  },
  dirToLocal(an, d, out, t) {
    if (an.kind === 'body') return an.body.dirToLocal(d, t, out);
    if (an.kind === 'frame') return out.copy(d).applyQuaternion(_q.copy(an.frame.quat).invert());
    return out.copy(d);
  },
  /** Velocidade de mundo de um ponto parado no âncora (rotação do planeta). */
  velAt(an, l, out, t) {
    if (an.kind !== 'body') return out.set(0, 0, 0);
    an.body.localToWorld(l, t, _a); an.body.localToWorld(l, t + 0.05, _b);
    return out.copy(_b).sub(_a).divideScalar(0.05);
  },
  up(an, l, out) {
    if (an.kind === 'body') return out.copy(l).normalize();
    if (an.kind === 'frame') return out.copy(an.up || new THREE.Vector3(0, 1, 0));
    return out.set(0, 1, 0);
  },
};

/**
 * Explosão em terra no referencial do âncora (a âncora das partículas anda
 * com o chão; as partículas NÃO herdam a velocidade do planeta). kind:
 * 'plasma' (granada de pulso), 'energy' (sentinela), 'rock' (mineração).
 */
export function blast(ctx, an, local, size = 4, kind = 'plasma') {
  const t = ctx.time.world;
  const R = ctx.services.rendering, P = R?.particles;
  const w = A.toWorld(an, local, new THREE.Vector3(), t);
  const vel = A.velAt(an, local, new THREE.Vector3(), t);
  const up = A.dirToWorld(an, A.up(an, local, new THREE.Vector3()), new THREE.Vector3(), t);
  ctx.bus.emit('shake', { amount: Math.min(0.6, size * 0.08), duration: 0.5 });
  ctx.bus.emit('foot:blast', { pos: w, size, kind });
  if (!P) { ctx.bus.emit('explosion', { pos: w, size, kind: 'ground' }); return; }
  const col = kind === 'energy' ? [3, 6, 12] : kind === 'rock' ? [6, 3.5, 1.4] : [9, 4.6, 1.6];
  const d = new THREE.Vector3();
  try {
    P.glow(w.clone().addScaledVector(up, size * 0.2), size * 2.2, [col[0] * 3, col[1] * 3, col[2] * 3], 0.18, vel);
    P.glow(w.clone().addScaledVector(up, size * 0.3), size * 1.2, col, 0.6, vel);
    // bola de fogo → fumaça
    P.emit('smoke', w, kind === 'rock' ? 6 : 14, (k, o) => {
      d.randomDirection().addScaledVector(up, 0.9).normalize();
      const sp = size * (0.4 + Math.random() * 0.9);
      o.x = d.x * size * 0.15; o.y = d.y * size * 0.15; o.z = d.z * size * 0.15;
      o.vx = d.x * sp; o.vy = d.y * sp; o.vz = d.z * sp;
      o.life = 2.5 + Math.random() * 3; o.s0 = size * (0.25 + Math.random() * 0.2); o.s1 = size * (0.9 + Math.random() * 0.8);
      o.drag = 1.6; o.g = -0.05;
      const grey = kind === 'rock' ? 0.22 : 0.08 + Math.random() * 0.05;
      o.a = grey; o.b = grey * 0.95; o.c = grey * 0.9;
      o.w = kind === 'rock' ? 0.2 : k < 7 ? 1.4 : 0.6; o.spin = (Math.random() - 0.5) * 0.6; o.delay = Math.random() * 0.12;
    }, { vel, ttl: 10 });
    // faíscas e brasas
    P.emit('spark', w, Math.round(18 + size * 6), (k, o) => {
      d.randomDirection(); if (d.dot(up) < 0) d.reflect(up);
      const sp = (6 + Math.random() * 16) * Math.min(1.6, size / 4);
      o.vx = d.x * sp; o.vy = d.y * sp; o.vz = d.z * sp;
      o.life = 0.4 + Math.random() * 1.1; o.s0 = 0.035; o.s1 = 0.012; o.drag = 1.2; o.g = 1;
      o.a = kind === 'energy' ? 1 : 0.85; o.b = kind === 'energy' ? 9 : 6; o.spin = 0.03; o.delay = Math.random() * 0.05;
    }, { vel, ttl: 4 });
    P.emit('glow', w, 10, (k, o) => {
      d.randomDirection().addScaledVector(up, 0.6).normalize();
      const sp = 2 + Math.random() * 5;
      o.vx = d.x * sp; o.vy = d.y * sp; o.vz = d.z * sp; o.life = 0.8 + Math.random() * 1.2; o.s0 = 0.12; o.s1 = 0.04; o.drag = 0.8; o.g = 0.6;
      o.a = col[0] * 0.4; o.b = col[1] * 0.4; o.c = col[2] * 0.4; o.w = 1.2;
    }, { vel, ttl: 4 });
    // poeira do chão (anel)
    P.emit('smoke', w, 10, (k, o) => {
      d.randomDirection(); d.addScaledVector(up, -d.dot(up)).normalize();
      const sp = size * (1.2 + Math.random());
      o.vx = d.x * sp + up.x; o.vy = d.y * sp + up.y; o.vz = d.z * sp + up.z;
      o.life = 3 + Math.random() * 3; o.s0 = size * 0.3; o.s1 = size * 1.4; o.drag = 1.4; o.g = -0.02;
      const dc = String(an.body?.type || '').startsWith('desert') ? [0.5, 0.36, 0.22] : an.body?.type === 'ice' ? [0.7, 0.75, 0.82] : [0.3, 0.28, 0.25];
      o.a = dc[0]; o.b = dc[1]; o.c = dc[2]; o.w = 0;
    }, { vel, ttl: 10 });
  } catch { /* */ }
  R.flash?.(kind === 'energy' ? '#a8d8ff' : '#ffc890', Math.min(0.25, size * 0.03));
}

export class Projectiles {
  constructor(ctx, beams) {
    this.ctx = ctx; this.beams = beams;
    this.list = [];
    this.grenades = [];
    this.targets = () => [];
    this.onPlayerHit = null;
    this.onImpact = null;
    this.grenadeMesh = null;
  }

  /**
   * o = { anchor, pos (local), dir (local unit), speed, damage, owner ('player'|ent),
   *       color, width, len, life, gravity, kind, headMul, pierce, radius }
   */
  spawn(o) {
    const p = {
      anchor: o.anchor, pos: o.pos.clone(), prev: o.pos.clone(), dir: o.dir.clone().normalize(), speed: o.speed || 300,
      damage: o.damage || 10, owner: o.owner || 'player', life: o.life ?? 1.6, t: 0, len: o.len || 2.5, kind: o.kind || 'bolt',
      headMul: o.headMul || 1.6, color: o.color || COLORS.blue, gravity: o.gravity || 0, faction: o.faction || null, weapon: o.weapon || null,
      dead: false, splash: o.splash || 0, start: o.pos.clone(),
    };
    p.vel = p.dir.clone().multiplyScalar(p.speed);
    const width = o.width || 0.05, intensity = o.intensity || 26;
    const ctx = this.ctx;
    p.beam = this.beams.add({
      width, color: p.color, intensity, life: 0, style: 0,
      get: (a, b) => {
        if (p.dead) return false;
        const t = ctx.time.world;
        // cauda limitada à distância percorrida (não sai de dentro da arma)
        const tail = Math.min(p.len, p.pos.distanceTo(p.start));
        A.toWorld(p.anchor, p.pos, b, t);
        A.toWorld(p.anchor, _d.copy(p.pos).addScaledVector(p.dir, -tail), a, t);
        return true;
      },
    });
    this.list.push(p);
    return p;
  }

  /** Raio instantâneo (trilho): aplica dano já e deixa um feixe que se dissipa. */
  hitscan(o) {
    const ctx = this.ctx, t = ctx.time.world;
    const an = o.anchor;
    const range = o.range || 1500;
    const p0 = o.pos.clone(), dir = o.dir.clone().normalize();
    const p1 = p0.clone().addScaledVector(dir, range);
    const hit = this.trace(an, p0, p1, o.owner);
    const end = hit ? hit.point : p1;
    const endL = end.clone();
    const startL = (o.visualFrom || p0).clone();
    // feixe principal + halo (no referencial do âncora)
    for (const [w, I, life, style] of [[o.width || 0.05, o.intensity || 60, 0.55, 2], [(o.width || 0.05) * 5, 3, 0.9, 1]]) {
      this.beams.add({ width: w, color: o.color || COLORS.violet, intensity: I, life, style, fade: 'shrink', get: (a, b) => { const tt = ctx.time.world; A.toWorld(an, startL, a, tt); A.toWorld(an, endL, b, tt); return true; } });
    }
    if (hit) this.applyHit(hit, { damage: o.damage, headMul: o.headMul || 2.5, owner: o.owner, dir, color: o.color || COLORS.violet, weapon: o.weapon, big: true, anchor: an });
    void t;
    return hit;
  }

  /** Segmento local p0→p1: primeiro acerto em alvos ou cenário. */
  trace(an, p0, p1, owner) {
    const ctx = this.ctx, t = ctx.time.world;
    const seg = _d.copy(p1).sub(p0);
    const L = seg.length();
    if (L < 1e-6) return null;
    let best = null;
    for (const tg of this.targets()) {
      if (!tg.alive || tg === owner || (owner === 'player' && tg.isPlayer) || (owner !== 'player' && tg.isEnemy && owner?.isEnemy && tg.faction === owner.faction)) continue;
      const h = tg.hitSegment(p0, p1);
      if (h && (!best || h.t < best.t)) best = { ...h, target: tg };
    }
    // cenário (formas + chão), em mundo
    const w0 = A.toWorld(an, p0, new THREE.Vector3(), t);
    const wd = A.dirToWorld(an, seg.clone().divideScalar(L), new THREE.Vector3(), t);
    const maxD = best ? best.t * L : L;
    const r = ctx.collision.raycast(w0, wd, maxD);
    if (r && r.dist <= maxD) {
      const pl = A.toLocal(an, r.point, new THREE.Vector3(), t);
      const nl = A.dirToLocal(an, r.normal, new THREE.Vector3(), t);
      return { t: r.dist / L, point: pl, normal: nl, world: true, material: r.material || r.tag, shape: r.shape };
    }
    if (best) best.point = best.point || p0.clone().addScaledVector(seg, best.t);
    return best;
  }

  applyHit(hit, info) {
    const ctx = this.ctx;
    if (hit.target) {
      const tg = hit.target;
      const dmg = info.damage * (hit.part === 'head' ? info.headMul || 1.6 : 1) * (info.falloff ?? 1);
      tg.damage(dmg, { part: hit.part, dir: info.dir, point: hit.point, owner: info.owner, weapon: info.weapon });
      if (info.owner === 'player' && tg.isEnemy) ctx.services.hud?.hitMarker?.(!tg.alive);
    }
    this.impact(info.anchor, hit.point, hit.normal || info.dir.clone().negate(), info.color, hit.target ? (hit.target.isMachine ? 'metal' : 'flesh') : 'world', info.big);
  }

  /** Efeito de impacto (faíscas, brilho, poeira) no referencial do âncora. */
  impact(an, pointL, normalL, color, kind = 'world', big = false) {
    const ctx = this.ctx, t = ctx.time.world;
    const R = ctx.services.rendering;
    const w = A.toWorld(an, pointL, new THREE.Vector3(), t);
    const n = A.dirToWorld(an, normalL, new THREE.Vector3(), t).normalize();
    const vel = A.velAt(an, pointL, new THREE.Vector3(), t);
    this.onImpact?.({ world: w, local: pointL.clone(), normal: n, normalL: normalL.clone(), color, kind, big, anchor: an });
    const P = R?.particles;
    if (!P) return;
    try {
      const c = color || COLORS.blue;
      P.glow(w.clone().addScaledVector(n, 0.05), big ? 0.75 : 0.35, [c[0] * 10, c[1] * 10, c[2] * 10], big ? 0.2 : 0.12, vel);
      if (kind !== 'flesh') {
        // faíscas na cor do disparo
        const a = big ? 26 : 10;
        P.emit('spark', w, a, (k, o) => {
          const d = _a.randomDirection(); if (d.dot(n) < 0) d.reflect(n);
          d.addScaledVector(n, 0.8).normalize();
          const sp = (big ? 16 : 9) * (0.3 + Math.random());
          o.vx = d.x * sp; o.vy = d.y * sp; o.vz = d.z * sp; o.life = 0.25 + Math.random() * 0.45;
          o.s0 = 0.02; o.s1 = 0.008; o.drag = 2; o.g = 1; o.a = 0.9; o.b = 7; o.spin = 0.025;
        }, { vel, ttl: 2 });
        // poeira/fumaça do material atingido
        if (kind === 'world') {
          const mat = String(this.lastMat || '');
          const dust = mat.includes('ice') ? [0.75, 0.82, 0.9] : mat.includes('desert') ? [0.6, 0.42, 0.26] : [0.28, 0.27, 0.25];
          P.emit('smoke', w.clone().addScaledVector(n, 0.1), big ? 6 : 3, (k, o) => {
            const d = _a.randomDirection().addScaledVector(n, 1.5).normalize();
            o.vx = d.x * 1.4; o.vy = d.y * 1.4; o.vz = d.z * 1.4; o.life = 1.2 + Math.random(); o.s0 = 0.15; o.s1 = big ? 1.4 : 0.7; o.drag = 2; o.g = -0.02;
            o.a = dust[0]; o.b = dust[1]; o.c = dust[2]; o.w = 0.2;
          }, { vel, ttl: 4 });
        }
      } else {
        // impacto em armadura/criatura: faíscas curtas + vapor
        P.emit('spark', w, 6, (k, o) => {
          const d = _a.randomDirection().addScaledVector(n, 1).normalize();
          o.vx = d.x * 6; o.vy = d.y * 6; o.vz = d.z * 6; o.life = 0.2 + Math.random() * 0.2; o.s0 = 0.015; o.s1 = 0.006; o.drag = 2; o.g = 1; o.a = 0.8; o.b = 5; o.spin = 0.02;
        }, { vel, ttl: 2 });
      }
    } catch { /* sem partículas */ }
  }

  update(dt) {
    const ctx = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.prev.copy(p.pos);
      if (p.gravity) p.vel.addScaledVector(A.up(p.anchor, p.pos, _b), -p.gravity * dt);
      p.pos.addScaledVector(p.vel, dt);
      if (p.vel.lengthSq() > 1e-8) p.dir.copy(p.vel).normalize();
      const hit = this.trace(p.anchor, p.prev, p.pos, p.owner);
      if (hit) {
        p.pos.copy(hit.point);
        this.lastMat = hit.material;
        const d0 = p.start.distanceTo(hit.point);
        const falloff = p.kind === 'pellet' ? Math.max(0.25, 1 - Math.max(0, d0 - 8) / 30) : 1;
        this.applyHit(hit, { damage: p.damage, headMul: p.headMul, owner: p.owner, dir: p.dir.clone(), color: p.color, weapon: p.weapon, falloff, anchor: p.anchor });
        this.kill(i);
        continue;
      }
      if (p.t > p.life) this.kill(i);
    }
    this.updateGrenades(dt);
    void ctx;
  }
  kill(i) { const p = this.list[i]; p.dead = true; p.beam?.remove(); this.list.splice(i, 1); }

  // ─── granadas ─────────────────────────────────────────────────────────
  throwGrenade(o) {
    const g = { anchor: o.anchor, pos: o.pos.clone(), vel: o.vel.clone(), t: 0, fuse: o.fuse ?? 2.1, radius: o.radius ?? 7, damage: o.damage ?? 95, owner: o.owner || 'player', mesh: null, bounces: 0, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12) };
    if (o.mesh) {
      g.mesh = o.mesh;
      const ctx = this.ctx;
      g.entry = ctx.world.add(g.mesh, new THREE.Vector3(), { getPos: (out) => A.toWorld(g.anchor, g.pos, out, ctx.time.world) });
    }
    this.grenades.push(g);
    return g;
  }
  updateGrenades(dt) {
    const ctx = this.ctx, t = ctx.time.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      const up = A.up(g.anchor, g.pos, _b);
      const grav = g.anchor.kind === 'body' ? g.anchor.body.gravity || 9.2 : g.anchor.kind === 'frame' ? 9.4 : 0;
      g.vel.addScaledVector(up, -grav * dt);
      const p0 = g.pos.clone();
      g.pos.addScaledVector(g.vel, dt);
      // quica no cenário
      const w0 = A.toWorld(g.anchor, p0, new THREE.Vector3(), t);
      const seg = g.pos.clone().sub(p0); const L = seg.length();
      if (L > 1e-5) {
        const wd = A.dirToWorld(g.anchor, seg.clone().divideScalar(L), new THREE.Vector3(), t);
        const r = ctx.collision.raycast(w0, wd, L + 0.06);
        if (r) {
          const nl = A.dirToLocal(g.anchor, r.normal, new THREE.Vector3(), t);
          g.pos.copy(A.toLocal(g.anchor, r.point, new THREE.Vector3(), t)).addScaledVector(nl, 0.06);
          const vn = g.vel.dot(nl);
          if (vn < 0) g.vel.addScaledVector(nl, -vn * 1.45);
          g.vel.multiplyScalar(0.55);
          g.bounces++;
          g.spin.multiplyScalar(0.6);
        }
      }
      if (g.mesh) { g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt; }
      if (g.t >= g.fuse) { this.explode(g); g.entry?.remove(); this.grenades.splice(i, 1); }
    }
  }
  explode(g) {
    const ctx = this.ctx, t = ctx.time.world;
    const w = A.toWorld(g.anchor, g.pos, new THREE.Vector3(), t);
    const vel = A.velAt(g.anchor, g.pos, new THREE.Vector3(), t);
    const up = A.dirToWorld(g.anchor, A.up(g.anchor, g.pos, new THREE.Vector3()), new THREE.Vector3(), t);
    blast(ctx, g.anchor, g.pos, 4.5, 'plasma');
    void vel; void up;
    for (const tg of this.targets()) {
      if (!tg.alive) continue;
      const d = tg.center ? tg.center(_a).distanceTo(g.pos) : Infinity;
      if (d < g.radius) {
        const k = 1 - d / g.radius;
        tg.damage(g.damage * (0.25 + 0.75 * k * k), { part: 'body', dir: tg.center(_a).clone().sub(g.pos).normalize(), point: g.pos.clone(), owner: g.owner, weapon: 'grenade', blast: k });
      }
    }
    this.onExplode?.(g, w);
  }

  clear() {
    for (const p of this.list) { p.dead = true; p.beam?.remove(); }
    this.list.length = 0;
    for (const g of this.grenades) g.entry?.remove();
    this.grenades.length = 0;
  }
}
