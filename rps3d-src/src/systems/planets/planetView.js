// Um corpo celeste visível: grupo no referencial do planeta (gira com ele),
// quadtree de terreno + oceano (rochosos), esfera de faixas + anéis
// (gasosos), casca de céu (dispersão) e casca de nuvens volumétricas.
// Atualiza os uniforms de estado (câmera e sol no referencial local, cores
// do céu calculadas na CPU para IBL/reflexo/neblina).
import * as THREE from 'three/webgpu';
import { terrainDesc, getTerrain } from './terrain.js';
import { atmoParams, scatterCPU, sunTransmittance } from './atmoModel.js';
import { atmoUniforms } from './scatter.js';
import { stateUniforms, makeTerrainMaterials, makeWaterMaterial, makeSkyMaterial } from './materials.js';
import { makeCloudMaterials } from './clouds.js';
import { makeGasGiant } from './gasGiant.js';
import { paletteFor } from './palettes.js';
import { QuadTree } from './quadtree.js';
import { weatherTexture } from './weatherMap.js';

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const SKY_SCALE = 8;     // intensidade do sol para a dispersão (calibrada com o pipeline AgX)

export class PlanetView {
  constructor(ctx, body, sys, pool, Q) {
    this.ctx = ctx; this.body = body; this.sys = sys;
    this.desc = terrainDesc(body);
    this.terrain = body.kind === 'gas_giant' ? null : getTerrain(this.desc);
    this.A = atmoParams(body);
    this.P = paletteFor(body);
    this.U = atmoUniforms(body);
    this.S = stateUniforms();
    const tilt = body.axialTilt || 0;
    this.axis = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0).normalize();
    this.S.axis.value.copy(this.axis);
    this.S.city.value = body.colony ? 1 : 0;
    this.S.cloudCov.value = 0;
    this.group = new THREE.Group();
    this.group.name = 'pl.' + body.name;
    this.group.matrixWorldAutoUpdate = true;
    this.entry = ctx.world.add(this.group, body.pos);
    this.camLocal = new THREE.Vector3();
    this.sunLocal = new THREE.Vector3(1, 0, 0);
    this.dominant = false;
    this.altitude = Infinity;
    const hasClouds = !!body.atmosphere && (body.clouds || 0) > 0.05 && body.kind !== 'gas_giant';
    this.opts = { atmoSteps: Q.atmosphereSteps || 10, cloudSteps: Q.cloudSteps || 32, clouds: hasClouds };
    if (hasClouds) this.S.wtex = weatherTexture(body, Q.name === 'mobile' ? 256 : 512);
    this.skyCPU = { I: [0, 0, 0], T: [1, 1, 1] };
    this.zen = [0, 0, 0]; this.hor = [0, 0, 0]; this.sunT = [1, 1, 1];

    if (body.kind === 'gas_giant') {
      this.gas = makeGasGiant(body, this.P, this.U, this.S);
      this.group.add(this.gas.group);
    } else {
      this.mats = makeTerrainMaterials(body, this.P, this.U, this.S, this.opts);
      this.waterMat = this.terrain.hasSea ? makeWaterMaterial(body, this.P, this.U, this.S, this.opts) : null;
      const N = Q.terrainChunkRes || 32;
      const minSpacing = { ultra: 0.45, high: 0.7, medium: 1.1, mobile: 1.8 }[Q.name] || 0.8;
      const maxLevel = Math.max(4, Math.min(16, Math.round(Math.log2((Math.PI / 2) * body.radius / (N * minSpacing)))));
      const errPx = { ultra: 6, high: 8, medium: 11, mobile: 15 }[Q.name] || 8;
      this.tree = new QuadTree({ group: this.group, desc: this.desc }, pool, { N, maxLevel, errPx });
      this.tree.setMaterials(this.mats.far, this.waterMat);
    }
    if (body.atmosphere) {
      this.skyMat = makeSkyMaterial(body, this.U, this.S, this.opts);
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(this.A.top, 128, 64), this.skyMat);
      this.sky.renderOrder = -4; this.sky.frustumCulled = false; this.sky.name = 'pl.sky';
      this.group.add(this.sky);
      if (hasClouds) {
        this.cloud = makeCloudMaterials(body, this.U, this.S, this.opts);
        this.S.cloudMid.value = (this.cloud.layer.base + this.cloud.layer.top) / 2 - body.radius;
        this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(this.cloud.layer.top, 160, 80), this.cloud.outer);
        this.cloudMesh.renderOrder = -3; this.cloudMesh.frustumCulled = false; this.cloudMesh.name = 'pl.clouds';
        this.group.add(this.cloudMesh);
      }
    }
  }

  /** Deriva do mapa de clima em longitude (fração de volta) no tempo t. */
  wmapAt(t) { return (t / 14000 + (this.body.seed % 100) / 100) % 1; }

  /** Altura do terreno (m) numa direção local. */
  heightAt(dir) { return this.terrain ? this.terrain.height(dir.x, dir.y, dir.z) : 0; }

  frame(ctx, t, info) {
    const b = this.body, S = this.S;
    b.rotationAt(t, _q);
    this.group.quaternion.copy(_q);
    b.worldToLocal(info.cam, t, this.camLocal);
    _v.copy(this.sys.star.pos).sub(b.pos).normalize();
    b.dirToLocal(_v, t, this.sunLocal);
    S.cam.value.copy(this.camLocal);
    S.sunL.value.copy(this.sunLocal);
    S.time.value = t;
    const sc = this.sys.star.color, I = info.sunI;
    S.sunCol.value.set(sc[0] * I, sc[1] * I, sc[2] * I);
    const sk = I / 4.2 * SKY_SCALE;
    S.skyI.value.set(sc[0] * sk, sc[1] * sk, sc[2] * sk);
    S.comp.value = info.comp;
    // vento das nuvens (período 10 mantém continuidade com os multiplicadores)
    const w = S.wind.value;
    w.set((t * 0.0011) % 10, (t * 0.0002) % 10, (t * 0.0007) % 10);
    // o padrão de clima inteiro deriva devagar em longitude (ventos zonais)
    S.wmapU.value = this.wmapAt(t);

    const r = this.camLocal.length();
    this.altitude = r - b.radius;
    this.dominant = info.dominant === b;

    // céu na CPU (no ponto sob a câmera): IBL, reflexo da água, neblina, nuvens
    this.updateSkyColors(r);

    if (this.tree) {
      this.tree.setMaterials(this.dominant && info.lit ? this.mats.near : this.mats.far, this.waterMat);
      this.tree.update(this.camLocal, info.K);
      S.lodK.value = this.tree.lodK;
    }
    if (this.cloudMesh) {
      const L = this.cloud.layer;
      const m = r > L.top ? this.cloud.outer : r > L.base ? this.cloud.inside : this.cloud.below;
      if (this.cloudMesh.material !== m) this.cloudMesh.material = m;
    }
  }

  updateSkyColors(r) {
    const A = this.A, S = this.S;
    const up = _w.copy(this.camLocal).divideScalar(Math.max(1, r));
    if (!this.dominant) { // longe: um ponto genérico a 45° do sol
      up.copy(this.sunLocal).applyAxisAngle(this.axis, 0.0).normalize();
      const perp = new THREE.Vector3().crossVectors(this.sunLocal, this.axis).normalize();
      up.addScaledVector(perp, 1).normalize();
    }
    if (!A) {
      S.skyZ.value.set(0, 0, 0); S.skyH.value.set(0, 0, 0); S.amb.value.set(0.004, 0.004, 0.005);
      this.zen = [0, 0, 0]; this.hor = [0, 0, 0]; this.sunT = [1, 1, 1];
      return;
    }
    const L = [this.sunLocal.x, this.sunLocal.y, this.sunLocal.z];
    const rr = Math.min(Math.max(r, A.R + 2), A.top - 1);
    const ro = [up.x * rr, up.y * rr, up.z * rr];
    const sk = S.skyI.value;
    const z = scatterCPU(A, ro, [up.x, up.y, up.z], L, Infinity, 8, this.skyCPU);
    this.zen = [z.I[0] * sk.x, z.I[1] * sk.y, z.I[2] * sk.z];
    // horizonte: média entre direção do sol e oposta (projetadas no plano local)
    const sd = this.sunLocal.clone().addScaledVector(up, -this.sunLocal.dot(up));
    if (sd.lengthSq() < 1e-6) sd.set(up.y, -up.x, 0);
    sd.normalize();
    const hz = [0, 0, 0];
    for (const s of [1, -1]) {
      const d = [sd.x * s + up.x * 0.06, sd.y * s + up.y * 0.06, sd.z * s + up.z * 0.06];
      const l = Math.hypot(...d);
      const o = scatterCPU(A, ro, [d[0] / l, d[1] / l, d[2] / l], L, Infinity, 8, this.skyCPU);
      for (let k = 0; k < 3; k++) hz[k] += o.I[k] * 0.5 * [sk.x, sk.y, sk.z][k];
    }
    this.hor = hz;
    S.skyZ.value.set(...this.zen);
    S.skyH.value.set(...hz);
    const mu = this.sunLocal.dot(up);
    sunTransmittance(A, Math.max(rr, A.R + 2), mu, this.sunT);
    S.amb.value.set(this.zen[0] * 1.6 + hz[0] * 0.6, this.zen[1] * 1.6 + hz[1] * 0.6, this.zen[2] * 1.6 + hz[2] * 0.6);
  }

  dispose() {
    this.entry.remove();
    this.tree?.destroy();
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
