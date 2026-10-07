// Cinturão visto de longe: faixa de poeira e rochas não resolvidas.
// Camadas de anéis finos empilhadas na espessura do cinturão (de perfil
// ainda formam uma faixa), com bandas radiais, aglomerados angulares e
// espalhamento frontal (brilha mais contra o sol). Some perto da câmera,
// onde os asteroides instanciados e o cascalho assumem.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, dot, positionLocal, positionWorld, atan, cos, sin,
} from 'three/tsl';
import { n3 } from './tsl.js';

const LAYERS = 7;

export class BeltRing {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];
    this.u = {
      sun: uniform(new THREE.Vector3(1, 0, 0)), // direção câmera → estrela
      sunColor: uniform(new THREE.Color(1, 0.9, 0.8)),
    };
  }

  setSystem(sys) {
    for (const it of this.items) { it.entry.remove(); it.mesh.geometry.dispose(); it.mesh.material.dispose(); }
    this.items = [];
    for (const b of sys.belts || []) this.items.push(this.make(b));
  }

  make(b) {
    const ctx = this.ctx;
    const ri = b.radiusInner * 0.97, ro = b.radiusOuter * 1.03;
    const segs = ctx.quality.name === 'mobile' ? 192 : 384;
    const geos = [];
    for (let k = 0; k < LAYERS; k++) {
      const g = new THREE.RingGeometry(ri, ro, segs, 6);
      g.rotateX(-Math.PI / 2);
      const y = (k / (LAYERS - 1) - 0.5) * b.thickness * 0.9;
      g.translate(0, y, 0);
      geos.push(g);
    }
    // junta as camadas numa geometria só (1 draw call)
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), idx = [];
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      for (const i of g.index.array) idx.push(i + o);
      o += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), ro * 1.1);

    const u = this.u;
    const mid = (b.radiusInner + b.radiusOuter) / 2, half = (b.radiusOuter - b.radiusInner) / 2;
    const thick = b.thickness;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    mat.colorNode = Fn(() => {
      const p = positionLocal;
      const rho = length(p.xz);
      const x = rho.sub(mid).div(half);
      const radial = exp(x.mul(x).mul(-2.2));
      const ang = atan(p.z, p.x);
      const dir = vec3(cos(ang), sin(ang), 0);
      // bandas radiais finas + aglomerados ao longo da órbita
      const bands = n3(vec3(rho.div(half * 0.35), 0.5, 0.25)).r.mul(0.6).add(n3(vec3(rho.div(half * 0.09), 0.1, 0.7)).g.mul(0.4));
      const clumps = n3(dir.mul(3.0).add(vec3(0, 0, rho.div(half * 2.0)))).r;
      const yv = p.y.div(thick * 0.5);
      const vert = exp(yv.mul(yv).mul(-1.6));
      const dens = radial.mul(vert).mul(smoothstep(0.3, 0.75, bands.mul(0.6).add(clumps.mul(0.5)))).toVar();
      // espalhamento: Henyey-Greenstein (g=0,55) + fundo isotrópico
      const V = normalize(positionWorld);
      const mu = dot(V, u.sun);
      const g = 0.55;
      const hg = float(1 - g * g).div(pow(float(1 + g * g).sub(mu.mul(2 * g)), 1.5)).mul(0.25);
      const dist = length(positionWorld);
      const near = smoothstep(4.0e4, 3.5e5, dist);
      const col = vec3(0.78, 0.68, 0.56).mul(u.sunColor).mul(hg.add(0.05)).mul(dens).mul(near).mul(0.055);
      return vec4(col, 1);
    })();
    mat.fog = false;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'cinturao-distante';
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    const entry = this.ctx.world.add(mesh, b.center.clone());
    return { mesh, entry, b };
  }

  frame(dt, ctx) {
    const sys = ctx.universe.system;
    if (!sys || !this.items.length) return;
    sys.sunDir(ctx.player.camWorld, this.u.sun.value);
    this.u.sunColor.value.setRGB(...sys.star.color);
  }
}
