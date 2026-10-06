/**
 * Granadas dos INIMIGOS (reação: "desentocar" o jogador escondido).
 *
 * Arremesso em parábola (roles.lobVelocity) da mão do soldado até perto da
 * última posição conhecida do jogador; física simples por raycast (quica com
 * restituição 0,35 e atrito), espoleta de 2,6–3 s. A explosão usa o bus
 * ('explosion' → vfx + áudio + tremor) e o MESMO caminho de dano das outras:
 * jogador por `player.damage` (com linha de visão, `source: 'enemy'`,
 * `enemy` = quem lançou, `grenade: true`) e colisores com `data.damage`
 * (barris, torreta/drone do jogador, outros soldados com dano reduzido).
 *
 * Eventos: 'enemy:grenade' { enemy, position, target, fuse } no arremesso
 * (a HUD pode desenhar o indicador de perigo) e 'enemy:grenadeLand'
 * { position } quando ela para no chão.
 */
import * as THREE from 'three';
import { lobVelocity } from './roles.js';
import { blastDamage } from './props.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class EnemyGrenades {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    const body = new THREE.SphereGeometry(0.045, 14, 10);
    body.scale(1, 1.18, 1);
    this.geo = body;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3d4430, roughness: 0.6, metalness: 0.2 });
    this.leverGeo = new THREE.BoxGeometry(0.012, 0.075, 0.006);
    this.leverMat = new THREE.MeshStandardMaterial({ color: 0x4b4d48, roughness: 0.4, metalness: 0.7 });
  }

  throw(from, to, enemy) {
    const ctx = this.ctx;
    const v = lobVelocity(from, to);
    const mesh = new THREE.Group();
    const b = new THREE.Mesh(this.geo, this.mat);
    const lv = new THREE.Mesh(this.leverGeo, this.leverMat);
    lv.position.set(0.04, 0.02, 0);
    lv.rotation.z = -0.25;
    mesh.add(b, lv);
    mesh.traverse((o) => (o.castShadow = true));
    mesh.position.copy(from);
    ctx.scene.add(mesh);
    const fuse = 2.6 + ctx.rng.next() * 0.4;
    const g = { mesh, p: from.clone(), v: new THREE.Vector3(v.x, v.y, v.z), w: new THREE.Vector3(8, 3, 5), fuse, enemy, rest: false };
    this.list.push(g);
    ctx.bus.emit('enemy:grenade', { enemy, position: from.clone(), target: to.clone(), fuse });
    ctx.services.audio?.play?.('cloth', { position: from, volume: 0.6 });
    return g;
  }

  update(dt) {
    const ctx = this.ctx;
    const col = ctx.collision;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.explode(g);
        this.list.splice(i, 1);
        continue;
      }
      if (g.rest) continue;
      g.v.y -= 9.8 * dt;
      const step = _a.copy(g.v).multiplyScalar(dt);
      const len = step.length();
      if (len > 1e-6) {
        const dir = _b.copy(step).divideScalar(len);
        const hit = col.raycast(g.p, dir, len + 0.05, { filter: (c) => c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy && !c.trigger });
        if (hit) {
          g.p.copy(hit.point).addScaledVector(hit.normal, 0.05);
          const vn = hit.normal.clone().multiplyScalar(g.v.dot(hit.normal));
          const vt = g.v.clone().sub(vn);
          const speed = g.v.length();
          g.v.copy(vt.multiplyScalar(0.62)).addScaledVector(vn, -0.35);
          g.w.multiplyScalar(0.6);
          if (speed > 2) ctx.services.audio?.play?.('brass', { position: g.p, volume: 0.7, rate: 0.55, cap: 3 });
          if (hit.normal.y > 0.6 && g.v.length() < 0.6) {
            g.rest = true;
            g.v.set(0, 0, 0);
            ctx.bus.emit('enemy:grenadeLand', { position: g.p.clone(), enemy: g.enemy });
          }
        } else g.p.add(step);
      }
      g.mesh.position.copy(g.p);
      g.mesh.rotation.x += g.w.x * dt;
      g.mesh.rotation.y += g.w.y * dt;
      g.mesh.rotation.z += g.w.z * dt;
    }
  }

  explode(g) {
    const ctx = this.ctx;
    const point = g.p.clone().add(new THREE.Vector3(0, 0.08, 0));
    g.mesh.removeFromParent();
    const R = 6;
    ctx.bus.emit('explosion', { point: point.clone(), radius: R, source: 'enemy' });
    // jogador (linha de visão)
    const pl = ctx.player;
    if (pl.alive) {
      const pc = _a.copy(pl.position).setY(pl.position.y + 0.9);
      const d = pc.distanceTo(point);
      const dmg = blastDamage(d, R, 115);
      if (dmg > 0 && ctx.collision.lineOfSight(point, pc, { filter: (c) => c.tag !== 'player' && c.tag !== 'enemy' && !c.data?.enemy })) {
        pl.damage(dmg, { source: 'enemy', enemy: g.enemy?.alive ? g.enemy : g.enemy, from: point.clone(), dir: pc.clone().sub(point).normalize(), grenade: true });
      }
    }
    // colisores com dano (barris, torreta, outros soldados)
    const seen = new Set();
    for (const c of ctx.collision.overlapSphere(point, R, (o) => typeof o.data?.damage === 'function' && o.tag !== 'player')) {
      const key = c.data?.enemy || c;
      if (seen.has(key)) continue;
      seen.add(key);
      const center = (c.box || new THREE.Box3()).getCenter(new THREE.Vector3());
      const d = center.distanceTo(point);
      let dmg = blastDamage(Math.max(0, d - 0.3), R, 115);
      if (c.data?.enemy) dmg *= 0.5; // fogo amigo reduzido
      if (dmg <= 0) continue;
      const dir = center.clone().sub(point).normalize();
      c.data.damage(dmg, { point: center, normal: dir.clone().negate(), dir, part: 'torso', damage: dmg, source: 'enemy', enemy: g.enemy, explosion: true, weapon: 'enemy_frag' });
    }
  }

  clear() {
    for (const g of this.list) g.mesh.removeFromParent();
    this.list.length = 0;
  }
}
