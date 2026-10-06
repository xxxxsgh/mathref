/**
 * Feature `inventory` — catálogo, créditos, caixas, inventário, equipamento,
 * contrato de troca, sucata, diário, passe de campanha, maestria e coleção.
 *
 * Só dados e regras: as telas ficam na feature hud (que lê este serviço).
 * A renderização de skins/facas/chaveiros/adesivos é da feature weapon,
 * chamada por `services.weapon.setSkin/setKnife/setCharm/setStickers/
 * setKillCounter/setPrimary/setSecondary` (todas opcionais — `?.`).
 *
 * Política: caixas abrem SÓ com chaves ou créditos ganhos jogando; não
 * existe nenhuma compra com dinheiro real. As chances ficam publicadas
 * (`oddsTable`) e a hud mostra a tabela em cada caixa.
 *
 * URL (QA): `?credits=N`, `?keys=N`, `?invdemo=1` (inventário de
 * demonstração; padrão no modo shot), `?invapply=1` (no modo shot, aplica o
 * equipamento na arma — desligado por padrão para não alterar as capturas
 * das outras features).
 */
import * as C from './catalog.js';
import * as L from './logic.js';
import * as Store from './store.js';

const { DEFS, BASES, BASE_IDS, KNIFE_IDS, CASES } = C;

export default {
  name: 'inventory',
  order: 45,

  init(ctx) {
    this.ctx = ctx;
    const P = ctx.params;
    this.persist = !ctx.shot && P.get('invdemo') !== '1';
    this.state = this.persist ? Store.load() : demoState();
    if (P.has('credits')) this.state.credits = Math.max(0, Math.floor(Number(P.get('credits')) || 0));
    if (P.has('keys')) this.state.keys = Math.max(0, Math.floor(Number(P.get('keys')) || 0));
    this.applyOn = !ctx.shot || P.get('invapply') === '1';
    this.lastAward = null;
    // weapon v3 (setSkin publicado) emite 'weapon:kill': a reserva por 'enemy:death' fica desligada
    this.sawWeaponKill = !!ctx.services.weapon?.setSkin;
    this._applied = { skins: new Set(), charms: new Set(), stickers: new Set() };
    const self = this;
    const bus = ctx.bus;
    this._offs = [
      bus.on('weapon:kill', (e) => { this.sawWeaponKill = true; this.addKill(this.baseOf(e?.weaponId)); }),
      // reserva enquanto a weapon não emite 'weapon:kill': atribui à arma ativa
      bus.on('enemy:death', (e) => {
        if (this.sawWeaponKill) return;
        const src = e?.info?.source;
        if (src && src !== 'player') return;
        const w = ctx.services.weapon;
        if (!w || ctx.shot) return;
        this.addKill(this.baseOf(w.id));
      }),
      bus.on('match:end', (s) => this.onMatchEnd(s)),
      bus.on('match:start', () => this.apply()),
      bus.on('player:respawn', () => this.apply()),
      bus.on('service:ready', (e) => { if (e?.name === 'weapon') this.apply(); }),
    ];

    ctx.provide('inventory', {
      catalog: C,
      logic: L,
      get state() { return self.state; },
      get credits() { return self.state.credits; },
      get keys() { return self.state.keys; },
      get lastAward() { return self.lastAward; },
      get items() { return self.state.items; },
      get equip() { return self.state.equip; },
      def: (id) => DEFS[id],
      item: (uid) => self.byUid(uid),
      isEquipped: (uid) => self.equippedSet().has(uid),
      equippedSet: () => self.equippedSet(),
      baseName: (b) => self.baseName(b),
      itemName: (it) => self.itemName(it),
      weaponIdFor: (b) => self.weaponIdFor(b),
      knifeIdFor: (m) => self.knifeIdFor(m),
      baseOf: (id) => self.baseOf(id),
      availableBases: () => self.availableBases(),
      skinSpec: (it) => skinSpec(it),
      previewSpec: (it) => self.previewSpec(it),
      // ─ ações ─
      canOpen: (cid, pay) => !!L.openCost(self.state, C.caseById(cid), pay),
      open: (cid, o) => self.open(cid, o),
      equipItem: (uid, base) => self.equipItem(uid, base),
      unequip: (uid) => self.unequip(uid),
      setLoadout: (slot, id) => self.setLoadout(slot, id),
      setCard: (id) => self.setProfileArt('card', id),
      setEmblem: (id) => self.setProfileArt('emblem', id),
      scrap: (uids) => self.scrap(uids),
      scrapDuplicates: () => self.scrap(L.duplicateUids(self.state.items, self.equippedSet())),
      duplicateUids: () => L.duplicateUids(self.state.items, self.equippedSet()),
      tradeUp: (uids, seed) => self.tradeUp(uids, seed),
      dailyStatus: () => L.dailyStatus(self.state.daily, L.dateKey()),
      claimDaily: () => self.claimDaily(),
      claimBp: (t) => self.claimBp(t),
      claimAllBp: () => L.bpClaimable(self.state.bp.xp, self.state.bp.claimed).map((t) => self.claimBp(t)).filter(Boolean),
      markSeen: (uids) => self.markSeen(uids),
      grant: (def, src) => self.grant(def, src),
      addCredits: (n) => { self.state.credits += n; self.commit(); },
      apply: () => self.apply(),
      save: () => self.commit(),
    });
    this.apply();
  },

  // ─── utilidades ──────────────────────────────────────────────────────
  byUid(uid) { return this.state.items.find((it) => it.uid === uid) || null; },
  equippedSet() {
    const E = this.state.equip;
    const s = new Set([...Object.values(E.skins), ...Object.values(E.charms), ...Object.values(E.stickers).flat()]);
    if (E.knife != null) s.add(E.knife);
    return s;
  },
  weapons() { return this.ctx.services.weapon?.weapons || []; },
  weaponIdFor(base) {
    const ws = this.weapons();
    return ws.find((w) => w.id === base)?.id || ws.find((w) => w.kind === BASES[base]?.kind)?.id || base;
  },
  baseOf(weaponId) {
    if (!weaponId) return null;
    if (BASES[weaponId]) return weaponId;
    const w = this.weapons().find((x) => x.id === weaponId);
    const kind = w?.kind || weaponId;
    return BASE_IDS.find((b) => BASES[b].kind === kind) || null;
  },
  knifeIdFor(model) {
    const ks = this.ctx.services.weapon?.knives || [];
    if (!ks.length) return model;
    return ks.find((k) => k.id === model || k.aliases?.includes(model))?.id || ks[Math.max(0, KNIFE_IDS.indexOf(model)) % ks.length].id;
  },
  baseName(base) {
    if (C.KNIFE_MODELS[base]) {
      const ks = this.ctx.services.weapon?.knives || [];
      const kid = this.knifeIdFor(base);
      return ks.find((k) => k.id === kid)?.name || C.KNIFE_MODELS[base].name;
    }
    const ws = this.weapons();
    const w = ws.find((x) => x.id === base) || ws.find((x) => x.kind === BASES[base]?.kind);
    return w?.name || BASES[base]?.name || String(base).toUpperCase();
  },
  itemName(it) {
    const d = DEFS[it?.def];
    if (!d) return '?';
    if (d.type === 'skin' || d.type === 'knife') return `${this.baseName(d.base)} | ${d.name}`;
    return d.name;
  },
  /** Bases que existem em jogo (as 7 do catálogo se a weapon ainda não publicou todas). */
  availableBases() {
    const ws = this.weapons();
    const live = BASE_IDS.filter((b) => ws.some((w) => w.id === b || w.kind === BASES[b].kind));
    return live.length ? live : ['kr9', 'p11'];
  },
  previewSpec(it) {
    const d = DEFS[it?.def];
    if (!d) return null;
    if (d.type === 'knife') return { type: 'knife', baseId: this.knifeIdFor(d.base), model: d.base, skin: skinSpec(it) };
    if (d.type === 'charm') return { type: 'charm', baseId: null, charm: { id: d.id, shape: d.shape, color: d.color } };
    if (d.type === 'sticker') return { type: 'weapon', baseId: this.weaponIdFor('kr9'), base: 'kr9', stickers: [{ id: d.id, glyph: d.glyph, color: d.color }] };
    return { type: 'weapon', baseId: this.weaponIdFor(d.base), base: d.base, skin: skinSpec(it) };
  },

  // ─── persistência / eventos ──────────────────────────────────────────
  commit(evt = 'change') {
    if (this.persist) Store.save(this.state);
    this.ctx.bus.emit('inventory:' + evt, { state: this.state });
  },
  grant(defId, src = 'grant', extra = {}) {
    const rng = L.mulberry32((Date.now() ^ (this.state.nextUid * 2654435761)) >>> 0);
    const it = typeof defId === 'object' ? { ...defId } : L.makeItem(defId, rng, { src });
    it.uid = this.state.nextUid++;
    it.t = Date.now();
    it.new = true;
    Object.assign(it, extra);
    this.state.items.push(it);
    return it;
  },

  // ─── caixas ──────────────────────────────────────────────────────────
  /** Abre uma caixa: { item, strip, winAt, case } ou { error }. O item já entra no inventário. */
  open(cid, { pay = 'key', seed } = {}) {
    const c = C.caseById(cid);
    if (!c) return { error: 'CAIXA DESCONHECIDA' };
    const cost = L.openCost(this.state, c, pay);
    if (!cost) return { error: pay === 'key' ? 'SEM CHAVES' : 'CRÉDITOS INSUFICIENTES' };
    this.state.keys -= cost.keys || 0;
    this.state.credits -= cost.credits || 0;
    const s = (seed ?? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff))) >>> 0;
    const rolled = L.rollCase(c, s);
    const item = this.grant(rolled);
    const winAt = 50;
    const strip = L.reelStrip(c, item.def, s, 60, winAt);
    this.state.stats.opened++;
    this.commit();
    return { item, strip, winAt, case: c, seed: s };
  },

  // ─── equipamento ─────────────────────────────────────────────────────
  equipItem(uid, base) {
    const it = this.byUid(uid);
    const d = DEFS[it?.def];
    if (!d) return false;
    const E = this.state.equip;
    if (d.type === 'skin') E.skins[d.base] = uid;
    else if (d.type === 'knife') E.knife = uid;
    else if (d.type === 'charm') {
      const b = base || E.primary && this.baseOf(E.primary) || 'kr9';
      for (const k of Object.keys(E.charms)) if (E.charms[k] === uid) delete E.charms[k];
      E.charms[b] = uid;
    } else if (d.type === 'sticker') {
      const b = base || E.primary && this.baseOf(E.primary) || 'kr9';
      const list = (E.stickers[b] || []).filter((u) => u !== uid);
      list.push(uid);
      E.stickers[b] = list.slice(-4);
    }
    it.new = false;
    this.commit();
    this.apply();
    return true;
  },
  unequip(uid) {
    const E = this.state.equip;
    for (const k of ['skins', 'charms']) for (const [b, u] of Object.entries(E[k])) if (u === uid) delete E[k][b];
    for (const b of Object.keys(E.stickers)) E.stickers[b] = E.stickers[b].filter((u) => u !== uid);
    if (E.knife === uid) E.knife = null;
    this.commit();
    this.apply();
  },
  /** slot: 'primary' | 'secondary' (id real da weapon). */
  setLoadout(slot, id) {
    this.state.equip[slot] = id;
    this.commit();
    this.apply();
  },
  setProfileArt(kind, id) {
    const owned = kind === 'card' ? this.state.cards : this.state.emblems;
    if (!owned.includes(id)) return false;
    this.state.equip[kind] = id;
    this.commit();
    return true;
  },
  /**
   * Aplica o equipamento na arma (todas as chamadas opcionais). No modo
   * shot só com `?invapply=1` — capturas das outras features ficam iguais.
   */
  apply() {
    const w = this.ctx.services.weapon;
    if (!w || !this.applyOn) return;
    const E = this.state.equip;
    try {
      if (E.primary) w.setPrimary?.(E.primary);
      if (E.secondary) w.setSecondary?.(E.secondary);
      const A = this._applied;
      for (const b of BASE_IDS) {
        const wid = this.weaponIdFor(b);
        const it = this.byUid(E.skins[b]);
        if (it) {
          w.setSkin?.(wid, skinSpec(it));
          w.setKillCounter?.(wid, it.counter ?? null);
          A.skins.add(b);
        } else if (A.skins.has(b)) {
          w.setSkin?.(wid, null);
          w.setKillCounter?.(wid, null);
          A.skins.delete(b);
        }
        const ch = DEFS[this.byUid(E.charms[b])?.def];
        if (ch) { w.setCharm?.(wid, { id: ch.id, shape: ch.shape, color: ch.color }); A.charms.add(b); }
        else if (A.charms.has(b)) { w.setCharm?.(wid, null); A.charms.delete(b); }
        const st = (E.stickers[b] || []).map((u) => DEFS[this.byUid(u)?.def]).filter(Boolean);
        if (st.length) { w.setStickers?.(wid, st.map((d) => ({ id: d.id, glyph: d.glyph, color: d.color }))); A.stickers.add(b); }
        else if (A.stickers.has(b)) { w.setStickers?.(wid, []); A.stickers.delete(b); }
      }
      const kn = this.byUid(E.knife);
      if (kn) {
        const kid = this.knifeIdFor(DEFS[kn.def].base);
        w.setKnife?.(kid);
        w.setSkin?.(kid, skinSpec(kn));
        this._knife = kid;
      } else if (this._knife) {
        w.setSkin?.(this._knife, null);
        w.setKnife?.(this.knifeIdFor('tk7'));
        this._knife = null;
      }
    } catch (err) {
      console.warn('[inventory] falha ao aplicar equipamento na arma', err);
    }
  },

  // ─── sucata / contrato ───────────────────────────────────────────────
  scrap(uids) {
    const set = new Set(uids);
    let total = 0;
    for (const u of set) if (this.equippedSet().has(u)) this.unequipSilent(u);
    this.state.items = this.state.items.filter((it) => {
      if (!set.has(it.uid)) return true;
      total += L.scrapValue(it);
      return false;
    });
    this.state.credits += total;
    this.state.stats.scrapped += set.size;
    this.commit();
    this.apply();
    return total;
  },
  unequipSilent(uid) {
    const E = this.state.equip;
    for (const k of ['skins', 'charms']) for (const [b, u] of Object.entries(E[k])) if (u === uid) delete E[k][b];
    for (const b of Object.keys(E.stickers)) E.stickers[b] = E.stickers[b].filter((u) => u !== uid);
    if (E.knife === uid) E.knife = null;
  },
  tradeUp(uids, seed) {
    const items = uids.map((u) => this.byUid(u)).filter(Boolean);
    if (items.some((it) => this.equippedSet().has(it.uid))) return { error: 'DESEQUIPE OS ITENS ANTES' };
    const r = L.tradeUp(items, (seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9))) >>> 0);
    if (r.error) return r;
    const set = new Set(uids);
    this.state.items = this.state.items.filter((it) => !set.has(it.uid));
    const item = this.grant(r.item);
    this.state.stats.traded++;
    this.commit();
    return { item };
  },

  // ─── diário / passe ──────────────────────────────────────────────────
  claimDaily() {
    const today = L.dateKey();
    const r = L.claimDaily(this.state.daily, today);
    if (!r.reward) return null;
    this.state.daily = r.daily;
    const got = this.giveReward(r.reward, 'daily', L.hashStr(today));
    this.commit();
    return { ...r, got };
  },
  claimBp(t) {
    const S = this.state.bp;
    if (S.claimed.includes(t) || L.bpLevel(S.xp).tier < t) return null;
    S.claimed.push(t);
    const got = this.giveReward(L.bpReward(t), 'bp', t * 7919 + 13);
    this.commit();
    return { tier: t, got };
  },
  /** Aplica uma recompensa {credits, keys, item, skin, knife, card, emblem}; devolve a lista do que entrou. */
  giveReward(rw, src, seed) {
    const got = [];
    if (!rw) return got;
    const rng = L.mulberry32((seed ^ (this.state.nextUid * 40503)) >>> 0);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    if (rw.credits) { this.state.credits += rw.credits; got.push({ credits: rw.credits }); }
    if (rw.keys) { this.state.keys += rw.keys; got.push({ keys: rw.keys }); }
    if (rw.item) got.push({ item: this.grant(pick(rw.item === 'charm' ? C.CHARMS : C.STICKERS), src) });
    if (rw.skin) got.push({ item: this.grant(pick(CASES.flatMap((c) => C.casePool(c, rw.skin))), src) });
    if (rw.knife) got.push({ item: this.grant(pick(CASES.flatMap((c) => c.knives)), src) });
    if (rw.card && !this.state.cards.includes(rw.card)) { this.state.cards.push(rw.card); got.push({ card: rw.card }); }
    if (rw.emblem && !this.state.emblems.includes(rw.emblem)) { this.state.emblems.push(rw.emblem); got.push({ emblem: rw.emblem }); }
    return got;
  },

  // ─── partida ─────────────────────────────────────────────────────────
  addKill(base) {
    if (!base) return;
    const K = this.state.mastery.kills;
    const before = K[base] || 0;
    K[base] = before + 1;
    for (const def of L.masteryUnlocks(base, before, before + 1)) {
      const it = this.grant(def, 'mastery');
      this.ctx.bus.emit('inventory:unlock', { item: it, def: DEFS[def], name: this.itemName(it) });
    }
    // contador de abates da skin equipada
    const eq = this.byUid(this.state.equip.skins[base]);
    if (eq && eq.counter != null) {
      eq.counter++;
      if (this.applyOn) this.ctx.services.weapon?.setKillCounter?.(this.weaponIdFor(base), eq.counter);
    }
    clearTimeout(this._st);
    this._st = setTimeout(() => this.persist && Store.save(this.state), 1500);
  },
  /** 'match:end' (hud): créditos + XP do passe. */
  onMatchEnd(s = {}) {
    const cr = L.matchCredits(s);
    const bpBefore = L.bpLevel(this.state.bp.xp);
    this.state.bp.xp += Math.max(0, Math.round(s.xp || 0));
    const bpAfter = L.bpLevel(this.state.bp.xp);
    this.state.credits += cr.total;
    this.state.stats.earned += cr.total;
    this.lastAward = { credits: cr.total, lines: cr.lines, bpBefore, bpAfter, xp: s.xp || 0 };
    this.commit('award');
  },
  markSeen(uids) {
    let n = 0;
    for (const u of uids || this.state.items.map((it) => it.uid)) {
      const it = this.byUid(u);
      if (it?.new) { it.new = false; n++; }
    }
    if (n) this.commit();
  },

  dispose() {
    for (const off of this._offs || []) off?.();
    clearTimeout(this._st);
  },
};

/** Skin no formato do contrato v3 (para `weapon.setSkin` / `buildPreview`). */
export function skinSpec(it) {
  const d = DEFS[it?.def];
  if (!d || (d.type !== 'skin' && d.type !== 'knife')) return null;
  return { id: d.id, name: d.name, pattern: d.pattern, palette: [...d.palette], wear: it.wear ?? 0, seed: it.seed ?? 0, finish: { ...d.finish }, rarity: d.rarity };
}

/**
 * Inventário de demonstração (modo shot / `?invdemo=1`): determinístico,
 * com itens de todas as raridades, faca, maestria parcial e passe adiantado.
 */
export function demoState() {
  const s = Store.defaults();
  s.credits = 2480;
  s.keys = 3;
  const add = (it) => { it.uid = s.nextUid++; it.t = 1700000000000 + it.uid * 60000; s.items.push(it); return it; };
  for (let i = 1; i <= 34; i++) add(L.rollCase(CASES[(i - 1) % 3], i * 7919));
  const rng = L.mulberry32(42);
  add(L.makeItem('ferro-aurora', rng, { src: 'case:ferro' }));
  add(L.makeItem('mare-c-oceano', rng, { src: 'case:mare' }));
  add(L.makeItem('cinzas-crepusculo', rng, { src: 'case:cinzas' }));
  add(L.makeItem('mare-kraken', rng, { src: 'case:mare', counter: 214 }));
  // comuns suficientes para um contrato de troca (10 da mesma raridade)
  for (const id of ['ferro-cinza', 'mare-nevoa', 'cinzas-po', 'ferro-areia', 'mare-cais', 'cinzas-tijolo']) add(L.makeItem(id, rng, { src: 'case' }));
  add(L.makeItem('m-kr9-bronze', rng, { src: 'mastery' }));
  add(L.makeItem('m-kr9-prata', rng, { src: 'mastery' }));
  add(L.makeItem('ch-caveira', rng, { src: 'bp' }));
  add(L.makeItem('ch-diamante', rng, { src: 'bp' }));
  add(L.makeItem('st-coroa', rng, { src: 'bp' }));
  add(L.makeItem('st-lobo', rng, { src: 'daily' }));
  // os mais recentes ficam "novos"
  for (const it of s.items.slice(-6)) it.new = true;
  const find = (d) => s.items.find((it) => it.def === d)?.uid;
  s.equip.skins.kr9 = find('ferro-aurora');
  s.equip.skins.sniper = find('mare-kraken');
  s.equip.knife = find('mare-c-oceano');
  s.equip.charms.kr9 = find('ch-diamante');
  s.equip.stickers.kr9 = [find('st-coroa')];
  s.equip.card = 'cc-fornalha';
  s.equip.emblem = 'em-aguia';
  s.cards.push('cc-fornalha', 'cc-vigia', 'cc-selva');
  s.emblems.push('em-aguia', 'em-lobo');
  s.mastery.kills = { kr9: 96, p11: 31, smg: 12, sniper: 160 };
  s.bp = { xp: 23400, claimed: [1, 2, 3, 4, 5, 6, 7] };
  s.daily = { last: L.dateKey(new Date(Date.now() - 86400000)), streak: 3 };
  s.stats = { opened: 41, traded: 2, scrapped: 17, earned: 9120 };
  return s;
}
