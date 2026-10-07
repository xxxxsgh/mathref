// Save local em IndexedDB. Cada sistema registra um namespace com
// serialize()/deserialize(data). `save.write()` grava tudo; o núcleo faz
// autosave a cada 60 s e quando a aba perde o foco.
const DB = 'rps3d', STORE = 'kv';

function openDb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in self)) return rej(new Error('sem IndexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export class Save {
  constructor(bus) {
    this.bus = bus;
    this.slots = new Map();   // ns → {serialize, deserialize}
    this.data = {};           // último snapshot carregado
    this.mem = new Map();     // fallback sem IndexedDB
    this.dbp = openDb().catch((e) => { console.warn('[save] IndexedDB indisponível, usando memória', e); return null; });
    this.disabled = false;    // modo shot desliga gravação
  }
  async getRaw(key) {
    const db = await this.dbp;
    if (!db) return this.mem.get(key);
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => res(tx.result); tx.onerror = () => res(undefined);
    });
  }
  async setRaw(key, val) {
    const db = await this.dbp;
    if (!db) { this.mem.set(key, val); return; }
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => res();
    });
  }
  /** Registra um namespace. Se já houver dados carregados, deserialize é chamado na hora. */
  register(ns, { serialize, deserialize }) {
    this.slots.set(ns, { serialize, deserialize });
    if (this.data[ns] !== undefined) { try { deserialize(this.data[ns]); } catch (e) { console.error('[save]', ns, e); } }
  }
  async load(slot = 'main') {
    this.data = (await this.getRaw('save:' + slot)) || {};
    for (const [ns, s] of this.slots) if (this.data[ns] !== undefined) { try { s.deserialize(this.data[ns]); } catch (e) { console.error('[save]', ns, e); } }
    this.bus.emit('save:loaded', { slot, empty: !Object.keys(this.data).length });
    return this.data;
  }
  async write(slot = 'main') {
    if (this.disabled) return;
    const out = { _v: 1, _t: Date.now() };
    for (const [ns, s] of this.slots) { try { out[ns] = s.serialize(); } catch (e) { console.error('[save]', ns, e); } }
    this.data = out;
    await this.setRaw('save:' + slot, out);
    this.bus.emit('save:written', { slot });
  }
  async hasSave(slot = 'main') { return !!(await this.getRaw('save:' + slot)); }
  async wipe(slot = 'main') { await this.setRaw('save:' + slot, undefined); this.data = {}; }
  /** Preferências (qualidade, volume, sensibilidade) — separadas do save de jogo. */
  async prefs() { return (await this.getRaw('prefs')) || {}; }
  async setPrefs(p) { await this.setRaw('prefs', p); }
}
