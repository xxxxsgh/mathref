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

/**
 * Modo FRONTLINE: o jogador segura a rua contra ONDAS do esquadrão hostil.
 * Cada onda entra pelo fundo da rua (pontos de `world.enemySpawns` longe do
 * jogador), com no máximo `maxAlive` vivos ao mesmo tempo; limpar a última
 * onda vence, o relógio zerar perde. `target` = total de abates (soma).
 * `?waves=2,3` encurta a partida (testes e2e); `?mt=segundos` muda o tempo;
 * `?wi=segundos` muda o intervalo entre ondas.
 */
export const MODE = { id: 'waves', name: 'FRONTLINE', map: 'MERIDIAN STREET', waves: [4, 5, 6, 7, 8], target: 30, maxAlive: 5, time: 600, intermission: 7 };

/** Aplica overrides de URL ao modo (antes de montar o HUD). */
export function configureMode(params) {
  const w = params?.get?.('waves');
  if (w) {
    const list = w.split(',').map((n) => Math.max(1, Math.min(20, Number(n) | 0))).filter(Boolean);
    if (list.length) MODE.waves = list;
  }
  const mt = Number(params?.get?.('mt'));
  if (mt > 0) MODE.time = mt;
  const wi = Number(params?.get?.('wi'));
  if (wi > 0) MODE.intermission = wi;
  MODE.target = MODE.waves.reduce((a, b) => a + b, 0);
  return MODE;
}

// XP por evento
export const XP = { kill: 100, head: 50, long: 50, double: 50, triple: 100, streak5: 150, payback: 50, assist: 25, revenge: 50 };

export class Match {
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
    if (medal) this.medals[medal[1]] = { kind: medal[0], n: (this.medals[medal[1]]?.n || 0) + 1 };
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
  }

  start() {
    this.reset();
    this.phase = 'play';
    const en = this.ctx.services.enemies;
    if (en) {
      // a partida conduz a população: some com quem estava na rua
      en.auto = false;
      en.clear?.();
    }
    this.waveT = 2.5; // respiro antes da 1ª onda
  }

  /** Começa a onda n (1-based). */
  beginWave(n) {
    this.wave = n;
    this.toSpawn = MODE.waves[n - 1] || 0;
    this.spawnCd = 0;
    this.waveAlive.clear();
    this.hooks.wave?.(n, MODE.waves.length, this.toSpawn);
  }

  /** Um soldado da onda entra pelo fundo da rua, longe do jogador. */
  spawnOne() {
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
    const e = en.spawn({ position: P, yaw: sp.yaw ?? Math.PI, variant: Math.floor(ctx.rng.next() * (en.variants || 4)) });
    // a onda chega sabendo onde a linha está: entra em combate procurando
    if (e?.brain) {
      e.brain.awareness = Math.max(e.brain.awareness || 0, 0.6);
      e.brain.hear?.(ctx.player.position.clone?.() || pl, 0.5);
    }
    if (e) this.waveAlive.add(e);
    return !!e;
  }

  get waveCount() {
    return MODE.waves.length;
  }

  finish(win) {
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
      if (this.timeLeft <= 0) this.finish(false);
      // regeneração
      if (p.alive && p.health < p.maxHealth && ctx.time.now - this.lastDamage > 4.2) {
        p.health = Math.min(p.maxHealth, p.health + 38 * dt);
      }
      for (const e of ctx.services.enemies?.list || []) if (e.alive) this.rowOf(this.nameOf(e)).alive = true;
      this.updateWaves(dt);
    } else if (this.phase === 'dead') {
      this.deadT += dt;
      // a onda continua chegando enquanto o jogador espera para renascer
      this.updateWaves(dt);
      if (this.deadT > 4) this.respawn();
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
      if (this.spawnOne()) this.toSpawn--;
      this.spawnCd = 1.1 + this.ctx.rng.next() * 1.4;
    }
    if (this.toSpawn <= 0 && this.waveAlive.size === 0) {
      if (this.wave >= MODE.waves.length) {
        if (this.phase === 'play' || this.phase === 'dead') this.finish(true);
      } else {
        this.waveT = MODE.intermission;
        this.hooks.waveClear?.(this.wave, MODE.waves.length);
      }
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
    this.hooks.respawn();
  }
}
