/**
 * Heap binário mínimo com comparador (puro, testável).
 *   const q = new PriorityQueue((a, b) => a.p - b.p);
 *   q.push(x); q.pop(); q.peek(); q.remove(x); q.rebuild(); q.size
 */
export class PriorityQueue {
  constructor(cmp) {
    this.cmp = cmp;
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(x) {
    this.a.push(x);
    this._up(this.a.length - 1);
  }
  peek() {
    return this.a[0];
  }
  pop() {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      this._down(0);
    }
    return top;
  }
  remove(x) {
    const i = this.a.indexOf(x);
    if (i < 0) return false;
    const last = this.a.pop();
    if (i < this.a.length) {
      this.a[i] = last;
      this._down(i);
      this._up(i);
    }
    return true;
  }
  toArray() {
    return this.a.slice();
  }
  /** Reconstrói o heap depois de mudar prioridades por fora. */
  rebuild() {
    for (let i = (this.a.length >> 1) - 1; i >= 0; i--) this._down(i);
  }
  _up(i) {
    const a = this.a;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  _down(i) {
    const a = this.a;
    const n = a.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.cmp(a[l], a[m]) < 0) m = l;
      if (r < n && this.cmp(a[r], a[m]) < 0) m = r;
      if (m === i) break;
      [a[i], a[m]] = [a[m], a[i]];
      i = m;
    }
  }
}
