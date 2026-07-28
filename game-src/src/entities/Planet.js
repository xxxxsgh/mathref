import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { LAYER_FAR, LAYER_NEAR } from '../core/Renderer.js';

/**
 * Planeta procedural: superfície gerada em shader + casca de atmosfera.
 *
 * ═══ POR QUE SHADER E NÃO TEXTURA ═══
 *
 * Uma textura de planeta decente é 2048² por face — 6 faces se for cubemap.
 * São dezenas de MB por planeta, e com 3 a 6 planetas o iPad estoura a
 * memória de GPU e mata a aba. Gerar em shader custa instruções por pixel,
 * mas zero memória e zero download.
 *
 * O custo é controlado por dois fatos: o planeta ocupa poucos pixels na maior
 * parte do tempo (está longe), e quando o jogador chega perto a Fase 4 troca
 * a esfera por chunks de terreno. Ou seja, o shader nunca precisa ficar bom
 * de perto.
 *
 * ═══ A ATMOSFERA ═══
 *
 * É uma segunda esfera, um pouco maior, renderizada pelo lado de DENTRO
 * (`BackSide`) com blending aditivo. A intensidade vem de um termo de Fresnel:
 * quanto mais rasante o ângulo de visão, mais espessa a camada de ar
 * atravessada, mais brilho. É a aproximação barata do espalhamento de
 * Rayleigh, e é o que produz o halo azul característico na borda.
 */

const PLANET_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PLANET_FRAG = /* glsl */ `
precision highp float;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vWorld;

uniform vec3 uSunDir;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform vec3 uColorPolar;
uniform float uSeed;
uniform float uNoiseScale;
uniform float uWaterLevel;
uniform float uIceAmount;
uniform float uMountain;
uniform float uBanded;      // 1 = gigante gasoso (faixas), 0 = rochoso
uniform float uAmbient;

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    s += valueNoise(p) * a;
    n += a;
    p *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

/** Ruído de crista: 1 - |2n-1| dobra o ruído e transforma a passagem suave
 *  pelo valor médio num vinco. Somadas, essas dobras viram cristas afiadas.
 *  Ver o comentário longo em procgen/noise.js. */
float ridged(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= oct) break;
    float v = 1.0 - abs(valueNoise(p) * 2.0 - 1.0);
    s += v * v * a;
    n += a;
    p *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

void main() {
  vec3 p = normalize(vLocal);
  vec3 np = p * uNoiseScale + uSeed;

  // Gigante gasoso: o ruído é amostrado quase só na LATITUDE, o que produz
  // faixas horizontais. Uma pequena contribuição 3D quebra a regularidade e
  // dá as ondulações de turbulência.
  float banded = fbm(vec3(np.x * 0.12, np.y * 2.6, np.z * 0.12), 4);
  float rocky = fbm(np + fbm(np * 0.5 + 3.1, 3) * 1.6, 5);

  float h = mix(rocky, banded, uBanded);

  // Rampa de altitude: água → terra baixa → terra alta.
  vec3 col;
  if (h < uWaterLevel) {
    col = uColorLow;
    // Profundidade: água rasa mais clara na borda dos continentes.
    col = mix(col * 0.62, col, smoothstep(uWaterLevel - 0.14, uWaterLevel, h));
  } else {
    // ── Cordilheiras ──
    // Mesma matemática de terrainHeight() em procgen/noise.js, inclusive a
    // ORDEM: o perfil é elevado ao quadrado primeiro e a crista é somada
    // depois. Os dois precisam concordar — este shader pinta o planeta visto
    // da órbita e aquele arquivo gera o terreno em que a nave pousa. Se
    // divergirem, a serra que você vê de cima não é a serra em que aterrissa,
    // e o erro é silencioso porque cada metade está certa isoladamente.
    float t = (h - uWaterLevel) / max(0.001, 1.0 - uWaterLevel);
    float mask = smoothstep(0.52, 0.66, fbm(np * 0.55 + 11.7, 3));
    float coast = smoothstep(0.0, 0.12, t);
    float perfil = min(1.0, t * t
      + mask * ridged(np * 2.3 + 5.3, 4) * uMountain * coast * (1.0 - uBanded));
    col = mix(uColorMid, uColorHigh, smoothstep(0.18, 0.78, perfil));
  }

  // Calotas polares: função da latitude (|y| do ponto normalizado), com o
  // ruído perturbando a borda pra ela não virar uma linha reta.
  float lat = abs(p.y);
  float ice = smoothstep(1.0 - uIceAmount, 1.0 - uIceAmount + 0.22, lat + (h - 0.5) * 0.22);
  col = mix(col, uColorPolar, ice * (1.0 - uBanded * 0.55));

  // ── Iluminação ──
  // Meio-lambert com um "terminador" suavizado. Lambert puro produz uma linha
  // dura entre dia e noite; alargar a transição é o que dá o crepúsculo.
  float ndl = dot(normalize(vNormal), normalize(uSunDir));
  float light = smoothstep(-0.18, 0.42, ndl);
  col *= uAmbient + light * 1.45;

  // Avermelha o terminador: a luz rasante atravessa mais atmosfera.
  float term = 1.0 - abs(ndl * 3.2);
  col += vec3(0.35, 0.12, 0.03) * max(0.0, term) * light * 0.6;

  gl_FragColor = vec4(col, 1.0);
}
`;

const ATMO_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const ATMO_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vView;
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform float uPower;
uniform float uIntensity;

void main() {
  // Renderizamos a face interna da casca, então a normal aponta pra dentro:
  // invertemos pra ter a normal "de fora" e o Fresnel sair correto.
  vec3 n = normalize(-vNormal);
  vec3 v = normalize(vView);

  // Fresnel: 1 - (n·v). Perto de zero olhando de frente (pouca atmosfera
  // atravessada), perto de 1 na borda (o raio corta a camada de lado). É a
  // aproximação barata do espalhamento atmosférico.
  float fres = pow(1.0 - max(0.0, dot(n, v)), uPower);

  // Só brilha no lado iluminado, com um pouco de vazamento pro lado noturno.
  float ndl = smoothstep(-0.35, 0.35, dot(n, normalize(uSunDir)));

  gl_FragColor = vec4(uColor, fres * ndl * uIntensity);
}
`;

export class Planet {
  /** @param {object} spec vindo do gerador do sistema solar */
  constructor(spec) {
    this.spec = spec;
    this.radius = spec.radius;
    this.object = new THREE.Group();
    this.object.position.copy(spec.position);

    // Segmentação modesta: 48×32 = 3072 triângulos. Como toda a variação de
    // superfície vem do shader, mais geometria não adicionaria detalhe algum
    // — só custo. A silhueta a 48 segmentos já é lisa a qualquer distância
    // que o jogador vai ver na Fase 3.
    const geo = new THREE.SphereGeometry(spec.radius, 48, 32);

    this.surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 0, 1) },
        uColorLow: { value: new THREE.Color(spec.colors.low) },
        uColorMid: { value: new THREE.Color(spec.colors.mid) },
        uColorHigh: { value: new THREE.Color(spec.colors.high) },
        uColorPolar: { value: new THREE.Color(spec.colors.polar) },
        uSeed: { value: spec.noiseSeed },
        uNoiseScale: { value: spec.noiseScale },
        uWaterLevel: { value: spec.waterLevel },
        uIceAmount: { value: spec.iceAmount },
        uMountain: { value: spec.mountainStrength ?? 0 },
        uBanded: { value: spec.gasGiant ? 1 : 0 },
        uAmbient: { value: 0.16 },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.surfaceMaterial);
    this.object.add(this.mesh);

    if (spec.hasAtmosphere) {
      this.atmosphereRadius = spec.radius * 1.035;
      const atmoGeo = new THREE.SphereGeometry(this.atmosphereRadius, 40, 26);
      this.atmoMaterial = new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color(spec.colors.atmosphere) },
          uSunDir: { value: new THREE.Vector3(0, 0, 1) },
          uPower: { value: 2.6 },
          uIntensity: { value: spec.atmosphereIntensity },
        },
      });
      this.atmosphere = new THREE.Mesh(atmoGeo, this.atmoMaterial);
      this.object.add(this.atmosphere);
    }

    // Anéis: um disco fino com ruído radial. Só alguns planetas têm.
    if (spec.hasRings) {
      const ringGeo = new THREE.RingGeometry(spec.radius * 1.5, spec.radius * 2.4, 72, 1);
      this.ringMaterial = new THREE.MeshBasicMaterial({
        color: spec.colors.rings,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      this.rings = new THREE.Mesh(ringGeo, this.ringMaterial);
      this.rings.rotation.x = Math.PI / 2 + spec.axialTilt * 0.6;
      this.object.add(this.rings);
    }

    this.mesh.rotation.z = spec.axialTilt;
    this._sunDir = new THREE.Vector3();
    this._toStar = new THREE.Vector3();

    this.object.traverse((o) => o.layers.set(LAYER_FAR));
    this.inNearRange = false;
  }

  /**
   * @param {THREE.Vector3} starPosition
   * @param {THREE.Vector3} cameraPosition
   * @param {number} dt
   */
  update(starPosition, cameraPosition, dt) {
    // Rotação axial. É lenta de propósito: rápida o suficiente pra ser notada
    // se você ficar parado olhando, lenta o suficiente pra não distrair.
    this.mesh.rotation.y += this.spec.rotationSpeed * dt;

    // Direção da luz: da estrela para o planeta. Recalculada porque a estrela
    // e o planeta são fixos, mas o shader precisa disso em espaço de mundo.
    this._toStar.copy(starPosition).sub(this.object.position).normalize();
    this.surfaceMaterial.uniforms.uSunDir.value.copy(this._toStar);
    if (this.atmoMaterial) this.atmoMaterial.uniforms.uSunDir.value.copy(this._toStar);

    // ⚠ A casca de atmosfera é desenhada pelo lado de DENTRO (BackSide) com
    // blending aditivo, o que é correto quando ela é vista de fora: produz o
    // halo na borda do disco. Mas quando a câmera ENTRA na casca, essa mesma
    // face passa a cobrir a tela inteira com laranja aditivo, e o terreno
    // some atrás de um véu. Dentro da atmosfera o efeito certo é névoa
    // (perspectiva aérea), não uma casca — então simplesmente escondemos a
    // casca e deixamos o fog da cena assumir.
    //
    // O limiar é o raio × 1.25, não o raio da própria casca (× 1.035). A
    // casca é fina de propósito — ela existe pra desenhar o halo na BORDA do
    // disco visto do espaço, e engrossá-la estragaria essa silhueta. Mas a
    // atmosfera de JOGO (onde há névoa, gravidade e céu) vai muito mais alto.
    // Esconder a casca já em 1.25 entrega a transição pro domo de céu numa
    // altitude em que ela ainda não é vista de perto.
    if (this.atmosphere) {
      const camDist = cameraPosition.distanceTo(this.object.position);
      this.atmosphere.visible = camDist > this.radius * 1.25;
    }

    // ── Troca de faixa de profundidade ─────────────────────────────────────────────────────
    // Quando a câmera se aproxima, o planeta precisa migrar da faixa distante
    // pra próxima — senão o plano `farNear` o recortaria e ele desapareceria
    // exatamente quando o jogador chega perto.
    //
    // A troca só pode acontecer quando o corpo cabe INTEIRO na faixa de
    // destino. Por isso as duas condições usam o raio com sinais opostos:
    // pra entrar na faixa próxima, o ponto MAIS DISTANTE do planeta
    // (dist + raio) precisa caber; pra voltar à distante, o ponto MAIS
    // PRÓXIMO (dist - raio) precisa estar além do `farNear`. A diferença
    // entre os dois limites também serve de histerese.
    updateDepthLayer(this, cameraPosition);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.atmosphere?.geometry.dispose();
    this.atmoMaterial?.dispose();
    this.rings?.geometry.dispose();
    this.ringMaterial?.dispose();
  }
}

/**
 * Move um corpo grande entre as faixas de profundidade.
 * Compartilhado por Planet e Station — a regra é a mesma.
 * @param {{object: THREE.Object3D, radius: number, inNearRange: boolean}} body
 * @param {THREE.Vector3} cameraPosition
 */
export function updateDepthLayer(body, cameraPosition) {
  const dist = cameraPosition.distanceTo(body.object.position);
  let next = body.inNearRange;
  if (!body.inNearRange) {
    if (dist + body.radius < CONFIG.world.depthSwitchToNear) next = true;
  } else if (dist - body.radius > CONFIG.world.depthSwitchToFar) {
    next = false;
  }
  if (next === body.inNearRange) return;
  body.inNearRange = next;
  const layer = next ? LAYER_NEAR : LAYER_FAR;
  body.object.traverse((o) => o.layers.set(layer));
}
