# Feature `world`

Mapas, materiais PBR procedurais, céu, luzes e colisores estáticos.

## Seleção de mapa

`?map=street|factory` (padrão `street`). Um mapa por carga de página: trocar
é recarregar com outro parâmetro (`services.world.setMap(id)` faz isso).

| id | nome | arquivo |
|---|---|---|
| `street` | MERIDIAN STREET | `layout.js` (+ `interior.js`, `buildings.js`) |
| `factory` | FOUNDRY 9 | `factory.js` |

Os dados por mapa (bounds, spawns, poses de screenshot, volumes de oclusão,
fogos, fumaça) ficam em `STREET` (`index.js`) e `FACTORY` (`factory.js`).
Para um mapa novo: exporte `buildX(W)` + um objeto com os mesmos campos de
`FACTORY` e registre em `MAPS` / `MAP_DATA` no `index.js`.

## `ctx.services.world`

| Campo | O que é |
|---|---|
| `root`, `sun`, `hemi`, `sky`, `environment`, `atmosphere` | cena e luz |
| `bounds` | `Box3` da área jogável (minimapa, recorte da navegação) |
| `spawnPoints` / `enemySpawns` | `[{ position: [x,y,z], yaw, pitch? }]` |
| `shotPoses` | pose de cada preset de `?shot=` para o mapa atual |
| `materialAt(hit)` | superfície (`'concrete' 'metal' 'wood'…`) |
| `surfaces`, `stats` | tabela material→superfície, estatísticas de geração |
| `interior` | sala jogável R4 (`street`) ou `null` |
| `mapId`, `map`, `maps` | mapa atual e lista `{ id, name, description }` |
| `mapUrl(id)`, `setMap(id)` | URL com `?map=id` / navega para ela |

## Props de perto

`propkit.js` (caixa boleada com UV por peça e desgaste nas quinas assado na
cor de vértice, atlas por face, variação por instância, pneu com banda de
rodagem) é a base de `furniture.js` (mesas, cadeiras, mesa de aço, arquivo,
armário, estante) e dos props de `props.js` (caixa de munição com faces
distintas, caçamba oca com tampas espessas, sacos de lixo com pregas, caixas
de papelão, cadeira monobloco, engradados) e `cars.js` (interior, caixas de
roda fechadas, pneus com blocos). O entulho (`rubble.js`) tem tijolos
boleados com argamassa, blocos com normais vincadas e uma camada de grãos
finos. Pisos: `W_PAVER` (calçada por peça), `W_SLAB` (laje industrial),
`W_FLOOR` (ladrilho) em `materials.js`.
