// Sistema "render" (order 5) — renderização e pós-processamento HDR,
// materiais PBR procedurais, mapa de ambiente, sombras em cascata e
// partículas na GPU.
//
// ═══ Serviço "render" ════════════════════════════════════════════════════
//   render.shake(intensity, duration)        tremor de câmera (trauma, decai)
//   render.flash(color, intensity)           clarão de tela aditivo (HDR)
//   render.setDOF({enabled, focus, aperture, range})
//                                            profundidade de campo (focus em m;
//                                            aperture 0..~4 = tamanho do bokeh)
//   render.setExposure(ev)                   exposição em EV (0 = neutro)
//   render.setHeatDistortion(amount)         distorção de calor global 0..1
//   render.setVisor({rain, frost, dust, crack, flow, crackAt, crackSeed})
//                                            efeitos no vidro (0..1 cada);
//                                            flow = Vector2 direção de escoamento
//                                            das gotas na tela (padrão (0,-1))
//   render.pbr(opts) → MeshPhysicalNodeMaterial
//        opts: {color, metalness, roughness, panel, grime, wear, emissive,
//               emissiveIntensity, triplanarScale, preset, stripe, stripeColor,
//               decals, rivets, mapping:'triplanar'|'uv', seed, clearcoat,
//               transmission, sheen, normalStrength, emissivePattern}
//        preset: 'hull'|'hullWhite'|'hullGold'|'hullRebel'|'pirate'|'plastic'|
//                'rubber'|'glass'|'visor'|'suit'|'carbon'|'gold'|'chrome'|
//                'concrete'|'rock'|'ceramic'|'emissivePanel'|'thruster'
//   render.envMap                            textura PMREM atual (ou null)
//   render.updateEnvironment(force?)         regenera o ambiente
//   render.setSky({zenith, horizon, ground, atmo, up, nebula, nebula2})
//                                            céu usado nos reflexos (planetas)
//   render.setEffect(name, on)               liga/desliga efeito em runtime
//                                            ('bloom','taa','motionBlur','dof',
//                                            'film','lensflare','godrays')
//   render.params                            ajustes finos {bloomStrength,
//                                            flare, godrays, ca, vignette, grain,
//                                            motionBlur, dirt}
//   render.pipeline                          Pipeline interno (debug)
//
// ═══ Serviço "fx" ════════════════════════════════════════════════════════
//   fx.explosion(pos, {scale, color, parent, debris, light})
//   fx.sparks(pos, normal, {count, color, speed, parent})
//   fx.muzzle(object3d, {color, scale, offset})
//   fx.smoke(pos, {count, color, scale, life, rise, parent, vel})
//   fx.debris(pos, vel, {count, color, size, parent})
//   fx.beam(from, to, {color, width, life})
//   fx.trail(object3d, {color, width, length, offset, kind:'engine'|'missile'|'smoke'})
//        → handle {dispose(), setIntensity(v)}
//   fx.heat(pos, radius, life)
//   fx.impact(pos, normal, surface)   surface: 'metal'|'rock'|'dirt'|'sand'|
//                                     'ice'|'water'|'flesh'|'shield'|'energy'
//   fx.fire(pos, {scale, life, parent})  fogo contínuo curto (destroços)
//   fx.shockwave(pos, {scale, color})
//   fx.stats()                       {alive, max}
//   Todos aceitam pos local da cena; com parent, pos é convertido para o
//   referencial do parent (ex.: frame girante do planeta).
//
// Eventos ouvidos: 'fx:shake' {intensity, duration}, 'fx:flash' {color,
// intensity}, 'quality:change', 'resize', 'world:originShift'.

import * as THREE from 'three/webgpu';
import { Pipeline, makeUniforms, MAX_HEAT } from './pipeline.js';
import { Shadows } from './shadows.js';
import { Environment } from './environment.js';
import { createPBR } from './materials/pbr.js';
import { FX } from './fx/fx.js';
import { registerScenarios } from './scenes/scenarios.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export default {
  name: 'render',
  label: 'renderização',
  order: 5,

  async init(ctx) {
    const U = makeUniforms();
    const pipeline = new Pipeline(ctx, U);
    const shadows = new Shadows(ctx);
    const env = new Environment(ctx);
    const fx = new FX(ctx, U);
    this.U = U;
    this.pipeline = pipeline;
    this.shadows = shadows;
    this.env = env;
    this.fx = fx;
    this.renderTime = 0;
    fx.onHeat = (pos, r, life, str, parent) => this.addHeat(pos, r, life, str, parent);

    // estado dos efeitos temporários
    const st = (this.st = {
      trauma: 0,
      traumaDecay: 1,
      shakeSeed: Math.random() * 100,
      flash: new THREE.Vector3(),
      heat: 0,
      heatSources: [],
      visor: { rain: 0, frost: 0, dust: 0, crack: 0 },
      visorTarget: { rain: 0, frost: 0, dust: 0, crack: 0 },
      dof: { enabled: false, focus: 10, aperture: 1, range: 6, k: 0 },
      overrides: {},
    });
    const params = (this.params = {
      bloomStrength: 0.22,
      flare: 1,
      godrays: 1,
      ca: 1,
      vignette: 0.32,
      grain: 0.035,
      motionBlur: 0.45,
      dirt: 1,
    });

    const applyOverrides = () => {
      const p = ctx.quality.p;
      for (const [k, v] of Object.entries(st.overrides)) p[k] = v;
    };
    const rebuild = () => {
      applyOverrides();
      pipeline.build();
      shadows.build();
      fx.setMax(ctx.quality.p.particlesMax);
    };
    rebuild();
    env.update(0, true);

    ctx.bus.on('quality:change', () => {
      st.overrides = {};
      rebuild();
    });
    ctx.bus.on('resize', () => shadows.updateFrustums());
    ctx.bus.on('fx:shake', (e) => api.shake(e?.intensity ?? 0.5, e?.duration ?? 0.5));
    ctx.bus.on('fx:flash', (e) => api.flash(e?.color ?? 0xffffff, e?.intensity ?? 1));

    const api = {
      get pipeline() {
        return pipeline;
      },
      params,
      shake(intensity = 0.5, duration = 0.5) {
        st.trauma = Math.min(1.5, st.trauma + intensity);
        st.traumaDecay = 1 / Math.max(0.05, duration);
      },
      flash(color = 0xffffff, intensity = 1) {
        const c = new THREE.Color(color);
        st.flash.x += c.r * intensity;
        st.flash.y += c.g * intensity;
        st.flash.z += c.b * intensity;
      },
      setDOF({ enabled = true, focus, aperture, range } = {}) {
        st.dof.enabled = !!enabled;
        if (focus !== undefined) st.dof.focus = focus;
        if (aperture !== undefined) st.dof.aperture = aperture;
        if (range !== undefined) st.dof.range = range;
        if (enabled && !pipeline.flags.dof) {
          pipeline.wantDOF = true;
          pipeline.build();
        }
      },
      setExposure(ev = 0) {
        ctx.renderer.toneMappingExposure = Math.pow(2, ev);
      },
      setHeatDistortion(amount = 0) {
        st.heat = Math.max(0, amount);
      },
      setVisor(v = {}) {
        for (const k of ['rain', 'frost', 'dust', 'crack']) if (v[k] !== undefined) st.visorTarget[k] = Math.max(0, Math.min(1, v[k]));
        if (v.flow) U.visorFlow.value.set(v.flow.x, v.flow.y).normalize();
        if (v.crackAt) U.crackCenter.value.set(v.crackAt.x, v.crackAt.y);
        if (v.crackSeed !== undefined) U.crackSeed.value = v.crackSeed;
        if (v.instant) Object.assign(st.visor, st.visorTarget);
        const any = Object.values(st.visorTarget).some((x) => x > 0);
        if (any && !pipeline.flags.visor) {
          pipeline.wantVisor = true;
          pipeline.build();
        }
      },
      pbr: (opts) => createPBR(opts, ctx),
      get envMap() {
        return env.texture;
      },
      updateEnvironment(force = true) {
        env.update(0, force);
        return env.texture;
      },
      setSky(o) {
        env.setSky(o);
      },
      setEffect(name, on) {
        st.overrides[name] = !!on;
        rebuild();
      },
    };
    this.api = api;
    ctx.provide('render', api);
    ctx.provide('fx', fx.api);

    // substitui a função de render do núcleo
    ctx.render = () => this.renderFrame(ctx);

    registerScenarios(ctx, this);
  },

  frame(dt, ctx) {
    const { U, st, params, pipeline } = this;
    this.renderTime += dt;
    U.time.value = this.renderTime;
    const cam = ctx.camera;
    const w = ctx.renderer.domElement.clientWidth || innerWidth;
    const h = ctx.renderer.domElement.clientHeight || innerHeight;
    U.aspect.value = w / Math.max(1, h);
    U.near.value = cam.near;
    U.far.value = cam.far;

    // flash decai (~0,2 s)
    st.flash.multiplyScalar(Math.exp(-dt * 9));
    U.flash.value.copy(st.flash);
    // trauma decai
    st.trauma = Math.max(0, st.trauma - dt * st.traumaDecay * 0.9);

    // visor: aproxima suavemente dos alvos
    const k = 1 - Math.exp(-dt * 1.5);
    for (const key of ['rain', 'frost', 'dust', 'crack']) {
      const tgt = st.visorTarget[key];
      // rachadura aparece instantânea; gelo cresce devagar
      const rate = key === 'crack' && tgt > st.visor[key] ? 1 : key === 'frost' ? k * 0.4 : k;
      st.visor[key] += (tgt - st.visor[key]) * rate;
    }
    U.visor.value.set(st.visor.rain, st.visor.frost, st.visor.dust, st.visor.crack);

    // DoF: entra/sai suave
    const d = st.dof;
    d.k += ((d.enabled ? 1 : 0) - d.k) * (1 - Math.exp(-dt * 4));
    U.dofFocus.value = d.focus;
    U.dofRange.value = d.range;
    U.dofBokeh.value = d.k * d.aperture * (pipeline.flags.dof ? 1 : 0);

    // parâmetros finos
    if (pipeline.bloomNode) pipeline.bloomNode.strength.value = params.bloomStrength;
    U.flare.value = params.flare;
    U.godrays.value = params.godrays;
    U.ca.value = params.ca;
    U.vignette.value = params.vignette;
    U.grain.value = params.grain;
    U.mb.value = params.motionBlur;
    U.dirt.value = params.dirt;
    U.heat.value = st.heat;

    // reprojeção de rotação da câmera (velocidade do céu)
    this.updateReprojection(ctx);
    // estrela na tela
    this.updateSun(ctx);
    // fontes de calor
    this.updateHeat(ctx, dt);
    // luz ambiente aproximada para gelo/poeira
    U.lightLevel.value = Math.min(4, ctx.sun.intensity * 0.25 + (ctx.ambient?.intensity ?? 0) * 2);

    this.env.update(dt);
    for (const f of this.scenarioUpdate || []) f(dt);
    this.fx.frame(dt);
  },

  updateReprojection(ctx) {
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    const rot = (this._rot ||= new THREE.Matrix4());
    rot.copy(cam.matrixWorldInverse).setPosition(0, 0, 0);
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, rot);
    const prev = this._prevVP || vp.clone();
    // clip atual → direção → clip anterior
    this.U.camReproj.value.multiplyMatrices(prev, vp.clone().invert());
    this._prevVP = vp;
  },

  updateSun(ctx) {
    const { U } = this;
    const cam = ctx.camera;
    const space = ctx.get('space');
    cam.updateMatrixWorld();
    const camPos = _v2.setFromMatrixPosition(cam.matrixWorld);
    let dir;
    if (space?.starLocal) {
      space.starLocal(_v);
      dir = _v.sub(camPos).normalize();
    } else {
      dir = _v.subVectors(ctx.sun.position, ctx.sun.target.position).normalize();
    }
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const facing = dir.dot(fwd);
    const p = dir.clone().multiplyScalar(1000).add(camPos).project(cam);
    U.sunUV.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    // visível: na frente e dentro (ou um pouco fora) da tela
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y));
    const vis = facing > 0 ? THREE.MathUtils.smoothstep(1.35 - edge, 0, 0.35) : 0;
    const sky = ctx.get('space')?.skyBrightness;
    U.sunVis.value = vis * (sky === undefined ? 1 : 0.4 + 0.6 * sky);
  },

  updateHeat(ctx, dt) {
    const { U, st } = this;
    const cam = ctx.camera;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    const arr = U.heatSrc.array;
    const list = st.heatSources;
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].age += dt;
      if (list[i].age > list[i].life) list.splice(i, 1);
    }
    // as mais fortes primeiro
    let n = 0;
    for (const s of list) {
      if (n >= MAX_HEAT) break;
      const wp = s.obj ? s.obj.localToWorld(_v.copy(s.local)) : _v.copy(s.pos);
      const camSpace = _v2.copy(wp).applyMatrix4(cam.matrixWorldInverse);
      if (camSpace.z > -0.1) continue;
      const pr = wp.clone().project(cam);
      const rad = s.radius / (-camSpace.z * 2 * tanH);
      const t = s.age / s.life;
      const fade = Math.min(1, s.age * 6) * (1 - t) * (1 - t);
      arr[n].set(pr.x * 0.5 + 0.5, pr.y * 0.5 + 0.5, Math.min(rad, 1.5), s.strength * fade);
      n++;
    }
    for (let i = n; i < MAX_HEAT; i++) arr[i].set(0, 0, 0, 0);
  },

  /** Registra fonte de calor (usado por fx.heat). */
  addHeat(pos, radius = 5, life = 2, strength = 1, parent = null) {
    const s = { radius, life, age: 0, strength };
    // guarda no referencial do pai (ou do anchor do fx, que segue a origem flutuante)
    s.obj = parent || this.fx.anchor;
    s.obj.updateWorldMatrix(true, false);
    s.local = s.obj.worldToLocal(pos.clone());
    this.st.heatSources.push(s);
    if (this.st.heatSources.length > 32) this.st.heatSources.shift();
  },

  renderFrame(ctx) {
    const cam = ctx.camera;
    const st = this.st;
    if (this.sunOverride) {
      // só cenários: cor/intensidade do sol fixadas depois de todos os frame()
      ctx.sun.color.copy(this.sunOverride.color);
      ctx.sun.intensity = this.sunOverride.intensity;
    }
    // tremor: rotação por ruído suave, ∝ trauma²
    const s = st.trauma * st.trauma;
    let shaken = false;
    if (s > 1e-4) {
      const t = this.renderTime * 22 + st.shakeSeed;
      const n = (a) => Math.sin(t * a) * 0.6 + Math.sin(t * a * 2.31 + 1.7) * 0.4;
      _q.copy(cam.quaternion);
      _e.set(n(1.1) * 0.035 * s, n(0.93) * 0.035 * s, n(0.71) * 0.05 * s);
      cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(_e));
      cam.updateMatrixWorld();
      shaken = true;
    }
    this.pipeline.render();
    if (shaken) {
      cam.quaternion.copy(_q);
      cam.updateMatrixWorld();
    }
  },
};
