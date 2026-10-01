// Planta da ilha: onde fica cada coisa. Centralizado aqui para que terreno,
// vegetação, ruínas, câmera de screenshot e bússola concordem.
//
// Convenção: +X = leste, -Z = norte (a bússola usa isso). O sol nasce no leste
// e se põe no oeste; no fim de tarde ele fica a oeste-sudoeste.

export const WORLD_SIZE = 1200; // metros, de -600 a +600
export const GRID_SEG = 300; // células por lado → 4 m por célula
export const CELL = WORLD_SIZE / GRID_SEG;
export const HALF = WORLD_SIZE / 2;
export const ISLAND_R = 455;

export const SEA_LEVEL = 0;
export const LAKE = { x: 165, z: 25, r: 72, level: 5.2 };

/** Colina principal, com o arco no platô do topo. */
export const HILL = { x: -150, z: -165, r: 125, h: 54, plateauR: 20 };
/** Serra secundária a nordeste. */
export const RIDGE = { x: 230, z: -230, r: 110, h: 34 };
/** Colina baixa a sudoeste (mirante da praia). */
export const KNOLL = { x: -250, z: 230, r: 70, h: 18 };

export const FOREST = { x: -255, z: 40, r: 120 };

/** Onde o herói nasce (olhando para noroeste: colina, arco e ilha flutuante). */
export const SPAWN = { x: 15, z: 150, yaw: -0.85 };

/** Ruínas: o arco no topo da colina e um anel de colunas na margem do lago. */
export const RUINS = {
  arch: { x: HILL.x, z: HILL.z, rot: 0.55 },
  ring: { x: 88, z: 58, r: 9 },
  // Colunas isoladas espalhadas pelo campo (marcos do caminho antigo).
  lone: [
    { x: -40, z: 40, h: 4.5, broken: true },
    { x: -95, z: -60, h: 6.5, broken: false },
    { x: 60, z: -60, h: 3.2, broken: true },
    { x: -330, z: -40, h: 5.0, broken: true },
  ],
};

/** Caminho de terra antigo: spawn → colunas → colina; ramal até o lago. */
export const PATHS = [
  [
    [15, 175], [0, 110], [-40, 40], [-95, -60], [-128, -128], [HILL.x + 6, HILL.z + 12],
  ],
  [
    [-40, 40], [20, 45], [88, 58],
  ],
];

/** Zonas sem grama alta e com chão de pedra (plataformas das ruínas). */
export const CLEARINGS = [
  { x: RUINS.arch.x, z: RUINS.arch.z, r: 10 },
  { x: RUINS.ring.x, z: RUINS.ring.z, r: 12.5 },
];

/** As três ilhas flutuantes (ainda sem acesso). */
export const SKY_ISLANDS = [
  { x: -330, z: -390, y: 205, r: 62, seed: 11 },
  { x: 390, z: -250, y: 255, r: 48, seed: 23 },
  { x: -470, z: 260, y: 170, r: 38, seed: 37 },
];

/** Pontos de interesse marcados na bússola. */
export const LANDMARKS = [
  { name: 'Arco', x: RUINS.arch.x, z: RUINS.arch.z, icon: '◆' },
  { name: 'Lago', x: LAKE.x, z: LAKE.z, icon: '●' },
];
