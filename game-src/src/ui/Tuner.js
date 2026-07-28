import { CONFIG } from '../config.js';

/**
 * Painel de tuning (tecla G).
 *
 * Existe por um motivo específico: ajustar game feel é um processo empírico de
 * dezenas de iterações pequenas. Editar o config, salvar, recarregar e voar de
 * novo custa uns 20 segundos por tentativa — e depois de 30 tentativas você
 * perdeu a referência de como estava antes. Com o painel a mudança é
 * instantânea e comparável.
 *
 * O lil-gui é carregado sob demanda (import dinâmico) pra não entrar no bundle
 * inicial. Ele é ferramenta de desenvolvimento; um jogador que nunca aperta G
 * não deveria pagar por ele no download.
 */
export class Tuner {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.gui = null;
    this.loading = false;
  }

  async toggle() {
    if (this.gui) {
      this.gui.destroy();
      this.gui = null;
      return;
    }
    if (this.loading) return;
    this.loading = true;
    const { default: GUI } = await import('lil-gui');
    this.loading = false;
    this._build(GUI);
  }

  _build(GUI) {
    const gui = new GUI({ title: 'Tuning · G' });
    this.gui = gui;
    gui.domElement.style.zIndex = '60';

    const F = CONFIG.flight;
    const C = CONFIG.camera;

    const fly = gui.addFolder('Voo — rotação');
    fly.add(F, 'maxPitchRate', 0.2, 4).name('taxa pitch (rad/s)');
    fly.add(F, 'maxYawRate', 0.2, 4).name('taxa yaw');
    fly.add(F, 'maxRollRate', 0.2, 8).name('taxa roll');
    fly.add(F, 'pitchYawResponse', 1, 25).name('resposta pitch/yaw');
    fly.add(F, 'rollResponse', 1, 25).name('resposta roll');
    fly.add(F, 'angularDamping', 0.5, 20).name('amortecimento');

    const lin = gui.addFolder('Voo — translação');
    lin.add(F, 'maxSpeed', 50, 900).name('velocidade máx');
    lin.add(F, 'boostMultiplier', 1, 5).name('mult. boost');
    lin.add(F, 'accelResponse', 0.2, 8).name('aceleração');
    lin.add(F, 'decelResponse', 0.2, 8).name('desaceleração');
    lin.add(F, 'brakeResponse', 0.5, 15).name('freio');
    lin.add(F, 'lateralDrag', 0, 14).name('arrasto lateral (peso)');
    lin.add(F, 'strafeAccel', 0, 400).name('propulsores laterais');

    const br = gui.addFolder('Barrel roll');
    br.add(F.barrelRoll, 'duration', 0.2, 1.5).name('duração (s)');
    br.add(F.barrelRoll, 'lateralKick', 0, 250).name('impulso lateral');
    br.add(F.barrelRoll, 'cooldown', 0, 2).name('recarga (s)');

    const cam = gui.addFolder('Câmera');
    cam.add(C, 'positionLambda', 1, 25).name('mola de posição');
    cam.add(C, 'rotationLambda', 0.5, 25).name('atraso da âncora');
    cam.add(C, 'rollFollow', 0, 1).name('segue roll');
    cam.add(C, 'lookAhead', 0, 90).name('olhar à frente');
    cam.add(C, 'swayGain', 0, 8).name('deslocamento na curva');
    cam.add(C, 'fovBase', 40, 110).name('FOV base');
    cam.add(C, 'fovSpeedGain', 0, 45).name('FOV por velocidade');
    cam.add(C, 'fovBoostGain', 0, 45).name('FOV no boost');
    cam.add(C, 'boostShake', 0, 0.8).name('tremor do boost');
    cam.add(C.offset, '1', -6, 14).name('altura da câmera');
    cam.add(C.offset, '2', 3, 45).name('distância');

    const mouse = gui.addFolder('Mouse');
    mouse.add(CONFIG.input.mouse, 'sensitivity', 0.0002, 0.01).name('sensibilidade');
    mouse.add(CONFIG.input.mouse, 'deadzone', 0, 0.4).name('zona morta');
    mouse.add(CONFIG.input.mouse, 'gain', 0.2, 3).name('ganho');
    mouse.add(CONFIG.input.mouse, 'recenter', 0, 6).name('recentragem');
    mouse.add(CONFIG.input.mouse, 'invertY').name('inverter Y');

    // Qualidade: forçar um tier serve pra medir o custo de cada nível sem
    // esperar o sistema adaptativo decidir sozinho.
    const q = gui.addFolder('Qualidade');
    const qState = {
      auto: this.engine.quality.auto,
      tier: this.engine.quality.tier.name,
    };
    q.add(qState, 'auto').name('adaptativa').onChange((v) => {
      this.engine.quality.auto = v;
    });
    q.add(qState, 'tier', CONFIG.quality.tiers.map((t) => t.name))
      .name('nível')
      .onChange((name) => {
        const i = CONFIG.quality.tiers.findIndex((t) => t.name === name);
        this.engine.quality.setTier(i);
        qState.auto = false;
      });

    // Exportar as constantes ajustadas: sem isso você tuna por 20 minutos e
    // perde tudo ao recarregar. Copia um JSON pronto pra colar no config.js.
    gui.add({
      exportar: () => {
        const out = JSON.stringify({ flight: CONFIG.flight, camera: CONFIG.camera }, null, 2);
        navigator.clipboard?.writeText(out).then(
          () => console.info('[tuner] valores copiados para a área de transferência'),
          () => console.info('[tuner] valores:\n' + out),
        );
        console.info(out);
      },
    }, 'exportar').name('copiar valores ↗');

    fly.open();
    cam.open();
  }
}
