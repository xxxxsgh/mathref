/**
 * Pool de objetos genérico.
 *
 * ═══ POR QUE ISSO É OBRIGATÓRIO ═══
 *
 * Um jogo de tiro cria e destrói centenas de objetos por segundo: projéteis,
 * partículas, faíscas. Em JavaScript, criar objetos é barato — o caro é o
 * coletor de lixo passar depois pra recolher todos eles.
 *
 * O sintoma não é "o jogo está lento": é STUTTER. O jogo roda a 60fps e de
 * repente um frame leva 40ms porque o GC decidiu trabalhar. Num jogo de voo
 * esse engasgo é sentido no controle — é literalmente pior que rodar a 45fps
 * constantes, porque a irregularidade quebra a previsão motora do jogador.
 *
 * A solução é nunca liberar: aloca-se tudo na inicialização e reutiliza-se.
 * O pool não "cria" e "destrói", ele MARCA como ativo e inativo.
 *
 * @template T
 */
export class Pool {
  /**
   * @param {number} size quantos objetos pré-alocar
   * @param {() => T} factory cria um objeto zerado
   * @param {(item: T) => void} [reset] devolve o objeto ao estado inicial
   */
  constructor(size, factory, reset) {
    /** @type {T[]} todos os objetos, ativos e inativos */
    this.items = new Array(size);
    /** @type {boolean[]} paralelo a `items` */
    this.alive = new Array(size).fill(false);
    this._reset = reset;
    this.activeCount = 0;
    // Cursor circular: a busca por um slot livre começa de onde parou da última
    // vez, em vez de sempre do zero. Sem isso, com o pool quase cheio, cada
    // aquisição varre o array inteiro — O(n) por tiro vira o gargalo.
    this._cursor = 0;

    for (let i = 0; i < size; i++) this.items[i] = factory();
  }

  get size() { return this.items.length; }

  /** Pega um slot livre. Retorna `null` se o pool estiver cheio.
   *  Devolver `null` em vez de crescer o array é intencional: o teto é uma
   *  garantia de orçamento de performance. Se ele é atingido com frequência, o
   *  certo é aumentar o tamanho no config, não alocar sem limite em runtime.
   *  @returns {T | null} */
  acquire() {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this._cursor + k) % n;
      if (!this.alive[i]) {
        this.alive[i] = true;
        this.activeCount++;
        this._cursor = (i + 1) % n;
        const item = this.items[i];
        this._reset?.(item);
        item.__poolIndex = i;
        return item;
      }
    }
    return null;
  }

  /** Como `acquire`, mas quando o pool está cheio recicla o slot mais antigo
   *  em vez de falhar. Usado por projéteis: perder o tiro mais velho é bem
   *  menos perceptível que o tiro novo simplesmente não sair. */
  acquireForced() {
    const item = this.acquire();
    if (item) return item;
    const i = this._cursor % this.items.length;
    this._cursor = (i + 1) % this.items.length;
    const recycled = this.items[i];
    this._reset?.(recycled);
    recycled.__poolIndex = i;
    return recycled;
  }

  /** @param {T} item */
  release(item) {
    const i = item.__poolIndex;
    if (i === undefined || !this.alive[i]) return;
    this.alive[i] = false;
    this.activeCount--;
  }

  /** Percorre só os ativos.
   *  A callback pode chamar `release` no item corrente com segurança: a
   *  iteração é por índice, e desativar um slot não desloca os outros.
   *  @param {(item: T, index: number) => void} fn */
  forEachActive(fn) {
    for (let i = 0; i < this.items.length; i++) {
      if (this.alive[i]) fn(this.items[i], i);
    }
  }

  releaseAll() {
    this.alive.fill(false);
    this.activeCount = 0;
  }
}
