# Rafael Football Manager

Gerenciador de futebol em arquivo único (`rfm/index.html`), mobile-first,
instalável como PWA e jogável offline. Todos os clubes e jogadores são gerados
proceduralmente a partir de uma semente.

## Como jogar (MVP)

1. **Início** — nome do técnico, dificuldade, semente do mundo e clube.
2. **Caixa** — próxima partida, confiança da diretoria e mensagens (resultados,
   lesões, propostas recebidas com aceitar/contrapropor/recusar, base, contratos).
3. **Elenco** — lista filtrável/ordenável; toque abre a ficha (atributos 1–20,
   potencial estimado em estrelas, moral, condição, contrato, estatísticas,
   renovar / pôr à venda / rescindir).
4. **Tática** — 4-4-2, 4-3-3, 3-5-2, 4-2-3-1; escalação por toque no campo
   (toque numa vaga e depois em outra vaga ou jogador); banco de 9; mentalidade,
   pressão, ritmo; treino semanal (intensidade e foco).
5. **Liga** — tabela com zonas, rodadas com súmula, artilharia/assistências/notas,
   histórico de campeões.
6. **Partida** — texto minuto a minuto, placar, posse, finalizações, cartões;
   até 5 substituições, mudança de formação e instruções durante o jogo;
   velocidade 1×/2×/4×, pular para o fim, notas dos jogadores no final.
7. **Mercado** — busca por posição/idade/overall/valor, só livres, só à venda;
   negociação em duas etapas (taxa com o clube → salário e duração com o jogador).
   Janelas: pré-temporada (rodadas 1–5) e meio do ano (rodadas 20–23); livres a qualquer momento.
8. **Finanças** — saldo, folha × teto salarial, receitas/despesas da temporada,
   gráfico por rodada, preço do ingresso com público estimado.

## Motor de simulação

`MatchEngine` / `simulateMatch(cfgCasa, cfgFora, semente, getPlayer)` não
tocam no DOM. Cada minuto:

- força de **defesa/meio/ataque** = overall de cada jogador na função ×
  condição × moral, ponderado pela altura da vaga no campo; formação, mentalidade
  e pressão ajustam os setores; mandante +5%;
- a posse sai do meio-campo; a chance de finalizar sai de ataque ÷ defesa,
  ritmo e mentalidade; acerto e gol dependem de finalização/compostura do
  atacante contra o goleiro;
- faltas, cartões (2º amarelo = expulsão), lesões e cansaço por probabilidade;
- a IA faz substituições e muda a mentalidade quando está perdendo/ganhando.

Mesma semente + mesmas entradas = mesma partida (a semente aparece na súmula).
Valores calibrados: ~2,5 gols e ~12 finalizações por time por jogo, mandante
vence ~45% e visitante ~30%. Os testes (`?test=1`) verificam determinismo,
média de gols, fator casa, favorito vencendo e efeito da tática.

## Progressão

- 38 rodadas em turno e returno; campeão, G4, 4 rebaixados (substituídos por 4
  clubes gerados), premiação por posição.
- Evolução semanal pelos minutos jogados, idade, potencial e treino; na virada
  do ano todos envelhecem, veteranos declinam/aposentam, contratos vencem e a
  base promove 2–4 jovens por clube.
- Diretoria com objetivo pela reputação do clube; confiança sobe e desce com
  resultados e posição. Demissão no meio da temporada ou no fim, e rebaixamento
  também encerra o contrato — você recebe propostas de clubes menores.

## Save

Salvamento automático em `localStorage` (`rfm.save.v1`) após cada rodada e ação.
*Menu → Exportar save* baixa um JSON (no iPhone abre a folha de compartilhar);
*Importar save* aceita o mesmo arquivo.

## Próximas fases sugeridas

1. **Copas** — copa nacional em mata-mata (ida e volta) e torneio continental
   para o G4, com calendário de meio de semana e rodízio de elenco.
2. **Mais divisões** — Série B/C com acesso e rebaixamento reais, em vez de clubes gerados.
3. **Scout** — atributos e potencial com névoa até o olheiro observar; relatórios,
   região de atuação e orçamento de observação.
4. **Comissão técnica** — auxiliar, preparador físico, treinador de goleiros,
   médico e olheiros com atributos próprios afetando evolução, lesões e scout.
5. **Treinos detalhados** — calendário semanal por sessão, foco individual,
   treino de posição nova, bolas paradas e entrosamento.
6. Extras: empréstimos e cláusulas, conversas com jogadores, imprensa,
   objetivos de longo prazo da diretoria, estádio e categorias de base com instalações.
