/**
 * Painel de debug e ajuste ao vivo.
 *
 * Fica atrás de `?debug=1`. Em produção não existe: nem o DOM é criado, nem o
 * `lil-gui` entra no bundle (é importado dinamicamente e só quando o parâmetro
 * está presente). Um painel de desenvolvimento visível ao jogador é uma
 * distração, e enviado a todo mundo é peso morto no download.
 */
export class DebugPanel {
  constructor(container, game) {
    this.game = game;
    this.enabled = new URLSearchParams(location.search).has('debug');
    if (!this.enabled) return;

    this.root = document.createElement('div');
    this.root.id = 'debug';
    container.appendChild(this.root);
    this._clock = 0;

    this._buildTuner();
  }

  /**
   * Tuning ao vivo das constantes de voo. Carregado sob demanda: `lil-gui` é
   * uma dependência de desenvolvimento e não pode aparecer no bundle que o
   * jogador baixa.
   */
  async _buildTuner() {
    let GUI;
    try {
      ({ GUI } = await import('lil-gui'));
    } catch {
      // Sem lil-gui instalado o painel de números continua funcionando; só o
      // ajuste ao vivo fica de fora.
      return;
    }

    const { CONFIG } = await import('../config.js');
    const gui = new GUI({ title: 'DRONEFARER — tuning' });
    gui.domElement.style.zIndex = '40';

    const drone = gui.addFolder('Drone');
    drone.add(CONFIG.DRONE, 'thrustToWeight', 1.2, 6, 0.05);
    drone.add(CONFIG.DRONE, 'dragHorizontal', 0.002, 0.06, 0.001);
    drone.add(CONFIG.DRONE, 'dragVertical', 0.005, 0.15, 0.001);
    drone.add(CONFIG.DRONE, 'maxAngleDeg', 10, 75, 1);
    drone.add(CONFIG.DRONE, 'responseHalfLife', 0.01, 0.3, 0.005);
    drone.add(CONFIG.DRONE, 'dampingHalfLife', 0.02, 0.6, 0.005);
    drone.add(CONFIG.DRONE.rates, 'pitch', 60, 900, 10);
    drone.add(CONFIG.DRONE.rates, 'roll', 60, 900, 10);
    drone.add(CONFIG.DRONE.rates, 'yaw', 30, 500, 10);

    const camera = gui.addFolder('Câmera');
    camera.add(CONFIG.CAMERA, 'fovBase', 60, 140, 1);
    camera.add(CONFIG.CAMERA, 'fovMax', 60, 150, 1);
    camera.add(CONFIG.CAMERA, 'barrel', 0, 0.6, 0.01);
    camera.add(CONFIG.CAMERA, 'vignette', 0, 1, 0.01);
    camera
      .add({ tilt: this.game.camera.tiltDeg }, 'tilt', 0, 60, 1)
      .onChange((v) => this.game.camera.setTilt(v));

    const wind = gui.addFolder('Vento');
    wind.add(CONFIG.WIND, 'enabled');
    wind.add(CONFIG.WIND, 'baseSpeed', 0, 15, 0.1);
    wind.add(CONFIG.WIND, 'gustAmplitude', 0, 20, 0.1);
    wind.close();

    this.gui = gui;
  }

  /** Números ao vivo. Atualiza 4×/s: 60 seria ilegível e custaria layout. */
  update(dt) {
    if (!this.enabled) return;
    this._clock += dt;
    if (this._clock < 0.25) return;
    this._clock = 0;

    const s = this.game.debugState();
    this.root.textContent = [
      `${s.fps} fps  ${s.tier}  chunks ${s.chunks}`,
      `pos ${s.position.join(', ')}  alt ${s.altitude} m`,
      `vel ${s.speedKmh} km/h  vert ${s.verticalSpeed} m/s  tilt ${s.tiltDeg}°`,
      `modo ${s.mode}  acel ${s.throttle}  fov ${s.fov}°`,
      `bat ${s.battery}%  sinal ${s.world.signal}  zona ${s.world.zone}`,
      `corrida ${s.race.state} gate ${s.race.gate + 1}/${s.race.gates} ${s.race.elapsed}s`,
      `missão ${s.mission.id ?? '—'}  carga ${s.mission.payloadKg} kg`,
      `dano h${Math.round(s.risk.parts.helice * 100)} c${Math.round(s.risk.parts.camera * 100)} b${Math.round(s.risk.parts.bateria * 100)} (${s.risk.repairCost} cr)`,
      `clima ${s.risk.weather}  áudio ${s.audio.state}/${s.audio.music ?? '—'}`,
      `créditos ${s.race.credits}  chassi ${s.loadout.chassis}`,
    ].join('\n');
  }
}
