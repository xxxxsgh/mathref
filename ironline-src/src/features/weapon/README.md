# Feature `weapon`

Viewmodel em primeira pessoa, loadout e lógica de combate do IRONLINE. Tudo procedural.

## Loadout

Primária e secundária são escolhidas entre as 7 armas (`setPrimary`/`setSecondary`; padrão KR-9 + P-11).

| Arma | Tipo | Destaques |
|---|---|---|
| fuzil **KR-9** (5,56) | rifle | automático 760 rpm, holográfica, carregador 30 |
| pistola **P-11** (9 mm) | pistol | semiautomática, carregador 17, ferrolho que recua e trava aberto vazio, miras de 3 pontos |
| submetralhadora **MX-9** (9 mm) | smg | 940 rpm, alcance curto (queda 10→26 m até 55 %), carregador reto 32, manejo lateral, coronha de hastes, reflexa compacta |
| escopeta **BR-12** (cal. 12) | shotgun | bomba: 9 chumbos em padrão fixo (centro + 2 anéis) + desvio, dano somado por alvo, queda 6→24 m; bomba depois de cada tiro (mão de apoio vai junto, cápsula sai no recuo); recarga cartucho a cartucho (atirar interrompe), porta-cartuchos lateral |
| precisão **LR-50** (.338) | sniper | ferrolho (mão larga o punho e cicla depois de cada tiro), luneta 8x com imagem ampliada real + retículo em mils, balanço + segurar a respiração (Shift), brilho da objetiva, carregador 5 |
| metralhadora **HM-60** (7,62) | lmg | caixa de 100 com fita visível (os cartuchos do arco somem no fim), tampa articulada, recarga longa, ADS lento (0,44 s), bipé rebatido |
| designado **SR-7** (7,62) | dmr | semiautomático, luneta 4x (chevron com marcas de queda), carregador 20 |
| corpo a corpo | faca **TK-7** (padrão) + karambit, balisong, tanto, baioneta, kukri, cutelo | golpe rápido (V) com investida até ~3,6 m no inimigo à frente, dano 150; tecla `3` = faca NA MÃO (gatilho golpeia, alterna 2 golpes do modelo, `I` inspeciona por modelo) |
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
| `materials.js` | (luva com `panels`: tecido com trama em relevo × couro sintético liso de grão fino, pesponto em relevo nas costuras; os varyings `vWObj`/`vWObjN` e o gancho `#include <map_fragment>` são API — o sistema de camuflagem do HUD injeta neles via `weapon.materials`) PBR com detalhe injetado (triplanar, desgaste de quina, arranhões, sujeira, digitais, estrias), oclusão de contato analítica, IBL dessaturado; luva com painéis por cor de vértice; materiais da pistola, faca e granadas |
| `textures.js` | geradores CPU: grime, cordura, camuflagem original, gravação a laser |
| `optic.js` | lente da holográfica (retículo no infinito, revestimento AR) |
| `arms.js` | **mãos anatômicas** (dedos afinam da base à ponta ~30%, seção elíptica, cintura nas falanges e côndilos nas juntas, nó dorsal com rugas de tecido franzido, vinco palmar fundo, polpas, ponta com dorso achatado e polpa cheia; polegar com falange distal larga/achatada; borda radial da palma acompanha o metacarpo do polegar como membrana; atributo `glove` = [couro, costura] por vértice): palma (loft de seções superelípticas com arco dorsal, cabeças dos metacarpos, tenar/hipotenar, cavidade palmar) + 4 dedos + polegar numa malha só com skinning de 14 ossos; proporções de mão masculina com luva justa (nós ≈ 8,3 cm, dedo médio ≈ 9,8 cm, ~2 mm entre dedos); borda da palma ponderada nas falanges (os nós arredondam ao fechar) e tenar seguindo o polegar; painéis da luva (dorso de tecido verde-oliva, palma/pontas de couro sintético, protetor de nós de TPU segmentado, almofadas nas falanges, costuras laterais em relevo, vincos nas juntas); mangas com 2 ossos e manguito com velcro; relógio |
| `grip.js` | resolvedor de pega: `solveClamp` (guarda-mão do fuzil) e `fitHand` genérico contra qualquer SDF (dedos flexionam até encostar e depois redistribuem a flexão — a proximal pode "flutuar" para a média/distal abraçarem o perfil, PIP ≥ ~0,7·MCP, nada de dedo deitado reto; polegar por busca em grade + descida de coordenadas a partir dos 6 melhores candidatos, sem cruzar para o dorso, com teto opcional `ceilY`; indicador busca a face do gatilho; ponto de passagem da junta do polegar). A mão de apoio na pistola abraça as cápsulas dos dedos REAIS da mão direita + o guarda-mato |
| `anim.js` | molas, easing, trilhas de keyframes |
| `parts.js` | peças compartilhadas das armas novas: punho no gabarito do KR-9, guarda-mato, gatilho, trilhos, dispositivos de boca, luneta (`buildScope`), reflexa, ótica 3x, supressor, empunhadura vertical, laser |
| `rig.js` | montagem genérica das armas longas (pega direita no gabarito, pega esquerda contra a SDF do guarda-mão de cada arma, `scaleAction`, `inspectTrack`, `equipFor`) |
| `smg.js` / `shotgun.js` / `sniper.js` / `lmg.js` / `dmr.js` | MX-9, BR-12, LR-50, HM-60, SR-7: modelo + montagem + trilhas próprias (bomba e recarga cartucho a cartucho; ciclo do ferrolho com a mão; tampa/caixa/fita) |
| `knives.js` | 7 facas (loft de lâmina ao longo de linha de centro curva com chanfro de afiação e sulco, cabos), pega por modelo (martelo/reversa), golpes por estilo (corte, gancho, estocada, golpe de cima), inspeções por modelo, `makeKnifeRig` (faca na mão) |
| `scope.js` | luneta de imagem-em-imagem: `ScopeView` (render target com FOV estreito, só no ADS), lente com retículo angular (2º plano focal), pupila de saída, `makeGlint` |
| `patterns.js` | **lógica pura**: 12 padrões de skin tileáveis gerados na CPU (bytes determinísticos por seed), `skinParams`, `wearProfile` |
| `skin.js` | materiais pintáveis por arma/faca (`gunMaterials`) e `applySkin` (padrão triplanar/degradê, seed, desgaste, acabamento) |
| `cosmetics.js` | contador de abates (7 segmentos laranja), adesivos (decalques projetados), chaveiro com física |
| `cosmetic-logic.js` | **lógica pura**: `formatKills`, `KillCounters`, `CharmSim` (corrente Verlet) |
| `ballistics.js` | **lógica pura**: `pelletPattern`, `scopeSway`, `BreathHold`, `falloff` |
| `attachments.js` | acessórios (supressor, empunhadura, laser, ótica 3x): montagem, modificadores e feixe/ponto do laser |
| `preview.js` | `buildPreview(item)` — modelo isolado com skin/adesivos/chaveiro/contador (materiais próprios, sem oclusão da viewmodel) |

## Controles

`Mouse0` atira, `Mouse2` mira, `R` recarrega (tática ou vazia), `I` inspeciona, `1`/`2`/roda/`X` troca,
`3` faca na mão, `V` faca (golpe rápido), `G` granada (segure para cozinhar), `T` atordoante, `Shift` mirando
com luneta/ótica ampliada = segurar a respiração (~4,5 s; depois cansa e o balanço dobra por ~2,6 s).
Vazio → recarga automática.

## Serviço `weapon`

Campos do contrato (sempre da arma ATIVA): `gun`, `muzzle`, `ammo`, `reserve`, `magSize`, `ads`,
`reloading`, `name`. Extras: `id`, `icon` (`'rifle' | 'pistol'`), `kind`, `auto`, `slot`, `switching`,
`current` (definição + munição), `weapons` (`[{ slot, id, name, icon, kind, ammo, reserve, magSize }]`),
`grenades`, `tacticals`, `equipment`, `cooking` (s), `liveGrenades`, `state`, `sprint`, `recoil`,
`fireRate`, `ejectPort`, `brassByVfx`; métodos `fire()`, `reload()`, `inspect()`, `equip(slot?)`,
`next(dir)`, `melee()`, `throwGrenade(kind)`, `refill()`, `setGrenades(n)`, `setTacticals(n)` (0 trava a
atordoante — usado pela progressão do HUD), `tune()`, `debugPose()`,
`debugView()`.

### API v3 (inventário, cosméticos, acessórios)

- `weapons` — as 7 armas na ordem fixa (KR-9, P-11, MX-9, BR-12, LR-50, HM-60, SR-7):
  `{ slot, id, name, icon, kind, slotName, equipped ('primary'|'secondary'|null), ammo, reserve, magSize, auto,
  caliber, rpm, damage, pellets, range, mobility, control, scope, attachments }`.
- `loadoutIds` → `[primária, secundária]`; `setPrimary(id)` / `setSecondary(id)` (se a arma já está no outro slot,
  os slots trocam; a arma na mão troca na hora com saque; munição de quem sai fica guardada).
- `knives` → `[{ id, name, style, aliases }]`; `knife`, `knifeOut`; `setKnife(id)` aceita o id ou um alias
  (`garra`→karambit, `borboleta`→balisong, `baioneta`→bayonet, `cacadora`→tanto, `cutelo`→cleaver).
- `patterns` — `['solid','camo','digital','tiger','fade','damascus','marble','hex','carbon','ember','oxide','splatter']`.
- `setSkin(armaOuFacaId, skin|null)` — skin = `{ id, name, pattern, palette:[hex…], wear:0..1, seed:int,
  finish:{ metalness, roughness }, rarity }`. Pinta os materiais pintáveis da arma (receptor, telhas, trilhos,
  polímero, armação/ferrolho; lâmina e cabos de alumínio/G10/micarta na faca). O desgaste tira tinta das
  quinas (metal vivo), depois em manchas e arranhões; peças de mão gastam mais (zona). `ember` brilha
  (emissivo). Com skin no KR-9 a camuflagem de progressão do HUD (camo.js) fica desligada; sem skin ela volta
  (fallback). `getSkin(id)`.
- `setCharm(id, { id, shape, color }|null)` — formas: skull, die, star, heart, bullet, tag, orb, diamond, ring,
  cube, paw, grenade.
- `setStickers(id, [{ id, glyph, color }])` (até 4; decalques projetados no receptor/telhas).
- `setKillCounter(id, n|null)` — visor laranja de 6 dígitos (receptor; cabo nas facas); soma 1 a cada `weapon:kill`
  daquela arma/faca. `killCount(id)`.
- `attachments` → `{ [id]: { muzzle, grip, laser, optic } }`; `attachmentOptions` (o que cada arma aceita);
  `setAttachments(id, { muzzle:'none'|'suppressor', grip:'none'|'foregrip', laser:'none'|'laser', optic:'default'|'3x' })`
  (aceita parcial e `true/false`). Supressor: clarão pequeno (`weapon:fire.suppressed` — a vfx já honra), som
  `shot_supp`, recuo −8 %; empunhadura: recuo vertical −18 %; laser: dispersão sem mirar −25 %, feixe + ponto no
  mundo; 3x: ótica com imagem ampliada no lugar da mira padrão.
- `buildPreview({ type:'weapon'|'knife'|'charm', baseId, skin?, charm?, stickers?, counter? })` → `Promise<Object3D>`
  centralizado, escala real, `userData.size/length` (aceita também os kinds: rifle, smg, shotgun…).
- `inspect()` vale para armas e para a faca na mão (por modelo: balisong abre/fecha, karambit gira na argola, tanto
  é jogada e pega, cutelo gira no eixo, kukri é sopesada, as outras viram o pulso).
- Luneta: `zoom`, `holdingBreath`, `breath` (fôlego 0..1), `scopeGlint` (1 mirando com luneta ≥ 4x — para a IA),
  `dofScale` (sugestão para a rendering: 0,12 com luneta), `suppressed`.
- Ganchos da movement lidos com `?? 1`: `player.slideSpread` (dispersão), `slideRecoil`/`mountRecoil` (recuo),
  `mountSway` (balanço/inércia), `tacSprint` (arma erguida), `hanging` (arma baixa, sem tiro/ADS). O `melee`
  consumido pela movement (slide kick) não saca a faca.

Eventos v3: `weapon:kill { weaponId, enemy, headshot, melee }` (abate do jogador; faca → id do modelo),
`weapon:breath { phase:'hold'|'release'|'gasp', stamina }`, `weapon:foley { name, id }` (sempre que a animação
tem som: mag_out/mag_in/bolt_release, pump_back/pump_fwd, shell_in, bolt_up/back/fwd/down, cover_open/close,
belt, knife_flip, knife_catch), `weapon:fire` ganhou `kind`, `suppressed`, `pellets`; `weapon:melee` ganhou `knife`.

Eventos novos: `weapon:switch { slot, id, name, icon, kind, ammo, reserve, magSize, auto }` (no instante
da troca), `weapon:melee { lunge }`, `weapon:throw { kind, position, velocity, fuse }`,
`weapon:grenadeBounce`, `weapon:explode { kind, point, radius }`, `weapon:flashbang { point, radius }`.
`weapon:hit` também sai da faca (`weapon: 'knife', melee: true`) e da granada (`weapon: 'frag',
explosion: true`), sempre com `source: 'player'` e `ballistic: true` (a vfx não simula penetração).
`weapon:fire`/`weapon:reload` ganharam `id`.

## Câmera

Enquadramento de hip (`hip` de cada arma em `guns.js`): fuzil a ~40 cm, com o
guarda-mão girado ~11° para a esquerda (a mão de apoio é vista de lado, não
"de punho"); a mão de apoio pega o guarda-mão por cima, perto do receptor
(dorso e nós para a câmera, dedos quase perpendiculares ao cano abraçando o
trilho, polegar descendo pelo flanco esquerdo e apontando para a frente), com
o cotovelo baixo — a manga não cobre a mão. Pistola baixa à direita, bem de
flanco (yaw 0,6): os dois polegares deitam no flanco esquerdo da armação,
ABAIXO do ferrolho (teto `ceilY` no resolvedor), apontando para o alvo; o
indicador esquerdo passa por baixo do guarda-mato (que entra no SDF da mão de
apoio); o antebraço esquerdo sai para a esquerda e o punho dobra (wrist 0,8)
para o dorso da mão aparecer em vez do manguito.

A câmera da viewmodel copia a rotação da câmera do mundo a cada frame, então o
sol (mesma direção/cor/intensidade do `world.sun`) e o IBL do céu ficam no
mesmo referencial do mundo. Sol ocluído por raycast (sombra de prédios) e teto
(interior) reduzem sol/ambiente da arma. Recuo de câmera vai no canal aditivo
`player.viewKick` sem apagar contribuições de outros donos.

## QA visual (parâmetros de URL só desta feature)

- `&wgun=1` — começa com a pistola.
- `&wweap=<id>` — põe a arma na primária e começa com ela; `&wgun=2` começa com a faca na mão; `&wknife=<id|alias>`.
- `&wskin=padrão,seed,desgaste,#c1,#c2,#c3[,metal,rugosidade]` (+ `&wskinid=a+b`), `&watt=suppressor,foregrip,laser,3x`,
  `&wcharm=forma,#cor`, `&wstick=glifo:#cor,…`, `&wkills=N`, `&wbreath=1` (segura a respiração no preset `ads`).
- `&wlineup=guns|knives|<id>` (+ `&wlview=yaw,pitch,dist`, `&wlskin=1`) — vitrine de prévias diante da câmera, sem mãos.
- `&wanim=reload:0.6` — congela uma ação (`reload`, `reloadEmpty`, `inspect`, `equip`, `holster`, `melee`, `nadeRaise`, `nadeThrow`, `flashRaise`, `flashThrow`) no instante t.
- `&wcrop=x,y,w` — amplia um recorte do enquadramento REAL (x, y, largura em fração da tela) — QA das mãos.
- `&wpr=dx,dy,dz,px,py,pz` / `&wpl=Fx,Fy,Fz,Dx,Dy,Dz,px,py,pz` — testa a pega direita/esquerda na pistola (dorso/dedos e ponto da palma).
- `&wprt=tx,ty,tz,mx,my,mz,teto` / `&wplt=tx,ty,tz,teto` — alvos do polegar direito (ponta, junta MCP, teto Y) / esquerdo na pistola.
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
