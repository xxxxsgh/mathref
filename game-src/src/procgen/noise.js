/**
 * Ruído de valor 3D + FBM, em JavaScript.
 *
 * ═══ POR QUE DUPLICAR O QUE JÁ EXISTE NO SHADER ═══
 *
 * O shader do planeta (entities/Planet.js) desenha continentes a partir de um
 * FBM. Quando o jogador desce até a superfície, o terreno precisa ter os
 * MESMOS continentes — senão você mergulha num oceano azul e aterrissa numa
 * montanha. A CPU precisa, portanto, avaliar a mesma função que a GPU.
 *
 * As duas implementações são idênticas em fórmula, mas não bit a bit: GLSL
 * opera em float de 32 bits e JS em 64. A divergência aparece na terceira ou
 * quarta casa decimal, o que desloca a linha de costa em alguns metros. Nessa
 * escala é invisível — e a alternativa (forçar Math.fround em cada operação)
 * custaria muito mais do que o erro vale.
 *
 * Se um dia isso importar, o caminho certo é gerar o heightmap na GPU num
 * render target e ler de volta, não tentar igualar aritmética.
 */

/** Equivalente ao hash13 do shader. */
export function hash13(x, y, z) {
  // fract(p * 0.3183099 + offset)
  let px = fract(x * 0.3183099 + 0.71);
  let py = fract(y * 0.3183099 + 0.113);
  let pz = fract(z * 0.3183099 + 0.419);
  px *= 17.0; py *= 17.0; pz *= 17.0;
  return fract(px * py * pz * (px + py + pz));
}

function fract(v) { return v - Math.floor(v); }

/** Ruído de valor com interpolação smoothstep — equivalente ao do shader. */
export function valueNoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  // A curva f²(3-2f) é o que elimina as descontinuidades de derivada da
  // interpolação linear (que apareceriam como facetas na iluminação).
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);

  const n000 = hash13(ix, iy, iz);
  const n100 = hash13(ix + 1, iy, iz);
  const n010 = hash13(ix, iy + 1, iz);
  const n110 = hash13(ix + 1, iy + 1, iz);
  const n001 = hash13(ix, iy, iz + 1);
  const n101 = hash13(ix + 1, iy, iz + 1);
  const n011 = hash13(ix, iy + 1, iz + 1);
  const n111 = hash13(ix + 1, iy + 1, iz + 1);

  const x00 = n000 + (n100 - n000) * fx;
  const x10 = n010 + (n110 - n010) * fx;
  const x01 = n001 + (n101 - n001) * fx;
  const x11 = n011 + (n111 - n011) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

/** FBM: soma de oitavas com frequência dobrando e amplitude pela metade.
 *  O fator 2.03 em vez de 2.0 evita que as oitavas se alinhem em grade e
 *  produzam artefatos visíveis em linha reta. */
export function fbm(x, y, z, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, y, z) * amp;
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/**
 * Altura do terreno na direção `dir` (unitária, do centro do planeta).
 *
 * Reproduz `rocky` do shader do planeta: FBM com domain warping. O resultado
 * é 0..1, mapeado depois pra unidades de mundo pelo chamador.
 *
 * @param {number} nx @param {number} ny @param {number} nz direção unitária
 * @param {object} spec spec do planeta (noiseSeed, noiseScale, waterLevel)
 * @returns {number} 0..1
 */
export function planetHeight01(nx, ny, nz, spec) {
  const s = spec.noiseScale;
  const seed = spec.noiseSeed;
  const px = nx * s + seed, py = ny * s + seed, pz = nz * s + seed;

  // Domain warping igual ao do shader: distorce as coordenadas com o próprio
  // ruído antes de amostrar. É o que transforma manchas redondas em
  // continentes com forma.
  const w = fbm(px * 0.5 + 3.1, py * 0.5 + 3.1, pz * 0.5 + 3.1, 3) * 1.6;
  return fbm(px + w, py + w, pz + w, 5);
}

/**
 * Altura em unidades de mundo, com o nível do mar achatado.
 *
 * Achatar tudo abaixo de `waterLevel` num plano é o que cria oceanos com
 * superfície plana em vez de um fundo de mar exposto — e dá ao jogador uma
 * referência de altitude estável.
 *
 * @returns {{ height: number, isWater: boolean }}
 */
export function terrainHeight(nx, ny, nz, spec, amplitude) {
  const h = planetHeight01(nx, ny, nz, spec);
  if (h <= spec.waterLevel) {
    return { height: spec.waterLevel * amplitude, isWater: true };
  }
  // Reescala acima do nível do mar pra que a amplitude total não dependa de
  // onde o nível do mar caiu.
  const t = (h - spec.waterLevel) / (1 - spec.waterLevel);
  // Elevar ao quadrado dá vales largos e picos afiados — perfil de erosão
  // muito mais convincente que o FBM cru, que produz colinas uniformes.
  return { height: (spec.waterLevel + t * t * (1 - spec.waterLevel)) * amplitude, isWater: false };
}
