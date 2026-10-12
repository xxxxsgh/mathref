// Execução de missões (campanha e procedurais): objetivos em sequência,
// avaliados por eventos do barramento e por estado do mundo. Cada objetivo
// tem reserva para quando o sistema dono da mecânica não existe (o jogo nunca
// trava esperando um evento que ninguém vai emitir).
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3();
const idOf = (x) => (x && typeof x === 'object' ? x.id : x) ?? null;

export class MissionRun {
  constructor(story, def, { procedural = false } = {}) {
    this.story = story;
    this.ctx = story.ctx;
    this.def = def;
    this.id = def.id;
    this.procedural = procedural;
    this.state = 'active';
    this.idx = -1;
    this.obj = null;
    this.t = 0;          // tempo no objetivo atual
    this.progress = null;
    this.count = 0;
    this.battle = null;
    this.data = {};      // estado livre do objetivo atual
  }

  get objective() { return this.obj; }
  get title() { return this.def.title; }

  start(resumeIdx = 0) {
    if (resumeIdx === 0) { try { this.def.onStart?.(this.story, this); } catch (e) { this.story.err('onStart ' + this.id, e); } }
    this.activate(resumeIdx);
  }

  activate(i) {
    const ctx = this.ctx, S = this.story;
    this.cleanupObjective();
    this.idx = i;
    this.obj = this.def.objectives[i] || null;
    this.t = 0; this.progress = null; this.count = 0; this.data = {};
    if (!this.obj) { this.finish(); return; }
    const o = this.obj;
    if (o.skipIf?.(S.state, S)) { this.activate(i + 1); return; }
    switch (o.type) {
      case 'scene':
        S.playScene(o.scene, this).then(() => this.done(o));
        break;
      case 'dialog':
        S.runDialog(o.dialog).then(() => this.done(o));
        break;
      case 'charge':
        this.progress = 0;
        try { ctx.services.flight?.setTarget?.(this.def.objectives[i + 1]?.system || null); } catch { /* sem voo */ }
        break;
      case 'jump':
        if (ctx.universe.systemId === o.system) { this.done(o); return; }
        try { ctx.services.flight?.setTarget?.(o.system); } catch { /* sem voo */ }
        if (o.force) this.data.autoT = o.delay ?? 3;
        break;
      case 'reach':
      case 'dock':
      case 'land':
        try { const tg = S.resolveTarget(o.target || o.station || o.body); if (tg && o.type !== 'land') ctx.services.flight?.setTarget?.(tg); } catch { /* */ }
        break;
      case 'battle':
        this.startBattle(o);
        break;
      case 'talk':
        break;
      default: break;
    }
    if (this.obj === o) this.announce();
  }

  /** Publica o objetivo (HUD/marcadores). */
  announce() {
    const o = this.obj; if (!o) return;
    const pos = this.markerPos(new THREE.Vector3());
    const tg = this.story.resolveTarget(o.target || o.station || o.body);
    const e = { id: `${this.id}:${this.idx}`, text: o.text || '', mission: this.def.title, pos: pos || null, bodyId: tg?.kind === 'body' ? tg.ref.id : null, progress: this.progress, procedural: this.procedural };
    this.story.setObjective(e);
  }

  markerPos(out) {
    const o = this.obj; if (!o) return null;
    const id = o.target || o.station || o.body;
    if (!id) return null;
    const tg = this.story.resolveTarget(id);
    return tg ? out.copy(tg.pos) : null;
  }

  async startBattle(o) {
    const ctx = this.ctx, combat = ctx.services.combat;
    if (combat?.startBattle) {
      try { this.battle = combat.startBattle(o.preset, { ...(o.opts || {}) }); } catch (e) { this.story.err('startBattle', e); this.battle = null; }
    }
    if (!this.battle) this.data.skirmish = this.story.skirmish(o.preset, o.opts || {});
  }

  done(o) {
    if (this.obj !== o || this.state !== 'active') return;
    try { o.onDone?.(this.story, this); } catch (e) { this.story.err('onDone', e); }
    this.activate(this.idx + 1);
  }

  onEvent(name, e) {
    const o = this.obj; if (!o || this.state !== 'active') return;
    const S = this.story, ctx = this.ctx;
    switch (o.type) {
      case 'dock':
        if (name === 'dock:complete' && idOf(e?.station) === o.station) this.done(o);
        break;
      case 'land':
        if (name === 'land' && idOf(e?.body) === o.body) this.done(o);
        break;
      case 'jump':
        if (name === 'jump:end' && e?.to === o.system) this.done(o);
        if (name === 'system:change' && e?.to === o.system && !ctx.services.flight) this.done(o);
        break;
      case 'scan':
        if (name === 'scan:discover' && (!o.kind || e?.kind === o.kind) && (!o.body || idOf(e?.body) === o.body)) {
          this.count++;
          if (this.count >= (o.count || 1)) this.done(o);
        }
        break;
      case 'kill':
        if (name === 'ship:destroyed' && e?.byPlayer && (!o.faction || e.faction === o.faction)) {
          this.count++;
          this.progress = this.count / (o.count || 1);
          this.announce();
          if (this.count >= (o.count || 1)) this.done(o);
        }
        break;
      case 'battle':
        if (name === 'battle:end' && this.battle && (e?.id === this.battle.id)) {
          if (e.result === 'derrota') { this.fail('A batalha foi perdida'); return; }
          this.battle = null;
          this.done(o);
        }
        break;
      case 'talk':
        if (name === 'npc:talk' && e?.npc === o.npc) this.startTalk(o);
        break;
      case 'flag':
        if (name === 'story:flag' && S.state.flags[o.flag]) this.done(o);
        break;
      default: break;
    }
  }

  startTalk(o) {
    if (this.data.talking) return;
    this.data.talking = true;
    this.story.runDialog(o.dialog || o.npc).then(() => this.done(o));
  }

  update(dt) {
    const o = this.obj; if (!o || this.state !== 'active') return;
    const ctx = this.ctx, S = this.story;
    this.t += dt;
    const p = ctx.player.ship ? ctx.player.pos : ctx.player.camWorld;
    switch (o.type) {
      case 'reach': {
        const tg = S.resolveTarget(o.target);
        if (tg && p.distanceTo(tg.pos) < (o.radius || 5000) + (tg.radius || 0)) this.done(o);
        break;
      }
      case 'dock': {
        // reserva: sem o sistema de estações, chegar perto basta
        if (!ctx.services.stations && !S.inCinematic) {
          const tg = S.resolveTarget(o.station);
          if (tg && p.distanceTo(tg.pos) < 8000) {
            if (!this.data.fakeDock) {
              this.data.fakeDock = true;
              S.radio(tg.ref.faction === 'frente' ? 'okonkwo' : 'meridiana', 'Aproximação confirmada. Plataforma liberada — bem-vindo a bordo.');
              S.lastDock = o.station;
              ctx.bus.emit('dock:complete', { station: tg.ref, simulated: true });
            }
          }
        }
        break;
      }
      case 'land': {
        // reserva: perto do chão do corpo certo (sem evento de pouso)
        const sh = ctx.player.ship;
        if (sh && sh.bodyId === o.body && sh.landed) this.done(o);
        else if (!ctx.services.flight && ctx.player.bodyId === o.body && ctx.player.altitude < 50) this.done(o);
        break;
      }
      case 'scan': {
        // reserva: sem scanner (foot/life), os sensores da nave detectam a ruína
        if (o.kind === 'ruin' && !ctx.services.foot && !ctx.services.life) {
          const b = o.body ? ctx.universe.system?.body(o.body) : null;
          const near = b ? b.altitudeOf(p) < 4000 : true;
          this.data.near = near ? (this.data.near || 0) + dt : 0;
          if (this.data.near > 5) {
            S.notify('SENSORES: ESTRUTURA DOS ARQUITETOS DETECTADA', 'reward');
            ctx.bus.emit('scan:discover', { kind: 'ruin', id: `${o.body}:ruina`, name: 'Ruína dos Arquitetos', body: o.body });
          }
        }
        break;
      }
      case 'talk': {
        // reserva: sem NPCs andando, a conversa começa ao atracar na estação certa
        const docked = ctx.player.ship?.docked ? idOf(ctx.player.ship.station) : null;
        const here = docked === o.station || (S.lastDock === o.station && (!ctx.services.stations || this.t > 1));
        if (here && this.t > 1.5 && !ctx.services.foot?.npcs) this.startTalk(o);
        break;
      }
      case 'charge': {
        this.progress = Math.min(1, this.t / (o.seconds || 30));
        this.data.ann = (this.data.ann || 0) + dt;
        if (this.data.ann > 0.5) { this.data.ann = 0; this.announce(); }
        if (this.progress >= 1) { S.notify('MOTOR DE SALTO CARREGADO', 'reward'); this.done(o); }
        break;
      }
      case 'wait':
        if (this.t >= (o.seconds || 1)) this.done(o);
        break;
      case 'jump':
        if (this.data.autoT !== undefined && !this.data.jumped) {
          this.data.autoT -= dt;
          // o jogador pode antecipar com J
          if (this.data.autoT <= 0 || (ctx.input.pressed('quantum') && this.t > 0.3)) { this.data.jumped = true; S.forceJump(o.system); }
        }
        break;
      case 'flag':
        if (S.state.flags[o.flag]) this.done(o);
        break;
      case 'battle': {
        const sk = this.data.skirmish;
        if (sk && sk.done) { this.data.skirmish = null; this.done(o); }
        break;
      }
      default: break;
    }
  }

  cleanupObjective() {
    if (this.data?.skirmish) { this.data.skirmish.stop?.(); this.data.skirmish = null; }
  }

  finish() {
    if (this.state !== 'active') return;
    this.state = 'done';
    this.cleanupObjective();
    const S = this.story;
    const r = this.def.reward;
    if (r) S.applyEffects({ credits: r.credits, rep: r.rep });
    try { this.def.onComplete?.(S, this); } catch (e) { S.err('onComplete ' + this.id, e); }
    this.ctx.bus.emit('mission:complete', { mission: this.summary() });
    S.onMissionDone(this);
  }
  fail(reason = '') {
    if (this.state !== 'active') return;
    this.state = 'failed';
    this.cleanupObjective();
    this.ctx.bus.emit('mission:fail', { mission: this.summary(), reason });
    this.story.onMissionFailed(this, reason);
  }
  summary() {
    return { id: this.id, title: this.def.title, giver: this.def.giver, faction: this.def.faction, procedural: this.procedural, type: this.def.type || 'campanha', objective: this.obj?.text || '', idx: this.idx, reward: this.def.reward || null };
  }
  serialize() { return { id: this.id, idx: Math.max(0, this.idx), procedural: this.procedural, def: this.procedural ? this.def.raw : undefined }; }
}
