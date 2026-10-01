# mathref

Repositório com cinco sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |
| [`/drone/`](https://xxxxsgh.github.io/mathref/drone/) | **Dronefarer** — simulador arcade de drone FPV |
| [`/arena/`](https://xxxxsgh.github.io/mathref/arena/) | **NULLPOINT** — FPS tático de arena com skins e inspeção de faca |
| [`/cod/`](https://xxxxsgh.github.io/mathref/cod/) | **Claude of Duty** — FPS de guerra por ondas numa cidade em ruínas |

## Publicação

O deploy é automático: qualquer push em `main` dispara
[`.github/workflows/pages.yml`](./.github/workflows/pages.yml), que compila os
jogos a partir de `game-src/`, `drone-src/` e `arena-src/`, monta o site e
publica no Pages.

Não há configuração manual: o passo `configure-pages` roda com
`enablement: true` e liga o Pages no repositório na primeira execução, já
com a origem definida como GitHub Actions.

Para republicar sem commit novo: aba *Actions* → *Publicar no GitHub Pages* →
*Run workflow*.

### O que vai para o ar

O workflow copia a raiz do repositório **por exclusão** — qualquer arquivo
novo na raiz é publicado sem precisar editar o workflow. Ficam de fora:
`game-src/`, `drone-src/`, `arena-src/`, `docs/`, `.github/`, `README.md`, `.gitignore` e
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

## Claude of Duty

FPS de guerra inspirado em Call of Duty e Battlefield, num único arquivo
([`cod/index.html`](./cod/index.html)) sem build: Three.js r147 via CDN e todo
o resto procedural — texturas, modelos, mapa e áudio sintetizado.

- Cidade em ruínas ao entardecer: céu físico, IBL, sombras suaves, neblina,
  bloom, gradação de cor e FXAA.
- Três armas (carabina com red dot, pistola, fuzil com luneta e respiração),
  recuo, dispersão, mira, recarga animada e granadas.
- Destruição: granadas derrubam paredes de ruínas e caixas; barris vermelhos
  explodem em cadeia.
- Inimigos com A* em grade, linha de visada, rajadas, tempo de reação e
  precisão que crescem a cada onda; minimapa marca quem atira.

Por ser um arquivo estático na raiz, o workflow do Pages publica em `/cod/`
sem nenhuma alteração.
