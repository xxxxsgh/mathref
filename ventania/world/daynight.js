// Ciclo dia/noite: hora do dia → posição do sol/lua, paleta do céu, névoa,
// luzes e uniforms de ambiente. A paleta é interpolada pela ELEVAÇÃO do sol,
// com chaves pintadas à mão (noite azul-violeta, aurora/crepúsculo pêssego,
// golden hour, dia claro-quente). Nada aqui chega perto de cinza ou preto.

import * as THREE from 'three';
import { ENV } from '../render/fog.js';
import { clamp, smoothstep } from '../core/math.js';

const C = (h) => new THREE.Color(h);

// [elevação em graus, chave]
const KEYS = [
  [-18, { top: C('#1a1c4e'), horizon: C('#363a74'), fog: C('#30336a'), sun: C('#9fb0ff'), sunI: 0.55, hemiSky: C('#6a72c8'), hemiGround: C('#3c3058'), hemiI: 1.25, rim: C('#7f8cff'), rimI: 0.25, fogSun: C('#3a3a78'), exposure: 1.15 }],
  [-6, { top: C('#2c3474'), horizon: C('#8a6a9a'), fog: C('#6f5f8f'), sun: C('#ff9a6a'), sunI: 0.4, hemiSky: C('#7a78cc'), hemiGround: C('#4e3a5a'), hemiI: 1.15, rim: C('#ff9a7a'), rimI: 0.5, fogSun: C('#e0806a'), exposure: 1.05 }],
  [2, { top: C('#3d5fb0'), horizon: C('#ffa36e'), fog: C('#e6a07e'), sun: C('#ff9f55'), sunI: 2.2, hemiSky: C('#a09cf0'), hemiGround: C('#86607c'), hemiI: 1.2, rim: C('#ffb070'), rimI: 1.0, fogSun: C('#ffb46a'), exposure: 1.0 }],
  [12, { top: C('#4c7fd6'), horizon: C('#ffd29a'), fog: C('#f2cfa2'), sun: C('#ffcf8a'), sunI: 2.7, hemiSky: C('#a4a6f2'), hemiGround: C('#86668e'), hemiI: 1.3, rim: C('#ffc884'), rimI: 0.9, fogSun: C('#ffd9a0'), exposure: 1.0 }],
  [35, { top: C('#4a86de'), horizon: C('#cfe0ee'), fog: C('#cfdbe6'), sun: C('#fff0d6'), sunI: 3.0, hemiSky: C('#a6b0f6'), hemiGround: C('#84749a'), hemiI: 1.3, rim: C('#ffe2b0'), rimI: 0.6, fogSun: C('#fff0d0'), exposure: 0.95 }],
  [70, { top: C('#3f7fdc'), horizon: C('#bfd6ec'), fog: C('#c4d6e8'), sun: C('#fff6e6'), sunI: 3.1, hemiSky: C('#a8b4f6'), hemiGround: C('#84769a'), hemiI: 1.3, rim: C('#ffe8c0'), rimI: 0.5, fogSun: C('#fff4e0'), exposure: 0.92 }],
];

function samplePalette(elev, out) {
  let i = 0;
  while (i < KEYS.length - 1 && elev > KEYS[i + 1][0]) i++;
  const [e0, a] = KEYS[i];
  const [e1, b] = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const t = e1 === e0 ? 0 : smoothstep(0, 1, clamp((elev - e0) / (e1 - e0), 0, 1));
  for (const k in a) {
    if (a[k].isColor) (out[k] ||= new THREE.Color()).copy(a[k]).lerp(b[k], t);
    else out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

export class DayNight {
  constructor(scene) {
    this.scene = scene;
    this.time = 17.1; // golden hour
    this.speed = 1 / 60; // horas de jogo por segundo real (24 min por dia)
    this.fast = false;
    this.frozen = false;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xffffff, 0.00055);

    this.pal = {};
    this.env = {
      sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(),
      skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), fog: new THREE.Color(), sunDisc: new THREE.Color(),
      night: 0, elevation: 0, exposure: 1,
    };
    this.shadowRange = 40;
    this.shadowSize = 2048;
  }

  configureShadows(size, range) {
    this.shadowSize = size;
    this.shadowRange = range;
    const s = this.sun.shadow;
    s.mapSize.set(size, size);
    s.camera.left = -range; s.camera.right = range;
    s.camera.top = range; s.camera.bottom = -range;
    s.camera.near = 1; s.camera.far = 600;
    s.radius = 3;
    s.camera.updateProjectionMatrix();
    s.map?.dispose();
    s.map = null;
  }

  toggleFast() { this.fast = !this.fast; return this.fast; }

  update(dt, focus, camera) {
    if (!this.frozen) this.time = (this.time + dt * this.speed * (this.fast ? 40 : 1)) % 24;
    const env = this.env;

    // Sol: nasce às 6h no leste (+X), põe às 18h no oeste, arco inclinado
    // para o sul (+Z) para a luz rasante de fim de tarde vir de oés-sudoeste.
    const a = ((this.time - 6) / 12) * Math.PI; // 0 nascer, PI pôr
    const maxElev = THREE.MathUtils.degToRad(62);
    env.sunDir.set(Math.cos(a), Math.sin(a) * Math.sin(maxElev), Math.sin(a) * Math.cos(maxElev) * 0.6 + 0.35).normalize();
    env.moonDir.set(-env.sunDir.x, -env.sunDir.y, -env.sunDir.z * 0.4 + 0.3).normalize();
    if (env.moonDir.y < 0.15) env.moonDir.y = 0.15 + (0.15 - env.moonDir.y) * 0.3;
    env.moonDir.normalize();
    const elev = THREE.MathUtils.radToDeg(Math.asin(env.sunDir.y));
    env.elevation = elev;
    samplePalette(elev, this.pal);
    const P = this.pal;
    env.night = smoothstep(-2, -12, elev);

    // Luz direcional: sol de dia, lua à noite (troca suave perto do horizonte).
    const useMoon = elev < -4;
    env.lightDir.copy(useMoon ? env.moonDir : env.sunDir);
    if (!useMoon && env.lightDir.y < 0.06) env.lightDir.y = 0.06;
    env.lightDir.normalize();
    const fadeEdge = useMoon ? smoothstep(-4, -10, elev) : smoothstep(-4, 1, elev);
    this.sun.color.copy(P.sun);
    this.sun.intensity = P.sunI * (useMoon ? Math.max(fadeEdge, 0.2) : fadeEdge);

    this.hemi.color.copy(P.hemiSky);
    this.hemi.groundColor.copy(P.hemiGround);
    this.hemi.intensity = P.hemiI;

    // A caixa de sombra segue o foco, presa à grade de texels (não treme).
    const r = this.shadowRange;
    const texel = (2 * r) / this.shadowSize;
    const lightPos = env.lightDir.clone().multiplyScalar(250);
    const target = focus.clone();
    // Projeta o alvo no espaço da luz para arredondar.
    const lm = new THREE.Matrix4().lookAt(lightPos, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const inv = lm.clone().invert();
    target.applyMatrix4(inv);
    target.x = Math.round(target.x / texel) * texel;
    target.y = Math.round(target.y / texel) * texel;
    target.applyMatrix4(lm);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(lightPos);
    this.sun.target.updateMatrixWorld();

    env.skyTop.copy(P.top);
    env.skyHorizon.copy(P.horizon);
    env.fog.copy(P.fog);
    env.sunDisc.copy(P.sun).lerp(new THREE.Color(1, 1, 1), 0.25);
    env.exposure = P.exposure;
    this.scene.fog.color.copy(P.fog);

    // Uniforms de ambiente.
    ENV.vtSunDir.value.copy(env.sunDir);
    ENV.vtSunColor.value.copy(P.sun).multiplyScalar(this.sun.intensity / 3);
    ENV.vtFogSun.value.copy(P.fogSun);
    ENV.vtRimColor.value.copy(P.rim).multiplyScalar(P.rimI);
    if (camera) ENV.vtSunView.value.copy(env.lightDir).transformDirection(camera.matrixWorldInverse);
  }

  /** Hora formatada (para o HUD). */
  clock() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
