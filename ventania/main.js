// Ventania — ponto de entrada. Monta renderer, mundo, herói, câmera, HUD e
// som; roda o loop; e expõe `window.__ventania` no modo screenshot (?shot=1).

import * as THREE from 'three';
import { ENV } from './render/fog.js';
import { QUALITY } from './render/quality.js';
import { Post } from './render/post.js';
import { Input } from './core/input.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { Terrain } from './world/terrain.js';
import { Colliders } from './world/colliders.js';
import { Grass } from './world/grass.js';
import { Trees } from './world/trees.js';
import { Rocks } from './world/rocks.js';
import { Ruins } from './world/ruins.js';
import { Water } from './world/water.js';
import { Sky } from './world/sky.js';
import { Clouds, SkyIslands } from './world/skyislands.js';
import { DayNight } from './world/daynight.js';
import { SPAWN, LAKE, HILL, RUINS, SKY_ISLANDS } from './world/layout.js';
import { Player } from './player/player.js';
import { ThirdPersonCamera } from './camera/thirdPerson.js';
import { Hud, Menu } from './ui/hud.js';
import { GameAudio } from './audio/audio.js';
import { damp } from './core/math.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');

const settings = loadSettings();
if (params.get('q') && QUALITY[params.get('q')]) settings.quality = params.get('q');

// ── Renderer ──
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 5000);

// Dá um frame para o "gerando a ilha…" aparecer antes do trabalho pesado.
await new Promise((r) => setTimeout(r, 30));

// ── Mundo ──
const terrain = new Terrain();
scene.add(terrain.mesh);
const colliders = new Colliders();
const world = { terrain, colliders };
const daynight = new DayNight(scene);
const sky = new Sky(scene);
const water = new Water(scene, terrain);
const grass = new Grass(scene, terrain);
new Trees(scene, terrain, colliders);
new Rocks(scene, terrain, colliders);
const ruins = new Ruins(scene, terrain, colliders);
const clouds = new Clouds(scene);
const islands = new SkyIslands(scene);

// ── Jogador, câmera, HUD, som ──
const audio = new GameAudio();
audio.volume = settings.volume;
const input = new Input(canvas);
const player = new Player(scene, world, audio);
player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
const cam = new ThirdPersonCamera(camera, world);
cam.sensitivity = settings.sensitivity;
cam.invertY = settings.invertY;
cam.snap(player);
player.onLand = (k) => { cam.shake = Math.max(cam.shake, k); };

const hud = new Hud(settings);
const post = new Post(renderer, scene, camera);

let quality = null;
let forcedWish = null; // automação: segura uma direção (poses de animação)
function applyQuality(key) {
  const q = QUALITY[key] || QUALITY.medium;
  quality = q;
  settings.quality = key;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(key === 'low' ? Math.min(dpr, 1) * q.pixelRatio : Math.min(dpr, q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  daynight.configureShadows(q.shadowSize, q.shadowRange);
  grass.build(q);
  post.build(q, innerWidth, innerHeight);
  saveSettings(settings);
}
applyQuality(settings.quality);

hud.stats = () => {
  const i = renderer.info.render;
  const p = player.pos;
  return `${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris\n` +
    `qualidade ${quality.label} · ${daynight.clock()}\n` +
    `x ${p.x.toFixed(0)} y ${p.y.toFixed(1)} z ${p.z.toFixed(0)}`;
};

// ── Estados: menu → jogando ⇄ pausado ──
let state = SHOT ? 'play' : 'menu';
const menu = new Menu(settings, {
  onPlay: () => startPlaying(),
  onQuality: (k) => applyQuality(k),
  onVolume: (v) => { settings.volume = v; audio.setVolume(v); saveSettings(settings); },
  onSensitivity: (v) => { settings.sensitivity = v; cam.sensitivity = v; saveSettings(settings); },
  onInvert: (v) => { settings.invertY = v; cam.invertY = v; saveSettings(settings); },
});

function startPlaying() {
  audio.init();
  audio.setVolume(settings.volume);
  state = 'play';
  menu.hide();
  document.getElementById('hud').classList.remove('off');
  input.lock();
}
input.onLockChange = (locked) => {
  if (!locked && state === 'play' && !SHOT) {
    state = 'paused';
    menu.show(true);
  }
};
canvas.addEventListener('click', () => {
  if (state === 'play' && !input.locked && !SHOT) input.lock();
});

if (SHOT) {
  document.getElementById('menu').classList.add('hide');
} else {
  menu.show(false);
  document.getElementById('hud').classList.add('off');
}
document.getElementById('loading').classList.add('done');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight);
});

// ── Loop ──
let lastT = performance.now();
let elapsed = 0;
const windBase = new THREE.Vector2(0.85, 0.45).normalize();

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  elapsed += dt;
  tick(dt);
  requestAnimationFrame(frame);
}

function tick(dt, render = true) {
  // Teclas globais.
  if (input.consume('KeyH')) {
    hud.setControlsVisible(!settings.showControls);
    saveSettings(settings);
  }
  if (input.consume('F3')) hud.toggleFps();
  if (input.consume('KeyT')) hud.toast(daynight.toggleFast() ? 'Tempo acelerado' : 'Tempo normal');
  if (input.consume('KeyM')) hud.toast(audio.toggleMute() ? 'Som desligado' : 'Som ligado');
  if (input.consume('Escape') && state === 'paused') startPlaying();

  // Vento: direção gira bem devagar, força pulsa.
  const wa = Math.sin(elapsed * 0.02) * 0.5;
  ENV.vtWind.value.set(windBase.x * Math.cos(wa) - windBase.y * Math.sin(wa), windBase.x * Math.sin(wa) + windBase.y * Math.cos(wa))
    .multiplyScalar(1 + 0.3 * Math.sin(elapsed * 0.13));
  ENV.vtTime.value = elapsed;

  const playing = state === 'play';
  if (playing) {
    player.input(input, cam.yaw);
    if (forcedWish) { player.wish = forcedWish; player.running = forcedWish.run; }
  } else {
    player.wish = { x: 0, z: 0, mag: 0 };
    player.jumpHeld = false;
    // Título: câmera gira devagar ao redor do herói.
    if (!cam.free) cam.yaw += dt * 0.05;
  }
  player.update(dt);
  cam.update(dt, playing ? input : { mouseDX: 0, mouseDY: 0, wheel: 0 }, player);
  camera.updateMatrixWorld();
  player.updateScarf(dt, ENV.vtWind.value);

  daynight.update(dt, player.pos, camera);
  renderer.toneMappingExposure += (daynight.env.exposure - renderer.toneMappingExposure) * damp(2, dt);
  sky.update(camera, daynight.env);
  water.update(dt, daynight.env);
  grass.update(player.pos);
  clouds.update(dt, ENV.vtWind.value);
  islands.update(elapsed);

  const hs = Math.hypot(player.vel.x, player.vel.z);
  const distCenter = Math.hypot(player.pos.x, player.pos.z);
  audio.update(dt, {
    speed: Math.hypot(hs, player.vel.y),
    airborne: !player.grounded,
    gliding: player.gliding,
    height: player.pos.y - player.groundY,
    nearSea: Math.max(0, Math.min(1, (distCenter - 300) / 120)) * (player.pos.y < 40 ? 1 : 0.4),
    day: Math.max(0, Math.min(1, (daynight.env.elevation + 2) / 10)),
    night: daynight.env.night,
  });

  hud.update(dt, cam.heading(), player.pos, daynight.clock(), daynight.fast);
  if (render) post.render(dt);
  input.endFrame();
}

// ── Modo screenshot / automação ──
if (SHOT) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const ground = (x, z) => terrain.heightAt(x, z);
  const I0 = SKY_ISLANDS[0];
  const POSES = {
    chao: () => {
      player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
      cam.free = null; cam.yaw = SPAWN.yaw + Math.PI; cam.pitch = 0.12; cam.wantDist = cam.dist = 5.2;
    },
    lago: () => {
      const x = LAKE.x - LAKE.r * 0.98, z = LAKE.z + 12;
      player.spawn(x, z, Math.PI / 2 + 0.2);
      cam.free = null; cam.yaw = -Math.PI / 2 + 0.25; cam.pitch = 0.18; cam.wantDist = cam.dist = 6;
    },
    colina: () => {
      // No platô, olhando o arco (com o mar e uma ilha flutuante atrás).
      const yaw = Math.atan2(-1, -0.8);
      player.spawn(HILL.x + 13, HILL.z + 10.5, yaw);
      cam.free = null; cam.yaw = yaw + Math.PI + 0.25; cam.pitch = 0.16; cam.wantDist = cam.dist = 6.5;
    },
    ceu: () => {
      player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
      const p = v(SPAWN.x - 30, ground(SPAWN.x - 30, SPAWN.z - 40) + 1.7, SPAWN.z - 40);
      cam.free = { pos: p, look: v(I0.x * 0.6 + p.x * 0.4, I0.y * 0.75, I0.z * 0.6 + p.z * 0.4), fov: 62 };
    },
    close: () => {
      player.spawn(SPAWN.x, SPAWN.z, -2.3);
      cam.free = null; cam.yaw = -2.3 + 0.5; cam.pitch = 0.08; cam.wantDist = cam.dist = 2.3;
    },
    // Poses extras (fora das 6 fixas): animações.
    planador: () => {
      player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
      player.pos.y += 14;
      player.grounded = false;
      player.gliding = true;
      player.vel.set(Math.sin(SPAWN.yaw) * 9, -2.3, Math.cos(SPAWN.yaw) * 9);
      cam.free = null; cam.yaw = SPAWN.yaw + Math.PI + 0.6; cam.pitch = 0.1; cam.wantDist = cam.dist = 5;
    },
    correndo: () => {
      player.spawn(SPAWN.x, SPAWN.z, 1.2);
      player.vel.set(Math.sin(1.2) * 8.4, 0, Math.cos(1.2) * 8.4);
      forcedWish = { x: Math.sin(1.2), z: Math.cos(1.2), mag: 1, run: true };
      cam.free = null; cam.yaw = 1.2 + Math.PI / 2 + 0.3; cam.pitch = 0.08; cam.wantDist = cam.dist = 4;
    },
    geral: () => {
      player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
      cam.free = { pos: v(330, 300, 520), look: v(-40, 10, -30), fov: 55 };
    },
  };
  window.__ventania = {
    poses: ['chao', 'lago', 'colina', 'ceu', 'close', 'geral'],
    setPose(name) {
      forcedWish = null;
      POSES[name]();
      cam.snap(player);
      // Re-aplica o yaw da pose (snap usa a direção do herói).
      POSES[name]();
      cam.curDist = cam.dist;
      cam.target.copy(player.pos).add(v(0, 1.45, 0));
    },
    setTime(h) { daynight.time = h; daynight.frozen = true; },
    setQuality(q) { applyQuality(q); },
    /** Roda n frames com dt fixo (determinístico, independe da velocidade da máquina). */
    step(n = 1, dt = 1 / 60, render = true) {
      for (let i = 0; i < n; i++) { elapsed += dt; tick(dt, render && i === n - 1); }
    },
    state: () => ({
      pos: player.pos.toArray(), vel: player.vel.toArray(), grounded: player.grounded,
      gliding: player.gliding, swimming: player.swimming, yaw: player.yaw, fov: camera.fov,
      camPos: camera.position.toArray(), camDist: cam.curDist,
    }),
    /** Draws e triângulos de um frame (cena + sombras), sem o pós. */
    stats() {
      renderer.info.autoReset = false;
      renderer.info.reset();
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
      renderer.info.autoReset = true;
      return r;
    },
    player, cam, input, daynight, renderer, ruins, scene, camera,
  };
  // No modo screenshot o loop só anda quando a automação pede (step).
  window.__ventania.ready = true;
} else {
  requestAnimationFrame(frame);
}
