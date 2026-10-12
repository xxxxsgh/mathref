// Menus da HUD: pausa (com cartão de status, facções e créditos),
// configurações (gráficos, controles, áudio, interface, mapa de controles) e
// o "terminal" de painéis (inventário, mercado, missões, oficina, catálogo)
// que outros sistemas preenchem via services.hud.panel(nome, renderFn).
//
// Navegação: teclado (setas/WASD, Enter, Esc, Q/E abas), gamepad (direcional
// ou analógico, A confirma, B volta, LB/RB abas) e toque/mouse.
import { PRESETS, PRESET_ORDER } from '../../core/Quality.js';
import { ICONS, esc, rich, fmtTime, hexA, holo } from './draw.js';
import { FACTION_COLORS } from './portrait.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const ic = (k, s = 18) => (ICONS[k] || ICONS.info).replace('<svg', `<svg width="${s}" height="${s}"`);

export const PANELS = {
  missions: { title: 'Missões', sub: 'DIÁRIO DE BORDO', icon: 'mission' },
  inventory: { title: 'Inventário', sub: 'CARGA E EQUIPAMENTO', icon: 'inv' },
  market: { title: 'Mercado', sub: 'GUILDA DOS MERCADORES', icon: 'market' },
  workshop: { title: 'Oficina', sub: 'NAVE E TRAJE', icon: 'workshop' },
  catalog: { title: 'Catálogo', sub: 'DESCOBERTAS DO SCANNER', icon: 'catalog' },
};

export class Menus {
  constructor(hud, root) {
    this.hud = hud; this.ctx = hud.ctx;
    this.root = root;
    this.stack = [];
    this.renderers = new Map();
    // pausa
    this.pauseEl = el('div', 'modal pause', `<div class="scrim"></div><div class="grain"></div><div class="scan"></div>
      <div class="side"><div class="k">REVOLUÇÃO · 2387</div><div class="h">PAUSA</div><div class="loc"></div><div class="items"></div></div>
      <div class="card"></div>`);
    root.appendChild(this.pauseEl);
    this.pItems = this.pauseEl.querySelector('.items');
    this.pLoc = this.pauseEl.querySelector('.loc');
    this.pCard = this.pauseEl.querySelector('.card');
    // configurações
    this.cfgEl = el('div', 'modal', `<div class="scrim"></div><div class="grain"></div><div class="cfg glass"><div class="gh">CONFIGURAÇÕES<span>RPS3D · REVOLUTION</span></div><div class="tabs"></div><div class="body"></div><div class="foot"></div></div>`);
    root.appendChild(this.cfgEl);
    this.cTabs = this.cfgEl.querySelector('.tabs'); this.cBody = this.cfgEl.querySelector('.body'); this.cFoot = this.cfgEl.querySelector('.foot');
    // terminal de painéis
    this.shellEl = el('div', 'modal', `<div class="scrim"></div><div class="grain"></div><div class="scan"></div><div class="shell"><div class="top"><div><div class="sub"></div><div class="ttl"></div></div><div class="tabs"></div><div class="wallet"></div></div><div class="content"></div><div class="foot" style="border:0;padding:12px 4px 0"></div></div>`);
    root.appendChild(this.shellEl);
    this.sTabs = this.shellEl.querySelector('.tabs'); this.sTtl = this.shellEl.querySelector('.ttl'); this.sSub = this.shellEl.querySelector('.sub');
    this.sWallet = this.shellEl.querySelector('.wallet'); this.sContent = this.shellEl.querySelector('.content'); this.sFoot = this.shellEl.querySelector('.foot');
    this.grain();
    this.sel = 0;
    this.cfgTab = 0; this.cfgSel = 0;
    this.panelName = null; this.panelInst = null;
  }

  grain() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const url = `url(${cv.toDataURL()})`;
    this.root.querySelectorAll('.grain').forEach((e) => { e.style.backgroundImage = url; });
  }

  get top() { return this.stack[this.stack.length - 1] || null; }
  get open() { return this.stack.length > 0; }

  // ═════════════════════════════════════════════════════════════════════
  // PAUSA
  openPause() {
    if (this.top === 'pause') return;
    this.stack = ['pause'];
    this.sel = 0;
    this.renderPause();
    this.show();
  }
  pauseItems() {
    return [
      { id: 'resume', label: 'Retomar', hint: 'ESC' },
      { id: 'map', label: 'Mapa', hint: 'M' },
      { id: 'missions', label: 'Missões', hint: 'O' },
      { id: 'inventory', label: 'Inventário', hint: 'TAB' },
      { id: 'catalog', label: 'Catálogo' },
      { id: 'settings', label: 'Configurações' },
      { id: 'save', label: 'Salvar jogo', dim: !!this.ctx.shot },
    ];
  }
  renderPause() {
    const ctx = this.ctx;
    const sys = ctx.universe.system;
    const b = ctx.player.ship?.body || (sys?.dominantBody?.(ctx.player.camWorld));
    const story = ctx.services.story;
    const ml = story?.mission;
    this.pLoc.innerHTML = `<b>${esc(sys?.name || '')}</b>${b ? ` · ${esc(b.name)}` : ''}<br>${esc(sys?.region || ctx.universe.galaxy.entry(sys?.id)?.region || '')}`;
    this.pItems.innerHTML = this.pauseItems().map((it, i) => `<div class="mi${i === this.sel ? ' sel' : ''}${it.dim ? ' dim' : ''}" data-i="${i}">${esc(it.label)}${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}</div>`).join('');
    [...this.pItems.children].forEach((n, i) => { n.addEventListener('pointerenter', () => { this.sel = i; this.markSel(this.pItems, '.mi'); }); n.addEventListener('click', () => { this.sel = i; this.activatePause(); }); });
    // cartão de status
    const credits = this.hud.credits();
    const fac = this.factionRows();
    const act = story?.act ? ['', 'I', 'II', 'III'][story.act] || '' : '';
    const playT = story?.state?.playTime || 0;
    this.pCard.innerHTML = `<div class="glass"><div class="gh">RAFAEL PAOLI<span>EX-LANÇA-7</span></div><div class="gb">
      <div class="row"><span>Créditos</span><b class="num" style="font:300 20px/1 'Inter Display',Inter,sans-serif">${credits.toLocaleString('pt-BR')} ¢</b></div>
      ${ml ? `<div class="row"><span>Missão</span><b style="text-align:right;max-width:220px">${esc(ml.title || '')}</b></div>` : ''}
      ${act ? `<div class="row"><span>Campanha</span><b>Ato ${act}</b></div>` : ''}
      ${playT ? `<div class="row"><span>Tempo de jogo</span><b>${esc(fmtTime(playT))}</b></div>` : ''}
      <div style="margin:14px 0 6px" class="lbl">REPUTAÇÃO</div>
      ${fac}
    </div></div>`;
  }
  factionRows() {
    const fx = this.ctx.services.factions;
    const F = this.ctx.universe.FACTIONS;
    let all = null;
    try { all = fx?.all?.() || null; } catch { all = null; }
    if (!all) all = Object.values(F).map((f) => ({ id: f.id, name: f.name, rep: f.id === 'hegemonia' ? -85 : f.id === 'frente' ? 15 : 0, standing: { label: f.id === 'hegemonia' ? 'Inimigo jurado' : 'Neutro' } }));
    return all.map((f) => {
      const v = Math.max(-100, Math.min(100, f.rep ?? 0));
      const col = FACTION_COLORS[f.id] || '#a6ecff';
      const w = Math.abs(v) / 2;
      return `<div class="row" style="padding:6px 0"><span style="display:flex;flex-direction:column;gap:3px"><span style="color:${col};font-weight:600;font-size:12px">${esc(f.name)}</span><span style="font-size:10px;letter-spacing:.14em;color:#7d93a8;text-transform:uppercase">${esc(f.id === 'vigilantes' && v === 0 ? 'Desconhecido' : f.standing?.label || '')}</span></span>
        <span class="bar mid" style="--bc:${v < 0 ? '#ff5a48' : col}"><i style="${v < 0 ? `left:${50 - w}%;width:${w}%` : `width:${w}%`}"></i></span></div>`;
    }).join('');
  }
  activatePause() {
    const it = this.pauseItems()[this.sel];
    if (!it || it.dim) return;
    if (it.id === 'resume') this.closeAll();
    else if (it.id === 'map') { this.closeAll(); this.hud.openMap('system'); }
    else if (it.id === 'settings') this.openSettings();
    else if (it.id === 'save') { try { this.ctx.save.write(); this.hud.notify('JOGO SALVO', 'info'); } catch { this.hud.notify('FALHA AO SALVAR', 'warn'); } }
    else this.openPanel(it.id);
  }

  // ═════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES
  openSettings(tab = 0) {
    this.stack.push('settings');
    this.cfgTab = tab; this.cfgSel = 0;
    this.renderSettings();
    this.show();
  }
  prefs() { return this.ctx.prefs || (this.ctx.prefs = {}); }
  cfgTabs() {
    const P = this.prefs(), ctx = this.ctx;
    const qList = ['auto', ...PRESET_ORDER];
    const qLabel = (k) => (k === 'auto' ? 'Automático' : PRESETS[k].label);
    return [
      { name: 'Gráficos', rows: [
        { kind: 'sel', name: 'Qualidade', desc: 'Preset de render (Automático detecta o aparelho)', get: () => P.quality || 'auto', opts: qList, label: qLabel, set: (v) => this.hud.setQuality(v) },
        { kind: 'tog', name: 'Escala dinâmica de resolução', desc: 'Mantém a taxa de quadros reduzindo a resolução interna', get: () => P.dynamicRes !== false, set: (v) => this.setPref({ dynamicRes: v }) },
        { kind: 'tog', name: 'Desfoque de movimento', get: () => ctx.quality.motionBlur, set: (v) => { ctx.quality.motionBlur = v; ctx.bus.emit('quality:change', { name: ctx.quality.name }); this.setPref({ motionBlur: v }); } },
        { kind: 'tog', name: 'Granulação de filme', get: () => ctx.quality.filmGrain, set: (v) => { ctx.quality.filmGrain = v; ctx.bus.emit('quality:change', { name: ctx.quality.name }); this.setPref({ filmGrain: v }); } },
        { kind: 'sld', name: 'Campo de visão', desc: 'Graus (vertical)', get: () => P.fov ?? 72, min: 60, max: 95, step: 1, fmt: (v) => `${Math.round(v)}°`, set: (v) => this.setPref({ fov: v }) },
      ] },
      { name: 'Controles', rows: [
        { kind: 'sld', name: 'Sensibilidade', get: () => P.sensitivity ?? 1, min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2), set: (v) => this.setPref({ sensitivity: v }) },
        { kind: 'tog', name: 'Inverter eixo Y', get: () => !!P.invertY, set: (v) => this.setPref({ invertY: v }) },
        { kind: 'tog', name: 'Vibração do controle', get: () => P.rumble !== false, set: (v) => this.setPref({ rumble: v }) },
        { kind: 'sel', name: 'Controles de toque', desc: 'Joysticks e botões virtuais na tela', get: () => P.touch || 'auto', opts: ['auto', 'on', 'off'], label: (k) => ({ auto: 'Automático', on: 'Sempre', off: 'Nunca' }[k]), set: (v) => this.setPref({ touch: v }) },
        { kind: 'sld', name: 'Tamanho dos controles de toque', get: () => P.touchScale ?? 1, min: 0.75, max: 1.4, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ touchScale: v }) },
      ] },
      { name: 'Áudio', rows: [
        { kind: 'sld', name: 'Volume geral', get: () => P.volume ?? 0.8, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ volume: v }) },
        { kind: 'sld', name: 'Música', get: () => P.music ?? 0.7, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ music: v }) },
        { kind: 'sld', name: 'Efeitos', get: () => P.sfx ?? 0.9, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ sfx: v }) },
        { kind: 'sld', name: 'Rádio e vozes', get: () => P.voice ?? 0.9, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ voice: v }) },
      ] },
      { name: 'Interface', rows: [
        { kind: 'tog', name: 'Legendas', get: () => P.subtitles !== false, set: (v) => this.setPref({ subtitles: v }) },
        { kind: 'sld', name: 'Escala da HUD', get: () => P.hudScale ?? 1, min: 0.8, max: 1.3, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ hudScale: v }) },
        { kind: 'sld', name: 'Opacidade da HUD', get: () => P.hudOpacity ?? 1, min: 0.4, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, set: (v) => this.setPref({ hudOpacity: v }) },
        { kind: 'tog', name: 'Painéis de sistemas no voo', desc: 'Escudos, energia e armamento nos cantos', get: () => P.flightPanels !== false, set: (v) => this.setPref({ flightPanels: v }) },
      ] },
      { name: 'Mapa de controles', rows: [], custom: () => this.controlsMap() },
    ];
  }
  setPref(o) {
    const ctx = this.ctx;
    ctx.prefs = { ...this.prefs(), ...o };
    const p = ctx.prefs;
    ctx.input.sensitivity = 0.0022 * (p.sensitivity ?? 1);
    ctx.input.invertY = !!p.invertY;
    try { ctx.services.audio?.setVolume?.(p.volume ?? 0.8); } catch { /* */ }
    this.hud.applyPrefs();
    ctx.bus.emit('prefs:change', { ...o });
    if (!ctx.shot) ctx.save.setPrefs?.(p)?.catch?.(() => {});
  }
  renderSettings() {
    const tabs = this.cfgTabs();
    const T = tabs[this.cfgTab];
    this.cTabs.innerHTML = tabs.map((t, i) => `<div class="tab${i === this.cfgTab ? ' on' : ''}" data-i="${i}">${esc(t.name)}</div>`).join('') + `<div class="bump">${this.ctx.input.device === 'gamepad' ? 'LB / RB' : 'Q / E'}</div>`;
    [...this.cTabs.querySelectorAll('.tab')].forEach((n) => n.addEventListener('click', () => { this.cfgTab = Number(n.dataset.i); this.cfgSel = 0; this.renderSettings(); }));
    if (T.custom) this.cBody.innerHTML = T.custom();
    else {
      this.cBody.innerHTML = T.rows.map((r, i) => `<div class="opt2${i === this.cfgSel ? ' sel' : ''}" data-i="${i}"><div class="nm">${esc(r.name)}${r.desc ? `<small>${esc(r.desc)}</small>` : ''}</div><div class="val">${this.rowVal(r)}</div></div>`).join('');
      if (this.cfgTab === 0) this.cBody.insertAdjacentHTML('beforeend', this.presetCard());
      [...this.cBody.querySelectorAll('.opt2')].forEach((n, i) => {
        n.addEventListener('pointerenter', () => { this.cfgSel = i; this.markSel(this.cBody, '.opt2', this.cfgSel); });
        n.addEventListener('click', (e) => {
          const r = T.rows[i];
          if (r.kind === 'sld') { const s = n.querySelector('.slider'); const b = s.getBoundingClientRect(); const k = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)); if (e.clientX >= b.left - 8 && e.clientX <= b.right + 8) { r.set(r.min + k * (r.max - r.min)); this.renderSettings(); return; } }
          if (r.kind === 'sel' && e.target.closest('.ar')) { this.adjust(r, e.target.closest('.ar').dataset.d === '-' ? -1 : 1); return; }
          this.adjust(r, 1);
        });
      });
    }
    const dev = this.ctx.input.device;
    const K = (a, b) => `<span><span class="k2">${dev === 'gamepad' ? b : a}</span>`;
    this.cFoot.innerHTML = `${K('⇅', '✥')}Navegar</span>${K('◀ ▶', '◀ ▶')}Ajustar</span>${K('ESC', 'B')}Voltar</span>`;
  }
  presetCard() {
    const q = this.ctx.quality, ctx = this.ctx;
    const W = Math.round(innerWidth * Math.min(devicePixelRatio || 1, q.dprCap) * (q.dynamicScale ?? q.renderScale));
    const Hh = Math.round(innerHeight * Math.min(devicePixelRatio || 1, q.dprCap) * (q.dynamicScale ?? q.renderScale));
    const on = (b, t) => `<span class="chip${b ? '' : ' off'}" style="${b ? '' : 'opacity:.35;text-decoration:line-through'}">${t}</span>`;
    return `<div style="margin:18px 14px 0;padding:16px 18px;border:1px solid rgba(166,236,255,.12);background:linear-gradient(180deg,rgba(166,236,255,.04),transparent)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px"><span class="lbl">PRESET ATIVO</span><span style="font:300 22px/1 'Inter Display',Inter,sans-serif;letter-spacing:.12em;color:#fff">${esc(String(q.label || q.name).toUpperCase())}</span></div>
      <div class="row"><span>Renderizador</span><b>${ctx.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'} · ${W}×${Hh}</b></div>
      <div class="row"><span>Sombras</span><b>${q.shadows ? `${q.shadowMapSize} px · ${q.shadowCascades} cascata${q.shadowCascades > 1 ? 's' : ''}` : 'Desligadas'}</b></div>
      <div class="row"><span>Nuvens · atmosfera · nebulosas</span><b>${q.cloudSteps} · ${q.atmosphereSteps} · ${q.nebulaSteps} passos</b></div>
      <div class="row"><span>Terreno</span><b>LOD ${q.terrainLod} · malha ${q.terrainChunkRes}² · vegetação ${Math.round(q.foliageDensity * 100)}%</b></div>
      <div style="margin-top:10px">${on(q.bloom, 'Bloom')}${on(q.taa, 'TAA')}${on(q.motionBlur, 'Desfoque')}${on(q.dof, 'Prof. de campo')}${on(q.lensFlare, 'Lens flare')}${on(q.godRays, 'Raios de luz')}${on(q.ssao, 'SSAO')}${on(q.filmGrain, 'Granulação')}</div></div>`;
  }
  rowVal(r) {
    const v = r.get();
    if (r.kind === 'tog') return `<div class="tog${v ? ' on' : ''}"><i></i></div>`;
    if (r.kind === 'sld') { const k = (v - r.min) / (r.max - r.min); return `<div class="slider"><i style="width:${k * 100}%"></i><b style="left:${k * 100}%"></b></div><div class="n num">${esc(r.fmt(v))}</div>`; }
    if (r.kind === 'sel') {
      const i = r.opts.indexOf(v);
      return `<div style="display:flex;flex-direction:column;align-items:center"><div class="sel3"><div class="ar" data-d="-">◀</div><div class="v">${esc(r.label(v))}</div><div class="ar" data-d="+">▶</div></div><div class="dots">${r.opts.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
    }
    return '';
  }
  adjust(r, d) {
    if (!r) return;
    if (r.kind === 'tog') r.set(!r.get());
    else if (r.kind === 'sld') r.set(Math.max(r.min, Math.min(r.max, Math.round((r.get() + d * r.step) / r.step) * r.step)));
    else if (r.kind === 'sel') { const i = r.opts.indexOf(r.get()); r.set(r.opts[(i + d + r.opts.length) % r.opts.length]); }
    this.renderSettings();
  }
  controlsMap() {
    const rows = [
      ['Nave', [['Acelerador', 'W / S', 'LS ↕'], ['Manche (guinada/arfagem)', 'Mouse', 'RS'], ['Rolagem', 'Q / E', 'LB / RB'], ['Strafe vertical', 'Espaço / C', 'A / B'], ['Boost', 'Shift', 'LS ●'], ['Disparar', 'Botão esq.', 'RT'], ['Míssil', 'Botão dir.', 'LT'], ['Contramedidas', 'X', '▼'], ['Alvo', 'T', 'RS ●'], ['Quântico / cruzeiro', 'J', '▲'], ['Trem de pouso', 'N', '▶'], ['Desacoplar', 'V', '◀'], ['Energia: escudo / motor / armas', '1 / 2 / 3', '—'], ['Câmera externa', 'B', '—'], ['Pousar / atracar / levantar', 'F', 'Y']]],
      ['A pé', [['Mover', 'W A S D', 'LS'], ['Olhar', 'Mouse', 'RS'], ['Pular / jetpack', 'Espaço', 'A'], ['Correr', 'Shift', 'LS ●'], ['Atirar / mirar', 'Botões do mouse', 'RT / LT'], ['Recarregar', 'R', 'X'], ['Granada', 'G', '—'], ['Interagir', 'F', 'Y'], ['Scanner', 'Z', '—'], ['Multiferramenta', 'H', '—'], ['Lanterna', 'L', '—']]],
      ['Interface', [['Mapa', 'M', '⧉'], ['Inventário', 'Tab / I', '—'], ['Missões', 'O', '—'], ['Pausa', 'Esc / P', '☰']]],
    ];
    const pad = this.ctx.input.device === 'gamepad';
    return `<div class="ctl">${rows.map(([h, rs]) => `<h4>${esc(h)}</h4>${rs.map(([a, k, p]) => `<div class="r">${esc(a)}<span>${(pad ? p : k).split(' / ').map((x) => `<span class="k2">${esc(x)}</span>`).join('')}</span></div>`).join('')}`).join('')}</div>`;
  }

  // ═════════════════════════════════════════════════════════════════════
  // TERMINAL DE PAINÉIS
  register(name, fn, meta = {}) { this.renderers.set(name, { fn, meta: { ...(PANELS[name] || { title: name, sub: '', icon: 'info' }), ...meta } }); }
  openPanel(name, data = {}) {
    if (this.top && this.top.startsWith?.('panel:')) this.stack.pop();
    this.stack.push('panel:' + name);
    this.panelName = name; this.panelData = data;
    this.renderShell();
    this.show();
  }
  renderShell() {
    const name = this.panelName;
    const reg = this.renderers.get(name);
    const meta = reg?.meta || PANELS[name] || { title: name, sub: '' };
    this.sTtl.textContent = (meta.title || name).toUpperCase();
    this.sSub.textContent = meta.sub || '';
    const tabs = Object.keys(PANELS).filter((k) => k !== 'market' && k !== 'workshop' || this.renderers.has(k) || this.docked() || k === name);
    for (const k of this.renderers.keys()) if (!tabs.includes(k)) tabs.push(k);
    this.shellTabs = tabs;
    this.sTabs.innerHTML = tabs.map((k) => `<div class="tab${k === name ? ' on' : ''}" data-k="${k}">${esc((this.renderers.get(k)?.meta.title || PANELS[k]?.title || k).toUpperCase())}</div>`).join('');
    [...this.sTabs.children].forEach((n) => n.addEventListener('click', () => this.openPanel(n.dataset.k)));
    this.sWallet.innerHTML = `<span style="color:#7f95aa;letter-spacing:.3em;font-size:10px">CRÉDITOS</span><b class="num">${this.hud.credits().toLocaleString('pt-BR')}</b><span style="color:var(--gold)">¢</span>`;
    try { this.panelInst?.dispose?.(); } catch { /* */ }
    this.panelInst = null;
    this.sContent.innerHTML = '';
    const api = { hud: this.hud, data: this.panelData, close: () => this.back(), notify: (t, k) => this.hud.notify(t, k), list: (...a) => listView(...a), refresh: () => this.renderShell() };
    try {
      const fn = reg?.fn || DEFAULTS[name];
      this.panelInst = fn ? (fn(this.sContent, api) || null) : null;
      if (!fn) this.sContent.innerHTML = emptyState('workshop', 'Indisponível neste momento');
    } catch (e) {
      this.ctx.errors.push('hud panel ' + name + ': ' + (e.stack || e));
      this.sContent.innerHTML = emptyState('warn', 'Falha ao abrir o painel');
    }
    const dev = this.ctx.input.device;
    const K = (a, b) => `<span><span class="k2">${dev === 'gamepad' ? b : a}</span>`;
    this.sFoot.innerHTML = `${K('⇅', '✥')}Selecionar</span>${K('ENTER', 'A')}Confirmar</span>${K('Q / E', 'LB / RB')}Abas</span>${K('ESC', 'B')}Voltar</span>`;
  }
  docked() { return !!this.ctx.player.ship?.docked; }

  // ═════════════════════════════════════════════════════════════════════
  show() {
    const top = this.top;
    this.pauseEl.classList.toggle('on', top === 'pause');
    this.cfgEl.classList.toggle('on', top === 'settings');
    this.shellEl.classList.toggle('on', !!top?.startsWith?.('panel:'));
    this.hud.onModal(this.open);
  }
  back() {
    const t = this.stack.pop();
    if (t?.startsWith?.('panel:')) { try { this.panelInst?.dispose?.(); } catch { /* */ } this.panelInst = null; }
    if (this.top === 'pause') this.renderPause();
    this.show();
  }
  closeAll() { while (this.stack.length) this.back(); }
  markSel(parent, sel, idx = this.sel) { [...parent.querySelectorAll(sel)].forEach((n, i) => n.classList.toggle('sel', i === idx)); }

  /** Navegação unificada: dir −1/+1 (vertical), side −1/+1 (horizontal), tab −1/+1. */
  nav({ dir = 0, side = 0, tab = 0, confirm = false, back = false } = {}) {
    const top = this.top;
    if (!top) return false;
    if (back) { this.back(); return true; }
    if (top === 'pause') {
      const n = this.pauseItems().length;
      if (dir) { this.sel = (this.sel + dir + n) % n; this.markSel(this.pItems, '.mi'); }
      if (confirm) this.activatePause();
      return true;
    }
    if (top === 'settings') {
      const tabs = this.cfgTabs();
      if (tab) { this.cfgTab = (this.cfgTab + tab + tabs.length) % tabs.length; this.cfgSel = 0; this.renderSettings(); return true; }
      const rows = tabs[this.cfgTab].rows;
      if (dir && rows.length) { this.cfgSel = (this.cfgSel + dir + rows.length) % rows.length; this.markSel(this.cBody, '.opt2', this.cfgSel); }
      if (side) this.adjust(rows[this.cfgSel], side);
      if (confirm && rows[this.cfgSel]) this.adjust(rows[this.cfgSel], 1);
      return true;
    }
    if (top.startsWith('panel:')) {
      if (tab) { const t = this.shellTabs || []; const i = t.indexOf(this.panelName); this.openPanel(t[(i + tab + t.length) % t.length]); return true; }
      const inst = this.panelInst;
      if (inst?.nav) inst.nav({ dir, side, confirm });
      return true;
    }
    return false;
  }
  onKey(code) {
    if (!this.top) return false;
    const m = { ArrowUp: { dir: -1 }, KeyW: { dir: -1 }, ArrowDown: { dir: 1 }, KeyS: { dir: 1 }, ArrowLeft: { side: -1 }, KeyA: { side: -1 }, ArrowRight: { side: 1 }, KeyD: { side: 1 }, Enter: { confirm: true }, Space: { confirm: true }, Escape: { back: true }, Backspace: { back: true }, KeyQ: { tab: -1 }, KeyE: { tab: 1 } }[code];
    if (!m) {
      if (this.top === 'pause' && code === 'KeyP') { this.closeAll(); return true; }
      return false;
    }
    return this.nav(m);
  }
  frame(dt) { try { this.panelInst?.update?.(dt); } catch { /* */ } }
}

// ─── visões padrão dos painéis ──────────────────────────────────────────────
function emptyState(icon, text, sub = '') {
  return `<div class="empty">${ICONS[icon] || ICONS.info}<div>${esc(text)}</div>${sub ? `<div style="letter-spacing:.12em;text-transform:none;font-size:12px;color:#5f768c">${esc(sub)}</div>` : ''}</div>`;
}

/**
 * Lista + detalhe reutilizável. items: [{id, name, sub, qty, icon, color, tag, detail(): html, actions:[{label, run, ghost}]}]
 */
export function listView(root, items, { empty = 'Nada aqui', emptyIcon = 'inv', emptySub = '' } = {}) {
  root.innerHTML = '';
  if (!items.length) { root.innerHTML = emptyState(emptyIcon, empty, emptySub); return { nav() {} }; }
  const list = el('div', 'list'), det = el('div', 'detail glass');
  root.append(list, det);
  let sel = 0, act = 0;
  const draw = () => {
    list.innerHTML = items.map((it, i) => `<div class="item${i === sel ? ' sel' : ''}" data-i="${i}" style="--ic:${it.color || 'var(--c)'}"><div class="ic">${ICONS[it.icon] || ICONS.info}</div><div class="nm">${esc(it.name)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>${it.tag ? `<div class="tag" style="color:${it.tagColor || 'var(--gold)'}">${esc(it.tag)}</div>` : ''}${it.qty !== undefined ? `<div class="q num">${esc(it.qty)}</div>` : ''}</div>`).join('');
    [...list.children].forEach((n, i) => n.addEventListener('click', () => { sel = i; act = 0; draw(); }));
    const it = items[sel];
    det.innerHTML = `<div class="gh">${esc(it.kicker || 'DETALHES')}<span>${esc(it.right || '')}</span></div><div class="gb dt">${it.detail ? it.detail() : `<h3>${esc(it.name)}</h3><p>${rich(it.text || '')}</p>`}<div class="acts">${(it.actions || []).map((a, k) => `<div class="btn${a.ghost ? ' ghost' : ''}${k === act ? ' sel' : ''}" data-k="${k}">${esc(a.label)}</div>`).join('')}</div></div>`;
    det.querySelectorAll('.btn').forEach((b) => b.addEventListener('click', () => { const a = it.actions[Number(b.dataset.k)]; a?.run?.(); }));
    if (it.icon) {
      const col = /^#/.test(it.holoColor || '') ? it.holoColor : '#a6ecff';
      const hv = holo(it.icon, col, 440, 230, (sel + 1) * 17);
      hv.style.margin = '6px auto 4px';
      det.querySelector('.gb').prepend(hv);
    }
  };
  draw();
  return {
    nav({ dir = 0, side = 0, confirm = false }) {
      if (dir) { sel = (sel + dir + items.length) % items.length; act = 0; draw(); list.children[sel]?.scrollIntoView?.({ block: 'nearest' }); }
      const n = items[sel].actions?.length || 0;
      if (side && n) { act = (act + side + n) % n; draw(); }
      if (confirm && n) items[sel].actions[act]?.run?.();
    },
    redraw: draw,
  };
}

const DEFAULTS = {
  missions(root, api) {
    const ctx = api.hud.ctx;
    const M = ctx.services.missions;
    let active = [];
    try { active = M?.active?.() || []; } catch { active = []; }
    const st = ctx.player.ship?.station;
    let offers = [];
    try { if (st && M?.board) offers = M.board(st.id || st) || []; } catch { offers = []; }
    const F = ctx.universe.FACTIONS;
    const items = [
      ...active.map((m) => ({
        id: m.id, name: m.title, sub: m.procedural ? (m.type || 'Contrato') : 'Campanha', icon: 'mission', color: m.procedural ? 'var(--c)' : 'var(--gold)', tag: m.procedural ? 'ATIVA' : 'HISTÓRIA',
        kicker: m.procedural ? 'CONTRATO ATIVO' : 'CAMPANHA', right: F[m.faction]?.name || '',
        detail: () => `<div class="kk">${esc(m.giver || F[m.faction]?.name || '')}</div><h3>${esc(m.title)}</h3><p>${rich(m.objective || '')}</p>${m.reward?.credits ? `<div class="row" style="max-width:360px"><span>Recompensa</span><b>${m.reward.credits.toLocaleString('pt-BR')} ¢</b></div>` : ''}`,
        actions: [{ label: 'Rastrear', run: () => { M?.track?.(m.id); api.notify(`RASTREANDO — ${m.title.toUpperCase()}`); } }, ...(m.procedural ? [{ label: 'Abandonar', ghost: true, run: () => { M?.abandon?.(m.id); api.refresh(); } }] : [])],
      })),
      ...offers.map((o) => ({
        id: o.id, name: o.title, sub: o.typeLabel || o.type, icon: 'target', color: FACTION_COLORS[o.faction] || 'var(--c)', tag: `${'◆'.repeat(Math.max(1, Math.min(5, o.danger || 1)))}`, tagColor: o.danger >= 4 ? 'var(--bad)' : 'var(--gold)',
        kicker: 'QUADRO DE MISSÕES', right: F[o.faction]?.name || '',
        detail: () => `<div class="kk" style="color:${FACTION_COLORS[o.faction] || 'var(--gold)'}">${esc(o.giver || '')}</div><h3>${esc(o.title)}</h3><p>${rich(o.brief || o.text || '')}</p><div class="row" style="max-width:360px"><span>Recompensa</span><b>${(o.reward?.credits || 0).toLocaleString('pt-BR')} ¢</b></div><div class="row" style="max-width:360px"><span>Risco</span><b>${'◆'.repeat(o.danger || 1)}</b></div>`,
        actions: [{ label: 'Aceitar contrato', run: () => { if (M?.accept?.(o)) { api.notify(`CONTRATO ACEITO — ${o.title.toUpperCase()}`, 'reward'); api.refresh(); } } }],
      })),
    ];
    return listView(root, items, { empty: 'Nenhuma missão ativa', emptyIcon: 'mission', emptySub: 'Visite o quadro de missões de uma estação' });
  },
  inventory(root, api) {
    const ctx = api.hud.ctx;
    const eco = ctx.services.economy;
    let inv = [];
    try { inv = eco?.inventory?.() || eco?.items?.() || []; } catch { inv = []; }
    if (!Array.isArray(inv)) inv = Object.entries(inv).map(([id, q]) => ({ id, name: id, qty: q }));
    const items = inv.map((it) => ({ id: it.id, name: it.name || it.id, sub: it.kind || it.category || '', qty: it.qty ?? it.count ?? 1, icon: it.icon || (it.kind === 'ammo' ? 'ammo' : 'ore'), color: it.color, text: it.desc || '', kicker: (it.kind || 'ITEM').toUpperCase(), right: it.value ? `${it.value} ¢/un` : '', actions: it.actions }));
    return listView(root, items, { empty: 'Compartimento de carga vazio', emptyIcon: 'inv', emptySub: 'Minere, colete e negocie para encher o porão' });
  },
  market(root, api) {
    const ctx = api.hud.ctx;
    const eco = ctx.services.economy;
    const st = ctx.player.ship?.station;
    let goods = [];
    try { goods = (st && (eco?.market?.(st.id || st) || eco?.prices?.(st.id || st))) || []; } catch { goods = []; }
    const items = goods.map((g2) => ({ id: g2.id, name: g2.name || g2.id, sub: g2.trend ? (g2.trend > 0 ? 'Em alta' : 'Em baixa') : '', qty: `${g2.price ?? g2.buy ?? '—'} ¢`, icon: 'market', kicker: 'MERCADORIA', right: `Estoque ${g2.stock ?? '—'}`, text: g2.desc || '', actions: [{ label: 'Comprar', run: () => eco?.buy?.(g2.id, 1, st) }, { label: 'Vender', ghost: true, run: () => eco?.sell?.(g2.id, 1, st) }] }));
    return listView(root, items, { empty: st ? 'Mercado sem ofertas' : 'Atraque numa estação para negociar', emptyIcon: 'market' });
  },
  workshop(root, api) {
    const ctx = api.hud.ctx;
    const f = ctx.services.flight;
    const sh = ctx.player.ship;
    const cls = f?.model?.P?.label || f?.model?.classId || 'Caça leve';
    const slots = [
      { id: 'eng', name: 'Motor principal', sub: 'Classe A · Lança A-7', icon: 'boost', text: 'Propulsor de fusão com pós-combustor. Recarga do boost depende da energia do motor.' },
      { id: 'shd', name: 'Gerador de escudo', sub: 'Quatro quadrantes', icon: 'station', text: 'Escudo em bolha com regeneração proporcional à energia de sistemas.' },
      { id: 'wep', name: 'Canhões laser (2)', sub: 'Montagem fixa', icon: 'fire', text: 'Rajadas de energia. Aquecimento compartilhado com o casco.' },
      { id: 'msl', name: 'Casulos de mísseis', sub: 'IR · radar', icon: 'missile', text: 'Mísseis teleguiados com trava. Contramedidas: flares e chaff.' },
      { id: 'qt', name: 'Motor quântico', sub: '≈ 2.000 km/s', icon: 'quantum', text: 'Viagem entre corpos do sistema. Interdição pode puxar a nave da viagem.' },
      { id: 'jmp', name: 'Motor de salto', sub: `Alcance ${Math.round(f?.jumpRange?.() || 75)} AL`, icon: 'jump', text: 'Salto entre sistemas por rotas estáveis.' },
    ];
    const items = slots.map((s) => ({ ...s, kicker: String(cls).toUpperCase(), right: sh ? `CASCO ${Math.round((sh.hull ?? 1) * 100)}%` : '', actions: [{ label: 'Reparar', run: () => { try { f?.repair?.(); api.notify('NAVE REPARADA', 'reward'); } catch { /* */ } } }] }));
    return listView(root, items, { empty: 'Sem nave', emptyIcon: 'workshop' });
  },
  catalog(root, api) {
    const hud = api.hud;
    const life = hud.ctx.services.life;
    let list = [];
    try { list = life?.catalog?.() || []; } catch { list = []; }
    if (!list.length) list = hud.discoveries || [];
    const items = list.map((d) => ({ id: d.id, name: d.name, sub: `${d.kind === 'fauna' ? 'Fauna' : d.kind === 'flora' ? 'Flora' : d.kind === 'mineral' ? 'Mineral' : 'Ruína'} · ${d.bodyName || d.body || ''}`, icon: d.kind === 'fauna' ? 'creature' : d.kind === 'flora' ? 'leaf' : d.kind === 'ruin' ? 'ruin' : 'ore', color: d.kind === 'fauna' ? 'var(--ok)' : d.kind === 'ruin' ? '#8cc4ff' : 'var(--c)', holoColor: d.kind === 'fauna' ? '#72f0a8' : d.kind === 'ruin' ? '#8cc4ff' : d.kind === 'flora' ? '#b8f07a' : '#a6ecff', tag: d.sold ? 'VENDIDO' : 'NOVO', kicker: 'REGISTRO DE DESCOBERTA', right: d.date || '', text: d.desc || 'Espécime registrado pelo scanner do traje.' }));
    return listView(root, items, { empty: 'Nenhuma descoberta registrada', emptyIcon: 'scan', emptySub: 'Use o scanner (Z) em criaturas, plantas e ruínas' });
  },
};
void hexA; void ic;
