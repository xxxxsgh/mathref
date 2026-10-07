// BAKE do céu de um sistema estelar num cubemap HDR (uma vez por sistema).
//
// Para cada direção, dois raymarchings:
//  1) GALÁXIA — o modelo de densidade da galáxia do Universe.js (3 braços em
//     espiral logarítmica, disco fino, bojo central achatado, regiões HII
//     rosadas e faixas de poeira no bordo interno dos braços), integrado a
//     partir da POSIÇÃO REAL do sistema (anos-luz). Daí sai uma Via Láctea
//     coerente: de Kessa o bojo fica para um lado, a faixa escura corta o
//     disco, sistemas na borda veem uma faixa tênue.
//  2) NEBULOSA — volume de emissão/absorção (fBm com domain warping +
//     filamentos ridged), núcleo ionizado azulado em volta de um aglomerado,
//     e uma "fenda" de poeira escura atravessando o meio (a Fenda de Órion).
//
// Canal alfa = densidade de estrelas não resolvidas (o fundo usa para pôr mais
// estrelas na faixa galáctica e dentro da nebulosa, menos atrás da poeira).
//
// O bake pode ser feito todo de uma vez (init) ou uma face por frame (troca de
// sistema durante o salto, sem engasgo).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, abs, dot,
  positionWorld, Loop, atan, cos, int, If,
} from 'three/tsl';
import { n3, hash13 } from './tsl.js';

const BAKE = {
  ultra: { size: 1024, gal: 48, neb: 64 },
  high: { size: 768, gal: 40, neb: 48 },
  medium: { size: 512, gal: 28, neb: 36 },
  mobile: { size: 384, gal: 20, neb: 26 },
};

export class SkyBake {
  constructor(ctx) {
    this.ctx = ctx;
    const q = ctx.quality.name;
    const cfg = { ...(BAKE[q] || BAKE.high) };
    const ps = Number(ctx.params.get('skysize'));
    if (ps) cfg.size = ps;
    this.cfg = cfg;

    this.rt = new THREE.CubeRenderTarget(cfg.size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rt.texture.name = 'ceu-profundo';
    this.camera = new THREE.CubeCamera(0.5, 10, this.rt);
    this.scene = new THREE.Scene();

    const u = this.u = {
      galPos: uniform(new THREE.Vector3()),
      w2gX: uniform(new THREE.Vector3(1, 0, 0)),
      w2gY: uniform(new THREE.Vector3(0, 1, 0)),
      w2gZ: uniform(new THREE.Vector3(0, 0, 1)),
      galGain: uniform(1),
      nebOn: uniform(0),
      nebA: uniform(new THREE.Color()),
      nebB: uniform(new THREE.Color()),
      nebDensity: uniform(0.8),
      nebCenter: uniform(new THREE.Vector3(0, 0, -1)),
      nebCore: uniform(new THREE.Vector3(0, 0, -1)),
      nebRift: uniform(new THREE.Vector3(0, 1, 0)),
      nebSpread: uniform(1),
      nebSeed: uniform(new THREE.Vector3()),
      far: Array.from({ length: 4 }, () => ({ dir: uniform(new THREE.Vector3(0, 1, 0)), color: uniform(new THREE.Color()), size: uniform(0.1), strength: uniform(0) })),
    };

    const GAL = cfg.gal, NEB = cfg.neb;

    // ── galáxia ────────────────────────────────────────────────────────
    const galaxyMarch = (dW) => {
      const dg = normalize(vec3(dot(u.w2gX, dW), dot(u.w2gY, dW), dot(u.w2gZ, dW))).toVar();
      const col = vec3(0).toVar();
      const T = float(1).toVar();
      const dens = float(0).toVar();
      const jit = hash13(dW.mul(731.7));
      const SMAX = 1500.0;
      Loop({ start: int(0), end: int(GAL), type: 'int', condition: '<' }, ({ i }) => {
        const x = float(i).add(jit).div(GAL);
        const s = x.mul(x).mul(SMAX).add(0.3);
        const ds = x.mul(2.0 * SMAX / GAL).add(0.2);
        const p = u.galPos.add(dg.mul(s)).toVar();
        const R = length(p.xz).toVar();
        const ang = atan(p.z, p.x);
        const ph = ang.sub(R.sub(60.0).mul(0.008654)).mul(3.0).toVar();
        const nA = n3(p.mul(1 / 170)).r;
        const arm = pow(cos(ph).mul(0.5).add(0.5), 3.0).mul(nA.add(0.45)).toVar();
        const hz = R.mul(0.012).add(6.5);
        const disk = exp(R.div(-250.0)).mul(exp(abs(p.y).div(hz).negate())).mul(smoothstep(640.0, 520.0, R)).toVar();
        const bR = length(vec3(p.x, p.y.mul(2.3), p.z));
        const bulge = exp(pow(bR.div(52.0), 1.35).negate());
        const clumps = n3(p.mul(1 / 46).add(3.1)).g.mul(0.65).add(n3(p.mul(1 / 13).add(1.7)).r.mul(0.35));
        const cl = clumps.mul(1.5);
        const starsE = disk.mul(arm.mul(1.7).add(0.16)).mul(cl.mul(cl).mul(cl)).toVar();
        const em = mix(vec3(1.0, 0.84, 0.66), vec3(0.72, 0.84, 1.0), clamp(arm.mul(1.4), 0, 1)).mul(starsE).toVar();
        em.addAssign(vec3(1.0, 0.76, 0.48).mul(bulge.mul(2.6)));
        const hii = disk.mul(pow(arm, 3.0)).mul(smoothstep(0.58, 0.86, n3(p.mul(1 / 28).add(7.7)).b)).mul(3.0);
        em.addAssign(vec3(1.0, 0.32, 0.5).mul(hii));
        // poeira: lado interno dos braços + filamentos
        const dustArm = pow(cos(ph.add(0.6)).mul(0.5).add(0.5), 5.0);
        const fil = n3(p.mul(1 / 62).add(11.3)).a.mul(0.6).add(n3(p.mul(1 / 19).add(4.3)).a.mul(0.4));
        const dust = exp(R.div(-330.0)).mul(exp(abs(p.y).div(hz.mul(0.42)).negate()))
          .mul(dustArm.mul(1.5).add(0.12)).mul(smoothstep(0.15, 0.75, fil).add(0.1))
          .add(bulge.mul(0.15)).toVar();
        col.addAssign(em.mul(T).mul(ds));
        dens.addAssign(starsE.add(bulge.mul(0.5)).mul(T).mul(ds));
        T.mulAssign(exp(dust.mul(ds).mul(-0.034)));
      });
      // curva de contraste: a faixa brilha, o resto do céu fica escuro de verdade
      const c0 = col.mul(0.0016);
      const lum = dot(c0, vec3(0.3, 0.55, 0.15));
      const k = pow(lum.mul(4.0).add(1e-6), 0.75);
      return vec4(c0.mul(k).mul(u.galGain), dens.mul(0.012));
    };

    // ── nebulosa ───────────────────────────────────────────────────────
    const nebulaMarch = (d) => {
      const col = vec3(0).toVar();
      const T = float(1).toVar();
      const dens = float(0).toVar();
      const jit = hash13(d.mul(517.3).add(3.7)).mul(0.5).add(0.25);
      const c0 = u.nebCenter.mul(1.8);
      const k0 = u.nebCore.mul(1.72);
      const L = 1.6;
      const D = (x) => n3(x).r.mul(0.62).add(n3(x.mul(2.3).add(1.3)).a.mul(0.38));
      Loop({ start: int(0), end: int(NEB), type: 'int', condition: '<' }, ({ i }) => {
        const t = float(i).add(jit).div(NEB).mul(L).add(1.0).toVar();
        const dt = L / NEB;
        const q = d.mul(t).toVar();
        const rel = q.sub(c0).toVar();
        const sp = u.nebSpread;
        // massa principal: gaussiana larga × casca (a nuvem é uma "parede", não um volume uniforme)
        const ts = t.sub(1.8).div(0.42);
        const env = exp(dot(rel, rel).div(sp.mul(sp)).negate()).mul(exp(ts.mul(ts).negate())).toVar();
        const warp = n3(q.mul(0.3).add(u.nebSeed)).rgb.sub(0.5).toVar();
        const qq = q.mul(0.55).add(warp.mul(0.42)).add(u.nebSeed).toVar();
        // lóbulos de grande escala separados por vazios
        const lobe = smoothstep(0.4, 0.62, n3(q.mul(0.33).add(u.nebSeed.zxy)).r).toVar();
        const d1 = D(qq).toVar();
        const s1 = smoothstep(0.5, 0.7, d1).toVar();
        // borda iluminada: superfície voltada para o aglomerado ionizante
        const toK = normalize(k0.sub(q));
        const s2 = smoothstep(0.5, 0.7, D(qq.add(toK.mul(0.035))));
        const rim = max(s1.sub(s2), 0.0).mul(env).mul(lobe).mul(u.nebDensity).mul(9.0);
        const fine = n3(qq.mul(4.3).add(2.7)).a;
        const dN = env.mul(lobe).mul(s1).mul(u.nebDensity).mul(2.6).toVar();
        // fenda escura principal
        const rd = dot(rel, u.nebRift).add(warp.x.mul(0.3));
        const rw = warp.y.mul(0.08).add(0.13);
        const rift = exp(rd.mul(rd).div(rw.mul(rw)).negate()).mul(exp(dot(rel, rel).div(sp.mul(sp).mul(-1.6)))).mul(fine.mul(0.9).add(0.4));
        // glóbulos escuros (células de Worley)
        const glob = env.mul(smoothstep(0.62, 0.8, n3(qq.mul(1.9).add(9.1)).b)).mul(1.6);
        const dust = rift.mul(3.2).add(glob).mul(u.nebDensity).toVar();
        // ionização em volta do aglomerado
        const kr = q.sub(k0);
        const ion = exp(dot(kr, kr).div(-0.07)).toVar();
        const hue = clamp(smoothstep(0.35, 0.68, n3(qq.mul(0.7).add(2.2)).g).mul(0.8).add(ion.mul(0.8)), 0, 1);
        const cm = mix(u.nebA, u.nebB, hue);
        const c = pow(cm, vec3(1.6)).mul(2.0).toVar(); // mais saturado
        // frentes de hidrogênio (rosa-avermelhado) nas bordas iluminadas
        const hA = vec3(1.0, 0.3, 0.42);
        const emis = c.mul(dN.mul(ion.mul(2.6).add(0.45)).mul(fine.mul(0.9).add(0.55)))
          .add(mix(c, hA, 0.45).mul(rim).mul(ion.mul(1.5).add(0.6)))
          .add(vec3(0.6, 0.78, 1.0).mul(ion.mul(ion).mul(dN).mul(1.4)));
        col.addAssign(emis.mul(T).mul(dt));
        dens.addAssign(dN.mul(T).mul(dt));
        T.mulAssign(exp(dust.add(dN.mul(0.3)).mul(dt).mul(-3.4)));
      });
      return { col: col.mul(0.62), T, dens };
    };

    // ── nebulosas distantes (manchas) ──────────────────────────────────
    const farNebula = (d) => {
      const c = vec3(0).toVar();
      for (const f of u.far) {
        const a = max(dot(d, f.dir), 0.0);
        const ang = float(1).sub(a);
        const m = exp(ang.div(f.size.mul(f.size).mul(0.5)).negate());
        const nn = n3(d.mul(6.0).add(f.dir.mul(13.0))).r;
        const nn2 = n3(d.mul(15.0).add(f.dir.mul(7.0))).a;
        c.addAssign(f.color.mul(m.mul(smoothstep(0.35, 0.8, nn.mul(0.7).add(nn2.mul(0.45)))).mul(f.strength).mul(0.05)));
      }
      return c;
    };

    const sky = Fn(() => {
      const d = normalize(positionWorld).toVar();
      const g = galaxyMarch(d).toVar();
      const out = vec3(0).toVar();
      const starDens = float(0).toVar();
      const Tn = float(1).toVar();
      const nebStars = float(0).toVar();
      // nebulosa só onde existe (evita custo em sistemas sem nebulosa)
      If(u.nebOn.greaterThan(0.5), () => {
        const nb = nebulaMarch(d);
        Tn.assign(nb.T);
        out.assign(nb.col);
        nebStars.assign(nb.dens);
      });
      const farC = farNebula(d);
      out.addAssign(g.rgb.add(farC).mul(Tn));
      starDens.assign(g.a.mul(Tn).add(nebStars.mul(0.8)));
      return vec4(out, starDens);
    });

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
    mat.colorNode = sky();
    mat.fog = false;
    mat.toneMapped = false;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4, 64, 32), mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.pending = -1; // face a renderar no modo incremental
  }

  /** Atualiza os uniforms para um sistema (params de skyParams.js). */
  setParams(p) {
    const u = this.u;
    u.galPos.value.copy(p.galPos);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(p.worldToGal);
    const e = m.elements; // coluna-maior: linhas da matriz world→gal
    u.w2gX.value.set(e[0], e[4], e[8]);
    u.w2gY.value.set(e[1], e[5], e[9]);
    u.w2gZ.value.set(e[2], e[6], e[10]);
    const n = p.nebula;
    u.nebOn.value = n.on ? 1 : 0;
    u.nebA.value.copy(n.colorA); u.nebB.value.copy(n.colorB);
    u.nebDensity.value = n.on ? 0.55 + n.density * 0.9 : 0;
    u.nebCenter.value.copy(n.center); u.nebCore.value.copy(n.core); u.nebRift.value.copy(n.rift);
    u.nebSpread.value = n.spread; u.nebSeed.value.copy(n.seed);
    for (let i = 0; i < 4; i++) {
      const f = p.far[i], uf = u.far[i];
      if (!f) { uf.strength.value = 0; continue; }
      uf.dir.value.copy(f.dir); uf.color.value.copy(f.color); uf.size.value = f.size; uf.strength.value = f.strength;
    }
  }

  /** Compila o shader do bake antes do primeiro uso (o backend WebGL compila em paralelo e pularia o draw). */
  async compile(renderer) {
    try { await renderer.compileAsync(this.scene, this.camera.children[0] || this.camera); } catch (e) { console.warn('[deepspace] compileAsync do bake', e); }
    this.compiled = true;
  }

  /** Bake completo e síncrono (6 faces). */
  bakeAll(renderer) {
    this.camera.update(renderer, this.scene);
    this.pending = -1;
  }

  /** Começa um bake incremental (uma face por chamada de step()). */
  bakeIncremental() { this.pending = 0; }

  /** Renderiza uma face pendente. Retorna true quando terminou. */
  step(renderer) {
    if (this.pending < 0) return true;
    const cc = this.camera;
    if (cc.coordinateSystem !== renderer.coordinateSystem) { cc.coordinateSystem = renderer.coordinateSystem; cc.updateCoordinateSystem(); }
    if (this.pending === 0) cc.updateMatrixWorld();
    const cams = cc.children;
    const prevRT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace?.() ?? 0, prevMip = renderer.getActiveMipmapLevel?.() ?? 0;
    const prevXr = renderer.xr?.enabled; if (renderer.xr) renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt, this.pending, 0);
    renderer.render(this.scene, cams[this.pending]);
    renderer.setRenderTarget(prevRT, prevFace, prevMip);
    if (renderer.xr) renderer.xr.enabled = prevXr;
    this.pending++;
    if (this.pending >= 6) { this.pending = -1; return true; }
    return false;
  }

  get texture() { return this.rt.texture; }
}
