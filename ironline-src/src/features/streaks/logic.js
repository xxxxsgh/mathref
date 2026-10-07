/**
 * Lógica PURA da feature streaks (sem DOM/WebGL — testada em
 * streaks.test.mjs):
 *
 *   STREAKS / StreakTracker  contagem de abates sem morrer, conjunto
 *                            escolhido (até 4), prontos, uso, reinício
 *   MEDALS / MedalTracker    regras das medalhas (≥ 15) a partir dos abates
 *   RingBuffer               anel de quadros com amostragem por tempo (killcam)
 *   pickTurretTarget         escolha de alvo da torreta (alcance, arco,
 *                            linha de visão, histerese no alvo atual)
 *   strikePattern            pontos e atrasos escalonados do morteiro
 *   turnToward               giro com velocidade máxima (torreta/drone)
 */

// ─── killstreaks ─────────────────────────────────────────────────────────
export const STREAKS = {
  uav: { id: 'uav', name: 'RECON UAV', kills: 3, icon: 'uav', duration: 30, desc: 'Varreduras de radar revelam os inimigos no minimapa.' },
  airstrike: { id: 'airstrike', name: 'MORTAR STRIKE', kills: 5, icon: 'mortar', desc: 'Designador tático: 8 granadas de morteiro escalonadas no ponto marcado.' },
  sentry: { id: 'sentry', name: 'SENTRY GUN', kills: 6, icon: 'sentry', duration: 60, desc: 'Torreta automática em tripé: rastreia, atira, superaquece; pode ser destruída.' },
  drone: { id: 'drone', name: 'ATTACK DRONE', kills: 7, icon: 'drone', duration: 40, mode: 'gun', desc: 'Quadricóptero armado que caça inimigos por 40 s.' },
  kamikaze: { id: 'kamikaze', name: 'KAMIKAZE DRONE', kills: 7, icon: 'kamikaze', duration: 25, mode: 'kamikaze', desc: 'Quadricóptero com carga explosiva que mergulha no inimigo.' },
};
export const DEFAULT_LOADOUT = ['uav', 'airstrike', 'sentry', 'drone'];
export const MAX_LOADOUT = 4;

/** Normaliza um conjunto: ids válidos, sem repetição, ≤ 4, por custo. */
export function normalizeLoadout(ids) {
  const out = [];
  for (const id of ids || []) {
    if (!STREAKS[id] || out.includes(id)) continue;
    // drone de tiro e kamikaze ocupam a mesma "vaga" de 7 abates
    if ((id === 'drone' && out.includes('kamikaze')) || (id === 'kamikaze' && out.includes('drone'))) continue;
    out.push(id);
  }
  out.sort((a, b) => STREAKS[a].kills - STREAKS[b].kills);
  return out.slice(0, MAX_LOADOUT);
}

export class StreakTracker {
  constructor(loadout = DEFAULT_LOADOUT, { streakKillsCount = false } = {}) {
    this.streakKillsCount = streakKillsCount;
    this.setLoadout(loadout);
    this.reset();
  }

  setLoadout(ids) {
    const n = normalizeLoadout(ids);
    this.loadout = n.length ? n : [...DEFAULT_LOADOUT];
    return this.loadout;
  }

  reset() {
    this.count = 0;
    this.best = 0;
    this.ready = []; // ids prontos (ordem de chegada; podem acumular)
    this.earnedThisLife = new Set();
  }

  /**
   * Um abate do jogador. `byStreak` = abate feito por uma killstreak (não
   * conta, salvo `streakKillsCount`). Retorna os ids recém-ganhos.
   */
  kill({ byStreak = false } = {}) {
    if (byStreak && !this.streakKillsCount) return [];
    this.count++;
    this.best = Math.max(this.best, this.count);
    const earned = [];
    for (const id of this.loadout) {
      if (STREAKS[id].kills === this.count && !this.earnedThisLife.has(id)) {
        this.earnedThisLife.add(id);
        this.ready.push(id);
        earned.push(id);
      }
    }
    return earned;
  }

  /** Morte: a contagem zera; o que já foi ganho continua guardado. */
  death() {
    this.count = 0;
    this.earnedThisLife.clear();
  }

  has(id) {
    return this.ready.includes(id);
  }

  /** Usa (consome) uma streak pronta. */
  use(id) {
    const i = this.ready.indexOf(id);
    if (i < 0) return false;
    this.ready.splice(i, 1);
    return true;
  }

  /** Próxima meta { id, kills, left } ou null. */
  next() {
    for (const id of this.loadout) {
      const k = STREAKS[id].kills;
      if (k > this.count) return { id, kills: k, left: k - this.count };
    }
    return null;
  }

  /** Estado para a HUD (barra de killstreaks). */
  slots() {
    return this.loadout.map((id, i) => ({ id, name: STREAKS[id].name, kills: STREAKS[id].kills, icon: STREAKS[id].icon, key: String(3 + i), ready: this.ready.filter((r) => r === id).length, progress: Math.min(1, this.count / STREAKS[id].kills) }));
  }
}

// ─── medalhas ────────────────────────────────────────────────────────────
export const MEDALS = {
  first_blood: { name: 'FIRST BLOOD', xp: 100, icon: 'first' },
  double: { name: 'DOUBLE KILL', xp: 50, icon: 'double' },
  triple: { name: 'TRIPLE KILL', xp: 100, icon: 'triple' },
  fury: { name: 'FURY KILL', xp: 150, icon: 'fury' },
  headshot: { name: 'HEADSHOT', xp: 50, icon: 'head' },
  longshot: { name: 'LONGSHOT', xp: 50, icon: 'long' },
  point_blank: { name: 'POINT BLANK', xp: 50, icon: 'blank' },
  collateral: { name: 'COLLATERAL', xp: 100, icon: 'collateral' },
  revenge: { name: 'REVENGE', xp: 50, icon: 'payback' },
  comeback: { name: 'COMEBACK', xp: 75, icon: 'comeback' },
  slide_kill: { name: 'SLIDE KILL', xp: 75, icon: 'slide' },
  grenade_kill: { name: 'GRENADE KILL', xp: 50, icon: 'frag' },
  knife_kill: { name: 'KNIFE KILL', xp: 50, icon: 'knife' },
  execution: { name: 'EXECUTION', xp: 150, icon: 'execution' },
  buzzkill: { name: 'BUZZKILL', xp: 75, icon: 'buzzkill' },
  survivor: { name: 'SURVIVOR', xp: 50, icon: 'survivor' },
  last_stand: { name: 'LAST STAND', xp: 75, icon: 'laststand' },
  barrel_kill: { name: 'KABOOM', xp: 50, icon: 'barrel' },
  shield_breaker: { name: 'FLANKER', xp: 75, icon: 'flank' },
  streak_5: { name: 'BLOODTHIRSTY', xp: 100, icon: 'streak' },
  streak_10: { name: 'MERCILESS', xp: 200, icon: 'streak' },
  streak_15: { name: 'RUTHLESS', xp: 300, icon: 'streak' },
  airstrike_kill: { name: 'MORTAR KILL', xp: 50, icon: 'mortar' },
  sentry_kill: { name: 'SENTRY KILL', xp: 50, icon: 'sentry' },
  drone_kill: { name: 'DRONE KILL', xp: 50, icon: 'drone' },
};

/**
 * Regras das medalhas. Entradas (todas com `t` = tempo de jogo):
 *   kill(k)    k = { t, id, part, dist, weapon, melee, explosion, barrel,
 *                    execution, streak, sliding, health, maxHealth, shot,
 *                    role, reviving, laser, killer }  → [ids]
 *   damage({ t, health, maxHealth })    (para SURVIVOR)
 *   death({ t, killerId })              (REVENGE / COMEBACK)
 *   respawn({ t })
 * `killer` (no kill) = id do inimigo que matou o jogador por último.
 */
export class MedalTracker {
  constructor({ multiWindow = 4, longshot = 35, pointBlank = 3 } = {}) {
    this.cfg = { multiWindow, longshot, pointBlank };
    this.reset();
  }

  reset() {
    this.kills = 0;
    this.lifeKills = 0;
    this.deathsNoKill = 0;
    this.multi = { n: 0, t: -1e9 };
    this.lastKiller = null;
    this.lastShot = { shot: -1, n: 0 };
    this.lowHealth = false;
    this.awarded = [];
  }

  kill(k) {
    const out = [];
    const c = this.cfg;
    this.kills++;
    this.lifeKills++;
    if (this.kills === 1) out.push('first_blood');
    // multi-abate
    if (k.t - this.multi.t <= c.multiWindow) this.multi.n++;
    else this.multi.n = 1;
    this.multi.t = k.t;
    if (this.multi.n === 2) out.push('double');
    else if (this.multi.n === 3) out.push('triple');
    else if (this.multi.n >= 4) out.push('fury');
    // tipo do abate
    if (k.execution) out.push('execution');
    else if (k.melee) out.push('knife_kill');
    if (k.streak === 'airstrike') out.push('airstrike_kill');
    else if (k.streak === 'sentry') out.push('sentry_kill');
    else if (k.streak === 'drone' || k.streak === 'kamikaze') out.push('drone_kill');
    else if (k.barrel) out.push('barrel_kill');
    else if (k.explosion || k.weapon === 'frag') out.push('grenade_kill');
    if (k.part === 'head' && !k.explosion && !k.melee) out.push('headshot');
    if (!k.streak && !k.explosion && !k.melee) {
      if (k.dist >= c.longshot) out.push('longshot');
      else if (k.dist <= c.pointBlank) out.push('point_blank');
    }
    // dois abates com o MESMO tiro
    if (k.shot != null && k.shot >= 0 && !k.explosion) {
      if (this.lastShot.shot === k.shot) {
        this.lastShot.n++;
        if (this.lastShot.n === 2) out.push('collateral');
      } else this.lastShot = { shot: k.shot, n: 1 };
    }
    if (k.sliding) out.push('slide_kill');
    if (this.lastKiller != null && k.id === this.lastKiller) {
      out.push('revenge');
      this.lastKiller = null;
    }
    if (this.deathsNoKill >= 3) out.push('comeback');
    this.deathsNoKill = 0;
    // interrompeu algo: socorrista reanimando, atirador com o laser em você
    if (k.reviving || k.laser) out.push('buzzkill');
    if (k.role === 'shield' && !k.explosion) out.push('shield_breaker');
    if (k.health != null && k.maxHealth && k.health > 0 && k.health <= k.maxHealth * 0.2) out.push('last_stand');
    // sequência (só abates "de mão": as killstreaks não contam)
    if (!k.streak) {
      this.streakN = (this.streakN || 0) + 1;
      if (this.streakN === 5) out.push('streak_5');
      else if (this.streakN === 10) out.push('streak_10');
      else if (this.streakN === 15) out.push('streak_15');
    }
    this.awarded.push(...out);
    return out;
  }

  /** Dano/regeneração: quase morto (≤ 15 %) e voltou a 100 % → SURVIVOR. */
  damage({ health, maxHealth }) {
    if (health > 0 && health <= maxHealth * 0.15) this.lowHealth = true;
    if (this.lowHealth && health >= maxHealth * 0.999) {
      this.lowHealth = false;
      this.awarded.push('survivor');
      return ['survivor'];
    }
    return [];
  }

  death({ killerId = null } = {}) {
    this.lastKiller = killerId;
    if (this.lifeKills === 0) this.deathsNoKill++;
    this.lifeKills = 0;
    this.streakN = 0;
    this.lowHealth = false;
    this.multi = { n: 0, t: -1e9 };
  }
}

// ─── anel de quadros (killcam) ───────────────────────────────────────────
export class RingBuffer {
  constructor(capacity) {
    this.cap = capacity;
    this.buf = new Array(capacity);
    this.start = 0;
    this.size = 0;
  }
  push(item) {
    const i = (this.start + this.size) % this.cap;
    this.buf[i] = item;
    if (this.size < this.cap) this.size++;
    else this.start = (this.start + 1) % this.cap;
    return item;
  }
  /** i-ésimo mais antigo (0 = mais antigo). */
  at(i) {
    if (i < 0 || i >= this.size) return undefined;
    return this.buf[(this.start + i) % this.cap];
  }
  get last() {
    return this.at(this.size - 1);
  }
  get first() {
    return this.at(0);
  }
  clear() {
    this.start = 0;
    this.size = 0;
  }
  toArray() {
    const out = [];
    for (let i = 0; i < this.size; i++) out.push(this.at(i));
    return out;
  }
  /**
   * Par de quadros ao redor do tempo `t` (campo `.t`): { a, b, k } com
   * k ∈ [0,1] para interpolar; fora do intervalo devolve o extremo (k 0).
   */
  sample(t) {
    if (!this.size) return null;
    if (t <= this.first.t) return { a: this.first, b: this.first, k: 0 };
    if (t >= this.last.t) return { a: this.last, b: this.last, k: 0 };
    let lo = 0, hi = this.size - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.at(mid).t <= t) lo = mid;
      else hi = mid;
    }
    const a = this.at(lo), b = this.at(hi);
    return { a, b, k: (t - a.t) / Math.max(1e-9, b.t - a.t) };
  }
}

/** Interpolação de ângulo pelo caminho curto. */
export function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

// ─── torreta ─────────────────────────────────────────────────────────────
/**
 * Escolhe o alvo da torreta. `tur` = { x, z, yaw (convenção do modelo:
 * 0 = +Z), range, arc (semi-ângulo; Infinity = 360°) }; `cands` =
 * [{ id, x, z, alive, visible, threat? }]; `currentId` ganha histerese
 * (troca só se outro for bem melhor). Pontuação: distância + custo do giro
 * (o que exige girar menos vem antes) − ameaça.
 */
export function pickTurretTarget(tur, cands, currentId = null) {
  let best = null, bs = Infinity, cur = null, cs = Infinity;
  for (const c of cands) {
    if (!c.alive || !c.visible) continue;
    const dx = c.x - tur.x, dz = c.z - tur.z;
    const d = Math.hypot(dx, dz);
    if (d > tur.range) continue;
    const ang = Math.atan2(dx, dz);
    const turn = Math.abs(Math.atan2(Math.sin(ang - tur.yaw), Math.cos(ang - tur.yaw)));
    if (tur.arc != null && turn > tur.arc) continue;
    const s = d + turn * 6 - (c.threat || 0) * 4;
    if (c.id === currentId) {
      cur = c;
      cs = s;
    }
    if (s < bs) {
      bs = s;
      best = c;
    }
  }
  if (cur && best !== cur && bs > cs - 5) return cur;
  return best;
}

/** Gira `cur` em direção a `target` com velocidade máxima `rate·dt`. */
export function turnToward(cur, target, rate, dt) {
  const d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
  const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  return cur + step;
}

// ─── morteiro ────────────────────────────────────────────────────────────
/**
 * Pontos de impacto do morteiro em volta de `c` ({x, z}): `n` granadas,
 * espalhamento até `radius` (a 1ª perto do centro), atrasos escalonados
 * (0,25–0,7 s entre elas). `r()` → [0,1). Retorna [{ x, z, delay }].
 */
export function strikePattern(c, n = 8, radius = 7, r = Math.random) {
  const out = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    // raiz quadrada: área uniforme; a primeira cai mais perto do centro
    const m = (i === 0 ? 0.3 : Math.sqrt(r())) * radius;
    out.push({ x: c.x + Math.cos(a) * m, z: c.z + Math.sin(a) * m, delay: t });
    t += 0.25 + r() * 0.45;
  }
  return out;
}
