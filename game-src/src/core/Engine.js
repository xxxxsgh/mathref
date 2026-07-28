import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Renderer, lightAllLayers } from './Renderer.js';
import { Quality, detectMobile } from './Quality.js';
import { Input } from './Input.js';
import { Ship } from '../entities/Ship.js';
import { CameraRig } from '../systems/CameraRig.js';
import { generateSkybox } from '../procgen/Skybox.js';
import { SpaceDust } from '../procgen/SpaceDust.js';
import { HUD } from '../ui/HUD.js';
import { DebugPanel } from '../ui/DebugPanel.js';
import { TouchUI } from '../ui/TouchUI.js';
import { Combat } from '../systems/Combat.js';
import { SolarSystem } from '../procgen/SolarSystem.js';

/**
 * Orquestrador: monta a cena, roda o loop, coordena os sistemas.
 *
 * ═══ SOBRE O TIMESTEP ═══
 *
 * Usamos timestep VARIÁVEL com clamp, não fixo. Timestep fixo (acumulador +
 * passos de 1/60) é o padrão quando há física de corpo rígido, porque um
 * solver de colisão é sensível ao tamanho do passo e precisa de determinismo.
 *
 * Aqui não temos solver: a integração é exponencial e independente de
 * framerate por construção (ver MathUtils.damp). Timestep variável é então
 * mais simples e não introduz o "temporal aliasing" de renderizar entre dois
 * passos de simulação.
 *
 * O clamp em 100ms é obrigatório: quando a aba volta do background, o
 * navegador entrega um dt gigante e sem o clamp a nave teleporta.
 *
 * ═══ ORDEM DE ATUALIZAÇÃO ═══
 *
 * input → nave → câmera → mundo → HUD → render.
 *
 * A câmera atualiza DEPOIS da nave (senão persegue a posição do frame
 * anterior e adiciona um frame de atraso perceptível), e a HUD depois da
 * câmera (porque projeta vetores usando a matriz da câmera deste frame).
 */
/** Controle neutro: usado enquanto o jogador está morto, pra que a nave
 *  continue integrando (desacelerando por arrasto) sem obedecer ao input. */
const NEUTRAL_CONTROL = {
  pitch: 0, yaw: 0, roll: 0, throttle: 0,
  strafeX: 0, strafeY: 0, fire: false, boost: false, brake: false, barrelRoll: 0,
};

export class Engine {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.isMobile = detectMobile();

    this.renderer = new Renderer(canvas);
    this.quality = new Quality({ isMobile: this.isMobile });
    this.scene = new THREE.Scene();
    this.input = new Input(canvas, { isMobile: this.isMobile });

    this._setupLights();

    this.ship = new Ship(this.scene);
    this.cameraRig = new CameraRig(this.renderer.camera);
    this.dust = new SpaceDust(this.scene);
    this.system = new SolarSystem(this.scene, CONFIG.world.seed);
    this.combat = new Combat(this.scene, this.ship);
    this.combat.asteroidsProvider = () => this.system.asteroids;

    // Começa perto do cinturão em vez da origem: a origem é o centro da
    // estrela e não tem nada por perto. Nascer com um planeta e o cinturão à
    // vista é o que faz o jogador entender que existe um mundo.
    this._placeStartingPosition();

    this.hud = new HUD(document.getElementById('hud'));
    this.debug = new DebugPanel(document.getElementById('debug-panel'));
    this.touchUI = this.input.touch
      ? new TouchUI(document.getElementById('touch-ui'), this.input.touch, () => this.debug.toggle())
      : null;

    /** Skybox atual; regerado quando o tier muda de resolução. */
    this._skybox = null;
    this._skyboxKey = null;

    // Um único ponto de reação a mudança de qualidade. Cada sistema lê o que
    // interessa a ele; ninguém precisa saber que os outros existem.
    this.quality.onChange((tier) => {
      this.renderer.applyQuality(tier);
      this.dust.setQuality(tier);
      this.dust.setPixelRatio(this.renderer.gl.getPixelRatio());
      this.combat.setQuality(tier);
      this.combat.explosions.setPixelRatio(this.renderer.gl.getPixelRatio());
      this.system.buildAsteroids(tier.dust);
      // Sombra desligada nesta fase: o iPad renderiza um shadow map inteiro
      // por frame e no espaço vazio não há NADA pra receber sombra. O flag do
      // tier passa a valer na Fase 3, quando planetas e estações existirem.
      this.sunLight.castShadow = false;
      this._ensureSkybox(tier);
    });

    this.combat.onPlayerDeath = () => {
      this.hud.bigMessage('NAVE DESTRUÍDA', CONFIG.combat.player.respawnDelay, 'bad');
      this.hud.flashDamage();
    };
    this.combat.onPlayerRespawn = () => {
      // A câmera precisa reancorar: a nave "renasce" onde estava, mas o rig
      // tem estado acumulado (sway, âncora de rotação) da morte.
      this.cameraRig.snapTo(this.ship.flight);
      this.hud.bigMessage('SISTEMAS RESTAURADOS', 1.6, 'good');
    };

    this.running = false;
    this._lastTime = 0;
    this._tick = this._tick.bind(this);
    this._rafId = 0;

    // A aba em background continua recebendo rAF em alguns navegadores mas com
    // throttle severo. Pausar explicitamente evita simular durante isso.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else this.resume();
    });
  }

  _setupLights() {
    const W = CONFIG.world;
    const dir = new THREE.Vector3(...W.sunDirection).normalize();

    this.sunLight = new THREE.DirectionalLight(W.sunColor, W.sunIntensity);
    // A luz direcional do Three usa a DIREÇÃO da posição ao alvo. Como ela é
    // paralela (não tem posição real), basta pôr a fonte longe na direção do
    // sol; o alvo fica na origem.
    this.sunLight.position.copy(dir).multiplyScalar(1000);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Preenchimento ambiente. Sem ele o lado escuro da nave fica preto puro,
    // o que no espaço é fisicamente correto e visualmente ilegível — no
    // espaço real existe luz refletida de nebulosas e estrelas suficiente pra
    // justificar um preenchimento azulado.
    this.ambient = new THREE.AmbientLight(W.ambientColor, W.ambientIntensity);
    this.scene.add(this.ambient);
    // Luzes só iluminam objetos cujas layers elas têm habilitadas. Como a
    // cena é dividida em faixa próxima e distante, toda luz precisa alcançar
    // as duas — senão os planetas ficariam pretos.
    lightAllLayers(this.sunLight);
    lightAllLayers(this.ambient);

    // Luz de contorno vinda do lado oposto, pra separar a silhueta da nave do
    // fundo escuro. É truque de iluminação de cinema, não de física.
    this.rimLight = new THREE.DirectionalLight(0x6d8fd0, 0.4);
    this.rimLight.position.copy(dir).multiplyScalar(-800);
    this.scene.add(this.rimLight);
    lightAllLayers(this.rimLight);

    // ── Luz de preenchimento presa à CÂMERA ──────────────────────────────
    // Problema real que isso resolve: a estrela tem uma posição fixa no mundo,
    // mas o jogador vira a nave pra qualquer lado. Sempre que ele voa NA
    // DIREÇÃO da estrela, a traseira da nave — que é a vista que ele tem 95%
    // do tempo — fica inteiramente na sombra, e a nave vira uma silhueta preta
    // com dois pontos de motor.
    //
    // A solução é uma luz que acompanha a câmera, deslocada pra cima e pra um
    // lado. Não é física, é linguagem de cinema (a "fill light" de um set):
    // garante que o volume da nave seja sempre legível, sem apagar a direção
    // dramática que a estrela dá.
    this.fillLight = new THREE.DirectionalLight(0xdce8ff, 0.85);
    lightAllLayers(this.fillLight);
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);
    this._fillOffset = new THREE.Vector3();
  }

  /** Reposiciona a luz de preenchimento em relação à câmera, todo frame. */
  _updateFillLight() {
    const cam = this.renderer.camera;
    // Deslocamento no espaço da câmera: um pouco à direita e acima do ponto de
    // vista. Iluminar exatamente do eixo da câmera achata o objeto (é o
    // "flash de máquina fotográfica"); o deslocamento é o que preserva volume.
    this._fillOffset.set(0.55, 0.75, 0.2).applyQuaternion(cam.quaternion);
    this.fillLight.position.copy(cam.position).addScaledVector(this._fillOffset, 40);
    this.fillLight.target.position.copy(this.ship.position);
    this.fillLight.target.updateMatrixWorld();
  }

  /** Posiciona a nave num ponto interessante do sistema no início da partida. */
  _placeStartingPosition() {
    const S = CONFIG.system;
    const belt = this.system.beltSpec;
    const start = new THREE.Vector3();
    if (belt) {
      // Logo dentro da borda interna do cinturão, com o centro do sistema
      // (e a estrela) à frente.
      const r = belt.innerRadius - 2600;
      start.set(r, 900, 0);
    } else {
      start.set(S.orbitInner, 0, 0);
    }
    this.ship.flight.position.copy(start);

    // Aponta pro planeta mais próximo: dá um destino visível de saída.
    const { planet } = this.system.nearestPlanet(start);
    if (planet) {
      const m = new THREE.Matrix4();
      m.lookAt(start, planet.object.position, new THREE.Vector3(0, 1, 0));
      this.ship.flight.quaternion.setFromRotationMatrix(m);
    }
    this.cameraRig.snapTo(this.ship.flight);
  }

  _ensureSkybox(tier) {
    const size = CONFIG.skybox.size[tier.skybox];
    // Regerar o cubemap custa 100–300ms. Só refaz se a resolução realmente
    // mudou — descer de tier normalmente mantém a mesma resolução de céu.
    if (this._skyboxKey === size) return;
    this._skyboxKey = size;
    this._skybox?.dispose();
    this._skybox = generateSkybox(this.renderer.gl, size);
    this.scene.background = this._skybox.texture;
    // O céu também ilumina: usá-lo como `environment` faz o metal da nave
    // refletir a nebulosa em vez de refletir preto. Custo zero (a textura já
    // existe) e é o que amarra a nave ao cenário.
    this.scene.environment = this._skybox.texture;
    this.scene.environmentIntensity = 0.35;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this.hud.show();
    this._rafId = requestAnimationFrame(this._tick);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._rafId);
  }

  resume() {
    if (this.running) return;
    // Reinicia o relógio: senão o primeiro dt inclui todo o tempo pausado.
    this._lastTime = performance.now();
    this.running = true;
    this._rafId = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(this._tick);

    const rawMs = now - this._lastTime;
    this._lastTime = now;
    // Clamp: dt acima de 100ms (aba em background, breakpoint, GC longo)
    // faria a integração dar saltos absurdos. Melhor o jogo rodar em câmera
    // lenta por um frame do que teleportar a nave.
    const dt = Math.min(rawMs, 100) / 1000;

    this.update(dt);
    this.renderer.render(this.scene);

    this.quality.sample(rawMs);
    this.debug.update(rawMs, this.renderer, this.quality, this.entityCount);
  }

  /** @param {number} dt */
  update(dt) {
    this.input.update(dt);
    const state = this.input.state;

    if (this.input.actions.toggleDebug) this.debug.toggle();
    if (this.input.actions.toggleAssist) {
      this.ship.flight.assistEnabled = !this.ship.flight.assistEnabled;
    }
    if (this.input.actions.toggleTuner) this.onToggleTuner?.();

    // Morto: a nave não responde a controle, mas a câmera e os efeitos
    // continuam rodando — é o que faz a morte ter peso em vez de virar um
    // corte seco pra tela de respawn.
    if (!this.combat.playerDead) {
      this.ship.update(state, dt);
    } else {
      this.ship.flight.update(NEUTRAL_CONTROL, dt);
    }

    this.cameraRig.update(this.ship.flight, dt);
    // A câmera distante espelha a próxima; precisa ser sincronizada DEPOIS
    // do rig e ANTES de qualquer coisa que dependa da matriz de projeção.
    this.renderer.syncCameras();
    // Depois da câmera: a luz de preenchimento é definida em relação a ela.
    this._updateFillLight();
    this.system.update(this.renderer.camera.position, dt);

    // O combate depende da câmera (escolha de alvo usa o eixo de visão), por
    // isso vem depois dela e antes da HUD.
    this.combat.update(state, this.renderer.camera, dt);
    if (this.combat.playerHealth.justHitHull) this.hud.flashDamage();

    this.dust.update(this.ship.position, this.ship.speed, dt);

    this.touchUI?.update(state);
    this.hud.update(this.ship, state, this.renderer.camera, this.combat, dt);
  }

  /** Contagem de entidades ativas (nave, inimigos, projéteis, partículas). */
  get entityCount() {
    return this.combat.entityCount;
  }

  dispose() {
    this.pause();
    this.input.dispose();
    this.system.dispose();
    this.combat.dispose();
    this.ship.dispose();
    this.dust.dispose();
    this._skybox?.dispose();
    this.renderer.dispose();
  }
}
