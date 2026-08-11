# DRONEFARER — decisões

Uma linha por decisão, na ordem em que foram tomadas. Quando o roadmap deixou a
escolha em aberto, o critério de desempate foi o combinado: **o que roda melhor
em iPad e tem menos dependência**.

## Fase 0 — Fundação

- **Física do drone: integração manual (semi-implícita), sem Rapier.** O pedido é
  arcade com peso, não simulador; um solver de rigid body daria de graça
  exatamente o realismo que teríamos de desfazer (capotar ao raspar num poste),
  custando ~1,2 MB de WASM.
- **Pós-processamento: shader próprio de passe único, sem a lib `postprocessing`.**
  O feed FPV é barril + aberração cromática + vinheta + ruído — todos efeitos de
  tela cheia que cabem num fragment shader só. Uma lib faria o mesmo passe com
  ~45 KB gzip a mais e uma API a aprender.
- **Terreno: chunks com streaming desde o início, não heightmap único.** A Fase 3
  exige mundo aberto; começar com heightmap único significaria reescrever
  terreno, colisão e props no meio do projeto. O custo de começar em chunks é
  quase zero porque a função de altura é a mesma.
- **Dependência de runtime única: `three`.** Ruído gradiente e PRNG são ~80 linhas
  escritas à mão (`world/noise.js`), o que também deixa a função de altura
  utilizável dentro de um Web Worker sem bundling extra.
- **Deploy em `/mathref/drone/`,** fonte em `drone-src/` e build commitado em
  `drone/` — mesmo arranjo já validado pelo Starfarer no mesmo repositório.
- **Módulos em pastas (`core/`, `flight/`, `world/`, …) em vez de arquivos soltos
  na raiz.** O roadmap pedia arquivos curtos, não raiz plana; as pastas mantêm os
  arquivos curtos e ainda dão nomes previsíveis pra achar no iPad.
- **Timestep fixo em 60 Hz com render desacoplado e interpolação.** Sem isso o
  ghost gravado num aparelho não bate no outro.
- **Qualidade adaptativa só desce, nunca sobe sozinha.** Subir de volta faz o jogo
  oscilar entre dois tiers, e oscilar é pior de jogar que ficar no tier baixo.

### Aceite verificado

- `npm run build` gera `../drone/` com `base: '/mathref/drone/'`. ✅
- Loop de física fixo em 60 Hz com render desacoplado. ✅
- 4 tiers detectados por GPU/resolução/núcleos, com override por `?q=`. ✅
- Cena com grid + contador de FPS. ✅

## Fase 1 — Voo FPV

- **A mecânica central não é código, é consequência.** O empuxo aponta pro +Y
  *local* do drone; inclinar pra frente já inclina o vetor junto, ganhando
  componente horizontal e perdendo vertical. Não existe nenhuma regra escrita
  dizendo "ao inclinar, acelere e afunde" — e é por isso que fica legível sem HUD.
- **ANGLE por erro de quaternion, não por ângulos de Euler.** Sem gimbal lock, e
  ao voltar de cabeça pra baixo o controlador acha o caminho curto em vez de
  rodar o longo.
- **Duas meia-vidas de rotação:** o drone *atinge* a taxa pedida em 0,045 s e só
  *para* em 0,11 s. Essa assimetria é o que faz o ACRO ter peso em vez de parecer
  preso num trilho.
- **Acelerador: catraca no teclado, mola no analógico.** Stick centrado = pairar,
  porque um controle que auto-centraliza faria o drone despencar toda vez que a
  mão sai; teclado segura o valor, como um rádio de verdade.
- **Poeira sem CPU:** as partículas ficam paradas e o shader repete a caixa em
  volta do drone com um `mod`. Cauda deslocada pela velocidade → parado é ponto,
  rápido é risco. Zero atualização por frame pra 900 partículas.
- **Colisão distingue raspão de batida.** Encostar num poste devagar empurra pra
  fora e tira velocidade; bater acima de 7,5 m/s quebra. Sem isso o jogo viraria
  "evite o cenário" em vez de "rasgue por dentro dele".
- **Sol atrás da proa inicial.** Contraluz transformava todos os props em
  silhuetas pretas — e são justamente eles que dão a referência de velocidade.
- **Distorção de barril renormalizada** pelo fator do canto: mantém as linhas
  arqueadas da lente sem deixar moldura preta comendo o quadro.
- **Props são prioridade, não enfeite.** Espalhados em grade com jitter em vez de
  aleatório puro: aleatório puro amontoa e deixa vazios, e é o vazio que mata a
  sensação de velocidade.

### Aceite verificado (`npm run test:aceite`, 9/9)

O aceite da fase é sobre sensação, que não se automatiza — mas as afirmações
físicas por trás dela sim. O script pilota pelo teclado e mede:

- Acelerador solto mantém a altura (0,02 m/s de deriva vertical). ✅
- Inclinar pra frente: 8 → 44 km/h **e** afunda ~2 m/s. A troca existe. ✅
- FOV acompanha a velocidade (101° → 106°). ✅
- ANGLE nivela sozinho (0°); ACRO mantém 3,3 rad/s de giro residual e segue
  inclinado 1,4 s depois. Os dois modos são claramente diferentes. ✅
- Bater vira crash; respawn é automático, sem menu. ✅

Falta um humano para os critérios 1, 3 e 4 (sentir velocidade sem HUD, mergulho
difícil-mas-justo, 60 fps num iPad real) — aqui só há GPU por software.

## Fase 2 — Corrida e progressão

- **Passagem por interseção de plano, não por proximidade.** A 130 km/h o drone
  anda 60 cm por passo de física; um teste de "está perto do gate?" deixaria
  passar batido em metade das tentativas. Guardamos a posição do passo anterior e
  vemos se o segmento cruzou o plano — e no sentido certo.
- **Só o gate ativo é testado.** A ordem é obrigatória, então testar todos seria
  trabalho jogado fora e deixaria o jogador "passar" no gate 7 por acidente
  enquanto procura o 3.
- **Raspar não tira tempo, tira combo.** O roadmap pediu penalidade visual; somar
  segundos ao cronômetro tornaria o recorde uma mentira. Perder o combo acumulado
  é um custo real que mantém o relógio honesto.
- **O cronômetro nunca é "ajudado".** Centro e ritmo pagam em créditos (a moeda
  da Fase 5), não em desconto de tempo. Tempo é tempo.
- **Só o fantasma da MELHOR volta é guardado.** Guardar a última faria o jogador
  correr contra a própria volta ruim.
- **Ghost em array plano de números arredondados**, não objetos: uma volta de 60 s
  a 20 Hz cabe em ~35 KB no localStorage em vez de ~140 KB. Cursor que só anda
  pra frente na reprodução.
- **Bater NÃO reinicia a volta.** O respawn é automático e o cronômetro continua;
  a decisão de recomeçar é sempre do jogador, apertando R.
- **Gate orientado pela bissetriz** entre o traçado que chega e o que sai.
  Apontá-lo só pro próximo deixaria gates atravessados na cara de quem chega nas
  curvas, impossíveis de cruzar sem raspar.
- **Save com migrações incrementais** (1→2→3) e quota tratada: se o localStorage
  encher, os ghosts são descartados primeiro porque são o maior item e o mais
  descartável. Falha de escrita nunca quebra o jogo.
- **Os três circuitos cobram coisas diferentes:** Aberto premia velocidade de
  ponta, Técnico troca de direção rasante, e Vertical exige ACRO — em ANGLE o
  limite de 38° trava o mergulho antes de dar tempo de ouro.

### Aceite verificado (`npm run test:aceite`, 17/17)

- R rearma a volta na hora: cronômetro zerado, gate 1 ativo, sem menu. ✅
- Cruzar o gate 1 larga o cronômetro; passar por todos termina a volta com um
  split por gate. ✅
- Recorde, ghost e créditos gravados no fim e **sobrevivem ao recarregar**. ✅
- Cruzar um gate fora de ordem é ignorado. ✅
- `]` troca de circuito e rearma. ✅

## Fase 3 — Mundo aberto

- **Zonas por peso, não por fronteira.** Cada zona tem centro e raio, e os
  parâmetros de relevo/props/atmosfera são a média ponderada. Fronteira dura
  desenharia uma linha reta no terreno e denunciaria o truque.
- **As zonas mudam a PILOTAGEM, não a cor.** No vale o relevo é liso e a
  dificuldade é a estrutura grande (vento canalizado, gaps). Na floresta a
  densidade de tronco fecha a visibilidade e obriga voo lento e baixo. Na costa o
  relevo é `ridged` (crista afiada em vez de duna) com térmicas subindo pelas
  paredes e o dobro de vento — voo alto e longo, onde o adversário é o ar.
- **Direção do vento interpolada em vetor, não em graus.** A média de 350° com
  10° dá 180° — exatamente o contrário do certo.
- **Água em disco, não em plano infinito.** O nível do mar da costa alagaria o
  vale industrial, cujo relevo oscila em torno do zero. Um disco em volta do
  centro da zona resolve sem máscara nem shader especial.
- **Cinco desafios de POI, uma mecânica só:** tocar checkpoints em ordem dentro
  de um tempo. É a geometria do marco que os diferencia — um checkpoint debaixo
  do arco vira "passe por baixo da ponte", três descendo o poço viram "entre na
  mina".
- **Perda de sinal atenua o comando, não o randomiza.** Um link ruim de verdade
  para de entregar; o drone segue obedecendo ao último comando que chegou. E o
  acelerador cai pro ponto de pairar em vez de zerar, porque desligar os motores
  mataria o drone toda vez — isso seria injusto, não tenso.
- **A degradação é sempre reversível** e suavizada no tempo: voltar 50 m devolve
  o sinal, e uma rajada que empurra o drone dois metros não faz a imagem piscar.
- **O mapa PAUSA o jogo.** Sem pausa, consultar o mapa em voo é sinônimo de
  bater, e o jogador aprende a nunca abrir o mapa. O relevo é rasterizado uma vez
  e só a camada dinâmica é redesenhada.
- **A antena é repetidor.** Descobri-la amplia a cobertura de rádio — explorar
  compra alcance, o que dá motivo pra ir longe antes de conseguir ir longe.

### Aceite verificado (`npm run test:aceite`, 23/23)

- As três zonas diferem em relevo E em densidade de props (costa 35 m de
  desnível contra 10 m do vale; floresta com 7,5× mais árvores). ✅
- Sinal degrada a 1424 m (0.21) e **volta** ao chegar perto da base. ✅
- Avistar um marco o registra no mapa; cada um oferece um desafio curto. ✅
- TAB abre o mapa e o jogo pausa (altura idêntica antes e depois). ✅

## Fase 4 — Missões

- **Conteúdo, não sistema novo.** As cinco missões usam o voo, o mundo e a
  câmera que já existiam. A corrida contratada simplesmente delega pro sistema
  da Fase 2 e observa o resultado.
- **A câmera vira mecânica na inspeção.** Não basta chegar perto: é preciso
  estar na faixa de distância certa E com o ponto centralizado por 1,4 s. É o
  trabalho real de um drone de inspeção, e a única missão que usa para onde a
  lente aponta.
- **O peso da entrega é sentido, não anunciado.** A carga entra como massa no
  modelo de voo: mais inércia de rotação, menos empuxo por quilo, menos
  autoridade pra corrigir, e bateria drenando mais rápido.
- **Pousar exige chegar devagar.** Sem limite de velocidade de toque, "entregar"
  seria despencar em cima do alvo.
- **O alvo da busca NÃO é marcado.** A pista é térmica (barra que esquenta com a
  proximidade) mais fumaça visível só de perto. Marcar no mapa mataria a missão
  inteira — a busca é o conteúdo.
- **Na filmagem, sair do enquadramento drena o contador em vez de zerar.** Perder
  dois segundos numa curva não pode apagar meio minuto de trabalho.
- **Objetivo é sempre UMA linha que muda de estado** ("aproxime", "centralize",
  "segurando…") em vez de lista de tarefas. Se não couber numa linha, a missão
  está mal comunicada — não falta espaço no HUD.
- **Falhar não abre tela de derrota:** R recomeça a missão na hora. Dentro de uma
  missão, R reinicia a missão; fora, reinicia a volta.

### Aceite verificado (`npm run test:aceite`, 28/28)

- Os cinco tipos existem e cada um resume o objetivo em menos de 90 caracteres,
  numa linha só. ✅
- Aceitar pelo número começa a missão na hora. ✅
- Pegar a carga muda o peso do drone de verdade; abortar devolve ao normal. ✅
