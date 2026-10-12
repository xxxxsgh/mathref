/**
 * CLIMA do EXOSFERA — publica o serviço `weather` (CONTRACT.md §13).
 *
 *   states.js     estados (limpo, nublado, tempestade, ácida, nevasca, poeira,
 *                 calor) como vetores de parâmetros + ciclos por bioma
 *   particles.js  precipitação instanciada na GPU ancorada na câmera
 *   lightning.js  raios procedurais, clarão e luz de clarão
 *   lens.js       gotas/geada/poeira/calor no visor (afterCockpit)
 *
 * As NUVENS (feature `clouds`) leem `weather.cloud`, `weather.fog` e
 * `weather.lightning` — a tempestade escurece e engrossa as nuvens, a
 * neblina engole o horizonte e o relâmpago acende as nuvens por dentro.
 * Transições são interpolações de todos os parâmetros (padrão 12 s); no
 * modo shot a troca é instantânea.
 *
 * API (além do contrato: weather, cloudCoverage, intensity, wind, set):
 *   state          nome do estado-alvo; `blend` 0..1 da transição
 *   precipitation  'rain' | 'acid' | 'snow' | 'dust' | null
 *   levels         { rain, acid, snow, dust } intensidades atuais
 *   cloud          { coverage, typeBias, storm, darkness, detail, cirrus }
 *   fog            { density (1/m), height (m), color [r,g,b] radiância, maxDist }
 *   lightning      { flash 0..1, worldPos, color } (relâmpago atual)
 *   wetness        0..1 (superfícies molhadas — opcional para planet/flora)
 *   strike(worldPos?)  dispara um relâmpago (depuração)
 *   auto           ciclo automático por bioma (fora do modo shot)
 * Eventos: weather:change { weather, prev }, weather:lightning { worldPos, distance }.
 *
 * Parâmetros de preset: weatherBolt { az, dist, flash } (raio fixo no quadro),
 * weatherAuto (bool), weatherIntensity (0..1).
 */
import * as THREE from 'three';
import { STATES, KIND, BIOME_COVER, BIOME_CYCLE, resolveState, lerpState, copyState } from './states.js';
import { Precipitation } from './particles.js';
import { Lightning } from './lightning.js';
import { LensPass } from './lens.js';

const KINDS = ['rain', 'acid', 'snow', 'dust'];

export default {
  name: 'weather',
  order: 20,

  async init(ctx) {
    const P = ctx.shot?.preset?.params || {};
    this.P = P;
    this.ctx = ctx;
    const rnd = ctx.seed.derive('weather', 'cycle', ctx.start.galaxy, ctx.start.systemIndex, ctx.start.planetIndex);
    this.rnd = rnd;
    this.precip = new Precipitation(ctx, ctx.quality.particleBudget ?? 1);
    this.lightning = new Lightning(ctx);
    this.precip.scene.add(this.lightning.group);
    this.lens = new LensPass(ctx);
    this.removeParticles = ctx.pipeline.addPass('afterWorld', (c, target) => this.renderParticles(target), { order: 14, owner: 'weather' });
    this.removeLens = ctx.pipeline.addPass('afterCockpit', (c, target) => this.lens.render(target), { order: 5, owner: 'weather' });

    const env = this.envInfo(ctx);
    const S = (this.S = {
      name: 'clear',
      prev: 'clear',
      from: resolveState('clear', env),
      to: resolveState('clear', env),
      cur: resolveState('clear', env),
      t: 1,
      dur: 12,
      levels: { rain: 0, acid: 0, snow: 0, dust: 0 },
      kind: null,
      nextChange: 90 + rnd.range(0, 120),
      nextStrike: 3,
      boltPlaced: false,
      env,
      windAngle: rnd.range(0, Math.PI * 2),
      frame: null,
      frameAnchor: null,
    });
    this.auto = !ctx.shot && P.weatherAuto !== false && ctx.params.get('weatherAuto') !== '0';

    const self = this;
    const wind = new THREE.Vector3(6, 0, 2);
    const cloud = { coverage: env.cover, typeBias: 0, storm: 0, darkness: 0, detail: 0.45, cirrus: 0.75, density: 1 };
    const fog = { density: 0, height: 1200, color: [0.5, 0.5, 0.5], maxDist: 60000 };
    const lightning = {
      get flash() {
        return self.lightning.flash;
      },
      get worldPos() {
        return self.lightning.strike ? self.lightning.worldPos : null;
      },
      color: self.lightning.color,
    };
    this.pub = { wind, cloud, fog };
    const api = {
      get weather() {
        return S.name;
      },
      get state() {
        return S.name;
      },
      get blend() {
        return S.t;
      },
      get cloudCoverage() {
        return cloud.coverage;
      },
      get intensity() {
        return Math.max(S.levels.rain, S.levels.acid, S.levels.snow, S.levels.dust);
      },
      get precipitation() {
        return S.kind;
      },
      get levels() {
        return S.levels;
      },
      get wetness() {
        return Math.min(1, S.levels.rain + S.levels.acid);
      },
      wind,
      cloud,
      fog,
      lightning,
      get auto() {
        return self.auto;
      },
      set auto(v) {
        self.auto = !!v;
      },
      set(name, { transition } = {}) {
        self.setWeather(ctx, name, transition);
      },
      strike(worldPos) {
        self.randomStrike(ctx, worldPos);
      },
      /** internos (depuração) */
      get _internal() {
        return self;
      },
    };
    this.api = ctx.provide('weather', api);
    this.offs = [
      ctx.bus.on('planet:enter', () => {
        S.env = this.envInfo(ctx);
        this.setWeather(ctx, 'clear', 0);
      }),
      ctx.bus.on('system:enter', () => {
        S.env = this.envInfo(ctx);
        this.setWeather(ctx, 'clear', 0);
      }),
    ];
    // início fora do modo shot: um estado do ciclo do bioma
    if (!ctx.shot && this.auto) this.setWeather(ctx, this.pickCycle(), 0);
  },

  /** Bioma, temperatura, cobertura base e cor de poeira do planeta atual. */
  envInfo(ctx) {
    const P = this.P;
    const info = ctx.services.universe?.currentPlanet;
    const planet = ctx.services.planet;
    const biome = P.biome || P.atmoBiome || info?.biome || 'lush';
    let temperature = 15;
    try {
      const up = new THREE.Vector3().copy(ctx.player.worldPos).sub(ctx.space.planetCenter).normalize();
      temperature = planet?.biomeAt?.(up)?.temperature ?? temperature;
    } catch {
      /* planet sem biomeAt */
    }
    if (biome === 'frozen') temperature = Math.min(temperature, -10);
    const seedJit = ((info?.seed ?? 7) % 1000) / 1000 - 0.5;
    const cover = Math.min(0.85, Math.max(0.08, (BIOME_COVER[biome] ?? 0.45) + seedJit * 0.16));
    const sand = planet?.palette?.sand || [0.6, 0.45, 0.28];
    const m = Math.max(sand[0], sand[1], sand[2], 1e-3);
    const dustTint = [sand[0] / m, sand[1] / m, sand[2] / m].map((v) => 0.25 + 0.75 * v);
    return { biome, temperature, cover, dustTint };
  },

  pickCycle() {
    const cyc = BIOME_CYCLE[this.S.env.biome] || BIOME_CYCLE.lush;
    return this.rnd.weighted(cyc);
  },

  /** Precipitação real de um estado neste planeta (tempestade fria = neve, tóxica = ácida). */
  kindFor(name) {
    const env = this.S.env;
    let k = KIND[name] ?? null;
    if (k === 'rain' && env.temperature < -2) k = 'snow';
    if (k === 'rain' && (env.biome === 'toxic' || env.biome === 'radioactive')) k = 'acid';
    return k;
  },

  setWeather(ctx, name, transition) {
    if (!STATES[name]) name = 'clear';
    const S = this.S;
    const prev = S.name;
    S.from = copyState(S.cur);
    S.to = resolveState(name, S.env);
    // tempestade em mundo tóxico ganha a neblina/tinta ácida
    const k = this.kindFor(name);
    if (name === 'storm' && k === 'acid') S.to = resolveState('acid', S.env);
    if (name === 'storm' && k === 'snow') S.to = resolveState('blizzard', S.env);
    const inten = this.P.weatherIntensity;
    if (typeof inten === 'number') S.to.precip *= inten;
    S.name = name;
    S.kind = k;
    S.t = 0;
    S.dur = ctx.shot ? 0 : (transition ?? 12);
    if (S.dur <= 0) {
      S.t = 1;
      S.cur = copyState(S.to);
      for (const kk of KINDS) S.levels[kk] = kk === k ? S.to.precip : 0;
    }
    if (prev !== name) ctx.bus.emit('weather:change', { weather: name, prev });
  },

  /** Relâmpago num ponto aleatório (2–14 km) ou dado. */
  randomStrike(ctx, worldPos = null, hold = null) {
    const planet = ctx.services.planet;
    const clouds = ctx.services.clouds;
    const c = ctx.space.planetCenter;
    const o = ctx.space.origin;
    let ground;
    if (worldPos) ground = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    else {
      const up = new THREE.Vector3(o.x - c.x, o.y - c.y, o.z - c.z).normalize();
      const t = new THREE.Vector3(0, 1, 0).cross(up).normalize();
      if (!Number.isFinite(t.x)) t.set(1, 0, 0);
      const b = up.clone().cross(t);
      const a = this.rnd.range(0, Math.PI * 2);
      const d = this.rnd.range(2000, 14000);
      const R = planet?.radius || 120000;
      const dir = up.clone().multiplyScalar(R).addScaledVector(t, Math.cos(a) * d).addScaledVector(b, Math.sin(a) * d).normalize();
      const h = planet?.heightAt?.(dir) ?? 0;
      ground = dir.multiplyScalar(R + Math.max(h, planet?.seaLevel ?? -1e9)).add(c);
    }
    const R = planet?.radius || 120000;
    const lay = clouds?.layer || { bottom: 2100 };
    const sea = Math.max(0, planet?.seaLevel ?? 0);
    const gr = Math.hypot(ground.x - c.x, ground.y - c.y, ground.z - c.z);
    const topR = R + sea + lay.bottom + 500;
    const k = topR / gr;
    const top = new THREE.Vector3((ground.x - c.x) * k + c.x, (ground.y - c.y) * k + c.y, (ground.z - c.z) * k + c.z);
    // leve inclinação do canal
    top.x += this.rnd.range(-600, 600);
    top.z += this.rnd.range(-600, 600);
    this.lightning.strikeAt(ground, top, this.rnd.u32(), hold);
    const dist = Math.hypot(ground.x - o.x, ground.y - o.y, ground.z - o.z);
    ctx.bus.emit('weather:lightning', { worldPos: ground, distance: dist });
    ctx.services.audio?.play?.('thunder', ground, { volume: Math.min(1, 4000 / Math.max(500, dist)) });
  },

  /** Raio fixo do preset (modo shot), no rumo da câmera + az. */
  placeShotBolt(ctx, cfg) {
    const planet = ctx.services.planet;
    const c = ctx.space.planetCenter;
    const o = ctx.player.cameraWorld || ctx.space.origin;
    const up = new THREE.Vector3(o.x - c.x, o.y - c.y, o.z - c.z).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.player.cameraQuat || ctx.camera.quaternion);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    fwd.applyAxisAngle(up, (-(cfg.az ?? 0) * Math.PI) / 180);
    const R = planet?.radius || 120000;
    const dist = cfg.dist ?? 5000;
    const dir = up.clone().multiplyScalar(R).addScaledVector(fwd, dist).normalize();
    const h = planet?.heightAt?.(dir) ?? 0;
    const ground = dir.multiplyScalar(R + Math.max(h, planet?.seaLevel ?? -1e9)).add(c);
    this.randomStrike(ctx, ground, cfg.flash ?? 1);
  },

  frame(dt, ctx) {
    const S = this.S;
    const { space, player } = ctx;
    const sky = ctx.services.sky;
    const tWorld = ctx.time.world || 0;
    const live = !ctx.time.frozen;
    const d = live ? Math.min(0.25, Math.max(0, dt)) : 0;

    // ─── transição ────────────────────────────────────────────────────
    if (S.t < 1) {
      S.t = Math.min(1, S.t + d / Math.max(0.01, S.dur));
      const e = S.t * S.t * (3 - 2 * S.t);
      lerpState(S.cur, S.from, S.to, e);
    }
    for (const k of KINDS) {
      const target = k === S.kind ? S.to.precip : 0;
      const rate = d / Math.max(2, S.dur * 0.6);
      if (S.dur <= 0 || !live) S.levels[k] = S.t >= 1 ? target : S.levels[k];
      else S.levels[k] += Math.max(-rate, Math.min(rate, target - S.levels[k]));
    }
    // ciclo automático
    if (this.auto && live) {
      S.nextChange -= d;
      if (S.nextChange <= 0) {
        const next = this.pickCycle();
        this.setWeather(ctx, next, 18);
        S.nextChange = next === 'clear' ? this.rnd.range(160, 360) : this.rnd.range(90, 220);
      }
    }
    const cur = S.cur;

    // ─── publicação para as nuvens ────────────────────────────────────
    const pub = this.pub;
    Object.assign(pub.cloud, { coverage: cur.coverage, typeBias: cur.typeBias, storm: cur.storm, darkness: cur.darkness, detail: cur.detail, cirrus: cur.cirrus, density: 1 });

    // vento: direção que gira devagar, rajadas leves
    S.windAngle += d * 0.004;
    const gust = 1 + 0.25 * Math.sin(tWorld * 0.37) * Math.sin(tWorld * 0.11 + 1.3);
    const ws = cur.wind * gust;
    pub.wind.set(Math.cos(S.windAngle) * ws, 0, Math.sin(S.windAngle) * ws);

    // ─── triedo local e câmera (double) ───────────────────────────────
    const c = space.planetCenter;
    const o = space.origin;
    const rx = o.x - c.x;
    const ry = o.y - c.y;
    const rz = o.z - c.z;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const up = (S._up ||= new THREE.Vector3()).set(rx / rl, ry / rl, rz / rl);
    // o triedo da caixa de partículas é refeito só depois de 4 km (sem saltos)
    if (!S.frame || !S.frameAnchor || Math.hypot(o.x - S.frameAnchor.x, o.y - S.frameAnchor.y, o.z - S.frameAnchor.z) > 4000) {
      const east = new THREE.Vector3(0, 1, 0).cross(up);
      if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
      east.normalize();
      const north = up.clone().cross(east).normalize();
      S.frame = { east, up: up.clone(), north };
      S.frameAnchor = { x: o.x, y: o.y, z: o.z };
    }
    const F = S.frame;
    const camLocal = (S._cl ||= new THREE.Vector3()).set(rx * F.east.x + ry * F.east.y + rz * F.east.z, rx * F.up.x + ry * F.up.y + rz * F.up.z, rx * F.north.x + ry * F.north.y + rz * F.north.z);
    const v = player.velocity || new THREE.Vector3();
    const camVel = (S._cv ||= new THREE.Vector3()).set(v.dot(F.east), v.dot(F.up), v.dot(F.north));
    const windLocal = (S._wl ||= new THREE.Vector3()).set(pub.wind.x, 0, pub.wind.z);

    // ─── luz para partículas/neblina ──────────────────────────────────
    const amb = sky?.ambient;
    const ai = (amb?.intensity ?? 0.5) / Math.PI;
    const ac = amb?.color || { r: 0.6, g: 0.7, b: 0.9 };
    const sc = sky?.sunColor || { r: 1, g: 1, b: 1 };
    const si = sky?.sunIntensity ?? 3;
    const sd = sky?.sunDirection || up;
    const cosS = Math.max(0, sd.dot(up));
    const sunK = si * (1 - 0.8 * cur.darkness) * Math.min(1, cosS * 4);
    const ambC = [ac.r * ai, ac.g * ai, ac.b * ai];
    const sunC = [sc.r * sunK, sc.g * sunK, sc.b * sunK];
    const flash = this.lightning.flash;
    const fl = flash * 2.5;
    const light = (k1, k2) => [0, 1, 2].map((i) => ambC[i] * k1 + (sunC[i] * k2) / Math.PI + fl * 0.3);

    // neblina: luz do céu difusa + um pouco do sol, tingida pelo estado
    const fogL = light(0.95 * (1 - 0.45 * cur.darkness), 0.35);
    pub.fog.density = cur.fog;
    pub.fog.height = cur.fogH;
    pub.fog.color = fogL.map((x, i) => x * cur.fogTint[i]);
    pub.fog.maxDist = 80000;

    // ─── partículas ───────────────────────────────────────────────────
    const colors = (S._col ||= { rain: new THREE.Color(), acid: new THREE.Color(), snow: new THREE.Color(), dust: new THREE.Color() });
    // gotas: refletem/refratam o céu → um pouco mais claras que a neblina
    const lr = light(2.2, 0.3);
    colors.rain.setRGB(lr[0] * 0.85, lr[1] * 0.9, lr[2]);
    colors.acid.setRGB(lr[0] * 0.9, lr[1] * 1.1, lr[2] * 0.45);
    const ls = light(1.15, 0.55);
    colors.snow.setRGB(ls[0], ls[1], ls[2] * 1.05);
    const ld = light(0.9, 0.5);
    const dt2 = S.env.dustTint;
    colors.dust.setRGB(ld[0] * dt2[0], ld[1] * dt2[1], ld[2] * dt2[2]);
    // muito alto (acima da camada) não chove na câmera
    const altFade = 1 - Math.min(1, Math.max(0, ((player.altitude ?? 0) - 1800) / 1200));
    const levels = (S._lv ||= {});
    for (const k of KINDS) levels[k] = S.levels[k] * altFade;
    this.particlesOn = this.precip.update({ time: tWorld, levels, frame: F, camLocal, camVel, wind: windLocal, colors, viewH: ctx.pipeline.height || 540 });

    // ─── relâmpagos ───────────────────────────────────────────────────
    const bolt = this.P.weatherBolt;
    if (ctx.shot && bolt && !S.boltPlaced && ctx.services.planet) {
      S.boltPlaced = true;
      this.placeShotBolt(ctx, bolt);
    } else if (live && cur.lightning > 0.001) {
      S.nextStrike -= d;
      if (S.nextStrike <= 0) {
        this.randomStrike(ctx);
        S.nextStrike = -Math.log(Math.max(1e-4, this.rnd.next())) / cur.lightning;
      }
    }
    this.lightning.update(live ? d : 0, ctx);
    this.particlesOn = this.particlesOn || this.lightning.mesh.visible;

    // ─── visor ────────────────────────────────────────────────────────
    const firstPerson = player.view !== 'third' && (player.mode === 'walk' || ctx.cockpit?.visible);
    const lu = this.lens.u;
    const lk = cur.lens * (firstPerson ? 1 : 0) * altFade;
    lu.uRain.value = S.levels.rain * lk;
    lu.uAcid.value = S.levels.acid * lk;
    lu.uSnow.value = S.levels.snow * lk * 0.85;
    lu.uDust.value = S.levels.dust * lk * 0.8;
    lu.uHeat.value = cur.heat * (firstPerson ? 1 : 0.6);
    lu.uTime.value = tWorld;
    lu.uDustTint.value.set(dt2[0], dt2[1], dt2[2]);
    const lw = light(1, 0.4);
    lu.uLight.value.set(lw[0], lw[1], lw[2]);
    this.lens.active = lu.uRain.value + lu.uAcid.value + lu.uSnow.value + lu.uDust.value + lu.uHeat.value > 0.01;
  },

  /** afterWorld (depois das nuvens): precipitação e raios com o depth do mundo. */
  renderParticles(target) {
    if (!this.particlesOn || !target) return;
    const r = this.ctx.renderer;
    const prevT = r.getRenderTarget();
    const prevClear = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    this.precip.render(r, this.ctx.camera);
    r.setRenderTarget(prevT);
    r.autoClear = prevClear;
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    this.removeParticles?.();
    this.removeLens?.();
    this.precip?.dispose();
    this.lightning?.dispose();
    this.lens?.dispose();
    void ctx;
  },
};
