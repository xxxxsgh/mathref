// Céu em gradiente (zênite → horizonte, com a mesma névoa quente do chão no
// horizonte), disco do sol com halo, lua e estrelas à noite.

import * as THREE from 'three';
import { GLSL_NOISE } from '../core/math.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // sempre no plano de fundo
}
`;

const FRAG = /* glsl */ `
#include <common>
${GLSL_NOISE}
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uNight;
uniform float uSunSize;
varying vec3 vDir;

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // Gradiente: horizonte largo e quente, zênite azul.
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uTop, t);
  col = mix(col, uBottom, smoothstep(0.0, -0.25, h));

  float sd = max(dot(d, uSunDir), 0.0);
  // Halo amplo + halo médio + disco.
  col += uSunColor * pow(sd, 8.0) * 0.18 * (1.0 - uNight);
  col += uSunColor * pow(sd, 90.0) * 0.45 * (1.0 - uNight);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.7, sd);
  col = mix(col, uSunColor * 6.0, disc * (1.0 - uNight) * smoothstep(-0.05, 0.02, uSunDir.y));

  // Estrelas e lua.
  if (uNight > 0.01) {
    vec2 sp = vec2(atan(d.z, d.x) * 120.0, d.y * 160.0);
    float s = vHash12(floor(sp));
    float tw = 0.6 + 0.4 * sin(s * 300.0 + d.x * 40.0);
    float star = step(0.9965, s) * smoothstep(0.02, 0.25, h) * tw;
    col += vec3(0.9, 0.92, 1.0) * star * 1.4 * uNight;
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.75, 0.8, 1.0) * smoothstep(0.9994, 0.9997, md) * 2.2 * uNight;
    col += vec3(0.35, 0.4, 0.7) * pow(md, 40.0) * 0.4 * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
      uSunSize: { value: 0.0011 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'sky';
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
  }

  update(camera, env) {
    this.mesh.position.copy(camera.position);
    const u = this.uniforms;
    u.uTop.value.copy(env.skyTop);
    u.uHorizon.value.copy(env.skyHorizon);
    u.uBottom.value.copy(env.fog).multiplyScalar(0.9);
    u.uSunDir.value.copy(env.sunDir);
    u.uMoonDir.value.copy(env.moonDir);
    u.uSunColor.value.copy(env.sunDisc);
    u.uNight.value = env.night;
  }
}
