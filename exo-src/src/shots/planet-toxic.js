/** Preset do sistema planet: costa de um mar ácido num mundo tóxico (só dados). */
export default {
  name: 'planet-toxic',
  owner: 'planet',
  desc: 'A pé na costa de um mar ácido, colinas arredondadas amarelo-esverdeadas e rocha roxa, bioma tóxico',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: -3.5093, lon: 70.3653, alt: 1.7, heading: 180, pitch: 3, fov: 70 },
  timeOfDay: 0.42,
  weather: 'clear',
  params: { biome: 'toxic', atmoBiome: 'toxic', terrainSeed: 9090, radius: 110000 },
};
