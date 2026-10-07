// Parâmetros determinísticos do céu de um sistema estelar (derivados da seed
// e da posição do sistema na galáxia do Universe.js). Tudo aqui é CPU puro:
// o bake (skyBake.js) e o fundo (skyDome.js) leem estes valores como uniforms.
import * as THREE from 'three/webgpu';
import { Rng, mix as mixSeed } from '../../core/Rng.js';
import { STAR_TYPES } from '../../core/Universe.js';

/** Cor linear aproximada de uma estrela pelo tipo (para estrelas vizinhas). */
export function starTypeColor(type) {
  const c = STAR_TYPES[type]?.color || [1, 0.9, 0.8];
  return new THREE.Color(c[0], c[1], c[2]);
}

/**
 * Orientação do plano galáctico no referencial do sistema. A eclíptica dos
 * planetas é o plano XZ do mundo; a galáxia fica inclinada em relação a ela
 * (como a Via Láctea real, ~60°), de forma estável por sistema.
 */
function galaxyRotation(r) {
  const tilt = r.range(0.75, 1.2) * r.sign();
  const yaw = r.range(0, Math.PI * 2);
  const roll = r.range(-0.4, 0.4);
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, roll, 'YXZ'));
}

const _v = new THREE.Vector3();

export function skyParams(galaxy, system) {
  const r = new Rng(mixSeed(system.seed, 0x5c1));
  const galToWorld = galaxyRotation(r);
  const worldToGal = galToWorld.clone().invert();
  const gp = system.pos || { x: 0, y: 0, z: 0 };

  // ── nebulosa principal do sistema (Universe: system.nebula) ──
  const neb = system.nebula;
  const nebula = {
    on: !!neb,
    colorA: new THREE.Color(...(neb?.color || [0.4, 0.2, 0.6])),
    colorB: new THREE.Color(...(neb?.color2 || [0.1, 0.4, 0.7])),
    density: neb?.density ?? 0,
    // direção do "coração" da nebulosa no céu
    center: new THREE.Vector3(r.range(-1, 1), r.range(-0.5, 0.6), r.range(-1, 1)).normalize(),
    // normal do plano da fenda escura (poeira) que corta a nebulosa
    rift: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
    spread: r.range(0.75, 1.05),
    seed: new THREE.Vector3(r.range(0, 50), r.range(0, 50), r.range(0, 50)),
    core: new THREE.Vector3(),
  };
  // Kessa: composição da Fenda de Órion (a nebulosa precisa dominar o céu visto de Verídia)
  if (system.id === 'kessa') {
    // a partir de Verídia, a nebulosa fica ~35° acima/ao lado da estrela
    const ver = system.bodies.find((b) => b.name === 'Verídia');
    const toStar = ver ? ver.pos.clone().negate().normalize() : new THREE.Vector3(-0.93, 0, -0.36);
    nebula.center.copy(toStar).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.45).add(new THREE.Vector3(0, 0.42, 0)).normalize();
    nebula.rift.set(0.55, 0.75, 0.35).normalize();
    nebula.spread = 1.05;
  }
  // aglomerado ionizante (estrelas quentes dentro da nebulosa)
  nebula.core.copy(nebula.center).add(_v.set(r.range(-0.25, 0.25), r.range(-0.15, 0.15), r.range(-0.25, 0.25))).normalize();

  // ── nebulosas distantes (manchas pequenas) para nenhum céu ficar vazio ──
  const far = [];
  const nFar = r.int(2, 4);
  for (let i = 0; i < nFar; i++) {
    far.push({
      dir: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
      color: new THREE.Color().setHSL(r.pick([0.62, 0.78, 0.95, 0.02, 0.55]), r.range(0.5, 0.85), 0.5),
      size: r.range(0.08, 0.22),
      strength: r.range(0.25, 0.7),
    });
  }

  // ── estrelas vizinhas reais (coerência com o mapa galáctico) ──
  const neighbors = [];
  for (const s of galaxy.systems) {
    if (s.id === system.id) continue;
    _v.set(s.pos.x - gp.x, s.pos.y - gp.y, s.pos.z - gp.z);
    const d = _v.length();
    if (d > 140 || d < 0.01) continue;
    const lum = STAR_TYPES[s.starType]?.lum ?? 1;
    const app = (s.starType === 'black_hole' ? 0.0 : lum) / (d * d) * 2500; // brilho aparente relativo
    if (app < 0.06) continue;
    neighbors.push({ id: s.id, name: s.name, dir: _v.clone().normalize().applyQuaternion(galToWorld), dist: d, app, color: starTypeColor(s.starType), type: s.starType });
  }
  neighbors.sort((a, b) => b.app - a.app);
  neighbors.length = Math.min(neighbors.length, 160);

  return {
    galToWorld, worldToGal,
    galPos: new THREE.Vector3(gp.x, gp.y, gp.z),
    nebula, far, neighbors,
    // direção (mundo) do centro galáctico — útil para HUD/mapa
    coreDir: new THREE.Vector3(-gp.x, -gp.y, -gp.z).normalize().applyQuaternion(galToWorld),
  };
}
