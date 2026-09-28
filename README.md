# mathref

Repositório com três sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |
| [`/drone/`](https://xxxxsgh.github.io/mathref/drone/) | **Dronefarer** — simulador arcade de drone FPV |
| [`/principe/`](https://xxxxsgh.github.io/mathref/principe/) | **Estrelas que Riem** — a história de *O Pequeno Príncipe* em 3D |

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

## Estrelas que Riem

Jogo 3D que conta a história de *O Pequeno Príncipe* (Antoine de
Saint-Exupéry, 1943), feito do zero em Three.js com estilo próprio: "tinta e
aquarela" — materiais toon em quatro tons, contorno de tinta, céu de manchas
de aquarela e textura de papel por cima de tudo. Modelos, música (sintetizada
em tempo real) e textos são originais.

Cada capítulo é um pequeno planeta esférico com gravidade radial — dá para
dar a volta no B-612 em poucos passos:

| Capítulo | O que se faz |
|---|---|
| Prólogo | O aviador conserta o motor no Saara; o príncipe pede um carneiro (caderno de desenhos) |
| I · B-612 | Arrancar baobás, limpar vulcões, regar a rosa, levar o biombo, ver o pôr do sol |
| II · O Rei | Obedecer a ordens razoáveis e julgar o velho rato |
| III · O Vaidoso | Aplaudir para ele erguer o chapéu |
| IV · O Bêbado | A conversa em círculo; recolher garrafas |
| V · O Homem de Negócios | Achar cinco estrelas caídas — e decidir de quem elas são |
| VI · O Acendedor | Acender e apagar o lampião num planeta que gira a cada 12 s |
| VII · O Geógrafo | Explorar os lugares marcados e descobrir que as flores são efêmeras |
| VIII · A Terra | Serpente, flor de três pétalas, o eco da montanha, o jardim de rosas e cativar a raposa |
| IX · O Poço | Caminhar à noite pelo deserto até o poço |
| Final | As estrelas que riem |

Entre os asteroides, o príncipe viaja agarrado a um bando de pássaros e colhe
poeira de estrela — ela vira as estrelas douradas que riem no final.

- Fonte: [`principe/`](./principe) — HTML + módulos ES, **sem build**. O
  Three.js (r170) está copiado em `principe/vendor/`, então funciona offline.
- Controles: WASD/setas, Shift (devagar), Espaço (pular), E (interagir),
  arrastar ou Z/C (câmera). No celular: joystick virtual e botões na tela.
- O progresso fica salvo no `localStorage`; o menu permite voltar a qualquer
  capítulo já visitado. `?cap=N` abre direto o capítulo N (útil para testar).

```bash
python3 -m http.server 8080   # na raiz do repositório
# abrir http://localhost:8080/principe/
```
