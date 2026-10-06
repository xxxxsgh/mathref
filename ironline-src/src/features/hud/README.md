# Feature `hud` — HUD e frontend

Dona de: `src/features/hud/` e do estilo de `index.html`. Ordem 90.

## O que tem

| Parte | Arquivo | Notas |
|---|---|---|
| Fonte vetorial própria | `font.js` | traço único, cantos chanfrados, condensada; mesmo desenho em SVG (DOM) e Canvas 2D. Duas faces: regular (rótulos/títulos) e **pesada** (`heavy: true`, glifos alargados e traço ~2× para números/valores). Piso de legibilidade: caixa-alta ≥ 11 px e traço ≥ ~1,45 px. Sem fontes baixadas. |
| Ícones | `icons.js` | granadas, cabeça (headshot), caveira, patentes, silhuetas por arma no feed (fuzil do jogador, fuzil hostil, pistola, faca, granada) e **medalhas em camadas metálicas** por raridade (bronze/escudo, prata/asas, ouro/estrela) |
| Arte de perfil | `art.js` | *calling cards* procedurais (reserva enquanto não há foto) e emblemas metálicos por semente — a silhueta varia (escudo, roundel com rebites, losango, hexágono) |
| Fotos de campo | `photo.js` | a arte dos cartões (evento, banner do perfil, recompensa do passe, cartão do relatório) é FOTOGRAFADA do próprio mapa: a câmera segura uma pose por 3 frames (TAA/AO/exposição convergem), o canvas do pipeline completo é copiado e graduado (exposição normalizada, leve dessaturação, curva em S, vinheta, grão). Fora do modo shot isso acontece atrás da tela de carga |
| Operador do menu | `hero.js` | soldado criado por `services.enemies.spawn`, retirado da IA/colisão e posto NO MUNDO, de pé na rua diante da câmera do menu (sol, sombras, AO, névoa e gradação do pipeline real + sombra de contato). Lente de ~85 mm (`fovFactors` → FOV vertical 26°) e câmera à altura da cintura (`viewOffset`, somado depois da feature movement); 3/4 voltado para o sol. Profundidade de campo: `.dof` (backdrop-filter) mascarado por uma elipse que acompanha a projeção do soldado |
| Silhueta/prévia da arma | `gunsmith.js` | a silhueta do painel de munição/feed é **renderizada do modelo 3D real** (`services.weapon.gun`, sem mãos) — versão chapada (feed) e sombreada por normal com contorno (painel de munição); o loadout mostra o modelo girando num `WebGLRenderer` próprio com `RoomEnvironment` (descartado ao sair da tela) |
| HUD de combate | `play.js` | mira com bloom (velocidade, pulo, disparo; some em ADS/sprint), hitmarker com *punch* — normal branco / headshot âmbar / abate vermelho com anel e estilhaços; indicadores direcionais em cunha afunilada num anel de 150 px ao redor da mira (degradê, brilho, cauda) + brilho de borda na direção do atacante; vinheta de vida por máscara de borda (centro ~60% limpo) + dessaturação e pulso de impacto; XP ancorado sob a mira com placa escura; medalhas; feed com placa, faixa de destaque e ícone por arma/headshot; placar/timer; painel da arma (silhueta sombreada, número em face pesada, carregador em blocos inclinados de 5 cartuchos com preenchimento parcial, estados LOW AMMO/EMPTY/RELOADING), equipamentos, vida com barra de "dano atrasado", sequência |
| Bússola | `compass.js` | faixa de 160°, marcas de 5°, cardeais, rumo, pings vermelhos de inimigos que dispararam |
| Minimapa | `minimap.js` | circular; planta **rasterizada dos colisores estáticos** classificada por material/altura (pista com faixa tracejada, calçadas, prédios em ardósia azulada com hachura diagonal, contorno claro, sombra projetada e elevação, coberturas); bisel giratório com marcas de 10° e N/E/S/W; cone de visão; anéis de distância; pings de disparo inimigo presos à borda. "Foto aérea" (render ortográfico da cena real) só em GPU de verdade — em render por software (SwiftShader/llvmpipe, detectado por `quality.device.gpuClass` ou pelo RENDERER do contexto) é pulada (bloqueava 60–80 s); `?mmaerial=1` força em 1/4 da área do canvas, `?mmaerial=0` desliga |
| Modos | `modes.js` | **lógica pura**: FRONTLINE / HARDPOINT / SURVIVAL, overrides de URL, captura da zona (`zoneStep`), escolha da zona (`pickZone`) |
| Progressão | `progression.js` | **lógica pura**: curva de XP/níveis, tabela de desbloqueios (armas da weapon, atordoante, acessórios, camuflagens), XP de fim de partida, saneamento do loadout |
| Objetivos | `objective.js` | anel da zona NO MUNDO (aro, preenchimento hachurado, arco de captura, coluna de luz; cor pelo dono, pisca contestada), painel do objetivo sob a bússola (estado, cabo de guerra da captura, barra de posse), marcador projetado "A" com distância (preso às bordas), barra de vida do chefe |
| Camuflagens | `camo.js` | 6 padrões procedurais em canvas (woodland, digital urbano, tigre, ártico, brasa, dourado) aplicados nos materiais `receiver`/`tan` de `services.weapon.materials` (encadeia o `onBeforeCompile` da weapon e troca a cor base por amostragem triplanar antes do desgaste) |
| Miniaturas de mapa | `mapthumb.js` | planta esquemática em SVG de cada mapa para o seletor |
| Telas | `menus.js` | principal (operador iluminado sobre o mundo desfocado, cartão do jogador com *calling card*, desafios, evento e arma em destaque), loadout, configurações, pausa, placar (Tab), **relatório pós-ação** (placar por equipes, classificação completa, nêmesis, estatísticas da arma, medalhas, progressão) |
| Regras | `match.js` | motor de ondas dos três modos (ver abaixo); renascer em 4 s no ponto mais seguro (emite `player:respawn` — a weapon reabastece); regeneração de vida após 4,2 s sem dano; XP, medalhas (double/triple, headshot, longshot, payback, sequência, GIANT SLAYER), XP de objetivo |
| Tipografia/ícones | `font.js`, `.mono` | face primária vetorial própria (títulos/valores) + face secundária monoespaçada do sistema para metadados e leituras de dados (`mono()` em menus.js); desafios com anel de progresso (`challengeSVG`); fundo do relatório com carta topográfica procedural (curvas de nível anti-serrilhadas) |
| ARSENAL | `arsenal.js`, `arsenal-style.js` | telas do inventário sobre `services.inventory` (ver abaixo) |
| Arte de itens | `itemart.js` | silhuetas de perfil das 7 armas e 5 facas, os 12 padrões de skin (semente + desgaste), miniaturas, arte das caixas, chaveiros, adesivos, ícones de crédito/chave |
| Visualizador 3D | `viewer.js` | `ItemViewer` (WebGLRenderer próprio, RoomEnvironment, pedestal com anel da raridade, arrastar/roda/duplo clique) + `buildItemModel`: `weapon.buildPreview(item)` com reserva local (KR-9 clonado ou silhueta extrudada com a textura do padrão) |
| Configurações | `settings.js` | sensibilidade (+ multiplicador em ADS), sensibilidade da mira por toque (só em `input.touchMode`, aplicada por `services.touch.setSensitivity`), inverter Y, qualidade (`auto` — padrão, comparada com `quality.setting` — ou preset fixo), FOV horizontal, volume, cor da mira, minimapa girando — salvas em `localStorage` (com try/catch) |

Toda a interface é diagramada numa prancheta 1920×1080 (`.stage`) escalada
por `transform` — medidas do CSS são as do layout de referência.

## ARSENAL (inventário, caixas, passe…)

Aba **ARSENAL** no topo (selo com itens novos / diário disponível), botão no
menu principal e tecla `I`. Carteira (créditos, chaves, aviso de diário) no
topo de todas as telas. Subabas (`<`/`>` ou Q/E):

- **INVENTÁRIO** — grade com filtros (tipo, raridade, arma), busca, ordenação
  (recentes, raridade, nome, desgaste), selos NOVO/equipado, sucatear
  duplicatas; clicar abre a **inspeção 3D** (arrastar gira com inércia, roda
  dá zoom, duplo clique redefine) com condição, valor de desgaste, barra das
  faixas, semente, origem, registro, valor de sucata, equipar/sucatear
  (chaveiros/adesivos escolhem a arma).
- **CAIXAS** — 3 caixas com arte, botões ABRIR · 1 CHAVE / · 300 CR, tabela
  de chances publicada (raridade, itens, chance, chance por item) e conteúdo.
  Abrir = roleta horizontal (60 itens, prêmio no 51º, 6,6 s de desaceleração
  `1 − (1 − t)^4,2`, tique sintetizado a cada item que passa pelo marcador —
  `services.audio.context` ou WebAudio próprio), facas aparecem como "?"
  dourado, clarão da cor da raridade e revelação 3D com nome, raridade,
  desgaste e semente; GUARDAR / EQUIPAR / SUCATEAR / ABRIR OUTRA.
- **CONTRATO** — 10 itens de uma raridade → 1 da seguinte, com resultados
  possíveis e chances; PREENCHER automático; resultado revelado como na caixa.
- **PASSE** — 30 níveis só na trilha gratuita (sem trilha paga), RESGATAR.
- **DIÁRIO** — calendário de 7 dias com sequência (hora local).
- **MAESTRIA** — abates por arma e as 4 camuflagens de maestria.
- **COLEÇÃO** — álbum por caixa (itens não obtidos em silhueta) e % geral.
- **PERFIL** — cartão de chamada e emblema (procedurais, `art.js`) usados no
  topo, no placar e no relatório.

O **loadout** escolhe primária/secundária entre TODAS as armas de
`weapon.weapons` (cadeado por nível) e a faca entre as possuídas; mostra a
skin equipada. O **relatório** mostra os créditos ganhos (com composição) e o
avanço do passe; a hud emite `match:end` { win, kills, headshots, captures,
waves, bossKilled, medals, playTime, xp } para o inventário.

HUD de combate (contrato v3): `medal:award` { id, name, xp, icon } entra na
fila de medalhas (até 3) e soma XP/medalha no relatório (as que a partida já
dá — multiabate, headshot, longshot, payback, sequência — não somam de novo e
o toast local some quando a feature streaks está ativa); barra de
**killstreaks** à direita, acima da arma, por `streak:ready`/`streak:used`
{ id, name, kills, key? } e `services.streaks.slots()` se existir (carga pela
sequência atual, PRONTO pulsando com a tecla); `player:slide` +
`ctx.player.sliding` dão a medalha **SLIDE KILL** (só se a streaks não mandar
a dela). Glifos novos de medalha: slide, mastery, airstrike, uav, shield. A
fonte vetorial ganhou maiúsculas acentuadas (Á À Â Ã É Ê Í Ó Ô Õ Ú Ü Ç).

QA (URL): `?inv=open` ou `&ui=arsenal`; `&arsenal=inventario|caixas|contrato|
passe|diario|maestria|colecao|perfil`; `&inspect=N` (N-ésimo item da grade);
`?case=1&seed=N` abre a caixa 1 com semente fixa (`&reelt=2.4` congela a
roleta nesse instante, `&reveal=1` pula para a revelação); `&trade=1`
contrato preenchido; `&ivview=yaw,pitch,dist` ângulo do visualizador;
`&ks=1` no preset combat encena a barra de killstreaks + medalha externa. No
modo shot o inventário é o de demonstração (determinístico).

## Custo (carga e por quadro)

- `init` assíncrono em blocos com `await ctx.bootProgress(...)` (estilo, HUD
  de combate, camuflagem, telas, regras, menu); tempos por bloco em
  `hud.__s.bootTimes` (`?bootlog=1` também loga). A silhueta 3D da arma
  (contexto WebGL próprio) e o operador do menu saem do init: são feitos nos
  primeiros quadros do menu, junto com o grão de filme e a arte dos cartões
  (`screens.finishBoot()`): canvas 2D no meio da carga sincroniza com a GPU
  ocupada compilando shaders e travava >10 s no celular. No tier `lite` não
  há operador nem fotos de campo; fora do desktop as fotos saem com 480 px.
- Arte do ARSENAL (miniaturas, caixas, cartões) é preguiçosa (só ao abrir a
  aba) e com superamostragem 1× fora do desktop; o visualizador 3D usa DPR 1
  fora do desktop. Planta do minimapa a 4 px/m (teto 2048) fora do desktop.
- Por quadro: bússola e minimapa redesenhados a ~20 Hz; DOM só muda quando
  o valor muda (`set`); nenhuma leitura de layout no quadro (tamanho da
  prancheta guardado em `layout()`); a camada de desaturação sai do DOM quando
  invisível; `.lowfx` (qualidade baixa, celular, lite) desliga todo
  `backdrop-filter` (desfoques de fundo, profundidade de campo do menu).

## Modos (menu principal → cartões de modo; `?mode=waves|hardpoint|survival`)

O modo escolhido fica no perfil (sobrevive à recarga ao trocar de mapa).

| Modo | Regras | Vitória | Derrota |
|---|---|---|---|
| **FRONTLINE** (`waves`, eliminação) | 5 ondas (4-5-6-7-8) em 10:00 | limpar a última onda | relógio zerar |
| **HARDPOINT** (`hardpoint`, defesa) | zona marcada (raio 4,5 m) entre o nascimento do jogador e as entradas inimigas (ou `world.hardpoints`/`world.zones[0]`, se o mapa publicar), deslocada até um ponto livre e andável; ondas sem fim (3-4-4-5-5-6, depois +1 a cada 2); ~2/3 de cada onda é o grupo de assalto que vai para a zona (`enemies.setObjective`) | 90 s de posse (`?hold=s`) | hostis tomarem a zona ou relógio (7:00) zerar |
| **SURVIVAL** (`survival`) | 3-4-5-6 hostis e a onda final com o **JUGGERNAUT** + escolta; 3 vidas (`?lives=n`) | limpar a onda do chefe | esgotar as vidas (ou 20:00) |

Captura (`modes.zoneStep`, testada): `cap` ∈ [−1, 1]; jogador sozinho na
zona sobe 1/5 s (zona hostil leva o dobro para virar), hostis sozinhos descem
1/9 s (+35 % por hostil extra, até 2,4×), os dois = **contestada** (nada
muda, posse não pontua), ninguém = volta devagar ao dono. Posse = `cap` 1;
a posse pontua mesmo fora do anel enquanto ninguém contesta.

XP de objetivo (`progression.XP`): zona tomada 250, a cada 5 s de posse 25,
onda limpa 150, chefe 1000; vitória 1500 / derrota 300.

## Progressão (perfil `ironline.profile.v1`, localStorage com try/catch)

Nível 1 → 55, `need(lv) = 2500 + 220·lv` (nível 1: 2500). Desbloqueios
derivados do nível (nada de lista salva): armas de `services.weapon.weapons`
(as duas primeiras já no loadout; extras a partir do 7), **atordoante** (3),
acessórios do gunsmith (compensador 3, empunhadura angulada 5, HOLO-2 8,
supressor 11) e **camuflagens** (woodland 2, digital 4, tigre 6, ártico 9,
brasa 14, dourado 20). O loadout mostra cadeado + nível em cada item
trancado, o seletor de camuflagem e o próximo desbloqueio; o relatório
mostra os desbloqueios novos e um toast de LEVEL UP. Escolhas inválidas
para o nível voltam ao padrão ao carregar (`sanitizeLoadout`).

**Gancho pedido à feature weapon**: `setTacticals(n)` (como `setGrenades`)
para a atordoante trancada sair do inventário de verdade — a HUD já chama
`weapon.setTacticals?.(0)` no início da partida e a cada renascimento.

## Seletor de mapa

Cartões no painel direito do menu (planta esquemática, nome, descrição; o
mapa carregado em destaque). Clicar em outro (ou `M`) mostra o aviso de
carga e chama `services.world.setMap(id)` (recarrega com `?map=`). Poses das
fotos de campo: as da rua; nos outros mapas `world.photoPoses` ou as poses
de screenshot do mapa.

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

Eventos emitidos: `match:start` `{ mode }`, `match:wave` `{ wave, of, count, boss, mode }`
(`of = 0` no HARDPOINT, ondas sem fim), `match:waveClear` `{ wave, of, mode }` (a
feature audio toca sirene/caça na chegada da onda e respiro/equipamento ao
limpar), `match:boss` `{ enemy }` (chefe em campo), `player:respawn` `{ position }`.

## Motor de ondas

`match.js` conduz a população durante a partida: no DEPLOY desliga a
reposição automática do esquadrão (`services.enemies.auto = false`), limpa o
mapa e solta as ondas (no máximo `MODE.maxAlive` vivos ao mesmo tempo) pelos
`world.enemySpawns` longe do jogador. O placar se adapta ao modo (posse da
zona / hostis na zona; abates / vidas). Parâmetros de teste: `?mode=`,
`?waves=1,1` (ondas), `?wi=1` (intervalo entre ondas, s), `?mt=300` (tempo da
partida, s), `?hold=s`, `?lives=n` — usados por `tools/e2e.mjs`.

## QA visual

- `?shot=combat` — partida pré-populada (feed, placar, XP, hitmarker de
  abate) e acertos **só visuais** convertidos de disparos inimigos (no modo
  shot os inimigos não ferem o jogador, para não mexer na câmera de outras
  features).
- `&ui=main|loadout|settings|pause|scoreboard|end|death` abre uma tela em
  qualquer preset, ex.: `--params "shot=menu&ui=end"`.
- `&mode=hardpoint` no preset `combat`: zona encenada 8,5 m à frente da
  câmera, capturando (anel, painel e marcador); `&mode=survival&boss=1`: o
  juggernaut entra na cena de combate com a barra de chefe.
- `&pxp=N` muda o XP do perfil de demonstração (padrão 26000 = nível 8,
  desbloqueios parciais); `&camo=id` escolhe a camuflagem; `&ui=end` mostra o
  toast de subida de nível (`&lvup=0` desliga).
