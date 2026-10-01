// Colisão simples e barata: cilindros verticais e caixas orientadas (no plano
// XZ, com faixa de altura), num hash espacial. Serve para o jogador (empurrar
// para fora / ficar de pé em cima) e para a câmera (não atravessar objetos).

const CELL = 16;

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.all = [];
    this._stamp = 0;
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _insert(c, minX, minZ, maxX, maxZ) {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = this._key(ix, iz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(c);
      }
    }
    c._stamp = 0;
    this.all.push(c);
  }

  /** Cilindro vertical. */
  addCylinder(x, z, r, y0, y1, surface = 'stone', camOnly = false) {
    const c = { type: 'cyl', x, z, r, y0, y1, surface, camOnly };
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  /** Caixa com rotação em Y (meias-dimensões hx, hz). */
  addBox(x, z, hx, hz, rot, y0, y1, surface = 'stone') {
    const c = { type: 'box', x, z, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, surface };
    const e = Math.hypot(hx, hz);
    this._insert(c, x - e, z - e, x + e, z + e);
    return c;
  }

  /** Colisores perto de (x, z) dentro de `rad`. */
  near(x, z, rad, out = []) {
    out.length = 0;
    const s = ++this._stamp;
    for (let ix = Math.floor((x - rad) / CELL); ix <= Math.floor((x + rad) / CELL); ix++) {
      for (let iz = Math.floor((z - rad) / CELL); iz <= Math.floor((z + rad) / CELL); iz++) {
        const list = this.grid.get(this._key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c._stamp === s) continue;
          c._stamp = s;
          out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Distância com sinal do ponto (x,z) à borda do colisor no plano
   * (negativa = dentro) e a normal de saída em `n`.
   */
  _sd(c, x, z, n) {
    if (c.type === 'cyl') {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz) || 1e-6;
      n.x = dx / d; n.z = dz / d;
      return d - c.r;
    }
    // Para o espaço local da caixa.
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const qx = Math.abs(lx) - c.hx, qz = Math.abs(lz) - c.hz;
    let nlx, nlz, d;
    if (qx > 0 || qz > 0) {
      const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
      d = Math.hypot(ox, oz);
      nlx = (Math.sign(lx) * ox) / (d || 1);
      nlz = (Math.sign(lz) * oz) / (d || 1);
    } else if (qx > qz) {
      d = qx; nlx = Math.sign(lx); nlz = 0;
    } else {
      d = qz; nlx = 0; nlz = Math.sign(lz);
    }
    // De volta ao mundo (rotação inversa).
    n.x = nlx * c.cos + nlz * c.sin;
    n.z = -nlx * c.sin + nlz * c.cos;
    return d;
  }

  /**
   * Empurra o jogador (cilindro de raio `r`, pés em pos.y, altura `h`) para
   * fora dos colisores. `step` = quanto ele consegue "subir" sem ser barrado.
   * Devolve true se encostou em algo.
   */
  resolve(pos, r, h, step, vel) {
    const list = this.near(pos.x, pos.z, r + 4, this._tmp || (this._tmp = []));
    const n = { x: 0, z: 0 };
    let hit = false;
    for (let it = 0; it < 2; it++) {
      for (const c of list) {
        if (c.camOnly || pos.y + h < c.y0 || pos.y > c.y1 - step) continue;
        const d = this._sd(c, pos.x, pos.z, n);
        if (d < r) {
          const push = r - d;
          pos.x += n.x * push;
          pos.z += n.z * push;
          if (vel) {
            const vn = vel.x * n.x + vel.z * n.z;
            if (vn < 0) { vel.x -= vn * n.x; vel.z -= vn * n.z; }
          }
          hit = true;
        }
      }
    }
    return hit;
  }

  /**
   * Topo mais alto sob o ponto (para ficar de pé em pedras/colunas).
   * Só conta topos que estão abaixo de y + step.
   */
  groundAt(x, z, y, r, step) {
    const list = this.near(x, z, r + 4, this._tmp2 || (this._tmp2 = []));
    const n = { x: 0, z: 0 };
    let best = -Infinity, surf = null;
    for (const c of list) {
      if (c.camOnly || c.y1 > y + step) continue;
      const d = this._sd(c, x, z, n);
      if (d < r * 0.35 && c.y1 > best) { best = c.y1; surf = c.surface; }
    }
    return { y: best, surface: surf };
  }

  /** O ponto 3D está dentro de algum colisor (com folga)? */
  inside(x, y, z, pad = 0) {
    const list = this.near(x, z, pad + 4, this._tmp3 || (this._tmp3 = []));
    const n = { x: 0, z: 0 };
    for (const c of list) {
      if (y < c.y0 - pad || y > c.y1 + pad) continue;
      if (this._sd(c, x, z, n) < pad) return true;
    }
    return false;
  }
}
