/**
 * PASSADAS DAS NUVENS no pipeline (estágio 'afterWorld').
 *
 *   order 11 sombra   tela cheia: fator de sombra das nuvens + distância da
 *                     cena (alvo F) e multiplicação no HDR — DEPOIS da
 *                     perspectiva aérea (ordem 10): sob um céu fechado o ar
 *                     iluminado pelo sol também fica à sombra
 *   order 12 nuvens   raymarch em resolução reduzida (MRT: luz+T, distâncias)
 *                     → reprojeção temporal (ping-pong) → upscaling bilateral
 *                     + neblina do clima, misturado no HDR: dst·T + L
 *
 * Nenhuma passada lê o depth do alvo enquanto ele está preso ao framebuffer:
 * F guarda a distância de cada pixel para a composição.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { VERT, RAY_GLSL, DENSITY_GLSL, MARCH_FRAG, RESOLVE_FRAG, SHADOW_FRAG, MUL_FRAG, COMPOSITE_FRAG } from './shaders.js';

function mrt(w, h, filter = THREE.LinearFilter) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    count: 2,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: filter,
    magFilter: filter,
    generateMipmaps: false,
  });
}
function single(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
}

export class CloudPasses {
  constructor(ctx, { shape, detail, weather, atmoGlsl, atmoUniforms }) {
    this.ctx = ctx;
    const depthMode = ctx.depthMode === 'reversed' ? 0 : ctx.depthMode === 'log' ? 1 : 2;
    // uniformes compartilhadas (mesmos objetos em todos os materiais)
    const U = (this.U = {
      uC00: { value: new THREE.Vector3() },
      uC10: { value: new THREE.Vector3() },
      uC01: { value: new THREE.Vector3() },
      uC11: { value: new THREE.Vector3() },
      uDepthMode: { value: depthMode },
      uNear: { value: ctx.camera.near },
      uFar: { value: ctx.camera.far },
      uShape: { value: shape },
      uDetail: { value: detail },
      uWeather: { value: weather },
      uWeatherRot: { value: new THREE.Matrix3() },
      uRin: { value: 1 },
      uRout: { value: 2 },
      uShapeScale: { value: 1 / 12000 },
      uDetailScale: { value: 1 / 800 },
      uShapeOff: { value: new THREE.Vector3() },
      uDetailOff: { value: new THREE.Vector3() },
      uShear: { value: new THREE.Vector3() },
      uCoverage: { value: 0.45 },
      uTypeBias: { value: 0 },
      uStorm: { value: 0 },
      uDetailAmt: { value: 0.38 },
      uDepth: { value: null },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSigma: { value: 0.04 },
    });
    this.hasAtmo = !!atmoGlsl;
    const marchU = (this.marchU = {
      ...(atmoUniforms || {}),
      ...U,
      uRground: { value: 1 },
      uSunE: { value: new THREE.Vector3(3, 3, 3) },
      uAmbTop: { value: new THREE.Vector3(0.3, 0.4, 0.6) },
      uAmbBottom: { value: new THREE.Vector3(0.15, 0.18, 0.25) },
      uGroundBounce: { value: new THREE.Vector3() },
      uMaxDist: { value: 160000 },
      uSteps: { value: 48 },
      uLightSteps: { value: 6 },
      uLightStep: { value: 45 },
      uFrame: { value: 0 },
      uPowder: { value: 0.6 },
      uMsA: { value: 0.3 },
      uMsB: { value: 0.55 },
      uMsC: { value: 0.5 },
      uFlashPos: { value: new THREE.Vector3(0, 0, 0) },
      uFlashE: { value: new THREE.Vector3() },
      uCirrusR: { value: 3 },
      uCirrus: { value: 0.6 },
      uCirrusScale: { value: 1 / 9000 },
      uHazeColor: { value: new THREE.Vector3(0.5, 0.6, 0.8) },
      uHazeDist: { value: 60000 },
      uLowSize: { value: new THREE.Vector2(1, 1) },
      uRainShaft: { value: 0 },
    });
    const frag = MARCH_FRAG.replace('ATMO_GLSL', atmoGlsl || '').replace('RAY_GLSL_HERE', RAY_GLSL).replace('DENSITY_GLSL_HERE', DENSITY_GLSL);
    const mat = (fragmentShader, uniforms, extra = {}) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false, ...extra });
    this.mMarch = mat(frag, marchU, { glslVersion: THREE.GLSL3, defines: this.hasAtmo ? { HAS_ATMO: 1 } : {} });
    this.resolveU = {
      uC00: U.uC00,
      uC10: U.uC10,
      uC01: U.uC01,
      uC11: U.uC11,
      uDepthMode: U.uDepthMode,
      uNear: U.uNear,
      uFar: U.uFar,
      uCurL: { value: null },
      uCurD: { value: null },
      uHistL: { value: null },
      uHistD: { value: null },
      uPrevVP: { value: new THREE.Matrix4() },
      uCamDelta: { value: new THREE.Vector3() },
      uBlend: { value: 0.12 },
      uHistValid: { value: 0 },
      uTexel: { value: new THREE.Vector2() },
    };
    this.mResolve = mat(RESOLVE_FRAG.replace('RAY_GLSL_HERE', RAY_GLSL), this.resolveU, { glslVersion: THREE.GLSL3 });
    this.shadowU = {
      ...U,
      uShadowK: { value: 0.35 },
      uShadowStrength: { value: 0.8 },
    };
    this.mShadow = mat(SHADOW_FRAG.replace('RAY_GLSL_HERE', RAY_GLSL).replace('DENSITY_GLSL_HERE', DENSITY_GLSL), this.shadowU, { glslVersion: THREE.GLSL3 });
    this.mMul = mat(MUL_FRAG, { uF: { value: null } }, {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.compU = {
      uL: { value: null },
      uD: { value: null },
      uF: { value: null },
      uLowSize: marchU.uLowSize,
      uC00: U.uC00,
      uC10: U.uC10,
      uC01: U.uC01,
      uC11: U.uC11,
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uFogSigma: { value: 0 },
      uFogH: { value: 900 },
      uFogColor: { value: new THREE.Vector3() },
      uFogMax: { value: 60000 },
      uCloudsOn: { value: 1 },
    };
    this.mComp = mat(COMPOSITE_FRAG, this.compU, {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.SrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new FullScreenQuad(this.mMarch);
    this.F = single(1, 1);
    this.cur = mrt(1, 1, THREE.NearestFilter);
    this.hist = [mrt(1, 1), mrt(1, 1)];
    this.hi = 0;
    this.histCount = 0;
    this.scale = 0.5;
    this.frame = 0;
    this.prevVP = new THREE.Matrix4();
    this.prevCam = null;
    this.enabled = true;
    this.cloudsOn = true;
    this.shadowsOn = true;
    this.fogOn = false;
  }

  /** Tamanhos dos alvos conforme o HDR e a escala de resolução. */
  _size(w, h) {
    if (this.F.width !== w || this.F.height !== h) this.F.setSize(w, h);
    const lw = Math.max(1, Math.round(w * this.scale));
    const lh = Math.max(1, Math.round(h * this.scale));
    if (this.cur.width !== lw || this.cur.height !== lh) {
      this.cur.setSize(lw, lh);
      for (const t of this.hist) t.setSize(lw, lh);
      this.histCount = 0;
    }
    this.marchU.uLowSize.value.set(lw, lh);
    this.resolveU.uTexel.value.set(1 / lw, 1 / lh);
  }

  _draw(material, target) {
    const r = this.ctx.renderer;
    r.setRenderTarget(target);
    this.quad.material = material;
    this.quad.render(r);
  }

  /** order 11: fator de sombra + distância (sempre roda: a composição precisa de F). */
  renderShadow(target) {
    if (!this.enabled || !target?.depthTexture) return;
    const r = this.ctx.renderer;
    this._size(target.width, target.height);
    const prevT = r.getRenderTarget();
    const prevClear = r.autoClear;
    r.autoClear = false;
    this.U.uDepth.value = target.depthTexture;
    this.shadowU.uShadowStrength.value = this.shadowsOn && this.cloudsOn ? this._shadowStrength ?? 0.8 : 0;
    this._draw(this.mShadow, this.F);
    if (this.shadowsOn && this.cloudsOn) {
      this.mMul.uniforms.uF.value = this.F.texture;
      this._draw(this.mMul, target);
    }
    r.setRenderTarget(prevT);
    r.autoClear = prevClear;
  }

  /** order 12: nuvens + neblina do clima. */
  renderClouds(target, { camera, camWorld, static: isStatic }) {
    if (!this.enabled || !target?.depthTexture) return;
    if (!this.cloudsOn && !this.fogOn) return;
    const r = this.ctx.renderer;
    const prevT = r.getRenderTarget();
    const prevClear = r.autoClear;
    r.autoClear = false;
    this.frame++;
    this.marchU.uFrame.value = this.frame % 64;
    this.U.uDepth.value = target.depthTexture;

    let outL = null;
    let outD = null;
    if (this.cloudsOn) {
      this._draw(this.mMarch, this.cur);
      // reprojeção temporal
      const src = this.hist[this.hi];
      const dst = this.hist[1 - this.hi];
      const ru = this.resolveU;
      ru.uCurL.value = this.cur.textures[0];
      ru.uCurD.value = this.cur.textures[1];
      ru.uHistL.value = src.textures[0];
      ru.uHistD.value = src.textures[1];
      ru.uPrevVP.value.copy(this.prevVP);
      if (this.prevCam) ru.uCamDelta.value.set(camWorld.x - this.prevCam.x, camWorld.y - this.prevCam.y, camWorld.z - this.prevCam.z);
      else ru.uCamDelta.value.set(0, 0, 0);
      ru.uHistValid.value = this.histCount > 0 ? 1 : 0;
      // câmera parada (modo shot): média exata das amostras; em movimento: 12%
      ru.uBlend.value = isStatic ? Math.max(1 / (this.histCount + 1), 0.04) : 0.12;
      this._draw(this.mResolve, dst);
      this.hi = 1 - this.hi;
      this.histCount++;
      outL = dst.textures[0];
      outD = dst.textures[1];
    } else {
      this.histCount = 0;
      outL = this.cur.textures[0];
      outD = this.cur.textures[1];
    }
    // composição no HDR
    const cu = this.compU;
    cu.uL.value = outL;
    cu.uD.value = outD;
    cu.uF.value = this.F.texture;
    cu.uCloudsOn.value = this.cloudsOn ? 1 : 0;
    this._draw(this.mComp, target);

    // matrizes deste frame para o próximo
    this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.prevCam = (this.prevCam || new THREE.Vector3()).set(camWorld.x, camWorld.y, camWorld.z);
    r.setRenderTarget(prevT);
    r.autoClear = prevClear;
  }

  /** Raios dos cantos do frustum (profundidade de visão 1), no referencial de render. */
  setCorners(camera) {
    const inv = camera.projectionMatrixInverse;
    const rot = camera.matrixWorld;
    const v = (this._v ||= new THREE.Vector3());
    const set = (out, x, y) => {
      v.set(x, y, 0.5).applyMatrix4(inv);
      v.multiplyScalar(-1 / v.z);
      const len = v.length();
      out.copy(v).transformDirection(rot).multiplyScalar(len);
    };
    set(this.U.uC00.value, -1, -1);
    set(this.U.uC10.value, 1, -1);
    set(this.U.uC01.value, -1, 1);
    set(this.U.uC11.value, 1, 1);
  }

  dispose() {
    for (const m of [this.mMarch, this.mResolve, this.mShadow, this.mMul, this.mComp]) m.dispose();
    this.quad.dispose();
    this.F.dispose();
    this.cur.dispose();
    for (const t of this.hist) t.dispose();
  }
}
