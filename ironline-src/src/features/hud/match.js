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

export const MODE = { id: 'elim', name: 'ELIMINATION', map: 'MERIDIAN STREET', target: 30, time: 600 };

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
    if (this.kills >= MODE.target && this.phase === 'play') this.finish(true);
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
      if (this.timeLeft <= 0) this.finish(this.kills >= MODE.target);
      // regeneração
      if (p.alive && p.health < p.maxHealth && ctx.time.now - this.lastDamage > 4.2) {
        p.health = Math.min(p.maxHealth, p.health + 38 * dt);
      }
      for (const e of ctx.services.enemies?.list || []) if (e.alive) this.rowOf(this.nameOf(e)).alive = true;
    } else if (this.phase === 'dead') {
      this.deadT += dt;
      if (this.deadT > 4) this.respawn();
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
