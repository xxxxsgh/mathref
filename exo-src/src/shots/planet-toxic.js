/** Preset do sistema planet: costa de um mar ácido num mundo tóxico (só dados). */
export default {
  name: 'planet-toxic',
  owner: 'planet',
  desc: 'A pé na costa de um mar ácido, lago de ~600 m, colinas arredondadas amarelo-esverdeadas, rocha roxa, arcos e rochas suspensas ao fundo, bioma tóxico',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: -3.84615, lon: 70.51538, alt: 1.7, heading: 232, pitch: 3, fov: 72 },
  timeOfDay: 0.42,
  weather: 'clear',
  params: { biome: 'toxic', atmoBiome: 'toxic', terrainSeed: 9090, radius: 110000 },
};
