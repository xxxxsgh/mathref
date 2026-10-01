import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './ui/styles.css';
import { Save } from './core/Save.js';
import { Settings, isTouchDevice } from './core/Settings.js';
import { Input } from './core/Input.js';
import { Arena } from './world/Arena.js';
import { Effects } from './fx/Effects.js';
import { AudioManager } from './audio/AudioManager.js';
import { InventorySystem } from './inventory/InventorySystem.js';
import { ViewModel } from './weapons/ViewModel.js';
import { InspectionViewer } from './inspect/InspectionViewer.js';
import { Thumbnails } from './inspect/Thumbnails.js';
import { UIManager } from './ui/UIManager.js';
import { MatchManager } from './match/MatchManager.js';
import * as CLIPS from './weapons/Animations.js';

/**
 * NULLPOINT — montagem e laço principal.
 *
 * Este arquivo só liga as peças e decide a ordem das coisas no frame.
 * Regras moram nos módulos (MatchManager, RoundManager, BotController…).
 *
 * Estados: menu (câmera orbitando a arena) → match (partida) / viewer
 * (visualizador de colecionável).
 */
class Game {
  constructor() {
    this.save = new Save();
    this.settings = new Settings(this.save);
    this.inventory = new InventorySystem(this.save);
    this.audio = new AudioManager();
    this.audio.setVolumes(this.settings.data);

    const q = this.settings.data.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app')?.appendChild(this.renderer.domElement);

    // ambiente PBR compartilhado (metais da arma refletem algo plausível)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene = new THREE.Scene();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.35;
    this.scene.fog = new THREE.Fog(0xa9b8c6, 60, 140);
    this.scene.add(skyDome());
    this.camera = new THREE.PerspectiveCamera(this.settings.data.fov, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';

    const hemi = new THREE.HemisphereLight(0xdde8f5, 0x5a5048, 0.85);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.0);
    this.sun.position.set(-30, 50, 20);
    this.sun.target.position.set(0, 0, 3);
    const sc = this.sun.shadow.camera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 10;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(hemi, this.sun, this.sun.target);

    this.arena = new Arena(this.scene, { shadows: q !== 'low' });
    this.fx = new Effects(this.scene, q);
    this.input = new Input(this.renderer.domElement);
    this.applyTouchMode();
    this.vm = new ViewModel(this.envMap, this.settings.data.viewmodelFov);
    this.viewer = new InspectionViewer(this.envMap);
    this.thumbs = new Thumbnails();
    this.ui = new UIManager(this);

    /** @type {'menu'|'match'|'viewer'} */
    this.state = 'menu';
    /** @type {MatchManager|null} */
    this.match = null;
    this.menuT = 0;
    this.fps = 60;
    this.last = performance.now();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();

    this.applyQuality();
    this.settings.onChange((d, key) => this.onSettings(d, key));
    this.input.lockListeners.push((locked) => {
      if (!locked) this.ui.onUnlock();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointerdown', () => {
      this.audio.unlock();
      if (this.state !== 'match') this.audio.startMusic(0);
    });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('beforeunload', () => this.save.flush());
    document.addEventListener('visibilitychange', () => document.hidden && this.save.flush());

    this.resize();
    this.ui.show('main');
    requestAnimationFrame((t) => this.frame(t));
  }

  onKey(e, down) {
    if (this.state !== 'match' || !this.match) return;
    if (e.code === 'KeyB' && down && !e.repeat) this.ui.toggleBuyMenu();
    if (e.code === 'Escape' && down && this.ui.overlayKind === 'buy') this.ui.closeBuyMenu();
    if (e.code === 'Tab') {
      e.preventDefault();
      if (down && !this.ui.scoreboard) this.ui.showScoreboard();
      else if (!down) this.ui.hideScoreboard();
    }
  }

  /** @param {'menu'|'match'|'viewer'} s */
  setState(s) {
    this.state = s;
  }

  /** @param {{ mode: 'competitive'|'practice', difficulty: string, teamSize: number }} opts */
  startMatch(opts) {
    this.audio.unlock();
    if (this.match) this.match.dispose();
    this.audio.stopMusic();
    this.match = new MatchManager(this, opts);
    this.state = 'match';
    this.ui.enterMatch();
    this.resize();
  }

  endMatch() {
    if (this.match) this.match.dispose();
    this.match = null;
    this.input.unlock();
    this.ui.leaveMatch();
    this.state = 'menu';
    this.ui.show('main');
    this.save.flush();
    this.audio.startMusic(0);
  }

  applyQuality() {
    const d = this.settings.data;
    const r = this.renderer;
    const shadows = d.quality !== 'low';
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        const m = /** @type {any} */ (o).material;
        if (m) m.needsUpdate = true;
      });
    }
    this.sun.castShadow = shadows;
    const size = d.quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const maxDpr = d.quality === 'high' ? 2 : d.quality === 'medium' ? 1.25 : 1;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr) * d.renderScale);
  }

  /** Liga/desliga o modo toque conforme a configuração (auto = detecta). */
  applyTouchMode() {
    const mode = this.settings.data.touchControls;
    const on = mode === 'on' || (mode === 'auto' && isTouchDevice());
    if (on !== this.input.touchMode && this.input.locked) this.input.unlock();
    this.input.touchMode = on;
    document.body.classList.toggle('touch', on);
  }

  /** Tela cheia + paisagem no celular (só funciona dentro de um toque). */
  enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => /** @type {any} */ (screen.orientation)?.lock?.('landscape'))
      .catch(() => {});
  }

  onSettings(d, key) {
    this.audio.setVolumes(d);
    if (!key || key === 'touchControls') this.applyTouchMode();
    if (!key || key === 'touchButtonScale') this.ui?.touch.applyScale(d.touchButtonScale);
    if (!key || key === 'quality' || key === 'renderScale') {
      this.applyQuality();
      this.resize();
    }
    if (!key || key === 'fov' || key === 'viewmodelFov') this.resize();
    if (key === 'fullscreen') {
      if (d.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (!d.fullscreen && document.fullscreenElement) document.exitFullscreen?.();
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const zoom = this.match?.wc.zoomed ? this.match.player.weapon.def.zoomFov : 0;
    this.camera.fov = zoom || this.settings.data.fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.vm.setProjection(this.settings.data.viewmodelFov, aspect);
    this.viewer.resize(aspect);
  }

  /** @param {number} now */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0.0005, (now - this.last) / 1000));
    this.last = now;
    this.fps += (1 / dt - this.fps) * 0.05;
    const inMatch = this.state === 'match' && !!this.match;
    this.ui.touch.show(inMatch && this.input.touchMode && this.input.locked && !this.ui.menuOpen);
    this.ui.touch.updateOrientationHint(inMatch);
    if (inMatch) this.updateMatch(dt);
    else if (this.state === 'viewer') {
      this.viewer.update(dt);
      this.viewer.render(this.renderer);
    } else this.updateMenu(dt);
    this.input.endFrame();
  }

  updateMenu(dt) {
    // câmera de vitrine orbitando o centro da arena
    this.menuT += dt * 0.05;
    const r = 30;
    this.camera.position.set(Math.sin(this.menuT) * r, 14 + Math.sin(this.menuT * 0.7) * 3, Math.cos(this.menuT) * r * 0.8 + 3);
    this.camera.lookAt(0, 1.5, 3);
    this.arena.setUplinkState(-1, 0, this.menuT * 20);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Avança a simulação sem depender do relógio real (testes automatizados:
   * o Chromium headless renderiza a poucos FPS).
   * @param {number} seconds
   */
  simulate(seconds, step = 1 / 60) {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) {
      if (this.state === 'match' && this.match) this.updateMatch(step, false);
      this.input.endFrame();
    }
  }

  updateMatch(dt, render = true) {
    const m = /** @type {MatchManager} */ (this.match);
    this.ui.touch.update();
    m.update(dt, { menuOpen: this.ui.menuOpen });
    const p = m.player;

    // FOV da luneta
    const wantFov = m.wc.zoomed ? m.player.weapon.def.zoomFov || this.settings.data.fov : this.settings.data.fov;
    if (Math.abs(this.camera.fov - wantFov) > 0.01) {
      this.camera.fov = wantFov;
      this.camera.updateProjectionMatrix();
    }

    if (p.alive) {
      m.pc.applyCamera(this.camera, m.wc.cameraRecoil, dt);
    } else if (m.mode === 'competitive') this.spectateCamera(m, dt);
    else {
      // modo treino: câmera parada olhando o corpo
      this.camera.position.y += (p.body.pos.y + 3 - this.camera.position.y) * Math.min(1, dt * 2);
    }
    this.camera.updateMatrixWorld();
    this.audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, p.alive ? p.yaw : this.camera.rotation.y);

    this.fx.update(dt);
    const mouse = m.pc.lastMouse;
    this.vm.hidden = !p.alive || m.wc.zoomed;
    this.vm.update(dt, {
      mouseDX: mouse.dx,
      mouseDY: mouse.dy,
      speed: m.pc.speed,
      grounded: p.body.grounded,
      crouching: p.crouching,
      sprinting: m.pc.sprinting,
    });

    if (!render) return;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = false;
    this.vm.render(this.renderer);
    this.renderer.autoClear = true;

    this.ui.hud.update(dt, m, this.camera, this.fps);
  }

  /** Terceira pessoa atrás de um aliado vivo (com colisão da câmera). */
  spectateCamera(m, dt) {
    const t = m.spectateTarget();
    if (!t) return;
    const eye = t.eye(this.tmp);
    const back = this.tmp2.set(Math.sin(t.yaw), 0.25, Math.cos(t.yaw)).normalize();
    const hit = this.arena.collision.raycast(eye.x, eye.y, eye.z, back.x, back.y, back.z, 2.6);
    const d = hit ? Math.max(0.3, hit.t - 0.2) : 2.6;
    const target = eye.clone().addScaledVector(back, d);
    this.camera.position.lerp(target, Math.min(1, dt * 8));
    this.camera.lookAt(eye.x - back.x * 4, eye.y, eye.z - back.z * 4);
  }
}

/** Céu em degradê (esfera com cores por vértice — sem textura). */
function skyDome() {
  const geo = new THREE.SphereGeometry(300, 24, 12);
  const colors = [];
  const top = new THREE.Color(0x5d86b5);
  const mid = new THREE.Color(0xbfcfdc);
  const low = new THREE.Color(0xe9dccb);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 300;
    const c = y > 0.1 ? mid.clone().lerp(top, Math.min(1, (y - 0.1) / 0.7)) : low.clone().lerp(mid, Math.max(0, (y + 0.2) / 0.3));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  return sky;
}

const game = new Game();
// gancho para os testes automatizados (tools/e2e.mjs) e para depuração
/** @type {any} */ (window).__np = game;
/** @type {any} */ (game).__clips = CLIPS;
