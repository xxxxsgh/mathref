# Feature `weapon`

Viewmodel em primeira pessoa e lógica de tiro do IRONLINE. Tudo procedural.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: estado, tiro hitscan, recuo, poses (hip/ADS/corrida), trilhas de recarga/inspeção/saque, luzes da viewmodel, serviço |
| `rifle.js` | fuzil KR-9 (design original): receptores, guarda-mão M-LOK vazado, empunhadura vertical, trilhos, miras de ferro rebatidas, coronha, punho, freio de boca, lanterna, holográfica de capô curto (botões, tampa de bateria serrilhada, emissor), carregador curvo, peças móveis |
| `geo.js` | primitivas hard-surface (perfil lateral/seção extrudados com chanfro, caixas arredondadas) e `Kit` (funde por material, normais vincadas) |
| `materials.js` | PBR com detalhe injetado: triplanar, desgaste de quina por curvatura em tela, arranhões, sujeira, poeira, manchas de dedo (rugosidade), AA especular geométrico; tecido com trama e sheen. Anodizado preto quase neutro (dielétrico), cerakote grafite, luvas coyote |
| `textures.js` | geradores CPU: grime, cordura, camuflagem original, gravação a laser |
| `optic.js` | lente da holográfica: retículo no infinito (sem paralaxe), traço nítido com cobertura analítica, revestimento AR de filme fino (âmbar/verde) com Fresnel, manchas e poeira |
| `arms.js` | mãos enluvadas articuladas (15 falanges), poses de dedos (a da empunhadura vertical foi resolvida por otimização contra a geometria: sem interpenetração), mangas com dobras e punho franzido, relógio |
| `anim.js` | molas, easing, trilhas de keyframes |

## Controles

`Mouse0` atira (auto, 760 rpm), `Mouse2` mira, `R` recarrega (tática ou vazia com tapa no retém),
`I` inspeciona, `1` saca de novo. Vazio → recarga automática.

## Câmera

A câmera da viewmodel copia a rotação da câmera do mundo a cada frame, então o
sol (mesma direção/cor/intensidade do `world.sun`) e o IBL do céu ficam no
mesmo referencial do mundo. Sol ocluído por raycast (sombra de prédios) e teto
(interior) reduzem sol/ambiente da arma. Recuo de câmera vai no canal aditivo
`player.viewKick` sem apagar contribuições de outros donos.

## QA visual (parâmetros de URL só desta feature)

- `&wanim=reload:0.6` — congela uma ação (`reload`, `reloadEmpty`, `inspect`, `equip`) no instante t.
- `&wview=yaw,pitch,dist[,x,y,z]` — gira a arma diante da câmera focando o ponto (x,y,z) da arma.
- `&whand=yaw,pitch,pose` — só as mãos, numa pose de `POSES`.

No preset `combat` a arma dispara rajadas só visuais (sem dano).

Cápsulas: o serviço publica `ejectPort` + `brassByVfx: true` — a vfx faz a ejeção (latão com física);
sem a vfx a arma usa as próprias cápsulas.
