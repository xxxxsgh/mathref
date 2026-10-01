# IRONLINE — contrato entre núcleo e features

Este documento é a fonte da verdade para quem trabalha numa feature. Se algo
aqui e o código divergirem, o código do núcleo (`src/core/`, `src/main.js`)
vence — e este arquivo deve ser corrigido.

## Regras de posse

1. **Cada feature edita apenas a própria pasta** `src/features/<nome>/`.
   Pode criar quantos arquivos quiser lá dentro (shaders, geradores de
   textura, dados), mas não toca em outras pastas.
2. **Necessidades entre features passam por `ctx.services`** (APIs publicadas
   com `ctx.provide`) ou pelo **bus** (eventos). Nunca importe arquivos de
   outra feature.
3. O núcleo (`src/core/`, `src/main.js`, `tools/`, este arquivo) é do
   engenheiro de fundação. Precisa de algo novo no núcleo? Peça; até lá,
   resolva dentro da sua feature.
4. Tudo procedural ou criado por você. Nenhum asset baixado/protegido é
   commitado. Nada de nomes, logos ou marcas de jogos existentes.
5. Saída de rascunho (screenshots, referências) vai para
   `/tmp/claude-0/-home-user-mathref/1f256a66-dc60-551c-af41-f2d751cfdd82/scratchpad/ironline/`,
   nunca para o repositório.
6. Comentários e documentação em português (pt-BR).
7. Sem `git commit/push/checkout/stash/reset` — o orquestrador commita.

## Anatomia de uma feature

`src/features/<nome>/index.js` exporta (default ou nomeado):

```js
export default {
  name: 'weapon',     // único
  order: 40,          // menor inicializa/atualiza primeiro
  async init(ctx) {}, // pode ser async; é aguardado antes da próxima feature
  update(dt, ctx) {}, // opcional — PASSO FIXO de 1/60 s (lógica, física, IA)
  frame(dt, ctx) {},  // opcional — por frame de render, dt variável (visual, interpolação)
  dispose(ctx) {},    // opcional
};
```

- Descoberta automática por `import.meta.glob('./features/*/index.js')`.
- Cada `import`, `init`, `update` e `frame` roda em try/catch próprio. Se uma
  feature lança no `update`/`frame`, ela é **desligada** (não as outras) e o
  erro vai para `ctx.errors` e para o console.
- `this` dentro dos métodos é o próprio objeto exportado (guarde estado nele).

Ordens de referência: `world 10`, `rendering 20`, `audio 25`,
`movement 30`, `weapon 40`, `enemies 50`, `vfx 60`, `hud 90`.

### Ordem de um frame

```
para cada passo fixo pendente (1/60 s):
    [modo shot] reaplica a pose do preset
    player.update(dt)          → look do mouse + controlador (embutido ou movement)
    features.update(dt)        → em ordem
    input.endStep()            → zera pressed/released
player.syncCamera(alpha)       → interpola posição, aplica viewOffset/viewKick/FOV
features.frame(dt)             → em ordem
pipeline(ctx, dt)              → render (padrão: cena + viewmodel)
```

## `ctx`

| Campo | O que é |
|---|---|
| `THREE` | o módulo three (mesma instância do núcleo) |
| `renderer` | `WebGLRenderer` — sRGB, ACES, sombras PCFSoft, DPR ≤ `quality.dprCap`, `info.autoReset = false` (somado por frame) |
| `canvas` | `renderer.domElement` |
| `scene` / `camera` | cena do mundo e câmera do jogador (`PerspectiveCamera`, FOV vertical; a câmera está ADICIONADA à cena, então filhos dela renderizam) |
| `vm.scene` / `vm.camera` / `vm.visible` | cena da arma em 1ª pessoa, desenhada por cima com depth limpo (FOV 54, near 0.01). Tem luzes próprias — não enxerga as do mundo |
| `ui` | `<div id="ui">` sobre o canvas (`pointer-events: none`; use a classe `interactive` para clicáveis) |
| `bus` | eventos: `on(type, fn) → off`, `once`, `off`, `emit(type, payload)` |
| `input` | ver abaixo |
| `collision` | ver abaixo |
| `player` | ver abaixo |
| `quality` | ver abaixo |
| `time` | `{ now, frame, step, scale, alpha, virtual, frameDt }` — `scale = 0` pausa a simulação; `virtual` = modo shot |
| `params` | `URLSearchParams` da página |
| `shot` | `null` fora do modo screenshot; senão `{ name, known, preset, seed, pause }` |
| `rng` | RNG semeado: `next() range(a,b) int(a,b) pick(arr) chance(p) fork(salt)` — no modo shot é determinístico (e `Math.random` também) |
| `services` | mapa de APIs publicadas pelas features |
| `provide(name, api)` | publica/mescla `services[name]` (preserva getters) e emite `service:ready` |
| `service(name)` | lê um serviço (pode ser `undefined`) |
| `setRenderPipeline(fn)` | **gancho do compositor**: `fn(ctx, dt)` substitui o render inteiro; `null` restaura o padrão |
| `defaultRender()` | cena + viewmodel no framebuffer |
| `renderViewmodel(target)` | desenha a viewmodel por cima do alvo (limpa só depth). O pipeline customizado DEVE chamá-la (ou compor a viewmodel de outro jeito) |
| `shotPose(name?)` | pose do preset (`services.world.shotPoses[name]` > padrão de `core/Shots.js`) |
| `features` / `errors` | estado de carregamento `{ name, order, ok, error }` e erros registrados |

`window.__ironline` = `ctx`. `window.__ready = true` após o 3º frame
renderizado (features iniciadas e aquecimento do preset feito).
`window.__frames` = frames renderizados.

### `input`

- `down(code)` tecla física; `action(nome)` ação mapeada pressionada;
  `pressed(nome)` / `released(nome)` borda **neste passo fixo**.
- Ações padrão (`input.bindings`, editável): `forward back left right jump
  sprint crouch prone reload interact melee grenade weapon1 weapon2 leanLeft
  leanRight scoreboard pause fire ads` (`fire` = `Mouse0`, `ads` = `Mouse2`).
- `consumeLook()` → `{ yaw, pitch }` em rad (o player já consome); `consumeWheel()`.
- `locked` (pointer lock), `requestLock()`, `exitLock()`, `enabled`,
  `sensitivity`, `invertY`.
- `simulate(nome, on)` — aciona uma ação por código (testes, bots, shots).
- Evento `input:lock` (bool) no bus.

### `collision`

Mundo de colisão próprio (independe das malhas de render). Colisores:
`{ id, tag, owner, material, trigger, enabled, blocksPlayer, blocksBullets, ray, data }`.

- `addBox(min, max, opts) → id`, `addBoxCentered(center, size, opts)`,
  `addObject(obj3d, { perMesh, ...opts }) → ids` — estáticos, em grade XZ.
- `addDynamic(getBox(targetBox3), opts) → id` — consultado sempre (inimigos,
  portas). `opts.ray(origin, dir, maxDist) → { distance, point?, normal?, part? } | null`
  refina o acerto depois que a AABB passou (hitboxes de cabeça/tronco).
- `remove(id)`, `removeByTag(tag)`, `get(id)`, `clear()`.
- `raycast(origin, dirNormalizado, maxDist, { filter, ignoreOwner, bullets = true, triggers = false })`
  → `{ point, normal, distance, collider, part } | null`.
- `lineOfSight(a, b, opts)`, `groundHeight(x, z, fromY)`,
  `overlapSphere(center, r, filter)`, `queryBox(box3, out, filter)`.
- `moveCapsule(posPés, delta, { radius, height, stepHeight, wasGrounded, filter })`
  → `{ onGround, hitCeiling, hitWall, groundCollider }` (muta `pos`).
- Convenção de `material`: `'concrete' 'asphalt' 'brick' 'wood' 'metal' 'glass' 'dirt' 'flesh'…`
  (vfx/áudio escolhem efeito por ele).
- **Dano**: quem pode levar tiro define `data.damage(amount, info)` no
  colisor; a arma chama isso e também emite `weapon:hit`.

### `player`

Estado: `position` (pés), `prevPosition`, `velocity`, `yaw`, `pitch`,
`radius 0.35`, `height 1.8`, `eyeHeight 1.62`, `stepHeight`, `onGround`,
`health`, `maxHealth`, `alive`, `baseFov 72`, `state { sprinting, crouching, moving, speed }`,
`walkSpeed`, `sprintSpeed`, `jumpSpeed`, `gravity`, `lookEnabled`, `moveEnabled`.

- `eyePosition` (novo Vector3), `getAimDir(out)`, `setPose({ position, yaw, pitch })`,
  `damage(amount, info)` → emite `player:damage` / `player:death`.
- **`player.controller = { update(dt, player, ctx) }`** substitui a
  locomoção embutida (é o que a feature `movement` faz). O controlador deve
  manter `position/velocity/onGround/state/eyeHeight` coerentes e pode usar
  `ctx.collision.moveCapsule`.
- Canais de câmera (somados em `syncCamera`, cada dono reescreve o seu):
  `viewOffset` (Vector3 local à câmera — bob, lean),
  `viewKick { pitch, yaw, roll }` (recuo, impacto) e
  `fovFactors: Map<nome, fator>` (FOV final = `baseFov × Π fatores`; ex.:
  `fovFactors.set('ads', 0.75)`). Para somar contribuições de várias
  features no `viewKick`, combine pelo serviço `movement`/`weapon` em vez de
  sobrescrever o do outro.

### `quality`

`{ level, dprCap, msaa, shadows, shadowMapSize, shadowCascades, anisotropy,
ssao, ssr, bloom, taa, motionBlur, volumetrics, drawDistance, particleBudget,
textureSize, foliage }` — presets `low | medium | high | ultra` (padrão
`high`, URL `?q=`). `quality.set('low' | patch)` emite `quality:change`.
São dicas: cada feature decide como honrá-las.

## Serviços (`ctx.services`)

Os stubs atuais publicam o mínimo abaixo. **Especialistas podem acrescentar
campos, mas não remover nem mudar a semântica destes** sem atualizar este
documento.

| Serviço | Dono | API mínima |
|---|---|---|
| `world` | world | `root`, `sun` (DirectionalLight), `hemi`, `bounds: Box3`, `spawnPoints: [{position:[x,y,z], yaw, pitch}]`, `enemySpawns: [...]`, `shotPoses: { [preset]: {position, yaw, pitch} }`, `materialAt(hit) → string` |
| `rendering` | rendering | `setExposure(v)`, `environment` (Texture PMREM ou null) |
| `audio` | audio | `play(nome, { position?, volume? })`, `setVolume(v)`, `context` |
| `movement` | movement | `builtin: bool`, `stance() → 'stand'|'crouch'|'prone'|'slide'` |
| `weapon` | weapon | `gun` (Object3D na vm), `muzzle` (Object3D), getters `ammo`, `reserve`, `magSize`, `ads` (0..1), `reloading`, `name` |
| `enemies` | enemies | `list`, `spawn(pose) → enemy`, `count()` |
| `vfx` | vfx | `impact(point, normal, material?)`, `tracer(from, to)`, `muzzleFlash(obj3d)` |
| `hud` | hud | `root`, `setMenu(bool)`, `setVisible(bool)` |

## Eventos do bus

| Evento | Payload | Quem emite |
|---|---|---|
| `ready` / `game:start` | `ctx` | núcleo |
| `resize` | `{ width, height, dpr }` | núcleo |
| `quality:change` | `quality` | núcleo |
| `service:ready` | `{ name, api }` | núcleo (`provide`) |
| `input:lock` | `bool` | núcleo |
| `player:damage` | `{ amount, health, source?, from? }` | núcleo (`player.damage`) |
| `player:death` / `player:jump` / `player:land` | `{…}` | núcleo / controlador |
| `weapon:fire` | `{ origin, dir, muzzle, ads }` | weapon |
| `weapon:hit` | `{ point, normal, distance, collider, part, dir, damage, source }` | weapon |
| `weapon:reload` / `weapon:reloaded` / `weapon:dry` | `{…}` | weapon |
| `enemy:fire` | `{ enemy, origin, dir }` | enemies |
| `enemy:damage` / `enemy:death` | `{ enemy, amount?, info }` | enemies |

## Parâmetros de URL

| Parâmetro | Efeito |
|---|---|
| `?only=a,b` | carrega só essas features (nomes de pasta) |
| `?skip=a,b` | carrega todas menos essas |
| `?q=low\|medium\|high\|ultra` | preset de qualidade |
| `?shot=<preset>` | modo screenshot (abaixo) |
| `&seed=N` | semente do modo shot (padrão 1337) |
| `&hud=0\|1`, `&vm=0\|1` | força HUD / viewmodel no preset |
| `&sim=s` | segundos de aquecimento antes do 1º frame |
| `&pause=1` | congela a simulação depois do aquecimento (só renderiza) |
| `&preserve=1` | `preserveDrawingBuffer` (o shot.mjs liga para medir luminância) |

## Modo screenshot (`?shot=<preset>`)

- Tempo **virtual**: cada frame renderizado avança exatamente um passo de
  1/60 s, independente da velocidade da máquina (SwiftShader é lento).
- `Math.random` e `ctx.rng` semeados com `seed`.
- Entrada desligada; a pose do jogador é **reaplicada a cada passo**
  (`ctx.shotPose()`), então nada move a câmera — exceto `viewOffset`/
  `viewKick`/`fovFactors`, que continuam valendo.
- Aquecimento de `preset.sim` segundos antes do 1º frame.
- `ctx.vm.visible = preset.viewmodel`. Cada feature lê `ctx.shot.preset` e
  reage às flags. Áudio fica mudo.

| Preset | O que mostra | Flags | Quem reage |
|---|---|---|---|
| `street` | rua larga na altura dos olhos | sem HUD, sem arma | world, rendering |
| `interior` | dentro de um prédio, olhando a porta/janela | sem HUD, sem arma | world, rendering |
| `viewmodel` | arma em hip-fire, rua ao fundo | HUD, arma, `sim 0.5` | weapon, hud |
| `ads` | mirando, alvo distante no centro | HUD, arma, `ads`, `sim 0.8` | weapon (ADS imediato), hud (sem mira) |
| `combat` | inimigo à frente atirando no jogador | HUD, arma, `combat`, `enemy.position`, `sim 1.0` | enemies (spawna e atira), vfx (flash/traçante), hud |
| `menu` | menu principal sobre a cena | `menu`, sem arma | hud (menu), world (pose bonita) |

Poses padrão em `src/core/Shots.js`; a feature `world` deve publicar as
suas em `services.world.shotPoses` quando o mapa mudar.

## Ferramentas

```bash
# um preset (1920x1080), imprime erros e luminância média
node tools/shot.mjs --params "shot=street" --out $SCRATCH/street.png

# vários na mesma sessão do navegador
node tools/shot.mjs --params "shot=viewmodel" --out $SCRATCH/vm.png --params "shot=ads" --out $SCRATCH/ads.png

# só algumas features, 720p, mais frames, JS antes da captura
node tools/shot.mjs --params "shot=street&only=world,rendering" --out $SCRATCH/x.png --size 720 --frames 60 \
  --eval "ctx.services.rendering.setExposure(1.2)"

# todos os presets
node tools/shot.mjs --all --outdir $SCRATCH/all [--extra "q=medium"]
```

`SCRATCH=/tmp/claude-0/-home-user-mathref/1f256a66-dc60-551c-af41-f2d751cfdd82/scratchpad/ironline`.
Cada execução sobe o **próprio** servidor Vite numa porta livre — vários
agentes podem rodar ao mesmo tempo. Sai com código ≠ 0 se a página tiver
erros, uma feature falhar ou a imagem sair praticamente preta
(`--keep-errors` ignora erros). `--eval` recebe `ctx` e pode usar `await`;
o valor retornado é impresso. A máquina tem 4 CPUs e o SwiftShader é lento:
mire as capturas (`--size 720`, `?only=`) enquanto itera.

`npm test` roda `tools/unit.test.mjs` (núcleo puro, sem DOM).
