# Feature `inventory` — créditos, caixas, inventário e progressão cosmética

Dona de: `src/features/inventory/` (dados e regras). As telas ficam na
feature `hud` (`hud/arsenal.js`, aba **ARSENAL**), que só lê o serviço
`services.inventory`. Ordem 45 (depois da `weapon`, antes da `hud`).

**Política**: caixas só abrem com **chaves** ou **créditos** ganhos jogando.
Não existe compra com dinheiro real, loja ou fluxo de pagamento em lugar
nenhum. As chances de cada caixa são publicadas na própria tela (tabela por
raridade + chance por item) e a roleta sorteia os itens de enchimento pelas
MESMAS chances (sem "quase ganhou" fabricado).

## Arquivos

| Arquivo | O quê |
|---|---|
| `catalog.js` | dados puros: raridades (COMUM → ESPECIAL), faixas de desgaste, armas-base, modelos de faca, 3 caixas (13 skins + 6 facas cada), chaveiros, adesivos, maestria, cartões de chamada, emblemas, diário (7 dias) e passe (30 níveis) |
| `logic.js` | lógica pura: RNG semeado (mulberry32), sorteio, faixa/easing da roleta, contrato de troca, sucata, duplicatas, diário em hora local, curva do passe, créditos por partida, maestria, coleção, ordenações |
| `store.js` | persistência `localStorage['ironline.inventory']` versionada (`v: 1`), sempre em try/catch, com saneamento (`migrate`) |
| `index.js` | a feature: estado, eventos, serviço, aplicação na arma; `demoState()` determinístico (modo shot) |
| `inventory.test.mjs` | testes (importados por `tools/unit.test.mjs`) |

## Raridades e chances (iguais nas 3 caixas)

| Raridade | Cor | Chance | Sucata base |
|---|---|---|---|
| COMUM | `#a7b1bc` | 60 % | 8 |
| INCOMUM | `#4f9be3` | 25 % | 25 |
| RARO | `#8a66f4` | 10 % | 80 |
| ÉPICO | `#d653cf` | 3 % | 260 |
| LENDÁRIO | `#ea5a40` | 1,2 % | 900 |
| ESPECIAL (faca) | `#e9bd52` | 0,8 % | 2400 |

Desgaste (0..1, sorteado na faixa de cada skin, 7 casas): NOVA DE FÁBRICA
[0, .07) · POUCO USADA [.07, .15) · TESTADA EM CAMPO [.15, .38) · DESGASTADA
[.38, .45) · MUITO DESGASTADA [.45, 1]. Semente do padrão 0..999. ~10 % das
skins de caixa vêm com **REGISTRO** (contador de abates → `weapon.setKillCounter`).

Sucata = base × condição (NF 1,3 … MD 0,8) × 1,5 com registro (× 0,5 maestria).
"Sucatear duplicatas" mantém, de cada item, a cópia equipada ou a de menor desgaste.

## Economia

- Créditos por partida (`matchCredits`): 5/abate, 3/headshot, 25/zona, 10/onda,
  120/chefe, 4/medalha, 6/min (até 20 min), vitória 150 / derrota 40. Uma boa
  partida rende ~300–700 CR ≈ uma caixa (300 CR ou 1 chave).
- Começo: 500 CR + 1 chave. Chaves: diário (dias 3, 6, 7) e passe.
- Passe (só trilha gratuita): XP de partida = XP do passe; nível t pede
  `1500 + 150·t`; recompensas de créditos, chaves, adesivos, chaveiros,
  cartões, emblemas, skin RARA (10), ÉPICA (20) e **faca garantida (30)**.
- Diário: ciclo de 7 dias em hora LOCAL (`dateKey`), sequência zera se pular um dia.
- Maestria: abates por arma ('weapon:kill' { weaponId }) liberam BRONZE (25),
  PRATA (75), OURO (150) e OBSIDIANA (300) — viram itens no inventário.
- Contrato de troca: 10 skins de caixa da mesma raridade (COMUM..ÉPICO) → 1 da
  seguinte; chance de cada resultado proporcional aos itens de cada caixa;
  desgaste = média dos 10 normalizada na faixa do resultado.

## Serviço `inventory`

```js
const inv = ctx.services.inventory;
inv.catalog / inv.logic          // os módulos acima (a hud não importa arquivos daqui)
inv.state, inv.credits, inv.keys, inv.items, inv.equip, inv.lastAward
inv.def(id), inv.item(uid), inv.itemName(it), inv.baseName(base), inv.isEquipped(uid)
inv.weaponIdFor(base) / inv.baseOf(weaponId) / inv.knifeIdFor(model) // catálogo ↔ ids da weapon
inv.skinSpec(it), inv.previewSpec(it)   // formatos do contrato v3 (setSkin / buildPreview)
inv.open(caseId, { pay: 'key'|'credits', seed? }) → { item, strip, winAt, case, seed } | { error }
inv.equipItem(uid, base?), inv.unequip(uid), inv.setLoadout('primary'|'secondary', weaponId)
inv.setCard(id), inv.setEmblem(id), inv.scrap([uids]), inv.scrapDuplicates()
inv.tradeUp([10 uids], seed?), inv.dailyStatus(), inv.claimDaily(), inv.claimBp(t), inv.claimAllBp()
inv.markSeen(uids?), inv.apply()
```

Eventos: escuta `weapon:kill`, `match:end` (a hud emite com as estatísticas),
`match:start`/`player:respawn` (reaplica o equipamento); emite
`inventory:change`, `inventory:award` e `inventory:unlock` { item, def, name }.

## Integração com a arma (contrato v3)

`apply()` chama, todas opcionais: `setPrimary/setSecondary`, `setSkin(id,
skin|null)`, `setKillCounter`, `setCharm`, `setStickers` (até 4) e `setKnife`.
Chaves de arma do catálogo (`kr9 p11 smg shotgun sniper lmg dmr`) são
resolvidas por id e, na falta, por `kind`; modelos de faca (`tk7 garra
borboleta cacadora baioneta`) por id, `aliases` ou índice. No modo shot o
equipamento NÃO é aplicado (capturas das outras features ficam iguais) —
`?invapply=1` força.

## URL (QA)

`?credits=N`, `?keys=N`, `?invdemo=1` (estado de demonstração fora do modo
shot), `?invapply=1`. Telas: ver `hud/README.md` (`?inv=open`, `&arsenal=`,
`?case=1&seed=N&reelt=s&reveal=1`, `&inspect=N`, `&trade=1`).
