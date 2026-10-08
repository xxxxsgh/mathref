/**
 * Presets de screenshot do sistema ATMOSFERA (dono: atmosphere). Só dados.
 * Os parâmetros `atmo*` em `params` forçam o tipo de céu para a vitrine
 * (ver src/features/atmosphere/index.js); sem eles, o céu vem da seed/bioma.
 */
export default [
  {
    name: 'atmo-dawn',
    owner: 'atmosphere',
    desc: 'Amanhecer num mundo exótico de céu rosa: sol nascendo, estrela companheira (binária), lua crescente gigante ao lado do sol',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    cockpit: false,
    camera: {
      lat: 45.6, lon: -83.1, alt: 70, pitch: 9, fov: 72,
      anchor: { body: 'moon', elevation: 15, azimuth: 345 },
      look: { body: 'sun', offset: 25 },
    },
    timeOfDay: 0.292,
    weather: 'clear',
    params: { atmoBiome: 'exotic', atmoCompanion: { az: -11, el: 6, temperature: 3300, intensity: 0.5, size: 1.0 } },
  },
  {
    name: 'atmo-night-aurora',
    owner: 'atmosphere',
    desc: 'Noite num planeta gelado: aurora em cortinas, via láctea/nebulosa da galáxia, lua quase cheia iluminando o chão',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    cockpit: false,
    camera: {
      lat: 25, lon: -22, alt: 60, pitch: 14, fov: 78,
      anchor: { body: 'moon', elevation: 20, azimuth: 45 },
      look: { body: 'moon', offset: -30 },
    },
    timeOfDay: 0.02,
    weather: 'clear',
    params: { atmoBiome: 'frozen', atmoAurora: 1.1 },
  },
  {
    name: 'atmo-limb',
    owner: 'atmosphere',
    desc: 'Limbo do planeta visto de 60 km: camadas da atmosfera contra o espaço, terminador com nascer do sol, lua gigante',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'space',
    cockpit: false,
    camera: {
      lat: 5, lon: 40, alt: 60000, fov: 60,
      pitch: { horizon: 4 },
      look: { body: 'sun', offset: -16 },
    },
    timeOfDay: 0.125,
    weather: 'clear',
    params: {},
  },
  {
    name: 'atmo-haze',
    owner: 'atmosphere',
    desc: 'Perspectiva aérea: nave a 2,5 km sobre um mundo tóxico de céu verde, a névoa engolindo o horizonte',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    cockpit: false,
    camera: { lat: 10, lon: 20, alt: 2500, heading: 250, pitch: -6, fov: 70 },
    timeOfDay: 0.4,
    weather: 'clear',
    params: { atmoBiome: 'toxic' },
  },
  {
    name: 'atmo-amber-noon',
    owner: 'atmosphere',
    desc: 'Tarde num mundo queimado de poeira âmbar, sol alto com halo largo, lua lavada pelo céu',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'walk',
    camera: {
      lat: 12, lon: 24, alt: 1.7, pitch: 10, fov: 70,
      anchor: { body: 'moon', elevation: 16, azimuth: 70 },
      look: { body: 'moon', offset: -20 },
    },
    timeOfDay: 0.62,
    weather: 'clear',
    params: { atmoBiome: 'scorched' },
  },
];
