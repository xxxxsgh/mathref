/** Preset do sistema render: linha de costa num mundo exuberante — água, espuma, reflexo e cáusticas (só dados). */
export default {
  name: 'render-coast',
  owner: 'render',
  desc: 'A pé na praia de um mar raso e claro: espuma na linha de costa, refração do leito com cáusticas, reflexo do céu e das colinas, brilho do sol na água',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: 6.48, lon: 27.6, alt: 1.7, heading: 110, pitch: -6, fov: 70 },
  timeOfDay: 0.36,
  weather: 'clear',
  params: {},
};
