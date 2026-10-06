# Feature `touch`

Controles de toque para celular/tablet (adaptados do NULLPOINT). Só
aparecem em `input.touchMode` (aparelho só de toque, primeiro toque na tela
ou `?touch=1`), durante a partida (captura virtual ativa) e sem tela de menu
aberta. Nada no modo shot.

| Arquivo | O que faz |
|---|---|
| `index.js` | camada de toque, joystick, mira por arrasto, botões, tela cheia, aviso de rotação, serviço |
| `joy.js` | matemática pura do joystick (zona morta, teclas digitais, sprint) — testada em `tools/unit.test.mjs` |
| `style.js` | CSS injetado e ícones SVG originais |

## Mapa

| Gesto / botão | Ação do núcleo |
|---|---|
| joystick flutuante (42 % esquerdos da tela) | `forward/back/left/right` + `input.axis` analógico; empurrar até o fim para a frente = `sprint` |
| arrastar no resto da tela (ou sobre o ATIRAR grande) | `input.addTouchLook` (× `touchSensitivity`; respeita o multiplicador de ADS) |
| ATIRAR (grande, direita) / ATIRAR (esquerda) | `fire` (segurar) |
| ADS | `ads` alternado (solta sozinho ao correr) |
| RELOAD · JUMP · FRAG · MELEE | `reload` · `jump` · `grenade` · `melee` (segura enquanto o dedo está no botão) |
| CROUCH | `crouch` — toque agacha/levanta, em sprint vira slide, segurar deita (mesma semântica da tecla C) |
| SWAP | `services.weapon.swap()` se existir; senão alterna `weapon2`/`weapon1` |
| ☰ (placar) | repassa `Tab` (keydown/keyup) para a HUD |
| ‖ (pausa) | `input.exitLock()` → `input:lock` false → a HUD abre a pausa |

DEPLOY/RESUME chamam `input.requestLock()` como no desktop: no toque isso
liga a captura virtual, pede tela cheia e trava em paisagem (Android). Em
retrato num celular aparece o aviso para girar o aparelho.

As posições ficam acima da munição (embaixo à direita) e do cartão do
jogador (embaixo à esquerda), na mesma escala da prancheta 1920×1080 da HUD;
o tamanho dos botões acompanha a tela (×0,85..1,3) e a preferência
(`setScale`).

## Serviço `ctx.services.touch`

`active`, `visible`, `sensitivity`, `setSensitivity(0.2..4)`,
`setScale(0.6..1.5)`, `setFullscreen(bool)`, `enterFullscreen()`.
Preferências persistidas em `localStorage['ironline.touch.v1']`.
