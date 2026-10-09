// Estilos visuais por facção: paleta PBR (linear), comportamento da pintura
// (remendos, listras de perigo, "dentes", circuitos luminosos), cor de motor,
// forma (expoente das seções, agressividade) e nomes de modelos por classe.

export const FACTION_STYLES = {
  hegemonia: {
    label: 'Hegemonia Solar',
    primary: [0.66, 0.66, 0.645], secondary: [0.045, 0.06, 0.09], trim: [1.0, 0.70, 0.30],
    metal: [0.62, 0.62, 0.64], dark: [0.05, 0.055, 0.065], glow: [1.0, 0.72, 0.32],
    paint: { metal: 0.04, rough: 0.3, clearcoat: 0.6 },
    wear: 0.06, patch: 0, hazard: 0, teeth: 0, circuits: 0, iridescence: 0,
    engine: [0.55, 0.72, 1.0], canopy: [0.55, 0.42, 0.18],
    nav: { left: [1.0, 0.08, 0.04], right: [0.1, 1.0, 0.3], strobe: [1, 1, 1] },
    shape: { e: 2.6, sharp: 0.2, asym: 0 },
    decal: 'HS',
  },
  frente: {
    label: 'Frente Livre',
    primary: [0.36, 0.35, 0.31], secondary: [0.75, 0.22, 0.05], trim: [0.55, 0.33, 0.18],
    metal: [0.5, 0.48, 0.45], dark: [0.07, 0.065, 0.06], glow: [1.0, 0.45, 0.15],
    paint: { metal: 0.1, rough: 0.58, clearcoat: 0.0 },
    wear: 0.8, patch: 0.55, hazard: 0, teeth: 0, circuits: 0, iridescence: 0,
    engine: [1.0, 0.55, 0.28], canopy: [0.2, 0.22, 0.2],
    nav: { left: [1.0, 0.15, 0.05], right: [0.2, 1.0, 0.25], strobe: [1, 0.9, 0.7] },
    shape: { e: 3.2, sharp: 0.4, asym: 1 },
    decal: 'FL',
  },
  corsarios: {
    label: 'Corsários do Vazio',
    primary: [0.045, 0.045, 0.05], secondary: [0.42, 0.03, 0.12], trim: [0.32, 0.31, 0.33],
    metal: [0.35, 0.34, 0.36], dark: [0.02, 0.02, 0.025], glow: [1.0, 0.12, 0.45],
    paint: { metal: 0.45, rough: 0.38, clearcoat: 0.25 },
    wear: 0.45, patch: 0.08, hazard: 0, teeth: 1, circuits: 0, iridescence: 0,
    engine: [1.0, 0.25, 0.45], canopy: [0.35, 0.05, 0.1],
    nav: { left: [1.0, 0.05, 0.2], right: [1.0, 0.05, 0.2], strobe: [1, 0.2, 0.4] },
    shape: { e: 5.5, sharp: 1, asym: 0.3 },
    decal: 'CV',
  },
  guilda: {
    label: 'Guilda dos Mercadores',
    primary: [0.62, 0.62, 0.58], secondary: [0.95, 0.62, 0.04], trim: [0.08, 0.45, 0.42],
    metal: [0.55, 0.55, 0.55], dark: [0.06, 0.065, 0.07], glow: [0.35, 1.0, 0.85],
    paint: { metal: 0.08, rough: 0.5, clearcoat: 0.15 },
    wear: 0.35, patch: 0.05, hazard: 1, teeth: 0, circuits: 0, iridescence: 0,
    engine: [0.45, 1.0, 0.9], canopy: [0.08, 0.3, 0.3],
    nav: { left: [1.0, 0.1, 0.05], right: [0.15, 1.0, 0.3], strobe: [1.0, 0.75, 0.2] },
    shape: { e: 4.5, sharp: 0.3, asym: 0 },
    decal: 'GM',
  },
  vigilantes: {
    label: 'Os Vigilantes',
    primary: [0.075, 0.085, 0.11], secondary: [0.12, 0.17, 0.26], trim: [0.62, 0.74, 0.9],
    metal: [0.45, 0.55, 0.65], dark: [0.015, 0.018, 0.028], glow: [0.4, 0.75, 1.0],
    paint: { metal: 0.85, rough: 0.2, clearcoat: 1.0 },
    wear: 0, patch: 0, hazard: 0, teeth: 0, circuits: 1, iridescence: 1,
    engine: [0.45, 0.8, 1.0], canopy: [0.1, 0.3, 0.6],
    nav: { left: [0.4, 0.75, 1.0], right: [0.4, 0.75, 1.0], strobe: [0.7, 0.9, 1.0] },
    shape: { e: 2, sharp: 1, asym: 0 },
    decal: '',
  },
};

export const CLASS_INFO = {
  fighter: { label: 'Caça leve', size: 16 },
  interceptor: { label: 'Interceptador', size: 19 },
  freighter: { label: 'Cargueiro', size: 46 },
  explorer: { label: 'Explorador de longo alcance', size: 38 },
  frigate: { label: 'Fragata', size: 130 },
  destroyer: { label: 'Destróier', size: 560 },
  carrier: { label: 'Porta-caças', size: 760 },
};

/** Nomes de modelo (fictícios) por facção × classe. */
export const MODEL_NAMES = {
  hegemonia: { fighter: 'Lança A-7', interceptor: 'Falcão Áureo', freighter: 'Tributo C-40', explorer: 'Horizonte', frigate: 'Juramento', destroyer: 'Soberana', carrier: 'Coroa Solar' },
  frente: { fighter: 'Pardal', interceptor: 'Faísca', freighter: 'Mula Velha', explorer: 'Errante', frigate: 'Liberdade', destroyer: 'Insurgente', carrier: 'Colmeia' },
  corsarios: { fighter: 'Navalha', interceptor: 'Presa', freighter: 'Abutre', explorer: 'Sombra', frigate: 'Carniceira', destroyer: 'Leviatã', carrier: 'Ninho' },
  guilda: { fighter: 'Guardião', interceptor: 'Mensageiro', freighter: 'Caravela', explorer: 'Cartógrafo', frigate: 'Balança', destroyer: 'Tesouraria', carrier: 'Entreposto' },
  vigilantes: { fighter: 'Sentinela', interceptor: 'Agulha', freighter: 'Relicário', explorer: 'Observador', frigate: 'Arauto', destroyer: 'Guardiã', carrier: 'Matriz' },
};

export const FACTION_IDS = Object.keys(FACTION_STYLES);
export const CLASS_IDS = Object.keys(CLASS_INFO);

/** Pinturas alternativas (customização do jogador): sobrescrevem a paleta. */
export const PAINTS = {
  padrao: null,
  desertor: { primary: [0.2, 0.21, 0.22], secondary: [0.75, 0.22, 0.05], trim: [0.85, 0.6, 0.28] },
  meia_noite: { primary: [0.03, 0.035, 0.05], secondary: [0.2, 0.35, 0.7], trim: [0.7, 0.72, 0.75] },
  areia: { primary: [0.62, 0.5, 0.34], secondary: [0.3, 0.2, 0.12], trim: [0.35, 0.33, 0.3] },
  gelo: { primary: [0.75, 0.82, 0.88], secondary: [0.12, 0.35, 0.55], trim: [0.85, 0.85, 0.9] },
  carmim: { primary: [0.5, 0.04, 0.04], secondary: [0.06, 0.06, 0.07], trim: [0.9, 0.75, 0.4] },
};
