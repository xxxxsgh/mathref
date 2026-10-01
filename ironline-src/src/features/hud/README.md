# Feature `hud` — HUD e frontend

Dona de: `src/features/hud/` e do estilo de `index.html`. Ordem 90.

## O que tem

| Parte | Arquivo | Notas |
|---|---|---|
| Fonte vetorial própria | `font.js` | traço único, cantos chanfrados, condensada; mesmo desenho em SVG (DOM) e Canvas 2D. Sem fontes baixadas. |
| Ícones | `icons.js` | granadas, cabeça (headshot), caveira, patentes, medalhas, silhueta-reserva da arma |
| Silhueta/prévia da arma | `gunsmith.js` | a silhueta do painel de munição/feed é **renderizada do modelo 3D real** (`services.weapon.gun`, sem mãos); o loadout mostra o modelo girando num `WebGLRenderer` próprio com `RoomEnvironment` (descartado ao sair da tela) |
| HUD de combate | `play.js` | mira com bloom (velocidade, pulo, disparo; some em ADS/sprint), hitmarker normal / headshot (âmbar) / abate (vermelho + anel), indicadores de dano direcionais que acompanham a fonte, vinheta de vida procedural + dessaturação nas bordas (`backdrop-filter`), flash de impacto, XP (+100 ENEMY KILLED…), medalhas, banner de objetivo, feed de abates, placar/timer, painel da arma (silhueta, munição, reserva, ticks do carregador, modo de tiro, aviso de recarga), equipamentos, vida com barra de "dano atrasado", sequência |
| Bússola | `compass.js` | faixa de 160°, marcas de 5°, cardeais, rumo, pings vermelhos de inimigos que dispararam |
| Minimapa | `minimap.js` | planta **rasterizada dos colisores estáticos** (`ctx.collision`), gira com o jogador, cone de visão, norte, pings de disparo inimigo |
| Telas | `menus.js` | principal (sobre a cena ao vivo, câmera lenta à deriva, grão de filme), loadout, configurações, pausa, placar (Tab), fim de partida (vitória/derrota, desempenho, medalhas, progressão) |
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
