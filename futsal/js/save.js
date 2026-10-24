// Persistência: configurações em localStorage e saves (carreira, campeonatos,
// times editados) em IndexedDB. Tudo tolera armazenamento indisponível
// (modo privado, cota estourada, Safari restritivo): o jogo segue em memória.

const SETTINGS_KEY = 'pixelfutsal.settings.v1';

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  pass: 'KeyJ', shoot: 'KeyK', dribble: 'KeyL', switch: 'KeyI',
  sprint: 'ShiftLeft', chapeu: 'KeyQ', elastico: 'KeyE', pisada: 'KeyR', keeper: 'KeyG', pause: 'Escape',
};

export const DEFAULT_SETTINGS = {
  vol: { music: 0.5, sfx: 0.8, voice: 0.8 },
  quality: 'media',
  camera: 'tv',
  autoSwitch: true,
  replays: true,
  showFps: false,
  difficulty: 'normal',
  duration: 4,
  gym: 0,
  touch: { size: 1, opacity: 0.45, joyX: 0.14, joyY: 0.72, btnX: 0.86, btnY: 0.7 },
  keys: { ...DEFAULT_KEYS },
};

function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], over[k]);
    else if (k in base) out[k] = over[k];
  }
  return out;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return merge(DEFAULT_SETTINGS, raw ? JSON.parse(raw) : null);
  } catch {
    return merge(DEFAULT_SETTINGS, null);
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

// ─── IndexedDB (chave → valor) com fallback em memória ─────────────────────
const DB_NAME = 'pixelfutsal';
const STORE = 'saves';
let dbPromise = null;
const memory = new Map();
export let storageOk = true;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) { storageOk = false; return resolve(null); }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { storageOk = false; resolve(null); };
      req.onblocked = () => { storageOk = false; resolve(null); };
      setTimeout(() => resolve(null), 3000); // nunca travar o boot
    } catch {
      storageOk = false;
      resolve(null);
    }
  });
  return dbPromise;
}

export async function dbGet(key) {
  const db = await openDB();
  if (!db) return memory.has(key) ? structuredClone(memory.get(key)) : null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(memory.get(key) ?? null);
    } catch { resolve(memory.get(key) ?? null); }
  });
}

export async function dbSet(key, value) {
  memory.set(key, structuredClone(value));
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(structuredClone(value), key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { storageOk = false; resolve(false); };
      tx.onabort = () => { storageOk = false; resolve(false); };
    } catch { resolve(false); }
  });
}

export async function dbDel(key) {
  memory.delete(key);
  const db = await openDB();
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key); } catch { /* ignora */ }
}

// Pede ao navegador para não apagar os saves sob pressão de espaço.
export function requestPersist() {
  try { navigator.storage?.persist?.(); } catch { /* ignora */ }
}
