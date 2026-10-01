// Preferências do jogador, persistidas em localStorage (sempre com try/catch:
// em aba anônima ou com armazenamento bloqueado o jogo segue com o padrão).

const KEY = 'ventania.settings.v1';

const DEFAULTS = {
  quality: 'medium', // 'low' | 'medium' | 'high'
  volume: 0.8,
  sensitivity: 1.0,
  invertY: false,
  showControls: true,
};

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    saved = {};
  }
  return { ...DEFAULTS, ...saved };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: tudo bem */
  }
}
