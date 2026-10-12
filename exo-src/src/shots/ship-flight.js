/**
 * Presets do sistema SHIP (dono: ship) — nave, cockpit e combate. Só dados.
 * `params.ship` controla o estado visual da nave (ver src/features/ship/index.js);
 * `params.combat` encena o combate (ver src/features/combat/index.js).
 */
export default [
  {
    name: 'ship-cockpit-low',
    owner: 'ship',
    desc: 'Cockpit em 1ª pessoa voando baixo (~60 m) sobre o bioma exuberante: painéis, manche, telas emissivas, radar holográfico e HUD diegético no vidro',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    view: 'first',
    cockpit: true,
    camera: { lat: 6.5, lon: 27.62, alt: 38, heading: 168, pitch: -5, fov: 74 },
    timeOfDay: 0.43,
    weather: 'clear',
    params: { ship: { state: 'flying', throttle: 0.62, speed: 168 }, combat: { scene: 'escort' } },
  },
  {
    name: 'ship-reentry',
    owner: 'ship',
    desc: 'Reentrada atmosférica em 3ª pessoa: onda de choque de plasma, bordas do casco incandescentes, cauda de fogo e faíscas, planeta abaixo',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    view: 'third',
    cockpit: false,
    camera: { lat: 9, lon: 30, alt: 7500, heading: 80, pitch: -24, fov: 60 },
    timeOfDay: 0.36,
    weather: 'clear',
    params: { ship: { state: 'flying', throttle: 0.9, heat: 1, speed: 1400, cam: { az: 205, el: 22, dist: 36, look: [0, 0, -6] } } },
  },
  {
    name: 'ship-dogfight',
    owner: 'ship',
    desc: 'Combate no espaço em 3ª pessoa: lasers, foguetes, naves hostis, asteroides e explosão, planeta e atmosfera ao fundo',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'space',
    view: 'third',
    cockpit: false,
    camera: { lat: 5, lon: 40, alt: 26000, heading: 95, pitch: { horizon: 4 }, fov: 62 },
    timeOfDay: 0.62,
    weather: 'clear',
    params: { ship: { state: 'space', throttle: 1, speed: 900, cam: { az: 205, el: 9, dist: 30, look: [0, 1.5, -10] } }, combat: { scene: 'dogfight' } },
  },
  {
    name: 'ship-landed',
    owner: 'ship',
    desc: 'A pé, olhando a nave pousada a ~17 m: trem baixado, casco com painéis e desgaste, motores em marcha lenta',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'walk',
    view: 'first',
    camera: { lat: 6.48, lon: 27.6, alt: 1.7, heading: 150, pitch: 3, fov: 62 },
    timeOfDay: 0.42,
    weather: 'clear',
    params: { ship: { state: 'landed', idle: true, place: { dist: 18, bearing: 30, heading: -145 } } },
  },
];
