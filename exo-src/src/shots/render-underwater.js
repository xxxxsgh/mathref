/** Preset do sistema render: sob a água perto da costa — névoa espectral, superfície vista por baixo (só dados). */
export default {
  name: 'render-underwater',
  owner: 'render',
  desc: 'Mergulhado a poucos metros, olhando de volta para a praia: absorção espectral, superfície por baixo (janela de Snell), raios do leito',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'walk',
  camera: { lat: 6.47, lon: 27.636, alt: 1.7, heading: 275, pitch: 8, fov: 72 },
  timeOfDay: 0.4,
  weather: 'clear',
  params: {},
};
