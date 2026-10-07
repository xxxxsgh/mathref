// Poeira espacial em parallax ao redor da câmera — a referência de
// velocidade no vácuo. Partículas fixas no referencial do SISTEMA dentro de
// uma caixa que "dá a volta" (wrap) em torno da câmera; viram riscos ao
// longo da velocidade (motion streaks) e brilham contra a luz da estrela
// (espalhamento frontal). Dentro do cinturão há também pedregulhos reais
// (rochas instanciadas pequenas) passando rente à nave.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, attribute, uniform, cameraPosition, normalize, cross, length, max, min, clamp, dot, pow, exp, fract, mix, varying, select, abs,
} from 'three/tsl';
import { makeRng } from '../../core/Rng.js';
import { camU, sstep } from './tslUtil.js';
import { rockGeometry, rockMaterial } from './AsteroidKit.js';

const BOX = 240; // m
const PEB_BOX = 520; // m
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Dust {
  constructor(ctx) {
    this.ctx = ctx;
    const n = Math.round(Math.min(4000, Math.max(800, (ctx.quality.p.particlesMax | 0) / 12)));
    this.uOff = uniform(new THREE.Vector3());
    this.uVel = uniform(new THREE.Vector3());
    this.uDensity = uniform(1);
    this.uSunDir = uniform(new THREE.Vector3(1, 0, 0));
    this.uSunCol = uniform(new THREE.Color(1, 1, 1));
    this.uTint = uniform(new THREE.Color(0.75, 0.7, 0.62));
    const r = makeRng(777);
    const seed = new Float32Array(n * 4 * 4);
    const corner = new Float32Array(n * 4 * 2);
    const idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const sx = r(), sy = r(), sz = r(), sb = r();
      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c;
        seed.set([sx, sy, sz, sb], v * 4);
        corner[v * 2] = c & 1 ? 1 : -1;
        corner[v * 2 + 1] = c & 2 ? 1 : -1;
      }
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); // o risco pode ficar de costas
    m.forceSinglePass = true;
    m.fog = false;
    const aSeed = attribute('seed', 'vec4');
    const aC = attribute('corner', 'vec2');
    const { uOff, uVel, uDensity, uSunDir, uSunCol, uTint } = this;
    const rel = fract(aSeed.xyz.sub(uOff).add(0.5)).sub(0.5).mul(BOX);
    const dist = length(rel).max(0.5);
    const speed = length(uVel);
    const vdir = select(speed.greaterThan(0.5), uVel.div(speed.max(1e-3)), camU.up);
    const view = rel.div(dist);
    const side = normalize(cross(vdir, view).add(vec3(1e-5, 0, 0)));
    const w = max(float(0.04), dist.mul(camU.pixelAngle).mul(1.4));
    const L = clamp(speed.mul(0.022), 0.0, 30.0).add(w);
    m.positionNode = cameraPosition.add(rel).add(side.mul(aC.x).mul(w)).add(vdir.mul(aC.y).mul(L.mul(0.5)));
    const vC = varying(aC, 'vDustC');
    const vI = varying(
      Fn(() => {
        // brilho: frontal contra a estrela + fundo fraco; some perto e longe
        const phase = pow(max(dot(view, uSunDir), 0.0), 6.0).mul(3.0).add(0.55);
        const fade = sstep(1.5, 6.0, dist).mul(sstep(BOX * 0.5, BOX * 0.3, dist));
        const energy = clamp(w.div(L).sqrt().mul(2.0), 0.4, 1.0); // risco longo: energia espalhada (limitada para continuar visível)
        const vis = clamp(uDensity.mul(0.5).sub(aSeed.w).mul(20.0), 0.0, 1.0); // densidade controla quantas aparecem
        return phase.mul(fade).mul(energy).mul(vis).mul(aSeed.w.mul(0.7).add(0.3));
      })(),
      'vDustI',
    );
    m.colorNode = Fn(() => {
      const a = float(1).sub(abs(vC.x)).mul(float(1).sub(abs(vC.y).pow(4.0)));
      return vec4(uTint.mul(uSunCol).mul(vI).mul(a).mul(1.0), 1.0);
    })();
    this.motes = new THREE.Mesh(g, m);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 10;
    this.motes.name = 'space-dust';
    // o deslocamento da caixa usa a câmera no instante do desenho (sem atraso de 1 frame)
    this.motes.onBeforeRender = (r, sc, camera) => {
      if (!this.world) return;
      const e = camera.matrixWorld.elements;
      const o = this.world.origin;
      const fr = (v) => {
        const q = v / BOX;
        return q - Math.floor(q);
      };
      this.uOff.value.set(fr(e[12] + o.x), fr(e[13] + o.y), fr(e[14] + o.z));
    };
    this.world = ctx.world;
    ctx.scene.add(this.motes);

    // pedregulhos do cinturão
    const pn = 160;
    this.pebSeeds = [];
    for (let i = 0; i < pn; i++) {
      this.pebSeeds.push({
        p: [r(), r(), r()],
        size: 0.4 + Math.pow(r(), 3) * 7,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
        axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        spin: r.range(0.05, 0.5),
        shade: r.range(0.7, 1.1),
      });
    }
    const ra = new THREE.InstancedBufferAttribute(new Float32Array(pn * 4), 4);
    const ma = new THREE.InstancedBufferAttribute(new Float32Array(pn * 4), 4);
    this.pebbles = new THREE.InstancedMesh(rockGeometry(2, 2), rockMaterial(ra, ma), pn);
    this.pebbles.frustumCulled = false;
    this.pebbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pebbles.userData = { ra, ma };
    this.pebbles.name = 'space-pebbles';
    this.pebbles.visible = false;
    ctx.root.add(this.pebbles); // em root: acompanha a origem flutuante junto com a câmera
    this.prevCam = null;
    this.vel = new THREE.Vector3();
  }

  /**
   * @param camSys posição da câmera em coordenadas do sistema (double)
   * @param camLocal posição local (cena)
   * @param density 0..2 (cinturão/destroços/tempestade aumentam)
   * @param pebbles 0..1 pedregulhos (cinturão)
   */
  frame(dt, camSys, camLocal, sunDir, sunColor, density, pebbles, time, tint) {
    // velocidade da câmera no referencial do sistema (suavizada)
    if (this.prevCam && dt > 0) {
      const vx = (camSys.x - this.prevCam.x) / dt, vy = (camSys.y - this.prevCam.y) / dt, vz = (camSys.z - this.prevCam.z) / dt;
      const k = Math.min(1, dt * 8);
      if (Math.hypot(vx, vy, vz) < 5e4) this.vel.set(this.vel.x + (vx - this.vel.x) * k, this.vel.y + (vy - this.vel.y) * k, this.vel.z + (vz - this.vel.z) * k);
      else this.vel.set(0, 0, 0); // salto/teleporte
    }
    this.prevCam = { ...camSys };
    const fr = (v, b) => {
      const q = v / b;
      return q - Math.floor(q);
    };
    this.uOff.value.set(fr(camSys.x, BOX), fr(camSys.y, BOX), fr(camSys.z, BOX));
    this.uVel.value.copy(this.vel);
    this.uDensity.value = density;
    this.uSunDir.value.copy(sunDir);
    this.uSunCol.value.copy(sunColor);
    if (tint) this.uTint.value.copy(tint);
    this.motes.visible = density > 0.02;

    this.pebbles.visible = pebbles > 0.01;
    if (this.pebbles.visible) {
      const P = this.pebbles;
      P.position.set(0, 0, 0);
      const ra = P.userData.ra.array;
      let n = 0;
      const want = Math.floor(this.pebSeeds.length * Math.min(1, pebbles));
      for (let i = 0; i < want; i++) {
        const s = this.pebSeeds[i];
        const rx = (fr(s.p[0] - camSys.x / PEB_BOX, 1) - 0.5) * PEB_BOX;
        const ry = (fr(s.p[1] - camSys.y / PEB_BOX, 1) - 0.5) * PEB_BOX;
        const rz = (fr(s.p[2] - camSys.z / PEB_BOX, 1) - 0.5) * PEB_BOX;
        // some na borda da caixa (sem "estalo" no wrap)
        const edge = Math.max(Math.abs(rx), Math.abs(ry), Math.abs(rz)) / (PEB_BOX * 0.5);
        const sc = s.size * Math.min(1, (1 - edge) * 6);
        if (sc <= 0.01) continue;
        _q.setFromAxisAngle(s.axis, time * s.spin).multiply(s.q);
        _p.set(camLocal.x + rx, camLocal.y + ry, camLocal.z + rz);
        _s.setScalar(sc);
        _m.compose(_p, _q, _s);
        P.setMatrixAt(n, _m);
        ra.set([0.42 * s.shade, 0.38 * s.shade, 0.34 * s.shade, sc], n * 4);
        n++;
      }
      P.count = n;
      P.instanceMatrix.needsUpdate = true;
      P.userData.ra.needsUpdate = true;
    }
  }

  dispose() {
    for (const o of [this.motes, this.pebbles]) {
      o.geometry.dispose();
      o.material.dispose();
      o.removeFromParent();
    }
  }
}
