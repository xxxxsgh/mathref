/**
 * Grade de navegação + mapa de cobertura, gerados a partir do mundo de
 * colisão no init (sem navmesh externo):
 *
 *   walk[i]   1 se cabe um soldado em pé na célula
 *   gy[i]     altura do chão (calçada, interior elevado…)
 *   low[i]    bitmask de 8 direções com obstáculo BAIXO adjacente (0.35–0.95 m)
 *   high[i]   idem, obstáculo ALTO (1.1–1.65 m) — cobertura de pé
 *
 * A* em 8 vizinhos com custo de proximidade de parede, suavização por linha
 * de caminhada, e consulta de pontos de cobertura relativos a uma ameaça.
 */
import * as THREE from 'three';

const DIRS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const _b = new THREE.Box3();
const _v = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class NavGrid {
  constructor(collision, region, cell = 0.5) {
    this.collision = collision;
    this.cell = cell;
    this.x0 = region.min.x;
    this.z0 = region.min.z;
    this.nx = Math.ceil((region.max.x - region.min.x) / cell);
    this.nz = Math.ceil((region.max.z - region.min.z) / cell);
    const n = this.nx * this.nz;
    this.walk = new Uint8Array(n);
    this.gy = new Float32Array(n);
    this.low = new Uint8Array(n);
    this.high = new Uint8Array(n);
    this.wallDist = new Uint8Array(n);
    this.filter = (c) => !c.trigger && c.blocksPlayer !== false && c.tag !== 'enemy' && c.tag !== 'player' && !c.data?.enemy;
  }

  build() {
    const { nx, nz, cell, collision } = this;
    const t0 = performance.now();
    const tmp = [];
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const x = this.x0 + (ix + 0.5) * cell, z = this.z0 + (iz + 0.5) * cell;
        const hit = collision.raycast(_v.set(x, 2.6, z), DOWN, 4, { bullets: false, filter: this.filter });
        if (!hit || hit.point.y > 0.65) continue;
        const gy = hit.point.y;
        this.gy[i] = gy;
        _b.min.set(x - 0.26, gy + 0.42, z - 0.26);
        _b.max.set(x + 0.26, gy + 1.7, z + 0.26);
        tmp.length = 0;
        if (collision.queryBox(_b, tmp, this.filter).length) continue;
        this.walk[i] = 1;
      }
    // distância à parede (0..3 células) e bordas → cobertura
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (!this.walk[i]) continue;
        let wd = 3;
        for (let r = 1; r <= 3 && wd === 3; r++)
          for (let dz = -r; dz <= r && wd === 3; dz++)
            for (let dx = -r; dx <= r; dx++) {
              const j = this.idx(ix + dx, iz + dz);
              if (j < 0 || !this.walk[j]) {
                wd = r - 1;
                break;
              }
            }
        this.wallDist[i] = wd;
        if (wd > 1) continue;
        const x = this.x0 + (ix + 0.5) * cell, z = this.z0 + (iz + 0.5) * cell, gy = this.gy[i];
        for (let k = 0; k < 8; k++) {
          const [dx, dz] = DIRS[k];
          const l = Math.hypot(dx, dz);
          const cx = x + (dx / l) * 0.6, cz = z + (dz / l) * 0.6;
          _b.min.set(cx - 0.14, gy + 0.35, cz - 0.14);
          _b.max.set(cx + 0.14, gy + 0.95, cz + 0.14);
          tmp.length = 0;
          if (collision.queryBox(_b, tmp, this.filter).length) this.low[i] |= 1 << k;
          _b.min.y = gy + 1.1;
          _b.max.y = gy + 1.65;
          tmp.length = 0;
          if (collision.queryBox(_b, tmp, this.filter).length) this.high[i] |= 1 << k;
        }
      }
    this.buildMs = performance.now() - t0;
    let w = 0, c = 0;
    for (let i = 0; i < this.walk.length; i++) {
      w += this.walk[i];
      c += this.low[i] ? 1 : 0;
    }
    this.stats = { cells: this.walk.length, walkable: w, cover: c, ms: Math.round(this.buildMs) };
    return this;
  }

  idx(ix, iz) {
    return ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz ? -1 : iz * this.nx + ix;
  }
  cellOf(x, z) {
    return this.idx(Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell));
  }
  center(i, out = new THREE.Vector3()) {
    const ix = i % this.nx, iz = (i / this.nx) | 0;
    return out.set(this.x0 + (ix + 0.5) * this.cell, this.gy[i], this.z0 + (iz + 0.5) * this.cell);
  }

  /** Célula andável mais próxima (busca em anel). */
  nearestWalkable(x, z, maxR = 8) {
    const c = this.cellOf(x, z);
    if (c >= 0 && this.walk[c]) return c;
    const ix = Math.floor((x - this.x0) / this.cell), iz = Math.floor((z - this.z0) / this.cell);
    for (let r = 1; r <= maxR; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const j = this.idx(ix + dx, iz + dz);
          if (j >= 0 && this.walk[j]) return j;
        }
    return -1;
  }

  /** Linha reta andável entre duas células (DDA). */
  walkLine(a, b) {
    const ax = a % this.nx, az = (a / this.nx) | 0, bx = b % this.nx, bz = (b / this.nx) | 0;
    const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 2;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const x = Math.round(ax + (bx - ax) * t), z = Math.round(az + (bz - az) * t);
      const j = this.idx(x, z);
      if (j < 0 || !this.walk[j] || this.wallDist[j] === 0) return false;
      if (Math.abs(this.gy[j] - this.gy[a]) > 0.5) return false;
    }
    return true;
  }

  /** A* → lista de pontos (Vector3) suavizada, ou null. */
  findPath(from, to, maxIter = 9000) {
    const s = this.nearestWalkable(from.x, from.z, 4), g = this.nearestWalkable(to.x, to.z, 6);
    if (s < 0 || g < 0) return null;
    if (s === g) return [this.center(g)];
    const n = this.walk.length;
    if (!this._g || this._g.length !== n) {
      this._g = new Float32Array(n);
      this._came = new Int32Array(n);
      this._seen = new Uint32Array(n);
      this._closed = new Uint32Array(n);
      this._stamp = 0;
    }
    const G = this._g, came = this._came, seen = this._seen, closed = this._closed;
    const stamp = ++this._stamp;
    const gx = g % this.nx, gz = (g / this.nx) | 0;
    const h = (i) => {
      const dx = Math.abs((i % this.nx) - gx), dz = Math.abs(((i / this.nx) | 0) - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    // heap binário de [f, i]
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    G[s] = 0;
    seen[s] = stamp;
    came[s] = -1;
    push(h(s), s);
    let found = false, iter = 0;
    while (heap.length && iter++ < maxIter) {
      const [, cur] = pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      if (cur === g) {
        found = true;
        break;
      }
      const cx = cur % this.nx, cz = (cur / this.nx) | 0;
      for (let k = 0; k < 8; k++) {
        const [dx, dz] = DIRS[k];
        const j = this.idx(cx + dx, cz + dz);
        if (j < 0 || !this.walk[j] || closed[j] === stamp) continue;
        if (Math.abs(this.gy[j] - this.gy[cur]) > 0.48) continue;
        if (dx && dz && (!this.walk[this.idx(cx + dx, cz)] || !this.walk[this.idx(cx, cz + dz)])) continue;
        const cost = G[cur] + (dx && dz ? 1.414 : 1) + (this.wallDist[j] === 0 ? 0.8 : 0);
        if (seen[j] !== stamp || cost < G[j]) {
          seen[j] = stamp;
          G[j] = cost;
          came[j] = cur;
          push(cost + h(j), j);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = g; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // suavização (string pulling por linha andável)
    const out = [];
    let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.walkLine(cells[a], cells[b])) b--;
      out.push(this.center(cells[b]));
      a = b;
    }
    return out;
  }

  /**
   * Candidatos de cobertura perto de `from` contra a ameaça `threat`.
   * Retorna [{ i, pos, low, high, d }] (sem checar LOS — quem chama verifica).
   */
  coverCandidates(from, threat, radius = 14, out = []) {
    out.length = 0;
    const c = this.cellOf(from.x, from.z);
    if (c < 0) return out;
    const r = Math.ceil(radius / this.cell);
    const cx = c % this.nx, cz = (c / this.nx) | 0;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const j = this.idx(cx + dx, cz + dz);
        if (j < 0 || !this.walk[j] || !(this.low[j] | this.high[j])) continue;
        const p = this.center(j);
        const d = Math.hypot(p.x - from.x, p.z - from.z);
        if (d > radius) continue;
        // direção da ameaça quantizada em 8 setores (+ vizinhos)
        const ang = Math.atan2(threat.z - p.z, threat.x - p.x);
        const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
        const mask = (1 << k) | (1 << ((k + 1) % 8)) | (1 << ((k + 7) % 8));
        const low = (this.low[j] & (1 << k)) !== 0 || (this.low[j] & mask) !== 0;
        const high = (this.high[j] & mask) !== 0;
        if (!low && !high) continue;
        out.push({ i: j, pos: p, low: low && !high, high, d });
      }
    return out;
  }
}
