// Campos de destroços: restos de naves (chapas de casco rasgadas e dobradas,
// vigas, módulos) girando devagar, com pintura da facção, queimaduras,
// metal exposto nas bordas e — em batalhas recentes — brasas ainda acesas.
//
// Campos vêm dos POIs do Universe (`debris`, `derelict`, `opening_battle`)
// e de alguns fixos da campanha (restos da batalha no Refúgio Cinza).
// Dados consultáveis: debrisNear(pos, r) → peças (para coleta/colisão/scan).
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, mix, smoothstep, clamp, pow, abs, fract, attribute, positionGeometry, normalGeometry, max, min, uniform,
} from 'three/tsl';
import { Rng, mix as mixSeed } from '../../core/Rng.js';
import { makeDebrisGeometries } from './rockGeo.js';
import { n3, bumpNormal } from './tsl.js';

const PER_FIELD = { ultra: 420, high: 300, medium: 180, mobile: 100 };
const PAINT = {
  hegemonia: [[0.62, 0.6, 0.57], [0.7, 0.52, 0.2]],
  frente: [[0.42, 0.4, 0.36], [0.9, 0.42, 0.18]],
  corsarios: [[0.16, 0.14, 0.18], [0.55, 0.2, 0.62]],
  guilda: [[0.6, 0.62, 0.6], [0.25, 0.7, 0.62]],
  generic: [[0.45, 0.46, 0.48], [0.7, 0.55, 0.3]],
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3();

function hullMaterial(quality) {
  const m = new THREE.MeshStandardNodeMaterial();
  const a = attribute('aDeb', 'vec4');       // x semente, y facção (0..4), z queima 0..1, w escala
  const b = attribute('aPaint', 'vec4');     // cor de pintura principal (rgb), w brasa 0..1
  const P = positionGeometry.mul(1.0).add(vec3(a.x.mul(13.1), a.x.mul(7.7), a.x.mul(3.3))).toVar();
  const N = normalGeometry;
  // painéis: grade de placas nas coordenadas do objeto (triplanar simples)
  const an = abs(N);
  const pp = an.x.greaterThan(an.y).select(an.x.greaterThan(an.z).select(P.yz, P.xy), an.y.greaterThan(an.z).select(P.xz, P.xy));
  const g = abs(fract(pp.mul(vec3(2.2, 3.1, 1).xy)).sub(0.5));
  const seam = smoothstep(0.47, 0.495, max(g.x, g.y));
  const n1 = n3(P.mul(0.9)).r, n2 = n3(P.mul(3.7)).g, n3b = n3(P.mul(1.6).add(4.0)).a;
  const burn = smoothstep(0.3, 0.7, n1.mul(0.6).add(n3b.mul(0.5)).add(a.z.mul(0.6)).sub(0.2));
  const edgeWear = smoothstep(0.6, 0.85, n2).mul(0.6);
  m.colorNode = Fn(() => {
    const paint = b.rgb.toVar();
    // faixa de cor secundária (listra da facção)
    const stripe = smoothstep(0.08, 0.06, abs(fract(P.x.mul(0.35).add(a.x)).sub(0.5)));
    paint.assign(mix(paint, paint.mul(vec3(1.05, 0.9, 0.6)), stripe.mul(0.5)));
    const metal = vec3(0.56, 0.56, 0.58);
    const c = mix(paint, metal, edgeWear).toVar();
    c.mulAssign(float(1).sub(seam.mul(0.55)));
    c.assign(mix(c, vec3(0.025, 0.02, 0.018), burn.mul(0.92)));
    return c;
  })();
  m.metalnessNode = mix(float(0.35), float(0.95), edgeWear).mul(float(1).sub(burn.mul(0.7)));
  m.roughnessNode = mix(float(0.42), float(0.85), burn).add(n2.mul(0.12));
  // brasas: metal ainda incandescente nas bordas queimadas
  const ember = b.w.mul(smoothstep(0.6, 0.85, burn.mul(n3(P.mul(5.0).add(1.0)).r.mul(1.6))));
  m.emissiveNode = vec3(1.0, 0.32, 0.06).mul(ember.mul(4.0));
  m.normalNode = bumpNormal(seam.mul(-0.6).add(n2.mul(0.25)), a.w.mul(0.04));
  m.fog = false;
  return m;
}

export class DebrisFields {
  constructor(ctx) {
    this.ctx = ctx;
    this.fields = [];
    this.active = null;
    const q = ctx.quality.name;
    this.per = PER_FIELD[q] || PER_FIELD.high;
    this.geos = makeDebrisGeometries();
    this.material = hullMaterial(q);
    this.anchor = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = 'destrocos';
    this.group.visible = false;
    this.meshes = this.geos.map((geo, k) => {
      const g = new THREE.BufferGeometry();
      if (geo.index) g.setIndex(geo.index);
      g.setAttribute('position', geo.attributes.position);
      g.setAttribute('normal', geo.attributes.normal);
      const cap = this.per;
      g.setAttribute('aDeb', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
      g.setAttribute('aPaint', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      const mesh = new THREE.InstancedMesh(g, this.material, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = `destroco-${k}`;
      this.group.add(mesh);
      return mesh;
    });
    this.entry = ctx.world.add(this.group, this.anchor);
  }

  setSystem(sys) {
    this.fields = [];
    const add = (id, pos, radius, faction, burning, seed) => this.fields.push({ id, pos: pos.clone(), radius, faction, burning, seed, pieces: null });
    for (const p of sys.pois || []) {
      if (p.kind === 'debris') add(p.id, p.pos, 5000, 'generic', 0.2, p.seed);
      else if (p.kind === 'derelict') add(p.id, p.pos, 2500, 'corsarios', 0.0, p.seed);
      else if (p.kind === 'opening_battle') add(p.id, p.pos, 9000, 'hegemonia', 1.0, p.seed);
      else if (p.kind === 'ambush') add(p.id, p.pos, 3500, 'guilda', 0.6, p.seed);
    }
    // restos de uma batalha antiga perto do Refúgio Cinza (Frente × Hegemonia)
    const reb = (sys.stations || []).find((s) => s.kind === 'rebel');
    if (reb) add(`${sys.id}:destrocos-refugio`, reb.pos.clone().add(new THREE.Vector3(9000, 1500, -6000)), 6000, 'hegemonia', 0.1, 4141);
    this.active = null;
    this.group.visible = false;
  }

  /** Peças de um campo (determinísticas). */
  pieces(f) {
    if (f.pieces) return f.pieces;
    const r = new Rng(mixSeed(f.seed || 1, 0xdeb));
    const out = [];
    const facs = [f.faction, f.faction, f.faction === 'hegemonia' ? 'frente' : 'hegemonia'];
    for (let i = 0; i < this.per; i++) {
      // concentração em volta de 2–3 "naufrágios"
      const c = i % 3;
      const cr = f.radius * (c === 0 ? 0.35 : 0.6);
      const dir = new THREE.Vector3(r.gauss(), r.gauss() * 0.5, r.gauss()).normalize();
      const dist = Math.pow(r.next(), 0.6) * cr;
      const core = new THREE.Vector3(Math.cos(c * 2.1) * f.radius * 0.3 * (c ? 1 : 0), 0, Math.sin(c * 2.1) * f.radius * 0.3 * (c ? 1 : 0));
      const pos = f.pos.clone().add(core).addScaledVector(dir, dist);
      const size = Math.pow(r.next(), 3) * 38 + 1.5;
      const fac = r.pick(facs);
      const paint = PAINT[fac] || PAINT.generic;
      out.push({
        id: `${f.id}:${i}`, pos, size, geo: Math.floor(r.next() * this.geos.length),
        axis: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
        spin: r.range(0.01, 0.12) * (size < 6 ? 2 : 1), phase: r.range(0, 6.28),
        q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28))),
        seed: r.next() * 10, faction: fac, paint: r.chance(0.7) ? paint[0] : paint[1],
        burn: Math.min(1, r.next() * 0.8 + f.burning * 0.3), ember: f.burning > 0.5 && r.chance(0.35) ? 1 : 0,
      });
    }
    f.pieces = out;
    return out;
  }

  query(p, rad, out = []) {
    out.length = 0;
    for (const f of this.fields) {
      if (f.pos.distanceTo(p) > f.radius + rad) continue;
      for (const pc of this.pieces(f)) {
        const d = pc.pos.distanceTo(p);
        if (d - pc.size <= rad) out.push({ id: pc.id, pos: pc.pos.clone(), radius: pc.size, distance: d, kind: 'debris', faction: pc.faction, resources: ['sucata', 'ligas'] });
      }
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  activate(f) {
    this.active = f;
    this.anchor.copy(f.pos);
    const ps = this.pieces(f);
    const counts = this.meshes.map(() => 0);
    for (const pc of ps) {
      const mesh = this.meshes[pc.geo];
      const i = counts[pc.geo]++;
      pc.slot = i;
      const ad = mesh.geometry.attributes.aDeb.array, ap = mesh.geometry.attributes.aPaint.array;
      ad[i * 4] = pc.seed; ad[i * 4 + 1] = 0; ad[i * 4 + 2] = pc.burn; ad[i * 4 + 3] = pc.size;
      ap[i * 4] = pc.paint[0]; ap[i * 4 + 1] = pc.paint[1]; ap[i * 4 + 2] = pc.paint[2]; ap[i * 4 + 3] = pc.ember;
    }
    this.meshes.forEach((m, k) => { m.count = counts[k]; m.geometry.attributes.aDeb.needsUpdate = true; m.geometry.attributes.aPaint.needsUpdate = true; });
    this.group.visible = true;
  }

  frame(dt, ctx) {
    const cam = ctx.player.camWorld;
    let best = null, bd = Infinity;
    for (const f of this.fields) { const d = f.pos.distanceTo(cam) - f.radius; if (d < 60000 && d < bd) { bd = d; best = f; } }
    if (best !== this.active) { if (best) this.activate(best); else { this.active = null; this.group.visible = false; } }
    if (!this.active) return;
    const t = ctx.time.world;
    for (const pc of this.active.pieces) {
      const mesh = this.meshes[pc.geo];
      _q.setFromAxisAngle(pc.axis, pc.phase + t * pc.spin).multiply(pc.q0);
      _v.copy(pc.pos).sub(this.anchor);
      _s.setScalar(pc.size);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(pc.slot, _m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
