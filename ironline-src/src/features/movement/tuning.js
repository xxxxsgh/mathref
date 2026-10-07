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

  // sprint tático (#48) — duplo toque no sprint (ou Shift de novo correndo)
  tacFuel: 3.6, // s de "combustível" cheio
  tacRecharge: 2.4, // s parado/sem tático até começar a recarregar
  tacRefill: 1.4, // fuel/s de recarga
  tacMinStart: 0.6, // fuel mínimo para entrar no tático (evita "piscar")
  tacDoubleTap: 0.32, // s entre dois toques de sprint que contam como duplo

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
  slideMaxSpeed: 12.5, // teto absoluto do slide (inclui rampa e cadeia)

  // slide-cancel (#39): pulo ou toque de agachar encerram o slide
  slideCancelMin: 0.1, // s — antes disso o toque de agachar é ignorado (anti duplo-toque)
  slideCancelKeep: 0.92, // fração da velocidade mantida ao cancelar para sprint
  crouchBuffer: 0.2, // s — agachar apertado no ar/vault vira slide ao tocar o chão

  // slide-jump (#40): pulo no slide mantém embalo com teto
  slideJumpKeep: 0.95, // fração da velocidade do slide levada para o pulo
  slideJumpCap: 9.2, // m/s horizontais máximos saindo de um slide-jump
  slideJumpUp: 0.94, // multiplicador da velocidade vertical do pulo

  // tiro no slide (#41): publicado em ctx.player para a arma
  slideSpreadStart: 1.9, // multiplicador de dispersão logo ao entrar no slide
  slideSpreadSettled: 1.35, // depois de estabilizar
  slideSpreadSettle: 0.28, // s para estabilizar
  slideRecoil: 1.2, // multiplicador de recuo no slide

  // slide kick (#42): corpo a corpo durante o slide
  kickRange: 1.7, // m à frente (a partir dos pés)
  kickCone: 0.45, // cos mínimo entre direção do slide e o alvo
  kickDamage: 60,
  kickKnock: 4.2, // m/s de empurrão no alvo
  kickSlow: 0.62, // fração da velocidade que sobra após acertar
  kickCooldown: 0.55,
  kickTime: 0.32, // duração da pose de chute (perna)

  // rampa (#44): aceleração ao longo do declive (g·sinθ·ganho)
  slopeGain: 0.85,
  slopeProbe: 0.7, // m à frente/atrás para medir o declive
  slopeMax: 0.75, // |dh/dx| máximo considerado (degraus íngremes)
  slopeFrictionCut: 0.55, // até quanto do atrito some descendo rampa forte
  slopeExtend: 0.9, // s extras de slide em descida forte

  // slide sob obstáculo baixo (#45): mantém o slide enquanto não cabe agachado
  slideUnderSpeed: 2.6, // m/s mínimos enquanto o teto está baixo

  // cobertura (#46): fim do slide encostado em muro baixo
  coverProbe: 0.85, // m à frente do corpo
  coverLow: 0.55, // altura (pés) onde o muro precisa existir
  coverHigh: 1.3, // altura onde precisa estar livre (muro baixo)

  // dive (#43) — deitar (Z) em sprint ou no slide
  diveUp: 3.4,
  diveBoost: 1.0,
  diveLandKeep: 0.35, // fração da velocidade após o impacto no chão
  diveSlide: 0.6, // s deslizando de bruços depois do impacto

  // montar arma (#50): ADS perto de borda/parede
  mountReach: 0.72, // m à frente dos olhos procurando apoio
  mountAbove: 0.16, // olhos ficam isso acima do apoio
  mountMinBelow: 0.08, // apoio pelo menos isso abaixo dos olhos (sem abaixar)
  mountMaxBelow: 0.62, // e no máximo isso (abaixa os olhos até lá)
  mountRecoil: 0.5, // multiplicador de recuo montado
  mountSway: 0.35, // multiplicador de balanço montado
  mountBreak: 0.6, // m/s — andar mais rápido que isso desmonta

  // mantle / vault
  mantleReach: 0.75, // além do raio
  mantleMax: 2.05, // altura máxima de borda (a partir dos pés)
  vaultMax: 1.2, // obstáculo baixo e fino → pula por cima
  vaultDepth: 0.9, // espessura máxima para vault
  mantleTimeBase: 0.24,
  mantleTimePerM: 0.2,
  vaultTime: 0.52,
  vaultSlideBoost: 0.8, // m/s somados ao encadear vault → slide (#47)

  // pendurar em borda alta (#52)
  hangReach: 2.6, // borda até isso acima dos pés (no ar) → agarra (acima de mantleMax)
  hangEye: 0.12, // olhos ficam isso abaixo da borda pendurado
  hangShimmy: 1.1, // m/s de deslocamento lateral pendurado
  climbTime: 0.62, // s para subir da posição pendurada

  // lean
  leanDist: 0.36,
  leanRoll: 0.13,
  leanSpeed: 9,
  leanHeadR: 0.2, // raio da "cabeça" para o teste de colisão do lean
};
