/**
 * Utilitários de matemática usados no jogo inteiro.
 *
 * O mais importante daqui é `damp`. Vale entender por quê:
 *
 * A forma ingênua de suavizar é `a += (b - a) * 0.1` todo frame. Isso é um bug
 * silencioso: o resultado depende do FRAMERATE. A 120fps a suavização acontece
 * duas vezes mais rápido que a 60fps, então o jogo tem "feel" diferente em
 * máquinas diferentes — e no iPad, que oscila entre 60 e 30, o feel muda
 * durante a partida.
 *
 * A forma correta é interpolação exponencial: a fração aplicada por frame é
 * `1 - exp(-lambda * dt)`. Isso é matematicamente equivalente a resolver
 * dx/dt = lambda * (alvo - x), que é independente de como o tempo foi fatiado.
 */

/** Interpolação exponencial independente de framerate.
 *  @param {number} current
 *  @param {number} target
 *  @param {number} lambda taxa (maior = mais rápido)
 *  @param {number} dt segundos
 *  @returns {number} */
export function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Versão in-place de `damp` para Vector3 do Three. */
export function dampVec3(current, target, lambda, dt) {
  const k = Math.exp(-lambda * dt);
  current.x = target.x + (current.x - target.x) * k;
  current.y = target.y + (current.y - target.y) * k;
  current.z = target.z + (current.z - target.z) * k;
  return current;
}

/** Slerp com taxa exponencial: mesma ideia do `damp`, mas para rotação. */
export function dampQuat(current, target, lambda, dt) {
  // slerp(t) com t = 1 - exp(-lambda*dt) aproxima a mesma EDO no espaço das
  // rotações. Não é exato (o caminho geodésico não é linear), mas o erro é
  // pequeno para dt de frame e é o padrão da indústria.
  current.slerp(target, 1 - Math.exp(-lambda * dt));
  return current;
}

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** @param {number} a @param {number} b @param {number} t */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Move `current` em direção a `target` no máximo `maxDelta`. Linear, não
 *  exponencial — útil pra acelerador, que deve subir em taxa constante. */
export function moveTowards(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** Deadzone radial num par de eixos, com renormalização.
 *  Deadzone por eixo (o jeito errado, e comum) cria um "+" morto no centro do
 *  analógico e faz diagonais pularem. Aplicar no comprimento do vetor e
 *  reescalar preserva a direção e dá um centro limpo.
 *  @returns {[number, number]} */
export function radialDeadzone(x, y, deadzone) {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return [0, 0];
  // Reescala pra que o valor logo fora da deadzone comece em 0, não em `deadzone`.
  const scaled = (mag - deadzone) / (1 - deadzone) / mag;
  return [x * scaled, y * scaled];
}

/** Curva expo: mantém o sinal, comprime o centro. expo=1 é linear.
 *  Serve pra ter precisão perto do neutro sem perder o alcance máximo. */
export function applyExpo(v, expo) {
  return Math.sign(v) * Math.pow(Math.abs(v), expo);
}

/** Deadzone de eixo único (para gatilhos e teclas analógicas). */
export function deadzone1(v, dz) {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Curva de ease do barrel roll: acelera, mantém, desacelera.
 *  Um roll linear parece robótico; este perfil dá o "estalo" do Star Fox. */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Envolve `v` no intervalo [-half, half). Usado pro wrap da poeira espacial. */
export function wrapSymmetric(v, half) {
  const size = half * 2;
  return ((((v + half) % size) + size) % size) - half;
}
