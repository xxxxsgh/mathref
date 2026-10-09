/**
 * ATMOSFERA E CÉU do EXOSFERA — publica o serviço `sky` (CONTRACT.md §13).
 *
 * Modelo físico (Hillaire 2020): Rayleigh + Mie + camada de absorção tipo
 * ozônio, com LUTs na GPU (transmitância, multiespalhamento, sky-view e
 * perspectiva aérea em froxels). Funciona de DENTRO (céu) e de FORA (limbo
 * visto da órbita) com o mesmo modelo — a troca de caminho é contínua.
 *
 *   params.js  atmosfera por planeta, derivada da SEED e do BIOMA (céus
 *              verde-tóxico, rosa, âmbar...), + integrais em JS para as luzes
 *   glsl.js    funções compartilhadas (meio, fases, LUTs, integração)
 *   luts.js    transmitância 256×64, multiespalhamento 32×32, sky-view
 *              256×128, froxels 32³ (atlas MRT)
 *   dome.js    o céu: espalhamento, sóis com limbo e halo, estrelas,
 *              via láctea/nebulosa da galáxia, luas/planetas com fase,
 *              limbo atmosférico e anéis, aurora
 *   aerial.js  perspectiva aérea aplicada ao mundo (afterWorld)
 *   env.js     IBL (PMREM) com orçamento → sky.envMap / scene.environment
 *
 * Hora do dia: a rotação do céu em torno do eixo +Y do planeta (o mundo é
 * fixo no planeta). Estrelas, sóis e o fundo estelar giram juntos; luas e
 * planetas não (o universe os posiciona no referencial do planeta).
 *
 * Extras publicados além do contrato (opcionais para os outros sistemas):
 *   sky.uniforms / sky.glsl  — uniformes compartilhadas e GLSL da atmosfera
 *                              (nuvens/água podem calcular a mesma física)
 *   sky.luts                 — { transmittance, multiScattering, skyView }
 *   sky.drawsBodies = true   — o céu desenha luas/planetas distantes
 *                              analiticamente (malhas do universe por cima
 *                              continuam corretas: ganham a atmosfera na
 *                              passada de perspectiva aérea)
 *   sky.moonLight / sky.sun2 — luzes direcionais extras (lua à noite, 2º sol)
 *   sky.params               — parâmetros em km (debug)
 * A perspectiva aérea é pós-processo: a neblina da cena (`scene.fog`) fica
 * DESLIGADA para não aplicar duas vezes. `fogAt()` devolve uma aproximação
 * { color, density (1/m, coeficiente de extinção exponencial) }.
 *
 * Parâmetros de preset (preset.params, só para screenshots/depuração):
 *   atmoBiome, atmoDensity, atmoMie, atmoAurora, atmoShape [r,g,b],
 *   atmoCompanion { az, el (graus, relativos ao sol), temperature, intensity, size }
 */
import * as THREE from 'three';
import { tangentFrame, latLonFromDir } from '../../core/Geo.js';
import { kelvinToRGB } from '../../core/placeholder/universeGen.js';
import { deriveAtmosphere, rimColorOf, transmittanceJS, scatterJS, rngFrom } from './params.js';
import { createAtmoUniforms, applyParams, AtmosphereLUTs } from './luts.js';
import { createDome, MAX_BODIES } from './dome.js';
import { AerialPass } from './aerial.js';
import { EnvProbe } from './env.js';
import { ATMO_UNIFORMS_GLSL, ATMO_FUNCS_GLSL, ATMO_LUT_FUNCS_GLSL } from './glsl.js';

const Y = new THREE.Vector3(0, 1, 0);
/** iluminância do sol no topo da atmosfera (unidades do three) por intensidade relativa */
const SUN_E = 3.4;
const DAY_LENGTH = 1440;

/** Albedo base dos corpos por bioma: [cor1, cor2, tipo] (0 rochoso, 1 oceano, 2 gasoso, 3 gelo). */
const BODY_LOOK = {
  lush: [[0.14, 0.3, 0.09], [0.04, 0.13, 0.36], 1],
  ocean: [[0.32, 0.3, 0.18], [0.03, 0.12, 0.4], 1],
  barren: [[0.36, 0.34, 0.31], [0.18, 0.17, 0.16], 0],
  frozen: [[0.72, 0.8, 0.88], [0.4, 0.5, 0.62], 3],
  toxic: [[0.48, 0.55, 0.16], [0.22, 0.32, 0.1], 0],
  scorched: [[0.6, 0.3, 0.12], [0.28, 0.13, 0.07], 0],
  exotic: [[0.58, 0.26, 0.62], [0.18, 0.5, 0.55], 0],
  radioactive: [[0.58, 0.62, 0.2], [0.42, 0.3, 0.1], 0],
  gas: [[0.82, 0.62, 0.42], [0.55, 0.4, 0.33], 2],
};

export default {
  name: 'atmosphere',
  order: 15,

  async init(ctx) {
    const { scene, renderer, space, player } = ctx;
    const presetParams = ctx.shot?.preset?.params || {};
    const urlBiome = ctx.params.get('atmoBiome');

    // ─── estado ───────────────────────────────────────────────────────
    const S = (this.state = {
      p: null,
      rotation: 0,
      stars: [], // { inertial: Vector3, dir: Vector3, color:[3], E: number, ang }
      bodies: [],
      lightsDirty: true,
      envDirty: true,
      envFrame: -1e9,
      envSunDir: new THREE.Vector3(),
      envAlt: -1,
      frame: 0,
      readyDone: null,
      bodyCache: new Map(),
    });

    const uniforms = createAtmoUniforms();
    const luts = new AtmosphereLUTs(renderer, uniforms);
    const dome = createDome(uniforms);
    dome.uniforms.uSkyView.value = luts.sky.texture;
    scene.add(dome.mesh);
    const aerial = new AerialPass(ctx, uniforms, luts);
    const env = new EnvProbe(renderer, uniforms, 32);
    this.parts = { uniforms, luts, dome, aerial, env };

    // luzes
    const sun = new THREE.DirectionalLight(0xffffff, SUN_E);
    sun.name = 'atmosphere:sun';
    sun.castShadow = !!ctx.quality.shadows;
    sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -90;
    sc.right = sc.top = 90;
    sc.near = 1;
    sc.far = 2400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    const sun2 = new THREE.DirectionalLight(0xffffff, 0);
    sun2.name = 'atmosphere:sun2';
    const moonLight = new THREE.DirectionalLight(0xbfd2ff, 0);
    moonLight.name = 'atmosphere:moon';
    const hemi = new THREE.HemisphereLight(0x9ec3ff, 0x202018, 0);
    hemi.name = 'atmosphere:ambient';
    scene.add(sun, sun.target, sun2, sun2.target, moonLight, moonLight.target, hemi);
    this.lights = { sun, sun2, moonLight, hemi };
    if (scene.fog) scene.fog = null;

    const sunDirection = new THREE.Vector3(0, 1, 0);
    const sunColor = new THREE.Color(1, 1, 1);
    const ambient = { color: new THREE.Color(0x9ec3ff), intensity: 0.5 };
    const fogState = { color: new THREE.Color(0.5, 0.6, 0.8), density: 1e-5 };
    let envMap = null;
    let ownsEnvironment = false;

    // ─── sistema / planeta → parâmetros ───────────────────────────────
    const readSystem = () => {
      const uni = ctx.services.universe;
      const sys = uni?.currentSystem;
      const info = uni?.currentPlanet || {};
      const planet = ctx.services.planet;
      const R = planet?.radius || info.radius || 120000;
      const biome = presetParams.atmoBiome || urlBiome || info.biome || 'lush';
      let temperature = null;
      try {
        const up = new THREE.Vector3().copy(player.worldPos).sub(space.planetCenter).normalize();
        temperature = planet?.biomeAt?.(up)?.temperature ?? null;
      } catch {
        /* planet sem biomeAt */
      }
      const overrides = {};
      if (presetParams.atmoBiome || urlBiome) overrides.biome = biome;
      if (presetParams.atmoDensity != null) overrides.density = presetParams.atmoDensity;
      if (presetParams.atmoMie != null) overrides.mie = presetParams.atmoMie;
      if (presetParams.atmoAurora != null) overrides.aurora = presetParams.atmoAurora;
      if (presetParams.atmoShape) overrides.shape = presetParams.atmoShape;
      const p = deriveAtmosphere({
        radius: R,
        atmosphere: info.atmosphere ?? (uni ? null : { radius: R * 1.1 }),
        biome,
        seed: info.seed ?? ctx.seed.hash('galaxy', ctx.start.galaxy, 'system', ctx.start.systemIndex, 'planet', ctx.start.planetIndex),
        temperature,
        overrides,
      });
      // albedo do solo pela paleta do bioma (multiespalhamento e chão do domo)
      const pal = planet?.palette;
      if (pal?.grass && pal?.rock) {
        const avg = [0, 1, 2].map((k) => 0.5 * pal.grass[k] + 0.3 * pal.rock[k] + 0.2 * (pal.sand?.[k] ?? pal.rock[k]));
        p.groundAlbedo = avg.map((v) => Math.min(0.6, Math.max(0.02, v)));
      }
      S.p = p;
      applyParams(uniforms, p);
      luts.renderStatic();

      // estrelas do sistema (posição INERCIAL)
      S.stars = [];
      const c = space.planetCenter;
      for (const st of (sys?.stars || []).slice(0, 2)) {
        const pos = st.position;
        const inertial = new THREE.Vector3(pos.x - c.x, pos.y - c.y, pos.z - c.z);
        const d = inertial.length() || 3e9;
        inertial.divideScalar(d);
        S.stars.push({
          inertial,
          dir: inertial.clone(),
          color: st.color || [1, 1, 1],
          E: SUN_E * (st.intensity ?? 1),
          ang: Math.atan((st.radius || 1.5e7) / d),
          id: st.id,
        });
      }
      if (!S.stars.length) S.stars.push({ inertial: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(1, 0, 0), color: [1, 0.96, 0.9], E: SUN_E, ang: 0.005 });
      // companheira sintética (presets de binária quando o universe só tem uma)
      const comp = presetParams.atmoCompanion;
      if (comp && S.stars.length < 2) {
        const base = S.stars[0];
        const fr = tangentFrame(base.inertial);
        const az = ((comp.az ?? 20) * Math.PI) / 180;
        const el = ((comp.el ?? 4) * Math.PI) / 180;
        const dir = base.inertial
          .clone()
          .multiplyScalar(Math.cos(az) * Math.cos(el))
          .addScaledVector(fr.east, Math.sin(az) * Math.cos(el))
          .addScaledVector(fr.north, Math.sin(el))
          .normalize();
        S.stars.push({
          inertial: dir,
          dir: dir.clone(),
          color: kelvinToRGB(comp.temperature ?? 3600),
          E: SUN_E * (comp.intensity ?? 0.45),
          ang: base.ang * (comp.size ?? 0.7),
          id: 'companion',
        });
      }

      // fundo estelar coerente com a galáxia: paleta da galáxia, plano do sistema
      const gr = rngFrom(ctx.seed.hash('galaxy', ctx.start.galaxy, 'skybox'));
      const sr = rngFrom(ctx.seed.hash('galaxy', ctx.start.galaxy, 'system', sys?.index ?? ctx.start.systemIndex, 'skybox'));
      // paletas de nebulosa curadas (gás ionizado: azul/magenta/ciano/âmbar),
      // escolhidas pela galáxia e levemente variadas por sistema
      const NEB = [
        [[0.12, 0.32, 1.0], [0.9, 0.18, 0.72], [0.15, 0.85, 0.95]],
        [[0.5, 0.18, 1.0], [1.0, 0.3, 0.28], [0.18, 0.5, 1.0]],
        [[0.08, 0.7, 0.92], [0.42, 0.22, 1.0], [1.0, 0.55, 0.22]],
        [[1.0, 0.28, 0.5], [0.25, 0.3, 1.0], [1.0, 0.72, 0.32]],
        [[0.2, 0.9, 0.6], [0.3, 0.35, 1.0], [0.85, 0.25, 0.9]],
      ];
      const nebPal = NEB[Math.floor(gr.next() * NEB.length) % NEB.length];
      const shift = sr.range(-0.04, 0.04);
      const vary = (c) => {
        const col = new THREE.Color(c[0], c[1], c[2]);
        const h = {};
        col.getHSL(h);
        col.setHSL((((h.h + shift) % 1) + 1) % 1, h.s, h.l);
        return new THREE.Vector3(col.r, col.g, col.b);
      };
      const du = dome.uniforms;
      du.uNebA.value.copy(vary(nebPal[0]));
      du.uNebB.value.copy(vary(nebPal[1]));
      du.uNebC.value.copy(vary(nebPal[2]));
      const gn = new THREE.Vector3(sr.range(-1, 1), sr.range(0.4, 1.4), sr.range(-1, 1)).normalize();
      du.uGalN.value.copy(gn);
      du.uNebSeed.value = sr.range(0, 50);
      du.uAurora.value = p.aurora;
      du.uAurLow.value.fromArray(p.auroraLow);
      du.uAurHigh.value.fromArray(p.auroraHigh);
      S.bodyCache.clear();
      S.lightsDirty = true;
      S.envDirty = true;
    };

    // ─── hora do dia ──────────────────────────────────────────────────
    const playerLon = () => {
      const p = player.worldPos;
      const c = space.planetCenter;
      return (latLonFromDir({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }).lon * Math.PI) / 180;
    };
    const inertialLon = () => {
      const d = S.stars[0].inertial;
      return Math.atan2(-d.z, d.x);
    };
    const updateSunDirs = () => {
      for (const st of S.stars) st.dir.copy(st.inertial).applyAxisAngle(Y, S.rotation).normalize();
      sunDirection.copy(S.stars[0].dir);
    };

    readSystem();
    updateSunDirs();
    const offs = [
      ctx.bus.on('system:enter', () => {
        readSystem();
        updateSunDirs();
      }),
      ctx.bus.on('planet:enter', () => {
        readSystem();
        updateSunDirs();
      }),
      ctx.bus.on('service:ready', ({ name }) => {
        if (name === 'planet' || name === 'universe') {
          readSystem();
          updateSunDirs();
        }
      }),
      ctx.bus.on('quality:change', () => {
        S.lightsDirty = true;
      }),
    ];
    this.offs = offs;

    aerial.removePass = ctx.pipeline.addPass('afterWorld', (c, target) => aerial.render(target), { order: 10, owner: 'atmosphere' });

    // pronto só depois do primeiro IBL
    S.readyDone = ctx.ready.busy('atmosfera: IBL');

    // ─── serviço ──────────────────────────────────────────────────────
    const self = this;
    const api = {
      get sunDirection() {
        return sunDirection;
      },
      get sunColor() {
        return sunColor;
      },
      get sunIntensity() {
        return sun.intensity;
      },
      get suns() {
        return S.stars.map((st, i) => ({
          direction: st.dir,
          color: i === 0 ? sunColor : sun2.color,
          intensity: i === 0 ? sun.intensity : sun2.intensity,
        }));
      },
      ambient,
      get envMap() {
        return envMap;
      },
      sun,
      sun2,
      moonLight,
      get rotation() {
        return S.rotation;
      },
      set rotation(v) {
        S.rotation = v;
        updateSunDirs();
        S.lightsDirty = true;
      },
      dayLength: DAY_LENGTH,
      get timeOfDay() {
        const lonS = inertialLon() + S.rotation;
        let t = 0.5 - (lonS - playerLon()) / (Math.PI * 2);
        t -= Math.floor(t);
        return t;
      },
      setTime(t) {
        const lonS = playerLon() + Math.PI * 2 * (0.5 - t);
        S.rotation = lonS - inertialLon();
        updateSunDirs();
        S.lightsDirty = true;
        S.envDirty = true;
        if (!S.readyDone) S.readyDone = ctx.ready.busy('atmosfera: IBL');
        ctx.bus.emit('sky:time', { t });
      },
      fogAt(worldPos) {
        const p = S.p;
        if (!p?.has || !worldPos) return { color: fogState.color, density: 0 };
        const c = space.planetCenter;
        const h = Math.max(0, Math.hypot(worldPos.x - c.x, worldPos.y - c.y, worldPos.z - c.z) / 1000 - p.Rb);
        const dr = Math.exp(-h / p.Hr);
        const dm = Math.exp(-h / p.Hm);
        const ext = [0, 1, 2].map((k) => p.rayleigh[k] * dr + p.mieExt[k] * dm);
        return { color: fogState.color, density: (0.2126 * ext[0] + 0.7152 * ext[1] + 0.0722 * ext[2]) / 1000 };
      },
      get atmosphere() {
        return S.p?.contract || null;
      },
      get params() {
        return S.p;
      },
      drawsBodies: true,
      uniforms,
      glsl: ATMO_UNIFORMS_GLSL + ATMO_FUNCS_GLSL + ATMO_LUT_FUNCS_GLSL,
      luts: { transmittance: luts.trans.texture, multiScattering: luts.ms.texture, skyView: luts.sky.texture },
      /** luminância média estimada da cena (para exposição automática) */
      get luminance() {
        return self.state.sceneLum ?? 0.2;
      },
    };
    this.api = ctx.provide('sky', api);
    this._env = {
      get envMap() {
        return envMap;
      },
      set envMap(v) {
        envMap = v;
      },
      get owns() {
        return ownsEnvironment;
      },
      set owns(v) {
        ownsEnvironment = v;
      },
    };
    this._shared = { sunDirection, sunColor, ambient, fogState, updateSunDirs };
  },

  frame(dt, ctx) {
    const S = this.state;
    const { uniforms, luts, dome, aerial, env } = this.parts;
    const { sun, sun2, moonLight, hemi } = this.lights;
    const { sunDirection, sunColor, ambient, fogState, updateSunDirs } = this._shared;
    const { space, player, camera, scene } = ctx;
    const p = S.p;
    S.frame++;

    if (!ctx.time.frozen && dt > 0) {
      S.rotation += (dt * Math.PI * 2) / DAY_LENGTH;
      S.lightsDirty = S.lightsDirty || S.frame % 4 === 0;
    }
    updateSunDirs();

    // câmera em km relativa ao centro do planeta
    const c = space.planetCenter;
    const o = space.origin;
    const cam = (S._cam ||= new THREE.Vector3());
    cam.set((o.x - c.x) / 1000, (o.y - c.y) / 1000, (o.z - c.z) / 1000);
    let rl = cam.length();
    if (rl < p.Rb + 0.0005) {
      cam.multiplyScalar((p.Rb + 0.0005) / Math.max(rl, 1e-6));
      rl = p.Rb + 0.0005;
    }
    const up = (S._up ||= new THREE.Vector3()).copy(cam).divideScalar(rl);
    const fr = tangentFrame(up, (S._fr ||= { east: new THREE.Vector3(), north: new THREE.Vector3(), up: new THREE.Vector3() }));
    const inside = rl < p.Rt - 0.002;

    // ─── luzes da atmosfera (uniformes) ──────────────────────────────
    const uL = uniforms.uLightDir.value;
    const uE = uniforms.uLightE.value;
    const du = dome.uniforms;
    for (let i = 0; i < 2; i++) {
      const st = S.stars[i];
      if (st) {
        uL[i].copy(st.dir);
        uE[i].set(st.color[0] * st.E, st.color[1] * st.E, st.color[2] * st.E);
        du.uStarE.value[i].copy(uE[i]);
        du.uStarAng.value[i] = st.ang;
        du.uStarTint.value[i].set(st.color[0], st.color[1], st.color[2]);
      } else {
        uE[i].set(0, 0, 0);
        du.uStarE.value[i].set(0, 0, 0);
        du.uStarAng.value[i] = 0;
      }
    }

    // ─── corpos celestes (luas/planetas) ──────────────────────────────
    this.updateBodies(ctx, o);
    // lua dominante = luz noturna (3ª luz da atmosfera)
    let moon = null;
    for (const b of S.bodies) if (!moon || b.weight > moon.weight) moon = b;
    if (moon && moon.weight > 0.02 && p.has) {
      const phase = (1 - moon.dir.dot(sunDirection)) / 2;
      const k = 0.2 * phase * Math.min(1, moon.weight);
      uL[2].copy(moon.dir);
      uE[2].set(0.8 * k * S.stars[0].E, 0.88 * k * S.stars[0].E, 1.0 * k * S.stars[0].E);
    } else uE[2].set(0, 0, 0);

    // ─── uniformes do domo ────────────────────────────────────────────
    du.uCamPos.value.copy(cam);
    du.uUp.value.copy(up);
    du.uEast.value.copy(fr.east);
    du.uNorth.value.copy(fr.north);
    du.uInside.value = inside ? 1 : 0;
    // nebulosa mais viva no espaço; no chão à noite, mais contida
    const tAlt = Math.min(1, Math.max(0, (rl - p.Rb) / Math.max(1e-3, p.Rt - p.Rb)));
    du.uNebGain.value = 0.6 + 1.6 * tAlt * tAlt;
    const steps = Math.max(8, Math.min(32, ctx.quality.atmosphereSamples || 16));
    du.uSteps.value = steps + 4;
    const H = ctx.pipeline.height || renderer_h(ctx);
    du.uPixelAngle.value = ((camera.fov * Math.PI) / 180) / Math.max(1, H);
    du.uTime.value = ctx.time.world;
    const rot = (S._rotM ||= new THREE.Matrix4()).makeRotationY(-S.rotation);
    du.uToInertial.value.setFromMatrix4(rot);

    // ─── sky-view LUT (dentro) ────────────────────────────────────────
    luts.skyU.uCamPos.value.copy(cam);
    luts.skyU.uUp.value.copy(up);
    luts.skyU.uEast.value.copy(fr.east);
    luts.skyU.uNorth.value.copy(fr.north);
    luts.skyU.uSteps.value = 30;
    if (inside) luts.renderSkyView();

    // ─── perspectiva aérea: frustum da câmera ─────────────────────────
    const apMax = Math.max(20, Math.min(160, Math.sqrt(Math.max(1, p.Rt * p.Rt - p.Rb * p.Rb)) * 1.6));
    luts.apU.uAPMax.value = apMax;
    this.frustumCorners(camera, luts.apU);
    aerial.u.uInside.value = inside ? 1 : 0;
    aerial.u.uSteps.value = steps;
    aerial.u.uNear.value = camera.near;
    aerial.u.uFar.value = camera.far;
    aerial.enabled = p.has && ctx.params.get('atmoAP') !== '0';

    // ─── luzes da cena (CPU) ──────────────────────────────────────────
    if (S.lightsDirty) {
      S.lightsDirty = false;
      this.updateSceneLights(ctx, cam, rl, inside);
    }

    // sombra: caixa ortográfica no chão sob a câmera (espaço de render)
    const planet = ctx.services.planet;
    const R = planet?.radius || p.Rb * 1000;
    const altM = rl * 1000 - R;
    sun.castShadow = !!ctx.quality.shadows && altM < 1500;
    sun.target.position.copy(up).multiplyScalar(-Math.max(0, altM));
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, 1200);
    sun.target.updateMatrixWorld();
    if (S.stars[1]) {
      sun2.target.position.set(0, 0, 0);
      sun2.position.copy(S.stars[1].dir).multiplyScalar(1000);
      sun2.target.updateMatrixWorld();
    }
    if (moon) {
      moonLight.target.position.set(0, 0, 0);
      moonLight.position.copy(moon.dir).multiplyScalar(1000);
      moonLight.target.updateMatrixWorld();
    }

    // placeholder do universe: o céu desenha os corpos (malhas lisas sem fase noturna)
    if (ctx.services.universe?.placeholder) {
      const g = (S._phU ||= scene.getObjectByName('placeholder:universe'));
      if (g) g.visible = false;
    }

    // ─── IBL com orçamento ────────────────────────────────────────────
    const minFrames = ctx.shot ? 1 : 30;
    const sunMoved = S.envSunDir.dot(sunDirection) < Math.cos(0.01);
    const altMoved = S.envAlt < 0 || Math.abs(rl - S.envAlt) / Math.max(1, S.envAlt - p.Rb + 1) > 0.08;
    if ((S.envDirty || sunMoved || altMoved) && S.frame - S.envFrame >= minFrames) {
      S.envDirty = false;
      S.envFrame = S.frame;
      S.envSunDir.copy(sunDirection);
      S.envAlt = rl;
      try {
        const tex = env.update(cam);
        this._env.envMap = tex;
        if (!scene.environment || this._env.owns) {
          scene.environment = tex;
          this._env.owns = true;
        }
      } catch (err) {
        ctx.report('atmosphere', 'env', err);
      }
      if (S.readyDone) {
        S.readyDone();
        S.readyDone = null;
      }
    }
    // com IBL próprio a hemisférica fica desligada (não dobra o ambiente)
    hemi.intensity = this._env.owns && scene.environment === this._env.envMap ? 0 : ambient.intensity;
    if (!this._env.owns || scene.environment !== this._env.envMap) {
      hemi.color.copy(ambient.color);
    }
    void sunColor;
    void fogState;
  },

  /** Raios dos cantos do frustum (mundo), normalizados para profundidade 1 ao longo do eixo. */
  frustumCorners(camera, u) {
    const inv = camera.projectionMatrixInverse;
    const rotM = camera.matrixWorld;
    const v = (this._fv ||= new THREE.Vector3());
    const set = (out, x, y) => {
      v.set(x, y, 0.5).applyMatrix4(inv);
      v.multiplyScalar(-1 / v.z);
      out.copy(v).transformDirection(rotM).multiplyScalar(v.length());
    };
    set(u.uC00.value, -1, -1);
    set(u.uC10.value, 1, -1);
    set(u.uC01.value, -1, 1);
    set(u.uC11.value, 1, 1);
  },

  /** Seleciona e prepara até MAX_BODIES corpos para o domo (maiores no céu primeiro). */
  updateBodies(ctx, origin) {
    const S = this.state;
    const du = this.parts.dome.uniforms;
    const uni = ctx.services.universe;
    const list = [];
    const cur = uni?.currentPlanet;
    let all = [];
    try {
      all = uni?.bodies?.() || [];
    } catch {
      all = [];
    }
    for (const b of all) {
      if (!b || b.kind === 'star' || b === cur || b.id === cur?.id || !b.position) continue;
      const dx = b.position.x - origin.x;
      const dy = b.position.y - origin.y;
      const dz = b.position.z - origin.z;
      const d = Math.hypot(dx, dy, dz);
      if (d <= b.radius * 1.01) continue;
      const ang = Math.asin(Math.min(1, b.radius / d));
      if (ang < 0.00015) continue;
      list.push({ b, d, ang, dx, dy, dz });
    }
    list.sort((a, b) => b.ang - a.ang);
    const sel = list.slice(0, MAX_BODIES);
    // pintor: do mais distante ao mais próximo
    sel.sort((a, b) => b.d - a.d);
    S.bodies = [];
    for (let i = 0; i < MAX_BODIES; i++) {
      const e = sel[i];
      if (!e) continue;
      const { b } = e;
      let look = S.bodyCache.get(b.id);
      if (!look) {
        const base = BODY_LOOK[b.biome] || BODY_LOOK.barren;
        const r = rngFrom((b.seed ?? 7) ^ 0x2f1c9);
        const jit = (c) => c.map((v) => Math.max(0.01, v * r.range(0.8, 1.2)));
        let type = base[2];
        if (b.biome === 'gas' || b.kind === 'gas') type = 2;
        let atm = [0, 0, 0, 0];
        if (b.atmosphere) {
          const ap = deriveAtmosphere({ radius: b.radius, atmosphere: b.atmosphere, biome: b.biome, seed: b.seed ?? 1 });
          const rc = rimColorOf(ap);
          atm = [rc[0], rc[1], rc[2], Math.max(0.03, (b.atmosphere.radius - b.radius) / b.radius)];
        }
        let ring = [0, 0, 0, 0];
        let ringN = [0, 1, 0, 0];
        let ringC = [0, 0, 0, 0];
        if (b.rings) {
          ring = [b.rings.inner / b.radius, b.rings.outer / b.radius, 0.85, 1];
          const t = b.rings.tilt || 0;
          ringN = [0, Math.cos(t), Math.sin(t), 0];
          ringC = [...(b.rings.color || [0.8, 0.72, 0.6]), 0];
        }
        const pale = (c) => c.map((v) => v * 0.7 + 0.16);
        look = { c1: pale(jit(base[0])), c2: pale(jit(base[1])), type, seed: r.range(0, 40), atm, ring, ringN, ringC };
        S.bodyCache.set(b.id, look);
      }
      const k = S.bodies.length;
      du.uBodyPos.value[k].set(e.dx / 1000, e.dy / 1000, e.dz / 1000, b.radius / 1000);
      du.uBodyCol.value[k].set(look.c1[0], look.c1[1], look.c1[2], look.type);
      du.uBodyCol2.value[k].set(look.c2[0], look.c2[1], look.c2[2], look.seed);
      du.uBodyAtm.value[k].fromArray(look.atm);
      du.uBodyRing.value[k].fromArray(look.ring);
      du.uBodyRingN.value[k].fromArray(look.ringN);
      du.uBodyRingC.value[k].fromArray(look.ringC);
      const dir = new THREE.Vector3(e.dx, e.dy, e.dz).divideScalar(e.d);
      // peso de "luz noturna": área angular relativa a uma lua de ~6°
      S.bodies.push({ id: b.id, dir, ang: e.ang, weight: (e.ang / 0.05) ** 2 });
    }
    du.uBodyCount.value = S.bodies.length;
  },

  /** Luz do sol na câmera, 2º sol, lua, ambiente e cor da neblina (CPU). */
  updateSceneLights(ctx, cam, rl, inside) {
    const S = this.state;
    const p = S.p;
    const { sun, sun2, moonLight, hemi } = this.lights;
    const { sunColor, ambient, fogState } = this._shared;
    const uE = this.parts.uniforms.uLightE.value;
    const uL = this.parts.uniforms.uLightDir.value;
    const pos = [cam.x, cam.y, cam.z];
    const lights = [];
    for (let i = 0; i < 3; i++) {
      if (uE[i].x + uE[i].y + uE[i].z > 0) lights.push({ dir: [uL[i].x, uL[i].y, uL[i].z], E: [uE[i].x, uE[i].y, uE[i].z] });
    }
    // sol principal
    const st0 = S.stars[0];
    const tr0 = p.has ? transmittanceJS(p, pos, [uL[0].x, uL[0].y, uL[0].z]) : shadowOnly(p, pos, uL[0]);
    sunColor.setRGB(st0.color[0] * tr0[0], st0.color[1] * tr0[1], st0.color[2] * tr0[2]);
    sun.color.copy(sunColor);
    sun.intensity = st0.E;
    // 2º sol
    const st1 = S.stars[1];
    if (st1) {
      const tr1 = p.has ? transmittanceJS(p, pos, [uL[1].x, uL[1].y, uL[1].z]) : shadowOnly(p, pos, uL[1]);
      sun2.color.setRGB(st1.color[0] * tr1[0], st1.color[1] * tr1[1], st1.color[2] * tr1[2]);
      sun2.intensity = st1.E;
    } else sun2.intensity = 0;
    // lua
    if (uE[2].x > 0) {
      const trm = p.has ? transmittanceJS(p, pos, [uL[2].x, uL[2].y, uL[2].z]) : [1, 1, 1];
      const m = Math.max(uE[2].x, uE[2].y, uE[2].z);
      moonLight.color.setRGB((uE[2].x / m) * trm[0], (uE[2].y / m) * trm[1], (uE[2].z / m) * trm[2]);
      moonLight.intensity = m * 1.6;
    } else moonLight.intensity = 0;

    // ambiente: céu no zênite e no horizonte (de dentro da atmosfera)
    const upv = [cam.x / rl, cam.y / rl, cam.z / rl];
    const thick = p.Rt - p.Rb;
    const camR = Math.min(rl, p.Rb + thick * 0.6);
    const roIn = [upv[0] * camR, upv[1] * camR, upv[2] * camR];
    const fr = tangentFrame(new THREE.Vector3(...upv));
    const acc = [0, 0, 0];
    const fog = [0, 0, 0];
    if (p.has && lights.length) {
      const z = scatterJS(p, roIn, upv, lights, { steps: 10, lightSteps: 5 }).L;
      for (let k = 0; k < 3; k++) acc[k] += z[k] * 0.4;
      for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const d = new THREE.Vector3().addScaledVector(fr.east, a).addScaledVector(fr.north, b).addScaledVector(fr.up, 0.06).normalize();
        const s = scatterJS(p, roIn, [d.x, d.y, d.z], lights, { steps: 10, lightSteps: 5 }).L;
        for (let k = 0; k < 3; k++) {
          acc[k] += s[k] * 0.15;
          fog[k] += s[k] * 0.25;
        }
      }
    }
    for (let k = 0; k < 3; k++) {
      acc[k] = acc[k] * p.skyGain + p.airglow[k] * 4;
      fog[k] *= p.skyGain;
    }
    // irradiância ≈ π · radiância média (hemisfério de cima)
    const irr = acc.map((v) => v * Math.PI);
    const m = Math.max(1e-5, 0.2126 * irr[0] + 0.7152 * irr[1] + 0.0722 * irr[2]);
    ambient.color.setRGB(irr[0] / m, irr[1] / m, irr[2] / m);
    ambient.intensity = m;
    hemi.groundColor.setRGB(p.groundAlbedo[0] * sunColor.r * 0.3 + 0.01, p.groundAlbedo[1] * sunColor.g * 0.3 + 0.01, p.groundAlbedo[2] * sunColor.b * 0.3 + 0.01);
    fogState.color.setRGB(fog[0], fog[1], fog[2]);
    // luminância média aproximada (para exposição automática de quem quiser)
    const cosS = Math.max(0, uL[0].x * upv[0] + uL[0].y * upv[1] + uL[0].z * upv[2]);
    S.sceneLum = 0.15 * (st0.E * cosS * (0.2126 * tr0[0] + 0.7152 * tr0[1] + 0.0722 * tr0[2])) / Math.PI + m * 0.1;
    void inside;
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    const { luts, dome, aerial, env } = this.parts || {};
    aerial?.removePass?.();
    aerial?.dispose();
    luts?.dispose();
    env?.dispose();
    if (dome) {
      ctx.scene.remove(dome.mesh);
      dome.mesh.geometry.dispose();
      dome.mesh.material.dispose();
    }
    if (this.lights) for (const l of Object.values(this.lights)) ctx.scene.remove(l, l.target);
    if (this._env?.owns && ctx.scene.environment === this._env.envMap) ctx.scene.environment = null;
  },
};

function renderer_h(ctx) {
  const v = new THREE.Vector2();
  ctx.renderer.getDrawingBufferSize(v);
  return v.y;
}

/** Sem atmosfera: só a sombra do planeta. */
function shadowOnly(p, pos, dir) {
  const r = Math.hypot(pos[0], pos[1], pos[2]);
  const mu = (pos[0] * dir.x + pos[1] * dir.y + pos[2] * dir.z) / r;
  const s = Math.min(1, p.Rb / r);
  const muH = -Math.sqrt(Math.max(0, 1 - s * s));
  const v = mu > muH + 0.006 ? 1 : mu < muH - 0.006 ? 0 : (mu - muH + 0.006) / 0.012;
  return [v, v, v];
}
