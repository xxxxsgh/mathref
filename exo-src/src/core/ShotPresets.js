/**
 * PRESETS DE SCREENSHOT — coleta e leitura (puro: roda no navegador E no
 * node, usado por tools/shot.mjs --all).
 *
 * Cada arquivo de src/shots/*.js pertence a UM dono e exporta (default) um
 * preset ou uma lista de presets, só DADOS (sem imports de three/DOM):
 *
 *   {
 *     name: 'horizon', owner: 'integracao', desc: '...',
 *     seed: 1337, galaxy: 0, systemIndex: 0, planetIndex: 0,
 *     mode: 'walk' | 'ship' | 'space',
 *     view: 'first' | 'third',                     (padrão 'first')
 *     camera: {
 *       lat, lon,            graus (ver core/Geo.js)
 *       alt,                 m acima do solo (walk: altura dos olhos)
 *       heading,             graus (0 = norte, 90 = leste) — ou omitido com `look`
 *       pitch,               graus — ou { horizon: g } = g graus acima do horizonte geométrico
 *       fov,                 graus (vertical)
 *       anchor: { body: 'moon', elevation: 14, azimuth: 0 },
 *                            (opcional) escolhe lat/lon para que o corpo fique
 *                            a `elevation` graus no céu; lat/lon viram fallback
 *       look: { body: 'sun'|'moon'|'planet'|<id>, offset: graus },
 *                            (opcional) rumo = azimute do corpo + offset
 *     },
 *     timeOfDay: 0..1 (hora LOCAL; 0,5 = meio-dia), weather: 'clear'|…,
 *     hud: false, cockpit: true|false (padrão: true em ship 1ª pessoa),
 *     sim: segundos de simulação antes de congelar (padrão 0),
 *     params: { ... }        livre para o dono (os sistemas leem ctx.shot.preset.params)
 *   }
 */
export function collectPresets(modules) {
  const byName = new Map();
  const dupes = [];
  for (const [path, mod] of Object.entries(modules)) {
    const v = mod?.default ?? mod;
    const list = Array.isArray(v) ? v : [v];
    for (const p of list) {
      if (!p || !p.name) continue;
      if (byName.has(p.name)) dupes.push(p.name);
      byName.set(p.name, { ...p, file: path.split('/').pop() });
    }
  }
  return { byName, dupes, names: [...byName.keys()] };
}

export const DEFAULT_PRESET = {
  name: 'default',
  owner: 'fundacao',
  seed: 1337,
  galaxy: 0,
  systemIndex: 0,
  planetIndex: 0,
  mode: 'walk',
  view: 'first',
  camera: { lat: 10, lon: 20, alt: 1.7, heading: 0, pitch: 0, fov: 70 },
  timeOfDay: 0.42,
  weather: 'clear',
  hud: false,
  sim: 0,
  params: {},
};

/**
 * Lê ?shot=<nome> e sobrescritas da URL:
 *   &seed=N &system=N &planet=N &time=0..1 &weather=x &hud=0|1 &sim=s
 *   &lat= &lon= &alt= &heading= &pitch= &fov= &mode= &view=
 */
export function parseShot(params, presets) {
  const name = params.get('shot');
  if (!name) return null;
  const base = presets.byName.get(name);
  const preset = {
    ...DEFAULT_PRESET,
    ...(base || {}),
    name,
    camera: { ...DEFAULT_PRESET.camera, ...(base?.camera || {}) },
    params: { ...(base?.params || {}) },
  };
  const num = (k) => (params.has(k) && params.get(k) !== '' ? Number(params.get(k)) : undefined);
  if (num('seed') !== undefined) preset.seed = num('seed') >>> 0;
  if (num('system') !== undefined) preset.systemIndex = num('system');
  if (num('planet') !== undefined) preset.planetIndex = num('planet');
  if (num('time') !== undefined) preset.timeOfDay = num('time');
  if (params.has('weather')) preset.weather = params.get('weather');
  if (params.has('hud')) preset.hud = params.get('hud') !== '0';
  if (num('sim') !== undefined) preset.sim = num('sim');
  if (params.has('mode')) preset.mode = params.get('mode');
  if (params.has('view')) preset.view = params.get('view');
  for (const k of ['lat', 'lon', 'alt', 'heading', 'pitch', 'fov']) {
    if (num(k) !== undefined) {
      preset.camera[k] = num(k);
      if (k === 'lat' || k === 'lon') delete preset.camera.anchor;
      if (k === 'heading') delete preset.camera.look;
    }
  }
  return {
    name,
    known: !!base,
    preset,
    seed: preset.seed >>> 0,
  };
}
