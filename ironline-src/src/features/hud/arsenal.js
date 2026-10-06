/**
 * ARSENAL — telas do inventário (dados/regras em `services.inventory`):
 *
 *   INVENTÁRIO  grade com filtros (tipo/raridade/arma), busca, ordenação,
 *               selos de item novo e equipado; inspeção 3D (arrastar gira,
 *               roda dá zoom) com desgaste, semente e equipar/sucatear
 *   CAIXAS      3 caixas temáticas com arte, tabela de chances publicada e
 *               conteúdo; abertura em roleta horizontal com desaceleração,
 *               tique a cada item, clarão da raridade e revelação 3D
 *   CONTRATO    troca 10 itens de uma raridade por 1 da seguinte
 *   PASSE       passe de campanha — SÓ trilha gratuita (XP de partida)
 *   DIÁRIO      calendário de 7 dias com sequência (hora local)
 *   MAESTRIA    abates por arma liberam camuflagens de maestria
 *   COLEÇÃO     álbum por caixa com % de conclusão
 *   PERFIL      cartão de chamada e emblema do jogador
 *
 * Política: caixas só abrem com chaves/créditos ganhos jogando; nenhuma
 * compra com dinheiro real existe; chances sempre visíveis.
 */
import { svgText } from './font.js';
import { itemThumb, caseArt, creditSVG, keySVG, SIL, silBox } from './itemart.js';
import { ItemViewer, buildItemModel } from './viewer.js';
import { callingCard, emblemSVG } from './art.js';

const T = (s, o) => svgText(s, o);
const t11 = (s, o = {}) => T(s, { size: 12, weight: 1.4, tracking: 2.3, ...o });
const N = (s, size = 20, o = {}) => T(String(s), { size, weight: 1.5, heavy: true, ...o });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const mono = (s) => `<span class="mono">${esc(s)}</span>`;
const pct = (p, d = 2) => (p * 100).toFixed(d).replace('.', ',') + '%';
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const checkSVG = (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16"><path d="M2,8.5 L6.2,12.5 L14,3.5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>`;
const lockSVG = (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16"><path d="M4,7 V5 C4,2.5 6,1.5 8,1.5 C10,1.5 12,2.5 12,5 V7" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="2.5" y="7" width="11" height="8" rx="1" fill="currentColor"/></svg>`;
const silSVG = (key, w, color, maxH = Infinity) => {
  const b = silBox(key in SIL ? key : 'kr9');
  w = Math.min(w, (maxH * b.w) / b.h);
  return `<svg width="${w}" height="${((w * b.h) / b.w).toFixed(1)}" viewBox="${b.x0} ${b.y0} ${b.w} ${b.h}"><path d="${SIL[key in SIL ? key : 'kr9']}" fill="${color}" fill-rule="evenodd"/></svg>`;
};

export const TABS = [
  ['inventario', 'INVENTÁRIO'], ['caixas', 'CAIXAS'], ['contrato', 'CONTRATO'], ['passe', 'PASSE'],
  ['diario', 'DIÁRIO'], ['maestria', 'MAESTRIA'], ['colecao', 'COLEÇÃO'], ['perfil', 'PERFIL'],
];
const TYPES = [['all', 'TODOS'], ['skin', 'ARMAS'], ['knife', 'FACAS'], ['charm', 'CHAVEIROS'], ['sticker', 'ADESIVOS']];
const SORT_NAMES = [['recent', 'RECENTES'], ['rarity', 'RARIDADE'], ['name', 'NOME'], ['wear', 'DESGASTE']];
const SRC = { case: 'CAIXA', trade: 'CONTRATO', bp: 'PASSE DE CAMPANHA', daily: 'RECOMPENSA DIÁRIA', mastery: 'MAESTRIA', grant: 'RECOMPENSA' };
const CW = 210; // largura de um item na roleta (200 + 10 de vão)
const REEL_W = 1728;

export class Arsenal {
  constructor(hud) {
    this.hud = hud;
    this.ctx = hud.ctx;
    this.tab = 'inventario';
    this.f = { type: 'all', rarity: 'all', base: 'all', q: '', sort: 'recent' };
    this.trade = [];
    this.tradeR = 'comum';
    this.selCase = 'ferro';
    this.op = null;
    this.viewer = null;
    this.toastT = 0;
    this._cards = new Map();
  }
  get inv() { return this.ctx.services.inventory; }
  get C() { return this.inv.catalog; }
  get L() { return this.inv.logic; }

  // ─── casca da tela ───────────────────────────────────────────────────
  html() {
    const S = this.hud.screens;
    if (!this.inv) return `${S.bgMenu()}<div class="shade-full mesh"></div>${S.chrome(100)}${S.topbar('arsenal')}<div class="ars-empty">${T('INVENTÁRIO INDISPONÍVEL', { size: 20 })}</div>`;
    return `${S.bgMenu()}<div class="shade-full mesh ars-bg" style="background-color:rgba(5,7,9,.7)"></div>${S.chrome(100)}${S.topbar('arsenal')}
      <div class="ars sh">
        <div class="ars-nav">${TABS.map(([id, n]) => `<div class="an ${id === this.tab ? 'on' : ''}" data-a="tab" data-v="${id}">${T(n, { size: 13, weight: 1.45, tracking: 2.4 })}${this.badge(id)}</div>`).join('')}</div>
        <div class="ars-body"></div>
      </div>
      <div class="atoast"></div>
      ${S.footer([['ESC', 'VOLTAR'], ['< >', 'ABA'], ['I', 'INSPECIONAR']])}`;
  }
  badge(id) {
    const inv = this.inv;
    if (id === 'inventario') { const n = inv.items.filter((i) => i.new).length; return n ? `<b class="bd">${N(n, 11)}</b>` : ''; }
    if (id === 'diario' && inv.dailyStatus().canClaim) return '<b class="bd dot"></b>';
    if (id === 'passe') { const n = this.L.bpClaimable(inv.state.bp.xp, inv.state.bp.claimed).length; return n ? `<b class="bd">${N(n, 11)}</b>` : ''; }
    return '';
  }

  bind(el) {
    this.el = el;
    this.closeOverlays(false);
    if (!this.inv) return;
    el.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-a]');
      if (!t || !el.contains(t)) return;
      ev.stopPropagation();
      this.act(t.dataset.a, t.dataset.v, t);
    });
    el.addEventListener('input', (ev) => {
      if (ev.target.classList.contains('srch')) {
        this.f.q = ev.target.value;
        this.renderGrid();
      }
    });
    this.render();
  }

  /** Re-render só do corpo (preserva a casca e o foco). */
  render() {
    if (!this.el || !this.inv) return;
    const b = this.el.querySelector('.ars-body');
    if (!b) return;
    this.eq = this.inv.equippedSet();
    b.className = `ars-body t-${this.tab}`;
    b.innerHTML = this['tab_' + this.tab]();
    for (const n of this.el.querySelectorAll('.ars-nav .an')) {
      n.classList.toggle('on', n.dataset.v === this.tab);
      n.innerHTML = `${T(TABS.find((x) => x[0] === n.dataset.v)[1], { size: 13, weight: 1.45, tracking: 2.4 })}${this.badge(n.dataset.v)}`;
    }
    this.refreshWallet();
    if (this.tab === 'inventario') this.renderGrid();
  }
  refreshWallet() {
    const w = this.el?.querySelector('.topbar .wallet');
    if (w) w.outerHTML = this.hud.screens.wallet();
  }
  setTab(id) {
    if (!TABS.some((t) => t[0] === id)) return;
    if (this.tab === 'inventario' && id !== 'inventario') this.inv.markSeen(this._seenNow || []);
    this.tab = id;
    this.render();
  }

  // ─── ações ───────────────────────────────────────────────────────────
  act(a, v, t) {
    const inv = this.inv;
    const n = Number(v);
    switch (a) {
      case 'tab': return this.setTab(v);
      case 'ftype': this.f.type = v; return this.render();
      case 'frar': this.f.rarity = v; return this.render();
      case 'fbase': this.f.base = v; return this.render();
      case 'sort': this.f.sort = v; return this.render();
      case 'item': return this.inspect(n);
      case 'seen': inv.markSeen(); return this.render();
      case 'dups': {
        const ids = inv.duplicateUids();
        if (!ids.length) return this.toast('NENHUMA DUPLICATA');
        if (this.confirm !== 'dups') { this.confirm = 'dups'; t.classList.add('warn'); t.querySelector('.lb').innerHTML = t11('CONFIRMAR SUCATA', { size: 11 }); return; }
        this.confirm = null;
        const cr = inv.scrapDuplicates();
        this.sfx('scrap');
        this.toast(`+${fmt(cr)} CRÉDITOS  ·  ${ids.length} ITENS SUCATEADOS`, 'gold');
        return this.render();
      }
      // inspeção
      case 'close': return this.closeOverlays();
      case 'equip': inv.equipItem(n, t.dataset.b || undefined); this.sfx('claim'); this.toast('EQUIPADO'); return this.refreshOverlay(n);
      case 'unequip': inv.unequip(n); return this.refreshOverlay(n);
      case 'scrap': {
        if (this.confirm !== 'scrap' + n) { this.confirm = 'scrap' + n; t.classList.add('warn'); t.innerHTML = T('CONFIRMAR', { size: 14, weight: 1.55, tracking: 2.4 }); return; }
        this.confirm = null;
        const cr = inv.scrap([n]);
        this.sfx('scrap');
        this.toast(`+${fmt(cr)} CRÉDITOS`, 'gold');
        this.closeOverlays();
        return this.render();
      }
      case 'cbase': this.charmBase = v; return this.refreshOverlay(n || Number(t.dataset.uid));
      // caixas
      case 'case': this.selCase = v; return this.render();
      case 'open': return this.startOpen(v, t.dataset.pay);
      case 'skip': if (this.op?.phase === 'spin') this.op.t = this.op.dur; return;
      case 'again': { const o = this.op; this.closeOverlays(); return this.startOpen(o.case.id, o.pay); }
      case 'keep': this.inv.markSeen([this.op?.item?.uid]); this.closeOverlays(); return this.render();
      case 'revequip': inv.equipItem(this.op.item.uid); this.toast('EQUIPADO'); this.sfx('claim'); this.closeOverlays(); return this.render();
      case 'revscrap': {
        if (this.confirm !== 'rev') { this.confirm = 'rev'; t.classList.add('warn'); t.innerHTML = T('CONFIRMAR', { size: 14, weight: 1.55, tracking: 2.4 }); return; }
        this.confirm = null;
        const cr = inv.scrap([this.op.item.uid]);
        this.sfx('scrap');
        this.toast(`+${fmt(cr)} CRÉDITOS`, 'gold');
        this.closeOverlays();
        return this.render();
      }
      // contrato
      case 'trar': this.tradeR = v; this.trade = []; return this.render();
      case 'tadd': {
        const i = this.trade.indexOf(n);
        if (i >= 0) this.trade.splice(i, 1);
        else if (this.trade.length < this.L.TRADE_N) this.trade.push(n);
        return this.render();
      }
      case 'tclear': this.trade = []; return this.render();
      case 'tfill': {
        const pool = this.tradePool().map((it) => it.uid).filter((u) => !this.trade.includes(u));
        while (this.trade.length < this.L.TRADE_N && pool.length) this.trade.push(pool.shift());
        return this.render();
      }
      case 'tsign': {
        const r = inv.tradeUp(this.trade);
        if (r.error) return this.toast(r.error, 'red');
        this.trade = [];
        this.sfx('claim');
        this.op = { item: r.item, phase: 'flash', hold: 0, trade: true };
        this.showReveal();
        return this.render();
      }
      // passe / diário
      case 'bpall': {
        const got = inv.claimAllBp();
        if (got.length) { this.sfx('claim'); this.toast(`${got.length} RECOMPENSAS RESGATADAS`, 'gold'); }
        return this.render();
      }
      case 'bp': { const r = inv.claimBp(n); if (r) { this.sfx('claim'); this.toast(this.rewardText(r.got), 'gold'); } return this.render(); }
      case 'daily': {
        const r = inv.claimDaily();
        if (r) { this.sfx('claim'); this.toast(`DIA ${r.day + 1}  ·  ${this.rewardText(r.got)}`, 'gold'); }
        return this.render();
      }
      // perfil
      case 'card': if (inv.setCard(v)) this.sfx('tick'); this.hud.screens.refreshTopbar?.(); return this.render();
      case 'emblem': if (inv.setEmblem(v)) this.sfx('tick'); this.hud.screens.refreshTopbar?.(); return this.render();
    }
  }
  rewardText(got = []) {
    return got.map((g) => g.credits ? `+${fmt(g.credits)} CR` : g.keys ? `+${g.keys} ${g.keys > 1 ? 'CHAVES' : 'CHAVE'}` : g.item ? this.inv.itemName(g.item) : g.card ? 'CARTÃO ' + (this.C.CARDS.find((c) => c.id === g.card)?.name || '') : g.emblem ? 'EMBLEMA ' + (this.C.EMBLEMS.find((e) => e.id === g.emblem)?.name || '') : '').filter(Boolean).join('  ·  ') || 'RESGATADO';
  }

  // ─── item (cartão da grade) ──────────────────────────────────────────
  baseLabel(d) {
    if (d.type === 'knife') return 'FACA · ' + this.inv.baseName(d.base);
    if (d.type === 'charm') return 'CHAVEIRO';
    if (d.type === 'sticker') return 'ADESIVO';
    return this.inv.baseName(d.base);
  }
  card(it, { a = 'item', sel = false, cls = '' } = {}) {
    const C = this.C;
    const d = C.DEFS[it.def];
    const r = C.RARITY[d.rarity];
    const w = d.type === 'skin' || d.type === 'knife' ? C.wearTier(it.wear) : null;
    const eq = this.eq?.has(it.uid);
    return `<div class="icd ${cls} ${eq ? 'eq' : ''} ${it.new ? 'nw' : ''} ${sel ? 'sel' : ''} ${d.type === 'knife' ? 'kn' : ''}" data-a="${a}" data-v="${it.uid}" style="--rc:${r.color}">
      <i class="gl"></i><img class="th" src="${itemThumb(d, it)}" alt="">
      <div class="mt"><span class="bn">${t11(this.baseLabel(d), { size: 10, weight: 1.3, tracking: 1.8 })}</span><span class="sn">${T(d.name, { size: 12, weight: 1.55, tracking: 1.6 })}</span></div>
      <div class="ws">${w ? `<span style="color:${w.color}">${mono(w.id)}</span>${mono(it.wear.toFixed(4))}` : mono(r.name)}${it.counter != null ? `<span class="ctr">${mono('REG ' + it.counter)}</span>` : ''}</div>
      <i class="rb"></i>${it.new ? `<span class="nb">${t11('NOVO', { size: 9, weight: 1.5 })}</span>` : ''}${eq ? `<span class="eb">${checkSVG(12)}</span>` : ''}${sel ? `<span class="sb">${checkSVG(16)}</span>` : ''}
    </div>`;
  }
  /** Mini cartão de uma definição (conteúdo das caixas, coleção, resultados). */
  defCard(defId, { owned = true, sub = '', cls = '' } = {}) {
    const d = this.C.DEFS[defId];
    const r = this.C.RARITY[d.rarity];
    return `<div class="dc ${cls} ${owned ? '' : 'miss'} ${d.type === 'knife' ? 'kn' : ''}" style="--rc:${r.color}"><img src="${itemThumb(d, { seed: 0, wear: d.wear?.[0] ?? 0 })}" alt=""><span class="n">${t11(d.type === 'knife' && !cls.includes('xs') ? this.inv.baseName(d.base) + ' ' + d.name : d.name, { size: 10, weight: 1.35, tracking: 1.5 })}</span>${sub ? `<span class="p">${mono(sub)}</span>` : ''}<i class="rb"></i></div>`;
  }

  // ─── INVENTÁRIO ──────────────────────────────────────────────────────
  filtered() {
    const C = this.C, f = this.f, inv = this.inv;
    const q = f.q.trim().toLowerCase();
    let items = inv.items.filter((it) => {
      const d = C.DEFS[it.def];
      if (f.type !== 'all' && d.type !== f.type) return false;
      if (f.rarity !== 'all' && d.rarity !== f.rarity) return false;
      if (f.base !== 'all' && d.base !== f.base) return false;
      if (q) {
        const hay = `${inv.itemName(it)} ${C.RARITY[d.rarity].name} ${d.pattern || ''} ${it.wear != null ? C.wearTier(it.wear).name : ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return items.sort(this.L.SORTS[f.sort] || this.L.SORTS.recent);
  }
  tab_inventario() {
    const C = this.C, f = this.f, inv = this.inv;
    const dups = inv.duplicateUids();
    const dupVal = dups.reduce((a, u) => a + this.L.scrapValue(inv.item(u)), 0);
    const bases = inv.availableBases().concat(Object.keys(C.BASES).filter((b) => !inv.availableBases().includes(b) && inv.items.some((it) => C.DEFS[it.def].base === b)));
    const chip = (a, v, label, on, style = '') => `<div class="chip ${on ? 'on' : ''}" data-a="${a}" data-v="${v}" ${style}>${label}</div>`;
    return `<div class="filt panel">
        <div class="fs"><input class="srch" type="text" placeholder="BUSCAR ITEM, ARMA, RARIDADE…" value="${esc(f.q)}" spellcheck="false"></div>
        <div class="fg"><span class="k">${t11('TIPO', { size: 10 })}</span><div class="chips">${TYPES.map(([v, n]) => chip('ftype', v, t11(n, { size: 10 }), f.type === v)).join('')}</div></div>
        <div class="fg"><span class="k">${t11('RARIDADE', { size: 10 })}</span><div class="chips">${chip('frar', 'all', t11('TODAS', { size: 10 }), f.rarity === 'all')}${C.RARITIES.map((r) => chip('frar', r.id, `<i class="dot" style="background:${r.color}"></i>${t11(r.name, { size: 10 })}`, f.rarity === r.id)).join('')}</div></div>
        <div class="fg"><span class="k">${t11('ARMA', { size: 10 })}</span><div class="chips">${chip('fbase', 'all', t11('TODAS', { size: 10 }), f.base === 'all')}${bases.map((b) => chip('fbase', b, t11(inv.baseName(b), { size: 10 }), f.base === b)).join('')}</div></div>
        <div class="fact">
          <div class="abtn ${dups.length ? '' : 'off'}" data-a="dups"><span class="lb">${t11('SUCATEAR DUPLICATAS', { size: 11 })}</span><span class="r">${mono(dups.length + ' ITENS')}${creditSVG(14)}${N('+' + fmt(dupVal), 12)}</span></div>
          <div class="abtn" data-a="seen"><span class="lb">${t11('MARCAR TODOS COMO VISTOS', { size: 11 })}</span></div>
          <div class="fnote">${mono('SUCATA: RARIDADE × CONDIÇÃO. A CÓPIA EQUIPADA OU MAIS NOVA DE CADA ITEM É MANTIDA.')}</div>
        </div>
      </div>
      <div class="gridw">
        <div class="gh"><div class="cnt"></div><div class="srt">${SORT_NAMES.map(([v, n]) => `<b class="${f.sort === v ? 'on' : ''}" data-a="sort" data-v="${v}">${t11(n, { size: 10 })}</b>`).join('')}</div></div>
        <div class="grid"></div>
      </div>`;
  }
  renderGrid() {
    const g = this.el?.querySelector('.grid');
    if (!g) return;
    const items = this.filtered();
    this._grid = items;
    this._seenNow = items.filter((i) => i.new).map((i) => i.uid);
    g.innerHTML = items.length ? items.map((it) => this.card(it)).join('') : `<div class="empty">${t11('NENHUM ITEM COM ESSES FILTROS', { size: 13 })}</div>`;
    const c = this.el.querySelector('.gh .cnt');
    if (c) c.innerHTML = `${N(items.length, 18)}${t11(' / ' + this.inv.items.length + ' ITENS', { size: 11 })}${this._seenNow.length ? `<span class="nwc">${t11(this._seenNow.length + ' NOVOS', { size: 10 })}</span>` : ''}`;
  }

  // ─── inspeção ────────────────────────────────────────────────────────
  inspect(uid) {
    const it = this.inv.item(uid);
    if (!it) return;
    this.closeOverlays(false);
    if (it.new) { it.new = false; this.inv.save(); }
    const ov = document.createElement('div');
    ov.className = 'insp';
    this.el.appendChild(ov);
    this.ov = ov;
    this.ovUid = uid;
    ov.innerHTML = `<div class="ib"></div><div class="ivh"></div><div class="ivhint">${mono('ARRASTE PARA GIRAR · RODA PARA ZOOM · DUPLO CLIQUE REDEFINE')}</div><div class="ipanel panel"></div>`;
    this.fillInspect(it);
    this.mountViewer(ov.querySelector('.ivh'), it, { w: 1140, h: 760 });
    requestAnimationFrame(() => ov.classList.add('on'));
    if (this.ctx.shot) ov.classList.add('on');
  }
  refreshOverlay(uid) {
    this.eq = this.inv.equippedSet();
    const it = this.inv.item(uid);
    if (this.ov && it) this.fillInspect(it);
    this.renderGrid();
    this.refreshWallet();
  }
  fillInspect(it) {
    const C = this.C, inv = this.inv;
    const d = C.DEFS[it.def];
    const r = C.RARITY[d.rarity];
    const eq = inv.equippedSet().has(it.uid);
    const w = d.type === 'skin' || d.type === 'knife';
    const wt = w ? C.wearTier(it.wear) : null;
    const src = String(it.src || 'grant').split(':');
    const srcName = SRC[src[0]] ? SRC[src[0]] + (src[1] ? ' · ' + (C.caseById(src[1])?.name || '') : '') : 'RECOMPENSA';
    const bases = inv.availableBases();
    const cb = this.charmBase && bases.includes(this.charmBase) ? this.charmBase : bases[0];
    const p = this.ov.querySelector('.ipanel');
    p.style.setProperty('--rc', r.color);
    const wearBar = w ? `<div class="wbar">${C.WEAR_TIERS.map((t) => `<i style="left:${t.min * 100}%;width:${(t.max - t.min) * 100}%;background:${t.color}"></i>`).join('')}<b style="left:${(it.wear * 100).toFixed(2)}%"></b></div>
        <div class="wlab">${C.WEAR_TIERS.map((t) => `<span style="left:${((t.min + t.max) / 2) * 100}%">${mono(t.id)}</span>`).join('')}</div>` : '';
    p.innerHTML = `<div class="rtag">${T(r.name, { size: 13, weight: 1.6, tracking: 3 })}${d.type === 'knife' ? `<span>${t11('ITEM ESPECIAL', { size: 10 })}</span>` : ''}</div>
      <div class="bnm">${t11(this.baseLabel(d), { size: 13 })}</div>
      <div class="snm">${T(d.name, { size: d.name.length > 11 ? 30 : 40, weight: 1.9, tracking: 2.4 })}</div>
      ${w ? `<div class="kv2">
        <div><span class="k">${t11('CONDIÇÃO', { size: 10 })}</span><span style="color:${wt.color}">${T(wt.name, { size: 15, weight: 1.6, tracking: 1.8 })}</span></div>
        <div><span class="k">${t11('VALOR DE DESGASTE', { size: 10 })}</span>${mono(C.formatWear(it.wear))}</div>
        <div><span class="k">${t11('SEMENTE DO PADRÃO', { size: 10 })}</span>${N(it.seed, 18)}</div>
        <div><span class="k">${t11('PADRÃO', { size: 10 })}</span>${mono(String(d.pattern).toUpperCase())}</div>
      </div>${wearBar}` : `<div class="kv2"><div><span class="k">${t11('TIPO', { size: 10 })}</span>${t11(d.type === 'charm' ? 'CHAVEIRO · ' + d.shape : 'ADESIVO · ' + d.glyph, { size: 13 })}</div></div>`}
      <div class="kv2 sm">
        <div><span class="k">${t11('ORIGEM', { size: 10 })}</span>${mono(srcName)}</div>
        <div><span class="k">${t11('SUCATA', { size: 10 })}</span><span class="cr">${creditSVG(14)}${N(fmt(this.L.scrapValue(it)), 14)}</span></div>
        ${it.counter != null ? `<div><span class="k">${t11('REGISTRO DE ABATES', { size: 10 })}</span>${N(it.counter, 16)}</div>` : ''}
        <div><span class="k">${t11('ID', { size: 10 })}</span>${mono('#' + String(it.uid).padStart(5, '0'))}</div>
      </div>
      ${d.type === 'charm' || d.type === 'sticker' ? `<div class="cbases"><span class="k">${t11('APLICAR NA ARMA', { size: 10 })}</span><div class="chips">${bases.map((b) => `<div class="chip ${b === cb ? 'on' : ''}" data-a="cbase" data-v="${b}" data-uid="${it.uid}">${t11(inv.baseName(b), { size: 10 })}</div>`).join('')}</div></div>` : ''}
      <div class="iacts">
        ${eq ? `<div class="btn" data-a="unequip" data-v="${it.uid}">${T('DESEQUIPAR', { size: 15, weight: 1.6, tracking: 2.6 })}<span class="hint eqd">${checkSVG(14)}${t11('EQUIPADO', { size: 10 })}</span></div>`
        : `<div class="btn pri" data-a="equip" data-v="${it.uid}" ${d.type === 'charm' || d.type === 'sticker' ? `data-b="${cb}"` : ''}>${T('EQUIPAR', { size: 18, weight: 2, tracking: 3 })}<span class="chev">${T('>>', { size: 14, weight: 2.2, tracking: 0.8 })}</span></div>`}
        <div class="row2"><div class="btn sm" data-a="scrap" data-v="${it.uid}">${T('SUCATEAR', { size: 14, weight: 1.55, tracking: 2.4 })}</div><div class="btn sm" data-a="close">${T('FECHAR', { size: 14, weight: 1.55, tracking: 2.4 })}</div></div>
      </div>`;
    this.viewer?.setColor(r.color);
  }
  async mountViewer(host, it, { w, h }) {
    this.viewer?.dispose();
    this.viewer = null;
    const C = this.C;
    const d = C.DEFS[it.def];
    try {
      const k = (this.hud.k || 1) * Math.min(this.hud.tier === 'desktop' ? 2 : 1, devicePixelRatio || 1);
      const v = (this.viewer = new ItemViewer(this.ctx.THREE, host, { w, h, k, color: C.RARITY[d.rarity].color }));
      const qa = this.ctx.params.get('ivview');
      if (qa) { const [y, p, dd] = qa.split(',').map(Number); v.view(y, p, dd); }
      const token = (this._vt = (this._vt || 0) + 1);
      const { obj, source } = await buildItemModel(this.ctx, this.inv.previewSpec(it), d, it);
      if (token !== this._vt || this.viewer !== v) return;
      v.setObject(obj);
      host.dataset.src = source;
    } catch (err) {
      console.warn('[hud] visualizador 3D indisponível', err);
      host.innerHTML = `<img class="ivfb" src="${itemThumb(d, it, 640, 352)}" alt="">`;
    }
  }
  closeOverlays(rerender = true) {
    this.viewer?.dispose();
    this.viewer = null;
    this._vt = (this._vt || 0) + 1;
    this.ov?.remove();
    this.ov = null;
    this.opEl?.remove();
    this.opEl = null;
    this.op = null;
    this.confirm = null;
    if (rerender && this.el) this.render();
  }

  // ─── CAIXAS ──────────────────────────────────────────────────────────
  tab_caixas() {
    const C = this.C, L = this.L, inv = this.inv;
    const c = C.caseById(this.selCase) || C.CASES[0];
    const odds = L.oddsTable(c);
    const order = [...C.RARITIES].reverse().map((r) => r.id);
    const items = [...c.skins].sort((a, b) => order.indexOf(C.DEFS[a].rarity) - order.indexOf(C.DEFS[b].rarity));
    return `<div class="cases">${C.CASES.map((x) => {
      const ck = inv.canOpen(x.id, 'key'), cc = inv.canOpen(x.id, 'credits');
      return `<div class="case ${x.id === c.id ? 'on' : ''}" data-a="case" data-v="${x.id}" style="--cc:${x.color}">
        <div class="art" style="background-image:url(${caseArt(x)})"></div>
        <div class="cn">${mono('CAIXA ' + String(x.n).padStart(2, '0'))}${T(x.name, { size: 20, weight: 1.85, tracking: 2.4 })}<span class="tg">${t11(x.tag, { size: 10 })}</span></div>
        <div class="ob">
          <div class="obtn ${ck ? '' : 'off'}" data-a="open" data-v="${x.id}" data-pay="key">${keySVG(16)}${t11('ABRIR · 1 CHAVE', { size: 11 })}</div>
          <div class="obtn ${cc ? '' : 'off'}" data-a="open" data-v="${x.id}" data-pay="credits">${creditSVG(16)}${t11('ABRIR · ' + fmt(x.price) + ' CR', { size: 11 })}</div>
        </div></div>`;
    }).join('')}</div>
      <div class="cdet">
        <div class="odds panel"><div class="ph">${T('CHANCES DE CADA ABERTURA', { size: 13, weight: 1.6, tracking: 2.2 })}<span class="r">${mono(c.name)}</span></div>
          <table><thead><tr><th>${t11('RARIDADE', { size: 9 })}</th><th>${t11('ITENS', { size: 9 })}</th><th>${t11('CHANCE', { size: 9 })}</th><th>${t11('POR ITEM', { size: 9 })}</th></tr></thead><tbody>
          ${odds.map((o) => { const r = C.RARITY[o.rarity]; return `<tr style="--rc:${r.color}"><td><i class="sw"></i>${T(r.name + (o.rarity === 'especial' ? ' · FACA' : ''), { size: 12, weight: 1.55, tracking: 1.8 })}</td><td>${N(o.items, 13)}</td><td class="pc">${N(pct(o.p), 14)}</td><td>${mono(pct(o.p / o.items, 3))}</td></tr>`; }).join('')}
          </tbody></table>
          <div class="pol">${mono('CAIXAS ABREM SÓ COM CHAVES E CRÉDITOS GANHOS JOGANDO. NÃO EXISTE COMPRA COM DINHEIRO REAL. CADA ABERTURA É INDEPENDENTE; O DESGASTE É SORTEADO NA FAIXA DE CADA SKIN.')}</div>
        </div>
        <div class="cont panel"><div class="ph">${T('CONTEÚDO', { size: 13, weight: 1.6, tracking: 2.2 })}<span class="r">${mono(c.skins.length + ' SKINS + ' + c.knives.length + ' FACAS')}</span></div>
          <div class="dgrid">${items.map((id) => this.defCard(id, { sub: pct(c.odds[C.DEFS[id].rarity] / L.oddsTable(c).find((o) => o.rarity === C.DEFS[id].rarity).items, 2) })).join('')}
            <div class="dc kn spec" style="--rc:${C.RARITY.especial.color}"><div class="kst">${c.knives.slice(0, 3).map((k) => `<img src="${itemThumb(C.DEFS[k], { seed: 0, wear: 0 })}" alt="">`).join('')}</div><span class="n">${t11('ITEM ESPECIAL', { size: 10, weight: 1.45 })}</span><span class="p">${mono(pct(c.odds.especial) + ' · ' + c.knives.length + ' FACAS')}</span><i class="rb"></i></div>
          </div>
        </div>
      </div>`;
  }

  /** Abre uma caixa: paga, sorteia (o item já entra no inventário) e roda a roleta. */
  startOpen(cid, pay = 'key', seed) {
    const r = this.inv.open(cid, { pay, seed });
    if (r.error) { this.toast(r.error, 'red'); this.sfx('err'); return false; }
    this.closeOverlays(false);
    const jitter = ((r.seed % 997) / 997 - 0.5) * 150;
    const endX = REEL_W / 2 - (r.winAt * CW + (CW - 10) / 2 + jitter);
    this.op = { ...r, pay, phase: 'spin', t: 0, dur: 6.6, x0: 0, x1: endX, lastIdx: -1 };
    const ov = document.createElement('div');
    ov.className = 'opn';
    ov.style.setProperty('--cc', r.case.color);
    ov.innerHTML = `<div class="ob2"></div>
      <div class="oh">${mono('CAIXA ' + String(r.case.n).padStart(2, '0') + ' · ' + (pay === 'key' ? '1 CHAVE' : fmt(r.case.price) + ' CRÉDITOS'))}${T(r.case.name, { size: 44, weight: 1.95, tracking: 3.4 })}</div>
      <div class="reel" data-a="skip"><div class="strip">${r.strip.map((id, i) => {
        const d = this.C.DEFS[id];
        const rr = this.C.RARITY[d.rarity];
        const mystery = d.type === 'knife' && i !== r.winAt;
        return `<div class="rc ${d.type === 'knife' ? 'kn' : ''}" style="--rc:${rr.color};left:${i * CW}px">${mystery ? '<b class="q">?</b>' : `<img src="${itemThumb(d, { seed: i === r.winAt ? r.item.seed : 0, wear: i === r.winAt ? r.item.wear : d.wear?.[0] ?? 0 })}" alt="">`}<span class="n">${t11(d.type === 'knife' ? 'ITEM ESPECIAL' : d.name, { size: 10, weight: 1.4, tracking: 1.6 })}</span><i class="rb"></i></div>`;
      }).join('')}</div><i class="mk"></i><i class="mk b"></i><div class="fade l"></div><div class="fade r"></div></div>
      <div class="ofoot">${mono('CLIQUE NA ROLETA OU ESPAÇO PARA PULAR · CHANCES PUBLICADAS NA ABA CAIXAS')}</div>`;
    this.el.appendChild(ov);
    this.opEl = ov;
    this.strip = ov.querySelector('.strip');
    this.refreshWallet();
    requestAnimationFrame(() => ov.classList.add('on'));
    if (this.ctx.shot) ov.classList.add('on');
    return true;
  }
  /** Clarão da raridade + painel de revelação com o visualizador 3D. */
  showReveal() {
    const op = this.op;
    const C = this.C;
    const it = op.item;
    const d = C.DEFS[it.def];
    const r = C.RARITY[d.rarity];
    if (!this.opEl) {
      const ov = document.createElement('div');
      ov.className = 'opn on';
      this.el.appendChild(ov);
      this.opEl = ov;
    }
    const ov = this.opEl;
    ov.classList.add('rv');
    ov.style.setProperty('--rc', r.color);
    const wt = d.type === 'skin' || d.type === 'knife' ? C.wearTier(it.wear) : null;
    const pin = this.ctx.shot ? ' pin' : '';
    ov.insertAdjacentHTML('beforeend', `<div class="flash3${pin}"></div><div class="rev${pin}">
      <div class="rvh"></div>
      <div class="rvi panel" style="--rc:${r.color}">
        <div class="rtag">${T(r.name, { size: 14, weight: 1.7, tracking: 3.2 })}${d.type === 'knife' ? `<span>${t11('ITEM ESPECIAL', { size: 10 })}</span>` : ''}${op.trade ? `<span>${t11('CONTRATO DE TROCA', { size: 10 })}</span>` : ''}</div>
        <div class="bnm">${t11(this.baseLabel(d), { size: 14 })}</div>
        <div class="snm">${T(d.name, { size: d.name.length > 11 ? 32 : 44, weight: 2, tracking: 2.4 })}</div>
        ${wt ? `<div class="kv2">
          <div><span class="k">${t11('CONDIÇÃO', { size: 10 })}</span><span style="color:${wt.color}">${T(wt.name, { size: 15, weight: 1.6, tracking: 1.8 })}</span></div>
          <div><span class="k">${t11('VALOR DE DESGASTE', { size: 10 })}</span>${mono(C.formatWear(it.wear))}</div>
          <div><span class="k">${t11('SEMENTE DO PADRÃO', { size: 10 })}</span>${N(it.seed, 18)}</div>
          <div><span class="k">${t11(it.counter != null ? 'REGISTRO DE ABATES' : 'PADRÃO', { size: 10 })}</span>${it.counter != null ? t11('INCLUSO', { size: 12 }) : mono(String(d.pattern).toUpperCase())}</div>
        </div>
        <div class="wbar">${C.WEAR_TIERS.map((t) => `<i style="left:${t.min * 100}%;width:${(t.max - t.min) * 100}%;background:${t.color}"></i>`).join('')}<b style="left:${(it.wear * 100).toFixed(2)}%"></b></div>` : ''}
        <div class="iacts">
          <div class="btn pri" data-a="revequip">${T('EQUIPAR', { size: 18, weight: 2, tracking: 3 })}<span class="chev">${T('>>', { size: 14, weight: 2.2, tracking: 0.8 })}</span></div>
          <div class="row2"><div class="btn sm" data-a="keep">${T('GUARDAR', { size: 14, weight: 1.55, tracking: 2.4 })}</div><div class="btn sm" data-a="revscrap">${T('SUCATEAR', { size: 14, weight: 1.55, tracking: 2.4 })}<span class="hint">${creditSVG(13)}${N('+' + this.L.scrapValue(it), 11)}</span></div></div>
          ${op.case && this.inv.canOpen(op.case.id, op.pay) ? `<div class="btn sm" data-a="again">${T('ABRIR OUTRA', { size: 14, weight: 1.55, tracking: 2.4 })}<span class="hint">${op.pay === 'key' ? keySVG(14) : creditSVG(14)}</span></div>` : ''}
        </div>
      </div></div>`);
    this.mountViewer(ov.querySelector('.rvh'), it, { w: 1060, h: 700 });
    this.sfx('reveal', this.C.RARITY[d.rarity].rank);
    op.phase = 'reveal';
  }

  // ─── CONTRATO ────────────────────────────────────────────────────────
  tradePool() {
    const C = this.C;
    const eq = this.inv.equippedSet();
    return this.inv.items.filter((it) => { const d = C.DEFS[it.def]; return d.type === 'skin' && d.case && d.rarity === this.tradeR && !eq.has(it.uid); })
      .sort(this.L.SORTS.wear);
  }
  tab_contrato() {
    const C = this.C, L = this.L, inv = this.inv;
    this.trade = this.trade.filter((u) => inv.item(u) && C.DEFS[inv.item(u).def].rarity === this.tradeR);
    const sel = this.trade.map((u) => inv.item(u));
    const pool = this.tradePool();
    const err = L.tradeUpError(sel);
    const odds = err ? [] : L.tradeUpOdds(sel);
    const nx = C.nextRarity(this.tradeR);
    const avg = sel.length ? sel.reduce((a, it) => a + it.wear, 0) / sel.length : 0;
    return `<div class="tl">
        <div class="eyebrow">${t11('CONTRATO DE TROCA  ·  10 ITENS > 1 DA RARIDADE SEGUINTE')}</div>
        <div class="tr">${C.RARITIES.slice(0, 4).map((r) => `<div class="chip ${this.tradeR === r.id ? 'on' : ''}" data-a="trar" data-v="${r.id}"><i class="dot" style="background:${r.color}"></i>${t11(r.name, { size: 10 })}<span class="ar">${t11('> ' + C.RARITY[C.nextRarity(r.id)].name, { size: 9 })}</span></div>`).join('')}</div>
        <div class="slots10">${Array.from({ length: L.TRADE_N }, (_, i) => sel[i] ? this.card(sel[i], { a: 'tadd', cls: 'small' }) : `<div class="slot0">${N(i + 1, 16)}</div>`).join('')}</div>
        <div class="tmeta">${N(sel.length + '/' + L.TRADE_N, 20)}${t11('DESGASTE MÉDIO', { size: 10 })}${mono(avg.toFixed(4))}<div class="sp"></div><div class="abtn sm" data-a="tfill">${t11('PREENCHER', { size: 10 })}</div><div class="abtn sm" data-a="tclear">${t11('LIMPAR', { size: 10 })}</div></div>
        <div class="outs panel"><div class="ph">${T('RESULTADOS POSSÍVEIS', { size: 13, weight: 1.6, tracking: 2.2 })}<span class="r" style="color:${C.RARITY[nx].color}">${t11(C.RARITY[nx].name, { size: 11 })}</span></div>
          <div class="ol">${odds.length ? odds.map((o) => this.defCard(o.def, { sub: pct(o.p, 1) })).join('') : `<div class="empty">${t11(err || '', { size: 12 })}</div>`}</div>
          <div class="pol">${mono('A CHANCE DE CADA RESULTADO É PROPORCIONAL AOS ITENS DE CADA CAIXA NO CONTRATO. O DESGASTE DO RESULTADO SEGUE A MÉDIA DOS 10.')}</div></div>
        <div class="btn pri sign ${err ? 'off' : ''}" data-a="tsign">${T('ASSINAR CONTRATO', { size: 20, weight: 2.1, tracking: 3.4 })}<span class="chev">${T('>>', { size: 15, weight: 2.2, tracking: 0.8 })}</span></div>
      </div>
      <div class="trr"><div class="gh"><div class="cnt">${N(pool.length, 18)}${t11(' ELEGÍVEIS · ' + C.RARITY[this.tradeR].name, { size: 11 })}</div>${mono('ITENS EQUIPADOS NÃO ENTRAM')}</div>
        <div class="grid g5">${pool.map((it) => this.card(it, { a: 'tadd', sel: this.trade.includes(it.uid) })).join('') || `<div class="empty">${t11('NENHUM ITEM DESSA RARIDADE', { size: 12 })}</div>`}</div></div>`;
  }

  // ─── PASSE ───────────────────────────────────────────────────────────
  rewardIcon(rw, big = false) {
    const C = this.C;
    const s = big ? 64 : 46;
    if (rw.knife) return silSVG('garra', s * 1.6, C.RARITY.especial.color);
    if (rw.skin) return silSVG('kr9', s * 1.7, C.RARITY[rw.skin].color);
    if (rw.keys) return `<span class="ic2">${keySVG(s * 0.7)}${N('×' + rw.keys, 14)}</span>`;
    if (rw.card) return `<span class="cimg" style="background-image:url(${this.cardUrl(rw.card, 220, 56)})"></span>`;
    if (rw.emblem) { const e = C.EMBLEMS.find((x) => x.id === rw.emblem); return emblemSVG(e.seed, s, e.tone); }
    if (rw.item) return `<span class="ic2">${rw.item === 'charm' ? '<svg width="40" height="40" viewBox="-1.2 -1.6 2.4 3"><circle cx="0" cy="-1.2" r=".18" fill="none" stroke="#cfd6dc" stroke-width=".08"/><path d="M0,-1 L.24,-.33 L.95,-.31 L.39,.13 L.59,.81 L0,.4 L-.59,.81 L-.39,.13 L-.95,-.31 L-.24,-.33 Z" fill="#e2b45a"/></svg>' : '<svg width="40" height="40" viewBox="-1.2 -1.2 2.4 2.4"><rect x="-1.05" y="-1.05" width="2.1" height="2.1" rx=".35" fill="#eef0ec"/><rect x="-.9" y="-.9" width="1.8" height="1.8" rx=".28" fill="#15191d"/><path d="M.15,-.8 L-.45,.12 L-.05,.12 L-.18,.8 L.45,-.16 L.05,-.16 Z" fill="#ffd23a"/></svg>'}</span>`;
    return `<span class="ic2">${creditSVG(s * 0.62)}${N(fmt(rw.credits), 14)}</span>`;
  }
  rewardLabel(rw) {
    const C = this.C;
    if (rw.knife) return 'FACA GARANTIDA';
    if (rw.skin) return 'SKIN ' + C.RARITY[rw.skin].name;
    if (rw.keys) return rw.keys > 1 ? rw.keys + ' CHAVES' : '1 CHAVE';
    if (rw.card) return 'CARTÃO ' + C.CARDS.find((c) => c.id === rw.card).name;
    if (rw.emblem) return 'EMBLEMA ' + C.EMBLEMS.find((c) => c.id === rw.emblem).name;
    if (rw.item) return rw.item === 'charm' ? 'CHAVEIRO' : 'ADESIVO';
    return fmt(rw.credits) + ' CRÉDITOS';
  }
  tab_passe() {
    const C = this.C, L = this.L, inv = this.inv;
    const bp = inv.state.bp;
    const lv = L.bpLevel(bp.xp);
    const claim = L.bpClaimable(bp.xp, bp.claimed);
    return `<div class="bph">
        <div class="bpt">${mono('TEMPORADA 01 · IRON DAWN')}${T('PASSE DE CAMPANHA', { size: 38, weight: 1.95, tracking: 3 })}<span class="free">${t11('TRILHA GRATUITA  ·  SEM TRILHA PAGA — TUDO SE GANHA JOGANDO', { size: 11 })}</span></div>
        <div class="bpl"><span class="k">${t11('NÍVEL', { size: 10 })}</span>${N(lv.tier, 54, { weight: 1.9 })}<span class="of">${N('/' + C.BP_TIERS, 18)}</span></div>
        <div class="bpx"><div class="xpb big"><i style="width:${lv.done ? 100 : ((lv.into / lv.need) * 100).toFixed(1)}%"></i></div>
          <div class="xr">${lv.done ? t11('PASSE COMPLETO', { size: 11 }) : `${N(fmt(lv.into) + ' / ' + fmt(lv.need) + ' XP', 13)}${t11('PRÓXIMO NÍVEL', { size: 10 })}`}<span class="r">${mono('XP DE PARTIDA = XP DO PASSE')}</span></div></div>
        <div class="btn pri bpall ${claim.length ? '' : 'off'}" data-a="bpall">${T(claim.length ? `RESGATAR ${claim.length}` : 'TUDO RESGATADO', { size: 17, weight: 2, tracking: 2.8 })}</div>
      </div>
      <div class="bptrack">${C.BP_REWARDS.map((rw, i) => {
        const t = i + 1;
        const got = bp.claimed.includes(t), ready = !got && lv.tier >= t;
        const st = got ? 'got' : ready ? 'ready' : t === lv.tier + 1 ? 'next' : 'lock';
        const rc = rw.knife ? C.RARITY.especial.color : rw.skin ? C.RARITY[rw.skin].color : rw.keys ? '#cfd6dc' : 'var(--amber)';
        return `<div class="bpt1 ${st} ${rw.knife || rw.skin ? 'big' : ''}" ${ready ? `data-a="bp" data-v="${t}"` : ''} style="--rc:${rc}">
          <div class="tn">${N(t, 14)}</div><div class="rw">${this.rewardIcon(rw)}</div><div class="rl">${t11(this.rewardLabel(rw), { size: 9, weight: 1.35, tracking: 1.4 })}</div>
          ${got ? `<span class="st">${checkSVG(14)}</span>` : ready ? `<span class="st r">${t11('RESGATAR', { size: 9 })}</span>` : st === 'lock' ? `<span class="st l">${lockSVG(12)}</span>` : `<span class="st n">${t11('PRÓXIMO', { size: 9 })}</span>`}
          ${st === 'next' ? `<i class="pg" style="width:${((lv.into / lv.need) * 100).toFixed(0)}%"></i>` : ''}
        </div>`;
      }).join('')}</div>`;
  }

  // ─── DIÁRIO ──────────────────────────────────────────────────────────
  tab_diario() {
    const C = this.C, inv = this.inv;
    const s = inv.dailyStatus();
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const left = Math.max(0, mid - now);
    const hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
    const cur = s.day;
    return `<div class="dh">
        <div>${mono('RECOMPENSA DIÁRIA · HORA LOCAL')}${T('ENTRE TODO DIA', { size: 38, weight: 1.95, tracking: 3 })}<div class="dsub">${mono('A SEQUÊNCIA AVANÇA UM DIA POR RESGATE E ZERA SE VOCÊ PULAR UM DIA. CICLO DE 7 DIAS.')}</div></div>
        <div class="dst"><span class="k">${t11('SEQUÊNCIA', { size: 10 })}</span>${N(s.canClaim ? s.streak - 1 : s.streak, 54, { weight: 1.9 })}<span class="of">${t11('DIAS', { size: 11 })}</span></div>
        <div class="dnx"><span class="k">${t11('PRÓXIMO RESGATE', { size: 10 })}</span>${s.canClaim ? T('DISPONÍVEL', { size: 18, weight: 1.8, tracking: 2.4, cls: 'amb' }) : N(`${hh}H ${String(mm).padStart(2, '0')}M`, 22)}</div>
      </div>
      <div class="days">${C.DAILY.map((rw, i) => {
        const done = s.canClaim ? i < cur : i <= cur;
        const today = i === cur;
        const st = done ? 'got' : today && s.canClaim ? 'ready' : 'lock';
        const parts = [rw.credits && `${fmt(rw.credits)} CRÉDITOS`, rw.keys && (rw.keys > 1 ? rw.keys + ' CHAVES' : '1 CHAVE'), rw.item && (rw.item === 'charm' ? 'CHAVEIRO' : 'ADESIVO')].filter(Boolean);
        return `<div class="day ${st} ${today ? 'today' : ''} ${i === 6 ? 'd7' : ''}" ${st === 'ready' ? 'data-a="daily"' : ''}>
          <div class="dn">${t11('DIA', { size: 10 })}${N(i + 1, 30)}</div>
          <div class="dr">${rw.keys ? `<span class="ic2">${keySVG(44)}${N('×' + rw.keys, 16)}</span>` : ''}${rw.credits ? `<span class="ic2">${creditSVG(rw.keys ? 30 : 44)}${N(fmt(rw.credits), rw.keys ? 13 : 18)}</span>` : ''}${rw.item ? this.rewardIcon({ item: rw.item }) : ''}</div>
          <div class="dl">${t11(parts.join(' + '), { size: 9, weight: 1.35, tracking: 1.4 })}</div>
          ${st === 'got' ? `<span class="st">${checkSVG(16)}${t11('RESGATADO', { size: 9 })}</span>` : st === 'ready' ? `<span class="st r">${t11('RESGATAR', { size: 11 })}</span>` : today ? `<span class="st">${t11('AMANHÃ', { size: 9 })}</span>` : ''}
        </div>`;
      }).join('')}</div>
      ${s.broken ? `<div class="dbrk">${mono('SUA SEQUÊNCIA ANTERIOR FOI INTERROMPIDA — RECOMEÇA NO DIA 1.')}</div>` : ''}`;
  }

  // ─── MAESTRIA ────────────────────────────────────────────────────────
  tab_maestria() {
    const C = this.C, L = this.L, inv = this.inv;
    const K = inv.state.mastery.kills;
    const bases = Object.keys(C.BASES);
    return `<div class="mh">${mono('MAESTRIA DE ARMA')}${T('ABATES LIBERAM CAMUFLAGENS', { size: 30, weight: 1.9, tracking: 2.6 })}<span>${mono('CADA ABATE COM A ARMA CONTA. A CAMUFLAGEM ENTRA NO INVENTÁRIO AO ATINGIR A META.')}</span></div>
      <div class="mrows">${bases.map((b) => {
        const k = K[b] || 0;
        const pr = L.masteryProgress(k);
        const live = inv.availableBases().includes(b);
        return `<div class="mrow ${live ? '' : 'na'}">
          <div class="mw">${silSVG(b, 150, 'rgba(242,244,239,.85)', 50)}</div>
          <div class="mn">${T(inv.baseName(b), { size: 20, weight: 1.8, tracking: 2.4 })}${live ? '' : mono('EM BREVE')}</div>
          <div class="mk2"><span class="k">${t11('ABATES', { size: 9 })}</span>${N(k, 22)}</div>
          <div class="mp"><div class="xpb"><i style="width:${pr.next ? ((pr.into / pr.need) * 100).toFixed(1) : 100}%"></i></div>${mono(pr.next ? `${k} / ${pr.next.kills} → ${pr.next.name}` : 'MAESTRIA COMPLETA')}</div>
          <div class="mt2">${C.MASTERY_TIERS.map((t) => {
            const d = C.masteryDef(b, t.id);
            const ok = k >= t.kills;
            return `<div class="mtier ${ok ? 'ok' : ''}" style="--rc:${C.RARITY[t.rarity].color}"><img src="${itemThumb(d, { seed: 0, wear: 0 }, 150, 70)}" alt=""><span>${t11(t.name, { size: 9 })}</span>${ok ? `<b>${checkSVG(11)}</b>` : `<b class="l">${N(t.kills, 10)}</b>`}</div>`;
          }).join('')}</div>
        </div>`;
      }).join('')}</div>`;
  }

  // ─── COLEÇÃO ─────────────────────────────────────────────────────────
  tab_colecao() {
    const C = this.C, L = this.L, inv = this.inv;
    const col = L.collection(inv.items);
    const have = new Set(inv.items.map((i) => i.def));
    const ring = (p, s = 120) => { const r = s / 2 - 8, c = 2 * Math.PI * r; return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="var(--amber)" stroke-width="8" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${s / 2} ${s / 2})"/></svg>`; };
    return `<div class="colh"><div class="ring">${ring(col.pct)}<span>${N(Math.round(col.pct * 100) + '%', 22)}</span></div>
        <div>${mono('ÁLBUM DE COLEÇÃO')}${T('COLEÇÃO', { size: 38, weight: 1.95, tracking: 3 })}<div class="dsub">${mono(`${col.owned} DE ${col.total} ITENS DE CAIXA · CONTRATOS E CAIXAS CONTAM`)}</div></div></div>
      <div class="albums">${C.CASES.map((c, i) => {
        const p = col.per[i];
        const ids = [...c.skins].sort((a, b) => C.rarityRank(C.DEFS[b].rarity) - C.rarityRank(C.DEFS[a].rarity)).concat(c.knives);
        return `<div class="album panel" style="--cc:${c.color}"><div class="ah"><div class="aart" style="background-image:url(${caseArt(c, 200, 130)})"></div><div>${T(c.name, { size: 17, weight: 1.8, tracking: 2.2 })}<div class="xpb"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>${mono(`${p.owned}/${p.total} · ${Math.round(p.pct * 100)}%`)}</div></div>
          <div class="ag">${ids.map((id) => this.defCard(id, { owned: have.has(id), cls: 'xs' })).join('')}</div></div>`;
      }).join('')}</div>`;
  }

  // ─── PERFIL (cartão de chamada e emblema) ────────────────────────────
  cardUrl(id, w = 400, h = 100) {
    const k = id + w + 'x' + h;
    if (this._cards.has(k)) return this._cards.get(k);
    const c = this.C.CARDS.find((x) => x.id === id) || this.C.CARDS[0];
    const url = callingCard('', { seed: c.seed, theme: c.theme, w, h, sub: '' });
    this._cards.set(k, url);
    return url;
  }
  /** Lugar do item no passe que libera um cartão/emblema (para o cadeado). */
  bpTierOf(kind, id) {
    const i = this.C.BP_REWARDS.findIndex((r) => r[kind] === id);
    return i >= 0 ? i + 1 : null;
  }
  tab_perfil() {
    const C = this.C, inv = this.inv, E = inv.state.equip, P = this.hud.profile;
    const em = C.EMBLEMS.find((e) => e.id === E.emblem) || C.EMBLEMS[0];
    return `<div class="pfh">
        <div class="pcard big"><div class="cc" style="background-image:url(${this.cardUrl(E.card, 760, 190)})"></div><div class="pi">${emblemSVG(em.seed, 96, em.tone)}<div>${T(P.callsign, { size: 34, weight: 1.9, tracking: 3 })}${mono(`[${P.tag}] · ${(C.CARDS.find((c) => c.id === E.card) || C.CARDS[0]).name} · ${em.name}`)}</div></div></div>
        <div class="pft">${mono('IDENTIDADE DO OPERADOR')}${T('CARTÃO E EMBLEMA', { size: 30, weight: 1.9, tracking: 2.6 })}<div class="dsub">${mono('APARECEM NO MENU, NO PLACAR E NO RELATÓRIO DE FIM DE PARTIDA. NOVOS CARTÕES E EMBLEMAS VÊM DO PASSE.')}</div></div>
      </div>
      <div class="pfg">
        <div class="panel"><div class="ph">${T('CARTÕES DE CHAMADA', { size: 13, weight: 1.6, tracking: 2.2 })}<span class="r">${mono(inv.state.cards.length + ' / ' + C.CARDS.length)}</span></div>
          <div class="cards">${C.CARDS.map((c) => { const own = inv.state.cards.includes(c.id); const t = this.bpTierOf('card', c.id); return `<div class="ccard ${own ? '' : 'lock'} ${E.card === c.id ? 'on' : ''}" ${own ? `data-a="card" data-v="${c.id}"` : ''}><i style="background-image:url(${this.cardUrl(c.id, 300, 75)})"></i><span>${t11(c.name, { size: 9 })}</span>${own ? '' : `<b>${lockSVG(11)}${t11(t ? 'PASSE ' + t : 'EVENTO', { size: 9 })}</b>`}</div>`; }).join('')}</div></div>
        <div class="panel"><div class="ph">${T('EMBLEMAS', { size: 13, weight: 1.6, tracking: 2.2 })}<span class="r">${mono(inv.state.emblems.length + ' / ' + C.EMBLEMS.length)}</span></div>
          <div class="embs">${C.EMBLEMS.map((e) => { const own = inv.state.emblems.includes(e.id); const t = this.bpTierOf('emblem', e.id); return `<div class="emb ${own ? '' : 'lock'} ${E.emblem === e.id ? 'on' : ''}" ${own ? `data-a="emblem" data-v="${e.id}"` : ''}>${emblemSVG(e.seed, 64, e.tone)}<span>${t11(e.name, { size: 9 })}</span>${own ? '' : `<b>${lockSVG(11)}${t11(t ? 'PASSE ' + t : 'EVENTO', { size: 9 })}</b>`}</div>`; }).join('')}</div></div>
      </div>`;
  }

  // ─── loop / teclado / som ────────────────────────────────────────────
  frame(rdt) {
    const op = this.op;
    if (op && op.phase === 'spin' && this.strip) {
      const pin = Number(this.ctx.params.get('reelt'));
      if (this.ctx.shot && pin > 0) op.t = Math.min(op.dur, pin);
      else op.t += rdt;
      const p = this.L.reelEase(op.t / op.dur);
      const x = op.x0 + (op.x1 - op.x0) * p;
      this.strip.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      const idx = Math.floor((REEL_W / 2 - x) / CW);
      if (idx !== op.lastIdx) {
        if (op.lastIdx >= 0) this.sfx('tick', 1 - p);
        op.lastIdx = idx;
      }
      if (op.t >= op.dur && !(this.ctx.shot && pin > 0)) { op.phase = 'stop'; op.hold = 0; this.opEl?.classList.add('stopped'); }
    } else if (op && op.phase === 'stop') {
      op.hold += rdt;
      if (op.hold > 0.55) this.showReveal();
    }
    if (this.viewer) this.viewer.render(rdt);
    if (this.toastT > 0) {
      this.toastT -= rdt;
      if (this.toastT <= 0) this.el?.querySelector('.atoast')?.classList.remove('on');
    }
  }
  key(code) {
    if (!this.inv) return false;
    if (code === 'Escape' || code === 'Backspace') {
      if (this.op?.phase === 'spin') { this.op.t = this.op.dur; return true; }
      if (this.ov || this.opEl) { this.closeOverlays(); return true; }
      return false;
    }
    if (code === 'Space' || code === 'Enter') {
      if (this.op?.phase === 'spin') this.op.t = this.op.dur;
      return true;
    }
    if (this.ov || this.opEl) return true;
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyQ' || code === 'KeyE') {
      const i = TABS.findIndex((t) => t[0] === this.tab);
      const d = code === 'ArrowRight' || code === 'KeyE' ? 1 : -1;
      this.setTab(TABS[(i + d + TABS.length) % TABS.length][0]);
      return true;
    }
    if (code === 'KeyI' && this.tab === 'inventario' && this._grid?.length) { this.inspect(this._grid[0].uid); return true; }
    return code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyW' || code === 'KeyS';
  }
  toast(msg, kind = '') {
    const t = this.el?.querySelector('.atoast');
    if (!t) return;
    t.className = 'atoast ' + kind;
    t.innerHTML = T(msg, { size: 14, weight: 1.6, tracking: 2.2 });
    void t.offsetWidth;
    t.classList.add('on');
    this.toastT = 2.6;
  }
  /** Sons de interface: `services.audio.context` (ou WebAudio próprio). Mudo no modo shot. */
  sfx(kind, k = 0) {
    if (this.ctx.shot) return;
    try {
      const ac = this.ctx.services.audio?.context || (this._ac ||= new (window.AudioContext || window.webkitAudioContext)());
      if (ac.state === 'suspended') ac.resume();
      const vol = (this.hud.settings?.volume ?? 0.8) * 0.5;
      const t0 = ac.currentTime;
      const tone = (f, dur, type = 'square', g = 0.2, at = 0, f2) => {
        const o = ac.createOscillator(), gn = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t0 + at);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
        gn.gain.setValueAtTime(0.0001, t0 + at);
        gn.gain.exponentialRampToValueAtTime(g * vol, t0 + at + 0.004);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(gn).connect(ac.destination);
        o.start(t0 + at);
        o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'tick') tone(1500 + 900 * k, 0.035, 'square', 0.12 + 0.1 * k, 0, 700);
      else if (kind === 'reveal') {
        const base = [262, 294, 330, 392, 440, 523][Math.min(5, k)];
        [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.5 + k * 0.12, 'triangle', 0.22, i * 0.07));
        if (k >= 4) [2.5, 3, 4].forEach((m, i) => tone(base * m, 0.9, 'sine', 0.12, 0.3 + i * 0.09));
      } else if (kind === 'claim') { tone(660, 0.12, 'triangle', 0.25); tone(990, 0.2, 'triangle', 0.22, 0.08); }
      else if (kind === 'scrap') tone(220, 0.25, 'sawtooth', 0.18, 0, 60);
      else if (kind === 'err') tone(180, 0.18, 'square', 0.15);
    } catch {}
  }
  dispose() {
    this.closeOverlays(false);
    this.el = null;
  }

  /** QA por URL: `?inv=open`, `&arsenal=<aba>`, `&inspect=N`, `?case=1&seed=N[&reelt=s][&reveal=1]`, `&trade=1`. */
  qa(P) {
    const inv = this.inv;
    if (!inv) return;
    const tab = P.get('arsenal');
    if (tab) this.setTab(tab);
    if (P.get('trade') === '1') { this.tab = 'contrato'; this.act('tfill'); }
    if (P.has('inspect')) {
      this.setTab('inventario');
      const n = Number(P.get('inspect')) || 0;
      const it = this._grid?.[n] || inv.items.find((x) => x.uid === n);
      if (it) this.inspect(it.uid);
    }
    if (P.has('case')) {
      this.tab = 'caixas';
      this.selCase = inv.catalog.caseById(P.get('case'))?.id || 'ferro';
      this.render();
      const seed = P.has('seed') ? Number(P.get('seed')) >>> 0 : undefined;
      const pay = inv.canOpen(this.selCase, 'key') ? 'key' : 'credits';
      if (this.startOpen(this.selCase, pay, seed) && P.get('reveal') === '1') { this.op.phase = 'stop'; this.op.hold = 1; this.strip.style.transform = `translate3d(${this.op.x1}px,0,0)`; }
    }
  }
}
