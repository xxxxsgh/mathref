/**
 * Pool de objetos genérico. Efeitos (tracers, cápsulas, faíscas, decals)
 * nascem e morrem dezenas de vezes por segundo; alocar a cada tiro gera
 * coleta de lixo e engasgos. Aqui tudo é criado uma vez e reciclado.
 *
 * @template T
 */
export class Pool {
  /**
   * @param {() => T} factory
   * @param {number} size
   */
  constructor(factory, size) {
    /** @type {T[]} */
    this.items = [];
    for (let i = 0; i < size; i++) this.items.push(factory());
    this.cursor = 0;
  }

  /**
   * Devolve o próximo item livre; se todos estiverem em uso, recicla o mais
   * antigo (ring buffer) — para efeitos visuais isso é aceitável e mantém o
   * custo fixo.
   * @returns {T}
   */
  acquire() {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const it = /** @type {any} */ (this.items[idx]);
      if (!it.active) {
        this.cursor = (idx + 1) % n;
        return this.items[idx];
      }
    }
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % n;
    return it;
  }

  /** @param {(item: T) => void} fn */
  forEachActive(fn) {
    for (const it of this.items) if (/** @type {any} */ (it).active) fn(it);
  }
}
