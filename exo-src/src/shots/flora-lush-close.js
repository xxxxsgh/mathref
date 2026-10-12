/** Preset do sistema flora: tapete de grama denso, flores, samambaias e árvores de folha larga num mundo exuberante (só dados). */
export default {
  name: 'flora-lush-close',
  owner: 'flora',
  desc: 'A pé, olhos a 1,7 m, no meio de um campo de grama densa com flores e samambaias, árvores de folha larga e palmeiras ao redor, sol da manhã de lado',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: 12.2, lon: 22.6, alt: 1.7, heading: 60, pitch: 2, fov: 70 },
  timeOfDay: 0.4,
  weather: 'clear',
  params: { biome: 'lush', atmoBiome: 'lush', terrainSeed: 4242, radius: 110000 },
};
