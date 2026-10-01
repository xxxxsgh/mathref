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

Eventos: `player:step` (pé, material, velocidade, postura), `player:jump`,
`player:land` (velocidade de impacto, altura, material), `player:slide`,
`player:mantle`, `player:stance`, `player:sprint`.

Câmera (`camera.js`) escreve por inteiro `viewOffset`, `viewKick` e o fator
de FOV `move`. O bob segue a fase de passo do controlador — a cabeça desce no
mesmo instante em que o som do passo toca.

Screenshots: `?shot=<preset>&mv=sprint|tactical|slide|crouch|prone|leanL|leanR`.
