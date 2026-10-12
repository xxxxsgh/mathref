// Batalhas e encontros.
//
//  • Battle: monta lados a partir de uma especificação (grupos por facção,
//    capitais, alas do jogador), acompanha fases e termina sozinha (vitória,
//    derrota ou o jogador se afastou).
//  • PRESETS: 'aurora' (abertura em Halden: a Hegemonia ataca a colônia e o
//    jogador deserta), 'emboscada' (corsários em bando), 'comboio' (guilda
//    atacada), 'patrulha' (Hegemonia), 'interdicao', 'derelito' (nave
//    abordável), 'vigilantes' (sentinelas antigas), 'final' (Ato 3).
//  • Director: inicia a abertura sem `story`, dispara encontros pelos POIs do
//    sistema e faz a interdição da Hegemonia durante o quântico.
import * as THREE from 'three/webgpu';
import { lookQuat } from './math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Base ortonormal da batalha: F (frente), R (direita), U (cima). */
export function battleFrame(forward, upHint = V(0, 1, 0)) {
  const F = forward.clone().normalize();
  const R = new THREE.Vector3().crossVectors(F, upHint);
  if (R.lengthSq() < 1e-6) R.set(1, 0, 0);
  R.normalize();
  const U = new THREE.Vector3().crossVectors(R, F).normalize();
  return { F, R, U };
}

export class Battle {
  constructor(sim, spec) {
    this.sim = sim; this.spec = spec;
    this.id = spec.id || `batalha${Math.floor(sim.rand() * 1e6)}`;
    this.kind = spec.kind || 'custom';
    this.center = spec.center.clone();
    this.frame = battleFrame(spec.forward || V(0, 0, -1), spec.up || V(0, 1, 0));
    this.ships = [];
    this.t = 0; this.phase = spec.phase || 'combate';
    this.opening = !!spec.opening;
    this.playerFocus = spec.playerFocus ?? 0.9;
    this.ended = false;
    this.awayT = 0;
    this.scripts = [];
    this.wing = [];
    this.musicT = 0;
    if (spec.hostile) for (const [a, b, h] of spec.hostile) sim.relations.set(a, b, h);
    if (spec.allied) for (const [a, b, on] of spec.allied) sim.relations.setAllied(a, b, on);
    for (const g of spec.groups || []) this.addGroup(g);
  }

  /** Ponto do referencial da batalha (f frente, r direita, u cima, em m). */
  at(f, r, u, out = new THREE.Vector3()) {
    const { F, R, U } = this.frame;
    return out.copy(this.center).addScaledVector(F, f).addScaledVector(R, r).addScaledVector(U, u);
  }
  dir(f, r, u) { const { F, R, U } = this.frame; return new THREE.Vector3().addScaledVector(F, f).addScaledVector(R, r).addScaledVector(U, u).normalize(); }

  /**
   * Grupo: { faction, classId, count, at:[f,r,u], spread, dir:[f,r,u] | 'center' | 'player',
   *          formation: 'cunha'|'par'|'enxame', ai, name, tags, capital opts, wing:true, side }
   */
  addGroup(g) {
    const sim = this.sim;
    const n = g.count ?? 1;
    const base = this.at(...(g.at || [0, 0, 0]));
    const spread = g.spread ?? 120;
    let dir;
    if (Array.isArray(g.dir)) dir = this.dir(...g.dir);
    else if (g.dir === 'center') dir = this.center.clone().sub(base).normalize();
    else if (g.dir === 'player' && sim.player.alive) dir = sim.player.pos.clone().sub(base).normalize();
    else dir = this.frame.F.clone();
    if (!Number.isFinite(dir.x) || dir.lengthSq() < 0.5) dir = this.frame.F.clone();
    const q = lookQuat(dir, this.frame.U);
    const R = V(1, 0, 0).applyQuaternion(q), U = V(0, 1, 0).applyQuaternion(q), Fw = dir;
    const out = [];
    let leader = g.leader || null;
    for (let i = 0; i < n; i++) {
      // posições em cunha/par/enxame atrás do líder
      let off;
      const k = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      if (g.formation === 'enxame') off = V((sim.rand() - 0.5) * spread * 2, (sim.rand() - 0.5) * spread, (sim.rand() - 0.5) * spread * 2);
      else if (g.formation === 'par') off = V((i % 2) * spread * 0.5 + Math.floor(i / 2) * spread * 1.4, (sim.rand() - 0.5) * 20, (i % 2) * spread * 0.4 + Math.floor(i / 2) * spread * 0.6);
      else off = V(i ? side * k * spread * 0.7 : 0, i ? -k * 6 : 0, i ? k * spread * 0.55 : 0);
      const p = base.clone().addScaledVector(R, off.x).addScaledVector(U, off.y).addScaledVector(Fw, -off.z);
      const slot = i && leader ? V(off.x, off.y, off.z) : null;
      const opts = {
        quat: q.clone(), battle: this, side: g.side || g.faction, name: g.name ? (n > 1 ? `${g.name} ${i + 1}` : g.name) : undefined,
        tags: g.tags, throttle: g.throttle, toughness: g.toughness, weapons: g.weapons, missiles: g.missiles, boardable: g.boardable, disableOnly: g.disableOnly,
        launch: g.launch, launchInterval: g.launchInterval, maxLaunch: g.maxLaunch, firstLaunch: g.firstLaunch, passive: g.passive, cruise: g.cruise, force: g.force, hull: g.hull, invulnerable: g.invulnerable,
        ai: g.ai === false ? false : { ...(g.ai || {}), leader: g.wing ? sim.player : (slot ? leader : null), slot: g.wing ? V(side * (40 + k * 35), -6 * k, 30 + k * 25) : slot, anchor: base, holdFormation: g.wing ? !!g.holdFormation : false },
        callsign: g.callsigns?.[i],
      };
      if (g.vel !== undefined) opts.vel = Fw.clone().multiplyScalar(g.vel);
      const s = sim.spawn(g.faction, g.classId || 'fighter', p, opts);
      if (!s) continue;
      if (!leader && !g.wing) leader = s;
      out.push(s); this.ships.push(s);
      if (g.wing) this.wing.push(s);
    }
    return out;
  }

  alive(faction) { return this.ships.filter((s) => s.alive && s.state !== 'dead' && (!faction || s.faction === faction)); }

  /** Agenda uma ação: at (s desde o início) ou when(battle) → fn(battle). */
  script(o) { this.scripts.push({ ...o, done: false }); return this; }

  step(dt) {
    if (this.ended) return;
    const sim = this.sim;
    this.t += dt;
    this.ships = this.ships.filter((s) => s.alive);
    for (const sc of this.scripts) {
      if (sc.done) continue;
      if ((sc.at !== undefined && this.t >= sc.at) || (sc.when && sc.when(this))) { sc.done = true; try { sc.fn(this); } catch (e) { sim.err('script', e); } }
    }
    // música de combate pela proximidade de hostis
    this.musicT -= dt;
    if (this.musicT <= 0 && sim.player.alive) {
      this.musicT = 3;
      let near = 0;
      for (const s of this.ships) if (sim.relations.shipsHostile(s, sim.player) && s.pos.distanceTo(sim.player.pos) < 6000) near++;
      if (near && !sim.quiet) sim.emit('music', { mood: 'combat', intensity: Math.min(1, 0.4 + near * 0.08) });
    }
    // fim: um lado sumiu, ou o jogador foi embora
    const sides = new Set(this.ships.filter((s) => s.state === 'ok' && !s.tags.has('civil')).map((s) => s.side));
    if (this.spec.endWhenClear !== false && sides.size <= 1 && this.t > 5) {
      const winner = [...sides][0] || null;
      const playerWon = winner ? !sim.relations.isHostile(winner === 'player' ? 'player' : winner, 'player') : true;
      this.finish(playerWon ? 'vitoria' : 'derrota', winner);
      return;
    }
    if (sim.player.alive && sim.player.pos.distanceTo(this.center) > (this.spec.leaveRadius || 30000)) {
      this.awayT += dt;
      if (this.awayT > 15) this.finish('fuga');
    } else this.awayT = 0;
  }

  finish(result, winner = null) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    this.sim.emit('battle:end', { id: this.id, kind: this.kind, result, winner });
    this.sim.emit('music', { mood: 'explore', intensity: 0.4 });
    this.spec.onEnd?.(this, result);
  }

  /** Remove as naves restantes (as próximas do jogador saltam fora). */
  dispose() {
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (this.sim.player.alive && s.pos.distanceTo(this.sim.player.pos) < 4000 && s.state === 'ok') this.sim.jumpOut(s);
      else this.sim.remove(s);
    }
    this.ships.length = 0;
  }
}

// ─── presets ────────────────────────────────────────────────────────────────
function sysBody(ctx, name) { return ctx.universe.system?.bodies.find((b) => b.name === name) || null; }

/** Abertura: órbita de Aurora (Halden). */
function presetAurora(sim, o = {}) {
  const ctx = sim.ctx;
  const sys = ctx.universe.system;
  const aur = sysBody(ctx, 'Aurora') || sys?.bodies[0];
  const poi = sys?.pois.find((p) => p.kind === 'opening_battle');
  const center = o.center?.clone() || (sim.player.alive ? sim.player.pos.clone() : poi ? poi.pos.clone() : aur.pos.clone().add(V(aur.radius * 3, 0, 0)));
  const forward = o.forward?.clone() || aur.pos.clone().sub(center).normalize();
  const up = o.up?.clone() || V(0, 1, 0);
  const playerIn = o.playerIn ?? true;
  const groups = [
    // frota da Hegemonia: porta-caças e destróier atrás/ao lado do jogador
    { faction: 'hegemonia', classId: 'carrier', at: [-900, -1500, 350], dir: [1, 0.12, 0], name: 'Soberano', launch: true, launchInterval: 26, maxLaunch: 8, firstLaunch: 10, cruise: 0.25, tags: ['capital'] },
    { faction: 'hegemonia', classId: 'destroyer', at: [600, 1450, -260], dir: [1, -0.05, 0], name: 'Inflexível', cruise: 0.3, tags: ['capital'] },
    // esquadrilhas da Hegemonia já engajadas à frente
    { faction: 'hegemonia', classId: 'fighter', count: 4, at: [1600, -300, 120], formation: 'cunha', spread: 90, callsigns: ['ÁGUIA-1', 'ÁGUIA-2', 'ÁGUIA-3', 'ÁGUIA-4'] },
    { faction: 'hegemonia', classId: 'interceptor', count: 4, at: [2100, 500, -150], formation: 'par', spread: 110, callsigns: ['CETRO-1', 'CETRO-2', 'CETRO-3', 'CETRO-4'] },
    // defensores da colônia vindo do planeta
    { faction: 'frente', classId: 'fighter', count: 6, at: [3600, 200, 60], dir: [-1, 0, 0.05], formation: 'enxame', spread: 260, name: 'Milícia de Aurora' },
    { faction: 'frente', classId: 'fighter', count: 4, at: [3200, -900, 300], dir: [-1, 0.2, 0.1], formation: 'par', spread: 180 },
    { faction: 'frente', classId: 'frigate', at: [5200, -400, -500], dir: [-1, 0, 0.2], name: 'Esperança', tags: ['colonia'], boardable: false, cruise: 0.4 },
    { faction: 'frente', classId: 'freighter', count: 2, at: [6500, 900, 200], dir: [0.2, 0.1, 1], formation: 'par', spread: 300, name: 'Transporte de Evacuação', tags: ['civil', 'colonia'], ai: { mode: 'flee' }, weapons: [] },
  ];
  if (playerIn) groups.push({ faction: 'hegemonia', classId: 'fighter', count: 2, wing: true, at: [-60, 0, 40], callsigns: ['LANÇA-6', 'LANÇA-8'], tags: ['ala'] });
  const spec = {
    id: 'aurora', kind: 'aurora', opening: true, center, forward, up, groups,
    hostile: [['player', 'frente', true], ['player', 'hegemonia', false]], allied: [['player', 'hegemonia', true]],
    leaveRadius: 60000, endWhenClear: false, playerFocus: 1.2,
  };
  const b = new Battle(sim, spec);
  b.defect = () => defectOpening(sim, b);
  // sem `story`: o roteiro mínimo da abertura acontece por rádio
  if (!ctx.services.story && !ctx.shot) {
    b.script({ at: 3, fn: () => sim.emit('radio', { faction: 'hegemonia', speaker: 'COMANDO SOLAR', text: 'Esquadrilha Lança, a milícia de Aurora está em fuga. Limpem o caminho para o Soberano.', priority: 2 }) });
    b.script({ at: 40, fn: () => { sim.emit('radio', { faction: 'hegemonia', speaker: 'COMANDO SOLAR', text: 'Lança-7, a colônia Aurora foi declarada hostil. Bombardeio orbital autorizado. Confirme.', priority: 3 }); sim.emit('objective', { id: 'abertura:ordem', text: 'A ordem: bombardear a colônia Aurora. Atire nos aliados para recusar.' }); } });
    b.script({ at: 75, when: () => b.phase !== 'defect', fn: () => sim.emit('radio', { faction: 'hegemonia', speaker: 'COMANDO SOLAR', text: 'Lança-7, sua confirmação. Agora.', priority: 3 }) });
  }
  return b;
}

/** A recusa: aliados da Hegemonia viram inimigos e a frota caça o jogador. */
function defectOpening(sim, b) {
  if (b.phase === 'defect') return;
  b.phase = 'defect';
  const R = sim.relations;
  R.setAllied('player', 'hegemonia', false);
  R.set('player', 'hegemonia', true);
  R.set('player', 'frente', false);
  R.setAllied('player', 'frente', true);
  for (const s of sim.ships) {
    s.grudges.delete('player');
    if (s.faction !== 'hegemonia') continue;
    if (s.capital) { s.capital.focus = sim.player; s.capital.launch.enabled = true; s.capital.launch.interval = 14; s.capital.launch.max += 6; s.capital.launch.timer = 3; }
    if (s.ai) {
      if (b.wing.includes(s) || sim.rand() < 0.55) { s.ai.focus = sim.player; s.ai.target = sim.player; s.ai.leader = null; s.ai.retarget = 3; s.ai.setMode('engage'); }
    }
  }
  b.playerFocus = 0.5;
  sim.emit('combat:defect', { battle: b.id });
  if (!sim.quiet) {
    sim.emit('radio', { faction: 'hegemonia', speaker: 'LANÇA-6', text: 'Rafael?! O que você está fazendo? Lança-7 virou! Lança-7 é hostil!', priority: 3 });
    sim.emit('radio', { faction: 'hegemonia', speaker: 'COMANDO SOLAR', text: 'A todas as unidades: Lança-7 é traidor. Abatam-no.', priority: 3 });
    sim.emit('music', { mood: 'combat', intensity: 1 });
    sim.emit('objective', { id: 'abertura:fuga', text: 'Sobreviva e salte para fora de Halden (J).' });
  }
}

/** Emboscada de corsários: bando cercando o jogador. */
function presetEmboscada(sim, o = {}) {
  const center = o.center?.clone() || sim.player.pos.clone();
  const fwd = o.forward?.clone() || (sim.player.alive ? sim.player.fwd(new THREE.Vector3()) : V(0, 0, -1));
  const n = o.count ?? 5;
  return new Battle(sim, {
    id: o.id || 'emboscada', kind: 'emboscada', center, forward: fwd,
    groups: [
      { faction: 'corsarios', classId: 'fighter', count: Math.ceil(n * 0.6), at: [1800, 400, 200], dir: [-1, 0, 0], formation: 'enxame', spread: 300, ai: { mode: 'engage' } },
      { faction: 'corsarios', classId: 'interceptor', count: Math.floor(n * 0.4), at: [-1500, -500, -300], dir: [1, 0, 0], formation: 'enxame', spread: 260, ai: { mode: 'engage' } },
    ],
    playerFocus: 0.5,
  });
}

/** Comboio da Guilda sob ataque (chamado de socorro). */
function presetComboio(sim, o = {}) {
  const center = o.center.clone();
  return new Battle(sim, {
    id: o.id || 'comboio', kind: 'comboio', center, forward: o.forward || V(1, 0, 0),
    groups: [
      { faction: 'guilda', classId: 'freighter', count: 2, at: [0, 0, 0], formation: 'par', spread: 260, tags: ['civil'], name: 'Cargueiro da Guilda', throttle: 0.4 },
      { faction: 'guilda', classId: 'fighter', count: 2, at: [-200, 80, 0], formation: 'par', spread: 80 },
      { faction: 'corsarios', classId: 'fighter', count: 4, at: [900, 200, 400], dir: 'center', formation: 'enxame', spread: 250, ai: { mode: 'engage' } },
      { faction: 'corsarios', classId: 'interceptor', count: 2, at: [-800, -150, -500], dir: 'center', formation: 'enxame', spread: 200 },
    ],
  });
}

/** Patrulha/posto de controle da Hegemonia. */
function presetPatrulha(sim, o = {}) {
  return new Battle(sim, {
    id: o.id || 'patrulha', kind: 'patrulha', center: o.center.clone(), forward: o.forward || V(0, 0, 1),
    groups: [
      { faction: 'hegemonia', classId: 'frigate', at: [0, 0, 0], name: 'Vigia Solar', cruise: 0.15, throttle: 0.15 },
      { faction: 'hegemonia', classId: 'fighter', count: 4, at: [300, 120, 0], formation: 'cunha', spread: 90, ai: { mode: 'patrol', patrolR: 1600 } },
    ],
    endWhenClear: false, leaveRadius: 40000,
  });
}

/** Interdição: caças da Hegemonia em volta do jogador recém-arrancado do quântico. */
function presetInterdicao(sim, o = {}) {
  const center = sim.player.pos.clone();
  const fwd = sim.player.alive ? sim.player.fwd(new THREE.Vector3()) : V(0, 0, -1);
  const b = new Battle(sim, {
    id: 'interdicao', kind: 'interdicao', center, forward: fwd,
    groups: [
      { faction: o.faction || 'hegemonia', classId: 'interceptor', count: o.count ?? 3, at: [1500, 200, 0], dir: [-1, 0, 0], formation: 'cunha', spread: 120, ai: { mode: 'engage', focus: sim.player } },
      { faction: o.faction || 'hegemonia', classId: 'fighter', count: 2, at: [-1300, -200, 400], dir: [1, 0, 0], formation: 'par', spread: 120, ai: { mode: 'engage', focus: sim.player } },
    ],
    playerFocus: 0.4,
  });
  return b;
}

/** Nave à deriva, abordável. */
function presetDerelito(sim, o = {}) {
  const b = new Battle(sim, {
    id: o.id || 'derelito', kind: 'derelito', center: o.center.clone(), forward: o.forward || V(1, 0.2, 0),
    groups: [{ faction: o.faction || 'guilda', classId: o.classId || 'freighter', at: [0, 0, 0], ai: false, boardable: true, tags: ['civil', 'derelito'], name: 'Cargueiro à deriva', throttle: 0, vel: 0 }],
    endWhenClear: false, leaveRadius: 50000,
  });
  for (const s of b.ships) sim.disable(s, null, { silent: true });
  return b;
}

/** Sentinelas Vigilantes (ruínas). */
function presetVigilantes(sim, o = {}) {
  return new Battle(sim, {
    id: o.id || 'vigilantes', kind: 'vigilantes', center: o.center?.clone() || sim.player.pos.clone().addScaledVector(sim.player.fwd(new THREE.Vector3()), 2500), forward: o.forward || V(0, 0, 1),
    groups: [{ faction: 'vigilantes', classId: 'interceptor', count: o.count ?? 4, at: [0, 0, 0], formation: 'cunha', spread: 140, dir: 'player', ai: { mode: 'engage' } }],
  });
}

/** Batalha final (Ato 3): frota da Hegemonia contra a Frente + Vigilantes. */
function presetFinal(sim, o = {}) {
  const center = o.center?.clone() || sim.player.pos.clone();
  const forward = o.forward?.clone() || (sim.player.alive ? sim.player.fwd(new THREE.Vector3()) : V(0, 0, -1));
  return new Battle(sim, {
    id: 'final', kind: 'final', center, forward,
    hostile: [['player', 'hegemonia', true]], allied: [['player', 'frente', true]],
    groups: [
      { faction: 'hegemonia', classId: 'carrier', at: [5200, -600, 900], dir: [-1, 0, 0], name: 'Soberano', launch: true, launchInterval: 18, maxLaunch: 14 },
      { faction: 'hegemonia', classId: 'destroyer', at: [4300, 1300, -800], dir: [-1, 0, 0.1], name: 'Inflexível' },
      { faction: 'hegemonia', classId: 'destroyer', at: [4800, -1800, -1500], dir: [-1, 0.05, 0], name: 'Lei Solar' },
      { faction: 'hegemonia', classId: 'fighter', count: 6, at: [2600, 0, 0], dir: [-1, 0, 0], formation: 'cunha', spread: 120 },
      { faction: 'hegemonia', classId: 'interceptor', count: 4, at: [2900, 600, -500], dir: [-1, 0, 0], formation: 'par', spread: 140 },
      { faction: 'frente', classId: 'frigate', count: 2, at: [-600, -300, 700], dir: [1, 0, 0], formation: 'par', spread: 500 },
      { faction: 'frente', classId: 'fighter', count: 6, at: [300, 0, -200], dir: [1, 0, 0], formation: 'enxame', spread: 260 },
      { faction: 'vigilantes', classId: 'interceptor', count: 4, at: [1500, 2400, 1400], dir: [0.2, -1, 0], formation: 'cunha', spread: 160, side: 'vigilantes' },
    ],
    endWhenClear: false, leaveRadius: 80000, playerFocus: 0.8,
  });
}

export const PRESETS = { aurora: presetAurora, emboscada: presetEmboscada, comboio: presetComboio, patrulha: presetPatrulha, interdicao: presetInterdicao, derelito: presetDerelito, vigilantes: presetVigilantes, final: presetFinal };

// ─── diretor de encontros ───────────────────────────────────────────────────
export class Director {
  constructor(sim, host) {
    this.sim = sim; this.host = host; // host: { start(spec), get battle }
    this.done = new Set();
    this.checkT = 0;
    this.qtT = 0; this.lastInterdict = -1e9;
    this.enabled = true;
  }

  reset() { this.done.clear(); this.qtT = 0; }

  step(dt) {
    const sim = this.sim, ctx = sim.ctx;
    if (!this.enabled || ctx.shot) return;
    const fl = ctx.services.flight;
    const st = fl?.state;
    // interdição durante o quântico
    if (st?.quantum?.state === 'travel') {
      this.qtT += dt;
      const wanted = sim.relations.isHostile('player', 'hegemonia');
      const sys = ctx.universe.system;
      const sec = sys?.security ?? 0.5;
      const chance = (wanted ? 0.05 : 0.004) * (0.4 + sec);
      if (this.qtT > 3.5 && sim.now - this.lastInterdict > 150 && !this.host.battle && sim.rand() < chance * dt) {
        this.lastInterdict = sim.now;
        this.host.interdict('hegemonia');
      }
      return;
    }
    this.qtT = 0;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    if (!sim.player.alive || this.host.battle) return;
    const sys = ctx.universe.system;
    if (!sys) return;
    // abertura sem `story`
    if (sys.id === 'halden' && !ctx.services.story && !this.done.has('halden:aurora')) {
      const poi = sys.pois.find((p) => p.kind === 'opening_battle');
      if (!poi || poi.pos.distanceTo(sim.player.pos) < 80000) {
        this.done.add('halden:aurora');
        this.host.start('aurora');
        return;
      }
    }
    // encontros nos pontos de interesse
    for (const p of sys.pois) {
      if (this.done.has(p.id)) continue;
      const d = p.pos.distanceTo(sim.player.pos);
      if (d > 25000) continue;
      const map = { ambush: 'emboscada', convoy: 'comboio', distress: 'comboio', checkpoint: 'patrulha', derelict: 'derelito' };
      const kind = map[p.kind];
      if (!kind) { this.done.add(p.id); continue; }
      this.done.add(p.id);
      const toward = p.pos.clone().sub(sim.player.pos);
      const center = d < 6000 ? p.pos.clone() : sim.player.pos.clone().addScaledVector(toward.normalize(), 4500);
      if (kind === 'emboscada') sim.emit('radio', { faction: 'corsarios', speaker: 'CORVO-1', text: 'Olha só, um peixe sozinho. Cerquem!', priority: 2 });
      if (kind === 'comboio') sim.emit('radio', { faction: 'guilda', speaker: 'CARGUEIRO DA GUILDA', text: 'Socorro! Corsários atacando o comboio! Qualquer nave, por favor!', priority: 2 });
      this.host.start(kind, { center, forward: toward, id: p.id });
      return;
    }
  }
}
