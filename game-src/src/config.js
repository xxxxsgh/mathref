/**
 * config.js — TODAS as constantes de gameplay num lugar só.
 *
 * Regra do projeto: nenhum número mágico de gameplay pode viver dentro de um
 * sistema. Se você precisa caçar um valor pra ajustar o feel, ele está errado
 * de lugar. Tudo aqui é editável em runtime pelo painel lil-gui (tecla G).
 *
 * Unidades:
 *   distância = "unidades de mundo" (u). 1u ≈ 1 metro na escala da nave.
 *   ângulo    = radianos, sempre.
 *   tempo     = segundos.
 *   "lambda"  = taxa de suavização exponencial (ver MathUtils.damp).
 *               Intuição: quanto MAIOR, mais rápido/mais grudado.
 *               O valor é ~ "quantos e-folds por segundo".
 */

import { MathUtils as TM } from 'three';

const DEG = TM.degToRad;

export const CONFIG = {
  // ───────────────────────────────────────────────────────────────────────
  // MUNDO
  // ───────────────────────────────────────────────────────────────────────
  world: {
    seed: 'starfarer-01',
    // Near/far da câmera. Far grande demais destrói a precisão do depth buffer
    // (z-fighting). 100k com near 0.5 já é agressivo; nas fases planetárias
    // vamos precisar de logarithmicDepthBuffer ou renderização em camadas.
    // Faixa PRÓXIMA: nave, inimigos, projéteis, asteroides, partículas —
    // e planetas/estações quando estão perto o bastante.
    // `near: 1.0` e não 0.5: a câmera fica 12 unidades atrás da nave, então
    // não há nada a ganhar com um plano mais próximo, e dobrar o `near`
    // dobra a precisão do depth buffer em toda a faixa.
    near: 1.0,
    nearFar: 32000,
    // Faixa DISTANTE: estrela, planetas e estações longe.
    farNear: 16000,
    far: 400000,
    // Um corpo só pode trocar de faixa quando cabe INTEIRO na faixa de
    // destino, senão ele seria recortado por um dos planos durante a
    // transição. Como as duas condições usam o raio do corpo, elas também
    // funcionam como histerese e evitam alternância a cada frame.
    depthSwitchToNear: 28000,   // dist + raio abaixo disto → faixa próxima
    depthSwitchToFar: 22000,    // dist - raio acima disto → faixa distante
    fov: 68,
    // Direção de onde vem a luz da estrela do sistema (normalizada no uso).
    // O skybox desenha o disco solar exatamente nessa direção, então mudar
    // aqui move a luz E o sol visível juntos.
    sunDirection: [0.45, 0.28, -0.85],
    sunColor: 0xfff0d8,
    sunIntensity: 3.1,
    ambientColor: 0x2a3a6b,
    ambientIntensity: 0.55,
  },

  // ───────────────────────────────────────────────────────────────────────
  // MODELO DE VOO
  // ───────────────────────────────────────────────────────────────────────
  // Filosofia: "arcade com peso". A nave NÃO é um corpo rígido newtoniano.
  // A rotação é comandada por velocidade angular alvo (não por torque), e a
  // velocidade linear é puxada pra uma velocidade alvo. O "peso" vem de dois
  // lugares: (1) o tempo que a velocidade angular leva pra alcançar o alvo,
  // (2) a deriva lateral que sobra quando você vira rápido.
  flight: {
    // Velocidade angular MÁXIMA em cada eixo local (rad/s).
    // pitch = nariz sobe/desce, yaw = nariz esquerda/direita, roll = giro.
    maxPitchRate: DEG(122),
    maxYawRate: DEG(96),
    maxRollRate: DEG(210),

    // Quão rápido a velocidade angular alcança o alvo. Este é O parâmetro do
    // feel de curva. Alto (>14) = responsivo/nervoso tipo Star Fox.
    // Baixo (<5) = pesado/lento tipo cargueiro. Roll costuma querer ser mais
    // frouxo que pitch/yaw pra dar sensação de massa.
    pitchYawResponse: 12.5,
    rollResponse: 8.0,

    // Amortecimento quando você SOLTA o controle. Separado do de cima porque
    // "parar de virar" deve ser um pouco mais lento que "começar a virar" —
    // é isso que dá a sensação de inércia rotacional.
    angularDamping: 7.0,

    // ── Inclinação automática na curva (só visual) ──
    // A nave INCLINA para dentro da curva, como um caça faz. É puramente
    // cosmético: inclina a MALHA, não o referencial de voo. Fazer o contrário
    // (rolar o quaternion de verdade) giraria os eixos de controle debaixo do
    // jogador e o pitch passaria a apontar para um lado inesperado.
    //
    // Sem isso, virar no espaço parece deslizar de lado — a nave gira sobre o
    // eixo mas o corpo continua nivelado, e o cérebro não lê aquilo como uma
    // curva.
    autoBank: 0.62,          // radianos no yaw máximo
    autoBankPitch: 0.16,     // leve inclinação também no pitch
    autoBankLambda: 5.5,

    // ── Translação ──
    maxSpeed: 320,          // u/s no acelerador cheio, sem boost
    boostMultiplier: 1.9,   // multiplica a velocidade alvo E a aceleração
    minSpeed: 0,            // deixe >0 se quiser que a nave nunca pare

    // ── Boost como RECURSO ──
    // Antes o boost era infinito, e isso decidia todo combate sozinho: fugir
    // era gratuito, então nenhuma situação era perigosa. Bastava segurar Shift.
    //
    // Com um tanque, fugir passa a custar, e perseguir vira decisão — os dois
    // lados da mesma mudança. É a alteração mais barata do balanceamento com
    // maior efeito tático, e nenhum sistema novo precisa existir pra ela.
    //
    // 3,4 s de tanque contra 1,1/s de recarga dá um ciclo de ~3 s de espera
    // por 3,4 s de boost: o bastante pra romper contato uma vez, não o
    // bastante pra viver acelerado.
    boostFuel: 3.4,         // segundos de boost com o tanque cheio
    boostRecharge: 1.1,     // segundos de tanque recuperados por segundo
    // Piso pra reengatar depois de esvaziar. Sem ele o jogador fica batendo
    // boost a cada 0,1 s de recarga, o que é pior que não ter boost: vira
    // ruído no motor e na câmera sem nenhum ganho de velocidade.
    boostMinToStart: 0.8,
    boostRechargeDelay: 0.6, // segundos parado antes de o tanque voltar a subir

    // Quão rápido a velocidade real alcança a velocidade alvo (aceleração).
    // Assimétrico de propósito: acelerar é mais lento que desacelerar, o que
    // faz o boost "carregar" e o freio morder na hora.
    accelResponse: 1.5,
    decelResponse: 2.6,
    brakeResponse: 5.2,     // com Space segurado

    // ── Deriva lateral (o coração do "peso") ──
    // Quando você vira, a velocidade continua apontando pro lado antigo por um
    // instante. lateralDrag alto = nave "gruda" no trilho (arcade puro).
    // lateralDrag baixo = drift estilo nave espacial (mais escorregadio).
    // 3.0 é o meio-termo: você VÊ o drift, mas ele resolve rápido.
    lateralDrag: 3.0,
    brakeLateralDrag: 7.0,  // freio também mata o drift

    // Aceleração dos propulsores laterais/verticais (6DOF real).
    strafeAccel: 105,
    strafeDrag: 3.4,

    // ── Acelerador ──
    throttleRate: 1.35,     // quanto o acelerador varia por segundo na tecla
    throttleInitial: 0.55,

    // ── Barrel roll (manobra do Star Fox) ──
    barrelRoll: {
      duration: 0.52,       // segundos pra completar 360°
      cooldown: 0.28,
      lateralKick: 78,      // impulso lateral (u/s) — é o que faz desviar
      kickDecay: 3.2,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // CÂMERA DE PERSEGUIÇÃO
  // ───────────────────────────────────────────────────────────────────────
  // A câmera não gruda na nave. Ela persegue um "âncora" que interpola em
  // direção à orientação da nave — é isso que produz o balanço nas curvas.
  camera: {
    offset: [0, 2.35, 11.0],  // atrás e acima, no espaço LOCAL da âncora
    lookAhead: 26,            // olha à frente da nave, não pra ela

    // Suavização. positionLambda alto = câmera colada. Baixo = arrastada.
    positionLambda: 7.5,
    // Quão rápido a âncora acompanha a rotação da nave. MENOR que o de posição
    // de propósito: a câmera demora a alinhar, e é isso que faz a nave "sair
    // de quadro" numa curva forte — o efeito mais barato de sensação de força.
    rotationLambda: 5.2,

    // Fração do roll da nave que a câmera copia. 1.0 = enjoo garantido,
    // 0.0 = barrel roll não lê. 0.62 é o ponto onde a manobra é legível sem
    // embrulhar o estômago.
    rollFollow: 0.62,

    // A câmera recua e o FOV abre com velocidade. Isso é a "sensação de
    // velocidade" — o valor absoluto de u/s não significa nada pro jogador.
    fovBase: 68,
    fovSpeedGain: 15,     // graus adicionais na velocidade máxima
    fovBoostGain: 13,     // graus adicionais no boost
    fovLambda: 4.2,
    pullbackSpeedGain: 2.4,  // recuo (u) na velocidade máxima
    pullbackBoostGain: 4.0,

    // Deslocamento lateral proporcional à velocidade angular. Vende a curva.
    swayGain: 1.5,
    swayLambda: 6.0,

    // Tremor no boost. Sutil: acima de ~0.35 vira ruído visual.
    boostShake: 0.16,
  },

  // ───────────────────────────────────────────────────────────────────────
  // CONTROLES
  // ───────────────────────────────────────────────────────────────────────
  input: {
    keyboard: {
      // Mapa de teclas → ação. Use os códigos do KeyboardEvent.code
      // (independente de layout: 'KeyW' é a tecla física, funciona em ABNT2).
      pitchUp: ['KeyS'],
      pitchDown: ['KeyW'],
      yawLeft: ['KeyA'],
      yawRight: ['KeyD'],
      rollLeft: ['KeyQ'],
      rollRight: ['KeyE'],
      throttleUp: ['KeyR', 'ShiftLeft'],
      throttleDown: ['KeyF'],
      strafeLeft: ['ArrowLeft'],
      strafeRight: ['ArrowRight'],
      strafeUp: ['ArrowUp'],
      strafeDown: ['ArrowDown'],
      fire: ['ControlLeft', 'ControlRight', 'KeyX'],
      boost: ['ShiftLeft', 'ShiftRight'],
      brake: ['Space'],
      barrelRollLeft: ['KeyZ'],
      barrelRollRight: ['KeyC'],
      // Botão de aproximar / pousar / decolar — um só, contextual.
      land: ['KeyL'],
      toggleAssist: ['KeyH'],
      toggleDebug: ['F3', 'Backquote'],
      toggleTuner: ['KeyG'],
    },
    mouse: {
      enabled: true,
      // O mouse move um retículo virtual (não é câmera livre). O deslocamento
      // do retículo em relação ao centro vira comando de pitch/yaw — como um
      // manche. Funciona com e sem Pointer Lock, e o retículo já é o elemento
      // de HUD que a mira preditiva vai usar na Fase 2.
      usePointerLock: true,
      fireButton: 0,         // botão esquerdo
      sensitivity: 0.0026,   // só com pointer lock
      deadzone: 0.045,       // raio morto no centro, em unidades de tela
      gain: 1.0,             // multiplicador do comando resultante
      // Curva de resposta do retículo. >1 comprime o centro: movimentos
      // pequenos viram comandos pequenos, o que dá precisão para mirar, sem
      // perder o alcance máximo nas bordas. Linear (1.0) faz a nave parecer
      // nervosa perto do centro e é a queixa nº1 de mira com mouse.
      expo: 1.7,
      // Recentragem lenta do retículo quando o mouse para. 0 = desligado.
      recenter: 0.9,
      invertY: false,
    },
    gamepad: {
      enabled: true,
      deadzone: 0.14,        // deadzone RADIAL (no vetor), não por eixo
      expo: 1.6,             // curva de resposta: >1 dá precisão no centro
      // Índices do "standard gamepad mapping" do navegador.
      axisPitch: 1,
      axisYaw: 0,
      axisRollNeg: 4,        // botão L1
      axisRollPos: 5,        // botão R1
      buttonFire: 7,         // RT — gatilho principal
      buttonBoost: 0,        // A
      buttonBrake: 6,        // LT
      buttonBarrelLeft: 2,   // X
      buttonBarrelRight: 1,  // B
      buttonLand: 3,         // Y — aproximar / pousar / decolar
      buttonThrottleUp: 12,  // d-pad cima
      buttonThrottleDown: 13,
    },
    touch: {
      enabled: 'auto',       // 'auto' | true | false
      stickRadius: 82,       // px
      stickDeadzone: 0.10,
      expo: 1.5,
      // O manche touch é "flutuante": ele nasce onde o dedo encosta na metade
      // esquerda da tela, em vez de ficar fixo num canto. Isso é o que faz a
      // diferença entre jogável e bom no iPad.
      floatingStick: true,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // AMBIENTE VISUAL
  // ───────────────────────────────────────────────────────────────────────
  skybox: {
    // O skybox é gerado UMA vez num cube render target e vira scene.background.
    // Custo por frame depois disso: um blit. Rodar o shader de ruído todo frame
    // numa tela cheia mataria o iPad.
    size: { high: 1024, medium: 768, low: 512 },
    nebulaColorA: [0.94, 0.36, 0.20],   // laranja queimado
    nebulaColorB: [0.35, 0.22, 0.78],   // roxo
    nebulaColorC: [0.10, 0.62, 0.86],   // ciano
    nebulaIntensity: 1.45,
    nebulaScale: 1.35,
    // Plano da "via láctea": concentra nebulosa e estrelas numa faixa.
    // É o que dá a cara de capa de livro de ficção dos anos 70.
    bandNormal: [0.24, 0.94, 0.24],
    bandTightness: 1.9,
    starDensity: 165,
    starBrightness: 1.0,
    sunDiscSize: 0.9985,   // cos do ângulo — quanto mais perto de 1, menor
    sunGlowFalloff: 320,
  },

  dust: {
    // Poeira espacial: sem ela, voar no vazio não tem referência de movimento
    // e o jogo parece travado mesmo a 300 u/s. É o efeito com melhor
    // custo-benefício de sensação de velocidade que existe.
    count: { high: 2600, medium: 1600, low: 900 },
    boxSize: 260,      // cubo que acompanha a nave; partículas dão wrap nele
    size: 0.55,
    opacity: 0.5,
    speedFadeIn: 18,   // abaixo dessa velocidade a poeira some
    color: 0x9fc4ff,
  },

  ship: {
    engineGlowMin: 0.28,
    engineGlowMax: 1.35,
    trailLengthBase: 3.4,
    trailLengthBoost: 13.0,
    trailLambda: 8.0,
  },

  // ───────────────────────────────────────────────────────────────────────
  // PERFORMANCE / QUALIDADE ADAPTATIVA
  // ───────────────────────────────────────────────────────────────────────
  // Antecipado da Fase 6 de propósito: o iPad segura 60fps por poucos minutos
  // e depois cai por temperatura. Se cada sistema não nascer sabendo ler um
  // nível de qualidade, adicionar isso depois vira refactor geral.
  quality: {
    // Tiers do melhor pro pior. O jogo começa no tier sugerido pelo device e
    // desce sozinho se o frame time estourar.
    tiers: [
      { name: 'alto',  pixelRatio: 2.0, skybox: 'high',   dust: 'high',   shadows: true },
      { name: 'médio', pixelRatio: 1.5, skybox: 'medium', dust: 'medium', shadows: true },
      { name: 'baixo', pixelRatio: 1.0, skybox: 'medium', dust: 'low',    shadows: false },
      { name: 'mínimo',pixelRatio: 0.75,skybox: 'low',    dust: 'low',    shadows: false },
    ],
    startTierDesktop: 0,
    startTierMobile: 1,
    // Teto absoluto de devicePixelRatio. No iPad o DPR nativo é 2.0, o que
    // significa 4x o custo de fill rate. Este é o botão de performance mais
    // eficaz que existe no projeto.
    maxPixelRatio: 2.0,
    // Orçamento de frame time (ms). Acima disso por N amostras → cai de tier.
    targetFrameMsDesktop: 17.5,   // ~57fps
    targetFrameMsMobile: 22.0,    // ~45fps, com meta dura de 30
    sampleWindow: 90,             // frames por avaliação
    downgradeStreak: 2,           // avaliações ruins seguidas pra descer
    upgradeStreak: 8,             // avaliações folgadas seguidas pra subir
    upgradeHeadroom: 0.72,        // só sobe se estiver usando <72% do orçamento
    maxUpgrades: 2,               // evita oscilar pra sempre com throttling
  },

  // ───────────────────────────────────────────────────────────────────────
  // COMBATE
  // ───────────────────────────────────────────────────────────────────────
  weapons: {
    player: {
      // Projétil, não hitscan. Hitscan (acerta no instante do disparo) elimina
      // a habilidade de liderar o alvo, que é justamente a habilidade central
      // de um jogo de caça. Projétil visível também dá feedback de "errei por
      // pouco", que hitscan não dá.
      projectileSpeed: 900,
      fireInterval: 0.115,     // segundos entre tiros
      // ⚠ TTK. Dois canhões × 9 ÷ 0,115 s = 156 DPS contra 34+18 = 52 de HP:
      // o inimigo morria em 0,33 s, menos de um sexto de uma única passagem
      // de ataque (`attackRunMin` é 2,6 s). Toda a IA de flanco, ruptura e
      // evasão existia e nunca era vista. Com 7 de dano e o escudo inimigo em
      // 45, o TTK vai para ~1,7 s — tempo de o inimigo reagir e de o jogador
      // ver que reagiu.
      damage: 7,
      life: 2.2,               // segundos até sumir → alcance ~2000u
      spread: 0.0035,          // radianos de dispersão aleatória
      // Canhões nas pontas das asas. Convergem num ponto à frente, senão os
      // dois feixes nunca acertam o mesmo alvo.
      muzzles: [[-3.6, -0.1, -0.9], [3.6, -0.1, -0.9]],
      convergence: 620,
      // ⚠ MIRA MANUAL. 0 = os tiros saem sempre ao longo do nariz; 1 = eles
      // convergem no ponto de interceptação calculado, ou seja, a arma mira
      // sozinha e acerta um alvo em movimento sem o jogador liderar nada.
      //
      // A primeira versão usava 1 "para os dois canhões acertarem o mesmo
      // ponto", mas o efeito colateral era eliminar a habilidade central do
      // jogo: o retículo verde já mostra ONDE mirar, e a graça é pôr o nariz
      // ali. Com auto-mira, o retículo vira enfeite e o combate fica morno.
      aimAssist: 0,
      color: 0x9dff6b,
      heatPerShot: 0.062,      // superaquecimento força ritmo em vez de segurar
      heatCooling: 0.42,
      overheatLock: 1.35,      // segundos travado ao estourar
    },
    enemy: {
      projectileSpeed: 620,
      fireInterval: 0.34,
      damage: 6,
      life: 3.0,
      spread: 0.016,           // pior mira que a do jogador, de propósito
      muzzles: [[-1.7, 0, -1.2], [1.7, 0, -1.2]],
      convergence: 500,
      color: 0xff7a4d,
    },
    projectileLength: 9,       // comprimento visual do traço
    projectileWidth: 0.36,
    maxProjectiles: 320,       // teto do pool; acima disso o tiro mais antigo cai
  },

  combat: {
    player: {
      hullMax: 100,
      shieldMax: 80,
      shieldRegen: 9.5,        // por segundo
      shieldRegenDelay: 3.2,   // segundos sem levar dano antes de regenerar
      respawnDelay: 2.6,
      invulnAfterRespawn: 2.5,
      collisionRadius: 4.2,
    },
    enemy: {
      hullMax: 34,
      // O escudo é a metade do HP que exige fogo SUSTENTADO: com regeneração
      // rápida e atraso curto, dar meia rajada e sair não mata mais nada. É o
      // que obriga a manter o alvo na mira em vez de raspar de passagem.
      shieldMax: 45,
      shieldRegen: 6.0,
      shieldRegenDelay: 2.4,
      collisionRadius: 3.4,
    },
    // Colisão nave-contra-nave: dano dos dois lados. Existe pra que voar
    // dentro do inimigo não seja tática dominante.
    ramDamage: 22,
    ramCooldown: 0.8,
  },

  enemies: {
    maxAlive: 7,
    spawnDistance: 780,
    spawnSpread: 420,
    waveDelay: 4.5,
    waveSizes: [2, 3, 3, 4, 4, 5],

    // ── Escalonamento por onda ────────────────────────────────────────────
    //
    // ⚠ Sem isto o jogo acabava no minuto cinco, e o defeito era pior do que
    // parece: `waveSizes[Math.min(i, length-1)]` TRAVA em 5. Não ciclava — da
    // onda 6 ao infinito era literalmente a mesma onda, com os mesmos números.
    //
    // O escalonamento é multiplicativo sobre os valores base, nunca sobre o
    // estado anterior: a onda 20 é calculada direto de `combat.enemy`, então
    // não há acúmulo nem deriva. `maxWaveScale` existe porque um crescimento
    // sem teto vira uma parede intransponível em vez de uma curva.
    scaling: {
      hullPerWave: 0.09,
      shieldPerWave: 0.11,
      damagePerWave: 0.05,
      // Velocidade cresce MUITO mais devagar que o resto e tem teto próprio:
      // um inimigo mais rápido que o jogador não é "difícil", é impossível de
      // desengajar, e transforma cada erro em morte certa.
      //
      // ⚠ O teto NÃO é arbitrário: 288 × 1,10 = 317, logo abaixo dos 320 do
      // jogador. Com os 30% que este número tinha antes, a partir da onda 20 o
      // inimigo cruzava a 374 e passava a ser mais rápido que o jogador em
      // velocidade normal — justamente o defeito que o comentário acima
      // descreve. Se `flight.maxSpeed` ou `enemies.flight.maxSpeed` mudarem,
      // este teto tem que ser recalculado junto.
      speedPerWave: 0.015,
      speedMaxBonus: 0.10,
      // A IA vai ficando mais precisa: o erro de mira decai geometricamente.
      // 0.94^20 ≈ 0.29, ou seja, na onda 20 ela erra menos de um terço do que
      // errava na primeira.
      aimErrorDecay: 0.94,
      maxWaveScale: 4.0,
    },

    flight: {
      // Inimigos usam o MESMO modelo de voo do jogador, com números piores.
      // Isso garante que eles se movam de um jeito legível — o jogador
      // reconhece a física deles porque é a dele.
      maxPitchRate: 1.28,
      maxYawRate: 1.18,
      maxRollRate: 2.1,
      pitchYawResponse: 6.8,
      rollResponse: 4.0,
      angularDamping: 3.4,
      // ⚠ A velocidade máxima do inimigo TEM que estar perto da do jogador.
      // Com 250 contra os 320 do jogador, bastava segurar o acelerador cheio
      // pra nunca mais ser alcançado — não havia combate, só uma fuga. O
      // inimigo é um pouco mais lento em cruzeiro (o jogador tem vantagem) mas
      // usa boost pra fechar distância. O boost do jogador (2.35×) continua
      // sendo escapatória garantida, o que é a intenção.
      maxSpeed: 288,
      boostMultiplier: 1.62,
      accelResponse: 1.25,
      decelResponse: 2.0,
      lateralDrag: 2.6,
    },

    // ── Combate atmosférico ──
    // Inimigos que aparecem quando o jogador está na atmosfera de um planeta.
    // Sem isso, descer até a superfície é um passeio: bonito na primeira vez,
    // vazio na segunda. É o que dá razão para explorar em vez de sobrevoar.
    surface: {
      maxAlive: 4,
      spawnDistance: 900,
      spawnAltitude: [180, 620],   // faixa de altitude do surgimento
      waveDelay: 6.0,
      // Altura mínima acima do terreno. A IA não conhece o relevo; sem um
      // piso, os caças mergulham no chão perseguindo o jogador e somem
      // dentro da montanha.
      minAltitude: 45,
      // Quão forte o inimigo é empurrado para cima ao furar o piso. Alto o
      // bastante para nunca afundar, baixo o bastante para ele ainda parecer
      // que está voando e não flutuando num trilho.
      liftStrength: 2.4,
    },

    ai: {
      // Distâncias que definem as transições de comportamento.
      engageRange: 760,      // começa a atacar
      breakRange: 95,        // perto demais → rompe o ataque
      reengageRange: 340,    // depois de romper, volta a partir daqui
      firingCone: 0.055,     // radianos de erro angular tolerado pra atirar
      firingRange: 640,

      // Tempo mínimo/máximo numa passada de ataque antes de reposicionar.
      // Sem isso o inimigo cola atrás do jogador e o combate vira uma
      // perseguição em linha reta que ninguém ganha.
      attackRunMin: 2.6,
      attackRunMax: 4.4,
      evadeDuration: 2.2,
      flankOffset: 260,      // o quanto o ponto de flanco sai do eixo

      // Erro de mira: um inimigo com liderança perfeita é impossível de
      // enfrentar. O erro é um vetor que muda devagar, não ruído por frame —
      // ruído por frame vira tremor visível e ainda assim acerta na média.
      aimErrorMax: 46,
      aimErrorLambda: 0.55,

      // Reação a levar dano: chance de romper imediatamente.
      evadeOnHitChance: 0.42,

      // Formação: quanto os alas seguem o líder em vez de perseguirem sozinhos.
      formationSpread: 46,
      formationLambda: 1.1,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // SISTEMA SOLAR PROCEDURAL
  // ───────────────────────────────────────────────────────────────────────
  // Escala COMPRIMIDA, não realista. Em escala real um sistema solar tem
  // 10^12 unidades e você passaria a partida inteira sem chegar a lugar
  // nenhum. Aqui as distâncias são escolhidas pelo TEMPO DE VIAGEM: ~40 a 90
  // segundos entre corpos com boost, que é longo o bastante pra dar sensação
  // de escala e curto o bastante pra não ser tédio.
  system: {
    // ⚠ ESCALA CALIBRADA PELO TEMPO DE VIAGEM, e a primeira versão errou por
    // ~6×. Com órbitas de até 380.000 unidades, atravessar o sistema a 750
    // u/s (velocidade de boost) levava 8 minutos — e o cinturão, espalhado
    // por um anel dessa circunferência, tinha densidade média de um
    // asteroide a cada 6.000 unidades: espaço vazio com nome de cinturão.
    //
    // Regra pra reajustar: distância ÷ 750 = segundos de viagem com boost.
    // O alvo é 20 a 80 segundos entre corpos vizinhos.
    starRadius: 9000,
    starDistance: 120000,
    planetCount: [6, 9],          // faixa sorteada
    orbitInner: 20000,
    orbitOuter: 78000,
    planetRadius: [1400, 4200],
    // Gigantes gasosos não são pousáveis, então cada um é um planeta a menos
    // para explorar. Mantido baixo de propósito: eles existem para dar
    // variedade na paisagem, não para ocupar vagas de destino.
    gasGiantChance: 0.16,
    ringChance: 0.28,
    atmosphereChance: 0.72,
    moonChance: 0.45,

    belt: {
      chance: 0.85,
      // Faixa radial ESTREITA. O que define se o cinturão é jogável não é a
      // contagem de asteroides, é a DENSIDADE: contagem ÷ volume do anel.
      // Espalhar 3200 rochas por uma faixa radial larga dá espaço vazio;
      // concentrá-las numa faixa fina dá um campo por onde se costura.
      // Com estes números a distância média entre rochas fica em ~1000
      // unidades, e ~140 ficam visíveis dentro do alcance de renderização.
      innerFactor: 0.45,          // fração da faixa orbital
      outerFactor: 0.52,
      thickness: 1200,
    },

    stations: [1, 3],
    stationOrbitOffset: 4200,     // distância do planeta que a estação orbita
  },

  asteroids: {
    count: { high: 4400, medium: 2600, low: 1400 },
    minSize: 14,
    maxSize: 105,
    maxSpin: 0.55,
    baseHp: 0.9,                  // multiplicado pela escala
    resourceChance: 0.14,
    // Distâncias de troca de LOD. Ajuste o primeiro valor se o painel de
    // debug mostrar contagem de triângulos alta com poucos draw calls.
    lodDistances: [900, 2600],
    viewDistance: 7000,
    // Dano ao raspar num asteroide. Alto de propósito: o cinturão precisa
    // ser perigoso, senão ele é só cenário.
    collisionDamage: 26,
    collisionCooldown: 0.7,
  },

  // ───────────────────────────────────────────────────────────────────────
  // SUPERFÍCIE PLANETÁRIA (Fase 4)
  // ───────────────────────────────────────────────────────────────────────
  surface: {
    // Grade de chunks em volta do jogador. 7×7 = 49 chunks.
    // Ímpar de propósito: existe um chunk central, sob os pés.
    gridSize: 7,
    chunkSize: 900,        // lado de um chunk, em unidades
    resolution: 24,        // subdivisões por lado → 24²×2 = 1152 triângulos
    // Quantos chunks podem ser gerados por frame. Gerar um custa ~2ms; fazer
    // os 49 de uma vez seria um engasgo de 100ms bem na hora da descida.
    chunksPerFrame: 2,
    // Cosseno do ângulo além do qual a base tangente local é refeita. Como
    // toda a grade é definida nessa base, refazê-la invalida tudo — então o
    // limiar precisa ser folgado (~8° de arco).
    baseRefreshCos: 0.99,

    // Amplitude do relevo, como fração do raio do planeta. Num planeta de
    // 3900 unidades isto dá picos de ~120 — treze vezes o comprimento da
    // nave. A primeira tentativa usava 0.012 (47 unidades) e o resultado era
    // uma planície: o terreno existia, mas não dava nenhuma sensação de
    // relevo nem de escala.
    reliefFactor: 0.031,

    // ── Névoa atmosférica ──
    // Além de bonita, ela resolve um problema concreto: esconder a borda da
    // grade de chunks. Sem névoa, o terreno termina numa linha reta no
    // horizonte e denuncia o streaming.
    // Calibrado pela distância do horizonte: a ~100 unidades de altitude num
    // planeta de 3900, o horizonte fica a ~880 unidades. A névoa deve cobrir
    // uns 40% ali — o bastante pra dar profundidade, longe de apagar o
    // terreno. 0.0016 apagava tudo além de 700 unidades.
    fogDensityAtGround: 0.0007,

    // ── Entrada atmosférica ──
    // ⚠ Estes quatro números formam um balanço, e a primeira versão errou:
    // com heatRate 0.85 e heatCooling 0.42 o resfriamento vencia o
    // aquecimento em qualquer velocidade plausível, e o calor NUNCA saía de
    // zero. A reentrada não existia.
    //
    // Como calibrar: o aquecimento é (v/ref)³ · densidade · heatRate. Some o
    // resultado ao longo do tempo de travessia da atmosfera e subtraia
    // heatCooling · tempo. Descer a ~150 u/s deve terminar com calor ~0;
    // mergulhar a 400 u/s deve estourar 1.0 e custar escudo.
    entryAltitudeFactor: 0.55,   // fração do raio onde a atmosfera começa
    airDrag: 0.55,
    heatReferenceSpeed: 320,
    heatRate: 1.5,
    heatCooling: 0.3,
    heatDamage: 30,              // dano/s quando o calor passa de 1

    // ── Solo ──
    hullClearance: 7,            // altura mínima do centro da nave ao solo
    groundFriction: 2.4,
    crashSpeed: 55,              // acima disso, bater no chão causa dano
    crashDamagePerSpeed: 1.5,
    landingSpeed: 22,
    landingAltitudeFactor: 1.4,
    landingTime: 0.9,            // segundos parado até contar como pousado
  },

  // ───────────────────────────────────────────────────────────────────────
  // PILOTO AUTOMÁTICO (botão de aproximar / pousar / decolar)
  // ───────────────────────────────────────────────────────────────────────
  // Ele NÃO move a nave: ele escreve no mesmo ControlState que o jogador
  // escreve. Toda a inércia, a deriva e o arrasto continuam vindo do
  // FlightModel. Ver systems/Autopilot.js para o porquê.
  autopilot: {
    // Distância máxima (até a superfície) em que o botão de aproximação
    // aparece. Generosa: com as órbitas entre 20k e 78k, qualquer valor menor
    // deixaria o botão sumindo justo quando ele é mais útil.
    approachRange: 120000,

    // Ganho da direção: erro angular (rad) → comando -1..1. Com 2.2, o
    // comando satura a partir de ~26° de erro, então curvas grandes usam
    // taxa máxima e a aproximação final fica proporcional (sem oscilar).
    steerGain: 2.2,
    rollGain: 1.6,
    // Acima deste erro de rumo (rad) o acelerador recua: acelerar de través
    // só gera deriva lateral que depois precisa ser desfeita.
    alignTolerance: 0.5,

    // ── Cruzeiro ──
    // Sem isto, atravessar 30.000 unidades a 320 u/s levaria 94 segundos de
    // nada acontecendo, e o botão seria inútil na prática. É o "pulse drive"
    // do No Man's Sky: só existe enquanto o piloto automático voa, então não
    // mexe no balanceamento do voo manual.
    cruiseMultiplier: 4.5,
    cruiseLambda: 1.4,        // suavização ao ligar/desligar
    cruiseMinDistance: 5000,  // abaixo desta altitude, volta à velocidade normal
    // Segundos sem cruzeiro depois de levar dano. A primeira versão bloqueava
    // por PROXIMIDADE de inimigo, e o resultado foi um cruzeiro que nunca
    // ligava: as ondas nascem perto do jogador de propósito, então sempre
    // havia alguém no raio. "Sob fogo" é a regra que de fato queríamos —
    // e é legível: se estão te acertando, você não foge no piloto automático.
    cruiseBlockAfterHit: 4,

    // ── Descida ──
    // Taxa de descida alvo = altitude × descentRate, limitada. Proporcional à
    // altitude é o que produz uma curva de aproximação suave: rápido no alto,
    // quase parado ao encostar, sem nenhuma etapa explícita.
    descentRate: 0.34,
    descentMin: 4,
    descentMax: 95,

    // ⚠ A descida tem DOIS regimes, e o motivo é uma limitação real do modelo
    // de voo: com a assistência ligada, tudo que não é a componente FRONTAL
    // sofre `lateralDrag`. O propulsor vertical (105 u/s²) contra um
    // amortecimento de 3 a 7 encontra equilíbrio em 15–35 u/s e não passa
    // disso — a primeira versão descia a 16 u/s e levava 100 segundos.
    //
    // Só o eixo frontal tem autoridade alta (motor até 320 u/s). Então, no
    // alto, a nave DESCE VOANDO: o nariz aponta na direção da velocidade
    // desejada e o acelerador dá a intensidade. Perto do chão ela nivela e
    // passa para os propulsores, que ali sobram.
    flareAltitude: 180,       // altitude onde nivela e troca para propulsores
    horizFactor: 0.25,        // velocidade horizontal alvo = altitude × isto
    horizMax: 140,
    vsGain: 0.09,             // comando de propulsor por u/s de erro vertical

    // Já nivelado, não encosta no chão enquanto a velocidade horizontal for
    // maior que landingSpeed × fastFactor: pousar de lado a 100 u/s é bater.
    fastFactor: 2.5,
    // Acima deste calor a descida pausa e a nave nivela até esfriar.
    heatLimit: 0.7,

    // ── Água ──
    // Sonda o terreno em quatro direções e desvia para o lado mais seco.
    // Pousar no meio do oceano funciona, mas parece defeito.
    waterProbe: 1800,
    waterProbeInterval: 0.4,

    // Tetos de tempo por fase. Um piloto automático travado sem aviso é pior
    // que não ter piloto automático: ele desengata e diz por quê.
    timeoutApproach: 240,
    timeoutLand: 120,
    timeoutTakeoff: 45,
  },

  effects: {
    explosion: {
      particles: { high: 42, medium: 28, low: 16 },
      maxActive: 900,
      speed: 46,
      speedVariance: 0.75,
      life: 1.15,
      lifeVariance: 0.5,
      drag: 1.35,
      size: 2.6,
      colorHot: 0xfff3c4,
      colorMid: 0xff9a3c,
      colorCool: 0x8c2f1a,
      flashDuration: 0.22,
      flashSize: 26,
    },
    shieldHit: {
      duration: 0.42,
      size: 9.5,
      color: 0x7de8ff,
    },
    hitSpark: {
      particles: 7,
      speed: 22,
      life: 0.34,
      size: 1.1,
      color: 0xffd08a,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // PROGRESSÃO (Fase 5)
  // ───────────────────────────────────────────────────────────────────────
  progression: {
    creditsPerOre: 1,
    // Distância pra atracar. Generosa de propósito: mirar um ponto exato de
    // atracação em 6DOF é frustrante, e a graça está em CHEGAR lá, não em
    // encaixar a nave num buraco.
    dockDistance: 900,
    dockSpeed: 60,            // precisa estar devagar
    dockTime: 1.2,            // segundos dentro das condições

    // Sobrevoo que conta como "planeta visitado".
    surveyAltitudeFactor: 0.22,   // fração do raio

    missionOreTarget: 6,
    missionKillTarget: 5,
    missionPlanetTarget: 3,
    missionArriveDistance: 2600,
  },

  hud: {
    radar: {
      range: 1400,       // alcance máximo de contatos hostis
      // Alcance separado, muito maior, para planetas e estações: eles ficam a
      // dezenas de milhares de unidades e no alcance de combate nunca
      // apareceriam — e é exatamente na navegação que o radar mais serve.
      bodyRange: 140000,
      size: 128,         // px do elemento
      tilt: 0.62,        // inclinação da elipse (0 = topo, 1 = lateral)
    },
    // O marcador de alvo pisca quando o alvo está fora de tela, apontando a
    // direção. Sem isso, perder o alvo de vista significa perdê-lo de vez.
    offscreenMargin: 56,
  },

  // ───────────────────────────────────────────────────────────────────────
  // ÁUDIO E PÓS-PROCESSAMENTO (Fase 6)
  // ───────────────────────────────────────────────────────────────────────
  audio: {
    masterVolume: 0.7,
    sfxVolume: 0.85,
    engineVolume: 0.34,
    ambienceVolume: 0.3,
  },

  post: {
    // Ligado por tier de qualidade: no tier mínimo o pós-processamento é
    // desligado inteiro, porque em fill rate ele é o primeiro custo a cortar.
    enabledFrom: 2,        // índice máximo de tier que ainda tem pós
    bloom: {
      intensity: 0.85,
      luminanceThreshold: 0.62,
      luminanceSmoothing: 0.28,
      // Meia resolução: bloom é um borrão, e borrar em resolução cheia é
      // gastar quatro vezes mais banda de memória por um resultado que
      // ninguém distingue.
      resolutionScale: 0.5,
      mipmapBlur: true,
    },
    vignette: { darkness: 0.42, offset: 0.32 },
    chromaticAberration: 0.0007,
    // Desfoque de movimento no boost: o efeito é aplicado como escala de
    // aberração cromática + vinheta, não como motion blur de verdade
    // (que exigiria velocity buffer e custaria caro no iPad).
    boostAberration: 0.0035,
    boostVignette: 0.62,
  },

  debug: {
    startVisible: false,
    graphSamples: 120,
  },
};

/** Congela para pegar typo de escrita em runtime? Não: o lil-gui precisa
 *  escrever aqui. Mantemos mutável de propósito. */
export default CONFIG;
