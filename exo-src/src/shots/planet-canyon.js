/** Preset do sistema planet: cânions e mesas em degraus num mundo escaldante (só dados). */
export default {
  name: 'planet-canyon',
  owner: 'planet',
  desc: 'Nave a 90 m sobre a borda de um cânion de ~1 km com paredes em terraço e mesas, bioma escaldante',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'ship',
  view: 'first',
  cockpit: false,
  camera: { lat: -7.9916, lon: -68.4404, alt: 90, heading: 180, pitch: -14, fov: 70 },
  timeOfDay: 0.36,
  weather: 'clear',
  params: { biome: 'scorched', atmoBiome: 'scorched', terrainSeed: 7001, radius: 110000 },
};
