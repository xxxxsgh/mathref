import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRng, rngHelpers, hashString, mix } from './rng.js';
import { Planet } from '../entities/Planet.js';
import { Station } from '../entities/Station.js';
import { AsteroidField } from './AsteroidField.js';
import { LAYER_FAR } from '../core/Renderer.js';

/**
 * Gerador do sistema solar.
 *
 * ═══ SEEDS DERIVADAS, NÃO SEQUENCIAIS ═══
 *
 * Cada corpo recebe uma seed DERIVADA da seed do mundo mais um identificador
 * próprio: `mix(seedMundo, mix(hash('planet'), índice))`. O planeta 3 não
 * consome números do mesmo fluxo que o planeta 2.
 *
 * Isso não é preciosismo. Se todos os corpos puxassem de um único gerador
 * sequencial, gerar o planeta 3 dependeria de ter gerado o 1 e o 2 antes — e
 * qualquer mudança futura (gerar sob demanda, streaming, pular corpos fora de
 * alcance) mudaria o universo inteiro. Com seeds derivadas, cada corpo pode
 * ser gerado isoladamente, em qualquer ordem, e sempre dá o mesmo resultado.
 *
 * ═══ ESCALA ═══
 *
 * As distâncias não são realistas — são escolhidas pelo TEMPO DE VIAGEM.
 * Em escala real, um sistema solar tem 10^12 unidades e o jogo seria uma tela
 * preta. Aqui os corpos ficam a 40–90 segundos de voo com boost: longe o
 * bastante pra dar peso à distância, perto o bastante pra você querer ir.
 */

/** Paletas por tipo de planeta. Saturadas de propósito — a referência é capa
 *  de livro de ficção dos anos 70, não fotografia de sonda. */
const PALETTES = {
  oceanic: { low: 0x1b4b8f, mid: 0x3f8f5a, high: 0xb9a878, polar: 0xeaf4ff, atmosphere: 0x6fb4ff, rings: 0xd8c9a8 },
  desert:  { low: 0x8a5a2b, mid: 0xd39a4e, high: 0xf2dfae, polar: 0xf6efdc, atmosphere: 0xffb173, rings: 0xd9b98c },
  volcanic:{ low: 0x2a0d0a, mid: 0x8c2417, high: 0xff7a2a, polar: 0x4a2020, atmosphere: 0xff5a2a, rings: 0x9c5a3a },
  ice:     { low: 0x2d5e86, mid: 0x9fd6ef, high: 0xeaf8ff, polar: 0xffffff, atmosphere: 0x9fe4ff, rings: 0xcfeaff },
  toxic:   { low: 0x3d5410, mid: 0x8fae2b, high: 0xd9e86a, polar: 0xc8d99a, atmosphere: 0xb6ff4d, rings: 0xa8c060 },
  barren:  { low: 0x3a352f, mid: 0x6e655a, high: 0xa89c8b, polar: 0xc9c3b6, atmosphere: 0x8899aa, rings: 0x8a8272 },
  gas:     { low: 0x8a5c2a, mid: 0xd9a55c, high: 0xf6e0b0, polar: 0xe8d7c0, atmosphere: 0xffc98a, rings: 0xe2cba0 },
};
const ROCKY_TYPES = ['oceanic', 'desert', 'volcanic', 'ice', 'toxic', 'barren'];

export class SolarSystem {
  /** @param {THREE.Scene} scene @param {string} seed */
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    const S = CONFIG.system;
    const baseSeed = hashString(seed);

    // ── Estrela ───────────────────────────────────────────────────────────
    const starRng = rngHelpers(createRng(mix(baseSeed, hashString('star'))));
    const starDir = new THREE.Vector3(...CONFIG.world.sunDirection).normalize();
    this.starPosition = starDir.clone().multiplyScalar(S.starDistance);

    // A estrela é um disco emissivo simples. Ela já está desenhada no skybox
    // (com halo), então isto é só o corpo físico que aparece quando você se
    // aproxima — os dois coincidem porque usam a mesma `sunDirection`.
    const starGeo = new THREE.SphereGeometry(S.starRadius, 32, 24);
    this.starMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.world.sunColor,
      toneMapped: false,   // a estrela DEVE estourar em branco
    });
    this.star = new THREE.Mesh(starGeo, this.starMaterial);
    this.star.position.copy(this.starPosition);
    this.star.layers.set(LAYER_FAR);
    scene.add(this.star);
    this.starGeometry = starGeo;

    // ── Planetas ──────────────────────────────────────────────────────────
    const countRng = rngHelpers(createRng(mix(baseSeed, hashString('count'))));
    const planetCount = countRng.int(S.planetCount[0], S.planetCount[1]);

    /** @type {Planet[]} */
    this.planets = [];
    for (let i = 0; i < planetCount; i++) {
      const spec = this._makePlanetSpec(baseSeed, i, planetCount);
      const planet = new Planet(spec);
      scene.add(planet.object);
      this.planets.push(planet);
    }

    // ── Cinturão de asteroides ────────────────────────────────────────────
    const beltRng = rngHelpers(createRng(mix(baseSeed, hashString('belt'))));
    this.asteroids = null;
    if (beltRng.chance(S.belt.chance)) {
      const span = S.orbitOuter - S.orbitInner;
      this.beltSpec = {
        center: new THREE.Vector3(0, 0, 0),
        innerRadius: S.orbitInner + span * S.belt.innerFactor,
        outerRadius: S.orbitInner + span * S.belt.outerFactor,
        thickness: S.belt.thickness,
        count: CONFIG.asteroids.count.high,
        seed: `${seed}:belt`,
      };
    }

    // ── Estações ──────────────────────────────────────────────────────────
    const stRng = rngHelpers(createRng(mix(baseSeed, hashString('stations'))));
    const stationCount = Math.min(stRng.int(S.stations[0], S.stations[1]), this.planets.length);
    /** @type {Station[]} */
    this.stations = [];
    // Sorteia planetas DISTINTOS para hospedar estações.
    const hosts = shuffled(this.planets.map((_, i) => i), stRng).slice(0, stationCount);
    hosts.forEach((planetIndex, i) => {
      const host = this.planets[planetIndex];
      const ang = stRng.range(0, Math.PI * 2);
      const dist = host.radius + S.stationOrbitOffset;
      const pos = host.object.position.clone().add(
        new THREE.Vector3(Math.cos(ang) * dist, stRng.range(-1, 1) * dist * 0.2, Math.sin(ang) * dist),
      );
      const station = new Station({
        position: pos,
        radius: stRng.range(340, 620),
        seed: mix(baseSeed, mix(hashString('station'), i)),
        tilt: stRng.range(-0.5, 0.5),
        spinSpeed: stRng.range(0.06, 0.16),
        lightColor: 0x7de8ff,
        hostPlanet: planetIndex,
        name: `ESTAÇÃO ${['ALFA', 'BETA', 'GAMA', 'DELTA'][i] ?? i}`,
      });
      scene.add(station.object);
      this.stations.push(station);
    });

    this._tmp = new THREE.Vector3();
  }

  /** Cria o campo de asteroides no tier de qualidade pedido. */
  buildAsteroids(tier) {
    if (!this.beltSpec) return;
    const count = CONFIG.asteroids.count[tier];
    if (this.asteroids && this.asteroids.count === count) return;
    this.asteroids?.dispose();
    this.asteroids = new AsteroidField(this.scene, { ...this.beltSpec, count });
  }

  _makePlanetSpec(baseSeed, index, total) {
    const S = CONFIG.system;
    // Seed derivada — ver o comentário do topo do arquivo.
    const rng = rngHelpers(createRng(mix(baseSeed, mix(hashString('planet'), index))));

    // Órbitas espaçadas com jitter. Espaçamento perfeitamente uniforme parece
    // artificial; totalmente aleatório produz planetas colados. O meio-termo
    // é dividir a faixa em fatias iguais e sortear dentro de cada fatia.
    const slice = (S.orbitOuter - S.orbitInner) / total;
    const orbit = S.orbitInner + slice * (index + rng.range(0.18, 0.82));
    const ang = rng.range(0, Math.PI * 2);
    const incl = rng.range(-0.16, 0.16);   // inclinação orbital

    const gasGiant = rng.chance(S.gasGiantChance);
    const type = gasGiant ? 'gas' : rng.pick(ROCKY_TYPES);
    const palette = PALETTES[type];

    // Gigantes gasosos são maiores, sempre.
    const rBase = rng.range(S.planetRadius[0], S.planetRadius[1]);
    const radius = gasGiant ? rBase * 1.55 : rBase;

    return {
      index,
      name: `${romanNumeral(index + 1)}`,
      type,
      gasGiant,
      radius,
      orbitRadius: orbit,
      position: new THREE.Vector3(
        Math.cos(ang) * orbit,
        Math.sin(incl) * orbit,
        Math.sin(ang) * orbit,
      ),
      colors: palette,
      noiseSeed: rng.range(0, 400),
      // Planetas maiores recebem escala de ruído maior, senão os continentes
      // ficam gigantes e o mundo parece pequeno.
      noiseScale: gasGiant ? rng.range(1.6, 2.6) : rng.range(2.4, 5.2) * (radius / 4000),
      waterLevel: type === 'oceanic' ? rng.range(0.5, 0.62)
        : type === 'barren' || type === 'volcanic' ? rng.range(0.12, 0.26)
        : rng.range(0.3, 0.46),
      iceAmount: type === 'ice' ? rng.range(0.5, 0.75)
        : type === 'volcanic' ? rng.range(0.02, 0.1)
        : rng.range(0.12, 0.34),
      hasAtmosphere: gasGiant || rng.chance(S.atmosphereChance),
      atmosphereIntensity: gasGiant ? rng.range(0.9, 1.4) : rng.range(0.5, 1.1),
      hasRings: gasGiant ? rng.chance(0.6) : rng.chance(S.ringChance),
      axialTilt: rng.range(-0.5, 0.5),
      rotationSpeed: rng.range(0.006, 0.03) * (gasGiant ? 1.8 : 1),
      // Gravidade/atmosfera para a Fase 4 (entrada atmosférica e pouso).
      landable: !gasGiant,
      surfaceGravity: rng.range(6, 13),
      atmosphereHeight: radius * 0.055,
    };
  }

  /** @param {THREE.Vector3} cameraPos @param {number} dt */
  update(cameraPos, dt) {
    for (const p of this.planets) p.update(this.starPosition, cameraPos, dt);
    for (const s of this.stations) s.update(cameraPos, dt);
    this.asteroids?.update(cameraPos, dt);
    this.asteroids?.flushIndex();
  }

  /** Corpo mais próximo da posição dada — usado por HUD, missões e navegação. */
  nearestPlanet(position) {
    let best = null, bestDist = Infinity;
    for (const p of this.planets) {
      const d = position.distanceTo(p.object.position) - p.radius;
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return { planet: best, distance: bestDist };
  }

  get visibleAsteroids() { return this.asteroids?.visibleCount ?? 0; }

  dispose() {
    this.scene.remove(this.star);
    this.starGeometry.dispose();
    this.starMaterial.dispose();
    for (const p of this.planets) { this.scene.remove(p.object); p.dispose(); }
    for (const s of this.stations) { this.scene.remove(s.object); s.dispose(); }
    this.asteroids?.dispose();
  }
}

/** Fisher-Yates com um rng com seed — `Array.sort(() => rng()-0.5)` NÃO é um
 *  embaralhamento correto (o resultado é enviesado e depende do algoritmo de
 *  ordenação do motor, então nem é determinístico entre navegadores). */
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function romanNumeral(n) {
  const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}
