/** Preset do sistema UNIVERSE: mapa galáctico 3D aberto, com um destino selecionado e a rota. Só dados. */
export default {
  name: 'universe-galaxymap',
  owner: 'universe',
  desc: 'Mapa galáctico: braços espirais e núcleo brilhante ao fundo, estrelas locais com cores espectrais, seleção, rota e alcance do salto',
  seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
  mode: 'space',
  cockpit: false,
  camera: { lat: 5, lon: 40, alt: 400000, heading: 0, pitch: 0, fov: 70 },
  timeOfDay: 0.42,
  weather: 'clear',
  params: { mapOpen: true, mapSelect: 'auto', mapFocusMid: true, mapShift: [190, 0], mapFocusToward: 0.62, mapCam: { yaw: 'core', coreYaw: 0.35, pitch: 0.9, dist: 46000 }, renderExposure: 1.0 },
};
