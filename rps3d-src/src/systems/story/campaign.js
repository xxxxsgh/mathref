// Campanha em 3 atos — dados e roteiro.
//
// Cada missão: { id, act, title, giver, faction, brief, objectives[], onStart?,
// onComplete?, reward?, next }. Objetivos (ver objectives.js):
//   scene      {scene}                  roda uma cena roteirizada (cinemática/fluxo) até o fim
//   dialog     {dialog}                 diálogo com escolhas (DIALOGS abaixo)
//   reach      {target, radius}         chegar perto de corpo/estação/POI (id)
//   dock       {station}                atracar (com reserva sem o sistema `stations`)
//   land       {body}                   pousar
//   scan       {kind, body?, count?}    escanear descoberta
//   battle     {preset, opts?}          batalha do `combat` (reserva: escaramuça do palco)
//   kill       {faction, count}         abater naves
//   charge     {seconds}                carregar algo sob fogo (barra de progresso)
//   jump       {system}                 saltar para um sistema
//   talk       {npc, station}           conversar (na estação; reserva: ao atracar)
//   wait       {seconds}  ·  flag {flag}
//
// Personagens: Rafael Paoli (LANÇA-7); Almirante Cássio Varela (COMANDO
// SOLAR, porta-caças Soberano); Davi Rocha (LANÇA-6, ala e amigo); Iara Voss
// (inteligência da Frente Livre); Comandante Tavi Okonkwo (Refúgio Cinza);
// Oren Saal (Guilda, Estação Meridiana); Capitã Rhee "Corvo" (Corsários);
// O Vigia (consciência dos Arquitetos).

export const ACTS = {
  1: { kicker: 'ATO I', title: 'DESERÇÃO', sub: 'Halden · Núcleo Hegemônico' },
  2: { kicker: 'ATO II', title: 'ALIANÇA', sub: 'Kessa · Fenda de Órion' },
  3: { kicker: 'ATO III', title: 'DESPERTAR', sub: 'Kessa · Fenda de Órion' },
};

export const CHARACTERS = {
  rafael: { name: 'RAFAEL PAOLI', faction: 'rafael' },
  varela: { name: 'ALM. CÁSSIO VARELA', faction: 'hegemonia', channel: 'COMANDO SOLAR' },
  comando: { name: 'COMANDO SOLAR', faction: 'hegemonia', channel: 'CANAL 1' },
  davi: { name: 'LANÇA-6 · DAVI ROCHA', faction: 'hegemonia', channel: 'ESQUADRILHA' },
  lanca8: { name: 'LANÇA-8', faction: 'hegemonia', channel: 'ESQUADRILHA' },
  aurora: { name: 'MILÍCIA DE AURORA', faction: 'frente', channel: 'ABERTO' },
  iara: { name: 'IARA VOSS', faction: 'frente', channel: 'FRENTE LIVRE' },
  okonkwo: { name: 'CMDT. TAVI OKONKWO', faction: 'frente', channel: 'REFÚGIO CINZA' },
  oren: { name: 'OREN SAAL', faction: 'guilda', channel: 'GUILDA' },
  meridiana: { name: 'CONTROLE MERIDIANA', faction: 'guilda', channel: 'TRÁFEGO' },
  corvo: { name: 'CAPITÃ RHEE "CORVO"', faction: 'corsarios', channel: '???' },
  vigia: { name: 'O VIGIA', faction: 'vigilantes', channel: '' },
  nave: { name: 'COMPUTADOR DE BORDO', faction: 'sistema', channel: '' },
};

/** Diálogos com escolhas. Cada nó: {who, text} | {choice: [{id, text, detail?, effects?, goto?}]} | {if, then, else}. */
export const DIALOGS = {
  // A ordem (abertura): a escolha que define Rafael.
  ordem: {
    prompt: 'RESPONDER AO COMANDO SOLAR',
    timeout: 22, default: 'silencio',
    lines: [],
    choices: [
      { id: 'recusar', text: '"Negativo, Comando. Lança-7 não atira em civis."', detail: 'Recusar abertamente', effects: { flags: { honesto: true }, rep: { frente: 10 } } },
      { id: 'enganar', text: '"Lança-7, confirmando." — e virar as armas contra a frota.', detail: 'Mentir e atacar de surpresa', hot: true, effects: { flags: { enganou: true }, rep: { frente: 5 } } },
      { id: 'silencio', text: '(Desligar o rádio. Olhar para Aurora.)', detail: 'Silêncio', effects: { flags: { silencio: true } } },
    ],
  },
  // Primeira transmissão da Frente Livre ao chegar em Kessa.
  contato: {
    prompt: 'IDENTIFICAR-SE À FRENTE LIVRE',
    lines: [
      { who: 'iara', text: 'Caça da Hegemonia, você entrou em espaço livre. Identifique-se ou será tratado como hostil.' },
      { who: 'iara', text: 'E antes que pergunte: sim, temos armas apontadas para você.' },
    ],
    choices: [
      { id: 'nome', text: '"Rafael Paoli. Ex-Lança-7. Recusei bombardear Aurora."', detail: 'Dizer a verdade', effects: { rep: { frente: 8 }, flags: { revelou_nome: true } } },
      { id: 'desertor', text: '"Só mais um desertor procurando um lugar para pousar."', detail: 'Ser vago', effects: { rep: { frente: 2 } } },
      { id: 'ameaca', text: '"Tente atirar. Veja quem cai primeiro."', detail: 'Bravata', hot: true, effects: { rep: { frente: -6, corsarios: 4 } } },
    ],
    after: {
      nome: [{ who: 'iara', text: 'Paoli… o piloto que virou a esquadrilha Lança em Halden. A notícia chegou antes de você.' }, { who: 'iara', text: 'Vá para a *Estação Meridiana*, em órbita de Verídia. Território da Guilda — ninguém atira lá. Eu te encontro no bar.' }],
      desertor: [{ who: 'iara', text: 'Desertores vêm e vão. A maioria vira corsário em um mês.' }, { who: 'iara', text: 'Siga para a *Estação Meridiana*, órbita de Verídia. Se ainda estiver vivo, conversamos no bar.' }],
      ameaca: [{ who: 'iara', text: 'Charmoso. Você tem um caça avariado e meia célula de energia.' }, { who: 'iara', text: 'Leve essa lata até a *Estação Meridiana*, em Verídia. Lá a Guilda impede que eu te derrube. Por enquanto.' }],
    },
  },
  iara_bar: {
    prompt: 'IARA VOSS',
    lines: [
      { who: 'iara', text: 'Então esse é o famoso desertor. Menor do que nas transmissões da Hegemonia.' },
      { who: 'iara', text: 'Varela pôs um preço na sua cabeça: cem mil créditos. Metade dos corsários da Fenda já sabe o seu nome.' },
      { who: 'iara', text: 'A Frente pode te esconder. Em troca, queremos o que você sabe: códigos, rotas, a frota de Varela.' },
    ],
    choices: [
      { id: 'aceitar', text: '"Eu conheço cada rota de pedágio da Hegemonia. São de vocês."', detail: 'Unir-se à Frente Livre', effects: { rep: { frente: 15, hegemonia: -10 }, flags: { aliado_frente: true } } },
      { id: 'condicoes', text: '"Ajudo. Mas não vou virar arma de ninguém de novo."', detail: 'Ajudar com condições', effects: { rep: { frente: 8 }, flags: { independente: true } } },
      { id: 'preco', text: '"Informação custa caro. Quanto a Frente paga?"', detail: 'Mercenário', effects: { rep: { frente: -4, guilda: 6 }, credits: 1500, flags: { mercenario: true } } },
    ],
    after: {
      aceitar: [{ who: 'iara', text: 'Bem-vindo à revolução, Paoli. O *Refúgio Cinza* fica no Cinturão da Fenda. Mandei as coordenadas.' }],
      condicoes: [{ who: 'iara', text: 'Justo. Ninguém aqui quer outro soldado obediente. Coordenadas do *Refúgio Cinza* enviadas — Cinturão da Fenda.' }],
      preco: [{ who: 'iara', text: 'Mil e quinhentos, adiantados. O resto quando o Comandante Okonkwo decidir que você vale mais.' }, { who: 'iara', text: 'Coordenadas do *Refúgio Cinza* enviadas. Não me faça me arrepender.' }],
    },
  },
  okonkwo: {
    prompt: 'COMANDANTE OKONKWO',
    lines: [
      { who: 'okonkwo', text: 'Sente-se, piloto. Eu perdi duas colônias para a Hegemonia antes de você aprender a voar.' },
      { who: 'okonkwo', text: 'Aurora sobreviveu porque você hesitou. Mas Varela não vai parar em Aurora. A Fenda é a próxima.' },
      { who: 'okonkwo', text: 'E há outra coisa. Nas ruínas dos Arquitetos, em Verídia, algo está *respondendo* aos nossos sinais.' },
    ],
    choices: [
      { id: 'lutar', text: '"Me dê uma nave e um alvo."', detail: 'Lutar pela Frente', effects: { rep: { frente: 10 }, flags: { soldado_frente: true } } },
      { id: 'ruinas', text: '"Respondendo? Conte mais sobre as ruínas."', detail: 'Investigar os Arquitetos', effects: { rep: { frente: 4, vigilantes: 5 }, flags: { curioso: true } } },
      { id: 'cético', text: '"Ruínas não ganham guerras. Pilotos ganham."', detail: 'Pragmático', effects: { rep: { frente: 2 } } },
    ],
    after: {
      lutar: [{ who: 'okonkwo', text: 'Primeiro, prove. Um comboio de pedágio da Hegemonia passa perto de Ashar. Tome a carga — e poupe os civis.' }],
      ruinas: [{ who: 'okonkwo', text: 'Depois. Primeiro, prove quem você é. Há um comboio de pedágio da Hegemonia perto de Ashar.' }],
      cético: [{ who: 'okonkwo', text: 'Então pilote. Comboio de pedágio da Hegemonia, perto de Ashar. Traga a carga.' }],
    },
  },
  comboio_fim: {
    prompt: 'O CARGUEIRO SE RENDE',
    lines: [{ who: 'nave', text: 'Cargueiro Tributo C-40 desarmado. Tripulação civil a bordo: 14 pessoas.' }],
    choices: [
      { id: 'poupar', text: 'Deixar a tripulação partir nas cápsulas.', detail: 'Misericórdia', effects: { rep: { frente: 6, hegemonia: 4 }, flags: { poupou_comboio: true } } },
      { id: 'prender', text: 'Entregar a tripulação à Frente como prisioneiros.', detail: 'Guerra é guerra', hot: true, effects: { rep: { frente: 4, hegemonia: -8 } } },
    ],
  },
  chave: {
    prompt: 'A CHAVE DOS ARQUITETOS',
    lines: [
      { who: 'vigia', text: 'PORTADOR. A CHAVE DESPERTA O QUE DORME. ESCOLHA A MÃO QUE A SEGURA.' },
      { who: 'iara', text: 'Rafael, a Frente precisa disso. Com ela, Varela nunca mais atravessa a Fenda.' },
      { who: 'oren', text: 'A Guilda paga duzentos mil créditos e garante neutralidade para quem você quiser. Pense bem, piloto.' },
    ],
    choices: [
      { id: 'frente', text: 'Entregar a Chave à Frente Livre.', detail: 'Revolução', effects: { rep: { frente: 20, guilda: -5 }, flags: { chave: 'frente' } } },
      { id: 'guilda', text: 'Vender a Chave à Guilda dos Mercadores.', detail: 'Acordo', effects: { rep: { guilda: 25, frente: -15 }, credits: 200000, flags: { chave: 'guilda' } } },
      { id: 'guardar', text: 'Guardar a Chave. Ninguém deveria ter esse poder.', detail: 'Guardião', hot: true, effects: { rep: { vigilantes: 20 }, flags: { chave: 'rafael' } } },
    ],
  },
  vigia: {
    prompt: 'O VIGIA',
    lines: [
      { who: 'vigia', text: 'NÓS VIGIAMOS A FENDA HÁ QUARENTA MIL ANOS. OS ARQUITETOS PARTIRAM. NÓS FICAMOS.' },
      { who: 'vigia', text: 'A FROTA DO SOL CHEGA. PODEMOS FECHAR AS PORTAS DO SALTO. PODEMOS LUTAR. PODEMOS DORMIR.' },
    ],
    choices: [
      { id: 'lutar', text: '"Lutem conosco. Contra a frota de Varela."', detail: 'Despertar os Vigilantes como aliados', effects: { rep: { vigilantes: 25 }, flags: { vigilantes: 'aliados' } } },
      { id: 'selar', text: '"Fechem as rotas de salto. Ninguém entra na Fenda."', detail: 'Selar a Fenda', hot: true, effects: { rep: { vigilantes: 15, guilda: -20 }, flags: { vigilantes: 'selar' } } },
      { id: 'dormir', text: '"Voltem a dormir. Esta guerra é nossa."', detail: 'Desligar os Vigilantes', effects: { rep: { vigilantes: -30, hegemonia: 5 }, flags: { vigilantes: 'dormir' } } },
    ],
  },
  final: {
    prompt: 'ALMIRANTE VARELA',
    lines: [
      { who: 'varela', text: 'Paoli. Eu te dei asas. Você podia ter sido almirante.' },
      { who: 'varela', text: 'Última oferta: renda a Fenda, e a Hegemonia esquece Aurora. Esquece você.' },
    ],
    choices: [
      { id: 'revolucao', text: '"A Fenda não está à venda. Nunca esteve."', detail: 'Lutar até o fim', effects: { flags: { final: 'revolucao' } } },
      { id: 'acordo', text: '"A Guilda negocia em nome da Fenda. Recue, e ninguém mais morre."', detail: 'Acordo (Guilda aliada)', requires: { rep: { guilda: 35 } }, effects: { flags: { final: 'acordo' } } },
      { id: 'retorno', text: '"…Eu volto. Poupe Aurora."', detail: 'Render-se à Hegemonia', hot: true, effects: { flags: { final: 'retorno' } } },
    ],
  },
};

/** Finais: o primeiro cujo `when` for verdadeiro. */
export const ENDINGS = [
  {
    id: 'vigilia', title: 'O LONGO SILÊNCIO', when: (s) => s.flags.vigilantes === 'selar' && s.flags.final !== 'retorno',
    lines: ['As portas do salto se fecharam em um único clarão azul.', 'A frota de Varela ficou do lado de fora — e com ela, o resto da galáxia.', 'A Fenda de Órion é livre. E está sozinha.', 'Rafael Paoli ainda voa pelas nebulosas, ouvindo os Vigilantes cantarem no escuro.'],
  },
  {
    id: 'retorno', title: 'VOLTA AO REBANHO', when: (s) => s.flags.final === 'retorno',
    lines: ['Rafael Paoli pousou no hangar do Soberano de mãos erguidas.', 'Aurora foi poupada. A Fenda, não.', 'Em um ano, os postos de pedágio cobriam cada rota da fronteira.', 'Dizem que, em algumas noites, ele ainda olha para a nebulosa e pensa no que poderia ter sido.'],
  },
  {
    id: 'acordo', title: 'PAX MERCANTIL', when: (s) => s.flags.final === 'acordo' || (s.flags.chave === 'guilda' && s.rep.guilda >= 35),
    lines: ['O Tratado de Meridiana foi assinado sobre os destroços da batalha.', 'A Hegemonia recuou. A Guilda assumiu as rotas — e os pedágios, agora "taxas de serviço".', 'Ninguém mais morreu na Fenda naquele ano.', 'Rafael Paoli recebeu uma medalha que nunca usou.'],
  },
  {
    id: 'revolucao', title: 'AURORA LIVRE', when: () => true,
    lines: ['O Soberano caiu sobre Verídia como uma estrela cadente.', 'Sem o porta-caças, a frota de Varela recuou para o Núcleo.', 'Uma a uma, as colônias da Fenda cortaram os pedágios.', 'A revolução tinha um rosto agora. E ele ainda estava pilotando.'],
  },
];

/** Missões da campanha, em ordem. `next` aponta a seguinte. */
export const MISSIONS = [
  // ─────────────────────────── ATO I — DESERÇÃO ───────────────────────────
  {
    id: 'a1_ordem', act: 1, title: 'A Ordem', giver: 'comando', faction: 'hegemonia', system: 'halden',
    brief: 'Órbita de Aurora. A milícia da colônia resiste. O Comando Solar prepara o bombardeio.',
    objectives: [{ type: 'scene', scene: 'opening', text: 'Proteja o Soberano — abata os caças da milícia' }],
    next: 'a1_fuga',
  },
  {
    id: 'a1_fuga', act: 1, title: 'Lança Partida', giver: 'rafael', faction: 'frente', system: 'halden',
    brief: 'A esquadrilha Lança caça o traidor. O motor de salto precisa de tempo.',
    objectives: [
      { type: 'charge', seconds: 38, text: 'Sobreviva enquanto o motor de salto carrega' },
      { type: 'jump', system: 'kessa', force: true, delay: 4, text: 'Motor de salto pronto — saltando para a Fenda de Órion' },
    ],
    onStart: (s) => s.fugaStart(),
    next: 'a1_chegada',
  },
  {
    id: 'a1_chegada', act: 1, title: 'Espaço Livre', giver: 'iara', faction: 'frente', system: 'kessa',
    brief: 'Kessa, na Fenda de Órion. Fora do alcance da Hegemonia — por enquanto.',
    objectives: [{ type: 'scene', scene: 'arrival', text: 'Responda à transmissão' }],
    next: 'a1_meridiana',
  },
  {
    id: 'a1_meridiana', act: 1, title: 'Porto Seguro', giver: 'iara', faction: 'frente', system: 'kessa',
    brief: 'A Estação Meridiana é território neutro da Guilda dos Mercadores.',
    objectives: [
      { type: 'dock', station: 'kessa:st0', text: 'Atraque na Estação Meridiana (órbita de Verídia)' },
      { type: 'talk', npc: 'iara', station: 'kessa:st0', dialog: 'iara_bar', text: 'Encontre Iara Voss no bar da estação' },
    ],
    onComplete: (s) => { s.revealStation('kessa:rebel'); },
    reward: { credits: 800 },
    next: 'a1_refugio',
  },
  {
    id: 'a1_refugio', act: 1, title: 'Entre as Rochas', giver: 'iara', faction: 'frente', system: 'kessa',
    brief: 'O Refúgio Cinza, base da Frente Livre, se esconde no Cinturão da Fenda.',
    objectives: [
      { type: 'reach', target: 'kessa:rebel', radius: 25000, text: 'Siga para o Refúgio Cinza no Cinturão da Fenda' },
      { type: 'dock', station: 'kessa:rebel', text: 'Atraque no Refúgio Cinza' },
    ],
    onStart: (s) => { s.radio('iara', 'Cuidado no cinturão. Os corsários do Corvo caçam por lá — e agora caçam você.'); },
    reward: { credits: 500, rep: { frente: 5 } },
    next: 'a2_juramento',
  },
  // ─────────────────────────── ATO II — ALIANÇA ───────────────────────────
  {
    id: 'a2_juramento', act: 2, title: 'O Juramento', giver: 'okonkwo', faction: 'frente', system: 'kessa',
    brief: 'O Comandante Okonkwo quer conhecer o desertor.',
    objectives: [{ type: 'talk', npc: 'okonkwo', station: 'kessa:rebel', dialog: 'okonkwo', text: 'Fale com o Comandante Okonkwo' }],
    next: 'a2_comboio',
  },
  {
    id: 'a2_comboio', act: 2, title: 'Tributo', giver: 'okonkwo', faction: 'frente', system: 'kessa',
    brief: 'Um comboio de pedágio da Hegemonia cruza a órbita de Ashar.',
    objectives: [
      { type: 'reach', target: 'kessa:poi1', radius: 30000, text: 'Intercepte o comboio de pedágio perto de Ashar' },
      { type: 'battle', preset: 'patrulha', opts: { faction: 'hegemonia', count: 4 }, text: 'Derrote a escolta da Hegemonia' },
      { type: 'dialog', dialog: 'comboio_fim', text: 'Decida o destino da tripulação' },
    ],
    reward: { credits: 4000, rep: { frente: 10, hegemonia: -10 } },
    next: 'a2_veridia',
  },
  {
    id: 'a2_veridia', act: 2, title: 'Ecos em Verídia', giver: 'okonkwo', faction: 'frente', system: 'kessa',
    brief: 'Algo nas ruínas dos Arquitetos em Verídia responde aos sinais da Frente.',
    objectives: [
      { type: 'land', body: 'kessa:p0', text: 'Pouse em Verídia, perto das ruínas dos Arquitetos' },
      { type: 'scan', kind: 'ruin', body: 'kessa:p0', text: 'Escaneie as ruínas dos Arquitetos' },
    ],
    onComplete: (s) => { s.radio('vigia', '…PORTADOR… OSSÁRIO… A CHAVE…'); s.radio('okonkwo', 'Você ouviu isso? Veio de Ossário, a lua de Tharsos.'); },
    reward: { credits: 2500, rep: { vigilantes: 5 } },
    next: 'a2_ossario',
  },
  {
    id: 'a2_ossario', act: 2, title: 'O Ossário', giver: 'okonkwo', faction: 'frente', system: 'kessa',
    brief: 'A lua morta de Tharsos guarda a maior ruína dos Arquitetos já vista.',
    objectives: [
      { type: 'land', body: 'kessa:g3-m0', text: 'Pouse em Ossário, lua de Tharsos' },
      { type: 'scan', kind: 'ruin', body: 'kessa:g3-m0', text: 'Abra a porta antiga das ruínas (quebra-cabeça de luz)' },
      { type: 'battle', preset: 'vigilantes', text: 'Sobreviva à sentinela Vigilante' },
    ],
    onComplete: (s) => { s.setFlag('tem_chave', true); s.notify('CHAVE DOS ARQUITETOS OBTIDA', 'reward'); },
    reward: { credits: 3000, rep: { vigilantes: 10 } },
    next: 'a2_chave',
  },
  {
    id: 'a2_chave', act: 2, title: 'A Mão que Segura', giver: 'vigia', faction: 'vigilantes', system: 'kessa',
    brief: 'Três vozes, uma Chave.',
    objectives: [{ type: 'dialog', dialog: 'chave', text: 'Decida o destino da Chave dos Arquitetos' }],
    next: 'a3_despertar',
  },
  // ─────────────────────────── ATO III — DESPERTAR ────────────────────────
  {
    id: 'a3_despertar', act: 3, title: 'Despertar', giver: 'okonkwo', faction: 'frente', system: 'kessa',
    brief: 'Os Vigilantes acordam em toda a Fenda. E a frota de Varela salta para Kessa.',
    objectives: [
      { type: 'scene', scene: 'awakening', text: 'Os Vigilantes despertam' },
      { type: 'dock', station: 'kessa:rebel', text: 'Volte ao Refúgio Cinza' },
    ],
    onStart: (s) => { s.factions.setHostile('vigilantes', 'hegemonia', true); },
    next: 'a3_nivalia',
  },
  {
    id: 'a3_nivalia', act: 3, title: 'Coração de Gelo', giver: 'vigia', faction: 'vigilantes', system: 'kessa',
    brief: 'Sob as geleiras de Nivália, o núcleo dos Vigilantes espera uma resposta.',
    objectives: [
      { type: 'land', body: 'kessa:p2', text: 'Pouse em Nivália' },
      { type: 'scan', kind: 'ruin', body: 'kessa:p2', text: 'Encontre o núcleo dos Vigilantes sob o gelo' },
      { type: 'dialog', dialog: 'vigia', text: 'Responda ao Vigia' },
    ],
    next: 'a3_final',
  },
  {
    id: 'a3_final', act: 3, title: 'A Batalha de Verídia', giver: 'okonkwo', faction: 'frente', system: 'kessa',
    brief: 'O Soberano em órbita de Verídia. Tudo termina aqui.',
    objectives: [
      { type: 'reach', target: 'kessa:p0', radius: 160000, text: 'Junte-se à frota da Frente em Verídia' },
      { type: 'dialog', dialog: 'final', text: 'Responda ao Almirante Varela' },
      { type: 'battle', preset: 'final', skipIf: (s) => s.flags.final === 'retorno' || s.flags.final === 'acordo', text: 'Destrua o Soberano' },
      { type: 'scene', scene: 'ending', text: '' },
    ],
    next: null,
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

/** Conversas de rádio ambiente por facção (eventos e mundo vivo). */
export const CHATTER = {
  hegemonia: [
    'Atenção, setor Kessa: o desertor Rafael Paoli é procurado vivo ou morto. Recompensa: cem mil créditos.',
    'Posto de pedágio Halden-7 operante. Naves civis, preparem o manifesto de carga.',
    'Patrulha Solar a todas as unidades: contato hostil reportado na Fenda.',
  ],
  frente: [
    'Aqui é a Rádio Livre da Fenda. A Hegemonia cobra o ar que vocês respiram. Nós não.',
    'Refúgio Cinza a todos os pilotos: suprimentos médicos chegando de Ashar. Escoltas, apresentem-se.',
    'Dizem que o desertor de Halden voa com a gente agora. Bem-vindo, Lança-7.',
  ],
  corsarios: [
    'Cem mil pela cabeça do Paoli… o Corvo quer essa recompensa.',
    'Cargueiro gordo saindo de Meridiana. Quem chega primeiro leva.',
  ],
  guilda: [
    'Guilda dos Mercadores: preços de hélio-3 em alta na Plataforma Tharsos.',
    'Controle Meridiana: corredor de aproximação 2 livre. Bom voo.',
  ],
  vigilantes: [
    '…VIGIAMOS…',
    '…A FENDA LEMBRA…',
  ],
};
