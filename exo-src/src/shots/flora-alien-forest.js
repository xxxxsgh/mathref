/** Preset do sistema flora: floresta alienígena de fungos gigantes, cristais e tentáculos luminosos sobre grama magenta (só dados). */
export default {
  name: 'flora-alien-forest',
  owner: 'flora',
  desc: 'A pé num mundo exótico: fungos gigantes com lamelas luminosas, aglomerados de cristal, tentáculos com bulbos e grama magenta densa',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: 15.16442, lon: -131.81776, alt: 1.7, heading: 315, pitch: 8, fov: 72 },
  timeOfDay: 0.4,
  weather: 'clear',
  params: { biome: 'exotic', atmoBiome: 'lush', terrainSeed: 5150, radius: 110000, cloudCoverage: 0.25 },
};
