/**
 * Modos de jogo — LÓGICA PURA (sem DOM/three): definições, overrides de URL,
 * matemática de captura do HARDPOINT e escolha da zona a partir dos dados
 * do mapa. Testada em `hud.test.mjs`.
 *
 *   waves      FRONTLINE (eliminação): ondas fixas, limpar a última vence,
 *              o relógio zerar perde.
 *   hardpoint  HARDPOINT (defesa): tomar e SEGURAR uma zona marcada no chão
 *              enquanto ondas sem fim atacam a zona. Vence ao completar
 *              `holdGoal` s de posse; perde se os hostis tomarem a zona
 *              ou o relógio zerar.
 *   survival   SURVIVAL: ondas crescentes; a última traz o CHEFE (juggernaut
 *              blindado) com escolta. Vence ao limpar a onda do chefe; perde
 *              ao esgotar as vidas.
 */

export const MODES = {
  waves: {
    id: 'waves', name: 'FRONTLINE', tag: 'ELIMINATION',
    blurb: 'Hold the line against {n} assault waves before time runs out. Each wave pushes in, takes cover and flanks — reload between waves and keep the initiative.',
    objective: 'CLEAR {n} WAVES',
    waves: [4, 5, 6, 7, 8], maxAlive: 5, time: 600, intermission: 7, lives: 0, threat: 'HIGH',
  },
  hardpoint: {
    id: 'hardpoint', name: 'HARDPOINT', tag: 'DEFENSE',
    blurb: 'Seize the marked zone and hold it while endless waves converge on it. Stand in the ring to capture; hostiles inside contest it — if they take the zone, the line is lost.',
    objective: 'HOLD THE ZONE {hold} S',
    waves: [3, 4, 4, 5, 5, 6], maxAlive: 6, time: 420, intermission: 4, lives: 0, threat: 'HIGH',
    holdGoal: 90, // segundos de posse para vencer
    captureTime: 5, // s para o jogador tomar a zona neutra (dobro se for dos hostis)
    enemyCaptureTime: 9, // s para UM hostil tomar a zona (mais hostis = mais rápido)
    radius: 4.5,
  },
  survival: {
    id: 'survival', name: 'SURVIVAL', tag: 'BOSS WAVE',
    blurb: 'Survive {n} escalating waves with {lives} lives. The final wave brings the Juggernaut — a heavily armored gunner with a belt-fed machine gun. Aim for the visor.',
    objective: '{n} WAVES · BOSS',
    waves: [3, 4, 5, 6, 3], maxAlive: 6, time: 1200, intermission: 9, lives: 3, threat: 'EXTREME',
    boss: true, // a última onda = chefe + (n − 1) de escolta
  },
};
export const MODE_IDS = Object.keys(MODES);

/**
 * Monta a configuração ativa: base do modo + overrides de URL
 * (`?waves=2,3`, `?mt=s`, `?wi=s`, `?hold=s`, `?lives=n`). Retorna um
 * objeto NOVO (quem chama aplica no MODE compartilhado).
 */
export function buildMode(id, params, mapName = '') {
  const base = MODES[id] || MODES.waves;
  const m = JSON.parse(JSON.stringify(base));
  const g = (k) => params?.get?.(k);
  const w = g('waves');
  if (w) {
    const list = w.split(',').map((n) => Math.max(1, Math.min(20, Number(n) | 0))).filter(Boolean);
    if (list.length) m.waves = list;
  }
  const mt = Number(g('mt'));
  if (mt > 0) m.time = mt;
  const wi = Number(g('wi'));
  if (wi > 0) m.intermission = wi;
  const hold = Number(g('hold'));
  if (hold > 0 && m.holdGoal) m.holdGoal = hold;
  const lives = Number(g('lives'));
  if (lives > 0 && m.lives) m.lives = lives | 0;
  m.target = m.waves.reduce((a, b) => a + b, 0);
  m.map = mapName || m.map || '';
  return m;
}

/** Texto com {n}, {hold}, {lives} preenchidos. */
export const fill = (s, m) => String(s).replace('{n}', m.waves?.length ?? '').replace('{hold}', m.holdGoal ?? '').replace('{lives}', m.lives ?? '');

/** Quantos hostis a onda n (1-based) do HARDPOINT traz: lista e depois +1 a cada 2 ondas. */
export function hardpointWave(m, n) {
  const L = m.waves;
  if (n <= L.length) return L[n - 1];
  return L[L.length - 1] + Math.floor((n - L.length) / 2);
}

/**
 * Estado da zona: `cap` ∈ [−1, 1] (+1 = nossa, −1 = dos hostis),
 * `owner` 'us' | 'them' | null, `hold` = s de posse acumulados.
 */
export const zoneState = () => ({ cap: 0, owner: null, hold: 0, contested: false, status: 'neutral', captured: 0 });

/**
 * Um passo da captura. `inside` = jogador vivo dentro da zona, `foes` =
 * hostis vivos dentro. Regras:
 *  - jogador sozinho: cap sobe 1/captureTime por s (zona dos hostis: passa
 *    por 0 e continua, ou seja, o dobro do tempo para virar);
 *  - hostis sozinhos: cap desce (1 hostil = 1/enemyCaptureTime; cada extra
 *    soma +35 % de velocidade, até 2,4×);
 *  - os dois: contestada — nada muda e a posse NÃO pontua;
 *  - ninguém: captura parcial volta devagar para o dono (ou para 0);
 *  - posse: vira 'us' em cap = 1, 'them' em cap = −1, perde-se ao cruzar 0;
 *  - `hold` cresce enquanto owner = 'us' e não contestada.
 * Retorna `{ captured: bool, lost: bool, taken: bool }` (eventos do passo).
 */
export function zoneStep(s, { inside = false, foes = 0, dt = 1 / 60 }, cfg = MODES.hardpoint) {
  const ev = { captured: false, lost: false, taken: false };
  const prevOwner = s.owner;
  s.contested = inside && foes > 0;
  if (s.contested) {
    s.status = 'contested';
  } else if (inside) {
    s.cap = Math.min(1, s.cap + dt / cfg.captureTime);
    s.status = s.owner === 'us' ? 'held' : 'capturing';
  } else if (foes > 0) {
    const rate = Math.min(2.4, 1 + (foes - 1) * 0.35) / cfg.enemyCaptureTime;
    s.cap = Math.max(-1, s.cap - dt * rate);
    s.status = s.owner === 'them' ? 'lost' : 'losing';
  } else {
    // ninguém: volta para o estado do dono
    const rest = s.owner === 'us' ? 1 : s.owner === 'them' ? -1 : 0;
    const k = dt * 0.12;
    s.cap = s.cap < rest ? Math.min(rest, s.cap + k) : Math.max(rest, s.cap - k);
    s.status = s.owner === 'us' ? 'held' : s.owner === 'them' ? 'lost' : 'neutral';
  }
  if (s.owner === 'us' && s.cap <= 0) s.owner = null;
  if (s.owner === 'them' && s.cap >= 0) s.owner = null;
  if (s.cap >= 1 && s.owner !== 'us') s.owner = 'us';
  if (s.cap <= -1 && s.owner !== 'them') s.owner = 'them';
  if (s.owner === 'us' && !s.contested) s.hold += dt;
  if (s.owner !== prevOwner) {
    if (s.owner === 'us') { ev.captured = true; s.captured++; }
    if (prevOwner === 'us') ev.lost = true;
    if (s.owner === 'them') ev.taken = true;
  }
  return ev;
}

/**
 * Resultado do HARDPOINT: 'win' (posse completa), 'loss' (hostis tomaram a
 * zona — depois de o jogador já ter tomado uma vez, ou de qualquer jeito se
 * ela nunca foi nossa e caiu) ou null.
 */
export function zoneResult(s, cfg = MODES.hardpoint) {
  if (s.hold >= cfg.holdGoal) return 'win';
  if (s.owner === 'them') return 'loss';
  return null;
}

/**
 * Centro da zona a partir dos dados do mapa: um ponto entre o nascimento
 * do jogador e o centro dos pontos de entrada inimigos (fração `t`), preso
 * aos limites jogáveis com margem. Se o mapa publicar zonas próprias
 * (`world.zones` / `world.hardpoints`), quem chama usa essas.
 * `spawn` = { position:[x,y,z] }, `enemySpawns` = [{ position }],
 * `bounds` = { min:{x,z}, max:{x,z} } (opcional).
 */
export function pickZone(spawn, enemySpawns = [], bounds = null, t = 0.42, margin = 6) {
  const p = spawn?.position || [0, 0, 0];
  let cx = p[0], cz = p[2];
  if (enemySpawns.length) {
    let ex = 0, ez = 0;
    for (const s of enemySpawns) { ex += s.position[0]; ez += s.position[2]; }
    ex /= enemySpawns.length;
    ez /= enemySpawns.length;
    cx = p[0] + (ex - p[0]) * t;
    cz = p[2] + (ez - p[2]) * t;
  }
  if (bounds) {
    const mx = Math.min(margin, (bounds.max.x - bounds.min.x) / 2), mz = Math.min(margin, (bounds.max.z - bounds.min.z) / 2);
    cx = Math.min(bounds.max.x - mx, Math.max(bounds.min.x + mx, cx));
    cz = Math.min(bounds.max.z - mz, Math.max(bounds.min.z + mz, cz));
  }
  return { x: cx, y: p[1] || 0, z: cz };
}

/** Candidatos em espiral em volta de (x, z) — quem chama testa colisão/navegação. */
export function spiral(x, z, step = 1.5, rings = 6) {
  const out = [{ x, z }];
  for (let r = 1; r <= rings; r++) {
    const n = 8 * r;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: x + Math.cos(a) * r * step, z: z + Math.sin(a) * r * step });
    }
  }
  return out;
}

/** Dentro da zona (círculo no plano XZ, com tolerância vertical). */
export const inZone = (zone, x, y, z) => Math.hypot(x - zone.x, z - zone.z) <= zone.radius && Math.abs(y - (zone.y || 0)) < 2.5;

/** SURVIVAL: a onda n é a do chefe? */
export const isBossWave = (m, n) => !!m.boss && n === m.waves.length;
