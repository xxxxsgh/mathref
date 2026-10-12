/**
 * Presets de screenshot das NUVENS e do CLIMA (dono: clouds/weather). Só dados.
 *
 * params:
 *   cloudCoverage 0..1, cloudType −1..1 (estrato … cumulonimbo), cloudBase/cloudTop (m),
 *   cloudFrames (frames de acumulação temporal antes do "pronto"),
 *   weatherBolt { az (graus relativos ao rumo da câmera), dist (m), flash 0..1 } — relâmpago fixo
 */
export default [
  {
    name: 'clouds-above',
    owner: 'clouds',
    desc: 'Nave a ~6 km sobre um mar de nuvens: topos de cúmulos iluminados de lado pelo sol baixo do fim de tarde, sombras entre as torres, cirros acima e o horizonte curvo sumindo na atmosfera',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    view: 'first',
    cockpit: false,
    camera: { lat: 12, lon: 24, alt: 6400, pitch: -4, fov: 70, look: { body: 'sun', offset: -105 } },
    timeOfDay: 0.69,
    weather: 'clear',
    params: { cloudCoverage: 0.56, cloudType: 0.1 },
  },
  {
    name: 'clouds-inside',
    owner: 'clouds',
    desc: 'Atravessando a camada: a nave entre torres de cúmulos a ~3,5 km do chão, fiapos passando perto, vales de luz entre as nuvens e o chão aparecendo por baixo',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    view: 'first',
    cockpit: false,
    camera: { lat: 12, lon: 24, alt: 3500, pitch: 3, fov: 72, look: { body: 'sun', offset: -55 } },
    timeOfDay: 0.62,
    weather: 'clear',
    params: { cloudCoverage: 0.66, cloudType: 0.25 },
  },
  {
    name: 'weather-storm',
    owner: 'weather',
    desc: 'Voo baixo sob uma tempestade num mundo exuberante: teto de cumulonimbos escuro com relevo, cortinas de chuva, relâmpago iluminando as nuvens por dentro, gotas no canopi',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    view: 'first',
    cockpit: false,
    camera: { lat: 12, lon: 24, alt: 320, pitch: 7, fov: 72, look: { body: 'sun', offset: 150 } },
    timeOfDay: 0.55,
    weather: 'storm',
    params: { weatherBolt: { az: -18, dist: 4200, flash: 1 }, renderEV: -0.5 },
  },
  {
    name: 'weather-blizzard',
    owner: 'weather',
    desc: 'Nevasca num planeta congelado: neve soprada pelo vento, montanhas sumindo no branco, céu de estratos baixos, gelo no visor',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'walk',
    camera: { lat: -29.3225, lon: 109.661, alt: 1.7, heading: 60, pitch: 4, fov: 70 },
    timeOfDay: 0.42,
    weather: 'blizzard',
    params: { biome: 'frozen', atmoBiome: 'frozen', terrainSeed: 3303, radius: 110000 },
  },
];
