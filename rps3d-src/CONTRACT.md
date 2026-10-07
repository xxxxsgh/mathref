# RPS3D — contrato entre núcleo e sistemas

RAFAEL PAOLI SHOOTER 3D: REVOLUTION. Exploração espacial contínua (espaço →
atmosfera → superfície sem loading), combate em nave e a pé. Referências de
qualidade: No Man's Sky, Star Citizen, Elite Dangerous, Starfield.

Este arquivo é a fonte da verdade para quem trabalha num sistema. Se ele e o
código do núcleo (`src/main.js`, `src/core/`) divergirem, o código vence e
este arquivo deve ser corrigido.

## Stack

- Three.js **0.185.1** via `import * as THREE from 'three/webgpu'` e
  `import { ... } from 'three/tsl'`. Pós-processamento em
  `three/addons/tsl/display/*.js` (`RenderPipeline`, `bloom`, `traa`,
  `motionBlur`, `dof`, `film`, `lensflare`, `godrays`, `gtao`...).
- **WebGPURenderer** com fallback automático para WebGL2 (`?gl=1` força
  WebGL2). Todo material é *NodeMaterial* (MeshStandardNodeMaterial,
  MeshPhysicalNodeMaterial, MeshBasicNodeMaterial, SpriteNodeMaterial...)
  com shaders em **TSL**. **Não use** ShaderMaterial/onBeforeCompile/GLSL cru:
  não funcionam no WebGPURenderer.
- Tone mapping AgX, saída sRGB, HDR (valores > 1 são esperados — o bloom
  depende disso: estrelas, motores, lasers e lava devem ter emissivo forte).
- `logarithmicDepthBuffer: true` — near 0,05 m, far 5e9 m na mesma câmera.
  Shaders que leem profundidade precisam considerar isso
  (`logarithmicDepthToViewZ`, `perspectiveDepthToViewZ` em three/tsl).
- Vite 8. `npm run dev`, `npm run build` (sai em `../rps3d/`).
- Sem assets baixados: tudo procedural (geometria, texturas em canvas/
  DataTexture/TSL, áudio sintetizado). Sem nomes, logos ou marcas de jogos
  existentes.

## Regras de posse

1. **Cada sistema edita apenas a própria pasta** `src/systems/<nome>/`.
   Crie quantos arquivos quiser lá dentro.
2. **Nunca importe arquivos de outro sistema.** Comunicação só por
   `ctx.get('<serviço>')` (APIs publicadas com `ctx.provide`) ou pelo
   barramento `ctx.bus`. Serviços podem não existir (sistema ausente ou
   quebrado): sempre use `ctx.get('x')?.metodo()` e degrade com elegância.
3. O núcleo (`src/main.js`, `src/core/`, `tools/`, `index.html`, este
   arquivo) é do orquestrador. Se precisar MUITO de algo no núcleo, faça
   uma mudança **mínima e aditiva** (nunca quebre a API), releia o arquivo
   imediatamente antes de editar (outro agente pode estar mexendo) e
   registre a mudança no seu relatório.
4. Sem `git commit/push/checkout/stash/reset/clean`. O orquestrador commita.
5. Rascunhos (screenshots, logs) vão para
   `/tmp/claude-0/-home-user-mathref/5b4325bc-ef8b-5797-a4b6-a1a6b5dad994/scratchpad/rps3d/`,
   nunca para o repositório.
6. Comentários, textos de UI e diálogos em **português (pt-BR)**.
7. Antes de terminar: `npx vite build` passa e `node tools/shot.mjs` dos
   seus cenários roda sem erros de página nem de sistema.

## Anatomia de um sistema

`src/systems/<nome>/index.js`:

```js
export default {
  name: 'planets',   // único; igual ao nome da pasta
  label: 'planetas', // texto da tela de boot
  order: 20,         // menor inicializa/atualiza primeiro
  async init(ctx) {},   // pode ser async; publique serviços aqui (ctx.provide)
  update(dt, ctx) {},   // PASSO FIXO 1/60 s — lógica, física, IA
  frame(dt, ctx) {},    // por frame de render (dt variável) — visual, câmera, HUD
};
```

Erros em `update/frame` são capturados e registrados em `ctx.errors`; um
sistema que erra sem parar é desligado sem derrubar o jogo.

Ordens reservadas: render 5 · space 10 · planets 20 · life 30 · ships 35 ·
flight 40 · combat 45 · onfoot 50 · locations 55 · stations 60 ·
economy 65 · story 70 · audio 80 · hud 90 · perf 95.

## O contexto `ctx`

| campo | o quê |
|---|---|
| `THREE` | namespace `three/webgpu` |
| `renderer` | WebGPURenderer (`ctx.isWebGPU` diz o backend real) |
| `scene` | cena única |
| `root` | `Group` com TUDO que vive no mundo (sofre origem flutuante) |
| `camera` | PerspectiveCamera única (filha da cena; o controlador do modo atual a move) |
| `sun` | DirectionalLight da estrela (o sistema `space` controla) |
| `ambient` | HemisphereLight fraca de preenchimento |
| `bus` | eventos (`on/once/emit`) |
| `quality` | `quality.name`, `quality.p.<campo>` (ver `src/core/Quality.js`), `quality.renderScale` |
| `input` | ações unificadas (ver `src/core/Input.js`) |
| `save` | IndexedDB (`put/get/del/keys`) |
| `galaxy` | dados procedurais (`src/core/Galaxy.js`) |
| `world` | sistema estelar atual + origem flutuante (`src/core/World.js`) |
| `state` | estado serializável do jogo (cada sistema cuida da própria chave) |
| `mode` | `'boot'|'menu'|'cinematic'|'ship'|'foot'|'station'|'free'` |
| `setMode(m, data)` | troca de modo (emite `mode:change`) |
| `provide(nome, api)` / `get(nome)` | serviços |
| `scenario(nome, desc, async setup(ctx))` | cenário de teste/captura (`?scenario=nome`) |
| `uiLayer(nome, z)` | `div` próprio dentro de `#ui` (pointer-events: none; ligue nos filhos) |
| `render()` | função de render do frame (o sistema `render` substitui) |
| `time`, `frameCount`, `fps`, `paused`, `errors`, `params` (URLSearchParams) | |
| `saveGame()` | coleta (`save:collect`) e grava o autosave |

### Escala, unidades, eixos

- Metros, segundos, radianos. +Y é "para cima" num referencial local;
  **frente de nave/câmera = −Z**.
- Planetas rochosos 30–110 km de raio, gigantes gasosos 350–900 km,
  órbitas 2.000–40.000 km, estrela com 50–600 km de raio. Ver `Galaxy.js`.
- **Origem flutuante:** `local = sistema − world.origin`. Tudo em
  `ctx.root`. O núcleo chama `world.rebase()` todo frame seguindo
  `world.focus` (defina com `world.setFocus(obj)` — o controlador do modo
  atual faz isso). Guardou posições locais fora da cena? Escute
  `world:originShift {x,y,z}` e subtraia.
- **Referencial do corpo celeste:** cada corpo tem um `frame` (Object3D
  filho de `root`, posicionado no centro do corpo e GIRANDO com o dia). Perto
  de um planeta (dentro da atmosfera), nave/jogador/criaturas/estruturas são
  filhos desse frame e a física roda nele. `world.reparent(obj, pai)` troca
  de referencial preservando a transformação.

### Modos e quem controla a câmera

| modo | dono da câmera | descrição |
|---|---|---|
| `menu` | story | menu principal com cena de fundo |
| `cinematic` | story | cenas no motor (input do jogador limitado) |
| `ship` | flight | pilotando (cockpit em 1ª pessoa; 3ª pessoa opcional) |
| `foot` | onfoot | a pé (planeta, interior de nave/estação, abordagem) |
| `station` | onfoot | a pé dentro de estação (gravidade plana) |
| `free` | núcleo (FreeCam) | câmera livre de depuração/cenários |

## Eventos (barramento)

Formato `dominio:acao`. Os principais (emissor → payload):

- `world:system` (núcleo) `{system, prev}` — sistema estelar carregado/trocado.
- `world:originShift` (núcleo) `{x,y,z}`.
- `mode:change` (núcleo) `{mode, prev, ...}`.
- `quality:change` (núcleo) `{name, p}` · `resize` `{w,h,pr}`.
- `game:boot` (núcleo, sem `?scenario`) — story mostra o menu.
- `game:new` / `game:continue` (story).
- `save:collect` (núcleo) `state` — escreva sua parte em `state`.
- `save:loaded` (story) `state`.
- `terrain:chunkAdd` / `terrain:chunkRemove` (planets) — ver serviço planets.
- `flight:landed` / `flight:takeoff` / `flight:quantumStart` / `flight:quantumEnd`
  / `flight:jumpStart` / `flight:jumpEnd` / `flight:atmosphereEnter` / `flight:atmosphereExit`
  / `flight:interdicted` (flight).
- `ship:damaged` `{ship, amount, hit}` · `ship:destroyed` `{ship, by}` (combat).
- `combat:kill` `{victim, faction, by}` · `combat:start` / `combat:end` (combat — trilha dinâmica).
- `player:damaged` `{amount, type, dir}` · `player:died` (onfoot/flight).
- `scan:discovery` `{kind, speciesId, name, bodyId, value}` (life/onfoot).
- `economy:credits` `{credits, delta}` · `economy:item` `{id, qty, total}`.
- `mission:accepted|updated|completed|failed` `{mission}` (story).
- `rep:change` `{faction, value, delta}` (story).
- `station:docked` / `station:undocked` `{station}` (stations).
- `radio` `{from, faction, text, duration}` — qualquer um; hud mostra legenda, audio toca estática.
- `fx:shake` `{intensity, duration}` · `fx:flash` `{color, intensity}` — qualquer um; render aplica.

## Serviços (APIs entre sistemas)

Assinaturas mínimas que cada dono DEVE publicar. Pode adicionar mais;
documente no topo do seu `index.js`. Posições são `Vector3` locais (cena)
a menos que dito o contrário.

### `render` (sistema render — pós, materiais, fx)
- Substitui `ctx.render` por um `RenderPipeline`: HDR, bloom físico, TAA
  (TRAA), motion blur, DoF, film grain, lens flare, god rays, vinheta,
  aberração cromática leve; cada efeito liga/desliga por preset.
- Sombras em cascata (CSM) na `ctx.sun`.
- `render.shake(intensity, duration)`, `render.flash(color, intensity)`,
  `render.setDOF({enabled, focus, aperture})`, `render.setExposure(ev)`,
  `render.setHeatDistortion(amount)`, `render.setVisor({rain, frost, dust, crack})`
  (efeito de tela em 1ª pessoa: capacete/vidro do cockpit).
- `render.pbr(opts)` → NodeMaterial PBR com texturas procedurais (painéis,
  rebites, sujeira, desgaste, triplanar) — `opts: {color, metalness,
  roughness, panel, grime, wear, emissive, emissiveIntensity, triplanarScale}`.
- `render.envMap` / `render.updateEnvironment()` — mapa de ambiente para
  reflexos PBR (atualizado periodicamente a partir do céu).

### `fx` (sistema render — partículas na GPU)
- `fx.explosion(pos, {scale, color, parent, debris})`, `fx.sparks(pos, normal, {count, color})`,
  `fx.muzzle(object3d, {color})`, `fx.smoke(pos, {...})`, `fx.debris(pos, vel, {count, color, size})`,
  `fx.beam(from, to, {color, width, life})`, `fx.trail(object3d, {color, width, length})` → handle `{dispose()}`,
  `fx.heat(pos, radius, life)` (distorção de calor), `fx.impact(pos, normal, surface)`.
- `pos` pode ser local da cena; `parent` opcional (ex.: frame de planeta).

### `space` (sistema space — espaço profundo)
- Céu: campo de estrelas + Via Láctea + nebulosas por raymarching, estrela
  do sistema (disco, corona, flare), binárias, buraco negro com disco de
  acreção e lente gravitacional, cinturões de asteroides instanciados,
  campos de destroços, tempestades de íons, eventos aleatórios (naves à
  deriva, sinais de socorro, emboscadas — apenas o *spawn visual/dados*;
  combat/story dão a jogabilidade).
- Controla `ctx.sun` (direção a partir da estrela, cor, intensidade —
  multiplicada por `planets.sunTransmittance(pos)` quando existir).
- `space.starLocal(out)` → posição local da estrela.
- `space.asteroids(posLocal, radius)` → `[{id, position, radius, resource, amount, mine(qty) → qty extraído}]`.
- `space.skyBrightness` (0..1, o céu de planeta escurece as estrelas: leia
  `planets.skyOpacity(camera)`).
- `space.events()` → eventos ativos `[{id, type, position, data}]`; emite
  `space:event` `{event}` quando um surge perto do jogador.

### `planets` (sistema planets — planetas e atmosfera)
- Terreno em **quadtree LOD por chunks** em cubo-esfera, geração em
  worker/fatias de frame (sem travar), triplanar + texturas procedurais por
  bioma, oceanos/lava/ácido, atmosfera Rayleigh/Mie (de dentro e de fora),
  nuvens volumétricas, gigante gasoso com bandas e anéis, luas, ciclo
  dia/noite (frame girando), clima dinâmico (chuva, neve, nevasca,
  tempestade de areia, cinzas, névoa ácida, tempestade elétrica).
- `planets.frame(bodyId)` → Object3D girante do corpo.
- `planets.nearest(posLocal)` → `{body, frame, distance, altitude, inAtmosphere, density}` (density 0..1 da atmosfera no ponto).
- `planets.surface(bodyId, posBody)` → `{height, normal, water, biomeZone}` (posBody = posição no referencial do corpo; `height` em metros acima do raio).
- `planets.groundPoint(bodyId, dirBody)` → Vector3 no referencial do corpo, na superfície.
- `planets.raycast(originLocal, dirLocal, maxDist)` → `{point, normal, bodyId, distance} | null`.
- `planets.weather(bodyId)` → `{type, intensity, wind: Vector3, visibility, temperature, hazard}`.
- `planets.sunTransmittance(posLocal)` → `Color` (extinção atmosférica; preto à noite).
- `planets.skyOpacity(posLocal)` → 0..1 (0 = espaço; 1 = céu diurno opaco).
- `planets.pois(bodyId)` → `[{id, type, dirBody, name, seed}]` — pontos de interesse determinísticos (`'outpost'|'ruin'|'crash'|'cave'|'bunker'|'landing_pad'|'geysers'|'base_site'`). As estruturas são construídas pelo sistema `locations`.
- Eventos `terrain:chunkAdd` `{bodyId, key, lod, frame, mesh, center (corpo), size, sample(u,v) → {pos, normal, height, slope, water}}` e `terrain:chunkRemove` `{bodyId, key}` — flora/estruturas usam para instanciar por chunk.

### `ships` (sistema ships — naves e cockpits)
- Modelos procedurais detalhados por classe e facção, PBR, luzes de
  navegação, brilho de motor, trem de pouso; cockpit interior completo com
  MFDs funcionais (radar, escudos, alvo, mapa), botões iluminados, manche e
  acelerador animados, chuva/poeira/gelo no vidro, HUD holográfico projetado;
  interior caminhável nas naves maiores; customização (pintura, componentes).
- `ships.CLASSES` → `{fighter, interceptor, freighter, explorer, frigate, ...}` com stats
  (massa, empuxo por eixo, velocidade máx., taxas de giro, escudo, casco,
  calor, carga, pontos de arma, alcance de salto, preço).
- `ships.create(classId, {faction, paint, npc})` → `ShipHandle {
   object3d, classId, def, faction, hardpoints:[{object3d, type}],
   setThrottle(v, boost), setGear(down), setDamage(0..1), setShieldHit(dirLocal),
   setReentry(0..1), dispose() }`.
- `ships.cockpit(handle)` → `Cockpit { group, eye (Object3D da cabeça),
   update(dt, telemetry, inputs), seatExit (Object3D), interior? {group, colliders, spawn} }`.
  `telemetry` é o objeto `flight.telemetry` (ver abaixo); `inputs` = `{pitch, yaw, roll, throttle, strafe:{x,y}, fire, boost}`.
- `ships.customize(handle, {paint, components})`.

### `flight` (sistema flight — voo do jogador)
- Modo `ship`: 6DOF com inércia, boost, modo desacoplado, distribuição de
  energia (escudo/motor/armas), voo atmosférico (arrasto, sustentação
  simples, turbulência), reentrada com fogo, nuvens atravessando, pouso
  em qualquer lugar plano/plataformas, decolagem, viagem quântica entre
  corpos (com interdição), salto entre sistemas (efeito + `world.loadSystem`),
  câmera de cockpit com G-force/head-bob/olhar livre, 3ª pessoa.
- `flight.ship` → ShipHandle do jogador · `flight.telemetry` → `{speed, velocity,
  throttle, boost, decoupled, pips:{shield, engine, weapons}, shield, hull,
  heat, fuel, quantumFuel, altitude, body, inAtmosphere, landed, gear,
  target, navTarget, quantumState, g}`.
- `flight.enter(spawnOpts)` (entra no cockpit, modo `ship`), `flight.exit()` (levanta e sai — passa a vez ao onfoot),
  `flight.teleport(posLocal, quaternion, {parent, velocity})`,
  `flight.setNavTarget({type, id, position})`, `flight.quantumTo(target)`, `flight.interdict(source)`,
  `flight.jumpTo(systemId)`, `flight.damage(amount, hitPosLocal, type)`,
  `flight.physics(handle)` → integrador reutilizável (combat usa para IA).

### `combat` (sistema combat — combate espacial)
- Armas com aquecimento, projéteis/lasers, indicador de antecipação
  (lead), mísseis teleguiados com travamento, flares/chaff, IA de dogfight
  por facção, naves capitais com torretas destrutíveis e hangares lançando
  caças, interdição, abordagem de nave desativada (entrega ao onfoot).
- `combat.spawn(classId, faction, posLocal, {ai:'aggressive'|'patrol'|'escort'|'flee', target})` → npc
- `combat.spawnCapital(type, faction, posLocal, opts)` → capital
- `combat.targets()` → alvos `[{id, object3d, faction, hostile, hull, shield, distance}]` · `combat.locked`
- `combat.setHostile(faction, bool)` · `combat.clear()`.

### `onfoot` (sistema onfoot — FPS a pé)
- Controlador em 1ª pessoa (gravidade esférica no frame do planeta ou plana
  em interiores), braços e armas visíveis, rifle de pulso, escopeta de
  plasma, sniper de trilho, pistola de íons, granadas, recuo, munição,
  recarga animada, capacete (gotas, reflexo), jetpack, sprint, escalada
  leve, multiferramenta (scanner, laser de mineração, lanterna, hack),
  sobrevivência (O₂, frio/calor/toxinas, energia do traje), inimigos
  (soldados da Hegemonia, piratas, criaturas hostis via `life`, sentinelas
  Vigilantes) com IA e cobertura.
- `onfoot.spawn(posLocal|posBody, {parent, up, facing})` → entra no modo `foot`
- `onfoot.enterInterior(group, {spawn, colliders, gravity})` (estações, naves, abordagem) → modo `station`/`foot`
- `onfoot.player` → `{object3d, health, oxygen, suitEnergy, hazard, weapon, ammo}`
- `onfoot.spawnEnemy(type, pos, {parent, faction})` · `onfoot.damage(amount, type, dirLocal)`.
- `onfoot.colliders` — `add(mesh|box)`/`remove` para estruturas caminháveis.

### `locations` (sistema locations — lugares em terra e base)
- Constrói as estruturas dos `planets.pois`: postos avançados, naves
  caídas, cavernas, ruínas dos Arquitetos (quebra-cabeças de luz, portas
  antigas), bunkers, plataformas de pouso; base própria com módulos
  encaixáveis.
- `locations.near(posLocal, r)` → `[{poi, group, interactables}]` ·
  `locations.base` (construção de base: `place(moduleId)`, `modules`).

### `life` (sistema life — fauna e flora)
- Criaturas procedurais por partes (corpo/pernas/cabeça/cauda/asas),
  caminhada procedural (IK simples), comportamentos (bando, fuga, caça,
  territorial, voo), flora instanciada que balança ao vento, plantas
  perigosas, catálogo de espécies com nome editável.
- `life.scan(rayOriginLocal, dirLocal, maxDist)` → `{kind:'fauna'|'flora'|'mineral', id, speciesId, name, info, discovered} | null`
- `life.catalog()` · `life.rename(speciesId, nome)` · `life.creatures(posLocal, r)` · `life.damage(id, amount)`.

### `stations` (sistema stations)
- Estações orbitais grandiosas e iluminadas, aeróstatos em gigantes gasosos,
  base em asteroide; tráfego de NPCs; controle de tráfego por rádio e
  pouso guiado no hangar; interior a pé (bar, mercado, oficina, quadro de
  missões, NPCs andando).
- `stations.list()` · `stations.nearest(posLocal)` · `stations.requestDocking(id)` ·
  `stations.docked` · `stations.enterInterior()` · `stations.kiosk(type)` (abre UI: `'market'|'shipyard'|'outfitter'|'missions'|'bar'|'repair'`).

### `economy` (sistema economy)
- Itens/commodities, cargo/inventário, créditos, preços por estação com
  oferta e demanda, mineração→recursos, crafting (munição, upgrades),
  venda de descobertas, reparos, compra de naves (com `ships`), módulos de base.
- `economy.credits` · `economy.add(id, qty)` · `economy.remove(id, qty)` · `economy.has(id, qty)` ·
  `economy.inventory()` · `economy.market(stationId)` · `economy.buy/sell(stationId, id, qty)` ·
  `economy.craft(recipeId)` · `economy.ITEMS` · `economy.RECIPES` · `economy.ui(panel, opts)`.

### `story` (sistema story — história, missões, menu)
- Menu principal (novo/continuar/configurações), abertura cinematográfica
  em combate (a ordem de bombardear Nova Esperança → recusa → virar contra
  os aliados → fuga para o salto), campanha em 3 atos com cenas no motor e
  escolhas, reputação por facção, missões procedurais (recompensa, escolta,
  entrega, resgate, sabotagem, ruínas), rastreamento de objetivos, finais.
- `story.missions()` · `story.accept(mission)` · `story.active` · `story.rep(faction)` ·
  `story.addRep(faction, delta)` · `story.flag(name, value?)` · `story.generate(stationId)` (missões procedurais).

### `hud` (sistema hud — interface)
- HUD holográfico de nave e de traje, marcadores no mundo, retículo,
  indicadores de dano, radar, bússola, prompts de interação, legendas de
  rádio, toasts, objetivo atual, mapa do sistema/galáxia, menu de pausa e
  configurações (preset de qualidade, sensibilidade, inverter Y, volume),
  **controles de toque para iPad** (sticks virtuais + botões contextuais por
  modo, chamando `input.setVirtual/addLook`).
- `hud.marker(id, {position|object3d, label, color, kind})` / `hud.unmarker(id)`
- `hud.toast(text, kind)` · `hud.subtitle(speaker, text, {faction, duration})` ·
  `hud.prompt(text, action)` / `hud.prompt(null)` · `hud.objective(text)` ·
  `hud.panel(id, {title, html, onClose})` / `hud.closePanel(id)` · `hud.damage(dirLocal)` · `hud.visible(bool)`.

### `audio` (sistema audio)
- Web Audio 100% sintetizado: SFX espaciais (HRTF), motores, armas,
  explosões, passos, vento/chuva, UI; rádio das facções (estática + bipes +
  "vozes" processadas); trilha dinâmica generativa por estado.
- `audio.play(name, {position, object3d, volume, pitch, loop})` → handle `{stop(), setVolume(v), setPitch(p)}`
- `audio.music(state)` com estados `'menu'|'explore'|'space'|'combat'|'tension'|'station'|'cinematic'|'ruins'`
- `audio.ambience(kind, intensity)` · `audio.radio(faction)`.
- Começa no primeiro gesto do usuário (política de autoplay).

### `perf` (sistema perf)
- Overlay de fps (`?fps=1` ou nas configurações), estatísticas de draw
  calls/triângulos, ajustes finos de preset, ferramenta `tools/fps.mjs`.

## Cenários (testes e capturas)

Todo sistema registra cenários em `init` com `ctx.scenario(nome, desc, setup)`.
Nomes com prefixo do sistema (`planet-lush-orbit`, `ship-cockpit-fighter`...).
O `setup` deve deixar a cena pronta para captura (câmera posicionada, modo
definido — use `'free'` se ainda não houver controlador). Deve funcionar
mesmo se outros sistemas faltarem.

```
node tools/shot.mjs --list
node tools/shot.mjs --scenario planet-lush-orbit --out /tmp/.../x.png --params "q=high"
```

O Chromium de teste NÃO tem WebGPU utilizável: as capturas usam o fallback
WebGL2 (SwiftShader, CPU). O código precisa funcionar nos dois backends.
`--params "fixeddt=1"` deixa a simulação determinística.
