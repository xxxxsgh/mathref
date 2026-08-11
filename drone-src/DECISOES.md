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
