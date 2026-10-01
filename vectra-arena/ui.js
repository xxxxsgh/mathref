/* ==========================================================================
   VECTRA ARENA — ui.js
   UIManager: every HTML/CSS screen and the in-game HUD.
     menus · play setup · inventory (grid, filters, item menu, compare,
     sell) · loadout · inspection viewer · settings · HUD (vitals, ammo,
     score, timer, kill feed, mini-map, crosshair, hit markers, damage
     indicators, toasts, banners) · scoreboard · pause · death · match end
   ========================================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LOADING_TIPS = [
  'Wear is cosmetic only — a Battle-Scarred skin shoots exactly like a Factory New one.',
  'Headshots deal 2x damage. Leg shots deal 0.75x.',
  'Press F with the knife equipped. Some inspections are rare.',
  'Crouching tightens your spread. Moving and jumping widen it.',
  'Bots hear gunfire. Reposition after a kill.',
  'The catwalk overlooks the courtyard — and is exposed from both sides.',
  'The south rooms form a flank route between both bases.',
];

class UIManager {
  constructor(game) {
    this.game = game;
    this.screen = 'loading';
    this.history = [];
    this.invFilter = 'all';
    this.selectedItem = null;
    this.compareFrom = null;
    this.inspectList = [];
    this.inspectIndex = 0;
    this.killfeedItems = [];
    this.minimapBase = null;
    this.minimapCtx = $('#minimap').getContext('2d');
    this.hitTimer = 0;
    this.hudVisible = false;
    $('#load-tip').textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  }

  /* ============================== screens ============================== */

  show(id, push = true) {
    if (push && this.screen && this.screen !== id && this.screen !== 'loading') this.history.push(this.screen);
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $(`#screen-${id}`);
    if (el) el.classList.add('active');
    this.screen = id;
    // per-screen refresh
    if (id === 'menu') this.updateProfile();
    if (id === 'inventory') this.renderInventory();
    if (id === 'loadout') this.renderLoadout();
    if (id === 'settings') this.syncSettings();
    if (id === 'play') this.syncPlay();
    if (id !== 'inspect') this.game.preview.close();
  }

  back() {
    this.game.audio.ui('back');
    this.hideItemMenu();
    if (this.screen === 'settings' && this.game.mode === 'playing') {
      $('#screen-settings').classList.remove('active');
      this.screen = null;
      $('#pause-menu').classList.remove('hidden');
      return;
    }
    const prev = this.history.pop() || 'menu';
    this.show(prev, false);
  }

  hideAllScreens() {
    $$('.screen').forEach(s => s.classList.remove('active'));
    this.screen = null;
    this.game.preview.close();
  }

  setLoading(progress, step) {
    $('#load-bar').style.width = `${Math.round(progress * 100)}%`;
    if (step) $('#load-step').textContent = step;
  }

  /* ============================== binding ============================== */

  bind() {
    const g = this.game;
    // global button sounds
    document.addEventListener('mouseover', e => {
      if (e.target.closest && e.target.closest('button')) g.audio.ui('hover');
    });
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button');
      if (b) { g.audio.init(); g.audio.startMusic(); }
    }, true);

    $$('.menu-btn').forEach(b => b.addEventListener('click', () => {
      g.audio.ui('click');
      const a = b.dataset.action;
      if (a === 'play') this.show('play');
      if (a === 'inventory') this.show('inventory');
      if (a === 'loadout') this.show('loadout');
      if (a === 'settings') this.show('settings');
      if (a === 'inspection') this.openInspection(g.inventory.equippedSkin('knife'), g.inventory.filter('all'));
    }));
    $$('[data-back]').forEach(b => b.addEventListener('click', () => this.back()));

    // play setup
    this.bindSeg('#seg-difficulty', v => { g.save.settings.difficulty = v; g.save.save(); });
    this.bindSeg('#seg-primary', v => { g.save.data.primary = v; g.save.save(); });
    $('#btn-deploy').addEventListener('click', () => { g.audio.ui('equip'); g.startMatch(); });

    // inventory filters
    $$('#inv-filters button').forEach(b => b.addEventListener('click', () => {
      $$('#inv-filters button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      this.invFilter = b.dataset.f;
      this.hideItemMenu();
      this.renderInventory();
    }));
    $$('#item-menu button').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      this.itemAction(b.dataset.act);
    }));
    $('#screen-inventory').addEventListener('click', e => {
      if (!e.target.closest('.inv-card') && !e.target.closest('#item-menu')) this.hideItemMenu();
    });
    $('#compare-cancel').addEventListener('click', () => this.cancelCompare());

    // inspection
    $('#ins-close').addEventListener('click', () => this.back());
    $('#ins-auto').addEventListener('click', e => {
      g.preview.autoRotate = !g.preview.autoRotate;
      e.currentTarget.classList.toggle('active', g.preview.autoRotate);
    });
    $('#ins-rotate').addEventListener('click', () => { g.preview.rotY += Math.PI / 2; });
    $('#ins-zoom').addEventListener('click', () => {
      const z = g.preview.zoom;
      g.preview.zoom = z < 1.4 ? 1.8 : z < 2.4 ? 2.8 : 1;
    });
    $('#ins-light').addEventListener('click', e => {
      g.preview.lightIndex = (g.preview.lightIndex + 1) % g.preview.lightPresets.length;
      e.currentTarget.textContent = `LIGHTING: ${g.preview.applyLight(g.preview.lightIndex)}`;
    });
    $('#ins-prev').addEventListener('click', () => this.stepInspect(-1));
    $('#ins-next').addEventListener('click', () => this.stepInspect(1));
    $('#ins-equip').addEventListener('click', () => {
      const item = this.inspectList[this.inspectIndex];
      if (item) { g.inventory.equip(item.id); g.audio.ui('equip'); this.toast(`EQUIPPED ${item.fullName.toUpperCase()}`); this.updateInspectInfo(); }
    });

    // settings
    this.bindSettings();

    // pause
    $('#btn-resume').addEventListener('click', () => g.resume());
    $('#btn-pause-settings').addEventListener('click', () => {
      $('#pause-menu').classList.add('hidden');
      this.show('settings', false);
    });
    $('#btn-quit').addEventListener('click', () => g.quitToMenu());
    $('#btn-match-menu').addEventListener('click', () => g.quitToMenu());
    $('#mobile-continue').addEventListener('click', () => $('#mobile-warning').classList.add('hidden'));
    window.addEventListener('resize', () => { if (this.screen === 'inspect') g.preview.resize(); });
  }

  bindSeg(sel, onChange) {
    $$(`${sel} button`).forEach(b => b.addEventListener('click', () => {
      $$(`${sel} button`).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      this.game.audio.ui('click');
      onChange(b.dataset.v);
    }));
  }

  setSeg(sel, v) {
    $$(`${sel} button`).forEach(x => x.classList.toggle('active', x.dataset.v === v));
  }

  syncPlay() {
    this.setSeg('#seg-difficulty', this.game.save.settings.difficulty);
    this.setSeg('#seg-primary', this.game.save.data.primary);
  }

  /* ============================== profile ============================== */

  updateProfile() {
    const p = this.game.save.progress;
    $('#prof-level').textContent = p.level;
    const need = SaveManager.xpForLevel(p.level);
    $('#prof-xp').style.width = `${Math.min(100, (p.xp / need) * 100)}%`;
    $('#prof-xp-text').textContent = `${p.xp} / ${need} XP`;
    $('#prof-matches').textContent = p.matches;
    $('#prof-wins').textContent = p.wins;
    $('#prof-kills').textContent = p.kills;
    $('#prof-kd').textContent = (p.kills / Math.max(1, p.deaths)).toFixed(2);
    $('#prof-hs').textContent = p.headshots;
    $('#prof-credits').textContent = p.credits.toLocaleString('en-US');
    const k = this.game.inventory.equippedSkin('knife');
    const el = $('#prof-knife');
    el.innerHTML = '';
    if (k) {
      el.innerHTML = `<img alt="" src="${this.game.preview.thumbnail(k)}"><div><b style="color:${k.rarityInfo.color}">${k.name}</b><span>${k.wearLevel} · ${k.floatValue.toFixed(3)}</span></div>`;
    }
  }

  /* ============================== inventory ============================== */

  rarityBadge(item) {
    return `<span class="rarity r-${item.rarity.toLowerCase()}">${item.rarity}</span>`;
  }

  renderInventory() {
    const inv = this.game.inventory;
    $('#inv-credits').textContent = this.game.save.progress.credits.toLocaleString('en-US');
    const grid = $('#inv-grid');
    grid.innerHTML = '';
    const list = inv.filter(this.invFilter);
    for (const item of list) {
      const card = document.createElement('div');
      card.className = `inv-card r-${item.rarity.toLowerCase()}${inv.isEquipped(item) ? ' equipped' : ''}`;
      card.dataset.id = item.id;
      card.innerHTML = `
        <div class="inv-thumb"><img alt="" src="${this.game.preview.thumbnail(item)}"></div>
        ${inv.isEquipped(item) ? '<div class="equipped-badge">EQUIPPED</div>' : ''}
        <div class="inv-weapon">${WEAPON_LABELS[item.weapon]}</div>
        <div class="inv-name">${item.name}</div>
        ${this.rarityBadge(item)}
        <div class="inv-meta"><span>${item.wearLevel}</span></div>
        <div class="inv-meta"><span>Float <b>${item.floatValue.toFixed(3)}</b></span><span>Pattern <b>${item.patternSeed}</b></span></div>
        <div class="inv-wear"><i style="left:${item.floatValue * 100}%"></i></div>`;
      card.addEventListener('click', e => { e.stopPropagation(); this.onCardClick(item, card); });
      grid.appendChild(card);
    }
    if (!list.length) grid.innerHTML = '<div class="empty">No items in this category.</div>';
  }

  onCardClick(item, card) {
    this.game.audio.ui('click');
    if (this.compareFrom) {
      if (item.id !== this.compareFrom.id) this.showCompare(this.compareFrom, item);
      this.cancelCompare();
      return;
    }
    this.selectedItem = item;
    const menu = $('#item-menu');
    $('#item-menu-title').innerHTML = `${item.fullName}<small>${item.wearLevel}</small>`;
    const inv = this.game.inventory;
    menu.querySelector('[data-act="equip"]').disabled = inv.isEquipped(item);
    menu.querySelector('[data-act="equip"]').textContent = inv.isEquipped(item) ? 'EQUIPPED' : 'EQUIP';
    menu.querySelector('[data-act="sell"]').disabled = !inv.canSell(item);
    menu.querySelector('[data-act="sell"]').textContent = inv.canSell(item) ? `SELL · ${item.sellValue} CR` : 'SELL';
    menu.classList.remove('hidden');
    const r = card.getBoundingClientRect();
    const host = $('#screen-inventory').getBoundingClientRect();
    let x = r.right - host.left + 8, y = r.top - host.top;
    if (x + 190 > host.width) x = r.left - host.left - 198;
    y = Math.min(y, host.height - 230);
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }

  hideItemMenu() { $('#item-menu').classList.add('hidden'); }

  itemAction(act) {
    const item = this.selectedItem;
    const g = this.game;
    if (!item) return;
    this.hideItemMenu();
    if (act === 'equip') {
      g.inventory.equip(item.id);
      g.audio.ui('equip');
      this.toast(`EQUIPPED ${item.fullName.toUpperCase()}`);
      this.renderInventory();
    } else if (act === 'inspect') {
      g.audio.ui('click');
      this.openInspection(item, g.inventory.filter(this.invFilter));
    } else if (act === 'compare') {
      this.compareFrom = item;
      $('#compare-hint').classList.remove('hidden');
      $$('.inv-card').forEach(c => c.classList.toggle('compare-src', +c.dataset.id === item.id));
    } else if (act === 'sell') {
      if (!g.inventory.canSell(item)) return;
      this.confirm(`<h3>SELL ITEM</h3><p>${item.fullName}<br><span class="dim">${item.wearLevel} · Float ${item.floatValue.toFixed(3)} · Pattern ${item.patternSeed}</span></p><p>You will receive <b>${item.sellValue}</b> fictional credits.<br><span class="dim">No real money is involved.</span></p>`,
        'SELL', () => {
          const v = g.inventory.sell(item.id);
          this.toast(`SOLD FOR ${v} CR`);
          this.renderInventory();
        });
    }
  }

  cancelCompare() {
    this.compareFrom = null;
    $('#compare-hint').classList.add('hidden');
    $$('.inv-card').forEach(c => c.classList.remove('compare-src'));
  }

  showCompare(a, b) {
    const row = (label, va, vb, better = 0) => `<tr><td>${label}</td><td class="${better < 0 ? 'better' : ''}">${va}</td><td class="${better > 0 ? 'better' : ''}">${vb}</td></tr>`;
    const def = (it) => WEAPON_DEFS[it.weapon];
    const dmgA = def(a).damage, dmgB = def(b).damage;
    const html = `
      <h3>COMPARE</h3>
      <div class="compare-imgs"><img alt="" src="${this.game.preview.thumbnail(a)}"><img alt="" src="${this.game.preview.thumbnail(b)}"></div>
      <table class="compare-table">
        <tr><th></th><th>${a.fullName}</th><th>${b.fullName}</th></tr>
        ${row('Rarity', `<span style="color:${a.rarityInfo.color}">${a.rarity}</span>`, `<span style="color:${b.rarityInfo.color}">${b.rarity}</span>`, Math.sign(b.rarityInfo.tier - a.rarityInfo.tier))}
        ${row('Condition', a.wearLevel, b.wearLevel)}
        ${row('Float', a.floatValue.toFixed(3), b.floatValue.toFixed(3), Math.sign(a.floatValue - b.floatValue))}
        ${row('Pattern', a.patternSeed, b.patternSeed)}
        ${row('Value', `${a.sellValue} CR`, `${b.sellValue} CR`, Math.sign(b.sellValue - a.sellValue))}
        ${row('Damage', dmgA, dmgB)}
        ${row('Fire interval', `${def(a).interval}s`, `${def(b).interval}s`)}
      </table>
      <p class="dim">Gameplay stats depend only on the weapon type. Skin, float and pattern are cosmetic.</p>`;
    this.modal(html, [{ label: 'CLOSE', primary: true }]);
  }

  /* ============================== modal ============================== */

  modal(html, actions) {
    $('#modal-body').innerHTML = html;
    const box = $('#modal-actions');
    box.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => { $('#modal').classList.add('hidden'); if (a.cb) a.cb(); });
      box.appendChild(b);
    }
    $('#modal').classList.remove('hidden');
  }

  confirm(html, label, cb) {
    this.modal(html, [{ label: 'CANCEL' }, { label, primary: true, cb }]);
  }

  /* ============================== loadout ============================== */

  renderLoadout() {
    const g = this.game;
    const inv = g.inventory;
    const grid = $('#loadout-grid');
    grid.innerHTML = '';
    const slots = [
      { slot: 'PRIMARY · 1', weapon: 'rifle', filter: 'rifles' },
      { slot: 'PRIMARY · 1', weapon: 'sniper', filter: 'rifles' },
      { slot: 'SECONDARY · 2', weapon: 'pistol', filter: 'pistols' },
      { slot: 'MELEE · 3', weapon: 'knife', filter: 'knives' },
    ];
    for (const s of slots) {
      const item = inv.equippedSkin(s.weapon);
      const d = WEAPON_DEFS[s.weapon];
      const isPrimary = s.weapon === 'rifle' || s.weapon === 'sniper';
      const active = !isPrimary || g.save.data.primary === s.weapon;
      const card = document.createElement('div');
      card.className = `loadout-card r-${item.rarity.toLowerCase()}${active ? '' : ' inactive'}`;
      card.innerHTML = `
        <div class="lo-slot">${s.slot}${isPrimary ? (active ? ' <em>ACTIVE</em>' : '') : ''}</div>
        <div class="lo-weapon">${d.name}<small>${d.codename}</small></div>
        <div class="inv-thumb"><img alt="" src="${g.preview.thumbnail(item)}"></div>
        <div class="inv-name">${item.name}</div>
        ${this.rarityBadge(item)}
        <div class="inv-meta"><span>${item.wearLevel}</span><span>Float <b>${item.floatValue.toFixed(3)}</b></span><span>Pattern <b>${item.patternSeed}</b></span></div>
        <div class="lo-stats">
          ${s.weapon === 'knife' ? `<span>DMG ${d.damage} / ${d.heavyDamage}</span>` : `<span>DMG ${d.damage}</span><span>MAG ${d.mag}</span><span>RPM ${Math.round(60 / d.interval)}</span>`}
        </div>
        <div class="lo-actions"></div>`;
      const actions = card.querySelector('.lo-actions');
      const change = document.createElement('button');
      change.className = 'btn small';
      change.textContent = 'CHANGE SKIN';
      change.addEventListener('click', () => {
        this.invFilter = s.filter;
        $$('#inv-filters button').forEach(x => x.classList.toggle('active', x.dataset.f === s.filter));
        this.show('inventory');
      });
      actions.appendChild(change);
      if (isPrimary && !active) {
        const use = document.createElement('button');
        use.className = 'btn small primary';
        use.textContent = 'SET PRIMARY';
        use.addEventListener('click', () => { g.save.data.primary = s.weapon; g.save.save(); g.audio.ui('equip'); this.renderLoadout(); });
        actions.appendChild(use);
      }
      grid.appendChild(card);
    }
  }

  /* ============================== inspection ============================== */

  openInspection(item, list) {
    this.inspectList = list && list.length ? list : [item];
    this.inspectIndex = Math.max(0, this.inspectList.findIndex(i => i.id === item.id));
    this.show('inspect');
    this.game.preview.open($('#inspect-view'), this.inspectList[this.inspectIndex]);
    this.updateInspectInfo();
  }

  stepInspect(d) {
    const n = this.inspectList.length;
    this.inspectIndex = (this.inspectIndex + d + n) % n;
    this.game.preview.setItem(this.inspectList[this.inspectIndex], 512);
    this.game.audio.ui('click');
    this.updateInspectInfo();
  }

  updateInspectInfo() {
    const item = this.inspectList[this.inspectIndex];
    if (!item) return;
    $('#ins-weapon').textContent = WEAPON_LABELS[item.weapon].toUpperCase();
    $('#ins-name').textContent = item.name.toUpperCase();
    const r = $('#ins-rarity');
    r.textContent = item.rarity;
    r.className = `inspect-rarity rarity r-${item.rarity.toLowerCase()}`;
    $('#ins-float').textContent = item.floatValue.toFixed(3);
    $('#ins-pattern').textContent = item.patternSeed;
    $('#ins-cond').textContent = item.wearLevel;
    $('#ins-marker').style.left = `${item.floatValue * 100}%`;
    $('#ins-index').textContent = `${this.inspectIndex + 1} / ${this.inspectList.length}`;
    const eq = this.game.inventory.isEquipped(item);
    $('#ins-equip').textContent = eq ? 'EQUIPPED' : 'EQUIP';
    $('#ins-equip').disabled = eq;
    $('#screen-inspect').style.setProperty('--rarity', item.rarityInfo.color);
  }

  /* ============================== settings ============================== */

  bindSettings() {
    const g = this.game;
    const s = g.save.settings;
    const range = (id, key, fmt) => {
      const el = $(id);
      const out = el.parentElement.querySelector('output');
      el.addEventListener('input', () => {
        s[key] = parseFloat(el.value);
        if (out) out.textContent = fmt(s[key]);
        g.applySettings();
      });
      el.addEventListener('change', () => g.save.save());
    };
    range('#set-sens', 'sensitivity', v => v.toFixed(2));
    range('#set-fov', 'fov', v => `${v}°`);
    range('#set-chsize', 'crosshairSize', v => `${v}px`);
    range('#set-chgap', 'crosshairGap', v => `${v}px`);
    range('#set-master', 'masterVolume', v => `${Math.round(v * 100)}%`);
    range('#set-music', 'musicVolume', v => `${Math.round(v * 100)}%`);
    range('#set-sfx', 'sfxVolume', v => `${Math.round(v * 100)}%`);
    $('#set-chcolor').addEventListener('input', e => { s.crosshairColor = e.target.value; g.applySettings(); g.save.save(); });
    $('#set-minimap').addEventListener('change', e => { s.minimapRotate = e.target.checked; g.save.save(); });
    this.bindSeg('#set-quality', v => {
      s.quality = v; g.save.save(); g.applySettings();
      $('#quality-note').textContent = 'Shadow quality changes fully apply after reloading the page.';
    });
    $('#set-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    });
    $('#set-reset').addEventListener('click', () => {
      this.confirm('<h3>RESET SAVE</h3><p>This deletes your inventory, progress and settings stored in this browser.</p>', 'RESET', () => {
        g.save.reset();
        location.reload();
      });
    });
  }

  syncSettings() {
    const s = this.game.save.settings;
    const set = (id, v, txt) => { const el = $(id); el.value = v; const o = el.parentElement.querySelector('output'); if (o) o.textContent = txt; };
    set('#set-sens', s.sensitivity, s.sensitivity.toFixed(2));
    set('#set-fov', s.fov, `${s.fov}°`);
    set('#set-chsize', s.crosshairSize, `${s.crosshairSize}px`);
    set('#set-chgap', s.crosshairGap, `${s.crosshairGap}px`);
    set('#set-master', s.masterVolume, `${Math.round(s.masterVolume * 100)}%`);
    set('#set-music', s.musicVolume, `${Math.round(s.musicVolume * 100)}%`);
    set('#set-sfx', s.sfxVolume, `${Math.round(s.sfxVolume * 100)}%`);
    $('#set-chcolor').value = s.crosshairColor;
    $('#set-minimap').checked = !!s.minimapRotate;
    this.setSeg('#set-quality', s.quality);
  }

  applyCrosshair() {
    const s = this.game.save.settings;
    for (const el of [$('#crosshair'), $('#ch-preview')]) {
      el.style.setProperty('--ch-size', `${s.crosshairSize}px`);
      el.style.setProperty('--ch-gap', `${s.crosshairGap}px`);
      el.style.setProperty('--ch-color', s.crosshairColor);
    }
  }

  /* ================================ HUD ================================ */

  showHUD(v) {
    this.hudVisible = v;
    $('#hud').classList.toggle('hidden', !v);
    document.body.classList.toggle('playing', v);
  }

  updateVitals() {
    const p = this.game.player;
    $('#hp-num').textContent = Math.max(0, Math.ceil(p.health));
    $('#armor-num').textContent = Math.ceil(p.armor);
    $('#hp-bar').style.width = `${Math.max(0, p.health)}%`;
    $('#armor-bar').style.width = `${p.armor}%`;
    $('#hud').classList.toggle('low-hp', p.health <= 25 && p.alive);
  }

  updateAmmo() {
    const a = this.game.arsenal;
    const w = a.current;
    if (!w) return;
    const knife = w.id === 'knife';
    $('#ammo-mag').textContent = knife ? '—' : w.ammo;
    $('#ammo-res').textContent = knife ? '' : w.reserve;
    $('.ammo span').style.visibility = knife ? 'hidden' : 'visible';
    $('.ammo').classList.toggle('empty', !knife && w.ammo <= Math.ceil(w.def.mag * 0.2));
    $('#weapon-name').textContent = w.def.name;
    $('#weapon-skin').innerHTML = w.skin ? `<span style="color:${w.skin.rarityInfo.color}">${w.skin.name}</span> · ${w.skin.wearLevel}` : '';
    $$('#weapon-slots span').forEach(s => s.classList.toggle('active', a.slotWeapon(+s.dataset.slot) === w.id));
  }

  updateScore() {
    const r = this.game.rounds;
    $('#score-blue').textContent = r.score.blue;
    $('#score-red').textContent = r.score.red;
    $('#round-label').textContent = `ROUND ${r.round} / ${r.maxRounds}`;
    const t = Math.max(0, Math.ceil(r.timer));
    const timer = $('#round-timer');
    timer.textContent = r.state === 'buy' ? `0:0${Math.min(9, t)}` : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    timer.classList.toggle('urgent', r.state === 'live' && t <= 10);
    // alive pips
    const pips = (team) => this.game.combatants.filter(c => c.team === team).map(c => `<i class="${c.alive ? '' : 'dead'}"></i>`).join('');
    $('#alive-blue').innerHTML = pips('blue');
    $('#alive-red').innerHTML = pips('red');
  }

  killfeed(killer, victim, weaponId, headshot) {
    const feed = $('#killfeed');
    const row = document.createElement('div');
    const involvesPlayer = killer.isPlayer || victim.isPlayer;
    row.className = `kf-row${involvesPlayer ? ' me' : ''}`;
    const icon = { rifle: '▬▬◣', sniper: '━━━◣', pistol: '◣', knife: '⟋' }[weaponId] || '•';
    row.innerHTML = `<span class="${killer.team}">${killer.name}</span><span class="kf-weapon">${icon}${headshot ? ' <b>◎</b>' : ''}</span><span class="${victim.team}">${victim.name}</span>`;
    feed.prepend(row);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 6000);
  }

  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('fade'), 2200);
    setTimeout(() => t.remove(), 2800);
  }

  showSkinTag(skin) {
    const el = $('#skin-tag');
    el.innerHTML = `<b style="color:${skin.rarityInfo.color}">${skin.fullName.toUpperCase()}</b><span>${skin.rarity} · ${skin.wearLevel}</span><span>Float ${skin.floatValue.toFixed(3)} · Pattern ${skin.patternSeed}</span>`;
    el.classList.remove('hidden');
    clearTimeout(this._skinTagT);
    this._skinTagT = setTimeout(() => el.classList.add('hidden'), 3500);
  }

  hitmarker(headshot, kill) {
    const h = $('#hitmarker');
    h.classList.remove('show', 'head', 'kill');
    void h.offsetWidth; // restart CSS animation
    h.classList.add('show');
    if (headshot) h.classList.add('head');
    if (kill) h.classList.add('kill');
  }

  /** Red arc pointing towards the damage source (angle relative to view). */
  damageIndicator(angle) {
    const el = document.createElement('div');
    el.className = 'dmg-ind';
    el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    $('#damage-indicators').appendChild(el);
    setTimeout(() => el.remove(), 1200);
    const fx = $('#fx-damage');
    fx.classList.remove('hit');
    void fx.offsetWidth;
    fx.classList.add('hit');
  }

  setCrosshairSpread(px) {
    $('#crosshair').style.setProperty('--ch-spread', `${px}px`);
  }

  setScope(on) {
    $('#scope').classList.toggle('hidden', !on);
    $('#crosshair').classList.toggle('hidden', on);
  }

  roundBanner(title, sub, cls = '') {
    const b = $('#round-banner');
    b.className = `round-banner ${cls}`;
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), 3200);
  }

  showBuy(v, t = 0) {
    $('#buy-panel').classList.toggle('hidden', !v);
    if (v) $('#buy-timer').textContent = Math.ceil(t);
  }

  showDeath(killer, damage, weaponId) {
    $('#death-killer').textContent = killer ? killer.name : 'UNKNOWN';
    $('#death-killer').className = killer ? killer.team : '';
    $('#death-damage').textContent = damage;
    $('#death-weapon').textContent = (WEAPON_DEFS[weaponId] || WEAPON_DEFS.rifle).name;
    $('#death-respawn').textContent = 'RESPAWNING...';
    $('#death-screen').classList.remove('hidden');
  }

  hideDeath() { $('#death-screen').classList.add('hidden'); }

  spectate(name) {
    const el = $('#spectate-label');
    if (!name) { el.classList.add('hidden'); return; }
    el.innerHTML = `SPECTATING <b>${name}</b><span>Respawning next round</span>`;
    el.classList.remove('hidden');
  }

  showScoreboard(v) {
    const sb = $('#scoreboard');
    sb.classList.toggle('hidden', !v);
    if (!v) return;
    const g = this.game, r = g.rounds;
    $('#sb-title').textContent = `OUTPOST · ROUND ${r.round}/${r.maxRounds}`;
    $('#sb-score').textContent = `BLUE ${r.score.blue} — ${r.score.red} RED`;
    const rows = ['blue', 'red'].map(team => g.combatants.filter(c => c.team === team)
      .sort((a, b) => b.kills - a.kills)
      .map(c => `<tr class="${team}${c.isPlayer ? ' me' : ''}"><td>${c.name}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.alive ? 'ALIVE' : 'DEAD'}</td></tr>`).join('')).join('<tr class="sep"><td colspan="4"></td></tr>');
    $('#sb-body').innerHTML = rows;
  }

  showMatchEnd(win, score, stats, rewards) {
    $('#match-result').textContent = win ? 'VICTORY' : 'DEFEAT';
    $('#match-result').className = `match-result ${win ? 'win' : 'loss'}`;
    $('#match-score').textContent = `BLUE ${score.blue} — ${score.red} RED`;
    $('#match-stats').innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('#match-rewards').innerHTML = rewards.join('');
    $('#match-end').classList.remove('hidden');
  }

  /* ============================== mini-map ============================== */

  /** Pre-renders the static map layout once. */
  buildMinimapBase(arena) {
    const size = 400;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const B = arena.bounds;
    const scale = size / (B.maxX - B.minX + 4);
    this.mmScale = scale;
    this.mmSize = size;
    const tx = (wx) => (wx - B.minX + 2) * scale;
    const tz = (wz) => (wz - (B.minZ + B.maxZ) / 2) * scale + size / 2;
    this.mmTx = tx; this.mmTz = tz;
    x.fillStyle = 'rgba(8,12,20,0.9)';
    x.fillRect(0, 0, size, size);
    x.fillStyle = 'rgba(40,52,70,0.55)';
    x.fillRect(tx(B.minX), tz(B.minZ), (B.maxX - B.minX) * scale, (B.maxZ - B.minZ) * scale);
    x.fillStyle = 'rgba(29,79,216,0.25)'; x.fillRect(tx(-40), tz(-6.5), 7 * scale, 13 * scale);
    x.fillStyle = 'rgba(179,18,44,0.25)'; x.fillRect(tx(33), tz(-6.5), 7 * scale, 13 * scale);
    for (const col of arena.colliders) {
      if (!col.minimap) continue;
      const b = col.box;
      x.fillStyle = b.max.y > 2 ? 'rgba(150,170,195,0.85)' : 'rgba(110,125,145,0.6)';
      x.fillRect(tx(b.min.x), tz(b.min.z), (b.max.x - b.min.x) * scale, (b.max.z - b.min.z) * scale);
    }
    // catwalk outline
    x.strokeStyle = 'rgba(169,92,255,0.7)';
    x.lineWidth = 2;
    x.strokeRect(tx(-13), tz(12.9), 26 * scale, 2.2 * scale);
    x.strokeStyle = 'rgba(61,245,255,0.6)';
    x.strokeRect(tx(B.minX), tz(B.minZ), (B.maxX - B.minX) * scale, (B.maxZ - B.minZ) * scale);
    this.minimapBase = c;
  }

  drawMinimap() {
    const g = this.game;
    const ctx = this.minimapCtx;
    const W = ctx.canvas.width;
    const p = g.player;
    const focus = p.alive ? p : (g.spectateTarget || p);
    const rotate = g.save.settings.minimapRotate;
    const zoom = 2.4; // map pixels per canvas pixel
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(5,8,14,0.85)';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    const yaw = focus.yaw || 0;
    if (rotate) ctx.rotate(yaw);
    ctx.scale(1 / zoom * 2, 1 / zoom * 2);
    const fx = this.mmTx(focus.position.x), fz = this.mmTz(focus.position.z);
    ctx.translate(-fx, -fz);
    ctx.drawImage(this.minimapBase, 0, 0);
    const now = g.time;
    const dot = (c, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(this.mmTx(c.position.x), this.mmTz(c.position.z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const c of g.combatants) {
      if (c === p) continue;
      if (c.team === 'blue') { if (c.alive) dot(c, '#3db8ff', 5); else dot(c, 'rgba(61,184,255,0.35)', 4); }
      else if (c.alive && c.spottedUntil > now) dot(c, '#ff3a52', 5.5);
    }
    // player arrow
    if (p.alive) {
      ctx.save();
      ctx.translate(this.mmTx(p.position.x), this.mmTz(p.position.z));
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // ring + north marker
    ctx.strokeStyle = 'rgba(61,245,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    const na = rotate ? yaw : 0;
    ctx.fillStyle = '#3df5ff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', W / 2 + Math.sin(na) * (W / 2 - 12), W / 2 - Math.cos(na) * (W / 2 - 12) + 4);
  }
}
