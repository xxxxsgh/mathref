# CLAUDE.md

Este repositório hospeda vários projetos estáticos publicados no GitHub Pages
(ver `README.md`). **Este arquivo trata do jogo VENTANIA** (`ventania/`), que é
construído em etapas iterativas. Atualize-o sempre que uma decisão importante
for tomada, para manter a consistência entre as etapas.

Os outros projetos (MathRaf na raiz, Starfarer em `game-src/`, Dronefarer em
`drone-src/`) têm documentação própria em `docs/` e não devem ser tocados por
trabalho no Ventania.

---

## 1. Visão do jogo

**Ventania** é um jogo 3D de aventura em mundo aberto para PC, no navegador. A
sensação-alvo é a de explorar uma ilha ensolarada e ventosa no fim de tarde:
liberdade, calma, curiosidade. Você vê algo no horizonte, vai até lá, sobe no
ponto mais alto e se joga com o planador.

- **100% original.** Nenhum nome, personagem, símbolo, música ou elemento de
  outra franquia. A inspiração é de *sensação*, não de conteúdo.
- **Herói:** um(a) jovem andarilho(a) sem nome, de túnica azul-petróleo, calça
  creme, botas de couro, bolsa a tiracolo e um **cachecol laranja-queimado**
  longo que balança ao vento (é a silhueta e a assinatura de cor do herói).
- **Mundo:** a *Ilha de Ventania* (~1 km), com campo de grama alta, colinas, uma
  pequena floresta, um lago, praia, ruínas de pedra de uma civilização antiga
  (arco, anel de colunas) e **3 ilhas flutuantes** no céu — o mistério que
  puxa o jogador (ainda sem acesso).
- **Verbo central:** andar → correr → escalar até um ponto alto → planar.
- **Tom:** contemplativo, quente, nada sombrio.

## 2. Bíblia de arte

- **Estilizado-pintado, quente e atmosférico.** Golden hour é o "padrão" do
  mundo. Sombras puxadas para **roxo/azul**, **nunca** cinza ou preto. Nem a
  noite é preta: é azul-violeta profundo.
- **Toon shading SUAVE:** rampa de 4 tons macios (`render/toon.js`, textura de
  gradiente com filtro linear) + **rim light quente** dependente do sol.
  **Sem contorno preto grosso.**
- **Grama muito densa** com instancing: lâminas com gradiente raiz→ponta,
  manchas de verde-lima, oliva e dourado, vento em ondas grandes, e reação ao
  jogador (as lâminas se abrem quando ele passa). Algumas flores pontuais.
- **Árvores "fofas":** copas feitas de esferas fundidas com **normais
  esféricas** (sombreamento de "bolha" macia). **Pedras low-poly facetadas** com
  **musgo no topo**.
- **Névoa** de distância **e** de altura, na cor do céu, com espalhamento quente
  na direção do sol → perspectiva aérea forte. **Nuvens fofas.**
- **Água estilizada:** gradiente por profundidade (turquesa → azul profundo),
  espuma na margem, brilho do sol.
- **Pós:** tone mapping ACES, color grading quente (sombras para roxo/azul,
  luzes para dourado), bloom suave, AO leve (GTAO, só na qualidade alta).

### Paleta (referência; valores reais em `world/daynight.js`)

| Elemento | Cor |
|---|---|
| Céu zênite (golden hour) | azul `#4c7fd6` |
| Horizonte (golden hour) | pêssego `#ffd29a` |
| Sol | dourado `#ffcf8a` |
| Ambiente (sombras) | lavanda `#8e94e8` / roxo `#6a5478` |
| Grama raiz → ponta | `#1f3d14` → `#a6cf45` (lima), manchas oliva `#7a8634` e dourado `#d9b54a` |
| Areia | `#efd7a0` |
| Pedra das ruínas | bege quente `#c8b89c`, musgo `#6f8f3a` |
| Água rasa → funda | `#46c4b4` → `#12507a` |
| Cachecol do herói | `#d9581f` |
| Túnica do herói | `#1f6f7a` |

## 3. Regras técnicas

- **Three.js `0.185.1` fixo**, carregado por **importmap** do jsDelivr
  (`ventania/index.html`). Para trocar de versão, mude o importmap **e** a
  `devDependency` em `package.json` (usada pelo script de screenshots para
  servir o Three localmente).
- **JavaScript puro com ES modules. SEM etapa de build.** A pasta `ventania/`
  é publicada como está pelo workflow do Pages (cópia por exclusão).
- **Zero assets externos.** Modelos, texturas (canvas), sons e música são
  gerados por código. Única exceção permitida: Google Fonts.
- **Unidades:** 1 unidade = 1 metro. Y para cima. Nível do mar em `y = 0`.
- **Física de jogador em passo fixo** (1/120 s) com acumulador; render
  desacoplado.
- **Uma fonte da verdade para a altura do terreno:** `world/terrain.js` gera a
  grade de alturas; o CPU consulta a altura com a **mesma triangulação** da
  malha, e os shaders (grama, água) leem a mesma grade via `DataTexture`.
- **Névoa:** os chunks `fog_*` do Three são substituídos globalmente em
  `render/fog.js`. Todo material criado no jogo deve passar por
  `withFog(material)` (ou incluir os chunks, no caso de `ShaderMaterial`).
- **Materiais:** use as fábricas de `render/toon.js` (`toonMaterial`) para
  manter a rampa e o rim light consistentes.
- **Desempenho:** alvo 60 fps em PC médio na qualidade *média*. Grama em uma
  única draw call por camada (perto/longe), árvores/pedras/nuvens com
  `InstancedMesh`. Qualidade baixa/média/alta em `render/quality.js`.
- **Persistência:** só preferências (qualidade, volume, sensibilidade) em
  `localStorage`, sempre dentro de `try/catch`.
- **Modo de screenshot:** `?shot=1` desliga a tela inicial e o pointer lock e
  expõe `window.__ventania` (poses de câmera fixas, hora do dia, qualidade).
  Usado por `tools/shots.mjs`.
- **Idioma:** UI e comentários em português.

## 4. Estrutura de pastas

```
CLAUDE.md                 este arquivo
package.json              só ferramentas de dev (playwright, three p/ servir offline)
tools/
  serve.mjs               servidor estático local (http://localhost:8080/ventania/)
  shots.mjs               screenshots de 6 ângulos fixos → shots/<rótulo>/
  feel.mjs                medições do controle (25 checagens; sai ≠ 0 se falhar)
shots/                    saída dos screenshots (ignorada pelo git)
ventania/                 O JOGO (publicado em /mathref/ventania/)
  index.html              importmap, HUD, CSS, fontes
  main.js                 bootstrap, loop, estados, modo screenshot
  core/                   input, configurações, matemática/ruído, eventos
  world/                  terreno, grama, árvores, pedras, ruínas, água,
                          céu, nuvens, ilhas flutuantes, dia/noite, colisão
  player/                 herói (modelo), controle, animação, cachecol, planador
  camera/                 câmera em 3ª pessoa
  render/                 renderer, toon, névoa, pós-processamento, qualidade
  ui/                     HUD (bússola, legenda, FPS), menus
  audio/                  Web Audio: vento, passos, pássaros, grilos, mar
```

## 5. Controles

| Tecla | Ação |
|---|---|
| WASD | mover |
| Shift | correr |
| Espaço | pular / abrir e fechar o planador no ar |
| Mouse | câmera (pointer lock; clique para capturar) |
| Roda | zoom da câmera |
| H | esconde/mostra a legenda de controles |
| F3 | FPS e estatísticas |
| T | acelera o ciclo dia/noite (alterna) |
| M | silencia o som |
| Esc | pausa / menu de qualidade |

## 6. Como rodar e avaliar

```bash
npm install            # na raiz do repositório (playwright + three)
npm run serve          # http://localhost:8080/ventania/
npm run shots -- fase1 # screenshots dos 6 ângulos em shots/fase1/
npm run feel           # medições objetivas do controle
```

Opções do `shots`: `--q=low|medium|high`, `--time=22.5` (hora do dia),
`--poses=chao,lago` (as 6 fixas: chao, lago, colina, ceu, close, geral; extras
para animação: planador, correndo). Ele também imprime draws/triângulos de um
frame (cena + sombras). O Chromium do ambiente usa GPU em software
(SwiftShader): o modo `?shot=1` só avança o loop quando a automação chama
`__ventania.step()`, então o resultado é determinístico e independe do fps.

Fluxo obrigatório em **toda** etapa: construir → rodar `npm run shots` → olhar
as imagens → listar problemas visuais e de controle → corrigir → repetir.

## 7. Registro de decisões

- **Etapa 1 (fundação):** o jogo mora em `ventania/` dentro do repositório
  `mathref`, ao lado dos outros jogos, publicado sem build. Nome: *Ventania*.
- Grama: instancing com posições que "dão a volta" (wrap) ao redor do jogador
  no vertex shader — campo infinito com uma draw call; densidade, altura do
  terreno e manchas de cor vêm da mesma `DataTexture` do terreno.
- Ilha: raio ~480 m, mundo de 1200 × 1200 m, grade de altura de 300 × 300
  células (4 m). Lago com nível próprio (`LAKE_LEVEL`), acima do mar.
- Sombras: uma luz direcional (sol/lua) com caixa de sombra que segue o jogador,
  ajustada à grade de texels para não tremer.
- Pós-processamento: `RenderPass → GTAO (alta) → Bloom → OutputPass (ACES +
  sRGB) → Grading` (o grading roda em espaço de exibição, depois do tone map).
  Qualidade baixa não usa composer. Objetos com `userData.noAO` (grama, água,
  céu, nuvens, ilhas) ficam fora do G-buffer do GTAO.
- Grama: a normal é forçada "para cima" nos dois lados da lâmina (senão as
  costas das lâminas ficam pretas) e a ponta ganha translucência no contraluz.
- Terreno: textura de detalhe em duas escalas que some depois de ~110 m
  (evita o padrão xadrez de repetição visto de longe).
- Água: cor multiplicada pela luz do ambiente (`uLight`), senão brilha à noite.
- Árvores/arbustos em células de 220 m (frustum culling da câmera e da sombra);
  copas com icosaedro de detalhe 1 (as normais esféricas escondem as facetas).
  Copas têm colisor só-da-câmera (`camOnly`).
- Orçamento medido (pose `chao`, cena + sombras): baixa ~0,9 M tri, média
  ~1,5 M tri, alta ~2,1 M tri; ~130 draws.
- **Controle (valores em `player/player.js → TUNING`):** andar 4,3 m/s,
  correr 8,4 m/s, 90% da velocidade em ~0,22 s, parada em ~0,5 m; curvas giram
  o vetor velocidade (não perdem embalo), reversão freia firme; pulo variável
  (toque ~1,0 m, segurado ~1,7 m); gravidade maior na queda; coyote 0,14 s e
  buffer de pulo 0,14 s; rampas até normal.y 0,62 andáveis, parado não
  escorrega; planador abre com Espaço no ar a mais de 2 m do chão (desce
  ~2,3 m/s a ~9,5 m/s; Shift acelera), aterrissar planando mantém embalo por
  0,35 s. Tremida de câmera só em quedas acima de 13 m/s.
- **Câmera:** alvo horizontal firme e vertical folgado (pulo não sacode),
  colisão por marcha no raio (aproxima rápido, afasta devagar), herói oculto se
  a câmera ficar a menos de ~1 m, FOV 58° → +7° correndo, +9° planando; no
  planador a câmera se realinha atrás sozinha se o mouse ficar parado.
- Referências visuais: o pedido citou imagens anexadas, mas nenhuma chegou nesta
  etapa; o estilo segue só a bíblia de arte escrita acima.
