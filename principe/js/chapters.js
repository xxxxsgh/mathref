// Ordem da história e cena do menu inicial.
import * as THREE from 'three';
import * as $ from './props.js';
import { SPEAKERS, paint, dirLL, decorate } from './kit.js';
import { fbm3 } from './style.js';
import { chB612, chRei, chVaidoso, chBebado, chNegocios, chAcendedor, chGeografo } from './asteroids.js';
import { chPrologo, chTerra, chPoco, chEpilogo } from './earth.js';

export { SPEAKERS };

export const CHAPTERS = [
  { title: 'Prólogo · O deserto', short: 'Prólogo', run: chPrologo },
  { title: 'I · O asteroide B-612', short: 'B-612', run: chB612 },
  { title: 'II · O Rei', short: 'O Rei', run: chRei },
  { title: 'III · O Vaidoso', short: 'O Vaidoso', run: chVaidoso },
  { title: 'IV · O Bêbado', short: 'O Bêbado', run: chBebado },
  { title: 'V · O Homem de Negócios', short: 'O Homem de Negócios', run: chNegocios },
  { title: 'VI · O Acendedor', short: 'O Acendedor', run: chAcendedor },
  { title: 'VII · O Geógrafo', short: 'O Geógrafo', run: chGeografo },
  { title: 'VIII · A Terra e a raposa', short: 'A Terra', run: chTerra },
  { title: 'IX · O Poço', short: 'O Poço', run: chPoco },
  { title: 'Final · Estrelas que riem', short: 'Final', run: chEpilogo },
];

/** Fundo do menu: o B-612 girando devagar, com o príncipe e a rosa. */
CHAPTERS.menuScene = (g) => {
  const W = g.world;
  W.clearStage();
  W.setSky('b612');
  W.mode = 'free';
  W.setPlanet({ radius: 4, seg: 64, height: (n) => (fbm3(n.x * 2.5, n.y * 2.5, n.z * 2.5) - 0.5) * 0.25, color: paint('#c9b28c', '#b49a7a', '#9fb877', { scale: 2.6, seed: 3 }) });
  const top = new THREE.Vector3(0, 1, 0);
  W.place($.rose(), dirLL(80, 90));
  W.place($.volcano(true), dirLL(55, 200));
  W.place($.volcano(true), dirLL(40, 240));
  W.place($.chair(), dirLL(62, 300), { yaw: 1 });
  decorate(W, 11, { tufts: 22, rocks: 6, avoid: [top], minAng: 0.3 });
  const pr = W.prince;
  W.addActor(pr);
  pr.setPose(W.surface(top), top, new THREE.Vector3(1, 0, 0.3).normalize());
  pr.pose = 'lookup';
  pr.resetScarf();
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
