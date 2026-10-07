// Pipeline de pós-processamento HDR do RPS3D (three/webgpu RenderPipeline).
//
// Ordem (tudo linear/HDR até o tone mapping):
//   cena (MRT: cor + velocidade) → TRAA → motion blur → DoF
//   → bloom físico (mips) ─┬→ lens flare (fantasmas, halo, raia anamórfica)
//                          └→ sujeira de lente
//   → god rays (máscara de céu perto da estrela + desfoque radial)
//   → composite: distorção (calor, gotas, gelo, rachaduras) + aberração
//     cromática + visor + flash + vinheta
//   → tone mapping AgX + sRGB (renderOutput) → grão de filme + dithering.
//
// Cada efeito liga/desliga pelo preset (ctx.quality.p.*); build() recria o
// grafo de nós (chamado em 'quality:change' e quando um efeito opcional —
// DoF por API, visor — é ativado pela primeira vez).

import * as THREE from 'three/webgpu';
import {
  Fn, pass, mrt, output, velocity, uniform, uniformArray, texture, vec2, vec3, vec4, float, int, uv, Loop, If,
  mix, max, min, clamp, smoothstep, length, dot, abs, exp, renderOutput, rtt, logarithmicDepthToViewZ,
  screenCoordinate, interleavedGradientNoise, fract, sin, passTexture,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { lensFlarePass, godRaysPass, makeLensDirt } from './post/lens.js';
import { visorRain, visorFrost, visorDust, visorCrack } from './post/visor.js';
import { vnoise2, hash12 } from './tsl-lib.js';
import { setVelocityMRT } from './mrtMask.js';

export const MAX_HEAT = 8;

/** Uniforms compartilhados do pós (valores controlados pelo index.js). */
export function makeUniforms() {
  return {
    time: uniform(0),
    aspect: uniform(16 / 9),
    near: uniform(0.05),
    far: uniform(5e9),
    sunUV: uniform(new THREE.Vector2(0.5, 0.5)),
    sunVis: uniform(0),
    flare: uniform(1),
    godrays: uniform(1),
    dirt: uniform(1),
    heat: uniform(0),
    heatSrc: uniformArray(Array.from({ length: MAX_HEAT }, () => new THREE.Vector4(0, 0, 0, 0)), 'vec4'),
    visor: uniform(new THREE.Vector4(0, 0, 0, 0)), // chuva, gelo, poeira, rachadura
    visorFlow: uniform(new THREE.Vector2(0, -1)),
    crackCenter: uniform(new THREE.Vector2(0.18, 0.08)),
    crackSeed: uniform(3.7),
    flash: uniform(new THREE.Vector3(0, 0, 0)),
    ca: uniform(1),
    vignette: uniform(0.32),
    grain: uniform(0.035),
    mb: uniform(0.45),
    dofFocus: uniform(10),
    dofRange: uniform(6),
    dofBokeh: uniform(0),
    lightLevel: uniform(1), // luz média aproximada (gelo/poeira)
    // reprojeção só de rotação da câmera (clip atual → clip anterior), para
    // pixels distantes/céu cuja velocidade de objeto não é confiável
    camReproj: uniform(new THREE.Matrix4()),
    farVel: uniform(20000), // além disso (m) usa só a velocidade da câmera
  };
}

export class Pipeline {
  constructor(ctx, U) {
    this.ctx = ctx;
    this.U = U;
    this.rp = new THREE.RenderPipeline(ctx.renderer);
    this.rp.outputColorTransform = false; // tone mapping feito no fim do grafo (antes do grão)
    this.dirtTex = makeLensDirt();
    this.flags = {};
    this.wantDOF = false;
    this.wantVisor = false;
    this.nodes = [];
  }

  /** (Re)monta o grafo conforme preset e flags. */
  build() {
    const { ctx, U } = this;
    const p = ctx.quality.p;
    const f = {
      taa: !!p.taa,
      mb: !!p.motionBlur,
      dof: !!p.dof || this.wantDOF,
      bloom: !!p.bloom,
      flare: !!p.lensflare && !!p.bloom,
      godrays: !!p.godrays,
      film: !!p.film,
      visor: this.wantVisor,
      mobile: ctx.quality.name === 'mobile',
    };
    this.flags = f;
    for (const n of this.nodes) n.dispose?.();
    this.nodes = [];
    this.scenePass?.dispose?.();

    const scenePass = pass(ctx.scene, ctx.camera);
    this.scenePass = scenePass;
    if (f.taa || f.mb) scenePass.setMRT(mrt({ output, velocity }));
    setVelocityMRT(f.taa || f.mb);
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    let vel = f.taa || f.mb ? scenePass.getTextureNode('velocity') : null;
    if (vel) {
      // Velocidade "saneada": céu e objetos muito distantes usam a reprojeção
      // de rotação da câmera (sprites/billboards de outros sistemas podem
      // gravar velocidades inválidas); o resto é limitado a um máximo.
      const rawVel = vel;
      const fix = Fn(() => {
        const st = uv();
        const dRaw = depth.sample(st).r;
        const vz = logarithmicDepthToViewZ(dRaw, U.near, U.far).negate();
        const ndc = st.mul(2).sub(1);
        const pp = U.camReproj.mul(vec4(ndc, 1, 1));
        const camV = ndc.sub(pp.xy.div(pp.w));
        const v = rawVel.sample(st).xy.toVar();
        const far = dRaw.greaterThanEqual(0.999999).or(vz.greaterThan(U.farVel));
        If(far, () => {
          v.assign(camV);
        });
        const l = length(v);
        v.mulAssign(min(float(1), float(0.25).div(max(l, 1e-6))));
        return vec4(v, 0, 1);
      });
      vel = rtt(fix(), null, null, { type: THREE.HalfFloatType });
    }

    let c = color;
    if (f.taa) {
      const t = traa(c, depth, vel, ctx.camera);
      this.nodes.push(t);
      c = t.getTextureNode();
    }
    if (f.mb) {
      const src = c;
      const blur = Fn(() => {
        const st = uv();
        const v = vel.sample(st).xy.mul(U.mb).toVar();
        const base = src.sample(st).toVar();
        const len = length(v.mul(vec2(U.aspect, 1)));
        const res = base.toVar();
        If(len.greaterThan(0.0015), () => {
          // amostras ao longo do vetor de velocidade com início com jitter (sem bandas)
          const n = 10;
          const j = interleavedGradientNoise(screenCoordinate).sub(0.5);
          const acc = vec4(0).toVar();
          const vv = v.mul(min(float(1), float(0.06).div(len))); // limita o rastro
          for (let i = 0; i < n; i++) {
            const k = float((i + 0.5) / n - 0.5).add(j.div(n));
            acc.addAssign(src.sample(st.add(vv.mul(k))));
          }
          res.assign(acc.div(n));
        });
        return res;
      });
      const mbNode = rtt(blur(), null, null, { type: THREE.HalfFloatType });
      c = mbNode;
    }
    if (f.dof) {
      const viewZ = logarithmicDepthToViewZ(depth.r, U.near, U.far);
      const d = dof(c, viewZ, U.dofFocus, U.dofRange, U.dofBokeh);
      this.nodes.push(d);
      // o DepthOfFieldNode expõe a saída como texture() comum (não passTexture):
      // embrulhamos para o nó entrar no grafo e rodar o updateBefore
      c = passTexture(d, d._compositeRT.texture);
    }
    const sceneTex = c;

    let bloomTex = null;
    if (f.bloom) {
      const b = bloom(sceneTex, 0.3, 0.45, 1.4);
      b.smoothWidth.value = 1.0; // limiar suave
      this.bloomNode = b;
      this.nodes.push(b);
      bloomTex = b.getTextureNode();
    }
    let flareTex = null;
    if (f.flare) flareTex = lensFlarePass(bloomTex, U, { ghosts: f.mobile ? 4 : 6, streakTaps: f.mobile ? 8 : 14 });
    let raysTex = null;
    if (f.godrays) raysTex = godRaysPass(sceneTex, depth, U, { samples: 48 });
    let blurTex = null;
    if (f.visor) {
      const gb = gaussianBlur(sceneTex, null, 4, { resolutionScale: 0.25 });
      this.nodes.push(gb);
      blurTex = gb.getTextureNode ? gb.getTextureNode() : gb;
    }
    const dirt = texture(this.dirtTex);

    const composite = Fn(() => {
      const st = uv();
      const asp = vec2(U.aspect, 1);
      const q = st.sub(0.5).mul(asp);
      const off = vec2(0).toVar();
      const t = U.time;

      // ── distorção de calor: fontes localizadas + global
      const hn = vec2(vnoise2(q.mul(26.0).add(vec2(0, t.mul(2.7)))), vnoise2(q.mul(26.0).add(vec2(5.3, t.mul(3.1))))).sub(0.5);
      const hk = float(0).toVar();
      for (let i = 0; i < MAX_HEAT; i++) {
        const s = U.heatSrc.element(i);
        const d = length(st.sub(s.xy).mul(asp));
        hk.addAssign(smoothstep(s.z, s.z.mul(0.2), d).mul(s.w));
      }
      hk.addAssign(U.heat.mul(st.y.oneMinus().mul(0.7).add(0.3)));
      off.addAssign(hn.mul(hk).mul(0.014));

      // ── visor
      const rainCov = float(0).toVar();
      const rainRing = float(0).toVar();
      const rainHl = float(0).toVar();
      const rainTrail = float(0).toVar();
      const frostMask = float(0).toVar();
      const frostCrystal = float(0).toVar();
      const crackLines = float(0).toVar();
      const dustV = vec2(0).toVar();
      if (f.visor) {
        If(U.visor.x.greaterThan(0.001), () => {
          const r = visorRain(q, t, U.visor.x, U.visorFlow);
          off.addAssign(r.off);
          rainCov.assign(r.cov);
          rainRing.assign(r.ring);
          rainHl.assign(r.hl);
          rainTrail.assign(r.trail);
        });
        If(U.visor.y.greaterThan(0.001), () => {
          const fr = visorFrost(q, st, U.aspect, U.visor.y);
          off.addAssign(fr.off);
          frostMask.assign(fr.mask);
          frostCrystal.assign(fr.crystal);
        });
        If(U.visor.z.greaterThan(0.001), () => {
          dustV.assign(visorDust(q, U.visor.z));
        });
        If(U.visor.w.greaterThan(0.001), () => {
          const cr = visorCrack(q, U.visor.w, U.crackCenter, U.crackSeed);
          off.addAssign(cr.xy);
          crackLines.assign(cr.z);
        });
      }
      const uvD = st.add(off.div(asp)).toVar();

      // ── aberração cromática radial (mais forte nas bordas)
      const dir = st.sub(0.5);
      const caOff = dir.mul(dot(dir, dir)).mul(U.ca).mul(0.012);
      const col = vec3(sceneTex.sample(uvD.add(caOff)).r, sceneTex.sample(uvD).g, sceneTex.sample(uvD.sub(caOff)).b).toVar();

      const dmask = dirt.sample(st).r;
      if (bloomTex) {
        const bl = bloomTex.sample(uvD).rgb;
        col.addAssign(bl);
        col.addAssign(bl.mul(dmask).mul(U.dirt).mul(0.6));
      }
      if (flareTex) {
        const fl = flareTex.sample(st).rgb;
        col.addAssign(fl.mul(dmask.mul(U.dirt).mul(1.2).add(0.3)));
      }
      if (raysTex) col.addAssign(raysTex.sample(st).rgb);

      if (f.visor) {
        // gotas: dentro da gota a imagem refratada é levemente borrada; borda
        // escura (reflexão interna) e brilho especular; rastro molhado
        const blurred = blurTex.sample(uvD).rgb;
        col.assign(mix(col, blurred, rainCov.mul(0.35).add(rainTrail.mul(0.25))));
        col.mulAssign(float(1).sub(rainRing.mul(0.55)));
        const sky = blurTex.sample(vec2(st.x, 0.95)).rgb;
        col.addAssign(sky.mul(0.6).add(vec3(U.lightLevel.mul(0.05))).mul(rainHl).mul(1.6));
        // gelo: névoa branca translúcida (luz espalhada da cena) + cristais
        const light = dot(blurred, vec3(0.33)).add(U.lightLevel.mul(0.03));
        const haze = mix(blurred.mul(0.75), vec3(0.78, 0.86, 0.95).mul(light.mul(1.2).add(0.015)), 0.55);
        col.assign(mix(col, haze, frostMask.mul(0.88)));
        col.addAssign(vec3(0.85, 0.92, 1.0).mul(frostCrystal).mul(light.mul(1.1).add(0.02)));
        // poeira: pontos que acendem contra a luz + manchas que espalham o bloom
        if (bloomTex) {
          const bl2 = bloomTex.sample(st).rgb;
          col.addAssign(bl2.mul(dustV.y).mul(1.5));
          col.addAssign(bl2.add(vec3(U.sunVis.mul(0.2))).mul(dustV.x).mul(1.0));
        }
        col.addAssign(vec3(0.02).mul(dustV.y).mul(U.lightLevel));
        // rachaduras: linhas com brilho especular + leve escurecimento
        const glint = dot(col, vec3(0.3)).mul(0.6).add(0.06).add(U.sunVis.mul(0.6));
        col.assign(mix(col, vec3(0.85, 0.9, 1.0).mul(glint), crackLines.mul(0.75)));
      }

      col.addAssign(U.flash);
      // vinheta óptica (cos⁴ simplificado)
      const r2 = dot(dir.mul(asp), dir.mul(asp));
      col.mulAssign(float(1).sub(r2.mul(U.vignette)).max(0.0));
      return vec4(max(col, vec3(0)), 1);
    });

    let mapped = renderOutput(composite(), ctx.renderer.toneMapping, ctx.renderer.outputColorSpace);
    // sem TAA: FXAA no sinal já mapeado (sRGB), antes do grão
    if (!f.taa) mapped = fxaa(mapped);
    const final = Fn(() => {
      const c0 = mapped.toVar();
      const st = uv();
      // grão de filme (após tone mapping, mais visível nos meios-tons)
      if (f.film) {
        const g = hash12(screenCoordinate.xy.add(fract(U.time.mul(13.17)).mul(1000.0))).sub(0.5);
        const l = dot(c0.rgb, vec3(0.33));
        c0.rgb.addAssign(g.mul(U.grain).mul(float(1).sub(abs(l.sub(0.45)).mul(1.4)).max(0.25)));
      }
      // dithering de 1/255 contra bandas no céu escuro
      const dth = interleavedGradientNoise(screenCoordinate).sub(0.5).div(255.0);
      c0.rgb.addAssign(dth);
      return c0;
    });
    this.rp.outputNode = final();
    // depuração: ?rdebug=velocity|depth|bloom|flare|rays
    const dbg = ctx.params.get('rdebug');
    if (dbg === 'velocity' && vel) this.rp.outputNode = vec4(abs(vel.sample(uv()).xy).mul(20), 0, 1);
    if (dbg === 'bloom' && bloomTex) this.rp.outputNode = renderOutput(bloomTex.sample(uv()), ctx.renderer.toneMapping, ctx.renderer.outputColorSpace);
    if (dbg === 'flare' && flareTex) this.rp.outputNode = renderOutput(vec4(flareTex.sample(uv()).rgb, 1), ctx.renderer.toneMapping, ctx.renderer.outputColorSpace);
    if (dbg === 'rays' && raysTex) this.rp.outputNode = renderOutput(vec4(raysTex.sample(uv()).rgb, 1), ctx.renderer.toneMapping, ctx.renderer.outputColorSpace);
    this.rp.needsUpdate = true;
  }

  render() {
    this.rp.render();
  }

  dispose() {
    for (const n of this.nodes) n.dispose?.();
    this.rp.dispose();
  }
}
