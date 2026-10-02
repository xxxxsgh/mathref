# Feature `vfx` — efeitos de combate e balística

Tudo procedural (shaders e geometria gerados no código). Nenhum asset baixado.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: pools, eventos do bus, serviço `vfx`, luzes de clarão, tremor de câmera, balística |
| `atlas.js` | atlas gerados NA GPU uma vez: partículas (poeira/fumaça com normais, couve-flor de explosão em domínio deformado, clarão frontal de lóbulos irregulares, cone quente do gás, pétalas, faísca, anel, lasca) e marcas de tiro PBR (albedo + normal) por material; textura de detalhe tileável (CPU) para erosão/bolsões de calor e textura dos detritos |
| `particles.js` | partículas instanciadas com trajetória analítica no vertex shader (1 draw call por cena); turbulência; luz do sol/céu com espalhamento frontal e auto-sombra (Beer); luzes pontuais da vfx (clarões/fogo) acendem a fumaça; fogo de corpo negro com bolsões animados; erosão por ruído ("flipbook" procedural); suaves por profundidade e por plano |
| `decals.js` | marcas de tiro/sangue/queimado (InstancedMesh `MeshStandardMaterial`, ring buffer) |
| `surface.js` | índice de triângulos das malhas estáticas → a marca assenta na fachada VISÍVEL (o colisor AABB pode estar a centímetros dela) |
| `depth.js` | pré-passe de profundidade em ½ resolução (só enquanto há partículas suaves vivas) → partículas "soft" de verdade contra fachadas, barreiras e chão |
| `rigid.js` | cápsulas e detritos com física simples (gravidade, quique, atrito, deitar) |
| `effects.js` | receitas: impactos por material, sangue, clarão 1ª/3ª pessoa, traçantes, cápsulas, explosões |

## Custo

- Pré-passe de profundidade: 1 passe extra só de profundidade (½ res, opacos) apenas enquanto há poeira/fumaça viva; desligado em `q=low`.
- Partículas: 1 draw call no mundo + 1 na viewmodel; a CPU só escreve o
  estado inicial (faixa suja do ring buffer sobe com `addUpdateRange`).
- Marcas: 1 draw call; cápsulas: 1; detritos: 1. Pool fixo de 3 `PointLight`
  no mundo e 1 na viewmodel (criadas no init — nunca recompila shaders).
- Por impacto: ~2 raios na colisão (sol/céu) + 1 consulta curta no índice de
  superfícies (dezenas de triângulos). Índice: ~80 ms uma vez, no `ready`.
- `quality.particleBudget` escala quantidades e capacidade.

## Eventos ouvidos

| Evento | Efeito |
|---|---|
| `weapon:fire` | clarão compacto e variável tiro a tiro na viewmodel (cone quente + lóbulos irregulares + 2–4 pétalas do quebra-chamas), luz na arma (queda linear: acende antebraço e luva também) e no mundo, fiapos ralos de fumaça, cápsula, traçante a cada 3 tiros, fiapos do cano quente após rajadas |
| `weapon:hit` | impacto pelo material do colisor; sem `ballistic: true`, faz penetração **visual** (furo de saída + impacto atrás) em materiais finos |
| `enemy:fire` | clarão de 3ª pessoa + luz + traçante + impacto onde o tiro bate |
| `explosion` / `grenade:explode` | `{ point|position, radius?, normal? }` → explosão completa |

Emite `vfx:explosion` `{ point, radius, intensity }` (áudio/HUD podem reagir).

## Serviço `ctx.services.vfx`

| Campo | Uso |
|---|---|
| `impact(point, normal, material?, { dir, scale, exit, decal })` | impacto por material (`concrete brick asphalt metal wood dirt glass plastic rubber flesh`) |
| `tracer(from, to, { speed, length, width, emissive })` | traçante que viaja até `to` |
| `muzzleFlash(obj3d, { dir, ads })` | clarão na boca (Object3D da viewmodel) |
| `muzzleFlashWorld(origin, dir)` | clarão de 3ª pessoa |
| `explosion(point, { radius, normal })` | explosão |
| `blood(point, normal, dir)`, `decal(point, normal, kind, size, dir)` | sangue / marca avulsa |
| `shake(amount, duration)` | tremor de câmera aditivo |
| `ballistics.fire(origin, dir, { range, damage, power, source, filter })` | **hitscan com penetração**: aplica dano em cada colisor atravessado e emite `weapon:hit` por superfície com `{ ballistic: true, penetration: n, exit? }`. Tabela em `ballistics.PENETRATION` (m atravessáveis a potência 1) |
| `vmToWorld(pVm, out)` | ponto da viewmodel → ponto do mundo na mesma posição de tela |

### Combinações com a feature `weapon`

- A arma pode trocar o próprio raycast por `services.vfx.ballistics.fire(...)`
  para ter penetração de verdade (dano incluso).
- Cápsulas: se `services.weapon.brassByVfx === true`, a vfx faz a ejeção
  inteira a partir de `services.weapon.ejectPort` (Object3D) ou estimada pela
  boca. Senão (a arma anima a própria cápsula na viewmodel), a vfx solta a
  "herdeira" no mundo fora do quadro, que cai, quica e fica no chão.
- Payload opcional de `weapon:fire`: `suppressed: true` (sem clarão), `ads` (0..1).

## Realismo (rodada 3)

- **Explosão**: domo de fuligem marrom-escura com fogo só em bolsões/filamentos
  no miolo (limiar sobre ruído animado), que esfria em ~0,5 s; capuz de
  fuligem que rola por cima; haste ligando a nuvem ao chão; saia de poeira
  rasteira achatada (atributo `aspect`); detritos de vários materiais e
  tamanhos log-uniformes com traço de desfoque de movimento; queimado difuso
  sem raios; luz de clarão (2500) + fogo (320) que acende fachadas e veículos.
  Sem aberração cromática.
- **Poeira** com albedo ≈ 1,3× o do material (não fica branca contra a parede).
- **Faíscas de ricochete**: traços curtos, finos, quase brancos, com gravidade.
- **Sangue**: cone de saída em névoa escura + estouro de entrada + névoa rosada
  que se desfaz, gotículas balísticas, spray na parede e no chão.
- **Marcas em metal**: aço nu metálico (metalness por instância só onde o
  albedo é claro), tinta lascada em escamas, borda repuxada.
