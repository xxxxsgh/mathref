// Sistema `rendering` — dono do pipeline de imagem do RPS3D.
//
//  • substitui ctx.render por um pipeline TSL HDR (post/Pipeline.js)
//  • luz do sol compartilhada + sombras em cascata (Sun.js)
//  • IBL procedural (Environment.js)
//  • partículas na GPU, bolas de fogo volumétricas, destroços, ondas de
//    choque e distorção de calor (fx/*)
//  • tremor de câmera e flash por eventos
//
// Serviço: ctx.services.rendering (ver `api` abaixo). Escuta: 'explosion',
// 'shake', 'flash', 'ship:hit', 'reentry', 'quantum:*', 'jump:*',
// 'system:change', 'mode:change', 'player:damage', 'quality:change'.
import * as THREE from 'three/webgpu';
import { makeFxConfig, pipelineSignature } from './config.js';
import { Sun } from './Sun.js';
import { Environment } from './Environment.js';
import { Pipeline } from './post/Pipeline.js';
import { Anchors } from './fx/Anchors.js';
import { ParticleSystem } from './fx/Particles.js';
import { FireballPool } from './fx/Fireball.js';
import { DebrisSystem } from './fx/Debris.js';
import { Explosions } from './fx/Explosions.js';
import { CameraShake } from './fx/Shake.js';
import { registerShots } from './showcase/shots.js';

const _q = new THREE.Quaternion();

const S = {
  ctx: null, fx: null, sun: null, env: null, pipe: null, anchors: null, particles: null,
  fireballs: null, debris: null, explosions: null, shake: null,
  now: 0, exposure: { base: 1, target: 1, cur: 1, speed: 3, auto: true },
  flash: { v: 0, color: new THREE.Color(1, 1, 1) },
  damage: 0, heat: 0, heatTarget: 0, quantum: 0, quantumTarget: 0,
  extraDistort: new Set(),
  lastScale: 0, lastSig: '', qTimer: 0,
  grade: { saturation: 1.12, contrast: 1.12, tint: new THREE.Color(1, 1, 1), lift: new THREE.Color(0, 0, 0), vignette: 0.32 },
  fallback: false,
};

function buildFx(ctx) {
  const fx = makeFxConfig(ctx.quality, ctx.backend, ctx.params);
  return fx;
}

function applyGrade() {
  const U = S.pipe.U, g = S.grade;
  U.saturation.value = g.saturation; U.contrast.value = g.contrast;
  U.tint.value.copy(g.tint); U.lift.value.copy(g.lift); U.vignette.value = g.vignette;
}

/** Reconfigura tudo que depende do preset (troca de qualidade em jogo). */
function onQuality(ctx) {
  const fx = buildFx(ctx);
  const sig = pipelineSignature(fx) + fx.shadows;
  if (sig === S.lastSig) return;
  S.lastSig = sig;
  S.fx = fx;
  S.pipe.setFx(fx);
  S.pipe.invalidateCache();
  S.pipe.U.chromatic.value = fx.chromatic ? 0.0016 : 0;
  S.pipe.U.grain.value = fx.grain ? 0.035 : 0;
  S.sun.light.castShadow = fx.shadows;
  S.particles.budgetScale = Math.min(1, (ctx.quality.particleBudget || 40000) / 100000) * 0.6 + 0.4;
}

function render(ctx, dt) {
  if (S.fallback) { ctx.renderer.render(ctx.scene, ctx.camera); return; }
  const cam = ctx.camera;
  if (S.shotCam && ctx.shot) {
    // presets de screenshot do rendering: câmera fixa mesmo se outro sistema mexer
    const sc = S.shotCam;
    ctx.player.camWorld.copy(sc.pos);
    cam.quaternion.copy(sc.quat);
    if (sc.spin) { sc.t = (sc.t || 0) + dt; cam.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(sc.spinAxis, sc.spin * sc.t)); }
    if (sc.vel) ctx.player.camWorld.addScaledVector(sc.vel, sc.t || 0);
    ctx.world.sync();
  }
  // tremor: rotação extra só durante o render
  _q.copy(cam.quaternion);
  S.shake.apply(cam);
  try {
    S.anchors.sync(ctx.world.origin);
    S.fireballs.place();
    S.debris.update(dt, ctx);
    S.explosions.syncLights();
    S.pipe.updateUniforms(ctx, S.sun, dt);
    const srcs = S.explosions.distort.concat([...S.extraDistort]);
    S.pipe.updateDistortion(ctx, srcs);
    S.pipe.render(ctx);
  } catch (e) {
    ctx.errors.push('rendering: pipeline falhou, usando render direto: ' + (e.stack || e));
    console.error('[rendering] pipeline falhou', e);
    S.fallback = true;
    cam.clearViewOffset?.();
    ctx.renderer.render(ctx.scene, cam);
  } finally {
    cam.quaternion.copy(_q);
  }
}

const api = {
  get sun() { return S.sun.api(); },
  get environment() { return S.env.api(); },
  get fx() { return S.fx; },
  get uniforms() { return S.pipe.U; },
  /** Explosão em posição de MUNDO. kind: small|missile|ship|capital|ground|shield|plasma. opts: {vel, normal} */
  explosion(pos, size = 10, kind = 'ship', opts = {}) { return S.explosions.spawn(pos, size, kind, opts); },
  /** Exposição manual (multiplicador). auto=false desliga a adaptação automática. */
  setExposure(v, { speed = 3, auto } = {}) { S.exposure.base = v; S.exposure.speed = speed; if (auto !== undefined) S.exposure.auto = auto; },
  /** Profundidade de campo: false | { focus (m), range (m), bokeh } — só nos presets que permitem. */
  setDof(o) {
    const on = !!o;
    if (o && typeof o === 'object') {
      if (o.focus !== undefined) S.pipe.dofU.focus.value = o.focus;
      if (o.range !== undefined) S.pipe.dofU.range.value = o.range;
      if (o.bokeh !== undefined) S.pipe.dofU.bokeh.value = o.bokeh;
    }
    if (on !== S.pipe.dofActive) { S.pipe.dofActive = on; S.pipe.active = null; }
  },
  /**
   * Gancho de pós-processamento. fn({color, uv, depth, U}) → vec3 (nó TSL).
   * stage 'hdr' (linear, antes da exposição) ou 'ldr' (depois do tone mapping).
   */
  addPostEffect(name, fn, opts) { S.pipe.addHook(name, fn, opts); },
  removePostEffect(name) { S.pipe.removeHook(name); },
  shake(amount = 0.3, duration = 0.5) { S.shake.add(amount, duration); },
  flash(color = '#ffffff', intensity = 0.5) { S.flash.color.set(color); S.flash.v = Math.max(S.flash.v, intensity); },
  /** Grade de cor por contexto (planetas/cinemáticas). Campos opcionais. */
  setGrade(o = {}) {
    const g = S.grade;
    if (o.saturation !== undefined) g.saturation = o.saturation;
    if (o.contrast !== undefined) g.contrast = o.contrast;
    if (o.tint) g.tint.set(o.tint);
    if (o.lift) g.lift.set(o.lift);
    if (o.vignette !== undefined) g.vignette = o.vignette;
    applyGrade();
  },
  setDamage(v) { S.damage = Math.max(S.damage, v); },
  setHeatHaze(v) { S.heatTarget = v; },
  setQuantum(v) { S.quantumTarget = v; },
  /** Fonte de distorção contínua (ex.: escape de motor). Retorna {remove()}; muta .pos (mundo), .radius, .strength. */
  addDistortion(src) {
    const s = Object.assign({ pos: new THREE.Vector3(), radius: 5, strength: 0.4, ring: 1, ringWidth: 0.1, shimmer: 1 }, src);
    S.extraDistort.add(s);
    s.remove = () => S.extraDistort.delete(s);
    return s;
  },
  /** Corte de câmera: descarta histórico de TAA/motion blur. */
  cut() { if (S.ctx) S.ctx._renderCut = true; },
  setFlare(o = {}) {
    const f = S.pipe.flareU;
    for (const k of ['sun', 'god', 'anam', 'ghosts', 'dirt']) if (o[k] !== undefined) f[k].value = o[k];
  },
  setBloom(o = {}) {
    const b = S.pipe.bloomU;
    for (const k of ['strength', 'radius', 'threshold']) if (o[k] !== undefined) b[k].value = o[k];
  },
  particles: {
    /**
     * Emite partículas de uma camada ('spark'|'smoke'|'glow') a partir de uma
     * posição de MUNDO. fill(i, o) preenche {x,y,z (offset), vx,vy,vz, life,
     * s0, s1, drag, g, a,b,c, w, spin, rot, delay}. ttl = vida da âncora.
     */
    emit(layer, pos, n, fill, { vel = null, ttl = 6 } = {}) {
      const L = S.particles.layers[layer]; if (!L) return;
      const a = S.anchors.alloc(pos, vel, ttl, S.now);
      L.emit(S.particles.n(n), a, fill);
      return a;
    },
    /** Faíscas de impacto (metal/escudo). */
    sparks(pos, normal = null, count = 30, { hot = 0.85, speed = 40, energy = false } = {}) {
      const a = S.anchors.alloc(pos, null, 3, S.now);
      const d = new THREE.Vector3();
      S.particles.layers.spark.emit(S.particles.n(count), a, (k, o) => {
        d.randomDirection(); if (normal && d.dot(normal) < 0) d.reflect(normal);
        const sp = speed * (0.3 + Math.random());
        o.vx = d.x * sp; o.vy = d.y * sp; o.vz = d.z * sp; o.life = 0.3 + Math.random() * 0.7;
        o.s0 = 0.04; o.s1 = 0.015; o.drag = 1.5; o.g = 1; o.a = energy ? 1 : hot; o.b = energy ? 10 : 6; o.spin = 0.03;
      });
    },
    /** Poeira (pouso/decolagem, impactos no chão). */
    dust(pos, up, count = 20, { radius = 6, color = [0.3, 0.26, 0.2] } = {}) {
      const a = S.anchors.alloc(pos, null, 12, S.now);
      const d = new THREE.Vector3();
      S.particles.layers.smoke.emit(S.particles.n(count), a, (k, o) => {
        d.randomDirection(); if (up) d.addScaledVector(up, -d.dot(up)).normalize();
        const sp = radius * (0.6 + Math.random());
        o.vx = d.x * sp; o.vy = d.y * sp; o.vz = d.z * sp; if (up) { o.vx += up.x * 2; o.vy += up.y * 2; o.vz += up.z * 2; }
        o.life = 3 + Math.random() * 3; o.s0 = radius * 0.3; o.s1 = radius * 1.4; o.drag = 1.2; o.g = -0.02;
        o.a = color[0]; o.b = color[1]; o.c = color[2]; o.w = 0;
      });
    },
    /**
     * Raio de energia (laser/pulso) visual: risco esticado pela velocidade,
     * núcleo branco + halo da cor. color: 'red'|'blue'|'green'|'gold'.
     * pos/dir em MUNDO. Retorna a âncora (o raio vive `life` s).
     */
    bolt(pos, dir, { speed = 900, length = 14, color = 'gold', width = 0.35, life = 1.2, brightness = 30, vel = null } = {}) {
      const id = { red: 11, blue: 12, green: 13, gold: 14 }[color] ?? 14;
      const a = S.anchors.alloc(pos, vel, life + 0.5, S.now);
      const d = dir.clone().normalize();
      S.particles.layers.spark.emit(1, a, (k, o) => {
        o.vx = d.x * speed; o.vy = d.y * speed; o.vz = d.z * speed;
        o.life = life; o.s0 = width; o.s1 = width; o.drag = 0; o.g = 0;
        o.a = 1; o.b = brightness; o.c = id; o.spin = length / speed;
      });
      return a;
    },
    /** Brilho único (clarão de disparo, plasma). color em HDR linear. */
    glow(pos, size, color = [4, 2, 1], life = 0.15, vel = null) {
      const a = S.anchors.alloc(pos, vel, life + 0.5, S.now);
      S.particles.layers.glow.emit(1, a, (k, o) => { o.life = life; o.s0 = size; o.s1 = size * 1.3; o.a = color[0]; o.b = color[1]; o.c = color[2]; o.w = 1.5; });
    },
    get budgetScale() { return S.particles.budgetScale; },
  },
};

export default {
  name: 'rendering',
  order: 5,

  async init(ctx) {
    S.ctx = ctx;
    S.fx = buildFx(ctx);
    S.lastSig = pipelineSignature(S.fx) + S.fx.shadows;
    S.sun = new Sun(ctx, S.fx);
    S.env = new Environment(ctx, S.fx, S.sun);
    S.pipe = new Pipeline(ctx, S.fx);
    S.pipe.U.chromatic.value = S.fx.chromatic ? 0.0016 : 0;
    S.pipe.U.grain.value = S.fx.grain ? 0.035 : 0;
    S.anchors = new Anchors();
    S.particles = new ParticleSystem(ctx, S.anchors, S.fx, S.sun);
    S.particles.budgetScale = Math.min(1, (ctx.quality.particleBudget || 40000) / 100000) * 0.6 + 0.4;
    S.fireballs = new FireballPool(ctx, S.sun, S.fx, S.fx.preset === 'mobile' ? 4 : S.fx.preset === 'medium' ? 8 : 12);
    S.debris = new DebrisSystem(ctx, S.fx, S.particles, S.anchors);
    S.shake = new CameraShake();
    S.explosions = new Explosions(ctx, S.fx, {
      anchors: S.anchors, particles: S.particles, fireballs: S.fireballs, debris: S.debris,
      onShake: (a, d) => { S.shake.add(a, d); ctx.input?.rumble?.(Math.min(1, a), Math.min(1, a * 0.6), d * 600); },
      onFlash: (c, i) => api.flash(c, i),
    });
    S.lastScale = ctx.quality.dynamicScale;
    applyGrade();

    const bus = ctx.bus;
    bus.on('explosion', (e) => { if (e?.pos) api.explosion(e.pos, e.size ?? 10, e.kind ?? 'ship', e); });
    bus.on('shake', (e) => api.shake(e?.amount ?? 0.3, e?.duration ?? 0.5));
    bus.on('flash', (e) => api.flash(e?.color ?? '#ffffff', e?.intensity ?? 0.5));
    bus.on('ship:hit', (e) => {
      if (!e?.pos) return;
      const nrm = e.normal || null;
      if (e.shield) api.particles.sparks(e.pos, nrm, 24, { energy: true, speed: 30 });
      else api.particles.sparks(e.pos, nrm, 30, { speed: 45 });
      if (e.target === 'player' || e.target === ctx.player.ship?.id) {
        api.shake(Math.min(0.5, 0.08 + (e.damage || 5) * 0.01), 0.3);
        if (!e.shield) api.setDamage(Math.min(0.6, (e.damage || 5) * 0.02));
        else api.flash('#7fb8ff', 0.12);
      }
    });
    bus.on('player:damage', (e) => api.setDamage(Math.min(0.8, (e?.amount || 5) * 0.025)));
    bus.on('reentry', (e) => { S.heatTarget = Math.max(S.heatTarget, (e?.intensity ?? 0.5) * 0.9); S.reentryT = 0.3; });
    bus.on('quantum:start', () => { S.quantumTarget = 1; api.cut(); });
    bus.on('quantum:end', () => { S.quantumTarget = 0; api.flash('#cfe0ff', 0.35); api.cut(); });
    bus.on('quantum:interdicted', () => { S.quantumTarget = 0; api.shake(0.8, 1.0); api.flash('#ff8060', 0.4); api.cut(); });
    bus.on('jump:start', () => { S.quantumTarget = 1; api.flash('#ffffff', 0.6); });
    bus.on('jump:end', () => { S.quantumTarget = 0; api.flash('#ffffff', 0.9); api.cut(); });
    bus.on('system:change', (e) => { S.env.onSystem(e?.system); api.cut(); });
    bus.on('mode:change', () => api.cut());
    bus.on('quality:change', () => onQuality(ctx));
    bus.on('resize', () => S.sun.onResize());
    S.env.onSystem(ctx.universe.system);

    ctx.render = render;
    ctx.provide('rendering', api);
    registerShots(ctx, api, S);
  },

  frame(dt, ctx) {
    S.now += dt;
    // qualidade/escala dinâmica (performance mexe em quality.dynamicScale)
    S.qTimer += dt;
    if (ctx.quality.dynamicScale !== S.lastScale) { S.lastScale = ctx.quality.dynamicScale; ctx.resize?.(); }
    if (S.qTimer > 1) { S.qTimer = 0; onQuality(ctx); }

    S.sun.update(ctx, dt);
    S.env.update(ctx, dt);
    S.particles.update(dt, ctx);
    S.explosions.update(dt);
    S.fireballs.update(dt);
    S.debris.keepAlive(S.now);
    S.anchors.step(dt, S.now);
    S.shake.update(dt);

    const U = S.pipe.U;
    // flash/dano/calor/quântico decaem suavemente
    S.flash.v *= Math.exp(-dt * 5);
    U.flash.value = S.flash.v; U.flashColor.value.copy(S.flash.color);
    S.damage *= Math.exp(-dt * 2.2);
    U.damage.value = S.damage;
    if (S.reentryT > 0) S.reentryT -= dt; else S.heatTarget *= Math.exp(-dt * 3);
    S.heat += (S.heatTarget - S.heat) * (1 - Math.exp(-dt * 4));
    U.heatHaze.value = S.heat;
    S.quantum += (S.quantumTarget - S.quantum) * (1 - Math.exp(-dt * 2.5));
    U.quantum.value = S.quantum;

    // exposição: adaptação simples (lado noturno/eclipse abre o olho)
    const e = S.exposure;
    const vis = S.sun.visibility;
    const auto = e.auto ? 1 + (1 - vis) * 1.4 : 1;
    e.target = e.base * auto;
    e.cur += (e.target - e.cur) * (1 - Math.exp(-dt * e.speed));
    U.exposure.value = e.cur;
  },

  dispose(ctx) {
    S.pipe?.invalidateCache();
  },
};

export { api as renderingApi };
