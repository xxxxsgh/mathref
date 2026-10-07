# Feature `streaks`

Killstreaks, medalhas, finalizações (execução), killcam e modo foto. Tudo
procedural (modelos, texturas em canvas, sons em WebAudio). Ordem 55
(depois de `enemies`, antes de `vfx`/`hud`).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: conjunto/contagem, ativação (teclas 3–6, roda em B), medalhas, eventos, serviço `streaks`, DOM de reserva |
| `logic.js` | lógica pura: `StreakTracker`, `MedalTracker`, `RingBuffer`, `pickTurretTarget`, `turnToward`, `strikePattern` |
| `uav.js` | UAV (avião procedural em órbita, varreduras de radar, `revealed`) + radar de reserva |
| `airstrike.js` | morteiro: designador em tablet (captura ortográfica do mapa), 8 granadas escalonadas |
| `sentry.js` | torreta em tripé: modelo, posicionamento com fantasma, alvo, traçantes, calor, destruição |
| `drone.js` | quadricóptero armado ou kamikaze: modelo, rotores, steering, ataque |
| `finisher.js` | execução por trás (segurar V): operador em 3ª pessoa, 2 planos de câmera |
| `killcam.js` | anel de 6 s (30 Hz) e replay da morte pela perspectiva do atirador |
| `photo.js` | modo foto: câmera livre, exposição, FOV, roll, DOF, filtros, vinheta, grão, barras, PNG |
| `sfx.js` | sons próprios: ping, assobio 3D, bipes, motor, servo, chiado, whoosh, obturador |
| `ui.js` | CSS, ícones SVG de traço, helpers de DOM |
| `streaks.test.mjs` | testes da lógica pura (importados por `tools/unit.test.mjs`) |

## Killstreaks

| id | nome | abates | o que faz |
|---|---|---|---|
| `uav` | RECON UAV | 3 | 30 s; ping a cada 2,5 s revela todos os inimigos (minimapa) |
| `airstrike` | MORTAR STRIKE | 5 | designador → 8 granadas de morteiro (raio 6,5, dano 210) em ~4 s |
| `sentry` | SENTRY GUN | 6 | torreta 60 s / 400 tiros, 42 m, 800 rpm, superaquece; 350 de vida |
| `drone` | ATTACK DRONE | 7 | 40 s caçando e orbitando alvos, rajadas de 5; 120 de vida |
| `kamikaze` | KAMIKAZE DRONE | 7 | mergulha no inimigo e explode (raio 5,5, dano 230) |

- Contagem = abates sem morrer; abates feitos por killstreaks NÃO contam
  (`new StreakTracker(lo, { streakKillsCount: true })` muda isso). Cada
  killstreak é ganha uma vez por vida, no limiar exato; as ganhas ficam
  guardadas depois da morte (podem acumular).
- Conjunto: até 4, ordenado por custo, `drone` e `kamikaze` disputam a
  mesma vaga. Padrão `uav, airstrike, sentry, drone`. Persistido em
  `localStorage['ironline.streaks']` (try/catch); `?streaks=uav,sentry,…`
  força. Tela própria de escolha: `services.streaks.openPicker()`.
- Teclas: ações `streak1..streak4` = **3 / 4 / 5 / 6** (só se o código
  estiver livre) e `streakWheel` = **B** segurado (roda radial; solta para
  ativar). Designador: mouse/WASD move, LMB/Enter/F confirma, RMB/X
  cancela (devolve). Torreta: LMB/F posiciona, RMB/X cancela.
- **Toque (gancho):** `services.streaks.activate(i)` (vaga 0..3) ou
  `activate(id)`; ativar a torreta de novo posiciona; no designador, tocar
  no mapa move o retículo e o botão CONFIRM dispara
  (`designator.move/confirm/cancel`); execução: `finisher.execute()`.

## Serviço `streaks`

`STREAKS`, `MEDALS`, `loadout`, `setLoadout(ids)`, `count`, `best`,
`ready`, `slots()` (barra da HUD: `{ id, name, kills, icon, key, ready,
progress }`), `next()`, `activate(k)`, `active` (`[{ id, remaining,
health?, heat? }]`), `busy`, `revealed`, `uav`, `decoys`, `designator`,
`killcam.active`, `finisher.{ target, active, execute }`,
`photo.{ active, enter, exit, capture, settings, set }`, `openPicker()`,
`grant(id)` e `debug.{ sentry, drone, strike, uav, medal }` (QA).

### Revelação da UAV (para o minimapa da HUD)

- `services.streaks.revealed` — array (mutado no lugar) de
  `{ id, x, y, z, t, age, alpha, kind: 'enemy', role }`: posição de cada
  inimigo NO MOMENTO do último ping; `alpha` cai de 1 a 0 até o próximo
  ping. Vazio sem UAV ativa.
- `services.streaks.uav` — `{ active, remaining, sweep, period, center:{x,z},
  radius, pingT }`; `sweep` = ângulo do traço (rad, 0 = norte/−Z, sentido
  horário) para desenhar a varredura.
- Evento `uav:ping { count, t }`.

### Decoys (para a IA inimiga)

`services.streaks.decoys` = `[{ kind: 'sentry'|'drone', position, radius,
alive, damage(amount, info) }]`. A IA (enemies/brain.js) atira no decoy
visível mais perto que o jogador.

## Eventos

| Evento | Payload |
|---|---|
| `streak:ready` | `{ id, name, kills, icon, refund? }` (ganha ou devolvida) |
| `streak:used` | `{ id, name, kills, icon }` (entrou em ação de fato) |
| `streak:end` | `{ id }` |
| `streak:progress` | `{ count, next: { id, kills, left } \| null }` |
| `streak:loadout` | `{ loadout }` |
| `medal:award` | `{ id, name, xp, icon }` |
| `uav:ping` | `{ count, t }` |
| `designator:open` / `designator:close` | `{ id }` |
| `finisher:start` / `finisher:end` | `{ enemy, aborted? }` |
| `killcam:start` / `killcam:end` | `{ killer }` |
| `photo:enter` / `photo:exit` / `photo:capture` | `{ name? }` |

## Medalhas (25)

first_blood, double, triple, fury (4+), headshot, longshot (≥ 35 m),
point_blank (≤ 3 m), collateral (2 abates no mesmo tiro), revenge (quem te
matou), comeback (abate após 3 mortes sem abater), slide_kill
(`ctx.player.sliding`, `movement.stance() === 'slide'` ou até 0,5 s depois
de `player:slide { phase:'end' }`), grenade_kill, knife_kill, execution,
buzzkill (socorrista reanimando ou atirador com o laser carregado),
survivor (≤ 15 % de vida e de volta a 100 %), last_stand (abate com ≤ 20 %),
barrel_kill (KABOOM), shield_breaker (FLANKER: escudeiro sem explosivo),
streak_5/10/15, airstrike_kill, sentry_kill, drone_kill.

## Execução (finisher)

Inimigo desatento, de costas, a < 1,9 m (`enemies.executionTarget()`):
aviso "[V] HOLD EXECUTE" com anel. Pressionar trava o golpe normal por
0,45 s; segurar 0,3 s executa; soltar antes = golpe pelas costas. A
coreografia da vítima e do operador fica em `enemies/execution.js`; aqui
ficam a câmera (perfil → contra-plongée 3/4 com corte), barras de cinema,
HUD/viewmodel escondidas e a volta à 1ª pessoa.

## Killcam

Anel de 6 s a 30 Hz (jogador + `enemies.snapshot()`) e disparos
(`enemy:fire`). Na morte com `info.enemy`: 0,5 s depois, replay de
[−2,4 s, +0,2 s] (últimos 0,5 s a 0,5×) com os inimigos como "fantasmas"
(`enemies.ghost.apply`, só no render), o jogador como operador em ragdoll,
câmera por cima do ombro do atirador (FOV fecha a distância), canvas
dessaturado, cartão do atirador e barra de tempo. Cabe nos 4 s do
renascimento; `killcam.active` permite à HUD adiar.

## Modo foto

Na pausa: botão PHOTO MODE ou tecla H. Simulação parada, HUD escondida.
Arrastar gira, WASD/Q/E move, roda = FOV; painel com exposição, FOV, roll,
foco/abertura (DOF), filtro (9), contraste, saturação, vinheta, grão,
barras; P/Enter captura e baixa PNG; Esc sai. Pós-processo próprio numa
microtarefa depois do render (cópia do framebuffer + passada de
profundidade própria + quad) — o compositor da feature rendering não muda.

## Ganchos pedidos a outras features

- **HUD (B) — feito:** barra de killstreaks (`slots()` com `key`; `key`
  também vai no `streak:ready`) e toasts de medalha a partir dos eventos,
  sem duplicar as que a partida já dá (a versão daqui vence). Com a HUD
  carregada, a barra/toast de reserva daqui ficam escondidos
  (`services.hud.handlesStreaks/handlesMedals = false` reativa).
- **HUD (B) — pendente:** ler `revealed`/`uav` no minimapa e declarar
  `services.hud.handlesReveal = true` (até lá aparece o radar de reserva);
  adiar o renascimento enquanto `services.streaks.killcam.active`; botão
  PHOTO MODE na pausa chamando `services.streaks.photo.enter()`; seletor de
  killstreaks no loadout (`setLoadout`/`openPicker`).
- **Toque:** botões para `activate(0..3)` e para `finisher.execute()`.
- **Movimento (C):** `ctx.player.sliding` / `player:slide` (já lidos).

## Custo

- Modelos (torreta, drone, UAV) criados só ao usar; peças rígidas juntadas
  por material (`merge.js`): a torreta cai de ~70 peças para ~15 draw
  calls, o drone para ~8 + rotores.
- Torreta e drone: traçante em metade dos tiros; alvo reavaliado a cada
  0,22–0,3 s (raycast de visada por inimigo só nessa hora).
- Killcam: retrato a 30 Hz num anel fixo (sem crescer); modo foto só gasta
  a passada de profundidade quando a câmera ou o foco mudam.
- Sons: um laço de motor por drone/UAV, demais sons curtos e descartáveis.
