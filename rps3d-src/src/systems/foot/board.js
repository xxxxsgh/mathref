// Abordagem de nave desativada: monta o interior andável (ships.attachInterior)
// preso ao casco que continua no espaço, põe o jogador na eclusa de popa,
// espalha a tripulação hostil pelos segmentos (porão, corredores, ponte) e
// define o objetivo: chegar à ponte e invadir o console (hack). Depois, a
// eclusa leva de volta à nave do jogador.
import * as THREE from 'three/webgpu';
import { rng, hashStr } from './util.js';

export class Boarding {
  constructor(ctx, foot) {
    this.ctx = ctx; this.foot = foot;
    this.active = null;
  }

  board(p) {
    const ctx = this.ctx;
    const ships = ctx.services.ships;
    if (!p) return false;
    const inst = p.instance || (p.ship && ships?.byId?.(p.ship)) || null;
    if (!ships?.attachInterior || !inst) {
      ctx.bus.emit('notify', { text: 'ABORDAGEM IMPOSSÍVEL: CASCO SEM INTERIOR ACESSÍVEL', kind: 'warn' });
      return false;
    }
    this.end();
    // referencial vivo: posição/rotação da nave do combate (ou o que veio no evento)
    const src = p.combatant || p;
    const frame = { pos: (src.pos || new THREE.Vector3()).clone(), quat: (src.quat || new THREE.Quaternion()).clone(), up: new THREE.Vector3(0, 1, 0) };
    const inter = ships.attachInterior(inst, frame);
    if (!inter) { ctx.bus.emit('notify', { text: 'ABORDAGEM: ESTA CLASSE NÃO TEM INTERIOR', kind: 'warn' }); return false; }
    const B = { p, frame, inter, src, enemies: [], removes: [], captured: false, seg: inter.segments || [] };
    this.active = B;
    const anchor = { kind: 'frame', frame, up: new THREE.Vector3(0, 1, 0), gravity: 9.4, id: 'abordagem' };
    // jogador na popa (segmento de máquinas)
    const segs = B.seg;
    const eng = [...segs].reverse().find((s) => s.kind === 'engine') || segs[segs.length - 1];
    const F = inter.spawn?.y ?? 0;
    const start = eng ? new THREE.Vector3(0, F, eng.z1 - 1.6) : inter.spawn.clone();
    const startW = start.clone().applyQuaternion(frame.quat).add(frame.pos);
    const fwdW = new THREE.Vector3(0, 0, -1).applyQuaternion(frame.quat);
    ctx.game.setMode('foot', { pos: startW, frame, interior: true, from: 'board' });
    this.foot.ctrl.place(startW, fwdW, anchor);
    // tripulação hostil
    const r = rng(hashStr(String(p.ship || 'nave')));
    const faction = p.faction === 'corsarios' ? 'corsarios' : p.faction === 'frente' ? 'frente' : 'hegemonia';
    for (const s of segs) {
      if (s === eng) continue;
      const n = s.kind === 'hold' ? 3 : s.kind === 'bridge' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const z = s.z0 + (s.z1 - s.z0) * (0.25 + r() * 0.5);
        const x = (r() - 0.5) * Math.max(0.2, s.W * 1.2);
        const kind = s.kind === 'bridge' && i === 0 ? 'officer' : s.kind === 'hold' && i === 2 ? 'heavy' : 'soldier';
        const e = this.foot.director.addEnemy({ kind, faction, anchor, pos: new THREE.Vector3(x, F, z), fwd: new THREE.Vector3(0, 0, 1), seed: hashStr('ab' + z + i), state: 'alert' });
        e.squad = { id: 'abordagem:' + p.ship };
        B.enemies.push(e);
      }
    }
    // console da ponte: hack para capturar
    const bridge = segs.find((s) => s.kind === 'bridge');
    const seat = inter.seat ? inter.seat.clone() : new THREE.Vector3(0, F, (bridge?.z0 ?? -10) + 1.5);
    B.removes.push(this.foot.interact.register({
      id: 'foot:abordagem:console', label: 'Invadir o console da ponte', sub: 'Assumir o controle da nave', radius: 2.4, priority: 1,
      getPos: (out) => out.copy(seat).add(new THREE.Vector3(0, 0.9, -0.6)).applyQuaternion(frame.quat).add(frame.pos),
      enabled: () => !B.captured,
      hack: { difficulty: 0.55, label: 'CONSOLE DA PONTE', onSuccess: () => this.capture() },
      onUse: () => { this.foot.api.setToolMode('hack'); this.foot.api.equip('multitool'); ctx.bus.emit('notify', { text: 'USE A MULTIFERRAMENTA (MODO INTRUSÃO) NO CONSOLE', kind: 'info' }); },
    }));
    // eclusa: voltar à própria nave
    B.removes.push(this.foot.interact.register({
      id: 'foot:abordagem:eclusa', label: 'Voltar à sua nave', sub: 'Eclusa de popa', radius: 2.2,
      getPos: (out) => out.copy(start).add(new THREE.Vector3(0, 1.2, 1.0)).applyQuaternion(frame.quat).add(frame.pos),
      onUse: () => this.leave(),
    }));
    ctx.bus.emit('objective', { id: 'abordagem', text: 'Abra caminho até a ponte e invada o console' });
    ctx.bus.emit('music', { mood: 'combat', intensity: 0.9 });
    ctx.bus.emit('notify', { text: 'ACOPLADO — ECLUSA ABERTA', kind: 'info' });
    return true;
  }

  capture() {
    const B = this.active; if (!B) return;
    B.captured = true;
    this.ctx.bus.emit('board:complete', { ship: B.p.ship, faction: B.p.faction });
    this.ctx.bus.emit('notify', { text: 'NAVE CAPTURADA — SISTEMAS SOB SEU CONTROLE', kind: 'reward' });
    for (const e of B.enemies) if (e.alive) { e.state = 'idle'; e.aware = 0; }
  }

  leave() {
    const ctx = this.ctx;
    this.end();
    const f = ctx.services.flight;
    if (f?.enterSeat) f.enterSeat(); else ctx.game.setMode('ship', {});
  }

  end() {
    const B = this.active; if (!B) return;
    for (const r of B.removes) r();
    for (const e of B.enemies) this.foot.director.removeEnemy(e);
    try { B.inter.remove?.(); } catch { /* */ }
    this.active = null;
  }

  update() {
    const B = this.active; if (!B) return;
    // acompanha o casco (pode estar à deriva)
    if (B.src?.pos) B.frame.pos.copy(B.src.pos);
    if (B.src?.quat) B.frame.quat.copy(B.src.quat);
    try { B.inter.update?.(this.foot.ctrl.local); } catch { /* */ }
  }
}
