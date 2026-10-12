/**
 * CÉU GALÁCTICO coerente com a posição do sistema na galáxia.
 *
 * Na entrada de cada sistema, um shader faz ray-marching do MESMO modelo de
 * densidade de galaxy.js (disco exponencial, braços logarítmicos, bojo)
 * a partir da posição do sistema (al), com emissão por região (bojo âmbar,
 * braços azulados com berçários rosados) e absorção por poeira concentrada
 * no plano e na borda interna dos braços. O resultado vai para uma textura
 * equiretangular HDR (inercial) desenhada numa esfera de fundo que gira com
 * o céu (rotação do `sky`). Só aparece acima da atmosfera (no chão o domo do
 * `sky` cuida das estrelas). Quem está perto do núcleo vê um bojo enorme; na
 * borda, uma faixa fina e fraca; acima do disco, a espiral inclinada.
 *
 * O referencial galáctico em coordenadas inerciais é publicado em
 * `universe.currentSystem.galactic` ({ normal, core } [x,y,z]) para o
 * `sky` poder alinhar a própria via láctea, se quiser.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

/**
 * GLSL do modelo da galáxia (o mesmo de galaxy.js): emissão e poeira num
 * ponto p (al). Publicado em `universe.galaxy.glsl` para o mapa galáctico.
 * Requer NOISE_GLSL antes. Uniformes: uArms, uTanP, uSinP, uTheta0, uR0, uGSeed.
 */
export const GALAXY_GLSL = /* glsl */ `
uniform float uArms;
uniform float uTanP;
uniform float uSinP;
uniform float uTheta0;
uniform float uR0;
uniform float uGSeed;
const float G_RD = 8000.0;
const float G_HZ = 260.0;
const float G_RB = 3600.0;
const float G_RMAX = 42000.0;
float galArm(float rr, float th) {
  if (rr < 600.0) return 0.0;
  float lr = log(max(rr, uR0) / uR0) / uTanP;
  float w = 900.0 + 0.05 * rr;
  float best = 0.0;
  for (int k = 0; k < 4; k++) {
    if (float(k) >= uArms) break;
    float ta = uTheta0 + float(k) * 6.2831853 / uArms + lr;
    float d = th - ta;
    d -= floor(d / 6.2831853 + 0.5) * 6.2831853;
    float s = d * rr * uSinP / w;
    best = max(best, exp(-s * s));
  }
  return best;
}
// emissão (rgb) e densidade de poeira no ponto
void galSample(vec3 p, out vec3 em, out float dust) {
  float rr = length(p.xz);
  float th = atan(p.z, p.x);
  float ch = cosh(min(30.0, p.y / (G_HZ * 1.5)));
  // perfil de LUZ: disco mais plano que o de contagem e com o centro
  // esvaziado (os braços entram até o bojo, como numa espiral real)
  float disk = exp(-rr / 11000.0) * (1.0 - 0.75 * exp(-rr * rr / (5500.0 * 5500.0))) / (ch * ch);
  float arm = galArm(rr, th);
  float clump = snoise(vec3(rr / 2600.0 + th * 3.1, th * 2.3, uGSeed)) * 0.5 + 0.5;
  float yb = p.y * 1.7;
  float rb = G_RB * 0.62;
  float bulge = 1.6 * exp(-(rr * rr + yb * yb) / (2.0 * rb * rb)) + 0.25 * exp(-(rr * rr + yb * yb * 2.0) / (2.0 * G_RB * G_RB));
  float edge = clamp(1.0 - (rr - G_RMAX * 0.8) / (G_RMAX * 0.2), 0.0, 1.0);
  float fine = snoise(p / 900.0 + uGSeed) * 0.5 + 0.5;
  float fine2 = snoise(p / 260.0 - uGSeed) * 0.5 + 0.5;
  vec3 eDisk = vec3(0.72, 0.8, 1.0) * disk * (0.1 + 2.0 * arm * (0.55 + 0.9 * clump)) * (0.55 + 0.9 * fine);
  float knots = smoothstep(0.5, 0.9, clump) * smoothstep(0.45, 0.85, fine) * smoothstep(0.4, 0.8, fine2);
  vec3 eNeb = mix(vec3(1.0, 0.25, 0.55), vec3(0.25, 0.55, 1.0), smoothstep(0.35, 0.75, snoise(p / 3000.0 + 7.0) * 0.5 + 0.5)) * disk * arm * knots * 3.5;
  vec3 eBul = vec3(1.0, 0.78, 0.5) * bulge * 1.3;
  em = (eDisk + eNeb + eBul) * edge;
  float chd = cosh(min(30.0, p.y / 110.0));
  // poeira concentrada na borda INTERNA dos braços (atrasada em ângulo)
  float armD = galArm(rr, th - 0.22);
  dust = exp(-rr / (G_RD * 1.3)) / (chd * chd) * (0.2 + 2.2 * armD * (0.4 + fine)) * edge * (0.5 + 1.0 * fine2);
}
`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uObs;          // posição do observador (al, referencial galáctico)
uniform mat3 uToGal;        // inercial → galáctico
varying vec2 vUv;
${NOISE_GLSL}
${GALAXY_GLSL}
void main() {
  // texel → direção inercial (equiretangular: u = longitude, v = latitude)
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.14159265;
  vec3 dI = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
  vec3 d = normalize(uToGal * dI);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float t = 4.0;
  for (int i = 0; i < 96; i++) {
    float dt = t * 0.085 + 6.0;
    vec3 p = uObs + d * (t + dt * 0.5);
    float rr = length(p.xz);
    if (rr > G_RMAX * 1.05 && dot(p.xz, d.xz) > 0.0) break;
    if (abs(p.y) > 6000.0 && p.y * d.y > 0.0) break;
    vec3 em; float dust;
    galSample(p, em, dust);
    // estrelas a menos de ~1 500 al são resolvidas (o domo do céu as desenha):
    // a faixa é a luz NÃO resolvida, distante
    float far = smoothstep(700.0, 3200.0, t);
    acc += T * em * dt * 0.0009 * far;
    T *= exp(-dust * dt * 0.0013);
    t += dt;
    if (T < 0.01 || t > 70000.0) break;
  }
  // nuvens estelares e fendas escuras em escala angular (textura da faixa)
  float n1 = fbm(d * 7.0 + uGSeed, 5);
  float n2 = fbm(d * 23.0 - uGSeed, 4);
  acc *= (0.45 + 1.1 * smoothstep(-0.45, 0.55, n1)) * (0.75 + 0.5 * smoothstep(-0.3, 0.7, n2));
  gl_FragColor = vec4(acc, 1.0);
}`;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SKY_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const SKY_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;
uniform float uGain;
varying vec3 vDir;
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float lon = atan(-d.z, d.x);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
  vec3 c = texture2D(uTex, uv).rgb;
  gl_FragColor = vec4(c * uGain, 1.0);
}`;

/** Uniformes do GALAXY_GLSL. */
export function galaxyUniforms() {
  return { uArms: { value: 2 }, uTanP: { value: 0.25 }, uSinP: { value: 0.24 }, uTheta0: { value: 0 }, uR0: { value: 2400 }, uGSeed: { value: 1 } };
}
export function setGalaxyUniforms(u, galaxy) {
  u.uArms.value = galaxy.arms;
  u.uTanP.value = Math.tan(galaxy.pitch);
  u.uSinP.value = Math.sin(galaxy.pitch);
  u.uTheta0.value = galaxy.theta0;
  u.uR0.value = galaxy.R0;
  u.uGSeed.value = (galaxy.gseed % 1000) / 10;
}

export class GalaxySky {
  constructor(ctx) {
    this.ctx = ctx;
    const W = 1024, H = 512;
    this.target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.target.texture.wrapS = THREE.RepeatWrapping;
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: {
        uObs: { value: new THREE.Vector3() },
        uToGal: { value: new THREE.Matrix3() },
        ...galaxyUniforms(),
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    this.quad.frustumCulled = false;
    this.bakeScene = new THREE.Scene();
    this.bakeScene.add(this.quad);
    this.bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTex: { value: this.target.texture }, uGain: { value: 0 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(6e9, 64, 32), this.mat);
    this.mesh.name = 'universe:galaxySky';
    this.mesh.renderOrder = -990;
    this.mesh.frustumCulled = false;
    ctx.scene.add(this.mesh);
    this.dirty = false;
  }

  /** Prepara o bake para o sistema (executado no próximo frame). */
  set(galaxy, sys, frame) {
    const u = this.bakeMat.uniforms;
    u.uObs.value.fromArray(sys.galacticPosition);
    setGalaxyUniforms(u, galaxy);
    // inercial → galáctico: colunas = eixos galácticos em coords inerciais
    const n = new THREE.Vector3().fromArray(frame.normal);
    const core = new THREE.Vector3().fromArray(frame.core);
    const gx = core.clone().addScaledVector(n, -core.dot(n)).normalize(); // direção ao núcleo no plano
    const gz = new THREE.Vector3().crossVectors(gx, n).normalize();
    // no referencial galáctico o núcleo está em −posição do observador (no plano XZ)
    const obs = sys.galacticPosition;
    const toCore = new THREE.Vector3(-obs[0], 0, -obs[2]).normalize();
    const perp = new THREE.Vector3(-toCore.z, 0, toCore.x);
    // base galáctica expressa nas inerciais: gx ↔ toCore, n ↔ +Y, gz ↔ perp
    const I2G = new THREE.Matrix3().set(
      toCore.x * gx.x + perp.x * gz.x, toCore.x * gx.y + perp.x * gz.y, toCore.x * gx.z + perp.x * gz.z,
      n.x, n.y, n.z,
      toCore.z * gx.x + perp.z * gz.x, toCore.z * gx.y + perp.z * gz.y, toCore.z * gx.z + perp.z * gz.z,
    );
    u.uToGal.value.copy(I2G);
    this.dirty = true;
  }

  bake() {
    const r = this.ctx.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.render(this.bakeScene, this.bakeCam);
    r.setRenderTarget(prev);
    this.dirty = false;
  }

  frame(ctx, gain) {
    if (this.dirty) this.bake();
    this.mat.uniforms.uGain.value = gain;
    this.mesh.visible = gain > 0.001;
    const rot = ctx.services.sky?.rotation ?? 0;
    this.mesh.rotation.y = rot;
  }

  dispose() {
    this.ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.bakeMat.dispose();
    this.quad.geometry.dispose();
    this.target.dispose();
  }
}
