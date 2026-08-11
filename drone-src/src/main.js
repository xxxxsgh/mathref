import * as THREE from 'three';
import './ui/styles.css';
import { CONFIG } from './config.js';
import { Engine } from './core/Engine.js';
import { Quality } from './core/Quality.js';
import { createRenderer, attachResize } from './core/Renderer.js';

/**
 * FASE 0 — cena vazia com grid e contador de FPS.
 * Serve pra provar que o loop de timestep fixo, a detecção de tier e o build
 * pro GitHub Pages estão de pé antes de qualquer gameplay entrar.
 */

const app = document.getElementById('app');
const quality = new Quality();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
scene.fog = new THREE.Fog(0x0a0d12, 60, quality.settings.drawDistance);

const camera = new THREE.PerspectiveCamera(
  CONFIG.CAMERA.fovBase,
  window.innerWidth / window.innerHeight,
  CONFIG.CAMERA.near,
  CONFIG.CAMERA.far,
);
camera.position.set(0, 6, 14);
camera.lookAt(0, 1, 0);

const renderer = createRenderer(quality);
app.appendChild(renderer.domElement);

const grid = new THREE.GridHelper(400, 80, 0x35e0c8, 0x1d2733);
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

scene.add(new THREE.AmbientLight(0x8fa8c0, 1.4));

const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = '<div id="fps"></div>';
document.body.appendChild(ui);
const fpsEl = ui.querySelector('#fps');

attachResize(renderer, camera);

let uiClock = 0;

const engine = new Engine({
  fixedHz: 60,
  maxSubSteps: 5,
  onFixed: () => {},
  onRender: (dt) => {
    quality.update(engine.frameMs.value, dt);

    uiClock += dt;
    if (uiClock > 0.25) {
      uiClock = 0;
      fpsEl.innerHTML =
        `<b>${engine.fps.toFixed(0)}</b> fps  ${engine.frameMs.value.toFixed(1)} ms\n` +
        `tier ${quality.settings.label}${quality.overridden ? ' (manual)' : ''}`;
    }

    renderer.render(scene, camera);
  },
});

engine.start();
