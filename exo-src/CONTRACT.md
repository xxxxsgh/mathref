# EXOSFERA — contrato entre núcleo e sistemas

Fonte da verdade para quem trabalha num sistema (feature). Se este arquivo e
o código do núcleo (`src/core/`, `src/main.js`) divergirem, o código vence —
e este arquivo deve ser corrigido pela fundação.

- Publicado em `https://xxxxsgh.github.io/mathref/exo/` (Vite `base: '/mathref/exo/'`, build em `../exo`).
- Stack: three `0.185.1` + Vite `8.1.5`. **Nenhuma dependência npm nova** (só `three` e `three/addons`).

```bash
cd exo-src
npm install
npm run dev                      # http://localhost:5173/mathref/exo/
npm run build                    # gera ../exo/
npm test                         # testes unitários do núcleo (node, sem DOM)
node tools/shot.mjs --all        # screenshots de todos os presets (SwiftShader)
node tools/shot.mjs --params "shot=horizon&q=high" --out x.png --size 720
node tools/shot.mjs --list       # presets e donos
node tools/flight.mjs            # voo contínuo órbita → solo no navegador
```

---

## 1. Regras de posse

1. **Cada sistema edita só a própria pasta** `src/features/<sistema>/` e o
   próprio arquivo de presets `src/shots/<sistema>.js`. Pode criar quantos
   arquivos quiser dentro da pasta (shaders, workers, geradores, dados).
2. **Nunca importe arquivos de outra feature.** Necessidades entre sistemas
   passam por `ctx.services` (APIs publicadas com `ctx.provide`) ou pelo
   `ctx.bus` (eventos). Importar de `src/core/` é permitido (é compartilhado).
3. Dependência ainda não publicada → use o **fallback** desta página e
   degrade com elegância. Não implemente o sistema alheio.
4. O núcleo (`src/core/`, `src/main.js`, `tools/`, `index.html`,
   `vite.config.js`, `package.json`, este arquivo, `src/shots/canonical.js`)
   é da fundação/integração. Precisa de algo no núcleo? Peça; até lá,
   resolva dentro do seu sistema.
5. IP própria: nada de nomes, logos, marcas ou assets de terceiros. Tudo
   procedural (shaders, geometria, texturas geradas em código, áudio sintetizado).
6. Comentários e documentação em pt-BR.
7. Rascunhos/screenshots em
   `/tmp/claude-0/-home-user-mathref/35305c52-18c5-5949-a43a-1741756616d4/scratchpad/work/<sistema>/`
   — nunca no repositório (`EXO_SHOT_DIR` muda a pasta padrão do shot.mjs).
8. Commit só dos seus caminhos (`git add src/features/<sistema> src/shots/<sistema>.js`).

### Sistemas e pastas

| Pasta | `order` | Serviço publicado | Placeholder do núcleo enquanto ausente |
|---|---|---|---|
| `universe` | 5 | `universe` | sim (core/placeholder/universe*.js) |
| `planet` | 10 | `planet` | sim — esfera lisa (core/placeholder/planet.js) |
| `sky` | 15 | `sky` | sim — espalhamento simples (core/placeholder/sky.js) |
| `weather` | 20 | `weather` | sim — `{ weather: 'clear' }` |
| `flora` | 30 | `flora` | não (opcional) |
| `fauna` | 35 | `fauna` | não (opcional) |
| `ship` | 40 | `ship` | nave/cockpit placeholder + controlador de voo do núcleo |
| `gameplay` | 60 | `gameplay` (+ `hud`, `menu` opcionais) | menu mínimo do núcleo |
| `audio` | 70 | `audio` | não (chamadas viram no-op) |
| `render` | 90 | `render` | pipeline direto do núcleo |

`order` menor inicializa e atualiza primeiro. Os stubs criados pela
fundação em cada pasta só marcam o lugar — o dono substitui o arquivo inteiro.

---

## 2. Anatomia de uma feature

`src/features/<nome>/index.js` exporta (default ou nomeado):

```js
export default {
  name: 'planet',     // único
  order: 10,          // menor inicializa/atualiza primeiro
  async init(ctx) {}, // pode ser async; é aguardado antes da próxima feature
  update(dt, ctx) {}, // opcional — PASSO FIXO de 1/60 s (lógica, física, IA)
  frame(dt, ctx) {},  // opcional — por frame de render, dt variável (visual, streaming)
  dispose(ctx) {},    // opcional
};
```

- Descoberta por `import.meta.glob('./features/*/index.js')`.
- Cada `import`, `init`, `update` e `frame` roda em try/catch próprio. Uma
  feature que lança no `update`/`frame` é **desligada** (só ela); o erro vai
  para `ctx.errors` e para o console. Falha no `init` não derruba o jogo
  (os placeholders seguram a cena).
- `this` nos métodos é o próprio objeto exportado.
- Durante um `init` longo: `await ctx.bootProgress('texturas', 0.4)` atualiza
  a tela de carga e cede um frame.
- `?only=planet,sky` / `?skip=fauna` carregam só/sem certas features.

### Ordem de um frame

```
para cada passo fixo pendente (1/60 s; no modo shot: 1 passo por frame, tempo do mundo congelado):
    player.update(dt)          → controlador do modo atual integra posição/orientação em DOUBLE
    features.update(dt)        → em ordem
    input.endStep()
player.syncCamera(alpha)       → interpola (double); calcula player.cameraWorld / cameraQuat / fov
space.setOrigin(cameraWorld)   → ORIGEM DE RENDER = câmera
space.update()                 → reposiciona todo objeto registrado com registerFloating
camera.updateMatrixWorld()     → câmera three sempre em (0,0,0)
cockpit: câmera/luzes do cockpit sincronizadas
placeholders.frame(dt)         → só dos serviços ainda placeholder
features.frame(dt)             → em ordem (pode posicionar objetos com space.toRender)
renderer.info.reset(); pipeline.render(dt)
ready.tick() → window.__ready quando estável
```

---

## 3. `ctx`

| Campo | O que é |
|---|---|
| `THREE` | o módulo three (mesma instância do núcleo) |
| `Geo` | `core/Geo.js` (lat/lon, triedo local, rumo, horizonte) |
| `WorldPos` | classe de posição de mundo (double) |
| `renderer` | `WebGLRenderer` — reversed-Z (ou log), `info.autoReset = false` (somado por frame), sombras PCF, ACES/sRGB aplicados na saída |
| `canvas` | `renderer.domElement` |
| `scene` / `camera` | cena do MUNDO (espaço de render, relativo à câmera) e câmera (`PerspectiveCamera`, near 0,1 m, far 1e10 m, sempre na origem; FOV = `player.fov`). A câmera está na cena |
| `cockpit` | `{ scene, camera, sun, ambient, visible }` — camada de cockpit/viewmodel (ver §8) |
| `ui` | `<div id="ui">` sobre o canvas (`pointer-events: none`; classe `interactive` para clicáveis) |
| `bus` | eventos: `on(type, fn) → off`, `once`, `off`, `emit(type, payload)` |
| `input` | teclado/mouse/toque (ver §9) |
| `space` | escala planetária e origem flutuante (§4) |
| `player` | jogador (§5) |
| `seed` | hierarquia de seeds (§6) |
| `workers` | pool de Web Workers (§7) |
| `ready` | sinal de pronto (§10) |
| `pipeline` | pipeline de render (§8) |
| `quality` | preset de qualidade (§11) |
| `time` | `{ now, world, frame, step, scale, alpha, virtual, frozen, frameDt }` — `now` = tempo de simulação; `world` = relógio do mundo (dia, nuvens, animação ambiente) que **não anda com `frozen`** (modo shot). `scale = 0` pausa |
| `params` | `URLSearchParams` |
| `shot` | `null` fora do modo screenshot; senão `{ name, known, preset, seed }` (§12) |
| `start` | `{ seed, galaxy, systemIndex, planetIndex }` — onde o jogo começa (URL ou preset). O universe lê no `init` |
| `rng` | RNG simples (mulberry32) — prefira `ctx.seed.derive(...)` para conteúdo |
| `services` / `provide(name, api)` / `service(name)` | APIs publicadas. `provide` **substitui** o placeholder do núcleo (que é descartado: malhas removidas) e emite `service:ready { name, api }`; publicar de novo mescla (preserva getters) |
| `depthMode` | `'reversed'` ou `'log'` |
| `gpu` | `{ webgl2, maxTexture, halfFloatRT, maxSamples, clipControl }` |
| `features` / `errors` | estado de carga e erros `{ feature, phase, message }` |
| `report(name, phase, err)` | registra um erro sem lançar |
| `menu` | `{ disable(), show(), hide() }` — menu mínimo do núcleo |
| `presets` | presets de screenshot coletados |
| `debug` | `steps(n)`, `renderOnce()`, `workersSelfTest()` (ferramentas) |

`window.__exo = ctx`; `window.__ready`; `window.__frames`.

---

## 4. Escala planetária e origem flutuante (`ctx.space`)

**Unidades: 1 unidade = 1 metro**, em todo o mundo.

- **Planetas e luas em escala real de metro:** raio 60–200 km.
- **Sistema estelar COMPRIMIDO:** vizinhos a 4e6–6e7 m do planeta atual
  (30–400 raios), luas a 5–9 raios do planeta-mãe, estrela a ~3e9 m com
  raio calibrado para ~0,5–0,75° no céu. Viagem entre planetas = escala de
  minutos com o pulso, não anos.
- **Referencial do mundo = FIXO NO PLANETA ATUAL** (gira com ele): centro em
  `ctx.space.planetCenter` (a origem, por padrão), eixo de rotação +Y. A hora
  do dia é a rotação do CÉU em torno de +Y (ver `sky`).
- Convenções (core/Geo.js): `dir(lat,lon) = (cos lat·cos lon, sin lat, −cos lat·sin lon)`;
  em (0,0): up = +X, norte = +Y, leste = −Z; leste × norte = up. Rumo 0 = norte,
  90 = leste. Pitch positivo = para cima.

**Posições do mundo são double** (`WorldPos`, um `Vector3` — JS já é double
no CPU). Nada vai para a GPU em coordenadas absolutas: a câmera three fica em
(0,0,0) e todo objeto é desenhado em `posição − origem`, com a subtração
feita em double. Perto da câmera o float32 fica exato (teste: erro < 1e-6 m a
150 km do centro; ingênuo erraria milímetros).

| API | |
|---|---|
| `space.origin` | `WorldPos` da câmera neste frame (só leitura) |
| `space.planetCenter` | `WorldPos` do centro do planeta atual |
| `space.toRender(worldPos, out?)` | → `Vector3` em espaço de render |
| `space.toWorld(renderPos, out?)` | → `WorldPos` |
| `space.toRenderCompressed(worldPos, out)` | idem com compressão; devolve o fator de escala |
| `space.registerFloating(obj, worldPos, { compress })` | o núcleo reposiciona `obj.position` todo frame. `worldPos` é **vivo** (mova o objeto mutando-o). Devolve `handle { worldPos, baseScale, remove() }` |
| `space.unregister(obj)` | |
| `space.upAt(worldPos, out)` / `space.radiusOf(worldPos)` | normal local / distância ao centro |
| `space.recenter(offset)` | o núcleo chama ao receber `space:recenter` |

**Malhas grandes** (chunks de terreno): vértices RELATIVOS a uma âncora
própria (centro do chunk) e a âncora registrada como flutuante — nunca
vértices em coordenadas de planeta.

**Compressão (`compress: true`)** para corpos celestes: além de 5e7 m o
objeto é desenhado a `d' = C·(1 + ln(d/C))` com escala × d'/d — mesmo
tamanho angular, ordem de profundidade preservada, cabe no far plane.

**Troca de planeta atual** (pouso noutro planeta do sistema): o `universe`
emite `space:recenter { offset }` (vetor do centro antigo ao novo, em double).
O núcleo desloca o jogador e TODO `worldPos` registrado; cada sistema
desloca as posições de mundo que guarda fora do registro.

### Profundidade (sem z-fighting do solo à órbita)

- **Reversed-Z com depth FLOAT32** (three `reversedDepthBuffer: true` +
  `EXT_clip_control`, presente no SwiftShader de teste). O mundo é desenhado
  no alvo HDR do núcleo, que tem `DepthTexture(FloatType)`.
- **Fallback:** `logarithmicDepthBuffer` (sem `EXT_clip_control`, ou `?depth=log`).
- near 0,1 m, far 1e10 m. Garantido por teste (core/Depth.js): superfícies
  separadas por `max(1 mm, 2e-6·z)` são distinguíveis de 0,1 m a 1e7 m
  (0,1 m a 50 km; 20 m a 1e7 m). O depth convencional de 24 bits falha (o
  teste confirma).
- **ShaderMaterial / RawShaderMaterial:** inclua `#include <common>`,
  `<logdepthbuf_pars_vertex>`/`<logdepthbuf_vertex>` e
  `<logdepthbuf_pars_fragment>`/`<logdepthbuf_fragment>` (no-op no
  reversed, corretos no log). Não escreva `gl_FragDepth` à mão sem tratar
  os dois modos (`ctx.depthMode`). Com reversed-Z, o depth limpo vale **0** e
  o teste é GREATER — o three cuida disso; um pass de tela cheia que lê o
  depth deve tratar 0 = infinito (céu).
- Domo/céu: desenhe com `depthWrite: false`, `renderOrder` bem negativo e
  raio < 1e10 (o placeholder usa 1e9).

---

## 5. Jogador (`ctx.player`)

| Campo | |
|---|---|
| `worldPos` | `WorldPos` double — PÉS (walk) ou centro da nave (ship/space) |
| `velocity` | `Vector3` m/s no referencial do mundo |
| `quaternion` | orientação do CORPO (−Z frente, +Y cima). Em `walk` o corpo fica em pé na normal local e a inclinação da visão fica em `pitch` (rad) |
| `mode` | `'walk' \| 'ship' \| 'space'` |
| `view` | `'first' \| 'third'` (V alterna) |
| `up`, `altitude`, `groundHeight`, `grounded` | normal local, m acima do solo (`planet.heightAt`), altura do solo, apoio |
| `eyeHeight` (1,7) / `cockpitEye` (`Vector3` no referencial da nave) / `fov` | |
| `thirdPerson` | `{ walk: { back, up }, ship: {...}, space: {...} }` |
| `cameraWorld` / `cameraQuat` | câmera deste frame (double) = origem de render |
| `renderPos` / `renderQuat` | pose interpolada do corpo neste frame |
| `lookEnabled` / `moveEnabled` / `frozen` | |
| `setController(mode, ctrl)` | troca o controlador de um modo |
| `setMode(mode)` | emite `player:mode { mode, prev }` |
| `place({ lat, lon, alt, heading, pitch, mode, worldPos, fov })` | teleporte (alt = olhos em walk; altitude da nave em ship/space) |
| `updateSurface()`, `alignBodyToUp()`, `uprightFromCurrent()`, `snap()` | utilitários para controladores |

**Controlador** = `{ name, enter?(p, ctx, prevMode), exit?(p, ctx, nextMode),
update(dt, p, ctx), camera?(p, ctx, cam) }`. `update` roda no passo fixo e
integra em double. `camera` (opcional) ajusta `cam.worldPos / cam.quaternion
/ cam.fov` depois da câmera padrão (ex.: perseguição da nave com atraso).

Padrões do núcleo (substituíveis):
- `walk` — `WalkController`: gravidade radial (`planet.gravity`, padrão 9,8),
  up = normal local, transporte paralelo do rumo, solo = `planet.heightAt`,
  correr, pulo, jetpack curto. **Gameplay** pode trocar.
- `ship`/`space` — `FlyController`: 6DOF; velocidade máxima ∝ altitude
  (`altitude·altFactor`, teto imediato = freio de proximidade) → voo
  contínuo da órbita ao solo sem atravessar o chão; auto-nivelamento perto
  do solo em `ship`. `command = { x, y, z, boost }` para bots/testes. **Ship**
  troca `ship` (e `space`, se quiser).
- Sem serviço `ship`, a tecla G alterna walk → ship → space (depuração).

---

## 6. Seeds (`ctx.seed`)

```js
const r = ctx.seed.derive('galaxy', g, 'system', s, 'planet', p, 'region', face, x, y);
r.next(); r.range(a, b); r.int(a, b); r.pick(arr); r.weighted([[v, w], ...]);
r.chance(p); r.normal(m, sd); r.unitVector(); r.shuffle(arr); r.u32();
r.derive('biome')            // filho: caminho concatenado
ctx.seed.hash('galaxy', g)   // uint32 estável (sem estado) — bom para shaders/workers
ctx.seed.value(...path)      // [0,1) estável
```

xmur3 (hash do caminho) + sfc32 (gerador). **Mesmo caminho + mesma raiz =
mesma sequência, independente da ordem** em que outros caminhos foram
derivados. Raiz = `?seed=` (padrão 1337) ou `preset.seed`. Caminhos
canônicos: `galaxy,g` · `galaxy,g,system,s` · `…,planet,p` · `…,planet,p,moon,m`
· `…,planet,p,<subsistema>,...` (ex.: `'flora'`, `'fauna'`, `'terrain'`).
Workers recebem o `hash()` numérico e recriam o gerador com
`rngFromKey`/`sfc32` de `core/Rng.js`.

---

## 7. Workers (`ctx.workers`)

```js
const pool = ctx.workers.pool('terrain',
  () => new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' }),
  { size: 3, fallback: handlersNoThreadPrincipal });
const job = pool.run('chunk', payload, { priority: distancia, transfer: [buf], key: chunkId });
job.then(...); job.cancel();
pool.reprioritize((job) => novaPrioridade /* ou null para cancelar */);
await pool.idle();  ctx.workers.busy;  await ctx.workers.idle();
```

- O `new URL('./x.worker.js', import.meta.url)` precisa estar literal no
  arquivo da feature (o Vite empacota o worker a partir dele).
- Lado worker: `import { serve, transfer } from '../../core/workerHost.js'`;
  `serve({ chunk(payload) { return transfer({ pos }, [pos.buffer]); } })`.
- Prioridade menor = mais urgente; `key` igual substitui job ainda na fila
  (o antigo rejeita com `err.cancelled`). Tamanho padrão: núcleos − 1 (1..4).
- Sem Worker → `fallback` roda no thread principal (cedendo entre jobs).

---

## 8. Render (`ctx.pipeline`) e camadas

1. **Mundo** `ctx.scene` → `pipeline.hdr` (HalfFloat, depth float32, MSAA = `quality.msaa`), LINEAR, sem tone mapping.
2. ganchos `afterWorld` (`pipeline.addPass('afterWorld', fn, { order, owner })` — `fn(ctx, target, dt)`; nuvens/neblina/água que leem `pipeline.hdr.depthTexture`).
3. **Cockpit** `ctx.cockpit.scene` → mesmo alvo, depth limpo antes (sempre por cima). Referencial da NAVE: a câmera do cockpit fica em `player.cockpitEye` com `q = q_nave⁻¹·q_câmera`; FOV próprio (`cockpit.camera.fov`, 70). Luzes próprias (`cockpit.sun`, `cockpit.ambient`) que o núcleo orienta pelo `sky` a cada frame. `cockpit.visible` liga/desliga a camada.
4. ganchos `afterCockpit`.
5. **Saída** `pipeline.present(texture)`: ACES (`renderer.toneMapping`) + exposição (`pipeline.exposure`) + sRGB → canvas.
6. **HUD**: DOM em `ctx.ui`.

O sistema `render` instala a cadeia inteira com
`ctx.pipeline.install((ctx, dt) => {...}, 'render')` e reaproveita
`renderWorld(target)`, `runStage(stage, target, dt)`, `renderCockpit(target)`,
`present(texture)`, `hdr`, `width/height` (evento `pipeline:resize`).
Cadeia que lança é desinstalada (volta ao direto) e o erro vai para
`ctx.errors`. `renderer.info` soma TODAS as passadas do frame.

**Orçamento (preset `high`): < 400 draw calls e < 3M triângulos por frame**,
medido em `renderer.info` (o shot.mjs avisa quando estoura). Referência por sistema:

| Sistema | draw calls | triângulos |
|---|---|---|
| planet (terreno + água) | 120 | 1,2M |
| flora (instanciada) | 80 | 0,8M |
| fauna | 30 | 0,15M |
| sky + atmosfera + clima/nuvens | 20 | 0,05M |
| universe (corpos, anéis, cinturões) | 20 | 0,1M |
| ship + cockpit | 30 | 0,15M |
| render (pós, sombras CSM *extras*) | 40 | 0,3M |
| gameplay/HUD/efeitos | 30 | 0,1M |
| reserva | 30 | 0,15M |

---

## 9. Entrada (`ctx.input`)

Igual ao IRONLINE (`down`, `action`, `pressed`, `released`, `consume`,
`consumeLook`, `consumeWheel`, `simulate`, `locked`, `requestLock`,
`exitLock`, toque com `axis`). Ações padrão (`input.bindings`, editável):

| Ação | Teclas | Uso |
|---|---|---|
| `forward back left right` | WASD / setas | andar · empuxo |
| `jump` | Espaço | pular / jetpack · subir |
| `descend` | Ctrl, C | descer (nave) |
| `sprint` | Shift | correr · pós-combustor |
| `rollLeft rollRight` | Q / E | rolar |
| `interact` | F | interagir (embarcar, coletar) |
| `toggleView` | V | 1ª/3ª pessoa (o núcleo trata) |
| `cycleMode` | G | depuração: walk → ship → space (só sem serviço `ship`) |
| `pulse` | H | pulso/warp (ship) |
| `scan` | X | scanner (gameplay) |
| `inventory map pause` | Tab, M, Esc/P | |
| `fire aim` | Mouse0, Mouse2 | ferramenta / mira |

F3 telemetria (núcleo), F7 desempenho (PerfOverlay).

---

## 10. Pronto (`ctx.ready`) e modo shot

```js
ctx.ready.wait(promise, 'terreno: anel 0');   // devolve a promise
const done = ctx.ready.busy('streaming'); ... done();
```

`window.__ready` = features iniciadas + preset aplicado + **sem pendências
há ≥ 2 frames** + ≥ 3 frames. No modo shot o núcleo reaplica a pose do
preset uma vez quando estabiliza (caso `heightAt` tenha mudado). Pendência
além de `?readyTimeout=` (s, padrão 300) vira erro em `ctx.errors`. Rejeição
de uma promise registrada vira erro `ready` (não lança).

**Regra para o planet / flora / sky:** registre o trabalho necessário para a
primeira imagem estar correta (chunks ao redor da câmera até o LOD final,
IBL gerado…). Registre ANTES de retornar do `frame` em que percebeu a
necessidade.

---

## 11. Qualidade (`ctx.quality`)

Presets `low | medium | high | ultra` (+ `auto` com governador), camadas de
aparelho (`desktop | low-desktop | mobile | lite`) e `quality.set()` →
`quality:change`, como no IRONLINE. Campos (dicas):

`dprCap, msaa (amostras), shadows, shadowMapSize, shadowCascades, shadowScale,
anisotropy, ssao, bloom, taa, motionBlur, volumetrics, terrainError (px de erro
de tela do LOD), drawDistance (m), floraDensity, floraDistance (m), faunaBudget,
cloudQuality (0..3), atmosphereSamples, particleBudget, textureSize,
renderScale, detail, hdr, probes, tier`.

O modo shot usa `high` (fixo) salvo `&q=`.

---

## 12. Presets de screenshot (`src/shots/*.js`)

Um arquivo por dono (`src/shots/<sistema>.js`), só DADOS (sem imports —
o `tools/shot.mjs` os lê também em node). `export default` um preset ou lista:

```js
{
  name: 'flora-closeup', owner: 'flora', desc: '…',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk' | 'ship' | 'space', view: 'first' | 'third',
  camera: {
    lat, lon, alt,          // graus; alt = m acima do solo (walk: olhos)
    heading, pitch, fov,    // graus; pitch pode ser { horizon: g } (g graus acima do horizonte geométrico)
    anchor: { body: 'moon', elevation: 14, azimuth: 0 },  // opcional: escolhe lat/lon p/ o corpo ficar a 14° no céu
    look: { body: 'sun' | 'moon' | 'planet' | '<id>', offset: 0 }, // opcional: rumo para o corpo
  },
  timeOfDay: 0.42,          // hora LOCAL (0,5 = meio-dia; 0,75 ≈ pôr do sol)
  weather: 'clear', hud: false, cockpit: true, sim: 0,
  params: {},               // livre para o dono (ctx.shot.preset.params)
}
```

URL: `?shot=<nome>` + sobrescritas `&seed= &system= &planet= &time= &weather=
&hud= &sim= &mode= &view= &lat= &lon= &alt= &heading= &pitch= &fov= &q=`.
No modo shot: `Math.random` semeado, tempo do mundo congelado
(`time.frozen`), jogador congelado, sem menu/tela de carga, `cockpit.visible
= preset.cockpit ?? (mode === 'ship')`. `preset.sim` roda N segundos de
simulação antes de congelar.

**Canônicos** (`src/shots/canonical.js`, dono: integração): `horizon`,
`orbit`, `cockpit`, `sunset`. `tools/shot.mjs --all` captura todos; imprime
erros, `calls`/`tris`, luminância média, modo de depth e placeholders ativos.
`--size 540|720|1080` (padrão 720). SwiftShader é lento: o tempo é esperado.

---

## 13. Serviços — API e fallback

Convenções: direções são `Vector3` unitários no referencial do mundo;
posições de mundo são `WorldPos`; cores são `THREE.Color` ou `[r,g,b]`
LINEARES. Getters são vivos (`ctx.provide` os preserva). Leia sempre com
encadeamento opcional quando o serviço pode faltar.

### `universe` (dono: universe) — placeholder no núcleo

| Membro | |
|---|---|
| `galaxy` | `{ index, id, name, systemCount }` |
| `currentSystem` | `{ id, index, galaxy, name, stars[], planets[], belts[], bodies[] }` |
| `stars[i]` | `{ id, kind: 'star', name, class/spectralClass ('O'..'M'), temperature (K), color [r,g,b] linear (máx 1), intensity (relativa, G = 1), radius (m), position (WorldPos INERCIAL — o céu gira; ver sky) }` |
| `planets[i]` | `{ id, kind: 'planet', index, name, seed (uint32), radius (m), biome, gravity (m/s²), seaLevel (m relativo ao raio, ou null), atmosphere \| null, rings \| null, moons[], position (WorldPos no referencial do planeta atual) }` |
| `atmosphere` | `{ radius (m, topo), rayleigh [r,g,b] (1/m), rayleighHeight (m), mie (1/m), mieHeight (m), mieG, sunIntensity }` |
| `rings` | `{ inner, outer (m), color [r,g,b], tilt (rad) }` |
| `moons[j]` | como planeta, `kind: 'moon'`, `parent` |
| `belts[k]` | `{ id, kind: 'belt', inner, outer (m) }` |
| `currentPlanet` / `currentPlanetIndex` | planeta onde está o jogador (centro = `space.planetCenter`) |
| `bodies()` | lista plana de estrelas, planetas e luas |
| `findBody(q)` | id, ou `'star'/'sun'`, `'moon'` (1ª lua do atual), `'planet'` (1º vizinho) |
| `warpTo(systemId \| index, planetIndex?)` | → Promise; regenera e emite `system:enter { system, planet }` |
| eventos | `system:enter`, `planet:enter { planet }`, `space:recenter { offset }` |

Luas e planetas NÃO giram com a hora do dia (o universe os posiciona direto
no referencial do planeta, e pode animá-los). Fallback: placeholder do
núcleo (mesmo formato). O universe lê `ctx.start` no `init`.

### `planet` (dono: planet) — placeholder no núcleo (esfera lisa)

| Membro | |
|---|---|
| `radius` | m (raio de referência; alturas relativas a ele) |
| `center` | `WorldPos` (= `space.planetCenter`) |
| `gravity` | m/s² |
| `seaLevel` | m relativo ao raio, ou `null` sem oceano |
| `heightAt(dirUnit)` | **síncrono, double, determinístico**: altura do solo (m) na direção — a MESMA função que gera a malha (diferença ≤ 5 cm no LOD mais fino perto da câmera). Física e posicionamento de tudo dependem dela |
| `normalAt(dir, out?)` | normal do terreno (`Vector3`) |
| `biomeAt(dir)` | `{ id, name, palette: { grass, rock, sand, water, sky, … [r,g,b] linear }, temperature, humidity, flora (0..1), fauna (0..1), … }` |
| `palette` | paleta do bioma dominante |
| `isOcean(dir)` | solo abaixo de `seaLevel` |
| `surfacePoint(dir, out?)` | `WorldPos` no solo |
| `raycast(origin, dir, maxDist?)` | → `{ distance, point (WorldPos), normal } \| null` contra o terreno |
| `edit(worldPos, radius, sign)` | escavar (−1) / preencher (+1); → bool/Promise; emite `terrain:edit { worldPos, radius, sign }` |
| eventos | `terrain:chunk { id, lod, center (WorldPos), radius, added \| removed, mesh? }` — flora/fauna usam para popular |
| prontidão | `ctx.ready.wait(...)` até os chunks ao redor da câmera estarem no LOD final |

Fallback (placeholder): esfera lisa, `heightAt = 0`, `raycast` analítico,
`edit` = false, sem `terrain:chunk`.

### `sky` (dono: sky) — placeholder no núcleo

| Membro | |
|---|---|
| `sunDirection` | `Vector3` vivo (do planeta para o sol, no referencial do mundo) |
| `sunColor` / `sunIntensity` | cor linear JÁ atenuada pela atmosfera na câmera / intensidade (unidades do three) |
| `suns` | `[{ direction, color, intensity }]` (sistemas binários) |
| `ambient` | `{ color, intensity }` (céu) |
| `envMap` | `Texture` PMREM do céu/bioma, ou `null` (render/planet podem usar em `scene.environment`) |
| `sun` | a `DirectionalLight` principal (render pode trocar por CSM) |
| `timeOfDay` | hora LOCAL na posição do jogador (0..1; 0,25 nascer, 0,5 meio-dia, 0,75 pôr) |
| `setTime(t)` | ajusta a rotação do céu para que a hora local seja `t` |
| `rotation` / `dayLength` | rad do céu em torno de +Y / s por dia (avança com `time.world`) |
| `fogAt(worldPos)` | `{ color, density }` (perspectiva aérea para quem não usa o fog da cena) |
| `atmosphere` | parâmetros em uso (mesmo formato do universe) |
| eventos | `sky:time { t }` (opcional) |

Hora do dia: a direção aparente do sol = `R_y(rotation)·dirInercial(estrela)`.
Fallback: placeholder do núcleo (domo Rayleigh/Mie, sol direcional com
sombra, hemisférica, `FogExp2`).

### `weather` (dono: weather) — placeholder `{ weather: 'clear' }`

| Membro | |
|---|---|
| `weather` | `'clear' \| 'storm' \| 'acid' \| 'blizzard' \| 'dust'` |
| `cloudCoverage` | 0..1 |
| `intensity` | 0..1 (chuva/neve/poeira) |
| `wind` | `Vector3` m/s no referencial local |
| `set(weather, { transition })` | |
| eventos | `weather:change { weather, prev }` |

### `render` (dono: render) — sem placeholder (pipeline direto)

| Membro | |
|---|---|
| `setBloom({ strength, threshold, radius })` | |
| `registerSelectiveBloom(obj)` / `unregisterSelectiveBloom(obj)` | objetos emissivos que devem brilhar (sol, motores, telas) |
| `shadows` | `{ csm, cascades, setLightDirection(dir) }` |
| `exposure` / `setExposure(v)` | |

Fallback: chamadas opcionais (`ctx.services.render?.registerSelectiveBloom?.(o)`) viram no-op; emissivos ainda aparecem pelo tone mapping.

### `ship` (dono: ship) — nave/cockpit placeholder + FlyController

| Membro | |
|---|---|
| `state` | `'landed' \| 'flying' \| 'space' \| 'pulse' \| 'warp'` |
| `worldPos` / `quaternion` / `speed` | da nave (a nave pousada continua existindo quando o jogador anda) |
| `land()` / `takeoff()` | → Promise |
| `pulse(on)` / `warp(systemId)` | salto sublumínico / entre sistemas (usa `universe.warpTo`) |
| `board()` / `exit()` | embarcar/desembarcar (troca `player.mode`) |
| eventos | `ship:land`, `ship:takeoff`, `ship:pulse { on }`, `ship:warp { systemId }` |

O ship instala o controlador com `player.setController('ship', …)` (e
`'space'` se quiser), põe o cockpit em `ctx.cockpit.scene` e o casco no
mundo. Publicar `ship` remove a nave placeholder e desliga a tecla G.

### `flora` (dono: flora) — opcional

`near(worldPos, radius)` → `[{ id, kind, worldPos, radius }]` (colisão,
coleta); `remove(id)`; `density(dir)`; eventos `flora:remove { id }`.
Fallback: nenhum obstáculo.

### `fauna` (dono: fauna) — opcional

`list` → `[{ id, species, worldPos, velocity, radius }]`; `get(id)`;
eventos `fauna:spawn`, `fauna:despawn`. Fallback: lista vazia.

### `gameplay` (dono: gameplay) — opcional

`inventory { items, add(id, n), remove(id, n), count(id) }`; `spawn`
(`{ mode, camera: { lat, lon, … }, timeOfDay }` — posição inicial fora do
modo shot); eventos `gameplay:*`. Pode publicar `hud` (o núcleo então não
remove a tela de carga — a HUD remove) e chamar `ctx.menu.disable()` se
tiver menu próprio.

### `audio` (dono: audio) — opcional

`play(name, worldPos?, { volume, pitch, loop })` → `{ stop(), setPosition(wp) }`;
`setMaster(v)`; `unlock()` (gesto do usuário). Posições em `WorldPos`; o
ouvinte é `player.cameraWorld`. Fallback: `ctx.services.audio?.play?.(…)` → no-op.

---

## 14. Eventos do núcleo

| Evento | Payload |
|---|---|
| `service:ready` | `{ name, api }` |
| `player:mode` | `{ mode, prev }` |
| `space:recenter` | `{ offset }` (emitido pelo universe; o núcleo reage) |
| `resize` | `{ width, height, dpr, bufferWidth, bufferHeight }` |
| `pipeline:resize` / `pipeline:install` | `{ width, height }` / `{ owner }` |
| `quality:change` / `quality:auto` | `quality` / `{ rung, scale, reason }` |
| `input:lock` / `input:touch` | bool |
| `ready` / `game:start` | `ctx` |
| `renderer:lost` / `renderer:restored` | `{}` |
