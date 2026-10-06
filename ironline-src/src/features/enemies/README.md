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
| `roles.js` | classes especiais (ARROMBADOR, ATIRADOR, ESCUDEIRO, SOCORRISTA): armas, mistura por onda e comportamentos + funções puras (`pickRole`, `frontal`, `rayObb`, `pickReviveTarget`, `lobVelocity`) |
| `rolegear.js` | equipamento de classe assado na malha (máscara de gás, placa extra, bandoleira de cartuchos, ghillie, viseira, ombreiras, braçadeiras/bolsa médica) e armas alternativas (escopeta de bomba, fuzil de ferrolho com luneta) |
| `gear.js` | objetos à parte: escudo balístico (textura com mossas/riscos/faixas), reflexo da luneta, laser, faca da execução, brilho da reanimação |
| `grenades.js` | granadas dos inimigos (arremesso em parábola, quiques, explosão pelo bus e dano pelo caminho normal) |
| `props.js` | barris explosivos e botijões de gás destrutíveis com reação em cadeia (`blastDamage`, `chainOrder` puras) |
| `execution.js` | execução (vítima + atacante) e marionetes do OPERADOR em 3ª pessoa (execução e killcam) |
| `knockdown.js` | derrubada do slide kick (`info.knockdown`/`knockback`): ragdoll vivo ~1,3 s e levantar (pose do chão misturada com a animada de joelhos → em pé) |
| `enemies.test.mjs` | testes da lógica pura (importados por `tools/unit.test.mjs`) |

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

## Classes especiais (roles.js) — fora do sorteio comum

Entram nas ondas a partir da **3ª** (`ROLE_MIX`: arrombador 16 %,
atirador 10 %, escudeiro 10 %, socorrista 12 %; no máximo 2 atiradores e 2
escudeiros vivos). `?roles=all|rusher|sniper|shield|medic` força (QA),
`spawn({ role })` também. Variantes geradas sob demanda e pré-aquecidas a
partir da onda 2 (uma a cada 0,8 s).

| Classe | Visual | Comportamento |
|---|---|---|
| `rusher` ARROMBADOR | urbano preto, máscara de gás com filtro, placa extra, bandoleira de cartuchos, escopeta de bomba | 130 de vida; sem cobertura: corre (5,1 m/s, A*) até ~4 m e dispara 8 bagos (7,5 cada, queda com a distância), strafe curto; 6 cartuchos |
| `sniper` ATIRADOR | boonie + ghillie, fuzil de ferrolho com luneta | 90 de vida; ajoelhado longe; recua se o jogador chega a < 20 m; LASER visível e REFLEXO da luneta (mais forte apontando para a câmera, cresce com a carga); carrega 1,6 s e dispara 55; ferrolho 1,4 s; muda de lugar após 3 tiros/supressão |
| `shield` ESCUDEIRO | viseira balística, ombreiras, escudo de aço | 120 de vida; avança de frente a 1,9 m/s, gira devagar (1,7 rad/s); escudo é volume de acerto próprio (parte `shield`: faísca de metal, sem dano; explosão de frente × 0,4); atira com uma mão; derruba o escudo ao morrer |
| `medic` SOCORRISTA | braçadeiras brancas com cruz verde, bolsa médica, injetor | luta como fuzileiro; corre até corpo de < 14 s a até 30 m, ajoelha 3,2 s (brilho verde) e REANIMA (volta de joelhos com 50 %); tiro > 20 interrompe; corpo reanimado no máximo 2 vezes |

## Reações (brain.js)

- **Supressão**: `p.duck` (encolhe, cabeça baixa) sob fogo; em campo aberto
  com supressão > 1 abaixa de vez e para o strafe.
- **Sobressalto** (`anim.nearMiss`): bala passando a < 1,1 m.
- **Granadas**: o soldado que perdeu o jogador de vista há 1,5–10 s, a
  7–26 m, arremessa uma granada (animação do braço, callout "Granada
  saindo!"; 1 por soldado/14 s, 1 por esquadrão/7 s). Granada do jogador
  caindo perto (previsão por `weapon:throw` + `weapon:grenadeBounce`):
  callout "Granada!" e fuga (`brain.evade`); se a feature weapon publicar
  `throwBack({ position, target, by })`, o mais próximo DEVOLVE a granada.
- **Callouts** novos: breach, sniper, shield, medic, reviving, revived, frag,
  incoming, uav, airstrike, turret, drone.
- **Decoys** (`services.streaks.decoys`): atiram na torreta/drone do
  jogador quando é o alvo visível mais perto.

## Props explosivos (props.js)

Barris (30 de vida: fura → chamas → explode em 1,2 s) e botijões (20: jato
de gás, gira, decola e explode) espalhados a cada partida perto das
entradas inimigas e das coberturas da grade, encostados em algo; barris em
grupos de 2–3. Colisor estático 'metal' com `data.damage` (tiro, granada,
morteiro, explosão vizinha → cadeia). Explosão: bus `explosion` + dano em
área com linha de visão, crédito de quem causou a primeira avaria
(`source:'player'`, `weapon:'barrel'`, `barrel:true`). Evento
`prop:explode { kind, position, source }`. Shot: `?props=1` põe alguns à
frente da pose.

## Execução e marionetes (execution.js)

`canExecute(e, pos)`: vivo, não chefe, sem enxergar o jogador (em combate:
perdeu-o há > 1,2 s), jogador atrás dele (cone de 110°) a < 1,9 m. Vítima:
cabeça puxada para trás (`p.headBack`), dois golpes (tranco + sangue),
joelhos cedem, morte com ragdoll para a frente (`enemy:death` com
`execution:true`). Atacante: operador com faca, mãos por alvo no espaço do
modelo (`anim.over`). Dano de terceiros ignorado durante a execução.

## Serviço `enemies` (acréscimos)

`roles`, `roleMix`, `setRoleForce(r)`, `roleVariant(id)`, `revive(e, by)`,
`exec`, `canExecute(e, pos)`, `executionTarget(pos)`, `createPuppet(opts)`,
`execute(e, puppet)`, `snapshot()`, `ghost.{ apply(map), end() }` (killcam:
poses gravadas só no render, restauradas no passo seguinte), `props`,
`grenades`. Inimigos ganham `role`, `revives`, `corpsePos()`, `revive()`.
Eventos novos: `enemy:revive { enemy, medic, phase }`, `enemy:shieldHit`,
`enemy:grenade { enemy, position, target, fuse }`, `enemy:grenadeLand`,
`prop:explode`. `enemy:fire` ganhou `gun` e `pellets`; `player.damage` do
inimigo leva `gun` (e `grenade: true` na granada).

## Derrubada (slide kick)

`damage()` com `info.knockdown` (o slide kick da feature movement manda
`knockdown: true` e `knockback` em m/s): se sobrevive, o soldado vira
ragdoll VIVO empurrado pelo chute (~1,3 s; colisor segue o corpo, dano
normal — morrer no chão continua no mesmo ragdoll), depois levanta em
0,9 s misturando a pose do chão com a animada (joelhos → em pé) e volta ao
combate. Escudeiro solta o escudo e o recupera. Chefe e quem está em
execução não caem. Evento `enemy:knockdown { enemy, phase: 'down'|'up' }`.

## Custo (PCs fracos e celular)

- **Carga**: `init` é assíncrono e cede frames (`ctx.bootProgress`) entre
  as variantes; só as variantes da população inicial são geradas na carga —
  as demais comuns em segundo plano (uma a cada 0,6 s de jogo), as das
  classes especiais uma onda antes de poderem entrar (só se a partida tiver
  essa onda) e o chefe/operador quando usados. Fora do desktop
  (`quality.tier !== 'desktop'`): texturas do soldado 256² (em vez de 512²)
  e AO assada em voxels de 2 cm.
- **IA fatiada**: no máximo 3 buscas A* por passo fixo para o esquadrão
  inteiro (`nav.findPath` devolve `undefined` sem orçamento; arrombador e
  escudeiro tentam de novo no passo seguinte), percepção a cada 0,12 s,
  decisões a cada 0,35–0,6 s, socorrista procura corpos a cada 0,6 s.
- **Animação com LOD**: a cada 2 frames além de 30 m, 3 além de 70 m e 4
  atrás da câmera (> 15 m); com mais de 8 soldados, a cada 2 além de 12 m.
- **Equipamento**: escudo é clone do mesmo modelo (geometrias/materiais
  compartilhados); laser faz raycast a cada 3 frames; escopeta desenha 2
  traçantes por disparo.
- **Props**: geometrias e materiais compartilhados, só o corpo projeta
  sombra (nenhum em q=low), 10 por partida no desktop, 7 em q=low, 5 em
  celular.

### LOD de malha

`geo.js` tem `withDetail(k, fn)`: com k < 1 os segmentos de cilindros,
lofts, tubos e elipsoides caem (k = 0,45) e as caixas pequenas perdem o
arredondamento. Soldado cheio ≈ 40,9 mil triângulos → LOD ≈ 10,9 mil.
- Aparelho fraco (`quality.tier !== 'desktop'` ou `quality.level === 'low'`):
  todos os soldados (inclusive o herói do menu) usam o LOD e a população de
  fundo do menu não nasce (só o herói): menu de ~245 mil → ~10 mil triângulos.
- Desktop: o LOD de cada variante é gerado em segundo plano e a malha troca
  de geometria além de ~25 m (histerese 22/26 m).
