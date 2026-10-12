// Sistema `hud` — toda a interface do RPS3D.
//
//  • HUD de voo (camada do visor sobre o cockpit holográfico do `ships`, ou
//    HUD completa na câmera externa): alvo com caixa, antecipação, trava,
//    contatos, marcadores de navegação/objetivo/estações/planetas, alertas de
//    míssil, escudos/energia/calor/mísseis, altímetro e guia de pouso
//  • HUD a pé: retícula por arma, bússola, traje (O₂/temperatura/toxinas/
//    energia), munição, jetpack, scanner
//  • mapas do sistema e galáctico, pausa, configurações, painéis (shells)
//  • rádio com retrato procedural, notificações, prompts, escolhas
//  • controles de toque (iPad) e navegação por gamepad nos menus
//
// Serviço ctx.services.hud:
//   notify(text, kind?, opts?)                kind: info|warn|bad|reward|disc
//   subtitle(speaker, text, {faction, seconds, channel}) → duração (s)
//   prompt(text|null, {id, action, sub, hold 0..1, priority, ttl})
//   marker(id, getWorldPos|Vector3|{pos}, {label, kind, color, maxDist, offscreen, modes}) → {remove, update}
//   removeMarker(id)
//   panel(name, renderFn(el, api) → {update?, dispose?, nav?}, meta?)   (inventory, market, missions, workshop, catalog ou novos)
//   openPanel(name, data?) · closePanel() · openMap('system'|'galaxy') · closeMap()
//   setCrosshair(kind|null, {spread})        kind: rifle|shotgun|sniper|pistol|scope|tool|mining|none
//   hitMarker(kill?) · scanPulse() · setFoot(dados)  (o `foot` pode empurrar sinais vitais/munição)
//   choice({speaker|prompt, choices:[{id,text,detail,hot}], timeout, defaultId}) → Promise<id>
//   choose(prompt, choices, opts) → Promise<id>  (compatível com o `story`)
//   alert(t1, t2?, s?) · objective(o) · get modal · setVisible(bool)
import { CSS, PAL } from './style.js';
import { Layer } from './draw.js';
import { Projector } from './project.js';
import { Comms } from './comms.js';
import { Markers } from './markers.js';
import { FlightHud } from './flight.js';
import { FootHud } from './foot.js';
import { Maps } from './maps.js';
import { Menus } from './menu.js';
import { Touch } from './touch.js';
import { registerShots } from './shots.js';
import { PRESETS, makeQuality, detectPreset } from '../../core/Quality.js';

const H = {
  ctx: null, root: null, layer: null, P: null, comms: null, markers: null, flight: null, foot: null, maps: null, menus: null, touch: null,
  visible: true, modal: false, inputLocked: false, cooldown: 0, credits_: null, discoveries: [], lockLost: 0, lastMode: null, pad: { prev: [], navT: 0 },
};

const api = {
  notify: (text, kind = 'info', opts = {}) => H.comms?.notify(text, kind, opts),
  subtitle: (speaker, text, opts = {}) => H.comms?.subtitle(speaker, text, opts) ?? 0,
  radio: (e) => H.comms?.radio(e),
  prompt: (text, opts = {}) => H.comms?.prompt(text, opts),
  marker: (id, getPos, opts = {}) => H.markers?.add(id, getPos, opts),
  removeMarker: (id) => H.markers?.remove(id),
  panel: (name, fn, meta) => H.menus?.register(name, fn, meta),
  openPanel: (name, data) => { if (!H.menus) return; closeMap(); H.menus.openPanel(name, data); },
  closePanel: () => { while (H.menus?.top?.startsWith?.('panel:')) H.menus.back(); },
  openMap: (v) => openMap(v),
  closeMap: () => closeMap(),
  setCrosshair: (kind, opts = {}) => { if (!H.foot) return; H.foot.crosshair.kind = kind; if (opts.spread !== undefined) H.foot.setData({ spread: opts.spread }); },
  hitMarker: (kill) => H.foot?.hitMarker(kill),
  scanPulse: () => H.foot?.pulse(),
  setFoot: (d) => H.foot?.setData(d),
  choice: (d = {}) => H.comms.choose(d.prompt || d.speaker || d.text || 'RESPONDER', (d.choices || []).map((c, i) => (typeof c === 'string' ? { id: String(i), text: c } : c)), { timeout: d.timeout, defaultId: d.defaultId ?? d.default }).then((id) => { try { d.onChoose?.(id); } catch { /* */ } return id; }),
  choose: (prompt, choices, opts) => H.comms.choose(prompt, choices, opts),
  alert: (a, b, s) => H.comms?.alert(a, b, s),
  objective: (o) => onObjective(o),
  togglePause: () => togglePause(),
  setVisible: (v) => { H.visible = !!v; },
  get modal() { return H.modal; },
  get markers() { return H.markers; },
  get discoveries() { return H.discoveries; },
  get layer() { return H.layer; },
};

// ─── utilidades ───────────────────────────────────────────────────────────
function credits() {
  const ctx = H.ctx;
  try { const e = ctx.services.economy; const v = typeof e?.credits === 'function' ? e.credits() : e?.credits; if (typeof v === 'number') return v; } catch { /* */ }
  if (typeof H.credits_ === 'number') return H.credits_;
  return ctx.services.story?.state?.credits ?? 0;
}

function onModal(on) {
  const ctx = H.ctx;
  const any = on || H.maps?.isOpen || false;
  if (any === H.modal) return;
  H.modal = any;
  H.root.classList.toggle('modal-open', any);
  if (any) {
    if (ctx.input.enabled !== false) { ctx.input.enabled = false; H.inputLocked = true; }
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* */ }
  } else {
    if (H.inputLocked) { ctx.input.enabled = true; H.inputLocked = false; }
    H.cooldown = 0.3;
  }
  const pausing = H.menus?.top === 'pause' || H.menus?.top === 'settings';
  if (pausing !== !!ctx.game.paused && (pausing || H.pausedByHud)) { ctx.game.setPaused(pausing); H.pausedByHud = pausing; }
}

function openMap(view = 'system') {
  if (!H.maps) return;
  H.menus?.closeAll();
  H.maps.open(view);
  onModal(true);
}
function closeMap() { if (H.maps?.isOpen) { H.maps.close(); onModal(H.menus?.open || false); } }
function togglePause() {
  if (H.maps?.isOpen) { closeMap(); return; }
  if (H.menus.open) H.menus.closeAll(); else H.menus.openPause();
}

function onObjective(o) {
  H.comms.setObjective(o && o.text ? o : null);
  H.markers.setObjective(o && o.text ? { ...o, label: o.bodyId ? H.ctx.universe.system?.body(o.bodyId)?.name || 'OBJETIVO' : 'OBJETIVO' } : null);
}

function setQuality(name) {
  const ctx = H.ctx;
  const real = name === 'auto' ? detectPreset(ctx.backend) : name;
  if (!PRESETS[real]) return;
  const q = makeQuality(real);
  const keep = ctx.quality;
  for (const k of Object.keys(keep)) delete keep[k];
  Object.assign(keep, q);
  ctx.resize?.();
  ctx.bus.emit('quality:change', { name: real });
  ctx.prefs = { ...(ctx.prefs || {}), quality: name === 'auto' ? undefined : name };
  if (!ctx.shot) ctx.save.setPrefs?.(ctx.prefs)?.catch?.(() => {});
  ctx.bus.emit('prefs:change', { quality: real });
  H.layer.dprCap = keep.name === 'mobile' ? 1.5 : 2;
}

function applyPrefs() {
  const p = H.ctx.prefs || {};
  H.root.style.setProperty('--hs', p.hudScale ?? 1);
  H.layer.cv.style.opacity = p.hudOpacity ?? 1;
  if (p.fov && H.ctx.camera.fov !== p.fov && !H.ctx.shot) { H.ctx.camera.fov = p.fov; H.ctx.camera.updateProjectionMatrix(); }
  H.touch?.layout();
}

// ─── teclado / gamepad (menus) ─────────────────────────────────────────────
function onKeyDown(e) {
  const ctx = H.ctx;
  if (!ctx || ctx.game.mode === 'title') return;
  const k = e.code;
  if (H.comms.choosing) { if (H.comms.onKey(k)) e.preventDefault(); return; }
  if (H.maps.isOpen) {
    if (k === 'Escape' || k === 'KeyM' || k === 'Backspace') { closeMap(); e.preventDefault(); return; }
    if (H.maps.onKey(k)) e.preventDefault();
    return;
  }
  if (H.menus.open) {
    if ((k === 'Tab' || k === 'KeyI') && H.menus.top === 'panel:inventory') { H.menus.closeAll(); e.preventDefault(); return; }
    if (k === 'KeyO' && H.menus.top === 'panel:missions') { H.menus.closeAll(); return; }
    if (H.menus.onKey(k)) e.preventDefault();
  }
}

function padNav(dt) {
  const ctx = H.ctx;
  const gp = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
  if (!gp) return;
  const b = gp.buttons.map((x) => x.value > 0.5);
  const prev = H.pad.prev;
  const edge = (i) => b[i] && !prev[i];
  const ly = gp.axes[1] || 0, lx = gp.axes[0] || 0;
  H.pad.navT -= dt;
  let dir = 0, side = 0;
  if (Math.abs(ly) > 0.6 && H.pad.navT <= 0) { dir = ly > 0 ? 1 : -1; H.pad.navT = 0.2; }
  if (Math.abs(lx) > 0.6 && H.pad.navT <= 0) { side = lx > 0 ? 1 : -1; H.pad.navT = 0.2; }
  if (Math.abs(ly) < 0.3 && Math.abs(lx) < 0.3) H.pad.navT = 0;
  if (edge(12)) dir = -1; if (edge(13)) dir = 1; if (edge(14)) side = -1; if (edge(15)) side = 1;
  const confirm = edge(0), back = edge(1), tab = edge(4) ? -1 : edge(5) ? 1 : 0;
  if (H.comms.choosing) H.comms.onNav(dir, confirm);
  else if (H.maps.isOpen) {
    if (back || edge(8)) closeMap();
    else {
      if (dir || side) H.maps.cycle(dir || side);
      if (confirm) H.maps.route();
      if (edge(3)) H.maps.open(H.maps.view === 'system' ? 'galaxy' : 'system');
      H.maps.onPad(gp.axes[2] || 0, gp.axes[3] || 0, gp.buttons[7]?.value || 0, gp.buttons[6]?.value || 0, dt);
    }
  } else if (H.menus.open) {
    if (edge(9)) H.menus.closeAll();
    else H.menus.nav({ dir, side, confirm, back, tab });
  }
  H.pad.prev = b;
  void ctx;
}

// ─── sistema ───────────────────────────────────────────────────────────────
export default {
  name: 'hud',
  order: 90,
  async init(ctx) {
    H.ctx = ctx;
    if (!document.getElementById('hud-css')) {
      const st = document.createElement('style'); st.id = 'hud-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.id = 'hud';
    ctx.ui.appendChild(root);
    H.root = root;
    H.layer = new Layer(root, { dprCap: ctx.quality.name === 'mobile' ? 1.5 : 2 });
    H.layer.cv.classList.add('fadeable');
    H.P = new Projector(ctx);
    const hud = {
      ctx, root, get modal() { return H.modal; }, notify: api.notify, credits, onModal, openMap, togglePause, setQuality, applyPrefs, openPanel: api.openPanel,
      get comms() { return H.comms; }, get markers() { return H.markers; }, get discoveries() { return H.discoveries; },
    };
    H.hud = hud;
    H.comms = new Comms(hud, root);
    H.markers = new Markers(hud);
    H.flight = new FlightHud(hud);
    H.foot = new FootHud(hud);
    H.maps = new Maps(hud, root);
    H.menus = new Menus(hud, root);
    H.touch = new Touch(hud, root);
    ctx.provide('hud', api);
    applyPrefs();

    const bus = ctx.bus;
    H.markers.rebuild(ctx.universe.system);
    bus.on('system:change', (e) => { H.markers.rebuild(e?.system || ctx.universe.system); if (H.maps.isOpen) H.maps.open(H.maps.view); });
    bus.on('notify', (e) => { if (e?.text) H.comms.notify(e.text, e.kind || 'info', { sub: e.sub }); });
    bus.on('radio', (e) => { if (!e || e.subtitle) return; if (ctx.prefs?.subtitles === false && e.priority < 3) return; H.comms.radio(e); });
    bus.on('objective', (e) => onObjective(e));
    bus.on('credits:change', (e) => { if (typeof e?.value === 'number') H.credits_ = e.value; });
    bus.on('scan:discover', (e) => {
      if (!e?.name) return;
      if (!H.discoveries.some((d) => d.id === e.id)) H.discoveries.unshift({ id: e.id, kind: e.kind, name: e.name, body: e.body?.id || e.body, bodyName: e.body?.name || ctx.universe.system?.body?.(e.body)?.name || '', date: new Date().toLocaleDateString('pt-BR') });
      H.comms.notify(`DESCOBERTA — ${String(e.name).toUpperCase()}`, 'disc', { sub: { fauna: 'Fauna catalogada', flora: 'Flora catalogada', mineral: 'Mineral catalogado', ruin: 'Ruína dos Arquitetos' }[e.kind] || '' });
      H.foot.pulse();
    });
    bus.on('rep:change', (e) => { if (e?.delta && Math.abs(e.delta) >= 3) H.comms.notify(`${ctx.universe.FACTIONS[e.faction]?.name?.toUpperCase() || e.faction} ${e.delta > 0 ? '+' : ''}${e.delta}`, e.delta > 0 ? 'reward' : 'warn', { sub: 'Reputação' }); });
    bus.on('mission:accept', (e) => { const m = e?.mission; if (m?.title && m.procedural) H.comms.notify(`CONTRATO ACEITO — ${m.title.toUpperCase()}`, 'info'); });
    bus.on('quantum:interdicted', () => H.comms.alert('INTERDIÇÃO', 'Puxado da viagem quântica', 3));
    bus.on('jump:start', () => H.comms.alert('SALTO INICIADO', 'Mantenha o curso', 2.2));
    bus.on('atmo:enter', (e) => H.comms.notify(`ENTRANDO NA ATMOSFERA — ${e?.body?.name?.toUpperCase?.() || ''}`, 'info'));
    bus.on('player:death', () => { H.menus.closeAll(); closeMap(); });
    bus.on('mode:change', (e) => { if (e?.to === 'title' || e?.to === 'cinematic') { H.menus.closeAll(); closeMap(); } });
    bus.on('quality:change', () => { H.layer.dprCap = ctx.quality.name === 'mobile' ? 1.5 : 2; });
    ctx.save.register('hud', { serialize: () => ({ disc: H.discoveries.slice(0, 400) }), deserialize: (d) => { H.discoveries = d?.disc || []; } });

    addEventListener('keydown', onKeyDown, true);
    ctx.canvas.addEventListener('click', () => {
      const m = ctx.game.mode;
      if ((m === 'ship' || m === 'foot') && !H.modal && !H.comms.choosing) ctx.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) return;
      const m = ctx.game.mode;
      if ((m === 'ship' || m === 'foot') && !H.modal && !H.comms.choosing && ctx.input.device === 'kbm' && !ctx.shot && H.cooldown <= 0) H.menus.openPause();
    });
    registerShots(ctx, H, api);
  },

  update(dt, ctx) {
    if (H.cooldown > 0) H.cooldown -= dt;
    const mode = ctx.game.mode;
    if (mode !== 'ship' && mode !== 'foot' && mode !== 'map') return;
    const inp = ctx.input;
    if (H.modal || H.comms.choosing || H.cooldown > 0) return;
    if (inp.pressed('pause')) H.menus.openPause();
    else if (inp.pressed('map')) openMap('system');
    else if (inp.pressed('inventory')) api.openPanel('inventory');
    else if (inp.pressed('journal')) api.openPanel('missions');
  },

  frame(dt, ctx) {
    const real = ctx.time.virtual ? 1 / 30 : Math.min(0.1, Math.max(0, ctx.time.now - (H.lastNow ?? ctx.time.now)));
    H.lastNow = ctx.time.now;
    H.shotHook?.(real);
    const mode = ctx.game.mode;
    const g = H.layer.fit();
    const W = H.layer.W, Hh = H.layer.H;
    H.P.begin(W, Hh);
    const playing = mode === 'ship' || mode === 'foot' || mode === 'map';
    const pref0 = ctx.prefs?.touch || 'auto';
    const touchMode = pref0 === 'on' || (pref0 === 'auto' && (ctx.input.device === 'touch' || !!H.forceTouch));
    H.root.classList.toggle('touchmode', touchMode);
    const cine = !!ctx.services.story?.inCinematic;
    const show = H.visible && playing && !H.maps.isOpen && !H.modal && !cine;
    H.root.classList.toggle('hidden-hud', !show);
    if (show) {
      try {
        if (mode === 'ship' && ctx.player.ship) {
          H.markers.draw(g, H.P, 'ship', { qt: qtInfo(ctx), dt: real, objDistCb: (d) => H.comms.setObjectiveDistance(fmtD(d)) });
          H.flight.draw(g, H.P, real, W, Hh, { noPanels: ctx.prefs?.flightPanels === false || touchMode, strip: touchMode });
        } else if (mode === 'foot') {
          H.markers.draw(g, H.P, 'foot', { dt: real, objDistCb: (d) => H.comms.setObjectiveDistance(fmtD(d)) });
          H.foot.draw(g, H.P, real, W, Hh, H.markers);
        }
      } catch (e) {
        if (!H.drawErr) { H.drawErr = true; ctx.errors.push('hud draw: ' + (e.stack || e)); }
      }
    }
    if (mode === 'ship' && !ctx.shot) shipPrompts(ctx);
    H.comms.frame(real);
    H.maps.frame(real);
    H.menus.frame(real);
    if (H.modal || H.comms.choosing) padNav(real);
    // toque
    const pref = ctx.prefs?.touch || 'auto';
    const touchOn = pref === 'on' || (pref === 'auto' && (ctx.input.device === 'touch' || !!H.forceTouch));
    const sh = ctx.player.ship;
    const near = mode === 'ship' && sh && !sh.landed && ((sh.body && sh.altitude < 1500) || sh.station);
    const pr = [...H.comms.prompts.values()][0];
    H.touch.frame(touchOn && playing && !H.modal && !H.comms.choosing && pref !== 'off', mode === 'foot' ? 'foot' : 'ship', { interact: !!pr || near || (sh?.landed && mode === 'ship'), label: pr ? 'USAR' : sh?.landed ? 'SAIR' : 'POUSAR' });
    H.lastMode = mode;
  },

  dispose() {
    removeEventListener('keydown', onKeyDown, true);
    H.root?.remove();
  },
};

/** Prompts contextuais da nave (pousar, atracar, levantar). */
function shipPrompts(ctx) {
  const sh = ctx.player.ship;
  if (!sh || sh.autopilot) { H.comms.prompt(null, { id: 'ship' }); return; }
  let txt = null, sub = '';
  if (sh.landed || sh.docked) { txt = 'Levantar da cadeira'; sub = sh.docked ? 'Hangar pressurizado' : (sh.body?.name || ''); }
  else {
    const sys = ctx.universe.system;
    let best = null, bd = 12000;
    for (const st of sys?.stations || []) { if (st.hidden) continue; const d = st.pos.distanceTo(sh.pos); if (d < bd) { bd = d; best = st; } }
    if (best) { txt = 'Solicitar pouso'; sub = `${best.name} · ${(bd / 1000).toFixed(1)} km`; }
    else if (sh.body && sh.altitude < 1500 && sh.body.landable !== false) { txt = 'Pouso assistido'; sub = `${sh.body.name} · ${Math.round(sh.altitude)} m`; }
  }
  if (txt) H.comms.prompt(txt, { id: 'ship', action: 'interact', sub, ttl: 0.3 }); else H.comms.prompt(null, { id: 'ship' });
}

function qtInfo(ctx) {
  const sh = ctx.player.ship;
  const t = sh?.target;
  if (!t) return null;
  return { ref: t.ref, id: t.id, name: t.name, eta: sh.quantum?.eta || 0 };
}
function fmtD(m) {
  if (!Number.isFinite(m)) return '';
  if (m >= 1e6) return `${(m / 1e6).toFixed(1)} Mm`;
  if (m >= 1e3) return `${(m / 1e3).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}
export { api as hudApi, PAL };
