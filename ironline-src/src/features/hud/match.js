/**
 * Regras da partida (modo ELIMINAÇÃO, solo contra o esquadrão hostil) e
 * estatísticas que alimentam HUD, placar e relatório pós-partida.
 *
 * O HUD é o "frontend" do jogo: ele decide quando a partida começa, pausa,
 * termina, quando o jogador renasce e a regeneração de vida (estilo
 * militar moderno: alguns segundos sem dano e a vida volta rápido).
 * Tudo via estado público (ctx.player, ctx.time, serviços), nunca mexendo
 * por dentro de outras features.
 */
const CALLSIGNS = ['KESTREL', 'VOLKOV', 'RAZOR', 'NOMAD', 'HALVARD', 'SPECTER', 'DRAGAN', 'ORLOV', 'CINDER', 'MAKAROV', 'TALON', 'BRASK', 'VIPER', 'KORSAK', 'GRIMM', 'STRYDE'];

import { buildMode, MODES, zoneState, zoneStep, zoneResult, hardpointWave, isBossWave, inZone, pickZone, spiral } from './modes.js';
import { XP, HOLD_TICK } from './progression.js';

/**
 * Modo ATIVO (objeto compartilhado: HUD, menus e placar leem daqui). Os três
 * modos (FRONTLINE, HARDPOINT, SURVIVAL — definições em modes.js) usam o
 * mesmo motor de ondas: cada onda entra pelos `world.enemySpawns` longe do
 * jogador, com no máximo `maxAlive` vivos. Muda com `setMode()` (menu) ou
 * `?mode=`; `?waves=2,3`, `?mt=s`, `?wi=s`, `?hold=s`, `?lives=n` encurtam
 * a partida (testes e2e / capturas).
 */
export const MODE = buildMode('waves', null);
let _params = null;

/** Troca o modo ativo (fora da partida). */
export function setMode(id, mapName = MODE.map) {
  const m = buildMode(MODES[id] ? id : 'waves', _params, mapName);
  for (const k of Object.keys(MODE)) delete MODE[k];
  Object.assign(MODE, m);
  return MODE;
}

/** Aplica overrides de URL ao modo (antes de montar o HUD). */
export function configureMode(params, id = params?.get?.('mode') || 'waves', mapName = '') {
  _params = params;
  return setMode(id, mapName);
}

export { XP };

export class Match {
  static serial = 0;
  constructor(ctx, hooks) {
    this.ctx = ctx;
    this.hooks = hooks; // { feed, xp, medal, hit, damage, death, respawn, end }
    this.names = new WeakMap();
    this.nameIdx = 0;
    this.reset();
  }

  reset() {
    this.phase = 'menu';
    this.timeLeft = MODE.time;
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.shots = 0;
    this.hits = 0;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.longest = 0;
    this.damage = 0;
    this.medals = {};
    this.multi = { n: 0, t: -99 };
    this.lastDamage = -99;
    this.lastKiller = null;
    this.deadT = 0;
    this.playTime = 0;
    this.hostile = new Map(); // nome → { kills, deaths, score }
    this.xpEarned = 0;
    // ondas
    this.wave = 0; // 1-based quando em jogo
    this.toSpawn = 0;
    this.spawnCd = 0;
    this.waveT = 0; // intervalo antes da próxima onda (s)
    this.waveAlive = new Set();
    // objetivos / modos
    this.mode = MODE.id;
    this.objectiveXP = 0;
    this.medalXP = 0;
    this.lives = MODE.lives || 0; // SURVIVAL: vidas restantes (0 = ilimitado)
    this.zone = null; // HARDPOINT: { x, y, z, radius }
    this.zs = zoneState();
    this.holdAcc = 0;
    this.boss = null; // SURVIVAL: o chefe em campo
    this.bossKilled = false;
    this.bossSpawned = false;
    this.endReason = '';
  }

  /** XP de objetivo (toast + soma no placar). */
  award(label, xp, toast = true) {
    this.objectiveXP += xp;
    this.score += xp;
    this.xpEarned += xp;
    if (toast) this.hooks.xp?.([[label, xp]], xp);
  }

  nameOf(enemy) {
    if (!enemy) return 'HOSTILE';
    let n = this.names.get(enemy);
    if (!n) {
      n = CALLSIGNS[this.nameIdx++ % CALLSIGNS.length];
      this.names.set(enemy, n);
    }
    return n;
  }
  rowOf(name) {
    let r = this.hostile.get(name);
    if (!r) this.hostile.set(name, (r = { name, kills: 0, deaths: 0, score: 0, alive: true }));
    return r;
  }

  get accuracy() {
    return this.shots ? this.hits / this.shots : 0;
  }
  get kd() {
    return this.deaths ? this.kills / this.deaths : this.kills;
  }

  // ─── eventos ───────────────────────────────────────────────────────────
  onFire() {
    if (this.phase === 'play') this.shots++;
  }
  onHit(h) {
    const data = h.collider?.data;
    const enemy = data?.enemy;
    if (!enemy || (h.source && h.source !== 'player')) return;
    // a arma aplica o dano ANTES de emitir weapon:hit: no tiro que mata, o
    // evento de morte já chegou e o colisor virou 'corpse'
    const killing = enemy === this.justKilled;
    if (data.kind !== 'enemy' && !killing) return;
    if (this.phase === 'play') {
      this.hits++;
      this.damage += h.damage || 0;
    }
    if (killing) {
      this.justKilled = null;
      return;
    }
    this.hooks.hit({ head: h.part === 'head', enemy, kill: false });
  }
  onEnemyDeath({ enemy, info }) {
    const name = this.nameOf(enemy);
    const row = this.rowOf(name);
    row.deaths++;
    row.alive = false;
    const byPlayer = !info || info.source === 'player' || info.source === undefined;
    if (!byPlayer) return;
    this.justKilled = enemy;
    const now = this.ctx.time.now;
    const head = info?.part === 'head';
    const pos = this.ctx.player.position;
    const ep = enemy?.group?.position;
    const dist = ep ? Math.hypot(ep.x - pos.x, ep.z - pos.z) : info?.distance || 0;
    this.kills++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.longest = Math.max(this.longest, dist);
    if (head) this.headshots++;
    this.hooks.hit({ head, enemy, kill: true });
    const lines = [['ENEMY KILLED', XP.kill]];
    if (head) lines.push(['HEADSHOT', XP.head]);
    if (dist > 32) lines.push(['LONGSHOT', XP.long]);
    let medal = null;
    if (now - this.multi.t < 4) this.multi.n++;
    else this.multi.n = 1;
    this.multi.t = now;
    if (this.multi.n === 2) { lines.push(['DOUBLE KILL', XP.double]); medal = ['double', 'DOUBLE KILL']; }
    else if (this.multi.n >= 3) { lines.push(['TRIPLE KILL', XP.triple]); medal = ['triple', 'TRIPLE KILL']; }
    if (this.lastKiller && this.lastKiller === name) {
      lines.push(['PAYBACK', XP.payback]);
      medal = medal || ['payback', 'PAYBACK'];
      this.lastKiller = null;
    }
    if (this.streak === 5 || this.streak === 10) {
      lines.push([`${this.streak} KILL STREAK`, XP.streak5]);
      medal = ['streak', this.streak === 5 ? 'BLOODTHIRSTY' : 'MERCILESS'];
    }
    if (!medal && head) medal = ['head', 'HEADSHOT'];
    if (!medal && dist > 32) medal = ['long', 'LONGSHOT'];
    if (enemy?.boss) {
      // chefe abatido: bônus grande + medalha própria
      this.bossKilled = true;
      lines.push(['JUGGERNAUT DOWN', XP.bossKill]);
      medal = ['streak', 'GIANT SLAYER'];
      this.objectiveXP += XP.bossKill;
      this.hooks.objective?.('bossDown', { enemy });
    }
    if (medal) {
      this.medals[medal[1]] = { kind: medal[0], n: (this.medals[medal[1]]?.n || 0) + 1 };
      this.medalXP += 50;
    }
    const total = lines.reduce((a, l) => a + l[1], 0);
    this.score += total;
    this.xpEarned += total;
    this.hooks.feed({ killer: 'self', victim: name, head, weapon: 'rifle' });
    this.hooks.xp(lines, total);
    if (medal) this.hooks.medal(medal[0], medal[1], total);
    // a vitória vem de limpar a última onda (updateWaves)
  }
  onPlayerDamage(e) {
    this.lastDamage = this.ctx.time.now;
    this.hooks.damage(e);
  }
  onPlayerDeath(info) {
    if (this.phase !== 'play') return;
    this.deaths++;
    this.streak = 0;
    const name = info?.enemy ? this.nameOf(info.enemy) : 'HOSTILE';
    this.lastKiller = name;
    const row = this.rowOf(name);
    row.kills++;
    row.score += 100;
    this.hooks.feed({ killer: name, victim: 'self', head: false, weapon: 'rifle' });
    this.phase = 'dead';
    this.deadT = 0;
    this.hooks.death(name);
    // SURVIVAL: cada morte gasta uma vida; sem vidas, fim
    if (MODE.lives) {
      this.lives = Math.max(0, this.lives - 1);
      if (this.lives <= 0) {
        this.endReason = 'NO LIVES LEFT';
        this.finish(false);
      }
    }
  }

  start() {
    this.reset();
    this.phase = 'play';
    // identidade desta partida (o perfil registra cada uma uma única vez)
    this.startedAt = ++Match.serial;
    const en = this.ctx.services.enemies;
    if (en) {
      // a partida conduz a população: some com quem estava na rua
      en.auto = false;
      en.clear?.();
    }
    this.waveT = 2.5; // respiro antes da 1ª onda
    if (MODE.id === 'hardpoint') {
      this.zone = this.resolveZone();
      en?.setObjective?.(this.zone);
    } else en?.setObjective?.(null);
    if (MODE.id === 'survival') en?.prepareBoss?.();
  }

  /**
   * Zona do HARDPOINT: do mapa (`world.hardpoints`/`world.zones`, se
   * publicar) ou calculada entre o nascimento do jogador e as entradas
   * inimigas (modes.pickZone), deslocada até um ponto livre e andável.
   */
  resolveZone(near = null) {
    const ctx = this.ctx;
    const w = ctx.services.world;
    const r = MODE.radius || 4.5;
    const pub = w?.hardpoints?.[0] || w?.zones?.[0];
    if (pub && !near) {
      const p = pub.position || [pub.x, pub.y, pub.z];
      return { x: p[0], y: p[1] || 0, z: p[2], radius: pub.radius || r };
    }
    const c = near || pickZone(w?.spawnPoints?.[0], w?.enemySpawns || [], w?.bounds || null, 0.42);
    const nav = ctx.services.enemies?.nav;
    const col = ctx.collision;
    // ponto livre: chão no nível 0, sem colisor na cápsula e andável
    // pela grade dos inimigos (quando existe), preferindo ter área aberta
    let best = null, bs = Infinity;
    for (const q of spiral(c.x, c.z, 1.5, 8)) {
      const gy = col?.groundHeight?.(q.x, q.z, 2.4, 4);
      if (gy == null || Math.abs(gy - (c.y || 0)) > 0.5) continue;
      if (col.overlapSphere({ x: q.x, y: gy + 1, z: q.z }, 0.6, (o) => o.blocksPlayer !== false && !o.trigger && !o.dynamic).length) continue;
      let open = 0;
      if (nav) {
        const i = nav.cellOf(q.x, q.z);
        if (i < 0 || !nav.walk[i]) continue;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2, j = nav.cellOf(q.x + Math.cos(a) * r * 0.8, q.z + Math.sin(a) * r * 0.8);
          if (j >= 0 && nav.walk[j]) open++;
        }
      }
      const sc = Math.hypot(q.x - c.x, q.z - c.z) * 0.35 + (8 - open) * 1.2;
      if (sc < bs) { bs = sc; best = { x: q.x, y: gy, z: q.z }; }
    }
    const p = best || c;
    return { x: p.x, y: p.y || 0, z: p.z, radius: r };
  }

  /** Começa a onda n (1-based). */
  beginWave(n) {
    this.wave = n;
    this.toSpawn = MODE.id === 'hardpoint' ? hardpointWave(MODE, n) : MODE.waves[n - 1] || 0;
    this.spawnCd = 0;
    this.waveAlive.clear();
    // SURVIVAL: a última onda abre com o chefe (+ escolta)
    this.bossPending = isBossWave(MODE, n);
    this.hooks.wave?.(n, MODE.id === 'hardpoint' ? 0 : MODE.waves.length, this.toSpawn, this.bossPending);
  }

  /** Um soldado da onda entra pelo fundo da rua, longe do jogador. */
  spawnOne(boss = false) {
    const ctx = this.ctx;
    const en = ctx.services.enemies;
    const spawns = ctx.services.world?.enemySpawns || [];
    if (!en?.spawn || !spawns.length) return false;
    const pl = ctx.player.position;
    const dist = (s) => Math.hypot(s.position[0] - pl.x, s.position[2] - pl.z);
    let pool = spawns.filter((s) => dist(s) > 26);
    if (!pool.length) pool = [...spawns].sort((a, b) => dist(b) - dist(a)).slice(0, 2);
    const sp = pool[Math.floor(ctx.rng.next() * pool.length)];
    // espalha quem nasce no mesmo ponto (sem entrar em parede)
    const P = [...sp.position];
    for (let k = 0; k < 4; k++) {
      const x = sp.position[0] + (ctx.rng.next() - 0.5) * 2.4;
      const z = sp.position[2] + (ctx.rng.next() - 0.5) * 5;
      const c = { x, y: (sp.position[1] || 0) + 1, z };
      if (!ctx.collision.overlapSphere(c, 0.45, (o) => o.blocksPlayer !== false && !o.trigger).length) {
        P[0] = x;
        P[2] = z;
        break;
      }
    }
    const e = en.spawn({ position: P, yaw: sp.yaw ?? Math.PI, variant: Math.floor(ctx.rng.next() * (en.variants || 4)), boss });
    if (e?.brain) {
      if (MODE.id === 'hardpoint' && e.brain.assault) {
        // HARDPOINT: ~2/3 da onda é o grupo de assalto da zona
        e.brain.assault({ assaulter: ctx.rng.next() < 0.68 });
      } else if (boss && e.brain.assault) {
        e.brain.assault({ assaulter: false });
      } else {
        // a onda chega sabendo onde a linha está: entra em combate procurando
        e.brain.awareness = Math.max(e.brain.awareness || 0, 0.6);
        e.brain.hear?.(ctx.player.position.clone?.() || pl, 0.5);
      }
    }
    if (e) this.waveAlive.add(e);
    if (e && boss) {
      this.boss = e;
      this.bossSpawned = true;
      this.hooks.objective?.('bossIn', { enemy: e });
    }
    return !!e;
  }

  get waveCount() {
    return MODE.waves.length;
  }

  finish(win) {
    if (this.phase === 'end') return;
    if (!this.endReason) this.endReason = win ? (MODE.id === 'hardpoint' ? 'ZONE SECURED' : MODE.id === 'survival' ? 'JUGGERNAUT NEUTRALIZED' : 'HOSTILE CELL NEUTRALIZED') : 'TIME EXPIRED';
    this.ctx.services.enemies?.setObjective?.(null);
    this.phase = 'end';
    this.win = win;
    this.hooks.end(win);
  }

  /** passo fixo */
  update(dt) {
    const ctx = this.ctx;
    const p = ctx.player;
    if (this.phase === 'play') {
      this.playTime += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.endReason = 'TIME EXPIRED';
        this.finish(false);
      }
      // regeneração
      if (p.alive && p.health < p.maxHealth && ctx.time.now - this.lastDamage > 4.2) {
        p.health = Math.min(p.maxHealth, p.health + 38 * dt);
      }
      for (const e of ctx.services.enemies?.list || []) if (e.alive) this.rowOf(this.nameOf(e)).alive = true;
      this.updateWaves(dt);
      this.updateZone(dt);
    } else if (this.phase === 'dead') {
      this.deadT += dt;
      // a onda continua chegando enquanto o jogador espera para renascer
      this.updateWaves(dt);
      this.updateZone(dt);
      if (this.deadT > 4 && this.phase === 'dead') this.respawn();
    }
  }

  updateWaves(dt) {
    if (this.phase === 'end') return;
    for (const e of this.waveAlive) if (!e.alive) this.waveAlive.delete(e);
    if (this.waveT > 0) {
      this.waveT -= dt;
      if (this.waveT <= 0) this.beginWave(this.wave + 1);
      return;
    }
    if (!this.wave) return;
    this.spawnCd -= dt;
    if (this.toSpawn > 0 && this.waveAlive.size < MODE.maxAlive && this.spawnCd <= 0) {
      const boss = !!this.bossPending;
      if (this.spawnOne(boss)) {
        this.toSpawn--;
        if (boss) this.bossPending = false;
      }
      this.spawnCd = boss ? 2.6 : 1.1 + this.ctx.rng.next() * 1.4;
    }
    if (this.toSpawn <= 0 && this.waveAlive.size === 0) {
      this.award('WAVE CLEARED', XP.waveClear, false); // o banner da onda já anuncia
      // HARDPOINT: ondas sem fim (a vitória vem da posse da zona)
      if (MODE.id === 'hardpoint') {
        this.waveT = MODE.intermission;
        this.hooks.waveClear?.(this.wave, 0);
        return;
      }
      if (this.wave >= MODE.waves.length) {
        if (this.phase === 'play' || this.phase === 'dead') this.finish(true);
      } else {
        this.waveT = MODE.intermission;
        this.hooks.waveClear?.(this.wave, MODE.waves.length);
      }
    }
  }

  /** HARDPOINT: captura/posse da zona (modes.zoneStep) e fim de partida. */
  updateZone(dt) {
    if (!this.zone || this.phase === 'end') return;
    const ctx = this.ctx;
    const p = ctx.player;
    const z = this.zone;
    const inside = this.phase === 'play' && p.alive && inZone(z, p.position.x, p.position.y, p.position.z);
    let foes = 0;
    for (const e of ctx.services.enemies?.list || []) if (e.alive && inZone(z, e.group.position.x, e.group.position.y, e.group.position.z)) foes++;
    this.zoneIn = inside;
    this.zoneFoes = foes;
    const ev = zoneStep(this.zs, { inside, foes, dt }, MODE);
    if (ev.captured) {
      this.award('ZONE CAPTURED', XP.capture);
      this.hooks.objective?.('captured', this.zs);
    }
    if (ev.lost) this.hooks.objective?.('lost', this.zs);
    if (ev.taken) this.hooks.objective?.('taken', this.zs);
    // posse: XP a cada HOLD_TICK s segurando
    if (this.zs.owner === 'us' && !this.zs.contested) {
      this.holdAcc += dt;
      if (this.holdAcc >= HOLD_TICK) {
        this.holdAcc -= HOLD_TICK;
        this.award('HOLDING', XP.holdTick);
      }
    }
    const res = zoneResult(this.zs, MODE);
    if (res === 'win') this.finish(true);
    else if (res === 'loss') {
      this.endReason = 'ZONE OVERRUN';
      this.finish(false);
    }
  }

  respawn() {
    const ctx = this.ctx;
    const p = ctx.player;
    const sps = ctx.services.world?.spawnPoints || [{ position: [0, 1, 0], yaw: 0, pitch: 0 }];
    // nasce no ponto mais longe dos inimigos vivos
    const foes = (ctx.services.enemies?.list || []).filter((e) => e.alive).map((e) => e.group.position);
    let best = sps[0], bd = -1;
    for (const s of sps) {
      const d = foes.length ? Math.min(...foes.map((f) => Math.hypot(f.x - s.position[0], f.z - s.position[2]))) : 0;
      if (d > bd) { bd = d; best = s; }
    }
    p.setPose(best);
    p.health = p.maxHealth;
    p.alive = true;
    this.phase = 'play';
    // a arma reabastece no renascimento (feature weapon escuta)
    ctx.bus.emit('player:respawn', { position: best.position });
    this.hooks.respawn();
  }
}
