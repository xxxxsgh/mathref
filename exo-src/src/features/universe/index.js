/**
 * UNIVERSO do EXOSFERA — publica o serviço `universe` (CONTRACT.md §13).
 *
 * Hierarquia de seeds (ctx.seed): galáxia → sistema → planeta → região → prop
 *   galaxy,g                       braços, passo, nome (galaxy.js)
 *   galaxy,g,cells (hash inteiro)  células de 40 al com sistemas virtuais
 *   galaxy,g,system,s              estrela(s), planetas, cinturão, estação (system.js)
 *   …,planet,p / …,planet,p,moon,m corpos (o `planet` usa a seed publicada)
 *   …,planet,p,field / belt        detritos (asteroids.js)
 *
 * Arquivos:
 *   galaxy.js    modelo de densidade, células, índice ↔ sistema, nuvem p/ mapa
 *   system.js    gerador do sistema (ESCALA COMPRIMIDA documentada lá)
 *   bodies.js    planetas/luas/gigantes/anéis/halos vistos de longe
 *   asteroids.js cinturões e halos instanciados com LOD + poeira distante
 *   station.js   estação espacial procedural (âncora)
 *   galaxysky.js céu galáctico coerente com a posição na galáxia
 *   warp.js      túnel do salto (o sistema novo é gerado durante o túnel)
 *
 * Serviço (além do contrato):
 *   galaxy.model           API do modelo (o `galaxymap` usa): star(i),
 *                          position(i), systemsNear(p, r), sampleCloud(n), …
 *   systemInfo(i)          resumo de um sistema (sem gerar malhas)
 *   travelTime(a, b)       s de pulso entre duas posições; `pulseSpeed`
 *   warpTo(id, p, { tunnel })  túnel por padrão fora do modo shot
 *   warping / warpPhase    estado do salto
 *   enterPlanet(k)         troca o planeta atual (recentra o mundo)
 *   anchors                estações do sistema atual
 *   eventos extras         universe:warp { phase: 'start'|'arrive'|'end', target }
 *
 * Parâmetros de preset (preset.params, só screenshots):
 *   uniCam: { body, dist (raios; ou distM em m), az, el (graus, relativos à
 *             direção do sol vista do corpo), look: <corpo>, yaw, pitch, roll }
 *   uniWarp: fase 0..1 do túnel congelada (para a vitrine do salto)
 */
import * as THREE from 'three';
import { WorldPos } from '../../core/Space.js';
import { quatFromForwardUp } from '../../core/Geo.js';
import { createGalaxy, lyBetween } from './galaxy.js';
import { generateSystem, recenter, travelTime, PULSE_SPEED, STAR_DIST } from './system.js';
import { BodyRenderer, mulberry } from './bodies.js';
import { AsteroidField } from './asteroids.js';
import { buildStation } from './station.js';
import { GalaxySky, GALAXY_GLSL } from './galaxysky.js';
import { NOISE_GLSL } from './glsl.js';
import { WarpTunnel } from './warp.js';
import { updateLights } from './shading.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export default {
  name: 'universe',
  order: 5,

  async init(ctx) {
    this.ctx = ctx;
    const g = ctx.start.galaxy ?? 0;
    const galaxy = (this.galaxy = createGalaxy(ctx.seed, g));
    this.bodies = new BodyRenderer(ctx);
    this.asteroids = new AsteroidField(ctx);
    this.sky = new GalaxySky(ctx);
    this.warp = new WarpTunnel(ctx);
    this.station = null;
    this.warpState = null;
    this.spaceK = 0;
    await ctx.bootProgress?.('sistema estelar', 0.3);
    const startIndex = galaxy.resolve(ctx.start.systemIndex ?? 0);
    this.enter(startIndex, ctx.start.planetIndex ?? 0, { emit: false });

    const self = this;
    const api = {
      get galaxy() {
        return self.galaxyInfo;
      },
      get currentSystem() {
        return self.sys;
      },
      get currentPlanet() {
        return self.sys.planets[self.sys.currentPlanetIndex];
      },
      get currentPlanetIndex() {
        return self.sys.currentPlanetIndex;
      },
      get anchors() {
        return self.sys.anchors;
      },
      bodies() {
        return self.sys.bodies;
      },
      findBody(q) {
        return self.findBody(q);
      },
      warpTo(target, planetIndex = 0, opts = {}) {
        return self.warpTo(target, planetIndex, opts);
      },
      get warping() {
        return !!self.warpState;
      },
      get warpPhase() {
        return self.warpState ? self.warp.phase : 0;
      },
      enterPlanet(k) {
        return self.enterPlanet(k);
      },
      systemInfo(index) {
        return self.systemInfo(index);
      },
      travelTime(a, b) {
        return travelTime(a, b);
      },
      pulseSpeed: PULSE_SPEED,
      /** escala documentada (m) */
      scale: { starDistance: STAR_DIST, neighbors: [1.2e7, 2.4e7], moons: [5, 9], pulseSpeed: PULSE_SPEED, lyPerCell: galaxy.CELL },
    };
    this.galaxyInfo = {
      index: galaxy.index,
      id: galaxy.id,
      name: galaxy.name,
      get systemCount() {
        return galaxy.systemCount;
      },
      arms: galaxy.arms,
      model: galaxy,
      /** GLSL do modelo (emissão/poeira em al) + ruído, e como preencher as uniformes */
      glsl: NOISE_GLSL + GALAXY_GLSL,
      glslUniforms: { uArms: galaxy.arms, uTanP: Math.tan(galaxy.pitch), uSinP: Math.sin(galaxy.pitch), uTheta0: galaxy.theta0, uR0: galaxy.R0, uGSeed: (galaxy.gseed % 1000) / 10 },
    };
    this.api = ctx.provide('universe', api);

    this.offs = [
      ctx.bus.on('quality:change', () => {
        this.bodies.lastPx = null;
      }),
    ];
    if (!ctx.shot) this.makeBanner();
  },

  /** Gera e instala o sistema `index` (planeta atual `planetIndex`). */
  enter(index, planetIndex = 0, { emit = true } = {}) {
    const ctx = this.ctx;
    const sys = generateSystem(ctx.seed, this.galaxy, index, planetIndex);
    // referencial galáctico em coordenadas inerciais (para o céu)
    const gr = ctx.seed.derive('galaxy', this.galaxy.index, 'system', index, 'galactic');
    const en = new THREE.Vector3().fromArray(sys.ecliptic.normal);
    const tiltA = gr.range(0.35, 1.25);
    const tAx = new THREE.Vector3(gr.range(-1, 1), 0, gr.range(-1, 1)).normalize();
    const gn = en.clone().applyAxisAngle(tAx, tiltA).normalize();
    const core = new THREE.Vector3(gr.range(-1, 1), gr.range(-1, 1), gr.range(-1, 1));
    core.addScaledVector(gn, -core.dot(gn)).normalize();
    sys.galactic = { normal: gn.toArray(), core: core.toArray() };
    this.sys = sys;
    this.bodies.build(sys);
    this.asteroids.setSystem(sys);
    this.buildStation();
    this.sky.set(this.galaxy, sys, sys.galactic);
    if (emit) ctx.bus.emit('system:enter', { system: sys, planet: sys.planets[sys.currentPlanetIndex] });
    this.showBanner();
    return sys;
  },

  buildStation() {
    const ctx = this.ctx;
    if (this.station) {
      this.station.handle.remove();
      ctx.scene.remove(this.station.group);
      this.station.group.userData.dispose?.();
      this.station = null;
    }
    const a = this.sys.anchors[0];
    if (!a) return;
    let built;
    try {
      built = buildStation(a.seed);
    } catch (err) {
      ctx.report('universe', 'station', err);
      return;
    }
    const group = built.group;
    ctx.scene.add(group);
    const handle = ctx.space.registerFloating(group, a.position.clone());
    // eixo da estação apontando para o planeta-mãe
    const parent = this.sys.planets.find((p) => p.id === a.parent) || this.sys.planets[0];
    _v.set(parent.position.x - a.position.x, parent.position.y - a.position.y, parent.position.z - a.position.z).normalize();
    group.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), _v);
    this.station = { group, handle, anchor: a, baseQ: group.quaternion.clone() };
  },

  findBody(q) {
    const sys = this.sys;
    if (!q || !sys) return null;
    const byId = sys.bodies.find((b) => b.id === q) || sys.anchors.find((b) => b.id === q);
    if (byId) return byId;
    const cur = sys.planets[sys.currentPlanetIndex];
    if (q === 'star' || q === 'sun') return sys.stars[0];
    if (q === 'moon') return cur.moons[0] || sys.bodies.find((b) => b.kind === 'moon') || null;
    if (q === 'planet') return sys.planets.find((p) => p !== cur) || null;
    if (q === 'station') return sys.anchors[0] || null;
    if (q === 'gas') return sys.planets.find((p) => p.type === 'gas') || null;
    if (q === 'ringed') return sys.planets.find((p) => p.rings && p !== cur) || null;
    const m = /^p(\d+)(?:\.m(\d+))?$/.exec(q);
    if (m) {
      const p = sys.planets[Number(m[1])];
      if (!p) return null;
      return m[2] != null ? p.moons[Number(m[2])] || null : p;
    }
    return null;
  },

  /** Resumo de um sistema (para o mapa): sem malhas. */
  systemInfo(index) {
    const G = this.galaxy;
    index = G.resolve(index);
    const st = G.star(index);
    const cur = this.sys;
    let sys = null;
    try {
      sys = index === cur.index ? cur : generateSystem(this.ctx.seed, G, index, 0);
    } catch {
      sys = null;
    }
    return {
      index,
      id: st.id,
      name: st.name,
      class: st.cls,
      temperature: st.temperature,
      color: st.color,
      binary: st.binary,
      position: st.pos,
      distance: lyBetween(st.pos, cur.galacticPosition),
      planets: sys ? sys.planets.map((p) => ({ name: p.name, biome: p.biome, type: p.type, rings: !!p.rings, moons: p.moons.length })) : [],
      belt: !!sys?.belts.length,
      station: !!sys?.anchors.length,
      current: index === cur.index,
    };
  },

  /** Troca o planeta atual (o mundo é recentrado nele). */
  enterPlanet(k) {
    const ctx = this.ctx;
    const sys = this.sys;
    const target = sys.planets[k];
    if (!target || !target.landable || k === sys.currentPlanetIndex) return false;
    const offset = new WorldPos().copy(target.position);
    recenter(sys, k);
    ctx.bus.emit('space:recenter', { offset });
    this.bodies.build(sys);
    this.asteroids.setSystem(sys);
    if (this.station) this.station.handle.worldPos.copy(this.station.anchor.position);
    ctx.bus.emit('planet:enter', { planet: target });
    return true;
  },

  /** Salto entre sistemas com túnel (o sistema novo nasce durante o túnel). */
  warpTo(target, planetIndex = 0, opts = {}) {
    const ctx = this.ctx;
    const G = this.galaxy;
    let index;
    if (typeof target === 'number') index = target;
    else {
      const m = /s(\d+)/.exec(String(target));
      index = m ? Number(m[1]) : 0;
    }
    index = G.resolve(index);
    const tunnel = opts.tunnel ?? !ctx.shot;
    if (!tunnel) {
      this.enter(index, planetIndex);
      this.placeArrival();
      return Promise.resolve(this.sys);
    }
    if (this.warpState) return this.warpState.promise;
    const st = G.star(index);
    this.warp.setColor(st.color);
    let resolveFn;
    const promise = new Promise((r) => (resolveFn = r));
    // exposição fixa durante o túnel (a automática mede o espaço escuro antes do salto)
    const rs = ctx.services.render;
    const prevExp = rs ? { auto: rs.autoExposure, exp: rs.exposure } : null;
    if (rs) {
      rs.autoExposure = false;
      rs.setExposure?.(1.0);
    }
    this.warpState = { index, planetIndex, t: 0, entered: false, promise, resolve: resolveFn, held: 0, prevExp };
    this.warp.active = true;
    this.warp.phase = 0;
    ctx.bus.emit('universe:warp', { phase: 'start', target: index });
    ctx.services.audio?.play?.('warp', null, { volume: 0.9 });
    return promise;
  },

  /** Posiciona a nave na chegada: em órbita alta do planeta, olhando para ele. */
  placeArrival() {
    const ctx = this.ctx;
    const p = this.sys.planets[this.sys.currentPlanetIndex];
    const star = this.sys.stars[0].position;
    const s = _v.set(star.x, star.y, star.z).normalize();
    const side = _v2.set(-s.z, 0.25, s.x).normalize();
    const dir = new THREE.Vector3().copy(s).multiplyScalar(0.55).add(side).normalize();
    const R = p.radius;
    const wp = new WorldPos().copy(dir).multiplyScalar(R * 3.1);
    const player = ctx.player;
    player.place({ mode: 'space', worldPos: wp });
    player.worldPos.copy(wp);
    const fwd = new THREE.Vector3().copy(dir).negate().addScaledVector(side, 0.35).normalize();
    quatFromForwardUp(fwd, new THREE.Vector3(0, 1, 0), player.quaternion);
    player.velocity.set(0, 0, 0);
    player.snap();
  },

  updateWarp(dt) {
    const W = this.warpState;
    const ctx = this.ctx;
    if (!W) return;
    W.t += dt;
    const tunnel = this.warp;
    tunnel.time += dt;
    // carga 1,0 s → túnel ≥ 3,5 s (espera o planeta novo, até +6 s) → saída 1,2 s
    let ph;
    if (W.t < 1.0) ph = (W.t / 1.0) * 0.16;
    else if (!W.entered || W.t < 4.5 || (W.held < 6 && (ctx.workers.busy || ctx.ready.count))) {
      ph = 0.16 + Math.min(1, (W.t - 1.0) / 3.5) * 0.64;
      if (W.t >= 4.5) W.held += dt;
    } else {
      W.exitT = (W.exitT ?? 0) + dt;
      ph = 0.8 + Math.min(1, W.exitT / 1.2) * 0.2;
    }
    if (!W.entered && W.t > 1.4) {
      W.entered = true;
      try {
        this.enter(W.index, W.planetIndex);
        this.placeArrival();
      } catch (err) {
        ctx.report('universe', 'warp', err);
      }
      ctx.bus.emit('universe:warp', { phase: 'arrive', target: W.index });
    }
    tunnel.phase = ph;
    if (ph >= 1) {
      tunnel.active = false;
      const rs = ctx.services.render;
      if (rs && W.prevExp) {
        rs.autoExposure = W.prevExp.auto;
        if (W.prevExp.exp) rs.setExposure?.(W.prevExp.exp);
      }
      this.warpState = null;
      ctx.bus.emit('universe:warp', { phase: 'end', target: W.index });
      W.resolve(this.sys);
    }
  },

  /** Troca automática do planeta atual ao se aproximar de outro (nave/espaço). */
  autoPlanet() {
    const ctx = this.ctx;
    const p = ctx.player;
    if (p.mode === 'walk' || this.warpState || ctx.shot) return;
    const sys = this.sys;
    const cur = sys.planets[sys.currentPlanetIndex];
    const c = p.worldPos;
    const dCur = Math.hypot(c.x - cur.position.x, c.y - cur.position.y, c.z - cur.position.z) / cur.radius;
    let best = -1;
    let bd = Math.min(dCur, 4);
    sys.planets.forEach((pl, k) => {
      if (!pl.landable || pl === cur) return;
      const d = Math.hypot(c.x - pl.position.x, c.y - pl.position.y, c.z - pl.position.z) / pl.radius;
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    if (best >= 0) this.enterPlanet(best);
  },

  update(dt, ctx) {
    // pose de câmera dos presets do universo (o jogador fica congelado no modo shot)
    const pc = ctx.shot?.preset?.params?.uniCam;
    if (pc) this.applyShotCam(pc);
  },

  applyShotCam(pc) {
    const ctx = this.ctx;
    const b = this.findBody(pc.body || 'planet');
    if (!b) return;
    const sky = ctx.services.sky;
    const sun = sky?.sunDirection || _v.set(1, 0, 0);
    const R = b.radius || 1000;
    const dist = pc.distM ?? R * (pc.dist ?? 4);
    // referencial: x = direção do sol projetada no plano horizontal, y = +Y
    const sx = new THREE.Vector3(sun.x, 0, sun.z).normalize();
    const sz = new THREE.Vector3().crossVectors(sx, new THREE.Vector3(0, 1, 0));
    const az = ((pc.az ?? 30) * Math.PI) / 180;
    const el = ((pc.el ?? 10) * Math.PI) / 180;
    const dir = new THREE.Vector3()
      .addScaledVector(sx, Math.cos(el) * Math.cos(az))
      .addScaledVector(sz, Math.cos(el) * Math.sin(az))
      .addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(el));
    const bp = b.position;
    const player = ctx.player;
    if (player.mode !== 'space') player.setMode('space');
    player.worldPos.set(bp.x + dir.x * dist, bp.y + dir.y * dist, bp.z + dir.z * dist);
    const lb = this.findBody(pc.look || pc.body) || b;
    const fwd = new THREE.Vector3(lb.position.x - player.worldPos.x, lb.position.y - player.worldPos.y, lb.position.z - player.worldPos.z).normalize();
    quatFromForwardUp(fwd, new THREE.Vector3(0, 1, 0), player.quaternion);
    if (pc.yaw) player.quaternion.multiply(_q.setFromAxisAngle(_v2.set(0, 1, 0), (pc.yaw * Math.PI) / 180));
    if (pc.pitch) player.quaternion.multiply(_q.setFromAxisAngle(_v2.set(1, 0, 0), (pc.pitch * Math.PI) / 180));
    if (pc.roll) player.quaternion.multiply(_q.setFromAxisAngle(_v2.set(0, 0, 1), (pc.roll * Math.PI) / 180));
    if (pc.fov) player.fov = pc.fov;
    player.velocity.set(0, 0, 0);
    player.snap();
  },

  frame(dt, ctx) {
    const sys = this.sys;
    // fase de warp congelada para a vitrine
    const pw = ctx.shot?.preset?.params?.uniWarp;
    if (pw != null) {
      if (!this._shotWarp) {
        this._shotWarp = true;
        const nb = this.galaxy.systemsNear(sys.galacticPosition, 120, 8)[3];
        this.warp.setColor(this.galaxy.star(nb ? nb.index : 1).color);
      }
      this.warp.active = true;
      this.warp.phase = pw;
      this.warp.time = pw * 7.3 + 1.7;
    } else this.updateWarp(ctx.time.frameDt || dt);
    this.autoPlanet();

    // altitude da câmera sobre o planeta atual → visibilidade das coisas "do espaço"
    const cur = sys.planets[sys.currentPlanetIndex];
    const o = ctx.space.origin;
    const c = ctx.space.planetCenter;
    const R = ctx.services.planet?.radius || cur.radius;
    const alt = Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z) - R;
    const top = Math.max(1000, (cur.atmosphere?.radius ?? R * 1.1) - R);
    const k = Math.min(1, Math.max(0, (alt - top * 1.05) / (top * 0.6)));
    this.spaceK = k;
    updateLights(ctx, sys.stars, 1);
    const showBodies = k > 0.02 || !ctx.services.sky?.drawsBodies;
    this.bodies.frame(ctx, sys, sys.stars, showBodies);
    this.asteroids.frame(ctx, k > 0.02);
    this.sky.frame(ctx, k * 1.0);
    if (this.station) {
      const st = this.station;
      const d = st.group.position.length();
      st.group.visible = k > 0.02 && d < 3e6;
      const spin = (ctx.time.world * st.anchor.spin) % (Math.PI * 2);
      st.group.quaternion.copy(st.baseQ).multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), spin));
    }
    this.tickBanner(dt);
  },

  // ─── faixa de chegada (HUD leve) ────────────────────────────────────
  makeBanner() {
    const el = document.createElement('div');
    el.className = 'uni-banner';
    el.style.cssText = 'position:absolute;left:50%;top:14%;transform:translateX(-50%);text-align:center;color:#e8f2ff;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;text-shadow:0 0 12px rgba(120,180,255,.8);opacity:0;transition:opacity .8s;pointer-events:none';
    this.ctx.ui.appendChild(el);
    this.banner = { el, t: 0 };
  },
  showBanner() {
    if (!this.banner || !this.sys) return;
    const s = this.sys;
    const st = s.stars[0];
    this.banner.el.innerHTML = `<div style="font-size:26px;letter-spacing:.18em">${s.name}</div><div style="opacity:.75">classe ${st.class}${s.binary ? ' · binária' : ''} · ${s.planets.length} planetas${s.belts.length ? ' · cinturão' : ''}</div>`;
    this.banner.t = 6;
  },
  tickBanner(dt) {
    const b = this.banner;
    if (!b) return;
    if (b.t > 0 && !this.warpState) {
      b.t -= dt;
      b.el.style.opacity = b.t > 0.8 ? '1' : '0';
    } else b.el.style.opacity = '0';
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    this.bodies?.dispose();
    this.asteroids?.dispose();
    this.sky?.dispose();
    this.warp?.dispose();
    if (this.station) {
      this.station.handle.remove();
      ctx.scene.remove(this.station.group);
      this.station.group.userData.dispose?.();
    }
    this.banner?.el.remove();
  },
};

void mulberry;
