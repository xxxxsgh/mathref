/**
 * Props destrutíveis da feature enemies: BARRIS EXPLOSIVOS e BOTIJÕES DE GÁS.
 *
 * Onde: perto dos pontos de entrada inimigos (`world.enemySpawns`) e das
 * células de cobertura da grade de navegação — encostados em algo (raios
 * curtos nas 4 direções), no chão, longe do nascimento do jogador e uns dos
 * outros; barris às vezes em grupos de 2–3 (reação em cadeia).
 *
 * Dano: cada prop é um colisor estático (material 'metal', bloqueia jogador e
 * bala) com `data.damage` — o tiro da arma, a granada, o morteiro e a
 * explosão de outro prop usam o caminho normal.
 *   barril   30 de vida. Bala fura → vaza fogo (chamas no topo) e explode
 *            1,2 s depois; explosão próxima → explode em 0,15–0,35 s.
 *   botijão  20 de vida. Fura → jato de gás com chiado, gira e decola
 *            (~1,4 s) e explode onde estiver.
 * Explosão: bus 'explosion' (vfx/áudio/câmera), dano em área com linha de
 * visão (`blastDamage`), crédito para quem causou a primeira avaria
 * (`source: 'player'` → abates do jogador, `weapon: 'barrel'`). O que sobra
 * é um casco amassado e chamuscado sem colisor.
 *
 * Evento: 'prop:explode' { kind, position, source }.
 */
import * as THREE from 'three';

/** Dano de explosão: máximo no centro, queda suave até zero no raio. */
export function blastDamage(dist, radius, max) {
  if (dist >= radius) return 0;
  const k = 1 - Math.max(0, dist) / radius;
  return max * Math.pow(k, 1.35);
}

/**
 * Ordem das detonações em cadeia (lógica pura, testada): `props` =
 * [{ x, z, r }] (r = raio da explosão), `first` = índice que explode.
 * Retorna [{ i, t }] (t = atraso acumulado), cada prop no máximo uma vez.
 */
export function chainOrder(props, first, delay = 0.25) {
  const out = [{ i: first, t: 0 }];
  const done = new Set([first]);
  for (let k = 0; k < out.length; k++) {
    const a = props[out[k].i];
    for (let j = 0; j < props.length; j++) {
      if (done.has(j)) continue;
      const b = props[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) <= a.r * 0.75) {
        done.add(j);
        out.push({ i: j, t: out[k].t + delay });
      }
    }
  }
  return out;
}

// ─── texturas/geometria (compartilhadas) ─────────────────────────────────
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const rnd = (() => {
    let s = 4242;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const paint = (base, w, h, draw) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const grime = (g, w, h, rust = true) => {
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,220' : '20,10,5'},${0.02 + rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 4);
    }
    if (rust)
      for (let i = 0; i < 26; i++) {
        // escorridos de ferrugem a partir dos aros
        const x = rnd() * w, y = rnd() < 0.5 ? h * (0.04 + rnd() * 0.05) : h * (0.33 + rnd() * 0.04);
        const lg = g.createLinearGradient(0, y, 0, y + 20 + rnd() * 70);
        lg.addColorStop(0, `rgba(96,46,18,${0.35 + rnd() * 0.4})`);
        lg.addColorStop(1, 'rgba(96,46,18,0)');
        g.fillStyle = lg;
        g.fillRect(x, y, 2 + rnd() * 6, 90);
      }
    // riscos
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(200,190,180,${0.08 + rnd() * 0.15})`;
      g.lineWidth = 0.5 + rnd();
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 6);
      g.stroke();
    }
  };
  const hazard = (g, cx, cy, s) => {
    // losango laranja com chama estilizada (símbolo genérico)
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#d07a1c';
    g.fillRect(-s / 2, -s / 2, s, s);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 3;
    g.strokeRect(-s / 2 + 5, -s / 2 + 5, s - 10, s - 10);
    g.restore();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.moveTo(cx, cy - s * 0.36);
    g.bezierCurveTo(cx + s * 0.25, cy - s * 0.05, cx + s * 0.18, cy + s * 0.2, cx, cy + s * 0.22);
    g.bezierCurveTo(cx - s * 0.2, cy + s * 0.2, cx - s * 0.22, cy, cx - s * 0.06, cy - s * 0.12);
    g.bezierCurveTo(cx - s * 0.04, cy, cx + s * 0.02, cy - s * 0.12, cx, cy - s * 0.36);
    g.fill();
  };
  const barrelMap = paint('#7d1f15', 512, 256, (g, w, h) => {
    // faixas mais claras nos aros e decalque de perigo dos dois lados
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, h * 0.31, w, h * 0.04);
    g.fillRect(0, h * 0.65, w, h * 0.04);
    hazard(g, w * 0.25, h * 0.5, 62);
    hazard(g, w * 0.75, h * 0.5, 62);
    g.fillStyle = 'rgba(230,220,200,0.8)';
    g.fillRect(w * 0.08, h * 0.76, w * 0.34, 10);
    g.fillRect(w * 0.58, h * 0.76, w * 0.34, 10);
    grime(g, w, h);
  });
  const canMap = paint('#b39222', 512, 256, (g, w, h) => {
    g.fillStyle = '#d9d6cc';
    g.fillRect(0, h * 0.18, w, h * 0.12);
    hazard(g, w * 0.5, h * 0.55, 56);
    g.fillStyle = 'rgba(20,20,20,0.75)';
    for (let k = 0; k < 4; k++) g.fillRect(w * 0.12, h * 0.48 + k * 12, w * 0.18, 4);
    grime(g, w, h, false);
  });
  const charMap = paint('#16120f', 256, 128, (g, w, h) => {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${rnd() < 0.3 ? '120,50,20' : '50,45,40'},${0.1 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 3);
    }
  });
  // barril: perfil em torno de Y (aros de rolamento e friso da tampa)
  const R = 0.29, H = 0.88;
  const prof = [
    [0, 0], [R - 0.012, 0], [R, 0.012], [R, 0.05], [R + 0.008, 0.06], [R, 0.07],
    [R, 0.27], [R + 0.012, 0.285], [R + 0.012, 0.3], [R, 0.315],
    [R, 0.565], [R + 0.012, 0.58], [R + 0.012, 0.595], [R, 0.61],
    [R, 0.81], [R + 0.008, 0.82], [R, 0.83], [R, H - 0.012], [R + 0.006, H - 0.004], [R - 0.02, H], [R - 0.022, H - 0.01], [0, H - 0.01],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const barrelGeo = new THREE.LatheGeometry(prof, 28);
  // canister: corpo + domo
  const C = 0.155, CH = 0.95;
  const cprof = [[0, 0], [C - 0.01, 0], [C, 0.02], [C, CH - 0.12], [C * 0.92, CH - 0.06], [C * 0.6, CH - 0.02], [0.04, CH], [0, CH]].map(([x, y]) => new THREE.Vector2(x, y));
  const canGeo = new THREE.LatheGeometry(cprof, 24);
  const steel = new THREE.MeshStandardMaterial({ color: 0x55585b, roughness: 0.35, metalness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9c7a3a, roughness: 0.3, metalness: 0.9 });
  SHARED = {
    R, H, C, CH, barrelGeo, canGeo, steel, brass,
    barrelMat: new THREE.MeshStandardMaterial({ map: barrelMap, roughness: 0.55, metalness: 0.4 }),
    canMat: new THREE.MeshStandardMaterial({ map: canMap, roughness: 0.42, metalness: 0.45 }),
    charMat: new THREE.MeshStandardMaterial({ map: charMap, roughness: 0.92, metalness: 0.2 }),
    flameTex: flameTexture(),
    puffTex: puffTexture(),
  };
  return SHARED;
}

function flameTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(32, 96, 2, 32, 80, 60);
  rg.addColorStop(0, 'rgba(255,250,220,1)');
  rg.addColorStop(0.25, 'rgba(255,190,80,0.95)');
  rg.addColorStop(0.6, 'rgba(230,80,20,0.55)');
  rg.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.ellipse(32, 80, 26, 48, 0, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(cv);
}
function puffTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(235,240,240,0.7)');
  rg.addColorStop(1, 'rgba(235,240,240,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

const DEF = {
  barrel: { health: 30, radius: 5.5, damage: 165, fuse: 1.2 },
  canister: { health: 20, radius: 4.6, damage: 140, fuse: 1.4 },
};

export class ExplosiveProps {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.root = new THREE.Group();
    this.root.name = 'explosive-props';
    ctx.scene.add(this.root);
  }

  /** Cria um prop. `kind` = 'barrel' | 'canister'. */
  add(kind, x, y, z, yaw = 0) {
    const S = shared();
    const ctx = this.ctx;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    let body;
    if (kind === 'barrel') {
      body = new THREE.Mesh(S.barrelGeo, S.barrelMat);
      // bujões da tampa
      for (const [bx, r] of [[0.13, 0.03], [-0.15, 0.02]]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.015, 12), S.steel);
        cap.position.set(bx, S.H - 0.004, 0.04);
        g.add(cap);
      }
      // amassado leve: escala não uniforme sorteada
      body.scale.set(1 + (Math.random() - 0.5) * 0.03, 1, 1 + (Math.random() - 0.5) * 0.03);
    } else {
      body = new THREE.Mesh(S.canGeo, S.canMat);
      // colar com alças + válvula de latão
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 16, 1, true), S.steel);
      collar.position.y = S.CH + 0.03;
      collar.material = S.steel;
      g.add(collar);
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 10), S.brass);
      valve.position.y = S.CH + 0.02;
      g.add(valve);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), S.steel);
      knob.position.y = S.CH + 0.06;
      g.add(knob);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(S.C + 0.01, S.C + 0.01, 0.06, 20, 1, true), S.steel);
      foot.position.y = 0.03;
      g.add(foot);
    }
    g.add(body);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.root.add(g);
    const r = kind === 'barrel' ? S.R : S.C;
    const h = kind === 'barrel' ? S.H : S.CH + 0.1;
    const prop = { kind, def: DEF[kind], group: g, body, health: DEF[kind].health, state: 'idle', t: 0, credit: null, pos: g.position, r, h, vel: new THREE.Vector3(), spin: 0, fx: [] };
    prop.colliderId = ctx.collision.addBoxCentered(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(r * 2, h, r * 2), {
      tag: 'prop',
      material: 'metal',
      data: { kind: 'prop', prop, damage: (amount, info) => this.damage(prop, amount, info) },
    });
    this.list.push(prop);
    return prop;
  }

  damage(prop, amount, info = {}) {
    if (prop.state === 'dead' || prop.state === 'boom') return;
    // crédito: a primeira avaria decide (jogador, inimigo, streak)
    if (!prop.credit) prop.credit = { source: info.source ?? 'player', enemy: info.enemy || null, streak: info.streak || null };
    prop.health -= amount;
    if (prop.health > 0 && !info.explosion) {
      // furo: começa a vazar já com a 1ª bala no botijão
      if (prop.kind === 'canister' && prop.state === 'idle') this.ignite(prop, info);
      return;
    }
    if (info.explosion) {
      // explosão vizinha: detona logo (cadeia)
      prop.state = 'fuse';
      prop.t = 0.15 + Math.random() * 0.2;
      return;
    }
    if (prop.state === 'idle') this.ignite(prop, info);
  }

  ignite(prop, info) {
    const S = shared();
    const ctx = this.ctx;
    prop.state = prop.kind === 'barrel' ? 'burn' : 'vent';
    prop.t = prop.def.fuse;
    prop.leakDir = info?.dir ? info.dir.clone().negate().setY(0).normalize() : new THREE.Vector3(1, 0, 0);
    // chamas (barril) / jato de gás (botijão): sprites próprios
    const n = prop.kind === 'barrel' ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: prop.kind === 'barrel' ? S.flameTex : S.puffTex, transparent: true, blending: prop.kind === 'barrel' ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, toneMapped: prop.kind !== 'barrel' }),
      );
      sp.userData.seed = Math.random() * 10;
      this.root.add(sp);
      prop.fx.push(sp);
    }
    ctx.services.audio?.play?.('tail_out', { position: prop.pos, volume: 0.7, rate: prop.kind === 'barrel' ? 0.45 : 2.4, cap: 3 });
    ctx.services.audio?.play?.('imp_metal', { position: prop.pos, volume: 0.8, cap: 3 });
  }

  update(dt) {
    for (const p of this.list) {
      if (p.state === 'idle' || p.state === 'dead') continue;
      p.t -= dt;
      if (p.state === 'vent') {
        // jato: gira e, na metade final, decola
        p.spin += dt * 9;
        if (p.t < p.def.fuse * 0.55) {
          if (!p.launched) {
            p.launched = true;
            this.ctx.collision.remove(p.colliderId);
            p.colliderId = null;
            p.vel.set(p.leakDir.x * 2.5, 6.5, p.leakDir.z * 2.5);
          }
          p.vel.y -= 9.8 * dt * 0.5;
          p.pos.addScaledVector(p.vel, dt);
          const gy = this.ctx.collision.groundHeight?.(p.pos.x, p.pos.z, p.pos.y + 1) ?? 0;
          if (p.pos.y < gy) {
            p.pos.y = gy;
            p.vel.y = Math.abs(p.vel.y) * 0.3;
          }
          p.group.rotation.z += dt * 7;
        }
        p.group.rotation.y += p.spin * dt;
      }
      if (p.t <= 0) this.explode(p);
    }
  }

  /** Por frame: chamas/gás animados. */
  frame(t) {
    for (const p of this.list) {
      if (!p.fx.length) continue;
      p.fx.forEach((sp, i) => {
        const s = sp.userData.seed;
        if (p.kind === 'barrel') {
          const f = 0.75 + 0.25 * Math.sin(t * 17 + s * 3) * Math.sin(t * 7.3 + s);
          sp.position.set(p.pos.x + Math.sin(s * 5) * 0.12, p.pos.y + p.h + 0.12 + i * 0.07 + f * 0.05, p.pos.z + Math.cos(s * 5) * 0.12);
          sp.scale.set(0.35 * f + i * 0.02, 0.6 * f + i * 0.05, 1);
          sp.material.opacity = 0.9;
        } else {
          const k = ((t * 2.2 + s) % 1);
          const d = p.leakDir;
          sp.position.set(p.pos.x + d.x * (0.2 + k * 0.9), p.pos.y + p.h * 0.8 + k * 0.3, p.pos.z + d.z * (0.2 + k * 0.9));
          sp.scale.setScalar(0.15 + k * 0.7);
          sp.material.opacity = 0.55 * (1 - k);
        }
      });
    }
  }

  explode(p) {
    const ctx = this.ctx;
    const S = shared();
    p.state = 'dead';
    for (const sp of p.fx) {
      sp.removeFromParent();
      sp.material.dispose();
    }
    p.fx.length = 0;
    if (p.colliderId != null) ctx.collision.remove(p.colliderId);
    p.colliderId = null;
    const point = p.pos.clone().add(new THREE.Vector3(0, p.h * 0.5, 0));
    const R = p.def.radius;
    const credit = p.credit || { source: 'player' };
    ctx.bus.emit('explosion', { point: point.clone(), radius: R });
    ctx.bus.emit('prop:explode', { kind: p.kind, position: point.clone(), source: credit.source });
    // casco: amassado, chamuscado, tombado
    p.body.material = S.charMat;
    p.group.children.forEach((c) => c !== p.body && (c.visible = false));
    p.group.scale.set(1.08, 0.55, 1.08);
    p.group.rotation.set((Math.random() - 0.5) * 0.5, p.group.rotation.y, (Math.random() - 0.5) * 0.5);
    const gy = ctx.collision.groundHeight?.(p.pos.x, p.pos.z, p.pos.y + 1);
    if (Number.isFinite(gy)) p.pos.y = gy;
    // dano em área (mesmo caminho das granadas)
    const seen = new Set();
    const src = credit.source === 'enemy' ? 'enemy' : 'player';
    for (const c of ctx.collision.overlapSphere(point, R, (o) => typeof o.data?.damage === 'function' && o.tag !== 'player')) {
      const key = c.data?.enemy || c;
      if (seen.has(key) || c.data?.prop === p) continue;
      seen.add(key);
      const center = (c.box || new THREE.Box3()).getCenter(new THREE.Vector3());
      const d = center.distanceTo(point);
      const dmg = blastDamage(Math.max(0, d - 0.3), R, p.def.damage);
      if (dmg <= 0) continue;
      if (!c.data?.prop && !ctx.collision.lineOfSight(point, center, { filter: (o) => o !== c && o.tag !== 'enemy' && o.tag !== 'player' && o.tag !== 'prop' })) continue;
      const dir = center.clone().sub(point).normalize();
      c.data.damage(dmg, { point: center, normal: dir.clone().negate(), dir, part: 'torso', damage: dmg, source: src, enemy: credit.enemy, streak: credit.streak, weapon: 'barrel', explosion: true, barrel: true, ballistic: true });
    }
    const pl = ctx.player;
    if (pl.alive) {
      const pc = pl.position.clone().setY(pl.position.y + 0.9);
      const d = pc.distanceTo(point);
      const dmg = blastDamage(d, R, p.def.damage * 0.7);
      if (dmg > 0 && ctx.collision.lineOfSight(point, pc, { filter: (o) => o.tag !== 'player' && o.tag !== 'enemy' && o.tag !== 'prop' })) {
        pl.damage(dmg, { source: credit.source === 'enemy' ? 'enemy' : 'barrel', enemy: credit.enemy, from: point.clone(), dir: pc.sub(point).normalize(), explosion: true });
      }
    }
  }

  /**
   * Espalha os props pelo mapa (determinístico com o rng do ctx):
   * perto das entradas inimigas e das coberturas da grade de navegação.
   */
  populate(world, nav, rng, { count = 10 } = {}) {
    const ctx = this.ctx;
    const col = ctx.collision;
    const spawns = world?.enemySpawns || [];
    const avoid = (world?.spawnPoints || []).map((s) => s.position);
    const cands = [];
    for (const s of spawns) {
      for (let k = 0; k < 10; k++) {
        const a = rng.next() * Math.PI * 2, d = 2 + rng.next() * 6;
        cands.push([s.position[0] + Math.cos(a) * d, s.position[2] + Math.sin(a) * d]);
      }
    }
    if (nav?.walk && nav.low) {
      for (let k = 0; k < 400 && cands.length < 220; k++) {
        const i = Math.floor(rng.next() * nav.walk.length);
        if (nav.walk[i] && (nav.low[i] || nav.high[i])) {
          const c = nav.center(i, new THREE.Vector3());
          cands.push([c.x, c.z]);
        }
      }
    }
    const placed = [];
    const ok = (x, z, minD) => placed.every((p) => Math.hypot(p[0] - x, p[1] - z) > minD) && avoid.every((p) => Math.hypot(p[0] - x, p[2] - z) > 7);
    const free = (x, y, z, r) => !col.overlapSphere(new THREE.Vector3(x, y + 0.55, z), r + 0.05, (o) => !o.trigger && o.blocksPlayer !== false).length;
    const nearWall = (x, y, z) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (col.raycast(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(dx, 0, dz), 1.4, { filter: (o) => !o.trigger && o.tag !== 'enemy' && o.tag !== 'prop' })) return true;
      }
      return false;
    };
    let n = 0;
    for (const [x, z] of cands) {
      if (n >= count) break;
      const y = col.groundHeight?.(x, z, 3) ?? 0;
      if (!Number.isFinite(y) || y > 2.5 || y < -0.5) continue;
      if (!ok(x, z, 5) || !free(x, y, z, 0.32) || !nearWall(x, y, z)) continue;
      const kind = n % 3 === 2 ? 'canister' : 'barrel';
      this.add(kind, x, y, z, rng.next() * Math.PI * 2);
      placed.push([x, z]);
      n++;
      // grupo de barris (cadeia)
      if (kind === 'barrel' && rng.next() < 0.55) {
        for (let k = 0; k < 2; k++) {
          const a = rng.next() * Math.PI * 2;
          const bx = x + Math.cos(a) * 0.68, bz = z + Math.sin(a) * 0.68;
          const by = col.groundHeight?.(bx, bz, 3) ?? y;
          if (Math.abs(by - y) < 0.2 && free(bx, by, bz, 0.3)) {
            this.add(rng.next() < 0.75 ? 'barrel' : 'canister', bx, by, bz, rng.next() * 6.28);
            break;
          }
        }
      }
    }
    return n;
  }

  clear() {
    for (const p of this.list) {
      if (p.colliderId != null) this.ctx.collision.remove(p.colliderId);
      for (const sp of p.fx) sp.removeFromParent();
    }
    this.list.length = 0;
    this.root.clear();
  }
}
