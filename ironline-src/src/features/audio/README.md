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
- **Recarga**: linha do tempo estimada pela duração (`weapon:reload`) ou
  exata, se a arma emitir `weapon:foley { name }`.
- **Ambiente**: vento e ronco em loop, tiroteios/artilharia/jato/helicóptero/
  sirene/entulho ao longe; abafado dentro de prédios.
- **Master**: compressor + limiter; explosão perto = concussão (passa-baixa
  geral + zumbido).
