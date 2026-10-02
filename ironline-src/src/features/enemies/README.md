# Feature `enemies`

Soldados inimigos do IRONLINE: modelo procedural com equipamento tático,
material PBR próprio, animação procedural, ragdoll, IA de esquadrão com
cobertura. Tudo gerado em código — nenhum asset externo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: classe `Enemy` (colisor dinâmico, hitboxes por osso, dano, morte), população, cena do preset `combat`, serviço `enemies` |
| `soldier.js` | geometria do soldado (3 variantes) num único `SkinnedMesh`: corpo, rosto (balaclava + óculos espelhados/fumê, lenço no pescoço), capacete com NVG rebatido, lanterna, strobe e elástico; plate carrier com MOLLE (no shader), porta-carregadores, dangler, granadas, fivelas, pontas de fita; rádio + antena, mochila com mangueira de hidratação; cinto, coldre, joelheiras/cotoveleiras; botas com cadarço, ilhoses e cravos; luvas com dedos fechados no fuzil; bandoleira |
| `geo.js` | `SkinBuilder`: primitivas/lofts/tubos com cor, classe de superfície e pesos por vértice; AO assada por voxels separada por grupo (núcleo, braços, arma, bandoleira) |
| `material.js` | `MeshStandardMaterial` estendido: camuflagem triplanar no espaço de repouso com granulado de impressão, ripstop, rugas, cordura com MOLLE costurada (bartacks), desgaste, sujeira de campo; contraluz do sol fraco e rebatimento do chão (sem "auto-iluminação") |
| `textures.js` | texturas procedurais 512² (camuflagem multi-terreno, detalhe de tecido) |
| `rig.js` | esqueleto (19 ossos + 5 da bandoleira), quadros/IK de 2 ossos, raio × cápsula |
| `anim.js` | animação procedural: marcha sem deslizar, corrida, base de tiro atlética (peso na perna de trás, pés girados com a "lâmina"), troca de peso parado, peito absorvendo o recuo, tronco projetado ao atirar por cima de cobertura, reação a impacto, recarga, agachar, inclinar |
| `sling.js` | bandoleira de 2 pontos: ossos livres esticados entre as argolas do fuzil e o corpo, com barriga proporcional à folga (funciona também no ragdoll) |
| `ragdoll.js` | ragdoll de Verlet (24 partículas): tronco firme, limites articulares cinemáticos (não injetam energia), pré-relaxamento das restrições na morte (sem "pulo"), fuzil preso pela bandoleira |
| `contact.js` | sombras de contato no chão (pés, corpo, cadáver) num único `InstancedMesh` multiplicativo |
| `nav.js` | grade de navegação + mapa de coberturas baixas/altas (A*) |
| `brain.js` | IA: percepção (visão + audição), consciência, cobertura (escolhe a menor exposição que ainda enxerga por cima), espiada/inclinação, flanco, supressão, rajadas, recarga, avanço quando o jogador recarrega, busca, callouts |

## Serviço `enemies`

`list`, `spawn(pose)`, `count()`, `kill(e, info)`, `clear()`, `nav`, `squad`,
`stats()`, `hitboxes`. `pose`: `{ position, yaw | faceYaw, variant }`.

Eventos: `enemy:fire { enemy, origin, dir }`, `enemy:damage`, `enemy:death`,
`enemy:callout { enemy, kind, text, position }`, `enemy:footstep`,
`enemy:reload`. Partes de acerto (`collider.part`): `head`, `neck`, `torso`,
`arm`, `leg`. `info.silent` em `damage` mata sem eventos (encenação de shot).

## Custos

1 draw call por soldado (+ sombra) e 1 para todas as sombras de contato.
~45 mil triângulos por soldado; animação longe da câmera a cada 2 frames.
Geometria e AO são gerados uma vez por variante na inicialização.
