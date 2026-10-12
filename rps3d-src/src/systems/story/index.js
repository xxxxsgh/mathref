// Sistema `story` — narrativa e fluxo de jogo do RPS3D.
//
//  • título cinematográfico no motor (Novo jogo / Continuar / Configurações)
//  • abertura em Halden: batalha sobre a colônia Aurora, a ordem de
//    bombardeio (escolha), a traição, a fuga sob fogo e o salto para Kessa
//  • cenas no motor: diretor de câmera, letterbox, legendas, DoF, câmera lenta
//  • campanha em 3 atos (campaign.js) com missões encadeadas e finais
//    conforme escolhas e reputação
//  • reputação independente por facção (services.factions)
//  • missões procedurais e quadro de missões por estação (services.missions)
//  • diálogos com escolhas, rádio das facções, objetivos com marcadores
//  • save/load do progresso (ctx.save 'story')
//
// Serviços:
//   story    { state, act, mission, objective, newGame(), continueGame(), skip(),
//              say(who,text), radio(who|faction,text,speaker?), dialog(id|spec) → Promise<escolha>,
//              playScene(nome), setFlag(k,v), flag(k), director, stage, ui, chapter(n) }
//   factions { rep(f), change(f,d), hostile(a,b), standing(f), all(), setHostile(a,b,v) }
//   missions { available(stationId), accept(id|oferta), active(), complete(id), abandon(id), track(id), board(stationId) }
//
// Emite: radio, dialog:choice, objective, notify, music, rep:change,
// credits:change, mission:accept/complete/fail, story:flag, story:act,
// story:defect, game:new. Escuta: ship:destroyed, dock:complete, land,
// jump:end, scan:discover, battle:end, npc:talk, player:death, system:change.
import * as THREE from 'three/webgpu';
import { StoryUI } from './ui.js';
import { Director } from './cinema.js';
import { Stage, loopMotion } from './stage.js';
import { Factions } from './factions.js';
import { MissionBoard, TYPES } from './missions.js';
import { MissionRun } from './objectives.js';
import { MISSION_BY_ID, DIALOGS, CHARACTERS, ACTS, CHATTER } from './campaign.js';
import { SCENES } from './scenes.js';
import { Title } from './title.js';
import { haldenFrame, buildAuroraCast, LINES } from './opening.js';
import { arrivalPose } from './scenes.js';
import { registerShots } from './shots.js';
import { PRESETS } from '../../core/Quality.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const GRADE0 = { saturation: 1.12, contrast: 1.12, vignette: 0.32, tint: '#ffffff', lift: '#000000' };

function freshState() {
  return {
    v: 1, started: false, act: 1, mission: null, missionIdx: 0,
    flags: {}, choices: {}, completed: [], side: [], taken: [], tracked: null,
    credits: 0, ending: null, lastDock: null, playTime: 0, checkpoint: null, revealed: [],
  };
}

const S = {
  ctx: null, ui: null, dir: null, stage: null, factions: null, board: null, title: null,
  state: freshState(),
  run: null, side: [], kills: 0, cast: null, frame: null, battle: null, beams: null,
  objective: null, inCinematic: false, dormant: false, booted: false,
  radioQ: [], radioT: 0, chatterT: 90, skipHold: 0, slow: null, cockpitMsg: null, deathT: 0,
  lastNow: 0, navT: 0,

  err(where, e) { this.ctx.errors.push(`story ${where}: ${e?.stack || e}`); console.error('[story]', where, e); },

  // ── jogador ────────────────────────────────────────────────────────────
  playerPose() {
    const f = this.ctx.services.flight;
    if (f?.state && f.pose) { const p = f.pose(); p.vel = f.state.vel; return p; }
    return { pos: this.ctx.player.camWorld, quat: this.ctx.camera.quaternion, vel: this.ctx.player.vel };
  },
  spawnPlayer(pos, quat, opts = {}) {
    const f = this.ctx.services.flight;
    if (!f?.spawnPlayerShip) { this.ctx.player.camWorld.copy(pos); this.ctx.camera.quaternion.copy(quat); return null; }
    try { return f.spawnPlayerShip(pos, quat, opts.classId || 'fighter', { faction: 'hegemonia', ...opts }); } catch (e) { this.err('spawnPlayer', e); return null; }
  },

  // ── fala / rádio / diálogo ─────────────────────────────────────────────
  who(id) { return CHARACTERS[id] || { name: String(id || '').toUpperCase(), faction: id }; },
  /** Fala de cena: legenda (+ evento de rádio para áudio). Resolve ao fim da fala. */
  say(whoId, text, { hold = false } = {}) {
    const c = this.who(whoId);
    const subs = this.ctx.prefs?.subtitles !== false;
    const dur = subs ? this.ui.subtitle(c.name, text, { faction: c.faction, channel: c.channel, seconds: hold ? 1e6 : null }) : Math.max(2.6, 1.2 + text.length * 0.058);
    this.ctx.bus.emit('radio', { faction: c.faction, speaker: c.name, text, priority: 3, story: true, subtitle: true });
    return hold ? Promise.resolve() : this.dir.wait(dur);
  },
  /** Rádio de jogo (fila). who: personagem ou facção. */
  radio(whoId, text, speaker = null) {
    const c = CHARACTERS[whoId] || { name: speaker || this.ctx.universe.FACTIONS[whoId]?.name?.toUpperCase() || 'RÁDIO', faction: whoId };
    this.radioQ.push({ faction: c.faction, speaker: speaker || c.name, text, priority: 2 });
  },
  pumpRadio(dt) {
    if (this.radioT > 0) { this.radioT -= dt; return; }
    const e = this.radioQ.shift(); if (!e) return;
    this.ctx.bus.emit('radio', e);
    if (!this.ctx.services.hud) {
      if (this.ui.lbValue > 0.5) this.ui.subtitle(e.speaker, e.text, { faction: e.faction });
      else this.ui.radio(e);
    }
    this.radioT = Math.max(3.2, 1.4 + e.text.length * 0.055);
  },
  async runDialog(idOrSpec, { keepSubtitle = false } = {}) {
    const ctx = this.ctx;
    const d = typeof idOrSpec === 'string' ? DIALOGS[idOrSpec] : idOrSpec;
    const id = typeof idOrSpec === 'string' ? idOrSpec : d?.id || 'dialogo';
    if (!d) return null;
    for (const l of d.lines || []) await this.say(l.who, l.text);
    let choice = null;
    if (d.choices?.length) {
      const opts = d.choices.filter((c) => this.meets(c.requires));
      ctx.input.enabled = false;
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* */ }
      if (!keepSubtitle) this.ui.clearSubtitle();
      const hud = ctx.services.hud;
      ctx.bus.emit('dialog', { speaker: d.prompt, text: d.lines?.at(-1)?.text || '', choices: opts.map((c) => ({ id: c.id, text: c.text })), story: true });
      if (hud?.choose) choice = await hud.choose(d.prompt, opts, { timeout: d.timeout, defaultId: d.default });
      else choice = await this.ui.choose(d.prompt, opts, { timeout: this.ctx.shot ? 0 : (d.timeout || 0), defaultId: d.default });
      ctx.input.enabled = true;
      choice = choice || d.default || opts[0].id;
      const c = opts.find((x) => x.id === choice) || opts[0];
      this.state.choices[id] = choice;
      this.applyEffects(c.effects || {});
      ctx.bus.emit('dialog:choice', { dialog: id, choice });
      const after = d.after?.[choice];
      if (after) for (const l of after) await this.say(l.who, l.text);
    }
    return choice;
  },
  meets(req) {
    if (!req) return true;
    for (const [f, v] of Object.entries(req.rep || {})) if (this.factions.rep(f) < v) return false;
    for (const [k, v] of Object.entries(req.flags || {})) if (this.state.flags[k] !== v) return false;
    return true;
  },
  applyEffects(e = {}) {
    for (const [f, d] of Object.entries(e.rep || {})) this.factions.change(f, d, 'escolha');
    for (const [k, v] of Object.entries(e.flags || {})) this.setFlag(k, v);
    if (e.credits) this.giveCredits(e.credits);
  },
  giveCredits(n) {
    const eco = this.ctx.services.economy;
    let ok = false;
    try { if (eco?.addCredits) { eco.addCredits(n, 'missão'); ok = true; } } catch { ok = false; }
    if (!ok) {
      this.state.credits += n;
      this.ctx.bus.emit('credits:change', { value: this.state.credits, delta: n });
    }
    this.notify(`+${n.toLocaleString('pt-BR')} CRÉDITOS`, 'reward');
  },
  setFlag(k, v = true) { this.state.flags[k] = v; this.ctx.bus.emit('story:flag', { flag: k, value: v }); },
  notify(text, kind = 'info') {
    this.ctx.bus.emit('notify', { text, kind, story: true });
    if (!this.ctx.services.hud) this.ui.toast(text, kind);
  },
  setObjective(e) {
    this.objective = e;
    this.ctx.bus.emit('objective', e || { id: null, text: '' });
    if (!this.ctx.services.hud) this.ui.objective(e);
  },
  music(mood, intensity = 0.5) { this.ctx.bus.emit('music', { mood, intensity }); },

  // ── alvos ──────────────────────────────────────────────────────────────
  resolveTarget(id) {
    if (!id) return null;
    const sys = this.ctx.universe.system;
    if (!sys) return null;
    if (typeof id === 'object' && id.pos) return { kind: id.radius ? 'body' : 'station', ref: id, pos: id.pos, radius: id.radius || 0, name: id.name };
    const b = sys.body(id);
    if (b) return { kind: 'body', ref: b, pos: b.pos, radius: b.radius, name: b.name };
    const st = sys.station(id);
    if (st) return { kind: 'station', ref: st, pos: st.pos, radius: 0, name: st.name };
    const p = sys.pois.find((x) => x.id === id);
    if (p) return { kind: 'poi', ref: p, pos: p.pos, radius: 0, name: sys.body(p.near)?.name || 'Sinal' };
    return null;
  },
  revealStation(id) {
    const sys = this.ctx.universe.galaxy.system(String(id).split(':')[0]);
    const st = sys?.station(id);
    if (st) st.hidden = false;
    if (!this.state.revealed.includes(id)) this.state.revealed.push(id);
    this.notify(`COORDENADAS RECEBIDAS — ${st?.name?.toUpperCase() || id}`, 'reward');
  },

  // ── cenas ──────────────────────────────────────────────────────────────
  async playScene(name, run) {
    const fn = SCENES[name];
    if (!fn) { this.err('cena', `desconhecida: ${name}`); return; }
    this.inCinematic = true;
    try { await fn(this, run); } catch (e) { this.err('cena ' + name, e); this.recoverFromScene(); }
    this.inCinematic = false;
    this.dir.endSkip();
  },
  recoverFromScene() {
    const ctx = this.ctx;
    this.dir.release(); this.dir.endSkip();
    this.ui.letterbox(0); this.ui.fade(0, 0.4); this.ui.hideCard(); this.ui.cancelChoice(); this.ui.showSkip(false);
    ctx.input.enabled = true;
    this.slowmo(1, 0.2);
    if (ctx.player.ship && ctx.game.mode !== 'ship') ctx.game.setMode('ship');
  },
  slowmo(scale, seconds = 1) { this.slow = { from: this.ctx.time.scale, to: scale, t: 0, dur: Math.max(0.01, seconds) }; },
  grade(o) {
    const r = this.ctx.services.rendering;
    if (!r?.setGrade) return;
    try { r.setGrade(o ? { ...GRADE0, ...o } : GRADE0); } catch { /* */ }
  },
  cockpitMessage(message, warnings = []) { this.cockpitMsg = message ? { message, warnings } : null; },

  /** Deserção: reputação, hostilidade e o combate. */
  defect(choice) {
    const ctx = this.ctx;
    this.setFlag('desertou', true);
    this.state.choices.ordem = this.state.choices.ordem || choice;
    this.factions.set('hegemonia', -85);
    this.factions.change('frente', 15, 'deserção');
    try { ctx.services.combat?.defect?.(); } catch (e) { this.err('defect', e); }
    // o combate pode ter sua própria matriz: reaplica
    this.factions.sync();
    ctx.bus.emit('story:defect', { choice });
    // sem combat: o palco reage (alas viram inimigas)
    if (this.cast) for (const a of this.cast.wing) if (a.alive) { a.faction = 'hegemonia'; a.fire = { rate: 1.1, burst: 4, color: 'gold', range: 1500, spread: 0.035 }; }
  },
  /** Tiros cenográficos do caça do jogador em direção a um alvo (palco). */
  playerShoot(targetFn, actor = null) {
    const ctx = this.ctx, r = ctx.services.rendering;
    const p = this.playerPose();
    const tgt = typeof targetFn === 'function' ? targetFn() : targetFn;
    if (!r?.particles || !tgt?.pos) return;
    const inst = ctx.services.flight?.instance;
    const hp = inst?.hardpoints?.filter((h) => h.type === 'gun') || [];
    const ms = hp.length ? hp.map((h) => h.pos.clone().applyQuaternion(p.quat).add(p.pos)) : [p.pos.clone().add(V3(0, -1, -8).applyQuaternion(p.quat))];
    for (const m of ms) {
      const d = _v.copy(tgt.pos).sub(m).normalize();
      d.x += (Math.random() - 0.5) * 0.01; d.y += (Math.random() - 0.5) * 0.01; d.normalize();
      r.particles.bolt(m, d, { color: 'gold', speed: 1600, length: 18, width: 0.45, brightness: 38, vel: p.vel || null });
    }
    if (actor?.alive && Math.random() < 0.6) {
      const hit = actor.pos.clone().add(V3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 8));
      setTimeout(() => { if (actor.alive) r.particles.sparks(hit, null, 26, { energy: Math.random() < 0.5, speed: 40 }); }, 120);
      ctx.bus.emit('ship:hit', { target: actor.inst?.id || actor.id, owner: 'player', damage: 8, pos: hit, shield: Math.random() < 0.5 });
    }
  },
  /** Sem combat: as naves do palco passam a caçar o jogador. */
  huntPlayer() {
    if (this.ctx.services.combat?.startBattle) return;
    const center = (out) => out.copy(this.playerPose().pos);
    const p0 = this.playerPose();
    const F = V3(0, 0, -1).applyQuaternion(p0.quat), U = V3(0, 1, 0).applyQuaternion(p0.quat);
    let i = 0;
    for (const a of this.stage.actors) {
      if (!a.alive || a.faction !== 'hegemonia' || a.classId === 'carrier' || a.classId === 'destroyer') continue;
      const ph = i++ * 1.1;
      a.motion = loopMotion({ center, e1: F.clone().applyAxisAngle(U, ph), e2: U, R: 380 + (i % 3) * 120, w: 0.3 + (i % 2) * 0.05, phase: ph, wobble: 90 });
      a.target = { get pos() { return S.playerPose().pos; }, get vel() { return S.ctx.player.vel; } };
      a.fire = { rate: 1.4, burst: 4, color: 'gold', range: 1600, spread: 0.05 };
    }
  },
  /** Batalha de reserva (sem combat): bando encenado ao redor do jogador. */
  skirmish(preset, opts = {}) {
    const fac = opts.faction || (preset === 'vigilantes' ? 'vigilantes' : preset === 'patrulha' || preset === 'interdicao' || preset === 'final' ? 'hegemonia' : 'corsarios');
    const n = Math.min(6, opts.count || (preset === 'final' ? 6 : 3));
    const p0 = this.playerPose();
    const F = V3(0, 0, -1).applyQuaternion(p0.quat), U = V3(0, 1, 0).applyQuaternion(p0.quat);
    const center = (out) => out.copy(this.playerPose().pos).addScaledVector(F, 300);
    const actors = [];
    for (let i = 0; i < n; i++) {
      const a = this.stage.add({ classId: fac === 'vigilantes' ? 'fighter' : i % 3 === 2 ? 'interceptor' : 'fighter', faction: fac, seed: 300 + i, throttle: 1, motion: loopMotion({ center, e1: F.clone().applyAxisAngle(U, i), e2: U.clone().applyAxisAngle(F, i * 0.7), R: 420 + i * 70, w: 0.28, phase: i * 1.3, wobble: 80 }) });
      a.target = { get pos() { return S.playerPose().pos; }, get vel() { return S.ctx.player.vel; } };
      a.fire = { rate: 1.6, burst: 3, range: 1500, spread: 0.06 };
      actors.push(a);
    }
    this.radio(fac === 'vigilantes' ? 'vigia' : fac, fac === 'vigilantes' ? 'INTRUSO. A PORTA NÃO É SUA.' : fac === 'hegemonia' ? 'Contato hostil: o desertor! Abram fogo!' : 'Cerquem o peixe!', fac === 'vigilantes' ? null : fac === 'hegemonia' ? 'PATRULHA SOLAR' : 'CORSÁRIOS');
    const sk = { done: false, actors, timer: null, stop() { this.done = true; for (const a of actors) if (a.alive) a.dispose(); } };
    let k = 0;
    sk.timer = this.stage.after(9, () => {
      const a = actors.find((x) => x.alive);
      if (a) { a.explode(); this.kills++; this.ctx.bus.emit('ship:destroyed', { id: a.id, faction: a.faction, pos: a.pos.clone(), byPlayer: true, size: a.radius }); }
      if (!actors.some((x) => x.alive) || ++k > 10) { sk.done = true; sk.timer.every = 0; }
    }, 5);
    return sk;
  },

  /** Salto forçado (a abertura não depende do alcance do motor). */
  forceJump(system) {
    const ctx = this.ctx, f = ctx.services.flight;
    const arrival = system === 'kessa' ? kessaArrival(ctx) : null;
    if (f?.jumpTo) { try { if (f.jumpTo(system, { force: true, arrival })) return true; } catch (e) { this.err('jumpTo', e); } }
    ctx.universe.setSystem(system);
    if (arrival) { ctx.player.camWorld.copy(arrival.pos); }
    ctx.bus.emit('jump:end', { from: null, to: system });
    return true;
  },
  /** Início da fuga: rádio, música e caçadores. */
  fugaStart() {
    this.music('combat', 1);
    const lines = LINES.flight.slice();
    this.stage.after(1.5, () => { const l = lines.shift(); if (l) this.radio(l[0], l[1]); }, 7.5);
    if (!this.cast && this.ctx.universe.systemId === 'halden') {
      // retomada (save/morte): monta o palco de novo
      const fr = haldenFrame(this.ctx);
      if (fr) { this.frame = fr; this.cast = buildAuroraCast(this, fr); this.defect('recusar'); }
    }
    this.huntPlayer();
  },

  // ── campanha ───────────────────────────────────────────────────────────
  startMission(id, idx = 0) {
    const def = MISSION_BY_ID[id];
    if (!def) { this.run = null; this.state.mission = null; this.setObjective(null); return; }
    const prevAct = this.state.act;
    this.state.mission = id; this.state.missionIdx = idx;
    if (def.act !== prevAct) { this.state.act = def.act; this.ctx.bus.emit('story:act', { act: def.act }); if (def.act > 1 && idx === 0) this.chapter(def.act); }
    this.checkpoint();
    this.run = new MissionRun(this, def);
    this.ctx.bus.emit('mission:accept', { mission: this.run.summary() });
    this.run.start(idx);
  },
  chapter(n) {
    const a = ACTS[n]; if (!a) return;
    this.ui.location(`${a.kicker} · ${a.title}`, a.sub, 7);
    this.music('cinematic', 0.6);
  },
  onMissionDone(run) {
    if (run.procedural) {
      this.side = this.side.filter((r) => r !== run);
      this.board.taken.add(run.id);
      this.notify(`MISSÃO CONCLUÍDA — ${run.title.toUpperCase()}`, 'reward');
      if (this.state.tracked === run.id) this.state.tracked = null;
      this.refreshObjective();
      this.save();
      return;
    }
    if (!this.state.completed.includes(run.id)) this.state.completed.push(run.id);
    const next = typeof run.def.next === 'function' ? run.def.next(this.state, this) : run.def.next;
    if (next) this.startMission(next);
    else { this.run = null; this.state.mission = null; this.refreshObjective(); }
    this.save();
  },
  onMissionFailed(run, reason) {
    this.notify(`MISSÃO FALHOU${reason ? ' — ' + reason.toUpperCase() : ''}`, 'warn');
    if (run.procedural) { this.side = this.side.filter((r) => r !== run); this.refreshObjective(); return; }
    this.startMission(run.id, 0);
  },
  refreshObjective() {
    const tracked = this.side.find((r) => r.id === this.state.tracked);
    const r = tracked || this.run || this.side[0];
    if (r) r.announce(); else this.setObjective(null);
  },
  checkpoint() {
    const ctx = this.ctx;
    const f = ctx.services.flight;
    if (!f?.state) return;
    const p = f.pose();
    this.state.checkpoint = { system: ctx.universe.systemId, pos: p.pos.toArray(), quat: p.quat.toArray(), mission: this.state.mission };
  },

  // ── fluxo ──────────────────────────────────────────────────────────────
  async hasSave() { try { return !!(await this.ctx.save.hasSave()) && this.state.started; } catch { return false; } },
  saveLabel() {
    const m = MISSION_BY_ID[this.state.mission];
    const a = ACTS[this.state.act];
    return m ? `${a?.kicker || ''} · ${m.title}` : this.state.ending ? 'Pós-campanha' : '';
  },
  locationLabel() {
    const ctx = this.ctx, sys = ctx.universe.system;
    const b = ctx.player.ship?.body;
    return `${sys?.name?.toUpperCase() || ''}${b ? ' · ' + b.name.toUpperCase() : ''}`;
  },
  newGame() {
    const ctx = this.ctx;
    this.title.exit();
    this.ui.fade(1, 0.8);
    setTimeout(async () => {
      try { await ctx.save.wipe?.(); } catch { /* */ }
      for (const r of this.side) r.cleanupObjective();
      this.side = []; this.run = null;
      this.state = freshState();
      this.state.started = true;
      this.board.taken.clear();
      this.factions.reset();
      ctx.bus.emit('game:new', {});
      this.dir.release();
      this.startMission('a1_ordem');
    }, 850);
  },
  continueGame() {
    const ctx = this.ctx;
    this.title.exit();
    this.ui.fade(1, 0.6);
    setTimeout(() => {
      this.dir.release();
      this.stage.clear();
      const cp = this.state.checkpoint;
      if (!ctx.player.ship) {
        if (cp) {
          if (cp.system && ctx.universe.systemId !== cp.system) ctx.universe.setSystem(cp.system);
          this.spawnPlayer(new THREE.Vector3().fromArray(cp.pos), new THREE.Quaternion().fromArray(cp.quat), { enter: false });
        } else {
          const fr = haldenFrame(ctx);
          if (fr) this.spawnPlayer(fr.C, fr.q, { enter: false });
        }
      }
      ctx.game.setMode('ship', { from: 'title' });
      this.ui.fade(0, 1.2);
      this.ui.letterbox(0);
      this.music('explore', 0.4);
      // retoma missões
      const id = this.state.mission;
      if (id && MISSION_BY_ID[id]) {
        // cenas não se retomam no meio: recomeçam do início da missão
        const def = MISSION_BY_ID[id];
        const idx = def.objectives[this.state.missionIdx]?.type === 'scene' ? 0 : this.state.missionIdx;
        if (id === 'a1_ordem' || id === 'a1_fuga') this.startMission('a1_ordem', 0);
        else this.startMission(id, idx);
      }
      for (const raw of this.state.side || []) this.acceptOffer(raw.def, raw.idx, true);
      this.ui.location(this.locationLabel(), this.saveLabel(), 5);
    }, 650);
  },
  save() { if (!this.ctx.shot) this.ctx.save.write().catch?.(() => {}); },
  setQuality(name) {
    const ctx = this.ctx;
    if (!PRESETS[name]) return;
    const keep = ctx.quality;
    for (const k of Object.keys(keep)) delete keep[k];
    Object.assign(keep, { name, ...structuredClone(PRESETS[name]) });
    keep.dynamicScale = keep.renderScale;
    ctx.resize?.();
    ctx.bus.emit('quality:change', { name });
    ctx.prefs = { ...(ctx.prefs || {}), quality: name };
    ctx.save.setPrefs(ctx.prefs).catch?.(() => {});
  },
  applyPrefs(write = true) {
    const ctx = this.ctx, p = ctx.prefs || {};
    ctx.input.sensitivity = 0.0022 * (p.sensitivity ?? 1);
    ctx.input.invertY = !!p.invertY;
    try { ctx.services.audio?.setVolume?.(p.volume ?? 0.8); } catch { /* */ }
    ctx.bus.emit('prefs:change', { ...p });
    if (write) ctx.save.setPrefs(p).catch?.(() => {});
  },

  // ── missões procedurais ────────────────────────────────────────────────
  acceptOffer(o, idx = 0, silent = false) {
    if (!o || this.side.some((r) => r.id === o.id)) return false;
    if (this.side.length >= 5) { this.notify('LIMITE DE MISSÕES ATIVAS', 'warn'); return false; }
    const run = new MissionRun(this, this.board.toDef(o), { procedural: true });
    this.side.push(run);
    this.board.taken.add(o.id);
    if (!silent) this.ctx.bus.emit('mission:accept', { mission: run.summary() });
    run.start(idx);
    this.state.tracked = run.id;
    return true;
  },
  missionsApi() {
    return {
      available: (stationId) => this.board.available(stationId),
      board: (stationId) => this.board.available(stationId),
      accept: (x) => {
        let o = x;
        if (typeof x === 'string') {
          const sys = this.ctx.universe.system;
          for (const st of sys?.stations || []) { o = this.board.available(st.id).find((m) => m.id === x); if (o) break; }
        }
        return this.acceptOffer(o);
      },
      active: () => [...(this.run ? [this.run.summary()] : []), ...this.side.map((r) => r.summary())],
      complete: (id) => { const r = id === this.run?.id ? this.run : this.side.find((x) => x.id === id); if (r) { r.finish(); return true; } return false; },
      abandon: (id) => { const r = this.side.find((x) => x.id === id); if (!r) return false; r.cleanupObjective(); this.side = this.side.filter((x) => x !== r); this.ctx.bus.emit('mission:fail', { mission: r.summary(), reason: 'abandonada' }); this.refreshObjective(); return true; },
      track: (id) => { this.state.tracked = id; this.refreshObjective(); },
      types: () => ({ ...TYPES }),
    };
  },

  // ── save ───────────────────────────────────────────────────────────────
  serialize() {
    const st = this.state;
    st.missionIdx = this.run ? Math.max(0, this.run.idx) : 0;
    st.side = this.side.map((r) => ({ def: r.def.raw, idx: Math.max(0, r.idx) }));
    st.taken = [...this.board.taken].slice(-200);
    return { state: st, factions: this.factions.serialize() };
  },
  deserialize(d) {
    if (!d?.state) return;
    this.state = { ...freshState(), ...d.state };
    this.factions.deserialize(d.factions);
    this.board.taken = new Set(this.state.taken || []);
    for (const id of this.state.revealed || []) { const sys = this.ctx.universe.galaxy.system(String(id).split(':')[0]); const st = sys?.station(id); if (st) st.hidden = false; }
  },
};
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Ponto de chegada em Kessa (perto de Verídia, enquadramento da cena). */
function kessaArrival(ctx) {
  const sys = ctx.universe.galaxy.system('kessa');
  const a = arrivalPose(ctx, sys);
  return { pos: a.pos, near: a.ver.id, kind: 'arrival' };
}

// ─── entrada (título, escolhas, pular cena) ─────────────────────────────────
function onKey(e) {
  const ui = S.ui;
  if (!ui || S.dormant) return;
  const k = e.code;
  if (ui.choosing) {
    if (/^Digit[1-9]$/.test(k)) { ui.pickChoice(Number(k.slice(5)) - 1); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'KeyW') ui.selectChoice(ui.choiceState.sel - 1);
    else if (k === 'ArrowDown' || k === 'KeyS') ui.selectChoice(ui.choiceState.sel + 1);
    else if (k === 'Enter' || k === 'Space') { ui.pickChoice(); e.preventDefault(); }
    return;
  }
  if (S.title?.active) {
    if (ui.optRows) {
      if (k === 'ArrowUp' || k === 'KeyW') { ui.optSel = (ui.optSel - 1 + ui.optRows.length) % ui.optRows.length; ui.optRender(); }
      else if (k === 'ArrowDown' || k === 'KeyS') { ui.optSel = (ui.optSel + 1) % ui.optRows.length; ui.optRender(); }
      else if (k === 'Enter' || k === 'Space' || k === 'ArrowRight' || k === 'KeyD') { ui.optRows[ui.optSel]?.next?.(); ui.optRows && ui.optRender(); }
      else if (k === 'Escape' || k === 'Backspace') ui.optBack?.();
      return;
    }
    if (k === 'ArrowUp' || k === 'KeyW') ui.stepMenu(-1);
    else if (k === 'ArrowDown' || k === 'KeyS') ui.stepMenu(1);
    else if (k === 'Enter' || k === 'Space') { ui.activateMenu(); e.preventDefault(); }
    return;
  }
  if (k === 'Escape' && S.inCinematic && S.ui.el.skip.classList.contains('on')) S.dir.skip();
}

/** Gamepad/toque genéricos via ctx.input (passo fixo). */
function navInput(dt, ctx) {
  const inp = ctx.input, ui = S.ui;
  const y = inp.axis?.('moveY') || 0;
  S.navT -= dt;
  const dirY = Math.abs(y) > 0.6 && S.navT <= 0 ? (y > 0 ? -1 : 1) : 0;
  if (dirY) S.navT = 0.22;
  if (Math.abs(y) < 0.3) S.navT = 0;
  if (ui.choosing) {
    if (dirY && inp.device === 'gamepad') ui.selectChoice(ui.choiceState.sel + dirY);
    if (inp.pressed('confirm') && inp.device === 'gamepad') ui.pickChoice();
    return;
  }
  if (S.title?.active) {
    if (dirY && inp.device === 'gamepad') { if (ui.optRows) { ui.optSel = (ui.optSel + dirY + ui.optRows.length) % ui.optRows.length; ui.optRender(); } else ui.stepMenu(dirY); }
    if (inp.pressed('confirm') && inp.device === 'gamepad') { if (ui.optRows) { ui.optRows[ui.optSel]?.next?.(); ui.optRows && ui.optRender(); } else ui.activateMenu(); }
    return;
  }
  // segurar confirmar para pular cena
  if (S.inCinematic && ui.el.skip.classList.contains('on') && inp.down('confirm')) {
    S.skipHold += dt;
    if (S.skipHold > 0.8) { S.skipHold = 0; S.dir.skip(); }
  } else S.skipHold = 0;
}

/** Marcador do objetivo (reserva sem hud): projeta a posição na tela. */
const _proj = new THREE.Vector3();
function objectiveMarker(ctx) {
  const ui = S.ui, o = S.objective;
  if (ctx.services.hud || !o?.pos || ctx.game.mode === 'title' || ctx.game.mode === 'cinematic' || ui.lbValue > 0.5) { ui.marker(0, 0, '', false); return; }
  const cam = ctx.camera;
  const dist = o.pos.distanceTo(ctx.player.camWorld);
  _proj.copy(o.pos).sub(ctx.player.camWorld).applyQuaternion(_q.copy(cam.quaternion).invert());
  const behind = _proj.z > 0;
  _proj.applyMatrix4(cam.projectionMatrix);
  let x = _proj.x, y = _proj.y;
  if (behind) { x = -x; y = -y; }
  const m = Math.max(Math.abs(x), Math.abs(y));
  if (behind || m > 0.92) { x = x / Math.max(m, 1e-3) * 0.92; y = y / Math.max(m, 1e-3) * 0.92; }
  const W = innerWidth, H = innerHeight;
  const km = dist > 1e6 ? `${(dist / 1e6).toFixed(1)} Mm` : dist > 1000 ? `${(dist / 1000).toFixed(dist > 1e5 ? 0 : 1)} km` : `${Math.round(dist)} m`;
  ui.marker((x * 0.5 + 0.5) * W, (-y * 0.5 + 0.5) * H, km, true);
}

let api = null;

export default {
  name: 'story',
  order: 55,
  async init(ctx) {
    S.ctx = ctx;
    const shotName = ctx.params.get('shot');
    S.dormant = !!shotName && !shotName.startsWith('story-');
    S.factions = new Factions(ctx, ctx.universe.FACTIONS);
    S.ui = new StoryUI(ctx, ctx.universe.FACTIONS);
    S.dir = new Director(ctx);
    S.stage = new Stage(ctx);
    S.board = new MissionBoard(S);
    S.title = new Title(S);
    S.lastNow = ctx.time.now;

    api = {
      get state() { return S.state; },
      get act() { return S.state.act; },
      get mission() { return S.run?.summary() || null; },
      get objective() { return S.objective; },
      get inCinematic() { return S.inCinematic; },
      newGame: () => S.newGame(), continueGame: () => S.continueGame(),
      skip: () => S.dir.skip(),
      say: (w, t) => S.say(w, t), radio: (w, t, sp) => S.radio(w, t, sp),
      dialog: (x) => S.runDialog(x), playScene: (n) => S.playScene(n),
      setFlag: (k, v) => S.setFlag(k, v), flag: (k) => S.state.flags[k],
      chapter: (n) => S.chapter(n), startMission: (id, i) => S.startMission(id, i),
      characters: CHARACTERS, acts: ACTS,
      get director() { return S.dir; }, get stage() { return S.stage; }, get ui() { return S.ui; },
    };
    ctx.provide('story', api);
    ctx.provide('factions', S.factions.api());
    ctx.provide('missions', S.missionsApi());
    ctx.save.register('story', { serialize: () => S.serialize(), deserialize: (d) => S.deserialize(d) });
    if (ctx.prefs) S.applyPrefs(false);

    addEventListener('keydown', onKey);
    const bus = ctx.bus;
    const relay = (name) => bus.on(name, (e) => {
      if (S.dormant) return;
      S.run?.onEvent(name, e);
      for (const r of S.side.slice()) r.onEvent(name, e);
    });
    for (const n of ['dock:complete', 'land', 'jump:end', 'system:change', 'scan:discover', 'ship:destroyed', 'battle:end', 'npc:talk', 'story:flag']) relay(n);
    bus.on('ship:destroyed', (e) => {
      if (S.dormant || !e) return;
      if (e.byPlayer) {
        S.kills++;
        if (e.faction && e.faction !== 'player' && S.state.started) {
          S.factions.change(e.faction, e.size > 100 ? -8 : -2, 'abate');
          for (const f of S.factions.list) if (f !== e.faction && S.factions.hostile(f, e.faction) && f !== 'vigilantes') S.factions.change(f, 1, 'abate');
        }
      }
    });
    bus.on('dock:complete', (e) => { const id = e?.station?.id ?? e?.station; if (id) { S.state.lastDock = id; S.lastDock = id; } });
    bus.on('undock', () => { S.lastDock = null; });
    bus.on('player:death', () => { if (!S.dormant && !ctx.shot) S.deathT = 3.5; });
    bus.on('system:change', (e) => {
      if (S.dormant) return;
      // atores de outro sistema somem (o salto não carrega a cena junto)
      if (e?.from && e.from !== e.to && !S.title?.active) { S.stage.clear(); S.cast = null; S.beams = null; }
    });
    bus.on('jump:end', (e) => { if (!S.dormant && e?.to === 'kessa' && S.state.mission === 'a1_fuga') { /* a missão a1_chegada roda a cena */ } });
    bus.on('mode:change', (e) => { if (e?.to === 'ship' && !S.inCinematic && !S.title?.active) S.dir.release(); });
    registerShots(ctx, S);
  },

  update(dt, ctx) {
    if (S.dormant) return;
    if (!S.booted && !ctx.shot) {
      S.booted = true;
      S.title.enter();
    }
    navInput(dt, ctx);
    if (S.title?.active) return;
    S.stage.update(dt);
    if (S.run) S.run.update(dt);
    for (const r of S.side.slice()) r.update(dt);
    if (S.state.started) S.state.playTime += dt;
    // morte → checkpoint
    if (S.deathT > 0) {
      S.deathT -= dt;
      if (S.deathT <= 0) respawn(ctx);
    }
    // conversa ambiente de rádio
    if (S.state.started && ctx.game.mode === 'ship' && !S.inCinematic && ctx.universe.systemId === 'kessa') {
      S.chatterT -= dt;
      if (S.chatterT <= 0 && !S.radioQ.length) {
        S.chatterT = 110 + Math.random() * 90;
        const fs = ['frente', 'guilda', 'corsarios', ...(S.factions.hostile('player', 'hegemonia') ? ['hegemonia'] : []), ...(S.state.act >= 2 ? ['vigilantes'] : [])];
        const f = fs[Math.floor(Math.random() * fs.length)];
        const lines = CHATTER[f];
        S.radio(f, lines[Math.floor(Math.random() * lines.length)]);
      }
    }
  },

  frame(dt, ctx) {
    if (S.dormant) return;
    // tempo real (as cenas não desaceleram com a câmera lenta)
    const now = ctx.time.now;
    const real = ctx.time.virtual ? 1 / 30 : Math.min(0.1, Math.max(0, now - S.lastNow));
    S.lastNow = now;
    if (S.slow) {
      const s = S.slow; s.t += real;
      const k = Math.min(1, s.t / s.dur);
      if (!ctx.game.paused) ctx.time.scale = s.from + (s.to - s.from) * (k * k * (3 - 2 * k));
      if (k >= 1) S.slow = null;
    }
    S.dir.frame(real);
    S.ui.frame(real);
    S.pumpRadio(real);
    if (S.cockpitMsg && ctx.game.mode === 'ship') {
      try { ctx.services.ships?.cockpit?.setData?.({ message: S.cockpitMsg.message, warnings: S.cockpitMsg.warnings }); } catch { /* */ }
    }
    objectiveMarker(ctx);
  },

  dispose() {
    removeEventListener('keydown', onKey);
    S.stage?.clear();
    S.ui?.dispose();
  },
};

function respawn(ctx) {
  const ui = S.ui;
  ui.fade(1, 0.8);
  ui.card({ kicker: 'NAVE DESTRUÍDA', title: 'DE NOVO', sub: 'Retornando ao último ponto seguro' });
  setTimeout(() => {
    ui.hideCard();
    const cp = S.state.checkpoint;
    S.stage.clear();
    if (S.state.mission === 'a1_fuga' || S.state.mission === 'a1_ordem') {
      // a abertura recomeça da fuga, já desertado
      const fr = haldenFrame(ctx);
      if (ctx.universe.systemId !== 'halden') ctx.universe.setSystem('halden');
      if (fr) S.spawnPlayer(fr.C, fr.q, { vel: fr.F.clone().multiplyScalar(140), throttle: 0.5 });
      S.startMission('a1_fuga');
    } else if (cp) {
      if (cp.system && ctx.universe.systemId !== cp.system) ctx.universe.setSystem(cp.system);
      S.spawnPlayer(new THREE.Vector3().fromArray(cp.pos), new THREE.Quaternion().fromArray(cp.quat), {});
      if (S.state.mission) S.startMission(S.state.mission, 0);
    } else {
      const sys = ctx.universe.system, st = sys.stations.find((s) => !s.hidden);
      if (st) S.spawnPlayer(st.pos.clone().add(V3(0, 0, 4000)), new THREE.Quaternion(), {});
    }
    ctx.game.setMode('ship');
    ui.fade(0, 1.2);
  }, 1600);
}

export { S as storyCore };
