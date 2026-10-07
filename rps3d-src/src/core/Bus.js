// Barramento de eventos síncrono. Sistemas conversam por aqui sem importar
// uns aos outros. Nomes de evento usam "dominio:acao" (ver CONTRACT.md).
export class Bus {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    let set = this.map.get(name);
    if (!set) this.map.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  once(name, fn) {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }
  emit(name, payload) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] ${name}:`, err);
      }
    }
  }
}
