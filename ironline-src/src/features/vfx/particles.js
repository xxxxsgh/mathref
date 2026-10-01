/**
 * Sistema de partículas GPU: UM draw call por cena.
 *
 * Cada partícula é uma instância de um quad. A CPU só escreve o estado
 * inicial (posição, velocidade, tempos, tamanho, cor…) num ring buffer; a
 * trajetória é ANALÍTICA no vertex shader:
 *     p(t) = p0 + v0·(1 − e^(−k·t))/k + ½·g·t² + vento·t
 * — nenhuma iteração por partícula na CPU, nada alocado por tiro.
 *
 * Modos de orientação (aMisc.y):
 *   0 billboard girado        1 esticado pela velocidade (faíscas)
 *   2 segmento de traçante    3 eixo fixo (pétalas do clarão; não se move)
 *   4 deitado num plano (anel de choque, poeira rasteira)
 *
 * Iluminação (partículas não aditivas): o atlas guarda a normal da baforada;
 * o shader acende com o sol (difusa "wrap" + espalhamento frontal Henyey-
 * Greenstein quando o sol está atrás da fumaça) e o céu, com sombra
 * aproximada por partícula (raio até o sol feito na CPU no emissor).
 * Fogo: emissão de corpo negro proporcional a densidade × calor(t).
 * Saída em α pré-multiplicado: aditivo = α 0, fumaça = α normal — a mesma
 * malha faz os dois.
 *
 * Partículas "suaves" sem depth buffer: cada partícula pode carregar um
 * plano (normal, d) — a superfície onde nasceu — e desvanece ao cruzá-lo.
 * Também some perto da câmera.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aTime;   // t0, vida, arrasto k, gravidade (×9.8, negativo = empuxo)
attribute vec4 aSize;   // tamanho inicial, final, rotação, vel. angular
attribute vec4 aColor;  // rgb linear, alpha
attribute vec4 aMisc;   // tile, modo, iluminação do sol (0..1), aditivo
attribute vec4 aFx;     // emissão, expoente de decaimento do calor, fade-in, esticamento
attribute vec4 aPlane;  // plano suave: normal.xyz, d

uniform float uTime;
uniform vec3 uWind;
uniform vec3 uSunDir;

varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMisc;
varying vec4 vFx;
varying vec3 vSunLocal;
varying vec3 vWorld;
varying vec4 vPlane;
varying float vSize;
varying float vAge;
varying float vViewDist;
varying float vScatter;

void main() {
  float age = uTime - aTime.x;
  float life = aTime.y;
  float x = age / life;
  if (age < 0.0 || x >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = aTime.z;
  float mode = aMisc.y;
  float decay = k > 1e-3 ? (1.0 - exp(-k * age)) / k : age;
  vec3 g = vec3(0.0, -9.8 * aTime.w, 0.0);
  vec3 wind = aMisc.w > 0.5 ? vec3(0.0) : uWind * age;
  vec3 P = mode > 2.5 && mode < 3.5 ? aPos : aPos + aVel * decay + 0.5 * g * age * age + wind;
  vec3 V = aVel * exp(-k * age) + g * age;

  float ix = 1.0 - x;
  float grow = 1.0 - ix * ix * ix;
  float size = mix(aSize.x, aSize.y, grow);
  float rot = aSize.z + aSize.w * age;

  vec3 camPos = cameraPosition;
  vec3 toCam = normalize(camPos - P);
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 axX, axY;
  vec2 c = position.xy; // −0.5..0.5
  vec3 W;
  if (mode < 0.5) {
    float cs = cos(rot), sn = sin(rot);
    axX = camRight * cs + camUp * sn;
    axY = -camRight * sn + camUp * cs;
    W = P + (axX * c.x + axY * c.y) * size;
  } else if (mode < 2.5) {
    vec3 dir = mode < 1.5 ? V : aVel;
    float sp = length(dir);
    dir = sp > 1e-4 ? dir / sp : camUp;
    float len;
    vec3 center;
    if (mode < 1.5) {
      len = size + sp * aFx.w;
      center = P - dir * len * 0.4;
    } else {
      // traçante: cauda presa à origem enquanto o comprimento não se forma
      len = min(aFx.w, sp * age);
      center = P - dir * len * 0.5;
    }
    axY = dir;
    axX = normalize(cross(dir, toCam) + 1e-5);
    W = center + axX * c.x * size + axY * c.y * len;
  } else if (mode < 3.5) {
    vec3 dir = normalize(aVel);
    axY = dir;
    axX = normalize(cross(dir, toCam) + 1e-5);
    // base da pétala na origem, crescendo ao longo do eixo
    W = P + axX * c.x * size + axY * (c.y + 0.5) * size * aFx.w;
  } else {
    vec3 n = normalize(aPlane.xyz);
    vec3 t = normalize(abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    float cs = cos(rot), sn = sin(rot);
    axX = t * cs + b * sn;
    axY = -t * sn + b * cs;
    W = P + (axX * c.x + axY * c.y) * size;
  }
  vec3 axZ = normalize(cross(axX, axY));
  if (dot(axZ, toCam) < 0.0) axZ = -axZ;
  vSunLocal = vec3(dot(uSunDir, axX), dot(uSunDir, axY), dot(uSunDir, axZ));
  vScatter = dot(uSunDir, -toCam);

  float tile = aMisc.x;
  vec2 cell = vec2(mod(tile, 4.0), floor(tile / 4.0));
  vUv = (vec2(cell.x, 3.0 - cell.y) + (c + 0.5)) * 0.25;
  vColor = aColor;
  vMisc = aMisc;
  vFx = aFx;
  vWorld = W;
  vPlane = aPlane;
  vSize = size;
  vAge = x;
  vec4 mv = viewMatrix * vec4(W, 1.0);
  vViewDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uGroundAmbient;
uniform float uNearFade;
uniform float uFireIntensity;

varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMisc;
varying vec4 vFx;
varying vec3 vSunLocal;
varying vec3 vWorld;
varying vec4 vPlane;
varying float vSize;
varying float vAge;
varying float vViewDist;
varying float vScatter;

vec3 blackbody(float t) {
  // rampa artística: brasa vermelho-escura → laranja → amarelo → branco-quente
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.28, 0.03), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.8, t));
  return mix(c, vec3(1.0, 0.9, 0.7), smoothstep(0.85, 1.0, t)) * (0.08 + 2.2 * t * t);
}

void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  float x = vAge;
  float fadeIn = vFx.z > 0.0 ? smoothstep(0.0, vFx.z, x) : 1.0;
  float fade = fadeIn * (1.0 - smoothstep(0.35, 1.0, x));
  // plano suave
  if (dot(vPlane.xyz, vPlane.xyz) > 0.5) {
    float h = dot(vPlane.xyz, vWorld) - vPlane.w;
    fade *= clamp(h / max(vSize * 0.3, 0.02), 0.0, 1.0);
  }
  // perto da câmera
  fade *= clamp((vViewDist - uNearFade) / max(uNearFade * 3.0, 0.05), 0.0, 1.0);
  float heat = vFx.x * pow(max(1.0 - x, 0.0), vFx.y);

  if (vMisc.w > 0.5) {
    // aditivo: R = núcleo branco-quente, A = intensidade
    vec3 col = mix(vColor.rgb, vec3(1.0, 0.92, 0.8) * 1.6, clamp(tex.r, 0.0, 1.0));
    float i = tex.a * fade * vColor.a;
    gl_FragColor = vec4(col * heat * i, 0.0);
    if (gl_FragColor.r + gl_FragColor.g + gl_FragColor.b < 0.0005) discard;
    return;
  }

  float a = tex.a * vColor.a * fade;
  if (a < 0.003) discard;
  vec3 n = tex.rgb * 2.0 - 1.0;
  n.z = max(n.z, 0.05);
  float ndl = dot(n, vSunLocal);
  float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  // espalhamento frontal (sol atrás da fumaça): HG g=0.55, mais forte nas bordas finas
  float gg = 0.55;
  float hg = (1.0 - gg * gg) / pow(1.0 + gg * gg - 2.0 * gg * vScatter, 1.5) * 0.0796;
  float thin = (1.0 - tex.a) * tex.a * 2.0;
  // sunlit ≥ 10: na sombra no chão, mas ao sol acima da altura (sunlit − 10)
  float sunlit = vMisc.z >= 10.0 ? smoothstep(vMisc.z - 11.5, vMisc.z - 8.5, vWorld.y) : vMisc.z;
  // céu de cima, chão por baixo, miolo denso mais escuro (auto-sombra), bordas finas mais claras
  vec3 amb = mix(uGroundAmbient, uAmbient, n.y * 0.5 + 0.5) * (0.62 + 0.38 * n.z);
  vec3 albedo = vColor.rgb;
  vec3 lit = albedo * (amb + uSunColor * sunlit * (wrap * 0.3183 + hg * thin * 0.5));
  // fogo: emissão por densidade × calor
  // calor maior no miolo denso e virado para a câmera; bordas esfriam primeiro
  float core = tex.a * (0.55 + 0.45 * n.z);
  vec3 emit = heat > 0.0 ? blackbody(min(heat, 1.0) * (0.15 + 0.85 * core * core)) * uFireIntensity * min(heat, 1.5) * smoothstep(0.08, 0.35, heat) : vec3(0.0);
  gl_FragColor = vec4((lit + emit) * a, a * (1.0 - min(heat, 1.0) * 0.35));
}`;

const _c = new THREE.Color();

export class ParticleSystem {
  /**
   * @param {object} opts { capacity, atlas, name, nearFade }
   */
  constructor({ capacity = 4096, atlas, name = 'vfx-particles', nearFade = 0.25, clock = null }) {
    this.capacity = capacity;
    this.clock = clock;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.instanceCount = capacity;
    const mk = (n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attr = {
      aPos: mk(3), aVel: mk(3), aTime: mk(4), aSize: mk(4), aColor: mk(4), aMisc: mk(4), aFx: mk(4), aPlane: mk(4),
    };
    // nascem "mortas"
    const t = this.attr.aTime.array;
    for (let i = 0; i < capacity; i++) {
      t[i * 4] = -1e6;
      t[i * 4 + 1] = 1;
    }
    for (const [k, a] of Object.entries(this.attr)) geo.setAttribute(k, a);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.uniforms = {
      uAtlas: { value: atlas },
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3(0.35, 0.05, 0.15) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(3, 2.9, 2.7) },
      uAmbient: { value: new THREE.Color(0.35, 0.4, 0.48) },
      uGroundAmbient: { value: new THREE.Color(0.2, 0.18, 0.16) },
      uNearFade: { value: nearFade },
      uFireIntensity: { value: 1.9 },
    };
    this.material = new THREE.ShaderMaterial({
      name,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.userData.noSkyOcclusion = true;
    this.head = 0;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.dirtyAll = false;
    this.now = 0;
  }

  /**
   * Emite uma partícula. p: Vector3 (posição), v: Vector3|null.
   * o: { life, drag, gravity, size, size1, rot, spin, color(Color|hex), alpha,
   *      tile, mode, sunlit, additive, emissive, heatPow, fadeIn, stretch, plane: [nx,ny,nz,d], delay }
   */
  emit(p, v, o) {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.head === 0) this.dirtyAll = true;
    const A = this.attr;
    let j = i * 3;
    A.aPos.array[j] = p.x; A.aPos.array[j + 1] = p.y; A.aPos.array[j + 2] = p.z;
    A.aVel.array[j] = v ? v.x : 0; A.aVel.array[j + 1] = v ? v.y : 0; A.aVel.array[j + 2] = v ? v.z : 0;
    j = i * 4;
    const tm = A.aTime.array;
    tm[j] = (this.clock ? this.clock() : this.now) + (o.delay || 0); tm[j + 1] = o.life ?? 1; tm[j + 2] = o.drag ?? 0; tm[j + 3] = o.gravity ?? 0;
    const sz = A.aSize.array;
    sz[j] = o.size ?? 0.1; sz[j + 1] = o.size1 ?? o.size ?? 0.1; sz[j + 2] = o.rot ?? 0; sz[j + 3] = o.spin ?? 0;
    const col = A.aColor.array;
    if (o.color && o.color.isColor) _c.copy(o.color);
    else _c.setHex(o.color ?? 0xffffff, THREE.LinearSRGBColorSpace);
    col[j] = _c.r; col[j + 1] = _c.g; col[j + 2] = _c.b; col[j + 3] = o.alpha ?? 1;
    const m = A.aMisc.array;
    m[j] = o.tile ?? 0; m[j + 1] = o.mode ?? 0; m[j + 2] = o.sunlit ?? 1; m[j + 3] = o.additive ? 1 : 0;
    const fx = A.aFx.array;
    fx[j] = o.emissive ?? (o.additive ? 1 : 0); fx[j + 1] = o.heatPow ?? 0; fx[j + 2] = o.fadeIn ?? 0; fx[j + 3] = o.stretch ?? 0;
    const pl = A.aPlane.array;
    if (o.plane) { pl[j] = o.plane[0]; pl[j + 1] = o.plane[1]; pl[j + 2] = o.plane[2]; pl[j + 3] = o.plane[3]; }
    else { pl[j] = 0; pl[j + 1] = 0; pl[j + 2] = 0; pl[j + 3] = 0; }
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    return i;
  }

  /** Mata uma partícula já emitida (índice devolvido por emit). */
  kill(i) {
    this.attr.aTime.array[i * 4] = -1e6;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** Sobe para a GPU só a faixa escrita neste frame. */
  flush(now) {
    this.now = now;
    this.uniforms.uTime.value = now;
    if (this.dirtyMax < 0 && !this.dirtyAll) return;
    for (const a of Object.values(this.attr)) {
      a.clearUpdateRanges();
      if (!this.dirtyAll) a.addUpdateRange(this.dirtyMin * a.itemSize, (this.dirtyMax - this.dirtyMin + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.dirtyAll = false;
  }

  /** Mata tudo (troca de mapa, reset). */
  clear() {
    const t = this.attr.aTime.array;
    for (let i = 0; i < this.capacity; i++) t[i * 4] = -1e6;
    this.dirtyAll = true;
  }
}
