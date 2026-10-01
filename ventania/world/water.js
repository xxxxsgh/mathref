// Água estilizada: gradiente por profundidade (turquesa → azul profundo),
// espuma na margem em faixas que respiram, reflexo do céu por Fresnel e brilho
// do sol. A profundidade vem da mesma DataTexture do terreno.
// Mar em y = 0 (um plano enorme) e lago com nível próprio (um disco).

import * as THREE from 'three';
import { GLSL_TERRAIN } from './terrain.js';
import { GLSL_NOISE } from '../core/math.js';
import { LAKE, SEA_LEVEL } from './layout.js';
import { addEnvUniforms } from '../render/fog.js';

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main(){
  vec3 transformed = position;
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
${GLSL_TERRAIN}
uniform float uLevel;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 vtSunColor;
uniform float uIsSea;
uniform vec3 uLight; // luz do ambiente (escurece à noite)
varying vec3 vWorld;

vec2 grad(vec2 p){
  float e = 0.15;
  float c = vNoise(p);
  return vec2(vNoise(p + vec2(e, 0.0)) - c, vNoise(p + vec2(0.0, e)) - c) / e;
}

void main(){
  #include <logdepthbuf_fragment>
  vec2 xz = vWorld.xz;
  // Fora da grade do terreno: fundo do mar.
  vec2 inside = step(abs(xz), vec2(uTerrainInfo.x - 2.0));
  float ground = mix(-30.0, terrainSample(xz).r, inside.x * inside.y);
  float depth = uLevel - ground;
  if (depth < -0.05) discard;

  // Normal animada (duas camadas de ruído rolando em direções diferentes).
  vec2 g1 = grad(xz * 0.16 + vec2(uTime * 0.05, uTime * 0.03));
  vec2 g2 = grad(xz * 0.45 - vec2(uTime * 0.07, -uTime * 0.04));
  vec3 N = normalize(vec3(-(g1.x * 0.18 + g2.x * 0.1), 1.0, -(g1.y * 0.18 + g2.y * 0.1)));

  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);

  float dk = 1.0 - exp(-max(depth, 0.0) * 0.32);
  vec3 col = mix(uShallow, uDeep, dk) * uLight;
  // Reflexo do céu (mais horizonte quanto mais rasante).
  vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(reflect(-V, N).y * 2.0, 0.0, 1.0));
  col = mix(col, sky, clamp(fres * 0.6, 0.0, 0.55));

  // Brilho do sol.
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, vtSunDir), 0.0), 180.0);
  float sparkle = pow(max(dot(R, vtSunDir), 0.0), 18.0) * step(0.82, vNoise(xz * 2.2 + uTime * 0.6));
  col += vtSunColor * (spec * 3.0 + sparkle * 0.6);

  // Espuma: faixa contínua colada à margem + faixas que avançam e recuam.
  float n = vNoise(xz * 0.7 + uTime * 0.15);
  float edge = 1.0 - smoothstep(0.0, 0.35 + 0.25 * n, depth);
  float bands = smoothstep(0.55, 0.85, sin(depth * 5.5 - uTime * 1.6 + n * 3.0)) * (1.0 - smoothstep(0.2, 1.3, depth));
  float foam = clamp(edge + bands * 0.7, 0.0, 1.0);
  foam *= smoothstep(0.2, 0.6, vNoise(xz * 1.8 - uTime * 0.2) + edge * 0.6);
  // Longe demais a espuma vira ruído: some com a distância.
  foam *= 1.0 - smoothstep(120.0, 260.0, dist);
  col = mix(col, uFoam * uLight, foam);

  float alpha = mix(0.45, 0.94, smoothstep(0.0, 2.6, depth));
  alpha = max(alpha, foam);
  alpha = max(alpha, fres * 0.7);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const NIGHT_LIGHT = new THREE.Color(0.2, 0.24, 0.45);

export class Water {
  constructor(scene, terrain) {
    this.uniforms = {
      ...THREE.UniformsLib.fog,
      ...terrain.shaderUniforms(),
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#46c4b4') },
      uDeep: { value: new THREE.Color('#12507a') },
      uFoam: { value: new THREE.Color('#fff6e6') },
      uSkyTop: { value: new THREE.Color('#4c7fd6') },
      uSkyHorizon: { value: new THREE.Color('#ffd29a') },
      uLight: { value: new THREE.Color(1, 1, 1) },
    };
    this.meshes = [];
    const make = (geo, level, isSea) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uLevel: { value: level }, uIsSea: { value: isSea ? 1 : 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        fog: true,
      });
      mat.onBeforeCompile = (s) => addEnvUniforms(s);
      mat.customProgramCacheKey = () => 'water';
      const m = new THREE.Mesh(geo, mat);
      m.position.y = level;
      m.renderOrder = 1;
      m.userData.noAO = true;
      scene.add(m);
      this.meshes.push(m);
      return m;
    };
    const sea = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2);
    make(sea, SEA_LEVEL, true).name = 'sea';
    const lake = new THREE.CircleGeometry(LAKE.r * 1.5, 48).rotateX(-Math.PI / 2);
    lake.translate(LAKE.x, 0, LAKE.z);
    make(lake, LAKE.level, false).name = 'lake';
  }

  update(dt, sky) {
    this.uniforms.uTime.value += dt;
    // Luz: 1 de dia, azul-violeta escuro à noite.
    this.uniforms.uLight.value.setRGB(1, 1, 1).lerp(NIGHT_LIGHT, sky.night);
    this.uniforms.uSkyTop.value.copy(sky.skyTop);
    this.uniforms.uSkyHorizon.value.copy(sky.skyHorizon);
  }
}
