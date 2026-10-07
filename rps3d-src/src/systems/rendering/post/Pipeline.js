// Pipeline de pós-processamento HDR em TSL (RenderPipeline do three).
//
//   cena (HDR, profundidade logarítmica)
//    └─ TAA próprio (WebGPU, ultra/alto)                    [post/TemporalAA.js]
//        └─ estágio 1: distorção de calor + ondas de choque, aberração
//           cromática, motion blur de câmera, streak quântico   → textura T1
//            └─ DoF (cinemáticas/mira, sob demanda)
//                └─ HDR: + bloom físico + sujeira de lente + god rays + flare
//                   do sol + raias anamórficas + fantasmas de luzes fortes
//                   + ganchos 'hdr' → exposição → grade (sat/contraste/tinta)
//                   → flash
//                    └─ AgX + sRGB → SMAA/FXAA (sem TAA) → ganchos 'ldr'
//                       → vinheta, dano, grão de filme → tela
//
// Cada efeito liga/desliga pelo preset (config.js). Grafos são cacheados por
// assinatura: alternar DoF (cinemática) não recompila nada na segunda vez.
import * as THREE from 'three/webgpu';
import { RenderPipeline } from 'three/webgpu';
import {
  Fn, pass, uv, vec2, vec3, vec4, float, length, dot, mix, smoothstep, clamp, exp, pow, max, min, abs,
  renderOutput, convertToTexture, uniformArray, Loop, select, uniform, sin, If,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { PostUniforms, viewDistFromDepth, reprojectUv } from './common.js';
import { TemporalAANode, HALTON } from './TemporalAA.js';
import { sunFlare, godRays, anamorphic, lensDirt } from './Flare.js';
import { hash12, vnoise3 } from '../tslib.js';
import { pipelineSignature } from '../config.js';

export const MAX_DISTORT = 8;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector2();

export class Pipeline {
  constructor(ctx, fx) {
    this.ctx = ctx;
    this.fx = fx;
    this.U = new PostUniforms();
    this.hooks = [];
    this.hookVersion = 0;
    this.cache = new Map();
    this.active = null;
    this.dofActive = false;
    this.dofU = { focus: uniform(10), range: uniform(6), bokeh: uniform(1.6) };
    this.bloomU = { strength: uniform(fx.bloomStrength), radius: uniform(fx.bloomRadius), threshold: uniform(fx.bloomThreshold) };
    this.flareU = { sun: uniform(1), god: uniform(0.32), anam: uniform(0.05), ghosts: uniform(0.35), dirt: uniform(0.7) };
    this.distA = uniformArray(Array.from({ length: MAX_DISTORT }, () => new THREE.Vector4(0, 0, 0, 0)), 'vec4');
    this.distB = uniformArray(Array.from({ length: MAX_DISTORT }, () => new THREE.Vector4(0, 0, 0, 0)), 'vec4');
    this.prevInv = new THREE.Matrix4();
    this.prevOrigin = new THREE.Vector3();
    this.prevTan = new THREE.Vector2(1, 1);
    this.firstFrame = true;
    this.jitterIdx = 0;
    this.failed = false;
  }

  setFx(fx) { this.fx = fx; this.bloomU.strength.value = fx.bloomStrength; this.bloomU.radius.value = fx.bloomRadius; this.bloomU.threshold.value = fx.bloomThreshold; }

  signature() { return pipelineSignature(this.fx, `dof:${this.dofActive && this.fx.dofAllowed}|h:${this.hookVersion}`); }

  addHook(name, fn, { stage = 'hdr', order = 0 } = {}) {
    this.hooks = this.hooks.filter((h) => h.name !== name);
    this.hooks.push({ name, fn, stage, order });
    this.hooks.sort((a, b) => a.order - b.order);
    this.hookVersion++;
    this.invalidateCache();
  }
  removeHook(name) {
    const n = this.hooks.length;
    this.hooks = this.hooks.filter((h) => h.name !== name);
    if (n !== this.hooks.length) { this.hookVersion++; this.invalidateCache(); }
  }
  invalidateCache() {
    for (const g of this.cache.values()) { try { g.pipeline.dispose(); } catch {} }
    this.cache.clear();
    this.active = null;
  }

  graph() {
    const sig = this.signature();
    let g = this.cache.get(sig);
    if (!g) { g = this.build(); this.cache.set(sig, g); }
    this.active = g;
    return g;
  }

  // ─────────────────────────────────────────────────────────────────────
  build() {
    const { ctx, fx, U } = this;
    const scenePass = pass(ctx.scene, ctx.camera);
    const colorTex = scenePass.getTextureNode('output');
    const depthTex = scenePass.getTextureNode('depth');
    const g = { scenePass, taa: null };

    // ── TAA ──
    let src = colorTex;
    if (fx.aa === 'taa') {
      g.taa = new TemporalAANode(colorTex, depthTex, U);
      src = g.taa.getTextureNode();
    }

    // ── estágio 1: distorção + CA + motion blur ──
    const distA = this.distA, distB = this.distB;
    const mbN = fx.motionBlur ? fx.mbSamples : 0;
    const stage1 = Fn(() => {
      const p = uv().toVar();
      const asp = vec2(U.aspect, 1);
      // distorção: ondas de choque + tremor de calor (campo de ruído único)
      const off = vec2(0).toVar();
      const heatW = U.heatHaze.mul(smoothstep(0.2, 1.0, p.y).mul(0.6).add(0.4)).toVar();
      if (fx.heatDistortion) {
        for (let i = 0; i < MAX_DISTORT; i++) {
          const a = distA.element(i), b = distB.element(i);
          const q = p.sub(a.xy).mul(asp);
          const d = length(q).max(1e-4);
          const R = a.z.max(1e-4);
          const ring = d.sub(b.x.mul(R)).div(b.y.mul(R).max(1e-4));
          const shock = exp(ring.mul(ring).negate()).mul(a.w).mul(float(1).sub(b.x));
          off.addAssign(q.div(d).mul(shock).mul(0.018));
          heatW.addAssign(smoothstep(R.mul(0.4), R.mul(0.1), d).mul(a.w).mul(b.z));
        }
      }
      const nA = vnoise3(vec3(p.mul(asp).mul(38), U.time.mul(3.1)));
      const nB = vnoise3(vec3(p.mul(asp).mul(38).add(17.3), U.time.mul(3.4)));
      off.addAssign(vec2(nA.sub(0.5), nB.sub(0.5)).mul(heatW.min(2)).mul(0.012));
      const pd = p.add(off).toVar();
      // aberração cromática radial (cresce para as bordas)
      const dir = pd.sub(0.5);
      const ca = dir.mul(dot(dir, dir).mul(4)).mul(U.chromatic.add(U.flash.mul(0.004)));
      const col = vec3(
        src.sample(pd.add(ca)).r,
        src.sample(pd).g,
        src.sample(pd.sub(ca)).b,
      ).toVar();
      // motion blur de câmera + streak radial da viagem quântica
      if (mbN > 1) {
        const dist = viewDistFromDepth(U, depthTex.sample(p).r);
        const prev = reprojectUv(U, p, dist, float(0.6));
        const vel = p.sub(prev).mul(U.mbScale).toVar();
        const vl = length(vel);
        vel.mulAssign(min(vl, 0.045).div(vl.max(1e-5)));
        vel.addAssign(p.sub(0.5).mul(U.quantum.mul(0.09)));
        const vpx = length(vel.div(U.invRes));
        If_(vpx, () => {
          const acc = col.toVar();
          const j = hash12(p.mul(U.resolution).add(U.frame.mod(16).mul(3.7))).sub(0.5);
          for (let k = 1; k < mbN; k++) {
            const t = (k / (mbN - 1) - 0.5);
            acc.addAssign(src.sample(pd.add(vel.mul(float(t).add(j.div(mbN))))).rgb);
          }
          col.assign(acc.div(mbN));
        });
      } else {
        // sem motion blur: ainda faz o streak quântico barato (4 amostras)
        const vel = p.sub(0.5).mul(U.quantum.mul(0.07));
        const acc = col.toVar();
        for (let k = 1; k < 5; k++) acc.addAssign(src.sample(pd.sub(vel.mul(k / 4))).rgb);
        col.assign(mix(col, acc.div(5), U.quantum.min(1)));
      }
      return vec4(col, 1);
    })();
    let T1 = convertToTexture(stage1);

    // ── DoF ──
    if (this.dofActive && fx.dofAllowed) {
      const viewZ = viewDistFromDepth(U, depthTex.r).negate();
      g.dof = dof(T1, viewZ, this.dofU.focus, this.dofU.range, this.dofU.bokeh);
      T1 = convertToTexture(g.dof);
    }

    // ── HDR ──
    const hdrNode = Fn(() => {
      const p = uv();
      const base = T1.sample(p).rgb.toVar();
      const hdr = base.toVar();
      const dirt = fx.lensFlare ? lensDirt(U) : float(0);
      if (fx.bloom) {
        g.bloom = bloom(T1, this.bloomU.strength, this.bloomU.radius, this.bloomU.threshold);
        g.bloom.smoothWidth.value = 1.2;
        const b = g.bloom.rgb;
        hdr.addAssign(b.add(b.mul(dirt).mul(this.flareU.dirt)));
        if (fx.ghosts) {
          g.ghostNode = lensflare(g.bloom.getTextureNode(), { threshold: float(1.5), ghostSamples: float(fx.flareGhosts), ghostSpacing: float(0.27), ghostAttenuationFactor: float(28), ghostTint: vec3(0.7, 0.8, 1.0), downSampleRatio: 4 });
          hdr.addAssign(g.ghostNode.rgb.mul(this.flareU.ghosts).mul(dirt.mul(1.5).add(0.6)));
        }
      }
      if (fx.godRays) {
        g.god = godRays(U, src, depthTex, { samples: fx.godRaySamples, scale: 0.5 });
        const edge = max(abs(U.sunUv.x.sub(0.5)), abs(U.sunUv.y.sub(0.5)));
        const fade = float(1).sub(smoothstep(0.55, 1.1, edge)).mul(U.sunFront).mul(U.sunVis);
        hdr.addAssign(g.god.sample(p).rgb.mul(U.sunColor).mul(this.flareU.god).mul(fade));
      }
      if (fx.lensFlare) {
        const fl = sunFlare(U, depthTex, { ghosts: fx.flareGhosts, strength: this.flareU.sun });
        hdr.addAssign(fl.mul(dirt.mul(1.6).add(0.75)));
        if (fx.preset !== 'mobile') {
          g.anam = anamorphic(U, T1, { taps: fx.preset === 'ultra' ? 24 : 16 });
          hdr.addAssign(g.anam.sample(p).rgb.mul(vec3(0.45, 0.62, 1.0)).mul(this.flareU.anam));
        }
      }
      let h = hdr;
      for (const hk of this.hooks) if (hk.stage === 'hdr') { try { h = hk.fn({ color: h, uv: p, depth: viewDistFromDepth(U, depthTex.sample(p).r), U, scene: colorTex }) || h; } catch (e) { console.warn('[rendering] gancho', hk.name, e); } }
      // exposição + grade
      const c = vec3(h).mul(U.exposure).toVar();
      const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c.assign(mix(vec3(l), c, U.saturation));
      c.assign(pow(c.div(0.18).max(0), vec3(U.contrast)).mul(0.18));
      c.assign(c.mul(U.tint).add(U.lift));
      c.addAssign(U.flashColor.mul(U.flash));
      return vec4(c, 1);
    })();

    let ldr = renderOutput(hdrNode, THREE.AgXToneMapping, THREE.SRGBColorSpace);
    if (fx.aa === 'smaa') ldr = smaa(ldr);
    else if (fx.aa === 'fxaa') ldr = fxaa(ldr);
    const ldrTex = ldr;

    const finalNode = Fn(() => {
      const p = uv();
      let c = vec3(ldrTex.rgb);
      for (const hk of this.hooks) if (hk.stage === 'ldr') { try { c = hk.fn({ color: c, uv: p, U }) || c; } catch (e) { console.warn('[rendering] gancho', hk.name, e); } }
      const col = vec3(c).toVar();
      // vinheta ótica
      const e = p.sub(0.5).mul(vec2(U.aspect.mul(0.82), 1));
      const r2 = dot(e, e);
      col.mulAssign(float(1).sub(U.vignette.mul(smoothstep(0.08, 0.62, r2))));
      // dano: bordas vermelhas pulsando
      const dmg = U.damage.mul(smoothstep(0.12, 0.55, r2)).mul(sin(U.time.mul(9)).mul(0.15).add(0.85));
      col.assign(mix(col, vec3(0.55, 0.02, 0.0), dmg.min(0.85)));
      // grão de filme (mais nos médios, temporalmente variável)
      if (fx.grain) {
        const n = hash12(p.mul(U.resolution).add(vec2(U.frame.mod(97).mul(13.1), U.frame.mod(89).mul(7.7)))).sub(0.5);
        const lum = dot(col, vec3(0.299, 0.587, 0.114));
        col.addAssign(n.mul(U.grain).mul(float(1).sub(abs(lum.sub(0.45)).mul(1.3)).max(0.25)));
      }
      return vec4(col.max(0), 1);
    })();

    const pipeline = new RenderPipeline(ctx.renderer, finalNode);
    pipeline.outputColorTransform = false;
    g.pipeline = pipeline;
    return g;
  }

  // ─────────────────────────────────────────────────────────────────────
  /** Atualiza uniforms de câmera/sol. Chamar depois de world.sync e do shake. */
  updateUniforms(ctx, sun, dt) {
    const U = this.U, cam = ctx.camera;
    cam.updateMatrixWorld();
    ctx.renderer.getDrawingBufferSize(_s);
    U.resolution.value.set(_s.x, _s.y);
    U.invRes.value.set(1 / Math.max(1, _s.x), 1 / Math.max(1, _s.y));
    U.aspect.value = cam.aspect;
    U.near.value = cam.near; U.far.value = cam.far;
    U.logFN.value = Math.log2(cam.far / cam.near);
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5) / (cam.zoom || 1);
    U.tanHalf.value.set(ty * cam.aspect, ty);
    U.camRot.value.copy(cam.matrixWorld);
    const origin = ctx.world.origin;
    _v.copy(origin).sub(this.prevOrigin);
    const cut = this.firstFrame || _v.length() > 2e5 || ctx._renderCut;
    if (cut) {
      U.prevViewRot.value.copy(cam.matrixWorldInverse);
      U.originDelta.value.set(0, 0, 0);
      U.prevTanHalf.value.copy(U.tanHalf.value);
      this.active?.taa?.invalidate();
      ctx._renderCut = false;
    } else {
      U.prevViewRot.value.copy(this.prevInv);
      U.originDelta.value.copy(_v);
      U.prevTanHalf.value.copy(this.prevTan);
    }
    this.prevInv.copy(cam.matrixWorldInverse);
    this.prevOrigin.copy(origin);
    this.prevTan.copy(U.tanHalf.value);
    this.firstFrame = false;
    // motion blur independente de FPS: obturador de 180° a 60 Hz
    U.mbScale.value = Math.min(2, (1 / 60) / Math.max(1e-3, dt || 1 / 60)) * 0.5;
    U.dt.value = dt;
    U.time.value = ctx.time.now;
    U.frame.value = ctx.time.frame;

    // sol na tela
    _v.copy(sun.direction).transformDirection(cam.matrixWorldInverse);
    if (_v.z < -1e-4) {
      const z = -_v.z;
      const nx = _v.x / (z * U.tanHalf.value.x), ny = _v.y / (z * U.tanHalf.value.y);
      U.sunUv.value.set(nx * 0.5 + 0.5, 0.5 - ny * 0.5);
      U.sunFront.value = Math.min(1, z * 6);
    } else { U.sunUv.value.set(-4, -4); U.sunFront.value = 0; }
    U.sunVis.value = sun.visibility;
    U.sunColor.value.copy(sun.color);
    U.sunRadiusUv.value = Math.tan(sun.angularRadius) / U.tanHalf.value.y * 0.5;
    const star = ctx.universe.system?.star;
    U.sunDist.value = star ? Math.max(1e5, star.pos.distanceTo(ctx.player.camWorld)) : 1e7;
    U.sunPower.value = sun.flarePower ?? 1;
  }

  /** Projeta fontes de distorção (mundo) para a tela. */
  updateDistortion(ctx, sources) {
    const U = this.U, cam = ctx.camera;
    const A = this.distA.array, B = this.distB.array;
    let n = 0;
    for (const s of sources) {
      if (n >= MAX_DISTORT) break;
      ctx.world.toLocal(s.pos, _v).applyMatrix4(cam.matrixWorldInverse);
      if (_v.z > -0.5) continue;
      const z = -_v.z;
      const nx = _v.x / (z * U.tanHalf.value.x), ny = _v.y / (z * U.tanHalf.value.y);
      const r = s.radius / (z * U.tanHalf.value.y) * 0.5;
      if (Math.abs(nx) > 1 + r * 4 || Math.abs(ny) > 1 + r * 4 || r < 0.002) continue;
      A[n].set(nx * 0.5 + 0.5, 0.5 - ny * 0.5, Math.min(r, 1.5), s.strength);
      B[n].set(s.ring, s.ringWidth ?? 0.12, s.shimmer ?? 1, 0);
      n++;
    }
    for (let i = n; i < MAX_DISTORT; i++) { A[i].set(0, 0, 0, 0); B[i].set(0, 0.1, 0, 0); }
  }

  render(ctx) {
    const g = this.active || this.graph();
    const cam = ctx.camera;
    let jittered = false;
    if (g.taa) {
      ctx.renderer.getDrawingBufferSize(_s);
      const [jx, jy] = HALTON[this.jitterIdx++ % HALTON.length];
      cam.setViewOffset(_s.x, _s.y, jx, jy, _s.x, _s.y);
      jittered = true;
    }
    try { g.pipeline.render(); }
    finally { if (jittered) cam.clearViewOffset(); }
  }
}

// If em TSL só quando há velocidade relevante (economiza amostras paradas)
function If_(vpx, body) { If(vpx.greaterThan(0.6), body); }
