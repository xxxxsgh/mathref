/**
 * Feature `world` — mapas (`?map=street|factory`, padrão street):
 *   street   "MERIDIAN STREET" (Distrito Velho): bairro urbano destruído com
 *            fachadas detalhadas e o térreo jogável do prédio R4;
 *   factory  "FOUNDRY 9": fundição abandonada em vários níveis (galpão com
 *            ponte rolante, passarelas, escritórios, pátio de carga).
 * Materiais PBR procedurais, céu atmosférico, sol baixo com sombras.
 *
 * Arquivos desta pasta:
 *   noise.js      ruído tileável (fBm, Worley, rachaduras) + normal/AO
 *   textures.js   geradores PBR (albedo + normal + ORM) por material
 *   decals.js     texturas de canvas: escorridos, fuligem, cartazes, letreiros…
 *   materials.js  materiais + patch de intemperismo em espaço de mundo
 *   geo.js        Builder: mescla por (material, chunk), UV de mundo, colisores
 *   shapes.js     cilindros, cabos em catenária, vergalhões, decalques
 *   propkit.js    peças boleadas com UV/desgaste/AO assados, variação por instância
 *   furniture.js  mobília modelada (mesas, cadeiras, arquivo, armário, estante)
 *   buildings.js  gerador paramétrico de prédios
 *   props.js      barreiras, sacos, entulho, caixas, caçambas, lixo…
 *   cars.js       carros (carroceria em loft, interior, rodas)
 *   interior.js   térreo jogável do prédio R4 (street)
 *   layout.js     planta do mapa street
 *   factory.js    planta e peças do mapa factory
 *   sky.js        céu, montanhas, envmap
 *
 * Contrato (CONTRACT.md → services.world): root, sun, hemi, bounds,
 * spawnPoints, enemySpawns, shotPoses, materialAt — mais extras:
 * environment, sky, atmosphere, interior, stats, mapId, map, maps,
 * mapUrl(id), setMap(id). Detalhes em README.md desta pasta.
 */
import * as THREE from 'three';
import { createMaterials, SURFACE, weather, setOcclusionVolumes } from './materials.js';
import * as DT from './decals.js';
import { setCanvasScale } from './decals.js';
import { Builder } from './geo.js';
import { Instancer } from './props.js';
import { WindowBatch } from './windows.js';
import { meshTexture } from './barriers.js';
import { ironTextures } from './road.js';
import { createSmoke } from './smoke.js';
import { createFires } from './fire.js';
import { vegetationMaterials, FOLIAGE_U } from './vegetation.js';
import { makeRng } from './noise.js';
import { buildLayout } from './layout.js';
import { ROOM } from './interior.js';
import { buildFactory, factoryMaterials, FACTORY } from './factory.js';
import { LAYOUT } from './materials.js';

/**
 * Mapas disponíveis. Seleção por URL: `?map=street|factory` (padrão street).
 * Trocar de mapa = recarregar a página com o parâmetro (ver docs/IRONLINE.md).
 */
export const MAPS = [
  { id: 'street', name: 'MERIDIAN STREET', description: 'Avenida destruída de um bairro urbano: fachadas, cruzamento, ruela, posto de controle e o térreo jogável do prédio R4.' },
  { id: 'factory', name: 'FOUNDRY 9', description: 'Fundição abandonada: galpão de máquinas com ponte rolante, passarelas, escritórios de dois pisos e pátio de carga com doca e contêineres.' },
];

/** Dados do mapa de rua (o original). */
const STREET = {
  id: 'street',
  bounds: [[-23.5, -1, -150], [23.5, 40, 60]],
  spawnPoints: [
    { position: [0, 0, 20], yaw: 0, pitch: 0 },
    { position: [3, 0, 46], yaw: 0, pitch: 0 },
    { position: [17, ROOM.floor, -6], yaw: Math.PI / 2, pitch: 0 },
  ],
  enemySpawns: [
    { position: [1.2, 0, -8.5], yaw: Math.PI },
    { position: [-2.5, 0, -24], yaw: Math.PI },
    { position: [3.5, 0, -35.5], yaw: Math.PI },
    { position: [0, 0, -44.5], yaw: Math.PI },
    { position: [-4, 0, -58], yaw: Math.PI },
  ],
  shotPoses: {
    street: { position: [-1.6, 0, 26], yaw: -0.07, pitch: 0.035 },
    interior: { position: [17.2, ROOM.floor, -4.3], yaw: Math.PI / 2 + 0.05, pitch: -0.06 },
    viewmodel: { position: [-0.6, 0, 20], yaw: 0.2, pitch: -0.04 },
    ads: { position: [0, 0, 18], yaw: 0, pitch: 0.0 },
    combat: { position: [0.5, 0, 12.5], yaw: 0.05, pitch: 0.0 },
    menu: { position: [-3.5, 0.15, 33], yaw: -0.42, pitch: 0.09 },
  },
  occlusion: [{ min: [ROOM.x0, -0.2, ROOM.z0], max: [ROOM.x1, ROOM.h + 0.25, ROOM.z1], k: 0.36 }],
  fires: [
    { x: -2.8, y: 0.42, z: -12, w: 1.8, d: 1.3, h: 1.9, light: 45, range: 10, tongues: 8, embers: 40, smoke: 44, smokeH: 18 },
    { x: -3.5, y: 0.75, z: -12.9, w: 0.7, h: 0.7, tongues: 3, embers: 8 },
    // luz pontual NÃO projeta sombra: esta pilha fica colada ao interior jogável,
    // então sem luz própria (vazaria pela parede e acenderia o teto da sala)
    { x: 6.6, y: 0.18, z: 2.0, w: 0.9, h: 1.1, light: 0, range: 9, tongues: 5, embers: 24, smoke: 14, smokeH: 10 },
    { x: 6.6, y: 0.88, z: -29.5, w: 0.5, h: 0.75, tongues: 4, embers: 14 },
    { x: -8.3, y: 0.9, z: -96, w: 1.2, h: 1.2, tongues: 5, embers: 16 },
    { x: 3.2, y: 0.5, z: -78, w: 1.3, h: 1.3, tongues: 5, embers: 16 },
  ],
  smoke: [
    { x: 30, z: -105, h: 70, w: 15, seed: 0.13 },
    { x: -46, z: -140, h: 85, w: 20, seed: 0.57 },
    { x: 70, z: -60, h: 55, w: 12, seed: 0.81 },
    { x: -80, z: -40, h: 60, w: 15, seed: 0.33 },
  ],
  build: (W) => buildLayout(W),
};
const MAP_DATA = { street: STREET, factory: { ...FACTORY, build: (W) => buildFactory(W) } };
import { createSky, createMountains, createEnvironment, ATMOS } from './sky.js';

const SHADOW_EXTENT = 48;

export default {
  name: 'world',
  order: 10,

  async init(ctx) {
    const { scene, collision, quality, renderer } = ctx;
    const t0 = performance.now();
    // fases da carga: tempo de cada uma (stats.phases) + progresso na tela
    // de carga, cedendo um frame entre elas (ctx.bootProgress do núcleo)
    const phases = [];
    let tp = t0;
    const phase = async (label, f) => {
      const now = performance.now();
      // heap JS (só Chrome) após a fase: acha picos de memória na carga
      const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined;
      phases.push([label, Math.round(now - tp), heap]);
      await ctx.bootProgress?.(label, f);
      tp = performance.now();
    };
    // ── seleção de mapa (?map=street|factory) ──
    const req = String(ctx.params?.get?.('map') || 'street').toLowerCase();
    const mapId = MAP_DATA[req] ? req : 'street';
    if (req !== mapId) console.warn(`[world] mapa desconhecido "${req}", usando street`);
    const MAP = MAP_DATA[mapId];
    this.mapId = mapId;
    const root = new THREE.Group();
    root.name = 'world';
    scene.add(root);
    this.root = root;

    // ── camada do aparelho (core/Quality.js → TIER_PATCHES) ──
    // detail < 1 (celular/modo leve): texturas de canvas pela metade,
    // entulho miúdo rarefeito, corte de distância mais curto
    const detail = quality.detail ?? 1;
    setCanvasScale(detail < 1 ? 0.5 : 1);

    // ── materiais ──
    const { mats, genMs, sets } = await createMaterials(quality, renderer, (k, f) => ctx.bootProgress?.('texturas', f * 0.4));
    await phase('texturas', 0.4);
    this.sets = sets;
    const nrm = (t) => ({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.4, 1.4) });
    const decalMat = (map, extra = {}) =>
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
        roughness: 0.92,
        metalness: 0,
        vertexColors: true,
        ...extra,
      });
    Object.assign(mats, {
      streaks: decalMat(DT.streakTexture()),
      soot: decalMat(DT.sootTexture()),
      cracks: decalMat(null, { ...nrm(DT.crackTexture()) }),
      bullets: decalMat(null, { ...nrm(DT.bulletHolesTexture()) }),
      bulletsM: decalMat(null, { ...nrm(DT.metalHolesTexture()), roughness: 0.55, metalness: 0.3 }),
      chips: decalMat(null, { ...nrm(DT.chipsTexture()), roughness: 0.95 }),
      scorch: decalMat(DT.scorchTexture(), { roughness: 0.98 }),
      shards: decalMat(DT.shardsTexture(), { roughness: 0.12, metalness: 0.0 }),
      posters: decalMat(DT.postersTexture(), { roughness: 0.8 }),
      graffiti: decalMat(DT.graffitiTexture(), { roughness: 0.75 }),
      paint: decalMat(DT.roadPaintTexture(), { roughness: 0.9 }),
      stains: decalMat(DT.stainsTexture(), { roughness: 0.6 }),
      trash: (() => {
        const t = DT.trashTexture();
        return decalMat(t.map, { normalMap: t.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), alphaTest: 0.35, transparent: false, depthWrite: true, roughness: 0.88 });
      })(),
      // sombra de contato sob objetos (AO de chão assada)
      contact: decalMat(DT.contactTexture(), { roughness: 1, depthWrite: false, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      signs: new THREE.MeshStandardMaterial({ map: DT.signsTexture(), roughness: 0.55, metalness: 0.1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      ...vegetationMaterials(),
    });
    // vidro de carro: escuro, liso, reflexo do céu (IBL); transparente o
    // bastante para ver bancos e o vidro do outro lado
    mats.carglass = new THREE.MeshStandardMaterial({ color: 0x1b2427, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.8, envMapIntensity: 1.25, vertexColors: true, depthWrite: true });
    // lanternas/piscas: plástico translúcido colorido com leve emissão
    mats.taillight = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, emissive: 0x2a0402, vertexColors: true, envMapIntensity: 1.2 });
    // poça: água turva e lisa (espelho do céu), sem intemperismo
    mats.puddle = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.02, metalness: 0, envMapIntensity: 1.4, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    await phase('decalques', 0.43);
    mats.mesh = new THREE.MeshStandardMaterial({ map: meshTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.8, vertexColors: true });
    mats.fabricDS = mats.fabric.clone();
    mats.fabricDS.side = THREE.DoubleSide;
    {
      const it = ironTextures();
      mats.iron = new THREE.MeshStandardMaterial({ map: it.map, color: 0x7c7a76, normalMap: it.normalMap, normalScale: new THREE.Vector2(1.8, 1.8), roughness: 0.82, metalness: 0.35, envMapIntensity: 0.6, vertexColors: true });
      weather(mats.iron, { macro: 0.5, ground: 0, streaks: 0, dust: 0.15 });
    }
    mats.chromeDS = mats.chrome.clone();
    mats.chromeDS.side = THREE.DoubleSide;
    {
      const ct = DT.crateTexture();
      mats.crate.map = ct.map;
      mats.crate.normalMap = ct.normalMap;
      mats.crate.needsUpdate = true;
    }
    // decalques e folhagem também recebem a oclusão de interiores
    for (const k of ['streaks', 'soot', 'cracks', 'bullets', 'bulletsM', 'chips', 'scorch', 'shards', 'posters', 'graffiti', 'paint', 'stains', 'trash', 'signs', 'contact']) {
      weather(mats[k], { macro: 0, ground: 0, streaks: 0, dust: 0 });
    }
    setOcclusionVolumes(MAP.occlusion);
    if (mapId === 'factory') {
      factoryMaterials(mats);
      LAYOUT.uRoom.value.set(...MAP.room);
      LAYOUT.uPath.value.set(...MAP.path);
      LAYOUT.uWalk.value.set(0, 0);
    } else {
      LAYOUT.uRoom.value.set(9.8, -13.7, 23.2, 1.7);
      LAYOUT.uPath.value.set(ROOM.x0 + 0.3, -4.0, 17.0, -5.5);
      LAYOUT.uWalk.value.set(6.0, 9.5);
    }
    this.mats = mats;
    await phase('materiais', 0.45);

    // ── céu, névoa, luzes ──
    scene.background = ATMOS.horizon.clone();
    scene.fog = new THREE.FogExp2(ATMOS.fog.clone(), quality.level === 'low' ? 0.006 : 0.0048);
    const sky = createSky(Math.min(450, (quality.drawDistance + 200) * 0.6));
    scene.add(sky);
    this.sky = sky;
    const mountains = createMountains(Math.min(400, (quality.drawDistance + 200) * 0.55));
    scene.add(mountains);
    this.mountains = mountains;

    const hemi = new THREE.HemisphereLight(0xb9c8dc, 0x6a5a48, 0.46);
    hemi.name = 'world-hemi';
    root.add(hemi);
    const sun = new THREE.DirectionalLight(ATMOS.sunColor.clone(), 3.6);
    sun.name = 'world-sun';
    sun.castShadow = !!quality.shadows;
    sun.shadow.mapSize.setScalar(quality.shadowMapSize || 2048);
    Object.assign(sun.shadow.camera, { left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 260 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2;
    root.add(sun, sun.target);
    this.sun = sun;
    this.hemi = hemi;

    // ── geometria do mapa ──
    const W = {
      B: new Builder(collision, { chunk: 64 }),
      I: new Instancer(detail),
      tick: (label, f) => ctx.bootProgress?.(label, 0.47 + 0.28 * f),
      win: new WindowBatch(),
      rng: makeRng(20251),
      quality,
      dishes: [],
      glassPiles: [],
      rubbleSpots: [],
      trashSpots: [],
    };
    W.B.realShadows = quality.level === 'high' || quality.level === 'ultra';
    await phase('céu', 0.47);
    await MAP.build(W);
    await phase('geometria', 0.75);
    const tris = W.B.tris;
    const decals = new Set(['streaks', 'soot', 'cracks', 'bullets', 'bulletsM', 'chips', 'scorch', 'shards', 'posters', 'graffiti', 'paint', 'stains', 'trash', 'signs', 'contact']);
    const meshes = W.B.build(root, mats, { noShadow: new Set([...decals, 'room', 'fglass', 'fsign', 'puddle']) });
    const inst = W.I.build(root, mats);
    // entulho miúdo partido em células (props.js): some além de uma
    // distância — um pedaço de 20 cm a 90 m ocupa menos de um pixel
    this.debris = inst.filter((m) => m.name.includes('#'));
    this.debrisDist = (quality.level === 'low' ? 50 : quality.level === 'medium' ? 70 : 95) * (detail < 1 ? 0.6 : 1);
    this.windows = W.win.build(root, { grime: this.sets.grime, quality });
    await phase('malhas', 0.88);

    // ── colunas de fumaça de incêndios distantes ──
    if (quality.level !== 'low') {
      this.smoke = createSmoke(MAP.smoke, ATMOS);
      scene.add(this.smoke);
    }
    // ── focos de incêndio: luz local quente (contraste) ──
    this.fire = createFires(MAP.fires, makeRng(777));
    root.add(this.fire);

    // ── IBL ──
    // O ambiente vai em scene.environment (todos os PBR recebem IBL difuso e
    // especular). A feature rendering troca pelo céu físico dela quando presente.
    let environment = null;
    // sem alvos half-float (quality.hdr false: modo leve ou GPU sem
    // EXT_color_buffer_half_float) o PMREM sairia preto/com erro de GL
    if (quality.hdr !== false) try {
      environment = createEnvironment(renderer, sky);
      if (!ctx.scene.environment) ctx.scene.environment = environment;
      mats.glass.envMapIntensity = 1.2;
      mats.carpaint.envMapIntensity = 0.8;
    } catch (err) {
      console.warn('[world] envmap falhou', err);
    }
    await phase('fogo/ambiente', 1);

    this.stats = {
      ms: Math.round(performance.now() - t0),
      texMs: Math.round(genMs),
      meshes: meshes.length,
      instanced: inst.length,
      windows: W.win.count,
      tris,
      colliders: collision.colliders.size,
      phases,
      detail,
      skippedDebris: W.I.skipped,
    };

    const shotPoses = JSON.parse(JSON.stringify(MAP.shotPoses));

    // depuração: ?wpose=x,y,z,yaw,pitch substitui a pose do preset atual
    const wp = ctx.params.get('wpose');
    if (wp && ctx.shot) {
      const v = wp.split(',').map(Number);
      shotPoses[ctx.shot.name] = { position: [v[0], v[1], v[2]], yaw: v[3] || 0, pitch: v[4] || 0 };
    }

    ctx.provide('world', {
      root,
      sun,
      hemi,
      sky,
      environment,
      atmosphere: ATMOS,
      bounds: new THREE.Box3(new THREE.Vector3(...MAP.bounds[0]), new THREE.Vector3(...MAP.bounds[1])),
      spawnPoints: MAP.spawnPoints.map((p) => ({ ...p, position: [...p.position] })),
      enemySpawns: MAP.enemySpawns.map((p) => ({ ...p, position: [...p.position] })),
      shotPoses,
      interior: mapId === 'street' ? { ...ROOM } : null,
      /** Mapa carregado e lista de mapas ({ id, name, description }). */
      mapId,
      maps: MAPS.map((m) => ({ ...m })),
      map: { ...MAPS.find((m) => m.id === mapId) },
      /** URL desta página com outro mapa (trocar = navegar/recarregar). */
      mapUrl: (id) => {
        const u = new URL(window.location.href);
        u.searchParams.set('map', id);
        return u.toString();
      },
      /** Troca de mapa: recarrega a página com ?map=<id>. */
      setMap: (id) => {
        if (!MAP_DATA[id] || id === mapId) return false;
        window.location.assign(ctx.services.world.mapUrl(id));
        return true;
      },
      stats: this.stats,
      /** Material de superfície num ponto (para passos, impactos). */
      materialAt: (hit) => hit?.collider?.material || 'concrete',
      surfaces: SURFACE,
    });

    this._off = ctx.bus.on('quality:change', (q) => {
      sun.castShadow = !!q.shadows;
      if (sun.shadow.mapSize.x !== q.shadowMapSize) {
        sun.shadow.mapSize.setScalar(q.shadowMapSize);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    });
  },

  frame(dt, ctx) {
    const cam = ctx.camera;
    const tnow = ctx.time?.now ?? performance.now() / 1000;
    FOLIAGE_U.uTime.value = tnow;
    if (this.smoke) {
      this.smoke.material.uniforms.uCam.value.copy(cam.position);
      this.smoke.material.uniforms.uTime.value = tnow;
    }
    this.fire?.userData.update(tnow, cam);
    // corte por distância do entulho miúdo (por célula)
    if (this.debris?.length) {
      const D = this.debrisDist;
      for (const m of this.debris) {
        const bs = m.boundingSphere;
        if (!bs) continue;
        m.visible = cam.position.distanceTo(bs.center) - bs.radius < D;
      }
    }
    // céu e montanhas centrados na câmera
    this.sky.position.copy(cam.position);
    this.mountains.position.set(cam.position.x, 0, cam.position.z);
    // sombra do sol segue o jogador (encaixada no texel para não tremer)
    const sun = this.sun;
    const p = ctx.player?.position || cam.position;
    const texel = (SHADOW_EXTENT * 2) / sun.shadow.mapSize.x;
    const cx = Math.round(p.x / texel) * texel, cz = Math.round(p.z / texel) * texel;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + ATMOS.sunDir.x * 120, ATMOS.sunDir.y * 120, cz + ATMOS.sunDir.z * 120);
    sun.target.updateMatrixWorld();
  },

  dispose(ctx) {
    this._off?.();
    ctx.scene.remove(this.root, this.sky, this.mountains);
    if (this.smoke) ctx.scene.remove(this.smoke);
  },
};
