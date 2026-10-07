// Poeira próxima à câmera: a principal pista de VELOCIDADE no espaço vazio.
// Partículas numa caixa periódica (lado L) em volta da câmera, posições
// geradas na GPU a partir do índice; cada uma vira um traço alongado ao
// longo da velocidade relativa (exposição de ~1/30 s), iluminado pelo sol com
// espalhamento frontal. Na viagem quântica os traços viram fios longos.
// Densidade: base do sistema, mais forte em cinturões, nebulosas e destroços.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, dot, cross, fract, abs,
  positionGeometry, instanceIndex, uv,
} from 'three/tsl';
import { hash33 } from './tsl.js';

const COUNT = { ultra: 2600, high: 1800, medium: 1100, mobile: 600 };

export class Dust {
  constructor(ctx) {
    this.ctx = ctx;
    const n = COUNT[ctx.quality.name] || COUNT.high;
    this.L = 220;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.instanceCount = n;
    const u = this.u = {
      camMod: uniform(new THREE.Vector3()),
      L: uniform(this.L),
      vel: uniform(new THREE.Vector3()),     // velocidade da câmera (m/s, mundo)
      expo: uniform(1 / 30),
      maxLen: uniform(60),
      sun: uniform(new THREE.Vector3(0, 0, 1)),
      sunColor: uniform(new THREE.Color(1, 0.9, 0.8)),
      density: uniform(0.35),
      pa: uniform(0.002),
      tint: uniform(new THREE.Color(0.8, 0.85, 1.0)),
      warp: uniform(0),                      // 0..1 viagem quântica
    };
    const h = hash33(vec3(float(instanceIndex).mul(0.731), float(instanceIndex).mul(1.37).add(5.0), 9.1));
    const h2 = hash33(vec3(float(instanceIndex).mul(2.11), 3.3, float(instanceIndex).mul(0.53)));
    const L = u.L;
    const center = fract(h.mul(L).sub(u.camMod).div(L)).sub(0.5).mul(L).toVar('dc');
    const dist = length(center).toVar('dd');
    // traço: -v·exposição (a poeira "passa" pela câmera)
    const sv = u.vel.mul(u.expo).negate();
    const slen = min(length(sv), u.maxLen);
    const sdir = normalize(sv.add(vec3(1e-4, 0, 0)));
    const width = max(h2.x.mul(0.035).add(0.012), dist.mul(u.pa).mul(1.3));
    const side = normalize(cross(sdir, normalize(center))).toVar('ds');
    const along = positionGeometry.y.add(0.5); // 0..1 do início ao fim do traço
    const len = max(slen, width.mul(2.0));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.positionNode = center.add(sdir.mul(along.sub(0.5).mul(len))).add(side.mul(positionGeometry.x.mul(width.mul(2.0))));
    mat.colorNode = Fn(() => {
      const q = uv();
      const across = abs(q.x.sub(0.5)).mul(2.0);
      const prof = exp(across.mul(across).mul(-4.0)).mul(smoothstep(0.0, 0.25, q.y)).mul(smoothstep(1.0, 0.75, q.y));
      // espalhamento frontal (poeira contra o sol brilha muito mais)
      const V = normalize(center);
      const mu = dot(V, u.sun);
      const phase = pow(max(mu, 0.0), 8.0).mul(3.0).add(0.25);
      const fade = smoothstep(L.mul(0.5), L.mul(0.25), dist).mul(smoothstep(0.6, 3.0, dist));
      // conservação: traço longo espalha a mesma luz
      const energy = width.mul(2.0).div(len).mul(0.85).add(0.15);
      const lum = phase.mul(fade).mul(energy).mul(u.density).mul(h2.y.mul(0.8).add(0.4)).mul(0.9);
      const col = mix(u.sunColor, u.tint, u.warp.mul(0.85));
      return vec4(col.mul(lum).mul(prof), 1);
    })();
    mat.fog = false;
    const mesh = this.mesh = new THREE.Mesh(g, mat);
    mesh.name = 'poeira';
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    this.prevCam = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.baseDensity = 0.35;
  }

  setSystem(sys, params) {
    this.baseDensity = params?.nebula?.on ? 0.55 : 0.32;
    this.prevCam.copy(this.ctx.player.camWorld);
  }

  frame(dt, ctx) {
    const c = ctx.player.camWorld;
    // velocidade: preferimos a do jogador; senão, derivada da câmera
    const pv = ctx.player.vel;
    if (pv && pv.lengthSq() > 0) this.vel.copy(pv);
    else if (dt > 0) this.vel.copy(c).sub(this.prevCam).divideScalar(dt);
    if (this.vel.length() > 5e7) this.vel.setLength(5e7);
    this.prevCam.copy(c);
    const sp = ctx.services.space;
    const ws = sp?.warpState || { quantum: 0 };
    const warp = Math.max(ws.quantum || 0, ws.jump || 0);
    // na viagem quântica a caixa cresce (fios longos)
    const L = this.L = warp > 0.05 ? 220 + warp * 1800 : 220;
    const m = (x) => ((x % L) + L) % L;
    const u = this.u;
    u.L.value = L;
    u.camMod.value.set(m(c.x), m(c.y), m(c.z));
    u.vel.value.copy(this.vel);
    u.maxLen.value = 40 + warp * 900;
    u.warp.value = warp;
    const sys = ctx.universe.system;
    if (sys) { sys.sunDir(c, u.sun.value); u.sunColor.value.setRGB(...sys.star.color); }
    u.pa.value = sp?.uniforms?.pa.value || 0.002;
    const belt = sp?.beltDensityAt ? sp.beltDensityAt(c) : 0;
    u.density.value = (this.baseDensity + belt * 1.6 + warp * 1.2) * (ctx.player.altitude < 2e5 ? 0.3 : 1);
  }
}
