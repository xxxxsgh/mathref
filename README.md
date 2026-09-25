# mathref

Repositório com quatro sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |
| [`/drone/`](https://xxxxsgh.github.io/mathref/drone/) | **Dronefarer** — simulador arcade de drone FPV |
| [`/cidades/`](https://xxxxsgh.github.io/mathref/cidades/) | **Duas Cidades** — Jaipur e Kolkata como planetinhas 3D cel-shaded para explorar a pé |

## Publicação

O deploy é automático: qualquer push em `main` dispara
[`.github/workflows/pages.yml`](./.github/workflows/pages.yml), que compila o
jogo a partir de `game-src/`, monta o site e publica no Pages.

Não há configuração manual: o passo `configure-pages` roda com
`enablement: true` e liga o Pages no repositório na primeira execução, já
com a origem definida como GitHub Actions.

Para republicar sem commit novo: aba *Actions* → *Publicar no GitHub Pages* →
*Run workflow*.

### O que vai para o ar

O workflow copia a raiz do repositório **por exclusão** — qualquer arquivo
novo na raiz é publicado sem precisar editar o workflow. Ficam de fora:
`game-src/`, `drone-src/`, `docs/`, `.github/`, `README.md`, `.gitignore` e
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
