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
| Configurações | `settings.js` | sensibilidade (+ multiplicador em ADS), sensibilidade da mira por toque (só em `input.touchMode`, aplicada por `services.touch.setSensitivity`), inverter Y, qualidade (`auto` — padrão, comparada com `quality.setting` — ou preset fixo), FOV horizontal, volume, cor da mira, minimapa girando — salvas em `localStorage` (com try/catch) |

Toda a interface é diagramada numa prancheta 1920×1080 (`.stage`) escalada
por `transform` — medidas do CSS são as do layout de referência.

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
