# Feature `hud` — HUD e frontend

Dona de: `src/features/hud/` e do estilo de `index.html`. Ordem 90.

## O que tem

| Parte | Arquivo | Notas |
|---|---|---|
| Fonte vetorial própria | `font.js` | traço único, cantos chanfrados, condensada; mesmo desenho em SVG (DOM) e Canvas 2D. Duas faces: regular (rótulos/títulos) e **pesada** (`heavy: true`, glifos alargados e traço ~2× para números/valores). Piso de legibilidade: caixa-alta ≥ 11 px e traço ≥ ~1,45 px. Sem fontes baixadas. |
| Ícones | `icons.js` | granadas, cabeça (headshot), caveira, patentes, silhuetas por arma no feed (fuzil do jogador, fuzil hostil, pistola, faca, granada) e **medalhas em camadas metálicas** por raridade (bronze/escudo, prata/asas, ouro/estrela) |
| Arte de perfil | `art.js` | *calling cards* procedurais (paisagem em camadas, sol com raios, silhuetas, título) e emblemas metálicos por semente |
| Operador do menu | `hero.js` | soldado criado por `services.enemies.spawn`, retirado da IA/colisão/cena e renderizado num WebGLRenderer próprio com luz de estúdio, sobre o mundo desfocado/graduado (filtro CSS no canvas); descartado ao sair do menu |
| Silhueta/prévia da arma | `gunsmith.js` | a silhueta do painel de munição/feed é **renderizada do modelo 3D real** (`services.weapon.gun`, sem mãos) — versão chapada (feed) e sombreada por normal com contorno (painel de munição); o loadout mostra o modelo girando num `WebGLRenderer` próprio com `RoomEnvironment` (descartado ao sair da tela) |
| HUD de combate | `play.js` | mira com bloom (velocidade, pulo, disparo; some em ADS/sprint), hitmarker com *punch* — normal branco / headshot âmbar / abate vermelho com anel e estilhaços; indicadores direcionais em cunha afunilada num anel de 150 px ao redor da mira (degradê, brilho, cauda) + brilho de borda na direção do atacante; vinheta de vida por máscara de borda (centro ~60% limpo) + dessaturação e pulso de impacto; XP ancorado sob a mira com placa escura; medalhas; feed com placa, faixa de destaque e ícone por arma/headshot; placar/timer; painel da arma (silhueta sombreada, número em face pesada, carregador em blocos inclinados de 5 cartuchos com preenchimento parcial, estados LOW AMMO/EMPTY/RELOADING), equipamentos, vida com barra de "dano atrasado", sequência |
| Bússola | `compass.js` | faixa de 160°, marcas de 5°, cardeais, rumo, pings vermelhos de inimigos que dispararam |
| Minimapa | `minimap.js` | circular; planta **rasterizada dos colisores estáticos** classificada por material/altura (pista com faixa tracejada, calçadas, prédios em ardósia azulada com hachura diagonal, contorno claro, sombra projetada e elevação, coberturas); bisel giratório com marcas de 10° e N/E/S/W; cone de visão; anéis de distância; pings de disparo inimigo presos à borda |
| Telas | `menus.js` | principal (operador iluminado sobre o mundo desfocado, cartão do jogador com *calling card*, desafios, evento e arma em destaque), loadout, configurações, pausa, placar (Tab), **relatório pós-ação** (placar por equipes, classificação completa, nêmesis, estatísticas da arma, medalhas, progressão) |
| Regras | `match.js` | ELIMINATION: 30 abates em 10:00 contra o esquadrão hostil; renascer em 4 s no ponto mais seguro; regeneração de vida após 4,2 s sem dano; XP, medalhas (double/triple, headshot, longshot, payback, sequência) |
| Configurações | `settings.js` | sensibilidade (+ multiplicador em ADS), inverter Y, preset de qualidade, FOV horizontal, volume, cor da mira, minimapa girando — salvas em `localStorage` (com try/catch) |

Toda a interface é diagramada numa prancheta 1920×1080 (`.stage`) escalada
por `transform` — medidas do CSS são as do layout de referência.

## Fluxo

`menu` → **DEPLOY** (`match.start`, pose de spawn, `time.scale = 1`, pede
pointer lock) → `play`. Perder o pointer lock (Esc) abre a **pausa**
(`time.scale = 0`, `input.enabled = false`, `input.wantsLock = false` para
cliques nos menus não capturarem o mouse). Morte → tela KIA → renasce.
Fim (alvo atingido ou tempo) → relatório; perfil (XP, abates…) salvo.

## Serviço `hud`

`root`, `setMenu(bool)`, `setVisible(bool)`, `open(nomeDaTela|null)`,
`screen`, `match` (estado da partida), `settings`, `loadout` (escolhas do
gunsmith — a feature weapon pode ler), `banner(título, sub)`, `deploy()`.

Evento emitido: `match:start` `{ mode }`.

## QA visual

- `?shot=combat` — partida pré-populada (feed, placar, XP, hitmarker de
  abate) e acertos **só visuais** convertidos de disparos inimigos (no modo
  shot os inimigos não ferem o jogador, para não mexer na câmera de outras
  features).
- `&ui=main|loadout|settings|pause|scoreboard|end|death` abre uma tela em
  qualquer preset, ex.: `--params "shot=menu&ui=end"`.
