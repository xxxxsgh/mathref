/**
 * Feature `world` — o mapa "Distrito Velho": bairro urbano destruído
 * (Leste Europeu / Oriente Médio) com fachadas detalhadas, materiais PBR
 * procedurais, céu atmosférico, iluminação de sol baixo com sombras e um
 * interior jogável.
 *
 * Arquivos desta pasta:
 *   noise.js      ruído tileável (fBm, Worley, rachaduras) + normal/AO
 *   textures.js   geradores PBR (albedo + normal + ORM) por material
 *   decals.js     texturas de canvas: escorridos, fuligem, cartazes, letreiros…
 *   materials.js  materiais + patch de intemperismo em espaço de mundo
 *   geo.js        Builder: mescla por (material, chunk), UV de mundo, colisores
 *   shapes.js     cilindros, cabos em catenária, vergalhões, decalques
 *   buildings.js  gerador paramétrico de prédios
 *   props.js      carros, barreiras, sacos de areia, entulho, árvores…
 *   interior.js   térreo jogável do prédio R4
 *   layout.js     planta do mapa
 *   sky.js        céu, montanhas, envmap
 *
 * Contrato (CONTRACT.md → services.world): root, sun, hemi, bounds,
 * spawnPoints, enemySpawns, shotPoses, materialAt — mais extras:
 * environment, sky, atmosphere, interior, stats.
 */
import * as THREE from 'three';
import { createMaterials, SURFACE, weather, setOcclusionVolumes } from './materials.js';
import * as DT from './decals.js';
import { Builder } from './geo.js';
import { Instancer } from './props.js';
import { makeRng } from './noise.js';
import { buildLayout } from './layout.js';
import { ROOM } from './interior.js';
import { createSky, createMountains, createEnvironment, ATMOS } from './sky.js';

const SHADOW_EXTENT = 48;

export default {
  name: 'world',
  order: 10,

  init(ctx) {
    const { scene, collision, quality, renderer } = ctx;
    const t0 = performance.now();
    const root = new THREE.Group();
    root.name = 'world';
    scene.add(root);
    this.root = root;

    // ── materiais ──
    const { mats, genMs } = createMaterials(quality, renderer);
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
      cracks: decalMat(DT.crackTexture()),
      bullets: decalMat(DT.bulletHolesTexture()),
      posters: decalMat(DT.postersTexture(), { roughness: 0.8 }),
      graffiti: decalMat(DT.graffitiTexture(), { roughness: 0.75 }),
      paint: decalMat(DT.roadPaintTexture(), { roughness: 0.7 }),
      stains: decalMat(DT.stainsTexture(), { roughness: 0.6 }),
      trash: decalMat(DT.trashTexture(), { alphaTest: 0.35, transparent: false, depthWrite: true, roughness: 0.85 }),
      signs: new THREE.MeshStandardMaterial({ map: DT.signsTexture(), roughness: 0.55, metalness: 0.1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      leaves: new THREE.MeshStandardMaterial({ map: DT.leavesTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true }),
      palm: new THREE.MeshStandardMaterial({ map: DT.leavesTexture(31, true), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true }),
      grass: new THREE.MeshStandardMaterial({ map: DT.grassTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }),
    });
    // decalques e folhagem também recebem a oclusão de interiores
    for (const k of ['streaks', 'soot', 'cracks', 'bullets', 'posters', 'graffiti', 'paint', 'stains', 'trash', 'signs']) {
      weather(mats[k], { macro: 0, ground: 0, streaks: 0, dust: 0 });
    }
    setOcclusionVolumes([{ min: [ROOM.x0, -0.2, ROOM.z0], max: [ROOM.x1, ROOM.h + 0.25, ROOM.z1], k: 0.36 }]);
    this.mats = mats;

    // ── céu, névoa, luzes ──
    scene.background = ATMOS.horizon.clone();
    scene.fog = new THREE.FogExp2(ATMOS.fog.clone(), quality.level === 'low' ? 0.006 : 0.0048);
    const sky = createSky(Math.min(450, (quality.drawDistance + 200) * 0.6));
    scene.add(sky);
    this.sky = sky;
    const mountains = createMountains(Math.min(400, (quality.drawDistance + 200) * 0.55));
    scene.add(mountains);
    this.mountains = mountains;

    const hemi = new THREE.HemisphereLight(0xb9c8dc, 0x6a5a48, 0.55);
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
      I: new Instancer(),
      rng: makeRng(20251),
      quality,
      dishes: [],
      glassPiles: [],
      rubbleSpots: [],
      trashSpots: [],
    };
    buildLayout(W);
    const tris = W.B.tris;
    const decals = new Set(['streaks', 'soot', 'cracks', 'bullets', 'posters', 'graffiti', 'paint', 'stains', 'trash', 'signs']);
    const meshes = W.B.build(root, mats, { noShadow: new Set([...decals, 'room']) });
    const inst = W.I.build(root, mats);

    // ── IBL ──
    let environment = null;
    try {
      environment = createEnvironment(renderer, sky);
      // Só superfícies brilhantes recebem o envmap: amostrar PMREM em TODO pixel
      // custa caro (≈30% do frame no SwiftShader) e quase não muda reboco/concreto.
      for (const k of ['glass', 'carpaint', 'chrome']) {
        mats[k].envMap = environment;
        mats[k].needsUpdate = true;
      }
      mats.glass.envMapIntensity = 1.2;
      mats.carpaint.envMapIntensity = 0.6;
    } catch (err) {
      console.warn('[world] envmap falhou', err);
    }

    this.stats = {
      ms: Math.round(performance.now() - t0),
      texMs: Math.round(genMs),
      meshes: meshes.length,
      instanced: inst.length,
      tris,
      colliders: collision.colliders.size,
    };

    const shotPoses = {
      street: { position: [-1.6, 0, 26], yaw: -0.07, pitch: 0.035 },
      interior: { position: [17.2, ROOM.floor, -4.3], yaw: Math.PI / 2 + 0.05, pitch: -0.015 },
      viewmodel: { position: [-0.6, 0, 20], yaw: 0.2, pitch: -0.04 },
      ads: { position: [0, 0, 18], yaw: 0, pitch: 0.0 },
      combat: { position: [0, 0, 18], yaw: 0, pitch: 0.0 },
      menu: { position: [-3.5, 0.15, 33], yaw: -0.42, pitch: 0.09 },
    };

    ctx.provide('world', {
      root,
      sun,
      hemi,
      sky,
      environment,
      atmosphere: ATMOS,
      bounds: new THREE.Box3(new THREE.Vector3(-23.5, -1, -150), new THREE.Vector3(23.5, 40, 60)),
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
      shotPoses,
      interior: { ...ROOM },
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
  },
};
