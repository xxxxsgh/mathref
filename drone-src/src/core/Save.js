/**
 * Persistência em localStorage, com versão de schema e migração.
 *
 * Tudo aqui é defensivo por obrigação: no Safari em navegação privada o
 * localStorage existe mas EXPLODE ao escrever, e no iOS o storage do site pode
 * ser evictado a qualquer momento. Um jogo que quebra a tela inteira porque o
 * recorde não pôde ser salvo é pior do que um jogo sem recorde — então toda
 * falha aqui vira aviso no console e o jogo segue com os dados em memória.
 */

const KEY = 'dronefarer.save.v1';
const SCHEMA_VERSION = 3;

/** Estado inicial. Todo campo novo precisa nascer aqui E numa migração. */
function emptySave() {
  return {
    version: SCHEMA_VERSION,
    circuits: {}, // id → { bestTime, bestSplits, medal, runs }
    ghosts: {}, // id → amostras comprimidas
    options: {
      quality: null, // null = detectar sozinho
      cameraTilt: null,
      expoScale: 1,
      invertPitch: false,
      invertRoll: false,
      fpvEffects: true,
      volume: { master: 0.8, engine: 0.5, wind: 0.4, sfx: 0.7, music: 0.35 },
    },
    progress: {
      credits: 0,
      chassis: 'equilibrado',
      unlockedChassis: ['equilibrado'],
      upgrades: {}, // linha → tier COMPRADO (permanente)
      equipped: {}, // linha → tier INSTALADO agora (≤ comprado)
      builds: {}, // nome → preset
      poisFound: [],
      missionsDone: [],
      noRisk: false,
      tutorialDone: false,
    },
  };
}

/**
 * Migrações incrementais: cada uma leva do schema anterior pro seguinte.
 * Escritas assim, adicionar a versão 4 no futuro é acrescentar uma função — e
 * quem estiver na 1 passa por todas até chegar lá, sem caso especial.
 */
const MIGRATIONS = {
  // 1 → 2: as opções de volume viraram um objeto por canal (antes era um só).
  2: (data) => {
    const volume = typeof data.options?.volume === 'number' ? data.options.volume : 0.8;
    data.options = {
      ...emptySave().options,
      ...data.options,
      volume: { ...emptySave().options.volume, master: volume },
    };
    return data;
  },
  // 2 → 3: progressão (créditos, chassis, upgrades) entrou na Fase 5.
  3: (data) => {
    data.progress = { ...emptySave().progress, ...(data.progress || {}) };
    return data;
  },
};

export class Save {
  constructor() {
    this.data = this._read();
    this.available = this._probe();
    this._pending = null;
  }

  _probe() {
    try {
      const probe = '__dronefarer_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      console.warn('[save] localStorage indisponível; o progresso não será mantido.');
      return false;
    }
  }

  _read() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      return emptySave();
    }
    if (!raw) return emptySave();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // Save corrompido: melhor recomeçar do zero do que travar na abertura.
      console.warn('[save] dados ilegíveis; começando do zero.');
      return emptySave();
    }

    let version = Number(data.version) || 1;
    while (version < SCHEMA_VERSION) {
      version++;
      const migrate = MIGRATIONS[version];
      if (!migrate) break;
      try {
        data = migrate(data);
      } catch (err) {
        console.warn(`[save] migração ${version} falhou; começando do zero.`, err);
        return emptySave();
      }
    }
    data.version = SCHEMA_VERSION;

    // Preenche o que faltar sem sobrescrever o que veio salvo.
    return { ...emptySave(), ...data, options: { ...emptySave().options, ...data.options } };
  }

  /**
   * Grava agrupando as chamadas do mesmo frame. Salvar a cada gate cruzado
   * serializaria o ghost inteiro várias vezes por segundo.
   */
  write() {
    if (this._pending) return;
    this._pending = setTimeout(() => {
      this._pending = null;
      this.flush();
    }, 400);
  }

  flush() {
    if (!this.available) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch (err) {
      // Quota estourada: o ghost é de longe o maior item e o mais descartável.
      console.warn('[save] falha ao gravar; descartando ghosts pra liberar espaço.', err);
      this.data.ghosts = {};
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
        return true;
      } catch {
        this.available = false;
        return false;
      }
    }
  }

  circuit(id) {
    if (!this.data.circuits[id]) {
      this.data.circuits[id] = { bestTime: null, bestSplits: null, medal: null, runs: 0 };
    }
    return this.data.circuits[id];
  }

  get options() {
    return this.data.options;
  }

  get progress() {
    return this.data.progress;
  }

  reset() {
    this.data = emptySave();
    this.flush();
  }
}
