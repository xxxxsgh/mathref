// Corpos celestes "substitutos" — usados SOMENTE quando o sistema `planets`
// não existe/falhou (degradação elegante): esferas iluminadas com relevo
// procedural pela paleta do bioma, oceano especular, calotas, nuvens,
// halo atmosférico e gigantes gasosos com faixas e anéis. Vistos de longe
// (órbita) são suficientes para compor o céu do sistema.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, positionLocal, positionWorld, cameraPosition, normalize, dot, max, pow, mix, clamp, smoothstep, length, abs, sin, normalWorld, uv,
} from 'three/tsl';
import { fbm, noise4, ridged } from './tslUtil.js';
import { sstep } from './tslUtil.js';

const hex = (h) => {
  const c = new THREE.Color(h);
  return vec3(c.r, c.g, c.b); // THREE.Color já converte para linear
};

const _z = new THREE.Vector3(0, 0, 1);

export class Proxies {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'space-proxies';
    this.items = [];
  }

  build(system) {
    this.clear();
    for (const b of system.bodies) {
      const item = this.makeBody(b);
      this.items.push(item);
      this.group.add(item.group);
    }
  }

  makeBody(b) {
    const g = new THREE.Group();
    g.name = 'proxy-' + b.id;
    const pal = b.palette;
    const seed = (b.seed % 997) * 0.01;
    const sea = b.seaLevel;
    const isGas = b.kind === 'gas_giant';
    const sunDirU = uniform(new THREE.Vector3(1, 0, 0)); // corpo→estrela (local do corpo)
    const surf = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const elev = Fn(([n]) => {
      const e = fbm(n.mul(0.8).add(seed)).mul(0.7).add(fbm(n.mul(3.2).add(seed + 3.0)).mul(0.3));
      return e.sub(0.5).mul(2.6).add(0.5).add(ridged(n.mul(2.3).add(seed)).mul(0.05));
    });
    if (isGas) {
      surf.colorNode = Fn(() => {
        const n = normalize(positionLocal);
        const warp = fbm(n.mul(vec3(2.0, 6.0, 2.0)).add(seed)).sub(0.5);
        const lat = n.y.add(warp.mul(0.18));
        const bands = sin(lat.mul(22.0)).mul(0.5).add(0.5);
        const fine = sin(lat.mul(71.0).add(warp.mul(8.0))).mul(0.5).add(0.5);
        const c = mix(mix(hex(pal.low), hex(pal.mid), bands), mix(hex(pal.shallow), hex(pal.peak), fine), 0.35);
        const storm = sstep(0.08, 0.0, length(n.sub(normalize(vec3(0.6, -0.25, 0.75))))).mul(0.8);
        return mix(c, hex(pal.accent), storm);
      })();
      surf.roughnessNode = float(0.9);
    } else {
      surf.colorNode = Fn(() => {
        const n = normalize(positionLocal);
        const e = elev(n);
        const sl = float(sea === null ? -1 : 0.5 + sea * 0.12);
        const t = e.sub(sl).div(float(1).sub(sl)).max(0.0);
        let c = mix(hex(pal.low), hex(pal.mid), sstep(0.05, 0.35, t));
        c = mix(c, hex(pal.high), sstep(0.35, 0.6, t));
        c = mix(c, hex(pal.peak), sstep(0.62, 0.8, t));
        c = mix(hex(pal.beach), c, sstep(0.0, 0.04, t));
        const water = mix(hex(pal.deep), hex(pal.shallow), sstep(sl.sub(0.12), sl, e));
        c = mix(water, c, sstep(sl, sl.add(0.005), e));
        // calotas polares
        const cap = sstep(0.78, 0.86, abs(n.y).add(fbm(n.mul(5.0)).sub(0.5).mul(0.2)));
        return mix(c, vec3(0.9, 0.93, 0.97), cap.mul(b.temperature < 60 ? 1 : 0));
      })();
      surf.roughnessNode = Fn(() => {
        const n = normalize(positionLocal);
        const sl = float(sea === null ? -1 : 0.5 + sea * 0.12);
        return mix(float(0.28), float(0.92), sstep(sl, sl.add(0.005), elev(n)));
      })();
    }
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), surf);
    body.scale.setScalar(b.radius);
    g.add(body);

    // nuvens
    if (!isGas && (b.clouds?.coverage || 0) > 0.05) {
      const cm = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1 });
      const cc = b.clouds.color;
      const cov = b.clouds.coverage;
      cm.colorNode = vec3(cc[0], cc[1], cc[2]);
      cm.opacityNode = Fn(() => {
        const n = normalize(positionLocal);
        const w = noise4(n.mul(0.9).add(seed)).xyz.sub(0.5).mul(0.6);
        const c = fbm(n.mul(2.6).add(w).add(seed + 7.0)).mul(0.7).add(fbm(n.mul(9.0).add(w.mul(3.0))).mul(0.3));
        return sstep(float(1.0 - cov * 0.62), float(1.0 - cov * 0.62 + 0.18), c).mul(0.92);
      })();
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), cm);
      clouds.scale.setScalar(b.radius * 1.006);
      g.add(clouds);
    }

    // halo atmosférico (casca de trás, aditiva, borda acesa pelo sol)
    const atm = b.atmosphere;
    if (atm && atm.density > 0.05) {
      const am = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
      const tint = vec3(atm.tint[0], atm.tint[1], atm.tint[2]);
      const sunDir = sunDirU;
      const shell = 1 + Math.max(0.025, atm.heightFrac * 0.5);
      am.colorNode = Fn(() => {
        const n = normalize(positionLocal);
        const V = normalize(cameraPosition.sub(positionWorld));
        const rim = float(1).sub(abs(dot(n, V))); // borda
        const glow = pow(rim, 3.0).mul(sstep(0.0, 0.25, float(1).sub(rim).mul(4.0)));
        const lit = sstep(-0.3, 0.45, dot(n, sunDir));
        return tint.mul(glow).mul(lit).mul(1.1 * Math.min(1.5, atm.density));
      })();
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), am);
      halo.scale.setScalar(b.radius * shell);
      g.add(halo);
    }

    // anéis
    if (b.rings) {
      const rg = new THREE.RingGeometry(b.radius * b.rings.inner, b.radius * b.rings.outer, 256, 1);
      const rm = new THREE.MeshStandardNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
      const rc = b.rings.color;
      const inner = b.rings.inner;
      const outer = b.rings.outer;
      rm.colorNode = vec3(rc[0], rc[1], rc[2]);
      rm.opacityNode = Fn(() => {
        const r = length(positionLocal.xy).div(b.radius);
        const t = r.sub(inner).div(outer - inner);
        const bands = noise4(vec3(t.mul(3.0), 0.3, seed)).x.mul(0.6).add(noise4(vec3(t.mul(11.0), 0.7, seed)).y.mul(0.4));
        const gap = sstep(0.02, 0.0, abs(t.sub(0.62))).mul(0.85);
        return clamp(bands.mul(1.6).sub(0.25), 0.0, 1.0).mul(sstep(0.0, 0.04, t)).mul(sstep(1.0, 0.94, t)).mul(float(1).sub(gap)).mul(b.rings.opacity);
      })();
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
    }
    g.rotation.z = b.axialTilt || 0;
    return { body: b, group: g, sunDir: sunDirU };
  }

  /** Reposiciona os corpos (coordenadas locais). */
  update(world, starLocal) {
    this.group.position.set(0, 0, 0); // o grupo é filho de root: a origem flutuante o desloca
    for (const it of this.items) {
      world.bodyLocal(it.body, it.group.position);
      // o halo usa a normal local da esfera: leva a direção ao referencial inclinado
      it.sunDir.value.copy(starLocal).sub(it.group.position).normalize().applyAxisAngle(_z, -(it.body.axialTilt || 0));
    }
  }

  /** Raio-esfera analítico (para oclusão da estrela). */
  occludes(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const L = dir.length();
    dir.divideScalar(L);
    for (const it of this.items) {
      const c = it.group.position;
      const oc = new THREE.Vector3().subVectors(c, from);
      const tca = oc.dot(dir);
      if (tca < 0 || tca > L) continue;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 < it.body.radius * it.body.radius) return true;
    }
    return false;
  }

  clear() {
    for (const it of this.items) {
      it.group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      this.group.remove(it.group);
    }
    this.items = [];
  }
}
