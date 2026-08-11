import * as THREE from 'three';
import { DCFG } from './config.js';
import { Quad } from './physics/Quad.js';
import { DroneMesh } from './entities/DroneMesh.js';
import { DroneInput } from './core/DroneInput.js';
import { Terrain } from './world/Terrain.js';
import { Props } from './world/Props.js';
import { Sky } from './world/Sky.js';
import { Course, formatTime } from './race/Course.js';
import { CameraRig, VIEW_LOS } from './systems/CameraRig.js';
import { Effects } from './systems/Effects.js';
import { ReturnHome } from './systems/ReturnHome.js';
import { DroneAudio } from './audio/DroneAudio.js';
import { OSD } from './ui/OSD.js';
import { TouchUI } from './ui/TouchUI.js';
import { Telemetry } from './ui/Telemetry.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { clamp, smoothstep } from '../core/MathUtils.js';
import { detectMobile } from '../core/Quality.js';

/**
 * Orquestrador do modo drone.
 *
 * ═══ ORDEM DE ATUALIZAÇÃO ═══
 *
 *   input → RTH → física → colisão → câmera → mundo → OSD → render
 *
 * Duas dependências dessa ordem não são negociáveis:
 *
 *   • O RTH roda ANTES da física porque ele escreve nos MESMOS comandos que
 *     a física lê. Depois seria tarde: o comando valeria só no frame
 *     seguinte, e o piloto automático voaria com um quadro de atraso
 *     permanente — que num controlador em malha fechada não é um detalhe,
 *     é oscilação.
 *   • A câmera roda DEPOIS da física, senão persegue a posição do frame
 *     anterior. E o OSD depois da câmera, porque projeta o gate usando a
 *     matriz de projeção DESTE frame.
 *
 * ═══ TIMESTEP ═══
 *
 * Variável com clamp, como no jogo de nave. Não há solver de corpo rígido
 * aqui: toda integração ou é exponencial (`damp`, independente de framerate
 * por construção) ou é Euler sobre acelerações contínuas, onde o erro é
 * proporcional a dt e imperceptível abaixo de 100 ms.
 *
 * O clamp em 100 ms é obrigatório: quando a aba volta do background o
 * navegador entrega um dt gigante, e sem o teto o drone teleporta para fora
 * do mapa — com a agravante de que aqui isso significa "bateu no chão a
 * 400 m/s".
 */
export class Engine {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.isMobile = detectMobile();
    this.canvas = canvas;

    // ── Renderer ──────────────────────────────────────────────────────
    // Uma câmera só, ao contrário do jogo de nave. Lá havia planetas a
    // 300.000 unidades e detalhes de meia unidade, e um único par near/far
    // não tinha precisão para os dois. Aqui a razão é 4000:1 e o depth
    // buffer de 24 bits resolve com folga — duas passadas seriam custo puro.
    this.gl = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance',
      stencil: false, alpha: false,
    });
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    // PCFShadowMap e não PCFSoftShadowMap: a variante "soft" está depreciada
    // nesta versão do Three (ela cai para PCF e ainda emite aviso no console),
    // e o borrado extra não compensa numa sombra de 34 m de lado.
    this.gl.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      DCFG.world.fovFPV, 1, DCFG.world.near, DCFG.world.far,
    );

    this._setupLights();

    // ── Mundo ─────────────────────────────────────────────────────────
    // A ordem importa: o circuito precisa do terreno para saber a altura dos
    // gates, e os props precisam do circuito para não nascer dentro deles.
    this.terrain = new Terrain(this.scene);
    this.course = new Course(this.scene, this.terrain);
    this.props = new Props(this.scene, this.terrain, this.course.exclusions);
    this.sky = new Sky(this.scene);

    /** Interface mínima que a física enxerga do mundo. Passar o terreno e os
     *  props inteiros acoplaria a física à geração de cenário; com quatro
     *  funções, ela não sabe que existe um mapa. */
    this.world = {
      heightAt: (x, z) => this.terrain.heightAt(x, z),
      normalAt: (x, z, out) => this.terrain.normalAt(x, z, out),
      isWater: (x, z) => this.terrain.isWater(x, z),
      hitProp: (pos, r) => this.props.hit(pos, r),
    };

    // ── Drone ─────────────────────────────────────────────────────────
    this.quad = new Quad();
    this.mesh = new DroneMesh(this.scene);
    this.homePos = new THREE.Vector3(0, this.props.padHeight + 0.3, 0);
    this.quad.reset(this.homePos, 0);

    this.input = new DroneInput(canvas, { isMobile: this.isMobile });
    this.rig = new CameraRig(this.camera);
    this.effects = new Effects(this.scene);
    this.rth = new ReturnHome();
    this.audio = new DroneAudio();

    // ── Interface ─────────────────────────────────────────────────────
    this.osd = new OSD(document.getElementById('osd'));
    this.telemetry = new Telemetry(document.getElementById('telemetry'));
    this.pauseMenu = new PauseMenu(document.getElementById('pause'), this);
    this.touchUI = this.input.touch
      ? new TouchUI(document.getElementById('touch-ui'), this.input,
                    (act) => this._doAction(act))
      : null;

    // ── Estado de partida ─────────────────────────────────────────────
    this.gatesPassed = 0;
    this._respawning = false;
    this._cmd = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
    this._groundPoint = new THREE.Vector3();
    this._groundNormal = new THREE.Vector3(0, 1, 0);
    this.signalLoss = 0;

    // ── Qualidade adaptativa ──────────────────────────────────────────
    this.qualityIndex = this.isMobile ? DCFG.quality.startMobile : DCFG.quality.startDesktop;
    this._samples = [];
    this._badStreak = 0;
    this._goodStreak = 0;
    this._upgrades = 0;
    this._applyQuality();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    // `orientationchange` no iPad dispara ANTES de o layout terminar de
    // ajustar; o frame extra é o que evita ler dimensões erradas.
    window.addEventListener('orientationchange', () => {
      requestAnimationFrame(() => requestAnimationFrame(this._onResize));
    });
    this._onResize();

    this.running = false;
    this._lastTime = 0;
    this._rafId = 0;
    this._tick = this._tick.bind(this);

    // A aba em background continua recebendo rAF com throttle severo em
    // alguns navegadores. Pausar explicitamente evita simular durante isso —
    // e evita voltar de um alt-tab com a bateria vazia.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else if (!this.pauseMenu.open) this.resume();
    });

    this.rig.snapTo(this.quad);
  }

  _setupLights() {
    const W = DCFG.world;
    const dir = new THREE.Vector3(...W.sunDirection).normalize();

    this.sun = new THREE.DirectionalLight(W.sunColor, W.sunIntensity);
    this.sun.position.copy(dir).multiplyScalar(200);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this._sunDir = dir;

    // Luz hemisférica em vez de ambiente uniforme. Ao ar livre, o
    // preenchimento vem do CÉU por cima (azul) e do SOLO por baixo (verde
    // acinzentado) — uma luz ambiente chapada apaga essa diferença e deixa a
    // parte de baixo do drone com a mesma cor da de cima, o que destrói a
    // leitura de qual lado está para cima. Num jogo em que saber onde é o
    // chão é a habilidade central, isso não é detalhe.
    this.hemi = new THREE.HemisphereLight(W.skyHorizon, DCFG.terrain.colors.grass, 0.85);
    this.scene.add(this.hemi);
  }

  /**
   * A caixa de sombra acompanha o drone.
   *
   * Cobrir os 2600 m do mapa com um shadow map de 2048 daria 1,3 m por
   * texel — a sombra de um drone de 25 cm não apareceria, e a de uma árvore
   * seria uma mancha quadrada. Uma caixa de 34 m centrada no drone dá 1,7 cm
   * por texel: sombra nítida onde o jogador está olhando, e nenhuma sombra
   * calculada onde ele não está.
   */
  _updateShadowCamera() {
    if (!this.sun.castShadow) return;
    const p = this.quad.position;
    this.sun.position.copy(p).addScaledVector(this._sunDir, 160);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
  }

  _applyQuality() {
    const q = DCFG.quality.levels[this.qualityIndex];
    const dpr = Math.min(q.pixelRatio, DCFG.quality.maxPixelRatio, window.devicePixelRatio || 1);
    this.gl.setPixelRatio(dpr);
    this.gl.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const r = DCFG.quality.shadowRange;
      const cam = this.sun.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.updateProjectionMatrix();
      // Descartar o mapa antigo obriga o Three a recriar com o novo tamanho.
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.effects.setPixelRatio(dpr);
    this._onResize();
  }

  _sampleQuality(frameMs) {
    const Q = DCFG.quality;
    // Frames absurdos (aba em background, breakpoint) poluem a amostra.
    if (frameMs > 250) return;
    this._samples.push(frameMs);
    if (this._samples.length < Q.sampleWindow) return;

    const sorted = this._samples.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this._samples.length = 0;
    const target = this.isMobile ? Q.targetMsMobile : Q.targetMsDesktop;

    if (median > target) {
      this._goodStreak = 0;
      if (++this._badStreak >= Q.downgradeStreak && this.qualityIndex < Q.levels.length - 1) {
        this._badStreak = 0;
        this.qualityIndex++;
        this._applyQuality();
      }
    } else if (median < target * Q.upgradeHeadroom) {
      this._badStreak = 0;
      if (++this._goodStreak >= Q.upgradeStreak && this._upgrades < Q.maxUpgrades
          && this.qualityIndex > 0) {
        this._goodStreak = 0;
        this._upgrades++;
        this.qualityIndex--;
        this._applyQuality();
      }
    } else {
      this._badStreak = 0;
      this._goodStreak = 0;
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    // `false` no terceiro argumento: o CSS já cuida do tamanho visual, e
    // deixar os dois mexerem causa um laço de resize no Safari.
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects?.setProjection(this.camera.fov, h);
  }

  // ─────────────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this.osd.show();
    this._rafId = requestAnimationFrame(this._tick);
    this.osd.message('APERTE ARMAR PARA LIGAR OS MOTORES', 3.5);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._rafId);
  }

  resume() {
    if (this.running || this.pauseMenu.open) return;
    // Reinicia o relógio: sem isso o primeiro dt inclui todo o tempo pausado
    // e o clamp o transforma num salto de 100 ms.
    this._lastTime = performance.now();
    this.running = true;
    this._rafId = requestAnimationFrame(this._tick);
  }

  toggleMute() {
    this._muted = !this._muted;
    this.audio.setMuted(this._muted);
    return this._muted;
  }

  /** Bateria nova: recoloca o drone no pad com o pacote cheio. É o que se faz
   *  entre voos de verdade, e é o "reiniciar" natural deste jogo. */
  newBattery() {
    this.quad.reset(this.homePos, 0);
    this.course.reset();
    this.course.notifyTeleport();
    this.input.neutralize();
    this.osd.resetFlightTime();
    this.rig.snapTo(this.quad);
    this.osd.message('BATERIA NOVA', 1.6, 'good');
  }

  _tick(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(this._tick);

    const rawMs = now - this._lastTime;
    this._lastTime = now;
    const dt = Math.min(rawMs, 100) / 1000;

    this.update(dt);
    this.gl.render(this.scene, this.camera);

    this._sampleQuality(rawMs);
    this.telemetry.update(rawMs, this.gl, this.quad, this.effects.activeCount, dt);
  }

  /** @param {number} dt */
  update(dt) {
    this.input.update(dt);
    const stick = this.input.state;

    for (const act in this.input.actions) {
      if (this.input.actions[act]) this._doAction(act);
    }

    // ── Comando ───────────────────────────────────────────────────────
    const cmd = this._cmd;
    cmd.throttle = stick.throttle;
    cmd.roll = stick.roll;
    cmd.pitch = stick.pitch;
    cmd.yaw = stick.yaw;

    const rthMsg = this.rth.update(cmd, this.quad, this.world, dt);
    if (rthMsg) this.osd.message(rthMsg, 1.8);

    // ── Física ────────────────────────────────────────────────────────
    const wasCrashed = this.quad.crashed;
    this.quad.update(cmd, dt, this.world);
    if (this.quad.crashed && !wasCrashed) this._onCrash();
    if (this.quad.crashed && this.quad.crashTimer <= 0) this._respawn();

    // ── Câmera ────────────────────────────────────────────────────────
    this.rig.update(this.quad, this.homePos, dt);
    // O FOV muda ao trocar de câmera, e o tamanho das partículas em pixels
    // depende dele. Reatribuir um uniform por frame é barato; detectar a
    // mudança custaria mais linhas do que economizaria.
    this.effects.setProjection(this.camera.fov, window.innerHeight);
    this._updateShadowCamera();
    this.sky.update(this.camera.position, dt);
    this.mesh.update(this.quad, dt);
    // Em FPV a câmera está DENTRO do drone: desenhá-lo faria as hélices e a
    // bateria cobrirem a tela. É a mesma razão pela qual um piloto de FPV
    // não vê o próprio drone.
    this.mesh.setVisible(this.rig.view !== 0);

    // ── Sopro das hélices ─────────────────────────────────────────────
    const agl = this.quad.altitudeAGL;
    if (agl < 3.5 && !this.quad.crashed) {
      const p = this.quad.position;
      const gy = this.terrain.heightAt(p.x, p.z);
      this._groundPoint.set(p.x, gy, p.z);
      this.terrain.normalAt(p.x, p.z, this._groundNormal);
      const thrust = (this.quad.motorThrust[0] + this.quad.motorThrust[1]
                    + this.quad.motorThrust[2] + this.quad.motorThrust[3]) / 4;
      const intensity = thrust * (1 - clamp(agl / 3.5, 0, 1));
      this.effects.propWash(this._groundPoint, this._groundNormal, intensity,
                            this.terrain.isWater(p.x, p.z), dt);
    }
    this.effects.update(dt);

    // ── Circuito ──────────────────────────────────────────────────────
    const r = this.course.update(this.quad.position, dt);
    if (r.crossed) {
      this.gatesPassed++;
      this.audio.beep(r.lapDone ? 1320 : 1046, r.lapDone ? 0.16 : 0.07);
      if (r.lapDone) {
        this.osd.message(
          r.record ? `RECORDE · ${formatTime(this.course.lastLap)}`
                   : `VOLTA · ${formatTime(this.course.lastLap)}`,
          3, 'good',
        );
      }
    }

    // ── Link de vídeo ─────────────────────────────────────────────────
    this._updateSignal();

    // ── Áudio e OSD ───────────────────────────────────────────────────
    const listenerDist = this.rig.view === VIEW_LOS
      ? this.quad.position.distanceTo(this.camera.position) : 0;
    this.audio.update(this.quad, this.signalLoss, listenerDist, dt);

    this.touchUI?.update(this.quad);
    this.osd.update(this.quad, stick, this.camera, this.course, {
      signalLoss: this.signalLoss,
      viewName: this.rig.viewName,
      rth: this.rth.label,
    }, dt);
  }

  /**
   * Perda de sinal do link de vídeo.
   *
   * ═══ POR QUE ISTO NÃO É UM EFEITO DECORATIVO ═══
   *
   * O chuvisco é o único indicador de distância que funciona sem que o
   * piloto tire os olhos da imagem. Ele cresce com a distância e piora perto
   * do chão — porque é isso que acontece com 5,8 GHz: o terreno entre a
   * antena do drone e a do piloto bloqueia o sinal, e voar baixo e longe é a
   * combinação que derruba o link.
   *
   * O efeito colateral é o mais interessante: o jogador aprende a SUBIR
   * antes de se afastar, que é exatamente o que se ensina a um piloto novo.
   * Nenhum tutorial precisou existir para isso.
   */
  _updateSignal() {
    const V = DCFG.video;
    const p = this.quad.position;
    const dist = Math.hypot(p.x - this.homePos.x, p.z - this.homePos.z);
    let loss = smoothstep(V.staticStart, V.staticFull, dist);
    // Penalidade por voar baixo, proporcional à distância: perto de casa,
    // rasante não atrapalha nada.
    const lowFactor = 1 - clamp(this.quad.altitudeAGL / V.lowAltitudePenalty, 0, 1);
    loss += lowFactor * smoothstep(V.staticStart * 0.45, V.staticFull, dist) * 0.55;
    // A vista de solo é o que o piloto vê com os próprios olhos: sem link,
    // sem chuvisco.
    if (this.rig.view === VIEW_LOS) loss = 0;
    this.signalLoss = clamp(loss, 0, 1);
  }

  _doAction(act) {
    const q = this.quad;
    switch (act) {
      case 'arm':
        if (q.crashed) return;
        q.armed = !q.armed;
        // Armar libera o drone congelado depois de um respawn: é o mesmo
        // gesto que já liga os motores, e não precisa de outro botão.
        if (q.armed) q.suspended = false;
        this.audio.armTone(q.armed);
        if (q.armed) {
          this.osd.message('ARMADO', 1.2, 'good');
          // Armar SEMPRE zera o acelerador. É o procedimento de segurança de
          // qualquer controlador de voo — e aqui evita o caso em que o
          // jogador arma com o manche onde estava e o drone salta.
          this.input.neutralize();
        } else {
          this.osd.message('DESARMADO', 1.2);
          this.rth.disengage(q);
        }
        break;
      case 'mode':
        q.mode = q.mode === 'acro' ? 'angle' : 'acro';
        this.osd.message(q.mode === 'acro' ? 'MODO ACRO' : 'MODO ANGLE', 1.4);
        this.audio.beep(q.mode === 'acro' ? 1200 : 800, 0.06, 0.16);
        break;
      case 'camera':
        this.osd.message(this.rig.cycleView(), 1.2);
        break;
      case 'rth': {
        const msg = this.rth.toggle(q);
        if (msg) this.osd.message(msg, 1.8);
        break;
      }
      case 'reset':
        this.newBattery();
        break;
      case 'restart':
        this.course.reset();
        this.osd.message('CIRCUITO REINICIADO', 1.6);
        break;
      case 'debug':
        this.telemetry.toggle();
        break;
      case 'pause':
        this.pauseMenu.toggle();
        break;
      default:
        break;
    }
  }

  _onCrash() {
    this.effects.debris(this.quad.position);
    this.effects.sparks(this.quad.position);
    this.audio.crash();
    this.rig.kick(1);
    this.rth.disengage(this.quad);
    this.osd.message(`DRONE DESTRUÍDO · ${this.quad.crashReason}`, 2, 'bad');
  }

  /**
   * Renasce no último gate conquistado.
   *
   * A bateria NÃO é restaurada. É a decisão de balanceamento mais importante
   * do modo: com bateria nova a cada batida, bater deixa de custar e a
   * corrida vira tentativa e erro sem consequência. Mantendo o consumo, cada
   * acidente encurta o voo — e a decisão "arrisco a linha rápida ou fecho a
   * volta?" passa a existir.
   */
  _respawn() {
    const pos = this.course.respawnPoint();
    const heading = this.course.respawnHeading();
    this.quad.reset(pos, heading, { keepBattery: true });
    // Congelado até o piloto armar — ver `suspended` em physics/Quad.js.
    // Sem isso o drone renasce no ar, cai e bate de novo, num laço.
    this.quad.suspended = true;
    // O `home` do RTH e da cerca continua sendo o ponto de decolagem, não
    // onde o drone renasceu.
    this.quad.home.copy(this.homePos);
    this.input.neutralize();
    this.course.notifyTeleport();
    this.rig.snapTo(this.quad);
    this.osd.message('DRONE NOVO · ARME PARA VOLTAR', 2.4);
  }

  dispose() {
    this.pause();
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.terrain.dispose();
    this.props.dispose();
    this.sky.dispose();
    this.course.dispose();
    this.effects.dispose();
    this.mesh.dispose();
    this.audio.dispose();
    this.gl.dispose();
  }
}
