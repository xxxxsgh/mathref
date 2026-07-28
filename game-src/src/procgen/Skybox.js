import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hashString } from './rng.js';

/**
 * Skybox estelar procedural: nebulosas + campo de estrelas + disco solar.
 *
 * ═══ DECISÃO DE PERFORMANCE ═══
 *
 * O jeito óbvio é pôr um shader de ruído num cubo gigante e deixá-lo rodando
 * todo frame. Isso significa executar 5 oitavas de ruído + 4 camadas de
 * estrelas em CADA PIXEL da tela, 60 vezes por segundo. Num iPad em 2x de DPR
 * isso é ~5 milhões de pixels por frame só de céu. Mata o orçamento sozinho.
 *
 * Em vez disso, geramos o céu UMA vez dentro de um cube render target (6 faces)
 * e usamos o resultado como `scene.background`. O custo por frame depois disso
 * é um blit de textura — praticamente zero. O preço é memória de GPU
 * (6 × 1024² × RGBA ≈ 25MB no tier alto) e ~100–300ms de geração no boot.
 *
 * Como o skybox é estático, isso é a troca certa. Se um dia a nebulosa
 * precisar animar, ela vira uma camada separada e barata por cima.
 *
 * ═══ O RUÍDO ═══
 *
 * Ruído de VALOR com FBM, não simplex. Simplex é melhor em qualidade por
 * oitava, mas a implementação em GLSL tem ~80 linhas; ruído de valor tem 15 e,
 * com domain warping (distorcer as coordenadas com o próprio ruído antes de
 * amostrar), produz as formas filamentosas de nebulosa que a gente quer.
 * Como isso roda uma vez só, qualidade por instrução não é o critério.
 */

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  // O 'position' do cubo já é a direção a partir do centro — é exatamente o
  // vetor que o fragment shader precisa amostrar.
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform float uSeed;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uNebulaIntensity;
uniform float uNebulaScale;
uniform vec3 uBandNormal;
uniform float uBandTightness;
uniform float uStarDensity;
uniform float uStarBrightness;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDiscSize;
uniform float uSunGlowFalloff;

// ── Hash ────────────────────────────────────────────────────────────────
// Hash de 3 entradas → 3 saídas, sem tabela de permutação. Os números mágicos
// são constantes conhecidas escolhidas por terem boa dispersão de bits; não há
// significado especial neles.
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// ── Ruído de valor 3D ───────────────────────────────────────────────────
// Amostra os 8 cantos da célula e interpola. A curva f*f*(3-2f) (smoothstep)
// é o que elimina os artefatos em blocos da interpolação linear pura.
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}

// FBM: soma oitavas dobrando a frequência e metendo a amplitude. É o que
// transforma ruído liso em algo com detalhe em várias escalas.
float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += valueNoise(p) * amp;
    norm += amp;
    p *= 2.02;   // 2.02 e não 2.0: evita que as oitavas se alinhem em grade
    amp *= 0.5;
  }
  return sum / norm;
}

// ── Camada de estrelas ──────────────────────────────────────────────────
// Divide o espaço em células cúbicas e põe no máximo uma estrela por célula.
// Como 'dir' é unitário, os pontos amostrados ficam numa casca esférica que
// atravessa só uma fração das células — o que já dá a esparsidade natural de
// um céu, sem precisar de rejeição por probabilidade.
float starLayer(vec3 dir, float density, float size, float seed, out vec3 tint) {
  vec3 p = dir * density + seed;
  vec3 id = floor(p);
  vec3 gv = fract(p) - 0.5;
  vec3 h = hash33(id + seed);

  // Posição da estrela dentro da célula (recuada de 0.42 pra não encostar na
  // borda, o que cortaria a estrela em duas células vizinhas).
  vec3 offset = (h - 0.5) * 0.84;
  float d = length(gv - offset);

  // Brilho e tamanho variáveis por estrela. 'h.z' reaproveitado como sorteio.
  float mag = pow(hash13(id * 1.7 + seed), 3.0);   // maioria fraca, poucas fortes
  float radius = size * (0.35 + mag * 1.6);
  float core = smoothstep(radius, 0.0, d);

  // Temperatura da cor: azul (quente) ↔ laranja (fria). Estrelas puramente
  // brancas ficam sintéticas; a variação é o que dá profundidade ao céu.
  float temp = hash13(id * 3.1 + seed + 11.0);
  tint = mix(vec3(1.0, 0.72, 0.45), vec3(0.62, 0.78, 1.0), temp);
  tint = mix(vec3(1.0), tint, 0.75);

  return core * (0.25 + mag * 1.9);
}

void main() {
  vec3 dir = normalize(vDir);

  // ── Faixa galáctica ───────────────────────────────────────────────────
  // Concentra nebulosa e estrelas ao redor de um plano. É o que dá a leitura
  // de "via láctea" e a cara de capa de livro de ficção dos anos 70.
  float bandDist = abs(dot(dir, normalize(uBandNormal)));
  float band = exp(-bandDist * bandDist * uBandTightness * uBandTightness * 4.0);

  // ── Nebulosa ──────────────────────────────────────────────────────────
  vec3 np = dir * uNebulaScale + uSeed;
  // Domain warping: distorce as coordenadas com o próprio ruído antes de
  // amostrar de novo. É o que transforma manchas redondas em filamentos.
  vec3 warp = vec3(fbm(np + 1.7, 3), fbm(np + 9.2, 3), fbm(np + 4.4, 3));
  float n = fbm(np + warp * 2.4, 5);

  // Máscara de esparsidade: sem ela a nebulosa cobre o céu todo e vira sopa.
  float mask = smoothstep(0.42, 0.78, fbm(np * 0.55 + 21.0, 3));

  float density = pow(max(0.0, n), 2.1) * mask * (0.25 + band * 1.35);
  density *= uNebulaIntensity;

  // Rampa de 3 cores baseada numa segunda amostra de ruído, pra que regiões
  // diferentes da nebulosa tenham cores diferentes em vez de um gradiente só.
  float hue = fbm(np * 0.8 + 55.0, 3);
  vec3 nebula = mix(uColorA, uColorB, smoothstep(0.32, 0.66, hue));
  nebula = mix(nebula, uColorC, smoothstep(0.62, 0.92, hue) * 0.85);
  vec3 color = nebula * density;

  // Brilho difuso de fundo na faixa, pra ela não parecer recortada.
  color += mix(uColorB, uColorC, 0.5) * band * 0.035;

  // ── Estrelas: 3 camadas em escalas diferentes ─────────────────────────
  // Densidade modulada pela faixa: mais estrelas no plano galáctico.
  float starMul = uStarBrightness * (0.35 + band * 1.5);
  vec3 tint;
  float s;
  s = starLayer(dir, uStarDensity,        0.055, uSeed + 1.0, tint);
  color += tint * s * starMul;
  s = starLayer(dir, uStarDensity * 2.15, 0.075, uSeed + 2.0, tint);
  color += tint * s * starMul * 0.62;
  s = starLayer(dir, uStarDensity * 4.30, 0.095, uSeed + 3.0, tint);
  color += tint * s * starMul * 0.34;

  // ── Estrela do sistema ────────────────────────────────────────────────
  // Desenhada no próprio skybox, na MESMA direção da luz direcional da cena.
  // Assim mudar world.sunDirection no config move a luz e o sol visível
  // juntos, sem chance de ficarem incoerentes.
  float sd = dot(dir, normalize(uSunDir));
  float disc = smoothstep(uSunDiscSize, uSunDiscSize + 0.0006, sd);
  float glow = pow(max(0.0, sd), uSunGlowFalloff);
  color += uSunColor * (disc * 9.0 + glow * 1.5);

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Gera o cubemap do céu e devolve a textura.
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} size resolução de cada face
 * @returns {{ texture: THREE.CubeTexture, dispose: () => void }}
 */
export function generateSkybox(renderer, size) {
  const S = CONFIG.skybox;
  const seed = (hashString(CONFIG.world.seed) % 10000) / 100;

  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // BackSide: estamos DENTRO do cubo, então as faces voltadas pra nós são as
    // de trás. Sem isso o cubo é invisível (todas as faces são descartadas).
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSeed: { value: seed },
      uColorA: { value: new THREE.Vector3(...S.nebulaColorA) },
      uColorB: { value: new THREE.Vector3(...S.nebulaColorB) },
      uColorC: { value: new THREE.Vector3(...S.nebulaColorC) },
      uNebulaIntensity: { value: S.nebulaIntensity },
      uNebulaScale: { value: S.nebulaScale },
      uBandNormal: { value: new THREE.Vector3(...S.bandNormal) },
      uBandTightness: { value: S.bandTightness },
      uStarDensity: { value: S.starDensity },
      uStarBrightness: { value: S.starBrightness },
      uSunDir: { value: new THREE.Vector3(...CONFIG.world.sunDirection).normalize() },
      uSunColor: { value: new THREE.Color(CONFIG.world.sunColor) },
      uSunDiscSize: { value: S.sunDiscSize },
      uSunGlowFalloff: { value: S.sunGlowFalloff },
    },
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  scene.add(box);

  // HalfFloat e não Float: render targets de 32 bits por canal travam ou não
  // são filtráveis em boa parte dos dispositivos iOS. HalfFloat tem alcance de
  // sobra pra HDR de céu (o disco solar passa de 1.0) e roda em tudo.
  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.LinearSRGBColorSpace,
  });

  // near/far apertados: a CubeCamera só precisa enxergar o cubo unitário.
  const cubeCam = new THREE.CubeCamera(0.1, 10, target);

  // Salva e restaura o estado do renderer: `render` de uma CubeCamera troca o
  // render target ativo, e deixar isso vazando quebraria o frame do jogo.
  const prevTarget = renderer.getRenderTarget();
  const prevToneMapping = renderer.toneMapping;
  // Sem tone mapping na geração: queremos guardar os valores HDR crus e
  // aplicar o tone mapping só na hora de exibir. Aplicar duas vezes lava as
  // cores e mata o brilho das estrelas.
  renderer.toneMapping = THREE.NoToneMapping;

  cubeCam.update(renderer, scene);

  renderer.toneMapping = prevToneMapping;
  renderer.setRenderTarget(prevTarget);

  // A cena temporária já cumpriu o papel; só a textura sobrevive.
  box.geometry.dispose();
  material.dispose();

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
