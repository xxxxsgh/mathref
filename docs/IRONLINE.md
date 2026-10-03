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
| 10 | `world` | mapa MERIDIAN STREET ("Distrito Velho" no código): avenida destruída, prédios paramétricos, interior jogável, carros, barreiras/HESCO, entulho, fogo, fumaça, vegetação, céu, materiais PBR procedurais e colisores |
| 20 | `rendering` | compositor HDR: céu físico, sombras PCSS, GI de 1 rebatimento (RSM), AO, volumétrico, bloom, TAA, exposição automática, tonemap e gradação |
| 25 | `audio` | áudio 100% sintetizado (WebAudio): tiro em camadas, HRTF, estalo supersônico, passos por superfície, reverb por convolução, ambiente |
| 30 | `movement` | locomoção: sprint, sprint tático, slide, agachar/deitar, dive, mantle/vault, lean; bob e corpo visível com IK |
| 40 | `weapon` | fuzil KR-9 (design original) na viewmodel: hitscan, recuo, ADS com holográfica, recarga, inspeção, mãos com skinning |
| 50 | `enemies` | soldados procedurais (4 variantes), animação procedural, ragdoll Verlet, IA de esquadrão com cobertura e A* |
| 60 | `vfx` | partículas na GPU, impactos por material, clarões, traçantes, cápsulas, marcas de tiro, explosões |
| 90 | `hud` | HUD de combate, bússola, minimapa, menus (principal, loadout, configurações, pausa, placar, relatório pós-ação), regras da partida |

## Funcionalidades

- **Modo FRONTLINE**: 5 ondas (4-5-6-7-8 = 30 hostis) em 10 minutos.
  Limpar a última onda vence; o relógio zerar perde. Renascimento em 4 s no
  ponto mais seguro, regeneração de vida, XP, medalhas e relatório pós-ação
  com estatísticas; perfil salvo em `localStorage`.
- **Mapa urbano** (MERIDIAN STREET) com rua, cruzamento, ruela, posto de controle e o térreo
  jogável do prédio R4.
- **Arma**: tiro automático (760 rpm), recuo com molas, ADS com retículo
  holográfico sem paralaxe, recarga tática/vazia, inspeção.
- **Inimigos** com hitboxes por osso (headshot), percepção por visão e
  audição, supressão, flanco, callouts e ragdoll.
- **Qualidade** ajustável (`?q=low|medium|high|ultra` ou no menu de
  configurações) e resolução dinâmica fora do modo screenshot.
- **Configurações**: sensibilidade (e multiplicador em ADS), inverter Y,
  FOV, volume, cor da mira, minimapa girando.

## Controles

| Ação | Tecla |
|---|---|
| mover | W A S D (ou setas) |
| sprint / sprint tático | Shift (de novo durante o sprint = tático) |
| pular / mantle / vault | Espaço |
| agachar / slide (em sprint) | C ou Ctrl esquerdo |
| deitar / dive (em sprint) | Z (segurar C também deita) |
| inclinar | Q / E |
| atirar | botão esquerdo do mouse |
| mirar (ADS) | botão direito do mouse |
| recarregar | R |
| inspecionar arma | I |
| sacar de novo | 1 |
| placar | Tab (segurar) |
| pausa | Esc ou P |
| menu: DEPLOY / loadout / configurações | Enter / L / O |

Clicar em **DEPLOY** no menu inicia a partida e captura o mouse (pointer
lock). Perder o pointer lock abre a pausa.

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
| `?q=low\|medium\|high\|ultra` | preset de qualidade (padrão `high`) |
| `?only=a,b` / `?skip=a,b` | carrega só / todas menos essas features |
| `?waves=1,1&wi=1&mt=300` | partida curta (ondas, intervalo, tempo) |
| `?dynres=0` | desliga a resolução dinâmica |
| `?shot=<preset>` | modo screenshot determinístico (abaixo) |

No GitHub Pages, o workflow `.github/workflows/pages.yml` roda `npm ci`,
`npm test` e `npm run build` em `ironline-src/` e confere que
`ironline/index.html` referencia `/mathref/ironline/assets/`.

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
`--q low`, `--size 640x360`, `--timeout ms`, `--shots dir` (salva
`1-menu`, `2-loadout`, `3-combat`, `4-end`). No SwiftShader leva ~10
minutos; `shot.mjs` em 1080p no preset `high` leva ~6–9 min por imagem
(o `--timeout` padrão é 600 s).

## Limitações conhecidas

- Só uma arma (KR-9); as ações de granada, corpo a corpo, interação e
  segunda arma estão mapeadas no núcleo, mas não implementadas.
- Partida apenas contra IA (sem multiplayer).
- Pesado em GPUs fracas no preset `high`; use `?q=low` ou `medium`.
- Em ambiente headless (SwiftShader) o jogo roda a poucos FPS — as
  ferramentas usam tempo virtual por isso; medidas de desempenho lá não
  representam uma GPU real.
