# QUADRA VIVA

Futsal arcade em Three.js + Vite, com física em escala real. Implementa o
**Adendo — Gameplay e Física Detalhadas** (seções A–K). Nenhum asset externo:
quadra, bonecos, bola, torcida e sons são gerados em código.

- Jogo publicado: `/mathref/quadra/`
- Fonte: [`quadra-src/`](../quadra-src)
- Build: `quadra/` na raiz do repositório (gerado por `npm run build` e pelo workflow do Pages)
- Todos os números: [`quadra-src/src/config.js`](../quadra-src/src/config.js)

## Arquitetura

```
quadra-src/
├── src/
│   ├── config.js          # K. todos os números + lista AJUSTES (o que fugiu do real)
│   ├── loop.js            # B. passo fixo 1/120 s, interpolação, máx. 5 passos/quadro
│   ├── sim/               # simulação pura (sem three/DOM): roda no Node
│   │   ├── ball.js        # C. estados, rolamento, ar, Magnus, vento, quique, traves, rede, linhas
│   │   ├── players.js     # D. velocidades, aceleração, curvas, meia-volta, fôlego, colisões, ombro
│   │   ├── actions.js     # E–H. condução, domínio, finta, sola, passe, chute, desarme, carrinho
│   │   ├── ai.js          # IA dos times (losango 1-2-1, marcação individual) e goleiro (I)
│   │   ├── human.js       # J. botões contextuais, buffer, carga, de primeira, troca automática
│   │   ├── match.js       # regras: gol, saídas, faltas, vantagem, cartões, cobranças, relógio, banco
│   │   └── teams.js       # elencos fictícios e atributos 1–99
│   ├── render/            # three.js: quadra, gols e rede, bonecos animados, câmera de TV
│   ├── input/input.js     # teclado, toque (joystick virtual + botões), gamepad
│   ├── audio/audio.js     # WebAudio sintetizado
│   └── ui/                # HUD, menus, modo de teste
└── tools/
    ├── unit.test.mjs      # testes das seções A–H (npm test)
    ├── e2e.mjs            # partida real no Chromium headless (npm run e2e)
    └── sim.mjs            # partidas IA × IA no Node, para calibrar
```

A simulação não conhece o render: `Match.step(dt, entrada)` avança 1/120 s e
deixa eventos (`kick`, `post`, `net`, `goalScored`, `foul`…) numa fila que o
render, o áudio e a HUD consomem a cada quadro. A IA usa exatamente as mesmas
ações do humano — erra passe, perde dividida e cansa pelas mesmas regras.

## Onde está cada seção do adendo

| Seção | Onde | Notas |
|---|---|---|
| A. Medidas | `config.js` (`court`, `ball`, `player`) | 40×20 m, gol 3×2 m, traves de 8 cm, área de 6 m, bola r = 0,10 m |
| B. Loop | `loop.js`, `main.js` | regras, IA e cronômetro no mesmo passo; render interpola `prev → atual` |
| C1. Estados | `ball.js` `BallState` | RASTEIRA/AÉREA pela física; DOMINADA/MORTA pelas regras |
| C2. Rasteira | `ball.js` `substep` | 1,8 / 2,2 / 2,6 / 6,0 m/s² (madeira/emborrachado/rua/poça); para < 0,05 m/s; giro visual = distância / raio |
| C3. Aérea | `ball.js` | arrasto `k·|v|·v` (k = 0,015); Magnus ∝ `spin·v²` → curva ≤ ~1 m em 15 m independente da força; vento lateral só na rua |
| C4. Quique | `ball.js` | e = 0,5 (2 m → 0,5 m), −15% horizontal, < 0,3 m/s vira rasteira |
| C5. Colisões | `ball.js`, `match.js` `ballInteractions` | traves/travessão como cilindros (e = 0,6, ±3°), rede segura 90%, corpo −60%, mão de jogador de linha = falta |
| C6. Saída/gol | `ball.js` `lineCrossing` | subpassos de ≤ 5 cm + interpolação da travessia: bola inteira, sem "atravessar" |
| D. Movimento | `players.js` `movePlayer` | 0,6 s para acelerar, 0,4 s para frear, ≤45° mantém, 45–120° −30%, >120° meia-volta; piso escorregadio +40% de frenagem |
| D3. Fôlego | `players.js` | −8/s arrancada, −1/s corrida, +4/s parado; < 30: −15% velocidade e mais erro; banco recupera rápido |
| D4. Contato | `players.js` `collidePlayers` | sem atravessar; disputa de ombro (Marcação + velocidade); empurrão por trás = falta |
| E. Condução | `actions.js` `dribbleStep`, `trap`, `feint`, `solePull` | toques de 0,6–1,8 m, bola solta entre toques, domínio bom/ruim, finta atrasa o marcador, sola, proteger |
| F. Passe | `actions.js` `pickPassTarget`, `doPass`, `leadPoint` | cone de 40°, força até 18 m/s, profundidade no ponto de encontro, passe alto com queda calculada, erro por Passe/fôlego/de primeira/corpo virado/marcação/perna ruim |
| G. Chute | `actions.js` `doShoot`, `shotErrorDeg` | carga de 0,8 s e depois "isola"; 12 → 25–32 m/s; normal, colocado (efeito para dentro), cavadinha, bico; cone de erro somando os 7 fatores |
| H. Defesa | `actions.js` `doTackle`, `doSlide`; `match.js` `foul` | desarme de 1 m (perna antes da bola = falta), carrinho de 2,5 m com 1 s no chão; gravidade → nada/falta/amarelo/vermelho; vantagem de 2 s |
| I. Goleiro | `ai.js` `keeperUpdate`, `decideSave`; `match.js` `save` | linha bola–gol adiantando, reação 0,35→0,15 s, mergulho de 2 m, segura/espalma/rebote, saída, reposição curta/longa, 4 s |
| J. Controles | `human.js`, `input.js` | buffer de 0,15 s, botões contextuais, vibração, Assistido/Manual, troca automática que nunca interrompe uma ação |
| K. Ajuste | `config.js`, modo de teste | `F3` ou 5 toques no relógio: velocidade/estado da bola, cone do chute, fôlego, linhas de passe, trajetória prevista |

## Controles

| Ação | Teclado | Toque | Controle |
|---|---|---|---|
| Mover / correr | WASD ou setas / Shift | joystick esquerdo / CORRER | analógico / RB |
| Passe (segurar = forte) · sem bola: trocar | J ou Espaço | PASSE | A |
| Passe em profundidade | I | PROF. | X |
| Passe alto | U | ALTO | Y |
| Chute (segurar carrega) · sem bola: desarme | K | CHUTE | B |
| Chute colocado / cavadinha | Q / E segurados | seletor "CHUTE: …" | LT / D-pad ↓ |
| Bico · sem bola: carrinho | O | BICO | RT |
| Drible: toque = finta (com direção) ou sola; segurar = proteger · sem bola: pressão dupla | L | DRIBLE | LB |
| Controlar o goleiro | G | — | Back |
| Substituição | T | — | R3 |
| Pausa · câmera · modo de teste | Esc · C · F3 | ❚❚ · — · 5 toques no relógio | Start |

## Regras implementadas

Saída de bola, lateral, escanteio, arremesso de meta (com a mão), falta
direta, pênalti (falta na área), tiro livre de 10 m sem barreira a partir da
6ª falta acumulada no tempo, 4 segundos nas cobranças e com o goleiro,
recuo para o goleiro (não pega com a mão), cartões (dois amarelos = vermelho),
expulsão com 2 minutos ou até sofrer gol, tempo cronometrado (para com a bola
morta), troca de lado no intervalo, substituições volantes.

## Ajustes a favor da diversão (seção K)

Ficam em `AJUSTES`, no fim de `config.js`. Hoje:

- condução: entre toques a bola desacelera com 12 m/s² (e não 1,8), senão o jogador levaria ~2 s para alcançá-la;
- banco recupera 12 de fôlego por segundo;
- só 35% das bolas na faixa do braço contam como mão;
- tempo padrão de 3 minutos cronometrados (o real é 20).

## O que foi decidido sem o documento principal

O adendo cita seções do documento principal (1–9) que não estão no repositório.
Nesses pontos o jogo usa escolhas próprias, fáceis de trocar:

- três times fictícios (`teams.js`) com atributos Velocidade, Drible, Passe,
  Finalização, Marcação, Reflexo e Frieza, perna preferida e o traço "Artista";
- três quadras: Ginásio (madeira, suor deixa o piso escorregadio no 2º
  tempo), Quadra Coberta (emborrachado) e Quadra de Rua (vento e poças);
- torcida a favor do mandante (pressiona o visitante, pesa com a Frieza);
- câmera lateral de transmissão; partida rápida contra a IA (sem modo carreira).
