// Elencos fictícios. Atributos 1–99:
//   vel = Velocidade, dri = Drible, pas = Passe, fin = Finalização,
//   mar = Marcação, ref = Reflexo (goleiros), fri = Frieza
// `artista`: conduz a 90% da velocidade (e não 85%) — seção D1.
// `pe`: perna preferida ('D' direita, 'E' esquerda) — seções F5 e G5.

export const TEAMS = [
  {
    id: 'vila',
    name: 'Vila Esperança',
    short: 'VIL',
    colors: { shirt: '#e8b923', shorts: '#1d3557', socks: '#e8b923', gk: '#2a9d8f', trim: '#1d3557' },
    roster: [
      { num: 1, name: 'Paredão', role: 'GOL', vel: 55, dri: 30, pas: 55, fin: 20, mar: 50, ref: 84, fri: 75, pe: 'D' },
      { num: 4, name: 'Tião', role: 'FIXO', vel: 64, dri: 58, pas: 78, fin: 60, mar: 84, ref: 10, fri: 80, pe: 'D' },
      { num: 7, name: 'Kaká Jr.', role: 'ALA', vel: 82, dri: 86, pas: 72, fin: 70, mar: 48, ref: 10, fri: 60, pe: 'E', artista: true },
      { num: 8, name: 'Neném', role: 'ALA', vel: 76, dri: 72, pas: 80, fin: 66, mar: 62, ref: 10, fri: 70, pe: 'D' },
      { num: 9, name: 'Tanque', role: 'PIVO', vel: 66, dri: 64, pas: 62, fin: 86, mar: 55, ref: 10, fri: 82, pe: 'D' },
      { num: 12, name: 'Bigode', role: 'GOL', vel: 50, dri: 25, pas: 50, fin: 15, mar: 45, ref: 72, fri: 70, pe: 'D' },
      { num: 10, name: 'Falcãozinho', role: 'ALA', vel: 78, dri: 90, pas: 76, fin: 78, mar: 40, ref: 10, fri: 66, pe: 'E', artista: true },
      { num: 5, name: 'Muralha', role: 'FIXO', vel: 60, dri: 50, pas: 70, fin: 55, mar: 80, ref: 10, fri: 74, pe: 'D' },
      { num: 11, name: 'Foguete', role: 'PIVO', vel: 88, dri: 68, pas: 58, fin: 74, mar: 44, ref: 10, fri: 55, pe: 'D' },
    ],
  },
  {
    id: 'morro',
    name: 'Unidos do Morro',
    short: 'UDM',
    colors: { shirt: '#c1121f', shorts: '#f1faee', socks: '#c1121f', gk: '#6a4c93', trim: '#f1faee' },
    roster: [
      { num: 1, name: 'Gato', role: 'GOL', vel: 60, dri: 35, pas: 60, fin: 20, mar: 50, ref: 80, fri: 70, pe: 'E' },
      { num: 3, name: 'Xerife', role: 'FIXO', vel: 62, dri: 55, pas: 74, fin: 58, mar: 88, ref: 10, fri: 84, pe: 'D' },
      { num: 6, name: 'Pipoca', role: 'ALA', vel: 86, dri: 80, pas: 68, fin: 66, mar: 52, ref: 10, fri: 58, pe: 'D', artista: true },
      { num: 8, name: 'Maestro', role: 'ALA', vel: 70, dri: 76, pas: 88, fin: 64, mar: 60, ref: 10, fri: 78, pe: 'E' },
      { num: 9, name: 'Canhão', role: 'PIVO', vel: 68, dri: 60, pas: 60, fin: 90, mar: 50, ref: 10, fri: 76, pe: 'D' },
      { num: 12, name: 'Mãozinha', role: 'GOL', vel: 52, dri: 28, pas: 52, fin: 15, mar: 44, ref: 70, fri: 66, pe: 'D' },
      { num: 7, name: 'Ligeirinho', role: 'ALA', vel: 90, dri: 74, pas: 64, fin: 68, mar: 46, ref: 10, fri: 52, pe: 'D' },
      { num: 4, name: 'Rochedo', role: 'FIXO', vel: 58, dri: 48, pas: 68, fin: 52, mar: 82, ref: 10, fri: 80, pe: 'E' },
      { num: 10, name: 'Mágico', role: 'PIVO', vel: 74, dri: 88, pas: 74, fin: 80, mar: 42, ref: 10, fri: 64, pe: 'E', artista: true },
    ],
  },
  {
    id: 'porto',
    name: 'Atlético do Porto',
    short: 'ATP',
    colors: { shirt: '#0a7cc4', shorts: '#ffffff', socks: '#0a7cc4', gk: '#f77f00', trim: '#ffffff' },
    roster: [
      { num: 1, name: 'Polvo', role: 'GOL', vel: 56, dri: 30, pas: 58, fin: 20, mar: 48, ref: 88, fri: 80, pe: 'D' },
      { num: 2, name: 'Âncora', role: 'FIXO', vel: 66, dri: 60, pas: 82, fin: 62, mar: 80, ref: 10, fri: 78, pe: 'D' },
      { num: 7, name: 'Gaivota', role: 'ALA', vel: 84, dri: 78, pas: 70, fin: 68, mar: 56, ref: 10, fri: 62, pe: 'D' },
      { num: 11, name: 'Marujo', role: 'ALA', vel: 78, dri: 82, pas: 76, fin: 70, mar: 50, ref: 10, fri: 68, pe: 'E', artista: true },
      { num: 9, name: 'Farol', role: 'PIVO', vel: 70, dri: 66, pas: 66, fin: 84, mar: 58, ref: 10, fri: 86, pe: 'E' },
      { num: 12, name: 'Coral', role: 'GOL', vel: 50, dri: 26, pas: 50, fin: 15, mar: 44, ref: 70, fri: 68, pe: 'D' },
      { num: 8, name: 'Maré', role: 'ALA', vel: 80, dri: 70, pas: 74, fin: 64, mar: 58, ref: 10, fri: 64, pe: 'D' },
      { num: 5, name: 'Casco', role: 'FIXO', vel: 60, dri: 52, pas: 70, fin: 54, mar: 82, ref: 10, fri: 76, pe: 'D' },
      { num: 10, name: 'Leme', role: 'PIVO', vel: 72, dri: 76, pas: 72, fin: 78, mar: 46, ref: 10, fri: 70, pe: 'D' },
    ],
  },
];

/** Os 5 primeiros do elenco começam; os 4 seguintes ficam no banco. */
export const STARTERS = 5;
