# IRONLINE

FPS militar original em primeira pessoa feito com Three.js + Vite. IP
própria: nenhum nome, logotipo, marca ou asset de jogos existentes. Todo o
conteúdo — geometria, texturas, sons, fontes, ícones — é gerado em código.

- Jogo publicado: `/mathref/ironline/`
- Fonte: [`ironline-src/`](../ironline-src)
- Build: `ironline/` na raiz do repositório (gerado por `npm run build` e pelo workflow do Pages)
- Contrato núcleo ↔ features (fonte da verdade): [`ironline-src/CONTRACT.md`](../ironline-src/CONTRACT.md)
- Cada feature tem um `README.md` próprio em `ironline-src/src/features/<nome>/`

## Arquitetura

```
ironline-src/
├── index.html            # #app (canvas) + #ui (DOM da HUD)
├── vite.config.js        # base '/mathref/ironline/', outDir '../ironline'
├── CONTRACT.md           # contrato entre núcleo e features
├── src/
│   ├── main.js           # monta o núcleo, descobre e roda as features
│   ├── core/             # núcleo (sem conteúdo de jogo)
│   │   ├── Bus.js        # barramento de eventos
│   │   ├── FixedStep.js  # loop de passo fixo (1/60 s) + interpolação
│   │   ├── Input.js      # teclado/mouse, pointer lock, ações mapeadas, simulate()
│   │   ├── Collision.js  # mundo de colisão AABB em grade, cápsula, raycast de balas
│   │   ├── Player.js     # estado do jogador, câmera, canais viewOffset/viewKick/fovFactors
│   │   ├── Quality.js    # presets low/medium/high/ultra
│   │   ├── Renderer.js   # WebGLRenderer (sRGB, ACES, sombras)
│   │   ├── Rng.js        # RNG semeado (mulberry32)
│   │   └── Shots.js      # presets do modo screenshot
│   └── features/         # todo o conteúdo, uma pasta por feature
└── tools/                # unit.test.mjs, shot.mjs, e2e.mjs
```

### Núcleo + features plugáveis

O núcleo (`src/core/` + `src/main.js`) cuida só da infraestrutura: renderer,
cena e câmeras (mundo + viewmodel desenhada por cima), loop de passo fixo,
entrada, colisão, jogador, eventos e qualidade. Todo o jogo vem de features
descobertas por `import.meta.glob('./features/*/index.js')`. Cada feature
exporta `{ name, order, init, update, frame, dispose }`:

- `init(ctx)` (pode ser async) roda em ordem crescente de `order`;
- `update(dt)` roda no passo fixo de 1/60 s (lógica, física, IA);
- `frame(dt)` roda por frame de render (visual, interpolação);
- cada chamada fica em try/catch próprio: uma feature que lança é desligada
  sem derrubar as outras, e o erro vai para `ctx.errors`.

As features não importam arquivos umas das outras: conversam por
**serviços** (`ctx.provide` / `ctx.services`) e por **eventos** no bus
(`weapon:fire`, `weapon:hit`, `enemy:death`, `player:damage`, `match:wave`…).
A feature `rendering` assume o render inteiro pelo gancho
`ctx.setRenderPipeline` e compõe a viewmodel com `ctx.renderViewmodel`.

| Ordem | Feature | Responsabilidade |
|---|---|---|
| 10 | `world` | mapas (`?map=street\|factory`): MERIDIAN STREET ("Distrito Velho" no código — avenida destruída, prédios paramétricos, interior jogável) e FOUNDRY 9 (fundição abandonada em vários níveis); props modelados de perto (carros com interior, mobília, caçambas, caixas, sacos, entulho em camadas), fogo, fumaça, vegetação, céu, materiais PBR procedurais e colisores |
| 20 | `rendering` | compositor HDR: céu físico, sombras PCSS, GI de 1 rebatimento (RSM), AO, volumétrico, bloom, TAA, exposição automática, tonemap e gradação |
| 25 | `audio` | áudio 100% sintetizado (WebAudio): tiro em camadas, HRTF, estalo supersônico, passos por superfície, reverb por convolução, ambiente |
| 30 | `movement` | locomoção: sprint, sprint tático (duplo toque, estamina), slide (cancel, slide-jump, slide kick, rampa, sob obstáculo, para cobertura, tiro deslizando), dolphin dive, mantle/vault (→ slide), pendurar/subir, montar arma, lean; bob, faíscas/poeira/som por superfície e corpo visível com IK |
| 40 | `weapon` | loadout na viewmodel (design original): fuzil KR-9, pistola P-11, faca TK-7, granadas de fragmentação e atordoante; hitscan, recuo, ADS, recargas, troca com guarda/saque, golpe com investida, granadas com física e dano em área; mãos enluvadas anatômicas com skinning |
| 45 | `inventory` | créditos, 3 caixas com chances publicadas (só chaves/créditos ganhos jogando), inventário, equipamento de skins/faca/chaveiros/adesivos, contrato de troca, sucata, diário, passe gratuito, maestria, coleção, cartões e emblemas (telas na `hud`, aba ARSENAL) |
| 50 | `enemies` | soldados procedurais (4 variantes), animação procedural, ragdoll Verlet, IA de esquadrão com cobertura e A*; classes especiais (arrombador, atirador de elite, escudeiro, socorrista), reações (supressão, sobressalto, granadas, callouts), barris/botijões explosivos e execução |
| 55 | `streaks` | killstreaks (UAV, morteiro com designador, torreta, drone armado/kamikaze), 25 medalhas, execução em 3ª pessoa, killcam e modo foto |
| 60 | `vfx` | partículas na GPU, impactos por material, clarões, traçantes, cápsulas, marcas de tiro, explosões |
| 90 | `hud` | HUD de combate, bússola, minimapa, menus (principal, loadout, configurações, pausa, placar, relatório pós-ação), regras da partida |
| 95 | `touch` | controles de toque (celular/tablet): joystick, mira por arrasto, botões de ação, tela cheia e aviso de paisagem |

## Funcionalidades

- **Três modos** (cartões no menu principal; `?mode=`):
  - **FRONTLINE** (eliminação): 5 ondas (4-5-6-7-8 = 30 hostis) em 10
    minutos. Limpar a última onda vence; o relógio zerar perde.
  - **HARDPOINT** (defesa): tomar e segurar uma zona marcada no chão (anel
    no mundo, marcador na tela, barras de captura e posse) contra ondas sem
    fim que convergem para ela. 90 s de posse vencem; hostis tomando a zona
    (ou 7 minutos) perdem.
  - **SURVIVAL**: ondas crescentes com 3 vidas; a última traz o
    **JUGGERNAUT** — soldado blindado (placas, viseira, metralhadora leve,
    1600 de vida, lento) com barra de chefe. Limpar a onda do chefe vence.
  Renascimento em 4 s no ponto mais seguro, regeneração de vida, XP,
  medalhas e relatório pós-ação com estatísticas por modo.
- **Progressão**: perfil em `localStorage` — XP de abates, headshots,
  medalhas e objetivos; 55 níveis; desbloqueios por nível (atordoante,
  acessórios, camuflagens procedurais da arma, armas extras publicadas pela
  feature weapon) com cadeados no loadout, toast de LEVEL UP e lista de
  desbloqueios no relatório.
- **Seletor de mapa** no menu (cartões com planta, nome e descrição; o mapa
  atual em destaque) — troca recarregando com `?map=`.
- **Dois mapas** (seleção por `?map=`, ver [Mapas](#mapas)):
  - **MERIDIAN STREET** (`street`, padrão): rua, cruzamento, ruela, posto
    de controle e o térreo jogável do prédio R4.
  - **FOUNDRY 9** (`factory`): fundição abandonada — galpão de máquinas com
    ponte rolante, passarelas a 4,5 m, ponte sobre o galpão, escritórios de
    dois pisos com vidraça quebrada e pátio de carga com doca, carreta e
    contêineres.
- **Loadout**: fuzil KR-9 (automático, 760 rpm, holográfica sem paralaxe) e
  pistola P-11 (semiautomática, ferrolho que trava aberto vazio, miras de 3
  pontos) com troca animada (1/2, roda, X), recuo com molas, recarga
  tática/vazia por arma, inspeção; faca de combate (V) com investida no
  inimigo à frente; granada de fragmentação (G — segurar cozinha, soltar
  arremessa; quica no cenário, dano em área com linha de visão) e
  atordoante (T). Mãos enluvadas anatômicas (5 dedos articulados com
  skinning, painéis, costuras e protetor de nós) encaixadas na geometria de
  cada arma.
- **Movimento** (detalhes em `ironline-src/src/features/movement/README.md`):
  sprint e **sprint tático** (duplo toque no Shift: mais rápido, arma
  erguida, 3,6 s de estamina com recarga); **slide** com **slide-cancel**
  (agachar de novo devolve o sprint), **slide-jump** com embalo limitado
  (9,2 m/s), **tiro deslizando** com dispersão/recuo próprios, **slide kick**
  (corpo a corpo no slide derruba/empurra e fere), aceleração em **rampa**,
  passagem **sob obstáculos baixos**, **slide para cobertura** (agacha
  colado ao muro baixo) e **vault → slide**; **dolphin dive** (deitar em
  sprint); **pendurar** em bordas altas e subir; **montar a arma** em
  bordas/paredes ao mirar (menos recuo e balanço); **lean** Q/E que nunca
  atravessa parede. Retorno: poeira e faíscas por superfície, roll/FOV de
  câmera, loop de raspagem por superfície.
- **Inimigos** com hitboxes por osso (headshot), percepção por visão e
  audição, supressão, flanco, callouts e ragdoll — em qualquer mapa (tudo
  lido de `services.world`); chefe juggernaut no modo SURVIVAL.
- **Qualidade automática** (padrão): a classe do aparelho (GPU, celular,
  núcleos, memória) escolhe o preset inicial e um governador de desempenho
  ajusta resolução dinâmica e degraus de qualidade com histerese para manter
  ~60 fps (30 em celular). Presets fixos com `?q=low|medium|high|ultra` ou
  no menu de configurações.
- **Toque**: em celular/tablet, joystick virtual (empurrar até o fim =
  sprint; soltar e empurrar de novo rápido = sprint tático), arrastar para mirar e botões de tiro, ADS, recarga, pulo,
  agachar/slide, granada, corpo a corpo, troca de arma e pausa; tela cheia em
  paisagem ao entrar na partida.
- **Configurações**: sensibilidade (e multiplicador em ADS), inverter Y,
  FOV, volume, cor da mira, minimapa girando.

## Inventário, caixas e progressão cosmética

Aba **ARSENAL** do menu (tecla `I`; dados em `src/features/inventory/`,
telas em `src/features/hud/arsenal.js`). **Caixas só abrem com chaves ou
créditos ganhos jogando — não existe compra com dinheiro real** — e cada caixa
publica a tabela de chances.

- **Créditos** por partida (abates, headshots, objetivos, medalhas, tempo,
  bônus de vitória) — composição no relatório pós-ação; saldo e chaves no topo.
- **3 caixas** (OPERAÇÃO FERRO, MARÉ NEGRA, FOGO CRUZADO): 13 skins de arma em
  5 raridades + 6 facas como item ESPECIAL. Chances: COMUM 60 %, INCOMUM 25 %,
  RARO 10 %, ÉPICO 3 %, LENDÁRIO 1,2 %, ESPECIAL (faca) 0,8 %.
- **Abertura**: roleta horizontal com desaceleração, tique por item, clarão
  da raridade e revelação 3D (`weapon.buildPreview`) com desgaste (NOVA DE
  FÁBRICA … MUITO DESGASTADA, 7 casas) e semente do padrão (0–999).
- **Inventário**: grade com filtros, busca, ordenação e selos de novo;
  inspeção 3D (arrastar/roda); equipar skin por arma, faca, chaveiro e até 4
  adesivos — aplicados na arma por `setSkin/setKnife/setCharm/setStickers`.
- **Contrato de troca** (10 → 1 da raridade seguinte), **sucata** em créditos
  (inclui "sucatear duplicatas"), **recompensa diária** com sequência de 7
  dias (hora local), **passe de campanha** de 30 níveis só gratuito (XP de
  partida; faca garantida no 30), **maestria** por abates com cada arma
  (bronze/prata/ouro/obsidiana), **coleção** com % por caixa e **cartões de
  chamada/emblemas** procedurais para o cartão do jogador.
- O **loadout** escolhe primária e secundária entre todas as armas e a faca.
- HUD: medalhas de outras features (`medal:award`) em fila, barra de
  killstreaks (`streak:ready`/`streak:used`) e medalha SLIDE KILL.
- Persistência: `localStorage['ironline.inventory']` (versionado, try/catch).
  QA: `?inv=open`, `?case=1&seed=N[&reelt=s|&reveal=1]`, `?credits=N`,
  `?keys=N`, `&inspect=N`, `&trade=1`, `&arsenal=<aba>` — detalhes em
  `src/features/inventory/README.md` e `src/features/hud/README.md`.

## Killstreaks, medalhas, execuções e killcam

Feature `streaks` (detalhes em `ironline-src/src/features/streaks/README.md`)
e classes de inimigo em `enemies` (README da feature).

- **Killstreaks** por abates sem morrer (os abates das próprias killstreaks
  não contam); conjunto de até 4 escolhido no seletor
  (`services.streaks.openPicker()`), salvo em `localStorage`:
  **RECON UAV** (3 — varreduras revelam inimigos no minimapa),
  **MORTAR STRIKE** (5 — tablet com vista de cima do mapa para marcar o
  alvo; 8 granadas com assobio), **SENTRY GUN** (6 — torreta em tripé que
  rastreia, superaquece e pode ser destruída), **ATTACK DRONE** /
  **KAMIKAZE DRONE** (7). Teclas 3/4/5/6 ou roda radial segurando B.
- **Medalhas** (25, evento `medal:award`): first blood, double/triple/fury,
  headshot, longshot, point blank, collateral, revenge, comeback, slide
  kill, grenade/knife kill, execution, buzzkill, survivor, last stand,
  kaboom (barril), flanker (escudeiro), sequências de 5/10/15 e abates por
  killstreak.
- **Execução**: chegar por trás de um inimigo desatento e SEGURAR V —
  cena curta em 3ª pessoa com dois planos de câmera; tocar V = golpe pelas
  costas.
- **Killcam**: ao morrer, replay de ~2,6 s pela perspectiva de quem atirou
  (câmera lenta no fim).
- **Modo foto**: na pausa, H (ou botão) — câmera livre, exposição, FOV,
  roll, profundidade de campo, filtros, vinheta, grão, barras e captura PNG.
- **Inimigos novos** (a partir da 3ª onda; `?roles=all` força): arrombador
  com escopeta que corre para cima, atirador de elite com laser e reflexo da
  luneta, escudeiro imune pela frente (flanqueie ou use explosivos) e
  socorrista que reanima companheiros. Todos se abaixam sob fogo, se
  assustam com balas rentes, fogem de granadas e arremessam as suas.
- **Barris explosivos e botijões de gás** espalhados perto das entradas e
  coberturas, com reação em cadeia.

## Controles

| Ação | Tecla |
|---|---|
| mover | W A S D (ou setas) |
| sprint / sprint tático | Shift (duplo toque, ou de novo durante o sprint = tático) |
| pular / mantle / vault / subir pendurado | Espaço |
| agachar / slide (em sprint) | C ou Ctrl esquerdo |
| slide-cancel / slide-jump | C de novo / Espaço durante o slide |
| slide kick | V durante o slide |
| vault → slide | C durante o vault |
| deitar / dolphin dive (em sprint ou slide) | Z (segurar C também deita) |
| pendurar em borda alta | correr/pular contra a borda segurando W (A/D desliza, C solta) |
| montar a arma | mirar (botão direito) encostado em borda ou parede |
| inclinar | Q / E |
| atirar | botão esquerdo do mouse |
| mirar (ADS) | botão direito do mouse |
| recarregar | R |
| inspecionar arma | I |
| fuzil / pistola | 1 / 2 (roda do mouse ou X alterna) |
| faca (corpo a corpo) | V |
| granada (segurar = cozinhar) | G |
| atordoante | T |
| killstreaks (conjunto) | 3 / 4 / 5 / 6 (segurar B = roda radial) |
| executar (por trás) | segurar V |
| modo foto (na pausa) | H |
| placar | Tab (segurar) |
| pausa | Esc ou P |
| menu: DEPLOY / loadout / configurações / arsenal | Enter / L / O / I |

Clicar em **DEPLOY** no menu inicia a partida e captura o mouse (pointer
lock). Perder o pointer lock abre a pausa. No toque, DEPLOY mostra os
controles na tela (detalhes em `ironline-src/src/features/touch/README.md`)
e o botão ‖ pausa.

## Como rodar

```bash
cd ironline-src
npm ci             # dependências exatas do package-lock.json
npm run dev        # servidor de desenvolvimento (Vite)
npm test           # testes unitários do núcleo (node --test, sem DOM)
npm run build      # gera ../ironline/ com base /mathref/ironline/
npm run preview    # serve o build
npm run e2e        # partida real ponta a ponta no Chromium headless
```

Parâmetros de URL úteis (lista completa no `CONTRACT.md`):

| Parâmetro | Efeito |
|---|---|
| `?map=street\|factory` | mapa (padrão `street`; trocar = recarregar a página) |
| `?q=auto\|low\|medium\|high\|ultra` | qualidade (padrão `auto`) |
| `?touch=1\|0` | força/desliga os controles de toque |
| `?only=a,b` / `?skip=a,b` | carrega só / todas menos essas features |
| `?mode=waves\|hardpoint\|survival` | modo de jogo (padrão: o último escolhido no menu) |
| `?waves=1,1&wi=1&mt=300` | partida curta (ondas, intervalo, tempo); `&hold=s` (posse do HARDPOINT), `&lives=n` (SURVIVAL) |
| `?dynres=0` | desliga o governador de desempenho (resolução dinâmica + degraus) |
| `?lite=1\|0` | força o modo leve (celular fraco) / desliga a detecção automática |
| `?bootlog=1` | tempo de carga por feature no console (`window.__bootlog`) |
| `?shot=<preset>` | modo screenshot determinístico (abaixo) |

### Celular e modo leve

A carga em celular é o caso crítico: geração procedural de texturas e
geometria roda no thread principal, e o mapa de rua tem ~1,4 M triângulos
únicos (~2,4 M só de entulho instanciado). Antes da camada abaixo, um
celular passava minutos com a página congelada (uma única tarefa de mais de
3 min com CPU 6× mais lenta), o pico de heap JS passava de 500 MB e o iOS
derrubava a aba e recarregava — a tela de carga "infinita".

- **Camada do aparelho** (`quality.tier`, `core/Quality.js` →
  `TIER_PATCHES`), um TETO por cima de qualquer preset/degrau:
  - `desktop`: nada muda (o preset `high` é idêntico ao de antes).
  - `mobile` (detectado por UA/`userAgentData`/ponteiro grosso): texturas
    procedurais 512, canvas de decalques pela metade, entulho miúdo
    rarefeito (~35 %), corte de entulho mais curto, sombra 1024 sem
    cascatas, sem SSAO/SSR/volumétrico/TAA/motion blur/MSAA, sem sonda de
    reflexo, sem GI (RSM), sem cascata larga nem PCSS, shadow map a cada 4
    quadros.
  - `lite` (`?lite=1`, botão **Tentar modo leve**, ou automático quando a
    carga anterior não terminou — a aba caiu e o navegador recarregou):
    tudo do `mobile` + entulho ~12 %, sem bloom/AO de contato e o
    compositor HDR desligado (pipeline padrão do three, sem alvos float nem
    PMREM). `?lite=0` desliga a detecção automática.
- **GPU sem alvos half-float** (WebGL2 sem `EXT_color_buffer_float/half_float`,
  testado com um framebuffer real em `core/Renderer.js` → `gpuCaps`):
  `quality.hdr = false` e o mesmo caminho LDR do modo leve.
- **Carga progressiva**: cada feature (e cada bloco pesado do mundo:
  conjuntos de textura, prédios, entulho, carros…) cede um frame
  (`ctx.bootProgress`), e a tela de carga mostra o passo e a % reais. Antes
  do 1º frame os shaders são pré-compilados (`compileAsync`, teto de 20 s).
- **Falhas legíveis**: erro no init do mundo, script que não carrega
  (navegador antigo), WebGL2 ausente ou contexto perdido durante a carga
  mostram a mensagem com **Tentar modo leve** / **Recarregar** em vez de
  girar para sempre; se nada avança por 25 s aparece a sugestão do modo
  leve. `webglcontextlost` pausa o render; no `restored` o compositor refaz
  LUT/PMREM/alvos (evento `renderer:restored`).
- **Compatibilidade iOS**: o build mira `safari15` (os blocos `static {}`
  do three só existem no Safari 16.4+ e quebravam o chunk inteiro em
  iPhones mais antigos) e o núcleo tem `structuredClone` de reserva.
- **Diagnóstico**: `npm run build && node tools/mobile.mjs --device
  android|iphone --cpu 6 [--phonegl] [--gpu "Adreno (TM) 640"] [--params
  "lite=1"] --out x.png --json x.json` serve a pasta publicada, emula o
  celular (toque, DPR 3, UA) com CPU estrangulada e mede tempo até o menu,
  textos da tela de carga, init por feature (`?bootlog=1`), tarefas longas,
  heap JS, memória estimada de texturas/geometria e triângulos.
  `--phonegl` simula GPU de celular (MAX_TEXTURE_SIZE 4096, sem
  extensões de cor float).

No GitHub Pages, o workflow `.github/workflows/pages.yml` roda `npm ci`,
`npm test` e `npm run build` em `ironline-src/` e confere que
`ironline/index.html` referencia `/mathref/ironline/assets/`.

## Mapas

A feature `world` monta um mapa por carga de página, escolhido por
`?map=<id>` (desconhecido → `street`, com aviso no console). Trocar de mapa
é **recarregar a página** com outro parâmetro — não há descarga/recarga a
quente. Para a HUD montar um seletor de mapa:

```js
const w = ctx.services.world;
w.maps;          // [{ id, name, description }] — street, factory
w.mapId;         // id do mapa carregado ('street' | 'factory')
w.map;           // { id, name, description } do mapa atual
w.mapUrl(id);    // URL desta página com ?map=id (preserva os outros parâmetros)
w.setMap(id);    // navega para mapUrl(id); false se id inválido ou já carregado
```

Os dois mapas publicam **os mesmos campos** de `services.world` (contrato do
`CONTRACT.md` + extras): `root`, `sun`, `hemi`, `sky`, `environment`,
`atmosphere`, `bounds` (Box3 — região jogável; a HUD rasteriza o minimapa e
`enemies` recorta a grade de navegação por ela), `spawnPoints`,
`enemySpawns`, `shotPoses` (todos os presets), `materialAt(hit)`,
`surfaces`, `stats`, `interior` (sala R4 em `street`, `null` em `factory`).
Os colisores ficam em `ctx.collision` como antes (estáticos, com
`material`), então minimapa, navegação, passos e impactos funcionam nos dois.

| Mapa | `bounds` (x, z) | Jogador nasce | Inimigos entram |
|---|---|---|---|
| `street` | x ±23,5, z −150…60 | avenida, z ≈ 20, olhando −z | fundo da avenida (−z) |
| `factory` | x ±22,5, z −44,5…44,5 | pátio sul, olhando +z (o galpão) | fundo norte do galpão, escritórios, beco leste |

FOUNDRY 9 em números: galpão de 36 × 48 m (pé-direito 10,5 m, cumeeira
13,5 m), pórticos a cada 6 m, passarela oeste e ponte a 4,5 m, mezanino dos
escritórios a 4,5 m, doca de 1,2 m no pátio. A navegação dos inimigos é toda
no piso (y = 0); passarelas, mezanino e doca são rotas do jogador.
Capturas do mapa: `?map=factory&shot=street|interior|menu|…` (as poses de
cada preset vêm de `services.world.shotPoses`).

## Ferramentas de screenshot e crítica visual

O QA visual é feito com imagens **determinísticas**, para que duas capturas
do mesmo preset sejam comparáveis entre rodadas.

### Modo screenshot (`?shot=<preset>`)

- Tempo virtual: cada frame renderizado avança exatamente 1/60 s,
  independente da velocidade da máquina (o SwiftShader é lento).
- `Math.random` e `ctx.rng` semeados (`&seed=N`, padrão 1337).
- Entrada desligada e pose do jogador reaplicada a cada passo; áudio mudo.
- Aquecimento de `sim` segundos antes do primeiro frame.

| Preset | Mostra |
|---|---|
| `street` | rua larga na altura dos olhos, sem arma nem HUD |
| `interior` | dentro do prédio R4, olhando a porta/janela |
| `viewmodel` | arma em hip-fire com HUD, rua ao fundo |
| `ads` | mirando pela holográfica, alvo distante no centro |
| `combat` | inimigo à frente atirando no jogador, HUD de partida pré-populada |
| `menu` | menu principal sobre a cena, com o operador iluminado |

Overrides: `&hud=0|1`, `&vm=0|1`, `&sim=s`, `&pause=1`, e
`&ui=main|loadout|settings|pause|scoreboard|end|death` para abrir qualquer
tela da HUD.

### `tools/shot.mjs`

Sobe o próprio servidor Vite numa porta livre (vários agentes podem rodar ao
mesmo tempo), abre o Chromium headless com SwiftShader e salva PNGs.
Imprime erros da página e a luminância média de cada imagem; sai com código
≠ 0 se houver erro de página, feature quebrada ou imagem praticamente preta.

```bash
SCRATCH=/caminho/fora/do/repo
node tools/shot.mjs --params "shot=street" --out $SCRATCH/street.png
node tools/shot.mjs --params "shot=viewmodel" --out $SCRATCH/vm.png --params "shot=ads" --out $SCRATCH/ads.png
node tools/shot.mjs --params "shot=street&only=world,rendering" --out $SCRATCH/x.png --size 720 --frames 60
node tools/shot.mjs --all --outdir $SCRATCH/all --extra "q=medium"
```

Opções: `--size 1080|720`, `--frames N`, `--eval "js"` (roda com `ctx`
antes da captura), `--timeout ms`, `--keep-errors`.

### Ciclo de crítica

O desenvolvimento visual foi feito em rodadas: cada especialista de feature
gera os presets com `shot.mjs`, e um crítico avalia as imagens **às cegas**
(sem saber qual mudança foi feita), comparando com referências visuais de
realismo e apontando os defeitos mais visíveis por preset (iluminação,
materiais, escala, enquadramento da arma, legibilidade da HUD). A rodada
seguinte ataca essa lista. Capturas, referências e notas de crítica ficam
sempre num diretório de rascunho **fora do repositório** — nenhuma imagem de
referência protegida é commitada.

### `tools/e2e.mjs`

Joga uma partida curta de verdade (`?waves=1,1&wi=1`): menu → loadout →
DEPLOY → anda/sprint/pulo → um bot no navegador mira e mata o inimigo da
onda 1 → recarrega → onda 2 → relatório pós-ação com vitória. Falha com
qualquer `pageerror`, `console.error` ou erro de feature. Opções:
`--q low`, `--size 640x360`, `--timeout ms`, `--mode hardpoint|survival`,
`--map factory` (o bot do HARDPOINT segura a zona e confere captura e
vitória pela posse), `--shots dir` (salva
`1-menu`, `2-loadout`, `3-combat`, `4-end`). No SwiftShader leva ~10
minutos; `shot.mjs` em 1080p no preset `high` leva ~6–9 min por imagem
(o `--timeout` padrão é 600 s).

## Limitações conhecidas

- A ação de interação está mapeada no núcleo, mas não implementada; a
  atordoante ainda não cega/atordoa a IA (emite `weapon:flashbang` para quem
  quiser reagir).
- A atordoante trancada por nível só aparece trancada na UI até a feature
  weapon publicar `setTacticals(n)` (a HUD já chama o gancho).
- Partida apenas contra IA (sem multiplayer).
- Pesado em GPUs fracas no preset `high` — o modo automático (padrão)
  desce sozinho; `?q=low` força o mais leve.
- Em ambiente headless (SwiftShader) o jogo roda a poucos FPS — as
  ferramentas usam tempo virtual por isso; medidas de desempenho lá não
  representam uma GPU real.
