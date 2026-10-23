# PIXEL FUTEBOL

Futebol 3D com visual de transmissão de TV dos anos 90 em pixels. Um arquivo só:
[`futebol/index.html`](../futebol/index.html).

## Fases

| Fase | Conteúdo | Estado |
|---|---|---|
| 1 | Render pixel + campo + bola com física + 1 jogador controlável | ✅ |
| 2 | 5x5 com passe, chute, goleiro e IA básica; gols e placar | — |
| 3 | 11x11, formações, IA tática, regras completas | — |
| 4 | Estádio, torcida, clima, outline/dithering refinados, animações | — |
| 5 | Câmeras, replays, áudio, narração | — |
| 6 | Modos, editor, saves, PWA, otimização mobile | — |

## Decisões técnicas

- **Pipeline pixel:** cena → render target baixo (~216 linhas; 180/216/288 por
  qualidade) com textura de profundidade → passe de pós na mesma resolução
  (contorno por profundidade de 1 px, dithering Bayer 4x4, quantização para
  paleta de 32 cores) → canvas nessa resolução, ampliado pelo CSS por **fator
  inteiro** com `image-rendering: pixelated`. O pós nunca roda na resolução
  nativa da tela (2732 px no iPad).
- **Voxel animado, não billboard 8 direções:** procedural, funciona em qualquer
  câmera/replay, recebe o contorno do shader e anima girando membros.
- **Física própria a 120 Hz** (timestep fixo + interpolação): gravidade, arrasto
  quadrático, Magnus `a = S(ω×v)`, quique com atrito, rolagem, traves e
  travessão cilíndricos, rede sólida por fora e amortecida por dentro, gol só
  com a bola inteira além da linha.
- **Escala visual ≠ física:** bola com raio visual 0,26 m (físico 0,11 m) e
  jogador 12% maior, para ler a 216 px.
- Gramado sem iluminação (`MeshBasicMaterial`) para as linhas chegarem brancas
  à paleta; é a única textura grande (8 px/m, com mipmap contra cintilação).

## Riscos

- Draw calls: ~14 meshes por jogador; 22 jogadores pedem merge/instancing (Fase 3).
- Custo do laço de 32 cores no pós em GPUs fracas (mitigado pela resolução baixa).
- iOS: sem fullscreen real fora de PWA; Gamepad API varia por navegador.
- Three.js e fonte vêm de CDN até o service worker da Fase 6.

## Controles (Fase 1)

Teclado: WASD/setas, Shift arrancar, J/Z passe, K/X/Espaço chute, L/C
lançamento (segure para carregar). Logo após o chute, o direcional dá efeito:
lado = curva, frente = bola cai, trás = bola sobe. Gamepad: A passe, B chute,
X lançamento, RT arrancar. Toque: joystick à esquerda, 4 botões à direita.
Atalhos: P paleta, O contorno, Q qualidade, Esc pausa.
