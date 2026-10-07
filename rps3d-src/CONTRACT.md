# RPS3D — contrato entre núcleo e sistemas

**RAFAEL PAOLI SHOOTER 3D: REVOLUTION.** Exploração espacial sem telas de
carregamento, combate em nave e a pé. Referências: No Man's Sky, Star Citizen,
Elite Dangerous, Starfield. Three.js 0.186 `WebGPURenderer` + TSL (fallback
WebGL2 automático), Vite, PWA, save em IndexedDB.

Este arquivo é a fonte da verdade para quem trabalha num sistema. Se ele e o
código do núcleo divergirem, o código vence e este arquivo deve ser corrigido.

## Regras

1. **Cada sistema edita só a própria pasta** `src/systems/<nome>/` (crie quantos
   arquivos quiser: shaders TSL, geradores, dados).
2. **Comunicação entre sistemas**: serviços (`ctx.provide('nome', api)` /
   `ctx.services.nome` / `await ctx.need('nome')`) e eventos (`ctx.bus`).
   **Nunca importe arquivos de outro sistema.** Todo uso de serviço alheio
   precisa de fallback (o outro sistema pode estar ausente, desligado por erro,
   ou ainda não implementado) — o jogo NUNCA pode quebrar por isso.
3. **Núcleo** (`src/core/`, `src/main.js`, `tools/`, `index.html`, `vite.config.js`,
   este arquivo): só mudanças pequenas, aditivas e retrocompatíveis, e
   registradas na seção *Mudanças no núcleo* no fim deste arquivo.
4. Tudo procedural ou criado por você. Nenhum asset baixado. Nada de nomes,
   logos ou marcas de jogos existentes.
5. Textos do jogo e comentários em **português (pt-BR)**.
6. Rascunhos (screenshots etc.) vão para o scratchpad, nunca para o repositório.
7. Git: commite só os seus caminhos — `git add src/systems/<nome> && git commit -m "RPS3D <nome>: ..." -- src/systems/<nome>` (se mexeu no núcleo/contrato, inclua esses caminhos). Outro agente pode estar commitando ao mesmo tempo: se der `index.lock`, espere uns segundos e tente de novo. Depois `git push -u origin HEAD` (repita até 4x com espera se falhar). Nunca `reset`, `checkout`, `stash`, `rebase` ou `push --force`.

## Anatomia de um sistema

`src/systems/<nome>/index.js` exporta default:

```js
export default {
  name: 'planets',   // único
  order: 15,         // menor inicializa/atualiza primeiro
  async init(ctx) {},  // aguardado em ordem
  update(dt, ctx) {},  // PASSO FIXO 1/60 s: física, IA, lógica, bordas de input
  frame(dt, ctx) {},   // por frame (dt variável): câmera, visual, LOD, animação
  dispose(ctx) {},
};
```

Cada chamada roda em try/catch: se um sistema lança em update/frame ele é
**desligado** sozinho, o erro vai para `window.__errors`, e o resto continua.
`?systems=a,b,c` carrega só esses sistemas (útil para isolar).

### Ordem de um frame
```
input.poll(dt)
para cada passo fixo pendente:  sistemas.update(1/60) em ordem; input.endStep()
sistemas.frame(dt) em ordem
world.sync()          → origem = player.camWorld; objetos registrados = posMundo - origem
await ctx.render(ctx, dt)   → padrão renderer.render(scene, camera); `rendering` substitui
```

## Sistemas, ordens e responsabilidades

| ordem | pasta | dono de | provê (`ctx.services.*`) |
|---|---|---|---|
| 5 | `rendering` | pipeline TSL (HDR, AgX, bloom, lens flare, TAA, motion blur, DoF, grain, god rays), luz do sol + sombras em cascata, IBL, explosões/partículas GPU, distorção de calor, shake | `rendering` |
| 10 | `deepspace` | céu estelar, estrelas (anã vermelha, gigante azul, binária, buraco negro c/ disco e lente), nebulosas por raymarching, cinturões de asteroides, campos de destroços, efeito de salto/quântico, mapa galáctico (dados) | `space` |
| 15 | `planets` | planetas em todas as distâncias (impostor → quadtree LOD em chunks), relevo procedural por bioma, texturização triplanar, atmosfera Rayleigh/Mie, nuvens volumétricas, oceanos, gigantes gasosos + anéis, ciclo dia/noite, clima (areia, nevasca, cinzas, chuva ácida, tempestade elétrica), provedor de chão para colisão | `planets` |
| 20 | `ships` | modelos procedurais PBR de todas as naves (classes × facções, naves capitais com torretas/hangares), cockpit interior completo (MFDs funcionais, manche/acelerador animados, botões, HUD holográfico, chuva/poeira no vidro), interiores andáveis, customização visual | `ships` |
| 25 | `flight` | física 6DOF da nave do jogador, assistência/desacoplado, boost, energia (escudo/motor/armas), viagem quântica, salto entre sistemas, voo atmosférico, reentrada, pouso/trem, câmera no modo `ship`, sentar/levantar | `flight` |
| 30 | `combat` | combate espacial: armas, calor, projéteis, mísseis teleguiados, flares/chaff, indicador de antecipação, IA de caças por facção, naves capitais (torretas destrutíveis, hangares lançando caças), dano/escudos, interdição, abordagem (gatilho) | `combat` |
| 35 | `foot` | FPS: controlador a pé, câmera no modo `foot`, braços e armas visíveis, multiferramenta (scanner, mineração, lanterna, hack), jetpack, escalada leve, sobrevivência (O₂, temperatura, toxinas, energia do traje), visor do capacete (reflexo, gotas), inimigos em terra, registro de interações | `foot`, `interact` |
| 40 | `life` | fauna procedural por partes com animação procedural e comportamentos; flora procedural com vento; catálogo do scanner e nomeação | `life` |
| 45 | `stations` | estações (exterior, hangar, pouso guiado, controle de tráfego por rádio), interiores a pé (bar, mercado, oficina, quadro de missões), NPCs andando; postos avançados, bunkers, ruínas dos Arquitetos (estruturas) | `stations` |
| 50 | `economy` | inventário, recursos, mineração, crafting, upgrades de traje/nave, comércio com oferta/demanda por sistema, compra de naves, base própria modular, créditos | `economy` |
| 55 | `story` | fluxo título → novo jogo/continuar, abertura cinematográfica, campanha em 3 atos, facções e reputação, missões procedurais, diálogos, rádio das facções, finais | `story`, `factions`, `missions` |
| 80 | `audio` | Web Audio procedural: motores, armas, explosões, áudio espacial, rádio filtrado, trilha dinâmica (exploração ↔ combate) | `audio` |
| 90 | `hud` | toda a UI: HUD de voo/a pé, marcadores, mapas (galáxia/sistema), menus, inventário/mercado/missões (telas), legendas, notificações, controles de toque (iPad), configurações (qualidade, sensibilidade, volume) | `hud` |
| 95 | `performance` | detecção de preset refinada, escala dinâmica de resolução, orçamento de LOD, overlay de FPS (`?fps=1`), cenários de benchmark | `performance` |

## `ctx`

| Campo | O que é |
|---|---|
| `THREE` | `three/webgpu` (importe `three/webgpu` e `three/tsl` nos seus arquivos) |
| `TSL` | `three/tsl` |
| `renderer` | `WebGPURenderer` (backend WebGPU ou WebGL2). AgX, sRGB, sombras ligadas, `logarithmicDepthBuffer: true` |
| `backend` | `'webgpu'` \| `'webgl'` |
| `scene`, `camera` | cena única; câmera `PerspectiveCamera` (FOV 72, near 0,05, far 2e9) **sempre em (0,0,0)** — origem flutuante. A câmera está na cena: filhos dela (cockpit, armas) renderizam |
| `world` | origem flutuante: `world.add(obj, posMundo, {getPos})` → `{remove()}`; `world.toLocal(v)`, `world.toWorld(v)`, `world.origin` |
| `player` | `{ mode, camWorld, pos, vel, ship, body, bodyId, altitude }` — quem controla a câmera escreve `camWorld` (mundo) e `camera.quaternion` |
| `game` | `{ mode, paused, setMode(to, data), setPaused(b) }` — modos: `title`, `cinematic`, `ship`, `foot`, `map` |
| `universe` | `{ galaxy, system, systemId, setSystem(id), FACTIONS, BIOMES }` — ver `src/core/Universe.js` |
| `collision` | `addBox`, `addSphere`, `addGround(fn)`, `ground(p)`, `resolveSphere(p, r, up)`, `raycast(o, d, max)` — em coordenadas de mundo; formas presas a um *frame* `{pos, quat}` mutável |
| `input` | `down/pressed/released/value(ação)`, `axis('moveX'|'moveY'|'lift'|'roll'|'lookX'|'lookY')`, `takeLook()`, `takeWheel()`, `setVirtual`, `setVirtualAxis`, `addLook` (toque), `requestLock()`, `rumble()`, `device` (`kbm`/`gamepad`/`touch`), `enabled` (false com UI modal). Ações em `src/core/Input.js` |
| `quality` | preset ativo (`src/core/Quality.js`): `name`, `dprCap`, `dynamicScale`, `shadows`, `bloom`, `taa`, `cloudSteps`, `terrainLod`, ... |
| `time` | `{ now, frame, step, scale, alpha, frameDt, world, virtual }` — `world` = tempo de universo (s), dirige rotação de planetas e dia/noite |
| `save` | `register(ns, {serialize, deserialize})`, `write()`, `load()`, `hasSave()`, `prefs()`, `setPrefs()` |
| `bus`, `services`, `provide`, `need` | eventos e serviços |
| `shots` | `register(nome, async setup(ctx))` — presets de screenshot (`?shot=nome`) |
| `render` | função de render substituível |
| `stats` | `{ fps, ms, drawCalls, triangles }` |
| `params` | `URLSearchParams` |
| `shot` | `null` fora do modo screenshot; senão `{ name, known }` (tempo virtual, save desligado) |
| `Rng`, `Noise` | RNG e ruído determinísticos (`src/core/Rng.js`) |

## Escala e coordenadas

- Metros. Origem do mundo = estrela do sistema atual. Posições em double (JS);
  **a GPU só recebe posições relativas à câmera** (`world.add` ou `world.toLocal`).
- Planetas pousáveis: raio 22–48 km; gigante gasoso 260–480 km; órbitas de
  6.000 a 60.000 km da estrela. Quântico ≈ 2.000 km/s.
- Planetas GIRAM (`body.rotationAt(t)`, `localToWorld`, `worldToLocal`, `soi`)
  com dia de ~25–43 min. Dentro da SOI, coisas na superfície (nave pousada,
  postos, criaturas, jogador a pé) vivem no **referencial local do planeta**
  e são convertidas para mundo com `body.localToWorld(local, ctx.time.world)`.
- Sistema inicial: `halden` (abertura, colônia Aurora). Fatia vertical: `kessa`
  (Fenda de Órion) — Verídia (exuberante, com a Estação Meridiana), Ashar
  (desértico), Nivália (gelado) pousáveis; Tharsos (gasoso, Plataforma
  Tharsos), lua Ossário (morta, ruínas), lua Brasa (vulcânica), Cinturão da
  Fenda com o Refúgio Cinza (base da Frente Livre).

## Eventos (`ctx.bus`) — catálogo comum

Emita/escute com estes nomes e payloads. Novos eventos: documente aqui.

| evento | payload |
|---|---|
| `mode:change` | `{from, to, data}` |
| `system:change` | `{from, to, system}` |
| `ship:fire` | `{owner, weapon, pos, dir, faction}` |
| `ship:hit` | `{target, owner, damage, pos, shield:boolean}` |
| `ship:destroyed` | `{id, faction, pos, byPlayer, size}` |
| `explosion` | `{pos (mundo), size (m), kind:'ship'|'missile'|'capital'|'small'|'ground'}` |
| `missile:launch` / `missile:lock` / `countermeasure` | `{owner, target}` / `{target, by}` / `{owner, kind:'flare'|'chaff'}` |
| `quantum:spool` / `quantum:start` / `quantum:end` / `quantum:interdicted` | `{target}` |
| `jump:start` / `jump:end` | `{from, to}` |
| `atmo:enter` / `atmo:exit` | `{body}` |
| `reentry` | `{intensity 0..1}` (por frame enquanto durar) |
| `land` / `takeoff` | `{body?, station?, pos}` |
| `player:exitShip` / `player:enterShip` | `{ship}` |
| `player:damage` | `{amount, type:'kinetic'|'energy'|'heat'|'cold'|'toxic'|'radiation'|'fall'}` |
| `player:death` | `{cause}` |
| `foot:fire` | `{weapon, pos, dir}` |
| `scan:discover` | `{kind:'fauna'|'flora'|'mineral'|'ruin', id, name, body}` |
| `dock:request` / `dock:granted` / `dock:complete` / `undock` | `{station}` |
| `mission:accept` / `mission:complete` / `mission:fail` | `{mission}` |
| `objective` | `{id, text, pos?, bodyId?}` (`pos` em mundo) |
| `rep:change` | `{faction, delta, value}` |
| `credits:change` | `{value, delta}` |
| `radio` | `{faction, speaker, text, priority?}` → HUD legenda + áudio com filtro de rádio |
| `dialog` | `{speaker, text, choices?:[{id,text}], onChoose?}` |
| `music` | `{mood:'explore'|'combat'|'tension'|'cinematic'|'station', intensity 0..1}` |
| `shake` | `{amount, duration}` |
| `flash` | `{color, intensity}` |
| `weather` | `{kind, intensity}` |
| `notify` | `{text, kind?:'info'|'warn'|'reward'}` |

## Screenshots e testes

- Cada sistema registra presets: `ctx.shots.register('<sistema>-<cena>', async (ctx) => { ... })`
  que deixam o jogo num estado visualmente representativo (posição de câmera,
  modo, hora do dia, inimigos...). O setup roda depois de todos os `init`.
- `node tools/shot.mjs --params "shot=<nome>" --out <scratchpad>/x.png [--q ultra|high|medium|mobile] [--size 720|1080|ipad]`
  → abre o jogo de verdade num Chromium headless e salva PNG; imprime erros e
  luminância. **Backend WebGL2 por padrão** (o WebGPU headless deste container
  perde o device); os shaders TSL são os mesmos. SwiftShader é lento: um frame
  pode levar segundos — use `--frames` pequeno quando possível.
- `node tools/shot.mjs --list` lista os presets.
- `node tools/fps.mjs --shot <nome> --seconds 10` mede FPS por preset (só comparativo).
- `npm test` (núcleo) e `npm run build` precisam passar.

## Mudanças no núcleo
(registre aqui: data, quem, o quê)
