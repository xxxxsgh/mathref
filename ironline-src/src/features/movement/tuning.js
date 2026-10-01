/**
 * Números da locomoção (metros, segundos, radianos). Ajustados para a
 * "sensação" de FPS militar moderno: aceleração curta e firme, sprint com
 * rampa perceptível, sprint tático explosivo, slide longo e com atrito
 * crescente, pulo baixo (quem sobe obstáculo é o mantle).
 */
export const T = {
  // velocidades-alvo no chão
  walk: 4.5,
  sprint: 6.7,
  tactical: 8.3,
  crouch: 2.35,
  prone: 0.85,
  backMul: 0.82, // andar para trás
  strafeMul: 0.92, // lateral pura
  adsMul: 0.6, // mirando (lido do serviço weapon)

  // acelerações (m/s²) — perfil "rápido no início, encosta no alvo"
  accel: 34, // partindo / mudando de direção
  accelSprint: 13, // walk → sprint (rampa perceptível)
  accelTac: 22, // sprint → sprint tático (estouro)
  decel: 30, // soltando as teclas
  overspeedDecel: 9, // acima do alvo (saída de slide, aterrissagem rápida)
  airAccel: 7,
  airMaxBoost: 0.6, // controle aéreo não acelera além de |v| + isso

  // vertical
  gravity: 19.6,
  jump: 5.35, // ≈ 0.73 m de apogeu
  coyote: 0.11,
  jumpBuffer: 0.14,
  fallDamageFrom: 12.5, // m/s de impacto
  fallDamagePer: 9,

  // posturas: altura da cápsula e dos olhos
  stance: {
    stand: { height: 1.8, eye: 1.62 },
    crouch: { height: 1.28, eye: 1.1 },
    slide: { height: 1.0, eye: 0.9 },
    prone: { height: 0.62, eye: 0.42 },
  },
  eyeLerp: 13, // 1/s — transição de altura dos olhos
  proneHold: 0.38, // segurar agachar por isso → deitar

  // sprint tático
  tacFuel: 3.6, // s
  tacRecharge: 2.4, // s até começar a recarregar
  tacRefill: 1.4, // fuel/s

  // slide
  slideMinSpeed: 5.2,
  slideBoost: 1.35, // m/s somados
  slideMaxStart: 10.2,
  slideFrictionEarly: 4.2, // m/s² nos primeiros slideEarly s
  slideEarly: 0.32,
  slideFriction: 11,
  slideMaxTime: 0.95,
  slideEndSpeed: 3.0,
  slideSteer: 1.3, // rad/s
  slideCooldown: 0.55,

  // dive (deitar em sprint)
  diveUp: 3.4,
  diveBoost: 1.0,

  // mantle / vault
  mantleReach: 0.75, // além do raio
  mantleMax: 2.05, // altura máxima de borda (a partir dos pés)
  vaultMax: 1.2, // obstáculo baixo e fino → pula por cima
  vaultDepth: 0.9, // espessura máxima para vault
  mantleTimeBase: 0.24,
  mantleTimePerM: 0.2,
  vaultTime: 0.52,

  // lean
  leanDist: 0.36,
  leanRoll: 0.13,
  leanSpeed: 9,
};
