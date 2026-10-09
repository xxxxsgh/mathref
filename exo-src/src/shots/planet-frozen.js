/** Preset do sistema planet: cordilheira gelada (só dados). */
export default {
  name: 'planet-frozen',
  owner: 'planet',
  desc: 'A pé num planalto congelado olhando uma cordilheira de ~3 km (ridged multifractal + erosão), neve e rocha azulada',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: -29.3225, lon: 109.661, alt: 1.7, heading: 60, pitch: 2, fov: 70 },
  timeOfDay: 0.38,
  weather: 'clear',
  params: { biome: 'frozen', atmoBiome: 'frozen', terrainSeed: 3303, radius: 110000 },
};
