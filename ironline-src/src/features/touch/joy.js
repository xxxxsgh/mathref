/**
 * Matemática do joystick virtual (pura — testada em tools/unit.test.mjs).
 *
 * Entrada: deslocamento normalizado do polegar (nx, ny) em −1..1, com ny > 0
 * PARA BAIXO (coordenadas de tela). Saída: eixo analógico (y > 0 = frente)
 * já com zona morta e curva de resposta, e as ações digitais equivalentes —
 * o resto do jogo continua lendo `forward/back/left/right/sprint` como se
 * fosse o teclado.
 */
export const JOY = {
  dead: 0.12, // zona morta (fração do raio)
  digital: 0.38, // limiar das teclas digitais por eixo
  sprint: 0.9, // empurrar até o fim…
  sprintCone: 0.42, // …dentro deste cone em torno da frente (rad ≈ 24°)
};

export function joyState(nx, ny, cfg = JOY) {
  const m = Math.hypot(nx, ny);
  if (m < cfg.dead) return { x: 0, y: 0, mag: 0, forward: false, back: false, left: false, right: false, sprint: false };
  const k = Math.min(1, (m - cfg.dead) / (1 - cfg.dead)) / m;
  const x = nx * k;
  const y = -ny * k;
  const mag = Math.min(1, Math.hypot(x, y));
  const ang = Math.atan2(x, y); // 0 = frente
  return {
    x,
    y,
    mag,
    forward: y > cfg.digital,
    back: y < -cfg.digital,
    right: x > cfg.digital,
    left: x < -cfg.digital,
    sprint: m >= cfg.sprint && Math.abs(ang) < cfg.sprintCone,
  };
}
