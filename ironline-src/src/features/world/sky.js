/**
 * Céu, sol, névoa atmosférica e ambiente (IBL).
 *
 * - Domo de céu em shader: gradiente zênite→horizonte com espalhamento
 *   (Rayleigh/Mie aproximados), disco solar, halo, nuvens de textura
 *   iluminadas pela direção do sol (borda prateada contra a luz).
 * - Montanhas distantes em silhueta com perspectiva aérea.
 * - Envmap: PMREM gerado a partir do próprio céu + chão poeirento, para
 *   reflexos e luz ambiente coerentes (se a feature rendering não der um).
 */
import * as THREE from 'three';
import { cloudTexture } from './decals.js';
import { mulberry } from './noise.js';

export const ATMOS = {
  sunDir: new THREE.Vector3(-0.32, 0.6, -0.73).normalize(),
  sunColor: new THREE.Color(1.0, 0.86, 0.68),
  zenith: new THREE.Color(0.11, 0.24, 0.5),
  horizon: new THREE.Color(0.7, 0.68, 0.64),
  ground: new THREE.Color(0.42, 0.37, 0.31),
  fog: new THREE.Color(0.7, 0.66, 0.6),
};

export function createSky(radius = 450) {
  const clouds = cloudTexture();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: ATMOS.sunDir },
      uZenith: { value: ATMOS.zenith },
      uHorizon: { value: ATMOS.horizon },
      uGround: { value: ATMOS.ground },
      uSunCol: { value: ATMOS.sunColor },
      uClouds: { value: clouds },
      uCloudAmt: { value: 1.0 },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // sempre no plano de fundo
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZenith, uHorizon, uGround, uSunCol;
      uniform sampler2D uClouds;
      uniform float uCloudAmt, uIntensity;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float mu = dot(d, uSun);
        // gradiente de céu: zênite → horizonte (curva exponencial)
        float t = pow(clamp(h, 0.0, 1.0), 0.6);
        vec3 sky = mix(uHorizon, uZenith, t);
        // horizonte mais claro do lado do sol (Mie)
        float sunSide = pow(max(mu, 0.0), 3.0);
        sky += uSunCol * sunSide * 0.35 * (1.0 - t);
        // halo e disco
        float halo = pow(max(mu, 0.0), 64.0) * 0.9 + pow(max(mu, 0.0), 8.0) * 0.18;
        sky += uSunCol * halo;
        float disc = smoothstep(0.99955, 0.9998, mu);
        sky += uSunCol * disc * 30.0;
        // abaixo do horizonte: chão poeirento esmaecido na névoa
        if (h < 0.0) sky = mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
        // nuvens (mapa cilíndrico: u = azimute, v = elevação)
        if (h > -0.02) {
          float az = atan(d.x, -d.z) / 6.2831853 + 0.5;
          float el = clamp(h / 0.6, 0.0, 1.0);
          vec4 c = texture2D(uClouds, vec2(az, 1.0 - el));
          vec4 c2 = texture2D(uClouds, vec2(az + 0.003 * uSun.x, 1.0 - el - 0.01));
          float dens = c.a * uCloudAmt * smoothstep(-0.02, 0.06, h);
          // iluminação: base cinza-azulada, topo/bordas quentes, prata contra o sol
          float edge = clamp(c.a - c2.a * 0.8, 0.0, 1.0);
          vec3 base = mix(uHorizon * 0.82, vec3(1.0), 0.45) * mix(0.75, 1.05, t);
          vec3 lit = base + uSunCol * (0.25 + edge * 1.4 + pow(max(mu, 0.0), 6.0) * 1.2);
          sky = mix(sky, lit, clamp(dens * 1.6, 0.0, 0.95));
        }
        gl_FragColor = vec4(sky * uIntensity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  // desenhado DEPOIS dos opacos: só os pixels de céu visíveis pagam o shader
  mesh.renderOrder = 1e6;
  mesh.matrixAutoUpdate = true;
  return mesh;
}

/** Cordilheira distante (anel de silhuetas) com cor de perspectiva aérea. */
export function createMountains(radius = 420) {
  const r = mulberry(77);
  const seg = 160;
  const pos = [], col = [];
  const hgt = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let h = 0;
    for (let k = 1; k <= 5; k++) h += Math.sin(a * k * 3 + r() * 6) * (28 / k);
    hgt.push(Math.max(4, 22 + h + r() * 6));
  }
  const near = new THREE.Color(0.55, 0.53, 0.5), far = ATMOS.horizon.clone();
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, h) => [Math.cos(a) * radius, h, Math.sin(a) * radius];
    const v = [p(a0, -10), p(a1, -10), p(a1, hgt[i + 1]), p(a0, hgt[i])];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      pos.push(...v[idx]);
      const top = v[idx][1] > 0 ? 1 : 0;
      const c = near.clone().lerp(far, 0.55 + top * 0.12);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'mountains';
  mesh.renderOrder = 1e6 - 1;
  mesh.frustumCulled = false;
  return mesh;
}

/** PMREM do céu (para scene.environment). */
export function createEnvironment(renderer, skyMesh) {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = skyMesh.clone();
  sky.material = skyMesh.material.clone();
  sky.material.uniforms.uCloudAmt.value = 0.6;
  // sem tone mapping no envmap (o shader inclui o chunk; zera via define)
  sky.material.toneMapped = false;
  sky.scale.setScalar(0.1);
  envScene.add(sky);
  const rt = pm.fromScene(envScene, 0.02, 0.1, 100);
  pm.dispose();
  return rt.texture;
}
