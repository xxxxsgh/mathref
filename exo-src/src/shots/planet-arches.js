/** Preset do sistema planet: arcos de rocha, arcos flutuantes e rochas suspensas num mundo exótico (só dados). */
export default {
  name: 'planet-arches',
  owner: 'planet',
  desc: 'A pé num vale exótico (vegetação magenta, rocha turquesa) diante de um arco natural gigante (~200 m de vão) com uma cordilheira atrás, arcos flutuantes e rochas suspensas',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: 15.47694, lon: -131.84474, alt: 1.7, heading: 143, pitch: 8, fov: 72 },
  timeOfDay: 0.42,
  weather: 'clear',
  params: { biome: 'exotic', atmoBiome: 'exotic', terrainSeed: 5150, radius: 110000 },
};
