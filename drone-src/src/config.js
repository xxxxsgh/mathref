/**
 * DRONEFARER — todas as constantes de tuning do jogo.
 *
 * Regra da casa: nenhum número mágico solto no código. Se um valor mexe em como
 * o jogo *sente*, ele mora aqui. Os módulos importam `CONFIG` e leem em tempo
 * de execução, então dá pra mexer ao vivo pelo painel de tuning (tecla G).
 *
 * Unidades: metros, segundos, radianos (os ângulos em graus ficam explícitos no
 * nome, como `maxAngleDeg`, e são convertidos na leitura).
 */

const DEG = Math.PI / 180;

export const CONFIG = {
  // ══════════════════════════════════════════════════════════════════════
  // DRONE — modelo de voo arcade. É o coração do jogo; mexa com cuidado.
  // ══════════════════════════════════════════════════════════════════════
  DRONE: {
    /** Aceleração da gravidade. Negativa em Y. */
    gravity: 9.81,

    /**
     * Empuxo máximo em múltiplos do peso (thrust-to-weight).
     * 3.0 significa que a 100% de acelerador o drone sobe com 2g líquidos e
     * paira com ~33% de acelerador — a folga que dá autoridade em ACRO.
     */
    thrustToWeight: 3.0,

    /**
     * Saturação de motor: acima deste ângulo de inclinação a componente
     * vertical do empuxo já não segura o peso e o drone AFUNDA enquanto
     * acelera. É a mecânica central — sai de graça da física, mas este fator
     * extra exagera a perda pra ficar legível sem HUD.
     */
    saturationStartDeg: 45,
    saturationLoss: 0.22,

    /**
     * Arrasto quadrático: a = -k·|v|·v. Horizontal e vertical são separados
     * porque as hélices freiam muito mais na descida do que na horizontal.
     * Com k=0.018 a velocidade terminal em mergulho inclinado fica ~110 km/h.
     */
    dragHorizontal: 0.018,
    dragVertical: 0.05,

    /** Taxas máximas de rotação em ACRO (graus/s), por eixo. */
    rates: { pitch: 340, roll: 400, yaw: 200 },

    /**
     * Inércia de rotação. `responseHalfLife` é quão rápido o drone ATINGE a
     * taxa pedida; `dampingHalfLife` é quanto ele demora a PARAR quando você
     * solta. O segundo ser maior que o primeiro é o que faz o ACRO parecer
     * pesado em vez de travado no eixo.
     */
    responseHalfLife: 0.045,
    dampingHalfLife: 0.11,

    /** ANGLE: limite de inclinação e força do auto-nivelamento. */
    maxAngleDeg: 38,
    levelGain: 5.2,
    /** Teto de taxa que o auto-nivelamento pode pedir (graus/s). */
    levelMaxRate: 320,

    /** Curva dos sticks. 0 = linear, 1 = cúbica pura. */
    expo: { pitch: 0.42, roll: 0.42, yaw: 0.35, throttle: 0.15 },
    deadzone: 0.06,

    throttle: {
      /** Quanto o acelerador de teclado sobe por segundo com a tecla presa. */
      keyboardRate: 1.8,
    },

    /** Massa base (kg). Carga e upgrades somam em cima disso (Fases 4 e 5). */
    massKg: 0.65,

    /** Raio de colisão do drone (m). Uma esfera basta pra um quadricóptero. */
    radius: 0.34,

    /** Acima desta velocidade de impacto, bate = crash. Abaixo, só raspa. */
    crashSpeed: 7.5,
    /** Fração da velocidade preservada ao raspar sem quebrar. */
    scrapeRestitution: 0.32,

    /** Altura do respawn acima do último ponto seguro. */
    respawnHeight: 2.0,
    /** Tempo parado no ar depois do crash antes de devolver o controle. */
    crashFreezeSeconds: 1.1,

    /** Modo inicial de voo. */
    startMode: 'ANGLE',
  },

  // ══════════════════════════════════════════════════════════════════════
  // CAMERA — feed FPV. O que separa "drone" de "nave voando baixo".
  // ══════════════════════════════════════════════════════════════════════
  CAMERA: {
    /** Inclinação da câmera pra cima, como o ângulo físico num FPV real. */
    tiltDeg: 25,
    tiltMinDeg: 15,
    tiltMaxDeg: 45,

    /** Posição da lente relativa ao centro do drone (m). */
    offset: { x: 0, y: 0.045, z: 0.09 },

    /** FOV sobe com a velocidade e volta com easing — a sensação de rush. */
    fovBase: 100,
    fovMax: 120,
    /** Velocidade (m/s) em que o FOV chega no máximo. */
    fovSpeedRef: 34,
    fovHalfLife: 0.28,

    near: 0.06,
    far: 2200,

    /** Pós-processamento do feed. Cada um é desligável por tier ou no menu. */
    barrel: 0.16, // distorção de barril da lente grande-angular
    chromatic: 0.0022, // aberração cromática nas bordas
    vignette: 0.32,
    noise: 0.05, // ruído de sinal analógico

    /** Screen shake: amplitude inicial e meia-vida do decaimento. */
    shakeCrash: 1.0,
    shakeHalfLife: 0.22,
    /** Trepidação contínua proporcional ao acelerador (vibração do motor). */
    shakeFromThrottle: 0.055,

    /** Câmera de 3ª pessoa (debug/screenshot). */
    thirdPerson: { distance: 3.2, height: 1.0, halfLife: 0.12 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // WORLD — terreno, chunks e cenário
  // ══════════════════════════════════════════════════════════════════════
  WORLD: {
    seed: 20260811,

    /**
     * Lado do chunk em metros e quantidade de quads por lado.
     * 128/32 dá 4 m por quad: relevo legível a 100 km/h sem virar 121 draw
     * calls só de chão.
     */
    chunkSize: 128,
    chunkSegments: 32,

    /** Relevo base: fBm de ruído gradiente. */
    terrain: {
      amplitude: 26,
      frequency: 1 / 420,
      octaves: 4,
      lacunarity: 2.03,
      gain: 0.46,
      /** Y do nível do mar; abaixo disso vira água na zona da costa. */
      seaLevel: -6,
    },

    /** Altura máxima de voo antes do drone perder empuxo (ar rarefeito). */
    ceiling: 320,

    /** Cores do chão, misturadas por altura e inclinação. */
    palette: {
      grass: 0x6d8862,
      sand: 0xab9a77,
      rock: 0x8d8b85,
      water: 0x18323f,
    },

    /** Densidade de props por chunk (multiplicada pelo tier de qualidade). */
    propDensity: 1.0,

    /** Poeira perto do solo: vira streak com a velocidade. */
    dust: { count: 900, radius: 26, maxHeight: 14, streakScale: 0.055 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // RACE — circuitos, gates e cronometragem
  // ══════════════════════════════════════════════════════════════════════
  RACE: {
    /** Raio interno do gate (m). O drone passa por dentro. */
    gateRadius: 3.6,
    gateTubeRadius: 0.18,

    /** Bônus por passar rápido e centrado. */
    perfectRadius: 1.2, // dentro disso conta como centro
    comboWindow: 4.0, // segundos pra encadear gates e manter o combo
    comboMax: 8,

    /**
     * Raspar o aro não mata e não tira tempo do cronômetro — o roadmap pede
     * penalidade VISUAL. O custo real é perder o combo acumulado, que é o que
     * transforma "passei raspando" numa decisão em vez de um detalhe.
     */
    scrapeComboLoss: 3,

    /** Amostragem do ghost (Hz). Mais que isso é desperdício de localStorage. */
    ghostHz: 20,
    ghostOpacity: 0.38,

    /** Multiplicadores de tempo pras medalhas, sobre o tempo-alvo do circuito. */
    medals: { gold: 1.0, silver: 1.12, bronze: 1.3 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // BATTERY — recurso que força linha eficiente em vez de acelerador cravado
  // ══════════════════════════════════════════════════════════════════════
  BATTERY: {
    capacity: 100,
    /** Consumo parado no ar (%/s) e consumo extra proporcional ao acelerador. */
    idleDrain: 0.28,
    throttleDrain: 2.1,
    /** Expoente do consumo: >1 castiga acelerador cravado. */
    throttleExponent: 1.6,
    /** Consumo extra por kg de carga. */
    payloadDrainPerKg: 0.9,

    warnPercent: 35,
    criticalPercent: 15,
    /** Abaixo disso o empuxo máximo cai — o drone fica pesado antes de morrer. */
    brownoutPercent: 6,
    brownoutThrustLoss: 0.35,
  },

  // ══════════════════════════════════════════════════════════════════════
  // RADIO — alcance do link. Mecânica de tensão, não parede invisível.
  // ══════════════════════════════════════════════════════════════════════
  RADIO: {
    /** Distância (m) em que o sinal chega a zero. */
    range: 1500,
    /** Fração do alcance em que a degradação começa (0.65 = 65%). */
    fadeStart: 0.65,
    warnSignal: 0.6,
    lostSignal: 0.22,
    /** Ponto de recarga: raio de atuação e velocidade. */
    padRadius: 14,
    rechargePerSecond: 26,
  },

  // ══════════════════════════════════════════════════════════════════════
  // WIND — vento base + rajadas. Desligável.
  // ══════════════════════════════════════════════════════════════════════
  WIND: {
    enabled: true,
    /** Vento constante (m/s) e direção em graus (0 = +Z). */
    baseSpeed: 1.8,
    directionDeg: 35,
    /** Rajadas: amplitude e frequência do ruído temporal. */
    gustAmplitude: 3.4,
    gustFrequency: 0.16,
    /** Quanto o vento empurra o drone: 1.0 = arrasta junto com o ar. */
    influence: 0.85,
    /** Turbulência perto de estruturas e penhascos (Fase 6). */
    turbulenceRadius: 22,
    turbulenceStrength: 2.6,
  },

  // ══════════════════════════════════════════════════════════════════════
  // QUALITY — 4 tiers. Detectado por GPU e resolução, override em ?q=
  // ══════════════════════════════════════════════════════════════════════
  QUALITY: {
    /** Alvo de frame time (ms) pra qualidade adaptativa. */
    targetFrameMs: 17.5,
    /** Só degrada depois de N segundos ruins seguidos — evita oscilar. */
    adaptWindowSeconds: 4,
    adaptEnabled: true,

    tiers: {
      alto: {
        label: 'Alto',
        pixelRatio: 1.5,
        shadows: true,
        shadowMapSize: 2048,
        post: true,
        postEffects: { barrel: true, chromatic: true, vignette: true, noise: true },
        viewChunks: 4,
        drawDistance: 1600,
        propDensity: 1.0,
        dustCount: 900,
        anisotropy: 4,
      },
      medio: {
        label: 'Médio',
        pixelRatio: 1.25,
        shadows: true,
        shadowMapSize: 1024,
        post: true,
        postEffects: { barrel: true, chromatic: false, vignette: true, noise: true },
        viewChunks: 3,
        drawDistance: 1200,
        propDensity: 0.75,
        dustCount: 600,
        anisotropy: 2,
      },
      baixo: {
        label: 'Baixo',
        pixelRatio: 1.0,
        shadows: false,
        shadowMapSize: 512,
        post: true,
        postEffects: { barrel: true, chromatic: false, vignette: true, noise: false },
        viewChunks: 3,
        drawDistance: 900,
        propDensity: 0.5,
        dustCount: 320,
        anisotropy: 1,
      },
      minimo: {
        label: 'Mínimo',
        pixelRatio: 0.8,
        shadows: false,
        shadowMapSize: 512,
        post: false,
        postEffects: { barrel: false, chromatic: false, vignette: false, noise: false },
        viewChunks: 2,
        drawDistance: 620,
        propDensity: 0.28,
        dustCount: 140,
        anisotropy: 1,
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // AUDIO — o motor é metade da sensação de pilotar. Fase 7.
  // ══════════════════════════════════════════════════════════════════════
  AUDIO: {
    master: 0.8,
    engine: 0.5,
    wind: 0.4,
    sfx: 0.7,
    music: 0.35,

    /** Motor: faixa de frequência fundamental mapeada por RPM. */
    engineHzIdle: 62,
    engineHzMax: 240,
    /** Quantas harmônicas o sintetizador do motor empilha. */
    engineHarmonics: 4,
    /** Suavização do RPM — motor não muda de tom instantaneamente. */
    rpmHalfLife: 0.09,

    /** Doppler: fator aplicado à velocidade relativa. */
    dopplerFactor: 0.45,
    /** Vento sintetizado por ruído filtrado, ligado à velocidade DO AR. */
    windSpeedRef: 30,
  },
};

/** Atalhos de conversão pra não espalhar `* Math.PI / 180` pelo código. */
export const asRadians = (deg) => deg * DEG;

/** Empuxo máximo em m/s², derivado do TWR. */
export const maxThrustAccel = () => CONFIG.DRONE.gravity * CONFIG.DRONE.thrustToWeight;

export default CONFIG;
