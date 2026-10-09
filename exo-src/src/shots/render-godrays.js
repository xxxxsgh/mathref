/** Preset do sistema render: raios crepusculares do sol baixo atrás do relevo (só dados). */
export default {
  name: 'render-godrays',
  owner: 'render',
  desc: 'Fim de tarde: sol baixo parcialmente encoberto pelo relevo, raios volumétricos em espaço de tela, bloom e exposição automática',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: -8, lon: 63, alt: 1.7, pitch: 4, fov: 70, look: { body: 'sun', offset: 0 } },
  timeOfDay: 0.738,
  weather: 'clear',
  params: {},
};
