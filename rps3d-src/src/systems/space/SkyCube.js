// Fundo do céu "distante" (no infinito): Via Láctea procedural com poeira
// escura, granulado de estrelas não resolvidas e nebulosas por RAYMARCHING
// volumétrico (fBm via textura 3D, iluminação interna por estrelas jovens,
// faixas de poeira que absorvem). É caro, então é renderizado UMA vez por
// sistema estelar num cubemap HDR (CubeCamera) e o domo do céu só amostra o
// cubo. O mesmo cubo serve de mapa de ambiente para reflexos PBR.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, normalize, positionLocal, dot, exp, mix, smoothstep, clamp, max, length, Loop, If, pow, interleavedGradientNoise, screenCoordinate, abs, sqrt, asin, atan, cross, floor, step,
} from 'three/tsl';
import { fbm, billow, ridged, hash13, blackbody, noise4 } from './tslUtil.js';
import { sstep } from './tslUtil.js';
import { blackbodyRGB } from './tslUtil.js';

const v3 = (a) => vec3(a[0], a[1], a[2]);
const sq = (x) => x.mul(x); // pow(x,2) com x<0 é indefinido em GLSL/WGSL

/**
 * Nó de cor do céu distante para a direção `dirNode` (vec3 normalizado).
 * `L` = skyLayout(system); `steps` = passos do raymarch da nebulosa.
 */
export function makeSkyColorNode(L, steps) {
  const galN = v3(L.galN);
  const gc = v3(L.gc);
  const c1 = v3(L.color1);
  const c2 = v3(L.color2);
  const dens = L.density;

  // ── Via Láctea ─────────────────────────────────────────────────────────
  const milkyWay = Fn(([d]) => {
    const sinb = dot(d, galN);
    const toGC = dot(d, gc).mul(0.5).add(0.5).max(0.0); // 1 no centro galáctico (max: pow de negativo = NaN)
    const bulge = pow(toGC, 8.0);
    const warp = fbm(d.mul(1.2).add(vec3(3.1, 1.7, 0.2))).sub(0.5);
    const lat = sinb.add(warp.mul(0.05));
    const width = float(0.085).add(bulge.mul(0.15));
    const band = exp(lat.div(width).mul(lat.div(width)).negate());
    const wide = exp(lat.div(width.mul(2.8)).mul(lat.div(width.mul(2.8))).negate()).mul(0.22);
    // nuvens de estrelas e granulado fino
    const clouds = sstep(0.3, 0.75, fbm(d.mul(2.2).add(vec3(7.0, 2.0, 5.0)))).mul(0.6).add(0.4);
    const fine = fbm(d.mul(7.5).add(vec3(1.3, 4.4, 2.2)));
    const lum = band.mul(clouds).mul(fine.mul(0.7).add(0.65)).add(wide).mul(float(0.45).add(bulge.mul(1.9))).toVar();
    // poeira escura: a "Grande Fenda" (larga e coerente, levemente fora do plano)
    // + nuvens escuras menores com bordas recortadas pelo ruído
    const q = d.mul(2.4).add(vec3(warp.mul(1.6), warp.mul(-1.1), 0.4));
    const riftShape = fbm(q).add(fbm(d.mul(9.0).add(warp)).sub(0.5).mul(0.35));
    const rift = sstep(0.47, 0.6, riftShape).mul(exp(sq(lat.sub(0.018).div(width.mul(0.45))).negate())).mul(0.85);
    const knots = sstep(0.58, 0.7, fbm(d.mul(6.0).add(vec3(warp.mul(2.0), 0.5, 1.5)))).mul(0.6);
    const near = exp(sq(lat.add(0.01).div(width.mul(0.9))).negate());
    const dust = clamp(rift.add(knots.mul(near)), 0.0, 0.92);
    lum.mulAssign(float(1.0).sub(dust));
    // cor: braços azulados, bojo dourado, regiões HII rosadas
    const col = mix(vec3(0.66, 0.74, 1.0), vec3(1.0, 0.8, 0.56), sstep(0.1, 0.8, bulge.add(band.mul(0.15))));
    const hii = sstep(0.8, 0.95, ridged(d.mul(8.0).add(vec3(2.0, 9.0, 4.0)))).mul(band).mul(clouds).mul(float(1.0).sub(dust));
    // avermelhamento pela poeira (luz atravessando a poeira fica mais quente)
    const redden = mix(vec3(1, 1, 1), vec3(1.0, 0.6, 0.38), dust);
    return col.mul(redden).mul(lum).mul(0.3).add(vec3(1.0, 0.3, 0.45).mul(hii).mul(0.06));
  });

  // ── granulado de estrelas não resolvidas (mais denso na faixa) ─────────
  const starGrain = Fn(([d, mwLum]) => {
    const S = float(470.0);
    const cell = floor(d.mul(S));
    const h = hash13(cell);
    const h2 = hash13(cell.add(17.31));
    const prob = float(0.01).add(mwLum.mul(0.35));
    const on = step(float(1.0).sub(prob), h);
    const T = mix(float(3200), float(12000), pow(h2, 2.0));
    return blackbody(T).mul(on).mul(pow(h2, 4.0).mul(0.16).add(0.012));
  });

  // ── nebulosas volumétricas ────────────────────────────────────────────
  const blobs = L.blobs;
  const emb = L.embedded.slice(0, 6);
  const shape = Fn(([p]) => {
    let s = float(0);
    for (const b of blobs) {
      const C = vec3(b.c[0] * b.dist, b.c[1] * b.dist, b.c[2] * b.dist);
      const q = p.sub(C).div(b.radius);
      s = s.add(exp(dot(q, q).mul(-1.6)).mul(b.weight));
    }
    return s;
  });
  const hueField = Fn(([p]) => {
    let hsum = float(0);
    let wsum = float(1e-4);
    for (const b of blobs) {
      const C = vec3(b.c[0] * b.dist, b.c[1] * b.dist, b.c[2] * b.dist);
      const q = p.sub(C).div(b.radius);
      const w = exp(dot(q, q).mul(-1.6));
      hsum = hsum.add(w.mul(b.hue));
      wsum = wsum.add(w);
    }
    return hsum.div(wsum);
  });

  const nebula = Fn(([d]) => {
    const col = vec3(0).toVar();
    const T = float(1).toVar();
    const r0 = float(0.6);
    const r1 = float(2.9);
    const dt = r1.sub(r0).div(steps);
    const jit = interleavedGradientNoise(screenCoordinate.xy); // ruído de baixa discrepância: menos granulado
    Loop(steps, ({ i }) => {
      const r = r0.add(float(i).add(jit).mul(dt));
      const p = d.mul(r);
      const s = shape(p);
      If(s.greaterThan(0.012), () => {
        const q = p.mul(0.85);
        // 3 buscas por passo: distorção de domínio, forma e detalhe
        const w = noise4(q.mul(0.55).add(vec3(0.17, 0.41, 0.73)));
        const warp = w.xyw.sub(0.5).mul(0.95);
        const a = noise4(q.add(warp));
        const n = a.z.mul(0.5).add(a.y.mul(0.3)).add(a.w.mul(0.2));
        const b = noise4(q.mul(2.7).add(warp.mul(1.5)));
        const detail = b.x.mul(0.5).add(b.y.mul(0.3)).add(b.w.mul(0.2));
        const dn = clamp(s.mul(1.35).sub(0.42).add(n.sub(0.45).mul(2.0)).add(detail.sub(0.5).mul(0.7)), 0.0, 1.0).toVar();
        dn.assign(dn.mul(dn).mul(dens * 1.6 + 0.2));
        // poeira (só absorve): filamentos escuros
        const rid = float(1).sub(abs(b.y.sub(0.5)).mul(2.0));
        const dust = clamp(rid.mul(rid).sub(0.55).mul(3.2), 0.0, 1.0).mul(clamp(s.mul(1.5), 0.0, 1.0)).mul(sstep(0.35, 0.65, a.x));
        // cor: mistura das duas cores do sistema
        const hm = clamp(hueField(p).add(w.x.sub(0.5).mul(1.8)), 0.0, 1.0);
        // iluminação interna por estrelas jovens embutidas
        let glow = vec3(0);
        for (const e of emb) {
          const ep = vec3(e.pos[0], e.pos[1], e.pos[2]);
          const dd = p.sub(ep);
          const k = float(e.power).div(dot(dd, dd).mul(60.0).add(0.35));
          const sc = blackbodyRGB(e.temp);
          glow = glow.add(vec3(sc[0], sc[1], sc[2]).mul(k));
        }
        const ec = mix(c1, c2, hm).mul(1.4).mul(float(0.5).add(length(glow).mul(0.6))).add(glow.mul(dn).mul(0.5));
        col.addAssign(T.mul(ec).mul(dn).mul(dt).mul(2.6));
        T.mulAssign(exp(dn.mul(2.2).add(dust.mul(9.0)).mul(dt).negate()));
      });
    });
    return vec4(col, T);
  });

  return Fn(([d]) => {
    const mw = milkyWay(d);
    const mwL = mw.length();
    const grain = starGrain(d, clamp(mwL.mul(3.0), 0.0, 1.0));
    const neb = nebula(d);
    const deep = vec3(0.004, 0.005, 0.009); // brilho de fundo extremamente tênue
    return neb.xyz.add(mw.add(grain).add(deep).mul(neb.w));
  });
}

export class SkyCube {
  constructor(ctx) {
    this.ctx = ctx;
    this.size = 0;
    this.rt = null;
    this.scene = new THREE.Scene();
    this.mesh = null;
    this.camera = null;
    this.dirty = false;
    this.layout = null;
  }
  get texture() {
    return this.rt?.texture || null;
  }
  /** Prepara o material do sistema e agenda a renderização do cubo. */
  build(layout) {
    const q = this.ctx.quality;
    const size = { ultra: 1024, high: 768, medium: 512, mobile: 256 }[q.name] || 512;
    const steps = Math.max(8, q.p.nebulaSteps | 0);
    if (!this.rt || this.size !== size) {
      this.rt?.dispose();
      this.rt = new THREE.CubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      this.rt.texture.name = 'space-sky-cube';
      this.size = size;
      this.camera = new THREE.CubeCamera(0.1, 100, this.rt);
      this.scene.add(this.camera);
    }
    this.layout = layout;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.material.dispose();
    }
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
    const sky = makeSkyColorNode(layout, steps);
    mat.colorNode = sky(normalize(positionLocal));
    mat.fog = false;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.dirty = true;
  }
  /** Renderiza o cubo se precisar (chamado no frame). */
  render() {
    if (!this.dirty || !this.mesh) return false;
    const r = this.ctx.renderer;
    const prevTM = r.toneMapping;
    this.camera.update(r, this.scene);
    r.toneMapping = prevTM;
    this.dirty = false;
    return true;
  }
  /** Material "ao vivo" (sem cubo) — usado para depuração (?skylive=1). */
  liveNode(dirNode) {
    const steps = Math.max(8, this.ctx.quality.p.nebulaSteps | 0);
    return makeSkyColorNode(this.layout, steps)(dirNode);
  }
  dispose() {
    this.rt?.dispose();
    this.mesh?.material.dispose();
    this.mesh?.geometry.dispose();
  }
}
