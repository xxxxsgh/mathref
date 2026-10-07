// Cinturão de asteroides em escala real.
//
// LONGE: faixa de poeira (anel com densidade procedural, iluminado pela
// estrela) + milhares de pontos de rochas grandes em escala do sistema.
// PERTO: campo local gerado por CÉLULAS determinísticas ao redor da câmera
// (o cinturão inteiro tem centenas de milhões de km², então só existe em
// detalhe onde o jogador está). Rochas instanciadas (InstancedMesh por
// forma × LOD), girando, com LOD pelo tamanho projetado na tela.
//
// Colisão/mineração: asteroids(posLocal, r) devolve registros com mine(qty).
// Mineração reduz o raio, solta fragmentos e, ao esgotar, estilhaça a rocha.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, attribute, positionGeometry, positionLocal, uv, uniform, length, max, min, exp, dot, normalize, mix, clamp, varying, cameraPosition, positionWorld, modelWorldMatrix, abs,
} from 'three/tsl';
import { makeRng, hash, fbm3 } from '../../core/Rng.js';
import { SHAPES, rockGeometry, rockMaterial, RESOURCES, RARE } from './AsteroidKit.js';
import { fbm, noise4, camU, sstep } from './tslUtil.js';

const CELL = 2500; // m
const GATHER = 15000; // m — raio do campo detalhado
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ax = new THREE.Vector3();

export class Belt {
  constructor(ctx, system, def, sunColor, minedMap = new Map()) {
    this.ctx = ctx;
    this.system = system;
    this.def = def;
    this.seed = hash(system.seed, def.id);
    this.group = new THREE.Group();
    this.group.name = 'belt-' + def.id;
    this.near = new THREE.Group(); // ancorado perto da câmera
    this.near.name = 'belt-near';
    this.far = new THREE.Group(); // centrado na estrela
    this.far.name = 'belt-far';
    this.group.add(this.near, this.far);
    this.cells = new Map(); // chave → [registros]
    this.loose = []; // fragmentos soltos (com velocidade)
    this.mined = minedMap; // id → quantidade restante (compartilhado entre sistemas; persistido)
    this.active = []; // registros dentro do raio de coleta
    this.anchor = { x: 0, y: 0, z: 0 };
    this.lastCell = '';
    this.capacity = Math.max(200, ctx.quality.p.asteroidCount | 0);
    this.sunDir = uniform(new THREE.Vector3(1, 0, 0));
    this.sunColor = uniform(sunColor.clone());
    this.buildFar();
    this.buildNear();
    this._t = 0;
    this.nearWeight = 0;
  }

  // ── densidade do cinturão num ponto do sistema (0..~1.5) ───────────────
  density(x, y, z) {
    const d = this.def;
    const rho = Math.hypot(x, z);
    const w = d.outerR - d.innerR;
    const edge = (a, b, t) => {
      const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    const radial = edge(d.innerR, d.innerR + w * 0.18, rho) * (1 - edge(d.outerR - w * 0.18, d.outerR, rho));
    if (radial <= 0) return 0;
    const half = d.thickness * 0.5;
    const vert = Math.exp(-((y / half) ** 2) * 2.2);
    if (vert < 0.01) return 0;
    const clump = 0.25 + 1.4 * Math.max(0, fbm3(x / 60000 + 3.1, y / 60000, z / 60000 + 7.7, 3) + 0.15);
    return radial * vert * clump;
  }

  /** Distância (m) aproximada do ponto ao volume do cinturão. */
  distanceTo(x, y, z) {
    const d = this.def;
    const rho = Math.hypot(x, z);
    const dr = rho < d.innerR ? d.innerR - rho : rho > d.outerR ? rho - d.outerR : 0;
    const dy = Math.max(0, Math.abs(y) - d.thickness * 0.5);
    return Math.hypot(dr, dy);
  }

  // ── longe: faixa de poeira + pontos ────────────────────────────────────
  buildFar() {
    const d = this.def;
    const comp = d.composition || ['ferro'];
    // anel de poeira (plano) — densidade por ruído, transparência suave
    const ringGeo = new THREE.RingGeometry(d.innerR * 0.97, d.outerR * 1.03, 512, 8);
    ringGeo.rotateX(-Math.PI / 2);
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    rm.fog = false;
    const inner = d.innerR, outer = d.outerR;
    const sunC = this.sunColor;
    rm.colorNode = Fn(() => {
      const p = positionLocal;
      const rho = length(p.xz);
      const t = rho.sub(inner).div(outer - inner);
      const prof = sstep(-0.03, 0.2, t).mul(sstep(1.03, 0.8, t));
      const ang = p.xz.div(rho);
      // aglomerados ao longo da órbita + anéis finos (ressonâncias) + grão
      const clumps = noise4(vec3(ang.mul(3.0), t.mul(2.5))).x;
      const ringlets = noise4(vec3(t.mul(23.0), 0.37, 0.11)).y.mul(0.6).add(noise4(vec3(t.mul(61.0), 0.71, 0.4)).w.mul(0.4));
      const grain = noise4(vec3(ang.mul(40.0), t.mul(31.0))).z;
      const dens = prof.mul(sstep(0.3, 0.75, clumps).mul(0.7).add(0.3)).mul(sstep(0.3, 0.8, ringlets)).mul(grain.mul(0.8).add(0.4));
      const toCam = positionWorld.sub(cameraPosition);
      const dist = length(toCam);
      const nearFade = sstep(60000.0, 400000.0, dist);
      // de lado (rasante) o anel plano viraria uma linha: some e os pontos assumem
      const graze = sstep(0.03, 0.25, abs(toCam.y.div(dist)));
      return vec4(sunC.mul(vec3(0.75, 0.66, 0.55)).mul(dens).mul(0.018).mul(nearFade).mul(graze).mul(camU.skyVis), 1.0);
    })();
    const ring = new THREE.Mesh(ringGeo, rm);
    ring.frustumCulled = false;
    this.far.add(ring);

    // pontos: rochas grandes vistas de longe (tamanho em pixels, atenuado)
    const N = Math.round((this.ctx.quality.p.asteroidCount | 0) * 10);
    const r = makeRng(this.seed ^ 0x55);
    const pos = new Float32Array(N * 4 * 3);
    const corner = new Float32Array(N * 4 * 2);
    const info = new Float32Array(N * 4 * 2);
    const idx = new Uint32Array(N * 6);
    let k = 0;
    for (let i = 0; i < N; i++) {
      let x, y, z, rho, tries = 0;
      do {
        const a = r() * Math.PI * 2;
        rho = d.innerR + (d.outerR - d.innerR) * r();
        y = (r() + r() + r() + r() - 2) * d.thickness * 0.5;
        x = Math.cos(a) * rho;
        z = Math.sin(a) * rho;
        tries++;
      } while (tries < 6 && r() > this.density(x, y, z));
      const size = 0.6 + Math.pow(r(), 6) * 2.2;
      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c;
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        corner[v * 2] = c & 1 ? 1 : -1;
        corner[v * 2 + 1] = c & 2 ? 1 : -1;
        info[v * 2] = size;
        info[v * 2 + 1] = r();
      }
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], k);
      k += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('info', new THREE.BufferAttribute(info, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    pm.fog = false;
    const aC = attribute('corner', 'vec2');
    const aI = attribute('info', 'vec2');
    // tamanho angular fixo em pixels: meia-largura = px · ânguloPixel · distância
    pm.positionNode = Fn(() => {
      const wp = positionGeometry;
      const dist = length(modelWorldMatrix.mul(vec4(wp, 1.0)).xyz.sub(cameraPosition)).max(1.0);
      return wp.add(camU.right.mul(aC.x).add(camU.up.mul(aC.y)).mul(aI.x.mul(camU.pixelAngle).mul(dist)));
    })();
    const vC = varying(aC, 'vBeltC');
    const vI = varying(aI, 'vBeltI');
    pm.colorNode = Fn(() => {
      const dist = length(positionWorld.sub(cameraPosition));
      const fall = clamp(float(2.5e6).div(dist), 0.0, 1.0); // longe → mais tênue
      const nearFade = sstep(40000.0, 150000.0, dist);
      const g2 = exp(dot(vC, vC).mul(-2.5));
      const tone = mix(vec3(0.7, 0.62, 0.52), vec3(0.55, 0.6, 0.66), vI.y);
      return vec4(tone.mul(this.sunColor).mul(g2).mul(fall).mul(nearFade).mul(0.13).mul(camU.skyVis), 1.0);
    })();
    const pts = new THREE.Mesh(g, pm);
    pts.frustumCulled = false;
    this.far.add(pts);
  }

  // ── perto: rochas instanciadas ─────────────────────────────────────────
  buildNear() {
    const cap = this.capacity;
    this.rockAttr = [];
    this.minAttr = [];
    this.meshes = []; // [shape][lod]
    // limites por LOD (os mais próximos ganham o detalhe)
    this.lodCap = [Math.min(24, cap), Math.min(400, cap), cap];
    for (let s = 0; s < SHAPES; s++) {
      const row = [];
      for (let l = 0; l < 3; l++) {
        const n = this.lodCap[l];
        const ra = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
        const ma = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
        ra.setUsage(THREE.DynamicDrawUsage);
        ma.setUsage(THREE.DynamicDrawUsage);
        const mesh = new THREE.InstancedMesh(rockGeometry(s, l), rockMaterial(ra, ma), n);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = l < 2;
        mesh.receiveShadow = true;
        mesh.userData.ra = ra;
        mesh.userData.ma = ma;
        mesh.name = `rock-s${s}-l${l}`;
        this.near.add(mesh);
        row.push(mesh);
      }
      this.meshes.push(row);
    }
  }

  /** Gera (ou devolve do cache) as rochas de uma célula. */
  cell(ix, iy, iz) {
    const key = ix + ',' + iy + ',' + iz;
    let list = this.cells.get(key);
    if (list) return list;
    list = [];
    const cx = (ix + 0.5) * CELL, cy = (iy + 0.5) * CELL, cz = (iz + 0.5) * CELL;
    const dens = this.density(cx, cy, cz);
    if (dens > 0.01) {
      const r = makeRng(hash(this.seed, key));
      const lambda = dens * 11.0;
      const n = Math.floor(lambda + r());
      const comp = this.def.composition || ['ferro'];
      for (let i = 0; i < n; i++) {
        const u = r();
        let radius = Math.min(650, 9 * Math.pow(Math.max(u, 1e-4), -0.55));
        if (r() < 0.012) radius = r.range(900, 2200);
        const rare = r() < 0.035;
        const resource = rare ? r.pick(RARE) : r.pick(comp.concat(['silicato']));
        const id = `${this.def.id}:${key}:${i}`;
        const amount0 = Math.round(Math.pow(radius, 1.4) * (rare ? 0.4 : 1.2));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6.28, r() * 6.28, r() * 6.28));
        const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
        const rec = {
          id,
          sys: { x: cx + (r() - 0.5) * CELL, y: cy + (r() - 0.5) * CELL, z: cz + (r() - 0.5) * CELL },
          radius,
          baseRadius: radius,
          shape: Math.floor(r() * SHAPES),
          resource,
          amount0,
          amount: amount0,
          q0: q,
          axis,
          spin: r.range(0.004, 0.05) / Math.sqrt(Math.max(1, radius / 50)),
          tint: r.range(0.75, 1.2),
          hue: r.range(-1, 1),
          fragDone: 0,
        };
        const left = this.mined.get(id);
        if (left !== undefined) this.applyAmount(rec, left);
        if (rec.amount > 0) list.push(rec);
      }
    }
    this.cells.set(key, list);
    return list;
  }

  applyAmount(rec, left) {
    rec.amount = Math.max(0, left);
    const f = rec.amount / rec.amount0;
    rec.radius = rec.baseRadius * Math.cbrt(Math.max(0.12, f));
    rec.fragDone = Math.floor((1 - f) * 5);
  }

  /** Reúne as células perto da câmera (sistema), quando muda de célula. */
  gather(cam) {
    const ix = Math.floor(cam.x / CELL), iy = Math.floor(cam.y / CELL), iz = Math.floor(cam.z / CELL);
    const key = ix + ',' + iy + ',' + iz;
    if (key === this.lastCell) return;
    this.lastCell = key;
    this.anchor = { x: (ix + 0.5) * CELL, y: (iy + 0.5) * CELL, z: (iz + 0.5) * CELL };
    const R = Math.ceil(GATHER / CELL);
    const act = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy + dz * dz > (R + 0.5) * (R + 0.5)) continue;
          for (const rec of this.cell(ix + dx, iy + dy, iz + dz)) act.push(rec);
        }
    this.active = act;
    // descarta células muito longe (memória)
    if (this.cells.size > 6000) {
      for (const [k] of this.cells) {
        const [a, b, c] = k.split(',').map(Number);
        if (Math.abs(a - ix) > R * 3 || Math.abs(b - iy) > R * 3 || Math.abs(c - iz) > R * 3) this.cells.delete(k);
      }
    }
  }

  /** Por frame: posiciona tudo, escolhe LOD e escreve instâncias. */
  frame(ctx, camLocal, starLocal, sunDir, time) {
    const w = ctx.world;
    this.group.position.set(0, 0, 0);
    this.far.position.copy(starLocal);
    this.sunDir.value.copy(sunDir);
    const cam = w.toSystem(camLocal);
    const dist = this.distanceTo(cam.x, cam.y, cam.z);
    this.nearWeight = dist < GATHER * 2 ? 1 : 0;
    this.near.visible = dist < GATHER * 3;
    if (!this.near.visible) {
      this.active = [];
      this.lastCell = '';
      return;
    }
    this.gather(cam);
    this.near.position.set(this.anchor.x - w.origin.x, this.anchor.y - w.origin.y, this.anchor.z - w.origin.z);
    const pixA = ctx.camera ? (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2)) / (ctx.renderer.domElement.height || 720) : 0.0017;
    // classificação
    const counts = this.meshes.map(() => [0, 0, 0]);
    const cand = [];
    const all = this.loose.length ? this.active.concat(this.loose) : this.active;
    for (const rec of all) {
      if (rec.amount <= 0) continue;
      const dx = rec.sys.x - cam.x, dy = rec.sys.y - cam.y, dz = rec.sys.z - cam.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const px = rec.radius / Math.max(d, 1) / pixA;
      if (px < 0.7) continue;
      rec._d = d;
      rec._px = px;
      cand.push(rec);
    }
    cand.sort((a, b) => b._px - a._px);
    const limit = this.capacity;
    let used = 0;
    for (const rec of cand) {
      if (used >= limit) break;
      let lod = rec._px > 160 ? 0 : rec._px > 22 ? 1 : 2;
      while (lod < 2 && counts[rec.shape][lod] >= this.lodCap[lod]) lod++;
      const mesh = this.meshes[rec.shape][lod];
      const i = counts[rec.shape][lod];
      if (i >= this.lodCap[lod]) continue;
      counts[rec.shape][lod]++;
      used++;
      // rotação = inicial × giro
      _q2.setFromAxisAngle(rec.axis, time * rec.spin);
      _q.copy(rec.q0).premultiply(_q2);
      _p.set(rec.sys.x - this.anchor.x, rec.sys.y - this.anchor.y, rec.sys.z - this.anchor.z);
      _s.setScalar(rec.radius);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const res = RESOURCES[rec.resource] || RESOURCES.ferro;
      const ra = mesh.userData.ra.array;
      const ma = mesh.userData.ma.array;
      const hu = rec.hue || 0;
      ra[i * 4] = res.base[0] * rec.tint * (1 + hu * 0.18);
      ra[i * 4 + 1] = res.base[1] * rec.tint * (1 + hu * 0.02);
      ra[i * 4 + 2] = res.base[2] * rec.tint * (1 - hu * 0.14);
      ra[i * 4 + 3] = rec.radius;
      ma[i * 4] = res.vein[0];
      ma[i * 4 + 1] = res.vein[1];
      ma[i * 4 + 2] = res.vein[2];
      ma[i * 4 + 3] = res.glow;
    }
    for (let s = 0; s < SHAPES; s++)
      for (let l = 0; l < 3; l++) {
        const mesh = this.meshes[s][l];
        mesh.count = counts[s][l];
        if (mesh.count) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.userData.ra.needsUpdate = true;
          mesh.userData.ma.needsUpdate = true;
        }
      }
    this.visibleCount = used;
  }

  /** Passo fixo: fragmentos soltos se afastam e somem. */
  update(dt) {
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const f = this.loose[i];
      f.sys.x += f.vel.x * dt;
      f.sys.y += f.vel.y * dt;
      f.sys.z += f.vel.z * dt;
      f.life -= dt;
      if (f.life <= 0 || f.amount <= 0) this.loose.splice(i, 1);
    }
  }

  /** Consulta para colisão/mineração. */
  query(world, posLocal, radius) {
    const p = world.toSystem(posLocal);
    const out = [];
    const all = this.loose.length ? this.active.concat(this.loose) : this.active;
    for (const rec of all) {
      if (rec.amount <= 0) continue;
      const dx = rec.sys.x - p.x, dy = rec.sys.y - p.y, dz = rec.sys.z - p.z;
      const rr = radius + rec.radius;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      out.push(this.handle(world, rec));
    }
    return out;
  }

  handle(world, rec) {
    const belt = this;
    return {
      id: rec.id,
      position: world.toLocal(rec.sys.x, rec.sys.y, rec.sys.z),
      radius: rec.radius,
      resource: rec.resource,
      resourceLabel: (RESOURCES[rec.resource] || {}).label || rec.resource,
      rare: RARE.includes(rec.resource),
      amount: rec.amount,
      mine: (qty) => belt.mine(world, rec, qty),
    };
  }

  /** Extrai `qty` do asteroide; reduz o raio e solta fragmentos. */
  mine(world, rec, qty) {
    if (rec.amount <= 0) return 0;
    const got = Math.min(qty, rec.amount);
    const prevStage = rec.fragDone;
    this.applyAmount(rec, rec.amount - got);
    if (!rec.fragment) this.mined.set(rec.id, rec.amount);
    const f = 1 - rec.amount / rec.amount0;
    const stage = Math.floor(f * 5);
    const ev = { id: rec.id, resource: rec.resource, qty: got, position: world.toLocal(rec.sys.x, rec.sys.y, rec.sys.z), depleted: rec.amount <= 0 };
    if (stage > prevStage || rec.amount <= 0) {
      const n = rec.amount <= 0 ? 6 : 2;
      this.fragment(rec, n);
      ev.fragmented = n;
    }
    this.ctx.bus.emit('space:mined', ev);
    return got;
  }

  fragment(rec, n) {
    const r = makeRng(hash(rec.id, rec.amount, this.loose.length));
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const rad = rec.baseRadius * r.range(0.06, rec.amount <= 0 ? 0.3 : 0.14);
      const amount0 = Math.max(1, Math.round(Math.pow(rad, 1.4) * 0.6));
      this.loose.push({
        id: `${rec.id}:f${this.loose.length}:${i}`,
        fragment: true,
        sys: { x: rec.sys.x + dir.x * rec.radius * 0.9, y: rec.sys.y + dir.y * rec.radius * 0.9, z: rec.sys.z + dir.z * rec.radius * 0.9 },
        vel: { x: dir.x * r.range(1, 6), y: dir.y * r.range(1, 6), z: dir.z * r.range(1, 6) },
        radius: rad,
        baseRadius: rad,
        shape: Math.floor(r() * SHAPES),
        resource: rec.resource,
        amount0,
        amount: amount0,
        q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
        axis: dir.clone(),
        spin: r.range(0.2, 0.8),
        tint: rec.tint,
        life: 600,
        fragDone: 0,
      });
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
