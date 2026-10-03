# movement

Locomoção em primeira pessoa (passo fixo) + movimento de câmera (por frame).

| Ação | Tecla | Comportamento |
|---|---|---|
| andar | WASD | 4.5 m/s; aceleração com curva (forte longe do alvo, encosta suave), ré 0.82×, lateral 0.92×, mirando 0.6× |
| sprint | Shift (toque ou segurar) | 6.7 m/s com rampa; cancela ao atirar/mirar/parar/bater em parede |
| sprint tático | Shift de novo durante o sprint | 8.3 m/s, 3.6 s de "combustível", recarrega após 2.4 s |
| slide | Agachar em sprint | +1.35 m/s, atrito baixo nos primeiros 0.32 s e alto depois; pulo = slide-cancel |
| agachar / deitar | C/Ctrl (toque) / segurar C ou Z | alturas de cápsula e olhos por postura; levantar checa teto |
| dive | Z em sprint | salto baixo para frente → deitado |
| pulo | Espaço | 5.35 m/s (≈0.73 m), coyote 0.11 s, buffer 0.14 s; de agachado/deitado levanta |
| mantle / vault | Espaço diante de borda (ou empurrando contra ela no ar) | borda até 2.05 m; obstáculo ≤1.2 m e fino (≤0.9 m) com chão do outro lado → vault mantendo o embalo |
| lean | Q / E | 0.36 m + 7.4° de roll, limitado por paredes ao lado da cabeça |

`player.state`: `speed` (no slide fica ≤ 0.9 m/s — sem passada, sem bob de
corrida na arma), `groundSpeed` (velocidade física), `sprinting`, `tactical`,
`sliding`, `stance`, `lean`, `mantling`, `airborne`.

Eventos: `player:step` (pé, material, velocidade, postura), `player:jump`,
`player:land` (velocidade de impacto, altura, material), `player:slide`,
`player:mantle`, `player:stance`, `player:sprint`.

Câmera (`camera.js`) escreve por inteiro `viewOffset`, `viewKick` e o fator
de FOV `move`. O bob segue a fase de passo do controlador — a cabeça desce no
mesmo instante em que o som do passo toca.

Corpo (`body.js`): quadril, pernas (calça camuflada com dobras, joelheira,
bolso cargo) e botas na cena do mundo, com IK de 2 ossos. Marcha presa à
fase de passo; pose de slide com a perna esquerda estendida à frente (é o
que aparece no quadro); tronco/cabeça/braços/arma existem só no mapa de
sombra (o jogador projeta a silhueta inteira). `dust.js`: poeira do slide,
da aterrissagem e do sprint em terra (1 InstancedMesh, luz do mundo).
`speedfx.js`: borrão + vinheta de borda em sprint tático/slide/dive.

Screenshots: `?shot=<preset>&mv=sprint|tactical|slide|crouch|prone|leanL|leanR|jump&sim=1.6`
roda o controlador DE VERDADE com entrada roteirizada a partir da pose do
preset e congela no instante da captura (`&mvpitch=`/`&mvyaw=` ajustam o
olhar). O serviço expõe `scripted` para a arma poder honrar o sprint.
