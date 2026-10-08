/**
 * Barramento de eventos síncrono e minúsculo.
 *   const off = bus.on('weapon:fire', (e) => ...);  off();
 *   bus.emit('weapon:fire', { origin, dir });
 * Exceções de um ouvinte são isoladas: um ouvinte quebrado não impede os
 * outros de receberem o evento (mesma filosofia do registro de features).
 */
export class Bus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (e) => {
      off();
      fn(e);
    });
    return off;
  }
  off(type, fn) {
    this.map.get(type)?.delete(fn);
  }
  emit(type, payload) {
    const set = this.map.get(type);
    if (!set) return 0;
    let n = 0;
    for (const fn of [...set]) {
      try {
        fn(payload);
        n++;
      } catch (err) {
        console.error(`[bus] ouvinte de '${type}' falhou:`, err);
      }
    }
    return n;
  }
}
