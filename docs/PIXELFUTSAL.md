# Pixel Futsal — documentação técnica

Jogo de futsal 3D com estética pixel art: a cena é renderizada em baixa
resolução (180p/270p/360p conforme a qualidade) e ampliada com filtro NEAREST.
Times e jogadores 100% fictícios. Roda no navegador, instala como PWA e
funciona offline depois do primeiro acesso.

- **Fonte e build:** `futsal/` (HTML5 + ES Modules, sem etapa de build)
- **Publicado em:** `https://xxxxsgh.github.io/mathref/futsal/`
- **Stack:** Three.js 0.160 via CDN (jsDelivr, com import map), física escrita
  à mão, Web Audio API (tudo sintetizado), Gamepad API, localStorage
  (configurações) e IndexedDB (saves), Service Worker + manifest.
- **Assets:** nenhum arquivo externo além do Three.js e da fonte Pixelify Sans.
  Modelos, texturas, escudos, uniformes, sons e trilha são procedurais.

## Como rodar

```bash
cd mathref
python3 -m http.server 8000      # ou qualquer servidor estático
# abra http://localhost:8000/futsal/
node futsal/tools/test.mjs       # 53 testes de física, regras e simulação
node futsal/tools/make-icons.mjs # regenera os ícones do PWA
```

O workflow do Pages copia a raiz do repositório por exclusão, então `futsal/`
é publicado sem nenhuma configuração extra.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Canvas, HUD, controles de toque, import map do Three.js |
| `css/style.css` | Interface pixel art, HUD e controles de toque |
| `js/main.js` | Boot, loop (passo fixo de 1/60 s), eventos → áudio/HUD, competições, saves, import/export de times |
| `js/game.js` | Partida: entidades, ações, regras e máquina de estados |
| `js/ai.js` | IA dos times (formações, marcação, pressão, decisões) e do goleiro |
| `js/physics.js` | Bola (quique baixo, rolamento, efeito), traves, rede, área de 6 m |
| `js/render.js` | Renderizador em baixa resolução, 5 ginásios, torcida em InstancedMesh, sombras em blob, efeitos |
| `js/models.js` | Jogadores low-poly e animações procedurais |
| `js/camera.js` | Câmera de TV, câmera atrás do jogador, zoom perto do gol, replay em 3 ângulos |
| `js/input.js` | Teclado (remapeável), toque (joystick + 4 botões) e gamepads |
| `js/audio.js` | Efeitos, torcida reativa, trilha chiptune e narração em português |
| `js/ui.js` | Todas as telas e o HUD |
| `js/career.js` | Pontos corridos, copa mata-mata, carreira (evolução, mercado) |
| `js/data.js` | 16 times fictícios, gerador de elencos, escudos e uniformes em pixel art, ginásios |
| `js/save.js` | Configurações e IndexedDB com fallback em memória |
| `sw.js`, `manifest.json`, `icons/` | PWA |

## Decisões

- **Low-poly com textura pixelada** em vez de sprites de 8 direções: as
  animações (correr, chutar, carrinho, cair, comemorar, mergulho do goleiro)
  saem de rotação de juntas, sem desenhar quadro a quadro, e a renderização em
  baixa resolução dá o visual de pixel art. A torcida segue o mesmo estilo
  (caixas instanciadas que pulam em gols e chances).
- **Física própria**: bola de futsal com restituição baixa (0,42), atrito de
  rolamento alto, efeito lateral proporcional à velocidade e rebote nas traves
  com variação controlada. Condução por "posse" (a bola acompanha o pé), com
  toque mais longo na arrancada (que o marcador pode roubar).
- **Narração via `speechSynthesis` (pt-BR)**: frases-chave com variações e sem
  repetir a anterior. A qualidade depende da voz instalada no aparelho.
- **Cronômetro parado**: só corre com a bola em jogo. A duração configurada
  (2, 4, 6 ou 10 min) é por tempo e o relógio mostra o tempo real restante. A
  expulsão dura 10% do tempo (os "2 minutos" de um tempo de 20), no mínimo 30 s.

## Regras implementadas

| Regra | Onde |
|---|---|
| 5 x 5, substituições ilimitadas e volantes | `Match.substitute`, pausa → Substituições; a CPU troca quem está cansado nas bolas paradas e no intervalo (`cpuSubs`) |
| Lateral com o pé, bola parada na linha; não vale gol direto | `ballOut`, `setupRestart`, `goalScored` (`restartTouch.indirect`) |
| Tiro de meta com a mão do goleiro | `setupRestart` (`ball.holder`), `doThrow` |
| 4 segundos em cobranças e para o goleiro na própria metade | `updateRules` (`restart.clock`, `gkTimer`), `fourSecondViolation` |
| Faltas acumuladas por tempo; da 6ª em diante tiro livre sem barreira (10 m) | `foul`, zera em `nextPeriod` |
| Barreira a 5 m nos tiros livres próximos do gol | `buildWall`, `enforceDistances` |
| Pênalti na marca dos 6 m | `foul` (falta dentro da área), `layoutPenalty` |
| Sem impedimento | — |
| Goleiro-linha | `toggleKeeperOut` (tecla G, pausa → Tática); a CPU usa quando perde por 1 ou 2 gols no fim, e o goleiro volta correndo ao perder a posse |
| Amarelo, segundo amarelo, vermelho; time com 1 a menos até o tempo acabar ou sofrer gol | `giveCard`, `sendOff`, `endShort` |
| Goleiro não pega com a mão bola recuada por companheiro | `tryPossession` (`gkHands`) |
| Mata-mata: prorrogação opcional + pênaltis (5 cobranças e morte súbita) | `endPeriod`, `startShootout`, `updateShootout` |

## Controles

- **Toque:** joystick à esquerda; PASSE, CHUTE, DRIBLE e TROCA à direita
  (tamanho, opacidade e posição ajustáveis em Configurações).
- **Teclado:** WASD/setas, J passe, K chute, L drible/arrancada, I troca/desarme,
  Shift arrancada, Q/E/R chapéu/elástico/pisada, G goleiro-linha, Esc pausa.
  Tudo remapeável. No multijogador, o 2º jogador pode usar setas + N M , .
- **Gamepad:** A passe, X chute, B troca/desarme, Y profundidade, LB drible,
  RB/RT arrancada, LT modificador, analógico direito para os lances especiais.

Combinações: passe segurado = pelo alto; passe com DRIBLE segurado = em
profundidade; chute segurado = força; toque rápido = bico; CHUTE com DRIBLE =
colocado (ou cavadinha se fraco). DRIBLE: segurar = arrancada, toque = finta,
parado = pisada, para trás = elástico, dois toques = chapéu, parado segurando
= proteger a bola. Sem bola: TROCA = bote perto do adversário ou trocar de
jogador, segurar TROCA = pressão com um companheiro, CHUTE = carrinho.

## IA

- Formações 3-1, 2-2, 4-0 (rodízio) e 1-2-1 (losango), com posições que se
  deslocam com a bola; marcação por zona ou individual; postura recuo, normal
  ou pressão alta (com segundo homem perto do gol).
- Quem conduz avalia chute (distância, ângulo, bloqueios, goleiro adiantado),
  passe (linha livre, espaço do receptor, progressão; rasteiro, por cima ou em
  profundidade) e condução, com dribles quando o marcador encosta.
- Companheiros sem bola procuram espaço livre e linha de passe; o pivô ataca a área.
- Goleiro: fecha o ângulo, sai em bola solta na área, mergulha com tempo de
  reação pelo atributo Reflexo, segura ou espalma para os lados, repõe com a
  mão, escolhe um canto nos pênaltis.
- Dificuldade (Fácil, Normal, Difícil, Craque) muda reação, frequência de
  decisão, erro de passe e chute, velocidade, botes, esquiva e reflexo do
  goleiro. Nos níveis baixos a CPU erra passes, dá bote afobado, demora na
  cobrança e o goleiro às vezes solta a bola.

## Testes

`node futsal/tools/test.mjs` roda 53 checagens com `Math.random` semeado:
física da bola, partidas completas CPU x CPU nas 4 dificuldades (terminam, sem
NaN, bola nunca presa por mais de 3 s), disputa de pênaltis, prorrogação,
expulsão e retorno, 6ª falta, pênalti, lateral, tiro de meta, escanteio, 4
segundos, gol direto de cobrança indireta, substituição, campeonato, copa de 16
e 3 temporadas de carreira.

## Limitações conhecidas

- Testado em Chromium (desktop e emulação de celular com toque). Safari iOS,
  Android e gamepads reais ainda precisam de teste em aparelho.
- Sem lei da vantagem; a regra de recuo para o goleiro é simplificada.
- A narração depende das vozes do sistema e pode ficar muda em aparelhos sem
  voz em português.
