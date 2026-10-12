/**
 * Presets do sistema UNIVERSE (dono: universe). Só dados.
 * `params.uniCam` posiciona a câmera em relação a um corpo do sistema
 * (ver src/features/universe/index.js).
 */
export default [
  {
    name: 'universe-system',
    owner: 'universe',
    desc: 'Do espaço: gigante gasoso anelado do sistema inicial dentro do seu halo de asteroides, estrela, planetas e luas vizinhos',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'space',
    cockpit: false,
    camera: { lat: 5, lon: 40, alt: 400000, heading: 0, pitch: 0, fov: 62 },
    timeOfDay: 0.42,
    weather: 'clear',
    params: { uniCam: { body: 'p2', dist: 4.3, az: 55, el: 14, look: 'p2', yaw: 16, pitch: -3 } },
  },
  {
    name: 'universe-station',
    owner: 'universe',
    desc: 'Estação espacial em órbita do planeta inicial, com o planeta e a atmosfera ao fundo e o halo de detritos',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'space',
    cockpit: false,
    camera: { lat: 5, lon: 40, alt: 200000, heading: 0, pitch: 0, fov: 60 },
    timeOfDay: 0.42,
    weather: 'clear',
    params: { uniCam: { body: 'station', distM: 2600, az: 70, el: 18, look: 'station', yaw: 8, pitch: 4 } },
  },
];
