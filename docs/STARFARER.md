# Starfarer — documentação técnica

Jogo 3D de nave espacial em Three.js, publicado como build estático em
`https://xxxxsgh.github.io/mathref/game/`.

- **Fonte:** `game-src/`
- **Build publicado:** `game/` (commitado, é o que o GitHub Pages serve)
- **Decisão de stack:** [`FASE-0-STACK.md`](./FASE-0-STACK.md)

---

## Como rodar

```bash
cd game-src
npm install
npm run dev        # http://localhost:5173  (o `base` é ignorado em dev)
```

Para testar no iPad, `npm run dev` já sobe com `host: true` — abra
`http://<ip-do-seu-pc>:5173` no Safari do iPad, em modo paisagem.

```bash
npm run build      # gera ../game/
npm run preview    # serve o build em http://localhost:4173/mathref/game/
```

O build **precisa** ser commitado: o GitHub Pages serve a pasta `game/`
diretamente, não há passo de CI.

---

## Controles

| Ação | Teclado / mouse | Gamepad | Touch |
|---|---|---|---|
| Pitch / yaw | `W`/`S`, `A`/`D` ou mouse | analógico esquerdo | manche (metade esquerda) |
| Roll | `Q` / `E` | L1 / R1 | botões ↺ ↻ |
| Acelerador | `R` / `F` | d-pad ↑↓ | arrastar vertical na direita |
| Atirar | botão esquerdo, `Ctrl` ou `X` | RT | FOGO |
| Boost | `Shift` | A | BOOST |
| Freio | `Espaço` | LT | FREIO |
| Giro de tonel | `Z` / `C` | X / B | ↺ ↻ |
| Propulsores laterais | setas | — | — |
| Assistência de voo | `H` | — | — |
| Pausa | `Esc` | — | ❚❚ |
| Debug | `F3` ou `` ` `` | — | DBG |
| Tuning ao vivo | `G` | — | — |

O mouse move um **retículo virtual**, não uma câmera livre: o deslocamento em
relação ao centro vira comando, como um manche com mola. Funciona com e sem
Pointer Lock — o que importa porque o Pointer Lock não é confiável fora do
desktop.

---

## Arquitetura

```
game-src/src/
├── config.js              TODAS as constantes de gameplay
├── main.js                bootstrap; a tela inicial destrava áudio e Pointer Lock
├── core/
│   ├── Engine.js          loop, ordem de atualização, orquestração
│   ├── Renderer.js        WebGL2, duas faixas de profundidade, layers
│   ├── PostProcessing.js  bloom + vinheta + aberração, num passe só
│   ├── Quality.js         qualidade adaptativa por frame time
│   ├── Input.js           agrega teclado/mouse, gamepad e touch
│   ├── Pool.js            pool genérico (projéteis, partículas)
│   └── MathUtils.js       damp exponencial, deadzone radial, expo
├── entities/              Ship, EnemyShip, Planet, Station, Health, modelos
├── systems/               FlightModel, CameraRig, Combat, EnemyAI, Projectiles,
│                          Explosions, PlanetSurface, PlanetaryFlight, SkyDome,
│                          Progression, Missions, SpatialHash
├── procgen/               rng, noise, Skybox, SolarSystem, AsteroidField, SpaceDust
├── audio/                 AudioSystem (Web Audio puro, sons sintetizados)
└── ui/                    HUD, Radar, DebugPanel, TouchUI, UpgradePanel,
                           PauseMenu, Tuner, styles.css
```

### Ordem de atualização por frame

```
input → nave → câmera → luz de preenchimento → voo planetário → superfície
      → sistema solar → combate → progressão/missões → áudio → HUD → render
```

A ordem não é arbitrária:

- a **câmera** vem depois da nave, senão persegue a posição do frame anterior;
- o **combate** vem depois da câmera, porque a escolha de alvo usa o eixo de
  visão;
- a **HUD** vem por último, porque projeta vetores com a matriz da câmera
  deste frame.

---

## Decisões que valem conhecer

Cada uma está comentada em detalhe no arquivo correspondente.

### Modelo de voo: velocidade angular alvo, não torque
`systems/FlightModel.js`. O input define uma velocidade angular *alvo* que a
real persegue com suavização exponencial. Com torque puro, soltar o controle
deixaria a nave girando pra sempre (não há ar no espaço) e o jogador teria que
contra-comandar cada manobra. O "peso" vem de dois lugares independentes: o
tempo de resposta angular e a **deriva lateral** — ao virar, a velocidade
continua apontando pra onde a nave estava.

### Suavização independente de framerate
`core/MathUtils.js`. `a += (b-a)*0.1` por frame depende do framerate: a 120fps
suaviza duas vezes mais rápido que a 60. A forma correta é
`1 - exp(-lambda·dt)`. Todo o feel do jogo depende disso, e no iPad — que
oscila entre 60 e 30 — a diferença seria sentida durante a partida.

### A câmera é transportada antes de ser amortecida
`systems/CameraRig.js`. Amortecer em direção a um alvo *em movimento* deixa um
erro permanente de `v/lambda`. A 223 u/s isso eram 30 unidades de atraso, e o
sintoma era o inverso do desejado: quanto mais rápido você voava, mais longe a
câmera ficava e menor a nave aparecia. A correção é somar o deslocamento da
nave à câmera antes de amortecer o resíduo, de modo que o atraso passe a vir
só da *aceleração*.

### Duas faixas de profundidade
`core/Renderer.js`. Planetas a centenas de milhares de unidades e detalhes de
nave de meia unidade não cabem no mesmo depth buffer. Duas câmeras com faixas
separadas, limpando o depth entre elas, resolvem sem `logarithmicDepthBuffer`
— que funcionaria, mas desliga o early-Z e é caro demais em mobile.

### Chunks de terreno são pedaços de esfera desde o início
`systems/PlanetSurface.js`. Cada vértice é um ponto do plano tangente,
normalizado de volta à esfera e escalado por `raio + altura`. Chunks vizinhos
compartilham as direções nas bordas, então a mesma função de altura dá a mesma
altura dos dois lados — sem costura e sem lógica de emenda. A função de ruído
é a mesma do shader do planeta, reimplementada em JS, então o continente visto
da órbita é o terreno onde se pousa.

### Broadphase onde ela paga, e só ali
`systems/Combat.js` usa força bruta para projéteis (~2500 pares/frame, e
manter índice de objetos que se movem custaria mais). `procgen/AsteroidField.js`
usa spatial hash, porque são milhares de corpos *estáticos* consultados por
poucos móveis. Otimizar antes de medir é o jeito mais comum de deixar um jogo
mais lento.

### Colisão por varredura de segmento
`systems/Projectiles.js`. A 900 u/s um projétil anda 15 unidades por frame,
mais que o raio de uma nave. Testar só a posição atual faria o tiro atravessar
o alvo — e justamente quando o frame engasga, ou seja, no pior momento.

### Áudio sintetizado, sem arquivos
`audio/AudioSystem.js`. Um pacote de efeitos decente é mais pesado que o bundle
inteiro, e no iOS o cache do service worker é evictado agressivamente. Tudo é
gerado por osciladores e ruído em tempo real.

---

## Performance

Painel de debug (`F3`) mostra FPS, frame time, pior 1%, draw calls,
triângulos, shaders, geometrias, texturas e contagem de entidades, com gráfico
de frame time em escala fixa de 33ms.

Como ler:

| Sintoma | Causa provável |
|---|---|
| draw calls altos | falta instancing ou merge de geometria |
| triângulos altos | falta LOD |
| frame time alto com os dois baixos | fill rate (resolução, transparências) ou CPU |
| picos isolados no gráfico | coleta de lixo — procure alocação no loop |

**Qualidade adaptativa** (`core/Quality.js`) mede a *mediana* do frame time
numa janela de 90 frames (mediana, não média: um pico de GC não deve derrubar
a qualidade) e degrada pixel ratio → céu → partículas → pós-processamento, com
histerese nos dois sentidos e teto de subidas para não oscilar sob throttling
térmico.

Números medidos (Chromium headless, 1280×720):

| Cena | Draw calls | Triângulos |
|---|---|---|
| Espaço vazio | 20 | 618 |
| Combate | 21 | ~700 |
| Cinturão (197 asteroides visíveis) | 8 + cena | 12.168 |
| Superfície planetária (49 chunks) | ~45 | ~33.000 |

Bundle: ~200 KB gzip no total, dividido em `three` (137 KB),
`postprocessing` (15 KB), código do jogo (50 KB) e `lil-gui` sob demanda (8 KB).

---

## Ajustando o game feel

Tudo em `config.js`, e tudo editável ao vivo com `G`. Os parâmetros que mais
mudam a sensação, em ordem:

1. `flight.lateralDrag` — o "peso". Alto gruda no trilho; baixo escorrega.
2. `flight.pitchYawResponse` — responsividade da curva.
3. `camera.rotationLambda` — o atraso da âncora, que é a sensação de força.
4. `camera.fovSpeedGain` — sensação de velocidade (o número em u/s não
   significa nada pro jogador; a distorção de perspectiva, sim).
5. `camera.swayGain` — exagero da curva.

O botão **copiar valores** no painel de tuning gera um JSON pronto pra colar
de volta no `config.js`.

---

## Limitações conhecidas

- **iOS < 26** não tem WebGPU, mas o jogo é WebGL2 — não faz diferença hoje.
  A migração eventual está isolada em `core/Renderer.js` e
  `core/PostProcessing.js`.
- **`postprocessing@6.39.4`** declara `three >= 0.168 < 0.186`. Ficamos presos
  em `three@0.185.1` até a lib atualizar.
- **Throttling térmico no iPad** derruba o framerate após alguns minutos; a
  qualidade adaptativa compensa, mas o teto de subidas significa que ela não
  volta ao tier alto na mesma sessão (de propósito — oscilar é pior).
- **Cache do PWA no iOS** tem limite de ~50MB e é evictado agressivamente.
  Sourcemaps ficam fora do precache por isso.
- O **skybox não é regerado** quando a qualidade cai para o mesmo tamanho de
  cubemap; regerar custa 100–300ms e não vale o engasgo.
