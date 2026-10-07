/**
 * Feature `vfx` — efeitos de combate e balística.
 *
 * Peças (todas nesta pasta):
 *  - atlas.js     atlas procedurais gerados na GPU (fumaça com normais,
 *                 clarões, faíscas, anéis; marcas de tiro PBR por material)
 *  - particles.js partículas GPU instanciadas, trajetória analítica, luz do
 *                 sol/céu com espalhamento frontal, fogo de corpo negro,
 *                 "soft" por plano de superfície. 1 draw call por cena.
 *  - decals.js    marcas de tiro/sangue/queimado (InstancedMesh PBR)
 *  - rigid.js     cápsulas ejetadas e detritos com física simples
 *  - effects.js   receitas (impactos por material, clarões, traçantes,
 *                 sangue, explosões)
 *
 * Eventos ouvidos: weapon:fire, weapon:hit, enemy:fire, explosion,
 * grenade:explode. Serviço publicado: ctx.services.vfx (ver README.md).
 */
import * as THREE from 'three';
import { bakeAtlases, detailTexture } from './atlas.js';
import { DepthPrepass } from './depth.js';
import { ParticleSystem } from './particles.js';
import { Decals } from './decals.js';
import { RigidPool, brassGeometry, chunkGeometry } from './rigid.js';
import { Effects, MATERIALS, PENETRATION } from './effects.js';
import { SurfaceIndex } from './surface.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _sky = new THREE.Color();
const DEG = Math.PI / 180;

/** Saída de um raio que entrou na AABB do colisor em `p` (direção d). */
function exitOf(collider, p, d) {
  const box = collider.box;
  let t = Infinity, axis = 'x';
  for (const k of ['x', 'y', 'z']) {
    if (Math.abs(d[k]) < 1e-6) continue;
    const tk = ((d[k] > 0 ? box.max[k] : box.min[k]) - p[k]) / d[k];
    if (tk < t) { t = tk; axis = k; }
  }
  if (!isFinite(t)) return null;
  const normal = new THREE.Vector3();
  normal[axis] = Math.sign(d[axis]);
  return { point: p.clone().addScaledVector(d, Math.max(0, t)), normal, thickness: Math.max(0, t) };
}

export default {
  name: 'vfx',
  order: 60,

  init(ctx) {
    const { scene, vm, bus, collision, quality, renderer } = ctx;
    const budget = quality.particleBudget ?? 1;
    // camadas leves (core/Quality.js: celular, PC fraco, modo leve) e preset
    // low: atlas menores (o de partículas de 2048² sozinho ocupava ~21 MB),
    // menos partículas/marcas/destroços e UMA luz de clarão (cada PointLight
    // na cena encarece o shader de todo material iluminado)
    const tier = quality.tier || 'desktop';
    const lite = tier === 'lite';
    const lean = lite || tier !== 'desktop' || quality.level === 'low';
    const tex = bakeAtlases(renderer, {
      particleSize: lite ? 512 : lean ? 1024 : 2048,
      decalSize: lite ? 512 : 1024,
      anisotropy: Math.min(quality.anisotropy || 4, renderer.capabilities.getMaxAnisotropy?.() || 4),
    });
    this.tex = tex;
    const detail = detailTexture();
    tex.detail = detail;
    const clock = () => ctx.time.now;

    const pCap = lean ? Math.min(2048, Math.max(768, Math.round(4096 * budget))) : Math.max(1024, Math.round(8192 * budget));
    const particles = new ParticleSystem({ capacity: pCap, atlas: tex.particles, detail, clock, nearFade: 0.3 });
    scene.add(particles.mesh);
    const vmParticles = new ParticleSystem({ capacity: 384, atlas: tex.particles, detail, clock, nearFade: 0.0, name: 'vfx-vm-particles' });
    vmParticles.uniforms.uWind.value.set(0, 0, 0);
    vmParticles.mesh.remove(vmParticles.depthMesh);
    vm.scene.add(vmParticles.mesh);

    // índice das superfícies visíveis (marcas assentam na fachada real)
    const makeExclude = () => {
      const groups = new Set((ctx.services.enemies?.list || []).map((e) => e.group));
      return (o) => {
        for (let p = o; p; p = p.parent) if (groups.has(p) || p === ctx.camera || p.name?.startsWith('vfx')) return true;
        return false;
      };
    };
    const surface = new SurfaceIndex(scene, { exclude: makeExclude() });
    bus.on('ready', () => {
      try {
        if (!surface.built) {
          surface.exclude = makeExclude();
          surface.build();
        }
      } catch (err) {
        console.warn('[vfx] índice de superfícies falhou', err);
      }
    });
    this.surface = surface;
    const decals = new Decals({ capacity: lean ? Math.round(160 * Math.max(0.5, budget)) : Math.round(320 * Math.max(0.5, budget)), albedo: tex.decalAlbedo, normal: tex.decalNormal, rng: ctx.rng, surface });
    scene.add(decals.mesh);

    // latão deflagrado: um pouco oxidado/fosco (não é ouro polido)
    const brassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.43, 0.17), metalness: 1, roughness: 0.36, envMapIntensity: 1.0 });
    brassMat.name = 'vfx-brass';
    const audio = () => ctx.services.audio;
    const brass = new RigidPool(brassGeometry(), brassMat, {
      capacity: 48, collision, restitution: 0.38, friction: 0.6, name: 'vfx-brass', castShadow: false,
      onBounce: (b, impact) => audio()?.play?.('brass', { position: b.pos, volume: Math.min(1, impact * 0.2) }),
    });
    scene.add(brass.mesh);
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true, map: detail });
    debrisMat.name = 'vfx-debris';
    // textura de fratura: ruído triplanar no espaço do objeto (poros, agregado),
    // face recém-quebrada mais clara, arestas/cavidades escurecidas (AO de forma)
    debrisMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
        .replace('#include <map_fragment>', `
          vec3 op = vObjP * 2.3;
          float nA = texture2D(map, op.xy).r, nB = texture2D(map, op.yz + 0.37).g, nC = texture2D(map, op.zx + 0.71).b;
          float nF = texture2D(map, vObjP.xy * 9.0 + vObjP.z * 3.0).r;
          float tri = (nA + nB + nC) / 3.0;
          float cav = smoothstep(0.22, 0.48, length(vObjP));
          diffuseColor.rgb *= (0.55 + 0.75 * tri) * (0.75 + 0.5 * nF) * mix(0.55, 1.05, cav);
        `)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.8 + 0.25 * nF, 0.0, 1.0);');
    };
    debrisMat.customProgramCacheKey = () => 'vfx-debris-2';
    const debris = new RigidPool(chunkGeometry(), debrisMat, {
      capacity: lean ? 48 : Math.round(128 * Math.max(0.5, budget)), collision, restitution: 0.25, friction: 0.5, lieDown: false, name: 'vfx-debris', useColor: true,
      onFly: (b) => this.fx?.debrisTrail(b),
    });
    scene.add(debris.mesh);

    // luzes de clarão: pool FIXO (adicionar luzes depois recompila shaders)
    const lights = [];
    for (let i = 0, n = lean ? 1 : 3; i < n; i++) {
      const light = new THREE.PointLight(0xffa060, 0, 10, 2);
      light.name = `vfx-flash-${i}`;
      light.castShadow = false;
      scene.add(light);
      lights.push({ light, t0: -1e6, life: 1, peak: 0, hold: false, flicker: 0.3, curve: 2 });
    }
    // queda linear (decay 1): ilumina arma, luva e antebraço por igual
    const vmL = new THREE.PointLight(0xffa868, 0, 2.6, 1);
    vmL.name = 'vfx-vm-flash';
    vm.scene.add(vmL);
    const vmLight = { light: vmL, t0: -1e6, life: 1, peak: 0 };

    // pré-passe de profundidade (partículas suaves) — só com efeitos vivos
    const own = new Set([particles.mesh, decals.mesh, brass.mesh, debris.mesh, ...lights.map((l) => l.light)]);
    this.prepass = lean ? null : new DepthPrepass(renderer, scene, ctx.camera, {
      scale: quality.level === 'ultra' ? 0.75 : 0.5,
      isOwn: (o) => own.has(o) || (o.name && o.name.startsWith('vfx')),
    });
    this.lensBase = null;
    this.lensKick = 0;

    const fx = new Effects(ctx, { particles, vmParticles, decals, brass, debris, lights, vmLight });
    this.fx = fx;
    this.sys = { particles, vmParticles, decals, brass, debris, lights, vmLight };
    this.heat = 0;
    this.lastFire = -1e6;
    this.wispTimer = 0;
    this.shotCount = 0;
    this.pendingTracer = null;
    this.lastMuzzleWorld = new THREE.Vector3();
    this.lastAimDir = new THREE.Vector3(0, 0, -1);
    const combatHold = !!ctx.shot?.preset?.combat;

    // ─── ponte viewmodel → mundo ─────────────────────────────────────────
    // A arma é desenhada com outro FOV; para algo nascer "na boca" no mundo,
    // projetamos o ponto da vm na tela e o reconstruímos na câmera do mundo
    // à mesma profundidade de visão.
    const vmToWorld = (pVm, out) => {
      const vc = vm.camera;
      vc.updateMatrixWorld();
      out.copy(pVm).applyMatrix4(vc.matrixWorldInverse);
      const k = Math.tan(ctx.camera.fov * DEG * 0.5) / Math.tan(vc.fov * DEG * 0.5);
      out.x *= k;
      out.y *= k;
      return out.applyMatrix4(ctx.camera.matrixWorld);
    };
    this.vmToWorld = vmToWorld;
    const muzzleWorld = (muzzle, out) => {
      if (!muzzle) return out.copy(ctx.player.eyePosition).addScaledVector(ctx.player.getAimDir(_c), 0.6);
      muzzle.updateWorldMatrix(true, false);
      return vmToWorld(_a.setFromMatrixPosition(muzzle.matrixWorld), out);
    };
    this.muzzleWorld = muzzleWorld;

    const ejectFrom = (muzzle) => {
      const w = ctx.services.weapon;
      // brassByVfx: a arma delega a ejeção inteira (arco visível incluso) à vfx
      const full = !!w?.brassByVfx || !w;
      const port = w?.ejectPort;
      const cam = ctx.camera;
      let pos;
      if (port) {
        port.updateWorldMatrix(true, false);
        pos = vmToWorld(_a.setFromMatrixPosition(port.matrixWorld), new THREE.Vector3());
      } else if (muzzle) {
        // estimativa: ~38 cm atrás da boca, ao longo do cano, um pouco acima
        muzzle.updateWorldMatrix(true, false);
        const fwd = _b.set(0, 0, -1).transformDirection(muzzle.matrixWorld);
        _a.setFromMatrixPosition(muzzle.matrixWorld).addScaledVector(fwd, -0.36);
        _a.y += 0.025;
        pos = vmToWorld(_a, new THREE.Vector3());
      } else return;
      // direita + cima + leve para trás, no espaço da câmera do mundo
      const v = new THREE.Vector3(fx.R(1.6, 2.6), fx.R(1.4, 2.3), fx.R(-0.2, 0.5)).applyQuaternion(cam.quaternion);
      if (!full) {
        // a arma já anima a própria cápsula na viewmodel: aqui nasce a "herdeira"
        // no mundo, fora do quadro à direita, que cai, quica e fica no chão
        pos.set(0.5, -0.3, -0.12).applyMatrix4(cam.matrixWorld);
        v.set(fx.R(0.8, 1.4), fx.R(-0.2, 0.4), fx.R(-0.1, 0.2)).applyQuaternion(cam.quaternion);
      }
      v.add(ctx.player.velocity || _c.set(0, 0, 0));
      fx.eject(pos, v, cam.quaternion, full);
    };

    // ─── eventos ──────────────────────────────────────────────────────────
    bus.on('weapon:fire', (e) => {
      const muzzle = e.muzzle || ctx.services.weapon?.muzzle;
      const p = muzzleWorld(muzzle, new THREE.Vector3());
      const dir = (e.dir ? _c.copy(e.dir) : ctx.player.getAimDir(_c)).clone();
      this.lastMuzzleWorld.copy(p);
      this.lastAimDir.copy(dir);
      const ads = typeof e.ads === 'number' ? e.ads : e.ads ? 1 : ctx.services.weapon?.ads || 0;
      if (muzzle && ctx.vm.visible && !e.suppressed) fx.muzzleFlashVm(muzzle, p, dir, ads);
      else fx.muzzleWorld(p, dir, 1, ads);
      ejectFrom(muzzle);
      this.heat = Math.min(1, this.heat + 0.07);
      this.lastFire = ctx.time.now;
      this.shotCount++;
      // traçante a cada 3 tiros (fecha no weapon:hit deste passo)
      this.pendingTracer = this.shotCount % 3 === 1 ? { from: p.clone(), dir, to: null } : null;
    });

    bus.on('weapon:hit', (h) => {
      if (!h?.point) return;
      const material = h.material || h.collider?.material || ctx.services.world?.materialAt?.(h) || 'concrete';
      const dir = h.dir ? h.dir.clone().normalize() : null;
      fx.impact(h.point, h.normal || _b.set(0, 1, 0), material, { dir, collider: h.collider, exit: h.exit });
      if (this.pendingTracer && !this.pendingTracer.to && !h.exit && !(h.penetration > 0)) this.pendingTracer.to = h.point.clone();
      // balística: penetração VISUAL quando a arma não usa vfx.ballistics
      if (!h.ballistic && dir && h.collider) this.visualPenetration(h, material, dir);
    });

    bus.on('enemy:fire', (e) => {
      if (!e?.origin || !e?.dir) return;
      const hit = collision.raycast(e.origin, e.dir, 150, { filter: (c) => c.tag !== 'enemy' && c.owner !== e.enemy?.group });
      const to = hit ? hit.point : e.origin.clone().addScaledVector(e.dir, 150);
      fx.muzzleFlashWorld(e.origin, e.dir, { hold: combatHold });
      fx.tracer(e.origin.clone().addScaledVector(e.dir, 0.4), to, combatHold ? { speed: 70, length: 3.5 } : { speed: 380, length: 5 });
      if (hit) fx.impact(hit.point, hit.normal, hit.collider?.material || 'concrete', { dir: e.dir, collider: hit.collider, scale: 0.8 });
    });

    const onExplosion = (e) => {
      const p = e?.point || e?.position;
      if (!p) return;
      fx.explosion(p.isVector3 ? p : new THREE.Vector3(...p), { radius: e.radius ?? 6, normal: e.normal });
    };
    bus.on('explosion', onExplosion);
    bus.on('grenade:explode', onExplosion);

    // ─── balística (hitscan + penetração) para a arma adotar ─────────────
    const ballistics = {
      PENETRATION,
      /**
       * Dispara um projétil hitscan com penetração. Aplica dano em cada
       * colisor atravessado (collider.data.damage) e emite 'weapon:hit'
       * por superfície com { ballistic: true, penetration: n, exit? }.
       * Retorna a lista de acertos.
       */
      fire(origin, dir, { range = 800, damage = 30, power = 1, source = 'player', filter = null, maxSurfaces = 4, emit = true } = {}) {
        const hits = [];
        const o = origin.clone();
        const d = dir.clone().normalize();
        let remaining = range, dmg = damage, pw = power;
        const skip = new Set();
        for (let n = 0; n < maxSurfaces && remaining > 0; n++) {
          const hit = collision.raycast(o, d, remaining, { filter: (c) => !skip.has(c.id) && c.tag !== source && (!filter || filter(c)) });
          if (!hit) break;
          const material = hit.collider?.material || 'concrete';
          const info = { ...hit, material, dir: d.clone(), damage: dmg * (hit.part === 'head' ? 2.5 : 1), source, ballistic: true, penetration: n };
          hit.collider?.data?.damage?.(info.damage, info);
          if (emit) bus.emit('weapon:hit', info);
          hits.push(info);
          const maxT = (PENETRATION[material] ?? 0.05) * pw;
          const ex = hit.collider ? exitOf(hit.collider, hit.point, d) : null;
          if (!ex || ex.thickness > maxT) break;
          pw -= ex.thickness / Math.max(1e-3, PENETRATION[material] ?? 0.05) * 0.5 + 0.25;
          dmg *= 0.65;
          if (material !== 'flesh') {
            const exitInfo = { point: ex.point, normal: ex.normal, distance: hit.distance + ex.thickness, collider: hit.collider, material, dir: d.clone(), damage: 0, source, ballistic: true, penetration: n, exit: true };
            if (emit) bus.emit('weapon:hit', exitInfo);
          }
          skip.add(hit.collider.id);
          remaining -= hit.distance + ex.thickness;
          o.copy(ex.point).addScaledVector(d, 0.005);
          if (pw <= 0) break;
        }
        return hits;
      },
    };

    // ─── serviço ──────────────────────────────────────────────────────────
    ctx.provide('vfx', {
      /** impact(point, normal, material?, { dir, scale, exit, decal }) */
      impact: (point, normal, material, opts) => fx.impact(point, normal, material || 'concrete', opts || {}),
      /** tracer(from, to, { speed, length, width, emissive }) */
      tracer: (from, to, opts) => fx.tracer(from, to, opts),
      /** muzzleFlash(obj3d) — Object3D na viewmodel (boca da arma) */
      muzzleFlash: (obj, opts = {}) => {
        if (!obj) return;
        const p = muzzleWorld(obj, new THREE.Vector3());
        fx.muzzleFlashVm(obj, p, opts.dir || ctx.player.getAimDir(new THREE.Vector3()), opts.ads ?? 0);
      },
      /** Clarão de 3ª pessoa (inimigos/aliados) em coordenadas do mundo. */
      muzzleFlashWorld: (origin, dir, opts) => fx.muzzleFlashWorld(origin, dir, opts || {}),
      /** explosion(point, { radius, normal }) — também via bus 'explosion'. */
      explosion: (point, opts) => fx.explosion(point, opts || {}),
      blood: (point, normal, dir) => fx.blood(point, normal, dir || normal.clone().negate()),
      decal: (point, normal, kind, size, dir) => fx.decals.add(point, normal, kind, size, dir),
      eject: (pos, vel) => fx.eject(pos, vel, ctx.camera.quaternion),
      shake: (amount, duration) => fx.addShake(amount, duration),
      /** Partículas suaves ativas (pré-passe de profundidade). */
      get softActive() { return fx.softUntil > ctx.time.now; },
      ballistics,
      materials: Object.keys(MATERIALS),
      vmToWorld,
      clear: () => {
        particles.clear();
        vmParticles.clear();
      },
      get stats() {
        return { particles: particles.capacity, decals: decals.mesh.count, brass: brass.mesh.count, debris: debris.mesh.count };
      },
    });
  },

  /** Penetração só visual (furo de saída + impacto atrás) para hits sem balística. */
  visualPenetration(h, material, dir) {
    const fx = this.fx;
    const ctx = fx.ctx;
    if (material === 'flesh') return;
    const maxT = PENETRATION[material] ?? 0;
    if (maxT <= 0) return;
    const ex = exitOf(h.collider, h.point, dir);
    if (!ex || ex.thickness > maxT || ex.thickness < 1e-3) return;
    fx.impact(ex.point, ex.normal, material, { dir, exit: true, scale: 0.8, collider: h.collider });
    const next = ctx.collision.raycast(ex.point.clone().addScaledVector(dir, 0.005), dir, 300, {
      filter: (c) => c.id !== h.collider.id && c.tag !== 'player',
    });
    if (next) fx.impact(next.point, next.normal, next.collider?.material || 'concrete', { dir, collider: next.collider, scale: 0.8 });
  },

  update(dt, ctx) {
    const { brass, debris } = this.sys;
    // fecha o traçante do jogador (hit já chegou neste passo)
    const t = this.pendingTracer;
    if (t) {
      const to = t.to || t.from.clone().addScaledVector(t.dir, 200);
      this.fx.tracer(t.from.clone().addScaledVector(t.dir, 0.5), to, { speed: 520, length: 3.5, width: 0.016, emissive: 9 });
      this.pendingTracer = null;
    }
    brass.update(dt);
    debris.update(dt);
    // fiapos do cano quente depois de rajadas
    this.heat = Math.max(0, this.heat - dt * 0.18);
    if (this.heat > 0.25 && ctx.time.now - this.lastFire > 0.25 && ctx.vm.visible) {
      this.wispTimer -= dt;
      if (this.wispTimer <= 0) {
        this.wispTimer = 0.07;
        const muzzle = ctx.services.weapon?.muzzle;
        if (muzzle) this.fx.barrelWisp(this.muzzleWorld(muzzle, new THREE.Vector3()), this.heat);
      }
    }
  },

  frame(dt, ctx) {
    const { particles, vmParticles, decals, lights, vmLight } = this.sys;
    const now = ctx.time.now;
    this.syncLighting(ctx);
    particles.flush(now);
    vmParticles.flush(now);
    decals.update(1 / 60);
    const u = particles.uniforms;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const x = (now - l.t0) / l.life;
      const fl = 1 - l.flicker * 0.5 + l.flicker * (0.5 * Math.sin(now * 61 + i * 2) * 0.5 + 0.5 * Math.random());
      l.light.intensity = l.hold ? l.peak : x >= 0 && x < 1 ? l.peak * Math.pow(1 - x, l.curve) * fl : 0;
      // as mesmas luzes acendem as partículas (fumaça iluminada pelo fogo/clarão)
      u.uLPos.value[i].copy(l.light.position);
      u.uLCol.value[i].copy(l.light.color).multiplyScalar(l.light.intensity);
      u.uLRange.value[i] = l.light.intensity > 0 ? l.light.distance : 0;
    }
    {
      const x = (now - vmLight.t0) / vmLight.life;
      vmLight.light.intensity = x >= 0 && x < 1 ? vmLight.peak * (1 - x) : 0;
    }
    // aberração cromática transitória (explosão perto), via serviço rendering
    const rendering = ctx.services.rendering;
    if (rendering?.setLens && rendering.params?.lens) {
      const fxk = this.fx.lensKick;
      if (fxk > 0.001) {
        if (this.lensBase === null) this.lensBase = rendering.params.lens.ca ?? 0;
        rendering.setLens({ ca: this.lensBase + fxk * 0.02 });
        this.fx.lensKick *= Math.exp(-dt * 2.5);
      } else if (this.lensBase !== null) {
        rendering.setLens({ ca: this.lensBase });
        this.lensBase = null;
        this.fx.lensKick = 0;
      }
    }
    // tremor de câmera (aditivo; o núcleo reaplica a pose no próximo frame).
    // Com a feature movement presente, ela já trata 'vfx:explosion' (trauma).
    const sh = this.fx.shake;
    if (sh.amp > 0 && ctx.services.movement && !this.fx.forceShake) sh.amp = 0;
    if (sh.amp > 0) {
      sh.t += dt;
      const k = Math.max(0, 1 - sh.t / sh.dur);
      if (k <= 0) sh.amp = 0;
      else {
        const a = sh.amp * k * k * 0.03;
        const tt = now * 38;
        const cam = ctx.camera;
        cam.rotateX(a * (Math.sin(tt * 1.13) * 0.7 + Math.sin(tt * 2.71 + 1.3) * 0.3));
        cam.rotateY(a * (Math.sin(tt * 0.97 + 2.1) * 0.7 + Math.sin(tt * 2.33 + 0.4) * 0.3));
        cam.rotateZ(a * 0.6 * Math.sin(tt * 1.61 + 0.7));
        cam.updateMatrixWorld();
      }
    }
    // pré-passe de profundidade para as partículas suaves (depois do tremor)
    const pp = this.prepass;
    if (pp && this.fx.softUntil > now) {
      try {
        pp.render(dt);
        u.uDepth.value = pp.rt.depthTexture;
        u.uSoftOn.value = 1;
        ctx.renderer.getDrawingBufferSize(u.uRes.value);
        u.uNearFar.value.set(ctx.camera.near, ctx.camera.far);
      } catch (err) {
        console.warn('[vfx] pré-passe de profundidade falhou', err);
        this.prepass = null;
        u.uSoftOn.value = 0;
      }
    } else u.uSoftOn.value = 0;
  },

  /** Sol/céu atuais → uniforms das partículas (lidos de world/rendering). */
  syncLighting(ctx) {
    const world = ctx.services.world;
    const rendering = ctx.services.rendering;
    const sun = world?.sun;
    const hemi = world?.hemi;
    const u = this.sys.particles.uniforms;
    const vu = this.sys.vmParticles.uniforms;
    const dir = u.uSunDir.value;
    if (rendering?.sunDirection) dir.copy(rendering.sunDirection);
    else if (sun) dir.subVectors(sun.position, sun.target.position).normalize();
    this.fx.sunDir = dir;
    if (sun) u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
    const envI = rendering?.environmentIntensity ?? 0.5;
    if (hemi) {
      u.uAmbient.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.9).add(_sky.setRGB(0.8, 0.92, 1.15).multiplyScalar(envI));
      u.uGroundAmbient.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity * 0.9).add(_sky.setRGB(0.45, 0.42, 0.38).multiplyScalar(envI));
    }
    vu.uSunDir.value.copy(dir);
    vu.uSunColor.value.copy(u.uSunColor.value);
    vu.uAmbient.value.copy(u.uAmbient.value);
    vu.uGroundAmbient.value.copy(u.uGroundAmbient.value);
  },
};
