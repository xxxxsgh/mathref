/**
 * Presets de screenshot (?shot=<nome>). Usados pelas ferramentas de QA visual
 * (tools/shot.mjs) e pelos críticos: o mesmo preset tem que gerar SEMPRE a
 * mesma imagem (tempo virtual, RNG semeado, pose travada).
 *
 * `pose` aqui é o padrão do grey-box; a feature `world` pode (e deve)
 * sobrescrever por nome publicando ctx.services.world.shotPoses[nome].
 *
 * Flags (as features leem ctx.shot.preset para reagir):
 *   hud        mostrar HUD
 *   viewmodel  mostrar a arma em primeira pessoa
 *   ads        arma em mira (aiming down sights)
 *   combat     um inimigo em vista, atirando no jogador
 *   menu       menu principal sobre a cena
 *   sim        segundos de simulação ANTES do primeiro frame (aquecimento)
 */
export const SHOT_PRESETS = {
  street: {
    desc: 'Rua larga na altura dos olhos, sem arma nem HUD',
    pose: { position: [0, 0, 18], yaw: 0, pitch: 0.02 },
    hud: false, viewmodel: false, ads: false, combat: false, menu: false, sim: 0,
  },
  interior: {
    desc: 'Dentro de um prédio, olhando para a porta/janela',
    pose: { position: [16, 0, -4], yaw: Math.PI / 2, pitch: -0.02 },
    hud: false, viewmodel: false, ads: false, combat: false, menu: false, sim: 0,
  },
  viewmodel: {
    desc: 'Arma em hip-fire, rua ao fundo',
    pose: { position: [0, 0, 18], yaw: 0.25, pitch: -0.05 },
    hud: true, viewmodel: true, ads: false, combat: false, menu: false, sim: 0.5,
  },
  ads: {
    desc: 'Mirando (ADS), alvo distante no centro',
    pose: { position: [0, 0, 18], yaw: 0, pitch: 0.0 },
    hud: true, viewmodel: true, ads: true, combat: false, menu: false, sim: 0.8,
  },
  combat: {
    desc: 'Inimigo à frente, atirando no jogador',
    pose: { position: [0, 0, 18], yaw: 0, pitch: 0.0 },
    enemy: { position: [1.5, 0, 4], facePlayer: true },
    hud: true, viewmodel: true, ads: false, combat: true, menu: false, sim: 1.0,
  },
  menu: {
    desc: 'Menu principal sobre a cena',
    pose: { position: [-3, 0, 24], yaw: -0.35, pitch: 0.06 },
    hud: false, viewmodel: false, ads: false, combat: false, menu: true, sim: 0,
  },
};

/** Lê ?shot=… e parâmetros de override (&hud=0|1, &vm=0|1, &seed=N, &sim=s, &pause=1). */
export function parseShot(params) {
  const name = params.get('shot');
  if (!name) return null;
  const base = SHOT_PRESETS[name] || { desc: 'preset desconhecido', pose: SHOT_PRESETS.street.pose, ...SHOT_PRESETS.street };
  const preset = { ...base, name };
  const b = (k) => (params.has(k) ? params.get(k) !== '0' : undefined);
  if (b('hud') !== undefined) preset.hud = b('hud');
  if (b('vm') !== undefined) preset.viewmodel = b('vm');
  if (params.has('sim')) preset.sim = Number(params.get('sim')) || 0;
  return {
    name,
    known: !!SHOT_PRESETS[name],
    preset,
    seed: Number(params.get('seed') ?? 1337) >>> 0,
    pause: params.get('pause') === '1',
  };
}
