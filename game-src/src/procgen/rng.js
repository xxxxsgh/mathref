/**
 * Gerador pseudoaleatório determinístico com seed.
 *
 * Por que não `Math.random()`: geração procedural precisa ser REPRODUTÍVEL.
 * A mesma seed tem que produzir o mesmo universo hoje e daqui a seis meses, em
 * qualquer navegador. `Math.random()` não aceita seed e a implementação varia
 * entre engines — é inutilizável pra isso.
 *
 * Por que não a lib `alea`: são 8 linhas de código, e a última publicação dela
 * foi em 2021. Menos uma dependência.
 *
 * `mulberry32` é um PRNG de 32 bits, rápido, com período 2^32 e boa
 * distribuição para uso gráfico (não serve pra criptografia — nem precisa).
 */

/** Hash de string → inteiro 32 bits. Versão do FNV-1a.
 *  Permite usar seeds legíveis ('starfarer-01') em vez de números. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mistura dois inteiros num terceiro, bem distribuído.
 *  É a peça que permite seeds DERIVADAS por camada:
 *      const seedPlaneta3 = mix(seedMundo, mix(hashString('planet'), 3))
 *  Assim gerar o planeta 3 não depende de ter gerado o 1 e o 2 antes — o que
 *  seria o caso se todos consumissem o mesmo stream sequencial. Sem isso,
 *  carregar o mundo fora de ordem gera um mundo diferente.
 *  @param {number} a @param {number} [b] */
export function mix(a, b = 0) {
  let h = (a ^ Math.imul(b ^ (b >>> 16), 2246822507)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Cria um PRNG. Retorna função que dá float em [0, 1).
 *  @param {number|string} seed */
export function createRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Açúcar em cima de um rng: faixas, inteiros, escolha e sinal. */
export function rngHelpers(rng) {
  return {
    next: rng,
    /** float em [min, max) */
    range: (min, max) => min + rng() * (max - min),
    /** inteiro em [min, max] */
    int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
    /** -1 ou 1 */
    sign: () => (rng() < 0.5 ? -1 : 1),
    /** um elemento do array */
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    /** true com probabilidade p */
    chance: (p) => rng() < p,
  };
}
