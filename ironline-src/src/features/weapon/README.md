# Feature `weapon`

Viewmodel em primeira pessoa, loadout e lógica de combate do IRONLINE. Tudo procedural.

## Loadout

| Slot | Item | Destaques |
|---|---|---|
| 0 (primária) | fuzil **KR-9** (5,56) | automático 760 rpm, holográfica, carregador 30 |
| 1 (secundária) | pistola **P-11** (9 mm) | semiautomática, carregador 17, ferrolho que recua e trava aberto vazio, miras de 3 pontos |
| corpo a corpo | faca **TK-7** | golpe rápido (V) com investida até ~3,6 m no inimigo à frente, dano 150 |
| letal | granada de fragmentação **M-7** | segurar G cozinha (pino sai na subida), soltar arremessa; quica no mundo de colisão; explode em 3,5 s |
| tática | granada atordoante **S-2** | T; clarão + faíscas, sem dano; emite `weapon:flashbang` |

Troca de arma: `1`/`2`, roda do mouse (fora do ADS) ou `X` (ação `swap`, criada pela feature se o núcleo
não tiver uma ação de troca). A arma antiga desce (guarda), a nova sobe (saque); cada arma guarda o próprio
carregador. Recarga, faca e granada são exclusivas entre si (a faca/granada cancela uma recarga só antes do
encaixe do carregador).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: estado, máquina de ações, tiro hitscan (auto/semi), recuo, poses, troca de arma, faca, granadas, luzes da viewmodel, serviço |
| `loadout.js` | **lógica pura**: definições das armas/equipamento, munição por arma, máquina de troca (ready → holster → swap → draw), recarga, granadas |
| `grenade-sim.js` | **lógica pura**: física da granada (gravidade, arrasto, varredura contínua por raio, quique com restituição/atrito, rolamento, repouso), espoleta, dano de explosão, velocidade de arremesso |
| `weapon.test.mjs` | testes de `loadout.js` e `grenade-sim.js` (importados por `tools/unit.test.mjs`) |
| `guns.js` | monta cada arma na viewmodel: poses hip/ADS/corrida, pegas das mãos resolvidas contra o modelo, trilhas de recarga/inspeção/saque/guarda, cápsulas de oclusão |
| `rifle.js` | fuzil KR-9 (design original): receptores, guarda-mão M-LOK vazado, batente, trilhos, miras rebatidas, coronha, punho, freio de boca, lanterna, holográfica, carregador curvo, peças móveis |
| `pistol.js` | pistola P-11 (design original): ferrolho chanfrado de aço nitretado com serrilhas, janela de ejeção com capuz do cano, extrator, miras de 3 pontos (anel laranja), armação de polímero FDE com trilho, guarda-mato quadrado, punho com pontilhado/encaixe de dedo/rabo-de-castor, retém do ferrolho e do carregador, gatilho com segurança de lâmina, carregador de aço com base estendida, cápsula 9 mm |
| `equipment.js` | faca (lâmina clip-point com chanfro de afiação modelado e fio claro, cabo de borracha com encaixes, pomo com furo de fiel) e granadas (corpo ovoide pintado com faixa, espoleta, colher, pino e argola; atordoante perfurada) |
| `aux.js` | rig auxiliar: mão direita livre + manga que segura a faca/granada enquanto a arma desce; trilhas do golpe e do arremesso |
| `projectiles.js` | granadas no mundo: malha, passo físico contra `ctx.collision`, detonação (vfx), dano em área com linha de visão |
| `geo.js` | primitivas hard-surface e `Kit` (funde por material, normais vincadas) |
| `materials.js` | PBR com detalhe injetado (triplanar, desgaste de quina, arranhões, sujeira, digitais, estrias), oclusão de contato analítica, IBL dessaturado; luva com painéis por cor de vértice; materiais da pistola, faca e granadas |
| `textures.js` | geradores CPU: grime, cordura, camuflagem original, gravação a laser |
| `optic.js` | lente da holográfica (retículo no infinito, revestimento AR) |
| `arms.js` | **mãos anatômicas**: palma (loft de seções superelípticas com arco dorsal, cabeças dos metacarpos, tenar/hipotenar, cavidade palmar) + 4 dedos + polegar numa malha só com skinning de 14 ossos; proporções de mão masculina com luva justa (nós ≈ 8,3 cm, dedo médio ≈ 9,8 cm, ~2 mm entre dedos); borda da palma ponderada nas falanges (os nós arredondam ao fechar) e tenar seguindo o polegar; painéis da luva (dorso de tecido verde-oliva, palma/pontas de couro sintético, protetor de nós de TPU segmentado, almofadas nas falanges, costuras laterais em relevo, vincos nas juntas); mangas com 2 ossos e manguito com velcro; relógio |
| `grip.js` | resolvedor de pega: `solveClamp` (guarda-mão do fuzil) e `fitHand` genérico contra qualquer SDF (dedos flexionam falange a falange até encostar; polegar por busca em grade + descida de coordenadas, sem cruzar para o dorso; indicador busca a face do gatilho; ponto de passagem da junta do polegar). A mão de apoio na pistola abraça as cápsulas dos dedos REAIS da mão direita |
| `anim.js` | molas, easing, trilhas de keyframes |

## Controles

`Mouse0` atira, `Mouse2` mira, `R` recarrega (tática ou vazia), `I` inspeciona, `1`/`2`/roda/`X` troca,
`V` faca, `G` granada (segure para cozinhar), `T` atordoante. Vazio → recarga automática.

## Serviço `weapon`

Campos do contrato (sempre da arma ATIVA): `gun`, `muzzle`, `ammo`, `reserve`, `magSize`, `ads`,
`reloading`, `name`. Extras: `id`, `icon` (`'rifle' | 'pistol'`), `kind`, `auto`, `slot`, `switching`,
`current` (definição + munição), `weapons` (`[{ slot, id, name, icon, kind, ammo, reserve, magSize }]`),
`grenades`, `tacticals`, `equipment`, `cooking` (s), `liveGrenades`, `state`, `sprint`, `recoil`,
`fireRate`, `ejectPort`, `brassByVfx`; métodos `fire()`, `reload()`, `inspect()`, `equip(slot?)`,
`next(dir)`, `melee()`, `throwGrenade(kind)`, `refill()`, `setGrenades(n)`, `tune()`, `debugPose()`,
`debugView()`.

Eventos novos: `weapon:switch { slot, id, name, icon, kind, ammo, reserve, magSize, auto }` (no instante
da troca), `weapon:melee { lunge }`, `weapon:throw { kind, position, velocity, fuse }`,
`weapon:grenadeBounce`, `weapon:explode { kind, point, radius }`, `weapon:flashbang { point, radius }`.
`weapon:hit` também sai da faca (`weapon: 'knife', melee: true`) e da granada (`weapon: 'frag',
explosion: true`), sempre com `source: 'player'` e `ballistic: true` (a vfx não simula penetração).
`weapon:fire`/`weapon:reload` ganharam `id`.

## Câmera

Enquadramento de hip (`hip` de cada arma em `guns.js`): fuzil a ~40 cm, quase
centrado e apontando para o centro da tela (ocupa ~1/4 do quadro); a mão de
apoio pega o guarda-mão por cima, perto do receptor (dorso e nós para a câmera,
dedos abraçando o trilho, polegar no flanco), com o cotovelo baixo — a manga
não cobre a mão. Pistola à direita, girada para mostrar o flanco esquerdo e as
duas mãos (polegares para a frente).

A câmera da viewmodel copia a rotação da câmera do mundo a cada frame, então o
sol (mesma direção/cor/intensidade do `world.sun`) e o IBL do céu ficam no
mesmo referencial do mundo. Sol ocluído por raycast (sombra de prédios) e teto
(interior) reduzem sol/ambiente da arma. Recuo de câmera vai no canal aditivo
`player.viewKick` sem apagar contribuições de outros donos.

## QA visual (parâmetros de URL só desta feature)

- `&wgun=1` — começa com a pistola.
- `&wanim=reload:0.6` — congela uma ação (`reload`, `reloadEmpty`, `inspect`, `equip`, `holster`, `melee`, `nadeRaise`, `nadeThrow`, `flashRaise`, `flashThrow`) no instante t.
- `&wcrop=x,y,w` — amplia um recorte do enquadramento REAL (x, y, largura em fração da tela) — QA das mãos.
- `&wpr=dx,dy,dz,px,py,pz` / `&wpl=Fx,Fy,Fz,Dx,Dy,Dz,px,py,pz` — testa a pega direita/esquerda na pistola (dorso/dedos e ponto da palma).
- `&wview=yaw,pitch,dist[,x,y,z]` — gira a arma diante da câmera focando o ponto (x,y,z) da arma.
- `&whand=yaw,pitch,pose[,dist]` — só as mãos, numa pose de `POSES` (`guard`/`trigger` = pegas resolvidas da arma ativa).
- `&wgrip=phi,fwd,thumbUp[,z,over,thumbX]` — testa outra pega da mão de apoio (ver `grip.js`).
- `&whip=x,y,z[,rx,ry,rz]` — testa outro enquadramento de hip (posição do pivô no espaço da câmera).
- `&warm=x,y,z[,follow,wrist]` — "ombro" esquerdo, quanto o antebraço segue o eixo da mão e quanto o punho dobra.

No preset `combat` a arma dispara rajadas só visuais (sem dano).

Cápsulas (ejeção a ~3–4 m/s, cruzam o quadro em ~0,4 s; ocultas no modo shot, onde um quadro parado as deixaria suspensas): a cápsula visível no quadro é da arma (latão 5,56 modelado — aro, canal de extração,
ombro, boca queimada — saindo paralela ao cano e girando). O serviço publica `ejectPort` +
`brassByVfx: false`, então a vfx só cria a "herdeira" no mundo (cai, quica e fica no chão).

Ajuste fino de luz (QA): `services.weapon.tune({ env, hemi, rim, bounce, sun })` multiplica as
luzes da viewmodel; `services.weapon.debugLight` → `{ sunVis, indoor }`; `services.weapon.materials`.
