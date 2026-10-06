# audio

Tudo sintetizado: nenhuma amostra gravada. `dsp.js` + `sounds.js` são JS puro
(rodam no Node para inspeção: renderizar WAV e espectrograma).

- **Tiro do jogador**: onda N de boca + blast estéreo de banda larga + "boom"
  de médios + corpo grave saturado + sub + mecânica (ferrolho destravando /
  fechando, mola) + primeiras reflexões (chão/fachadas ou sala). Cauda
  separada (rua: rolando entre prédios; sala: densa com modos) misturada pelo
  fator `indoor`, mais envio para o reverb por convolução. Tique de pouca
  munição no último quarto do carregador. Ducking do ambiente/sfx.
- **Inimigos**: HRTF, atraso pela velocidade do som, absorção do ar por
  distância, oclusão por linha de visão; bala que passa a <4 m faz o estalo
  supersônico (chega ANTES do estampido) e o zumbido; impacto perto toca no
  ponto onde bateu. Passos de inimigos por distância percorrida.
- **Impactos** por material (concreto, asfalto, tijolo, metal com ricochete,
  madeira, terra, vidro, borracha, carne). Marcador de acerto / headshot /
  abate no bus de UI.
- **Corpo**: passos por superfície (calcanhar + ponta + arrasto; andando ×
  correndo), equipamento chacoalhando no sprint, pulo, aterrissagem pela
  velocidade, slide contínuo, mantle (mãos na borda), troca de postura, ADS.
- **Velocidade/esforço**: vento nos ouvidos em loop estéreo, volume e pitch
  seguindo a velocidade (sprint tático, slide, queda); respiração ofegante
  pelo esforço acumulado no sprint (some ao mirar — segura o fôlego).
- **Recarga**: linha do tempo estimada pela duração (`weapon:reload`) ou
  exata, se a arma emitir `weapon:foley { name }`.
- **Ambiente**: vento e ronco em loop, tiroteios/artilharia/jato/helicóptero/
  sirene/entulho ao longe; abafado dentro de prédios.
- **Master**: compressor + limiter; explosão perto = concussão (passa-baixa
  geral + zumbido).

## Armas v3 (feature weapon)

- **Tiro por arma** (`weapon:fire.id`): `shot_player` (KR-9, interno `shot_player_in`), `shot_pistol` (P-11),
  `shot_smg` (MX-9: mais agudo e curto), `shot_shotgun` (BR-12: grave e longo), `shot_sniper` (LR-50: o mais
  pesado), `shot_lmg` (HM-60), `shot_dmr` (SR-7). Armas pesadas puxam a cauda de rua mais alta e grave.
- **Supressor** (`weapon:fire.suppressed`): `shot_supp` / `shot_supp_heavy` — "tump" grave filtrado, chiado de
  gás e a mecânica do ferrolho bem audível; quase sem cauda de rua.
- **Foley exato** (`weapon:foley`): `pump_back`/`pump_fwd` (bomba), `shell_in` (cartucho no tubo),
  `bolt_up`/`bolt_back`/`bolt_fwd`/`bolt_down` (ferrolho), `cover_open`/`cover_close` + `belt` (tampa e fita da
  HM-60), `knife_flip`/`knife_catch` (inspeções), `bolt_release` (= `bolt`).
- **Faca**: `knife_swing` (corte no ar) a cada `weapon:melee`.
- **Fôlego da luneta** (`weapon:breath`): inspira ao segurar, solta ao largar, arfa mais forte quando o fôlego acaba.
