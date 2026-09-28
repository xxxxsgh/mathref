# mathref

Repositório com três sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |
| [`/drone/`](https://xxxxsgh.github.io/mathref/drone/) | **Dronefarer** — simulador arcade de drone FPV |
| [`/ilo/`](https://xxxxsgh.github.io/mathref/ilo/) | **Ilo e o Céu Apagado** — aventura 3D original em mundos pequeninos |

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

## Ilo e o Céu Apagado

Jogo 3D com história, personagens e mundos **originais**, feito do zero em
Three.js com estilo próprio "tinta e aquarela": materiais toon em quatro tons,
contorno de tinta, céu de manchas de aquarela e textura de papel por cima de
tudo. Modelos, música (sintetizada em tempo real) e textos foram criados para
o jogo.

**A história.** Em Cisco, uma lua do tamanho de um quintal, Ilo mora com a Vó
Brasa, que mantém o céu aceso com seu braseiro. Uma noite as estrelas começam
a apagar: cada mundinho vizinho perdeu alguma coisa de que gostava. Ilo monta
uma pipa, voa de mundo em mundo ajudando os moradores e junta sete faíscas
para reacender o céu.

Cada capítulo é um pequeno mundo esférico com gravidade própria:

| Capítulo | O que se faz |
|---|---|
| Prólogo · Cisco | Arrancar ervas-de-sombra, varrer chaminés, alimentar o braseiro, desenhar a pipa |
| I · Relógio | Alcançar o Tique, a engrenagem que fugiu de tanto trabalhar |
| II · Sinos | Tocar os cinco sinos para o maestro que esqueceu sua música |
| III · Nevoeiro | Achar os quatro nuvenzinhos da baleia-nuvem Cúmulo |
| IV · Pinhas | Achar cinco estrelas caídas — e decidir se ficam guardadas ou voltam ao céu |
| V · Farol | Acender e apagar o farol num mundo onde o dia dura 12 s |
| VI · Mapas | Descrever o mundo para a cartógrafa toupeira que nunca o viu |
| VII · Grande Duna | Lagarta de vidro, o cacto, o eco da montanha, o Campo das Lanternas e ganhar a confiança do cervinho Musgo |
| VIII · A Fonte | Caminhar à noite com Musgo até a Fonte das Estrelas |
| Final | Soltar as sete faíscas e dar nome à estrela nova |

Entre os mundos, Ilo voa pendurado na pipa colhendo faíscas soltas — elas
viram as estrelas douradas que acendem no final.

- Fonte: [`ilo/`](./ilo) — HTML + módulos ES, **sem build**. O Three.js (r170)
  está copiado em `ilo/vendor/`, então funciona offline.
- Controles: WASD/setas, Shift (devagar), Espaço (pular), E (interagir),
  arrastar ou Z/C (câmera). No celular: joystick virtual e botões na tela.
- O progresso fica salvo no `localStorage`; o menu permite voltar a qualquer
  capítulo já visitado. `?cap=N` abre direto o capítulo N (útil para testar).

```bash
python3 -m http.server 8080   # na raiz do repositório
# abrir http://localhost:8080/ilo/
```
