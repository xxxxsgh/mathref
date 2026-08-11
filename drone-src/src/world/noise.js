/**
 * Ruído gradiente 2D e PRNG, escritos à mão.
 *
 * Não é NIH: a função de altura precisa rodar IGUAL na thread principal (pra
 * colisão e pra posicionar props) e dentro de um Web Worker (pra gerar chunk
 * sem engasgar o frame). Sem import nenhum, este arquivo entra nos dois lados
 * sem bundling especial — e são 80 linhas contra uma dependência.
 *
 * Nada aqui pode alocar: são chamadas dezenas de milhares de vezes por chunk.
 */

/** PRNG determinístico de 32 bits. Mesma seed, mesmo mundo, sempre. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash inteiro 2D + seed. Avalanche do xxhash — barato e sem padrão visível. */
export function hash2i(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Aleatório estável em [0,1) para uma célula inteira — usado no espalhamento. */
export const cellRandom = (x, y, seed) => hash2i(x, y, seed) / 4294967296;

// Quintic de Perlin: derivadas primeira e segunda zeradas nas bordas da célula,
// o que elimina a "grade" que o fade cúbico deixa visível em terreno amplo.
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function dotGrad(ix, iy, seed, dx, dy) {
  // Ângulo derivado do hash: gradientes uniformes no círculo, sem tabela.
  const angle = (hash2i(ix, iy, seed) / 4294967296) * Math.PI * 2;
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
}

/** Ruído gradiente em [-1,1]. */
export function noise2D(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;

  const n00 = dotGrad(x0, y0, seed, dx, dy);
  const n10 = dotGrad(x0 + 1, y0, seed, dx - 1, dy);
  const n01 = dotGrad(x0, y0 + 1, seed, dx, dy - 1);
  const n11 = dotGrad(x0 + 1, y0 + 1, seed, dx - 1, dy - 1);

  const u = fade(dx);
  const v = fade(dy);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return a + v * (b - a);
}

/** Soma de oitavas. Retorna aproximadamente [-1,1] graças à normalização. */
export function fbm2D(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    // A seed muda por oitava, senão as oitavas ficam correlacionadas e o
    // relevo repete o mesmo desenho em escalas diferentes.
    sum += noise2D(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Variante "ridged": inverte e eleva os vales em cristas.
 * É o que dá aresta de penhasco em vez de duna arredondada.
 */
export function ridged2D(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2D(x * freq, y * freq, seed + i * 7919));
    sum += n * n * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? (sum / norm) * 2 - 1 : 0;
}
