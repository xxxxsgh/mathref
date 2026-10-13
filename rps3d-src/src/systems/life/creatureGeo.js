// Montagem procedural de criaturas por partes: esqueleto (ossos em pose de
// repouso sem rotação — eixos alinhados ao espaço da malha) + uma única malha
// com pele (skinning) que funde tronco, cauda, pescoço, cabeça, pernas, asas,
// placas, chifres e órgãos luminosos. Uma chamada de desenho por criatura.
//
// Espaço da malha: +Z frente, +Y cima, origem no chão sob a pelve (andadores)
// ou no centro do corpo (voadores, vermes, nadadores).
//
// Atributo aMask (vec4) para o material:
//   x = ventre (0..1)   y = comprimento de arco normalizado (listras)
//   z = dorsal (−1..1)  w = região: 0 pele, 1 olho, 2 queratina (chifre/garra/
//   casco/placa), 3 órgão luminoso, 4 membrana, 5 boca/interior, 6 pelagem clara
import * as THREE from 'three/webgpu';
import { rng } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ─── acumulador de geometria com pele ──────────────────────────────────
class GB {
  constructor() { this.pos = []; this.idx = []; this.si = []; this.sw = []; this.mask = []; }
  get n() { return this.pos.length / 3; }
  vert(p, w, m) {
    this.pos.push(p.x, p.y, p.z);
    // até 4 influências, normalizadas
    const ws = w.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0; for (const x of ws) s += x[1];
    for (let k = 0; k < 4; k++) { const x = ws[k]; this.si.push(x ? x[0] : 0); this.sw.push(x ? x[1] / (s || 1) : 0); }
    this.mask.push(m[0], m[1], m[2], m[3]);
    return this.n - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aMask', new THREE.Float32BufferAttribute(this.mask, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Ruído barato determinístico (soma de senos) para irregularidades. */
function wob(x, y, z, s) { return Math.sin(x * 1.7 + s) * Math.sin(y * 2.3 + s * 1.3) * Math.sin(z * 1.9 + s * 0.7); }

/**
 * Tubo suave por juntas (Catmull-Rom), com seção elíptica, ventre caído e
 * pesos de pele mesclados entre o osso de cada segmento e os vizinhos.
 * joints: [{p, rx, ry, bone}] — `bone` é dono do segmento que SAI da junta.
 */
function tube(gb, joints, o = {}) {
  const seg = o.seg ?? 14, sub = o.sub ?? 4;
  const region = o.region ?? 0, sag = o.sag ?? 0, lumps = o.lumps ?? 0, seed = o.seed ?? 0;
  const n = joints.length;
  const pts = joints.map((j) => j.p);
  const cr = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const samples = [];
  let arc = o.arc0 ?? 0;
  let prev = null;
  for (let i = 0; i < n - 1; i++) {
    const steps = i === n - 2 ? sub + 1 : sub;
    for (let k = 0; k < steps; k++) {
      const t = k / sub;
      const p0 = cr(i - 1), p1 = cr(i), p2 = cr(i + 1), p3 = cr(i + 2);
      const t2 = t * t, t3 = t2 * t;
      const p = V(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      );
      const st = t * t * (3 - 2 * t);
      const ja = joints[i], jb = joints[i + 1];
      const rx = ja.rx + (jb.rx - ja.rx) * st, ry = ja.ry + (jb.ry - ja.ry) * st;
      const w = [];
      const b = ja.bone;
      if (t < 0.5 && i > 0) { w.push([joints[i - 1].bone, 0.5 - t]); w.push([b, 0.5 + t]); }
      else if (t > 0.5 && i < n - 2) { w.push([b, 1.5 - t]); w.push([jb.bone, t - 0.5]); }
      else if (t >= 1 && i === n - 2) w.push([b, 1]);
      else w.push([b, 1]);
      if (prev) arc += p.distanceTo(prev);
      prev = p;
      samples.push({ p, rx, ry, w, arc });
    }
  }
  // referencial por transporte paralelo
  const m = samples.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < m; i++) {
    const a = samples[Math.max(0, i - 1)].p, b = samples[Math.min(m - 1, i + 1)].p;
    T.push(b.clone().sub(a).normalize());
  }
  let ref = (o.ref || V(0, 1, 0)).clone();
  for (let i = 0; i < m; i++) {
    let nn;
    if (i === 0) nn = ref.clone().addScaledVector(T[0], -ref.dot(T[0]));
    else { nn = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i])); }
    if (nn.lengthSq() < 1e-8) nn = Math.abs(T[i].y) < 0.9 ? V(0, 1, 0) : V(0, 0, 1);
    nn.normalize();
    N.push(nn); B.push(V().crossVectors(T[i], nn).normalize());
  }
  const L = o.arcNorm || arc || 1;
  const rings = [];
  for (let i = 0; i < m; i++) {
    const s = samples[i];
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      let rx = s.rx, ry = s.ry;
      if (lumps) { const l = 1 + lumps * wob(s.arc * 3.1, c * 2, sn * 2, seed); rx *= l; ry *= l; }
      const down = sn < 0 ? 1 + sag * (-sn) : 1;
      const p = s.p.clone().addScaledVector(B[i], c * rx).addScaledVector(N[i], sn * ry * down);
      const belly = Math.max(0, -sn) ** 1.5;
      ring.push(gb.vert(p, s.w, [belly, s.arc / L, sn, region]));
    }
    rings.push(ring);
  }
  for (let i = 0; i < m - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % seg], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % seg];
      gb.tri(a, c, b); gb.tri(b, c, d);
    }
  }
  // tampas arredondadas
  const cap = (i, dir) => {
    const s = samples[i];
    const r = Math.min(s.rx, s.ry);
    const tipLen = (dir > 0 ? o.capEnd : o.capStart) ?? r;
    let last = rings[i];
    const nr = 3;
    for (let q = 1; q <= nr; q++) {
      const a = (q / (nr + 1)) * Math.PI / 2;
      const kr = Math.cos(a), kz = Math.sin(a) * tipLen;
      const ring = [];
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const c = Math.cos(th), sn = Math.sin(th);
        const p = s.p.clone().addScaledVector(T[i], dir * kz).addScaledVector(B[i], c * s.rx * kr).addScaledVector(N[i], sn * s.ry * kr);
        ring.push(gb.vert(p, s.w, [Math.max(0, -sn) ** 1.5, s.arc / L, sn, region]));
      }
      for (let k = 0; k < seg; k++) {
        const a0 = last[k], b0 = last[(k + 1) % seg], c0 = ring[k], d0 = ring[(k + 1) % seg];
        if (dir > 0) { gb.tri(a0, c0, b0); gb.tri(b0, c0, d0); } else { gb.tri(a0, b0, c0); gb.tri(b0, d0, c0); }
      }
      last = ring;
    }
    const tip = gb.vert(s.p.clone().addScaledVector(T[i], dir * tipLen), s.w, [0, s.arc / L, 0, region]);
    for (let k = 0; k < seg; k++) { if (dir > 0) gb.tri(last[k], tip, last[(k + 1) % seg]); else gb.tri(last[k], last[(k + 1) % seg], tip); }
  };
  if (o.capStart !== false) cap(0, -1);
  if (o.capEnd !== false) cap(m - 1, 1);
  return { arc, samples, T, N, B };
}

/** Elipsoide deformável (cabeça, olhos, placas, nódulos). fn(p, u, v) pode deformar. */
function ellipsoid(gb, center, rx, ry, rz, w, region, o = {}) {
  const ws = o.ws ?? 14, hs = o.hs ?? 10;
  const q = o.quat || null;
  const verts = [];
  for (let j = 0; j <= hs; j++) {
    const v = j / hs, phi = v * Math.PI;
    const row = [];
    for (let i = 0; i < ws; i++) {
      const th = (i / ws) * Math.PI * 2;
      const lp = V(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const p = V(lp.x * rx, lp.y * ry, lp.z * rz);
      if (o.deform) o.deform(p, lp);
      if (q) p.applyQuaternion(q);
      p.add(center);
      const ww = typeof w === 'function' ? w(p, lp) : w;
      const reg = typeof region === 'function' ? region(p, lp) : region;
      row.push(gb.vert(p, ww, [Math.max(0, -lp.y) ** 1.5, o.arc ?? 0.5, lp.y, reg]));
    }
    verts.push(row);
  }
  for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
    const a = verts[j][i], b = verts[j][(i + 1) % ws], c = verts[j + 1][i], d = verts[j + 1][(i + 1) % ws];
    gb.tri(a, b, c); gb.tri(b, d, c);
  }
}

// tube() usa j.bone para pesos; para partes rígidas, montamos com um osso só
function rigidTube(gb, pts, radii, bone, o = {}) {
  return tube(gb, pts.map((p, i) => ({ p, rx: radii[i] * (o.sx ?? 1), ry: radii[i] * (o.sy ?? 1), bone })), o);
}
function rigidHorn(gb, base, dir, bend, len, r0, bone, region = 2, sides = 7) {
  const pts = [], radii = [];
  const p = base.clone(), d = dir.clone().normalize();
  const segs = 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(p.clone()); radii.push(Math.max(0.002, r0 * (1 - t * 0.9)));
    p.addScaledVector(d, len / segs);
    d.add(bend.clone().multiplyScalar(1 / segs)).normalize();
  }
  return rigidTube(gb, pts, radii, bone, { seg: sides, sub: 1, region, capStart: false, capEnd: r0 * 0.5 });
}

// ─── esqueleto ─────────────────────────────────────────────────────────
class Rig {
  constructor() { this.bones = []; this.legs = []; this.wings = []; this.spine = []; this.neck = []; this.tail = []; this.petals = []; this.head = -1; this.jaw = -1; }
  add(name, parent, pos) { this.bones.push({ name, parent, pos: pos.clone() }); return this.bones.length - 1; }
  P(i) { return this.bones[i].pos; }
}

/** IK de 2 ossos em repouso (para posar as pernas). */
function solveKnee(A, T, L1, L2, pole) {
  const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, A.distanceTo(T)));
  const dir = T.clone().sub(A).normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return A.clone().addScaledVector(dir, a).addScaledVector(pp, h);
}

// ─── construtor principal ──────────────────────────────────────────────
export function buildCreature(g) {
  if (g.plan === 'worm') return buildWorm(g);
  if (g.plan === 'marine') return buildMarine(g);
  const r = rng(g.seed);
  const rig = new Rig();
  const gb = new GB();
  const flyer = g.plan === 'flyer';
  const biped = g.plan === 'biped';
  const H = flyer ? 0 : g.H, L = g.L, G = g.girth;
  const root = rig.add('root', -1, V(0, 0, 0));
  // tronco: pelve → meio → peito
  const chestY = H + (biped ? G * 0.25 : G * g.hump * 0.8 + (g.plan === 'hexa' ? 0 : G * 0.1));
  const pelvis = rig.add('pelvis', root, V(0, H, 0));
  const mid = rig.add('spine', pelvis, V(0, (H + chestY) / 2 + G * g.spineArch, L * 0.5));
  const chest = rig.add('chest', mid, V(0, chestY, L));
  rig.spine = [pelvis, mid, chest];
  // pescoço
  const neckDir = V(0, Math.sin(g.neck.raise), Math.cos(g.neck.raise));
  let np = V(0, chestY + G * 0.25, L + G * 0.55);
  let parent = chest;
  const neckSeg = g.neck.len / g.neck.segs;
  for (let i = 0; i < g.neck.segs; i++) {
    const b = rig.add('neck' + i, parent, np);
    rig.neck.push(b); parent = b;
    // o pescoço curva para a horizontal perto da cabeça
    const k = i / Math.max(1, g.neck.segs - 1);
    const dd = neckDir.clone().lerp(V(0, 0.1, 1), k * 0.45).normalize();
    np = np.clone().addScaledVector(dd, neckSeg);
  }
  const headP = np.clone();
  const head = rig.add('head', parent, headP);
  rig.head = head;
  const HL = g.head.len, HW = g.head.w, HH = g.head.h;
  const headPitch = flyer ? 0 : biped ? 0.08 : g.neck.raise > 0.7 ? 0.35 : 0.15; // cabeça inclinada p/ baixo
  const hq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), headPitch);
  const hf = V(0, 0, 1).applyQuaternion(hq), hu = V(0, 1, 0).applyQuaternion(hq);
  if (g.head.jaw) rig.jaw = rig.add('jaw', head, headP.clone().addScaledVector(hu, -HH * 0.35).addScaledVector(hf, HL * 0.12));
  // cauda
  const tailDir0 = V(0, -Math.sin(g.tail.droop * 0.5), -Math.cos(g.tail.droop * 0.5)).normalize();
  let tp = V(0, H + G * 0.15, -G * 0.6);
  parent = pelvis;
  const tSeg = g.tail.len / g.tail.segs;
  const tailPts = [];
  for (let i = 0; i < g.tail.segs; i++) {
    const b = rig.add('tail' + i, parent, tp);
    rig.tail.push(b); parent = b; tailPts.push(tp.clone());
    const k = (i + 1) / g.tail.segs;
    const dd = tailDir0.clone().add(V(0, -g.tail.droop * k * 0.9 + (flyer ? 0.05 : 0), 0)).normalize();
    tp = tp.clone().addScaledVector(dd, tSeg);
  }
  const tailTip = tp.clone();

  // ── corpo: um tubo contínuo cauda → pelve → peito → pescoço → cabeça
  const joints = [];
  const tg = g.tail.girth;
  joints.push({ p: tailTip, rx: tg * 0.12, ry: tg * 0.12, bone: rig.tail[rig.tail.length - 1] });
  for (let i = rig.tail.length - 1; i >= 0; i--) {
    // segmento que sai da junta i em direção à pelve pertence ao osso tail[i−1] (ou à pelve)
    const rad = tg * (0.35 + 0.65 * (1 - i / rig.tail.length));
    const club = g.tail.club && i === rig.tail.length - 1 ? 1.4 : 1;
    joints.push({ p: tailPts[i], rx: rad * (i === 0 ? 1.15 : 1) * club, ry: rad * 1.05 * club, bone: i === 0 ? pelvis : rig.tail[i - 1] });
  }
  const bodyR = G;
  joints.push({ p: V(0, H + G * 0.05, G * 0.15), rx: bodyR * 0.95, ry: bodyR * 1.0, bone: pelvis });
  joints.push({ p: rig.P(mid).clone().add(V(0, 0, 0)), rx: bodyR * (1.05 + (biped ? 0 : 0.08)), ry: bodyR * (1.12 + g.hump * 0.25), bone: mid });
  joints.push({ p: rig.P(chest).clone().add(V(0, G * g.hump * 0.3, 0)), rx: bodyR * (biped ? 0.82 : 1.0), ry: bodyR * (1.08 + g.hump * 0.45), bone: chest });
  const nG = g.neck.girth;
  joints.push({ p: V(0, chestY + G * 0.18, L + G * 0.6), rx: (bodyR * 0.7 + nG) * 0.55 + nG * 0.2, ry: (bodyR * 0.8 + nG) * 0.55 + nG * 0.2, bone: rig.neck[0] });
  for (let i = 1; i < rig.neck.length; i++) {
    const k = i / rig.neck.length;
    joints.push({ p: rig.P(rig.neck[i]).clone(), rx: nG * (1 - k * 0.25), ry: nG * (1.1 - k * 0.2), bone: rig.neck[i] });
  }
  joints.push({ p: headP.clone().addScaledVector(hf, HL * 0.05), rx: Math.max(nG * 0.8, HW * 0.75), ry: Math.max(nG * 0.85, HH * 0.75), bone: head });
  // pelagem/escamas: leve irregularidade
  const bodyArc = tube(gb, joints, { seg: 18, sub: 4, sag: biped ? 0.08 : 0.18 + g.hump * 0.1, lumps: g.skin.fur ? 0.06 : 0.025, seed: g.seed % 97, capStart: tg * 0.2, capEnd: HW * 0.3 });
  const arcL = bodyArc.arc;

  // ── cabeça
  const hcenter = headP.clone().addScaledVector(hf, HL * 0.42);
  const snout = g.head.snout;
  const jawB = rig.jaw;
  ellipsoid(gb, hcenter, HW, HH, HL * 0.55, (p, lp) => (jawB >= 0 && lp.y < -0.25 && lp.z > -0.2 ? [[jawB, 1]] : [[head, 1]]), (p, lp) => (lp.y < -0.15 && lp.z > 0.5 && jawB >= 0 ? 5 : 0), {
    quat: hq, ws: 18, hs: 14, arc: 0.98,
    deform: (p, lp) => {
      // focinho: afina e alonga na frente; crânio largo atrás
      const z = lp.z;
      if (z > 0) { const k = 1 - snout * z * z * 0.55; p.x *= k; p.y *= 1 - snout * z * z * 0.35; p.z *= 1 + snout * 0.35; }
      // testa/arcos superciliares
      if (lp.y > 0.3 && z > -0.1 && z < 0.5) p.y += HH * 0.12 * Math.sin((z + 0.1) / 0.6 * Math.PI) * (lp.y - 0.3);
      // boca: sulco lateral
      if (Math.abs(lp.y + 0.2) < 0.12 && z > 0.1) { p.x *= 0.92; }
      // bochechas
      if (z < 0 && Math.abs(lp.x) > 0.6) p.x *= 1.08;
    },
  });
  // mandíbula inferior (predadores): uma lâmina extra com dentes
  if (jawB >= 0 && g.head.jaw >= 1) {
    const jc = headP.clone().addScaledVector(hf, HL * 0.48).addScaledVector(hu, -HH * 0.5);
    ellipsoid(gb, jc, HW * 0.78, HH * 0.32, HL * 0.42, [[jawB, 1]], 0, { quat: hq, ws: 12, hs: 8, arc: 0.97, deform: (p, lp) => { if (lp.z > 0) { p.x *= 1 - lp.z * lp.z * 0.4; } } });
    // dentes
    const nt = 5;
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < nt; i++) {
      const z = HL * (0.25 + 0.55 * i / nt);
      const base = headP.clone().addScaledVector(hf, z + HL * 0.15).addScaledVector(hu, -HH * 0.32).add(V(s * HW * (0.62 - 0.3 * i / nt), 0, 0));
      rigidHorn(gb, base, hu.clone().negate(), V(0, 0, 0.3), HH * 0.22, HH * 0.05, head, 2, 4);
    }
  }
  // olhos
  const ne = g.head.eyes;
  for (let e = 0; e < ne; e++) {
    const s = e % 2 ? 1 : -1, row = Math.floor(e / 2);
    const es = Math.min(HW, HH) * g.head.eyeSize * 3.2 * (row ? 0.7 : 1);
    const ep = headP.clone().addScaledVector(hf, HL * (0.55 - row * 0.18)).addScaledVector(hu, HH * (0.28 + row * 0.18)).add(V(s * HW * (0.72 - row * 0.1), 0, 0));
    ellipsoid(gb, ep, es, es, es, [[head, 1]], 1, { ws: 10, hs: 8 });
    // pálpebra/arcada
    ellipsoid(gb, ep.clone().add(V(0, es * 0.5, -es * 0.1)), es * 1.25, es * 0.45, es * 1.1, [[head, 1]], 0, { ws: 10, hs: 6 });
  }
  // chifres
  const hn = g.head.horns;
  if (hn) {
    for (let i = 0; i < hn.count; i++) {
      const s = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const base = headP.clone().addScaledVector(hf, HL * (0.18 + row * 0.25)).addScaledVector(hu, HH * 0.75).add(V(s * HW * 0.55, 0, 0));
      let dir, bend;
      if (hn.kind === 'curl') { dir = V(s * 0.7, 0.6, -0.4); bend = V(-s * 0.2, -1.6 * hn.curve, 0.8); }
      else if (hn.kind === 'spike') { dir = V(s * 0.25, 0.8, 0.45 - row * 0.5); bend = V(0, 0.1, 0.2 * hn.curve); }
      else if (hn.kind === 'swept') { dir = V(s * 0.35, 0.45, -0.85); bend = V(0, 0.6 * hn.curve, -0.2); }
      else { dir = V(s * 0.5, 0.85, 0); bend = V(s * 0.3, 0.2, 0.6 * hn.curve); }
      const len = hn.len * (row ? 0.6 : 1);
      rigidHorn(gb, base, dir, bend, len, HW * 0.16 * (row ? 0.7 : 1), head, 2, 8);
      if (hn.kind === 'branch' && !row) {
        const mid2 = base.clone().addScaledVector(dir.clone().normalize(), len * 0.5);
        rigidHorn(gb, mid2, V(s * 0.6, 0.4, 0.5), V(0, 0.3, 0), len * 0.45, HW * 0.07, head, 2, 6);
      }
    }
  }
  if (g.head.tusks) {
    for (let s = -1; s <= 1; s += 2) {
      const base = headP.clone().addScaledVector(hf, HL * 0.75).addScaledVector(hu, -HH * 0.35).add(V(s * HW * 0.45, 0, 0));
      rigidHorn(gb, base, V(s * 0.3, -0.3, 0.9), V(0, 1.4, -0.2), HL * 0.45, HW * 0.1, jawB >= 0 ? jawB : head, 2, 7);
    }
  }
  if (g.head.antennae) {
    for (let s = -1; s <= 1; s += 2) {
      const base = headP.clone().addScaledVector(hf, HL * 0.6).addScaledVector(hu, HH * 0.7).add(V(s * HW * 0.3, 0, 0));
      rigidHorn(gb, base, V(s * 0.4, 0.7, 0.6), V(s * 0.4, -0.9, 0.3), HL * 1.2, HW * 0.04, head, 2, 5);
      ellipsoid(gb, base.clone().add(V(s * HL * 0.55, HL * 0.42, HL * 0.75)), HW * 0.09, HW * 0.09, HW * 0.09, [[head, 1]], 3, { ws: 6, hs: 5 });
    }
  }
  // crista: barbatana fina sobre a cabeça e o pescoço
  if (g.head.crest) {
    const cr = g.head.crest;
    const pts = [], radii = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(headP.clone().addScaledVector(hf, HL * (0.7 - t * 1.3)).addScaledVector(hu, HH * (0.9 + Math.sin(t * Math.PI) * cr * 1.4)));
      radii.push(HW * 0.06 * (1 - t * 0.5));
    }
    rigidTube(gb, pts, radii, head, { seg: 6, sub: 2, region: 4, sx: 0.5, sy: 3.2 * cr, capStart: HW * 0.05, capEnd: HW * 0.05 });
  }
  // gola (frill) atrás da cabeça
  if (g.head.frill) {
    const fr = g.head.frill;
    const c = headP.clone().addScaledVector(hf, -HL * 0.05).addScaledVector(hu, HH * 0.3);
    ellipsoid(gb, c, HW * (1.6 + fr), HH * (1.4 + fr), HL * 0.08, [[head, 1]], 4, { quat: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), headPitch - 0.5), ws: 22, hs: 8, deform: (p, lp) => { if (lp.y < -0.3) p.y *= 0.4; const k = Math.atan2(lp.x, lp.y); p.multiplyScalar(1 + 0.08 * Math.cos(k * 9)); } });
  }

  // ── placas dorsais / espinhos / nódulos luminosos
  const sp = bodyArc.samples;
  if (g.skin.armor) {
    const nP = 8 + Math.floor(r() * 4);
    for (let i = 0; i < nP; i++) {
      const t = 0.15 + 0.8 * i / nP;
      const si = Math.floor(t * (sp.length - 1));
      const s = sp[si];
      const Nn = bodyArc.N[si];
      const c = s.p.clone().addScaledVector(Nn, s.ry * 0.88);
      const sz = s.rx * (0.55 + 0.25 * Math.sin(t * Math.PI));
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), Nn).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.35));
      ellipsoid(gb, c, sz * 1.1, sz * 0.32, sz * 0.75, s.w, 2, { quat: q, ws: 10, hs: 6, arc: s.arc / arcL, deform: (p, lp) => { if (lp.y > 0) p.y *= 1 + 0.6 * (1 - Math.abs(lp.x)); } });
    }
  } else if (r() < 0.55) {
    // espinhos/cerdas ao longo do dorso
    const nP = 10;
    for (let i = 0; i < nP; i++) {
      const t = 0.1 + 0.75 * i / nP;
      const si = Math.floor(t * (sp.length - 1));
      const s = sp[si];
      const base = s.p.clone().addScaledVector(bodyArc.N[si], s.ry * 0.85);
      rigidHorn(gb, base, bodyArc.N[si].clone().add(V(0, 0, -0.6)), V(0, 0, -0.3), s.ry * 0.35 * Math.sin(t * Math.PI + 0.3), s.rx * 0.07, s.w[0][0], 2, 5);
    }
  }
  if (g.skin.glow > 0.2) {
    // fileiras de órgãos luminosos nos flancos
    const nd = 14;
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < nd; i++) {
      const t = 0.12 + 0.82 * i / nd;
      const si = Math.floor(t * (sp.length - 1));
      const s = sp[si];
      const th = side > 0 ? 0.25 : Math.PI - 0.25;
      const p = s.p.clone().addScaledVector(bodyArc.B[si], Math.cos(th) * s.rx * 1.0).addScaledVector(bodyArc.N[si], Math.sin(th) * s.ry * 0.98);
      const rr = s.rx * 0.07 * (0.7 + 0.5 * Math.sin(i * 1.7));
      ellipsoid(gb, p, rr, rr, rr, s.w, 3, { ws: 6, hs: 4 });
    }
  }

  // ── pernas
  const pairs = g.legs.pairs;
  const legZ = pairs === 3 ? [0.05, 0.5, 0.95] : pairs === 2 ? [0.02, 0.98] : [0.08];
  const legAttach = pairs === 3 ? [pelvis, mid, chest] : pairs === 2 ? [pelvis, chest] : [pelvis];
  for (let pi = 0; pi < pairs; pi++) {
    for (let side = -1; side <= 1; side += 2) {
      const att = legAttach[pi];
      const ap = rig.P(att);
      const z = legZ[pi] * L;
      const spider = g.legs.knee === 'spider';
      const hipP = V(side * G * (spider ? 0.75 : 0.62), (pi === 0 ? H : pi === pairs - 1 ? chestY : (H + chestY) / 2) - G * (spider ? 0.1 : 0.42), z);
      const LL = g.legs.len * (pi === pairs - 1 && pairs > 1 && !spider ? 0.98 : 1);
      const ankleH = g.legs.thick * (g.legs.foot === 'hoof' ? 1.6 : 1.1);
      const L1 = LL * (spider ? 0.58 : g.legs.knee === 'bird' ? 0.46 : 0.5);
      const L2 = LL * (spider ? 0.72 : g.legs.knee === 'bird' ? 0.56 : 0.5);
      // pé em repouso
      const footP = V(side * (spider ? G * 0.75 + LL * 0.62 * g.legs.spread : G * 0.62), ankleH, z + (spider ? (pi - 1) * LL * 0.35 : 0));
      const rear = pi === 0 && pairs > 1;
      const pole = spider ? V(side * 0.4, 1, 0) : g.legs.knee === 'bird' ? V(0, 0, 1) : rear ? V(0, 0, 1) : V(0, 0, -1);
      // pernas de mamífero: articulação mais próxima do chão (joelho alto, jarrete)
      const kneeP = solveKnee(hipP, footP, L1, L2, pole);
      const toeLen = g.legs.foot === 'hoof' ? ankleH * 0.6 : ankleH * 1.6;
      const toeP = footP.clone().add(V(spider ? side * toeLen * 0.4 : 0, -ankleH * 0.85, spider ? 0 : toeLen * 0.55));
      const hipB = rig.add(`leg${pi}${side > 0 ? 'R' : 'L'}0`, att, hipP);
      const kneeB = rig.add(`leg${pi}${side > 0 ? 'R' : 'L'}1`, hipB, kneeP);
      const ankleB = rig.add(`leg${pi}${side > 0 ? 'R' : 'L'}2`, kneeB, footP);
      void ap;
      rig.legs.push({ hip: hipB, knee: kneeB, ankle: ankleB, side, pair: pi, L1: hipP.distanceTo(kneeP), L2: kneeP.distanceTo(footP), pole, rest: footP.clone(), toe: toeP.clone(), ankleH, attach: att, spider });
      // geometria: coxa → joelho → canela → tornozelo
      const T0 = g.legs.thick;
      const lj = [
        { p: hipP.clone().add(V(0, G * 0.3, 0)), rx: T0 * 1.5, ry: T0 * 1.7, bone: hipB },
        { p: hipP.clone().lerp(kneeP, 0.35), rx: T0 * 1.25, ry: T0 * 1.35, bone: hipB },
        { p: kneeP, rx: T0 * 0.78, ry: T0 * 0.82, bone: kneeB },
        { p: kneeP.clone().lerp(footP, 0.5), rx: T0 * 0.55, ry: T0 * 0.6, bone: kneeB },
        { p: footP, rx: T0 * 0.5, ry: T0 * 0.5, bone: ankleB },
        { p: toeP, rx: T0 * 0.45, ry: T0 * 0.35, bone: ankleB },
      ];
      tube(gb, lj, { seg: 10, sub: 3, region: 0, ref: V(0, 0, 1), capStart: T0, capEnd: T0 * 0.4, arc0: 0, arcNorm: arcL, lumps: g.skin.fur ? 0.08 : 0.03, seed: pi * 7 + side });
      // pés
      if (g.legs.foot === 'hoof') {
        ellipsoid(gb, toeP.clone().add(V(0, ankleH * 0.2, 0)), T0 * 0.65, ankleH * 0.42, T0 * 0.75, [[ankleB, 1]], 2, { ws: 10, hs: 6 });
      } else if (g.legs.foot === 'pad') {
        ellipsoid(gb, toeP.clone().add(V(0, ankleH * 0.12, T0 * 0.2)), T0 * 0.8, ankleH * 0.35, T0 * 1.05, [[ankleB, 1]], 0, { ws: 10, hs: 6 });
        for (let c = -1; c <= 1; c++) rigidHorn(gb, toeP.clone().add(V(c * T0 * 0.4, ankleH * 0.1, T0 * 0.9)), V(c * 0.2, -0.2, 1), V(0, -0.8, 0), T0 * 0.5, T0 * 0.12, ankleB, 2, 5);
      } else {
        for (let c = -1; c <= 1; c++) rigidHorn(gb, toeP.clone().add(V(0, ankleH * 0.15, 0)), V(c * 0.45 + (spider ? side * 0.4 : 0), -0.15, 1), V(0, -1.2, 0), T0 * (spider ? 0.9 : 0.75), T0 * 0.18, ankleB, 2, 5);
      }
    }
  }
  // bípedes: bracinhos dianteiros
  if (biped) {
    for (let side = -1; side <= 1; side += 2) {
      const sh = V(side * G * 0.6, chestY - G * 0.35, L * 0.9);
      const el = sh.clone().add(V(side * G * 0.15, -G * 0.55, G * 0.25));
      const hd = el.clone().add(V(0, -G * 0.15, G * 0.45));
      const T0 = g.legs.thick * 0.35;
      rigidTube(gb, [sh, el, hd], [T0 * 1.2, T0 * 0.8, T0 * 0.6], chest, { seg: 8, sub: 3, region: 0, capStart: T0, capEnd: T0 * 0.5 });
      for (let c = -1; c <= 1; c += 2) rigidHorn(gb, hd, V(c * 0.3, -0.5, 1), V(0, -1, 0), T0 * 1.4, T0 * 0.3, chest, 2, 4);
    }
  }

  // ── asas (membrana dupla face com dedos)
  if (g.wings) {
    const W = g.wings;
    for (let side = -1; side <= 1; side += 2) {
      const sh = V(side * G * 0.7, chestY + G * 0.25, L * 0.72);
      const el = V(side * (G * 0.7 + W.span * 0.22), chestY + G * 0.45, L * 0.62);
      const tip = V(side * W.span * 0.5, chestY + G * 0.2, L * 0.25);
      const w0 = rig.add(`wing${side > 0 ? 'R' : 'L'}0`, chest, sh);
      const w1 = rig.add(`wing${side > 0 ? 'R' : 'L'}1`, w0, el);
      rig.wings.push({ root: w0, mid: w1, side, sh: sh.clone(), el: el.clone(), tip: tip.clone() });
      // braço ósseo da asa
      rigidTube(gb, [sh, el], [G * 0.22, G * 0.14], w0, { seg: 8, sub: 2, capStart: false, capEnd: false });
      rigidTube(gb, [el, tip], [G * 0.13, G * 0.03], w1, { seg: 7, sub: 3, capStart: G * 0.1, capEnd: G * 0.05 });
      // membrana: grade (span × corda), borda de fuga recortada
      const NS = 9, NC = 5;
      const grid = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS;
        // borda de ataque ao longo de sh→el→tip
        const lead = t < 0.4 ? sh.clone().lerp(el, t / 0.4) : el.clone().lerp(tip, (t - 0.4) / 0.6);
        // borda de fuga: do corpo (pelve) até a ponta, recortada entre os dedos
        const chord = W.chord * (1 - t) ** 0.7 * (1 - 0.35 * Math.abs(Math.sin(t * Math.PI * (W.fingers + 0.5))));
        const row = [];
        for (let j = 0; j <= NC; j++) {
          const u = j / NC;
          const p = lead.clone().add(V(0, -u * chord * 0.08 * (1 - t), -u * chord));
          // curvatura (camber)
          p.y += Math.sin(u * Math.PI) * chord * 0.06;
          const wt = t < 0.4 ? [[chest, Math.max(0, 1 - t / 0.15)], [w0, 1 - Math.max(0, (t - 0.25) / 0.15)], [w1, Math.max(0, (t - 0.25) / 0.15)]] : [[w1, 1]];
          row.push({ p, wt: wt.filter((x) => x[1] > 0.001), u, t });
        }
        grid.push(row);
      }
      for (const face of [1, -1]) {
        const ids = grid.map((row) => row.map((v) => gb.vert(v.p.clone().add(V(0, face * G * 0.012, 0)), v.wt, [0, v.t, face, 4])));
        for (let i = 0; i < NS; i++) for (let j = 0; j < NC; j++) {
          const a = ids[i][j], b = ids[i + 1][j], c = ids[i][j + 1], d = ids[i + 1][j + 1];
          if ((face > 0) === (side > 0)) { gb.tri(a, c, b); gb.tri(b, c, d); } else { gb.tri(a, b, c); gb.tri(b, d, c); }
        }
      }
      // dedos (nervuras)
      for (let f = 0; f < W.fingers; f++) {
        const t = 0.45 + 0.5 * (f + 1) / (W.fingers + 1);
        const lead = el.clone().lerp(tip, (t - 0.4) / 0.6);
        const chord = W.chord * (1 - t) ** 0.7;
        rigidTube(gb, [lead, lead.clone().add(V(0, 0, -chord * 0.95))], [G * 0.04, G * 0.015], w1, { seg: 5, sub: 2, capStart: false, capEnd: G * 0.02 });
      }
    }
  }

  const geo = gb.build();
  // dimensões para colisão/IK
  const headTop = headP.y + HH;
  rig.dims = { H, L, G, chestY, headP: headP.clone(), headR: Math.max(HW, HH, HL * 0.5), headTop, tailTip: tailTip.clone(), flyer, size: Math.max(L + g.neck.len + HL, H) };
  rig.hit = { a: V(0, H, -G * 0.3), b: V(0, chestY, L + G * 0.3), r: G * 1.05, head: headP.clone().addScaledVector(hf, HL * 0.4), hr: Math.max(HW, HH) * 1.1 };
  return { geo, rig };
}

// ─── verme gigante ─────────────────────────────────────────────────────
function buildWorm(g) {
  const rig = new Rig(); const gb = new GB();
  const N = 18, Len = g.L, R = g.girth * 1.0;
  const root = rig.add('root', -1, V(0, 0, 0));
  let parent = root;
  const seg = Len / N;
  const joints = [];
  for (let i = 0; i < N; i++) {
    const p = V(0, 0, -Len / 2 + i * seg);
    const b = rig.add('s' + i, parent, p);
    rig.spine.push(b); parent = b;
    const k = i / (N - 1);
    const rad = R * (0.55 + 0.45 * Math.sin(Math.min(1, k * 1.25 + 0.05) * Math.PI * 0.5)) * (1 + 0.06 * Math.sin(i * 2.1));
    joints.push({ p, rx: rad, ry: rad, bone: b });
  }
  const headP = V(0, 0, Len / 2);
  const head = rig.add('head', parent, headP);
  rig.head = head;
  joints.push({ p: headP, rx: R * 1.08, ry: R * 1.08, bone: head });
  // anéis de segmentação (sulcos) — o tubo tem "lumps" fortes ao longo do comprimento
  tube(gb, joints, { seg: 22, sub: 5, sag: 0, lumps: 0.0, capStart: R * 0.6, capEnd: false, region: 0 });
  // placas de couraça em anéis
  for (let i = 1; i < N; i += 1) {
    const p = V(0, 0, -Len / 2 + i * seg + seg * 0.5);
    const k = i / (N - 1);
    const rad = R * (0.55 + 0.45 * Math.sin(Math.min(1, k * 1.25 + 0.05) * Math.PI * 0.5)) * 1.06;
    const ring = [];
    const ns = 9;
    for (let s = 0; s < ns; s++) {
      const th = (s / ns) * Math.PI * 2 + (i % 2) * 0.35;
      if (Math.sin(th) < -0.55) continue; // ventre liso
      const c = p.clone().add(V(Math.cos(th) * rad, Math.sin(th) * rad, 0));
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(Math.cos(th), Math.sin(th), 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.25));
      ellipsoid(gb, c, rad * 0.42, rad * 0.11, seg * 0.62, [[rig.spine[Math.min(N - 1, i)], 0.6], [rig.spine[Math.max(0, i - 1)], 0.4]], 2, { quat: q, ws: 8, hs: 5, arc: k });
      ring.push(c);
    }
  }
  // boca: pétalas de mandíbula que se abrem (ossos próprios)
  const NP = 5;
  for (let i = 0; i < NP; i++) {
    const th = (i / NP) * Math.PI * 2 + Math.PI / 2;
    const base = headP.clone().add(V(Math.cos(th) * R * 0.95, Math.sin(th) * R * 0.95, 0));
    const b = rig.add('petal' + i, head, base);
    rig.petals.push({ bone: b, th });
    const out = V(Math.cos(th), Math.sin(th), 0);
    // pétala: lâmina curva com dentes por dentro
    const pts = [], radii = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(base.clone().addScaledVector(V(0, 0, 1), R * 1.6 * t).addScaledVector(out, -R * 0.55 * t * t));
      radii.push(R * 0.42 * (1 - t * 0.75));
    }
    tube(gb, pts.map((p, k) => ({ p, rx: radii[k], ry: radii[k] * 0.28, bone: b })), { seg: 8, sub: 2, region: 2, ref: out, capStart: false, capEnd: R * 0.15 });
    for (let k = 0; k < 4; k++) {
      const t = 0.2 + k * 0.2;
      const tb = base.clone().addScaledVector(V(0, 0, 1), R * 1.6 * t).addScaledVector(out, -R * 0.55 * t * t - R * 0.1);
      rigidHorn(gb, tb, out.clone().negate().add(V(0, 0, 0.6)), V(0, 0, -0.3), R * 0.35, R * 0.07, b, 2, 5);
    }
  }
  // garganta luminosa
  ellipsoid(gb, headP.clone().add(V(0, 0, -R * 0.05)), R * 0.8, R * 0.8, R * 0.25, [[head, 1]], 5, { ws: 14, hs: 6 });
  const geo = gb.build();
  rig.dims = { H: 0, L: Len, G: R, headP: headP.clone(), headR: R * 1.3, flyer: false, size: Len, seg };
  rig.hit = { a: V(0, 0, -Len / 2), b: V(0, 0, Len / 2), r: R, head: headP.clone(), hr: R * 1.5 };
  return { geo, rig };
}

// ─── nadador (visto da costa) ─────────────────────────────────────────
function buildMarine(g) {
  const rig = new Rig(); const gb = new GB();
  const N = 8, Len = g.L, R = g.girth;
  const root = rig.add('root', -1, V(0, 0, 0));
  let parent = root;
  const joints = [];
  const prof = (k) => R * (0.18 + 0.82 * Math.sin(Math.min(1, k * 1.15 + 0.08) * Math.PI) ** 0.7);
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const p = V(0, 0, -Len / 2 + k * Len * 0.74);
    const b = rig.add('s' + i, parent, p);
    rig.spine.push(b); parent = b;
    joints.push({ p, rx: prof(k) * 1.05, ry: prof(k) * 0.85, bone: b });
  }
  const headP = V(0, 0, Len * 0.38);
  const head = rig.add('head', parent, headP);
  rig.head = head;
  joints.push({ p: V(0, -R * 0.05, Len / 2), rx: R * 0.5, ry: R * 0.4, bone: head });
  tube(gb, joints, { seg: 18, sub: 4, sag: 0.25, lumps: 0.02, capStart: R * 0.2, capEnd: R * 0.45 });
  // nadadeira caudal (horizontal, tipo baleia) — membrana
  const tb = rig.spine[0];
  for (let s = -1; s <= 1; s += 2) {
    const pts = [V(0, 0, -Len / 2 + R * 0.2), V(s * R * 1.4, 0, -Len / 2 - R * 0.6), V(s * R * 2.4, 0, -Len / 2 - R * 0.4)];
    rigidTube(gb, pts, [R * 0.25, R * 0.2, R * 0.05], tb, { seg: 8, sub: 3, sx: 1, sy: 0.25, region: 0, capStart: false, capEnd: R * 0.2, ref: V(0, 1, 0) });
  }
  // nadadeiras peitorais
  const pb = rig.spine[5];
  for (let s = -1; s <= 1; s += 2) {
    const a = V(s * R * 0.8, -R * 0.3, Len * 0.15), b = V(s * R * 2.2, -R * 0.65, Len * 0.0);
    rigidTube(gb, [a, a.clone().lerp(b, 0.5), b], [R * 0.32, R * 0.25, R * 0.06], pb, { seg: 8, sub: 3, sy: 0.3, capStart: false, capEnd: R * 0.15 });
  }
  // barbatana dorsal
  const db = rig.spine[3];
  rigidTube(gb, [V(0, R * 0.7, -Len * 0.08), V(0, R * 1.35, -Len * 0.15)], [R * 0.3, R * 0.04], db, { seg: 8, sub: 3, sx: 0.25, sy: 1, capStart: false, capEnd: R * 0.1 });
  // olhos e manchas luminosas
  for (let s = -1; s <= 1; s += 2) {
    ellipsoid(gb, V(s * R * 0.42, R * 0.05, Len * 0.4), R * 0.06, R * 0.06, R * 0.06, [[head, 1]], 1, { ws: 8, hs: 6 });
    for (let i = 0; i < 9; i++) {
      const k = 0.2 + i * 0.07;
      const p = V(s * prof(k) * 0.95, -prof(k) * 0.15, -Len / 2 + k * Len * 0.88);
      ellipsoid(gb, p, R * 0.05, R * 0.05, R * 0.05, [[rig.spine[Math.min(N - 1, Math.round(k * (N - 1)))], 1]], 3, { ws: 6, hs: 4 });
    }
  }
  const geo = gb.build();
  rig.dims = { H: 0, L: Len, G: R, headP: headP.clone(), headR: R, flyer: false, size: Len };
  rig.hit = { a: V(0, 0, -Len / 2), b: V(0, 0, Len / 2), r: R, head: headP.clone(), hr: R };
  return { geo, rig };
}
