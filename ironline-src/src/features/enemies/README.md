# Feature `enemies`

Soldados inimigos do IRONLINE: modelo procedural com equipamento tático,
material PBR próprio, animação procedural, ragdoll, IA de esquadrão com
cobertura. Tudo gerado em código — nenhum asset externo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: classe `Enemy` (colisor dinâmico, hitboxes por osso, dano, morte), população, cena do preset `combat`, serviço `enemies` |
| `soldier.js` | geometria do soldado (4 variantes de silhueta + o chefe juggernaut: capacete + NVG binocular rebatido rente à calota / capacete liso com óculos de proteção e mangas arregaçadas / boné + abafadores + lenço / chapéu de aba mole, chest rig leve) num único `SkinnedMesh`: corpo, rosto (balaclava + óculos fumê escuros — nada de lente espelhada que vira "máscara" clara), antebraço com relógio quando a manga está arregaçada, lanterna, strobe e elástico; plate carrier com MOLLE (no shader), porta-carregadores, dangler, granadas, fivelas, pontas de fita; rádio + antena de fita dobrada para trás (não espeta acima da cabeça), mochila com mangueira de hidratação; cinto, coldre, joelheiras/cotoveleiras; botas com sola em contorno de pegada, cadarço, ilhoses e cravos rasos; luvas com dedos fechados no fuzil; bandoleira |
| `geo.js` | `SkinBuilder`: primitivas/lofts/tubos com cor, classe de superfície e pesos por vértice; AO assada por voxels separada por grupo (núcleo, braços, arma, bandoleira) |
| `material.js` | `MeshStandardMaterial` estendido: camuflagem triplanar no espaço de repouso com granulado de impressão, ripstop, rugas, cordura com MOLLE costurada (bartacks), desgaste, sujeira de campo; contraluz do sol fraco e rebatimento do chão (sem "auto-iluminação") |
| `textures.js` | texturas procedurais 512² (camuflagem multi-terreno, detalhe de tecido) |
| `rig.js` | esqueleto (19 ossos + 5 da bandoleira), quadros/IK de 2 ossos, raio × cápsula |
| `anim.js` | animação procedural: marcha sem deslizar, corrida, ajoelhado de cobertura (agachamento total parado: joelho de trás no chão), base de tiro atlética (peso na perna de trás, pés girados com a "lâmina"), troca de peso parado, peito absorvendo o recuo, tronco projetado ao atirar por cima de cobertura, reação a impacto, recarga, agachar, inclinar |
| `sling.js` | bandoleira de 2 pontos: ossos livres esticados entre as argolas do fuzil e o corpo, com barriga proporcional à folga (funciona também no ragdoll) |
| `ragdoll.js` | ragdoll de Verlet (24 partículas): tronco firme, limites articulares cinemáticos (não injetam energia; flexão do quadril ≤ ~90° — o corpo não dobra como canivete; o joelho pode tombar para fora), tônus sorteado por corpo durante a queda (uma perna dobrada, braço recolhido ou aberto — cada corpo assenta diferente), amortecimento crescente para assentar (limites desligados depois de assentado — sem realimentar oscilação; o fuzil termina de tombar), semente de queda própria do soldado (determinística), tiro em cadáver só dá um tranco local, pré-relaxamento das restrições na morte (sem "pulo"), fuzil preso pela bandoleira |
| `contact.js` | sombras de contato no chão (pés, corpo, cadáver) num único `InstancedMesh` multiplicativo + poças de sangue sob os corpos (decalque multiplicativo com contorno de ruído, borda coagulada, crescimento lento) |
| `nav.js` | grade de navegação + mapa de coberturas baixas/altas (A*) |
| `staging.js` | encenação do preset `combat` em qualquer mapa: os papéis afinados na rua (quina, cobertura baixa, flanco, escondido, corpo) levados ao referencial da pose `combat` do mapa atual e assentados num lugar livre com a exposição que o papel pede; `world.shotPoses.combatScene` substitui |
| `brain.js` | IA: percepção (visão + audição), consciência, cobertura (escolhe a menor exposição que ainda enxerga por cima), espiada/inclinação, flanco, supressão, rajadas, recarga, avanço quando o jogador recarrega, busca, callouts |

## Mapas

Nada de coordenada de mapa no código: tudo vem de `services.world` —
`enemySpawns` (população inicial e reposição), `bounds` (região da grade de
navegação, recortada à área de ação: nascimentos do jogador e entradas
inimigas + 50 m; `world.navBounds` substitui), colisores (andabilidade e
coberturas, raycast de cima a 2,6 m — só o piso; passarelas/mezaninos são
rotas do jogador) e `shotPoses.combat` (encenação, `staging.js`). Funciona na
MERIDIAN STREET e na FOUNDRY 9 (`?map=factory`).

## Chefe — JUGGERNAUT (`spawn({ boss: true })`)

Quinta variante (fora do sorteio comum; geometria criada sob demanda —
`prepareBoss()` antecipa): traje blindado sobre o uniforme urbano — placas de
peito/costas sobrepostas com nervuras e faixa vermelha, gola alta, ombreiras
em 3 lâminas, braçadeiras, avental, coxas/canelas blindadas, capacete com
sobrecasco, **viseira inteiriça** e protetor de mandíbula; metralhadora leve
(caixa de munição, cano pesado com camisa perfurada, bipé, alça).

- Vida 1600; dano recebido × 0,55 tronco, × 0,45 braço, × 0,5 perna, × 1 cabeça
  (a viseira é o ponto fraco), explosão/faca × 0,7; quase não cambaleia nem
  se assusta (supressão × 0,15).
- Não procura cobertura: marcha a 1,7 m/s até ~11 m do jogador (ou para o
  objetivo, se não o vê) e despeja rajadas de 14–27 tiros a 720 rpm (o cone
  abre com a rajada); caixa de 100 e recarga de 4,6 s (a janela para avançar).
  9 de dano por tiro.
- Áudio: camada grave do tiro (`shot_enemy` a 0,72×) e passo pesado
  (`land_concrete` a 0,62×) pela API pública da feature audio;
  `enemy:fire`/`enemy:footstep` levam `heavy: true`.

## Objetivo (HARDPOINT)

`setObjective({ x, y, z, radius } | null)` / `objective`. Com objetivo, quem
é do grupo de assalto (`assault(e, { assaulter })` ou `e.brain.assault()`, que
também põe o soldado direto em combate) e quem não vê o jogador há > 2 s vai
para um ponto dentro da zona (A*), só aceita cobertura DENTRO dela e não sai
dela no strafe.

## Serviço `enemies`

`list`, `spawn(pose)`, `count()`, `kill(e, info)`, `clear()`, `nav`, `squad`,
`stats()`, `hitboxes`, `variants` (nº de variantes do sorteio comum),
`bossVariant`, `boss` (constantes do chefe), `bosses()`, `prepareBoss()`,
`setObjective(o)`, `objective`, `assault(e, opts)`.
`pose`: `{ position, yaw | faceYaw, variant, boss }`. Cada inimigo tem
`health`/`maxHealth` e `boss`.

Eventos: `enemy:fire { enemy, origin, dir }`, `enemy:damage`, `enemy:death`,
`enemy:callout { enemy, kind, text, position }`, `enemy:footstep`,
`enemy:reload`. Partes de acerto (`collider.part`): `head`, `neck`, `torso`,
`arm`, `leg`. `info.silent` em `damage` mata sem eventos (encenação de shot).

## Custos

1 draw call por soldado (+ sombra), 1 para todas as sombras de contato e 1 para todas as poças de sangue.
~45 mil triângulos por soldado; animação longe da câmera a cada 2 frames.
Geometria e AO são gerados uma vez por variante na inicialização.
