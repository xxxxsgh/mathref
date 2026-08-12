# DRONEFARER — documentação técnica

Simulador arcade de drone FPV em Three.js, publicado como build estático em
`https://xxxxsgh.github.io/mathref/drone/`.

- **Fonte:** `drone-src/`
- **Build publicado:** `drone/` (commitado, plano B do Pages)
- **Decisões de projeto:** [`../drone-src/DECISOES.md`](../drone-src/DECISOES.md)

É o irmão FPV do [Starfarer](./STARFARER.md) e mora no mesmo repositório, com o
mesmo arranjo de deploy.

---

## Como rodar

```bash
cd drone-src
npm install
npm run dev        # http://localhost:5173  (o `base` é ignorado em dev)
```

Para testar no iPad, `npm run dev` já sobe com `host: true` — abra
`http://<ip-do-seu-pc>:5173` no Safari do iPad, em modo paisagem.

```bash
npm run build        # gera ../drone/
npm run preview      # serve o build em /mathref/drone/
npm run icons        # regenera os PNGs do PWA
npm run test:aceite  # roda os critérios de aceite (precisa de `npm i -D playwright`)
```

---

## Controles

| Ação | Teclado | Gamepad (Mode 2) | Toque (iPad) |
|---|---|---|---|
| Acelerador | `W` / `S` | analógico esquerdo ↑↓ | stick esquerdo ↑↓ |
| Guinada (yaw) | `A` / `D` | analógico esquerdo ←→ | stick esquerdo ←→ |
| Inclinar (pitch) | `↑` / `↓` | analógico direito ↑↓ | stick direito ↑↓ |
| Rolar (roll) | `←` / `→` | analógico direito ←→ | stick direito ←→ |
| Trocar ANGLE / ACRO | `M` | △ / Y | botão **MODO** |
| Reiniciar volta ou missão | `R` | ○ / B | botão **RE** |
| Mapa em tela cheia | `Tab` | Select | botão **MAPA** |
| Quadro de missões | `J` | — | — |
| Hangar (upgrades) | `H` | — | — |
| Aceitar missão 1–5 | `1`…`5` | — | toque na linha |
| Interagir / fotografar / reparar | `E` ou `Espaço` | ✕ / A | — |
| Trocar de circuito | `[` / `]` | — | — |
| Clima (limpo→chuva→névoa→vento→noite) | `K` | — | — |
| Modo sem risco | `N` | — | — |
| Photo mode | `P` | — | — |
| 3ª pessoa (debug) | `C` | □ / X | — |
| Opções / fechar tela aberta | `Esc` | Start | botão **❚❚** |
| Painel de debug | `F3` ou `` ` `` | — | — |
| Tuning ao vivo | `G` (com `?debug=1`) | — | — |

Os sticks virtuais **nascem onde o dedo encosta**, na metade correspondente da
tela — não há posição fixa a procurar.

### Parâmetros de URL

| Parâmetro | Efeito |
|---|---|
| `?q=alto\|medio\|baixo\|minimo` | força o tier de qualidade |
| `?debug=1` | liga o painel de números e o tuning ao vivo (`lil-gui`) |

---

## Arquitetura

```
drone-src/src/
├── config.js          ← TODAS as constantes de tuning, em 12 seções
├── main.js            ← montagem e ordem do frame; nenhuma regra de jogo
├── core/              ← loop de timestep fixo, tiers, input, save
│   └── input/         ← teclado, gamepad, toque
├── flight/            ← modelo de voo, bateria, vento, dano, rádio
├── camera/            ← câmera FPV, pós-processamento, killcam, photo mode
├── world/             ← terreno em chunks, props, zonas, POIs, clima, céu
├── race/              ← circuitos, gates, cronometragem, ghost
├── missions/          ← os cinco tipos de missão e seus objetos de cena
├── meta/              ← chassis, upgrades e economia
├── audio/             ← síntese em Web Audio
└── ui/                ← HUD, mapa, quadro, hangar, opções, tutorial, debug
```

Regra que organiza tudo: **`main.js` liga as peças, os módulos têm as regras.**
Quando `main.js` começar a ter lógica de jogo, está faltando um módulo.

### O laço do frame

1. `Engine` acumula tempo e roda a física em **passos fixos de 1/60 s**.
2. Cada passo: input → rádio → vento → voo → colisão → corrida/missão → mundo.
3. O render é desacoplado e **interpola** a pose entre o passo anterior e o atual.

Sem passo fixo, o mesmo comando daria resultados diferentes a 30 e 60 fps, e o
ghost gravado num aparelho não bateria no outro.

### Como um upgrade chega no voo

O modelo de voo **não sabe que upgrades existem**. `meta/Loadout.js` reduz
chassi + upgrades a um punhado de escalas (`thrustScale`, `rateScale`,
`massScale`, `dragScale`…), e `main.js` passa isso no objeto `env` do
`Drone.update` — a mesma porta por onde a carga das missões e o clima já entram.

---

## Desempenho

- Terreno em chunks com **orçamento de 2 chunks por frame**; a função de altura é
  analítica e pura (`world/noise.js`), então colisão e malha consultam a mesma
  fonte sem raycast nem textura.
- Props, poeira e chuva são **instanciados**; poeira e chuva não custam nenhuma
  atualização de CPU (a caixa de partículas é repetida no vertex shader).
- Pós-processamento em **passe único**.
- **Qualidade adaptativa** que só desce, medindo o tempo de frame suavizado.

### Auditoria de bundle

| | JS (gzip) | Total (gzip) |
|---|---|---|
| Three (chunk próprio) | 135,1 KB | |
| Código do jogo | 45,3 KB | |
| CSS | — | 2,9 KB |
| **Total baixado** | | **≈ 183 KB** |
| `lil-gui` (só com `?debug=1`) | 8,1 KB | não baixado em produção |

O roadmap manda trocar o barrel do Three por imports específicos **se** o gzip
passar de ~250 KB. Não passou: 183 KB. O Rolldown já faz tree-shaking do barrel
(o Three inteiro seria ~170 KB gzip), então a troca custaria legibilidade em 23
arquivos sem ganho mensurável. **Mantido o barrel.**

---

## Publicação

`.github/workflows/pages.yml` compila os **dois** jogos a cada push em `main` e
publica tudo. Há um passo que verifica o `base` de cada build e falha o CI se ele
deixar de bater com o caminho do Pages — é mais barato falhar ali do que publicar
uma tela preta que só reclama no console.

```bash
# Deploy: o push é o deploy.
cd drone-src && npm run build && cd ..
git add drone drone-src && git commit -m "..." && git push origin main
```

Para republicar sem commit novo: aba *Actions* → *Publicar no GitHub Pages* →
*Run workflow*.

---

## Critérios de aceite executáveis

`npm run test:aceite` sobe o build, pilota o drone pelo teclado de verdade e
verifica **46 afirmações** — desde "inclinar pra frente troca altura por
velocidade" até "o recorde sobrevive ao recarregar" e "nenhum upgrade é só
vantagem".

Sensação de pilotagem ninguém automatiza. As afirmações físicas por trás dela,
sim — e são elas que quebram em silêncio quando alguém mexe num número do
`config.js`.
