# mathref

Repositório com dois sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |
| [`/game/drone/`](https://xxxxsgh.github.io/mathref/game/drone/) | **Drone** — simulador FPV de quadricóptero, no mesmo motor |

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
`game-src/`, `docs/`, `.github/`, `README.md`, `.gitignore` e `node_modules/`.

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
npm run build    # gera ../game/ (as duas páginas)
npm run preview  # serve o build em /mathref/game/
```

O `index.html` da raiz (MathRaf) não é tocado pelo build do jogo.

## Drone

Versão drone do mesmo projeto: um simulador de quadricóptero FPV em
[`game-src/src/drone/`](./game-src/src/drone), compilado como segunda página do
mesmo build (`/game/drone/`). Compartilha o motor, o utilitário de matemática,
o ruído procedural e o pool de objetos com o Starfarer; o resto é próprio.

A diferença não é a malha — é o modelo de voo. Uma nave acelera na direção do
nariz; um quadricóptero só sabe empurrar na direção do próprio "para cima", e
essa única restrição produz tudo o mais: inclinar para ir em frente, afundar ao
curvar sem acelerador, e o acelerador virar um recurso a administrar em vez de
um botão de velocidade.

O que existe:

- **Física de quadricóptero** com empuxo/peso de 3,4:1, inércia de motor,
  arrasto anisotrópico, efeito solo e mixagem dos quatro motores com airmode.
- **Modos ACRO e ANGLE** — taxa pura (onde flips existem) e auto-nivelamento,
  com o mesmo laço interno de taxa que um controlador de voo usa.
- **Bateria LiPo 6S** modelada por voltagem, com afundamento sob carga: o OSD
  responde ao acelerador em tempo real, e a leitura da bateria vira habilidade.
- **Vale procedural** de 2,6 km com relevo, lago, ~870 obstáculos instanciados
  e torres de treliça como pontos de referência.
- **Circuito de 9 gates** com detecção por travessia de plano (imune a
  tunelamento em alta velocidade), voltas cronometradas e recorde local.
- **Três câmeras**: FPV parafusada no frame (não estabilizada, com inclinação
  para cima), perseguidora e vista de solo.
- **OSD analógico**, chuvisco de link de vídeo proporcional à distância e à
  altura, retorno automático (RTH), cerca virtual e telemetria em `F3`.
- Teclado, **gamepad** (os dois analógicos são os dois manches de um rádio) e
  dois manches virtuais no touch, com acelerador sem mola de retorno.
