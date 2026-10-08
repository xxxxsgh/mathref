/**
 * Presets CANÔNICOS de screenshot — dono: integração.
 * Só dados (lidos também em node por tools/shot.mjs --all). Ver o formato em
 * src/core/ShotPresets.js e no CONTRACT.md. Os donos de sistemas criam os
 * próprios arquivos em src/shots/<sistema>.js; ESTE arquivo só a integração edita.
 */
export default [
  {
    name: 'horizon',
    owner: 'integracao',
    desc: 'A pé, olhos a 1,7 m, horizonte de um planeta exuberante em dia claro, montanhas e uma lua grande no céu',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'walk',
    camera: {
      lat: 12, lon: 24, alt: 1.7, pitch: 4, fov: 70,
      // a lua principal a ~16° de altura, um pouco à direita do centro
      anchor: { body: 'moon', elevation: 16, azimuth: 70 },
      look: { body: 'moon', offset: -14 },
    },
    timeOfDay: 0.4,
    weather: 'clear',
    params: {},
  },
  {
    name: 'orbit',
    owner: 'integracao',
    desc: 'Órbita baixa (~25 km), planeta preenchendo metade da tela, atmosfera no limbo, estrela e outros corpos visíveis',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'space',
    cockpit: false,
    camera: {
      lat: 5, lon: 40, alt: 25000, fov: 65,
      // limbo pouco abaixo do centro; sol nascente perto do canto superior
      pitch: { horizon: 6 },
      look: { body: 'sun', offset: -24 },
    },
    timeOfDay: 0.742,
    weather: 'clear',
    params: {},
  },
  {
    name: 'cockpit',
    owner: 'integracao',
    desc: 'Dentro da nave, 1ª pessoa, voando baixo (120 m) sobre a superfície',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'ship',
    view: 'first',
    cockpit: true,
    camera: { lat: 11.6, lon: 23.4, alt: 120, heading: 70, pitch: -7, fov: 72 },
    timeOfDay: 0.45,
    weather: 'clear',
    params: {},
  },
  {
    name: 'sunset',
    owner: 'integracao',
    desc: 'Bioma exuberante ao pôr do sol: sol baixo à frente, céu quente',
    seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
    mode: 'walk',
    camera: { lat: -8, lon: 63, alt: 1.7, pitch: 3, fov: 70, look: { body: 'sun', offset: 8 } },
    timeOfDay: 0.744,
    weather: 'clear',
    params: {},
  },
];
