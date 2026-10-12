/** Preset do sistema UNIVERSE: o túnel do salto de warp (fase congelada). Só dados. */
export default {
  name: 'universe-warp',
  owner: 'universe',
  desc: 'Salto por warp: túnel de plasma tingido pela estrela de destino, riscos de estrelas, núcleo brilhante',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'space',
  cockpit: false,
  camera: { lat: 5, lon: 40, alt: 400000, heading: 0, pitch: 0, fov: 70 },
  timeOfDay: 0.42,
  weather: 'clear',
  params: { uniWarp: 0.5, renderExposure: 1.0, uniCam: { body: 'p0', dist: 3.4, az: 100, el: 10, look: 'p0', yaw: 0, pitch: 0 } },
};
