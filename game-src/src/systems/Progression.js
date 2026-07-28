import { CONFIG } from '../config.js';

/**
 * Progressão: recursos, upgrades da nave e persistência.
 *
 * ═══ COMO OS UPGRADES SE APLICAM ═══
 *
 * O `FlightModel` e o `Combat` leem constantes de `CONFIG`. Em vez de
 * espalhar `if (upgrade.motor >= 2)` por todos os sistemas, os upgrades
 * produzem MULTIPLICADORES que são aplicados uma vez, num lugar só.
 *
 * Isso mantém o config como fonte única de verdade para o balanceamento base
 * e torna trivial ver, num lugar, exatamente o que cada nível muda.
 *
 * ═══ SAVE ═══
 *
 * `localStorage`, sem backend.
 *
 * ⚠ A primeira versão descartava saves de versão diferente, com um comentário
 * dizendo que migração "só se paga quando há jogadores reais". O raciocínio
 * está invertido: quando existem jogadores reais, já é tarde. O descarte é
 * SILENCIOSO — a pessoa abre o jogo depois de um deploy e simplesmente não
 * tem mais nada, sem erro, sem aviso, sem como recuperar. E o gatilho não é
 * uma decisão consciente: é qualquer commit futuro que mude o formato.
 *
 * Agora há uma cadeia de migrações. Cada versão sabe transformar o formato
 * anterior no seu, e `migrate` aplica quantas forem necessárias em sequência.
 * Antes de qualquer transformação o save original vai para uma chave de
 * backup — se uma migração tiver bug, os dados ainda existem.
 *
 * Duas rotas de escape, ambas preservando o original:
 *   • versão desconhecida (sem migração cadastrada) → começa do zero
 *   • versão MAIOR que a atual → começa do zero. Acontece de verdade: o
 *     service worker pode servir um build antigo depois de um deploy, e ler
 *     um save do futuro com código velho corrompe o que ainda está bom.
 */

const SAVE_KEY = 'starfarer:save:v1';
const BACKUP_KEY = 'starfarer:save:backup';
const SAVE_VERSION = 3;

/**
 * Transformações de formato. A chave é a versão DE ONDE se sai.
 *
 * Cada função recebe o objeto salvo e devolve o formato da versão seguinte.
 * Elas não podem lançar exceção nem depender de nada fora do próprio objeto —
 * rodam antes de o jogo existir.
 */
const MIGRATIONS = {
  // v1 → v2: `stats.bestWave` passou a existir com o escalonamento de
  // dificuldade. Saves antigos não têm recorde, então começam em zero.
  1: (d) => ({
    ...d,
    version: 2,
    stats: { ...(d.stats ?? {}), bestWave: 0 },
  }),
  // v2 → v3: recordes das corridas de superfície, uma entrada por planeta.
  2: (d) => ({
    ...d,
    version: 3,
    raceRecords: {},
  }),
};

/**
 * @param {object} data save cru vindo do localStorage
 * @returns {object|null} save no formato atual, ou null se não der pra migrar
 */
function migrate(data) {
  let v = Number(data?.version);
  if (!Number.isFinite(v)) return null;
  if (v > SAVE_VERSION) return null;          // save do futuro
  if (v === SAVE_VERSION) return data;

  // Só copia o backup quando há transformação de fato a fazer.
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
  } catch { /* sem backup é ruim, mas não impede a migração */ }

  let out = data;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;                   // buraco na cadeia
    out = step(out);
    const next = Number(out?.version);
    // Uma migração que não avança a versão daria loop infinito. Preferimos
    // perder o save (que está em backup) a travar o carregamento do jogo.
    if (!Number.isFinite(next) || next <= v) return null;
    v = next;
  }
  return out;
}

/** Definição dos upgrades. Cada nível custa mais e dá menos: a curva impede
 *  que maximizar uma coisa só seja sempre a jogada certa. */
export const UPGRADES = {
  engine: {
    name: 'Motor',
    description: 'Velocidade máxima e aceleração',
    levels: [
      { cost: 0,  speed: 1.00, accel: 1.00 },
      { cost: 6,  speed: 1.12, accel: 1.15 },
      { cost: 14, speed: 1.24, accel: 1.28 },
      { cost: 26, speed: 1.34, accel: 1.40 },
    ],
  },
  shield: {
    name: 'Escudo',
    description: 'Capacidade e velocidade de recarga',
    levels: [
      { cost: 0,  capacity: 1.00, regen: 1.00 },
      { cost: 5,  capacity: 1.30, regen: 1.20 },
      { cost: 12, capacity: 1.60, regen: 1.45 },
      { cost: 24, capacity: 2.00, regen: 1.75 },
    ],
  },
  weapons: {
    name: 'Canhões',
    description: 'Dano e tolerância a calor',
    levels: [
      { cost: 0,  damage: 1.00, heat: 1.00 },
      { cost: 7,  damage: 1.25, heat: 0.85 },
      { cost: 16, damage: 1.55, heat: 0.72 },
      { cost: 30, damage: 1.95, heat: 0.60 },
    ],
  },
  hull: {
    name: 'Casco',
    description: 'Integridade estrutural',
    levels: [
      { cost: 0,  integrity: 1.00 },
      { cost: 6,  integrity: 1.25 },
      { cost: 15, integrity: 1.55 },
      { cost: 28, integrity: 1.95 },
    ],
  },
  cargo: {
    name: 'Carga',
    description: 'Capacidade de minério transportado',
    levels: [
      { cost: 0,  capacity: 40 },
      { cost: 4,  capacity: 80 },
      { cost: 10, capacity: 150 },
      { cost: 20, capacity: 260 },
    ],
  },
};

export class Progression {
  constructor() {
    /** Níveis atuais (índice em `levels`). */
    this.levels = { engine: 0, shield: 0, weapons: 0, hull: 0, cargo: 0 };
    /** Minério a bordo, ainda não convertido. Perdido se a nave for destruída. */
    this.cargo = 0;
    /** Créditos: minério entregue numa estação. Não se perde. */
    this.credits = 0;

    this.stats = { kills: 0, deaths: 0, asteroidsMined: 0, planetsVisited: [],
                   stationsDocked: 0, bestWave: 0 };
    /** Melhor tempo de corrida por planeta, em segundos. */
    this.raceRecords = {};
    this.load();
  }

  // ── Multiplicadores derivados ────────────────────────────
  get engineMul() { return UPGRADES.engine.levels[this.levels.engine]; }
  get shieldMul() { return UPGRADES.shield.levels[this.levels.shield]; }
  get weaponMul() { return UPGRADES.weapons.levels[this.levels.weapons]; }
  get hullMul() { return UPGRADES.hull.levels[this.levels.hull]; }
  get cargoCapacity() { return UPGRADES.cargo.levels[this.levels.cargo].capacity; }

  /** Custo do próximo nível, ou `null` se já estiver no máximo. */
  nextCost(key) {
    const def = UPGRADES[key];
    const next = this.levels[key] + 1;
    return next < def.levels.length ? def.levels[next].cost : null;
  }

  canAfford(key) {
    const cost = this.nextCost(key);
    return cost !== null && this.credits >= cost;
  }

  /** @returns {boolean} se a compra aconteceu */
  buy(key) {
    if (!this.canAfford(key)) return false;
    this.credits -= this.nextCost(key);
    this.levels[key]++;
    this.save();
    return true;
  }

  /** Recolhe minério. Devolve quanto foi de fato recolhido — a carga tem
   *  teto, e atingi-lo é o que dá sentido a voltar a uma estação. */
  addCargo(amount) {
    const room = this.cargoCapacity - this.cargo;
    const taken = Math.max(0, Math.min(room, amount));
    this.cargo += taken;
    this.stats.asteroidsMined++;
    return taken;
  }

  get cargoFull() { return this.cargo >= this.cargoCapacity; }
  get cargoPct() { return this.cargo / this.cargoCapacity; }

  /** Atracar numa estação converte carga em créditos e salva. */
  dock() {
    const gained = Math.floor(this.cargo * CONFIG.progression.creditsPerOre);
    this.credits += gained;
    this.cargo = 0;
    this.stats.stationsDocked++;
    this.save();
    return gained;
  }

  /** Morrer custa a carga não entregue. É o que transforma "voltar pra
   *  estação" numa decisão de risco em vez de uma formalidade. */
  onDeath() {
    const lost = this.cargo;
    this.cargo = 0;
    this.stats.deaths++;
    this.save();
    return lost;
  }

  onKill() { this.stats.kills++; }

  /** Melhor tempo de corrida neste planeta, ou null se nunca foi corrido. */
  raceRecord(planetName) {
    const t = this.raceRecords[planetName];
    return typeof t === 'number' ? t : null;
  }

  /** Grava um tempo de corrida se ele for melhor que o anterior.
   *  @returns {boolean} se virou recorde */
  recordRace(planetName, segundos) {
    const anterior = this.raceRecord(planetName);
    if (anterior !== null && segundos >= anterior) return false;
    this.raceRecords[planetName] = segundos;
    this.save();
    return true;
  }

  /** Recorde de onda alcançada. Salva só quando o recorde de fato sobe —
   *  gravar no localStorage a cada onda seria escrita à toa. */
  recordWave(wave) {
    if (wave <= this.stats.bestWave) return false;
    this.stats.bestWave = wave;
    this.save();
    return true;
  }

  visitPlanet(name) {
    if (this.stats.planetsVisited.includes(name)) return false;
    this.stats.planetsVisited.push(name);
    this.save();
    return true;
  }

  // ── Persistência ───────────────────────────────────────
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: SAVE_VERSION,
        levels: this.levels,
        credits: this.credits,
        cargo: this.cargo,
        stats: this.stats,
        raceRecords: this.raceRecords,
      }));
    } catch (e) {
      // localStorage pode estar cheio, desabilitado, ou em modo privado do
      // Safari (que lança QuotaExceededError já na primeira escrita).
      // Perder o save é ruim; quebrar o jogo por causa disso é pior.
      console.warn('[save] não foi possível gravar:', e?.name ?? e);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = migrate(JSON.parse(raw));
      if (!data) {
        // O original já foi copiado para BACKUP_KEY dentro de `migrate` (ou
        // continua intacto em SAVE_KEY, se nem chegou a migrar). Avisar no
        // console é o mínimo: silêncio aqui foi exatamente o bug.
        console.warn('[save] formato não reconhecido — começando do zero. '
          + `Cópia do original em "${BACKUP_KEY}".`);
        try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* ignora */ }
        return;
      }
      // Mescla campo a campo em vez de substituir o objeto: assim um save
      // antigo sem uma chave nova não deixa `undefined` circulando pelo jogo.
      Object.assign(this.levels, data.levels ?? {});
      this.credits = Number(data.credits) || 0;
      this.cargo = Number(data.cargo) || 0;
      Object.assign(this.stats, data.stats ?? {});
      Object.assign(this.raceRecords, data.raceRecords ?? {});
      // Clampa níveis: um save adulterado não deve indexar fora do array.
      for (const k of Object.keys(this.levels)) {
        const max = UPGRADES[k].levels.length - 1;
        this.levels[k] = Math.max(0, Math.min(max, this.levels[k] | 0));
      }
    } catch (e) {
      console.warn('[save] arquivo inválido, começando do zero:', e?.name ?? e);
    }
  }

  reset() {
    this.levels = { engine: 0, shield: 0, weapons: 0, hull: 0, cargo: 0 };
    this.cargo = 0;
    this.credits = 0;
    this.stats = { kills: 0, deaths: 0, asteroidsMined: 0, planetsVisited: [],
                   stationsDocked: 0, bestWave: 0 };
    this.raceRecords = {};
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignora */ }
  }
}
