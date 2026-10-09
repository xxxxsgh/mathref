/**
 * SOMBRAS EM CASCATA (CSM) seguindo o sol do serviço `sky`.
 *
 * Como funciona (sem tocar no material de ninguém):
 *   - N DirectionalLights próprias ('render:csm0..N-1'), todas com sombra.
 *     A cascata 0 carrega a cor/intensidade do sol (cópia de sky.sun a cada
 *     frame); as cascatas 1..N-1 têm cor ZERO — só existem para ter um
 *     shadow map e uma matriz de sombra cada.
 *   - O `sky.sun` original fica invisível (o contrato permite ao render
 *     trocá-lo por CSM) — na falha/dispose ele volta.
 *   - Patch GLOBAL em ShaderChunk (lights_fragment_begin e
 *     shadowmap_pars_fragment): quando o programa tem
 *     NUM_DIR_LIGHT_SHADOWS ≥ EXO_CSM, a luz 0 escolhe a cascata pelo
 *     próprio shadow coord (a 1ª cascata que contém o fragmento) e as luzes
 *     1..N-1 pulam a amostragem. Luzes com sombra vêm primeiro na ordem do
 *     three, então os índices batem. Vale para todo material padrão
 *     (Standard/Physical/Lambert/Phong/Toon), inclusive os que usam
 *     onBeforeCompile para outras coisas.
 *
 * Estabilidade (sem shimmering): cada cascata é uma ESFERA envolvendo a
 * fatia do frustum (raio fixo para fov/aspect/splits fixos) e o centro é
 * encaixado na grade de texels num referencial ancorado no MUNDO (posição
 * double da câmera somada), não na origem de render — andar não faz a
 * grade escorregar.
 */
import * as THREE from 'three';

const CHUNK_PATCH_KEY = '__exoCsmPatched';

/** Instala (uma vez) o patch nos chunks globais do three. */
export function patchShaderChunks(cascades) {
  const SC = THREE.ShaderChunk;
  if (!SC[CHUNK_PATCH_KEY]) {
    SC[CHUNK_PATCH_KEY] = { lights: SC.lights_fragment_begin, pars: SC.shadowmap_pars_fragment };
  }
  const orig = SC[CHUNK_PATCH_KEY];
  const N = Math.max(2, cascades | 0);
  // função de seleção, uma linha por cascata (índices constantes: GLSL ES 3)
  let body = '';
  for (let k = 0; k < N; k++) {
    const last = k === N - 1;
    body += `
    #if NUM_DIR_LIGHT_SHADOWS > ${k}
    {
      vec4 sc = vDirectionalShadowCoord[ ${k} ];
      vec3 c = sc.xyz / sc.w;
      float m = ${last ? '0.0' : '0.03'};
      if ( c.x > m && c.x < 1.0 - m && c.y > m && c.y < 1.0 - m && c.z >= 0.0 && c.z <= 1.0 ) {
        float s = getShadow( directionalShadowMap[ ${k} ], directionalLightShadows[ ${k} ].shadowMapSize, directionalLightShadows[ ${k} ].shadowIntensity, directionalLightShadows[ ${k} ].shadowBias, directionalLightShadows[ ${k} ].shadowRadius, sc );
        ${
          last
            ? `// última cascata: some suavemente perto da borda
        vec2 e = min( c.xy, 1.0 - c.xy );
        float f = smoothstep( 0.0, 0.12, min( e.x, e.y ) );
        return mix( 1.0, s, f );`
            : 'return s;'
        }
      }
    }
    #endif`;
  }
  const pars = `${orig.pars}
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  #ifndef EXO_CSM
  #define EXO_CSM ${N}
  #endif
  #if NUM_DIR_LIGHT_SHADOWS >= EXO_CSM
  float exoCsmShadow() {
    ${body}
    return 1.0;
  }
  #endif
#endif
`;
  const needle = /#if defined\( USE_SHADOWMAP \) && \( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS \)\s*\n\s*directionalLightShadow = directionalLightShadows\[ i \];\s*\n(.*getShadow\( directionalShadowMap\[ i \].*)\n\s*#endif/;
  const m = orig.lights.match(needle);
  if (!m) throw new Error('CSM: lights_fragment_begin mudou nesta versão do three');
  const lights = orig.lights.replace(
    needle,
    `#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		#if defined( EXO_CSM ) && ( NUM_DIR_LIGHT_SHADOWS >= EXO_CSM ) && ( UNROLLED_LOOP_INDEX < EXO_CSM )
			#if ( UNROLLED_LOOP_INDEX == 0 )
			directLight.color *= ( directLight.visible && receiveShadow ) ? exoCsmShadow() : 1.0;
			#endif
		#else
		directionalLightShadow = directionalLightShadows[ i ];
${m[1]}
		#endif
		#endif`,
  );
  SC.shadowmap_pars_fragment = pars;
  SC.lights_fragment_begin = lights;
}

export function unpatchShaderChunks() {
  const SC = THREE.ShaderChunk;
  const orig = SC[CHUNK_PATCH_KEY];
  if (!orig) return;
  SC.lights_fragment_begin = orig.lights;
  SC.shadowmap_pars_fragment = orig.pars;
}

/** Distâncias de corte por número de cascatas (m, ao longo do eixo da câmera). */
const SPLITS = {
  1: [0.1, 90],
  2: [0.1, 28, 260],
  3: [0.1, 16, 90, 520],
  4: [0.1, 12, 60, 300, 1500],
};

export class CascadedShadows {
  constructor(ctx) {
    this.ctx = ctx;
    this.lights = [];
    this.count = 0;
    this.enabled = false;
    this.direction = new THREE.Vector3(0, 1, 0);
    this.externalDir = null; // setLightDirection
    this.size = 2048;
    this._v = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this.hiddenSun = null;
    this.radii = [];
    this.frame = 0;
    this.prevO = new ctx.WorldPos();
    this.hasPrev = false;
    this._t = new THREE.Matrix4();
    this.configure();
  }

  /** (Re)cria as luzes conforme a qualidade. */
  configure() {
    const q = this.ctx.quality;
    const n = q.shadows ? Math.max(1, Math.min(4, q.shadowCascades | 0 || 1)) : 0;
    const size = Math.max(512, Math.min(4096, (q.shadowMapSize | 0) || 2048));
    if (n === this.count && size === this.size) return;
    this.disposeLights();
    this.count = n;
    this.size = size;
    if (n >= 2) patchShaderChunks(n);
    for (let i = 0; i < n; i++) {
      const L = new THREE.DirectionalLight(0xffffff, i === 0 ? 3 : 0);
      L.name = `render:csm${i}`;
      L.castShadow = true;
      L.shadow.mapSize.set(size, size);
      L.shadow.bias = -0.0002;
      L.shadow.radius = i === 0 ? 2.5 : 1.5;
      if (i > 0) L.color.setRGB(0, 0, 0);
      // cascatas distantes se atualizam em frames alternados (ver update)
      L.shadow.autoUpdate = false;
      L.shadow.needsUpdate = true;
      this.ctx.scene.add(L, L.target);
      this.lights.push(L);
    }
    this.radii = [];
  }

  disposeLights() {
    for (const L of this.lights) {
      this.ctx.scene.remove(L, L.target);
      L.shadow.map?.dispose();
      L.dispose?.();
    }
    this.lights = [];
  }

  setLightDirection(dir) {
    this.externalDir = dir ? dir.clone().normalize() : null;
  }

  /** Por frame (depois do sky): copia o sol, ajusta cascatas e caixas. */
  update() {
    const ctx = this.ctx;
    const sky = ctx.services.sky;
    const sun = sky?.sun;
    if (!this.count) {
      this.restoreSun();
      return;
    }
    // o sol original continua sendo a fonte de cor/intensidade
    if (sun && sun !== this.lights[0]) {
      if (this.hiddenSun !== sun) {
        this.restoreSun();
        this.hiddenSun = sun;
      }
      sun.visible = false;
      sun.castShadow = false;
      this.lights[0].color.copy(sun.color);
      this.lights[0].intensity = sun.intensity;
    }
    const dir = this.externalDir || sky?.sunDirection;
    if (dir) this.direction.copy(dir).normalize();
    // sem sol (noite, abaixo do horizonte): desliga o custo dos mapas
    const sunUp = this.lights[0].intensity > 1e-3;
    // acima de alguns km a sombra de contato não aparece — desliga
    const alt = ctx.player?.altitude ?? 0;
    // castShadow fica constante (trocar recompila todos os materiais no meio
    // do voo); sem sol ou alto demais só paramos de redesenhar os mapas —
    // as esferas das cascatas ficam longe do chão e não são consultadas
    const on = sunUp && alt < 4000 && ctx.renderer.shadowMap.enabled;
    for (const L of this.lights) L.castShadow = ctx.renderer.shadowMap.enabled;
    this.enabled = on;
    if (!on) {
      for (const L of this.lights) L.shadow.needsUpdate = false;
      this.hasPrev = false;
      return;
    }

    const cam = ctx.camera;
    const splits = SPLITS[this.count];
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    const tanX = tanY * cam.aspect;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    // base do referencial de luz (estável: depende só da direção do sol)
    const Ld = this.direction;
    const right = this._r.set(0, 1, 0).cross(Ld);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0).cross(Ld);
    right.normalize();
    const up = this._u.copy(Ld).cross(right).normalize();
    const O = ctx.space.origin; // posição double da câmera (origem de render)
    // deslocamento da origem desde o frame anterior (double)
    const dx = this.hasPrev ? O.x - this.prevO.x : 0;
    const dy = this.hasPrev ? O.y - this.prevO.y : 0;
    const dz = this.hasPrev ? O.z - this.prevO.z : 0;
    const moved = Math.hypot(dx, dy, dz);
    this.prevO.copy(O);
    const firstFrame = !this.hasPrev;
    this.hasPrev = true;
    this.frame++;
    // custo: a cascata 0 todo frame; as demais alternam (metade/um quarto
    // dos frames). Câmera rápida ou salto → todas.
    const all = firstFrame || moved > 3;
    for (let i = 0; i < this.count; i++) {
      const L = this.lights[i];
      const period = i === 0 ? 1 : i === 3 ? 4 : 2;
      const phase = i === 2 ? 1 : 0;
      const doIt = all || period === 1 || this.frame % period === phase;
      if (!doIt) {
        // mapa antigo: a matriz de sombra acompanha a origem de render
        // (p_antigo = p_novo + Δorigem)
        L.shadow.needsUpdate = false;
        if (moved > 0) L.shadow.matrix.multiply(this._t.makeTranslation(dx, dy, dz));
        continue;
      }
      L.shadow.needsUpdate = true;
      const n = splits[i], f = splits[i + 1];
      // esfera mínima da fatia [n, f] do frustum (raio constante)
      const k2 = 1 + tanX * tanX + tanY * tanY;
      let zc = 0.5 * (n + f) * k2;
      if (zc > f) zc = f;
      const dn = Math.sqrt((zc - n) ** 2 + n * n * (k2 - 1));
      const df = Math.sqrt((zc - f) ** 2 + f * f * (k2 - 1));
      let r = Math.max(dn, df);
      r = Math.ceil(r * 1.04 + 0.5);
      const texel = (2 * r) / this.size;
      const c = this._c.copy(fwd).multiplyScalar(zc);
      // encaixe na grade: coordenadas no referencial de luz ANCORADAS NO MUNDO
      const wx = c.x + O.x, wy = c.y + O.y, wz = c.z + O.z;
      const px = right.x * wx + right.y * wy + right.z * wz;
      const py = up.x * wx + up.y * wy + up.z * wz;
      const sx = Math.floor(px / texel) * texel - px;
      const sy = Math.floor(py / texel) * texel - py;
      c.addScaledVector(right, sx).addScaledVector(up, sy);
      // casters fora da esfera (morros entre o sol e a cena): margem atrás
      const back = Math.min(3000, 200 + r * 3);
      L.target.position.copy(c);
      L.position.copy(c).addScaledVector(Ld, r + back);
      const sc = L.shadow.camera;
      sc.left = -r;
      sc.right = r;
      sc.top = r;
      sc.bottom = -r;
      sc.near = 0.5;
      sc.far = 2 * r + back;
      sc.updateProjectionMatrix();
      L.shadow.normalBias = texel * 1.4;
      L.shadow.bias = -0.00005 * (1 + i);
      L.target.updateMatrixWorld();
      L.updateMatrixWorld();
      this.radii[i] = r;
    }
  }

  restoreSun() {
    if (this.hiddenSun) {
      this.hiddenSun.visible = true;
      this.hiddenSun = null;
    }
  }

  dispose() {
    this.disposeLights();
    this.restoreSun();
    unpatchShaderChunks();
  }
}
