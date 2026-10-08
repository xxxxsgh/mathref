/**
 * Serviço `sky` PLACEHOLDER: domo com espalhamento Rayleigh+Mie simples
 * (funciona do solo à órbita, com limbo), disco do sol, estrelas, luz do sol
 * (DirectionalLight com sombra), luz ambiente hemisférica e neblina
 * exponencial. O sistema sky substitui com ctx.provide('sky', ...).
 *
 * HORA DO DIA: o referencial do mundo é fixo no planeta; o céu (estrela)
 * gira em torno do eixo +Y do planeta por `rotation` (rad). A estrela tem
 * posição INERCIAL (universe.currentSystem.stars[0].position); a direção
 * aparente é R_y(rotation)·dirInercial. `setTime(t)` escolhe a rotação para
 * que a hora LOCAL na posição atual do jogador seja t (0 = meia-noite,
 * 0,25 = nascer, 0,5 = meio-dia, 0,75 = pôr do sol). Luas e planetas NÃO
 * giram com a hora (o universe os posiciona direto no referencial do planeta).
 */
import * as THREE from 'three';
import { latLonFromDir } from '../Geo.js';

const VERT = /* glsl */ `
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uCam;      // câmera relativa ao centro do planeta (km)
uniform vec3 uSun;      // direção do sol (unitária)
uniform vec3 uSunColor; // cor linear da estrela
uniform float uRp, uRa; // raios do planeta e do topo da atmosfera (km)
uniform vec3 uBr;       // Rayleigh (1/km)
uniform float uBm, uHr, uHm, uG, uSunI, uSunCos, uHasAtmo;
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_fragment>

vec2 rs(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vDir);
  vec3 ro = uCam;
  vec3 col = vec3(0.0);
  vec3 trans = vec3(1.0);
  vec2 g = rs(ro, rd, uRp);
  bool ground = g.x > 0.0 && g.x < g.y;
  vec2 a = rs(ro, rd, uRa);
  if (uHasAtmo > 0.5 && a.x < a.y && a.y > 0.0) {
    float t0 = max(a.x, 0.0);
    float t1 = ground ? min(a.y, g.x) : a.y;
    const int N = 12;
    const int L = 4;
    float ds = (t1 - t0) / float(N);
    float odR = 0.0, odM = 0.0;
    vec3 sR = vec3(0.0), sM = vec3(0.0);
    for (int i = 0; i < N; i++) {
      vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
      float h = length(p) - uRp;
      float dr = exp(-h / uHr) * ds;
      float dm = exp(-h / uHm) * ds;
      odR += dr;
      odM += dm;
      vec2 ls = rs(p, uSun, uRa);
      vec2 lg = rs(p, uSun, uRp);
      if (lg.x > 0.0 && lg.x < lg.y) continue; // sombra do planeta
      float dl = ls.y / float(L);
      float lR = 0.0, lM = 0.0;
      for (int j = 0; j < L; j++) {
        vec3 q = p + uSun * ((float(j) + 0.5) * dl);
        float hq = max(0.0, length(q) - uRp);
        lR += exp(-hq / uHr) * dl;
        lM += exp(-hq / uHm) * dl;
      }
      vec3 tau = uBr * (odR + lR) + uBm * 1.1 * (odM + lM);
      vec3 att = exp(-tau);
      sR += dr * att;
      sM += dm * att;
    }
    float mu = dot(rd, uSun);
    float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    float g2 = uG * uG;
    float pM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * uG * mu, 1.5));
    col = uSunI * uSunColor * (sR * uBr * pR + sM * uBm * pM);
    trans = exp(-(uBr * odR + uBm * 1.1 * odM));
  }
  if (!ground) {
    float mu = dot(rd, uSun);
    // disco + halo estreito
    float disk = smoothstep(uSunCos - 0.00002, uSunCos + 0.00002, mu);
    col += uSunColor * trans * (disk * 120.0 + pow(max(mu, 0.0), 2400.0) * 6.0);
    // estrelas (somem com o céu claro)
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float vis = clamp(1.0 - lum * 6.0, 0.0, 1.0);
    if (vis > 0.0) {
      vec3 p = rd * 420.0;
      vec3 id = floor(p);
      float h = hash13(id);
      if (h > 0.9965) {
        vec3 f = fract(p) - 0.5;
        float d = length(f);
        float b = (h - 0.9965) / 0.0035;
        vec3 tint = mix(vec3(1.0, 0.8, 0.65), vec3(0.75, 0.85, 1.0), hash13(id + 7.0));
        col += tint * smoothstep(0.16, 0.0, d) * b * b * 3.0 * trans * vis;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** Versão em JS do espalhamento (para luz ambiente e cor da neblina). ro em km. */
export function scatterJS(ro, rd, sun, p) {
  const rs = (o, d, r) => {
    const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
    const h = b * b - c;
    if (h < 0) return [1e9, -1e9];
    const s = Math.sqrt(h);
    return [-b - s, -b + s];
  };
  const g = rs(ro, rd, p.Rp);
  const ground = g[0] > 0 && g[0] < g[1];
  const a = rs(ro, rd, p.Ra);
  if (!(a[0] < a[1] && a[1] > 0)) return [0, 0, 0];
  const t0 = Math.max(a[0], 0);
  const t1 = ground ? Math.min(a[1], g[0]) : a[1];
  const N = 10, L = 4;
  const ds = (t1 - t0) / N;
  let odR = 0, odM = 0;
  const sR = [0, 0, 0], sM = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = t0 + (i + 0.5) * ds;
    const q = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const h = Math.hypot(...q) - p.Rp;
    const dr = Math.exp(-h / p.Hr) * ds;
    const dm = Math.exp(-h / p.Hm) * ds;
    odR += dr;
    odM += dm;
    const lg = rs(q, sun, p.Rp);
    if (lg[0] > 0 && lg[0] < lg[1]) continue;
    const ls = rs(q, sun, p.Ra);
    const dl = ls[1] / L;
    let lR = 0, lM = 0;
    for (let j = 0; j < L; j++) {
      const tt = (j + 0.5) * dl;
      const hq = Math.max(0, Math.hypot(q[0] + sun[0] * tt, q[1] + sun[1] * tt, q[2] + sun[2] * tt) - p.Rp);
      lR += Math.exp(-hq / p.Hr) * dl;
      lM += Math.exp(-hq / p.Hm) * dl;
    }
    for (let k = 0; k < 3; k++) {
      const att = Math.exp(-(p.Br[k] * (odR + lR) + p.Bm * 1.1 * (odM + lM)));
      sR[k] += dr * att;
      sM[k] += dm * att;
    }
  }
  const mu = rd[0] * sun[0] + rd[1] * sun[1] + rd[2] * sun[2];
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g2 = p.G * p.G;
  const pM = ((3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu))) / ((2 + g2) * Math.pow(1 + g2 - 2 * p.G * mu, 1.5));
  return [0, 1, 2].map((k) => p.I * p.color[k] * (sR[k] * p.Br[k] * pR + sM[k] * p.Bm * pM));
}

/** Transmitância da atmosfera de um ponto (km) em direção ao sol. */
export function transmittanceJS(ro, sun, p) {
  const b = ro[0] * sun[0] + ro[1] * sun[1] + ro[2] * sun[2];
  const c2 = ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2];
  // sol abaixo do horizonte geométrico → bloqueado pelo planeta (com penumbra curta)
  const hg = b * b - (c2 - p.Rp * p.Rp);
  let block = 1;
  if (hg > 0 && -b - Math.sqrt(hg) > 0) block = 0;
  const ha = b * b - (c2 - p.Ra * p.Ra);
  if (ha <= 0) return [block, block, block];
  const t1 = -b + Math.sqrt(ha);
  const N = 16;
  const dl = Math.max(0, t1) / N;
  let lR = 0, lM = 0;
  for (let j = 0; j < N; j++) {
    const t = (j + 0.5) * dl;
    const h = Math.max(0, Math.hypot(ro[0] + sun[0] * t, ro[1] + sun[1] * t, ro[2] + sun[2] * t) - p.Rp);
    lR += Math.exp(-h / p.Hr) * dl;
    lM += Math.exp(-h / p.Hm) * dl;
  }
  return [0, 1, 2].map((k) => block * Math.exp(-(p.Br[k] * lR + p.Bm * 1.1 * lM)));
}

export function installPlaceholderSky(ctx) {
  const { scene } = ctx;
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uRp: { value: 120 },
    uRa: { value: 132 },
    uBr: { value: new THREE.Vector3() },
    uBm: { value: 0 },
    uHr: { value: 3 },
    uHm: { value: 0.6 },
    uG: { value: 0.76 },
    uSunI: { value: 22 },
    uSunCos: { value: Math.cos(0.005) },
    uHasAtmo: { value: 1 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.name = 'placeholder:sky';
  dome.scale.setScalar(1e9);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'placeholder:sun';
  sun.castShadow = !!ctx.quality.shadows;
  sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -80;
  sc.right = sc.top = 80;
  sc.near = 1;
  sc.far = 2000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9ec3ff, 0x2a3320, 0.8);
  hemi.name = 'placeholder:ambient';
  scene.add(hemi);
  const fog = new THREE.FogExp2(0x9ab6d8, 1 / 48000);
  scene.fog = fog;

  const sunDirection = new THREE.Vector3(0, 1, 0);
  const sunColor = new THREE.Color(1, 1, 1);
  const ambient = { color: new THREE.Color(0x9ec3ff), intensity: 0.8 };
  let rotation = 0;
  const dayLength = 1200; // s de jogo por dia
  const inertial = new THREE.Vector3(1, 0, 0);
  let acc = 0;
  const params = { Rp: 120, Ra: 132, Hr: 3, Hm: 0.6, Br: [0, 0, 0], Bm: 0, G: 0.76, I: 22, color: [1, 1, 1] };

  function readSystem() {
    const uni = ctx.services.universe;
    const star = uni?.currentSystem?.stars?.[0];
    const planet = ctx.services.planet;
    const info = uni?.currentPlanet;
    const R = planet?.radius || info?.radius || 120000;
    const atmo = info?.atmosphere;
    if (star) {
      const c = ctx.space.planetCenter;
      inertial.set(star.position.x - c.x, star.position.y - c.y, star.position.z - c.z).normalize();
      sunColor.setRGB(star.color[0], star.color[1], star.color[2]);
      params.color = star.color;
      params.sunScale = star.intensity ?? 1;
      const d = star.position.length() || 3e9;
      uniforms.uSunCos.value = Math.cos(Math.atan((star.radius || 1.5e7) / d));
    }
    params.Rp = R / 1000;
    uniforms.uHasAtmo.value = atmo ? 1 : 0;
    if (atmo) {
      params.Ra = atmo.radius / 1000;
      params.Hr = atmo.rayleighHeight / 1000;
      params.Hm = atmo.mieHeight / 1000;
      params.Br = atmo.rayleigh.map((v) => v * 1000);
      params.Bm = atmo.mie * 1000;
      params.G = atmo.mieG;
      params.I = atmo.sunIntensity;
    } else params.Ra = params.Rp * 1.0001;
    uniforms.uRp.value = params.Rp;
    uniforms.uRa.value = params.Ra;
    uniforms.uHr.value = params.Hr;
    uniforms.uHm.value = params.Hm;
    uniforms.uBr.value.set(...params.Br);
    uniforms.uBm.value = params.Bm;
    uniforms.uG.value = params.G;
    uniforms.uSunI.value = params.I;
    uniforms.uSunColor.value.copy(sunColor);
  }
  readSystem();
  const offSys = ctx.bus.on('system:enter', readSystem);

  function playerLon() {
    const p = ctx.player.worldPos;
    const c = ctx.space.planetCenter;
    return (latLonFromDir({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }).lon * Math.PI) / 180;
  }
  function inertialLon() {
    return Math.atan2(-inertial.z, inertial.x);
  }
  function updateSunDir() {
    sunDirection.copy(inertial).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).normalize();
  }

  const _cam = new THREE.Vector3();
  function frame(dt) {
    if (!ctx.time.frozen && dt > 0) rotation += (dt * Math.PI * 2) / dayLength;
    updateSunDir();
    const c = ctx.space.planetCenter;
    const o = ctx.space.origin;
    _cam.set((o.x - c.x) / 1000, (o.y - c.y) / 1000, (o.z - c.z) / 1000);
    // nunca abaixo do raio (evita NaN do domo dentro do planeta)
    const rl = _cam.length();
    if (rl < params.Rp + 0.001) _cam.multiplyScalar((params.Rp + 0.001) / rl);
    uniforms.uCam.value.copy(_cam);
    uniforms.uSun.value.copy(sunDirection);
    // luzes (a cada ~0,25 s de frames: CPU barato)
    if (--acc <= 0) {
      acc = 8;
      const ro = [_cam.x, _cam.y, _cam.z];
      const sd = [sunDirection.x, sunDirection.y, sunDirection.z];
      const tr = transmittanceJS(ro, sd, params);
      const k = 3.2 * (params.sunScale ?? 1);
      sun.color.setRGB(sunColor.r * tr[0], sunColor.g * tr[1], sunColor.b * tr[2]);
      sun.intensity = k;
      // ambiente: céu no zênite + chão (verde escuro refletido)
      const up = _cam.clone().normalize();
      const z = scatterJS(ro, [up.x, up.y, up.z], sd, params);
      const zl = Math.max(1e-4, 0.2126 * z[0] + 0.7152 * z[1] + 0.0722 * z[2]);
      hemi.color.setRGB(z[0] / zl, z[1] / zl, z[2] / zl);
      hemi.intensity = Math.min(1.2, zl * 2.2) + 0.03;
      hemi.groundColor.setRGB(0.12 * tr[0] + 0.01, 0.14 * tr[1] + 0.01, 0.08 * tr[2] + 0.01);
      ambient.color.copy(hemi.color);
      ambient.intensity = hemi.intensity;
      // neblina: média do horizonte em 4 rumos, vista de DENTRO da
      // atmosfera (câmera rebaixada até meia espessura) — fora dela a cor
      // continua sendo a do ar iluminado, não o preto do espaço
      const thick = params.Ra - params.Rp;
      const camR = Math.min(_cam.length(), params.Rp + thick * 0.5);
      const roIn = [up.x * camR, up.y * camR, up.z * camR];
      const f = [0, 0, 0];
      const e = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0));
      if (e.lengthSq() < 1e-6) e.set(1, 0, 0);
      e.normalize();
      const n = new THREE.Vector3().crossVectors(e, up).normalize();
      for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const d = new THREE.Vector3().addScaledVector(e, a).addScaledVector(n, b).addScaledVector(up, 0.04).normalize();
        const s = scatterJS(roIn, [d.x, d.y, d.z], sd, params);
        for (let i = 0; i < 3; i++) f[i] += s[i] / 4;
      }
      fog.color.setRGB(f[0], f[1], f[2]);
      // acima da atmosfera o caminho no ar é ~fixo enquanto a distância
      // cresce: a densidade cai com espessura/altitude
      const altKm = Math.max(0, _cam.length() - params.Rp);
      fog.density = uniforms.uHasAtmo.value ? (1 / (params.Rp * 1000 * 0.4)) * Math.min(1, thick / Math.max(altKm, 1e-3)) : 0;
    }
    // sombra: caixa ortográfica centrada no chão sob a câmera (espaço de
    // render); desligada alto demais (nada a sombrear, evita artefato)
    const planet = ctx.services.planet;
    const R = planet?.radius || params.Rp * 1000;
    const altM = rl * 1000 - R;
    const upN = _cam.clone().normalize();
    sun.castShadow = !!ctx.quality.shadows && altM < 1500;
    sun.target.position.copy(upN).multiplyScalar(-Math.max(0, altM));
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, 1000);
    sun.target.updateMatrixWorld();
  }

  const api = {
    placeholder: true,
    get sunDirection() {
      return sunDirection;
    },
    get sunColor() {
      return sun.color;
    },
    get sunIntensity() {
      return sun.intensity;
    },
    /** várias estrelas: [{ direction, color, intensity }] */
    get suns() {
      return [{ direction: sunDirection, color: sun.color, intensity: sun.intensity }];
    },
    ambient,
    envMap: null,
    sun,
    get rotation() {
      return rotation;
    },
    dayLength,
    get timeOfDay() {
      const lonS = inertialLon() + rotation;
      let t = 0.5 - (lonS - playerLon()) / (Math.PI * 2);
      t -= Math.floor(t);
      return t;
    },
    setTime(t) {
      const lonS = playerLon() + Math.PI * 2 * (0.5 - t);
      rotation = lonS - inertialLon();
      updateSunDir();
      acc = 0;
    },
    fogAt() {
      return { color: fog.color, density: fog.density };
    },
    get atmosphere() {
      return ctx.services.universe?.currentPlanet?.atmosphere || null;
    },
  };
  return {
    api,
    frame,
    dispose() {
      offSys();
      scene.remove(dome, sun, sun.target, hemi);
      if (scene.fog === fog) scene.fog = null;
      dome.geometry.dispose();
      dome.material.dispose();
      sun.dispose?.();
    },
  };
}
