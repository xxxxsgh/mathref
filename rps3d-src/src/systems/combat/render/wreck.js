// Destroços grandes de naves destruídas: placas de casco rasgadas (geometria
// procedural torcida, bordas serrilhadas), metal chamuscado com bordas em
// brasa que esfriam, girando, cada uma arrastando um rastro de fumaça com
// fogo na boca. Complementa os estilhaços pequenos do `rendering`.
//
// Um material compartilhado: o calor de cada peça vem de `userData.heat`
// lido por objeto (onObjectUpdate), então não há recompilação por explosão.
import * as THREE from 'three/webgpu';
import { Fn, uniform, positionLocal, vec3, float, mix, smoothstep, abs, pow, color, normalLocal } from 'three/tsl';
import { fbm3, blackbody } from './tsl.js';

let shared = null;

function plate(seed, w, h, d, bend) {
  // placa com 6×4 segmentos, bordas serrilhadas e curvatura de casco
  const g = new THREE.BoxGeometry(w, d, h, 6, 1, 4);
  const p = g.getAttribute('position');
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const jag = new Map();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const edge = Math.max(Math.abs(x) / (w * 0.5), Math.abs(z) / (h * 0.5));
    const k = `${Math.round(x * 100)}|${Math.round(z * 100)}`;
    if (!jag.has(k)) jag.set(k, [(rnd() - 0.5) * w * 0.28, (rnd() - 0.5) * d * 2.5, (rnd() - 0.5) * h * 0.28]);
    const j = jag.get(k);
    if (edge > 0.98) { x += j[0]; z += j[2]; }
    y += j[1] * edge * edge + bend * (x * x) / (w * w) * w * 0.4 - bend * 0.15 * z * z / h;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function strut(seed) {
  // longarina/seção de quilha retorcida
  const g = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 7, 6, false);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const tw = Math.sin(y * 0.9 + seed) * 0.35;
    p.setX(i, p.getX(i) + tw); p.setZ(i, p.getZ(i) + Math.cos(y * 1.3 + seed) * 0.2);
  }
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function build() {
  const geos = [plate(1, 3.2, 2.2, 0.16, 0.6), plate(2, 2.4, 1.6, 0.2, -0.4), plate(3, 4.0, 1.4, 0.14, 0.9), plate(4, 1.8, 1.8, 0.24, 0.3), strut(1.7), strut(4.2)];
  const heat = uniform(0).onObjectUpdate(({ object }) => object.userData.heat ?? 0);
  const tint = uniform(new THREE.Color(0.8, 0.8, 0.82)).onObjectUpdate(({ object }) => object.userData.tint || _white);
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.75, roughness: 0.5 });
  const P = positionLocal.mul(2.3);
  const n = fbm3(P);
  const n2 = fbm3(P.mul(3.1).add(11.0));
  // pintura do casco descascada e chamuscada
  const char = smoothstep(0.38, 0.62, n.add(n2.mul(0.35)));
  mat.colorNode = mix(vec3(tint).mul(0.85), color(0x0d0c0b), char.mul(0.85).add(0.1));
  mat.roughnessNode = mix(float(0.42), float(0.9), char);
  mat.metalnessNode = mix(float(0.7), float(0.25), char);
  // brasa nas bordas rasgadas (onde o ruído é alto e na espessura da placa)
  const side = float(1).sub(abs(normalLocal.y));
  const ember = smoothstep(0.55, 0.85, n2.add(side.mul(0.45))).mul(heat);
  mat.emissiveNode = blackbody(ember.mul(0.95)).mul(pow(ember, 1.5).mul(9.0));
  shared = { geos, mat };
  return shared;
}
const _white = new THREE.Color(0.8, 0.8, 0.82);

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Wrecks {
  constructor(sim) { this.sim = sim; this.list = []; }

  /** Lança `n` peças a partir de uma nave (pos/vel de mundo, raio, cor do casco). */
  burst(pos, vel, radius, n = 4, tint = null) {
    const sim = this.sim, ctx = sim.ctx;
    const S = shared || build();
    const q = ctx.quality?.name;
    if (q === 'mobile') n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      if (this.list.length > 40) this.kill(this.list[0]);
      const geo = S.geos[Math.floor(sim.rand() * S.geos.length)];
      const mesh = new THREE.Mesh(geo, S.mat);
      const sc = radius * (0.09 + sim.rand() * 0.08);
      mesh.scale.setScalar(sc);
      mesh.userData.heat = 1;
      mesh.userData.tint = tint || _white;
      mesh.castShadow = false;
      const dir = _v.set(sim.rand() - 0.5, sim.rand() - 0.5, sim.rand() - 0.5).normalize();
      const p = pos.clone().addScaledVector(dir, radius * 0.3);
      const v = (vel ? vel.clone().multiplyScalar(0.65) : new THREE.Vector3()).addScaledVector(dir, 18 + sim.rand() * 45);
      const spin = new THREE.Vector3(sim.rand() - 0.5, sim.rand() - 0.5, sim.rand() - 0.5).multiplyScalar(2.4 + sim.rand() * 3);
      mesh.quaternion.setFromEuler(new THREE.Euler(sim.rand() * 6, sim.rand() * 6, sim.rand() * 6));
      const w = { mesh, pos: p, prev: p.clone(), rpos: p.clone(), vel: v, spin, t: 0, life: 7 + sim.rand() * 4, scale: sc, smoke: null, entry: null };
      w.entry = ctx.world.add(mesh, w.rpos);
      if (sim.fx && sim.rand() < 0.8) w.smoke = sim.fx.smoke.alloc({ life: 2.6 + sim.rand() * 1.4, width: sc * 0.9 + 0.4, grow: 7, minDist: 2.5, color: [0.2, 0.19, 0.18], alpha: 0.9, heat: 1, seed: sim.rand() });
      this.list.push(w);
    }
  }

  step(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      w.t += dt;
      w.prev.copy(w.pos);
      w.pos.addScaledVector(w.vel, dt);
      if (w.t > w.life) this.kill(w);
    }
  }

  frame(dt, alpha) {
    const now = this.sim.renderNow;
    for (const w of this.list) {
      w.rpos.lerpVectors(w.prev, w.pos, alpha);
      _q.setFromEuler(new THREE.Euler(w.spin.x * dt, w.spin.y * dt, w.spin.z * dt));
      w.mesh.quaternion.multiply(_q);
      const heat = Math.max(0, 1 - w.t / 4.5);
      w.mesh.userData.heat = heat;
      const fade = Math.min(1, (w.life - w.t) / 1.2);
      w.mesh.scale.setScalar(w.scale * Math.max(0.01, fade));
      if (w.smoke) {
        if (w.t < w.life * 0.6) w.smoke.push(w.rpos, now, heat);
        else if (w.smoke.emitting) w.smoke.stop(now);
      }
    }
  }

  kill(w) {
    const i = this.list.indexOf(w);
    if (i >= 0) this.list.splice(i, 1);
    w.entry?.remove();
    if (w.smoke?.emitting) w.smoke.stop(this.sim.renderNow);
  }

  clear() { for (const w of [...this.list]) this.kill(w); }
}
