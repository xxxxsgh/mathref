# VECTRA ARENA

Protótipo jogável de um FPS competitivo de arena, original, que roda inteiro no
navegador: HTML5 + CSS3 + JavaScript (classes ES6) + Three.js via CDN. Sem
Unity, sem build, sem npm.

## Como jogar

1. Baixe a pasta `vectra-arena/` inteira.
2. Abra o `index.html` num navegador moderno (Chrome, Edge, Firefox).
3. **PLAY → DEPLOY**, depois clique na tela para capturar o mouse.

Não precisa de servidor: os scripts são clássicos (`<script src>`), então
funcionam em `file://`. Se o seu navegador bloquear algo localmente, use um
servidor mínimo:

```bash
./serve.sh          # macOS/Linux  (ou: python3 -m http.server 8000)
serve.bat           # Windows
# depois abra http://localhost:8000
```

### Dependência externa

| Biblioteca | Versão | Origem |
|---|---|---|
| Three.js (MIT) | r149 | `cdn.jsdelivr.net` → `unpkg.com` → cópia local em `assets/vendor/three.min.js` |

A cópia local garante que o jogo abra mesmo offline.

## Controles

| Tecla | Ação |
|---|---|
| WASD | mover |
| Shift | correr |
| Ctrl / C | agachar (C evita o atalho Ctrl+W do navegador) |
| Espaço | pular |
| Botão esquerdo | atirar / golpe rápido da faca |
| Botão direito | mirar (ADS) / luneta / golpe pesado da faca |
| R | recarregar |
| 1 / 2 / 3 | primária / pistola / faca (Q = arma anterior, roda do mouse alterna) |
| F | inspecionar (faca: 5 animações aleatórias + 1 rara de 5%) |
| Tab | placar |
| Esc | pausa |
| Z / X | na fase de equipamento: Assault Rifle / Precision Rifle |

### Celular e tablet

Em telas de toque os controles aparecem sozinhos (ou force com `index.html?touch`):
analógico à esquerda (empurre todo para frente para correr), arraste o lado
direito para mirar (arrastar em FIRE/AIM também mira), botões FIRE, AIM, JUMP,
CROUCH, R, F, 1/2/3, TAB e pausa. Ao clicar em DEPLOY o jogo tenta entrar em
tela cheia na horizontal; a qualidade gráfica começa em LOW no primeiro acesso.

## Versão em arquivo único

`vectra-arena-standalone.html` tem o CSS e todo o JS embutidos (só o Three.js
vem do CDN, então precisa de internet). Gere de novo com `python3 build-standalone.py`.

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| `index.html` | telas (loading, menu, play, inventário, loadout, inspeção, settings), HUD e overlays |
| `style.css` | visual tático/cyberpunk, raridades, HUD, responsivo |
| `save.js` | `SaveManager` — tudo em `localStorage["vectra_save"]` |
| `audio.js` | `AudioManager` — sons 100% sintetizados (Web Audio API) |
| `skins.js` | `RARITIES`, `SKIN_CATALOG`, `WearSystem`, `WeaponSkin`, texturas procedurais por seed |
| `weapons.js` | stats, modelos procedurais, `KeyframeAnim`, inspeções da faca, `ViewModel`, `Weapon`, `Knife`, `Arsenal` |
| `arena.js` | mapa OUTPOST, colisão AABB, raycast, navegação A*, cidade, drones, holofotes |
| `player.js` | `Player` — movimento, colisão, agachar, pulo, recuo |
| `bots.js` | `Bot` / `BotManager` — patrulha por waypoints, visão + linha de visada, reação, strafe, rajadas |
| `inventory.js` | `Inventory` (equipar, vender, recompensas) e `PreviewRenderer` (miniaturas + visualizador 3D) |
| `touch.js` | `TouchControls` — analógico virtual, mira por arraste e botões na tela |
| `ui.js` | `UIManager` — menus, HUD, mini-mapa, kill feed, placar, morte, fim de partida |
| `game.js` | `Game`, `RoundManager` (melhor de 13), partículas, tracers, decals, loop principal |

## Sistemas

- **Partida:** 4 vs 4 (você + 3 bots azuis contra 4 bots vermelhos), melhor de 13
  (primeiro a 7). Cada round: fase de equipamento (5 s) → combate (1:45) →
  resultado → próximo round. Ao morrer: tela ELIMINATED e câmera de espectador
  até o próximo round.
- **Dano:** cabeça 2x, corpo 1x, pernas 0,75x. Armadura absorve 40%.
- **Skins:** 10 skins originais, 6 raridades (COMMON → MYTHIC). Cada cópia tem
  `id, name, rarity, floatValue, patternSeed, wearLevel`.
- **Desgaste:** o float (0–1) define a condição (Factory New … Battle-Scarred) e
  só muda a aparência: arranhões, tinta desbotada, sujeira, bordas com metal
  exposto, rugosidade e brilho neon. Não altera dano, precisão, recuo, cadência
  nem movimento — os stats vêm só de `WEAPON_DEFS`.
- **Pattern seed (0–1000):** muda rotação, deslocamento, distribuição de cores,
  arranhões e detalhes da textura.
- **Progressão:** XP por partida; cada nível concede um item cosmético. Vender
  itens dá créditos fictícios. Não há compras, dinheiro real nem caixas aleatórias pagas.

## Depuração

- `index.html?nolock` roda sem Pointer Lock (útil para testes automatizados).
- `window.VECTRA` expõe a instância do jogo no console.
