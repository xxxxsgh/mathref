import { CONFIG } from '../config.js';

/**
 * Chassis e upgrades.
 *
 * A regra desta fase é uma só: **nenhum upgrade pode ser escolha óbvia**. Todo
 * tier melhora uma coisa e piora outra, e as duas coisas são sentidas no ar.
 * Um upgrade que só melhora não é decisão, é imposto — o jogador compra porque
 * seria burrice não comprar, e a "progressão" vira uma fila de botões.
 *
 * Tudo aqui vira um punhado de multiplicadores aplicados sobre o `config.js`.
 * O modelo de voo não sabe que upgrades existem: ele recebe escalas.
 */

/** Multiplicadores neutros — a base sobre a qual tudo é aplicado. */
function neutralSpec() {
  return {
    thrustScale: 1, // empuxo disponível
    massScale: 1, // inércia linear e de rotação
    rateScale: 1, // velocidade de rotação (agilidade)
    dragScale: 1, // arrasto aerodinâmico
    windScale: 1, // o quanto o vento sacode
    batteryScale: 1, // capacidade
    drainScale: 1, // consumo
    radioScale: 1, // alcance do link
    zoom: 1, // aproximação da câmera (inspeção/filmagem)
  };
}

export const CHASSIS = [
  {
    id: 'leve',
    name: 'Leve / acrobático',
    price: 2400,
    feel: 'Vira num palito e some com uma rajada. Perdoa pouco, recompensa muito.',
    spec: { massScale: 0.78, rateScale: 1.28, thrustScale: 1.06, windScale: 1.45, batteryScale: 0.82 },
  },
  {
    id: 'equilibrado',
    name: 'Equilibrado',
    price: 0,
    feel: 'O padrão. Faz tudo razoavelmente e nada excepcionalmente.',
    spec: {},
  },
  {
    id: 'cargueiro',
    name: 'Cargueiro pesado',
    price: 3200,
    feel: 'Ignora vento e carrega o dobro, mas curva como um caminhão.',
    spec: { massScale: 1.5, rateScale: 0.74, thrustScale: 1.22, windScale: 0.55, batteryScale: 1.35, dragScale: 1.12 },
  },
];

/**
 * Cinco linhas, três tiers. `effect` é o número; `feel` é a frase em português
 * que diz o que muda na PILOTAGEM — porque "+8% de empuxo" não ensina ninguém
 * a decidir, e "sobe mais rápido, mas a bateria some" ensina.
 */
export const UPGRADES = [
  {
    id: 'motores',
    name: 'Motores',
    tradeoff: 'mais empuxo, mais consumo',
    tiers: [
      { price: 600, spec: { thrustScale: 1.09, drainScale: 1.12 }, feel: 'Sobe mais rápido; a bateria sente.' },
      { price: 1400, spec: { thrustScale: 1.18, drainScale: 1.26 }, feel: 'Sai de qualquer buraco — se houver bateria.' },
      { price: 2900, spec: { thrustScale: 1.28, drainScale: 1.45 }, feel: 'Empuxo de sobra e autonomia curta. Voo agressivo, volta cedo.' },
    ],
  },
  {
    id: 'bateria',
    name: 'Bateria',
    tradeoff: 'mais autonomia, mais peso',
    tiers: [
      { price: 550, spec: { batteryScale: 1.2, massScale: 1.07 }, feel: 'Voa mais longe; freia e vira um pouco pior.' },
      { price: 1300, spec: { batteryScale: 1.45, massScale: 1.15 }, feel: 'Alcance de exploração, inércia de caminhonete.' },
      { price: 2700, spec: { batteryScale: 1.75, massScale: 1.26 }, feel: 'Autonomia enorme. Em circuito técnico, atrapalha.' },
    ],
  },
  {
    id: 'helices',
    name: 'Hélices',
    tradeoff: 'mais agilidade, menos estabilidade no vento',
    tiers: [
      { price: 500, spec: { rateScale: 1.1, windScale: 1.18 }, feel: 'Responde mais rápido; a rajada também.' },
      { price: 1250, spec: { rateScale: 1.22, windScale: 1.4 }, feel: 'Troca de direção instantânea, e o vento manda junto.' },
      { price: 2600, spec: { rateScale: 1.35, windScale: 1.7 }, feel: 'Precisão cirúrgica em dia calmo. Na costa, um pesadelo.' },
    ],
  },
  {
    id: 'camera',
    name: 'Câmera',
    tradeoff: 'melhor imagem e zoom, mais peso na frente',
    tiers: [
      { price: 700, spec: { zoom: 1.15, massScale: 1.05 }, feel: 'Enquadra de mais longe; o nariz fica pesado.' },
      { price: 1600, spec: { zoom: 1.35, massScale: 1.11 }, feel: 'Inspeção sem chegar perto. Pitch mais preguiçoso.' },
      { price: 3100, spec: { zoom: 1.6, massScale: 1.18 }, feel: 'Lente longa de verdade — e um drone que não gosta de curva.' },
    ],
  },
  {
    id: 'antena',
    name: 'Antena',
    tradeoff: 'mais alcance de rádio, mais arrasto',
    tiers: [
      { price: 650, spec: { radioScale: 1.25, dragScale: 1.07 }, feel: 'Vai mais longe sem chuviscar; perde um pouco de ponta.' },
      { price: 1500, spec: { radioScale: 1.55, dragScale: 1.15 }, feel: 'Link firme longe da base, velocidade máxima menor.' },
      { price: 3000, spec: { radioScale: 1.9, dragScale: 1.26 }, feel: 'Explora o mapa inteiro. Em corrida, é peso morto.' },
    ],
  },
];

/** Tier comprado de uma linha (permanente). */
export const ownedTier = (progress, lineId) => progress.upgrades?.[lineId] ?? 0;

/**
 * Tier realmente instalado no drone agora.
 *
 * Comprar e EQUIPAR são coisas diferentes, e é essa separação que faz o
 * trade-off existir de verdade: dá pra tirar a antena tier 3 antes de uma
 * corrida porque o arrasto dela custa velocidade de ponta. Sem poder
 * desequipar, um upgrade com desvantagem viraria arrependimento permanente e o
 * jogador simplesmente não compraria.
 */
export function equippedTier(progress, lineId) {
  const owned = ownedTier(progress, lineId);
  const equipped = progress.equipped?.[lineId];
  return Math.min(equipped ?? owned, owned);
}

export function setEquipped(save, lineId, tier) {
  const owned = ownedTier(save.progress, lineId);
  save.progress.equipped = save.progress.equipped ?? {};
  save.progress.equipped[lineId] = Math.max(0, Math.min(tier, owned));
  save.write();
  return save.progress.equipped[lineId];
}

/**
 * Combina chassis + upgrades num único conjunto de escalas.
 * Multiplicativo e não aditivo: assim dois upgrades de +20% dão +44% e não
 * +40%, e nenhuma combinação consegue zerar um multiplicador por acidente.
 */
export function computeSpec(progress) {
  const spec = neutralSpec();
  const chassis = CHASSIS.find((c) => c.id === progress.chassis) ?? CHASSIS[1];
  for (const [key, value] of Object.entries(chassis.spec)) spec[key] *= value;

  for (const line of UPGRADES) {
    // Só o tier EQUIPADO vale. Os anteriores não se somam: o tier 3 já é o
    // valor final da linha, senão a curva viraria a soma dos três.
    const tier = equippedTier(progress, line.id);
    if (tier > 0) {
      for (const [key, value] of Object.entries(line.tiers[tier - 1].spec)) spec[key] *= value;
    }
  }
  return { ...spec, chassis };
}

/** Valores absolutos derivados das escalas — o que a HUD e o hangar mostram. */
export function describeSpec(spec) {
  return {
    empuxo: +(CONFIG.DRONE.thrustToWeight * spec.thrustScale).toFixed(2),
    peso: +(CONFIG.DRONE.massKg * spec.massScale).toFixed(2),
    giro: Math.round(CONFIG.DRONE.rates.roll * spec.rateScale),
    bateria: Math.round(CONFIG.BATTERY.capacity * spec.batteryScale),
    alcance: Math.round(CONFIG.RADIO.range * spec.radioScale),
    consumo: +(CONFIG.BATTERY.throttleDrain * spec.drainScale).toFixed(2),
    vento: +spec.windScale.toFixed(2),
    zoom: +spec.zoom.toFixed(2),
  };
}

/** Preço do próximo tier de uma linha, ou null se já está no máximo. */
export function nextTierPrice(progress, lineId) {
  const line = UPGRADES.find((l) => l.id === lineId);
  const tier = progress.upgrades?.[lineId] ?? 0;
  return tier >= line.tiers.length ? null : line.tiers[tier].price;
}

export function buyUpgrade(save, lineId) {
  const progress = save.progress;
  const price = nextTierPrice(progress, lineId);
  if (price == null || progress.credits < price) return false;
  progress.credits -= price;
  progress.upgrades[lineId] = ownedTier(progress, lineId) + 1;
  // Comprar já equipa — ninguém compra pra deixar na prateleira. Desequipar
  // continua sendo uma escolha explícita no hangar.
  progress.equipped = progress.equipped ?? {};
  progress.equipped[lineId] = progress.upgrades[lineId];
  save.write();
  return true;
}

export function buyChassis(save, chassisId) {
  const chassis = CHASSIS.find((c) => c.id === chassisId);
  const progress = save.progress;
  if (!chassis) return false;
  if (progress.unlockedChassis.includes(chassisId)) {
    progress.chassis = chassisId;
    save.write();
    return true;
  }
  if (progress.credits < chassis.price) return false;
  progress.credits -= chassis.price;
  progress.unlockedChassis.push(chassisId);
  progress.chassis = chassisId;
  save.write();
  return true;
}

/** Presets: guardam chassis + tiers pra alternar entre builds sem recomprar. */
export function saveBuild(save, name) {
  save.progress.builds[name] = {
    chassis: save.progress.chassis,
    equipped: Object.fromEntries(UPGRADES.map((l) => [l.id, equippedTier(save.progress, l.id)])),
  };
  save.write();
}

export function loadBuild(save, name) {
  const build = save.progress.builds[name];
  if (!build) return false;
  // O preset é um atalho pra reconfigurar, não uma brecha: só aplica chassis
  // desbloqueado e tiers que já foram comprados.
  if (save.progress.unlockedChassis.includes(build.chassis)) {
    save.progress.chassis = build.chassis;
  }
  for (const [lineId, tier] of Object.entries(build.equipped ?? {})) {
    setEquipped(save, lineId, tier);
  }
  save.write();
  return true;
}
