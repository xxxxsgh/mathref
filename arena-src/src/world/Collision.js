/**
 * Colisão estática da arena: uma lista de AABBs.
 *
 * A arena é toda modular (caixas alinhadas aos eixos), então AABB é exato e
 * barato. Os raios usam o teste de slabs; com ~150 caixas o brute force
 * custa microssegundos, mas uma grade uniforme no plano XZ corta isso para
 * só as células que o raio atravessa — importa quando vários bots checam
 * linha de visão no mesmo frame.
 */

/**
 * @typedef {Object} Box
 * @property {number} minX
 * @property {number} minY
 * @property {number} minZ
 * @property {number} maxX
 * @property {number} maxY
 * @property {number} maxZ
 * @property {string} surface  'concrete' | 'metal' | 'wood' | 'glass'
 * @property {number} id
 */

/**
 * @typedef {Object} RayHit
 * @property {number} t      distância ao longo do raio
 * @property {number} nx
 * @property {number} ny
 * @property {number} nz
 * @property {Box|null} box
 */

/**
 * @typedef {Object} Body
 * @property {import('three').Vector3} pos   posição dos PÉS
 * @property {import('three').Vector3} vel
 * @property {number} halfW
 * @property {number} height
 * @property {boolean} grounded
 * @property {number} stepHeight
 */

const EPS = 1e-4;
const CELL = 6;

export class CollisionWorld {
  constructor() {
    /** @type {Box[]} */
    this.boxes = [];
    /** @type {Map<number, Box[]>} */
    this.grid = new Map();
    this.queryStamp = 0;
    /** @type {Uint32Array} */
    this.stamps = new Uint32Array(0);
  }

  /**
   * @param {number} minX @param {number} minY @param {number} minZ
   * @param {number} maxX @param {number} maxY @param {number} maxZ
   * @param {string} [surface]
   */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, surface = 'concrete') {
    const box = { minX, minY, minZ, maxX, maxY, maxZ, surface, id: this.boxes.length };
    this.boxes.push(box);
    return box;
  }

  /** Monta a grade XZ. Chamar depois de adicionar todas as caixas. */
  build() {
    this.grid.clear();
    for (const b of this.boxes) {
      const x0 = Math.floor(b.minX / CELL);
      const x1 = Math.floor(b.maxX / CELL);
      const z0 = Math.floor(b.minZ / CELL);
      const z1 = Math.floor(b.maxZ / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const k = key(x, z);
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(b);
        }
      }
    }
    this.stamps = new Uint32Array(this.boxes.length);
  }

  /**
   * Caixas cujas células encostam no retângulo XZ dado. O carimbo evita
   * devolver a mesma caixa duas vezes quando ela ocupa várias células.
   * @param {number} minX @param {number} minZ @param {number} maxX @param {number} maxZ
   * @param {Box[]} out
   */
  queryRect(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const stamp = ++this.queryStamp;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const list = this.grid.get(key(x, z));
        if (!list) continue;
        for (const b of list) {
          if (this.stamps[b.id] === stamp) continue;
          this.stamps[b.id] = stamp;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Raio contra o mundo. Devolve o acerto mais próximo dentro de maxDist.
   * A direção precisa estar normalizada.
   * @param {number} ox @param {number} oy @param {number} oz
   * @param {number} dx @param {number} dy @param {number} dz
   * @param {number} maxDist
   * @param {RayHit} [out]
   * @returns {RayHit|null}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, out = { t: 0, nx: 0, ny: 0, nz: 0, box: null }) {
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const cands = this.queryRect(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), scratch);
    let best = maxDist;
    let hit = false;
    for (const b of cands) {
      const r = rayBox(ox, oy, oz, dx, dy, dz, b, best);
      if (r >= 0 && r < best) {
        best = r;
        hit = true;
        out.box = b;
      }
    }
    if (!hit) return null;
    out.t = best;
    // Normal: a face da caixa mais próxima do ponto de impacto.
    const b = /** @type {Box} */ (out.box);
    const px = ox + dx * best;
    const py = oy + dy * best;
    const pz = oz + dz * best;
    const faces = [
      [Math.abs(px - b.minX), -1, 0, 0],
      [Math.abs(px - b.maxX), 1, 0, 0],
      [Math.abs(py - b.minY), 0, -1, 0],
      [Math.abs(py - b.maxY), 0, 1, 0],
      [Math.abs(pz - b.minZ), 0, 0, -1],
      [Math.abs(pz - b.maxZ), 0, 0, 1],
    ];
    let m = faces[0];
    for (const f of faces) if (f[0] < m[0]) m = f;
    out.nx = m[1];
    out.ny = m[2];
    out.nz = m[3];
    return out;
  }

  /** Linha de visão livre entre dois pontos? */
  segmentClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, tmpHit) === null;
  }

  /** O volume dado sobrepõe alguma caixa? */
  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    const cands = this.queryRect(minX, minZ, maxX, maxZ, scratch2);
    for (const b of cands) {
      if (minX < b.maxX && maxX > b.minX && minY < b.maxY && maxY > b.minY && minZ < b.maxZ && maxZ > b.minZ) {
        return b;
      }
    }
    return null;
  }

  /**
   * Move um corpo com colisão eixo a eixo e "step-up" automático em degraus.
   * Subdivide o passo quando a velocidade é alta para nunca atravessar
   * paredes finas.
   * @param {Body} body
   * @param {number} dt
   */
  moveBody(body, dt) {
    const speed = Math.hypot(body.vel.x, body.vel.y, body.vel.z);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
    const h = dt / steps;
    const wasGrounded = body.grounded;
    for (let i = 0; i < steps; i++) this.substep(body, h);
    // Cola no chão ao descer escada/rampa em vez de "quicar" degrau por degrau.
    if (wasGrounded && !body.grounded && body.vel.y <= 0) {
      const top = this.groundBelow(body, body.stepHeight + 0.05);
      if (top !== null) {
        body.pos.y = top;
        body.grounded = true;
        body.vel.y = 0;
      }
    }
  }

  /** @param {Body} body @param {number} h */
  substep(body, h) {
    const p = body.pos;
    const w = body.halfW;
    // --- X ---
    p.x += body.vel.x * h;
    let b = this.overlaps(p.x - w, p.y + EPS, p.z - w, p.x + w, p.y + body.height, p.z + w);
    if (b && !this.tryStep(body, b)) {
      p.x = body.vel.x > 0 ? b.minX - w - EPS : b.maxX + w + EPS;
      body.vel.x = 0;
    }
    // --- Z ---
    p.z += body.vel.z * h;
    b = this.overlaps(p.x - w, p.y + EPS, p.z - w, p.x + w, p.y + body.height, p.z + w);
    if (b && !this.tryStep(body, b)) {
      p.z = body.vel.z > 0 ? b.minZ - w - EPS : b.maxZ + w + EPS;
      body.vel.z = 0;
    }
    // --- Y ---
    p.y += body.vel.y * h;
    body.grounded = false;
    b = this.overlaps(p.x - w, p.y, p.z - w, p.x + w, p.y + body.height, p.z + w);
    if (b) {
      if (body.vel.y <= 0) {
        p.y = b.maxY;
        body.grounded = true;
      } else {
        p.y = b.minY - body.height - EPS;
      }
      body.vel.y = 0;
    }
  }

  /**
   * Sobe no obstáculo se ele for baixo o bastante e houver espaço em cima.
   * @param {Body} body @param {Box} b
   */
  tryStep(body, b) {
    if (!body.grounded) return false;
    const rise = b.maxY - body.pos.y;
    if (rise <= 0 || rise > body.stepHeight) return false;
    const p = body.pos;
    const w = body.halfW;
    if (this.overlaps(p.x - w, b.maxY + EPS, p.z - w, p.x + w, b.maxY + body.height, p.z + w)) return false;
    p.y = b.maxY;
    return true;
  }

  /**
   * Topo da caixa mais alta logo abaixo dos pés (até `range`), ou null.
   * @param {Body} body @param {number} range
   */
  groundBelow(body, range) {
    const p = body.pos;
    const w = body.halfW;
    const cands = this.queryRect(p.x - w, p.z - w, p.x + w, p.z + w, scratch2);
    let best = null;
    for (const b of cands) {
      if (p.x - w < b.maxX && p.x + w > b.minX && p.z - w < b.maxZ && p.z + w > b.minZ) {
        if (b.maxY <= p.y + EPS && b.maxY >= p.y - range && (best === null || b.maxY > best)) best = b.maxY;
      }
    }
    return best;
  }
}

/** @type {Box[]} */
const scratch = [];
/** @type {Box[]} */
const scratch2 = [];
const tmpHit = { t: 0, nx: 0, ny: 0, nz: 0, box: null };

function key(x, z) {
  return (x + 512) * 1024 + (z + 512);
}

/**
 * Teste de slabs raio × AABB. Devolve t de entrada (ou -1).
 * @param {Box} b
 */
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0;
  let tmax = maxT;
  // Eixo X
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv;
    let t2 = (b.maxX - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Eixo Y
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.minY || oy > b.maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (b.minY - oy) * inv;
    let t2 = (b.maxY - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Eixo Z
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv;
    let t2 = (b.maxZ - oz) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}
