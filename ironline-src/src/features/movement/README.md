# movement

Locomoção em primeira pessoa (passo fixo) + movimento de câmera (por frame).
Todos os números ficam em `tuning.js` (comentados); a lógica pura (slide,
rampa, cancel, slide-jump, estamina, montar) fica em `slidephys.js` e é
testada em `slidephys.test.mjs` (importado por `tools/unit.test.mjs`).

## Controles

| Ação | Tecla (padrão) | Comportamento |
|---|---|---|
| andar | WASD | 4.5 m/s; aceleração com curva, ré 0.82×, lateral 0.92×, mirando 0.6×; joystick do toque é analógico (`input.axis`) |
| sprint | Shift (toque ou segurar) | 6.7 m/s com rampa; cancela ao atirar/mirar/parar/bater em parede |
| sprint tático (#48) | **duplo toque** em Shift (≤ 0.32 s) ou Shift de novo correndo | 8.3 m/s, arma erguida (`player.tacSprint`), 3.6 s de "combustível", recarga após 2.4 s parado (1.4/s) |
| slide | Agachar em sprint (≥ 5.2 m/s) | +1.35 m/s (×1.25 no tático), atrito baixo nos primeiros 0.32 s; A/D e o olhar dirigem levemente |
| slide-cancel (#39) | Agachar de novo (após 0.1 s) | levanta mantendo 92 % do embalo e **devolve o sprint** (tático se era tático) |
| slide-jump (#40) | Espaço no slide | pulo com 95 % do embalo, teto de 9.2 m/s horizontais; sprint volta ao pousar |
| slide-hop | Agachar no ar | ao pousar rápido, encadeia outro slide (sem boost dentro do cooldown) |
| atirar deslizando (#41) | fogo no slide | a arma pode atirar; `player.slideSpread` (1.9 → 1.35 em 0.28 s) e `player.slideRecoil` (1.2) para a arma ler |
| slide kick (#42) | V (corpo a corpo) no slide | janela de 0.24 s: o 1º inimigo/danificável à frente (≤ 1.7 m, cone) leva 60 de dano (perna), empurrão de 4.2 m/s; a faca NÃO sai (o toque é consumido) |
| dolphin dive (#43) | Z em sprint ou no slide | salto baixo para frente, impacto (tremor, poeira, baque) e escorrega de bruços 0.6 s |
| slide em rampa (#44) | — | declive medido à frente/atrás dos pés: aceleração g·sinθ·0.85, menos atrito e até +0.9 s de slide descendo; subida freia |
| slide sob obstáculo (#45) | — | cápsula de 1.0 m no slide; sob um teto baixo (não cabe agachado) o slide continua a ≥ 2.6 m/s até sair; cancel/pulo esperam |
| slide para cobertura (#46) | — | slide que termina (ou bate) num muro baixo (bloqueia a 0.55 m, livre a 1.3 m) agacha colado nele; ADS monta direto |
| vault → slide (#47) | Agachar durante o vault | ao pousar do vault entra em slide com +0.8 m/s |
| montar arma (#50) | ADS perto de borda/parede | borda plana 0.08–0.62 m abaixo dos olhos à frente → olhos descem até ela + 0.16 m (`player.mounted='ledge'`); parede no ombro → `'wall'`. `player.mountRecoil` 0.5, `mountSway` 0.35. Andar > 0.6 m/s ou soltar ADS desmonta |
| lean (#51) | Q / E (segurar) | 0.36 m + 7.4° de roll; 3 raios na altura da cabeça com raio de cabeça 0.2 m limitam o offset (nunca atravessa parede) |
| pendurar / subir (#52) | Frente contra borda alta no ar (2.05–2.6 m acima dos pés) | pendura com os olhos 0.12 m abaixo da borda; A/D desliza na borda; Espaço ou segurar frente 0.25 s sobe (0.62 s); agachar/trás solta |
| pulo | Espaço | 5.35 m/s (≈0.73 m), coyote 0.11 s, buffer 0.14 s; de agachado/deitado levanta |
| mantle / vault | Espaço diante de borda (ou empurrando contra ela no ar) | borda até 2.05 m; obstáculo ≤ 1.2 m e fino (≤ 0.9 m) com chão do outro lado → vault mantendo o embalo |
| agachar / deitar | C/Ctrl (toque) / segurar C ou Z | alturas de cápsula e olhos por postura; levantar checa teto |

## Publicado

`ctx.player` (a arma/streaks leem com `?? 1` / `?.`):

| Campo | Valor |
|---|---|
| `sliding` | bool |
| `slideSpread` | multiplicador de dispersão (1 fora do slide) |
| `slideRecoil` | multiplicador de recuo (1 fora do slide) |
| `mounted` | `'ledge' \| 'wall' \| null` |
| `mountRecoil` / `mountSway` | multiplicadores (1 desmontado) |
| `tacSprint` | bool — sprint tático ativo (pose de arma erguida) |
| `hanging` / `diving` | bool |

`player.state`: `speed` (no slide ≤ 0.9 m/s — sem bob de corrida na arma),
`groundSpeed`, `sprinting`, `tactical`, `sliding`, `stance`, `lean`,
`mantling`, `vaulting`, `hanging`, `diving`, `mounted`, `cover`, `airborne`.

Serviço `movement`: `builtin=false`, `stance()`, getters `sprinting tactical
sliding mantling lean tacFuel stepPhase groundMaterial speedFx scripted
diving hanging mounted cover slideSpread slope`, `shake(0..1)`, `reset()`,
`touchHints` (ações sem botão no toque), `addLowGap([x,y,z], largura,
profundidade, vão, espessura)` (cria um vão baixo de teste: colisor + caixa),
`tuning`.

## Eventos

| Evento | Payload |
|---|---|
| `player:slide` | `{ phase:'start'\|'end', on, speed, material, reason?('cancel'\|'jump'\|'time'\|'impact'\|'air'\|'dive'), chain?, duration? }` |
| `player:slideKick` | `{ target, hit, damage?, killed?, point? }` (também emite `weapon:hit` com `weapon:'slideKick', melee, kick, knockdown, knockback`) |
| `player:dive` | `{ phase:'start'\|'land', speed, from?, material? }` |
| `player:tacSprint` | `{ phase:'start'\|'end', fuel(0..1) }` |
| `player:mount` | `{ on, kind:'ledge'\|'wall', height?, side? }` |
| `player:hang` | `{ phase:'start'\|'climb'\|'drop' }` |
| `player:cover` | `{ height }` |
| `player:vaultSlide` | `{ speed }` |
| `player:step` / `player:jump` / `player:land` / `player:mantle` / `player:stance` / `player:sprint` | como antes (`land` ganhou `dive`, `mantle` ganhou `climb`) |

## Retorno (feedback)

- **Câmera** (`camera.js`, escreve `viewOffset`, `viewKick`, FOV `move`):
  bob preso à fase de passo; slide com roll de ~7°, inclinação para dentro
  da curva, vibração do chão, FOV 1.13 → 1.17 com a velocidade e pulso de
  FOV na entrada; impacto do dive (mola forte + tremor); chute (tranco);
  batida em muro no slide; assentar ao montar; balanço pendurado.
- **Partículas**: `dust.js` (poeira por material: terra levanta muito,
  concreto/asfalto pouco) e `sparks.js` (faíscas aditivas em metal sempre;
  concreto/asfalto/tijolo só acima de 7 m/s), escaladas por
  `quality.particleBudget`.
- **Som** (`sfx.js`): loop de raspagem por superfície (ruído rosa filtrado,
  volume/brilho pela velocidade, "grão" aleatório; metal com rangido) no
  barramento `foley` do serviço `audio`, baque do chute/dive e clique de
  montar. A feature `audio` continua tocando o transiente `slide_<superfície>`
  no início.

## Toque

O toque (`src/features/touch`) já dá: slide (CROUCH em sprint),
slide-cancel (CROUCH de novo), slide-jump (JUMP), slide kick (MELEE no
slide), vault→slide, pendurar/subir (empurrar o joystick contra a borda +
JUMP) e sprint tático (soltar e empurrar o joystick até o fim de novo em
≤ 0.32 s = duplo toque). **Hook necessário**: botões para `prone` (DIVE) e
`leanLeft`/`leanRight` — descritos em `services.movement.touchHints`.

## Obstáculos baixos (#45)

Funciona contra QUALQUER colisor cujo fundo fique entre 1.0 m (cápsula do
slide) e 1.28 m (agachado) do chão. Os mapas atuais não têm vãos assim;
para testar/encenar use `services.movement.addLowGap([x, y, z], 2.4, 1.6, 1.12)`.

## Screenshots

`?shot=<preset>&mv=<roteiro>&sim=1.6` roda o controlador DE VERDADE com
entrada roteirizada a partir da pose do preset e congela no instante da
captura (`&mvpitch=`/`&mvyaw=` ajustam o olhar). Roteiros: `sprint tactical
slide crouch prone leanL leanR jump slidecancel slidejump dive kick
tacdouble`. O serviço expõe `scripted` para a arma poder honrar o sprint.

Corpo (`body.js`): pernas/botas com IK de 2 ossos; pose de slide com a
perna esquerda estendida (o "coice" do slide kick a levanta), pose
pendurada; tronco/cabeça só no mapa de sombra.
