import * as THREE from 'three';
import { Combatant, makeWeaponState, TEAM_COLORS, TEAM_NAMES } from '../combat/Combatant.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { PlayerController } from '../player/PlayerController.js';
import { WeaponController } from '../weapons/WeaponController.js';
import { BotController } from '../bots/BotController.js';
import { BotModel, TargetModel } from '../bots/BotModel.js';
import { RoundManager, RULES } from './RoundManager.js';
import { UPLINK } from '../world/Arena.js';
import { WEAPONS, EQUIPMENT } from '../weapons/WeaponData.js';

/**
 * Uma partida. Cria os combatentes, liga sistemas e aplica as regras do
 * modo:
 *   competitive → rounds (RoundManager), economia, compra só no início
 *   practice    → sem rounds: bots e jogador renascem, alvos de treino,
 *                 compra livre a qualquer hora
 */

const BOT_NAMES = ['Kestrel', 'Vireo', 'Tamsin', 'Okoro', 'Lumen', 'Brisa', 'Sable', 'Dax', 'Ines', 'Fenwick', 'Juno', 'Rook'];
const ROLES = /** @type {const} */ (['mid', 'lane', 'corridor', 'platform', 'mid']);

export class MatchManager {
  /**
   * @param {any} game  (ver main.js: scene, arena, fx, audio, input, settings, inventory, vm, camera, ui)
   * @param {{ mode: 'competitive'|'practice', difficulty: string, teamSize: number }} opts
   */
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.mode = opts.mode;
    this.time = 0;
    this.combat = new CombatSystem(game.arena.collision, game.fx, game.audio);
    this.round = new RoundManager(UPLINK);
    this.over = false;
    /** @type {{ killer: string, killerTeam: number, victim: string, victimTeam: number, weapon: string, headshot: boolean, t: number, mine: boolean }[]} */
    this.feed = [];
    this.spectateIndex = 0;
    this.respawnTimer = 0;
    this.deathInfo = '';
    this.banner = { text: '', sub: '', t: 0, color: '#fff' };
    this.tmp = new THREE.Vector3();

    // ── jogador ──
    const p = new Combatant({ name: 'Você', team: 0 });
    this.player = p;
    this.combat.add(p);
    this.pc = new PlayerController(p, game.arena.collision, game.audio);
    this.pc.onLand = (impact) => game.vm.land(impact);
    game.vm.setTeamColor(TEAM_COLORS[0]);
    this.wc = new WeaponController(p, game.vm, this.combat, game.audio);
    this.wc.onShotResult = (r) => this.onPlayerHit(r);
    this.wc.onMelee = (r) => r && r.hitActor && this.onPlayerHit({ hitActor: true, headshot: r.backstab, kill: r.kill });

    // ── bots ──
    /** @type {BotController[]} */
    this.bots = [];
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const n = Math.max(1, Math.min(5, opts.teamSize));
    const shadows = game.settings.data.quality !== 'low';
    for (let team = 0; team < 2; team++) {
      const count = team === 0 ? n - 1 : n;
      for (let i = 0; i < count; i++) {
        const a = new Combatant({ name: names.pop() || `Bot${i}`, team, isBot: true });
        const model = new BotModel(team, shadows);
        game.scene.add(model.root);
        const role = ROLES[(i + team) % ROLES.length];
        const bot = new BotController(a, { arena: game.arena, combat: this.combat, audio: game.audio, fx: game.fx }, /** @type {any} */ (opts.difficulty), role, model);
        this.bots.push(bot);
        this.combat.add(a);
      }
    }
    this.combat.onShotHeard.push((shooter, pos) => {
      for (const b of this.bots) b.hear(shooter, pos);
    });
    this.combat.onDamage.push((victim, attacker, dmg, from) => {
      const bot = this.bots.find((b) => b.actor === victim);
      if (bot) bot.hurt(attacker);
      if (victim === this.player) {
        game.ui.hud.damageFrom(from, p, dmg);
        game.audio.hurt();
        this.pc.addShake(Math.min(0.35, dmg / 140));
      }
    });
    this.combat.onKill.push((e) => this.onKill(e));

    // ── alvos de treino ──
    /** @type {{ actor: Combatant, model: TargetModel, spot: any, phase: number, respawn: number }[]} */
    this.targets = [];
    if (this.mode === 'practice') {
      for (const spot of game.arena.targetSpots) {
        const a = new Combatant({ name: 'Alvo', team: 1, isTarget: true });
        a.health = 100;
        a.body.pos.set(spot.x, spot.y || 0, spot.z);
        a.yaw = Math.atan2(-(0 - spot.x), -(0 - spot.z)) + Math.PI;
        const model = new TargetModel();
        game.scene.add(model.root);
        this.targets.push({ actor: a, model, spot, phase: Math.random() * 6, respawn: 0 });
        this.combat.add(a);
      }
    }

    for (const a of this.allActors()) a.money = this.mode === 'practice' ? 16000 : RULES.startMoney;
    if (this.mode === 'practice') {
      p.weapons.primary = this.makeWeapon(p, 'rifle');
      for (const b of this.bots) b.actor.weapons.primary = makeWeaponState(Math.random() < 0.8 ? 'rifle' : 'smg');
      this.spawnAll(true);
      this.banner = { text: 'TREINO LIVRE', sub: 'Alvos e bots renascem • B abre a loja a qualquer momento', t: 4, color: '#5dffb0' };
    } else {
      this.round.startRound();
    }
  }

  allActors() {
    return [this.player, ...this.bots.map((b) => b.actor)];
  }

  /** Arma com a skin equipada no inventário (só para o jogador). */
  makeWeapon(actor, id) {
    const item = actor === this.player ? this.game.inventory.equippedFor(WEAPONS[id].type) : null;
    return makeWeaponState(id, item);
  }

  /** Aplica as skins equipadas nas armas atuais do jogador (após mexer no loadout). */
  refreshPlayerSkins() {
    const p = this.player;
    for (const slot of /** @type {const} */ (['primary', 'secondary', 'melee'])) {
      const ws = p.weapons[slot];
      if (ws) ws.item = this.game.inventory.equippedFor(ws.def.type);
    }
    this.wc.clearModels();
    if (p.alive) this.wc.equip(p.slot);
  }

  /**
   * Posiciona todos nos spawns.
   * @param {boolean} full reinicia vida e (se morto) equipamento
   */
  spawnAll(full) {
    const spawns = this.game.arena.spawns;
    const used = [0, 0];
    for (const a of this.allActors()) {
      const list = spawns[a.team];
      const sp = list[used[a.team]++ % list.length];
      this.spawnActor(a, sp, full);
    }
    this.game.fx.clear();
  }

  /** @param {Combatant} a */
  spawnActor(a, sp, full) {
    const wasDead = !a.alive;
    a.resetForRound();
    a.body.pos.set(sp.x + (Math.random() - 0.5) * 0.6, 0.01, sp.z + (Math.random() - 0.5) * 0.6);
    a.body.grounded = true;
    a.yaw = sp.yaw;
    a.pitch = 0;
    a.spawnProtect = this.mode === 'practice' ? 1.5 : 0;
    if (wasDead || full) {
      // morreu: perde primária e colete; pistola padrão volta
      if (this.mode !== 'practice') {
        a.weapons.primary = null;
        a.armor = 0;
        a.helmet = false;
      }
      a.weapons.secondary = this.makeWeapon(a, 'pistol');
    }
    a.weapons.melee = this.makeWeapon(a, 'knife');
    // recarrega tudo no começo do round
    for (const ws of [a.weapons.primary, a.weapons.secondary]) {
      if (ws) {
        ws.ammo = ws.def.mag;
        ws.reserve = ws.def.reserve;
      }
    }
    a.slot = a.weapons.primary ? 'primary' : 'secondary';
    if (a === this.player) {
      // skins podem ter mudado no loadout entre partidas/rounds
      for (const ws of [a.weapons.primary, a.weapons.secondary, a.weapons.melee]) {
        if (ws) ws.item = this.game.inventory.equippedFor(ws.def.type);
      }
    }
    const bot = this.bots.find((b) => b.actor === a);
    if (bot) bot.reset();
    if (a === this.player) {
      this.wc.clearModels();
      this.wc.recoil.reset();
      this.wc.equip(a.slot, false);
      this.respawnTimer = 0;
      this.deathInfo = '';
    }
  }

  /** Compra automática dos bots na fase de compra. */
  botBuy(a) {
    const has = a.weapons.primary;
    if (!has) {
      if (a.money >= 4800 && Math.random() < 0.18) this.purchase(a, 'dmr');
      else if (a.money >= 3700) this.purchase(a, 'rifle');
      else if (a.money >= 2400 && Math.random() < 0.7) this.purchase(a, 'smg');
    }
    if (a.money >= 1000 && (a.armor < 50 || !a.helmet)) this.purchase(a, 'vestHelmet');
    else if (a.money >= 650 && a.armor < 50) this.purchase(a, 'vest');
    if (!a.weapons.primary && a.money >= 700 && a.weapons.secondary?.def.id === 'pistol' && Math.random() < 0.5) this.purchase(a, 'heavy');
  }

  /**
   * Compra um item. Retorna mensagem de erro ou ''.
   * @param {Combatant} a @param {string} id
   */
  purchase(a, id) {
    const canBuy = this.mode === 'practice' || this.round.phase === 'buy';
    if (!canBuy) return 'Fora do tempo de compra';
    if (!a.alive) return 'Você está fora do round';
    const eq = EQUIPMENT[id];
    const w = WEAPONS[id];
    const price = eq ? eq.price : w ? w.price : 0;
    if (!eq && !w) return 'Item inválido';
    if (this.mode !== 'practice' && a.money < price) return 'Créditos insuficientes';
    if (eq) {
      if (a.armor >= 100 && (id === 'vest' || a.helmet)) return 'Já equipado';
      a.armor = 100;
      if (id === 'vestHelmet') a.helmet = true;
    } else {
      const slot = w.slot === 'primary' ? 'primary' : 'secondary';
      if (a.weapons[slot]?.def.id === id) return 'Já equipado';
      a.weapons[slot] = this.makeWeapon(a, id);
      if (a === this.player) this.wc.equip(slot);
      else a.slot = a.weapons.primary ? 'primary' : 'secondary';
    }
    if (this.mode !== 'practice') a.money -= price;
    return '';
  }

  /** @param {import('../combat/CombatSystem.js').KillEvent} e */
  onKill(e) {
    const { killer, victim } = e;
    if (victim.isTarget) {
      const t = this.targets.find((x) => x.actor === victim);
      if (t) t.respawn = 1.6;
      if (killer === this.player) this.game.audio.killConfirm();
      return;
    }
    this.feed.unshift({
      killer: killer.name,
      killerTeam: killer.team,
      victim: victim.name,
      victimTeam: victim.team,
      weapon: e.weapon,
      headshot: e.headshot,
      t: this.time,
      mine: killer === this.player || victim === this.player,
    });
    if (this.feed.length > 6) this.feed.pop();
    if (killer !== victim && killer.team !== victim.team) {
      killer.money = Math.min(RULES.maxMoney, killer.money + WEAPONS[e.weapon].killReward);
    }
    if (killer === this.player) this.game.audio.killConfirm();
    if (victim === this.player) {
      this.deathInfo = `Eliminado por ${killer.name} — ${WEAPONS[e.weapon].name}${e.headshot ? ' (headshot)' : ''}`;
      this.respawnTimer = this.mode === 'practice' ? 2.5 : 0;
      this.wc.cancelInspect();
      this.spectateIndex = 0;
    }
    const bot = this.bots.find((b) => b.actor === victim);
    if (bot && this.mode === 'practice') bot.respawnTimer = 3;
  }

  /** @param {{ hitActor: boolean, headshot: boolean, kill: boolean }} r */
  onPlayerHit(r) {
    if (!r.hitActor) return;
    this.game.ui.hud.hitmarker(r.headshot, r.kill);
    this.game.audio.hitmarker(r.headshot);
  }

  /** Processa os eventos do RoundManager. */
  handleRoundEvents() {
    const R = this.round;
    for (const ev of R.events) {
      if (ev.type === 'roundStart') {
        this.spawnAll(false);
        for (const b of this.bots) this.botBuy(b.actor);
        this.banner = { text: `ROUND ${R.round}`, sub: 'Fase de compra — B abre a loja', t: 2.6, color: '#e8edf2' };
        this.game.audio.ui('roundStart');
      } else if (ev.type === 'live') {
        this.banner = { text: 'VALENDO', sub: 'Capture o Uplink ou elimine o time inimigo', t: 1.6, color: '#5dffb0' };
        this.game.audio.ui('tick');
        this.game.ui.closeBuyMenu?.();
      } else if (ev.type === 'captureStart') {
        this.game.audio.ui('capture');
      } else if (ev.type === 'roundEnd') {
        const mine = ev.winner === this.player.team;
        for (const a of this.allActors()) a.money = Math.min(RULES.maxMoney, a.money + R.roundIncome(a.team, ev.winner, ev.captured));
        this.game.save.data.progression.rounds++;
        const text = ev.winner < 0 ? 'EMPATE' : `${TEAM_NAMES[ev.winner]} VENCE O ROUND`;
        this.banner = { text, sub: ev.reason, t: 4, color: ev.winner < 0 ? '#e8edf2' : ev.winner === 0 ? '#2fd3c4' : '#ff7a3d' };
        this.game.audio.ui(ev.winner < 0 ? 'tick' : mine ? 'win' : 'lose');
      } else if (ev.type === 'matchEnd') {
        this.finish(ev.winner);
      }
    }
    R.events.length = 0;
  }

  /** Fim de partida: recompensas e tela de resultado. */
  finish(winner) {
    if (this.over) return;
    this.over = true;
    const p = this.player;
    const prog = this.game.save.data.progression;
    const won = winner === p.team;
    const shards = 100 + p.stats.kills * 25 + p.stats.headshots * 10 + (won ? 250 : 0);
    const xp = 200 + p.stats.kills * 50 + (won ? 400 : 0);
    prog.shards += shards;
    prog.matches++;
    if (won) prog.wins++;
    prog.kills += p.stats.kills;
    prog.deaths += p.stats.deaths;
    prog.headshots += p.stats.headshots;
    prog.xp += xp;
    while (prog.xp >= prog.level * 1000) {
      prog.xp -= prog.level * 1000;
      prog.level++;
    }
    this.game.save.markDirty();
    this.result = { won, winner, shards, xp, score: [...this.round.score] };
    this.game.audio.ui(won ? 'win' : 'lose');
    this.game.ui.showMatchEnd(this);
  }

  /** Quem a câmera segue com o jogador morto (competitivo). */
  spectateTarget() {
    const allies = this.bots.filter((b) => b.actor.team === this.player.team && b.actor.alive);
    const pool = allies.length ? allies : this.bots.filter((b) => b.actor.alive);
    if (!pool.length) return null;
    return pool[this.spectateIndex % pool.length].actor;
  }

  /**
   * @param {number} dt
   * @param {{ menuOpen: boolean }} o
   */
  update(dt, o) {
    const g = this.game;
    this.time += dt;
    this.combat.update(dt);
    const competitive = this.mode === 'competitive';
    const R = this.round;
    if (competitive) {
      R.update(dt, this.combat.actors);
      this.handleRoundEvents();
    }
    const frozen = competitive && R.phase === 'buy';
    const ended = competitive && (R.phase === 'end' || R.phase === 'over');
    const p = this.player;

    // ── jogador ──
    const def = p.weapon.def;
    const inputActive = !o.menuOpen && g.input.locked;
    if (!inputActive) g.input.consumeMouse();
    if (inputActive || !p.alive) {
      this.pc.update(dt, g.input, g.settings.data, {
        frozen: frozen || !inputActive,
        moveMult: def.moveMult,
        zoomMult: this.wc.zoomed ? (def.zoomFov || 1) / g.settings.data.fov : 1,
        firing: g.input.buttons[0] && p.weapon.def.type !== 'knife',
      });
    } else {
      // menu aberto: ainda aplica gravidade/atrito
      this.pc.update(dt, g.input, g.settings.data, { frozen: true, moveMult: 1, zoomMult: 0, firing: false });
    }
    this.wc.update(dt, g.input, {
      canAct: inputActive && p.alive && !ended,
      speed: this.pc.speed,
      grounded: p.body.grounded,
      sprinting: this.pc.sprinting,
      camera: g.camera,
    });

    // ── morte / renascimento / espectador ──
    if (!p.alive) {
      if (this.mode === 'practice') {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          const sp = g.arena.spawns[0][Math.floor(Math.random() * 5)];
          this.spawnActor(p, sp, true);
          p.weapons.primary = p.weapons.primary || this.makeWeapon(p, 'rifle');
          p.slot = 'primary';
          this.wc.equip('primary');
        }
      } else if (inputActive && g.input.buttonsPressed[0]) this.spectateIndex++;
    }

    // ── bots ──
    const rules = { canMove: !frozen, canShoot: !frozen && !(competitive && R.phase === 'over') };
    const actors = this.combat.actors;
    for (const b of this.bots) {
      b.update(dt, actors, rules);
      if (!b.actor.alive && this.mode === 'practice') {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          const list = g.arena.spawns[b.actor.team];
          this.spawnActor(b.actor, list[Math.floor(Math.random() * list.length)], true);
          b.actor.weapons.primary = makeWeaponState(Math.random() < 0.75 ? 'rifle' : Math.random() < 0.5 ? 'smg' : 'dmr');
          b.actor.armor = 100;
          b.actor.helmet = true;
          b.actor.slot = 'primary';
        }
      }
    }

    // ── alvos ──
    for (const t of this.targets) {
      const a = t.actor;
      if (!a.alive) {
        t.respawn -= dt;
        if (t.respawn <= 0) a.resetForRound();
      }
      if (t.spot.moving && a.alive) {
        t.phase += dt;
        const off = Math.sin(t.phase * 0.9) * 2.2;
        const cx = t.spot.x;
        const cz = t.spot.z;
        // desliza perpendicular à linha até o centro
        const len = Math.hypot(cx, cz) || 1;
        a.body.pos.set(cx + (-cz / len) * off, t.spot.y || 0, cz + (cx / len) * off);
      }
      t.model.update(dt, { x: a.body.pos.x, y: a.body.pos.y, z: a.body.pos.z, yaw: a.yaw, alive: a.alive });
    }

    // ── Uplink ──
    const c = R.capture;
    g.arena.setUplinkState(competitive ? c.owner : -1, competitive ? c.progress : 0, this.time);

    if (this.banner.t > 0) this.banner.t -= dt;
  }

  /** Remove tudo da cena ao sair da partida. */
  dispose() {
    for (const b of this.bots) this.game.scene.remove(b.model.root);
    for (const t of this.targets) this.game.scene.remove(t.model.root);
    this.game.fx.clear();
    this.game.arena.setUplinkState(-1, 0, 0);
  }
}
