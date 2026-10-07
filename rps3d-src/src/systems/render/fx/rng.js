// Gerador pseudoaleatório do fx, trocável: por padrão Math.random; cenários
// de captura fixam uma semente (mulberry32) para imagens estáveis.
let R = Math.random;

export function seedFx(seed) {
  if (seed === null || seed === undefined) {
    R = Math.random;
    return;
  }
  let a = seed >>> 0;
  R = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Número em [0,1). */
export const rand = () => R();
