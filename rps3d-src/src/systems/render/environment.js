// Mapa de ambiente para reflexos PBR (scene.environment).
//
// Uma "cena de céu simplificada" (esfera invertida com material TSL) é
// convertida em PMREM. O céu combina: espaço escuro com nebulosa difusa,
// disco + halo da estrela na direção real do sol, e — perto de planetas —
// um gradiente atmosférico (zênite/horizonte/chão) informado por quem
// controla o céu (render.setSky). Regenerado quando o sol gira mais que
// ~3°, quando o céu muda, ou a cada N segundos.

import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, normalize, positionLocal, dot, max, mix, pow, smoothstep, exp, clamp } from 'three/tsl';
import { fbm3 } from './tsl-lib.js';

export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.scene = new THREE.Scene();
    this.u = {
      sunDir: uniform(new THREE.Vector3(0, 0, 1)),
      sunColor: uniform(new THREE.Color(1, 0.95, 0.88)),
      sunPower: uniform(60),
      zenith: uniform(new THREE.Color(0.0, 0.0, 0.0)),
      horizon: uniform(new THREE.Color(0.0, 0.0, 0.0)),
      ground: uniform(new THREE.Color(0.0, 0.0, 0.0)),
      atmo: uniform(0), // 0 = espaço, 1 = dentro da atmosfera
      upDir: uniform(new THREE.Vector3(0, 1, 0)),
      nebula: uniform(new THREE.Color(0.05, 0.02, 0.09)),
      nebula2: uniform(new THREE.Color(0.0, 0.03, 0.06)),
    };
    const u = this.u;
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    mat.colorNode = Fn(() => {
      const d = normalize(positionLocal);
      // espaço: nebulosa de baixa frequência (dá cor aos reflexos metálicos)
      const n = fbm3(d.mul(2.2), 4);
      const n2 = fbm3(d.mul(4.1).add(vec3(3.1, 1.7, 0.2)), 3);
      const space = u.nebula.mul(smoothstep(0.45, 0.85, n).mul(1.6)).add(u.nebula2.mul(smoothstep(0.4, 0.8, n2))).add(vec3(0.004, 0.005, 0.008));
      // atmosfera
      const h = dot(d, u.upDir);
      const sky = mix(u.horizon, u.zenith, pow(clamp(h, 0, 1), 0.45));
      const gnd = mix(u.horizon, u.ground, smoothstep(0.0, -0.25, h));
      const atm = h.greaterThan(0).select(sky, gnd);
      const base = mix(space, atm, u.atmo);
      // estrela: disco + halo + espalhamento largo (o largo some no espaço)
      const cs = max(dot(d, u.sunDir), 0);
      const disk = smoothstep(0.9995, 0.99985, cs).mul(u.sunPower);
      const halo = pow(cs, 600).mul(u.sunPower.mul(0.08)).add(pow(cs, 40).mul(0.6)).add(pow(cs, 6).mul(u.atmo.mul(0.4).add(0.04)));
      return vec4(base.add(u.sunColor.mul(disk.add(halo))), 1);
    })();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
    this.scene.add(this.mesh);
    this.rt = null;
    this.texture = null;
    this._lastDir = new THREE.Vector3(0, 0, 0);
    this._timer = 0;
    this.dirty = true;
    this.interval = 8; // s
  }

  /** Define o céu de planeta (cores THREE.Color/hex; atmo 0..1). */
  setSky({ zenith, horizon, ground, atmo, up, nebula, nebula2 } = {}) {
    const u = this.u;
    if (zenith !== undefined) u.zenith.value.set(zenith);
    if (horizon !== undefined) u.horizon.value.set(horizon);
    if (ground !== undefined) u.ground.value.set(ground);
    if (atmo !== undefined) u.atmo.value = atmo;
    if (up) u.upDir.value.copy(up).normalize();
    if (nebula !== undefined) u.nebula.value.set(nebula);
    if (nebula2 !== undefined) u.nebula2.value.set(nebula2);
    this.dirty = true;
  }

  /** Lê a direção/cor do sol e regenera se necessário. */
  update(dt, force = false) {
    const { ctx, u } = this;
    const sun = ctx.sun;
    const dir = new THREE.Vector3().subVectors(sun.position, sun.target.position);
    if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
    dir.normalize();
    u.sunDir.value.copy(dir);
    u.sunColor.value.copy(sun.color);
    this._timer += dt;
    const turned = dir.dot(this._lastDir) < Math.cos((3 * Math.PI) / 180);
    if (force || this.dirty || turned || this._timer > this.interval) this.regenerate();
  }

  regenerate() {
    this._lastDir.copy(this.u.sunDir.value);
    this._timer = 0;
    this.dirty = false;
    const old = this.rt;
    this.rt = this.pmrem.fromScene(this.scene, 0, 0.1, 500, { size: 128 });
    this.texture = this.rt.texture;
    const scene = this.ctx.scene;
    if (!scene.environment || scene.environment === old?.texture) scene.environment = this.texture;
    if (old) old.dispose();
  }

  dispose() {
    this.rt?.dispose();
    this.pmrem.dispose();
  }
}
