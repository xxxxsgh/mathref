// Campos de destroços: restos de batalhas e de comboios saqueados,
// determinísticos por sistema. Cada campo instancia peças do kit
// (chapas, seções de casco, contêineres, treliças, tanques, motores) num
// elipsoide achatado com núcleo mais denso, girando devagar, com brasas e
// faíscas nas peças recém-destruídas. Só existe em detalhe perto do jogador.

import * as THREE from 'three/webgpu';
import { makeRng, hash } from '../../core/Rng.js';
import { KINDS, debrisGeometries, debrisMaterial, PAINTS } from './DebrisKit.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const SIZES = { plate: [2.0, 8.0], section: [2.5, 9.0], container: [1.0, 1.5], girder: [1.5, 5.0], tank: [1.4, 4.5], engine: [1.6, 6.0], hulkFront: [5, 8], hulkRear: [5, 8], hull: [4, 6] };
const WEIGHTS = { plate: 0.34, section: 0.1, container: 0.2, girder: 0.18, tank: 0.1, engine: 0.08, hulkFront: 0, hulkRear: 0, hull: 0 };

/** Campos de destroços de um sistema (dados puros, determinísticos). */
export function debrisFieldsFor(system) {
  const r = makeRng(hash(system.seed, 'debris'));
  const out = [];
  const bodies = system.bodies.filter((b) => b.kind !== 'moon');
  const bodyPos = (b) => ({ x: Math.cos(b.orbitAngle) * b.orbitRadius, y: 0, z: Math.sin(b.orbitAngle) * b.orbitRadius });
  if (system.id === 'orfeu') {
    // a batalha que ninguém explica: Hegemonia × Frente Livre, perto de Tália
    const t = bodyPos(system.bodies.find((b) => b.id === 'talia'));
    out.push({ id: 'orfeu-batalha', name: 'Destroços da Batalha de Tália', theme: 'battle', factions: ['hegemony', 'free'], center: { x: t.x + 260000, y: 18000, z: t.z - 140000 }, radius: 3500 });
    const b = system.belts[0];
    if (b) {
      const a = 1.05;
      const rr = (b.innerR + b.outerR) / 2;
      out.push({ id: 'orfeu-comboio', name: 'Comboio saqueado', theme: 'convoy', factions: ['guild', 'corsairs'], center: { x: Math.cos(a) * rr, y: 2000, z: Math.sin(a) * rr }, radius: 3000 });
    }
    return out;
  }
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    const host = bodies.length ? r.pick(bodies) : null;
    const hp = host ? bodyPos(host) : { x: 3e6, y: 0, z: 0 };
    const off = (host ? host.radius : 1e5) * r.range(3, 8);
    const ang = r() * 6.283;
    const theme = r.pick(['battle', 'convoy', 'battle', 'ancient']);
    const factions = theme === 'battle' ? [r.pick(['hegemony', 'free']), r.pick(['corsairs', 'free', 'hegemony'])] : theme === 'convoy' ? ['guild', 'civil'] : ['civil'];
    out.push({
      id: `${system.id}-deb${i}`,
      name: theme === 'battle' ? 'Destroços de combate' : theme === 'convoy' ? 'Comboio destruído' : 'Casco antigo',
      theme,
      factions,
      center: { x: hp.x + Math.cos(ang) * off, y: r.range(-20000, 20000), z: hp.z + Math.sin(ang) * off },
      radius: r.range(2500, 4500),
    });
  }
  return out;
}

export class DebrisField {
  constructor(ctx, def, count) {
    this.ctx = ctx;
    this.def = def;
    this.group = new THREE.Group();
    this.group.name = 'debris-' + def.id;
    this.group.visible = false;
    const geos = debrisGeometries();
    const r = makeRng(hash(def.id));
    this.pieces = [];
    // cascos partidos das naves grandes ficam perto do centro
    const hulks = def.theme === 'battle' ? ['hulkFront', 'hulkRear', 'hulkFront'] : def.theme === 'ancient' ? ['hull'] : [];
    for (let i = 0; i < count; i++) {
      // escolhe o tipo pelos pesos
      let u = r(), kind = 'plate';
      for (const k of KINDS) {
        u -= WEIGHTS[k];
        if (u <= 0) {
          kind = k;
          break;
        }
      }
      if (i < hulks.length) kind = hulks[i];
      // núcleo denso + halo esparso, achatado (destroços espalham no plano do combate)
      const rad = i < hulks.length ? def.radius * (0.06 + i * 0.12) : def.radius * Math.pow(r(), 1.6);
      let x = r() - 0.5, y = (r() - 0.5) * 0.35, z = r() - 0.5;
      const l = Math.hypot(x, y, z) || 1;
      x = (x / l) * rad;
      y = (y / l) * rad;
      z = (z / l) * rad;
      const [s0, s1] = SIZES[kind];
      const big = i >= hulks.length && r() < 0.08 ? 2.5 : 1;
      const scale = (s0 + (s1 - s0) * Math.pow(r(), 2)) * big * (kind === 'container' ? 1 : 1);
      const fac = r.pick(def.factions);
      const pal = PAINTS[fac] || PAINTS.civil;
      const paint = r.pick(pal);
      const burnt = def.theme === 'ancient' ? 0.2 : i < hulks.length ? r.range(0.3, 0.5) : r.range(0.15, 0.8);
      this.pieces.push({
        kind,
        off: new THREE.Vector3(x, y, z),
        scale,
        q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6.28, r() * 6.28, r() * 6.28)),
        axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        spin: (i < hulks.length ? r.range(0.002, 0.006) : r.range(0.01, 0.12)) / Math.sqrt(scale),
        drift: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.6),
        paint: [paint[0], paint[1], paint[2], def.theme === 'ancient' ? 0.9 : r.range(0.1, 0.5)],
        fx: [r() * 100, burnt, (r() < 0.3 || i < hulks.length) && def.theme === 'battle' ? r.range(0.5, 1) : 0, scale],
      });
    }
    // uma InstancedMesh por tipo
    this.meshes = {};
    for (const k of KINDS) {
      const list = this.pieces.filter((p) => p.kind === k);
      if (!list.length) continue;
      const pa = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
      const fa = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
      list.forEach((p, i) => {
        pa.array.set(p.paint, i * 4);
        fa.array.set(p.fx, i * 4);
      });
      const mesh = new THREE.InstancedMesh(geos[k], debrisMaterial(pa, fa), list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'debris-' + k;
      mesh.userData.list = list;
      this.group.add(mesh);
      this.meshes[k] = mesh;
    }
  }

  frame(ctx, camSys, time) {
    const w = ctx.world;
    const c = this.def.center;
    const dx = camSys.x - c.x, dy = camSys.y - c.y, dz = camSys.z - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.distance = d;
    this.group.visible = d < this.def.radius + 120000;
    if (!this.group.visible) return;
    this.group.position.set(c.x - w.origin.x, c.y - w.origin.y, c.z - w.origin.z);
    for (const k in this.meshes) {
      const mesh = this.meshes[k];
      const list = mesh.userData.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        _q2.setFromAxisAngle(p.axis, time * p.spin);
        _q.copy(p.q0).premultiply(_q2);
        _p.copy(p.off).addScaledVector(p.drift, time);
        _s.setScalar(p.scale);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Peças perto de um ponto (colisão simples). */
  query(world, posLocal, radius) {
    if (!this.group.visible) return [];
    const out = [];
    const base = this.group.position;
    for (const p of this.pieces) {
      const rr = radius + p.scale * 4;
      const x = base.x + p.off.x, y = base.y + p.off.y, z = base.z + p.off.z;
      const dd = (x - posLocal.x) ** 2 + (y - posLocal.y) ** 2 + (z - posLocal.z) ** 2;
      if (dd < rr * rr) out.push({ kind: p.kind, position: new THREE.Vector3(x, y, z), radius: p.scale * 4, field: this.def.id });
    }
    return out;
  }

  dispose() {
    for (const k in this.meshes) this.meshes[k].material.dispose();
    this.group.removeFromParent();
  }
}
