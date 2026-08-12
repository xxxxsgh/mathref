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
import { POIs } from './world/POIs.js';
import { Radio } from './flight/Radio.js';
import { dominantZone } from './world/Zones.js';
import { MapScreen } from './ui/MapScreen.js';
import { Missions } from './missions/Missions.js';
import { Stage } from './missions/Stage.js';
import { MissionBoard } from './ui/MissionBoard.js';
import { Hangar } from './ui/Hangar.js';
import { computeSpec, buyUpgrade, setEquipped } from './meta/Loadout.js';
import { Damage } from './flight/Damage.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { Options } from './ui/Options.js';
import { Tutorial } from './ui/Tutorial.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { Killcam } from './camera/Killcam.js';
import { PhotoMode } from './camera/PhotoMode.js';
import { Weather, WEATHER_PRESETS } from './world/Weather.js';
import { HUD, toKmh } from './ui/HUD.js';

/** Atalho local: usado só pelo cálculo de proximidade do áudio. */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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

    this.pois = new POIs(this.scene, this.world.terrain, this.save, (event, payload) =>
      this._onPoiEvent(event, payload),
    );
    // A base é a origem do mundo: é dela que sai o sinal e é pra ela que a
    // bateria manda voltar.
    this.home = new THREE.Vector3(0, 0, 0);
    this.radio = new Radio(this.home);
    this.world.registerThermals(this.wind);
    this.map = new MapScreen(this.ui, this.world.terrain, this.pois, this.save);

    // Carga transportada (kg). Entra no modelo de voo como massa e no consumo
    // de bateria — o peso é sentido no ar, não anunciado por texto.
    this.payloadKg = 0;
    this.stage = new Stage(this.scene, this.world.terrain);
    this.missions = new Missions({
      save: this.save,
      world: this.world,
      drone: this.drone,
      camera: this.camera.camera,
      spawnMarker: (position, color, radius) => this.stage.spawnMarker(position, color, radius),
      spawnSmoke: (position) => this.stage.spawnSmoke(position),
      spawnVehicle: () => this.stage.spawnVehicle(),
      removeMarker: (object) => this.stage.remove(object),
      setPayload: (kg) => {
        this.payloadKg = kg;
      },
      startRace: (circuitId) => {
        this.race.setCircuit(circuitId, new THREE.Vector3(0, 0, 0));
        this.restartRun();
      },
      raceState: () => ({
        state: this.race.state,
        elapsed: this.race.elapsed,
        finish: this.race.finishInfo,
      }),
      event: (name, payload) => this._onMissionEvent(name, payload),
    });
    this.board = new MissionBoard(this.ui, this.missions, this.save, (id) =>
      this.missions.start(id),
    );
    this.damage = new Damage(this.save);
    this.audio = new AudioSystem(this.save);
    // O AudioContext nasce suspenso e só destrava com gesto do usuário; por
    // isso a inicialização é pendurada no primeiro toque ou tecla.
    const unlock = () => {
      if (this.audio.unlock()) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.weather = new Weather(this.scene, this.world, this.quality);
    this.hangar = new Hangar(this.ui, this.save, () => this.applyLoadout());
    this.applyLoadout();

    this.killcam = new Killcam(this.scene, this.model);
    this.photo = new PhotoMode(this.renderer, this.scene, this.quality);
    this.options = new Options(this.ui, {
      save: this.save,
      quality: this.quality,
      audio: this.audio,
      camera: this.camera,
      post: this.post,
      input: this.input,
      onQuality: () => {
        applyShadowSettings(this.renderer, this.quality.settings);
        this.post.applyTier(this.quality.settings);
      },
    });
    this.options.applySaved();
    this.tutorial = new Tutorial(this.ui, this.save, this.input.touch.enabled);
    this.debug = new DebugPanel(this.ui, this);

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

  /**
   * Traduz a build montada no hangar para o que o resto do jogo entende.
   * Chamado na abertura e a cada mudança — nunca por frame.
   */
  applyLoadout() {
    this.spec = computeSpec(this.save.progress);
    this.battery.setCapacity(CONFIG.BATTERY.capacity * this.spec.batteryScale);
    this.radio.range = CONFIG.RADIO.range * this.spec.radioScale;
    // O zoom da câmera é um FOV menor: lente mais longa enxerga mais longe e
    // enquadra menos, que é o custo real de uma teleobjetiva.
    this.camera.zoom = this.spec.zoom;
  }

  /** Telas que congelam a simulação. Photo mode e killcam também param. */
  get paused() {
    return (
      this.map.open ||
      this.board.open ||
      this.hangar.open ||
      this.options.open ||
      this.photo.active ||
      this.killcam.playing
    );
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
        this.audio.play(payload.scrape ? 'scrape' : payload.perfect ? 'gatePerfect' : 'gate');
        if (payload.scrape) this.hud.banner('RASPOU', 0.7, 'danger');
        else if (payload.perfect) this.hud.banner('CENTRO', 0.6);
        break;
      }

      case 'finish':
        this.audio.play('finish');
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

    // Com o mapa aberto o jogo para. Sem isso, consultar o mapa em voo é
    // sinônimo de bater — e o jogador aprende a nunca abrir o mapa.
    if (this.paused) return;

    this.radio.update(dt, this.drone.position);
    this.radio.applyTo(axes, this.engine.elapsed);

    this._prevPosition.copy(this.drone.position);
    this._prevQuaternion.copy(this.drone.quaternion);

    this.wind.update(dt);
    this.wind.sample(this.drone.position, this._windAt);

    // O vento é sentido conforme a estabilidade da build: hélices agressivas e
    // chassi leve são sacudidos muito mais que um cargueiro.
    this._windAt.multiplyScalar(this.spec.windScale * this.weather.windScale);

    this._env.wind = this._windAt;
    this._env.rateScale = this.spec.rateScale;
    this._env.dragScale = this.spec.dragScale;
    this._env.thrustScale = this.battery.thrustScale * this.spec.thrustScale;
    // Carga entra como massa: mais inércia de rotação, menos empuxo por quilo e
    // menos autoridade pra corrigir — exatamente o que um drone carregado sente.
    this._env.massScale =
      this.spec.massScale * this.weather.massScale * (1 + this.payloadKg / CONFIG.DRONE.massKg / 4);
    // Hélice quebrada puxa pro lado: entra como taxa parasita e o piloto passa
    // a voar segurando o drone reto.
    this._env.torqueBias = this.damage.torqueBias();

    this.drone.update(dt, axes, this._env);
    this.battery.update(
      dt,
      this.drone.crashed ? 0 : this.drone.throttle * this.spec.drainScale * this.damage.drainMultiplier,
      this.payloadKg,
    );

    const hit = this.world.collision.resolve(this.drone);
    if (hit) this._onCollision(hit);

    const agl = this.drone.position.y - this.world.groundHeight(this.drone.position.x, this.drone.position.z);
    if (!hit && agl > 2 && this.drone.speed < 22) this.drone.markSafe();

    // Respawn automático: sem menu, sem tela de game over. Bateu, volta.
    // O respawn NÃO reinicia a volta: o cronômetro segue correndo e a decisão
    // de recomeçar continua sendo do jogador.
    if (this.drone.canRespawn) this._respawn();

    this.killcam.record(dt, this.engine.elapsed, this.drone.position, this.drone.quaternion);
    this.race.update(dt, this.drone, this._prevPosition, this.drone.position);
    this.pois.update(dt, this.drone.position, this.weather.visibility());
    this.missions.update(dt);
    this.world.update(dt, this.drone.position, this.drone.velocity);
    this.world.updateZone(dt, this.drone.position, this.wind);
    this.weather.update(dt, this.drone.position, this.drone.quaternion, this.wind);
    this._updateRecharge(dt);
  }

  _handleActions() {
    // Qualquer comando pula a repetição. Killcam é explicação, não punição:
    // no instante em que o jogador quiser voltar a voar, ela sai da frente.
    if (this.killcam.playing) {
      const axes = this.input.axes;
      const moving =
        Math.abs(axes.pitch) > 0.2 || Math.abs(axes.roll) > 0.2 || Math.abs(axes.yaw) > 0.2;
      if (this.input.pressed.size > 0 || moving) this.killcam.stop();
    }

    if (this.input.took('toggleMode')) {
      const mode = this.drone.toggleMode();
      this.hud.banner(mode === 'ACRO' ? 'ACRO' : 'ANGLE', 1.1, mode === 'ACRO' ? 'acro' : '');
    }
    if (this.input.took('restart')) {
      // Numa missão, R recomeça a MISSÃO; fora dela, recomeça a volta. Nos dois
      // casos é instantâneo e não passa por menu nenhum.
      if (this.missions.active) this.missions.restart();
      else this.restartRun();
    }
    if (this.input.took('missions')) this.board.toggle();
    if (this.input.took('hangar')) this.hangar.toggle();
    if (this.input.took('weather')) this._cycleWeather();
    if (this.input.took('pause')) {
      // ESC fecha o que estiver aberto antes de abrir as opções: é o que a
      // tecla faz em todo lugar, e contrariar isso irrita.
      if (this.photo.active) this.photo.exit();
      else if (this.killcam.playing) this.killcam.stop();
      else if (this.map.open || this.board.open || this.hangar.open) {
        this.map.toggle(false);
        this.board.toggle(false);
        this.hangar.toggle(false);
      } else this.options.toggle();
    }
    if (this.input.took('photo')) {
      if (this.photo.active) {
        this.photo.exit();
      } else {
        this.photo.enter(this.camera.camera);
        this.hud.banner('PHOTO MODE — P sai, E salva PNG', 2.6);
      }
    }
    if (this.photo.active && this.input.took('action')) {
      const name = this.photo.capture(() => this._renderFrame(this.photo.camera, 0));
      this.hud.banner(name, 2.0);
    }
    if (this.input.took('noRisk')) {
      this.save.progress.noRisk = !this.save.progress.noRisk;
      if (this.save.progress.noRisk) this.damage.clear();
      this.save.write();
      this.hud.banner(this.save.progress.noRisk ? 'MODO SEM RISCO' : 'RISCO LIGADO', 1.8);
    }
    // Reparar só na base: é lá que a conta é paga, e é o que dá peso à decisão
    // de continuar avariado em vez de voltar.
    if (this.input.took('action') && this._repairable) {
      const result = this.damage.repair();
      this.hud.banner(
        result.repaired ? `REPARADO −${result.cost} cr` : `SEM CRÉDITO (${result.cost} cr)`,
        2.2,
        result.repaired ? '' : 'danger',
      );
    }
    if (this.board.open) {
      for (let i = 1; i <= 5; i++) {
        if (this.input.took(`pick${i}`)) this.board.pickByIndex(i - 1);
      }
    }
    if (this.input.took('thirdPerson')) this.camera.toggleThirdPerson();
    if (this.input.took('nextCircuit')) this._switchCircuit(1);
    if (this.input.took('prevCircuit')) this._switchCircuit(-1);
    if (this.input.took('map')) this.map.toggle();

    if (this.input.took('action')) {
      const poi = this.pois.nearestAvailable(this.drone.position);
      if (this.pois.active) this.pois.cancelChallenge();
      else if (poi) this.pois.startChallenge(poi);
    }
  }

  /**
   * Recarga na base. A bateria só vira recurso de verdade se existir um lugar
   * pra onde voltar — senão "acabou a bateria" é só uma falha, não uma decisão
   * de quão longe dá pra ir.
   */
  _updateRecharge(dt) {
    const distance = Math.hypot(this.drone.position.x - this.home.x, this.drone.position.z - this.home.z);
    const agl = this.drone.position.y - this.world.groundHeight(this.drone.position.x, this.drone.position.z);
    const onPad = distance < CONFIG.RADIO.padRadius && agl < 6;
    if (onPad && !this.battery.empty) {
      this.battery.recharge(dt, CONFIG.RADIO.rechargePerSecond);
    }
    this._repairable = onPad && this.damage.any;
    this._onPad = onPad;
  }

  /** Alterna o clima. Por missão/sessão, nunca um relógio global. */
  _cycleWeather() {
    const ids = Object.keys(WEATHER_PRESETS);
    const index = ids.indexOf(this.weather.presetId ?? 'limpo');
    const next = ids[(index + 1) % ids.length];
    const preset = this.weather.set(next);
    this.hud.banner(preset.name.toUpperCase(), 2.0);
  }

  _onMissionEvent(event, payload) {
    switch (event) {
      case 'missionStart':
        this.hud.banner(payload.def.title.toUpperCase(), 2.4);
        break;
      case 'photo':
        this.audio.play('checkpoint');
        this.post.flash(0.45, 0xffffff); // estouro de flash: a foto saiu
        this.hud.banner(`FOTO ${payload.index + 1}/${payload.total}`, 1.0);
        break;
      case 'cargoTaken':
        this.hud.banner(`CARGA A BORDO — ${payload.kg} kg`, 2.0, 'acro');
        break;
      case 'missionDone':
        this.audio.play('reward');
        this.post.flash(0.5, 0xffcf49);
        this.hud.banner(`MISSÃO CUMPRIDA +${payload.reward} cr`, 2.8, 'gold');
        break;
      case 'missionFail':
        this.hud.banner('MISSÃO FALHOU — R reinicia', 2.4, 'danger');
        break;
      default:
        break;
    }
  }

  _onPoiEvent(event, payload) {
    switch (event) {
      case 'poiFound':
        this.hud.banner(`DESCOBERTO: ${payload.poi.def.name}`, 2.4);
        break;
      case 'challengeStart':
        this.hud.banner(payload.poi.def.challenge, 2.8);
        break;
      case 'checkpoint':
        this.audio.play('checkpoint');
        this.post.flash(0.2, 0x9dfff0);
        break;
      case 'challengeDone':
        this.audio.play('reward');
        this.post.flash(0.5, 0xffcf49);
        this.hud.banner(`DESAFIO CONCLUÍDO +${payload.reward} cr`, 2.4, 'gold');
        break;
      case 'challengeFail':
        this.hud.banner('TEMPO ESGOTADO', 1.6, 'danger');
        break;
      default:
        break;
    }
  }

  _onCollision(hit) {
    if (hit.hard) {
      if (this.drone.crash()) {
        this.camera.addShake(CONFIG.CAMERA.shakeCrash);
        this.post.flash(0.35, 0xff4d5e);
        this.audio.play('crash');
        // Killcam só nas batidas feias: repetir toda encostada viraria
        // interrupção constante em vez de explicação.
        if (hit.impact > CONFIG.DRONE.crashSpeed * 1.8 && !this.save.progress.noRisk) {
          this.killcam.start();
        }

        // O risco real: quebra peça, derruba a carga e gera conta de reparo.
        const broken = this.damage.applyCrash(hit.impact, hit.normal.y);
        if (this.payloadKg > 0 && !this.damage.noRisk) {
          this.payloadKg = 0;
          this.missions.abort();
          this.hud.banner('CARGA PERDIDA NO IMPACTO', 2.6, 'danger');
        } else if (broken) {
          this.hud.banner(`AVARIA: ${this.damage.describe()}`, 2.4, 'danger');
        } else {
          this.hud.banner('CRASH', 1.2, 'danger');
        }
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

    // A perda de sinal é a MESMA degradação usada pela câmera avariada da
    // Fase 6 — um caminho só pro feed piorar, seja qual for a causa.
    this.post.setSignal(this.radio.signal);
    this.post.setDamage(this.damage.cameraArtifacts);
    this.camera.setSignal(this.radio.signal);

    const poi = this.pois.hudState(this.drone.position);
    // A missão tem prioridade sobre o desafio de POI na linha de objetivo: são
    // duas coisas que o jogador aceitou, e a que ele aceitou por último manda.
    const objective =
      this.missions.objective() ??
      (poi
        ? `${poi.challenge} — ${poi.index + 1}/${poi.total}, ${poi.remaining.toFixed(0)}s, ${Math.round(poi.distance)}m`
        : null);

    this.hud.updateWorld({
      zone: dominantZone(this.drone.position.x, this.drone.position.z).zone.name,
      signal: this.radio.signal,
      onPad: this._onPad,
      objective,
    });

    this.map.draw(this.drone.position, this.drone.heading, this.home);
    this._updateAudio(dt);
    this.debug.update(dt);
    this.tutorial.update(dt, {
      altitude: Math.max(0, this.drone.position.y - ground),
      speedKmh: toKmh(this.drone.horizontalSpeed),
      mode: this.drone.mode,
      raceState: this.race.state,
    });

    // Killcam e photo mode substituem a câmera do voo; nos dois casos o feed
    // FPV sai de cena, porque nenhum dos dois é o que o drone está vendo.
    const aspect = window.innerWidth / window.innerHeight;
    const replay = this.killcam.update(dt, aspect);
    const free = this.photo.update(dt, this.input.axes, aspect);
    const camera = replay ?? free ?? this.camera.camera;

    this.hud.setVisible(!free);
    this.model.visible = this.camera.thirdPerson || Boolean(replay) || Boolean(free);
    this._renderFrame(camera, dt);

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

  /**
   * Alimenta o áudio. Roda no render e não no passo fixo: os parâmetros são
   * suavizados por `setTargetAtTime`, então amostrar mais vezes não melhora
   * nada e só custa chamadas.
   */
  _updateAudio(dt) {
    if (!this.audio.ready) return;

    // "Parede perto muda o som": a proximidade sai da mesma consulta de altura
    // que a colisão usa, sem raycast novo.
    const ground = this.world.groundHeight(this.drone.position.x, this.drone.position.z);
    const agl = this.drone.position.y - ground;
    let proximity = clamp01(1 - agl / 12);
    for (const chunk of this.world.terrain.chunksNear(this.drone.position.x, this.drone.position.z, 0)) {
      for (const collider of chunk.colliders) {
        const d = Math.hypot(this.drone.position.x - collider.x, this.drone.position.z - collider.z);
        if (d < 14) proximity = Math.max(proximity, 1 - d / 14);
      }
    }

    // Doppler: só a componente da velocidade que aponta pro "ouvinte" conta.
    // Em primeira pessoa o ouvinte é o próprio drone, então o que sobra é o
    // efeito de passar raspando por geometria — que é o que se quer ouvir.
    const approach = this.drone.velocity.length() * (this.camera.thirdPerson ? 1 : 0.25);

    this.audio.update(dt, {
      rpm: this.drone.rpm,
      airSpeed: this.drone.airSpeed ?? this.drone.speed,
      approachSpeed: approach,
      proximity,
      silent: this.drone.crashed || this.map.open || this.board.open || this.hangar.open,
      batteryWarning: this.battery.warning,
      batteryCritical: this.battery.critical,
    });

    // Camada de música pelo contexto. A ordem é a prioridade: bateria crítica
    // manda em tudo, porque é a informação mais urgente que existe.
    const layer = this.battery.critical
      ? 'critico'
      : this.radio.degraded || this.damage.any
        ? 'tensa'
        : this.race.state === 'running' || this.missions.active
          ? 'corrida'
          : 'exploracao';
    this.audio.setMusic(layer);

    if (this.radio.critical && !this._signalWasLost) this.audio.play('signalLost');
    this._signalWasLost = this.radio.critical;
  }

  /**
   * Desenha um frame com a câmera dada. Isolado porque o photo mode precisa
   * forçar um render logo antes de ler o canvas: `preserveDrawingBuffer` é
   * falso (ligá-lo custa desempenho o tempo todo), então o buffer só existe
   * no instante seguinte ao desenho.
   */
  _renderFrame(camera, dt) {
    if (camera === this.camera.camera) {
      this.post.render(this.scene, camera, dt);
    } else {
      // Sem pós-processamento na repetição e na foto: barril e ruído são o
      // feed do drone, não a imagem do jogo.
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, camera);
    }
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
      world: {
        zone: dominantZone(this.drone.position.x, this.drone.position.z).zone.id,
        signal: +this.radio.signal.toFixed(3),
        distanceFromHome: Math.round(this.drone.position.distanceTo(this.home)),
        poisFound: this.pois.discovered.length,
        mapOpen: this.map.open,
        challenge: this.pois.active ? this.pois.active.poi.def.id : null,
      },
      mission: {
        id: this.missions.definition?.id ?? null,
        type: this.missions.definition?.type ?? null,
        objective: this.missions.objective(),
        payloadKg: this.payloadKg,
        boardOpen: this.board.open,
        done: this.save.progress.missionsDone.length,
      },
      polish: {
        killcam: this.killcam.playing,
        photo: this.photo.active,
        options: this.options.open,
        tutorialStep: this.tutorial.finished ? null : this.tutorial.step,
        paused: this.paused,
      },
      audio: {
        ready: this.audio.ready,
        state: this.audio.ctx?.state ?? 'ausente',
        music: this.audio._musicLayer,
      },
      risk: {
        parts: { ...this.damage.parts },
        repairCost: this.damage.repairCost(),
        noRisk: this.damage.noRisk,
        weather: this.weather.presetId ?? 'limpo',
        windScale: +this.weather.windScale.toFixed(2),
        visibility: Math.round(this.weather.visibility()),
      },
      loadout: {
        chassis: this.save.progress.chassis,
        upgrades: { ...this.save.progress.upgrades },
        equipped: { ...this.save.progress.equipped },
        spec: {
          thrust: +this.spec.thrustScale.toFixed(3),
          mass: +this.spec.massScale.toFixed(3),
          rate: +this.spec.rateScale.toFixed(3),
          drag: +this.spec.dragScale.toFixed(3),
          wind: +this.spec.windScale.toFixed(3),
          battery: +this.spec.batteryScale.toFixed(3),
          radio: +this.spec.radioScale.toFixed(3),
        },
        hangarOpen: this.hangar.open,
      },
    };
  }
}

const game = new Game(document.getElementById('app'));
game.start();

// Superfície de inspeção: usada pelo painel de debug e pelos testes de aceite.
// Fica fora da classe de propósito — nada do jogo lê daqui.
globalThis.__DRONEFARER = {
  game,
  debugState: () => game.debugState(),
  buyUpgrade,
  setEquipped,
};
