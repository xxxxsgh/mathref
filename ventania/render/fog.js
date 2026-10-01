// Névoa de distância + névoa de altura + espalhamento quente na direção do sol.
//
// Substituímos os chunks `fog_*` do Three GLOBALMENTE (antes de qualquer
// material compilar). Assim todo material embutido ganha a mesma névoa sem
// precisar de pós-processamento com depth buffer — funciona até na qualidade
// baixa, sem composer.
//
// As uniforms extras (direção do sol, cor do espalhamento, parâmetros da
// névoa de altura) são compartilhadas por referência em ENV e injetadas em cada
// material por `addEnvUniforms` (feito automaticamente por `withFog` e pelas
// fábricas de render/toon.js). Um material que não as receba simplesmente fica
// sem névoa de altura e sem espalhamento — degrada, não quebra.

import * as THREE from 'three';

/** Uniforms de ambiente compartilhadas por todos os materiais do jogo. */
export const ENV = {
  vtSunDir: { value: new THREE.Vector3(0.5, 0.3, 0.2).normalize() }, // mundo
  vtSunView: { value: new THREE.Vector3(0, 0, 1) }, // espaço de visão (rim)
  vtSunColor: { value: new THREE.Color(1, 0.85, 0.6) },
  vtFogSun: { value: new THREE.Color(1, 0.8, 0.55) },
  // x: densidade da névoa de altura, y: queda por metro, z: altura base
  vtFogParams: { value: new THREE.Vector3(0.0012, 0.03, 0) },
  vtRimColor: { value: new THREE.Color(1, 0.75, 0.45) },
  vtTime: { value: 0 },
  vtWind: { value: new THREE.Vector2(0.8, 0.4) },
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif
`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  {
    vec4 fogWP = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      fogWP = batchingMatrix * fogWP;
    #endif
    #ifdef USE_INSTANCING
      fogWP = instanceMatrix * fogWP;
    #endif
    vFogWorldPos = ( modelMatrix * fogWP ).xyz;
  }
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 vtSunDir;
  uniform vec3 vtFogSun;
  uniform vec3 vtFogParams;

  // Devolve (cor da névoa, fator) para um ponto do mundo.
  vec4 vtFog( vec3 wp ) {
    vec3 ray = wp - cameraPosition;
    float dist = length( ray );
    vec3 dir = ray / max( dist, 1e-4 );
    #ifdef FOG_EXP2
      float df = 1.0 - exp( - fogDensity * fogDensity * dist * dist );
    #else
      float df = smoothstep( fogNear, fogFar, dist );
    #endif
    float hf = 0.0;
    if ( vtFogParams.x > 0.0 ) {
      float b = max( vtFogParams.y, 1e-4 );
      float camH = cameraPosition.y - vtFogParams.z;
      float start = vtFogParams.x * exp( clamp( - camH * b, -60.0, 60.0 ) );
      float k = dir.y * b;
      float integ = abs( k ) > 1e-4 ? ( 1.0 - exp( clamp( - dist * k, -60.0, 60.0 ) ) ) / k : dist;
      hf = 1.0 - exp( - max( start * integ, 0.0 ) );
    }
    float f = clamp( 1.0 - ( 1.0 - df ) * ( 1.0 - hf ), 0.0, 1.0 );
    float sunAmt = pow( max( dot( dir, vtSunDir ), 0.0 ), 5.0 );
    return vec4( mix( fogColor, vtFogSun, sunAmt * 0.6 ), f );
  }
#endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    vec4 vtF = vtFog( vFogWorldPos );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vtF.rgb, vtF.a );
  }
#endif
`;

/** Injeta as uniforms de ambiente num shader em onBeforeCompile. */
export function addEnvUniforms(shader) {
  for (const k in ENV) shader.uniforms[k] = ENV[k];
}

/** Para materiais embutidos que não passam pelas fábricas de toon. */
export function withFog(material, key = 'fog') {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    addEnvUniforms(shader);
    prev?.call(material, shader, r);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
