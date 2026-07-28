/**
 * Spatial hash uniforme para broadphase de colisão.
 *
 * ═══ QUANDO ISTO GANHA (E QUANDO NÃO) ═══
 *
 * Na Fase 2 eu deliberadamente NÃO usei estrutura de aceleração para os
 * projéteis: eram ~2500 pares por frame, e manter um índice de objetos que se
 * movem todo frame custaria mais que os testes evitados.
 *
 * Aqui é o caso oposto, e é exatamente onde a estrutura ganha:
 *   - milhares de asteroides,
 *   - ESTÁTICOS (o índice é construído uma vez, não por frame),
 *   - consultados por poucos objetos móveis (nave, inimigos, projéteis).
 *
 * Com 4000 asteroides e 60 consultas por frame, força bruta seria 240k testes.
 * Com o hash, cada consulta olha ~27 células e testa talvez 10 candidatos:
 * ~1600 testes. Duas ordens de grandeza.
 *
 * ═══ COMO FUNCIONA ═══
 *
 * O espaço é dividido em cubos de lado `cellSize`. A chave de uma célula é um
 * hash dos três índices inteiros. Não há grade alocada — só um Map de células
 * ocupadas, o que permite espaço infinito sem custo de memória proporcional ao
 * volume.
 *
 * `cellSize` deve ser da ordem do maior objeto indexado. Muito pequeno e um
 * objeto ocupa dezenas de células; muito grande e cada célula vira uma lista
 * longa que anula o ganho.
 */
export class SpatialHash {
  /** @param {number} cellSize */
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;
    /** @type {Map<number, number[]>} chave da célula → índices de objeto */
    this.cells = new Map();
    this._queryResult = [];
    // Marcação de já-visitado por consulta: evita devolver o mesmo objeto duas
    // vezes quando ele ocupa várias células vizinhas. Um Set alocado por
    // consulta geraria lixo; um array de "carimbos" com um contador crescente
    // resolve sem alocar nada.
    this._stamp = new Int32Array(0);
    this._stampCounter = 0;
  }

  /** Hash de três coordenadas inteiras num único número.
   *  Os multiplicadores são primos grandes: qualquer combinação de fatores
   *  comuns criaria colisões sistemáticas ao longo de planos da grade. */
  _key(ix, iy, iz) {
    return (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
  }

  clear(objectCount = 0) {
    this.cells.clear();
    if (this._stamp.length < objectCount) this._stamp = new Int32Array(objectCount);
    this._stampCounter = 0;
    this._stamp.fill(0);
  }

  /**
   * Insere um objeto esférico. Ele é registrado em TODAS as células que sua
   * esfera toca, senão uma consulta na borda o perderia.
   * @param {number} index identificador do objeto
   * @param {number} x @param {number} y @param {number} z
   * @param {number} radius
   */
  insert(index, x, y, z, radius) {
    const c = this.invCell;
    const x0 = Math.floor((x - radius) * c), x1 = Math.floor((x + radius) * c);
    const y0 = Math.floor((y - radius) * c), y1 = Math.floor((y + radius) * c);
    const z0 = Math.floor((z - radius) * c), z1 = Math.floor((z + radius) * c);

    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = this._key(ix, iy, iz);
          let list = this.cells.get(k);
          if (!list) { list = []; this.cells.set(k, list); }
          list.push(index);
        }
      }
    }
  }

  /**
   * Devolve os índices de objetos cujas células tocam a esfera de consulta.
   * O array retornado é REUTILIZADO entre chamadas — copie se precisar guardar.
   * @returns {number[]}
   */
  query(x, y, z, radius) {
    const out = this._queryResult;
    out.length = 0;
    this._stampCounter++;
    const stamp = this._stampCounter;

    const c = this.invCell;
    const x0 = Math.floor((x - radius) * c), x1 = Math.floor((x + radius) * c);
    const y0 = Math.floor((y - radius) * c), y1 = Math.floor((y + radius) * c);
    const z0 = Math.floor((z - radius) * c), z1 = Math.floor((z + radius) * c);

    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let iz = z0; iz <= z1; iz++) {
          const list = this.cells.get(this._key(ix, iy, iz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const idx = list[i];
            if (this._stamp[idx] === stamp) continue;   // já devolvido
            this._stamp[idx] = stamp;
            out.push(idx);
          }
        }
      }
    }
    return out;
  }

  /** Consulta ao longo de um segmento (para projéteis rápidos).
   *  Percorre a linha em passos de meia célula: mais simples que um DDA 3D
   *  exato e, com passo menor que a célula, não pula nenhuma. */
  querySegment(ax, ay, az, bx, by, bz, radius) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cellSize * 0.5)));

    const out = this._queryResult;
    out.length = 0;
    this._stampCounter++;
    const stamp = this._stampCounter;
    const c = this.invCell;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      const x0 = Math.floor((px - radius) * c), x1 = Math.floor((px + radius) * c);
      const y0 = Math.floor((py - radius) * c), y1 = Math.floor((py + radius) * c);
      const z0 = Math.floor((pz - radius) * c), z1 = Math.floor((pz + radius) * c);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iy = y0; iy <= y1; iy++) {
          for (let iz = z0; iz <= z1; iz++) {
            const list = this.cells.get(this._key(ix, iy, iz));
            if (!list) continue;
            for (let i = 0; i < list.length; i++) {
              const idx = list[i];
              if (this._stamp[idx] === stamp) continue;
              this._stamp[idx] = stamp;
              out.push(idx);
            }
          }
        }
      }
    }
    return out;
  }

  get cellCount() { return this.cells.size; }
}
