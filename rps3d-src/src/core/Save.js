// Save local em IndexedDB (com fallback em memória quando o navegador
// bloqueia storage — aba privada do Safari, por exemplo).
//
//   await save.put('slot1', estado)   await save.get('slot1')   await save.keys()
//
// Cada sistema guarda o próprio pedaço via ctx.state (ver CONTRACT.md): o
// núcleo serializa ctx.state inteiro em 'autosave'.

const DB = 'rps3d';
const STORE = 'saves';

export class Save {
  constructor() {
    this.mem = new Map();
    this.dbp = new Promise((res) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
        req.onblocked = () => res(null);
      } catch {
        res(null);
      }
    });
  }
  async _tx(mode, fn) {
    const db = await this.dbp;
    if (!db) return null;
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => res(r?.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  async put(key, value) {
    const v = structuredClone(value);
    this.mem.set(key, v);
    try {
      await this._tx('readwrite', (s) => s.put(v, key));
    } catch (e) {
      console.warn('[save] falhou, mantendo em memória', e);
    }
  }
  async get(key) {
    try {
      const v = await this._tx('readonly', (s) => s.get(key));
      if (v !== undefined && v !== null) return v;
    } catch {
      /* cai no fallback */
    }
    return this.mem.get(key) ?? null;
  }
  async del(key) {
    this.mem.delete(key);
    try {
      await this._tx('readwrite', (s) => s.delete(key));
    } catch {
      /* ignora */
    }
  }
  async keys() {
    try {
      const k = await this._tx('readonly', (s) => s.getAllKeys());
      if (k) return k;
    } catch {
      /* ignora */
    }
    return [...this.mem.keys()];
  }
}
