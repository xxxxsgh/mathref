# DRONEFARER — decisões

Uma linha por decisão, na ordem em que foram tomadas. Quando o roadmap deixou a
escolha em aberto, o critério de desempate foi o combinado: **o que roda melhor
em iPad e tem menos dependência**.

## Fase 0 — Fundação

- **Física do drone: integração manual (semi-implícita), sem Rapier.** O pedido é
  arcade com peso, não simulador; um solver de rigid body daria de graça
  exatamente o realismo que teríamos de desfazer (capotar ao raspar num poste),
  custando ~1,2 MB de WASM.
- **Pós-processamento: shader próprio de passe único, sem a lib `postprocessing`.**
  O feed FPV é barril + aberração cromática + vinheta + ruído — todos efeitos de
  tela cheia que cabem num fragment shader só. Uma lib faria o mesmo passe com
  ~45 KB gzip a mais e uma API a aprender.
- **Terreno: chunks com streaming desde o início, não heightmap único.** A Fase 3
  exige mundo aberto; começar com heightmap único significaria reescrever
  terreno, colisão e props no meio do projeto. O custo de começar em chunks é
  quase zero porque a função de altura é a mesma.
- **Dependência de runtime única: `three`.** Ruído gradiente e PRNG são ~80 linhas
  escritas à mão (`world/noise.js`), o que também deixa a função de altura
  utilizável dentro de um Web Worker sem bundling extra.
- **Deploy em `/mathref/drone/`,** fonte em `drone-src/` e build commitado em
  `drone/` — mesmo arranjo já validado pelo Starfarer no mesmo repositório.
- **Módulos em pastas (`core/`, `flight/`, `world/`, …) em vez de arquivos soltos
  na raiz.** O roadmap pedia arquivos curtos, não raiz plana; as pastas mantêm os
  arquivos curtos e ainda dão nomes previsíveis pra achar no iPad.
- **Timestep fixo em 60 Hz com render desacoplado e interpolação.** Sem isso o
  ghost gravado num aparelho não bate no outro.
- **Qualidade adaptativa só desce, nunca sobe sozinha.** Subir de volta faz o jogo
  oscilar entre dois tiers, e oscilar é pior de jogar que ficar no tier baixo.

### Aceite verificado

- `npm run build` gera `../drone/` com `base: '/mathref/drone/'`. ✅
- Loop de física fixo em 60 Hz com render desacoplado. ✅
- 4 tiers detectados por GPU/resolução/núcleos, com override por `?q=`. ✅
- Cena com grid + contador de FPS. ✅
