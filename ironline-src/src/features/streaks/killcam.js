/**
 * Killcam: replay curto da morte do jogador pela perspectiva de quem matou.
 *
 * Gravação contínua (passo fixo, 30 Hz) num RingBuffer de 6 s: pose do
 * jogador (pés, guinada, inclinação, velocidade) e o retrato de cada inimigo
 * vivo (`services.enemies.snapshot()`: posição, guinada, mira, agachamento,
 * velocidade, recarga…), mais os disparos dos inimigos ('enemy:fire').
 *
 * Na morte ('player:death' com `enemy` = o atirador), 0,5 s depois: replay
 * de [morte − 2,4 s, morte + 0,2 s], os últimos 0,5 s em câmera lenta
 * (0,5×) — termina antes do renascimento de 4 s da HUD. Durante o replay:
 *   - os inimigos são "fantasmas": a pose gravada é aplicada só no render
 *     (`enemies.ghost.apply(map)`, restaurada no passo seguinte — a
 *     simulação real continua intacta);
 *   - o JOGADOR aparece como o operador em 3ª pessoa (marionete de
 *     enemies/) e cai em ragdoll no instante da morte;
 *   - câmera por cima do ombro do atirador, mirando o jogador;
 *   - traçantes/clarões dos disparos gravados do atirador;
 *   - HUD/viewmodel escondidos, canvas dessaturado, barras de cinema,
 *     cartão do atirador (classe, arma, distância), barra de tempo, REC.
 * Eventos 'killcam:start' { killer } / 'killcam:end'. `services.streaks
 * .killcam.active` permite à HUD adiar o renascimento (gancho).
 */
import * as THREE from 'three';
import { RingBuffer, lerpAngle } from './logic.js';
import { el } from './ui.js';

const HZ = 30;
const BACK = 2.4, AFTER = 0.2, SLOW_FROM = 0.5, SLOW = 0.5, DELAY = 0.5;

const GUN_NAME = { rifle: 'ASSAULT RIFLE', shotgun: 'PUMP SHOTGUN', sniper: 'BOLT-ACTION RIFLE', shield: 'ASSAULT RIFLE', lmg: 'LIGHT MACHINE GUN' };

export class Killcam {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.frames = new RingBuffer(HZ * 6);
    this.shots = new RingBuffer(256);
    this.n = 0;
    this.active = null;
    this.pending = null;
    feat.ctx.bus.on('enemy:fire', (e) => {
      if (!e?.enemy) return;
      this.shots.push({ t: this.ctx.time.now, id: e.enemy.id, origin: e.origin.clone(), dir: e.dir.clone(), gun: e.gun });
    });
    this.dom = el('div', 'stk-hide', null, feat.root);
    Object.assign(this.dom.style, { position: 'absolute', inset: '0' });
    this.dom.innerHTML = `
      <div style="position:absolute;left:0;right:0;top:0;height:9%;background:#000"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:9%;background:#000"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.55));"></div>
      <div style="position:absolute;left:4%;top:calc(9% + 18px);display:flex;align-items:center;gap:10px">
        <div class="stk-rec" style="width:10px;height:10px;border-radius:50%;background:#e2483d;box-shadow:0 0 10px #e2483d"></div>
        <div style="font-size:26px;font-weight:700;letter-spacing:.32em">KILLCAM</div>
      </div>
      <div class="mono stk-kc-t" style="position:absolute;right:4%;top:calc(9% + 22px);font-size:12px;opacity:.8"></div>
      <div class="stk-kc-card" style="position:absolute;left:50%;bottom:calc(9% + 22px);transform:translateX(-50%);min-width:380px;padding:10px 18px;background:rgba(9,11,13,.72);border-top:2px solid #d9483d;text-transform:uppercase;display:flex;gap:18px;align-items:center"></div>
      <div style="position:absolute;left:4%;right:4%;bottom:calc(9% + 8px);height:3px;background:rgba(242,244,239,.15)"><i class="stk-kc-bar" style="position:absolute;left:0;top:0;bottom:0;width:0;background:#d9483d"></i></div>`;
    this.card = this.dom.querySelector('.stk-kc-card');
    this.bar = this.dom.querySelector('.stk-kc-bar');
    this.tl = this.dom.querySelector('.stk-kc-t');
    this.rec = this.dom.querySelector('.stk-rec');
  }

  /** passo fixo: grava a 30 Hz */
  record() {
    const ctx = this.ctx;
    if (++this.n % 2) return;
    const pl = ctx.player;
    const en = ctx.services.enemies;
    this.frames.push({
      t: ctx.time.now,
      p: { x: pl.position.x, y: pl.position.y, z: pl.position.z, yaw: pl.yaw, pitch: pl.pitch, speed: Math.hypot(pl.velocity.x, pl.velocity.z), vx: pl.velocity.x, vz: pl.velocity.z, alive: pl.alive, crouch: ctx.services.movement?.stance?.() === 'crouch' ? 1 : 0 },
      e: en?.snapshot ? en.snapshot() : [],
    });
  }

  onDeath(info) {
    const ctx = this.ctx;
    const k = info?.enemy;
    if (!k || ctx.shot || !this.frames.size) return;
    this.pending = { t: ctx.time.now + DELAY, death: ctx.time.now, killer: k, info };
  }

  start(p) {
    const ctx = this.ctx;
    const en = ctx.services.enemies;
    if (!en?.ghost || !en.createPuppet) return;
    // o atirador precisa estar no anel (vivo no intervalo)
    const tFrom = Math.max(this.frames.first.t, p.death - BACK);
    if (!this.frames.toArray().some((f) => f.t >= tFrom && f.e.some((s) => s.id === p.killer.id))) return;
    const puppet = en.createPuppet({ knife: false });
    this.active = { ...p, tFrom, tTo: p.death + AFTER, play: tFrom, puppet, died: false, lastShot: tFrom, camPos: null, camLook: null, real0: performance.now() };
    this.saved = { vm: ctx.vm.visible, filter: ctx.canvas.style.filter };
    ctx.vm.visible = false;
    ctx.services.hud?.setVisible?.(false);
    ctx.canvas.style.filter = 'saturate(0.55) contrast(1.12) brightness(0.95)';
    this.dom.classList.remove('stk-hide');
    const k = p.killer;
    const dist = Math.hypot(k.group.position.x - (this.frames.last?.p.x ?? 0), k.group.position.z - (this.frames.last?.p.z ?? 0));
    const role = k.boss ? 'JUGGERNAUT' : k.role?.name || 'RIFLEMAN';
    const gun = k.boss ? 'lmg' : k.role?.gun || 'rifle';
    const how = p.info?.grenade ? 'FRAG GRENADE' : GUN_NAME[gun] || 'RIFLE';
    this.card.innerHTML = `<div style="font-size:10px;color:#e2705f;letter-spacing:.3em">KILLED BY</div><div style="font-size:20px;font-weight:700;letter-spacing:.18em">${role}</div><div style="flex:1"></div><div class="mono" style="font-size:11px;line-height:1.5;text-align:right;opacity:.85">${how}<br>${dist.toFixed(1)} M${p.info?.part === 'head' || (p.info?.dir && false) ? ' · HEADSHOT' : ''}</div>`;
    this.f.sfx.whoosh(0.5, 0.2);
    ctx.bus.emit('killcam:start', { killer: k });
  }

  stop() {
    const a = this.active;
    this.pending = null;
    if (!a) return;
    const ctx = this.ctx;
    this.active = null;
    ctx.services.enemies?.ghost?.end();
    a.puppet.dispose();
    ctx.vm.visible = this.saved.vm;
    ctx.services.hud?.setVisible?.(true);
    ctx.canvas.style.filter = this.saved.filter || '';
    this.dom.classList.add('stk-hide');
    ctx.bus.emit('killcam:end', {});
  }

  update(dt) {
    const ctx = this.ctx;
    if (!this.active) this.record();
    if (this.pending && ctx.time.now >= this.pending.t) {
      const p = this.pending;
      this.pending = null;
      this.start(p);
    }
    const a = this.active;
    if (!a) return;
    // relógio do replay: tempo real, câmera lenta no fim
    const slowAt = a.death - SLOW_FROM;
    a.play += a.play < slowAt ? dt : dt * SLOW;
    if (a.play >= a.tTo || ctx.player.alive) this.stop();
  }

  /** Interpola os retratos no tempo `t` → Map id → retrato. */
  ghostsAt(t) {
    const s = this.frames.sample(t);
    if (!s) return null;
    const { a, b, k } = s;
    const map = new Map();
    const bm = new Map(b.e.map((x) => [x.id, x]));
    for (const ea of a.e) {
      const eb = bm.get(ea.id) || ea;
      map.set(ea.id, {
        x: ea.x + (eb.x - ea.x) * k, y: ea.y + (eb.y - ea.y) * k, z: ea.z + (eb.z - ea.z) * k,
        yaw: lerpAngle(ea.yaw, eb.yaw, k), aimYaw: ea.aimYaw + (eb.aimYaw - ea.aimYaw) * k, aimPitch: ea.aimPitch + (eb.aimPitch - ea.aimPitch) * k,
        crouch: ea.crouch + (eb.crouch - ea.crouch) * k, aim: ea.aim + (eb.aim - ea.aim) * k, speed: ea.speed + (eb.speed - ea.speed) * k,
        moveX: eb.moveX, moveZ: eb.moveZ, lean: ea.lean + (eb.lean - ea.lean) * k, reload: eb.reload,
      });
    }
    const p = { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k, z: a.p.z + (b.p.z - a.p.z) * k, yaw: lerpAngle(a.p.yaw, b.p.yaw, k), pitch: a.p.pitch, speed: a.p.speed + (b.p.speed - a.p.speed) * k, vx: b.p.vx, vz: b.p.vz, crouch: b.p.crouch };
    return { map, p };
  }

  frame(dt) {
    const a = this.active;
    if (!a) return;
    const ctx = this.ctx;
    const g = this.ghostsAt(Math.min(a.play, a.death));
    if (!g) return;
    ctx.services.enemies.ghost.apply(g.map);
    // o jogador como operador em 3ª pessoa
    const P = a.puppet;
    if (!a.died) {
      P.place(new THREE.Vector3(g.p.x, g.p.y, g.p.z), g.p.yaw + Math.PI);
      const pp = P.anim.p;
      pp.aim = 1;
      pp.aimPitch = g.p.pitch;
      pp.aimYaw = 0;
      pp.speed = g.p.speed;
      pp.crouch = g.p.crouch;
      if (g.p.speed > 0.1) {
        // direção do movimento no espaço do modelo
        const yaw = g.p.yaw + Math.PI;
        const c = Math.cos(-yaw), s = Math.sin(-yaw);
        const vx = g.p.vx / g.p.speed, vz = g.p.vz / g.p.speed;
        pp.moveX = vx * c + vz * s;
        pp.moveZ = -vx * s + vz * c;
      }
      if (a.play >= a.death) {
        a.died = true;
        const ks = g.map.get(a.killer.id);
        const dir = ks ? new THREE.Vector3(g.p.x - ks.x, 0.1, g.p.z - ks.z).normalize() : new THREE.Vector3(0, 0, 1);
        P.die(dir, new THREE.Vector3(g.p.x, g.p.y + 1.3, g.p.z));
        ctx.services.audio?.play?.('body_drop', { position: new THREE.Vector3(g.p.x, g.p.y, g.p.z), volume: 0.8 });
      }
    }
    P.update(Math.max(1 / 120, dt * (a.play >= a.death - SLOW_FROM ? SLOW : 1)));
    // disparos gravados do atirador (traçante + clarão)
    for (let i = 0; i < this.shots.size; i++) {
      const s = this.shots.at(i);
      if (s.id !== a.killer.id || s.t <= a.lastShot || s.t > a.play) continue;
      ctx.services.vfx?.muzzleFlashWorld?.(s.origin, s.dir, {});
      ctx.services.vfx?.tracer?.(s.origin.clone().addScaledVector(s.dir, 0.4), s.origin.clone().addScaledVector(s.dir, 60), { speed: 220, length: 4 });
      ctx.services.audio?.play?.('shot_enemy', { position: s.origin, volume: 0.6, rate: 0.9, cap: 4 });
    }
    a.lastShot = Math.max(a.lastShot, Math.min(a.play, a.death + AFTER));
    // câmera por cima do ombro do atirador, mirando o jogador
    const ks = g.map.get(a.killer.id);
    if (ks) {
      const f = new THREE.Vector3(Math.sin(ks.yaw), 0, Math.cos(ks.yaw));
      const right = new THREE.Vector3(-f.z, 0, f.x);
      const eyeY = ks.y + 1.62 - ks.crouch * 0.55;
      const pos = new THREE.Vector3(ks.x, eyeY + 0.18, ks.z).addScaledVector(f, -0.95).addScaledVector(right, 0.48);
      const look = new THREE.Vector3(g.p.x, g.p.y + 1.15, g.p.z);
      if (a.died) look.copy(P.joint(2, new THREE.Vector3()));
      const k = a.camPos ? 1 - Math.exp(-dt * 8) : 1;
      a.camPos = (a.camPos || pos.clone()).lerp(pos, k);
      a.camLook = (a.camLook || look.clone()).lerp(look, k);
      const cam = ctx.camera;
      cam.position.copy(a.camPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(a.camLook);
      const dist = a.camPos.distanceTo(a.camLook);
      // longe (atirador de elite): fecha o FOV como uma luneta
      const fov = dist > 25 ? Math.max(18, 60 - dist * 0.9) : 60;
      if (Math.abs(cam.fov - fov) > 1e-3) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld();
    }
    const total = a.tTo - a.tFrom;
    this.bar.style.width = `${Math.min(100, ((a.play - a.tFrom) / total) * 100).toFixed(1)}%`;
    this.tl.textContent = `T−${Math.max(0, a.death - a.play).toFixed(2)}s${a.play >= a.death - SLOW_FROM ? '  ·  0.5×' : ''}`;
    this.rec.style.opacity = (performance.now() / 500) % 2 < 1 ? '1' : '0.2';
  }
}
