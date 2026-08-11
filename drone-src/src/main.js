import * as THREE from 'three';
import './ui/styles.css';
import { CONFIG } from './config.js';
import { Engine } from './core/Engine.js';
import { Quality } from './core/Quality.js';
import { createRenderer, attachResize, applyShadowSettings } from './core/Renderer.js';
import { Input } from './core/Input.js';
import { Drone } from './flight/Drone.js';
import { Battery } from './flight/Battery.js';
import { Wind } from './flight/Wind.js';
import { buildDroneModel, spinRotors } from './flight/DroneModel.js';
import { FPVCamera } from './camera/FPVCamera.js';
import { FPVPost } from './camera/FPVPost.js';
import { World } from './world/World.js';
import { Save } from './core/Save.js';
import { Race, CIRCUITS } from './race/Race.js';
import { HUD, toKmh } from './ui/HUD.js';

/**
 * DRONEFARER — montagem e laço principal.
 *
 * Este arquivo só liga as peças e decide a ordem das coisas dentro do frame.
 * Toda regra mora no seu módulo; quando este arquivo começar a ter lógica de
 * jogo, é sinal de que falta um módulo.
 */
class Game {
  constructor(app) {
    this.quality = new Quality();

    this.scene = new THREE.Scene();
    this.renderer = createRenderer(this.quality);
    app.appendChild(this.renderer.domElement);

    this.ui = document.createElement('div');
    this.ui.id = 'ui';
    document.body.appendChild(this.ui);

    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.ui.appendChild(this.fpsEl);

    this.save = new Save();
    this.input = new Input(this.ui, {
      expoScale: this.save.options.expoScale,
      invertPitch: this.save.options.invertPitch,
      invertRoll: this.save.options.invertRoll,
    });
    this.hud = new HUD(this.ui);

    this.world = new World(this.scene, this.quality);
    this.drone = new Drone();
    this.battery = new Battery();
    this.wind = new Wind();

    this.camera = new FPVCamera(window.innerWidth / window.innerHeight);
    this.post = new FPVPost(this.renderer, this.quality);

    this.model = buildDroneModel();
    this.scene.add(this.model);

    this.race = new Race({
      scene: this.scene,
      terrain: this.world.terrain,
      save: this.save,
      onEvent: (event, payload) => this._onRaceEvent(event, payload),
    });

    // Pose do passo anterior: o render interpola entre ela e a atual, senão a
    // 60 Hz fixos com tela de 120 Hz a imagem anda em degraus.
    this._prevPosition = new THREE.Vector3();
    this._prevQuaternion = new THREE.Quaternion();
    this._renderPosition = new THREE.Vector3();
    this._renderQuaternion = new THREE.Quaternion();
    this._windAt = new THREE.Vector3();
    this._env = {};

    this.spawn();
    // Os circuitos são ancorados na origem do mundo, não em onde o drone está:
    // o traçado precisa cair sempre no mesmo lugar pro recorde fazer sentido.
    this.race.setCircuit(CIRCUITS[0].id, new THREE.Vector3(0, 0, 0));
    this.restartRun();

    this.quality.onChange((settings) => {
      applyShadowSettings(this.renderer, settings);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
      this.post.applyTier(settings);
      this.post.resize();
    });

    attachResize(this.renderer, null, (w, h) => {
      this.camera.resize(w / h);
      this.post.resize();
    });

    this._uiClock = 0;
    this.engine = new Engine({
      fixedHz: 60,
      maxSubSteps: 5,
      onFixed: (dt) => this.fixedUpdate(dt),
      onRender: (dt, alpha) => this.render(dt, alpha),
    });
  }

  spawn() {
    const y = this.world.groundHeight(0, 0);
    this.drone.position.set(0, y + 2.5, 0);
    this.drone.velocity.set(0, 0, 0);
    this.drone.quaternion.identity();
    this.drone.heading = 0;
    this.drone.safePoint.position.copy(this.drone.position);
    this.battery.refill();
    // Carrega o chão de uma vez antes do primeiro frame: aparecer no ar e ver
    // o mundo montando embaixo é a pior primeira impressão possível.
    for (let i = 0; i < 200; i++) {
      if (this.world.terrain.update(this.drone.position, 8) === 0) break;
    }
  }

  /** Reinício instantâneo da volta: uma tecla, sem menu e sem carregamento. */
  restartRun() {
    const pose = this.race.restart();
    this.drone.respawn(pose);
    this.battery.refill();
    this.input.neutralize();
    this.hud.hideFinish();
    // O terreno na largada pode não estar carregado se o jogador se afastou.
    this.world.terrain.update(this.drone.position, 12);
  }

  _onRaceEvent(event, payload) {
    switch (event) {
      case 'circuit':
        this.hud.banner(payload.circuit.name.toUpperCase(), 2.2);
        break;

      case 'start':
        this.hud.hideFinish();
        this.hud.banner('VAI', 0.8);
        break;

      case 'gate': {
        // Feedback forte e imediato: clarão, sacudida e o split na cara. É o
        // que separa "passei no gate" de "passei BEM no gate".
        this.post.flash(payload.perfect ? 0.5 : payload.scrape ? 0.3 : 0.22,
          payload.scrape ? 0xff4d5e : payload.perfect ? 0x9dfff0 : 0xffffff);
        this.camera.addShake(payload.scrape ? 0.35 : 0.12);
        this.hud.showDelta(payload.delta);
        if (payload.scrape) this.hud.banner('RASPOU', 0.7, 'danger');
        else if (payload.perfect) this.hud.banner('CENTRO', 0.6);
        break;
      }

      case 'finish':
        this.post.flash(0.55, payload.medal === 'ouro' ? 0xffcf49 : 0xffffff);
        this.hud.showFinish(payload);
        break;

      default:
        break;
    }
  }

  fixedUpdate(dt) {
    const axes = this.input.update(dt);
    this._handleActions();

    this._prevPosition.copy(this.drone.position);
    this._prevQuaternion.copy(this.drone.quaternion);

    this.wind.update(dt);
    this.wind.sample(this.drone.position, this._windAt);

    this._env.wind = this._windAt;
    this._env.thrustScale = this.battery.thrustScale;
    this._env.massScale = 1;

    this.drone.update(dt, axes, this._env);
    this.battery.update(dt, this.drone.crashed ? 0 : this.drone.throttle);

    const hit = this.world.collision.resolve(this.drone);
    if (hit) this._onCollision(hit);

    const agl = this.drone.position.y - this.world.groundHeight(this.drone.position.x, this.drone.position.z);
    if (!hit && agl > 2 && this.drone.speed < 22) this.drone.markSafe();

    // Respawn automático: sem menu, sem tela de game over. Bateu, volta.
    // O respawn NÃO reinicia a volta: o cronômetro segue correndo e a decisão
    // de recomeçar continua sendo do jogador.
    if (this.drone.canRespawn) this._respawn();

    this.race.update(dt, this.drone, this._prevPosition, this.drone.position);
    this.world.update(dt, this.drone.position, this.drone.velocity);
  }

  _handleActions() {
    if (this.input.took('toggleMode')) {
      const mode = this.drone.toggleMode();
      this.hud.banner(mode === 'ACRO' ? 'ACRO' : 'ANGLE', 1.1, mode === 'ACRO' ? 'acro' : '');
    }
    if (this.input.took('restart')) this.restartRun();
    if (this.input.took('thirdPerson')) this.camera.toggleThirdPerson();
    if (this.input.took('nextCircuit')) this._switchCircuit(1);
    if (this.input.took('prevCircuit')) this._switchCircuit(-1);
  }

  _onCollision(hit) {
    if (hit.hard) {
      if (this.drone.crash()) {
        this.camera.addShake(CONFIG.CAMERA.shakeCrash);
        this.post.flash(0.35, 0xff4d5e);
        this.hud.banner('CRASH', 1.2, 'danger');
      }
    } else {
      // Raspão: sacode proporcional ao impacto, sem interromper o voo.
      this.camera.addShake(Math.min(0.45, hit.impact * 0.05));
    }
  }

  _respawn() {
    this.drone.respawn();
    this.input.neutralize();
  }

  _switchCircuit(step) {
    this.race.cycleCircuit(step);
    this.restartRun();
  }

  render(dt, alpha) {
    this.quality.update(this.engine.frameMs.value, dt);

    // Interpola a pose do passo fixo pro instante exato do frame.
    this._renderPosition.lerpVectors(this._prevPosition, this.drone.position, alpha);
    this._renderQuaternion.copy(this._prevQuaternion).slerp(this.drone.quaternion, alpha);

    this.model.position.copy(this._renderPosition);
    this.model.quaternion.copy(this._renderQuaternion);
    // Em primeira pessoa a malha fica DENTRO da câmera: some com ela em vez de
    // pintar o interior do corpo do drone na tela inteira.
    this.model.visible = this.camera.thirdPerson;
    spinRotors(this.model, this.drone.rpm, dt);

    this.camera.update(dt, this.drone, this._renderPosition);
    this.world.updateVisual(this.camera.camera.position);

    const ground = this.world.groundHeight(this.drone.position.x, this.drone.position.z);
    this.hud.update(
      {
        speedKmh: toKmh(this.drone.horizontalSpeed),
        altitude: Math.max(0, this.drone.position.y - ground),
        batteryPercent: this.battery.percent,
        batteryWarning: this.battery.warning,
        batteryCritical: this.battery.critical,
        mode: this.drone.mode,
      },
      dt,
    );
    this.hud.updateRace(this.race.hudState(this.drone.position), this.camera.camera);

    this.post.render(this.scene, this.camera.camera, dt);

    this._uiClock += dt;
    if (this._uiClock > 0.25) {
      this._uiClock = 0;
      this.fpsEl.innerHTML =
        `<b>${this.engine.fps.toFixed(0)}</b> fps  ${this.engine.frameMs.value.toFixed(1)} ms\n` +
        `tier ${this.quality.settings.label}${this.quality.overridden ? ' (manual)' : ''}`;
    }
  }

  start() {
    this.engine.start();
  }

  /** Espelho de estado pra inspeção externa (testes e painel de debug). */
  debugState() {
    return {
      tier: this.quality.tier,
      fps: Math.round(this.engine.fps),
      mode: this.drone.mode,
      position: this.drone.position.toArray().map((n) => +n.toFixed(2)),
      speedKmh: +toKmh(this.drone.horizontalSpeed).toFixed(1),
      altitude: +(
        this.drone.position.y - this.world.groundHeight(this.drone.position.x, this.drone.position.z)
      ).toFixed(2),
      battery: +this.battery.percent.toFixed(1),
      chunks: this.world.terrain.chunks.size,
      crashed: this.drone.crashed,
      verticalSpeed: +this.drone.velocity.y.toFixed(2),
      tiltDeg: +((this.drone.tilt * 180) / Math.PI).toFixed(1),
      angularSpeed: +this.drone.angularVelocity.length().toFixed(3),
      throttle: +this.drone.throttle.toFixed(2),
      fov: +this.camera.fov.toFixed(1),
      race: {
        circuit: this.race.circuit?.id ?? null,
        state: this.race.state,
        elapsed: +this.race.elapsed.toFixed(2),
        gate: this.race.gates.active,
        gates: this.race.gates.gates.length,
        combo: this.race.combo,
        splits: this.race.splits.length,
        best: this.save.circuit(this.race.circuit?.id ?? 'aberto').bestTime,
        hasGhost: this.race.ghost.hasGhost,
        credits: this.save.progress.credits,
      },
    };
  }
}

const game = new Game(document.getElementById('app'));
game.start();

globalThis.__DRONEFARER = { game, debugState: () => game.debugState() };
