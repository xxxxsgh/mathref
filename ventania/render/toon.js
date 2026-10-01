// Toon shading SUAVE: rampa de 4 tons macios + rim light quente.
// Sem contorno preto. As sombras ficam roxas/azuis porque o lado sem sol só
// recebe a luz ambiente (hemisfério lavanda/roxo), nunca cinza.

import * as THREE from 'three';
import { addEnvUniforms } from './fog.js';

function makeRamp() {
  // 64 texels, 4 patamares com transições suaves (filtro linear).
  // Coordenada = dot(N, L) * 0.5 + 0.5 → 0.5 é o terminador.
  const W = 64;
  const data = new Uint8Array(W * 4);
  const steps = [
    [0.47, 0.06, 0.32],
    [0.57, 0.07, 0.68],
    [0.7, 0.08, 1.0],
  ];
  for (let i = 0; i < W; i++) {
    const x = i / (W - 1);
    let v = 0.1;
    for (const [at, w, to] of steps) {
      const t = Math.min(1, Math.max(0, (x - (at - w)) / (2 * w)));
      const s = t * t * (3 - 2 * t);
      v = v + (to - v) * s;
    }
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const RAMP = makeRamp();

const RIM_CODE = /* glsl */ `
  {
    vec3 vtV = normalize( vViewPosition );
    float vtFacing = 1.0 - clamp( dot( normal, vtV ), 0.0, 1.0 );
    float vtRim = smoothstep( 0.5, 0.95, vtFacing );
    float vtSide = clamp( dot( normal, vtSunView ) * 0.7 + 0.45, 0.0, 1.0 );
    outgoingLight += vtRimColor * vtRim * vtSide * vtRimStrength * mix( vec3( 1.0 ), diffuseColor.rgb, 0.35 );
  }
  #include <opaque_fragment>
`;

/**
 * Cria um MeshToonMaterial com a rampa do jogo, rim light e névoa.
 *
 * @param {object} o
 * @param {string} o.key  Chave única do "programa" quando `patch` muda o shader.
 * @param {(shader)=>void} [o.patch]  Modificações extras no shader.
 * @param {number} [o.rim=1]  Intensidade do rim light.
 */
export function toonMaterial(o = {}) {
  const { key = 'toon', patch, rim = 1, ...params } = o;
  const m = new THREE.MeshToonMaterial({ gradientMap: RAMP, ...params });
  const rimU = { value: rim };
  m.userData.rim = rimU;
  m.onBeforeCompile = (shader) => {
    addEnvUniforms(shader);
    shader.uniforms.vtRimStrength = rimU;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 vtRimColor;
uniform vec3 vtSunView;
uniform float vtRimStrength;`,
      )
      .replace('#include <opaque_fragment>', RIM_CODE);
    patch?.(shader);
  };
  m.customProgramCacheKey = () => key;
  return m;
}
