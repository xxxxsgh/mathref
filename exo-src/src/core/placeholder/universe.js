/**
 * Serviço `universe` PLACEHOLDER (o sistema universe substitui com
 * ctx.provide('universe', ...)). Gera o sistema com core/placeholder/universeGen.js
 * e desenha luas e planetas vizinhos como esferas simples, flutuantes e
 * com compressão de distância.
 */
import * as THREE from 'three';
import { generateGalaxy, generateSystem } from './universeGen.js';

const BIOME_COLOR = {
  lush: 0x3f6f3a, barren: 0x8a8378, frozen: 0xc9d6e2, toxic: 0x8a9a3a, scorched: 0xa0583a,
  exotic: 0x7a4fa0, ocean: 0x2a5a8a, radioactive: 0x9aa04a,
};

export function installPlaceholderUniverse(ctx) {
  const root = new THREE.Group();
  root.name = 'placeholder:universe';
  ctx.scene.add(root);
  let galaxy = generateGalaxy(ctx.seed, ctx.start.galaxy);
  let system = null;
  const handles = [];
  const sphere = new THREE.SphereGeometry(1, 64, 32);

  function clear() {
    for (const h of handles) {
      h.remove();
      root.remove(h.object);
      h.object.traverse((o) => o.material?.dispose?.());
    }
    handles.length = 0;
  }

  function build(systemIndex, planetIndex) {
    clear();
    system = generateSystem(ctx.seed, { galaxy: ctx.start.galaxy, systemIndex, planetIndex });
    const cur = system.planets[system.currentPlanetIndex];
    for (const b of system.bodies) {
      if (b.kind === 'star' || b === cur) continue;
      const mat = new THREE.MeshStandardMaterial({ color: BIOME_COLOR[b.biome] ?? 0x888888, roughness: 0.95, metalness: 0, fog: false });
      const m = new THREE.Mesh(sphere, mat);
      m.name = `body:${b.id}`;
      m.scale.setScalar(b.radius);
      if (b.rings) {
        const rg = new THREE.RingGeometry(b.rings.inner / b.radius, b.rings.outer / b.radius, 96, 1);
        const rm = new THREE.MeshStandardMaterial({ color: new THREE.Color(...b.rings.color), roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.7, fog: false, depthWrite: false });
        const ring = new THREE.Mesh(rg, rm);
        ring.rotation.x = -Math.PI / 2 + b.rings.tilt;
        m.add(ring);
      }
      root.add(m);
      handles.push(ctx.space.registerFloating(m, b.position, { compress: true }));
    }
    return system;
  }

  build(ctx.start.systemIndex, ctx.start.planetIndex);

  const api = {
    placeholder: true,
    get galaxy() {
      return galaxy;
    },
    get currentSystem() {
      return system;
    },
    get currentPlanet() {
      return system.planets[system.currentPlanetIndex];
    },
    get currentPlanetIndex() {
      return system.currentPlanetIndex;
    },
    bodies() {
      return system.bodies;
    },
    /** id exato, ou tipo: 'star'|'sun' (estrela principal), 'moon' (1ª lua do planeta atual), 'planet' (1º vizinho) */
    findBody(q) {
      if (!q) return null;
      const byId = system.bodies.find((b) => b.id === q);
      if (byId) return byId;
      const cur = system.planets[system.currentPlanetIndex];
      if (q === 'star' || q === 'sun') return system.stars[0];
      if (q === 'moon') return cur.moons[0] || system.bodies.find((b) => b.kind === 'moon') || null;
      if (q === 'planet') return system.planets.find((p) => p !== cur) || null;
      return null;
    },
    warpTo(systemId, planetIndex = 0) {
      const idx = typeof systemId === 'number' ? systemId : Number(String(systemId).split('.s')[1]) || 0;
      build(idx, planetIndex);
      ctx.bus.emit('system:enter', { system, planet: api.currentPlanet });
      return Promise.resolve(system);
    },
  };
  return {
    api,
    dispose() {
      clear();
      sphere.dispose();
      ctx.scene.remove(root);
    },
  };
}
