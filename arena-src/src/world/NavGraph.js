/**
 * Grafo de navegação dos bots: nós posicionados à mão + A*.
 *
 * O mapa é pequeno (~50 nós), então A* com lista aberta linear é mais rápido
 * do que manter um heap. Caminhos são recalculados só quando o objetivo do
 * bot muda, não a cada frame.
 */
export class NavGraph {
  /** @param {import('./Collision.js').CollisionWorld} collision */
  constructor(collision) {
    this.collision = collision;
    /** @type {{ id: number, x: number, y: number, z: number, name: string, links: number[] }[]} */
    this.nodes = [];
  }

  addNode(x, y, z, name = '') {
    const id = this.nodes.length;
    this.nodes.push({ id, x, y, z, name, links: [] });
    return id;
  }

  link(a, b) {
    if (!this.nodes[a].links.includes(b)) this.nodes[a].links.push(b);
    if (!this.nodes[b].links.includes(a)) this.nodes[b].links.push(a);
  }

  /** Nó mais próximo com linha livre na altura da cintura (fallback: o mais próximo). */
  nearest(x, y, z) {
    let best = -1;
    let bestD = Infinity;
    let fallback = 0;
    let fallbackD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 3) ** 2;
      if (d < fallbackD) {
        fallbackD = d;
        fallback = n.id;
      }
      if (d < bestD && this.collision.segmentClear(x, y + 0.5, z, n.x, n.y + 0.5, n.z)) {
        bestD = d;
        best = n.id;
      }
    }
    return best >= 0 ? best : fallback;
  }

  /**
   * A* entre dois nós. `avoid` é uma penalidade opcional por nó (ex.: nós
   * vistos pelo inimigo), para os bots variarem rotas.
   * @param {number} start @param {number} goal
   * @param {(id: number) => number} [cost]
   * @returns {number[]}
   */
  path(start, goal, cost) {
    if (start === goal) return [goal];
    const n = this.nodes.length;
    const g = new Float32Array(n).fill(Infinity);
    const f = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open = [start];
    g[start] = 0;
    f[start] = this.h(start, goal);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      if (cur === goal) break;
      open.splice(bi, 1);
      closed[cur] = 1;
      for (const nb of this.nodes[cur].links) {
        if (closed[nb]) continue;
        const tg = g[cur] + this.h(cur, nb) + (cost ? cost(nb) : 0);
        if (tg < g[nb]) {
          g[nb] = tg;
          f[nb] = tg + this.h(nb, goal);
          came[nb] = cur;
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    if (came[goal] === -1) return [];
    const out = [goal];
    let c = goal;
    while (came[c] !== -1 && c !== start) {
      c = came[c];
      out.push(c);
    }
    return out.reverse();
  }

  h(a, b) {
    const A = this.nodes[a];
    const B = this.nodes[b];
    return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
  }
}
