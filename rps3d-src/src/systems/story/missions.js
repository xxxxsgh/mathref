// Missões procedurais e quadro de missões por estação.
//
// services.missions = {
//   available(stationId) → [oferta]      (quadro da estação; muda a cada ciclo de ~20 min)
//   accept(idOuOferta) → bool · active() → [resumo] · complete(id) · abandon(id)
//   track(id) (missão destacada no HUD) · board(stationId) (alias de available)
// }
// Oferta: { id, type, typeLabel, title, giver, faction, target, text, brief,
//           reward:{credits, rep}, danger 1..5, system, station, expires }
//
// Tipos: caça a recompensas, escolta, entrega, resgate, sabotagem,
// exploração de ruínas. Gerados de forma determinística a partir da semente
// da estação + ciclo, coerentes com o sistema (corpos, POIs, facção dona).
import { Rng, mix, hashString } from '../../core/Rng.js';

export const TYPES = {
  recompensa: { label: 'Caça a recompensas', icon: '◎' },
  escolta: { label: 'Escolta', icon: '⟁' },
  entrega: { label: 'Entrega', icon: '▣' },
  resgate: { label: 'Resgate', icon: '✚' },
  sabotagem: { label: 'Sabotagem', icon: '✕' },
  ruinas: { label: 'Exploração de ruínas', icon: '◇' },
};

const CYCLE = 1200; // s de tempo de universo por renovação do quadro

const TARGET_NAMES = ['Kael "Ferrugem" Montes', 'Irmãos Vasko', 'Nadia Quell', 'o Açougueiro de Brasa', 'Tenente Orlov', 'Sira Duvall', '"Lâmina" Okafor', 'Capitão Dreen'];
const CARGO = ['suprimentos médicos', 'células de deutério', 'peças de reator', 'sementes híbridas', 'dados criptografados', 'filtros de oxigênio', 'munição de pulso', 'relíquias catalogadas'];
const BRIEFS = {
  recompensa: [
    (o) => `${o.target} atacou cargueiros perto de ${o.where}. Vivo ou morto, a recompensa é a mesma.`,
    (o) => `Contrato aberto: ${o.target}, procurado por pirataria. Último contato: ${o.where}.`,
  ],
  escolta: [
    (o) => `Um cargueiro com ${o.cargo} precisa chegar a ${o.dest}. Os corsários estão de olho.`,
    (o) => `Comboio da Guilda partindo para ${o.dest}. Pagamento na chegada — se houver chegada.`,
  ],
  entrega: [
    (o) => `Leve ${o.cargo} até ${o.dest}. Sem perguntas.`,
    (o) => `Carga urgente: ${o.cargo} para ${o.dest}. Bônus por pontualidade.`,
  ],
  resgate: [
    (o) => `Sinal de socorro perto de ${o.where}. Uma cápsula com ${o.n} sobreviventes está à deriva.`,
    (o) => `Nave de prospecção caiu em silêncio perto de ${o.where}. Encontre os sobreviventes.`,
  ],
  sabotagem: [
    (o) => `Um posto de pedágio da Hegemonia perto de ${o.where} monitora nossas rotas. Desligue-o.`,
    (o) => `Relé de interdição da Hegemonia em ${o.where}. Destrua a escolta e o relé.`,
  ],
  ruinas: [
    (o) => `Sinais dos Arquitetos em ${o.where}. A Guilda paga por cada leitura.`,
    (o) => `Ruínas não catalogadas em ${o.where}. Pouse, escaneie e volte com os dados.`,
  ],
};
const GIVERS = { frente: ['Refúgio Cinza', 'Célula Ashar', 'Rádio Livre'], guilda: ['Guilda dos Mercadores', 'Consórcio Saal', 'Câmara de Comércio'], hegemonia: ['Patrulha Solar'], corsarios: ['Corvo'] };

export class MissionBoard {
  constructor(story) {
    this.story = story;
    this.ctx = story.ctx;
    this.taken = new Set();   // ids de ofertas aceitas/concluídas (não reaparecem)
  }

  cycle() { return Math.floor((this.ctx.time.world || 0) / CYCLE); }

  /** Ofertas do quadro de uma estação (determinísticas por ciclo). */
  available(stationId) {
    const sys = this.ctx.universe.system;
    if (!sys) return [];
    const st = sys.station(stationId) || sys.stations.find((s) => s.name === stationId) || null;
    if (!st) return [];
    const cyc = this.cycle();
    const r = new Rng(mix(st.seed || hashString(st.id), cyc * 7907 + 13));
    const n = r.int(4, 6);
    const out = [];
    const types = st.faction === 'frente' ? ['sabotagem', 'resgate', 'escolta', 'entrega', 'recompensa', 'ruinas'] : st.faction === 'hegemonia' ? ['recompensa', 'entrega', 'escolta'] : ['entrega', 'escolta', 'recompensa', 'resgate', 'ruinas', 'sabotagem'];
    for (let i = 0; i < n; i++) {
      const type = types[(i + r.int(0, types.length - 1)) % types.length];
      const o = this.generate(type, st, r.fork(i), `${st.id}#${cyc}#${i}`);
      if (o && !this.taken.has(o.id)) out.push(o);
    }
    // sabotagem só aparece para quem a Frente aceita
    const f = this.story.factions;
    return out.filter((o) => !(o.type === 'sabotagem' && f.rep('frente') < 0) && !(o.faction === 'hegemonia' && f.hostile('player', 'hegemonia')));
  }

  generate(type, st, r, id) {
    const sys = this.ctx.universe.system;
    const bodies = sys.bodies.filter((b) => b.kind !== 'gas_giant' || type === 'escolta');
    const landable = sys.bodies.filter((b) => b.landable);
    const pois = sys.pois.filter((p) => p.kind !== 'arrival' && p.kind !== 'opening_battle');
    const stations = sys.stations.filter((s) => s.id !== st.id && !s.hidden);
    const faction = type === 'sabotagem' ? 'frente' : st.faction === 'frente' ? 'frente' : st.faction === 'hegemonia' ? 'hegemonia' : r.chance(0.7) ? 'guilda' : 'frente';
    const giver = r.pick(GIVERS[faction] || GIVERS.guilda);
    const danger = { recompensa: r.int(2, 5), escolta: r.int(2, 4), entrega: r.int(1, 2), resgate: r.int(1, 3), sabotagem: r.int(3, 5), ruinas: r.int(1, 3) }[type];
    const nameOf = (x) => x?.name || 'espaço profundo';
    const o = { id: `${id}:${type}`, type, typeLabel: TYPES[type].label, faction, giver, station: st.id, system: sys.id, danger };
    let objectives = [];
    const poi = pois.length ? r.pick(pois) : null;
    const nearBody = poi ? sys.body(poi.near) : r.pick(bodies);
    const where = poi ? `${nameOf(nearBody)}` : nameOf(nearBody);
    switch (type) {
      case 'recompensa': {
        o.target = r.pick(TARGET_NAMES);
        o.title = `Recompensa: ${o.target}`;
        o.brief = r.pick(BRIEFS.recompensa)({ target: o.target, where });
        objectives = [
          { type: 'reach', target: poi?.id || nearBody.id, radius: poi ? 15000 : nearBody.radius * 2.2, text: `Encontre ${o.target} perto de ${where}` },
          { type: 'battle', preset: 'emboscada', opts: { count: 2 + danger, faction: 'corsarios' }, text: `Abata ${o.target} e o bando` },
          { type: 'dock', station: st.id, text: `Volte a ${st.name} para receber` },
        ];
        o.reward = { credits: 1800 + danger * 1400 + r.int(0, 8) * 50, rep: { [faction]: 4 + danger, corsarios: -6 } };
        break;
      }
      case 'escolta': {
        const dest = stations.length ? r.pick(stations) : st;
        o.cargo = r.pick(CARGO);
        o.title = `Escolta até ${dest.name}`;
        o.brief = r.pick(BRIEFS.escolta)({ cargo: o.cargo, dest: dest.name });
        objectives = [
          { type: 'wait', seconds: 4, text: 'Aguarde o cargueiro deixar o hangar' },
          { type: 'reach', target: dest.id, radius: 30000, text: `Escolte o cargueiro até ${dest.name}` },
          { type: 'battle', preset: 'comboio', opts: { count: 1 + danger }, text: 'Defenda o comboio da emboscada' },
          { type: 'dock', station: dest.id, text: `Atraque em ${dest.name}` },
        ];
        o.reward = { credits: 1500 + danger * 1100, rep: { [faction]: 3 + danger, corsarios: -3 } };
        break;
      }
      case 'entrega': {
        const dest = stations.length ? r.pick(stations) : st;
        o.cargo = r.pick(CARGO);
        o.title = `Entrega: ${o.cargo}`;
        o.brief = r.pick(BRIEFS.entrega)({ cargo: o.cargo, dest: dest.name });
        objectives = [{ type: 'dock', station: dest.id, text: `Entregue ${o.cargo} em ${dest.name}` }];
        o.reward = { credits: 700 + danger * 500 + r.int(0, 10) * 30, rep: { [faction]: 2 + danger } };
        o.cargoItem = { id: 'carga_' + hashString(o.cargo).toString(36), name: o.cargo, qty: r.int(2, 8) };
        break;
      }
      case 'resgate': {
        o.n = r.int(2, 9);
        o.title = `Resgate perto de ${where}`;
        o.brief = r.pick(BRIEFS.resgate)({ where, n: o.n });
        objectives = [
          { type: 'reach', target: poi?.id || nearBody.id, radius: poi ? 8000 : nearBody.radius * 2, text: `Localize o sinal de socorro perto de ${where}` },
          { type: 'wait', seconds: 6, text: 'Acople a cápsula de sobreviventes (mantenha posição)' },
          { type: 'dock', station: st.id, text: `Leve os sobreviventes a ${st.name}` },
        ];
        o.reward = { credits: 900 + o.n * 220, rep: { [faction]: 6, guilda: 2 } };
        break;
      }
      case 'sabotagem': {
        o.title = `Sabotagem perto de ${where}`;
        o.brief = r.pick(BRIEFS.sabotagem)({ where });
        objectives = [
          { type: 'reach', target: poi?.id || nearBody.id, radius: poi ? 12000 : nearBody.radius * 2, text: `Infiltre-se no posto da Hegemonia perto de ${where}` },
          { type: 'battle', preset: 'patrulha', opts: { faction: 'hegemonia', count: 1 + danger }, text: 'Destrua a escolta e o relé de interdição' },
          { type: 'reach', target: st.id, radius: 40000, text: 'Fuja antes dos reforços' },
        ];
        o.reward = { credits: 2500 + danger * 1500, rep: { frente: 6 + danger, hegemonia: -10 } };
        break;
      }
      case 'ruinas': {
        const b = landable.length ? r.pick(landable.filter((x) => x.ruins).length ? landable.filter((x) => x.ruins) : landable) : nearBody;
        o.title = `Ruínas em ${b.name}`;
        o.brief = r.pick(BRIEFS.ruinas)({ where: b.name });
        objectives = [
          { type: 'land', body: b.id, text: `Pouse em ${b.name}` },
          { type: 'scan', kind: 'ruin', body: b.id, text: 'Escaneie as estruturas dos Arquitetos' },
          { type: 'dock', station: st.id, text: `Entregue os dados em ${st.name}` },
        ];
        o.reward = { credits: 1600 + danger * 700, rep: { [faction]: 3, vigilantes: 2 } };
        break;
      }
      default: return null;
    }
    o.text = objectives[0]?.text || '';
    o.objectives = objectives;
    o.expires = (this.cycle() + 1) * CYCLE;
    return o;
  }

  /** Oferta → definição executável (MissionRun). */
  toDef(o) {
    return {
      id: o.id, title: o.title, giver: o.giver, faction: o.faction, type: o.type, brief: o.brief, reward: o.reward,
      objectives: o.objectives.map((x) => ({ ...x })),
      raw: o,
      onStart: (S) => {
        if (o.cargoItem) { try { S.ctx.services.economy?.addItem?.(o.cargoItem.id, o.cargoItem.qty, { name: o.cargoItem.name, mission: o.id }); } catch { /* sem economia */ } }
        S.notify(`MISSÃO ACEITA — ${o.title.toUpperCase()}`, 'info');
      },
      onComplete: (S) => {
        if (o.cargoItem) { try { S.ctx.services.economy?.removeItem?.(o.cargoItem.id, o.cargoItem.qty); } catch { /* sem economia */ } }
      },
    };
  }
}
