# NULLPOINT — documentação técnica

Protótipo jogável de FPS tático de arena, com foco em customização de armas:
skins com **float** (condição) e **desgaste procedural por região**,
**pattern seeds**, **inspeção de faca** com cinco variações (uma rara),
inventário, visualizador 3D de colecionável, bots e partidas por rounds.

- **Fonte:** `arena-src/`
- **Build publicado:** `arena/` → `https://xxxxsgh.github.io/mathref/arena/`
- **Stack:** Three.js 0.185 + Vite 8, JavaScript puro com JSDoc, nenhum asset
  externo (modelos, texturas e sons são todos procedurais).

> IP original. Nada de mapas, modelos, sons, nomes de armas/skins ou UI de
> outros jogos — só a inspiração de gênero (FPS tático competitivo).

---

## Como rodar

```bash
cd arena-src
npm install
npm run dev        # http://localhost:5173
npm run build      # gera ../arena/
npm run preview    # serve o build em /mathref/arena/
npm test           # 15 testes unitários (Node, sem navegador)
npm run test:e2e   # 25 checagens de ponta a ponta no Chromium (Playwright)
```

O `test:e2e` precisa do Playwright disponível (`npm i -D playwright` ou
global). Ele sobe o `vite preview`, percorre menu → inventário → visualizador
→ loadout → mercado → configurações → treino → competitivo até o fim da
partida → save, e falha em qualquer erro de console. Screenshots ficam em
`arena-src/tools/shots/` (ignorado pelo git).

Ferramentas de ajuste visual (mesmo pipeline do jogo):

- `node tools/vmshot.mjs tools/poses.json` — fotografa a viewmodel em poses
  e instantes de animação específicos.
- `node tools/wearshot.mjs '<json>' nome` — grade da mesma skin em vários
  floats/seeds (é como a curva de desgaste foi calibrada).

---

## Controles

| Ação | Tecla |
|---|---|
| Mover / correr / agachar / pular | `WASD` / `Shift` / `C` (ou `Ctrl`) / `Espaço` |
| Atirar · golpe leve da faca | Botão esquerdo |
| Golpe pesado da faca · luneta do DMR | Botão direito |
| Recarregar | `R` |
| Primária / secundária / faca / última arma | `1` / `2` / `3` / `Q` (ou roda do mouse) |
| **Inspecionar** (de novo cancela) | `F` |
| Loja · placar · pausa | `B` · `Tab` · `Esc` |

`Ctrl` funciona para agachar, mas `Ctrl+W` fecha a aba no navegador — por
isso o padrão é `C`.

---

## Arquitetura

Cada sistema pedido virou um módulo. `main.js` só monta as peças e define a
ordem do frame; regra de jogo mora nos módulos.

| Sistema | Arquivo |
|---|---|
| PlayerController | `src/player/PlayerController.js` |
| WeaponController | `src/weapons/WeaponController.js` |
| WeaponData | `src/weapons/WeaponData.js` |
| RecoilSystem | `src/weapons/RecoilSystem.js` |
| ViewModel + Animator + clipes | `src/weapons/ViewModel.js`, `Animator.js`, `Animations.js` |
| Modelos procedurais | `src/weapons/Models.js` |
| WeaponSkin (catálogo) | `src/skins/SkinCatalog.js`, `Rarity.js` |
| WearSystem | `src/skins/Wear.js` (regras) + `SkinMaterial.js` (shader) |
| PatternSystem | `src/skins/PatternSystem.js` |
| InventorySystem | `src/inventory/InventorySystem.js` |
| InspectionSystem | `src/inspect/InspectionViewer.js`, `Thumbnails.js` |
| DamageSystem | `src/combat/DamageSystem.js` (puro) + `CombatSystem.js` |
| BotController | `src/bots/BotController.js`, `BotModel.js` |
| RoundManager | `src/match/RoundManager.js` (puro, testável) |
| MatchManager | `src/match/MatchManager.js` |
| UIManager + HUD | `src/ui/UIManager.js`, `HUD.js`, `screens/*`, `MatchOverlays.js` |
| AudioManager | `src/audio/AudioManager.js` (100% sintetizado) |
| Save/Settings | `src/core/Save.js`, `Settings.js` |
| Mundo | `src/world/Arena.js`, `Collision.js`, `NavGraph.js` |
| Efeitos | `src/fx/Effects.js` |

Módulos marcados como "puros" não importam Three nem DOM e são cobertos por
`tools/unit.test.mjs`.

---

## Armas e combate

| Arma | Tipo | Dano | Cadência | Pente | Preço |
|---|---|---|---|---|---|
| VX-9 Corsair | fuzil automático | 34 | 600 RPM | 30 | 2700 |
| Wasp-11 | SMG | 26 | 800 RPM | 30 | 1250 |
| Lancer DMR | semiautomático com luneta | 78 | 188 RPM | 10 | 3800 |
| Kite P9 | pistola (padrão) | 30 | 400 RPM | 15 | 0 |
| Brawler .50 | pistola pesada | 58 | 143 RPM | 7 | 700 |
| TALON-K | faca | 40/25 leve, 65 pesado, 180 pelas costas | — | — | — |

- **Hitscan** com hitboxes: cabeça (esfera), peito, estômago (×1,25) e pernas
  (×0,75). Fase larga por caixa envolvente antes das hitboxes.
- **Queda de dano**: `dano × rangeMod^(distância/10 m)`.
- **Colete/capacete**: colete protege tronco, capacete protege cabeça, pernas
  nunca; `armorPen` define quanto atravessa, metade do resto sai do colete.
- **Recuo**: padrão determinístico por arma (sobe, depois serpenteia) que
  desloca a mira de verdade; o jogador compensa puxando o mouse. Volta ao
  centro quando o spray para.
- **Dispersão**: base (em pé/agachado) + velocidade + no ar + correndo +
  "bloom" por tiro. A mira dinâmica do HUD abre com ela.

**Skins, float e raridade não entram em nenhum cálculo de combate** — um
teste unitário verifica que `WeaponData` não tem campo algum de skin.

---

## Faca e inspeção

Animação 100% procedural por keyframes (`Animator.js`). Uma pose tem canais
de **mão** (`rp/rr`), **item em relação à mão** (`ip/ir`, os giros nos dedos) e
**carregador** (`m`). Cada trecho tem seu próprio easing (`outBack`,
`inOutCubic`, `outQuint`…).

- Rotações são Euler interpoladas por componente, de propósito: quaternions
  pegariam o caminho mais curto e "comeriam" giros de 360°/720°.
- **Toda troca de clipe faz crossfade da pose atual**, com ângulos
  normalizados — cancelar a inspeção no meio de um giro não dá salto.
- O antebraço acompanha só 30% da rotação animada do punho: em giros grandes
  quem gira é o pulso, e o braço não invade a tela.

| Variação | Peso | O que faz |
|---|---|---|
| A — Rotação lenta da lâmina | 30 | traz ao centro e rola a lâmina mostrando as duas faces |
| B — Giro rápido nos dedos | 28 | mortal completo em volta dos dedos, recepção com `outBack` |
| C — Inspeção do cabo | 24 | aponta o cabo para a câmera e vira para ver os dois lados |
| D — Giro curto | 14 | duas voltas "helicóptero" e pose |
| **E — Especial rara** | **4** | arremesso girando → vira na horizontal → examina a lâmina → cabo para a câmera → giro → volta ao idle (os seis passos pedidos) |

A rara sai em ~4% das inspeções (o teste unitário amostra 5000 sorteios) e
a variação anterior não se repete em seguida (exceto a rara). Atirar,
golpear, recarregar, trocar de arma, mirar ou apertar `F` de novo **cancelam**
a inspeção. Há também: saque, equipar (floreio no primeiro saque da vida),
golpe leve alternando lados, golpe pesado com recuo e estocada, idle com
respiração, sway, bob, pose de corrida e mola de aterrissagem.

Armas de fogo têm duas inspeções (laterais; checar o pente), saque e recarga
com o carregador saindo e voltando.

---

## Desgaste (float)

| Faixa | Condição |
|---|---|
| 0,00–0,07 | Factory New |
| 0,07–0,15 | Minimal Wear |
| 0,15–0,38 | Field-Tested |
| 0,38–0,45 | Well-Worn |
| 0,45–1,00 | Battle-Scarred |

O desgaste é calculado **por pixel** num `MeshStandardMaterial` com shader
injetado (`SkinMaterial.js`):

```
surfaceWearMask = max(zona da peça, quina × 1,25) + gradiente × 0,55
wearIntensity   = float^0,8 × (0,2 + 0,85 × surfaceWearMask)
                + ruído(seed único do item) × (0,35 + 0,9 × float)
perda de tinta  = smoothstep(0,55; 0,62; wearIntensity)
```

- **Zona da peça**: cada peça do modelo declara onde a mão/atrito tocam —
  fio da lâmina 1,0 · gatilho 0,75 · ferrolho 0,62 · boca do cano 0,6 · cabo
  0,55 · carregador 0,5 · corrediça 0,4 · corpo 0,22 · laterais protegidas
  0,12.
- **Quinas**: detectadas no shader a partir da posição local e das
  meia-extensões da peça (caixas e cilindros) — cantos e arestas gastam
  primeiro.
- **Gradiente**: na lâmina, o desgaste cresce em direção ao fio e à ponta.
- Onde a tinta sai aparece **metal nu** (metalness 1, roughness baixa —
  brilha sob o mapa de ambiente), com faixa de **primer** na borda da tinta.
- Também: **arranhões** (densidade e alcance crescem com o float; leves
  riscam a tinta, fortes chegam ao metal), **desbotamento** (dessatura e
  clareia), **sujeira** nas reentrâncias em desgastes altos.

O botão "Desgaste: ligado/desligado" no visualizador zera tudo isso para
comparar com a skin "como nova".

## Pattern seed (0–1000)

`PatternSystem.js` deriva do par (skin, seed) — sempre igual para o mesmo par:
rotação, deslocamento e escala do padrão, posição do degradê, distribuição
de cor, posição/tamanho de um decalque e a direção dominante dos arranhões.
Alguns seeds por padrão são "especiais" (★ no card).

Além do pattern seed, cada item tem um **seed de desgaste único** derivado do
seu ID: duas cópias com mesma skin, mesmo float e mesmo pattern seed ainda
descascam em lugares diferentes.

Padrões disponíveis no shader: `solid`, `circuit`, `camo`, `hex`, `stripes`,
`digital`, `fade`, `pulse` (domain warp), `rupture` (fissuras Voronoi),
`tiger`. Detalhes podem emitir luz (circuitos, fissuras), que se apaga onde
a tinta saiu.

---

## Skins e raridade

23 skins originais em 6 armas, 6 raridades (Common → Mythic) com cor e brilho
próprios na UI. Exemplos: facas *Crimson Circuit*, *Obsidian Pulse*, *Neon
Rupture*, *Arctic Signal*, *Rust Protocol*; fuzis *Solar Grid*,
*Cyberstorm*, *Urban Static*, *Void Runner*.

Cada skin tem: ID, nome, tipo de arma, raridade, padrão, cores
base/acento/detalhe, acabamento base/acento (anodizado, epóxi, cerâmica,
polímero, aço acetinado, cromado, hidrográfica), faixa de float e descrição.

## Inventário, loadout e mercado

Item: `{ id: "ITEM-0001842", weaponType, skinId, rarity, floatValue,
patternSeed, wearSeed, equipped, acquiredAt }`.

- **Inventário**: cards com miniatura 3D renderizada com a skin real, filtros
  por arma e raridade, ordenação; equipar, desequipar, inspecionar,
  comparar (tabela + visualizador com as duas armas) e vender.
- **Loadout**: uma linha por arma; "Padrão" volta ao acabamento de fábrica.
- **Mercado offline**: listagens fixas com float e seed **visíveis antes da
  compra** (o item comprado é idêntico ao exibido, inclusive o seed de
  desgaste). Fragmentos são ganhos jogando ou vendendo. **Sem caixas, sem
  sorteio pago, sem dinheiro real.**

## Visualizador de inspeção

Cena própria com pedestal e iluminação de estúdio. Arrastar orbita, roda dá
zoom, ←/→ troca de item, giro automático quando ocioso, câmera sempre
amortecida (entrada com "voo" até o item). Painel com raridade, condição,
float com barra das 5 faixas, pattern seed, padrão, acabamento, ID e
descrição. O HUD fica escondido.

---

## Arena: RELAY-7

Espelhada no eixo X (justa para os dois lados): dois spawns, **pátio central
com o Uplink**, **lane norte** de linha de visão longa com coberturas baixas,
**corredor sul coberto** de curta distância com pilares em zigue-zague (rota
de flanco), **plataforma elevada** com escadas e parapeito, becos ligando
tudo e cantos estratégicos. Tudo é caixa alinhada: a mesma lista alimenta o
render (mesclado por material, ~12 draw calls) e a colisão AABB.

## Bots

Máquina de estados: *objective* (rota por papel — lane, mid, corredor ou
plataforma — até o Uplink e segurar dentro dele), *engage*, *cover*,
*chase*. Percebem por campo de visão + linha de visão, ouvem tiros, reagem a
dano, procuram cobertura escondida da ameaça, recuam feridos, recarregam
fora de combate, perseguem a última posição conhecida e pulam/recalculam
quando travam. Pathfinding A* num grafo de navegação.

| Dificuldade | Reação | Erro de mira | Headshot | Extras |
|---|---|---|---|---|
| Fácil | 0,65 s | alto | 12% | parado, sem strafe |
| Normal | 0,42 s | médio | 25% | strafe, recua com 30 HP |
| Difícil | 0,27 s | baixo | 40% | agacha a distância |
| Expert | 0,17 s | mínimo | 55% | rajadas longas e controladas |

Percepção e decisão rodam a 10 Hz com fase escalonada; só mira e movimento
rodam todo frame.

## Rounds — modo UPLINK

Melhor de 13 (primeiro a 7). Cada round: spawn → **compra** (10 s, parados,
loja com `B`) → **valendo** (1:55) → fim (5 s). Vence o round quem eliminar o
outro time ou **capturar o Uplink** (só um time dentro do círculo; mais gente
captura mais rápido; contestado congela; o outro time precisa zerar a barra
antes de tomar). No tempo esgotado: mais sobreviventes, depois mais vida
total, senão empate. Economia: vitória 3250 (+300 se capturou), derrota 1400
+500 por derrota seguida, recompensa por abate depende da arma. Morreu: perde
primária e colete. Placar, relógio do round, tempo de partida, reinício e
tela de resultado com recompensas.

**Treino livre**: sem rounds, alvos fixos e móveis, bots e jogador renascem,
loja grátis a qualquer hora.

## HUD

Vida, colete/capacete, munição, arma e skin, slots, placar dos times,
relógio, vivos por time, barra do Uplink, kill feed, mira configurável
(dinâmica com a dispersão), hitmarker (headshot e abate com cor própria),
indicador de direção de dano, vinheta de vida baixa, luneta, nomes dos
aliados, mensagens de round, rótulo da inspeção (com destaque para a rara).

## Configurações e save

Sensibilidade, inverter Y, FOV, FOV da arma, qualidade (sombras, AA,
densidade de pixels), resolução de renderização, tela cheia, mostrar FPS,
volume geral/música/efeitos, mira (cor, tamanho, espaço, espessura, ponto,
dinâmica), dificuldade e tamanho dos times padrão.

Save local em JSON (`localStorage`, chave `nullpoint.save.v1`, versionado):
inventário com float/seed de cada item, equipados, configurações,
progressão (nível, XP, fragmentos, partidas, vitórias, abates…) e mercado.
Exportar/importar/apagar em *Configurações → Dados*.

## Desempenho

- Pools fixos para tracers, marcas de bala, faíscas, poeira, flashes e
  cápsulas — nada é alocado durante a partida.
- Luzes de flash sempre presentes com intensidade 0 (adicionar/remover luz
  no Three recompila shaders).
- Arena mesclada por material; colisão com grade uniforme no plano XZ para
  raios e sobreposição.
- Um único programa de shader para todas as peças com skin
  (`customProgramCacheKey`); bots usam materiais lisos compartilhados.
- IA a 10 Hz escalonada; HUD só toca no DOM quando o valor muda.
- Simulação de 10 combatentes + alvos: ~0,2 ms/frame (medido no e2e, sem
  render).

## Limitações conhecidas

- Bots não colidem entre si (só com o mundo).
- Sem multiplayer em rede: "vários jogadores" são bots.
- Áudio sintetizado é funcional, não realista.
- A viewmodel é low-poly de caixas — o foco é sistema, não arte final.
