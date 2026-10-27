# mathref

Repositório com sete sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |
| [`/drone/`](https://xxxxsgh.github.io/mathref/drone/) | **Dronefarer** — simulador arcade de drone FPV |
| [`/arena/`](https://xxxxsgh.github.io/mathref/arena/) | **NULLPOINT** — FPS tático de arena com skins e inspeção de faca |
| [`/ironline/`](https://xxxxsgh.github.io/mathref/ironline/) | **IRONLINE** — FPS militar com arquitetura de features plugáveis |
| [`/quadra/`](https://xxxxsgh.github.io/mathref/quadra/) | **QUADRA VIVA** — futsal arcade com física em escala real |
| [`/lamina3d/`](https://xxxxsgh.github.io/mathref/lamina3d/) | **LÂMINA//FERRUGEM 3D** — ação com espada e parry em 3D |

## Publicação

O deploy é automático: qualquer push em `main` dispara
[`.github/workflows/pages.yml`](./.github/workflows/pages.yml), que compila os
jogos a partir de `game-src/`, `drone-src/`, `arena-src/`, `ironline-src/` e `quadra-src/`, monta o site e
publica no Pages.

Não há configuração manual: o passo `configure-pages` roda com
`enablement: true` e liga o Pages no repositório na primeira execução, já
com a origem definida como GitHub Actions.

Para republicar sem commit novo: aba *Actions* → *Publicar no GitHub Pages* →
*Run workflow*.

### O que vai para o ar

O workflow copia a raiz do repositório **por exclusão** — qualquer arquivo
novo na raiz é publicado sem precisar editar o workflow. Ficam de fora:
`game-src/`, `drone-src/`, `arena-src/`, `ironline-src/`, `quadra-src/`, `docs/`, `.github/`, `README.md`, `.gitignore` e
`node_modules/`.

### Plano B, sem Actions

A pasta `game/` está commitada, então *Settings → Pages → Deploy from a branch
→ `main` / `(root)`* também funciona, sem CI nenhum. A diferença é que nesse
modo o build precisa ser rodado e commitado à mão, e esquecer disso faz o site
divergir do código em silêncio — sem erro e sem aviso. Por isso o padrão é o
workflow.

## Starfarer

Jogo 3D de nave espacial em Three.js: voo 6DOF arcade, combate contra caças
com IA, sistema solar procedural com cinturão de asteroides e estações, voo
contínuo do espaço até a superfície planetária, progressão com upgrades e
missões. Roda no navegador, sem backend, e é instalável como PWA.

- Fonte: [`game-src/`](./game-src)
- Build: `game/` (gerado pelo workflow; commitado como plano B)
- **Documentação técnica:** [`docs/STARFARER.md`](./docs/STARFARER.md)
- **Decisão de stack:** [`docs/FASE-0-STACK.md`](./docs/FASE-0-STACK.md)

```bash
cd game-src
npm install
npm run dev      # desenvolvimento
npm run build    # gera ../game/
npm run preview  # serve o build em /mathref/game/
```

O `index.html` da raiz (MathRaf) não é tocado pelo build do jogo.

## Dronefarer

Simulador arcade de drone FPV em Three.js: voo com modos ANGLE e ACRO, câmera
FPV com pós-processamento de feed analógico, circuitos cronometrados com
fantasma da melhor volta, mundo aberto em três zonas com pontos de interesse,
cinco tipos de missão, hangar com upgrades de trade-off real, dano por partes,
clima e áudio inteiramente sintetizado. Roda no navegador, sem backend, e é
instalável como PWA.

- Fonte: [`drone-src/`](./drone-src)
- Build: `drone/` (gerado pelo workflow; commitado como plano B)
- **Documentação técnica:** [`docs/DRONEFARER.md`](./docs/DRONEFARER.md)
- **Decisões de projeto:** [`drone-src/DECISOES.md`](./drone-src/DECISOES.md)

```bash
cd drone-src
npm install
npm run dev          # desenvolvimento
npm run build        # gera ../drone/
npm run test:aceite  # 46 critérios de aceite executáveis
```

## NULLPOINT

Protótipo de FPS tático de arena em Three.js: movimento competitivo, armas
hitscan com recuo, dispersão e queda de dano, faca com cinco inspeções
(uma rara) e cancelamento suave, skins com float e desgaste procedural por
região de contato, pattern seeds, inventário com miniaturas 3D, visualizador
de colecionável, mercado offline (sem sorteio, sem dinheiro real), bots com
quatro dificuldades e partidas por rounds com captura de objetivo. Tudo
procedural — nenhum asset externo.

- Fonte: [`arena-src/`](./arena-src)
- Build: `arena/` (gerado pelo workflow; commitado como plano B)
- **Documentação técnica:** [`docs/NULLPOINT.md`](./docs/NULLPOINT.md)

```bash
cd arena-src
npm install
npm run dev        # desenvolvimento
npm run build      # gera ../arena/
npm test           # testes unitários
npm run test:e2e   # ponta a ponta no Chromium (Playwright)
```

## IRONLINE

FPS militar original em Three.js (IP própria, sem nomes nem assets de
terceiros). O núcleo (`src/core/`) cuida de renderer, loop de passo fixo,
entrada com pointer lock, colisão (AABB/cápsula + raycast de balas), jogador,
barramento de eventos e qualidade; todo o conteúdo — mundo, renderização,
arma, efeitos, inimigos, movimento, áudio e HUD — vem de features plugáveis
em `src/features/<nome>/`, cada uma isolada em seu próprio try/catch. Tudo
procedural — nenhum asset externo.

- Fonte: [`ironline-src/`](./ironline-src)
- Build: `ironline/` (gerado pelo workflow)
- **Documentação técnica:** [`docs/IRONLINE.md`](./docs/IRONLINE.md)
- **Contrato entre features e presets de screenshot:** [`ironline-src/CONTRACT.md`](./ironline-src/CONTRACT.md)

```bash
cd ironline-src
npm install
npm run dev        # desenvolvimento
npm run build      # gera ../ironline/
npm test           # testes unitários do núcleo
npm run shot -- --all --outdir /tmp/shots   # screenshots determinísticos de todos os presets
```

## QUADRA VIVA

Futsal arcade em Three.js com física em escala real (1 unidade = 1 m): bola
de 0,42 kg que quica pouco e rola "presa" ao chão, passo fixo de 1/120 s com
interpolação, condução por toques (a bola não gruda no pé), domínio, passe
por cone, chute com carga e cone de erro, desarme/carrinho com avaliação de
falta, lei da vantagem, goleiro com tempo de reação e mergulho, fôlego e
substituições. Joga no teclado, no toque (joystick virtual) ou com controle.
Tudo procedural — nenhum asset externo.

- Fonte: [`quadra-src/`](./quadra-src)
- Build: `quadra/` (gerado pelo workflow; commitado como plano B)
- **Documentação técnica:** [`docs/QUADRA-VIVA.md`](./docs/QUADRA-VIVA.md)
- **Todos os números de jogo:** [`quadra-src/src/config.js`](./quadra-src/src/config.js)

```bash
cd quadra-src
npm install
npm run dev        # desenvolvimento
npm run build      # gera ../quadra/
npm test           # testes da física e das regras (seções A–H do adendo)
npm run e2e        # ponta a ponta no Chromium (Playwright)
node tools/sim.mjs 5 3   # 5 partidas IA × IA no Node, sem render
```

## LÂMINA//FERRUGEM 3D

Versão 3D do LÂMINA//FERRUGEM (robô espadachim contra uma fábrica: um golpe
mata, um erro também). A simulação é a mesma do jogo 2D — física, IA,
chefes, parry, especiais, áudio, menus e save — e só a renderização mudou:
cena em Three.js com câmera inclinada que segue o jogador, paredes, pilares,
caixotes e grades em 3D, robôs montados com primitivas, ragdolls e carcaças
3D, sombras em tempo real, brilhos e partículas. O piso continua sendo o
canvas pré-renderizado da sala (com sangue, óleo e queimados pintados nele),
usado como textura. HUD, textos e avisos de ataque são desenhados num canvas
2D por cima, projetados no chão.

- Arquivo único, sem build: [`lamina3d/index.html`](./lamina3d/index.html)
- Three.js 0.185.1 copiado em `lamina3d/vendor/` (funciona offline como PWA)
- Qualidade: `ALTA` (sombras 2048), `AUTO` (sombras 1024, baixa a resolução
  se cair de 60 fps), `LEVE` (sem sombras, resolução 1×)

