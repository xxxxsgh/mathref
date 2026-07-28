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
 * Ruído de CRISTA (ridged): o que produz cordilheiras em vez de colinas.
 *
 * ═══ POR QUE O FBM SOZINHO NÃO FAZ MONTANHA ═══
 *
 * FBM é uma soma de ruído suave. O resultado tem picos e vales, mas todos
 * arredondados e do mesmo tamanho — a leitura é "terreno ondulado", nunca
 * "serra". Não importa quanta amplitude você dê: fica uma colina grande.
 *
 * `1 - |2n - 1|` dobra o ruído em torno do meio. O que era uma passagem suave
 * pelo valor médio vira um VINCO. Somando oitavas desses vincos aparecem
 * cristas longas e afiadas com vales em V entre elas — o perfil de uma
 * cadeia de montanhas.
 *
 * O quadrado no fim (`n * n`) afina ainda mais os picos e alarga os vales,
 * que é como erosão de verdade esculpe rocha.
 */
export function ridgedNoise(x, y, z, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x, y, z) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Interpolação suave 0..1 entre dois limiares (igual ao smoothstep do GLSL). */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Altura do terreno na direção `dir` (unitária, do centro do planeta).
 *
 * Reproduz `rocky` do shader do planeta: FBM com domain warping. O resultado
 * é 0..1, mapeado depois pra unidades de mundo pelo chamador.
 *
 * ═══ AS TRÊS CAMADAS ═══
 *
 *   1. CONTINENTES — FBM com domain warping. Define onde é terra e onde é
 *      mar. Não foi tocado: é o que a órbita mostra, e mudá-lo mudaria o
 *      mapa do planeta inteiro.
 *   2. MÁSCARA DE CORDILHEIRA — um segundo FBM, de frequência baixa, que
 *      decide ONDE há montanha. Sem ela, o ruído de crista cobriria o
 *      planeta uniformemente e nada seria uma "região montanhosa" — seria só
 *      textura. Serra é interessante porque existe planície ao lado.
 *   3. CRISTAS — o ridged noise propriamente dito, só onde a máscara deixa.
 *
 * A máscara também é multiplicada por uma rampa a partir do nível do mar.
 * Sem essa rampa a montanha nasceria na linha d'água num degrau vertical:
 * a praia viraria um paredão.
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
  const base = fbm(px + w, py + w, pz + w, 5);

  return base;
}

/**
 * Contribuição das cordilheiras, em espaço de PERFIL (0..1 acima da água).
 *
 * ⚠ Devolvida separada de propósito. A primeira versão somava as montanhas
 * direto no FBM base, ANTES do `t*t` de `terrainHeight` — e o resultado foi
 * um planeta plano com 31 unidades de desnível.
 *
 * O motivo, medindo a distribuição do ruído: o FBM não vai de 0 a 1. Vai de
 * 0,17 a 0,77, com mediana 0,52. Somar 0,2 de crista a um base de 0,6 dá 0,8,
 * que depois de normalizado pela linha d'água e ELEVADO AO QUADRADO vira 0,44
 * — quase o mesmo 0,38 de antes. O quadrado engolia a montanha inteira.
 *
 * Somando depois do quadrado, a crista chega ao terreno com a amplitude que
 * ela realmente tem.
 *
 * Os limiares da máscara também vieram da medição, não de chute: 0,52→0,66
 * cobre ~45% da superfície com transição suave e satura em ~12%. A primeira
 * versão usava 0,46→0,74, e como só 2,2% do ruído passa de 0,74, a máscara
 * quase nunca chegava a 1.
 */
export function mountainProfile(nx, ny, nz, spec) {
  const force = spec.mountainStrength ?? 0;
  if (force <= 0) return 0;
  const s = spec.noiseScale;
  const seed = spec.noiseSeed;
  const px = nx * s + seed, py = ny * s + seed, pz = nz * s + seed;

  const mask = smoothstep(0.52, 0.66,
    fbm(px * 0.55 + 11.7, py * 0.55 + 11.7, pz * 0.55 + 11.7, 3));
  if (mask <= 0) return 0;

  const crista = ridgedNoise(px * 2.3 + 5.3, py * 2.3 + 5.3, pz * 2.3 + 5.3, 4);
  return mask * crista * force;
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
  let perfil = t * t;

  // Cordilheiras somadas AQUI, depois do quadrado. Ver mountainProfile.
  // A rampa a partir da linha d'água impede que a serra nasça num degrau
  // vertical na praia.
  const costa = smoothstep(0, 0.12, t);
  perfil = Math.min(1, perfil + mountainProfile(nx, ny, nz, spec) * costa);

  return {
    height: (spec.waterLevel + perfil * (1 - spec.waterLevel)) * amplitude,
    isWater: false,
  };
}
