// Sistema `combat` — combate espacial do RPS3D.
//
//  • armas da nave (laser, canhão de massa, íons) com aquecimento, projéteis
//    HDR com núcleo branco e halo da facção, clarões de boca e de impacto
//  • mísseis teleguiados com trava (IR/radar/torpedo), fumaça iluminada,
//    contramedidas: flares (IR) e chaff (radar)
//  • escudos em bolha que piscam no impacto; casco com faíscas e marcas
//    (via evento 'ship:hit' → ships/rendering)
//  • IA de caças por facção (formações, bando dos corsários, disciplina da
//    Hegemonia, evasão, mísseis e flares), naves capitais com torres
//    destrutíveis uma a uma e hangares lançando caças
//  • batalhas (abertura em Aurora com a deserção, emboscadas, comboios,
//    patrulhas, sentinelas Vigilantes, batalha final), interdição da
//    Hegemonia durante o quântico, desativação e abordagem
//
// Serviço ctx.services.combat:
//   spawn(faction, classId, pos, opts?) → Combatant   (caças/cargueiros/fragatas)
//   spawnCapital(faction, 'destroyer'|'carrier', pos, opts?) → Combatant (com .capital)
//       opts: { dir|quat, vel, ai:{mode,target,focus,leader,slot}|false, name, side,
//               launch, launchInterval, maxLaunch, boardable, disableOnly, tags }
//   ships                       naves de IA vivas (array)
//   targets(filter?)            alvos hostis ao jogador, do mais perto ao mais longe
//   playerTarget (get/set)      alvo atual do jogador
//   lead(target, speed?)        { pos (mundo), dir, dist, time, localDir } — indicador de antecipação
//   startBattle(spec|preset, opts?) → Battle   presets: aurora, emboscada, comboio,
//                               patrulha, interdicao, derelito, vigilantes, final
//   endBattle()                 encerra a batalha atual (naves próximas saltam fora)
//   battle                      batalha atual (ou null): { id, kind, phase, ships, defect?() }
//   defect()                    abertura: Rafael recusa a ordem → Hegemonia hostil
//   setHostile(a, b, bool)      facções ('player' = jogador) · setAllied(a, b, bool) · relation(a, b)
//   interdict(faction?)         puxa o jogador do quântico (flight.interdict) e gera o encontro
//   damage(target, pontos, opts) · disable(nave) · board(nave) · explode(pos, size, kind)
//   missile(owner, target, kind) · countermeasure(owner, 'flare'|'chaff'|'both')
//   hud()                       { target, lead, lock, missiles, cm, incoming, contacts, board }
//   ownsPlayerDamage = false    (o `flight` aplica o dano do jogador vindo de 'ship:hit')
//
// Emite: ship:fire, ship:hit, ship:destroyed, explosion, missile:launch,
// missile:lock, countermeasure, radio, notify, shake, music, objective,
// board, ship:disabled, ship:jumpout, turret:destroyed, capital:launch,
// shield:down, combat:defect, combat:target, combat:aggro,
// combat:friendlyFire, combat:spawn, battle:start, battle:end.
// Escuta: system:change, jump:start, quantum:interdicted, combat:friendlyFire.
import * as THREE from 'three/webgpu';
import { Sim } from './sim.js';
import { PlayerWeapons } from './player.js';
import { Battle, Director, PRESETS } from './battle.js';
import { registerShots } from './shots.js';

const S = { ctx: null, sim: null, pw: null, battle: null, director: null, rig: null, shotHook: null, timers: [] };

function startBattle(spec, opts = {}) {
  const sim = S.sim;
  if (S.battle) endBattle();
  let b;
  if (typeof spec === 'string') {
    const make = PRESETS[spec];
    if (!make) { sim.err('startBattle', `preset desconhecido: ${spec}`); return null; }
    b = make(sim, opts);
  } else b = new Battle(sim, spec);
  S.battle = b;
  sim.emit('battle:start', { id: b.id, kind: b.kind, center: b.center.clone() });
  if (!sim.quiet) sim.emit('music', { mood: 'combat', intensity: 0.7 });
  return b;
}

function endBattle() {
  const b = S.battle;
  if (!b) return;
  if (!b.ended) b.finish('encerrada');
  b.dispose();
  S.battle = null;
}

function interdict(faction = 'hegemonia', opts = {}) {
  const ctx = S.ctx, sim = S.sim;
  let ok = false;
  try { ok = ctx.services.flight?.interdict?.(faction) ?? false; } catch (e) { sim.err('interdict', e); }
  if (!ok && !opts.force) return false;
  sim.player.sync(ctx);
  const wanted = sim.relations.isHostile('player', faction);
  if (!wanted && faction === 'hegemonia') {
    sim.emit('radio', { faction, speaker: 'PATRULHA SOLAR', text: 'Nave não identificada, aqui é a Patrulha Solar. Desligue os motores e prepare-se para inspeção.', priority: 3 });
  } else {
    sim.emit('radio', { faction, speaker: 'PATRULHA SOLAR', text: 'Alvo confirmado: o desertor Paoli. Interdição concluída. Abram fogo.', priority: 3 });
  }
  const b = startBattle('interdicao', { faction, count: opts.count });
  if (b && !wanted) {
    // inspeção: só ficam hostis se o jogador atacar (rancor) ou fugir
    for (const s of b.ships) { s.ai.focus = null; s.ai.leader = null; s.ai.setMode('patrol'); s.ai.anchor = sim.player.pos.clone(); s.ai.patrolR = 600; }
  }
  return true;
}

const api = {
  spawn(faction, classId = 'fighter', pos, opts = {}) { return S.sim.spawn(faction, classId, pos, opts); },
  spawnCapital(faction, classId = 'destroyer', pos, opts = {}) { return S.sim.spawn(faction, classId === 'carrier' ? 'carrier' : 'destroyer', pos, { launch: classId === 'carrier', ...opts }); },
  get ships() { return S.sim.ships.filter((s) => s.alive); },
  targets(filter = null) {
    const sim = S.sim, p = sim.player;
    return sim.ships.filter((s) => s.alive && s.state !== 'dead' && sim.relations.shipsHostile(p, s) && (!filter || filter(s)))
      .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
  },
  get playerTarget() { return S.sim.playerTarget; },
  set playerTarget(t) { S.sim.playerTarget = t || null; },
  lead(target, speed) { return S.sim.lead(target || S.sim.playerTarget, speed ?? 1750); },
  startBattle, endBattle,
  get battle() { return S.battle; },
  defect() { const b = S.battle; if (b?.defect) { b.defect(); return true; } return false; },
  setHostile(a, b, hostile = true) { S.sim.relations.set(a, b, !!hostile); },
  setAllied(a, b, on = true) { S.sim.relations.setAllied(a, b, !!on); },
  relation(a, b) { return S.sim.relations.rel(a, b); },
  interdict,
  damage(t, amount, opts) { return S.sim.damage(typeof t === 'string' ? S.sim.byId(t) : t, amount, opts); },
  disable(t) { S.sim.disable(typeof t === 'string' ? S.sim.byId(t) : t, null); },
  board(t) { return S.sim.board(typeof t === 'string' ? S.sim.byId(t) : t); },
  explode(pos, size = 10, kind = 'ship') { S.sim.explode(pos, size, kind, { force: true }); },
  missile(owner, target, kind = 'ir') { return S.sim.missiles.launch(owner, target, kind); },
  countermeasure(owner, kind = 'both') { return S.sim.missiles.deploy(owner || S.sim.player, kind, 2); },
  hud() {
    const sim = S.sim;
    const d = S.pw.cockpitData(S.ctx);
    if (!d) return null;
    const inc = sim.missiles.incoming(sim.player);
    return { ...d, lead: sim.playerTarget ? sim.lead(sim.playerTarget) : null, incoming: inc ? { dist: inc.dist, kind: inc.missile.def.id } : null, board: S.pw.boardCandidate ? { id: S.pw.boardCandidate.eventId, label: S.pw.boardCandidate.label } : null, firing: S.pw.firing };
  },
  ownsPlayerDamage: false,
  get sim() { return S.sim; },
};

export default {
  name: 'combat',
  order: 30,
  async init(ctx) {
    S.ctx = ctx;
    S.sim = new Sim(ctx);
    S.pw = new PlayerWeapons(S.sim);
    S.director = new Director(S.sim, { start: (k, o) => startBattle(k, o), interdict: (f) => interdict(f), get battle() { return S.battle; } });
    ctx.provide('combat', api);
    const bus = ctx.bus;
    bus.on('system:change', () => { endBattle(); S.sim.clear(); S.director.reset(); });
    bus.on('jump:start', () => { if (S.battle) S.battle.finish('fuga'); });
    bus.on('quantum:start', () => { S.sim.playerTarget = null; });
    // abertura: atirar nos aliados repetidas vezes é a recusa (sem `story`)
    bus.on('combat:friendlyFire', (e) => {
      const b = S.battle;
      if (b?.opening && b.phase !== 'defect' && e?.faction === 'hegemonia' && e.count >= 3 && !ctx.services.story) b.defect();
    });
    bus.on('quality:change', () => { /* orçamento lido no spawn */ });
    ctx.save.register('combat', {
      serialize: () => ({ v: 1, rel: S.sim.relations.serialize(), done: [...S.director.done] }),
      deserialize: (d) => { if (!d) return; S.sim.relations.deserialize(d.rel); for (const k of d.done || []) S.director.done.add(k); },
    });
    registerShots(ctx, api, S);
  },
  update(dt, ctx) {
    const sim = S.sim;
    sim.step(dt);
    S.pw.step(dt, ctx);
    if (S.battle) {
      S.battle.step(dt);
      // batalha encerrada: as naves que sobraram saltam fora depois de um tempo
      if (S.battle.ended) { const b = S.battle; S.battle = null; S.timers.push({ t: b.result === 'fuga' ? 2 : 25, fn: () => b.dispose() }); }
    }
    for (let i = S.timers.length - 1; i >= 0; i--) { const tm = S.timers[i]; tm.t -= dt; if (tm.t <= 0) { S.timers.splice(i, 1); try { tm.fn(); } catch (e) { sim.err('timer', e); } } }
    S.director.step(dt);
    if (S.shotHook && ctx.shot) { try { S.shotHook(); } catch (e) { sim.err('shotHook', e); } }
  },
  frame(dt, ctx) {
    const sim = S.sim;
    sim.frame(dt, ctx.time.alpha, () => {
      S.rig?.(ctx, dt);
      // cockpit: radar, alvo, trava, antecipação
      const d = S.pw.cockpitData(ctx);
      // só assume o radar quando há combate por perto (não apaga cenas montadas por outros)
      if (d && (d.contacts.length || d.target || S.fedCockpit)) {
        S.fedCockpit = d.contacts.length > 0 || !!d.target;
        let cp = null;
        try { cp = ctx.services.ships?.cockpit; } catch { cp = null; }
        if (cp?.setData) {
          const prev = cp.data?.warnings || [];
          cp.setData({ contacts: d.contacts, target: d.target, lock: d.lock, missiles: d.missiles, radarRange: d.radarRange, warnings: d.warnings.length ? [...d.warnings, ...prev.filter((w) => !d.warnings.includes(w))] : prev });
        }
      }
    });
  },
  dispose() { endBattle(); S.sim?.dispose(); },
};

export { api as combatApi };
