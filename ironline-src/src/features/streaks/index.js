/**
 * Feature `streaks` — killstreaks, medalhas, finalizações, killcam e modo foto.
 *
 *   logic.js     lógica pura (StreakTracker, MedalTracker, RingBuffer,
 *                pickTurretTarget, strikePattern) — streaks.test.mjs
 *   uav.js       UAV de reconhecimento (3): varreduras revelam inimigos
 *   airstrike.js morteiro (5): designador em tablet + 8 granadas escalonadas
 *   sentry.js    torreta sentinela (6): tripé procedural, alvo, superaquece
 *   drone.js     drone de ataque (7): quadricóptero armado ou kamikaze
 *   finisher.js  execução por trás (segurar V) com câmera de 3ª pessoa
 *   killcam.js   replay da morte pela perspectiva do atirador
 *   photo.js     modo foto (pausa → câmera livre, DOF, filtros, captura)
 *   sfx.js       sons sintetizados próprios (WebAudio no contexto do áudio)
 *   ui.js        estilos/ícones/DOM próprios
 *
 * Contrato v3: emite 'streak:ready'/'streak:used' { id, name, kills } e
 * 'medal:award' { id, name, xp, icon }; a HUD (agente B) desenha a barra de
 * killstreaks e as medalhas. Telas próprias (designador, killcam, foto)
 * ficam aqui. Ver README.md.
 */
import * as THREE from 'three';
import { STREAKS, MEDALS, DEFAULT_LOADOUT, StreakTracker, MedalTracker, normalizeLoadout } from './logic.js';
import { Sfx } from './sfx.js';
import { ensureStyle, el, streakIcon } from './ui.js';
import { Uav, FallbackRadar } from './uav.js';
import { Airstrike } from './airstrike.js';
import { Sentry } from './sentry.js';
import { Drones } from './drone.js';
import { Finisher } from './finisher.js';
import { Killcam } from './killcam.js';
import { PhotoMode } from './photo.js';

const STORE = 'ironline.streaks';
/** Ações travadas enquanto uma tela própria usa o mouse/teclado. */
const ALL_ACTIONS = ['fire', 'ads', 'melee', 'grenade', 'tactical', 'reload', 'interact', 'inspect', 'swap', 'weapon1', 'weapon2'];

export default {
  name: 'streaks',
  order: 55,

  init(ctx) {
    this.ctx = ctx;
    ensureStyle();
    this.root = el('div', 'stk', null, ctx.ui);
    this.sfx = new Sfx(ctx);
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    } catch {}
    const lo = ctx.params.get('streaks')?.split(',') || saved?.loadout || DEFAULT_LOADOUT;
    this.tracker = new StreakTracker(lo);
    this.medals = new MedalTracker();
    this.decoys = [];
    this.lockSaved = null;
    this.fireN = 0;
    this.fireT = -1;
    this.slideUntil = -1;

    this.uav = new Uav(this);
    this.air = new Airstrike(this);
    this.sentry = new Sentry(this);
    this.drones = new Drones(this);
    this.finisher = new Finisher(this);
    this.killcam = new Killcam(this);
    this.photo = new PhotoMode(this);

    // ── teclas: 3/4/5/6 = killstreaks do conjunto; B (segurar) = roda ──
    const b = ctx.input.bindings;
    const used = new Set(Object.values(b).flat());
    ['Digit3', 'Digit4', 'Digit5', 'Digit6'].forEach((code, i) => {
      const a = 'streak' + (i + 1);
      if (!b[a]) b[a] = used.has(code) ? [] : [code];
    });
    if (!b.streakWheel) b.streakWheel = used.has('KeyB') ? [] : ['KeyB'];

    // ── DOM de reserva (só sem HUD que trate) ──
    this.bar = el('div', 'stk-bar', null, this.root);
    this.toastEl = el('div', 'stk-toast stk-hide', null, this.root);
    this.hintEl = el('div', 'stk-hint stk-hide', null, this.root);
    this.radar = new FallbackRadar(this.root);
    this.radar.visible = false;
    this.wheel = null;

    // ── eventos ──
    const bus = ctx.bus;
    bus.on('weapon:fire', () => {
      this.fireN++;
      this.fireT = ctx.time.now;
    });
    bus.on('player:slide', (e) => {
      if (e?.phase === 'start') this.slideUntil = Infinity;
      else this.slideUntil = ctx.time.now + 0.5;
    });
    bus.on('enemy:death', (e) => this.onKill(e));
    bus.on('player:death', (info) => this.onDeath(info));
    bus.on('player:respawn', () => {
      this.killcam.stop();
      this.medals.lowHealth = false;
    });
    bus.on('match:start', () => this.reset());

    const self = this;
    this.api = ctx.provide('streaks', {
      STREAKS,
      MEDALS,
      /** Conjunto equipado (ids, por custo). */
      get loadout() { return [...self.tracker.loadout]; },
      setLoadout: (ids) => self.setLoadout(ids),
      get count() { return self.tracker.count; },
      get best() { return self.tracker.best; },
      /** Killstreaks prontas (ids, podem repetir). */
      get ready() { return [...self.tracker.ready]; },
      /** Estado por vaga para a barra da HUD: { id, name, kills, icon, key, ready, progress }. */
      slots: () => self.tracker.slots(),
      next: () => self.tracker.next(),
      /** Ativa por id ou por índice da vaga (0..3) — gancho do toque. */
      activate: (k) => self.activate(k),
      /** Killstreaks em andamento: [{ id, remaining }]. */
      get active() { return self.activeList(); },
      /** UAV: inimigos revelados (para o minimapa) e estado da varredura. */
      get revealed() { return self.uav.revealed; },
      get uav() { return self.uav.state; },
      /** Alvos alternativos para a IA inimiga (torreta/drone). */
      decoys: this.decoys,
      /** Alguma tela própria em uso (designador, killcam, execução, foto, posicionamento). */
      get busy() { return self.busy; },
      designator: {
        get open() { return self.air.open; },
        move: (dx, dz) => self.air.move(dx, dz),
        confirm: () => self.air.confirm(),
        cancel: () => self.air.cancel(),
      },
      killcam: { get active() { return !!(self.killcam.active || self.killcam.pending); } },
      finisher: { get target() { return self.finisher.target; }, get active() { return !!self.finisher.active; }, execute: (e) => self.finisher.execute(e) },
      photo: { get active() { return self.photo.active; }, enter: () => self.photo.enter(), exit: () => self.photo.exit(), capture: () => self.photo.capture(), get settings() { return self.photo.s; }, set: (o) => (Object.assign(self.photo.s, o), self.photo.sync()) },
      /** Seletor de killstreaks (tela própria). */
      openPicker: () => self.openPicker(),
      /** QA/roteiros: dá uma killstreak pronta. */
      grant: (id) => self.grant(id),
      debug: {
        sentry: (pos, yaw = 0) => self.sentry.spawn(new THREE.Vector3(pos[0], pos[1], pos[2]), yaw, { instant: true }),
        drone: (mode = 'gun') => self.drones.launch(mode, mode === 'gun' ? 'drone' : 'kamikaze'),
        strike: (pos) => self.air.fire(new THREE.Vector3(pos[0], pos[1], pos[2])),
        uav: () => self.uav.start(STREAKS.uav.duration),
        medal: (id) => self.award(id),
      },
    });
  },

  // ─── conjunto ──────────────────────────────────────────────────────────
  setLoadout(ids) {
    const lo = this.tracker.setLoadout(normalizeLoadout(ids));
    try {
      localStorage.setItem(STORE, JSON.stringify({ loadout: lo }));
    } catch {}
    this.ctx.bus.emit('streak:loadout', { loadout: [...lo] });
    return lo;
  },

  def(id) {
    return STREAKS[id];
  },

  reset() {
    this.tracker.reset();
    this.medals.reset();
    this.uav.stop();
    this.air.cancelAll();
    this.sentry.clear();
    this.drones.clear();
    this.killcam.stop();
    this.decoys.length = 0;
    this.ctx.bus.emit('streak:progress', { count: 0, next: this.tracker.next() });
  },

  get busy() {
    return !!(this.air.open || this.killcam.active || this.finisher.active || this.photo.active || this.sentry.placing || this.wheel);
  },

  activeList() {
    const out = [];
    if (this.uav.state.active) out.push({ id: 'uav', remaining: this.uav.state.remaining });
    for (const t of this.sentry.list) if (t.state !== 'dead' && t.state !== 'gone') out.push({ id: 'sentry', remaining: t.life, health: t.health / t.maxHealth, heat: t.heat });
    for (const d of this.drones.list) if (d.state === 'fly') out.push({ id: d.id, remaining: d.life, health: d.health / 120 });
    if (this.air.shells.length) out.push({ id: 'airstrike', remaining: Math.max(0, this.air.shells[this.air.shells.length - 1].t - this.ctx.time.now) });
    return out;
  },

  /** Trava/destrava ações mapeadas (o mouse/teclado vão para a tela própria). */
  lockActions(on, list = ALL_ACTIONS) {
    const b = this.ctx.input.bindings;
    if (on) {
      this.lockSaved ||= {};
      for (const a of list) {
        if (!(a in b) || a in this.lockSaved) continue;
        if (b[a]?.length) this.ctx.input.simulate?.(a, false);
        this.lockSaved[a] = b[a];
        b[a] = [];
      }
    } else if (this.lockSaved) {
      for (const [a, v] of Object.entries(this.lockSaved)) b[a] = v;
      this.lockSaved = null;
    }
  },

  // ─── ativação ──────────────────────────────────────────────────────────
  grant(id) {
    if (!STREAKS[id]) return false;
    this.tracker.ready.push(id);
    this.emitReady(id);
    return true;
  },

  emitReady(id, extra = {}) {
    const d = STREAKS[id];
    const slot = this.tracker.loadout.indexOf(id);
    this.ctx.bus.emit('streak:ready', { id, name: d.name, kills: d.kills, icon: d.icon, key: slot >= 0 ? String(3 + slot) : null, ...extra });
    if (!extra.refund) {
      this.sfx.beep(880, 0.08, 0.12, 'triangle');
      setTimeout(() => this.sfx.beep(1320, 0.12, 0.12, 'triangle'), 90);
      const key = this.tracker.loadout.indexOf(id);
      this.toast(`${d.kills} KILL STREAK`, d.name, key >= 0 ? `PRESS [${3 + key}] TO DEPLOY` : '', 'stream');
    }
  },

  /** `k` = id ou índice da vaga (0..3). */
  activate(k) {
    const ctx = this.ctx;
    const id = typeof k === 'number' ? this.tracker.loadout[k] : k;
    if (!id || !STREAKS[id]) return false;
    // segunda ativação da torreta = posicionar (toque)
    if (id === 'sentry' && this.sentry.placing) return this.sentry.place();
    if (!ctx.player.alive || this.busy || !this.tracker.has(id)) {
      if (!this.tracker.has(id)) this.sfx.beep(240, 0.1, 0.08);
      return false;
    }
    this.tracker.use(id);
    if (id === 'uav') {
      this.uav.start(STREAKS.uav.duration);
      this.confirmed(id);
    } else if (id === 'airstrike') this.air.begin();
    else if (id === 'sentry') this.sentry.beginPlace();
    else if (id === 'drone' || id === 'kamikaze') {
      this.drones.launch(STREAKS[id].mode, id);
      this.confirmed(id);
    }
    return true;
  },

  /** A killstreak entrou em ação de fato → 'streak:used'. */
  confirmed(id) {
    const d = STREAKS[id];
    this.ctx.bus.emit('streak:used', { id, name: d.name, kills: d.kills, icon: d.icon });
    this.toast('DEPLOYED', d.name, '', 'used');
  },

  /** Cancelada (designador/torreta): volta para os prontos. */
  refund(id) {
    this.tracker.ready.push(id);
    this.emitReady(id, { refund: true });
  },

  ended(id) {
    this.ctx.bus.emit('streak:end', { id });
  },

  revealedList() {
    return this.uav.state.active ? this.uav.revealed : [];
  },

  /** Dano em área pelo caminho normal (morteiro, kamikaze). */
  blast(point, radius, max, { weapon, streak }) {
    const ctx = this.ctx;
    const eye = point.clone().add(new THREE.Vector3(0, 0.3, 0));
    const seen = new Set();
    const cols = ctx.collision.overlapSphere(point, radius, (c) => c.tag !== 'player' && typeof c.data?.damage === 'function' && !c.data?.decoy);
    for (const c of cols) {
      const key = c.data?.enemy || c;
      if (seen.has(key)) continue;
      seen.add(key);
      const center = (c.box || new THREE.Box3()).getCenter(new THREE.Vector3());
      const d = center.distanceTo(point);
      if (d >= radius) continue;
      const dmg = max * Math.pow(1 - Math.max(0, d - 0.3) / radius, 1.3);
      if (dmg <= 0) continue;
      if (!c.data?.prop && !ctx.collision.lineOfSight(eye, center, { filter: (o) => o !== c && o.tag !== 'enemy' && o.tag !== 'player' && o.tag !== 'prop' && o.tag !== 'sentry' })) continue;
      const dir = center.clone().sub(point).normalize();
      c.data.damage(dmg, { point: center, normal: dir.clone().negate(), dir, distance: d, part: 'torso', damage: dmg, source: 'player', weapon, streak, explosion: true, ballistic: true });
    }
  },

  // ─── abates e medalhas ─────────────────────────────────────────────────
  onKill({ enemy, info } = {}) {
    const ctx = this.ctx;
    info = info || {};
    const byPlayer = info.source === 'player' || info.source === undefined;
    if (!byPlayer || !enemy) return;
    const pl = ctx.player;
    const ep = enemy.group?.position;
    const dist = ep ? Math.hypot(ep.x - pl.position.x, ep.z - pl.position.z) : info.distance || 0;
    const streak = info.streak || null;
    const earned = this.tracker.kill({ byStreak: !!streak });
    for (const id of earned) this.emitReady(id);
    ctx.bus.emit('streak:progress', { count: this.tracker.count, next: this.tracker.next() });
    const br = enemy.brain || {};
    const sliding = !!(pl.sliding || ctx.services.movement?.stance?.() === 'slide' || ctx.time.now <= this.slideUntil);
    const k = {
      t: ctx.time.now,
      id: enemy.id,
      part: info.part,
      dist,
      weapon: info.weapon,
      melee: !!info.melee,
      explosion: !!info.explosion,
      barrel: !!info.barrel,
      execution: !!info.execution,
      streak,
      sliding,
      health: pl.health,
      maxHealth: pl.maxHealth,
      shot: !info.explosion && !info.melee && !streak && ctx.time.now === this.fireT ? this.fireN : -1,
      role: enemy.role?.id,
      reviving: !!(br.revive || br.reviving > 0),
      laser: enemy.role?.id === 'sniper' && (br.charge || 0) > 0.35,
    };
    for (const id of this.medals.kill(k)) this.award(id);
  },

  award(id) {
    const m = MEDALS[id];
    if (!m) return;
    this.ctx.bus.emit('medal:award', { id, name: m.name, xp: m.xp, icon: m.icon });
    if (!this.ctx.services.hud?.handlesMedals) this.toast('MEDAL', m.name, `+${m.xp} XP`, 'medal');
  },

  onDeath(info) {
    this.tracker.death();
    this.medals.death({ killerId: info?.enemy?.id ?? null });
    this.ctx.bus.emit('streak:progress', { count: 0, next: this.tracker.next() });
    if (this.air.open) this.air.cancel();
    if (this.sentry.placing) this.sentry.cancelPlace();
    this.closeWheel(false);
    this.killcam.onDeath(info);
  },

  // ─── DOM de reserva ────────────────────────────────────────────────────
  toast(a, b, c, kind) {
    const hud = this.ctx.services.hud;
    if (kind !== 'medal' && hud?.handlesStreaks) return;
    if (this.ctx.shot) return;
    const t = this.toastEl;
    t.innerHTML = `<div class="a">${a}</div><div class="b">${b}</div>${c ? `<div class="c">${c}</div>` : ''}`;
    t.classList.remove('stk-hide', 'out');
    clearTimeout(this._toastT);
    clearTimeout(this._toastT2);
    this._toastT = setTimeout(() => t.classList.add('out'), 2200);
    this._toastT2 = setTimeout(() => t.classList.add('stk-hide'), 2700);
  },

  /** Faixa de instrução central (null esconde). */
  hint(html, secs = 2) {
    const h = this.hintEl;
    clearTimeout(this._hintT);
    if (!html) return h.classList.add('stk-hide');
    h.innerHTML = html;
    h.classList.remove('stk-hide');
    if (secs < 900) this._hintT = setTimeout(() => h.classList.add('stk-hide'), secs * 1000);
  },

  drawBar() {
    const ctx = this.ctx;
    const hud = ctx.services.hud;
    const show = !hud?.handlesStreaks && !this.busy && !ctx.shot && (hud?.match?.phase === 'play' || hud?.match?.phase === 'dead' || !hud);
    this.bar.classList.toggle('stk-hide', !show);
    if (!show) return;
    const key = this.tracker.slots().map((s) => `${s.id}:${s.ready}:${s.progress.toFixed(2)}`).join('|');
    if (key === this._barKey) return;
    this._barKey = key;
    this.bar.innerHTML = this.tracker
      .slots()
      .map((s) => `<div class="stk-slot ${s.ready ? 'ready' : ''}"><span class="pg"><i style="width:${(s.progress * 100).toFixed(0)}%"></i></span><span>${s.name}${s.ready > 1 ? ' ×' + s.ready : ''}</span><span style="opacity:.8">${streakIcon(s.icon === 'mortar' ? 'mortar' : s.id, 18)}</span><span class="kc mono">${s.ready ? s.key : s.kills}</span></div>`)
      .join('');
  },

  // ─── roda radial (segurar B) ───────────────────────────────────────────
  openWheel() {
    const ctx = this.ctx;
    const lo = this.tracker.loadout;
    this.wheel = { sel: -1, x: 0, y: 0 };
    const d = el('div', 'stk-radial', null, this.root);
    const n = lo.length;
    let svg = '<svg viewBox="-150 -150 300 300">';
    lo.forEach((id, i) => {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n, a1 = a0 + (Math.PI * 2) / n;
      const p = (a, r) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
      svg += `<path data-i="${i}" d="M${p(a0, 60)} A60,60 0 0,1 ${p(a1, 60)} L${p(a1, 140)} A140,140 0 0,0 ${p(a0, 140)} Z" fill="rgba(9,11,13,.72)" stroke="rgba(242,244,239,.18)"/>`;
    });
    svg += '<circle r="56" fill="rgba(9,11,13,.5)" stroke="rgba(226,180,90,.5)"/></svg>';
    d.innerHTML = svg;
    lo.forEach((id, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const l = el('div', 'lbl', `<div style="color:${this.tracker.has(id) ? '#e2b45a' : 'rgba(242,244,239,.4)'}">${streakIcon(id === 'airstrike' ? 'mortar' : id, 30)}</div><b>${STREAKS[id].name}</b>${this.tracker.has(id) ? 'READY' : STREAKS[id].kills + ' KILLS'}`, d);
      l.style.left = `${150 + Math.cos(a) * 100}px`;
      l.style.top = `${150 + Math.sin(a) * 100 - 34}px`;
    });
    this.wheelEl = d;
    ctx.player.lookEnabled = false;
    this.onWheelMove = (e) => {
      if (!this.wheel) return;
      this.wheel.x += e.movementX;
      this.wheel.y += e.movementY;
      const r = Math.hypot(this.wheel.x, this.wheel.y);
      if (r > 120) {
        this.wheel.x *= 120 / r;
        this.wheel.y *= 120 / r;
      }
      let sel = -1;
      if (r > 25) {
        const a = Math.atan2(this.wheel.y, this.wheel.x) + Math.PI / 2 + Math.PI / n;
        sel = Math.floor(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / ((Math.PI * 2) / n));
      }
      this.wheel.sel = sel;
      for (const p of d.querySelectorAll('path')) p.setAttribute('fill', Number(p.dataset.i) === sel ? 'rgba(226,180,90,.55)' : 'rgba(9,11,13,.72)');
    };
    document.addEventListener('mousemove', this.onWheelMove);
  },

  closeWheel(activate) {
    if (!this.wheel) return;
    const sel = this.wheel.sel;
    this.wheel = null;
    this.wheelEl?.remove();
    document.removeEventListener('mousemove', this.onWheelMove);
    this.ctx.player.lookEnabled = true;
    if (activate && sel >= 0) this.activate(sel);
  },

  // ─── seletor de conjunto (tela própria) ────────────────────────────────
  openPicker() {
    if (this.pickerEl) return;
    const sel = new Set(this.tracker.loadout);
    const d = el('div', 'stk-pick interactive', null, this.root);
    const render = () => {
      d.innerHTML = `<h2>KILLSTREAKS</h2><div class="sub">CHOOSE UP TO 4 · KILLS WITHOUT DYING · STREAK KILLS DON'T CHAIN</div>
        <div class="grid">${Object.values(STREAKS).map((s) => `<div class="stk-card ${sel.has(s.id) ? 'on' : ''}" data-id="${s.id}"><div class="ic">${streakIcon(s.icon === 'mortar' ? 'mortar' : s.id, 56)}</div><div class="nm">${s.name}</div><div class="kl">${s.kills} KILLS</div><div class="ds">${s.desc}</div></div>`).join('')}</div>
        <button class="stk-btn" data-a="ok">CONFIRM</button>`;
    };
    render();
    d.addEventListener('click', (e) => {
      const card = e.target.closest('.stk-card');
      if (card) {
        const id = card.dataset.id;
        if (sel.has(id)) sel.delete(id);
        else {
          if (id === 'drone') sel.delete('kamikaze');
          if (id === 'kamikaze') sel.delete('drone');
          if (sel.size < 4) sel.add(id);
        }
        render();
      } else if (e.target.dataset?.a === 'ok') {
        this.setLoadout([...sel]);
        d.remove();
        this.pickerEl = null;
      }
    });
    this.pickerEl = d;
  },

  // ─── laço ──────────────────────────────────────────────────────────────
  update(dt, ctx) {
    const inp = ctx.input;
    if (!ctx.shot && inp.enabled !== false && ctx.player.alive && !this.busy) {
      for (let i = 0; i < 4; i++) if (inp.pressed('streak' + (i + 1))) this.activate(i);
      if (inp.pressed('streakWheel')) this.openWheel();
    }
    if (this.wheel && !inp.action('streakWheel')) this.closeWheel(true);
    this.uav.update(dt);
    this.air.update(dt);
    this.sentry.update(dt);
    this.drones.update(dt);
    this.finisher.update(dt);
    this.killcam.update(dt);
    // SURVIVOR: quase morto e voltou a 100 % (a regeneração não emite evento)
    this.hpT = (this.hpT || 0) - dt;
    if (this.hpT <= 0 && ctx.player.alive) {
      this.hpT = 0.25;
      for (const id of this.medals.damage({ health: ctx.player.health, maxHealth: ctx.player.maxHealth })) this.award(id);
    }
  },

  frame(dt, ctx) {
    this.uav.frame(dt);
    this.air.frame(dt);
    this.sentry.frame(dt);
    this.drones.frame(dt);
    // câmeras próprias (depois do syncCamera do núcleo, antes do render)
    this.finisher.frame(dt);
    this.killcam.frame(dt);
    this.photo.frame(dt);
    this.drawBar();
    const showRadar = this.uav.state.active && !ctx.services.hud?.handlesReveal && !this.busy;
    this.radar.visible = showRadar;
    if (showRadar) this.radar.draw(ctx, this.uav.state, this.uav.revealed);
  },

  dispose() {
    this.reset();
    this.root?.remove();
    window.removeEventListener('keydown', this.photo.onKeyDown, true);
    window.removeEventListener('keyup', this.photo.onKeyUp, true);
  },
};
