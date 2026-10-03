# Feature `weapon`

Viewmodel em primeira pessoa e lógica de tiro do IRONLINE. Tudo procedural.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: estado, tiro hitscan, recuo, poses (hip/ADS/corrida), trilhas de recarga/inspeção/saque, luzes da viewmodel, serviço |
| `rifle.js` | fuzil KR-9 (design original): receptores, guarda-mão M-LOK vazado, batente de mão angulado, trilhos, miras de ferro rebatidas, coronha, punho, freio de boca, lanterna, holográfica de capô curto (botões com ícones −/NV/+, tampa de bateria serrilhada com fenda, emissor), carregador curvo, peças móveis |
| `geo.js` | primitivas hard-surface (perfil lateral/seção extrudados com chanfro, caixas arredondadas) e `Kit` (funde por material, normais vincadas) |
| `materials.js` | PBR com detalhe injetado: triplanar, desgaste de quina por curvatura em tela, arranhões, sujeira, poeira, manchas de dedo (rugosidade), estrias de usinagem (brilho pseudo-anisotrópico ao longo do cano), AA especular geométrico; tecido com trama e sheen. **Oclusão de contato analítica** (cápsulas: palmas, guarda-mão, empunhaduras, ótica, carregador) e IBL dessaturado (a arma não fica azul com o céu). Paleta separada por valor/rugosidade: anodizado acetinado, trilho, cerakote tungstênio, polímero fosco, aço fosfatizado |
| `textures.js` | geradores CPU: grime, cordura, camuflagem original, gravação a laser |
| `optic.js` | lente da holográfica: retículo no infinito (sem paralaxe), traço nítido com cobertura analítica, revestimento AR de filme fino (âmbar/verde) com Fresnel, manchas e poeira |
| `arms.js` | mãos enluvadas: dedos e polegar numa **malha contínua com skinning** (16 ossos; vinco palmar e franzido dorsal nas juntas), protetor de nós moldado; poses de dedos (a da mão de apoio é resolvida em `grip.js`); mangas com **2 ossos** (punho segue a mão, antebraço segue o cotovelo — o pulso dobra liso) e manguito da luva com velcro no mesmo esqueleto; dobras, bainha, volume do antebraço, relógio |
| `grip.js` | resolvedor de pega: SDF do guarda-mão; apoia a palma tangente, flexiona cada falange até encostar e busca a pose do polegar (grade + descida de coordenadas). Duas pegas: hip (pega POR CIMA do guarda-mão: dorso e dedos visíveis da câmera, a mão lê como luva e não some atrás do punho da manga) e C-clamp baixo (ADS — nada entra na janela da ótica) |
| `anim.js` | molas, easing, trilhas de keyframes |

## Controles

`Mouse0` atira (auto, 760 rpm), `Mouse2` mira, `R` recarrega (tática ou vazia com tapa no retém),
`I` inspeciona, `1` saca de novo. Vazio → recarga automática.

## Câmera

Enquadramento de hip (`HIP` em `index.js`): arma a ~40 cm, quase centrada e
apontando para o centro da tela (ocupa ~1/4 do quadro, como nos FPS
modernos); o antebraço esquerdo entra em escorço pela borda de baixo.

A câmera da viewmodel copia a rotação da câmera do mundo a cada frame, então o
sol (mesma direção/cor/intensidade do `world.sun`) e o IBL do céu ficam no
mesmo referencial do mundo. Sol ocluído por raycast (sombra de prédios) e teto
(interior) reduzem sol/ambiente da arma. Recuo de câmera vai no canal aditivo
`player.viewKick` sem apagar contribuições de outros donos.

## QA visual (parâmetros de URL só desta feature)

- `&wanim=reload:0.6` — congela uma ação (`reload`, `reloadEmpty`, `inspect`, `equip`) no instante t.
- `&wview=yaw,pitch,dist[,x,y,z]` — gira a arma diante da câmera focando o ponto (x,y,z) da arma.
- `&whand=yaw,pitch,pose` — só as mãos, numa pose de `POSES`.
- `&wgrip=phi,fwd,thumbUp[,z,over,thumbX]` — testa outra pega da mão de apoio (ver `grip.js`).
- `&whip=x,y,z[,rx,ry,rz]` — testa outro enquadramento de hip (posição do pivô no espaço da câmera).
- `&warm=x,y,z[,follow,wrist]` — "ombro" esquerdo, quanto o antebraço segue o eixo da mão e quanto o punho dobra.

No preset `combat` a arma dispara rajadas só visuais (sem dano).

Cápsulas (ejeção a ~3–4 m/s, cruzam o quadro em ~0,4 s; ocultas no modo shot, onde um quadro parado as deixaria suspensas): a cápsula visível no quadro é da arma (latão 5,56 modelado — aro, canal de extração,
ombro, boca queimada — saindo paralela ao cano e girando). O serviço publica `ejectPort` +
`brassByVfx: false`, então a vfx só cria a "herdeira" no mundo (cai, quica e fica no chão).

Ajuste fino de luz (QA): `services.weapon.tune({ env, hemi, rim, bounce, sun })` multiplica as
luzes da viewmodel; `services.weapon.debugLight` → `{ sunVis, indoor }`; `services.weapon.materials`.
