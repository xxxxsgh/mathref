// ═══════════════════════════════════════════════════════════════════════════
// QUADRA VIVA — todos os números de gameplay e física (adendo, seção K).
//
// Unidades: 1 unidade = 1 metro, tempo em segundos, ângulos em graus quando o
// nome termina em `Deg`. Eixos: x ao longo do comprimento (gols em x = ±20),
// z ao longo da largura (laterais em z = ±10), y para cima.
//
// Qualquer número que precisou fugir do realismo para o jogo ficar gostoso
// está marcado com "AJUSTE:" e listado em AJUSTES no fim do arquivo.
// ═══════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  // ── B. Loop de física ────────────────────────────────────────────────────
  sim: {
    dt: 1 / 120, // passo fixo
    maxStepsPerFrame: 5, // evita a "espiral da morte" em aparelho lento
  },

  // ── A. Quadra ────────────────────────────────────────────────────────────
  court: {
    length: 40,
    width: 20,
    goalWidth: 3, // vão livre entre as traves
    goalHeight: 2, // do piso até a face de baixo do travessão
    postDiameter: 0.08,
    goalDepth: 1.0, // fundo da rede
    areaRadius: 6, // semicírculos a partir das traves
    penaltySpot: 6,
    tenMeterSpot: 10,
    wallGap: 2.5, // da linha até a parede do ginásio
    subZoneX: 5, // zona de substituição: entre x = ±(subZoneX − 2.5) e ±subZoneX
  },

  // ── C. Bola ──────────────────────────────────────────────────────────────
  ball: {
    radius: 0.1,
    mass: 0.42,
    gravity: 9.81,
    // C2. desaceleração de rolamento (m/s²) por piso
    rollDecel: { madeira: 1.8, emborrachado: 2.2, rua: 2.6, poca: 6.0 },
    stopSpeed: 0.05,
    // C3. arrasto: a = −k·|v|·v  (k em 1/m)
    dragK: 0.015,
    // Magnus: a_lateral = magnusK · spin · |v|² (spin ∈ [−1, 1]).
    // Com a ∝ v² o desvio em 15 m não depende da força do chute:
    // ½·k·225 ≈ 1,07 m sem decaimento; com o decaimento fica ≤ ~1 m.
    magnusK: 0.0095,
    spinDecay: 0.6, // por segundo (exponencial)
    // vento (só quadra de rua): aceleração lateral leve
    windAccelMax: 0.35,
    // C4. quique
    restitution: 0.5, // 2 m → ~0,5 m
    bounceHorizLoss: 0.15,
    toRollingVy: 0.3, // abaixo disso vira RASTEIRA
    // C5. colisões
    postRestitution: 0.6,
    postJitterDeg: 3,
    netKeep: 0.1, // rede: velocidade cai 90%
    bodyKeep: 0.4, // corpo: perde 60%
    wallRestitution: 0.45,
    handBand: [0.85, 1.55], // altura (m) onde um toque pode ser mão
    handChance: 0.35, // nem todo toque na faixa do braço pega na mão
    // subpassos: a bola nunca anda mais que isso num subpasso (trave = 8 cm)
    maxSubstepTravel: 0.05,
  },

  // ── D. Jogador ───────────────────────────────────────────────────────────
  player: {
    height: 1.75,
    radius: 0.35,
    walk: 2.0,
    run: [5.5, 7.0], // pelo atributo Velocidade 1–99
    sprint: [7.0, 8.5],
    withBall: 0.85,
    withBallArtist: 0.9,
    accelTime: 0.6, // do parado à corrida
    brakeTime: 0.4,
    turnKeepDeg: 45,
    turnSlowDeg: 120,
    turnSlowLoss: 0.3,
    halfTurnKeep: 0.1, // meia-volta: para quase totalmente
    halfTurnTime: 0.28, // animação de girar o corpo
    turnRate: 12, // rad/s para alinhar o corpo dentro dos 45°
    slipperyBrake: 1.4, // piso escorregadio: frenagem 40% mais longa
    stamina: {
      sprintCost: 8,
      runCost: 1,
      recover: 4,
      benchRecover: 12, // AJUSTE: banco recupera 3× mais rápido que andar
      tiredBelow: 30,
      tiredSpeed: 0.85,
    },
    shoulder: { range: 0.85, minSpeed: 3, offBalance: 0.3, cooldown: 1.0 },
    pushFoulRelSpeed: 3.5,
    offBalanceSpeed: 0.55, // fração da velocidade mantida ao perder o equilíbrio
  },

  // ── E. Condução e drible ─────────────────────────────────────────────────
  dribble: {
    touchMin: 0.6,
    touchMax: 1.8,
    // AJUSTE: entre toques a bola desacelera com 12 m/s² (e não 1,8). Com o
    // atrito real o jogador levaria ~2 s para alcançar a bola de novo e a
    // condução ficaria arrastada. Toques curtos, macios, são isso na prática.
    touchDecel: 12,
    reach: 0.5, // distância do "pé" à bola para tocar
    footOffset: 0.42, // o pé fica à frente do centro do corpo
    touchCooldown: 0.12,
    loseDistance: 3.2, // longe disso o dono perde a posse
    trapGood: 0.5,
    trapBad: [1.5, 3.0],
    feintTime: 0.35,
    feintRadius: 3.0,
    feintDelayMax: 0.55, // atraso do marcador com Marcação 1
    solePullSpeed: 2.2,
    shieldSpeed: 0.55, // fração da velocidade ao proteger
    shieldTackleMult: 0.35, // chance de desarme cai ao proteger
  },

  // ── F. Passe ─────────────────────────────────────────────────────────────
  pass: {
    coneDeg: 40,
    minSpeed: 6,
    maxSpeed: 18,
    chargeTime: 0.6,
    tapTime: 0.12,
    arriveSpeed: 4.5, // velocidade "ideal" na chegada (assistido)
    assistBlend: 0.55,
    throughLead: 2.5, // espaço extra à frente do companheiro
    lobFlight: [0.9, 1.6],
    errorBaseDeg: 7, // com Passe 1
    errorTired: 3,
    errorFirstTime: 2,
    errorBodyTurned: 4,
    errorMarked: 2.5,
    weakFootMult: 1.3,
    markedDist: 1.3,
  },

  // ── G. Chute ─────────────────────────────────────────────────────────────
  shot: {
    chargeTime: 0.8,
    overchargeMax: 0.8, // depois de 100%, mais 0,8 s até o pior "isolado"
    minSpeed: 12,
    maxSpeed: [25, 32], // pela Finalização
    placedSpeed: 0.72,
    chipSpeed: [8, 11.5],
    toeSpeed: 0.93, // bico: fração da máxima, sem carregar
    toeErrorMult: 2.0,
    errorBaseDeg: 6, // com Finalização 1
    errorOverDeg: 7,
    errorTiredDeg: 2.5,
    errorUnbalancedDeg: 3,
    errorPressureDeg: 2,
    errorCrowdDeg: 3, // × pressão da torcida × (1 − Frieza)
    weakFootMult: 1.3,
    placedErrorMult: 0.7,
    aimZ: 1.05, // até onde o joystick leva a mira (a trave interna fica em 1,5)
  },

  // ── H. Defesa e faltas ───────────────────────────────────────────────────
  defense: {
    tackleReach: 1.0,
    tackleConeDeg: 70,
    tackleTime: 0.35,
    tackleRecover: 0.25,
    legRadius: 0.22,
    slideReach: 2.5,
    slideSpeed: 6.5,
    slideTime: 0.42,
    slideGround: 1.0,
    advantageTime: 2.0,
    severity: { foul: 0.2, yellow: 1.15, red: 1.65 },
    accumulatedLimit: 5, // a partir da 6ª: tiro livre de 10 m sem barreira
    redCardMinutes: 2,
  },

  // ── I. Goleiro ───────────────────────────────────────────────────────────
  keeper: {
    reaction: [0.35, 0.15], // Reflexo 1 → 99
    diveReach: 2.0,
    readError: [0.18, 0.4], // desvio (m) na leitura do ponto: base + (1 − Reflexo)
    diveTime: 0.42,
    diveGround: 0.9,
    standReach: 0.75,
    catchSpeed: [10, 17], // segura abaixo disso (Reflexo 1 → 99)
    holdLimit: 4,
    throwShort: 9,
    throwLong: 15,
    advanceMax: 2.8,
  },

  // ── J. Controles ─────────────────────────────────────────────────────────
  controls: {
    buffer: 0.15,
    holdForShield: 0.22,
    autoSwitchMargin: 2.0,
    vibrate: { shot: 15, post: 45, goal: [60, 40, 120] },
  },

  // ── Regras e partida ─────────────────────────────────────────────────────
  match: {
    halfMinutes: 3, // cronometrado: o relógio para com a bola morta
    restartLimit: 4,
    restartDistance: 5,
    deadBallPause: 0.9,
    goalPause: 2.6,
    aiRestartDelay: [0.7, 1.5],
  },
};

// Pisos e a umidade que torna o piso escorregadio no 2º tempo.
export const VENUES = {
  ginasio: { name: 'Ginásio Municipal', floor: 'madeira', wind: false, puddles: 0, sweat2nd: true, crowd: 1.0 },
  coberta: { name: 'Quadra Coberta', floor: 'emborrachado', wind: false, puddles: 0, sweat2nd: false, crowd: 0.7 },
  rua: { name: 'Quadra de Rua', floor: 'rua', wind: true, puddles: 3, sweat2nd: false, crowd: 0.45 },
};

// Mudanças conscientes em relação ao número "real" (seção K: anotar).
export const AJUSTES = [
  'dribble.touchDecel = 12 m/s² entre toques de condução (real seria ~1,8): condução fluida',
  'player.stamina.benchRecover = 12/s no banco: incentiva substituir',
  'ball.handChance = 35% dos toques na faixa do braço contam como mão: evita falta a todo bloqueio',
  'match.halfMinutes = 3 min cronometrados por tempo (real: 20): partida de celular',
];
