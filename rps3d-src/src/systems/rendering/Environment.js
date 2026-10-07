// IBL (luz de ambiente/reflexos) gerada proceduralmente: uma cena mínima com
// uma esfera cujo shader TSL pinta o "céu de baixa frequência" (brilho da
// nebulosa do sistema, halo do sol, o planeta próximo como luz rebatida e, na
// superfície, o gradiente do céu). Vira PMREM e alimenta scene.environment.
//
// Regenera de forma barata e espaçada (ctx.quality → envInterval) só quando a
// direção do sol/planeta muda o suficiente, reaproveitando o mesmo render
// target (sem recompilar materiais). Outros sistemas podem:
//   rendering.environment.setSky({ zenith, horizon, ground, intensity })   // céu de superfície (planets)
//   rendering.environment.setNebula(colorA, colorB, strength)              // tom do sistema (deepspace)
//   rendering.environment.setSource(object3D | null)                       // cena customizada inteira
//   rendering.environment.refresh()
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, normalize, positionLocal, dot, max, pow, mix, smoothstep, clamp, exp, abs } from 'three/tsl';
import { fbm3 } from './tslib.js';

const _d = new THREE.Vector3();

export class Environment {
  constructor(ctx, fx, sun) {
    this.ctx = ctx; this.fx = fx; this.sun = sun;
    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.target = null;
    this.timer = 0;
    this.dirty = true;
    this.lastSun = new THREE.Vector3();
    this.lastPlanet = new THREE.Vector3();
    this.source = null;
    this.intensity = 1;

    const u = this.u = {
      sunDir: uniform(new THREE.Vector3(0, 1, 0)),
      sunColor: uniform(new THREE.Color(1, 0.95, 0.9)),
      sunPower: uniform(1),
      nebA: uniform(new THREE.Color(0.12, 0.05, 0.18)),
      nebB: uniform(new THREE.Color(0.02, 0.07, 0.14)),
      nebStrength: uniform(1),
      planetDir: uniform(new THREE.Vector3(0, -1, 0)),
      planetColor: uniform(new THREE.Color(0.2, 0.3, 0.4)),
      planetSize: uniform(0),     // cos do raio angular (0 = sem planeta)
      planetLit: uniform(0),
      skyZenith: uniform(new THREE.Color(0.1, 0.25, 0.6)),
      skyHorizon: uniform(new THREE.Color(0.6, 0.65, 0.7)),
      skyGround: uniform(new THREE.Color(0.18, 0.16, 0.14)),
      skyMix: uniform(0),          // 0 = espaço, 1 = sob atmosfera
      up: uniform(new THREE.Vector3(0, 1, 0)),
    };

    const skyNode = Fn(() => {
      const d = normalize(positionLocal).toVar();
      // espaço: nebulosa difusa + faixa galáctica tênue
      const n = fbm3(d.mul(2.2)).toVar();
      const band = exp(abs(d.y.add(d.x.mul(0.25))).mul(-5.0));
      const space = mix(u.nebB, u.nebA, smoothstep(0.35, 0.75, n)).mul(n.mul(0.9).add(0.25)).mul(u.nebStrength).add(vec3(0.05, 0.055, 0.07).mul(band)).toVar();
      // halo do sol: só a luz espalhada em volta (o disco/especular vêm da
      // DirectionalLight — pôr o sol forte aqui contaria a luz duas vezes e,
      // em PMREM pequeno (mobile), viraria luz difusa vinda de todo lado)
      const sd = max(dot(d, u.sunDir), 0);
      const halo = u.sunColor.mul(pow(sd, 12).mul(0.25).add(pow(sd, 3).mul(0.04))).mul(u.sunPower);
      // planeta próximo: disco que rebate luz do sol
      const pd = dot(d, u.planetDir);
      const inPlanet = smoothstep(u.planetSize.sub(0.02), u.planetSize.add(0.01), pd).mul(u.planetSize.greaterThan(0.0).select(1.0, 0.0));
      const planet = u.planetColor.mul(u.planetLit.mul(0.9).add(0.02));
      // céu de superfície
      const h = dot(d, u.up);
      const sky = mix(u.skyHorizon, u.skyZenith, pow(clamp(h, 0, 1), 0.45)).toVar();
      sky.assign(mix(u.skyGround, sky, smoothstep(-0.08, 0.04, h)));
      sky.addAssign(u.sunColor.mul(pow(sd, 8).mul(1.5)).mul(u.sunPower));
      const spaceCol = mix(space, planet, inPlanet).add(halo);
      return vec4(mix(spaceCol, sky.add(halo.mul(0.4)), u.skyMix), 1);
    })();

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
    mat.colorNode = skyNode;
    mat.fog = false;
    this.envScene = new THREE.Scene();
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat);
    this.envScene.add(this.skyMesh);
    this.nebSet = false;
  }

  setSky(o) {
    if (!o) { this.u.skyMix.value = 0; this.dirty = true; return; }
    if (o.zenith) this.u.skyZenith.value.set(o.zenith);
    if (o.horizon) this.u.skyHorizon.value.set(o.horizon);
    if (o.ground) this.u.skyGround.value.set(o.ground);
    if (o.up) this.u.up.value.copy(o.up).normalize();
    this.u.skyMix.value = o.mix ?? 1;
    this.dirty = true;
  }
  setNebula(a, b, strength = 1) {
    this.u.nebA.value.set(a); this.u.nebB.value.set(b); this.u.nebStrength.value = strength;
    this.nebSet = true; this.dirty = true;
  }
  setSource(obj) { this.source = obj; this.dirty = true; }
  refresh() { this.dirty = true; }
  setIntensity(v) { this.intensity = v; this.ctx.scene.environmentIntensity = v; }

  /** Tom da nebulosa derivado do seed do sistema (fallback quando deepspace não define). */
  onSystem(sys) {
    if (!sys) return;
    if (!this.nebSet) {
      const h = ((sys.seed ?? 7) % 1000) / 1000;
      const a = new THREE.Color().setHSL((h + 0.75) % 1, 0.7, 0.09);
      const b = new THREE.Color().setHSL((h + 0.52) % 1, 0.6, 0.06);
      this.u.nebA.value.copy(a); this.u.nebB.value.copy(b);
      this.nebSet = false;
    }
    this.dirty = true;
  }

  /** Corpo mais dominante no céu (maior raio angular) para luz rebatida. */
  dominantBody(ctx) {
    const sys = ctx.universe.system; if (!sys) return null;
    let best = null, bestA = 0;
    for (const b of sys.bodies) {
      _d.copy(b.pos).sub(ctx.player.camWorld);
      const d = _d.length();
      const a = b.radius / Math.max(d, b.radius);
      if (a > bestA) { bestA = a; best = { b, dir: _d.clone().divideScalar(d), cosR: Math.cos(Math.asin(Math.min(1, a))) }; }
    }
    return bestA > 0.02 ? best : null;
  }

  update(ctx, dt) {
    this.timer += dt;
    const u = this.u;
    u.sunDir.value.copy(this.sun.direction);
    u.sunColor.value.copy(this.sun.color);
    u.sunPower.value = Math.max(0.02, this.sun.visibility);
    const dom = this.dominantBody(ctx);
    if (dom) {
      u.planetDir.value.copy(dom.dir);
      u.planetSize.value = dom.cosR;
      const pal = dom.b.palette?.[2] || '#557799';
      u.planetColor.value.set(pal);
      // fração iluminada vista daqui: lado do planeta voltado ao sol
      u.planetLit.value = Math.max(0, -dom.dir.dot(this.sun.direction) * 0.5 + 0.5) * this.sun.visibility;
    } else u.planetSize.value = 0;

    const moved = this.lastSun.angleTo(this.sun.direction) > 0.06 || (dom && this.lastPlanet.angleTo(dom.dir) > 0.08);
    if ((this.dirty || moved) && this.timer >= (this.dirty ? 0.2 : this.fx.envInterval)) this.regenerate();
  }

  regenerate() {
    this.timer = 0; this.dirty = false;
    this.lastSun.copy(this.sun.direction);
    this.lastPlanet.copy(this.u.planetDir.value);
    const ctx = this.ctx;
    try {
      const scene = this.source || this.envScene;
      const rt = this.pmrem.fromScene(scene, 0.02, 0.1, 100, { size: this.fx.envSize, renderTarget: this.target });
      if (!this.target) {
        this.target = rt;
        ctx.scene.environment = rt.texture;
        ctx.scene.environmentIntensity = this.intensity;
      }
    } catch (e) {
      console.warn('[rendering] PMREM falhou', e);
    }
  }

  api() {
    const self = this;
    return {
      setSky: (o) => self.setSky(o),
      setNebula: (a, b, s) => self.setNebula(a, b, s),
      setSource: (o) => self.setSource(o),
      setIntensity: (v) => self.setIntensity(v),
      refresh: () => self.refresh(),
      get texture() { return self.target?.texture || null; },
      uniforms: self.u,
    };
  }
}
