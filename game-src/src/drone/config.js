/**
 * config.js do modo DRONE — todas as constantes de gameplay num lugar só.
 *
 * Mesma regra do jogo de nave: nenhum número mágico dentro de um sistema.
 * A diferença é a ESCALA e a UNIDADE. Aqui 1 unidade de mundo = 1 metro de
 * verdade, e a gravidade é 9,81 m/s² de verdade. Isso não é preciosismo:
 * um quadricóptero é definido pela razão entre o empuxo que ele produz e o
 * peso que ele carrega, e essa razão só significa alguma coisa se a
 * gravidade for a real. Com gravidade inventada, "3,4:1 de empuxo" não diz
 * nada a quem já voou um drone — e diz tudo a quem já voou, se for real.
 *
 * Unidades:
 *   distância = metros
 *   ângulo    = radianos (as constantes são escritas em graus e convertidas)
 *   tempo     = segundos
 *   "lambda"  = taxa de suavização exponencial (ver core/MathUtils.damp)
 */

import { MathUtils as TM } from 'three';

const DEG = TM.degToRad;

export const DCFG = {
  // ───────────────────────────────────────────────────────────────────────
  // MUNDO
  // ───────────────────────────────────────────────────────────────────────
  world: {
    seed: 'drone-vale-01',
    gravity: 9.81,

    // Câmera. Uma faixa de profundidade só — ao contrário do jogo de nave,
    // aqui a razão far/near é 4000:1 e o depth buffer de 24 bits resolve isso
    // com folga. Não há motivo pra pagar duas passadas de render.
    near: 0.25,
    far: 6000,
    // FOV da câmera FPV. Câmeras de FPV de verdade são MUITO angulares
    // (150–165° de diagonal). Reproduzir isso exatamente enjoa em tela plana,
    // mas um FOV alto é o que dá a sensação de velocidade perto do chão —
    // com FOV baixo, voar a 100 km/h a dois metros do solo parece um passeio.
    fovFPV: 96,
    fovChase: 74,
    fovLOS: 42,

    sunDirection: [0.36, 0.62, 0.28],
    sunColor: 0xfff4e2,
    sunIntensity: 2.5,
    ambientColor: 0x9fc4ef,
    ambientIntensity: 0.85,
    // Cor do céu no zênite e no horizonte. A névoa usa a cor do horizonte,
    // senão os morros distantes desbotam para uma cor que não existe no céu
    // e o horizonte ganha uma linha dura.
    skyZenith: 0x2f6fc0,
    skyHorizon: 0xbcd7ef,
    fogDensity: 0.00055,
  },

  // ───────────────────────────────────────────────────────────────────────
  // TERRENO
  // ───────────────────────────────────────────────────────────────────────
  terrain: {
    size: 2600,          // lado do campo, em metros
    segments: 190,       // resolução da malha (segments² × 2 triângulos)
    amplitude: 145,      // desnível máximo entre vale e cume
    noiseScale: 0.9,
    // Raio em volta do ponto de decolagem que é achatado. Sem isso o piloto
    // nasce numa ladeira, e as primeiras decolagens — que são onde o jogador
    // aprende o acelerador — viram uma luta contra o relevo.
    padRadius: 55,
    padBlend: 130,       // transição do achatamento até o relevo normal
    waterLevel: 14,      // altura do lago; abaixo disso a malha é achatada
    colors: {
      grass: 0x4f7b3a,
      grassDry: 0x86904a,
      rock: 0x6d6a63,
      cliff: 0x54514c,
      sand: 0xbfae86,
      water: 0x2e5f7a,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // PROPS (obstáculos)
  // ───────────────────────────────────────────────────────────────────────
  props: {
    trees: 620,
    rocks: 240,
    towers: 14,
    // Distância mínima de um prop ao centro do pad: nascer dentro de uma
    // árvore é a pior primeira impressão possível.
    clearRadius: 70,
    // Raio de colisão usado no teste contra o drone. Fica um pouco MENOR que
    // a copa visível de propósito: raspar folha e explodir é frustrante, e
    // ninguém consegue julgar a borda exata de uma copa cônica em voo.
    treeHitRadius: 1.5,
    rockHitScale: 0.8,
  },

  // ───────────────────────────────────────────────────────────────────────
  // QUADRICÓPTERO
  // ───────────────────────────────────────────────────────────────────────
  //
  // ═══ O QUE FAZ UM DRONE SER UM DRONE ═══
  //
  // Uma nave espacial acelera na direção do nariz. Um quadricóptero SÓ sabe
  // empurrar para o próprio "para cima" — as quatro hélices apontam todas
  // para o mesmo lado. Ir para frente é, obrigatoriamente, inclinar para
  // frente e aceitar que parte do empuxo deixou de segurar o peso.
  //
  // Isso é o modelo inteiro. Todo o resto — a sensação de deslizar na curva,
  // a queda quando você corta o acelerador no meio de uma inclinação, a
  // necessidade de "dar gás" ao sair de uma curva — cai de graça a partir
  // dessa única restrição. Nenhum caso especial foi escrito para produzi-los.
  quad: {
    // Razão empuxo/peso. 3,4:1 é um freestyle de 5 polegadas honesto: sobe
    // com autoridade, mas o acelerador ainda é um recurso a administrar.
    // Acima de 6:1 (racer moderno) o acelerador vira interruptor e some a
    // decisão; abaixo de 2:1 o drone não sai de manobra nenhuma.
    thrustToWeight: 3.4,
    // Tempo de resposta dos motores (lambda). Motor + hélice têm inércia:
    // o empuxo não aparece no instante do comando. É esse atraso de poucos
    // centésimos que dá o "peso" do punch-out e o afundamento característico
    // ao sair de um mergulho — o famoso propwash.
    motorResponse: 17,
    // Marcha lenta com o drone armado. Hélice parada não é o estado normal:
    // um quad armado zumbe e produz um empuxo pequeno mas não nulo.
    idleThrust: 0.055,

    // ── Modo ACRO (taxa pura) ──────────────────────────────────────────
    // O manche comanda VELOCIDADE ANGULAR, não ângulo. Soltar o manche não
    // nivela nada: o drone fica exatamente na atitude em que estava. É o
    // modo em que se voa FPV de verdade, e é o único em que um flip existe.
    rates: {
      roll: DEG(620),
      pitch: DEG(560),
      yaw: DEG(360),
      // Expo: comprime o centro do manche sem perder o fim de curso. Sem
      // expo, um teclado (que é sempre 0 ou 1) é impossível de pilotar e um
      // analógico fica nervoso demais no centro.
      expo: 1.55,
      // Quão rápido a velocidade angular alcança o comando. Alto porque um
      // PID de verdade é rápido; o que dá peso é o motor (motorResponse),
      // não a lentidão do giro.
      response: 26,
      // Amortecimento quando o manche volta ao centro. Um pouco menor que
      // `response`: parar de girar é mais lento que começar, e essa
      // assimetria é metade da sensação de massa.
      damping: 16,
    },

    // ── Modo ANGLE (auto-nivelamento) ──────────────────────────────────
    // O manche comanda INCLINAÇÃO, e soltar nivela sozinho. É o modo de
    // qualquer drone de câmera comercial, e é onde todo mundo começa.
    angle: {
      maxLean: DEG(42),
      // Ganho do laço externo: erro de ângulo → comando de taxa. 9,5 rad/s
      // por radiano de erro converge em ~0,4 s sem oscilar. Acima de 15 o
      // drone "trava" no nível de forma robótica; abaixo de 5 ele boia.
      p: 9.5,
      // Teto de taxa que o auto-nivelamento pode pedir. Sem teto, recuperar
      // de cabeça para baixo produz um chicote de 900°/s que embrulha o
      // estômago e some com a referência visual.
      maxCorrection: DEG(340),
    },

    // ── Aerodinâmica ───────────────────────────────────────────────────
    // Arrasto QUADRÁTICO (∝ v²), não linear. A diferença importa: com
    // arrasto linear não existe velocidade terminal característica, e o
    // drone continua ganhando velocidade num mergulho longo até parecer um
    // míssil. Com v² há um teto natural, e ele é sentido.
    drag: 0.019,
    // O disco das hélices é uma placa: cair "de barriga" freia muito mais
    // que avançar de nariz. É isso que permite descer rápido sem virar o
    // drone e o que produz o balanço no propwash.
    dragVerticalMul: 1.9,
    // Efeito solo: perto do chão a hélice empurra contra ar que não
    // consegue escapar, e o empuxo sobe. É por isso que pousar exige cortar
    // o acelerador mais do que a intuição manda, e por isso que o último
    // metro de uma aterrissagem é o difícil.
    groundEffectHeight: 1.6,
    groundEffectGain: 0.22,

    // ── Colisão ────────────────────────────────────────────────────────
    radius: 0.22,               // meia-envergadura do frame, em metros
    // Velocidade de impacto acima da qual o drone quebra. Abaixo disso ele
    // quica e continua voando — bater de leve numa árvore não deve terminar
    // a corrida, ou ninguém tenta passar perto de nada.
    crashSpeed: 7.5,
    bounce: 0.32,
    respawnDelay: 2.2,

    // ── Bateria (LiPo 6S 1300 mAh) ─────────────────────────────────────
    //
    // ═══ POR QUE MODELAR VOLTAGEM E NÃO UMA BARRA DE 0 A 100% ═══
    //
    // Uma barra de porcentagem é um cronômetro com outro nome: ela desce
    // linear e não te ensina nada. A voltagem de um LiPo faz outra coisa —
    // ela AFUNDA sob carga e volta quando você alivia. Isso significa que o
    // OSD reage ao que você está fazendo agora, não só ao tempo que passou:
    // um punch-out derruba 2 V na hora e devolve em seguida.
    //
    // O resultado é que o piloto aprende a ler a bateria como um instrumento
    // — "afundou até 19 V num punch, ela está acabando" — que é exatamente a
    // habilidade que se desenvolve voando de verdade.
    battery: {
      cells: 6,
      capacity: 1300,        // mAh
      fullPerCell: 4.2,
      emptyPerCell: 3.5,
      idleCurrent: 4,        // A com os motores em marcha lenta
      fullCurrent: 88,       // A com os quatro motores no talo
      // Resistência interna do pacote, em ohms. É daqui que sai o afundamento
      // de voltagem: ΔV = I × R. 22 mΩ é um pacote bom mas não novo.
      resistance: 0.022,
      // Abaixo disto por célula o ESC começa a limitar. O drone não cai do
      // céu: ele fica mole, e é aí que o piloto tem que decidir voltar.
      sagCutoffPerCell: 3.3,
      warnPerCell: 3.55,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // RETORNO AUTOMÁTICO (RTH)
  // ───────────────────────────────────────────────────────────────────────
  // Equivalente ao piloto automático do jogo de nave — e, como lá, ele existe
  // para que a distância não vire punição. A diferença é que aqui ele é uma
  // função que drones de verdade têm, com a mesma coreografia: sobe até uma
  // altura segura, volta em linha reta, desce.
  rth: {
    cruiseAltitude: 45,     // metros acima do terreno
    speed: 18,              // m/s no trecho de cruzeiro
    climbRate: 6,
    descendRate: 3.2,
    // Teto de descida durante o cruzeiro. Voltando de cima de uma serra, o
    // drone fica dezenas de metros acima da altura de cruzeiro sobre o vale;
    // com um teto pequeno ele chega em casa ainda lá em cima.
    cruiseDescend: 6,
    arriveRadius: 6,
    // Qualquer toque no manche cancela. Regra deliberada: um automatismo que
    // exige achar o botão de desligar é pior que não ter automatismo.
    cancelStick: 0.18,
  },

  // ───────────────────────────────────────────────────────────────────────
  // GEOFENCE
  // ───────────────────────────────────────────────────────────────────────
  // Cerca virtual. Existe por dois motivos: é o que drones de verdade fazem,
  // e resolve o problema de mundo finito sem parede invisível — em vez de
  // esbarrar em nada, o piloto recebe o mesmo aviso que receberia no rádio.
  fence: {
    radius: 980,
    warnRadius: 860,
    // Empurrão de volta na borda. Suave e crescente: um empurrão duro seria
    // uma parede com outro nome.
    pushAccel: 9,
    // Velocidade de retorno acima da qual a cerca para de empurrar. Sem esse
    // limite o empurrão acumula e devolve o drone ao mapa como uma catapulta.
    maxReturnSpeed: 7,
    ceiling: 340,
  },

  // ───────────────────────────────────────────────────────────────────────
  // CIRCUITO
  // ───────────────────────────────────────────────────────────────────────
  course: {
    gates: 9,
    // Raio do circuito em volta do pad. Grande o bastante pra que uma volta
    // leve ~40 s num voo limpo — tempo suficiente pra bateria virar decisão.
    radius: 430,
    radiusJitter: 150,
    aperture: 4.2,          // meia-largura do vão do gate, em metros
    heightMin: 6,
    heightMax: 38,
    // Tolerância extra além do vão para contar a passagem. O vão VISUAL é o
    // que o piloto mira; contar exatamente nele faz passagens que pareciam
    // boas não contarem, o que é pior que contar uma passagem raspando.
    forgiveness: 1.15,
  },

  // ───────────────────────────────────────────────────────────────────────
  // CÂMERA
  // ───────────────────────────────────────────────────────────────────────
  camera: {
    // Inclinação da câmera FPV para cima, em relação ao plano do frame.
    // ═══ O NÚMERO MAIS IMPORTANTE DO JOGO ═══
    // Uma câmera de FPV é PARAFUSADA no frame, inclinada para cima. Como o
    // drone inclina PARA BAIXO para ir para frente, sem esse ângulo o piloto
    // veria o chão em qualquer velocidade. 25° é o ajuste típico de
    // freestyle: você olha para o horizonte enquanto voa inclinado.
    // 20° e não os 25° típicos de freestyle: a partida acontece pairando no
    // pad, e a 25° a primeira coisa que o jogador vê é céu. 20° mantém o
    // horizonte na imagem ao pairar e ainda nivela em velocidade de cruzeiro.
    fpvTilt: DEG(20),
    // A câmera FPV NÃO é estabilizada. Rola junto com o drone, inclusive de
    // cabeça para baixo. Estabilizar destruiria o modo — a rolagem da imagem
    // é a informação que o piloto usa para saber onde está o chão.
    chaseDistance: 2.7,
    chaseHeight: 0.85,
    chaseLambda: 7.5,
    // A perseguidora acompanha a POSIÇÃO com atraso, mas não copia a
    // rolagem do drone: seguir um flip de terceira pessoa é injogável.
    chaseUpLambda: 4.0,
    losHeight: 1.7,           // altura dos olhos do piloto na vista de solo
    shakeSpeed: 0.02,         // tremor proporcional à velocidade
    shakeCrash: 0.55,
  },

  // ───────────────────────────────────────────────────────────────────────
  // VÍDEO ANALÓGICO (o "look" de FPV)
  // ───────────────────────────────────────────────────────────────────────
  // O chuvisco não é enfeite: ele é o indicador de sinal. A intensidade sobe
  // com a distância e com o que há entre o drone e o piloto, exatamente como
  // um link de 5,8 GHz. Isso transforma "estou longe" numa coisa que se VÊ,
  // sem precisar de um número no OSD.
  video: {
    staticStart: 420,       // metros onde o chuvisco começa a aparecer
    staticFull: 1000,       // onde a imagem fica quase perdida
    lowAltitudePenalty: 26, // abaixo disto o solo bloqueia o sinal
  },

  // ───────────────────────────────────────────────────────────────────────
  // INPUT
  // ───────────────────────────────────────────────────────────────────────
  input: {
    keyboard: {
      // Layout "modo 2" mapeado no teclado: mão esquerda = acelerador e
      // guinada (WASD), mão direita = inclinação e rolagem (setas).
      throttleUp: ['KeyW'],
      throttleDown: ['KeyS'],
      yawLeft: ['KeyA'],
      yawRight: ['KeyD'],
      pitchFwd: ['ArrowUp'],
      pitchBack: ['ArrowDown'],
      rollLeft: ['ArrowLeft'],
      rollRight: ['ArrowRight'],
      arm: ['Enter'],
      mode: ['KeyM'],
      camera: ['KeyC'],
      rth: ['KeyH'],
      reset: ['KeyR'],
      restart: ['KeyT'],
      debug: ['F3'],
      pause: ['Escape'],
    },
    // O teclado é digital; o manche é analógico. Estas taxas são a ponte:
    // uma tecla move o eixo virtual em direção ao fim de curso em vez de
    // saltar para ele, e o eixo volta ao centro quando a tecla solta.
    keyRampUp: 6.5,
    keyRampDown: 9.0,
    // O acelerador NÃO volta ao centro. Num rádio de verdade o manche do
    // acelerador não tem mola — ele fica onde você deixou, e isso é metade
    // do que se aprende ao pilotar.
    throttleRate: 1.35,
    gamepad: {
      enabled: true,
      deadzone: 0.09,
      // Modo 2, o padrão ocidental: analógico esquerdo = acelerador (Y) e
      // guinada (X); direito = inclinação (Y) e rolagem (X).
      throttleAxis: 1,
      yawAxis: 0,
      pitchAxis: 3,
      rollAxis: 2,
      invertThrottle: true,
      invertPitch: true,
      armButton: 0,
      modeButton: 2,
      cameraButton: 3,
      rthButton: 1,
    },
    touch: {
      enabled: 'auto',
      stickRadius: 78,
      deadzone: 0.06,
      // O manche esquerdo do touch é "pegajoso" no acelerador: o eixo
      // vertical fica onde o dedo largou, imitando a falta de mola do
      // acelerador de um rádio. Sem isso, tirar o dedo derruba o drone.
      stickyThrottle: true,
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // QUALIDADE ADAPTATIVA
  // ───────────────────────────────────────────────────────────────────────
  // Mesma lógica do jogo de nave, e pelo mesmo motivo concreto: um iPad
  // segura 60 fps por alguns minutos e depois cai por temperatura. O que
  // muda aqui é o que está no orçamento — sombras existem (há chão para
  // recebê-las) e o céu é um shader, não um cubemap.
  //
  // O algoritmo é conservador de propósito: avalia a MEDIANA de uma janela
  // de frames (um pico isolado de GC não deve derrubar a qualidade), precisa
  // de avaliações ruins seguidas para descer e de muitas folgadas para
  // subir — senão, com throttling térmico, ele oscilaria para sempre entre
  // dois níveis, o que é pior que ficar no mais baixo.
  quality: {
    levels: [
      { name: 'alto', pixelRatio: 2.0, shadows: true, shadowSize: 2048 },
      { name: 'médio', pixelRatio: 1.5, shadows: true, shadowSize: 1024 },
      { name: 'baixo', pixelRatio: 1.0, shadows: false, shadowSize: 512 },
      { name: 'mínimo', pixelRatio: 0.75, shadows: false, shadowSize: 512 },
    ],
    startDesktop: 0,
    startMobile: 1,
    maxPixelRatio: 2.0,
    targetMsDesktop: 17.5,   // ~57 fps
    targetMsMobile: 22.0,    // ~45 fps, com meta dura de 30
    sampleWindow: 90,
    downgradeStreak: 2,
    upgradeStreak: 8,
    upgradeHeadroom: 0.72,
    maxUpgrades: 2,
    // Lado da caixa de sombra, em metros, centrada no drone. A sombra
    // acompanha o drone em vez de cobrir o mapa: 2600 m num shadow map de
    // 2048 dariam 1,3 m por texel, e a sombra de um drone de 25 cm
    // simplesmente não existiria.
    shadowRange: 34,
  },

  // ───────────────────────────────────────────────────────────────────────
  // ÁUDIO
  // ───────────────────────────────────────────────────────────────────────
  audio: {
    masterVolume: 0.55,
    // Frequência de cada motor em marcha lenta e no talo. Um quad de 5" gira
    // entre ~7.000 e ~28.000 rpm; a frequência de passagem de pá (2 pás ×
    // rpm/60 × ... ) cai justamente nessa faixa audível.
    motorHzIdle: 96,
    motorHzFull: 430,
    // Cada motor é destoado alguns hertz dos outros. Isso não é detalhe:
    // o batimento entre motores quase-iguais é EXATAMENTE o que faz um
    // quadricóptero soar como um quadricóptero e não como um zumbido.
    motorDetune: [1.0, 1.017, 0.986, 1.031],
    windGain: 0.5,
    windSpeedRef: 30,
  },
};
