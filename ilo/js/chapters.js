// Ordem da história e cena do menu inicial.
import * as THREE from 'three';
import * as $ from './props.js';
import { SPEAKERS, paint, dirLL, decorate } from './kit.js';
import { fbm3 } from './style.js';
import { chCisco, chRelogio, chSinos, chNevoeiro, chPinhas, chFarol, chMapas } from './worlds.js';
import { chDuna, chFonte, chFinal } from './duna.js';

export { SPEAKERS };

export const CHAPTERS = [
  { title: 'Prólogo · Cisco', short: 'Cisco', run: chCisco },
  { title: 'I · O Mundo do Relógio', short: 'Relógio', run: chRelogio },
  { title: 'II · O Mundo dos Sinos', short: 'Sinos', run: chSinos },
  { title: 'III · O Mundo do Nevoeiro', short: 'Nevoeiro', run: chNevoeiro },
  { title: 'IV · O Mundo das Pinhas', short: 'Pinhas', run: chPinhas },
  { title: 'V · O Mundo do Farol', short: 'Farol', run: chFarol },
  { title: 'VI · O Mundo dos Mapas', short: 'Mapas', run: chMapas },
  { title: 'VII · A Grande Duna', short: 'Grande Duna', run: chDuna },
  { title: 'VIII · A Fonte das Estrelas', short: 'A Fonte', run: chFonte },
  { title: 'Final · O céu reaceso', short: 'Final', run: chFinal },
];

/** Fundo do menu: Cisco girando devagar, com Ilo e o braseiro. */
CHAPTERS.menuScene = (g) => {
  const W = g.world;
  W.clearStage();
  W.setSky('cisco');
  W.mode = 'free';
  W.setPlanet({ radius: 4, seg: 64, height: (n) => (fbm3(n.x * 2.5, n.y * 2.5, n.z * 2.5) - 0.5) * 0.25, color: paint('#b8a8c8', '#a898b8', '#8fb8a0', { scale: 2.6, seed: 3 }) });
  const top = new THREE.Vector3(0, 1, 0);
  const braz = W.place($.brazier(), dirLL(76, 80));
  braz.userData.power = 0.8;
  W.hook((dt, t) => braz.userData.update(dt, t));
  W.place($.chimney(), dirLL(55, 200));
  W.place($.chimney(), dirLL(40, 240));
  decorate(W, 11, { tufts: 22, rocks: 6, avoid: [top], minAng: 0.3, tuftColor: 0x8a9ac0 });
  const h = W.hero;
  W.addActor(h);
  h.setPose(W.surface(top), top, new THREE.Vector3(1, 0, 0.3).normalize());
  h.pose = 'lookup';
  h.resetScarf();
  let a = 0;
  W.hook((dt) => {
    a += dt * 0.08;
    W.camera.position.set(Math.sin(a) * 12.5, 8.2, Math.cos(a) * 12.5);
    W.camera.up.set(0, 1, 0);
    W.camera.lookAt(0, 9.8, 0);
    W.sunDir.set(Math.sin(a + 0.8), 0.8, Math.cos(a + 0.8)).normalize();
  });
  W.sunMode = 'fixed';
};
