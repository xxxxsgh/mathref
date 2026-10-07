/**
 * Finalizações (execução por trás).
 *
 * Alvo: `services.enemies.executionTarget()` — inimigo desatento, de costas
 * para o jogador, a < 1,9 m (lógica e animação da vítima em enemies/).
 * Aviso na tela: "[V] SEGURE — EXECUTAR" com anel de progresso.
 *
 * Tecla: a ação `melee` (V). Ao PRESSIONAR com alvo, a vítima fica imune ao
 * golpe normal da faca por 0,45 s (`finisherLock`); SEGURAR 0,3 s inicia a
 * execução; soltar antes vira um golpe pelas costas (abate imediato,
 * `backstab`). Toque: `services.streaks.finisher.execute()` executa o alvo
 * atual direto (o botão de corpo a corpo do toque pode chamar isso).
 *
 * Execução (2,4 s): esconde viewmodel e HUD, trava jogador e ações, cria o
 * OPERADOR em 3ª pessoa (marionete de enemies/) que avança, agarra e golpeia
 * duas vezes; câmera cinematográfica com 2 planos e um corte (perfil →
 * contra-plongée 3/4), barras de cinema, FOV fechando; volta à 1ª pessoa no
 * lugar do operador, olhando o corpo. Eventos 'finisher:start'/'finisher:end'.
 */
import * as THREE from 'three';
import { el } from './ui.js';

const HOLD = 0.3;
const DUR = 2.4;
const _v = new THREE.Vector3();

export class Finisher {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.target = null;
    this.hold = null;
    this.active = null;
    const p = el('div', 'stk-prompt stk-hide', `<div class="k"><svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="none" stroke="rgba(242,244,239,.25)" stroke-width="2.5"/><circle class="ring" cx="15" cy="15" r="13" fill="none" stroke="#e2b45a" stroke-width="2.5" stroke-dasharray="81.7" stroke-dashoffset="81.7" transform="rotate(-90 15 15)"/></svg><span>V</span></div><div class="t">HOLD <b>EXECUTE</b></div>`, feat.root);
    this.prompt = p;
    this.ring = p.querySelector('.ring');
    this.bars = el('div', 'stk-hide', '<div style="position:absolute;left:0;right:0;top:0;height:11%;background:#000"></div><div style="position:absolute;left:0;right:0;bottom:0;height:11%;background:#000"></div>', feat.root);
    Object.assign(this.bars.style, { position: 'absolute', inset: '0' });
  }

  update(dt) {
    const ctx = this.ctx;
    const en = ctx.services.enemies;
    const inp = ctx.input;
    if (this.active) return this.step(dt);
    const can = ctx.player.alive && !this.f.busy && en?.executionTarget && !ctx.shot && inp.enabled !== false;
    this.target = can ? en.executionTarget() : null;
    if (this.hold) {
      const e = this.hold.e;
      const t = ctx.time.now - this.hold.t0;
      if (!e.alive || !ctx.player.alive) this.hold = null;
      else if (!inp.action('melee')) {
        // soltou cedo: golpe pelas costas
        this.hold = null;
        e.finisherLock = 0;
        const dir = e.facing(new THREE.Vector3());
        e.damage(1e4, { part: 'torso', dir, point: e.group.position.clone().setY(e.group.position.y + 1.3), source: 'player', weapon: 'knife', melee: true, backstab: true });
      } else if (t >= HOLD) {
        this.hold = null;
        this.execute(e);
      }
    } else if (this.target && inp.pressed('melee')) {
      this.hold = { e: this.target, t0: ctx.time.now };
      this.target.finisherLock = ctx.time.now + 0.45;
    }
    // aviso + progresso
    const show = !!(this.target || this.hold) && !this.active;
    this.prompt.classList.toggle('stk-hide', !show);
    const k = this.hold ? Math.min(1, (ctx.time.now - this.hold.t0) / HOLD) : 0;
    this.ring.setAttribute('stroke-dashoffset', String(81.7 * (1 - k)));
  }

  /** Inicia a execução de `e` (ou do alvo atual). */
  execute(e = this.target) {
    const ctx = this.ctx;
    const en = ctx.services.enemies;
    if (!e || !e.alive || this.active || !en?.execute) return false;
    const puppet = en.createPuppet();
    const from = ctx.player.position.clone();
    const anim = en.execute(e, puppet);
    const vYaw = e.yaw;
    const vPos = e.group.position.clone();
    this.active = { e, puppet, anim, from, vYaw, vPos, t: 0, cut: false };
    this.saved = { vm: ctx.vm.visible, hud: true };
    ctx.vm.visible = false;
    ctx.services.hud?.setVisible?.(false);
    ctx.player.moveEnabled = false;
    ctx.player.lookEnabled = false;
    this.f.lockActions(true);
    this.prompt.classList.add('stk-hide');
    this.bars.classList.remove('stk-hide');
    this.f.sfx.whoosh(0.35, 0.18);
    ctx.services.audio?.play?.('cloth_long', { position: vPos, volume: 0.9 });
    anim(puppet, 0, from);
    puppet.update(0);
    ctx.bus.emit('finisher:start', { enemy: e });
    return true;
  }

  step(dt) {
    const a = this.active;
    a.t += dt;
    if (!this.ctx.player.alive) return this.end(true);
    if (a.t >= DUR) this.end(false);
  }

  /** Câmera e marionete (por frame). */
  frame(dt) {
    const a = this.active;
    if (!a) return;
    const ctx = this.ctx;
    const t = Math.min(DUR, a.t + ctx.time.alpha * (1 / 60));
    a.anim(a.puppet, t, a.from);
    a.puppet.update(Math.max(dt, 1 / 120));
    const fwd = _v.set(Math.sin(a.vYaw), 0, Math.cos(a.vYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x); // direita da vítima (lado da faca)
    const mid = a.vPos.clone().addScaledVector(fwd, -0.25);
    const cam = ctx.camera;
    let pos, look, fov;
    if (t < 1.25) {
      // plano 1: perfil, travelling lento
      const k = t / 1.25;
      pos = mid.clone().addScaledVector(right, 2.35).addScaledVector(fwd, 0.15 + k * 0.4).setY(a.vPos.y + 1.45 - k * 0.1);
      look = mid.clone().setY(a.vPos.y + 1.32);
      fov = 46 - k * 4;
    } else {
      if (!a.cut) {
        a.cut = true;
        this.f.sfx.whoosh(0.25, 0.12);
      }
      // plano 2: contra-plongée 3/4 pela frente, aproximando
      const k = (t - 1.25) / (DUR - 1.25);
      pos = mid.clone().addScaledVector(fwd, 2.3 - k * 0.5).addScaledVector(right, -1.25).setY(a.vPos.y + 0.62);
      look = mid.clone().setY(a.vPos.y + 1.05 - k * 0.35);
      fov = 50 - k * 6;
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  end(aborted) {
    const a = this.active;
    if (!a) return;
    const ctx = this.ctx;
    this.active = null;
    // 1ª pessoa no lugar do operador, olhando para onde a vítima caiu
    const P = a.puppet.group.position;
    if (!aborted) {
      const gy = ctx.collision.groundHeight?.(P.x, P.z, P.y + 0.5);
      ctx.player.setPose({ position: [P.x, Number.isFinite(gy) ? gy : P.y, P.z], yaw: a.vYaw + Math.PI, pitch: -0.42 });
    }
    a.puppet.dispose();
    ctx.vm.visible = this.saved.vm;
    ctx.services.hud?.setVisible?.(true);
    ctx.player.moveEnabled = true;
    ctx.player.lookEnabled = true;
    this.f.lockActions(false);
    this.bars.classList.add('stk-hide');
    ctx.services.weapon?.equip?.();
    ctx.bus.emit('finisher:end', { enemy: a.e, aborted });
  }
}
