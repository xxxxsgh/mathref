// Grama muito densa com instancing.
//
// Cada camada é UMA draw call: N lâminas espalhadas num quadrado de lado S. No
// vertex shader, a posição de cada lâmina "dá a volta" (wrap) em torno do
// jogador, então o campo é infinito e sempre centrado nele. Altura do chão,
// densidade (máscara) e manchas de cor vêm da DataTexture do terreno.
//
// Duas camadas: PERTO (muito densa, lâminas finas) e LONGE (esparsa, lâminas
// largas) — o terreno por baixo já é pintado na cor média da grama, então o
// fim do campo some sem emenda.

import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';
import { GLSL_TERRAIN, GRASS_COLORS } from './terrain.js';
import { GLSL_NOISE, rng } from '../core/math.js';

function bladeGeometry(segments, widthMul) {
  // Lâmina afinando até a ponta; y em [0,1] (altura normalizada).
  const pos = [], uvs = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = 0.5 * widthMul * (1 - t * t * 0.92);
    if (i === segments) {
      pos.push(0, 1, 0);
      uvs.push(0.5, 1);
    } else {
      pos.push(-w, t, 0, w, t, 0);
      uvs.push(0, t, 1, t);
    }
  }
  const idx = [];
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, segments * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Normal para cima: a grama acende igual ao chão (sem lâminas "piscando").
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

const VERT_HEAD = /* glsl */ `
#include <common>
${GLSL_NOISE}
${GLSL_TERRAIN}
attribute vec4 aBlade; // x,z no quadrado, rand, rand2
uniform vec3 uCenter;   // posição do jogador
uniform float uSize;    // lado do quadrado
uniform float uRadius;  // raio útil (fade)
uniform float uHeight;  // altura base
uniform float uWidth;
uniform float vtTime;
uniform vec2 vtWind;
uniform vec3 uPlayer;
varying float vH;
varying float vPatch;
varying float vFlower;
varying float vRand;
`;

const VERT_BODY = /* glsl */ `
  // Posição com wrap em torno do jogador.
  vec2 rel = mod(aBlade.xy - uCenter.xz + uSize * 0.5, uSize) - uSize * 0.5;
  vec2 wxz = uCenter.xz + rel;
  float dist = length(rel);
  vec4 ter = terrainSample(wxz);
  float density = ter.g;
  float rnd = aBlade.z;
  float rnd2 = aBlade.w;
  float fade = 1.0 - smoothstep(uRadius * 0.72, uRadius, dist);
  float keep = step(rnd, density * 1.15) * fade;
  // Lâminas fora da máscara viram altura 0 (descartadas na rasterização).
  float flower = step(0.985, rnd2) * step(0.35, density);
  float hgt = uHeight * (0.6 + 0.6 * rnd2 * rnd2) * (0.55 + 0.45 * density) * keep;
  // Campo mais alto em manchas.
  hgt *= 0.7 + 0.5 * vNoise(wxz * 0.045 + 3.0);
  hgt *= mix(1.0, 0.75, ter.a); // sub-bosque da floresta mais baixo
  hgt *= mix(1.0, 0.6, flower);

  float ang = rnd * 6.2831 * 7.0;
  vec2 dirB = vec2(cos(ang), sin(ang));
  float t = position.y;
  float tt = t * t;

  // Vento: ondas grandes que atravessam o campo + tremor fino.
  float wave = vNoise(wxz * 0.035 - vtWind * vtTime * 0.55);
  wave = smoothstep(0.15, 0.95, wave);
  float flutter = sin(vtTime * 3.1 + rnd * 40.0 + wxz.x * 0.4) * 0.12;
  vec2 windDir = normalize(vtWind);
  vec2 bend = windDir * (0.18 + 0.75 * wave + flutter) ;
  // Reação ao jogador: as lâminas se abrem ao redor dele.
  vec2 toP = wxz - uPlayer.xz;
  float pd = length(toP);
  float push = (1.0 - smoothstep(0.2, 1.7, pd)) * step(abs(uPlayer.y - ter.r), 2.2);
  bend += (toP / max(pd, 0.001)) * push * 1.4;
  // Curvatura natural da lâmina.
  bend += dirB * (0.15 + 0.25 * rnd2);

  vec3 transformed;
  float w = uWidth * (0.75 + 0.5 * fract(rnd * 13.7));
  vec2 side = vec2(-dirB.y, dirB.x);
  transformed.xz = wxz + side * position.x * w + bend * tt * hgt;
  // Inclinar encurta a lâmina (mantém o comprimento aproximado).
  float bl = length(bend);
  transformed.y = ter.r + t * hgt * (1.0 - 0.28 * min(bl, 1.4) * t);
  vH = t;
  vPatch = ter.b;
  vFlower = flower;
  vRand = rnd2;
`;

const FRAG_HEAD = /* glsl */ `
#include <common>
varying float vH;
varying float vPatch;
varying float vFlower;
varying float vRand;
uniform vec3 uRoot;
uniform vec3 uLime;
uniform vec3 uOlive;
uniform vec3 uGold;
uniform vec3 vtSunColor;
`;

const FRAG_COLOR = /* glsl */ `
  vec3 tipC = vPatch < 0.5 ? mix(uOlive, uLime, smoothstep(0.1, 0.5, vPatch)) : mix(uLime, uGold, smoothstep(0.68, 0.98, vPatch));
  tipC *= 0.88 + 0.24 * vRand;
  vec3 bladeC = mix(uRoot, tipC, smoothstep(0.0, 0.85, vH));
  vec3 flowerC = vRand > 0.995 ? vec3(0.95, 0.92, 1.0) : (vRand > 0.99 ? vec3(1.0, 0.82, 0.25) : vec3(0.78, 0.6, 1.0));
  bladeC = mix(bladeC, flowerC, vFlower * smoothstep(0.75, 0.9, vH));
  diffuseColor.rgb *= bladeC;
`;

const FRAG_TRANSLUCENT = /* glsl */ `
  {
    // Translucência: pontas acendem quando o sol está atrás delas (contraluz).
    vec3 vd = normalize(vFogWorldPos - cameraPosition);
    float back = pow(max(dot(vd, vtSunDir), 0.0), 3.0);
    outgoingLight += vtSunColor * diffuseColor.rgb * back * vH * vH * 0.9;
  }
  #include <opaque_fragment>
`;

export class Grass {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.layers = [];
    this.center = new THREE.Vector3();
    this.player = new THREE.Vector3();
  }

  /** (Re)cria as camadas para um preset de qualidade. */
  build(q) {
    for (const l of this.layers) {
      this.scene.remove(l);
      l.geometry.dispose();
      l.material.dispose();
    }
    this.layers = [];
    this.layers.push(this._layer({ count: q.grassNear, radius: q.grassNearR, height: 0.55, width: 0.09, segs: 4, seed: 3 }));
    this.layers.push(this._layer({ count: q.grassFar, radius: q.grassFarR, height: 0.6, width: 0.2, segs: 3, seed: 9, inner: q.grassNearR * 0.8 }));
    for (const l of this.layers) this.scene.add(l);
  }

  _layer({ count, radius, height, width, segs, seed, inner = 0 }) {
    const g = bladeGeometry(segs, 1);
    const size = radius * 2;
    const data = new Float32Array(count * 4);
    const r = rng(seed);
    let n = 0;
    while (n < count) {
      const x = r() * size, z = r() * size;
      // Camada de longe: menos lâminas no miolo, onde a de perto já cobre.
      if (inner > 0) {
        const dx = x - size / 2, dz = z - size / 2;
        if (Math.hypot(dx, dz) < inner && r() < 0.8) continue;
      }
      data.set([x, z, r(), r()], n * 4);
      n++;
    }
    g.setAttribute('aBlade', new THREE.InstancedBufferAttribute(data, 4));
    g.instanceCount = count;

    const uniforms = {
      ...this.terrain.shaderUniforms(),
      uCenter: { value: this.center },
      uPlayer: { value: this.player },
      uSize: { value: size },
      uRadius: { value: radius },
      uHeight: { value: height },
      uWidth: { value: width },
      uRoot: { value: GRASS_COLORS.root },
      uLime: { value: GRASS_COLORS.lime },
      uOlive: { value: GRASS_COLORS.olive },
      uGold: { value: GRASS_COLORS.gold },
    };
    const m = toonMaterial({
      key: 'grass',
      side: THREE.DoubleSide,
      rim: 0.0,
      patch: (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', VERT_HEAD)
          .replace('#include <begin_vertex>', VERT_BODY);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', FRAG_HEAD)
          .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
          // Normal sempre "para cima" (dos dois lados): sem lâminas pretas de costas.
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));')
          .replace('#include <opaque_fragment>', FRAG_TRANSLUCENT);
      },
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'grass';
    mesh.userData.noAO = true;
    return mesh;
  }

  update(playerPos) {
    this.center.set(playerPos.x, playerPos.y, playerPos.z);
    this.player.copy(playerPos);
  }
}
