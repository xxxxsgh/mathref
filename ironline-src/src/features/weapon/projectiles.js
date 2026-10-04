/**
 * Granadas no mundo: malha (materiais próprios do mundo — os da viewmodel
 * têm oclusão em espaço de visão da câmera da arma), física em passo fixo
 * (grenade-sim.js) contra ctx.collision, espoleta, explosão e dano.
 *
 *  - frag: explosão via ctx.services.vfx.explosion (que emite 'vfx:explosion'
 *    — áudio e câmera reagem) ou, sem vfx, o evento 'explosion' do bus.
 *    Dano em área pelo MESMO caminho do tiro: collider.data.damage(amount,
 *    info) com info.source = 'player', queda com a distância e linha de
 *    visão (parede protege). O jogador também se fere (player.damage).
 *  - flash (atordoante): clarão + faíscas + tremor, sem dano; emite
 *    'weapon:flashbang' { point, radius } para quem quiser reagir (IA, HUD).
 */
import * as THREE from 'three';
import { buildFrag, buildFlash } from './equipment.js';
import { makeGrenade, stepGrenade, blastDamage, NADE } from './grenade-sim.js';
import { EQUIP_DEFS } from './loadout.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _box = new THREE.Box3();

/** Materiais simples (PBR padrão) para a granada no mundo. */
function worldMats() {
  const S = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  return {
    nade: S(0x3f4430, 0.55, 0.15),
    nadeMetal: S(0x4a4c45, 0.45, 0.6),
    band: S(0xb08a1c, 0.5, 0.05),
    steel: S(0x5a5a58, 0.4, 0.85),
    cavity: S(0x080808, 0.9, 0),
  };
}

export class Throwables {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    // modo shot: encenação sem dano (exceto &wlive=1, QA de dano)
    this.live = !ctx.shot || ctx.params.has('wlive');
    this.M = worldMats();
    this.protos = { frag: buildFrag(this.M), flash: buildFlash(this.M) };
    for (const p of Object.values(this.protos)) {
      p.root.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
    }
    this.ray = (o, d, max) => {
      const hit = ctx.collision.raycast(_a.set(o.x, o.y, o.z), _b.set(d.x, d.y, d.z), max, {
        filter: (c) => c.tag !== 'player' && !c.trigger,
      });
      return hit ? { distance: hit.distance, normal: hit.normal, point: hit.point } : null;
    };
  }

  /** Lança. kind = 'frag' | 'flash'; fuse = segundos restantes. */
  spawn(kind, pos, vel, fuse) {
    const proto = this.protos[kind];
    const mesh = proto.root.clone(true);
    mesh.getObjectByName('pin')?.removeFromParent();
    mesh.getObjectByName('lever')?.removeFromParent();
    mesh.position.copy(pos);
    this.ctx.scene.add(mesh);
    const g = makeGrenade(pos, vel, fuse, { kind, mesh, spin: new THREE.Vector3(8 + Math.random() * 6, Math.random() * 4, 3) });
    this.list.push(g);
    this.ctx.bus.emit('weapon:throw', { kind, position: pos.clone(), velocity: new THREE.Vector3(vel.x, vel.y, vel.z), fuse });
    return g;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      const ev = stepGrenade(g, dt, this.ray, NADE);
      if (ev === 'bounce') this.ctx.bus.emit('weapon:grenadeBounce', { kind: g.kind, speed: g.lastImpact, position: new THREE.Vector3(g.p.x, g.p.y, g.p.z) });
      if (ev === 'explode') {
        this.detonate(g.kind, _c.set(g.p.x, g.p.y, g.p.z).clone());
        g.mesh.removeFromParent();
        this.list.splice(i, 1);
      }
    }
  }

  /** Interpolação visual (por frame): posição + giro enquanto voa/rola. */
  frame(dt) {
    for (const g of this.list) {
      g.mesh.position.set(g.p.x, g.p.y, g.p.z);
      if (!g.rest) {
        const sp = Math.hypot(g.v.x, g.v.y, g.v.z);
        const k = g.grounded ? sp / NADE.radius : 1;
        g.mesh.rotation.x += g.spin.x * dt * (g.grounded ? k * 0.05 : 1);
        g.mesh.rotation.y += g.spin.y * dt;
        g.mesh.rotation.z += g.spin.z * dt * (g.grounded ? 0.2 : 1);
      } else {
        // deitada no chão
        g.mesh.rotation.z += (Math.PI / 2 - g.mesh.rotation.z) * Math.min(1, dt * 10);
      }
    }
  }

  /** Detonação (também usada quando a granada cozinha demais na mão). */
  detonate(kind, point) {
    const ctx = this.ctx;
    const def = EQUIP_DEFS[kind] || EQUIP_DEFS.frag;
    const vfx = ctx.services.vfx;
    const up = new THREE.Vector3(0, 1, 0);
    if (kind === 'flash') {
      vfx?.muzzleFlashWorld?.(point, up, {});
      vfx?.impact?.(point, up, 'metal', { scale: 1.6 });
      ctx.bus.emit('weapon:flashbang', { point: point.clone(), radius: def.radius });
      vfx?.shake?.(0.35, 0.4);
      return;
    }
    // explosão visual + som + tremor (vfx emite 'vfx:explosion' para áudio/câmera)
    if (vfx?.explosion) vfx.explosion(point.clone(), { radius: def.radius, normal: up });
    else ctx.bus.emit('explosion', { point: point.clone(), radius: def.radius });
    ctx.bus.emit('weapon:explode', { kind, point: point.clone(), radius: def.radius });
    // dano em área: colisores com data.damage (inimigos), com linha de visão
    const eyeLift = _a.copy(point).add(_d.set(0, 0.25, 0));
    const seen = new Set();
    const hits = ctx.collision.overlapSphere(point, def.radius, (c) => c.tag !== 'player' && typeof c.data?.damage === 'function');
    for (const c of hits) {
      const key = c.data?.enemy || c;
      if (seen.has(key)) continue;
      seen.add(key);
      const box = c.box || _box;
      const center = box.getCenter(new THREE.Vector3());
      const dist = center.distanceTo(point);
      const dmg = blastDamage(Math.max(0, dist - 0.3), def.radius, def.damage);
      if (dmg <= 0) continue;
      const los = ctx.collision.lineOfSight(eyeLift.clone(), center, { filter: (o) => o !== c && o.tag !== 'enemy' && o.tag !== 'player' });
      if (!los) continue;
      const dir = center.clone().sub(point).normalize();
      const info = { point: center, normal: dir.clone().negate(), distance: dist, collider: c, part: 'torso', dir, damage: dmg, source: 'player', weapon: 'frag', explosion: true, ballistic: true };
      if (this.live) c.data.damage(dmg, info);
      ctx.bus.emit('weapon:hit', info);
    }
    // o próprio jogador
    const pl = ctx.player;
    if (pl && pl.alive !== false && this.live) {
      const pc = _c.copy(pl.position);
      pc.y += 0.9;
      const dist = pc.distanceTo(point);
      const dmg = blastDamage(Math.max(0, dist - 0.3), def.radius, def.damage * 0.85);
      if (dmg > 0 && ctx.collision.lineOfSight(eyeLift.clone(), pc.clone(), { filter: (o) => o.tag !== 'player' && o.tag !== 'enemy' })) {
        pl.damage?.(dmg, { source: 'grenade', from: point.clone(), dir: pc.clone().sub(point).normalize() });
      }
    }
  }

  get count() {
    return this.list.length;
  }

  clear() {
    for (const g of this.list) g.mesh.removeFromParent();
    this.list.length = 0;
  }
}
